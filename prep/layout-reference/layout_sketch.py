"""THROWAWAY REFERENCE — not project code, not the submission.

A three-pane `rich` layout driven entirely by a hardcoded list of fake events.
There is no x402 code here, no xrpl-py, no network, no wallet, no imports beyond
the standard library and `rich`. Nothing in this file can be submitted and nothing
in it needs to be: it exists so that on Saturday the layout is a solved problem
and the only thing being built is the payment loop.

Read it, learn the four moves it demonstrates, then write the real one from scratch:

  1. Layout tree       — header / three-column body / footer, and how to size them
  2. Pane as a deque   — append, cap, render newest at the bottom
  3. The event seam    — one `emit()` feeding BOTH the display and events.jsonl
  4. Projector hygiene — the palette, the widths, the clickable hash

Run it:
    py layout_sketch.py            # replay the fake demo, ~25s, this is the one to watch
    py layout_sketch.py --once     # one static frame, for a screenshot or a non-TTY
    py layout_sketch.py --fast     # replay with no delays
    py layout_sketch.py --ascii    # ASCII glyphs, if a terminal mangles the box chars

Requires: rich (14.x verified). Nothing else.
"""

from __future__ import annotations

import json
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from rich.align import Align
from rich.console import Console, Group
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

# ─────────────────────────────────────────────────────────────────────────────
# 4. PROJECTOR HYGIENE — decide the palette once, here, and never inline a colour
# ─────────────────────────────────────────────────────────────────────────────
# Projectors crush blue and wash out anything dim. Every colour below is a bright
# ANSI colour on a dark background, which survives a bad projector and a bad camera.
# The rule: if you would not notice it from the back of the room, it is not a colour,
# it is decoration. Delete it.

AGENT = "bright_cyan"       # what the agent is thinking
ALLOW = "bright_green"      # policy said yes
BLOCK = "bright_red"        # policy said no — the most important colour in the demo
HOLD = "bright_yellow"      # waiting on a human
LEDGER = "bright_white"     # facts that are on-chain
MUTED = "white"             # NOT "dim" — dim is invisible on a projector

PANE_LINES = 14             # tune to your font size: fewer lines, bigger font
LOG_PATH = Path(__file__).with_name("events.jsonl")


# ── A trap found by running this, not by reading about it ─────────────────────
# On Windows, stdout defaults to cp1252 when it is not a real console (piped, or
# captured by a recorder). Any glyph outside Latin-1 then raises UnicodeEncodeError
# *mid-render* — the panel is half-drawn and the traceback is 20 lines of rich
# internals that say nothing about the actual cause. Verified here: U+23F8 ⏸ killed it.
#
# This matters on the day because you will pipe or record this at some point.
# Force UTF-8, and if that fails, fall back to ASCII rather than crashing.
def _force_utf8() -> bool:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        return True
    except Exception:
        return False


UNICODE_OK = _force_utf8() and "--ascii" not in sys.argv

GLYPHS = (
    {"think": "·", "allow": "✓", "block": "✗", "hold": "⏸", "tx": "⛓", "info": " "}
    if UNICODE_OK
    else {"think": ".", "allow": "+", "block": "x", "hold": "!", "tx": "#", "info": " "}
)
METER_FULL, METER_EMPTY = ("█", "░") if UNICODE_OK else ("#", "-")


# ─────────────────────────────────────────────────────────────────────────────
# 2. PANE AS A DEQUE — the whole state of the UI is three bounded lists
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class Pane:
    title: str
    border: str
    lines: deque[Text] = field(default_factory=lambda: deque(maxlen=PANE_LINES))

    def push(self, text: Text) -> None:
        self.lines.append(text)

    def render(self) -> Panel:
        # Bottom-anchored, like tailing a log: the newest line is always on the same
        # row, so a judge's eye has one place to look. Padding to PANE_LINES keeps
        # the first few events from jittering upward as the pane fills.
        #
        # The `vertical="bottom"` is the whole trick. Without it the lines sit at the
        # top of a tall pane with dead space underneath, and every new event moves
        # the thing the audience is reading. That reads as a bug even when it isn't.
        body = [Text("")] * max(0, PANE_LINES - len(self.lines)) + list(self.lines)
        return Panel(
            Align(Group(*body), vertical="bottom"),
            title=f"[bold]{self.title}[/]",
            border_style=self.border,
            padding=(0, 1),
        )


@dataclass
class Scene:
    """Everything on screen. Deliberately dumb: no logic, just state the emitter sets."""

    agent: Pane = field(default_factory=lambda: Pane("AGENT", AGENT))
    policy: Pane = field(default_factory=lambda: Pane("POLICY", HOLD))
    ledger: Pane = field(default_factory=lambda: Pane("LEDGER", LEDGER))

    beat: str = "waiting"
    spent_drops: int = 0
    ceiling_drops: int = 5_000_000
    blocked: int = 0
    network: str = "xrpl:1 (testnet)"
    audit: list[tuple[str, str, str]] = field(default_factory=list)


def hyperlink(label: str, url: str) -> Text:
    """OSC 8 — a real clickable link in Windows Terminal, plain text everywhere else.

    This is the one place a browser would have beaten a terminal, and it does not.
    Beat 5 asks you to click a hash and land on the explorer; this does that.
    """
    return Text(label, style=f"{LEDGER} link {url}")


# ─────────────────────────────────────────────────────────────────────────────
# 1. LAYOUT TREE — build it once, mutate the panes, never rebuild
# ─────────────────────────────────────────────────────────────────────────────
def build_layout(scene: Scene) -> Layout:
    root = Layout()
    root.split_column(
        Layout(name="header", size=3),
        Layout(name="body", ratio=1),
        Layout(name="footer", size=5),
    )
    # Equal ratios, NOT fixed widths — you do not know the venue's terminal width.
    root["body"].split_row(
        Layout(name="agent", ratio=1),
        Layout(name="policy", ratio=1),
        Layout(name="ledger", ratio=1),
    )
    return root


def header(scene: Scene) -> Panel:
    left = Text("AGENT PAYMENTS · x402 on the XRP Ledger", style=f"bold {LEDGER}")
    right = Text(f"{scene.network}   {datetime.now().strftime('%H:%M:%S')}", style=MUTED)
    bar = Table.grid(expand=True)
    bar.add_column(justify="left")
    bar.add_column(justify="right")
    bar.add_row(left, right)
    return Panel(bar, border_style=MUTED, padding=(0, 1))


def footer(scene: Scene) -> Panel:
    """The footer is the scoreboard. It is what a judge reads if they read one thing."""
    spent = scene.spent_drops / 1_000_000
    ceiling = scene.ceiling_drops / 1_000_000
    pct = (scene.spent_drops / scene.ceiling_drops) if scene.ceiling_drops else 0

    # A bar is worth more than a number here: "nowhere near the ceiling" reads instantly.
    width = 28
    filled = max(0, min(width, round(pct * width)))
    meter = Text()
    meter.append(METER_FULL * filled, style=ALLOW)
    meter.append(METER_EMPTY * (width - filled), style=MUTED)

    grid = Table.grid(expand=True, padding=(0, 2))
    grid.add_column(justify="left")
    grid.add_column(justify="center")
    grid.add_column(justify="right")
    grid.add_row(
        Text.assemble(("BEAT  ", MUTED), (scene.beat, f"bold {HOLD}")),
        Text.assemble(
            ("spent ", MUTED),
            (f"{spent:.6f}", f"bold {ALLOW}"),
            (f" / {ceiling:.2f} XRP  ", MUTED),
        ),
        Text.assemble(("blocked ", MUTED), (str(scene.blocked), f"bold {BLOCK}")),
    )
    return Panel(Group(grid, Align.center(meter)), border_style=MUTED, padding=(0, 1))


def compose(scene: Scene) -> Layout:
    root = build_layout(scene)
    root["header"].update(header(scene))
    root["agent"].update(scene.agent.render())
    root["policy"].update(scene.policy.render())
    root["ledger"].update(scene.ledger.render())
    root["footer"].update(footer(scene))
    return root


# ─────────────────────────────────────────────────────────────────────────────
# 3. THE EVENT SEAM — one function feeds the display AND the log
# ─────────────────────────────────────────────────────────────────────────────
# This is the decision worth copying. Every visible thing goes through emit(), which
# appends to events.jsonl as it draws. Three consequences:
#   · beat 5's audit table is a file read, not a feature you build
#   · a front-end teammate can render the same log without touching payment code
#   · if the UI dies on stage you still have the log, and can read it aloud
class Emitter:
    def __init__(self, scene: Scene, log_path: Path | None = LOG_PATH) -> None:
        self.scene = scene
        self.log = log_path.open("w", encoding="utf-8") if log_path else None

    def __call__(self, pane: str, kind: str, message: str, **fields) -> None:
        record = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "beat": self.scene.beat,
            "pane": pane,
            "kind": kind,
            "message": message,
            **fields,
        }
        if self.log:
            self.log.write(json.dumps(record) + "\n")
            self.log.flush()  # flush every line: a crash must not lose the audit trail

        style = {
            "think": AGENT,
            "allow": ALLOW,
            "block": BLOCK,
            "hold": HOLD,
            "tx": LEDGER,
            "info": MUTED,
        }.get(kind, MUTED)

        glyph = GLYPHS.get(kind, " ")

        # One line per event, never wrapped. A wrapped line pushes everything above it
        # up by a row mid-demo, which reads as a glitch even when it isn't.
        #
        # Let rich clip it at the real render width — `no_wrap` + `overflow="ellipsis"`.
        # Do NOT hand-tune a character budget: the pane width depends on the terminal,
        # the font and whether the venue's projector forces a resolution on you, and a
        # magic number tuned on your laptop is wrong in the room. Keep messages short
        # anyway, so the ellipsis never has to save you.
        target = getattr(self.scene, pane)
        target.push(
            Text.assemble(
                (f"{glyph} ", style), (message, style), no_wrap=True, overflow="ellipsis"
            )
        )

        # The hash goes on its own line rather than appended, so clipping the message
        # can never eat the one thing in beat 5 that has to stay clickable.
        if url := fields.get("url"):
            link = Text("  ", style=MUTED)
            link.append_text(hyperlink(fields.get("hash", "explorer"), url))
            link.no_wrap = True
            target.push(link)

    def close(self) -> None:
        if self.log:
            self.log.close()


# ─────────────────────────────────────────────────────────────────────────────
# The fake demo. Every number here is invented. Replace with real events on Saturday.
# ─────────────────────────────────────────────────────────────────────────────
EXPLORER = "https://testnet.xrpl.org/transactions/"
FAKE_HASH = "A1B2C3D4E5F60718293A4B5C6D7E8F901234567890ABCDEF1234567890ABCDEF"


def script(scene: Scene, emit: Emitter):
    """Yields (delay_seconds, callable). Mirrors the five beats in PITCH.md."""

    def beat(name):
        def go():
            scene.beat = name
        return go

    yield 0.0, beat("1 · delegation")
    yield 0.6, lambda: emit("agent", "info", "owner grants authority")
    yield 0.8, lambda: emit("policy", "hold", "awaiting owner signature")
    yield 1.4, lambda: emit("policy", "allow", "L2 delegation signed")
    yield 0.3, lambda: emit("policy", "info", "agent: rAGENT…bH2vz")
    yield 0.2, lambda: emit("policy", "info", "ceiling: 5.000000 XRP")
    yield 0.2, lambda: emit("policy", "info", "assets: XRP · valid 1h")
    yield 0.6, lambda: emit("ledger", "info", "nothing submitted — this is the grant")

    yield 1.2, beat("2 · unattended")
    yield 0.4, lambda: emit("agent", "think", "I need 7-day volatility")
    yield 0.7, lambda: emit("agent", "think", "GET /market-data → 402")
    yield 0.6, lambda: emit("policy", "info", "quoted 1000 drops")
    yield 0.5, lambda: emit("policy", "allow", "under ceiling · known payee")
    yield 0.5, lambda: emit("agent", "think", "signing payment")
    yield 0.9, lambda: emit(
        "ledger", "tx", "Payment 1000 drops · fee 12",
        url=EXPLORER + FAKE_HASH, hash=FAKE_HASH[:8] + "…",
    )
    yield 0.2, _spend(scene, 1000)
    yield 0.4, lambda: emit("ledger", "info", "validated in 3.8s")
    yield 0.5, lambda: emit("agent", "think", "got the data, continuing")

    yield 1.2, beat("3 · metered  (CUT THIS FIRST)")
    yield 0.4, lambda: emit("agent", "think", "inference priced upto 0.5 XRP")
    yield 0.6, lambda: emit("policy", "allow", "authorising Check · SendMax 0.5")
    yield 0.9, lambda: emit("ledger", "tx", "CheckCreate · ceiling 500000 drops")
    yield 0.8, lambda: emit("agent", "think", "handler used 1,840 tokens")
    yield 0.6, lambda: emit("policy", "info", "metered → 184000 drops")
    yield 0.8, lambda: emit("ledger", "tx", "CheckCash 184000 — not 500000")
    yield 0.2, _spend(scene, 184_000)
    yield 0.5, lambda: emit("ledger", "info", "ledger would refuse above SendMax")

    yield 1.4, beat("4 · THE VETO")
    yield 0.4, lambda: emit("agent", "think", "bulk feed quoted 12.0 XRP")
    yield 0.8, lambda: emit("policy", "block", "12.0 XRP > ceiling 5.0")
    yield 0.4, lambda: emit("policy", "hold", "requires_confirmation")
    yield 0.4, lambda: emit("agent", "think", "waiting — not cancelled")
    yield 2.0, lambda: emit("policy", "block", "owner DECLINED")
    yield 0.5, _blocked(scene)
    yield 0.4, lambda: emit("ledger", "info", "nothing submitted · nothing to reverse")
    yield 1.2, lambda: emit("agent", "think", "retrying at 0.8 XRP")
    yield 0.6, lambda: emit("policy", "allow", "under ceiling · approved")
    yield 0.9, lambda: emit("ledger", "tx", "Payment 800000 drops")
    yield 0.2, _spend(scene, 800_000)

    yield 1.2, beat("5 · audit")
    yield 0.5, lambda: emit("agent", "info", "4 decisions · 3 settled · 1 declined")
    yield 0.5, lambda: emit("ledger", "info", "every hash is public — read events.jsonl")


def _spend(scene: Scene, drops: int):
    def go():
        scene.spent_drops += drops
    return go


def _blocked(scene: Scene):
    def go():
        scene.blocked += 1
    return go


def main() -> int:
    args = set(sys.argv[1:])
    console = Console()

    if console.width < 100:
        console.print(
            Panel(
                Text(
                    f"Terminal is {console.width} columns. Three panes need ~100+.\n"
                    "On the day: full-screen the terminal, then set the font size so this "
                    "message stops appearing. That font size is your demo font size.",
                    style=f"bold {HOLD}",
                ),
                border_style=HOLD,
            )
        )

    scene = Scene()
    emit = Emitter(scene)

    if "--once" in args:
        # One static frame: fill the panes without sleeping, print, exit.
        for _, step in script(scene, emit):
            step()
        console.print(compose(scene))
        emit.close()
        return 0

    fast = "--fast" in args
    try:
        with Live(compose(scene), console=console, refresh_per_second=8, screen=True) as live:
            for delay, step in script(scene, emit):
                if not fast:
                    time.sleep(delay)
                step()
                live.update(compose(scene))
            if not fast:
                time.sleep(3)
    finally:
        emit.close()

    console.print(f"\nwrote {LOG_PATH.name} — that file is beat 5.\n", style=MUTED)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

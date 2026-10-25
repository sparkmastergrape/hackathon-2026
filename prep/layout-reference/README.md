# Layout reference — THROWAWAY, not the submission

⚠️ **This is not project code and cannot become project code.** `layout_sketch.py` contains
no x402, no `xrpl-py`, no wallet, no network call. It is a UI skeleton driven by a hardcoded
list of fake events, written so that on Saturday the layout is a solved problem and the only
thing being built is the payment loop. Write the real one from scratch; take the four moves,
not the file.

Judging rule in force: *"Only what you build during the hackathon counts toward judging."*

## Run it

```bash
py layout_sketch.py            # replay the fake demo, ~25s — this is the one to watch
py layout_sketch.py --once     # one static frame, for a screenshot or a non-TTY
py layout_sketch.py --fast     # replay with no delays
py layout_sketch.py --ascii    # ASCII glyphs, if a terminal mangles the box characters
```

Verified 22 Oct under **rich 14.3.3** (system Python 3.14.3) and **rich 15.0.0** (installed
from `prep/offline-cache`, which is what Saturday's offline install gives you). Identical
output on both. `--once`, `--fast` and `--ascii` all exit 0.

## The four moves worth copying

1. **Layout tree.** `split_column(header=3, body=ratio 1, footer=5)`, then
   `body.split_row(agent, policy, ledger)` at equal ratios. **Ratios, not fixed widths** —
   you do not know the venue's terminal size. Build the tree once and mutate the panes.
2. **A pane is a bounded deque.** The entire UI state is three capped lists plus a few
   counters. Render newest-at-the-bottom with `Align(..., vertical="bottom")` so the line the
   audience is reading never moves.
3. **One event seam.** Everything visible goes through `emit()`, which writes
   `events.jsonl` as it draws. That gives you three things for free: beat 5's audit table is
   a file read rather than a feature; a front-end teammate can render the same log without
   touching payment code; and if the display dies on stage you still have the log and can
   read it aloud.
4. **Projector hygiene.** Bright ANSI colours on dark, never `dim` and never blue —
   projectors crush blue and wash out anything dim. One palette at the top of the file, no
   inline colours. The footer is the scoreboard: spent-vs-ceiling with a bar, because
   *"nowhere near the ceiling"* reads instantly and a number does not.

## Three traps found by running it

These cost minutes here. They would have cost an hour on Saturday.

1. **Windows `cp1252` stdout kills the glyphs.** When stdout is not a real console — piped,
   or captured by a recorder — it defaults to cp1252 and any non-Latin-1 glyph raises
   `UnicodeEncodeError` **mid-render**, leaving a half-drawn panel under twenty lines of
   `rich` internals that never mention encoding. `⏸` (U+23F8) is what triggered it.
   Fix: `sys.stdout.reconfigure(encoding="utf-8")` at startup, with an ASCII glyph set as
   the fallback. You will pipe or record this at some point.
2. **Lines float at the top of a tall pane without `vertical="bottom"`.** Padding to a line
   count only sets a minimum; the pane still stretches to the terminal height, so content
   sits at the top with dead space beneath and every new event shifts it upward.
3. **Do not hand-tune a character budget.** A magic number measured on your laptop is wrong
   in the room. `no_wrap=True` plus `overflow="ellipsis"` lets `rich` clip at the real render
   width. Keep messages short anyway so the ellipsis never has to save you — and push the
   transaction hash as its **own** line, so clipping a message can never eat the one thing in
   beat 5 that has to stay clickable.

## The clickable hash

Beat 5 asks you to click a hash and land on the explorer. An OSC 8 hyperlink
(`style="link <url>"`) does that in Windows Terminal and degrades to plain text elsewhere.
This was the one place a web UI would have beaten a terminal, and it doesn't.

## `events.jsonl`

Committed here as an example of the shape, from a replay: 33 events, 2 of them `block`. One
JSON object per line, flushed on every write so a crash cannot lose the audit trail. Fields:
`ts`, `beat`, `pane`, `kind`, `message`, plus `url` / `hash` on ledger events.

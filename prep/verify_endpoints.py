"""Environment check, not project code: do my endpoints actually work?

Reads endpoints from prep/.env (gitignored) and proves each one end to end. Run it the
moment you paste a Quicknode URL in, and again at the venue before you trust the wifi.

    py prep/verify_endpoints.py

Checks, each independently skippable if the env var is absent:
  XRPL_RPC_URL        XRPL JSON-RPC over HTTP  - server_info + a ledger fetch
  XRPL_WSS_URL        XRPL WebSocket           - connect, subscribe, receive one message
  XRPL_EVM_RPC_URL    XRPL EVM sidechain       - eth_chainId, expects 1440000

Nothing here signs anything or spends anything. Read-only.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ENV = Path(__file__).with_name(".env")
# XRPL EVM sidechain chain IDs. Ledger's prize page cites 1440000, which is MAINNET.
# Verified 23 Oct: https://rpc.testnet.xrplevm.org returns 1449000. For a hackathon you
# want the testnet one, so accept either and say which you got — this script caught the
# distinction that reading the prize page alone would have hidden.
EVM_CHAIN_IDS = {1440000: "XRPL EVM mainnet", 1449000: "XRPL EVM testnet"}

OK, BAD, SKIP = "  OK  ", " FAIL ", " skip "


def load_env() -> None:
    if not ENV.exists():
        return
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def report(tag: str, name: str, detail: str = "") -> None:
    print(f"[{tag}] {name}" + (f"  -- {detail}" if detail else ""))


def check_http(url: str) -> bool:
    import requests

    t0 = time.time()
    r = requests.post(url, json={"method": "server_info", "params": [{}]}, timeout=15)
    r.raise_for_status()
    info = r.json()["result"]["info"]
    ms = (time.time() - t0) * 1000

    # A node that answers but is not synced is worse than one that refuses. But HOW you
    # check that depends on what is answering:
    #
    #   rippled  - reports `server_state` ("full"/"proposing"/"validating")
    #   Clio     - does NOT. Clio is a read-optimised API server in front of rippled, and
    #              it reports `clio_version` + `complete_ledgers` instead.
    #
    # Quicknode serves XRPL through Clio (verified 23 Oct), so a `server_state` check
    # fails against a perfectly healthy endpoint. Detect which one we are talking to.
    ledger = info.get("validated_ledger", {}).get("seq", "?")
    net = info.get("network_id", "?")
    clio = info.get("clio_version")
    state = info.get("server_state") or (f"clio {clio}" if clio else "?")
    # ASCII separators on purpose: this prints to whatever shell you have at the venue,
    # and a cp1252 stdout turns a "·" into a mojibake "?" (or raises). Diagnostics must
    # never be the thing that breaks. Hit this exact problem in layout_sketch.py too.
    report(OK, "XRPL HTTP", f"{state} | ledger {ledger} | network_id {net} | {ms:.0f}ms")

    if clio:
        # Clio has no server_state, so health = "it has a complete, current ledger range".
        rng = info.get("complete_ledgers", "")
        if not rng or ledger == "?":
            report(BAD, "XRPL HTTP (clio)", f"no usable ledger range: {rng!r}")
            return False
        report(OK, "XRPL HTTP (clio)", f"complete_ledgers {rng}")
        return True

    if state not in ("full", "proposing", "validating"):
        report(BAD, "XRPL HTTP state", f"server_state={state} - not usable for submits")
        return False
    return True


def check_wss(url: str) -> bool:
    # The WebSocket is the point of using Quicknode rather than polling: you subscribe
    # to the merchant account and learn about settlement the moment it validates.
    from websockets.sync.client import connect

    with connect(url, open_timeout=15) as ws:
        ws.send(json.dumps({"id": 1, "command": "subscribe", "streams": ["ledger"]}))
        first = json.loads(ws.recv(timeout=15))
        if first.get("status") != "success":
            report(BAD, "XRPL WSS subscribe", json.dumps(first)[:160])
            return False
        report(OK, "XRPL WSS subscribe", "ledger stream accepted")

        # Proving a message actually arrives is the whole check. A connection that
        # opens and then never pushes is the failure mode you would discover on stage.
        t0 = time.time()
        msg = json.loads(ws.recv(timeout=20))
        report(
            OK,
            "XRPL WSS push",
            f"{msg.get('type','?')} ledger {msg.get('ledger_index','?')} "
            f"after {time.time()-t0:.1f}s",
        )
    return True


def check_evm(url: str) -> bool:
    import requests

    r = requests.post(
        url,
        json={"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []},
        timeout=15,
    )
    r.raise_for_status()
    got = int(r.json()["result"], 16)
    if got not in EVM_CHAIN_IDS:
        known = ", ".join(f"{k} ({v})" for k, v in EVM_CHAIN_IDS.items())
        report(BAD, "EVM chainId", f"got {got}, expected one of: {known}")
        return False
    report(OK, "EVM chainId", f"{got} - {EVM_CHAIN_IDS[got]}")
    return True


CHECKS = (
    ("XRPL_RPC_URL", "XRPL JSON-RPC (HTTP)", check_http),
    ("XRPL_WSS_URL", "XRPL WebSocket", check_wss),
    ("XRPL_EVM_RPC_URL", "XRPL EVM sidechain", check_evm),
)


def main() -> int:
    load_env()
    print(f"env: {ENV if ENV.exists() else '(no prep/.env - using process env)'}\n")

    failed, ran = [], 0
    for var, label, fn in CHECKS:
        url = os.environ.get(var)
        if not url:
            report(SKIP, label, f"{var} not set")
            continue
        ran += 1
        try:
            if not fn(url):
                failed.append(label)
        except Exception as exc:  # noqa: BLE001 - a check failing IS the result
            report(BAD, label, f"{type(exc).__name__}: {exc}"[:200])
            failed.append(label)

    print()
    if not ran:
        print("Nothing to check. Put your endpoints in prep/.env first:")
        print("  XRPL_RPC_URL=https://...quiknode.pro/.../")
        print("  XRPL_WSS_URL=wss://...quiknode.pro/.../")
        print("  XRPL_EVM_RPC_URL=https://...  (only if you go after Mastercard's prize)")
        return 2
    if failed:
        print(f"{len(failed)} FAILED: {', '.join(failed)}")
        return 1
    print(f"all {ran} endpoint check(s) passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

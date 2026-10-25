"""Environment tool, not project code: mint and fund XRPL testnet accounts, safely.

Why this exists: Quicknode's multi-chain faucet does NOT cover XRPL (verified 23 Oct -
it lists EVM chains and Solana only), so the official Ripple faucet is the single source
of testnet XRP, and it rate-limits hard. A 429 at 11:00 on Saturday with no funded spare
accounts is a bad hour. Mint everything you might need the night before.

    py prep/fund_testnet.py --count 4
    py prep/fund_testnet.py --count 2 --network devnet   # separate faucet, separate limits
    py prep/fund_testnet.py --check                      # balances only, mints nothing

Secrets go straight to prep/wallets.json and are NEVER printed. The console shows
addresses and balances only, so this is safe to run while screen-sharing.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

OUT = Path(__file__).with_name("wallets.json")

NETWORKS = {
    "testnet": {
        "faucet": "https://faucet.altnet.rippletest.net/accounts",
        "rpc": "https://s.altnet.rippletest.net:51234/",
    },
    # A completely separate faucet with its own quota. If testnet 429s and you just need
    # *a* funded account to keep building, devnet will usually still answer.
    "devnet": {
        "faucet": "https://faucet.devnet.rippletest.net/accounts",
        "rpc": "https://s.devnet.rippletest.net:51234/",
    },
}

# The faucet is strict and the failure is not always a clean 429 - sometimes it is a 503
# or an empty body. Treat anything non-200 as "back off", not "retry immediately".
COOLDOWN_S = 12


def load() -> dict:
    if OUT.exists():
        return json.loads(OUT.read_text(encoding="utf-8"))
    return {"accounts": []}


def save(data: dict) -> None:
    OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")


def balance_drops(rpc: str, address: str) -> int | None:
    r = requests.post(
        rpc,
        json={"method": "account_info", "params": [{"account": address, "ledger_index": "validated"}]},
        timeout=15,
    )
    result = r.json().get("result", {})
    if result.get("status") == "error":
        return None  # actNotFound = exists in our file but never funded
    return int(result["account_data"]["Balance"])


def mint(network: str, count: int) -> int:
    cfg = NETWORKS[network]
    data = load()
    minted = 0

    for i in range(count):
        if i:
            time.sleep(COOLDOWN_S)
        try:
            r = requests.post(cfg["faucet"], json={}, timeout=40)
        except Exception as exc:  # noqa: BLE001
            print(f"  [{i+1}/{count}] faucet unreachable: {type(exc).__name__}")
            break

        if r.status_code != 200:
            # Do not hammer it. One clear message beats a retry loop that burns the quota.
            print(f"  [{i+1}/{count}] faucet said HTTP {r.status_code} - stopping.")
            print(f"      Wait ~60s and run again, or use --network devnet.")
            break

        acct = r.json().get("account", {})
        address = acct.get("classicAddress") or acct.get("address")
        seed = acct.get("seed") or r.json().get("seed")
        if not address or not seed:
            print(f"  [{i+1}/{count}] unexpected faucet response shape - stopping.")
            break

        data["accounts"].append(
            {
                "network": network,
                "address": address,
                "seed": seed,  # written to disk, never printed
                "minted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
        )
        save(data)  # save after EVERY mint: a crash must not lose a funded seed
        minted += 1
        print(f"  [{i+1}/{count}] {address}")

    return minted


def check() -> None:
    data = load()
    if not data["accounts"]:
        print("no accounts in prep/wallets.json yet")
        return
    for a in data["accounts"]:
        rpc = NETWORKS[a["network"]]["rpc"]
        try:
            bal = balance_drops(rpc, a["address"])
        except Exception as exc:  # noqa: BLE001
            print(f"  {a['address']}  {a['network']:8}  lookup failed: {type(exc).__name__}")
            continue
        shown = "NOT FUNDED" if bal is None else f"{bal/1_000_000:>12,.6f} XRP"
        print(f"  {a['address']}  {a['network']:8}  {shown}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--count", type=int, default=0, help="how many new accounts to mint")
    p.add_argument("--network", choices=sorted(NETWORKS), default="testnet")
    p.add_argument("--check", action="store_true", help="report balances, mint nothing")
    args = p.parse_args()

    if args.check or not args.count:
        print("balances:")
        check()
        if not args.count:
            print("\n(pass --count N to mint more)")
        return 0

    print(f"minting {args.count} on {args.network}, {COOLDOWN_S}s apart:")
    n = mint(args.network, args.count)
    print(f"\nminted {n}/{args.count}. secrets in {OUT.name} (never printed above)\n")

    # The faucet returns the account as soon as it has SUBMITTED the funding payment,
    # not once it has validated. Checking immediately reports "NOT FUNDED" for the most
    # recent account and looks like a failure when nothing is wrong. Verified 23 Oct:
    # the same account read 100 XRP a few seconds later. Wait before reporting.
    print("waiting 6s for the funding payments to validate...")
    time.sleep(6)
    print("balances:")
    check()
    return 0 if n == args.count else 1


if __name__ == "__main__":
    raise SystemExit(main())

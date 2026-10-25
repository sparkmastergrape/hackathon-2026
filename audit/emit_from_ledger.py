"""Emit an agent-audit/1 event file by reading the public XRP Ledger.

Standard library only, so it runs without the demo's virtualenv:

    py audit/emit_from_ledger.py

Nothing here is reported to us by the agent. Every event below is built from
`account_tx` on a public testnet node, which anyone can query, and every
on-ledger event carries the transaction hash that produced it.

Two kinds of event come out of this, and they are marked differently on
purpose:

  settle           evidence "measured" — the ledger says the payment settled,
                   and the hash proves it.
  device_decision  evidence "inferred" — the signing key lives on the device
                   and never leaves it, so a valid signature implies someone
                   pressed the button. That is sound reasoning, not an
                   observation. The pane renders it greyed with the word
                   shown.

A refusal leaves no trace on a ledger, by definition, so no refusal is
emitted here. `audit/device-run.json`, written by a device proof run, is where
those belong. The pane merges it when it exists and says so when it does not.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

RPC = os.environ.get("XRPL_RPC", "https://s.altnet.rippletest.net:51234/")
NETWORK = "xrpl:1"
EXPLORER = "https://testnet.xrpl.org/transactions/"

# The wallets this run reads. Both are testnet accounts created for the demo.
DEVICE_ACCOUNT = "ra7Zr8ddy9tB88RaXL8B87YkqhEJG2vkAJ"
AGENT_ACCOUNT = "rf92bZ3SUF4JjcfpknzNC7crVtjHLbH2vz"

# XRPL counts seconds from 2000-01-01, not from the Unix epoch.
RIPPLE_EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "events.json")


def rpc(method, params):
    body = json.dumps({"method": method, "params": [params]}).encode()
    req = urllib.request.Request(
        RPC, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def ts_from_ripple(seconds):
    return (RIPPLE_EPOCH + timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")


def short(value, head=8, tail=4):
    return value if len(value) <= head + tail + 1 else f"{value[:head]}…{value[-tail:]}"


def account_payments(account):
    """Outbound Payments from `account` that succeeded, oldest first."""
    out = []
    marker = None
    while True:
        params = {"account": account, "limit": 200, "ledger_index_min": -1,
                  "ledger_index_max": -1}
        if marker:
            params["marker"] = marker
        res = rpc("account_tx", params).get("result", {})
        if res.get("status") == "error":
            raise SystemExit(f"node refused: {res.get('error_message', res)}")
        for row in res.get("transactions", []):
            tx = row.get("tx") or row.get("tx_json") or {}
            meta = row.get("meta") or {}
            if tx.get("TransactionType") != "Payment":
                continue
            if tx.get("Account") != account:
                continue
            if meta.get("TransactionResult") != "tesSUCCESS":
                continue
            if tx.get("Destination") == account:
                continue
            out.append((row, tx, meta))
        marker = res.get("marker")
        if not marker:
            break
    out.sort(key=lambda r: tx_date(r[0], r[1]))
    return out


def tx_date(row, tx):
    """Ripple-epoch seconds. rippled puts `date` and `hash` on the inner
    transaction, not on the envelope row — reading the row gives 0, which
    silently dates every event to 2000-01-01 and still passes validation."""
    for value in (tx.get("date"), row.get("date"), row.get("close_time")):
        if isinstance(value, int):
            return value
    return 0


def drops_of(amount):
    """Only XRP is counted here; an issued-currency Amount is an object."""
    return amount if isinstance(amount, str) else None


def build():
    events = []
    counted = 0
    skipped_iou = 0

    for account, who in ((DEVICE_ACCOUNT, "device"), (AGENT_ACCOUNT, "software")):
        for row, tx, _meta in account_payments(account):
            drops = drops_of(tx.get("Amount"))
            if drops is None:
                skipped_iou += 1
                continue

            when = ts_from_ripple(tx_date(row, tx))
            tx_hash = tx.get("hash") or row.get("hash", "")
            destination = tx.get("Destination", "")
            invoice = tx.get("InvoiceID")
            counted += 1

            if who == "device":
                events.append({
                    "ts": when,
                    "stage": "device_decision",
                    "actor": "owner",
                    "outcome": "ok",
                    "evidence": "inferred",
                    "summary": "a signature from the bound device implies the owner pressed approve",
                    "amount": drops,
                    "unit": "drops",
                    "asset": "XRP",
                    "tx_hash": tx_hash,
                    "detail": {
                        "basis": "the signing key never leaves the device, so a valid "
                                 "signature cannot be produced without a press",
                        "not_observed": "this run did not watch the screen; "
                                        "audit/device-run.json holds observed presses",
                    },
                })

            settle = {
                "ts": when,
                "stage": "settle",
                "actor": "ledger",
                "outcome": "ok",
                "evidence": "measured",
                "summary": f"payment settled to {short(destination, 10, 4)}",
                "amount": drops,
                "unit": "drops",
                "asset": "XRP",
                "tx_hash": tx_hash,
                "tx_result": "tesSUCCESS",
                "explorer_url": EXPLORER + tx_hash,
                "detail": {"destination": destination, "signer": who},
            }
            if invoice:
                settle["invoice_id"] = invoice
            events.append(settle)

    events.sort(key=lambda e: (e["ts"], e["stage"]))

    doc = {
        "schema": "agent-audit/1",
        "run_id": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") + "/ledger",
        "network": NETWORK,
        "events": events,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")

    print(f"read {RPC}")
    print(f"counted {counted} outbound XRP payments, wrote {len(events)} events")
    if skipped_iou:
        print(f"skipped {skipped_iou} issued-currency payments (no drops amount)")
    print(f"-> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(build())

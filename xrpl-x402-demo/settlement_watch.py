"""Wait for a settlement to validate, over a WebSocket, instead of polling.

The polling version asked `account_tx` six times, four seconds apart. On
average it learned about a settled payment two seconds after the ledger had
already closed, and on a slow ledger it gave up while the payment was fine.
It also made twenty-four requests to answer one question.

This subscribes to the paying account and is told. One message, when the
ledger validates it.

    py xrpl-x402-demo/settlement_watch.py --self-test

Configure the endpoint with `XRPL_WSS_URL`, in the environment or in a `.env`
this project already uses. A QuickNode URL carries its token in the path, so
it is a credential: nothing here prints it or writes it to a file, and the
provider name is reported instead.

## The race this gets right

A payment can validate between submitting it and opening the socket. Watch
first and you miss nothing; check history first and you can lose the window
between the check and the subscription. So the order here is:

    1. open the socket and subscribe
    2. only then read `account_tx` for a payment that already landed
    3. if it has not, wait for the push

Step 2 after step 1 is the whole point. Reversed, this is a slower poller
with a race in it.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any

PUBLIC_WSS = "wss://s.altnet.rippletest.net:51233"


def load_env() -> None:
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for name in (".env", os.path.join("prep", ".env")):
        path = os.path.join(here, name)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def endpoint() -> tuple[str, str]:
    """(url, provider). The url is a credential; only the provider is printable."""
    load_env()
    url = (os.environ.get("XRPL_WSS_URL") or "").strip()
    if url:
        return url, ("QuickNode" if "quiknode" in url.lower() else "configured node")
    return PUBLIC_WSS, "public testnet node (no XRPL_WSS_URL set)"


def _matches(tx: dict, meta: dict, *, destination: str, invoice: str) -> bool:
    return (
        tx.get("TransactionType") == "Payment"
        and tx.get("Destination") == destination
        and (tx.get("InvoiceID") or "").upper() == invoice
        and meta.get("TransactionResult") == "tesSUCCESS"
    )


async def _await_settlement(
    *,
    account: str,
    destination: str,
    invoice_id_field: str,
    timeout: float,
) -> dict[str, Any] | None:
    import websockets  # imported late so the module loads without it

    url, provider = endpoint()
    invoice = (invoice_id_field or "").upper()

    async with websockets.connect(url, open_timeout=15, close_timeout=5) as ws:
        # 1. watch first.
        await ws.send(json.dumps(
            {"id": "watch", "command": "subscribe", "accounts": [account]}
        ))

        # 2. then ask whether it already landed. A reply to our own command is
        #    interleaved with pushed transactions, so every read below has to
        #    tolerate either.
        await ws.send(json.dumps({
            "id": "history", "command": "account_tx", "account": account, "limit": 20,
        }))

        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout

        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                return None
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            except asyncio.TimeoutError:
                return None

            msg = json.loads(raw)

            # 3a. the historical answer
            if msg.get("id") == "history":
                for row in (msg.get("result") or {}).get("transactions", []) or []:
                    tx = row.get("tx_json") or row.get("tx") or {}
                    meta = row.get("meta") or {}
                    if _matches(tx, meta, destination=destination, invoice=invoice):
                        return {
                            "hash": tx.get("hash") or row.get("hash"),
                            "tx": tx,
                            "how": "already validated",
                            "provider": provider,
                        }
                continue

            # 3b. a pushed transaction
            if msg.get("type") == "transaction" and msg.get("validated"):
                tx = msg.get("tx_json") or msg.get("transaction") or {}
                meta = msg.get("meta") or msg.get("metaData") or {}
                if _matches(tx, meta, destination=destination, invoice=invoice):
                    return {
                        "hash": msg.get("hash") or tx.get("hash"),
                        "tx": tx,
                        "how": "pushed on validation",
                        "provider": provider,
                    }


def await_settlement(
    *,
    account: str,
    destination: str,
    invoice_id_field: str,
    timeout: float = 25.0,
) -> dict[str, Any] | None:
    """Blocking wrapper. Returns None if nothing matched inside `timeout`.

    None means "not seen", never "not paid". The caller falls back to polling,
    which is slower but needs no socket.
    """
    try:
        return asyncio.run(_await_settlement(
            account=account,
            destination=destination,
            invoice_id_field=invoice_id_field,
            timeout=timeout,
        ))
    except Exception as err:  # noqa: BLE001 — a dead socket is not a failed payment
        print(f"  websocket unavailable ({type(err).__name__}); falling back to polling")
        return None


# --------------------------------------------------------------------------
# self-test: prove the socket pushes, without needing a payment to be in flight
# --------------------------------------------------------------------------

async def _self_test() -> int:
    import websockets

    url, provider = endpoint()
    print(f"connecting to {provider}")

    async with websockets.connect(url, open_timeout=15, close_timeout=5) as ws:
        await ws.send(json.dumps(
            {"id": "t", "command": "subscribe", "streams": ["ledger"]}
        ))
        loop = asyncio.get_event_loop()
        deadline = loop.time() + 20

        got_ack = False
        while loop.time() < deadline:
            raw = await asyncio.wait_for(ws.recv(), timeout=deadline - loop.time())
            msg = json.loads(raw)
            if msg.get("id") == "t":
                got_ack = (msg.get("status") == "success")
                print(f"  subscribe acknowledged: {got_ack}")
                continue
            if msg.get("type") == "ledgerClosed":
                print(f"  pushed ledger {msg.get('ledger_index')} "
                      f"with {msg.get('txn_count')} transactions")
                print("ok: the socket pushes. Confirmation does not need polling.")
                return 0

    print("no ledger arrived inside 20s — the socket connected but pushed nothing")
    return 1


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        raise SystemExit(asyncio.run(_self_test()))
    print(__doc__)

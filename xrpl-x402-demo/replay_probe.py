"""What the LEDGER actually refuses, measured rather than assumed.

Four questions, because "the ledger refuses the replay" is three different
claims and only some of them are true:

  A. Re-submitting the SAME signed transaction        -> refused? how?
  B. A NEW transaction reusing the same InvoiceID     -> refused? how?
  C. Re-submitting the SAME signed CheckCash          -> refused? how?
  D. A NEW CheckCash against an already-cashed Check  -> refused? how?

A and C are sequence exhaustion. D is the Check being consumed. B is the one
worth caring about: if the ledger permits it, then "the ledger refuses the
replayed mandate" is false whenever the replay is an invoice reuse, and a demo
that claims otherwise is making the same kind of unfounded claim as crediting
the VI mandate with enforcing a ceiling.

Testnet only. Uses the demo wallets from .env.

    py replay_probe.py
"""

from __future__ import annotations

import os
import time

import requests
from dotenv import load_dotenv
from xrpl.clients import JsonRpcClient
from xrpl.core import binarycodec
from xrpl.models.transactions import CheckCash, CheckCreate, Payment
from xrpl.transaction import autofill, sign
from xrpl.wallet import Wallet

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, ".env"))

RPC = os.environ["XRPL_RPC_URL"]
client = JsonRpcClient(RPC)
agent = Wallet.from_seed(os.environ["XRPL_SEED"])
merchant = Wallet.from_seed(os.environ["XRPL_MERCHANT_SEED"])
PAY_TO = os.environ["XRPL_PAY_TO"]

INVOICE = "A1" * 32  # one fixed InvoiceID, deliberately reused below


def rpc(method: str, params: dict) -> dict:
    r = requests.post(RPC, json={"method": method, "params": [params]}, timeout=30)
    return (r.json() or {}).get("result", {})


def submit(blob: str) -> str:
    """Submit a signed blob and return the engine result code."""
    res = rpc("submit", {"tx_blob": blob})
    return res.get("engine_result") or res.get("error") or str(res)[:80]


def signed(tx, wallet) -> str:
    return binarycodec.encode(sign(autofill(tx, client), wallet).to_xrpl())


def wait_validated(seconds: float = 5.0) -> None:
    time.sleep(seconds)


def report(label: str, code: str, expectation: str) -> None:
    print(f"  {label}")
    print(f"      result      : {code}")
    print(f"      expectation : {expectation}")


def main() -> int:
    print("A. the same signed Payment, submitted twice")
    blob = signed(
        Payment(account=agent.address, destination=PAY_TO, amount="1000",
                invoice_id=INVOICE),
        agent,
    )
    first = submit(blob)
    report("first submission", first, "tesSUCCESS")
    wait_validated()
    second = submit(blob)
    report("the identical blob again", second,
           "refused — the Sequence is already consumed")

    print("\nB. a NEW Payment reusing the SAME InvoiceID")
    blob2 = signed(
        Payment(account=agent.address, destination=PAY_TO, amount="1000",
                invoice_id=INVOICE),
        agent,
    )
    dup = submit(blob2)
    report("same InvoiceID, fresh Sequence", dup,
           "tesSUCCESS — XRPL does NOT enforce InvoiceID uniqueness")
    wait_validated()

    print("\nC/D. a Check, cashed once, then attacked two ways")
    create = signed(
        CheckCreate(account=agent.address, destination=PAY_TO,
                    send_max="5000", invoice_id=INVOICE),
        agent,
    )
    print(f"  CheckCreate : {submit(create)}")
    wait_validated(6)

    # Find the Check we just made.
    objects = rpc("account_objects", {"account": agent.address, "type": "check"})
    checks = objects.get("account_objects") or []
    if not checks:
        print("  no Check object found; cannot test C/D")
        return 1
    check_id = checks[-1]["index"]
    print(f"  check id    : {check_id}")

    cash = signed(
        CheckCash(account=merchant.address, check_id=check_id, amount="1840"),
        merchant,
    )
    report("CheckCash for 1840 of a 5000 ceiling", submit(cash), "tesSUCCESS")
    wait_validated(6)

    report("C. the identical CheckCash blob again", submit(cash),
           "refused — the merchant's Sequence is consumed")

    cash_again = signed(
        CheckCash(account=merchant.address, check_id=check_id, amount="1000"),
        merchant,
    )
    report("D. a NEW CheckCash against the same Check", submit(cash_again),
           "refused — the Check was deleted when it was cashed")

    print("\n--- what this means for the narration ---")
    print("  Say sequence exhaustion, or say the Check was consumed.")
    print("  Do NOT say the InvoiceID stopped anything; see B.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

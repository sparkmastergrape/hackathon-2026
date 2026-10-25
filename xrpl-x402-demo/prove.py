"""End-to-end proof: boots the merchant, pays it, and verifies on the ledger.

Six checks:
  1. the free route answers without payment
  2. the paid route answers 402 with a usable challenge
  3. the agent pays and gets the resource
  4. the transaction is real, validated and tesSUCCESS -- read from the LEDGER,
     not from the facilitator's success flag
  5. amount and destination on-ledger match what was quoted
  6. a value cap below the price refuses the payment instead of paying it

Exit code 0 only if all six pass.
"""

import os
import subprocess
import sys
import time

import requests
from dotenv import load_dotenv

import agent

load_dotenv()

RPC = os.environ["XRPL_RPC_URL"]
PAY_TO = os.environ["XRPL_PAY_TO"]
PRICE_DROPS = os.environ.get("XRPL_PRICE_DROPS", "1000")
CEILING_DROPS = os.environ.get("XRPL_CEILING_DROPS", "5000")
SOURCE_TAG = 20260530
BASE = "http://127.0.0.1:8402"
RESOURCE = f"{BASE}/market-data"
INFERENCE = f"{BASE}/inference"

PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    results.append((PASS if ok else FAIL, name, detail))
    print(f"  [{PASS if ok else FAIL}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def wait_for_health(proc: subprocess.Popen, timeout: float = 45.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return False
        try:
            if requests.get(f"{BASE}/health", timeout=2).status_code == 200:
                return True
        except requests.RequestException:
            time.sleep(0.5)
    return False


def verify_on_ledger(tx_hash: str) -> tuple[bool, str]:
    """Independent confirmation. A success flag in a header is a claim, not proof.

    Raw JSON-RPC rather than xrpl-py's Tx model: that model's ctid/transaction
    validator rejects a lone `transaction=` in xrpl-py 5.2, and verification code
    is the last place that should depend on a client library's model layer.
    """
    last = "no attempt made"
    for _ in range(12):
        try:
            resp = requests.post(
                RPC,
                json={"method": "tx", "params": [{"transaction": tx_hash, "binary": False}]},
                timeout=15,
            ).json().get("result", {})
        except Exception as exc:  # noqa: BLE001 - transient lookup failure
            last = f"{type(exc).__name__}: {exc}"
            time.sleep(2)
            continue
        if resp.get("validated"):
            return True, resp
        last = f"not validated yet: {resp.get('error') or sorted(resp)[:6]}"
        time.sleep(2)
    return False, f"gave up after 12 tries — last: {last}"


def main() -> int:
    print("Starting merchant...")
    # Log to a file, not a pipe: an unread pipe fills and blocks the server.
    log = open("merchant.log", "w", encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, "merchant.py"], stdout=log, stderr=subprocess.STDOUT, text=True
    )

    try:
        if not wait_for_health(proc):
            log.flush()
            print("merchant failed to start:\n" + open("merchant.log", encoding="utf-8").read()[-2000:])
            return 1

        print("\n--- checks ---")

        # 1. free route
        r = requests.get(f"{BASE}/health", timeout=10)
        check("free route answers unpaid", r.status_code == 200, f"HTTP {r.status_code}")

        # 2. paid route challenges
        r = requests.get(RESOURCE, timeout=20)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        accepts = body.get("accepts") or []
        quoted = accepts[0] if accepts else {}
        ok = r.status_code == 402 and bool(accepts)
        check(
            "paid route answers 402 with a challenge",
            ok,
            f"HTTP {r.status_code}, {len(accepts)} accepts, "
            f"{quoted.get('amount')} drops to {str(quoted.get('payTo'))[:12]}..."
            + ("" if ok else f"\n        url={RESOURCE}\n        body={r.text[:300]}"),
        )

        # 3. agent pays
        print("\n  paying...")
        result = agent.buy(RESOURCE, intent="prove.py end-to-end check")
        paid = result.status == "success"
        check("agent paid and got the resource", paid, f"status={result.status} reason={result.reason}")
        if not paid:
            return 1

        # 4 + 5. on-ledger truth
        ok, tx = verify_on_ledger(result.transaction)
        check("transaction validated on-ledger", ok, result.transaction if ok else str(tx))
        if ok:
            node = tx.get("tx_json", tx)
            meta = tx.get("meta") or {}
            code = meta.get("TransactionResult") if isinstance(meta, dict) else None
            delivered = node.get("DeliverMax") or node.get("Amount")
            check("ledger says tesSUCCESS", code == "tesSUCCESS", str(code))
            check(
                "amount and destination match the quote",
                str(delivered) == str(PRICE_DROPS) and node.get("Destination") == PAY_TO,
                f"{delivered} drops -> {node.get('Destination')}",
            )

        # 6. the cap refuses
        print("\n  testing the value cap (quote is above the cap)...")
        capped = agent.buy(RESOURCE, intent="cap test", max_value="500")
        check(
            "value cap refuses an over-priced quote",
            capped.status != "success",
            f"status={capped.status} reason={capped.reason}",
        )

        # --- metered (`upto`): the ceiling-vs-settled beat -------------------
        print("\n  metered route...")
        r = requests.get(INFERENCE, timeout=25)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        accepts = body.get("accepts") or []
        quoted = accepts[0] if accepts else {}
        check(
            "metered route quotes a ceiling under the upto scheme",
            r.status_code == 402 and quoted.get("scheme") == "upto"
            and str(quoted.get("amount")) == str(CEILING_DROPS),
            f"HTTP {r.status_code}, scheme={quoted.get('scheme')}, ceiling={quoted.get('amount')} drops",
        )

        metered = agent.buy_metered(INFERENCE, intent="prove.py metered check")
        got = metered.status == "success"
        check("agent authorized a Check and got the resource", got,
              f"status={metered.status} reason={metered.reason}")

        if got:
            served = metered.response.json() if metered.response is not None else {}
            ok, tx = verify_on_ledger(metered.transaction)
            check("metered settlement validated on-ledger", ok,
                  metered.transaction if ok else str(tx))
            if ok:
                node = tx.get("tx_json", tx)
                meta = tx.get("meta") or {}
                settled = node.get("Amount")
                expected = str(served.get("tokens", ""))
                check(
                    "settlement is a merchant-signed CheckCash",
                    node.get("TransactionType") == "CheckCash" and node.get("Account") == PAY_TO,
                    f"{node.get('TransactionType')} by {str(node.get('Account'))[:12]}...",
                )
                check(
                    "settled amount is the metered cost, below the ceiling",
                    str(settled) == expected and int(settled) < int(CEILING_DROPS),
                    f"ceiling {CEILING_DROPS} -> settled {settled} drops "
                    f"({served.get('tokens')} tokens), saved {int(CEILING_DROPS) - int(settled)}",
                )
                check(
                    "SourceTag mirrored from CheckCreate onto CheckCash",
                    node.get("SourceTag") == SOURCE_TAG,
                    str(node.get("SourceTag")),
                )
                check(
                    "metered settlement is tesSUCCESS",
                    (meta.get("TransactionResult") if isinstance(meta, dict) else None) == "tesSUCCESS",
                    str((meta or {}).get("TransactionResult")),
                )

        print("\n--- summary ---")
        failed = [r for r in results if r[0] == FAIL]
        for status, name, _ in results:
            print(f"  {status}  {name}")
        print(f"\n{len(results) - len(failed)}/{len(results)} passed")
        if not failed:
            print(f"\nfixed   : https://testnet.xrpl.org/transactions/{result.transaction}")
            print(f"metered : https://testnet.xrpl.org/transactions/{metered.transaction}")
        return 1 if failed else 0

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())

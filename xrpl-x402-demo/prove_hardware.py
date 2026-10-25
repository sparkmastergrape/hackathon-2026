"""Prove the hardware signing path end to end, with a stand-in for the device.

Boots the merchant and a stand-in sidecar, pays the `exact` route with a
signature that came from outside this process, and confirms the result on
testnet. Then restarts the sidecar in decline mode and confirms the refusal
leaves nothing behind.

Every byte between the 402 and the ledger is the real path. The only thing
mocked is the signer, and it is mocked behind the exact HTTP contract the
Speculos sidecar serves — so swapping SIDECAR_URL to :8403 is the whole change.

    py prove_hardware.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import time

import requests
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, ".env"))

PY = sys.executable
RPC = os.environ["XRPL_RPC_URL"]
NETWORK = os.environ["XRPL_NETWORK"]
RESOURCE = os.environ["RESOURCE_URL"]
SIDECAR = os.environ.get("SIDECAR_URL", "http://127.0.0.1:8403")

passed, failed = 0, 0


def check(label: str, ok: bool, detail: str = "") -> bool:
    global passed, failed
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{f' — {detail}' if detail else ''}")
    if ok:
        passed += 1
    else:
        failed += 1
    return ok


def boot(script: str, log: str, url: str, *, env_extra: dict | None = None):
    """Start a server and wait for it to answer.

    Logs to a FILE, never subprocess.PIPE: nobody reads the pipe, so the server
    blocks once the OS buffer fills — a hang that looks like a network fault.
    """
    # Refuse to proceed if something ALREADY answers there. Otherwise the wait
    # loop below is satisfied by the stranger, the server we started dies of
    # "address in use" unread in its log, and every check fails against the
    # wrong process. This cost an hour once on port 8000.
    try:
        requests.get(url, timeout=2)
        raise SystemExit(
            f"something is already serving {url} — stop it first "
            f"(netstat -ano | grep {url.rsplit(':', 1)[-1].split('/')[0]})"
        )
    except requests.RequestException:
        pass

    env = {**os.environ, **(env_extra or {})}
    handle = open(os.path.join(HERE, log), "w")
    proc = subprocess.Popen([PY, script], cwd=HERE, stdout=handle, stderr=handle, env=env)
    for _ in range(60):
        try:
            requests.get(url, timeout=2)
            return proc, handle
        except requests.RequestException:
            if proc.poll() is not None:
                handle.close()
                print(open(os.path.join(HERE, log)).read()[-1500:])
                raise SystemExit(f"{script} exited with {proc.returncode}")
            time.sleep(1)
    raise SystemExit(f"{script} never answered on {url}")


def tx_on_ledger(tx_hash: str) -> dict:
    # Raw JSON-RPC: xrpl-py 5.2's Tx model rejects `transaction=` alone with
    # "Must have only one of `ctid` or `transaction`".
    r = requests.post(RPC, json={"method": "tx", "params": [{"transaction": tx_hash}]},
                      timeout=30)
    return (r.json() or {}).get("result", {})


def main() -> int:
    sys.path.insert(0, HERE)
    from ledger_bridge import hardware_pay

    merchant, mlog = boot("merchant.py", "merchant.log", RESOURCE)
    sidecar, slog = boot("stub_sidecar.py", "stub_sidecar.log", f"{SIDECAR}/health")

    try:
        print("\n1. the stand-in device answers, and its key is usable")
        health = requests.get(f"{SIDECAR}/health", timeout=30).json()
        check("sidecar reports a device", health.get("ok") is True)
        check("it has an address", str(health.get("address", "")).startswith("r"),
              health.get("address", ""))
        pubkey = health.get("publicKey", "")
        check("public key is 33-byte compressed secp256k1",
              len(pubkey) == 66 and pubkey[:2] in ("02", "03"), f"{pubkey[:4]}… ({len(pubkey)//2}B)")

        print("\n2. pay the exact route with a signature from outside this process")
        status, detail = hardware_pay(
            RESOURCE, sidecar_url=SIDECAR, rpc_url=RPC, network=NETWORK,
            max_value_drops=5000,
        )
        # Two shapes count. "success" is the facilitator confirming settlement.
        # "success_unreported" is the facilitator losing sight of a submission
        # that the LEDGER confirms — the payment is just as real, and treating
        # it as a failure is how an agent pays twice.
        if not check("hardware_pay settled", status in ("success", "success_unreported"),
                     f"{status}: {repr(detail)[:160]}"):
            return 1
        if status == "success_unreported":
            print("     (facilitator could not confirm; reconciled on-ledger by InvoiceID)")

        settlement = detail["settlement"]
        tx_hash = settlement.get("transaction")
        check("settlement names a transaction", bool(tx_hash), str(tx_hash))
        check("settlement reports success", settlement.get("success") is True,
              str(settlement.get("errorReason") or ""))
        if status == "success":
            check("the resource came back", bool(detail["resource"]))

        print("\n3. confirm it on testnet")
        time.sleep(4)
        tx = tx_on_ledger(tx_hash)
        meta = tx.get("meta") or tx.get("metaData") or {}
        check("transaction is on the ledger", tx.get("hash") == tx_hash or bool(tx.get("Account")))
        check("tesSUCCESS", meta.get("TransactionResult") == "tesSUCCESS",
              str(meta.get("TransactionResult")))
        check("it is a Payment", tx.get("TransactionType") == "Payment",
              str(tx.get("TransactionType")))
        check("the device's account paid", tx.get("Account") == health["address"],
              str(tx.get("Account")))
        check("signed by the device's key", tx.get("SigningPubKey") == pubkey.upper())
        check("InvoiceID is bound", bool(tx.get("InvoiceID")))
        check("a memo carries the invoice", bool(tx.get("Memos")))
        print(f"\n     https://testnet.xrpl.org/transactions/{tx_hash}")

        print("\n4. the veto: a refusal must leave no transaction")
        sidecar.terminate(); sidecar.wait(timeout=20); slog.close()
        sidecar, slog = boot("stub_sidecar.py", "stub_sidecar_decline.log",
                             f"{SIDECAR}/health", env_extra={"DEVICE_DECLINE": "1"})
        status, detail = hardware_pay(
            RESOURCE, sidecar_url=SIDECAR, rpc_url=RPC, network=NETWORK,
            max_value_drops=5000,
        )
        check("status is declined, not an error", status == "declined", str(detail))
        check("nothing was signed", status == "declined" and "nothing was signed" in str(detail))

        print("\n5. the cap is checked before the human is asked")
        status, detail = hardware_pay(
            RESOURCE, sidecar_url=SIDECAR, rpc_url=RPC, network=NETWORK,
            max_value_drops=1,
        )
        check("an over-cap quote is refused locally", status == "over_cap", str(detail))
    finally:
        for proc, handle in ((merchant, mlog), (sidecar, slog)):
            proc.terminate()
            try:
                proc.wait(timeout=20)
            except subprocess.TimeoutExpired:
                proc.kill()
            handle.close()

    print(f"\n{passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

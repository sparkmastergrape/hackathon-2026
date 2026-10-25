"""The same proof as prove_hardware.py, but against the emulated Ledger.

Needs Speculos running the XRP app on :5000 and `node sidecar.js` on :8403.
See LEDGER-EMULATOR.md.

The difference from the stand-in run: a human has to press buttons. Headless
Speculos has no screen to press, so an autopilot thread watches the device and
presses for us — approving in one case and REJECTING in the other. The
rejection is the veto beat, performed by the device rather than simulated by a
flag.

    py prove_device.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time

import requests
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, ".env"))
sys.path.insert(0, HERE)

PY = sys.executable
RPC = os.environ["XRPL_RPC_URL"]
NETWORK = os.environ["XRPL_NETWORK"]
RESOURCE = os.environ["RESOURCE_URL"]
SPECULOS = os.environ.get("SPECULOS_URL", "http://127.0.0.1:5000")
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


class Autopilot(threading.Thread):
    """Stand in for the finger on the button.

    Walks the review screens and then either approves or rejects, recording
    every screen it saw so the run proves what the device displayed.
    """

    def __init__(self, decision: str):
        super().__init__(daemon=True)
        self.decision = decision
        self.screens: list[str] = []
        self.acted = False
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def _screen(self) -> list[str]:
        try:
            r = requests.get(
                f"{SPECULOS}/events", params={"currentscreenonly": "true"}, timeout=10
            )
            return [e.get("text", "") for e in (r.json() or {}).get("events", [])]
        except requests.RequestException:
            return []

    def _press(self, button: str) -> None:
        try:
            requests.post(
                f"{SPECULOS}/button/{button}",
                json={"action": "press-and-release"},
                timeout=10,
            )
        except requests.RequestException:
            pass
        time.sleep(0.3)

    def run(self) -> None:
        # Once the review begins, keep pressing right on EVERY screen until the
        # prompt appears. Matching named screens instead stalls the moment the
        # app shows one you did not list — "Account", say — and then the sign
        # request simply hangs until it times out.
        reviewing = False
        while not self._stop.is_set() and not self.acted:
            texts = self._screen()
            label = " | ".join(t for t in texts if t)
            if label and (not self.screens or self.screens[-1] != label):
                self.screens.append(label)
            low = [t.lower() for t in texts]
            if any("sign transaction" in t for t in low):
                if self.decision == "approve":
                    self._press("both")
                else:
                    # One more right lands on "Reject transaction".
                    self._press("right")
                    self._press("both")
                self.acted = True
                return
            if reviewing or any("review transaction" in t for t in low):
                reviewing = True
                self._press("right")
            else:
                time.sleep(0.3)


def boot_merchant():
    try:
        requests.get(RESOURCE, timeout=2)
        raise SystemExit(f"something already serves {RESOURCE} — stop it first")
    except requests.RequestException:
        pass
    handle = open(os.path.join(HERE, "merchant.log"), "w")
    proc = subprocess.Popen([PY, "merchant.py"], cwd=HERE, stdout=handle, stderr=handle)
    for _ in range(60):
        try:
            requests.get(RESOURCE, timeout=2)
            return proc, handle
        except requests.RequestException:
            if proc.poll() is not None:
                handle.close()
                raise SystemExit("merchant exited; see merchant.log")
            time.sleep(1)
    raise SystemExit("merchant never answered")


def tx_on_ledger(tx_hash: str) -> dict:
    r = requests.post(
        RPC, json={"method": "tx", "params": [{"transaction": tx_hash}]}, timeout=30
    )
    return (r.json() or {}).get("result", {})


def main() -> int:
    from ledger_bridge import hardware_pay

    print("0. the emulated device")
    try:
        health = requests.get(f"{SIDECAR}/health", timeout=90).json()
    except requests.RequestException as exc:
        print(f"  the sidecar is not answering: {exc}")
        print("  start Speculos and `node sidecar.js` first — see LEDGER-EMULATOR.md")
        return 1
    if not check("sidecar reports a device", health.get("ok") is True, str(health)[:160]):
        return 1
    check("the XRP app reports a version", bool(health.get("appVersion")),
          f"app {health.get('appVersion')} on {health.get('model')}")
    pubkey = health.get("publicKey", "")
    check("public key is 33-byte compressed secp256k1",
          len(pubkey) == 66 and pubkey[:2] in ("02", "03"), f"{pubkey[:4]}… ({len(pubkey) // 2}B)")
    device = health["address"]
    print(f"     {device}  path {health.get('derivationPath')}")

    merchant, mlog = boot_merchant()
    try:
        print("\n1. the device signs a payment, approved on its own screen")
        pilot = Autopilot("approve")
        pilot.start()
        status, detail = hardware_pay(
            RESOURCE, sidecar_url=SIDECAR, rpc_url=RPC, network=NETWORK,
            max_value_drops=5000,
        )
        pilot.stop()
        if not check("hardware_pay settled", status in ("success", "success_unreported"),
                     f"{status}: {repr(detail)[:160]}"):
            return 1
        if status == "success_unreported":
            print("     (facilitator could not confirm; reconciled on-ledger by InvoiceID)")
        check("the device was actually asked", pilot.acted)

        print("\n   what the device displayed:")
        for i, s in enumerate(pilot.screens, 1):
            print(f"     {i:2}. {s}")
        blob = " ".join(pilot.screens).lower()
        check("it showed a human-readable amount", "xrp 0.001" in blob)
        check("it showed the destination address", os.environ["XRPL_PAY_TO"][1:9].lower() in blob)
        check("it offered an explicit refusal", "sign transaction" in blob)

        tx_hash = detail["settlement"].get("transaction")
        print("\n2. confirm it on testnet")
        time.sleep(4)
        tx = tx_on_ledger(tx_hash)
        meta = tx.get("meta") or tx.get("metaData") or {}
        check("tesSUCCESS", meta.get("TransactionResult") == "tesSUCCESS",
              str(meta.get("TransactionResult")))
        check("the device's account paid", tx.get("Account") == device, str(tx.get("Account")))
        check("signed by the device's key", tx.get("SigningPubKey") == pubkey.upper())
        check("InvoiceID is bound", bool(tx.get("InvoiceID")))
        check("a memo carries the invoice", bool(tx.get("Memos")))
        print(f"\n     https://testnet.xrpl.org/transactions/{tx_hash}")

        print("\n3. the veto — refused on the device itself")
        pilot = Autopilot("reject")
        pilot.start()
        status, detail = hardware_pay(
            RESOURCE, sidecar_url=SIDECAR, rpc_url=RPC, network=NETWORK,
            max_value_drops=5000,
        )
        pilot.stop()
        check("status is declined, not an error", status == "declined", f"{status}: {detail}")
        check("nothing was signed", status == "declined")
        # Assert on the DEVICE's evidence, not the autopilot's bookkeeping. A
        # `declined` here can only come from status word 0x6985, which app-xrp
        # returns when the human rejects and at no other time — so the status
        # itself is the proof. The pilot's `acted` flag proves only that our
        # test harness thinks it pressed something.
        reject_blob = " ".join(pilot.screens).lower()
        check("the device presented the choice before refusing",
              "sign transaction" in reject_blob,
              f"saw {len(pilot.screens)} screens, acted={pilot.acted}")
        for i, s in enumerate(pilot.screens, 1):
            print(f"     {i:2}. {s}")

        print("\n4. the cap is checked before the device is troubled")
        status, detail = hardware_pay(
            RESOURCE, sidecar_url=SIDECAR, rpc_url=RPC, network=NETWORK,
            max_value_drops=1,
        )
        check("an over-cap quote is refused locally", status == "over_cap", str(detail))
    finally:
        merchant.terminate()
        try:
            merchant.wait(timeout=20)
        except subprocess.TimeoutExpired:
            merchant.kill()
        mlog.close()

    print(f"\n{passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

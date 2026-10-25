"""Watch what the Ledger XRP app actually displays while signing, and drive the
buttons to approve.

This answers the one pre-flight question that could change the pitch: does the
device show the destination and amount a human could check, or an opaque hash?
If it is a hash, "the owner reads the real destination" is not a claim we can
make.

Also establishes the approval mechanism. Headless Speculos has no screen to
press, so approval is an HTTP call: POST /button/right and /button/both.

    py observe_device.py
"""

from __future__ import annotations

import os
import sys
import threading
import time

import requests
from dotenv import load_dotenv
from xrpl.clients import JsonRpcClient
from xrpl.models.transactions import Memo, Payment
from xrpl.transaction import autofill

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, ".env"))
sys.path.insert(0, HERE)

from xrpl.core import binarycodec  # noqa: E402

SPECULOS = os.environ.get("SPECULOS_URL", "http://127.0.0.1:5000")
SIDECAR = os.environ.get("SIDECAR_URL", "http://127.0.0.1:8403")
RPC = os.environ["XRPL_RPC_URL"]
PAY_TO = os.environ["XRPL_PAY_TO"]


def screen() -> list[str]:
    r = requests.get(f"{SPECULOS}/events", params={"currentscreenonly": "true"}, timeout=10)
    return [e.get("text", "") for e in (r.json() or {}).get("events", [])]


def press(button: str) -> None:
    requests.post(
        f"{SPECULOS}/button/{button}", json={"action": "press-and-release"}, timeout=10
    )
    time.sleep(0.35)


def main() -> int:
    health = requests.get(f"{SIDECAR}/health", timeout=60).json()
    if not health.get("ok"):
        print("sidecar has no device:", health)
        return 1
    device = health["address"]
    print(f"device: {device}  app {health.get('appVersion')}  {health.get('model')}")

    # A payment a human should be able to verify on screen.
    payment = Payment(
        account=device,
        destination=PAY_TO,
        amount="1000",
        memos=[Memo(memo_data="78343032".upper())],  # "x402"
        source_tag=20260530,
    )
    tx_json = autofill(payment, JsonRpcClient(RPC)).to_xrpl()
    tx_json["SigningPubKey"] = health["publicKey"].upper()
    # The PLAIN unsigned serialization, not encode_for_signing(). app-xrp
    # prepends the STX\0 signing prefix itself; handing it an already-prefixed
    # payload makes its parser fail with "Unexpected device exchange error".
    payload = binarycodec.encode(tx_json)
    print(f"asking the device to sign {len(payload) // 2} bytes")
    print(f"  destination {PAY_TO}  amount 1000 drops\n")

    result: dict = {}

    def do_sign() -> None:
        try:
            r = requests.post(
                f"{SIDECAR}/sign", json={"signingPayloadHex": payload}, timeout=300
            )
            result["status"] = r.status_code
            result["body"] = r.json()
        except Exception as exc:  # noqa: BLE001
            result["error"] = str(exc)

    worker = threading.Thread(target=do_sign, daemon=True)
    worker.start()
    time.sleep(2.5)

    # Walk the review screens, recording every one, then approve.
    print("--- what the device shows ---")
    seen: list[str] = []
    approved = False
    for _ in range(30):
        texts = screen()
        label = " | ".join(t for t in texts if t)
        if label and (not seen or seen[-1] != label):
            seen.append(label)
            print(f"  {len(seen):2}. {label}")
        # Substring, not equality: the screen reads "Sign transaction?" — with a
        # question mark — and an exact match walks straight past it onto
        # "Reject transaction", which is the opposite of what you wanted.
        if any("sign transaction" in t.lower() or t.lower() == "approve" for t in texts):
            press("both")
            approved = True
            break
        press("right")
        if not worker.is_alive():
            break

    worker.join(timeout=60)
    print(f"\napproved via buttons: {approved}")
    if "error" in result:
        print("sign failed:", result["error"])
        return 1
    print("sidecar status:", result.get("status"))
    body = result.get("body") or {}
    sig = body.get("signatureDer", "")
    if sig:
        print(f"signature: {len(sig) // 2} bytes DER, starts {sig[:8]}")
        print(f"publicKey: {body.get('publicKey', '')[:12]}...")
    else:
        print("body:", body)

    # The verdict the pitch depends on.
    blob = " ".join(seen).lower()
    shows_amount = "1000" in blob or "0.001" in blob
    shows_dest = PAY_TO.lower()[:8] in blob or PAY_TO.lower()[-8:] in blob
    print("\n--- the pitch question ---")
    print(f"  shows an amount a human can read     : {shows_amount}")
    print(f"  shows the destination address        : {shows_dest}")
    if not (shows_amount and shows_dest):
        print("  -> DO NOT claim the owner reads the real destination on screen.")
    else:
        print("  -> the 'human reads the real destination' beat is honest.")
    return 0 if sig else 1


if __name__ == "__main__":
    raise SystemExit(main())

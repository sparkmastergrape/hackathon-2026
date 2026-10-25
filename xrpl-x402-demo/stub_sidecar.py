"""A stand-in for the Ledger sidecar: same HTTP contract, a local key instead
of a device.

The point is to prove everything on the Python side of the boundary — quote
selection, transaction build, invoice binding, signing payload, blob assembly,
the x402 header, the facilitator's verdict — without waiting for the emulator.
When Speculos appears, point SIDECAR_URL at the real sidecar on :8403 and
nothing else changes.

secp256k1 on purpose. The Ledger XRP app signs secp256k1 and returns DER; a
stand-in that signed ed25519 would produce raw 64-byte signatures and prove the
wrong thing. Beat 4's veto is the DECLINE switch below.

    py stub_sidecar.py            # signs
    DEVICE_DECLINE=1 py ...       # refuses, like a human pressing reject
"""

from __future__ import annotations

import os

import uvicorn
from dotenv import load_dotenv, set_key
from fastapi import FastAPI, Response
from pydantic import BaseModel
from xrpl.clients import JsonRpcClient
from xrpl.constants import CryptoAlgorithm
from xrpl.core import keypairs
from xrpl.wallet import Wallet, generate_faucet_wallet

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(ENV_PATH)

RPC = os.environ["XRPL_RPC_URL"]
PORT = int(os.environ.get("STUB_SIDECAR_PORT", "8403"))
DECLINE = os.environ.get("DEVICE_DECLINE", "") not in ("", "0", "false")


def _device_wallet() -> Wallet:
    """The key that stands in for the one inside the device.

    Written to .env, never to stdout — a seed in terminal scrollback is a seed
    in a screen recording.
    """
    seed = os.environ.get("DEVICE_SEED")
    if seed:
        return Wallet.from_seed(seed, algorithm=CryptoAlgorithm.SECP256K1)
    # generate_faucet_wallet() takes no `algorithm` — it would hand back an
    # ed25519 account, whose raw 64-byte signatures are not what the device
    # produces. Make the secp256k1 key first, then ask the faucet to fund it.
    wallet = Wallet.create(algorithm=CryptoAlgorithm.SECP256K1)
    generate_faucet_wallet(JsonRpcClient(RPC), wallet=wallet)
    set_key(ENV_PATH, "DEVICE_SEED", wallet.seed)
    set_key(ENV_PATH, "DEVICE_ADDRESS", wallet.address)
    print(f"funded a new stand-in device account: {wallet.address}")
    print("seed written to .env (gitignored); not printed here")
    return wallet


WALLET = _device_wallet()

app = FastAPI()


class SignRequest(BaseModel):
    signingPayloadHex: str  # noqa: N815 — the sidecar's wire name


@app.get("/health")
def health():
    return {
        "ok": True,
        "stub": True,
        "model": "stand-in (local secp256k1 key, no device)",
        "derivationPath": "n/a",
        "address": WALLET.address,
        "publicKey": WALLET.public_key,
        "declineMode": DECLINE,
    }


@app.post("/sign")
def sign(body: SignRequest, response: Response):
    hex_payload = body.signingPayloadHex
    try:
        payload = bytes.fromhex(hex_payload)
    except ValueError:
        response.status_code = 400
        return {"error": "signingPayloadHex must be hex"}

    if DECLINE:
        # The real sidecar returns this when the device action is Stopped.
        # Nothing is signed — that is the whole claim of the veto beat.
        print(f"sign request: {len(payload)} bytes — REFUSED (decline mode)")
        response.status_code = 409
        return {"declined": True}

    # Mimic the device exactly: app-xrp receives the unsigned serialized
    # transaction and prepends the STX\0 signing prefix itself before hashing.
    # keypairs.sign hashes whatever it is given, so the prefix has to be added
    # here or the signature covers the wrong bytes — and the facilitator would
    # reject a blob that looks perfectly well formed.
    print(f"sign request: {len(payload)} bytes — signing")
    prefixed = bytes.fromhex("53545800") + payload
    return {
        "signatureDer": keypairs.sign(prefixed, WALLET.private_key),
        "publicKey": WALLET.public_key,
        "address": WALLET.address,
    }


if __name__ == "__main__":
    print(f"stand-in sidecar on http://127.0.0.1:{PORT}")
    print(f"  account : {WALLET.address}")
    print(f"  decline : {DECLINE}")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")

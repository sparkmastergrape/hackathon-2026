"""Assemble a submittable XRPL blob from a hardware signer's {r, s}.

The Ledger XRP signer kit returns `{ r, s, v? }` — a signature, not a signed
transaction. Between that and the `signedTxBlob` the x402 SDK wants sits the
work below, and the usual advice is that you cannot test it without a device.

You can. A device's {r, s} is just an ECDSA signature over the signing payload.
If this module can rebuild xrpl-py's own blob byte-for-byte from the (r, s) of a
signature xrpl-py produced, then the assembly is correct, and the only thing a
real device changes is where (r, s) came from.

Run `python ledger_bridge.py` to prove it offline.
"""

from __future__ import annotations

import sys

from xrpl.constants import CryptoAlgorithm
from xrpl.core import binarycodec, keypairs

# secp256k1 group order. Signatures with s > n/2 are non-canonical and the
# XRPL rejects them, so they must be folded to n - s.
SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141


def _der_int(value: int) -> bytes:
    """DER INTEGER: big-endian, minimal length, 0x00 prefix if the top bit is set."""
    raw = value.to_bytes((value.bit_length() + 7) // 8 or 1, "big")
    if raw[0] & 0x80:
        raw = b"\x00" + raw
    return b"\x02" + len(raw).to_bytes(1, "big") + raw


def der_encode_signature(r: int, s: int) -> str:
    """(r, s) -> the uppercase DER hex the XRPL expects in TxnSignature.

    Folds s into the lower half of the curve order. A device may already return
    a canonical s; folding an already-canonical value is a no-op, so this is
    safe either way.
    """
    if s > SECP256K1_N // 2:
        s = SECP256K1_N - s
    body = _der_int(r) + _der_int(s)
    return (b"\x30" + len(body).to_bytes(1, "big") + body).hex().upper()


def der_parse_signature(sig_hex: str) -> tuple[int, int]:
    """DER hex -> (r, s). Used to simulate a device's output in the self-test."""
    raw = bytes.fromhex(sig_hex)
    if raw[0] != 0x30:
        raise ValueError("not a DER sequence")
    i = 2
    out = []
    for _ in range(2):
        if raw[i] != 0x02:
            raise ValueError("expected a DER integer")
        length = raw[i + 1]
        out.append(int.from_bytes(raw[i + 2 : i + 2 + length], "big"))
        i += 2 + length
    return out[0], out[1]


def signing_payload_hex(tx_json: dict) -> str:
    """The exact bytes to hand the device.

    `encode_for_signing` already prepends the STX\\0 signing prefix — do not add
    another one, and do not hash it first. The device hashes what it is given.
    """
    return binarycodec.encode_for_signing(tx_json)


def compress_public_key(public_key_hex: str) -> str:
    """Return the 33-byte compressed form the XRPL requires for SigningPubKey.

    `@ledgerhq/device-signer-kit-xrp` warns in its own `Address` type that the
    key width is not fixed: app-xrp compresses to 33 bytes, but the APDU spec
    describes an uncompressed 65-byte key, and callers "should not assume
    either size". An uncompressed key in SigningPubKey is invalid, so normalise.
    """
    raw = bytes.fromhex(public_key_hex)
    if len(raw) == 33:
        return public_key_hex.upper()
    if len(raw) == 65 and raw[0] == 0x04:
        x, y = raw[1:33], raw[33:65]
        prefix = b"\x03" if y[-1] & 1 else b"\x02"
        return (prefix + x).hex().upper()
    if len(raw) == 33 and raw[0] == 0xED:  # ed25519, already canonical
        return public_key_hex.upper()
    raise ValueError(f"unexpected public key length: {len(raw)} bytes")


def assemble_signed_blob(
    tx_json: dict,
    *,
    public_key: str,
    signature_der: str | None = None,
    r: int | None = None,
    s: int | None = None,
) -> str:
    """tx_json + the device's key and signature -> a submittable blob.

    Pass `signature_der` for the Ledger path: the XRP signer kit's
    `signTransaction` returns `SignTransactionDAOutput = Signature = Uint8Array`,
    and its own docstring says that is "DER-encoded for secp256k1... kept as raw
    bytes rather than being split into `{ r, s, v }` the way the Ethereum signer
    does". So the device hands you the finished TxnSignature; you do not encode
    one. Pass `r`/`s` only for signers that do return components.

    `SigningPubKey` must be the DEVICE's key. If it is anything else the ledger
    returns tefBAD_AUTH, which reads like a signing failure and is not.
    """
    if signature_der is not None:
        txn_signature = signature_der.upper()
    elif r is not None and s is not None:
        txn_signature = der_encode_signature(r, s)
    else:
        raise ValueError("pass either signature_der, or both r and s")

    signed = dict(tx_json)
    signed["SigningPubKey"] = compress_public_key(public_key)
    signed["TxnSignature"] = txn_signature
    return binarycodec.encode(signed)


# --------------------------------------------------------------------------
# the x402 hardware path
# --------------------------------------------------------------------------

def _find_settled_payment(
    rpc_url: str,
    *,
    account: str,
    destination: str,
    invoice_id_field: str,
    attempts: int = 6,
    delay: float = 4.0,
) -> dict | None:
    """Look for our own payment on the ledger, identified by its InvoiceID.

    The InvoiceID is what makes this safe: it is the only field that ties a
    ledger entry back to one 402 quote, so a match is proof this exact invoice
    was paid and not merely that some payment happened.

    Asks the WebSocket first — it is told the moment the ledger validates,
    instead of discovering it up to four seconds later — and falls back to the
    polling below when no socket is configured or the socket fails. The
    fallback is slower, not wrong, so a dead socket costs latency and nothing
    else.
    """
    import time

    import requests as _requests

    want = (invoice_id_field or "").upper()

    try:
        from settlement_watch import await_settlement

        pushed = await_settlement(
            account=account,
            destination=destination,
            invoice_id_field=want,
            timeout=float(attempts) * delay,
        )
        if pushed:
            print(f"  settlement confirmed by {pushed['provider']}, {pushed['how']}")
            return {"hash": pushed["hash"], "tx": pushed["tx"]}
    except ImportError:
        pass  # socket module absent; the poller below still answers

    print("  falling back to polling account_tx")
    for attempt in range(attempts):
        if attempt:
            time.sleep(delay)
        try:
            r = _requests.post(
                rpc_url,
                json={"method": "account_tx", "params": [{"account": account, "limit": 20}]},
                timeout=30,
            )
            rows = (r.json() or {}).get("result", {}).get("transactions", []) or []
        except Exception:  # noqa: BLE001 — a failed lookup is not a failed payment
            continue
        for row in rows:
            tx = row.get("tx_json") or row.get("tx") or {}
            meta = row.get("meta") or {}
            if (
                tx.get("TransactionType") == "Payment"
                and tx.get("Destination") == destination
                and (tx.get("InvoiceID") or "").upper() == want
                and meta.get("TransactionResult") == "tesSUCCESS"
            ):
                return {"hash": row.get("hash") or tx.get("hash"), "tx": tx}
    return None


def hardware_pay(
    resource_url: str,
    *,
    sidecar_url: str,
    rpc_url: str,
    network: str = "xrpl:1",
    max_value_drops: int | None = None,
    session=None,
):
    """Pay an x402 `exact` quote with a signature from the sidecar's device.

    Deliberately does NOT use XRPLPresignedPaymentPayer.prepare_payment(): that
    signs with a local xrpl.Wallet, which is the thing being replaced.

    Returns (status, detail). Status is one of:
      "success"  — paid, detail is the settlement dict
      "declined" — the human refused on the device; NOTHING was signed
      a failure string, with detail explaining.
    """
    import requests as _requests
    from x402_xrpl.client.presigned_payment_payer import (
        build_payment_header_for_signed_blob,
        invoice_id_to_invoice_id_field,
        invoice_id_to_memo_hex,
    )
    from x402_xrpl.types import PaymentRequirements
    from xrpl.clients import JsonRpcClient
    from xrpl.models.transactions import Memo, Payment
    from xrpl.transaction import autofill

    http = session or _requests.Session()

    # 1. provoke the challenge
    first = http.get(resource_url, timeout=30)
    if first.status_code != 402:
        return "not_payment_required", f"HTTP {first.status_code}"
    accepts = (first.json() or {}).get("accepts") or []
    candidates = [
        a for a in accepts
        if a.get("scheme") == "exact" and a.get("network") == network
    ]
    if not candidates:
        return "no_acceptable_requirement", accepts
    req = PaymentRequirements.from_dict(candidates[0])

    # The quote is untrusted input — a remote server is choosing fields of a
    # transaction a human is about to be asked to approve.
    if max_value_drops is not None and int(req.amount) > max_value_drops:
        return "over_cap", f"quoted {req.amount} drops, cap {max_value_drops}"

    invoice = req.invoice_id()
    if not invoice:
        return "no_invoice_id", req.extra

    # 2. whose key is signing? ask the device, not a local wallet
    try:
        health = http.get(f"{sidecar_url}/health", timeout=30).json()
    except Exception as exc:  # noqa: BLE001
        return "sidecar_unreachable", str(exc)
    if not health.get("ok"):
        return "sidecar_no_device", health.get("error")
    device_address, device_pubkey = health["address"], health["publicKey"]

    # 3. build the Payment, binding the invoice both ways
    extra = req.extra or {}
    payment = Payment(
        account=device_address,
        destination=req.pay_to,
        amount=str(req.amount),
        invoice_id=invoice_id_to_invoice_id_field(invoice),
        memos=[Memo(memo_data=invoice_id_to_memo_hex(invoice))],
        # A mismatch here fails as `source_tag_mismatch`, which reads like a
        # signature problem and is not.
        source_tag=int(extra["sourceTag"]) if extra.get("sourceTag") is not None else None,
    )
    prepared = autofill(payment, JsonRpcClient(rpc_url))
    tx_json = prepared.to_xrpl()
    tx_json["SigningPubKey"] = compress_public_key(device_pubkey)

    # 4. the device signs the payload — this is where the human is asked
    #
    # The PLAIN unsigned serialization, NOT signing_payload_hex(): app-xrp
    # prepends the STX\0 signing prefix itself and parses the rest as a
    # transaction. Hand it an already-prefixed payload and the four extra bytes
    # derail its parser, which surfaces as "Unexpected device exchange error
    # happened" with the device still showing its idle screen — a message that
    # says nothing about what is wrong. Verified against app-xrp 2.8.2.
    #
    # So the wire contract is "the unsigned serialized transaction", and each
    # signer behind /sign does its own prefixing.
    payload = binarycodec.encode(tx_json)
    signed = http.post(
        f"{sidecar_url}/sign", json={"signingPayloadHex": payload}, timeout=300
    )
    if signed.status_code == 409:
        return "declined", "the human refused on the device; nothing was signed"
    if signed.status_code != 200:
        return "sign_failed", signed.text[:300]
    body = signed.json()

    # 5. assemble, 6. hand to x402
    blob = assemble_signed_blob(
        tx_json, public_key=body["publicKey"], signature_der=body["signatureDer"]
    )
    header = build_payment_header_for_signed_blob(
        req=req, signed_tx_blob=blob, invoice_id=invoice
    )
    paid = http.get(resource_url, headers={"PAYMENT-SIGNATURE": header}, timeout=120)

    if paid.status_code != 200:
        body = {}
        try:
            body = paid.json() or {}
        except ValueError:
            pass
        # The facilitator submits; it does not always get to see the outcome.
        # "settlement attempted, status unknown" means the money MAY have
        # moved. Retrying would pay twice, so reconcile on the ledger instead.
        if body.get("settlementAttempted") or body.get("error") in (
            "settlement_status_unknown",
            "settlement_unknown",
        ):
            found = _find_settled_payment(
                rpc_url,
                account=device_address,
                destination=req.pay_to,
                invoice_id_field=invoice_id_to_invoice_id_field(invoice),
            )
            if found:
                return "success_unreported", {
                    "settlement": {"transaction": found["hash"], "success": True},
                    "reconciled": True,
                    "note": "the facilitator could not confirm; the ledger did",
                }
            return "settlement_unknown", (
                "settlement was attempted and no matching transaction is on the "
                "ledger yet. MONEY MAY STILL MOVE. Do NOT pay again — re-check "
                f"account {device_address} for invoice {invoice}."
            )
        return "rejected", f"HTTP {paid.status_code}: {paid.text[:300]}"

    from x402_xrpl.clients.base import decode_payment_response

    settlement = {}
    if "PAYMENT-RESPONSE" in paid.headers:
        settlement = decode_payment_response(paid.headers["PAYMENT-RESPONSE"])
    return "success", {"settlement": settlement, "resource": paid.json()}


# --------------------------------------------------------------------------
# self-test
# --------------------------------------------------------------------------

def _fixture() -> tuple[dict, str, str]:
    """A deterministic account and a fully-specified Payment. No network.

    SECP256K1 is explicit and load-bearing. xrpl-py defaults to ED25519, whose
    TxnSignature is a raw 64-byte value with no DER structure at all — assemble
    one of those with a DER encoder and the ledger rejects it. The Ledger XRP
    app signs with secp256k1 on path 44'/144'/0'/0/0, so the fixture must match
    the device or the test proves nothing.
    """
    seed = keypairs.generate_seed(
        "0123456789ABCDEF0123456789ABCDEF", algorithm=CryptoAlgorithm.SECP256K1
    )
    public, private = keypairs.derive_keypair(seed)
    address = keypairs.derive_classic_address(public)

    tx_json = {
        "TransactionType": "Payment",
        "Account": address,
        "Destination": "rMNL5bR3CJEmJpR6TXbvTMSEwr79RX3AE3",
        "Amount": "1000",
        "Fee": "12",
        "Sequence": 1,
        "LastLedgerSequence": 100,
        "SourceTag": 20260530,
        "SigningPubKey": public,
        # invoice binding, exactly as the x402 presigned payer sets it
        "InvoiceID": "9624D4C9D4B24933B90CA492E9E034739624D4C9D4B24933B90CA492E9E03473",
        "Memos": [{"Memo": {"MemoData": "494E562D616263313233"}}],
    }
    return tx_json, public, private


def selftest() -> int:
    tx_json, public, private = _fixture()
    checks: list[tuple[bool, str, str]] = []

    def check(ok: bool, name: str, detail: str = "") -> None:
        checks.append((ok, name, detail))
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

    check(public.upper().startswith(("02", "03")),
          "fixture key is secp256k1, matching the Ledger XRP app",
          f"pubkey starts {public[:2]} (ED… would mean ed25519, raw 64-byte sigs)")

    payload = signing_payload_hex(tx_json)
    check(payload.startswith("53545800"), "signing payload carries the STX prefix",
          f"{payload[:8]}… ({len(payload) // 2} bytes)")

    # xrpl-py signs the same payload. This stands in for the device.
    reference_sig = keypairs.sign(bytes.fromhex(payload), private)
    r, s = der_parse_signature(reference_sig)
    check(True, "parsed a signature into (r, s), as a device would return it",
          f"r={hex(r)[:12]}… s={hex(s)[:12]}…")

    # The reference blob: what xrpl-py itself would submit.
    reference = dict(tx_json)
    reference["TxnSignature"] = reference_sig.upper()
    reference_blob = binarycodec.encode(reference)

    # The Ledger path: the device hands back finished DER bytes.
    from_der = assemble_signed_blob(tx_json, public_key=public, signature_der=reference_sig)
    check(from_der == reference_blob,
          "blob from the device's DER bytes matches xrpl-py's own",
          f"{len(from_der) // 2} bytes — the Ledger path")

    # The components path, for signers that return {r, s} instead.
    assembled = assemble_signed_blob(tx_json, public_key=public, r=r, s=s)

    check(assembled == reference_blob,
          "blob assembled from (r, s) is byte-identical to xrpl-py's own",
          f"{len(assembled) // 2} bytes")

    # An uncompressed 65-byte key must be normalised before it can be used.
    uncompressed = "04" + "11" * 64
    check(len(bytes.fromhex(compress_public_key(uncompressed))) == 33,
          "a 65-byte uncompressed device key compresses to 33 bytes",
          "the signer kit warns its key width is not fixed")

    check(der_encode_signature(r, s) == reference_sig.upper(),
          "DER re-encoding round-trips exactly")

    # Low-S folding: the mirror signature must normalise to the same DER.
    folded = der_encode_signature(r, SECP256K1_N - s)
    check(folded == der_encode_signature(r, s),
          "a high-S signature is folded to canonical form",
          "device output is safe either way")

    # The decoded blob must carry the device's key, not anyone else's.
    decoded = binarycodec.decode(assembled)
    check(decoded.get("SigningPubKey") == public.upper(),
          "blob carries the signing public key", decoded.get("SigningPubKey", "")[:16] + "…")

    check(keypairs.is_valid_message(bytes.fromhex(payload), bytes.fromhex(reference_sig), public),
          "signature verifies against the payload and public key")

    failed = [c for c in checks if not c[0]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
    if not failed:
        print("\nAssembly is correct. A real device's (r, s) goes through the same path.")
    return 1 if failed else 0


if __name__ == "__main__":
    print("--- blob assembly self-test (no device needed) ---")
    sys.exit(selftest())

---
name: xrpl-ledger-signing
description: >
  Sign XRP Ledger transactions with a Ledger hardware device, and wire that device
  into an x402 agent payment flow as the human approval gate. Covers the Device
  Management Kit (DMK) XRP signer kit, the Python-to-Node boundary, assembling a
  signed transaction blob from the device's raw signature, and the exact seam where
  a hardware-signed blob enters the x402 SDK.

  Use when the work involves: a Ledger device signing XRPL transactions, hardware
  approval for an autonomous agent, @ledgerhq/device-signer-kit-xrp, DMK with XRP,
  clear signing on XRPL, a human veto on an agent payment, or turning an x402
  `requires_confirmation` into a physical device confirmation.

  Trigger on "sign with Ledger", "hardware wallet approval", "human in the loop for
  the agent", "device-backed trust layer", "clear sign the transaction", "approve on
  device" — in an XRPL context.

  Complements Ledger's own DMK skills (ledger-dmk-implementation, dmk-intent-vocabulary,
  dmk-business-logic), which cover DMK mechanics but say NOTHING about XRP. Load those
  for session/transport/app-management mechanics; load this for everything XRPL-specific.
---

# XRPL + Ledger signing

Two facts decide the architecture, and both are easy to discover too late.

## Fact 1 — Ledger Agent Intent does not support XRP

Ledger Agent Intent is the polished "agent proposes, human approves on device" product. Its supported intents are **Ethereum and Solana only** (send; plus swap on Ethereum). XRP is not listed, and the docs say to treat unlisted chains as unsupported.

So the attractive path is closed. The only route to XRPL hardware signing is the lower-level **Device Management Kit** plus the **XRP signer kit**, and you assemble the human-approval layer yourself.

Do not spend hackathon hours discovering this. If someone suggests Agent Intent for an XRPL demo, this is the answer.

## Fact 2 — the signer returns a signature, not a signed transaction

`signTransaction()` returns `{ r, s, v? }`. It does **not** return a `tx_blob` you can submit, and it does not return a signed transaction object. You must assemble the submittable blob yourself.

This matters because the x402 SDK wants `payload.signedTxBlob` — a complete signed transaction in hex. Between the device's `{r, s}` and that string sits work that nobody's quickstart shows you.

## Architecture: a Node sidecar

The XRP signer kit is **TypeScript only** (`@ledgerhq/device-signer-kit-xrp`). The x402 payer SDK is **Python**. There is no Python path to a Ledger XRP app.

Resolve it with a small Node process that owns the device and exposes a local signing endpoint:

```
Python agent (x402-xrpl)                 Node sidecar (DMK + XRP signer kit)
  build Payment tx  ──────────────────▶  POST /sign { signingPayloadHex }
  encode_for_signing                       → device prompts the human
  assemble blob    ◀──────────────────   { r, s, publicKey } or { declined: true }
  hand to x402
```

Use **`@ledgerhq/device-transport-kit-node-hid`** for the transport. That keeps the sidecar a plain Node process over USB — no browser, no WebHID gesture requirement, no HTTPS. Verified to exist at v1.0.1.

Browser WebHID is the alternative, but it drags in constraints you do not want mid-demo: a Chromium-based browser only (no Safari or Firefox), a `localhost` or HTTPS origin, and a user gesture to begin device discovery. Choose node-hid unless the UI must talk to the device directly.

Packages, with versions verified on npm:

| Package | Version | Role |
| :---- | :---- | :---- |
| `@ledgerhq/device-management-kit` | 1.11.0 | core DMK |
| `@ledgerhq/device-signer-kit-xrp` | **0.2.0** | the XRP signer |
| `@ledgerhq/device-transport-kit-node-hid` | 1.0.1 | USB transport for Node |

**The XRP signer kit is 0.2.0 against a 1.11.0 DMK.** Pre-1.0 against a mature core is a warning: expect gaps, breaking changes and sparse docs. Ledger's own agent skills list seven signer kits — Aleo, Bitcoin, Cosmos, Ethereum, Hyperliquid, Solana, Zcash — and **XRP is not among them**, so their skills will not help you here.

## Which devices actually work

Two different stacks, two different answers. Get this right before buying or borrowing anything.

**DMK + `device-signer-kit-xrp`** — the modern stack, the one the hackathon's Ledger resources point at. The DMK's device identifier table lists exactly five devices:

| Device | DMK USB product ID | Bluetooth |
| :---- | :---- | :---- |
| Nano S Plus | `0x50` | not supported |
| Nano X | `0x40` | yes |
| Stax | `0x60` | yes |
| Flex | `0x70` | yes |
| Nano Gen5 | `0x80` | yes |

All share USB vendor ID `0x2c97`. **The original Nano S is absent** — DMK has no product ID for it, so it cannot enumerate the device at all. No amount of code works around a missing identifier.

**LedgerJS (`@ledgerhq/hw-app-xrp`)** — the previous generation, and still alive: v6.38.0, published September 2026, not deprecated. Paired with `@ledgerhq/hw-transport-node-hid` (v6.33.5) it talks to older hardware, **including the original Nano S**. The XRP app's own README still documents a `nanos` target.

So if the only device available is a first-generation Nano S, hardware signing is still possible — through LedgerJS, not DMK. Note the app's stated limits: **800 bytes maximum transaction size on Nano S**, against 10,000 on Nano X. An XRPL `Payment` with two memos sits far below 800 bytes, so this is not a practical constraint for x402, but it would bite on a large multi-signed transaction.

The honest trade-off: LedgerJS gives you a real hardware signature and a real human gate, but it is not the platform Ledger is showcasing. If a bounty rewards building on their current developer stack, a DMK-capable device is what earns it. Say which one you used; do not imply DMK if you used LedgerJS.

Also relevant: Ledger stopped accepting new app submissions and updates for the original Nano S in 2025, and its 320 KB of memory holds only a few apps at once. The device still runs what is already installed, but you may have to uninstall other apps to fit the XRP app.

## The signer API

```typescript
const signerXrp = new SignerXrpBuilder({ dmk, sessionId }).build();
```

Three methods, each returning `{ observable, cancel }`:

- `getAppConfig(options?)` → `{ version }`, the installed XRP app version
- `getAddress(derivationPath, options?)` → `{ publicKey, address, chainCode? }`
  - `checkOnDevice: true` makes the human confirm the address on the device
  - max 10 path elements; the XRP app rejects longer
- `signTransaction(derivationPath, transaction: Uint8Array, options?)` → `{ r, s, v? }`

Observables emit `DeviceActionState` with status `NotStarted | Pending | Stopped | Completed | Error`. While `Pending`, `intermediateValue.requiredUserInteraction` is one of `VerifyAddress`, `SignTransaction`, `SignPersonalMessage`, `UnlockDevice`, `ConfirmOpenApp`, `None`.

**Surface `requiredUserInteraction` in your UI.** It is how you show "waiting for the human" on screen while the device is prompting, which is the visual heart of a human-in-the-loop demo.

**Derivation path: `44'/144'/0'/0/0`.** 144 is XRP's coin type. Ledger's own reference page contradicts itself — its `signTransaction` example shows `m/44'/0'/0'/0/0`, which is Bitcoin's coin type and almost certainly a documentation error. Use 144, and confirm by checking that `getAddress` returns the address you expect.

## The signing bridge

> **Verified:** package existence and versions, the signer's method signatures and
> return shapes, the x402 seam below, and the xrpl-py helper names.
> **Not yet verified on hardware:** the exact bytes `signTransaction` expects, the
> signature encoding it returns, and what the device displays. Those need a device.
> Treat the code below as the shape of the solution, not as tested code.

The sequence:

1. **Get the device's public key** — `getAddress(path)` → `publicKey`. The transaction's `SigningPubKey` must be this, and the account must be the device's address.
2. **Build the Payment** in Python, including invoice binding, with `SigningPubKey` set to the device key and `TxnSignature` absent.
3. **Autofill** `Fee`, `Sequence`, `LastLedgerSequence` against your RPC.
4. **Produce the signing payload** — `xrpl.core.binarycodec.encode_for_signing(tx_json)` returns hex. This already includes the `STX\0` signing prefix, so do not add one.
5. **Send those bytes to the sidecar**, which passes them to `signTransaction` as a `Uint8Array`.
6. **Assemble** — take `{ r, s }`, encode as the signature format the XRPL expects (DER for secp256k1), set it as `TxnSignature`, then `xrpl.core.binarycodec.encode(tx_json)` for the final blob.
7. **Hand the blob to x402** (next section).

Step 6 is where to expect trouble. The XRPL accepts DER-encoded secp256k1 signatures with canonical (low-S) form; a raw `r||s` concatenation will be rejected. Whether the kit returns DER already, or raw components to be encoded, is not documented — **check this first with a device**, because a `tefBAD_AUTH` or `temINVALID` at the demo is unrecoverable in the moment.

## Where a hardware-signed blob enters x402

This is the seam, and it is clean. `x402_xrpl` exposes a function that takes a blob from *any* signer:

```python
from x402_xrpl.client.presigned_payment_payer import (
    build_payment_header_for_signed_blob,
    invoice_id_to_memo_hex,
    invoice_id_to_invoice_id_field,
)

header = build_payment_header_for_signed_blob(
    req=req,                       # the chosen PaymentRequirements
    signed_tx_blob=blob,           # YOUR blob, from the device
    invoice_id=req.invoice_id(),
)
# then: GET the resource again with {"PAYMENT-SIGNATURE": header}
```

You do **not** use `XRPLPresignedPaymentPayer.prepare_payment()` on the hardware path — it signs with a local `xrpl.Wallet`, which is exactly what you are replacing. Build the transaction yourself and bind the invoice with the two exported helpers:

- `invoice_id_to_memo_hex(invoice_id)` → `MemoData` (uppercase hex of the UTF-8 invoice id)
- `invoice_id_to_invoice_id_field(invoice_id)` → the `InvoiceID` field (uppercase SHA-256 hex)

Set **both**, matching the SDK's default `invoice_binding="both"`, or the facilitator may reject with `invoice_binding_missing`.

`build_payment_header_for_signed_blob` asserts the invoice matches the requirement before building, so a mismatch fails locally rather than at the facilitator.

## Wiring the device to `requires_confirmation`

The x402 client already has the approval seam: `confirmation_mode`, a `requires_confirmation` status carrying `confirmation_request`, and `declined` as a first-class outcome. The device is what resolves that pause.

Shape it as: policy check fails or exceeds a ceiling → `requires_confirmation` → sidecar prompts the device → human presses approve → sign and continue, or human rejects → `declined`, and **nothing is signed**.

Keep the refusal path honest. A declined intent must leave no transaction, not an abandoned one. Ledger's own framing is that "the signer stays the final gate", and a demo that signs first and asks later inverts the entire claim.

## Pre-flight, before the event

Hardware fails in ways code does not. Do all of this in advance:

1. **Check the device against the compatibility table above** and pick the stack to match:
   a DMK-listed device → DMK + signer kit; an original Nano S → LedgerJS, or borrow a
   newer device.
2. **XRP app installed** via Ledger Live, and `getAppConfig()` returns a version. On a
   Nano S you may need to uninstall other apps to make room.
3. **`getAddress` returns the address you expect** on path `44'/144'/0'/0/0`, and `checkOnDevice: true` shows it on the screen.
4. **Sign one testnet Payment end to end** and get `tesSUCCESS`. This is the single most valuable pre-event check: it exercises the whole bridge including step 6.
5. **Look at what the device actually displays** during signing. Does it show destination and amount, or an opaque hash? Clear signing for XRPL is undocumented. If the screen is opaque, the "human reads the real destination" beat does not work as claimed, and you must either say so plainly or change the beat.
6. **USB drivers and cable** work on the machine you will demo from.

Items 4 and 5 decide whether the hardware story is real. Do them before Saturday; they are environment verification, not project code.

## Fallback: XRPL multisign — verified working with x402

If the device path fails, the substitute is native XRPL multi-signing: `SignerListSet` establishes a quorum, and approval becomes a second signature rather than a device press. Live since 2016.

**This was tested empirically against the hosted testnet facilitator on 21 Oct 2026, and it works.** A multi-signed `Payment` presented through `build_payment_header_for_signed_blob` returned `isValid: true`. That was not obvious in advance — a multi-signed transaction carries `SigningPubKey: ""` and a `Signers` array instead of `TxnSignature`, and a verifier written for single-signed transactions could easily reject it.

What the test established:

- The facilitator parses a multi-signed blob and verifies it normally.
- **`payer` is derived from the `Account` field, not `SigningPubKey`** — so it correctly reports the paying account even with an empty signing key.
- **Fee is base × (1 + number of signatures)**: 20 drops with one signer against a 10-drop base. Autofill does not know about the extra signature unless you tell it — use `autofill(tx, client, signers_count=N)` or the transaction will be underfunded.

The shape, in xrpl-py:

```python
prepared = autofill(pay, client, signers_count=1)   # note signers_count
partial  = sign(prepared, approver_wallet, multisign=True)
combined = multisign(prepared, [partial])
blob     = encode(combined.to_xrpl())
header   = build_payment_header_for_signed_blob(req=req, signed_tx_blob=blob, invoice_id=inv)
```

**Gotcha found during the test:** if the payment requirement carries `extra.sourceTag`, the transaction must set the same `SourceTag` or verification fails with `source_tag_mismatch`. The error names the tag, not the signature, so it is easy to misread as a multisign problem when it is not. Set `source_tag=` on the `Payment` to match.

It is not the same claim. Multisign proves *another key* approved; a hardware device proves *a human looked at the transaction and pressed a button*. Say which one you built. A judge who catches you blurring the two will discount everything else.

Note also that the x402 `upto` scheme's `upto_sign_check_cash` hook is deliberately a bare callable — the `x402-xrpl` source comments that it may be "a local key, a KMS signer or a multisign quorum" — so the merchant side has the same choice of trust layer.

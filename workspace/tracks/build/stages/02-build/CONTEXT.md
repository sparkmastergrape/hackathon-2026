# Stage 02 — Build

One job: the x402 payment path and the device signing bridge.

## Inputs

| File | Layer | Which sections matter |
| :-- | :-- | :-- |
| `../01-measure/output/measurements.md` | 4 | Chain IDs, facilitator capabilities |
| `../../../shared/MEASURED-FACTS.md` | 3 | The device section, the signature section |
| `LEDGER-EMULATOR.md` (repo root) | 3 | The numbered traps |

## Process

1. Read the traps in `LEDGER-EMULATOR.md` before writing device code. They cost
   hours each to find.
2. Build the transaction in Python. Bind the invoice twice — `MemoData` as
   `HEX(UTF-8(invoiceId))` and `InvoiceID` as `SHA256(invoiceId)`.
3. Send the **plain** serialization to the device. `binarycodec.encode(tx_json)`,
   never `encode_for_signing()`. app-xrp prepends `STX\0` itself.
4. Take the kit's DER bytes as the `TxnSignature` unchanged. There is no
   encoding step.
5. Hand the assembled blob to `build_payment_header_for_signed_blob`.

## Outputs

| File | Format | Location |
| :-- | :-- | :-- |
| Any new trap found | md | `output/traps.md` |
| Notes on the x402 seam | md | `output/seam-notes.md` |

Code itself lives at the repository root, not in this stage.

## Audits — run before writing output

- [ ] A human refusal returns 409, never 500. A veto reported as a crash is the
      demo's whole point inverted.
- [ ] Nothing signs before the policy check passes.
- [ ] A declined intent leaves no transaction, not an abandoned one.

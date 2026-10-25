# Stage 06 — Receipt Verification

Verify the receipt independently of the service that issued it.

## Inputs

| File | Load |
|---|---|
| `../05-payment-run/output/STATE.md` | receipt identifier, amount |
| `../../_config/factory.md` | Verification stance |

## Process

1. Take `verify-receipt.mjs` from the SDK tab.
2. Run it against an RPC node the operator chooses. The participant space's own
   Verify button asks the service to check its own receipt; that is not
   independent verification and does not satisfy this stage.
3. Compare the on-chain result against stage 05's recorded amount and channel id.
4. Record the RPC endpoint used, so the check is reproducible.

## Audits

- The RPC endpoint is named in the output. "Verified" without a named endpoint
  is not a result.
- Any mismatch between on-chain and recorded values is reported as a mismatch,
  not reconciled away.

## Outputs

- `output/STATE.md` — verification result, RPC endpoint, values compared.

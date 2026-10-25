# Stage 05 — Payment Run

Make one payment inside the funded limit and keep its receipt.

## Inputs

| File | Load |
|---|---|
| `../04-channel-open/output/STATE.md` | channel id, budget reading |
| `../../shared/facts.md` | Wallets, Budget, Mechanism |

## Process

1. Require a `verified` channel id.
2. Decide the amount with the operator before signing anything. It must be well
   inside the 20 RLUSD cap; the first run should be the smallest useful amount.
3. Let the agent build and sign the EIP-712 voucher and settle in RLUSD.
4. Capture the receipt from `PAYMENTS AND RECEIPTS`.
5. Read the budget panel again: `used` and `remaining` should move by exactly the
   amount from step 2.

## Checkpoints

- Before step 3: the operator confirms the amount. A funded limit is not a
  licence to spend it.

## Audits

- Amount settled equals amount authorized.
- `used + remaining` reconciles to the cap.
- The receipt references the channel id from stage 04.

## Outputs

- `output/STATE.md` — amount, receipt identifier, budget before/after.

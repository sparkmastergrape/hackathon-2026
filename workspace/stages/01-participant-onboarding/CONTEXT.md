# Stage 01 — Participant Onboarding

Bring the participant space to a state where all three onboarding items are
confirmed: agent wallet, merchant payout wallet, budget deposit.

## Inputs

| File | Load |
|---|---|
| `../../shared/facts.md` | Wallets, Budget |
| `../../_config/factory.md` | Payout mode, Browser automation |
| `references/onboarding-steps.md` | all |

## Process

1. Reach the participant space. Prefer Claude in Chrome; the signed-in session
   and the signing wallet live in the operator's Chrome profile.
2. If no browser is paired, stop and hand the click sequence to the operator.
   Do not attempt the wallet signature.
3. Confirm item 1 (agent wallet) shows the address in `shared/facts.md`.
4. Set item 2 (merchant payout wallet): select the pool-wallet option, choose a
   Merchant Test Account, confirm. Default is Account 1.
5. Confirm item 3 (budget deposit) shows the 20 RLUSD cap.
6. Observe the result. `MERCHANT PAYOUT` under YOUR WALLETS must no longer read
   `Pending`.

## Checkpoints

- Before step 4: if the operator wants RLUSD they control, they supply their own
  payout address instead of a pool wallet. Ask rather than assume.

## Audits

- No private key, seed or signature material appears in any output.
- Each of the three items is marked `verified` only if observed this run.

## Outputs

- `output/STATE.md` — per-item status table plus the blocking condition, if any.

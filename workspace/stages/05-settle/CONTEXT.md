# Stage 05 — redeem, settle, close
One job: turn the voucher the merchant holds into RLUSD the merchant holds.
COSTS GAS and MOVES RLUSD. Sends two transactions.

## Inputs
| File | Layer | Which sections matter |
|------|-------|-----------------------|
| ../03-x402-pay/output/vouchers.json | 4 | the highest cumulative amount |
| ../02-channel/output/channel.md | 4 | channel id, cap |

## Process
1. Pause for human approval. This is the step that spends.
2. Run `CHANNEL_ID=0x... X402_MERCHANT_URL=http://localhost:PORT/resource npm run
   x402:redeem`, pointed at the merchant that holds the vouchers.
3. It submits the signature the merchant already holds and signs nothing new.
   Running `npm run agent` instead would sign a fresh voucher for one more
   payment, and under-redeem what the merchant is owed.
4. Expect four steps: redeem, report, settle, close. If any throws a transport
   error, do not retry blindly. Read the chain first. This service has twice
   thrown on `/settle` after the work had already succeeded.
5. Re-read the channel. `redeemed` should equal the voucher. `status` should be 2.

## Outputs
| File | Format | Location |
|------|--------|----------|
| settlement.md | md | output/settlement.md |

Record the redemption hash, the claim id, the settlement and payout hashes, the
receipt URL, the close hash, and the final cumulative amount.

## Checkpoints (human steering)
- Before step 2, show the amount about to be redeemed and wait for approval.
- On any error, stop and show the chain state before any retry.

## Audits (run BEFORE writing output)
- [ ] Every hash was read from a receipt, not from a log line alone.
- [ ] `status` 2 was read from the contract.
- [ ] A retried step is recorded as retried, with what the first attempt did.

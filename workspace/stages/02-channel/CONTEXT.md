# Stage 02 — open a funded channel
One job: open one channel to the team merchant with a hard spending cap.
COSTS GAS. Sends one transaction from the agent wallet.

## Inputs
| File | Layer | Which sections matter |
|------|-------|-----------------------|
| ../01-preflight/output/preflight.md | 4 | gas balance, sign-in result |
| ../../_config/run.md | 3 | service, chain, PaymentLedger |

## Process
1. Stop if stage 01 reported a 401 or zero gas. Neither is recoverable here.
2. Decide the cap. `CHANNEL_CAP` in `.env` is the default. The cap is the most
   the agent can ever spend on this channel, and it cannot exceed the RLUSD the
   platform has allocated.
3. Pause for human approval of the cap before sending anything.
4. Open it: `npm run x402` with `CHANNEL_ID` unset opens one and then pays, or
   use the channel step of `npm run agent`.
5. Read the channel back from the contract: cap, redeemed, agent, status, payout.
   Status 1 is open. Status 2 is closed.
6. Confirm `payout` equals the merchant payout address in `_config/run.md`. If it
   does not, this channel pays a different merchant and stage 03 will refuse it.

## Outputs
| File | Format | Location |
|------|--------|----------|
| channel.md | md | output/channel.md |

Record the channel id, the cap, the opening transaction hash, the payout address
and the status as read from the contract.

## Checkpoints (human steering)
- Before step 4, show the cap and the payout address and wait for approval.

## Audits (run BEFORE writing output)
- [ ] The status was read from the contract, not inferred from a script's output.
- [ ] The payout address was compared, not assumed.

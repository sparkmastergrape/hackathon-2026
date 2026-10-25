# Stage 04 — prove the refusals
One job: show the merchant refusing a voucher it should refuse.
Moves no funds. Costs no gas. Needs an open channel from stage 02.

## Inputs
| File | Layer | Which sections matter |
|------|-------|-----------------------|
| ../02-channel/output/channel.md | 4 | channel id, cap |
| references/blueprint.md | 3 | the CONTROL column |

## Process
1. Start a merchant with an empty voucher store, on its own port. The invoice
   replay case needs a store this stage controls.
2. Run `CHANNEL_ID=0x... npm run x402:refusals`.
3. Record all four results. Each must be a 402 with a named reason: a stranger's
   signature, an amount edited after signing, a correctly signed voucher over the
   cap, and one invoice presented twice.
4. The over-cap case is a submission requirement, not a nicety. The deck asks for
   a rejected over-cap attempt by name.

## Outputs
| File | Format | Location |
|------|--------|----------|
| refusals.md | md | output/refusals.md |

Record each case, the status, the reason and the detail string.

## Audits (run BEFORE writing output)
- [ ] Four cases ran. A skipped case is recorded as skipped, with its reason.
- [ ] A 200 anywhere in this stage is recorded as a failure of the merchant.
- [ ] The reason strings are quoted as the merchant returned them.

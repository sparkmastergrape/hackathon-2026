# Stage 06 — verify from the chain
One job: confirm the settlement without the service vouching for itself.
Moves no funds. Costs no gas. Read only.

## Inputs
| File | Layer | Which sections matter |
|------|-------|-----------------------|
| ../05-settle/output/settlement.md | 4 | every hash, the receipt URL |
| ../../_config/run.md | 3 | RPC, PaymentLedger, RLUSD address |

## Process
1. Run `node verify-receipt-onchain.mjs <redemption tx hash>` from the repo root.
   It reads the receipt from a public RPC, decodes the events and traces the
   payout. It asks the service for nothing.
2. Fetch the receipt URL. Record `settlementEvidence.amount` and the
   `payoutObservation` balance before and after.
3. Reconcile the merchant RLUSD balance against its `Transfer` events. The RPC
   caps a log query at 10000 blocks, so query in chunks.
4. If the balance does not match this run, say so, then look for other transfers
   before explaining the gap. Other sessions share these wallets, and an
   unexplained figure is usually their work rather than an error.

## Outputs
| File | Format | Location |
|------|--------|----------|
| verification.md | md | output/verification.md |

Record what the chain says, what the receipt says, and whether the two agree.

## Audits (run BEFORE writing output)
- [ ] Every figure came from the chain or the receipt, not from an earlier stage.
- [ ] A disagreement between chain and receipt is recorded, not reconciled away.
- [ ] Transfers not caused by this run are named as such.

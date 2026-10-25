# Open questions — AP4M x402 path

Claims this stage could not settle. Each is `inferred` and names what would
settle it. Written 25 Oct 2026 by the AP4M build session.

The reasoning behind several of these sits in `../../../../shared/INFERENCES.md`;
this file is the stage-level list of what a measurement would have to do.

## 1. Does the PaymentLedger actually verify the agent's signature?

A 65-byte signature is mandatory in the `redeemVoucher` calldata — **measured**,
present in all 16 redemptions. Whether the contract checks it is **inferred**,
because the contract is not source-verified on the public explorer.

**Settled by:** submitting a redemption with a corrupted signature byte and
recording the revert. Cheap, and it is the single most valuable measurement left
on this path — it is the difference between "a signature was carried" and "a
signature was required".

## 2. Why did the Merchant's own verifier reject a good transaction?

**inferred** that its read of the just-submitted transaction answered as unknown.
Four candidate conditions exist in `verifyMerchantResourceRedemption` and only
one of them was ruled out (`confirmationBlocks` is 1, so it is not a
confirmation wait).

**Settled by:** a run that reproduces the failure with each of the four
conditions logged separately.

## 3. Will the agent refuse a price above its ceiling? — CLOSED 25 Oct 2026

**Settled, measured.** A merchant priced at 0.50 RLUSD against a 0.10 ceiling was
refused by two independent layers, both before any voucher was signed, and the
chain recorded nothing: 12 redemptions on the channel before and after, no new
claim IDs, cumulative and payout balance unchanged.

Full record: `../../03-prove/output/refusal-case.md`.

The run also found that the agent's own check did not exist — it printed a line
claiming a decision and compared nothing. That is fixed, and logged as
correction 14.

**The boundary is settled too, measured the same day.** One base unit above the
ceiling (`100000000000000001`) was refused by both layers with no redemption; a
price exactly equal (`100000000000000000`) was accepted and settled for exactly
that amount. So the comparison is `>` and **the ceiling is inclusive** — a price
equal to the limit is spendable. Anyone quoting the ceiling should say so.

## 4. What is the channel cap's behaviour at the boundary?

Caps are set when a channel opens (1 RLUSD on the x402 channel) and the
cumulative total has only ever reached a fraction of one. **inferred** that a
voucher exceeding the cap is refused.

**Settled by:** a purchase that would take the cumulative past the cap, and
whichever party refuses it named.

## 5. Is AP4M's `batch-settlement` the same scheme the t54 facilitator advertised?

Name match only. See `../../../../shared/INFERENCES.md`.

**Settled by:** a scheme definition from either service, or one payload accepted
by both.

## 6. What sent 0.02 RLUSD out of the payout wallet?

Recorded in `measurements.md` with its transaction and destination. **No cause is
claimed.** This session did not send it.

**Settled by:** matching that transaction against whoever ran the command.

## 7. Could the service's own guides be read if an agent had a session?

`llms.txt` and `/docs/*.md` return **HTTP 401** without a participant session —
**measured**. Whether a session cookie would make them readable to an agent is
**inferred** and untested, which matters because the project's own `AGENTS.md`
instructs agents to treat those documents as the source of truth.

**Settled by:** one authenticated fetch.

## 8. Does any of this hold off localhost?

The Merchant has only ever been reached at `127.0.0.1`. HTTPS is required
otherwise, by the helper's own check.

**Settled by:** one purchase against the Merchant behind TLS from a second
machine.

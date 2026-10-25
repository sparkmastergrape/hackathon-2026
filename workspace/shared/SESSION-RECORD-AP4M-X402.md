# Session record — the AP4M x402 session

Written at the close of the session that produced the AP4M payment path: the
x402 Merchant and Agent, the on-chain verifier, `X402.md`, the two submission
artifacts, and the build-track outputs for stages 01, 02 and 03.

For a reviewer who was not here. It says what is proven, what is not, and what
to distrust.

**This is not the device session.** That session's record is
`SESSION-RECORD-2026-10-25.md` and covers `xrpl:1`, Speculos and the hardware
veto. This one covers chain 1449000 and the AP4M service. The two are different
x402 implementations and neither result transfers to the other. Read the one you
need.

## What this session claimed, and how far each claim is backed

| Claim | Status |
| :-- | :-- |
| An agent pays per call over x402 on the XRPL EVM sidechain | **Measured.** 17 `VoucherRedeemed` events across 5 channels, chain 1449000 |
| The agent decides from an HTTP 402 with no human step | **Measured for the decision, not for the absence of a human.** The 402 and the decision are stdout; only the voucher onward is on chain |
| A ceiling the agent cannot exceed | **Measured, both sides of the boundary.** Two independent layers refuse one base unit above; exactly at the ceiling it buys and settles to the base unit |
| The ceiling is enforced before signing | **Measured.** No voucher exists after a refusal; the state directory is never created |
| Many payments on one channel | **Measured.** 13 redemptions on one channel, cumulative rising monotonically |
| RLUSD reaches a third party | **Measured.** Every redemption has a vault leg into the payout wallet, and the wallet reconciles |
| The ledger verifies the agent's signature | **Not measured.** A 65-byte signature is mandatory in the calldata. Whether the contract checks it is unknown — the contract is not source-verified |
| A human veto | **Absent.** Nothing in this path involves a device or a person |

Say **the ceiling is inclusive** out loud if asked: a price equal to the limit is
spendable, measured to the base unit.

## Proof runs

All at the repository root, all against chain 1449000.

- `npm run predemo` — 12 checks, spends nothing, ends `GO` or `NO-GO`. Does not
  cover the x402 path.
- `npm run demo` → `run-ap4m.cjs` — the SDK path, agent submits.
- `npm run x402:merchant` + `npm run x402:agent` — the x402 path, merchant
  submits. This is the autonomy demo.
- `node icm-x402-evidence.mjs` — reads every redemption off the chain and
  **overwrites** `tracks/build/stages/01-measure/output/measurements.md` and
  `03-prove/output/proof-run.md`. Never hand-edit those two files.
- `node refusal-witness.mjs before|after <channel> [label]` — brackets a run and
  compares claim-ID sets. `EXPECT_DELTA_WEI` states the expected movement in
  advance so the witness can disagree.
- `node refusal-sdk-layer.mjs` — skips the agent's own ceiling check to test the
  SDK's independently.

Run the merchant first and leave it running. A 503 from it means read **its**
terminal, not the agent's.

## The mistakes that cost the most

Full list with symptoms in `tracks/build/stages/02-build/output/traps.md`.

1. **Every merchant failure is the same silent 503.** The handler swallows each
   internal error into `payment_pending_or_unavailable`. Two unrelated defects
   wore that mask for an hour. Error logging was added to both `catch` blocks;
   keep it.
2. **The merchant verified its own redemption before the chain had it.** The
   payment settled, the merchant served nothing, and the agent's money was gone.
   Recoverable only through the retained payment. It now waits one confirmation.
3. **Deleting merchant state after a failure orphans a paid-for resource.** This
   session did exactly that and lost 0.05 RLUSD: paid, never delivered. Re-run
   the agent with the **same** operation name instead.
4. **`createX402Merchant` needs a `submitter` and says nothing when it is
   missing.** Without it the merchant cannot send a redemption at all.
5. **`fsync` on a directory fails on Windows.** It crashes the agent after it has
   signed and before it has paid.

## The finding worth the most to a sponsor

Three defects in the vendor helper `ap4m-x402.mjs` as published, two of which
cost a real payment:

- the Windows `fsync`, which makes the helper unusable on Windows as shipped;
- the verify-before-inclusion race, which takes the agent's money and returns
  nothing;
- the `submitter` requirement, undocumented in the helper's own failure path.

All three are patched locally, commented in the file, and written up in
`X402.md`. None has been reported. Deciding whether to file them is the filing
track's job, not this one's.

## What is open

Listed with what would settle each in
`tracks/build/stages/01-measure/output/open-questions.md`. The three that matter:

1. **Does the PaymentLedger verify the signature?** One redemption with a
   corrupted signature byte would settle it. Cheapest high-value measurement
   left on this path, and the difference between "a signature was carried" and
   "a signature was required".
2. **The channel cap.** Never approached. The ceiling refusals all happened in
   the agent's own process; no refusal has come from the vault or the ledger.
3. **Anything off localhost.** The merchant binds `127.0.0.1` and has never been
   reached over a network.

## What to distrust

- **Any total without a block number.** The workspace is shared; payments
  appeared from other sessions between two reads minutes apart, and six arrived
  while the measurement script was running.
- **The witness's balance line immediately after a redemption.** The vault leg
  lands one to five blocks later, so it can report a settled payment as
  unsettled. Its claim-ID and cumulative lines are sound.
- **`ap4m-x402.mjs` is not the published file.** Three patches and two log
  lines. Diff it before assuming vendor behaviour.
- **Both submission artifacts drift.** They quote figures at a stated block and
  the chain has moved since. The quoted block is the defence.
- **The two x402 implementations share a scheme name**, `batch-settlement`, and
  nothing measured connects them. See `INFERENCES.md`.

## Withheld

Nothing. No exhibit from this session is withheld, and nothing here describes
the device composite that JD withheld from the other session.

## The thing most worth keeping

**Generate evidence; do not transcribe it.** Rule 13 was written for receipts,
and following it mechanically on a balance that merely looked wrong is what
caught corrections 11 to 13: a plausible cause had been published for a figure
that no one had summed. Both directions of transfer, summed by a script, took
the explanation away and replaced it with an identity that holds.

The same instinct caught correction 14 from the other end. The agent's stdout
said it had compared a price against its ceiling. It had not — the line was
unconditional. The output was real and what it described did not exist, which is
the quote-and-conclusion error in code form. A claim about control flow is
settled by reading the control flow, and then by making the branch run.

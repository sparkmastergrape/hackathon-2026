# Traps — the AP4M x402 payment path

Found 24 and 25 Oct 2026 while building the x402 Merchant and Agent at the
repository root (`x402-merchant.mjs`, `x402-agent.mjs`, both driving the vendor
helper `ap4m-x402.mjs`).

**Scope.** This stage's contract covers the device signing bridge on `xrpl:1`.
None of these traps is about the device. They are the AP4M service on chain
1449000, which is a different x402 implementation from the t54 facilitator in
`shared/MEASURED-FACTS.md`. Nothing here transfers to the device bridge, and the
numbered traps in `LEDGER-EMULATOR.md` are unaffected.

Every hash referenced below lives in `../../01-measure/output/measurements.md`,
machine-transcribed. None is repeated here.

## 1. `fsync` on a directory handle fails on Windows

The helper's `save()` writes a temporary file, renames it, then opens the parent
directory and calls `fsync` on it. Windows returns `EPERM` for that call.

**measured.** `node x402-agent.mjs` on Windows 11, Node 24.14.0, 24 Oct 2026:
`Error: EPERM: operation not permitted, fsync` at `ap4m-x402.mjs:62`.

The crash lands *after* the voucher is signed and the state file is renamed into
place, and *before* the payment is sent. So the agent exits non-zero holding a
valid unsent payment, which is recoverable by resuming the same operation.

**Fix applied:** the directory `fsync` now tolerates `EPERM` and `EINVAL`. The
`rename` above it is already atomic on Windows.

**inferred.** This affects any Windows run of the vendor helper, not just ours.
**Settled by:** one run of the unmodified helper on another Windows machine.

## 2. `createX402Merchant` needs a `submitter` and does not say so when it is absent

The Merchant sends the redemption transaction itself. Without a `submitter`
signer in its config, the call inside the request handler throws, the handler's
`catch` turns it into `HTTP 503 payment_pending_or_unavailable`, and the Agent
reports only `purchase outcome unavailable (HTTP 503)`.

**measured.** Three consecutive runs returned 503 with nothing in the Merchant's
stdout. The cause was found by reading `ap4m-x402.mjs:352` and seeing
`config.submitter` referenced but never passed.

**Fix applied:** the Merchant's own wallet is passed as `submitter`. It needs
XRP for gas; the payout wallet already had it. The Agent's key never reaches the
Merchant process — the Agent only signs.

**measured.** The `VoucherRedeemed` event carries `agent` and `submitter` as
separate fields, and in the x402 rows of the stage 01 table they differ. The
ledger records the separation; it is not just a claim about our code.

## 3. The Merchant verified its own redemption before the chain had it

The handler submitted the redemption and called
`verifyMerchantResourceRedemption` immediately. That verifier compares the mined
transaction against the plan, and it threw `Merchant redemption transaction does
not match payment` — which the handler again returned as a bare 503.

The transaction itself was fine: status success, correct destination, calldata
byte-identical to the plan, and the challenge's finality block hash still
matching. All four were checked individually after the fact.

**measured, and this is the expensive part:** the Agent's money had already
moved. The redemption settled and the Merchant served nothing. Retrying the same
payment made the Merchant replay the retained row, re-derive the transaction from
the ledger's own logs, verify it, and release the resource — same transaction
hash, no second payment.

**inferred.** The verifier's own `provider.getTransaction` or
`waitForTransaction` answered as though the transaction were unknown, because it
had only just been accepted. `confirmationBlocks` is 1 in the service's x402
context, so a 120-second wait for confirmations is not the explanation.
**Settled by:** instrumenting which of the verifier's four conditions fails, on a
run that reproduces it.

**Fix applied:** the Merchant now waits for one confirmation before verifying.
The transaction hash is persisted *before* the wait, so a crash in the gap is
still reconciled through the retained payment.

## 4. Deleting Merchant state after a failure orphans a paid-for resource

The retained payment row is the only route by which an Agent that has already
paid receives what it paid for. Deleting `.x402-merchant-state/` discards it, and
the Agent's voucher can never be replayed.

**measured.** One redemption of 0.05 RLUSD settled and was never delivered,
because this session deleted the Merchant's state directory between a failed
verification and a retry.

The correct recovery is to leave the state alone and re-run the Agent with the
**same** operation name.

## 5. A killed Merchant leaves a lock that blocks the next start

`merchant.lock` is created on start and removed by the `SIGINT`/`SIGTERM`
handler. A process killed outside those signals leaves it, and the next start
refuses with a message naming the lock.

**measured.** Observed after stopping the Merchant from the harness rather than
by interrupt. Deleting the lock — never `merchant.sqlite` — lets it start.

## 6. Canonical JSON admits only safe integers

The resource content is hashed as canonical JSON. A float in it throws
`canonical JSON numbers must be safe integers` at Merchant start.

**measured.** `citationRate: 0.18` crashed the Merchant. Rates are now whole
percent and positions are tenths, with the unit in the key name.

## 7. HTTP 402 needs a real open channel first

Probing the resource with a fabricated channel id returns `503`, not `402`: the
Merchant reads the channel binding from the ledger before it will quote. The
Agent must open or find its channel before it can be refused.

**measured.** A fabricated id returned `503 payment_pending_or_unavailable`; the
Agent was reordered to open the channel first and then received `402`.

## Audit gate for this file

- [x] Every claim carries `measured` or `inferred`.
- [x] Each measured claim names the command or file and the date.
- [x] Each refusal names the refusing party — the Merchant in 2, 3, 5 and 7, the
      canonical-JSON encoder in 6, Windows in 1.
- [x] Nothing is attributed to another session; all seven were found by the AP4M
      build session.
- [x] No withheld exhibit is described.

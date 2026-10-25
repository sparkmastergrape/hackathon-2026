# Seam notes — where a payment enters the x402 flow

The AP4M path on chain 1449000. For the device bridge seam on `xrpl:1`, see this
stage's contract and `LEDGER-EMULATOR.md`; the two are not the same seam and
nothing below substitutes for that work.

## The shape of the flow

```
Agent                          Merchant                        Ledger
  |                               |                              |
  |-- GET /resource ------------->|                              |
  |                               |-- read channel binding ----->|
  |<-- 402 + PAYMENT-REQUIRED ----|                              |
  |   (price, channel, deadline)  |                              |
  |                               |                              |
  [decides against its ceiling]   |                              |
  |                               |                              |
  |-- GET + PAYMENT-SIGNATURE --->|                              |
  |   (signed voucher)            |-- redeemVoucher ------------>|
  |                               |<-- VoucherRedeemed ----------|
  |                               |   [vault pays the payout]    |
  |<-- 200 + resource ------------|                              |
```

**measured.** Each arrow was observed in one run on 25 Oct 2026; the on-chain
legs are in `../../01-measure/output/measurements.md` and
`../../03-prove/output/proof-run.md`.

## Four properties of the seam worth knowing

**The voucher amount is cumulative, not per payment.** The signed field is the
channel's running total. A descriptor or a UI that labels it "Amount" is more
misleading than raw hex, because the number looks like a payment and is not one.
**measured** across nine redemptions on one channel, where the cumulative rose
monotonically while each `amount` stayed small.

**The Agent signs; the Merchant submits.** In the x402 path the Merchant pays the
gas and sends the transaction. The Agent never needs a provider for anything but
reading, and its key stays in its own process. **measured** — `agent` and
`submitter` are distinct fields in the event and hold different addresses in
every x402 row.

**The 402 is the only step the ledger cannot corroborate.** Price, quote,
deadline and the Agent's decision are HTTP and stdout. Everything from the
voucher onward is on chain. Any claim about autonomy rests on the first half,
which has no receipt. Say so rather than letting the on-chain half carry it.

**Idempotency is per operation name, on both sides.** The Agent retains one
unresolved purchase per state directory; the Merchant retains one incomplete
payment per channel. A retry with the same arguments resolves the existing
payment. A retry with different arguments is refused. This is what makes trap 3
in `traps.md` recoverable and trap 4 unrecoverable.

## The ceiling, as it actually works

Corrected 25 Oct 2026. An earlier version of this file said the Agent's ceiling
comparison preceded `buyResource` and called that **measured** from the Agent's
ordered stdout. **That was wrong.** The Agent printed a line saying it had
decided and performed no comparison; the only real check was `maximumAmount`
inside `buyResource`. A log line is not a decision. See `correction-log.md` 14.

What is there now, both **measured** in the refusal run
(`../../03-prove/output/refusal-case.md`):

1. The Agent decodes the 402 challenge, compares the quoted price against its
   ceiling, and exits 3 without signing. This is our code.
2. `buyResource` refuses independently with *"Merchant challenge exceeds the
   configured purchase authority"*, before signing, even when step 1 is skipped
   entirely. This is the SDK's, and deleting our check does not remove it.

Neither refusal reaches the Merchant or the ledger. The Merchant quotes the high
price without complaint; the refusal is entirely on the Agent's side.

## What has no seam yet

- **No human veto in this path.** There is no device, no confirmation and no
  `requires_confirmation` state. The hardware veto this workspace exists to
  defend lives entirely in the `xrpl:1` work.
- **No HTTPS.** The Merchant binds `127.0.0.1`. Serving another machine needs
  HTTPS, which also moves the 402 onto a transport nobody here has tested.

## Audit gate for this file

- [x] A human refusal returning 409 rather than 500 — **not applicable**: this
      path has no human-refusal state. Recorded as absent rather than passed.
- [x] Nothing signs before the policy check — **measured** 25 Oct 2026. Both
      refusals land before a voucher exists, and the Agent's state directory was
      never created. Previously claimed on the strength of a log line; see the
      correction above.
- [x] A declined intent leaves no transaction — **measured** 25 Oct 2026. Twelve
      redemptions on the channel before the refusal runs, twelve after, no new
      claim IDs, cumulative and payout balance unchanged.

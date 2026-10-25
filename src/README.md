# Mandate — hardware-rooted spend policy for autonomous agents

A human signs one **Mandate** on a Ledger device: a readable envelope of spending
authority — merchant, per-call cap, rate cap, lifetime budget, purpose, expiry.
The agent then pays inside that envelope **thousands of times with no human
involvement**, and stops dead at the edge of it.

The x402 SDKs say this layer is out of scope:

> "Decide spending policy. Caps and allowlists are passed *into* this skill.
> The policy engine that decides them is its own layer." — `x402-xrpl`

This is that layer. AP4M's own payer validates scheme, network, asset, `payTo`
and ledger — but never the **amount**. See [`docs/DX-LOG.md`](../docs/DX-LOG.md) D-019.

## Modules

| Module | What it is | Depends on |
| :-- | :-- | :-- |
| `config/network.js` | Verified XRPL EVM Testnet + AP4M constants | — |
| `mandate/` | EIP-712 types, build, hash, verify | `viem` |
| `ledger-spend/` | Reservations, aggregates, rate windows, AP4M cumulative vouchers | — |
| `guard/` | Pure verdict function: ALLOW / ESCALATE / DENY | `viem` |
| `mandate/grant.js` | Single-use device-signed answer to one escalation | `viem` |
| `payer/` | The x402 handshake, behind the Guard | `@ap4m/sdk`, `ethers` |
| `device/` | A Ledger wrapped as an approver (Speculos or hardware) | `@ledgerhq/*` |
| `revocation/` | On-chain revocation, read **fail-closed** | `ethers` (lazily) |
| `receipts/` | The receipt chain, and a self-contained HTML view | `viem` |

The first five are pure: no keys, no device, no network, no model. `payer/` and `device/` are
the only modules that touch the network or the device, and `payer/` is the only place a verdict turns
into money moving. 92 tests run with `npm test` and need no hardware, no chain
and no funds — `payer/mock-merchant.mjs` is a local merchant that speaks the
real AP4M wire format through the SDK's own codecs.

## Use it

```js
import { buildMandate, rlusd, hashMandate, verifyMandate } from "./mandate/index.js";
import { SpendLedger } from "./ledger-spend/index.js";
import { evaluate, ALLOW, ESCALATE } from "./guard/index.js";

const mandate = buildMandate({
  agent: AGENT, merchant: MERCHANT,
  maxPerCall: rlusd("0.05"),
  maxPerWindow: rlusd("0.5"), windowSeconds: 3600,
  maxTotal: rlusd("2"),
  purpose: "market-data",            // shown on the device Secure Screen
  validUntil: now + 3600,
  registry: MANDATE_REGISTRY,
});
// ...signed once, on device

const id = hashMandate(mandate);
const ledger = new SpendLedger();

// On every HTTP 402:
const verdict = evaluate({
  mandate, mandateId: id,
  signatureValid: (await verifyMandate(mandate, signature, approver)).ok,
  revoked: false,
  challenge,                          // decoded PAYMENT-REQUIRED
  agent: AGENT, now: Date.now() / 1000 | 0,
  spend: ledger.snapshot(id, { windowSeconds: 3600 }),
  policy: { expectedLedger: PAYMENT_LEDGER },
});

if (verdict.decision === ALLOW) {
  const r = ledger.reserve({ mandateId: id, amount, caps: mandate.message, channelId });
  // r.cumulativeAmount is what goes in the AP4M voucher
  // ...pay, then:
  ledger.commit(r.reservationId, { txHash });
}
```

## Three design decisions worth knowing

**1. Field types are chosen for on-device readability, not on-wire compactness.**
The Ethereum app renders each EIP-712 field as `<name> | <value>`. A `bytes32`
becomes two pages of hex no human can check. So `purpose` is a `string`
(renders `purpose | market-data`) and the merchant allowlist is a plain
`address`, not a merkle root. **EIP-712 field typing is a security decision**:
a field a human cannot read is not a control. Measured, not assumed — see
`docs/DX-LOG.md` D-012.

**2. `reserve()` is the enforcement point, not `evaluate()`.**
`evaluate()` is pure and gives the agent a reasoned verdict. But a check
followed later by a write lets two concurrent calls each pass a cap only one
fits. `reserve()` does check-and-write in one step, and an uncommitted
reservation still counts — so the pessimistic failure is refusing a payment,
never overspending. In-process only; a multi-writer deployment needs a real
lock (`assertSingleWriter`).

**3. DENY never prompts; ESCALATE does.**
Structural and cryptographic failures (bad signature, revoked, wrong chain,
wrong asset) are DENY — no human judgement makes them safe, and prompting on
them trains the operator to rubber-stamp. Quantitative and scope questions
(over a cap, unknown merchant, expired) are ESCALATE: a human can answer those
with a single-use grant.

**4. The merchant's claim about the channel's running total is never trusted.**
AP4M vouchers are cumulative, and `@ap4m/sdk` derives the figure the agent signs
from `extra.acceptedCumulativeAmount` — a field inside the merchant's own 402.
Overstate it and the voucher authorises more than the quoted price, with the
price itself looking correct. We hold our own committed total and refuse any
challenge that disagrees (`CUMULATIVE_MISMATCH`), then re-check what the SDK
actually signed before the request leaves the process
(`CUMULATIVE_DISAGREEMENT`). See `docs/DX-LOG.md` D-020.

## Paying

```js
import { createPayer, PAID, REQUIRES_CONFIRMATION } from "./payer/index.js";

const payer = createPayer({
  mandate, signatureValid: true, ledger,
  channelId, channelCap: rlusd("5"),
  signer,                             // ethers-style; a Ledger wrapper in the demo
  policy: { expectedLedger: PAYMENT_LEDGER },
});

const r = await payer.buy("https://merchant.example/resource");
if (r.outcome === REQUIRES_CONFIRMATION) await askTheHuman(r.verdict);
```

`buy()` never throws on a refusal — a refusal is a result. Ordering is the whole
point: `evaluate()` before anything is reserved or signed, `reserve()` before
the voucher is signed (a signed voucher is a bearer instrument), and `release()`
on every failure path.

## Escalation: what "the human decides" actually means

When the Guard returns ESCALATE, the payer returns `requires_confirmation` with
an `ask` — amount, payee, asset, resource — and the approver turns that into a
**Grant** signed on the device:

```js
const stopped = await payer.buy(url);          // requires_confirmation
const grant = buildGrant({ ...stopped.ask, registry: MANDATE_REGISTRY });
const signature = await device.signTypedData(toGrantSignerPayload(grant));
await payer.buy(url, { grant, grantSignatureValid: true });   // paid, WITHIN_GRANT
```

A Grant is **one payment**: exact amount, exact payee, exact resource,
single-use, minutes-long expiry. It is not a re-signed Mandate with bigger
numbers, because that would turn "yes, buy this one thing" into a larger
standing budget for the rest of the hour. The blast radius of a mistaken tap is
one payment.

Three properties the suite pins down:

- **It lifts the mandate's caps, never the channel's.** An on-chain ceiling is
  not a policy question; a voucher above it is simply unredeemable, and no
  signature changes that.
- **A granted payment still counts.** The amount lands in the spend ledger and
  reduces what the agent may spend unattended afterwards.
- **It cannot excuse anything structural.** Wrong chain, wrong asset, unmandated
  payee are DENY, decided before a grant is consulted. A human tapping approve
  cannot authorise them.

## Revocation fails closed, and that is the whole point

```js
const revocation = createOnChainChecker({ provider, registry: MANDATE_REGISTRY, approver });
const payer = createPayer({ /* … */ revocation });
```

The check runs **before** the resource is even requested, and it answers one
question: may this agent spend right now?

| State | Result |
| :-- | :-- |
| read from chain, not revoked | spend |
| read from chain, revoked | stop, permanently — no `unrevoke` exists |
| read recently, chain now unreachable | spend, while the read is fresh (`maxStaleMs`) |
| never read, or the read is stale | **stop**, code `REVOCATION_UNKNOWN` |

A checker that returns "not revoked" when the RPC is down is not a check. The
moment a human most wants spending to stop is exactly when the network is most
likely to be the thing in the way. The cost is honest: an outage stops an agent
that was doing nothing wrong, and `allowStaleWhenOffline` exists only so that a
deployment preferring availability has to write that choice down.

"Revoked" and "could not find out" report different codes, because a human needs
to tell *you stopped me* from *I cannot reach the registry*.

## Autonomy is the point

AP4M scores *"does the agent decide and pay without human approval"*. So ALLOW
must be the overwhelmingly common verdict — one signature up front, then
hands-off. A confirm dialog on every payment would fail that criterion while
adding no security the envelope does not already provide. `isAutonomous(verdict)`
is the test; the suite asserts 40 consecutive unattended payments over real HTTP under one
mandate before a rate cap bites.

## What it does not do

Hold keys, construct transactions, talk to a device, or submit anything. It
decides. The device signs, the payer pays, and the broker hands out credentials.

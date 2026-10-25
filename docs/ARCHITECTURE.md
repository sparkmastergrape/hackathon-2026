# Mandate — hardware-rooted spend authority for autonomous agents

**Status:** design, pre-code. Written 2026-10-24 for the Ledger x XRPL Swell hackathon (NYC, Oct 24–25).
**Track:** Ledger Track 02 — Agentic Finance ($3,000). Also targets the AWS Agentic Finance partner prize ($2,000).
**Rule compliance:** at least one transaction lands on the XRPL EVM sidechain (testnet). See §4.2.

Items marked **(VERIFY)** are inferences that must be confirmed against a real device or live docs before being claimed in the demo or the README. Do not promote a (VERIFY) to a fact without running it.

---

## 1. The gap we are filling

Two independent sources describe the same missing component.

The `x402-xrpl` skill, listing what it deliberately does not do:

> Decide spending policy. Caps and allowlists are passed *into* this skill. The policy engine that decides them is its own layer.

And AWS AgentCore supplies a runtime, a gateway, an identity/credential vault and observability — but the key that actually moves value is still a software key living in the same blast radius as the agent that can be prompt-injected.

So the gap is not "agents cannot pay". They can. The gap is that **nothing bounds what they may pay, and nothing roots that bound outside the machine the agent runs on.** Today the choice is binary: either the agent holds unbounded spend authority, or a human confirms every single call and the agent is not autonomous.

**Mandate** is that missing layer. A human signs, on a Ledger device, a structured, human-readable *mandate* describing a bounded envelope of spending. Inside the envelope the agent transacts thousands of times with zero human interaction. Outside it, the agent stops dead and must obtain a single-use device signature for that one payment. The envelope is enforced by code the agent cannot edit and rooted in a key the agent never sees.

### 1.1 Why this clears the judging bar

| Criterion | How Mandate meets it |
| :-- | :-- |
| Ledger as a real trust layer, not branding | Remove the device and the system cannot spend at all — not "spends without a logo" |
| Signs on a real device against testnet | EIP-712 mandate + revocation tx, both on device, chain 1449000 |
| Fills a real gap, not a rebuild | The policy layer the x402 SDK names as out of scope and does not ship |
| Clear boundary between automated and human steps | The verdict enum (§5) *is* that boundary, and it is rendered in the UI and the audit trail |
| Reusable by other developers | Shipped as a library with a documented interface, not a demo script (§8) |
| Documentation feedback (DX) | `docs/DX-LOG.md` kept from minute one; pre-release XRP signer exercised deliberately (§4.3) |

---

## 2. Non-goals

Stating these early so scope does not creep during a 36-hour build.

- **Not** a wallet. We do not manage funds, show balances, or do send/receive UX.
- **Not** a facilitator. We use the hosted testnet facilitator; running one for real money is a separate engineering job.
- **Not** mainnet. Testnet only, for the entire event.
- **Not** a general policy DSL. Mandates are a fixed struct (§5.1), not a scripting language. A DSL is the follow-on product, not the hackathon.
- **Not** an AgentCore tutorial. AgentCore is consumed behind a narrow interface (§4.4) so the demo survives if its APIs differ from what we expect.

---

## 3. The rail decision

This is the decision that eats a day if taken late, so it is taken first.

Two incompatible x402 implementations are in reach:

| | **Rail A — native XRPL** | **Rail B — XRPL EVM (chosen)** |
| :-- | :-- | :-- |
| Stack | `x402-xrpl`, Python 3.11+, `xrpl-py` | AP4M, JS/TS, `viem`, RLUSD ERC-20 |
| Network | `xrpl:1` testnet | chain ID 1449000 |
| Ledger signer kit | `device-signer-kit-xrp` (pre-release, 3 methods) | `device-signer-kit-ethereum` (mature) |
| Clear Signing | **Does not exist for XRPL** | ERC-7730 descriptors |
| Matches existing repo | No (repo is ESM JS, `viem` + `xrpl` installed) | Yes — `.env.example` already targets AP4M |

**Decision: Rail B, XRPL EVM sidechain, chain 1449000, RLUSD.**

Three independent reasons converge:

1. **Clear Signing only exists on EVM.** The hackathon source is explicit that there is no XRPL transaction Clear Signing. Our entire thesis is "the human sees what they authorize"; on native XRPL that becomes a blind-sign plus an in-app preview, which is a materially weaker story in front of Ledger judges.
2. **The signer kit is mature.** `device-signer-kit-xrp` is a days-old pre-release doing only addresses, signing and app config. Betting the critical path on it is a 36-hour risk we decline.
3. **It is where the repo already is.** `.env.example` holds `AGENT_PRIVATE_KEY`, `MERCHANT_PRIVATE_KEY` and `AP4M_API_URL`; `package.json` already has `viem`. Rail A would mean a Python rewrite.

**The rejected option is not wasted.** Rail A reappears as an optional stretch (§4.3) precisely *because* its signer is pre-release — exercising it and filing the breakage is worth DX points, which are judged on all tracks. It runs on a branch and never blocks the demo.

### 3.0 How AP4M actually works — measured 2026-10-25

Resolved against the live service. **AP4M is not a generic x402 facilitator that moves ERC-20 tokens per call.** It is a payment-channel and voucher system, and that changes C3 and C4 materially.

| Fact | Value |
| :-- | :-- |
| Network | `eip155:1449000` — XRPL EVM **Testnet** |
| RPC | `https://rpc.testnet.xrplevm.org` |
| RLUSD | `0x27b57a9D0b8d24EB97259c4E2279e45255e016f3`, **18 decimals** |
| PaymentLedger | `0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91` |
| Vault | `0x83DD9cD010eb46e96eceF8F7eB0a18f7845AaBC0` |
| x402 scheme | `batch-settlement` (not `exact` / `upto`) |
| Headers | `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`, `X-AP4M-CHANNEL-ID` |
| Public context | `GET /public/x402-context` — authoritative, needs no auth |
| Gas | XRP, faucet `https://faucet.testevm.ripple.com` |

Flow: the agent opens a funded **channel** (`requestChannel`, capped), signs **vouchers** against it, calls `redeemVoucher()` on the PaymentLedger itself paying XRP gas, then reports the tx so the service settles RLUSD to the merchant payout address.

**Three consequences for this design.**

**(a) The voucher is already EIP-712 — so Ledger plugs straight in.** `signVoucher` builds:

```
domain: { name: "AP4M Payment Ledger", version: "1", chainId, verifyingContract: <ledger> }
types:  { Voucher: [ channelId: bytes32, cumulativeAmount: uint256 ] }
```

That is the same primitive Gate A proved a Ledger can sign. The device can therefore sign the *payment itself*, not merely our mandate. AP4M's own docs say "your private key never leaves your machine"; with this it never leaves the device.

**(b) But a voucher is unreviewable by a human, which is precisely the argument for Mandate.** The struct carries only a `channelId` (32 bytes of hex) and a `cumulativeAmount`. On a Secure Screen that is two pages of hex and a number — no merchant, no price, no purpose. A human asked to approve one learns nothing. So:

> The human signs a *readable Mandate* once — merchant, caps, purpose, expiry, all legible on device (§5.2). The agent then signs *unreadable but bounded* vouchers autonomously. The mandate is what makes automating the voucher safe.

This is now an evidence-based argument rather than a design preference, and it is the core of the pitch.

**(c) Voucher amounts are CUMULATIVE per channel, not per payment.** C3 (Spend Ledger) must therefore track the channel's running total and derive each voucher as `previousCumulative + price`. A per-payment model would silently overpay. The channel cap (5 RLUSD here) is itself an on-chain ceiling enforced by the ledger contract — a second, independent bound beneath our mandate.

### 3.0.1 The autonomy tension, and why Mandate resolves it

AP4M's judging criteria lead with: *"Does the agent decide and pay without human approval? … all without a human in the loop."* Ledger's Track 02 asks for human-in-the-loop approval of sensitive actions. Read naively these conflict, and a project that bolts a confirm dialog onto every payment fails the AP4M criterion outright.

Mandate is exactly the resolution: **one human approval up front defines the envelope; every payment inside it is fully autonomous.** The demo must therefore show a long unbroken run of hands-off payments, with escalation as the rare exception — not the normal path. Lead with autonomy for AP4M judges, with the envelope for Ledger judges; it is one mechanism.

### 3.1 The mandate is a message, not a transaction

The pivotal insight that makes Rail B work: **a mandate does not need to be an on-chain transaction.** It is an EIP-712 typed-data *message*, signed on device, held off-chain, and presented as a capability. That gives us:

- a signature the device can render field-by-field rather than as an opaque blob;
- zero gas and zero latency to issue one;
- no on-chain footprint describing a user's spending limits.

Only **revocation** needs to be on-chain, because revocation must be globally observable and must not depend on our server being honest or available (§4.1).

---

## 4. Components

```
                        ┌──────────────────────────────┐
   human + Ledger ──────│  C1  Approver UI (WebHID)    │
                        └───────────────┬──────────────┘
                              signs     │ EIP-712 Mandate / single-use grant
                                        ▼
┌─────────────────┐   402    ┌──────────────────────────┐
│  C6  Agent      │─────────▶│  C2  Guard (policy)      │──▶ verdict
│  (AgentCore)    │◀─────────│      + C3 Spend Ledger   │    ALLOW/ESCALATE/DENY
└────────┬────────┘  token   └───────────┬──────────────┘
         │                               │ ALLOW
         │                               ▼
         │                   ┌──────────────────────────┐
         │                   │  C4  x402 payer (AP4M)   │──▶ XRPL EVM 1449000
         │                   └───────────┬──────────────┘       RLUSD
         │                               │ settled
         │                   ┌───────────▼──────────────┐
         └───────────────────│  C5  Capability Broker   │
            scoped, short-   └──────────────────────────┘
            lived token
                             ┌──────────────────────────┐
                             │  C7  Receipt chain/audit │
                             └──────────────────────────┘
                             ┌──────────────────────────┐
                             │  C8  Revocation registry │──▶ on-chain, device-signed
                             └──────────────────────────┘
```

### C1 — Approver UI
Browser app (Chromium, WebHID, localhost or HTTPS — discovery requires a user gesture). Builds a DMK instance **once** and shares it. Two jobs: issue a mandate, and resolve an escalation. Renders `intermediateValue.requiredUserInteraction` states (UnlockDevice, ConfirmOpenApp, SignTransaction…) so the operator is never staring at a frozen screen. Always `disconnect` on teardown.

### C2 — Guard (the core deliverable)
A pure function plus a small amount of state. Takes a parsed 402 challenge and the active mandate set; returns a verdict. **Contains no keys, no network calls, no model.** This is what makes it testable, auditable and reusable — and it is the component other developers would actually import.

### C3 — Spend Ledger
Append-only record of committed spend. Enforces aggregate and rate limits. Must **reserve before paying** and settle-or-release after, otherwise two concurrent tool calls can each pass a check that only one should (§7, T5).

### C4 — x402 payer
Thin wrapper over the AP4M flow. Receives an already-approved decision from C2 and executes it. Never decides anything.

### C5 — Capability Broker
Holds real merchant API credentials (AgentCore Identity, or a local vault behind the same interface). Mints a short-lived, narrowly-scoped token **only** against a settled receipt. The agent never holds a long-lived credential.

### C6 — Agent
Bedrock AgentCore runtime. Deliberately the least interesting component: if the agent is fully compromised, §7 still holds.

### C7 — Receipt chain
Each payment emits: AgentCore trace id → prompt/tool call → `invoiceId` → tx hash → mandate hash → device signature. This answers "why did my agent spend this" down to the reasoning step, and it is the screen judges will remember.

### C8 — Revocation registry
Minimal contract on 1449000: `mapping(bytes32 mandateHash => bool revoked)` plus a per-agent epoch counter for revoke-all. Writes are device-signed.

### 4.1 Why revocation is on-chain and mandates are not
A mandate is a capability the holder presents; an off-chain signature is sufficient because the verifier checks it. Revocation is the opposite — it must be discoverable by a verifier who was never told about it, and must survive our backend being down or lying. That asymmetry is why exactly one of the two lives on chain.

### 4.2 Satisfying the "must land a transaction" rule
The revocation write is a real on-chain, device-signed transaction on the XRPL EVM sidechain, and so is every RLUSD settlement. The rule is satisfied twice over by components we need anyway — not by a token transaction bolted on for compliance.

### 4.3 Optional second rail (stretch, branch only)
Native XRPL escrow for an agent-to-agent work agreement, signed with the pre-release `device-signer-kit-xrp`. Value is **primarily DX**: find where the pre-release breaks, file it, and report it. Hard rule: this never touches the critical path and never blocks the demo.

### 4.4 AgentCore boundary
Consumed behind two interfaces only — `CredentialBroker` (mint/revoke scoped token) and `TraceSink` (emit span, correlate id). Both get a local implementation first. **(VERIFY)** exact AgentCore Identity and Gateway API shapes against live docs before wiring; do not write code from memory of them. If AgentCore integration stalls, the local implementations keep the Ledger story — the primary prize — fully intact.

---

## 5. Data structures

### 5.1 The Mandate (EIP-712)

**Field types are chosen from observed device rendering, not from on-chain efficiency.** See §5.2 — the Ethereum app paginates each field as `<name> | <value>`, so a `bytes32` becomes two screens of hex that no human can check.

```solidity
struct Mandate {
    address agent;          // the agent's EVM wallet (AP4M_AGENT_ADDRESS)
    address asset;          // RLUSD ERC-20 on 1449000
    address merchant;       // the single allowed payTo
    uint256 maxPerCall;     // smallest unit
    uint256 maxTotal;       // lifetime ceiling for this mandate
    uint256 maxPerWindow;   // rate ceiling
    uint256 windowSeconds;  // rate window
    uint64  validFrom;
    uint64  validUntil;     // mandates MUST expire — no immortal authority
    string  purpose;        // human tag, e.g. "market-data" — renders as text
    uint256 nonce;
}
```

Domain: `name: "AgentSpendMandate"`, `version: "1"`, `chainId: 1449000`, `verifyingContract: <C8 registry>`.

Design notes:
- `validUntil` is mandatory and short. A mandate that never expires is a software key with extra steps.
- `purpose` is a `string`, not a `bytes32`. Observed: a `bytes32` tag rendered as `0x6D61726B65742D64617461…`; as a `string` the device shows `purpose | market-data`. A field a human cannot read is not a control.
- `merchant` is a single `address`, **not** a merkle root. A root is cheaper on-wire but renders as unreadable hex, which defeats the point of a human signing it. Multi-merchant envelopes are expressed as several mandates in v1. A root remains a future option *only* if paired with a descriptor that can render it meaningfully.
- `nonce` + registry epoch gives both single-mandate revocation and revoke-all.

### 5.2 What the device actually displays — measured

**Resolved by experiment on 2026-10-24**, Speculos + app-ethereum 1.23.0, nanox. Reproduce with `npm run speculos:up && npm run gate-a`.

Three findings, in order of importance.

**(a) With no registered ERC-7730 descriptor, the app refuses to sign at all.** The context module attempts a gated-descriptor lookup for our `verifyingContract` on chain 1449000, fails (we are not in Ledger's registry), falls back to the legacy typed-data path, and the device shows `Blind signing must be enabled in settings`. The app returns `6a80 Invalid data`. **Nothing is signed.** The "show the hashes and compare" fallback originally planned here does not exist by default, because there is no signature to compare against.

**(b) The app has a built-in raw EIP-712 renderer, and it is good.** Enabling **Settings → Raw messages** ("Displays raw content of EIP712 messages") makes the device walk every field of the struct by name:

```
Review typed message → Review struct EIP712Domain
  name | AgentSpendMandate          version | 1
  chainId | 1449000                 verifyingContract | 0x…0001
Review struct Mandate
  agent | 0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D
  asset | 0x…0003                   merchant | 0x…0004
  maxPerCall | 250000               maxTotal | 50000000
  maxPerWindow | 5000000            windowSeconds | 3600
  validFrom | 1792887839            validUntil | 1792891439
  purpose | market-data             nonce | 1792887839
Domain hash | 0x6BD5C225…           Message hash | 0xC3C9FECB…
Sign message → Message signed
```

This is a genuine "what you see is what you sign" for our struct — every limit a human needs to judge is on the Secure Screen, in order, by name. It is the honest guarantee §5.2 was reaching for, and it ships in the app. The device also prints both hashes, so the Approver-UI cross-check remains available as a second factor.

**(c) The residual gap is the warning, not the content.** The device still shows `Blind signing ahead — To accept risk, press both buttons` first, because the *struct* is unverified even though it is readable. Removing that warning needs a descriptor Ledger's backend will serve.

**Therefore the demo narrative is:** limits are reviewed field-by-field on device, and we state plainly that the struct is not in Ledger's descriptor registry, which is why the risk warning appears. Overclaiming here would be the one thing judges are most likely to catch.

**The opportunity (Tier 2/3).** `SignerEthBuilder.withContextModule(contextModule)` is a public override. A custom context module that serves our own ERC-7730 descriptor locally would clear-sign the Mandate *without* Ledger registry onboarding — removing the warning and labelling fields in plain language ("Max per call: 0.25 RLUSD" instead of `maxPerCall | 250000`). That is reusable by any team with an unregistered contract, which is exactly the "fills a real gap, library beats one-off" criterion. Scoped as a stretch because Tier 1 does not depend on it.

### 5.3 Receipt
`{ traceId, toolCall, invoiceId, txHash, mandateHash, verdict, approvedBy: "mandate" | "device", amount, merchant, ts }`

---

## 6. Flows

**Happy path (no human).** Agent calls tool → merchant 402 → C2 parses, checks mandate validity, expiry, revocation, merchant allowlist, per-call cap, then C3 reserves against aggregate + rate → **ALLOW** → C4 pays → settle → C3 commits reservation → C5 mints scoped token → agent gets resource → C7 writes receipt. No human. Target: hundreds of these in the demo.

**Escalation.** C2 returns **ESCALATE** with a reason (`over_per_call`, `unknown_merchant`, `mandate_expired`, `rate_exceeded`). This maps onto the SDK's existing `requires_confirmation` / `confirmation_request` seam — we extend that seam rather than inventing a parallel one. C1 renders the request, the human reviews on device, signs a **single-use grant** (a Mandate with `maxTotal == maxPerCall` and a seconds-long `validUntil`). Agent blocks throughout. Human declines → **DENY**, which is a valid outcome, not an error.

**Denial.** No escalation offered at all for hard failures — revoked mandate, asset mismatch, wrong chain. These are not judgement calls, and prompting on them would train the operator to rubber-stamp.

**Revocation.** Human signs a registry write on device. All verifiers see it. The in-flight agent's next check fails closed.

---

## 7. Threat model

The question that matters: *the agent is fully compromised — what can it do?*

| # | Threat | Control | Residual |
| :-- | :-- | :-- | :-- |
| T1 | Prompt injection redirects payment to attacker address | `merchantRoot` allowlist is inside the signed payload; C2 is not an LLM and cannot be argued with | An already-allowlisted merchant can be overpaid up to `maxPerCall` |
| T2 | Compromised agent runtime tries to spend freely | Agent holds no mandate-signing key; caps enforced in C2 | Bounded by the envelope — which is the entire point |
| T3 | Malicious 402 sets an absurd `amount` or fee | Pin network and scheme filters, cap value and fee, never let `extra` flow unexamined into a transaction | — |
| T4 | Replay of one payment against many invoices | Invoice binding, bounded validity window on the signed payload | — |
| T5 | Concurrent tool calls each pass the same aggregate check | C3 reserves before paying; the reservation is the lock | Needs a real transaction/lock, not read-then-write |
| T6 | Stolen API credential | Agent never holds one; tokens are short-lived, scoped, minted only against a settled receipt | Token lifetime window |
| T7 | Lost or destroyed device | Mandates expire by `validUntil`; (stretch) second device as recovery signer | Without recovery, wait for expiry |
| T8 | Our backend lies about revocation | Revocation is on-chain and independently checkable | Verifier must actually check it |
| T9 | Operator fatigue — rubber-stamping prompts | Hard failures DENY without a prompt; escalations are rare by construction | Human factors; mitigated, not solved |
| T10 | Merchant overstates the channel's accepted cumulative total, so the voucher authorises more than the quoted price | Guard denies on `CUMULATIVE_MISMATCH` against our own committed record; the payer re-checks the figure the SDK actually signed before sending (`CUMULATIVE_DISAGREEMENT`) | Requires our channel record to be accurate; a fresh process must reconcile from chain before paying. See DX-LOG D-020 |

T1 is now narrower than when it was written: the merchant allowlist is a plain
`address`, not a `merchantRoot` merkle root, because a field a human cannot read
on the device is not a control (§5.1, DX-LOG D-012). T10 was not in the original
model — it came out of reading the SDK source, and it is the sharpest edge found
in the whole integration: the price in the 402 can be entirely correct while the
amount actually signed is not.

**The honest limit:** Mandate bounds *how much* and *to whom*, not *whether the purchase was wise*. An agent inside its envelope can still buy something useless. We say this out loud rather than overclaiming.

---

## 8. Reusability

The prize criterion is "library beats one-off". C2 (Guard) + C3 (Spend Ledger) + the mandate types ship as an importable package with a README, a typed interface and unit tests that run **without a device**. C1, C4, C6 are the demo application around it. Anyone running a different agent stack can import the Guard and keep their own payer.

---

## 9. Open questions — resolve before claiming

1. ~~Does `device-signer-kit-ethereum` expose EIP-712 typed-data signing?~~ **ANSWERED — GATE A PASSED** (2026-10-24, Speculos + app-ethereum 1.23.0, nanox). `signTypedData` signed the production Mandate struct and the returned signature **recovers to the address the device itself reported** (`0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D`). Reproduce: `npm run speculos:up && npm run gate-a` (exit 0 = passed). Verified deterministic — five passing runs; device screen count varies by ±1 as the capture occasionally misses a transient frame, but the verdict is stable. Still unconfirmed on *physical* hardware, but the app binary is the one the device runs.
2. ~~What does the ETH app display for an unregistered descriptor?~~ **ANSWERED, and it changed the design** — see §5.2. Short version: it refuses to sign at all until **Settings → Raw messages** is enabled, after which it renders every struct field by name. This is why `purpose` became a `string` and `merchantRoot` became a plain `address` (§5.1).
3. ~~`originToken` requirement~~ **ANSWERED**: optional in the type signature, and the full flow completed with it **absent** — the gated-descriptor lookup fails either way for an unregistered contract, so it is not a blocker for us. Revisit only if we pursue the custom context module in §5.2.
4. ~~AP4M's 402 challenge shape and headers~~ **ANSWERED** (§3.0). Headers `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` plus `X-AP4M-CHANNEL-ID`; scheme `batch-settlement`; challenge carries `accepts[]` with `scheme`, `network`, `asset`, `payTo`, `extra.ledger` and `resource.url`. The SDK's own payer validates all of those **but not the amount** — which is exactly the gap C2 fills.
5. ~~RLUSD address and gas~~ **ANSWERED and verified on-chain** (`npm run probe:network`). RLUSD `0x27b57a9D0b8d24EB97259c4E2279e45255e016f3`, symbol confirmed, **18 decimals** (an earlier draft assumed 6). Agent `0x37F2F4166646Ea3cea94BB37BaBD88a01F52A7A2` holds ~20 XRP gas and 10 RLUSD; merchant `0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8` holds ~79 XRP and 0.03 RLUSD from earlier settled runs. Team is `active`, vault funded with 20 RLUSD by the organizer.
6. **(VERIFY)** AgentCore Identity / Gateway API shapes (§4.4).

Questions 1–5 are closed; only #6 (AgentCore shapes) remains, and it is Tier 3.

**Gate C is passed** (2026-10-25). Six Guard-authorised RLUSD payments are redeemed on chain 1449000 and verified by receipt and by the channel's `redeemed` total — see BUILD-PLAN Gate C for the hashes. Two things we expected to do turned out differently and are worth recording:

- **No channel had to be opened.** `npm run open-channel` found an existing open channel (cap 1 RLUSD) and refused to allocate a second one. 1 RLUSD is 100 payments at the demo price, so the conservative path was also the sufficient one. The script stays, and stays idempotent.
- **The channel already had history**, and the Guard refused the first payment because of it — `CUMULATIVE_MISMATCH` against a spend ledger that started empty. That is the control working, not a bug. The fix is reconciliation from `channels(channelId).redeemed` at startup, which is now how `src/payer/gate-c.mjs` begins. See DX-LOG D-025; it is the one piece of channel state that must come from the chain and not from the challenge.

**Development without hardware.** The whole signing path runs against the Speculos emulator, driven headlessly — `scripts/speculos.sh` plus `src/spike/gate-a-speculos.mjs`, which reads the device screen over HTTP and presses buttons programmatically. This means the Guard, the escalation flow and the demo can all be regression-tested in CI with no device attached, and the physical Ledger is needed only for the final run-through. Treat the emulator as the development target and the device as the acceptance test.

---

## 10. Repo layout

```
src/
  mandate/      types, EIP-712 domain + hashing, verify   <- library
  guard/        policy evaluation, verdicts               <- library
  ledger-spend/ reservations, aggregates, rate windows    <- library
  payer/        AP4M x402 client wrapper
  broker/       CredentialBroker (local + AgentCore impls)
  registry/     revocation contract client
  ui/           approver app (WebHID, DMK)
  agent/        demo agent + tools
contracts/      MandateRegistry.sol
docs/           ARCHITECTURE.md, BUILD-PLAN.md, DX-LOG.md
```

# DX log — Ledger, AP4M and XRPL EVM developer experience

Judged as much as the code, on every track. Covers the Ledger DMK, docs, app-ethereum and Speculos; the AP4M SDK and service; the XRPL EVM testnet; and one finding of our own. **Write entries at the moment of friction**, not at the end — the detail that makes an entry useful is gone twenty minutes later.

Format per entry: what I expected → what happened → exact doc URL → screenshot → proposed fix. A filed issue or PR is worth more than a note here; link it.

---

## Summary — 33 findings, and the six worth your time

Written during the build, not reconstructed after it. Of 33 entries: **29 confirmed**
against a live page, a shipped package, a device or the chain — one of those
(D-030) being our own design rather than anyone's bug; 2 confirmed in the type
definitions with runtime behaviour unverified; 1 a capability gap that is by
design; and **1 retracted** after re-checking the live page — D-002, kept visible,
because a log that only lists hits is not a measurement.

Ranked by what we would file first:

| # | Surface | Finding | Effort to fix |
| :-- | :-- | :-- | :-- |
| **D-004** | Ledger XRP signer docs | Neither the supported transaction types nor the signed bytes are documented. The reason our XRPL-native path stayed a stretch goal. | a table + one sentence |
| **D-012** | app-ethereum rendering | A `bytes32` renders as pages of hex no human checks, so **EIP-712 field typing is a security decision**. Measured across 37 device screens; it changed our struct. | a docs section |
| **D-019 / D-020** | `@ap4m/sdk` | The payer validates scheme, network, asset, `payTo` and ledger — **never the amount** — and the cumulative total it signs is taken from the merchant's own 402 field. A merchant can overstate it and collect the difference while the quoted price looks right. | a warning in the README, and an optional expected-total argument |
| **D-001** | Ledger XRP signer docs | The page's two derivation-path examples disagree on coin type (0 vs 144) *and* on the `m/` prefix. Copy one and you derive a Bitcoin account. | two characters |
| **D-003** | DMK how-to | The parameter table documents `deviceAction`; the example beneath it passes `openAppDeviceAction`. | one line |
| **D-031** | AP4M service | `PayoutBindingLimitExceeded` — an undocumented per-merchant binding limit, reported only *after* the client has spent gas on a landed transaction and polled for 26 seconds. Closed channels seem not to release their binding. | reject at `prepare` |
| **D-032** | `@ap4m/sdk` + service | Cumulative vouchers make a channel **single-writer**, which is documented nowhere. Two payers race, and the loser gets `Merchant redemption transaction does not match payment` plus `retrySamePayment: true` — advice that cannot work. Looks exactly like a flaky RPC. | one doc line + a better error |

Two are genuinely good things that are simply undocumented, and we would rather
they were advertised than fixed: **D-007** (`isBlindSign` / `usedFallback` are
exposed, so an integrator can honestly tell a user whether what they approved was
actually clear-signed) and **D-006** (`signTypedData` takes the standard EIP-712
object verbatim — we found that in `node_modules`, not in the docs).

And one is ours: **D-030**, where breaking the registry read did not stop the next
payment because a cached read was still fresh. Our own control, working as
written, with the wrong story attached to it. It is in here because the point of
a DX log is what the building taught you, not who is to blame.

By surface: **Ledger docs, SDK, app-ethereum and Speculos — 18** (D-001, D-003–D-016,
D-026–D-028); **AP4M SDK and service — 11** (D-018–D-025, D-031–D-033); **both
sponsors' docs together — 1** (D-017, the chain-ID conflict, and the one that would
have silently broken every signature); **tooling — 1** (D-029); **ours — 1**
(D-030); **retracted — 1** (D-002).

The last three (D-031–D-033) came out of one hour spent trying to open a fresh
channel for the demo, and they are the most operationally expensive findings in
the log: a binding limit discovered after spending gas, a single-writer
constraint that presents as a flaky RPC, and a lock file that turns one crash
into every later run failing. None of them is in any document.

---

## Candidates spotted before writing any code

Pre-seeded from reading the docs, then **re-checked against the live pages at
H+30 before submitting**. Three confirmed, one sharper than we thought, and one
retracted — a doc note we could not reproduce is reported as a retraction rather
than quietly dropped.

### D-001 · XRP signer: the two derivation-path examples on one page disagree twice
**Expected:** XRP examples use coin type 144 (`44'/144'/...`), consistently.
**Observed (re-checked live, 2026-10-25):** the same reference page shows
- `getAddress`: `"44'/144'/0'/0/0"`
- `signTransaction`: `"m/44'/0'/0'/0/0"`

Two independent discrepancies in one page: **coin type 0 (Bitcoin) instead of 144**, and an `m/` prefix on one example but not the other — which also leaves it unstated whether the prefix is accepted, ignored or rejected.
**Why it matters:** copy the `signTransaction` example and you derive a Bitcoin account. The device will sign happily; the address simply is not the user's XRP account, and nothing in the flow says so. The prefix ambiguity then costs a second debugging round.
**Page:** `/docs/device-interaction/references/signers/xrp`
**Fix:** `"44'/144'/0'/0/0"` in both examples, and one sentence on whether `m/` is accepted.
**Status:** **confirmed on the live page 2026-10-25** · not filed — easy PR, two characters and a sentence

### D-002 · RETRACTED — DMK `connect` examples are consistent
**We expected to find:** `{deviceId}` and `{device}` used interchangeably across pages.
**Observed on re-check:** not reproduced. The TypeScript guides consistently show `dmk.connect({ device })` with the full discovery object, and the beginner guide says so explicitly. Our pre-seeded note was wrong, and is kept here rather than deleted because a DX log that only lists hits is not a measurement.
**What is left of it, and it is minor:** discovery yields an object whose `device.id` is displayable but is *not* what `connect` takes, and the Kotlin/KMP docs use `deviceUid` for the same concept. A reader moving between the two will stumble; a one-line note in the TS guide would cover it.
**Status:** **retracted after live re-check** · nothing to file

### D-003 · `executeDeviceAction`: the page's parameter table and its own example disagree
**Expected:** the example to pass the key the parameter list documents.
**Observed (re-checked live, 2026-10-25):** the parameter list documents `deviceAction`; the example immediately below passes `openAppDeviceAction`:
```ts
const { observable, cancel } = await dmk.executeDeviceAction({
  sessionId,
  openAppDeviceAction,
});
```
**Why it matters:** from this page alone the correct key is unknowable, and the failure mode is a silent no-op or a type error depending on which you trust. A first-time integrator cannot tell which half of the page is stale.
**Page:** `/docs/device-interaction/integration/how_to/dmk`
**Fix:** make the example match the table (or rename the parameter and update both).
**Status:** **confirmed on the live page 2026-10-25** · not filed — easy PR

### D-004 · XRP signer documents neither the supported transaction types nor what bytes get signed
**Observed (re-checked live, 2026-10-25):** `transaction` is described only as "The serialized transaction to be signed", typed `Uint8Array`. The page says nothing about which XRP transaction types the app will accept, and nothing about whether it signs the raw serialization or the hash-prefixed signing form. The observable emits `{ r, s, v? }` with no guidance on assembling a submittable blob.
**Impact:** an integrator cannot tell what will work without reading `app-xrp` source or trial-and-error against a device. This is the single largest gap for anyone building XRPL tooling on the DMK, and it is why our XRPL-native path stayed a stretch goal (ARCHITECTURE §4.3) — we could not bound the unknown inside 36 hours.
**Fix:** a supported-transaction-type table; one sentence on the signed bytes; a worked example assembling `TxnSignature` from `r`/`s`.
**Status:** **confirmed on the live page 2026-10-25** · not filed — **highest-value XRP doc gap**

### D-005 · No XRPL Clear Signing
Not a doc bug — a capability gap, documented here because it directly shaped our architecture (see ARCHITECTURE §3, §5.2). Worth writing up as a proposal: a metadata schema for XRPL transaction previews, analogous to ERC-7730.
**Status:** by design · proposal candidate

---

## Confirmed from the shipped packages (2026-10-24, H+0)

Read from installed type definitions, not from docs. Versions: `@ledgerhq/device-signer-kit-ethereum` with `@ledgerhq/device-management-kit` ^1.11.0.

### D-006 · `signTypedData` works as hoped — but the docs did not get us there
**Expected:** to find out from the docs whether EIP-712 typed-data signing is supported.
**Observed:** `SignerEth.signTypedData(derivationPath, typedData, options?)` exists and takes the exact standard EIP-712 object. Discovering this required reading `lib/types/api/SignerEth.d.ts` in `node_modules`, because the signer reference page does not lay out the full `SignerEth` interface in one place.
**Time lost:** ~20 min that an interface table would have saved.
**Fix:** publish the complete `SignerEth` interface — all six methods with signatures — at the top of the ETH signer reference page. This is the single highest-value page edit for a new integrator.
**Status:** confirmed · not filed

### D-007 · Blind-sign detection is exposed but undocumented — and it is excellent
**Observed:** `SignTypedDataDAStateStep` includes `DETECT_BLIND_SIGNING` and `SIGN_TYPED_DATA_LEGACY`, and the internal state carries `isBlindSign` and `usedFallback`. This means an integrator can tell the user *whether what they approved was actually clear-signed* — exactly the honest-disclosure problem in ARCHITECTURE §5.2.
**Gap:** none of this appears in the docs we could find. It is a genuinely valuable safety capability that integrators will not know exists.
**Fix:** document the device-action step enum and `isBlindSign`, with a worked example of surfacing "this was blind-signed" in a UI. Strong candidate for a tutorial.
**Status:** confirmed in types · runtime behaviour unverified · not filed

### D-008 · `originToken` is optional in types, required-ish in prose
**Observed:** `SignerEthBuilderConstructorArgs.originToken?: string` is optional, while guidance suggests the default context module needs it.
**Gap:** unclear what degrades without it — no descriptors? No transaction checks? Silent fallback?
**Fix:** state the consequence of omitting `originToken` explicitly.
**Status:** confirmed in types · runtime behaviour unverified · not filed

---

## From the Gate A run on Speculos (2026-10-24)

All reproduced with `npm run speculos:up && npm run gate-a`. app-ethereum 1.23.0, nanox, headless.

### D-009 · Published ESM builds are not loadable by Node — `ERR_UNSUPPORTED_DIR_IMPORT`
**Expected:** `import { DeviceManagementKitBuilder } from "@ledgerhq/device-management-kit"` to work in a Node ESM project.
**Observed:** Node refuses it:
```
Error [ERR_UNSUPPORTED_DIR_IMPORT]: Directory import '…/device-management-kit/lib/esm/src'
is not supported resolving ES modules imported from '…/lib/esm/index.js'
```
`lib/esm/index.js` re-exports `"./src"` — a bare directory specifier, which is valid for a bundler but illegal in Node ESM. Affects `device-management-kit`, `device-transport-kit-speculos` and `device-signer-kit-ethereum` alike. The CJS builds are fine.
**Impact:** any Node-side use — test harness, CI, a server-side agent, which is precisely the agentic use case — fails on import. Browser/Vite users never see it, so it is easy to miss in-house.
**Workaround:** `createRequire(import.meta.url)` and require the CJS build.
**Fix:** emit extensioned relative specifiers (`"./src/index.js"`) in the ESM build, or add an `exports` subpath map that resolves it. This is a one-line build-config change with large blast radius.
**Time lost:** ~25 min.
**Status:** confirmed · not filed — **highest-value issue to report**

### D-010 · Speculos transport emits discovery synchronously, so the documented pattern crashes
**Expected:** the documented idiom to work:
```ts
const sub = dmk.startDiscovering({}).subscribe({ next: d => { sub.unsubscribe(); … } });
```
**Observed:** `ReferenceError: Cannot access 'sub' before initialization`. The Speculos transport emits its first device **synchronously during `.subscribe()`**, so the callback runs before `sub` is bound (TDZ). The same code is safe on WebHID, where discovery is async.
**Impact:** a transport swap — the officially recommended way to develop without hardware — breaks working code with an error that points at the user's variable, not at the transport.
**Fix:** either make the transport emit asynchronously for parity, or document the hazard on the "Use a Transport" page with a safe idiom.
**Status:** confirmed · not filed

### D-011 · Both Speculos package READMEs show import paths that do not exist
- `device-transport-kit-speculos` README: `from "@ledgerhq/device-transport-speculos"` — missing `-kit-`.
- `speculos-device-controller` README: `from "speculos-device-controller"` — missing the `@ledgerhq/` scope.

Copy-pasting either gives a module-not-found. Both are the first code block a reader meets.
**Fix:** correct both snippets to the published names.
**Status:** confirmed · not filed

### D-012 · No guidance that EIP-712 field *types* determine on-device readability
**Observed:** the app renders each field as `<name> | <value>`, paginating long values. A `bytes32` tag came out as `purpose | 0x6D61726B65742D64617461000…` across two screens; the same data as a `string` renders `purpose | market-data`. Likewise a `bytes32` merkle root is unreadable where an `address` is fine.
**Why it matters:** this makes EIP-712 field typing a **security-relevant design decision**, not just an encoding choice — a human cannot meaningfully approve a field they cannot read. We changed our struct because of it (ARCHITECTURE §5.1).
**Fix:** add a short "designing typed data for on-device review" section to the Clear Signing docs: which Solidity types render legibly, and the advice to prefer `string`/`address` over packed bytes for anything a human must judge. Strong tutorial candidate.
**Status:** confirmed · not filed

### D-013 · The prerequisite for signing unregistered EIP-712 is undocumented, and the error is opaque
**Observed:** with no registered ERC-7730 descriptor, `signTypedData` fails with device text `Blind signing must be enabled in settings` and app error `6a80 Invalid data`. Nothing in the signer docs says a device *setting* is a precondition, nor which of the five settings it is. Two are plausible — **Blind signing** and **Raw messages** ("Displays raw content of EIP712 messages") — and the better one for a trust-sensitive flow is **Raw messages**, since it renders every field instead of hiding them. We found that by enumerating the menu, not from docs.
**Also:** `6a80 Invalid data` is indistinguishable from a genuinely malformed payload. We initially suspected our own struct encoding.
**Fix:** (1) document that unregistered typed data requires Raw messages or Blind signing, and which to prefer; (2) map `6a80` in this path to something like "typed data not verifiable and raw display disabled"; (3) expose `isBlindSign` / the blind-signing precondition in the public API so an integrator can detect it and tell the user what to switch on, rather than surfacing a hex code.
**Status:** confirmed · not filed — **best candidate for a PR**

### D-014 · An aborted signing flow leaves the app wedged, and the next error is unhelpful
**Observed:** if a client stops driving the UI partway through an EIP-712 review, the app stays on `Reject transaction`. The *next* `getAddress` then fails with `UnknownDeviceExchangeError / 6901 / "UnknownError"` — no indication that the real cause is an unfinished prior exchange on the device.
**Why it matters:** this reads as a transport or derivation-path bug. In a test suite it looks like flakiness in whichever test happens to run next, and the error text actively misleads.
**Fix:** (1) map `6901` in this context to something like "device has an unfinished request pending"; (2) document that a cancelled device action must be cleared before the next one; (3) consider a DMK helper to detect and recover a pending-prompt state.
**Workaround:** our harness calls `resetToHome()` before connecting — rejects any pending prompt and confirms `app is ready`. With it, three consecutive Gate A runs are byte-identical (46 screens each).
**Status:** confirmed · not filed

### D-015 · Driving the device before the signer asks corrupts the exchange, and the error is empty
**Observed:** a test harness that starts pressing buttons as soon as `signTypedData` is called — rather than waiting for `requiredUserInteraction` — breaks the APDU exchange during `buildContext` / `provideContext`. The failure surfaces as `{"_tag":"GeneralDmkError","originalError":{}}`: no code, no message, nothing to search for.
**Why it matters:** anyone automating against Speculos (the recommended way to develop without hardware) will hit this, and the empty error gives no hint that the cause is timing.
**Fix:** populate `originalError` for this class, and document that automation must wait on `requiredUserInteraction` before driving the UI.
**Status:** confirmed · not filed

### D-016 · Speculos `POST /automation` cannot express a two-button press correctly
**Observed:** the native `POST /button/both {action:"press-and-release"}` works. The same gesture in an automation rule must be four `["button",1|2,true|false]` events, and the app reacts to the leading lone left-press as "previous" — an EIP-712 review walks *backwards* into `Reject message` and the signature is cancelled.
**Impact:** automation looks like the supported way to script a device and silently does the wrong thing on any confirm screen. We abandoned it and drive `/button/both` directly.
**Fix:** add a `both` button action (or a press-combination primitive) to the automation schema, or document that confirmations must be driven via the button endpoint.
**Also:** an automation rule with neither `text` nor `regexp` matches the idle home screen too, walking the device into the `App settings → App info → Quit app` carousel. `Quit app` + a confirm kills the app. Worth a warning in the docs; guard such rules with `conditions`.
**Status:** confirmed · not filed

---

## AP4M / Mastercard hackathon (2026-10-25)

### D-017 · **Chain ID conflict between the two sponsors' docs** — would silently break signatures
**Observed:** the Ledger hackathon page states the XRPL EVM sidechain is **1440000**. AP4M's developer guide and `/public/x402-context` state **1449000**. Verified against both live RPCs: `rpc.testnet.xrplevm.org` → `0x161c28` (1449000), `rpc.xrplevm.org` → `0x15f900` (1440000). **1440000 is mainnet; the testnet everyone is told to use is 1449000.**
**Why it matters most:** `chainId` is inside the EIP-712 domain separator. A team following the Ledger page produces signatures bound to *mainnet* while believing they are on testnet — they verify locally, then fail or mean something entirely different on submission. We had this bug in our own design until we checked.
**Fix:** correct the Ledger hackathon page to 1449000 for testnet, or state both IDs with their networks explicitly. **Highest-severity doc issue found in this event.**
**Status:** confirmed against live chain · not filed

### D-018 · Auth boundary on AP4M docs is inverted — the SDK is public, the docs are not
**Observed:** `/sdk/*` (the full source: `ap4m-hackathon-sdk.js`, `ap4m-x402.mjs`, both examples, `AGENTS.md`) returns **200** unauthenticated, while `/llms.txt`, `/llms-full.txt`, `/docs/x402.md` and `/docs/api-reference.md` all return **401**. `AGENTS.md` — itself public — instructs the reader to fetch `/llms.txt` for network and contract addresses, which 401s.
**Effect:** an agent or developer following the public instructions hits a wall, and the natural next step is to read the SDK source and infer endpoints — exactly what the same file warns against ("do not guess them"). We only recovered the contract addresses because `GET /public/x402-context` happens to be public.
**Fix:** either put the guides behind the same (open) policy as `/sdk/`, or have `AGENTS.md` point at `/public/x402-context` as the unauthenticated source of truth for addresses.
**Status:** confirmed · not filed

### D-019 · Nothing in the AP4M payer validates the payment *amount*
**Observed:** `buyResource` checks `accepts.length`, resource URL, scheme, network, asset, `payTo` and `extra.ledger` — a good list — but never checks the amount against a cap. The channel cap is the only ceiling, and it is per-channel, not per-call.
**Not a bug:** the SDK is a primitive, and the x402-XRPL guidance says policy is a separate layer. Logged because it is the precise gap this project fills, and worth stating in the guide so teams do not assume they are protected.
**Fix (suggestion):** note in the guide that a 402 challenge is remote input choosing fields of a transaction the agent will sign, and that per-call value caps are the integrator's responsibility.
**Status:** confirmed · by design · worth a doc note

### D-020 · The voucher's cumulative total is derived from a merchant-supplied field
**Observed, in SDK source:** `buildX402PaymentPayload` computes the amount the agent signs for as

```js
const expected = BigInt(accepted.extra.acceptedCumulativeAmount);  // merchant-supplied
const maximum  = expected + BigInt(accepted.amount);               // what gets signed
```

`extra.acceptedCumulativeAmount` arrives inside the merchant's own 402 challenge. Vouchers are **cumulative per channel**, so a merchant that overstates it gets a voucher signed at a higher running total and collects the difference on redemption — without ever quoting a price above the agreed one. The per-call `amount` can look entirely correct while the signed figure is inflated.
**Why the SDK cannot fix this alone:** it has no record of what the channel has actually paid, so it has nothing to compare the claim against. The payer is stateless by design.
**Our mitigation (two layers):** the Guard denies with `CUMULATIVE_MISMATCH` when the merchant's claim disagrees with our own committed total (`src/guard/index.js`), and the payer re-checks the figure the SDK actually signed against the spend ledger's reservation before the request leaves the process (`CUMULATIVE_DISAGREEMENT`, `src/payer/index.js`). Covered by `src/payer/payer.test.mjs`.
**Fix (suggestion):** say plainly in the x402 guide that `acceptedCumulativeAmount` is untrusted remote input and that an integrator holding its own channel state must compare before signing. This is a sharper edge than D-019: the amount check everyone would think to write does not catch it.
**Status:** confirmed from SDK source and exercised against a local merchant · not filed

### D-021 · A payment needs *two* typed-data signatures, which no document says
**Expected:** one voucher signature per payment — that is what the Voucher struct and the `/docs` prose suggest.
**Observed:** `buildX402PaymentPayload` asks the signer for two: the cumulative `Voucher`, and an `X402ResourceBinding(bytes32 resourceDigest, bytes32 voucherDigest)` under a *different* EIP-712 domain (`"AP4M x402 Resource Binding"`). Hand-building the payload with only `voucher` + `agentSignature` fails at encode time with `payment payload is missing a field` — which names no field.
**Time lost:** ~25 min, entirely in reading `dist/x402.js` to find out what the missing field was.
**Why it matters beyond the error message:** for anyone putting a **hardware** signer behind this, the signature count is the design constraint. Two device prompts per payment would make unattended operation impossible, so you need to know up front that the resource binding is signed by the agent's software key and that only the spend *envelope* is the human's to sign.
**Fix:** document the two signatures and their domains; and make the encoder's error name the missing field.
**Status:** confirmed · not filed

### D-022 · `X402SettlementResponse` validation is strict, and that is a feature worth advertising
**Observed:** `encodeX402PaymentResponse` rejects a receipt that merely says `{success: true}` — the `extensions.ap4m` block must carry `channelId`, `voucherDigest`, `channelPayout`, `maximumAmount`, `actualAmount`, `acceptedCumulativeAmount`, `claimStatus`, `statusReference` and `reconciled`, and fixed pricing must have `actualAmount === maximumAmount`. The failure, `successful settlement response is incomplete`, again names no field.
**Why it is good:** a merchant cannot return a vague success. The receipt has to state the channel, the voucher digest and the new running total — which is exactly what a payer needs to reconcile, and what makes an audit trail possible at all.
**Fix:** advertise this in the guide as a guarantee rather than leaving integrators to discover it as a validation error, and name the missing fields in the message.
**Status:** confirmed · not filed

### D-023 · `SCHEME_UNSUPPORTED` is unreachable through the AP4M codecs
**Observed:** `encodeX402PaymentRequired` throws `scheme must be batch-settlement`, so an AP4M-encoded challenge can never advertise another x402 scheme, and `decodeX402PaymentRequired` throws before any policy layer sees it. A foreign scheme therefore surfaces as an undecodable challenge, not as a policy verdict.
**Consequence for integrators:** fine, but know where the boundary is — the codec enforces the scheme, your policy layer enforces everything else. Our Guard keeps a `SCHEME_UNSUPPORTED` code for generic (non-AP4M) x402 servers and the test asserts the codec-level refusal instead.
**Fix:** one line in the guide stating that the codec is the scheme gate.
**Status:** confirmed · not filed

### D-024 · `X-AP4M-CHANNEL-ID` is required on the *first* request, which only the example shows
**Expected:** the channel id is part of the payment, so it travels with `PAYMENT-SIGNATURE` on the retry.
**Observed:** the merchant cannot build a challenge without it — the 402 must name the channel and its accepted cumulative total — so it is needed on the **unpaid** request too. `buyResource` does send it on both (`ap4m-x402.mjs` lines 134 and 159), but nothing in the x402 prose says so, and a payer written from the header list alone gets a 402 it cannot pay.
**How we found it:** our own payer sent it only on the retry. Against a mock merchant that ignored it, everything passed. Against the real merchant it would have failed at the first call.
**Lesson worth passing on:** a mock laxer than the real service is a trap. Ours now rejects a request without the header, so the gap cannot reappear.
**Fix:** list `X-AP4M-CHANNEL-ID` as a required request header on both requests in the x402 doc, beside `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`.
**Status:** confirmed · not filed

### D-025 · `acceptedCumulativeAmount` can legitimately run ahead of on-chain `redeemed`
**Observed, during the first live payment:** the merchant's challenge claimed `0.15 RLUSD` accepted on a channel our fresh spend ledger thought was empty, and our Guard refused with `CUMULATIVE_MISMATCH` — correctly, since a payer that cannot account for a channel's history will sign a voucher at the wrong running total.
**What it actually was:** earlier vouchers on that channel, accepted and redeemed. On-chain `redeemed` read back as the same `0.15`, so the two agreed once we reconciled from the contract. But the two figures are **not** the same thing in general: the facilitator's accepted total can lead the redeemed total, and nothing in the docs says which one a payer should hold.
**Why it matters:** this is the one piece of state an integrator must get from the chain rather than the challenge, and it is the difference between a cap that works and one that is silently off by the channel's history.
**Fix:** state in the x402 guide that a payer resuming on an existing channel must reconcile from `channels(channelId).redeemed`, give the `getChannelState` ABI there (today it is only inside `ap4m-hackathon-sdk.js`), and say explicitly how accepted relates to redeemed.
**Our handling:** `src/payer/gate-c.mjs` reads the PaymentLedger at startup and reconciles; a challenge still claiming more requires an explicit `--accept-claimed` and is bounded by the channel cap. Reconciliation is a startup decision, printed; never a silent per-payment default.
**Status:** confirmed live on chain 1449000 · not filed

### D-026 · `bytes32` paginates readably; a URL does not wrap on a word boundary
**Observed, signing the Grant on device:** a `bytes32` renders as `mandateId (1/2)` then `(2/2)` — the app paginates long values and labels the pages, which is better than the "two screens of unexplained hex" we assumed when designing the Mandate (D-012). A `string` holding a URL is **not** paginated the same way: `resource | http://127.0.0.1:57141/ | resource` splits mid-path, with no page markers.
**Design consequence we acted on:** `bytes32` is acceptable for machine-binding fields a human is not expected to read, since the device at least tells them there is more. For fields the human *must* read, keep them short — `MAX_RESOURCE_CHARS = 64` in `src/mandate/grant.js` is enforced at build time, with the reason in a comment, so a long resource fails in a test rather than on a stranger's device screen.
**Fix (suggestion for Ledger):** document the pagination behaviour per field type in the Clear Signing guide. Field typing is a security decision and the rendering rules are the only way to make it an informed one.
**Status:** measured on app-ethereum 1.23.0 (nanox) · not filed

### D-027 · The context module reaches the network on every unregistered sign, and says so twice
**Observed:** each `signTypedData` on an unregistered contract logs `Direct gated descriptor lookup failed and proxy resolution failed`, with both a `directError` and a `proxyError`, and makes two HTTP attempts before falling back to blind signing. The signature then succeeds normally.
**Why it is worth a note:** it is noise that reads like a failure — on a first run it is the loudest thing in the log while everything is in fact fine — and it is latency on a path that is otherwise local. For an agent signing repeatedly it is two failed network calls per payment.
**Fix:** downgrade the message to debug when the fallback succeeds, or let the caller declare "unregistered, do not look" and skip the lookups. Either would make the first-run experience markedly less alarming.
**Status:** confirmed, benign · not filed

### D-028 · A device screen gives no way to tell a data field from a prompt
**What happened:** our Speculos driver decided "is this screen asking me to approve?" by testing the screen text for `/approve|accept|confirm|…/`. That worked for a dozen runs — until a struct appeared with a field named **`approver`**. The label contains "approve", so a data screen was read as an approval button, two-button press meant *skip the message* rather than *yes*, and the review stalled until the signer timed out 120 seconds later.
**Why it is a DX finding and not just our bug:** `/events` returns rendered text and nothing else. There is no screen *kind*, no "this is a confirmation" flag, no distinction between a field being displayed and a decision being requested. Every automated test harness for a Ledger app must therefore guess from text, and every such guess is one unlucky field name away from being wrong — silently, and in the direction of pressing buttons the human did not intend.
**Our fix:** `name | value` is a field screen and is never a confirmation; the device's own prompts are matched anchored to the start of the screen; the blind-signing warning is handled explicitly. Also, the screen at the moment of failure is now attached to the error, because the symptom (a 120s timeout) was nowhere near the cause.
**Fix (suggestion for Speculos):** add a screen kind or a "waiting for user decision" flag to the `/events` payload. It costs little and removes an entire class of silent misdrive from everyone's test harness.
**Status:** confirmed, cost ~40 min · not filed

### D-029 · `--test-force-exit` trips a libuv assertion on Windows
**Observed:** `node --test --test-force-exit` on a suite that opens and closes HTTP servers prints `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76` and marks the FILE as failed — after every test in it has passed. Without the flag the same suite exits cleanly.
**Why it matters:** the failure is reported against the test file with no diagnostic, so it reads as "your tests are broken" when they are green. We nearly went looking for a bug in the code under test.
**Fix:** we dropped the flag; it was only there as insurance against a hung handle, and the suite does not need it. Worth a note in the Node test-runner docs that the flag can race handle teardown on Windows.
**Status:** confirmed on Node 24.14.0, Windows 11 · not filed

### D-030 · A fail-closed revocation check does not fail closed on the next call — it fails closed when the cached read expires
**Expected:** killing the registry read mid-run would stop the very next payment with `REVOCATION_UNKNOWN`. That is how we had described the control, in the README table and out loud.
**Observed:** it kept paying. Correctly: a successful read had cached "not revoked", and `maxStaleMs` (15s) had not elapsed, so the checker returned `source: cached` and the Guard allowed. Our own design, working exactly as written — and not what the sentence "fails closed" had led us to picture.
**Why it matters:** the honest claim is narrower than the slogan, and the difference is a 15-second window in which a revoked mandate still spends. The injection scene would have *looked* right either way: break the RPC, watch something refuse. We would have been demonstrating a control with the wrong story attached to it, and a judge who asked "so what happens in the first second?" would have got a wrong answer from us.
**Fix:** the scene advances an injected clock past `maxStaleMs` rather than only breaking the read, and the test asserts `detail.ageMs > detail.maxStaleMs` — so it pins down *why* the payment stopped, not just that it did. The README's revocation table already stated the freshness window; the scene now matches it.
**Lesson, and it is general:** a fail-closed control with a cache has two failure modes — "cannot read" and "read too old" — and a demo that only exercises the second while narrating the first is a demo that tests the cache, not the control.
**Status:** confirmed · our design, not a vendor bug · not filed

### D-031 · `PayoutBindingLimitExceeded` is undocumented, and you only learn it after a transaction has landed
**Expected:** asking for a seventh channel would be refused up front, or granted.
**Observed:** `POST /channel-requests/prepare` returned a vault call, the agent sent it (tx `0x62cfbaf9…`, block 9231414, status 1 — real gas spent), the service recorded the request, and then polling reported `requested` eleven times over ~26 seconds before ending at `failed: bindRequestedPayout failed: PayoutBindingLimitExceeded`. No limit is stated anywhere in the participant docs, and the error names neither the limit nor what is consuming it (six payout bindings to one merchant, four of them on channels long since closed).
**Why it matters:** the failure costs a landed on-chain transaction and half a minute before it tells you anything, and it is unrecoverable by retrying — the only remedy is to use an existing channel. A team that discovers this during a demo window has no path forward. Closed channels apparently do not release their binding, which is the part worth documenting most.
**Fix:** state the per-merchant binding limit; reject at `prepare` time, before the client spends gas; say in the error how many bindings exist and whether closing a channel frees one.
**Status:** confirmed live against `hackathon.ap4m.build` 2026-10-25 · not filed — **the sharpest service-side gap we hit**

### D-032 · Cumulative vouchers make a channel single-writer, and the race fails with an error that explains nothing
**Observed:** with a second payer live on the same channel and the same agent key, our voucher for cumulative 0.294744 was already stale by the time the merchant redeemed it. The chain said `transaction execution reverted`; the SDK turned that into `Error: Merchant redemption transaction does not match payment`, and the x402 layer reported `{"error":"payment_pending_or_unavailable","retrySamePayment":true}` — advice that is actively wrong, because retrying the same payment can never succeed once a higher total is redeemed. Nothing in the chain mentioned a cumulative total, a channel, or a concurrent writer. Separately, `decodeHeader` throws `TypeError: Cannot read properties of null (reading 'length')` when a response simply has no `PAYMENT-REQUIRED` header, which sends you looking for a bug in your own decoder.
**Why it matters:** "one writer per channel" is a hard architectural constraint of cumulative vouchers, and it is nowhere in the docs. The observable symptom — an intermittent revert under load — looks exactly like a flaky RPC, so a team will spend hours on the wrong thing. We did, until we read the channel's `redeemed` figure twice and watched it move with nothing of ours running.
**Fix:** say that a channel admits one payer process; have the merchant compare the voucher's cumulative amount against the channel's redeemed figure and return *that*; drop `retrySamePayment` for this case; and name the missing header in `decodeHeader`.
**Fix on our side:** `src/payer/choose-channel.mjs` samples `redeemed` twice before a run and refuses when it moves, and a merchant rejection now re-reads the channel and reports "the channel moved under us" with both figures. Recorded as a live instance of ARCHITECTURE §7 T5, which until now was a theoretical residual.
**Status:** confirmed live on chain 1449000 2026-10-25 · not filed

### D-033 · The merchant's state lock survives a crash, so one failed run breaks every later one
**Observed:** `createX402Merchant` takes a lock on its state directory and holds it until `close()`. Any unhandled error below that point — ours was the `decodeHeader` TypeError in D-032 — exits the process with the lock still on disk. Every subsequent run then dies at startup with `merchant.lock exists: another Merchant is using this state directory`, naming a process that does not exist. Two runs were lost to this before the cause was obvious; the message does at least say which file to delete, and that `merchant.sqlite` must be left alone.
**Why it matters:** the failure is one step removed from its cause, and it arrives at the next run — so the error you are debugging is not the error you have. On a demo machine it reads as "the merchant is broken".
**Fix:** release the lock on process exit (`process.on("exit")`), or record the owning pid in the lock and ignore a lock whose process is gone.
**Fix on our side:** `gate-c` now releases the merchant on `uncaughtException`, `unhandledRejection`, `SIGINT` and `SIGTERM`, not only on the happy path.
**Status:** confirmed 2026-10-25 · not filed — small, self-contained PR to `ap4m-x402.mjs`

---

## Live entries

> Append below as they happen. Keep them specific; "docs were confusing" scores nothing.

<!-- template
### D-0NN · <one-line title>
**Expected:**
**Observed:**
**Page:**
**Time lost:**
**Fix:**
**Status:** confirmed / unconfirmed · filed <link> / not filed
-->

---

## Time-savers for future integrators

Collect the things that would have saved an hour. These are bonus-scored.

- *(fill in as you go)*

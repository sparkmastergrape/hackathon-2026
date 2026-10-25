# DX log — Ledger docs & SDK experience

Judged as much as the code, on every track. **Write entries at the moment of friction**, not at the end — the detail that makes an entry useful is gone twenty minutes later.

Format per entry: what I expected → what happened → exact doc URL → screenshot → proposed fix. A filed issue or PR is worth more than a note here; link it.

---

## Candidates spotted before writing any code

Pre-seeded from reading the docs. **Each needs confirming against the live page before submission** — a doc may have been fixed since.

### D-001 · XRP signer: wrong derivation path in `signTransaction` docs
**Expected:** XRP examples use coin type 144 (`44'/144'/...`).
**Observed (unconfirmed):** the `signTransaction` text appears to show a Bitcoin-style path.
**Page:** `/docs/device-interaction/dmk-ts/references/signers/xrp`
**Fix:** correct the path in the sample. Low effort, high confusion cost for a first-time integrator.
**Status:** unconfirmed · not filed

### D-002 · DMK `connect` examples inconsistent: `{deviceId}` vs `{device}`
**Expected:** one consistent shape across pages.
**Observed (unconfirmed):** both forms appear; `{device}` seems correct.
**Page:** `/docs/device-interaction/dmk-ts/integration/how_to/dmk`
**Fix:** make consistent, or document both if both are valid.
**Status:** unconfirmed · not filed

### D-003 · `executeDeviceAction` sample key-name mismatch
**Page:** as above.
**Status:** unconfirmed · not filed

### D-004 · XRP signer does not document supported tx types or serialization format
**Impact:** an integrator cannot tell what will work without reading `app-xrp` source or trial-and-error on a device. This is the single largest gap for anyone building XRPL tooling on the DMK.
**Fix:** a supported-transaction-type table, and a statement of whether the app signs the raw serialization or the hash-prefixed signing form.
**Status:** unconfirmed · not filed

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

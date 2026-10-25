# Build plan — Mandate

Companion to [ARCHITECTURE.md](ARCHITECTURE.md). Read that first; this document is only *sequence, gates and cuts*.

**Clock.** The event is a 36-hour sprint, Oct 24–25 2026. Hours below are **relative to when you start (H+0)**, not wall-clock — anchor them the moment you begin and write the real times into the Gate table. If you are starting late, cut from the bottom of §2 immediately rather than compressing the early hours; the early hours are the ones that de-risk everything after.

---

## 1. The one rule

**The demo is the deliverable.** Every hour either moves a working, runnable demo forward or it is cut. Judging explicitly rewards "a working demo that can be run, not slides" and "a rough prototype that fills a real gap beats a polished rebuild". Act accordingly: ugly and working beats elegant and half-wired, every time.

---

## 2. Scope ladder

Build strictly top-down. Do not start a tier until the one above it runs end to end.

### Tier 0 — Spike · ✅ **DONE, GATE A PASSED** (2026-10-24)
Ran headless on Speculos (app-ethereum 1.23.0, nanox) — no hardware needed.
- DMK connect via the Speculos transport ✅
- `getAddress` → `0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D` ✅
- `signTypedData` on the production Mandate struct, signature **recovers to the device address** ✅
- Every device screen captured; it changed the struct design (ARCHITECTURE §5.1, §5.2) ✅

Reproduce: `npm run speculos:up && npm run gate-a` (exit 0 = passed). Also `npm test` for the no-device round-trip.
Outputs: 5 DX findings (DX-LOG D-009…D-013), two of them PR-worthy.

### Tier 1 — Must ship (this is the prize submission)
1. ~~Mandate types + EIP-712 hashing + signature verification~~ ✅ `src/mandate`
2. ~~Guard: verdict function — ALLOW / ESCALATE / DENY, with reasons~~ ✅ `src/guard`
3. ~~Spend Ledger: reserve → commit/release, aggregate + rate windows~~ ✅ `src/ledger-spend`
4. AP4M payer wrapper — **✅ built and proven without funds** (`src/payer`), one real RLUSD payment on chain 1449000 still to go.
   The whole path runs against a local merchant that speaks the real wire format via `@ap4m/sdk`'s own codecs: 402 → Guard verdict → reserve → two typed-data signatures → retry → commit. 13 tests, including 40 consecutive unattended payments, a cap that stops the agent dead, a redirected payee that never reaches ALLOW, and a merchant inflating the channel's running total. Opening the channel is now the only unproven step.
5. Approver UI: issue a mandate on device; resolve an escalation on device.
6. End-to-end: agent makes many auto-paid calls under one mandate, then hits one that escalates and blocks for the device.

### Tier 2 — Should ship (materially raises the score)
7. Revocation registry contract + device-signed revoke, with the Guard failing closed.
8. Receipt chain view: trace → invoice → tx hash → mandate → signature.
9. Prompt-injection demo scene: the attack that fails.
10. ~~Library packaging + README~~ ✅ `src/README.md` (Tier 2 item pulled forward)

### Tier 3 — Could ship (only if Tier 2 is done and tested)
11. **Custom ERC-7730 context module** via `SignerEthBuilder.withContextModule()`, serving our own descriptor so the Mandate clear-signs without Ledger registry onboarding — removes the "Blind signing ahead" warning and labels fields in plain language (ARCHITECTURE §5.2). Highest-value Tier 3 item: it is reusable by any team with an unregistered contract, which is the "fills a real gap / library beats one-off" criterion squarely.
12. Capability broker wired to real AgentCore Identity.
13. Native XRPL escrow on the pre-release XRP signer (branch only — see ARCHITECTURE §4.3).
14. Recovery signer / revoke-all epoch.
15. Streaming or metered spend.

**Cut from the bottom, always.** A complete Tier 1 + 2 beats a ragged Tier 3.

---

## 3. Hour-by-hour

### H+0 → H+2 · Spike and decide — ✅ COMPLETE
Gate A passed on Speculos. See Tier 0 above.

> **GATE A.** ✅ PASSED — EIP-712 signing verified by signature recovery.

**Next up, and now the critical path:** confirm the AP4M 402 challenge shape, the RLUSD testnet address, and that both wallets hold gas XRP (open questions #4 and #5). These gate Gate C and nothing else can substitute for them.

### H+2 → H+6 · The library core — ✅ **DONE, GATE B PASSED**
Mandate types/hashing/verification, Guard verdict function, Spend Ledger with reservations. All pure, all unit-tested, no device and no network.

> **GATE B.** ✅ PASSED — `npm test`: **54 tests, 54 pass**, no hardware.

Shipped as `src/mandate`, `src/guard`, `src/ledger-spend`, `src/config/network.js`, with [`src/README.md`](../src/README.md). The spike now imports the library, so the thing verified on-device is the thing the library ships (Gate A re-run green against it).

Three things the AP4M discovery changed here:
- `chainId` is **1449000** (testnet), not 1440000 (mainnet) — bound into the EIP-712 domain, so this was a real bug.
- RLUSD has **18** decimals, not 6.
- Vouchers are **cumulative per channel**, so `reserve()` returns the running total; a per-payment model would silently overpay.

### H+6 → H+11 · First real payment
AP4M payer wrapper, Guard in front of it so a payment only happens on ALLOW. **Done, against a local mock merchant using the real AP4M codecs — no funds moved.** Remaining: open the channel (`requestChannel`, 5 RLUSD cap) and make one RLUSD payment on 1449000, settled, tx hash verified **on an explorer** — not from a success flag.

Three things the SDK source changed here (DX-LOG D-020…D-023):
- A payment takes **two** typed-data signatures: the cumulative `Voucher` and an `X402ResourceBinding`. Both are the agent's software key; only the Mandate is the human's. Had it been two device prompts, unattended operation would have been impossible.
- The signed cumulative total is derived from the **merchant's** `extra.acceptedCumulativeAmount`. That is a real theft vector, now covered twice: `CUMULATIVE_MISMATCH` in the Guard and `CUMULATIVE_DISAGREEMENT` in the payer.
- The AP4M codec, not the policy layer, is the scheme gate.

> **GATE C.** ✅ **PASSED** (2026-10-25) — six Guard-authorised RLUSD payments redeemed on chain **1449000**, verified by transaction receipt and by the channel's own `redeemed` total moving 0.15 → 0.21 RLUSD. Not a success flag: read back from the PaymentLedger contract.
>
> Channel `0x6d824358aa10ae33fb4ccf7deaab5e54147d4682963faeb4334518f2e26f320b` (cap 1 RLUSD, payout `0xFf9395…fcbf8`).
>
> | # | tx | block |
> | :-- | :-- | :-- |
> | 1 | `0xcc23844975ccc7cd049870f7becccd04adc67893a0953fe4c1f52f4cccace325` | 9228567 |
> | 2 | `0x8b04746b0685b2023a043bff796bb8e3ad6d2ef8cd04a6924cc789b42bb616ae` | 9228573 |
> | 3 | `0xf92d9c0d5c8bb7f511c5f05c74aee4219a105a747a656242b1d8fd8ea0c0ee32` | 9228574 |
> | 4 | `0x61f942c14ed7450f05bfdd8777bb3e6541a220c5739d6fe6c7cecafdd32585ec` | 9228575 |
> | 5 | `0xd58f441dac4d5cc953b02fda3a9c28f435302ba697c96e43ec92d457999eae98` | 9228576 |
> | 6 | `0x452198a97ae5cbb14805eb698cf794a4c66a4ea5811b1c6ee672109aed170f66` | 9228577 |
>
> The last five ran in one unattended batch under a single signed Mandate: one envelope, five payments, no human touch between them. Reproduce with `npm run gate-c -- --calls 5`.
>
> **Still to do for the full claim:** the Mandate in those runs was signed by a local approver key, not the Ledger. Gate A already proves the device signs this exact struct; joining the two is Gate D.

### H+11 → H+14 · Sleep
Not optional. A 36-hour sprint with no sleep produces hour-30 code you will spend hour-33 deleting. If the team is two or more, stagger instead.

### H+14 → H+20 · The human in the loop
Approver UI: mandate issuance on device, escalation resolution on device. Agent blocks on ESCALATE, resumes on grant, stops on DENY. Render the `requiredUserInteraction` states.

> **GATE D (H+20).** Full escalation round-trip works with the real device.

### H+20 → H+26 · Tier 2
Revocation contract + device-signed revoke (this is also the clean on-chain-transaction proof). Receipt chain view. Injection scene. Library README.

> **GATE E (H+26).** Feature freeze. Whatever is not working now is cut, not fixed.

### H+26 → H+30 · Harden and rehearse
No new features. Seed data so the demo has history to show. Run the demo script (§4) start to finish at least three times. Fix only what breaks during rehearsal.

### H+30 → H+33 · Submission
README with real tx hashes. DX log finalised into a submission-ready write-up (§5). Record a backup video of the working demo — insurance against a device or network failure on stage.

### H+33 → H+36 · Buffer
Deliberately empty. It will not stay empty.

---

## 4. Demo script (2 minutes, rehearsed)

Judges see a working run, not architecture. Order matters — open with autonomy, close with the attack.

1. **(15s) The envelope.** Human signs one mandate on the Ledger. Read the limits off the device screen aloud.
2. **(30s) Autonomy.** Agent runs. Many paid API calls settle in RLUSD. Nobody touches anything. Counter climbing on screen.
3. **(30s) The brake.** Agent attempts a call above `maxPerCall`. It **stops**. Device lights up with the specific amount and merchant. Human approves on device; the agent resumes. Then show a DENY — the agent stops and does not retry.
4. **(25s) The attack.** A poisoned document tells the agent to pay an attacker address. The Guard refuses. Show the refusal in the audit trail.
5. **(20s) The receipt.** One payment traced: prompt → tool call → invoice → tx hash on the explorer → the mandate and device signature that authorised it.

Close on one line: *remove the device and this system cannot spend at all.*

**Rehearse against a dead network once.** Know exactly what you say when the testnet stalls mid-demo.

---

## 5. DX log — start at H+0, not at H+30

Documentation feedback is judged **as much as code**, on every track. It is the cheapest marginal score in the event and the easiest to forget while debugging.

Capture at the moment of friction, in `docs/DX-LOG.md`: what you expected, what happened, the exact doc URL, a screenshot, and a proposed fix. Known candidates before you even start:

- The XRP signer docs show a Bitcoin-style derivation path in the `signTransaction` text (XRP is coin type 144). A straightforward doc bug worth filing.
- DMK connect examples use `{deviceId}` in some places and `{device}` in others.
- `executeDeviceAction` sample has a key-name mismatch.
- The XRP signer docs do not state supported transaction types or the serialization format.

Bug reports and PRs count as deliverables. If the pre-release XRP signer breaks under Tier 3 item 12, **that breakage is a result**, not a failure — write it up.

---

## 6. Risks

| Risk | Likelihood | Response |
| :-- | :-- | :-- |
| EIP-712 does not render readably on device | Medium | Fallback in ARCHITECTURE §5.2; be honest in the demo and log it as DX |
| AP4M 402 shape differs from assumptions | Medium | Confirm at H+0 in parallel with the spike; wrapper is thin by design |
| Testnet or faucet unavailable | Medium | Fund wallets early; keep the backup video |
| WebHID friction (Chromium-only, gesture, HTTPS) | Medium | Develop on localhost in Chrome from hour one; Speculos emulator as backstop |
| AgentCore integration consumes the day | **High** | It is Tier 3. Local `CredentialBroker` ships first. Do not let the secondary prize endanger the primary one |
| Scope creep into Tier 3 before Tier 2 lands | High | Gates E; cut from the bottom |
| No sleep → hour-30 code | High | Scheduled at H+11 |

---

## 7. Definition of done

- A judge can run it.
- A real Ledger signs a real mandate, and a real RLUSD transaction lands on chain 1449000 with a hash they can look up.
- The agent pays many times with no human, and provably stops when it must.
- Guard + Mandate + Spend Ledger are importable, documented and unit-tested without a device.
- The DX log is a finished write-up, not scattered notes.
- Every **(VERIFY)** in ARCHITECTURE §9 is either confirmed or openly stated as unconfirmed. Nothing is claimed that was not observed.

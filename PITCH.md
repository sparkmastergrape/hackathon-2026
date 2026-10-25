# The pitch

**This document is now allocated by the judging rubric, not by what is fun to demo.**
Photographed 24 Oct, Mastercard's "JUDGING FRAMEWORK · How teams win" slide. Subtitle:
*"Execution and trust matter as much as the idea."*

| Criterion | Weight | Where it is earned |
| :--- | ---: | :--- |
| Real-world utility | **25%** | Open, Beat 2 |
| **Trust and control** | **25%** | **Beat 1 and Beat 4** |
| Technical execution | **25%** | Beats 2, 3, and the measured facts |
| Path to production | **15%** | **Beat 6 — new** |
| Demo and story | **10%** | Open, pacing |

## The time budget, mapped to the weights

The old budget spent 45s on theatre and 0s on production readiness. That was 10% of the score
getting the most rehearsal and 15% of it getting none. The new budget:

Every number below is **counted from the spoken lines**, at 150 words per minute. They are not
estimates.

| Beat | Words | Speech | Scores |
| :--- | ---: | ---: | :--- |
| Open | 41 | 16s | utility + story |
| 1 — Delegation | 53 | 21s | trust and control |
| 2 — Unattended payment | 61 | 24s | utility + execution |
| 3 — Metered settlement | 62 | 25s | execution *(cut first)* |
| **4 — The veto** | ~115 | **45s** | **trust and control** |
| 5 — Audit | 35 | 14s | trust and control |
| **6 — Path to production** | 62 | **25s** | **path to production** |
| Close | 57 | 23s | story |
| **All seven** | | **3:13** | |

## ⚠️ Seven beats do not fit three minutes

That is the measurement, and it was worth taking. **3:13 is speech alone** — before the device
moment, the screen actions, or a single pause. A real delivery adds 15 to 20 seconds. So the
full set is a **3:30 to 3:35 talk**, not a three-minute one.

Do not solve this on stage. **The default set is six beats: drop Beat 3.**

| Set | Beats | Speech | With pauses |
| :--- | :--- | ---: | ---: |
| **Default — 3:00 slot** | Open, 1, 2, **4**, **6**, Close | 2:34 | ~2:50 |
| If the slot is 4:00 | all seven | 3:13 | ~3:30 |
| If you are behind | Open, 1, **4**, **6**, Close | 2:10 | ~2:25 |

Beat 5 goes before Beat 3 in the default set only if you are *also* over — the audit is 14
seconds and carries trust and control, which Beat 3 does not.

## Four rules that follow from the weights

1. **Say "trust and control" out loud.** Judges score against a rubric. Beat 4 is a trust and
   control beat. Name it as one. Do not make them infer it.
2. **Never cut Beat 6.** Cut Beat 3 first. Metered settlement is execution, and execution is
   already carried by Beats 2 and 4. Path to production is carried by nothing else.
3. **Stop polishing the open.** A fourth rehearsal of the open optimises 10%. Making the
   over-cap rejection reliable optimises 25%.
4. **Use their vocabulary.** Mastercard's "What a strong demo proves" slide opens with
   **CONTROL: PSP-attested identities · funded channel cap · over-cap attempt rejected.** That
   last item is Beat 4 in their own words. Say it in their words.

**Read it out loud with a timer twice.** Anything you cannot say in one breath, cut.

---

## The one-sentence close

> **We gave an AI agent a wallet it cannot empty — the spending ceiling is enforced by the
> ledger, not by our code, and the override is a human holding hardware.**

That is the sentence. It survives being quoted by a judge who was looking at their phone
during beat 3.

**If you have no device, the last clause changes** — and it is the only thing that does:

> **We gave an AI agent a wallet it cannot empty — the spending ceiling is enforced by the
> ledger, not by our code, and the override is a key the agent does not hold.**

Learn both endings. You will know which one you are saying by about 10:30 Saturday.

**Seven-word version**, for when the timer beats you:

> **An agent wallet with a ceiling consensus enforces.**

**Do not** close on "we built an x402 payment loop." Several teams will have one. The ceiling
and the veto are what nobody else will have running.

---

## Beat-by-beat narration

Layout: agent reasoning left, policy decisions centre, ledger right. One screen, no slide
deck until the close. Large fonts.

### Open — 15s · *utility 25% + story 10%*

> An AI agent with a wallet is a liability. Give it money and it can spend all of it. Give it
> none and it can't act. Nobody ships agent payments until that is solved. We built the agent
> that can't overspend.

**Cut from the old open: "Everyone building agent payments right now is picking one of those
two."** It was a claim about other teams, some of whom are in the room, and it bought nothing.
The replacement line — *nobody ships until that is solved* — is a **utility** claim instead of
a competitive one, and utility is 25%.

Then start the demo. No team intros, no agenda slide. You do not have the seconds.

### Beat 1 — Delegation — 20s · *trust and control 25%*

> This is the owner granting authority, not sending money. One signature: this agent, XRP only,
> five XRP ceiling, one hour. Mastercard calls this layer Verifiable Intent — same term, same
> structure.
>
> Nothing is spent yet. A grant is only a document. In two minutes you'll see what actually
> stops the agent, and it isn't this.

*(53 words, 21s. Was 77 words and 31s against a 20s slot.)*

On screen: the delegation object, the four fields readable. Let the ceiling land.

**Do not say the facilitator enforces this ceiling.** Measured 24 Oct against
`verifiable_intent` 0.1.0: `verify_chain` does not check constraints at all — an L3 payment of
900 against an L2 `max=500` returns `valid=True`, and only a separate `check_constraints` call
catches it. The signed mandate *declares* the ceiling; it does not impose it. What imposes it
is `SendMax` on the Check at consensus, which is beat 3. Framing the grant as a declaration is
therefore both honest and better theatre — it plants the question that beat 3 answers.

### Beat 2 — Unattended payment — 20s · *utility 25% + execution 25%*

> The agent needs market data. It calls the endpoint, gets an HTTP 402 with a price, checks
> that price against its delegation, signs a payment, retries, gets the data.
>
> Four seconds. The payment was a thousand drops and the fee was twelve — just over one
> percent. No human in the loop, and none needed, because the authority was already granted.

The last clause is the point of the whole beat. Don't rush it.

**Quote the ratio, not a dollar figure.** Twelve drops against a thousand is a fact you can
stand on in any market; "a tenth of a cent" depends on the XRP price that afternoon and a
judge may know it better than you do.

### Beat 3 — Metered settlement — 25s · *execution 25% — **cut this one first***

> Now inference, priced *up to* half an XRP. The agent doesn't pay half an XRP. It authorises
> an XRPL Check with that as the ceiling. The handler runs, burns eighteen hundred tokens,
> reports zero-point-one-eight-four.
>
> The Check cashes for zero-point-one-eight-four. And the ledger would refuse to cash it
> higher. That's pay-per-token where the cap is enforced by consensus, not by our good
> behaviour.

Show 0.5 and 0.184 side by side, large. **If you are solo and behind, this is the beat you
cut** — the decision is already made, so don't re-make it at 22:00 Saturday.

### Beat 4 — The veto — 45s · *trust and control 25% — **never cut***

This beat is the project. Everything else is setup for it. It is also the single highest-value
45 seconds in the pitch, because it is the only beat that scores the rubric's heaviest named
criterion directly.

**Open the beat by naming the criterion:**

> This next part is the trust and control story, so watch the boundary between what the agent
> does by itself and what it cannot do without me.

> Now the agent tries a twelve XRP call. Over its ceiling.
>
> Watch what it *doesn't* do. It doesn't pay. It doesn't crash. It returns
> `requires_confirmation` and waits.

*(turn to the device, hold it up to the camera)*

> I decline.
>
> Nothing moved. No transaction was ever submitted — there's nothing to reverse, because
> there was nothing to reverse. Now a legitimate one, inside the ceiling. Approve. Three
> seconds. Settled.

**Settled on 24 Oct — and settled the OTHER way. Use the strong version.**

Ledger's prize page does state *"there is still no XRPL transaction Clear Signing"* (verified
on the live page, 24 Oct — the quote is real). An earlier draft of this file inferred from it
that the screen would show an opaque hash, and told you to say so. **That inference is false
and the measurement overrides it.** app-xrp 2.8.2 under Speculos displays, screen by screen:
transaction type, account, source tag, both invoice bindings, `Amount XRP 0.001`,
`Fee XRP 0.00001`, the full destination address, the memo, then `Sign transaction?` /
`Reject transaction`. Screen dump and receipts in `LEDGER-EMULATOR.md`.

So say this:

> The device is showing the real destination and the real amount — not a hash. The owner reads
> what the agent actually asked for, and refuses it. Nothing is signed.

**Upgrade this, verified 24 Oct in the x402 run (`prove_device.py`, 17/17).** In the full
payment flow the device shows *more* than a bare Payment: **Source Tag, Invoice ID across two
screens, and the Memo** — the x402 invoice binding itself, rendered on the secure screen. So
the strongest honest sentence available to you is not about an amount:

> The device isn't just showing an amount. It's showing the invoice this payment settles —
> source tag, invoice ID, memo. The owner reads *what was bought*, on a screen the agent cannot
> draw, and refuses it.

That is a materially better claim than "a human approved a payment," and it lands directly on
**Trust and control — 25%**.

**Scope it to Payment if pressed.** We measured `Payment`. NFT, AMM, Escrow, Payment Channel
and multisig display are untested, and that is exactly where their page says it breaks. The
precise version, which is also the generous one:

> Their page says there's still no XRPL clear signing. We found the Payment path already shows
> every field a human needs — so the gap is the tooling layer above it, and the transaction
> types beyond Payment. That's where we built.

That answers their own invitation — *"find where it breaks, and extend it toward the
transaction types it does not cover yet"* — with evidence rather than an opinion, and it is a
finding rather than a correction of them.

**Why both statements are true — the one sentence that makes this unarguable.** Read
`developers.ledger.com/docs/clear-signing/overview` (24 Oct): "Clear Signing" is the name of a
specific programme built on **ERC-7730** — publisher-supplied *descriptors* in a registry, an
Ethereum standard whose stewardship went to the Ethereum Foundation in May 2026. **That page
never mentions XRP or XRPL.** So:

- **"No XRPL Clear Signing"** = no ERC-7730 descriptor coverage for XRPL. True.
- **"The device shows the destination and amount"** = app-xrp's own native field rendering.
  Also true, and measured.

They are different layers, which is why they don't collide. If a Ledger person pushes back, say
it in their vocabulary and the objection dissolves:

> I don't mean ERC-7730 — there's no descriptor coverage for XRPL, that's your page and it's
> right. I mean the XRP app renders the fields natively. Payment already shows destination and
> amount; the descriptor layer above it is the gap.

**Do not say "Ledger supports clear signing on XRPL."** Say the app displays the fields. The
distinction costs you four words and is the difference between a credible claim and one an
engineer in the room can take apart.

The previous gate on the stronger claim — wait for a Ledger mentor, *and then see it on the
screen yourself* — is met by the second half: we have seen it on the screen, repeatedly, and
the screens are recorded. The gate exists because a judge who catches an overclaim discounts
everything else you said, and Ledger staff are in the room. Clearing it by measurement is
exactly what it was for.

**The underlying lesson is worth more than this one line.** This file closed a pre-flight item
on a vendor's published sentence and then told you what the screen would show, sight unseen. A
sourced quote is not a measurement. The quote was real and the conclusion drawn from it was
still wrong.

### Beat 5 — The audit — 15s · *trust and control 25%*

> Every decision the agent made: the intent it was acting on, the policy outcome, the
> transaction hash.

*(click a hash)*

> That's the public explorer. Anyone can reconstruct every autonomous payment from the ledger,
> without asking us for logs.

**Trimmed from 25s.** The beat makes one point and the click makes it faster than the sentence
does. The ten seconds go to Beat 6.

### Beat 6 — Path to production — 25s · *path to production 15% — **NEW, never cut***

This beat did not exist. It is 15% of the score and the pitch spent nothing on it. Everything
in it is already true, so there is nothing to build — only something to say.

> Three things about production.
>
> Mainnet is a config change: `xrpl:0`, and RLUSD instead of XRP. Nothing here is
> testnet-specific.
>
> The approval gate is an interface, not a device. Same signing contract, software key or
> Ledger — so a treasury puts their own signer behind it.
>
> And it's a library, not a demo. Policy engine and signing bridge are separate from the agent.

**Then name the limits, unprompted:**

> What's not production: we've proven `Payment`. Escrow and multisig use the same path, untested
> on the device screen.

*(62 words, 25s. Measured, not estimated.)*

**Naming the gap is the beat, not a weakness in it.** Ledger's own judging bar asks for "clear
boundaries between what is automated and what a human approves," and a team that states its
untested edges is demonstrating exactly that judgement. A judge scoring *path to production*
is asking "do these people know what is left?" — so answer it before they ask.

### Close — 15s · *story 10%*

> This only works here. A ledger-enforced ceiling needs a primitive like Checks, not a contract
> we wrote at 3am. And a human veto is worthless if settlement outlasts a person's attention.
>
> We gave an AI agent a wallet it cannot empty. The ceiling is enforced by the ledger, not by
> our code, and the override is a human holding hardware.

*(57 words, 23s. The old close ran 81 words and 32s against a 15s slot. The cut line — "per-call
payments are worthless if the fee costs more than the call" — already landed in Beat 2 as the
twelve-drops ratio, so it was costing eight seconds to say something twice.)*

**Optional 15s landing — use it if the room includes Mastercard, and only then:**

> One thing worth saying: Mastercard's Agent Pay for Machines is an HTTP 402 flow where
> credentialed agents pay inside pre-authorised limits set by their principals — and they call
> the credential layer Verifiable Intent. That's the same term, and the same structure, as what
> you just watched. Ripple and t54 Labs are both named participants in it. We didn't aim at
> that. It's what you get from implementing the standard instead of inventing around it.

Do not claim an AP4M integration. There is no public sandbox; see `MVP-SCOPE.md`.

---

## Q&A — the six you will actually get

**"What stops the agent signing something outside the delegation?"**
Nothing stops it *trying*. What stops it succeeding is consensus: the `CheckCash` cannot settle
above the `SendMax` the owner signed, and no code of ours is in that path.

Give exactly that answer. **Do not add "and the facilitator verifies the delegation"** — we
measured the Verifiable Intent library and `verify_chain` returns `valid=True` for an L3
payment that exceeds its own L2 constraint. Constraint checking lives in a separate
`check_constraints` call, implements only `amount_range` and `allowed_payees`, and the
`mandate.payment.reference` field is required by verification yet enforced by nothing — a wrong
`conditional_transaction_id` still reports `satisfied=True`, and it appears in `checked` rather
than `skipped`, so nothing looks unverified.

Frank He is a t54 founding engineer and the AP4M engineers are in the room. They may well know
this. Claiming two independent refusals when there is one, and crediting the layer they wrote,
is the single worst thing you could do in that exchange. One refusal rooted in consensus is a
stronger claim than two where the second is decorative — and if they ask whether we checked, we
can say we measured it.

**"Couldn't the merchant just overcharge on the metered call?"**
Only up to the ceiling the payer authorised, and the payer picked that number. Above it the
`CheckCash` fails at consensus.

**"Is the facilitator trusted?"**
It verifies and submits. It never holds the key and never signs. If it vanishes mid-flow the
worst case is a payment the payer signed and nobody submitted — which is why the client pins
`max_value` and `max_fee_drops` before it signs anything.

**"What did you build this weekend versus before?"**
Answer it straight and short. Everything demoed was built in the window; what you brought was
knowledge of the SDK, not code. Have the commit history open in a tab. *Do not volunteer this
unprompted* — but do not fumble it either.

**"Why not just use a smart contract?"**
XRPL doesn't need one for this, which is the point. Checks and multi-signing are ledger
primitives — audited by consensus for years, not by us overnight.

**"Does this work on mainnet?"**
Same code, network `xrpl:0`, and RLUSD instead of XRP for anyone who wants a stable unit.
Nothing in the design is testnet-specific. **This is now Beat 6 — if they ask it, you were too
quiet in the pitch.**

**"How did you find the Ledger developer experience?"** — *expect this one, and have it ready.*

Ledger judges documentation feedback **as much as code**. You have five measured findings, not
opinions. Lead with the two that cost real time:

1. **`signTransaction` returns canonical DER, not `{r, s, v}`.** The reference page says
   `{r, s, v}`. A caller who believes it re-encodes a signature that was already correct.
2. **`getAddress` returned a 33-byte compressed key**, where the docs describe an uncompressed
   one. XRPL needs compressed, so the doc sends you to write a fold that is not needed.
3. **The derivation path example uses coin type `0'`** — Bitcoin. XRP is `144'`.
4. **The Speculos transport README imports `@ledgerhq/device-transport-speculos`**, which does
   not exist. The real package has `-kit-` in it.
5. **DMK 1.11.0's ESM build fails** with `ERR_UNSUPPORTED_DIR_IMPORT`. The CJS build is fine.

Offer them as a gift, not a complaint: *"I kept a log while building — happy to send it or open
PRs."* Each one is a `Protocol Innovation` submission in its own right, because that track says
outright that bug reports and PRs count.

---

## ⚠️ Speculos replaces the multisign fallback — Ledger said so from the stage

**Do not build the multisign fallback.** Ledger's own slide, *"Build on Ledger without a
device"*, photographed 24 Oct:

> If you don't have a Ledger device, Speculos emulates a Ledger running the real XRP app, so you
> can develop without one.

```
docker pull ghcr.io/ledgerhq/speculos:latest
cd xrpl-hackathon/speculos
./run-speculos.sh stax
```

```js
import { DeviceManagementKitBuilder, DeviceModelId } from "@ledgerhq/device-management-kit";
import { speculosTransportFactory } from "@ledgerhq/device-transport-kit-speculos";

const dmk = new DeviceManagementKitBuilder()
  .addTransport(speculosTransportFactory("http://127.0.0.1:5000", false, DeviceModelId.STAX))
  .build();
```

**And their judging slide settles that it counts.** *"What we like"* — the same bar across all
three tracks — says: *"Signs on a Ledger device **or on Speculos**, against mainnet, testnet or
the EVM sidechain."* So Speculos is not a lesser path they tolerate. It is a named, accepted one.

**What this changes:**

- The whole device-or-multisign dilemma is gone. Speculos runs **the real XRP app** through the
  **real DMK signer kit** — same `SignerXrpBuilder`, same `signTransaction`, same signature →
  `TxnSignature` assembly. (The signer returns **canonical DER**, not `{r,s}`; measured.)
  Swapping to borrowed hardware later is a transport change and nothing more:
  `speculosTransportFactory` → `webHidTransportFactory`.
- **Beat 4's narration gets stronger, not weaker.** You are no longer apologising for a missing
  device; you are showing the Ledger signing flow, on the emulator Ledger told you to use.
- ⚠️ **Their own warning, repeat it if asked:** *"Never use a real seed or real funds on
  Speculos. Its seed sits in plain text on your machine: use test seeds and testnet only."*
  Saying that unprompted demonstrates exactly the trust-and-control judgement worth 25%.

**Beat 4, Speculos version — say this at the device moment:**

> This is a Ledger Stax running the real XRP app under Speculos, Ledger's emulator — the same
> signer kit and the same approval flow as the hardware. I decline. The transaction is never
> signed and never submitted. Nothing moved.
>
> And it is showing me the real destination and the real amount, not a hash. On hardware this
> is a physical button press; here it's the emulator Ledger gave us. What this proves is that
> signing is gated behind an approval the agent cannot give itself — and that the owner can see
> what they're refusing.

**The close is unchanged in substance.** Use the key variant: *"the override is a key the agent
does not hold."* If you do end up on borrowed hardware, switch back to *"a human holding
hardware."*

### The multisign version — keep it, demote it

Below is the multisign narration. **It is now the second fallback, not the first** — use it only
if Docker won't cooperate. Speculos is strictly better for scoring, because Ledger-as-trust-layer
is what both of their bounty tracks are asking for and multisign is not Ledger at all.

### What changes

**Beat 1** becomes:

> This is the owner granting authority, not sending money. The agent's account carries a signer
> list: the agent can propose a payment, but anything over its ceiling needs a second key to
> co-sign. The policy and the ceiling are the same object as before — what changes is who holds
> the second factor.

**Beat 4** becomes:

> The agent tries a twelve XRP call. Over its ceiling. It doesn't pay and it doesn't crash — it
> returns `requires_confirmation` and waits for a co-signature.
>
> I decline: the second key never signs, and the transaction is never submitted. Nothing moved.
> Now a legitimate one — the approver key co-signs, and the ledger accepts it because the signer
> list says it can.

**Then say this, out loud, unprompted:**

> To be straight with you: this proves a second key had to approve, not that a human read the
> transaction. With a hardware signer behind the same interface it's the stronger claim — the
> approval gate is an interface, and the signer is swappable. We didn't have the device.

Naming the limit before a judge finds it costs you fifteen seconds and buys you the room. A
demo that implies hardware it never had costs you everything.

**The close changes by one clause**, not by its argument: "the override is a key the agent does
not hold" in place of "a human holding hardware." The ceiling claim — the load-bearing half —
was never about the device at all. The ledger enforces it either way, which is exactly why this
version still works.

### One technical point worth making in Q&A

The facilitator was not documented as accepting multi-signed transactions. A multi-signed blob
carries `SigningPubKey: ""` and a `Signers` array instead of a `TxnSignature`, so a verifier
written for the single-signed case would reject it. **It accepts them** — verified against the
live testnet facilitator. If anyone asks whether multi-signing works with x402 on XRPL, that is
a concrete, checkable answer, and most people in the room will not know it.

---

## What to cut, by remaining time

Decide now; do not decide on stage.

**Cut by weight, not by running order.** The old table dropped beats from the back, which now
means dropping *path to production* — 15% — to keep *metered settlement*, which scores a
criterion two other beats already cover. Cut from the middle instead.

| If you have | Give | What you are protecting |
| :--- | :--- | :--- |
| 4 minutes | All seven beats (3:13 speech) | everything |
| **3 minutes** | **Open, 1, 2, 4, 6, Close** | trust 25% + production 15% intact |
| 2 minutes | Open, 1, **4**, **6**, Close | the two heaviest criteria only |
| 60 seconds | Open, **4**, one line of **6**, close | trust 25%, then a nod at 15% |

**Beats 4 and 6 are never cut.** At 60 seconds, Beat 6 compresses to one sentence and still
scores: *"Mainnet is a config change — `xrpl:0` and RLUSD — and the signer behind the approval
gate is swappable."*

If you are mid-sentence when time is called, stop and say the one-sentence close.

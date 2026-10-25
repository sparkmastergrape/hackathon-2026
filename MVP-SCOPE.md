# MVP scope — XRPL hackathon, 24–25 Oct 2026

Agentic Finance track. Written after reading the `x402-xrpl` v0.3.4 source, the T54 scheme docs, the XRPL amendment status and the official hackathon page.

## Confirmed, and corrected, from the official page

**Confirmed:** Oct 24–25 2026 at **Apella, New York, NY 10016**. Four tracks exactly as described — Agentic Finance, Lending & Borrowing, Protocol Innovation, Why Not. The Lending track's own blurb says "before it goes live", which matches the amendment status below.

**Corrected:**

- **It is 26.5 hours, not 36.** See the timeline below. This is the single most important fact on this page.
- **Agentic Finance is backed by XRPL Commons, the XRPL Foundation and Ripple** — not Mastercard. Mastercard, Quicknode, AWS and Ledger are *separate, stackable* partner prizes with their own requirements.
- **Prizes are now published — $46,000 total, and the splits are live** (checked 23 Oct, the day before). See "The money" below. The single most important thing on that page: **Ledger's $10,000 is split three ways and one of the three is its own Agentic Finance prize.**
- **t54.ai is a mentor and judge**, not a sponsor with a bounty. Listed alongside Ripple, the XRPL Foundation, Mastercard, Ledger, Quicknode, AWS, Evernorth and Soil. Building on their facilitator means its authors are in the room — and possibly scoring you.

## THE RULE THAT GOVERNS PRE-BUILDING

From the Luma page, verbatim:

> Already building? Bring an existing project, AI app, or startup and use the 36 hours to ship a new feature on XRP Ledger. **Only what you build during the hackathon counts toward judging.**

So nothing is disqualifying. Bringing prior code is explicitly invited. But **pre-built code does not count toward your score**, which inverts the pre-Saturday strategy: anything you build in advance is work donated to a bucket the judges ignore.

What this means in practice:

- **Preparation that is not project code is free and unlimited.** Reading docs, writing notes and skills, funding testnet wallets, installing dependencies, pairing the Ledger device, choosing the architecture, rehearsing the pitch. None of that is a submission artifact.
- **The demo's spine must be written during the window.** The payment loop, the policy gate, the device integration, the UI — those are the judged surface. Build them Saturday.
- **A throwaway spike is still worth doing**, because what transfers is knowledge, and knowledge is not code. `xrpl-x402-demo/` exists to prove the stack works and to find the traps. Its value is the gotcha list in its README, not its 200 lines. Re-typing those lines on Saturday with the traps already mapped takes about 90 minutes instead of a day.

**Treat `xrpl-x402-demo/` as a spike. Do not submit it. Rebuild it during the window.**

The platform T&Cs (§5) require submissions to meet "the specific hackathon's originality requirements" and defer to event rules; the Luma line above is the only published statement of those. If anything hinges on it, confirm at the opening session — and note the T&Cs were last updated 12 Oct 2026, so they may change.

**Today, Wed Oct 21, 11:00 AM – 1:00 PM EDT: Online Workshops.** There is one past session with a replay available. Watch it.

## Partner resources worth raiding

- **Ledger** — *XRP Signer*, **Ledger for Agents**, Earn Integration. "Ledger for Agents" is precisely the trust layer in this plan; read it before writing any device code.
- **AWS** — Amazon Bedrock AgentCore (managed agent runtime + memory), the **Strands Agents SDK**, and an **AgentCore Payments Workshop**. An agent-payments workshop from a partner offering its own prize is the cheapest bounty on the board.
- **Mastercard** — Mastercard MCP, **Agentpay**, AP4M. $6,000, and the only requirement published is **filling their form**: `https://form.mastercard.com/jfe/form/SV_ewCgmPZvQhIzx8G`
- **Quicknode** — XRPL and XRPL-EVM endpoints, Streams, Webhooks. Swapping the public testnet RPC for a Quicknode endpoint is a one-line change that may qualify for their prize.

## The money — verified 23 Oct, and it reshapes the plan

**$46,000 total.** The rule for this project, in JD's words: *Agentic Finance is the plan;
everything else is a byproduct or along the path as an added bonus.* That rule is right, and
the published splits make it pay better than expected.

| Pool | Amount | On the path? |
| :--- | ---: | :--- |
| **Agentic Finance track** (XRPL Commons, XRPL Foundation, Ripple) | **$6,000** | The target |
| **Ledger → Agentic Finance** | **$3,000** | **Not a byproduct — the same build, scored twice** |
| **Mastercard** | **$6,000** | Fill a form. No build requirement published |
| **Quicknode** | **$3,000** | A one-line RPC swap. Must join their track |
| AWS → Agentic Finance | $2,000 | Criteria literally say "Coming soon" — ignore until they don't |
| Ledger → Protocol Innovation | $4,000 | Off-path for the demo, but see below |

**$18,000 is reachable without changing the build at all.** That is the whole point of the
rule: nothing in that list asks you to build a different thing.

### Ledger's Agentic Finance prize describes this project almost verbatim

Their own words, $3,000:

> Build across the full agentic stack with Ledger as the trust layer … We want projects where
> device-backed security is central: agents that pay for tools and services, human-in-the-loop
> approvals for sensitive actions …

And their example directions include *"agents that pay for APIs, tools, or services with
Ledger-secured flows, **including x402-style pay-per-use patterns**"* and *"human-in-the-loop
agents where Ledger approves high-risk actions before funds move."*

That is beat 2 and beat 4. So the device is not a bounty-chasing detour bolted onto an
Agentic Finance project — **it is the trust layer of the Agentic Finance project, and Ledger
pays separately for it.** Which makes tonight's loaner ask worth more than it looked
yesterday, and makes the multisign fallback the thing that costs you $3,000 rather than the
thing that saves the demo.

### Clear signing: the emulator answered it, and the answer is the opposite

**Corrected 24 Oct.** This section previously closed pre-flight item 5 on the strength of
Ledger's page saying *"there is still no XRPL transaction Clear Signing"* — a real quote,
verified on the live page — and concluded the device screen would be opaque. **Measurement
says otherwise.** app-xrp 2.8.2 under Speculos shows transaction type, account, source tag,
both invoice bindings, the amount as "XRP 0.001", the full destination address and the memo
before offering an explicit refusal. Receipts and screen dump in `LEDGER-EMULATOR.md`.

Item 5 is now settled **by observation, with a device** (emulated). A published sentence from
a vendor is evidence about their tooling and documentation; it is not a measurement of what
their app draws on screen, and this section treated it as one. Scope the claim to `Payment` —
NFT, AMM, Escrow and multisig display are untested, and their page says that is where it
breaks.

The "known ecosystem gap" framing still works, just pointed at the right gap: the missing
piece is the type-aware layer above the signer kit, not the device's screen.

### The one byproduct worth 30 minutes

Ledger's Protocol Innovation prize ($4,000) says plainly: *"Put the brand-new
`device-signer-kit-xrp` to work. It's pre-release only, so integrate it into a real app, find
where it breaks … **Bug reports and PRs count.**"*

You already have one finding in hand: their XRP signer doc gives the derivation path as
`m/44'/0'/0'/0/0`, which is Bitcoin's coin type, not XRP's `144'`. Filing that — plus anything
the signer does badly when you integrate it — is a real submission against a $4,000 pool for
about half an hour, using work the demo produces anyway. **Do it only once beats 1, 2, 4 and 5
are working**, never before.

### The one thing to refuse

**AWS Bedrock AgentCore.** $2,000, criteria unpublished ("Coming soon"), and qualifying
plausibly means hosting the agent on a different runtime. That is not a byproduct, it is a
rewrite of the thing the demo is about, for the smallest pool on the board. Skip it.

## The pitch

**An AI agent with a wallet, a spending ceiling it cannot exceed, and a human veto rooted in hardware.**

One sentence for the judges: *we implemented x402's own trust model end to end — delegated authority, metered settlement, hardware approval — and none of it is our invention, which is why it works.*

## What changed after reading the source

Three things the SDK already has, which most teams will not know about. Building on them is faster *and* more differentiated than inventing around them.

**1. `upto` — metered billing on XRPL Checks.** The `exact` scheme presigns a Payment for a known price. The `upto` scheme quotes a *ceiling*: the payer signs a `CheckCreate` with `SendMax` = ceiling, the handler runs and reports what it actually consumed, the merchant signs a `CheckCash` for that metered amount, and the facilitator submits it. **The ledger refuses to cash above `SendMax`** — the spending cap is enforced by consensus, not by the merchant's good behaviour. This is pay-per-token for AI inference, on-chain, today.

**2. Verifiable Intent L1–L3.** The protocol already specifies delegated agent authority: L1 a credential, **L2 an owner-signed delegation carrying `spendingCeiling` / `allowedAssets` / `allowedChains` / `validitySeconds`**, L3 the agent-signed final action. The spending policy I was going to design is already a signed, verifiable object the facilitator checks before settling.

**3. A first-class human-approval seam.** `confirmation_mode` on the payer, returning `status="requires_confirmation"` with a `confirmation_request`, and `status="declined"` as a normal outcome. The pause point for a hardware approval is already in the control flow.

So the build is not "bolt safety onto x402". It is **"nobody has shipped x402's trust model with a hardware root and a UI you can watch"** — and that is a far better demo than a payment loop.

## Two additions worth making

**Quicknode WebSocket confirmation instead of polling.** Subscribe to the merchant account
(`{"command":"subscribe","accounts":["r..."]}`) over a Quicknode XRPL WebSocket endpoint and
watch settlement arrive, rather than polling `tx` in a loop. The stream distinguishes the two
states for you: an unvalidated message has no `meta` and carries `ledger_current_index`, while
a validated one has `validated: true`, `meta`, `ledger_hash` and `ledger_index`.

That is both better engineering and a better visual — the audit pane can show *proposed →
validated* in real time instead of a spinner. It is also the correct way to use Quicknode,
which is their prize's whole point. Swapping the public testnet endpoint for a Quicknode one
is a config change.

(Quicknode **Streams** is the other product — a managed filter-to-database pipeline for bulk
history. Overkill for confirming one payment, but the right tool if the audit pane should show
historical agent spend rather than just this session's.)

**Allowlist new destinations, not just amounts.** A threshold alone is a weak policy: an agent
paying 0.001 XRP to an address it has never seen is more suspicious than paying 2 XRP to one it
pays hourly. Make the rule *"over the ceiling **or** to an unknown destination → human
approval"*. It is one extra condition and it makes the policy engine look considered rather
than arbitrary.

## Mastercard AP4M — verified, and much stronger than it looked

Researched 21 Oct 2026 by reading Mastercard's own pages. Everything below is quoted or
paraphrased from them, not inferred.

### There is no AP4M developer portal

`developer.mastercard.com/ai/` exists and lists the **Mastercard MCP Server (Agentic
Toolkit)**, Smart API Discovery, PCLO and an Open Finance URL generator. **AP4M is not on
it.** There is no sandbox, no OpenAPI spec, no reference implementation published anywhere.

What exists instead is a **marketing page plus a lead-capture form**:

- Product page — `mastercard.com/us/en/business/artificial-intelligence/mastercard-agent-pay/agent-pay-for-machines.html`
- Early access form — `ap4m.build/info` **is genuine**; it 302s to a Mastercard page titled
  *"Agent Pay for Machines – Early Access"*

### What early access actually involves

The form asks for first name, last name, business email, job title, organisation and
location, plus a marketing-consent checkbox. That is all. No technical questionnaire, no
repository, no use-case description.

Mastercard's own disclaimer, verbatim: *"Mastercard Agent Pay for Machines is still in a
pilot and not available commercially. Sign up is for access to this pilot program."* The
product page's only call to action is **"Contact your Mastercard representative to learn
more."**

**Conclusion: fill the form today — it costs two minutes — but there is no realistic chance
of sandbox credentials arriving before Saturday.** Treat an AP4M integration as impossible
and the *protocol-alignment argument* as the actual prize path. That argument does not
depend on access at all.

### AP4M is x402. Mastercard says so themselves.

From the early-access page, their own description:

> AP4M is Mastercard's payment infrastructure that enables AI agents to make machine-to-machine
> payments over HTTP. An AI agent … can pay for API access, data feeds, compute resources, or
> other metered services by presenting a cryptographically signed payment voucher in response
> to an **HTTP 402 Payment Required** challenge issued by a merchant server.

That sentence describes the loop already proven on testnet in this session. They continue:
the flow *"removes the need for OAuth redirects, checkout experiences, and manual approval
steps"* and agents *"operate within pre-authorized spending limits … defined by their Agent
Principals."*

**"Pre-authorised spending limits defined by their Agent Principals" is the L2 delegation.**
Same concept, their vocabulary.

### The mapping — four pillars, four things already built

Mastercard names four capabilities. The marketing page calls them Discover / Authorize /
Execute / Settle; the June 10 press release calls them Credentialing / Permissioning /
Transacting / Settling. They are the same four.

| AP4M capability | Mastercard's description | This project's implementation |
| :--- | :--- | :--- |
| **Discover / Credentialing** | "Network-issued credentials to establish trust"; every agent credentialed, and with **Verifiable Intent** can transact across ecosystems | `x402_xrpl.vi` — the **Verifiable Intent** chain: L1 credential, L2 owner delegation, L3 agent action. *Their term, in the SDK, already.* |
| **Authorize / Permissioning** | "Agent permissions and spending limits are defined upfront to bound authority" | L2 `spendingCeiling`, `allowedAssets`, `allowedChains`, `validitySeconds`; client caps `max_value` / `max_fee_drops`; the `upto` ceiling enforced by the ledger itself |
| **Execute / Transacting** | "Off-chain cryptographic verification to support high-frequency transactions at machine speed" | The facilitator verifies a presigned blob off-ledger before anything is submitted — `/verify` then `/settle`, which is exactly this split |
| **Settle / Settling** | "Settlement guarantee for preferred currencies, format, and payment rails", explicitly including stablecoins | XRPL settlement in XRP or RLUSD, 3–5 second finality, every payment invoice-bound by `InvoiceID` + Memo |

### Why this is a pitch slide rather than a footnote

Mastercard's named early participants include **Ripple** and **t54 Labs** — alongside Coinbase,
Cloudflare, Stripe, Adyen, OKX, Polygon and the Solana Foundation. Coinbase's quote in the
press release names *"open standards like x402"* directly.

So: **t54 Labs wrote the facilitator this project runs on and are mentors/judges in the room.
Ripple co-hosts the hackathon. Both are AP4M participants.** The alignment is not a
coincidence to be claimed — it is the same people building the same primitives. The SDK's
Verifiable Intent module is where AP4M's credentialing layer meets XRPL.

**The line for the pitch:**

> Mastercard's Agent Pay for Machines is an HTTP 402 flow where credentialed agents pay within
> pre-authorised limits set by their principals. That is this, on the XRP Ledger — using the
> same Verifiable Intent vocabulary, in an SDK written by one of their own named participants.

Say it in one breath, point at the audit table, and move on. It needs no sandbox, no API key,
and no claim you cannot back.


## Demo — five beats, about three minutes

The whole thing is one screen: agent reasoning on the left, ledger transactions on the right, policy decisions in the middle.

1. **Delegation.** Owner signs an L2 delegation on the Ledger device: this agent, XRP only, ceiling 5 XRP, valid one hour. Device screen visible on camera. *Nothing has been spent yet — this is the grant of authority.* The delegation **declares** the ceiling; it does not enforce it (measured — see `PITCH.md` beat 1). Enforcement is `SendMax` at consensus, in beat 3. Narrate it that way round.
2. **Cheap call, unattended.** Agent needs market data, hits the endpoint, gets 402, checks the request against its delegation, pays 0.001 XRP, retries, gets the data. ~4 seconds, fee ~0.000012 XRP. No human touched it.
3. **Metered call.** Agent calls an inference endpoint priced `upto` 0.5 XRP. It authorises a Check for the ceiling; the handler consumes 1,840 tokens and reports 0.184 XRP; the `CheckCash` settles for **0.184, not 0.5**. Show both numbers side by side. *The agent authorised a ceiling and paid the truth.*
4. **The veto.** Agent tries a 12 XRP call — over the delegated ceiling. It does not pay and does not stop: `requires_confirmation`, the request goes to the Ledger device, the owner reads the real destination and amount on the device screen and **declines**. Nothing moves. Then approve a second, legitimate one and watch it settle.
5. **The audit.** One table: every decision, its `user_intent`, the policy outcome, and the tx hash. Click a hash → the explorer. *Every autonomous payment this agent made is reconstructable from the ledger.*

Beat 4 is the project. Rehearse it until it is boring.

## Stack

| Layer | Choice |
| :---- | :---- |
| Payer agent | Python 3.11+, `x402-xrpl` 0.3.4, `xrpl-py` ≥4.1 |
| Merchant | FastAPI + `require_payment`, two routes: one `exact`, one `upto` |
| Facilitator | Hosted testnet, `https://xrpl-facilitator-testnet.t54.ai` — do not build one |
| Network | Testnet `xrpl:1`, RPC `https://s.altnet.rippletest.net:51234/` |
| Hardware | Ledger device for L2 delegation signing + the approval gate |
| UI | Whatever you are fastest in. A terminal with large fonts and three panes beats a half-finished dashboard |
| Skills | `xrpl-x402` (built), `xrpl-agent-wallet`, `xrpl-payments` |

Python, not TypeScript. The TS client exists but the merchant middleware, `upto` and the VI helpers are Python-first.

## The real timeline — 26.5 hours, not 36

The event is branded as 36 hours. The published schedule is not. Official start is **Sat 10:00 AM**, final project submission is **Sun 12:30 PM EDT**: **26.5 hours wall clock**, and the first 2.5 of those are workshops. Net of meals, about **22 hours of build**.

Pitches come *after* submission (Track Pitches Sun 2:15–3:30 PM), so code freezes at 12:30 whether or not you are ready, and the lunch hour is pitch rehearsal.

| Clock | Work | Done when |
| :---- | :---- | :---- |
| **Before Saturday** | **Environment only, no project code.** Testnet wallets funded, dependencies installed into a venv, Ledger device paired with the XRP app on it, Quicknode endpoint provisioned, partner docs read, architecture decided, pitch drafted. Anything you write as project code will not count — see the rule above. | You could start typing the demo at 10:00 with zero setup left |
| Sat 10:00–12:30 | Workshops. Go — the Ledger and AWS ones are directly on your path. Code between talks. | — |
| Sat 12:30–14:00 | Team formation + lunch. Lock scope here and do not reopen it. | Scope written down |
| Sat 14:00–16:00 | Pin `network_filter`, `scheme_filter`, `max_value`, `max_fee_drops`. Break each deliberately, watch it refuse. | Four refusals demonstrated |
| Sat 16:00–17:00 | **Mentor office hours.** Bring the Ledger question. | — |
| Sat 17:00–22:00 | **Ledger device**: L2 delegation signing, then the approval gate on `requires_confirmation`. Highest-risk block. | Device screen shows a real destination |
| Sat 22:00 | **Hard decision point.** Device not working? Fall back to XRPL multisign now and say so plainly in the pitch. Do not spend the night on it. | Decision made, not deferred |
| Sat 22:30–Sun 04:00 | `upto` route + `UsageMeter`, then the three-pane UI and audit table | Ceiling and settled amount differ on screen |
| Sun 04:00–08:00 | Sleep. Yes, really. | — |
| Sun 08:30–10:00 | Breakfast. Pre-fund every account. Script every input. | — |
| Sun 10:00–11:00 | **Mentor office hours** — last chance to sanity-check the demo | — |
| Sun 11:00–12:00 | Run the demo end to end, six times. Record a video backup. | Six clean runs |
| Sun 12:00–12:30 | **Submit.** Freeze. | Submitted |
| Sun 13:00–14:00 | Lunch = pitch rehearsal | One sentence memorised |

The pre-Saturday column is still the difference between finishing and not — but it is *environment*, not code. Arrive with nothing left to install, pair, fund or decide, and the 22 hours go entirely into the judged artifact.

## Risks

- **Ledger integration is the unknown.** Five hours Saturday evening, hard stop at 22:00, then the multisign fallback. A clear-signed device screen is the bounty; an unconvincing one is worse than honest multisign. Pair the device and install the XRP app **before** Saturday — do not burn build time on USB drivers.
- **In-memory invoice store is per-process.** Run the merchant single-worker, or settlement breaks silently. Do not debug this at 2am.
- **Testnet facilitator is development-only.** Fine for the demo. Say so before a judge asks.
- **`settlement_unknown` means money may have moved.** Never re-pay on it. Handle it in code or it will surface on stage.
- **Documentation drift:** the README claims a default `sourceTag` of `804681468`; v0.3.4 injects none. Pass `source_tag=` explicitly.
- **Lending track is Devnet-only** — `SingleAssetVault` 45.71% and `LendingProtocol` 37.14% through amendment voting, neither enabled on Mainnet or Testnet. Staying out of it is the right call.

## Three things to refuse

Ideas that sound reasonable and would cost you the event.

**Never simulate the Ledger approval.** A mocked device gate in a submission judged by Ledger
is misrepresentation, and the one audience guaranteed to spot it is the one scoring it. If no
device materialises, use the multisign fallback and name it. A stated limitation costs a few
points; an implied hardware gate that does not exist costs the room's trust.

**Do not submit the payment yourself.** In x402 the payer signs and the *facilitator* submits.
A gateway that builds and submits its own XRPL payment is a bespoke paywall wearing x402's
vocabulary — it loses interoperability, the receipt, and any claim to the standard. The split
(payer signs, never submits; facilitator submits, never signs) is the security model.

**Do not rebuild what the SDK already does.** `x402-xrpl` ships the merchant middleware, the
payer session, the policy caps, the invoice binding, the confirmation seam and the metered
`upto` scheme. Re-implementing any of it by hand burns hours and produces something weaker.
The hours belong in the device gate and the UI, which is where the differentiation is.

## The close

> This only works on XRPL. A spending ceiling enforced by the ledger needs a primitive like Checks, not a smart contract we wrote at 3am. A human veto is worthless if settlement takes longer than a person's attention span. And per-call agent payments are worthless if the fee exceeds the price of the call — ours is twelve drops of fee on a thousand-drop payment — just over one percent, at any XRP price.

## Open questions

1. **Do you have a physical Ledger device for Saturday?** If not, the trust layer becomes XRPL multisign and beat 4 changes shape — still demoable, no bounty.
2. **Frontend or terminal?** Decides hours 22–28 entirely.
3. **Solo or team?** Solo means cutting beat 3 (`upto`) and shipping beats 1, 2, 4, 5 well. That is still a winning demo; a half-built five-beat demo is not. Team formation is Sat 12:30–1:00 if you want a product or finance second — on a 26-hour clock that slot is also your last cheap chance to add hands.
4. **How much are you willing to build before Saturday?** The honest answer changes everything above.

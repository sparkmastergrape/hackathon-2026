# The Ledger ask — final, for Saturday morning

> ## ⚠️ Rewritten by the 24 Oct keynote. Read this box first.
>
> **The device ask is now optional, and the 12:00 commit deadline is void.** Ledger presented
> **Speculos** — an emulator running the real XRP app — and their judging slide says outright:
> *"Signs on a Ledger device **or on Speculos**."* A borrowed device is now an upgrade, not a
> prerequisite, and **the multisign fallback should not be built at all** (see `PITCH.md`).
>
> **Ask anyway** — it costs one conversation and hardware is still the stronger demo. But ask it
> as a *nice to have*, not as the thing standing between you and a working beat 4. The script
> below is written for a dependency that no longer exists, so **change the third paragraph**:
> drop "I verified an XRPL multisign fallback on Tuesday" and say instead *"I've got Speculos
> running, so I'm not blocked — I'd just rather show the real thing."* That is a stronger
> sentence anyway: it says you followed their own guidance within hours of hearing it.
>
> **Office hours, confirmed on screen:** today 16:00–17:00, **tomorrow 10:00–11:00**.
> Mentors are in the room all weekend, and the event app takes messages.

Read this on the way in. Everything is decided; nothing below needs thinking about on the day.

**There is no pre-event channel.** Verified 23 Oct: the platform's Mentors tab is names and job
titles only — no contacts, no DMs, no Discord. Luma's "Contact the Host" reaches XRPL Commons,
not Ledger, and registration is closed. So this is an in-person ask, and **the whole advantage
is arriving at 8:30 instead of 10:00.**

**What you're asking for is worth $3,000 more than it looks.** Ledger's $10,000 splits three
ways, and one of those is its **own Agentic Finance prize** whose description is your project
almost verbatim — *"agents that pay for tools and services… human-in-the-loop approvals for
sensitive actions,"* with *"x402-style pay-per-use patterns"* named outright. You are not
asking for a favour that serves only you.

---

## The timeline

| Time | Do this |
| :--- | :--- |
| **8:30** | Doors and breakfast. **This is the ask.** Mentors are unclaimed and devices are in bags. One hour of unstructured time you will not get again |
| **10:00** | Opening. If you missed them at breakfast, ask in the gap right after |
| **12:00** | ⏰ **Commit deadline.** No device in hand → build multisign. Not a maybe |
| **16:00** | Office hours. Second chance. A device arriving now is still a swap, not a rebuild |

**The 12:00 rule is the important one.** The approval gate is behind an interface, so a device
that turns up at 16:00 still drops in. What you cannot do is *wait* — two hours spent hoping
costs you beat 4 entirely. Build the multisign path at noon and treat hardware as an upgrade.

## Who to find

Four Ledger people are on the roster. **Start with the first two — DevRel is who carries spare
hardware:**

- **Akram El Milligy** — DevRel / PM
- **Etienne Waldron** — DevRel / PM
- **Eva Mirza** — Product Manager
- **Olivier Freyssinet** — Ledger

## The ask

> I'm building on the Agentic Finance track, and it's aimed at your bounty too — an XRPL agent
> payments demo where the agent has a spending ceiling, and anything over it stops and goes to
> a Ledger device for a physical approval before funds move.
>
> My own device is a first-gen Nano S, and the DMK device table doesn't list it — no USB
> product ID — so `device-signer-kit-xrp` can't see it at all. Is there any chance you've got a
> Nano S Plus or a Flex I could borrow for the weekend? I'll hand it straight back at the
> closing ceremony.
>
> I'm not stuck without it — I verified an XRPL multisign fallback against the live facilitator
> on Tuesday, and the approval gate is behind an interface either way. But multisign proves a
> second *key* approved. A device proves a *person* did. That's the demo I'd rather give.

**Saying "it's aimed at your bounty" is not leading with the prize.** It tells them you are
building on their stack, which is exactly what they are at the event for. Asking what the
bounty pays would be leading with the prize. Don't do that.

## Why this lands

- **It's their bounty, and their track.** You are asking for the thing that makes their own
  Agentic Finance prize possible to compete for.
- **You did the homework.** Naming the missing USB product ID shows you hit a real wall rather
  than failing to read the docs. That distinction is the whole difference in how the ask lands.
- **You're demonstrably not blocked.** "I verified the fallback on Tuesday" is a different
  sentence from "I have a fallback in mind." People lend to someone already moving.
- **Bounded return.** A named return time is the difference between lending and donating.
- **The last two sentences do the work.** Stating precisely what a device buys you — a person,
  not a key — shows you understand their product's actual value. That is rarer than it should
  be, and it is the line to keep if you cut everything else.

## If they say yes — six questions, in this order

Ask the first before you take the device, not after.

1. **Confirm what the screen shows during a `Payment`** — you already know the answer, so ask
   it as a check: *"am I right that there's no XRPL clear signing yet, so the screen won't show
   the destination?"* Ledger's own prize page says *"there is still no XRPL transaction Clear
   Signing."* [PITCH.md](PITCH.md) is written for that answer. If they say something shipped
   since, **see it on the screen yourself** before changing a word of the pitch.
2. **Which model** — Nano S Plus is USB-only, no BLE.
3. **Ask them to install the XRP app before handing it over**, or do it on their Ledger Live.
4. **Does Ledger Live need to be running** while your code talks to the device, or do they
   fight over the USB interface? Your demo is a terminal app, not Ledger Live. This is the kind
   of thing that works on their desk and fails on yours.
5. **Confirm the derivation path** — you're using `44'/144'/0'/0/0`.
6. **DMK or legacy LedgerJS** — which would they rather see in a bounty submission?

Then run pre-flight items 2–6 in [PREFLIGHT.md](PREFLIGHT.md) **immediately**. Sign one testnet
Payment end to end and get `tesSUCCESS` before building anything on top of it — the
`{r,s}` → `TxnSignature` assembly is the most likely thing to break, and you want to know
inside the first hour, not at 22:00.

## If they say no, or 12:00 arrives

Say thanks, build multisign, and **say so plainly in the pitch**. The words are already written
in the fallback section of [PITCH.md](PITCH.md), including the one-clause change to the close.
The claim changes and you change with it: multisign proves *another key* approved; a device
proves *a human looked at the transaction and pressed a button*. Do not blur them.

Judges respect a named limitation. They do not respect a demo that implies hardware it never
had — and at an event where Ledger is a sponsor, somebody in that room will know.

## Worth raising regardless — and it is now prize-relevant

Ledger's **Protocol Innovation** prize ($4,000) says outright: *"integrate
`device-signer-kit-xrp` into a real app, find where it breaks… **Bug reports and PRs count.**"*
So the following is no longer just good manners, it is a second submission:

- **The doc bug, offered as a gift rather than a complaint.** Ledger's XRP signer documentation
  gives the derivation path example as `m/44'/0'/0'/0/0` — coin type `0'` is Bitcoin; XRP is
  `144'`. Say *"I wasn't sure if I was misreading this"* and let them conclude it's a bug.
  **File it properly once beats 1, 2, 4 and 5 work** — never before.
- Is `device-signer-kit-xrp` at 0.2.0 usable, or early scaffolding?
- Is there an XRPL clear-signing plugin or descriptor, and is it public?
- Any plan for XRP in Ledger Agent Intent? Today it is Ethereum and Solana only.

## On AP4M — only if they raise Mastercard first

Verified: Ledger is **not** among Mastercard's named AP4M participants, while Turnkey, Utila,
Anchorage Digital and Basis Theory are. If the conversation goes there, ask a question and
nothing more:

> Is Ledger involved in Mastercard's Agent Pay for Machines at all? I noticed a few
> key-management names in the participant list and wasn't sure where hardware fits.

Then stop talking and listen. **Do not** volunteer that they're absent, do not frame it as a
gap, and do not pitch your demo as filling it. You're asking a mentor for a favour, not briefing
them on their competitive position — and you have no idea whether they have any say in it, or
whether something unannounced is already in train.

## What not to say

- Don't ask what the bounty pays. Saying you're building for their track is fine; shopping for
  prize money is not.
- Don't say the project "needs" a device. It doesn't — you verified that.
- Don't claim clear signing works until you've seen the screen yourself.
- Don't ask for a device you intend to keep. Say the return time out loud.
- Don't open a laptop and demo at them during breakfast. Ask, get an answer, go build.

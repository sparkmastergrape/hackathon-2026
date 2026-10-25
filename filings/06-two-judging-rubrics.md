# The deck and the integration guide each present themselves as the judging criteria, and they score different things

**To:** Mastercard — AP4M
**Surfaces:**
- `https://hackathon.ap4m.build/integration-guide`, section *Judging criteria*
- `Mastercard_AP4M_XRPL_Hackathon_Workshop.pptx`, slide 17, *JUDGING FRAMEWORK — How teams win*

> **Read this before filing.** Neither rubric is wrong. Each is internally
> coherent, and the overlap between them is real. The defect is that both
> self-describe as the judging criteria, a participant has no way to tell which
> one binds, and the two lists do not score the same things. A draft that called
> either document incorrect would be refused in one reply, and would deserve to
> be. The claim here is narrower: they cannot both be the rubric at once.
>
> The deck is marked *Proprietary and Confidential*. It is quoted here only on
> the judging slide, and only back to its owner.

## What each surface says

### The integration guide

Under the heading *Judging criteria*, six named criteria, each with a question
and a paragraph. No weights. Verbatim, the criterion names and questions:

| Criterion | Question |
|---|---|
| Autonomy | "Does the agent decide and pay without human approval?" |
| Use case clarity | "Is there a real reason a machine needs to pay?" |
| On-chain proof | "Can you show a VoucherRedeemed event on the explorer?" |
| RLUSD settlement | "Does RLUSD actually reach the merchant payout address?" |
| Demo quality | "Can you run the full flow live in **3 minutes**?" |
| Creativity | "Is the use case novel or unexpected?" |

The *Autonomy* paragraph reads in full:

> "The agent must read the 402 response, choose to pay, sign and submit the
> voucher — all without a human in the loop."

The page's own framing sentence, above the fold:

> "Your challenge: wire it into a project that proves AI agents can transact
> without human approval — using RLUSD on XRPL."

### The workshop deck, slide 17

Five named criteria, each weighted. The weights total 100, so the slide presents
as a complete rubric rather than a subset:

| Criterion | Weight |
|---|---|
| Real-world utility | 25% |
| Trust and control | 25% |
| Technical execution | 25% |
| Path to production | 15% |
| Demo and story | 10% |

Plus, on the same slide: **"5-minute live demo"**.

## The gap

Mapping one to the other leaves items on both sides with no counterpart:

| Deck (weighted) | Guide (unweighted) |
|---|---|
| Real-world utility — 25% | Use case clarity |
| Technical execution — 25% | On-chain proof; RLUSD settlement |
| Demo and story — 10% | Demo quality |
| **Trust and control — 25%** | *absent* |
| **Path to production — 15%** | *absent* |
| *absent* | **Autonomy** |
| *absent* | **Creativity** |

So **40% of the deck's weight has no counterpart in the guide**, and two of the
guide's six criteria have no counterpart in the deck.

The asymmetry is not uniform. The guide makes autonomy the challenge itself — it
is the framing sentence and the first criterion — and the deck's weighted rubric
has no autonomy line at all, while weighting *Trust and control* at 25%.

### The demo length is a direct conflict

Three minutes and five minutes are not two framings of one rule. A team rehearses
to one number and cuts material to fit it.

## Why it costs more than an afternoon

A team reads one of these documents and allocates its last hours against it.

Read the guide, and the work to do is remove every human step from the payment
path, then spend what is left on a novel use case. Read the deck, and the work to
do is demonstrate controls and a path to production — 40% of the score — and
novelty is not scored at all.

Those are different projects by the evening of day one, and the divergence is
largest on exactly the question a team building a trust layer has to answer:
whether to put a human approval step anywhere near the payment. The guide says
that costs you the first criterion. The deck says control is worth a quarter of
the score. A participant reading either one alone cannot see the other's claim.

The reconciliation we settled on — a human authorizes the funded channel, the
agent pays autonomously inside it — is consistent with both, and with slide 8
("Admin and platform complete one-time setup through channel opening; Agent signs
each payment"). That reading is available, but neither rubric states it, and we
arrived at it only after reading both documents and the deck's role model.

## Suggested change

Name one rubric as binding and have the other reference it.

Either is fine, and the cheapest fix is a single line:

- On the integration guide's *Judging criteria* heading: state the weights, or
  link to the deck's rubric as authoritative.
- On the deck: point slide 17 at the guide.

Then correct whichever demo length is wrong so the two agree.

If both are intended to apply — the deck as the score sheet and the guide as
guidance on how to earn it — say so, and reconcile *Autonomy* and *Creativity*
into the weighted list so a team can see what they are worth.

## Scope

- The integration guide was read on the day of the event at
  `https://hackathon.ap4m.build/integration-guide` (HTTP 200, unauthenticated).
  Its linked references — `/docs/api-reference.md`, `/docs/x402.md` — return
  HTTP 401 without a participant session, so this filing covers only the one
  public page and does not claim what the gated documents say about judging.
- The deck quoted is the file distributed to participants,
  `Mastercard_AP4M_XRPL_Hackathon_Workshop.pptx`, 20 slides. Slide text was read
  from the package's slide XML. Criterion names, weights and the demo length are
  quoted from slide 17 only.
- We did not ask a mentor or a judge which rubric binds. That would settle it
  faster than this filing, and it is the first thing a reader should do. We are
  filing it because the next team will hit the same fork, and asking does not fix
  the documents.
- Both pages may change after the day of the event.

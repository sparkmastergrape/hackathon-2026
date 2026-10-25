# The replay beat — a signed mandate that does not stop a replay

Two scripts. Neither touches the network, writes outside this folder, or holds
key material. Safe to run on a demo machine.

## The finding

`mandate.payment.reference` is **required by `verify_chain` and enforced by
nothing.** A Verifiable Intent chain whose L3 names a transaction the owner never
authorised verifies clean:

- `verify_chain` returns `valid=True`
- `check_constraints` returns `satisfied=True`, no violations
- `checked` lists `mandate.payment.reference`; `skipped` is **empty**

So a caller auditing `skipped` to find its blind spots will not find this one.

Enforcement has to come from the ledger. The credential layer does not provide it.

## Scripts

| File | What it is |
| :--- | :--- |
| `vi-replay-fixture.py` | The beat. Two **fully signed** L1/L2/L3 chains differing only in the L3 `transaction_id`. Writes a JSON artifact for the display to read. |
| `vi-reference-gap.py` | The ten-second Q&A fallback. Three cases against `check_constraints` directly, no signing. |

Case **B** in `vi-reference-gap.py` is a control, and it earns its place: the same
checker on the same call *does* refuse an over-cap payment. So the replay passing
is not "the checker does nothing".

## Running

Both take the library directory as argv[1]:

    py -I vi-replay-fixture.py <lib-dir> [out.json]
    py -I vi-reference-gap.py  <lib-dir>

To create `<lib-dir>`:

    py -m pip install --target <lib-dir> verifiable-intent x402-xrpl

**Keep `<lib-dir>` short.** pycryptodome fails to load its native module on a
deep Windows path with `[WinError 206] The filename or extension is too long`.
`C:/Users/JD/AppData/Local/Temp/vis` works.

## These scripts assert, and the asserts were mutation-tested

Each script fails loudly if the library changes under it, rather than narrating a
gap that has closed. Both guards were tested by deliberately breaking them:

- Degenerate fixture (replay reuses the granted id) → `replay used the granted id;
  not a replay`, exit 1.
- Simulated library fix (patched so only a mismatched reference is refused) →
  `check_constraints now refuses the replay — the finding is stale`, exit 1. The
  honest case still passed under that patch, so the guard is specific.
- Control removed (cap raised so case B no longer exceeds it) → `the amount cap
  stopped being enforced; the control is dead`, exit 1.

**If either script exits non-zero, do not run the beat.** Read the message first.

## What is NOT here

What refuses the replay **on-ledger**. That is the payoff and it is not in this
folder. These scripts only establish that the mandate does not stop it.

> `vi-replay-fixture.json` and `vi-replay-fixture-agent-audit.json` are both **generated**
> **output**, not source. Run the script to
> produce it; do not commit it.

---

## The on-ledger half — measured on testnet

The beat needs an answer to "so what stops it?". Here is what the XRPL docs
actually say, separated from what they only imply.

### What the agent cannot do

The replay is not a resubmitted transaction. The agent builds a **new** L3 naming
a transaction the owner never authorised. So the question is not "does replay
protection catch it" — it is "can the agent manufacture spending authority?"

It cannot, and this is the load-bearing point:

**Verified.** A Check's `Account` is its creator, and the CheckID is derived from
"the AccountID of the sender of the CheckCreate transaction". The owner creates
the Check. The agent cannot create one on the owner's behalf.

**Verified.** "Only the `Destination` address of a check can cash it with a
CheckCash transaction." Any other sender gets `tecNO_PERMISSION`.

**Verified.** `SendMax` on the Check caps what can ever be drawn. Consensus
refuses a `CheckCash` above it.

**Verified.** "This reserve is freed up when the check is cashed or canceled."
A reserve is only freed when the ledger entry leaves the ledger, so a cashed
Check is removed.

**Verified.** `tecNO_ENTRY` is the result "the CheckID doesn't exist in the
ledger."

### Measured, not inferred — `replay_probe.py`, four attempts on testnet

Run by the x402 session. Every row is an observed result, which replaces the
prediction this README carried before.

| Attempt | Result |
| :--- | :--- |
| A. the same signed `Payment`, submitted twice | `tefPAST_SEQ` |
| B. a **new** `Payment` reusing the **same** `InvoiceID` | **`tesSUCCESS`** |
| C. the same signed `CheckCash`, submitted twice | `tefPAST_SEQ` |
| D. a **new** `CheckCash` against an already-cashed Check | **`tecNO_ENTRY`** |

**D confirms it.** Cashing deletes the Check object, so a second cash finds
nothing. That is the beat's payoff, and it is the same consensus story as the
`SendMax` ceiling in a second register.

D in full, so it can be checked on-ledger rather than taken on trust:

1. `CheckCreate`, `SendMax` 5000 drops → `tesSUCCESS`
2. `CheckCash` for 1840 against CheckID
   `BEBF50C55C275B9D04D08510D293B8D2E5355C57BCD5B518217306FB120F0827` → `tesSUCCESS`
3. a new `CheckCash` against that same CheckID → **`tecNO_ENTRY`**

The docs' silence was real — neither the CheckCash page nor the Check ledger-entry
page states that a successful cash deletes the entry. It does.

**B kills the tempting shortcut.** XRPL does not enforce `InvoiceID` uniqueness.
A second payment carrying an identical `InvoiceID` settles normally.

### Wire the beat to D. And do NOT fuse the two halves.

The scripts in this folder and the result in D are **two separate statements, not
one causal chain**:

1. The mandate does not catch the replay.
2. The ledger stops the second settlement because the Check is gone.

The two chains in `vi-replay-fixture.py` differ in `conditional_transaction_id`,
which is a **credential-layer field the ledger never sees.** The ledger refuses D
because an *object was consumed* — not because it noticed a mismatched reference.

So saying "the ledger caught the replayed reference" would be a brand-new
unfounded claim, of exactly the kind that was cut from the pitch. Say the two
statements separately. If any narration draft claims the invoice or the mandate
reference was refused on-ledger, cut it.

### The sentence the beat is reaching for

Two sentences, deliberately not joined by "so":

> The mandate says the agent may spend. It does not stop the agent spending
> elsewhere — we have the signed chains to show that.
>
> And spending authority on XRPL is an object the owner creates, capped by
> `SendMax`, cashable once, by one named party. The agent cannot mint that.

Same shape as the ceiling argument — enforcement lives on the ledger, not in the
credential. But the second sentence is not the ledger *detecting* the first. Keep
them adjacent and let the audience draw the line; do not draw it for them with a
causal claim that is not true.

### The trap next door: InvoiceID does not stop a replay

Flagged by the x402 session, and worth stating because it is the same failure mode
as the VI ceiling claim. There are **two** different "replays" and the ledger
refuses only one:

| What | Does the ledger refuse it? |
| :--- | :--- |
| Re-submitting the **same signed transaction** | **Yes.** The Sequence number is already consumed → `tefPAST_SEQ`. Measured, A and C. |
| A **new** transaction reusing the same `InvoiceID` | **No.** XRPL does not enforce `InvoiceID` uniqueness → `tesSUCCESS`. Measured, B. |

So "the replayed mandate is refused by the ledger" is **false** if what is being
demonstrated is invoice reuse. Pick the mechanism deliberately — sequence
exhaustion, or Check consumption — and say which one.

Both rows are now observed results rather than reasoning, which is why this table
is safe to narrate from. The earlier draft of this section said neither had been
measured; that is out of date.

### Other files here

`vi-chain-fixture-generator.py` is the earlier script that first proved a full
L1/L2/L3 chain builds and verifies, and that `verify_chain` ignores constraints.
Superseded by `vi-replay-fixture.py` for the beat; kept because it is the original
measurement. `INVENTORY-dnsmoney-ucap-faistack-hackathons.md` is a working
inventory of this project's scattered surfaces, not build code.

## Two output files, on purpose

`vi-replay-fixture.py` writes both:

| File | Schema | For |
| :--- | :--- | :--- |
| `vi-replay-fixture.json` | `vi-replay-fixture/0.1-provisional` | full detail, including serialized L3s |
| `vi-replay-fixture-agent-audit.json` | `agent-audit/1` | the shared envelope the display pane reads |

Two version strings that can mismatch loudly beat one that quietly drifts.

Three rules of `agent-audit/1` that this emitter obeys deliberately:

1. **`outcome` reports whether the call returned a verdict, not whether we like
   it.** The replay case is `ok`, because it verified. Marking it `refused` would
   put our opinion in the data and the pane would render it as fact.
2. **No event here is stage `replay_refused`.** That stage belongs to the ledger
   event alone (`actor: "ledger"`, `tx_result: "tecNO_ENTRY"`). The credential
   layer does not refuse the replay — that is the finding. Naming a credential
   event `replay_refused` would rebuild the fused causal claim in the data.
3. **`evidence` is mandatory on a refusal.** Nothing here refuses, but every
   event carries `measured` anyway, because all of it is observed.

Note on units: the schema originally had `amount_drops` / `ceiling_drops`. Those
chains are USD-denominated card payments, not XRP, so the amounts go in `detail`
as `amount_usd_cents` / `cap_usd_cents` with `asset: "USD"`. Forcing cents into a
field named drops would be wrong in a way nothing downstream could detect.

## `validate-agent-audit.py` — the constraint at read time

    py -I validate-agent-audit.py <file.json> [more.json ...]

Exits non-zero on any error, errors on stdout, so the display side can shell out
to it instead of trusting every producer to have obeyed the spec.

**The rule worth the whole file:** stage `replay_refused` requires
`actor: "ledger"`.

The credential layer does not refuse a replayed mandate — that is the finding. A
credential-actor event carrying that stage would assert *in data* that the mandate
caught something it did not, which is the fused causal claim this project removed
from its pitch twice. The check makes it unrepresentable rather than discouraged.

The rule is **actor-scoped, not a ban on the stage.** The ledger event legitimately
uses it with `tx_result: "tecNO_ENTRY"`.

**`EVENT-SCHEMA.md` (device session) is the authority for the rules, not this
file.** All eight are written up there as a Validation rules section, with rule 8
in the actor-scoped form and a note saying the blanket form is wrong and why. This
script is named there as the reference implementation.

So the list is deliberately not repeated here. Two prose copies of one rule set
drift, and a confident claim inherited from a document that looked authoritative
is the failure this project hit three times in a day. Read the spec; run this.

The script also checks required fields, RFC 3339 UTC timestamps, the `outcome` and
`actor` sets, one-line summaries, `evidence` on refusals, and the unit rules. One
advisory rather than an error: a ledger-actor event with no `tx_hash`, since the
envelope's `network` groups events and does not establish that any of them touched
that chain.

### Mutation-tested, eight cases

| Case | Expected | Result |
| :--- | :--- | :--- |
| credential event with stage `replay_refused` | fail | caught |
| **ledger** event with stage `replay_refused` | **pass** | passes |
| `amount` as a JSON number | fail | caught |
| `amount` without `unit` | fail | caught |
| `outcome: refused` without `evidence` | fail | caught |
| summary with a trailing full stop | fail | caught |
| `unit: "satoshi"` | fail | caught |
| ledger event with no `tx_hash` | warn only | warns, exit 0 |

The second row is the one that matters as much as the first. A blanket ban on the
stage would have passed that test for the wrong reason and broken the legitimate
ledger event.

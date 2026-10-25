# The audit event schema

`agent-audit/1`. One flat event list, append-only, newest last. Beat 5 reads it
and draws a table; nothing in the demo imports anyone else's code.

Why flat rather than nested: the audit beat's whole claim is *"every autonomous
payment this agent made is reconstructable"*. A reader has to be able to scan
one column and see every decision in order. Nesting hides the thing being
demonstrated.

## Envelope

```json
{
  "schema": "agent-audit/1",
  "run_id": "2026-10-24T18:42:03Z/beat4",
  "network": "xrpl:1",
  "events": []
}
```

`network` is CAIP-2 and belongs in the envelope, not per event — a run does not
span chains. The Mastercard/RLUSD side emits `eip155:1449000` in its own file,
because the EVM work runs on testnet and testnet is chain 1449000.

**Measured, 24 Oct 2026.** `eth_chainId` against `https://rpc.testnet.xrplevm.org`
returns `0x161c28`, which is 1449000. `prep/verify_endpoints.py` holds the same
map: 1440000 is XRPL EVM **mainnet**, 1449000 is **testnet**.

**Do not write `eip155:1440000`.** Ledger's prize page names 1440000 for the
XRPL EVM sidechain, and that number is mainnet. Eligibility is satisfied by a
testnet transaction, so an envelope that declared 1440000 would state that the
run happened on mainnet. That is a false claim about where money moved, inside
an audit artifact. This is the second defect on that page, beside the signer
return type.

**The envelope's `network` groups the events; it does not assert that any of
them touched that chain.** Credential-layer events are chain-independent and
touch no ledger at all. The signal for an on-chain action is a `tx_hash`, and
the pane must not infer one from the envelope. First draft of this file was
loose about that and the VI side was right to flag it.

**Units are never implied by the chain.** `amount` is paired with `unit`, and
the first draft of this file got this wrong — it named the fields
`amount_drops` / `ceiling_drops`, which forces every track into XRP's base unit.
USD-denominated card payments then have to put cents in a field called drops,
which is a unit error no downstream reader could detect. If you have no exact
unit to name, omit `amount` rather than converting: an invented exchange rate in
an audit table is worse than a blank cell.

## Event

Every event carries these five:

| field | type | notes |
| :-- | :-- | :-- |
| `ts` | string | RFC 3339, UTC, `Z` |
| `stage` | string | see the list below |
| `outcome` | string | `ok` \| `refused` \| `unknown` \| `error` |
| `actor` | string | `agent` \| `merchant` \| `facilitator` \| `device` \| `owner` \| `ledger` \| `credential` |
| `summary` | string | one line, human-readable, no trailing full stop |

`actor` is load-bearing for the beat. The table's power comes from reading the
actor column and seeing that the refusals were not the agent's own code — so
every event must say who acted, and `ledger` and `device` must be
distinguishable from `agent`.

Then whatever of these applies, all optional:

| field | type | notes |
| :-- | :-- | :-- |
| `amount` | string | exact, expressed in `unit`. String, never a number — drops exceed float precision and a JSON number rounds silently |
| `ceiling` | string | the authorised maximum, where one exists, same `unit` |
| `unit` | string | what `amount` and `ceiling` are counted in: `drops`, `XRP`, `usd_cents`, `USD` |
| `asset` | string | `XRP`, or a currency code |
| `invoice_id` | string | ties an event to one 402 quote |
| `tx_hash` | string | uppercase hex |
| `tx_result` | string | `tesSUCCESS`, `tecNO_ENTRY`, `tefPAST_SEQ`, … |
| `explorer_url` | string | full URL, so the pane does not build one |
| `intent` | string | the agent's `user_intent`, verbatim |
| `policy` | string | which cap or filter decided it |
| `evidence` | string | `measured` \| `inferred` — **required when `outcome` is `refused`** |
| `detail` | object | anything else; never rendered as a column |

`evidence` exists because of today. A refusal shown in the audit table is a
claim about who stopped what, and if it was not observed it does not go on
screen. `inferred` renders greyed with the word visible, never silently.

## Stages

Native-XRPL payment path:

`quote` · `policy_check` · `authorize` · `device_prompt` · `device_decision` ·
`settle` · `reconcile` · `deliver`

Credential layer (chain-independent — this is the part the VI fixture emits):

`credential_verify` · `constraint_check` · `replay_attempt`

Ledger-primitive refusals:

`check_create` · `check_cash` · `replay_refused`

## For the VI fixture

Emit `credential_verify` and `constraint_check` per chain, then one
`replay_attempt`. The honest-vs-replay distinction goes in `detail`, not in
`outcome` — `outcome` is `ok` when the library returned a verdict, whatever that
verdict was, because `outcome` describes the call and not whether we approve of
the answer.

```json
{"ts":"2026-10-24T18:42:05Z","stage":"constraint_check","actor":"credential",
 "outcome":"ok","evidence":"measured",
 "summary":"replayed chain satisfies all constraints",
 "detail":{"case":"replay","satisfied":true,"violations":[],
           "checked":["mandate.payment.amount_range","mandate.payment.reference"],
           "skipped":[],"reference_matches_mandate":false}}
```

The pane reads the file. Keep your own `schema` string in your own file; the
pane maps your keys into these fields rather than asking you to restructure.

**Do not emit a `replay_refused` for the credential layer.** It does not refuse
the replay — that is the finding. `replay_refused` is for the ledger event, with
`actor: "ledger"`, and the two must not be joined by a causal claim.

## Validation rules

Enforceable, and the authority for both producers and the pane. Reference
implementation: `vi-replay/validate-agent-audit.py` (exits non-zero, errors on
stdout, so a reader can shell out rather than trust a producer). Every rule
below is mutation-tested there.

1. Every event has `ts`, `stage`, `outcome`, `actor`, `summary`.
2. `outcome` is one of `ok`, `refused`, `unknown`, `error`.
3. `actor` is one of `agent`, `merchant`, `facilitator`, `device`, `owner`,
   `ledger`, `credential`.
4. `summary` has no trailing full stop.
5. `amount` and `ceiling` are strings, never JSON numbers.
6. `amount` requires `unit`.
7. `unit` is one of `drops`, `XRP`, `usd_cents`, `USD`.
8. **Stage `replay_refused` requires `actor: "ledger"`.**

Rule 8 is actor-scoped, and the blanket form — "no event may carry
`replay_refused`" — is **wrong**: it would reject the legitimate ledger event
that is the entire payoff of the replay beat. The rule exists to stop a
credential-layer event claiming a refusal it did not perform, not to ban the
stage. A validator written the blanket way passes its own tests while silently
forbidding the one event that matters.

Advisory rather than error: an event with `actor: "ledger"` and no `tx_hash`
warns. It is legitimate — a ledger event may not have a hash yet — but the
envelope's `network` establishes nothing about what touched a chain, so an
unhashed ledger row is worth a second look.

## Worked example — the veto

```json
{"ts":"2026-10-24T18:41:58Z","stage":"quote","actor":"merchant","outcome":"ok",
 "amount":"1000","unit":"drops","asset":"XRP","invoice_id":"e3b0c442…",
 "summary":"402 challenge for /market-data"}

{"ts":"2026-10-24T18:41:58Z","stage":"policy_check","actor":"agent","outcome":"ok",
 "amount":"1000","ceiling":"5000","unit":"drops","policy":"max_value_drops",
 "intent":"fetch 7-day volatility for the risk report",
 "summary":"quote is inside the cap"}

{"ts":"2026-10-24T18:42:01Z","stage":"device_prompt","actor":"device","outcome":"ok",
 "summary":"device showed destination rMNL5bR3… and XRP 0.001"}

{"ts":"2026-10-24T18:42:09Z","stage":"device_decision","actor":"owner",
 "outcome":"refused","evidence":"measured",
 "summary":"owner refused on the device; nothing was signed"}
```

Note what the actor column says: the refusal is `owner`, on a `device`, not
`agent`. That is the beat.

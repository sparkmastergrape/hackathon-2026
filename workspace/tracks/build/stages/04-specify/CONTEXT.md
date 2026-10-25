# Stage 04 — Specify

One job: keep the audit event format that two separate codebases agree on.

## Inputs

| File | Layer | Which sections matter |
| :-- | :-- | :-- |
| `EVENT-SCHEMA.md` (repo root) | 3 | All. It is the authority. |
| `../03-prove/output/events.json` | 4 | Whether real runs satisfy it |

## Process

1. The format is `agent-audit/1`. Neither producer imports the other's code.
2. Keep the envelope and the per-event fields as the spec states them.
3. Validate before the pane draws anything. Two independent validators are
   correct. One translated validator drifts in silence.
4. A schema change needs both producers to agree. Say which producer asked.

## Outputs

| File | Format | Location |
| :-- | :-- | :-- |
| Proposed changes, with the reason | md | `output/schema-changes.md` |
| Validator results | md | `output/validation.md` |

## Audits — run before writing output

- [ ] `amount` and `ceiling` are strings, never JSON numbers. Drops exceed float
      precision and a JSON number rounds in silence.
- [ ] `amount` carries a `unit`. The chain never implies the unit.
- [ ] `evidence` is present on every event whose `outcome` is `refused`.
- [ ] Stage `replay_refused` carries `actor: "ledger"`. The blanket ban on that
      stage is wrong and would reject the one event the replay beat exists for.
- [ ] No event claims a refusal its actor did not perform.

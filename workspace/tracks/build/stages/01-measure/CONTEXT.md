# Stage 01 — Measure

One job: establish facts against live hosts and real devices, and write down
what was run.

## Inputs

| File | Layer | Which sections matter |
| :-- | :-- | :-- |
| `../../../shared/MEASURED-FACTS.md` | 3 | All. Check before measuring again. |
| `../../../_core/CONVENTIONS.md` | 3 | Rules 11 to 19, and the audit gate |
| `prep/verify_endpoints.py` (repo root) | 3 | The chain ID map |

## Process

1. Read `MEASURED-FACTS.md` first. Rule: verify once, do not re-run a passing
   check.
2. For a new fact, run the cheapest check that settles it. An RPC call beats a
   documentation page. A documentation page beats a recollection.
3. Record the command or host, the raw result and the date.
4. If the check cannot be run now, write the claim as `inferred` and name what
   would settle it. Do not leave it unmarked.

## Outputs

| File | Format | Location |
| :-- | :-- | :-- |
| New or corrected facts | md | `output/measurements.md` |
| Claims that could not be settled | md | `output/open-questions.md` |

## Audits — run before writing output

- [ ] Every fact names its host, command or device, plus the date.
- [ ] Nothing imported from another document without re-checking it here.
- [ ] Anything attributed to another session says so.

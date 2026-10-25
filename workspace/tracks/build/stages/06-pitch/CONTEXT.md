# Stage 06 — Pitch

One job: the spoken demo, allocated by judging rubric weight.

## Inputs

| File | Layer | Which sections matter |
| :-- | :-- | :-- |
| `PITCH.md` (repo root) | 3 | The beats and their rubric tags |
| `../03-prove/output/proof-run.md` | 4 | Only claims proven there may be spoken |
| `../../../shared/MEASURED-FACTS.md` | 3 | The scope limits |

## Process

1. Allocate seconds by rubric weight, not by how interesting a beat is to build.
2. Tag each beat with the criterion it serves.
3. Decide the cut order in advance, and name the beats that are never cut.
4. Write the pitch persuasively. This is the one stage where Simplified
   Technical English is the wrong register.

## Outputs

| File | Format | Location |
| :-- | :-- | :-- |
| The beat script with timings | md | `output/script.md` |
| The cut order | md | `output/cut-order.md` |

## Checkpoints

- Read it aloud against a clock before the timings are trusted. Word counts
  estimate speech badly.

## Audits — run before writing output

- [ ] No spoken claim exceeds what stage 03 proved.
- [ ] Every claim that is scoped says its scope aloud, for example "`Payment`
      only" and "emulator, not hardware".
- [ ] The ceiling is credited to the ledger, not to our code.
- [ ] A hardware veto and a second signature are not blurred together. They are
      different claims, and a judge who catches the blur discounts the rest.

# Stage 03 — verify the artifact

One job: check that the evidence says what you think it says. This stage exists
because, in the run that produced this workspace, it did not — three times.

## Inputs

| File | Layer | Which sections matter |
|---|---|---|
| `../02-measure/output/receipts.md` | 4 | Every claim about to be relied on |
| `../02-measure/output/` artifacts | 4 | The images, bytes and scripts themselves |
| `../../shared/evidence-discipline.md` | 3 | All of it |

## Process

1. **Open the artifact.** If a receipt is an image, read the image, not the note
   describing it. A description of a screenshot is not a screenshot.
2. List what the artifact actually shows, field by field. Compare that list to the
   claim. Where they differ, the claim is wrong, not the artifact.
3. **Break every assert before trusting it.** For each check a script makes,
   deliberately introduce the failure it is supposed to catch, run it, and observe
   the failure. An assert never seen to fail is decoration.
4. Record the mutation and the observed failure, not just "tested".
5. Cross-check any fact you took from someone else against what this project has
   already measured. A borrowed fact is `inferred` until you measure it yourself.
6. Mark every surviving claim `measured` or `inferred`, in the text.

## Outputs

| File | Format | Location |
|---|---|---|
| What each artifact shows, field by field | md | `output/artifact-readings.md` |
| Mutation table: assert, mutation applied, observed failure | md | `output/mutation-log.md` |
| Claims that did not survive, and why | md | `output/retracted.md` |

## Audits (run BEFORE writing output)

- [ ] Every image cited was opened and read in this stage.
- [ ] Every assert has a row in the mutation log with an observed failure.
- [ ] A control that must PASS is in the mutation table too — a rule that rejects
      its own legitimate case is worse than no rule.
- [ ] Every claim carries `measured` or `inferred`.
- [ ] Claims that did not survive are written down, not quietly dropped.

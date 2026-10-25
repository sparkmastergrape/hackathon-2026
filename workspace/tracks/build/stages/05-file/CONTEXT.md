# Stage 05 — File

One job: hand the measurements to the filing pipeline, and stop.

> **This stage does not draft filings.** `tracks/filing` does, in five
> stages, and it is the authority. Run that instead. What follows is the
> handoff contract and the standards a filing must meet, kept here so a reader
> of this workspace knows what stage 05 owes the other one.

## Inputs

| File | Layer | Which sections matter |
| :-- | :-- | :-- |
| `../01-measure/output/measurements.md` | 4 | The receipt for each defect |
| `../../../shared/MEASURED-FACTS.md` | 3 | Chain IDs, the signature, the screens |
| `../../../shared/EVIDENCE-LOG.md` | 3 | All of it, before writing a word |

## Process

1. One defect per filing. Name the page, quote it verbatim, give the receipt.
2. Order by how hard the defect is to argue with, strongest first. A wrong
   published value beats a missing one. A missing one beats an interpretation.
3. Every filing carries a Scope section naming what was not tested.
4. Say which library produced which measurement. A sponsor rewarding its current
   stack reads "we used the older library" very differently from "the current
   one was unavailable".

## Outputs

| File | Format | Location |
| :-- | :-- | :-- |
| One file per defect | md | `output/NN-slug.md` |
| Who measured what | md | `output/README.md` |

## Checkpoints

- Before any filing is sent, show JD the list and the order. Sending is his.

## Audits — run before writing output

- [ ] No filing calls a correct value an error. Check what the page actually
      says, verbatim, not what we remember it saying.
- [ ] No filing describes an exhibit that is being withheld.
- [ ] No measurement from another session appears under our name.
- [ ] Every scope limit that exists is stated, including the ones that weaken
      the filing.

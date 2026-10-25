# Sponsor defect filing workspace

Purpose: turn a thing that went wrong while building against a sponsor's published
surface into a filing that sponsor cannot refuse in one reply.

How this works: this is an ICM workspace. Stages live in numbered folders under
`stages/`. Work one stage at a time, in order. Each stage's `CONTEXT.md` is its
contract — inputs, process, outputs. Read only what the current stage needs. After
each stage, the human reviews and may edit files in that stage's `output/` before
the next stage runs.

The one rule this workspace exists to enforce: **a filing may contain a quote, or a
measurement, and nothing in between.** Every sentence is traceable to a page you
read verbatim or a receipt you produced. A conclusion one step past the evidence is
the failure mode this pipeline is built to catch — it happened three times in the
run that produced it, and each time another reader caught it, never the writer.

Mark every claim `measured` or `inferred` in the text as you write it, not
afterwards. A claim you cannot mark is a claim you do not have.

Conventions: see `_core/CONVENTIONS.md`. Config: see `_config/`.
Correction log: `shared/correction-log.md` — read it before drafting anything.

Do not skip stages or read ahead unless a stage's contract says to.

# Conventions

## Stage contract

Every `stages/NN-name/CONTEXT.md` has three required sections:

- **Inputs** — a table of files to load and which sections matter. Precision here
  is what keeps context small. Name sections, not just filenames.
- **Process** — ordered execution steps for this stage only.
- **Outputs** — artifact paths and formats written to `output/`.

Stages that produce judgment rather than fact add:

- **Checkpoints** — mid-stage points where the agent stops for steering.
- **Audits** — quality gates run *before* writing output.

## Handoff

Stage N reads from `stages/N-1/output/`. Nothing else crosses a stage boundary.
If stage N needs something stage N-2 produced, stage N-1 must pass it through.

## Evidence discipline

Each stage output carries a status per claim:

| Status | Means |
|---|---|
| `verified` | the agent observed it this run (tool output quoted) |
| `reported` | a human asserted it; no observation |
| `blocked` | attempted and failed; failure mode recorded |
| `pending` | not attempted |

A stage may not consume a `reported` input as if verified. It either verifies it
first or records that it proceeded on an unverified input.

## Gates

- Stage 03 must not run while `AGENT_PRIVATE_KEY` is absent from `.env`.
- Stage 05 must not run until stage 04 records a `verified` channel id.
- Stage 06 uses an RPC endpoint chosen by the operator, not the service's own
  verify button — independence is the point of the stage.

## Naming

Stage directories are `NN-kebab-case`, zero-padded, execution order. Outputs are
`STATE.md` for status plus named artifacts. One purpose per stage; split a stage
that does two things.

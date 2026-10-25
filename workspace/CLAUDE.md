# AP4M hackathon workspace

Purpose: build and defend one claim — an AI agent with a wallet, a spending
ceiling it cannot exceed, and a human veto rooted in hardware — and report what
broke in the sponsors' published surfaces along the way.

How this works: this is an ICM workspace. It holds **two tracks**. A track is a
numbered sequence of stages under `tracks/<name>/stages/`. Each stage's
`CONTEXT.md` is its contract: inputs, process, outputs. Work one stage at a
time, in order, and read only what that stage names.

**Run one track. Ignore the other.** The tracks share this orientation, the
conventions and `shared/`, and nothing else. Neither reads the other's stages.
Opening a track you are not running costs context and buys nothing.

| Track | Runs when | Stages |
| :-- | :-- | :-- |
| `tracks/build` | You are building, measuring or demonstrating the system | 6 |
| `tracks/filing` | A sponsor's published surface was wrong and you are reporting it | 5 |

## The one rule both tracks enforce

**Every claim is marked `measured` or `inferred`, in the text, as it is
written.** A measured claim names what was run, against what host or rig, on
what date. An inferred claim is a conclusion one step past the evidence. Both
are allowed. Confusing them is not. A claim you cannot mark is a claim you do
not have.

This is not a style preference. On 24 and 25 Oct 2026 the same error occurred
repeatedly across two agent sessions. Each time a real quote or a real number
carried a conclusion it did not support. Every one was caught by the other
reader, and none by the writer. `shared/correction-log.md` and
`shared/EVIDENCE-LOG.md` hold the cases.

## Orientation

- Start here: `setup/README.md`
- Conventions: `_core/CONVENTIONS.md`
- Config: `_config/`
- What is known: `shared/MEASURED-FACTS.md`
- What is believed, and what would settle it: `shared/INFERENCES.md`

Code lives at the repository root, not in this workspace. The workspace holds
the process and the evidence.

Do not skip stages or read ahead unless a stage's contract says to.

# Conventions

1. Stage contract: every stage `CONTEXT.md` has Inputs / Process / Outputs.
2. One job per stage. If a stage does two things, split it.
3. Handoff: a stage reads only prior stages' `output/` and its own `references/`.
4. Plain text only between stages — markdown, no binary or proprietary formats.
   Exception: `02-measure` and `03-verify-the-artifact` may carry images and
   scripts in `output/`, because the artifact *is* the evidence. Every such file is
   described in a markdown sibling.
5. Layer budgets: L0 ~800, L1 ~300, L2 ~200–500 tokens. Load only what is needed.
6. Editable intermediates: never overwrite a human's edit to an output without
   asking. The human edit is authoritative.
7. Creative stages define checkpoints (steering) and audits (gates before write).
8. Numbered folders encode order. Do not read ahead unless the contract says to.
9. Observability: system state is filesystem state. No hidden state off disk.
10. Config once: `_config/` holds run-invariant preferences; inputs vary per run.

Specific to this workspace:

11. **Claims carry a mark.** `measured` or `inferred`, written as the claim is
    written. See `shared/evidence-discipline.md`.
12. **Receipts are compared mechanically.** Never transcribe a hash, a signature or
    an address by hand, and never verify one by eye.
13. **Exhibits carry provenance.** Who produced it, on which rig, and whether it is
    theirs to release. Recorded in the stage 04 index.
14. **Release is the human's.** An exhibit withheld takes every sentence that
    describes it with it. Grep to confirm nothing references a withheld artifact.
15. **A relayed decision is not the decision.** If an instruction arrives through
    another party and its premises look stale, ask the human before acting.
16. **Secrets never reach an output.** No keys, seeds or tokens in any stage
    directory. Scan before committing, not after.

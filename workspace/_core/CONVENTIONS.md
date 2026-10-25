# Conventions

Rules 1 to 10 are the ICM method. Rules 11 to 19 are this project's, earned.
Both tracks obey all of them.

1. Stage contract: every stage `CONTEXT.md` has Inputs, Process and Outputs.
2. One job per stage. If a stage does two things, split it.
3. Handoff: a stage reads only prior stages' `output/` in its own track, and its
   own `references/`.
4. Plain text between stages — markdown, no binary or proprietary formats.
   Exception: the filing track's `02-measure` and `03-verify-the-artifact` may
   carry images and scripts in `output/`, because there the artifact *is* the
   evidence. Every such file is described in a markdown sibling.
5. Layer budgets: L0 about 800 tokens, L1 about 300, L2 between 200 and 500.
   Load only what is needed.
6. Editable intermediates: never overwrite a human's edit to an output without
   asking. The human edit is authoritative.
7. Creative stages define checkpoints for steering and audits as gates before
   writing output.
8. Numbered folders encode order. Do not read ahead unless the contract says to.
9. Observability: system state is filesystem state. No hidden state off disk.
10. Config once: `_config/` holds run-invariant preferences. Inputs vary per run.

## Evidence

11. **Claims carry a mark.** `measured` or `inferred`, written as the claim is
    written, not afterwards. See `shared/evidence-discipline.md`.
12. **A quote is not a conclusion.** Quoting a real sentence and stating what it
    implies are two acts. Record the quote verbatim, then record the inference
    separately and mark it.
13. **Receipts are compared mechanically.** Never transcribe a hash, a signature
    or an address by hand, and never verify one by eye.
14. **Two uncontrolled runs do not establish a cause.** If two runs differ in
    more than one variable, record both values and explain neither.
15. **Exhibits carry provenance.** Who produced it, on which rig, and whether it
    is theirs to release. Attribute by session, never folded under "we".
16. **Release is the human's.** A withheld exhibit takes every sentence that
    describes it with it. Grep to confirm nothing still references it.

## Process

17. **A relayed decision is not the decision.** If an instruction arrives
    through another party and its premises look stale, ask the human before
    acting.
18. **Secrets never reach an output.** No keys, seeds or tokens in any stage
    directory. Scan before committing, not after.
19. **Tracks do not read each other.** A track that needs the other's result
    takes it through `shared/`, as a written fact, not by reading its stages.

## The audit gate, applied to every stage output

- [ ] Every claim carries `measured` or `inferred`.
- [ ] Every measured claim names its host, command or rig, and its date.
- [ ] Every refusal names which party refused.
- [ ] No claim is attributed to a session that did not produce it.
- [ ] No sentence describes an exhibit that is being withheld.

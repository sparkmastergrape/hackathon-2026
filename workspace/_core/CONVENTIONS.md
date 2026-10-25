# Conventions

1. Stage contract: every stage `CONTEXT.md` has Inputs / Process / Outputs.
2. One job per stage. If a stage does two things, split it.
3. Handoff: a stage reads only prior stages' `output/` and its own `references/`.
4. Plain text only between stages — markdown and JSON, no binary formats.
5. Layer budgets: L0 ~800, L1 ~300, L2 ~200-500 tokens. Load only what is needed.
6. Editable intermediates: never overwrite a human's edit to an output without
   asking. The human edit is authoritative.
7. Creative stages define checkpoints (steering) and audits (gates before write).
8. Numbered folders encode order. Do not read ahead unless the contract says to.
9. Observability: system state = filesystem state. No hidden state off disk.
10. Config once: `_config/` holds run-invariant preferences; inputs vary per run.

Added for this workspace:

11. Secrets never enter this workspace. Keys live in the repo root `.env` only.
    An output file may name an address. It may never name a key. A key was once
    pasted into a source file here, so this rule is load-bearing.
12. A stage that spends gas or moves RLUSD says so in its first line, and stops
    for human approval before the spending step.
13. Never record a transaction as successful because a script printed success.
    Record the hash, then confirm it against the chain in stage 06. This service
    has twice thrown a transport error on `/settle` after the work succeeded.
14. Verified and assumed are different words. An output may say "assumed" with a
    reason. It may not present an assumption as a reading.
15. Amounts are cumulative. A voucher names a running total, not one payment.
    Every output that carries an amount says which of the two it means.

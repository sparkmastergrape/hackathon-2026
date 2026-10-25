# Navigation

Stages (run in order):

- `01-read-the-surface` — read the sponsor's published page or config verbatim; capture exact quotes.
- `02-measure` — reproduce the defect on a controlled rig; produce receipts.
- `03-verify-the-artifact` — open the artifact itself; break every assert before trusting it.
- `04-draft-the-filing` — quote, receipt, scope, suggested change.
- `05-review-and-release` — adversarial cross-read; reconcile; the human decides what ships.

Shared assets: `shared/` — the correction log and the evidence-discipline note.
Both are Layer 3 references, read selectively, but `shared/correction-log.md` is
read before stage 04 every time.

Config: `_config/` — sponsor targets and what each one rewards.

To run a stage: open `stages/NN-name/CONTEXT.md` and follow its contract.

Handoffs: each stage writes to its `output/`; the next stage reads it as input.
System state is filesystem state — there is no hidden state off disk.

The completed run that produced this workspace is in the repo, not here:
`filings/` (five filings plus README), `filings/evidence/` (18 device captures and
the capture script), `vi-replay/` (the fixtures and the schema validator).

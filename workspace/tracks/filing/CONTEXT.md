# Track — filing

Run this track when a sponsor's published page, config or artifact was wrong and
you are reporting it.

Stages, in order:

- `01-read-the-surface` — read the sponsor's page or config verbatim; capture
  exact quotes
- `02-measure` — reproduce the defect on a controlled rig; produce receipts
- `03-verify-the-artifact` — open the artifact itself; break every assert before
  trusting it
- `04-draft-the-filing` — quote, receipt, scope, suggested change
- `05-review-and-release` — adversarial cross-read; reconcile; the human decides
  what ships

`../../../shared/correction-log.md` is read before stage 04, every time.

The completed run that produced this track is in the repository, not here:
`filings/` holds six filings plus the index, `filings/evidence/` holds the
device captures and the capture script, and `vi-replay/` holds the fixtures and
the schema validator. Two filings are live. `filings/SUBMISSIONS.md` says which,
and what is still waiting on a human.

To run a stage: open `stages/NN-name/CONTEXT.md` and follow its contract. Write
to that stage's `output/`, then stop and let the human read it. The stopping is
the method.

Shared layers sit three levels up: `../../../shared/`, `../../../_config/`,
`../../../_core/`.

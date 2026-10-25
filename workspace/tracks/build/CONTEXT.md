# Track — build

Run this track when you are measuring a host, writing payment or device code,
proving it, changing the audit schema, or preparing the demo.

Stages, in order:

- `01-measure` — establish facts against live hosts and real devices
- `02-build` — the x402 payment path and the device signing bridge
- `03-prove` — run the proof harnesses end to end
- `04-specify` — the audit event schema two codebases agree on
- `05-file` — hand measurements to the filing track, and stop
- `06-pitch` — the spoken demo, allocated by rubric weight

Stage 01 is the spine. Stages 03, 05 and 06 all cite it. A claim that reaches
05 or 06 without a line in `01-measure/output/` is inferred, and must say so.

**Stage 05 drafts nothing.** When the work becomes a filing, leave this track
and run `tracks/filing`, which owns that pipeline end to end.

To run a stage: open `stages/NN-name/CONTEXT.md` and follow its contract. Write
to that stage's `output/`, then stop and let the human read it.

Shared layers sit three levels up: `../../../shared/`, `../../../_config/`,
`../../../_core/`.

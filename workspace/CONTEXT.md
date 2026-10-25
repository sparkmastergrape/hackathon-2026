# Navigation

Pick a track. Read that track's `CONTEXT.md`. Ignore the other one.

## `tracks/build` — the system

Run when you are measuring a host, writing payment or device code, proving it,
changing the audit schema, or preparing the demo.

- `01-measure` · `02-build` · `03-prove` · `04-specify` · `05-file` · `06-pitch`

Stage 05 is a handoff. When the work becomes a filing, leave this track and run
`tracks/filing`.

## `tracks/filing` — the sponsor defects

Run when a sponsor's published page, config or artifact was wrong and you are
reporting it.

- `01-read-the-surface` · `02-measure` · `03-verify-the-artifact` ·
  `04-draft-the-filing` · `05-review-and-release`

## What the tracks share

| Path | What it holds |
| :-- | :-- |
| `_core/CONVENTIONS.md` | The rules both tracks obey |
| `_config/build-config.md` | Networks, device, secrets, register |
| `_config/sponsor-targets.md` | Who filings go to and what each refuses |
| `shared/MEASURED-FACTS.md` | Observed facts, canonical |
| `shared/INFERENCES.md` | Beliefs, each with what would settle it |
| `shared/EVIDENCE-LOG.md` | The errors of one shape, and how each was caught |
| `shared/correction-log.md` | Ten repeating failures, with causes |
| `shared/evidence-discipline.md` | How a receipt is checked |
| `shared/completed-run.md` | The filing run that produced `filings/` |
| `shared/SESSION-RECORD-2026-10-25.md` | The build session: what is proven, what is open, what to distrust |

Both tracks have a stage named `02-measure`, and they are different stages.
Build's measures a host or a device. Filing's reproduces a defect on a
controlled rig. Name the track when you refer to either.

Handoffs: each stage writes to its own `output/`. The next stage in that track
reads it. No stage reads across tracks.

System state is filesystem state. There is no hidden state off disk.

# Starting here

## 1. Decide which track you are on

| You are… | Track |
| :-- | :-- |
| Measuring a host, writing code, proving it, preparing the demo | `tracks/build` |
| Reporting a defect in a sponsor's published surface | `tracks/filing` |

Read one track. Ignore the other. They share only the files below.

## 2. Read, in this order

1. `../CLAUDE.md` — what this workspace is for and the one rule it enforces.
2. `../CONTEXT.md` — the two tracks and what they share.
3. `../_core/CONVENTIONS.md` — rules 11 to 19 are the earned ones.
4. Your track's `CONTEXT.md`.

Then, by track:

- **build** — `../shared/MEASURED-FACTS.md` before measuring anything again.
  Verify once. Do not re-run a passing check.
- **filing** — `../shared/correction-log.md` before drafting anything. Ten
  failures with causes. It is the file that saves you a day.

Do not open the stage contracts yet. Open one when you reach that stage.

## 3. Run a stage, then stop

Work in your track's first stage. Write to its `output/`. Then stop, and let the
human read what you wrote before you open the next stage.

The stopping is the method. A pipeline that runs end to end with no human in the
middle compounds its mistakes in silence. Every mistake worth catching in this
project was caught by a second reader, and none by the writer.

## 4. Running a stage again

Stages are re-runnable. If a later stage shows an earlier one was wrong, go
back, fix the earlier `output/`, and re-run forward. Do not patch the later
stage to compensate, and do not edit a filing to agree with an artifact you have
not re-read.

## Before anything leaves this machine

- Every claim marked `measured` or `inferred`.
- Every exhibit's provenance recorded, by session.
- Every receipt verified by search, not by eye.
- No keys, seeds or tokens in any stage directory.
- The human has said which filings go and which exhibits attach.

## What lives outside this workspace

| Path | What it is |
| :-- | :-- |
| `xrpl-x402-demo/` | The Python payer, the proofs, the stand-in signer |
| `ledger-bridge/` | The Node sidecar that owns the device |
| `speculos-xrp/` | Emulator assets and device captures |
| `prep/` | Endpoint checks and testnet funding |
| `filings/` | The six filings, the evidence and `SUBMISSIONS.md` |
| `vi-replay/` | Credential fixtures and the `agent-audit/1` validator |
| `LEDGER-EMULATOR.md` | The measurement log and the numbered traps |
| `EVENT-SCHEMA.md` | The `agent-audit/1` authority |
| `PITCH.md` | The spoken script |

## Known open work

- The beat 5 audit pane is unbuilt. Beat 5 runs 15 seconds, so the pane must be
  readable at a glance. The complete log stays in the file.
- PR 2050's commit is unsigned and Ledger requires signed commits. That
  signature is the submitter's own assertion and is not an agent's to make.
- `speculos-xrp/device-screens.png` is withheld. It is named in
  `LEDGER-EMULATOR.md`. If that file is quoted into a submission, the reference
  travels with it.

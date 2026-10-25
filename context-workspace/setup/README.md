# Onboarding

You are picking up a defect-filing run against a sponsor's published surface.

## Read, in this order

1. `../CLAUDE.md` — what this workspace is for and the one rule it enforces.
2. `../CONTEXT.md` — the stage list.
3. `../shared/correction-log.md` — the failures that repeat. Ten of them, with
   causes. This is the file that saves you a day.
4. `../_config/sponsor-targets.md` — who you are filing to and what gets refused.

Do not read the stage contracts yet. Open one when you reach that stage.

## Starting a run

Work in `stages/01-read-the-surface/` and follow its `CONTEXT.md`. Write to that
stage's `output/`. Then stop, and let the human read what you wrote before you open
stage 02.

The stopping is the method. A pipeline that runs end to end without a human in the
middle is a pipeline whose mistakes compound silently — and the correction log
shows that every mistake worth catching was caught by a second reader.

## Running a stage again

Stages are re-runnable. If a later stage shows an earlier one was wrong, go back,
fix the earlier `output/`, and re-run forward. Do not patch the later stage to
compensate, and do not edit a filing to agree with an artifact you have not
re-read.

## Before anything leaves this machine

- Every exhibit's provenance recorded.
- Every receipt verified by search, not by eye.
- No keys, seeds or tokens in any stage directory.
- The human has said which filings go and which exhibits attach.

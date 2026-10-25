# AP4M Hackathon — Agent Orientation (Layer 0)

Mastercard XRPL Hackathon, Agentic Finance Challenge. Goal: an agent that pays
within a funded limit. Verified merchant, EIP-712 voucher, RLUSD settlement on
XRPL EVM.

This repo is an **Interpretable Context Workspace**: the filesystem is the
orchestration. Numbered stages under `workspace/stages/` run in order; each has a
`CONTEXT.md` contract and an `output/` directory that hands off to the next stage.

## How to work here

- Read `workspace/CONTEXT.md` (Layer 1) on entry to find the active stage.
- Load only the current stage's `CONTEXT.md` plus the inputs its table names.
  Do not preload other stages.
- Every `output/` file is an edit surface. Stop after writing one; the human
  reviews and edits before the next stage runs.
- `workspace/stages/*/output/STATE.md` is the ground truth for what is actually
  done. Distinguish **verified** (observed by the agent) from **reported**
  (asserted by the human, unconfirmed). Never promote reported to verified
  without an observation.

## Hard rules

- `AGENT_PRIVATE_KEY` and any seed live only in `.env`, which is gitignored.
  Never write a key into a stage output, a commit, or chat.
- The agent signs payments; a human authorizes the budget. Do not raise the cap
  or move funds outside the funded limit.
- Addresses and the API URL are public and belong in `workspace/shared/facts.md`.

## Stages

| # | Stage | Produces |
|---|---|---|
| 01 | participant-onboarding | wallets + budget confirmed |
| 02 | sdk-credentials | API URL, channel id, starter kit |
| 03 | agent-scaffold | runnable `ap4m-agent.js` |
| 04 | channel-open | live channel id from `requestChannel()` |
| 05 | payment-run | settled payment + receipt |
| 06 | receipt-verification | independent on-chain verification |

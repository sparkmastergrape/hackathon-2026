# Workspace Navigation (Layer 1)

Sequential pipeline. One stage per step, human review between steps.

## Active position

**Stage 01 is open.** Payout wallet reported set by the operator but not yet
observed. Stage 02 is blocked until a channel exists; see
`stages/01-participant-onboarding/output/STATE.md`.

## Map

```
stages/01-participant-onboarding/   wallets, payout, budget cap
stages/02-sdk-credentials/          API URL, channel id, starter kit download
stages/03-agent-scaffold/           ap4m-agent.js + AGENT_PRIVATE_KEY wiring
stages/04-channel-open/             requestChannel() -> live channel id
stages/05-payment-run/              EIP-712 voucher -> RLUSD settlement
stages/06-receipt-verification/     verify-receipt.mjs against own RPC
```

- `_config/factory.md` — run preferences, set once.
- `_core/CONVENTIONS.md` — stage contract shape, handoff and gate rules.
- `shared/facts.md` — public identifiers used across stages.

## Entry rule

Read the stage `CONTEXT.md`, then only the files its Inputs table names. Stop at
the stage's output and hand back for review.

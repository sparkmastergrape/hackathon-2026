# Navigation

Stages (run in order):
  01-preflight  — prove the wallets, gas, registration and service config
  02-channel    — open a funded channel with a spending cap (costs gas)
  03-x402-pay   — the HTTP 402 hot path: pay off-chain, get the resource
  04-refusals   — prove the merchant refuses a bad voucher (no funds move)
  05-settle     — redeem the held voucher on chain, settle, close (costs gas)
  06-verify     — verify settlement from chain data alone

Shared assets: `shared/` — HANDOFF.md carries session state and open edges.
Config: `_config/` — run-invariant values. Secrets stay in the repo root `.env`.

To run a stage: open `stages/NN-name/CONTEXT.md` and follow its contract.
Handoffs: each stage writes to its `output/`; the next stage reads it as input.

Stage 04 depends only on 02, not on 03. Run it before 03 if the demo should
show the controls before the payment.

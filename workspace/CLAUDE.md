# AP4M x402 demo workspace

Purpose: take an AP4M agent payment from an empty wallet to a verifiable
settlement receipt, one reviewable stage at a time.

How this works: this is an ICM workspace. Stages live in numbered folders under
`stages/`. Work one stage at a time, in order. Each stage's `CONTEXT.md` is its
contract (inputs, process, outputs). Read only what the current stage needs.
After each stage, the human reviews and may edit files in that stage's `output/`
before the next stage runs.

This workspace spends real testnet RLUSD and sends real transactions on the XRPL
EVM sidechain (chain 1449000). Stages 02 and 05 cost gas. Stages 01, 03, 04 and
06 do not move funds. A stage that would spend says so in its contract.

Every script the stages call lives in the repository root, one level up. The
scripts are the implementation; these contracts are the running order and the
review points.

Conventions: see `_core/CONVENTIONS.md`. Config: see `_config/`.
Session state and open edges: see `shared/HANDOFF.md`.

Do not skip stages or read ahead unless a stage's contract says to.

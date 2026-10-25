# Stage 01 — preflight
One job: prove the wallets, the registration and the service are ready.
Moves no funds. Costs no gas.

## Inputs
| File | Layer | Which sections matter |
|------|-------|-----------------------|
| ../../_config/run.md | 3 | the whole table |
| repo root .env | 3 | key names only, never values |

## Process
1. `node verify-wallets.mjs` from the repo root. It re-derives every address,
   checks the chain id, checks each key can sign, checks agent is not merchant,
   and checks the agent matches the portal. It prints no key.
2. `node signin-check.cjs`. A 200 proves TEAM_NAME, the agent key and the
   bearer-token flow. A 401 means the team name and the wallet did not match an
   active registration. The wallet half fails far more often than the name.
3. Read GET /public/config and compare every address against `_config/run.md`.
4. Confirm the agent wallet holds XRP. Stage 02 and stage 05 each send a
   transaction. Zero gas stops the run.

## Outputs
| File | Format | Location |
|------|--------|----------|
| preflight.md | md | output/preflight.md |

Record each address, its gas and RLUSD balance, the sign-in result, and whether
the config matched. Record a mismatch as a mismatch. Do not round a balance up
to "funded".

## Audits (run BEFORE writing output)
- [ ] No key, seed or token appears anywhere in the output.
- [ ] Every balance is a figure read this run, not one carried from a prior run.
- [ ] A 401 from sign-in is reported as blocking, not as a warning.

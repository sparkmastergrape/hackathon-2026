# Stage 03 — Agent Scaffold

Make `ap4m-agent.js` runnable without putting a key in the repo.

## Inputs

| File | Load |
|---|---|
| `../02-sdk-credentials/output/STATE.md` | starter-kit path, prefilled values |
| `../../_config/factory.md` | Key handling |

## Process

1. Read the starter kit in full. Note where it expects `AGENT_PRIVATE_KEY`.
2. Create `.env` with `AGENT_PRIVATE_KEY=`. Confirm `.env` is gitignored — the
   root `.gitignore` already covers `.env` and `.env.*` with an `.env.example`
   exception.
3. Commit a `.env.example` with the key name and an empty value. Never a real key.
4. Have the operator paste the key into `.env` themselves. Do not ask for it in
   chat and do not echo it.
5. Dry-run whatever the kit offers short of a payment, to confirm it loads the
   key and reaches the API.

## Checkpoints

- Before step 5: confirm with the operator that the dry run cannot move funds.

## Audits

- `git status` shows no `.env`. `git diff --cached` contains no key material.
- Nothing in `output/` contains a hex string long enough to be a key.

## Outputs

- `output/STATE.md` — load status, dry-run result, what remains before stage 04.

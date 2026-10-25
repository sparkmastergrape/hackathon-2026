# Handoff — state at the close of the build session

Written as data, not as instructions. Everything here was read from the chain,
the service or the filesystem during the session that built this workspace.
Where something was inferred rather than read, it says so.

## What exists

Branch `claude/ap4m-agent-js-4fec95`, pushed, head `1617daf`. It fast-forwards
into `main`. Commits, oldest first:

| Commit | What it did |
|---|---|
| ce93743 | the AP4M kit as `ap4m-agent.cjs`, plus `close-channel.cjs` and ethers |
| d913cda | payment amount defaults to 0.01 RLUSD, not 1 |
| 48ad5c3 | merge of `origin/main` |
| ea68cbc | `.env.example` documents every variable the code reads |
| 2b48f69 | `main()` exported, `run-ap4m.cjs` calls it |
| 1bae1fd | the x402 hot path: merchant, paying agent, refusal tests |
| 1617daf | redeem the held voucher, settle, close |

Scripts, with their npm names:

| Script | npm | What it does |
|---|---|---|
| ap4m-agent.cjs | `agent` | the kit loop: sign in, channel, redeem, settle, close |
| run-ap4m.cjs | — | preflight, then calls the kit loop |
| close-channel.cjs | — | lists channels, closes an open one |
| x402-merchant.cjs | `merchant` | 402 challenge, voucher verification, release |
| x402-agent.cjs | `x402` | the paying side of the hot path |
| x402-refusals.cjs | `x402:refusals` | four refusal cases |
| x402-redeem.cjs | `x402:redeem` | redeem the merchant's voucher, settle, close |

## What was verified, and how

- The plain kit loop ran end to end. Channel `0xf32e3c03…c558ba67`, 5 RLUSD cap,
  0.01 redeemed and settled, channel closed. Confirmed by reading `channels()`,
  not by trusting the script, which reported `fetch failed` on a close that had
  in fact succeeded.
- The x402 hot path ran twice on one channel, `0x69898a16…7acbc9eb`. Running
  total 0.01 then 0.02 RLUSD. On-chain `redeemed` stayed 0 throughout, which is
  the property worth demonstrating: no chain write on the payment path.
- All four refusals returned 402 with the expected reason, including a correctly
  signed voucher over the cap. That is the deck's "over-cap attempt rejected".
- The two payments redeemed as one claim, `0x7ba6bfc9…fb5f48dc`, for 0.02 RLUSD.
  Settled to the merchant payout address and the channel closed with a final
  cumulative amount of 20000000000000000.
- The receipt resolves at HTTP 200 and records the payout moving the merchant
  balance from 0.01 to 0.03 RLUSD.
- The merchant balance reconciles exactly: four inbound transfers totalling 0.05
  RLUSD, one outbound of 0.02 to `0x139E4d70…83bf30`, leaving 0.03. The outbound
  and two of the inbound were not caused by this session.

## What was not verified

- `run-ap4m.cjs` has never completed a paid run since the `main()` change. The
  preflight gates were both tested with throwaway values in an isolated
  directory. The one call from `preflight()` to `main()` was not exercised
  against the live service.
- `CHANNEL_ONLY=1` is documented in the `run-ap4m.cjs` header and read nowhere
  in the code.
- The x402 wire format follows the x402 v2 spec for its envelope, but the AP4M
  integration guide was never read: `/llms.txt` and `/docs` sit behind HTTP Basic
  auth with realm "AP4M Hackathon". If the organizers publish a voucher wire
  format, ours may differ. The EIP-712 voucher itself is certain, because it
  comes from the kit's own `signVoucher`.

## Open edges

- The scheme is named `ap4m-voucher`, deliberately not x402's `exact`. `exact`
  means a presigned XRPL `Payment` blob verified by a T54 facilitator on classic
  XRPL. This carries an EIP-712 voucher for an EVM contract. A stock x402 client
  should refuse it rather than sign the wrong thing.
- `main` is behind and its checkout is dirty with other sessions' uncommitted
  work: `.gitignore`, `package.json`, `package-lock.json` modified, plus
  `SETUP.md`, `check-rlusd.mjs`, `signin-check.cjs`, `trustset-rlusd.mjs`,
  `verify-receipt-onchain.mjs`, `verify-wallets.mjs`, `vi-replay/`, `filings/`,
  `ledger-approver/`, `receipt-trail.html`. Those three modified tracked files
  are what blocks a fast-forward. Six of the stage contracts here call scripts
  that live only in that uncommitted pile.
- Two remote branches never present locally: `claude/mcp-sdk-install-91632c` and
  `claude/xrplevm-rlusd-transfer-b3e9d0`. The second may overlap this work.
- Three merchant processes were left listening on ports 4021 to 4023.

## Things that cost this session time

- A 401 from `/public/participant/challenge` reads as a team-name problem and was
  in fact a wallet problem. The error covers both halves of the match. The team
  name was correct from the first attempt.
- `TEAM_NAME` unset makes the kit fall back to the literal string `Pending`,
  which produces that same 401. `.env.example` now documents the variable.
- `/settle` threw a transport error twice, both times after the work had already
  succeeded on chain. Treat a settle error as unknown, not as failure, and read
  the chain before retrying.
- A private key was once pasted into `ap4m-agent.cjs` in the main checkout,
  replacing the placeholder on line 42. That file was untracked and one
  `git add -A` from being published. The key belongs in `.env` only, which the
  kit already reads. The affected wallet is the registered agent,
  `0x37F2F416…A7A2`; it was never committed, and it holds testnet funds only.

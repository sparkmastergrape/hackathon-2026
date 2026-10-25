# Stage 02 — SDK Credentials

Collect the credentials the agent needs and download the starter kit.

## Inputs

| File | Load |
|---|---|
| `../01-participant-onboarding/output/STATE.md` | status table |
| `../../shared/facts.md` | Endpoints |

## Process

1. Require stage 01 to show payout wallet `verified`. If `reported`, verify it
   now or record that this stage proceeded on an unverified input.
2. Read `YOUR SDK CREDENTIALS`: AP4M API URL and CHANNEL ID.
3. Expect CHANNEL ID to be `—` / "Waiting for channel" at this point. The agent
   opens the channel in stage 04; an empty value here is correct, not a fault.
4. Download the starter kit from `QUICK START`. It is a single `ap4m-agent.js`
   prefilled with team name, funding wallet, API URL, channel id and payment
   ledger. Put the download in its own empty directory and read it before running
   anything.
5. Record the file's path and what it was prefilled with.

## Audits

- The downloaded file is read in full before stage 03 edits it.
- No credential beyond the public API URL is written to output.

## Outputs

- `output/STATE.md` — credential table, starter-kit path, prefilled values.

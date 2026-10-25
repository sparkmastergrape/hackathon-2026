# Stage 04 — Channel Open

Run `requestChannel()` and capture the resulting channel id.

## Inputs

| File | Load |
|---|---|
| `../03-agent-scaffold/output/STATE.md` | load status, dry-run result |
| `../../shared/facts.md` | Endpoints, Budget |

## Process

1. Require stage 03 to report the key loading successfully.
2. Run the agent so it calls `requestChannel()`.
3. Capture the channel id from the agent's output, then confirm the same id
   appears in the participant space `CHANNELS` panel and `CHANNEL ID` field.
   Two independent sightings or it stays `reported`.
4. Record the budget reading after the call — the cap should be unchanged and
   `used` should still be empty; opening a channel is not a spend.

## Audits

- The channel id matches between agent output and participant space.
- Budget `used` did not move. If it did, stop and report before stage 05.

## Outputs

- `output/STATE.md` — channel id, where each sighting came from, budget reading.

# The audit pane

Beat 5. One screen, built from `agent-audit/1`, with every figure computed
from the file rather than written into the page.

```bash
py audit/emit_from_ledger.py
py -m http.server 8800
# http://localhost:8800/audit/pane.html
```

A browser will not read a sibling file over `file://`, so the folder has to be
served. The pane says so itself when the fetch fails.

## What it reads

| File | Written by | Holds |
| :-- | :-- | :-- |
| `audit/events.json` | `emit_from_ledger.py` | What the public ledger evidences |
| `audit/device-run.json` | a device proof run | Observed presses and refusals |

The second is optional. When it is absent the pane renders the first alone and
says what is missing. When it is present the two are merged by timestamp.

## What the ledger can and cannot evidence

`emit_from_ledger.py` queries `account_tx` on a public testnet node. Nothing is
reported to it by the agent. It emits two stages, marked differently on
purpose:

- **`settle`**, evidence `measured`. The ledger says the payment settled and
  the hash proves it. The row links to the public explorer.
- **`device_decision`**, evidence `inferred`. The signing key lives on the
  device and never leaves it, so a valid signature implies a press. That is
  sound reasoning, not an observation, and the pane renders it with the word
  `inferred` visible.

**No refusal is emitted here, and that is not a gap in the tool.** A refusal
leaves no trace on a ledger, because nothing was signed and nothing was
submitted. Refusals belong in `device-run.json`, written by a run that watched
the device.

So a first open of this pane shows settled payments, inferred approvals, and a
line saying there are no refusals in the file. That is the honest state. The
veto row appears when a device run records one.

## Why the actor column is emphasised

The table's claim is that the refusals were not the agent's own code declining
to act. That claim lives entirely in one column. A reader scans it and sees
`owner` on a device, or `ledger` on a ceiling, and neither says `agent`.

Everything else on the screen supports that column.

## One thing this cost to find

The first run of the emitter produced 33 events that **passed validation** with
every timestamp set to `2000-01-01T00:00:00Z`. `rippled` puts `date` and `hash`
on the inner transaction, not on the envelope row, and reading the row returned
`0`, which is the Ripple epoch.

The schema cannot catch that. `ts` was present, well formed and in range. A
validator checks shape, and a wrong value of the right shape passes.

`tx_date()` now reads the inner transaction first and the comment says why.

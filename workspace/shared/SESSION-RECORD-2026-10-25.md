# Session record — the build and device session

Written at the close of the session that produced `tracks/build`, the device
bridge, the proof harnesses, `EVENT-SCHEMA.md` and `LEDGER-EMULATOR.md`.

For a reviewer who was not here. It says what is proven, what is not, and what
to distrust.

## What this session claimed, and how far each claim is backed

| Claim | Status |
| :-- | :-- |
| An agent pays per call over x402 on XRPL testnet | **Measured.** Five settled transactions, all `xrpl:1` |
| A ceiling the agent cannot exceed | **Measured for `upto`.** `SendMax` on a Check, refused at consensus. Not our code |
| A human veto on hardware | **Measured on an emulator.** Speculos, app-xrp 2.8.2. Never on physical hardware |
| The device shows the real destination | **Measured, scoped to `Payment`.** See the screen dump in `LEDGER-EMULATOR.md` |
| Clear signing works on XRPL | **Overreach.** Say "`Payment` displays every field a human needs". Nothing else was tested |

Say **emulator** out loud. The whole device result is emulator-only.

## Proof runs

Two harnesses, both 17 checks, both passing when last run.

- `prove_hardware.py` — against a stand-in signer sharing the device's HTTP
  contract. It isolates bridge faults from device faults.
- `prove_device.py` — against Speculos. Approve settles. Decline signs nothing.

Run the stand-in first. A failure there is never a device problem.

## The five mistakes that cost the most

Each is a trap documented in `LEDGER-EMULATOR.md`. These are the ones a new
reader will otherwise repeat.

1. **The device wants the plain serialization.** `binarycodec.encode(tx_json)`,
   never `encode_for_signing()`. app-xrp prepends `STX\0` itself. The symptom is
   "Unexpected device exchange error happened" with the device idle, which tells
   you nothing.
2. **A refusal is an error, not a stop.** DMK surfaces a human pressing Reject
   as status word `0x6985`. Reported as a 500, the veto becomes a crash — the
   demo's whole point, inverted.
3. **A stale process on the port.** A stranger on 8403 satisfied the boot check
   once and every assertion then ran against the wrong server. Guard the port.
4. **Assert on the device, not the harness.** The autopilot reports `acted=False`
   on the reject path although the device demonstrably refused. That is recorded
   as unexplained rather than given an invented cause.
5. **Settlement reported unknown is not settlement failed.** Roughly half of
   runs return 409 `settlement_status_unknown` while the payment has settled.
   Reconcile against the ledger by `InvoiceID` before calling it a failure.

## The finding worth the most to a sponsor

Ledger's page states there is still no XRPL transaction clear signing. For
`Payment`, measurement contradicts it: the device displays the transaction type,
the account, the source tag, both invoice bindings, the amount as XRP, the full
destination and the memo, then offers an explicit refusal.

The defensible sentence is in `LEDGER-EMULATOR.md`. It is generous rather than a
gotcha, and it answers the sponsor's own invitation with evidence.

## What is open

1. **The beat 5 audit pane is unbuilt.** Beat 5 now runs 15 seconds, not 25, so
   it must be readable at a glance. The complete log stays in the file. Build it
   against `agent-audit/1` by porting the eight rules from `EVENT-SCHEMA.md`,
   not by translating the other validator. Two implementations disagree loudly.
   One translation drifts in silence.
2. **PR 2050's commit is unsigned.** Ledger requires signed commits. A GPG
   signature is the submitter's own assertion and is not an agent's to make.
3. **Four of six filings have no channel.** The event page names none.
4. **Nothing beyond `Payment` has been shown on a device.** One Escrow test
   could refute the general form of the clear-signing argument.

## What to distrust

- Anything in this repository that is not marked `measured`.
- `CHAIN-DECISION.md`. Its facilitator measurement stands. Its recommendation is
  moot, because the answer became "both, by sponsor".
- Any sentence with "we" in it that covers work two sessions did. Check
  `shared/MEASURED-FACTS.md` for who measured what.

## Withheld

`speculos-xrp/device-screens.png` and `speculos-xrp/shots/` are device captures
from a fork session. JD withheld them. They are gitignored and untracked, and
this repository is public. Do not add them, and do not describe their contents
in anything that leaves the machine — convention 16.

The 18 captures in `filings/evidence/` are a different set, produced by the
filing session, and JD released those.

## The thing most worth keeping

Two agent sessions made four errors of one shape in two days. Each time a real
quote or a real number carried a conclusion one step past it. Every one was
caught by the other reader. None by the writer.

The mechanism that worked was not care. It was a second reader with the standing
to refuse. Where there is no second reader, the `measured` and `inferred` marks
in the text are the only substitute. That is why this workspace exists and why
rule 11 is written the way it is.

Full cases: `shared/EVIDENCE-LOG.md` and `shared/correction-log.md`.

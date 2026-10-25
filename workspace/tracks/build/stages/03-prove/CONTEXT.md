# Stage 03 — Prove

One job: run the proof harnesses end to end and record what the device and the
ledger did.

## Inputs

| File | Layer | Which sections matter |
| :-- | :-- | :-- |
| `../02-build/output/traps.md` | 4 | All |
| `../../../shared/MEASURED-FACTS.md` | 3 | What the ledger refuses |
| `prove_hardware.py`, `prove_device.py` (repo root) | 3 | The 17 checks |

## Process

1. Check no stranger holds the port before booting anything. A stale process on
   8403 satisfied `boot()` once and every check then ran against the wrong
   server.
2. Run the stand-in signer proof first. It shares the device's HTTP contract, so
   it isolates bridge faults from device faults.
3. Run the device proof second, against Speculos.
4. Record the transaction hash and result for every settled payment.

## Outputs

| File | Format | Location |
| :-- | :-- | :-- |
| Pass and fail counts, with hashes | md | `output/proof-run.md` |
| Audit events for the pane | json | `output/events.json` |

`events.json` follows `agent-audit/1`. See stage 04.

## Audits — run before writing output

- [ ] Assert on the device's own evidence, never on the harness bookkeeping. A
      refusal is proven by status word `0x6985`, not by an autopilot flag.
- [ ] A settlement reported as unknown is reconciled against the ledger before
      it is called a failure.
- [ ] Unexplained harness behaviour is recorded as unexplained, never given an
      invented cause.

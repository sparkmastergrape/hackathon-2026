# Stage 02 — measure

One job: produce a receipt. A number, a byte string, a hash, a screen — something
a reviewer can reproduce without trusting you.

## Inputs

| File | Layer | Which sections matter |
|---|---|---|
| `../01-read-the-surface/output/quotes.md` | 4 | The claim to be tested |
| `references/rig-notes.md` | 3 | How to stand up the emulator, RPC or resolver |

## Process

1. Stand the rig up from scratch, in a container or a clean directory. A rig you
   inherited carries state you did not set.
2. Record what the rig is: image digest, binary hash, package versions, flags.
   A receipt without a rig description is not reproducible.
3. Run the thing. Capture raw output — bytes, hex, the emulator's own event text,
   the DNS answer, the RPC response.
4. Measure both sides of any comparison. If you say mainnet differs from testnet,
   measure mainnet too. Half a comparison is how a filing gets refused.
5. Write the capture or driver script to `output/` alongside the receipts, so the
   run is repeatable by someone who has only this directory.

## Outputs

| File | Format | Location |
|---|---|---|
| Raw receipts, labelled by what produced them | md or json | `output/receipts.md` |
| Rig description — digests, versions, flags | md | `output/rig.md` |
| The driver or capture script | code | `output/` |

## Audits (run BEFORE writing output)

- [ ] Every receipt names the rig that produced it.
- [ ] Any comparison has both sides measured, not one side assumed.
- [ ] Versions are pinned and written down, not described as "latest".
- [ ] The script in `output/` runs from a clean checkout of this directory.
- [ ] Nothing secret is in the output. No keys, no seeds, no tokens.

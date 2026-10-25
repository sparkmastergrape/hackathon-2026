# Stage 04 — draft the filing

One job: write the filing. Quote, receipt, scope, suggested change.

## Inputs

| File | Layer | Which sections matter |
|---|---|---|
| `../01-read-the-surface/output/quotes.md` | 4 | The quote the filing turns on |
| `../02-measure/output/receipts.md` | 4 | The receipt |
| `../03-verify-the-artifact/output/` | 4 | Readings, mutation log, retractions |
| `../../../shared/correction-log.md` | 3 | All of it. Read before writing. |
| `../../../_config/sponsor-targets.md` | 3 | What this sponsor rewards and refuses |

## Process

1. **Scope first, in the first paragraph.** Name what you tested and what you did
   not. A filing that overreaches is refused on the overreach, and the real finding
   dies with it.
2. Quote the page. Then state the measurement. Keep them as two sentences and
   never join them with "so" unless stage 03 earned it.
3. Give the receipt in full — the bytes, the hash, the field list, the screens.
4. Say why it costs a developer something. A defect with no cost is a nitpick.
5. Suggest the change. One sentence the sponsor could paste.
6. Write the Scope and limits section last and make it generous. Name the rig, the
   versions, what was not tested, and which tool drove which run.
7. If two runs produced different field sets, give them separate headings and say
   in bold that they must not be merged.

## Checkpoints (human steering)

- After the scope paragraph, show it before writing the body. If the scope is
  wrong, nothing after it is worth writing.
- Before claiming a defect is an error rather than a gap, show the reasoning. The
  stronger claim invites a one-line refusal; the narrower one survives.

## Audits (run BEFORE writing output)

- [ ] Every quote matches `quotes.md` character for character.
- [ ] Every receipt matches `receipts.md` character for character. Check the long
      hex strings mechanically, not by eye.
- [ ] No sentence describes an artifact the filing does not attach.
- [ ] Scope limits appear twice: first paragraph and Scope section.
- [ ] Which tool produced which claim is stated, not left to be inferred.
- [ ] Nothing is claimed that `retracted.md` already killed.

## Outputs

| File | Format | Location |
|---|---|---|
| The filing | md | `output/NN-short-name.md` |
| Index: submit order, who measured what, pre-submit checklist | md | `output/README.md` |

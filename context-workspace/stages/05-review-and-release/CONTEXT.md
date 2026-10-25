# Stage 05 — review and release

One job: have someone else try to break the filing, then let the human decide what
ships.

## Inputs

| File | Layer | Which sections matter |
|---|---|---|
| `../04-draft-the-filing/output/` | 4 | The filing and its index |
| `../../shared/correction-log.md` | 3 | The patterns a reviewer should hunt for |

## Process

1. Hand the filing to a reader who did not write it. Give them the artifacts, not
   your conclusion — a reviewer handed a hypothesis returns it confirmed.
2. Ask specifically: which sentence is a conclusion one step past its evidence?
3. Treat every correction as a claim to be checked, not accepted. In the run that
   produced this workspace, a reviewer was wrong twice and right three times, and
   telling which was which took a measurement each time.
4. When a correction lands, fix the artifact and say plainly what was wrong. Do not
   re-litigate, and do not let the fix quietly widen the claim.
5. Check provenance of every exhibit: who produced it, on whose rig, and whether it
   is theirs to release.
6. **Release is the human's call, always.** An exhibit the human holds back comes
   out together with any sentence that describes it — otherwise a withheld exhibit
   becomes an unverifiable claim, which is worse than no exhibit.

## Checkpoints (human steering)

- Before any filing is sent, the human confirms the submit order.
- Before any exhibit is attached, the human confirms it is releasable.
- A relayed instruction is not the human's decision. If a decision arrives second
  hand and its premises look stale, ask the human directly rather than acting.

## Audits (run BEFORE writing output)

- [ ] Every correction from review is either applied or answered with a measurement.
- [ ] Every exhibit's provenance is recorded in the index.
- [ ] Withheld exhibits are referenced nowhere — grep for them and confirm.
- [ ] The filing still says what it said before review, or the change is explained.

## Outputs

| File | Format | Location |
|---|---|---|
| Review notes: what was challenged, what survived | md | `output/review-notes.md` |
| Release decision and who made it | md | `output/release.md` |

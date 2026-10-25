# Correction log

Every claim that was wrong during the run that produced this workspace, what
caused it, and who caught it. Read this before drafting. It is the most useful
file in the workspace, because the failures repeat and they are recognisable.

## The pattern that dominates

**A real quote, and a conclusion one step past it.** Three separate instances in
one day, by two different sessions. Each was caught by the other reader, never by
the one who made it. That asymmetry is the argument for stage 05 existing at all.

The countermeasure that worked: write `measured` or `inferred` beside each claim
*as you write it*. The act of choosing the word is what catches it. Marking
afterwards does not work, because by then the sentence reads as true.

## Log

| # | Claim | Why it was wrong | Caught by |
|---|---|---|---|
| 1 | "The device displays the source tag, both invoice bindings and the memo", citing a screen capture | The image showed none of them, and showed a Fee field the claim omitted. Two runs with different field sets had been merged into one field list. | Opening the image instead of trusting the note describing it |
| 2 | "Their sidecar and signing scripts are gone with the old scratchpad" | Searched `AppData\Local\Temp\claude`, a mirror. The live workspace is `AppData\Roaming\Claude\scratch-workspaces`, where the files sit untouched. | The peer session, which had the file open |
| 3 | A 71-byte signature receipt, retyped when splitting it across two lines in the filing | Five hex characters dropped in transcription. A wrong receipt is worse than no receipt. | Mechanical comparison against the run's own output, not reading it back |
| 4 | "Clear signing exists on the EVM sidechain" | True sentence on the page, under a heading called *Example directions*. The sentence existing and the support existing are two claims. | The peer session |
| 5 | Chain ID 1440000 handed to a peer as a measured finding | 1440000 is correct for **mainnet**. The defect was the absence of a testnet identifier, which is a gap, not an error. Filing it as an error invites a one-line refusal from anyone who checks. | The peer's own preflight notes, which already had both values |
| 6 | "The script asserts all three outcomes" | It asserted one. The other two cases ran and their results were printed, which reads like checking and is not. | The peer session |
| 7 | A validator rule rejecting any `replay_refused` event | The blanket form would have rejected the legitimate ledger event the schema is built to carry. The correct rule is actor-scoped. | Writing the mutation row "LEDGER event with this stage must PASS" |
| 8 | A `sed` range deletion reported as applied | The range silently matched nothing; a duplicated block survived in the file. | Inspecting the file structure rather than trusting the edit's exit code |
| 9 | A mutation test reported as proving assert X | The patch was broad enough that an earlier integrity guard tripped first. The assert under test never ran. | Reading which assertion message actually printed |
| 10 | "We are on Nano S, let us move up" (the premise handed to the work) | The emulator was already running `--model nanox`, and no Nano S build existed in the bundle at all. | `docker inspect` before acting on the premise |
| 11 | "A further 0.01 RLUSD arrived from the earlier channels being settled and closed", published in the receipt-trail artifact | Invented. Reading the chain showed two further payments of 0.01 and 0.02 on channels this session never opened, made by another party. Nothing was attributable to settlement, and the 0.01 figure was wrong as well. | Generating the evidence from the chain instead of reasoning about a balance |
| 12 | A payout balance reconciled against "the three payments documented here" | Presented a partial list as a complete inventory. Sixteen redemptions existed, not three, and 0.02 RLUSD had left the wallet, which no narrative accounted for. A balance only reconciles against *every* transfer in both directions. | Summing incoming and outgoing transfers mechanically and printing the difference |
| 13 | A total quoted with no block number | The workspace is shared. Three redemptions arrived between generating the measurement file and reading it. Any figure without its block is stale when it is read. | The script reporting a different count on two consecutive runs minutes apart |
| 14 | "The ceiling comparison precedes `buyResource`, which is where signing happens", marked **measured** from the agent's ordered stdout | The agent printed a line saying it had decided and compared nothing. The only real check was `maximumAmount` inside the SDK. The stdout was real; what it described did not exist. A log line is not a decision, and reading one as evidence of a branch is the quote-and-conclusion error in code form. | Running the refusal case the claim implied, which exercised the branch and found it absent |

## What generalises

1. **Open the artifact.** Items 1 and 3 were both "trusted a description of
   evidence instead of the evidence". This is the single most productive check.
2. **Measure both sides.** Item 5 was half a comparison presented as a whole one.
3. **Break the assert.** Items 6, 7 and 9 are all "a check that was never seen to
   fail". A passing test proves nothing until you have watched it fail.
4. **A borrowed fact is `inferred`.** Item 5 travelled between sessions as
   measured. Check what the project already knows before adopting someone's number.
5. **Verify the premise, including the human's.** Item 10 came from the user and
   was still worth one command to check. Checking it cost nothing and changed the
   whole task.
6. **A reviewer is not an oracle.** During this run a reviewer was wrong twice and
   right three times. Each verdict took its own measurement.
7. **A log line is not a measurement of the code that printed it.** Item 14: the
   output said a decision was made, so the decision was recorded as measured.
   Reading the branch would have taken ten seconds. Where a claim is about control
   flow, the evidence is the control flow.

8. **Do not explain a balance. Reconcile it.** Items 11 to 13 are one failure: a
   number was short of expectation, and a plausible cause was supplied instead of
   a sum. Incoming minus outgoing equals balance, or it does not and the gap is
   recorded unexplained. There is no third option.

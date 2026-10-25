# Evidence discipline

The rules the filings are held to. Short on purpose.

## Measured or inferred

Every claim gets one of two marks, written in the text as you write the claim:

- **measured** — you ran it and observed the result in this project, on a rig you
  described. You can name the command.
- **inferred** — everything else. A reasonable deduction, a borrowed number, a
  vendor's documentation, a colleague's report.

Inferred is not a slur. It is a filing that survives contact with a reviewer.

A fact that arrives from another person or another session is `inferred` until you
measure it yourself, however confident its source sounded.

## Two statements are not one statement

The ledger refused a second `CheckCash` because an object was consumed. The
credential layer did not detect a bad reference. Both are true. Joining them with
"so" is a third claim that neither supports.

When you catch yourself writing "so", "which means", "therefore" or "this proves",
stop and check which of the two statements is doing the work.

## The quote and the conclusion

A sentence existing on a page is a measurement. What the sentence implies about a
system is an inference. Keep them in separate sentences, and note where the quote
sits — a bullet under "Example directions" does not carry a specification's weight.

## Asserts

An assert that has never been seen to fail is decoration. Before relying on one:
break the thing it checks, run it, watch it fail, record the mutation and the
message. Include at least one control that must **pass** — a rule that rejects its
own legitimate input is worse than no rule.

## Receipts

Long strings are transcribed by machine, never by hand or eye. Verify a receipt in
a filing by searching for the exact string from the run's own output.

## Scope

State what you did not test, in the first paragraph and again at the end. An
overreaching filing is refused on the overreach, and the real finding dies with it.
More devices widen device coverage, not transaction coverage. More runs of the same
transaction widen nothing.

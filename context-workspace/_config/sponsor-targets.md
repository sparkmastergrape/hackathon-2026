# Sponsor targets

Run-invariant configuration. What each sponsor rewards, and what gets a filing
refused. Verify these against the live page each run — all of it was read on the
day of the event and pages change.

## Ledger — Track 01, Protocol Innovation (Core)

Page: `developers.ledger.com/xrplnyc`

What the page says it wants, quoted:

> "Bug reports and PRs count."

> "We judge the Developer Experience (DX) feedback as much as the code."

Under *What to include*: "Specific improvements with screenshots or PRs".

The page names the track both "Protocol Innovation" and, in its prize table,
"Core Integrations". Valued at $4,000 there.

What gets refused here: a claim stated more strongly than the evidence supports.
This sponsor's own documentation is the thing under test, so anyone checking has
the page open. A filing that calls a gap an error is refused in one reply.

Their current stack is the Device Management Kit. A finding reproduced on DMK
carries more weight than the same finding on LedgerJS, so say which drove which
run rather than leaving it to be inferred.

## Mastercard — AP4M

Surface: the AP4M service, including `/public/config`, and the participant portal.

Keep AP4M filings separate from the Ledger set. They do not compete and mixing
them weakens both.

Note for stage 01: this project's own `AGENTS.md` carries a faucet URL that
filing 05 documents as having no DNS records. The project file and the served
config agree with each other and disagree with the DNS. `AGENTS.md` says to prefer
values from `https://hackathon.ap4m.build/llms.txt` where they differ, so check
that first and record which source you used.

## Both

- Testnet only. Never point any of this at a mainnet.
- Wallet keys come from environment variables. They never enter a filing, a
  stage output, a log or a commit.

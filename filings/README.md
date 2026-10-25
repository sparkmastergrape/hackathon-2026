# Documentation filings

Six defects, each with a receipt. Two sponsors. Nothing here is submitted.

Read `vi-replay/HANDOFF.md` for the state these came out of.

## Order to submit

The ranking rule: a filing nobody can argue with beats a better filing that needs
careful handling.

| # | File | To | Strength |
|---|---|---|---|
| 1 | `01-signer-return-type.md` | Ledger, Track 01 | Strongest. A published type that does not match the shipped package. |
| 2 | `03-derivation-path.md` | Ledger, Track 01 | Strong. Two examples on one page that disagree, one using Bitcoin's coin type. |
| 3 | `02-chain-id-only-mainnet.md` | Ledger, Track 01 | Weaker than first thought. A gap, not a wrong value. See below. |
| 4 | `04-clear-signing-payment.md` | Ledger, Track 01 | Worth the most, needs the most care. Scope to `Payment` or it is refused. Carries full screen sets from three devices in `evidence/`. |
| 5 | `05-ap4m-dead-faucet.md` | Mastercard, AP4M | Clean and separate. Does not compete with the Ledger set. |
| 6 | `06-two-judging-rubrics.md` | Mastercard, AP4M | Two surfaces that each self-describe as the judging criteria and score different things. Scoped so neither is called wrong. |

## The order changed while drafting, and the reason matters

The instruction was to put the chain ID and the signer return type first, as the
strongest pair. Reading the page verbatim moved the chain ID down.

1440000 is **correct for mainnet**. The page is not stating a wrong value. The
defect is that the page gives only the mainnet identifier while separately
accepting testnet work, and gives no testnet identifier anywhere. That is a real
documentation gap and it can route a team onto the wrong network, but it is not an
error, and filing it as one invites a one-line refusal from anyone who checks
mainnet.

So `03-derivation-path.md` takes second place. Two example values on one page that
contradict each other is not arguable.

## Why these are in scope

From `developers.ledger.com/xrplnyc`, Track 01:

- "Bug reports and PRs count."
- "We judge the Developer Experience (DX) feedback as much as the code."
- Under *What to include*: "Specific improvements with screenshots or PRs".

Track 01 is valued at $4,000 on that page. The page names it both "Protocol
Innovation" and, in its prize table, "Core Integrations".

## Before submitting any of these

1. **Screenshot each page section.** The brief asks for screenshots, and every
   filing cites a live page that may change.
2. **Attach `evidence/`.** Six screens each from Flex, Stax and Apex P are the
   filing's evidence, and the brief asks for screenshots. `evidence/flex/capture.cjs`
   reproduces any of the three runs, which is worth more to a reviewer than the
   images alone.
3. **Do not remove the scope line from `04`.** It is the first paragraph on
   purpose. Without it a reader tries an Escrow and dismisses the filing.
4. **Check the pages again.** All five were read on the day of the event.

`02` no longer needs a mainnet check. Both chain IDs are measured.

## Who measured what

The filings say "we" because they are a team submission. For internal purposes:

- The 70-byte DER signature, the `tesSUCCESS` device signing run, the Nano X
  screen field list, and both `eth_chainId` responses were measured by the session
  building the Ledger device bridge, through the DMK signer kit.
- **The Flex, Stax and Apex P screen sets under `evidence/` were produced by the
  session that wrote these filings**, on its own Speculos containers, driven by
  `@ledgerhq/hw-app-xrp` rather than the DMK kit. That difference is stated in
  `04`'s Scope section and must not be dropped: the rest of the Ledger set
  measures the DMK kit.
- The published return type, both derivation path examples, the `app-xrp`
  supported-type count, the signer kit API surface and the two DNS lookups were
  read by the session that wrote these files.
- The malformed private key and the AP4M `/public/config` value were found by the
  session building the AP4M agent.

No filing rests on a single unverified source. Where something is inferred rather
than measured, the filing says so in its own Scope section.

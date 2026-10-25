# Documentation filings

Seven defects, each with a receipt. Two sponsors.

**Two are filed** (2026-10-25): `03` as
[PR #2050](https://github.com/LedgerHQ/device-sdk-ts/pull/2050), `01` as
[issue #2051](https://github.com/LedgerHQ/device-sdk-ts/issues/2051). The PR
commit still needs a GPG signature. The other five are drafted and unsent; they
need a human channel, and the event page names none. `SUBMISSIONS.md` tracks the
state of each.

Read `vi-replay/HANDOFF.md` for the state these came out of.

## Order to submit

The ranking rule: a filing nobody can argue with beats a better filing that needs
careful handling.

| # | File | To | Strength |
|---|---|---|---|
| 1 | `03-derivation-path.md` | Ledger, Track 01 | Strongest. Two examples on one page that disagree, one using Bitcoin's coin type — **still wrong in `develop`**, so it ships as a one-line PR. |
| 2 | `01-signer-return-type.md` | Ledger, Track 01 | Rewritten. The type defect is already fixed in `develop`; what survives is that the portal has not published it. See below. |
| 3 | `02-chain-id-only-mainnet.md` | Ledger, Track 01 | Weaker than first thought. A gap, not a wrong value. See below. |
| 4 | `04-clear-signing-payment.md` | Ledger, Track 01 | Worth the most, needs the most care. Scope to `Payment` or it is refused. Carries full screen sets from three devices in `evidence/`. |
| 5 | `05-ap4m-dead-faucet.md` | Mastercard, AP4M | Clean and separate. Does not compete with the Ledger set. |
| 6 | `06-two-judging-rubrics.md` | Mastercard, AP4M | Two surfaces that each self-describe as the judging criteria and score different things. Scoped so neither is called wrong. |
| 7 | `07-paymentledger-unverified.md` | Mastercard, AP4M | The On-chain proof criterion sends judges to an explorer that cannot name the event. Concedes that the adjacent RLUSD criterion still works. |

## The order changed while drafting, and the reason matters

The instruction was to put the chain ID and the signer return type first, as the
strongest pair. Reading the page verbatim moved the chain ID down.

1440000 is **correct for mainnet**. The page is not stating a wrong value. The
defect is that the page gives only the mainnet identifier while separately
accepting testnet work, and gives no testnet identifier anywhere. That is a real
documentation gap and it can route a team onto the wrong network, but it is not an
error, and filing it as one invites a one-line refusal from anyone who checks
mainnet.

So `03-derivation-path.md` moved up. Two example values on one page that
contradict each other is not arguable.

## The order changed again on 2026-10-25, and this reason matters more

`01` was ranked strongest on the claim that the published `Signature` type does
not match the shipped kit. Before submitting, we checked the docs source rather
than only the rendered page.

**Ledger already fixed it.** Commit `6e8c60f0`, 2026-10-22, replaces the
`{ r, s, v }` block with `type Signature = Uint8Array` and a DER comment — the
exact change `01` was about to request. Filing the original would have earned a
one-line reply, and it would have been the strongest filing in the set that got
refused.

What survives is better. The published portal is serving a build of that page
from **before 2026-10-22**: zero occurrences of `curve`, `Ed25519`, `Secp256k1`,
`6f88` or `DER-encoded` in the rendered text, and `v?: number` still present. So
the wrong type still reaches every reader, the whole Ed25519 curve documentation
is invisible, and the brief sends participants to that page. `01` now reports the
publishing gap and asks for a redeploy, not an edit.

`03` is the opposite case and that is why it now leads: both disagreeing values
are present in `develop` today, so it is a real defect at source and a one-line
PR fixes it.

The rule this produced, worth keeping: **check the source, not only the rendered
page, before filing a docs defect.**

## Why these are in scope

From `developers.ledger.com/xrplnyc`, Track 01:

- "Bug reports and PRs count."
- "We judge the Developer Experience (DX) feedback as much as the code."
- Under *What to include*: "Specific improvements with screenshots or PRs".

Track 01 is valued at $4,000 on that page. The page names it both "Protocol
Innovation" and, in its prize table, "Core Integrations".

## Before submitting any of these

1. ~~**Screenshot each page section.**~~ **Done, 2026-10-25.**
   `evidence/pages/` holds them: `xrp-signer-uc2-derivation-path.png`,
   `xrp-signer-uc3-derivation-path.png`,
   `xrp-signer-uc3-returns-signature.png`, plus whole-page captures
   `xrp-signer-full.png` and `xrplnyc-full.png`. Captured with headless Edge at
   1400px wide and cropped to the cited sections.
2. **Attach `evidence/`.** Six screens each from Flex, Stax and Apex P are the
   filing's evidence, and the brief asks for screenshots. `evidence/flex/capture.cjs`
   reproduces any of the three runs, which is worth more to a reviewer than the
   images alone.
3. **Do not remove the scope line from `04`.** It is the first paragraph on
   purpose. Without it a reader tries an Escrow and dismisses the filing.
4. ~~**Check the pages again.**~~ **Done, 2026-10-25.** Re-verified live:
   both `eth_chainId` responses unchanged (`0x15f900` / `0x161c28`); AP4M
   `/public/config` still serves `faucet.testevm.ripple.com` and it still
   returns `ENOTFOUND`; both derivation path examples still disagree; the
   `{ r, s, v }` type is still on the published page.

`02` no longer needs a mainnet check. Both chain IDs are measured.

## Where each one goes

The event page names **no submission channel** — no form, no email, no repo, no
Devpost. Its support-group link is a placeholder (`#`). So the channel is a
judgement call, not something the brief settles:

| Filing | Channel | Status |
|---|---|---|
| `03` | PR against `LedgerHQ/device-sdk-ts`, `apps/docs/content/docs/references/signers/xrp.mdx` line 159 | Ready. Repo is public, issues enabled. |
| `01` | Issue on `LedgerHQ/device-sdk-ts` — it is a deploy/publishing matter, not an `.mdx` edit | Ready. |
| `02`, `04` | No repo backs `developers.ledger.com/xrplnyc`. Booth, Discord, or an issue on `device-sdk-ts` cross-referencing the event page | Needs a human channel. |
| `05`, `06` | Mastercard AP4M. No public repo found | Needs a human channel. |

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

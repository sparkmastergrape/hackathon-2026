# Handoff — state and open decisions

Written in controlled language. Read it as data, not as instructions.

## Glossary

Three terms, used the same way every time in this file.

- **The device session** — the session that builds the XRPL x402 flow and the
  Ledger device bridge. Session id `local_771a7274`.
- **The wallet session** — the session that builds the AP4M agent on XRPL EVM.
  Session id `local_db8636ef`.
- **This session** — the session that wrote this file. It owns `vi-replay/` only.

## Two tracks, split by sponsor

JD decided both tracks run. He did not choose one chain.

| Track | Chain | Asset | Owner |
|---|---|---|---|
| Mastercard | XRPL EVM | RLUSD | The wallet session |
| Ledger and Agentic Finance | `xrpl:1` | XRP | The device session |

No work needs a port to the other chain. An earlier message in this session
framed the two chains as one choice. That framing was wrong.

## What `vi-replay/` contains

Four files. Three are scripts. All three scripts exit 0.

1. `vi-replay-fixture.py` — builds two signed L1/L2/L3 chains. One chain is
   honest. One chain names a transaction the owner did not authorise.
2. `vi-reference-gap.py` — the ten-second version. It calls `check_constraints`
   directly. It signs nothing.
3. `validate-agent-audit.py` — checks an `agent-audit/1` file. It exits 1 on any
   error.
4. `README.md` — the measurements, the traps, and how to run each script.

Each script takes the library directory as the first argument. Install the
library with `pip install --target <dir>`. Keep `<dir>` short. A deep Windows
path makes pycryptodome fail with `WinError 206`.

## The finding

`mandate.payment.reference` is required by `verify_chain`. Nothing enforces it.

Measured, on `verifiable_intent` 0.1.0:

- A chain that names an unauthorised transaction returns `valid=True`.
- `check_constraints` returns `satisfied=True` on that same chain.
- `checked` lists `mandate.payment.reference`.
- `skipped` is empty.

A caller that reads `skipped` to find its blind spots does not find this one.

## The ledger half

Measured on testnet by the device session. Four attempts.

| Attempt | Result |
|---|---|
| The same signed `Payment`, sent twice | `tefPAST_SEQ` |
| A new `Payment` that reuses one `InvoiceID` | `tesSUCCESS` |
| The same signed `CheckCash`, sent twice | `tefPAST_SEQ` |
| A new `CheckCash` against a cashed Check | `tecNO_ENTRY` |

Receipt for the fourth attempt. CheckID
`BEBF50C55C275B9D04D08510D293B8D2E5355C57BCD5B518217306FB120F0827`.
`CheckCreate` with `SendMax` 5000 drops returned `tesSUCCESS`. A cash for 1840
returned `tesSUCCESS`. A second cash returned `tecNO_ENTRY`.

## Three claims that must stay separate

This is the most important section. Three agents made this mistake today.

1. The mandate does not catch the replay.
2. The ledger refuses the second settlement, because the Check is gone.

Do not join these two statements with "so". The replayed field is
`conditional_transaction_id`. That field never reaches the ledger. The ledger
refused the second cash because an object was consumed. The ledger did not detect
a bad reference.

`validate-agent-audit.py` enforces this in data. Stage `replay_refused` requires
`actor: "ledger"`. The rule is actor-scoped. It is not a ban on the stage,
because the ledger event uses that stage correctly.

XRPL does not enforce `InvoiceID` uniqueness. Do not say the ledger refuses a
replayed invoice. It does not.

## Clear signing — scope every claim to `Payment`

Ledger published "there is still no XRPL transaction Clear Signing" at
`developers.ledger.com/xrplnyc`, and this project contradicts that sentence for
the `Payment` transaction type only.

The quote is verbatim. The scope sits in the same sentence on purpose. A reader
who copies one sentence out of this file must carry the scope with it.

The device session measured the opposite for one transaction type. On Speculos,
`app-xrp` 2.8.2 displayed the type, the account, the source tag, both invoice
bindings, the amount, the full destination, and the memo.

Read Ledger's sentence carefully. It says "nothing **above it** understands the
types yet". The sentence describes the tooling layer. It does not describe the
device application.

So two readings exist.

- "No clear-signing framework for XRPL exists." The measurement does not
  contradict this reading. No such framework exists.
- "No human-readable display exists on the device." The measurement contradicts
  this reading, for `Payment` only.

Nobody has tested NFT, AMM, Escrow, Payment Channel, or multisig display.
Ledger's own page says those types are where support breaks. A claim about all
XRPL transaction types is not supported by one measurement.

## Why "all of them" is possible

The device application already supports 33 transaction types. Its own README
says so. The review screen pages through all the details of a transaction.

The signer kit above it exposes three methods only.

- `getAppConfig()`
- `getAddress(derivationPath, options)`
- `signTransaction(derivationPath, transaction, options)`

`signTransaction` takes serialized bytes. It returns a signature. It offers no
transaction building, no field formatting, and no preview.

So the gap is entirely host-side. `xrpl.js` already produces the bytes the kit
needs. A type-aware layer above the kit is the work Ledger's Protocol Innovation
prize asks for.

Field limits are the breakage point. A Nano X allows 60 fields and 1024
characters. A Nano S allows 24 fields and 128 characters. No document states what
happens above those limits.

## Two signature encodings. They do not interchange.

| Layer | Encoding |
|---|---|
| VI SD-JWT, ES256 on P-256 | Raw `r‖s`, 64 bytes, always |
| XRPL `TxnSignature` | DER, 70 or 71 bytes, variable |

DER keeps or drops a leading zero byte. The length depends on the high bit of
`r` and of `s`. The length changes between runs with one key and one code path.

Parse the DER structure. Never slice a signature by offset. A fixed width works
most of the time and then fails.

The kit returns DER bytes. Its own types say
`SignTransactionDAOutput = Signature = Uint8Array`. Ledger's published signer
page documents `{ r, s, v? }` instead. That page appears to describe the Ethereum
signer. Trust the kit's types.

## Four open decisions. All need JD.

1. **The pane.** The device session does not start it without approval. The audit
   table has no renderer until the pane exists.
2. **The filings.** Five defects. Each one has a receipt. None is drafted.
3. **Gas for the agent wallet.** Use `faucet.xrplevm.org`. That host resolves.
   The faucet may throttle requests. It returned HTTP 429 earlier today.
4. **The merchant payout wallet.** Onboarding step 2 is unset. `requestChannel`
   binds a payout when it opens. Gas alone may not unblock the run.

Items 3 and 4 need a person at a browser. Items 3 and 4 block a running build.

Do not send anyone to `faucet.testevm.ripple.com`. That host returns
`NXDOMAIN`. AP4M serves it as `faucetUrl` in `/public/config`. This repository
no longer references it.

## Five documented defects. Two sponsors.

Do not rank all five in one list. The Ledger set and the Mastercard defect do not
compete for any slot.

The rule that sets the order inside each set: a filing nobody can argue with
beats a better filing that needs careful handling.

**To Ledger, Track 01.** Four defects, in this order:

1. **The chain ID on the prize page.** The page gives 1440000 for the XRPL EVM
   sidechain. That is mainnet. Testnet is 1449000. Eligibility runs on testnet,
   so this number can send a whole team to the wrong network. Measured by the
   device session: `eth_chainId` against `https://rpc.testnet.xrplevm.org`
   returns `0x161c28`, which is 1449000.
2. **The signer return type.** The reference page documents `{ r, s, v? }`. The
   shipped kit returns DER bytes. One screenshot demonstrates it.
3. **The derivation path.** One reference page gives two paths that disagree.
   `getAddress` shows `44'/144'/0'/0/0`. `signTransaction` shows
   `m/44'/0'/0'/0/0`. Coin type 0 is Bitcoin. XRP is 144.
4. **Clear signing for `Payment`.** This filing is worth the most. It also needs
   the `Payment` scope in the first paragraph. A reader who tries an Escrow
   dismisses an unscoped version in one reply.

Defects 1 and 2 are the strongest pair. Each is a wrong value in a published
document, and each admits no interpretation.

**To Mastercard, separately.**

5. **The dead faucet host.** AP4M serves `faucet.testevm.ripple.com` as
   `faucetUrl` in `/public/config`. That host returns `NXDOMAIN`. One DNS lookup
   demonstrates it. The defect is in the served config, not in this repository.

### Why the filings are in scope. Four quotes, checked today.

Measured. This session fetched `developers.ledger.com/xrplnyc` and read these.

- "Bug reports and PRs count." This appears under Track 01.
- "We judge the Developer Experience (DX) feedback as much as the code." So
  documentation feedback earns score. It is not merely tolerated.
- Under "What to include": "Specific improvements with screenshots or PRs". All
  three defects already have receipts in that form.
- Eligibility: "your project must land at least one transaction on the XRP Ledger
  or its EVM sidechain." The page then states "Testnet counts." Five validated
  testnet transactions exist.

### Track names. The page uses two sets.

Cite both names, or a reader cites a track that the prize table does not list.

| Official name | Name in the prize table | Amount |
|---|---|---|
| Protocol Innovation (Track 01, "Core") | Core Integrations | $4,000 |
| Agentic Finance (Track 02) | Agentic Finance | $3,000 |
| Why Not (Track 03) | Creative Minds | $3,000 |

The page states "Total bounty pool of $10,000".

### One quote that does NOT establish what it looks like it establishes

The same page says: "sign with the ETH DMK signer plus Clear Signing."

**Measured:** the sentence exists. It sits under Track 01, in a section headed
Example directions. That section lists ideas to build.

**Inferred, and do not restate it as measured:** that clear signing works on the
XRPL EVM sidechain. The page never states this. A list of buildable ideas is not
a statement of current support. Clear signing may well work there, because
ERC-7730 is a shipped Ledger capability, but this page does not establish it and
another source is needed.

An earlier draft of this file stated the inference as a fact. That draft was
wrong in the same shape as the opaque-screen error recorded above. A real quote,
and a conclusion one step past it.

The Ledger filing does not depend on this. Ledger's sentence about XRPL is direct
and the XRPL gap is stated outright.

## Commit state

This session committed nothing in this repository. JD said "Leave the commit to
me". `vi-replay/` is untracked. `.gitignore` line 157 is `vi-replay/*.json`, so
every generated file stays out of git.

This session made one commit in another repository. It is local and not pushed.

## One practice to keep

Mark every claim `measured` or `inferred`. Write the mark in the document.

Three confident claims nearly reached the pitch today without a measurement. One
came from a document that looked authoritative. A sourced quote is not a
measurement. The quote can be real and the conclusion can still be wrong.

The mark is what catches this. General care is not.

# Autonomous agent payments on XRPL, with a Ledger at the risk boundary

An agent that meets an HTTP 402, decides to pay, signs the voucher and settles RLUSD to
the merchant — with no human in the loop. Payments that cross a risk boundary are the
exception: those alone stop and wait for a signature on a Ledger device.

Plus seven documented defects found in the sponsors' own SDKs and docs while building it,
two of them already filed upstream against Ledger's SDK.

Built at the Ledger x XRPL hackathon (XRPL Commons / XRP Ledger Foundation / Swell,
New York, 24–25 October 2026), using the Mastercard AP4M payment kit on the XRPL EVM
sidechain.

**Entered under Track 02 — Agentic Finance.** The agent that reads a 402, decides to pay,
signs and settles without a person in the path is the submission. The Ledger device gate
and the seven filings sit underneath that entry rather than beside it: the gate is what
makes an unattended payer safe to leave running, and the filings are the defects that
turned up while building it. One track, one entry.

Testnet only. Every key in this repository is a testnet key.

## The idea

The agent pays by itself. It receives a 402, chooses to pay, signs a voucher and settles,
with no person anywhere in the path — which is the entire point of a machine that buys
things. Every AP4M payment in the [Transactions](#transactions) section below ran that
way, start to finish. The one transaction there that a human signed is the gate's
exception path, and it is labelled as such.

That autonomy is also what makes it unnerving, and the second half of the product is the
answer: the agent runs unattended right up to the point where a payment is large,
unfamiliar or compliance-flagged, and only there does it stop for a human signature on a
Ledger device. A sanctions hit or a critical ledger-health reading cannot be approved by
anyone at all.

Most payments never touch the gate, and that is the design. A gate that stops everything
is just a slow person.

```
agent / pipeline → POST /intents → policy → auto-release (hot wallet)
                                          → PENDING_APPROVAL → approver app → Ledger device → verify → submit
                                          → BLOCKED
```

The gate rebuilds the transaction itself at approval time, from the stored intent, with
a fresh sequence and fee. The browser never gets to choose what the device signs.

## What is in here

Three deliverables that share a repository and a set of measurements.

### 1. `ledger-approver/` — the human-approval gate

A policy engine, a gate service, and a React approver app that signs on device through
the DMK XRP signer kit. Classic XRPL, XRP, `Payment`.

Policy triggers (defaults are placeholders, set in `server/policy.mjs`):

| Trigger | Outcome |
|---|---|
| Amount over `PER_TX_CAP_XRP` (50) | approval |
| Rolling 24h total over `DAILY_CAP_XRP` (200) | approval |
| Compliance risk `high`, or screening `pending` | approval |
| ≥ 3000 USD with no travel-rule data | approval |
| First payment to a destination | approval |
| Risk `blocked`, or ledger health `critical` | hard block |
| Anything it cannot evaluate | approval (default deny) |

See [ledger-approver/README.md](ledger-approver/README.md) for the signing sequence and
its known limits.

### 2. `filings/` — developer-experience defects, with receipts

The Track 01 brief is where the rule is written down — bug reports count, and DX feedback
is judged as much as code. That is not the track being entered, but it is the right
standard, so the filings are held to it.

Seven defects were found while building, each with a reproduction. Four belong to Ledger,
three to Mastercard. The two sets do not compete for the same slot, so they are ranked
within each sponsor rather than against each other.

Submission order, strongest first — the ranking rule is that *a filing nobody can argue
with beats a better filing that needs careful handling*:

| # | Filing | To | Status | Why it ranks here |
|---|---|---|---|---|
| 1 | [`01-signer-return-type.md`](filings/01-signer-return-type.md) | Ledger | **filed** — [issue #2051](https://github.com/LedgerHQ/device-sdk-ts/issues/2051) | A published type that does not match the shipped package. Admits no interpretation. |
| 2 | [`03-derivation-path.md`](filings/03-derivation-path.md) | Ledger | **filed** — [PR #2050](https://github.com/LedgerHQ/device-sdk-ts/pull/2050) | Two examples on one page that disagree; one uses Bitcoin's coin type for XRP. |
| 3 | [`02-chain-id-only-mainnet.md`](filings/02-chain-id-only-mainnet.md) | Ledger | drafted | A documentation *gap*, not a wrong value. See the note below. |
| 4 | [`04-clear-signing-payment.md`](filings/04-clear-signing-payment.md) | Ledger | drafted | Worth the most, needs the most care. Scoped to `Payment`. Carries screen sets from three devices. |
| 5 | [`05-ap4m-dead-faucet.md`](filings/05-ap4m-dead-faucet.md) | Mastercard / AP4M | drafted | A served config value pointing at a host with no DNS records. One DNS lookup demonstrates it. |
| 6 | [`06-two-judging-rubrics.md`](filings/06-two-judging-rubrics.md) | Mastercard / AP4M | drafted | The integration guide and the workshop deck each self-describe as the judging criteria and score different things. |
| 7 | [`07-paymentledger-unverified.md`](filings/07-paymentledger-unverified.md) | Mastercard / AP4M | drafted | The On-chain proof criterion sends judges to an explorer that cannot name the event. All four AP4M contracts are unverified. |

**Two are filed upstream, against Ledger's own repository** (2026-10-25, both open):
`03` as a documentation PR fixing the `signTransaction` derivation-path example, and `01`
as an issue reporting that the developer portal serves XRP signer docs from before the
2026-10-22 fix. Bug reports and PRs are what the brief asks for; these are that, in Ledger's
issue tracker rather than in a slide. `filings/SUBMISSIONS.md` tracks the rest.

`filings/evidence/` holds full device screen sets from Flex, Stax and Apex P (28 files),
with a capture script that reproduces any of the three runs.

**On the chain ID filing.** An earlier draft ranked this first as a wrong value. Reading
the page verbatim moved it down. 1440000 is correct — for mainnet. The defect is that
the page gives only the mainnet identifier while separately accepting testnet work, and
names no testnet identifier anywhere. That can route a team onto the wrong network, but
it is a gap, and filing it as an error invites a one-line refusal from anyone who checks
mainnet. Both chain IDs are measured: `eth_chainId` against
`https://rpc.testnet.xrplevm.org` returns `0x161c28` (1449000).

### 3. `mastercard/` — the Mastercard track

The same idea carried onto card rails: a human spend mandate in Consent Management
becomes network-enforced spend controls on a Business Payment Controls virtual card, the
merchant is paid out to a card through Mastercard Send, and revoking the mandate kills
the card. Five service clients, OAuth 1.0a signing, JWE payload encryption, and a
dry-run demo that prints the exact HTTP each step would send.

Detail is in [The Mastercard track](#the-mastercard-track) below.

## Status

**Measured.** AP4M agent payments ran end to end on 2026-10-24: two payments of
0.01 RLUSD settled to the merchant payout wallet, confirmed by reading the RLUSD
contract directly rather than trusting the service's own view. Both channels closed.
Budget 20 RLUSD cap, 0.02 used. Eight validated testnet transactions exist across the
two halves of the project — six on the EVM sidechain, two on classic XRPL — which
satisfies the eligibility rule that a project land at least one transaction on XRPL or
its EVM sidechain. Hashes are in [Transactions](#transactions).

**Measured.** On Speculos, `app-xrp` 2.8.2 displayed the transaction type, account,
source tag, both invoice bindings, amount, full destination and memo for a `Payment`.
The device application already supports 33 transaction types; the signer kit above it
exposes three methods and no type awareness, so the gap is host-side.

**Scope — read this before quoting the line above.** That measurement concerns the
`Payment` transaction type only. Nobody has tested NFT, AMM, Escrow, Payment Channel or
multisig display, and Ledger's own page says those types are where support breaks. It
also does not contradict the reading that no clear-signing *framework* for XRPL exists —
no such framework exists.

**Measured.** The approval gate ran end to end against live XRPL testnet on 2026-10-24.
`npm test` passes 27/27 with no network, `npm run build` is clean, and `npm run e2e`
exercised all four policy outcomes and landed two real transactions. Hashes below.

**Not done.** The approver app has not been run against a *physical* device — `npm run e2e`
substitutes a software key for the device, and the device leg has otherwise only been
exercised on Speculos. The gate has no authentication and keeps state in memory.
Non-`Payment` transaction types show a "no preview yet" notice and need the device's
blind-signing setting. Five of the seven filings are drafted but not yet sent; the other
two are filed and open upstream, linked in the table above.

## Transactions

Every hash below was read from a public node, not from a success flag returned by a
service. Claim IDs and channel IDs are **not** transaction hashes — passing one to
`eth_getTransactionByHash` returns `null`, which reads like a missing payment rather than
a category error. They are listed separately for that reason.

### Classic XRPL — the approval gate

From `npm run e2e` in `ledger-approver/`, 2026-10-24. Explorer:
`https://testnet.xrpl.org/transactions/<hash>`.

| Case | Outcome | Hash |
|---|---|---|
| Small payment, known destination | auto-released from the hot wallet | `045CD5F1B38B07F98C8B018A44644FA8162853C66554478722DF7AED49AD4C53` |
| Sanctioned destination | `BLOCKED` `SDN_BLOCKED` — nothing submitted | — |
| Above `PER_TX_CAP_XRP` | `PENDING_APPROVAL` `OVER_TX_CAP` — nothing submitted | — |
| Above cap, approved and signed | verified, then submitted | `56A4AF7D1DB3AC0E29F993FB0A766176C02070E58F018C314F969CAC2F4026EF` |

The two blocked rows are the point of the project: the gate withheld them, and the ledger
never saw a transaction to refuse.

### XRPL EVM sidechain — the AP4M agent payments

Chain 1449000. Explorer: `https://explorer.testnet.xrplevm.org/tx/<hash>`. Full
chain-of-custody, including the claim-ID matching, is in
[`receipt-trail.html`](receipt-trail.html).

**Payment 1** — 0.01 RLUSD, 22:02–22:03Z, blocks 9224696–9224702:

| Step | Hash |
|---|---|
| Agent opens a payment channel | `0x4fcb1061b5f82e1f6ad82aeeb9ae890b432aede1a3f233cb8ae756a01bcc78c5` |
| Agent redeems a signed voucher (`redeemVoucher`, 164,175 gas) | `0xcb1f2dabc921537530af35d8686b8aa21e3d8ce3fe9560823f79a471ffc33d9f` |
| Vault pays the merchant 0.01 RLUSD | `0x8a6607770d6e0ae3b36fc2e7413ed00c772a4b75a19dab0258ff1138be7fbf1f` |

**Payment 2** — 0.01 RLUSD, 22:07–22:08Z, blocks 9224747–9224751:

| Step | Hash |
|---|---|
| Agent opens a payment channel | `0x95874476bf3d10a1f7b520e0aa3e92b52a0178418beb7da7b792ef4214b96500` |
| Agent redeems a signed voucher (`redeemVoucher`, 147,087 gas) | `0xe39c8fb5b1868c94db686f89a614710bcc884c16cba8cc5fe9484a99cc5e0bf6` |
| Vault pays the merchant 0.01 RLUSD | `0x23c4beb9264b7ee3f0e2ef81182c1605f8d7045954aa1c750386e6e243389a6c` |

### The redemption event — what to open

AP4M's judging asks for a `VoucherRedeemed` event on the explorer at the `PaymentLedger`
address. It is a **log inside the redemption transaction**, not a transaction of its own,
so open either redemption hash above and read its logs:

```
https://explorer.testnet.xrplevm.org/tx/0xcb1f2dabc921537530af35d8686b8aa21e3d8ce3fe9560823f79a471ffc33d9f?tab=logs
```

**Measured.** That log is emitted by `PaymentLedger`
(`0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91`) with
`topic0 = 0xe3de5c3755abd99a01530fd79b85708f309453f6d26eb9bb5dde4c14cd5f7175`, and
carries `channelId` and `claimId` as indexed topics. The claim IDs shown in the AP4M
portal — `0x99e40a07…` for payment 1, `0xce2bb492…` for payment 2 — match those topics,
which is what ties the portal's receipt to the chain.

**Confirmed — the log is `VoucherRedeemed`.** AP4M's own SDK helper declares the
signature at `ap4m-hackathon-sdk.js:203`:

```
VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,address,address,uint256,uint256,uint256)
```

`keccak256` of that string is exactly the `topic0` above. Reproduce it in one command,
offline:

```bash
node -e "console.log(require('viem').toEventSelector('VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,address,address,uint256,uint256,uint256)'))"
```

**But the explorer will not show you that name.** The `PaymentLedger` source is
unverified on the explorer and absent from Sourcify, and the topic is in neither the
openchain nor the 4byte signature registry — all four checked on 2026-10-25. A judge who
follows the rubric to the explorer sees an unnamed topic hash and has no way, from there,
to tell it is the event they were sent to find. The name is recoverable only from the
SDK, as above.

Verifying the contract is AP4M's to do — it needs their Solidity source, which is not
published. Until then, the hash above is the bridge between the rubric's wording and what
the explorer actually renders.

Verify any of them without AP4M being reachable at all:

```bash
RPC_URL=<your node> node verify-receipt-onchain.mjs   0xcb1f2dabc921537530af35d8686b8aa21e3d8ce3fe9560823f79a471ffc33d9f
```

### Contracts and wallets under test

| Role | Address |
|---|---|
| Agent wallet (pays, signs vouchers) | `0x37F2F4166646Ea3cea94BB37BaBD88a01F52A7A2` |
| Merchant payout (receives RLUSD) | `0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8` |
| `PaymentLedger` | `0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91` |
| `PooledEscrowVault` | `0x83DD9cD010eb46e96eceF8F7eB0a18f7845AaBC0` |
| RLUSD token (ERC-20, 18 dp) | `0x27b57a9D0b8d24EB97259c4E2279e45255e016f3` |

The agent and payout addresses differ, which AP4M requires: the party authorising a
payment cannot be the party receiving it.

## The three-minute demo

Live, on testnet, no recorded output. `npm run predemo` is the gate on starting at all:
it checks the wallets, the registration and the gas, and exits non-zero if the run would
fail. Do not skip it in front of an audience.

| # | Step | Command | What the room sees |
|---|---|---|---|
| 1 | Pre-flight | `npm run predemo` | exit 0 — wallets funded, agent registered |
| 2 | Agent pays, unattended | `npm run demo` | channel opened, voucher signed, settled, closed |
| 3 | Proof, from a public node | `node verify-receipt-onchain.mjs <hash>` | the redemption and the RLUSD payout, read from chain |
| 4 | The boundary | `ledger-approver/` — seed a large payment | it stops; approve it on the device |

Steps 1–3 are the autonomy story and need no person beyond pressing return. Step 4 is the
exception path, and is the only point a human appears.

**Measured** for steps 1–3: the hashes in [Transactions](#transactions) came from this
sequence. **Not measured:** the x402 leg (`example-x402-agent.mjs` with
`example-x402-merchant.mjs`) is where the literal 402 response appears, and it has not
been run end to end from this checkout. If the demo needs to show the 402 itself rather
than the payment it causes, rehearse that pair first.

## The Mastercard track

A human spend mandate becomes network-enforced spend controls on a virtual card, the
merchant is paid out to that card, and revoking the mandate kills it.

**Measured.** `npm test` passes 82 tests with no network and no credentials. They check
that the request bodies match the published OpenAPI specs: required fields, `negate`
flags, ISO-4217 numeric currency codes, offset-bearing timestamps, the `yyyy-MM` expiry
regex, and the 22-character statement-descriptor limit.

**Not done.** Nothing here has run against Mastercard's sandbox. `npm run demo:mandate`
is a dry run that prints the exact HTTP each step would send; the `--live` path needs a
Developer Dashboard project, a `.p12`, and the encryption keys, none of which exist yet.
So the flow is reviewable but unproven, and it has landed no transaction — the
eligibility evidence is the XRPL side, above.

```bash
npm run demo:mandate            # dry run, prints every request
node demo/agent-mandate.mjs --live   # needs credentials in .env
npm run mcp:mastercard          # Mastercard's agent toolkit as an MCP server
```

The modules:

| Module | What it does |
|---|---|
| [`mastercard/consent.mjs`](mastercard/consent.mjs) | Consent Management, plus `agentSpendMandate()` encoding an agent's limits into a consent record |
| [`mastercard/bpc.mjs`](mastercard/bpc.mjs) | Business Payment Controls, plus `spendControlsFromMandate()` turning those limits into a spec-valid `inControlRules` |
| [`mastercard/send.mjs`](mastercard/send.mjs) | Send Disbursements, plus `merchantPayoutRequest()`, `panUri()`, `minorUnits()` |
| [`mastercard/bin.mjs`](mastercard/bin.mjs) | BIN Lookup, plus `payoutPreflight()` — reads MoneySend indicators before spending the call |
| [`mastercard/fx.mjs`](mastercard/fx.mjs) | Currency Conversion Calculator, plus `unwrap()` for in-band errors |
| [`mastercard/jwe.mjs`](mastercard/jwe.mjs) | JWE payload encryption, required on three of Consent Management's six endpoints |
| [`mastercard/sign.mjs`](mastercard/sign.mjs), [`request.mjs`](mastercard/request.mjs) | OAuth 1.0a signed fetch; base URLs, idempotency, error envelopes, dry run |

Sandbox base URLs, one per service family:

| Service | Sandbox base URL |
|---|---|
| Consent Management | `sandbox.api.mastercard.com/openapis/authentication` |
| Business Payment Controls | `sandbox.apiedge.mastercard.com/commercial` |
| Send Disbursements | `sandbox.api.move.mastercard.com/send/static` |
| BIN Lookup | `sandbox.api.mastercard.com/bin-resources` |
| Currency Conversion | `sandbox.api.mastercard.com/settlement/currencyrate` |

Credentials come from the Mastercard block in `.env.example`. `server.mjs` runs
Mastercard's agent toolkit over stdio and needs none of them; `.mcp.json` registers it.
Further reading: [the track playbook](docs/mastercard-track-playbook.md) and
[sandbox test cards](docs/mastercard-test-cards.md).

## Run it

Node 22.13+. Chrome, Edge or Brave for the approver app (WebHID is Chromium-only and
needs localhost or HTTPS). No device? Use the Speculos emulator from
`device-management-kit-ts-workshop/xrpl-hackathon/speculos`.

Wallets first — three of them, across two chains, and the agent and merchant payout
addresses must differ. [SETUP.md](SETUP.md) has the table, the MetaMask network values
and the trust-line steps.

```bash
cp .env.example .env          # then fill it, or generate:
node create-testnet-wallet.mjs   # classic XRPL wallet, funded from the faucet
node create-evm-wallet.mjs       # XRPL EVM agent wallet
node verify-wallets.mjs          # re-derive everything, check chain ID, print no secrets
```

The approval gate:

```bash
cd ledger-approver
npm install
npm test        # policy and gate tests, no network
npm run gate    # terminal 1 — gate service on 127.0.0.1:8787
npm run dev     # terminal 2 — approver app on http://localhost:5173
npm run e2e     # optional — full testnet run with a software key
```

Then: Connect, Fund, Seed demo payments, open the large payment, Approve, sign on device.

AP4M service side, without spending gas or touching chain state:

```bash
npm run predemo                 # one pre-demo check; exit 0 = safe to start
node signin-check.cjs           # service side only
node check-rlusd.mjs            # RLUSD balances read from the contract
node verify-receipt-onchain.mjs # re-verify a receipt from a public node
```

The AP4M agent payment, which does spend gas and draws on the budget:

```bash
npm run demo                    # open a channel, pay, settle, close
CHANNEL_ONLY=1 node run-ap4m.cjs  # stop after the channel is open
node close-channel.cjs          # close a channel left open
```

`run-ap4m.cjs` refuses to start if `AGENT_PRIVATE_KEY` is missing, derives an address the
portal does not have registered, or the agent wallet has no gas. It names the faucet in
that last case.

## Layout

| Path | What it is |
|---|---|
| `ledger-approver/` | Policy engine, gate service, React approver app, tests |
| `filings/` | Seven DX defect filings and device evidence |
| `mastercard/` | Five Mastercard service clients, OAuth 1.0a signing and JWE |
| `demo/`, `test/`, `server.mjs` | The mandate demo, 82 offline tests, the Mastercard MCP server |
| `docs/` | Mastercard track playbook and sandbox test cards |
| `vi-replay/` | Verifiable-intent replay fixtures and the audit validator |
| `workspace/` | The ICM workspace. Two tracks: `tracks/build` and `tracks/filing`, the pipeline the filings were produced through |
| `ap4m-agent.cjs`, `run-ap4m.cjs`, `close-channel.cjs` | The AP4M payment agent and its runner |
| `predemo.mjs`, `verify-wallets.mjs`, `verify-receipt-onchain.mjs` | Pre-demo and verification checks |
| `receipt-trail.html`, `walkthrough.html` | The receipt evidence page and the demo walkthrough |
| other `*.mjs`, `*.cjs` at root | x402 examples, wallet generators, RLUSD helpers |
| [`AGENTS.md`](AGENTS.md) | Instructions for AI agents working in this repo; AP4M facts |
| [`SETUP.md`](SETUP.md) | Wallet roles, addresses, MetaMask network, trust lines |
| [`vi-replay/HANDOFF.md`](vi-replay/HANDOFF.md) | Session state and open decisions |

## One practice worth stealing

Every claim in this repository is marked `measured` or `inferred`, in the document, in
writing.

This is not pedantry. Three confident claims nearly reached the pitch without a
measurement behind them, and one of them came from a document that looked authoritative.
A sourced quote is not a measurement — the quote can be real and the conclusion drawn
from it can still be wrong. The mark is what catches that. General care does not.

## Safety

- Testnet only. Do not reuse any key here on a mainnet.
- `.env` and `.env.*` are git-ignored; `.env.example` deliberately is not.
- Private keys are read from the environment, never committed, printed or logged. The
  wallet generators write straight to `.env` and never echo the secret.
- The AP4M service only ever needs signatures. Never send it a private key.
- Operator, PSP, payout, release and admin keys belong to the service, not to this team.

# Ledger-gated agent payments on XRPL

A payment agent that cannot move money past a threshold without a human signature on a
Ledger device — plus five documented defects found in the sponsors' own SDKs and docs
while building it.

Built at the Ledger x XRPL hackathon (XRPL Commons / XRP Ledger Foundation / Swell,
New York, 24–25 October 2026), using the Mastercard AP4M payment kit on the XRPL EVM
sidechain.

Testnet only. Every key in this repository is a testnet key.

## The idea

An autonomous agent with a funded budget is useful and unnerving in the same breath.
The useful part is that it pays for things without waiting for a person. The unnerving
part is the same sentence.

So the boundary is the product. Small, clean payments release automatically. Anything
over a cap, newly-seen, or flagged by compliance stops and waits for a human to approve
it on a Ledger device. A sanctions hit or a critical ledger-health reading cannot be
approved by anyone at all.

```
agent / pipeline → POST /intents → policy → auto-release (hot wallet)
                                          → PENDING_APPROVAL → approver app → Ledger device → verify → submit
                                          → BLOCKED
```

The gate rebuilds the transaction itself at approval time, from the stored intent, with
a fresh sequence and fee. The browser never gets to choose what the device signs.

## What is in here

Two deliverables that share a repository and a set of measurements.

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

Track 01 states that bug reports count and that DX feedback is judged as much as code.
Five defects were found while building, each with a reproduction. Four belong to Ledger,
one to Mastercard. They do not compete for the same slot.

Submission order, strongest first — the ranking rule is that *a filing nobody can argue
with beats a better filing that needs careful handling*:

| # | Filing | To | Why it ranks here |
|---|---|---|---|
| 1 | [`01-signer-return-type.md`](filings/01-signer-return-type.md) | Ledger | A published type that does not match the shipped package. Admits no interpretation. |
| 2 | [`03-derivation-path.md`](filings/03-derivation-path.md) | Ledger | Two examples on one page that disagree; one uses Bitcoin's coin type for XRP. |
| 3 | [`02-chain-id-only-mainnet.md`](filings/02-chain-id-only-mainnet.md) | Ledger | A documentation *gap*, not a wrong value. See the note below. |
| 4 | [`04-clear-signing-payment.md`](filings/04-clear-signing-payment.md) | Ledger | Worth the most, needs the most care. Scoped to `Payment`. Carries screen sets from three devices. |
| 5 | [`05-ap4m-dead-faucet.md`](filings/05-ap4m-dead-faucet.md) | Mastercard / AP4M | A served config value pointing at a host with no DNS records. |

`filings/evidence/` holds full device screen sets from Flex, Stax and Apex P (28 files),
with a capture script that reproduces any of the three runs.

**On the chain ID filing.** An earlier draft ranked this first as a wrong value. Reading
the page verbatim moved it down. 1440000 is correct — for mainnet. The defect is that
the page gives only the mainnet identifier while separately accepting testnet work, and
names no testnet identifier anywhere. That can route a team onto the wrong network, but
it is a gap, and filing it as an error invites a one-line refusal from anyone who checks
mainnet. Both chain IDs are measured: `eth_chainId` against
`https://rpc.testnet.xrplevm.org` returns `0x161c28` (1449000).

## Status

**Measured.** AP4M agent payments ran end to end on 2026-10-24: two payments of
0.01 RLUSD settled to the merchant payout wallet, confirmed by reading the RLUSD
contract directly rather than trusting the service's own view. Both channels closed.
Budget 20 RLUSD cap, 0.02 used. Five validated testnet transactions exist across the
two halves of the project, which satisfies the eligibility rule that a project land at
least one transaction on XRPL or its EVM sidechain.

**Measured.** On Speculos, `app-xrp` 2.8.2 displayed the transaction type, account,
source tag, both invoice bindings, amount, full destination and memo for a `Payment`.
The device application already supports 33 transaction types; the signer kit above it
exposes three methods and no type awareness, so the gap is host-side.

**Scope — read this before quoting the line above.** That measurement concerns the
`Payment` transaction type only. Nobody has tested NFT, AMM, Escrow, Payment Channel or
multisig display, and Ledger's own page says those types are where support breaks. It
also does not contradict the reading that no clear-signing *framework* for XRPL exists —
no such framework exists.

**Not done.** The approver app has not been run against a physical device or the live
testnet from the build environment; `npm run e2e` exercises the path with a software key
instead. The gate has no authentication and keeps state in memory. Non-`Payment`
transaction types show a "no preview yet" notice and need the device's blind-signing
setting. None of the five filings has been submitted.

**Broken entry point.** `SETUP.md` and the `demo` script both call `run-ap4m.cjs`, which
is not in the repository. Use the verified commands below until that lands.

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

AP4M service side, without spending gas:

```bash
node signin-check.cjs
node check-rlusd.mjs
node verify-receipt-onchain.mjs
```

## Layout

| Path | What it is |
|---|---|
| `ledger-approver/` | Policy engine, gate service, React approver app, tests |
| `filings/` | Five DX defect filings and device evidence |
| `vi-replay/` | Verifiable-intent replay fixtures and the audit validator |
| `context-workspace/` | The staged pipeline the filings were produced through |
| `*.mjs`, `*.cjs` at root | AP4M agent, x402 examples, wallet and receipt verification |
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

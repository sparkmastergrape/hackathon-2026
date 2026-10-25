# AP4M Hackathon — Wallet Setup

Three wallets across two chains. Keep them straight.

| Role | Chain | Address | Key in `.env` | Needs gas? |
|---|---|---|---|---|
| **Agent** (pays) | XRPL EVM | `0x37f2f4166646ea3cea94bb37babd88a01f52a7a2` | `AGENT_PRIVATE_KEY` | **Yes** |
| **Merchant payout** (receives RLUSD) | XRPL EVM | `0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8` | `MERCHANT_PRIVATE_KEY` | No |
| Classic XRPL | XRPL testnet | `rD7EEZcVGNrRUuFRrL3CLjHzNRnfhtpqTs` | `XRPL_SEED` | n/a |

AP4M requires the agent and merchant payout wallets to be **different addresses**.
The classic `r…` wallet is a separate chain and cannot be used in MetaMask or AP4M.

## Status — working

Verified end to end on 2026-10-24. Two payments of 0.01 RLUSD settled to the
merchant payout wallet, confirmed by reading the RLUSD contract directly:

| Wallet | RLUSD | XRP gas |
|---|---|---|
| Merchant payout `0xFf9395aa…` | 0.02 | 78.83 |
| Agent `0x37F2F416…` | 0 | 19.999 |

Both channels are closed. Budget: 20 RLUSD cap, 0.02 used, 19.98 remaining.

Run it again with:

```bash
node run-ap4m.cjs
```

Each run opens a channel, pays `PAYMENT_RLUSD` (0.01), settles, and closes the
channel. `node signin-check.cjs` checks the service side without spending gas.

## MetaMask network

Verified against the live RPC (`eth_chainId` → `0x161c28`).

| Field | Value |
|---|---|
| Network name | XRPL EVM Testnet |
| RPC URL | `https://rpc.testnet.xrplevm.org` |
| Chain ID | `1449000` (hex `0x161c28`) |
| Currency symbol | `XRP` |
| Block explorer | `https://explorer.testnet.xrplevm.org` |

To see the RLUSD balance, import the token by its contract address from the AP4M
Network config page (`/admin/network.html`). RLUSD on this chain is an ERC-20 held
by your existing address — there is no separate RLUSD wallet.

## Classic XRPL RLUSD (optional)

RLUSD on classic XRPL is an issued token needing a trust line. Verified issuer:

- Issuer: `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV` (testnet, domain `ripple.com`)
- Currency hex: `524C555344000000000000000000000000000000`

```bash
node trustset-rlusd.mjs            # preview only, signs nothing
node trustset-rlusd.mjs --confirm  # sign and submit
```

Costs 0.2 XRP in owner reserve. Note there is **no public testnet RLUSD faucet** —
a trust line lets you hold the token, it does not give you any. Only worth doing if
you plan to demo classic-side RLUSD payments.

## Verify at any time

```bash
node verify-wallets.mjs
```

Re-derives every address from `.env`, checks the EVM chain ID, confirms each key can
sign, checks agent ≠ merchant, checks the agent matches the address registered on the
portal, and prints balances and trust lines. Exits non-zero if anything needs
attention. Prints no secrets.

## Security notes

- `.env` and `.env.*` are git-ignored; `.env.example` is deliberately not.
- `.env` is never copied by tooling and is the only place these keys exist. Back it up.
- Testnet only. Do not reuse any of these keys on mainnet.

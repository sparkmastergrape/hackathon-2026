# Ledger Approver

A human-approval gate for XRPL payments. Small, clean payments release automatically. Anything flagged
or over a cap waits in a queue, and only a signature made on a Ledger device releases it. Hard blocks
(sanctions hit, critical ledger health) cannot be approved by anyone.

```
agent / pipeline -> POST /intents -> policy -> auto-release (hot wallet)
                                           -> PENDING_APPROVAL -> approver app -> Ledger device -> verify -> submit
                                           -> BLOCKED
```

## Run it (testnet only)

Needs Node 22+, and Chrome, Edge or Brave. For no device, Docker and the Speculos emulator
(`device-management-kit-ts-workshop/xrpl-hackathon/speculos`, `./run-speculos.sh stax`).

```bash
npm install
npm test            # policy and gate tests, no network
npm run gate        # terminal 1: gate service on 127.0.0.1:8787, funds demo wallets from the faucet
npm run dev         # terminal 2: approver app on http://localhost:5173
npm run e2e         # optional: full run on testnet with a software key instead of a device
```

In the app: Connect (Speculos or USB), Fund (testnet faucet), Seed demo payments, open the large
payment, Approve and sign on device. On Speculos, tap through the review and hold to sign.

## Policy (`server/policy.mjs`)

| Trigger | Outcome |
| --- | --- |
| Amount above `PER_TX_CAP_XRP` (default 50, placeholder) | approval |
| Rolling 24h total above `DAILY_CAP_XRP` (default 200, placeholder) | approval |
| Compliance risk `high`, or screening `pending` | approval |
| Amount at or above 3000 USD with no travel-rule data | approval |
| First payment to a destination | approval |
| Risk `blocked`, or ledger health `critical` | hard block |
| Anything it cannot evaluate | approval (default deny) |

## How signing works

1. Approver presses Approve. The gate builds the Payment now (fresh sequence, fee, `LastLedgerSequence`
   about 10 minutes out) from the stored intent, so the browser cannot change it.
2. The app sends `encode(tx)` bytes to the device (`signTransaction`; the XRP app adds the prefix itself).
3. The device returns a DER signature. The gate attaches it, checks `verifySignature`, checks the signer
   is the approver account, then submits.

## Known limits

- The gate has no authentication. It is a localhost demo; put real auth in front before anything else.
- The approver is trusted on first use unless `APPROVER_ADDRESS` is set.
- State is in memory. Restarting the gate clears the queue.
- Payment only. Other transaction types show a "no preview yet" notice and need the device's Blind signing setting.
- Not yet run against a **physical** device. `npm run e2e` covers the same gate path with a
  software key in place of the device, so the device leg of the flow is the one part still
  unexercised outside Speculos.

## Measured

`npm run e2e` ran against live XRPL testnet on 2026-10-24 and exited clean. All four cases
behaved, and the two releases landed real transactions:

| Case | Result |
| --- | --- |
| small payment (auto-release) | CONFIRMED `045CD5F1B38B07F98C8B018A44644FA8162853C66554478722DF7AED49AD4C53` |
| sanctioned destination (hard block) | BLOCKED `SDN_BLOCKED`, nothing submitted |
| above cap (waits) | `PENDING_APPROVAL` `OVER_TX_CAP`, nothing submitted |
| above cap (approved, signed, submitted) | CONFIRMED `56A4AF7D1DB3AC0E29F993FB0A766176C02070E58F018C314F969CAC2F4026EF` |

`npm test` passes 27/27 (policy and gate, no network). `npm run build` is clean.

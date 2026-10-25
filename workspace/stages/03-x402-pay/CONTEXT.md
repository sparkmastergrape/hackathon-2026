# Stage 03 — the x402 hot path
One job: buy a resource over HTTP 402 without writing to the chain.
Signs vouchers off-chain. Moves no funds on chain. Costs no gas.

## Inputs
| File | Layer | Which sections matter |
|------|-------|-----------------------|
| ../02-channel/output/channel.md | 4 | channel id, cap, status |
| references/wire-format.md | 3 | headers, requirements, payload |
| ../../_config/run.md | 3 | scheme, network id, RLUSD address |

## Process
1. Start the merchant: `npm run merchant` on port 4021, or set `PORT`. Set
   `MERCHANT_ADDRESS` so the payout check runs rather than being skipped.
2. Run the agent: `CHANNEL_ID=0x... npm run x402`. Set `X402_PAYMENTS` above 1 to
   show several payments on one channel. That is the "authorize once, transact
   many times" claim made concrete.
3. For each payment capture four beats: the 402 and its invoice, the vetting
   result, the signed running total, and the 200 with its PAYMENT-RESPONSE.
4. Read `GET /vouchers` and record the highest cumulative amount. Stage 05
   redeems that one.
5. Confirm the chain did not move: on-chain `redeemed` is unchanged from stage 02.

## Outputs
| File | Format | Location |
|------|--------|----------|
| payments.md | md | output/payments.md |
| vouchers.json | json | output/vouchers.json |

`payments.md` records each payment's invoice id, price, running total and decoded
receipt. `vouchers.json` is the merchant's `/vouchers` body verbatim.

## Audits (run BEFORE writing output)
- [ ] On-chain `redeemed` was re-read and is unchanged. No chain write happened.
- [ ] Each amount says whether it is the price or the running total.
- [ ] The recorded merchant port is the one holding the vouchers. Several
      merchant processes may be listening and only one holds them.

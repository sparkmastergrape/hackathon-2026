# Run configuration

Invariant across runs. Read by stages that need them; none are secret.

| Key | Value | Source |
|---|---|---|
| Service | https://hackathon.ap4m.build | hackathon staff |
| Chain | XRPL EVM Testnet, id 1449000 (hex 0x161c28) | GET /public/config |
| RPC | https://rpc.testnet.xrplevm.org | GET /public/config |
| Explorer | https://explorer.testnet.xrplevm.org | GET /public/config |
| PaymentLedger | 0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91 | GET /public/config |
| ParticipantRegistry | 0x4cF27435FE56161aa9b1cffdD87784aa68b7D1E8 | GET /public/config |
| PooledEscrowVault | 0x83DD9cD010eb46e96eceF8F7eB0a18f7845AaBC0 | GET /public/config |
| RLUSD (ERC-20) | 0x27b57a9D0b8d24EB97259c4E2279e45255e016f3 | GET /public/config |
| Gas faucet | https://faucet.testevm.ripple.com | GET /public/config |
| Team name | Pending | participant portal |
| Agent wallet | 0x37F2F4166646Ea3cea94BB37BaBD88a01F52A7A2 | AGENT_PRIVATE_KEY |
| Merchant payout | 0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8 | MERCHANT_PRIVATE_KEY |
| x402 scheme | ap4m-voucher | this workspace |
| x402 network id | eip155:1449000 | CAIP-2 for the chain above |

Per-run values (price, cap, payment count) come from the repo root `.env`:
`PAYMENT_RLUSD`, `CHANNEL_CAP`, `X402_PAYMENTS`.

Always re-read GET /public/config at the start of a run. Contract addresses are
the service's to change, not ours. The kit hardcodes the PaymentLedger address
and that hardcoded value wins over the config, so a redeploy breaks it silently.

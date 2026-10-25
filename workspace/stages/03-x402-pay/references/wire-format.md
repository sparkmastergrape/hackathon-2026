# x402 wire format, as this merchant implements it

Envelope from the x402 v2 spec. Payload is AP4M specific.

## Headers

| Header | Direction | Contents |
|---|---|---|
| PAYMENT-REQUIRED | merchant to agent | base64 JSON challenge, on the 402 |
| PAYMENT-SIGNATURE | agent to merchant | base64 JSON payload |
| PAYMENT-RESPONSE | merchant to agent | base64 JSON result, on the 200 |

The challenge is sent twice, in the header and in the 402 body, because clients
differ on which they read.

## The 402 challenge

```json
{ "x402Version": 2, "resource": "market-sentiment/v1",
  "accepts": [ {
    "scheme": "ap4m-voucher",
    "network": "eip155:1449000",
    "asset": "0x27b57a9D0b8d24EB97259c4E2279e45255e016f3",
    "amount": "10000000000000000",
    "payTo": "0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8",
    "maxTimeoutSeconds": 300,
    "extra": { "invoiceId": "INV-…", "verifyingContract": "0xcAB4…aE91",
               "eip712": { "domain": {}, "types": {} } } } ] }
```

`amount` is RLUSD in wei, 18 decimals. It is the price of this call, not the
running total.

## The payload

```json
{ "x402Version": 2, "accepted": { },
  "payload": { "voucher": { "channelId": "0x…", "cumulativeAmount": "20000000000000000" },
               "signature": "0x…" } }
```

`cumulativeAmount` is the running total for the channel, not this payment. It is
what the PaymentLedger compares against the redeemed watermark and the cap.

## The voucher signature

EIP-712. Domain `AP4M Payment Ledger`, version `1`, the chain id, and the
PaymentLedger as verifying contract. One type, `Voucher`, with `channelId`
(bytes32) and `cumulativeAmount` (uint256). This comes from the kit's own
`signVoucher`, so it is certain.

## Merchant verification order

Envelope, then invoice, then signature, then channel, then policy. An earlier
check failing makes a later one meaningless. The channel's agent and payout are
always read from the contract and never taken from the client.

Refusal reasons: `invalid_envelope`, `unsupported_scheme`, `invalid_network`,
`unknown_invoice`, `invoice_already_used`, `invoice_expired`, `amount_mismatch`,
`malformed_voucher`, `missing_signature`, `unverifiable_signature`,
`unknown_channel`, `signer_is_not_the_channel_agent`, `channel_not_open`,
`payout_mismatch`, `over_cap`, `cumulative_amount_mismatch`.

## Why the scheme is not called "exact"

In x402, `exact` means a presigned XRPL `Payment` blob, verified by a facilitator
against the classic XRPL. This carries an EIP-712 voucher for a contract on the
EVM sidechain. Naming it `exact` would invite a stock x402 client to sign the
wrong thing, so it is `ap4m-voucher` and such a client refuses it instead.

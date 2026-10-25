# Measured facts

Every line here was observed. Nothing on this page is reasoned. Anything that is
reasoned belongs in `INFERENCES.md` instead.

Session of record: this workspace's own session, unless a line names another.

## Chain identifiers

| Network | Chain ID | How | Date |
| :-- | :-- | :-- | :-- |
| XRPL EVM mainnet | 1440000 (`0x15f900`) | `eth_chainId` against `https://rpc.xrplevm.org` | 24 Oct 2026 |
| XRPL EVM testnet | 1449000 (`0x161c28`) | `eth_chainId` against `https://rpc.testnet.xrplevm.org` | 24 Oct 2026 |

CAIP-2 for native XRPL: `xrpl:0` mainnet, `xrpl:1` testnet, `xrpl:2` devnet.

## The facilitator

`GET https://xrpl-facilitator-testnet.t54.ai/supported`, 24 Oct 2026:

```json
{"kinds":[{"x402Version":2,"scheme":"exact","network":"xrpl:1"},
          {"x402Version":2,"scheme":"upto","network":"xrpl:1"}],
 "extensions":["x402Secure"],
 "signers":{"xrpl:*":[]}}
```

No EVM network is served. `batch-settlement` was advertised on 22 Oct and is not
advertised now, so capabilities change during the event.

## What the ledger refuses

| Case | Result |
| :-- | :-- |
| Same signed Payment submitted twice | `tefPAST_SEQ` |
| New Payment reusing the same `InvoiceID` | **`tesSUCCESS`** |
| Same signed CheckCash submitted twice | `tefPAST_SEQ` |
| New CheckCash against a cashed Check | `tecNO_ENTRY` |

**XRPL does not enforce `InvoiceID` uniqueness.** Replay protection comes from
sequence numbers and from the Check being consumed, not from the invoice.

## The device

app-xrp 2.8.2 on an emulated Nano X, driven by the DMK XRP signer kit. Account
`ra7Zr8ddy9tB88RaXL8B87YkqhEJG2vkAJ`, path `44'/144'/0'/0/0`.

Screens shown for a `Payment` carrying invoice binding:

```
Review transaction
Transaction Type | Payment
Account          | ra7Zr8ddy9tB88RaXL8B87YkqhEJG2vkAJ
Source Tag       | 20260530
Invoice ID (1/2) | 2227e000bf9e86edc2c0a77052f25ec4122fb57ff1150457969d0e60
Invoice ID (2/2) | 964521ce
Amount           | XRP 0.001
Fee              | XRP 0.00001
Destination      | rMNL5bR3CJEmJpR6TXbvTMSEwr79RX3AE3
Memo Data [1]    | A9D47874D3B34C599D4A01D7A28A55BD
Sign transaction?
Reject transaction
```

Not a hash. The amount, the full destination and both invoice bindings are
readable, then an explicit refusal.

**Scope this to `Payment`.** NFT, AMM, Escrow, Payment Channel and multisig
display are untested. One Escrow test could refute the general form.

## The signature

The XRP signer kit returns DER bytes, not `{ r, s, v? }`. The on-ledger
`TxnSignature` from a device-signed Payment:

```
3044022023A996B45D7B0578C5209204C007FFFB8891E5FF90AED72DE9C0BDE2C1592B24022036DBF5F97F3F54DB258BC6E4DDB5D73A71247BA512FE65C41C9845A9DB83B0CF
```

70 bytes, valid DER. Lengths of 70 and 71 were both observed, so do not write a
fixed-width parser.

## Settled transactions, all `xrpl:1`

- `9989EABF0FDBC7ED2197609D8A212DF422829235E90CC108DB35C181529E7C08` — device-signed
- `67AFADBD…F8BBA6` — device-signed
- `8632FAD8…3E774AF` — device-signed
- `70FB55C6…75C5BE` — stand-in signer
- `6BD28B8F…11B9CC` — stand-in signer

## Produced by other sessions

Recorded here so nothing is lost, and attributed so nothing is misclaimed.

- 18 device captures from Flex, Stax and Apex P, driven by `hw-app-xrp` 6.38.0.
  Produced by the DNS-audit session. Released for filing 04 by JD.
- `speculos-xrp/device-screens.png`, an eight-screen Nano X composite with no
  invoice binding. Produced by JD's fork session. **Withheld by JD.** Do not
  publish it and do not describe its contents in a document that goes out.

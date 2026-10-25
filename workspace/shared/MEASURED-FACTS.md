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

## AP4M x402 on the EVM sidechain, chain 1449000

Added 25 Oct 2026 by the AP4M build session.

**This is a different x402 implementation from the t54 facilitator above.** The
facilitator serves `xrpl:*` and no EVM network. AP4M is its own service on chain
1449000, with its own contracts and its own scheme name. Do not read a fact about
one as a fact about the other.

| Thing | Value |
| :-- | :-- |
| Service | `https://hackathon.ap4m.build` |
| Scheme in the 402 challenge | `batch-settlement` |
| PaymentLedger | `0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91` |
| PooledEscrowVault | `0x83DD9cD010eb46e96eceF8F7eB0a18f7845AaBC0` |
| RLUSD (ERC-20, 18 dp) | `0x27b57a9D0b8d24EB97259c4E2279e45255e016f3` |
| `confirmationBlocks` in the x402 context | 1 |
| Redemption selector | `0x21eb2efb`, recomputed from `redeemVoucher((bytes32,uint256),bytes)` |

Settled payments are **not transcribed here.** They live in
`tracks/build/stages/01-measure/output/measurements.md`, written straight from
the chain by `icm-x402-evidence.mjs` at the repository root. Re-run that script
to re-measure; copying a hash out of it into this page would break rule 13.

As of block 9228805, 25 Oct 2026: 16 `VoucherRedeemed` events across 5 channels,
0.29 RLUSD redeemed in total, and the payout wallet reconciles exactly against
its incoming and outgoing RLUSD transfers. The figure moves whenever anyone runs
the demo, so treat any total as a snapshot with its block.

**Voucher amounts are cumulative per channel.** The signed field is the running
total, not the amount of the payment. Observed across nine redemptions on channel
`0x6d824358…`, where the cumulative rose monotonically.

**The `VoucherRedeemed` event records `agent` and `submitter` separately.** In the
x402 path they differ: the Agent authorises and the Merchant sends. The ledger
records the separation, so it is not only a claim about our own code.

### What is not established

- The PaymentLedger is **not source-verified** on the public explorer. That a
  65-byte signature is mandatory in the calldata is measured. That the contract
  checks it is not.
- `https://hackathon.ap4m.build/llms.txt` and `/docs/*.md` return **HTTP 401**
  without a participant session, so an agent cannot read the service's own
  guides. `GET /public/config` and `GET /public/x402-context` are unauthenticated.
- No device and no human approval exist anywhere in this path. Every signature is
  from a software key.

### The spending ceiling refuses — 25 Oct 2026

A Merchant priced at 0.50 RLUSD against an Agent ceiling of 0.10 was refused by
two independent layers, both **before** a voucher was signed:

- the Agent's own decode-and-compare of the 402 challenge, exit code 3;
- `buyResource` in the AP4M SDK, *"Merchant challenge exceeds the configured
  purchase authority"*, which still refuses when the Agent's own check is skipped.

Neither refusal reached the Merchant or the ledger. The Merchant quoted the high
price without complaint.

The chain recorded nothing across the run: 12 redemptions on channel
`0x6d824358…` before and after, no new claim IDs, cumulative 0.24 and payout
balance 0.27 RLUSD both unchanged over 11 blocks. Rig and raw output in
`tracks/build/stages/03-prove/output/refusal-case.md`.

**The boundary was run, one base unit apart.** The ceiling is 100000000000000000
base units.

| Price, base units | Relation to ceiling | Outcome | Chain |
| :-- | :-- | :-- | :-- |
| 100000000000000001 | one above | refused by both layers, exit 3 | 12 redemptions before and after, delta 0 |
| 100000000000000000 | exactly equal | **bought** | 13th redemption, amount exactly 100000000000000000 |

**The comparison is `>`, so the ceiling is inclusive:** a price equal to the limit
is spendable. State which side the boundary falls on when quoting a ceiling.

The equal case is also the control that must pass — a rule that rejected its own
legitimate input would have failed there. Still not run: one base unit *below*
the ceiling, and anything involving the channel cap, a device or a human.

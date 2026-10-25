# For `Payment`, the XRP app already displays every field a human needs

**To:** Ledger — Track 01, Protocol Innovation (Core)
**Page:** `developers.ledger.com/xrplnyc`

**Scope first, because it decides whether this filing is right: this concerns the
`Payment` transaction type only.** We tested no other type. We make no claim about
NFT, AMM, Escrow, Payment Channel or multisig display, and the page itself says
those are where support breaks.

## What the page says

Quoted from `developers.ledger.com/xrplnyc`, read on 2026-10-25. Capture:
`evidence/pages/xrplnyc-full.png`.

> "there is still no XRPL transaction Clear Signing"

And, of the layer above the signer kit:

> "nothing above it understands the types yet, so there are no type-aware helpers
> and no Clear Signing."

## What we measured

A `Payment` carrying a source tag, a destination tag, an invoice ID and a memo,
signed on **three Ledger touch devices** running Ledger's own `app-xrp` 2.8.2:
Flex, Stax and Apex P. Each one paged the whole transaction across **five review
pages**, then asked for a deliberate hold to sign.

Every screen below was read from its capture, not from a description of it. Six
images per device sit in `evidence/flex/`, `evidence/stax/` and `evidence/apex-p/`,
numbered in page order and named for the fields they carry, so the filenames
differ slightly between devices where the paging differs.

### The field set is the same on all three

| Field | Flex | Stax | Apex P |
|---|---|---|---|
| Transaction Type `Payment` | p2 | p2 | p2 |
| Account, in full | p2 | p2 | p2 |
| Source Tag `402` | p2 | p2 | p2 |
| Destination Tag `4242` | p2 | p2 | p2 |
| Invoice ID, all 32 bytes | p3 | p3 | p3 |
| Amount `XRP 0.001` | p3 | p3 | p3 |
| Fee `XRP 0.000012` | p3 | p3 | p3 |
| Destination, in full | p4 | p3 | p4 |
| Memo Type [1] `x402/invoice` | p4 | p4 | p4 |
| Memo Data [1] `inv-2026-10-24-0001` | p4 | p4 | p4 |
| Sign transaction? · Hold to sign | p5 | p5 | p5 |

**Screen size changes how the fields are packed onto pages, not which fields
appear.** Stax is tall enough to carry the destination onto page 3; the other two
start page 4 with it. All three take five pages and show the same ten fields.

Both addresses and the 32-byte invoice ID are shown in full, wrapped across
lines. Nothing is truncated to a prefix, and nothing is shown as a hash.

`Reject` is present on every review page, not only at the end.

The Apex P is worth singling out. At 300x400 it has the smallest of the three
touch screens, smaller than the Flex in both dimensions, and it still renders
every field in full. This is not a result that depends on a large display.

### Receipt

All three devices returned the same signature, which is what deterministic ECDSA
over one key and one transaction should produce:

```
3045022100C8387EC79D99D9E6D3E863E1920781CF2277497BEBE7BA14134D27F4037B
405D022068598841314BADBE4DED9FADD6C3C33439277C0D637A1F12C37B9E1380FABDE4
```

71 bytes. `30` SEQUENCE, declared length 69 matching actual, `02 21` plus a
33-byte `r` carrying a leading zero, `02 20` plus a 32-byte `s` without one. That
is the DER length variability described in `01-signer-return-type.md`, now with a
second receipt showing the cause.

**These transactions were not submitted to a ledger.** The signatures were
produced and discarded. The claim here is about what the devices display, and
nothing in it depends on a ledger result.

### How to reproduce

`evidence/flex/capture.cjs` drives a whole run and writes every screen. It takes
the device from the environment:

```
MODEL=stax PORT=5002 node capture.cjs
```

The unsigned transaction is in each directory's `unsigned-tx.json`, its serialized
form in `unsigned-tx.hex`, and the screen text as the emulator itself reports it
in `screens.json`.

## Two Nano X runs, on the DMK signer kit

The three runs above used LedgerJS. Two earlier runs used the Device Management
Kit signer kit on an emulated Nano X, the smallest screen of the four at 128x64.
They are separate transactions and they carry different fields. Keep them apart.

### Nano X, binding run — nine fields

Measured through the DMK signer kit, same account:

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

This is the run that matters most for the argument, because it is the one that
reaches the same conclusion on Ledger's own current stack. The source tag, the
invoice ID and the memo all render. The invoice ID pages across two screens and is
labelled `1/2` and `2/2` rather than being truncated.

It carried no destination tag and no memo type, so none is shown. Its fee is
`XRP 0.00001` and its destination differs from the touch runs. **It is nine
fields, not the ten in the table above, and the two sets must not be merged.**

### Nano X, plain run — eight screens

A different `Payment` on the same emulated device paged across eight screens:
Review transaction, Transaction Type, Account, Amount, Fee, Destination, Sign
transaction?, Reject transaction.

**That transaction carried no source tag, no invoice ID and no memo**, so its
screens show none. It is not evidence for either richer field list, and we do not
present it as such.

## The reconciliation, and why we think your sentence is about a different layer

The second quote above says "nothing **above it** understands the types yet". That
describes the tooling layer, not the device application. Elsewhere the page says
the device app can sign a wide range of XRPL transactions.

`app-xrp`'s own README advertises support for 33 transaction types and a review
screen that pages through all the details of a transaction.

So we read your sentence two ways:

1. **No Clear Signing framework exists for XRPL** — no type-aware helpers, no
   ERC-7730-style descriptors. We agree. No such framework exists, and the signer
   kit exposes only `getAppConfig`, `getAddress` and `signTransaction`.
2. **No human-readable display exists on the device** — for `Payment`, this is
   not what we observed.

Only reading 2 is affected by our measurement, and only for `Payment`.

## Why we are filing it

The blanket phrasing understates what the device already does for the most common
transaction type. A team reading that sentence concludes the screen shows nothing
a human can check, and drops the human-approval demo that the Agentic Finance
track asks for. We nearly did.

The memo and invoice fields matter here specifically. An agent payment binds a
payment to an invoice, and a human approving that payment needs to see the
binding, not just the amount. Page 4 of 5 shows it.

Your brief asks people to "find where it breaks". The honest answer for `Payment`
is that it does not. The gap is the layer above the signer kit, and the
transaction types beyond `Payment`.

## Suggested change

Scope the sentence to the tooling layer, or name the transaction types where
on-device display is thin. Something closer to: there are no type-aware helpers
and no Clear Signing framework for XRPL, and on-device field display varies by
transaction type.

## Scope and limits

- `Payment` only. One transaction type out of the 33 the app claims.
- Speculos emulator, image digest
  `sha256:028d1e368244631578537e7ca50b6f13ca2932b5f3fd220627289b559c07a886`.
  **Not tested on physical hardware.**
- `app-xrp` 2.8.2 throughout. Per-device `app.sha256`:

  | Model | `--model` | Screen | `app.sha256` |
  |---|---|---|---|
  | Flex | `flex` | 480x600 | `ca1cda6393977e7840cfe6c6e9804f4be390e908bb156416ab15cafa19afe809` |
  | Stax | `stax` | 400x672 | `d50fb4f3eab9478251417f9d69b2d3d2e0533da7ea50c63764990728d1d3bd3b` |
  | Apex P | `apex_p` | 300x400 | `ea1645e392b27fefd010e46c26222f3fb7bb78c698fb981dabcb2c6ab7962e56` |
  | Nano X | `nanox` | 128x64 | `4f46046e81afcd052f99d3e9551b8fa38d55df689c13a9d5e280065c0c589678` |

- Derivation path `44'/144'/0'/0/0` on all four.
- **Which host library drove which run.** The DMK signer kit drove both Nano X
  runs, including the binding run above and the signature receipt in
  `01-signer-return-type.md`. The three touch runs were driven by
  `@ledgerhq/hw-app-xrp` 6.38.0 over `@ledgerhq/hw-transport-node-speculos-http`
  6.36.7. Both paths were available to us; we ran DMK for the signature claims and
  LedgerJS for the device sweep. The review screens are rendered by the device
  application in response to the signing APDU, so the host library does not change
  what is displayed — but the distinction is recorded here rather than left to be
  inferred.
- Transaction serialized with `ripple-binary-codec` 2.11.0.
- One memo. We did not test how the devices page two or more.
- The three touch devices were tested with one transaction, not a range. A
  different field mix may page differently.
- **Four devices widen device coverage, not transaction coverage.** The claim is
  still scoped to `Payment` exactly as the first paragraph states. One Escrow test
  could still refute the general form of this argument, and we have not run one.

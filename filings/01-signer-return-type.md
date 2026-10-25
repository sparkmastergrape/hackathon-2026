# The XRP signer reference documents a return type the shipped kit does not use

**To:** Ledger — Track 01, Protocol Innovation (Core)
**Page:** `developers.ledger.com/docs/device-interaction/references/signers/xrp`
**Section:** Use Case 3: Sign Transaction → Returns
**Package:** `@ledgerhq/device-signer-kit-xrp` 0.3.0

## What the page documents

Under *Use Case 3: Sign Transaction → Returns*, the page declares:

```typescript
type Signature = {
  r: string;
  s: string;
  v?: number;
};
```

## What the shipped kit returns

DER-encoded bytes. Not three fields.

The installed package's own type documentation states
`SignTransactionDAOutput = Signature = Uint8Array`, described as DER-encoded for
secp256k1 and "kept as raw bytes rather than being split into `{ r, s, v }` the
way the Ethereum signer does".

### Receipt

A device-signed XRPL testnet `Payment`, result `tesSUCCESS`, carried this
`TxnSignature`:

```
3044022023A996B45D7B0578C5209204C007FFFB8891E5FF90AED72DE9C0BDE2C1592B24
022036DBF5F97F3F54DB258BC6E4DDB5D73A71247BA512FE65C41C9845A9DB83B0CF
```

70 bytes. `30` SEQUENCE, declared length 68 matching actual, `02 20` plus a
32-byte `r`, `02 20` plus a 32-byte `s`. Well-formed DER.

**Lengths of 70 and 71 bytes were both observed across runs**, with the same key
and the same code path. DER keeps or drops a leading zero byte depending on the
high bit of `r` and of `s`. Do not write a fixed-width parser for this.

A 71-byte case is recorded in `04-clear-signing-payment.md` with its structure
broken out: `02 21` and a 33-byte `r` carrying a leading zero, against `02 20` and
a 32-byte `s` without one. That run used a different host library, so it is
corroboration of the encoding, not a second measurement of this kit.

The signing bridge that produced the signature performs no encoding step. The one
line that touches the kit's return value is:

```javascript
signatureDer: Buffer.from(signature).toString("hex").toUpperCase(),
```

`signature` is the kit's return value, unmodified. Nothing in the file reads `.r`
or `.s`. `Buffer.from` accepts a `Uint8Array`, which is what the kit returns, so
the argument is not that DER is the only thing this line accepts — it is that a
plain `{ r, s, v }` object would have thrown a `TypeError` before `toString` ran.
The request would have failed. Instead it produced a signature, and the ledger
accepted it.

The proof is those two facts together: the code shows no encoding step, and the
ledger shows DER arrived.

## Why this costs a developer an afternoon

A developer who reads the reference page writes code to read `.r` and `.s`. That
code receives a `Uint8Array`. `Buffer.from` on the result still succeeds, so the
failure does not appear at the call site. It appears later, as a transaction the
ledger rejects for a malformed signature, which reads as a signing or key problem
rather than a type problem.

The error also points away from its cause. XRPL `TxnSignature` requires DER, so a
developer who hand-assembles `r` and `s` into DER gets a working transaction and
never learns the kit already did it.

## Suggested change

Replace the `Signature` type in the Returns section with the shipped type:

```typescript
type Signature = Uint8Array;  // DER-encoded
```

The `{ r, s, v }` shape appears to be carried over from the Ethereum signer
reference, where it is correct.

## Related, same page

The derivation path examples on this page disagree with each other. That is filed
separately as `03-derivation-path.md`.

## Scope

- Measured against `@ledgerhq/device-signer-kit-xrp` 0.3.0, the published
  `latest` at the time of writing.
- Measured on Speculos with `app-xrp` 2.8.2, Nano X, path `44'/144'/0'/0/0`.
- The transaction was an XRPL `Payment` on testnet. No other transaction type was
  exercised through the signer.

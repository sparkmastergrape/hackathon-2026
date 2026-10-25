# The portal is serving XRP signer docs from before the 2026-10-22 fix, so the wrong return type is what hackathon participants read

**To:** Ledger — Track 01, Protocol Innovation (Core)
**Page:** `developers.ledger.com/docs/device-interaction/dmk-ts/references/signers/xrp`
**Section:** Use Case 3: Sign Transaction → Returns
**Package:** `@ledgerhq/device-signer-kit-xrp` 0.3.0
**Source of truth:** `LedgerHQ/device-sdk-ts`, `apps/docs/content/docs/references/signers/xrp.mdx`

> **Read this before filing.** An earlier draft of this filing reported the return
> type as a documentation error and asked for it to be corrected. That draft was
> out of date. **You already fixed it**, in commit `6e8c60f0` on 2026-10-22, and
> the fix in your repository is character-for-character the change that draft was
> going to request. Filing the original would have earned a one-line reply.
>
> The defect that survives is not the type. It is that the published portal does
> not have your fix, two days later, during the event whose brief points
> participants at that page.

## What the published page serves today

Read live from the URL above on 2026-10-25, under *Use Case 3: Sign Transaction →
Returns*:

```typescript
type Signature = {
  r: string;
  s: string;
  v?: number;
};
```

Screenshot: `evidence/pages/xrp-signer-uc3-returns-signature.png`.

## What your repository says

`develop`, same file, same section:

```typescript
/** DER-encoded for secp256k1, 64 raw bytes for Ed25519. Its uppercase hex goes in `TxnSignature`. */
type Signature = Uint8Array;
```

Commit `6e8c60f0`, 2026-10-22T08:22:20Z, *"📝 (docs): Document the curve option of
the XRP signer"*. Its diff on this file:

```diff
-type Signature = {
-  r: string;
-  s: string;
-  v?: number;
-};
+/** DER-encoded for secp256k1, 64 raw bytes for Ed25519. Its uppercase hex goes in `TxnSignature`. */
+type Signature = Uint8Array;
```

## The publishing gap is wider than one type

That commit and `109740f4` the same morning also documented the `curve` option.
We counted occurrences in the live page's rendered text:

| Term | In `develop` | On the published page |
|---|---|---|
| `curve` | yes | **0 occurrences** |
| `Ed25519` | yes | **0 occurrences** |
| `Secp256k1` | yes | **0 occurrences** |
| `6f88` | yes | **0 occurrences** |
| `DER-encoded` | yes | **0 occurrences** |
| `v?: number` | removed | **present** |

So the portal is not serving a page with one stale block. It is serving a build
of this page from **before 2026-10-22**. Every word of the Ed25519 curve
documentation — a shipped feature of the signer kit, with a stated minimum app
version — is absent from the page a developer actually reads.

## Receipt for the type itself

Independently of the docs, we measured what the kit returns. A device-signed XRPL
testnet `Payment`, result `tesSUCCESS`, carried this `TxnSignature`:

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
ledger shows DER arrived. **This confirms your own `develop` text is right.** We
are not asking you to take our word for the type; we are reporting that your
readers cannot see the sentence you already wrote.

## Why this costs a developer an afternoon, today

The error is fixed in your repository, so it will not be found by anyone checking
the repository. It is live on the portal, so it will be found by everyone reading
the portal — which is where your own event brief sends them.

A developer who reads the published page writes code to read `.r` and `.s`. That
code receives a `Uint8Array`. `Buffer.from` on the result still succeeds, so the
failure does not appear at the call site. It appears later, as a transaction the
ledger rejects for a malformed signature, which reads as a signing or key problem
rather than a type problem.

The error also points away from its cause. XRPL `TxnSignature` requires DER, so a
developer who hand-assembles `r` and `s` into DER gets a working transaction and
never learns the kit already did it.

The same gap hides `Curve.Ed25519` entirely. A participant cannot choose a curve
they cannot read about.

## Suggested change

Nothing in the `.mdx`. The content fix landed on 2026-10-22 and it is correct.

1. **Rebuild and redeploy the developer portal** from current `develop`, so that
   `6e8c60f0` and `109740f4` reach readers.
2. If the portal builds from a release branch or a tag rather than `develop`,
   that is the actual finding, and the question is what the docs release cadence
   is and whether a docs-only fix can ship without waiting on a package release.
3. Consider showing a build or commit stamp on the portal. We could only detect
   this by diffing the rendered page against the repository; a reader cannot.

## Scope and limits

- Read from the live page on 2026-10-25. **The page may change, possibly in
  response to this filing** — `evidence/pages/` holds the capture it was read
  from.
- Term counts are of the rendered `innerText` of that one page, not of the whole
  portal. **We did not check whether other pages are also stale**, and we do not
  claim the portal as a whole is behind.
- We did not determine which branch or tag the portal builds from. Point 2 above
  is a question, not a finding.
- The original URL this filing cited,
  `developers.ledger.com/docs/device-interaction/references/signers/xrp`,
  redirects to the `dmk-ts` path above. Both reach the same page.
- The signature measurement is against `@ledgerhq/device-signer-kit-xrp` 0.3.0,
  the published `latest` at the time of writing, on Speculos with `app-xrp` 2.8.2,
  Nano X, path `44'/144'/0'/0/0`. The transaction was an XRPL `Payment` on
  testnet. No other transaction type was exercised through the signer.
- We did not test `Curve.Ed25519`. We report only that it is documented in
  `develop` and absent from the published page.

## Related, same page

The derivation path examples on this page disagree with each other. That is filed
separately as `03-derivation-path.md`, and unlike this one, **it is still wrong in
`develop`** — a one-line PR fixes it.

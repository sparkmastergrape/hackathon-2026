# Ready to submit

**Status 2026-10-25: two of six are FILED.**

| Filing | Channel | Status |
|---|---|---|
| `03-derivation-path.md` | PR | **FILED** — https://github.com/LedgerHQ/device-sdk-ts/pull/2050 |
| `01-signer-return-type.md` | Issue | **FILED** — https://github.com/LedgerHQ/device-sdk-ts/issues/2051 |
| `02`, `04` | event page, no repo | not sent — needs a human channel |
| `05`, `06` | Mastercard AP4M | not sent — needs a human channel |

### One step left on PR #2050

The commit is **unsigned**. `CONTRIBUTING.md` requires signed commits for
protected branches, enforced by GitHub rulesets. A GPG signature is the
submitter's own assertion, so it was left for you:

```bash
cd /c/Users/JD/AppData/Local/Temp/dsdk
git config user.signingkey E333DC5D1A56AF6F
git commit --amend --no-edit -S
git push --force-with-lease
```

For the signature to show as **Verified**, the key's email must be a verified
email on the GitHub account that opened the PR.

CI on #2050 at time of filing: Socket and all four Wiz scanners pass; the two
Vercel preview deploys fail with *"Authorization required to deploy"*, which is
Ledger-side fork permissions, not a defect in the change.

---

Prepared 2026-10-25. The rest has not been sent. Each block is the exact text to
post, and the channel it posts to.

The event page names no submission channel — no form, no email, no repository, no
Devpost page; its support-group link is a placeholder (`#`). Two of the six have
an unambiguous home because the brief says *"Bug reports and PRs count"* and the
docs they concern are in a public Ledger repository. The other four need a human
to pick a channel at the booth or in Discord.

---

## 1 — `03-derivation-path.md` → pull request

**Repo:** `LedgerHQ/device-sdk-ts` (public, issues enabled)
**File:** `apps/docs/content/docs/references/signers/xrp.mdx`, line 159
**Branch:** `docs/xrp-signer-derivation-path-coin-type`

**Title:**

```
📝 (docs): Fix XRP signer signTransaction derivation path example using Bitcoin's coin type
```

**Diff:**

```diff
--- a/apps/docs/content/docs/references/signers/xrp.mdx
+++ b/apps/docs/content/docs/references/signers/xrp.mdx
@@ -156,7 +156,7 @@
 - `derivationPath`
 
   - **Required**
-  - **Type:** `string` (e.g., `"m/44'/0'/0'/0/0"`)
+  - **Type:** `string` (e.g., `"44'/144'/0'/0/0"`)
   - The derivation path used for the xrp transaction. See [here](https://www.ledger.com/blog/understanding-crypto-addresses-and-derivation-paths) for more information.
```

**Body:**

```
The XRP signer reference gives two different example derivation paths on one page.

| Section | Example value | Line |
|---|---|---|
| Use Case 2: Get Address → Parameters | `44'/144'/0'/0/0` | 101 |
| Use Case 3: Sign Transaction → Parameters | `m/44'/0'/0'/0/0` | 159 |

Coin type `144'` is XRP. Coin type `0'` is Bitcoin, per SLIP-0044. The Sign
Transaction example derives from Bitcoin's coin type.

### Why the resulting failure is hard to trace

The device signs whatever path it is given, so both calls succeed. The address
returned by `getAddress` and the account that actually signed do not match, and
the ledger rejects the transaction for a signature that does not belong to the
sending account. That reads as a signing bug or a malformed blob. The cause is
two lines of example text.

The `m/` prefix difference is cosmetic. The coin type is not.

### Change

Use `44'/144'/0'/0/0` in both sections.

Found while building an XRPL agent payment flow on the DMK XRP signer kit during
the Ledger XRPL hackathon. Read from the live page and from `develop` on
2026-10-25; both values are present and disagreeing in `develop` today.
```

**Commands:**

```bash
gh repo fork LedgerHQ/device-sdk-ts --clone --remote
cd device-sdk-ts
git checkout -b docs/xrp-signer-derivation-path-coin-type develop
# apply the one-line change to apps/docs/content/docs/references/signers/xrp.mdx
git commit -am "📝 (docs): Fix XRP signer signTransaction derivation path example using Bitcoin's coin type"
git push -u origin docs/xrp-signer-derivation-path-coin-type
gh pr create --repo LedgerHQ/device-sdk-ts --base develop --title "<title above>" --body-file <body above>
```

---

## 2 — `01-signer-return-type.md` → issue

**Repo:** `LedgerHQ/device-sdk-ts`
**Not a PR.** The `.mdx` is already correct; the ask is a redeploy.

**Title:**

```
Developer portal is serving XRP signer docs from before the 2026-10-22 fix (wrong Signature type, no Ed25519 docs)
```

**Body:**

```
`developers.ledger.com/docs/device-interaction/dmk-ts/references/signers/xrp`
is serving a build of this page from before 2026-10-22, so two commits that
landed that morning have not reached readers.

### Published page, read 2026-10-25

Use Case 3: Sign Transaction → Returns:

    type Signature = {
      r: string;
      s: string;
      v?: number;
    };

### `develop`, same file, same section

    /** DER-encoded for secp256k1, 64 raw bytes for Ed25519. Its uppercase hex goes in `TxnSignature`. */
    type Signature = Uint8Array;

Fixed in 6e8c60f0 (2026-10-22, "📝 (docs): Document the curve option of the XRP
signer"). The repository is right. The portal has not caught up.

### The gap is wider than one type

Occurrences in the live page's rendered text:

| Term | In `develop` | Published page |
|---|---|---|
| `curve` | yes | 0 |
| `Ed25519` | yes | 0 |
| `Secp256k1` | yes | 0 |
| `6f88` | yes | 0 |
| `DER-encoded` | yes | 0 |
| `v?: number` | removed | present |

The entire `curve` option — a shipped feature with a stated minimum app version —
is invisible to anyone reading the portal.

### Why it matters right now

The XRPL hackathon brief links participants to this page. A developer who follows
it writes code against `.r` and `.s`, receives a `Uint8Array`, and sees the
failure much later as a ledger rejection for a malformed signature, which reads
as a key or signing problem rather than a type problem.

We confirmed the `develop` text independently: a device-signed XRPL testnet
Payment returned `tesSUCCESS` with a 70-byte DER `TxnSignature`, from a code path
that does no encoding of its own. Lengths of 70 and 71 bytes were both observed
with the same key, which is ordinary DER leading-zero behaviour and worth the
sentence your `develop` comment already gives it.

### Ask

1. Rebuild and redeploy the portal from current `develop`.
2. If it builds from a release branch or tag rather than `develop`, that is the
   real finding — can a docs-only fix ship without waiting on a package release?
3. Consider a build or commit stamp on the portal. We could only find this by
   diffing the rendered page against the repository; a reader cannot.

### Scope

Read from the live page on 2026-10-25; term counts are of that one page's
rendered `innerText`. We did not check whether other portal pages are also
stale and do not claim the portal as a whole is behind.
```

---

## 3 — `02`, `04` → no repository backs the event page

`developers.ledger.com/xrplnyc` has no public source repository we could find.
Both filings concern that page:

- `02` — the only XRPL EVM chain ID given is mainnet (1440000), in a brief that
  accepts testnet and gives no testnet identifier (1449000).
- `04` — the Clear Signing sentence understates on-device display for `Payment`;
  carries the three-device screen sets, which is the heaviest evidence in the set.

**Needs a human channel:** the booth, the Discord support group, or an issue on
`device-sdk-ts` that cross-references the event page. `04` in particular should
go to a person — it argues with a sentence the organisers wrote, and its scope
line has to survive the handoff.

---

## 4 — `05`, `06` → Mastercard AP4M

No public repository found for the AP4M service.

- `05` — `/public/config` advertises `faucet.testevm.ripple.com`, which has no
  DNS records. Re-verified 2026-10-25.
- `06` — the integration guide and the workshop deck each present themselves as
  the judging criteria and score different things. The deck is marked
  *Proprietary and Confidential*; it is quoted only on the judging slide, and
  only back to its owner.

**Needs a human channel:** AP4M booth or whatever contact the organisers give.
`06` should go to an organiser directly rather than any public surface.

---

## Attach with every Ledger filing

- `evidence/pages/` — page captures taken 2026-10-25.
- `evidence/flex/`, `evidence/stax/`, `evidence/apex-p/` — six screens per device
  plus `screens.json` and the unsigned transaction, for `04`.
- `evidence/flex/capture.cjs` — reproduces any of the three device runs:
  `MODEL=stax PORT=5002 node capture.cjs`.

# The XRP signer reference gives two derivation paths that disagree, and one is Bitcoin's

**To:** Ledger — Track 01, Protocol Innovation (Core)
**Page:** `developers.ledger.com/docs/device-interaction/references/signers/xrp`
**Sections:** Use Case 2: Get Address → Parameters, and Use Case 3: Sign
Transaction → Parameters

## What the page shows

The same page gives a different example value for `derivationPath` in two places.

| Section | Example value |
|---|---|
| Use Case 2: Get Address → Parameters | `44'/144'/0'/0/0` |
| Use Case 3: Sign Transaction → Parameters | `m/44'/0'/0'/0/0` |

## The defect

Coin type `144'` is XRP. Coin type `0'` is Bitcoin, per SLIP-0044.

So the Sign Transaction example derives from Bitcoin's coin type. A reader who
copies the two examples into one integration asks the device for an address on
one path and a signature on another.

## Why the failure is confusing

The device signs whatever path it is given. Both calls succeed. The address shown
by `getAddress` and the account that actually signed do not match, so the ledger
rejects the transaction for a signature that does not belong to the sending
account.

That reads as a signing bug or a malformed blob. The cause is two lines of
example text on one page.

The `m/` prefix difference is cosmetic and harmless. The coin type is not.

## Suggested change

Use `44'/144'/0'/0/0` in both sections.

## Scope

- Read from the live page on the day of the event. The page may change.
- We did not test whether the device refuses a Bitcoin-coin-type path for the XRP
  app. The failure described above is **inferred** from how derivation paths work,
  not measured. The disagreement between the two examples is measured, and it is
  the defect being filed.

# Evidence log — four errors of one shape, 24 Oct 2026

Kept because the shape repeats and because none of the four was caught by the
session that made it. This is the case for rules 11 to 15 in
`_core/CONVENTIONS.md`.

In each case a real quote or a real number carried a conclusion one step past
what it supported.

## 1. The opaque screen

Ledger's page says *"there is still no XRPL transaction Clear Signing"*. That
quote is real. From it I wrote in four documents that the device screen would
not show a readable destination, and told JD to say so on stage.

Measurement disproved it. app-xrp 2.8.2 displays the amount, the full
destination and both invoice bindings for a `Payment`.

**Caught by:** measurement, after the claim had reached the pitch.

## 2. Clear signing on the EVM sidechain

The peer session quoted *"sign with the ETH DMK signer plus Clear Signing"* and
concluded that clear signing is supported on the EVM sidechain. The quote is
real. It sits under a heading reading **Example directions**, which is a list of
things to build, not a statement of current support.

**Caught by:** this session, by fetching the page instead of inheriting it.

## 3. The chain ID, twice

The peer handed over 1440000 as a measured find from Ledger's prize page. This
session's own `prep/verify_endpoints.py` had already recorded 1440000 as mainnet
and 1449000 as testnet. The number was imported anyway and written into the
audit schema, which would have declared that a testnet run happened on mainnet.

Then the correction overshot. Both sessions called the page's value wrong. The
page states 1440000 and never says testnet, so the value is correct and the
defect is the omission beside it. Filed as an error it would have drawn a
one-line refusal.

**Caught by:** the peer, then the peer again on a verbatim re-read.

## 4. The memo encoding

This session explained a hex memo on one device run as the consequence of
setting no Memo Type, against a readable string on another run. The two runs
differed in two variables, not one.

**Caught by:** the peer, which refused to put the causal claim in a filing.

## What follows

Two sessions, four errors, four catches, none self-caught. The mechanism that
worked was not care. It was a second reader with the authority to refuse.

Where no second reader exists, the marks in the text are the only substitute.

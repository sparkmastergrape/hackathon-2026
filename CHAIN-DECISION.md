# `xrpl:1` or XRPL EVM — what the choice actually costs

Written 24 Oct 2026, unasked, because the decision is blocked on a cost only
this session can estimate. Every line is tagged **measured** or **reasoned**.

## The one-line version

Porting to XRPL EVM is not a port. It is a rebuild of the payment layer and the
device layer, and it **destroys the pitch's central claim** — because on an EVM
chain the spending ceiling stops being a ledger primitive and becomes a contract
we wrote.

## What is measured

**The facilitator serves only `xrpl:1`.** Asked it directly:

```
GET https://xrpl-facilitator-testnet.t54.ai/supported
{"kinds":[{"x402Version":2,"scheme":"exact","network":"xrpl:1"},
          {"x402Version":2,"scheme":"upto","network":"xrpl:1"}],
 "extensions":["x402Secure"],
 "signers":{"xrpl:*":[]}}
```

No EVM network, and the signers map is scoped `xrpl:*`. So x402 settlement
through t54 does not exist on the EVM side. You would need a different
facilitator, or write one — and the facilitator is the component that verifies
and submits, i.e. the part that makes the whole flow trustworthy.

**Noted in passing, and it matters for rehearsal:** this response no longer
advertises `batch-settlement`, which it did on 22 Oct. The facilitator's
capabilities are changing underneath us during the event. Nothing we built
depends on that scheme, but anything rehearsed against a capability should be
re-checked on the day.

**Five validated testnet transactions exist, all `xrpl:1`** — fixed-price
Payment, metered CheckCash settling 1840 against a 5000 ceiling, three
device-signed payments. On EVM they are not evidence of anything.

## What is reasoned, with confidence high

**Checks do not exist on an EVM chain.** The `upto` scheme is built on
`CheckCreate`/`CheckCash`, and the ceiling is `SendMax` refused at consensus.
There is no EVM equivalent: you would write a Solidity allowance contract. That
contract is **our code**, which is precisely the distinction the pitch rests on
and precisely the kind of claim we spent today removing — the VI mandate was cut
from the pitch for exactly this reason. "The agent cannot overspend because
consensus refuses it" would become "because we wrote a contract saying so",
audited by nobody, overnight.

**The Ledger bridge is a rewrite and the clear-signing finding evaporates.**
`app-xrp` signs native XRPL transactions. EVM signing needs the Ethereum app and
`device-signer-kit-ethereum`. The clear-signing result — the strongest thing
produced today — is a property of app-xrp's Payment review screens and says
nothing about the Ethereum app, where ERC-7730 clear signing is a different,
already-solved story that nobody would find interesting.

**`x402-xrpl` is XRPL-native throughout** — presigned Payment blobs, Checks,
XRPL binary codec, CAIP-2 `xrpl:*`. None of it applies.

## What survives either way

- The idea: an agent with a wallet, a ceiling it cannot exceed, a human veto.
- The Verifiable Intent / credential work, which is chain-independent.
- The replay-gap finding, which is a credential-layer property.
- The pitch's structure and the audit beat.

## The honest counter-argument

Do not read the above as settled. The case for EVM is not technical:

- The repo is an **AP4M / XRPL EVM / RLUSD** build, so somebody already pointed
  that way.
- The keynote reportedly weights **trust/control at 25% against 10% for the
  demo**, and Mastercard shipped an AP4M builder stack. If the prize money
  follows AP4M alignment, that is where it is, and a beautiful native-XRPL demo
  scoring 10% is worth less than credible AP4M integration scoring 25%.

So this is a prize-strategy question wearing a technical costume. The technical
answer is unambiguous; it just might not be the deciding one.

## What I would do

**Don't port. Add.** Keep the payment and device layers on `xrpl:1`, where the
ceiling is consensus-enforced and the device evidence exists, and put the
AP4M/Verifiable Intent vocabulary on top of it — that layer is chain-independent
and is already half-built in the other session. That way the 25% trust/control
weighting is addressed by the credential layer, and the ceiling claim stays true
rather than becoming a contract we wrote.

If one submission must run on EVM, say so early and cut the ceiling and
clear-signing beats rather than restating them in a weaker form. Both of them
are specifically about native XRPL primitives, and a weakened version of either
is the kind of claim that gets discounted.

**What I cannot tell you:** whether the prize rules actually require the EVM
stack. Nobody has verified that, and it is the only input that would change the
recommendation. Worth five minutes with the rules or a mentor before committing
anybody's afternoon.

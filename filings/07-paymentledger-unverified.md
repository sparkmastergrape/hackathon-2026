# The judging criteria send judges to an explorer that cannot name the event

**To:** Mastercard — AP4M
**Surface:** the AP4M judging criteria page, and the four contracts in `/public/config`
on `explorer.testnet.xrplevm.org`

## The defect

The judging criteria ask, under **On-chain proof**, "Can you show a `VoucherRedeemed`
event on the explorer?", and state that judges verify it at the contract address.

The `PaymentLedger` source is not verified on that explorer. The event therefore renders
with no name and no decoded parameters — only a raw `topic0`. A judge who follows the
instruction lands on a page that cannot tell them whether they are looking at the event
they were sent to find.

The event itself is correct and present. This is a discoverability defect, not a
contract defect.

## Receipt

The log, as the explorer's own API returns it:

```
$ curl .../api/v2/transactions/0xcb1f2dab…/logs
emitter     : 0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91
is_verified : false
name        : null
decoded     : null          <- no event name, no parameters
topic0      : 0xe3de5c3755abd99a01530fd79b85708f309453f6d26eb9bb5dde4c14cd5f7175
```

All four contracts in `/public/config` are unverified:

```
$ curl ".../api?module=contract&action=getabi&address=<each>"
paymentLedger        0xcAB42800…  Contract source code not verified
pooledEscrowVault    0x83DD9cD0…  Contract source code not verified
participantRegistry  0x4cF27435…  Contract source code not verified
rlusdToken           0x27b57a9D…  Contract source code not verified
```

The name is recoverable, but only from AP4M's own SDK helper, which declares the
signature at `ap4m-hackathon-sdk.js:203`:

```
VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,address,address,uint256,uint256,uint256)
```

`keccak256` of that string is exactly the `topic0` above:

```
$ node -e "console.log(require('viem').toEventSelector('VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,address,address,uint256,uint256,uint256)'))"
0xe3de5c3755abd99a01530fd79b85708f309453f6d26eb9bb5dde4c14cd5f7175
```

So the event is named `VoucherRedeemed`, it is emitted by `PaymentLedger`, and the
explorer will not say so.

## Why this blocks judging specifically

The criterion is written as something a judge does on the explorer, unaided. As served,
it cannot be completed there. A judge has three options, and each costs the team:

1. Take the team's word that the unnamed topic is `VoucherRedeemed`, which is what the
   criterion exists to avoid.
2. Hash a candidate signature themselves — but the signature is not published anywhere a
   judge would look. It is absent from Sourcify, from openchain.xyz and from
   4byte.directory, and is discoverable only by reading the SDK helper's source.
3. Skip the check.

The criterion is also the one a team cannot satisfy by building better. Every other
criterion is within the team's control; this one depends on a contract the team does not
own and cannot verify.

Note that the adjacent **RLUSD settlement** criterion is unaffected: the explorer still
recognises the RLUSD token by interface despite being unverified, so a judge checking
that the merchant balance changed sees what they expect.

## Suggested change

In order of cost:

1. Verify `PaymentLedger` on `explorer.testnet.xrplevm.org`, via Blockscout's
   standard-JSON input or by publishing to Sourcify. The event name then renders, and the
   criterion works as written. The other three contracts benefit equally.
2. Failing that, publish the `PaymentLedger` ABI — or just the `VoucherRedeemed`
   signature — in `/public/config` or in the docs, so a judge has one authoritative place
   to resolve the topic.
3. At minimum, state the `topic0` next to the criterion, so a judge can match a hash
   rather than trust a claim.

## Scope

- Measured on 2026-10-25: the four `getabi` responses, the log's `decoded: null`, the
  Sourcify v2 lookup for chain 1449000, the openchain.xyz and 4byte.directory lookups for
  the topic, and the `keccak256` match. Each is one request and reproducible.
- The `VoucherRedeemed` signature is read from the SDK helper shipped with the kit. We
  did not obtain the contract's Solidity source, and we did not confirm the parameter
  *names* — only the types, which is all the selector depends on.
- We did not check whether verification was attempted and failed, nor whether AP4M
  intends these contracts to stay unverified.
- We checked one explorer. We did not check whether another XRPL EVM testnet explorer
  decodes the event.

# The only XRPL EVM chain ID on the event page is mainnet, in a brief that accepts testnet

**To:** Ledger — Track 01, Protocol Innovation (Core)
**Page:** `developers.ledger.com/xrplnyc`
**Section:** Track 01 · Core (Protocol Innovation) → Example directions

> **Read this before filing.** This is a documentation gap, not a wrong value.
> The number on the page is correct for mainnet. An earlier draft of this filing
> called it an error. That draft was wrong, and the stronger claim would have been
> refused in one reply by anyone who checked mainnet. The defect is real but it is
> narrower than it first looked.

## What the page shows

Under *Example directions* for Track 01:

> "Use Ledger's Ethereum signer on the XRPL EVM sidechain (chain ID 1440000):
> deploy or consume a contract"

Separately, under *Choose your track*, the page requires that a project "must
land at least one transaction on the XRP Ledger or its EVM sidechain", and then
states that testnet counts.

## The gap

1440000 is the XRPL EVM **mainnet** chain ID. The page gives no testnet chain ID
anywhere.

So the brief invites testnet work, and supplies only the mainnet identifier for
the sidechain it names. A developer who follows the bullet literally configures
1440000, then tries to satisfy the eligibility rule on testnet.

### Receipt

Both identifiers measured with `eth_chainId`, on the day of the event.

| Network | RPC host | Response | Decimal |
|---|---|---|---|
| XRPL EVM mainnet | `https://rpc.xrplevm.org` | `0x15f900` | 1440000 |
| XRPL EVM testnet | `https://rpc.testnet.xrplevm.org` | `0x161c28` | 1449000 |

So the page's number is right, for mainnet. The testnet identifier is absent.

## Why it costs more than an afternoon

A wrong chain ID in a signer reference costs one developer some time. A wrong
chain ID in a prize brief can route a whole team onto the wrong network, and the
symptom is not an error. The team gets a working deployment on mainnet, spends
real funds, and satisfies the eligibility rule on a network they did not intend
to use.

Testnet is the cheap path and the page permits it. Nothing on the page tells a
reader which identifier the cheap path uses.

## Suggested change

Give both identifiers where the sidechain is named:

- XRPL EVM mainnet: 1440000
- XRPL EVM testnet: 1449000

One parenthesis in the Example directions bullet would close it.

## Scope

- Measured on the day of the event. The page may change.
- Each chain ID was measured against one RPC host, named in the table above.
- An earlier draft of this filing marked the mainnet value as inferred, because we
  had measured only testnet. It is now measured. Both numbers stand on an
  `eth_chainId` response, not on a chain registry.

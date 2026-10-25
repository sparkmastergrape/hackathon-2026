# Inferences

Conclusions this project holds that nobody has measured. Each names what would
settle it.

Keeping these apart from `MEASURED-FACTS.md` is the whole method. A reasoned
conclusion is not worthless. It is worth less, and it must say so.

## Ledger's clear-signing gap applies above the Payment layer

Ledger's page states there is still no XRPL transaction clear signing. We
measured that `Payment` displays every field a human needs. From that we infer
the gap is the layer above, or the transaction types beyond `Payment`.

**Settled by:** one Escrow or AMM transaction shown on the device.

## Clear signing is supported on the XRPL EVM sidechain

The peer session found *"sign with the ETH DMK signer plus Clear Signing"* on
Ledger's page. It sits under **Example directions**, a list of things to build.
The page never states that it is supported there. ERC-7730 is a shipped Ledger
capability, so the conclusion is likely. The page does not establish it.

**Settled by:** a transaction clear-signed on chain 1449000 through the Ethereum
signer, or a Ledger page that states support directly.

## Porting to the EVM sidechain would destroy the ceiling claim

Checks do not exist on an EVM chain. The `upto` scheme rests on `CheckCreate`
and `CheckCash`, with the ceiling refused at consensus. An EVM port means a
Solidity allowance contract, which is our code rather than a ledger primitive.

This is reasoning, with confidence high. It is not measured.

**Settled by:** nothing available in the time. Treat as a design position.

## The hex memo difference

One device run displayed memo data as hex, another as a readable string. The
runs differed in two variables: one set a Memo Type and one did not, and the
invoice ids themselves differed in form.

**No cause is claimed.** Both values are recorded. Settled by one run that
changes the Memo Type alone.

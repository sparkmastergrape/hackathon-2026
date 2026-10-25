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

## The Merchant's 503 was a chain-visibility race, not a bad payment

The AP4M Merchant returned `503` three times while the redemption it had just
submitted was settling correctly on chain. After the fact, each of the verifier's
conditions was checked individually and all passed: receipt status success,
destination correct, calldata byte-identical to the plan, challenge finality
block hash unchanged. A retry of the same payment verified the same transaction
hash and released the resource.

From that we infer the verifier's own read of the transaction answered as though
it were unknown, because it had only just been accepted. The service's x402
context sets `confirmationBlocks` to 1, so waiting for confirmations is not the
explanation.

**Settled by:** a run that reproduces the failure with each of the four verifier
conditions logged separately.

## `batch-settlement` on the facilitator and on AP4M may be the same scheme

`MEASURED-FACTS.md` records that the t54 facilitator advertised
`batch-settlement` on 22 Oct and does not now. The AP4M 402 challenge uses a
scheme named `batch-settlement`. The names match.

Nothing has been measured that connects them. Two services using one scheme name
is not evidence that they implement the same thing, and AP4M's runs on an EVM
chain the facilitator does not serve.

**Settled by:** a scheme definition from either service, or one payload accepted
by both.

## No cause is claimed for the 0.02 RLUSD that left the payout wallet

One outgoing RLUSD transfer of 0.02 from the merchant payout wallet is recorded
in `tracks/build/stages/01-measure/output/measurements.md`. The reconciliation
balances with it included.

**No cause is claimed.** This session did not send it and does not know what did.

**Settled by:** reading the transaction's own sender and destination, which the
measurement file already records, against whoever ran that command.

## Payments appear that this session did not make

Between this session's own runs, redemptions appeared on channels it never
opened, and six more arrived on an open channel while the measurement script was
running. The workspace is shared with at least one other session and with JD
running the demo directly.

**Therefore any total is a snapshot, not an inventory.** A figure quoted without
its block number is wrong by the time it is read. This is inference about the
process, not about the chain.

**Settled by:** nothing worth doing. Quote the block with the total.

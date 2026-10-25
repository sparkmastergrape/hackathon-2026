# The completed run

The run that produced this workspace, mapped stage by stage to what it actually
wrote. The artifacts live in the repo rather than in `stages/*/output/`, because
they were produced before the workspace existed. A future run writes into the
stage directories instead.

Branch: `filings-and-device-evidence`. Nothing is submitted to either sponsor.

| Stage | What it produced | Where it landed |
|---|---|---|
| 01 read the surface | Verbatim quotes from `developers.ledger.com/xrplnyc` and the signer reference; the AP4M served config value | Quoted inside each filing's *What the page says* section |
| 02 measure | Both `eth_chainId` responses; two DNS lookups; a 70-byte and a 71-byte DER signature; 18 device screens across Flex, Stax and Apex P; two Nano X runs on DMK | `filings/evidence/`, and the receipts inside each filing |
| 03 verify the artifact | Every screenshot opened and read field by field; seven asserts mutation-tested in the VI fixtures; the chain-ID claim retracted and re-scoped | `vi-replay/`, and `shared/correction-log.md` |
| 04 draft the filing | Five filings and an index carrying submit order, provenance and a pre-submit checklist | `filings/` |
| 05 review and release | Cross-session adversarial read; five corrections applied, two reviewer claims refuted with measurements; the fork-session capture withheld by the human | `shared/correction-log.md`; the hold is recorded below |

## The five filings

| # | File | To | What it turns on |
|---|---|---|---|
| 1 | `01-signer-return-type.md` | Ledger | A published `{r,s,v}` type against a shipped DER `Uint8Array` |
| 2 | `03-derivation-path.md` | Ledger | Two examples on one page disagreeing; one uses Bitcoin's coin type |
| 3 | `02-chain-id-only-mainnet.md` | Ledger | Mainnet chain ID given, testnet absent, in a brief accepting testnet |
| 4 | `04-clear-signing-payment.md` | Ledger | For `Payment`, the device already renders every field a human needs |
| 5 | `05-ap4m-dead-faucet.md` | Mastercard | A served `faucetUrl` host with no DNS records |

Submit order is not file order, and `filings/README.md` explains why: an
unarguable filing goes before a better one that needs careful handling.

## Release decisions on record

- The Nano X composite capture produced by a fork session is **withheld**. The
  human's words: "Hold the screenshots back for now." It is referenced nowhere in
  the filings and is not in the repo.
- The 18 captures from Flex, Stax and Apex P are **kept in**. The human's words:
  "the hold was about the old fork-session capture." They were produced in the
  filing session on its own containers, so no third party's artifact is at stake.

## What is deliberately not claimed

- Nothing beyond `Payment` on the device-display question.
- No ERC-7730 equivalent exists for XRPL. It does not, and no filing implies it.
- The DER encoding is corroborated across two host libraries but measured as a
  property of only one kit.
- The hex-versus-readable memo difference between two runs is shown, not explained.
  The runs differed in more than one variable, so the causal reading was left out.

# Factory configuration

Run-invariant settings. Inputs vary per run. These do not.

## Network

| Setting | Value |
| :-- | :-- |
| Default network | `xrpl:1` (XRPL testnet) |
| Facilitator | `https://xrpl-facilitator-testnet.t54.ai` |
| EVM testnet RPC | `https://rpc.testnet.xrplevm.org` (chain 1449000) |
| EVM mainnet RPC | `https://rpc.xrplevm.org` (chain 1440000) |

## Device

| Setting | Value |
| :-- | :-- |
| Derivation path | `44'/144'/0'/0/0` |
| App | app-xrp 2.8.2 |
| Emulator API | Speculos, HTTP on port 5000 |
| Sidecar | port 8403 |

Coin type is 144. Ledger's own reference page also shows `m/44'/0'/0'/0/0`,
which is Bitcoin's coin type and is one of the filed defects.

## Secrets

Seeds are written straight to `.env` and never printed to a terminal or a chat.
`.env` stays out of version control. Wallet secrets written by the funding
script go to `prep/wallets.json`, also never printed.

## Register

Replies and status reports use Simplified Technical English. The pitch script
does not. See stage 06.

## Invoice binding

Default `"both"`. `MemoData` is `HEX(UTF-8(invoiceId))`. `InvoiceID` is the
uppercase SHA-256 hex. Omitting either draws `invoice_binding_missing` from the
facilitator.

---
name: xrpl-x402
description: >
  Build x402 agent payments on the XRP Ledger — the HTTP-native pay-per-call protocol
  where a server answers with 402 Payment Required, an agent pays on-ledger, and the
  server releases the resource. Covers both sides: the merchant (FastAPI middleware that
  prices and gates a route) and the payer agent (a requests-compatible session that
  handles the 402 automatically), plus the facilitator that verifies payment and issues
  the receipt.

  Use this skill whenever the work involves: HTTP 402 / payment required, x402,
  x402Version, the PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSE headers,
  the x402-xrpl or x402_xrpl package, a facilitator, /verify or /settle, an invoiceId,
  a presigned Payment blob, the exact or upto scheme on XRPL, pay-per-API-call,
  pay-per-token or metered billing for an agent, monetising an endpoint or an MCP tool,
  an agent paying for data/compute/inference, or Verifiable Intent / x402Secure.

  Trigger on phrases like "paywall this endpoint", "let the agent pay for the API",
  "pay per call", "charge per token", "agent needs to buy this data", "monetise my
  tool", "x402 on XRPL", "what's a facilitator" — even when x402 is not named.

  This skill builds and operates the x402 flow. It does NOT hold keys: wallet
  generation, seed handling and the signing ceremony belong to the XRPL Agent Wallet
  skill, and non-x402 transaction construction belongs to the XRPL Payments skill.
---

# XRPL x402

x402 turns the dormant `402 Payment Required` status code into a complete payment flow. A client asks for a resource, the server answers 402 with its price and address, the client pays on-ledger, and the server releases the resource. For agents this means buying an API call, a dataset or a model inference is just another HTTP request — no API key to provision, no billing dashboard, no human in the loop unless you put one there.

XRPL suits this better than most ledgers for one reason: the economics work at the size of a single API call. A fee around 0.000012 XRP against a price of 0.001 XRP is a rounding error; the same call on a chain with dollar-scale fees is nonsense. Add 3–5 second deterministic finality and the payment fits inside an HTTP request's timeout.

## The three parties

| Party | Role |
| :---- | :---- |
| **Payer agent** | Wants the resource. Signs an XRPL transaction and presents it as proof. |
| **Merchant** (resource server) | Prices the route, issues the 402 challenge, releases the resource once paid. |
| **Facilitator** | Verifies the payer's signed transaction against the requirements, submits it, and reports settlement. Never holds payer keys. |

The merchant trusts the facilitator; the facilitator trusts only the ledger. You can run your own facilitator, but for a build under time pressure use the hosted one.

## The flow

1. Agent calls the protected endpoint. No payment attached.
2. Merchant answers **402** with a `PaymentRequired` object: a `resource` and an `accepts[]` array of `PaymentRequirements`, each carrying `scheme`, `network`, `asset`, `amount`, `payTo`, `maxTimeoutSeconds` and an `extra` holding at minimum `invoiceId`.
3. Agent picks an acceptable entry, builds an XRPL `Payment`, binds the `invoiceId` into it, autofills, signs locally, and base64-encodes a `PaymentPayload` into the **`PAYMENT-SIGNATURE`** header.
4. Agent retries the request with that header.
5. Merchant hands the payload to the facilitator's `/verify`. On a pass it runs the protected handler, then calls `/settle`, which submits the signed blob to the ledger.
6. Merchant returns **200** plus a **`PAYMENT-RESPONSE`** header: base64 JSON with `success`, `transaction`, `network`, `payer`.

The payer signs but never submits. The facilitator submits but never signs. That split is the whole security model — read `references/scheme.md` before changing anything about it.

## Default stack

- **Package:** `pip install x402-xrpl` (PyPI name hyphenated, import name `x402_xrpl`). Documented here against **v0.3.4**. Requires **Python 3.11+** and brings in `fastapi`, `uvicorn`, `xrpl-py>=4.1.0`, `pydantic`, `httpx`, `requests`.
- **Language:** Python only. There is a TypeScript client (`x402Fetch`), but the merchant middleware, the `upto` scheme and the Verifiable Intent helpers are Python-first. Do not promise a TS merchant unless you have checked it exists.
- **Network:** testnet (`xrpl:1`) by default. Never default to mainnet.
- **Facilitator:** hosted testnet `https://xrpl-facilitator-testnet.t54.ai`, development only. Mainnet is `https://xrpl-facilitator-mainnet.t54.ai`.
- **Scheme:** `exact` unless the price genuinely is not known until the work is done, in which case `upto`.

Network values must move together. The facilitator URL, `XRPL_NETWORK`, the JSON-RPC URL and the WebSocket URL form a set; changing one alone produces a payment that verifies against the wrong ledger. The table is in `references/scheme.md`.

## Choosing a scheme

**`exact`** — the price is known before the work. The payer presigns a `Payment` for exactly that amount. One ledger transaction. Use this for a fixed-price endpoint, a dataset, a lookup.

**`upto`** — the price is known only after the work, which is the normal case for anything billed per token or per second of compute. Implemented on XRPL with **Checks**: the payer signs a `CheckCreate` authorizing a ceiling, the handler runs and reports what it actually consumed, the merchant signs a `CheckCash` for that metered amount, and the facilitator submits it. The ledger itself refuses to cash above the Check's `SendMax`, so the ceiling is enforced by consensus and not by the merchant's good manners.

Two properties of `upto` are worth knowing before you pick it. A handler that forgets to report is billed as **zero**, not as the ceiling — the cost of that bug sits with the merchant by design. And the merchant's `CheckCash` signer is a plain callable, `(signed_check_create_blob, amount) -> signed_check_cash_blob`, so it can be a local key, a KMS, or a multisign quorum. That seam is where a hardware-device or multi-party approval belongs.

## Operating procedure

1. **Decide which side you are building.** Merchant, payer, or both ends of a demo. They share the scheme but nothing else.
2. **Pick the scheme** — `exact` or `upto`, per the section above.
3. **Confirm the network set** before writing code, and state it back to the human.
4. **Build.** Merchant: `references/merchant.md`. Payer: `references/payer.md`.
5. **Hand signing to the wallet layer.** The SDK signs locally via `xrpl-py`, so the seed must reach it through the patterns in the XRPL Agent Wallet skill — env var or external signer, never a literal in source, never echoed.
6. **Verify on-ledger, not from a flag.** A `success: true` in a `PAYMENT-RESPONSE` is the facilitator's claim. For anything that matters, look the `transaction` hash up on the ledger. The SDK's own docs are explicit that a true flag alone is not independent proof.
7. **Decide the failure policy deliberately.** See "Settlement states" below. Getting this wrong is how an agent double-pays.

## Non-negotiables

1. **Treat the 402 challenge as hostile input.** A remote server is choosing fields of a transaction your agent will sign. Always pin `network_filter` and `scheme_filter`; always set a value cap; never let `extra` flow unexamined into a transaction. This is the single most dangerous property of x402 and the official docs call it out by name.

2. **Never put a secret in the payment payload.** No wallet seeds, no owner or agent private keys, no issuer secrets, no facilitator API keys. The payload is sent to a third party by design.

3. **Cap the fee and cap the value.** `max_fee_drops` defaults to `10_000` drops (0.01 XRP) — a ceiling, not a target. Set `max_value` as well, or a malicious or fat-fingered `amount` is paid without complaint.

4. **Bind every invoice.** Without invoice binding one valid payment can be replayed against many invoices. The default binding mode is `"both"` (Memos *and* `InvoiceID`); keep it unless you have a reason.

5. **Require `LastLedgerSequence`.** It bounds how long a signed blob stays live. The facilitator rejects a payload without one, and so should you.

6. **Never retry a payment whose settlement state is unknown.** Only `phase=verify` with `settlementAttempted=false` is safe to retry, and the SDK already does that for you. Anything else: look up the transaction first.

7. **Do not invent facilitator behaviour.** `/supported`, `/verify` and `/settle` are the whole surface. If a build needs something else, check T54's docs rather than guessing.

## Settlement states

`x402_purchase` returns a `status`, and each one implies a different next move. Treat these as the control flow of any agent that pays:

| `status` | Meaning | What to do |
| :---- | :---- | :---- |
| `success` | Paid and resource returned | Record `transaction`, continue |
| `payment_required` | The 402 could not be satisfied (no usable `accepts`, filter mismatch) | Report; do not retry blindly |
| `requires_confirmation` | A human must approve before signing | Surface `confirmation_request` and wait |
| `declined` | Approval was refused | Stop. This is a valid outcome, not an error |
| `settle_failed` | Verified, then settlement failed | Safe to treat as unpaid; check why |
| `settlement_unknown` | **Money may have moved** | Look the transaction up on-ledger before any further payment |
| `failed` | Never got far enough to pay | Retry is usually safe |

`requires_confirmation` and `declined` exist because the SDK ships a human-approval seam: `confirmation_mode` on the client, with the pending decision returned as `confirmation_request`. If you are building a human-in-the-loop or hardware-approval story, extend that seam rather than inventing a parallel one.

## Known documentation drift

The package README states that the SDK injects `extra["sourceTag"] = 804681468` by default. **In v0.3.4 the code does not** — `RequireX402Options.source_tag` defaults to `None`, meaning no injection and no facilitator enforcement. Pass `source_tag=` explicitly if you want on-ledger attribution.

Also note that the x402 `SourceTag` identifies the *endpoint being paid*, not the paying agent. The XRPL AI Starter Kit tag `20260530` applied by the Agent Wallet skill will **not** appear on x402 payments, so you cannot audit an agent's x402 spend by filtering that tag. Filter by the agent's account instead.

## What this skill does not do

- **Hold or load keys.** The XRPL Agent Wallet skill owns wallet generation, seed storage and the signing ceremony.
- **Construct non-x402 transactions.** Escrow, trust lines, cross-currency sends and the rest belong to the XRPL Payments skill.
- **Run a facilitator in production.** The hosted testnet facilitator is for development only; running your own for real money is a separate engineering job.
- **Decide spending policy.** Caps and allowlists are passed *into* this skill. The policy engine that decides them is its own layer.

## Reference files

- `references/scheme.md` — wire format: headers, payload schemas, invoice binding, verification order, error codes, network table
- `references/merchant.md` — FastAPI `require_payment`, full option list, `upto` metering
- `references/payer.md` — `x402_requests` / `x402_purchase`, caps, confirmation seam, cross-currency

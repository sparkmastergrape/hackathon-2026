# XRPL x402 — wire format

Documented against `x402-xrpl` v0.3.4 and the XRPL `exact` presigned-Payment scheme. `x402Version` is **2**.

## Headers

| Header | Direction | Contents |
| :---- | :---- | :---- |
| `PAYMENT-REQUIRED` | server → client | base64 JSON `PaymentRequired` (the 402 challenge) |
| `PAYMENT-SIGNATURE` | client → server | base64 JSON `PaymentPayload` (the signed proof) |
| `PAYMENT-RESPONSE` | server → client | base64 JSON settlement result |

`X-PAYMENT` is the **legacy x402 v1** name for the client's payload header. v2 uses `PAYMENT-SIGNATURE`; the SDK's `x_payment_header` parameter defaults to it. The SDK also exports `decode_x_payment_response` alongside `decode_payment_response` for the same reason. If you are interoperating with an older merchant, check which it expects rather than assuming.

**The challenge appears in two places.** The spec puts it in the `PAYMENT-REQUIRED` header, but `x402_purchase` in v0.3.4 reads `accepts` from the **402 JSON response body**. A merchant built with this SDK's own middleware satisfies both. If you write a merchant by hand, emit the body as well or this SDK's client will not see your challenge.

## Networks (CAIP-2)

Every row moves as a set. Mixing rows is the most common cause of a payment that signs cleanly and then fails verification.

| Environment | `XRPL_NETWORK` | Facilitator | JSON-RPC | WebSocket |
| :---- | :---- | :---- | :---- | :---- |
| Mainnet | `xrpl:0` | `https://xrpl-facilitator-mainnet.t54.ai` | `https://s1.ripple.com:51234/` | `wss://s1.ripple.com:51233` |
| Testnet | `xrpl:1` | `https://xrpl-facilitator-testnet.t54.ai` | `https://s.altnet.rippletest.net:51234/` | `wss://s.altnet.rippletest.net:51233` |
| Devnet | `xrpl:2` | — | — | — |
| Local dev | `xrpl:1` | `http://127.0.0.1:8011` | testnet RPC | testnet WS |

Before signing, the payer requires its configured network, the quote's network, the RPC's `server_info.info.network_id` and any autofilled network ID to **all agree**. Missing RPC network information is rejected outright.

## `PaymentRequirements` (one entry in `accepts[]`)

| Field | Required | Notes |
| :---- | :---- | :---- |
| `scheme` | yes | `"exact"` or `"upto"` |
| `network` | yes | CAIP-2, e.g. `"xrpl:1"` |
| `asset` | yes | `"XRP"`, or a 3-char / 40-hex currency code |
| `amount` | yes | XRP: **drops** string. IOU: issued-currency `value` string (`"1.25"`) |
| `payTo` | yes | classic `r...` address |
| `maxTimeoutSeconds` | yes | validity window for the quote |
| `extra.invoiceId` | yes | unique per challenge; the replay guard |
| `extra.issuer` | IOU only | classic address of the issuer |
| `extra.sourceTag` | optional | see drift note in SKILL.md |
| `extra.destinationTag` | optional | only when the destination requires one |
| `extra.crossCurrency` | optional | `True` lets the payer fund from a different asset |
| `extra.facilitator` | optional | `{"id":…, "name":…}` self-identification |

Python dataclass fields are snake_case (`pay_to`, `max_timeout_seconds`); the wire JSON is camelCase. `PaymentRequirements.from_dict()` and `.invoice_id()` handle the conversion — use them rather than reaching into `extra` by hand.

## `PaymentPayload` (decoded `PAYMENT-SIGNATURE`)

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "exact",
    "network": "xrpl:1",
    "asset": "XRP",
    "payTo": "rDestinationAddress...",
    "amount": "1000000",
    "maxTimeoutSeconds": 600,
    "extra": { "invoiceId": "INV-abc123" }
  },
  "payload": { "signedTxBlob": "1200002280000000..." }
}
```

For an IOU, `asset` is the 40-hex code (RLUSD is `524C555344000000000000000000000000000000`), `amount` is a decimal value string, and `extra.issuer` carries the issuer.

For the **`upto`** scheme the `payload` carries four fields instead:

```json
{
  "signedCheckCreateBlob": "...",
  "signedCheckCashBlob": "...",
  "invoiceId": "INV-abc123",
  "checkId": "..."
}
```

`accepted` there is the **ceiling** requirement the payer signed. The metered amount travels separately, in the settle request's `paymentRequirements`.

## Invoice binding

The signed transaction must commit to the invoice, or one valid payment could be replayed against many invoices. Two methods, and the SDK default `invoice_binding="both"` applies both:

- **Memos** — `MemoData = HEX(UTF-8(invoiceId))`, via `invoice_id_to_memo_hex()`
- **InvoiceID** — the transaction's `InvoiceID` field set to `SHA256(invoiceId)`, via `invoice_id_to_invoice_id_field()`

Modes are `"memos"`, `"invoice_id"`, `"both"`. Prefer `"both"` and change it only to satisfy a merchant that rejects one.

## Verification order (facilitator `/verify`)

Mirror this order in anything you build that checks a payload; an earlier check failing makes a later one meaningless.

1. Envelope: `x402Version == 2`, known `scheme`, supported `network`
2. Decode `signedTxBlob` from hex
3. Transaction must be a `Payment`
4. `tx.Destination == payTo`
5. `NetworkID` consistent with the CAIP-2 network
6. `DeliverMax` / `Amount` matches the required amount
7. `LastLedgerSequence` present
8. `Memos` or `InvoiceID` binds the `invoiceId`
9. Policy: fee ceiling, no partial payments, no unintended cross-currency

## Settlement response (decoded `PAYMENT-RESPONSE`)

```json
{
  "success": true,
  "transaction": "ABC123...txhash",
  "network": "xrpl:1",
  "payer": "rPayerAddress..."
}
```

`isValid` and `success` must be JSON booleans; a string `"true"` is malformed. A malformed settlement header yields `settlement_unknown` with `retryable=False` — look the transaction up before paying again.

## Error codes

Returned by `/verify` as `invalid_reason`:

`invalid_network`, `payment_requirements_mismatch`, `invalid_tx_blob`, `not_payment_tx`, `destination_mismatch`, `source_tag_mismatch`, `amount_mismatch`, `invoice_binding_missing`, `invoice_binding_mismatch`, `missing_last_ledger_sequence`

## Transient verify failures

When the facilitator's verify stage returns 408, 429, 5xx or times out, a `require_payment` merchant converts it to a **typed 503** carrying `retryable=true`, `phase=verify`, `settlementAttempted=false`, plus `retryAfter` and `correlationId`. This is **fail-closed**: neither the protected handler nor `/settle` runs.

A client built with `x402_requests` then reuses the *same* invoice and `PAYMENT-SIGNATURE` for at most **two** retries, while the requirement is still inside `maxTimeoutSeconds`, honouring `Retry-After`. It never retries a response where settlement may have been attempted. Policy denials and other 4xx responses are non-retryable.

## Facilitator API

Three endpoints: `/supported`, `/verify`, `/settle`. The hosted facilitator needs no API key and holds no customer keys — it never signs a payer transaction. Clients: `FacilitatorClient` (sync) and `AsyncFacilitatorClient`, both with `supported()`, `verify()`, `settle()` and `create_x402_secure_requirements()`.

Facilitator HTTP exception messages deliberately contain only a status and a validated request ID — not the response body or request URL. The original response is available explicitly if you need it.

## Verifiable Intent / x402Secure (optional)

A payer can attach an L1–L3 chain through the `verifiable_intent_provider` seam. When the hosted facilitator sees `extensions.x402Secure` it calls X402 Secure and Trustline before settling, each returning allow / deny / review.

- **L1** — a credential, issued by a Trustline issuer
- **L2** — an owner-signed delegation, bounding what the agent may do (`allowedChains`, `allowedAssets`, `spendingCeiling`, `validitySeconds`)
- **L3** — the agent-signed final action

`RemoteIssuerProvider` covers the case where the agent cannot hold the issuer secret: the remote endpoint issues only L1, while the SDK signs L2 with the owner key and L3 with the agent key locally. Relevant helpers: `build_verifiable_intent_chain`, `sign_l2_delegation`, `sign_l3_final_action`, `payment_requirements_hash`, `canonical_payment_requirements_json`.

This is the protocol's own answer to "who authorised this agent to spend". If a build needs delegated authority with a spending ceiling, extend this rather than inventing a parallel scheme.

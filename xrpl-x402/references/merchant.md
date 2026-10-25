# Merchant side — paywalling a route

`x402-xrpl` v0.3.4. FastAPI / Starlette.

## Minimal server

```python
import os
from fastapi import FastAPI
from dotenv import load_dotenv
from x402_xrpl.server import require_payment

load_dotenv()
app = FastAPI()

app.middleware("http")(
    require_payment(
        path="/ai-news",
        price="1000",                                  # XRP drops
        pay_to_address=os.environ["XRPL_PAY_TO"],
        network="xrpl:1",
        asset="XRP",
        facilitator_url=os.environ["XRPL_FACILITATOR_URL"],
        resource="demo:ai-news",
        description="AI news feed (paid)",
    )
)

@app.get("/ai-news")
def ai_news():
    return {"headline": "..."}

@app.get("/health")                                     # unprotected
def health():
    return {"ok": True}
```

`.env`:

```
XRPL_FACILITATOR_URL=https://xrpl-facilitator-testnet.t54.ai
XRPL_NETWORK=xrpl:1
XRPL_PAY_TO=r...
XRPL_PRICE_DROPS=1000
```

Run it and `GET /ai-news` returns 402.

## `require_payment` options

Keyword-only. Pricing and routing:

| Option | Default | Notes |
| :---- | :---- | :---- |
| `price` | required | XRP: drops string/int. IOU: value string (`"1.25"`) |
| `pay_to_address` | required | classic `r...` |
| `path` | `None` | **exact match only — no wildcards or globs.** `None` protects every route |
| `network` | `"xrpl:1"` | |
| `asset` | `"XRP"` | or 3-char / 40-hex currency code |
| `issuer` | `None` | **required for any non-XRP asset** (or via `extra["issuer"]`) |
| `scheme` | `"exact"` | or `"upto"` |
| `max_timeout_seconds` | `600` | quote validity |

Resource metadata — recommended by the spec, cheap to set:

| Option | Default |
| :---- | :---- |
| `resource` | request URL |
| `description` | `""` |
| `mime_type` | `"application/json"` |
| `output_schema` | `None` |

Facilitator, invoicing, settlement:

| Option | Default | Notes |
| :---- | :---- | :---- |
| `facilitator_url` | `None` | convenience; or pass a built `facilitator` |
| `facilitator` | `None` | an `AsyncFacilitatorClient` |
| `facilitator_headers` | `None` | |
| `facilitator_identity` | `None` | injects `extra.facilitator` = `{"id","name"}` per option |
| `source_tag` | `None` | **no injection by default** — see drift note in SKILL.md |
| `invoice_store` | in-memory | implement `InvoiceStore` (`put`/`get`/`consume`) for multi-process |
| `invoice_ttl_seconds` | `900` | |
| `invoice_id_factory` | `None` | supply your own ID generator |
| `settle` | `True` | `False` = verify only, still spec-compatible |
| `payment_options` | `None` | several `RequireX402PaymentOption`s to advertise multiple assets |
| `extra` | `None` | merged into each option's `extra` |

X402 Secure route metadata: `x402_secure_policy_id`, `merchant_id`, `origin`, `route_id`.

**The in-memory invoice store is per-process.** Behind more than one worker, invoices issued by one process are invisible to the others and settlement breaks. Supply a shared `InvoiceStore` (the package already depends on `redis` and `psycopg`) before running multiple workers.

## Advertising more than one asset

```python
from x402_xrpl.server import require_payment, RequireX402PaymentOption

app.middleware("http")(
    require_payment(
        path="/report",
        price="1000",
        pay_to_address=PAY_TO,
        facilitator_url=FACILITATOR,
        payment_options=[
            RequireX402PaymentOption(asset="XRP", amount="1000"),
            RequireX402PaymentOption(
                asset="524C555344000000000000000000000000000000",  # RLUSD
                amount="0.01",
                issuer="r...",
            ),
        ],
    )
)
```

The payer picks. Pricing in RLUSD and settling in XRP is what the `extra["crossCurrency"]` flag is for — see `references/payer.md`.

## Metered billing with `upto`

Quote a ceiling, charge what was used. The handler reports consumption through a `UsageMeter` the middleware puts on `request.state.x402_upto_meter`.

**`require_payment()` cannot express this scheme.** The wrapper takes no
`upto_sign_check_cash` parameter, so there is no way to give it the merchant's CheckCash
signer — and without that signer settlement is impossible. Use `require_x402` with the
options dataclass, which renames two fields: `price` → `amount`, `pay_to_address` →
`pay_to`. Verified against v0.3.4 on 22 Oct 2026.

`UsageMeter` and `UPTO_METER_ATTR` are **not re-exported** by `x402_xrpl.server` either —
its `__init__` exports only `RequireX402Options`, `RequireX402PaymentOption`,
`InvoiceStore`, `require_x402` and `require_payment`. Import the metering surface from
`x402_xrpl.server.fastapi`.

```python
from x402_xrpl.server import RequireX402Options, require_x402
from x402_xrpl.server.fastapi import UPTO_METER_ATTR   # not on the package root
from x402_xrpl.client import XRPLUptoMerchant, XRPLUptoMerchantOptions

def sign_check_cash(signed_check_create_blob: str, amount: str) -> str:
    """(CheckCreate blob, metered amount) -> signed CheckCash blob."""
    merchant = XRPLUptoMerchant(
        XRPLUptoMerchantOptions(wallet=MERCHANT_WALLET, network=NETWORK, rpc_url=RPC)
    )
    return merchant.sign_check_cash(
        signed_check_create_blob=signed_check_create_blob, amount=amount
    )

app.middleware("http")(
    require_x402(
        RequireX402Options(
            path="/infer",
            scheme="upto",
            amount="5000",               # the CEILING, in drops (NOT `price`)
            pay_to=PAY_TO,               # NOT `pay_to_address`
            network="xrpl:1",
            asset="XRP",
            facilitator_url=FACILITATOR,
            upto_sign_check_cash=sign_check_cash,
        )
    )
)

@app.post("/infer")
def infer(request: Request):
    result, tokens = run_model(...)
    meter = getattr(request.state, UPTO_METER_ATTR)
    meter.report(str(tokens * PRICE_PER_TOKEN))      # in the asset of the requirement
    return result
```

Mechanics: the payer signs a `CheckCreate` whose `SendMax` is the ceiling; the handler runs; the merchant signs a `CheckCash` for the metered amount; the facilitator submits it. The **ledger** rejects any cash above `SendMax`, so the ceiling holds without trusting the merchant.

Three things to get right:

- **A handler that never reports is charged zero**, not the ceiling. That is deliberate — a metering bug is the merchant's cost, not the buyer's. It also means a silent failure in your handler is a silent loss of revenue, so log it.
- **`upto_sign_check_cash` is required** when `scheme="upto"` and `settle=True`, and it
  can only be supplied through `RequireX402Options` — see above.
- **A zero metered amount settles without a CheckCash.** `_settle_upto` only signs when
  the amount is above zero, then settles with `paymentRequirements.amount = "0"`.
- **`SourceTag` is mirrored** from the payer's `CheckCreate` onto the `CheckCash` unless you override it. The `CheckCash` is the settlement-effecting transaction and its hash is what the facilitator reports, so breaking that mirror loses the settling transaction in reconciliation.

Merchant-side helpers, if you drive the scheme directly rather than through the middleware: `XRPLUptoMerchant(XRPLUptoMerchantOptions(wallet, network, rpc_url)).sign_check_cash(signed_check_create_blob=…, amount=…, max_timeout_seconds=600, source_tag=None)`, and `build_upto_settle_payload(req=…, signed_check_create_blob=…, signed_check_cash_blob=…, invoice_id=…)`.

## Failure behaviour you inherit

With `require_payment` in place, a facilitator verify-stage 408 / 429 / 5xx / timeout becomes a typed **503** with `retryable=true`, `phase=verify`, `settlementAttempted=false`, `retryAfter` and `correlationId` — and neither your handler nor `/settle` runs. Fail-closed. Policy denials stay 4xx and non-retryable.

Do not catch and flatten these. A payer built with this SDK reads those exact fields to decide whether reusing the same signed payment is safe.

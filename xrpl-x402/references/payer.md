# Payer side — an agent that pays

`x402-xrpl` v0.3.4.

Two entry points. `x402_requests` gives a `requests.Session` that transparently handles 402s — drop it into code that already uses `requests`. `x402_purchase` is a single call that returns a structured result instead of raising, which is what an agent's control flow wants.

## Session style

```python
import requests
from xrpl.wallet import Wallet
from x402_xrpl.clients.requests import x402_requests
from x402_xrpl.clients.base import decode_payment_response

wallet = Wallet.from_seed(os.environ["XRPL_SEED"])      # see Agent Wallet skill

session: requests.Session = x402_requests(
    wallet,
    rpc_url="https://s.altnet.rippletest.net:51234/",
    network_filter="xrpl:1",
    scheme_filter="exact",
    max_value="2000",            # drops — refuse anything dearer
    max_fee_drops=200,           # tighten the 10_000 default
)

resp = session.get(RESOURCE_URL, timeout=180)

if "PAYMENT-RESPONSE" in resp.headers:
    settlement = decode_payment_response(resp.headers["PAYMENT-RESPONSE"])
    print("settled tx:", settlement.get("transaction"))
```

`rpc_url` falls back to `XRPL_RPC_URL` then `XRPL_TESTNET_RPC_URL`, and raises if neither is set. The payer **does not** take a facilitator URL — that is the merchant's relationship, not yours.

## Structured style

```python
from x402_xrpl import x402_purchase

result = x402_purchase(
    RESOURCE_URL,
    wallet=wallet,
    rpc_url=RPC,
    network_filter="xrpl:1",
    scheme_filter="exact",
    max_value="2000",
    max_fee_drops=200,
    confirmation_mode="auto",
    user_intent="fetch 7-day volatility for the risk report",
)

if result.status == "success":
    data = result.response.json()
elif result.status == "requires_confirmation":
    ask_the_human(result.confirmation_request)
elif result.status == "settlement_unknown":
    reconcile_on_ledger(result.transaction)          # do NOT pay again
else:
    report(result.status, result.reason)
```

`X402PurchaseResult` fields: `status`, `response`, `reason`, `confirmation_request`, `payment_response`, `transaction`, `network`, `payer`, `extensions`, `invoice_id`, `retryable`.

The status table and what each one obliges you to do is in SKILL.md. The one that bites: **`settlement_unknown` means money may have moved.** Look the transaction up before any further payment; the SDK marks it `retryable=False` and hands back recovery metadata, but the lookup is your application's job.

## Client options

| Option | Default | Notes |
| :---- | :---- | :---- |
| `rpc_url` | env | `XRPL_RPC_URL` / `XRPL_TESTNET_RPC_URL` |
| `network_filter` | `None` | **always set this** |
| `scheme_filter` | `"exact"` | |
| `max_value` | `None` | **always set this** — value ceiling |
| `max_fee_drops` | `10_000` | checked after autofill, before signing |
| `invoice_binding` | `"both"` | `"memos"` / `"invoice_id"` / `"both"` |
| `payment_requirements_selector` | default selector | custom choice among `accepts[]` |
| `payment_header_factory` | `None` | custom header construction |
| `verifiable_intent_provider` | `None` | L1–L3 delegation (see `scheme.md`) |
| `confirmation_mode` | `"auto"` | human-approval seam |
| `user_intent` | `None` | free text, carried for audit |
| `agent_trace` | `None` | mapping, carried for audit |
| `transient_verify_retries` | `2` | verify-stage retries only |
| `transient_retry_sleep` | `time.sleep` | injectable for tests |
| `x_payment_header` | `"PAYMENT-SIGNATURE"` | `x402_purchase` only; v1 used `X-PAYMENT` |

`network_filter` and `max_value` are optional in the signature and mandatory in practice. Without them an agent will pay whatever a remote server asks, on whatever network it names. The merchant chooses the fields of the transaction your agent signs — that is the threat model, and these two options are the floor of your defence.

`user_intent` and `agent_trace` cost nothing and make an audit trail legible after the fact. Set them.

## Human approval

`confirmation_mode` plus `confirmation_request` is the SDK's own seam for "a person must agree to this". The purchase returns `requires_confirmation` with the pending decision, and `declined` if the person says no — a normal outcome, not an error. Build approval on this rather than wrapping the call in your own gate: the invoice and signed payload stay consistent across the pause, and the retry logic already understands it.

For delegated authority with a spending ceiling rather than per-payment approval, use Verifiable Intent L2 (`spendingCeiling`, `allowedAssets`, `allowedChains`, `validitySeconds`) — see `references/scheme.md`.

## Driving the payer directly

When you need the signed artifacts rather than a completed HTTP round trip — to preview a transaction, route it through a hardware signer, or hold it pending approval:

```python
from x402_xrpl.client.presigned_payment_payer import (
    XRPLPresignedPaymentPayer, XRPLPresignedPaymentPayerOptions,
)

payer = XRPLPresignedPaymentPayer(
    XRPLPresignedPaymentPayerOptions(
        wallet=wallet, network="xrpl:1", rpc_url=RPC,
        invoice_binding="both", max_fee_drops=200,
    )
)

if payer.supports(req):
    prepared = payer.prepare_payment(req)
    # prepared.payment_payload / .payment_header / .signed_tx_blob / .invoice_id
```

`supports()` checks network, scheme, and — for an IOU — that the currency code is well formed and an issuer is present. Call it before `prepare_payment`, which raises on an unsupported requirement.

## Paying a metered (`upto`) quote

**The high-level client is `exact`-only.** `_build_x_payment` hardcodes
`XRPLPresignedPaymentPayer` and there is no `upto` branch anywhere under `clients/`, so
`x402_requests` and `x402_purchase` cannot pay a metered quote on their own. Inject the
scheme through the `payment_header_factory` seam. Verified against v0.3.4 on 22 Oct 2026.

```python
from x402_xrpl.client import XRPLUptoPayer, XRPLUptoPayerOptions

def authorize_check(reqs, *, extensions=None, resource=None) -> str:
    payer = XRPLUptoPayer(
        XRPLUptoPayerOptions(
            wallet=wallet, network=reqs.network, rpc_url=RPC,
            authorization_ttl_seconds=300,
        )
    )
    return payer.authorize(reqs, extensions=extensions).payment_header

result = x402_purchase(
    url, wallet=wallet, rpc_url=RPC,
    network_filter="xrpl:1",
    scheme_filter="upto",                  # or the selector rejects the quote
    max_value="6000",                      # caps the CEILING, not the charge
    payment_header_factory=authorize_check,
)
```

Give the factory explicit `extensions` and `resource` keyword parameters: the SDK
inspects its signature to decide what to pass.

`authorize()` returns `XRPLUptoAuthorization` with `payment_header`,
`signed_check_create_blob`, `check_id`, `invoice_id` and `ceiling`. The TTL is
deliberately short — it bounds how long the merchant carries payer-balance risk between
create and cash.

Two things to expect. `max_value` is compared against the quoted *ceiling*, so a cap
below the ceiling refuses the quote outright — that is correct behaviour, since what the
agent is capping is its maximum exposure. And a Check is an owner-reserve object on the
payer's account until it is cashed or cancelled, so an agent that authorizes many
concurrent Checks needs reserve headroom for all of them.

## Cross-currency (opt-in)

By default the payer funds the quoted asset exactly — an XRP quote is paid in XRP with no `SendMax`, an IOU quote with a same-asset `SendMax` equal to `Amount`. When the merchant advertises `extra["crossCurrency"] = True`, pass `pay_with`:

```python
payer.prepare_payment(req, pay_with="1000000")                    # fund a USD quote with XRP

from xrpl.models.amounts import IssuedCurrencyAmount
payer.prepare_payment(req, pay_with=IssuedCurrencyAmount(
    currency="USD", issuer="rISSUER", value="5"))
```

The destination `Amount` stays pinned to the quote; cross-currency only relaxes which asset funds it. The signed `SendMax` is your own spend ceiling, so pick it deliberately.

Before signing, the client refuses a `pay_with` the merchant did not opt into, a drops-string `pay_with` against an XRP destination (XRP→XRP is not cross-currency), and any malformed or non-positive `SendMax` — matching the facilitator's verifier so a bad value never wastes a signed transaction.

## Currency helpers

```python
from x402_xrpl.xrpl_currency import display_currency_code, resolve_currency_code

display_currency_code("524C555344000000000000000000000000000000")   # -> "RLUSD" (best effort)
resolve_currency_code("RLUSD", allow_utf8_symbol=True)              # -> 40-hex code
```

`resolve_currency_code` with `allow_utf8_symbol=True` turns a human symbol into a currency code. Only use it where your app has a trusted mapping — resolving a symbol that arrived in a 402 challenge is how an agent pays the wrong issuer's token. Also available: `is_currency_code`, `normalize_currency_code`, `encode_currency_code_utf8_to_hex`, `try_decode_currency_hex_to_utf8`.

## Keys

The SDK signs locally with `xrpl-py`, so the seed must reach `Wallet.from_seed` somehow. That path belongs to the **XRPL Agent Wallet skill**: env var or external signer, never a literal in source, never echoed to chat, never written anywhere the agent can read it back. Never place a seed, owner key or agent key in the payment payload — it goes to a third party by design.

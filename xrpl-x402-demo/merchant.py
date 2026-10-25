"""x402 merchant: a fixed-price route, a metered route, and a free route.

Run single-worker. The default invoice store is in-memory and per-process, so
behind multiple workers an invoice issued by one process is invisible to the
others and settlement fails silently.
"""

import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from x402_xrpl.client import XRPLUptoMerchant, XRPLUptoMerchantOptions
from x402_xrpl.server import RequireX402Options, require_payment, require_x402

# UPTO_METER_ATTR is NOT re-exported by x402_xrpl.server — its __init__ exports
# only five names and none of them are the metering surface. Import from the
# submodule or the whole `upto` path is unreachable.
from x402_xrpl.server.fastapi import UPTO_METER_ATTR
from xrpl.wallet import Wallet

load_dotenv()

PAY_TO = os.environ["XRPL_PAY_TO"]
PRICE_DROPS = os.environ.get("XRPL_PRICE_DROPS", "1000")
CEILING_DROPS = os.environ.get("XRPL_CEILING_DROPS", "5000")
FACILITATOR = os.environ["XRPL_FACILITATOR_URL"]
NETWORK = os.environ.get("XRPL_NETWORK", "xrpl:1")
RPC = os.environ["XRPL_RPC_URL"]

# Per-deployment analytics tag. The SDK injects nothing by default in 0.3.4
# despite what its README says, so set it explicitly or the payment carries no
# attribution. Note this identifies the ENDPOINT being paid, not the agent.
SOURCE_TAG = 20260530

# Pretend price per token, in drops. 1840 tokens -> 1840 drops, comfortably
# under the 5000-drop ceiling, which is the whole point of the metered beat.
DROPS_PER_TOKEN = 1

app = FastAPI(title="x402 demo merchant")


def _merchant_wallet() -> Wallet:
    seed = os.environ.get("XRPL_MERCHANT_SEED")
    if not seed:
        raise SystemExit("XRPL_MERCHANT_SEED is not set — run setup_wallets.py first")
    return Wallet.from_seed(seed)


def sign_check_cash(signed_check_create_blob: str, amount: str) -> str:
    """(payer's CheckCreate blob, metered amount) -> signed CheckCash blob.

    Deliberately a plain callable in the SDK, not a wallet: the merchant decides
    whether this is a local key, a KMS, or a multisign quorum. The middleware
    runs it on a worker thread, so blocking xrpl-py calls are fine here.

    The ledger refuses to cash above the Check's SendMax, so the agent's ceiling
    is enforced by consensus — not by this function behaving itself.
    """
    merchant = XRPLUptoMerchant(
        XRPLUptoMerchantOptions(wallet=_merchant_wallet(), network=NETWORK, rpc_url=RPC)
    )
    return merchant.sign_check_cash(
        signed_check_create_blob=signed_check_create_blob,
        amount=amount,
    )


# --- fixed price: the agent knows the cost before it commits -----------------
app.middleware("http")(
    require_payment(
        path="/market-data",
        price=PRICE_DROPS,
        pay_to_address=PAY_TO,
        network=NETWORK,
        asset="XRP",
        facilitator_url=FACILITATOR,
        resource="demo:market-data",
        description="7-day XRP volatility snapshot",
        source_tag=SOURCE_TAG,
        max_timeout_seconds=600,
    )
)

# --- metered: the cost is only known after the work is done -----------------
# NOTE: require_payment() cannot express this. The ergonomic wrapper takes no
# `upto_sign_check_cash` parameter, so with it there is no way to supply the
# merchant's CheckCash signer and the whole `upto` scheme is unreachable. Drop
# to require_x402() + RequireX402Options, which uses `amount`/`pay_to` rather
# than `price`/`pay_to_address`.
app.middleware("http")(
    require_x402(
        RequireX402Options(
            path="/inference",
            scheme="upto",
            amount=CEILING_DROPS,          # the CEILING, not the price
            pay_to=PAY_TO,
            network=NETWORK,
            asset="XRP",
            facilitator_url=FACILITATOR,
            resource="demo:inference",
            description="LLM inference, billed per token",
            source_tag=SOURCE_TAG,
            max_timeout_seconds=600,
            upto_sign_check_cash=sign_check_cash,
        )
    )
)


@app.get("/market-data")
def market_data():
    """Fixed-price resource. Only reached after settlement succeeds."""
    return {
        "pair": "XRP/USD",
        "window": "7d",
        "realized_vol": 0.412,
        "funding_rate_bps": 3.5,
        "as_of": "2026-10-21T00:00:00Z",
    }


@app.get("/inference")
def inference(request: Request):
    """Metered resource. Reports what it actually consumed.

    A handler that never reports is billed as ZERO, not as the ceiling — the SDK
    puts the cost of a metering bug on the merchant by design. So a silent
    failure here is silent lost revenue: log it rather than swallowing it.
    """
    tokens = 1840  # stand-in for a real model call
    answer = "Realized vol is elevated versus the trailing 30-day mean."

    meter = getattr(request.state, UPTO_METER_ATTR, None)
    if meter is None:
        print("WARNING: no usage meter on request.state — this request bills ZERO")
    else:
        meter.report(str(tokens * DROPS_PER_TOKEN))

    return {"answer": answer, "tokens": tokens, "ceiling_drops": CEILING_DROPS}


@app.get("/health")
def health():
    """Free route — proves the middleware only gates what it is told to."""
    return {
        "ok": True,
        "paid_routes": {"/market-data": PRICE_DROPS, "/inference": f"upto {CEILING_DROPS}"},
    }


if __name__ == "__main__":
    print(f"merchant   : {PAY_TO}")
    print(f"fixed      : {PRICE_DROPS} drops  /market-data")
    print(f"metered    : upto {CEILING_DROPS} drops  /inference")
    print(f"facilitator: {FACILITATOR}")
    print(f"network    : {NETWORK}")
    uvicorn.run(app, host="127.0.0.1", port=8402, log_level="warning")

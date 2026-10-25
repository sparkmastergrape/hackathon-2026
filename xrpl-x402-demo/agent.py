"""x402 payer agent, with its caps pinned.

The merchant chooses the fields of the transaction this agent signs. That is the
threat model, so network_filter / scheme_filter / max_value / max_fee_drops are
not optional here — they are the agent's entire defence against a hostile or
mistaken 402.
"""

import os
import sys

from dotenv import load_dotenv
from x402_xrpl import x402_purchase
from x402_xrpl.client import XRPLUptoPayer, XRPLUptoPayerOptions
from x402_xrpl.types import PaymentRequirements, ResourceInfo
from xrpl.wallet import Wallet

load_dotenv()

RPC = os.environ["XRPL_RPC_URL"]
NETWORK = os.environ.get("XRPL_NETWORK", "xrpl:1")
RESOURCE_URL = os.environ.get("RESOURCE_URL", "http://127.0.0.1:8402/market-data")

MAX_VALUE_DROPS = os.environ.get("AGENT_MAX_VALUE_DROPS", "2000")
MAX_FEE_DROPS = int(os.environ.get("AGENT_MAX_FEE_DROPS", "200"))
MAX_CEILING_DROPS = os.environ.get("AGENT_MAX_CEILING_DROPS", "6000")
INFERENCE_URL = os.environ.get("INFERENCE_URL", "http://127.0.0.1:8402/inference")

EXPLORER = "https://testnet.xrpl.org/transactions/"


def load_agent_wallet() -> Wallet:
    """Seed comes from the environment and goes out of scope with this call."""
    seed = os.environ.get("XRPL_SEED")
    if not seed:
        raise SystemExit("XRPL_SEED is not set — run setup_wallets.py first")
    return Wallet.from_seed(seed)


def buy(url: str, *, intent: str, max_value: str = MAX_VALUE_DROPS):
    """Pay for a resource, with every guard engaged. Returns the result object."""
    return x402_purchase(
        url,
        wallet=load_agent_wallet(),
        rpc_url=RPC,
        network_filter=NETWORK,       # refuse a quote on any other network
        scheme_filter="exact",        # refuse any other scheme
        max_value=max_value,          # refuse anything dearer than this
        max_fee_drops=MAX_FEE_DROPS,  # refuse a fee above this, after autofill
        invoice_binding="both",       # Memos AND InvoiceID
        user_intent=intent,           # carried for the audit trail
        agent_trace={"demo": "pre-saturday-plumbing"},
        timeout=180,
    )


def buy_metered(url: str, *, intent: str, max_ceiling: str = MAX_CEILING_DROPS):
    """Pay a metered (`upto`) quote by authorizing a Check for the ceiling.

    The high-level client is exact-only: `_build_x_payment` hardcodes the
    presigned-Payment payer and there is no `upto` branch anywhere in
    `clients/`. So the `upto` scheme has to be injected through the
    `payment_header_factory` seam, which is what this does.

    `max_ceiling` caps the CEILING, not the eventual charge — the agent is
    capping its maximum exposure, which is the right thing to cap. What it
    actually pays is decided afterwards by the merchant's meter and bounded by
    the ledger.
    """
    wallet = load_agent_wallet()

    def authorize_check(
        reqs: PaymentRequirements,
        *,
        extensions: dict | None = None,
        resource: ResourceInfo | None = None,
    ) -> str:
        payer = XRPLUptoPayer(
            XRPLUptoPayerOptions(
                wallet=wallet,
                network=reqs.network,
                rpc_url=RPC,
                authorization_ttl_seconds=300,
            )
        )
        return payer.authorize(reqs, extensions=extensions).payment_header

    return x402_purchase(
        url,
        wallet=wallet,
        rpc_url=RPC,
        network_filter=NETWORK,
        scheme_filter="upto",
        max_value=max_ceiling,
        payment_header_factory=authorize_check,
        user_intent=intent,
        agent_trace={"demo": "upto-metered-beat"},
        timeout=180,
    )


def report(result) -> int:
    """Map an x402 status onto an exit code and a human-readable line.

    Each status implies a different obligation. settlement_unknown is the one
    that matters: money may have moved, so never re-pay on it.
    """
    status = result.status

    if status == "success":
        print(f"  status      : {status}")
        print(f"  tx          : {result.transaction}")
        print(f"  payer       : {result.payer}")
        print(f"  network     : {result.network}")
        print(f"  invoice     : {result.invoice_id}")
        print(f"  explorer    : {EXPLORER}{result.transaction}")
        if result.response is not None:
            print(f"  resource    : {result.response.json()}")
        return 0

    if status == "requires_confirmation":
        print(f"  status      : {status}  <- a human must approve this")
        print(f"  request     : {result.confirmation_request}")
        return 2

    if status == "declined":
        print(f"  status      : {status}  <- approval refused; nothing moved")
        return 0

    if status == "settlement_unknown":
        print(f"  status      : {status}  <- MONEY MAY HAVE MOVED")
        print(f"  tx          : {result.transaction}")
        print("  action      : look this up on-ledger. Do NOT pay again.")
        return 3

    print(f"  status      : {status}")
    print(f"  reason      : {result.reason}")
    print(f"  retryable   : {result.retryable}")
    return 1


def main() -> int:
    wallet_addr = load_agent_wallet().classic_address
    print(f"agent       : {wallet_addr}")
    print(f"resource    : {RESOURCE_URL}")
    print(f"caps        : max_value={MAX_VALUE_DROPS} drops, max_fee={MAX_FEE_DROPS} drops")
    print()

    print("fixed-price call:")
    rc = report(buy(RESOURCE_URL, intent="fetch 7-day XRP volatility for the risk report"))

    print("\nmetered call (upto):")
    rc |= report(buy_metered(INFERENCE_URL, intent="summarise the volatility regime"))
    return rc


if __name__ == "__main__":
    sys.exit(main())

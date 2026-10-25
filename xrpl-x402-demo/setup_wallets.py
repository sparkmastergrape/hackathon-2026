"""Generate and fund two testnet wallets, writing seeds straight to .env.

Seeds are never printed. Only addresses are shown. Run once; re-running with an
existing .env is refused so you cannot silently orphan funded accounts.
"""

import os
import sys
from pathlib import Path

from xrpl.clients import JsonRpcClient
from xrpl.wallet import generate_faucet_wallet

RPC = "https://s.altnet.rippletest.net:51234/"
ENV = Path(".env")

TEMPLATE = """# XRPL x402 demo — testnet only. Never commit this file.
XRPL_NETWORK=xrpl:1
XRPL_RPC_URL={rpc}
XRPL_FACILITATOR_URL=https://xrpl-facilitator-testnet.t54.ai

# Merchant (receives payment)
XRPL_PAY_TO={merchant_addr}
XRPL_MERCHANT_SEED={merchant_seed}
XRPL_PRICE_DROPS=1000

# Payer agent (spends)
XRPL_AGENT_ADDRESS={agent_addr}
XRPL_SEED={agent_seed}

# Agent policy
AGENT_MAX_VALUE_DROPS=2000
AGENT_MAX_FEE_DROPS=200

RESOURCE_URL=http://127.0.0.1:8000/market-data
"""


def main() -> int:
    if ENV.exists():
        print("ERROR: .env already exists. Delete it first if you really want new wallets.")
        return 1

    client = JsonRpcClient(RPC)

    print("Funding merchant wallet from the testnet faucet...")
    merchant = generate_faucet_wallet(client, debug=False)
    print(f"  merchant : {merchant.classic_address}")

    print("Funding payer agent wallet...")
    agent = generate_faucet_wallet(client, debug=False)
    print(f"  agent    : {agent.classic_address}")

    ENV.write_text(
        TEMPLATE.format(
            rpc=RPC,
            merchant_addr=merchant.classic_address,
            merchant_seed=merchant.seed,
            agent_addr=agent.classic_address,
            agent_seed=agent.seed,
        ),
        encoding="utf-8",
    )
    os.chmod(ENV, 0o600)

    print()
    print("Seeds written to .env (not shown here). .env is gitignored.")
    print("Explorer: https://testnet.xrpl.org/accounts/" + agent.classic_address)
    return 0


if __name__ == "__main__":
    sys.exit(main())

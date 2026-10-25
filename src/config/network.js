// Verified network constants. Every value here was read from
// GET /public/x402-context (authoritative, unauthenticated) and confirmed
// on-chain by src/payer/probe-network.mjs on 2026-10-25.
//
// Do not edit by hand from memory — re-run `npm run probe:network`.

/**
 * XRPL EVM **Testnet**.
 *
 * 1440000 is MAINNET. The Ledger hackathon page states 1440000 for the
 * sidechain; AP4M and the live RPC both say 1449000 for testnet. Because
 * chainId sits inside the EIP-712 domain separator, using the wrong one
 * produces signatures bound to the wrong network that still verify locally.
 * See docs/DX-LOG.md D-017.
 */
export const CHAIN_ID = 1449000;
export const CHAIN_ID_MAINNET_DO_NOT_USE = 1440000;

export const RPC_URL = "https://rpc.testnet.xrplevm.org";
export const GAS_FAUCET = "https://faucet.testevm.ripple.com";

/** RLUSD on XRPL EVM Testnet. 18 decimals — confirmed by `decimals()`. */
export const RLUSD = "0x27b57a9D0b8d24EB97259c4E2279e45255e016f3";
export const RLUSD_DECIMALS = 18;

/** AP4M PaymentLedger — vouchers are redeemed here, and it is the EIP-712 verifyingContract for a Voucher. */
export const PAYMENT_LEDGER = "0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91";
export const VAULT = "0x83DD9cD010eb46e96eceF8F7eB0a18f7845AaBC0";

export const AP4M_API_URL = "https://hackathon.ap4m.build";

/** x402 network identifier as AP4M reports it in a 402 challenge. */
export const X402_NETWORK = `eip155:${CHAIN_ID}`;

/** The only scheme AP4M offers. Not `exact`/`upto` from generic x402-XRPL. */
export const X402_SCHEME = "batch-settlement";

// Protocol versions, read from `@ap4m/sdk`'s own exported constants
// (`X402_VERSION = 2`, `X402_BINDING_VERSION = "1"`). Mirrored here so the pure
// modules need no dependency on the SDK.
export const X402_VERSION = 2;
export const X402_BINDING_VERSION = "1";

/** Headers AP4M uses for the x402 exchange. */
export const HEADERS = {
  required: "PAYMENT-REQUIRED",
  signature: "PAYMENT-SIGNATURE",
  response: "PAYMENT-RESPONSE",
  channelId: "X-AP4M-CHANNEL-ID",
};

/**
 * EIP-712 shape AP4M uses for a payment Voucher, for reference.
 * Note it carries no merchant, price or purpose — only a channel and a running
 * total — which is why a human cannot meaningfully review one, and why the
 * Mandate layer exists. See docs/ARCHITECTURE.md §3.0(b).
 */
export const VOUCHER_EIP712 = {
  domainName: "AP4M Payment Ledger",
  domainVersion: "1",
  types: {
    Voucher: [
      { name: "channelId", type: "bytes32" },
      { name: "cumulativeAmount", type: "uint256" },
    ],
  },
};

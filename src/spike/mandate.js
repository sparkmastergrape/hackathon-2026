// Demo fixture for the Tier 0 spike. The real implementation lives in
// src/mandate — this file only supplies sample values so the device screens
// show something realistic. Keeping one implementation means the thing we
// verify on hardware is the thing the library ships.

import { buildMandate, toSignerPayload, rlusd } from "../mandate/index.js";
import { CHAIN_ID, RLUSD, PAYMENT_LEDGER } from "../config/network.js";

export { toSignerPayload };
export const XRPL_EVM_CHAIN_ID = CHAIN_ID;
export { RLUSD, PAYMENT_LEDGER };

// Placeholder until contracts/MandateRegistry.sol is deployed (ARCHITECTURE C8).
// EIP-712 needs a verifyingContract; the spike does not need it to exist yet.
export const PLACEHOLDER_REGISTRY = "0x0000000000000000000000000000000000000001";

/** The team's merchant payout address on AP4M. */
export const TEAM_MERCHANT = "0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8";

/**
 * A realistic mandate for the device-signing spike.
 *
 * Caps sit inside the AP4M channel cap of 5 RLUSD against the 0.01 RLUSD demo
 * price: 5 calls of headroom per call, 50 per hour, 200 lifetime.
 */
export function buildSampleMandate({
  agent = "0x0000000000000000000000000000000000000002",
  asset = RLUSD,
  merchant = TEAM_MERCHANT,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  return buildMandate({
    agent,
    asset,
    merchant,
    maxPerCall: rlusd("0.05"),
    maxTotal: rlusd("2"),
    maxPerWindow: rlusd("0.5"),
    windowSeconds: 3600,
    validFrom: now,
    validUntil: now + 3600,
    purpose: "market-data",
    nonce: now,
    registry: PLACEHOLDER_REGISTRY,
  });
}

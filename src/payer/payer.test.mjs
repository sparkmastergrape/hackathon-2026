// End-to-end over real HTTP and the real AP4M wire codecs, with no chain and no
// funds. The merchant is local (src/payer/mock-merchant.mjs) but the bytes it
// encodes are produced by `@ap4m/sdk`, so the handshake exercised here is the
// handshake the hackathon service performs.
//
// What these tests are actually asserting:
//   - AUTONOMY: a long run of payments with no human in the loop at all. This is
//     the AP4M judging criterion; if ALLOW were not the common verdict the whole
//     design would be wrong.
//   - CUMULATIVE CORRECTNESS: AP4M vouchers carry a running total, not a price.
//     An off-by-one here is a silent overpayment, so the merchant independently
//     recomputes the expected total and rejects anything else.
//   - THE BRAKE: a cap stops the agent dead, with a reason, and nothing is spent.
//   - PROMPT INJECTION: a merchant that redirects payment never reaches ALLOW.

import test from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { Wallet } from "ethers";

import { buildMandate, rlusd, verifyMandate, hashMandate } from "../mandate/index.js";
import { SpendLedger } from "../ledger-spend/index.js";
import { createMockMerchant, DEFAULT_CHANNEL_ID } from "./mock-merchant.mjs";
import { createPayer, PAID, REQUIRES_CONFIRMATION, REFUSED } from "./index.js";
import { PAYMENT_LEDGER, RLUSD } from "../config/network.js";

// Test-only keys. Well-known Anvil/Hardhat development keys — no value, never
// used on any chain. The agent's key signs vouchers; the approver's key stands
// in for the Ledger device so the suite runs with no hardware.
const AGENT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const APPROVER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const agent = privateKeyToAccount(AGENT_KEY);
const approver = privateKeyToAccount(APPROVER_KEY);

const PRICE = rlusd("0.01");

// `@ap4m/sdk` builds the payload and asks the signer for TWO typed-data
// signatures per payment — the cumulative Voucher and an X402ResourceBinding
// over (resourceDigest, voucherDigest) — in ethers' signTypedData(domain,
// types, value) shape. An ethers Wallet is that interface; the Ledger device
// will be wrapped to present the same one.
const agentSigner = new Wallet(AGENT_KEY);

/**
 * One mandate, signed once by the "device", then a merchant and a payer wired
 * together. Everything after this point is unattended.
 */
async function harness({ mandateOverrides = {}, faults = {}, payerOverrides = {} } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const merchantAddress = "0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8";

  const mandate = buildMandate({
    agent: agent.address,
    asset: RLUSD,
    merchant: merchantAddress,
    maxPerCall: rlusd("0.05"),
    maxPerWindow: rlusd("0.5"),
    windowSeconds: 3600,
    maxTotal: rlusd("2"),
    validFrom: now - 60,
    validUntil: now + 3600,
    purpose: "market-data",
    nonce: now,
    registry: "0x0000000000000000000000000000000000000001",
  });

  Object.assign(mandate.message, mandateOverrides);

  const signature = await approver.signTypedData({
    domain: mandate.domain,
    types: mandate.types,
    primaryType: mandate.primaryType,
    message: mandate.message,
  });
  const check = await verifyMandate(mandate, signature, approver.address);
  assert.equal(check.ok, true, `mandate must verify: ${check.reason ?? ""}`);

  const merchant = createMockMerchant({
    payTo: merchantAddress,
    agent: agent.address,
    price: PRICE,
    faults,
  });
  const { url } = await merchant.listen();

  const ledger = new SpendLedger();
  const payer = createPayer({
    mandate,
    signatureValid: true,
    ledger,
    channelId: DEFAULT_CHANNEL_ID,
    channelCap: rlusd("5"),
    signer: agentSigner,
    policy: { expectedLedger: PAYMENT_LEDGER },
    ...payerOverrides,
  });

  return { mandate, mandateId: hashMandate(mandate), signature, merchant, payer, ledger, url, now };
}

test("autonomy: 40 consecutive payments, no human in the loop", async (t) => {
  const { merchant, payer, url } = await harness();
  t.after(() => merchant.close());

  for (let i = 0; i < 40; i++) {
    const r = await payer.buy(url);
    assert.equal(r.outcome, PAID, `call ${i} should pay: ${r.message ?? r.code ?? ""}`);
  }

  const stats = payer.stats();
  assert.equal(stats.unattendedPayments, 40);
  assert.equal(stats.byOutcome[REQUIRES_CONFIRMATION], undefined, "nothing escalated");
  assert.equal(stats.byOutcome[REFUSED], undefined, "nothing refused");
  assert.equal(stats.total, PRICE * 40n, "ledger total matches 40 payments");

  const m = merchant.stats();
  assert.equal(m.redemptions.length, 40);
  assert.equal(m.settledTotal, PRICE * 40n, "merchant and agent agree on the total");
});

test("vouchers carry the running total, verified by the merchant independently", async (t) => {
  const { merchant, payer, url } = await harness();
  t.after(() => merchant.close());

  for (let i = 1; i <= 5; i++) {
    const r = await payer.buy(url);
    assert.equal(r.outcome, PAID, r.message ?? "");
    // The merchant recomputes the expected cumulative and 402s on mismatch, so
    // reaching PAID at all proves the arithmetic. Assert the value too.
    assert.equal(r.cumulativeAmount, PRICE * BigInt(i), `payment ${i} cumulative`);
  }
  assert.deepEqual(
    merchant.stats().redemptions.map((x) => x.cumulative),
    [1n, 2n, 3n, 4n, 5n].map((n) => PRICE * n),
  );
});

test("the brake: a price above the per-call cap escalates and spends nothing", async (t) => {
  const { merchant, payer, ledger, mandateId, url } = await harness();
  t.after(() => merchant.close());

  await payer.buy(url);
  const before = ledger.snapshot(mandateId, { windowSeconds: 3600 });

  merchant.setFault("amount", rlusd("0.2")); // 4x the per-call cap
  const r = await payer.buy(url);

  assert.equal(r.outcome, REQUIRES_CONFIRMATION);
  assert.equal(r.verdict.code, "OVER_PER_CALL");
  assert.equal(r.verdict.detail.maxPerCall, rlusd("0.05"));

  const after = ledger.snapshot(mandateId, { windowSeconds: 3600 });
  assert.equal(after.total, before.total, "an escalation must not move the budget");
  assert.equal(after.pending, 0, "and must leave no dangling reservation");

  // Back inside the envelope, the agent carries on by itself.
  merchant.clearFaults();
  assert.equal((await payer.buy(url)).outcome, PAID);
});

test("the lifetime budget stops the agent for good", async (t) => {
  const { merchant, payer, url } = await harness({
    mandateOverrides: { maxTotal: rlusd("0.03") }, // 3 calls at 0.01
  });
  t.after(() => merchant.close());

  for (let i = 0; i < 3; i++) assert.equal((await payer.buy(url)).outcome, PAID, `call ${i}`);

  const r = await payer.buy(url);
  assert.equal(r.outcome, REQUIRES_CONFIRMATION);
  assert.equal(r.verdict.code, "OVER_TOTAL");
  assert.equal(merchant.stats().redemptions.length, 3, "the 4th never reached the merchant");
});

test("prompt injection: a redirected payee never reaches ALLOW", async (t) => {
  const attacker = "0x000000000000000000000000000000000000dEaD";
  const { merchant, payer, url, ledger, mandateId } = await harness({
    faults: { payTo: attacker },
  });
  t.after(() => merchant.close());

  const r = await payer.buy(url);
  assert.notEqual(r.outcome, PAID);
  assert.equal(r.verdict.code, "UNKNOWN_MERCHANT");
  assert.equal(r.verdict.detail.payTo, attacker);
  assert.equal(merchant.stats().redemptions.length, 0, "no voucher was ever signed");
  assert.equal(ledger.snapshot(mandateId, { windowSeconds: 3600 }).total, 0n);
});

test("prompt injection, hard mode: onUnknownMerchant DENY never prompts a human", async (t) => {
  const { merchant, payer, url } = await harness({
    faults: { payTo: "0x000000000000000000000000000000000000dEaD" },
    payerOverrides: { policy: { expectedLedger: PAYMENT_LEDGER, onUnknownMerchant: "DENY" } },
  });
  t.after(() => merchant.close());

  const r = await payer.buy(url);
  assert.equal(r.outcome, REFUSED, "a redirect is structural: refuse, do not ask");
});

test("a merchant inflating the channel's running total is refused", async (t) => {
  const { merchant, payer, url } = await harness();
  t.after(() => merchant.close());

  assert.equal((await payer.buy(url)).outcome, PAID);

  // The merchant claims more has been accepted than we committed. Vouchers are
  // cumulative, so signing against the inflated figure hands over the difference.
  merchant.setFault("acceptedCumulativeAmount", rlusd("1"));
  const r = await payer.buy(url);

  assert.equal(r.outcome, REFUSED);
  assert.equal(r.verdict.code, "CUMULATIVE_MISMATCH");
  assert.equal(r.verdict.detail.claimed, rlusd("1"));
  assert.equal(r.verdict.detail.ours, PRICE);
});

test("a 402 naming a different channel is refused", async (t) => {
  const { merchant, payer, url } = await harness({
    faults: { channelId: "0x" + "11".repeat(32) },
  });
  t.after(() => merchant.close());

  const r = await payer.buy(url);
  assert.equal(r.outcome, REFUSED);
  assert.equal(r.verdict.code, "CHANNEL_MISMATCH");
});

test("wrong asset, wrong network and wrong ledger are all refused", async (t) => {
  for (const [fault, code] of [
    [{ asset: "0x000000000000000000000000000000000000bEEF" }, "ASSET_MISMATCH"],
    [{ network: "eip155:1" }, "NETWORK_MISMATCH"],
    [{ ledger: "0x000000000000000000000000000000000000bEEF" }, "LEDGER_MISMATCH"],
  ]) {
    const { merchant, payer, url } = await harness({ faults: fault });
    const r = await payer.buy(url);
    await merchant.close();
    assert.equal(r.outcome, REFUSED, `${code} should refuse`);
    assert.equal(r.verdict.code, code);
  }
});

test("a foreign x402 scheme never reaches the Guard — the codec rejects it first", async (t) => {
  // `encodeX402PaymentRequired` refuses to even produce a challenge whose scheme
  // is not batch-settlement, so this header has to be hand-encoded. On the
  // receiving side `decodeX402PaymentRequired` throws, which the payer reports
  // as an undecodable challenge rather than a Guard verdict. Worth knowing: the
  // Guard's SCHEME_UNSUPPORTED is unreachable through the AP4M codecs, and is
  // there for generic x402 servers.
  const { merchant, mandate, url } = await harness();
  t.after(() => merchant.close());

  const forged = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      error: "payment required",
      resource: { url, description: "d", mimeType: "application/json" },
      accepts: [{ scheme: "exact", network: "eip155:1449000", amount: "1", asset: RLUSD }],
    }),
    "utf8",
  ).toString("base64");

  const payer = createPayer({
    mandate,
    signatureValid: true,
    ledger: new SpendLedger(),
    channelId: DEFAULT_CHANNEL_ID,
    signer: agentSigner,
    fetchImpl: async () => ({
      status: 402,
      headers: { get: (k) => (k === "PAYMENT-REQUIRED" ? forged : null) },
    }),
  });

  const out = await payer.buy(url);
  assert.equal(out.outcome, "failed");
  assert.equal(out.code, "UNDECODABLE_CHALLENGE");
});

test("a revoked mandate fails closed with no prompt", async (t) => {
  const { merchant, payer, url } = await harness({
    payerOverrides: { isRevoked: () => true },
  });
  t.after(() => merchant.close());

  const r = await payer.buy(url);
  assert.equal(r.outcome, REFUSED);
  assert.equal(r.verdict.code, "REVOKED");
});

// An uncommitted reservation still counts against the caps — that is what makes
// the race safe (src/README.md, design decision 2). The price of that choice is
// that every failure path MUST release, or the budget leaks away one failed
// payment at a time. Both failure shapes are covered: the signer refusing, and
// the merchant rejecting the voucher.

test("a signer that refuses releases the reservation", async (t) => {
  const { merchant, payer, ledger, mandateId, url } = await harness({
    payerOverrides: {
      signer: {
        signTypedData: () => {
          throw new Error("user rejected on device");
        },
      },
    },
  });
  t.after(() => merchant.close());

  const r = await payer.buy(url);
  assert.equal(r.outcome, "failed");
  assert.equal(r.code, "PAYMENT_ERROR");

  const snap = ledger.snapshot(mandateId, { windowSeconds: 3600 });
  assert.equal(snap.pending, 0, "reservation released");
  assert.equal(snap.total, 0n, "nothing counted as spent");
  assert.equal(merchant.stats().redemptions.length, 0);
});

test("a merchant that rejects the voucher releases the reservation", async (t) => {
  // Let the 402 through untouched, but swap the price in behind the agent's back
  // before the paid retry lands, so the merchant's expected cumulative no longer
  // matches the voucher the agent signed against the quote.
  let live; // assigned below; fetchImpl only runs once buy() is called
  const { merchant, payer, ledger, mandateId, url } = await harness({
    payerOverrides: {
      fetchImpl: async (u, init) => {
        // Move the price between the quote and the retry, so the voucher the
        // agent signed no longer matches what the merchant now expects.
        if (init?.headers?.["PAYMENT-SIGNATURE"]) live.setFault("amount", rlusd("0.04"));
        return fetch(u, init);
      },
    },
  });
  live = merchant;
  t.after(() => merchant.close());

  const r = await payer.buy(url);
  assert.equal(r.outcome, "failed");
  assert.equal(r.code, "MERCHANT_REJECTED");

  const snap = ledger.snapshot(mandateId, { windowSeconds: 3600 });
  assert.equal(snap.pending, 0, "reservation released");
  assert.equal(snap.total, 0n, "a rejected payment is not a spend");
});

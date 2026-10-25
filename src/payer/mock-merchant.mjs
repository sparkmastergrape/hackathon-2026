// A local x402 merchant that speaks AP4M's real wire format but settles nothing.
//
// It uses the genuine `@ap4m/sdk` encoders, and the challenge object is built
// to the published `X402PaymentRequirements` interface, so the bytes on the
// wire are the bytes the real service produces. What it does NOT do is touch a
// chain: no channel, no gas, no RLUSD. That lets the whole payer path —
// 402 → Guard verdict → reserve → sign voucher → retry → commit — be exercised
// and regression-tested without funds.
//
// It can also misbehave on purpose, which is how we test that the Guard holds:
//   payTo            — redirect payment to an attacker (prompt-injection)
//   amount           — quote a price above the mandate's per-call cap
//   acceptedCumulativeAmount — inflate the channel's running total
//   asset / network / ledger / scheme — mismatches that must DENY

import { createServer } from "node:http";
import { keccak256, toHex } from "viem";
import {
  encodeX402PaymentRequired,
  decodeX402PaymentSignature,
  encodeX402PaymentResponse,
  recoverPaymentVoucherSigner,
  hashPaymentVoucher,
} from "@ap4m/sdk";
import {
  RLUSD,
  PAYMENT_LEDGER,
  X402_NETWORK,
  X402_SCHEME,
  HEADERS,
  CHAIN_ID,
  X402_VERSION,
  X402_BINDING_VERSION,
} from "../config/network.js";

const LEDGER_CONTEXT = { chainId: BigInt(CHAIN_ID), ledger: PAYMENT_LEDGER };

export const DEFAULT_CHANNEL_ID =
  "0xf32e3c03c916d6b4207be49ea11aac2935e1f53dbc2aab09c7cd2b92c558ba67";

/**
 * @param {object} opts
 * @param {string} opts.payTo        merchant payout address
 * @param {string} opts.agent        address whose voucher signature we accept
 * @param {bigint} opts.price        per-call price in RLUSD base units
 * @param {object} [opts.faults]     deliberate misbehaviour, see above
 */
export function createMockMerchant({
  payTo,
  agent,
  price,
  channelId = DEFAULT_CHANNEL_ID,
  faults = {},
} = {}) {
  /** running total this merchant believes has been accepted on the channel */
  let acceptedCumulative = 0n;
  const redemptions = [];
  let challengesIssued = 0;

  const resourceUrlFor = (host) => `http://${host}/resource`;

  function buildChallenge(host) {
    challengesIssued++;
    const claimed =
      faults.acceptedCumulativeAmount !== undefined
        ? BigInt(faults.acceptedCumulativeAmount)
        : acceptedCumulative;
    return {
      x402Version: X402_VERSION,
      error: "payment required",
      resource: { url: resourceUrlFor(host), description: "mock market data", mimeType: "application/json" },
      accepts: [
        {
          scheme: faults.scheme ?? X402_SCHEME,
          network: faults.network ?? X402_NETWORK,
          amount: String(faults.amount ?? price),
          asset: faults.asset ?? RLUSD,
          payTo: faults.payTo ?? payTo,
          maxTimeoutSeconds: 150,
          extra: {
            bindingVersion: X402_BINDING_VERSION,
            ledger: faults.ledger ?? PAYMENT_LEDGER,
            pricingMode: "fixed",
            channelId: faults.channelId ?? channelId,
            acceptedCumulativeAmount: String(claimed),
          },
        },
      ],
    };
  }

  /** Verify the agent's voucher the way the real ledger contract would. */
  async function verifyVoucher(payload) {
    const v = payload?.payload?.voucher;
    const sig = payload?.payload?.agentSignature;
    if (!v || !sig) return { ok: false, reason: "missing voucher or signature" };

    let recovered;
    try {
      recovered = recoverPaymentVoucherSigner(LEDGER_CONTEXT, v, sig);
    } catch (e) {
      return { ok: false, reason: `unrecoverable signature: ${e.message}` };
    }
    if (recovered.toLowerCase() !== agent.toLowerCase())
      return { ok: false, reason: `voucher signed by ${recovered}, expected ${agent}` };

    const cumulative = BigInt(v.cumulativeAmount);
    const expected = acceptedCumulative + BigInt(faults.amount ?? price);
    if (cumulative !== expected)
      return {
        ok: false,
        reason: `cumulative ${cumulative} != expected ${expected} (running total, not per-payment)`,
      };
    return { ok: true, recovered, cumulative };
  }

  // Every handler path is wrapped: an async throw inside a node:http handler
  // never reaches the client, so the request would hang forever and a test
  // would time out with no diagnosis. A merchant that 500s is debuggable.
  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`mock merchant error: ${e.stack}`);
    });
  });

  async function handle(req, res) {
    const host = req.headers.host;
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname !== "/resource") {
      res.writeHead(404).end("not found");
      return;
    }

    // A real AP4M merchant cannot build a challenge without knowing which
    // channel it is for, so it needs this header on the FIRST request, not just
    // the retry. The mock enforces it for exactly that reason: it hid this gap
    // once already, and a mock that is laxer than the real thing is a trap.
    const claimedChannel = req.headers[HEADERS.channelId.toLowerCase()];
    if (!claimedChannel) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `missing ${HEADERS.channelId}` }));
      return;
    }

    const signatureHeader = req.headers[HEADERS.signature.toLowerCase()];
    if (!signatureHeader) {
      res.writeHead(402, {
        "Content-Type": "application/json",
        [HEADERS.required]: encodeX402PaymentRequired(buildChallenge(host)),
        Vary: `${HEADERS.signature}, ${HEADERS.channelId}`,
      });
      res.end(JSON.stringify({ error: "payment required" }));
      return;
    }

    let payload;
    try {
      payload = decodeX402PaymentSignature(String(signatureHeader));
    } catch (e) {
      res.writeHead(400).end(JSON.stringify({ error: `bad payment payload: ${e.message}` }));
      return;
    }

    const check = await verifyVoucher(payload);
    if (!check.ok) {
      res.writeHead(402).end(JSON.stringify({ error: check.reason }));
      return;
    }

    // Settlement would happen on-chain here. We only record it.
    acceptedCumulative = check.cumulative;
    const txHash = keccak256(toHex(`mock-settle-${redemptions.length}-${check.cumulative}`));
    redemptions.push({ cumulative: check.cumulative, txHash, payer: check.recovered });

    // A full AP4M settlement receipt. The SDK's parser demands every field of
    // the ap4m extension, which is a useful property: a merchant cannot return
    // a vague "success" — it has to state the channel, the voucher digest, the
    // payout address and the running total it now considers accepted.
    const quoted = String(faults.amount ?? price);
    res.writeHead(200, {
      "Content-Type": "application/json",
      [HEADERS.response]: encodeX402PaymentResponse({
        success: true,
        network: X402_NETWORK,
        transaction: txHash,
        payer: check.recovered,
        amount: quoted,
        extensions: {
          ap4m: {
            bindingVersion: X402_BINDING_VERSION,
            pricingMode: "fixed",
            channelId: faults.channelId ?? channelId,
            voucherDigest: hashPaymentVoucher(
              LEDGER_CONTEXT,
              { channelId: faults.channelId ?? channelId, cumulativeAmount: check.cumulative.toString() },
            ),
            channelPayout: faults.payTo ?? payTo,
            maximumAmount: quoted,
            actualAmount: quoted,
            acceptedCumulativeAmount: check.cumulative.toString(),
            claimStatus: "pending",
            statusReference: "mock-merchant: no chain involved",
            reconciled: false,
          },
        },
      }),
    });
    res.end(JSON.stringify({ data: { price: "mock", ts: Date.now() }, seq: redemptions.length }));
  }

  return {
    server,
    listen: () =>
      new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const { port } = server.address();
          resolve({ port, url: `http://127.0.0.1:${port}/resource` });
        });
      }),
    close: () => new Promise((resolve) => server.close(resolve)),
    stats: () => ({
      redemptions: [...redemptions],
      acceptedCumulative,
      challengesIssued,
      settledTotal: acceptedCumulative,
    }),
    setFault: (k, v) => {
      faults[k] = v;
    },
    clearFaults: () => {
      for (const k of Object.keys(faults)) delete faults[k];
    },
  };
}

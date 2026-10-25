/**
 * AP4M x402 merchant — the payment hot path from the workshop deck, slide 10.
 *
 * Request a resource with no payment and this returns HTTP 402 with its
 * requirements. Retry with a PAYMENT-SIGNATURE header holding a signed AP4M
 * voucher and it verifies the signature off-chain, releases the resource, and
 * answers 200 with a PAYMENT-RESPONSE header. One HTTP round trip, and no
 * chain write: the voucher is redeemed later, out of band.
 *
 * Usage:
 *   node --env-file=.env x402-merchant.cjs          # listens on PORT (default 4021)
 *
 * The envelope follows x402 v2: a PaymentRequired challenge with an accepts[]
 * array, base64 JSON in the PAYMENT-SIGNATURE and PAYMENT-RESPONSE headers.
 * The scheme is NOT x402's "exact" — that means a presigned XRPL Payment blob.
 * This one is "ap4m-voucher": an EIP-712 Voucher against the PaymentLedger on
 * the XRPL EVM sidechain. The name is deliberately different so a stock x402
 * client refuses it rather than signing the wrong thing.
 */

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { ethers } = require('ethers');

const PORT = Number(process.env.PORT || 4021);
const API = process.env.AP4M_API_URL || 'https://hackathon.ap4m.build';
const PRICE_RLUSD = process.env.PAYMENT_RLUSD || '0.01';
const QUOTE_TTL_SECONDS = Number(process.env.X402_QUOTE_TTL || 300);

const SCHEME = 'ap4m-voucher';

// Full channel struct, so the merchant can read the agent and payout itself
// rather than trusting anything the client sends.
const CHANNELS_ABI = [
  'function channels(bytes32 channelId) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)',
];

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
const unb64 = (text) => JSON.parse(Buffer.from(text, 'base64').toString('utf8'));

// ── State the merchant keeps ────────────────────────────────────────────────
const invoices = new Map();   // invoiceId -> { requirement, expiresAt, used }
const watermark = new Map();  // channelId -> highest cumulativeAmount accepted
const collected = [];         // vouchers to redeem later

let config;
let provider;
let ledger;

async function loadConfig() {
  const resp = await fetch(`${API}/public/config`);
  if (!resp.ok) throw new Error(`could not read ${API}/public/config (${resp.status})`);
  config = await resp.json();
  provider = new ethers.JsonRpcProvider(process.env.AP4M_RPC_URL || config.network.rpcUrl);
  const address = process.env.PAYMENT_LEDGER || config.contracts.paymentLedger;
  ledger = new ethers.Contract(address, CHANNELS_ABI, provider);
  return config;
}

async function readChannel(channelId) {
  const r = await ledger.channels(channelId);
  return {
    cap: r[7],
    redeemed: r[8],
    agent: r[9],
    status: Number(r[11]),
    payout: r[12],
    validBefore: r[17],
  };
}

/** The 402 challenge. One entry in accepts[], priced in RLUSD wei. */
function buildChallenge(resource) {
  const invoiceId = 'INV-' + crypto.randomBytes(12).toString('hex');
  const requirement = {
    scheme: SCHEME,
    network: `eip155:${config.network.chainId}`,
    asset: config.contracts.rlusdToken,
    amount: ethers.parseUnits(PRICE_RLUSD, 18).toString(),
    payTo: process.env.MERCHANT_ADDRESS || '',
    maxTimeoutSeconds: QUOTE_TTL_SECONDS,
    extra: {
      invoiceId,
      // Everything the agent needs to sign the right voucher for the right chain.
      verifyingContract: ledger.target,
      eip712: {
        domain: { name: 'AP4M Payment Ledger', version: '1', chainId: config.network.chainId, verifyingContract: ledger.target },
        types: { Voucher: [{ name: 'channelId', type: 'bytes32' }, { name: 'cumulativeAmount', type: 'uint256' }] },
      },
    },
  };
  invoices.set(invoiceId, {
    requirement,
    expiresAt: Date.now() + QUOTE_TTL_SECONDS * 1000,
    used: false,
  });
  return { x402Version: 2, resource, accepts: [requirement] };
}

/**
 * Verify a PaymentPayload. Mirrors the facilitator verification order from the
 * x402 scheme: envelope first, then the signature, then the channel, then
 * policy. An earlier check failing makes a later one meaningless.
 *
 * Returns { ok: true, detail } or { ok: false, reason, detail }.
 */
async function verifyPayload(payload) {
  // 1. Envelope
  if (payload?.x402Version !== 2) return { ok: false, reason: 'invalid_envelope' };
  const accepted = payload.accepted;
  if (accepted?.scheme !== SCHEME) return { ok: false, reason: 'unsupported_scheme' };
  if (accepted.network !== `eip155:${config.network.chainId}`) return { ok: false, reason: 'invalid_network' };

  // 2. Invoice: known, unexpired, unused. This is the replay guard.
  const invoiceId = accepted.extra?.invoiceId;
  const record = invoices.get(invoiceId);
  if (!record) return { ok: false, reason: 'unknown_invoice' };
  if (record.used) return { ok: false, reason: 'invoice_already_used' };
  if (Date.now() > record.expiresAt) return { ok: false, reason: 'invoice_expired' };
  if (accepted.amount !== record.requirement.amount) return { ok: false, reason: 'amount_mismatch' };

  // 3. The voucher and its signature
  const { voucher, signature } = payload.payload ?? {};
  if (!voucher?.channelId || voucher.cumulativeAmount === undefined) return { ok: false, reason: 'malformed_voucher' };
  if (!signature) return { ok: false, reason: 'missing_signature' };

  const cumulativeAmount = BigInt(voucher.cumulativeAmount);
  let signer;
  try {
    signer = ethers.verifyTypedData(
      { name: 'AP4M Payment Ledger', version: '1', chainId: config.network.chainId, verifyingContract: ledger.target },
      { Voucher: [{ name: 'channelId', type: 'bytes32' }, { name: 'cumulativeAmount', type: 'uint256' }] },
      { channelId: voucher.channelId, cumulativeAmount },
      signature,
    );
  } catch (error) {
    return { ok: false, reason: 'unverifiable_signature', detail: error.message };
  }

  // 4. The channel, read from the ledger — never from the client
  const channel = await readChannel(voucher.channelId);
  if (channel.agent === ethers.ZeroAddress) return { ok: false, reason: 'unknown_channel' };
  if (signer.toLowerCase() !== channel.agent.toLowerCase()) {
    return { ok: false, reason: 'signer_is_not_the_channel_agent', detail: `signed by ${signer}, channel agent is ${channel.agent}` };
  }
  if (channel.status !== 1) return { ok: false, reason: 'channel_not_open', detail: `status ${channel.status}` };

  const payTo = record.requirement.payTo;
  if (payTo && channel.payout.toLowerCase() !== payTo.toLowerCase()) {
    return { ok: false, reason: 'payout_mismatch', detail: `channel pays ${channel.payout}, this merchant is ${payTo}` };
  }

  // 5. Policy: the running total must advance by exactly the price, and stay under the cap.
  const price = BigInt(record.requirement.amount);
  const seen = watermark.get(voucher.channelId) ?? 0n;
  const floor = channel.redeemed > seen ? channel.redeemed : seen;
  const expected = floor + price;

  // The cap comes first. A voucher over the cap cannot be redeemed whatever
  // this merchant expected, so it is refused on that ground and not on a
  // bookkeeping mismatch. This also covers an exhausted channel, where
  // floor + price has itself passed the cap.
  if (cumulativeAmount > channel.cap || expected > channel.cap) {
    return {
      ok: false,
      reason: 'over_cap',
      detail: `${ethers.formatUnits(cumulativeAmount > channel.cap ? cumulativeAmount : expected, 18)} RLUSD would pass the ${ethers.formatUnits(channel.cap, 18)} RLUSD cap`,
    };
  }
  if (cumulativeAmount !== expected) {
    return {
      ok: false,
      reason: 'cumulative_amount_mismatch',
      detail: `expected ${ethers.formatUnits(expected, 18)} RLUSD, voucher says ${ethers.formatUnits(cumulativeAmount, 18)}`,
    };
  }

  return { ok: true, detail: { signer, channel, cumulativeAmount, invoiceId, price } };
}

// ── The protected resource ──────────────────────────────────────────────────
function theResource(detail) {
  return {
    resource: 'market-sentiment/v1',
    generatedAt: new Date().toISOString(),
    paidBy: detail.signer,
    amountRlusd: ethers.formatUnits(detail.price, 18),
    body: 'Sentiment for the requested window: 0.62 positive, 0.21 neutral, 0.17 negative.',
  };
}

const send = (res, status, body, headers = {}) => {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(text);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/vouchers') {
    return send(res, 200, { count: collected.length, vouchers: collected });
  }
  if (url.pathname !== '/resource') {
    return send(res, 404, { error: 'only /resource and /vouchers exist' });
  }

  const header = req.headers['payment-signature'];

  // No payment: answer with the challenge.
  if (!header) {
    const challenge = buildChallenge('market-sentiment/v1');
    console.log(`402  invoice ${challenge.accepts[0].extra.invoiceId}  price ${PRICE_RLUSD} RLUSD`);
    // The challenge goes in the header per the spec AND in the body, because
    // some clients read only one of the two.
    return send(res, 402, challenge, { 'PAYMENT-REQUIRED': b64(challenge) });
  }

  // Payment presented: verify, then release.
  let payload;
  try {
    payload = unb64(header);
  } catch {
    return send(res, 400, { error: 'PAYMENT-SIGNATURE is not base64 JSON' });
  }

  const result = await verifyPayload(payload).catch((error) => ({ ok: false, reason: 'verify_failed', detail: error.message }));
  if (!result.ok) {
    console.log(`402  refused: ${result.reason}${result.detail ? ' — ' + result.detail : ''}`);
    const challenge = buildChallenge('market-sentiment/v1');
    return send(res, 402, { ...challenge, error: result.reason, detail: result.detail }, { 'PAYMENT-REQUIRED': b64(challenge) });
  }

  // Accepted. Burn the invoice and advance the watermark before releasing.
  invoices.get(result.detail.invoiceId).used = true;
  watermark.set(payload.payload.voucher.channelId, result.detail.cumulativeAmount);
  collected.push({
    invoiceId: result.detail.invoiceId,
    channelId: payload.payload.voucher.channelId,
    cumulativeAmount: result.detail.cumulativeAmount.toString(),
    signature: payload.payload.signature,
    acceptedAt: new Date().toISOString(),
  });

  console.log(`200  released to ${result.detail.signer} — running total now ${ethers.formatUnits(result.detail.cumulativeAmount, 18)} RLUSD`);

  return send(res, 200, theResource(result.detail), {
    'PAYMENT-RESPONSE': b64({
      success: true,
      scheme: SCHEME,
      network: `eip155:${config.network.chainId}`,
      payer: result.detail.signer,
      channelId: payload.payload.voucher.channelId,
      cumulativeAmount: result.detail.cumulativeAmount.toString(),
      // No transaction hash: nothing was written on chain. The voucher is
      // redeemed later, and that is when a hash exists.
      settlement: 'deferred',
    }),
  });
});

loadConfig()
  .then(() => {
    if (!process.env.MERCHANT_ADDRESS) {
      console.log('MERCHANT_ADDRESS is not set, so the payout check is skipped.');
    }
    server.listen(PORT, () => {
      console.log(`x402 merchant on http://localhost:${PORT}/resource`);
      console.log(`scheme ${SCHEME}  network eip155:${config.network.chainId}  price ${PRICE_RLUSD} RLUSD`);
      console.log(`payment ledger ${ledger.target}`);
    });
  })
  .catch((error) => { console.error('startup failed:', error.message); process.exit(1); });

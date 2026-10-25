// x402 Merchant: serves one paywalled resource over HTTP 402.
// Run this in its own terminal, then run x402-agent.mjs.
import * as fs from 'node:fs';
import { ethers } from 'ethers';
import { loadX402Context, createX402Merchant } from './ap4m-x402.mjs';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  const k = line.slice(0, i).trim();
  // The shell wins, so one run can be configured without editing a shared .env.
  if (v && process.env[k] === undefined) process.env[k] = v;
}

const PORT = Number(process.env.MERCHANT_PORT ?? 8402);
const RESOURCE_URL = `http://127.0.0.1:${PORT}/resource`;
const PRICE_RLUSD = process.env.RESOURCE_PRICE_RLUSD ?? '0.05';

const context = await loadX402Context(process.env.AP4M_API_URL);
const provider = new ethers.JsonRpcProvider(context.network.replace('eip155:', '') === '1449000'
  ? 'https://rpc.testnet.xrplevm.org'
  : (() => { throw new Error('unexpected network ' + context.network); })());

// The thing being sold. A machine pays for it because it cannot produce it itself:
// it is measured, time-stamped and only the merchant holds it.
const content = {
  dataset: 'ai-visibility-snapshot',
  measuredAt: new Date().toISOString(),
  methodology: 'assistant citation sampling, 7 surfaces, n=120 prompts per surface',
  brand: 'example-roofing-co',
  // Canonical JSON admits only safe integers, so rates are percent and
  // positions are tenths. The units are in the key names on purpose.
  surfaces: {
    chatgpt: { citationRatePercent: 18, meanPositionTenths: 34 },
    perplexity: { citationRatePercent: 31, meanPositionTenths: 21 },
    claude: { citationRatePercent: 12, meanPositionTenths: 40 },
    googleAiOverviews: { citationRatePercent: 27, meanPositionTenths: 28 },
  },
  compositeScore: 61,
  licence: 'single-use, per-query, no redistribution',
};

// The Merchant sends the redemption transaction itself, so this wallet pays the gas.
// It is the Merchant's own key, never the Agent's — the Agent only ever signs vouchers.
const submitter = new ethers.Wallet(process.env.MERCHANT_SUBMITTER_KEY ?? process.env.MERCHANT_PRIVATE_KEY, provider);

const { server, close } = createX402Merchant({
  context,
  provider,
  submitter,
  merchantParticipantId: process.env.MERCHANT_PARTICIPANT_ID,
  payout: process.env.MERCHANT_PAYOUT_ADDRESS,
  amount: ethers.parseUnits(PRICE_RLUSD, 18).toString(),
  content,
  resourceUrl: RESOURCE_URL,
  stateDirectory: process.env.MERCHANT_STATE_DIR ?? './.x402-merchant-state',
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('x402 Merchant listening');
  console.log('  resource :', RESOURCE_URL);
  console.log('  price    :', PRICE_RLUSD, 'RLUSD');
  console.log('  merchant :', process.env.MERCHANT_PARTICIPANT_ID);
  console.log('  payout   :', process.env.MERCHANT_PAYOUT_ADDRESS);
  console.log('  submitter:', submitter.address, '(pays gas for redemptions)');
  console.log('');
  console.log('Unpaid GET /resource returns HTTP 402. Waiting...');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { console.log('\nclosing merchant...'); await close(); process.exit(0); });
}

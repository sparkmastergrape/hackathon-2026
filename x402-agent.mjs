// x402 Agent: needs data it cannot produce, hits a paywall, decides to pay, pays.
//
//   node x402-agent.mjs
//
// No human approves the payment. The agent is given a budget ceiling and a task;
// everything between the 402 and the unlocked resource is its own decision.
import * as fs from 'node:fs';
import { ethers } from 'ethers';
import { loadX402Context, buyResource } from './ap4m-x402.mjs';
import { decodeX402PaymentRequired } from '@ap4m/sdk';
import sdk from './ap4m-hackathon-sdk.cjs';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  const k = line.slice(0, i).trim();
  // The shell wins, so one run can be configured without editing a shared .env.
  if (v && process.env[k] === undefined) process.env[k] = v;
}

const API = process.env.AP4M_API_URL;
const RESOURCE = `http://127.0.0.1:${process.env.MERCHANT_PORT ?? 8402}/resource`;
// The agent's standing mandate: it may spend up to this much per purchase.
const CEILING_RLUSD = process.env.AGENT_CEILING_RLUSD ?? '0.10';
const OPERATION = process.argv[2] ?? `visibility-${Date.now().toString(36)}`;

const log = (step, msg) => console.log(`[${step}] ${msg}`);

const context = await loadX402Context(API);
const provider = new ethers.JsonRpcProvider('https://rpc.testnet.xrplevm.org');
const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);

console.log('Agent task: report this brand\'s AI visibility. Needs a measured snapshot.');
console.log(`Agent wallet: ${wallet.address}`);
console.log(`Spending ceiling: ${CEILING_RLUSD} RLUSD per purchase (no human approval below this)\n`);

// ── 1. Authenticate as itself ────────────────────────────────────────────────
log(1, 'signing in...');
const session = await sdk.signIn(API, process.env.TEAM_NAME, wallet);
log(1, 'signed in');

// ── 2. Open a channel to pay through ─────────────────────────────────────────
const open = (await sdk.listChannels(API, session.token)).find((c) => c.channel_status === 'open');
let channelId;
if (open) {
  channelId = open.channel_id;
  log(2, `reusing open channel ${channelId.slice(0, 18)}...`);
} else {
  log(2, 'no open channel — requesting one (on-chain, costs gas)...');
  const channel = await sdk.requestChannel(API, session.token, wallet, { capRlusd: '1' });
  channelId = channel.channel_id;
  log(2, `channel open ${channelId.slice(0, 18)}...`);
}

// ── 3. Ask for the resource without paying — this is the 402 ─────────────────
log(3, `GET ${RESOURCE} with no payment attached`);
const probe = await fetch(RESOURCE, { headers: { 'X-AP4M-CHANNEL-ID': channelId } });
log(3, `merchant replied HTTP ${probe.status}${probe.status === 402 ? '  <-- payment required' : ''}`);
const ceiling = ethers.parseUnits(CEILING_RLUSD, 18);
if (probe.status === 402) {
  // Decode the challenge and compare the actual number. A log line that says a
  // decision was made is not a decision; this reads the price the merchant asked.
  const header = probe.headers.get('payment-required');
  if (!header) { log(3, 'no PAYMENT-REQUIRED header to read a price from, refusing'); process.exit(1); }
  const required = decodeX402PaymentRequired(header);
  if (required.accepts.length !== 1) { log(3, `expected one price, got ${required.accepts.length}, refusing`); process.exit(1); }
  const price = BigInt(required.accepts[0].amount);
  log(3, `merchant asks ${ethers.formatUnits(price, 18)} RLUSD; ceiling is ${CEILING_RLUSD} RLUSD`);
  if (price > ceiling) {
    log(3, `agent decides: ${ethers.formatUnits(price, 18)} > ${CEILING_RLUSD} -> REFUSE`);
    console.log('\nNo voucher was signed and no payment was sent.');
    console.log('The ceiling is the agent\'s whole mandate, and this price is outside it.');
    process.exit(3); // 3 = declined on price. Distinct from 0 (bought) and 1 (broke).
  }
  log(3, `agent decides: ${ethers.formatUnits(price, 18)} <= ${CEILING_RLUSD} -> pay`);
} else {
  log(3, `unexpected: ${(await probe.text()).slice(0, 200)}`);
}

// ── 4. Pay the 402 and take the resource ─────────────────────────────────────
log(4, `paying up to ${CEILING_RLUSD} RLUSD, operation "${OPERATION}"`);
const result = await buyResource({
  context,
  provider,
  wallet,
  stateDirectory: process.env.AGENT_STATE_DIR ?? './.x402-agent-state',
  resourceUrl: RESOURCE,
  channelId,
  maximumAmount: ethers.parseUnits(CEILING_RLUSD, 18).toString(),
  operation: OPERATION,
});
log(4, `paid. redemption ${result.redemption}`);
log(4, `tx       ${result.transactionHash}`);
log(4, `claim    ${result.claimId}`);

// ── 5. Use what it bought ────────────────────────────────────────────────────
const data = result.resource;
console.log('\n--- resource unlocked ---');
console.log(`dataset   : ${data.dataset}`);
console.log(`measured  : ${data.measuredAt}`);
console.log(`composite : ${data.compositeScore}/100`);
for (const [surface, m] of Object.entries(data.surfaces)) {
  console.log(`  ${surface.padEnd(20)} cited ${m.citationRatePercent}% of prompts, mean position ${(m.meanPositionTenths / 10).toFixed(1)}`);
}

const weakest = Object.entries(data.surfaces).sort((a, b) => a[1].citationRatePercent - b[1].citationRatePercent)[0];
console.log(`\nAgent conclusion: weakest surface is ${weakest[0]} at ${weakest[1].citationRatePercent}% citation rate.`);
console.log('The agent could not have written that line without buying the data.');

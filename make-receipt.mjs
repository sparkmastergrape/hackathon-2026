/**
 * AP4M Hackathon — run one payment end to end and publish a verifiable receipt.
 *
 * Opens a Channel, redeems a Voucher on-chain, reports it, settles, then closes the Channel.
 * Prints the receipt URL, which verify-receipt.mjs checks independently.
 *
 * Usage:
 *   node --env-file=../../../.env make-receipt.mjs
 *
 * Reads AGENT_PRIVATE_KEY, TEAM_NAME, AP4M_API_URL, CHANNEL_CAP, PAYMENT_RLUSD from the
 * environment. Spends gas from the agent wallet and PAYMENT_RLUSD from the team allocation.
 */

import { ethers } from 'ethers';
import sdk from './ap4m-hackathon-sdk.cjs';

const { signIn, requestChannel, getChannelState, redeemVoucher, settle, closeChannel } = sdk;

const API = (process.env.AP4M_API_URL || 'https://hackathon.ap4m.build').replace(/\/+$/, '');
const TEAM_NAME = process.env.TEAM_NAME;
const CHANNEL_CAP = rlusdAmount('CHANNEL_CAP', process.env.CHANNEL_CAP, '5');
const PAYMENT_RLUSD = rlusdAmount('PAYMENT_RLUSD', process.env.PAYMENT_RLUSD, '0.01');

if (!process.env.AGENT_PRIVATE_KEY) throw new Error('AGENT_PRIVATE_KEY is not set');
if (!TEAM_NAME) throw new Error('TEAM_NAME is not set');

/**
 * A bare decimal number of RLUSD.
 *
 * Both values are printed next to the word RLUSD and then used as amounts:
 * CHANNEL_CAP goes to requestChannel as `capRlusd`, and PAYMENT_RLUSD goes to
 * ethers.parseUnits. Set either to "5 RLUSD" and the log reads
 * "5 RLUSD RLUSD", which is the harmless half — the value is then sent on as
 * a cap, or handed to parseUnits, which fails with a message about the ethers
 * internals rather than about the variable. So it is refused here instead.
 */
function rlusdAmount(name, raw, fallback) {
  const value = String(raw ?? '').trim() || fallback;
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(
      `${name} must be a bare decimal number of RLUSD, not ${JSON.stringify(value)}. ` +
      'Write 5, not "5 RLUSD".');
  }
  return value;
}

const config = await (await fetch(`${API}/public/config`)).json();
const RPC_URL = process.env.RPC_URL || config.network.rpcUrl;
const ledgerAddress = config.contracts.paymentLedger;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const agentWallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);

console.log('agent  :', agentWallet.address);
console.log('gas    :', ethers.formatEther(await provider.getBalance(agentWallet.address)), config.network.gasToken);
console.log('ledger :', ledgerAddress);
console.log('paying :', PAYMENT_RLUSD, 'RLUSD, channel cap', CHANNEL_CAP);

// The service is reachable over a flaky link; a dropped response does not mean the server
// did no work, so the service calls after the on-chain payment are retried rather than
// left to orphan a redeemed Voucher.
async function retry(label, fn, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const transient = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/i
        .test(error.message + (error.cause?.code ?? ''));
      if (!transient || attempt === tries) throw error;
      console.log(`    ${label} attempt ${attempt} failed (${error.cause?.code ?? error.message}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, 4000 * attempt));
    }
  }
}

// ── Step 1: sign in ──────────────────────────────────────────────────────────
console.log('\n[1] Signing in...');
const { token } = await signIn(API, TEAM_NAME, agentWallet);
console.log('    signed in');

// ── Step 2: open a Channel ───────────────────────────────────────────────────
console.log(`\n[2] Requesting a Channel with a ${CHANNEL_CAP} RLUSD limit...`);
const channel = await requestChannel(API, token, agentWallet, { capRlusd: CHANNEL_CAP });
const channelId = channel.channel_id;
console.log('    open:', channelId);

// ── Step 3: redeem a Voucher on-chain ────────────────────────────────────────
console.log('\n[3] Reading channel state and submitting payment...');
const state = await getChannelState(provider, ledgerAddress, channelId);
console.log('    cap     ', ethers.formatUnits(state.cap, 18), 'RLUSD');
console.log('    redeemed', ethers.formatUnits(state.redeemed, 18), 'RLUSD');

// cumulativeAmount is the running total for the Channel, not just this payment.
const cumulativeAmount = state.redeemed + ethers.parseUnits(PAYMENT_RLUSD, 18);
const { claimId, txHash } = await redeemVoucher(
  agentWallet, ledgerAddress, RPC_URL, channelId, cumulativeAmount,
);
console.log('    tx      ', txHash);
console.log('    claim   ', claimId);

// ── Step 4: report the payment ───────────────────────────────────────────────
console.log('\n[4] Reporting payment to the service...');
const recordResp = await retry('record-redemption', () => fetch(`${API}/public/participant/record-redemption`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ tx_hash: txHash }),
}));
const recordData = await recordResp.json();
if (!recordResp.ok) throw new Error(`record-redemption failed (${recordResp.status}): ${recordData.error}`);
console.log('    claim   ', recordData.claim_id);

// ── Step 5: settle ───────────────────────────────────────────────────────────
console.log('\n[5] Settling...');
const settled = await retry('settle', () => settle(API, token, channelId));
console.log('    settlement tx', settled.settlement_tx);
console.log('    payout tx    ', settled.payout_tx);
console.log('    amount       ', settled.amount_rlusd, 'RLUSD ->', settled.recipient);

// ── Step 6: close the Channel ────────────────────────────────────────────────
console.log('\n[6] Closing channel...');
const closed = await retry('close-channel', () => closeChannel(API, token, agentWallet, channelId));
console.log('    closed tx', closed.tx_hash);

// ── Receipt ──────────────────────────────────────────────────────────────────
const receiptUrl = settled.receipt_url
  ? (settled.receipt_url.startsWith('http') ? settled.receipt_url : API + settled.receipt_url)
  : null;

console.log('\n--- receipt ---');
console.log(JSON.stringify({
  claimId: settled.claim_id ?? recordData.claim_id,
  channelId,
  receiptUrl,
  receipts: settled.receipts ?? [],
}, null, 2));

if (receiptUrl) {
  console.log(`\nVerify it independently:\n  node verify-receipt.mjs "${receiptUrl}"`);
} else {
  console.log('\nNo receipt URL yet. Look it up with:');
  console.log(`  curl -s ${API}/public/evidence/claims/${settled.claim_id ?? recordData.claim_id}`);
}

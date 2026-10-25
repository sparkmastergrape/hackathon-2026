import { ethers } from 'ethers';
import sdk from './ap4m-hackathon-sdk.cjs';
const { signIn, settle, closeChannel, listChannels } = sdk;

const API = (process.env.AP4M_API_URL || 'https://hackathon.ap4m.build').replace(/\/+$/, '');
const CH = process.argv[2];
const provider = new ethers.JsonRpcProvider((await (await fetch(`${API}/public/config`)).json()).network.rpcUrl);
const agent = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);

const s = await signIn(API, process.env.TEAM_NAME, agent);
console.log('payment state:', JSON.stringify(s.paymentState, null, 2));
console.log('channels:');
for (const c of await listChannels(API, s.token)) console.log('  ', c.channel_id, c.channel_status);

async function retry(label, fn, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      const transient = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(e.message + (e.cause?.code ?? ''));
      console.log(`  ${label} attempt ${i} failed: ${e.message}${transient ? ' (transient, retrying)' : ''}`);
      if (!transient || i === tries) throw e;
      await new Promise(r => setTimeout(r, 4000 * i));
    }
  }
}

console.log('\n[5] Settling...');
const settled = await retry('settle', () => settle(API, s.token, CH));
console.log('    settlement tx', settled.settlement_tx);
console.log('    payout tx    ', settled.payout_tx);
console.log('    amount       ', settled.amount_rlusd, '->', settled.recipient);
console.log('    claim        ', settled.claim_id);

console.log('\n[6] Closing channel...');
try {
  const closed = await retry('close', () => closeChannel(API, s.token, agent, CH));
  console.log('    closed tx', closed.tx_hash);
} catch (e) { console.log('    close failed (channel can be closed later):', e.message); }

const url = settled.receipt_url
  ? (settled.receipt_url.startsWith('http') ? settled.receipt_url : API + settled.receipt_url) : null;
console.log('\nreceipt URL:', url);
console.log('receipts   :', JSON.stringify(settled.receipts ?? [], null, 2));

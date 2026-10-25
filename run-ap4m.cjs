// Runner for the AP4M hackathon agent.
// Loads .env, checks preconditions, then runs the vendor script.
// CHANNEL_ONLY=1 stops after the channel is open (no payment, no settle, no close).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  if (v) process.env[k] = v;
}

const { ethers } = require('ethers');

async function preflight() {
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) throw new Error('AGENT_PRIVATE_KEY is empty in .env — paste the agent wallet key first.');

  const addr = new ethers.Wallet(key).address;
  const expected = process.env.AP4M_AGENT_ADDRESS;
  if (expected && addr.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`AGENT_PRIVATE_KEY derives ${addr} but AP4M has ${expected} registered. Vouchers would be rejected.`);
  }

  const cfg = await (await fetch(`${process.env.AP4M_API_URL}/public/config`)).json();
  const provider = new ethers.JsonRpcProvider(cfg.network.rpcUrl);
  const gas = await provider.getBalance(addr);
  console.log('agent wallet   :', addr, expected ? '(matches portal ✓)' : '');
  console.log('gas balance    :', ethers.formatEther(gas), 'XRP');
  console.log('payment ledger :', cfg.contracts.paymentLedger);
  console.log('vault balance  :', cfg.vaultBalance, 'RLUSD');
  if (gas === 0n) {
    throw new Error(`agent wallet has no gas — fund ${addr} at ${cfg.network.faucetUrl}`);
  }
  console.log('');
}

preflight()
  .then(() => require('./ap4m-agent.cjs').main())
  .catch((e) => { console.error('PREFLIGHT FAILED:', e.message); process.exit(1); });

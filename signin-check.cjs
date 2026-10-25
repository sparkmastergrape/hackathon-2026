// Step 1 only: sign in to AP4M. No gas, no on-chain tx, no funds move.
// Proves TEAM_NAME, the agent key and the bearer-token flow all work.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  if (v) process.env[line.slice(0, i).trim()] = v;
}
const { ethers } = require('ethers');

(async () => {
  const api = process.env.AP4M_API_URL;
  const team = process.env.TEAM_NAME;
  const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY);
  console.log('team name   :', JSON.stringify(team));
  console.log('agent wallet:', wallet.address);

  const cr = await fetch(`${api}/public/participant/challenge`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamName: team, wallet: wallet.address }),
  });
  const challenge = await cr.json();
  if (!cr.ok) { console.error(`challenge failed (${cr.status}):`, challenge.error ?? challenge); process.exit(1); }
  console.log('challenge   : received ✓');

  const sig = await wallet.signMessage(challenge.message);
  const sr = await fetch(`${api}/public/participant/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: challenge.challengeId, signature: sig }),
  });
  const session = await sr.json();
  if (!sr.ok) { console.error(`session failed (${sr.status}):`, session.error ?? session); process.exit(1); }
  console.log('sign-in     : OK ✓  token length', session.token.length);
  console.log('channel     :', session.paymentState?.channel_status ?? '(none yet)');

  const ch = await fetch(`${api}/public/participant/channels`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const chd = await ch.json();
  console.log('channels    :', ch.ok ? (chd.channels?.length || 0) : `error ${ch.status}`);
  if (chd.channels?.length) for (const c of chd.channels) console.log('   ', c.channel_id, c.channel_status, 'cap', c.cap_wei, 'payout', c.payout);

  const m = await fetch(`${api}/public/merchants`);
  const md = await m.json();
  console.log('merchants   :', m.ok ? JSON.stringify(md.merchants) : `error ${m.status}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

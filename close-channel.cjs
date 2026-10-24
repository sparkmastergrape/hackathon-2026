// Close an open AP4M channel. Usage: node --env-file=.env close-channel.cjs <channelId>
'use strict';
const { ethers } = require('ethers');
const { signIn, closeChannel, listChannels } = require('./ap4m-agent.cjs');

const API = process.env.AP4M_API_URL || 'https://hackathon.ap4m.build';

(async () => {
  const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY);
  const { token } = await signIn(API, process.env.TEAM_NAME, wallet);
  const channels = await listChannels(API, token);
  for (const c of channels) console.log(`  ${c.channel_id}  ${c.channel_status}`);
  const channelId = process.argv[2] || channels.find((c) => c.channel_status === 'open')?.channel_id;
  if (!channelId) { console.log('No open channel to close.'); return; }
  console.log('Closing', channelId);
  const closed = await closeChannel(API, token, wallet, channelId);
  console.log('Channel closed. TX:', closed.tx_hash);
  console.log('Final cumulative amount:', closed.final_cumulative_amount);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

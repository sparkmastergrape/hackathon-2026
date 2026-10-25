/**
 * Close the loop on x402 payments: redeem the voucher the merchant already
 * holds, settle it, and close the channel.
 *
 * Usage:
 *   CHANNEL_ID=0x... node --env-file=.env x402-redeem.cjs
 *   X402_MERCHANT_URL=http://localhost:4022/resource ... x402-redeem.cjs
 *   KEEP_CHANNEL=1 ...   # redeem and settle, leave the channel open
 *
 * This submits the signature the merchant was given during the hot path. It
 * does not sign a new voucher. That is the point of a voucher: the agent
 * signed once, off-chain, and anyone holding that signature can present it.
 * Because the running total is cumulative, redeeming the highest voucher
 * settles every payment below it in one transaction.
 */

'use strict';

const { ethers } = require('ethers');
const { signIn, settle, closeChannel } = require('./ap4m-agent.cjs');

const API = process.env.AP4M_API_URL || 'https://hackathon.ap4m.build';
const MERCHANT_URL = process.env.X402_MERCHANT_URL || 'http://localhost:4021/resource';

const LEDGER_ABI = [
  'function redeemVoucher((bytes32 channelId, uint256 cumulativeAmount) voucher, bytes agentSignature) returns (bytes32 claimId, uint256 amount, bytes32 digest)',
  'function channels(bytes32) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)',
];

async function main() {
  const channelId = process.env.CHANNEL_ID;
  if (!channelId) throw new Error('set CHANNEL_ID to the channel the payments were made on');

  const config = await (await fetch(`${API}/public/config`)).json();
  const rpcUrl = process.env.AP4M_RPC_URL || config.network.rpcUrl;
  const ledgerAddress = process.env.PAYMENT_LEDGER || config.contracts.paymentLedger;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
  const ledger = new ethers.Contract(ledgerAddress, LEDGER_ABI, wallet);

  // ── The voucher the merchant holds ────────────────────────────────────────
  const vouchersUrl = new URL('/vouchers', MERCHANT_URL).toString();
  const held = await (await fetch(vouchersUrl)).json();
  const mine = (held.vouchers ?? []).filter((v) => v.channelId.toLowerCase() === channelId.toLowerCase());
  if (!mine.length) throw new Error(`the merchant at ${vouchersUrl} holds no voucher for this channel`);

  // Highest cumulative amount wins. It covers every payment beneath it.
  const voucher = mine.reduce((a, b) => (BigInt(b.cumulativeAmount) > BigInt(a.cumulativeAmount) ? b : a));
  const cumulativeAmount = BigInt(voucher.cumulativeAmount);
  console.log('merchant holds :', mine.length, 'voucher(s) for this channel');
  console.log('highest        :', ethers.formatUnits(cumulativeAmount, 18), 'RLUSD');

  // ── Check it before paying gas for it ────────────────────────────────────
  const state = await ledger.channels(channelId);
  const [cap, redeemed, agent, status] = [state[7], state[8], state[9], Number(state[11])];
  console.log('channel status :', status, status === 1 ? '(open)' : '');
  console.log('cap / redeemed :', ethers.formatUnits(cap, 18), '/', ethers.formatUnits(redeemed, 18), 'RLUSD');

  const signer = ethers.verifyTypedData(
    { name: 'AP4M Payment Ledger', version: '1', chainId: config.network.chainId, verifyingContract: ledgerAddress },
    { Voucher: [{ name: 'channelId', type: 'bytes32' }, { name: 'cumulativeAmount', type: 'uint256' }] },
    { channelId, cumulativeAmount },
    voucher.signature,
  );
  console.log('signature from :', signer, signer.toLowerCase() === agent.toLowerCase() ? '(the channel agent)' : '(NOT the agent)');
  if (signer.toLowerCase() !== agent.toLowerCase()) throw new Error('the held signature is not the channel agent\'s — refusing to submit');
  if (cumulativeAmount <= redeemed) throw new Error(`already redeemed to ${ethers.formatUnits(redeemed, 18)} RLUSD — nothing to do`);
  if (cumulativeAmount > cap) throw new Error('the voucher is over the cap and cannot be redeemed');

  // ── Redeem, with the merchant's signature and not a new one ─────────────
  console.log('\n[1] redeeming the held voucher...');
  const tx = await ledger.redeemVoucher({ channelId, cumulativeAmount }, voucher.signature);
  const receipt = await tx.wait();
  const topic = ethers.id('VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,address,address,uint256,uint256,uint256)');
  const log = receipt.logs.find((l) => l.address.toLowerCase() === ledgerAddress.toLowerCase() && l.topics[0] === topic);
  const claimId = log ? log.topics[2] : null;
  console.log('    tx       :', receipt.hash);
  console.log('    claim    :', claimId);

  const { token } = await signIn(API, process.env.TEAM_NAME, wallet);

  console.log('\n[2] reporting the redemption...');
  const recordResp = await fetch(`${API}/public/participant/record-redemption`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tx_hash: receipt.hash }),
  });
  const record = await recordResp.json();
  if (!recordResp.ok) throw new Error(`record-redemption failed (${recordResp.status}): ${record.error}`);
  console.log('    claim    :', record.claim_id);

  console.log('\n[3] settling...');
  const settled = await settle(API, token, channelId);
  console.log('    settlement tx :', settled.settlement_tx);
  console.log('    payout tx     :', settled.payout_tx);
  console.log('    amount        :', settled.amount_rlusd, 'RLUSD to', settled.recipient);
  if (settled.receipt_url) console.log('    receipt       :', API + settled.receipt_url);

  if (process.env.KEEP_CHANNEL) {
    console.log('\n[4] KEEP_CHANNEL is set, leaving the channel open.');
    return;
  }

  console.log('\n[4] closing the channel...');
  const closed = await closeChannel(API, token, wallet, channelId);
  console.log('    tx       :', closed.tx_hash);
  console.log('    final    :', closed.final_cumulative_amount);
}

main().catch((error) => { console.error('\nFAILED:', error.message); process.exit(1); });

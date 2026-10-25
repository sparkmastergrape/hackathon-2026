/**
 * Prove the x402 merchant refuses a bad voucher. Four deliberately invalid
 * payments, each one a thing a hostile or buggy client would try.
 *
 * Usage:
 *   CHANNEL_ID=0x... node --env-file=.env x402-refusals.cjs
 *
 * Every case must come back 402 with a named reason. A 200 here is a failure
 * of the merchant, not of the test. Nothing is written on chain.
 */

'use strict';

const { ethers } = require('ethers');
const { signVoucher } = require('./ap4m-agent.cjs');

const API = process.env.AP4M_API_URL || 'https://hackathon.ap4m.build';
const MERCHANT_URL = process.env.X402_MERCHANT_URL || 'http://localhost:4021/resource';
const SCHEME = 'ap4m-voucher';

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

async function quote() {
  const resp = await fetch(MERCHANT_URL);
  const body = await resp.json();
  return body.accepts.find((entry) => entry.scheme === SCHEME);
}

async function present(requirement, voucher, signature) {
  const resp = await fetch(MERCHANT_URL, {
    headers: {
      'PAYMENT-SIGNATURE': b64({ x402Version: 2, accepted: requirement, payload: { voucher, signature } }),
    },
  });
  const body = await resp.json();
  return { status: resp.status, reason: body.error, detail: body.detail };
}

function report(name, expectedReason, result) {
  const pass = result.status === 402 && result.reason === expectedReason;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`      got ${result.status} ${result.reason ?? '(no reason)'}${result.detail ? ' — ' + result.detail : ''}`);
  if (!pass) console.log(`      wanted 402 ${expectedReason}`);
  return pass;
}

async function main() {
  const channelId = process.env.CHANNEL_ID;
  if (!channelId) throw new Error('set CHANNEL_ID to an open channel');

  const config = await (await fetch(`${API}/public/config`)).json();
  const ledgerAddress = process.env.PAYMENT_LEDGER || config.contracts.paymentLedger;
  const provider = new ethers.JsonRpcProvider(process.env.AP4M_RPC_URL || config.network.rpcUrl);
  const agent = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);

  const ledger = new ethers.Contract(ledgerAddress, [
    'function channels(bytes32) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)',
  ], provider);
  const state = await ledger.channels(channelId);
  const cap = state[7];
  const redeemed = state[8];

  console.log('channel :', channelId);
  console.log('cap     :', ethers.formatUnits(cap, 18), 'RLUSD');
  console.log('redeemed:', ethers.formatUnits(redeemed, 18), 'RLUSD');
  console.log('');

  const results = [];

  // 1. A voucher signed by a wallet that is not the channel's agent.
  {
    const stranger = ethers.Wallet.createRandom().connect(provider);
    const requirement = await quote();
    const amount = redeemed + BigInt(requirement.amount);
    const signature = await signVoucher(stranger, ledgerAddress, channelId, amount);
    results.push(report('a stranger signs the voucher', 'signer_is_not_the_channel_agent',
      await present(requirement, { channelId, cumulativeAmount: amount.toString() }, signature)));
  }

  // 2. The amount is raised after signing. The signature then recovers to
  //    some other address, so this lands as a signer failure, not a mismatch.
  {
    const requirement = await quote();
    const honest = redeemed + BigInt(requirement.amount);
    const signature = await signVoucher(agent, ledgerAddress, channelId, honest);
    const inflated = honest * 10n;
    results.push(report('the amount is edited after signing', 'signer_is_not_the_channel_agent',
      await present(requirement, { channelId, cumulativeAmount: inflated.toString() }, signature)));
  }

  // 3. A voucher past the channel cap, properly signed by the real agent.
  {
    const requirement = await quote();
    const overCap = cap + BigInt(requirement.amount);
    const signature = await signVoucher(agent, ledgerAddress, channelId, overCap);
    results.push(report('a correctly signed voucher over the cap', 'over_cap',
      await present(requirement, { channelId, cumulativeAmount: overCap.toString() }, signature)));
  }

  // 4. One invoice, used twice. The second presentation must fail.
  {
    const requirement = await quote();
    const amount = redeemed + BigInt(requirement.amount);
    const signature = await signVoucher(agent, ledgerAddress, channelId, amount);
    const voucher = { channelId, cumulativeAmount: amount.toString() };
    const first = await present(requirement, voucher, signature);
    if (first.status !== 200) {
      console.log(`SKIP  invoice replay — the first presentation was refused (${first.reason})`);
      console.log('      the channel may already be spent to its cap');
    } else {
      results.push(report('the same invoice is presented twice', 'invoice_already_used',
        await present(requirement, voucher, signature)));
    }
  }

  const passed = results.filter(Boolean).length;
  console.log('');
  console.log(`${passed} of ${results.length} refusals behaved correctly`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => { console.error('FAILED:', error.message); process.exit(1); });

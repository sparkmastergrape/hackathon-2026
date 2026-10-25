/**
 * AP4M x402 agent — the paying side of the hot path.
 *
 * Asks the merchant for a resource, gets HTTP 402 with requirements, signs an
 * EIP-712 voucher off-chain with signVoucher, and retries with the voucher in
 * a PAYMENT-SIGNATURE header. Nothing is written on chain during a payment.
 *
 * Usage:
 *   node --env-file=.env x402-agent.cjs                 # one payment
 *   X402_PAYMENTS=3 node --env-file=.env x402-agent.cjs # three, one channel
 *
 * Set CHANNEL_ID to reuse an open channel. Leave it empty and the agent signs
 * in and opens one with a CHANNEL_CAP limit, which costs gas.
 *
 * The 402 challenge is treated as hostile input. A merchant that answers 402
 * is choosing fields of a transaction this agent will sign, so the agent pins
 * the scheme and the network, rebuilds the EIP-712 domain from its own
 * configuration, and caps what it will pay. It never signs a domain the
 * merchant supplied.
 */

'use strict';

const { ethers } = require('ethers');
const { signIn, requestChannel, signVoucher, getChannelState } = require('./ap4m-agent.cjs');

const API = process.env.AP4M_API_URL || 'https://hackathon.ap4m.build';
const MERCHANT_URL = process.env.X402_MERCHANT_URL || 'http://localhost:4021/resource';
const PAYMENTS = Number(process.env.X402_PAYMENTS || 1);
const MAX_PAYMENT_RLUSD = process.env.X402_MAX_PAYMENT_RLUSD || '0.05';

const SCHEME = 'ap4m-voucher';

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
const unb64 = (text) => JSON.parse(Buffer.from(text, 'base64').toString('utf8'));

/**
 * Check a requirement from the 402 before signing anything against it.
 * Throws rather than returning, because every one of these is a refusal.
 */
function vetRequirement(requirement, expected) {
  if (requirement.scheme !== SCHEME) throw new Error(`refusing scheme ${requirement.scheme}`);
  if (requirement.network !== expected.network) throw new Error(`refusing network ${requirement.network}, this agent is on ${expected.network}`);
  if (!requirement.extra?.invoiceId) throw new Error('requirement carries no invoiceId');

  const amount = BigInt(requirement.amount);
  if (amount <= 0n) throw new Error(`refusing amount ${requirement.amount}`);
  const ceiling = ethers.parseUnits(MAX_PAYMENT_RLUSD, 18);
  if (amount > ceiling) {
    throw new Error(`price ${ethers.formatUnits(amount, 18)} RLUSD is over this agent's ${MAX_PAYMENT_RLUSD} RLUSD limit`);
  }

  // The merchant may state a verifying contract. It is checked, never adopted.
  const stated = requirement.extra?.verifyingContract;
  if (stated && stated.toLowerCase() !== expected.verifyingContract.toLowerCase()) {
    throw new Error(`merchant names ledger ${stated}, this agent trusts ${expected.verifyingContract}`);
  }
  if (requirement.asset && expected.asset && requirement.asset.toLowerCase() !== expected.asset.toLowerCase()) {
    throw new Error(`merchant wants asset ${requirement.asset}, this agent holds ${expected.asset}`);
  }
  return amount;
}

async function main() {
  const configResp = await fetch(`${API}/public/config`);
  const config = await configResp.json();
  if (!configResp.ok) throw new Error(`could not read service config: ${config.error}`);

  const rpcUrl = process.env.AP4M_RPC_URL || config.network.rpcUrl;
  const ledgerAddress = process.env.PAYMENT_LEDGER || config.contracts.paymentLedger;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);

  // What this agent will accept, built from its own configuration only.
  const expected = {
    network: `eip155:${config.network.chainId}`,
    verifyingContract: ledgerAddress,
    asset: config.contracts.rlusdToken,
  };

  console.log('agent wallet :', wallet.address);
  console.log('merchant     :', MERCHANT_URL);
  console.log('will accept  :', expected.network, '| ledger', expected.verifyingContract);
  console.log('payment limit:', MAX_PAYMENT_RLUSD, 'RLUSD per call');

  // A channel to pay from.
  let channelId = process.env.CHANNEL_ID;
  if (!channelId) {
    console.log(`\nopening a channel with a ${process.env.CHANNEL_CAP || '5'} RLUSD limit...`);
    const { token } = await signIn(API, process.env.TEAM_NAME, wallet);
    const channel = await requestChannel(API, token, wallet, { capRlusd: process.env.CHANNEL_CAP || '5' });
    channelId = channel.channel_id;
    console.log('channel open :', channelId);
  } else {
    console.log('channel      :', channelId, '(reused)');
  }

  const state = await getChannelState(provider, ledgerAddress, channelId);
  console.log('cap          :', ethers.formatUnits(state.cap, 18), 'RLUSD');
  console.log('redeemed     :', ethers.formatUnits(state.redeemed, 18), 'RLUSD');

  // The running total the agent believes it is at. The voucher is cumulative,
  // so this advances by the price on every accepted payment.
  let runningTotal = state.redeemed;

  for (let n = 1; n <= PAYMENTS; n++) {
    console.log(`\n── payment ${n} of ${PAYMENTS} ──────────────────────────────`);

    // 1. Ask with no payment.
    const challengeResp = await fetch(MERCHANT_URL);
    if (challengeResp.status !== 402) {
      throw new Error(`expected 402, got ${challengeResp.status}`);
    }
    const challenge = await challengeResp.json();
    console.log('[1] 402 received, accepts', challenge.accepts?.length ?? 0, 'requirement(s)');

    // 2. Vet it before signing.
    const requirement = (challenge.accepts ?? []).find((entry) => entry.scheme === SCHEME);
    if (!requirement) throw new Error(`merchant offers no ${SCHEME} requirement`);
    const price = vetRequirement(requirement, expected);
    console.log('[2] vetted  :', ethers.formatUnits(price, 18), 'RLUSD, invoice', requirement.extra.invoiceId);

    // 3. Sign the voucher. cumulativeAmount is the running total, not this payment.
    const cumulativeAmount = runningTotal + price;
    if (cumulativeAmount > state.cap) {
      throw new Error(`this payment would take the total to ${ethers.formatUnits(cumulativeAmount, 18)} RLUSD, over the ${ethers.formatUnits(state.cap, 18)} RLUSD cap`);
    }
    const signature = await signVoucher(wallet, ledgerAddress, channelId, cumulativeAmount);
    console.log('[3] signed  : running total', ethers.formatUnits(cumulativeAmount, 18), 'RLUSD');

    // 4. Retry with the voucher.
    const payload = {
      x402Version: 2,
      accepted: requirement,
      payload: { voucher: { channelId, cumulativeAmount: cumulativeAmount.toString() }, signature },
    };
    const paidResp = await fetch(MERCHANT_URL, { headers: { 'PAYMENT-SIGNATURE': b64(payload) } });
    const body = await paidResp.json();

    if (paidResp.status !== 200) {
      console.error(`[4] refused : ${paidResp.status} ${body.error ?? ''} ${body.detail ?? ''}`);
      throw new Error(`merchant refused the voucher: ${body.error ?? paidResp.status}`);
    }

    const receipt = paidResp.headers.get('payment-response');
    console.log('[4] 200     : resource released');
    console.log('    body    :', body.body);
    if (receipt) {
      const decoded = unb64(receipt);
      console.log('    receipt :', JSON.stringify(decoded));
    }

    runningTotal = cumulativeAmount;
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log('running total signed:', ethers.formatUnits(runningTotal, 18), 'RLUSD');
  console.log('nothing was written on chain. Redeem the latest voucher to move RLUSD:');
  console.log(`  CHANNEL_ID=${channelId} node --env-file=.env ap4m-agent.cjs`);
}

main().catch((error) => { console.error('\nFAILED:', error.message); process.exit(1); });

import { ethers } from 'ethers';
import sdk from './ap4m-hackathon-sdk.cjs';
const { signIn, listChannels, listMerchants } = sdk;

const API = (process.env.AP4M_API_URL || 'https://hackathon.ap4m.build').replace(/\/+$/, '');
const cfg = await (await fetch(`${API}/public/config`)).json();
const provider = new ethers.JsonRpcProvider(cfg.network.rpcUrl);

const agent = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
const merchant = new ethers.Wallet(process.env.MERCHANT_PRIVATE_KEY);

console.log('team             :', JSON.stringify(process.env.TEAM_NAME));
console.log('channel cap      :', process.env.CHANNEL_CAP, 'RLUSD');
console.log('payment amount   :', process.env.PAYMENT_RLUSD, 'RLUSD');
console.log('agent address    :', agent.address);
console.log('merchant address :', merchant.address);
console.log('agent matches AP4M_AGENT_ADDRESS:',
  process.env.AP4M_AGENT_ADDRESS?.toLowerCase() === agent.address.toLowerCase());
console.log('agent != merchant               :',
  agent.address.toLowerCase() !== merchant.address.toLowerCase());

const gas = await provider.getBalance(agent.address);
console.log('agent gas        :', ethers.formatEther(gas), cfg.network.gasToken);
if (gas === 0n) console.log('  !! NO GAS - fund at', cfg.network.faucetUrl);

const rlusd = new ethers.Contract(cfg.contracts.rlusdToken,
  ['function balanceOf(address) view returns (uint256)'], provider);
console.log('merchant RLUSD   :', ethers.formatUnits(await rlusd.balanceOf(merchant.address), 18));
console.log('vault balance    :', cfg.vaultBalance, 'RLUSD');

try {
  const s = await signIn(API, process.env.TEAM_NAME, agent);
  console.log('\nsign-in          : OK');
  console.log('payment state    :', JSON.stringify(s.paymentState ?? null));
  const ch = await listChannels(API, s.token);
  console.log('existing channels:', ch.length);
  for (const c of ch) {
    console.log('   ', c.channel_id, '|', c.channel_status, '| cap', c.cap_wei, '|', c.failure ?? '');
  }
  console.log('merchants        :', JSON.stringify(await listMerchants(API)));
} catch (e) {
  console.log('\nsign-in          : FAILED -', e.message);
}

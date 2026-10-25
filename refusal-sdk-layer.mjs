// Second half of the refusal case: bypass the agent's own price check and hand
// buyResource a maximumAmount below the merchant's price, to find out whether the
// layer that actually signs the voucher refuses on its own.
//
//   MERCHANT_PORT=8412 node refusal-sdk-layer.mjs
//
// The agent's pre-check and this check are different defences. The first is our
// code and can be removed by editing one file. This one cannot.
import * as fs from 'node:fs';
import { ethers } from 'ethers';
import { loadX402Context, buyResource } from './ap4m-x402.mjs';
import sdk from './ap4m-hackathon-sdk.cjs';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  const k = line.slice(0, i).trim();
  if (v && process.env[k] === undefined) process.env[k] = v;
}

const API = process.env.AP4M_API_URL;
const RESOURCE = `http://127.0.0.1:${process.env.MERCHANT_PORT ?? 8412}/resource`;
const MAXIMUM = process.env.MAXIMUM_RLUSD ?? '0.10';
const STATE = process.env.AGENT_STATE_DIR ?? './.refusal-sdk-state';

const context = await loadX402Context(API);
const provider = new ethers.JsonRpcProvider('https://rpc.testnet.xrplevm.org');
const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
const session = await sdk.signIn(API, process.env.TEAM_NAME, wallet);
const open = (await sdk.listChannels(API, session.token)).find((c) => c.channel_status === 'open');
if (!open) { console.error('no open channel'); process.exit(2); }

console.log(`resource      : ${RESOURCE}`);
console.log(`maximumAmount : ${MAXIMUM} RLUSD  (the merchant asks more than this)`);
console.log(`channel       : ${open.channel_id}`);
console.log('no pre-check this time — buyResource is called straight away\n');

try {
  const result = await buyResource({
    context,
    provider,
    wallet,
    stateDirectory: STATE,
    resourceUrl: RESOURCE,
    channelId: open.channel_id,
    maximumAmount: ethers.parseUnits(MAXIMUM, 18).toString(),
    operation: process.argv[2] ?? `sdk-refusal-${Date.now().toString(36)}`,
  });
  console.log('IT BOUGHT. The SDK did not enforce the maximum.');
  console.log(`  tx    ${result.transactionHash}`);
  console.log(`  claim ${result.claimId}`);
  process.exit(1);
} catch (error) {
  console.log(`buyResource threw: ${error.message}`);
  const retained = fs.existsSync(`${STATE}/purchase.json`);
  console.log(`retained purchase file: ${retained ? 'YES — a voucher was signed before the refusal' : 'none — nothing was signed'}`);
  console.log(`\nVERDICT: the SDK refused on its own${retained ? ', but it had already signed.' : ', before signing anything.'}`);
  process.exit(retained ? 1 : 3);
}

// Read-only: RLUSD + XRP gas balances for the agent and merchant wallets.
// Usage: node check-balances.mjs [address ...]
// Any extra addresses given on the command line are reported too.
// Reads .env from beside this script, so it works from any directory.
// Override with ENV_PATH=<file>; override the node with RPC_URL=<url>.
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, formatUnits, erc20Abi, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ENV_PATH = process.env.ENV_PATH ?? fileURLToPath(new URL('.env', import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(ENV_PATH, 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const RPC = process.env.RPC_URL ?? 'https://rpc.testnet.xrplevm.org';
const RLUSD = '0x27b57a9D0b8d24EB97259c4E2279e45255e016f3';
const chain = {
  id: 1449000, name: 'XRPL EVM Testnet',
  nativeCurrency: { name: 'XRP', symbol: 'XRP', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 60000, retryCount: 3 }) });

console.log('chainId        :', await client.getChainId(), '(expect 1449000)');
const [sym, dec] = await Promise.all([
  client.readContract({ address: RLUSD, abi: erc20Abi, functionName: 'symbol' }),
  client.readContract({ address: RLUSD, abi: erc20Abi, functionName: 'decimals' }),
]);
console.log('token          :', sym, '| decimals', dec, '|', RLUSD);
console.log('');

const agent = privateKeyToAccount(env.AGENT_PRIVATE_KEY);
const merchant = privateKeyToAccount(env.MERCHANT_PRIVATE_KEY);
const extra = process.argv.slice(2).map((a, i) => [`extra ${i + 1} `, getAddress(a)]);
const wallets = [['agent   ', agent.address], ['merchant', merchant.address], ...extra];

for (const [label, addr] of wallets) {
  const [bal, gas] = await Promise.all([
    client.readContract({ address: RLUSD, abi: erc20Abi, functionName: 'balanceOf', args: [addr] }),
    client.getBalance({ address: addr }),
  ]);
  console.log(`${label} ${addr}  RLUSD=${formatUnits(bal, dec)}  XRP=${formatUnits(gas, 18)}`);
}

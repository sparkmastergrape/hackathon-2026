// Round-trip check for the AP4M wallet set.
// Loads keys from .env, re-derives addresses, queries each chain.
// Prints addresses and balances only — never a key.
import * as fs from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, defineChain, formatEther } from 'viem';
import { Client, Wallet, dropsToXrp } from 'xrpl';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
  })
);

export const xrplEvmTestnet = defineChain({
  id: 1449000,
  name: 'XRPL EVM Testnet',
  nativeCurrency: { name: 'XRP', symbol: 'XRP', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.xrplevm.org'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.testnet.xrplevm.org' } },
  testnet: true,
});

const pub = createPublicClient({ chain: xrplEvmTestnet, transport: http() });
const [chainId, block] = await Promise.all([pub.getChainId(), pub.getBlockNumber()]);

console.log('=== XRPL EVM Testnet ===');
console.log('chain id       : ' + chainId + (chainId === 1449000 ? ' ✓' : ' ✗ MISMATCH'));
console.log('block          : ' + block);

let problems = 0;

async function reportEvm(label, keyName, expectedAddr, needsGas = false) {
  const key = env[keyName];
  console.log('');
  console.log('--- ' + label + ' (' + keyName + ') ---');
  if (!key) {
    console.log('status         : NOT SET ✗  — paste the key into .env');
    problems++;
    return;
  }
  const acct = privateKeyToAccount(key);
  const bal = await pub.getBalance({ address: acct.address });
  console.log('address        : ' + acct.address);
  console.log('gas balance    : ' + formatEther(bal) + ' XRP' + (needsGas && bal === 0n ? '  ← needs faucet.xrplevm.org' : (needsGas ? '' : '  (receives only — no gas needed)')));
  const sig = await acct.signMessage({ message: 'ap4m wallet check' });
  console.log('can sign       : ' + (sig.length === 132 ? 'yes ✓' : 'no ✗'));
  if (needsGas && bal === 0n) problems++;
  if (expectedAddr) {
    const ok = acct.address.toLowerCase() === expectedAddr.toLowerCase();
    console.log('matches portal : ' + (ok ? 'yes ✓' : 'NO ✗  portal says ' + expectedAddr));
    if (!ok) problems++;
  }
}

await reportEvm('Agent wallet (pays)', 'AGENT_PRIVATE_KEY', env.AP4M_AGENT_ADDRESS, true);
await reportEvm('Merchant payout wallet (receives)', 'MERCHANT_PRIVATE_KEY', null);

if (env.AGENT_PRIVATE_KEY && env.MERCHANT_PRIVATE_KEY) {
  const a = privateKeyToAccount(env.AGENT_PRIVATE_KEY).address.toLowerCase();
  const m = privateKeyToAccount(env.MERCHANT_PRIVATE_KEY).address.toLowerCase();
  console.log('');
  console.log('agent ≠ merchant : ' + (a !== m ? 'yes ✓' : 'NO ✗ AP4M requires different wallets'));
  if (a === m) problems++;
}

const w = Wallet.fromSeed(env.XRPL_SEED);
const client = new Client('wss://s.altnet.rippletest.net:51233');
await client.connect();
try {
  const info = await client.request({
    command: 'account_info', account: w.classicAddress, ledger_index: 'validated',
  });
  const lines = await client.request({
    command: 'account_lines', account: w.classicAddress, ledger_index: 'validated',
  });
  console.log('');
  console.log('=== XRPL Testnet (classic) ===');
  console.log('address        : ' + w.classicAddress);
  console.log('balance        : ' + dropsToXrp(info.result.account_data.Balance) + ' XRP');
  console.log('trust lines    : ' + (lines.result.lines.length || 'none'));
  for (const l of lines.result.lines) {
    console.log('   ' + l.currency.slice(0, 10) + '… / ' + l.account + ' bal=' + l.balance);
  }
} finally {
  await client.disconnect();
}

console.log('');
console.log(problems === 0 ? 'ALL CHECKS PASSED ✓' : problems + ' item(s) need attention ✗');
process.exit(problems === 0 ? 0 : 1);

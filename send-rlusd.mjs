// Proof-of-rail: send the merchant wallet's full RLUSD balance to sathya.
// Simulates first, refuses to send more than the 0.02 RLUSD approved.
// Pass --confirm to actually sign and submit; without it, previews only.
import * as fs from 'node:fs';
import { createPublicClient, createWalletClient, http, erc20Abi, formatUnits, parseUnits, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ENV_PATH = 'C:/Users/JD/Documents/Playground/ap4m-hackathon/.env';
const env = Object.fromEntries(
  fs.readFileSync(ENV_PATH, 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const RPC = 'https://rpc.testnet.xrplevm.org';
const EXPLORER = 'https://explorer.testnet.xrplevm.org';
const RLUSD = '0x27b57a9D0b8d24EB97259c4E2279e45255e016f3';
const TO = '0x139E4d70f435d8c2d17400566DB8cB0d7483bf30';
const MAX_APPROVED = parseUnits('0.02', 18);

const chain = {
  id: 1449000, name: 'XRPL EVM Testnet',
  nativeCurrency: { name: 'XRP', symbol: 'XRP', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: 'explorer', url: EXPLORER } },
};
const transport = http(RPC, { timeout: 60000, retryCount: 3 });
const pub = createPublicClient({ chain, transport });
const account = privateKeyToAccount(env.MERCHANT_PRIVATE_KEY);
const wallet = createWalletClient({ account, chain, transport });

const id = await pub.getChainId();
if (id !== 1449000) throw new Error(`wrong chain: ${id}`);

const balance = await pub.readContract({ address: RLUSD, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
const gas = await pub.getBalance({ address: account.address });
console.log('chainId        :', id, '✓');
console.log('from (merchant):', account.address);
console.log('to (sathya)    :', TO);
console.log('RLUSD balance  :', formatUnits(balance, 18), `(${balance} wei)`);
console.log('gas balance    :', formatUnits(gas, 18), 'XRP');

if (balance === 0n) throw new Error('merchant holds 0 RLUSD — nothing to send');
if (balance > MAX_APPROVED) throw new Error(`balance ${formatUnits(balance, 18)} exceeds the 0.02 approved — aborting`);

console.log('sending        :', formatUnits(balance, 18), 'RLUSD (full balance)');
console.log('');

const { request } = await pub.simulateContract({
  account, address: RLUSD, abi: erc20Abi, functionName: 'transfer', args: [TO, balance],
});
console.log('simulation     : ok ✓ (no revert)');
const estGas = await pub.estimateContractGas({
  account, address: RLUSD, abi: erc20Abi, functionName: 'transfer', args: [TO, balance],
});
console.log('gas estimate   :', estGas);

if (!process.argv.includes('--confirm')) {
  console.log('');
  console.log('PREVIEW ONLY — nothing signed. Re-run with --confirm to submit.');
  process.exit(0);
}

console.log('');
const hash = await wallet.writeContract(request);
console.log('tx hash        :', hash);
console.log('explorer       :', `${EXPLORER}/tx/${hash}`);

const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120000 });
console.log('status         :', receipt.status);
console.log('block          :', receipt.blockNumber);
console.log('gas used       :', receipt.gasUsed);
if (receipt.status !== 'success') throw new Error('transaction reverted on chain');

console.log('');
console.log('=== Transfer events ===');
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== RLUSD.toLowerCase()) continue;
  try {
    const { eventName, args } = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
    if (eventName === 'Transfer') console.log(`  ${formatUnits(args.value, 18)} RLUSD  ${args.from} -> ${args.to}`);
  } catch {}
}

console.log('');
console.log('=== Balances after ===');
for (const [label, addr] of [['merchant', account.address], ['sathya  ', TO]]) {
  const b = await pub.readContract({ address: RLUSD, abi: erc20Abi, functionName: 'balanceOf', args: [addr] });
  console.log(`  ${label} ${addr}  RLUSD=${formatUnits(b, 18)}`);
}

// Read-only: is this address safe to send to on the XRPL EVM sidechain?
// Checks EIP-55 checksum, whether it is a contract or an EOA, and its nonce.
// Usage: node check-recipient.mjs <address>
// Override the node with RPC_URL=<url>.
import { createPublicClient, http, getAddress } from 'viem';

const RAW = process.argv[2];
if (!RAW) {
  console.error('usage: node check-recipient.mjs <address>');
  process.exit(2);
}

const RPC = process.env.RPC_URL ?? 'https://rpc.testnet.xrplevm.org';
const chain = {
  id: 1449000, name: 'XRPL EVM Testnet',
  nativeCurrency: { name: 'XRP', symbol: 'XRP', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 60000, retryCount: 3 }) });

let address;
try {
  address = getAddress(RAW);
  console.log('checksum valid :', address === RAW ? 'yes (EIP-55 ✓)' : 'NO — correct form is ' + address);
} catch (e) {
  console.log('checksum       : INVALID —', e.shortMessage ?? e.message);
  process.exit(1);
}

console.log('address        :', address);
console.log('is contract    :', (await c.getCode({ address })) ? 'yes' : 'no (EOA)');
console.log('tx count (nonce):', await c.getTransactionCount({ address }));

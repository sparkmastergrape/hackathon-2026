import { createPublicClient, http, getAddress } from 'viem';
const RPC = 'https://rpc.testnet.xrplevm.org';
const RAW = '0x139E4d70f435d8c2d17400566DB8cB0d7483bf30';
const chain = { id: 1449000, name: 'XRPL EVM Testnet',
  nativeCurrency: { name: 'XRP', symbol: 'XRP', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } } };
const c = createPublicClient({ chain, transport: http(RPC, { timeout: 60000, retryCount: 3 }) });
try { console.log('checksum valid :', getAddress(RAW) === RAW ? 'yes (EIP-55 ✓)' : 'NO — correct form is ' + getAddress(RAW)); }
catch (e) { console.log('checksum       : INVALID —', e.shortMessage ?? e.message); }
console.log('is contract    :', (await c.getCode({ address: RAW })) ? 'yes' : 'no (EOA)');
console.log('tx count (nonce):', await c.getTransactionCount({ address: RAW }));

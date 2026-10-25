// Independently verify a settled AP4M payment from chain data alone.
// Usage: node verify-receipt-onchain.mjs <tx_hash>
// Reads the transaction receipt from a public RPC, decodes the events, and
// reports what actually happened. Does not ask AP4M to vouch for itself.
import { createPublicClient, http, defineChain, formatUnits, parseAbiItem, decodeEventLog } from 'viem';

const TX = process.argv[2];
if (!TX) { console.error('usage: node verify-receipt-onchain.mjs <tx_hash>'); process.exit(1); }

const RPC = process.env.RPC_URL ?? 'https://rpc.testnet.xrplevm.org';
const LEDGER = '0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91';
const RLUSD  = '0x27b57a9D0b8d24EB97259c4E2279e45255e016f3';

const chain = defineChain({
  id: 1449000, name: 'XRPL EVM Testnet',
  nativeCurrency: { name: 'XRP', symbol: 'XRP', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 60000, retryCount: 3 }) });

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

const receipt = await client.getTransactionReceipt({ hash: TX });
const tx = await client.getTransaction({ hash: TX });
const block = await client.getBlock({ blockNumber: receipt.blockNumber });

console.log('=== transaction ===');
console.log('rpc used       :', RPC);
console.log('hash           :', receipt.transactionHash);
console.log('status         :', receipt.status, receipt.status === 'success' ? '✓' : '✗');
console.log('block          :', receipt.blockNumber);
console.log('mined at       :', new Date(Number(block.timestamp) * 1000).toISOString());
console.log('from           :', tx.from);
console.log('to             :', tx.to, tx.to?.toLowerCase() === LEDGER.toLowerCase() ? '(PaymentLedger ✓)' : '(NOT the PaymentLedger ✗)');
console.log('gas used       :', receipt.gasUsed);
console.log('confirmations  :', await client.getBlockNumber() - receipt.blockNumber);

console.log('');
console.log('=== RLUSD transfers in this transaction ===');
let found = 0;
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== RLUSD.toLowerCase()) continue;
  try {
    const { args } = decodeEventLog({ abi: [transferEvent], data: log.data, topics: log.topics });
    found++;
    console.log(`  ${formatUnits(args.value, 18)} RLUSD`);
    console.log(`    from ${args.from}`);
    console.log(`    to   ${args.to}`);
  } catch { /* not a Transfer */ }
}
if (!found) console.log('  none in this tx (settlement payout is a separate transaction)');

console.log('');
console.log('=== other events emitted by the PaymentLedger ===');
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== LEDGER.toLowerCase()) continue;
  console.log('  topic0 :', log.topics[0]);
  if (log.topics[1]) console.log('    channelId :', log.topics[1]);
  if (log.topics[2]) console.log('    claimId   :', log.topics[2]);
}

// ── Trace the settlement payout: RLUSD leaving the vault for the merchant ──
const MERCHANT = process.env.MERCHANT_ADDRESS ?? '0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8';
const payoutLogs = await client.getLogs({
  address: RLUSD,
  event: transferEvent,
  args: { to: MERCHANT },
  fromBlock: receipt.blockNumber - 10n,
  toBlock: receipt.blockNumber + 50n,
});
console.log('');
console.log('=== settlement payout near this redemption ===');
console.log('merchant       :', MERCHANT);
if (!payoutLogs.length) console.log('  no RLUSD payout found in this block window');
for (const l of payoutLogs) {
  const b = await client.getBlock({ blockNumber: l.blockNumber });
  console.log(`  ${formatUnits(l.args.value, 18)} RLUSD  from ${l.args.from}`);
  console.log(`    tx    : ${l.transactionHash}`);
  console.log(`    block : ${l.blockNumber}  at ${new Date(Number(b.timestamp) * 1000).toISOString()}`);
}

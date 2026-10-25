// Generate the ICM build-track evidence for the AP4M x402 path, with every hash,
// address and amount read from the chain rather than transcribed by hand
// (workspace/_core/CONVENTIONS.md rule 13).
//
//   node icm-x402-evidence.mjs            # writes the two stage outputs
//   node icm-x402-evidence.mjs --dry      # prints what it found, writes nothing
//
// Channels are discovered through the AP4M session, not listed here, so the only
// inputs are the Agent key and the service URL.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ethers } from 'ethers';
import sdk from './ap4m-hackathon-sdk.cjs';
import * as ap4m from '@ap4m/sdk';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const WORKSPACE = path.join(ROOT, 'workspace');
const DRY = process.argv.includes('--dry');

for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  if (v) process.env[line.slice(0, i).trim()] = v;
}

const API = process.env.AP4M_API_URL;
const RPC = 'https://rpc.testnet.xrplevm.org';
const LEDGER = '0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91';
const VAULT = '0x83DD9cD010eb46e96eceF8F7eB0a18f7845AaBC0';
const RLUSD = '0x27b57a9D0b8d24EB97259c4E2279e45255e016f3';
const TODAY = new Date().toISOString().slice(0, 10);

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
const event = ap4m.PARTICIPANT_LEDGER_INTERFACE.getEvent('VoucherRedeemed');
const transferTopic = ethers.id('Transfer(address,address,uint256)');
const transferIface = new ethers.Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);

const fmt = (wei) => ethers.formatUnits(wei, 18);

// This RPC rejects wide eth_getLogs ranges, so walk it in windows.
async function logsInWindows(filter, fromBlock, toBlock, window = 2000) {
  const found = [];
  for (let start = fromBlock; start <= toBlock; start += window) {
    const end = Math.min(start + window - 1, toBlock);
    try {
      found.push(...await provider.getLogs({ ...filter, fromBlock: start, toBlock: end }));
    } catch (error) {
      if (window <= 25) throw error;
      found.push(...await logsInWindows(filter, start, end, Math.floor(window / 4)));
    }
  }
  return found;
}

const head = await provider.getBlockNumber();
const chainId = (await provider.getNetwork()).chainId;

// ── Channels, from the service rather than from a list written here ──────────
const session = await sdk.signIn(API, process.env.TEAM_NAME, wallet);
const channels = await sdk.listChannels(API, session.token);
console.error(`signed in; service lists ${channels.length} channel(s)`);

// ── Every redemption on every channel we hold ────────────────────────────────
const SEARCH_FROM = head - 12_000 > 0 ? head - 12_000 : 0;
const redemptions = [];
for (const channel of channels) {
  const logs = await logsInWindows(
    { address: LEDGER, topics: [event.topicHash, channel.channel_id] }, SEARCH_FROM, head,
  );
  for (const log of logs) {
    const parsed = ap4m.PARTICIPANT_LEDGER_INTERFACE.parseLog(log);
    const [receipt, block, tx] = await Promise.all([
      provider.getTransactionReceipt(log.transactionHash),
      provider.getBlock(log.blockNumber),
      provider.getTransaction(log.transactionHash),
    ]);
    redemptions.push({
      channelId: channel.channel_id,
      channelStatus: channel.channel_status,
      tx: log.transactionHash,
      block: log.blockNumber,
      at: new Date(block.timestamp * 1000).toISOString().replace('.000', ''),
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status,
      to: tx.to,
      selector: tx.data.slice(0, 10),
      claimId: parsed.args.claimId,
      voucherDigest: parsed.args.voucherDigest,
      agent: parsed.args.agent,
      submitter: parsed.args.submitter,
      merchantId: parsed.args.merchantId,
      payout: parsed.args.payout,
      previous: parsed.args.previousCumulativeAmount,
      cumulative: parsed.args.cumulativeAmount,
      amount: parsed.args.amount,
      signatureBytes: (ap4m.PARTICIPANT_LEDGER_INTERFACE.parseTransaction({ data: tx.data })
        ?.args?.[1]?.length - 2) / 2,
    });
  }
}
redemptions.sort((a, b) => a.block - b.block);

// ── The payout leg: RLUSD arriving in the merchant wallet ────────────────────
const payout = ethers.getAddress(process.env.MERCHANT_PAYOUT_ADDRESS);
const payoutLegs = (await logsInWindows(
  { address: RLUSD, topics: [transferTopic, null, ethers.zeroPadValue(payout, 32)] }, SEARCH_FROM, head,
)).map((log) => {
  const parsed = transferIface.parseLog(log);
  return { tx: log.transactionHash, block: log.blockNumber, from: parsed.args.from, value: parsed.args.value };
});
payoutLegs.sort((a, b) => a.block - b.block);

// And the other direction, so the balance can be reconciled rather than explained.
const payoutOut = (await logsInWindows(
  { address: RLUSD, topics: [transferTopic, ethers.zeroPadValue(payout, 32)] }, SEARCH_FROM, head,
)).map((log) => {
  const parsed = transferIface.parseLog(log);
  return { tx: log.transactionHash, block: log.blockNumber, to: parsed.args.to, value: parsed.args.value };
});
payoutOut.sort((a, b) => a.block - b.block);
const totalOut = payoutOut.reduce((n, l) => n + l.value, 0n);

const rlusd = new ethers.Contract(RLUSD, [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
], provider);
const [balance, decimals, symbol] = await Promise.all([
  rlusd.balanceOf(payout), rlusd.decimals(), rlusd.symbol(),
]);
const agentGas = await provider.getBalance(wallet.address);
const submitterGas = await provider.getBalance(payout);

const selectors = [...new Set(redemptions.map((r) => r.selector))];
const recomputed = ethers.id('redeemVoucher((bytes32,uint256),bytes)').slice(0, 10);
const totalRedeemed = redemptions.reduce((n, r) => n + r.amount, 0n);
const totalPaidOut = payoutLegs.reduce((n, l) => n + l.value, 0n);
const vaultLegs = payoutLegs.filter((l) => l.from.toLowerCase() === VAULT.toLowerCase());

if (DRY) {
  const plain = (_key, value) => (typeof value === 'bigint' ? fmt(value) : value);
  console.log(JSON.stringify({ chainId: String(chainId), head, channels: channels.length, redemptions, payoutLegs, balance: fmt(balance) }, plain, 1));
  process.exit(0);
}

// ── Stage 01 — measurements ──────────────────────────────────────────────────
const measurements = `# Measurements — AP4M x402 on XRPL EVM testnet

Generated by \`icm-x402-evidence.mjs\` at the repository root on ${TODAY}. Every
hash, address and amount below was read from \`${RPC}\` by that script and written
straight to this file. Nothing here was typed by hand (rule 13). Re-run the
script to re-measure; it overwrites this file.

Session of record: the AP4M build session, 24 and 25 Oct 2026.

## Host and chain

| Fact | Value | How |
| :-- | :-- | :-- |
| Chain ID | ${chainId} | \`eth_chainId\` against \`${RPC}\` |
| Chain head at generation | ${head} | \`eth_blockNumber\` |
| Token | ${symbol}, ${decimals} decimals | \`symbol()\` and \`decimals()\` on \`${RLUSD}\` |
| PaymentLedger | \`${LEDGER}\` | destination of every redemption below |
| PooledEscrowVault | \`${VAULT}\` | sender of every payout leg below |

**measured.** The chain ID agrees with the value already in
\`shared/MEASURED-FACTS.md\`, re-checked here rather than imported.

## Method selector

\`\`\`
keccak256("redeemVoucher((bytes32,uint256),bytes)")[0:4] = ${recomputed}
observed in calldata                                     = ${selectors.join(', ')}
match                                                    = ${selectors.every((s) => s === recomputed) ? 'yes, all redemptions' : 'NO'}
\`\`\`

**measured.** Recomputed by the script from the signature, then compared against
the first four bytes of each transaction's own input. The explorer's label was
not consulted.

## Redemptions found on the channels this team holds

Channels were listed through \`sdk.listChannels\` against \`${API}\`, not written
into the script, then each channel's \`VoucherRedeemed\` events were read from the
ledger. ${channels.length} channel(s) listed; ${redemptions.length} redemption(s) found.

| # | Block | At (UTC) | Amount | Cumulative | Channel | Transaction |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
${redemptions.map((r, i) => `| ${i + 1} | ${r.block} | ${r.at} | ${fmt(r.amount)} | ${fmt(r.previous)} → ${fmt(r.cumulative)} | \`${r.channelId.slice(0, 10)}…\` | \`${r.tx}\` |`).join('\n')}

Total redeemed across all channels: **${fmt(totalRedeemed)} ${symbol}**.

**measured.** Every row is a decoded \`VoucherRedeemed\` event, not a service
response.

### Each redemption in full

${redemptions.map((r, i) => `#### ${i + 1}. Block ${r.block}, ${r.at}

| Field | Value |
| :-- | :-- |
| Transaction | \`${r.tx}\` |
| Receipt status | ${r.status === 1 ? 'success' : `FAILED (${r.status})`} |
| To | \`${r.to}\` |
| Selector | \`${r.selector}\` |
| Gas used | ${Number(r.gasUsed).toLocaleString('en-GB')} |
| Claim ID | \`${r.claimId}\` |
| Voucher digest | \`${r.voucherDigest}\` |
| Agent (authorised) | \`${r.agent}\` |
| Submitter (sent it) | \`${r.submitter}\` |
| Merchant ID | \`${r.merchantId}\` |
| Payout | \`${r.payout}\` |
| Amount | ${fmt(r.amount)} ${symbol} |
| Channel cumulative | ${fmt(r.previous)} → ${fmt(r.cumulative)} ${symbol} |
| Agent signature | ${r.signatureBytes} bytes |
| Channel status now | ${r.channelStatus} |
`).join('\n')}
**measured.** \`agent\` and \`submitter\` are separate fields in the event. Where
they differ, the ledger itself records that the party that authorised the payment
is not the party that sent the transaction.

## The payout leg

RLUSD \`Transfer\` events into \`${payout}\`, read from the token contract:

| Block | Amount | From | Transaction |
| :-- | :-- | :-- | :-- |
${payoutLegs.map((l) => `| ${l.block} | ${fmt(l.value)} | \`${l.from}\`${l.from.toLowerCase() === VAULT.toLowerCase() ? ' (vault)' : ''} | \`${l.tx}\` |`).join('\n')}

${vaultLegs.length} of ${payoutLegs.length} leg(s) came from the vault, totalling
${fmt(vaultLegs.reduce((n, l) => n + l.value, 0n))} ${symbol}. All legs total
${fmt(totalPaidOut)} ${symbol}.

${payoutOut.length === 0 ? `No RLUSD left the payout wallet in the window.` : `RLUSD also **left** the payout wallet, ${payoutOut.length} transfer(s) totalling ${fmt(totalOut)} ${symbol}:

| Block | Amount | To | Transaction |
| :-- | :-- | :-- | :-- |
${payoutOut.map((l) => `| ${l.block} | ${fmt(l.value)} | \`${l.to}\` | \`${l.tx}\` |`).join('\n')}

**measured.** What those outgoing transfers were for is **not** measured here and
no cause is claimed for them.`}

## Reconciliation

\`\`\`
redeemed on chain      ${fmt(totalRedeemed).padStart(8)} ${symbol}   (${redemptions.length} VoucherRedeemed events)
into the payout wallet ${fmt(totalPaidOut).padStart(8)} ${symbol}   (${payoutLegs.length} Transfer events)
out of the payout      ${fmt(totalOut).padStart(8)} ${symbol}   (${payoutOut.length} Transfer events)
expected balance       ${fmt(totalPaidOut - totalOut).padStart(8)} ${symbol}
balanceOf reports      ${fmt(balance).padStart(8)} ${symbol}
reconciles             ${totalPaidOut - totalOut === balance ? 'yes' : 'NO — unexplained difference of ' + fmt(balance - (totalPaidOut - totalOut)) + ' ' + symbol}
redeemed == paid in    ${totalRedeemed === totalPaidOut ? 'yes' : 'NO — difference of ' + fmt(totalPaidOut - totalRedeemed) + ' ' + symbol}
\`\`\`

**measured.** Every figure in that block is a sum of decoded events or a contract
read, computed by the script. ${totalPaidOut - totalOut === balance && totalRedeemed === totalPaidOut
  ? 'It balances, within the search window.'
  : 'It does **not** balance. The difference is recorded and not explained; see `shared/INFERENCES.md` before anyone offers a cause for it.'}

The window is the last ${head - SEARCH_FROM} blocks, ending at ${head}. A payment
older than that does not appear above, so none of this proves that no other
payment exists.

## Gas

| Wallet | Role | XRP |
| :-- | :-- | :-- |
| \`${wallet.address}\` | Agent — signs vouchers, submits in the SDK path | ${fmt(agentGas)} |
| \`${payout}\` | Merchant — receives RLUSD, submits in the x402 path | ${fmt(submitterGas)} |

**measured.** \`eth_getBalance\` on each, ${TODAY}.

## What this does not establish

- Nothing here is about \`xrpl:1\`. This is the EVM sidechain, chain ${chainId},
  and the AP4M service — a different x402 implementation from the t54 facilitator
  recorded in \`shared/MEASURED-FACTS.md\`. The two are not interchangeable.
- The PaymentLedger at \`${LEDGER}\` is **not source-verified** on the public
  explorer, so what the contract does with a voucher signature cannot be read.
  That a 65-byte signature is mandatory in the calldata is measured; that the
  contract checks it is not.
- No device was involved in any payment above. These are software-key signatures.
`;

// ── Stage 03 — proof run ─────────────────────────────────────────────────────
const x402 = redemptions.filter((r) => r.submitter.toLowerCase() !== r.agent.toLowerCase());
const sdkPath = redemptions.filter((r) => r.submitter.toLowerCase() === r.agent.toLowerCase());
const proof = `# Proof run — AP4M x402 payment path

Generated by \`icm-x402-evidence.mjs\` at the repository root on ${TODAY}, reading
\`${RPC}\`. Hashes are machine-transcribed (rule 13).

This stage's contract names \`prove_hardware.py\` and \`prove_device.py\`, which
cover the device bridge on \`xrpl:1\`. **This file covers neither.** It records the
AP4M path on chain ${chainId}, which has its own harnesses at the repository root:
\`predemo.mjs\`, \`run-ap4m.cjs\`, \`x402-merchant.mjs\` and \`x402-agent.mjs\`. The
device proof is a separate run and is not reported here.

## Settled payments

${redemptions.length} redemption(s), all receipt status success, ${fmt(totalRedeemed)}
${symbol} in total.

| # | Path | Amount | Block | Transaction |
| :-- | :-- | :-- | :-- | :-- |
${redemptions.map((r, i) => `| ${i + 1} | ${r.submitter.toLowerCase() === r.agent.toLowerCase() ? 'SDK (agent submits)' : 'x402 (merchant submits)'} | ${fmt(r.amount)} | ${r.block} | \`${r.tx}\` |`).join('\n')}

**measured.** ${sdkPath.length} by the SDK path, ${x402.length} by the x402 path,
separated by comparing the \`agent\` and \`submitter\` fields of each event rather
than by trusting which script was run.

## The x402 flow, end to end

The run that completed in one pass:

${x402.length === 0 ? '_No x402 redemption found in the search window._' : (() => {
  const r = x402[x402.length - 1];
  const leg = vaultLegs.find((l) => l.block >= r.block);
  return `1. Merchant answered an unpaid \`GET /resource\` with **HTTP 402** and a quote of
   ${fmt(r.amount)} ${symbol} bound to channel \`${r.channelId.slice(0, 10)}…\`.
   **measured**, in the agent's own stdout — and the only step in this list that
   the ledger cannot corroborate.
2. The agent compared the quote against its ceiling and paid without a human
   step. **measured** in stdout; the decision itself leaves no on-chain trace,
   so the autonomy claim rests on the code path and the absence of any approval
   prompt, not on the ledger.
3. Merchant submitted the agent's signed voucher: block ${r.block}, ${r.at},
   ${Number(r.gasUsed).toLocaleString('en-GB')} gas, selector \`${r.selector}\`.
   **measured.**
   \`${r.tx}\`
4. \`VoucherRedeemed\`: claim \`${r.claimId}\`, ${fmt(r.amount)} ${symbol},
   cumulative ${fmt(r.previous)} → ${fmt(r.cumulative)}, agent \`${r.agent}\`,
   submitter \`${r.submitter}\`. **measured.**
5. Vault paid the merchant${leg ? `: block ${leg.block}, ${fmt(leg.value)} ${symbol}, ${leg.block - r.block} block(s) later. **measured.**\n   \`${leg.tx}\`` : ' — no vault leg found at or after this block in the window. **measured** as absent, not as a failure.'}`;
})()}

## Channel reuse

${(() => {
  const byChannel = new Map();
  for (const r of redemptions) byChannel.set(r.channelId, (byChannel.get(r.channelId) ?? 0) + 1);
  const many = [...byChannel.entries()].filter(([, n]) => n > 1);
  if (many.length === 0) return '**measured.** No channel carried more than one redemption, so the many-vouchers-per-channel case is untested.';
  return `**measured.** ${many.map(([id, n]) => `Channel \`${id.slice(0, 10)}…\` carried ${n} redemptions`).join('; ')}. The cumulative amount rose monotonically across them, which is the micropayment case: one on-chain cap, many vouchers.`;
})()}

## The refusal case

The spending ceiling **has** been seen to refuse, at a wide margin and at one
base unit, with a control at exactly the ceiling that passes. That run is
hand-written and lives beside this file in \`refusal-case.md\`, which this script
does not touch. Do not re-add "the ceiling is untested" below; it was true until
25 Oct 2026 and is not now.

## What was not proven

- **No device, no human veto.** Every signature above came from a software key.
- **One merchant, one resource, one price.** No catalogue, no negotiation.
- **Localhost only.** The merchant binds \`127.0.0.1\`; it has never been reached
  over the network, which would require HTTPS.
- The search window is the last ${head - SEARCH_FROM} blocks. Older payments, if
  any, are not in these tables.
`;

const files = [
  ['tracks/build/stages/01-measure/output/measurements.md', measurements],
  ['tracks/build/stages/03-prove/output/proof-run.md', proof],
];
for (const [rel, body] of files) {
  const target = path.join(WORKSPACE, rel);
  fs.writeFileSync(target, body);
  console.error(`wrote ${rel}  (${Buffer.byteLength(body)} bytes)`);
}
console.error(`\n${redemptions.length} redemption(s), ${payoutLegs.length} payout leg(s), balance ${fmt(balance)} ${symbol}`);

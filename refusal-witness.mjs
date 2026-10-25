// Witness for the refusal case: count what exists on the channel before and after
// the agent is offered a price above its ceiling, so "no payment happened" is a
// comparison rather than an assertion.
//
//   node refusal-witness.mjs before <channelId>
//   node refusal-witness.mjs after  <channelId>
//
// Writes a JSON snapshot per phase into the scratch file named below, and prints
// the comparison when run with "after".
import * as fs from 'node:fs';
import { ethers } from 'ethers';
import * as ap4m from '@ap4m/sdk';

const PHASE = process.argv[2];
const CHANNEL = process.argv[3];
const LABEL = process.argv[4] ?? 'default';   // so cases do not overwrite each other
const SNAP = `.refusal-witness-${LABEL}-before.json`;
if (!['before', 'after'].includes(PHASE) || !/^0x[0-9a-f]{64}$/.test(CHANNEL ?? '')
  || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(LABEL)) {
  console.error('usage: node refusal-witness.mjs before|after <channelId> [label]');
  process.exit(2);
}

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  if (v) process.env[line.slice(0, i).trim()] = v;
}

const LEDGER = '0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91';
const RLUSD = '0x27b57a9D0b8d24EB97259c4E2279e45255e016f3';
const provider = new ethers.JsonRpcProvider('https://rpc.testnet.xrplevm.org');
const event = ap4m.PARTICIPANT_LEDGER_INTERFACE.getEvent('VoucherRedeemed');
const payout = ethers.getAddress(process.env.MERCHANT_PAYOUT_ADDRESS);

async function logsInWindows(filter, from, to, window = 2000) {
  const out = [];
  for (let s = from; s <= to; s += window) {
    const e = Math.min(s + window - 1, to);
    try { out.push(...await provider.getLogs({ ...filter, fromBlock: s, toBlock: e })); }
    catch (error) {
      if (window <= 25) throw error;
      out.push(...await logsInWindows(filter, s, e, Math.floor(window / 4)));
    }
  }
  return out;
}

const head = await provider.getBlockNumber();
const from = head - 12_000 > 0 ? head - 12_000 : 0;
const logs = await logsInWindows({ address: LEDGER, topics: [event.topicHash, CHANNEL] }, from, head);
const rlusd = new ethers.Contract(RLUSD, ['function balanceOf(address) view returns (uint256)'], provider);
const parsedLogs = logs.map((l) => ({ log: l, args: ap4m.PARTICIPANT_LEDGER_INTERFACE.parseLog(l).args }));
const cumulativeWei = parsedLogs.reduce((a, p) => (p.args.cumulativeAmount > a ? p.args.cumulativeAmount : a), 0n);
const snapshot = {
  phase: PHASE,
  at: new Date().toISOString(),
  head,
  channel: CHANNEL,
  redemptions: logs.length,
  claimIds: parsedLogs.map((p) => p.args.claimId).sort(),
  // Amounts are kept in base units as strings. A boundary case is decided one
  // base unit at a time, and a decimal rendering cannot show that.
  amountsWei: Object.fromEntries(parsedLogs.map((p) => [p.args.claimId, p.args.amount.toString()])),
  cumulativeWei: cumulativeWei.toString(),
  cumulative: ethers.formatUnits(cumulativeWei, 18),
  payoutBalanceWei: (await rlusd.balanceOf(payout)).toString(),
  payoutBalance: ethers.formatUnits(await rlusd.balanceOf(payout), 18),
};

console.log(`[${PHASE}] head ${head} · ${snapshot.redemptions} redemption(s) on this channel · cumulative ${snapshot.cumulative} · payout ${snapshot.payoutBalance} RLUSD`);

if (PHASE === 'before') {
  fs.writeFileSync(SNAP, JSON.stringify(snapshot, null, 1));
  console.log(`snapshot written to ${SNAP}`);
} else {
  const before = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  const added = snapshot.claimIds.filter((c) => !before.claimIds.includes(c));
  console.log('');
  console.log('comparison');
  console.log(`  blocks elapsed        : ${before.head} -> ${snapshot.head} (${snapshot.head - before.head})`);
  console.log(`  redemptions on channel: ${before.redemptions} -> ${snapshot.redemptions}`);
  console.log(`  new claim IDs         : ${added.length === 0 ? 'none' : added.join(', ')}`);
  for (const claim of added) console.log(`    ${claim} amount ${snapshot.amountsWei[claim]} base units`);
  console.log(`  channel cumulative    : ${before.cumulativeWei} -> ${snapshot.cumulativeWei} base units`);
  console.log(`  cumulative delta      : ${BigInt(snapshot.cumulativeWei) - BigInt(before.cumulativeWei)} base units`);
  console.log(`  payout balance        : ${before.payoutBalanceWei} -> ${snapshot.payoutBalanceWei} base units`);
  console.log('');
  const nothing = added.length === 0 && before.cumulativeWei === snapshot.cumulativeWei;
  // An expectation can be stated, so the witness can be wrong rather than agreeable.
  const expectWei = process.env.EXPECT_DELTA_WEI;
  let verdict;
  if (expectWei === undefined) {
    verdict = nothing;
    console.log(nothing
      ? 'VERDICT: no voucher was redeemed on this channel across the run.'
      : 'VERDICT: something WAS redeemed. No payment was expected.');
  } else {
    const delta = (BigInt(snapshot.cumulativeWei) - BigInt(before.cumulativeWei)).toString();
    verdict = delta === expectWei;
    console.log(`expected delta: ${expectWei} base units`);
    console.log(`actual delta  : ${delta} base units`);
    console.log(verdict
      ? 'VERDICT: the chain moved by exactly the expected amount.'
      : 'VERDICT: the chain did NOT move by the expected amount.');
  }
  fs.writeFileSync(`.refusal-witness-${LABEL}-after.json`, JSON.stringify({ before, after: snapshot, added, verdict }, null, 1));
  process.exit(verdict ? 0 : 1);
}

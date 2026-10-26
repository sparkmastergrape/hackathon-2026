/**
 * Watch PaymentLedger.VoucherRedeemed on XRPL EVM Testnet, over a WebSocket.
 *
 * The companion to settlement_watch.py. That one watches the classic XRP
 * Ledger for a settled Payment; this one watches the EVM sidechain for a
 * redeemed RLUSD voucher. Same discipline, different chain:
 *
 *     node audit/evm_voucher_watch.mjs --self-test      prove the socket pushes
 *     node audit/evm_voucher_watch.mjs --backfill 9000  read recent history
 *     node audit/evm_voucher_watch.mjs                  subscribe and wait
 *
 * Configure with XRPL_EVM_WSS_URL (QuickNode) and XRPL_EVM_RPC_URL. A
 * QuickNode URL carries its token in the path, so it is a credential:
 * nothing here prints it or writes it to a file. The provider name goes in
 * the output instead, as `source`, the same way emit_from_ledger.py does it.
 *
 * ## Why this subscribes to one topic and not to blocks
 *
 * `provider.on("block")` fires on every block on the chain, whether or not
 * anything of ours happened in it. It tells you the chain is alive, which you
 * already knew. It cannot tell you a voucher was redeemed, so a UI driven by
 * it animates on a timer that happens to be block-shaped. This subscribes to
 * one address and one topic, so every message is an event that concerns us.
 *
 * ## What cannot be decoded, and why
 *
 * PaymentLedger is NOT verified on explorer.testnet.xrplevm.org, and the AP4M
 * SDK ships no ABI for this event — it recovers claimId positionally, from
 * `log.topics[2]`. So there is no source anywhere for the parameter NAMES.
 *
 * The types are known, from the signature string the SDK hashes:
 *
 *   VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,
 *                   address,address,uint256,uint256,uint256)
 *
 * MEASURED against log 0x3389950b… (block 9233420): 4 topics and 256 bytes of
 * data, which is 3 indexed parameters plus 8 words. 3 + 8 = 11, the parameter
 * count, and the first three declared types are bytes32, which is what the
 * three topics hold.
 *
 * INFERRED from that: the three indexed parameters are the first three
 * declared. Decoding the remaining 8 words under that layout yields three
 * well-formed non-zero addresses, and three 18-dp amounts where position 5 +
 * position 7 equals position 6 exactly. That held for 84 of 84 logs read,
 * with no exceptions, which is the cumulative voucher accounting AGENTS.md
 * describes: a running total, a previous total, and the payment between them.
 *
 * CROSS-CONFIRMED against AP4M's own receipt, which is an independent source
 * rather than more of our own arithmetic. For claim
 * 0xe44fd8ba…, `ap4m.claim-receipt.v1` at
 * /public/evidence/claims/<claimId>/<settlementDigest>.json states:
 *
 *   receipt claimId            == the log's topics[2]
 *   receipt amount             0.02   == decoded position 7
 *   receipt cumulativeDisbursed 0.16  == decoded position 6
 *
 * and position 5 (0.14) is the difference, as the running total before this
 * payment. So the ROLES of topics[2] and positions 5, 6 and 7 are confirmed
 * by the issuer, not merely consistent with themselves. The parameter NAMES
 * are still unknown and the indexed/non-indexed split is still inference, so
 * events keep `evidence: "inferred"` for the layout as a whole.
 *
 * Note what the receipt does NOT carry: the redeemVoucher transaction. For
 * that claim the receipt names a payout (block 9231092) and a settlement
 * (block 9231094), while the VoucherRedeemed log sits at block 9231091. The
 * receipt and this watcher are complementary, and neither alone shows the
 * whole sequence.
 *
 * The names stay unknown, so this file does not invent any. Decoded values
 * are reported by position and type, and the event carries
 * `evidence: "inferred"` for the layout while the log's own facts — address,
 * topic, block, transaction hash — are measured.
 */

import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const OUT = path.join(HERE, 'evm-events.json');

// From AP4M /public/config. Measured chain id, not the 1449000-vs-1440000
// confusion the hackathon page leaves open: see EVENT-SCHEMA.md.
const LEDGER_ADDRESS = '0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91';
const CHAIN_ID = 1449000;
const NETWORK = `eip155:${CHAIN_ID}`;
const EXPLORER_TX = 'https://explorer.testnet.xrplevm.org/tx/';

const EVENT_SIGNATURE =
  'VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,' +
  'address,address,uint256,uint256,uint256)';
const TOPIC0 = ethers.id(EVENT_SIGNATURE);

// The 8 non-indexed words, in declaration order, under the layout documented
// above. Types are measured from the signature; the split is inferred.
const DATA_TYPES = [
  'bytes32', 'address', 'bytes32', 'address',
  'address', 'uint256', 'uint256', 'uint256',
];

const PUBLIC_RPC = 'https://rpc.testnet.xrplevm.org';
const EXPLORER_API =
  'https://explorer.testnet.xrplevm.org/api/v2/addresses/' +
  LEDGER_ADDRESS + '/transactions?filter=to';

// ---------------------------------------------------------------------------

/** Read a .env this project already uses. Values already in the environment win. */
function loadEnv() {
  for (const name of ['.env', path.join('prep', '.env')]) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env) && value) process.env[key] = value;
    }
  }
}

/**
 * Pick an endpoint. Returns { url, provider, kind }; only `provider` is
 * printable — a QuickNode url is a credential.
 */
function endpoint(kind) {
  loadEnv();
  const wanted = kind === 'wss' ? 'XRPL_EVM_WSS_URL' : 'XRPL_EVM_RPC_URL';
  const url = (process.env[wanted] || '').trim();
  if (url) {
    const provider = /quiknode/i.test(url) ? 'QuickNode' : 'configured node';
    return { url, provider, kind };
  }
  if (kind === 'wss') return null; // no public WSS is assumed to exist
  return { url: PUBLIC_RPC, provider: `public XRPL EVM node (no ${wanted} set)`, kind };
}

/** Decode one log into a plain record. Throws if the layout does not fit. */
function decodeLog(log) {
  const words = ethers.AbiCoder.defaultAbiCoder().decode(DATA_TYPES, log.data);
  return {
    indexed: log.topics.slice(1),
    data: DATA_TYPES.map((type, i) => ({
      position: i,
      type,
      value: typeof words[i] === 'bigint' ? words[i].toString() : words[i],
    })),
  };
}

/**
 * One agent-audit/1 event.
 *
 * No `amount` field, deliberately. The schema's unit enum is
 * {drops, XRP, usd_cents, USD} and the validator says so in as many words:
 * "Omit amount rather than converting when no exact unit can be named." RLUSD
 * is not in that enum, so the figures go in `detail`, labelled, at full
 * 18-decimal precision alongside their formatted form. Adding RLUSD to the
 * enum is a change to a schema two codebases share, so it is not made here.
 */
function toEvent(log, timestampSeconds) {
  const decoded = decodeLog(log);
  const amounts = decoded.data
    .filter((w) => w.type === 'uint256')
    .map((w) => ({
      position: w.position,
      raw_18dp: w.value,
      formatted: ethers.formatUnits(w.value, 18),
    }));

  return {
    ts: new Date(timestampSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    stage: 'voucher_redeemed',
    actor: 'ledger',
    outcome: 'ok',
    // The log is measured; the parameter layout that reads it is inferred.
    evidence: 'inferred',
    summary: `a voucher was redeemed on PaymentLedger in block ${log.blockNumber}`,
    asset: 'RLUSD',
    tx_hash: log.transactionHash,
    explorer_url: EXPLORER_TX + log.transactionHash,
    detail: {
      contract: LEDGER_ADDRESS,
      topic0: log.topics[0],
      event_signature: EVENT_SIGNATURE,
      block_number: log.blockNumber,
      // topics[2] is claimId; that one name IS known, from the SDK helper.
      claim_id: decoded.indexed[1] ?? null,
      indexed_topics: decoded.indexed,
      data_words: decoded.data,
      rlusd_amounts: amounts,
      layout_basis:
        'types measured from the signature the SDK hashes; the indexed/' +
        'non-indexed split inferred from 4 topics + 8 data words = 11 ' +
        'parameters, and corroborated by well-formed addresses and ' +
        'cumulative amounts that sum',
      cross_confirmed:
        "roles checked against AP4M's own ap4m.claim-receipt.v1, an " +
        'independent source: receipt claimId == topics[2], receipt amount == ' +
        'position 7, receipt cumulativeDisbursed == position 6. Verified for ' +
        'claim 0xe44fd8ba…. The names are still unknown.',
      receipt_url_shape:
        'https://hackathon.ap4m.build/public/evidence/claims/<claimId>/' +
        '<settlementDigest>.json — neither of those is a transaction hash, ' +
        'so neither resolves on an explorer. The explorer-viewable hashes ' +
        'are inside the receipt, under settlementTransaction and ' +
        'payoutObservation, and the redeemVoucher transaction (this event) ' +
        'is in neither.',
      names_unknown:
        'PaymentLedger is unverified on the explorer and the SDK ships no ' +
        'ABI for this event, so no parameter names exist to report',
    },
  };
}

/**
 * One agent-audit/1 event for a PaymentLedger call that REVERTED.
 *
 * This is the half the log subscription cannot see. A reverted transaction
 * emits no events at all — measured: receipt status 0 with logs.length 0 —
 * so a watcher built only on `getLogs` is blind to every refusal by
 * construction. audit/README.md says "a refusal leaves no trace on a ledger",
 * and that is true of the classic XRP Ledger, where nothing was signed and
 * nothing submitted. It is NOT true here. On the EVM sidechain a refusal
 * leaves a transaction, with a hash, in a block, that the explorer serves.
 *
 * ## Why no reason is reported
 *
 * `outcome: "refused"` needs `evidence`, and the evidence here is `measured`:
 * status 0 comes from the node, not from anything the agent told us. But the
 * REASON is a different claim, and it is not reliably available:
 *
 *   - the explorer returns `revert_reason: null` for real reverts on this
 *     chain (measured on 0xecab592e…, block 9234482)
 *   - replaying the call one block earlier does not reproduce it, because a
 *     revert is state-dependent and that state is gone (measured: the same
 *     transaction's inputs do not revert at block-1)
 *
 * So this reports THAT the ledger refused, never WHY. The explorer's `result`
 * field is not used as a reason: for these transactions it reads
 * "awaiting_internal_transactions", which is Blockscout's own indexing state,
 * not a fact about the chain. Printing it as a cause would invent one.
 */
function refusalEvent(receipt, tx, timestampSeconds) {
  // Read the callee off the receipt rather than assuming it. Called on a
  // transaction to another contract, a hardcoded address would make the event
  // name the wrong one, which is a worse failure than naming none.
  const to = receipt.to || (tx && tx.to) || null;
  const isLedger = !!to && to.toLowerCase() === LEDGER_ADDRESS.toLowerCase();
  const what = isLedger ? 'a PaymentLedger call' : `a call to ${to || 'an unknown address'}`;

  return {
    ts: new Date(timestampSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    stage: 'voucher_refused',
    actor: 'ledger',
    outcome: 'refused',
    // The revert is observed. Only the reason would be inference, and none
    // is offered.
    evidence: 'measured',
    summary: `the ledger refused ${what} in block ${receipt.blockNumber}`,
    asset: 'RLUSD',
    tx_hash: receipt.hash,
    explorer_url: EXPLORER_TX + receipt.hash,
    detail: {
      contract: to,
      is_payment_ledger: isLedger,
      block_number: receipt.blockNumber,
      receipt_status: receipt.status,
      logs_emitted: receipt.logs.length,
      selector: tx && tx.data ? tx.data.slice(0, 10) : null,
      caller: tx ? tx.from : null,
      basis:
        'receipt status 0 read from the node: the transaction was mined and ' +
        'its effects were discarded',
      reason_unavailable:
        'no revert reason is reported. The explorer returns revert_reason ' +
        'null for reverts on this chain, and replaying the call at the ' +
        'parent block does not reproduce it, because the state that caused ' +
        'it is gone. THAT the ledger refused is measured; WHY is not known.',
      not_a_reason:
        "the explorer's `result` field is an indexer state, not a cause, so " +
        'it is deliberately not carried here',
    },
  };
}

/** Confirm a candidate really reverted, from the node rather than the index. */
async function confirmRevert(provider, hash) {
  const receipt = await provider.getTransactionReceipt(hash);
  if (!receipt || receipt.status !== 0) return null;
  const tx = await provider.getTransaction(hash);
  const block = await provider.getBlock(receipt.blockNumber);
  return refusalEvent(receipt, tx, block.timestamp);
}

function writeDoc(events, source) {
  const doc = {
    schema: 'agent-audit/1',
    run_id: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') + '/evm-voucher',
    network: NETWORK,
    source,
    events: events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0)),
  };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`wrote ${events.length} events -> ${OUT}`);
}

// ---------------------------------------------------------------------------

async function backfill(spanBlocks) {
  const ep = endpoint('https');
  console.log(`reading via ${ep.provider}`);
  const provider = new ethers.JsonRpcProvider(ep.url);

  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) {
    throw new Error(`wrong chain: got ${net.chainId}, expected ${CHAIN_ID}`);
  }

  const latest = await provider.getBlockNumber();
  const from = Math.max(0, latest - spanBlocks);
  const logs = await provider.getLogs({
    address: LEDGER_ADDRESS, topics: [TOPIC0], fromBlock: from, toBlock: latest,
  });
  console.log(`blocks ${from}..${latest}: ${logs.length} VoucherRedeemed logs`);

  // One getBlock per distinct block, not per log.
  const times = new Map();
  for (const n of new Set(logs.map((l) => l.blockNumber))) {
    times.set(n, (await provider.getBlock(n)).timestamp);
  }

  const events = [];
  let undecodable = 0;
  for (const log of logs) {
    try { events.push(toEvent(log, times.get(log.blockNumber))); }
    catch { undecodable += 1; }
  }
  if (undecodable) {
    console.log(`${undecodable} logs did not fit the inferred layout ` +
                '(reported, not hidden — the layout may be wrong for them)');
  }

  // Reverts emit no logs, so getLogs above cannot have found any. The
  // explorer's address index lists them; the node decides whether each one
  // really reverted, because the index's status field is the indexer's
  // opinion and receipt.status is the chain's.
  const refusals = await backfillRefusals(provider, from);
  events.push(...refusals);
  console.log(`refusals confirmed by receipt status: ${refusals.length}`);

  writeDoc(events, ep.provider);
  return 0;
}

/** Candidate failures from the explorer index, each confirmed against the node. */
async function backfillRefusals(provider, fromBlock) {
  let url = EXPLORER_API;
  const confirmed = [];
  let scanned = 0, unconfirmed = 0;

  for (let page = 0; page < 6 && url; page++) {
    let doc;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'audit-scan' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      doc = await res.json();
    } catch (err) {
      console.log(`  explorer index page ${page + 1} unavailable (${err.message});` +
                  ' refusals may be incomplete');
      break;
    }
    const items = Array.isArray(doc.items) ? doc.items : [];
    if (!items.length) break;
    scanned += items.length;

    for (const item of items) {
      if (item.status === 'ok') continue;
      const event = await confirmRevert(provider, item.hash);
      if (event) confirmed.push(event);
      else unconfirmed += 1;
    }

    const last = items[items.length - 1];
    if ((last.block_number ?? 0) < fromBlock) break;
    const next = doc.next_page_params;
    if (!next) break;
    url = EXPLORER_API + '&' + new URLSearchParams(next).toString();
  }

  console.log(`  explorer index: ${scanned} transactions scanned`);
  if (unconfirmed) {
    console.log(`  ${unconfirmed} flagged by the index but not confirmed by a ` +
                'receipt — not emitted');
  }
  return confirmed;
}

async function subscribe() {
  const ep = endpoint('wss');
  if (!ep) {
    console.log('XRPL_EVM_WSS_URL is not set, and no public XRPL EVM WebSocket');
    console.log('is assumed. Set it to a QuickNode endpoint, or use --backfill.');
    return 2;
  }
  console.log(`subscribing via ${ep.provider}`);
  const provider = new ethers.WebSocketProvider(ep.url);
  const filter = { address: LEDGER_ADDRESS, topics: [TOPIC0] };
  const seen = [];

  provider.on(filter, async (log) => {
    const block = await provider.getBlock(log.blockNumber);
    let event;
    try { event = toEvent(log, block.timestamp); }
    catch (err) {
      console.log(`log in block ${log.blockNumber} did not fit the layout: ${err.message}`);
      return;
    }
    seen.push(event);
    console.log(`voucher redeemed, block ${log.blockNumber}, tx ${log.transactionHash}`);
    writeDoc(seen, ep.provider);
  });

  // A block subscription, which this file's header argues against for events,
  // is the only way to catch a refusal. The argument stands for both reasons:
  // a log filter is right for events because every message concerns us, and a
  // refusal emits no log, so there is no filter that can match one. Here each
  // block is opened, not animated — only PaymentLedger calls are looked at,
  // and only those whose receipt says status 0 become events.
  provider.on('block', async (blockNumber) => {
    let block;
    try { block = await provider.getBlock(blockNumber, true); }
    catch { return; }
    for (const hash of block.transactions) {
      let tx;
      try { tx = await provider.getTransaction(hash); }
      catch { continue; }
      if (!tx || !tx.to || tx.to.toLowerCase() !== LEDGER_ADDRESS.toLowerCase()) continue;
      const event = await confirmRevert(provider, hash).catch(() => null);
      if (!event) continue; // it succeeded; the log filter above reports it
      seen.push(event);
      console.log(`ledger refused, block ${blockNumber}, tx ${hash}`);
      writeDoc(seen, ep.provider);
    }
  });

  console.log('waiting on redeemed vouchers and refusals. Ctrl-C to stop.');
  await new Promise(() => {});
  return 0;
}

async function selfTest() {
  const ep = endpoint('wss');
  if (!ep) {
    console.log('XRPL_EVM_WSS_URL is not set, so there is no socket to test.');
    console.log('This is not a failure; it is an unset endpoint.');
    return 2;
  }
  console.log(`connecting to ${ep.provider}`);
  const provider = new ethers.WebSocketProvider(ep.url);
  const got = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 30000);
    provider.once('block', (n) => { clearTimeout(timer); resolve(n); });
  });
  await provider.destroy();
  if (got === null) {
    console.log('no block arrived inside 30s — connected but pushed nothing');
    return 1;
  }
  console.log(`  pushed block ${got}`);
  console.log('ok: the socket pushes.');
  return 0;
}

// Exported so the decode and refusal paths can be exercised without running
// the CLI. Importing this file must not start a subscription.
export { toEvent, decodeLog, refusalEvent, confirmRevert, endpoint, TOPIC0 };

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--backfill');
  const run =
    argv.includes('--self-test') ? selfTest()
    : i !== -1 ? backfill(Number(argv[i + 1] ?? 9000))
    : subscribe();

  run.then((code) => process.exit(code)).catch((err) => {
    console.error('failed:', err.shortMessage || err.message);
    process.exit(1);
  });
}

// Run only when this file IS the program, not when something imports it.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

// Open an RLUSD trust line on the classic XRPL testnet wallet.
// Default: prepare + preview only. Pass --confirm to sign and submit.
import * as fs from 'node:fs';
import { Client, Wallet, dropsToXrp } from 'xrpl';

const env = Object.fromEntries(
  fs.readFileSync('.env','utf8').split('\n').filter(Boolean).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')];
  })
);
const ISSUER   = 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV';
const CURRENCY = '524C555344000000000000000000000000000000';
const LIMIT    = process.env.RLUSD_LIMIT ?? '1000000';
const CONFIRMED = process.argv.includes('--confirm');

const wallet = Wallet.fromSeed(env.XRPL_SEED);
const client = new Client('wss://s.altnet.rippletest.net:51233');
await client.connect();
try {
  const tx = {
    TransactionType: 'TrustSet',
    Account: wallet.classicAddress,
    LimitAmount: { currency: CURRENCY, issuer: ISSUER, value: LIMIT },
    SourceTag: 20260530,
  };
  const prepared = await client.autofill(tx);
  const idx = await client.getLedgerIndex();
  const ledgersLeft = prepared.LastLedgerSequence - idx;

  console.log('─── XRPL Transaction Preview ───────────────────────────────────────');
  console.log('Network           : testnet');
  console.log('Type              : TrustSet');
  console.log('From              : ' + prepared.Account);
  console.log('To                : —');
  console.log('Amount            : — (trust line limit, not a transfer)');
  console.log('Fee               : ' + dropsToXrp(prepared.Fee) + ' XRP (' + prepared.Fee + ' drops)');
  console.log('Sequence          : ' + prepared.Sequence);
  console.log('LastLedgerSequence: ' + prepared.LastLedgerSequence +
              '  (expires in ~' + ledgersLeft + ' ledgers / ~' + ledgersLeft * 4 + 's)');
  console.log('Flags             : ' + (prepared.Flags ?? 0));
  console.log('Memos             : —');
  console.log('Other fields      :');
  console.log('   LimitAmount.currency : ' + CURRENCY + '  ("RLUSD")');
  console.log('   LimitAmount.issuer   : ' + ISSUER);
  console.log('   LimitAmount.value    : ' + LIMIT);
  console.log('   SourceTag            : ' + prepared.SourceTag);
  console.log('─────────────────────────────────────────────────────────────────────');

  if (!CONFIRMED) {
    console.log('PREVIEW ONLY — nothing signed, nothing submitted.');
    console.log('To execute: node trustset-rlusd.mjs --confirm');
    process.exit(0);
  }

  const signed = wallet.sign(prepared);
  console.log('hash              : ' + signed.hash + '   (persisted before submit)');
  const res = await client.submitAndWait(signed.tx_blob);
  const code = res.result.meta.TransactionResult;
  console.log('result            : ' + code);
  console.log('validated ledger  : ' + res.result.ledger_index);
  if (code !== 'tesSUCCESS') process.exit(1);
  const lines = await client.request({ command:'account_lines', account: wallet.classicAddress, ledger_index:'validated' });
  for (const l of lines.result.lines) console.log('trust line        : ' + l.currency + ' / ' + l.account + ' limit=' + l.limit);
} finally { await client.disconnect(); }

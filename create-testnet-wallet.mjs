// Generate an XRPL Testnet wallet, save the seed to .env, fund it from the faucet.
// The seed is written straight to .env and is never printed.
import * as fs from 'node:fs';
import { Client, Wallet, dropsToXrp } from 'xrpl';

const TESTNET = 'wss://s.altnet.rippletest.net:51233';

// Guard: don't clobber an existing XRPL_SEED.
const envBefore = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
if (/^\s*XRPL_SEED\s*=/m.test(envBefore)) {
  console.error('XRPL_SEED is already set in .env — aborting so nothing is overwritten.');
  process.exit(1);
}

// 1. Generate
const wallet = Wallet.generate();

// 2. Make sure .env is git-ignored
const gitignorePath = '.gitignore';
const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
if (!gitignore.split('\n').map((l) => l.trim()).includes('.env')) {
  const prefix = gitignore.length && !gitignore.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(gitignorePath, `${prefix}.env\n`, 'utf8');
}

// 3. Persist the seed immediately
const prefix = envBefore.length && !envBefore.endsWith('\n') ? '\n' : '';
fs.appendFileSync('.env', `${prefix}XRPL_SEED="${wallet.seed}"\n`, 'utf8');

// 4. Fund from the Testnet faucet and verify on-ledger
const client = new Client(TESTNET);
await client.connect();
try {
  await client.fundWallet(wallet);
  const info = await client.request({
    command: 'account_info',
    account: wallet.classicAddress,
    ledger_index: 'validated',
  });
  console.log('network        : testnet');
  console.log('address        : ' + wallet.classicAddress);
  console.log('public key     : ' + wallet.publicKey);
  console.log('key type       : ' + wallet.algorithm);
  console.log('balance        : ' + dropsToXrp(info.result.account_data.Balance) + ' XRP');
  console.log('sequence       : ' + info.result.account_data.Sequence);
  console.log('ledger_index   : ' + info.result.ledger_index);
  console.log('seed           : saved to .env as XRPL_SEED (not printed)');
} finally {
  await client.disconnect();
}

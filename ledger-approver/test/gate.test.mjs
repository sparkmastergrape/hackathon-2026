import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, decode, hashes } from 'xrpl';
const ECDSA = { secp256k1: 'ecdsa-secp256k1' };
import { Gate, GateError } from '../server/gate.mjs';
import { DEFAULT_POLICY } from '../server/policy.mjs';
import { toXrplPublicKey } from '../shared/keys.mjs';

// secp256k1 point decompression (test helper, avoids a crypto dependency)
const P = 2n ** 256n - 2n ** 32n - 977n;
const modpow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
function uncompress(compressedHex) {
  const x = BigInt('0x' + compressedHex.slice(2));
  let y = modpow((modpow(x, 3n, P) + 7n) % P, (P + 1n) / 4n, P);
  if ((y % 2n === 0n) !== (compressedHex.startsWith('02'))) y = P - y;
  return '04' + x.toString(16).padStart(64, '0') + y.toString(16).padStart(64, '0');
}

const POLICY = { ...DEFAULT_POLICY, perTxCapXrp: 50, dailyCapXrp: 100 };
const merchant = Wallet.generate(ECDSA.secp256k1);
const stranger = Wallet.generate(ECDSA.secp256k1);

function setup(extra = {}) {
  const submitted = [];
  let clock = 1_000_000;
  const ledger = {
    async prepare(tx) { return { ...tx, Sequence: 7, Fee: '12', LastLedgerSequence: 5000 }; },
    async submit(blob) { submitted.push(blob); return { hash: hashes.hashSignedTx(blob), engineResult: extra.engineResult ?? 'tesSUCCESS' }; },
  };
  const hot = Wallet.generate(ECDSA.secp256k1);
  const device = Wallet.generate(ECDSA.secp256k1); // stands in for the Ledger-controlled account
  const gate = new Gate({ ledger, hotWallet: hot, policy: POLICY, now: () => clock, knownDestinations: [merchant.address], ...extra.gate });
  return { gate, submitted, hot, device, tick: (ms) => { clock += ms; } };
}
const intent = (o = {}) => ({ end_to_end_id: `e2e-${Math.random()}`, destination: merchant.address, amountXrp: 10, risk: 'low', health: 'healthy', ...o });
// What the device does: sign the serialized transaction bytes. Here a software key stands in.
const deviceSign = (wallet, prepared) => decode(wallet.sign({ ...prepared, SigningPubKey: wallet.publicKey }).tx_blob).TxnSignature;

test('small payment to a known destination is auto-released from the hot wallet', async () => {
  const { gate, submitted, hot } = setup();
  const v = await gate.submitIntent(intent());
  assert.equal(v.state, 'CONFIRMED');
  assert.equal(submitted.length, 1);
  assert.equal(decode(submitted[0]).Account, hot.address);
});

test('above-cap payment waits for approval and nothing is submitted', async () => {
  const { gate, submitted } = setup();
  const v = await gate.submitIntent(intent({ amountXrp: 75 }));
  assert.equal(v.state, 'PENDING_APPROVAL');
  assert.deepEqual(v.decision.reasons.map((r) => r.code), ['OVER_TX_CAP']);
  assert.equal(submitted.length, 0);
});

test('full human path: approve, sign on device, verify, submit', async () => {
  const { gate, submitted, device } = setup();
  const v = await gate.submitIntent(intent({ amountXrp: 75, end_to_end_id: 'big-1' }));
  const a = await gate.approve(v.id, { address: device.address, publicKey: device.publicKey });
  assert.equal(a.tx.Account, device.address);
  assert.equal(a.tx.Amount, '75000000');
  assert.equal(gate.get(v.id).state, 'APPROVED');
  const done = await gate.submitSignature(v.id, deviceSign(device, a.tx));
  assert.equal(done.state, 'CONFIRMED');
  assert.equal(decode(submitted[0]).Account, device.address);
  assert.equal(decode(submitted[0]).Memos.length, 1);
});

test('a signature from a different key is rejected and nothing is submitted', async () => {
  const { gate, submitted, device } = setup();
  const v = await gate.submitIntent(intent({ amountXrp: 75 }));
  const a = await gate.approve(v.id, { address: device.address, publicKey: device.publicKey });
  await assert.rejects(() => gate.submitSignature(v.id, deviceSign(stranger, a.tx)), (e) => e instanceof GateError && e.code === 'BAD_SIGNATURE');
  assert.equal(submitted.length, 0);
  assert.equal(gate.get(v.id).state, 'APPROVED');
});

test('public key must derive the stated address', async () => {
  const { gate, device } = setup();
  const v = await gate.submitIntent(intent({ amountXrp: 75 }));
  await assert.rejects(() => gate.approve(v.id, { address: device.address, publicKey: stranger.publicKey }), (e) => e.code === 'PUBKEY_ADDRESS_MISMATCH');
});

test('only the registered approver can approve', async () => {
  const { gate } = setup({ gate: { approverAddress: stranger.address } });
  const device = Wallet.generate(ECDSA.secp256k1);
  const v = await gate.submitIntent(intent({ amountXrp: 75 }));
  await assert.rejects(() => gate.approve(v.id, { address: device.address, publicKey: device.publicKey }), (e) => e.code === 'NOT_REGISTERED_APPROVER');
});

test('hard blocks cannot be approved', async () => {
  const { gate, device, submitted } = setup();
  const v = await gate.submitIntent(intent({ risk: 'blocked', amountXrp: 75 }));
  assert.equal(v.state, 'BLOCKED');
  await assert.rejects(() => gate.approve(v.id, { address: device.address, publicKey: device.publicKey }), (e) => e.code === 'BAD_STATE');
  assert.equal(submitted.length, 0);
  const c = await gate.submitIntent(intent({ health: 'critical' }));
  assert.equal(c.state, 'BLOCKED');
});

test('same end_to_end_id is idempotent: no second release', async () => {
  const { gate, submitted } = setup();
  const i = intent({ end_to_end_id: 'dup-1' });
  await gate.submitIntent(i);
  const again = await gate.submitIntent(i);
  assert.equal(again.duplicate, true);
  assert.equal(submitted.length, 1);
});

test('rolling daily total pushes the next payment to approval', async () => {
  const { gate } = setup();
  assert.equal((await gate.submitIntent(intent({ amountXrp: 45 }))).state, 'CONFIRMED');
  assert.equal((await gate.submitIntent(intent({ amountXrp: 45 }))).state, 'CONFIRMED');
  const third = await gate.submitIntent(intent({ amountXrp: 45 }));
  assert.equal(third.state, 'PENDING_APPROVAL');
  assert.ok(third.decision.reasons.some((r) => r.code === 'OVER_DAILY_CAP'));
});

test('undecided intents expire and can no longer be approved', async () => {
  const { gate, device, tick } = setup();
  const v = await gate.submitIntent(intent({ amountXrp: 75 }));
  tick(16 * 60 * 1000);
  assert.equal(gate.get(v.id).state, 'EXPIRED');
  await assert.rejects(() => gate.approve(v.id, { address: device.address, publicKey: device.publicKey }), (e) => e.code === 'BAD_STATE');
});

test('rejecting stops the payment', async () => {
  const { gate, submitted } = setup();
  const v = await gate.submitIntent(intent({ amountXrp: 75 }));
  assert.equal(gate.reject(v.id).state, 'REJECTED');
  assert.equal(submitted.length, 0);
});

test('ledger failure after signing is recorded as FAILED', async () => {
  const { gate, device } = setup({ engineResult: 'tecUNFUNDED_PAYMENT' });
  const v = await gate.submitIntent(intent({ amountXrp: 75 }));
  const a = await gate.approve(v.id, { address: device.address, publicKey: device.publicKey });
  const done = await gate.submitSignature(v.id, deviceSign(device, a.tx));
  assert.equal(done.state, 'FAILED');
  assert.equal(done.engineResult, 'tecUNFUNDED_PAYMENT');
});

test('input validation', async () => {
  const { gate } = setup();
  await assert.rejects(() => gate.submitIntent(intent({ destination: 'nope' })), (e) => e.code === 'BAD_INPUT');
  await assert.rejects(() => gate.submitIntent(intent({ amountXrp: -1 })), (e) => e.code === 'BAD_INPUT');
  await assert.rejects(() => gate.submitIntent(intent({ end_to_end_id: '' })), (e) => e.code === 'BAD_INPUT');
  await assert.rejects(() => gate.submitIntent(intent({ destinationTag: 1.5 })), (e) => e.code === 'BAD_INPUT');
});

test('uncompressed device public key converts to the compressed XRPL form', () => {
  for (let n = 0; n < 20; n++) {
    const w = Wallet.generate(ECDSA.secp256k1);
    const uncompressed = uncompress(w.publicKey).toUpperCase();
    assert.equal(uncompressed.length, 130);
    assert.equal(toXrplPublicKey(uncompressed), w.publicKey);
    assert.equal(toXrplPublicKey(w.publicKey), w.publicKey);
  }
  assert.throws(() => toXrplPublicKey('1234'));
});

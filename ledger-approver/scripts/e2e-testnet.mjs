// End-to-end run against the XRPL testnet with a SOFTWARE key standing in for the Ledger.
// Proves the gate (policy, build, verify, submit) works on the real network before you involve a device.
// Run: npm run e2e
import { Wallet, decode } from 'xrpl';
import { Gate, XrplLedger } from '../server/gate.mjs';

const ledger = new XrplLedger();
const hot = (await ledger.fund(null)).wallet;
const merchant = (await ledger.fund(null)).wallet;
const device = (await ledger.fund(Wallet.generate('ecdsa-secp256k1'))).wallet; // same key type the Ledger XRP app uses
const gate = new Gate({ ledger, hotWallet: hot, knownDestinations: [merchant.address] });
const show = (label, v) => console.log(label.padEnd(34), v.state, v.txHash ?? v.decision.reasons.map((r) => r.code).join(','));

const n = Date.now().toString(36);
show('small payment (auto-release)', await gate.submitIntent({ end_to_end_id: `s-${n}`, destination: merchant.address, amountXrp: 5, risk: 'low', health: 'healthy' }));
show('sanctioned (hard block)', await gate.submitIntent({ end_to_end_id: `b-${n}`, destination: merchant.address, amountXrp: 5, risk: 'blocked', health: 'healthy' }));

const big = await gate.submitIntent({ end_to_end_id: `l-${n}`, destination: merchant.address, amountXrp: 75, risk: 'low', health: 'healthy' });
show('above cap (waits)', big);
const a = await gate.approve(big.id, { address: device.address, publicKey: device.publicKey });
// The device would sign these exact bytes. Here the software key does it.
const sig = decode(device.sign({ ...a.tx, SigningPubKey: device.publicKey }).tx_blob).TxnSignature;
show('above cap (signed and submitted)', await gate.submitSignature(big.id, sig));
await ledger.disconnect();

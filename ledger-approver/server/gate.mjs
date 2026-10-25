// Approval gate: policy decision, intent queue, state machine, and the release path.
// Above-cap and flagged payments are paid from the Ledger-controlled account and can only
// be released with a signature produced on the device. Everything else is paid from a
// service-controlled hot wallet.
import { Client, Wallet, xrpToDrops, encode, decode, verifySignature, deriveAddress, isValidClassicAddress, hashes } from 'xrpl';
import { evaluate, DEFAULT_POLICY } from './policy.mjs';

export const TESTNET_WS = 'wss://s.altnet.rippletest.net:51233';
// autofill gives ~1 minute; the demo allows ~10 minutes (150 ledgers at ~4s) for a human to approve.
const LLS_WINDOW_LEDGERS = Number(process.env.LLS_WINDOW_LEDGERS ?? 150);
const INTENT_TTL_MS = Number(process.env.INTENT_TTL_MS ?? 15 * 60 * 1000); // placeholder
const DAY_MS = 24 * 60 * 60 * 1000;
const hex = (s) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();

export class GateError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export class XrplLedger {
  constructor(url = TESTNET_WS) { this.client = new Client(url); }
  async connect() { if (!this.client.isConnected()) await this.client.connect(); }
  async prepare(tx) {
    await this.connect();
    const prepared = await this.client.autofill(tx);
    prepared.LastLedgerSequence = (await this.client.getLedgerIndex()) + LLS_WINDOW_LEDGERS;
    return prepared;
  }
  async submit(blob) {
    await this.connect();
    const r = await this.client.submitAndWait(blob);
    const meta = r.result.meta;
    return { hash: r.result.hash, engineResult: typeof meta === 'object' ? meta.TransactionResult : String(meta) };
  }
  async fund(wallet) {
    await this.connect();
    return this.client.fundWallet(wallet ?? null);
  }
  async disconnect() { if (this.client.isConnected()) await this.client.disconnect(); }
}

export class Gate {
  constructor({ ledger, hotWallet = null, policy = DEFAULT_POLICY, now = () => Date.now(), approverAddress = process.env.APPROVER_ADDRESS || null, knownDestinations = [] } = {}) {
    this.ledger = ledger;
    this.hotWallet = hotWallet;
    this.policy = policy;
    this.now = now;
    this.approverAddress = approverAddress; // if null, the first approver to connect is trusted (demo only)
    this.known = new Set(knownDestinations);
    this.intents = new Map();
  }

  // ---- queries ----
  list() { this.#sweep(); return [...this.intents.values()].map((r) => this.view(r)).reverse(); }
  get(id) {
    this.#sweep();
    const r = this.intents.get(id);
    if (!r) throw new GateError('NOT_FOUND', 'Unknown intent.', 404);
    return this.view(r);
  }
  view(r) {
    return {
      id: r.id, state: r.state, createdAt: r.createdAt, expiresAt: r.expiresAt,
      input: r.input, decision: r.decision, approver: r.approver ?? null,
      tx: r.state === 'APPROVED' ? r.prepared : null,
      txHash: r.txHash ?? null, engineResult: r.engineResult ?? null, error: r.error ?? null,
      history: r.history,
    };
  }
  dailyTotalXrp() {
    const since = this.now() - DAY_MS;
    let total = 0;
    for (const r of this.intents.values()) {
      if (['SUBMITTED', 'CONFIRMED'].includes(r.state) && r.releasedAt >= since) total += r.input.amountXrp;
    }
    return total;
  }

  // ---- create ----
  async submitIntent(input) {
    const v = this.#validate(input);
    const existing = this.intents.get(v.end_to_end_id);
    if (existing) return { ...this.view(existing), duplicate: true }; // idempotent on end_to_end_id

    const ctx = { risk: v.risk, health: v.health, dailyTotalXrp: this.dailyTotalXrp(), knownDestinations: this.known };
    const decision = evaluate(v, ctx, this.policy);
    const t = this.now();
    const r = { id: v.end_to_end_id, input: v, decision, createdAt: t, expiresAt: t + INTENT_TTL_MS, state: 'NEW', history: [] };
    this.intents.set(r.id, r);
    this.#move(r, 'NEW', `policy: ${decision.outcome}`);

    if (decision.outcome === 'block') this.#move(r, 'BLOCKED', decision.reasons.map((x) => x.code).join(','));
    else if (decision.outcome === 'approval') this.#move(r, 'PENDING_APPROVAL', decision.reasons.map((x) => x.code).join(','));
    else await this.#autoRelease(r);
    return this.view(r);
  }

  // ---- human path ----
  // Step 1: the approver accepts the intent. We build the transaction now (fresh sequence, fee and
  // a bounded LastLedgerSequence) so it does not expire while a person decides.
  async approve(id, { address, publicKey }) {
    this.#sweep();
    const r = this.#must(id, ['PENDING_APPROVAL']);
    if (!isValidClassicAddress(address ?? '')) throw new GateError('BAD_ADDRESS', 'Approver address is not a valid XRPL address.');
    if (typeof publicKey !== 'string' || !/^[0-9a-fA-F]{66}$/.test(publicKey)) {
      throw new GateError('BAD_PUBLIC_KEY', 'Public key must be a 33-byte compressed key in hex (66 characters).');
    }
    const pub = publicKey.toUpperCase();
    if (deriveAddress(pub) !== address) throw new GateError('PUBKEY_ADDRESS_MISMATCH', 'Public key does not derive the stated address.');
    if (this.approverAddress && this.approverAddress !== address) throw new GateError('NOT_REGISTERED_APPROVER', 'This device account is not the registered approver.', 403);
    if (!this.approverAddress) this.approverAddress = address; // demo: trust on first use
    if (address === r.input.destination) throw new GateError('SELF_PAYMENT', 'Approver account cannot be the destination.');

    const tx = {
      TransactionType: 'Payment', Account: address, Destination: r.input.destination,
      Amount: xrpToDrops(String(r.input.amountXrp)), SigningPubKey: pub,
      Memos: [{ Memo: { MemoType: hex('obsidian/e2e'), MemoData: hex(r.id) } }],
    };
    if (r.input.destinationTag !== undefined) tx.DestinationTag = r.input.destinationTag;
    let prepared;
    try { prepared = await this.ledger.prepare(tx); }
    catch (e) { throw new GateError('PREPARE_FAILED', `Could not prepare the transaction: ${e.message}`, 502); }

    r.prepared = prepared;
    r.approver = address;
    this.#move(r, 'APPROVED', `approver ${address}`);
    return { intentId: r.id, tx: prepared, txHex: encode(prepared) };
  }

  // Step 2: the device signed the bytes from step 1. Attach, verify, submit.
  async submitSignature(id, signatureHex) {
    const r = this.#must(id, ['APPROVED']);
    if (typeof signatureHex !== 'string' || !/^[0-9a-fA-F]+$/.test(signatureHex)) throw new GateError('BAD_SIGNATURE', 'Signature must be hex.');
    const signed = { ...r.prepared, TxnSignature: signatureHex.toUpperCase() };
    const blob = encode(signed);
    let valid = false;
    try { valid = verifySignature(blob); } catch { valid = false; }
    if (!valid) throw new GateError('BAD_SIGNATURE', 'Signature does not verify against the approver public key.', 422);
    if (decode(blob).Account !== r.approver) throw new GateError('WRONG_SIGNER', 'Signed account is not the approver.', 422);

    r.releasedAt = this.now();
    this.#move(r, 'SUBMITTED', 'signed on device');
    await this.#submitBlob(r, blob);
    return this.view(r);
  }

  reject(id, reason = 'rejected by approver') {
    this.#sweep();
    const r = this.#must(id, ['PENDING_APPROVAL', 'APPROVED']);
    this.#move(r, 'REJECTED', reason);
    return this.view(r);
  }

  // ---- internals ----
  async #autoRelease(r) {
    if (!this.hotWallet) { r.error = 'No hot wallet configured.'; this.#move(r, 'FAILED', 'NO_HOT_WALLET'); return; }
    try {
      const tx = {
        TransactionType: 'Payment', Account: this.hotWallet.address, Destination: r.input.destination,
        Amount: xrpToDrops(String(r.input.amountXrp)),
        Memos: [{ Memo: { MemoType: hex('obsidian/e2e'), MemoData: hex(r.id) } }],
      };
      if (r.input.destinationTag !== undefined) tx.DestinationTag = r.input.destinationTag;
      const prepared = await this.ledger.prepare(tx);
      const { tx_blob } = this.hotWallet.sign(prepared);
      r.releasedAt = this.now();
      this.#move(r, 'SUBMITTED', 'auto-released from hot wallet');
      await this.#submitBlob(r, tx_blob);
    } catch (e) {
      r.error = e.message;
      this.#move(r, 'FAILED', e.message);
    }
  }
  async #submitBlob(r, blob) {
    try {
      const res = await this.ledger.submit(blob);
      r.txHash = res.hash ?? hashes.hashSignedTx(blob);
      r.engineResult = res.engineResult;
      if (res.engineResult === 'tesSUCCESS') { this.known.add(r.input.destination); this.#move(r, 'CONFIRMED', r.txHash); }
      else { r.error = res.engineResult; this.#move(r, 'FAILED', res.engineResult); }
    } catch (e) {
      r.error = e.message;
      this.#move(r, 'FAILED', e.message);
    }
  }
  #sweep() {
    const t = this.now();
    for (const r of this.intents.values()) {
      if (['PENDING_APPROVAL', 'APPROVED'].includes(r.state) && t > r.expiresAt) this.#move(r, 'EXPIRED', 'no decision in time');
    }
  }
  #must(id, states) {
    const r = this.intents.get(id);
    if (!r) throw new GateError('NOT_FOUND', 'Unknown intent.', 404);
    if (!states.includes(r.state)) throw new GateError('BAD_STATE', `Intent is ${r.state}; expected ${states.join(' or ')}.`, 409);
    return r;
  }
  #move(r, state, note) { r.state = state; r.history.push({ at: this.now(), state, note }); }
  #validate(i) {
    if (!i || typeof i !== 'object') throw new GateError('BAD_INPUT', 'Body must be a JSON object.');
    const out = {
      end_to_end_id: String(i.end_to_end_id ?? '').trim(), destination: i.destination,
      amountXrp: Number(i.amountXrp), risk: i.risk, health: i.health,
    };
    if (!out.end_to_end_id) throw new GateError('BAD_INPUT', 'end_to_end_id is required.');
    if (!isValidClassicAddress(out.destination ?? '')) throw new GateError('BAD_INPUT', 'destination is not a valid XRPL address.');
    if (!Number.isFinite(out.amountXrp) || out.amountXrp <= 0) throw new GateError('BAD_INPUT', 'amountXrp must be a positive number.');
    if (i.destinationTag !== undefined) {
      if (!Number.isInteger(i.destinationTag) || i.destinationTag < 0 || i.destinationTag > 4294967295) throw new GateError('BAD_INPUT', 'destinationTag must be a 32-bit unsigned integer.');
      out.destinationTag = i.destinationTag;
    }
    if (i.amountUsd !== undefined) out.amountUsd = Number(i.amountUsd);
    if (i.travelRuleAttached !== undefined) out.travelRuleAttached = Boolean(i.travelRuleAttached);
    if (i.note !== undefined) out.note = String(i.note).slice(0, 200);
    return out;
  }
}

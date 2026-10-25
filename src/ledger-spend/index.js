// Spend Ledger — the quantitative half of the policy layer.
//
// Tracks what a mandate has actually spent, enforces the aggregate and rate
// caps, and derives AP4M's cumulative voucher amounts.
//
// Two things make this more than a counter:
//
// 1. RESERVE BEFORE PAYING. A check followed later by a write lets two
//    concurrent tool calls each pass a cap that only one should (ARCHITECTURE
//    §7 T5). `reserve()` performs the check and the write in one synchronous
//    step and is the single enforcement point; `commit()` or `release()` then
//    resolves the outcome. An uncommitted reservation still counts against the
//    caps, so the pessimistic case is refusing a payment, never overspending.
//
// 2. AP4M VOUCHERS ARE CUMULATIVE PER CHANNEL — a running total, not a per-
//    payment amount. A per-payment model silently overpays. `reserve()`
//    therefore returns the `cumulativeAmount` to put in the voucher.
//
// In-process and synchronous. Node's single thread makes "atomic" free here,
// but a multi-process deployment needs a real lock or a conditional write —
// stated plainly rather than implied. See `assertSingleWriter`.

let counter = 0;

export class SpendLedger {
  /**
   * @param {object} [opts]
   * @param {() => number} [opts.now] seconds-resolution clock, injectable for tests
   */
  constructor({ now = () => Math.floor(Date.now() / 1000) } = {}) {
    this.now = now;
    /** @type {Map<string, {entries: Array<{ts:number, amount:bigint, state:string, id:string, channelId?:string, txHash?:string}>}>} */
    this.byMandate = new Map();
    /** @type {Map<string, bigint>} committed cumulative total per AP4M channel */
    this.channelCumulative = new Map();
    /** @type {Map<string, object>} */
    this.reservations = new Map();
  }

  _mandate(mandateId) {
    if (!this.byMandate.has(mandateId)) this.byMandate.set(mandateId, { entries: [] });
    return this.byMandate.get(mandateId);
  }

  /** Amounts that count against caps: committed and still-pending reservations. */
  _live(mandateId) {
    return this._mandate(mandateId).entries.filter(
      (e) => e.state === "committed" || e.state === "reserved",
    );
  }

  /**
   * A snapshot the Guard can evaluate against. Pure read.
   * @returns {{total: bigint, window: bigint, windowSeconds: number, pending: number, committed: number}}
   */
  snapshot(mandateId, { windowSeconds } = {}) {
    const live = this._live(mandateId);
    const total = live.reduce((a, e) => a + e.amount, 0n);
    const cutoff = windowSeconds ? this.now() - Number(windowSeconds) : null;
    const window =
      cutoff === null ? 0n : live.filter((e) => e.ts > cutoff).reduce((a, e) => a + e.amount, 0n);
    return {
      total,
      window,
      windowSeconds: windowSeconds ? Number(windowSeconds) : 0,
      pending: live.filter((e) => e.state === "reserved").length,
      committed: live.filter((e) => e.state === "committed").length,
    };
  }

  /** Committed cumulative total for an AP4M channel (what the ledger contract has seen). */
  committedCumulative(channelId) {
    return this.channelCumulative.get(channelId) ?? 0n;
  }

  /**
   * Cumulative total including reservations in flight — what the NEXT voucher
   * must build on. Using the committed figure alone would reuse a cumulative
   * value already claimed by a pending voucher.
   */
  pendingCumulative(channelId) {
    let v = this.committedCumulative(channelId);
    for (const r of this.reservations.values()) {
      if (r.channelId === channelId && r.state === "reserved") v += r.amount;
    }
    return v;
  }

  /**
   * Check the caps and reserve in one step. This is the enforcement point.
   *
   * @param {object} p
   * @param {string} p.mandateId
   * @param {bigint} p.amount                 this payment, in asset base units
   * @param {object} p.caps                   { maxPerCall, maxTotal, maxPerWindow, windowSeconds }
   * @param {string} [p.channelId]            AP4M channel, for cumulative derivation
   * @param {bigint} [p.channelCap]           on-chain channel ceiling, if known
   * @returns {{ok:true, reservationId:string, cumulativeAmount?:bigint, snapshot:object}
   *          | {ok:false, code:string, detail:object}}
   */
  reserve({ mandateId, amount, caps, channelId, channelCap }) {
    amount = BigInt(amount);
    if (amount <= 0n) return { ok: false, code: "NON_POSITIVE_AMOUNT", detail: { amount } };

    const maxPerCall = BigInt(caps.maxPerCall);
    const maxTotal = BigInt(caps.maxTotal);
    const maxPerWindow = BigInt(caps.maxPerWindow);
    const windowSeconds = Number(caps.windowSeconds);

    if (amount > maxPerCall)
      return { ok: false, code: "OVER_PER_CALL", detail: { amount, maxPerCall } };

    const snap = this.snapshot(mandateId, { windowSeconds });

    if (snap.total + amount > maxTotal)
      return {
        ok: false,
        code: "OVER_TOTAL",
        detail: { spent: snap.total, amount, maxTotal, remaining: maxTotal - snap.total },
      };

    if (snap.window + amount > maxPerWindow)
      return {
        ok: false,
        code: "OVER_WINDOW",
        detail: {
          inWindow: snap.window,
          amount,
          maxPerWindow,
          windowSeconds,
          remaining: maxPerWindow - snap.window,
        },
      };

    let cumulativeAmount;
    if (channelId) {
      cumulativeAmount = this.pendingCumulative(channelId) + amount;
      if (channelCap !== undefined && cumulativeAmount > BigInt(channelCap))
        return {
          ok: false,
          code: "OVER_CHANNEL_CAP",
          detail: { cumulativeAmount, channelCap: BigInt(channelCap), channelId },
        };
    }

    const id = `rsv_${++counter}_${this.now()}`;
    const entry = {
      id,
      ts: this.now(),
      amount,
      state: "reserved",
      mandateId,
      channelId,
      cumulativeAmount,
    };
    this._mandate(mandateId).entries.push(entry);
    this.reservations.set(id, entry);
    return {
      ok: true,
      reservationId: id,
      cumulativeAmount,
      snapshot: this.snapshot(mandateId, { windowSeconds }),
    };
  }

  /** Confirm a reserved payment actually settled. */
  commit(reservationId, { txHash } = {}) {
    const r = this.reservations.get(reservationId);
    if (!r) throw new Error(`unknown reservation ${reservationId}`);
    if (r.state !== "reserved") throw new Error(`reservation ${reservationId} is ${r.state}`);
    r.state = "committed";
    r.txHash = txHash ?? null;
    r.committedAt = this.now();
    if (r.channelId && r.cumulativeAmount !== undefined) {
      // Cumulative totals only ever move forward.
      const prev = this.committedCumulative(r.channelId);
      if (r.cumulativeAmount > prev) this.channelCumulative.set(r.channelId, r.cumulativeAmount);
    }
    return r;
  }

  /**
   * Give back a reservation that did not result in a payment.
   *
   * Only safe when the payment definitely did not happen. If settlement state
   * is UNKNOWN, do not release — the money may have moved, and releasing would
   * let the agent spend it twice. Leave it reserved and reconcile on-chain.
   */
  release(reservationId, { reason } = {}) {
    const r = this.reservations.get(reservationId);
    if (!r) throw new Error(`unknown reservation ${reservationId}`);
    if (r.state !== "reserved") throw new Error(`reservation ${reservationId} is ${r.state}`);
    r.state = "released";
    r.releaseReason = reason ?? null;
    return r;
  }

  /** Every entry for a mandate, for receipts and the audit view. */
  history(mandateId) {
    return [...this._mandate(mandateId).entries];
  }

  /**
   * Seed state recovered from elsewhere (an on-chain channel already part-spent,
   * or a restart). Without this a restart would forget prior spend and hand the
   * agent a fresh budget.
   */
  seedChannel(channelId, committedCumulative) {
    this.channelCumulative.set(channelId, BigInt(committedCumulative));
  }

  seedCommitted({ mandateId, amount, ts, txHash, channelId, cumulativeAmount }) {
    this._mandate(mandateId).entries.push({
      id: `seed_${++counter}`,
      ts: ts ?? this.now(),
      amount: BigInt(amount),
      state: "committed",
      mandateId,
      channelId,
      cumulativeAmount: cumulativeAmount === undefined ? undefined : BigInt(cumulativeAmount),
      txHash: txHash ?? null,
    });
  }
}

/**
 * This implementation is correct for ONE process. Call this where a deployment
 * might run several, so the limitation fails loudly instead of silently
 * over-spending.
 */
export function assertSingleWriter(enabled = true) {
  if (!enabled)
    throw new Error(
      "SpendLedger is in-process only; a multi-writer deployment needs a conditional write or a lock (ARCHITECTURE §7 T5)",
    );
}

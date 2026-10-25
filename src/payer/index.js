// The payer: the only component that touches the network, and the only place
// where a Guard verdict turns into money moving.
//
// It is deliberately thin. x402 already defines the handshake and `@ap4m/sdk`
// already encodes the wire format; neither decides whether a payment SHOULD
// happen. That decision is `evaluate()` in src/guard, and the ordering here is
// the whole point:
//
//   GET -> 402 -> decode -> evaluate() -> reserve() -> sign voucher -> retry -> commit
//
// Three ordering rules, each of which is a bug if broken:
//   1. evaluate() runs before anything is reserved or signed. A DENY must cost
//      nothing and leave no trace in the spend ledger.
//   2. reserve() runs before the voucher is signed. A signed voucher is a bearer
//      instrument — once it leaves the process the money is gone — so the budget
//      is debited first. reserve() is the enforcement point; evaluate() only
//      explains (src/README.md, design decision 2).
//   3. release() runs on every failure path. An abandoned reservation that is
//      never released permanently shrinks the budget.
//
// `signer` is injected so one code path serves both the test (local key) and
// the demo (Ledger device). The payer never sees a private key.

import {
  buildX402PaymentPayload,
  encodeX402PaymentSignature,
  decodeX402PaymentRequired,
  decodeX402PaymentResponse,
} from "@ap4m/sdk";
import {
  evaluate,
  ALLOW,
  ESCALATE,
  DENY,
  amountFromAccepts,
  describeVerdict,
} from "../guard/index.js";
import { hashMandate } from "../mandate/index.js";
import { hashGrant } from "../mandate/grant.js";
import { HEADERS } from "../config/network.js";

/** Outcomes of buy(). `requires_confirmation` reuses the seam x402 SDKs already expose. */
export const PAID = "paid";
export const REQUIRES_CONFIRMATION = "requires_confirmation";
export const REFUSED = "refused";
export const FAILED = "failed";

/**
 * @param {object} cfg
 * @param {object}   cfg.mandate          EIP-712 typed data from buildMandate()
 * @param {boolean}  cfg.signatureValid   pre-resolved verifyMandate() result
 * @param {object}   cfg.ledger           SpendLedger instance
 * @param {string}   cfg.channelId        AP4M channel this agent pays through
 * @param {bigint}   [cfg.channelCap]     on-chain channel cap
 * @param {object}   cfg.signer            ethers-style signer: signTypedData(domain, types, value)
 * @param {object}   [cfg.policy]         extra Guard policy (expectedLedger, …)
 * @param {function} [cfg.fetchImpl]      injectable fetch
 * @param {function} [cfg.now]            () => unix seconds
 * @param {function} [cfg.onEvent]        audit sink; every verdict and payment passes through it
 * @param {function} [cfg.isRevoked]      (mandateId) => boolean
 */
export function createPayer({
  mandate,
  signatureValid,
  ledger,
  channelId,
  channelCap,
  signer,
  policy = {},
  fetchImpl = globalThis.fetch,
  now = () => Math.floor(Date.now() / 1000),
  onEvent = () => {},
  isRevoked = () => false,
}) {
  const mandateId = hashMandate(mandate);
  const windowSeconds = Number(mandate.message.windowSeconds);
  const audit = [];

  const emit = (event) => {
    audit.push(event);
    onEvent(event);
    return event;
  };

  /**
   * Attempt to buy `url`, paying automatically if and only if the Guard allows.
   * Never throws on a refusal — a refusal is a result, not an exception.
   */
  /**
   * @param {string} url
   * @param {object} [o]
   * @param {object} [o.init]   fetch init
   * @param {object} [o.grant]  a device-signed Grant resolving an earlier ESCALATE
   *                            for this exact payment (src/mandate/grant.js)
   * @param {boolean} [o.grantSignatureValid] resolved by the caller
   */
  async function buy(url, { init = {}, grant = null, grantSignatureValid = false } = {}) {
    const gid = grant ? hashGrant(grant) : null;
    // The channel id goes on the FIRST request as well as the retry: the
    // merchant needs it to build a challenge naming the right channel and its
    // accepted cumulative total. Omitting it gets you a 402 you cannot pay.
    const headers = { ...(init.headers ?? {}), [HEADERS.channelId]: channelId };
    const first = await fetchImpl(url, { ...init, headers });
    if (first.status !== 402)
      return emit({ outcome: PAID, url, free: true, status: first.status, response: first });

    const header = first.headers.get(HEADERS.required);
    if (!header)
      return emit({
        outcome: FAILED,
        url,
        code: "NO_CHALLENGE_HEADER",
        message: `402 without a ${HEADERS.required} header`,
      });

    let challenge;
    try {
      challenge = decodeX402PaymentRequired(header);
    } catch (e) {
      return emit({ outcome: FAILED, url, code: "UNDECODABLE_CHALLENGE", message: e.message });
    }

    // --- 1. decide, before touching the budget or the signer ---
    const verdict = evaluate({
      mandate,
      mandateId,
      signatureValid,
      revoked: isRevoked(mandateId),
      challenge,
      agent: mandate.message.agent,
      now: now(),
      spend: ledger.snapshot(mandateId, { windowSeconds }),
      channelCumulative: ledger.committedCumulative(channelId),
      channelCap,
      grant,
      grantId: gid,
      grantSignatureValid,
      grantConsumed: gid ? ledger.isGrantUsed(gid) : false,
      policy: { expectedChannelId: channelId, ...policy },
    });

    if (verdict.decision === DENY)
      return emit({ outcome: REFUSED, url, verdict, message: describeVerdict(verdict) });

    if (verdict.decision === ESCALATE)
      return emit({
        outcome: REQUIRES_CONFIRMATION,
        url,
        verdict,
        challenge,
        // Everything the approver UI needs to put a Grant on the device screen,
        // so the caller never has to re-parse the challenge to ask the question.
        ask: {
          mandateId,
          agent: mandate.message.agent,
          merchant: challenge.accepts[0].payTo,
          asset: mandate.message.asset,
          amount: amountFromAccepts(challenge.accepts[0]),
          resource: challenge.resource?.url ?? url,
        },
        message: describeVerdict(verdict),
      });

    if (verdict.decision !== ALLOW)
      return emit({ outcome: FAILED, url, code: "UNKNOWN_VERDICT", verdict });

    // --- 2. debit the budget BEFORE signing anything ---
    const accepted = challenge.accepts[0];
    const amount = amountFromAccepts(accepted);
    const reservation = ledger.reserve({
      mandateId,
      amount,
      caps: mandate.message,
      channelId,
      channelCap,
      // Only pass the grant through to the enforcement point if the Guard
      // actually allowed on its strength. A grant attached to a payment that
      // was within the envelope anyway must not be burned.
      ...(verdict.code === "WITHIN_GRANT" ? { grantId: gid, grantAmount: amount } : {}),
    });
    if (!reservation.ok)
      return emit({
        outcome: REFUSED,
        url,
        verdict: {
          decision: DENY,
          code: reservation.code,
          detail: reservation.detail,
          message: "reservation refused",
        },
        message: `reserve refused: ${reservation.code}`,
      });

    // --- 3. sign and submit; release the reservation on any failure ---
    try {
      // The SDK builds the payload: two typed-data signatures (the cumulative
      // Voucher, and an X402ResourceBinding over resourceDigest + voucherDigest)
      // plus canonical encoding. Letting it do that keeps this wrapper thin and
      // the wire format authoritative.
      //
      // But the SDK derives the voucher's cumulative total from the MERCHANT's
      // `extra.acceptedCumulativeAmount` — it has no record of its own to check
      // against. We do. If the SDK's figure and our ledger's disagree, something
      // is wrong (a merchant lying, or two payments racing on one channel) and
      // we stop rather than sign. The Guard's CUMULATIVE_MISMATCH should have
      // caught the hostile case already; this is the belt to that braces.
      const payload = await buildX402PaymentPayload({
        paymentRequired: challenge,
        channelId,
        signer,
      });
      const signedCumulative = BigInt(payload.payload.voucher.cumulativeAmount);
      if (signedCumulative !== reservation.cumulativeAmount) {
        ledger.release(reservation.reservationId, { reason: "cumulative disagreement" });
        return emit({
          outcome: REFUSED,
          url,
          verdict: {
            decision: DENY,
            code: "CUMULATIVE_DISAGREEMENT",
            detail: { sdk: signedCumulative, ours: reservation.cumulativeAmount },
            message: "voucher total does not match our spend ledger",
          },
          message: "voucher total does not match our spend ledger",
        });
      }

      const paid = await fetchImpl(url, {
        ...init,
        headers: { ...headers, [HEADERS.signature]: encodeX402PaymentSignature(payload) },
      });

      if (!paid.ok) {
        ledger.release(reservation.reservationId, {
          reason: `merchant rejected: HTTP ${paid.status}`,
        });
        return emit({
          outcome: FAILED,
          url,
          code: "MERCHANT_REJECTED",
          status: paid.status,
          message: await safeText(paid),
        });
      }

      let settlement = null;
      const respHeader = paid.headers.get(HEADERS.response);
      if (respHeader) {
        try {
          settlement = decodeX402PaymentResponse(respHeader);
        } catch {
          // A malformed receipt does not unpay the payment: the voucher is out
          // there and the money moved. Record it, flag the receipt.
          settlement = { success: true, unverifiedReceipt: true };
        }
      }

      ledger.commit(reservation.reservationId, { txHash: settlement?.transaction ?? null });

      return emit({
        outcome: PAID,
        url,
        amount,
        cumulativeAmount: reservation.cumulativeAmount,
        txHash: settlement?.transaction ?? null,
        settlement,
        verdict,
        response: paid,
      });
    } catch (e) {
      ledger.release(reservation.reservationId, { reason: `error: ${e.message}` });
      return emit({ outcome: FAILED, url, code: "PAYMENT_ERROR", message: e.message });
    }
  }

  return {
    buy,
    mandateId,
    get audit() {
      return [...audit];
    },
    stats() {
      const byOutcome = {};
      for (const e of audit) byOutcome[e.outcome] = (byOutcome[e.outcome] ?? 0) + 1;
      return {
        ...ledger.snapshot(mandateId, { windowSeconds }),
        byOutcome,
        unattendedPayments: audit.filter((e) => e.outcome === PAID && !e.free).length,
      };
    },
  };
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

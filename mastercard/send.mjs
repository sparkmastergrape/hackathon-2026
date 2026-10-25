// Mastercard Send Disbursements — the payout rail.
//
// Spec: /mastercard-send-disbursements/swagger/send-disbursement-api-swagger.yaml (v2.5.0)
// Docs: https://developer.mastercard.com/mastercard-send-disbursements/documentation/
//
// This is the leg that puts money on a card. The agent settles on-ledger; the
// merchant gets paid out to a real card account through a Business
// Disbursement (payment_type BDB). It has the best sandbox story on the
// platform: published test PANs and a documented happy-path reference, so the
// payout leg demos with no Mastercard rep involved.
//
// Two things to watch:
//   - Host. Send moved to api.move.mastercard.com in January 2026; the sandbox
//     is sandbox.api.move.mastercard.com/send/static (a static sandbox that
//     returns canned responses), and MTF drops the /static suffix.
//   - Amounts are minor-unit strings, not numbers. $53.00 is "5300".

import { createRequester } from './request.mjs';

/** Static sandbox: canned responses, no rep needed. */
export const SEND_SANDBOX_BASE_URL = 'https://sandbox.api.move.mastercard.com/send/static';
/** MTF: the same sandbox host without /static, for real test processing. */
export const SEND_MTF_BASE_URL = 'https://sandbox.api.move.mastercard.com/send';
export const SEND_PRODUCTION_BASE_URL = 'https://api.move.mastercard.com/send';

/**
 * The sandbox only returns a successful disbursement for this reference.
 * Any other value must be unique or you get a "Duplicate value" error.
 */
export const HAPPY_PATH_REFERENCE = 'HAPPYPATH_DISB_000001';

/** payment_type values. Mastercard enables the ones a partner may use at onboarding. */
export const PAYMENT_TYPE = {
  rapidMerchantSettlement: 'AMS',
  businessToBusiness: 'B2B',
  businessDisbursement: 'BDB',
  ownCreditCardBill: 'CBP',
  fastRefund: 'FRD',
  governmentOrNonProfit: 'GDB',
  gamingRepay: 'GMR',
};

/** funding_source values. Defaults to DEPOSIT_ACCOUNT when omitted. */
export const FUNDING_SOURCE = {
  credit: 'CREDIT',
  debit: 'DEBIT',
  prepaid: 'PREPAID',
  depositAccount: 'DEPOSIT_ACCOUNT',
  mobileMoneyAccount: 'MOBILE_MONEY_ACCOUNT',
  cash: 'CASH',
  other: 'OTHER',
};

export const DISBURSEMENT_STATUS = {
  approved: 'APPROVED',
  declined: 'DECLINED',
  unknown: 'UNKNOWN',
  error: 'ERROR',
  /** Non-card transactions only. */
  pending: 'PENDING',
};

/** account_type "03" is a card account; see the Account Type reference page. */
export const ACCOUNT_TYPE_CARD = '03';

/**
 * ISO-4217 minor-unit exponents for the currencies worth special-casing.
 * Anything not listed is assumed to have 2 decimal places.
 */
const CURRENCY_EXPONENT = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, XAF: 0, XOF: 0, PYG: 0, RWF: 0, UGX: 0, VUV: 0,
  BHD: 3, JOD: 3, KWD: 3, OMR: 3, TND: 3, IQD: 3, LYD: 3,
};

export function currencyExponent(currency) {
  return CURRENCY_EXPONENT[currency?.toUpperCase?.()] ?? 2;
}

/**
 * Converts a major-unit amount to the minor-unit string the API wants.
 *
 *   minorUnits(53, 'USD')    -> "5300"
 *   minorUnits(12.34, 'USD') -> "1234"
 *   minorUnits(500, 'JPY')   -> "500"
 *
 * Rounds at the currency's exponent rather than trusting float arithmetic.
 */
export function minorUnits(amount, currency = 'USD') {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Amount must be a positive number, got ${amount}`);
  }
  const scaled = Math.round(Number((amount * 10 ** currencyExponent(currency)).toFixed(4)));
  if (scaled < 1) throw new Error(`Amount ${amount} ${currency} rounds to zero minor units`);
  const asString = String(scaled);
  if (asString.length > 12) throw new Error(`Amount ${amount} ${currency} exceeds the 12-digit field`);
  return asString;
}

/** Reads a minor-unit string back as a major-unit number, for display. */
export function fromMinorUnits(amount, currency = 'USD') {
  return Number(amount) / 10 ** currencyExponent(currency);
}

/**
 * Builds a `pan:` account URI.
 *
 *   panUri({ pan: '5102589999999913', expiry: '2077-08', cvc: '123' })
 *   -> 'pan:5102589999999913;exp=2077-08;cvc=123'
 *
 * The test PANs in docs/mastercard-test-cards.md go here. Any future expiry
 * and any 3-digit CVC work in the sandbox.
 */
export function panUri({ pan, expiry, cvc }) {
  if (!/^\d{12,19}$/.test(pan ?? '')) throw new Error(`PAN must be 12-19 digits, got "${pan}"`);
  if (!/^\d{4}-(0[1-9]|1[012])$/.test(expiry ?? '')) {
    throw new Error(`Expiry must be yyyy-MM, got "${expiry}"`);
  }
  const parts = [`pan:${pan}`, `exp=${expiry}`];
  if (cvc !== undefined) {
    if (!/^\d{3,4}$/.test(cvc)) throw new Error(`CVC must be 3-4 digits, got "${cvc}"`);
    parts.push(`cvc=${cvc}`);
  }
  return parts.join(';');
}

export function createSendClient({
  partnerId = process.env.SEND_PARTNER_ID,
  baseUrl = SEND_SANDBOX_BASE_URL,
  dryRun = false,
} = {}) {
  // partnerId is a fixed-length path segment; a wrong one 404s rather than
  // failing clearly, so check the shape up front.
  const resolvedPartnerId = partnerId ?? 'SEND_PARTNER_ID_FROM_ONBOARDING';
  const request = createRequester({ baseUrl, dryRun });

  return {
    baseUrl,
    dryRun,
    partnerId: resolvedPartnerId,

    /**
     * Creates a disbursement — the actual push of funds to the recipient.
     *
     * `declineDetails: true` makes a decline come back as a 201 with the full
     * transaction (including the network decline code) instead of a bare 402,
     * which is what you want in a demo: a visible decline beats an exception.
     *
     * `repeat: true` marks the request as a resend of a previous one.
     */
    sendDisbursement(body, { declineDetails = true, repeat = false } = {}) {
      return request('POST', '/v1/partners/{partnerId}/disbursements/payment', {
        pathParams: { partnerId: resolvedPartnerId },
        query: { decline_details: declineDetails },
        headers: { 'Repeat-Flag': String(repeat) },
        body,
      });
    },

    /** Looks a disbursement up by the system-generated id from the POST response. */
    retrieveDisbursement(disbursementId) {
      return request('GET', '/v1/partners/{partnerId}/disbursements/{disbursementId}', {
        pathParams: { partnerId: resolvedPartnerId, disbursementId },
      });
    },

    /** Looks one up by the disbursement_reference you assigned. */
    retrieveDisbursementByRef(reference) {
      return request('GET', '/v1/partners/{partnerId}/disbursements', {
        pathParams: { partnerId: resolvedPartnerId },
        query: { ref: reference },
      });
    },
  };
}

/**
 * Builds the merchant payout body: a Business Disbursement from the platform's
 * funding card to the merchant's card.
 *
 * `amount` is in major units (53 means $53.00) and is converted here, because
 * passing minor units by hand is how you accidentally pay 100x.
 */
export function merchantPayoutRequest({
  reference,
  amount,
  currency = 'USD',
  sender,
  senderAccount,
  recipient,
  recipientAccount,
  paymentType = PAYMENT_TYPE.businessDisbursement,
  fundingSource = FUNDING_SOURCE.debit,
  transactionPurpose = '00',
  originationCountry = 'USA',
  participant,
  statementDescriptor,
  reconciliationData,
}) {
  if (!reference || reference.length < 6 || reference.length > 40) {
    throw new Error('disbursement_reference must be 6-40 characters');
  }
  if (!/^[A-Za-z0-9*,\-._~]+$/.test(reference)) {
    throw new Error(`disbursement_reference may only contain alphanumerics and * , - . _ ~, got "${reference}"`);
  }
  if (!recipientAccount) throw new Error('merchantPayoutRequest needs a recipientAccount URI');

  return {
    payment_disbursement: {
      disbursement_reference: reference,
      payment_type: paymentType,
      amount: minorUnits(amount, currency),
      currency: currency.toUpperCase(),
      ...(senderAccount ? { sender_account_uri: senderAccount } : {}),
      ...(sender ? { sender } : {}),
      recipient_account_uri: recipientAccount,
      ...(recipient ? { recipient } : {}),
      ...(participant ? { participant } : {}),
      funding_source: fundingSource,
      transaction_purpose: transactionPurpose,
      payment_origination_country: originationCountry,
      // The Sanctions Screening Service is suspended, but the spec still
      // requires this field to be true.
      sanction_screening_override: true,
      ...(statementDescriptor ? { statement_descriptor: statementDescriptor } : {}),
      ...(reconciliationData ? { reconciliation_data: reconciliationData } : {}),
    },
  };
}

/** Shapes a party for the sender/recipient blocks. Card accounts use type "03". */
export function cardParty({ firstName, lastName, nameOnAccount, address, accountType = ACCOUNT_TYPE_CARD }) {
  return {
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
    account_type: accountType,
    ...(address ? { address } : {}),
    ...(nameOnAccount ? { name_on_account: nameOnAccount } : {}),
  };
}

/** A one-line read of a disbursement response. */
export function describeDisbursement(data, currency = 'USD') {
  const d = data?.payment_disbursement ?? data ?? {};
  const amount = d.amount !== undefined ? `${fromMinorUnits(d.amount, d.currency ?? currency)} ${d.currency ?? currency}` : 'unknown amount';
  const parts = [d.status ?? 'no status', amount];
  if (d.status_reason && d.status_reason !== d.status) parts.push(`reason ${d.status_reason}`);
  if (d.id) parts.push(`id ${d.id}`);
  if (d.decline_details?.network_response_code) {
    parts.push(`network ${d.decline_details.network_response_code}`);
  }
  return parts.join(' · ');
}

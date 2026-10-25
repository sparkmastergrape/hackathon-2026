// Standard Currency Conversion Calculator — what the payout costs in the
// cardholder's own currency.
//
// Spec: /currency-conversion-calculator/swagger/currency-conversion-calculator.yaml
// Docs: https://developer.mastercard.com/currency-conversion-calculator/documentation/
//
// Mastercard publishes conversion rates daily, effective for 24 hours. Given a
// transaction currency, a cardholder billing currency, an amount and an
// optional bank fee, this returns the rate actually applied and the amount the
// cardholder is billed — the same numbers that will land on their statement.
//
// Regional note: available in NA, LAC, MEA, Europe (excluding EEA) and AP.
// EEA issuers must use the Enhanced Currency Conversion Calculator instead.
//
// The awkward part: errors come back *in band*. A failed lookup is an HTTP 200
// whose `data` carries `errorCode` and `errorMessage`. `unwrap()` below turns
// that into a thrown error so it cannot be mistaken for a rate.

import { createRequester } from './request.mjs';

export const FX_SANDBOX_BASE_URL = 'https://sandbox.api.mastercard.com/settlement/currencyrate';
export const FX_PRODUCTION_BASE_URL = 'https://api.mastercard.com/settlement/currencyrate';

export class CurrencyConversionError extends Error {
  constructor(code, message) {
    super(`Currency conversion failed (${code}): ${message}`);
    this.name = 'CurrencyConversionError';
    this.code = code;
  }
}

/** `fxDate` is yyyy-MM-dd. Rates are published daily and last 24 hours. */
export function fxDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function createFxClient({ baseUrl = FX_SANDBOX_BASE_URL, dryRun = false } = {}) {
  const request = createRequester({ baseUrl, dryRun });

  return {
    baseUrl,
    dryRun,

    /**
     * The applicable rate and the cardholder billing amount.
     *
     * Amounts here are major units (23.0 means 23 of transCurr), unlike the
     * minor-unit strings Send wants — don't cross the two.
     */
    getConversionRate({ transCurr, crdhldBillCurr, transAmt, bankFee, date = new Date() }) {
      if (!transCurr || !crdhldBillCurr) {
        throw new Error('getConversionRate needs transCurr and crdhldBillCurr');
      }
      if (typeof transAmt !== 'number' || !(transAmt > 0)) {
        throw new Error(`transAmt must be a positive number, got ${transAmt}`);
      }
      return request('GET', '/conversion-rate', {
        query: {
          fxDate: typeof date === 'string' ? date : fxDate(date),
          transCurr: transCurr.toUpperCase(),
          crdhldBillCurr: crdhldBillCurr.toUpperCase(),
          transAmt,
          bankFee,
        },
      });
    },

    /** Whether today's rates have been published yet. */
    isRateIssued({ date } = {}) {
      return request('GET', '/conversion-rate-issued', {
        query: { date: date === undefined ? undefined : typeof date === 'string' ? date : fxDate(date) },
      });
    },

    /** The currencies Mastercard publishes rates for. */
    getSettlementCurrencies() {
      return request('GET', '/settlement-currencies');
    },
  };
}

/**
 * Pulls `data` out of the response envelope, raising in-band errors.
 *
 * Every response is wrapped as { name, description, date, type, data }, and a
 * failure is an HTTP 200 with `errorCode` inside `data`.
 */
export function unwrap(response) {
  const payload = response?.data ?? response;
  const data = payload?.data ?? payload;
  if (data?.errorCode) {
    throw new CurrencyConversionError(data.errorCode, data.errorMessage ?? 'no message');
  }
  return data;
}

/** True when the service reports today's rates as published. */
export function rateIsIssued(response) {
  return unwrap(response)?.rateIssued === 'YES';
}

/** A one-line read of a conversion result. */
export function describeConversion(conversion) {
  if (!conversion) return 'no conversion returned';
  const { transAmt, transCurr, crdhldBillAmt, crdhldBillCurr, conversionRate, bankFee } = conversion;
  const parts = [`${transAmt} ${transCurr} -> ${crdhldBillAmt} ${crdhldBillCurr}`];
  if (conversionRate !== undefined) parts.push(`rate ${conversionRate}`);
  if (bankFee) parts.push(`bank fee ${bankFee}`);
  return parts.join(' · ');
}

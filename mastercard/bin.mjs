// BIN Lookup — what instrument is this, before we pay it.
//
// Spec: /bin-lookup/swagger/BIN-lookup-spec.yaml
// Docs: https://developer.mastercard.com/bin-lookup/documentation/
//
// Given the first 8-11 digits of a card number, Mastercard returns the account
// range's issuer, country, brand, funding source, consumer type, default
// billing currency — and, most usefully here, whether the issuer supports
// MoneySend domestically and cross-border.
//
// That last part makes this a real preflight rather than decoration: a Send
// disbursement to an issuer that does not support MoneySend cross-border will
// decline, and the BIN response says so before you spend the call.
//
// Note: partners are required to refresh the full dataset at least every
// 6 days and pass refreshed data to their customers daily. Single lookups are
// unlimited, so a per-payout preflight is within the usage model.

import { createRequester } from './request.mjs';

export const BIN_SANDBOX_BASE_URL = 'https://sandbox.api.mastercard.com/bin-resources';
export const BIN_PRODUCTION_BASE_URL = 'https://api.mastercard.com/bin-resources';

/** acceptanceBrand values worth naming. */
export const ACCEPTANCE_BRAND = {
  mastercard: 'MCC',
  debitMastercard: 'DMC',
  maestro: 'MSI',
};

/** fundingSource values. */
export const BIN_FUNDING_SOURCE = ['NONE', 'CREDIT', 'DEBIT', 'PREPAID'];

/**
 * The API takes `accountRange` as a *number*, 8 to 10 digits — the leading
 * digits of the PAN, not the whole thing.
 */
export function accountRangeFromPan(pan, digits = 8) {
  const clean = String(pan).replace(/\s/g, '');
  if (!/^\d{8,19}$/.test(clean)) throw new Error(`PAN must be at least 8 digits, got "${pan}"`);
  if (digits < 8 || digits > 11) throw new Error(`digits must be 8-11, got ${digits}`);
  const range = Number(clean.slice(0, digits));
  if (!Number.isSafeInteger(range)) throw new Error(`Account range ${range} is not a safe integer`);
  return range;
}

export function createBinClient({ baseUrl = BIN_SANDBOX_BASE_URL, dryRun = false } = {}) {
  const request = createRequester({ baseUrl, dryRun });

  return {
    baseUrl,
    dryRun,

    /** Single lookup by account range. Returns an array of matching ranges. */
    searchByAccountRange(accountRange) {
      if (typeof accountRange !== 'number') {
        throw new Error('accountRange must be a number — use accountRangeFromPan(pan)');
      }
      return request('POST', '/bin-ranges/account-searches', { body: { accountRange } });
    },

    /** The paginated variant of the same search. */
    searchPaginated(accountRange, { limit, offset } = {}) {
      return request('POST', '/bin-ranges/searches', {
        body: { accountRange },
        query: { limit, offset },
      });
    },

    /** Filtered or full download of account ranges. */
    getBinRanges(body = {}) {
      return request('POST', '/bin-ranges', { body });
    },

    /** Incremental changes since a snapshot, for keeping a local copy fresh. */
    getDeltas(fromSnapshotId) {
      return request('GET', '/bin-ranges/deltas/snapshots/{from_snapshot_id}', {
        pathParams: { from_snapshot_id: fromSnapshotId },
      });
    },
  };
}

/** Picks the first range out of a lookup response, which is an array. */
export function firstRange(data) {
  if (Array.isArray(data)) return data[0];
  if (Array.isArray(data?.accountRanges)) return data.accountRanges[0];
  return undefined;
}

/** A one-line read of a BIN record. */
export function describeBin(range) {
  if (!range) return 'no account range matched';
  const parts = [
    range.acceptanceBrand,
    range.fundingSource,
    range.consumerType,
    range.productDescription ?? range.productCode,
  ].filter(Boolean);
  const where = range.country?.alpha3 ?? range.country?.name;
  if (where) parts.push(where);
  if (range.billingCurrencyDefault) parts.push(`bills in ${range.billingCurrencyDefault}`);
  if (range.customerName) parts.push(`issued by ${range.customerName}`);
  return parts.join(' · ');
}

/**
 * Decides whether a Send payout to this account range is worth attempting.
 *
 * `crossBorder` should be true when the payout crosses a border relative to
 * the originating country, which is what selects between the issuer's
 * cross-border and domestic MoneySend indicators.
 *
 * Returns `{ ok, reasons, warnings }`. `ok: false` means the disbursement is
 * expected to decline — better to know before the call than after.
 */
export function payoutPreflight(range, { crossBorder = false, originationCountry } = {}) {
  const reasons = [];
  const warnings = [];

  if (!range) return { ok: false, reasons: ['no account range matched the PAN'], warnings };

  const indicator = crossBorder
    ? range.moneySendCrossBorderIndicator
    : range.moneySendDomesticIndicator;
  const which = crossBorder ? 'cross-border' : 'domestic';

  if (indicator === 'N') {
    reasons.push(`issuer does not support MoneySend ${which}`);
  } else if (indicator !== 'Y') {
    warnings.push(`MoneySend ${which} support unknown (indicator ${indicator ?? 'absent'})`);
  }

  if (range.localUse === true && crossBorder) {
    reasons.push('cards in this range are restricted to domestic use');
  }

  if (range.authorizationOnly === true) {
    reasons.push('account range is valid for authorization processing only');
  }

  if (originationCountry && range.country?.alpha3 && !crossBorder) {
    if (range.country.alpha3 !== originationCountry) {
      warnings.push(
        `card is issued in ${range.country.alpha3} but the payout originates in ` +
          `${originationCountry} — this is cross-border, not domestic`,
      );
    }
  }

  if (range.nonReloadableIndicator === true) {
    warnings.push('non-reloadable prepaid program; a push payment may not be accepted');
  }

  const fasterFunds = crossBorder
    ? range.fasterFundsCrossBorderIndicator
    : range.fasterFundsDomesticIndicator;
  if (fasterFunds === 'Y') {
    warnings.push(`issuer participates in Faster Funds ${which} — expect quicker availability`);
  }

  return { ok: reasons.length === 0, reasons, warnings };
}

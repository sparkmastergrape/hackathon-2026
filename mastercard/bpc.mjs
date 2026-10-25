// Business Payment Controls — the scoped credential layer.
//
// Spec: /business-payment-controls/swagger/business-payment-controls-swagger.yaml
// Docs: https://developer.mastercard.com/business-payment-controls/documentation/
//
// BPC mints virtual card numbers against a funding source and attaches spend
// controls that are evaluated at authorization time, on Mastercard's side. The
// agent never holds the real card: it gets a VCN whose ceiling, merchant
// categories, geography and validity window are enforced by the network even
// if the agent misbehaves.
//
// Note the host: BPC lives on apiedge.mastercard.com/commercial, not the
// sandbox.api.mastercard.com host the rest of the platform uses.

import { createRequester, isoWithOffset } from './request.mjs';

export const BPC_SANDBOX_BASE_URL = 'https://sandbox.apiedge.mastercard.com/commercial';
export const BPC_PRODUCTION_BASE_URL = 'https://apiedge.mastercard.com/commercial';
/** Legacy sandbox host; still supported for customers who were on it. */
export const BPC_MTF_BASE_URL = 'https://mtf.apiedge.mastercard.com/commercial';

/** ISO-4217 numeric codes for the currencies the demo uses. */
export const CURRENCY_NUMERIC = { USD: '840', EUR: '978', GBP: '826', AUD: '036', SGD: '702' };

export function currencyNumeric(currency) {
  if (/^\d{3}$/.test(currency)) return currency;
  const code = CURRENCY_NUMERIC[currency?.toUpperCase?.()];
  if (!code) throw new Error(`Unknown currency "${currency}" — pass an ISO-4217 numeric code instead`);
  return code;
}

/** `expiry` must be yyyy-MM. Defaults to 12 months out. */
export function expiryMonths(months = 12, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function createBpcClient({ baseUrl = BPC_SANDBOX_BASE_URL, dryRun = false } = {}) {
  const request = createRequester({ baseUrl, dryRun, idempotent: true });

  return {
    baseUrl,
    dryRun,

    // --- Entities: everything else hangs off the entity GUID ---

    /** The GUID of the entity this API user belongs to. Start here. */
    getUserEntity() {
      return request('GET', '/entities/user-entity');
    },

    getDescendants(guid) {
      return request('GET', '/entities/{guid}/descendants', { pathParams: { guid } });
    },

    // --- Funding sources and real cards ---

    addFundingSource(body) {
      return request('POST', '/funding-sources', { body });
    },

    searchFundingSources(body) {
      return request('POST', '/funding-sources/searches', { body });
    },

    addRealCard(body) {
      return request('POST', '/real-card-accounts', { body });
    },

    // --- Virtual cards: the agent's credential ---

    addVirtualCard(body) {
      return request('POST', '/virtual-card-accounts', { body });
    },

    getVirtualCard(accountGuid) {
      return request('GET', '/virtual-card-accounts/{account_guid}', {
        pathParams: { account_guid: accountGuid },
      });
    },

    updateVirtualCard(accountGuid, body) {
      return request('PUT', '/virtual-card-accounts/{account_guid}', {
        pathParams: { account_guid: accountGuid },
        body,
      });
    },

    /** Suspend or reactivate the agent's card without deleting it. */
    updateVirtualCardStatus(accountGuid, body) {
      return request('PUT', '/virtual-card-accounts/{account_guid}/status', {
        pathParams: { account_guid: accountGuid },
        body,
      });
    },

    deleteVirtualCard(accountGuid) {
      return request('DELETE', '/virtual-card-accounts/{account_guid}', {
        pathParams: { account_guid: accountGuid },
      });
    },

    // --- Reports: the agent's spend history ---

    createAuthorizationReport(body) {
      return request('POST', '/authorization-reports', { body });
    },

    getAuthorizationReport(guid) {
      return request('GET', '/authorization-reports/{guid}', { pathParams: { guid } });
    },

    getAuthorizationReportContent(guid) {
      return request('GET', '/authorization-reports/{guid}/data', { pathParams: { guid } });
    },

    createClearingReport(body) {
      return request('POST', '/clearing-reports', { body });
    },

    getClearingReportContent(guid) {
      return request('GET', '/clearing-reports/{guid}/data', { pathParams: { guid } });
    },
  };
}

/**
 * Turns an agent mandate into a BPC `inControlRules` entry.
 *
 * Every limit the human agreed to becomes a network-enforced control:
 *   perTransactionLimit -> transactionLimits
 *   totalLimit          -> velocities (CONTINUOUS cumulative spend)
 *   maxTransactions     -> velocities.maxTrans
 *   validUntil          -> validityPeriods
 *   mccs                -> merchantCategoryCodes
 *   countryCodes        -> geographies
 *
 * `action: 'APPROVE'` means only transactions matching every control are
 * approved — anything outside the mandate is declined at authorization.
 */
export function spendControlsFromMandate({
  agentId,
  totalLimit,
  perTransactionLimit,
  currency = 'USD',
  maxTransactions,
  mccs,
  countryCodes,
  validFrom = new Date(),
  validUntil,
  alias,
}) {
  if (!(totalLimit > 0)) throw new Error('spendControlsFromMandate needs a positive totalLimit');
  if (!(perTransactionLimit > 0)) throw new Error('spendControlsFromMandate needs a positive perTransactionLimit');
  if (perTransactionLimit > totalLimit) throw new Error('perTransactionLimit cannot exceed totalLimit');
  if (!validUntil) throw new Error('spendControlsFromMandate needs a validUntil — an open-ended agent mandate is not a mandate');

  const currencyCode = currencyNumeric(currency);

  const rule = {
    action: 'APPROVE',
    alias: alias ?? `agent-mandate-${agentId ?? 'unnamed'}`.slice(0, 100),
    transactionLimits: [{ amount: perTransactionLimit, negate: false }],
    velocities: [
      {
        period: 'CONTINUOUS',
        cumulativeLimit: totalLimit,
        currencyType: 'BASE',
        currencyCode,
        negate: false,
        ...(maxTransactions ? { maxTrans: maxTransactions } : {}),
      },
    ],
    validityPeriods: [
      {
        from: isoWithOffset(validFrom instanceof Date ? validFrom : new Date(validFrom)),
        to: isoWithOffset(validUntil instanceof Date ? validUntil : new Date(validUntil)),
        negate: false,
      },
    ],
  };

  if (mccs?.length) rule.merchantCategoryCodes = [{ mccs, negate: false }];
  if (countryCodes?.length) rule.geographies = [{ countryCodes, negate: false }];

  return rule;
}

/**
 * Builds the full POST /virtual-card-accounts body for an agent's card.
 *
 * `fundingSourceGuid` is required by the spec; `ownerGuid` is the entity the
 * card is registered under (from getUserEntity).
 */
export function agentVirtualCardRequest({
  fundingSourceGuid,
  ownerGuid,
  mandate,
  currency = 'USD',
  expiry = expiryMonths(12),
  applicationSource = 'AP4M',
  customDataGuid,
}) {
  if (!fundingSourceGuid) throw new Error('agentVirtualCardRequest needs a fundingSourceGuid');
  if (!/^20[2-9][0-9]-(0[1-9]|1[012])$/.test(expiry)) {
    throw new Error(`expiry must be yyyy-MM, got "${expiry}"`);
  }

  return {
    expiry,
    fundingSourceGuid,
    ...(ownerGuid ? { ownerGuid } : {}),
    billingCurrency: currencyNumeric(currency),
    billingCurrencyAlphabetic: /^\d{3}$/.test(currency) ? undefined : currency.toUpperCase(),
    active: true,
    applicationSource,
    ...(customDataGuid ? { customDataGuid } : {}),
    rules: {
      inControlRules: [spendControlsFromMandate({ ...mandate, currency })],
    },
  };
}

/** A one-line human summary of what a control rule actually permits. */
export function describeControls(rule) {
  const parts = [];
  const txLimit = rule.transactionLimits?.[0]?.amount;
  const velocity = rule.velocities?.[0];
  if (txLimit !== undefined) parts.push(`max ${txLimit} per transaction`);
  if (velocity?.cumulativeLimit !== undefined) {
    parts.push(`${velocity.cumulativeLimit} total (${velocity.period.toLowerCase()})`);
  }
  if (velocity?.maxTrans) parts.push(`${velocity.maxTrans} transactions`);
  if (rule.merchantCategoryCodes?.[0]?.mccs?.length) {
    parts.push(`MCCs ${rule.merchantCategoryCodes[0].mccs.join('/')}`);
  }
  if (rule.geographies?.[0]?.countryCodes?.length) {
    parts.push(`in ${rule.geographies[0].countryCodes.join('/')}`);
  }
  const validity = rule.validityPeriods?.[0];
  if (validity) parts.push(`valid ${validity.from} to ${validity.to}`);
  return `${rule.action} ${parts.join(', ')}`;
}

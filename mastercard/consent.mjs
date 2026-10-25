// Consent Management & Enrollment — the mandate layer.
//
// Spec: /consent-management/swagger/cbc-consent-spec.yaml
// Docs: https://developer.mastercard.com/consent-management/documentation/
//
// This is the only service in the Mastercard catalog whose own overview says
// it is built for "agentic consent flows". We use it as the human mandate an
// agent must hold before it is allowed to spend: create a consent, have the
// cardholder authenticate it, and treat the resulting consent as the authority
// for everything downstream. Revoking it is a single DELETE.
//
// Note on PII: create-consents, start-authentication and verify-authentication
// are JWE-encrypted endpoints (see jwe.mjs). Card details never go over the
// wire in the clear, and a user-details-only consent avoids handling a PAN at
// all — which is the variant the demo uses.

import { createRequester } from './request.mjs';
import { ENCRYPTED_CONSENT_PATHS } from './jwe.mjs';

export const CONSENT_SANDBOX_BASE_URL = 'https://sandbox.api.mastercard.com/openapis/authentication';
export const CONSENT_PRODUCTION_BASE_URL = 'https://api.mastercard.com/openapis/authentication';

/** Consent statuses the API can report. */
export const CONSENT_STATUS = {
  approved: 'APPROVED',
  failed: 'FAILED',
  authRequired: 'REQAUTH',
  notApproved: 'NOT_APPROVED',
  revoked: 'REVOKED',
  declined: 'DECLINED',
  expired: 'EXPIRED',
};

/** Authentication statuses from the `auth.status` field. */
export const AUTH_STATUS = {
  readyToStart: 'AUTH_READY_TO_START',
  inProgress: 'AUTH_IN_PROGRESS',
  failedCanRetry: 'AUTH_FAILED_CAN_RETRY',
};

export function createConsentClient({ baseUrl = CONSENT_SANDBOX_BASE_URL, dryRun = false } = {}) {
  const request = createRequester({ baseUrl, dryRun, encryptPaths: ENCRYPTED_CONSENT_PATHS });

  return {
    baseUrl,
    dryRun,

    /**
     * Creates one or more consents. Supply `cardDetails`, `userDetails`, or
     * both: card details yield a `cardReference`, user details yield a
     * `consentToken` that links later consents to the same person.
     */
    createConsent({ consents, cardDetails, userDetails, legalDocs, deviceChannel, consentDurationDays }) {
      if (!Array.isArray(consents) || consents.length === 0) {
        throw new Error('createConsent needs at least one consent');
      }
      if (!cardDetails && !userDetails) {
        throw new Error('createConsent needs cardDetails, userDetails, or both');
      }
      return request('POST', '/consents', {
        body: {
          consents,
          ...(cardDetails ? { cardDetails } : {}),
          ...(userDetails ? { userDetails } : {}),
          ...(legalDocs ? { legalDocs } : {}),
          ...(deviceChannel ? { deviceChannel } : {}),
          ...(consentDurationDays ? { consentDurationDays } : {}),
        },
      });
    },

    getConsents(cardRef) {
      return request('GET', '/consents/{card_ref}', { pathParams: { card_ref: cardRef } });
    },

    /** Starts authentication, e.g. kicks off a 3DS flow. */
    startAuthentication(cardRef, body = {}) {
      return request('POST', '/consents/{card_ref}/start-authentication', {
        pathParams: { card_ref: cardRef },
        body,
      });
    },

    /** Verifies the authentication result, e.g. checks the 3DS challenge outcome. */
    verifyAuthentication(cardRef, body = {}) {
      return request('POST', '/consents/{card_ref}/verify-authentication', {
        pathParams: { card_ref: cardRef },
        body,
      });
    },

    /** Revokes every consent for a card. This is the kill switch. */
    revokeAll(cardRef) {
      return request('DELETE', '/consents/{card_ref}', { pathParams: { card_ref: cardRef } });
    },

    /** Revokes one consent, leaving the others for that card in place. */
    revokeConsent(cardRef, consentId) {
      return request('DELETE', '/consents/{card_ref}/consents/{consent_id}', {
        pathParams: { card_ref: cardRef, consent_id: consentId },
      });
    },
  };
}

/**
 * Describes an agent spending mandate as a Consent Management consent.
 *
 * The limits live in `details` (free-form string map per the spec) so the
 * consent record itself carries the ceiling the human agreed to — which is
 * what `spendControlsFromMandate` in bpc.mjs then turns into card controls.
 * One artifact, two enforcement points.
 */
export function agentSpendMandate({
  agentId,
  purpose,
  totalLimit,
  perTransactionLimit,
  currency = 'USD',
  mccs,
  countryCodes,
}) {
  if (!agentId) throw new Error('agentSpendMandate needs an agentId');
  if (!(totalLimit > 0)) throw new Error('agentSpendMandate needs a positive totalLimit');
  if (!(perTransactionLimit > 0)) throw new Error('agentSpendMandate needs a positive perTransactionLimit');
  if (perTransactionLimit > totalLimit) {
    throw new Error('perTransactionLimit cannot exceed totalLimit');
  }

  return {
    name: `Agent spend mandate: ${agentId}`,
    details: {
      agentId,
      purpose: purpose ?? 'autonomous agent payments',
      totalLimit: String(totalLimit),
      perTransactionLimit: String(perTransactionLimit),
      currency,
      ...(mccs?.length ? { allowedMccs: mccs.join(',') } : {}),
      ...(countryCodes?.length ? { allowedCountries: countryCodes.join(',') } : {}),
    },
  };
}

/** Reads a mandate's limits back out of a consent record's `details`. */
export function readMandate(consent) {
  const d = consent?.details ?? {};
  return {
    agentId: d.agentId,
    purpose: d.purpose,
    totalLimit: Number(d.totalLimit),
    perTransactionLimit: Number(d.perTransactionLimit),
    currency: d.currency,
    mccs: d.allowedMccs ? d.allowedMccs.split(',') : undefined,
    countryCodes: d.allowedCountries ? d.allowedCountries.split(',') : undefined,
  };
}

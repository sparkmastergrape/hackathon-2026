// The Mastercard demo leg: a human mandate, a scoped card, a revocation.
//
//   node demo/agent-mandate.mjs            # dry run unless credentials are set
//   node demo/agent-mandate.mjs --dry-run  # always dry run
//   node demo/agent-mandate.mjs --live     # require credentials, call sandbox
//
// The story in five steps:
//   1. The human grants a spend mandate through Consent Management. The agent
//      holds a consent reference, never a card.
//   2. We read back which entity the API user belongs to in Business Payment
//      Controls.
//   3. The mandate's limits become network-enforced spend controls on a fresh
//      virtual card. The agent gets the VCN; the real card stays untouched.
//   4. An authorization report is the agent's spend history.
//   5. Revoking the consent suspends the card. The mandate is the kill switch.
//
// Dry run prints the exact HTTP request each step would send, so the flow is
// reviewable before any credential exists.

import { createConsentClient, agentSpendMandate, readMandate } from '../mastercard/consent.mjs';
import { createBpcClient, agentVirtualCardRequest, describeControls, expiryMonths } from '../mastercard/bpc.mjs';
import { hasEncryptionConfigured } from '../mastercard/jwe.mjs';

const args = new Set(process.argv.slice(2));
const wantLive = args.has('--live');
const haveCredentials = Boolean(process.env.MASTERCARD_CONSUMER_KEY && process.env.MASTERCARD_P12_PATH);
const dryRun = args.has('--dry-run') || !wantLive || !haveCredentials;

if (wantLive && !haveCredentials) {
  console.error('--live needs MASTERCARD_CONSUMER_KEY and MASTERCARD_P12_PATH. See .env.example.');
  process.exit(1);
}

// The mandate the human signs off on. Everything downstream derives from it.
const MANDATE = {
  agentId: 'ap4m-agent-01',
  purpose: 'Pay per-call API vouchers on behalf of the operator',
  totalLimit: 250,
  perTransactionLimit: 25,
  maxTransactions: 40,
  currency: 'USD',
  mccs: ['7372', '5734'], // prepackaged software, computer software stores
  countryCodes: ['USA'],
  validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

const consent = createConsentClient({ dryRun });
const bpc = createBpcClient({ dryRun });

let step = 0;
function heading(title) {
  step += 1;
  console.log(`\n${'='.repeat(72)}\n${step}. ${title}\n${'='.repeat(72)}`);
}

function report(result) {
  if (result.dryRun) {
    const { method, url, headers, body, encryptionRequired, encrypted } = result.plan;
    console.log(`${method} ${url}`);
    if (Object.keys(headers).length) console.log(`headers: ${JSON.stringify(headers)}`);
    if (encryptionRequired) {
      console.log(encrypted ? 'body: JWE-encrypted' : 'body (would be JWE-encrypted before sending):');
    }
    if (body !== undefined) console.log(JSON.stringify(body, null, 2));
    return undefined;
  }
  console.log(`${result.plan.method} ${result.plan.path} -> ${result.status}`);
  if (result.data !== undefined) console.log(JSON.stringify(result.data, null, 2));
  return result.data;
}

async function main() {
  console.log(dryRun ? 'Mode: DRY RUN (no network calls)' : 'Mode: LIVE against Mastercard sandbox');
  if (!hasEncryptionConfigured()) {
    console.log(
      'Note: MASTERCARD_ENCRYPTION_CERT_PATH is unset, so consent bodies are shown in the clear.\n' +
        '      A live run must encrypt them — Mastercard marks those three endpoints JWE-only.',
    );
  }

  heading('Human grants the agent a spend mandate (Consent Management)');
  const mandateConsent = agentSpendMandate(MANDATE);
  console.log(`Mandate: ${mandateConsent.name}`);
  console.log(`Limits:  ${MANDATE.perTransactionLimit} per call, ${MANDATE.totalLimit} total, ${MANDATE.currency}`);
  const created = report(
    await consent.createConsent({
      consents: [mandateConsent],
      // User-details-only consent: no PAN is handled anywhere in this flow.
      userDetails: { postalCode: '63368', countryCode: 'USA' },
      legalDocs: ['agent-payment-terms-v1'],
      consentDurationDays: 7,
    }),
  );

  // In a live run these come off the response; in a dry run we stand in for
  // them so the rest of the plan is still printable.
  const cardRef = created?.cardReference ?? created?.consentToken ?? 'CARD_REF_FROM_STEP_1';
  const consentId = created?.consents?.[0]?.id ?? 'CONSENT_ID_FROM_STEP_1';
  const consentStatus = created?.consents?.[0]?.status;
  if (consentStatus) console.log(`\nConsent status: ${consentStatus}`);

  heading('Cardholder authenticates the mandate');
  console.log('A consent starts at REQAUTH. These two calls carry it through 3DS to APPROVED.');
  report(await consent.startAuthentication(cardRef, { deviceChannel: '02' }));
  report(await consent.verifyAuthentication(cardRef, {}));

  heading('Find the entity the API user belongs to (Business Payment Controls)');
  const entity = report(await bpc.getUserEntity());
  const ownerGuid = entity?.guid ?? entity?.entityGuid ?? 'ENTITY_GUID_FROM_STEP_3';

  heading('Mint a virtual card whose controls are the mandate');
  const fundingSourceGuid = process.env.BPC_FUNDING_SOURCE_GUID ?? 'FUNDING_SOURCE_GUID';
  const cardRequest = agentVirtualCardRequest({
    fundingSourceGuid,
    ownerGuid,
    mandate: MANDATE,
    currency: MANDATE.currency,
    expiry: expiryMonths(12),
  });
  console.log(`Controls: ${describeControls(cardRequest.rules.inControlRules[0])}\n`);
  const card = report(await bpc.addVirtualCard(cardRequest));
  const accountGuid = card?.accountGuid ?? 'VIRTUAL_CARD_GUID_FROM_STEP_4';
  console.log(
    '\nThe agent gets this VCN. Mastercard declines anything outside the controls at\n' +
      'authorization time, so a compromised agent cannot exceed the mandate.',
  );

  heading("Pull the agent's spend history");
  const now = new Date();
  report(
    await bpc.createAuthorizationReport({
      accountGuid,
      fromDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      toDate: now.toISOString(),
    }),
  );

  heading('Revoke the mandate — and with it the card');
  console.log('Revoking consent is the kill switch. Suspend the card in the same breath.');
  report(await consent.revokeConsent(cardRef, consentId));
  report(await bpc.updateVirtualCardStatus(accountGuid, { active: false }));

  console.log(`\n${'='.repeat(72)}`);
  if (dryRun) {
    console.log('Dry run complete. Every request above is what a credentialed run would send.');
    console.log('To run it live: fill the Mastercard block in .env, then --live.');
  } else {
    console.log('Live run complete.');
  }

  // Prove the mandate round-trips: what we wrote into the consent is what the
  // card controls were built from.
  const roundTripped = readMandate(mandateConsent);
  console.log(
    `\nMandate round-trip: ${roundTripped.agentId} ` +
      `${roundTripped.perTransactionLimit}/${roundTripped.totalLimit} ${roundTripped.currency}`,
  );
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});

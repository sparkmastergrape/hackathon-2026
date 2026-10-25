// The Mastercard demo leg: a human mandate, a scoped card, a revocation.
//
//   node demo/agent-mandate.mjs            # dry run unless credentials are set
//   node demo/agent-mandate.mjs --dry-run  # always dry run
//   node demo/agent-mandate.mjs --live     # require credentials, call sandbox
//
// The story:
//   1. The human grants a spend mandate through Consent Management. The agent
//      holds a consent reference, never a card.
//   2. The cardholder authenticates the mandate.
//   3. We read back which entity the API user belongs to in Business Payment
//      Controls.
//   4. The mandate's limits become network-enforced spend controls on a fresh
//      virtual card. The agent gets the VCN; the real card stays untouched.
//   5. An authorization report is the agent's spend history.
//   6. BIN Lookup says what the merchant's card actually is, and whether its
//      issuer supports MoneySend at all; the Currency Conversion Calculator
//      says what the payout will cost in the merchant's own currency.
//   7. The merchant gets paid out to a card via Mastercard Send, within the
//      same mandate ceiling the virtual card enforces.
//   8. Revoking the consent suspends the card. The mandate is the kill switch.
//
// Dry run prints the exact HTTP request each step would send, so the flow is
// reviewable before any credential exists.

import { createConsentClient, agentSpendMandate, readMandate } from '../mastercard/consent.mjs';
import { createBpcClient, agentVirtualCardRequest, describeControls, expiryMonths } from '../mastercard/bpc.mjs';
import {
  createSendClient,
  merchantPayoutRequest,
  cardParty,
  panUri,
  describeDisbursement,
  minorUnits,
  HAPPY_PATH_REFERENCE,
} from '../mastercard/send.mjs';
import {
  createBinClient,
  accountRangeFromPan,
  firstRange,
  describeBin,
  payoutPreflight,
} from '../mastercard/bin.mjs';
import { createFxClient, unwrap, rateIsIssued, describeConversion } from '../mastercard/fx.mjs';
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

// The payout the agent owes the merchant for this task. Inside the mandate's
// per-transaction ceiling, which is the point.
const PAYOUT = {
  amount: 18.5,
  currency: 'USD',
  // Published Mastercard Send sandbox test PANs — see docs/mastercard-test-cards.md.
  platformFundingCard: { pan: '5102589999999921', expiry: '2077-02', cvc: '123' },
  merchantCard: { pan: '5102589999999913', expiry: '2077-08', cvc: '123' },
};

const consent = createConsentClient({ dryRun });
const bpc = createBpcClient({ dryRun });
const send = createSendClient({ dryRun });
const bin = createBinClient({ dryRun });
const fx = createFxClient({ dryRun });

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

  heading("Preflight the payout: what is this card? (BIN Lookup)");
  const accountRange = accountRangeFromPan(PAYOUT.merchantCard.pan);
  console.log(`Looking up account range ${accountRange} (first 8 digits of the merchant's PAN).`);
  const binResponse = report(await bin.searchByAccountRange(accountRange));
  const range = firstRange(binResponse);
  if (range) console.log(`\nCard: ${describeBin(range)}`);

  // The useful part: the issuer's MoneySend indicators say whether the Send
  // disbursement can succeed at all. Checking here turns a network decline
  // into a decision the agent makes before spending the call.
  const crossBorder = Boolean(range?.country?.alpha3) && range.country.alpha3 !== 'USA';
  const preflight = payoutPreflight(range, { crossBorder, originationCountry: 'USA' });
  if (range) {
    console.log(`MoneySend ${crossBorder ? 'cross-border' : 'domestic'}: ${preflight.ok ? 'supported' : 'NOT supported'}`);
    for (const reason of preflight.reasons) console.log(`  blocker: ${reason}`);
    for (const warning of preflight.warnings) console.log(`  note: ${warning}`);
  } else {
    console.log(
      '\nNo BIN record in a dry run, so nothing to check. A live run decides here\n' +
        'whether to attempt the payout at all.',
    );
  }

  heading('Price the payout in the merchant\'s currency (Currency Conversion)');
  const billingCurrency = range?.billingCurrencyDefault ?? 'EUR';
  console.log(
    `The card bills in ${billingCurrency}; the payout is in ${PAYOUT.currency}. ` +
      `Mastercard's\npublished rate is what will land on the statement.`,
  );
  const issued = report(await fx.isRateIssued());
  if (issued !== undefined) {
    console.log(`\nToday's rates published: ${rateIsIssued(issued) ? 'yes' : 'not yet'}`);
  }
  const rate = report(
    await fx.getConversionRate({
      transCurr: PAYOUT.currency,
      crdhldBillCurr: billingCurrency,
      transAmt: PAYOUT.amount,
      bankFee: 0,
    }),
  );
  if (rate !== undefined) console.log(`\nConversion: ${describeConversion(unwrap(rate))}`);
  console.log(
    '\nNote: this API reports failures in band — an HTTP 200 whose data carries\n' +
      'errorCode. unwrap() raises those rather than letting them read as a rate.',
  );

  heading('Pay the merchant out to a card (Mastercard Send)');
  // The mandate's per-transaction ceiling governs the payout too. Checking it
  // here means a bad payout fails in our code rather than being declined at
  // the network — same outcome, better error.
  if (PAYOUT.amount > MANDATE.perTransactionLimit) {
    throw new Error(
      `Payout ${PAYOUT.amount} ${PAYOUT.currency} exceeds the mandate's ` +
        `${MANDATE.perTransactionLimit} ${MANDATE.currency} per-transaction ceiling`,
    );
  }
  console.log(
    `Paying ${PAYOUT.amount} ${PAYOUT.currency} ` +
      `(${minorUnits(PAYOUT.amount, PAYOUT.currency)} minor units) to the merchant's card,\n` +
      `inside the ${MANDATE.perTransactionLimit} ${MANDATE.currency} per-transaction ceiling.`,
  );
  console.log(`Sandbox host: ${send.baseUrl}`);
  console.log(
    `Using the published Send sandbox test PANs. The sandbox only approves the\n` +
      `reference "${HAPPY_PATH_REFERENCE}", so that is what a dry/sandbox run sends.\n`,
  );

  const payoutRequest = merchantPayoutRequest({
    reference: HAPPY_PATH_REFERENCE,
    amount: PAYOUT.amount,
    currency: PAYOUT.currency,
    senderAccount: panUri(PAYOUT.platformFundingCard),
    sender: cardParty({
      firstName: 'AP4M',
      lastName: 'Platform',
      address: {
        line1: '101 Main St',
        city: 'Chicago',
        country_subdivision: 'IL',
        postal_code: '60618',
        country: 'USA',
      },
    }),
    recipientAccount: panUri(PAYOUT.merchantCard),
    recipient: cardParty({
      firstName: 'Jane',
      lastName: 'Smith',
      nameOnAccount: 'Jane Smith',
      address: {
        line1: '234 Spiral Drive',
        city: 'St. Louis',
        country_subdivision: 'MO',
        postal_code: '63368',
        country: 'USA',
      },
    }),
    statementDescriptor: 'AP4M*agent payout',
    reconciliationData: { reference_id: MANDATE.agentId },
  });
  const payout = report(await send.sendDisbursement(payoutRequest));
  if (payout) console.log(`\nDisbursement: ${describeDisbursement(payout, PAYOUT.currency)}`);
  console.log(
    '\ndecline_details=true means a declined payout returns 201 with the network\n' +
      'response code instead of a bare 402 — a visible decline beats an exception.',
  );

  heading('Confirm the payout landed');
  report(await send.retrieveDisbursementByRef(HAPPY_PATH_REFERENCE));

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

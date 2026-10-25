// Tests for the Mastercard demo leg. No network, no credentials: everything
// here checks that the request bodies we build match the published API specs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { expandPath, isoWithOffset, createRequester, MastercardApiError } from '../mastercard/request.mjs';
import { agentSpendMandate, readMandate, createConsentClient, CONSENT_SANDBOX_BASE_URL } from '../mastercard/consent.mjs';
import {
  spendControlsFromMandate,
  agentVirtualCardRequest,
  currencyNumeric,
  expiryMonths,
  describeControls,
  createBpcClient,
  BPC_SANDBOX_BASE_URL,
} from '../mastercard/bpc.mjs';

const MANDATE = {
  agentId: 'test-agent',
  totalLimit: 250,
  perTransactionLimit: 25,
  maxTransactions: 40,
  currency: 'USD',
  mccs: ['7372'],
  countryCodes: ['USA'],
  validUntil: new Date('2026-11-01T00:00:00Z'),
};

// --- request plumbing ---

test('expandPath substitutes and encodes path params', () => {
  assert.equal(expandPath('/consents/{card_ref}', { card_ref: 'abc' }), '/consents/abc');
  assert.equal(expandPath('/x/{a}/y/{b}', { a: '1', b: 'a b' }), '/x/1/y/a%20b');
});

test('expandPath rejects a missing path param', () => {
  assert.throws(() => expandPath('/consents/{card_ref}', {}), /Missing path parameter "card_ref"/);
});

test('isoWithOffset emits an explicit offset, not Z', () => {
  const stamp = isoWithOffset(new Date('2026-10-24T12:34:56.789Z'));
  assert.equal(stamp, '2026-10-24T12:34:56+00:00');
  // BPC control schemas constrain these to 16-28 characters.
  assert.ok(stamp.length >= 16 && stamp.length <= 28);
});

test('a dry-run requester joins base URL and path without losing the path prefix', async () => {
  const request = createRequester({ baseUrl: BPC_SANDBOX_BASE_URL, dryRun: true });
  const { plan } = await request('GET', '/entities/user-entity');
  assert.equal(plan.url, 'https://sandbox.apiedge.mastercard.com/commercial/entities/user-entity');
});

test('a dry-run requester adds an Idempotency-Key only to writes', async () => {
  const request = createRequester({ baseUrl: BPC_SANDBOX_BASE_URL, dryRun: true, idempotent: true });
  const write = await request('POST', '/virtual-card-accounts', { body: {} });
  const read = await request('GET', '/entities/user-entity');
  assert.match(write.plan.headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
  assert.equal(read.plan.headers['Idempotency-Key'], undefined);
});

test('encrypted endpoints are flagged even when no certificate is configured', async () => {
  const request = createRequester({
    baseUrl: CONSENT_SANDBOX_BASE_URL,
    dryRun: true,
    encryptPaths: ['/consents'],
  });
  const { plan } = await request('POST', '/consents', { body: { consents: [] } });
  assert.equal(plan.encryptionRequired, true);
  assert.equal(plan.encrypted, false, 'no cert configured, so nothing was actually encrypted');
});

test('MastercardApiError summarizes the platform error envelope', () => {
  const err = new MastercardApiError(
    400,
    { Errors: { Error: [{ ReasonCode: 'INVALID_INPUT', Description: 'expiry is required', Recoverable: false, Source: 'BPC' }] } },
    { method: 'POST', path: '/virtual-card-accounts' },
  );
  assert.match(err.message, /400/);
  assert.match(err.message, /INVALID_INPUT: expiry is required/);
  assert.equal(err.status, 400);
});

// --- consent / mandate ---

test('agentSpendMandate records the limits in the consent details', () => {
  const consent = agentSpendMandate(MANDATE);
  assert.equal(consent.name, 'Agent spend mandate: test-agent');
  assert.equal(consent.details.totalLimit, '250');
  assert.equal(consent.details.perTransactionLimit, '25');
  assert.equal(consent.details.allowedMccs, '7372');
  // The spec types `details` as a string map.
  for (const value of Object.values(consent.details)) assert.equal(typeof value, 'string');
});

test('a mandate round-trips through the consent record', () => {
  const back = readMandate(agentSpendMandate(MANDATE));
  assert.equal(back.agentId, 'test-agent');
  assert.equal(back.totalLimit, 250);
  assert.equal(back.perTransactionLimit, 25);
  assert.deepEqual(back.mccs, ['7372']);
  assert.deepEqual(back.countryCodes, ['USA']);
});

test('agentSpendMandate rejects a per-transaction limit above the total', () => {
  assert.throws(
    () => agentSpendMandate({ ...MANDATE, perTransactionLimit: 1000 }),
    /cannot exceed totalLimit/,
  );
});

test('agentSpendMandate requires positive limits', () => {
  assert.throws(() => agentSpendMandate({ ...MANDATE, totalLimit: 0 }), /positive totalLimit/);
  assert.throws(() => agentSpendMandate({ ...MANDATE, agentId: undefined }), /needs an agentId/);
});

test('createConsent refuses a body with neither card nor user details', async () => {
  const client = createConsentClient({ dryRun: true });
  await assert.rejects(
    async () => client.createConsent({ consents: [agentSpendMandate(MANDATE)] }),
    /cardDetails, userDetails, or both/,
  );
});

test('consent revocation targets the documented paths', async () => {
  const client = createConsentClient({ dryRun: true });
  const all = await client.revokeAll('CARDREF');
  const one = await client.revokeConsent('CARDREF', 'CONSENT1');
  assert.equal(all.plan.method, 'DELETE');
  assert.equal(all.plan.path, '/consents/CARDREF');
  assert.equal(one.plan.path, '/consents/CARDREF/consents/CONSENT1');
});

// --- spend controls ---

test('spendControlsFromMandate maps every limit onto a control', () => {
  const rule = spendControlsFromMandate(MANDATE);
  assert.equal(rule.action, 'APPROVE');
  assert.equal(rule.transactionLimits[0].amount, 25);
  assert.equal(rule.velocities[0].cumulativeLimit, 250);
  assert.equal(rule.velocities[0].period, 'CONTINUOUS');
  assert.equal(rule.velocities[0].maxTrans, 40);
  assert.deepEqual(rule.merchantCategoryCodes[0].mccs, ['7372']);
  assert.deepEqual(rule.geographies[0].countryCodes, ['USA']);
});

test('control rules satisfy the spec: negate set everywhere, numeric currency, offset dates', () => {
  const rule = spendControlsFromMandate(MANDATE);
  assert.equal(rule.transactionLimits[0].negate, false);
  assert.equal(rule.velocities[0].negate, false);
  assert.equal(rule.validityPeriods[0].negate, false);
  assert.equal(rule.merchantCategoryCodes[0].negate, false);
  assert.equal(rule.geographies[0].negate, false);
  assert.match(rule.velocities[0].currencyCode, /^\d{3}$/);
  assert.equal(rule.velocities[0].currencyType, 'BASE');
  assert.match(rule.validityPeriods[0].from, /\+00:00$/);
  assert.match(rule.validityPeriods[0].to, /\+00:00$/);
  assert.ok(rule.alias.length >= 1 && rule.alias.length <= 100);
});

test('spendControlsFromMandate refuses an open-ended mandate', () => {
  const { validUntil, ...noExpiry } = MANDATE;
  assert.throws(() => spendControlsFromMandate(noExpiry), /needs a validUntil/);
});

test('optional controls are omitted rather than sent empty', () => {
  const rule = spendControlsFromMandate({ ...MANDATE, mccs: [], countryCodes: undefined, maxTransactions: undefined });
  assert.equal(rule.merchantCategoryCodes, undefined);
  assert.equal(rule.geographies, undefined);
  assert.equal(rule.velocities[0].maxTrans, undefined);
});

test('currencyNumeric maps alphabetic codes and passes numeric ones through', () => {
  assert.equal(currencyNumeric('USD'), '840');
  assert.equal(currencyNumeric('eur'), '978');
  assert.equal(currencyNumeric('840'), '840');
  assert.throws(() => currencyNumeric('XYZ'), /Unknown currency/);
});

test('describeControls states what the card actually permits', () => {
  const text = describeControls(spendControlsFromMandate(MANDATE));
  assert.match(text, /^APPROVE/);
  assert.match(text, /max 25 per transaction/);
  assert.match(text, /250 total \(continuous\)/);
  assert.match(text, /MCCs 7372/);
});

// --- virtual card request ---

test('expiryMonths is yyyy-MM and matches the spec regex', () => {
  const expiry = expiryMonths(12, new Date('2026-10-24T00:00:00Z'));
  assert.equal(expiry, '2027-10');
  assert.match(expiry, /^20[2-9][0-9]-(0[1-9]|1[012])$/);
});

test('expiryMonths rolls the year over correctly', () => {
  assert.equal(expiryMonths(3, new Date('2026-11-15T00:00:00Z')), '2027-02');
});

test('agentVirtualCardRequest builds a spec-shaped POST body', () => {
  const body = agentVirtualCardRequest({
    fundingSourceGuid: 'FS-1',
    ownerGuid: 'ENT-1',
    mandate: MANDATE,
    expiry: '2027-10',
  });
  assert.equal(body.fundingSourceGuid, 'FS-1');
  assert.equal(body.ownerGuid, 'ENT-1');
  assert.equal(body.billingCurrency, '840');
  assert.equal(body.billingCurrencyAlphabetic, 'USD');
  assert.equal(body.active, true);
  assert.equal(body.rules.inControlRules.length, 1);
  assert.ok(body.applicationSource.length <= 16);
});

test('agentVirtualCardRequest requires a funding source and a valid expiry', () => {
  assert.throws(
    () => agentVirtualCardRequest({ mandate: MANDATE }),
    /needs a fundingSourceGuid/,
  );
  assert.throws(
    () => agentVirtualCardRequest({ fundingSourceGuid: 'FS-1', mandate: MANDATE, expiry: '10/27' }),
    /expiry must be yyyy-MM/,
  );
});

test('the virtual card request serializes without undefined keys', () => {
  const body = agentVirtualCardRequest({ fundingSourceGuid: 'FS-1', mandate: MANDATE, currency: '840' });
  const round = JSON.parse(JSON.stringify(body));
  assert.equal('billingCurrencyAlphabetic' in round, false);
  assert.equal(round.billingCurrency, '840');
});

// --- client wiring ---

test('the two clients target their own documented hosts', () => {
  assert.equal(createConsentClient().baseUrl, 'https://sandbox.api.mastercard.com/openapis/authentication');
  assert.equal(createBpcClient().baseUrl, 'https://sandbox.apiedge.mastercard.com/commercial');
});

test('BPC virtual card paths match the spec', async () => {
  const bpc = createBpcClient({ dryRun: true });
  assert.equal((await bpc.getUserEntity()).plan.path, '/entities/user-entity');
  assert.equal((await bpc.addVirtualCard({})).plan.path, '/virtual-card-accounts');
  assert.equal((await bpc.getVirtualCard('G1')).plan.path, '/virtual-card-accounts/G1');
  assert.equal((await bpc.updateVirtualCardStatus('G1', {})).plan.path, '/virtual-card-accounts/G1/status');
  assert.equal((await bpc.getAuthorizationReportContent('R1')).plan.path, '/authorization-reports/R1/data');
});

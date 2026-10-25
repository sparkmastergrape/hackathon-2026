// Tests for the Mastercard Send payout leg. No network, no credentials: these
// check the disbursement body against the Send Disbursement API spec (v2.5.0).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSendClient,
  merchantPayoutRequest,
  cardParty,
  panUri,
  minorUnits,
  fromMinorUnits,
  currencyExponent,
  describeDisbursement,
  SEND_SANDBOX_BASE_URL,
  SEND_MTF_BASE_URL,
  SEND_PRODUCTION_BASE_URL,
  HAPPY_PATH_REFERENCE,
  PAYMENT_TYPE,
  ACCOUNT_TYPE_CARD,
} from '../mastercard/send.mjs';

const MERCHANT_CARD = { pan: '5102589999999913', expiry: '2077-08', cvc: '123' };
const FUNDING_CARD = { pan: '5102589999999921', expiry: '2077-02', cvc: '123' };

function payout(overrides = {}) {
  return merchantPayoutRequest({
    reference: HAPPY_PATH_REFERENCE,
    amount: 18.5,
    currency: 'USD',
    senderAccount: panUri(FUNDING_CARD),
    recipientAccount: panUri(MERCHANT_CARD),
    ...overrides,
  });
}

// --- amounts: the field is a minor-unit string, which is easy to get wrong ---

test('minorUnits converts major units to the minor-unit string', () => {
  assert.equal(minorUnits(53, 'USD'), '5300');
  assert.equal(minorUnits(18.5, 'USD'), '1850');
  assert.equal(minorUnits(0.01, 'USD'), '1');
  assert.equal(typeof minorUnits(53, 'USD'), 'string');
});

test('minorUnits respects the currency exponent', () => {
  assert.equal(currencyExponent('JPY'), 0);
  assert.equal(currencyExponent('KWD'), 3);
  assert.equal(currencyExponent('USD'), 2);
  assert.equal(currencyExponent('ZZZ'), 2, 'unlisted currencies default to 2');
  assert.equal(minorUnits(500, 'JPY'), '500');
  assert.equal(minorUnits(1.234, 'KWD'), '1234');
});

test('minorUnits does not lose cents to float arithmetic', () => {
  // 19.99 * 100 is 1998.9999999999998 in IEEE 754.
  assert.equal(minorUnits(19.99, 'USD'), '1999');
  assert.equal(minorUnits(0.29, 'USD'), '29');
  assert.equal(minorUnits(1.005, 'USD'), '101');
});

test('minorUnits rejects amounts that are not payable', () => {
  assert.throws(() => minorUnits(0, 'USD'), /positive number/);
  assert.throws(() => minorUnits(-5, 'USD'), /positive number/);
  assert.throws(() => minorUnits(Number.NaN, 'USD'), /positive number/);
  assert.throws(() => minorUnits('18.50', 'USD'), /positive number/);
  assert.throws(() => minorUnits(0.001, 'USD'), /rounds to zero/);
  assert.throws(() => minorUnits(1e11, 'USD'), /12-digit field/);
});

test('fromMinorUnits reverses the conversion for display', () => {
  assert.equal(fromMinorUnits('1850', 'USD'), 18.5);
  assert.equal(fromMinorUnits('500', 'JPY'), 500);
});

// --- account URIs ---

test('panUri builds the documented pan: scheme', () => {
  assert.equal(panUri(MERCHANT_CARD), 'pan:5102589999999913;exp=2077-08;cvc=123');
});

test('panUri omits the cvc when none is given', () => {
  assert.equal(panUri({ pan: '5102589999999913', expiry: '2077-08' }), 'pan:5102589999999913;exp=2077-08');
});

test('panUri rejects malformed cards', () => {
  assert.throws(() => panUri({ pan: '123', expiry: '2077-08' }), /PAN must be 12-19 digits/);
  assert.throws(() => panUri({ pan: '5102589999999913', expiry: '08/77' }), /Expiry must be yyyy-MM/);
  assert.throws(() => panUri({ pan: '5102589999999913', expiry: '2077-13' }), /Expiry must be yyyy-MM/);
  assert.throws(() => panUri({ ...MERCHANT_CARD, cvc: '12' }), /CVC must be 3-4 digits/);
});

// --- the disbursement body ---

test('merchantPayoutRequest sets every field the spec requires', () => {
  const { payment_disbursement: d } = payout();
  for (const field of ['disbursement_reference', 'amount', 'currency', 'recipient_account_uri']) {
    assert.ok(d[field] !== undefined, `${field} is required by the spec`);
  }
  assert.equal(d.amount, '1850');
  assert.equal(d.currency, 'USD');
  assert.equal(d.recipient_account_uri, 'pan:5102589999999913;exp=2077-08;cvc=123');
});

test('merchantPayoutRequest defaults to a Business Disbursement', () => {
  assert.equal(payout().payment_disbursement.payment_type, PAYMENT_TYPE.businessDisbursement);
  assert.equal(payout().payment_disbursement.payment_type, 'BDB');
});

test('merchantPayoutRequest sets sanction_screening_override, which the spec still demands', () => {
  assert.equal(payout().payment_disbursement.sanction_screening_override, true);
});

test('merchantPayoutRequest uppercases the currency', () => {
  assert.equal(payout({ currency: 'usd' }).payment_disbursement.currency, 'USD');
});

test('merchantPayoutRequest validates the reference against the spec rules', () => {
  assert.throws(() => payout({ reference: 'SHORT' }), /6-40 characters/);
  assert.throws(() => payout({ reference: 'x'.repeat(41) }), /6-40 characters/);
  assert.throws(() => payout({ reference: 'has spaces here' }), /alphanumerics and/);
  assert.throws(() => payout({ reference: 'bad/slash!' }), /alphanumerics and/);
  // The documented character set is allowed.
  assert.doesNotThrow(() => payout({ reference: 'AP4M*payout-01._~,x' }));
});

test('merchantPayoutRequest requires a recipient account', () => {
  assert.throws(
    () => merchantPayoutRequest({ reference: HAPPY_PATH_REFERENCE, amount: 10, recipientAccount: undefined }),
    /needs a recipientAccount/,
  );
});

test('optional blocks are omitted rather than sent as undefined', () => {
  const round = JSON.parse(JSON.stringify(payout()));
  const d = round.payment_disbursement;
  assert.equal('sender' in d, false);
  assert.equal('recipient' in d, false);
  assert.equal('statement_descriptor' in d, false);
  assert.equal('reconciliation_data' in d, false);
});

test('cardParty shapes a party with the card account type', () => {
  const party = cardParty({ firstName: 'Jane', lastName: 'Smith', nameOnAccount: 'Jane Smith' });
  assert.equal(party.account_type, ACCOUNT_TYPE_CARD);
  assert.equal(party.account_type, '03');
  assert.equal(party.first_name, 'Jane');
  assert.equal(party.name_on_account, 'Jane Smith');
});

test('a statement descriptor fits the 22-character limit in the demo', () => {
  const d = payout({ statementDescriptor: 'AP4M*agent payout' }).payment_disbursement;
  assert.ok(d.statement_descriptor.length <= 22, 'statement descriptors are capped at 22 characters');
});

// --- client wiring ---

test('the Send hosts match the January 2026 domains', () => {
  assert.equal(SEND_SANDBOX_BASE_URL, 'https://sandbox.api.move.mastercard.com/send/static');
  assert.equal(SEND_MTF_BASE_URL, 'https://sandbox.api.move.mastercard.com/send');
  assert.equal(SEND_PRODUCTION_BASE_URL, 'https://api.move.mastercard.com/send');
});

test('sendDisbursement targets the partner-scoped payment path', async () => {
  const client = createSendClient({ dryRun: true, partnerId: 'ptnr_BEeCrYJHh2BXTXPy_PEtp-8DBOo' });
  const { plan } = await client.sendDisbursement(payout());
  assert.equal(plan.method, 'POST');
  assert.equal(plan.path, '/v1/partners/ptnr_BEeCrYJHh2BXTXPy_PEtp-8DBOo/disbursements/payment');
  assert.ok(plan.url.startsWith(`${SEND_SANDBOX_BASE_URL}/v1/partners/`));
});

test('decline_details defaults to true so declines come back as 201', async () => {
  const client = createSendClient({ dryRun: true, partnerId: 'P' });
  const on = await client.sendDisbursement(payout());
  const off = await client.sendDisbursement(payout(), { declineDetails: false });
  assert.match(on.plan.url, /decline_details=true/);
  assert.match(off.plan.url, /decline_details=false/);
});

test('the Repeat-Flag header is sent, and false unless asked', async () => {
  const client = createSendClient({ dryRun: true, partnerId: 'P' });
  const first = await client.sendDisbursement(payout());
  const resend = await client.sendDisbursement(payout(), { repeat: true });
  assert.equal(first.plan.headers['Repeat-Flag'], 'false');
  assert.equal(resend.plan.headers['Repeat-Flag'], 'true');
});

test('retrieval works by id and by reference', async () => {
  const client = createSendClient({ dryRun: true, partnerId: 'P' });
  const byId = await client.retrieveDisbursement('HAPPYPATH_DISB_000001_txn');
  const byRef = await client.retrieveDisbursementByRef(HAPPY_PATH_REFERENCE);
  assert.equal(byId.plan.path, '/v1/partners/P/disbursements/HAPPYPATH_DISB_000001_txn');
  assert.equal(byRef.plan.path, '/v1/partners/P/disbursements');
  assert.match(byRef.plan.url, /\?ref=HAPPYPATH_DISB_000001$/);
});

test('describeDisbursement reads an approved response', () => {
  const text = describeDisbursement({
    payment_disbursement: { status: 'APPROVED', status_reason: 'APPROVED', amount: '1850', currency: 'USD', id: 'abc' },
  });
  assert.match(text, /APPROVED/);
  assert.match(text, /18\.5 USD/);
  assert.match(text, /id abc/);
});

test('describeDisbursement surfaces a decline reason and network code', () => {
  const text = describeDisbursement({
    payment_disbursement: {
      status: 'DECLINED',
      status_reason: 'LIMIT_EXCEEDED',
      amount: '1850',
      currency: 'USD',
      decline_details: { network_response_code: '61' },
    },
  });
  assert.match(text, /DECLINED/);
  assert.match(text, /reason LIMIT_EXCEEDED/);
  assert.match(text, /network 61/);
});

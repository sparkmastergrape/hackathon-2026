// Tests for the BIN Lookup and Currency Conversion legs. No network: these
// check request shapes against the specs, and the two decision helpers that
// read the responses.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBinClient,
  accountRangeFromPan,
  firstRange,
  describeBin,
  payoutPreflight,
  BIN_SANDBOX_BASE_URL,
  ACCEPTANCE_BRAND,
} from '../mastercard/bin.mjs';
import {
  createFxClient,
  unwrap,
  rateIsIssued,
  describeConversion,
  fxDate,
  CurrencyConversionError,
  FX_SANDBOX_BASE_URL,
} from '../mastercard/fx.mjs';

/** A BIN record shaped like the spec's response, for a US debit Mastercard. */
const US_DEBIT = {
  binNum: '51025899',
  binLength: 8,
  acceptanceBrand: 'DMC',
  customerName: 'TEST BANK NA',
  country: { code: 840, alpha3: 'USA', name: 'UNITED STATES' },
  fundingSource: 'DEBIT',
  consumerType: 'CONSUMER',
  productCode: 'MDS',
  productDescription: 'DEBIT MASTERCARD',
  billingCurrencyDefault: 'USD',
  moneySendDomesticIndicator: 'Y',
  moneySendCrossBorderIndicator: 'Y',
  fasterFundsDomesticIndicator: 'Y',
  localUse: false,
  authorizationOnly: false,
};

// --- account ranges ---

test('accountRangeFromPan takes the leading digits as a number', () => {
  assert.equal(accountRangeFromPan('5102589999999913'), 51025899);
  assert.equal(typeof accountRangeFromPan('5102589999999913'), 'number');
});

test('accountRangeFromPan honours a wider range', () => {
  assert.equal(accountRangeFromPan('5102589999999913', 11), 51025899999);
});

test('accountRangeFromPan tolerates spaces in the PAN', () => {
  assert.equal(accountRangeFromPan('5102 5899 9999 9913'), 51025899);
});

test('accountRangeFromPan rejects bad input', () => {
  assert.throws(() => accountRangeFromPan('5102'), /at least 8 digits/);
  assert.throws(() => accountRangeFromPan('not-a-pan'), /at least 8 digits/);
  assert.throws(() => accountRangeFromPan('5102589999999913', 12), /digits must be 8-11/);
  assert.throws(() => accountRangeFromPan('5102589999999913', 7), /digits must be 8-11/);
});

test('the 8-digit range stays inside the spec bounds', () => {
  const range = accountRangeFromPan('5102589999999913');
  assert.ok(range >= 10000000 && range <= 1215752191, 'spec constrains accountRange to this window');
});

// --- BIN client ---

test('BIN Lookup targets the documented sandbox host and path', async () => {
  const client = createBinClient({ dryRun: true });
  const { plan } = await client.searchByAccountRange(51025899);
  assert.equal(client.baseUrl, 'https://sandbox.api.mastercard.com/bin-resources');
  assert.equal(plan.method, 'POST');
  assert.equal(plan.path, '/bin-ranges/account-searches');
  assert.equal(plan.url, `${BIN_SANDBOX_BASE_URL}/bin-ranges/account-searches`);
  assert.deepEqual(plan.body, { accountRange: 51025899 });
});

test('searchByAccountRange insists on a number, since the spec types it as one', async () => {
  const client = createBinClient({ dryRun: true });
  await assert.rejects(
    async () => client.searchByAccountRange('51025899'),
    /must be a number/,
  );
});

test('the paginated search passes limit and offset as query params', async () => {
  const client = createBinClient({ dryRun: true });
  const { plan } = await client.searchPaginated(51025899, { limit: 10, offset: 0 });
  assert.equal(plan.path, '/bin-ranges/searches');
  assert.match(plan.url, /limit=10/);
  assert.match(plan.url, /offset=0/);
});

test('the delta endpoint interpolates the snapshot id', async () => {
  const client = createBinClient({ dryRun: true });
  const { plan } = await client.getDeltas('snap-123');
  assert.equal(plan.path, '/bin-ranges/deltas/snapshots/snap-123');
});

// --- reading a BIN record ---

test('firstRange unwraps the array response', () => {
  assert.equal(firstRange([US_DEBIT]), US_DEBIT);
  assert.equal(firstRange({ accountRanges: [US_DEBIT] }), US_DEBIT);
  assert.equal(firstRange([]), undefined);
  assert.equal(firstRange(undefined), undefined);
});

test('describeBin summarizes the instrument', () => {
  const text = describeBin(US_DEBIT);
  assert.match(text, /DMC/);
  assert.match(text, /DEBIT/);
  assert.match(text, /CONSUMER/);
  assert.match(text, /USA/);
  assert.match(text, /bills in USD/);
  assert.match(text, /issued by TEST BANK NA/);
});

test('describeBin says so when nothing matched', () => {
  assert.match(describeBin(undefined), /no account range matched/);
});

test('ACCEPTANCE_BRAND names the documented codes', () => {
  assert.equal(ACCEPTANCE_BRAND.mastercard, 'MCC');
  assert.equal(ACCEPTANCE_BRAND.debitMastercard, 'DMC');
});

// --- the preflight decision ---

test('payoutPreflight passes a MoneySend-enabled domestic card', () => {
  const result = payoutPreflight(US_DEBIT, { crossBorder: false, originationCountry: 'USA' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});

test('payoutPreflight blocks when the issuer does not support MoneySend', () => {
  const result = payoutPreflight({ ...US_DEBIT, moneySendDomesticIndicator: 'N' });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /does not support MoneySend domestic/);
});

test('payoutPreflight checks the cross-border indicator when crossing a border', () => {
  const card = { ...US_DEBIT, moneySendCrossBorderIndicator: 'N', moneySendDomesticIndicator: 'Y' };
  assert.equal(payoutPreflight(card, { crossBorder: false }).ok, true);
  const crossed = payoutPreflight(card, { crossBorder: true });
  assert.equal(crossed.ok, false);
  assert.match(crossed.reasons.join(' '), /cross-border/);
});

test('payoutPreflight blocks a domestic-only card on a cross-border payout', () => {
  const result = payoutPreflight({ ...US_DEBIT, localUse: true }, { crossBorder: true });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /restricted to domestic use/);
});

test('payoutPreflight blocks an authorization-only range', () => {
  const result = payoutPreflight({ ...US_DEBIT, authorizationOnly: true });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /authorization processing only/);
});

test('payoutPreflight warns rather than blocks on an unknown indicator', () => {
  const result = payoutPreflight({ ...US_DEBIT, moneySendDomesticIndicator: undefined });
  assert.equal(result.ok, true, 'unknown is not the same as unsupported');
  assert.match(result.warnings.join(' '), /support unknown/);
});

test('payoutPreflight notices a country mismatch dressed up as domestic', () => {
  const result = payoutPreflight(
    { ...US_DEBIT, country: { alpha3: 'GBR' } },
    { crossBorder: false, originationCountry: 'USA' },
  );
  assert.match(result.warnings.join(' '), /this is cross-border, not domestic/);
});

test('payoutPreflight warns about a non-reloadable prepaid program', () => {
  const result = payoutPreflight({ ...US_DEBIT, nonReloadableIndicator: true });
  assert.match(result.warnings.join(' '), /non-reloadable/);
});

test('payoutPreflight fails closed with no record at all', () => {
  const result = payoutPreflight(undefined);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /no account range matched/);
});

// --- currency conversion ---

test('fxDate formats as yyyy-MM-dd', () => {
  assert.equal(fxDate(new Date('2026-10-25T18:00:00Z')), '2026-10-25');
});

test('getConversionRate sends every required query param', async () => {
  const client = createFxClient({ dryRun: true });
  const { plan } = await client.getConversionRate({
    transCurr: 'USD',
    crdhldBillCurr: 'EUR',
    transAmt: 18.5,
    bankFee: 0,
    date: '2026-10-25',
  });
  assert.equal(client.baseUrl, FX_SANDBOX_BASE_URL);
  assert.equal(plan.method, 'GET');
  const url = new URL(plan.url);
  assert.equal(url.searchParams.get('fxDate'), '2026-10-25');
  assert.equal(url.searchParams.get('transCurr'), 'USD');
  assert.equal(url.searchParams.get('crdhldBillCurr'), 'EUR');
  assert.equal(url.searchParams.get('transAmt'), '18.5');
  assert.equal(url.searchParams.get('bankFee'), '0');
});

test('getConversionRate uppercases currencies and omits an absent bank fee', async () => {
  const client = createFxClient({ dryRun: true });
  const { plan } = await client.getConversionRate({ transCurr: 'usd', crdhldBillCurr: 'eur', transAmt: 10 });
  const url = new URL(plan.url);
  assert.equal(url.searchParams.get('transCurr'), 'USD');
  assert.equal(url.searchParams.get('crdhldBillCurr'), 'EUR');
  assert.equal(url.searchParams.has('bankFee'), false);
});

test('getConversionRate validates its inputs', async () => {
  const client = createFxClient({ dryRun: true });
  await assert.rejects(async () => client.getConversionRate({ transCurr: 'USD', transAmt: 10 }), /needs transCurr and crdhldBillCurr/);
  await assert.rejects(async () => client.getConversionRate({ transCurr: 'USD', crdhldBillCurr: 'EUR', transAmt: 0 }), /positive number/);
  await assert.rejects(async () => client.getConversionRate({ transCurr: 'USD', crdhldBillCurr: 'EUR', transAmt: '10' }), /positive number/);
});

test('isRateIssued and settlement-currencies hit their own paths', async () => {
  const client = createFxClient({ dryRun: true });
  assert.equal((await client.isRateIssued()).plan.path, '/conversion-rate-issued');
  assert.equal((await client.getSettlementCurrencies()).plan.path, '/settlement-currencies');
});

test('isRateIssued omits the date param when none is given', async () => {
  const client = createFxClient({ dryRun: true });
  const { plan } = await client.isRateIssued();
  assert.equal(new URL(plan.url).searchParams.has('date'), false);
});

test('unwrap pulls data out of the response envelope', () => {
  const conversion = { conversionRate: 0.943078, crdhldBillAmt: 21.69, transAmt: 23, transCurr: 'USD', crdhldBillCurr: 'EUR' };
  const envelope = { name: 'settlement-conversion-rate', type: 'success', data: conversion };
  assert.deepEqual(unwrap({ data: envelope }), conversion);
  assert.deepEqual(unwrap(envelope), conversion);
});

test('unwrap raises the in-band error instead of returning it as a rate', () => {
  const envelope = {
    name: 'settlement-conversion-rate',
    type: 'error',
    data: { errorCode: '104', errorMessage: 'The calculated cross rates for the selected date is not available.' },
  };
  assert.throws(() => unwrap({ data: envelope }), CurrencyConversionError);
  try {
    unwrap({ data: envelope });
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.code, '104');
    assert.match(err.message, /cross rates for the selected date/);
  }
});

test('rateIsIssued reads the YES/NO string', () => {
  assert.equal(rateIsIssued({ data: { data: { rateIssued: 'YES' } } }), true);
  assert.equal(rateIsIssued({ data: { data: { rateIssued: 'NO' } } }), false);
});

test('describeConversion states the conversion in both currencies', () => {
  const text = describeConversion({
    transAmt: 18.5,
    transCurr: 'USD',
    crdhldBillAmt: 17.45,
    crdhldBillCurr: 'EUR',
    conversionRate: 0.943078,
    bankFee: 0,
  });
  assert.match(text, /18\.5 USD -> 17\.45 EUR/);
  assert.match(text, /rate 0\.943078/);
  assert.doesNotMatch(text, /bank fee/, 'a zero fee is not worth reporting');
});

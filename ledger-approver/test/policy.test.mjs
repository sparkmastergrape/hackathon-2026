import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, DEFAULT_POLICY } from '../server/policy.mjs';

const P = { ...DEFAULT_POLICY, perTxCapXrp: 50, dailyCapXrp: 200 };
const known = new Set(['rKnown']);
const ok = { risk: 'low', health: 'healthy', dailyTotalXrp: 0, knownDestinations: known };
const pay = (o = {}) => ({ amountXrp: 10, destination: 'rKnown', ...o });
const codes = (r) => r.reasons.map((x) => x.code);

test('small payment to known destination auto-releases', () => {
  assert.equal(evaluate(pay(), ok, P).outcome, 'auto');
});
test('above per-tx cap needs approval', () => {
  const r = evaluate(pay({ amountXrp: 51 }), ok, P);
  assert.equal(r.outcome, 'approval'); assert.deepEqual(codes(r), ['OVER_TX_CAP']);
});
test('at the cap is allowed', () => {
  assert.equal(evaluate(pay({ amountXrp: 50 }), ok, P).outcome, 'auto');
});
test('rolling daily total over cap needs approval', () => {
  const r = evaluate(pay({ amountXrp: 30 }), { ...ok, dailyTotalXrp: 175 }, P);
  assert.deepEqual(codes(r), ['OVER_DAILY_CAP']);
});
test('high risk needs approval', () => {
  assert.deepEqual(codes(evaluate(pay(), { ...ok, risk: 'high' }, P)), ['RISK_HIGH']);
});
test('compliance_pending needs approval', () => {
  assert.deepEqual(codes(evaluate(pay(), { ...ok, risk: 'pending' }, P)), ['COMPLIANCE_PENDING']);
});
test('medium risk auto-releases unless switched on', () => {
  assert.equal(evaluate(pay(), { ...ok, risk: 'medium' }, P).outcome, 'auto');
  assert.equal(evaluate(pay(), { ...ok, risk: 'medium' }, { ...P, requireApprovalOnMediumRisk: true }).outcome, 'approval');
});
test('sanctions hit is a hard block, never approvable', () => {
  const r = evaluate(pay({ amountXrp: 999 }), { ...ok, risk: 'blocked' }, P);
  assert.equal(r.outcome, 'block'); assert.deepEqual(codes(r), ['SDN_BLOCKED']);
});
test('critical ledger health is a hard block', () => {
  assert.equal(evaluate(pay(), { ...ok, health: 'critical' }, P).outcome, 'block');
});
test('travel rule threshold is inclusive', () => {
  assert.equal(evaluate(pay({ amountUsd: 2999.99 }), ok, P).outcome, 'auto');
  assert.deepEqual(codes(evaluate(pay({ amountUsd: 3000 }), ok, P)), ['TRAVEL_RULE']);
  assert.equal(evaluate(pay({ amountUsd: 5000, travelRuleAttached: true }), ok, P).outcome, 'auto');
});
test('new destination needs approval', () => {
  assert.deepEqual(codes(evaluate(pay({ destination: 'rNew' }), ok, P)), ['NEW_DESTINATION']);
});
test('default deny: unevaluable inputs go to approval', () => {
  assert.equal(evaluate(pay(), { ...ok, risk: undefined }, P).outcome, 'approval');
  assert.equal(evaluate(pay(), { ...ok, health: undefined }, P).outcome, 'approval');
  assert.equal(evaluate(pay(), { ...ok, dailyTotalXrp: NaN }, P).outcome, 'approval');
  assert.equal(evaluate(pay({ amountXrp: NaN }), ok, P).outcome, 'approval');
});
test('multiple triggers are all reported', () => {
  const r = evaluate(pay({ amountXrp: 500, destination: 'rNew' }), { ...ok, risk: 'high' }, P);
  assert.deepEqual(codes(r).sort(), ['NEW_DESTINATION', 'OVER_DAILY_CAP', 'OVER_TX_CAP', 'RISK_HIGH']);
});

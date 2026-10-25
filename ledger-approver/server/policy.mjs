// Approval policy: decides auto-release, human approval, or hard block.
// Default is deny: a rule that cannot be evaluated sends the payment to approval.
// Caps below are PLACEHOLDERS. Set real values with environment variables.

export const DEFAULT_POLICY = {
  perTxCapXrp: Number(process.env.PER_TX_CAP_XRP ?? 50),
  dailyCapXrp: Number(process.env.DAILY_CAP_XRP ?? 200),
  travelRuleUsd: 3000, // inclusive: amount >= threshold
  requireApprovalOnMediumRisk: false,
  requireApprovalOnNewDestination: true,
};

export const RISK_LEVELS = ['low', 'medium', 'high', 'blocked'];
export const HEALTH_LEVELS = ['healthy', 'degraded', 'critical'];

/**
 * @param intent {{amountXrp:number, destination:string, amountUsd?:number, travelRuleAttached?:boolean}}
 * @param ctx {{risk:string|'pending', health:string, dailyTotalXrp:number, knownDestinations:Set<string>}}
 * @returns {{outcome:'auto'|'approval'|'block', reasons:{code:string,text:string}[]}}
 */
export function evaluate(intent, ctx, policy = DEFAULT_POLICY) {
  // Hard blocks first. These are never approvable.
  if (ctx.risk === 'blocked') {
    return { outcome: 'block', reasons: [{ code: 'SDN_BLOCKED', text: 'Destination is a confirmed sanctions match.' }] };
  }
  if (ctx.health === 'critical') {
    return { outcome: 'block', reasons: [{ code: 'LEDGER_CRITICAL', text: 'XRPL health is critical; the rail is blocked.' }] };
  }

  const reasons = [];
  const add = (code, text) => reasons.push({ code, text });

  if (!Number.isFinite(intent.amountXrp) || intent.amountXrp <= 0) {
    add('UNEVALUATED_AMOUNT', 'Amount could not be evaluated.');
  } else {
    if (intent.amountXrp > policy.perTxCapXrp) {
      add('OVER_TX_CAP', `${intent.amountXrp} XRP is above the per-transaction cap of ${policy.perTxCapXrp} XRP.`);
    }
    if (!Number.isFinite(ctx.dailyTotalXrp)) {
      add('UNEVALUATED_DAILY', 'Rolling 24h total could not be evaluated.');
    } else if (ctx.dailyTotalXrp + intent.amountXrp > policy.dailyCapXrp) {
      add('OVER_DAILY_CAP', `Rolling 24h total would reach ${ctx.dailyTotalXrp + intent.amountXrp} XRP, above the daily cap of ${policy.dailyCapXrp} XRP.`);
    }
  }

  if (ctx.risk === 'high') add('RISK_HIGH', 'Compliance screening returned high risk: hold for human review.');
  else if (ctx.risk === 'pending') add('COMPLIANCE_PENDING', 'Screening did not run (compliance pending). Approve only if you accept that.');
  else if (ctx.risk === 'medium' && policy.requireApprovalOnMediumRisk) add('RISK_MEDIUM', 'Compliance screening returned medium risk.');
  else if (!RISK_LEVELS.includes(ctx.risk)) add('UNEVALUATED_RISK', 'Compliance risk could not be evaluated.');

  if (ctx.health !== 'healthy' && ctx.health !== 'degraded') add('UNEVALUATED_HEALTH', 'Ledger health could not be evaluated.');

  if (Number.isFinite(intent.amountUsd) && intent.amountUsd >= policy.travelRuleUsd && !intent.travelRuleAttached) {
    add('TRAVEL_RULE', `Amount is at or above ${policy.travelRuleUsd} USD and no travel-rule data is attached.`);
  }

  if (policy.requireApprovalOnNewDestination && !ctx.knownDestinations.has(intent.destination)) {
    add('NEW_DESTINATION', 'First payment to this destination.');
  }

  return reasons.length ? { outcome: 'approval', reasons } : { outcome: 'auto', reasons: [] };
}

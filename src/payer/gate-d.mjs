// GATE D — the full escalation round-trip, with the device in the loop.
//
// This is the demo, start to finish:
//   1. the human signs ONE Mandate on the Ledger
//   2. the agent pays several times, unattended, nobody touching anything
//   3. the agent hits a payment above the per-call cap and STOPS
//   4. the device lights up with that amount and payee; the human approves
//   5. the agent resumes and pays it
//   6. the same grant, replayed, is refused
//   7. a poisoned payee is refused outright, with no prompt at all
//
//   npm run gate-d              # local mock merchant, no funds (default)
//   npm run gate-d -- --live    # the real AP4M merchant, REAL RLUSD on chain
//
// Default is the mock, because a run that moves money should be something you
// typed on purpose. `--live` requires an open channel; see `npm run open-channel`.
//
// Prereq either way: npm run speculos:up

import { readFileSync } from "node:fs";
import { formatUnits } from "ethers";

import { buildMandate, rlusd, toSignerPayload, hashMandate, verifyMandate, describeMandate } from "../mandate/index.js";
import { buildGrant, toGrantSignerPayload, verifyGrant, describeGrant, hashGrant } from "../mandate/grant.js";
import { SpendLedger } from "../ledger-spend/index.js";
import { createPayer, PAID, REQUIRES_CONFIRMATION, REFUSED } from "./index.js";
import { createMockMerchant, DEFAULT_CHANNEL_ID } from "./mock-merchant.mjs";
import { connectSpeculosApprover } from "../device/speculos-approver.mjs";
import { RLUSD, PAYMENT_LEDGER, RLUSD_DECIMALS } from "../config/network.js";

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
const REGISTRY = "0x0000000000000000000000000000000000000001";
const PRICE = rlusd("0.01");
const OVER_CAP = rlusd("0.2");
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const UNATTENDED_CALLS = Number(argOf("calls", 4));

const head = (m) => console.log(`\n${"=".repeat(60)}\n${m}\n${"=".repeat(60)}`);
const log = (m) => console.log(`  ${m}`);
const rl = (v) => `${formatUnits(BigInt(v), RLUSD_DECIMALS)} RLUSD`;

const result = { gateD: "not run", screens: {}, steps: [] };

// ---------------------------------------------------------------- the device
head("1. THE APPROVER — a Ledger signs one Mandate");
let mandateScreens = [];
// Screens are printed as they happen, not just collected: when a device run
// stalls, the last screen is the whole diagnosis.
const VERBOSE = !args.includes("--quiet");
const device = (s) => {
  if (VERBOSE && !/^Press right button/.test(s)) console.log(`    device: ${s}`);
};
const approver = await connectSpeculosApprover({
  onScreen: (s) => {
    mandateScreens.push(s);
    device(s);
  },
  log,
});
log(`device address: ${approver.address}`);

// ---------------------------------------------------------------- the merchant
let merchant, resourceUrl, channelId, channelCap, agentSigner, ledgerSeed = 0n;

if (LIVE) {
  const KIT = "C:/Users/JD/Documents/Playground/ap4m-hackathon";
  const { JsonRpcProvider, Wallet, Contract, parseUnits } = await import("ethers");
  const { createX402Merchant, loadX402Context } = await import(`file:///${KIT}/ap4m-x402.mjs`);
  const { AP4M_API_URL, RPC_URL } = await import("../config/network.js");

  const env = {};
  for (const line of readFileSync(`${KIT}/.env`, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  const provider = new JsonRpcProvider(RPC_URL);
  agentSigner = new Wallet(env.AGENT_PRIVATE_KEY, provider);

  const ch = await fetch(`${AP4M_API_URL}/public/participant/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamName: env.TEAM_NAME, wallet: agentSigner.address }),
  }).then((r) => r.json());
  const session = await fetch(`${AP4M_API_URL}/public/participant/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: ch.challengeId,
      signature: await agentSigner.signMessage(ch.message),
    }),
  }).then((r) => r.json());
  const token = session.token ?? session.teamToken ?? session.sessionToken;
  const channels = await fetch(`${AP4M_API_URL}/public/participant/channels`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => r.json())
    .then((d) => d.channels);
  const open = channels.find((c) => c.channel_status === "open");
  if (!open) {
    console.error("no OPEN channel — run `npm run open-channel` first");
    await approver.close();
    process.exit(1);
  }
  channelId = open.channel_id;
  channelCap = BigInt(open.cap_wei);

  const CHANNELS_ABI = [
    "function channels(bytes32) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)",
  ];
  ledgerSeed = BigInt(
    (await new Contract(PAYMENT_LEDGER, CHANNELS_ABI, provider).channels(channelId))[8],
  );

  const PORT = 4413;
  resourceUrl = `http://127.0.0.1:${PORT}/resource`;
  const real = createX402Merchant({
    context: await loadX402Context(AP4M_API_URL),
    provider,
    submitter: new Wallet(env.MERCHANT_PRIVATE_KEY, provider),
    stateDirectory: `${KIT}/.gate-d-merchant-state`,
    resourceUrl,
    merchantParticipantId: env.MERCHANT_PARTICIPANT_ID,
    payout: env.MERCHANT_PAYOUT_ADDRESS,
    amount: PRICE.toString(),
    content: { message: "Gate D: paid under a device-signed Mandate" },
  });
  await new Promise((r) => real.server.listen(PORT, "127.0.0.1", r));
  // The real merchant has a fixed price, so the over-cap step cannot be staged
  // against it. Only the mock can be made to misbehave on demand.
  merchant = {
    close: () => real.close(),
    setFault: () => {
      throw new Error("the real merchant cannot be told to misbehave — use the mock run");
    },
    clearFaults: () => {},
    stats: () => ({}),
    payout: env.MERCHANT_PAYOUT_ADDRESS,
  };
  log(`LIVE: real merchant at ${resourceUrl}, channel ${channelId}`);
  log(`channel cap ${rl(channelCap)}, redeemed ${rl(ledgerSeed)}`);
} else {
  const { Wallet } = await import("ethers");
  // A throwaway agent key: the agent's signing key is not the human's, and in
  // the mock run nothing it signs is ever redeemed.
  agentSigner = Wallet.createRandom();
  channelId = DEFAULT_CHANNEL_ID;
  channelCap = rlusd("5");
  merchant = createMockMerchant({
    payTo: "0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8",
    agent: agentSigner.address,
    price: PRICE,
  });
  resourceUrl = (await merchant.listen()).url;
  merchant.payout = "0xFf9395aa0918A789B4dC40e7cf147A73c92fcbf8";
  log(`MOCK: local merchant at ${resourceUrl} — no funds move`);
}

try {
  // -------------------------------------------------------------- the mandate
  const now = Math.floor(Date.now() / 1000);
  const mandate = buildMandate({
    agent: agentSigner.address,
    asset: RLUSD,
    merchant: merchant.payout,
    maxPerCall: rlusd("0.05"),
    maxPerWindow: rlusd("0.5"),
    windowSeconds: 3600,
    maxTotal: rlusd("1"),
    validFrom: now - 60,
    validUntil: now + 3600,
    purpose: "market-data",
    nonce: now,
    registry: REGISTRY,
  });
  const mandateId = hashMandate(mandate);
  log(`asking the device to sign: ${describeMandate(mandate)}`);

  mandateScreens = [];
  const mandateSignature = await approver.signTypedData(toSignerPayload(mandate));
  const mv = await verifyMandate(mandate, mandateSignature, approver.address);
  result.screens.mandate = [...mandateScreens];
  result.mandateId = mandateId;
  result.mandateSignedByDevice = mv.ok;
  log(`mandate ${mandateId}`);
  log(`signature recovers to the device: ${mv.ok} (${mv.recovered})`);
  if (!mv.ok) throw new Error(`mandate signature did not verify: ${mv.reason}`);
  log(`screens the human read: ${mandateScreens.length}`);

  // -------------------------------------------------------------- autonomy
  head(`2. AUTONOMY — ${UNATTENDED_CALLS} payments, nobody touching anything`);
  const ledger = new SpendLedger();
  if (ledgerSeed) ledger.seedChannel(channelId, ledgerSeed);
  const payer = createPayer({
    mandate,
    signatureValid: mv.ok,
    ledger,
    channelId,
    channelCap,
    signer: agentSigner,
    policy: { expectedLedger: PAYMENT_LEDGER, expectedResourceUrl: resourceUrl },
  });

  for (let i = 1; i <= UNATTENDED_CALLS; i++) {
    const r = await payer.buy(resourceUrl);
    if (r.outcome !== PAID) throw new Error(`call ${i} did not pay: ${r.message ?? r.code}`);
    // The mock's "tx" is a hash of a string, not a transaction. Label it, so a
    // screenshot of a mock run can never be mistaken for on-chain proof.
    log(`${i}. paid ${rl(r.amount)}${r.txHash ? `  ${LIVE ? "tx" : "tx (MOCK, not on chain)"} ${r.txHash}` : ""}`);
  }
  result.unattendedPayments = UNATTENDED_CALLS;
  log(`device untouched for all ${UNATTENDED_CALLS}`);

  // -------------------------------------------------------------- the brake
  head("3. THE BRAKE — a payment above the per-call cap");
  if (LIVE) {
    log("skipped: the real merchant has a fixed price and cannot be told to overcharge");
    result.brake = "skipped (live)";
  } else {
    merchant.setFault("amount", OVER_CAP);
    const stopped = await payer.buy(resourceUrl);
    if (stopped.outcome !== REQUIRES_CONFIRMATION)
      throw new Error(`expected an escalation, got ${stopped.outcome}`);
    log(`STOPPED: ${stopped.message}`);
    log(`asking for ${rl(stopped.ask.amount)} to ${stopped.ask.merchant}`);
    result.escalation = { code: stopped.verdict.code, amount: stopped.ask.amount.toString() };

    // ---------------------------------------------------------- the device, again
    head("4. THE HUMAN DECIDES — one Grant, on the device");
    const grant = buildGrant({ ...stopped.ask, registry: REGISTRY });
    log(`asking the device to sign: ${describeGrant(grant)}`);
    const grantScreens = [];
    const stopCapturing = approver.captureScreens((s) => {
      grantScreens.push(s);
      device(s);
    });
    const grantSignature = await approver.signTypedData(toGrantSignerPayload(grant));
    stopCapturing();
    const gv = await verifyGrant(grant, grantSignature, approver.address);
    result.screens.grant = grantScreens;
    result.grantId = hashGrant(grant);
    result.grantSignedByDevice = gv.ok;
    log(`grant ${hashGrant(grant)}`);
    log(`signature recovers to the device: ${gv.ok}`);
    if (!gv.ok) throw new Error(`grant signature did not verify: ${gv.reason}`);

    head("5. RESUME — the agent pays the granted amount");
    const resumed = await payer.buy(resourceUrl, { grant, grantSignatureValid: gv.ok });
    if (resumed.outcome !== PAID) throw new Error(`resume failed: ${resumed.message}`);
    log(`paid ${rl(resumed.amount)} under ${resumed.verdict.code}`);
    result.grantedPayment = { amount: resumed.amount.toString(), code: resumed.verdict.code };

    head("6. THE SAME YES CANNOT BE SPENT TWICE");
    const replay = await payer.buy(resourceUrl, { grant, grantSignatureValid: gv.ok });
    if (replay.outcome !== REFUSED || replay.verdict.code !== "GRANT_SPENT")
      throw new Error(`replay was not refused: ${replay.outcome} ${replay.verdict?.code}`);
    log(`REFUSED: ${replay.message}`);
    result.replayRefused = true;

    merchant.clearFaults();
    log(`and the agent carries on: ${(await payer.buy(resourceUrl)).outcome}`);

    head("7. THE ATTACK — a poisoned payee");
    merchant.setFault("payTo", "0x000000000000000000000000000000000000dEaD");

    // Two policies, because the honest answer is that it depends on one setting.
    // The default ESCALATES an unknown payee: a human could still refuse, and
    // sometimes a new payee is legitimate. With `onUnknownMerchant: DENY` the
    // agent refuses outright and never prompts — which is what you want when the
    // payee set is known in advance, as it is here.
    const attacked = await payer.buy(resourceUrl);
    log(`default policy  -> ${attacked.outcome}: ${attacked.message}`);
    if (attacked.outcome === PAID) throw new Error("the attack succeeded — stop everything");

    const strict = createPayer({
      mandate,
      signatureValid: mv.ok,
      ledger,
      channelId,
      channelCap,
      signer: agentSigner,
      policy: {
        expectedLedger: PAYMENT_LEDGER,
        expectedResourceUrl: resourceUrl,
        onUnknownMerchant: "DENY",
      },
    });
    const refused = await strict.buy(resourceUrl);
    log(`strict policy   -> ${refused.outcome}: ${refused.message}`);
    if (refused.outcome !== REFUSED) throw new Error("strict policy did not refuse");

    result.injection = {
      default: { outcome: attacked.outcome, code: attacked.verdict?.code },
      strict: { outcome: refused.outcome, code: refused.verdict?.code },
      promptedHuman: false,
    };
    merchant.clearFaults();
    result.brake = "passed";
  }

  result.stats = JSON.parse(
    JSON.stringify(payer.stats(), (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
  result.gateD = LIVE ? "PASSED (live, brake skipped)" : "PASSED";
} catch (e) {
  result.gateD = "FAILED";
  result.error = e.message;
  if (e.detail) result.errorDetail = JSON.stringify(e.detail);
  head("FAILED");
  log(e.message);
  if (e.detail) log(JSON.stringify(e.detail, null, 2));
} finally {
  await merchant.close().catch?.(() => {});
  await approver.close();
  result.steps = approver.steps;

  head("device screens, as the human read them");
  for (const [label, list] of Object.entries(result.screens)) {
    console.log(`\n-- ${label} --`);
    (list ?? []).forEach((s, i) => log(`${String(i + 1).padStart(2, "0")}. ${s}`));
  }

  head(`GATE D: ${result.gateD}`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.gateD.startsWith("PASSED") ? 0 : 1);
}

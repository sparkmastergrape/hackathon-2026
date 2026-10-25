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

import { readFileSync, writeFileSync } from "node:fs";
import { formatUnits } from "ethers";

import { buildMandate, rlusd, toSignerPayload, hashMandate, verifyMandate, describeMandate } from "../mandate/index.js";
import { buildGrant, toGrantSignerPayload, verifyGrant, describeGrant, hashGrant } from "../mandate/grant.js";
import { SpendLedger } from "../ledger-spend/index.js";
import { createPayer, PAID, REQUIRES_CONFIRMATION, REFUSED } from "./index.js";
import { createMockMerchant, DEFAULT_CHANNEL_ID } from "./mock-merchant.mjs";
import { chooseChannel, describeChoice } from "./choose-channel.mjs";
import { connectSpeculosApprover } from "../device/speculos-approver.mjs";
import { RLUSD, PAYMENT_LEDGER, RLUSD_DECIMALS, MANDATE_REGISTRY } from "../config/network.js";
import { createOnChainChecker, REGISTRY_ABI } from "../revocation/index.js";
import { buildReceiptChain } from "../receipts/index.js";
import { renderReceiptsHtml } from "../receipts/render.js";

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
// The real, deployed registry — so Mandates and Grants bind to the contract
// that can actually revoke them, not to a placeholder address.
const REGISTRY = MANDATE_REGISTRY || "0x0000000000000000000000000000000000000001";
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
let merchant, resourceUrl, channelId, channelCap, agentSigner, ledgerSeed = 0n, provider = null;

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
  provider = new JsonRpcProvider(RPC_URL);
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
  // Every payment this run intends to make: the unattended batch, the granted
  // one that resolves the escalation, and headroom for the replay attempt and a
  // retry. Pick by on-chain headroom and refuse now if it cannot finish — a
  // demo that dies halfway is worse than one that never starts.
  let choice;
  try {
    choice = await chooseChannel({
      channels,
      provider,
      need: PRICE * BigInt(UNATTENDED_CALLS + 3),
    });
  } catch (e) {
    console.error(`REFUSING: ${e.message}`);
    await approver.close();
    process.exit(1);
  }
  const open = choice.channel;
  if (choice.candidates.length > 1) {
    log(`open channels, roomiest first:`);
    log(describeChoice(choice, open.channel_id));
  }
  channelId = open.channel_id;
  channelCap = BigInt(open.cap_wei);
  ledgerSeed = choice.redeemed;

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
  // Revocation is read from the deployed registry, and FAILS CLOSED: if the
  // chain cannot be reached, the agent stops rather than assuming it is still
  // allowed to spend. Only wired in the live run, because that is the only one
  // with an RPC — and a mock run must not pretend to have checked.
  const revocation =
    LIVE && MANDATE_REGISTRY
      ? createOnChainChecker({ provider, registry: MANDATE_REGISTRY, approver: approver.address })
      : null;
  if (revocation) log(`revocation registry ${MANDATE_REGISTRY} (fail-closed)`);

  const payer = createPayer({
    mandate,
    signatureValid: mv.ok,
    ledger,
    channelId,
    channelCap,
    signer: agentSigner,
    revocation,
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
    result.grantObject = grant; // for the receipt chain below
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

  // ------------------------------------------------- 8. revocation (live only)
  if (args.includes("--revoke")) {
    head("8. THE BRAKE OF LAST RESORT — revoke on the device");
    if (!LIVE || !MANDATE_REGISTRY) {
      log("skipped: revocation is read from the chain, so it needs --live and a deployed registry");
      result.revocation = "skipped";
    } else {
      const { Contract } = await import("ethers");
      const registry = new Contract(MANDATE_REGISTRY, REGISTRY_ABI, agentSigner);
      const nonce = BigInt(Math.floor(Date.now() / 1000));

      // Check the digest before spending a human's attention on a prompt that
      // could never verify on chain.
      const { hashTypedData } = await import("viem");
      const { REVOCATION_EIP712 } = await import("../config/network.js");
      const typed = {
        domain: {
          name: REVOCATION_EIP712.domainName,
          version: REVOCATION_EIP712.domainVersion,
          chainId: (await provider.getNetwork()).chainId,
          verifyingContract: MANDATE_REGISTRY,
        },
        types: REVOCATION_EIP712.types,
        primaryType: "Revocation",
        message: { mandateId, approver: approver.address, nonce },
      };
      const onChainDigest = await registry.revocationDigest(mandateId, approver.address, nonce);
      if (onChainDigest.toLowerCase() !== hashTypedData(typed).toLowerCase())
        throw new Error("revocation digest disagrees with the contract — not asking the device");
      log(`digest matches the contract's own revocationDigest`);

      const revScreens = [];
      const stop = approver.captureScreens((s) => {
        revScreens.push(s);
        device(s);
      });
      const sig = await approver.signTypedData({
        ...typed,
        message: { ...typed.message, nonce: nonce.toString() },
      });
      stop();
      result.screens.revocation = revScreens;

      // The AGENT relays it: it pays to have its own authority removed, and
      // cannot refuse — the registry checks the signature, not the sender.
      const tx = await registry.revoke(mandateId, approver.address, nonce, sig);
      log(`relayed by the agent: ${tx.hash}`);
      const rcpt = await tx.wait();
      log(`mined block ${rcpt.blockNumber}, status ${rcpt.status}`);
      const confirmed = await registry.isRevoked(approver.address, mandateId);
      log(`registry says revoked: ${confirmed}`);
      if (!confirmed) throw new Error("the revocation did not land in the registry");

      const after = await payer.buy(resourceUrl);
      log(`next payment -> ${after.outcome}: ${after.message}`);
      if (after.outcome !== REFUSED) throw new Error("a revoked mandate still paid");

      result.revocation = {
        tx: tx.hash,
        block: rcpt.blockNumber,
        confirmedOnChain: confirmed,
        nextPayment: { outcome: after.outcome, code: after.verdict?.code },
      };
    }
  }

  // ------------------------------------------------- the receipt chain view
  const paidEvents = payer.audit.filter((e) => e.outcome === PAID && !e.free);
  const receipts = [];
  for (const [i, e] of paidEvents.entries()) {
    // On chain, read the receipt back. Off chain, pass nothing — the view then
    // marks settlement unverified rather than dressing up a merchant's word.
    let onChain = null;
    if (LIVE && e.txHash) {
      const rcpt = await provider.getTransactionReceipt(e.txHash);
      onChain = { receipt: rcpt, channelRedeemed: e.cumulativeAmount };
    }
    receipts.push({
      title: `Payment ${i + 1} — ${rl(e.amount)}${e.verdict?.code === "WITHIN_GRANT" ? " (granted)" : ""}`,
      chain: await buildReceiptChain({
        event: e,
        mandate,
        mandateSignature,
        approver: approver.address,
        grant: e.verdict?.code === "WITHIN_GRANT" ? result.grantObject : null,
        onChain,
      }),
    });
  }
  const out = argOf("receipts", "build/receipts.html");
  writeFileSync(
    out,
    renderReceiptsHtml(receipts, {
      run: LIVE ? "live — real RLUSD on chain 1449000" : "mock — no funds moved",
      mandate: mandateId,
      approver: `${approver.address} (Ledger, app-ethereum via Speculos)`,
      registry: MANDATE_REGISTRY || "(not deployed)",
      payments: String(receipts.length),
    }),
  );
  result.receiptsHtml = out;
  result.receiptsVerified = receipts.filter((r) => r.chain.verified).length;
  console.log(`\nreceipt chain view -> ${out} (${result.receiptsVerified}/${receipts.length} fully verified)`);

  result.stats = JSON.parse(
    JSON.stringify(payer.stats(), (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
  result.gateD = LIVE ? "PASSED (live, brake skipped)" : "PASSED";
} catch (e) {
  result.gateD = "FAILED";
  result.error = e.message;
  if (e.detail) result.errorDetail = JSON.stringify(e.detail);
  if (e.screenAtFailure) {
    result.screenAtFailure = e.screenAtFailure;
    result.wantedInteraction = e.wantedInteraction;
    result.stepsAtFailure = e.stepsSeen;
  }
  head("FAILED");
  log(e.message);
  if (e.screenAtFailure) {
    log(`device screen at failure: ${e.screenAtFailure}`);
    log(`signer asked for interaction: ${e.wantedInteraction}`);
    log(`steps: ${(e.stepsSeen ?? []).join(", ")}`);
  }
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

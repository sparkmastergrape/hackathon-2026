// GATE C — a payment the Guard authorised, confirmed on chain 1449000.
//
// THIS MOVES REAL TESTNET VALUE. It runs the whole stack against the genuine
// AP4M x402 merchant from the hackathon kit, which redeems each voucher on-chain
// and has the service settle RLUSD to the merchant payout address:
//
//   human-signed Mandate  ->  Guard verdict  ->  SpendLedger reservation
//     ->  AP4M voucher + resource binding  ->  merchant redeems on chain
//     ->  tx hash we can look up on the explorer
//
//   npm run gate-c                 # one payment
//   npm run gate-c -- --calls 5    # several, all unattended
//
// The merchant module comes from the hackathon kit in the parent checkout rather
// than being vendored here, so there is no chance of this demo passing against
// a stale copy of someone else's code.

import { readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, Contract, parseUnits, formatUnits } from "ethers";
import { privateKeyToAccount } from "viem/accounts";

import { buildMandate, rlusd, verifyMandate, hashMandate, describeMandate } from "../mandate/index.js";
import { SpendLedger } from "../ledger-spend/index.js";
import { createPayer, PAID, REQUIRES_CONFIRMATION, REFUSED } from "./index.js";
import { describeVerdict } from "../guard/index.js";
import { chooseChannel, describeChoice } from "./choose-channel.mjs";
import { AP4M_API_URL, RPC_URL, CHAIN_ID, RLUSD, PAYMENT_LEDGER } from "../config/network.js";

const KIT = "C:/Users/JD/Documents/Playground/ap4m-hackathon";
const { createX402Merchant, loadX402Context } = await import(`file:///${KIT}/ap4m-x402.mjs`);

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const CALLS = Number(argOf("calls", "1"));
const PRICE_RLUSD = argOf("price", "0.01");
const PORT = Number(argOf("port", "4411"));

const env = {};
for (const line of readFileSync(`${KIT}/.env`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const provider = new JsonRpcProvider(RPC_URL);
const net = await provider.getNetwork();
if (Number(net.chainId) !== CHAIN_ID) {
  console.error(`REFUSING: RPC reports chain ${net.chainId}, expected ${CHAIN_ID}`);
  process.exit(1);
}

const agentWallet = new Wallet(env.AGENT_PRIVATE_KEY, provider);
const approver = privateKeyToAccount(env.MERCHANT_PRIVATE_KEY); // stands in for the Ledger
const payout = env.MERCHANT_PAYOUT_ADDRESS;
const merchantId = env.MERCHANT_PARTICIPANT_ID;

// --- find the open channel ---
const post = (path, body, token) =>
  fetch(`${AP4M_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const challenge = await (
  await post("/public/participant/challenge", {
    teamName: env.TEAM_NAME,
    wallet: agentWallet.address,
  })
).json();
const session = await (
  await post("/public/participant/session", {
    challengeId: challenge.challengeId,
    signature: await agentWallet.signMessage(challenge.message),
  })
).json();
const token = session.token ?? session.teamToken ?? session.sessionToken;
if (!token) {
  console.error(`sign-in failed: ${JSON.stringify(session).slice(0, 300)}`);
  process.exit(1);
}
const channels = (
  await (
    await fetch(`${AP4M_API_URL}/public/participant/channels`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
).channels;
const price = parseUnits(PRICE_RLUSD, 18);

// Pick by on-chain headroom, not by list order, and refuse now rather than
// stalling mid-run. See choose-channel.mjs for why this is not `find(open)`.
let choice;
try {
  choice = await chooseChannel({ channels, provider, need: price * BigInt(CALLS) });
} catch (e) {
  console.error(`REFUSING: ${e.message}`);
  process.exit(1);
}
const channel = choice.channel;
if (choice.candidates.length > 1) {
  console.log(`open channels, roomiest first:`);
  console.log(describeChoice(choice, channel.channel_id));
}

const cap = BigInt(channel.cap_wei);

// RECONCILIATION. Vouchers are cumulative, so a payer that starts with an empty
// spend ledger against a channel that already has history will sign a voucher
// below the accepted total — the merchant rejects it, or worse, our cap
// arithmetic is wrong by exactly that history. The channel's own state is the
// authority, read straight off the PaymentLedger contract (ABI as published in
// the hackathon SDK's getChannelState).
//
// This is the residual risk recorded as T10 in ARCHITECTURE §7, met head-on: we
// reconcile from chain at startup and then refuse to accept the merchant's word
// for anything after that.
const CHANNELS_ABI = [
  "function channels(bytes32 channelId) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)",
];
const onChain = await new Contract(PAYMENT_LEDGER, CHANNELS_ABI, provider).channels(
  channel.channel_id,
);
const redeemedAlready = BigInt(onChain[8]);
const onChainCap = BigInt(onChain[7]);
const channelStatus = Number(onChain[11]);

console.log(`chain     ${net.chainId}`);
console.log(`agent     ${agentWallet.address}`);
console.log(`channel   ${channel.channel_id}`);
console.log(
  `cap       ${formatUnits(cap, 18)} RLUSD (on chain ${formatUnits(onChainCap, 18)}, status ${channelStatus})`,
);
console.log(`redeemed  ${formatUnits(redeemedAlready, 18)} RLUSD on chain`);
console.log(`payout    ${channel.payout}`);
console.log(`price     ${PRICE_RLUSD} RLUSD x ${CALLS} call(s)\n`);

// (the cap check happens after reconciliation below, once we know the real
// starting point)

// --- the real merchant, redeeming on chain ---
const resourceUrl = `http://127.0.0.1:${PORT}/resource`;
const merchant = createX402Merchant({
  context: await loadX402Context(AP4M_API_URL),
  provider,
  submitter: new Wallet(env.MERCHANT_PRIVATE_KEY, provider),
  stateDirectory: argOf("state", `${KIT}/.gate-c-merchant-state`),
  resourceUrl,
  merchantParticipantId: merchantId,
  payout,
  amount: price.toString(),
  content: { message: "Gate C: paid under a hardware-signed Mandate" },
});
await new Promise((r) => merchant.server.listen(PORT, "127.0.0.1", r));
console.log(`merchant  listening on ${resourceUrl}`);

// The merchant holds a lock file on its state directory, and it SURVIVES A
// CRASH: one unhandled error anywhere below leaves `merchant.lock` behind, and
// then every later run dies at startup with "another Merchant is using this
// state directory" — pointing at a process that does not exist. It cost two
// runs to work that out (DX-LOG D-033). So the lock is released on every exit
// path, not just the happy one.
let merchantClosed = false;
const releaseMerchant = async () => {
  if (merchantClosed) return;
  merchantClosed = true;
  await merchant.close().catch(() => {});
};
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await releaseMerchant();
    process.exit(130);
  });
for (const event of ["uncaughtException", "unhandledRejection"])
  process.once(event, async (e) => {
    console.error(`\n${event}: ${e?.stack ?? e}`);
    await releaseMerchant();
    process.exit(1);
  });

// --- the envelope: signed once, by a human (here, a local key for the key
//     ceremony; the device-signed run is `npm run gate-a` plus this script
//     with the signature pasted in) ---
const now = Math.floor(Date.now() / 1000);
const mandate = buildMandate({
  agent: agentWallet.address,
  asset: RLUSD,
  merchant: payout,
  maxPerCall: rlusd("0.05"),
  maxPerWindow: rlusd("0.5"),
  windowSeconds: 3600,
  maxTotal: rlusd("1"),
  validFrom: now - 60,
  validUntil: now + 3600,
  purpose: "market-data",
  nonce: now,
  registry: "0x0000000000000000000000000000000000000001",
});
const mandateSignature = await approver.signTypedData({
  domain: mandate.domain,
  types: mandate.types,
  primaryType: mandate.primaryType,
  message: mandate.message,
});
const check = await verifyMandate(mandate, mandateSignature, approver.address);
console.log(`\nmandate   ${hashMandate(mandate)}`);
console.log(describeMandate(mandate));
console.log(`approver  ${approver.address} — signature verifies: ${check.ok}`);
if (!check.ok) process.exit(1);

// --- pre-flight: read one 402 without paying, and reconcile deliberately ---
//
// The merchant's `extra.acceptedCumulativeAmount` is its own record of what the
// facilitator has accepted on this channel, which can legitimately run ahead of
// what has been redeemed on chain. It is also the field a hostile merchant would
// inflate (DX-LOG D-020), so the Guard refuses any per-payment disagreement.
// Reconciling is therefore a startup decision, printed and opt-in — never a
// silent per-payment default.
const peek = await fetch(resourceUrl, { headers: { "X-AP4M-CHANNEL-ID": channel.channel_id } });
const { decodeX402PaymentRequired } = await import("@ap4m/sdk");

// Say what the merchant actually did when it is not a 402 with a challenge.
// `decodeHeader` throws `Cannot read properties of null (reading 'length')` on a
// missing header — a stack trace inside the SDK that names neither the header
// nor the status, and sends you looking for a bug in your own decoder
// (DX-LOG D-032). One check turns that into a sentence.
const challengeHeader = peek.headers.get("PAYMENT-REQUIRED");
if (!challengeHeader) {
  const body = await peek.text().catch(() => "(unreadable)");
  console.error(
    `\nREFUSING: the merchant answered HTTP ${peek.status} with no PAYMENT-REQUIRED header.` +
      `\n  body: ${body.slice(0, 300)}` +
      `\n  headers: ${[...peek.headers.keys()].join(", ")}` +
      `\nA merchant that cannot price the resource cannot be paid. Check that the AP4M` +
      `\nservice is reachable and that no other merchant holds this state directory.`,
  );
  await releaseMerchant();
  process.exit(1);
}
const claimed = BigInt(
  decodeX402PaymentRequired(challengeHeader).accepts[0].extra.acceptedCumulativeAmount,
);
console.log(`\nmerchant claims accepted cumulative ${formatUnits(claimed, 18)} RLUSD`);

let startFrom = redeemedAlready;
if (claimed !== redeemedAlready) {
  const delta = claimed - redeemedAlready;
  console.log(
    `  differs from chain by ${formatUnits(delta, 18)} RLUSD — accepted but not yet redeemed`,
  );
  if (!args.includes("--accept-claimed")) {
    console.error(
      `\nREFUSING to pay on a channel whose history we cannot account for.\n` +
        `Re-run with --accept-claimed to adopt the merchant's figure as the starting point,\n` +
        `which is safe only because it is bounded by the channel cap (${formatUnits(cap, 18)} RLUSD).`,
    );
    await releaseMerchant();
    process.exit(1);
  }
  if (claimed > cap) {
    console.error("REFUSING: claimed cumulative exceeds the channel cap");
    await releaseMerchant();
    process.exit(1);
  }
  console.log(`  --accept-claimed given: starting from ${formatUnits(claimed, 18)} RLUSD`);
  startFrom = claimed;
}

if (startFrom + price * BigInt(CALLS) > cap) {
  console.error("REFUSING: that many calls would exceed the channel cap");
  await releaseMerchant();
  process.exit(1);
}

// --- pay ---
const ledger = new SpendLedger();
ledger.seedChannel(channel.channel_id, startFrom);
const payer = createPayer({
  mandate,
  signatureValid: check.ok,
  ledger,
  channelId: channel.channel_id,
  channelCap: cap,
  signer: agentWallet,
  policy: { expectedLedger: PAYMENT_LEDGER, expectedResourceUrl: resourceUrl },
  onEvent: (e) => console.log(`  [${e.outcome}] ${e.message ?? e.txHash ?? ""}`),
});

const hashes = [];
let failed = false;
for (let i = 1; i <= CALLS; i++) {
  console.log(`\n--- call ${i} ---`);
  const r = await payer.buy(resourceUrl);
  if (r.outcome === PAID) {
    hashes.push(r.txHash);
    console.log(`  paid ${formatUnits(r.amount, 18)} RLUSD, cumulative ${formatUnits(r.cumulativeAmount, 18)}`);
    console.log(`  tx   ${r.txHash}`);
  } else if (r.outcome === REQUIRES_CONFIRMATION || r.outcome === REFUSED) {
    console.log(`  ${describeVerdict(r.verdict)}`);
    failed = true;
    break;
  } else {
    console.log(`  FAILED ${r.code}: ${r.message}`);
    // A rejection from the merchant is where a concurrent payer shows up, and
    // the error it produces says nothing useful ("Merchant redemption
    // transaction does not match payment"). Vouchers are cumulative: if someone
    // else signed a HIGHER total on this channel while we were mid-request, our
    // voucher is stale and the redemption reverts. The channel's own `redeemed`
    // figure is the tell, so we go and look rather than guessing.
    const nowRedeemed = BigInt(
      (await new Contract(PAYMENT_LEDGER, CHANNELS_ABI, provider).channels(channel.channel_id))[8],
    );
    if (nowRedeemed !== redeemedAlready) {
      console.log(
        `\n  !! THE CHANNEL MOVED UNDER US: redeemed was ${formatUnits(redeemedAlready, 18)} at ` +
          `startup and is ${formatUnits(nowRedeemed, 18)} now, with ${hashes.length} payment(s) from us.`,
      );
      console.log(
        `     Another payer is live on this channel with the same agent key. Cumulative vouchers\n` +
          `     allow exactly one writer per channel — the other process must stop before this one\n` +
          `     can run. See ARCHITECTURE §7 T5 and DX-LOG D-031.`,
      );
    }
    failed = true;
    break;
  }
}

await releaseMerchant();

console.log(`\n=== ${failed ? "INCOMPLETE" : "GATE C"} ===`);
console.log(JSON.stringify(payer.stats(), (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
for (const h of hashes) console.log(`tx  ${h}`);
console.log(
  `\nVerify independently:\n  node -e "new (require('ethers').JsonRpcProvider)('${RPC_URL}').getTransactionReceipt('${hashes[0] ?? "<hash>"}').then(r=>console.log(r.status,r.blockNumber))"`,
);
process.exit(failed ? 1 : 0);

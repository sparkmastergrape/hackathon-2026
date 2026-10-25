// Open an AP4M payment channel. THIS MOVES VALUE: the agent wallet sends one
// vault transaction on chain 1449000 (paying XRP gas) and the service then binds
// the merchant payout and opens the channel with the requested RLUSD cap.
//
// Run deliberately, never on discovery:
//   npm run open-channel -- --cap 5
//
// It refuses to do anything if an open channel already exists, so a second run
// is a no-op rather than a second allocation. The private key is read from the
// untracked .env and never printed.
//
// The flow mirrors the hackathon SDK's `requestChannel`:
//   POST /public/participant/channel-requests/prepare  -> {to, data}
//   agent wallet sends that transaction                -> tx hash
//   POST /public/participant/channel-requests {tx_hash} -> channel record
//   poll /public/participant/channels until status === "open"

import { readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, formatEther } from "ethers";
import { AP4M_API_URL, RPC_URL, CHAIN_ID } from "../config/network.js";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const CAP_RLUSD = argOf("cap", "5");
const ENV_PATH =
  process.env.AP4M_ENV_PATH ?? "C:/Users/JD/Documents/Playground/ap4m-hackathon/.env";

const env = {};
for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(env.AGENT_PRIVATE_KEY, provider);
const teamName = process.env.TEAM_NAME ?? env.TEAM_NAME;

const net = await provider.getNetwork();
if (Number(net.chainId) !== CHAIN_ID) {
  console.error(`REFUSING: RPC reports chain ${net.chainId}, expected ${CHAIN_ID}`);
  process.exit(1);
}
console.log(`chain    ${net.chainId} (${RPC_URL})`);
console.log(`agent    ${wallet.address}`);
console.log(`gas      ${formatEther(await provider.getBalance(wallet.address))} XRP`);
console.log(`cap      ${CAP_RLUSD} RLUSD`);

// --- sign in ---
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
  await post("/public/participant/challenge", { teamName, wallet: wallet.address })
).json();
if (!challenge.challengeId) {
  console.error(`challenge failed: ${JSON.stringify(challenge).slice(0, 300)}`);
  process.exit(1);
}
const session = await (
  await post("/public/participant/session", {
    challengeId: challenge.challengeId,
    signature: await wallet.signMessage(challenge.message),
  })
).json();
const token = session.token ?? session.teamToken ?? session.sessionToken;
if (!token) {
  console.error(`sign-in failed: ${JSON.stringify(session).slice(0, 300)}`);
  process.exit(1);
}
console.log(`session  acquired`);

const listChannels = async () => {
  const r = await fetch(`${AP4M_API_URL}/public/participant/channels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await r.json()).channels ?? [];
};

const existing = await listChannels();
const alreadyOpen = existing.find((c) => c.channel_status === "open");
if (alreadyOpen) {
  console.log(`\nAn open channel already exists — nothing to do.`);
  console.log(`channel  ${alreadyOpen.channel_id}`);
  console.log(`cap      ${Number(alreadyOpen.cap_wei) / 1e18} RLUSD`);
  console.log(`payout   ${alreadyOpen.payout}`);
  process.exit(0);
}
console.log(
  `channels ${existing.length} existing, none open (${[...new Set(existing.map((c) => c.channel_status))].join(", ") || "none"})`,
);

// --- prepare, send, record ---
const prepared = await (
  await post("/public/participant/channel-requests/prepare", { cap_rlusd: String(CAP_RLUSD) }, token)
).json();
if (!prepared.to || !prepared.data) {
  console.error(`prepare failed: ${JSON.stringify(prepared).slice(0, 400)}`);
  process.exit(1);
}
console.log(`\nprepared vault call -> ${prepared.to}`);

const tx = await wallet.sendTransaction({ to: prepared.to, data: prepared.data });
console.log(`tx sent  ${tx.hash}`);
const receipt = await tx.wait();
console.log(`mined    block ${receipt.blockNumber}, status ${receipt.status}`);
if (receipt.status !== 1) {
  console.error("the vault transaction reverted — channel not opened");
  process.exit(1);
}

let channel = await (
  await post("/public/participant/channel-requests", { tx_hash: tx.hash }, token)
).json();
if (!channel.channel_id) {
  console.error(
    `tx ${tx.hash} landed but was NOT recorded: ${JSON.stringify(channel).slice(0, 400)}`,
  );
  process.exit(1);
}
console.log(`recorded ${channel.channel_id} (${channel.channel_status})`);

const deadline = Date.now() + 180_000;
while (channel.channel_status !== "open") {
  if (channel.channel_status === "failed") {
    console.error(`channel failed: ${channel.failure}`);
    process.exit(1);
  }
  if (Date.now() > deadline) {
    console.error(`still ${channel.channel_status} after 3 minutes — re-check with probe:session`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2000));
  channel = (await listChannels()).find((c) => c.channel_id === channel.channel_id) ?? channel;
  console.log(`  …${channel.channel_status}`);
}

console.log(`\n=== CHANNEL OPEN ===`);
console.log(`channel   ${channel.channel_id}`);
console.log(`cap       ${Number(channel.cap_wei) / 1e18} RLUSD`);
console.log(`payout    ${channel.payout}`);
console.log(`merchant  ${channel.merchant_id}`);
console.log(`open tx   ${tx.hash}`);

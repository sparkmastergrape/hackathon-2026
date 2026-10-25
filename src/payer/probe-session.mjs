// Read-only AP4M session probe: sign in with the agent wallet and list channels.
// Moves no funds and creates nothing. Prints no key material and no token.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { privateKeyToAccount } = require("viem/accounts");

const API = process.env.AP4M_API_URL ?? "https://hackathon.ap4m.build";
const ENV_PATH = process.env.AP4M_ENV_PATH ?? "C:/Users/JD/Documents/Playground/ap4m-hackathon/.env";
const env = {};
for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY);
const teamName = process.env.TEAM_NAME ?? env.TEAM_NAME;
console.log(`agent     ${account.address}`);
console.log(`teamName  ${JSON.stringify(teamName)}`);

const cr = await fetch(`${API}/public/participant/challenge`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ teamName, wallet: account.address }),
});
const challenge = await cr.json();
console.log(`\nchallenge -> HTTP ${cr.status}`);
if (!cr.ok) {
  console.log(`error: ${challenge.error ?? JSON.stringify(challenge).slice(0, 300)}`);
  process.exit(1);
}
console.log(`message:\n${challenge.message}`);

const signature = await account.signMessage({ message: challenge.message });
const sr = await fetch(`${API}/public/participant/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ challengeId: challenge.challengeId, signature }),
});
const session = await sr.json();
console.log(`\nsession -> HTTP ${sr.status}`);
if (!sr.ok) {
  console.log(`error: ${session.error ?? JSON.stringify(session).slice(0, 300)}`);
  process.exit(1);
}
const token = session.token ?? session.teamToken ?? session.sessionToken;
console.log(`keys: ${Object.keys(session).join(", ")}`);
console.log(`token acquired: ${Boolean(token)}`);

const chRes = await fetch(`${API}/public/participant/channels`, {
  headers: { Authorization: `Bearer ${token}` },
});
const channels = await chRes.json();
console.log(`\nchannels -> HTTP ${chRes.status}`);
console.log(JSON.stringify(channels, null, 2).slice(0, 1500));

// --- summary ---
const list = channels.channels ?? [];
console.log(`\n=== channel summary (${list.length}) ===`);
for (const c of list) {
  console.log(
    `${c.channel_id.slice(0, 12)}… status=${c.channel_status} cap=${Number(c.cap_wei) / 1e18} RLUSD redeemed=${c.redeemed ?? "?"} merchant=${c.merchant_id?.slice(0, 10)}…`,
  );
}
const open = list.filter((c) => c.channel_status === "open");
console.log(`open channels: ${open.length}`);
console.log(`\n=== team / payment state ===`);
console.log(JSON.stringify({ team: session.team, paymentState: session.paymentState, fundingRequests: session.fundingRequests }, null, 2).slice(0, 1800));

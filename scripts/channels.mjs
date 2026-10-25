// Read-only: every channel this team has, with on-chain capacity and redeemed.
// Prints no key material and no token. Moves nothing.
import { readFileSync } from "node:fs";
import { JsonRpcProvider, Contract, Wallet, formatUnits, formatEther } from "ethers";
import { AP4M_API_URL, RPC_URL, PAYMENT_LEDGER, RLUSD, RLUSD_DECIMALS } from "../src/config/network.js";

const ENV_PATH = process.env.AP4M_ENV_PATH ?? "C:/Users/JD/Documents/Playground/ap4m-hackathon/.env";
const env = {};
for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(env.AGENT_PRIVATE_KEY, provider);
console.log(`agent ${wallet.address}`);
console.log(`gas   ${formatEther(await provider.getBalance(wallet.address))} XRP`);
const rlusd = new Contract(RLUSD, ["function balanceOf(address) view returns (uint256)"], provider);
console.log(`RLUSD ${formatUnits(await rlusd.balanceOf(wallet.address), RLUSD_DECIMALS)} held by the agent wallet`);

const post = (path, body, token) =>
  fetch(`${AP4M_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const teamName = process.env.TEAM_NAME ?? env.TEAM_NAME;
const challenge = await (await post("/public/participant/challenge", { teamName, wallet: wallet.address })).json();
const session = await (
  await post("/public/participant/session", {
    challengeId: challenge.challengeId,
    signature: await wallet.signMessage(challenge.message),
  })
).json();
const token = session.token ?? session.teamToken ?? session.sessionToken;
const { channels } = await (
  await fetch(`${AP4M_API_URL}/public/participant/channels`, { headers: { Authorization: `Bearer ${token}` } })
).json();

const ABI = ["function channels(bytes32) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)"];
const ledger = new Contract(PAYMENT_LEDGER, ABI, provider);

console.log(`\n${channels.length} channel(s):`);
for (const c of channels) {
  let onChain = "";
  try {
    const s = await ledger.channels(c.channel_id);
    const headroom = s[7] - s[8];
    onChain = `capacity ${formatUnits(s[7], 18)}  redeemed ${formatUnits(s[8], 18)}  headroom ${formatUnits(headroom, 18)} (${headroom / 10n ** 16n} calls at 0.01)`;
  } catch (e) {
    onChain = `unreadable on chain: ${e.message.slice(0, 50)}`;
  }
  console.log(`  ${c.channel_id}`);
  console.log(`    status ${c.channel_status}  payout ${c.payout}`);
  console.log(`    ${onChain}`);
}

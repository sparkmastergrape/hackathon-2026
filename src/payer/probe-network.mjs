// Verifies the AP4M network config against the live chain, and reports wallet
// readiness for Gate C. Prints addresses and balances only — never key material.
//
//   node src/payer/probe-network.mjs
//
// Everything here is read from /public/x402-context (authoritative, public) and
// then checked on-chain. Nothing is hardcoded except the service URL.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createPublicClient, http, formatUnits, formatEther, getAddress } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const API = process.env.AP4M_API_URL ?? "https://hackathon.ap4m.build";
const ENV_PATH =
  process.env.AP4M_ENV_PATH ?? "C:/Users/JD/Documents/Playground/ap4m-hackathon/.env";

const ERC20 = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    console.log(`(no .env at ${path} — skipping wallet checks)`);
  }
  return env;
}

const ctxRes = await fetch(`${API}/public/x402-context`);
if (!ctxRes.ok) throw new Error(`x402-context ${ctxRes.status}`);
const ctx = await ctxRes.json();
if (ctx.schemaId !== "ap4m.hackathon-service.x402-context.v1")
  throw new Error(`unexpected schemaId ${ctx.schemaId}`);

const chainIdFromCtx = Number(ctx.participantRequest.chainId);
const token = getAddress(ctx.x402.token);
const ledger = getAddress(ctx.x402.merchant.ledger);
const RPC = process.env.XRPL_EVM_RPC ?? "https://rpc.testnet.xrplevm.org";

console.log("=== AP4M context (public, authoritative) ===");
console.log(`network            ${ctx.network}`);
console.log(`chainId            ${chainIdFromCtx}`);
console.log(`PaymentLedger      ${ledger}`);
console.log(`token (RLUSD)      ${token}`);
console.log(`vault              ${getAddress(ctx.participantRequest.vault)}`);
console.log(`registry           ${getAddress(ctx.x402.registry)}`);
console.log(`expectedDecimals   ${ctx.participantRequest.expectedTokenDecimals}`);
console.log(`confirmationBlocks ${ctx.x402.merchant.confirmationBlocks}`);
console.log(
  `validBefore        ${ctx.x402.validBefore} (${new Date(ctx.x402.validBefore * 1000).toISOString()})`,
);

const client = createPublicClient({ transport: http(RPC) });

console.log("\n=== on-chain verification ===");
const liveChainId = await client.getChainId();
const chainOk = liveChainId === chainIdFromCtx;
console.log(`RPC                ${RPC}`);
console.log(`live chainId       ${liveChainId}  ${chainOk ? "MATCHES context" : "!! MISMATCH !!"}`);
console.log(`block              ${await client.getBlockNumber()}`);

const [symbol, name, decimals] = await Promise.all([
  client.readContract({ address: token, abi: ERC20, functionName: "symbol" }),
  client.readContract({ address: token, abi: ERC20, functionName: "name" }),
  client.readContract({ address: token, abi: ERC20, functionName: "decimals" }),
]);
const decOk = Number(decimals) === ctx.participantRequest.expectedTokenDecimals;
console.log(`token              ${name} (${symbol}) decimals=${decimals} ${decOk ? "OK" : "!! MISMATCH !!"}`);

const ledgerCode = await client.getCode({ address: ledger });
console.log(
  `ledger bytecode    ${ledgerCode && ledgerCode !== "0x" ? `${(ledgerCode.length - 2) / 2} bytes — deployed` : "!! NO CODE !!"}`,
);

const env = loadEnv(ENV_PATH);
const wallets = [];
for (const [label, key] of [
  ["AGENT", "AGENT_PRIVATE_KEY"],
  ["MERCHANT", "MERCHANT_PRIVATE_KEY"],
]) {
  if (!env[key]) continue;
  try {
    wallets.push([label, privateKeyToAccount(env[key]).address]);
  } catch {
    console.log(`${label}: key present but unusable`);
  }
}

if (wallets.length) {
  console.log("\n=== wallet readiness (Gate C prerequisites) ===");
  for (const [label, address] of wallets) {
    const [gas, bal] = await Promise.all([
      client.getBalance({ address }),
      client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [address] }),
    ]);
    const gasOk = gas > 0n;
    console.log(`${label.padEnd(9)} ${address}`);
    console.log(
      `  XRP gas  ${formatEther(gas).padEnd(22)} ${gasOk ? "OK" : "!! EMPTY — fund at https://faucet.testevm.ripple.com !!"}`,
    );
    console.log(`  ${symbol.padEnd(8)} ${formatUnits(bal, Number(decimals))}`);
  }
}

console.log("\n=== Gate C blockers ===");
const blockers = [];
if (!chainOk) blockers.push("chainId mismatch between context and RPC");
if (!decOk) blockers.push("token decimals mismatch");
for (const [label, address] of wallets) {
  if ((await client.getBalance({ address })) === 0n)
    blockers.push(`${label} (${address}) has no XRP for gas`);
}
if (!env.AGENT_PRIVATE_KEY) blockers.push("AGENT_PRIVATE_KEY not set");
// Verified 2026-10-25: onboarding IS complete and a bearer token is obtainable
// in code via signIn (see probe:session) — no portal step needed. The only
// outstanding blocker is that every channel is closed.
blockers.push(
  "no OPEN AP4M channel — run probe:session to confirm, then requestChannel (allocates 5 RLUSD, submits an on-chain tx)",
);
blockers.forEach((b) => console.log(`- ${b}`));
if (blockers.length === 1) console.log("\n(everything else for Gate C is verified)");

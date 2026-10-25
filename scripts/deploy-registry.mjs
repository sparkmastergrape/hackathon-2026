// Deploy MandateRegistry to XRPL EVM Testnet (1449000).
//
// Spends gas. Nothing else: the registry holds no funds, has no owner and no
// admin function, so a bad deployment costs XRP and nothing more.
//
//   npm run compile && npm run deploy
//
// After it lands, put the address in src/config/network.js as MANDATE_REGISTRY
// so mandates bind to the real registry instead of the placeholder.
//
// It refuses to deploy twice: if MANDATE_REGISTRY in config already has code on
// chain, it prints that and stops.

import { readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, ContractFactory, formatEther } from "ethers";
import { RPC_URL, CHAIN_ID, MANDATE_REGISTRY } from "../src/config/network.js";

const KIT = "C:/Users/JD/Documents/Playground/ap4m-hackathon";
const env = {};
for (const line of readFileSync(`${KIT}/.env`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const artifact = JSON.parse(readFileSync("build/MandateRegistry.json", "utf8"));
const provider = new JsonRpcProvider(RPC_URL);
const net = await provider.getNetwork();
if (Number(net.chainId) !== CHAIN_ID) {
  console.error(`REFUSING: RPC reports chain ${net.chainId}, expected ${CHAIN_ID}`);
  process.exit(1);
}

if (MANDATE_REGISTRY && (await provider.getCode(MANDATE_REGISTRY)) !== "0x") {
  console.log(`Already deployed at ${MANDATE_REGISTRY} — nothing to do.`);
  console.log(`(delete MANDATE_REGISTRY from src/config/network.js to deploy a fresh one)`);
  process.exit(0);
}

const wallet = new Wallet(env.AGENT_PRIVATE_KEY, provider);
console.log(`chain    ${net.chainId}`);
console.log(`deployer ${wallet.address}`);
console.log(`gas      ${formatEther(await provider.getBalance(wallet.address))} XRP`);
console.log(`bytecode ${(artifact.bytecode.length - 2) / 2} bytes`);
console.log(`compiler ${artifact.compiler}`);

const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy();
const tx = contract.deploymentTransaction();
console.log(`\ndeploy tx ${tx.hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();
const receipt = await provider.getTransactionReceipt(tx.hash);
console.log(`mined     block ${receipt.blockNumber}, status ${receipt.status}, gas ${receipt.gasUsed}`);

// Prove it works before claiming it does: the on-chain digest must equal the
// one computed locally, or every revocation we sign is unverifiable.
const { hashTypedData } = await import("viem");
const mandateId = `0x${"11".repeat(32)}`;
const onChain = await contract.revocationDigest(mandateId, wallet.address, 1n);
const local = hashTypedData({
  domain: {
    name: "AgentSpendMandateRegistry",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: address,
  },
  types: {
    Revocation: [
      { name: "mandateId", type: "bytes32" },
      { name: "approver", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
  },
  primaryType: "Revocation",
  message: { mandateId, approver: wallet.address, nonce: 1n },
});

console.log(`\n=== DEPLOYED ===`);
console.log(`MANDATE_REGISTRY = "${address}"`);
console.log(`digest on chain  ${onChain}`);
console.log(`digest locally   ${local}`);
console.log(`agree            ${onChain.toLowerCase() === local.toLowerCase()}`);
if (onChain.toLowerCase() !== local.toLowerCase()) {
  console.error("\nDIGESTS DISAGREE — do not use this registry until that is understood");
  process.exit(1);
}
console.log(`\nNow set MANDATE_REGISTRY in src/config/network.js to ${address}`);

// Revoke a Mandate: the human signs on the Ledger, the agent pays the gas.
//
//   npm run revoke -- --mandate 0x<mandateId>
//
// The relayer here is the agent's own wallet, which is the interesting part: the
// agent pays to have its own authority taken away, and cannot refuse. The
// registry checks the signature, not the sender (contracts/MandateRegistry.sol),
// so a hostile agent that declines to relay only delays the revocation until
// someone else submits the same signed bytes — it cannot prevent it, and in the
// meantime the verifier's own check is what stops the spending.
//
// Prereq: npm run speculos:up

import { readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { hashTypedData } from "viem";

import { connectSpeculosApprover } from "../device/speculos-approver.mjs";
import { REGISTRY_ABI } from "./index.js";
import { RPC_URL, CHAIN_ID, MANDATE_REGISTRY, REVOCATION_EIP712 } from "../config/network.js";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const mandateId = argOf("mandate");
if (!mandateId || !/^0x[0-9a-fA-F]{64}$/.test(mandateId)) {
  console.error("usage: npm run revoke -- --mandate 0x<32-byte mandate id>");
  process.exit(1);
}
if (!MANDATE_REGISTRY) {
  console.error("no MANDATE_REGISTRY in src/config/network.js — run `npm run deploy` first");
  process.exit(1);
}

const KIT = "C:/Users/JD/Documents/Playground/ap4m-hackathon";
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
const relayer = new Wallet(env.AGENT_PRIVATE_KEY, provider);
const registry = new Contract(MANDATE_REGISTRY, REGISTRY_ABI, relayer);

console.log(`registry  ${MANDATE_REGISTRY}`);
console.log(`mandate   ${mandateId}`);
console.log(`relayer   ${relayer.address} (pays the gas)`);

const approver = await connectSpeculosApprover({
  onScreen: (s) => {
    if (!/^Press right button/.test(s)) console.log(`    device: ${s}`);
  },
});
console.log(`approver  ${approver.address} (signs)`);

try {
  if (await registry.isRevoked(approver.address, mandateId)) {
    console.log(`\nAlready revoked by this approver — nothing to do.`);
    process.exit(0);
  }

  const nonce = BigInt(argOf("nonce", String(Math.floor(Date.now() / 1000))));
  if (await registry.nonceUsed(approver.address, nonce)) {
    console.error(`nonce ${nonce} already used by this approver — pick another`);
    process.exit(1);
  }

  const typed = {
    domain: {
      name: REVOCATION_EIP712.domainName,
      version: REVOCATION_EIP712.domainVersion,
      chainId: CHAIN_ID,
      verifyingContract: MANDATE_REGISTRY,
    },
    types: REVOCATION_EIP712.types,
    primaryType: "Revocation",
    message: { mandateId, approver: approver.address, nonce },
  };

  // Check the digest the contract will use against the one we are about to
  // sign, BEFORE asking a human to approve anything. A mismatch here means the
  // signature would be rejected on chain, and the human's attention is the
  // scarcest thing in the system — do not spend it on a doomed prompt.
  const expected = await registry.revocationDigest(mandateId, approver.address, nonce);
  const local = hashTypedData(typed);
  console.log(`\ndigest    ${local}`);
  if (expected.toLowerCase() !== local.toLowerCase()) {
    console.error(`contract expects ${expected} — refusing to ask the device to sign`);
    process.exit(1);
  }
  console.log(`          matches the contract's own revocationDigest ✓`);

  console.log(`\nasking the device to sign a revocation…`);
  const signature = await approver.signTypedData({
    ...typed,
    message: { ...typed.message, nonce: nonce.toString() },
  });

  const tx = await registry.revoke(mandateId, approver.address, nonce, signature);
  console.log(`\nrevoke tx ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`mined     block ${receipt.blockNumber}, status ${receipt.status}`);

  // Read it back. A success flag is not proof; the mapping is.
  const nowRevoked = await registry.isRevoked(approver.address, mandateId);
  const at = await registry.revokedAt(approver.address, mandateId);
  console.log(`\n=== REVOKED ===`);
  console.log(`isRevoked    ${nowRevoked}`);
  console.log(`revokedAt    ${at} (${new Date(Number(at) * 1000).toISOString()})`);
  if (!nowRevoked) {
    console.error("the transaction succeeded but the registry does not show it — investigate");
    process.exit(1);
  }
} catch (e) {
  console.error(`\nFAILED: ${e.shortMessage ?? e.message}`);
  if (e.detail) console.error(JSON.stringify(e.detail, null, 2));
  process.exit(1);
} finally {
  await approver.close();
}

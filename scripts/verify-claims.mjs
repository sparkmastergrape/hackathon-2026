// Every on-chain claim in the README, re-checked against the chain.
//
//   npm run verify-claims
//
// The README states transaction hashes, block numbers and amounts. This script
// is how those stop being assertions. For each claimed payment it does not just
// confirm a receipt exists — it decodes the `redeemVoucher` calldata and
// RECOVERS THE VOUCHER SIGNATURE, so what is verified is that *our agent's key*
// authorised *that cumulative amount* on *that channel*, and that the ledger
// accepted it. A receipt alone would only prove somebody paid something.
//
// It then reads the channel and the revocation registry back out of their
// contracts, because a success flag we logged at the time is not evidence.
//
// Reads only: no keys, no device, no writes. A judge can run it.

import { JsonRpcProvider, Contract, AbiCoder, formatUnits } from "ethers";
import { recoverPaymentVoucherSigner } from "@ap4m/sdk";
import {
  RPC_URL,
  CHAIN_ID,
  PAYMENT_LEDGER,
  MANDATE_REGISTRY,
  RLUSD_DECIMALS,
} from "../src/config/network.js";

/** The claims. Adding a row here is the only way to add one to the README. */
export const CLAIMS = [
  { gate: "C", label: "payment 1 of 6", tx: "0xcc23844975ccc7cd049870f7becccd04adc67893a0953fe4c1f52f4cccace325", block: 9228567, cumulative: "0.16" },
  { gate: "C", label: "payment 2 of 6", tx: "0x8b04746b0685b2023a043bff796bb8e3ad6d2ef8cd04a6924cc789b42bb616ae", block: 9228573, cumulative: "0.17" },
  { gate: "C", label: "payment 3 of 6", tx: "0xf92d9c0d5c8bb7f511c5f05c74aee4219a105a747a656242b1d8fd8ea0c0ee32", block: 9228574, cumulative: "0.18" },
  { gate: "C", label: "payment 4 of 6", tx: "0x61f942c14ed7450f05bfdd8777bb3e6541a220c5739d6fe6c7cecafdd32585ec", block: 9228575, cumulative: "0.19" },
  { gate: "C", label: "payment 5 of 6", tx: "0xd58f441dac4d5cc953b02fda3a9c28f435302ba697c96e43ec92d457999eae98", block: 9228576, cumulative: "0.2" },
  { gate: "C", label: "payment 6 of 6", tx: "0x452198a97ae5cbb14805eb698cf794a4c66a4ea5811b1c6ee672109aed170f66", block: 9228577, cumulative: "0.21" },
  { gate: "D", label: "device-mandated 1 of 3", tx: "0x884f69d6b1acfcac2ce1ab9e5935bc6c84e9c0e07dd55de624e47876d94303c7", block: 9228798, cumulative: "0.22" },
  { gate: "D", label: "device-mandated 2 of 3", tx: "0xbdfa0d01f731c402509d8528dad88e814b824d31cb1bc2000ba614471e7001e1", block: 9228799, cumulative: "0.23" },
  { gate: "D", label: "device-mandated 3 of 3", tx: "0xe4c9e62c60850cbe04719a07b860f87677d393bb2dd5b578167ef2a9062663d3", block: 9228800, cumulative: "0.24" },
];

/** Not payments: a deployment and a stop order. Verified differently. */
export const REGISTRY_CLAIMS = [
  { label: "MandateRegistry deployed", tx: "0xc9282ecc5288fd2406128827c573c4bb691ea1c74cefeb49b2d5af5f71a07d82", block: 9229025 },
  { label: "device-signed revocation, agent-relayed", tx: "0xb9f9864187a808147c50ecbfb9ba4cb96a03e7ad4bd937f5bc9c993db29db27e", block: 9229163 },
];

export const CHANNEL_ID = "0x6d824358aa10ae33fb4ccf7deaab5e54147d4682963faeb4334518f2e26f320b";

/** The high-water mark our own runs took the channel to. */
const OUR_HIGH_WATER = CLAIMS.at(-1).cumulative;

// As published by the kit; index 7 is capacity, 8 is redeemed, 9 the payer.
const CHANNELS_ABI = [
  "function channels(bytes32 channelId) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)",
];
const REGISTRY_ABI = [
  "function isRevoked(address approver, bytes32 mandateId) view returns (bool)",
];
const REVOKED_EVENT = [
  "event Revoked(address indexed approver, bytes32 indexed mandateId, uint256 nonce, uint256 timestamp, address relayer)",
];
const REDEEM_SELECTOR = "0x21eb2efb"; // redeemVoucher(bytes32,uint256,bytes)

const rlusd = (v) => `${formatUnits(v, RLUSD_DECIMALS)} RLUSD`;
const units = (s) => BigInt(Math.round(Number(s) * 1e6)) * 10n ** BigInt(RLUSD_DECIMALS - 6);

const provider = new JsonRpcProvider(RPC_URL);
const coder = new AbiCoder();
let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`   !! ${msg}`);
};

const net = await provider.getNetwork();
console.log(`\nRPC ${RPC_URL}`);
console.log(`chainId ${net.chainId} (expected ${CHAIN_ID}), head ${await provider.getBlockNumber()}`);
if (Number(net.chainId) !== CHAIN_ID) fail(`wrong chain: ${net.chainId} != ${CHAIN_ID}`);

const channel = await new Contract(PAYMENT_LEDGER, CHANNELS_ABI, provider).channels(CHANNEL_ID);
const [capacity, redeemed, payer, merchant] = [channel[7], channel[8], channel[9], channel[12]];

console.log(`\nPayments — receipt, then voucher signature recovered from the calldata`);
for (const claim of CLAIMS) {
  const [receipt, tx] = await Promise.all([
    provider.getTransactionReceipt(claim.tx),
    provider.getTransaction(claim.tx),
  ]);
  if (!receipt) {
    fail(`${claim.label}: ${claim.tx} is not on chain ${CHAIN_ID}`);
    continue;
  }
  if (receipt.status !== 1) fail(`${claim.label}: reverted`);
  if (receipt.blockNumber !== claim.block)
    fail(`${claim.label}: block ${receipt.blockNumber}, README says ${claim.block}`);
  if (!tx.data.startsWith(REDEEM_SELECTOR))
    fail(`${claim.label}: not a redeemVoucher call (${tx.data.slice(0, 10)})`);

  const [onChainChannel, cumulative, signature] = coder.decode(
    ["bytes32", "uint256", "bytes"],
    `0x${tx.data.slice(10)}`,
  );
  if (onChainChannel !== CHANNEL_ID) fail(`${claim.label}: settled on a different channel`);
  if (cumulative !== units(claim.cumulative))
    fail(`${claim.label}: voucher says ${rlusd(cumulative)}, README says ${claim.cumulative}`);

  let signer = null;
  try {
    signer = recoverPaymentVoucherSigner(
      { chainId: BigInt(CHAIN_ID), ledger: PAYMENT_LEDGER },
      { channelId: onChainChannel, cumulativeAmount: cumulative.toString() },
      signature,
    );
  } catch (e) {
    fail(`${claim.label}: voucher signature does not recover (${e.message})`);
  }
  if (signer && signer.toLowerCase() !== payer.toLowerCase())
    fail(`${claim.label}: voucher signed by ${signer}, channel payer is ${payer}`);

  console.log(
    `  gate ${claim.gate}  ${claim.label.padEnd(22)} block ${receipt.blockNumber}  ` +
      `cumulative ${formatUnits(cumulative, RLUSD_DECIMALS).padEnd(8)} signed by the agent ✓`,
  );
}

console.log(`\nChannel, read from the PaymentLedger contract`);
console.log(`  channel   ${CHANNEL_ID}`);
console.log(`  payer     ${payer}   (the agent's software key — it signs vouchers)`);
console.log(`  merchant  ${merchant}`);
console.log(`  capacity  ${rlusd(capacity)}   <- the only ceiling no signature can lift`);
console.log(`  redeemed  ${rlusd(redeemed)}`);
if (redeemed < units(OUR_HIGH_WATER))
  fail(`redeemed is below ${OUR_HIGH_WATER} RLUSD — our own payments are missing`);
if (redeemed > capacity) fail(`redeemed exceeds capacity, which the contract should forbid`);

// The channel is long-lived and later runs keep spending it, so the headroom is
// an operational fact worth printing rather than an assertion worth making:
// when it reaches zero, payments stop on stage, and that is the cap working.
const headroom = capacity - redeemed;
const callsLeft = headroom / units("0.01");
console.log(`  headroom  ${rlusd(headroom)}  ≈ ${callsLeft} more payments at 0.01 RLUSD`);
if (callsLeft < 5n)
  console.log(
    `   ** WARNING: fewer than 5 demo payments left on this channel. Open or top up\n` +
      `      a channel before demoing live, or the cap will stop the demo — correctly.`,
  );

console.log(`\nRegistry`);
if (!MANDATE_REGISTRY) fail("MANDATE_REGISTRY is not set in src/config/network.js");
else {
  const code = await provider.getCode(MANDATE_REGISTRY);
  console.log(`  ${MANDATE_REGISTRY}  ${(code.length - 2) / 2} bytes of code`);
  if (code === "0x") fail("no contract at MANDATE_REGISTRY");

  for (const claim of REGISTRY_CLAIMS) {
    const receipt = await provider.getTransactionReceipt(claim.tx);
    if (!receipt) {
      fail(`${claim.label}: ${claim.tx} is not on chain ${CHAIN_ID}`);
      continue;
    }
    if (receipt.status !== 1) fail(`${claim.label}: reverted`);
    if (receipt.blockNumber !== claim.block)
      fail(`${claim.label}: block ${receipt.blockNumber}, README says ${claim.block}`);
    console.log(`  ${claim.label.padEnd(40)} block ${receipt.blockNumber}  gas ${receipt.gasUsed}`);

    if (!claim.label.startsWith("device-signed revocation")) continue;

    // There is no unrevoke, so this is permanent and independently checkable.
    const iface = new Contract(MANDATE_REGISTRY, REVOKED_EVENT, provider).interface;
    const events = receipt.logs
      .filter((l) => l.address.toLowerCase() === MANDATE_REGISTRY.toLowerCase())
      .map((l) => iface.parseLog(l))
      .filter(Boolean);
    if (events.length !== 1) fail(`emitted ${events.length} Revoked events, expected 1`);
    for (const e of events) {
      const [approver, mandateId, , , relayer] = e.args;
      const still = await new Contract(MANDATE_REGISTRY, REGISTRY_ABI, provider).isRevoked(
        approver,
        mandateId,
      );
      console.log(`    approver  ${approver}   (the device)`);
      console.log(`    mandate   ${mandateId}`);
      console.log(`    relayer   ${relayer}   (the agent, paying gas for its own stop order)`);
      console.log(`    isRevoked now: ${still}`);
      if (!still) fail("the registry no longer reports that mandate as revoked");
      if (approver.toLowerCase() === relayer.toLowerCase())
        fail("approver and relayer are the same address — then nothing was delegated");
    }
  }
}

console.log(
  failures === 0
    ? `\n✅ ${CLAIMS.length} payments verified by recovered voucher signature, ` +
        `${REGISTRY_CLAIMS.length} registry transactions verified, channel and revocation state ` +
        `read from their contracts on chain ${CHAIN_ID}.\n`
    : `\n❌ ${failures} claim(s) do not hold. Fix the README, not this script.\n`,
);
process.exit(failures === 0 ? 0 : 1);

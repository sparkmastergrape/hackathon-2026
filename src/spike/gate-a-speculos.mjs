// Gate A, automated against Speculos — docs/BUILD-PLAN.md §2 Tier 0.
//
// Runs with no hardware and no human. Answers by observation:
//   #1 does signTypedData work end to end?  -> signature must recover to the device address
//   #2 what does the device DISPLAY for an unregistered ERC-7730 descriptor?
//                                           -> every distinct screen is captured verbatim
//   #3 does the default context module work without originToken?
//                                           -> ORIGIN_TOKEN env var toggles it
//
// Self-contained from a COLD container: it enables the "Raw messages" setting
// itself (DX-LOG D-013) rather than relying on NVRAM that a restart wipes.
//
// Device driving uses Speculos' own `POST /automation` rules rather than a
// hand-rolled button loop. Pressing buttons while the signer is mid-APDU
// corrupts the exchange (DX-LOG D-015), and automation is evaluated by Speculos
// against the rendered screen, so it cannot race us.
//
// Prereq: npm run speculos:up

import "reflect-metadata";
import { createRequire } from "node:module";
import { hashTypedData, recoverTypedDataAddress } from "viem";
import { buildSampleMandate, toSignerPayload, XRPL_EVM_CHAIN_ID } from "./mandate.js";

// DX-LOG D-009: the Ledger packages' published ESM builds contain a bare
// directory import ("./src") that Node refuses with ERR_UNSUPPORTED_DIR_IMPORT.
// Their CJS builds are fine, so load those via createRequire.
const require = createRequire(import.meta.url);
const {
  ConsoleLogger,
  DeviceManagementKitBuilder,
  DeviceActionStatus,
  DeviceModelId,
  LogLevel,
} = require("@ledgerhq/device-management-kit");
const { speculosTransportFactory } = require("@ledgerhq/device-transport-kit-speculos");
const { SignerEthBuilder } = require("@ledgerhq/device-signer-kit-ethereum");

const SPECULOS = process.env.SPECULOS_URL ?? "http://localhost:5010";
const ETH_PATH = "44'/60'/0'/0/0";
const ORIGIN_TOKEN = process.env.ORIGIN_TOKEN ?? "";

const screens = [];
const steps = [];
let lastScreen = "";
let recording = false;

const log = (m) => console.log(`  ${m}`);
const head = (m) => console.log(`\n=== ${m} ===`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------- speculos primitives

async function readScreen() {
  const r = await fetch(`${SPECULOS}/events?currentscreenonly=true`);
  const { events } = await r.json();
  return (events ?? []).map((e) => e.text).join(" | ");
}

async function press(key) {
  await fetch(`${SPECULOS}/button/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "press-and-release" }),
  });
}

/** Speculos automation: buttons are 1=left, 2=right; both = press 1 and 2. */
const RIGHT = [["button", 2, true], ["button", 2, false]];
const BOTH = [
  ["button", 1, true],
  ["button", 2, true],
  ["button", 2, false],
  ["button", 1, false],
];

async function setAutomation(rules) {
  const r = await fetch(`${SPECULOS}/automation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1, rules }),
  });
  if (!r.ok) throw new Error(`automation rejected: HTTP ${r.status}`);
}

const clearAutomation = () => setAutomation([]);

/**
 * Rules that walk an EIP-712 review to completion. First match wins.
 *
 * The "advance" rule is guarded by a `rev` boolean rather than being an
 * unconditional default. An unconditional rule fires on the idle home screen
 * too, which walks the device into the "App settings / App info / Quit app"
 * carousel before the review ever renders — and then the signature request
 * errors. The flag is set when a review screen appears and cleared when it ends.
 */
const SIGNING_RULES = [
  {
    regexp: "Blind signing ahead|accept risk",
    actions: [["setbool", "rev", true], ...BOTH],
  },
  {
    regexp: "Review typed|Review struct",
    actions: [["setbool", "rev", true], ...RIGHT],
  },
  { regexp: "Message signed|Message rejected", actions: [["setbool", "rev", false]] },
  { regexp: "^Sign message$|Approve|Hold to sign", actions: [...BOTH, ["setbool", "rev", false]] },
  { conditions: [["rev", true]], actions: RIGHT }, // advance, only while reviewing
];

// ---------------------------------------------------- navigation (manual, verified)

/**
 * Press "right" until the screen matches `target`, then stop. Never presses
 * "both" — the caller decides that, and only once it knows where it is. This
 * is why it cannot wander into "Quit app" and kill the session.
 */
async function goto(target, { maxPresses = 12, label = String(target) } = {}) {
  for (let i = 0; i <= maxPresses; i++) {
    const text = await readScreen();
    if (target.test(text)) return text;
    await press("right");
    await sleep(200);
  }
  throw new Error(`could not reach ${label}; last screen: ${await readScreen()}`);
}

/** Clear any pending prompt and return to the idle home screen. */
async function resetToHome({ maxSteps = 30 } = {}) {
  for (let i = 0; i < maxSteps; i++) {
    const text = await readScreen();
    if (/app is ready/i.test(text)) return text;

    if (/reject|cancel|decline/i.test(text) || /^back$/i.test(text.trim())) {
      // Explicit exit: confirm it. Clears a pending prompt or leaves a submenu.
      await press("both");
    } else if (/app settings|app info|quit app/i.test(text)) {
      // On the home carousel. It does NOT wrap on "right" — "Quit app" is the
      // last item — and "both" there would kill the app. "app is ready" is the
      // leftmost item, so walk left. Never press "both" on this carousel.
      await press("left");
    } else {
      // Inside a submenu or review: advance to find its "Back".
      await press("right");
    }
    await sleep(200);
  }
  throw new Error(`could not reach home; stuck at: ${await readScreen()}`);
}

/**
 * Ensure Settings -> "Raw messages" is Enabled. Without it the app refuses to
 * sign unregistered EIP-712 at all (DX-LOG D-013).
 */
async function ensureRawMessages() {
  await resetToHome();
  await goto(/app settings/i, { label: "App settings" });
  await press("both"); // enter
  await sleep(250);
  const row = await goto(/raw messages/i, { label: "Raw messages" });
  if (/disabled/i.test(row)) {
    await press("both");
    await sleep(250);
    const after = await readScreen();
    if (/disabled/i.test(after)) throw new Error(`toggle did not take: ${after}`);
    log(`Raw messages -> Enabled`);
  } else {
    log(`Raw messages already Enabled`);
  }
  await resetToHome();
}

/**
 * Walk the review with native press-and-release calls, recording every screen.
 *
 * Why not Speculos' own `POST /automation`: its two-button action has to be
 * expressed as four separate button events, and the app reacts to the lone
 * left-press as "previous" — the review walks backwards into "Reject message".
 * `POST /button/both` is handled natively and does the right thing, so we drive
 * it ourselves and keep automation out of the picture.
 *
 * `ready()` gates the first press: pressing while the signer is still exchanging
 * APDUs (buildContext / provideContext) corrupts the exchange and surfaces as an
 * empty GeneralDmkError (DX-LOG D-015).
 */
async function walkReview(done, ready, { maxSteps = 400, delayMs = 120 } = {}) {
  for (let i = 0; i < maxSteps && !done(); i++) {
    if (!ready()) {
      await sleep(80);
      continue;
    }
    const text = await readScreen();
    if (recording && text && text !== lastScreen) {
      screens.push(text);
      lastScreen = text;
    }
    const t = text.toLowerCase();
    // Never confirm a reject/quit screen: one cancels the signature under test,
    // the other kills the app and the session with it.
    const unsafe = /reject|cancel|decline|quit/.test(t) && !/approve|accept/.test(t);
    const confirm = /approve|sign message|accept|confirm|hold to|allow/.test(t) && !unsafe;
    await press(confirm ? "both" : "right");
    await sleep(delayMs);
  }
}

// ---------------------------------------------------- dmk plumbing

let wantsInteraction = false;

function runAction(label, { observable }, { timeoutMs = 120000 } = {}) {
  return new Promise((res, rej) => {
    const timer = setTimeout(
      () => rej(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    const resolve = (v) => { clearTimeout(timer); res(v); };
    const reject = (e) => { clearTimeout(timer); rej(e); };
    observable.subscribe({
      next: (s) => {
        const iv = s.intermediateValue ?? {};
        if (iv.step && !steps.includes(iv.step)) {
          steps.push(iv.step);
          log(`step: ${iv.step}`);
        }
        if (iv.requiredUserInteraction && iv.requiredUserInteraction !== "none") {
          wantsInteraction = true;
        }
        if (s.status === DeviceActionStatus.Completed) resolve(s.output);
        if (s.status === DeviceActionStatus.Error)
          reject(Object.assign(new Error(`${label} errored`), { detail: s.error }));
        if (s.status === DeviceActionStatus.Stopped) reject(new Error(`${label} stopped`));
      },
      error: reject,
    });
  });
}

// ---------------------------------------------------- main

const dmk = new DeviceManagementKitBuilder()
  .addLogger(new ConsoleLogger(LogLevel.Warning))
  .addTransport(speculosTransportFactory(SPECULOS, false, DeviceModelId.NANO_X))
  .build();

let sessionId;
const result = { speculos: SPECULOS, originTokenUsed: Boolean(ORIGIN_TOKEN), gateA: "not run" };

try {
  head(`Speculos at ${SPECULOS}`);
  await clearAutomation();
  log(`initial screen: ${await readScreen()}`);
  await ensureRawMessages();

  head("connect");
  const device = await new Promise((resolve, reject) => {
    let sub = null;
    let got = false;
    const timer = setTimeout(() => reject(new Error("no device discovered in 15s")), 15000);
    // DX-LOG D-010: this transport emits synchronously, so `sub` may be unset
    // inside next(). Capture it out of band.
    sub = dmk.startDiscovering({}).subscribe({
      next: (d) => {
        if (got) return;
        got = true;
        clearTimeout(timer);
        resolve(d);
      },
      error: (e) => { clearTimeout(timer); reject(e); },
    });
    queueMicrotask(() => sub?.unsubscribe());
  });
  sessionId = await dmk.connect({ device });
  log(`sessionId: ${sessionId}`);

  const args = { dmk, sessionId };
  if (ORIGIN_TOKEN) args.originToken = ORIGIN_TOKEN;
  const signer = new SignerEthBuilder(args).build();
  log(`SignerEth built ${ORIGIN_TOKEN ? "WITH" : "WITHOUT"} originToken`);

  head("getAddress (no device confirmation)");
  const addr = await runAction("getAddress", signer.getAddress(ETH_PATH, { checkOnDevice: false }));
  result.deviceAddress = addr.address;
  log(`address: ${addr.address}`);

  head("signTypedData — the Mandate");
  const mandate = buildSampleMandate({ agent: addr.address });
  result.chainId = mandate.domain.chainId;
  const digest = hashTypedData(mandate);
  result.eip712Digest = digest;
  log(`chainId: ${mandate.domain.chainId} (expected ${XRPL_EVM_CHAIN_ID})`);
  log(`local EIP-712 digest: ${digest}`);

  // Hand the review over to Speculos' automation, then just wait.
  recording = true;
  let settled = false;
  const watching = walkReview(() => settled, () => wantsInteraction);
  const signing = runAction(
    "signTypedData",
    signer.signTypedData(ETH_PATH, toSignerPayload(mandate)),
  ).finally(() => { settled = true; });

  const sig = await signing;
  await watching;
  const packed = `${sig.r}${sig.s.slice(2)}${sig.v.toString(16).padStart(2, "0")}`;
  result.signature = { ...sig, packed };

  const recovered = await recoverTypedDataAddress({ ...mandate, signature: packed });
  result.recovered = recovered;
  result.recoversToDevice = recovered.toLowerCase() === addr.address.toLowerCase();
  result.gateA = result.recoversToDevice ? "PASSED" : "FAILED (mismatch)";

  head("verdict");
  log(`recovered:  ${recovered}`);
  log(`device:     ${addr.address}`);
  log(`GATE A:     ${result.gateA}`);
} catch (e) {
  result.gateA = "FAILED (error)";
  result.error = e.message;
  result.errorDetail = e.detail ? JSON.stringify(e.detail) : undefined;
  head("FAILED");
  log(e.message);
  if (e.detail) log(JSON.stringify(e.detail, null, 2));
} finally {
  await clearAutomation().catch(() => {});
  result.stepsSeen = steps;
  result.blindSignDetected = steps.includes("signer.eth.steps.detectBlindSigning");
  result.usedLegacyPath = steps.includes("signer.eth.steps.signTypedDataLegacy");
  result.screens = screens;

  head("screens the device showed (open question #2)");
  if (!screens.length) log("(none captured)");
  screens.forEach((s, i) => log(`${String(i + 1).padStart(2, "0")}. ${s}`));

  head("machine-readable result");
  console.log(JSON.stringify(result, null, 2));

  if (sessionId) await dmk.disconnect({ sessionId }).catch(() => {});
  process.exit(result.gateA === "PASSED" ? 0 : 1);
}

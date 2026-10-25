// Tier 0 spike — docs/BUILD-PLAN.md §2.
//
// Answers, by observation rather than assertion:
//   #1 does device-signer-kit-ethereum do EIP-712?       -> signature recovers to device address
//   #2 what does the device show for an unregistered     -> DETECT_BLIND_SIGNING step + hashes
//      ERC-7730 descriptor?
//   #3 is originToken required?                          -> toggle it and see
//
// Every device-action state is logged. That log IS the deliverable of this spike.

import "reflect-metadata";
import {
  ConsoleLogger,
  DeviceManagementKitBuilder,
  DeviceActionStatus,
} from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import { hashTypedData, recoverTypedDataAddress } from "viem";
import { buildSampleMandate, toSignerPayload } from "./mandate.js";

const ETH_PATH = "44'/60'/0'/0/0";

// DMK is built ONCE and shared — the docs are explicit about this.
const dmk = new DeviceManagementKitBuilder()
  .addLogger(new ConsoleLogger())
  .addTransport(webHidTransportFactory)
  .build();

let sessionId = null;
let deviceAddress = null;
let lastMandate = null;

// ---------------------------------------------------------------- logging

const logEl = document.getElementById("log");
const stateEl = document.getElementById("state");

function log(msg, kind = "info") {
  const t = new Date().toISOString().slice(11, 23);
  const line = document.createElement("div");
  line.className = `line ${kind}`;
  line.textContent = `${t}  ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[spike] ${msg}`);
}

function setState(text, kind = "idle") {
  stateEl.textContent = text;
  stateEl.className = `state ${kind}`;
}

function show(id, obj) {
  document.getElementById(id).textContent =
    typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

/** Drive a DMK device action and log every single emission. */
function run(label, { observable, cancel }) {
  return new Promise((resolve, reject) => {
    const seenSteps = [];
    window.__cancelCurrent = cancel;
    observable.subscribe({
      next: (s) => {
        const iv = s.intermediateValue ?? {};
        if (iv.step && !seenSteps.includes(iv.step)) seenSteps.push(iv.step);
        const bits = [`${label}: ${s.status}`];
        if (iv.step) bits.push(`step=${iv.step}`);
        if (iv.requiredUserInteraction && iv.requiredUserInteraction !== "none")
          bits.push(`ACTION ON DEVICE -> ${iv.requiredUserInteraction}`);
        if ("result" in iv) bits.push(`result=${iv.result}`);
        log(bits.join("  |  "), iv.requiredUserInteraction ? "action" : "info");

        if (s.status === DeviceActionStatus.Completed) {
          log(`${label}: steps seen = [${seenSteps.join(", ")}]`, "ok");
          resolve({ output: s.output, steps: seenSteps });
        }
        if (s.status === DeviceActionStatus.Error) {
          reject(s.error ?? new Error(`${label} failed`));
        }
        if (s.status === DeviceActionStatus.Stopped) {
          reject(new Error(`${label} stopped (cancelled on device?)`));
        }
      },
      error: reject,
    });
  });
}

function signer() {
  if (!sessionId) throw new Error("Connect a device first.");
  const originToken = document.getElementById("originToken").value.trim();
  const args = { dmk, sessionId };
  // Open question #3: originToken is OPTIONAL in the type signature.
  // Leave the field blank to test whether the default context module
  // still works without it.
  if (originToken) args.originToken = originToken;
  log(`building SignerEth ${originToken ? "WITH" : "WITHOUT"} originToken`);
  return new SignerEthBuilder(args).build();
}

// ---------------------------------------------------------------- actions

async function connect() {
  setState("discovering…", "busy");
  log("startDiscovering — pick your device in the browser prompt");
  const sub = dmk.startDiscovering({}).subscribe({
    next: async (device) => {
      sub.unsubscribe();
      try {
        log(`found device: ${device.deviceModel?.model ?? "unknown model"}`);
        sessionId = await dmk.connect({ device });
        const connected = dmk.getConnectedDevice({ sessionId });
        log(`connected. sessionId=${sessionId}`, "ok");
        show("deviceInfo", {
          model: connected.modelId ?? connected.deviceModel?.model,
          name: connected.name,
          sessionId,
        });
        setState("connected", "ok");
        enable(["btnAddress", "btnSign", "btnDisconnect"]);
      } catch (e) {
        log(`connect failed: ${e.message}`, "err");
        setState("connect failed", "err");
      }
    },
    error: (e) => {
      log(`discovery error: ${e.message}`, "err");
      setState("discovery failed", "err");
    },
  });
}

async function getAddress() {
  setState("confirm the address on your device…", "busy");
  try {
    const { output } = await run(
      "getAddress",
      signer().getAddress(ETH_PATH, { checkOnDevice: true }),
    );
    deviceAddress = output.address;
    show("addressOut", output);
    log(`device address = ${deviceAddress}`, "ok");
    setState("address confirmed", "ok");
  } catch (e) {
    log(`getAddress failed: ${e.message ?? JSON.stringify(e)}`, "err");
    setState("getAddress failed", "err");
  }
}

async function signMandate() {
  setState("review the mandate on your device…", "busy");
  lastMandate = buildSampleMandate(
    deviceAddress ? { agent: deviceAddress } : {},
  );

  // Compute locally what the device ought to be signing. If the device
  // cannot render fields (open question #2), these two hashes are the
  // honest fallback from ARCHITECTURE §5.2 — the operator compares them.
  const digest = hashTypedData(lastMandate);
  show("expected", {
    eip712Digest: digest,
    domain: lastMandate.domain,
    message: Object.fromEntries(
      Object.entries(lastMandate.message).map(([k, v]) => [k, String(v)]),
    ),
  });
  log(`local EIP-712 digest = ${digest}`);

  try {
    const { output, steps } = await run(
      "signTypedData",
      signer().signTypedData(ETH_PATH, toSignerPayload(lastMandate)),
    );
    const sig = `${output.r}${output.s.slice(2)}${output.v.toString(16).padStart(2, "0")}`;
    show("sigOut", { ...output, packed: sig });
    log(`signature r/s/v received`, "ok");

    // THE actual pass/fail. A signature that does not recover to the
    // address the device reported proves nothing.
    const recovered = await recoverTypedDataAddress({
      ...lastMandate,
      signature: sig,
    });
    const match =
      deviceAddress &&
      recovered.toLowerCase() === deviceAddress.toLowerCase();

    show("verdict", {
      recovered,
      deviceAddress: deviceAddress ?? "(run Get address first)",
      recoversToDevice: deviceAddress ? match : "unknown",
      blindSignDetected: steps.includes("signer.eth.steps.detectBlindSigning"),
      usedLegacyPath: steps.includes("signer.eth.steps.signTypedDataLegacy"),
      stepsSeen: steps,
    });

    if (deviceAddress && match) {
      log("VERIFIED: signature recovers to the device address", "ok");
      setState("GATE A PASSED — EIP-712 signing works", "ok");
    } else if (!deviceAddress) {
      log("signed, but run Get address first to verify recovery", "warn");
      setState("signed — unverified", "warn");
    } else {
      log(`MISMATCH: recovered ${recovered} != device ${deviceAddress}`, "err");
      setState("GATE A FAILED — signature mismatch", "err");
    }
  } catch (e) {
    log(`signTypedData failed: ${e.message ?? JSON.stringify(e)}`, "err");
    setState("signTypedData failed", "err");
  }
}

async function disconnect() {
  if (!sessionId) return;
  await dmk.disconnect({ sessionId });
  log("disconnected", "ok");
  sessionId = null;
  deviceAddress = null;
  setState("idle", "idle");
  disable(["btnAddress", "btnSign", "btnDisconnect"]);
}

// ---------------------------------------------------------------- wiring

const enable = (ids) =>
  ids.forEach((i) => document.getElementById(i).removeAttribute("disabled"));
const disable = (ids) =>
  ids.forEach((i) => document.getElementById(i).setAttribute("disabled", ""));

document.getElementById("btnConnect").onclick = connect;
document.getElementById("btnAddress").onclick = getAddress;
document.getElementById("btnSign").onclick = signMandate;
document.getElementById("btnDisconnect").onclick = disconnect;
document.getElementById("btnCopy").onclick = () => {
  navigator.clipboard.writeText(logEl.textContent);
  log("log copied to clipboard — paste into docs/DX-LOG.md", "ok");
};

window.addEventListener("beforeunload", () => {
  if (sessionId) dmk.disconnect({ sessionId });
});

if (!("hid" in navigator)) {
  setState("WebHID unavailable — use Chrome/Edge over localhost or HTTPS", "err");
  log("navigator.hid missing. This page must run in a Chromium browser.", "err");
  disable(["btnConnect"]);
} else {
  log("WebHID available. Unlock your Ledger, open the Ethereum app, then Connect.");
}

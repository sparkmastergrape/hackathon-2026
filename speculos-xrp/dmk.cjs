/**
 * DMK -> Speculos -> XRP signer, shared wiring.
 *
 * CommonJS on purpose. DMK 1.11.0's ESM build re-exports a directory, which native
 * Node ESM rejects with ERR_UNSUPPORTED_DIR_IMPORT. The CJS build is fine.
 */

const {
  DeviceManagementKitBuilder,
  DeviceModelId,
  DeviceActionStatus,
} = require("@ledgerhq/device-management-kit");
const {
  speculosTransportFactory,
  speculosIdentifier,
} = require("@ledgerhq/device-transport-kit-speculos");
const { SignerXrpBuilder } = require("@ledgerhq/device-signer-kit-xrp");
const { firstValueFrom } = require("rxjs");

// 5100 is the container whose app.elf is mounted from C:/spx/app-xrp/bin - a stable
// path. The :5000 container mounts another session's scratchpad folder, which gets
// cleaned up, so do not depend on it for a demo.
const SPECULOS_URL = process.env.SPECULOS_URL || "http://127.0.0.1:5100";
const MODEL = DeviceModelId.NANO_X; // matches `--model nanox` on the container
const PATH_XRP = "44'/144'/0'/0/0"; // 144 = XRP. Ledger's own docs show 0' (Bitcoin) - that is a doc bug.

/** Await a DMK device action, surfacing the human-interaction prompts as they arrive. */
function runAction(action, { onPrompt } = {}) {
  return new Promise((resolve, reject) => {
    let lastPrompt = null;
    action.observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Pending) {
          const need = state.intermediateValue?.requiredUserInteraction;
          // This is the "waiting for the human" signal - the visual heart of a
          // human-in-the-loop demo. Surface it, do not swallow it.
          if (need && need !== "None" && need !== lastPrompt) {
            lastPrompt = need;
            onPrompt?.(need);
          }
        } else if (state.status === DeviceActionStatus.Completed) {
          resolve(state.output);
        } else if (state.status === DeviceActionStatus.Error) {
          reject(state.error);
        }
      },
      error: reject,
    });
  });
}

/** DMK rejects with structured objects, not Errors, so String(err) gives "[object Object]". */
function describeError(err) {
  if (!err) return "unknown";
  const parts = [
    err._tag,
    err.errorCode,
    err.message,
    err.originalError?.message,
    err.errorCode === undefined && typeof err === "object" ? JSON.stringify(err) : null,
  ].filter(Boolean);
  return parts.join(" | ") || JSON.stringify(err);
}

/** True when the device rejected - status word 0x6985. A refusal is a healthy outcome. */
function isUserRefusal(err) {
  const blob = JSON.stringify(err ?? "").toLowerCase();
  return blob.includes("6985") || blob.includes("condition of use") || blob.includes("rejected by user");
}

async function connect() {
  const dmk = new DeviceManagementKitBuilder()
    .addTransport(speculosTransportFactory(SPECULOS_URL, false, MODEL))
    .build();

  const device = await firstValueFrom(dmk.startDiscovering({ transport: speculosIdentifier }));
  const sessionId = await dmk.connect({ device });
  const signer = new SignerXrpBuilder({ dmk, sessionId }).build();
  // Never cache this across errors: the session does not survive the emulator
  // restarting, and every later call then fails while the sidecar looks broken.
  return { dmk, sessionId, signer };
}

module.exports = { connect, runAction, describeError, isUserRefusal, PATH_XRP, SPECULOS_URL, MODEL };

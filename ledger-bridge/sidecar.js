/**
 * Node sidecar: owns the Ledger device (or the Speculos emulator) and signs
 * XRPL signing payloads on request.
 *
 * The XRP signer kit is TypeScript-only and the x402 payer SDK is Python, so
 * this process is the boundary. It never sees a seed and never builds a
 * transaction — it is handed bytes, it asks a human, it returns a signature.
 *
 * CommonJS on purpose. DMK 1.11.0's ESM build is broken under native Node ESM:
 * lib/esm/index.js re-exports a DIRECTORY ("./src"), which Node's ESM resolver
 * rejects with ERR_UNSUPPORTED_DIR_IMPORT. The CJS build is fine.
 *
 * Config (all optional; defaults suit a local Speculos on its standard port):
 *   SPECULOS_URL    default http://localhost:5000
 *   SPECULOS_TOKEN  bearer token, for a hosted Speculinho session
 *   DEVICE_MODEL    NANO_S | NANO_SP | NANO_X | STAX | FLEX | APEX  (default NANO_X)
 *   DERIVATION_PATH default 44'/144'/0'/0/0
 *   PORT            default 8403
 */

const express = require("express");
const { firstValueFrom } = require("rxjs");
const {
  DeviceManagementKitBuilder,
  DeviceModelId,
  DeviceActionStatus,
} = require("@ledgerhq/device-management-kit");
// NOTE: the transport's own README says to import "@ledgerhq/device-transport-speculos".
// No such package exists — the real name has "-kit-" in it.
const { speculosTransportFactory } = require("@ledgerhq/device-transport-kit-speculos");
const { SignerXrpBuilder } = require("@ledgerhq/device-signer-kit-xrp");

const SPECULOS_URL = process.env.SPECULOS_URL || "http://localhost:5000";
const SPECULOS_TOKEN = process.env.SPECULOS_TOKEN || undefined;
const DEVICE_MODEL = process.env.DEVICE_MODEL || "NANO_X";
const DERIVATION_PATH = process.env.DERIVATION_PATH || "44'/144'/0'/0/0";
const PORT = Number(process.env.PORT || 8403);

const modelId = DeviceModelId[DEVICE_MODEL];
if (!modelId) {
  console.error(
    `DEVICE_MODEL="${DEVICE_MODEL}" is not a DMK model.\n` +
      `Known models in this DMK: ${Object.keys(DeviceModelId).join(", ")}`,
  );
  process.exit(1);
}

const dmk = new DeviceManagementKitBuilder()
  .addTransport(
    speculosTransportFactory(
      SPECULOS_URL,
      false,
      modelId,
      SPECULOS_TOKEN ? { bearerToken: SPECULOS_TOKEN } : undefined,
    ),
  )
  .build();

/**
 * Turn any thrown value into something readable.
 *
 * DMK rejects with structured error OBJECTS, not Errors, so String(err) gives
 * "[object Object]" and tells you nothing while you are trying to find out why
 * the device stopped answering.
 */
function describe(err) {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err.message) return String(err.message);
  const inner = err._tag || err.errorCode || err.originalError || err.error;
  if (inner) return typeof inner === "string" ? inner : describe(inner);
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Connect lazily and reuse the session — but DROP it on failure.
 *
 * A cached session does not survive Speculos restarting: every later call fails
 * against a session whose transport is gone, and the sidecar looks broken when
 * only its cache is. Clearing it means the next request reconnects by itself.
 */
let session = null;
function dropSession() {
  if (session) console.log("dropping stale device session; will reconnect");
  session = null;
}

async function getSigner() {
  if (session) return session;
  const device = await firstValueFrom(dmk.startDiscovering({}));
  const sessionId = await dmk.connect({ device });
  const signer = new SignerXrpBuilder({ dmk, sessionId }).build();
  session = { sessionId, signer, device };
  console.log(`connected: ${DEVICE_MODEL} session ${sessionId}`);
  return session;
}

/**
 * Drive one device action to completion.
 *
 * `onInteraction` fires whenever the device needs the human. That is the
 * "waiting for approval" signal worth putting on screen, not just in a log —
 * it is the visible half of a human-in-the-loop demo.
 */
function runDeviceAction({ observable }, onInteraction) {
  return new Promise((resolve, reject) => {
    observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Pending) {
          const need = state.intermediateValue && state.intermediateValue.requiredUserInteraction;
          if (need && need !== "None" && onInteraction) onInteraction(need);
        } else if (state.status === DeviceActionStatus.Completed) {
          resolve(state.output);
        } else if (state.status === DeviceActionStatus.Error) {
          reject(state.error);
        } else if (state.status === DeviceActionStatus.Stopped) {
          reject(Object.assign(new Error("device action stopped"), { declined: true }));
        }
      },
      error: reject,
    });
  });
}

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/health", async (_req, res) => {
  try {
    const { signer } = await getSigner();
    const config = await runDeviceAction(signer.getAppConfig());
    const address = await runDeviceAction(signer.getAddress(DERIVATION_PATH));
    res.json({
      ok: true,
      speculosUrl: SPECULOS_URL,
      model: DEVICE_MODEL,
      derivationPath: DERIVATION_PATH,
      appVersion: config && config.version,
      address: address && address.address,
      publicKey: address && address.publicKey,
    });
  } catch (err) {
    dropSession();
    res.status(503).json({
      ok: false,
      error: describe(err),
      speculosUrl: SPECULOS_URL,
      hint: "is Speculos running with the XRP app, and is SPECULOS_URL right?",
    });
  }
});

/**
 * POST /sign { signingPayloadHex }
 *   -> 200 { signatureDer, publicKey, address }
 *   -> 409 { declined: true }   the human refused; nothing was signed
 *
 * `signingPayloadHex` is the PLAIN unsigned serialization — xrpl-py's
 * binarycodec.encode(tx_json), NOT encode_for_signing(). app-xrp prepends the
 * STX\0 signing prefix itself and parses the rest as a transaction. Hand it an
 * already-prefixed payload and the four extra bytes derail its parser, which
 * surfaces as "Unexpected device exchange error happened" with the device still
 * showing its idle screen. Verified against app-xrp 2.8.2 on Speculos.
 * Do not hash it and do not add a prefix here.
 */
app.post("/sign", async (req, res) => {
  const hex = String((req.body && req.body.signingPayloadHex) || "");
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2) {
    return res.status(400).json({ error: "signingPayloadHex must be hex" });
  }

  try {
    const { signer } = await getSigner();
    const address = await runDeviceAction(signer.getAddress(DERIVATION_PATH));

    console.log(`sign request: ${hex.length / 2} bytes — waiting for the human`);
    const signature = await runDeviceAction(
      signer.signTransaction(DERIVATION_PATH, Uint8Array.from(Buffer.from(hex, "hex"))),
      (need) => console.log(`  device needs: ${need}`),
    );

    // The XRP signer returns DER bytes, NOT { r, s, v }. Its own Signature type
    // says so, and this is therefore already a finished TxnSignature.
    res.json({
      signatureDer: Buffer.from(signature).toString("hex").toUpperCase(),
      publicKey: address.publicKey,
      address: address.address,
    });
  } catch (err) {
    if (err && err.declined) return res.status(409).json({ declined: true });
    // A human pressing "Reject transaction" does NOT arrive as a Stopped device
    // action. app-xrp answers with status word 0x6985 and DMK surfaces it as an
    // ERROR: "Condition of use not satisfied (Rejected by user)". Reporting that
    // as a 500 turns the veto — the whole point of the device — into a crash.
    // Verified against app-xrp 2.8.2 on Speculos.
    const text = describe(err);
    if (/condition of use not satisfied|rejected by user|6985/i.test(text)) {
      // A refusal is a normal outcome and the session is still healthy —
      // do NOT drop it here, or the next request pays to reconnect.
      console.log("  the human REFUSED on the device");
      return res.status(409).json({ declined: true });
    }
    dropSession();
    res.status(500).json({ error: text });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`ledger sidecar on http://127.0.0.1:${PORT}`);
  console.log(`  speculos : ${SPECULOS_URL}${SPECULOS_TOKEN ? " (bearer token set)" : ""}`);
  console.log(`  model    : ${DEVICE_MODEL}`);
  console.log(`  path     : ${DERIVATION_PATH}`);
});

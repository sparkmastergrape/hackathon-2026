/**
 * The real Ledger sidecar: same HTTP contract as stub_sidecar.py, a device
 * instead of a local key.
 *
 *   node sidecar.cjs            # serves :8403 against Speculos on :5100
 *   SPECULOS_URL=... PORT=...   # overrides
 *
 * Contract (identical to the stub, so SIDECAR_URL is the only thing that moves):
 *   GET  /health -> { ok, address, publicKey, model, derivationPath, declineMode }
 *   POST /sign   -> { signatureDer, publicKey, address }   on approval
 *                   409 { declined: true }                 on refusal
 *
 * Node's http module, no framework: one fewer dependency to fail at 2am.
 */

const http = require("node:http");
const { connect, runAction, describeError, isUserRefusal, PATH_XRP, SPECULOS_URL } = require("./dmk.cjs");

const PORT = Number(process.env.PORT || 8403);
const FORCE_DECLINE = !["", "0", "false"].includes(process.env.DEVICE_DECLINE ?? "");

// Lazily held, and dropped on any error that is not a refusal. A cached session
// does not survive the emulator restarting, and every later call then fails
// while the sidecar looks broken rather than stale.
let session = null;

async function signer() {
  if (!session) session = await connect();
  return session.signer;
}

function drop() {
  session = null;
}

async function identity() {
  const s = await signer();
  const [cfg, addr] = [await runAction(s.getAppConfig()), await runAction(s.getAddress(PATH_XRP))];
  return { version: cfg.version, address: addr.address, publicKey: addr.publicKey.toUpperCase() };
}

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url.startsWith("/health")) {
      const id = await identity();
      return json(res, 200, {
        ok: true,
        stub: false,
        model: `Speculos nanox, XRP app ${id.version}`,
        // prove_device.py reads appVersion and speculosUrl by name. The version
        // being visible inside `model` is not enough - a harness checks fields,
        // not prose. Dropping either one fails a check that has nothing wrong
        // with the device.
        appVersion: id.version,
        speculosUrl: SPECULOS_URL,
        derivationPath: PATH_XRP,
        address: id.address,
        publicKey: id.publicKey,
        declineMode: FORCE_DECLINE,
      });
    }

    if (req.method === "POST" && req.url.startsWith("/sign")) {
      const body = JSON.parse((await readBody(req)) || "{}");
      const hex = body.signingPayloadHex;
      if (typeof hex !== "string" || !/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2) {
        return json(res, 400, { error: "signingPayloadHex must be hex" });
      }

      if (FORCE_DECLINE) {
        console.log(`sign request: ${hex.length / 2} bytes - REFUSED (decline mode)`);
        return json(res, 409, { declined: true });
      }

      const id = await identity();
      console.log(`sign request: ${hex.length / 2} bytes - prompting the device`);

      // Pass the payload through UNPREFIXED. app-xrp prepends STX\0 itself;
      // the Python stub adds it only because keypairs.sign hashes raw bytes.
      // Prefixing here would make the device sign the wrong preimage.
      const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
      let sig;
      try {
        sig = await runAction(await signer().then((s) => s.signTransaction(PATH_XRP, bytes)), {
          onPrompt: (p) => console.log(`  device prompting: ${p}`),
        });
      } catch (err) {
        if (isUserRefusal(err)) {
          // A refusal is a healthy outcome, not a fault. Keep the session.
          console.log("  device REJECTED - nothing signed");
          return json(res, 409, { declined: true });
        }
        drop();
        throw err;
      }

      const der = Buffer.from(sig).toString("hex").toUpperCase();
      console.log(`  signed: ${der.length / 2} bytes DER`);
      return json(res, 200, { signatureDer: der, publicKey: id.publicKey, address: id.address });
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error("sidecar error:", describeError(err));
    json(res, 500, { error: describeError(err) });
  }
});

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`ledger sidecar on http://127.0.0.1:${PORT}`);
  console.log(`  speculos : ${SPECULOS_URL}`);
  console.log(`  decline  : ${FORCE_DECLINE}`);
  try {
    const id = await identity();
    console.log(`  account  : ${id.address}  (XRP app ${id.version})`);
  } catch (err) {
    console.error(`  WARNING  : device not reachable yet - ${describeError(err)}`);
    drop();
  }
});

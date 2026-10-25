/**
 * Pre-flight check 4 + 5, in one run: sign a testnet Payment end to end on the
 * emulated device, and record exactly what the device displayed while doing it.
 *
 *   node sign-payment.cjs            # approve  -> expect tesSUCCESS
 *   node sign-payment.cjs --decline  # reject   -> expect NOTHING submitted
 *
 * The decline path is beat 4 of the pitch. It must leave no transaction at all,
 * not an abandoned one.
 */

const { Client, encode, xrpToDrops } = require("xrpl");
const {
  connect,
  runAction,
  describeError,
  isUserRefusal,
  PATH_XRP,
  SPECULOS_URL,
} = require("./dmk.cjs");

const DECLINE = process.argv.includes("--decline");
const SHOTS = process.env.SHOTS || null; // directory to save device screenshots into
const TESTNET = "wss://s.altnet.rippletest.net:51233";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function screen() {
  const r = await fetch(`${SPECULOS_URL}/events?currentscreenonly=true`);
  const { events } = await r.json();
  return events.map((e) => e.text).join(" ").trim();
}

async function press(button) {
  await fetch(`${SPECULOS_URL}/button/${button}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "press-and-release" }),
  });
  // 180ms is as fast as the emulator can redraw. Raise STEP_MS when a human is
  // watching the screen - on stage, the pause IS the point.
  await sleep(Number(process.env.STEP_MS) || 180);
}

/**
 * Page through the device's review screens, recording every one, then press the
 * approve or reject tile. Recording the screens IS the point: it is the evidence
 * for what the human can actually see before signing.
 */
async function walkAndDecide(seen) {
  const want = DECLINE ? "reject" : "sign transaction";
  for (let i = 0; i < 60; i++) {
    const text = await screen();
    if (text && text !== seen[seen.length - 1]) {
      seen.push(text);
      await shoot(seen.length, text);
    }
    const lower = text.toLowerCase();
    if (lower.includes(want)) {
      await press("both"); // confirm the highlighted tile
      return true;
    }
    await press("right");
  }
  return false;
}

/** Save the device screen as a PNG, so the demo can show the real thing. */
async function shoot(n, label) {
  if (!SHOTS) return;
  const r = await fetch(`${SPECULOS_URL}/screenshot`);
  if (!r.ok) return;
  const buf = Buffer.from(await r.arrayBuffer());
  const safe = label.replace(/[^a-z0-9]+/gi, "-").slice(0, 40).toLowerCase();
  require("fs").writeFileSync(`${SHOTS}/${String(n).padStart(2, "0")}-${safe}.png`, buf);
}

(async () => {
  const { signer } = await connect();
  const cfg = await runAction(signer.getAppConfig());
  const { address, publicKey } = await runAction(signer.getAddress(PATH_XRP));
  console.log(`device   : XRP app ${cfg.version} | ${address}`);

  const client = new Client(TESTNET);
  await client.connect();

  // A funded destination, so the payment cannot fail for tecNO_DST reasons and
  // muddy the result we are actually testing.
  const { wallet: dest } = await client.fundWallet();
  console.log(`dest     : ${dest.classicAddress}`);

  const prepared = await client.autofill({
    TransactionType: "Payment",
    Account: address,
    Destination: dest.classicAddress,
    Amount: xrpToDrops("0.001"),
    SigningPubKey: publicKey.toUpperCase(),
  });
  console.log(`tx       : 0.001 XRP | fee ${prepared.Fee} drops | seq ${prepared.Sequence}`);

  // PLAIN unsigned serialization - NOT encodeForSigning. app-xrp prepends the
  // STX\0 signing prefix itself; an already-prefixed payload derails its parser
  // and surfaces as "Unexpected device exchange error" with the device idle.
  const payloadHex = encode(prepared);

  const seen = [];
  const action = signer.signTransaction(PATH_XRP, Uint8Array.from(Buffer.from(payloadHex, "hex")));
  const signing = runAction(action, {
    onPrompt: (p) => console.log(`  [device] waiting on human: ${p}`),
  });
  // A refusal rejects this promise DURING the walk below, before anyone awaits
  // it - which Node treats as an unhandled rejection and kills the process. Park
  // a no-op catch now; the real handling happens at the await further down.
  signing.catch(() => {});
  await sleep(600); // let the first review screen render before walking it
  const decided = await walkAndDecide(seen);

  console.log(`\n--- what the device displayed (${seen.length} screens) ---`);
  seen.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s}`));
  console.log(`--- end of device screens (walked=${decided}, mode=${DECLINE ? "DECLINE" : "APPROVE"}) ---\n`);

  let sig;
  try {
    sig = await signing;
  } catch (err) {
    if (isUserRefusal(err)) {
      console.log("RESULT   : DECLINED on device. Nothing was signed, nothing submitted.");
      await client.disconnect();
      process.exit(0);
    }
    throw err;
  }

  if (DECLINE) {
    console.log("UNEXPECTED: asked to decline but the device returned a signature.");
    await client.disconnect();
    process.exit(1);
  }

  // The bytes are already canonical DER with low-S applied by the app. Hex,
  // uppercase, assign. No re-encoding.
  const der = Buffer.from(sig);
  prepared.TxnSignature = der.toString("hex").toUpperCase();
  console.log(`signature: ${der.length} bytes DER`);

  const blob = encode(prepared);
  const res = await client.submitAndWait(blob);
  const code = res.result.meta?.TransactionResult;
  console.log(`RESULT   : ${code}`);
  console.log(`hash     : ${res.result.hash}`);
  console.log(`explorer : https://testnet.xrpl.org/transactions/${res.result.hash}`);

  await client.disconnect();
  process.exit(code === "tesSUCCESS" ? 0 : 1);
})().catch(async (e) => {
  console.error("FAILED:", describeError(e));
  process.exit(1);
});

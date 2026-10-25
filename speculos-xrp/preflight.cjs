/**
 * Is the demo ready? Run this before you present. It changes nothing unless the
 * device is stuck, and it says so when it does.
 *
 *   node preflight.cjs
 *
 * Exit 0 means every check passed. Exit 1 means do not go on stage yet.
 *
 * The stuck-device check exists because of a real failure: the :5000 emulator sat
 * on "Review transaction" for hours after a signature was never answered, and
 * every later request failed with "Unexpected device exchange error". The screen
 * said nothing about the cause.
 */

const { execSync } = require("node:child_process");

const SPECULOS = process.env.SPECULOS_URL || "http://127.0.0.1:5100";
const SIDECAR = process.env.SIDECAR_URL || "http://127.0.0.1:8403";
const RPC = "https://s.altnet.rippletest.net:51234/";
const CONTAINER = process.env.CONTAINER || "speculos-ledger-approval";

let pass = 0;
let fail = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  -- ${detail}` : ""}`);
  ok ? pass++ : fail++;
  return ok;
}

async function get(url, ms = 15000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  return r.json();
}

async function screenText() {
  const { events } = await get(`${SPECULOS}/events?currentscreenonly=true`);
  return events.map((e) => e.text).join(" ").trim();
}

async function press(button) {
  await fetch(`${SPECULOS}/button/${button}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "press-and-release" }),
  });
  await sleep(250);
}

(async () => {
  console.log(`preflight: speculos ${SPECULOS} | sidecar ${SIDECAR}\n`);

  console.log("1. the container");
  try {
    const status = execSync(`docker ps --filter name=${CONTAINER} --format "{{.Status}}"`)
      .toString().trim();
    check("the emulator container is up", status.startsWith("Up"), status || "not running");
    const mount = execSync(
      `docker inspect ${CONTAINER} --format "{{range .Mounts}}{{.Source}}{{end}}"`
    ).toString().trim();
    // A scratchpad mount belongs to one session and disappears with it.
    check("its app binary is on a durable path", !/scratchpad|Temp\\?\\claude/i.test(mount), mount);
  } catch (e) {
    check("docker reachable", false, String(e.message).slice(0, 80));
  }

  console.log("\n2. the device screen");
  try {
    let text = await screenText();
    if (/review transaction|sign transaction|reject/i.test(text)) {
      // Stuck mid-approval. Clear it, or every later call fails for no stated reason.
      console.log(`  ..    device is STUCK on "${text}" - clearing it`);
      for (let i = 0; i < 40 && !/app is ready/i.test(text); i++) {
        if (/reject transaction/i.test(text)) await press("both");
        else await press("right");
        text = await screenText();
      }
    }
    check("the device is idle and ready", /app is ready/i.test(text), text);
  } catch (e) {
    check("the emulator answers", false, String(e.message).slice(0, 80));
  }

  console.log("\n3. the sidecar");
  let health = null;
  try {
    health = await get(`${SIDECAR}/health`, 45000);
    check("the sidecar reports a device", health.ok === true);
    check("it reports an app version", Boolean(health.appVersion), `app ${health.appVersion}`);
    check("it is not the stand-in key", health.stub === false);
    check("it points at this emulator", health.speculosUrl === SPECULOS, health.speculosUrl);
    check("decline mode is off", health.declineMode === false);
    const pub = Buffer.from(health.publicKey || "", "hex");
    check("the public key is 33-byte compressed", pub.length === 33, `${pub.length} bytes`);
  } catch (e) {
    check("the sidecar answers", false, String(e.message).slice(0, 80));
  }

  console.log("\n4. the money");
  if (health?.address) {
    try {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "account_info",
          params: [{ account: health.address, ledger_index: "validated" }],
        }),
        signal: AbortSignal.timeout(20000),
      });
      const result = (await r.json()).result;
      const drops = Number(result?.account_data?.Balance || 0);
      // 10 XRP is far more than the demo spends. It is a margin, not a requirement.
      check("the device account is funded", drops > 10_000_000, `${(drops / 1e6).toFixed(6)} XRP`);
    } catch (e) {
      check("testnet answers", false, String(e.message).slice(0, 80));
    }
  } else {
    check("the device account is funded", false, "no address from the sidecar");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log("DO NOT PRESENT until these pass. See LEDGER-EMULATOR.md.");
  // Set the code and let Node close its own handles. process.exit() here races
  // the still-closing fetch sockets and prints a libuv assertion after a clean
  // run - which looks like a failure to anyone reading over your shoulder.
  process.exitCode = fail ? 1 : 0;
})();

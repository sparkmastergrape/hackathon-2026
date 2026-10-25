// Drive a Payment through the XRP app on a Speculos touch device, capturing every
// screen. Captures are evidence for filings/04-clear-signing-payment.md. Nothing is
// submitted to a ledger here; the signature is produced and discarded.
//
//   MODEL=stax PORT=5002 node capture.cjs

const fs = require("fs");
const path = require("path");
const Xrp = require("@ledgerhq/hw-app-xrp").default;
const SpeculosHttpTransport =
  require("@ledgerhq/hw-transport-node-speculos-http").default;
const { encode } = require("ripple-binary-codec");

const MODEL = process.env.MODEL || "flex";
const PORT = Number(process.env.PORT || 5001);
const API = `http://127.0.0.1:${PORT}`;
const BIP32 = "44'/144'/0'/0/0";
const OUT = path.join(__dirname, "shots-" + MODEL);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(route, init) {
  const res = await fetch(API + route, init);
  if (!res.ok) throw new Error(`${route} -> ${res.status}`);
  return res;
}

async function screenEvents() {
  const res = await api("/events?currentscreenonly=true");
  const { events } = await res.json();
  return events;
}

// The sign control is a real target on screen, so press where the device says
// it is rather than at a guessed coordinate.
function centreOf(ev) {
  return [Math.round(ev.x + ev.w / 2), Math.round(ev.y + ev.h / 2)];
}

async function shot(name) {
  const res = await api("/screenshot");
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT, name), buf);
  return buf.length;
}

function finger(body) {
  return api("/finger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Screen size differs per device, so read it off a capture rather than assuming
// Flex's. A PNG carries width and height in the IHDR chunk at a fixed offset.
async function screenSize() {
  const res = await api("/screenshot");
  const b = Buffer.from(await res.arrayBuffer());
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// A touch device pages a review by swiping left. Speculos takes the gesture as a
// press at one point and a release at another.
async function swipeLeft(size) {
  const y = Math.round(size.h * 0.45);
  await finger({ action: "press", x: Math.round(size.w * 0.85), y });
  await sleep(120);
  await finger({ action: "release", x: Math.round(size.w * 0.12), y });
}

async function longPress(x, y, ms) {
  await finger({ action: "press", x, y });
  await sleep(ms);
  await finger({ action: "release", x, y });
}

async function tap(x, y) {
  await finger({ action: "press-and-release", x, y });
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const transport = await SpeculosHttpTransport.open({
    baseURL: "http://127.0.0.1",
    apiPort: String(PORT),
    timeout: 20000,
  });
  const xrp = new Xrp(transport);

  const size = await screenSize();
  console.log("model     :", MODEL, `(${size.w}x${size.h})`);

  const { publicKey, address } = await xrp.getAddress(BIP32);
  console.log("address   :", address);
  console.log("publicKey :", publicKey);

  // A deliberately rich Payment: every field we want to see rendered is set.
  const tx = {
    TransactionType: "Payment",
    Account: address,
    Destination: "rpw2Tcby6ar81Y73RyjNgqRkn4Sf7UH9Rq",
    Amount: "1000",
    Fee: "12",
    Sequence: 1,
    LastLedgerSequence: 99999999,
    DestinationTag: 4242,
    SourceTag: 402,
    InvoiceID:
      "A1B2C3D4E5F600000000000000000000000000000000000000000000000000FF",
    Memos: [
      {
        Memo: {
          MemoType: Buffer.from("x402/invoice", "utf8")
            .toString("hex")
            .toUpperCase(),
          MemoData: Buffer.from("inv-2026-10-24-0001", "utf8")
            .toString("hex")
            .toUpperCase(),
        },
      },
    ],
    SigningPubKey: publicKey.toUpperCase(),
  };

  const raw = encode(tx);
  fs.writeFileSync(path.join(OUT, "unsigned-tx.json"),
    JSON.stringify(tx, null, 2));
  fs.writeFileSync(path.join(OUT, "unsigned-tx.hex"), raw);

  let signature = null;
  let failure = null;
  const signing = xrp
    .signTransaction(BIP32, raw)
    .then((s) => (signature = s))
    .catch((e) => (failure = e));

  const log = [];
  let last = "";
  for (let step = 1; step <= 30; step++) {
    await sleep(700);
    const events = await screenEvents();
    const texts = events.map((e) => e.text);
    const joined = texts.join(" | ");

    if (joined !== last) {
      const name = String(step).padStart(2, "0") + ".png";
      const bytes = await shot(name);
      log.push({ step, file: name, bytes, texts });
      console.log(`\n[${step}] ${name}`);
      texts.forEach((t) => console.log("     " + t));
      last = joined;
    }

    if (signature || failure) break;

    const hold = events.find((e) => /hold to sign|hold to approve/i.test(e.text));
    if (hold) {
      const [x, y] = centreOf(hold);
      await longPress(x, y, 3000);
    } else {
      await swipeLeft(size);
    }
  }

  // Never block on a signature the device never produced.
  await Promise.race([signing, sleep(5000)]);
  fs.writeFileSync(
    path.join(OUT, "screens.json"),
    JSON.stringify({ model: MODEL, size, address, screens: log }, null, 2)
  );

  if (failure) {
    console.log("\nsignTransaction failed:", failure.message);
  } else {
    const hex = Buffer.isBuffer(signature)
      ? signature.toString("hex").toUpperCase()
      : String(signature).toUpperCase();
    console.log("\nsignature :", hex);
    console.log("bytes     :", hex.length / 2);
  }
  console.log("screens   :", log.length);
  await transport.close();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

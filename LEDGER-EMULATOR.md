# The Ledger layer: emulator setup, and the traps

Written 24 Oct 2026, after building and proving the path. Everything below was
observed, not read in a doc. Where something is **not** yet verified it says so.

## What is proven, and what is not

**Proven on XRPL testnet.** An `exact` x402 payment, signed by a key this Python
process never held, assembled into a blob by hand, accepted by the t54
facilitator and validated on-ledger. 17/17 checks in `prove_hardware.py`.

- `70FB55C6496786995D112ED52E10A5C3B094902D34F44F4900ACA97FA675C5BE`
- `6BD28B8FF2CFB2BD53B7381A83018BD5B2210BA1621D60E272B52E380411B9CC`

Both 1000 drops, `tesSUCCESS`, `validated: true`, `SigningPubKey` = the signer's
compressed secp256k1 key, `InvoiceID` and memo both bound.

**Not proven: the device itself.** The signer in those runs was
`stub_sidecar.py` — a local secp256k1 key behind the *same HTTP contract* the
Speculos sidecar serves. So what remains unverified is exactly one hop: whether
Speculos, running the XRP app, returns the bytes we expect. Everything on either
side of that hop is tested.

That is a deliberate split. It means the emulator can fail on Saturday morning
and the Python side is still known-good.

## The architecture

```
agent (Python)                         sidecar (Node)            Speculos
  402 challenge
  build Payment, bind invoice
  encode_for_signing  ────────────▶  POST /sign              ──▶  XRP app
                                      DMK + XRP signer kit        human approves
  assemble blob       ◀────────────  { signatureDer, publicKey }
  x402 header
```

The sidecar exists because the XRP signer kit is TypeScript-only and the x402
payer SDK is Python. It never sees a seed and never builds a transaction: it is
handed bytes, it asks a human, it returns a signature.

Two implementations of that same contract:

| | file | signer |
| :-- | :-- | :-- |
| real | `ledger-bridge/sidecar.js` | DMK → Speculos → XRP app |
| stand-in | `xrpl-x402-demo/stub_sidecar.py` | local secp256k1 key |

`GET /health` → `{ ok, address, publicKey }`.
`POST /sign { signingPayloadHex }` → `{ signatureDer, publicKey, address }`,
or **409 `{ declined: true }`** when the human refuses.

Switching between them is one environment variable. Keep it that way.

## Running the emulator

```bash
docker run --rm -it -p 5000:5000 ghcr.io/ledgerhq/speculos \
  --model nanox --display headless /speculos/apps/xrp.elf
```

Then:

```bash
cd ledger-bridge && node sidecar.js
curl http://127.0.0.1:8403/health
```

Config, all optional:

| env | default | note |
| :-- | :-- | :-- |
| `SPECULOS_URL` | `http://localhost:5000` | a hosted Speculinho URL also works |
| `SPECULOS_TOKEN` | — | bearer token for a hosted session |
| `DEVICE_MODEL` | `NANO_X` | must match what Speculos emulates |
| `DERIVATION_PATH` | `44'/144'/0'/0/0` | 144 is XRP's coin type |
| `PORT` | `8403` | |

**The emulator's account needs funding.** Call `/health`, take the address,
fund it from the testnet faucet. Its key is derived from Speculos' default
seed, so the address is stable across restarts — fund it once.

**Approval is an HTTP call, not a button.** Headless Speculos exposes
`POST /button/right` and `POST /button/both` on port 5000. With
`--display headless` nothing is on screen to click, so the approval has to be
driven. For a demo, run Speculos with a VNC or web display instead so the
audience sees the device screen and the press is real.

## The traps

**1. xrpl-py defaults to ed25519; Ledger is secp256k1.** `Wallet.create()` and
`generate_faucet_wallet()` both hand back ed25519 accounts, whose signatures
are raw 64 bytes. The Ledger XRP app signs secp256k1 and returns DER. A fixture
built on the default gives you an assembler tested against the wrong format —
it fails with `not a DER sequence` if you are lucky, and silently produces
invalid blobs if you are not. Pass `algorithm=CryptoAlgorithm.SECP256K1`
explicitly. `generate_faucet_wallet()` takes **no** `algorithm` argument: make
the wallet first, then fund it with `generate_faucet_wallet(client, wallet=w)`.

**2. The XRP signer returns DER bytes, not `{ r, s, v }`.** Its own type says
`SignTransactionDAOutput = Signature = Uint8Array`, "DER-encoded for
secp256k1… kept as raw bytes rather than being split into `{ r, s, v }` the way
the Ethereum signer does". So the return value is already a finished
`TxnSignature` — hex-encode it and set the field. No re-encoding, no low-S
folding. (The `xrpl-ledger-signing` skill said otherwise; corrected 24 Oct.)

**3. DMK 1.11.0's ESM build is broken.** `lib/esm/index.js` re-exports a
directory, which native Node ESM rejects with `ERR_UNSUPPORTED_DIR_IMPORT`. The
CJS build is fine. `ledger-bridge/package.json` therefore has **no**
`"type": "module"`, and the sidecar is CommonJS on purpose. Do not "modernise"
it.

**4. The Speculos transport's README names a package that does not exist.** It
tells you to import `@ledgerhq/device-transport-speculos`. The real name is
`@ledgerhq/device-transport-kit-speculos` — with `-kit-`.

**5. The facilitator's settlement confirmation is unreliable.** Roughly half
the runs returned HTTP 409 `settlement_status_unknown` with
`settlementAttempted: true` — while the payment was on the ledger and
validated. Treating that as a failure is how an agent pays twice. `hardware_pay`
reconciles: on that error it searches the payer's `account_tx` for a
`tesSUCCESS` Payment to the merchant with the matching `InvoiceID`, and returns
`success_unreported`. The InvoiceID is what makes this safe — it is the only
field tying a ledger entry to one quote, so a match proves *this* invoice was
paid rather than that some payment happened.

**6. Check the port is free before trusting a health check.** A stale sidecar
from an earlier run held 8403; the prover's wait-loop was satisfied by the
stranger, the process it started died of "address in use" unread in its log,
and every check failed against the wrong server. `prove_hardware.py` now
refuses to start if something already answers. This is the second time this
exact shape of bug cost real time — the first was port 8000.

**7. `SourceTag` must mirror the quote.** If the requirement carries
`extra.sourceTag` and the transaction omits it, verification fails with
`source_tag_mismatch` — which reads like a signature problem and is not.

## Pre-flight on the emulator

In order, cheapest first. Stop at the first failure; each one invalidates the rest.

1. `curl localhost:5000/events` — Speculos is up and running the XRP app.
2. `curl localhost:8403/health` — DMK connects, `getAppConfig` returns a
   version, `getAddress` returns an address on `44'/144'/0'/0/0`.
3. The address matches what you funded, and the public key is 33 bytes
   starting `02` or `03`.
4. `SIDECAR_URL=http://127.0.0.1:8403 py prove_hardware.py` — the same 17
   checks that pass against the stand-in, now against the device.
5. Watch what the device **displays** while signing. If it shows an opaque
   hash rather than destination and amount, the "a human reads the real
   destination" claim does not hold, and the beat has to be stated differently.
   This is unverified and is the one thing that could change the pitch.

Step 4 is the whole hardware story. Step 5 decides how honestly it can be told.

## What to say, and what not to

The claim is: *an AI agent with a wallet, a spending ceiling it cannot exceed,
and a human veto rooted in hardware.* The ceiling is consensus-enforced — a
`CheckCash` above `SendMax` is refused by the ledger, not by our code. The veto
is a device press.

If the demo runs on the emulator, say "emulator". If it runs on the stand-in
signer, say that too — it proves the bridge, not the hardware. A judge who
catches the gap discounts everything else; one who is told plainly does not.

---

# VERIFIED ON THE EMULATOR — 24 Oct 2026

The device hop is no longer unverified. `prove_device.py`: **17 passed, 0 failed**
against Speculos running Ledger's own `app-xrp` **2.8.2** on an emulated Nano X.

Settled on testnet, signed on the device:
`9989EABF0FDBC7ED2197609D8A212DF422829235E90CC108DB35C181529E7C08`
(and `67AFADBD…F8BBA6`, `8632FAD8…3E774AF` from earlier runs) — `tesSUCCESS`,
paid by the device's account, `SigningPubKey` the device's key, InvoiceID and
memo bound.

## Clear signing works. The beat is honest.

This was the open question that could have changed the pitch. The device
displays, one screen at a time:

```
Review transaction
Transaction Type | Payment
Account          | ra7Zr8ddy9tB88RaXL8B87YkqhEJG2vkAJ
Source Tag       | 20260530
Invoice ID (1/2) | 2227e000bf9e86edc2c0a77052f25ec4122fb57ff1150457969d0e60
Invoice ID (2/2) | 964521ce
Amount           | XRP 0.001
Fee              | XRP 0.00001
Destination      | rMNL5bR3CJEmJpR6TXbvTMSEwr79RX3AE3
Memo Data [1]    | A9D47874D3B34C599D4A01D7A28A55BD
Sign transaction?
Reject transaction
```

Not a hash. Amount in XRP, the full destination, the source tag, and both
invoice bindings, then an explicit choice. **"The owner reads the real
destination and amount on the device" is a claim we can make.** Say "emulator".

## Getting the app binary

There is no published XRP app ELF, and the Speculos image ships without apps.
Ledger's CI has one: artifact `compiled_app_binaries` on `LedgerHQ/app-xrp`,
which carries `nanox/bin/app.elf` plus nanos2, flex, stax and apex_p. Needs a
GitHub token with `repo`:

```bash
gh api "repos/LedgerHQ/app-xrp/actions/artifacts?per_page=100" \
  --jq '.artifacts[] | select(.name=="compiled_app_binaries" and .expired==false) | "\(.id) \(.created_at) \(.workflow_run.head_branch)"'
gh api "repos/LedgerHQ/app-xrp/actions/artifacts/<id>/zip" > app.zip
```

Artifacts expire, so re-fetch rather than relying on an old download.

## Five more traps, all found the hard way

**8. The device wants the PLAIN serialization, not the signing payload.**
app-xrp prepends `STX\0` itself. Send `encode_for_signing()` output and the four
extra bytes derail its parser — reported as **"Unexpected device exchange error
happened"** with the device still on its idle screen, a message that tells you
nothing. Send `binarycodec.encode(tx_json)`. This is the single most expensive
mistake available here, and the `xrpl-ledger-signing` skill had it wrong.
Consequence: the wire contract for `/sign` is "the unsigned serialized
transaction", and each signer behind it does its own prefixing — the stand-in
sidecar now prepends `53545800` before signing so it matches the device.

**9. A refusal arrives as an ERROR, not as a stopped action.** Pressing "Reject
transaction" makes app-xrp answer status word `0x6985`, which DMK surfaces as an
error: *"Condition of use not satisfied (Rejected by user)"*. Report that as a
500 and the veto — the entire point of the device — looks like a crash. The
sidecar now maps it to **409 `{declined: true}`** and deliberately does NOT drop
the session, since a refusal is a healthy outcome.

**10. Never cache a DMK session for the process lifetime.** A session does not
survive Speculos restarting; every later call fails and the sidecar looks broken
when only its cache is. It now drops the session on any error that is not a
refusal, so the next request reconnects by itself.

**11. DMK rejects with structured objects, not Errors.** `String(err)` gives
`"[object Object]"`, which is useless exactly when you need it. The sidecar has a
`describe()` that digs out `message`, `_tag`, `errorCode` or falls back to JSON.

**12. Killing the sidecar takes Speculos down with it.** The emulated app exits
255 when its APDU client disconnects. So the restart order is fixed: **sidecar
down, Speculos restarted, sidecar up** — and do it in one shell, because killing
the sidecar between steps silently kills the emulator you just started.

**13. Git Bash mangles docker arguments.** `-v "$dir:/apps"` and
`/apps/nanox/bin/app.elf` get rewritten to Windows paths, so Speculos tries to
open `/speculos/C:/Program Files/Git/apps/...`. Prefix the command with
`MSYS_NO_PATHCONV=1`.

## Driving approval

Headless Speculos has no screen to press. Approval is HTTP:

```bash
curl "http://127.0.0.1:5000/events?currentscreenonly=true"      # what it shows
curl -XPOST http://127.0.0.1:5000/button/right -d '{"action":"press-and-release"}'
curl -XPOST http://127.0.0.1:5000/button/both  -d '{"action":"press-and-release"}'
```

`prove_device.py`'s `Autopilot` walks the review screens and then approves or
rejects. Two notes on it:

- Match `"sign transaction"` as a **substring**. The screen reads "Sign
  transaction?" with a question mark; an exact match walks straight past it onto
  "Reject transaction" — the opposite of what you wanted.
- Once the review starts, press right on **every** screen. Matching named
  screens stalls the moment the app shows one you did not list, and the sign
  request then hangs until it times out.
- Known quirk, not understood: the autopilot reports `acted=False` on the reject
  path even though the device demonstrably refused. The proof of refusal is the
  device's own `0x6985` and the twelve recorded screens, not the harness flag —
  which is why the test no longer asserts on it.

**For the demo, do not run headless.** Give Speculos a display so the audience
sees the screen and the press is a real press.

---

# What the ledger actually refuses — measured 24 Oct 2026

`xrpl-x402-demo/replay_probe.py`, testnet. "The ledger refuses the replay" is
three different claims and only two of them are true.

| | attempt | result |
| :-- | :-- | :-- |
| A | the same signed `Payment`, submitted twice | **`tefPAST_SEQ`** |
| B | a NEW `Payment` reusing the SAME `InvoiceID` | **`tesSUCCESS`** |
| C | the same signed `CheckCash`, submitted twice | **`tefPAST_SEQ`** |
| D | a NEW `CheckCash` against an already-cashed Check | **`tecNO_ENTRY`** |

**B is the trap.** XRPL does **not** enforce `InvoiceID` uniqueness. A second
payment carrying an identical InvoiceID settles normally. So any narration of
the form "the replayed invoice is refused by the ledger" is false — in the same
way that crediting the VI mandate with enforcing a ceiling was false, and in
front of the same people.

What is defensible:

- **Sequence exhaustion** (A, C) — a signed transaction can be submitted once.
- **Check consumption** (D) — cashing deletes the Check object, so a second
  cash finds nothing. This is the same consensus-enforced story as `SendMax`.

Pick one of those two and name it precisely. Note also that B is why the
`settlement_status_unknown` reconciliation matches on InvoiceID **plus** sender,
destination and `tesSUCCESS`, and is a read rather than a uniqueness guarantee:
the ledger would happily accept a second payment for the same invoice, so the
reconciler has to be the thing that refuses to pay twice.

---

# The clear-signing finding, scoped — 24 Oct 2026

Ledger's own page for this event, `developers.ledger.com/xrplnyc`, says verbatim:

> "there is still no XRPL transaction Clear Signing"

and, of the layer above the signer kit:

> "nothing above it understands the types yet, so there are no type-aware
> helpers and no Clear Signing."

It also says "the device app can sign a wide range of XRPL transactions", that
"the Device Management Kit's XRP signer landed days ago as a pre-release", and
invites exactly this work: *"Prototype human-readable previews for XRPL
transactions"*, *"find where it breaks, and extend it toward the transaction
types it does not cover yet"*.

**What we measured contradicts the blanket sentence, for Payment only.** app-xrp
2.8.2 on an emulated Nano X displays transaction type, account, source tag, both
invoice bindings, the amount as "XRP 0.001", the full destination address and
the memo, then offers an explicit refusal. Screen list is in the VERIFIED
section above.

**Scope the claim to `Payment`.** We have not looked at NFT, AMM, Escrow,
Payment Channel or multisig display — which is precisely where their page says
it breaks. "XRPL clear signing works" in general is an overreach in the other
direction and one Escrow test would refute it.

The defensible sentence:

> Your page says there is still no XRPL transaction Clear Signing. We found the
> Payment path already displays every field a human needs — here is the screen
> dump — so the gap is the layer above it and the transaction types beyond
> Payment.

Accurate, generous rather than gotcha, and it answers their own invitation with
evidence. Their Protocol Innovation prize counts bug reports and PRs, so a
precisely scoped report is a legitimate artifact — JD's call whether to file it,
and the Payment scoping must be explicit or it gets dismissed in one reply.

---

# Ledger's docs are wrong about the XRP signer's return type — 24 Oct 2026

`developers.ledger.com/docs/device-interaction/references/signers/xrp` documents

```
signTransaction(derivationPath, transaction: Uint8Array, options?)
  -> { r: string; s: string; v?: number }
```

**It returns DER bytes, not three fields.** Three convergent lines of evidence:

1. The installed package's own type docs: `SignTransactionDAOutput = Signature =
   Uint8Array`, described as "DER-encoded for secp256k1… kept as raw bytes
   rather than being split into `{ r, s, v }` the way the Ethereum signer does."
   That last clause reads like the docs page was copied from the ETH signer.
2. `sidecar.js` does `Buffer.from(signature).toString("hex")` and never touches
   `.r` or `.s`. `Buffer.from()` on a plain object would throw rather than
   produce a valid signature.
3. The bytes reached `TxnSignature` through `hardware_pay` with **no encoding
   step** — `der_encode_signature()` is used only in the self-test and an unused
   `r`/`s` branch — and the ledger accepted them. From
   `9989EABF…529E7C08`, `tesSUCCESS`:

```
3044022023A996B45D7B0578C5209204C007FFFB8891E5FF90AED72DE9C0BDE2C1592B24
022036DBF5F97F3F54DB258BC6E4DDB5D73A71247BA512FE65C41C9845A9DB83B0CF
```

`30` SEQUENCE, declared length 68 matching actual, `02 20` + 32-byte r,
`02 20` + 32-byte s. A `{r, s, v}` object cannot become that by accident.

**Length varies: 70 and 71 bytes both observed.** DER drops or keeps a leading
zero depending on the high bit of r and s, so never assume a fixed width.

Not directly logged: the resolved object's runtime type. The three lines above
settle it, but if someone wants belt-and-braces, log what `signTransaction`
resolves to before `Buffer.from`.

**Two encodings of the same shape live in this project.** XRPL `TxnSignature`
wants DER; Verifiable Intent's SD-JWT ES256 signatures are 64-byte raw `r||s`.
Different curves, so nothing is reusable, but a DER signature fails a
raw-expecting verifier and vice versa, and the assembly step is where it bites.

Worth filing: a documented return type that does not match the shipped kit will
cost every following integrator the same afternoon.

---

# ✅ The device hop is now proven — 24 Oct, 18:5x

**"Not proven: the device itself" at the top of this file is out of date.** The one
remaining hop — *does Speculos running the XRP app return the bytes we expect* — was
closed by a direct end-to-end run.

**Approve path:**

```
device   : XRP app 2.8.2 | ra7Zr8ddy9tB88RaXL8B87YkqhEJG2vkAJ
tx       : 0.001 XRP | fee 12 drops | seq 21508507
signature: 70 bytes DER
RESULT   : tesSUCCESS
hash     : D294CFBB4044556133849D953E8D97B91AB6A0659374E832E433762AC9F5170C
```

https://testnet.xrpl.org/transactions/D294CFBB4044556133849D953E8D97B91AB6A0659374E832E433762AC9F5170C

**Decline path:** reject on device → `RESULT: DECLINED on device. Nothing was signed,
nothing submitted.` Clean exit 0, no transaction on-ledger.

**What this does and does not prove.** It proves the device leg: real app, real signature,
hand-assembled blob, accepted by consensus. It does not re-prove the x402/facilitator leg in
the same process — this run used `xrpl.js` directly, not the Python x402 payer.

## ✅✅ And then the halves were joined — `prove_device.py`, 17/17

**The last untested step is now tested.** `py prove_device.py` against the live sidecar and the
real emulated device: **17 passed, 0 failed.**

```
2. confirm it on testnet
  PASS  tesSUCCESS
  PASS  the device's account paid - ra7Zr8ddy9tB88RaXL8B87YkqhEJG2vkAJ
  PASS  signed by the device's key
  PASS  InvoiceID is bound
  PASS  a memo carries the invoice
3. the veto - refused on the device itself
  PASS  status is declined, not an error
  PASS  nothing was signed
4. the cap is checked before the device is troubled
  PASS  an over-cap quote is refused locally - quoted 1000 drops, cap 1
```

https://testnet.xrpl.org/transactions/0D4C4A05C4E88B71C3278EB01BFA6F7EAEDA120134D181BBC31BEBCC005BE1EA

**The device screens in the x402 run show MORE than a bare Payment** — and this is the pitch
asset. The human sees the invoice binding itself, not just an amount:

```
 3. Transaction Type | Payment        8. Amount | XRP 0.001
 4. Account | ra7Zr8ddy9tB88RaXL8     9. Fee | XRP 0.00001
 5. Source Tag | 20260530            10. Destination | rMNL5bR3CJEmJpR6T...
 6. Invoice ID (1/2) | bd9813c0f3... 11. Memo Data [1] | DD006F3F23EF48A3B...
 7. Invoice ID (2/2) | 3ec8f62bb     12. Sign transaction?
```

So the claim is not merely "a human approved a payment". It is **"a human read the invoice this
payment settles, on a screen the agent cannot draw, and refused it."** Say it that way.

⚠️ **Two sidecars now exist. Know which is running.**

| File | Port | Speculos | Notes |
| :--- | :--- | :--- | :--- |
| `sidecar.js` (earlier session) | 8403 | **:5000** | what 17/17 ran against; currently live |
| `speculos-xrp/sidecar.cjs` | 8403 | **:5100** | spare, same contract, stable ELF mount |

They collide on :8403 — the second to start dies with `EADDRINUSE`. The live one depends on
the `:5000` container, whose ELF is mounted from a disposable scratchpad directory. **If that
container dies, stop `sidecar.js` and run `node speculos-xrp/sidecar.cjs` instead**; the
contract is identical, so `prove_device.py` needs no change.

## Scripts

In [`speculos-xrp/`](speculos-xrp). CommonJS, because DMK 1.11.0's ESM build is broken.

```bash
cd speculos-xrp
node get-address.cjs            # pre-flight 3: address + app version
node sign-payment.cjs           # pre-flight 4: approve -> tesSUCCESS
node sign-payment.cjs --decline # beat 4: reject -> nothing submitted
SHOTS=./shots node sign-payment.cjs --decline   # + save device PNGs
```

Versions pinned and installed: DMK **1.11.0**, `device-signer-kit-xrp` **0.3.0** (not 0.2.0 —
Ledger shipped 0.3.0 on 23 Oct), `device-transport-kit-speculos` **1.3.0**, `xrpl` **5.3.0**.

## ⚠️ Two traps found tonight

**1. Use the :5100 container, not :5000.** Both run nanox + app-xrp 2.8.2, but:

| Container | Port | ELF mount | Safe? |
| :--- | :--- | :--- | :--- |
| `speculos-ledger-approval` | 5100 | `C:/spx/app-xrp/bin` | ✅ stable path |
| `speculos-xrp` | 5000 | another session's scratchpad dir | ❌ gets cleaned up |

A scratchpad folder belongs to the session that made it and disappears with it. Demoing off
:5000 is a demo that stops working for no visible reason. `dmk.cjs` defaults to 5100.

**2. A refusal rejects the signing promise mid-walk.** The approval loop runs *while*
`signTransaction` is pending, so the rejection lands before anything awaits it — and Node
kills the process with `ERR_UNHANDLED_REJECTION`. Beat 4 crashes instead of declining. Park a
no-op `signing.catch(() => {})` at creation and handle it at the real `await`.

## What the device displays — 8 screens, verbatim

```
1. Review transaction          5. Fee XRP 0.000012
2. Transaction Type Payment    6. Destination rHGDUX3junT6yubnV C5Sea4Dj6TjCjwHRn
3. Account ra7Zr8ddy9tB88RaXL8 7. Sign transaction?
4. Amount XRP 0.001            8. Reject transaction
```

Rendered PNGs exist locally but are **withheld** and deliberately untracked. See
`workspace/_core/CONVENTIONS.md` rule 16.

**Driving it headlessly** — this is also how the demo advances the device on stage:

```bash
curl -s "http://127.0.0.1:5100/events?currentscreenonly=true"   # read the screen
curl -sX POST http://127.0.0.1:5100/button/right -H 'Content-Type: application/json' \
     -d '{"action":"press-and-release"}'                        # page forward
curl -sX POST http://127.0.0.1:5100/button/both  -H 'Content-Type: application/json' \
     -d '{"action":"press-and-release"}'                        # confirm the tile
curl -s http://127.0.0.1:5100/screenshot -o screen.png          # capture it
```

## Rebuilding the ELF, if C:/spx is ever lost

`ghcr.io/ledgerhq/speculos:latest` ships **no app binaries** — only `cxlib`/`sharedlib`. The
XRP app must be built: `LedgerHQ/app-xrp` has **no GitHub releases**, so clone it and build
with `ghcr.io/ledgerhq/ledger-app-builder/ledger-app-builder-lite` (both already pulled).
⚠️ On Windows the plain clone silently half-fails — 6,783 files did not check out. Use
`git clone -c core.longpaths=true` and verify with `git status --porcelain | wc -l` before
building on top of it.

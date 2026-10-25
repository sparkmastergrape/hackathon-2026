# Pre-flight — everything to have done before Sat 24 Oct, 10:00

Rule in force: *"Only what you build during the hackathon counts toward judging."*
Everything here is **environment, not project code**. None of it is a submission artifact.

---

## Done ✅

- [x] **Registered** for the event
- [x] **Python toolchain verified** — 3.14.3, venv, `x402-xrpl` 0.3.4 + `xrpl-py` 5.2.0 install clean
- [x] **Node toolchain verified** — v24.14.0, npm 11.9.0
- [x] **Testnet wallets funded** — merchant `rMNL5bR3…X3AE3`, agent `rf92bZ3S…bH2vz`, plus two
      spares minted 23 Oct (see faucets below). ⚠️ **The faucet rate-limits hard.** Fund every
      account you will need *before* Saturday; never call the faucet in a loop on the day.
- [x] **Facilitator reachable** — `https://xrpl-facilitator-testnet.t54.ai/supported` returns 200,
      advertising `exact`, `upto` and `batch-settlement` on `xrpl:1`, plus the `x402Secure` extension
- [x] **Stack proven end to end** — a real payment settled and was verified on-ledger
      (throwaway spike; not to be submitted)
- [x] **Offline package cache** — `prep/offline-cache/`, **65+ files**: every Python wheel plus
      the three Ledger npm tarballs. Venue wifi cannot block the install. **`rich` added 23 Oct**
      (with `markdown-it-py`, `mdurl`, `pygments`), plus `websockets` and `requests` — the
      display and the endpoint checker were the dependencies the cache was missing
- [x] **Terminal layout solved ahead of time** — `prep/layout-reference/`, a throwaway three-pane
      `rich` sketch driven by fake events, no protocol code in it at all. Verified under rich
      14.3.3 and 15.0.0. Three traps already found and written up: cp1252 stdout killing the
      glyphs mid-render, panes needing `vertical="bottom"`, and hand-tuned character budgets.
      Saturday's UI is transcription, not design
- [x] **Skills installed** — `xrpl-x402`, `xrpl-ledger-signing`, `xrpl-agent-wallet`,
      `xrpl-payments`, and Ledger's own `ledger-dmk-implementation`, `dmk-intent-vocabulary`,
      `dmk-business-logic`

---

## Do tonight — admin that is worth more per minute than any code

Verified 23 Oct. **$46,000 total prizes**, and roughly **$18,000 is reachable by the build that
is already planned.** Details in `MVP-SCOPE.md` under "The money".

### There is no way to message a mentor before the event

Verified: the platform's Mentors tab is a roster with names and job titles only — no contact
details, no DMs, and no Discord or Telegram anywhere on the site. Luma offers "Contact the
Host", which reaches XRPL Commons, not Ledger. Luma registration is now **closed**, so there is
no onboarding flow to join either.

**The ask is in person, and the move is to arrive at 8:30 for breakfast rather than 10:00** —
that hour is the only unstructured mentor time before the opening.

**The four named Ledger mentors**, so you know who to look for: **Akram El Milligy** (DevRel/PM),
**Etienne Waldron** (DevRel/PM), **Eva Mirza** (Product Manager), **Olivier Freyssinet**. DevRel
is who lends hardware; start with the first two. Script is in `LEDGER-ASK.md`.

**Also in the room: six Mastercard people, two of them AP4M engineers** — Ao Li and Katie Li are
both "Software Engineer, AP4M", plus three Agentic Commerce leads and a Digital Assets director.
The AP4M line in `PITCH.md` has to be exactly right, because the people who built it will be
standing there. And **Frank He, Founding Engineer at t54 Labs** — the facilitator's authors.

### The list

- [!] ⚠️ **SUPERSEDED 24 Oct by the opening keynote — see "What the slides changed" below.**
      The finding under this item was true of Mastercard's *public* developer portal and false
      of the hackathon. There **is** an AP4M builder stack, handed to teams on the day.
- [x] **Mastercard developer portal: nothing to configure. Do not sign up.** Checked their own
      machine-readable product index (`developer.mastercard.com/llms.txt`, 548 KB, every product
      and service). **Zero matches for AP4M, zero for x402, zero even for "Verifiable Intent"** —
      the term is all over their marketing and absent from every developer doc. The only agentic
      product is **"Agent Suite for Merchants"** (card-rails, merchant-side), with the agentic
      guides filed under Merchant Cloud. None of it touches an XRPL x402 flow.
      `developer.mastercard.com/dashboard` is a login wall and irrelevant here
- [ ] **Fill Mastercard's form** — `https://form.mastercard.com/jfe/form/SV_ewCgmPZvQhIzx8G`.
      Three fields: **Team Name**, **Primary Contact Email**, **XRPL EVM Wallet Address for
      Funding**. ⚠️ **That third field changes the picture** — Mastercard intends to fund an
      address on the **XRPL EVM sidechain**, not the `xrpl:1` testnet this project targets.
      Their $6,000 may therefore need an EVM-side component rather than being free. Fill the
      form regardless (it costs nothing and reserves your place), but **do not assume the prize
      is on-path** until someone from Mastercard tells you what qualifies. Ask one of the AP4M
      engineers on Saturday morning — they are right there
      ✅ **The third field is answered.** A testnet EVM wallet was saved to Drive today
      (`javaris-testnet-funding-wallet.txt`) — paste
      **`0x37F2F4166646Ea3cea94BB37BaBD88a01F52A7A2`** into the funding field. Verified 24 Oct
      against chain 1449000: balance **0**, nonce **0** — a fresh, never-used address, which is
      exactly what you want in a funding field. The faucet 429 below is now irrelevant for the
      form; Mastercard funds it, you don't. ⚠️ That file holds the **private key in plain text in
      Drive**. It is testnet-only and labelled never-reuse, so the money risk is zero — but
      delete it after the weekend rather than leaving a key lying in Drive, and never reuse that
      key on an EVM mainnet
- [x] **Quicknode: done, on XRP Testnet, and it cost nothing.** No deletion and no upgrade were
      needed in the end. The endpoint `tiniest-sly-owl` was XRP **Mainnet**, and the Free plan
      caps you at one endpoint — but the endpoint has a **"Multi-chain support"** switch, and
      turning it on exposes a network picker that includes **XRP Testnet**. Switched. The
      hostname changes from `xrp-mainnet` to `xrp-testnet`, same token.
      HTTPS and WSS URLs are in `prep/.env` (**secret — the path segment is the auth token**;
      a `.gitignore` now covers `prep/.env` and `prep/wallets.json`).
      **All checks pass**, and Quicknode is faster than the public node: ~326ms vs ~519ms, and
      a WSS ledger message arrived in 0.1s.
      Two things learned that matter on the day:
      - **Quicknode serves XRPL through Clio**, a read-optimised API server. Clio reports
        `clio_version` and `complete_ledgers` but **has no `server_state`**, so a naive health
        check calls a perfectly good endpoint dead. `verify_endpoints.py` now detects Clio and
        checks the ledger range instead.
      - **Submission works through Clio** — verified, not assumed: a real 1000-drop Payment
        between two spare wallets returned `tesSUCCESS`, `validated: true`. Beat 2's submit
        path is safe on this endpoint.
      If Quicknode is ever blocked at the venue, commented-out public fallbacks sit in
      `prep/.env` — swapping back is one line.
- [ ] **Join the Quicknode track** on the platform — *"join the Quicknode track to be eligible"*
- [ ] **Join Ledger's Agentic Finance track** (and Protocol Innovation, for the bug-report
      angle) on the platform — needs you signed in, so it has to be you
- [x] **Endpoint checker written and verified** — `prep/verify_endpoints.py`, passing against
      public endpoints for XRPL HTTP, XRPL WSS and the EVM sidechain. Paste your URLs into
      `prep/.env` and run it. It proves a WSS message actually *arrives*, not just that the
      socket opens. It caught one thing worth knowing: **XRPL EVM testnet is chain ID 1449000,
      not the 1440000 on Ledger's prize page, which is mainnet**
- [x] **Faucets sorted, and one assumption killed.** **Quicknode's multi-chain faucet does NOT
      cover XRPL** — it lists EVM chains and Solana only, so the official Ripple faucet is the
      single source of testnet XRP and its rate limit is a real risk on the day.
      `prep/fund_testnet.py` handles it: mints accounts 12s apart, writes secrets straight to
      `prep/wallets.json` (**never printed**, so it is safe to run on a shared screen), saves
      after every mint, and falls back to **devnet**, a separate faucet with its own quota.
      **Two spare testnet accounts minted and confirmed at 100 XRP each.** Mint any more you
      want tonight, not tomorrow. Gotcha found and handled: the faucet returns an account
      *before* the funding payment validates, so an immediate balance check says "NOT FUNDED"
      when nothing is wrong.
      ⚠️ **`https://faucet.xrplevm.org` returned HTTP 429** on a first, single request — if you
      need an EVM testnet balance for Mastercard's form, start early; it throttles by IP
- [x] **Clear signing: answered 24 Oct, by measurement, and the answer is the OPPOSITE.**
      Ledger's prize page does say *"there is still no XRPL transaction Clear Signing"* (real
      quote, verified on the live page). But app-xrp 2.8.2 under Speculos shows the full
      destination, the amount as "XRP 0.001", source tag, both invoice bindings and the memo
      before offering an explicit refusal. The earlier entry here inferred an opaque screen
      from that sentence and was wrong — a sourced quote is not a measurement. `PITCH.md` now
      uses the strong version. Scope it to `Payment`; richer types are untested

---

## The trust layer: borrow a device, fall back to multisign

**Decided.** Ask Ledger's mentors for a DMK-capable loaner on Saturday morning. If none is
available, ship XRPL multisign. Build the approval gate as an interface so the choice is a
swap, not a rewrite.

- [x] **Multisign fallback verified against the live facilitator** (21 Oct). A multi-signed
      `Payment` returns `isValid: true`. The facilitator parses `SigningPubKey: ""` plus a
      `Signers` array without complaint, and derives `payer` from `Account`. The fallback is
      real, not hopeful.
- [x] **Multisign fee is base × (1 + signers)** — 20 drops with one signer. Use
      `autofill(tx, client, signers_count=N)` or the transaction is underfunded.
- [x] **`source_tag_mismatch` gotcha found** — if the requirement carries `extra.sourceTag`, the
      transaction must set the same `SourceTag`. The error reads like a signature problem and
      is not.
- [ ] **Ask at 8:30 over breakfast**, again at 16:00 office hours. Script in `LEDGER-ASK.md`.
      Start with **Akram El Milligy** or **Etienne Waldron** — both DevRel/PM, and DevRel is
      who carries spare hardware.
- [ ] ⏰ **12:00 Saturday is the commit deadline.** No device in hand by noon → build the
      multisign path. Not a maybe. The approval gate is behind an interface, so a device
      arriving at 16:00 still drops in as a swap — but *waiting* for one costs you beat 4
      outright. This is the decision that protects the demo, so make it on the clock, not on
      how hopeful the last conversation felt.
- [ ] **If a device is lent**, run the hardware checks below before building on it.

## To do — hardware, only if a device is obtained

- [x] **1.** Device identified: **Ledger Nano S, 1st generation.** DMK does not list it (no USB
      product ID in DMK's device table), so `@ledgerhq/device-signer-kit-xrp` **cannot talk to
      it at all**. Options: borrow a DMK device on site (best), or use the legacy LedgerJS stack
      (`@ledgerhq/hw-app-xrp` 6.38.0 + `hw-transport-node-hid`), which does support the original
      Nano S. DMK-compatible devices: Nano S Plus, Nano X, Stax, Flex, Nano Gen5.
- [ ] **2.** Install the **XRP app** via Ledger Live; confirm `getAppConfig()` returns a version
- [ ] **3.** `getAddress("44'/144'/0'/0/0", { checkOnDevice: true })` returns the expected
      address **and shows it on the device screen**
- [x] **4.** **Sign one testnet Payment end to end and get `tesSUCCESS`** — done on the
      emulator, 24 Oct. `prove_device.py`, 17/17, three validated payments. Note the signer
      returns **canonical DER**, not `{r,s}`: hex-encode and set `TxnSignature`, no
      re-encoding. And send `binarycodec.encode()`, NOT `encode_for_signing()` — app-xrp
      prefixes `STX\0` itself
- [x] **5.** **What the device displays while signing: answered by observation.** It shows
      transaction type, account, source tag, both invoice bindings, `Amount XRP 0.001`,
      `Fee XRP 0.00001`, the full destination and the memo, then `Sign transaction?` /
      `Reject transaction`. **Not** an opaque hash. Scope to `Payment`; richer types untested
- [ ] **6.** USB cable and drivers work on the exact machine you will demo from.
      Also ask: does **Ledger Live need to be running**, or does it fight over the USB
      interface? Your demo is a terminal app, not Ledger Live

If 4 fails, switch to the **XRPL multisign fallback** immediately rather than Saturday night.

---

## To do — accounts and access

- [ ] **AWS account reachable**, only if you decide to chase Bedrock AgentCore — `MVP-SCOPE.md`
      argues you should not
- [ ] **Luma confirmation + venue address** saved offline (Apella, New York, NY 10016).
      Note: Luma hides the exact address behind registration, so screenshot it tonight
- [x] **Mentor list reviewed** — see above

---

## To do — reading (free, and it compounds)

- [ ] **Ledger for Agents** — `developers.ledger.com/docs/ai-tools/overview`
- [ ] Skim `references/scheme.md` in the `xrpl-x402` skill so the wire format is familiar
- [x] **Mastercard AP4M** — read, 21–23 Oct. AP4M *is* an HTTP 402 flow with credentialed agents
      paying inside pre-authorised limits, and Mastercard uses the term **Verifiable Intent** —
      the same term as the `x402_xrpl.vi` module. **Ripple and t54 Labs are both named AP4M
      participants.** Four-pillar mapping is in `MVP-SCOPE.md`; nothing left to read or install
- [ ] ~~AWS AgentCore Payments Workshop~~ — skipped on purpose, see "The one thing to refuse"

---

## Decisions — settled, do not reopen

All four are made. They are written up in full in `MVP-SCOPE.md`; the short form:

1. **Solo**, scoped at **four beats**. Look for one person for the *surface* (display, audit
   view, rehearsal) only, and stop looking at 13:30.
2. **Three-pane terminal with `rich`**, not a web UI. Equal ratios, not fixed widths. Emit a
   JSON event log alongside the display — it is the seam, and it makes beat 5 a file read.
3. **Beat 3 (`upto` metered) is the first cut**, because it is the only beat that doubles the
   protocol surface. Degradation order: beat 3 → beat 5's polish → beat 1's liveness → never
   2 or 4. **Sat 22:00**: if the `exact` loop, policy check and veto are not all working,
   beat 3 is gone. **Sun 02:00: stop building** — whatever works then is the demo.
4. **The close is written**, in a device version and a multisign version. See `PITCH.md`.

---

## Saturday morning, 10:00 — from zero

```bash
py -m venv .venv
.venv/Scripts/python.exe -m pip install --no-index --find-links prep/offline-cache x402-xrpl rich
```

Then write the merchant and payer **fresh**. The traps are already mapped in
`xrpl-x402-demo/README.md` and `prep/layout-reference/README.md`:

- port 8000 is occupied on this machine → use 8402
- `xrpl-py` 5.2 breaks `Tx(transaction=…)` → use raw JSON-RPC to verify
- `source_tag` does not default despite the README → set it explicitly
- the invoice store is per-process → single worker only
- never pipe the merchant's stdout without draining it
- cp1252 stdout kills non-Latin-1 glyphs mid-render → `sys.stdout.reconfigure(encoding="utf-8")`

With those known, the loop is about 90 minutes of typing rather than a day of debugging.

---

## What the slides changed — 24 Oct keynote, from 59 photos

Four things here overturn entries elsewhere in this file. Source: slides photographed between
10:46 and 11:52 on 24 Oct.

### 1. Judging criteria — ANSWERED, and they reorder the pitch

Mastercard, "How teams win": **Real-world utility 25% · Trust and control 25% · Technical
execution 25% · Path to production 15% · Demo and story 10%.** Full consequences are at the top
of `PITCH.md`. The short version: trust and control is worth 2.5× demo polish, and *path to
production* is 15% that the pitch currently ignores.

### 2. Speculos — the device problem is solved, for free, tonight

Ledger, "Build on Ledger without a device": Speculos emulates a Ledger **running the real XRP
app**. Their judging slide accepts it explicitly — *"Signs on a Ledger device or on Speculos."*

```
docker pull ghcr.io/ledgerhq/speculos:latest
cd xrpl-hackathon/speculos && ./run-speculos.sh stax
```

Transport is `speculosTransportFactory("http://127.0.0.1:5000", false, DeviceModelId.STAX)` from
`@ledgerhq/device-transport-kit-speculos`. **This supersedes the multisign fallback and makes
the borrow-a-device ask optional rather than load-bearing.** Their warning, worth repeating in
Q&A: never a real seed or real funds on Speculos — the seed sits in plain text on disk.

### 3. There IS a Mastercard AP4M builder stack

"What teams receive" — an SDK (typed ABIs, signing helpers), **contracts** (`ParticipantRegistry`,
`PaymentLedger`), a **funded wallet: 20 RLUSD auto-funded on approval, gas free on XRPL EVM
Testnet**, a Platform API, an x402 runtime (voucher exchange, HTTP payment loop), and on-site
mentor support. That is what the EVM funding address on their form was for.

⚠️ **But read the fork honestly.** Their stack is **EIP-712 vouchers on the XRPL EVM sidechain**,
not native XRPL Checks. Their flow is Register → Fund → Pay (sign EIP-712 voucher, pay over x402)
→ Settle in RLUSD on XRPL EVM. Going after their $6,000 properly means an EVM-side build, which
is **not** the `xrpl:1` project in `MVP-SCOPE.md`. 🟢 Rich Dad: fill the form, take the 20 RLUSD,
ask an AP4M engineer what qualifies — all free. 🔴 Poor Dad: rewrite a working XRPL demo into
Solidity overnight chasing a prize you haven't confirmed you're eligible for.

**Their "strong demo" checklist is still worth copying verbatim**, because it is rubric language:
CONTROL (PSP-attested identities · funded channel cap · **over-cap attempt rejected**) · PAYMENT
(HTTP 402 requirements · agent-signed voucher · immediate resource release) · PROOF
(`VoucherRedeemed` · `ClaimPaid` + `SettlementRecorded` · receipt).

### 4. Office hours, confirmed from the schedule slide

**Today 16:00–17:00** and **tomorrow 10:00–11:00** — "Hack the Mentor". Mentors in the room all
weekend. Questions also go through the app's message feature. The 16:00 row in `LEDGER-ASK.md`
was right; tomorrow's window is 10:00–11:00, not an all-morning free-for-all.

**Judges named:** Michael Broderick (Digital Assets Commercialization), Amol Sharma (AP4M
Product). **Mentors include** Rashi Goyal, Jaya Mandlik, Puja Samuel (both Hackathon Leads),
Rishal Mahajan, Katie Li, Ao Li, Veevek Dave, Saravanan Shanmugam — plus an "AP4M engineering
rotation" for contracts, x402, wallets and debugging.

---

## Known unknowns to resolve on site

- ~~**Judging criteria**~~ — **answered**, see above
- **Team size limits** — still unpublished
- **What qualifies for Mastercard's $6,000** — now sharper: does an XRPL-native (non-EVM) x402
  build qualify at all, or is their stack mandatory? Ask the AP4M engineering rotation
- Prize splits are no longer unknown — see "The money" in `MVP-SCOPE.md`. Ledger's three tracks
  were confirmed on screen: Protocol Innovation **$4,000**, Agentic Finance **$3,000**, Why Not
  **$3,000**

---

## 24 Oct — the Ledger layer is built and the Python side is proven

`LEDGER-EMULATOR.md` has the setup, the seven traps and the pre-flight list.
Short version:

- The hardware path works end to end on testnet, signed by a key outside the
  Python process: `prove_hardware.py`, 17/17, two validated `tesSUCCESS`
  payments. The signer was a stand-in behind the *same HTTP contract* the
  Speculos sidecar serves, so only one hop is unverified — what the device
  itself returns.
- Swapping stand-in for emulator is one env var (`SIDECAR_URL`).
- **Beat 4 (the veto) is real**: a refusal returns 409 and nothing is signed.
- **Beat 3's ceiling** was already proven on 22 Oct (1840 drops settled against
  a 5000-drop ceiling, consensus-enforced).
- New risk found: the facilitator returns `settlement_status_unknown` on
  roughly half of runs even when the payment validated. `hardware_pay` now
  reconciles on-ledger by `InvoiceID`. If this fires on stage, the honest line
  is "the facilitator lost sight of it; the ledger didn't" — which is a better
  beat than the happy path.
- ~~Still unverified: what the device displays while signing.~~ **Verified the
  same day on Speculos. It shows the full destination, the amount as "XRP
  0.001", the source tag, both invoice bindings and the memo, then an explicit
  refusal — not a hash.** So "a human reads the real destination" stands as
  written, scoped to `Payment`. See `LEDGER-EMULATOR.md`.

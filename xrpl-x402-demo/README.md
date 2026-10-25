# xrpl-x402-demo — a throwaway spike, NOT the submission

> **Do not submit this code.** The hackathon rule is: *"Only what you build during the
> hackathon counts toward judging."* Bringing prior code is explicitly allowed, but it
> scores nothing. This repo exists to prove the stack works and to find the traps — its
> value is the gotcha list below, not its ~200 lines. Rebuild the real thing during the
> window; with these traps already mapped that is roughly 90 minutes, not a day.

A working x402 payment loop on XRPL testnet. Merchant prices a route, agent pays it,
payment is verified on the ledger.

**Verified working 21 Oct 2026** — 7/7 checks, settled tx
[`FE057CC0…8C750`](https://testnet.xrpl.org/transactions/FE057CC0220CE6E7813E444E36F4DE697B3AE743FF8E4C6A6078820E98A8C750).

## Run it

```bash
.venv/Scripts/python.exe prove.py
```

That boots the merchant, pays it, verifies on-ledger and shuts down. Exit code 0 means
all seven checks passed.

To drive the pieces separately — two terminals:

```bash
.venv/Scripts/python.exe merchant.py     # terminal 1
.venv/Scripts/python.exe agent.py        # terminal 2
```

## Files

| File | What it is |
| :---- | :---- |
| `setup_wallets.py` | Funds two testnet wallets, writes seeds to `.env`. Run once. Refuses to overwrite. |
| `merchant.py` | FastAPI. `/market-data` fixed at 1000 drops, `/inference` metered up to 5000, `/health` free. |
| `agent.py` | Payer agent, caps pinned. `buy()` (exact), `buy_metered()` (upto), `report()`. |
| `prove.py` | The fourteen checks. |
| `.env` | Seeds and config. Gitignored. Never commit. |

## What the fourteen checks prove

Fixed price (`exact`):

1. The free route answers without payment — the middleware gates only what it's told to
2. The paid route answers 402 with a usable challenge
3. The agent pays and receives the resource
4. The transaction is validated **on the ledger**, read from the ledger rather than
   trusting the facilitator's `success` flag
5. The ledger says `tesSUCCESS`
6. Amount and destination on-ledger match the quote
7. A value cap below the price **refuses** the payment instead of paying it

Metered (`upto`, settled over XRPL Checks):

8. The metered route quotes a *ceiling* under the `upto` scheme
9. The agent signs a `CheckCreate` for the ceiling and receives the resource
10. The settlement is validated on-ledger
11. The settling transaction is a **merchant-signed `CheckCash`**
12. The settled amount is the **metered cost, below the ceiling** — 1840 drops against a
    5000-drop ceiling, 3160 drops never spent
13. `SourceTag` is mirrored from the `CheckCreate` onto the `CheckCash`
14. The metered settlement is `tesSUCCESS`

Checks 7 and 12 are the ones to show a judge. Seven is the difference between an agent
with a wallet and an agent with a budget. Twelve is an agent that authorised a ceiling
and paid the truth — with the ceiling enforced by consensus, since the ledger itself
refuses to cash a Check above its `SendMax`.

**Verified 22 Oct 2026** — 14/14, metered settlement
[`3E588ADE…9808D`](https://testnet.xrpl.org/transactions/3E588ADE8CDEC82E979C3517EF0750AC7289032780053A4A741985436679808D).

## Setup, if starting fresh

```bash
py -m venv .venv
.venv/Scripts/python.exe -m pip install x402-xrpl
.venv/Scripts/python.exe setup_wallets.py
```

Installs clean on Python 3.14. Pulls `x402-xrpl` 0.3.4 and `xrpl-py` 5.2.0.

## Things that cost time, so you don't pay twice

### The `upto` scheme is half-wired in the SDK

All three of these are load-bearing. Together they are about 40 minutes of confusion if
you meet them cold, and the metered beat is unreachable until all three are solved.

- **`require_payment()` cannot express `upto` at all.** The ergonomic wrapper takes no
  `upto_sign_check_cash` parameter, so there is no way to supply the merchant's CheckCash
  signer through it — and without that signer, settlement is impossible. Drop to
  `require_x402(RequireX402Options(...))`, which also renames the two fields you'll
  reach for: `price` → **`amount`**, `pay_to_address` → **`pay_to`**.
- **`UsageMeter` and `UPTO_METER_ATTR` are not re-exported.** `x402_xrpl.server.__init__`
  exports exactly five names and none is the metering surface. Import from
  `x402_xrpl.server.fastapi` instead.
- **The high-level client is `exact`-only.** `_build_x_payment` hardcodes
  `XRPLPresignedPaymentPayer`, and there is no `upto` branch anywhere under `clients/`.
  To pay a metered quote, pass a `payment_header_factory` that calls
  `XRPLUptoPayer.authorize(reqs).payment_header`, and set `scheme_filter="upto"`. See
  `buy_metered()` in `agent.py`.

### Smaller ones

- **`max_value` on an `upto` quote caps the ceiling, not the charge.** That is the right
  thing to cap — maximum exposure — but it means the cap must be ≥ the ceiling or the
  quote is refused outright. `AGENT_MAX_CEILING_DROPS=6000` against a 5000 ceiling.
- **`result.invoice_id` comes back `None` on success** for both schemes. If the audit
  table is keyed by invoice, read `extra.invoiceId` from the 402 challenge and carry it
  yourself.
- **Port 8000 is occupied on this machine** by two unrelated services. That's why
  everything runs on **8402**. If a route mysteriously 404s, check `netstat -ano | grep :8402`
  before you debug the code.
- **`xrpl-py` 5.2 breaks the `Tx` model** — `Tx(transaction=hash)` raises
  "Must have only one of `ctid` or `transaction`". `prove.py` uses raw JSON-RPC for the
  lookup instead. The SDK floor is `>=4.1.0`, so 5.x drift is a live risk elsewhere too.
- **Run the merchant single-worker.** The default invoice store is in-memory and
  per-process; behind multiple workers, settlement fails silently.
- **Never pipe the merchant's stdout without draining it.** An unread pipe fills and
  blocks the server. `prove.py` logs to `merchant.log`.
- **The SDK emits the challenge in both places** — the `PAYMENT-REQUIRED` header *and*
  the JSON body. Hand-written merchants must emit the body too, or this SDK's client
  won't see the challenge.
- **`source_tag` must be set explicitly.** The README claims a default of `804681468`;
  v0.3.4 injects nothing. `merchant.py` sets `20260530`.

## Next

The remaining demo beats, in order of risk: Ledger device signing (L2 delegation +
the approval gate on `requires_confirmation`), then the `upto` metered route, then the
three-pane UI. See `../MVP-SCOPE.md`.

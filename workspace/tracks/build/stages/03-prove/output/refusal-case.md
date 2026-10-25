# Refusal case — the agent declining a price above its ceiling

Run 25 Oct 2026 by the AP4M build session, to settle open question 3 in
`../../01-measure/output/open-questions.md`.

**This file is not in this stage's contract**, which lists `proof-run.md` and
`events.json`. It is separate because `proof-run.md` is machine-generated and
overwritten on every run of `icm-x402-evidence.mjs`, and a hand-written result
placed there would be destroyed.

## Why this run existed

`shared/evidence-discipline.md`: *an assert that has never been seen to fail is
decoration.* The spending ceiling was the whole claim this workspace exists to
defend, and nothing had ever been refused by it. Until this run the ceiling was a
claim about code.

## Rig

| Thing | Value |
| :-- | :-- |
| Merchant | `x402-merchant.mjs`, port 8412, own state directory |
| Merchant price | **0.50 RLUSD** |
| Agent ceiling | **0.10 RLUSD** |
| Channel | `0x6d824358aa10ae33fb4ccf7deaab5e54147d4682963faeb4334518f2e26f320b`, open |
| Witness | `refusal-witness.mjs` at the repository root, before and after |

Both price and ceiling were set through the shell. The shared `.env` was not
edited, because another session is using it.

## Result 1 — the agent's own check refuses

**measured.** `node x402-agent.mjs refusal-case-1`, exit code **3**:

```
[3] merchant replied HTTP 402  <-- payment required
[3] merchant asks 0.5 RLUSD; ceiling is 0.10 RLUSD
[3] agent decides: 0.5 > 0.10 -> REFUSE

No voucher was signed and no payment was sent.
```

**measured.** `.refusal-agent-state/` was never created, so no voucher was
retained and nothing was signed. This is the stage 02 audit item *a declined
intent leaves no transaction, not an abandoned one*, which until now was recorded
as untested.

**measured.** Exit code 3 is distinct from 0 (bought) and 1 (broke), so a
refusal cannot be read as either by anything watching the exit status.

## Result 2 — the layer that signs also refuses, on its own

The agent's own check is our code and can be deleted by editing one file. The
check inside `buyResource` cannot. They were tested separately.

**measured.** `node refusal-sdk-layer.mjs refusal-case-2`, which skips the
agent's pre-check entirely and calls `buyResource` with `maximumAmount` of 0.10
RLUSD against the 0.50 price. Exit code **3**:

```
buyResource threw: Merchant challenge exceeds the configured purchase authority
retained purchase file: none — nothing was signed
```

**measured.** The refusal happens **before** the voucher is signed, not after.
The state directory held no `purchase.json`.

**measured, naming the refusing party:** the AP4M SDK refused, inside
`buyResource`, on the agent's own machine. The Merchant did not refuse — it
quoted 0.50 RLUSD quite happily — and the ledger was never asked.

## Result 3 — the chain shows nothing happened

**measured.** `refusal-witness.mjs`, before and after the two runs above:

```
blocks elapsed        : 9228864 -> 9228875 (11)
redemptions on channel: 12 -> 12
new claim IDs         : none
channel cumulative    : 0.24 -> 0.24
payout balance        : 0.27 -> 0.27 RLUSD

VERDICT: no voucher was redeemed on this channel across the refusal run.
```

The witness compares the set of claim IDs on the channel, not a count, so a
redemption arriving from another session would have shown as a new ID rather
than hiding in an unchanged total.

## The boundary — run 25 Oct 2026, same channel

The margin above was wide: 0.50 against 0.10. An off-by-one lives at the limit, so
both sides of it were run one base unit apart. The ceiling is
`100000000000000000` base units.

Prices were set in base units and checked before each run:

```
ceiling   = 100000000000000000
price A   = 100000000000000001      one base unit above
price B   = 100000000000000000      exactly equal
```

### Case A — one base unit above. Must refuse.

**measured.** Merchant on port 8413 at `0.100000000000000001` RLUSD.

```
[3] merchant asks 0.100000000000000001 RLUSD; ceiling is 0.10 RLUSD
[3] agent decides: 0.100000000000000001 > 0.10 -> REFUSE
```

Exit 3. The SDK layer was tested separately with the pre-check skipped and also
refused — *"Merchant challenge exceeds the configured purchase authority"*, no
retained purchase file. Both layers hold at one base unit.

**measured**, witness over 5 blocks:

```
redemptions on channel: 12 -> 12      new claim IDs: none
channel cumulative    : 240000000000000000 -> 240000000000000000 base units
cumulative delta      : 0 base units
```

### Case B — exactly equal. Must pass. This is the control.

**measured.** Merchant on port 8414 at `0.10` RLUSD.

```
[3] merchant asks 0.1 RLUSD; ceiling is 0.10 RLUSD
[3] agent decides: 0.1 <= 0.10 -> pay
[4] paid. redemption Confirmed
```

**measured**, witness with the expected delta stated in advance rather than read
off the result:

```
redemptions on channel: 12 -> 13
new claim ID          : 0x3f79bf0858ba5f5dbf9188bc7b42666addb258c9ce9aaea8eff7fd701b9db564
  amount              : 100000000000000000 base units
cumulative delta      : 100000000000000000 base units
expected delta        : 100000000000000000 base units
VERDICT: the chain moved by exactly the expected amount.
```

The claim ID the agent printed is the one in the event, and the amount settled is
the ceiling to the base unit. A rule that rejected its own legitimate input would
have failed here; it did not.

**So the comparison is `>`, not `>=`, on both layers, and the ceiling is
inclusive.** A price equal to the limit is spendable. That is a decision, not an
accident, and anyone quoting the ceiling should say which side the boundary falls
on.

### One honest wrinkle in the witness

Case B's witness reported the payout balance **unchanged** at block 9228982,
after the redemption had already settled. That was not a failure. The vault's
RLUSD leg landed at block **9228983**, one block after the snapshot was taken:
`0xa0bb5765…`, exactly 0.1 RLUSD, balance 0.27 → 0.37.

**measured**, by reading the balance again and locating the leg. The witness reads
the chain in the gap between redemption and settlement, so its balance line is
only meaningful once the leg has landed. The redemption and cumulative lines are
not affected. Recorded rather than quietly corrected, because a tool that can
report a true payment as unsettled will do it again on stage.

## What this settles, and what it does not

**Settled.** The ceiling refuses, at a wide margin and at one base unit. Two
independent layers refuse, both before signing, and the chain records nothing. A
price exactly equal to the ceiling is accepted and settles to the base unit, so
the rule does not reject its own legitimate input. The comparison is `>` and the
ceiling is inclusive. Open question 3 is closed, boundary included.

**Not settled.**

- **The channel cap is still untested.** These runs refused in the agent's process.
  Whether the vault or the ledger refuses a voucher that exceeds the channel cap
  is open question 4 and was not touched here.
- **Nothing here involves a device or a human.** This is a software ceiling
  refusing a software agent.
- **One base unit below the ceiling was not run.** Equal and one-above were. The
  pair that decides a `>` versus `>=` comparison is equal and one-above, which is
  why those two were chosen, but a run at `99999999999999999` would complete the
  set for nothing but patience.
- **The witness's balance line lags settlement**, as above. Anyone reusing it
  should read the balance after the vault leg, not immediately after the
  redemption.

## Audit gate

- [x] Asserted on the agent's and the SDK's own output, and on the chain, rather
      than on harness bookkeeping.
- [x] No settlement reported as unknown.
- [x] Nothing unexplained was given a cause.
- [x] Every claim carries `measured` or is listed as not settled.

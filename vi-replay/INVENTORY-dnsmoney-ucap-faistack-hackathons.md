# Machine sweep — DNS of Money / UCAP / FAIStack / Hackathons

**Swept 2026-10-20.** Scope: `C:\Users\JD` to depth 6–8, excluding `node_modules`
and Claude cache/temp mirrors. 196 filename hits plus Claude session transcripts,
scheduled tasks, and git worktrees.

---

## 0. The naming, resolved first

These are not four projects. They are **one project with four names**:

| Name | What it actually is |
|---|---|
| **UCAP** | The **git repo**: `github.com/sparkmastergrape/ucap`. Nothing on disk is *named* `ucap` — it's checked out as `financial-autonomy-stack`. "UCAP canon" = the `_canon/` folder in that repo. |
| **FAIStack / Financial Autonomy Stack** | The **product/engine** inside that repo (FastAPI app, x402 rails, resolver). |
| **DNS of Money / DNS://Money** | The **brand + marketing surface** — `dnsofmoney.com`, a *separate* repo `github.com/dnsofmoney/dns-of-money`. |
| **Hackathons** | Five distinct events, four dead and one live in 4 days. |

So "find everything about UCAP" and "find everything about FAIStack" return the same
checkout. Treat them as one asset with two repos.

---

## 1. HACKATHONS — one live, four expired

### 🟢 LIVE — XRPL Commons / AI & Fintech Hackathon, NYC
**Sat Oct 24 08:30 → Sun Oct 25, 2026. Four days out.**

- **Registered:** approved 2026-08-27 (Luma "You're In"). Public Luma page now reads
  "Registration Closed" — expected for a confirmed attendee.
- Venue: Apella, New York, NY 10016. Track: **Agentic Finance**.
- Prize pool: Luma says $40,000+ total. **Every per-track and partner figure still reads
  "Coming soon."** The "$10,000 Ledger bounty" and the older "~$4,000 Ledger bounty" are
  both **unverified — do not quote either.**
- t54.ai is a named mentor/judge (they authored the VI profile you're verifying).
  Mastercard is a **sponsor**, primary-source confirmed. Never say "judge" about Mastercard.
- Judging rule: **only what you build in the 36 hours counts.**
- Ripple Swell follows Oct 27–29 at The Shed — that adjacency is the whole strategic point.

**Authoritative docs, newest first:**

| File | Date | Status |
|---|---|---|
| `financial-autonomy-stack/.claude/worktrees/xrpl-hackathon-nyc-registration-667f25/_canon/xrpl-hackathon-nyc-build-plan.md` | **Oct 20** | ⚠️ **UNCOMMITTED** — newest authority, exists only in that worktree |
| `Documents\Playground\xrpl-hackathon-briefing.md` | Oct 19 (35 KB) | Current operator briefing |
| `financial-autonomy-stack\_canon\xrpl-hackathon-nyc-oct2026.md` | Sep 28 | Decision memo — still correct on the *entry*, stale on facts |
| `financial-autonomy-stack\_canon\verifiable-intent-wire-spec.md` | Sep 28 | The spec the entry implements |
| `financial-autonomy-stack\_canon\mastercard-xrpl-verifiable-intent.md` | Sep 28 | Why the event matters |

**The entry, per canon:** the **VI verifier** — parse, verify and admit a real L1/L2/L3
SD-JWT chain. *Only that.* The fused receipt already shipped (ucap PR #204, merged
2026-09-28) so it is substrate, not the entry.

**⚠️ Two loose Downloads docs propose different projects and conflict with canon:**
- `Downloads\xrpl_hackathon_plan.md` (Oct 20, also a `(1)` duplicate) — "Hardware-Enforced
  Autonomous Agent Commerce (Ledger Guard + Mastercard Bridge)", monorepo `xrpl-agent-guard`.
  Quotes the unverified $10k Ledger bounty.
- `Downloads\hackathon_playbook_autonomous_b2b_credit_broker.md` (Oct 20) — "Autonomous B2B
  Credit Broker" on XLS-65/XLS-66, ICM folder architecture.

Neither is reconciled against the canon entry. Pick one story before Saturday.

**⚠️ Critical path is not the spec — it's t54 provisioning.** As of the Oct 18 note,
**no commit records KYB being started, the Issuer Secret captured, or a policy id
registered since 2026-08-28** (now 53 days). KYB is third-party review; live production
unlocks only after it.

---

### 🔴 EXPIRED — archive these

| Event | Deadline | What happened | Sessions to archive |
|---|---|---|---|
| **Algorand Global x402 Challenge** | Final submission **Sept 2 → Sept 29, 2026** | Registered 2026-07-15. Code shipped and live. **Failed top-50 eligibility** (rank 86/119 as of Sep 6, absent under the challenge filter). Submission draft never sent. Window closed 3 weeks ago. | [Algorand Global X402 Challenge](#local_da8fd21a-f0df-4912-8bc9-965e6c38875b) — **still marked running** |
| **OKX.AI ASP listing / Trading Hackathon** | **Jul 27, 2026 23:59 UTC** | Passed. The canon plan is explicitly marked "HISTORICAL RECORD… both deadlines have passed." | Orphaned worktree `okx-ai-hackathon-batch-1b7c9b` (see §4) |
| **Tiun × Microlaunch Hackathon** | Aug 2026 | Already archived | [Hackwithus challenge entry](#local_40326ded-308e-4333-b64f-627ca9aca98f) — already archived ✅ |
| **Claude Startups program** | — | Not a hackathon; application session, dormant since Oct 7 | [Claude Startups program application](#local_abb0f8f1-e527-4a8c-b618-bc8b2659b493) |

**Worth extracting before archiving the Algorand work** — the code is live and still earning:
- Enforced per-alias pricing (ucap#103) — `pay:dnsofmoney` = 0.01 USDC, real paid
  Algorand-mainnet endpoint. Canon: `_canon/x402-enforced-pricing.md`.
- **Counterparty-screening endpoint** (ucap#105) — `GET /x402/screen/{target}`. This is the
  distributable product: pay 0.01 USDC → OFAC + resolution attestation on a *caller-named*
  target. Decouples screened party from paying party.
- Diagnosis that still stands: **the bottleneck was never code, it was distribution.**
  Leaderboards rank on real third-party usage. The Moltbook channel playbook
  (`_canon/moltbook-presence-playbook.md`) was gated on two items that were yours, not code's.

**Stale memo to retire:** `Documents\Playground\xrpl-hackathon-nyc-oct2026.md` (Aug 27) is a
duplicate of the canon memo and is explicitly flagged "seven weeks stale — do not plan from
it." Two of its load-bearing claims are dead. Delete or move to an `_archive/` folder so no
future session reads it.

---

## 2. UCAP / FAIStack — the live engine

**Repo:** `github.com/sparkmastergrape/ucap`
**Primary checkout:** `C:\Users\JD\Downloads\Project\Day 1\files\financial-autonomy-stack`
**main @ `bf24d76`, 2026-09-28** (PR #215, runbook/OS update)

**`_canon/` holds 50 specs + 3 subfolders.** Live/recent (Sep 28 – Oct 6):
`verifiable-intent-wire-spec.md`, `mastercard-xrpl-verifiable-intent.md`,
`t54-signup-runbook.md`, `fused-receipt-deploy-runbook.md`, `prod-ec2-runbook.md`,
`deliver-as-spec.md`, `x402-receipt-contract-spec.md`, `x402-multiaccepts-spec.md`,
`x402-cdp-facilitator-spec.md`.

**Production:** EC2 box, nginx-in-Docker, compose project
`/home/ubuntu/financial-autonomy-stack`. `api.dnsofmoney.com` = same box.
SSH: `ssh -i C:/Users/JD/.ssh/project-o-key.pem ubuntu@api.dnsofmoney.com`

### Three sibling checkouts of the same repo (worth consolidating)
| Path | Branch |
|---|---|
| `Day 1\files\financial-autonomy-stack` | `main` |
| `Day 1\files\fas-caip2` | `feat/x402-caip2-screen-labels` |
| `Day 1\files\fas-payer` | `docs/runbook-os-update` |

Each carries a **full duplicate copy of `_canon/`** plus duplicate `docs/` PDFs and
`marketing/` localisations. Verified line-count identical to `ucap/_canon` on 2026-10-18.
This is ~3× storage for one set of specs.

### Open PRs with live sessions
| PR | Title | Session |
|---|---|---|
| #217 | QuickNode RPC integration | [QuickNode RPC integration plan](#local_5f75d31a-6b0f-4ea1-8a70-64f141b87321) / [t54 status check](#local_99e060e3-f157-4fde-9ba5-cbf12dc8a104) — both Oct 20 |
| #216 | Fix `update_alias` err() returning HTTP 200 | [session](#local_75036f55-33ee-4b11-ac9a-02266bd0f5df) — Sep 30 |
| #205 | XRPL Grants | [session](#local_b868b22e-4cdf-47b6-a1e7-9eba51629d65) — Sep 29 |
| #131 | ANS#88 / ANS#109 | [session](#local_cbe631ca-9e0f-415f-b5ea-894182aa6936) — Oct 8 |

---

## 3. DNS of Money — brand, site, marketing

**Repo:** `github.com/dnsofmoney/dns-of-money` at `Downloads\Project\dns-of-money`
**Last commit 2026-10-19:** "Founding tier: raise the cap to 600 and move the fee to
graduated pricing" — **actively developed.**

**Live surfaces:** `dnsofmoney.com` (EC2/nginx), `api.dnsofmoney.com` (same box),
`xapp.dnsofmoney.com` (Vercel, project `dns-of-money-xapp`).

**Keep — operational knowledge, 8 memory files** at
`.claude\projects\C--Users-JD-Downloads-Project-dns-of-money\memory\`:
EC2 deploy + the single-file-bind-mount gotcha (must `docker restart fas_nginx`);
AEO audit 6.6/10; Cloudflare DNS-only posture (never enable Managed robots.txt);
xApp SDK integration; "site down → check local DNS first"; copy voice rules;
x402 price setting.

**Open loop:** Xaman xApp store re-audit requested from XRPL Labs **2026-07-11** —
ball still in their court, 3+ months. Worth chasing.

### Marketing asset sprawl — the biggest cleanup win
Loose in `Downloads\`: 5 versions of `DNS_of_Money_Onboarding_Guide` (v1–v4 + v4_ES),
2 carousels, `DNS_of_Money_FAiStack_Social_Assets.zip`, `dnsofmoney_social_assets_v2`
(+ its zip), a Social Media Kit `.docx`, 3 JPGs.
In `Downloads\Project\`: **13 loose HTML homepage variants** —
`dnsofmoney.html`, `-v2`, `-v3` ×4, `(1)`, `(2)`, `-redesign`, `-socials`,
`dns-of-money.html`, `dns-of-money-final.html`, `dnsofmoney-l10n/` (8 languages).
Plus `Desktop\Interpretable Context Method\New folder\dns-money-website-redesign\`.
Also `Desktop\okx-dnsofmoney-demo - Copy.mp4` and
`Pictures\01-main-path-okx-hackathon.html` (Jul 20, OKX-era deck — the one with the
canon-violating "Smart Multi-Rail Router" card that was flagged 🔴 KILL/REFRAME).

None of this is referenced by either repo. The v4 guides and `marketing/` SVGs inside
the repos are the live copies.

### ICM workspace — finished, archive
`Desktop\Interpretable Context Method\dns-of-money-icm\` — 4-stage pipeline, **run_01
completed 2026-06-07**, final 26 PASS / 2 FAIL / 2 UNVERIFIED. Four items the pipeline
deferred are still open (FAS-1 v0.2 authoring, `docs/FAS-1-spec.md` still has the old
v0.1 response shape, live-site reconciliation). The memory file
`.claude\projects\C--\memory\dns-of-money-icm-workspace.md` carries all of it — that
memory is the thing to keep; the workspace itself is a finished run.

---

## 4. Stale infrastructure to clean

**Orphaned worktree** — `okx-ai-hackathon-batch-1b7c9b` appears in
`.claude\projects\`, `claude-cli-nodejs\Cache\` and `Temp\claude\`, but **not** in
`git worktree list`. The worktree is gone; three directories of metadata remain.

**12 registered git worktrees** on the ucap repo. Several belong to merged or dormant PRs:
`bold-ishizaka-5316e5` (PR #204, merged), `nice-kalam-e4b228` (PR #212, merged),
`pyjwt-bump`, `heuristic-bouman-33c48f` (#216, Sep 30),
`aws-compute-usage-69788b` (#205, Sep 29), `startups-program-application-333908`,
`nervous-chaum-1a82b0`. ~130 `claude/*` branches on the repo.

**Scheduled tasks — all 11 are already disabled.** The DNS of Money ones all last ran
Jul–Sep and are one-time-fired or switched off:
`dnsofmoney-citation-stage07-remeasure` (fired Jul 7),
`complete-agent-wallet-registration` (fired Jul 17),
`post-ans-prefix-id-x` (fired Jul 25), `xmoney-draft2-reply` (fired Sep 8),
`intern-daily-brief` (last Jul 31), `intern-engagement-check` (last Aug 6),
`asset-ops-engine-monthly-rerun` (last Jul 28).
Nothing is firing. Safe to delete the task folders if you want them gone.

---

## 4b. Done 2026-10-20 (this sweep)

- ✅ **Archived** `Algorand Global X402 Challenge` session. It was mid-turn with no activity
  since 17:05, so its turn was stopped first, then archived. Its worktree was the main
  checkout (`financial-autonomy-stack`), which is shared and therefore untouched.
- ✅ **Archived** `Claude Startups program application` session.
- ✅ **Quarantined** the stale memo: `Playground\xrpl-hackathon-nyc-oct2026.md` →
  `Playground\_archive\xrpl-hackathon-nyc-oct2026.SUPERSEDED.md`, with a banner naming
  the two dead claims and pointing at the current authority. The file was untracked by
  git, so this is a plain move with nothing to commit. **The canon copy at
  `financial-autonomy-stack\_canon\xrpl-hackathon-nyc-oct2026.md` was deliberately left
  alone** — it is the tracked original and still correct on the entry.

- ✅ **Committed** the build plan: `457fcd8 docs(canon): XRPL NYC build plan — scope, demo,
  substrate vs entry`, on branch `claude/xrpl-hackathon-nyc-registration-667f25` in the
  hackathon worktree. 134 insertions, one file, gitleaks passed, working tree now clean.
- ✅ **Pushed** that branch to `origin` (new remote branch, tracking set up). Verified:
  remote `refs/heads/claude/xrpl-hackathon-nyc-registration-667f25` = `457fcd8`, local in
  sync. The build plan now exists off this machine.
- ✅ **Opened** [sparkmastergrape/ucap#219](https://github.com/sparkmastergrape/ucap/pull/219)
  against `main`, docs-only. Bound to this session. No CI checks had reported at the time
  of writing — not the same as green.
- ✅ **Auto-fix enabled** on #219 (with `address_comments`, which is the same switch on this
  machine). The app now wakes this session on CI failures, merge conflicts and review
  comments, so CI needs no polling.

### ⚠️ Found while checking #219's CI: Security Scan is red on *every* open PR

Not caused by the docs change. `pip-audit` blocks on CRITICAL/HIGH and now reports
**24 vulnerabilities across 3 packages**:

| Package | Pinned | Fix available | Advisories | Covered by |
|---|---|---|---|---|
| `pyjwt` | 2.13.0 | **2.15.1** | 14 | ✅ PR #218 — **proven to clear all 14** |
| `pillow` | 12.3.0 | **13.0.0** | 8 | ❌ nothing |
| `oauthlib` | 3.3.1 (transitive via `tweepy`) | **4.0.0** | 2 (PYSEC-2026-4114) | ❌ nothing |

**Why it's red now:** `main` last ran CI on 2026-09-28 and passed. This is time-decay, not a
regression — any PR opened today fails the same way.

**Proven by comparing two runs** (#218 at 2026-10-20 20:02 vs #219 at 2026-10-21 01:03):
- #218's run reports **"2 known vulnerabilities in 1 package" — oauthlib only.** So
  **pyjwt 2.15.1 clears all 14 pyjwt advisories, PYSEC-2026-4146 included.** (An earlier
  read of mine guessed 4146 might be unfixable because its Fix Versions column was blank;
  #218's run disproves that.)
- #218's run shows **no pillow findings at all.** The 8 pillow CVEs appear only in the later
  run, so they were **published overnight, between 20:02 and 01:03** — neither PR is behind,
  they are simply new.

**The gate is therefore clearable with three pins**, and `pip index` confirms all three
versions exist: `pyjwt==2.15.1` (done in #218), `pillow==13.0.0`, `oauthlib>=4.0.0` (needs
adding — it is not currently in `requirements.txt`).

**Done:** pillow bumped on #218 (`fa33f47`, pushed). Resolution verified by
`pip install --dry-run -r requirements.txt`, exit 0. #219 left untouched — dep bumps on a
markdown-only branch would duplicate #218 and land on a branch whose Build/Test skip.

### 🔴 oauthlib PYSEC-2026-4114 is NOT fixable by pinning — needs a decision

`oauthlib==4.0.0` was attempted and **reverted**: the dry-run failed with
`ResolutionImpossible`. **tweepy depends on `oauthlib<4,>=3.2.0`** — verified against both
the pinned **4.16.0** and the newest **4.17.0**, so no tweepy release lifts the cap.

My earlier note that "requests-oauthlib needs only >=3.0.0, so the bump is safe" was
**wrong**; the dry-run caught it before it was pushed.

So Security Scan stays red on this one advisory until one of:
1. **`pip-audit --ignore-vuln PYSEC-2026-4114`** in `.github/workflows` with a written
   justification (there is no pip-audit config file today, so this would be a workflow edit).
2. **Drop `tweepy`** — but it powers the @dnsofmoney X automation (`intern-daily-brief`,
   `intern-engagement-check`, both currently disabled).
3. **Wait for upstream tweepy** to allow oauthlib 4.x.

Option 1 is the only one that clears CI before Oct 24.

### Verified 2026-10-22 — #218 is one decision from green

The CI run after the pillow push (job 118980340584) reports **"2 known vulnerabilities in
1 package" — oauthlib only**. So **22 of 24 advisories are cleared**: pyjwt 14, pillow 8.
The pillow claim is now measured, not assumed.

**No oauthlib 3.x backport exists.** 3.3.1 is the highest 3.x release and the fix ships
only in 4.0.0. That option is closed.

**#219 still fails on all 24.** Its branch carries main's old `requirements.txt`. #219
cannot go green on its own. The order is:

1. Decide oauthlib.
2. Merge #218 to main.
3. Bring main into #219.

So #218 is the unblocking step for both PRs.

**Auto-fix turned OFF for #219 on 2026-10-22**, after four identical events on an unchanged
head. Verified `auto_fix: false`. #218 reports `auto_fix: false` as well — it was never
switched on. So **no CI events will reach this session for either PR.**

**Auto-fix turned ON for #218** later the same day, at JD's request. Verified
`auto_fix: true`. So the merge signal now arrives through #218 instead of #219.

**To turn #219's Auto-fix back on**, someone still has to say so — but a #218 event
reporting "merged" is now the trigger to do it.

Still open from §5: items 2, 3, 6, 7, 8 (item 1 done).

## 4c. Pre-event prep, 2026-10-23 (one day out)

Committed and pushed as `6943130` on the hackathon branch. Working tree clean.

**The entry decision was already made.** A section "The one idea (distilled 2026-10-20 from
three candidate plans)" was sitting **uncommitted** in the worktree, along with the Oct 21
organizer briefing (3-minute oral pitch, scored on explanation and benefit). My earlier
"three competing plans" framing was out of date. The entry is unchanged — verify the VI
chain, feed the gate, fill the receipt — and the Ledger plan's demo shape was kept because
the L2 limit already *is* the approval threshold. That commit bundles 83 lines this session
did not write, stated plainly in the commit message.

**The encoding spike was already done.** The plan listed it as pre-event work, but the wire
spec already records all three traps confirmed with measurements. Ticked off and cross-
referenced so nobody repeats it.

**x402-xrpl 0.3.4 is safe.** The spec was read from 0.3.3, and 0.3.4 shipped afterwards. I
downloaded both wheels and compared: `vi/chain.py`, `vi/__init__.py` and `x402_secure.py`
are **byte-identical**. No changed file carries a VI symbol. Pin 0.3.4.

**Gotcha:** 0.3.3 self-reports `__version__ = "0.3.2"`. Do not gate on `__version__`.

### 🔴 The one thing to do tonight

Neither `verifiable_intent` nor `x402_xrpl` is installed on this machine. The Sat
08:30–10:30 fixture slot assumes both. `agent-intent/verifiable-intent` is PUBLIC and
installable from git, but is **not on PyPI**.

```
pip install x402-xrpl==0.3.4
pip install git+https://github.com/agent-intent/verifiable-intent
```

**Not verified:** that the reference implementation produces a chain the verifier accepts.
Only that it is obtainable. That check needs the install first.

## 5. Recommended actions, in order

1. **Before Saturday:** commit `_canon/xrpl-hackathon-nyc-build-plan.md` — it is the
   newest authority and it exists in exactly one uncommitted file in one worktree.
2. **Before Saturday:** decide the entry. Canon says VI verifier only; two Downloads
   docs from today propose entirely different projects.
3. **Before Saturday:** resolve t54 KYB / Issuer Secret / policy id — 53 days with no
   commit, and it gates live production.
4. **Archive** the Algorand x402 session (expired Sep 29) and the Startups application
   session — after noting that `/x402/screen/` and enforced pricing stay live.
5. **Delete or quarantine** `Playground\xrpl-hackathon-nyc-oct2026.md` — a stale memo
   that has already misled one session.
6. **Consolidate** `fas-caip2` / `fas-payer` once their branches land; collapse the
   13 loose HTML variants and 5 onboarding-guide versions down to the repo copies.
7. **Clean** the orphaned `okx-ai-hackathon-batch` metadata and the merged-PR worktrees.
8. **Chase** XRPL Labs on the xApp re-audit (requested Jul 11).

---

### Unverified in this sweep
Depth-limited to 6–8 levels and skipped `node_modules`, so deeply-nested copies may
exist. I did not read GitHub to confirm PR states beyond what the session index
reports, did not open the two Downloads hackathon plans in full, and did not verify
any live URL or the Luma listing — every hackathon fact above is read from your local
docs, including their own "unverified" caveats.

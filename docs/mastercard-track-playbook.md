# Mastercard track playbook

What's actually integrable on
[developer.mastercard.com](https://developer.mastercard.com/) for an AP4M-style
agent-payments build, ranked by how much demo it buys per hour of work.

Everything here was read off the live docs, via the Mastercard Developers MCP
server wired up in this repo (see [the README](../README.md)).

## The shape of the platform

- ~100 **services** (technical APIs with a `serviceId`) and a longer list of
  **products** (business offerings, some with no public API at all).
- Auth is one of: **OAuth 1.0a** (most of them), **OAuth 2.0**, **mTLS**, or
  **Open Banking**. A single project can only mix APIs with compatible auth.
- Sandbox is self-serve for many services and "under review" for others. That
  review queue is the main schedule risk.
- Every doc page is available as markdown by appending `/index.md`, and the
  whole catalog as [llms.txt](https://developer.mastercard.com/llms.txt), plus a
  per-service `llms-full.txt`. Use those, not the HTML.

## Pick by what you can actually get keys for

| Tier | Meaning | Plan |
| --- | --- | --- |
| Self-serve sandbox | Create project, download keys, call it in minutes | Build the demo on these |
| Sandbox under review | Request access, wait on a service team | Request day one, treat as bonus |
| Rep-gated | Needs a Mastercard contact and a contract | Narrative only, no demo |

Portal keys are valid 13 months. Sandbox credentials only work against
`https://sandbox.api.mastercard.com`.

## The services that fit agent payments

### 1. Business Payment Controls — strongest narrative fit

[docs](https://developer.mastercard.com/business-payment-controls/documentation/)

Register a real card, then **mint virtual cards with their own spend controls**,
plus custom data fields for reconciliation and transaction-level reporting. Four
microservices: Registration, Card Account, Custom Data, Reporting.

Why it lands with judges: this is the card-rail answer to the problem AP4M
solves on-ledger. The agent gets a scoped, revocable credential with a hard
spend ceiling instead of a key to the whole account. "The agent gets a virtual
card, not your card" is a one-sentence pitch, and it maps onto the voucher model
already in this repo.

Pair it with [Commercial Event Notifications](https://developer.mastercard.com/commercial-event-notifications/documentation/)
for webhook authorization and clearing events per virtual card — a live agent
spend feed you can render.

### 2. Consent Management — the mandate layer

[docs](https://developer.mastercard.com/consent-management/documentation/)

The one service whose own overview says it is built for **"agentic consent
flows"**. It captures explicit, traceable, revocable consent and returns a
`consentToken` that downstream services consume without exposing card or
personal data.

That is the "a human authorized this agent" artifact, in Mastercard's own words.
Three patterns: card-based enrollment, user/geo-based enrollment, and consent
lifecycle control (create, update, revoke, audit). Hosted UI if you want to stay
out of PCI scope, direct API if you don't.

Use it as the gate in front of anything the agent spends: no live consent token,
no payment. Revocation makes the best live demo — revoke mid-run and show the
agent stop.

### 3. Mastercard Send / Move — the payout rail

[docs](https://developer.mastercard.com/mastercard-send/documentation) ·
[test cards](./mastercard-test-cards.md)

Push funds to a card, domestic or cross-border. It has the **best sandbox story
on the platform**: published test PANs with no rep needed, documented consumer
and commercial networks, and specific PANs that force a chosen settlement speed.

Use it for the merchant payout leg — the agent earns or spends on-ledger, the
merchant gets paid out to a card. It makes "we touched the Mastercard network"
concrete rather than aspirational.

Same family: [Send Account Verification](https://developer.mastercard.com/mastercard-send-avs/documentation/),
[Send Disbursements](https://developer.mastercard.com/mastercard-send-disbursements/documentation/),
[Send Funding](https://developer.mastercard.com/mastercard-send-funding/documentation/).

### 4. Buyer / Supplier Payment Agent — "payment agent" by name

[Buyer](https://developer.mastercard.com/mastercard-buyer-payment-agent/documentation/) ·
[Supplier](https://developer.mastercard.com/mastercard-supplier-payment-agent/documentation/)

Mastercard Track Business Payment Service. A Buyer Payment Agent submits and
manages payment instructions on behalf of buyers; a Supplier Payment Agent
retrieves and processes them. Card **and** account-to-account rails, status
updates, buyer-to-supplier linking, event notification webhooks, and a reference
implementation.

These are literally agent-acting-for-principal payment APIs with an existing
mandate and linking model — strong for a B2B framing ("autonomous AP clerk").
Onboarding is heavier than Send, so read
[getting started](https://developer.mastercard.com/mastercard-buyer-payment-agent/documentation/getting-started/index.md)
before committing to it.

### 5. Cheap credibility garnish

Small APIs that make a demo look like it understands payments, for little work:

- [BIN Lookup](https://developer.mastercard.com/bin-lookup/documentation/) —
  issuer, country, product, credit/debit for an account range. Show the agent
  reasoning about the instrument before it pays. Single lookups, filtered
  search, full downloads, deltas.
- [Account Validation](https://developer.mastercard.com/account-validation/documentation/) —
  is the account open and valid, does the name match, is the CVC right. One POST
  per card. Positioned for Mastercard Send customers.
- [Currency Conversion Calculator](https://developer.mastercard.com/currency-conversion-calculator/documentation/) —
  daily Mastercard FX rates and the computed cardholder billing amount. Makes a
  cross-border or stablecoin-to-fiat story quantitative. EEA issuers use the
  [Enhanced](https://developer.mastercard.com/enhanced-currency-conversion-calculator/documentation/) variant.
- [MATCH Pro](https://developer.mastercard.com/match/documentation/) and
  [Onboard Risk Check](https://developer.mastercard.com/onboard-risk-check/documentation/) —
  merchant risk screening before the agent transacts with a counterparty.
- [Ethoca Alerts](https://developer.mastercard.com/ethoca-alerts-for-merchants/documentation/) and
  [Identity Insights](https://developer.mastercard.com/identity-insights-for-transactions/documentation/) —
  fraud and dispute signals, if the story needs a risk loop.

### 6. Tokenization, if the demo needs a credential lifecycle

[MDES Digital Enablement](https://developer.mastercard.com/mdes-digital-enablement/documentation/)
tokenizes a PAN and manages the token lifecycle (create, suspend, unsuspend,
delete, DSRP cryptograms, outbound update notifications).
[MDES Token Connect](https://developer.mastercard.com/mdes-token-connect/documentation/)
handles issuer-initiated push provisioning.

Powerful, but token requestor onboarding is not a weekend activity. Reach for
Business Payment Controls instead unless a mentor opens a door.

## Agent Suite for Merchants — know it, don't plan on it

[product page](https://developer.mastercard.com/product/agent-suite-for-merchants/)

Mastercard's own agentic-commerce offering: **Shopping Agent** (merchant-branded
first-party AI shopping) plus **Mastercard Agent Connect** (connects merchants
to trusted third-party AI agents), behind one merchant integration. Covers
discovery, cart, checkout, payment and post-purchase.

The caveat matters: as of this writing it is a **product page with no public
service docs, no API reference and no OpenAPI spec** — it appears in neither the
service catalog nor `llms.txt`. So it is not integrable this weekend. It is
still the right thing to cite to show you know where Mastercard is heading, and
to position this build as the on-ledger settlement layer underneath it.

## Integration mechanics (the parts that eat time)

### OAuth 1.0a

Most of these APIs sign every request with RSA-SHA256 over the request plus a
body hash, in the `Authorization` header. No token exchange, no refresh.

Already wired up here: [`mastercard/sign.mjs`](../mastercard/sign.mjs) wraps
[`mastercard-oauth1-signer`](https://github.com/Mastercard/oauth1-signer-nodejs)
and gives you a signed `fetch`:

```js
import { mastercardFetch } from './mastercard/sign.mjs';

const res = await mastercardFetch('/bin-lookup/v1/lookups', {
  method: 'POST',
  body: { accountRange: { leadingDigits: '510258' } },
});
```

Credentials go in `.env` (see `.env.example`). You download a `.p12` keystore
from the portal; the helper extracts the PEM key with `node-forge`.

Gotcha: the signature covers the exact body bytes. Serialize once and sign the
same string you send — re-stringifying in a middleware produces
`oauth_problem=signature_invalid`.

### The other three auth types

- **OAuth 2.0** — [guide](https://developer.mastercard.com/platform/documentation/authentication/using-oauth-2-to-access-mastercard-apis/).
  Standard bearer tokens, used by newer services.
- **mTLS** — [guide](https://developer.mastercard.com/platform/documentation/authentication/using-mtls-to-access-mastercard-apis/).
  Needs a CSR; see the [CSR requirements](https://developer.mastercard.com/platform/documentation/security-and-authentication/mtls-csr-requirements/).
- **Open Banking** — the Open Finance US / AU / Data services.

Error code references:
[OAuth 2.0](https://developer.mastercard.com/platform/documentation/errors-and-troubleshooting/oauth2-error-codes/) ·
[OAuth 1.0a and mTLS](https://developer.mastercard.com/platform/documentation/errors-and-troubleshooting/oauth1-and-mtls-error-codes/).

### Payload encryption

Several services (MDES, anything handling PANs) require field-level JWE/JWS on
top of transport security. See
[Securing Sensitive Data Using Payload Encryption](https://developer.mastercard.com/platform/documentation/security-and-authentication/securing-sensitive-data-using-payload-encryption/).
Budget real time for it if you pick a PAN-handling service — it's the usual
reason a sandbox integration stalls.

### Getting keys

1. [Sign up](https://developer.mastercard.com/account/sign-up), activate by email.
2. [My Projects](https://developer.mastercard.com/dashboard) → Create new
   project. Answer **No** to "on behalf of a client" unless you really are
   building for another company.
3. Select the APIs — auth type and credentials follow from that choice, so group
   compatible APIs in one project.
4. Generate and download credentials. Sandbox is immediate unless the service
   gates it ("Under Review").
5. Production needs company verification, commercial countries and approval.
   Not a hackathon path.

Shortcuts: [Postman collection](https://developer.mastercard.com/platform/documentation/developer-tools/postman-collection/),
[Insomnia collection](https://developer.mastercard.com/platform/documentation/developer-tools/insomnia-collection/),
and every service's API Reference has a **Download Spec** button for
OpenAPI-generated clients.

## Suggested build, if you want one answer

A three-leg demo that uses only self-serve sandbox surfaces:

1. **Mandate** — the human grants consent through Consent Management; the agent
   holds a `consentToken`, not a card.
2. **Scoped credential** — Business Payment Controls issues a virtual card with
   a hard ceiling for this task; Commercial Event Notifications streams each
   authorization back into the UI.
3. **Settlement** — the on-ledger XRPL/x402 leg this repo already has, with
   Mastercard Send pushing the merchant payout to a card using the published
   [test PANs](./mastercard-test-cards.md). BIN Lookup and the Currency
   Conversion Calculator decorate the decision the agent makes.

Then name Agent Suite for Merchants out loud, and say this is the settlement
layer that belongs under it.

Fallback if sandbox access stalls: Send, BIN Lookup and Currency Conversion are
the least gated, and Send's published test PANs mean the payout leg demos with
zero approvals.

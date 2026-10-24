# hackathon-2026

Hackathon 2026 work — agent payments on XRPL / XRPL EVM, plus the Mastercard
track.

## Setup

```bash
npm install
cp .env.example .env   # then fill it in
```

Wallet generation: `node create-testnet-wallet.mjs` (classic XRPL) and
`node create-evm-wallet.mjs` (XRPL EVM).

## Mastercard Developers MCP server

`server.mjs` runs Mastercard's
[agent toolkit](https://developer.mastercard.com/platform/documentation/agent-toolkit/install-mcp-sdk/)
as an MCP server over stdio, so any MCP client can query the whole Mastercard
API catalog — service discovery, documentation pages, OpenAPI operation details
and the OAuth integration guides. No Mastercard credentials needed.

```bash
npm run mcp:mastercard
```

It prints `Mastercard Developers MCP Server running on stdio` and then waits for
a client. `.mcp.json` registers it for Claude Code in this repo, so the tools
are available automatically.

To scope it to a single service or spec, pass config to the toolkit in
`server.mjs`:

```js
new MastercardDevelopersAgentToolkit({
  service: 'https://developer.mastercard.com/mastercard-send/documentation',
});
```

Either `service` or `apiSpecification` disables the `get-services-list` tool.

## Mastercard API calls

[`mastercard/sign.mjs`](mastercard/sign.mjs) is a signed `fetch` for the
OAuth 1.0a APIs (most of the platform):

```js
import { mastercardFetch } from './mastercard/sign.mjs';

const res = await mastercardFetch('/bin-lookup/v1/lookups', {
  method: 'POST',
  body: { accountRange: { leadingDigits: '510258' } },
});
```

Credentials come from `.env` — see the Mastercard block in `.env.example`.

## Agent mandate demo

The Mastercard leg: a human spend mandate in Consent Management becomes
network-enforced spend controls on a Business Payment Controls virtual card,
and revoking the mandate kills the card.

```bash
npm run demo:mandate
```

It runs as a **dry run** unless `--live` is passed and credentials are present,
printing the exact HTTP request each step would send. That makes the whole flow
reviewable before any sandbox project exists.

```bash
node demo/agent-mandate.mjs --live
```

The modules behind it:

- [`mastercard/consent.mjs`](mastercard/consent.mjs) — Consent Management
  client, plus `agentSpendMandate()`, which encodes an agent's limits into a
  consent record.
- [`mastercard/bpc.mjs`](mastercard/bpc.mjs) — Business Payment Controls
  client, plus `spendControlsFromMandate()`, which turns those same limits into
  a spec-valid `inControlRules` entry.
- [`mastercard/jwe.mjs`](mastercard/jwe.mjs) — JWE payload encryption, which
  Consent Management requires on three of its six endpoints.
- [`mastercard/request.mjs`](mastercard/request.mjs) — per-service base URLs,
  idempotency keys, error-envelope parsing, dry run.

Note the two hosts: Consent Management is on
`sandbox.api.mastercard.com/openapis/authentication`, Business Payment Controls
on `sandbox.apiedge.mastercard.com/commercial`.

## Tests

```bash
npm test
```

No network and no credentials — the tests check that the request bodies match
the published OpenAPI specs: required fields, `negate` flags, ISO-4217 numeric
currency codes, offset-bearing timestamps, and the `yyyy-MM` expiry regex.

## Docs

- [Mastercard track playbook](docs/mastercard-track-playbook.md) — which
  Mastercard APIs are worth integrating, what's gated, and a suggested build.
- [Mastercard test cards](docs/mastercard-test-cards.md) — the publicly
  documented sandbox PANs and the rules for using them.

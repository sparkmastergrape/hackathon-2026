# QuickNode in this build

Three surfaces, not one, and the deepest of them replaced code we had written
ourselves. Every number below was measured on this account; none is from a
datasheet.

## 1. The agent transacts through it

`AP4M_RPC_URL` points at the QuickNode XRPL EVM Testnet endpoint, so
[`ap4m-agent.js:53`](../ap4m-agent.js) and both x402 example scripts send their
calls there rather than at the published `rpc.testnet.xrplevm.org`. This is the
plainest use and the easiest to overlook: the payments themselves go through it.

## 2. The pane reads through its WebSocket

`live/relay.mjs` holds `QUICKNODE_EVM_WSS_URL` and subscribes to `newHeads` and
to `VoucherRedeemed` logs on the PaymentLedger. Measured on connect: **54 ms
handshake**, chainId 1449000, heads arriving every ~5 s.

The endpoint never reaches the browser. A QuickNode URL carries its token in the
path, so it is a credential: the relay holds it and the pane is told the
provider's name and nothing else.

**Against the published node**, both measured the same minute:

| | public `rpc.testnet.xrplevm.org` | QuickNode |
| :-- | --: | --: |
| `eth_blockNumber`, median of 12 | 51.3 ms | 30.3 ms |
| worst of 12 | 203.6 ms | 40.1 ms |
| `eth_getLogs`, 2,000 blocks | 334 ms | 124 ms |
| events returned | 141 | 141 |

Same answers, and a worst case 5× tighter. The tail is what matters on stage:
the pane reads on every new head, and a 204 ms stall is a visible stutter.

## 3. Streams delivers the events we care about, filtered server-side

Stream `ap4m-voucher-events` — XRP Ledger EVM Testnet, **Logs** dataset,
webhook destination, running continuously from the block it was created at.

The filter runs on QuickNode's side, so blocks that hold nothing for us are
never sent at all:

```js
const LEDGER = "0xcab42800a5ecf0d253fa2581bb3334b4daefae91";
const TOPIC  = "0xe3de5c3755abd99a01530fd79b85708f309453f6d26eb9bb5dde4c14cd5f7175";
function main(payload) {
  const out = [];
  const visit = function (node) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node !== "object" || !Array.isArray(node.topics)) return;
    if (String(node.address).toLowerCase() !== LEDGER) return;
    if (String(node.topics[0]).toLowerCase() !== TOPIC) return;
    out.push(node);
  };
  visit(payload && payload.data ? payload.data : payload);
  return out.length ? { data: out } : null;
}
```

Tested in the Stream Filter Editor against block 9234054, which holds a real
redemption: it returned that one log and dropped the rest of the block. The
dashboard reports the filter running at roughly **30 ms p99**.

**It has delivered.** The first live delivery arrived at block 9235682 and is on
the tape as `"via":"stream"` — channel `0xcd4c3552…`, claim `0x2972d54b…`, tx
`0xd8860d94…`. That one the Stream won. A later delivery carried an event the
socket had already pushed, and the shared `seen` set dropped it:

```
[stream] batch of 1, 1 voucher event(s), 0 new
```

Which road wins varies, and neither is the point. The socket is a direct
subscription and often first; what the Stream adds is backfill and reorg
handling as someone else's problem, and a second road that is still there when
the socket drops.

**What this replaced.** The relay had its own windowed `eth_getLogs` backfill
and a 10-second reconcile poll, written because `eth_getLogs` over 20,000 blocks
returns `could not coalesce error` on this chain. Streams does backfill and
reorg handling as a product feature. The hand-rolled pair stays as the fallback
path — two roads into the same `seen` set, whichever arrives first wins — but
the Stream is the one that is meant to carry the load.

`POST /webhook` on the relay takes the delivery, answers 200 even to a payload
it could not parse (a non-200 makes Streams retry, and retrying an unparseable
body just produces the same failure more often), and verifies the Stream's
security token as an HMAC when `QUICKNODE_WEBHOOK_TOKEN` is set.

## What we are not claiming

- **A public WebSocket does exist** at `wss://ws.testnet.xrplevm.org`, and it
  opens. QuickNode is not the only way to get a push here. It is simply not in
  the kit — `GET /public/config` publishes an HTTPS `rpcUrl` and nothing else —
  so nothing on the quickstart path pushes, and ours does.
- **The 2,000-block window is conservative, not a hard ceiling.** Re-measured
  on a quiet endpoint, 10,000 answers; 20,000 still does not. The small window
  is what survived event-day load.
- **The XRPL classic side is not on QuickNode yet.** `audit/emit_from_ledger.py`
  and `xrpl-x402-demo/settlement_watch.py` both read `XRPL_RPC_URL` /
  `XRPL_WSS_URL`, and both are unset, so both fall back to the public node.
  QuickNode supports XRP Ledger Testnet; provisioning that endpoint would put
  both ledgers behind one provider. It is a gap, and this is it stated plainly.

## Reproducing the measurements

```bash
node live/relay.mjs                      # subscribes, backfills, serves the pane
curl -s localhost:8787/stream | head -5  # the SSE feed the pane reads
```

The latency table came from 12 `eth_blockNumber` calls against each endpoint in
the same minute, timed with `process.hrtime.bigint()`, and one `eth_getLogs`
over the same 2,000-block range on each.

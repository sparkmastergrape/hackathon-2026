import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Intent } from './api';
import { connect, disconnect, signTransaction, verifyAddressOnDevice, type Session, type TransportKind } from './ledger';
import { describeTx } from './preview';

const short = (a: string) => `${a.slice(0, 7)}…${a.slice(-5)}`;
const DEVICE_PROMPTS: Record<string, string> = {
  UnlockDevice: 'Unlock your Ledger.',
  ConfirmOpenApp: 'Confirm opening the XRP app on the device.',
  SignTransaction: 'Review the transaction on the device, then confirm.',
  VerifyAddress: 'Check the address on the device and confirm.',
  none: '',
};
const BADGE: Record<string, string> = {
  PENDING_APPROVAL: 'warn', APPROVED: 'warn', CONFIRMED: 'good', SUBMITTED: 'info',
  BLOCKED: 'bad', FAILED: 'bad', REJECTED: 'muted', EXPIRED: 'muted',
};
const EXPLORER = 'https://testnet.xrpl.org/transactions/';

export function App() {
  const [intents, setIntents] = useState<Intent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [transport, setTransport] = useState<TransportKind>('speculos');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<{ ok: boolean; approver: string | null; demoError: string | null } | null>(null);
  const [policy, setPolicy] = useState<{ perTxCapXrp: number; dailyCapXrp: number } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIntents(await api.list());
      const h = await api.health();
      setGate({ ok: h.ok, approver: h.approver, demoError: h.demo.error });
    } catch (e) {
      setGate(null);
    }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 2500); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { api.policy().then(setPolicy).catch(() => {}); }, []);

  const selected = useMemo(() => intents.find((i) => i.id === selectedId) ?? null, [intents, selectedId]);
  const pending = intents.filter((i) => i.state === 'PENDING_APPROVAL' || i.state === 'APPROVED');

  const onDevice = (what: string) => setStatus(DEVICE_PROMPTS[what] ?? what);
  const guard = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e: any) { setError(e?.message ?? String(e)); } finally { setBusy(false); setStatus(''); refresh(); }
  };

  const doConnect = () => guard(async () => { setStatus('Connecting…'); setSession(await connect(transport, onDevice)); });
  const doDisconnect = () => guard(async () => { if (session) await disconnect(session); setSession(null); });
  const doVerify = () => guard(async () => { if (session) await verifyAddressOnDevice(session, onDevice); });
  const fund = () => guard(async () => {
    if (!session) return;
    setStatus('Asking the testnet faucet…');
    const r = await fetch('https://faucet.altnet.rippletest.net/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ destination: session.address }) });
    if (!r.ok) throw new Error(`Faucet said ${r.status}.`);
  });
  const seed = () => guard(async () => { await api.seed(); });

  // Approve: server builds the transaction, the device signs it, the server verifies the signature and submits.
  const approve = (i: Intent) => guard(async () => {
    if (!session) throw new Error('Connect your Ledger first.');
    setStatus('Preparing the transaction…');
    const { txHex } = await api.approve(i.id, session.address, session.publicKey);
    const signature = await signTransaction(session, txHex, onDevice);
    setStatus('Submitting…');
    await api.signature(i.id, signature);
  });
  const reject = (i: Intent) => guard(async () => { await api.reject(i.id, 'rejected by approver'); });

  const preview = selected ? describeTx(selected.tx ?? {
    TransactionType: 'Payment', Account: session?.address ?? 'the Ledger account', Destination: selected.input.destination,
    Amount: String(Math.round(selected.input.amountXrp * 1e6)), DestinationTag: selected.input.destinationTag,
  }) : null;

  return (
    <div className="app">
      <header>
        <h1>Ledger Approver</h1>
        <p className="sub">Flagged and above-cap XRPL payments wait here. Only a signature from your Ledger releases them.</p>
      </header>

      {!gate && <div className="banner bad">Cannot reach the gate service. Start it with <code>npm run gate</code>.</div>}
      {gate?.demoError && <div className="banner bad">Demo wallets are not ready: {gate.demoError}</div>}
      {error && <div className="banner bad" role="alert">{error}</div>}
      {status && <div className="banner info" role="status">{status}</div>}

      <section className="panel">
        <h2>Device</h2>
        {session ? (
          <div className="row">
            <div>
              <div className="mono">{session.address}</div>
              <div className="muted">XRP app {session.appVersion ?? 'version unknown'} · path 44'/144'/0'/0/0</div>
            </div>
            <div className="actions">
              <button onClick={doVerify} disabled={busy}>Show address on device</button>
              <button onClick={fund} disabled={busy}>Fund (testnet faucet)</button>
              <button onClick={doDisconnect} disabled={busy}>Disconnect</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <label>Transport{' '}
              <select value={transport} onChange={(e) => setTransport(e.target.value as TransportKind)}>
                <option value="speculos">Speculos emulator (127.0.0.1:5000)</option>
                <option value="usb">USB (WebHID)</option>
              </select>
            </label>
            <button className="primary" onClick={doConnect} disabled={busy}>Connect</button>
          </div>
        )}
        {gate?.approver && <div className="muted">Registered approver: <span className="mono">{short(gate.approver)}</span></div>}
      </section>

      <div className="cols">
        <section className="panel list">
          <div className="row">
            <h2>Payments ({pending.length} waiting)</h2>
            <button onClick={seed} disabled={busy || !gate}>Seed demo payments</button>
          </div>
          {policy && <div className="muted">Caps: {policy.perTxCapXrp} XRP per payment, {policy.dailyCapXrp} XRP per rolling 24h (placeholder values).</div>}
          {intents.length === 0 && <p className="muted">Nothing yet. Seed the demo payments, or POST to <code>/intents</code>.</p>}
          <ul>
            {intents.map((i) => (
              <li key={i.id}>
                <button className={`card ${i.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(i.id)}>
                  <span className={`badge ${BADGE[i.state] ?? 'muted'}`}>{i.state.replace('_', ' ')}</span>
                  <span className="amt">{i.input.amountXrp} XRP</span>
                  <span className="muted"> to {short(i.input.destination)}</span>
                  <div className="muted">{i.input.note ?? i.id}</div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel detail">
          {!selected && <p className="muted">Select a payment to review it.</p>}
          {selected && preview && (
            <>
              <h2>{preview.headline}</h2>
              <span className={`badge ${BADGE[selected.state] ?? 'muted'}`}>{selected.state.replace('_', ' ')}</span>
              {selected.decision.reasons.length > 0 && (
                <>
                  <h3>Why it stopped</h3>
                  <ul className="reasons">{selected.decision.reasons.map((r) => <li key={r.code}><code>{r.code}</code> {r.text}</li>)}</ul>
                </>
              )}
              <h3>{selected.tx ? 'Exact transaction to match on the device' : 'What will be signed'}</h3>
              <dl>{preview.fields.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="mono">{v}</dd></div>)}</dl>

              {selected.state === 'PENDING_APPROVAL' && (
                <div className="actions">
                  <button className="primary" onClick={() => approve(selected)} disabled={busy || !session}>Approve and sign on device</button>
                  <button onClick={() => reject(selected)} disabled={busy}>Reject</button>
                  {!session && <span className="muted">Connect your Ledger to approve.</span>}
                </div>
              )}
              {selected.state === 'APPROVED' && <p className="muted">Approved. Waiting for the device signature.</p>}
              {selected.state === 'BLOCKED' && <p className="bad-text">Hard block. This payment cannot be approved by anyone.</p>}
              {selected.txHash && <p>Transaction <a href={EXPLORER + selected.txHash} target="_blank" rel="noreferrer" className="mono">{selected.txHash.slice(0, 16)}…</a> · {selected.engineResult}</p>}
              {selected.error && <p className="bad-text">{selected.error}</p>}
              <h3>History</h3>
              <ol className="history">{selected.history.map((h, n) => <li key={n}>{new Date(h.at).toLocaleTimeString()} · {h.state} · <span className="muted">{h.note}</span></li>)}</ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

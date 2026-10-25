const BASE = import.meta.env.VITE_GATE_URL ?? 'http://127.0.0.1:8787';

export type Reason = { code: string; text: string };
export type Intent = {
  id: string;
  state: string;
  createdAt: number;
  expiresAt: number;
  input: { end_to_end_id: string; destination: string; amountXrp: number; destinationTag?: number; risk?: string; health?: string; note?: string };
  decision: { outcome: 'auto' | 'approval' | 'block'; reasons: Reason[] };
  approver: string | null;
  tx: Record<string, unknown> | null;
  txHash: string | null;
  engineResult: string | null;
  error: string | null;
  history: { at: number; state: string; note: string }[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { ...init, headers: { 'content-type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `${res.status} ${res.statusText}`);
  return body as T;
}
const post = (path: string, body: unknown = {}) => call<any>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  health: () => call<{ ok: boolean; approver: string | null; demo: { ready: boolean; error: string | null; merchant: string | null } }>('/health'),
  policy: () => call<{ perTxCapXrp: number; dailyCapXrp: number; travelRuleUsd: number }>('/policy'),
  list: () => call<Intent[]>('/intents'),
  seed: () => post('/demo/seed'),
  approve: (id: string, address: string, publicKey: string) => post(`/intents/${encodeURIComponent(id)}/approve`, { address, publicKey }) as Promise<{ tx: Record<string, unknown>; txHex: string }>,
  signature: (id: string, signature: string) => post(`/intents/${encodeURIComponent(id)}/signature`, { signature }) as Promise<Intent>,
  reject: (id: string, reason: string) => post(`/intents/${encodeURIComponent(id)}/reject`, { reason }) as Promise<Intent>,
};

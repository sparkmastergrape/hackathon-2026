// Single pre-demo check. Spends nothing, touches no chain state.
// Exit 0 = safe to demo. Exit 1 = do not start; the output names what to fix.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';

const BOLD = '\u001b[1m', DIM = '\u001b[2m', RESET = '\u001b[0m';
const GREEN = '\u001b[32m', RED = '\u001b[31m', YELLOW = '\u001b[33m';

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath === cmd || cmd === 'node' ? process.execPath : cmd, args);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
}

const checks = [];
function record(name, ok, detail, showOnPass = false) {
  checks.push({ name, ok, detail });
  const mark = ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  const show = detail && (!ok || showOnPass);
  console.log(`  ${mark}  ${name}${show ? `  ${DIM}${detail}${RESET}` : ''}`);
}

console.log(`\n${BOLD}AP4M pre-demo check${RESET}  ${DIM}${new Date().toISOString()}${RESET}\n`);

// 1 — .env present with the keys the run needs
console.log(`${BOLD}Local setup${RESET}`);
let env = {};
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  record('.env readable', true);
} catch {
  record('.env readable', false, 'file missing — copy .env.example and fill it');
}
for (const k of ['AGENT_PRIVATE_KEY', 'MERCHANT_PRIVATE_KEY', 'AP4M_API_URL', 'TEAM_NAME']) {
  record(`${k} set`, Boolean(env[k]), env[k] ? '' : 'empty in .env');
}
if (env.AGENT_PRIVATE_KEY) {
  record('agent key is 0x + 64 hex', /^0x[0-9a-fA-F]{64}$/.test(env.AGENT_PRIVATE_KEY),
         'MetaMask exports without the 0x prefix');
}
record('.env is git-ignored',
       (await run('git', ['check-ignore', '-q', '.env'])).code === 0,
       'secrets must never be committed');

// 2 — wallets, chain, gas (this is the authoritative check)
console.log(`\n${BOLD}Wallets and chain${RESET}`);
const w = await run('node', ['verify-wallets.mjs']);
record('verify-wallets.mjs', w.code === 0, w.code === 0 ? '' : 'see detail below');
if (w.code !== 0) console.log(DIM + w.out.split('\n').map((l) => '      ' + l).join('\n') + RESET);

// 3 — service reachable and session still authenticates
console.log(`\n${BOLD}AP4M service${RESET}`);
try {
  const cfg = await (await fetch(`${env.AP4M_API_URL}/public/config`)).json();
  record('/public/config reachable', true, `vault holds ${cfg.vaultBalance} RLUSD`, true);
  record('chain id is 1449000', cfg.network.chainId === 1449000, `reported ${cfg.network.chainId}`, true);
  record('PaymentLedger address known', Boolean(cfg.contracts?.paymentLedger), cfg.contracts?.paymentLedger ?? '', true);
} catch (e) {
  record('/public/config reachable', false, e.message);
}
const s = await run('node', ['signin-check.cjs']);
record('sign-in as team', s.code === 0 && /sign-in\s+: OK/.test(s.out),
       s.code === 0 ? '' : 'team name or agent key rejected');
if (s.code !== 0) console.log(DIM + s.out.split('\n').map((l) => '      ' + l).join('\n') + RESET);

// Verdict
const failed = checks.filter((c) => !c.ok);
console.log('');
if (failed.length === 0) {
  console.log(`${GREEN}${BOLD}GO${RESET}  — all ${checks.length} checks passed. Run: node run-ap4m.cjs\n`);
  process.exit(0);
}
console.log(`${RED}${BOLD}NO-GO${RESET}  — ${failed.length} of ${checks.length} checks failed:`);
for (const f of failed) console.log(`  ${YELLOW}·${RESET} ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
console.log('');
process.exit(1);

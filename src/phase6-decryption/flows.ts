/**
 * CLI: checkin & refresh commands
 *
 *   npm run dev -- checkin   # status → claim → status (safe, uses current token)
 *   npm run dev -- refresh   # rotate token via refreshToken, then re-encrypt storage.json
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadCreds,
  exchangeTokenByRefreshToken,
  saveRotatedCreds,
  checkinStatus,
  checkinClaim,
} from './traeClient.js';
import { encryptBlob, initFromMainJs } from './byteCrypto.js';

const STORAGE_JSON = resolve(process.env.APPDATA ?? '', 'TRAE SOLO CN', 'User', 'globalStorage', 'storage.json');
const AUTH_KEY = 'iCubeAuthInfo://icube.cloudide';

function printJson(label: string, data: unknown): void {
  console.log(chalk.gray(`    ${label}: ${JSON.stringify(data)}`));
}

export async function runCheckin(): Promise<void> {
  const creds = loadCreds();
  console.log(chalk.gray(`  token: ${creds.token.slice(0, 14)}… expires ${creds.expiredAt}\n`));

  // 1) Status
  console.log(chalk.white('  [1/3] checkin_credits/status'));
  const st = await checkinStatus(creds.token);
  printJson('http', st.status);
  printJson('data', st.data);

  const enabled = st.data?.enable === true;
  const checkedIn = st.data?.checked_in === true;

  if (st.status !== 200 || !enabled) {
    console.log(chalk.yellow('\n  ⚠ Check-in not available for this account/environment.'));
    return;
  }
  if (checkedIn) {
    console.log(chalk.green('\n  ✓ Already checked in today. Nothing to do.'));
    return;
  }

  // 2) Claim
  console.log(chalk.white('\n  [2/3] checkin_credits/claim'));
  const cl = await checkinClaim(creds.token);
  printJson('http', cl.status);
  printJson('data', cl.data);

  const bizCode = cl.data?.code;
  if (cl.status === 200 && bizCode === 0) {
    console.log(chalk.green.bold('\n  ✅ Check-in claimed successfully!'));
    if (cl.data?.data?.credits !== undefined) printJson('credits', cl.data.data.credits);
  } else if (cl.status === 200) {
    console.log(chalk.yellow(`\n  ⚠ Claim responded with business code=${bizCode} (${cl.data?.message ?? 'no message'})`));
  } else {
    console.log(chalk.red(`\n  ✗ Claim failed: HTTP ${cl.status}`));
  }

  // 3) Re-check status
  console.log(chalk.white('\n  [3/3] verify via status'));
  const st2 = await checkinStatus(creds.token);
  printJson('data', st2.data);
  if (st2.data?.checked_in === true) {
    console.log(chalk.green.bold('\n  ✅ CONFIRMED: checked_in = true'));
  }

  // Evidence
  writeFileSync(
    resolve(process.cwd(), 'output', 'phase6', 'checkin.json'),
    JSON.stringify({ at: new Date().toISOString(), status1: st, claim: cl, status2: st2 }, null, 2),
  );
  console.log(chalk.gray('\n  Evidence saved to: output/phase6/checkin.json'));
}

export async function runRefresh(): Promise<void> {
  const creds = loadCreds();
  console.log(chalk.gray(`  old token      : ${creds.token.slice(0, 14)}… (expires ${creds.expiredAt})`));
  console.log(chalk.gray(`  old refreshToken: ${creds.refreshToken.slice(0, 10)}… (expires ${creds.refreshExpiredAt})`));
  console.log();

  const r = await exchangeTokenByRefreshToken();
  if (!r.ok) {
    console.log(chalk.red('  ✗ ExchangeToken failed: ' + r.error));
    if (r.raw) printJson('raw', r.raw);
    return;
  }

  console.log(chalk.green('  ✓ ExchangeToken succeeded'));
  console.log(chalk.gray(`    new token       : ${(r.newToken ?? '').slice(0, 14)}…(${(r.newToken ?? '').length})`));
  console.log(chalk.gray(`    new refreshToken: ${(r.newRefreshToken ?? '').slice(0, 10)}…(${(r.newRefreshToken ?? '').length})`));
  console.log(chalk.gray(`    expires         : ${r.expiredAt}`));
  console.log(chalk.gray(`    refreshExpires  : ${r.refreshExpiredAt}\n`));

  // Persist into our decrypted store
  saveRotatedCreds(r);

  // Write back to TRAE storage.json (re-encrypted with byteCrypto envelope) so the app stays logged in
  if (!existsSync(STORAGE_JSON)) {
    console.log(chalk.yellow('  ⚠ storage.json not found — skipped writing back.'));
    return;
  }

  const traeRunning = await isTraeRunning();
  if (traeRunning) {
    console.log(chalk.yellow('  ⚠ TRAE SOLO CN is RUNNING — it may overwrite storage.json on exit.'));
    console.log(chalk.yellow('    Close TRAE first, then re-run `npm run dev -- refresh --write-back` if needed.'));
  }

  const store = JSON.parse(readFileSync(STORAGE_JSON, 'utf-8')) as Record<string, string>;
  if (typeof store[AUTH_KEY] === 'string') {
    await initFromMainJs('C:/Program Files/TRAE SOLO CN/resources/app/out/main.js');
    const plain = JSON.stringify(loadCreds());
    store[AUTH_KEY] = await encryptBlob(plain);
    if (!traeRunning) {
      writeFileSync(STORAGE_JSON, JSON.stringify(store, null, 4));
      console.log(chalk.green('  ✓ New credentials re-encrypted and written back to storage.json (app stays logged in).'));
    } else {
      writeFileSync(resolve(process.cwd(), 'output', 'phase6', 'storage.json.new'), JSON.stringify(store, null, 4));
      console.log(chalk.gray('  · Pending copy saved to output/phase6/storage.json.new'));
    }
  }

  writeFileSync(
    resolve(process.cwd(), 'output', 'phase6', 'refresh.json'),
    JSON.stringify({ at: new Date().toISOString(), ok: true, expiredAt: r.expiredAt, refreshExpiredAt: r.refreshExpiredAt }, null, 2),
  );

  // Validate the fresh token immediately
  console.log(chalk.white('\n  validating fresh token via /icube/api/v1/user …'));
  try {
    const resp = await fetch('https://api.trae.cn/icube/api/v1/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-icube-token': r.newToken! },
      body: JSON.stringify({ uid: creds.userId }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await resp.json().catch(() => null);
    console.log(resp.ok && (j as any)?.success
      ? chalk.green(`  ✅ HTTP ${resp.status} success=true — fresh token LIVE.`)
      : chalk.yellow(`  ⚠ HTTP ${resp.status} ${JSON.stringify(j)?.slice(0, 200)}`));
  } catch (err) {
    console.log(chalk.red('  validation error: ' + (err as Error).message));
  }
}

async function isTraeRunning(): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync('tasklist /FI "IMAGENAME eq TRAE SOLO CN.exe" /NH', { encoding: 'utf-8' });
    return out.includes('TRAE');
  } catch {
    return false;
  }
}

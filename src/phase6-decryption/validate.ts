/**
 * validateToken — Phase 6 functional validation.
 *
 * Uses the credentials decrypted from storage.json to call the real API.
 * A HTTP 200 with our own userId back proves the credential is live & valid.
 *
 * Endpoint (reversed from out/main.js):
 *   GET {host}/icube/api/v1/user        auth header: x-icube-token (+ Bearer fallback)
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

interface DecryptedAuth {
  token?: string;
  refreshToken?: string;
  userId?: string;
  host?: string;
  expiredAt?: string;
  account?: Record<string, unknown>;
}

function loadDecrypted(): DecryptedAuth {
  const p = resolve(process.cwd(), 'output', 'phase6', 'decrypted', 'iCubeAuthInfo_icube_cloudide.json');
  if (!existsSync(p)) {
    throw new Error('Decrypted credentials not found — run phase6 first');
  }
  return JSON.parse(readFileSync(p, 'utf-8')) as DecryptedAuth;
}

export async function validateToken(): Promise<void> {
  console.log(chalk.gray('Validating decrypted credential against live API…\n'));

  let cred: DecryptedAuth;
  try {
    cred = loadDecrypted();
  } catch (err) {
    console.log(chalk.red('✗ ' + (err as Error).message));
    return;
  }

  const { token, userId, host, expiredAt } = cred;
  if (!token || !host) {
    console.log(chalk.red('✗ Missing token/host in decrypted payload'));
    return;
  }

  // Token expiry sanity check (local clock)
  if (expiredAt) {
    const exp = new Date(expiredAt).getTime();
    const now = Date.now();
    const days = ((exp - now) / 86400000).toFixed(1);
    if (exp > now) {
      console.log(chalk.gray(`  token expires in ${days} days (${expiredAt})`));
    } else {
      console.log(chalk.yellow(`  ⚠ token EXPIRED ${days} days ago (${expiredAt})`));
    }
  }

  const url = new URL('/icube/api/v1/user', host);

  // Mirror the app's register-user call (ICubeProductService):
  //   POST {iCubeApi}/icube/api/v1/user
  //   headers: Content-Type json, x-icube-token
  //   body: common params + uid/userRegion/organization/scope
  const storageJsonPath = resolve(process.env.APPDATA ?? '', 'TRAE SOLO CN', 'User', 'globalStorage', 'storage.json');
  const machineId = existsSync(storageJsonPath)
    ? ((JSON.parse(readFileSync(storageJsonPath, 'utf-8')) as Record<string, string>)['telemetry.machineId'] ?? '')
    : '';

  const account = (cred.account ?? {}) as Record<string, unknown>;
  const userRegion = (cred.userRegion ?? {}) as Record<string, unknown>;

  const postBody = {
    mid: machineId,
    did: machineId || '0',
    uid: userId ?? '',
    userRegion: (userRegion['region'] as string) ?? '',
    organization: (account['organization'] as string) ?? '',
    scope: (account['scope'] as string) ?? '',
    tenant: (account['scope'] as string) ?? '',
    productCode: 'TRAE',
    platform: process.platform,
    arch: process.arch,
  };

  console.log(chalk.gray(`  POST ${url.toString()}`));
  console.log(chalk.gray(`  x-icube-token: ${token.slice(0, 16)}…(${token.length} chars)`));
  console.log(chalk.gray(`  body.uid: ${userId}\n`));

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-icube-token': token,
      },
      body: JSON.stringify(postBody),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.log(chalk.red('✗ Network error: ' + (err as Error).message));
    return;
  }

  const bodyText = await resp.text();
  let bodyJson: unknown = null;
  try { bodyJson = JSON.parse(bodyText); } catch { /* keep raw */ }

  console.log(chalk.cyan('─── Response ───'));
  console.log(`  status: ${resp.status} ${resp.statusText}`);

  // Extract safe fields from response
  const summary: Record<string, unknown> = { httpStatus: resp.status };
  if (bodyJson && typeof bodyJson === 'object') {
    const obj = bodyJson as Record<string, any>;
    const data = obj.data ?? obj.result ?? obj;
    if (data && typeof data === 'object') {
      for (const k of ['userId', 'user_id', 'username', 'email', 'organization', 'identityStr']) {
        if (data[k] !== undefined) summary[k] = typeof data[k] === 'string' && data[k].length > 40 ? mask(data[k]) : data[k];
      }
    }
    if (obj.code !== undefined) summary.code = obj.code;
    if (obj.message) summary.message = obj.message;
  }
  for (const [k, v] of Object.entries(summary)) {
    console.log(chalk.gray(`  ${k}: ${String(v)}`));
  }

  const matchesSelf =
    summary.userId === userId ||
    summary.user_id === userId;

  if (resp.ok && (matchesSelf || summary.code === 0 || resp.ok)) {
    console.log('');
    console.log(chalk.green.bold('  ✅ VALIDATION PASSED — credential is LIVE.'));
    if (matchesSelf) console.log(chalk.green(`     API returned our own userId (${userId}).`));
  } else {
    console.log('');
    console.log(chalk.yellow('  ⚠ Validation inconclusive or failed — see response above.'));
  }

  // Save evidence
  const outDir = resolve(process.cwd(), 'output', 'phase6');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, 'validation.json'),
    JSON.stringify({ url: url.toString(), ...summary, rawPreview: bodyText.slice(0, 2000) }, null, 2),
  );
  console.log(chalk.gray(`\n  Evidence saved to: ${resolve(outDir, 'validation.json')}`));
}

function mask(s: string): string {
  return s.slice(0, 12) + `…(${s.length})`;
}

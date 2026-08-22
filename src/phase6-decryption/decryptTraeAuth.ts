/**
 * decryptTraeAuth — decrypt TRAE SOLO CN credentials from globalStorage/storage.json.
 *
 * Targets keys like:
 *   iCubeAuthInfo://icube.cloudide        → user info JSON (token, account…)
 *   iCubeAuthInfo://icube-dc:<userId>     → device key pair {privateKeyPEM, publicKeyPEM}
 *   iCubeAuthInfo://usertag               → { userId: userTag } map
 */

import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decryptBlob, initFromMainJs } from './byteCrypto.js';

const MAIN_JS_CANDIDATES = [
  'C:\\Program Files\\TRAE SOLO CN\\resources\\app\\out\\main.js',
  'C:\\Program Files (x86)\\TRAE SOLO CN\\resources\\app\\out\\main.js',
];

const STORAGE_JSON_CANDIDATES = [
  resolve(process.env.APPDATA ?? '', 'TRAE SOLO CN', 'User', 'globalStorage', 'storage.json'),
  resolve(process.env.APPDATA ?? '', 'TraeWork CN', 'User', 'globalStorage', 'storage.json'),
];

/** Mask a secret for terminal display */
function mask(s: string | undefined, keep = 10): string {
  if (!s) return '(empty)';
  return s.length <= keep ? s : s.slice(0, keep) + `…(${s.length} chars)`;
}

export interface AuthDecryptSummary {
  storageJson: string;
  totalKeys: number;
  decrypted: Array<{ key: string; mode: string; outPath: string; preview: Record<string, unknown> }>;
  failed: Array<{ key: string; reason: string }>;
}

export async function decryptTraeAuth(): Promise<AuthDecryptSummary | null> {
  const mainJs = MAIN_JS_CANDIDATES.find((p) => existsSync(p));
  const storageJson = STORAGE_JSON_CANDIDATES.find((p) => existsSync(p));

  if (!mainJs) {
    console.log(chalk.red('  ✗ TRAE out/main.js not found — cannot extract crypto tables.'));
    return null;
  }
  if (!storageJson) {
    console.log(chalk.red('  ✗ TRAE globalStorage/storage.json not found.'));
    return null;
  }

  initFromMainJs(mainJs);

  const store = JSON.parse(readFileSync(storageJson, 'utf-8')) as Record<string, string>;
  const targetKeys = Object.keys(store).filter(
    (k) => k.startsWith('iCubeAuthInfo://') || k.startsWith('iCubeServerData://'),
  );

  console.log(chalk.gray(`  main.js      : ${mainJs}`));
  console.log(chalk.gray(`  storage.json : ${storageJson}`));
  console.log(chalk.gray(`  target keys  : ${targetKeys.length}\n`));

  const outDir = resolve(process.cwd(), 'output', 'phase6', 'decrypted');
  mkdirSync(outDir, { recursive: true });

  const summary: AuthDecryptSummary = { storageJson, totalKeys: targetKeys.length, decrypted: [], failed: [] };

  for (const key of targetKeys) {
    const value = store[key];
    if (typeof value !== 'string' || value.length < 16) continue;

    let result;
    try {
      const trimmed = value.trimStart();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        // Plaintext JSON stored without encryption
        result = { ok: true, mode: 'PLAINTEXT' as const, plaintext: value };
      } else {
        result = await decryptBlob(value);
      }
    } catch (err) {
      result = { ok: false, mode: 'UNKNOWN' as const, reason: (err as Error).message };
    }

    if (result.ok && result.plaintext !== undefined) {
      // Pretty-print if JSON
      let pretty = result.plaintext;
      try { pretty = JSON.stringify(JSON.parse(result.plaintext), null, 2); } catch { /* keep raw */ }

      const safeName = key.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const outPath = resolve(outDir, `${safeName}.json`);
      writeFileSync(outPath, pretty);

      const preview: Record<string, unknown> = {};
      try {
        const obj = JSON.parse(result.plaintext) as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string') preview[k] = mask(v);
          else if (v && typeof v === 'object') preview[k] = '{…}';
          else preview[k] = v;
        }
      } catch {
        preview.text = mask(result.plaintext, 60);
      }

      summary.decrypted.push({ key, mode: result.mode, outPath, preview });

      console.log(chalk.green(`  ✓ ${key}`));
      console.log(chalk.gray(`    mode : ${result.mode}`));
      console.log(chalk.gray(`    saved: ${outPath}`));
      for (const [k, v] of Object.entries(preview)) {
        console.log(chalk.gray(`    ${k} = ${String(v)}`));
      }
      console.log();
    } else {
      summary.failed.push({ key, reason: result.reason ?? 'unknown error' });
      console.log(chalk.red(`  ✗ ${key}`));
      console.log(chalk.gray(`    reason: ${result.reason}\n`));
    }
  }

  return summary;
}

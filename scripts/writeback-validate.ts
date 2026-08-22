/**
 * Write-back rotated credentials to TRAE storage.json (re-encrypted) + validate new token.
 * Run AFTER a successful refresh, while TRAE is closed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encryptBlob, initFromMainJs } from '../src/phase6-decryption/byteCrypto.js';

const STORAGE = resolve(process.env.APPDATA ?? '', 'TRAE SOLO CN', 'User', 'globalStorage', 'storage.json');
const KEY = 'iCubeAuthInfo://icube.cloudide';

await initFromMainJs('C:/Program Files/TRAE SOLO CN/resources/app/out/main.js');

const creds = JSON.parse(readFileSync('output/phase6/decrypted/iCubeAuthInfo_icube_cloudide.json', 'utf-8'));

// 1) write back re-encrypted
const store = JSON.parse(readFileSync(STORAGE, 'utf-8'));
if (typeof store[KEY] !== 'string') throw new Error('auth key missing in storage.json');
store[KEY] = await encryptBlob(JSON.stringify(creds));
writeFileSync(STORAGE, JSON.stringify(store, null, 4));
console.log('✓ re-encrypted credentials written back to storage.json');

// 2) sanity: decrypt round-trip via our own pipeline? (encrypt verified by app later)
//    quick structural check instead:
const raw = JSON.parse(readFileSync(STORAGE, 'utf-8'))[KEY];
const buf = Buffer.from(raw, 'base64');
console.log(`  envelope head: ${buf.subarray(0, 6).toString('hex')} (expect 746305100000)`);

// 3) validate fresh token against live API
const r = await fetch('https://api.trae.cn/icube/api/v1/user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-icube-token': creds.token },
  body: JSON.stringify({ uid: creds.userId }),
  signal: AbortSignal.timeout(15000),
});
const j: any = await r.json().catch(() => null);
console.log(`✓ validate /icube/api/v1/user: HTTP ${r.status} success=${j?.success} loginAllowed=${j?.data?.loginAllowed}`);

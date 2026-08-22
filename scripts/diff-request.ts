/**
 * Diff harness: build request via traeClient.buildExchangeRequest and compare
 * field-by-field with the known-good inline implementation.
 */
import { createSign, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildExchangeRequest } from '../src/phase6-decryption/traeClient.js';

const creds = JSON.parse(readFileSync('output/phase6/decrypted/iCubeAuthInfo_icube_cloudide.json', 'utf-8'));
const dc = JSON.parse(readFileSync('output/phase6/decrypted/iCubeAuthInfo_icube_dc_1448485154478571.json', 'utf-8'));
const machineId = JSON.parse(readFileSync(process.env.APPDATA + '/TRAE SOLO CN/User/globalStorage/storage.json', 'utf-8'))['telemetry.machineId'];

// known-good inline request
const clientId = 'en1oxy7wnw8j9n';
const path = '/trae/api/v3/oauth/ExchangeToken';
const ts = Math.floor(Date.now() / 1000);
const nonce = randomBytes(16).toString('hex');
const canonical = ['POST', path, clientId, creds.refreshToken, String(ts), nonce].join('\n');
const signature = createSign('sha256').update(Buffer.from(canonical, 'utf-8')).sign(dc.privateKeyPEM).toString('base64');

const good = {
  ClientID: clientId,
  ClientSecret: '',
  RefreshToken: creds.refreshToken,
  DeviceInfo: {
    DeviceID: '1448485154478571',
    MachineID: machineId,
    PlatformCode: 'SOLO_PC',
    DeviceType: 'PC',
    DeviceName: process.env.USERNAME,
    DeviceModel: '',
    ClientVersion: '1.107.1',
    DevicePublicKey: dc.publicKeyPEM,
    DeviceBrand: '',
    DeviceCPU: '',
    OSInfo: 'Windows',
    OSVersion: '10.0.26100',
  },
  DeviceProof: { Signature: signature, Timestamp: ts, Nonce: nonce },
  IDEVersion: '1.107.1',
};

// client-built request
const built = buildExchangeRequest();
const theirs = built.body as any;

console.log('=== field diff (client-built vs known-good) ===');
for (const k of new Set([...Object.keys(good), ...Object.keys(theirs)])) {
  const a = theirs[k], b = (good as any)[k];
  if (k === 'DeviceInfo') {
    for (const dk of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
      const av = a?.[dk], bv = b?.[dk];
      if (av !== bv) console.log(`DeviceInfo.${dk}:\n  client: ${JSON.stringify(av)?.slice(0, 80)}\n  good  : ${JSON.stringify(bv)?.slice(0, 80)}`);
    }
  } else if (k === 'DeviceProof') {
    // signature differs per nonce/ts by design; compare structure only
    console.log(`DeviceProof keys: client=${Object.keys(a ?? {}).join(',')} good=${Object.keys(b ?? {}).join(',')}`);
    console.log(`DeviceProof.Timestamp types: client=${typeof a?.Timestamp} good=${typeof b?.Timestamp}`);
  } else if (a !== b) {
    console.log(`${k}:\n  client: ${JSON.stringify(a)?.slice(0, 80)}\n  good  : ${JSON.stringify(b)?.slice(0, 80)}`);
  }
}
console.log('=== headers ===');
console.log('client:', JSON.stringify(built.headers));
console.log('=== urls ===');
console.log('client:', built.url);

// Now send the CLIENT-BUILT request to see if it succeeds/fails
const r = await fetch(built.url, {
  method: 'POST',
  headers: built.headers,
  body: JSON.stringify(built.body),
  signal: AbortSignal.timeout(30000),
});
const j: any = await r.json().catch(() => null);
console.log(`\nclient-built request → HTTP ${r.status} ${j?.Result?.Token ? 'SUCCESS' : 'code=' + j?.ResponseMetadata?.Error?.Code + ' ' + j?.ResponseMetadata?.Error?.Message}`);

if (j?.Result?.Token) {
  // persist so state stays consistent
  creds.token = j.Result.Token;
  if (j.Result.RefreshToken) creds.refreshToken = j.Result.RefreshToken;
  const t = Number(j.Result.TokenExpireAt);
  const now = Date.now();
  const dur = Number(j.Result.TokenExpireDuration);
  creds.expiredAt = (!isNaN(t) && now > t && dur) ? new Date(now + dur).toISOString() : new Date(t).toISOString();
  if (j.Result.RefreshExpireAt) creds.refreshExpiredAt = new Date(j.Result.RefreshExpireAt).toISOString();
  creds.tokenReleaseAt = new Date().toISOString();
  const { writeFileSync } = await import('node:fs');
  writeFileSync('output/phase6/decrypted/iCubeAuthInfo_icube_cloudide.json', JSON.stringify(creds, null, 2));
  console.log('✓ saved rotated credentials');
}

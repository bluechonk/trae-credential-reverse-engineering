import { createSign, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const credsPath = 'output/phase6/decrypted/iCubeAuthInfo_icube_cloudide.json';
const dcPath = 'output/phase6/decrypted/iCubeAuthInfo_icube_dc_1448485154478571.json';
const creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
const dc = JSON.parse(readFileSync(dcPath, 'utf-8'));

const clientId = 'en1oxy7wnw8j9n';
const path = '/trae/api/v3/oauth/ExchangeToken';
const ts = Math.floor(Date.now() / 1000);
const nonce = randomBytes(16).toString('hex');
const canonical = ['POST', path, clientId, creds.refreshToken, String(ts), nonce].join('\n');
const signature = createSign('sha256').update(Buffer.from(canonical, 'utf-8')).sign(dc.privateKeyPEM).toString('base64');

const body = {
  ClientID: clientId,
  ClientSecret: '',
  RefreshToken: creds.refreshToken,
  DeviceInfo: {
    DeviceID: '1448485154478571',
    MachineID: JSON.parse(readFileSync(process.env.APPDATA + '/TRAE SOLO CN/User/globalStorage/storage.json', 'utf-8'))['telemetry.machineId'],
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

const r = await fetch('https://api.trae.cn' + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-cloudide-token': '' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(30000),
});
const j: any = await r.json().catch(() => null);
if (!r.ok || !j?.Result?.Token) {
  console.log(`FAIL HTTP ${r.status} code=${j?.ResponseMetadata?.Error?.Code} msg=${j?.ResponseMetadata?.Error?.Message}`);
  process.exit(1);
}

console.log('✓ Exchange OK');
console.log(`  Result keys     : ${Object.keys(j.Result).join(', ')}`);
console.log(`  new Token       : ${String(j.Result.Token).slice(0, 14)}…(${String(j.Result.Token).length})`);
console.log(`  new RefreshToken: ${String(j.Result.RefreshToken ?? '').slice(0, 10)}…(${String(j.Result.RefreshToken ?? '').length})`);
console.log(`  TokenExpireAt   : ${j.Result.TokenExpireAt}`);
console.log(`  RefreshExpireAt : ${j.Result.RefreshExpireAt}`);

// Persist rotated creds
creds.token = j.Result.Token;
if (j.Result.RefreshToken) creds.refreshToken = j.Result.RefreshToken;
if (j.Result.TokenExpireAt !== undefined) {
  const t = Number(j.Result.TokenExpireAt);
  const now = Date.now();
  const dur = Number(j.Result.TokenExpireDuration);
  creds.expiredAt = (!isNaN(t) && now > t && dur) ? new Date(now + dur).toISOString() : new Date(isNaN(t) ? j.Result.TokenExpireAt : t).toISOString();
}
if (j.Result.RefreshExpireAt) creds.refreshExpiredAt = new Date(j.Result.RefreshExpireAt).toISOString();
creds.tokenReleaseAt = new Date().toISOString();
writeFileSync(credsPath, JSON.stringify(creds, null, 2));
writeFileSync('output/phase6/exchange-result.json', JSON.stringify({ at: new Date().toISOString(), resultKeys: Object.keys(j.Result), expiredAt: creds.expiredAt, refreshExpiredAt: creds.refreshExpiredAt }, null, 2));
console.log('\n✓ saved rotated credentials to decrypted store');

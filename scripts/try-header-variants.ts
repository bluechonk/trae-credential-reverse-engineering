import { createSign, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const creds = JSON.parse(readFileSync('output/phase6/decrypted/iCubeAuthInfo_icube_cloudide.json', 'utf-8'));
const dc = JSON.parse(readFileSync('output/phase6/decrypted/iCubeAuthInfo_icube_dc_1448485154478571.json', 'utf-8'));

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

const variants: Array<[string, Record<string, string>]> = [
  ['empty x-cloudide-token', { 'Content-Type': 'application/json', 'x-cloudide-token': '' }],
  ['no x-cloudide-token', { 'Content-Type': 'application/json' }],
];

for (const [name, headers] of variants) {
  const r = await fetch('https://api.trae.cn' + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const j: any = await r.json().catch(() => null);
  const code = j?.ResponseMetadata?.Error?.Code;
  const msg = j?.ResponseMetadata?.Error?.Message;
  console.log(`${name}: HTTP ${r.status} code=${code ?? '-'} msg=${msg ?? (j?.Result ? 'SUCCESS Result.Token len=' + String(j?.Result?.Token).length : '?')}`);
}

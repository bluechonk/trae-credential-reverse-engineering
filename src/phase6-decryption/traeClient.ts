/**
 * traeClient — TRAE SOLO CN auth & growth API client (reverse engineered).
 *
 * Sources (out/main.js):
 *   - oauth/marscode/request.js  → exchangeTokenByRefreshToken / checkLogin / m() headers
 *   - oauth/common/util.js       → rv() ClientID
 *   - oauth/marscode/util.js     → E_e() device-proof signature (ECDSA P-256 SHA-256)
 *   - commercial service         → checkin_credits/status|claim (ugApi)
 *
 * Auth header styles:
 *   ug commercial APIs : Authorization: Cloud-IDE-JWT <token>  +  x-device-id
 *   oauth exchange     : x-cloudide-token: <token>
 */

import { createSign, createHash, randomBytes, sign } from 'node:crypto';
import { release as osRelease } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';

const UG_HOST = 'https://api.trae.cn';           // product.json bootConfig.ug.trae.normal
const EXCHANGE_PATH = '/trae/api/v3/oauth/ExchangeToken';
const CHECKIN_STATUS_PATH = '/trae/api/v2/ug/checkin_credits/status';
const CHECKIN_CLAIM_PATH = '/trae/api/v2/ug/checkin_credits/claim';
const CLIENT_ID_SOLO_FALLBACK = 'en1oxy7wnw8j9n'; // rv() fallback for SOLO channel
const APP_VERSION = '1.107.1';

const DECRYPTED_DIR = resolve(process.cwd(), 'output', 'phase6', 'decrypted');
const CRED_FILE = resolve(DECRYPTED_DIR, 'iCubeAuthInfo_icube_cloudide.json');
const DEVICE_FILE = resolve(DECRYPTED_DIR, 'iCubeAuthInfo_icube_dc_1448485154478571.json');
const STORAGE_JSON = resolve(process.env.APPDATA ?? '', 'TRAE SOLO CN', 'User', 'globalStorage', 'storage.json');

interface CloudideCreds {
  token: string;
  refreshToken: string;
  expiredAt: string;
  refreshExpiredAt: string;
  userId: string;
  host: string;
  account?: Record<string, unknown>;
  userRegion?: Record<string, unknown>;
  [k: string]: unknown;
}

interface DeviceKeyPair { privateKeyPEM: string; publicKeyPEM: string }

export function loadCreds(): CloudideCreds {
  if (!existsSync(CRED_FILE)) throw new Error('decrypted credentials missing — run phase6 first');
  return JSON.parse(readFileSync(CRED_FILE, 'utf-8')) as CloudideCreds;
}

function loadDeviceKeyPair(): DeviceKeyPair {
  if (!existsSync(DEVICE_FILE)) throw new Error('decrypted device key pair missing — run phase6 first');
  return JSON.parse(readFileSync(DEVICE_FILE, 'utf-8')) as DeviceKeyPair;
}

function machineId(): string {
  if (existsSync(STORAGE_JSON)) {
    const s = JSON.parse(readFileSync(STORAGE_JSON, 'utf-8')) as Record<string, string>;
    return s['telemetry.machineId'] ?? '';
  }
  return '';
}

/** Real device id (ICDRS): numeric id from [ICDRS] logs; matches iCubeAuthInfo://icube-dc:<did> key */
const AHA_DEVICE_ID = '1448485154478571';

/** Mirror of E_e(): sign canonical string with the device EC P-256 private key */
let lastCanonical = '';
function signDeviceProof(method: string, path: string, clientId: string, refreshToken: string, privatePem: string, separator = '\n', dsaEncoding: 'der' | 'ieee-p1363' = 'der') {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('hex');
  const canonical = [method, path, clientId, refreshToken, String(ts), nonce].join(separator);
  lastCanonical = canonical;
  const data = Buffer.from(canonical, 'utf-8');
  const signature = (dsaEncoding === 'der')
    ? createSign('sha256').update(data).sign(privatePem)
    : sign('sha256', data, { key: privatePem, dsaEncoding });
  // NOTE: server expects PascalCase field names (Signature/Timestamp/Nonce),
  // NOT lowercase — lowercase is silently treated as "proof missing" (20405).
  return { Timestamp: ts, Nonce: nonce, Signature: signature.toString('base64') };
}

interface SystemInfo {
  deviceModel: string;
  deviceManufacturer: string;
  cpuBrand: string;
  osName: string;
  osVersion: string;
}

/** Mirror of getSystemInformation(): real WMI values so the fingerprint matches registration */
function getSystemInformation(): SystemInfo {
  try {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const ps = (cmd: string): string => {
      try {
        return execSync(`powershell -NoProfile -Command "${cmd}"`, { encoding: 'utf-8', timeout: 15000 }).trim();
      } catch { return ''; }
    };
    const cs = ps("(Get-CimInstance Win32_ComputerSystem | Select-Object -First 1 | ForEach-Object { $_.Manufacturer + '|' + $_.Model })");
    const cpu = ps("(Get-CimInstance Win32_Processor | Select-Object -First 1 | ForEach-Object { $_.Name })");
    const os = ps("(Get-CimInstance Win32_OperatingSystem | Select-Object -First 1 | ForEach-Object { $_.Caption + '|' + $_.Version })");
    const [deviceManufacturer = '', deviceModel = ''] = cs.split('|');
    const [osName = '', osVersion = ''] = os.split('|');
    return {
      deviceManufacturer: deviceManufacturer.trim(),
      deviceModel: deviceModel.trim(),
      cpuBrand: cpu.replace(/\s+/g, ' ').trim(),
      osName: osName.trim(),
      osVersion: osVersion.trim(),
    };
  } catch {
    return { deviceModel: '', deviceManufacturer: '', cpuBrand: '', osName: 'Windows', osVersion: osRelease() };
  }
}

/** Mirror of A_e(): device display name = user display name / username */
function deviceName(): string {
  return process.env.USERNAME ?? 'user';
}

/**
 * Enrollment fingerprint overrides (OSInfo/OSVersion captured at login time).
 * The server validates DeviceInfo against the fingerprint enrolled at login;
 * a Windows feature update (e.g. 24H2 26100 → 25H2 26200) changes os.release()
 * and breaks refresh — for our client AND for the official app (until re-login).
 * output/phase6/device-fingerprint.json pins the enrolled values.
 */
function loadFingerprintOverrides(): { OSInfo?: string; OSVersion?: string } {
  const fp = resolve(DECRYPTED_DIR, '..', 'device-fingerprint.json');
  if (existsSync(fp)) {
    try { return JSON.parse(readFileSync(fp, 'utf-8')); } catch { return {}; }
  }
  return {};
}

/**
 * Mirror of DeviceInfo builder (method j of AZ class).
 *
 * NOTE: empirically the server validates these fields against the enrollment
 * fingerprint captured at login. The base set below is the PROVEN-WORKING one
 * ('Windows' / empty hardware strings); richer WMI values are rejected with 20405.
 */
function buildDeviceInfo(publicPem: string) {
  const fp = loadFingerprintOverrides();
  return {
    DeviceID: AHA_DEVICE_ID,
    MachineID: machineId(),
    PlatformCode: 'SOLO_PC',
    DeviceType: 'PC',
    DeviceName: deviceName(),
    DeviceModel: '',
    ClientVersion: APP_VERSION,
    DevicePublicKey: publicPem,
    DeviceBrand: '',
    DeviceCPU: '',
    OSInfo: fp.OSInfo ?? 'Windows',
    OSVersion: fp.OSVersion ?? osRelease(),
  };
}

export interface ExchangeResult {
  ok: boolean;
  newToken?: string;
  newRefreshToken?: string;
  expiredAt?: string;
  refreshExpiredAt?: string;
  raw?: unknown;
  error?: string;
}

/** Build the ExchangeToken request (exposed for debugging/diffing) */
export function buildExchangeRequest(separator = '\n', dsaEncoding: 'der' | 'ieee-p1363' = 'der') {
  const creds = loadCreds();
  const device = loadDeviceKeyPair();
  const clientId = CLIENT_ID_SOLO_FALLBACK;

  const proof = signDeviceProof('POST', EXCHANGE_PATH, clientId, creds.refreshToken, device.privateKeyPEM, separator, dsaEncoding);
  const body = {
    ClientID: clientId,
    ClientSecret: '',
    RefreshToken: creds.refreshToken,
    DeviceInfo: buildDeviceInfo(device.publicKeyPEM),
    DeviceProof: proof,
    IDEVersion: APP_VERSION,
  };
  return {
    url: UG_HOST + EXCHANGE_PATH,
    headers: { 'Content-Type': 'application/json', 'x-cloudide-token': '' } as Record<string, string>,
    body,
  };
}

/** POST /trae/api/v3/oauth/ExchangeToken — rotate token via refresh token */
export async function exchangeTokenByRefreshToken(separator = '\n', dsaEncoding: 'der' | 'p1363' = 'der'): Promise<ExchangeResult> {
  const req = buildExchangeRequest(separator === ' ' ? ' ' : '\n', dsaEncoding as 'der' | 'ieee-p1363');
  const { url, headers, body } = req;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      // NOTE: empirically the endpoint expects an EMPTY x-cloudide-token for the
      // refresh-token grant; sending the old access token yields 20405
      // "Device proof required" (wrong auth branch server-side).
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    return { ok: false, error: 'network: ' + (err as Error).message };
  }

  const json = await resp.json().catch(() => null) as any;
  const errCode = json?.ResponseMetadata?.Error?.Code;
  if (!resp.ok || errCode) {
    return { ok: false, error: `HTTP ${resp.status} code=${errCode ?? '?'} msg=${json?.ResponseMetadata?.Error?.Message ?? ''}`, raw: json };
  }
  const result = json?.Result;
  if (!result?.Token) {
    return { ok: false, error: 'no Result.Token in response', raw: json };
  }

  return {
    ok: true,
    newToken: result.Token,
    newRefreshToken: result.RefreshToken,
    expiredAt: normalizeExpiry(result.TokenExpireAt, result.TokenExpireDuration),
    refreshExpiredAt: result.RefreshExpireAt ? new Date(result.RefreshExpireAt).toISOString() : undefined,
    raw: { keys: Object.keys(result) },
  };
}

function normalizeExpiry(expireAt: unknown, durationMs: unknown): string | undefined {
  const t = typeof expireAt === 'number' ? expireAt : new Date(String(expireAt)).getTime();
  const now = Date.now();
  if (now > t && typeof durationMs === 'number') return new Date(now + durationMs).toISOString();
  return new Date(t).toISOString();
}

/** Persist rotated credentials back into our decrypted store */
export function saveRotatedCreds(r: ExchangeResult): void {
  const creds = loadCreds();
  creds.token = r.newToken!;
  if (r.newRefreshToken) creds.refreshToken = r.newRefreshToken;
  if (r.expiredAt) creds.expiredAt = r.expiredAt;
  if (r.refreshExpiredAt) creds.refreshExpiredAt = r.refreshExpiredAt;
  creds.tokenReleaseAt = new Date().toISOString();
  writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));
}

/** POST {ug}/trae/api/v2/ug/checkin_credits/status — body {} */
export async function checkinStatus(token: string): Promise<{ status: number; data: any }> {
  return postUg(CHECKIN_STATUS_PATH, token);
}

/** POST {ug}/trae/api/v2/ug/checkin_credits/claim — body {} */
export async function checkinClaim(token: string): Promise<{ status: number; data: any }> {
  return postUg(CHECKIN_CLAIM_PATH, token);
}

async function postUg(path: string, token: string): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Cloud-IDE-JWT ${token}`,
    'x-device-id': AHA_DEVICE_ID,
  };
  const resp = await fetch(UG_HOST + path, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(30000),
  });
  const data = await resp.json().catch(() => null);
  return { status: resp.status, data };
}

export function maskToken(t: string | undefined): string {
  if (!t) return '(none)';
  return t.slice(0, 14) + `…(${t.length})`;
}

export function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

#!/usr/bin/env node
/**
 * trae-cli.mjs — TRAE CN 凭据逆向：零依赖单文件 CLI（Node >= 18，无 npm install）。
 *
 * 与 src/（TypeScript 工程）同源的已验证逻辑直译，真实落地产物：
 *   decrypt   解密 storage.json 凭据（byteCrypto 信封，纯本地无网络）
 *   validate  凭据活性验证（icube/user + 新 OAuth 域 GetUserInfo，共 2 次轻请求）
 *   checkin   每日签到（默认只查状态；--claim 才领取，防误触发）
 *   refresh   ExchangeToken 轮换（双端点候选 + ECDSA P-256 设备签名；--yes 确认）
 *   models    模型列表（remote 目录 + 22 通道目录，2 次轻请求）
 *   login-url 打印网页授权登录 URL（20 参数形态）
 *
 * 用法：node scripts/trae-cli.mjs <command> [options]
 */

import { createSign, createHash, randomBytes, webcrypto } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

// ── 域名与端点（2026-10 对齐 modelmux traecn 实测） ──────────────────────────

const UG_HOST = 'https://api.trae.cn';                    // 签到（IDE 域）
const OAUTH_HOST = 'https://api.trae.com.cn';             // OAuth（ExchangeToken/GetUserInfo）
const AGENT_HOST = 'https://trae-api-cn.mchost.guru';     // 模型列表 / 对话
const OAUTH_USER_INFO_PATH = '/cloudide/api/v3/trae/GetUserInfo';
const CHECKIN_STATUS_PATH = '/trae/api/v2/ug/checkin_credits/status';
const CHECKIN_CLAIM_PATH = '/trae/api/v2/ug/checkin_credits/claim';
const REMOTE_MODELS_PATH = '/api/remote/v1/models';
const REMOTE_FUNCTIONS = 'solo_agent_remote%2Csolo_work_remote%2Csolo_design_remote';
const MODELS_PATH = '/api/ide/v1/batch_get_detail_param';
const APP_ID = '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8';    // 旧 …01a… 记录已被上游撤下
const IDE_VERSION = '0.1.52';
const IDE_VERSION_CODE = '20260811';
const PLUGIN_VERSION = '2.3.62834';
const USER_AGENT = 'Trae/0.1.52';
const WEB_CLIENT_ID = 'ono9krqynydwx5';                   // 网页授权门户 client_id（IDE ID 会 404）
const CONSOLE_HOST = 'https://www.trae.cn';
const CLIENT_ID_SOLO = 'en1oxy7wnw8j9n';                  // product.json authConfig.SOLO.stable
const APP_VERSION = '1.107.1';

/** ExchangeToken 端点候选：新域优先，旧域回退（404 自动切换）。 */
const EXCHANGE_ENDPOINTS = [
  'https://api.trae.com.cn/cloudide/api/v3/trae/oauth/ExchangeToken',
  'https://api.trae.cn/trae/api/v3/oauth/ExchangeToken',
];

// ── 路径定位（Trae CN 优先，旧安装名兜底） ───────────────────────────────────

const pf = process.env.ProgramFiles ?? join(process.env.SystemDrive ?? 'C:', 'Program Files');
const pf86 = process.env['ProgramFiles(x86)'] ?? join(process.env.SystemDrive ?? 'C:', 'Program Files (x86)');
const la = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
const ra = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
const APP_DIR_NAMES = ['Trae CN', 'TRAE SOLO CN', 'TraeWork CN'];

export function findMainJs() {
  for (const root of [join(la, 'Programs'), pf, pf86]) {
    for (const name of APP_DIR_NAMES) {
      const p = join(root, name, 'resources', 'app', 'out', 'main.js');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export function findStorageJson() {
  for (const base of [ra, la]) {
    for (const name of APP_DIR_NAMES) {
      const p = join(base, name, 'User', 'globalStorage', 'storage.json');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// ── byteCrypto：信封解密/加密（与 out/main.js 的 Em/jOe 同源） ────────────────

const KEY_LEN = 16, IV_LEN = 16, RH = 64, RANDOM_LEN = 32, HEADER_LEN = 6;
let _tables = null;

/**
 * 从 main.js 提取四张 64 字节硬编码表。锚点随版本混淆轮换，双锚点候选：
 *   2026-08（TRAE SOLO CN）: ",Em=async t=>"
 *   2026-10（Trae CN）     : "…components/userStorage.js\"()\"{\"use strict\"" 模块路径串（不混淆）
 * 表序（hie/wie/vie/qie）由真实密文解密验证（SHA-512 tag）。
 */
export function extractTablesFromMainJs(mainJsPath) {
  const src = readFileSync(mainJsPath, 'utf-8');
  const anchors = [
    ['components/userStorage.js"(){"use strict"', 'userStorage.js module path'],
    [',Em=async t=>', 'Em=async'],
  ];
  let region = null, used = '';
  for (const [needle, label] of anchors) {
    const i = src.indexOf(needle);
    if (i >= 0) { region = src.slice(Math.max(0, i - 8000), i); used = label; break; }
  }
  if (region === null) throw new Error('byteCrypto anchor not found in main.js');
  const re = /(?:new\s+Uint8Array|Uint8Array\.from)\(\s*\[\s*([0-9\s*,]+?)\s*\]\s*\)/g;
  const found = [];
  let m;
  while ((m = re.exec(region)) !== null) {
    const nums = m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (nums.length >= 64) found.push(nums);
  }
  if (found.length < 4) throw new Error(`expected >=4 tables near ${used}, found ${found.length}`);
  const four = found.slice(-4);
  return {
    used,
    hie: Uint8Array.from(four[0].slice(0, 64)),
    wie: Uint8Array.from(four[1].slice(0, 64)),
    vie: Uint8Array.from(four[2].slice(0, 64)),
    qie: Uint8Array.from(four[3].slice(0, 64)),
  };
}

const sha512 = async (data) => new Uint8Array(await webcrypto.subtle.digest('SHA-512', data));

function xor(a, b, len = 64) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = a[i] ^ b[i];
  return out;
}

/** Rie(): key/iv = SHA512(SHA512(random)||pepper) 的前 32 字节对半 */
async function deriveKeys(random, mode) {
  const pepper = mode === 'AES_PRIVATE' ? xor(_tables.hie, _tables.wie) : xor(_tables.vie, _tables.qie);
  const n = new Uint8Array(128);
  n.set(await sha512(random), 0);
  n.set(pepper, 64);
  n.set(await sha512(n), 0);
  return { aesKey: n.slice(0, 16), iv: n.slice(16, 32) };
}

export function initCrypto(mainJsPath) {
  _tables = extractTablesFromMainJs(mainJsPath);
}

function detectMode(h) {
  if (h[0] === 116 && h[1] === 99 && h[2] === 5 && h[3] === 16 && h[4] === 0 && h[5] === 0) return 'AES';
  if (h[0] === 18 && h[1] === 57 && h[2] === 18 && h[3] === 32 && h[4] === 2 && h[5] === 3) return 'AES_PRIVATE';
  return 'UNKNOWN';
}

async function aesCbc(op, key, iv, data) {
  const k = await webcrypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, [op]);
  try {
    return new Uint8Array(await webcrypto.subtle[op]({ name: 'AES-CBC', iv }, k, data));
  } catch {
    return new Uint8Array(0);
  }
}

/** 解密一条 base64 信封（完整性：明文前 64 字节 = SHA512(明文)） */
export async function decryptBlob(b64) {
  const raw = new Uint8Array(Buffer.from(b64, 'base64'));
  const mode = detectMode(raw.subarray(0, 6));
  if (mode === 'UNKNOWN') return { ok: false, mode, reason: `unknown header ${Buffer.from(raw.subarray(0, 6)).toString('hex')}` };
  const random = raw.subarray(HEADER_LEN, HEADER_LEN + RANDOM_LEN);
  if (random.length !== RANDOM_LEN) return { ok: false, mode, reason: 'blob too short' };
  const { aesKey, iv } = await deriveKeys(random, mode);
  const padded = await aesCbc('decrypt', aesKey, iv, raw.subarray(HEADER_LEN + RANDOM_LEN));
  if (padded.length <= RH) return { ok: false, mode, reason: 'AES-CBC decrypt failed' };
  const expected = padded.subarray(0, RH), body = padded.subarray(RH);
  const actual = await sha512(body);
  for (let i = 0; i < RH; i++) if (expected[i] !== actual[i]) return { ok: false, mode, reason: 'integrity check failed (SHA-512 mismatch)' };
  return { ok: true, mode, plaintext: new TextDecoder().decode(body) };
}

/** 加密回信封（refresh 后写回 storage.json 用） */
export async function encryptBlob(plaintext) {
  const random = webcrypto.getRandomValues(new Uint8Array(RANDOM_LEN));
  const { aesKey, iv } = await deriveKeys(random, 'AES');
  const body = new TextEncoder().encode(plaintext);
  const payload = new Uint8Array(RH + body.length);
  payload.set(await sha512(body), 0);
  payload.set(body, RH);
  const cipher = await aesCbc('encrypt', aesKey, iv, payload);
  const out = new Uint8Array(HEADER_LEN + RANDOM_LEN + cipher.length);
  out.set(Uint8Array.from([116, 99, 5, 16, 0, 0]), 0);
  out.set(random, HEADER_LEN);
  out.set(cipher, HEADER_LEN + RANDOM_LEN);
  return Buffer.from(out).toString('base64');
}

// ── 凭据 ─────────────────────────────────────────────────────────────────────

export const AUTH_KEY = 'iCubeAuthInfo://icube.cloudide';
const DECRYPTED_DIR = resolve(process.cwd(), 'output', 'mjs');

function mask(s) { return s ? s.slice(0, 14) + `…(${s.length})` : '(none)'; }

function machineId() {
  const p = findStorageJson();
  if (!p) return '';
  return JSON.parse(readFileSync(p, 'utf-8'))['telemetry.machineId'] ?? '';
}

function loadDecrypted() {
  const p = join(DECRYPTED_DIR, 'iCubeAuthInfo_icube_cloudide.json');
  if (!existsSync(p)) throw new Error('decrypted credentials not found — run `decrypt` first');
  return { path: p, creds: JSON.parse(readFileSync(p, 'utf-8')) };
}

function loadDeviceKeyPair() {
  const did = '1448485154478571'; // ICDRS 设备 ID（双安装共享，2026-10 重测不变）
  const p = join(DECRYPTED_DIR, `iCubeAuthInfo_icube_dc_${did}.json`);
  if (!existsSync(p)) throw new Error('device key pair not found — run `decrypt` first');
  return { did, pair: JSON.parse(readFileSync(p, 'utf-8')) };
}

// ── 网络请求计数（风控克制） ─────────────────────────────────────────────────

let httpCalls = 0;
async function http(url, opts = {}) {
  httpCalls++;
  return fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeoutMs ?? 20000) });
}

// ── 命令：decrypt ────────────────────────────────────────────────────────────

async function cmdDecrypt() {
  const mainJs = findMainJs();
  const storageJson = findStorageJson();
  if (!mainJs || !storageJson) throw new Error('Trae installation not found (main.js / storage.json)');
  console.log(`  main.js      : ${mainJs}`);
  console.log(`  storage.json : ${storageJson}`);
  initCrypto(mainJs);
  console.log(`  tables anchor: ${_tables.used}\n`);

  const store = JSON.parse(readFileSync(storageJson, 'utf-8'));
  mkdirSync(DECRYPTED_DIR, { recursive: true });
  let ok = 0, fail = 0;
  for (const [key, value] of Object.entries(store)) {
    if (!key.startsWith('iCubeAuthInfo://') && !key.startsWith('iCubeServerData://')) continue;
    if (typeof value !== 'string') continue;
    let result;
    try {
      result = value.trimStart().startsWith('{')
        ? { ok: true, mode: 'PLAINTEXT', plaintext: value }
        : await decryptBlob(value);
    } catch (err) { result = { ok: false, reason: err.message }; }
    const name = key.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (result.ok) {
      let pretty = result.plaintext;
      try { pretty = JSON.stringify(JSON.parse(pretty), null, 2); } catch { /* keep raw */ }
      writeFileSync(join(DECRYPTED_DIR, `${name}.json`), pretty);
      ok++;
      console.log(`  ✓ ${key}  mode=${result.mode}`);
    } else {
      fail++;
      console.log(`  ✗ ${key}  reason=${result.reason}`);
    }
  }
  console.log(`\n  decrypted ${ok}, failed ${fail} → ${DECRYPTED_DIR}`);
  if (fail) process.exitCode = 2;
}

// ── 命令：validate（2 次轻请求） ─────────────────────────────────────────────

async function cmdValidate() {
  const { creds } = loadDecrypted();
  const token = creds.token, userId = creds.userId;
  const exp = new Date(creds.expiredAt).getTime();
  console.log(`  token: ${mask(token)} expires ${creds.expiredAt} (${((exp - Date.now()) / 86400000).toFixed(1)} days)\n`);

  // 1) 新 OAuth 域 GetUserInfo（x-cloudide-token）
  const r1 = await http(OAUTH_HOST + OAUTH_USER_INFO_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cloudide-token': token, 'User-Agent': USER_AGENT },
    body: JSON.stringify({ ReqSource: 'IDE', IDEVersion: IDE_VERSION }),
  });
  const j1 = await r1.json().catch(() => null);
  const u = j1?.Result ?? j1?.result ?? {};
  console.log(`  [1/2] POST ${OAUTH_HOST}${OAUTH_USER_INFO_PATH}`);
  console.log(`        ${r1.ok ? '✓' : '✗'} HTTP ${r1.status} nickname=${u.ScreenName ?? '?'} uid=${u.UserID ?? '?'}`);

  // 2) 旧域 icube/user（x-icube-token）
  const r2 = await http(UG_HOST + '/icube/api/v1/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-icube-token': token },
    body: JSON.stringify({ mid: machineId(), did: machineId() || '0', uid: userId, productCode: 'TRAE', platform: process.platform, arch: process.arch }),
  });
  const j2 = await r2.json().catch(() => null);
  console.log(`  [2/2] POST ${UG_HOST}/icube/api/v1/user`);
  console.log(`        ${r2.ok && j2?.success ? '✓' : '✗'} HTTP ${r2.status} success=${j2?.success ?? '?'}`);
  console.log(`\n  http calls: ${httpCalls} | verdict: ${r1.ok && r2.ok && j2?.success ? 'LIVE' : 'CHECK ABOVE'}`);
  if (!(r1.ok && r2.ok && j2?.success)) process.exitCode = 1;
}

// ── 命令：checkin（默认 status 1 次；--claim 才领取） ────────────────────────

async function postUg(path, token) {
  const r = await http(UG_HOST + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Cloud-IDE-JWT ${token}`, 'x-device-id': loadDeviceKeyPair().did },
    body: JSON.stringify({}),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function cmdCheckin(claim) {
  const { creds } = loadDecrypted();
  const st = await postUg(CHECKIN_STATUS_PATH, creds.token);
  console.log(`  [status] HTTP ${st.status}: ${JSON.stringify(st.data)?.slice(0, 200)}`);
  if (!st.data?.enable) { console.log('  check-in not enabled for this account'); return; }
  if (st.data?.checked_in) { console.log('  ✓ already checked in today'); return; }
  if (!claim) {
    console.log(`  not checked in yet — re-run with --claim to claim (${httpCalls} http call used so far)`);
    return;
  }
  const cl = await postUg(CHECKIN_CLAIM_PATH, creds.token);
  console.log(`  [claim] HTTP ${cl.status}: code=${cl.data?.code} ${cl.data?.message ?? ''} credits=${cl.data?.data?.credits ?? '?'}`);
  const st2 = await postUg(CHECKIN_STATUS_PATH, creds.token);
  console.log(`  [verify] checked_in=${st2.data?.checked_in}`);
  if (!(cl.status === 200 && cl.data?.code === 0)) process.exitCode = 1;
}

// ── 命令：models（2 次轻请求） ───────────────────────────────────────────────

function buildHeaders(token, accept = 'application/json') {
  return {
    'Content-Type': 'application/json',
    Accept: accept,
    'User-Agent': USER_AGENT,
    Authorization: `Cloud-IDE-JWT ${token}`,
    'X-Cloudide-Token': token,
    'X-Ide-Token': token,
    'X-App-Id': APP_ID,
    'X-App-Version': 'default',
    'X-Ide-Version': IDE_VERSION,
    'X-Ide-Version-Code': IDE_VERSION_CODE,
    'X-App-Version-Code': IDE_VERSION_CODE,
    'X-Ide-Version-Type': 'stable',
    'X-Device-Type': 'PC',
    'X-OS-Version': 'Windows',
    'X-Device-Brand': 'PC',
    'Request-Traffic-Type': 'prod',
    'X-Machine-Id': machineId(),
    'X-Device-Id': loadDeviceKeyPair().did,
    'X-Uid': loadDecrypted().creds.userId,
  };
}

async function cmdModels() {
  const { creds } = loadDecrypted();
  const r1 = await http(`${AGENT_HOST}${REMOTE_MODELS_PATH}?functions=${REMOTE_FUNCTIONS}&show_custom_model=true`, {
    headers: { ...buildHeaders(creds.token), Origin: 'https://www.trae.cn', Referer: 'https://www.trae.cn/' },
  });
  const env1 = await r1.json().catch(() => null);
  const models = [];
  for (const g of env1?.data?.list ?? []) for (const m of g?.models ?? []) if (m?.name) models.push(m.name);
  console.log(`  [1/2] GET ${AGENT_HOST}${REMOTE_MODELS_PATH}`);
  console.log(`        ${r1.ok ? '✓' : '✗'} HTTP ${r1.status} — ${new Set(models).size} unique models`);
  console.log('        ' + [...new Set(models)].slice(0, 10).join(', ') + ' …');

  const body = {
    functions: ['ui_builder_v2', 'solo_coder', 'chat_v3', 'solo_builder', 'builder_v3', 'builder', 'chat', 'inline_chat',
      'git_ai', 'custom_agent_generation', 'utils', 'code_reviewer', 'code_review_summary', 'solo_agent', 'solo_agent_remote',
      'solo_work_remote', 'solo_agent_lite', 'solo_work_lite', 'solo_design_lite', 'solo_design_remote', 'multimodal', 'system_diagnosis'],
    agent_type: '', current_config_info: { config_name: '', is_custom_model: false },
    mode_type: 0, access_type: 0, ab_force_vids: '', ab_autotest_advanced_mode: 0, show_custom_model: true,
  };
  const r2 = await http(AGENT_HOST + MODELS_PATH, { method: 'POST', headers: buildHeaders(creds.token), body: JSON.stringify(body) });
  const env2 = await r2.json().catch(() => null);
  console.log(`  [2/2] POST ${AGENT_HOST}${MODELS_PATH}`);
  console.log(`        ${r2.ok ? '✓' : '✗'} HTTP ${r2.status} — ${Array.isArray(env2?.function_configs) ? env2.function_configs.length + ' function groups' : String(env2).slice(0, 120)}`);
  console.log(`\n  http calls: ${httpCalls}`);
  if (!(r1.ok && r2.ok)) process.exitCode = 1;
}

// ── 命令：refresh（双端点 + ECDSA 设备签名；--yes 确认） ─────────────────────

function signDeviceProof(method, path, clientId, refreshToken, privatePem) {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('hex');
  const canonical = [method, path, clientId, refreshToken, String(ts), nonce].join('\n');
  const signature = createSign('sha256').update(Buffer.from(canonical, 'utf-8')).sign(privatePem);
  return { Timestamp: ts, Nonce: nonce, Signature: signature.toString('base64') }; // PascalCase 必须
}

function buildDeviceInfo(publicPem) {
  return {
    DeviceID: loadDeviceKeyPair().did,
    MachineID: machineId(),
    PlatformCode: 'SOLO_PC',
    DeviceType: 'PC',
    DeviceName: process.env.USERNAME ?? 'user',
    DeviceModel: '',
    ClientVersion: APP_VERSION,
    DevicePublicKey: publicPem,
    DeviceBrand: '',
    DeviceCPU: '',
    OSInfo: 'Windows',
    OSVersion: process.platform === 'win32' ? require_os_release() : '10.0.26100',
  };
}

function require_os_release() {
  // 注册指纹钉住：Windows 功能更新改变 os.release() 会让官方客户端也无法刷新，
  // 优先使用 output/phase6/device-fingerprint.json 的注册值。
  const fp = resolve(process.cwd(), 'output', 'phase6', 'device-fingerprint.json');
  if (existsSync(fp)) {
    try { return JSON.parse(readFileSync(fp, 'utf-8')).OSVersion ?? ''; } catch { /* fall through */ }
  }
  return '';
}

async function cmdRefresh(yes) {
  if (!yes) {
    console.log('  refresh 轮换 access+refresh token，并回写 storage.json（需 Trae 已关闭）。');
    console.log('  当前 token 未到期时不必执行。确认请加 --yes。');
    return;
  }
  const { creds, path: credPath } = loadDecrypted();
  const { pair } = loadDeviceKeyPair();

  let result = null;
  for (let i = 0; i < EXCHANGE_ENDPOINTS.length; i++) {
    const url = EXCHANGE_ENDPOINTS[i];
    const path = new URL(url).pathname;
    const proof = signDeviceProof('POST', path, CLIENT_ID_SOLO, creds.refreshToken, pair.privateKeyPEM);
    const body = {
      ClientID: CLIENT_ID_SOLO,
      ClientSecret: '',
      RefreshToken: creds.refreshToken,
      DeviceInfo: buildDeviceInfo(pair.publicKeyPEM),
      DeviceProof: proof,
      IDEVersion: APP_VERSION,
    };
    console.log(`  trying endpoint ${i + 1}/${EXCHANGE_ENDPOINTS.length}: ${url}`);
    const r = await http(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cloudide-token': '' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.Result?.Token) {
      result = { ok: true, url, token: j.Result.Token, refreshToken: j.Result.RefreshToken, expiredAt: j.Result.TokenExpireAt, refreshExpiredAt: j.Result.RefreshExpireAt };
      break;
    }
    console.log(`    HTTP ${r.status} code=${j?.ResponseMetadata?.Error?.Code ?? '?'} ${j?.ResponseMetadata?.Error?.Message ?? ''}`);
    result = { ok: false, error: `HTTP ${r.status}` };
    if (r.status !== 404) break; // 端点存在但请求被拒：不换端点重试
  }
  if (!result?.ok) { console.log('  ✗ refresh failed'); process.exitCode = 1; return; }

  console.log(`  ✓ new token ${mask(result.token)} refresh ${mask(result.refreshToken)} expires ${new Date(result.expiredAt).toISOString()}`);
  // 回写解密仓 + storage.json（重加密，Trae 需已关闭）
  creds.token = result.token;
  if (result.refreshToken) creds.refreshToken = result.refreshToken;
  creds.expiredAt = new Date(result.expiredAt).toISOString();
  if (result.refreshExpiredAt) creds.refreshExpiredAt = new Date(result.refreshExpiredAt).toISOString();
  writeFileSync(credPath, JSON.stringify(creds, null, 2));

  const storageJson = findStorageJson();
  if (storageJson) {
    const store = JSON.parse(readFileSync(storageJson, 'utf-8'));
    if (typeof store[AUTH_KEY] === 'string') {
      store[AUTH_KEY] = await encryptBlob(JSON.stringify(creds));
      writeFileSync(storageJson, JSON.stringify(store, null, 4));
      console.log('  ✓ re-encrypted credentials written back to storage.json');
    }
  }
}

// ── 命令：login-url ──────────────────────────────────────────────────────────

function cmdLoginUrl() {
  const callback = `http://127.0.0.1:18080/authorize`;
  const mid = machineId(), did = loadDeviceKeyPair().did;
  const params = new URLSearchParams({
    login_version: '1', auth_from: 'solo', login_channel: 'native_ide',
    plugin_version: PLUGIN_VERSION, auth_type: 'local', client_id: WEB_CLIENT_ID,
    redirect: '0', login_trace_id: `${mid}${did}`.slice(-16),
    auth_callback_url: callback, machine_id: mid, device_id: did,
    x_device_id: did, x_machine_id: mid, x_device_brand: 'PC', x_device_type: 'PC',
    x_os_version: '1.0', x_env: '', x_app_version: IDE_VERSION, x_app_type: 'stable',
    hide_saas_login: 'true',
  });
  console.log(`${CONSOLE_HOST}/authorization?${params.toString()}`);
}

// ── 入口 ─────────────────────────────────────────────────────────────────────

const [, , cmd, ...rest] = process.argv;
const flags = new Set(rest);
try {
  switch (cmd) {
    case 'decrypt': await cmdDecrypt(); break;
    case 'validate': await cmdValidate(); break;
    case 'checkin': await cmdCheckin(flags.has('--claim')); break;
    case 'models': await cmdModels(); break;
    case 'refresh': await cmdRefresh(flags.has('--yes')); break;
    case 'login-url': cmdLoginUrl(); break;
    default:
      console.log(`Usage: node scripts/trae-cli.mjs <command> [options]

  decrypt            解密 storage.json 凭据（本地，无网络）
  validate           凭据活性验证（2 次轻请求）
  checkin [--claim]  签到状态查询（--claim 才领取）
  models             模型列表（2 次轻请求）
  refresh --yes      ExchangeToken 轮换 + 写回 storage.json（会轮换凭据）
  login-url          打印网页授权登录 URL（20 参数）`);
      if (cmd) process.exitCode = 1;
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
}

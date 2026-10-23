/**
 * traeUpstream — TRAE CN 模型请求与登录 URL（2026-10 更新，对齐 modelmux traecn 渠道实测）。
 *
 * 域名规划（与 2026-08 旧结论的关键差异见 docs/FLOW.md §七）：
 *   OAuth（ExchangeToken / GetUserInfo）: https://api.trae.com.cn + /cloudide/api/v3/trae/…
 *   agentHost（模型列表 / 对话）        : https://trae-api-cn.mchost.guru
 *   ugHost（签到）                      : https://api.trae.cn（不变）
 *   客户端解密凭据里的 .host            : https://api.trae.cn（IDE 下发的 API host）
 */

import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findStorageJson } from '../../src/utils/index.js';
import { loadCreds, AHA_DEVICE_ID, maskToken } from './traeClient.js';

// ── 域名与端点 ───────────────────────────────────────────────────────────────

/** OAuth host（ExchangeToken / GetUserInfo）。 */
export const OAUTH_HOST = 'https://api.trae.com.cn';

/** agentHost：对话 + 模型列表。 */
export const AGENT_HOST = 'https://trae-api-cn.mchost.guru';

/** OAuth 端点：POST {oauthHost}/cloudide/api/v3/trae/GetUserInfo（鉴权走 x-cloudide-token）。 */
export const OAUTH_USER_INFO_PATH = '/cloudide/api/v3/trae/GetUserInfo';

/** 对话端点（POST，solo/IDE 传输；响应是自定义 event 流，非标准 SSE）。 */
export const CHAT_PATH = '/api/agent/v3/llm_utils_chat';

/** 多通道模型目录（POST；22 个 functions 通道在 body 里）。 */
export const MODELS_PATH = '/api/ide/v1/batch_get_detail_param';

/** Remote 网页模型目录（GET，当前目录主源；新账号走 batch_get_detail_param 会 2001）。 */
export const REMOTE_MODELS_PATH = '/api/remote/v1/models';
export const REMOTE_FUNCTIONS = 'solo_agent_remote%2Csolo_work_remote%2Csolo_design_remote';

/** SOLO/IDE 对话用的 AppID（对话与 Solo 目录的 X-App-Id；…01c… 记录，旧 …01a… 已被上游撤下）。 */
export const APP_ID = '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8';

/** 模型准入版本：过低时 glm-5.3 等新模型报 4001。 */
export const IDE_VERSION = '0.1.52';
export const IDE_VERSION_CODE = '20260811';

/** 登录 URL 用的版本号（≠ ideVersion）。 */
export const PLUGIN_VERSION = '2.3.62834';
export const USER_AGENT = 'Trae/0.1.52';

/** 网页授权门户的 client_id（web 端身份；IDE 客户端 ID 会被门户 404）。 */
export const WEB_CLIENT_ID = 'ono9krqynydwx5';

/** 登录门户 host。 */
export const CONSOLE_HOST = 'https://www.trae.cn';

/** 模型列表请求的 22 个通道（逐字，顺序敏感项无；§5.1）。 */
export const MODEL_FUNCTIONS: readonly string[] = [
  'ui_builder_v2', 'solo_coder', 'chat_v3', 'solo_builder', 'builder_v3', 'builder',
  'chat', 'inline_chat', 'git_ai', 'custom_agent_generation', 'utils', 'code_reviewer',
  'code_review_summary', 'solo_agent', 'solo_agent_remote', 'solo_work_remote',
  'solo_agent_lite', 'solo_work_lite', 'solo_design_lite', 'solo_design_remote',
  'multimodal', 'system_diagnosis',
];

// ── 请求头 ───────────────────────────────────────────────────────────────────

/**
 * 构造 agentHost 请求头（鉴权 + 客户端伪装）。
 *
 * ⚠ 同一 token 要设三处（Authorization / X-Cloudide-Token / X-Ide-Token），
 * 缺任一个都可能被拒；版本头组是模型准入条件。
 */
export function buildHeaders(token: string, opts: { accept?: string } = {}): Record<string, string> {
  const machineId = machineIdFromStorage();
  return {
    'Content-Type': 'application/json',
    Accept: opts.accept ?? 'text/event-stream',
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
    'X-Machine-Id': machineId,
    'X-Device-Id': AHA_DEVICE_ID,
    'X-Uid': userIdFromCreds(),
  };
}

function machineIdFromStorage(): string {
  // telemetry.machineId 取自当前安装（Trae CN）的 storage.json
  try {
    const p = findStorageJson();
    if (p) {
      const s = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, string>;
      return s['telemetry.machineId'] ?? '';
    }
  } catch { /* 兜底为空 */ }
  return '';
}

function userIdFromCreds(): string {
  try { return loadCreds().userId; } catch { return ''; }
}

// ── GetUserInfo（token 活性验证，单次轻请求） ────────────────────────────────

export interface UserInfoResult {
  ok: boolean;
  http: number;
  nickname?: string;
  userId?: string;
  error?: string;
}

/** POST {oauthHost}/cloudide/api/v3/trae/GetUserInfo — 鉴权用 x-cloudide-token（用 Cloud-IDE-JWT 会 401）。 */
export async function getUserInfo(token: string): Promise<UserInfoResult> {
  let resp: Response;
  try {
    resp = await fetch(OAUTH_HOST + OAUTH_USER_INFO_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cloudide-token': token,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ ReqSource: 'IDE', IDEVersion: IDE_VERSION }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { ok: false, http: 0, error: 'network: ' + (err as Error).message };
  }
  const json = await resp.json().catch(() => null) as any;
  if (!resp.ok) {
    return { ok: false, http: resp.status, error: json?.ResponseMetadata?.Error?.Message ?? `HTTP ${resp.status}` };
  }
  const result = json?.Result ?? json?.result ?? {};
  return { ok: true, http: resp.status, nickname: result?.ScreenName, userId: result?.UserID };
}

// ── 模型列表（remote 目录主源 + 多通道目录） ─────────────────────────────────

/** GET {agentHost}/api/remote/v1/models?functions=…&show_custom_model=true */
export async function fetchRemoteModels(token: string, timeoutMs = 20000): Promise<{ ok: boolean; http: number; count?: number; models?: string[]; error?: string }> {
  const url = `${AGENT_HOST}${REMOTE_MODELS_PATH}?functions=${REMOTE_FUNCTIONS}&show_custom_model=true`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: { ...buildHeaders(token, { accept: 'application/json' }), Origin: 'https://www.trae.cn', Referer: 'https://www.trae.cn/' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, http: 0, error: 'network: ' + (err as Error).message };
  }
  const text = await resp.text();
  if (resp.status !== 200) {
    return { ok: false, http: resp.status, error: text.slice(0, 200) };
  }
  let env: any;
  try { env = JSON.parse(text); } catch (err) { return { ok: false, http: resp.status, error: 'non-JSON: ' + (err as Error).message }; }
  const list = env?.data?.list ?? [];
  const models: string[] = [];
  for (const group of list) for (const m of group?.models ?? []) if (m?.name) models.push(m.name);
  return { ok: true, http: resp.status, count: models.length, models: [...new Set(models)] };
}

/** POST {agentHost}/api/ide/v1/batch_get_detail_param（22 通道载荷）。 */
export async function fetchModelCatalog(token: string, timeoutMs = 20000): Promise<{ ok: boolean; http: number; groups?: number; error?: string }> {
  const body = {
    functions: [...MODEL_FUNCTIONS],
    agent_type: '',
    current_config_info: { config_name: '', is_custom_model: false },
    mode_type: 0,
    access_type: 0,
    ab_force_vids: '',
    ab_autotest_advanced_mode: 0,
    show_custom_model: true,
  };
  let resp: Response;
  try {
    resp = await fetch(AGENT_HOST + MODELS_PATH, {
      method: 'POST',
      headers: buildHeaders(token, { accept: 'application/json' }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, http: 0, error: 'network: ' + (err as Error).message };
  }
  const text = await resp.text();
  if (resp.status !== 200) return { ok: false, http: resp.status, error: text.slice(0, 200) };
  let env: any;
  try { env = JSON.parse(text); } catch (err) { return { ok: false, http: resp.status, error: 'non-JSON' }; }
  const groups = Array.isArray(env?.function_configs) ? env.function_configs.length : 0;
  return { ok: true, http: resp.status, groups };
}

// ── 登录 URL（网页授权门户，20 参数） ────────────────────────────────────────

/**
 * 构造网页授权登录 URL。
 *
 * ⚠ 参数名必须是 auth_callback_url（没有 callback_url/redirect_uri）；
 * ⚠ client_id 必须是网页端 ono9krqynydwx5（IDE ID 会被门户 404）；
 * ⚠ hide_saas_login=true 必带，否则门户 404。
 */
export function buildAuthorizeUrl(callbackUrl: string, machineId: string, deviceId: string): string {
  const params = new URLSearchParams({
    login_version: '1',
    auth_from: 'solo',
    login_channel: 'native_ide',
    plugin_version: PLUGIN_VERSION,
    auth_type: 'local',
    client_id: WEB_CLIENT_ID,
    redirect: '0',
    login_trace_id: `${machineId}${deviceId}`.slice(-16),
    auth_callback_url: callbackUrl,
    machine_id: machineId,
    device_id: deviceId,
    x_device_id: deviceId,
    x_machine_id: machineId,
    x_device_brand: 'PC',
    x_device_type: 'PC',
    x_os_version: '1.0',
    x_env: '',
    x_app_version: IDE_VERSION,
    x_app_type: 'stable',
    hide_saas_login: 'true',
  });
  return `${CONSOLE_HOST}/authorization?${params.toString()}`;
}

/**
 * 完整登录流程：本地回调 → 构造 URL → agent-browser 打开授权页 → 等回调取 token。
 *
 * 页面操作只负责"打开授权页"，账号输入/扫码由用户人工完成（避免自动化碰登录凭据）。
 * 回调直接回传 token（query 里的 refreshToken / userJwt.Token），不是 OAuth ?code=。
 */
export async function loginViaBrowser(opts: { timeoutMs?: number } = {}): Promise<{ ok: boolean; saved?: string; error?: string }> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const machineId = machineIdFromStorage();
  const deviceId = AHA_DEVICE_ID;
  const CALLBACK_PORT = 18080;
  const CALLBACK_PATH = '/authorize';

  const server: Server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset=utf-8><title>TRAE 授权</title><p>授权已完成，请回到终端（此页面可以关闭）。</p>');
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === CALLBACK_PATH) {
      const flat: Record<string, string> = {};
      url.searchParams.forEach((v, k) => { flat[k] = v; });
      (server as any).__callback = flat;
    }
  });

  await new Promise<void>((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(CALLBACK_PORT, '127.0.0.1', () => resolvePort());
  });

  const callbackUrl = `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`;
  const authUrl = buildAuthorizeUrl(callbackUrl, machineId, deviceId);
  console.log(chalk.white('  授权 URL: ' + authUrl));
  console.log(chalk.gray('  正在通过 agent-browser 打开授权页（在页面里完成登录/授权）…'));

  // 页面操作交给 agent-browser（打开 + 保持会话），授权动作人工完成
  const { spawn } = await import('node:child_process');
  const child = spawn('agent-browser', ['open', authUrl], { shell: true, stdio: 'ignore' });
  child.on('error', () => {
    console.log(chalk.yellow('  ⚠ agent-browser 不可用，请手动在浏览器打开上面的 URL'));
  });

  const flat = await new Promise<Record<string, string> | null>((resolveCb) => {
    const timer = setTimeout(() => resolveCb(null), timeoutMs);
    const poll = setInterval(() => {
      const cb = (server as any).__callback;
      if (cb) { clearTimeout(timer); clearInterval(poll); resolveCb(cb); }
    }, 300);
  });
  server.close();

  if (!flat) return { ok: false, error: '等待回调超时（' + timeoutMs / 1000 + 's），未收到授权结果' };

  // 回调解析（对齐 modelmux：token 直传，非 OAuth ?code=；兼容 userJwt 嵌套）
  const parseObj = (v: unknown): Record<string, unknown> => {
    try { const p = JSON.parse(String(v)); return p && typeof p === 'object' ? p as Record<string, unknown> : {}; } catch { return {}; }
  };
  const userInfo = parseObj(flat['userInfo'] ?? flat['user_info']);
  const userJwt = parseObj(flat['userJwt'] ?? flat['user_jwt']);
  const pick = (...vals: unknown[]): string => {
    for (const v of vals) if (typeof v === 'string' && v) return v;
    return '';
  };
  const accessToken = pick(userJwt['Token'], userJwt['token'], flat['token'], flat['accessToken'], flat['access_token']);
  const refreshToken = pick(flat['refreshToken'], flat['refresh_token'], userJwt['RefreshToken'], userJwt['refresh_token']);
  if (!accessToken && !refreshToken) {
    const pkce = pick(flat['code'], flat['authCode'], flat['authCodeInfo']);
    return { ok: false, error: pkce ? '上游改用 PKCE 流（回调只带 code），本实现不支持' : '回调中没有任何 token' };
  }
  const uid = pick(userInfo['UserID'], userInfo['userId'], flat['uid']);
  const out = {
    obtainedAt: new Date().toISOString(),
    accessToken,
    refreshToken,
    uid,
    nickname: pick(userInfo['ScreenName']),
    api_host: pick(flat['api_host'], flat['apiHost'], userInfo['ApiHost']),
  };
  const saved = resolve(process.cwd(), 'output', 'phase6', 'login-credentials.json');
  writeFileSync(saved, JSON.stringify(out, null, 2));
  console.log(chalk.green(`  ✓ 授权成功 uid=${out.uid || '?'} token=${maskToken(out.accessToken)}`));
  console.log(chalk.gray(`    saved: ${saved}`));
  return { ok: true, saved };
}

import { readFileSync } from 'node:fs';

// Load credentials
const creds = JSON.parse(readFileSync('output/phase6/decrypted/iCubeAuthInfo_icube_cloudide.json', 'utf-8'));
const storage = JSON.parse(readFileSync(process.env.APPDATA + '/TRAE SOLO CN/User/globalStorage/storage.json', 'utf-8'));

const TOKEN = creds.token;
const USERID = creds.userId;
const HOST = creds.host || 'https://api.trae.cn';
const DEVICE_ID = storage['telemetry.devDeviceId'] || 'unknown';
const MACHINE_ID = storage['telemetry.machineId'] || 'unknown';

// API categories by auth type
const icubeAPIs = [
  '/icube/api/v1/user',
  '/icube/api/v1/notifications/count',
  '/icube/api/v1/notifications/list',
  '/icube/api/v1/notifications/preferences',
  '/icube/api/v1/notifications/update_status',
  '/icube/api/v1/package/check_update',
  '/icube/api/v1/release/note',
  '/icube/api/v1/avatar/random',
  '/icube/api/v1/report/token',
  '/icube/api/v1/share/agent/create',
  '/icube/api/v1/share/agent/get',
  '/icube/api/v1/showcase/list',
  '/icube/api/v1/showcase/preview',
  '/icube/api/v1/showcase/scenes',
  '/icube/api/v1/templates/list',
  '/icube/api/v1/templates/detail',
  '/icube/api/v1/templates/favorite',
  '/icube/api/v1/templates/favorites',
  '/icube/api/v1/templates/scenes',
  '/icube/api/v1/material/get_url',
  '/icube/api/v1/material/getToken',
  '/icube/api/v1/mf/manifests',
  '/icube/api/v1/native/config/query',
];

const ugAPIs = [
  '/trae/api/v2/ug/checkin_credits/status',
  '/trae/api/v2/ug/checkin_credits/claim',
  '/trae/api/v2/ug/activity/info',
  '/trae/api/v2/ug/activity/action',
  '/trae/api/v2/ug/work_fission/grant',
  '/trae/api/v2/pay/grant_work_benefit',
  '/trae/api/v2/pay/ide_user_ent_usage',
  '/trae/api/v2/pay/ide_user_pay_status',
  '/trae/api/v2/pay/report_work_click',
  '/trae/api/v2/pay/switch_cn_billing_version',
  '/trae/api/v1/pay/claim_birthday_bonus',
  '/trae/api/v1/pay/create_order',
  '/trae/api/v1/pay/get_invite_code',
  '/trae/api/v1/pay/ide_user_ent_usage',
  '/trae/api/v1/pay/ide_user_pay_status',
  '/trae/api/v1/pay/redeem_invite_code',
  '/trae/api/v1/pay/unfollow_plan',
];

const cloudideAPIs = [
  '/cloudide/api/v3/trae/GetUserInfo',
  '/cloudide/api/v3/trae/CheckLogin',
  '/cloudide/api/v3/trae/CheckAddress',
  '/cloudide/api/v3/trae/CheckAddressWeb',
  '/cloudide/api/v3/trae/CheckPay',
  '/cloudide/api/v3/trae/GetUserEmailSuffix',
  '/cloudide/api/v3/trae/GetUserStasticData',
  '/cloudide/api/v3/trae/GetUserSupabaseOrg',
  '/cloudide/api/v3/trae/GetUserSupabaseToken',
  '/cloudide/api/v3/trae/GetUserVercelToken',
  '/cloudide/api/v3/trae/GetUserGitHubToken',
  '/cloudide/api/v3/trae/GetJSAPITicket',
  '/cloudide/api/v3/trae/GetThirdPartyToken',
  '/cloudide/api/v3/trae/DisconnectThirdPartyToken',
  '/cloudide/api/v3/trae/MarkUser',
  '/cloudide/api/v3/trae/SaveUserNickNameStatus',
  '/cloudide/api/v3/trae/RenewSession',
  '/cloudide/api/v3/trae/Logout',
  '/cloudide/api/v3/trae/Login',
  '/cloudide/api/v3/trae/risk_control/WaitList',
  '/cloudide/api/v3/trae/terms/get',
  '/cloudide/api/v3/trae/oauth/ClearRefreshToken',
  '/cloudide/api/v3/trae/oauth/ExchangeToken',
  '/cloudide/api/v3/trae/oauth/GetAuthorizedClient',
  '/cloudide/api/v3/trae/oauth/GetRefreshToken',
  '/cloudide/api/v3/common/GetUserAttribute',
  '/cloudide/api/v3/common/GetUserProfile',
  '/cloudide/api/v3/common/SaveUserAttribute',
  '/cloudide/api/v3/common/UpdateUserProfile',
  '/cloudide/api/v3/trae/github/CheckAuthorization',
  '/cloudide/api/v3/trae/github/GetAccessToken',
  '/cloudide/api/v3/trae/github/UpdateAccessToken',
  '/cloudide/api/v3/trae/SetThirdPartyToken',
  '/cloudide/api/v3/trae/SetUserSupabaseToken',
  '/cloudide/api/v3/trae/SetUserVercelToken',
  '/cloudide/api/v3/trae/Delete',
];

const oauthAPIs = [
  '/trae/api/v3/oauth/ExchangeToken',
  '/oauth/ExchangeToken',
];

const gtmAPIs = [
  '/trae/gtm/tob/api/v1/config/plan_attribute',
  '/trae/gtm/tob/api/v1/config/add_operation_log',
  '/trae/gtm/tob/api/v1/config/get_network_proxy',
  '/trae/gtm/tob/api/v1/package/check_update',
];

const connectorAPIs = [
  '/trae/api/v3/GetConnectorConnection',
  '/trae/api/v3/ListConnectorConnections',
  '/trae/api/v3/ListConnectorInterfaces',
  '/trae/api/v3/DisconnectConnector',
  '/trae/api/v3/ResolveConnectorToken',
  '/trae/api/v3/SetConnectorToken',
  '/trae/api/v3/GetFeishuPermissionTree',
  '/trae/api/v3/connector/auth/poll',
  '/trae/api/v3/connector/oauth/start',
];

interface APIResult {
  path: string;
  category: string;
  status: number;
  ok: boolean;
  code?: number | string;
  msg?: string;
  dataKeys?: string[];
  error?: string;
}

async function testAPI(path: string, category: string, headers: Record<string, string>, body: any = {}): Promise<APIResult> {
  const result: APIResult = { path, category, status: 0, ok: false };
  try {
    const url = `${HOST}${path}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    result.status = resp.status;
    const json: any = await resp.json().catch(() => null);
    if (json) {
      result.code = json.code ?? json.ResponseMetadata?.Error?.Code ?? undefined;
      result.msg = json.message ?? json.msg ?? json.ResponseMetadata?.Error?.Message ?? undefined;
      const data = json.data ?? json.Result ?? json;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        result.dataKeys = Object.keys(data).slice(0, 15);
      } else if (Array.isArray(data)) {
        result.dataKeys = [`(array, ${data.length} items)`];
      }
      result.ok = resp.ok && (json.code === 0 || json.code === 200 || json.success === true || json.Result);
    } else {
      result.ok = resp.ok;
    }
  } catch (e: any) {
    result.error = e.message?.slice(0, 100);
  }
  return result;
}

async function main() {
  const results: APIResult[] = [];
  const icubeHeaders = { 'x-icube-token': TOKEN };
  const ugHeaders = { 'Authorization': `Cloud-IDE-JWT ${TOKEN}`, 'x-device-id': DEVICE_ID };
  const cloudideHeaders = { 'x-cloudide-token': TOKEN };

  let i = 0;
  const total = icubeAPIs.length + ugAPIs.length + cloudideAPIs.length + gtmAPIs.length + connectorAPIs.length;

  console.log(`Testing ${total} APIs...\n`);

  // iCube APIs
  for (const path of icubeAPIs) {
    i++;
    const body = path === '/icube/api/v1/user' ? { uid: USERID } : {};
    const r = await testAPI(path, 'icube', icubeHeaders, body);
    results.push(r);
    console.log(`[${i}/${total}] ${path} -> ${r.status} ${r.ok ? 'OK' : 'FAIL'} ${r.code !== undefined ? 'code='+r.code : ''} ${r.dataKeys ? '['+r.dataKeys.join(',')+']' : ''}`);
  }

  // UG APIs
  for (const path of ugAPIs) {
    i++;
    const r = await testAPI(path, 'ug', ugHeaders, {});
    results.push(r);
    console.log(`[${i}/${total}] ${path} -> ${r.status} ${r.ok ? 'OK' : 'FAIL'} ${r.code !== undefined ? 'code='+r.code : ''} ${r.dataKeys ? '['+r.dataKeys.join(',')+']' : ''}`);
  }

  // Cloudide APIs
  for (const path of cloudideAPIs) {
    i++;
    const body: any = {};
    if (path.includes('GetUserInfo') || path.includes('CheckLogin')) body.uid = USERID;
    if (path.includes('CheckLogin')) { body.IDEVersion = '1.107.1'; body.ReqSource = 'Lite'; }
    const r = await testAPI(path, 'cloudide', cloudideHeaders, body);
    results.push(r);
    console.log(`[${i}/${total}] ${path} -> ${r.status} ${r.ok ? 'OK' : 'FAIL'} ${r.code !== undefined ? 'code='+r.code : ''} ${r.dataKeys ? '['+r.dataKeys.join(',')+']' : ''}`);
  }

  // GTM APIs
  for (const path of gtmAPIs) {
    i++;
    const r = await testAPI(path, 'gtm', ugHeaders, {});
    results.push(r);
    console.log(`[${i}/${total}] ${path} -> ${r.status} ${r.ok ? 'OK' : 'FAIL'} ${r.code !== undefined ? 'code='+r.code : ''} ${r.dataKeys ? '['+r.dataKeys.join(',')+']' : ''}`);
  }

  // Connector APIs
  for (const path of connectorAPIs) {
    i++;
    const r = await testAPI(path, 'connector', ugHeaders, {});
    results.push(r);
    console.log(`[${i}/${total}] ${path} -> ${r.status} ${r.ok ? 'OK' : 'FAIL'} ${r.code !== undefined ? 'code='+r.code : ''} ${r.dataKeys ? '['+r.dataKeys.join(',')+']' : ''}`);
  }

  // Summary
  console.log('\n\n========== SUMMARY ==========');
  const categories = ['icube', 'ug', 'cloudide', 'gtm', 'connector'];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const ok = catResults.filter(r => r.ok);
    const authed = catResults.filter(r => r.status === 200 && !r.ok);
    const forbidden = catResults.filter(r => r.status === 403 || r.status === 401);
    const notFound = catResults.filter(r => r.status === 404);
    const serverErr = catResults.filter(r => r.status >= 500);
    console.log(`\n[${cat}] ${catResults.length} APIs: ${ok.length} OK, ${authed.length} 200-but-fail, ${forbidden.length} 401/403, ${notFound.length} 404, ${serverErr.length} 5xx`);
    // Show working ones
    for (const r of ok) {
      console.log(`  ✓ ${r.path} -> code=${r.code} keys=[${r.dataKeys?.join(',')}]`);
    }
    for (const r of authed) {
      console.log(`  ~ ${r.path} -> code=${r.code} msg=${r.msg?.slice(0, 60)} keys=[${r.dataKeys?.join(',')}]`);
    }
  }

  // Save full results
  const { writeFileSync } = await import('node:fs');
  writeFileSync('output/phase6/api-scan-results.json', JSON.stringify(results, null, 2));
  console.log('\nFull results saved to output/phase6/api-scan-results.json');
}

main();

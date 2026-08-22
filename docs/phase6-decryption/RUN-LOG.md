# 阶段六：解密验证 — 运行记录

> 执行时间：2026-08-22 | 命令：`npm run phase6` → `npm run dev -- validate` / `checkin` / `refresh`

## 1. 解密（4/4 成功）

```
[Path A] TRAE SOLO CN auth storage (iCubeAuthInfo)

  ✓ iCubeAuthInfo://icube-dc:1448****8571       [AES]
      privateKeyPEM = -----BEGIN…(241 chars)
      publicKeyPEM  = -----BEGIN…(178 chars)
  ✓ iCubeAuthInfo://usertag                     [AES]
      8811****6659 = cn
      3788****3744 = cn
  ✓ iCubeAuthInfo://icube.cloudide              [AES]
      token            = eyJhbGciOi…(1004 chars, JWT RS256)
      refreshToken     = HRgBEn5XdG******************************************* (61 chars)
      expiredAt        = 2026-08-29T07:49:52.400Z
      refreshExpiredAt = 2027-02-11T07:49:52.400Z
      userId           = 3788****3744
      host             = https://api.trae.cn
      userRegion / account = {…}
  ✓ iCubeServerData://icube.cloudide            [PLAINTEXT]

Decrypted 4/4 entries via byteCrypto envelope.
```

SHA-512 完整性校验全部通过（明文前 64 字节 tag 与重算值一致）。

## 2. 功能验证（API 实测）

```
POST https://api.trae.cn/icube/api/v1/user
x-icube-token: eyJhbGciOiJSUzI1****************（1004 chars）
body.uid: 3788****503744

─── Response ───
  status: 200 OK

✅ VALIDATION PASSED — credential is LIVE.
```

服务器原始响应：

```json
{"data":{"loginAllowed":true},"success":true,"logId":"20260822104636****67C"}
```

## 3. 自动签到接口实测（`npm run dev -- checkin`）

逆向定位（main.js 商业化服务）：

| 接口 | 方法 | 说明 |
|---|---|---|
| `/trae/api/v2/ug/checkin_credits/status` | POST `{}` | 查询签到状态 |
| `/trae/api/v2/ug/checkin_credits/claim` | POST `{}` | 领取签到积分 |

认证头：`Authorization: Cloud-IDE-JWT <token>` + `x-device-id: 1448****8571`

实际运行输出（2026-08-22）：

```
▶ Daily Check-in

  token: eyJhbGciOiJSUz… expires 2026-08-29T07:49:52.400Z

  [1/3] checkin_credits/status
    http: 200
    data: {"checked_in":true,"code":0,"credits":200,"enable":true,"message":"success"}

  ✓ Already checked in today. Nothing to do.
```

**结论：签到 API 打通。当日已由客户端完成签到（+200 积分），流程正确识别并跳过重复领取。
claim 分支已实现，将在未签到日自动触发。**

刷新后复测（新 token）：同样返回 `checked_in:true, credits:200`，HTTP 200。

## 4. 续期链路逆向与实测（`npm run dev -- refresh`）

### 端点与请求格式

```
POST https://api.trae.cn/trae/api/v3/oauth/ExchangeToken
Content-Type: application/json
x-cloudide-token:            ← 必须为空字符串！

{
  "ClientID": "en1oxy7wnw8j9n",           // product.json authConfig.SOLO.stable
  "ClientSecret": "",
  "RefreshToken": "HRgBEn5XdG***********",
  "DeviceInfo": {
    "DeviceID": "1448****8571",           // ICDRS 数字设备ID（非UUID！）
    "MachineID": "5d673011******（已遮盖）",
    "PlatformCode": "SOLO_PC",
    "DeviceType": "PC",
    "DeviceName": "<用户名>",
    "DeviceModel": "<WMI型号>",
    "ClientVersion": "1.107.1",
    "DevicePublicKey": "-----BEGIN PUBLIC KEY----- *****",
    "DeviceBrand": "<厂商>", "DeviceCPU": "<CPU>",
    "OSInfo": "<Windows版本名>", "OSVersion": "<版本号>"
  },
  "DeviceProof": {
    "Signature": "<base64 ECDSA-P256-SHA256>",
    "Timestamp": <unix秒>,
    "Nonce": "<32位hex>"
  },
  "IDEVersion": "1.107.1"
}
```

签名原文（`\n` 连接，用设备私钥 ECDSA P-256 签名，DER 编码）：

```
POST
/trae/api/v3/oauth/ExchangeToken
<ClientID>
<RefreshToken>
<Timestamp>
<Nonce>
```

### 调试历程（错误码即线索，共三个独立坑）

| 尝试 | 错误码 | 结论 |
|---|---|---|
| DeviceID 用 SLARDAR UUID | `20403 Token device not match` | UUID 是渲染层 Tea SDK 自生成，非真实 did |
| 从 `[ICDRS]` 日志取数字 ID | `20405 Device proof required` | 设备匹配了，但 proof 未通过 |
| 分隔符改空格 / P1363 编码 | `20405` 不变 | 签名原文与编码无误 |
| 完全去掉 `x-cloudide-token` 头 | `20403` | 头必须存在 |
| **`x-cloudide-token: ""`（空值）** | HTTP 200 ✅（首次成功） | 带旧 token 会进错鉴权分支 |
| CLI 版本仍 20405，逐字段 diff | — | **DeviceProof 字段名大小写错误**：小写 `timestamp/nonce/signature` 被服务器当作无 proof；必须 PascalCase `Signature/Timestamp/Nonce` |
| 修复后 CLI 再跑仍 20405 | — | **DeviceInfo 指纹不匹配**：系统从 24H2(26100) 升级到 25H2(26200)，`os.release()` 变化导致与登录时注册的指纹不符 |

**三个必要条件（缺一即失败）：**
1. `x-cloudide-token: ""` —— 空字符串，不能带旧 token，也不能省略头
2. `DeviceProof` 字段名 PascalCase：`{Signature, Timestamp, Nonce}`
3. `DeviceInfo` 与登录时注册的指纹一致——尤其 `OSVersion`；
   Windows 功能更新会改变它 → **官方客户端此时同样无法刷新**（需重新登录重新注册）。
   本工具通过 `output/phase6/device-fingerprint.json` 钉住注册时的指纹解决。

### 成功响应（字段已脱敏）

```
✓ ExchangeToken succeeded
    new token       : eyJhbGciOiJSUz…(1004)
    new refreshToken: DqIH0e4JGV******************************************* (61)  ← 已轮换
    expires         : 2026-09-05T04:00:59.308Z   (+14 天)
    refreshExpires  : 2027-02-18T04:00:59.308Z   (+180 天)

  ✓ New credentials re-encrypted and written back to storage.json (app stays logged in).
  validating fresh token via /icube/api/v1/user …
  ✅ HTTP 200 success=true — fresh token LIVE.
```

Result 字段集：`BoundDeviceID, ClientID, DeviceBindStatus, RefreshExpireAt,
RefreshToken, Token, TokenExpireAt, TokenExpireDuration, UserJwt`

刷新后签到复测：HTTP 200，`{"checked_in":true,"code":0,"credits":200,...}`

### 写回与验证闭环

```
✓ re-encrypted credentials written back to storage.json
  envelope head: 746305100000 (expect 746305100000)
✓ validate /icube/api/v1/user: HTTP 200 success=true loginAllowed=true
```

新凭证经 byteCrypto 重新加密写回 `storage.json`（TRAE 已关闭时执行），
应用下次启动直接使用新 token，无需重新登录；新 token 实测通过用户接口校验。

> ⚠️ 注意：轮换会使旧 refreshToken 失效。若在 TRAE 运行期间执行 `refresh`，
> 应用退出时可能用内存中的旧凭证覆盖存储 → 请务必关闭 TRAE 后再运行。

证据文件：`output/phase6/validation.json`、`output/checkin-run.log`、
`output/exchange-result.json`、`output/phase6/decrypted/*.json`（敏感，已 gitignore）

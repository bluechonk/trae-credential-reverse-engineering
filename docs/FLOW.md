# TRAE SOLO CN 凭证逆向 — 全流程手册

> **状态：✅ 全流程打通（解密 ✅ / API 验证 ✅ / 自动签到 ✅ / 续期轮换 ✅）** | 日期：2026-08-22

本文档是项目完整流程的操作手册，包含六阶段逆向主线、两个功能接口（签到/续期）的逆向与实测记录、踩坑过程、安全结论及运行方式。算法细节请参阅 `FINDINGS.md`。

> 🔒 本文所有敏感值按 `docs/README.md` 脱敏规范处理。

---

## 一、项目总览

**目标**：TRAE SOLO CN v1.107.1（Electron / VS Code fork）桌面客户端凭证存储逆向。纯 Node.js/TypeScript 实现，18 个测试全绿。

### 1.1 目标信息

| 项目 | 值 |
|---|---|
| 应用 | TRAE SOLO CN v1.107.1（aka TraeWork CN） |
| 框架 | Electron (Chromium + Node.js)，VS Code fork |
| 安装 | `C:\Program Files\TRAE SOLO CN\` |
| 数据 | `%APPDATA%\TRAE SOLO CN\` |
| API host | `https://api.trae.cn`（product.json `bootConfig.ug.trae.normal`） |

### 1.2 目录结构

```
src/
├── index.ts                          ← CLI 入口（Commander，7 个命令）
├── phase1-reconnaissance/index.ts    ← 侦察：框架/版本/数据目录
├── phase2-data-collection/index.ts   ← 数据收集（交互式，已说明跳过原因）
├── phase3-format-analysis/index.ts    ← 熵值+魔数扫描
├── phase4-encryption-id/             ← 加密特征搜索（6011 个指标）
│   ├── index.ts
│   └── hook-crypto.js
├── phase5-key-extraction/            ← 硬编码表提取
│   ├── index.ts
│   └── hook-decrypt.js
├── phase6-decryption/
│   ├── byteCrypto.ts                 ← 核心：信封加解密 + 表提取
│   ├── decryptTraeAuth.ts            ← storage.json 批量解密
│   ├── traeClient.ts                 ← ExchangeToken 签名 + 签到客户端
│   ├── flows.ts                      ← checkin / refresh 编排
│   ├── validate.ts                   ← /icube/api/v1/user 验证
│   └── index.ts                      ← phase6 入口
└── utils/
    ├── entropy.ts                    ← 香农熵计算
    ├── magic.ts                      ← 魔数识别
    └── index.ts

docs/
├── README.md                         ← 脱敏规范 + 目录状态
├── FINDINGS.md                       ← 完整分析报告（算法+续期+签到）
├── FLOW.md                           ← 本文档（全流程手册）
└── phase1~6-*/RUN-LOG.md             ← 各阶段运行记录

output/                               ← 敏感输出（已 gitignore）
├── phase4/indicators.json            ← 6011 个加密特征指标
├── phase6/
│   ├── decrypted/*.json              ← 4 个解密凭证文件
│   ├── device-fingerprint.json       ← 注册指纹钉住
│   ├── exchange-result.json          ← 续期结果
│   ├── refresh.json / validation.json
│   └── ...
├── checkin-run.log / refresh-run-*.log
scripts/                              ← 逆向过程辅助脚本（12 个）
tests/entropy.test.ts|magic.test.ts    ← 18 个测试
```

### 1.3 凭证存储位置

| 文件 | 键 | 内容 |
|---|---|---|
| `User/globalStorage/storage.json` | `iCubeAuthInfo://icube.cloudide` | **核心凭证**：token(JWT)、refreshToken、过期时间、userId、API host、账号信息 |
| 同上 | `iCubeAuthInfo://icube-dc:<deviceId>` | 设备 EC P-256 密钥对 `{privateKeyPEM, publicKeyPEM}`，键名内嵌数字设备ID（如 `1448****8571`） |
| 同上 | `iCubeAuthInfo://usertag` | `{userId: "cn"}` 区域映射 |
| 同上 | `iCubeServerData://icube.cloudide` | 明文 JSON：权益/商业化数据 |
| `Local Storage/leveldb/` | `SLARDARsolo_pc` | base64+URL编码 JSON（渲染层 Tea SDK 自生成 web_id，**非**真实设备ID） |
| `Local Storage/config.db` | 动态配置缓存 | AES-256-CBC，key=`md5("TRAE SOLO CN")` hex 作 32B key，前16字节为 IV |

---

## 二、六阶段逆向主线

### Phase 1 — 侦察（Reconnaissance）

**目标**：定位目标应用、框架类型、版本、数据目录。

**运行**：`npm run phase1`

**关键发现**：
- 确认目标为 TRAE SOLO CN v1.107.1，Electron + VS Code fork
- 安装路径：`C:\Program Files\TRAE SOLO CN\`
- 数据路径：`%APPDATA%\TRAE SOLO CN\`
- 应用为**解包目录**（无 app.asar），源码在 `resources\app\out\main.js`

**输出**：`docs/phase1-reconnaissance/RUN-LOG.md`

---

### Phase 2 — 数据收集（Data Collection）

**目标**：定位登录态数据存储位置。

**运行**：`npm run phase2`

**执行说明**：原设计为登录前后两次扫描对比（diff），因目标机器已处于登录状态（无法回退到未登录快照），采用替代方案：
1. 直接对现有数据目录做全量清单收集（由阶段三直扫路径完成）
2. 对已知高价值文件做定向读取与解密尝试（阶段六闭环验证）

**关键发现**：
- 凭证全部集中在 `storage.json` 的 `iCubeAuthInfo://` 命名空间下
- 设备密钥键名 **内嵌 deviceId**：`icube-dc:1448****8571`
- 未发现 DPAPI / safeStorage 特征

**输出**：`docs/phase2-data-collection/RUN-LOG.md`

---

### Phase 3 — 格式分析（Format Analysis）

**目标**：通过熵值和魔数判断加密方式。

**运行**：`npm run phase3`

**关键发现**：

| 文件 | 大小 | 魔数 | 熵 | 推断 |
|---|---|---|---|---|
| `storage.json` | 11.1KB | ? | 5.73 | base64 信封（上限≈6.0） |
| `iCubeAuthInfo://icube.cloudide` 值 | 2484 | — | 5.99 | base64 编码的加密信封 |
| `iCubeServerData://icube.cloudide` 值 | 4139 | — | 4.87 | **明文 JSON**（后续确认为 PLAINTEXT 模式） |
| `state.vscdb` | 932KB | SQLITE | 5.07 | VS Code 标准状态库 |
| `leveldb/000184.ldb` | 1258KB | ? | 7.04 | 混合内容（压缩块+明文 KV） |

**结论**：加密值的熵分布直接提示了「自定义信封 + base64」而非 DPAPI 裸 blob（DPAPI 头 `01 00 00 00 D0 8C 9D DF` 的 base64 应以 `AQAAAADYjQ…` 开头，实际以 `dGMFEAAA` 开头 → 自定义魔数 `"tc"`）。

**输出**：`docs/phase3-format-analysis/RUN-LOG.md`

---

### Phase 4 — 加密识别（Encryption Identification）

**目标**：静态搜索加密特征，定位加密模块。

**运行**：`npm run phase4`

**关键发现**：
- 搜索 6011 个加密特征指标（PBKDF2/HKDF/bcrypt/AES-CBC…）
- 定位到 `out/main.js` 中的 byteCrypto 模块
- 确认自定义信封算法（非系统 DPAPI）

**输出**：`docs/phase4-encryption-id/RUN-LOG.md`、`output/phase4/indicators.json`

---

### Phase 5 — 密钥提取（Key Extraction）

**目标**：提取加密所需的密钥材料。

**运行**：`npm run phase5`

**关键发现**：

| 材料 | 来源 | 用途 | 记录 |
|---|---|---|---|
| 4 张 64 字节硬编码表（Hie/Wie/Vie/Qie） | `out/main.js` 锚点 `,Em=async t=>` 前 ~3KB | 密钥派生 pepper | 运行时正则提取，不手工转录 |
| 设备 EC P-256 密钥对 | `iCubeAuthInfo://icube-dc:1448****8571` | ExchangeToken 的 DeviceProof 签名 | 私钥 `-----BEGIN PRIVATE KEY----- *****（已遮盖）`；公钥指纹 `7acffc8272719c0a` |
| ClientID（SOLO/stable） | product.json `authConfig.SOLO.stable` | OAuth ClientID | `en1oxy7wnw8j9n`（客户端内置公开值） |
| 动态配置缓存密钥 | `md5("TRAE SOLO CN")` hex 作 32B key | 解密 `Local Storage\config.db` | 派生值，非存储密钥 |

**表指纹（值已脱敏：仅长度+首6字节+SHA-256前16位）**：

```
Hie: len=64  head=[bf c0 d8 fa 7a f6 …]  sha256=9207df805b7784f5…
Wie: len=64  head=[f6 cc 1a e8 e8 46 …]  sha256=823fa965f1cb5d87…
Vie: len=64  head=[52 09 6a d5 30 36 …]  sha256=a11e80f923aebb37…
Qie: len=64  head=[1f dd a8 33 88 07 …]  sha256=969973bbc3e82d7d…

pepper(AES)  = Vie ^ Qie : len=64  head=[4d d4 c2 e6 b8 31 …]  sha256=ebc17f362f05265d…
pepper(PRIV) = Hie ^ Wie : len=64  head=[49 0c c2 12 92 b0 …]  sha256=1cc81612a12f1f64…
```

**输出**：`docs/phase5-key-extraction/RUN-LOG.md`

---

### Phase 6 — 解密验证（Decryption & Validation）

**目标**：解密凭证并验证有效性。

**运行**：`npm run phase6`

**解密结果（4/4 成功）**：

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
  ✓ iCubeServerData://icube.cloudide            [PLAINTEXT]

Decrypted 4/4 entries via byteCrypto envelope.
```

SHA-512 完整性校验全部通过（明文前 64 字节 tag 与重算值一致）。

**功能验证**：

```
POST https://api.trae.cn/icube/api/v1/user
x-icube-token: eyJhbGciOiJSUzI1****************（1004 chars）
body.uid: 3788****3744

─── Response ───
  status: 200 OK
  {"data":{"loginAllowed":true},"success":true}
```

**输出**：`docs/phase6-decryption/RUN-LOG.md`、`output/phase6/decrypted/*.json`

---

## 三、自动签到接口

### 3.1 接口定位

逆向定位到 `out/main.js` 商业化服务（ugApi host），通过 i18n 键 `commercial_banner.credits.daily_checkin.*` 和遥测事件 `checkin_status`/`checkin_claim` 确认功能存在。

### 3.2 接口详情

| 接口 | 方法 | Body | 说明 |
|---|---|---|---|
| `/trae/api/v2/ug/checkin_credits/status` | POST | `{}` | 查询签到状态 |
| `/trae/api/v2/ug/checkin_credits/claim` | POST | `{}` | 领取签到积分 |

**认证**：`Authorization: Cloud-IDE-JWT <token>` + `x-device-id: <did>` + `Content-Type: application/json`

**响应示例**：
```json
{"checked_in":true,"code":0,"credits":200,"enable":true,"message":"success"}
```

**成功判定**：`code === 0`

### 3.3 客户端侧门槛

仅 UI 层限制：`providerCode === CN && account.scope === marscode` 才显示入口；服务端按 token 鉴权，无额外限制。

### 3.4 实测记录

**运行**：`npm run dev -- checkin`

```
▶ Daily Check-in

  token: eyJhbGciOiJSUz… expires 2026-08-29T07:49:52.400Z

  [1/3] checkin_credits/status
    http: 200
    data: {"checked_in":true,"code":0,"credits":200,"enable":true,"message":"success"}

  ✓ Already checked in today. Nothing to do.
```

**结论**：签到 API 打通。当日已由客户端完成签到（+200 积分），流程正确识别并跳过重复领取。claim 分支已实现，将在未签到日自动触发。

刷新后复测（新 token）：同样返回 `checked_in:true, credits:200`，HTTP 200。

**输出**：`output/checkin-run.log`、`output/checkin-run2.log`

---

## 四、续期链路（refreshToken → 新 token）

### 4.1 端点与请求格式

```
POST https://api.trae.cn/trae/api/v3/oauth/ExchangeToken
Content-Type: application/json
x-cloudide-token:            ← 必须为空字符串！

{
  "ClientID": "en1oxy7wnw8j9n",
  "ClientSecret": "",
  "RefreshToken": "HRgBEn5XdG***********",
  "DeviceInfo": {
    "DeviceID": "1448****8571",
    "MachineID": "5d673011**********",
    "PlatformCode": "SOLO_PC",
    "DeviceType": "PC",
    "DeviceName": "<用户名>",
    "DeviceModel": "",
    "ClientVersion": "1.107.1",
    "DevicePublicKey": "-----BEGIN PUBLIC KEY----- *****",
    "DeviceBrand": "", "DeviceCPU": "",
    "OSInfo": "Windows", "OSVersion": "10.0.26100"
  },
  "DeviceProof": {
    "Signature": "<base64 ECDSA-P256-SHA256>",
    "Timestamp": "<unix秒>",
    "Nonce": "<32位hex>"
  },
  "IDEVersion": "1.107.1"
}
```

### 4.2 签名算法

**算法**：ECDSA P-256 / SHA-256 / DER 编码 / base64 输出

**私钥**：存储的设备私钥（`iCubeAuthInfo://icube-dc:<did>` 中的 `privateKeyPEM`）

**签名原文**（`\n` 连接）：

```
POST
/trae/api/v3/oauth/ExchangeToken
<ClientID>
<RefreshToken>
<unix秒时间戳>
<32位hex随机数>
```

### 4.3 设备绑定模型（从错误码逆向确认）

| 错误码 | 含义 | 触发条件（实测） |
|---|---|---|
| `20403 Token device not match` | 设备指纹不匹配 | DeviceID 错误（误用 SLARDAR UUID）；或完全不带 `x-cloudide-token` 头 |
| `20405 Device proof required` | 设备证明缺失/未通过 | ① 带非空 `x-cloudide-token`；② DeviceProof 字段名小写；③ DeviceInfo 与注册指纹不符 |

### 4.4 三大坑（逐个踩出来的）

| # | 坑 | 错误码 | 解法 |
|---|---|---|---|
| ① | `x-cloudide-token` 头 | 带旧 token → 20405；不带 → 20403 | 必须**空字符串** |
| ② | DeviceProof 字段名大小写 | 小写 `timestamp/signature` → 20405 | 必须 PascalCase `{Signature, Timestamp, Nonce}` |
| ③ | DeviceInfo 指纹绑定 | 系统升级 26100→26200 后不符 → 20405 | `device-fingerprint.json` 钉住注册时指纹 |

### 4.5 关键发现

**真实设备ID**：数字型 `1448****8571`（来自 `[ICDRS]` 日志），不是 SLARDAR 里的 UUID。SLARDAR leveldb 里的 UUID 是渲染层 Tea SDK 自生成的 web_id，与鉴权无关。

**DeviceInfo 指纹**：服务器校验 DeviceInfo 与登录时注册的指纹。Windows 功能更新（24H2 26100 → 25H2 26200）改变 `os.release()` 后，**官方客户端自身也无法刷新**（直到重新登录重新注册）。本项目通过 `output/phase6/device-fingerprint.json` 钉住注册时指纹解决。

**JWT 内嵌 refreshToken 指纹**：JWT payload 的 `source_id` 字段 = `base64(refreshToken) + "." + hex(8字节)`，说明 refreshToken 与 access token 有绑定关系。

### 4.6 响应字段

```json
{ "Result": {
    "Token": "eyJhbGciOi…(1004)",           // 新 access token，+14 天
    "RefreshToken": "DqIH0e4JGV***********", // 轮换后的新 refreshToken，+180 天
    "TokenExpireAt": 1788580859308, "TokenExpireDuration": …,
    "RefreshExpireAt": 1802923259308,
    "BoundDeviceID": "1448****8571",        // 绑定的设备ID
    "DeviceBindStatus": …,                  // 设备绑定状态
    "UserJwt": …,                           // 用户JWT
    "ClientID": "en1oxy7wnw8j9n" }, "ResponseMetadata": … }
```

### 4.7 实测闭环（2026-08-22，正式 CLI 命令）

**运行**：`npm run dev -- refresh`

```
▶ Token Refresh (ExchangeToken)

  old token      : eyJhbGciOiJSUz… (expires 2026-09-05T04:00:29.190Z)
  old refreshToken: BFORC-WKHh… (expires 2027-02-18T04:00:29.190Z)

  ✓ ExchangeToken succeeded
    new token       : eyJhbGciOiJSUz…(1004)
    new refreshToken: DqIH0e4JGV******************************************* (61)
    expires         : 2026-09-05T04:00:59.308Z
    refreshExpires  : 2027-02-18T04:00:59.308Z

  ✓ New credentials re-encrypted and written back to storage.json (app stays logged in).

  validating fresh token via /icube/api/v1/user …
  ✅ HTTP 200 success=true — fresh token LIVE.
```

**完整闭环**：
1. ExchangeToken 成功 → 新 Token(1004) + 新 refreshToken(61, 已轮换)
2. byteCrypto 重加密写回 storage.json（信封头 `746305100000` 校验一致）
3. `/icube/api/v1/user` 验证 HTTP 200 `loginAllowed=true`
4. 签到接口复测 HTTP 200

> ⚠️ 轮换会使旧 refreshToken 失效：请在 **TRAE 关闭**时执行 `npm run dev -- refresh`，否则应用退出时可能用内存旧凭证覆盖存储。

**输出**：`output/refresh-run-final.log`、`output/exchange-result.json`、`output/phase6/device-fingerprint.json`

---

## 五、安全结论

1. **凭证保护强度 ≈ 无**——不依赖 DPAPI/Keychain，pepper 表硬编码在 bundle 里，任何拿到 storage.json + main.js 的人都能离线解密凭证。
2. **服务端已有设备绑定**（DeviceProof ECDSA P-256），但设备私钥与凭证同库存放且同等强度保护 → 绑定形同虚设；建议私钥入 OS 凭证库（TPM/Secure Enclave）。
3. **refreshToken 长效 ~180 天**，泄露后影响窗口大。
4. **`x-cloudide-token` 空/非空走不同鉴权分支**，易引发兼容性 bug，建议显式区分端点或头。
5. **Windows 功能更新会破坏续期**（OS 版本号变化导致指纹不符），官方客户端同样受影响，需重新登录。

---

## 六、运行方式

```bash
# 逆向流程
npm run phase1          # 侦察：框架/版本/数据目录探测
npm run phase2          # 数据收集：登录前后 diff（交互式）
npm run phase3          # 格式分析：熵值+魔数扫描
npm run phase4          # 加密识别：6011 个特征
npm run phase5          # 密钥提取：硬编码模式搜索
npm run phase6          # 解密验证：byteCrypto 信封解密

# 功能命令
npm run dev -- validate # 验证凭证有效性
npm run dev -- checkin  # 签到：status → claim(未签到时) → 复核
npm run dev -- refresh  # 续期：ExchangeToken → 写回 → 验证

# 测试
npx vitest run          # 18/18 通过
```

---

## 七、文档与输出索引

| 文件 | 说明 |
|---|---|
| `docs/README.md` | 脱敏规范 + 目录状态 |
| `docs/FINDINGS.md` | 完整分析报告（算法细节） |
| `docs/FLOW.md` | 本文档（全流程手册） |
| `docs/phase1~6-*/RUN-LOG.md` | 各阶段运行记录 |
| `output/phase4/indicators.json` | 6011 个加密特征指标 |
| `output/phase6/decrypted/*.json` | 4 个解密凭证文件（敏感，gitignore） |
| `output/phase6/device-fingerprint.json` | 注册指纹钉住 |
| `output/checkin-run*.log` | 签到运行日志 |
| `output/refresh-run*.log` | 续期运行日志 |
| `scripts/*.ts` | 逆向过程辅助脚本（12 个） |

---

## 八、测试覆盖

```
✓ tests/magic.test.ts (8 tests)    ← 魔数识别
✓ tests/entropy.test.ts (10 tests) ← 熵值计算

Test Files  2 passed (2)
     Tests  18 passed (18)
```

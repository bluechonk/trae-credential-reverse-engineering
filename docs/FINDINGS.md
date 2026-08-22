# TRAE SOLO CN 凭证逆向 — 完整分析报告

> **状态：✅ 全流程打通（解密 ✅ / API 验证 ✅ / 自动签到 ✅ / 续期轮换 ✅）** | 日期：2026-08-22

## 目标信息

| 项目 | 值 |
|---|---|
| 应用 | TRAE SOLO CN v1.107.1（aka TraeWork CN） |
| 框架 | Electron (Chromium + Node.js)，VS Code fork |
| 安装 | `C:\Program Files\TRAE SOLO CN\` |
| 数据 | `%APPDATA%\TRAE SOLO CN\` |

> 🔒 本报告所有敏感值按 `docs/README.md` 脱敏规范处理。

---

## 一、凭证存储位置

| 文件 | 键 | 内容 |
|---|---|---|
| `User/globalStorage/storage.json` | `iCubeAuthInfo://icube.cloudide` | **核心凭证**：token(JWT)、refreshToken、过期时间、userId、API host、账号信息 |
| 同上 | `iCubeAuthInfo://icube-dc:<deviceId>` | 设备 EC P-256 密钥对 `{privateKeyPEM, publicKeyPEM}`，键名内嵌数字设备ID（如 `1448****8571`） |
| 同上 | `iCubeAuthInfo://usertag` | `{userId: "cn"}` 区域映射 |
| 同上 | `iCubeServerData://icube.cloudide` | 明文 JSON：权益/商业化数据 |
| `Local Storage/leveldb/` | `SLARDARsolo_pc` | base64+URL编码 JSON（渲染层 Tea SDK 自生成 web_id，**非**真实设备ID） |
| `Local Storage/config.db` | 动态配置缓存 | AES-256-CBC，key=`md5("TRAE SOLO CN")` hex 作 32B key，前16字节为 IV |

---

## 二、加密算法完整还原（byteCrypto.js）

**位置**：`out/main.js` → 模块 `out-build/vs/base/common/byteCrypto.js`

### 2.1 信封格式（AES 模式，version tc）

```
偏移    长度   内容
0       6     header = 74 63 05 10 00 00 ("tc" + ver5 + 0x10 + 00 00)
6       32    random（crypto.getRandomValues）
38      n*16  AES-128-CBC 密文 = AES(key, iv, SHA512(plaintext) || plaintext)
整体以 base64 存储
```

另有 `AES_PRIVATE` 模式（header `[18,57,18,32,2,3]`），pepper 不同。

### 2.2 密钥派生（Rie）

```
pepper = tableVie[i] XOR tableQie[i]        // 64 字节，两张硬编码表逐字节异或
n      = SHA512(random) || pepper           // 64 + 64 = 128 字节
d      = SHA512(n)
mat    = d || pepper                        // 128 字节
key    = mat[0:16]                          // AES-128
iv     = mat[16:32]
```

`AES_PRIVATE` 的 pepper 改为 `Hie ^ Wie`。

### 2.3 完整性校验

明文前附加 64 字节 `SHA512(plaintext)` 作为 tag；解密后重算比对（`rh=64`）。

### 2.4 关键结论

1. **不依赖 Windows DPAPI**——尽管外层走 VS Code EncryptionMainService/safeStorage 代码路径存在，实际 iCubeAuthInfo 用的是这套自定义信封。
2. **无用户口令参与**——唯一秘密是 bundle 内两张 64 字节硬编码表；密钥材料全部可从密文自带的 random 推导。
3. 因此**任何拿到 storage.json + main.js（即安装目录）的人都能离线解密凭证**。加密仅起混淆作用，不提供跨机器防护。

### 2.5 硬编码表提取方式

四张表位于 `out/main.js` 中 `,Em=async t=>` 锚点前 ~3KB 处：
`Hie=new Uint8Array([...])`, `Wie=new Uint8Array([...])`, `Vie=Uint8Array.from([...])`, `Qie=Uint8Array.from([...])`

本项目实现（`src/phase6-decryption/byteCrypto.ts`）在**运行时直接从安装的 main.js 提取**，避免手工转录错误，且随版本自动适配。

---

## 三、解密结果（本机验证）

运行 `npm run phase6` → **4/4 全部解密成功**：

| 键 | 结果 |
|---|---|
| `iCubeAuthInfo://icube.cloudide` | ✅ JWT token (1004 字符)、refreshToken、userId、host、account 完整还原 |
| `iCubeAuthInfo://icube-dc:<uid>` | ✅ PEM 设备密钥对 |
| `iCubeAuthInfo://usertag` | ✅ 区域映射 |
| `iCubeServerData://icube.cloudide` | ✅ 明文 JSON（权益数据） |

输出（含敏感信息，已 gitignore）：`output/phase6/decrypted/*.json`

### 3.1 功能验证（API 实测）✅

复刻客户端调用（ICubeProductService.registerUser 逻辑）：

```
POST https://api.trae.cn/icube/api/v1/user
headers: { Content-Type: application/json, x-icube-token: <解密出的JWT> }
body:    { mid, did, uid, userRegion, organization, scope, tenant, productCode… }
```

服务器响应：

```json
{"data":{"loginAllowed":true},"success":true,"logId":"2026082210…"}
```

**HTTP 200 + `loginAllowed:true` → 凭证真实有效，服务端接受并允许登录。**
证据文件：`output/phase6/validation.json`

运行方式：`npm run dev -- validate`


---

## 四、续期链路（refreshToken → 新 token）✅ 已实测

**端点**：`POST https://api.trae.cn/trae/api/v3/oauth/ExchangeToken`（ugApi host）

### 4.1 请求

| 项 | 值 |
|---|---|
| Content-Type | `application/json` |
| x-cloudide-token | **空字符串**（坑①：带旧 token 或省略头都会失败，见 4.3） |
| ClientID | `en1oxy7wnw8j9n`（product.json `authConfig.SOLO.stable`） |
| RefreshToken | 当前 refreshToken |
| DeviceInfo | DeviceID(数字ID) / MachineID / PlatformCode=`SOLO_PC` / DeviceType=PC / DeviceName / DeviceModel / ClientVersion / **DevicePublicKey** / DeviceBrand / DeviceCPU / OSInfo / OSVersion |
| DeviceProof | `{Signature, Timestamp, Nonce}` —— **坑②：字段名必须 PascalCase**，小写会被服务器当作无 proof（20405） |
| IDEVersion | `1.107.1` |

**DeviceProof 签名**（ECDSA P-256 / SHA-256 / DER / base64，私钥=存储的设备私钥）：

```
canonical = "POST\n/trae/api/v3/oauth/ExchangeToken\n<ClientID>\n<RefreshToken>\n<unix秒>\n<32位hex随机数>"
```

### 4.2 响应

```json
{ "Result": {
    "Token": "eyJhbGciOi…(1004)",           // 新 access token，+14 天
    "RefreshToken": "DqIH0e4JGV***********", // 轮换后的新 refreshToken，+180 天
    "TokenExpireAt": 1788580859308, "TokenExpireDuration": …,
    "RefreshExpireAt": 1802923259308,
    "BoundDeviceID": "1448****8571", "DeviceBindStatus": …, "UserJwt": …,
    "ClientID": "en1oxy7wnw8j9n" }, "ResponseMetadata": … }
```

### 4.3 设备绑定模型与三大失败模式（实测确认）

| 错误码 | 含义 | 触发条件（实测） |
|---|---|---|
| `20403 Token device not match` | 设备指纹不匹配 | DeviceID 错误（误用 SLARDAR UUID）；或完全不带 `x-cloudide-token` 头 |
| `20405 Device proof required` | 设备证明缺失/未通过 | ① 带非空 `x-cloudide-token`；② DeviceProof 字段名小写；③ DeviceInfo 与注册指纹不符 |

**坑③详解（DeviceInfo 指纹）**：服务器校验 DeviceInfo 与登录时注册的指纹。
Windows 功能更新（24H2 26100 → 25H2 26200）改变 `os.release()` 后，
**官方客户端自身也无法刷新**（直到重新登录重新注册）。本项目通过
`output/phase6/device-fingerprint.json` 钉住注册时指纹（`OSInfo:"Windows"`, `OSVersion:"10.0.26100"`）解决。

真实设备ID 来源：ICDRS 服务（aha 原生 SDK），日志特征 `[ICDRS] (init) did: 1448****8571`；
同时内嵌在设备密钥键名 `icube-dc:<did>` 中。SLARDAR leveldb 里的 UUID 是渲染层 Tea SDK 自生成 web_id，与鉴权无关。

### 4.4 实测闭环（2026-08-22，正式 CLI 命令）

```
▶ Token Refresh (ExchangeToken)
  ✓ ExchangeToken succeeded        ← 新 Token(1004) + 新 refreshToken(61, 已轮换)
  ✓ New credentials re-encrypted and written back to storage.json
  validating fresh token via /icube/api/v1/user …
  ✅ HTTP 200 success=true — fresh token LIVE.
```

byteCrypto 信封头校验 `746305100000` 一致；刷新后签到接口复测 HTTP 200。

> ⚠️ 轮换会使旧 refreshToken 失效：请在 **TRAE 关闭**时执行 `npm run dev -- refresh`，
> 否则应用退出时可能用内存旧凭证覆盖存储。

---

## 五、自动签到接口 ✅ 已实测

| 接口 | 方法 | Body | 说明 |
|---|---|---|---|
| `/trae/api/v2/ug/checkin_credits/status` | POST | `{}` | `{"enable":true,"checked_in":true,"credits":200,"code":0}` |
| `/trae/api/v2/ug/checkin_credits/claim` | POST | `{}` | 成功判定 `code===0` |

认证：`Authorization: Cloud-IDE-JWT <token>` + `x-device-id: <did>` + `Content-Type: application/json`

客户端侧门槛（仅 UI 层）：providerCode=CN 且 account.scope=marscode 才显示入口；服务端按 token 鉴权。

---

## 六、工具链（纯 Node.js 实现）

```
npm run phase1            # 侦察：框架/版本/数据目录探测
npm run phase2            # 数据收集：登录前后 diff（交互式）
npm run phase3            # 格式分析：熵值+魔数扫描
npm run phase4            # 加密识别：6011 个特征（PBKDF2/HKDF/bcrypt/AES-CBC…）
npm run phase5            # 密钥提取：硬编码模式搜索
npm run phase6            # 解密验证：byteCrypto 信封解密 ← 最终突破点
npm run dev -- validate   # 解密凭证 API 实测
npm run dev -- checkin    # 签到：status → claim(未签到时) → 复核
npm run dev -- refresh    # 续期：ExchangeToken → 写回 storage.json → 验证
```

关键文件：
- `src/phase6-decryption/byteCrypto.ts` — 算法复刻（表提取/派生/解密/**加密**/校验）
- `src/phase6-decryption/decryptTraeAuth.ts` — storage.json 批量解密入口
- `src/phase6-decryption/traeClient.ts` — ExchangeToken 签名/请求 + 签到 API 客户端
- `src/phase6-decryption/flows.ts` — checkin / refresh 编排（含写回）

## 七、安全建议（防御视角）

1. 凭证保护强度 ≈ 无——应改用 DPAPI/Keychain 绑定用户身份，或将秘密放 OS 凭证库。
2. 硬编码 pepper 表随安装包分发，属 security-through-obscurity。
3. refreshToken 长效（约 180 天）。服务端**已有**设备绑定（DeviceProof ECDSA），
   但设备私钥与凭证同库存放且同等强度保护 → 绑定形同虚设；
   建议私钥入 OS 凭证库（TPM/Secure Enclave），并使 proof 校验拒绝同库派生的密钥。
4. `x-cloudide-token` 空/非空导致不同鉴权分支的行为易引发兼容性 bug，建议显式区分端点或头。

# TRAE SOLO CN — 凭证逆向工程

[English](README.md) | [中文](README_zh.md)

Windows 上 **TRAE SOLO CN**（TraeWork CN）桌面客户端凭证存储的系统性逆向工程。

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)
![Tests](https://img.shields.io/badge/tests/18-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-yellow)

</div>

## 成果

| 指标 | 数值 |
|---|---|
| **解密** | 4/4 凭证条目（100%） |
| **API 端点发现** | 98 个 TRAE 专用路径（共 356 个） |
| **成功调用 API** | 18 个可用 + 22 个需参数 |
| **Token 续期** | 完整 ECDSA P-256 设备证明流程 |
| **每日签到** | 状态查询 + 领取 |
| **测试覆盖** | 18/18 通过 |

## 快速开始

```bash
npm install
npm run phase6          # 解密验证
npm run dev -- checkin  # 每日签到
npm run dev -- refresh  # 轮换 token（请先关闭 TRAE！）
npx vitest run          # 18/18 通过
```

## 流程

| 阶段 | 目标 | 关键发现 |
|---|---|---|
| 1. 侦察 | 框架/版本/数据目录 | Electron + VS Code fork，解包目录 |
| 2. 数据收集 | 定位凭证存储 | `storage.json` 在 `globalStorage/` |
| 3. 格式分析 | 熵值与魔数 | 自定义 byteCrypto 信封（非 DPAPI） |
| 4. 加密识别 | 定位加密代码 | `out/main.js` byteCrypto 模块 |
| 5. 密钥提取 | 获取 pepper 表 | 4 张 64B 表，位于 `,Em=async t=>` 锚点 |
| 6. 解密验证 | 解密 + API 测试 | 4/4 解密成功，`loginAllowed:true` |

## API 发现（89 个端点已测试）

| 分类 | 认证头 | 可用 | 总数 |
|---|---|---|---|
| **iCube** | `x-icube-token` | 8 | 23 |
| **UG/增长** | `Cloud-IDE-JWT` + `x-device-id` | 2 | 17 |
| **Cloudide** | `x-cloudide-token` | 7 | 36 |
| **Connector** | `Cloud-IDE-JWT` | 1 | 9 |
| **GTM** | `Cloud-IDE-JWT` | 0 | 4 |

### 业务域（14 类）

```
① 核心 IDE     → 远程环境、项目、MCP、技能、聊天会话
② 账号体系     → 登录/设备绑定/OAuth/第三方集成
③ 商业化       → 支付/套餐/权益/积分计费
④ 增长体系     → 每日签到/活动/裂变/邀请码
⑤ 内容生态     → 模板/素材/Agent 分享
⑥ 企业集成     → 飞书/Connector/Supabase/Vercel
⑦ 运营配置     → 动态配置/特性开关/通知偏好
⑧ 设计可视化   → HTML→Figma/设计库/可视化编辑器
⑨ 扩展市场     → 插件/技能/Agent 发布与管理
⑩ IM 桥接      → 飞书/企业消息桥接
```

## 核心发现

### byteCrypto 信封
```
偏移    长度    内容
0       6       header = 74 63 05 10 00 00 ("tc" + ver5 + 0x10)
6       32      random（crypto.getRandomValues）
38      n*16    AES-128-CBC(key, iv, SHA512(plaintext) || plaintext)
```

密钥派生：`pepper = Vie[i] ^ Qie[i]` → `derived = SHA512(SHA512(random) || pepper)` → `key = derived[0:16], iv = derived[16:32]`

### ExchangeToken（Token 续期）
```json
{
  "ClientID": "en1oxy7wnw8j9n",
  "RefreshToken": "<当前>",
  "DeviceInfo": { "DeviceID": "...", "PlatformCode": "SOLO_PC", ... },
  "DeviceProof": {
    "Signature": "<ECDSA P-256 SHA-256 base64>",
    "Timestamp": "<unix 秒>",
    "Nonce": "<32 位 hex>"
  }
}
```

签名原文：`"POST\n/trae/api/v3/oauth/ExchangeToken\n<ClientID>\n<RefreshToken>\n<Timestamp>\n<Nonce>"`

> **发现的 3 个坑**：`x-cloudide-token` 必须为空字符串、`DeviceProof` 字段名必须 PascalCase、`DeviceInfo` 指纹必须与注册时一致。

### 可用 API（18 个）

**iCube**：`user`, `notifications/preferences`, `avatar/random`, `report/token`, `showcase/list`, `templates/list`, `templates/favorites`, `templates/scenes`

**UG**：`checkin_credits/status`, `checkin_credits/claim`

**Cloudide**：`GetUserInfo`, `CheckLogin`, `CheckPay`, `GetUserEmailSuffix`, `GetUserSupabaseToken`, `GetUserVercelToken`, `oauth/GetRefreshToken`

**Connector**：`GetFeishuPermissionTree`

## 项目结构

```
src/
├── index.ts                          ← CLI（7 个命令）
├── phase1-reconnaissance/index.ts
├── phase2-data-collection/index.ts
├── phase3-format-analysis/index.ts
├── phase4-encryption-id/
├── phase5-key-extraction/
├── phase6-decryption/
│   ├── byteCrypto.ts                 ← 核心：信封 + 表提取
│   ├── traeClient.ts                 ← ExchangeToken + 签到客户端
│   ├── flows.ts                      ← checkin/refresh 编排
│   ├── decryptTraeAuth.ts            ← 批量解密
│   └── validate.ts                   ← API 验证
└── utils/entropy.ts|magic.ts

docs/                                   ← 全部文档（已脱敏）
output/                                 ← 敏感数据（gitignore）
scripts/                                ← 辅助脚本（12 个）
tests/                                  ← 18 个测试
```

## 文档

| 文档 | 内容 |
|---|---|
| `docs/FINDINGS.md` | 完整算法分析（byteCrypto、ExchangeToken、签到） |
| `docs/FLOW.md` | 全流程手册 |
| `docs/phase6-decryption/API-REFERENCE.md` | **89 个 API 端点测试** 含认证详情 |
| `docs/phase6-decryption/API-DOMAINS.md` | **14 个业务域分类** |
| `docs/phase1~6-*/RUN-LOG.md` | 各阶段执行记录 |
| `docs/README.md` | 脱敏规范与目录状态 |

## 安全说明

- 文档中所有敏感值按 `docs/README.md` 规范脱敏
- 原始凭证在 `output/` 目录（gitignore）
- token 续期会轮换 refreshToken —— 运行 `refresh` 前请关闭 TRAE
- 本项目仅用于**对自己机器和凭证的安全研究**

## 许可证

MIT

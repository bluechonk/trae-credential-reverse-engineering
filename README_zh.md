# TRAE SOLO CN — 凭证逆向工程

[English](README.md) | [中文](README_zh.md)

Windows 上 **TRAE SOLO CN**（TraeWork CN）桌面客户端凭证存储的系统性逆向工程。

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
# 安装
npm install

# 运行逆向流程
npm run phase1          # 侦察
npm run phase2          # 数据收集
npm run phase3          # 熵值与魔数分析
npm run phase4          # 加密识别
npm run phase5          # 密钥提取（运行时表提取）
npm run phase6          # 解密验证

# 功能命令
npm run dev -- validate # 验证凭证有效性
npm run dev -- checkin  # 每日签到：状态 → 领取 → 复核
npm run dev -- refresh  # 通过 refreshToken 轮换 token（请先关闭 TRAE！）

# 测试
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

## 文档

| 文档 | 内容 |
|---|---|
| `docs/FINDINGS.md` | 完整算法分析（byteCrypto、ExchangeToken、签到） |
| `docs/FLOW.md` | 全流程手册 |
| `docs/phase6-decryption/API-REFERENCE.md` | **89 个 API 端点测试** 含认证详情 |
| `docs/phase1~6-*/RUN-LOG.md` | 各阶段执行记录 |
| `docs/README.md` | 脱敏规范与目录状态 |

## API 分类（认证头）

| 分类 | 认证头 | 可用 | 总数 |
|---|---|---|---|
| **iCube** | `x-icube-token` | 8 | 23 |
| **UG/增长** | `Cloud-IDE-JWT` + `x-device-id` | 2 | 17 |
| **Cloudide** | `x-cloudide-token` | 7 | 36 |
| **Connector** | `Cloud-IDE-JWT` | 1 | 9 |
| **GTM** | `Cloud-IDE-JWT` | 0 | 4 |

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

## 安全说明

- 文档中所有敏感值按 `docs/README.md` 规范脱敏
- 原始凭证在 `output/` 目录（gitignore）
- token 续期会轮换 refreshToken —— 运行 `refresh` 前请关闭 TRAE
- 本项目仅用于**对自己机器和凭证的安全研究**

## 许可证

MIT

# 阶段五：密钥提取 — 运行记录

> 执行时间：2026-08-22 | 脚本：`scripts/table-fingerprint.ts`

## 提取目标

byteCrypto 信封的密钥派生依赖 4 张**硬编码在 main.js 里的 64 字节混淆表**
（Hie/Wie/Vie/Qie，位于锚点 `,Em=async t=>` 前约 3KB 处）。
本阶段从安装目录的 `out\main.js` 运行时提取并做指纹记录。

## 表指纹（值已脱敏：仅长度+首6字节+SHA-256前16位）

```
Hie: len=64  head=[bf c0 d8 fa 7a f6 …]  sha256=9207df805b7784f5…
Wie: len=64  head=[f6 cc 1a e8 e8 46 …]  sha256=823fa965f1cb5d87…
Vie: len=64  head=[52 09 6a d5 30 36 …]  sha256=a11e80f923aebb37…
Qie: len=64  head=[1f dd a8 33 88 07 …]  sha256=969973bbc3e82d7d…
```

## 派生 pepper（表间异或）

```
pepper(AES)  = Vie ^ Qie : len=64  head=[4d d4 c2 e6 b8 31 …]  sha256=ebc17f362f05265d…
pepper(PRIV) = Hie ^ Wie : len=64  head=[49 0c c2 12 92 b0 …]  sha256=1cc81612a12f1f64…
```

- 普通信封（头 `74 63 05 10`）→ `Rie` 用 `pepper(AES)`
- AES_PRIVATE 信封（头 `[18,57,18,32,2,3]`）→ 用 `pepper(PRIV)`

## 其他提取到的密钥材料

| 材料 | 来源 | 用途 | 记录 |
|---|---|---|---|
| 设备 EC P-256 密钥对 | `iCubeAuthInfo://icube-dc:1448****8571`（解密后） | ExchangeToken 的 DeviceProof 签名 | 私钥 `-----BEGIN PRIVATE KEY----- *****（已遮盖，241 chars）`；公钥指纹 `7acffc8272719c0a` |
| ClientID（SOLO/stable） | product.json `authConfig.SOLO.stable` | OAuth ClientID | `en1oxy7wnw8j9n`（客户端内置公开值，非机密） |
| 动态配置缓存密钥 | `md5("TRAE SOLO CN")` hex 作 32B key | 解密 `Local Storage\config.db` | 派生值，非存储密钥 |

## 验证

- 表提取采用运行时正则 + 锚点定位（`extractTablesFromMainJs`），不手工转录 ✓
- 解密 4/4 凭证成功（见阶段六）反证表与派生逻辑正确 ✓
- 设备密钥对一致性：私钥推导公钥 == 存储公钥（指纹一致）✓

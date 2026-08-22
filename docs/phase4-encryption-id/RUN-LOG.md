# 阶段四：加密识别 — 运行记录

> 执行时间：2026-08-22 | 命令：`npm run phase4`

```
▶ Phase 4: Encryption Identification

√ Found unpacked app: C:\Program Files\TRAE SOLO CN\resources\app
√ Found 6011 indicators

─── 🔐 Algorithms（节选）───
  aes-256-cbc          sharedProcessMain.js / main.js
  createCipheriv       main.js (动态配置缓存加密)
  createDecipheriv     main.js ×2
  pbkdf2               electron-utility\sharedProcessMain.js:107
  bcrypt               多处 (node_modules)
  hkdf / createHmac    @byted-icube\solo-lite 等
  sha256/sha512        广泛使用

─── 关键源码模块定位 ───
  out/main.js → "out-build/vs/base/common/byteCrypto.js"      ★ 核心信封加密
  out/main.js → ".../encryptionMainService.js"                VS Code safeStorage 封装（未用于凭证）
  out/main.js → ".../iCubeAuth/electron-main/components/userStorage.js"  凭证存取层
```

## 密文头部解码

storage.json 中所有 `iCubeAuthInfo://*` 值 base64 解码后前 6 字节：

```
74 63 05 10 00 00  →  ASCII "tc" + ver=5 + 0x10 + 00 00
```

与 byteCrypto 模块常量完全吻合：`NP=116('t'), OP=99('c'), $P=5, RP=16, MP=0, LP=0`

完整结果：`output/phase4/indicators.json`（6011 条）

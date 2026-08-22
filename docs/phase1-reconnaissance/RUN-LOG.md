# 阶段一：侦察 — 运行记录

> 执行时间：2026-08-22 | 命令：`npm run phase1`

```
▶ Phase 1: Reconnaissance

Searching for TRAE SOLO CN (TraeWork CN) installation...

✓ Installation found: C:\Program Files\TRAE SOLO CN

√ Framework: Electron (Chromium + Node.js)
√ Version: 1.107.1
√ Data directories found: 56

关键数据目录（存在项）:
  ✓ %APPDATA%\TRAE SOLO CN
  ✓ %APPDATA%\TRAE SOLO CN\User\globalStorage
  ✓ %APPDATA%\TRAE SOLO CN\Local Storage
  ✓ %APPDATA%\TRAE SOLO CN\Session Storage
  ✓ %APPDATA%\TRAE SOLO CN\Local Storage\leveldb

─── Phase 1 Summary ───
  Framework:  Electron (Chromium + Node.js)
  Version:    1.107.1
  Install:    C:\Program Files\TRAE SOLO CN
  Data dirs:  5 found
```

## 安装目录结构（resources/）

```
C:\Program Files\TRAE SOLO CN\resources\
├── app\                    ← 未打包的完整源码（无 app.asar）
│   ├── out\main.js         ← Electron 主进程（含全部加密实现）
│   ├── package.json / product.json
│   └── node_modules\ (@byted-icube/*)
└── app-update.yml
```

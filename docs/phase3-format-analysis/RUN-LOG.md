# 阶段三：格式分析 — 运行记录

> 执行时间：2026-08-22 | 命令：`npm run phase3` + 聚焦扫描脚本

## 全量扫描

```
▶ Phase 3: Format Analysis

  targets.json not found, scanning data directory directly...
  Scanning: C:\Users\Cecilia\AppData\Roaming\TRAE SOLO CN
Found 93415 files to analyze.
```

全目录含 git objects、内置工具链（ffmpeg 等），93k+ 文件在 60s 预算内未跑完 → 结论：
**全量熵扫描性价比低**，改为对凭证相关文件做聚焦分析（下方）。这也验证了阶段二
"按优先级收敛目标面"的必要性。

## 聚焦扫描结果（scripts/focused-scan.ts）

```
globalStorage/storage.json
  size=11.1KB  magic=?  entropy=5.73 (medium)
  iCubeAuthInfo://icube-dc:1448…   len=776    valueEntropy=5.93
  iCubeAuthInfo://usertag          len=224    valueEntropy=5.80
  iCubeAuthInfo://icube.cloudide   len=2484   valueEntropy=5.99
  iCubeServerData://icube.cloudide len=4139   valueEntropy=4.87

globalStorage/state.vscdb
  size=932.0KB  magic=SQLITE  entropy=5.07 (medium)

Local Storage/leveldb/000184.ldb
  size=1257.8KB  magic=?  entropy=7.04 (medium)
```

## 判读

| 观察 | 推断 |
|---|---|
| `storage.json` 整体熵 5.73，各加密值 5.8~5.99 | **中等熵**——base64 编码的特征区间（base64 上限 ≈6.0），而非 AES 密文裸字节（≈8.0）→ 存储层是 base64 信封 |
| `iCubeServerData` 熵 4.87 且可读 | 未加密的明文 JSON（后续解密阶段确认为 PLAINTEXT） |
| `state.vscdb` SQLITE 头 | VS Code 标准状态库，SQLite 工具可直接打开 |
| leveldb 7.04 | 混合内容（压缩块+明文 KV），LevelDB 正常特征 |

**关键结论**：加密值的熵分布直接提示了「自定义信封 + base64」而非 DPAPI 裸 blob
（DPAPI 头 `01 00 00 00 D0 8C 9D DF` 的 base64 应以 `AQAAAADYjQ…` 开头，实际以
`dGMFEAAA` 开头 → 自定义魔数 `"tc"`）。此判断被阶段四源码分析证实。

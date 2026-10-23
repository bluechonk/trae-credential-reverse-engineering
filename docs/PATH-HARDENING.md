# 硬编码路径治理（RUN-LOG）

日期：2026-10-16 | 2026-10-24 补充：应用目录名候选现为三种（Trae CN / TRAE SOLO CN / TraeWork CN，见 paths.ts），本文其余内容为当日历史记录

## 背景与问题

仓库移植到其他机器后原样跑不起来：23 处路径把「用户名」「项目所在盘」「安装盘」全部写死。按写死对象分三类：

| 类别 | 写死内容 | 位置 | 问题 |
|---|---|---|---|
| 用户名 | `C:/Users/Cecilia/...` | scripts/ 下 3 个文件 5 处 | 换机器即失效（本机用户是 bluechonk，复现必败） |
| 项目盘 | `D:/Projects/trae-credential-reverse-engineering/...` | inspect-pem、verify-keypair | 项目目录不受控于使用者 |
| 安装盘 | `C:/Program Files/TRAE SOLO CN/...` | decryptTraeAuth、flows、table-fingerprint、writeback-validate、phase1、phase4 | 漏掉用户级安装（`%LOCALAPPDATA%\Programs`）；与 phase4 自身口径不一致 |

另有 4 个脚本用 `process.env.APPDATA + '/TRAE SOLO CN/...'` 直拼，无兜底、无存在性检查，属半硬编码。

本机验证数据：

- TRAE 实际装在 `%APPDATA%\TRAE SOLO CN`（用户 bluechonk）
- leveldb 当前文件是 `000005.ldb`（写死的 `000184.ldb` 已随压缩滚动过期）

## 方案

新增 `src/utils/paths.ts`，路径知识单一可信源，解析优先级统一为：

1. 环境变量（`APPDATA` / `LOCALAPPDATA` / `ProgramFiles` / `ProgramFiles(x86)` / `SystemDrive`）
2. Node 内建推导（缺失时按 `os.homedir()` / `SystemDrive` 兜底）
3. 候选位置按存在性探测（两种应用名 `TRAE SOLO CN` / `TraeWork CN` × 各级根目录）

导出的函数：`appDataDir`、`localAppDataDir`、`programFiles`、`programFilesX86`、`TRAE_APP_DIR_NAMES`、`projectRoot`、`installRoots`、`findUserDataPath`、`findStorageJson`、`findMainJs`、`findLeveldbLdb`。

`projectRoot()` 从模块位置逐级上溯找 `package.json`，兼容 tsx 源码与 tsc 编译输出两种运行方式，替代写死的项目根。

## 改动清单

- src/（6 个文件）：`utils/index.ts` 导出 paths；`phase1-reconnaissance` SEARCH_PATHS 盘符改动态；`phase4-encryption-id` findAppSource 候选改为 `installRoots() × TRAE_APP_DIR_NAMES`；`phase6-decryption` 的 decryptTraeAuth / flows / traeClient / validate 统一走 `findMainJs()` / `findStorageJson()`
- scripts/（11 个文件）：Cecilia 路径 → `findUserDataPath()` / `findLeveldbLdb()`；`D:/Projects` → `projectRoot()`；`C:/Program Files` → `findMainJs()`；APPDATA 直拼 → `findStorageJson()` 并加缺失时的明确报错

全部新增/修改注释为中文，脚本日志保持英文，行为与原逻辑一致（找不到路径时给出可读错误并 `process.exit(1)`）。

## 验证证据

1. 残留扫描：`grep -rEn 'C:|D:/|Program Files' src/ scripts/ tests/` 仅剩 `paths.ts` 内部的系统级兜底默认值
2. 类型检查：tsc 错误集合与基线（HEAD `1eca6eb`）完全一致，差分为空——本次改动未引入任何新错误（scripts 不在 tsconfig 范围，未纳入）
3. 单元测试：vitest 18/18 通过
4. 冒烟测试：paths 全函数本机输出正确（storage.json/leveldb 命中本机真实安装，main.js 未安装时诚实返回 null）
5. 端到端：`scripts/focused-scan.ts` 与 `scripts/read-device-id.ts` 在本机成功读出真实数据（原版在这台机器上必然失败）

## 遗留修复记录（2026-10-16 追加）

基线 HEAD 固有的 11 条 tsc 类型错误已全部修复，仓库达到零错误可编译状态：

| 问题 | 修复 |
|---|---|
| `phase3-format-analysis` 重复的 `resolve` import（2 条） | 删除 18 行重复的 `import { resolve } from 'node:path'`，保留含 `join` 的那条 |
| `byteCrypto.ts` 7 处 `BufferSource` 未定义 | 模块顶部补 `type BufferSource = ArrayBufferView \| ArrayBuffer`（WebCrypto 参数类型；tsconfig lib 不含 DOM，不引入 "DOM" 以避免污染全局类型） |
| `phase6-decryption/index.ts` `createDecipheriv` 重载不匹配 | 第三参改为直接传 `iv`（上方已按 `ivLen` 计算，无 IV 算法为空 `Buffer.alloc(0)`，合法 `BinaryLike`）；原先传 `undefined` 不在 `BinaryLike \| null` 联合内 |
| `validate.ts` `userRegion` 不在 `DecryptedAuth` 接口 | 接口补 `userRegion?: Record<string, unknown>` |

验证：`npx tsc --noEmit` 零错误（exit 0）；`npm run build` 产出完整 dist（含 .d.ts）；vitest 18/18 通过。

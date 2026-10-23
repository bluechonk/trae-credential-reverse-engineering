# 阶段二：数据收集 — 运行记录

> 执行时间：2026-08-19 ~ 2026-08-22 | 命令：`npm run phase2`（交互式）

## 执行说明

阶段二设计为**登录前后两次扫描**对比，用于定位登录态新增的存储项。
实际执行时目标机器已处于登录状态（无法回退到未登录快照），因此采用替代方案：

1. 直接对现有数据目录做全量清单收集（由阶段三的直扫路径完成）
2. 对已知高价值文件做定向读取与解密尝试（阶段六闭环验证）

## 数据目录清单（收集结果）

```
C:\Users\Cecilia\AppData\Roaming\TRAE SOLO CN\
├── User\globalStorage\storage.json        ← 凭证主存储（iCubeAuthInfo://*）
├── User\globalStorage\state.vscdb         ← SQLite 状态库
├── Local Storage\leveldb\                 ← 渲染层 KV（SLARDARsolo_pc 等）
├── Local Storage\config.db                ← 动态配置缓存（AES-256-CBC, key=md5(nameShort)）
└── logs\<session>\main.log                ← 主进程日志（含 [ICDRS] 设备ID）
```

## storage.json 关键条目（值已脱敏）

| 键 | 长度 | 熵 | 说明 |
|---|---|---|---|
| `iCubeAuthInfo://icube.cloudide` | 2484 | 5.99 | 用户信息+token+refreshToken |
| `iCubeAuthInfo://icube-dc:1448****8571` | 776 | 5.93 | 设备 EC P-256 密钥对（PEM×2） |
| `iCubeAuthInfo://usertag` | 224 | 5.80 | userId→userTag 映射 |
| `iCubeServerData://icube.cloudide` | 4139 | 4.87 | 明文 JSON（活动/积分） |
| `telemetry.machineId` | 64 hex | — | `5d673011**********（已遮盖）` |
| `has_device_id_updated_to_aha` | — | — | aha 迁移标记 |

## 结论

- 凭证全部集中在 `storage.json` 的 `iCubeAuthInfo://` 命名空间下，键名即语义
- 设备密钥键名 **内嵌 deviceId**：`icube-dc:1448****8571`（该 ID 后续被确认为服务器端设备绑定 ID）
- 未发现 DPAPI / safeStorage 特征 → 进入阶段三做熵学确认

---

## 2026-10-24 复现记录（Trae CN 1.107.1）

- 修复：findDataDirectory 候选缺 `Trae CN`（现优先后保留旧名兼容）；提示文案 TraeWork CN → Trae CN
- 非交互（管道 stdin EOF）下登录等待自动跳过：before.csv 1186 文件（Trae CN 数据目录），after.csv 生成；交互式登录 diff 流程需人工执行
- 新逻辑：登录态检测——storage.json 已含 `iCubeAuthInfo://icube.cloudide` 时跳过人工等待（本机复现：前后快照一致 0 diff，符合已登录态预期）；未登录才进入交互等待

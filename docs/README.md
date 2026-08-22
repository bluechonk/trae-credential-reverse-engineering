# docs/

项目实施全流程的运行日志与证据记录。

## 目录状态

| 目录 | 内容 | 状态 |
|---|---|---|
| `phase1-reconnaissance/` | RUN-LOG.md — 框架/版本/数据目录探测 | ✅ 完成 |
| `phase2-data-collection/` | RUN-LOG.md — 数据收集（交互式跳过说明+替代方案） | ✅ 补充 |
| `phase3-format-analysis/` | RUN-LOG.md — 熵值/魔数聚焦扫描 | ✅ 完成 |
| `phase4-encryption-id/` | RUN-LOG.md — 加密特征搜索 + 密文头解码 | ✅ 完成 |
| `phase5-key-extraction/` | RUN-LOG.md — 硬编码表指纹提取 | ✅ 补充 |
| `phase6-decryption/` | RUN-LOG.md — 解密/API验证/签到/续期 | ✅ 完成 |
| `FINDINGS.md` | 完整分析报告（算法细节） | ✅ 持续更新 |
| `FLOW.md` | 全流程手册（六阶段+签到+续期+踩坑） | ✅ 完成 |

> 说明：按需求不做截图，以实际控制台输出记录为准；PNG 可后续按需补充。

## 🔒 脱敏规范（所有日志与文档统一遵守）

真实凭证一律不落明文，采用「保留前缀 + `*` 遮盖 + 标注长度」格式：

| 类型 | 明文示例（虚构） | 脱敏后写法 |
|---|---|---|
| JWT token | `eyJhbGciOiJSUzI1NiIs…`(1004字符) | `eyJhbGciOiJSUzI1N****************`（1004 chars） |
| refreshToken | `AbCdEfGhIjK…`(61字符) | `AbCdEfGhIjK*******************************************`（61 chars） |
| userId | `1234567890123456` | `1234****3456` |
| deviceId (UUID) | `xxxxxxxx-xxxx-…-xxxxx` | `xxxxxxxx-****-****-****-********xxxx` |
| machineId | `5d67301…`(64位hex) | `5d673011********************************************************************` |
| PEM 私钥 | 完整 PEM 块 | `-----BEGIN PRIVATE KEY----- *****（已遮盖）` |
| 密文 blob | `dGMFEAAAzQyf…`(776字符) | `dGMFEAAAzQyfhNMB**********`（776 chars） |

原则：
1. **token / refreshToken / 私钥**：只保留可识别前缀（≤14 字符），其余全部 `*`
2. **各类 ID**：首尾各保留 4 位，中间 `****`
3. **密文**：保留前 16 字符用于比对识别，其余 `*`
4. 终端实时输出若需截图/复制，先过同样的脱敏处理

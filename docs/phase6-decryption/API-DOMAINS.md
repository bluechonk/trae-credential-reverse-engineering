# TRAE SOLO CN — API 业务域分析

> 日期：2026-08-22 | 基于 89 个端点实测 + 返回字段分析

按业务域对 98 个 TRAE 专用 API 分类，说明各接口用途及业务背景。

---

## 一、用户与账号（User & Account）

用户身份、登录态、设备绑定、OAuth 认证。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/icube/api/v1/user` | `x-icube-token` | ✅ | 用户有效性验证（判断 token 是否有效） |
| `/cloudide/api/v3/trae/GetUserInfo` | `x-cloudide-token` | ✅ | 完整用户画像（头像、昵称、邮箱、手机、注册时间、区域） |
| `/cloudide/api/v3/trae/CheckLogin` | `x-cloudide-token` | ✅ | 登录态 + 设备绑定状态（`BoundDeviceID`、`DeviceBindStatus`、`IsLogin`） |
| `/cloudide/api/v3/trae/GetUserEmailSuffix` | `x-cloudide-token` | ✅ | 邮箱后缀 |
| `/cloudide/api/v3/trae/GetUserStasticData` | `x-cloudide-token` | 500 | 用户统计数据（已下线） |
| `/cloudide/api/v3/trae/MarkUser` | `x-cloudide-token` | 403 | 标记用户（SAAS 专用） |
| `/cloudide/api/v3/trae/SaveUserNickNameStatus` | `x-cloudide-token` | 403 | 昵称修改状态（SAAS 专用） |
| `/cloudide/api/v3/trae/RenewSession` | `x-cloudide-token` | 403 | 续会话（SAAS 专用） |
| `/cloudide/api/v3/trae/Login` | `x-cloudide-token` | 401 | OAuth 登录流程 |
| `/cloudide/api/v3/trae/Logout` | `x-cloudide-token` | ~ | 登出（需参数） |
| `/cloudide/api/v3/trae/risk_control/WaitList` | `x-cloudide-token` | 403 | 风控白名单（SAAS 专用） |
| `/cloudide/api/v3/trae/terms/get` | `x-cloudide-token` | 400 | 服务条款（需参数） |

**关键字段**：`CheckLogin` 返回 `BoundDeviceID` + `DeviceBindStatus` + `IsLogin`，是设备绑定的核心接口。

---

## 二、签到与增长（Check-in & Growth）

每日积分签到、商业化活动、裂变拉新。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/trae/api/v2/ug/checkin_credits/status` | `Cloud-IDE-JWT` + `x-device-id` | ✅ | 查询今日签到状态（`checked_in`、`credits`） |
| `/trae/api/v2/ug/checkin_credits/claim` | `Cloud-IDE-JWT` + `x-device-id` | ✅ | 领取每日签到积分（固定 200 分） |
| `/trae/api/v2/ug/activity/info` | `Cloud-IDE-JWT` + `x-device-id` | ~ | 商业化活动列表（`commercial_activities`） |
| `/trae/api/v2/ug/activity/action` | `Cloud-IDE-JWT` + `x-device-id` | 4001 | 活动操作（领取/参与，需 `activity_id`） |
| `/trae/api/v2/ug/work_fission/grant` | `Cloud-IDE-JWT` + `x-device-id` | 4001 | 工作裂变奖励（邀请裂变机制） |
| `/trae/api/v2/pay/grant_work_benefit` | `Cloud-IDE-JWT` + `x-device-id` | 9069 | 发放工作权益（"活动暂不可用"） |
| `/trae/api/v2/pay/report_work_click` | `Cloud-IDE-JWT` + `x-device-id` | 9069 | 上报工作点击（"活动暂不可用"） |

**活动类型**（从 `iCubeServerData` 解密数据可见）：
- `101` = express_lottery（快速抽奖）
- `102` = new_user_credits（新用户积分）
- `103` = work_fission_202607（工作裂变）
- `105` = send_message_reward（发消息奖励）

**注意**：`activity/info` 返回 `commercial_activities` 列表（只读），`activity/action` 需要正确的 `activity_id` + 其他参数才能参与。

---

## 三、支付与权益（Payment & Entitlement）

套餐购买、积分计费、权益管理、token 续期。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/trae/api/v2/pay/ide_user_ent_usage` | `Cloud-IDE-JWT` | ~ | 权益使用量（`user_entitlement_pack_list`） |
| `/trae/api/v2/pay/ide_user_pay_status` | `Cloud-IDE-JWT` | ~ | 完整支付状态（付费类型、活动开关、裂变状态） |
| `/trae/api/v2/pay/switch_cn_billing_version` | `Cloud-IDE-JWT` | ~ | 切换国内计费版本 |
| `/trae/api/v1/pay/ide_user_ent_usage` | `Cloud-IDE-JWT` | ~ | V1 权益使用量 |
| `/trae/api/v1/pay/ide_user_pay_status` | `Cloud-IDE-JWT` | ~ | V1 支付状态 |
| `/trae/api/v1/pay/claim_birthday_bonus` | `Cloud-IDE-JWT` | 9019 | 领取生日奖励（限时活动） |
| `/trae/api/v1/pay/create_order` | `Cloud-IDE-JWT` | 9004 | 创建订单（需套餐参数） |
| `/trae/api/v1/pay/get_invite_code` | `Cloud-IDE-JWT` | 9019 | 获取邀请码（需资格） |
| `/trae/api/v1/pay/redeem_invite_code` | `Cloud-IDE-JWT` | 9030 | 兑换邀请码 |
| `/trae/api/v1/pay/unfollow_plan` | `Cloud-IDE-JWT` | ~ | 取消关注套餐 |
| `/trae/api/v3/oauth/ExchangeToken` | `x-cloudide-token: ""` | ✅ | token 续期（设备证明 ECDSA P-256 签名） |
| `/oauth/ExchangeToken` | — | — | 备用续期路径 |

**`ide_user_pay_status` 返回的关键字段**：
- `is_credits_billing` = 积分计费模式
- `is_dollar_usage_billing` = 美元用量计费
- `enable_fission` = 裂变功能开关
- `enable_solo_builder/coder/lite/web` = 各产品线开关
- `trial_status` = 试用状态
- `server_time_ms` = 服务器时间

---

## 四、通知与消息（Notifications）

站内通知、消息偏好设置。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/icube/api/v1/notifications/preferences` | `x-icube-token` | ✅ | 通知偏好（`offers`、`tips`、`account`、`feedback` 四类） |
| `/icube/api/v1/notifications/count` | `x-icube-token` | 404 | 未读通知数（已下线） |
| `/icube/api/v1/notifications/list` | `x-icube-token` | 404 | 通知列表（已下线） |
| `/icube/api/v1/notifications/update_status` | `x-icube-token` | ~ | 更新通知状态（需 `notificationIds` + `action`） |

**注意**：`count` 和 `list` 已下线，`preferences` 是唯一可用的通知接口。

---

## 五、模板与展示（Templates & Showcases）

IDE 启动时的模板选择面板、样例工程展示。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/icube/api/v1/templates/list` | `x-icube-token` | ✅ | 模板列表（分页，`items` + `next_page_token` + `total`） |
| `/icube/api/v1/templates/detail` | `x-icube-token` | ~ | 模板详情（需 `id`） |
| `/icube/api/v1/templates/favorites` | `x-icube-token` | ✅ | 收藏的模板列表 |
| `/icube/api/v1/templates/favorite` | `x-icube-token` | ~ | 收藏/取消收藏（需 `case_id` + `action`） |
| `/icube/api/v1/templates/scenes` | `x-icube-token` | ✅ | 模板场景（9 种预设场景） |
| `/icube/api/v1/showcase/list` | `x-icube-token` | ✅ | 展示案例列表（4 条） |
| `/icube/api/v1/showcase/preview` | `x-icube-token` | ~ | 预览展示（需 `id`） |
| `/icube/api/v1/showcase/scenes` | `x-icube-token` | 404 | 展示场景（已下线） |

---

## 六、第三方集成（Third-party Integrations）

GitHub / Supabase / Vercel 等外部服务的 OAuth 令牌管理。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/cloudide/api/v3/trae/GetUserGitHubToken` | `x-cloudide-token` | 403 | 获取 GitHub token（SAAS 专用） |
| `/cloudide/api/v3/trae/github/CheckAuthorization` | `x-cloudide-token` | 403 | 检查 GitHub 授权（SAAS 专用） |
| `/cloudide/api/v3/trae/github/GetAccessToken` | `x-cloudide-token` | 403 | 获取 GitHub 访问令牌（SAAS 专用） |
| `/cloudide/api/v3/trae/github/UpdateAccessToken` | `x-cloudide-token` | 403 | 更新 GitHub 令牌（SAAS 专用） |
| `/cloudide/api/v3/trae/GetUserSupabaseToken` | `x-cloudide-token` | ✅ | Supabase token（空数组） |
| `/cloudide/api/v3/trae/GetUserSupabaseOrg` | `x-cloudide-token` | 403 | Supabase 组织（SAAS 专用） |
| `/cloudide/api/v3/trae/SetUserSupabaseToken` | `x-cloudide-token` | 403 | 设置 Supabase token（SAAS 专用） |
| `/cloudide/api/v3/trae/GetUserVercelToken` | `x-cloudide-token` | ✅ | Vercel token（`TeamId` + `Token`） |
| `/cloudide/api/v3/trae/SetUserVercelToken` | `x-cloudide-token` | 403 | 设置 Vercel token（SAAS 专用） |
| `/trae/api/v3/GetThirdPartyToken` | `Cloud-IDE-JWT` | 400 | 获取第三方 token（需 provider） |
| `/trae/api/v3/SetThirdPartyToken` | `Cloud-IDE-JWT` | 400 | 设置第三方 token（需 provider） |
| `/trae/api/v3/DisconnectThirdPartyToken` | `Cloud-IDE-JWT` | 400 | 断开第三方 token |
| `/cloudide/api/v3/trae/GetJSAPITicket` | `x-cloudide-token` | 500 | 获取 JSAPI Ticket（微信/飞书用） |

**规律**：403 code=10303 = SAAS/企业版专属功能，个人账户无法使用。

---

## 七、Connector 连接器（飞书/企业集成）

飞书/企业微信等办公软件的连接器管理。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/trae/api/v3/GetFeishuPermissionTree` | `Cloud-IDE-JWT` | ✅ | 飞书权限树（14 项权限节点） |
| `/trae/api/v3/GetConnectorConnection` | `Cloud-IDE-JWT` | 401 | 连接器连接状态（需 connector auth） |
| `/trae/api/v3/ListConnectorConnections` | `Cloud-IDE-JWT` | 401 | 列出所有连接器 |
| `/trae/api/v3/ListConnectorInterfaces` | `Cloud-IDE-JWT` | 401 | 连接器接口列表 |
| `/trae/api/v3/DisconnectConnector` | `Cloud-IDE-JWT` | 401 | 断开连接器 |
| `/trae/api/v3/ResolveConnectorToken` | `Cloud-IDE-JWT` | 401 | 解析连接器 token |
| `/trae/api/v3/SetConnectorToken` | `Cloud-IDE-JWT` | 401 | 设置连接器 token |
| `/trae/api/v3/connector/auth/poll` | `Cloud-IDE-JWT` | 401 | 轮询认证状态 |
| `/trae/api/v3/connector/oauth/start` | `Cloud-IDE-JWT` | 401 | 启动 OAuth 流程 |

**用途**：TRAE 企业版连接飞书时的 OAuth 授权 + 权限管理。需要 `code=20310` 对应的 connector 级认证。

---

## 八、内容与素材（Content & Materials）

头像、素材上传、Agent 分享。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/icube/api/v1/avatar/random` | `x-icube-token` | ✅ | 随机头像（`imageId` + `uri` + `url`） |
| `/icube/api/v1/material/get_url` | `x-icube-token` | 500 | 获取素材 URL |
| `/icube/api/v1/material/getToken` | `x-icube-token` | 500 | 获取素材上传 token |
| `/icube/api/v1/material/upload` | `x-icube-token` | — | 上传素材 |
| `/icube/api/v1/share/agent/create` | `x-icube-token` | 500 | 创建 Agent 分享（需 `userId`） |
| `/icube/api/v1/share/agent/get` | `x-icube-token` | 500 | 获取 Agent 分享（需 `shareCode`） |

---

## 九、用户属性与档案（User Profile & Attributes）

SAAS 版的企业用户管理功能。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/cloudide/api/v3/common/GetUserAttribute` | `x-cloudide-token` | 403 | 用户属性（SAAS 专用） |
| `/cloudide/api/v3/common/GetUserProfile` | `x-cloudide-token` | 403 | 用户档案（SAAS 专用） |
| `/cloudide/api/v3/common/SaveUserAttribute` | `x-cloudide-token` | 403 | 保存用户属性（SAAS 专用） |
| `/cloudide/api/v3/common/UpdateUserProfile` | `x-cloudide-token` | 403 | 更新用户档案（SAAS 专用） |
| `/cloudide/api/v3/trae/Delete` | `x-cloudide-token` | ~ | 删除账号（需参数） |

---

## 十、远程开发环境（Cloudide & Workspace）

远程容器、项目、MCP、技能、聊天会话管理。

| API | 认证 | 用途 |
|---|---|---|
| `/api/remote/v1/environments` | — | 远程环境列表 |
| `/api/remote/v1/environments/supported_versions` | — | 支持的版本 |
| `/api/remote/v1/projects` | — | 项目列表 |
| `/api/remote/v1/mcp_configs` | — | MCP 配置 |
| `/api/remote/v1/mcp_configs/gallery_status` | — | MCP 广场状态 |
| `/api/remote/v1/chat_sessions` | — | 聊天会话 |
| `/api/remote/v1/chat_sessions/batch_by_project` | — | 按项目批量获取会话 |
| `/api/remote/v1/chat_sessions/pinned` | — | 置顶会话 |
| `/api/remote/v1/chat_sessions/repo_groups` | — | 仓库分组会话 |
| `/api/remote/v1/scheduled_tasks` | — | 定时任务 |
| `/api/remote/v1/scheduled_tasks/from_template` | — | 从模板创建定时任务 |
| `/api/remote/v1/scheduled_tasks/pinned` | — | 置顶定时任务 |
| `/api/remote/v1/scheduled_task_templates` | — | 定时任务模板 |
| `/api/remote/v1/scheduled_task_executions` | — | 定时任务执行记录 |
| `/api/remote/v1/skills` | — | 技能列表 |
| `/api/remote/v1/plugins` | — | 插件列表 |
| `/api/remote/v1/plugins/enabled` | — | 已启用插件 |
| `/api/remote/v1/share` | — | 分享 |
| `/api/remote/v1/share/artifact` | — | 分享产物 |
| `/api/remote/v1/share/local_artifact` | — | 本地产物分享 |
| `/api/remote/v1/share/local_conversation` | — | 本地对话分享 |
| `/api/remote/v1/shared_artifacts` | — | 分享的产物列表 |
| `/api/remote/v1/shared_artifacts/publish` | — | 发布产物 |
| `/api/remote/v1/shared_artifacts/publish_status` | — | 发布状态 |
| `/api/remote/v1/my_space/artifacts` | — | 我的空间产物 |
| `/api/remote/v1/sub_sessions` | — | 子会话 |
| `/api/remote/v1/user/ssh_key` | — | 用户 SSH 密钥 |
| `/api/remote/v1/user/ssh_key/rotate` | — | 轮换 SSH 密钥 |
| `/api/remote/v1/user_rules` | — | 用户规则 |
| `/api/remote/v1/user_mentions/slash` | — | 用户提及 |
| `/api/remote/v1/slash_commands` | — | 斜杠命令 |
| `/api/remote/v1/webhooks` | — | Webhooks |
| `/api/remote/v1/events/ticket` | — | 事件票据 |
| `/api/remote/v1/events/ws` | — | WebSocket 事件 |
| `/api/remote/v1/explorer` | — | 文件浏览器 |
| `/api/remote/v1/global_search` | — | 全局搜索 |
| `/api/remote/v1/git/branch` | — | Git 分支 |
| `/api/remote/v1/git/branches` | — | Git 分支列表 |
| `/api/remote/v1/git/repositories` | — | Git 仓库 |
| `/api/remote/v1/git/token` | — | Git token |
| `/api/remote/v1/models` | — | 模型列表 |
| `/api/remote/v1/html2figma` | — | HTML 转 Figma |
| `/api/remote/v1/html2figma/multi` | — | 批量 HTML 转 Figma |
| `/api/remote/v1/file_converts/start` | — | 文件转换 |
| `/api/remote/v1/file_converts/upload_auth` | — | 文件转换上传凭证 |
| `/api/remote/v1/doc_metadata/batch` | — | 文档元数据批量获取 |
| `/api/remote/v1/frontier/access_key` | — | Frontier 访问密钥 |
| `/api/remote/v1/lark/documents/mention` | — | 飞书文档提及 |
| `/api/remote/v1/lark_directory/candidates` | — | 飞书通讯录候选人 |

**注意**：这些 `/api/remote/v1/*` 接口是 TRAE 远程开发环境（Cloudide）的后端 API，运行在云端容器中，认证方式可能不是标准的 JWT token。

---

## 十一、配置与运维（Configuration & Ops）

套餐配置、操作日志、更新检查。

| API | 认证 | 状态 | 用途 |
|---|---|---|---|
| `/trae/gtm/tob/api/v1/config/plan_attribute` | `Cloud-IDE-JWT` | 404 | 套餐属性（内部用） |
| `/trae/gtm/tob/api/v1/config/add_operation_log` | `Cloud-IDE-JWT` | 404 | 操作日志（内部用） |
| `/trae/gtm/tob/api/v1/config/get_network_proxy` | `Cloud-IDE-JWT` | 404 | 网络代理配置（内部用） |
| `/trae/gtm/tob/api/v1/package/check_update` | `Cloud-IDE-JWT` | 404 | 检查更新（内部用） |
| `/icube/api/v1/package/check_update` | `x-icube-token` | 404 | 检查更新 |
| `/icube/api/v1/release/note` | `x-icube-token` | 404 | 发布说明 |
| `/icube/api/v1/report/create` | `x-icube-token` | — | 创建举报 |
| `/icube/api/v1/report/token` | `x-icube-token` | ✅ | 获取举报 token（`stsToken` + `token`） |
| `/icube/api/v1/native/config/query` | `x-icube-token` | 404 | 原生配置查询 |
| `/icube/api/v1/mf/manifests` | `x-icube-token` | 404 | MF 清单 |

**注意**：GTM 系列全部 404，可能是内部运维接口或已迁移。

---

## 十二、设计与视觉（Design & Visual）

设计稿、组件库、IDE 视觉编辑器。

| API | 认证 | 用途 |
|---|---|---|
| `/api/remote/v1/design_libraries` | — | 设计库列表 |
| `/api/remote/v1/design_libraries/upload_credential` | — | 设计库上传凭证 |
| `/icube/api/v1/html2figma` | — | HTML 转 Figma |
| `/api/selectedElement` | — | 选中元素 |
| `/api/selectedText` | — | 选中文本 |
| `/api/visualEditorDomTree` | — | 可视化编辑器 DOM 树 |
| `/api/visualEditorDomOrderChange` | — | DOM 顺序变更 |
| `/api/visualEditorElementSelected` | — | 元素选中事件 |
| `/api/visualEditorNodeExpanded` | — | 节点展开事件 |
| `/api/saveElementText` | — | 保存元素文本 |

---

## 十三、IM 桥接（IM Bridge）

飞书/IM 消息桥接（扩展插件层）。

| API | 认证 | 用途 |
|---|---|---|
| `/oauth/v1/app/registration` | — | OAuth 应用注册 |
| `/oauth/v3/token` | — | OAuth token 交换 |
| `/open-apis/bot/v3/info` | — | 机器人信息 |
| `/open-apis/cardkit/v1/cards` | — | 卡片消息 |

---

## 十四、扩展市场（Extensions & Plugins）

插件/技能/Agent 的发布与管理。

| API | 认证 | 用途 |
|---|---|---|
| `/extensions/api/-/agent/batch-get` | — | 批量获取 Agent |
| `/extensions/api/-/agent/create-mcp-version` | — | 创建 MCP 版本 |
| `/extensions/api/-/agent/detail` | — | Agent 详情 |
| `/extensions/api/-/agent/direct-download` | — | Agent 直接下载 |
| `/extensions/api/-/agent/publish-mcp` | — | 发布 MCP |
| `/extensions/api/-/agent/record-download` | — | 记录下载 |
| `/extensions/api/-/agent/record-visit` | — | 记录访问 |
| `/extensions/api/-/agent/search` | — | 搜索 Agent |
| `/extensions/api/-/agent/unpublish-mcp` | — | 取消发布 MCP |
| `/extensions/api/-/plugin/categories` | — | 插件分类 |
| `/extensions/api/-/plugin/detail` | — | 插件详情 |
| `/extensions/api/-/plugin/list` | — | 插件列表 |
| `/extensions/api/-/plugin/recommended` | — | 推荐插件 |
| `/extensions/api/-/plugin/registries` | — | 插件注册表 |
| `/extensions/api/-/plugin/versions` | — | 插件版本 |
| `/extensions/api/-/skill/categories` | — | 技能分类 |
| `/extensions/api/-/skill/detail` | — | 技能详情 |
| `/extensions/api/-/skill/list` | — | 技能列表 |
| `/extensions/api/-/skill/list-v2` | — | 技能列表 V2 |
| `/extensions/api/-/skill/rebuild_all` | — | 重建所有技能 |

---

## 业务全景图

```
┌─────────────────────────────────────────────────────────────┐
│                    TRAE SOLO CN 业务架构                      │
├─────────────────────────────────────────────────────────────┤
│  ① 核心 IDE       → 远程环境、项目、MCP、技能、聊天会话         │
│  ② 账号体系       → 登录/设备绑定/OAuth/第三方集成              │
│  ③ 商业化         → 支付/套餐/权益/积分计费                   │
│  ④ 增长体系       → 每日签到/活动/裂变/邀请码                  │
│  ⑤ 内容生态       → 模板/素材/Agent 分享/展示案例             │
│  ⑥ 企业集成       → 飞书/Connector/Supabase/Vercel          │
│  ⑦ 运营配置       → 动态配置/特性开关/通知偏好                │
│  ⑧ 设计可视化     → HTML→Figma/设计库/可视化编辑器            │
│  ⑨ 扩展市场       → 插件/技能/Agent 发布与管理               │
│  ⑩ IM 桥接        → 飞书/企业消息桥接                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 对你当前凭证最有价值的接口

| 接口 | 价值 | 原因 |
|---|---|---|
| `CheckLogin` | ★★★★★ | 查看设备绑定状态 + 登录态 |
| `GetUserInfo` | ★★★★★ | 完整用户信息（头像、邮箱、手机等） |
| `ide_user_pay_status` | ★★★★☆ | 套餐/权益/计费模式 |
| `checkin_credits/*` | ★★★★☆ | 每日签到（已集成） |
| `ExchangeToken` | ★★★★☆ | token 续期（已集成） |
| `notifications/preferences` | ★★★☆☆ | 通知偏好设置 |
| `templates/*` + `showcase/*` | ★★★☆☆ | IDE 内容生态 |
| `GetFeishuPermissionTree` | ★★☆☆☆ | 飞书集成权限（仅企业用户） |

**403 的接口**（`GetUserAttribute`、`GetUserProfile`、GitHub 相关等）= SAAS/企业版账户权限，个人账户无法调用。

**404 的接口** = 已下线或迁移，不建议继续投入。

# TRAE SOLO CN — Complete API Reference

> Generated: 2026-08-22 | Method: Automated scan of 89 endpoints across 5 auth categories

## Summary

| Category | Total | OK | Need Params | Auth Fail | 404 | 5xx |
|---|---|---|---|---|---|---|
| **iCube** (`x-icube-token`) | 23 | 8 | 8 | 0 | 7 | 0 |
| **UG** (`Cloud-IDE-JWT` + `x-device-id`) | 17 | 2 | 12 | 0 | 0 | 0 |
| **Cloudide** (`x-cloudide-token`) | 36 | 7 | 2 | 19 | 0 | 2 |
| **GTM** | 4 | 0 | 0 | 0 | 4 | 0 |
| **Connector** | 9 | 1 | 0 | 8 | 0 | 0 |
| **TOTAL** | **89** | **18** | **22** | **27** | **11** | **2** |

---

## iCube APIs (auth: `x-icube-token: <JWT>`)

### ✅ Working

| API | Response Keys | Description |
|---|---|---|
| `/icube/api/v1/user` | `loginAllowed` | User validation (POST `{uid}`) |
| `/icube/api/v1/notifications/preferences` | `offers, tips, account, feedback` | Notification preferences |
| `/icube/api/v1/avatar/random` | `imageId, uri, url` | Random avatar |
| `/icube/api/v1/report/token` | `stsToken, token` | Report token (STS) |
| `/icube/api/v1/showcase/list` | `(array, 4 items)` | Showcase list |
| `/icube/api/v1/templates/list` | `items, next_page_token, total` | Template list (paginated) |
| `/icube/api/v1/templates/favorites` | `items, next_page_token, total` | Favorite templates |
| `/icube/api/v1/templates/scenes` | `(array, 9 items)` | Template scenes |

### ⚠️ Need Parameters (return validation errors without correct body)

| API | Required Params | Description |
|---|---|---|
| `/icube/api/v1/notifications/update_status` | `notificationIds`, `action` | Update notification status |
| `/icube/api/v1/share/agent/create` | `userId` (and others) | Create agent share |
| `/icube/api/v1/share/agent/get` | `shareCode` | Get agent share |
| `/icube/api/v1/showcase/preview` | `id` | Preview showcase |
| `/icube/api/v1/templates/detail` | `id` | Template detail |
| `/icube/api/v1/templates/favorite` | `case_id`, `action` | Favorite/unfavorite template |
| `/icube/api/v1/material/get_url` | (scene-specific) | Get material URL |
| `/icube/api/v1/material/getToken` | `scene` | Get material token |

### ❌ 404 (API removed or path changed)

| API | Notes |
|---|---|
| `/icube/api/v1/notifications/count` | Use preferences instead |
| `/icube/api/v1/notifications/list` | Use preferences instead |
| `/icube/api/v1/package/check_update` | Moved to `/trae/gtm/tob/api/v1/package/check_update` |
| `/icube/api/v1/release/note` | Removed |
| `/icube/api/v1/showcase/scenes` | Moved or removed |
| `/icube/api/v1/mf/manifests` | Removed |
| `/icube/api/v1/native/config/query` | Removed |

---

## UG APIs (auth: `Authorization: Cloud-IDE-JWT <token>` + `x-device-id: <did>`)

### ✅ Working

| API | Response Keys | Description |
|---|---|---|
| `/trae/api/v2/ug/checkin_credits/status` | `checked_in, code, credits, enable, message` | Daily check-in status |
| `/trae/api/v2/ug/checkin_credits/claim` | `code, message` | Claim daily credits |

### ⚠️ Return Data Without Correct Params (read-only queries)

| API | Response Keys | Description |
|---|---|---|
| `/trae/api/v2/ug/activity/info` | `commercial_activities` | Commercial activities list |
| `/trae/api/v2/pay/ide_user_ent_usage` | `is_credits_billing, is_dollar_usage_billing, is_pay_freshman, trial_status, user_entitlement_pack_list` | User entitlement usage |
| `/trae/api/v2/pay/ide_user_pay_status` | `client_reminder, commercial_activities, detail, enable_fission, enable_solo_builder, enable_solo_coder, enable_solo_lite, enable_solo_web, is_credits_billing, is_dollar_usage_billing, is_new_user_switch, is_pay_freshman, is_pay_freshman_v2_deprecated, is_support_commercialization, server_time_ms` | Full pay status |
| `/trae/api/v2/pay/switch_cn_billing_version` | `(empty)` | Billing version info |
| `/trae/api/v1/pay/ide_user_ent_usage` | `is_dollar_usage_billing, is_pay_freshman, trial_status, user_entitlement_pack_list` | V1 entitlement usage |
| `/trae/api/v1/pay/ide_user_pay_status` | `commercial_activities, detail, enable_fission, enable_solo_builder, enable_solo_coder, enable_solo_lite, enable_solo_web, is_credits_billing, is_dollar_usage_billing, is_pay_freshman, is_pay_freshman_v2, is_support_commercialization, server_time_ms, solo_fission_expire_time, solo_fission_max_usage` | V1 pay status |

### ❌ Need Specific Conditions (business logic errors)

| API | Error | Notes |
|---|---|---|
| `/trae/api/v2/ug/activity/action` | code=4001 invalid params | Need valid `activity_id` |
| `/trae/api/v2/ug/work_fission/grant` | code=4001 invalid params | Need valid params |
| `/trae/api/v2/pay/grant_work_benefit` | code=9069 "活动暂不可用" | Activity unavailable |
| `/trae/api/v2/pay/report_work_click` | code=9069 "活动暂不可用" | Activity unavailable |
| `/trae/api/v1/pay/claim_birthday_bonus` | code=9019 "not the time" | Time-limited |
| `/trae/api/v1/pay/create_order` | code=9004 | Need plan/price params |
| `/trae/api/v1/pay/get_invite_code` | code=9019 | Need invite eligibility |
| `/trae/api/v1/pay/redeem_invite_code` | code=9030 "invalid" | Need valid code |
| `/trae/api/v1/pay/unfollow_plan` | `(empty)` | Need plan params |

---

## Cloudide APIs (auth: `x-cloudide-token: <JWT>`)

### ✅ Working

| API | Response Keys | Description |
|---|---|---|
| `/cloudide/api/v3/trae/GetUserInfo` | `AIRegion, AvatarUrl, Description, Gender, LastLoginTime, LastLoginType, MigrateToSG, NonPlainTextEmail, NonPlainTextMobile, Region, RegisterTime, ScreenName, TenantID, UserID, UtmInfo` | Full user profile |
| `/cloudide/api/v3/trae/CheckLogin` | `AIHost, AIPayHost, AIRegion, BoundDeviceID, DeviceBindStatus, ExpiredAt, Host, IsLogin, MigrateToSG, NickNameEditStatus, PasswordChanged, Region, UserID` | Login status + device binding |
| `/cloudide/api/v3/trae/CheckPay` | `Pass, CountryCode` | Payment check |
| `/cloudide/api/v3/trae/GetUserEmailSuffix` | `EmailSuffix` | Email suffix |
| `/cloudide/api/v3/trae/GetUserSupabaseToken` | `(array, 0 items)` | Supabase tokens |
| `/cloudide/api/v3/trae/GetUserVercelToken` | `TeamId, Token` | Vercel token |
| `/cloudide/api/v3/trae/oauth/GetRefreshToken` | `RefreshExpireAt, RefreshToken` | Get refresh token info |

### ⚠️ Partial / No Params

| API | Status | Notes |
|---|---|---|
| `/cloudide/api/v3/trae/Logout` | 200 but error | Need correct body |
| `/cloudide/api/v3/trae/Delete` | 200 but error | Need correct body |

### 🔒 403 code=10303 (SAAS-only or different auth tier)

These require a SAAS/commercial account type, not individual TRAE accounts:

| API | Description |
|---|---|
| `/cloudide/api/v3/trae/CheckAddress` | Address check |
| `/cloudide/api/v3/trae/CheckAddressWeb` | Web address check |
| `/cloudide/api/v3/trae/GetUserSupabaseOrg` | Supabase org |
| `/cloudide/api/v3/trae/GetUserGitHubToken` | GitHub token |
| `/cloudide/api/v3/trae/MarkUser` | Mark user |
| `/cloudide/api/v3/trae/SaveUserNickNameStatus` | Nickname status |
| `/cloudide/api/v3/trae/RenewSession` | Renew session |
| `/cloudide/api/v3/trae/oauth/GetAuthorizedClient` | OAuth clients |
| `/cloudide/api/v3/common/GetUserAttribute` | User attributes |
| `/cloudide/api/v3/common/GetUserProfile` | User profile |
| `/cloudide/api/v3/common/SaveUserAttribute` | Save attributes |
| `/cloudide/api/v3/common/UpdateUserProfile` | Update profile |
| `/cloudide/api/v3/trae/github/CheckAuthorization` | GitHub auth check |
| `/cloudide/api/v3/trae/github/GetAccessToken` | GitHub token |
| `/cloudide/api/v3/trae/github/UpdateAccessToken` | Update GitHub token |
| `/cloudide/api/v3/trae/SetUserSupabaseToken` | Set Supabase token |
| `/cloudide/api/v3/trae/SetUserVercelToken` | Set Vercel token |
| `/cloudide/api/v3/trae/risk_control/WaitList` | Risk control waitlist |

### 🔒 401 code=20101 / 500 code=10000

| API | Status | Notes |
|---|---|---|
| `/cloudide/api/v3/trae/Login` | 401 | OAuth login flow |
| `/cloudide/api/v3/trae/GetUserStasticData` | 500 | Server error |
| `/cloudide/api/v3/trae/GetJSAPITicket` | 500 | Server error |
| `/cloudide/api/v3/trae/GetThirdPartyToken` | 400 | Need third-party provider |
| `/cloudide/api/v3/trae/DisconnectThirdPartyToken` | 400 | Need provider |
| `/cloudide/api/v3/trae/SetThirdPartyToken` | 400 | Need provider |
| `/cloudide/api/v3/trae/terms/get` | 400 | Need params |

---

## Connector APIs (auth: `Authorization: Cloud-IDE-JWT <token>`)

### ✅ Working

| API | Response Keys | Description |
|---|---|---|
| `/trae/api/v3/GetFeishuPermissionTree` | `(array, 14 items)` | Feishu permission tree |

### 🔒 401 code=20310 (Connector-specific auth)

| API | Description |
|---|---|
| `/trae/api/v3/GetConnectorConnection` | Connector connection status |
| `/trae/api/v3/ListConnectorConnections` | List all connections |
| `/trae/api/v3/ListConnectorInterfaces` | List connector interfaces |
| `/trae/api/v3/DisconnectConnector` | Disconnect connector |
| `/trae/api/v3/ResolveConnectorToken` | Resolve connector token |
| `/trae/api/v3/SetConnectorToken` | Set connector token |
| `/trae/api/v3/connector/auth/poll` | Poll auth status |
| `/trae/api/v3/connector/oauth/start` | Start OAuth flow |

---

## GTM APIs (auth: `Authorization: Cloud-IDE-JWT <token>`)

### ❌ All 404

| API | Notes |
|---|---|
| `/trae/gtm/tob/api/v1/config/plan_attribute` | Moved or internal-only |
| `/trae/gtm/tob/api/v1/config/add_operation_log` | Internal-only |
| `/trae/gtm/tob/api/v1/config/get_network_proxy` | Internal-only |
| `/trae/gtm/tob/api/v1/package/check_update` | Internal-only |

---

## Auth Header Reference

| Header | Value Format | Used By |
|---|---|---|
| `x-icube-token` | `<JWT access token>` | All `/icube/api/*` |
| `Authorization` | `Cloud-IDE-JWT <JWT>` | All `/trae/api/v2/ug/*`, `/trae/api/v2/pay/*`, `/trae/api/v3/*` |
| `x-device-id` | `<device UUID>` | UG + Pay APIs (alongside Authorization) |
| `x-cloudide-token` | `<JWT access token>` | All `/cloudide/api/*` |
| `Content-Type` | `application/json` | All POST APIs |

---

## Error Codes

| Code | Meaning |
|---|---|
| `0` | Success (UG/iCube APIs) |
| `200` | Success (alternative) |
| `4001` | Invalid parameters (UG action APIs) |
| `9019` | Not eligible / not time (birthday bonus, invite code) |
| `9030` | Invalid invite code |
| `9069` | Activity unavailable |
| `10000` | Server internal error (cloudide) |
| `10101` | Missing/invalid params (cloudide) |
| `10303` | Permission denied (SAAS-only feature) |
| `20101` | Unauthorized / login required |
| `20310` | Connector auth required |
| `20403` | Device not match (ExchangeToken) |
| `20405` | Device proof required (ExchangeToken) |

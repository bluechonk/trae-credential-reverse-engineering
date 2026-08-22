# TRAE SOLO CN — Credential Reverse Engineering

[English](README.md) | [中文](README_zh.md)

Systematic reverse engineering of the **TRAE SOLO CN** (TraeWork CN) desktop client credential storage on Windows.

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)
![Tests](https://img.shields.io/badge/tests/18-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-yellow)

</div>

## Results

| Metric | Value |
|---|---|
| **Decryption** | 4/4 credential entries (100%) |
| **API endpoints discovered** | 98 TRAE-specific paths (356 total) |
| **APIs successfully called** | 18 working + 22 need params |
| **Token refresh** | Full ECDSA P-256 device-proof flow |
| **Daily check-in** | Status query + claim |
| **Test coverage** | 18/18 passing |

## Quick Start

```bash
npm install
npm run phase6          # Decryption & validation
npm run dev -- checkin  # Daily check-in
npm run dev -- refresh  # Rotate token (close TRAE first!)
npx vitest run          # 18/18 passing
```

## Pipeline

| Phase | Goal | Key Finding |
|---|---|---|
| 1. Reconnaissance | Framework/Version/Data dirs | Electron + VS Code fork, unpacked dir |
| 2. Data Collection | Locate credential storage | `storage.json` in `globalStorage/` |
| 3. Format Analysis | Entropy & magic bytes | Custom byteCrypto envelope (not DPAPI) |
| 4. Encryption ID | Find crypto code | `out/main.js` byteCrypto module |
| 5. Key Extract | Get pepper tables | 4x 64B tables at `,Em=async t=>` anchor |
| 6. Decrypt & Validate | Decrypt + API test | 4/4 decrypted, `loginAllowed:true` |

## API Discovery (89 endpoints tested)

| Category | Auth Header | Working | Total |
|---|---|---|---|
| **iCube** | `x-icube-token` | 8 | 23 |
| **UG/Growth** | `Cloud-IDE-JWT` + `x-device-id` | 2 | 17 |
| **Cloudide** | `x-cloudide-token` | 7 | 36 |
| **Connector** | `Cloud-IDE-JWT` | 1 | 9 |
| **GTM** | `Cloud-IDE-JWT` | 0 | 4 |

### Business Domains (14 categories)

```
① Core IDE     → Remote envs, projects, MCP, skills, chat sessions
② Account      → Login, device binding, OAuth, third-party integrations
③ Payment      → Billing, plans, entitlements, token refresh
④ Growth       → Daily check-in, activities, fission, invite codes
⑤ Content      → Templates, materials, agent sharing
⑥ Enterprise   → Feishu/Connector/Supabase/Vercel
⑦ Operations   → Dynamic config, feature flags, notifications
⑧ Design       → HTML→Figma, design libraries, visual editor
⑨ Extensions   → Plugins, skills, agent marketplace
⑩ IM Bridge    → Feishu/messaging integration
```

## Key Findings

### byteCrypto Envelope
```
Offset  Length  Content
0       6       header = 74 63 05 10 00 00 ("tc" + ver5 + 0x10)
6       32      random (crypto.getRandomValues)
38      n*16    AES-128-CBC(key, iv, SHA512(plaintext) || plaintext)
```

Key derivation: `pepper = Vie[i] ^ Qie[i]` → `derived = SHA512(SHA512(random) || pepper)` → `key = derived[0:16], iv = derived[16:32]`

### ExchangeToken (Token Refresh)
```json
{
  "ClientID": "en1oxy7wnw8j9n",
  "RefreshToken": "<current>",
  "DeviceInfo": { "DeviceID": "...", "PlatformCode": "SOLO_PC", ... },
  "DeviceProof": {
    "Signature": "<ECDSA P-256 SHA-256 base64>",
    "Timestamp": "<unix seconds>",
    "Nonce": "<32 hex chars>"
  }
}
```

Signature payload: `"POST\n/trae/api/v3/oauth/ExchangeToken\n<ClientID>\n<RefreshToken>\n<Timestamp>\n<Nonce>"`

> **3 bugs found**: `x-cloudide-token` must be empty, `DeviceProof` fields must be PascalCase, `DeviceInfo` fingerprint must match enrollment.

### Working APIs (18)

**iCube**: `user`, `notifications/preferences`, `avatar/random`, `report/token`, `showcase/list`, `templates/list`, `templates/favorites`, `templates/scenes`

**UG**: `checkin_credits/status`, `checkin_credits/claim`

**Cloudide**: `GetUserInfo`, `CheckLogin`, `CheckPay`, `GetUserEmailSuffix`, `GetUserSupabaseToken`, `GetUserVercelToken`, `oauth/GetRefreshToken`

**Connector**: `GetFeishuPermissionTree`

## Project Structure

```
src/
├── index.ts                          ← CLI (7 commands)
├── phase1-reconnaissance/index.ts
├── phase2-data-collection/index.ts
├── phase3-format-analysis/index.ts
├── phase4-encryption-id/
├── phase5-key-extraction/
├── phase6-decryption/
│   ├── byteCrypto.ts                 ← Core: envelope + tables
│   ├── traeClient.ts                 ← ExchangeToken + check-in client
│   ├── flows.ts                      ← checkin/refresh orchestration
│   ├── decryptTraeAuth.ts            ← Batch decryption
│   └── validate.ts                   ← API validation
└── utils/entropy.ts|magic.ts

docs/                                   ← All documentation (masked)
output/                                 ← Sensitive data (gitignore)
scripts/                                ← Utility scripts (12)
tests/                                  ← 18 tests
```

## Documentation

| Document | Content |
|---|---|
| `docs/FINDINGS.md` | Full algorithm analysis (byteCrypto, ExchangeToken, check-in) |
| `docs/FLOW.md` | Complete process walkthrough |
| `docs/phase6-decryption/API-REFERENCE.md` | 89 API endpoints tested with auth details |
| `docs/phase6-decryption/API-DOMAINS.md` | 14 business domain categories |
| `docs/phase1~6-*/RUN-LOG.md` | Per-phase execution logs |
| `docs/README.md` | Masking conventions & folder status |

## Security Notes

- All sensitive values in docs are masked per `docs/README.md` convention
- Raw credentials live in `output/` (gitignored)
- Token refresh rotates the refreshToken — close TRAE before running `refresh`
- This project is for **security research on your own machine and credentials only**

## License

MIT

# TRAE SOLO CN — Credential Reverse Engineering

[English](README.md) | [中文](README_zh.md)

Systematic reverse engineering of the **TRAE SOLO CN** (TraeWork CN) desktop client credential storage on Windows.

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
# Install
npm install

# Run reverse engineering pipeline
npm run phase1          # Reconnaissance
npm run phase2          # Data collection
npm run phase3          # Entropy & magic analysis
npm run phase4          # Encryption identification
npm run phase5          # Key extraction (runtime table extraction)
npm run phase6          # Decryption & validation

# Functional commands
npm run dev -- validate # Validate credential against live API
npm run dev -- checkin  # Daily check-in: status → claim → verify
npm run dev -- refresh  # Rotate token via refreshToken (close TRAE first!)

# Test
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

## Documentation

| Document | Content |
|---|---|
| `docs/FINDINGS.md` | Full algorithm analysis (byteCrypto, ExchangeToken, check-in) |
| `docs/FLOW.md` | Complete process walkthrough |
| `docs/phase6-decryption/API-REFERENCE.md` | **89 API endpoints tested** with auth details |
| `docs/phase1~6-*/RUN-LOG.md` | Per-phase execution logs |
| `docs/README.md` | Masking conventions & folder status |

## API Categories (auth headers)

| Category | Auth Header | Working | Total |
|---|---|---|---|
| **iCube** | `x-icube-token` | 8 | 23 |
| **UG/Growth** | `Cloud-IDE-JWT` + `x-device-id` | 2 | 17 |
| **Cloudide** | `x-cloudide-token` | 7 | 36 |
| **Connector** | `Cloud-IDE-JWT` | 1 | 9 |
| **GTM** | `Cloud-IDE-JWT` | 0 | 4 |

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

## Security Notes

- All sensitive values in docs are masked per `docs/README.md` convention
- Raw credentials live in `output/` (gitignored)
- Token refresh rotates the refreshToken — close TRAE before running `refresh`
- This project is for **security research on your own machine and credentials only**

## License

MIT

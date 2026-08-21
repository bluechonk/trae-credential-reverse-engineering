# TRAE Desktop Credential Reverse Engineering

[English](README.md) | [中文](README_zh.md)

A systematic methodology for reverse engineering the local credential storage of the TraeWork CN desktop client on Windows.

## Table of Contents

- [Phase 1: Reconnaissance](#phase-1-reconnaissance)
- [Phase 2: Data Collection](#phase-2-data-collection)
- [Phase 3: Format Analysis](#phase-3-format-analysis)
- [Phase 4: Encryption Identification](#phase-4-encryption-identification)
- [Phase 5: Key Extraction](#phase-5-key-extraction)
- [Phase 6: Decryption and Validation](#phase-6-decryption-and-validation)
- [References](#references)

---

## Phase 1: Reconnaissance

**Goal: Understand the target application.**

The target is **TraeWork CN** (also known as TRAE SOLO CN), a desktop IDE client. Before touching any file, establish a baseline understanding of the application stack:

1. **Identify the framework.** Check the installation directory for framework signatures:
   - Electron: look for `electron.exe`, `resources/app.asar`, `chrome_elf.dll`
   - Qt: look for `Qt5Core.dll`, `Qt5Gui.dll`
   - .NET: look for `clr.dll`, `.exe` with .NET headers
   - Native Win32: no framework DLLs, direct system calls

2. **Document the version.** Note the exact build number, update channel, and release date. Encryption schemes can change between versions.

3. **Map the surface area.** Understand what the application does after login — network requests, local caching, background sync — to anticipate where credentials might be stored or reused.

**Key question:** What technology stack does the client use, and where does that stack typically persist data?

---

## Phase 2: Data Collection

**Goal: Locate where credentials are stored.**

### Directory Search

Search the standard application data paths:

```
%APPDATA%\                    # Roaming data (syncs across domain)
%LOCALAPPDATA%\               # Local data (machine-specific)
%PROGRAMDATA%\                # Machine-wide settings
%USERPROFILE%\Documents%\     # User documents
```

For Electron applications, the most common locations are:

```
%APPDATA%\TraeWork CN\
%APPDATA%\TraeWork CN\User\globalStorage\
%APPDATA%\TraeWork CN\Local Storage\
%APPDATA%\TraeWork CN\Session Storage\
%APPDATA%\TraeWork CN\Cookies\
%APPDATA%\TraeWork CN\Local Storage\leveldb\
```

### Before/After Comparison

This is the most reliable method to find the data directory:

1. **Before login**: Export a recursive directory listing:
   ```powershell
   Get-ChildItem "$env:APPDATA\TraeWork CN" -Recurse -Force | Select-Object FullName, Length, LastWriteTime | Export-Csv before.csv
   ```

2. **Log in** to the desktop client.

3. **After login**: Export again:
   ```powershell
   Get-ChildItem "$env:APPDATA\TraeWork CN" -Recurse -Force | Select-Object FullName, Length, LastWriteTime | Export-Csv after.csv
   ```

4. **Diff** the two listings:
   ```powershell
   Compare-Object (Import-Csv before.csv) (Import-Csv after.csv) -Property FullName
   ```

### Target File Types

Prioritize files by likelihood of containing credentials:

| Priority | Extensions | Reason |
|---|---|---|
| High | `.json`, `.dat`, `.config` | Structured credential storage |
| High | `.db`, `.sqlite` | Database storage (Chromium localStorage) |
| Medium | `.ini`, `.cfg`, `.xml` | Configuration files with account info |
| Medium | `.log` | May leak tokens in debug output |
| Low | `.bin`, `.dat` (high entropy) | Encrypted blobs |

---

## Phase 3: Format Analysis

**Goal: Determine the format and encryption state of each file.**

### Header Analysis

Read the first 64 bytes of each file and compare against known magic bytes:

| Magic Bytes | Format |
|---|---|
| `7B 22` (`{"`) | JSON |
| `5B 7B` (`[{`) | JSON array |
| `53 51 4C 69 74 65 20 66 6F 72 6D 61 74 20 33 00` | SQLite |
| `89 50 4E 47 0D 0A 1A 0A` | PNG (resource file) |
| `FF D8 FF` | JPEG (resource file) |
| `00 00 00` + printable | Possible BOM + text |
| High entropy, no pattern | Encrypted or compressed |

### Entropy Analysis

Calculate Shannon entropy to distinguish encryption from plaintext:

```
Entropy > 7.5 bits/byte  → Strong encryption (AES) or compression
Entropy 5.0 - 7.5        → Weak encryption, encoding, or mixed content
Entropy < 5.0            → Plaintext or simple substitution
```

### Tooling

```powershell
# Quick hex dump of first 64 bytes
Format-Hex -Path "file.dat" -Count 64

# Check if file is valid JSON
try { Get-Content "file.json" | ConvertFrom-Json | Out-Null; "Valid JSON" } catch { "Not JSON" }

# Check if file is SQLite
$bytes = [byte[]](Get-Content "file.db" -Encoding Byte -TotalCount 16)
$header = [System.Text.Encoding]::ASCII.GetString($bytes)
if ($header -like "SQLite format*") { "SQLite" }
```

---

## Phase 4: Encryption Identification

**Goal: Determine what encryption algorithm is used.**

### Static Analysis

For Electron applications, the client logic is typically bundled as an ASAR archive:

1. **Extract the ASAR:**
   ```bash
   npx asar extract resources/app.asar ./app-decompiled
   ```

2. **Search for cryptographic indicators:**
   ```bash
   # Node.js crypto
   grep -r "createCipheriv\|createDecipher\|createCipher" .
   grep -r "aes-128-cbc\|aes-256-cbc\|aes-128-gcm\|aes-256-gcm" .
   grep -r "crypto\.createHash\|crypto\.createHmac" .

   # Third-party libraries
   grep -r "CryptoJS\|node-forge\|sjcl\|tweetnacl" .
   ```

3. **Search for credential-related strings:**
   ```bash
   grep -r "token\|refreshToken\|authInfo\|credential" .
   grep -r "deviceId\|machineId\|userId\|privateKey" .
   grep -r "encrypt\|decrypt\|cipher\|secret\|key\|iv" .
   ```

4. **Identify key derivation functions:**
   ```bash
   grep -r "pbkdf2\|scrypt\|hkdf\|sha512\|sha256" .
   ```

### Dynamic Analysis

When static analysis is obstructed by minification or bundling, use runtime instrumentation:

**Frida hook on Node.js crypto:**

```javascript
// hook-crypto.js
const crypto = require('crypto');
const origCreateCipheriv = crypto.createCipheriv;
const origCreateDecipheriv = crypto.createDecipheriv;

crypto.createCipheriv = function(algorithm, key, iv) {
    console.log('[Cipheriv] algorithm:', algorithm);
    console.log('[Cipheriv] key:', key.toString('hex'));
    console.log('[Cipheriv] iv:', iv ? iv.toString('hex') : 'null');
    return origCreateCipheriv.call(this, algorithm, key, iv);
};

crypto.createDecipheriv = function(algorithm, key, iv) {
    console.log('[Decipheriv] algorithm:', algorithm);
    console.log('[Decipheriv] key:', key.toString('hex'));
    console.log('[Decipheriv] iv:', iv ? iv.toString('hex') : 'null');
    return origCreateDecipheriv.call(this, algorithm, key, iv);
};
```

**Frida hook on OpenSSL (for native modules):**

```javascript
// hook-openssl.js
const EVP_CipherInit_ex = Module.findExportByName(null, 'EVP_CipherInit_ex');
Interceptor.attach(EVP_CipherInit_ex, {
    onEnter: function(args) {
        console.log('cipher:', args[1].readPointer().readUtf8String());
        console.log('key:', args[3].readByteArray(16));
        console.log('iv:', args[4].readByteArray(16));
    }
});
```

**Workflow:**

1. Launch the desktop client
2. Attach Frida: `frida -n "TraeWork.exe" -f hook-crypto.js`
3. Trigger a login or credential refresh
4. Capture the algorithm, key, and IV from console output

---

## Phase 5: Key Extraction

**Goal: Obtain the encryption keys.**

### Strategy 1: Hardcoded Keys

Search the decompiled code for byte arrays, hex strings, or base64-encoded key material:

```javascript
// Look for patterns like:
const key = Buffer.from([0x12, 0x34, 0x56, ...]);  // byte array
const key = Buffer.from("base64encoded==", "base64");  // base64
const key = "0x1234567890abcdef";  // hex string
```

The key material often appears near the encryption/decryption functions or in a dedicated "config" or "constants" module.

### Strategy 2: Derived Keys

If the key is derived at runtime:

1. Identify the derivation function (PBKDF2, SHA-512, HMAC, etc.)
2. Trace the inputs: password, salt, iteration count
3. Reproduce the derivation in your own code

### Strategy 3: Runtime Extraction

Use dynamic instrumentation to extract keys at the moment of decryption:

- Hook the decryption function and dump the `key` and `iv` arguments
- For OpenSSL, break on `AES_set_decrypt_key` or `EVP_CipherInit_ex`
- For Windows CryptoAPI, break on `CryptDeriveKey` or `CryptDecrypt`

### Strategy 4: Memory Dump

1. Let the application decrypt data in memory
2. Dump the process memory: `procdump -ma <pid>`
3. Search for AES key schedules (128-bit or 256-bit patterns)
4. Search for known plaintext patterns (JWT `eyJ` header, JSON `{`)

### Strategy 5: Known-Plaintext Attack

If you know part of the plaintext (e.g., JSON starts with `{`, JWT starts with `eyJ`):

1. XOR the known plaintext with the ciphertext to recover the key stream
2. For AES-CBC, use the first block to derive the IV if the key is known
3. For simple XOR, the key stream repeats if the key is shorter than the data

---

## Phase 6: Decryption and Validation

**Goal: Decrypt the data and verify correctness.**

### Integrity Verification

Many envelope formats include a digest for verification:

```
[IV (16 bytes)][encrypted data][optional padding]
```

Or:

```
[HEADER][randomKey][AES-CBC(SHA512(payload) + payload)]
```

If the envelope includes a SHA-512 digest, verify:

```javascript
const expectedDigest = plaintext.subarray(0, 64);
const payload = plaintext.subarray(64);
const actualDigest = sha512(payload);
if (timingSafeEqual(expectedDigest, actualDigest)) {
    // Integrity verified
}
```

### Functional Validation

The ultimate test is whether the decrypted credential actually works:

1. Parse the decrypted JSON
2. Extract the `token` or `access_token`
3. Call the application's API with the token:
   ```bash
   curl -H "Authorization: Bearer <token>" https://api.trae.ai/v1/user/info
   ```
4. A successful response (HTTP 200) confirms the credential is valid

---

## Summary: Recommended Workflow

```
Reconnaissance (identify framework)
        ↓
Data Collection (before/after diff)
        ↓
Format Analysis (entropy + magic bytes)
        ↓
Static Analysis (extract ASAR, search strings)
        ↓
Dynamic Analysis (Frida hook if static fails)
        ↓
Key Extraction (hardcoded → derived → runtime)
        ↓
Decryption + Validation (integrity check + API call)
```

**Core principle:** Work from the data endpoint backward. Find where credentials are stored, determine their format, locate the code that processes that format, and extract the keys from that code.

---

## References

- [Frida](https://frida.re/) — Dynamic instrumentation toolkit
- [Ghidra](https://ghidra-sre.org/) — NSA reverse engineering framework
- [IDA Pro](https://hex-rays.com/ida-pro/) — Disassembler and debugger
- [Electron ASAR](https://github.com/electron/asar) — Electron archive format
- [Node.js crypto](https://nodejs.org/api/crypto.html) — Node.js cryptographic API
- [OpenSSL](https://www.openssl.org/) — Cryptography library commonly used by Electron apps

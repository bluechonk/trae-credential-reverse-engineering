# TRAE 桌面客户端本地凭证逆向工程

[English](README.md) | [中文](README_zh.md)

对 Windows 上 TraeWork CN 桌面客户端本地凭证存储的系统性逆向工程方法论。

## 目录

- [阶段一：侦察](#阶段一侦察)
- [阶段二：数据收集](#阶段二数据收集)
- [阶段三：格式分析](#阶段三格式分析)
- [阶段四：加密算法识别](#阶段四加密算法识别)
- [阶段五：密钥提取](#阶段五密钥提取)
- [阶段六：解密与验证](#阶段六解密与验证)
- [参考资料](#参考资料)

---

## 阶段一：侦察

**目标：了解目标应用。**

目标是 **TraeWork CN**（也称 TRAE SOLO CN），一款桌面 IDE 客户端。在触碰任何文件之前，先建立对应用栈的基本认知：

1. **识别技术框架。** 检查安装目录中的框架特征：
   - Electron：查找 `electron.exe`、`resources/app.asar`、`chrome_elf.dll`
   - Qt：查找 `Qt5Core.dll`、`Qt5Gui.dll`
   - .NET：查找 `clr.dll`、带 .NET 头的 `.exe`
   - 原生 Win32：无框架 DLL，直接系统调用

2. **记录版本信息。** 记录精确的版本号、更新渠道、发布日期。加密方案可能随版本变化。

3. **梳理攻击面。** 理解应用登录后的行为——网络请求、本地缓存、后台同步——以预判凭证可能在哪里存储或复用。

**核心问题：** 客户端使用了什么技术栈，该栈通常在哪里持久化数据？

---

## 阶段二：数据收集

**目标：定位凭据存储位置。**

### 目录搜索

搜索标准的应用数据路径：

```
%APPDATA%\                    # 漫游数据（跨域同步）
%LOCALAPPDATA%\               # 本地数据（机器特定）
%PROGRAMDATA%\                # 机器范围设置
%USERPROFILE%\Documents%\     # 用户文档
```

对于 Electron 应用，最常见的位置是：

```
%APPDATA%\TraeWork CN\
%APPDATA%\TraeWork CN\User\globalStorage\
%APPDATA%\TraeWork CN\Local Storage\
%APPDATA%\TraeWork CN\Session Storage\
%APPDATA%\TraeWork CN\Cookies\
%APPDATA%\TraeWork CN\Local Storage\leveldb\
```

### 登录前后对比

这是定位数据目录最可靠的方法：

1. **登录前**：导出递归目录列表：
   ```powershell
   Get-ChildItem "$env:APPDATA\<AppName>" -Recurse -Force | Select-Object FullName, Length, LastWriteTime | Export-Csv before.csv
   ```

2. **登录**桌面客户端。

3. **登录后**：再次导出：
   ```powershell
   Get-ChildItem "$env:APPDATA\<AppName>" -Recurse -Force | Select-Object FullName, Length, LastWriteTime | Export-Csv after.csv
   ```

4. **对比**两份列表，找出新增、修改或删除的文件。

### 目标文件类型

按凭据存储的可能性排序：

| 优先级 | 扩展名 | 原因 |
|---|---|---|
| 高 | `.json`、`.dat`、`.config` | 结构化凭证存储 |
| 高 | `.db`、`.sqlite` | 数据库存储（Chromium localStorage） |
| 中 | `.ini`、`.cfg`、`.xml` | 含账号信息的配置文件 |
| 中 | `.log` | 调试输出可能泄漏 token |
| 低 | `.bin`、`.dat`（高熵） | 加密数据块 |

---

## 阶段三：格式分析

**目标：确定每个文件的格式和加密状态。**

### 文件头分析

读取每个文件的前 64 字节，与已知的魔数对比：

| 魔数 | 格式 |
|---|---|
| `7B 22` (`{"`) | JSON |
| `5B 7B` (`[{`) | JSON 数组 |
| `53 51 4C 69 74 65 20 66 6F 72 6D 61 74 20 33 00` | SQLite |
| `89 50 4E 47 0D 0A 1A 0A` | PNG（资源文件） |
| `FF D8 FF` | JPEG（资源文件） |
| `00 00 00` + 可打印字符 | 可能的 BOM + 文本 |
| 高熵、无规律 | 加密或压缩 |

### 熵值分析

计算香农熵以区分加密与明文：

```
熵值 > 7.5 bits/byte  → 强加密（AES）或压缩
熵值 5.0 - 7.5        → 弱加密、编码或混合内容
熵值 < 5.0            → 明文或简单替换
```

### 工具

```powershell
# 快速查看前 64 字节十六进制
Format-Hex -Path "file.dat" -Count 64

# 检查是否为合法 JSON
try { Get-Content "file.json" | ConvertFrom-Json | Out-Null; "合法 JSON" } catch { "非 JSON" }

# 检查是否为 SQLite
$bytes = [byte[]](Get-Content "file.db" -Encoding Byte -TotalCount 16)
$header = [System.Text.Encoding]::ASCII.GetString($bytes)
if ($header -like "SQLite format*") { "SQLite" }
```

---

## 阶段四：加密算法识别

**目标：确定使用了什么加密算法。**

### 静态分析

对于 Electron 应用，客户端逻辑通常打包为 ASAR 归档：

1. **解包 ASAR：**
   ```bash
   npx asar extract resources/app.asar ./app-decompiled
   ```

2. **搜索加密相关字符串：**
   ```bash
   # Node.js crypto
   grep -r "createCipheriv\|createDecipher\|createCipher" .
   grep -r "aes-128-cbc\|aes-256-cbc\|aes-128-gcm\|aes-256-gcm" .
   grep -r "crypto\.createHash\|crypto\.createHmac" .

   # 第三方库
   grep -r "CryptoJS\|node-forge\|sjcl\|tweetnacl" .
   ```

3. **搜索凭据相关字符串：**
   ```bash
   grep -r "token\|refreshToken\|authInfo\|credential" .
   grep -r "deviceId\|machineId\|userId\|privateKey" .
   grep -r "encrypt\|decrypt\|cipher\|secret\|key\|iv" .
   ```

4. **搜索密钥派生函数：**
   ```bash
   grep -r "pbkdf2\|scrypt\|hkdf\|sha512\|sha256" .
   ```

### 动态分析

当静态分析被混淆或打包阻碍时，使用运行时插桩：

**Frida hook Node.js crypto：**

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

**Frida hook OpenSSL（用于原生模块）：**

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

**工作流程：**

1. 启动桌面客户端
2. 附加 Frida：`frida -n "TraeWork.exe" -f hook-crypto.js`
3. 触发登录或凭证刷新
4. 从控制台输出捕获算法、密钥和 IV

---

## 阶段五：密钥提取

**目标：获取加密密钥。**

### 策略一：硬编码密钥

在反编译的代码中搜索 byte array、hex string 或 base64 编码的密钥材料：

```javascript
// 寻找类似模式：
const key = Buffer.from([0x12, 0x34, 0x56, ...]);  // 字节数组
const key = Buffer.from("base64encoded==", "base64");  // base64
const key = "0x1234567890abcdef";  // hex 字符串
```

密钥材料通常出现在加密/解密函数附近，或集中在专门的 "config" / "constants" 模块中。

### 策略二：派生密钥

如果密钥是运行时派生的：

1. 识别派生函数（PBKDF2、SHA-512、HMAC 等）
2. 追踪输入：password、salt、iteration count
3. 在自己的代码中复现派生过程

### 策略三：运行时提取

使用动态插桩在解密瞬间提取密钥：

- hook 解密函数，dump `key` 和 `iv` 参数
- 对于 OpenSSL，在 `AES_set_decrypt_key` 或 `EVP_CipherInit_ex` 下断点
- 对于 Windows CryptoAPI，在 `CryptDeriveKey` 或 `CryptDecrypt` 下断点

### 策略四：内存转储

1. 让应用在内存中解密数据
2. 转储进程内存：`procdump -ma <pid>`
3. 搜索 AES 密钥调度表（128 位或 256 位模式）
4. 搜索已知明文模式（JWT `eyJ` 头、JSON `{`）

### 策略五：已知明文攻击

如果知道部分明文（如 JSON 以 `{` 开头、JWT 以 `eyJ` 开头）：

1. 将已知明文与密文 XOR，恢复密钥流
2. 对于 AES-CBC，如果已知密钥可用第一块推导 IV
3. 对于简单 XOR，如果密钥短于数据，密钥流会重复

---

## 阶段六：解密与验证

**目标：解密数据并验证正确性。**

### 完整性验证

许多信封格式包含摘要用于验证：

```
[IV (16 bytes)][encrypted data][optional padding]
```

或：

```
[HEADER][randomKey][AES-CBC(SHA512(payload) + payload)]
```

如果信封包含 SHA-512 摘要，验证方法：

```javascript
const expectedDigest = plaintext.subarray(0, 64);
const payload = plaintext.subarray(64);
const actualDigest = sha512(payload);
if (timingSafeEqual(expectedDigest, actualDigest)) {
    // 完整性验证通过
}
```

### 功能验证

最终的测试是解密后的凭证是否实际可用：

1. 解析解密后的 JSON
2. 提取 `token` 或 `access_token`
3. 使用 token 调用应用 API：
   ```bash
   curl -H "Authorization: Bearer <token>" https://api.trae.ai/v1/user/info
   ```
4. 成功的响应（HTTP 200）确认凭证有效

---

## 总结：推荐工作流程

```
侦察（识别技术框架）
        ↓
数据收集（登录前后对比）
        ↓
格式分析（熵值 + 魔数）
        ↓
静态分析（解包 ASAR，搜索字符串）
        ↓
动态分析（Frida hook，静态受阻时）
        ↓
密钥提取（硬编码 → 派生 → 运行时）
        ↓
解密 + 验证（完整性检查 + API 调用）
```

**核心原则：** 从数据末端往回追。先找到凭据存在哪，再看它长什么样，然后从客户端代码里找谁能处理这个格式，最后从处理逻辑里挖密钥。

---

## 参考资料

- [Frida](https://frida.re/) — 动态插桩工具包
- [Ghidra](https://ghidra-sre.org/) — NSA 逆向工程框架
- [IDA Pro](https://hex-rays.com/ida-pro/) — 反汇编器与调试器
- [Electron ASAR](https://github.com/electron/asar) — Electron 归档格式
- [Node.js crypto](https://nodejs.org/api/crypto.html) — Node.js 加密 API
- [OpenSSL](https://www.openssl.org/) — Electron 应用常用的加密库

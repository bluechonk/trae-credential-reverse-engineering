/**
 * Phase 5: Key Extraction
 * 
 * Goal: Obtain the encryption keys.
 * 
 * Strategies (in order of preference):
 *   1. Hardcoded keys (search decompiled code)
 *   2. Derived keys (identify derivation function + inputs)
 *   3. Runtime extraction (Frida hook on decrypt functions)
 *   4. Memory dump (search for AES key schedules)
 *   5. Known-plaintext attack
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { findMainJs, findStorageJson } from '../utils/index.js';
import { findAppSource } from '../phase4-encryption-id/index.js';

interface KeyCandidate {
  strategy: string;
  type: 'hardcoded' | 'derived' | 'runtime' | 'memory' | 'plaintext-attack';
  value: string;
  encoding: 'hex' | 'base64' | 'utf8';
  file?: string;
  line?: number;
  context: string;
}

/** Patterns that indicate hardcoded keys */
const KEY_PATTERNS = [
  // Buffer.from([...]) — byte array
  { pattern: /Buffer\.from\(\[([\s\S]*?)\]\)/, encoding: 'hex' as const, name: 'byte-array' },
  // Buffer.from("...", "base64|hex")
  { pattern: /Buffer\.from\(["']([A-Za-z0-9+/=]{16,})["'],\s*["'](base64|hex)["']\)/, encoding: 'base64' as const, name: 'buffer-encoded' },
  // Hex string assignment
  { pattern: /(?:const|let|var)\s+\w*(?:key|secret|password|iv)\w*\s*=\s*["']([0-9a-fA-F]{32,})["']/i, encoding: 'hex' as const, name: 'hex-string' },
  // Base64 string assignment
  { pattern: /(?:const|let|var)\s+\w*(?:key|secret|password)\w*\s*=\s*["']([A-Za-z0-9+/=]{24,})["']/i, encoding: 'base64' as const, name: 'b64-string' },
  // process.env with key-like name
  { pattern: /process\.env\.(\w*(?:KEY|SECRET|TOKEN|PASSWORD)\w*)/i, encoding: 'utf8' as const, name: 'env-var' },
];

/** IV patterns */
const IV_PATTERNS = [
  { pattern: /(?:const|let|var)\s+\w*(?:iv|vector)\w*\s*=\s*["']([0-9a-fA-F]{16,})["']/i, encoding: 'hex' as const, name: 'hex-iv' },
  { pattern: /Buffer\.from\(["']([0-9a-fA-F]{32})["'],\s*["']hex["']\)/, encoding: 'hex' as const, name: 'buffer-iv' },
];

export async function phase5(): Promise<void> {
  console.log(chalk.gray('Extracting encryption keys...\n'));

  // 扫描源：优先 phase4 的 asar 提取产物；app 为解包目录时（phase4 不复制）直接扫安装源目录。
  // 2026-10 修复：Trae CN 为解包目录发布，原实现只认 output/phase4/extracted 导致 phase4→5 断链。
  let scanDir = resolve(process.cwd(), 'output', 'phase4', 'extracted');
  if (!existsSync(scanDir)) {
    const source = findAppSource();
    if (source?.type === 'dir') {
      scanDir = source.path;
      console.log(chalk.gray(`  No asar extraction found; scanning unpacked app source: ${scanDir}\n`));
    } else {
      console.log(chalk.red('✗ Extracted source not found. Run phase4 first.'));
      return;
    }
  }

  const candidates: KeyCandidate[] = [];

  // ── Strategy 0（2026-10 新增，首选）：byteCrypto 密钥材料提取 + 真实密文验证 ──
  // 旧策略 1/2 在新版 bundle 上只产出 121 个 createHash 噪音候选，无一可用。
  // 真正可用的密钥材料是 main.js byteCrypto 模块内的四张 64B 硬编码表：
  // 用锚点提取（与 phase6 共用实现），并以 storage.json 的真实密文做解密验证
  // （SHA-512 tag 校验通过 = 材料确认有效），产出经过验证的候选而非噪音。
  console.log(chalk.white('Strategy 0: byteCrypto key material extraction + real-ciphertext verification...'));
  const spinner = ora('Extracting tables & verifying against live ciphertext...').start();
  try {
    const mainJs = findMainJs();
    if (!mainJs) throw new Error('main.js not found (Trae CN installation missing?)');
    const { extractTablesFromMainJs, initFromMainJs, decryptBlob } = await import('../phase6-decryption/byteCrypto.js');
    const tables = extractTablesFromMainJs(mainJs);
    initFromMainJs(mainJs);

    // 取真实密文样本验证（storage.json 第一条 iCubeAuthInfo 密文）
    const storageJson = findStorageJson();
    if (!storageJson) throw new Error('storage.json not found');
    const store = JSON.parse(readFileSync(storageJson, 'utf-8')) as Record<string, string>;
    const sampleKey = Object.keys(store).find((k) => k.startsWith('iCubeAuthInfo://icube.cloudide'));
    if (!sampleKey) throw new Error('no iCubeAuthInfo ciphertext sample in storage.json');
    const sample = store[sampleKey];
    const decrypted = await decryptBlob(sample);
    if (!decrypted.ok || !decrypted.plaintext) throw new Error('verification decrypt failed: ' + (decrypted as any).reason);

    const fp = (t: Uint8Array) => Array.from(t.slice(0, 6)).map((b) => b.toString(16).padStart(2, '0')).join('');
    candidates.push({
      strategy: 'bytecrypto-verified',
      type: 'hardcoded',
      value: `tables@${mainJs} [hie=${fp(tables.hie)} wie=${fp(tables.wie)} vie=${fp(tables.vie)} qie=${fp(tables.qie)}] mode=${decrypted.mode} sample=${sampleKey}`,
      encoding: 'utf8',
      file: relative(resolve(process.cwd(), 'src'), mainJs),
      context: `Verified: decryptBlob on live ciphertext passed SHA-512 integrity tag (${(decrypted.plaintext.length || 0)} bytes plaintext). Key material = XOR of two 64B hardcoded tables; verified usable for AES-128-CBC envelope.`,
    });
    spinner.succeed(`byteCrypto key material VERIFIED (mode=${decrypted.mode}, sample decrypt OK)`);
  } catch (err) {
    spinner.fail('byteCrypto verification failed: ' + (err as Error).message);
    console.log(chalk.gray('  Falling back to legacy heuristic strategies below...'));
  }

  // ── Strategy 1（legacy）：hardcoded keys 启发式扫描 ──
  // 注：新版 bundle 上产出的是大量 createHash 调用噪音（121 项，无一可用），
  // 保留仅作对照与历史方法参考；有效材料以上面的 bytecrypto-verified 为准。
  console.log(chalk.white('\nStrategy 1: Searching for hardcoded keys (legacy heuristics)...'));
  const legacySpinner = ora('Scanning source...').start();
  const hardcodedCandidates = searchHardcodedKeys(scanDir);
  candidates.push(...hardcodedCandidates);
  legacySpinner.succeed(`Found ${chalk.cyan(String(hardcodedCandidates.length))} hardcoded key candidates (legacy, mostly noise on 2026-10 bundles)`);

  // ── Strategy 2（legacy）：derived keys ──
  console.log(chalk.white('\nStrategy 2: Analyzing key derivation (legacy heuristics)...'));
  const legacySpinner2 = ora('Searching for derivation functions...').start();
  const derivedCandidates = analyzeKeyDerivation(scanDir);
  candidates.push(...derivedCandidates);
  legacySpinner2.succeed(`Found ${chalk.cyan(String(derivedCandidates.length))} derivation candidates (legacy)`);

  // Print results
  printCandidates(candidates);

  // Save results
  const outputDir = resolve(process.cwd(), 'output', 'phase5');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    resolve(outputDir, 'key-candidates.json'),
    JSON.stringify(candidates, null, 2)
  );
  console.log(chalk.gray(`\n  Results saved to: ${resolve(outputDir, 'key-candidates.json')}`));

  // Prompt for runtime extraction
  console.log(chalk.cyan('\n─── Next Steps ───'));
  const verified = candidates.some((c) => c.strategy === 'bytecrypto-verified');
  if (verified) {
    console.log(chalk.green('  Verified byteCrypto key material extracted. Proceed to Phase 6 for decryption.'));
  } else if (candidates.length === 0) {
    console.log(chalk.yellow('  No hardcoded keys found. Try runtime extraction:'));
    console.log(chalk.gray('  Run: frida -n "Trae CN.exe" -f src/phase5-key-extraction/hook-decrypt.js'));
  } else {
    console.log(chalk.green('  Key candidates found. Proceed to Phase 6 for decryption.'));
  }
}

function searchHardcodedKeys(dir: string): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  const files = getSourceFiles(dir);

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        for (const { pattern, encoding, name } of KEY_PATTERNS) {
          const match = lines[i].match(pattern);
          if (match) {
            candidates.push({
              strategy: 'hardcoded',
              type: 'hardcoded',
              value: match[1].replace(/\s/g, ''),
              encoding,
              file: relative(dir, file),
              line: i + 1,
              context: lines[i].trim().substring(0, 100),
            });
          }
        }

        for (const { pattern, encoding, name } of IV_PATTERNS) {
          const match = lines[i].match(pattern);
          if (match) {
            candidates.push({
              strategy: 'hardcoded-iv',
              type: 'hardcoded',
              value: match[1],
              encoding,
              file: relative(dir, file),
              line: i + 1,
              context: lines[i].trim().substring(0, 100),
            });
          }
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return candidates;
}

function analyzeKeyDerivation(dir: string): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  const files = getSourceFiles(dir);

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        // PBKDF2
        const pbkdf2Match = lines[i].match(/pbkdf2(?:Sync)?\(([^)]+)\)/i);
        if (pbkdf2Match) {
          candidates.push({
            strategy: 'derived-pbkdf2',
            type: 'derived',
            value: pbkdf2Match[1],
            encoding: 'utf8',
            file: relative(dir, file),
            line: i + 1,
            context: lines[i].trim().substring(0, 100),
          });
        }

        // scrypt
        const scryptMatch = lines[i].match(/scrypt(?:Sync)?\(([^)]+)\)/i);
        if (scryptMatch) {
          candidates.push({
            strategy: 'derived-scrypt',
            type: 'derived',
            value: scryptMatch[1],
            encoding: 'utf8',
            file: relative(dir, file),
            line: i + 1,
            context: lines[i].trim().substring(0, 100),
          });
        }

        // createHash / createHmac
        const hashMatch = lines[i].match(/createHash\(["'](\w+)["']\)|createHmac\(["'](\w+)["'],\s*["']([^"']+)["']\)/i);
        if (hashMatch) {
          candidates.push({
            strategy: 'derived-hash',
            type: 'derived',
            value: hashMatch[0],
            encoding: 'utf8',
            file: relative(dir, file),
            line: i + 1,
            context: lines[i].trim().substring(0, 100),
          });
        }
      }
    } catch {
      // Skip
    }
  }

  return candidates;
}

function getSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        files.push(...getSourceFiles(fullPath));
      } else if (/\.(js|ts|mjs|cjs)$/.test(item)) {
        files.push(fullPath);
      }
    } catch {
      // Skip
    }
  }

  return files;
}

function printCandidates(candidates: KeyCandidate[]): void {
  if (candidates.length === 0) {
    console.log(chalk.yellow('\n  No key candidates found.'));
    return;
  }

  console.log(chalk.cyan('\n─── Key Candidates ───'));
  candidates.forEach((c, i) => {
    const typeColor = c.type === 'hardcoded' ? chalk.green : chalk.blue;
    console.log(`\n  ${chalk.white(`#${i + 1}`)} ${typeColor(`[${c.strategy}]`)}`);
    console.log(`    Value:     ${chalk.white(c.value.substring(0, 64))}${c.value.length > 64 ? '...' : ''}`);
    console.log(`    Encoding:  ${c.encoding}`);
    if (c.file) console.log(`    Location:  ${chalk.gray(`${c.file}:${c.line}`)}`);
    console.log(`    Context:   ${chalk.gray(c.context)}`);
  });
}

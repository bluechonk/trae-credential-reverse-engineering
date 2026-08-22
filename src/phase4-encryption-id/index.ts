/**
 * Phase 4: Encryption Identification
 * 
 * Goal: Determine what encryption algorithm is used.
 * 
 * Steps:
 *   1. Extract ASAR archive
 *   2. Search for cryptographic indicators (grep patterns)
 *   3. Search for credential-related strings
 *   4. Identify key derivation functions
 *   5. (Optional) Dynamic analysis via Frida
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, writeFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createRequire } from 'node:module';

interface CryptoIndicator {
  pattern: string;
  category: 'algorithm' | 'credential' | 'key-derivation' | 'library';
  file: string;
  line: number;
  match: string;
}

/** Patterns to search for in decompiled code */
const CRYPTO_PATTERNS = [
  // Algorithms
  { pattern: /aes-128-cbc|AES-128-CBC/, category: 'algorithm' as const },
  { pattern: /aes-256-cbc|AES-256-CBC/, category: 'algorithm' as const },
  { pattern: /aes-128-gcm|AES-128-GCM/, category: 'algorithm' as const },
  { pattern: /aes-256-gcm|AES-256-GCM/, category: 'algorithm' as const },
  { pattern: /createCipheriv|createDecipheriv/, category: 'algorithm' as const },
  { pattern: /createCipher|createDecipher/, category: 'algorithm' as const },
  { pattern: /EVP_CIPHER| EVP_CipherInit/, category: 'algorithm' as const },
  { pattern: /BCryptDecrypt|CryptDecrypt/, category: 'algorithm' as const },
  
  // Credential strings
  { pattern: /token|refreshToken|authToken|accessToken/, category: 'credential' as const },
  { pattern: /credential|authInfo|sessionToken/, category: 'credential' as const },
  { pattern: /deviceId|machineId|userId|privateKey/, category: 'credential' as const },
  { pattern: /encrypt|decrypt|cipher|secret/, category: 'credential' as const },
  { pattern: /password|passwd|secretKey/, category: 'credential' as const },
  
  // Key derivation
  { pattern: /pbkdf2|PBKDF2/, category: 'key-derivation' as const },
  { pattern: /scrypt|bcrypt/, category: 'key-derivation' as const },
  { pattern: /hkdf|HKDF/, category: 'key-derivation' as const },
  { pattern: /sha512|sha256|createHash|createHmac/, category: 'key-derivation' as const },
  
  // Libraries
  { pattern: /CryptoJS|node-forge|sjcl|tweetnacl/, category: 'library' as const },
];

export async function phase4(): Promise<void> {
  console.log(chalk.gray('Identifying encryption algorithms...\n'));

  // Step 1: Find app source (ASAR or unpacked directory)
  const spinner = ora('Locating app source...').start();
  const appSource = findAppSource();

  if (!appSource) {
    spinner.warn('App source not found (no ASAR or unpacked dir)');
    console.log(chalk.gray('  Will skip static analysis, proceed to dynamic analysis'));
  } else {
    let sourceDir: string;

    if (appSource.type === 'asar') {
      spinner.succeed(`Found ASAR: ${chalk.cyan(appSource.path)}`);
      spinner.start('Extracting ASAR archive...');
      sourceDir = await extractAsar(appSource.path);
      spinner.succeed(`Extracted to: ${chalk.cyan(sourceDir)}`);
    } else {
      spinner.succeed(`Found unpacked app: ${chalk.cyan(appSource.path)}`);
      sourceDir = appSource.path;
    }

    // Search for crypto indicators
    spinner.start('Searching for cryptographic indicators...');
    const indicators = searchCryptoIndicators(sourceDir);
    spinner.succeed(`Found ${chalk.cyan(String(indicators.length))} indicators`);

    // Print results
    printIndicators(indicators);

    // Save results
    const outputDir = resolve(process.cwd(), 'output', 'phase4');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      resolve(outputDir, 'indicators.json'),
      JSON.stringify(indicators, null, 2)
    );
    console.log(chalk.gray(`\n  Results saved to: ${resolve(outputDir, 'indicators.json')}`));
  }

  // Step 2: Frida dynamic analysis prompt
  console.log(chalk.cyan('\n─── Dynamic Analysis (Optional) ───'));
  console.log(chalk.gray('  To perform dynamic analysis with Frida:'));
  console.log(chalk.gray('  1. Ensure Frida is installed: npm install -g frida-tools'));
  console.log(chalk.gray('  2. Run: frida -n "TRAE SOLO CN.exe" -f src/phase4-encryption-id/hook-crypto.js'));
}

/**
 * Find the Electron app source — either as an ASAR archive or unpacked directory.
 * Returns { type: 'asar', path } or { type: 'dir', path } or null.
 */
function findAppSource(): { type: 'asar' | 'dir'; path: string } | null {
  // Search for ASAR archives
  const asarPaths = [
    resolve('C:\\', 'Program Files', 'TRAE SOLO CN', 'resources', 'app.asar'),
    resolve('C:\\', 'Program Files (x86)', 'TRAE SOLO CN', 'resources', 'app.asar'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Programs', 'TRAE SOLO CN', 'resources', 'app.asar'),
    resolve('C:\\', 'Program Files', 'TraeWork CN', 'resources', 'app.asar'),
    resolve('C:\\', 'Program Files (x86)', 'TraeWork CN', 'resources', 'app.asar'),
  ];
  for (const path of asarPaths) {
    if (existsSync(path)) return { type: 'asar', path };
  }

  // Search for unpacked app directories
  const dirPaths = [
    resolve('C:\\', 'Program Files', 'TRAE SOLO CN', 'resources', 'app'),
    resolve('C:\\', 'Program Files (x86)', 'TRAE SOLO CN', 'resources', 'app'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Programs', 'TRAE SOLO CN', 'resources', 'app'),
    resolve('C:\\', 'Program Files', 'TraeWork CN', 'resources', 'app'),
    resolve('C:\\', 'Program Files (x86)', 'TraeWork CN', 'resources', 'app'),
  ];
  for (const path of dirPaths) {
    if (existsSync(path)) {
      const stats = statSync(path);
      if (stats.isDirectory()) return { type: 'dir', path };
    }
  }

  return null;
}

/** @deprecated Use findAppSource instead */
function findAsarArchive(): string | null {
  const source = findAppSource();
  if (!source) return null;
  return source.type === 'asar' ? source.path : null;
}

async function extractAsar(asarPath: string): Promise<string> {
  const outputDir = resolve(process.cwd(), 'output', 'phase4', 'extracted');
  mkdirSync(outputDir, { recursive: true });

  // Use asar npm package
  try {
    const asar = createRequire(import.meta.url)('asar');
    await asar.extractAll(asarPath, outputDir);
  } catch {
    // Fallback: copy asar to output for manual extraction
    const { copyFileSync } = await import('node:fs');
    copyFileSync(asarPath, resolve(outputDir, 'app.asar'));
    console.log(chalk.yellow('\n  Note: Install asar globally for extraction: npm install -g asar'));
    console.log(chalk.yellow(`  Then run: npx asar extract "${asarPath}" "${outputDir}"`));
  }

  return outputDir;
}

function searchCryptoIndicators(dir: string): CryptoIndicator[] {
  const indicators: CryptoIndicator[] = [];
  const files = getSourceFiles(dir);

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        for (const { pattern, category } of CRYPTO_PATTERNS) {
          const match = lines[i].match(pattern);
          if (match) {
            indicators.push({
              pattern: pattern.source,
              category,
              file: relative(dir, file),
              line: i + 1,
              match: match[0],
            });
          }
        }
      }
    } catch {
      // Skip binary or unreadable files
    }
  }

  return indicators;
}

function getSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
    } else if (/\.(js|ts|mjs|cjs|json)$/.test(item)) {
      files.push(fullPath);
    }
  }

  return files;
}

function printIndicators(indicators: CryptoIndicator[]): void {
  const categories = ['algorithm', 'credential', 'key-derivation', 'library'] as const;

  for (const cat of categories) {
    const items = indicators.filter((i) => i.category === cat);
    if (items.length === 0) continue;

    const catLabel = {
      algorithm: '🔐 Algorithms',
      credential: '🔑 Credential Strings',
      'key-derivation': '🔄 Key Derivation',
      library: '📦 Libraries',
    }[cat];

    console.log(chalk.cyan(`\n─── ${catLabel} (${items.length}) ───`));
    
    // Deduplicate by match
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.match}:${item.file}:${item.line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      console.log(
        `  ${chalk.white(item.match.padEnd(20))} ` +
        `${chalk.gray(`${item.file}:${item.line}`)}`
      );
    }
  }
}

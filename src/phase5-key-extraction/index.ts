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

  const extractedDir = resolve(process.cwd(), 'output', 'phase4', 'extracted');
  if (!existsSync(extractedDir)) {
    console.log(chalk.red('✗ Extracted source not found. Run phase4 first.'));
    return;
  }

  const candidates: KeyCandidate[] = [];

  // Strategy 1: Hardcoded keys
  console.log(chalk.white('Strategy 1: Searching for hardcoded keys...'));
  const spinner = ora('Scanning decompiled source...').start();
  const hardcodedCandidates = searchHardcodedKeys(extractedDir);
  candidates.push(...hardcodedCandidates);
  spinner.succeed(`Found ${chalk.cyan(String(hardcodedCandidates.length))} hardcoded key candidates`);

  // Strategy 2: Derived keys
  console.log(chalk.white('\nStrategy 2: Analyzing key derivation...'));
  spinner.start('Searching for derivation functions...');
  const derivedCandidates = analyzeKeyDerivation(extractedDir);
  candidates.push(...derivedCandidates);
  spinner.succeed(`Found ${chalk.cyan(String(derivedCandidates.length))} derivation candidates`);

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
  if (candidates.length === 0) {
    console.log(chalk.yellow('  No hardcoded keys found. Try runtime extraction:'));
    console.log(chalk.gray('  Run: frida -n "TraeWork.exe" -f src/phase5-key-extraction/hook-decrypt.js'));
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

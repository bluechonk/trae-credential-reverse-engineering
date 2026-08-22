/**
 * Phase 3: Format Analysis
 * 
 * Goal: Determine the format and encryption state of each file.
 * 
 * Steps:
 *   1. Read first 64 bytes of each target file
 *   2. Compare against known magic bytes
 *   3. Calculate Shannon entropy
 *   4. Classify each file's encryption state
 */

import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { shannonEntropy, classifyEntropy, identifyMagic, hexDump } from '../utils/index.js';

interface FileAnalysis {
  path: string;
  size: number;
  magic: string | null;
  mimeType: string | null;
  entropy: number;
  entropyLevel: 'low' | 'medium' | 'high';
  entropyDescription: string;
  isJson: boolean;
  isSqlite: boolean;
  firstBytes: string;
}

export async function phase3(): Promise<void> {
  console.log(chalk.gray('Analyzing file formats and encryption state...\n'));

  const targetsFile = resolve(process.cwd(), 'output', 'phase2', 'targets.json');
  let filePaths: string[] = [];

  if (existsSync(targetsFile)) {
    const targets = JSON.parse(readFileSync(targetsFile, 'utf-8'));
    const highTargets = targets.filter((t: any) => t.priority === 'high' || t.priority === 'medium');
    filePaths = highTargets.map((t: any) => t.path);
    console.log(chalk.gray(`Loaded ${filePaths.length} targets from phase2.\n`));
  } else {
    // Fallback: scan data directory directly
    console.log(chalk.yellow('  targets.json not found, scanning data directory directly...'));
    const dataDir = findDataDirectory();
    if (!dataDir) {
      console.log(chalk.red('Data directory not found. Run phase2 first or check installation.'));
      return;
    }
    console.log(chalk.gray(`  Scanning: ${dataDir}\n`));
    filePaths = await scanForFiles(dataDir);
    console.log(chalk.gray(`Found ${filePaths.length} files to analyze.\n`));
  }

  const results: FileAnalysis[] = [];

  for (const filePath of filePaths) {
    const spinner = ora(`  ${truncatePath(filePath, 60)}`).start();

    if (!existsSync(filePath)) {
      spinner.warn(chalk.gray('File not found (may have been cleaned up)'));
      continue;
    }

    try {
      const analysis = analyzeFile(filePath);
      results.push(analysis);

      const entropyColor = analysis.entropyLevel === 'high'
        ? chalk.red
        : analysis.entropyLevel === 'medium'
          ? chalk.yellow
          : chalk.green;

      const sizeStr = analysis.size > 1024
        ? (analysis.size / 1024).toFixed(1) + 'KB'
        : analysis.size + 'B';

      spinner.succeed(
        `${truncatePath(filePath, 50)} ` +
        `${chalk.gray(sizeStr)} ` +
        `${entropyColor(`entropy: ${analysis.entropy.toFixed(2)}`)} ` +
        `${chalk.cyan(`[${analysis.magic ?? '?'}]`)}`
      );
    } catch (err) {
      spinner.fail(`${truncatePath(filePath, 50)} ${chalk.red('Error: ' + (err as Error).message)}`);
    }
  }

  // Print summary
  console.log(chalk.cyan('\n─── Format Analysis Summary ───'));
  console.log(`  Total files analyzed: ${results.length}`);
  console.log(`  High entropy (encrypted):  ${chalk.red(String(results.filter((r) => r.entropyLevel === 'high').length))}`);
  console.log(`  Medium entropy:            ${chalk.yellow(String(results.filter((r) => r.entropyLevel === 'medium').length))}`);
  console.log(`  Low entropy (plaintext):   ${chalk.green(String(results.filter((r) => r.entropyLevel === 'low').length))}`);

  // Detailed view of encrypted files
  const encryptedFiles = results.filter((r) => r.entropyLevel === 'high');
  if (encryptedFiles.length > 0) {
    console.log(chalk.red('\n─── Likely Encrypted Files ───'));
    encryptedFiles.forEach((f) => {
      console.log(`\n  ${chalk.white.bold(f.path)}`);
      console.log(`    Size: ${f.size} bytes | Entropy: ${f.entropy.toFixed(2)} bits/byte`);
      console.log(`    ${chalk.gray(f.entropyDescription)}`);
      console.log(chalk.gray(`    Hex dump (first 64 bytes):`));
      console.log(hexDump(readFileSync(f.path), 64).split('\n').map((l) => '    ' + chalk.gray(l)).join('\n'));
    });
  }

  // Save results
  const outputDir = resolve(process.cwd(), 'output', 'phase3');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, 'analysis.json'), JSON.stringify(results, null, 2));
  console.log(chalk.gray(`\n  Results saved to: ${resolve(outputDir, 'analysis.json')}`));
}

function analyzeFile(filePath: string): FileAnalysis {
  const data = readFileSync(filePath);
  const first64 = data.subarray(0, 64);
  const magic = identifyMagic(first64);
  const entropy = shannonEntropy(data);
  const classification = classifyEntropy(entropy);

  let isJson = false;
  let isSqlite = false;

  // Check if JSON
  try {
    JSON.parse(data.toString('utf-8'));
    isJson = true;
  } catch {
    // not JSON
  }

  // Check if SQLite
  if (data.length >= 16) {
    const header = data.subarray(0, 16).toString('ascii');
    isSqlite = header.startsWith('SQLite format');
  }

  return {
    path: filePath,
    size: data.length,
    magic: magic?.name ?? null,
    mimeType: magic?.mimeType ?? null,
    entropy,
    entropyLevel: classification.level,
    entropyDescription: classification.description,
    isJson,
    isSqlite,
    firstBytes: first64.toString('hex'),
  };
}

function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  return '...' + path.substring(path.length - maxLen + 3);
}

function findDataDirectory(): string | null {
  const candidates = [
    resolve(process.env.APPDATA ?? '', 'TRAE SOLO CN'),
    resolve(process.env.APPDATA ?? '', 'TraeWork CN'),
    resolve(process.env.LOCALAPPDATA ?? '', 'TRAE SOLO CN'),
    resolve(process.env.LOCALAPPDATA ?? '', 'TraeWork CN'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

async function scanForFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentDir: string): Promise<void> {
    const items = await readdir(currentDir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(currentDir, item.name);
      if (item.isDirectory()) {
        await scan(fullPath);
      } else if (item.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}

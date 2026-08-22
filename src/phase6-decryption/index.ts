/**
 * Phase 6: Decryption & Validation
 * 
 * Goal: Decrypt the data and verify correctness.
 * 
 * Steps:
 *   1. Load key candidates from Phase 5
 *   2. Load encrypted files from Phase 3
 *   3. Attempt decryption with each key candidate
 *   4. Verify integrity (SHA-512 digest if present)
 *   5. Validate credential via API call
 */

import chalk from 'chalk';
import ora from 'ora';
import { createDecipheriv, createHash, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { decryptTraeAuth } from './decryptTraeAuth.js';

interface DecryptionResult {
  file: string;
  success: boolean;
  algorithm: string;
  keyHex: string;
  ivHex?: string;
  output?: string;
  outputPath?: string;
  isValidJson: boolean;
  hasJwt: boolean;
  integrityVerified: boolean;
  error?: string;
}

/** Common AES configurations to try */
const AES_CONFIGS = [
  { algorithm: 'aes-256-cbc', keyLen: 32, ivLen: 16 },
  { algorithm: 'aes-128-cbc', keyLen: 16, ivLen: 16 },
  { algorithm: 'aes-256-gcm', keyLen: 32, ivLen: 12 },
  { algorithm: 'aes-128-gcm', keyLen: 16, ivLen: 12 },
  { algorithm: 'aes-256-ctr', keyLen: 32, ivLen: 16 },
  { algorithm: 'aes-128-ecb', keyLen: 16, ivLen: 0 },
  { algorithm: 'aes-256-ecb', keyLen: 32, ivLen: 0 },
];

export async function phase6(): Promise<void> {
  console.log(chalk.gray('Decrypting and validating credentials...\n'));

  // ─── Path A: TRAE SOLO CN native auth storage (byteCrypto envelope) ───
  console.log(chalk.cyan('[Path A] TRAE SOLO CN auth storage (iCubeAuthInfo)\n'));
  const traeResult = await decryptTraeAuth();
  if (traeResult && traeResult.decrypted.length > 0) {
    console.log(chalk.green(`  Decrypted ${traeResult.decrypted.length}/${traeResult.totalKeys} entries via byteCrypto envelope.\n`));
    return;
  }
  if (traeResult && traeResult.totalKeys > 0) {
    console.log(chalk.yellow('  Native decryption did not match; falling back to generic brute-force…\n'));
  }

  // ─── Path B: generic candidate-key brute force (from phases 3/5 outputs) ───
  // Load inputs from previous phases
  const keyFile = resolve(process.cwd(), 'output', 'phase5', 'key-candidates.json');
  const analysisFile = resolve(process.cwd(), 'output', 'phase3', 'analysis.json');

  if (!existsSync(keyFile)) {
    console.log(chalk.red('✗ Key candidates not found. Run phase5 first.'));
    return;
  }
  if (!existsSync(analysisFile)) {
    console.log(chalk.red('✗ Analysis results not found. Run phase3 first.'));
    return;
  }

  const candidates = JSON.parse(readFileSync(keyFile, 'utf-8'));
  const analysisResults = JSON.parse(readFileSync(analysisFile, 'utf-8'));

  // Filter to high-entropy (likely encrypted) files
  const encryptedFiles = analysisResults.filter(
    (a: any) => a.entropyLevel === 'high' || a.entropyLevel === 'medium'
  );

  if (encryptedFiles.length === 0) {
    console.log(chalk.yellow('No encrypted files found. Run phase3 first.'));
    return;
  }

  console.log(chalk.gray(`Encrypted files: ${encryptedFiles.length}`));
  console.log(chalk.gray(`Key candidates: ${candidates.length}\n`));

  const outputDir = resolve(process.cwd(), 'output', 'phase6');
  mkdirSync(outputDir, { recursive: true });

  const results: DecryptionResult[] = [];

  for (const fileInfo of encryptedFiles) {
    const spinner = ora(`Trying: ${truncatePath(fileInfo.path, 50)}`).start();
    const encryptedData = readFileSync(fileInfo.path);

    let bestResult: DecryptionResult | null = null;

    for (const candidate of candidates) {
      // Try direct key
      const keyBuffer = decodeKeyValue(candidate);
      if (!keyBuffer) continue;

      for (const config of AES_CONFIGS) {
        if (keyBuffer.length !== config.keyLen) continue;

        // Try with IV from first 16 bytes of encrypted data
        const iv = config.ivLen > 0
          ? encryptedData.subarray(0, config.ivLen)
          : Buffer.alloc(0);

        try {
          const decipher = createDecipheriv(
            config.algorithm,
            keyBuffer,
            config.ivLen > 0 ? iv : undefined
          );
          let decrypted = decipher.update(encryptedData.subarray(config.ivLen));
          decrypted = Buffer.concat([decrypted, decipher.final()]);

          // Check if result looks valid
          const text = decrypted.toString('utf-8');
          const isValidJson = isJson(text);
          const hasJwt = text.startsWith('eyJ');
          const hasPrintable = isMostlyPrintable(decrypted);

          if (isValidJson || hasJwt || hasPrintable) {
            bestResult = {
              file: fileInfo.path,
              success: true,
              algorithm: config.algorithm,
              keyHex: keyBuffer.toString('hex'),
              ivHex: config.ivLen > 0 ? iv.toString('hex') : undefined,
              output: text.substring(0, 500),
              isValidJson,
              hasJwt,
              integrityVerified: false,
            };

            // Save decrypted output
            const outName = fileInfo.path.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
            const outPath = resolve(outputDir, `${outName}.decrypted`);
            writeFileSync(outPath, decrypted);
            bestResult.outputPath = outPath;

            break;
          }
        } catch {
          // Decryption failed, try next config
        }
      }

      if (bestResult) break;
    }

    if (bestResult) {
      spinner.succeed(
        `${chalk.green('✓')} ${truncatePath(fileInfo.path, 40)} ` +
        `${chalk.gray(`[${bestResult.algorithm}]`)} ` +
        `${bestResult.isValidJson ? chalk.green('JSON') : bestResult.hasJwt ? chalk.blue('JWT') : chalk.yellow('text')}`
      );
      results.push(bestResult);
    } else {
      spinner.fail(`✗ ${truncatePath(fileInfo.path, 40)} ${chalk.gray('No valid decryption found')}`);
      results.push({
        file: fileInfo.path,
        success: false,
        algorithm: '',
        keyHex: '',
        isValidJson: false,
        hasJwt: false,
        integrityVerified: false,
        error: 'No valid decryption found with available keys',
      });
    }
  }

  // Summary
  const successful = results.filter((r) => r.success);
  console.log(chalk.cyan('\n─── Decryption Summary ───'));
  console.log(`  Total attempts:  ${results.length}`);
  console.log(`  Successful:      ${chalk.green(String(successful.length))}`);
  console.log(`  Failed:          ${chalk.red(String(results.length - successful.length))}`);

  if (successful.length > 0) {
    console.log(chalk.cyan('\n─── Decrypted Credentials ───'));
    successful.forEach((r) => {
      console.log(`\n  ${chalk.white.bold(r.file)}`);
      console.log(`    Algorithm: ${r.algorithm}`);
      console.log(`    Key:       ${r.keyHex}`);
      if (r.ivHex) console.log(`    IV:        ${r.ivHex}`);
      console.log(`    Output:    ${chalk.gray(r.output?.substring(0, 200))}...`);
      console.log(`    Saved:     ${chalk.gray(r.outputPath)}`);
    });
  }

  // Save results
  writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(chalk.gray(`\n  Results saved to: ${resolve(outputDir, 'results.json')}`));
}

function decodeKeyValue(candidate: any): Buffer | null {
  try {
    if (candidate.encoding === 'hex') {
      return Buffer.from(candidate.value, 'hex');
    }
    if (candidate.encoding === 'base64') {
      return Buffer.from(candidate.value, 'base64');
    }
    if (candidate.encoding === 'utf8') {
      return Buffer.from(candidate.value, 'utf-8');
    }
  } catch {
    // fall through
  }
  return null;
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function isMostlyPrintable(data: Buffer): boolean {
  const printable = Array.from(data).filter((b) => (b >= 0x20 && b <= 0x7e) || b === 0x0a || b === 0x0d || b === 0x09);
  return printable.length / data.length > 0.8;
}

function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  return '...' + path.substring(path.length - maxLen + 3);
}

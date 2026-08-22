/**
 * Phase 2: Data Collection
 * 
 * Goal: Locate where credentials are stored.
 * 
 * Steps:
 *   1. Export directory listing before login
 *   2. Prompt user to log in
 *   3. Export directory listing after login
 *   4. Diff the two listings
 *   5. Prioritize target files
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { readdir, stat } from 'node:fs/promises';

interface FileEntry {
  fullPath: string;
  size: number;
  lastWriteTime: string;
}

/** Target file extensions ranked by priority */
const TARGET_EXTENSIONS: Array<{ ext: string; priority: 'high' | 'medium' | 'low'; reason: string }> = [
  { ext: '.json', priority: 'high', reason: 'Structured credential storage' },
  { ext: '.dat', priority: 'high', reason: 'Structured credential storage' },
  { ext: '.config', priority: 'high', reason: 'Structured credential storage' },
  { ext: '.db', priority: 'high', reason: 'Database storage (Chromium localStorage)' },
  { ext: '.sqlite', priority: 'high', reason: 'Database storage (Chromium localStorage)' },
  { ext: '.ini', priority: 'medium', reason: 'Configuration with account info' },
  { ext: '.cfg', priority: 'medium', reason: 'Configuration with account info' },
  { ext: '.xml', priority: 'medium', reason: 'Configuration with account info' },
  { ext: '.log', priority: 'medium', reason: 'May leak tokens in debug output' },
  { ext: '.bin', priority: 'low', reason: 'Encrypted blob (high entropy)' },
];

export async function phase2(): Promise<void> {
  console.log(chalk.gray('Collecting credential storage data...\n'));

  const dataDir = findDataDirectory();
  if (!dataDir) {
    console.log(chalk.red('Data directory not found. Searched:'));
    const candidates = [
      resolve(process.env.APPDATA ?? '', 'TraeWork CN'),
      resolve(process.env.APPDATA ?? '', 'TRAE SOLO CN'),
      resolve(process.env.LOCALAPPDATA ?? '', 'TraeWork CN'),
      resolve(process.env.LOCALAPPDATA ?? '', 'TRAE SOLO CN'),
    ];
    candidates.forEach((p) => console.log(chalk.gray('  - ' + p)));
    return;
  }

  const outputDir = resolve(process.cwd(), 'output', 'phase2');
  mkdirSync(outputDir, { recursive: true });

  // Step 1: Before login snapshot
  console.log(chalk.white('Step 1: Export directory listing (before login)'));
  const beforeFile = join(outputDir, 'before.csv');
  const spinner = ora('Scanning files...').start();
  const beforeEntries = await scanDirectory(dataDir);
  await exportToCsv(beforeEntries, beforeFile);
  spinner.succeed('Exported ' + chalk.cyan(String(beforeEntries.length)) + ' files to before.csv');

  // Step 2: Wait for user to log in
  console.log(chalk.yellow('\n  -> Please log in to TraeWork CN now.'));
  await waitForInput(chalk.gray('  Press Enter after login is complete...'));

  // Step 3: After login snapshot
  console.log(chalk.white('\nStep 2: Export directory listing (after login)'));
  const afterFile = join(outputDir, 'after.csv');
  spinner.start('Scanning files...');
  const afterEntries = await scanDirectory(dataDir);
  await exportToCsv(afterEntries, afterFile);
  spinner.succeed('Exported ' + chalk.cyan(String(afterEntries.length)) + ' files to after.csv');

  // Step 4: Diff
  console.log(chalk.white('\nStep 3: Comparing listings...'));
  const diff = diffListings(beforeEntries, afterEntries);

  console.log(chalk.cyan('\n--- Diff Results ---'));
  console.log('  New files:      ' + chalk.green(String(diff.newFiles.length)));
  console.log('  Modified files: ' + chalk.yellow(String(diff.modifiedFiles.length)));
  console.log('  Deleted files:  ' + chalk.red(String(diff.deletedFiles.length)));

  // Step 5: Prioritize targets
  console.log(chalk.white('\nStep 4: Prioritizing target files...'));
  const targets = prioritizeTargets([...diff.newFiles, ...diff.modifiedFiles]);

  console.log(chalk.cyan('\n--- High Priority Targets ---'));
  targets
    .filter((t) => t.priority === 'high')
    .forEach((t) => {
      console.log('  ' + chalk.red('*') + ' ' + t.path + ' ' + chalk.gray('(' + t.reason + ')'));
    });

  console.log(chalk.cyan('\n--- Medium Priority Targets ---'));
  targets
    .filter((t) => t.priority === 'medium')
    .forEach((t) => {
      console.log('  ' + chalk.yellow('*') + ' ' + t.path + ' ' + chalk.gray('(' + t.reason + ')'));
    });

  // Export targets list
  const targetsFile = join(outputDir, 'targets.json');
  writeFileSync(targetsFile, JSON.stringify(targets, null, 2));
  console.log(chalk.gray('\n  Targets saved to: ' + targetsFile));
}

async function scanDirectory(rootPath: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  async function scan(dir: string): Promise<void> {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        await scan(fullPath);
      } else if (item.isFile()) {
        const stats = await stat(fullPath);
        entries.push({
          fullPath,
          size: stats.size,
          lastWriteTime: stats.mtime.toISOString(),
        });
      }
    }
  }

  await scan(rootPath);
  return entries;
}

async function exportToCsv(entries: FileEntry[], filePath: string): Promise<void> {
  const lines = ['FullPath,Size,LastWriteTime'];
  for (const entry of entries) {
    lines.push('"' + entry.fullPath + '",' + entry.size + ',' + entry.lastWriteTime);
  }
  writeFileSync(filePath, lines.join('\n'));
}

function diffListings(before: FileEntry[], after: FileEntry[]): {
  newFiles: FileEntry[];
  modifiedFiles: FileEntry[];
  deletedFiles: FileEntry[];
} {
  const beforeMap = new Map(before.map((e) => [e.fullPath, e]));
  const afterMap = new Map(after.map((e) => [e.fullPath, e]));

  const newFiles: FileEntry[] = [];
  const modifiedFiles: FileEntry[] = [];
  const deletedFiles: FileEntry[] = [];

  for (const [path, entry] of afterMap) {
    const beforeEntry = beforeMap.get(path);
    if (!beforeEntry) {
      newFiles.push(entry);
    } else if (beforeEntry.size !== entry.size || beforeEntry.lastWriteTime !== entry.lastWriteTime) {
      modifiedFiles.push(entry);
    }
  }

  for (const [path, entry] of beforeMap) {
    if (!afterMap.has(path)) {
      deletedFiles.push(entry);
    }
  }

  return { newFiles, modifiedFiles, deletedFiles };
}

function prioritizeTargets(entries: FileEntry[]): Array<{
  path: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  size: number;
}> {
  return entries
    .map((entry) => {
      const ext = entry.fullPath.substring(entry.fullPath.lastIndexOf('.')).toLowerCase();
      const match = TARGET_EXTENSIONS.find((t) => t.ext === ext);
      return {
        path: entry.fullPath,
        priority: match?.priority ?? 'low',
        reason: match?.reason ?? 'Unknown format',
        size: entry.size,
      };
    })
    .sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
}

function findDataDirectory(): string | null {
  const candidates = [
    resolve(process.env.APPDATA ?? '', 'TraeWork CN'),
    resolve(process.env.APPDATA ?? '', 'TRAE SOLO CN'),
    resolve(process.env.LOCALAPPDATA ?? '', 'TraeWork CN'),
    resolve(process.env.LOCALAPPDATA ?? '', 'TRAE SOLO CN'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      return dir;
    }
  }
  return null;
}

function waitForInput(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}



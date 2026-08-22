/**
 * Phase 1: Reconnaissance
 * 
 * Goal: Understand the target application.
 * 
 * Steps:
 *   1. Identify the framework (Electron / Qt / .NET / Native Win32)
 *   2. Document the version (build number, update channel)
 *   3. Map the surface area (network, cache, sync)
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Known TRAE SOLO CN (aka TraeWork CN) installation paths.
 * The app is officially named "TRAE SOLO CN" but also referred to as "TraeWork CN".
 */
const SEARCH_PATHS = [
  resolve('C:\\', 'Program Files', 'TRAE SOLO CN'),
  resolve('C:\\', 'Program Files (x86)', 'TRAE SOLO CN'),
  resolve(process.env.LOCALAPPDATA ?? '', 'Programs', 'TRAE SOLO CN'),
  resolve(process.env.LOCALAPPDATA ?? '', 'Programs', 'trae-solo-cn'),
  resolve(process.env.APPDATA ?? '', 'TraeWork CN'),
  resolve(process.env.APPDATA ?? '', 'TRAE SOLO CN'),
  resolve(process.env.LOCALAPPDATA ?? '', 'TraeWork CN'),
  resolve(process.env.LOCALAPPDATA ?? '', 'TRAE SOLO CN'),
  resolve(process.env.USERPROFILE ?? '', '.trae-work-cn'),
  resolve(process.env.USERPROFILE ?? '', '.trae-solo-cn'),
];

/** Possible executable names */
const EXE_NAMES = ['TRAE SOLO CN.exe', 'TraeWork.exe', 'TraeSOLO.exe', 'trae-solo-cn.exe'];

/** Data directory names (in %APPDATA% / %LOCALAPPDATA%) */
const DATA_DIR_NAMES = ['TraeWork CN', 'TRAE SOLO CN', 'trae-solo-cn', 'trae-work-cn'];

/** Framework detection signatures */
const FRAMEWORK_SIGNATURES = {
  electron: {
    files: ['electron.exe', 'chrome_elf.dll', 'libGLESv2.dll', 'ffmpeg.dll'],
    dirs: ['resources'],
    description: 'Electron (Chromium + Node.js)',
  },
  qt: {
    files: ['Qt5Core.dll', 'Qt6Core.dll', 'Qt5Gui.dll', 'Qt6Gui.dll'],
    dirs: [],
    description: 'Qt (C++)',
  },
  dotnet: {
    files: ['clr.dll', 'coreclr.dll', 'mscorlib.dll'],
    dirs: [],
    description: '.NET (C# / VB.NET)',
  },
} as const;

export async function phase1(): Promise<void> {
  console.log(chalk.gray('Searching for TRAE SOLO CN (TraeWork CN) installation...\n'));

  // Step 1: Find installation directory
  const installPath = findInstallation();
  if (!installPath) {
    console.log(chalk.red('✗ TRAE SOLO CN installation not found.'));
    console.log(chalk.gray('  Searched paths:'));
    SEARCH_PATHS.forEach((p) => console.log(chalk.gray(`    - ${p}`)));
    return;
  }
  console.log(chalk.green(`✓ Installation found: ${installPath}\n`));

  // Step 2: Identify framework
  const spinner = ora('Analyzing framework...').start();
  const framework = detectFramework(installPath);
  spinner.succeed(`Framework: ${chalk.cyan(framework.description)}`);

  // Step 3: Detect version
  spinner.start('Detecting version...');
  const version = detectVersion(installPath);
  if (version) {
    spinner.succeed(`Version: ${chalk.cyan(version)}`);
  } else {
    spinner.warn('Could not detect version');
  }

  // Step 4: Map surface area
  spinner.start('Mapping data directories...');
  const dataDirs = mapDataDirectories();
  spinner.succeed(`Data directories found: ${chalk.cyan(String(dataDirs.length))}`);

  console.log(chalk.gray('\nData directories:'));
  dataDirs.forEach((dir) => {
    const exists = existsSync(dir);
    const marker = exists ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${marker} ${dir}`);
  });

  // Step 5: Summary
  console.log(chalk.cyan('\n─── Phase 1 Summary ───'));
  console.log(`  Framework:  ${framework.description}`);
  console.log(`  Version:    ${version ?? 'unknown'}`);
  console.log(`  Install:    ${installPath}`);
  console.log(`  Data dirs:  ${dataDirs.filter((d) => existsSync(d)).length} found`);
}

function findInstallation(): string | null {
  for (const path of SEARCH_PATHS) {
    if (existsSync(path) && statSync(path).isDirectory()) {
      return path;
    }
  }
  return null;
}

function detectFramework(installPath: string): { type: string; description: string } {
  const files = readdirSync(installPath);
  
  for (const [type, sig] of Object.entries(FRAMEWORK_SIGNATURES)) {
    const matchCount = sig.files.filter((f) => files.includes(f)).length;
    if (matchCount > 0) {
      return { type, description: sig.description };
    }
  }

  return { type: 'unknown', description: 'Unknown (possibly Native Win32)' };
}

function detectVersion(installPath: string): string | null {
  // Try to find version from package.json (Electron app)
  const packageJsonPaths = [
    join(installPath, 'resources', 'app', 'package.json'),
    join(installPath, 'resources', 'app.asar.unpacked', 'package.json'),
  ];
  for (const packageJsonPath of packageJsonPaths) {
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.version) return pkg.version;
      } catch {
        // fall through
      }
    }
  }

  // Try Windows file version info via PowerShell (try each possible exe name)
  for (const exeName of EXE_NAMES) {
    const exePath = join(installPath, exeName);
    if (existsSync(exePath)) {
      try {
        const cmd = `(Get-ItemProperty '${exePath}').VersionInfo.FileVersion`;
        const version = execSync(`powershell -Command "${cmd}"`, { encoding: 'utf-8' }).trim();
        if (version) return version;
      } catch {
        // fall through
      }
    }
  }

  return null;
}

function mapDataDirectories(): string[] {
  const dirs: string[] = [];
  
  const appDataDirs: string[] = [];
  if (process.env.APPDATA) appDataDirs.push(process.env.APPDATA);
  if (process.env.LOCALAPPDATA) appDataDirs.push(process.env.LOCALAPPDATA);

  for (const baseDir of appDataDirs) {
    for (const dirName of DATA_DIR_NAMES) {
      const basePath = join(baseDir, dirName);
      dirs.push(
        basePath,
        join(basePath, 'User', 'globalStorage'),
        join(basePath, 'Local Storage'),
        join(basePath, 'Session Storage'),
        join(basePath, 'Cookies'),
        join(basePath, 'Local Storage', 'leveldb'),
        join(basePath, 'Session Storage', 'leveldb'),
      );
    }
  }

  return dirs;
}

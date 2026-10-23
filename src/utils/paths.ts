/**
 * 集中管理运行时路径的动态解析，替代散布各处的硬编码盘符/用户名/安装目录。
 * 解析优先级：环境变量 → Node 内建推导 → 候选位置按存在性探测。
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 系统驱动盘根：SystemDrive 缺失时按标准值回退 */
function systemRoot(): string {
  return `${process.env.SystemDrive ?? 'C:'}\\`;
}

/** 系统级安装根（Program Files），环境变量缺失时按 SystemDrive 推导 */
export function programFiles(): string {
  return process.env.ProgramFiles ?? join(systemRoot(), 'Program Files');
}

/** 系统级 32 位安装根（Program Files (x86)） */
export function programFilesX86(): string {
  return process.env['ProgramFiles(x86)'] ?? join(systemRoot(), 'Program Files (x86)');
}

/** %APPDATA%：环境变量缺失时按 home 推导 */
export function appDataDir(): string {
  return process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
}

/** %LOCALAPPDATA%：环境变量缺失时按 home 推导 */
export function localAppDataDir(): string {
  return process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
}

/** TRAE 应用数据目录名候选：官方同时使用 "Trae CN"、"TRAE SOLO CN" 与 "TraeWork CN"。
 *  顺序即优先级：2026-10 起桌面客户端改名为 "Trae CN"（%LOCALAPPDATA%\Programs\Trae CN），
 *  旧安装名保留在候选列表尾部以兼容历史数据目录。 */
export const TRAE_APP_DIR_NAMES = ['Trae CN', 'TRAE SOLO CN', 'TraeWork CN'] as const;

let cachedProjectRoot: string | null = null;

/** 项目根：从模块位置逐级上溯找 package.json，兼容 tsx 源码与 tsc 编译输出两种运行方式 */
export function projectRoot(): string {
  if (cachedProjectRoot) return cachedProjectRoot;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      cachedProjectRoot = dir;
      return dir;
    }
    dir = dirname(dir);
  }
  cachedProjectRoot = resolve(process.cwd());
  return cachedProjectRoot;
}

/** 安装目录根候选：用户级 NSIS（%LOCALAPPDATA%\Programs）优先于系统级 */
export function installRoots(): string[] {
  return [join(localAppDataDir(), 'Programs'), programFiles(), programFilesX86()];
}

/**
 * 在 %APPDATA%/%LOCALAPPDATA% 按两种应用目录名探测 TRAE 用户数据文件。
 * segments 为相对用户数据目录的片段，如 ['User', 'globalStorage', 'storage.json']。
 */
export function findUserDataPath(...segments: string[]): string | null {
  for (const base of [appDataDir(), localAppDataDir()]) {
    for (const name of TRAE_APP_DIR_NAMES) {
      const p = join(base, name, ...segments);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** 定位凭据存储 User/globalStorage/storage.json */
export function findStorageJson(): string | null {
  return findUserDataPath('User', 'globalStorage', 'storage.json');
}

/**
 * 动态探测解包后的 resources/app/out/main.js（byteCrypto 需实体文件提取密表）。
 * 覆盖用户级与系统级安装、两种应用名。
 */
export function findMainJs(): string | null {
  for (const root of installRoots()) {
    for (const name of TRAE_APP_DIR_NAMES) {
      const p = join(root, name, 'resources', 'app', 'out', 'main.js');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * 定位 Local Storage/leveldb 下任一 .ldb 文件。
 * leveldb 文件名随压缩滚动，不可写死，运行时取首个。
 */
export function findLeveldbLdb(): string | null {
  const dir = findUserDataPath('Local Storage', 'leveldb');
  if (!dir) return null;
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.ldb')) return join(dir, f);
  }
  return null;
}

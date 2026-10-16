export { shannonEntropy, classifyEntropy, blockEntropy } from './entropy.js';
export { identifyMagic, hexDump, toHex, KNOWN_SIGNATURES } from './magic.js';
export type { MagicSignature } from './magic.js';
export {
  appDataDir,
  localAppDataDir,
  programFiles,
  programFilesX86,
  TRAE_APP_DIR_NAMES,
  projectRoot,
  installRoots,
  findUserDataPath,
  findStorageJson,
  findMainJs,
  findLeveldbLdb,
} from './paths.js';

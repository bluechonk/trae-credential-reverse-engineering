/**
 * Focused format-analysis on credential-relevant files (phase3 evidence).
 * Prints entropy + magic for the handful of files that matter.
 */
import { readFileSync } from 'node:fs';
import { shannonEntropy, classifyEntropy, identifyMagic } from '../src/utils/index.js';

const targets = [
  'C:/Users/Cecilia/AppData/Roaming/TRAE SOLO CN/User/globalStorage/storage.json',
  'C:/Users/Cecilia/AppData/Roaming/TRAE SOLO CN/User/globalStorage/state.vscdb',
  'C:/Users/Cecilia/AppData/Roaming/TRAE SOLO CN/Local Storage/leveldb/000184.ldb',
];

for (const p of targets) {
  try {
    const data = readFileSync(p);
    const magic = identifyMagic(data.subarray(0, 64));
    const ent = shannonEntropy(data);
    const cls = classifyEntropy(ent);
    const short = p.split('/').slice(-2).join('/');
    const sizeKB = (data.length / 1024).toFixed(1);
    console.log(`${short}`);
    console.log(`  size=${sizeKB}KB  magic=${magic?.name ?? '?'}  entropy=${ent.toFixed(2)} (${cls.level})`);
    // encrypted value lengths inside storage.json
    if (p.endsWith('storage.json')) {
      const j = JSON.parse(data.toString('utf-8')) as Record<string, string>;
      for (const [k, v] of Object.entries(j)) {
        if (k.startsWith('iCube') && typeof v === 'string' && v.length > 32) {
          const vEnt = shannonEntropy(Buffer.from(v, 'utf-8'));
          console.log(`  ${k.slice(0, 34)}…  len=${v.length}  valueEntropy=${vEnt.toFixed(2)}`);
        }
      }
    }
  } catch (e) {
    console.log(`${p} -> ERROR ${(e as Error).message}`);
  }
}

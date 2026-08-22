// Decrypt TRAE dynamic config cache (Local Storage/config.db)
import { createHash, createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';

const file = 'C:/Users/Cecilia/AppData/Roaming/TRAE SOLO CN/Local Storage/config.db';
const nameShort = 'TRAE SOLO CN';

const raw = readFileSync(file);
const iv = raw.subarray(0, 16);
const ct = raw.subarray(16);
const key = Buffer.from(createHash('md5').update(nameShort).digest('hex'), 'utf-8'); // 32 bytes
const d = createDecipheriv('aes-256-cbc', key, iv);
let out = Buffer.concat([d.update(ct), d.final()]);
const cfg = JSON.parse(out.toString('utf-8'));

console.log('top-level keys:', Object.keys(cfg).join(', '));
const auth = (cfg as any)?.iCubeApp?.authConfig;
if (auth) {
  console.log('\niCubeApp.authConfig =', JSON.stringify(auth, null, 2));
} else {
  // search recursively for authConfig
  const found: string[] = [];
  const walk = (o: any, p: string): void => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'authConfig') found.push(`${p}.${k} = ${JSON.stringify(v)}`);
      else if (typeof v === 'object') walk(v, `${p}.${k}`);
    }
  };
  walk(cfg, '$');
  console.log(found.length ? '\n' + found.join('\n') : '\n(no authConfig in dynamic config)');
}

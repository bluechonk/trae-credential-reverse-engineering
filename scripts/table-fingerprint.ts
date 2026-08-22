/**
 * Phase5 evidence: fingerprint the hardcoded byteCrypto tables extracted from out/main.js.
 * Values are masked — only length + SHA-256 prefix + first bytes shown.
 */
import { createHash } from 'node:crypto';
import { extractTablesFromMainJs } from '../src/phase6-decryption/byteCrypto.js';

const tables = extractTablesFromMainJs('C:/Program Files/TRAE SOLO CN/resources/app/out/main.js');

function fp(name: string, t: Uint8Array): void {
  const hex = Array.from(t.slice(0, 6)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const h = createHash('sha256').update(t).digest('hex').slice(0, 16);
  console.log(`${name}: len=${t.length}  head=[${hex} …]  sha256=${h}…`);
}

fp('Hie', tables.hie);
fp('Wie', tables.wie);
fp('Vie', tables.vie);
fp('Qie', tables.qie);

const pepperAES = Uint8Array.from(tables.vie.map((b, i) => b ^ tables.qie[i]));
const pepperPriv = Uint8Array.from(tables.hie.map((b, i) => b ^ tables.wie[i]));
fp('pepper(AES)= Vie^Qie', pepperAES);
fp('pepper(PRIV)= Hie^Wie', pepperPriv);

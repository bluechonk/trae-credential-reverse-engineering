import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

const dc = JSON.parse(readFileSync('D:/Projects/trae-credential-reverse-engineering/output/phase6/decrypted/iCubeAuthInfo_icube_dc_1448485154478571.json', 'utf-8')) as Record<string, string>;

for (const name of ['privateKeyPEM', 'publicKeyPEM'] as const) {
  const pem = dc[name];
  const lines = pem.split('\n');
  console.log(`--- ${name}: ${lines.length} lines ---`);
  lines.forEach((l, i) => {
    const shown = l.length > 40 ? l.slice(0, 20) + `…(${l.length})` + l.slice(-8) : l;
    console.log(`  [${i}] len=${l.length}  ${shown}`);
  });
}

try {
  const k = createPrivateKey(dc.privateKeyPEM);
  console.log('\ncreatePrivateKey OK:', k.asymmetricKeyType, k.asymmetricKeyDetails);
} catch (e) {
  console.log('\ncreatePrivateKey FAILED:', (e as Error).message);
}

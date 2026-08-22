import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

const dc = JSON.parse(readFileSync('D:/Projects/trae-credential-reverse-engineering/output/phase6/decrypted/iCubeAuthInfo_icube_dc_1448485154478571.json', 'utf-8')) as Record<string, string>;

console.log('keys in dc file:', Object.keys(dc).join(', '));
const priv: string = dc.privateKeyPEM;
const pub: string = dc.publicKeyPEM;

const fpPub = (pem: string): string => {
  const der = createPublicKey(pem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex').slice(0, 16);
};

const privKey = createPrivateKey(priv);
const derivedPub = createPublicKey(privKey);
console.log('stored public  fp:', fpPub(pub));
console.log('derived public fp:', fpPub(derivedPub.export({ type: 'spki', format: 'pem' }).toString()));
console.log('MATCH:', fpPub(pub) === fpPub(derivedPub.export({ type: 'spki', format: 'pem' }).toString()) ? 'YES' : 'NO (keypair mismatch!)');

// also compare raw base64 body of public keys
const body = (p: string) => p.split('\n').filter((l) => l && !l.includes('-----')).join('');
console.log('pub body equal:', body(pub) === body(derivedPub.export({ type: 'spki', format: 'pem' }).toString()) ? 'YES' : 'NO');

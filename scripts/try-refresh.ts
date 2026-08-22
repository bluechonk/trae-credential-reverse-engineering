import { exchangeTokenByRefreshToken } from '../src/phase6-decryption/traeClient.js';

const mode = process.argv[2] ?? 'der';
const sep = mode === 'space' ? ' ' : '\n';
const enc = mode === 'p1363' ? 'ieee-p1363' as const : 'der' as const;
console.log(`trying: separator=${sep === ' ' ? 'SPACE' : 'NEWLINE'} dsaEncoding=${enc}`);
const r = await exchangeTokenByRefreshToken(sep, enc);
if (r.ok) {
  console.log('OK newToken=' + (r.newToken ?? '').slice(0, 12) + `… len=${(r.newToken ?? '').length}`);
  console.log('   refreshToken=' + (r.newRefreshToken ?? '').slice(0, 10) + `… len=${(r.newRefreshToken ?? '').length}`);
} else {
  console.log('FAIL ' + r.error);
}

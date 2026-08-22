import { readFileSync } from 'node:fs';

const c = JSON.parse(readFileSync('output/phase6/decrypted/iCubeAuthInfo_icube_cloudide.json', 'utf-8'));
console.log('tokenReleaseAt:', c.tokenReleaseAt);
console.log('expiredAt     :', c.expiredAt);
console.log('refreshExpired:', c.refreshExpiredAt);

const parts = c.token.split('.');
const p = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
console.log('\nJWT iat:', new Date(p.iat * 1000).toISOString());
console.log('JWT exp:', new Date(p.exp * 1000).toISOString());
console.log('JWT claims keys:', Object.keys(p).join(','));
const masked = { ...p };
for (const k of Object.keys(masked)) {
  if (typeof masked[k] === 'string' && masked[k].length > 24) masked[k] = masked[k].slice(0, 8) + '***';
}
console.log('JWT claims:', JSON.stringify(masked).slice(0, 400));

// refreshToken structure analysis
const rt = c.refreshToken;
console.log('\nrefreshToken len:', rt.length, 'head:', rt.slice(0, 10) + '…');
const buf = Buffer.from(rt, 'base64');
console.log('decoded bytes:', buf.length, 'first16 hex:', buf.subarray(0, 16).toString('hex'));
// protobuf heuristic walk
let off = 0;
function readVarint(b: Buffer, o: number): [number, number] {
  let shift = 0, val = 0n;
  while (true) {
    const byte = b[o++];
    val |= BigInt(byte & 0x7f) << BigInt(shift);
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [Number(val), o];
}
try {
  while (off < buf.length && off < 200) {
    const start = off;
    const [tag, o1] = readVarint(buf, off);
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire === 2) {
      const [len, o2] = readVarint(buf, o1);
      const data = buf.subarray(o2, Math.min(o2 + len, buf.length));
      const printable = /^[\x20-\x7e\s]+$/.test(data.toString('latin1'));
      console.log(`field ${field} (len-delimited, ${len}B): ${printable ? JSON.stringify(data.toString('utf-8').slice(0, 60)) : data.toString('hex').slice(0, 40) + '…'}`);
      off = o2 + len;
    } else if (wire === 0) {
      const [v, o2] = readVarint(buf, o1);
      console.log(`field ${field} (varint): ${v}`);
      off = o2;
    } else {
      console.log(`field ${field} wire${wire} @${start} — stop`);
      break;
    }
  }
} catch (e) {
  console.log('protobuf walk failed:', (e as Error).message);
}

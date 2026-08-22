/**
 * Frida Hook Script — Phase 5: Key Extraction
 * 
 * Advanced hooking for key extraction:
 *   - Intercepts all crypto operations
 *   - Captures key derivation inputs/outputs
 *   - Dumps memory buffers for analysis
 * 
 * Usage:
 *   frida -n "TRAE SOLO CN.exe" -f hook-decrypt.js
 */

const crypto = require('crypto');

// ─── Track all keys used ───
const capturedKeys = new Set();

function trackKey(algorithm, key, iv) {
  const keyHex = key.toString('hex');
  if (capturedKeys.has(keyHex)) return;
  capturedKeys.add(keyHex);

  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║     NEW KEY CAPTURED                  ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log('║ Algorithm :', algorithm);
  console.log('║ Key (hex) :', keyHex);
  console.log('║ Key (b64) :', key.toString('base64'));
  console.log('║ Key length:', key.length, 'bytes (' + (key.length * 8) + ' bits)');
  if (iv) {
    console.log('║ IV (hex)  :', iv.toString('hex'));
  }
  console.log('╚═══════════════════════════════════════╝\n');
}

// ─── Hook createCipheriv / createDecipheriv ───
const origCreateCipheriv = crypto.createCipheriv;
const origCreateDecipheriv = crypto.createDecipheriv;

crypto.createCipheriv = function (algorithm, key, iv) {
  trackKey(algorithm, key, iv);
  return origCreateCipheriv.call(this, algorithm, key, iv);
};

crypto.createDecipheriv = function (algorithm, key, iv) {
  trackKey(algorithm, key, iv);
  return origCreateDecipheriv.call(this, algorithm, key, iv);
};

// ─── Hook PBKDF2 to capture derived keys ───
const origPbkdf2Sync = crypto.pbkdf2Sync;
crypto.pbkdf2Sync = function (password, salt, iterations, keylen, digest) {
  const result = origPbkdf2Sync.call(this, password, salt, iterations, keylen, digest);
  
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║     PBKDF2 DERIVATION                 ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log('║ Iterations :', iterations);
  console.log('║ Key length  :', keylen);
  console.log('║ Digest     :', digest);
  console.log('║ Password   :', typeof password === 'string' ? password : password.toString('hex'));
  console.log('║ Salt (hex) :', salt.toString('hex').substring(0, 128));
  console.log('║ Output     :', result.toString('hex'));
  console.log('╚═══════════════════════════════════════╝\n');
  
  return result;
};

// ─── Hook createHash ───
const origCreateHash = crypto.createHash;
crypto.createHash = function (algorithm) {
  const hash = origCreateHash.call(this, algorithm);
  const origUpdate = hash.update;
  const origDigest = hash.digest;

  hash.update = function (data) {
    return origUpdate.call(this, data);
  };

  hash.digest = function (encoding) {
    const result = origDigest.call(this, encoding);
    console.log('[Hash] algorithm:', algorithm, 'result:', typeof result === 'string' ? result : result.toString('hex'));
    return result;
  };

  return hash;
};

console.log('[Frida Hook] Advanced key extraction hooks installed');
console.log('[Frida Hook] Captured keys will be displayed in real-time');
console.log('[Frida Hook] Trigger login or credential refresh to capture keys\n');

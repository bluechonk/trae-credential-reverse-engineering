/**
 * Frida Hook Script — Phase 4: Encryption Identification
 * 
 * Hooks Node.js crypto module to capture:
 *   - Encryption/decryption algorithm
 *   - Key material
 *   - IV (Initialization Vector)
 * 
 * Usage:
 *   frida -n "TRAE SOLO CN.exe" -f hook-crypto.js
 *   frida -p <pid> -f hook-crypto.js
 */

// Hook crypto.createCipheriv
const crypto = require('crypto');
const origCreateCipheriv = crypto.createCipheriv;
const origCreateDecipheriv = crypto.createDecipheriv;

crypto.createCipheriv = function (algorithm, key, iv) {
  console.log('\n═══════════════════════════════════════');
  console.log('[Cipheriv] Encryption call detected');
  console.log('  Algorithm :', algorithm);
  console.log('  Key (hex) :', key.toString('hex'));
  console.log('  Key (len) :', key.length, 'bytes');
  if (iv) {
    console.log('  IV (hex)  :', iv.toString('hex'));
    console.log('  IV (len)  :', iv.length, 'bytes');
  }
  console.log('═══════════════════════════════════════\n');
  return origCreateCipheriv.call(this, algorithm, key, iv);
};

crypto.createDecipheriv = function (algorithm, key, iv) {
  console.log('\n═══════════════════════════════════════');
  console.log('[Decipheriv] Decryption call detected');
  console.log('  Algorithm :', algorithm);
  console.log('  Key (hex) :', key.toString('hex'));
  console.log('  Key (len) :', key.length, 'bytes');
  if (iv) {
    console.log('  IV (hex)  :', iv.toString('hex'));
    console.log('  IV (len)  :', iv.length, 'bytes');
  }
  console.log('═══════════════════════════════════════\n');
  return origCreateDecipheriv.call(this, algorithm, key, iv);
};

// Also hook legacy createCipher/createDecipher
const origCreateCipher = crypto.createCipher;
const origCreateDecipher = crypto.createDecipher;

crypto.createCipher = function (algorithm, password) {
  console.log('\n═══════════════════════════════════════');
  console.log('[createCipher] Legacy encryption call');
  console.log('  Algorithm :', algorithm);
  console.log('  Password  :', typeof password === 'string' ? password : password.toString('hex'));
  console.log('═══════════════════════════════════════\n');
  return origCreateCipher.call(this, algorithm, password);
};

crypto.createDecipher = function (algorithm, password) {
  console.log('\n═══════════════════════════════════════');
  console.log('[createDecipher] Legacy decryption call');
  console.log('  Algorithm :', algorithm);
  console.log('  Password  :', typeof password === 'string' ? password : password.toString('hex'));
  console.log('═══════════════════════════════════════\n');
  return origCreateDecipher.call(this, algorithm, password);
};

// Hook PBKDF2 if used
const origPbkdf2 = crypto.pbkdf2;
const origPbkdf2Sync = crypto.pbkdf2Sync;

crypto.pbkdf2 = function (password, salt, iterations, keylen, digest, callback) {
  console.log('\n═══════════════════════════════════════');
  console.log('[PBKDF2] Key derivation detected');
  console.log('  Iterations:', iterations);
  console.log('  Key length:', keylen);
  console.log('  Digest    :', digest);
  console.log('  Salt (hex):', salt.toString('hex').substring(0, 64));
  console.log('═══════════════════════════════════════\n');
  return origPbkdf2.call(this, password, salt, iterations, keylen, digest, callback);
};

console.log('[Frida Hook] crypto module hooks installed successfully');
console.log('[Frida Hook] Waiting for crypto operations...\n');

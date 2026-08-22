/**
 * byteCrypto.ts — TRAE SOLO CN custom credential envelope (reverse engineered).
 *
 * Source: out-build/vs/base/common/byteCrypto.js inside out/main.js
 *
 * Envelope (version "tc" / AES mode):
 *   [0..2)  magic  't','c'      (116, 99)
 *   [2]     version 5
 *   [3]     random length / 2? stored as 16 (RP)
 *   [4..6)  reserved 0,0
 *   [6..38) random 32 bytes (crypto.getRandomValues)
 *   [38..)  AES-128-CBC(key, iv, SHA512(plaintext) || plaintext)
 *
 * Key derivation (Rie):
 *   pepper = tableA[i] ^ tableB[i]  (64 bytes, hardcoded tables from bundle)
 *   n      = SHA512(random) || pepper           (128 bytes)
 *   d      = SHA512(n)
 *   mat    = d || pepper                        (128 bytes)
 *   key    = mat[0:16], iv = mat[16:32]
 *
 * Modes (ROe):
 *   AES         header tc 05 10 00 00, pepper = Vie ^ Qie
 *   AES_PRIVATE header [18,57,18,32,2,3], pepper = Hie ^ Wie
 */

import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

const RH = 64; // SHA-512 digest length
const RANDOM_LEN = 32;
const KEY_LEN = 16;
const IV_LEN = 16;
const HEADER_LEN = 6;

export interface ByteCryptoTables {
  hie: Uint8Array;
  wie: Uint8Array;
  vie: Uint8Array;
  qie: Uint8Array;
}

/** Extract the four hardcoded tables directly from the installed out/main.js */
export function extractTablesFromMainJs(mainJsPath: string): ByteCryptoTables {
  const src = readFileSync(mainJsPath, 'utf-8');

  // Tables sit shortly before the Em/Pv arrow functions inside byteCrypto chunk
  const anchor = src.indexOf(',Em=async t=>');
  if (anchor < 0) throw new Error('Anchor "Em=async" not found in main.js');
  const region = src.slice(Math.max(0, anchor - 8000), anchor);

  const arrayRe = /(?:new\s+Uint8Array|Uint8Array\.from)\(\s*\[\s*([0-9\s*,]+?)\s*\]\s*\)/g;
  const found: number[][] = [];
  let m: RegExpExecArray | null;
  while ((m = arrayRe.exec(region)) !== null) {
    const nums = m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (nums.length >= 64) found.push(nums);
  }
  if (found.length < 4) {
    throw new Error(`Expected >=4 tables near byteCrypto chunk, found ${found.length}`);
  }
  const four = found.slice(-4);
  return {
    hie: Uint8Array.from(four[0].slice(0, 64)),
    wie: Uint8Array.from(four[1].slice(0, 64)),
    vie: Uint8Array.from(four[2].slice(0, 64)),
    qie: Uint8Array.from(four[3].slice(0, 64)),
  };
}

async function sha512(data: Uint8Array): Promise<Uint8Array> {
  const digest = await webcrypto.subtle.digest('SHA-512', data as unknown as BufferSource);
  return new Uint8Array(digest);
}

function xorTables(a: Uint8Array, b: Uint8Array, len = 64): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = a[i] ^ b[i];
  return out;
}

export type BlobMode = 'AES' | 'AES_PRIVATE' | 'UNKNOWN';

/** Detect envelope mode from the 6-byte header (mirrors ROe) */
export function detectMode(header: Uint8Array): BlobMode {
  const t = header;
  if (
    t.length >= 6 &&
    t[0] === 116 && t[1] === 99 &&
    t[2] === 5 && t[3] === 16 && t[4] === 0 && t[5] === 0
  ) return 'AES';
  if (
    t.length >= 6 &&
    t[0] === 18 && t[1] === 57 &&
    t[2] === 18 && t[3] === 32 && t[4] === 2 && t[5] === 3
  ) return 'AES_PRIVATE';
  return 'UNKNOWN';
}

interface DerivedKeys { aesKey: Uint8Array; iv: Uint8Array }

/** Mirror of Rie(): derive AES key + IV from the stored random bytes */
async function deriveKeys(random: Uint8Array, mode: BlobMode): Promise<DerivedKeys> {
  const tables = getTables();
  const pepper = mode === 'AES_PRIVATE'
    ? xorTables(tables.hie, tables.wie)
    : xorTables(tables.vie, tables.qie);

  const n = new Uint8Array(RH + 64); // 128
  const o = await sha512(random); // 64
  n.set(o, 0);
  n.set(pepper, RH);

  const c = await sha512(n); // hash the whole 128
  n.set(c, 0);
  // n is now [SHA512(SHA512(rand)||pepper) || pepper]

  const aesKey = n.slice(0, KEY_LEN);
  const iv = n.slice(KEY_LEN, KEY_LEN + IV_LEN);
  return { aesKey, iv };
}

let _tables: ByteCryptoTables | null = null;
export function setTables(t: ByteCryptoTables): void { _tables = t; }
function getTables(): ByteCryptoTables {
  if (!_tables) throw new Error('Tables not initialized — call setTables()/initFromMainJs() first');
  return _tables;
}

export function initFromMainJs(mainJsPath: string): void {
  setTables(extractTablesFromMainJs(mainJsPath));
}

async function aesCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await webcrypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'AES-CBC' },
    false,
    ['decrypt'],
  );
  try {
    const plain = await webcrypto.subtle.decrypt(
      { name: 'AES-CBC', iv: iv as unknown as BufferSource },
      k,
      data as unknown as BufferSource,
    );
    return new Uint8Array(plain);
  } catch {
    return new Uint8Array(0);
  }
}

export interface DecryptResult {
  ok: boolean;
  mode: BlobMode;
  reason?: string;
  plaintext?: string;
}

/** Decrypt one base64 blob produced by TRAE's byteCrypto Em(). */
export async function decryptBlob(b64: string): Promise<DecryptResult> {
  const raw = new Uint8Array(Buffer.from(b64, 'base64'));
  const mode = detectMode(raw.subarray(0, 6));
  if (mode === 'UNKNOWN') {
    return { ok: false, mode, reason: `Unknown header: ${Buffer.from(raw.subarray(0, 6)).toString('hex')}` };
  }

  const random = raw.subarray(HEADER_LEN, HEADER_LEN + RANDOM_LEN);
  if (random.length !== RANDOM_LEN) return { ok: false, mode, reason: 'Blob too short' };

  const { aesKey, iv } = await deriveKeys(random, mode);
  const cipherText = raw.subarray(HEADER_LEN + RANDOM_LEN);

  const padded = await aesCbcDecrypt(aesKey, iv, cipherText);
  if (padded.length <= RH) return { ok: false, mode, reason: 'AES-CBC decrypt failed (bad tag/padding?)' };

  const expectedTag = padded.subarray(0, RH);
  const body = padded.subarray(RH);
  const actualTag = await sha512(body);

  for (let i = 0; i < RH; i++) {
    if (expectedTag[i] !== actualTag[i]) {
      return { ok: false, mode, reason: 'Integrity check failed (SHA-512 mismatch)' };
    }
  }

  return { ok: true, mode, plaintext: new TextDecoder().decode(body) };
}

async function aesCbcEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await webcrypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  );
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-CBC', iv: iv as unknown as BufferSource },
    k,
    data as unknown as BufferSource,
  );
  return new Uint8Array(cipher);
}

/** Re-encrypt plaintext into TRAE byteCrypto envelope (mirrors jOe/Em) → base64 */
export async function encryptBlob(plaintext: string): Promise<string> {
  const random = webcrypto.getRandomValues(new Uint8Array(RANDOM_LEN));
  const { aesKey, iv } = await deriveKeys(random, 'AES');

  const body = new TextEncoder().encode(plaintext);
  const tag = await sha512(body);
  const payload = new Uint8Array(RH + body.length);
  payload.set(tag, 0);
  payload.set(body, RH);

  const cipher = await aesCbcEncrypt(aesKey, iv, payload);

  const header = Uint8Array.from([116, 99, 5, 16, 0, 0]);
  const out = new Uint8Array(header.length + random.length + cipher.length);
  out.set(header, 0);
  out.set(random, header.length);
  out.set(cipher, header.length + random.length);
  return Buffer.from(out).toString('base64');
}

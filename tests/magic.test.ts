import { describe, it, expect } from 'vitest';
import { identifyMagic, hexDump, toHex } from '../src/utils/magic.js';

describe('identifyMagic', () => {
  it('should identify JSON object', () => {
    const data = Buffer.from('{"token":"abc"}', 'utf-8');
    const result = identifyMagic(data);
    expect(result?.name).toBe('JSON');
  });

  it('should identify SQLite', () => {
    const header = 'SQLite format 3\x00';
    const data = Buffer.from(header, 'ascii');
    const result = identifyMagic(data);
    expect(result?.name).toBe('SQLITE');
  });

  it('should identify PNG', () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = identifyMagic(data);
    expect(result?.name).toBe('PNG');
  });

  it('should return null for empty buffer', () => {
    const data = Buffer.alloc(0);
    expect(identifyMagic(data)).toBeNull();
  });

  it('should return null for unknown format', () => {
    const data = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    expect(identifyMagic(data)).toBeNull();
  });
});

describe('hexDump', () => {
  it('should format hex dump correctly', () => {
    const data = Buffer.from('Hello World!', 'utf-8');
    const dump = hexDump(data, 64);
    expect(dump).toContain('48 65 6c 6c 6f'); // "Hello" in hex
    expect(dump).toContain('|Hello');
  });
});

describe('toHex', () => {
  it('should format bytes as hex', () => {
    expect(toHex(Buffer.from([0x48, 0x65]))).toBe('48 65');
  });

  it('should format with custom separator', () => {
    expect(toHex(Buffer.from([0x48, 0x65]), '-')).toBe('48-65');
  });
});

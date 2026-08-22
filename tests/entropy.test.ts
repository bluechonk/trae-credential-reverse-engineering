import { describe, it, expect } from 'vitest';
import { shannonEntropy, classifyEntropy, blockEntropy } from '../src/utils/entropy.js';

describe('shannonEntropy', () => {
  it('should return 0 for empty buffer', () => {
    expect(shannonEntropy(Buffer.alloc(0))).toBe(0);
  });

  it('should return 0 for single repeated byte', () => {
    const data = Buffer.alloc(100, 0x41); // all 'A'
    expect(shannonEntropy(data)).toBeCloseTo(0, 5);
  });

  it('should return 1.0 for alternating 2 bytes', () => {
    const data = Buffer.from([0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff]);
    expect(shannonEntropy(data)).toBeCloseTo(1.0, 5);
  });

  it('should return ~8.0 for high-entropy random data', () => {
    // Simulate encrypted data with high entropy
    const data = Buffer.from(
      Array.from({ length: 256 }, () => Math.floor(Math.random() * 256))
    );
    const entropy = shannonEntropy(data);
    expect(entropy).toBeGreaterThan(7.0);
  });

  it('should return low entropy for plaintext', () => {
    const data = Buffer.from('{"token":"abc123","user":"test"}', 'utf-8');
    const entropy = shannonEntropy(data);
    expect(entropy).toBeLessThan(5.0);
  });
});

describe('classifyEntropy', () => {
  it('should classify high entropy correctly', () => {
    const result = classifyEntropy(7.8);
    expect(result.level).toBe('high');
    expect(result.description).toContain('encryption');
  });

  it('should classify medium entropy correctly', () => {
    const result = classifyEntropy(6.0);
    expect(result.level).toBe('medium');
  });

  it('should classify low entropy correctly', () => {
    const result = classifyEntropy(3.5);
    expect(result.level).toBe('low');
  });
});

describe('blockEntropy', () => {
  it('should split data into blocks', () => {
    const data = Buffer.alloc(512, 0x41);
    const blocks = blockEntropy(data, 256);
    expect(blocks.length).toBe(2);
    expect(blocks[0].offset).toBe(0);
    expect(blocks[1].offset).toBe(256);
  });

  it('should handle partial last block', () => {
    const data = Buffer.alloc(300, 0x41);
    const blocks = blockEntropy(data, 256);
    expect(blocks.length).toBe(2);
    expect(blocks[1].size).toBe(44);
  });
});

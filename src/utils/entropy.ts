/**
 * Shannon entropy analysis utilities.
 * 
 * Used in Phase 3 to distinguish encryption from plaintext:
 *   > 7.5 bits/byte  → Strong encryption (AES) or compression
 *   5.0 - 7.5        → Weak encryption, encoding, or mixed content
 *   < 5.0            → Plaintext or simple substitution
 */

/**
 * Calculate Shannon entropy of a byte buffer.
 * Returns value in bits per byte (0.0 - 8.0).
 */
export function shannonEntropy(data: Buffer): number {
  if (data.length === 0) return 0;

  const frequency = new Map<number, number>();
  for (const byte of data) {
    frequency.set(byte, (frequency.get(byte) ?? 0) + 1);
  }

  let entropy = 0;
  const len = data.length;
  for (const count of frequency.values()) {
    const probability = count / len;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  return entropy;
}

/**
 * Classify entropy value into a human-readable category.
 */
export function classifyEntropy(entropy: number): {
  level: 'low' | 'medium' | 'high';
  description: string;
} {
  if (entropy > 7.5) {
    return { level: 'high', description: 'Strong encryption (AES) or compression' };
  }
  if (entropy >= 5.0) {
    return { level: 'medium', description: 'Weak encryption, encoding, or mixed content' };
  }
  return { level: 'low', description: 'Plaintext or simple substitution' };
}

/**
 * Calculate entropy for each block of a file.
 * Useful for detecting partially encrypted files.
 */
export function blockEntropy(data: Buffer, blockSize = 256): Array<{
  offset: number;
  size: number;
  entropy: number;
}> {
  const results: Array<{ offset: number; size: number; entropy: number }> = [];
  
  for (let offset = 0; offset < data.length; offset += blockSize) {
    const block = data.subarray(offset, Math.min(offset + blockSize, data.length));
    results.push({
      offset,
      size: block.length,
      entropy: shannonEntropy(block),
    });
  }

  return results;
}

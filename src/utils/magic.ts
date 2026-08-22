/**
 * Magic bytes identification utilities.
 * 
 * Used in Phase 3 to identify file formats from their headers.
 */

export interface MagicSignature {
  name: string;
  mimeType: string;
  extension: string;
  magic: number[];
  description: string;
}

/**
 * Known file format signatures.
 */
export const KNOWN_SIGNATURES: MagicSignature[] = [
  { name: 'JSON', mimeType: 'application/json', extension: '.json', magic: [0x7b, 0x22], description: 'JSON object' },
  { name: 'JSON_ARRAY', mimeType: 'application/json', extension: '.json', magic: [0x5b, 0x7b], description: 'JSON array of objects' },
  { name: 'SQLITE', mimeType: 'application/x-sqlite3', extension: '.db', magic: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65], description: 'SQLite 3 database' },
  { name: 'PNG', mimeType: 'image/png', extension: '.png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a], description: 'PNG image' },
  { name: 'JPEG', mimeType: 'image/jpeg', extension: '.jpg', magic: [0xff, 0xd8, 0xff], description: 'JPEG image' },
  { name: 'GIF', mimeType: 'image/gif', extension: '.gif', magic: [0x47, 0x49, 0x46, 0x38], description: 'GIF image' },
  { name: 'PDF', mimeType: 'application/pdf', extension: '.pdf', magic: [0x25, 0x50, 0x44, 0x46], description: 'PDF document' },
  { name: 'ZIP', mimeType: 'application/zip', extension: '.zip', magic: [0x50, 0x4b, 0x03, 0x04], description: 'ZIP archive' },
  { name: 'GZIP', mimeType: 'application/gzip', extension: '.gz', magic: [0x1f, 0x8b], description: 'GZIP compressed' },
  { name: 'PE', mimeType: 'application/x-dosexec', extension: '.exe', magic: [0x4d, 0x5a], description: 'Windows PE executable' },
  { name: 'ELF', mimeType: 'application/x-executable', extension: '', magic: [0x7f, 0x45, 0x4c, 0x46], description: 'ELF executable' },
  { name: 'BROTLI', mimeType: 'application/octet-stream', extension: '.br', magic: [0xce, 0xb2, 0xcf, 0x81], description: 'Brotli compressed' },
];

/**
 * Identify file format from magic bytes.
 * Returns the matching signature or null if unknown.
 */
export function identifyMagic(data: Buffer): MagicSignature | null {
  if (data.length < 2) return null;

  for (const sig of KNOWN_SIGNATURES) {
    if (data.length < sig.magic.length) continue;
    
    let match = true;
    for (let i = 0; i < sig.magic.length; i++) {
      if (data[i] !== sig.magic[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig;
  }

  return null;
}

/**
 * Format bytes as hex string.
 */
export function toHex(bytes: number[] | Buffer, separator = ' '): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(separator);
}

/**
 * Dump first N bytes as formatted hex view.
 */
export function hexDump(data: Buffer, length = 64): string {
  const slice = data.subarray(0, Math.min(length, data.length));
  const lines: string[] = [];

  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.subarray(i, Math.min(i + 16, slice.length));
    const hex = Array.from(chunk)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(chunk)
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(48)}  |${ascii}|`);
  }

  return lines.join('\n');
}

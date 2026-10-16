// Read device-id keys from TRAE state.vscdb using Node's built-in sqlite
import { DatabaseSync } from 'node:sqlite';
import { findUserDataPath } from '../src/utils/index.js';

const dbPath = findUserDataPath('User', 'globalStorage', 'state.vscdb');
if (!dbPath) {
  console.error('TRAE User/globalStorage/state.vscdb not found (TRAE SOLO CN / TraeWork CN)');
  process.exit(1);
}
const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%device%' OR key LIKE '%install%'").all() as Array<{ key: string; value: unknown }>;
for (const r of rows) {
  let v = String(r.value);
  if (v.length > 100) v = v.slice(0, 100) + '…';
  console.log(r.key, '=', v);
}
db.close();

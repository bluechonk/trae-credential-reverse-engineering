// Read device-id keys from TRAE state.vscdb using Node's built-in sqlite
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('C:/Users/Cecilia/AppData/Roaming/TRAE SOLO CN/User/globalStorage/state.vscdb', { readOnly: true });
const rows = db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%device%' OR key LIKE '%install%'").all() as Array<{ key: string; value: unknown }>;
for (const r of rows) {
  let v = String(r.value);
  if (v.length > 100) v = v.slice(0, 100) + '…';
  console.log(r.key, '=', v);
}
db.close();

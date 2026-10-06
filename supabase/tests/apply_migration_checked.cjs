// Aplica UNA migración (con su propio BEGIN…COMMIT) en una sola sesión, solo si el SHA-256 del archivo coincide con el aprobado.
// Uso: node apply_migration_checked.cjs <archivo.sql> <sha256-aprobado>   (usa DATABASE_URL_592; no imprime credenciales)
const fs = require('fs'); const crypto = require('crypto'); const { Client } = require('pg');
const [file, expected] = process.argv.slice(2);
if (!file || !expected) { console.error('Uso: node apply_migration_checked.cjs <archivo.sql> <sha256>'); process.exit(2); }
const raw = fs.readFileSync(file);
const sha = crypto.createHash('sha256').update(raw).digest('hex');
console.log('SHA-256 del archivo :', sha);
console.log('SHA-256 aprobado    :', expected.toLowerCase());
if (sha !== expected.toLowerCase()) { console.error('RECHAZADO: el SHA no coincide con el aprobado. No se ejecutó nada.'); process.exit(3); }
const sql = raw.toString('utf8').replace(/\r/g, '');
if (!/^\s*begin\s*;/im.test(sql) || !/commit\s*;\s*$/i.test(sql.trim())) { console.error('RECHAZADO: el archivo debe tener BEGIN; y terminar en COMMIT;'); process.exit(3); }
const url = process.env.DATABASE_URL_592;
if (!url) { console.error('Falta DATABASE_URL_592'); process.exit(2); }
(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { await client.query(sql); console.log('APLICADA: COMMIT ejecutado.'); }
  catch (e) { console.error('ERROR SQL (la transacción no se confirmó):', e.code, e.message); try { await client.query('ROLLBACK'); } catch (_) {} process.exitCode = 1; }
  finally { await client.end(); }
})();

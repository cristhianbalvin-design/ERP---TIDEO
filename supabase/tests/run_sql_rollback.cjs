// Ejecuta UN archivo SQL en UNA sola sesión real (cliente pg) y muestra la última tabla de resultados.
// Seguridad: se niega si el archivo contiene COMMIT o no termina en ROLLBACK; además hace ROLLBACK al final siempre.
// Uso: node run_sql_rollback.cjs <archivo.sql>   (usa la variable de entorno DATABASE_URL_592; no imprime credenciales)
const fs = require('fs');
const { Client } = require('pg');
const file = process.argv[2];
if (!file) { console.error('Falta el archivo .sql'); process.exit(2); }
const sql = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
const url = process.env.DATABASE_URL_592;
if (!url) { console.error('Falta la variable DATABASE_URL_592'); process.exit(2); }
if (/^\s*commit\s*;/im.test(sql)) { console.error('RECHAZADO: el archivo contiene COMMIT'); process.exit(3); }
if (!/rollback\s*;\s*$/i.test(sql.trim())) { console.error('RECHAZADO: el archivo no termina en ROLLBACK;'); process.exit(3); }
(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const res = await client.query(sql);
    const list = Array.isArray(res) ? res : [res];
    const tables = list.filter(r => r.rows && r.rows.length && r.fields && r.fields.length);
    const last = tables[tables.length - 1];
    if (last) console.table(last.rows); else console.log('(sin tabla de resultados)');
  } catch (e) {
    console.error('ERROR SQL:', e.code, e.message);
    process.exitCode = 1;
  } finally {
    try { await client.query('ROLLBACK'); } catch (_) {}
    await client.end();
  }
})();

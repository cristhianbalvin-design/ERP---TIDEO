import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function checkDeps(periodoIds) {
  for (const id of periodoIds) {
    console.log(`\nRevisando dependencias para: ${id}`);
    const tables = ['nomina_detalle', 'prestamos_personal', 'comisiones_personal', 'novedades_nomina']; // add more if needed
    for (const table of tables) {
      // Not all tables have periodo_id, we will catch errors
      const { data, error } = await sb.from(table).select('id').eq('periodo_id', id).limit(1);
      if (error) {
        if (error.code !== 'PGRST205') console.log(`Error checking ${table}:`, error.message);
      } else if (data && data.length > 0) {
        console.log(`- TIENE DATOS EN: ${table}`);
      } else {
        console.log(`- No hay datos en: ${table}`);
      }
    }
  }
}

async function run() {
  console.log('--- REVISIÓN DE PERIODOS PARA DIFESMAQ ---');
  const ids = [
    'pnm_1782969337025_6b6yru', // Mensual
    'pnm_1783007194404_mnb9e5', // Q1
    'pnm_1783007194959_9ih79z'  // Q2
  ];
  await checkDeps(ids);
}
run();

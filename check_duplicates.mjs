import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function run() {
  console.log('--- BUSCANDO ÍNDICES ÚNICOS ---');
  const { data: indexData, error: idxErr } = await sb.rpc('get_schema');
  // Since we don't have a direct RPC for indexes, let's just query pg_indexes if possible, 
  // or just run a direct SQL query through the PostgREST API if exposed, or we can just try to insert a duplicate and see if it fails.
  // Actually, we can check pg_indexes if the user gave us a role that can read it.
  
  // Let's fetch all periodos_nomina
  const { data: per, error: pErr } = await sb.from('periodos_nomina').select('*').order('created_at', { ascending: true });
  console.log('--- TODOS LOS PERIODOS ---');
  for (const p of per) {
    console.log(`${p.created_at} | ID: ${p.id} | emp: ${p.empresa_id} | anio: ${p.anio} | mes: ${p.mes} | q: ${p.quincena} | ini: ${p.fecha_inicio} | fin: ${p.fecha_fin}`);
  }
  
  // Let's check nomina_detalle
  const { data: det, error: dErr } = await sb.from('nomina_detalle').select('id, periodo_id, trabajador_id');
  console.log(`--- NOMINA DETALLE (${det?.length || 0} registros) ---`);
  if (det && det.length > 0) {
    const workerPeriods = {};
    for (const d of det) {
      if (!workerPeriods[d.trabajador_id]) workerPeriods[d.trabajador_id] = [];
      workerPeriods[d.trabajador_id].push(d.periodo_id);
    }
    console.log(workerPeriods);
  } else {
    console.log("No hay registros en nomina_detalle.");
  }
}
run();

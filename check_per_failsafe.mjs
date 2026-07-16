import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function run() {
  const { data: periodos, error: perErr } = await sb.from('periodos_nomina').select('*');
  if (perErr) { console.error('Error:', perErr); return; }
  
  console.log('--- 9 PERÍODOS DE NÓMINA ---');
  for (const p of periodos) {
    const pValido = p != null && p.anio != null && p.mes != null;
    const pFin = pValido 
      ? new Date(p.anio, p.mes, 0) 
      : (p.fecha_fin ? new Date(`${p.fecha_fin}T00:00:00`) : null);
    const failsafeActivo = !pFin;
    console.log(`ID: ${p.id} | anio: ${p.anio === null ? 'null' : p.anio} | mes: ${p.mes === null ? 'null' : p.mes} | fecha_inicio: ${p.fecha_inicio === null ? 'null' : p.fecha_inicio} | fecha_fin: ${p.fecha_fin === null ? 'null' : p.fecha_fin} | estado: ${p.estado}`);
    console.log(`  -> periodoValido: ${pValido}`);
    console.log(`  -> periodoFin: ${pFin ? pFin.toISOString() : 'null'}`);
    console.log(`  -> FAILSAFE ACTIVO: ${failsafeActivo ? 'SI' : 'NO'}`);
  }
}

run();

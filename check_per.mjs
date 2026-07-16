import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function check() {
  const { data: allPer } = await sb.from('periodos_nomina').select('*');
  console.log('Total periodos_nomina:', allPer?.length);
  for (const p of allPer) {
    console.log(`ID: ${p.id} | mes: ${p.mes} | anio: ${p.anio} | fecha_inicio: ${p.fecha_inicio} | fecha_fin: ${p.fecha_fin}`);
  }
}
check();

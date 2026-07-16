import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function check() {
  const ids = ['pop_1780692098054', 'per_1780692730695', 'pop_1778367709112'];
  const { data: allNd, error } = await sb.from('nomina_detalle').select('*').in('trabajador_id', ids);
  console.log('All nomina_detalle for these 3:', allNd, error);

  // let's fetch all records in nomina_detalle just in case
  const { data: allRows } = await sb.from('nomina_detalle').select('*');
  if (allRows) {
    const mariano = allRows.filter(r => r.nombre_trabajador && r.nombre_trabajador.toLowerCase().includes('mariano'));
    console.log('Found Mariano by name in nomina_detalle:', mariano);
  }
}
check();

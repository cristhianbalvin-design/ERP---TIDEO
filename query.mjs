import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://atqwyjfidfoepthygfoo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjYxMjEsImV4cCI6MjA5MjkwMjEyMX0.IeJEAwujNSHX5cOUG8-8wheTfajABins4sMf2f4WGHg';
const sb = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: fin } = await sb.from('financiamientos').select('id, codigo').eq('codigo', 'FIN-001').single();
  if (!fin) { console.log('FIN-001 no encontrado'); return; }
  console.log('ID FIN-001:', fin.id);
  const { data: movs, error } = await sb.from('movimientos_tesoreria').select('*').eq('vinculo_tipo', 'financiamiento').eq('vinculo_id', fin.id);
  if (error) { console.log('Error:', error); return; }
  console.log('Movimientos:');
  movs.forEach(m => console.log(`ID: ${m.id} | Fecha: ${m.fecha} | Monto: ${m.monto} | Desc: ${m.descripcion} | Cta: ${m.cuenta_bancaria}`));
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});

import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function run() {
  console.log('--- PROBANDO CONSTRAINT UNICO ---');
  const testP1 = {
    id: 'pnm_test_' + Date.now(),
    empresa_id: 'emp_2000000000',
    anio: 2026,
    mes: 7,
    quincena: 1, // Ya existe para esta empresa
    fecha_inicio: '2026-07-01',
    fecha_fin: '2026-07-15',
    estado: 'abierto',
    periodo: 'TEST Q1'
  };
  const { error: insErr } = await sb.from('periodos_nomina').insert([testP1]);
  if (insErr) {
    console.log('Error al insertar duplicado (esperado si hay constraint):', insErr.message, insErr.code, insErr.details);
  } else {
    console.log('ALERTA: Se logró insertar un duplicado, NO HAY CONSTRAINT ACTIVO!');
    await sb.from('periodos_nomina').delete().eq('id', testP1.id);
  }
}
run();

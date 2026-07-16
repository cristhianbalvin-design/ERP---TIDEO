import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function run() {
  console.log('--- EMPRESAS DE LAS 4 QUINCENAS ---');
  const { data: qData } = await sb.from('periodos_nomina').select('id, empresa_id, quincena, created_at').not('quincena', 'is', null);
  console.table(qData);
  
  console.log('--- BUSCANDO HISTORIAL DE CONFIGURACION DE EMPRESA ---');
  const { data: cfgData, error: cfgErr } = await sb.from('empresa_config').select('*').eq('empresa_id', 'emp_2000000000');
  console.log('empresa_config actual para DIFESMAQ:', cfgData);
  
  const { data: allCfgTables } = await sb.rpc('get_schema').catch(() => ({data: null}));
  // Si falla, intentamos ver si hay una tabla de auditoria.
  const { data: auditData } = await sb.from('auditoria').select('*').limit(5).catch(() => ({data: null}));
  console.log('auditoria rows:', auditData?.length);
  
  // Test unique constraint
  console.log('--- PROBANDO CONSTRAINT UNICO ---');
  const testP1 = {
    empresa_id: 'emp_2000000000',
    anio: 2026,
    mes: 7,
    quincena: 1, // Ya existe
    fecha_inicio: '2026-07-01',
    fecha_fin: '2026-07-15',
    estado: 'abierto'
  };
  const { error: insErr } = await sb.from('periodos_nomina').insert([testP1]);
  if (insErr) {
    console.log('Error al insertar duplicado (esperado si hay constraint):', insErr.message, insErr.code, insErr.details);
  } else {
    console.log('ALERTA: Se logró insertar un duplicado, NO HAY CONSTRAINT ACTIVO!');
  }
}
run();

import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function checkDeps(id) {
  const tables = ['nomina_detalle', 'registros_asistencia', 'solicitudes_rrhh', 'prestamos_personal', 'comisiones_personal', 'novedades_nomina'];
  for (const table of tables) {
    const { data, error } = await sb.from(table).select('id').eq('periodo_id', id).limit(1);
    if (!error && data && data.length > 0) return true; // tiene dependencias
  }
  return false;
}

async function run() {
  const idsToDelete = ['pnm_1783007194404_mnb9e5', 'pnm_1783007194959_9ih79z'];
  const expectedEmp = 'emp_2000000000';
  
  console.log('--- PRE-VALIDACIÓN ---');
  let pass = true;
  for (const id of idsToDelete) {
    const { data: p } = await sb.from('periodos_nomina').select('*').eq('id', id).single();
    if (!p) {
      console.log(`❌ No se encontró el ID ${id}`);
      pass = false; continue;
    }
    if (p.empresa_id !== expectedEmp) {
      console.log(`❌ El ID ${id} pertenece a ${p.empresa_id}, no a ${expectedEmp}`);
      pass = false;
    }
    if (p.estado !== 'abierto') {
      console.log(`❌ El ID ${id} está en estado '${p.estado}'`);
      pass = false;
    }
    const hasDeps = await checkDeps(id);
    if (hasDeps) {
      console.log(`❌ El ID ${id} tiene dependencias en base de datos`);
      pass = false;
    }
    console.log(`✅ ID ${id} validado: empresa=${p.empresa_id}, estado=${p.estado}, deps=0`);
  }

  if (!pass) {
    console.log('\n❌ VALIDACIÓN FALLIDA. Abortando limpieza.');
    return;
  }
  
  console.log('\n--- EJECUTANDO LIMPIEZA ---');
  for (const id of idsToDelete) {
    const { error } = await sb.from('periodos_nomina').delete().eq('id', id);
    if (error) {
      console.log(`❌ Error eliminando ${id}:`, error);
    } else {
      console.log(`✅ Se eliminó ${id} exitosamente.`);
    }
  }
  
  console.log('\n--- VERIFICACIÓN POST-IMPLEMENTACIÓN ---');
  const { data: allP } = await sb.from('periodos_nomina')
    .select('id, empresa_id, anio, mes, quincena, estado')
    .eq('empresa_id', expectedEmp)
    .eq('anio', 2026)
    .eq('mes', 7);
    
  console.table(allP);
}
run();

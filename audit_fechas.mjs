import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function runAudit() {
  const { data: opData } = await sb.from('personal_operativo').select('*');
  const { data: adData } = await sb.from('personal_administrativo').select('*');
  const { data: ad2Data } = await sb.from('personal_admin').select('*');
  
  const allData = [
    ...(opData || []).map(x => ({...x, table: 'personal_operativo'})),
    ...(adData || []).map(x => ({...x, table: 'personal_administrativo'})),
    ...(ad2Data || []).map(x => ({...x, table: 'personal_admin'}))
  ];
  
  const firstNames = ['mariano', 'andrea', 'karyme'];
  
  for (const name of firstNames) {
    console.log(`\n--- Searching FOR: ${name} ---`);
    let person = allData.find(p => (p.nombre && p.nombre.toLowerCase().includes(name)) || (p.nombres && p.nombres.toLowerCase().includes(name)) || (p.nombres_apellidos && p.nombres_apellidos.toLowerCase().includes(name)));
    
    if (!person) continue;
    
    console.log(`ID: ${person.id}, fecha_ingreso: ${person.fecha_ingreso}`);
    
    const { data: ndData, error: ndErr } = await sb.from('detalle_nomina')
      .select('*, periodos_nomina!inner(*)')
      .eq('trabajador_id', person.id);
      
    if (ndErr) {
      console.error('Error:', ndErr);
    } else {
      console.log(`Detalle Nomina Records: ${ndData.length}`);
      for (const record of ndData) {
        const periodo = record.periodos_nomina;
        console.log(`  - Periodo ID: ${periodo.id}, Mes: ${periodo.mes}, Año: ${periodo.anio}, fecha_inicio: ${periodo.fecha_inicio}, fecha_fin: ${periodo.fecha_fin}`);
        console.log(`    Detalle created_at: ${record.created_at}, updated_at: ${record.updated_at}`);
      }
    }
  }
}

runAudit();

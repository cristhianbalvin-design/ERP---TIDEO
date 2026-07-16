import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function check() {
  console.log('--- CASO 1: pop_1781017281608 ---');
  // Check personal_documentos
  const { data: docs1, error: e1 } = await sb.from('personal_documentos').select('*').eq('personal_id', 'pop_1781017281608');
  if (e1) console.error(e1);
  console.log('Documentos pop_1781017281608:', docs1?.map(d => ({ tipo: d.tipo, estado: d.estado, fecha: d.fecha_vigencia, notas: d.notas_internas, file: d.archivo_url })));
  
  // Check personal_asignaciones_jornada
  const { data: asig1, error: e1b } = await sb.from('personal_asignaciones_jornada').select('*').eq('personal_id', 'pop_1781017281608').order('fecha_inicio', { ascending: true });
  console.log('Asignaciones pop_1781017281608:', asig1);

  console.log('\n--- CASO 2: pop_1782165495769 ---');
  const { data: docs2, error: e2 } = await sb.from('personal_documentos').select('*').eq('personal_id', 'pop_1782165495769');
  if (e2) console.error(e2);
  console.log('Documentos pop_1782165495769:', docs2?.map(d => ({ tipo: d.tipo, fecha: d.fecha_vigencia, f_cambio: d.fecha_vigencia_cambio, notas: d.notas_internas, regimen: d.regimen_laboral, asig: d.asignacion_datos })));
  
  const { data: asig2, error: e2b } = await sb.from('personal_asignaciones_jornada').select('*').eq('personal_id', 'pop_1782165495769').order('fecha_inicio', { ascending: true });
  console.log('Asignaciones pop_1782165495769:', asig2?.map(a => ({ inicio: a.fecha_inicio, fin: a.fecha_fin, t: a.dias_ciclo_trabajo, d: a.dias_ciclo_descanso, motivo: a.motivo })));
}

check();

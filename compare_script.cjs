const { createClient } = require('@supabase/supabase-js');
const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function run() {
  const { data: ops } = await sb.from('personal_operativo').select('id, nombre, regimen_jornada').eq('empresa_id', 'emp_2000000000');
  const { data: asigs } = await sb.from('personal_asignaciones_jornada').select('personal_id, regimen_jornada, fecha_inicio, fecha_fin').eq('empresa_id', 'emp_2000000000');
  
  console.log('--- TABLA COMPARATIVA ---');
  let currentMiners = [];
  for (const op of ops) {
     const myAsigs = asigs.filter(a => a.personal_id === op.id).sort((a,b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
     const current = myAsigs[0];
     const asigRegimen = current ? current.regimen_jornada : 'ninguno';
     const opRegimen = op.regimen_jornada || 'vacio';
     
     console.log(op.nombre + ' | Asignacion: ' + asigRegimen + ' | Personal: ' + opRegimen + ' | Coinciden: ' + (asigRegimen === opRegimen));
     
     if (opRegimen && opRegimen.includes('minero')) {
        currentMiners.push(op.nombre);
     }
  }
  
  console.log('\\n--- ROSTER JULIO 2026 vs VIGENTES ---');
  const { data: snaps } = await sb.from('roster_minero_snapshots').select('id').eq('empresa_id', 'emp_2000000000').eq('mes', 7).eq('anio', 2026);
  if (snaps && snaps.length > 0) {
     const id = snaps[0].id;
     let det = null;
     
     const { data: det1 } = await sb.from('roster_minero_snapshots_personal').select('personal_id').eq('snapshot_id', id);
     if (det1) det = det1;
     else {
        const { data: det2 } = await sb.from('roster_minero_snapshots_dias').select('personal_id').eq('snapshot_id', id);
        if (det2) det = det2;
        else {
           const { data: det3 } = await sb.from('roster_snapshots_detalle').select('personal_id').eq('snapshot_id', id);
           det = det3;
        }
     }
     
     if (det) {
         const ids = [...new Set(det.map(d=>d.personal_id))];
         const snapNames = ops.filter(o => ids.includes(o.id)).map(o => o.nombre);
         console.log('Trabajadores en snapshot (Julio 2026): ' + snapNames.join(', '));
         console.log('Trabajadores mineros vigentes (hoy): ' + currentMiners.join(', '));
         console.log('Diferencia (en vigentes pero no en snapshot): ' + currentMiners.filter(m => !snapNames.includes(m)).join(', '));
         console.log('Diferencia (en snapshot pero no en vigentes): ' + snapNames.filter(m => !currentMiners.includes(m)).join(', '));
     } else {
         console.log('No data found in roster tables.');
     }
  } else {
     console.log('No snapshot found for Julio 2026.');
  }
}
run().catch(console.error);

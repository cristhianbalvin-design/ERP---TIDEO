const fs = require('fs');
const txt = fs.readFileSync('C:/Users/tideo_design/.gemini/antigravity-ide/brain/a532ebf1-df81-45f1-a125-c36b7221cbb5/.system_generated/tasks/task-158.log', 'utf8');
const lines = txt.split('\n');
const jsonStart = lines.findIndex(l => l.startsWith('{'));
if(jsonStart >= 0) {
  const jsonStr = lines.slice(jsonStart).join('\n');
  const obj = JSON.parse(jsonStr);
  const res = obj.rows[0].result;
  
  if (res.registros_asistencia && res.registros_asistencia.length) {
    console.log('registros_asistencia keys:', Object.keys(res.registros_asistencia[0]));
    console.log('registros sample:', JSON.stringify(res.registros_asistencia[0], null, 2));
  } else console.log('no registros');

  if (res.asistencia_marcaciones && res.asistencia_marcaciones.length) {
    console.log('asistencia_marcaciones keys:', Object.keys(res.asistencia_marcaciones[0]));
  } else console.log('no marcaciones');

  if (res.personal_asignaciones_jornada && res.personal_asignaciones_jornada.length) {
    console.log('personal_asignaciones keys:', Object.keys(res.personal_asignaciones_jornada[0]));
    console.log('personal_asignaciones sample:', JSON.stringify(res.personal_asignaciones_jornada[0], null, 2));
  } else console.log('no asignaciones');

  console.log('marcaciones count:', res.asistencia_marcaciones?.length);
  console.log('registros count:', res.registros_asistencia?.length);
}

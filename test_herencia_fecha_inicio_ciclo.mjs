// Verifica la lógica de herencia de fecha_inicio_ciclo agregada en
// aplicarSnapshotDocumentoPersonal (src/context.jsx). Reproduce la misma
// decisión con datos de prueba en memoria (sin tocar la BD) porque esa
// función vive dentro del contexto de React y no puede invocarse aislada.

function calcularFechaInicioCiclo({ asignacionesJornada, personalId, personalTipo, fechaInicio, cicloDatos }) {
  let fechaInicioCiclo = cicloDatos ? fechaInicio : null;
  if (cicloDatos) {
    const tramoAnterior = asignacionesJornada
      .filter(a => a.personal_id === personalId && a.personal_tipo === personalTipo
        && a.fecha_fin === null && a.fecha_inicio < fechaInicio)
      .sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : -1))[0];
    if (tramoAnterior
      && tramoAnterior.regimen_jornada === 'ciclo_acumulativo'
      && tramoAnterior.dias_ciclo_trabajo === cicloDatos.t
      && tramoAnterior.dias_ciclo_descanso === cicloDatos.d
      && tramoAnterior.fecha_inicio_ciclo) {
      fechaInicioCiclo = tramoAnterior.fecha_inicio_ciclo;
    }
  }
  return fechaInicioCiclo;
}

let fallos = 0;
function assertEq(actual, esperado, msg) {
  if (actual !== esperado) {
    console.error(`FALLO: ${msg} — esperado "${esperado}", obtuvo "${actual}"`);
    fallos++;
  } else {
    console.log(`OK: ${msg}`);
  }
}

// Caso 1: revalidación de contrato con el mismo régimen 14x7 → debe heredar.
{
  const asignacionesJornada = [
    { personal_id: 'p1', personal_tipo: 'operativo', fecha_inicio: '2026-06-25', fecha_fin: null, regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 14, dias_ciclo_descanso: 7, fecha_inicio_ciclo: '2026-06-25' },
  ];
  const resultado = calcularFechaInicioCiclo({
    asignacionesJornada, personalId: 'p1', personalTipo: 'operativo',
    fechaInicio: '2026-06-30', cicloDatos: { t: 14, d: 7 },
  });
  assertEq(resultado, '2026-06-25', 'Caso 1 — mismo régimen hereda fecha_inicio_ciclo del tramo anterior');
}

// Caso 2: cambio real de régimen 14x7 → 20x10 → debe fijar fecha nueva.
{
  const asignacionesJornada = [
    { personal_id: 'p2', personal_tipo: 'operativo', fecha_inicio: '2026-06-25', fecha_fin: null, regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 14, dias_ciclo_descanso: 7, fecha_inicio_ciclo: '2026-06-25' },
  ];
  const resultado = calcularFechaInicioCiclo({
    asignacionesJornada, personalId: 'p2', personalTipo: 'operativo',
    fechaInicio: '2026-06-30', cicloDatos: { t: 20, d: 10 },
  });
  assertEq(resultado, '2026-06-30', 'Caso 2 — cambio de régimen (14x7→20x10) fija fecha_inicio_ciclo nueva');
}

// Caso 3: tramo intermedio de suspensión perfecta entre dos tramos 14x7 →
// el tramo inmediatamente anterior es la suspensión, no debe heredar.
{
  const asignacionesJornada = [
    { personal_id: 'p3', personal_tipo: 'operativo', fecha_inicio: '2026-05-01', fecha_fin: '2026-05-31', regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 14, dias_ciclo_descanso: 7, fecha_inicio_ciclo: '2026-05-01' },
    { personal_id: 'p3', personal_tipo: 'operativo', fecha_inicio: '2026-06-01', fecha_fin: null, regimen_jornada: 'suspension_perfecta', dias_ciclo_trabajo: null, dias_ciclo_descanso: null, fecha_inicio_ciclo: null },
  ];
  const resultado = calcularFechaInicioCiclo({
    asignacionesJornada, personalId: 'p3', personalTipo: 'operativo',
    fechaInicio: '2026-06-30', cicloDatos: { t: 14, d: 7 },
  });
  assertEq(resultado, '2026-06-30', 'Caso 3 — tramo intermedio de suspensión evita herencia indebida');
}

// Caso 4: tramo intermedio de régimen general entre dos tramos 14x7 →
// tampoco debe heredar, cada caso se evalúa solo contra el inmediato anterior.
{
  const asignacionesJornada = [
    { personal_id: 'p4', personal_tipo: 'operativo', fecha_inicio: '2026-05-01', fecha_fin: '2026-05-31', regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 14, dias_ciclo_descanso: 7, fecha_inicio_ciclo: '2026-05-01' },
    { personal_id: 'p4', personal_tipo: 'operativo', fecha_inicio: '2026-06-01', fecha_fin: null, regimen_jornada: 'general', dias_ciclo_trabajo: null, dias_ciclo_descanso: null, fecha_inicio_ciclo: null },
  ];
  const resultado = calcularFechaInicioCiclo({
    asignacionesJornada, personalId: 'p4', personalTipo: 'operativo',
    fechaInicio: '2026-06-30', cicloDatos: { t: 14, d: 7 },
  });
  assertEq(resultado, '2026-06-30', 'Caso 4 — tramo intermedio de régimen general evita herencia indebida');
}

console.log(fallos === 0 ? '\nTodos los casos pasaron.' : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

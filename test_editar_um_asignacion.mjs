// Verifica la lógica pura de edición de personal_asignaciones_um (pages_ops.jsx):
// sumarDiaISO, haySolapeUm, y las reglas de validación de guardarUmAsignacion
// (fecha_fin >= fecha_inicio, y no solapar con otro tramo del mismo trabajador).
// Copia exacta de la lógica del componente para poder probarla sin React/DOM.

const sumarDiaISO = (fechaStr) => {
  const d = new Date(`${fechaStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const haySolapeUm = (umAsignaciones, personalId, fechaInicio, fechaFin, excluirId) => {
  const finCmp = fechaFin || '9999-12-31';
  return umAsignaciones.some(a => {
    if (a.personal_id !== personalId || a.id === excluirId) return false;
    const aFin = a.fecha_fin || '9999-12-31';
    return a.fecha_inicio <= finCmp && aFin >= fechaInicio;
  });
};

let fallos = 0;
function assertEq(actual, esperado, msg) {
  if (actual !== esperado) {
    console.error(`FALLO: ${msg} — esperado "${esperado}", obtuvo "${actual}"`);
    fallos++;
  } else {
    console.log(`OK: ${msg}`);
  }
}

// Caso 1: sumarDiaISO da el día calendario siguiente, cruzando fin de mes.
assertEq(sumarDiaISO('2026-06-30'), '2026-07-01', 'Caso 1 — sumarDiaISO cruza fin de mes correctamente');

// Caso 2: reasignación sin conflicto — el trabajador solo tiene el tramo que se está cerrando.
{
  const umAsignaciones = [
    { id: 'umas_1', personal_id: 'w1', sede_id: 'sed_coripuno', fecha_inicio: '2026-06-25', fecha_fin: null },
  ];
  const fechaFinCierre = '2026-07-10';
  const fechaInicioNuevo = sumarDiaISO(fechaFinCierre);
  const solapa = haySolapeUm(umAsignaciones, 'w1', fechaInicioNuevo, null, 'umas_1');
  assertEq(solapa, false, 'Caso 2 — reasignación sin otros tramos no detecta solape (correcto insertar)');
}

// Caso 3: reasignación CON conflicto — ya existe un tramo futuro programado que se solapa.
{
  const umAsignaciones = [
    { id: 'umas_1', personal_id: 'w1', sede_id: 'sed_coripuno', fecha_inicio: '2026-06-25', fecha_fin: null },
    { id: 'umas_2', personal_id: 'w1', sede_id: 'sed_tangana', fecha_inicio: '2026-07-15', fecha_fin: null },
  ];
  const fechaFinCierre = '2026-07-10';
  const fechaInicioNuevo = sumarDiaISO(fechaFinCierre); // 2026-07-11
  const solapa = haySolapeUm(umAsignaciones, 'w1', fechaInicioNuevo, null, 'umas_1');
  assertEq(solapa, true, 'Caso 3 — reasignación detecta solape con un tramo futuro ya existente (debe bloquear)');
}

// Caso 4: haySolapeUm excluye correctamente el propio tramo que se está editando/cerrando.
{
  const umAsignaciones = [
    { id: 'umas_1', personal_id: 'w1', sede_id: 'sed_coripuno', fecha_inicio: '2026-06-25', fecha_fin: '2026-07-10' },
  ];
  // Si no excluyéramos umas_1, este chequeo (para el propio tramo que ya se cerró) daría falso solape.
  const solapa = haySolapeUm(umAsignaciones, 'w1', '2026-07-11', null, 'umas_1');
  assertEq(solapa, false, 'Caso 4 — excluirId evita que el propio tramo cerrado cuente como solape');
}

// Caso 5: validación de fecha_fin < fecha_inicio del tramo (debe bloquearse en frontend).
{
  const original = { fecha_inicio: '2026-06-25' };
  const fechaFinIntento = '2026-06-20';
  const invalido = fechaFinIntento < original.fecha_inicio;
  assertEq(invalido, true, 'Caso 5 — fecha_fin anterior a fecha_inicio se detecta como inválida');
}

// Caso 6: cerrar sin reasignar (misma UM seleccionada) no debería considerarse "reasignación".
{
  const original = { sede_id: 'sed_coripuno' };
  const sedeIdFormulario = 'sed_coripuno';
  const reasignando = sedeIdFormulario !== original.sede_id;
  assertEq(reasignando, false, 'Caso 6 — misma UM seleccionada = solo cierre, no reasignación');
}

console.log(fallos === 0 ? '\nTodos los casos pasaron.' : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

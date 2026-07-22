// Verifica la ventana pre-ciclo (entre fecha_inicio del tramo de jornada y
// fecha_inicio_ciclo) en calcularRangoRosterMinero (Grilla) y calcularRosterPeriodo
// (Balance): por defecto debe tratarse como descanso gozado, con posibilidad de
// marcar Inducción dentro de esa ventana; sin_ciclo_vigente queda reservado a
// fechas sin ningún tramo vigente. También corrige el bug preexistente de
// dias_pendientes_revision indebido antes de fecha_inicio_ciclo.
import { calcularRangoRosterMinero, calcularRosterPeriodo, calcularEstadoCicloMinero } from './src/services/rosterMineroService.js';

let fallos = 0;
function assertEq(actual, esperado, msg) {
  if (actual !== esperado) {
    console.error(`FALLO: ${msg} — esperado "${esperado}", obtuvo "${actual}"`);
    fallos++;
  } else {
    console.log(`OK: ${msg}`);
  }
}

// Caso Juan (dato real): tramo desde 2026-07-01, ciclo 20x10 arranca 2026-07-05,
// inducción 2026-07-01 a 2026-07-04.
{
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'juan',
    fechaInicioTramo: '2026-07-01',
    fechaFinTramo: null,
    fechaInicioCiclo: '2026-07-05',
    diasTrabajo: 20, diasDescanso: 10,
    tieneInduccion: true, fechaInicioInduccion: '2026-07-01', fechaFinInduccion: '2026-07-04',
    fechaInicio: '2026-07-01', fechaFin: '2026-07-10',
    registros: [], hoy: '2026-07-10',
  });
  const d1 = dias.find(d => d.fecha === '2026-07-01');
  const d4 = dias.find(d => d.fecha === '2026-07-04');
  const d5 = dias.find(d => d.fecha === '2026-07-05');
  assertEq(d1.origen, 'teorico', 'Juan — 01/07 ya no es sin_ciclo (hay tramo vigente)');
  assertEq(d1.estado, 'en_induccion', 'Juan — 01/07 se pinta como Inducción');
  assertEq(d1.teorico.estaEnInduccion, true, 'Juan — 01/07 estaEnInduccion=true (excluye balance)');
  assertEq(d4.estado, 'en_induccion', 'Juan — 04/07 (último día de inducción) se pinta como Inducción');
  assertEq(d5.estado, 'en_mina', 'Juan — 05/07 ya es ciclo real (en_mina, día 1 del patrón 20x10)');
}

// Mismo ejemplo de Juan pero SIN marcar inducción: el hueco 01-04/07 debe
// pintarse como Descanso, no como Sin ciclo.
{
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'juan2',
    fechaInicioTramo: '2026-07-01',
    fechaFinTramo: null,
    fechaInicioCiclo: '2026-07-05',
    diasTrabajo: 20, diasDescanso: 10,
    fechaInicio: '2026-07-01', fechaFin: '2026-07-04',
    registros: [], hoy: '2026-07-10',
  });
  dias.forEach(d => {
    assertEq(d.origen, 'teorico', `Sin inducción — ${d.fecha} origen es "teorico" (no sin_ciclo)`);
    assertEq(d.estado, 'en_descanso', `Sin inducción — ${d.fecha} se pinta como Descanso por defecto`);
  });
}

// sin_ciclo_vigente sigue aplicando cuando NO hay ningún tramo vigente para la
// fecha (caso ya conocido de trabajador sin asignación) — regresión del Caso 1
// de test_rango_roster_minero.mjs, ahora pasando fechaInicioTramo=null explícito.
{
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'sinTramo',
    fechaInicioCiclo: '2026-07-15',
    diasTrabajo: 14, diasDescanso: 7,
    fechaInicio: '2026-07-01', fechaFin: '2026-07-14',
    registros: [], hoy: '2026-07-20',
  });
  dias.forEach(d => assertEq(d.origen, 'sin_ciclo', `Sin tramo — ${d.fecha} sigue siendo sin_ciclo_vigente`));
}

// Balance de Juan para julio: fecha_inicio_ciclo se lleva a agosto para que
// TODO julio quede en ventana pre-ciclo y así aislar el caso sin ruido de los
// días ya dentro del ciclo (que sin registros reales generan sus propios
// pendientes — comportamiento preexistente y ajeno a este cambio, cubierto por
// test_roster_periodo_pendientes.mjs). 01-04 cuentan como dias_induccion
// (excluidos del balance) y NINGÚN día de la ventana pre-ciclo debe sumar a
// dias_pendientes_revision (el bug preexistente a corregir).
{
  const trabajador = { id: 'juan', nombre: 'Juan', trabajador_tipo: 'operativo', regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 20, dias_ciclo_descanso: 10 };
  const ciclos = [{
    personal_id: 'juan', fecha_inicio_ciclo: '2026-08-01',
    tiene_induccion: true, fecha_inicio_induccion: '2026-07-01', fecha_fin_induccion: '2026-07-04',
  }];
  const asignaciones = [{ personal_id: 'juan', regimen_jornada: 'ciclo_acumulativo', fecha_inicio: '2026-07-01', fecha_fin: null }];
  const resultado = calcularRosterPeriodo(2026, 7, [trabajador], [], ciclos, [], asignaciones)[0];
  assertEq(resultado.dias_induccion, 4, 'Balance Juan — 4 días de inducción (01-04/07) excluidos del balance');
  assertEq(resultado.dias_pendientes_revision, 0, 'Balance Juan — ningún día de la ventana pre-ciclo queda pendiente de revisión');
  assertEq(resultado.dias_descanso_gozados, 27, 'Balance Juan — el resto de julio (27 días) cuenta como descanso gozado');
}

// ANTES: mecanismo raíz del bug preexistente. calcularEstadoCicloMinero (sin
// tocar, por instrucción explícita) devuelve 'en_mina' para cualquier fecha
// anterior a fecha_inicio_ciclo (rama diffDias < 0). El código ANTERIOR de
// calcularRosterPeriodo llamaba a esta función para TODOS los días del mes sin
// distinguir si eran previos al ciclo, así que un día antes de fecha_inicio_ciclo
// sin registro real heredaba 'en_mina' y sumaba a dias_pendientes_revision.
{
  const estadoPreCiclo = calcularEstadoCicloMinero({
    fechaInicioCiclo: '2026-07-01', diasTrabajo: 14, diasDescanso: 7, fechaEval: '2026-06-15',
  });
  assertEq(estadoPreCiclo.estado, 'en_mina', 'ANTES — calcularEstadoCicloMinero sigue devolviendo "en_mina" para una fecha previa a fecha_inicio_ciclo (mecanismo intacto, no tocado)');
}

// DESPUÉS: mismo trabajador (fecha_inicio_ciclo=2026-07-01, no coincide con el
// primer día del mes analizado), sin inducción y sin registros reales para
// junio completo. calcularRosterPeriodo ya NO llama a calcularEstadoCicloMinero
// para los días previos al ciclo (ver rosterMineroService.js) — por eso ya no
// hereda el 'en_mina' de arriba. Con el tramo vigente informado, esos 30 días
// se cuentan como descanso gozado; nunca como pendientes de revisión.
{
  const trabajador = { id: 'w9', nombre: 'W9', trabajador_tipo: 'operativo', regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 14, dias_ciclo_descanso: 7 };
  const ciclos = [{ personal_id: 'w9', fecha_inicio_ciclo: '2026-07-01' }];
  const asignaciones = [{ personal_id: 'w9', regimen_jornada: 'ciclo_acumulativo', fecha_inicio: '2026-06-01', fecha_fin: null }];

  const resultado = calcularRosterPeriodo(2026, 6, [trabajador], [], ciclos, [], asignaciones)[0];
  assertEq(resultado.dias_pendientes_revision, 0, 'DESPUÉS — bug corregido: 0 días pendientes de revisión (todo junio es pre-ciclo)');
  assertEq(resultado.dias_descanso_gozados, 30, 'DESPUÉS — los 30 días de junio cuentan como descanso gozado');
}

console.log(fallos === 0 ? '\nTodos los casos pasaron.' : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

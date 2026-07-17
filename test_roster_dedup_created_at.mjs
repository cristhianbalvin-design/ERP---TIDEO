// Verifica que calcularRosterPeriodo desempata por created_at mas reciente
// cuando llegan dos registros_asistencia para el mismo trabajador+fecha
// (posible incluso despues del constraint nuevo, si el llamador no filtra
// filas ya anuladas), y que el resultado no depende del orden del array.
import { calcularRosterPeriodo, calcularRangoRosterMinero } from './src/services/rosterMineroService.js';

let fallos = 0;
function assertEq(actual, esperado, msg) {
  if (actual !== esperado) {
    console.error(`FALLO: ${msg} — esperado "${esperado}", obtuvo "${actual}"`);
    fallos++;
  } else {
    console.log(`OK: ${msg}`);
  }
}

const trabajador = { id: 'w_dup', nombre: 'Trabajador Dup', trabajador_tipo: 'operativo', regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 14, dias_ciclo_descanso: 7 };
const ciclos = [{ personal_id: 'w_dup', fecha_inicio_ciclo: '2026-06-01' }];

function registrosMesCompleto(excepto) {
  const regs = [];
  for (let dia = 1; dia <= 30; dia++) {
    const fecha = `2026-06-${String(dia).padStart(2, '0')}`;
    if (fecha === excepto) continue;
    regs.push({ trabajador_id: 'w_dup', fecha, estado: 'completo', es_falta: false, created_at: `2026-06-${String(dia).padStart(2, '0')}T08:00:00Z` });
  }
  return regs;
}

// El día 10 tiene DOS filas: una vieja 'incompleto' (la corrida original) y
// una nueva 'completo' (una corrida posterior que si trajo el dato bueno).
// Sin desempate por created_at, el resultado dependeria del orden del array.
const filaVieja  = { trabajador_id: 'w_dup', fecha: '2026-06-10', estado: 'incompleto', es_falta: false, created_at: '2026-06-10T08:00:00Z' };
const filaNueva  = { trabajador_id: 'w_dup', fecha: '2026-06-10', estado: 'completo', es_falta: false, created_at: '2026-06-10T09:30:00Z' };

const base = registrosMesCompleto('2026-06-10');

const ordenA = [...base, filaVieja, filaNueva];
const ordenB = [...base, filaNueva, filaVieja];

const resA = calcularRosterPeriodo(2026, 6, [trabajador], ordenA, ciclos, [])[0];
const resB = calcularRosterPeriodo(2026, 6, [trabajador], ordenB, ciclos, [])[0];

assertEq(resA.dias_en_mina, 30, 'Orden A (vieja, nueva) — gana la fila mas reciente (completo): dias_en_mina = 30');
assertEq(resA.dias_pendientes_revision, 0, 'Orden A — no queda pendiente de revision (la vieja incompleto perdio el desempate)');
assertEq(resB.dias_en_mina, 30, 'Orden B (nueva, vieja) — mismo resultado sin importar el orden del array');
assertEq(resB.dias_pendientes_revision, 0, 'Orden B — mismo resultado sin importar el orden del array');
assertEq(resA.dias_en_mina, resB.dias_en_mina, 'Orden A y B coinciden exactamente (no-determinismo resuelto)');

// calcularRangoRosterMinero (alimenta la vista "Grilla") tiene el mismo
// patron: dos filas para el mismo dia deben resolverse por created_at mas
// reciente, sin importar el orden del array de registros.
const rangoA = calcularRangoRosterMinero({
  trabajadorId: 'w_dup', fechaInicioCiclo: '2026-06-01', diasTrabajo: 14, diasDescanso: 7,
  fechaInicio: '2026-06-10', fechaFin: '2026-06-10', registros: [filaVieja, filaNueva], hoy: '2026-06-30',
});
const rangoB = calcularRangoRosterMinero({
  trabajadorId: 'w_dup', fechaInicioCiclo: '2026-06-01', diasTrabajo: 14, diasDescanso: 7,
  fechaInicio: '2026-06-10', fechaFin: '2026-06-10', registros: [filaNueva, filaVieja], hoy: '2026-06-30',
});

assertEq(rangoA[0].estado, 'completo', 'Grilla — orden (vieja, nueva): gana la fila mas reciente (completo)');
assertEq(rangoA[0].pendienteRevision, false, 'Grilla — orden (vieja, nueva): no queda pendiente de revision');
assertEq(rangoB[0].estado, 'completo', 'Grilla — orden (nueva, vieja): mismo resultado sin importar el orden');
assertEq(rangoB[0].pendienteRevision, false, 'Grilla — orden (nueva, vieja): mismo resultado sin importar el orden');

console.log(fallos === 0 ? '\nTodos los casos pasaron.' : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

// Verifica calcularRangoRosterMinero (src/services/rosterMineroService.js):
// combina el cálculo teórico del ciclo con el registro real de asistencia,
// respetando el caso de borde de fechas anteriores a fecha_inicio_ciclo.
import { calcularRangoRosterMinero } from './src/services/rosterMineroService.js';

let fallos = 0;
function assertEq(actual, esperado, msg) {
  if (actual !== esperado) {
    console.error(`FALLO: ${msg} — esperado "${esperado}", obtuvo "${actual}"`);
    fallos++;
  } else {
    console.log(`OK: ${msg}`);
  }
}

// Caso 1: fecha_inicio_ciclo cae a mitad del rango (empieza el 15) →
// los días 1-14 deben salir 'sin_ciclo', no un día de trabajo teórico.
{
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'w1',
    fechaInicioCiclo: '2026-07-15',
    diasTrabajo: 14, diasDescanso: 7,
    fechaInicio: '2026-07-01', fechaFin: '2026-07-31',
    registros: [],
    hoy: '2026-07-10', // "hoy" cae antes del inicio del rango completo evaluado, para aislar el caso de borde
  });
  const dia1 = dias.find(d => d.fecha === '2026-07-01');
  const dia14 = dias.find(d => d.fecha === '2026-07-14');
  const dia15 = dias.find(d => d.fecha === '2026-07-15');
  assertEq(dia1.origen, 'sin_ciclo', 'Caso 1 — día 1 (antes del inicio del ciclo) es sin_ciclo');
  assertEq(dia14.origen, 'sin_ciclo', 'Caso 1 — día 14 (último día antes del inicio) es sin_ciclo');
  assertEq(dia15.origen === 'sin_ciclo', false, 'Caso 1 — día 15 (inicio del ciclo) ya NO es sin_ciclo');
}

// Caso 2: hay registros reales en algunas fechas pasadas y no en otras;
// confirmar que las fechas con registro usan 'real' y el resto 'teorico'.
{
  const registros = [
    { trabajador_id: 'w2', fecha: '2026-06-03', estado: 'completo' },
  ];
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'w2',
    fechaInicioCiclo: '2026-06-01',
    diasTrabajo: 14, diasDescanso: 7,
    fechaInicio: '2026-06-01', fechaFin: '2026-06-05',
    registros,
    hoy: '2026-06-05',
  });
  const conRegistro = dias.find(d => d.fecha === '2026-06-03');
  const sinRegistroPasado = dias.find(d => d.fecha === '2026-06-02');
  const futuroSinRegistro = dias.find(d => d.fecha === '2026-06-05'); // "hoy" mismo, sin registro
  assertEq(conRegistro.origen, 'real', 'Caso 2 — fecha con registro real usa origen "real"');
  assertEq(conRegistro.estado, 'completo', 'Caso 2 — estado real proviene del registro (\"completo\")');
  assertEq(sinRegistroPasado.origen, 'teorico', 'Caso 2 — fecha pasada sin registro usa "teorico"');
  assertEq(futuroSinRegistro.origen, 'teorico', 'Caso 2 — fecha de hoy sin registro usa "teorico"');
}

// Caso 3: el estado real y el teórico difieren para la misma fecha pasada
// (el ciclo dice trabajo, la asistencia real registra descanso) → gana el real.
{
  // Régimen 14x7 desde 2026-06-01: el día 2026-06-01 es día 0 del ciclo → teóricamente "en_mina".
  const registros = [
    { trabajador_id: 'w3', fecha: '2026-06-01', estado: 'descanso' },
  ];
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'w3',
    fechaInicioCiclo: '2026-06-01',
    diasTrabajo: 14, diasDescanso: 7,
    fechaInicio: '2026-06-01', fechaFin: '2026-06-01',
    registros,
    hoy: '2026-06-01',
  });
  const dia = dias[0];
  assertEq(dia.origen, 'real', 'Caso 3 — con discrepancia teórico/real, gana el origen "real"');
  assertEq(dia.estado, 'descanso', 'Caso 3 — el estado devuelto es el real (\"descanso\"), no el teórico ("en_mina")');
}

console.log(fallos === 0 ? '\nTodos los casos pasaron.' : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

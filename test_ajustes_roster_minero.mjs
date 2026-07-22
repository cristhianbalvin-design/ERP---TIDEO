// Verifica la extensión de calcularRangoRosterMinero con ajustes manuales
// (roster_minero_ajustes, migración 332): un ajuste "pendiente" no cambia el
// resultado pero se expone en ajustePendiente; uno "aprobado" prevalece sobre
// el registro real y sobre el cálculo teórico.
import { calcularRangoRosterMinero, ajusteAprobadoPosteriorASnapshot } from './src/services/rosterMineroService.js';

let fallos = 0;
function assertEq(actual, esperado, msg) {
  if (actual !== esperado) {
    console.error(`FALLO: ${msg} — esperado "${esperado}", obtuvo "${actual}"`);
    fallos++;
  } else {
    console.log(`OK: ${msg}`);
  }
}

// Caso 1: ajuste "pendiente" no cambia el resultado, pero queda marcado.
{
  const registros = [{ trabajador_id: 'w1', fecha: '2026-06-03', estado: 'completo' }];
  const ajustes = [{ personal_id: 'w1', fecha: '2026-06-03', estado: 'pendiente', tipo_dia_solicitado: 'descanso' }];
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'w1', fechaInicioCiclo: '2026-06-01', diasTrabajo: 14, diasDescanso: 7,
    fechaInicio: '2026-06-01', fechaFin: '2026-06-05', registros, ajustes, hoy: '2026-06-05',
  });
  const dia = dias.find(d => d.fecha === '2026-06-03');
  assertEq(dia.origen, 'real', 'Caso 1 — con ajuste pendiente, el resultado sigue siendo "real" (sin cambio)');
  assertEq(dia.estado, 'completo', 'Caso 1 — el estado sigue siendo el real ("completo")');
  assertEq(Boolean(dia.ajustePendiente), true, 'Caso 1 — queda marcado que existe una solicitud pendiente');
}

// Caso 2: ajuste "aprobado" para fecha PASADA con asistencia real ya registrada
// → el resultado final es el del ajuste, no el real.
{
  const registros = [{ trabajador_id: 'w2', fecha: '2026-06-03', estado: 'completo' }];
  const ajustes = [{ personal_id: 'w2', fecha: '2026-06-03', estado: 'aprobado', tipo_dia_solicitado: 'descanso' }];
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'w2', fechaInicioCiclo: '2026-06-01', diasTrabajo: 14, diasDescanso: 7,
    fechaInicio: '2026-06-01', fechaFin: '2026-06-05', registros, ajustes, hoy: '2026-06-05',
  });
  const dia = dias.find(d => d.fecha === '2026-06-03');
  assertEq(dia.origen, 'ajuste', 'Caso 2 — con ajuste aprobado sobre fecha pasada con real, gana el ajuste');
  assertEq(dia.estado, 'descanso', 'Caso 2 — el estado es el solicitado por el ajuste ("descanso"), no el real ("completo")');
  assertEq(dia.ajustePendiente, null, 'Caso 2 — no hay solicitud pendiente simultánea');
}

// Caso 3: ajuste "aprobado" para fecha FUTURA (sin nada registrado todavía)
// → el resultado final es el del ajuste, no el teórico.
{
  // Régimen 14x7 desde 2026-06-01: 2026-07-01 es día 30 del ciclo (30 % 21 = 9) → teóricamente "en_descanso".
  const ajustes = [{ personal_id: 'w3', fecha: '2026-07-01', estado: 'aprobado', tipo_dia_solicitado: 'trabajo' }];
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'w3', fechaInicioCiclo: '2026-06-01', diasTrabajo: 14, diasDescanso: 7,
    fechaInicio: '2026-07-01', fechaFin: '2026-07-01', registros: [], ajustes, hoy: '2026-06-05',
  });
  const dia = dias[0];
  assertEq(dia.origen, 'ajuste', 'Caso 3 — con ajuste aprobado sobre fecha futura, gana el ajuste');
  assertEq(dia.estado, 'trabajo', 'Caso 3 — el estado es el solicitado por el ajuste ("trabajo"), no el teórico');
}

// Caso 4 (regresión): sin ajustes, el comportamiento previo de la función no cambia.
{
  const dias = calcularRangoRosterMinero({
    trabajadorId: 'w4', fechaInicioCiclo: '2026-06-15', diasTrabajo: 14, diasDescanso: 7,
    fechaInicio: '2026-06-01', fechaFin: '2026-06-16', registros: [], hoy: '2026-06-05',
  });
  const dia1 = dias.find(d => d.fecha === '2026-06-01');
  const dia16 = dias.find(d => d.fecha === '2026-06-16');
  assertEq(dia1.origen, 'sin_ciclo', 'Caso 4 — sin pasar "ajustes", el caso de borde sin_ciclo sigue funcionando');
  assertEq(dia1.ajustePendiente, null, 'Caso 4 — ajustePendiente es null cuando no se pasan ajustes');
  assertEq(dia16.origen, 'teorico', 'Caso 4 — día futuro sin ajustes sigue siendo "teorico" como antes');
}

// Caso 5: el recálculo dirigido solo se ofrece si el ajuste fue aprobado después
// del timestamp del snapshot guardado.
{
  const snapshot = { calculado_en: '2026-07-17T00:31:28.596Z' };
  const ajustePosterior = { estado: 'aprobado', resuelto_en: '2026-07-22T21:46:45.465Z' };
  const ajusteAnterior = { estado: 'aprobado', resuelto_en: '2026-07-10T10:00:00Z' };
  const ajustePendiente = { estado: 'pendiente', resuelto_en: '2026-07-22T21:46:45.465Z' };
  assertEq(ajusteAprobadoPosteriorASnapshot(ajustePosterior, snapshot), true, 'Caso 5 - ajuste aprobado posterior habilita recálculo dirigido');
  assertEq(ajusteAprobadoPosteriorASnapshot(ajusteAnterior, snapshot), false, 'Caso 5 - ajuste previo ya está reflejado');
  assertEq(ajusteAprobadoPosteriorASnapshot(ajustePendiente, snapshot), false, 'Caso 5 - ajuste pendiente no habilita recálculo dirigido');
}

console.log(fallos === 0 ? '\nTodos los casos pasaron.' : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

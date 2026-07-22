// Verifica calcularRosterPeriodo (rosterMineroService.js) tras conectar los
// ajustes aprobados y separar los días ambiguos (incompleto / sin registro en
// día esperado de trabajo) en dias_pendientes_revision, en vez de contarlos
// silenciosamente como día en mina.
//
// Cada caso da cobertura de registro 'completo' a TODOS los días de junio
// salvo el día bajo prueba, para aislar exactamente lo que ese día aporta al
// resultado (un trabajador real con ciclo activo genera "pendientes" también
// para cualquier otro día sin registro dentro de su ventana de trabajo — eso
// es el comportamiento correcto, no ruido de esta prueba).
import { calcularEstadoCicloMinero, calcularRosterPeriodo } from './src/services/rosterMineroService.js';

let fallos = 0;
function assertEq(actual, esperado, msg) {
  if (actual !== esperado) {
    console.error(`FALLO: ${msg} — esperado "${esperado}", obtuvo "${actual}"`);
    fallos++;
  } else {
    console.log(`OK: ${msg}`);
  }
}

const trabajador = (id, overrides = {}) => ({
  id, nombre: 'Trabajador Test', trabajador_tipo: 'operativo',
  regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 14, dias_ciclo_descanso: 7,
  ...overrides,
});

// Registros 'completo' para junio completo (30 días), salvo las fechas indicadas.
function registrosMesCompleto(trabajadorId, excepto = {}) {
  const regs = [];
  for (let dia = 1; dia <= 30; dia++) {
    const fecha = `2026-06-${String(dia).padStart(2, '0')}`;
    if (excepto[fecha]) {
      regs.push({ trabajador_id: trabajadorId, fecha, ...excepto[fecha] });
    } else {
      regs.push({ trabajador_id: trabajadorId, fecha, estado: 'completo', es_falta: false });
    }
  }
  return regs;
}

// Caso 1: ajuste aprobado que cambia un día de "descanso" a "trabajo" ->
// debe reflejarse en dias_en_mina (no solo en la grilla).
{
  const trabajadores = [trabajador('w1')];
  const registros = registrosMesCompleto('w1', { '2026-06-20': { estado: 'descanso', es_falta: false } });
  const ciclos = [{ personal_id: 'w1', fecha_inicio_ciclo: '2026-06-01' }];
  const ajustes = [{ personal_id: 'w1', fecha: '2026-06-20', estado: 'aprobado', tipo_dia_solicitado: 'trabajo' }];

  const sinAjuste = calcularRosterPeriodo(2026, 6, trabajadores, registros, ciclos, [])[0];
  const conAjuste = calcularRosterPeriodo(2026, 6, trabajadores, registros, ciclos, ajustes)[0];

  assertEq(sinAjuste.dias_en_mina, 29, 'Caso 1a — sin ajuste: 29 días completos cuentan como mina (el día 20 es descanso)');
  assertEq(conAjuste.dias_en_mina, 30, 'Caso 1b — con ajuste aprobado (descanso->trabajo), dias_en_mina sube en 1 (30)');
  assertEq(conAjuste.dias_descanso_gozados, 0, 'Caso 1c — el día ya no cuenta como gozado tras el ajuste');
}

// Caso 2: día "incompleto" sin ajuste no suma a dias_en_mina ni a
// dias_descanso_gozados — solo aparece en dias_pendientes_revision.
{
  const trabajadores = [trabajador('w2')];
  const registros = registrosMesCompleto('w2', { '2026-06-05': { estado: 'incompleto', es_falta: false } });
  const ciclos = [{ personal_id: 'w2', fecha_inicio_ciclo: '2026-06-01' }];

  const conIncompleto = calcularRosterPeriodo(2026, 6, trabajadores, registros, ciclos, [])[0];
  assertEq(conIncompleto.dias_en_mina, 29, 'Caso 2a — incompleto no suma a dias_en_mina (29, no 30)');
  assertEq(conIncompleto.dias_descanso_gozados, 0, 'Caso 2b — incompleto no suma a dias_descanso_gozados');
  assertEq(conIncompleto.dias_pendientes_revision, 1, 'Caso 2c — incompleto se cuenta en dias_pendientes_revision');
}

// Caso 3: el mismo día incompleto, ahora con un ajuste aprobado que decide
// "trabajo" -> debe salir de pendientes y contarse en dias_en_mina.
{
  const trabajadores = [trabajador('w3')];
  const registros = registrosMesCompleto('w3', { '2026-06-05': { estado: 'incompleto', es_falta: false } });
  const ciclos = [{ personal_id: 'w3', fecha_inicio_ciclo: '2026-06-01' }];
  const ajustes = [{ personal_id: 'w3', fecha: '2026-06-05', estado: 'aprobado', tipo_dia_solicitado: 'trabajo' }];

  const resultado = calcularRosterPeriodo(2026, 6, trabajadores, registros, ciclos, ajustes)[0];
  assertEq(resultado.dias_pendientes_revision, 0, 'Caso 3a — con ajuste aprobado, el día ya no queda pendiente');
  assertEq(resultado.dias_en_mina, 30, 'Caso 3b — el ajuste decidió "trabajo": cuenta en dias_en_mina (30)');
}

// Caso 3bis: mismo escenario pero el ajuste decide "descanso".
{
  const trabajadores = [trabajador('w3b')];
  const registros = registrosMesCompleto('w3b', { '2026-06-05': { estado: 'incompleto', es_falta: false } });
  const ciclos = [{ personal_id: 'w3b', fecha_inicio_ciclo: '2026-06-01' }];
  const ajustes = [{ personal_id: 'w3b', fecha: '2026-06-05', estado: 'aprobado', tipo_dia_solicitado: 'descanso' }];

  const resultado = calcularRosterPeriodo(2026, 6, trabajadores, registros, ciclos, ajustes)[0];
  assertEq(resultado.dias_pendientes_revision, 0, 'Caso 3c — con ajuste aprobado "descanso", ya no queda pendiente');
  assertEq(resultado.dias_en_mina, 29, 'Caso 3d — no cuenta como mina (29, el día pasó a descanso)');
  assertEq(resultado.dias_descanso_gozados, 1, 'Caso 3e — cuenta como descanso gozado');
}

// Caso 4: tardanza y horas_extra siguen sumando a dias_en_mina exactamente
// igual que antes — sin cambio de comportamiento.
{
  const trabajadores = [trabajador('w4')];
  const registros = registrosMesCompleto('w4', {
    '2026-06-01': { estado: 'tardanza', es_falta: false },
    '2026-06-02': { estado: 'horas_extra', es_falta: false },
  });
  const ciclos = [{ personal_id: 'w4', fecha_inicio_ciclo: '2026-06-01' }];

  const resultado = calcularRosterPeriodo(2026, 6, trabajadores, registros, ciclos, [])[0];
  assertEq(resultado.dias_en_mina, 30, 'Caso 4 — tardanza y horas_extra suman a dias_en_mina igual que "completo" (30/30)');
  assertEq(resultado.dias_pendientes_revision, 0, 'Caso 4b — ninguno de los dos queda pendiente de revisión');
}

// Caso 5 (regresión): caso general sin incompletos ni ajustes — incluyendo
// falta real y descanso real — debe coincidir con el cálculo anterior
// (equivalente al filtro plano que existía antes de este cambio).
{
  const trabajadores = [trabajador('w5', { dias_ciclo_trabajo: 20, dias_ciclo_descanso: 10 })];
  const registros = [
    { trabajador_id: 'w5', fecha: '2026-06-01', estado: 'completo', es_falta: false },
    { trabajador_id: 'w5', fecha: '2026-06-02', estado: 'completo', es_falta: false },
    { trabajador_id: 'w5', fecha: '2026-06-03', estado: 'falta', es_falta: true },
    { trabajador_id: 'w5', fecha: '2026-06-04', estado: 'descanso', es_falta: false },
  ];
  // Sin ciclos (fecha_inicio_ciclo ausente) para que los días SIN registro
  // (todo el resto del mes) no generen ningún dato de "esperaba trabajo" —
  // replica el comportamiento anterior donde esos días simplemente no existían.
  const ciclos = [];

  const resultado = calcularRosterPeriodo(2026, 6, trabajadores, registros, ciclos, [])[0];
  assertEq(resultado.dias_en_mina, 2, 'Caso 5a — 2 días completos cuentan como mina (igual que el filtro anterior)');
  assertEq(resultado.dias_descanso_gozados, 1, 'Caso 5b — 1 día descanso cuenta como gozado (igual que antes)');
  assertEq(resultado.dias_pendientes_revision, 0, 'Caso 5c — sin ciclo configurado, los días sin registro no generan pendientes (compat. con el comportamiento previo)');
  const ratio = 10 / 20;
  const ganadosEsperados = Math.round(2 * ratio * 100) / 100;
  assertEq(resultado.dias_descanso_ganados, ganadosEsperados, 'Caso 5d — dias_descanso_ganados usa la misma fórmula de antes (diasEfectivos × ratio)');
  assertEq(resultado.balance_periodo, Math.round((ganadosEsperados - 1) * 100) / 100, 'Caso 5e — balance_periodo = ganados - gozados, igual que antes');
}

// Caso 6: la inducción configurada se excluye aunque los registros diarios
// generados por el ciclo todavía estén marcados como "completo". Un ajuste
// aprobado en esos días tampoco puede volverlos días que ganan descanso.
{
  const trabajadores = [trabajador('w6')];
  const registros = registrosMesCompleto('w6');
  const ciclos = [{
    personal_id: 'w6', fecha_inicio_ciclo: '2026-06-01',
    tiene_induccion: true, dias_induccion: 3, fecha_fin_induccion: '2026-06-03',
  }];
  const ajustes = [{ personal_id: 'w6', fecha: '2026-06-02', estado: 'aprobado', tipo_dia_solicitado: 'trabajo' }];

  const resultado = calcularRosterPeriodo(2026, 6, trabajadores, registros, ciclos, ajustes)[0];
  assertEq(resultado.dias_induccion, 3, 'Caso 6a — los tres días iniciales quedan identificados como inducción');
  assertEq(resultado.dias_en_mina, 27, 'Caso 6b — ningún día de inducción suma a dias_en_mina, aun con ajuste aprobado');
  assertEq(resultado.dias_descanso_ganados, 13.5, 'Caso 6c — inducción no suma a dias_descanso_ganados');
}

// Caso 7: el cálculo puro del ciclo también excluye la inducción del saldo.
{
  const estado = calcularEstadoCicloMinero({
    fechaInicioCiclo: '2026-06-01', diasTrabajo: 14, diasDescanso: 7,
    fechaEval: '2026-06-05', tieneInduccion: true, diasInduccion: 3,
    fechaFinInduccion: '2026-06-03',
  });
  assertEq(estado.diasInduccionMes, 3, 'Caso 7a — calcularEstadoCicloMinero identifica los días de inducción');
  assertEq(estado.diasEnMinaMes, 2, 'Caso 7b — solo los días posteriores a inducción cuentan como mina');
  assertEq(estado.diasDescansoGanados, 1, 'Caso 7c — el saldo usa únicamente los dos días de mina (ratio 7/14)');
}

console.log(fallos === 0 ? '\nTodos los casos pasaron.' : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

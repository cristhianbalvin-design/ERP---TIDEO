import { getSupabaseClient } from '../lib/supabaseClient.js';

const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

export const TIPOS_CESE_LABELS = {
  renuncia_voluntaria:  'Renuncia Voluntaria',
  despido_arbitrario:   'Despido Arbitrario',
  despido_falta_grave:  'Despido justificado por falta grave',
  mutuo_acuerdo:        'Mutuo Acuerdo',
  vencimiento_contrato: 'Vencimiento de Contrato',
  fallecimiento:        'Fallecimiento',
};

// ─── Cálculo de tiempo de servicio ───────────────────────────────────────────

function calcularTiempoServicio(fechaIngreso, fechaCese) {
  const inicio = new Date(fechaIngreso + 'T00:00:00');
  const fin    = new Date(fechaCese    + 'T00:00:00');

  let anios = fin.getFullYear() - inicio.getFullYear();
  let meses = fin.getMonth()   - inicio.getMonth();
  let dias  = fin.getDate()    - inicio.getDate();

  if (dias < 0) {
    meses--;
    const prevMonth = new Date(fin.getFullYear(), fin.getMonth(), 0);
    dias += prevMonth.getDate();
  }
  if (meses < 0) {
    anios--;
    meses += 12;
  }

  const totalDias = Math.max(0, Math.floor((fin - inicio) / 86400000));
  return { anios, meses, dias, totalDias };
}

// ─── Fecha del último depósito semestral de CTS por defecto ──────────────────

export function sugerirFechaUltimoDepositoCTS(fechaCese) {
  const cese  = new Date(fechaCese + 'T00:00:00');
  const year  = cese.getFullYear();
  const month = cese.getMonth() + 1; // 1‥12

  // Depósitos: 15 May (para Jan‑Apr) y 15 Nov (para Jul‑Oct)
  if (month <= 5)  return `${year - 1}-11-15`;
  if (month <= 11) return `${year}-05-15`;
  return `${year}-11-15`;
}

// ─── Días desde el último aniversario laboral ─────────────────────────────────

function diasEnAnioLaboral(fechaIngreso, fechaCese) {
  const ingreso = new Date(fechaIngreso + 'T00:00:00');
  const cese    = new Date(fechaCese    + 'T00:00:00');

  let ultimoAniversario = new Date(cese.getFullYear(), ingreso.getMonth(), ingreso.getDate());
  if (ultimoAniversario > cese) {
    ultimoAniversario = new Date(cese.getFullYear() - 1, ingreso.getMonth(), ingreso.getDate());
  }
  return Math.max(0, Math.floor((cese - ultimoAniversario) / 86400000));
}

// ─── Motor de cálculo (función pura) ─────────────────────────────────────────
//
// Parámetros:
//   fechaIngreso              – ISO date string
//   fechaCese                 – ISO date string
//   sueldoBase                – número
//   asignacionFamiliar        – número (0 si no corresponde)
//   ultimaGratificacionMensual– equivalente mensual de la última gratif. pagada
//   regimen                   – 'general' | 'mype_pequena' | 'microempresa'
//   tipoCese                  – uno de TIPOS_CESE_LABELS keys
//   diasVacacionesGozadas     – número de días de vacaciones ya gozados en el año en curso
//   fechaUltimoDepositoCTS    – ISO date string (opcional; si se omite se sugiere)

export function calcularConceptos(params) {
  const {
    fechaIngreso,
    fechaCese,
    sueldoBase,
    asignacionFamiliar        = 0,
    ultimaGratificacionMensual = 0,
    regimen                   = 'general',
    tipoCese,
    diasVacacionesGozadas     = 0,
    fechaUltimoDepositoCTS,
  } = params;

  const sueldo = Number(sueldoBase) || 0;
  const asigFam = Number(asignacionFamiliar) || 0;
  const ultGrat = Number(ultimaGratificacionMensual) || 0;

  const { anios, meses, dias, totalDias } = calcularTiempoServicio(fechaIngreso, fechaCese);

  const regimenNormalizado = regimen === 'pequena_empresa' ? 'mype_pequena' : regimen;
  const esMicro = regimenNormalizado === 'microempresa';
  const esMype  = regimenNormalizado === 'mype_pequena';

  // Remuneración computable = sueldo + asig. familiar + 1/6 de última gratificación semestral
  // La "última gratificación semestral" se expresa como su equivalente mensual × 6 / 6 = mensual
  // pero la fracción que entra en computable es 1/6 del monto semestral = mensual / 1 * (1/6)
  // En práctica: remComputable = sueldo + asigFam + (gratSemestral / 6)
  // donde gratSemestral ≈ ultimaGratificacionMensual × 6, por lo tanto
  // el aporte mensual = ultimaGratificacionMensual / 1... simplificando:
  // remComputable = sueldo + asigFam + ultimaGratificacionMensual / 6
  // El usuario ingresa el MONTO MENSUAL aproximado de la última gratificación
  const remComputable = round2(sueldo + asigFam + (ultGrat / 6));

  const diasVacRegimen = (esMicro || esMype) ? 15 : 30;
  const ceseDate = new Date(fechaCese + 'T00:00:00');
  const conceptos = [];

  // ── Concepto 1: Remuneración pendiente ──────────────────────────────────────
  const diasMes = ceseDate.getDate();
  const montoRemPend = round2(sueldo / 30 * diasMes);
  conceptos.push({
    concepto: 'remuneracion_pendiente',
    descripcion: 'Remuneración de días trabajados en el mes del cese',
    descripcion_calculo:
      `S/ ${sueldo.toFixed(2)} ÷ 30 × ${diasMes} días trabajados en el mes = S/ ${montoRemPend.toFixed(2)}`,
    monto: montoRemPend,
    aplica: true,
    motivo_no_aplica: null,
    es_descuento: false,
    orden: 1,
  });

  // ── Concepto 2: Vacaciones truncas ──────────────────────────────────────────
  const diasAnioLab  = diasEnAnioLaboral(fechaIngreso, fechaCese);
  const diasVacAcum  = round2((diasAnioLab / 365) * diasVacRegimen);
  const diasVacGoz   = Number(diasVacacionesGozadas) || 0;
  const diasVacPend  = Math.max(0, round2(diasVacAcum - diasVacGoz));
  const montoVac     = round2(diasVacPend * (sueldo / 30));
  conceptos.push({
    concepto: 'vacaciones_truncas',
    descripcion: `Vacaciones proporcionales no gozadas (${diasVacRegimen} días/año según régimen)`,
    descripcion_calculo:
      `${diasAnioLab} días en año laboral ÷ 365 × ${diasVacRegimen} = ${diasVacAcum.toFixed(2)} acum. ` +
      `− ${diasVacGoz} gozados = ${diasVacPend.toFixed(2)} días pendientes × S/ ${round2(sueldo/30).toFixed(2)}/día = S/ ${montoVac.toFixed(2)}`,
    monto: montoVac,
    aplica: true,
    motivo_no_aplica: null,
    es_descuento: false,
    orden: 2,
  });

  // ── Concepto 3: CTS proporcional ────────────────────────────────────────────
  const fechaDep    = fechaUltimoDepositoCTS || sugerirFechaUltimoDepositoCTS(fechaCese);
  const depStart    = new Date(fechaDep + 'T00:00:00');
  const diasDesdeDeposito = Math.max(0, Math.floor((ceseDate - depStart) / 86400000));
  const montoCTS    = esMicro ? 0 : round2(remComputable * (diasDesdeDeposito / 360) * (esMype ? 0.5 : 1));
  conceptos.push({
    concepto: 'cts_proporcional',
    descripcion: 'CTS acumulada desde el último depósito semestral',
    descripcion_calculo: esMicro
      ? 'No aplica: régimen microempresa no genera CTS'
      : `S/ ${remComputable.toFixed(2)} rem. computable × (${diasDesdeDeposito} días desde ${fechaDep} ÷ 360) = S/ ${montoCTS.toFixed(2)}`,
    monto: esMicro ? 0 : montoCTS,
    aplica: !esMicro,
    motivo_no_aplica: esMicro ? 'El régimen microempresa no genera CTS' : null,
    es_descuento: false,
    orden: 3,
  });

  // ── Concepto 4: Gratificación proporcional ──────────────────────────────────
  const mesActual = ceseDate.getMonth() + 1; // 1‥12
  const inicioSemestre = mesActual <= 6
    ? new Date(ceseDate.getFullYear(), 0, 1)  // 1 Ene
    : new Date(ceseDate.getFullYear(), 6, 1); // 1 Jul
  const msMesSem = ceseDate - inicioSemestre;
  const mesesCompSem = Math.min(6, Math.max(0, Math.floor(msMesSem / (30.44 * 86400000))));

  const aplicaGrat = !esMicro && (
    ['despido_arbitrario','despido_falta_grave','mutuo_acuerdo','vencimiento_contrato','fallecimiento'].includes(tipoCese) ||
    (tipoCese === 'renuncia_voluntaria' && mesesCompSem >= 1)
  );
  const montoGrat  = aplicaGrat ? round2(remComputable * (mesesCompSem / 6) * (esMype ? 0.5 : 1)) : 0;
  const bonifExtra = aplicaGrat ? round2(montoGrat * 0.09) : 0;
  const montoGratTotal = round2(montoGrat + bonifExtra);

  let motivoNoGrat = null;
  if (esMicro) motivoNoGrat = 'El régimen microempresa no genera gratificación proporcional';
  else if (tipoCese === 'renuncia_voluntaria' && mesesCompSem < 1)
    motivoNoGrat = 'Renuncia voluntaria con menos de 1 mes completo en el semestre actual';

  conceptos.push({
    concepto: 'gratificacion_proporcional',
    descripcion: 'Gratificación proporcional del semestre + bonificación extraordinaria 9%',
    descripcion_calculo: !aplicaGrat
      ? (motivoNoGrat || 'No aplica')
      : `S/ ${remComputable.toFixed(2)} × (${mesesCompSem} meses ÷ 6) = S/ ${montoGrat.toFixed(2)} ` +
        `+ bonif. extraordinaria 9% S/ ${bonifExtra.toFixed(2)} = S/ ${montoGratTotal.toFixed(2)}`,
    monto: montoGratTotal,
    aplica: aplicaGrat,
    motivo_no_aplica: motivoNoGrat,
    es_descuento: false,
    orden: 4,
  });

  // ── Concepto 5: Indemnización ────────────────────────────────────────────────
  const aplicaIndem = tipoCese === 'despido_arbitrario';
  let montoIndem = 0;
  let descIndem  = '';

  if (aplicaIndem) {
    if (esMicro) {
      const remDiaria = sueldo / 30;
      montoIndem = Math.min(90 * remDiaria, round2(remDiaria * 10 * (totalDias / 365)));
      descIndem  = `Microempresa: S/ ${remDiaria.toFixed(2)}/día × 10 × ${(totalDias/365).toFixed(2)} años (tope 90 días) = S/ ${montoIndem.toFixed(2)}`;
    } else if (esMype) {
      const remDiaria = sueldo / 30;
      montoIndem = Math.min(120 * remDiaria, round2(remDiaria * 20 * (totalDias / 365)));
      descIndem  = `Pequeña empresa: S/ ${remDiaria.toFixed(2)}/día × 20 × ${(totalDias/365).toFixed(2)} años (tope 120 días) = S/ ${montoIndem.toFixed(2)}`;
    } else {
      const tope     = 12 * sueldo;
      const indAnios = anios * 1.5 * sueldo;
      const indMeses = (meses / 12) * 1.5 * sueldo;
      const indDias  = (dias  / 360) * 1.5 * sueldo;
      montoIndem = Math.min(tope, round2(indAnios + indMeses + indDias));
      descIndem  = `Régimen general: 1.5 rem. mensual × (${anios}a ${meses}m ${dias}d) (tope 12 rem.) = S/ ${montoIndem.toFixed(2)}`;
    }
  }
  const motivoIndemNoAplica = tipoCese === 'despido_falta_grave'
    ? 'Despido justificado por falta grave - no corresponde indemnizacion'
    : 'Solo aplica para despido arbitrario';

  conceptos.push({
    concepto: 'indemnizacion',
    descripcion: 'Indemnización por despido arbitrario',
    descripcion_calculo: aplicaIndem
      ? descIndem
      : 'No aplica — tipo de cese no genera indemnización',
    monto: montoIndem,
    aplica: aplicaIndem,
    motivo_no_aplica: aplicaIndem ? null : motivoIndemNoAplica,
    es_descuento: false,
    orden: 5,
  });

  const montoTotal = round2(
    conceptos
      .filter(c => c.aplica)
      .reduce((sum, c) => sum + (c.es_descuento ? -c.monto : c.monto), 0)
  );

  return { anios, meses, dias, totalDias, remComputable, conceptos, montoTotal };
}

// ─── GAP-12: Bloqueo / reactivación de acceso al sistema por cese ────────────

export async function bloquearAccesoColaborador(personalId, personalTipo, empresaId, bloqueadoPor) {
  if (!personalId || !empresaId) return { ok: true };

  const supabase = await getSupabaseClient();
  const tabla = personalTipo === 'operativo' ? 'personal_operativo' : 'personal_administrativo';

  const { data: personal } = await supabase
    .from(tabla)
    .select('auth_user_id, nombre')
    .eq('id', personalId)
    .eq('empresa_id', empresaId)
    .single();

  if (!personal?.auth_user_id) return { ok: true, sinUsuario: true };

  await supabase
    .from('usuarios_empresas')
    .update({ activo: false })
    .eq('user_id', personal.auth_user_id)
    .eq('empresa_id', empresaId);

  await supabase
    .from(tabla)
    .update({ usuario_bloqueado_en: new Date().toISOString(), usuario_bloqueado_por: bloqueadoPor })
    .eq('id', personalId)
    .eq('empresa_id', empresaId);

  return { ok: true };
}

export async function reactivarAccesoColaborador(personalId, personalTipo, empresaId) {
  if (!personalId || !empresaId) return { ok: true };

  const supabase = await getSupabaseClient();
  const tabla = personalTipo === 'operativo' ? 'personal_operativo' : 'personal_administrativo';

  const { data: personal } = await supabase
    .from(tabla)
    .select('auth_user_id')
    .eq('id', personalId)
    .eq('empresa_id', empresaId)
    .single();

  if (!personal?.auth_user_id) return { ok: true, sinUsuario: true };

  await supabase
    .from('usuarios_empresas')
    .update({ activo: true })
    .eq('user_id', personal.auth_user_id)
    .eq('empresa_id', empresaId);

  await supabase
    .from(tabla)
    .update({ usuario_bloqueado_en: null, usuario_bloqueado_por: null })
    .eq('id', personalId)
    .eq('empresa_id', empresaId);

  return { ok: true };
}

// ─── CRUD Supabase ────────────────────────────────────────────────────────────

async function selectAll(table, empresaId, order = 'created_at') {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('empresa_id', empresaId)
    .order(order, { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function cargarLiquidaciones(empresaId) {
  if (!empresaId) return { liquidaciones: [], conceptos: [] };
  const [liquidaciones, conceptos] = await Promise.all([
    selectAll('liquidaciones_cese',           empresaId, 'fecha_cese'),
    selectAll('liquidaciones_cese_conceptos', empresaId, 'orden'),
  ]);
  return { liquidaciones, conceptos };
}

export async function crearLiquidacion(empresaId, payload, creadoPor = null) {
  const supabase = await getSupabaseClient();

  // Verificar que no exista una liquidación activa para este colaborador
  const { data: existente } = await supabase
    .from('liquidaciones_cese')
    .select('id, estado')
    .eq('empresa_id', empresaId)
    .eq('personal_id', payload.personal_id)
    .neq('estado', 'anulada')
    .maybeSingle();

  if (existente) throw new Error('Este colaborador ya tiene una liquidación activa. Anúlala antes de crear una nueva.');

  const { conceptos, montoTotal, remComputable, anios, meses, dias } =
    calcularConceptos(payload.parametros);

  const row = {
    empresa_id:             empresaId,
    personal_id:            payload.personal_id,
    personal_nombre:        payload.personal_nombre,
    personal_tipo:          payload.personal_tipo,
    tipo_cese:              payload.tipo_cese,
    fecha_cese:             payload.fecha_cese,
    fecha_ingreso:          payload.fecha_ingreso,
    anios_servicio:         anios,
    meses_servicio:         meses,
    dias_servicio:          dias,
    remuneracion_computable: remComputable,
    monto_total:            montoTotal,
    estado:                 'calculada',
    beneficiario_nombre:    payload.beneficiario_nombre || null,
    beneficiario_dni:       payload.beneficiario_dni    || null,
    motivo_falta_grave:     payload.motivo_falta_grave  || null,
    evidencia_url:          payload.evidencia_url       || null,
    parametros_calculo:     payload.parametros          || {},
    creado_por:             creadoPor,
  };

  const { data: liquidacion, error: liqErr } = await supabase
    .from('liquidaciones_cese')
    .insert(row)
    .select('*')
    .single();
  if (liqErr) throw liqErr;

  const conceptosRows = conceptos.map(c => ({
    empresa_id:     empresaId,
    liquidacion_id: liquidacion.id,
    ...c,
  }));

  const { data: concData, error: concErr } = await supabase
    .from('liquidaciones_cese_conceptos')
    .insert(conceptosRows)
    .select('*');
  if (concErr) throw concErr;

  return { liquidacion, conceptos: concData || [] };
}

export async function confirmarLiquidacion(liquidacionId, params = {}, confirmedBy = null) {
  const supabase = await getSupabaseClient();

  const { data: liq, error: getErr } = await supabase
    .from('liquidaciones_cese')
    .select('*')
    .eq('id', liquidacionId)
    .single();
  if (getErr) throw getErr;

  if (!['calculada','borrador'].includes(liq.estado))
    throw new Error(`No se puede confirmar una liquidación en estado "${liq.estado}"`);

  // Generar CxP
  const now = new Date();
  const fechaVenc = new Date(liq.fecha_cese + 'T00:00:00');
  fechaVenc.setDate(fechaVenc.getDate() + 10); // ~7 días hábiles

  const beneficiario = liq.beneficiario_nombre || liq.personal_nombre;
  const concepto     = `Liquidación por cese — ${TIPOS_CESE_LABELS[liq.tipo_cese] || liq.tipo_cese} — ${beneficiario}`;

  const { data: cxp, error: cxpErr } = await supabase
    .from('cxp')
    .insert({
      empresa_id:       liq.empresa_id,
      tipo_beneficiario: 'personal',
      personal_id:      liq.personal_id,
      concepto,
      monto_total:      liq.monto_total,
      monto_pagado:     0,
      saldo:            liq.monto_total,
      fecha_emision:    now.toISOString().slice(0, 10),
      fecha_vencimiento: fechaVenc.toISOString().slice(0, 10),
      estado:           'pendiente',
      moneda:           params.moneda || 'PEN',
      notas:            params.observaciones || '',
    })
    .select('*')
    .single();
  if (cxpErr) throw cxpErr;

  // Actualizar liquidación
  const { data: liqActual, error: updErr } = await supabase
    .from('liquidaciones_cese')
    .update({
      estado:          'confirmada',
      cxp_id:          cxp.id,
      confirmado_por:  confirmedBy,
      confirmado_en:   now.toISOString(),
      observaciones:   params.observaciones || null,
      updated_at:      now.toISOString(),
    })
    .eq('id', liquidacionId)
    .select('*')
    .single();
  if (updErr) throw updErr;

  // Marcar colaborador como cesado
  const tablaPersonal = liq.personal_tipo === 'operativo' ? 'personal_operativo' : 'personal_administrativo';
  const cambiosPersonal = {
    estado_laboral: 'cesado',
    fecha_cese:     liq.fecha_cese,
    tipo_cese:      liq.tipo_cese,
    estado:         'inactivo',
  };
  if (liq.tipo_cese === 'despido_falta_grave') {
    cambiosPersonal.no_recontratar = true;
    cambiosPersonal.no_recontratar_motivo = liq.motivo_falta_grave || 'Despido justificado por falta grave';
  }
  await supabase
    .from(tablaPersonal)
    .update(cambiosPersonal)
    .eq('id', liq.personal_id);

  // GAP-12: bloquear acceso al sistema al confirmar el cese
  await bloquearAccesoColaborador(liq.personal_id, liq.personal_tipo, liq.empresa_id, confirmedBy).catch(() => {});

  const { data: conceptos } = await supabase
    .from('liquidaciones_cese_conceptos')
    .select('*')
    .eq('liquidacion_id', liquidacionId)
    .order('orden', { ascending: true });

  return { liquidacion: liqActual, cxp, conceptos: conceptos || [] };
}

export async function anularLiquidacion(liquidacionId, motivo, anuladoPor = null) {
  const supabase = await getSupabaseClient();

  const { data: liq, error: getErr } = await supabase
    .from('liquidaciones_cese')
    .select('*')
    .eq('id', liquidacionId)
    .single();
  if (getErr) throw getErr;

  if (liq.estado === 'anulada') throw new Error('La liquidación ya está anulada.');

  const now = new Date().toISOString();
  let cxp = null;

  // Si estaba confirmada: revertir personal + anular CxP
  if (liq.estado === 'confirmada') {
    const tablaPersonal = liq.personal_tipo === 'operativo' ? 'personal_operativo' : 'personal_administrativo';
    await supabase
      .from(tablaPersonal)
      .update({ estado_laboral: 'activo', fecha_cese: null, tipo_cese: null, estado: 'activo', no_recontratar: false, no_recontratar_motivo: null })
      .eq('id', liq.personal_id);

    if (liq.cxp_id) {
      const { data: cxpAnu } = await supabase
        .from('cxp')
        .update({ estado: 'anulada', notas: `Anulada — liquidación anulada: ${motivo}` })
        .eq('id', liq.cxp_id)
        .select('*')
        .single();
      cxp = cxpAnu;
    }
  }

  // GAP-12: reactivar acceso al sistema si la liquidación se anula
  await reactivarAccesoColaborador(liq.personal_id, liq.personal_tipo, liq.empresa_id).catch(() => {});

  const { data: liqActual } = await supabase
    .from('liquidaciones_cese')
    .update({
      estado:          'anulada',
      motivo_anulacion: motivo,
      anulado_por:     anuladoPor,
      anulado_en:      now,
      updated_at:      now,
    })
    .eq('id', liquidacionId)
    .select('*')
    .single();

  return { liquidacion: liqActual, cxp };
}

import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { esRemunerativoPorSubTipo } from './nominaService.js';

const generateTextId = (prefix) => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${uuid || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;
};

const hhmm = (value) => {
  if (!value) return value;
  return String(value).slice(0, 5);
};

export const CONTRATO_DURACION_DEFAULT = 'indefinido';
export const CONTRATO_DURACION_OPCIONES = [
  ['indefinido', 'Indefinido'],
  ['plazo_fijo', 'Plazo fijo'],
  ['obra_determinada', 'Obra determinada'],
  ['por_encargo', 'Por encargo'],
];

export const normalizarModalidadContrato = (value = '') => {
  const v = String(value || '').trim().toLowerCase();
  if (['honorarios', 'recibos por honorarios', 'recibos_por_honorarios', 'recibo_honorarios', 'rhe'].includes(v)) return 'honorarios';
  if (['planilla', 'cas', 'practicante', 'temporal'].includes(v)) return 'planilla';
  return v || 'planilla';
};

export const esModalidadHonorarios = (persona = {}) => {
  return normalizarModalidadContrato(persona.modalidad_contrato || persona.modalidad_laboral || persona.tipo_contrato) === 'honorarios';
};

export const normalizarTipoContratoDuracion = (value = '', modalidad = 'planilla') => {
  if (normalizarModalidadContrato(modalidad) === 'honorarios') return 'por_encargo';
  const v = String(value || '').trim().toLowerCase();
  if (v.includes('plazo_fijo') || v.includes('plazo fijo') || v.includes('temporal')) return 'plazo_fijo';
  if (v.includes('obra_determinada') || v.includes('obra determinada') || v.includes('obra o servicio')) return 'obra_determinada';
  if (v.includes('por_encargo') || v.includes('por encargo') || v.includes('honorario')) return 'por_encargo';
  return CONTRATO_DURACION_DEFAULT;
};

export const requiereFechaFinContrato = (tipoContrato = '') => {
  return ['plazo_fijo', 'obra_determinada', 'por_encargo'].includes(String(tipoContrato || '').toLowerCase());
};

// Reconoce cualquier variante de régimen de ciclo minero: el literal genérico
// 'ciclo_acumulativo' y los catálogos predefinidos 'minero_14x7', 'minero_20x10',
// 'minero_28x14', 'minero_2x1', etc. Único punto de verdad para esta clasificación
// — usar esto en vez de comparar contra 'ciclo_acumulativo' suelto.
export const esRegimenMinero = (regimenJornada) => {
  const rj = regimenJornada || 'general';
  return rj === 'ciclo_acumulativo' || rj.startsWith('minero_');
};

export const getTipoFiscalizacion = (persona = {}) => {
  if (esRegimenMinero(persona.regimen_jornada)) return 'ciclo';
  if (Boolean(persona.cargo_confianza)) return 'ninguna';
  return 'diaria';
};

export const fiscalizacionLabel = (tipo = '') => ({
  diaria: 'Diaria',
  ciclo: 'Por ciclo',
  ninguna: 'Ninguna',
}[tipo] || 'Diaria');

export const diasVacacionesPorRegimen = (regimen = 'general') => regimen === 'general' ? 30 : 15;

export const asignacionFamiliarMonto = (empresaConfig = {}) => {
  const rmv = Number(empresaConfig?.rmv_vigente || 1130);
  return Math.round(rmv * 0.10 * 100) / 100;
};

export const retencionIrHonorariosLabel = (empresaConfig = {}) => {
  const agente = Boolean(empresaConfig?.agente_retencion);
  const pct = Number(empresaConfig?.pct_retencion_ir_honorarios ?? empresaConfig?.retencion_ir_honorarios ?? 8);
  return agente
    ? `${pct}% (empresa es agente de retencion - configurado en Parametros)`
    : 'No aplica - la empresa no es agente de retencion SUNAT';
};

const parseHoraToMin = (value) => {
  const [hh, mm] = String(value || '').slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
};

const DIA_TURNO_TO_JS = {
  dom: 0,
  lun: 1,
  mar: 2,
  mie: 3,
  jue: 4,
  vie: 5,
  sab: 6,
};

const normalizarDiaTurno = (dia = '') => String(dia || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .slice(0, 3)
  .toLowerCase();

const contarDiasLaborablesDelMes = (diasLaborables = [], fechaBase = new Date()) => {
  if (!Array.isArray(diasLaborables) || !diasLaborables.length) return 0;
  const diasSemana = new Set(
    diasLaborables
      .map(dia => DIA_TURNO_TO_JS[normalizarDiaTurno(dia)])
      .filter(dia => Number.isInteger(dia))
  );
  if (!diasSemana.size) return 0;

  const year = fechaBase.getFullYear();
  const month = fechaBase.getMonth();
  const ultimoDia = new Date(year, month + 1, 0).getDate();
  let total = 0;
  for (let day = 1; day <= ultimoDia; day += 1) {
    if (diasSemana.has(new Date(year, month, day).getDay())) total += 1;
  }
  return total;
};

export const calcularHorasBaseMesDesdeTurno = (turno = {}, fechaBase = new Date()) => {
  if (!turno?.id && !turno?.nombre) return 0;
  const horasEfectivas = Number(turno?.horas_efectivas || 0) || (() => {
    const entrada = parseHoraToMin(turno?.hora_entrada);
    const salida = parseHoraToMin(turno?.hora_salida);
    if (entrada == null || salida == null) return 0;
    let total = salida - entrada;
    if (total <= 0 || turno?.cruza_medianoche) total += 24 * 60;
    total -= Number(turno?.minutos_refrigerio ?? turno?.refrigerio_minutos ?? 0);
    return Math.max(0, total / 60);
  })();
  const dias = contarDiasLaborablesDelMes(turno?.dias_laborables, fechaBase);
  const calculado = Math.round(horasEfectivas * dias);
  return calculado > 0 ? calculado : 0;
};

const normalizarTurno = (t = {}) => ({
  ...t,
  codigo: t.codigo || t.id,
  dias_laborables: Array.isArray(t.dias_laborables) ? t.dias_laborables : [],
  dias_variables: t.dias_variables ?? (Array.isArray(t.dias_laborables) && t.dias_laborables.length === 0),
  refrigerio_minutos: Number(t.refrigerio_minutos ?? t.minutos_refrigerio ?? 0),
  minutos_refrigerio: Number(t.minutos_refrigerio ?? t.refrigerio_minutos ?? 0),
});

const toTurnoRow = (empresaId, turno = {}) => {
  return {
    empresa_id: empresaId,
    codigo: turno.codigo || null,
    nombre: turno.nombre,
    hora_entrada: turno.hora_entrada,
    hora_salida: turno.hora_salida,
    tolerancia_minutos: Number(turno.tolerancia_minutos || 0),
    cruza_medianoche: Boolean(turno.cruza_medianoche),
    dias_laborables: turno.dias_variables ? [] : (turno.dias_laborables || []),
    minutos_refrigerio: Number(turno.minutos_refrigerio ?? turno.refrigerio_minutos ?? 0),
    horas_efectivas: Number(turno.horas_efectivas || 0),
    estado: turno.estado || 'activo',
    detalle_dias: turno.dias_variables ? null : (turno.detalle_dias || null),
    requiere_autorizacion_he: turno.requiere_autorizacion_he ?? null,
    descripcion: turno.descripcion || null,
  };
};

const normalizarAsistencia = (r = {}) => {
  const horasExtraMin = r.horas_extra_min ?? (r.horas_extra !== null && r.horas_extra !== undefined ? Math.round(Number(r.horas_extra || 0) * 60) : 0);
  const esFalta = r.es_falta ?? ['falta', 'falta_justificada'].includes(r.estado);
  const justificada = r.justificada ?? r.estado === 'falta_justificada';

  return {
    ...r,
    hora_entrada: hhmm(r.hora_entrada),
    hora_salida: hhmm(r.hora_salida),
    horas_trabajadas_min: Number(r.horas_trabajadas_min || 0),
    tardanza_min: Number(r.tardanza_min ?? r.tardanza_minutos ?? 0),
    horas_extra_min: Number(horasExtraMin || 0),
    he_autorizada: Boolean(r.he_autorizada),
    autorizacion_he_id: r.autorizacion_he_id || null,
    es_dia_compensado: Boolean(r.es_dia_compensado),
    compensacion_he_id: r.compensacion_he_id || null,
    es_falta: Boolean(esFalta),
    justificada: Boolean(justificada),
    motivo_falta: r.motivo_falta || r.justificacion || null,
    notas: r.notas || null,
    refrigerio_tomado_minutos: Number(r.refrigerio_tomado_minutos || 0),
  };
};

const inferirTrabajadorTipo = (registro = {}) => {
  if (registro.trabajador_tipo) return registro.trabajador_tipo;
  const id = String(registro.trabajador_id || '').toLowerCase();
  if (id.startsWith('per_') || id.startsWith('pad_') || id.startsWith('adm')) return 'administrativo';
  return 'operativo';
};

const toAsistenciaRow = (empresaId, registro = {}, { includeId = true } = {}) => {
  const tardanzaMin = Number(registro.tardanza_min ?? registro.tardanza_minutos ?? 0);
  const horasExtraMin = Number(registro.horas_extra_min ?? 0);
  const row = {
    empresa_id: empresaId,
    trabajador_tipo: inferirTrabajadorTipo(registro),
    trabajador_id: registro.trabajador_id,
    turno_id: registro.turno_id || null,
    fecha: registro.fecha,
    hora_entrada: registro.hora_entrada || null,
    hora_salida: registro.hora_salida || null,
    tardanza_minutos: tardanzaMin,
    tardanza_min: tardanzaMin,
    horas_extra: Number((horasExtraMin / 60).toFixed(2)),
    horas_extra_min: horasExtraMin,
    he_autorizada: Boolean(registro.he_autorizada),
    autorizacion_he_id: registro.autorizacion_he_id || null,
    es_dia_compensado: Boolean(registro.es_dia_compensado),
    compensacion_he_id: registro.compensacion_he_id || null,
    horas_trabajadas_min: Number(registro.horas_trabajadas_min || 0),
    estado: registro.estado || 'completo',
    justificacion: registro.motivo_falta || registro.justificacion || null,
    es_falta: Boolean(registro.es_falta),
    justificada: Boolean(registro.justificada),
    motivo_falta: registro.motivo_falta || null,
    notas: registro.notas || null,
    origen_registro: registro.origen_registro || 'backoffice',
    importacion_biometrica_lote_id: registro.importacion_biometrica_lote_id || null,
    marcas_biometricas: registro.marcas_biometricas || null,
    anulado_por_lote_id: registro.anulado_por_lote_id || null,
    anulado_en: registro.anulado_en || null,
    motivo_anulacion: registro.motivo_anulacion || null,
    latitud: registro.latitud ?? null,
    longitud: registro.longitud ?? null,
    latitud_salida: registro.latitud_salida ?? null,
    longitud_salida: registro.longitud_salida ?? null,
    ubicacion_entrada: registro.ubicacion_entrada || null,
    ubicacion_salida: registro.ubicacion_salida || null,
    geofence_entrada_estado: registro.geofence_entrada_estado || null,
    geofence_salida_estado: registro.geofence_salida_estado || null,
    geocerca_entrada_id: registro.geocerca_entrada_id || null,
    geocerca_salida_id: registro.geocerca_salida_id || null,
    distancia_entrada_m: registro.distancia_entrada_m ?? null,
    distancia_salida_m: registro.distancia_salida_m ?? null,
    precision_entrada_m: registro.precision_entrada_m ?? null,
    precision_salida_m: registro.precision_salida_m ?? null,
    ubicacion_fix_entrada_at: registro.ubicacion_fix_entrada_at || null,
    ubicacion_fix_salida_at: registro.ubicacion_fix_salida_at || null,
    ubicacion_enviado_at: registro.ubicacion_enviado_at || null,
    ubicacion_motivo: registro.ubicacion_motivo || null,
    ubicacion_simulada: Boolean(registro.ubicacion_simulada),
    offline_marcacion: Boolean(registro.offline_marcacion),
    offline_sincronizado_en: registro.offline_sincronizado_en || null,
    sar_estado: registro.sar_estado || null,
    refrigerio_tomado_minutos: Number(registro.refrigerio_tomado_minutos || 0),
    regimen_jornada: registro.regimen_jornada || 'general',
    ciclo_minero_id: registro.ciclo_minero_id || null,
  };
  if (includeId) row.id = registro.id || generateTextId('asis');
  return row;
};

const normalizarPersonalOperativo = (p = {}) => ({
  ...p,
  documento: p.documento || p.dni || '',
  sede: p.sede || '',
  supervisor_id: p.supervisor_id || null,
  supervisor: p.supervisor || '',
  metodo_pago: p.metodo_pago || 'mensual',
  monto_mensual: Number(p.monto_mensual ?? p.sueldo_base ?? 0),
  horas_base_mes: Number(p.horas_base_mes ?? 0) || 0,
  tarifa_hora: Number(p.tarifa_hora ?? p.costo_hora_real ?? p.costo ?? 0),
  costo: Number(p.tarifa_hora ?? p.costo ?? p.costo_hora_real ?? 0),
  costo_hora_real: Number(p.tarifa_hora ?? p.costo_hora_real ?? p.costo ?? 0),
  costo_hora_extra: Number(p.costo_hora_extra ?? p.costo_extra ?? 0),
  tarifa_hora_referencial: p.tarifa_hora_referencial != null ? Number(p.tarifa_hora_referencial) : null,
  acceso_campo: p.acceso_campo ?? false,
  perfil_campo: p.perfil_campo || null,
  modalidad_contrato: normalizarModalidadContrato(p.modalidad_contrato || p.tipo_contrato),
  tipo_contrato: normalizarTipoContratoDuracion(p.tipo_contrato, p.modalidad_contrato || p.tipo_contrato),
  afp_nombre: p.afp_nombre || null,
  tiene_hijos: Boolean(p.tiene_hijos),
  // Deprecated: regimen_laboral individual ya no gobierna calculos; usar empresa_config.regimen_laboral_empresa.
  regimen_laboral: p.regimen_laboral || null,
  regimen_jornada: p.regimen_jornada || 'general',
  dias_ciclo_trabajo: p.dias_ciclo_trabajo ?? (p.regimen_jornada === 'minero_14x7' ? 14 : p.regimen_jornada === 'minero_20x10' ? 20 : p.regimen_jornada === 'minero_28x14' ? 28 : p.regimen_jornada === 'minero_2x1' ? 2 : null),
  dias_ciclo_descanso: p.dias_ciclo_descanso ?? (p.regimen_jornada === 'minero_14x7' ? 7 : p.regimen_jornada === 'minero_20x10' ? 10 : p.regimen_jornada === 'minero_28x14' ? 14 : p.regimen_jornada === 'minero_2x1' ? 1 : null),
  horas_diarias_pactadas: Number(p.horas_diarias_pactadas || 8),
  fecha_inicio_ciclo: p.fecha_inicio_ciclo || null,
  cargo_confianza: Boolean(p.cargo_confianza),
  bonif_altitud: Number(p.bonif_altitud || 0),
  cuota_prestamo_mes: Number(p.cuota_prestamo_mes || 0),
  descuento_judicial: Number(p.descuento_judicial || 0),
  docs: p.docs || { sctr: 'pendiente', medico: 'pendiente', epp: 'pendiente', licencia: 'pendiente' },
  centro_costo_id: p.centro_costo_id || null,
  dias_vacaciones_disponibles: Number(p.dias_vacaciones_disponibles ?? 0),
  codigo_biometrico: p.codigo_biometrico || null,
  email_personal: p.email_personal ?? null,
  celular_personal: p.celular_personal ?? null,
  telefono_personal: p.telefono_personal ?? p.celular_personal ?? null,
  celular_whatsapp: p.celular_whatsapp || p.celular_personal || p.telefono_personal || null,
  whatsapp_opt_in: Boolean(p.whatsapp_opt_in),
  whatsapp_opt_in_en: p.whatsapp_opt_in_en || null,
  datos_bancarios: p.datos_bancarios ?? [],
  usuario_bloqueado_en: p.usuario_bloqueado_en || null,
  usuario_bloqueado_por: p.usuario_bloqueado_por || null,
});

const calcularTarifaHora = (montoMensual, horasBaseMes) => {
  const monto = Number(montoMensual || 0);
  const horas = Number(horasBaseMes || 0) || 0;
  return Math.round((horas > 0 ? monto / horas : 0) * 100) / 100;
};

const toPersonalOperativoRow = (empresaId, persona = {}) => ({
  id: persona.id,
  empresa_id: empresaId,
  codigo: persona.codigo || persona.id,
  nombre: persona.nombre,
  documento: persona.documento || persona.dni || null,
  cargo: persona.cargo || 'Tecnico de Campo',
  cargo_id: persona.cargo_id || null,
  posicion_id: persona.posicion_id || null,
  especialidad: persona.especialidad || 'General',
  especialidad2: persona.especialidad2 || null,
  area: persona.area || null,
  turno_id: persona.turno_id || null,
  telefono: persona.telefono || null,
  email: persona.email || null,
  sede: persona.sede || null,
  supervisor_id: persona.supervisor_id || null,
  supervisor: persona.supervisor || null,
  fecha_ingreso: persona.fecha_ingreso || null,
  sueldo_base: Number(persona.sueldo_base || 0),
  moneda: persona.moneda || 'PEN',
  sistema_pensionario: persona.sistema_pensionario || null,
  metodo_pago: persona.metodo_pago || 'mensual',
  monto_mensual: Number(persona.monto_mensual ?? persona.sueldo_base ?? 0),
  horas_base_mes: Number(persona.horas_base_mes || 0),
  tarifa_hora: calcularTarifaHora(persona.monto_mensual ?? persona.sueldo_base, persona.horas_base_mes),
  modalidad_contrato: normalizarModalidadContrato(persona.modalidad_contrato || persona.tipo_contrato),
  tipo_contrato: normalizarTipoContratoDuracion(persona.tipo_contrato, persona.modalidad_contrato || persona.tipo_contrato),
  afp_nombre: persona.afp_nombre || null,
  tiene_hijos: persona.tiene_hijos ?? false,
  // Deprecated: fuente de verdad de regimen laboral es empresa_config.regimen_laboral_empresa.
  regimen_laboral: persona.regimen_laboral || null,
  cuota_prestamo_mes: Number(persona.cuota_prestamo_mes || 0),
  descuento_judicial: Number(persona.descuento_judicial || 0),
  regimen_jornada: persona.regimen_jornada || 'general',
  horas_diarias_pactadas: Number(persona.horas_diarias_pactadas || 8),
  fecha_inicio_ciclo: persona.fecha_inicio_ciclo || null,
  cargo_confianza: Boolean(persona.cargo_confianza),
  bonif_altitud: Number(persona.bonif_altitud || 0),
  tipo_comision_afp: persona.tipo_comision_afp || 'mixta',
  pct_comision_afp_flujo: Number(persona.pct_comision_afp_flujo || 0),
  costo_hora_real: Number(persona.tarifa_hora ?? calcularTarifaHora(persona.monto_mensual ?? persona.sueldo_base, persona.horas_base_mes) ?? persona.costo_hora_real ?? persona.costo ?? 0),
  costo_hora_extra: Number(persona.costo_hora_extra ?? persona.costo_extra ?? 0),
  tarifa_hora_referencial: persona.tarifa_hora_referencial != null ? Number(persona.tarifa_hora_referencial) : null,
  ruc_colaborador: persona.ruc_colaborador || null,
  retencion_ir: Number(persona.retencion_ir ?? 8),
  suspension_retenciones: persona.suspension_retenciones ?? false,
  vencimiento_suspension: persona.vencimiento_suspension || null,
  acceso_campo: persona.acceso_campo ?? false,
  perfil_campo: persona.perfil_campo || null,
  codigo_biometrico: persona.codigo_biometrico || null,
  email_personal: persona.email_personal || null,
  celular_personal: persona.celular_personal || null,
  telefono_personal: persona.telefono_personal || persona.celular_personal || null,
  celular_whatsapp: persona.celular_whatsapp || persona.celular_personal || persona.telefono_personal || null,
  whatsapp_opt_in: Boolean(persona.whatsapp_opt_in),
  whatsapp_opt_in_en: persona.whatsapp_opt_in_en || null,
  docs: persona.docs || { sctr: 'pendiente', medico: 'pendiente', epp: 'pendiente', licencia: 'pendiente' },
  centro_costo_id: persona.centro_costo_id || null,
  estado: persona.estado || 'disponible',
  datos_bancarios: persona.datos_bancarios ?? [],
});

const toPersonalOperativoUpdate = (cambios = {}) => {
  const map = {
    dni: 'documento',
    costo: 'costo_hora_real',
    costo_extra: 'costo_hora_extra',
  };
  const allowed = new Set([
    'codigo', 'nombre', 'documento', 'cargo', 'cargo_id', 'posicion_id', 'especialidad', 'especialidad2',
    'area', 'turno_id', 'telefono', 'email', 'sede', 'supervisor_id', 'supervisor',
    'fecha_ingreso', 'sueldo_base', 'moneda', 'sistema_pensionario',
    'metodo_pago', 'monto_mensual', 'horas_base_mes', 'tarifa_hora',
    'modalidad_contrato', 'tipo_contrato', 'afp_nombre', 'tiene_hijos', 'regimen_laboral',
    'cuota_prestamo_mes', 'descuento_judicial',
    'horas_diarias_pactadas',
    'cargo_confianza', 'bonif_altitud', 'tipo_comision_afp', 'pct_comision_afp_flujo',
    'costo_hora_real', 'costo_hora_extra',
    'ruc_colaborador', 'retencion_ir', 'suspension_retenciones', 'vencimiento_suspension',
    'acceso_campo', 'perfil_campo',
    'email_personal', 'celular_personal', 'telefono_personal',
    'consentimiento_entrega_electronica', 'consentimiento_entrega_electronica_en',
    'firma_rubrica_url', 'firma_rubrica_path', 'firma_otp_canal', 'firma_otp_verificado_en',
    'firma_autorizacion_doc_id', 'firma_onboarding_completo',
    'codigo_biometrico', 'celular_whatsapp', 'whatsapp_opt_in', 'whatsapp_opt_in_en',
    'docs', 'estado', 'centro_costo_id', 'tarifa_hora_referencial',
    'datos_bancarios', 'usuario_bloqueado_en', 'usuario_bloqueado_por', 'auth_user_id'
  ]);

  return Object.entries(cambios).reduce((row, [key, value]) => {
    const target = map[key] || key;
    if (!allowed.has(target)) return row;
    if (target === 'tarifa_hora_referencial') {
      row[target] = value !== '' && value != null ? Number(value) : null;
      return row;
    }
    row[target] = ['sueldo_base', 'monto_mensual', 'horas_base_mes', 'tarifa_hora', 'costo_hora_real', 'costo_hora_extra', 'cuota_prestamo_mes', 'descuento_judicial', 'horas_diarias_pactadas', 'bonif_altitud', 'pct_comision_afp_flujo'].includes(target)
      ? Number(value || 0)
      : value;
    return row;
  }, {});
};

const normalizarPersonalAdmin = (p = {}) => ({
  ...p,
  dni: p.dni || p.documento || '',
  documento: p.documento || p.dni || '',
  remuneracion: Number(p.remuneracion ?? p.sueldo_base ?? 0),
  sueldo_base: Number(p.sueldo_base ?? p.remuneracion ?? 0),
  metodo_pago: p.metodo_pago || 'mensual',
  monto_mensual: Number(p.monto_mensual ?? p.remuneracion ?? p.sueldo_base ?? 0),
  horas_base_mes: Number(p.horas_base_mes ?? 0) || 0,
  tarifa_hora: Number(p.tarifa_hora ?? p.costo_hora_real ?? p.costo ?? 0),
  tarifa_hora_referencial: p.tarifa_hora_referencial != null ? Number(p.tarifa_hora_referencial) : null,
  modalidad_contrato: normalizarModalidadContrato(p.modalidad_contrato || p.tipo_contrato),
  tipo_contrato: normalizarTipoContratoDuracion(p.tipo_contrato, p.modalidad_contrato || p.tipo_contrato),
  modalidad: p.modalidad || 'Presencial',
  sede: p.sede || '',
  turno_id: p.turno_id || '',
  dias_vacaciones_total: Number(p.dias_vacaciones_total ?? p.vacaciones_pendientes ?? 30),
  dias_vacaciones_usados: Number(p.dias_vacaciones_usados ?? 0),
  dias_vacaciones_disponibles: Number(p.dias_vacaciones_disponibles ?? p.vacaciones_pendientes ?? 0),
  documentos: p.documentos || [],
  centro_costo_id: p.centro_costo_id || null,
  auth_user_id: p.auth_user_id || null,
  tiene_comisiones: Boolean(p.tiene_comisiones),
  porcentaje_comision: p.porcentaje_comision != null ? Number(p.porcentaje_comision) : null,
  modalidad_comision: p.modalidad_comision || null,
  ruc_vendedor: p.ruc_vendedor || null,
  retencion_ir_comision: p.retencion_ir_comision != null ? Number(p.retencion_ir_comision) : 8,
  sistema_pensionario: p.sistema_pensionario || null,
  afp_nombre: p.afp_nombre || null,
  tiene_hijos: Boolean(p.tiene_hijos),
  // Deprecated: regimen_laboral individual ya no gobierna calculos; usar empresa_config.regimen_laboral_empresa.
  regimen_laboral: p.regimen_laboral || null,
  cuota_prestamo_mes: Number(p.cuota_prestamo_mes || 0),
  descuento_judicial: Number(p.descuento_judicial || 0),
  regimen_jornada: p.regimen_jornada || 'general',
  horas_diarias_pactadas: Number(p.horas_diarias_pactadas || 8),
  fecha_inicio_ciclo: p.fecha_inicio_ciclo || null,
  dias_ciclo_trabajo: p.dias_ciclo_trabajo ?? (p.regimen_jornada === 'minero_14x7' ? 14 : p.regimen_jornada === 'minero_20x10' ? 20 : p.regimen_jornada === 'minero_28x14' ? 28 : p.regimen_jornada === 'minero_2x1' ? 2 : null),
  dias_ciclo_descanso: p.dias_ciclo_descanso ?? (p.regimen_jornada === 'minero_14x7' ? 7 : p.regimen_jornada === 'minero_20x10' ? 10 : p.regimen_jornada === 'minero_28x14' ? 14 : p.regimen_jornada === 'minero_2x1' ? 1 : null),
  cargo_confianza: Boolean(p.cargo_confianza),
  bonif_altitud: Number(p.bonif_altitud || 0),
  tipo_comision_afp: p.tipo_comision_afp || 'mixta',
  pct_comision_afp_flujo: Number(p.pct_comision_afp_flujo || 0),
  retencion_ir: p.retencion_ir != null ? Number(p.retencion_ir) : 8,
  suspension_retenciones: Boolean(p.suspension_retenciones),
  vencimiento_suspension: p.vencimiento_suspension || null,
  codigo_biometrico: p.codigo_biometrico || null,
  email_personal: p.email_personal ?? null,
  celular_personal: p.celular_personal ?? null,
  telefono_personal: p.telefono_personal ?? p.celular_personal ?? null,
  celular_whatsapp: p.celular_whatsapp || p.celular_personal || p.telefono_personal || null,
  whatsapp_opt_in: Boolean(p.whatsapp_opt_in),
  whatsapp_opt_in_en: p.whatsapp_opt_in_en || null,
  datos_bancarios: p.datos_bancarios ?? [],
  usuario_bloqueado_en: p.usuario_bloqueado_en || null,
  usuario_bloqueado_por: p.usuario_bloqueado_por || null,
});

const toPersonalAdminRow = (empresaId, persona = {}) => ({
  id: persona.id,
  empresa_id: empresaId,
  codigo: persona.codigo || persona.id,
  nombre: persona.nombre,
  documento: persona.documento || persona.dni || null,
  dni: persona.dni || persona.documento || null,
  fecha_nacimiento: persona.fecha_nacimiento || null,
  direccion: persona.direccion || null,
  cargo: persona.cargo || 'Por definir',
  cargo_id: persona.cargo_id || null,
  posicion_id: persona.posicion_id || null,
  area: persona.area || null,
  telefono: persona.telefono || null,
  email: persona.email || null,
  supervisor: persona.supervisor || null,
  sede: persona.sede || null,
  turno_id: persona.turno_id || null,
  modalidad_contrato: normalizarModalidadContrato(persona.modalidad_contrato || persona.tipo_contrato || persona.modalidad),
  tipo_contrato: normalizarTipoContratoDuracion(persona.tipo_contrato, persona.modalidad_contrato || persona.tipo_contrato || persona.modalidad),
  fecha_ingreso: persona.fecha_ingreso || persona.fecha_inicio || null,
  sueldo_base: Number(persona.sueldo_base ?? persona.remuneracion ?? 0),
  remuneracion: Number(persona.remuneracion ?? persona.sueldo_base ?? 0),
  moneda: persona.moneda || 'PEN',
  metodo_pago: persona.metodo_pago || 'mensual',
  monto_mensual: Number(persona.monto_mensual ?? persona.remuneracion ?? persona.sueldo_base ?? 0),
  horas_base_mes: Number(persona.horas_base_mes || 0),
  tarifa_hora: calcularTarifaHora(persona.monto_mensual ?? persona.remuneracion ?? persona.sueldo_base, persona.horas_base_mes),
  sistema_pensionario: persona.sistema_pensionario || null,
  afp_nombre: persona.afp_nombre || null,
  tiene_hijos: persona.tiene_hijos ?? false,
  // Deprecated: fuente de verdad de regimen laboral es empresa_config.regimen_laboral_empresa.
  regimen_laboral: persona.regimen_laboral || null,
  cuota_prestamo_mes: Number(persona.cuota_prestamo_mes || 0),
  descuento_judicial: Number(persona.descuento_judicial || 0),
  regimen_jornada: persona.regimen_jornada || 'general',
  horas_diarias_pactadas: Number(persona.horas_diarias_pactadas || 8),
  fecha_inicio_ciclo: persona.fecha_inicio_ciclo || null,
  dias_ciclo_trabajo: esRegimenMinero(persona.regimen_jornada) ? (Number(persona.dias_ciclo_trabajo || 0) || null) : null,
  dias_ciclo_descanso: esRegimenMinero(persona.regimen_jornada) ? (Number(persona.dias_ciclo_descanso || 0) || null) : null,
  cargo_confianza: Boolean(persona.cargo_confianza),
  bonif_altitud: Number(persona.bonif_altitud || 0),
  tipo_comision_afp: persona.tipo_comision_afp || 'mixta',
  pct_comision_afp_flujo: Number(persona.pct_comision_afp_flujo || 0),
  modalidad: persona.modalidad_visual || persona.modalidad_trabajo || 'Presencial',
  vacaciones_pendientes: Number(persona.vacaciones_pendientes ?? persona.dias_vacaciones_disponibles ?? persona.dias_vacaciones ?? 0),
  dias_vacaciones_total: Number(persona.dias_vacaciones_total ?? persona.dias_vacaciones ?? 30),
  dias_vacaciones_usados: Number(persona.dias_vacaciones_usados ?? 0),
  dias_vacaciones_disponibles: Number(persona.dias_vacaciones_disponibles ?? persona.dias_vacaciones ?? 0),
  contacto_emergencia: persona.contacto_emergencia || null,
  relacion_emergencia: persona.relacion_emergencia || null,
  telefono_emergencia: persona.telefono_emergencia || null,
  nivel_estudios: persona.nivel_estudios || null,
  especialidad: persona.especialidad || null,
  institucion: persona.institucion || null,
  documentos: persona.documentos || [],
  centro_costo_id: persona.centro_costo_id || null,
  auth_user_id: persona.auth_user_id || null,
  estado: persona.estado || 'activo',
  tiene_comisiones: Boolean(persona.tiene_comisiones),
  porcentaje_comision: persona.porcentaje_comision != null ? Number(persona.porcentaje_comision) : null,
  modalidad_comision: persona.modalidad_comision || null,
  ruc_vendedor: persona.ruc_vendedor || null,
  ruc_colaborador: persona.ruc_colaborador || null,
  retencion_ir_comision: persona.retencion_ir_comision != null ? Number(persona.retencion_ir_comision) : 8,
  retencion_ir: persona.retencion_ir != null ? Number(persona.retencion_ir) : 8,
  suspension_retenciones: Boolean(persona.suspension_retenciones),
  vencimiento_suspension: persona.vencimiento_suspension || null,
  codigo_biometrico: persona.codigo_biometrico || null,
  email_personal: persona.email_personal || null,
  celular_personal: persona.celular_personal || null,
  telefono_personal: persona.telefono_personal || persona.celular_personal || null,
  celular_whatsapp: persona.celular_whatsapp || persona.celular_personal || persona.telefono_personal || null,
  whatsapp_opt_in: Boolean(persona.whatsapp_opt_in),
  whatsapp_opt_in_en: persona.whatsapp_opt_in_en || null,
  tarifa_hora_referencial: persona.tarifa_hora_referencial != null ? Number(persona.tarifa_hora_referencial) : null,
  datos_bancarios: persona.datos_bancarios ?? [],
  usuario_bloqueado_en: persona.usuario_bloqueado_en || null,
  usuario_bloqueado_por: persona.usuario_bloqueado_por || null,
});

const toPersonalAdminUpdate = (cambios = {}) => {
  const map = {
  };
  const allowed = new Set([
    'codigo', 'nombre', 'documento', 'dni', 'fecha_nacimiento', 'direccion',
    'cargo', 'cargo_id', 'posicion_id', 'area', 'telefono', 'email', 'supervisor', 'sede', 'turno_id',
    'modalidad_contrato', 'tipo_contrato', 'fecha_ingreso',
    'sueldo_base', 'remuneracion', 'moneda', 'metodo_pago', 'monto_mensual',
    'horas_base_mes', 'tarifa_hora', 'sistema_pensionario', 'modalidad',
    'afp_nombre', 'tiene_hijos', 'regimen_laboral', 'cuota_prestamo_mes',
    'descuento_judicial', 'horas_diarias_pactadas',
    'cargo_confianza', 'bonif_altitud', 'tipo_comision_afp', 'pct_comision_afp_flujo',
    'vacaciones_pendientes', 'dias_vacaciones_total', 'dias_vacaciones_usados',
    'dias_vacaciones_disponibles', 'contacto_emergencia', 'relacion_emergencia',
    'telefono_emergencia', 'nivel_estudios', 'especialidad', 'institucion',
    'documentos', 'estado', 'centro_costo_id',
    'auth_user_id', 'tiene_comisiones', 'porcentaje_comision',
    'modalidad_comision', 'ruc_vendedor', 'ruc_colaborador', 'retencion_ir_comision', 'retencion_ir',
    'suspension_retenciones', 'vencimiento_suspension', 'tarifa_hora_referencial',
    'email_personal', 'celular_personal', 'telefono_personal',
    'consentimiento_entrega_electronica', 'consentimiento_entrega_electronica_en',
    'firma_rubrica_url', 'firma_rubrica_path', 'firma_otp_canal', 'firma_otp_verificado_en',
    'firma_autorizacion_doc_id', 'firma_onboarding_completo',
    'codigo_biometrico', 'celular_whatsapp', 'whatsapp_opt_in', 'whatsapp_opt_in_en',
    'datos_bancarios', 'usuario_bloqueado_en', 'usuario_bloqueado_por'
  ]);

  return Object.entries(cambios).reduce((row, [key, value]) => {
    const target = map[key] || key;
    if (!allowed.has(target)) return row;
    if (['fecha_nacimiento', 'fecha_ingreso'].includes(target)) {
      row[target] = value || null;
      return row;
    }
    if (target === 'tarifa_hora_referencial') {
      row[target] = value !== '' && value != null ? Number(value) : null;
      return row;
    }
    row[target] = [
      'sueldo_base', 'remuneracion', 'vacaciones_pendientes',
      'dias_vacaciones_total', 'dias_vacaciones_usados', 'dias_vacaciones_disponibles',
      'porcentaje_comision', 'retencion_ir_comision', 'retencion_ir', 'monto_mensual', 'horas_base_mes',
      'tarifa_hora', 'cuota_prestamo_mes', 'descuento_judicial', 'horas_diarias_pactadas',
      'dias_ciclo_trabajo', 'dias_ciclo_descanso', 'bonif_altitud', 'pct_comision_afp_flujo'
    ].includes(target) ? Number(value || 0) : value;
    return row;
  }, {});
};

async function buscarPersonalAsistenciaBloqueada(supabase, empresaId, registro = {}) {
  const tabla = inferirTrabajadorTipo(registro) === 'administrativo' ? 'personal_administrativo' : 'personal_operativo';
  const { data } = await supabase
    .from(tabla)
    .select('id,nombre,asistencia_bloqueada,asistencia_bloqueada_motivo')
    .eq('empresa_id', empresaId)
    .eq('id', registro.trabajador_id)
    .maybeSingle();
  return data || null;
}

function mensajeAsistenciaBloqueada(personal) {
  const nombre = personal.nombre || 'el colaborador';
  const motivo = personal.asistencia_bloqueada_motivo || '';
  if (motivo === 'Contrato rechazado') {
    return `No se puede registrar asistencia: el contrato de ${nombre} fue rechazado en la validacion. Regularice el contrato en Documentos.`;
  }
  if (motivo === 'Sin contrato digital registrado' || motivo === 'job_diario_sin_contrato') {
    return `No se puede registrar asistencia: ${nombre} no tiene contrato digital registrado. Regularice el contrato en Documentos.`;
  }
  return `No se puede registrar asistencia: el contrato de ${nombre} esta vencido. Regularice el contrato en Documentos.`;
}

async function enriquecerAsistenciaHorasExtra(supabase, empresaId, registro = {}) {
  const horasExtraMin = Number(registro.horas_extra_min || 0);
  if (horasExtraMin <= 0) return registro;

  let requiereAut = false;

  if (registro.turno_id) {
    const { data: turnoData } = await supabase
      .from('turnos')
      .select('requiere_autorizacion_he')
      .eq('id', registro.turno_id)
      .maybeSingle();

    if (turnoData && turnoData.requiere_autorizacion_he !== null) {
      requiereAut = turnoData.requiere_autorizacion_he;
    } else {
      const { data: cfg } = await supabase
        .from('empresa_config')
        .select('requiere_autorizacion_he')
        .eq('empresa_id', empresaId)
        .maybeSingle();
      requiereAut = cfg?.requiere_autorizacion_he || false;
    }
  } else {
    const { data: cfg } = await supabase
      .from('empresa_config')
      .select('requiere_autorizacion_he')
      .eq('empresa_id', empresaId)
      .maybeSingle();
    requiereAut = cfg?.requiere_autorizacion_he || false;
  }

  if (!requiereAut) return { ...registro, he_autorizada: true };

  const { data: aut } = await supabase
    .from('autorizaciones_horas_extra')
    .select('id,horas_estimadas,minutos_autorizados')
    .eq('empresa_id', empresaId)
    .eq('personal_id', registro.trabajador_id)
    .eq('fecha', registro.fecha)
    .eq('estado', 'aprobada')
    .order('resuelto_en', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!aut) return { ...registro, he_autorizada: false, autorizacion_he_id: null };

  const autorizadoMin = Number(aut.minutos_autorizados || 0) || Math.max(0, Math.round(Number(aut.horas_estimadas || 0) * 60));
  return {
    ...registro,
    horas_extra_min: Math.min(horasExtraMin, autorizadoMin || horasExtraMin),
    he_autorizada: true,
    autorizacion_he_id: aut.id,
  };
}

async function crearCompensacionHePendiente(supabase, empresaId, asistenciaRow = {}, personal = {}) {
  if (!asistenciaRow?.he_autorizada || Number(asistenciaRow.horas_extra_min || 0) <= 0) return null;
  const { data, error } = await supabase
    .from('horas_extra_compensacion')
    .insert([{
      empresa_id: empresaId,
      personal_id: asistenciaRow.trabajador_id,
      personal_nombre: personal?.nombre || asistenciaRow.trabajador_nombre || null,
      personal_tipo: asistenciaRow.trabajador_tipo === 'admin' ? 'administrativo' : (asistenciaRow.trabajador_tipo || 'operativo'),
      registro_asistencia_id: asistenciaRow.id,
      autorizacion_he_id: asistenciaRow.autorizacion_he_id || null,
      fecha_he: asistenciaRow.fecha,
      minutos: Number(asistenciaRow.horas_extra_min || 0),
      estado: 'pendiente',
    }])
    .select()
    .single();
  if (error) console.warn('[rrhhService.crearCompensacionHePendiente]', error.message || error);
  return data || null;
}

export const rrhhService = {

  // ─── Maestros ─────────────────────────────────────────────────
  getTiposContrato: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tipos_contrato').select('*').eq('empresa_id', empresaId).order('codigo', { ascending: true });
    if (error) { console.error('Error fetching tipos_contrato:', error); return []; }
    return data || [];
  },
  crearTipoContrato: async (empresaId, payload) => {
    const supabase = await getSupabaseClient();
    const id = 'tcon_' + Math.random().toString(36).substr(2, 9);
    const { data, error } = await supabase.from('tipos_contrato').insert([{ id, empresa_id: empresaId, ...payload }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarTipoContrato: async (id, payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('tipos_contrato').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  eliminarTipoContrato: async (id) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('tipos_contrato').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  // ─── Personal Operativo ───────────────────────────────────────
  getPersonalOperativo: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_operativo').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching personal_operativo:', error); return []; }
    return (data || []).map(normalizarPersonalOperativo);
  },
  crearPersonalOperativo: async (empresaId, persona) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_operativo').insert([toPersonalOperativoRow(empresaId, persona)]).select().single();
    if (error) throw error;
    return normalizarPersonalOperativo(data);
  },
  actualizarPersonalOperativo: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const row = toPersonalOperativoUpdate(cambios);
    const { data, error } = await supabase
      .from('personal_operativo').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return normalizarPersonalOperativo(data);
  },
  eliminarPersonalOperativo: async (id) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_operativo').delete().eq('id', id).select('id').single();
    if (error) throw error;
    if (!data) throw new Error('No se pudo eliminar. Permisos insuficientes o registro no encontrado.');
    return id;
  },

  // ─── Personal Administrativo ──────────────────────────────────
  getPersonalAdmin: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_administrativo').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true });
    if (error) { console.error('Error fetching personal_administrativo:', error); return []; }
    return (data || []).map(normalizarPersonalAdmin);
  },
  getPersonalAdminPropio: async (empresaId, { authUserId, email, nombre } = {}) => {
    if (!empresaId || (!authUserId && !email && !nombre)) return null;
    const supabase = await getSupabaseClient();
    const select = '*';
    const base = () => supabase.from('personal_administrativo').select(select).eq('empresa_id', empresaId);

    const byAuthOrEmail = [];
    if (authUserId) byAuthOrEmail.push(`auth_user_id.eq.${authUserId}`);
    if (email) byAuthOrEmail.push(`email.ilike.${String(email).trim()}`);

    if (byAuthOrEmail.length) {
      const { data, error } = await base().or(byAuthOrEmail.join(',')).limit(2);
      if (error) { console.error('Error fetching own personal_administrativo:', error); return null; }
      if ((data || []).length === 1) return normalizarPersonalAdmin(data[0]);
      const exact = (data || []).find(p =>
        (authUserId && p.auth_user_id === authUserId) ||
        (email && String(p.email || '').trim().toLowerCase() === String(email).trim().toLowerCase())
      );
      if (exact) return normalizarPersonalAdmin(exact);
    }

    if (nombre) {
      const { data, error } = await base().ilike('nombre', String(nombre).trim()).limit(2);
      if (error) return null;
      if ((data || []).length === 1) return normalizarPersonalAdmin(data[0]);
    }

    return null;
  },
  getPersonalAdminPorAuth: async (empresaId, authUserId) => rrhhService.getPersonalAdminPropio(empresaId, { authUserId }),
  crearPersonalAdmin: async (empresaId, persona) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_administrativo').insert([toPersonalAdminRow(empresaId, persona)]).select().single();
    if (error) throw error;
    return normalizarPersonalAdmin(data);
  },
  actualizarPersonalAdmin: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const row = toPersonalAdminUpdate(cambios);
    const { data, error } = await supabase
      .from('personal_administrativo').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return normalizarPersonalAdmin(data);
  },
  eliminarPersonalAdmin: async (id) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_administrativo').delete().eq('id', id).select('id').single();
    if (error) throw error;
    if (!data) throw new Error('No se pudo eliminar. Permisos insuficientes o registro no encontrado.');
    return id;
  },

  verificarHistorialDni: async (dni, empresaId) => {
    const doc = String(dni || '').trim();
    if (!doc || !empresaId || !isSupabaseConfigured()) return { encontrado: false };
    const supabase = await getSupabaseClient();
    const select = 'id,nombre,documento,dni,estado,estado_laboral,tipo_cese,fecha_cese,no_recontratar,no_recontratar_motivo';
    const [op, adm] = await Promise.all([
      supabase.from('personal_operativo').select(select).eq('empresa_id', empresaId).or(`dni.eq.${doc},documento.eq.${doc}`).limit(1).maybeSingle(),
      supabase.from('personal_administrativo').select(select).eq('empresa_id', empresaId).or(`dni.eq.${doc},documento.eq.${doc}`).limit(1).maybeSingle(),
    ]);
    const row = op.data || adm.data;
    if (!row) return { encontrado: false };
    return {
      encontrado: true,
      personal_id: row.id,
      personal_tipo: op.data ? 'operativo' : 'administrativo',
      nombre: row.nombre,
      dni: row.dni || row.documento || doc,
      estado: row.estado,
      estado_laboral: row.estado_laboral || row.estado,
      tipo_cese: row.tipo_cese,
      fecha_cese: row.fecha_cese,
      no_recontratar: Boolean(row.no_recontratar),
      no_recontratar_motivo: row.no_recontratar_motivo || null,
    };
  },

  // ─── Turnos ──────────────────────────────────────────────────
  getTurnos: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('turnos').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching turnos:', error); return []; }
    return (data || []).map(normalizarTurno);
  },
  crearTurno: async (empresaId, turno) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('turnos').insert([toTurnoRow(empresaId, turno)]).select().single();
    if (error) throw error;
    return normalizarTurno(data);
  },
  actualizarTurno: async (empresaId, id, turno) => {
    const supabase = await getSupabaseClient();
    const { id: _id, ...row } = toTurnoRow(empresaId, turno);
    const { data, error } = await supabase
      .from('turnos').update(row).eq('id', id).select().single();
    if (error) throw error;
    return normalizarTurno(data);
  },
  eliminarTurno: async (id) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('turnos').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── Registros de Asistencia ──────────────────────────────────
  getAsistencia: async (empresaId, fechaInicio, fechaFin) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    let query = supabase
      .from('registros_asistencia').select('*').eq('empresa_id', empresaId);
    if (fechaInicio) query = query.gte('fecha', fechaInicio);
    if (fechaFin) query = query.lte('fecha', fechaFin);
    const { data, error } = await query.order('fecha', { ascending: false });
    if (error) { console.error('Error fetching asistencia:', error); return []; }
    return (data || []).map(normalizarAsistencia);
  },
  registrarAsistencia: async (empresaId, registro) => {
    const supabase = await getSupabaseClient();
    const personal = await buscarPersonalAsistenciaBloqueada(supabase, empresaId, registro);
    if (personal?.asistencia_bloqueada) {
      throw new Error(mensajeAsistenciaBloqueada(personal));
    }
    const registroFinal = await enriquecerAsistenciaHorasExtra(supabase, empresaId, registro);
    const { data, error } = await supabase
      .from('registros_asistencia').insert([toAsistenciaRow(empresaId, registroFinal)]).select().single();
    if (error) throw error;
    await crearCompensacionHePendiente(supabase, empresaId, data, personal);
    return normalizarAsistencia(data);
  },
  eliminarAsistencia: async (id) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('registros_asistencia').delete().eq('id', id).select();
    if (error) throw error;
    if (!data || !data.length) {
      throw new Error('No se elimino ningun registro: no tienes permiso (requiere ser admin de la empresa) o el registro ya no existe.');
    }
  },
  actualizarAsistencia: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const empresaId = cambios.empresa_id;
    if (empresaId && cambios.trabajador_id) {
      const personal = await buscarPersonalAsistenciaBloqueada(supabase, empresaId, cambios);
      if (personal?.asistencia_bloqueada) {
        throw new Error(mensajeAsistenciaBloqueada(personal));
      }
      cambios = await enriquecerAsistenciaHorasExtra(supabase, empresaId, cambios);
    }
    const row = empresaId
      ? toAsistenciaRow(empresaId, cambios, { includeId: false })
      : { ...cambios };
    delete row.id;
    const { data, error } = await supabase
      .from('registros_asistencia').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return normalizarAsistencia(data);
  },

  // ─── Ciclos Mineros ───────────────────────────────────────────
  getCiclosMineros: async (empresaId, personalId = null) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    let query = supabase.from('asistencia_ciclos_mineros').select('*').eq('empresa_id', empresaId);
    if (personalId) query = query.eq('personal_id', personalId);
    const { data, error } = await query.order('fecha_inicio_ciclo', { ascending: false });
    if (error) { console.error('Error fetching ciclos mineros:', error); return []; }
    return data || [];
  },
  crearCicloMinero: async (empresaId, ciclo, registrosDiarios = []) => {
    const supabase = await getSupabaseClient();
    const id = generateTextId('ciclo');
    const row = { ...ciclo, id, empresa_id: empresaId };
    const { data, error } = await supabase.from('asistencia_ciclos_mineros').insert([row]).select().single();
    if (error) throw error;

    if (registrosDiarios && registrosDiarios.length > 0) {
      const inserts = registrosDiarios.map(r => toAsistenciaRow(empresaId, { ...r, ciclo_minero_id: id, regimen_jornada: row.regimen_jornada }));
      const { error: errAsis } = await supabase.from('registros_asistencia').insert(inserts);
      if (errAsis) console.error('Error insertando registros diarios del ciclo:', errAsis);
    }
    return data;
  },
  actualizarCicloMinero: async (id, cambios, registrosDiarios = []) => {
    const supabase = await getSupabaseClient();
    const { empresa_id, ...row } = cambios;
    const { data, error } = await supabase.from('asistencia_ciclos_mineros')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;

    if (registrosDiarios && registrosDiarios.length > 0) {
      // Borrar registros existentes del ciclo
      await supabase.from('registros_asistencia').delete().eq('ciclo_minero_id', id);
      // Insertar nuevos
      const inserts = registrosDiarios.map(r => toAsistenciaRow(data.empresa_id, { ...r, ciclo_minero_id: id, regimen_jornada: data.regimen_jornada }));
      const { error: errAsis } = await supabase.from('registros_asistencia').insert(inserts);
      if (errAsis) console.error('Error insertando registros diarios del ciclo actualizados:', errAsis);
    }
    return data;
  },

  // ─── Períodos de Nómina ───────────────────────────────────────
  getPeriodosNomina: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('periodos_nomina').select('*').eq('empresa_id', empresaId).order('fecha_inicio', { ascending: false });
    if (error) { console.error('Error fetching periodos_nomina:', error); return []; }
    return data;
  },
  crearPeriodoNomina: async (empresaId, periodo) => {
    const supabase = await getSupabaseClient();
    // id, fecha_inicio y fecha_fin son NOT NULL sin default en la tabla periodos_nomina.
    const payload = { id: `pnm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...periodo, empresa_id: empresaId };
    const { data, error } = await supabase
      .from('periodos_nomina').insert([payload]).select().single();
    if (error) {
      // Ya existe un período con esta combinación empresa/año/mes/quincena
      // (índice único periodos_nomina_empresa_periodo_uq): devolvemos el existente en vez de duplicar.
      if (error.code === '23505') {
        let query = supabase.from('periodos_nomina').select('*')
          .eq('empresa_id', empresaId).eq('anio', periodo.anio).eq('mes', periodo.mes);
        query = periodo.quincena == null ? query.is('quincena', null) : query.eq('quincena', periodo.quincena);
        const { data: existente, error: errSel } = await query.maybeSingle();
        if (errSel) throw errSel;
        if (existente) return existente;
      }
      throw error;
    }
    return data;
  },
  cerrarPeriodoNomina: async (id, cerradoPor) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('periodos_nomina')
      .update({ estado: 'cerrado', cerrado_por: cerradoPor, cerrado_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  obtenerPeriodoNominaPorId: async (id) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('periodos_nomina').select('id, estado').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  // ─── Préstamos al Personal ────────────────────────────────────
  getPrestamosPersonal: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('prestamos_personal').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching prestamos_personal:', error); return []; }
    return data;
  },
  crearPrestamoPersonal: async (empresaId, prestamo) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('prestamos_personal').insert([{ ...prestamo, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },

  getPrestamoPagos: async (empresaId, prestamoId) => {
    if (!empresaId || !prestamoId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('prestamo_pagos').select('*')
      .eq('empresa_id', empresaId).eq('prestamo_id', prestamoId)
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching prestamo_pagos:', error); return []; }
    return data;
  },

  // Registra un pago de cuota. Actualiza saldo/cuotas_pagadas en el préstamo.
  // Si se completan todas las cuotas, marca el préstamo 'cancelado' y pone
  // cuota_prestamo_mes = 0 en el registro del trabajador.
  pagarCuotaPrestamo: async (empresaId, prestamoId, { monto, concepto = 'manual', periodo_id = null }) => {
    const supabase = await getSupabaseClient();

    const { data: prestamo, error: fetchErr } = await supabase
      .from('prestamos_personal').select('*').eq('id', prestamoId).eq('empresa_id', empresaId).single();
    if (fetchErr) throw fetchErr;
    if (prestamo.estado === 'cancelado') throw new Error('El préstamo ya está cancelado');

    const nuevasCuotas = prestamo.cuotas_pagadas + 1;
    const nuevoSaldo = Math.max(0, Number(prestamo.saldo || 0) - Number(monto));
    const cancelado = nuevasCuotas >= prestamo.cuotas;

    const { data: prestamoActualizado, error: updErr } = await supabase
      .from('prestamos_personal')
      .update({ cuotas_pagadas: nuevasCuotas, saldo: nuevoSaldo, estado: cancelado ? 'cancelado' : 'vigente', updated_at: new Date().toISOString() })
      .eq('id', prestamoId).select().single();
    if (updErr) throw updErr;

    const { data: pago, error: pagoErr } = await supabase
      .from('prestamo_pagos')
      .insert([{ empresa_id: empresaId, prestamo_id: prestamoId, fecha: new Date().toISOString().split('T')[0], monto: Number(monto), concepto, periodo_id }])
      .select().single();
    if (pagoErr) throw pagoErr;

    if (cancelado && prestamo.trabajador_id) {
      const tabla = prestamo.trabajador_tipo === 'admin' ? 'personal_administrativo' : 'personal_operativo';
      await supabase.from(tabla)
        .update({ cuota_prestamo_mes: 0, updated_at: new Date().toISOString() })
        .eq('id', prestamo.trabajador_id);
    }

    return { prestamo: prestamoActualizado, pago };
  },

  cancelarPrestamo: async (empresaId, prestamoId) => {
    const supabase = await getSupabaseClient();

    const { data: prestamo, error: fetchErr } = await supabase
      .from('prestamos_personal').select('*').eq('id', prestamoId).eq('empresa_id', empresaId).single();
    if (fetchErr) throw fetchErr;

    const { data, error } = await supabase
      .from('prestamos_personal')
      .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
      .eq('id', prestamoId).select().single();
    if (error) throw error;

    if (prestamo.descontar_nomina && prestamo.trabajador_id) {
      const tabla = prestamo.trabajador_tipo === 'admin' ? 'personal_administrativo' : 'personal_operativo';
      await supabase.from(tabla)
        .update({ cuota_prestamo_mes: 0, updated_at: new Date().toISOString() })
        .eq('id', prestamo.trabajador_id);
    }

    return data;
  },

  async cargarCxpRhePeriodo(empresaId, { desde, hasta } = {}) {
    const supabase = await getSupabaseClient();
    let q = supabase
      .from('cxp')
      .select('id, personal_id, monto_total, monto_bruto, fecha_emision, estado')
      .eq('empresa_id', empresaId)
      .eq('tipo_comprobante', 'RHE');
    if (desde) q = q.gte('fecha_emision', desde);
    if (hasta) q = q.lte('fecha_emision', hasta);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  getAutorizacionesHorasExtra: async (empresaId) => {
    if (!empresaId || !isSupabaseConfigured()) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('autorizaciones_horas_extra').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false });
    if (error) { console.error('getAutorizacionesHorasExtra:', error); return []; }
    return data || [];
  },

  crearAutorizacionHorasExtra: async (empresaId, payload) => {
    const supabase = await getSupabaseClient();
    const minutos = Number(payload?.minutos_autorizados || 0);
    const row = {
      ...payload,
      empresa_id: empresaId,
      minutos_autorizados: minutos,
      horas_estimadas: Number(payload?.horas_estimadas || (minutos / 60) || 0),
      solicitado_por: payload?.solicitado_por || 'sistema',
    };
    const { data, error } = await supabase.from('autorizaciones_horas_extra').insert([row]).select().single();
    if (error) throw error;
    return data;
  },

  resolverAutorizacionHorasExtra: async (id, estado, params = {}) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('autorizaciones_horas_extra')
      .update({ estado, resuelto_por: params.resuelto_por || null, comentario_resolucion: params.comentario_resolucion || null, resuelto_en: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  getHorasExtraCompensacion: async (empresaId) => {
    if (!empresaId || !isSupabaseConfigured()) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('horas_extra_compensacion').select('*').eq('empresa_id', empresaId).order('fecha_he', { ascending: false });
    if (error) { console.error('getHorasExtraCompensacion:', error); return []; }
    return data || [];
  },

  decidirHorasExtraCompensacion: async (id, cambios = {}) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('horas_extra_compensacion').update({ ...cambios, decidido_en: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    if (data?.estado === 'compensar' && data.fecha_dia_libre) {
      await supabase.from('registros_asistencia').upsert([{ id: `comp_${data.id}`, empresa_id: data.empresa_id, trabajador_id: data.personal_id, trabajador_tipo: data.personal_tipo === 'administrativo' ? 'admin' : data.personal_tipo, fecha: data.fecha_dia_libre, estado: 'dia_compensado', es_dia_compensado: true, compensacion_he_id: data.id }], { onConflict: 'id' });
    }
    return data;
  },

  obtenerSaldoHePendiente: async (empresaId, personalId) => {
    if (!empresaId || !personalId || !isSupabaseConfigured()) return 0;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('horas_extra_compensacion').select('minutos').eq('empresa_id', empresaId).eq('personal_id', personalId).eq('estado', 'pendiente');
    if (error) return 0;
    return (data || []).reduce((sum, row) => sum + Number(row.minutos || 0), 0);
  },

  getDescuentosExtraordinarios: async (empresaId) => {
    if (!empresaId || !isSupabaseConfigured()) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('descuentos_extraordinarios').select('*').eq('empresa_id', empresaId).order('registrado_en', { ascending: false });
    if (error) { console.error('getDescuentosExtraordinarios:', error); return []; }
    return data || [];
  },

  crearDescuentoExtraordinario: async (empresaId, payload) => {
    if (!payload?.evidencia_url) throw new Error('Adjunta evidencia para registrar el descuento.');
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('descuentos_extraordinarios').insert([{ ...payload, empresa_id: empresaId, registrado_por: payload?.registrado_por || 'sistema' }]).select().single();
    if (error) throw error;
    return data;
  },

  resolverDescuentoExtraordinario: async (id, estado, params = {}) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('descuentos_extraordinarios').update({ estado, resuelto_por: params.resuelto_por || null, comentario_resolucion: params.comentario_resolucion || null, resuelto_en: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ── Ingresos extraordinarios (espejo de descuentos_extraordinarios) ──────────
  // Defectos corregidos respecto al espejo: periodo_id obligatorio (no puede
  // "flotar" sin período) y evidencia opcional (a diferencia del descuento, que la
  // exige). La transición a 'aplicado' ocurre en cerrarPeriodo, no acá.
  getIngresosExtraordinarios: async (empresaId) => {
    if (!empresaId || !isSupabaseConfigured()) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('ingresos_extraordinarios').select('*').eq('empresa_id', empresaId).order('registrado_en', { ascending: false });
    if (error) { console.error('getIngresosExtraordinarios:', error); return []; }
    return data || [];
  },

  crearIngresoExtraordinario: async (empresaId, payload) => {
    if (!payload?.periodo_id) throw new Error('Selecciona un período antes de registrar el ingreso.');
    const supabase = await getSupabaseClient();
    // es_remunerativo se calcula del sub_tipo (el usuario nunca lo elige a mano) — se
    // vuelve a calcular al aprobar, para que el snapshot final refleje la clasificación
    // vigente en ese momento, no la que había al momento de la captura inicial.
    const { data, error } = await supabase.from('ingresos_extraordinarios').insert([{
      ...payload,
      empresa_id: empresaId,
      es_remunerativo: esRemunerativoPorSubTipo(payload.sub_tipo),
      registrado_por: payload?.registrado_por || 'sistema',
    }]).select().single();
    if (error) throw error;
    return data;
  },

  resolverIngresoExtraordinario: async (id, estado, params = {}) => {
    const supabase = await getSupabaseClient();
    const update = { estado, resuelto_por: params.resuelto_por || null, comentario_resolucion: params.comentario_resolucion || null, resuelto_en: new Date().toISOString() };
    // Snapshot de es_remunerativo solo al aprobar — clasificación vigente en ese momento,
    // no se recalcula después aunque la constante de clasificación cambie más adelante.
    if (estado === 'aprobado') {
      const { data: actual, error: errActual } = await supabase.from('ingresos_extraordinarios').select('sub_tipo').eq('id', id).single();
      if (errActual) throw errActual;
      update.es_remunerativo = esRemunerativoPorSubTipo(actual.sub_tipo);
    }
    const { data, error } = await supabase.from('ingresos_extraordinarios').update(update).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // Transición 'aprobado' → 'aplicado', disparada en cerrarPeriodo (no en resolverIngresoExtraordinario,
  // que representa la aprobación humana original y no debe sobreescribirse por el cierre).
  aplicarIngresoExtraordinario: async (id) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('ingresos_extraordinarios').update({ estado: 'aplicado', aplicado_en: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ── Asignaciones de jornada con vigencia ─────────────────────────────────────

  async getAsignacionesJornada(empresaId) {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('personal_asignaciones_jornada')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_inicio', { ascending: true });
    if (error) { console.error('Error fetching asignaciones_jornada:', error); return []; }
    return data || [];
  },

  async crearAsignacionJornada(empresaId, personalId, personalTipo, params) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('crear_asignacion_jornada', {
      p_empresa_id:          empresaId,
      p_personal_id:         personalId,
      p_personal_tipo:       personalTipo,
      p_tipo_tramo:          params.tipo_tramo || 'normal',
      p_fecha_inicio:        params.fecha_inicio,
      p_regimen_jornada:     params.regimen_jornada || null,
      p_dias_ciclo_trabajo:  params.dias_ciclo_trabajo ? Number(params.dias_ciclo_trabajo) : null,
      p_dias_ciclo_descanso: params.dias_ciclo_descanso ? Number(params.dias_ciclo_descanso) : null,
      p_fecha_inicio_ciclo:  params.fecha_inicio_ciclo || null,
      p_turno_id:            params.turno_id || null,
      p_motivo:              params.motivo || null,
      p_forzar_override:     params.forzar_override || false,
      p_motivo_override:     params.motivo_override || null,
    });
    if (error) throw error;
    return data;
  },
};

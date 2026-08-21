export const TIPO_TRABAJO_VALUES = ['Preventivo_PM', 'Correctivo', 'Acondicionamiento', 'Overhaul'];
export const TIPO_CARGO_VALUES   = ['Cliente_Contrato', 'Interno_Zahory', 'Garantia_Fabrica', 'Reclamo_Rework', 'Garantia_Zahory'];

export const LINEA_NEGOCIO_VALUES = [
  'flota_alquileres', 'maestranza_fab', 'transporte_comercial',
  'venta_repuestos',  'interno_zahory',
];
export const LINEA_NEGOCIO_LABELS = {
  flota_alquileres:    'Flota y Alquileres',
  maestranza_fab:      'Maestranza y Fab.',
  transporte_comercial:'Transporte Comercial',
  venta_repuestos:     'Venta de Repuestos',
  interno_zahory:      'Interno plataforma',
};

export const ESPECIALIDADES = [
  { id: 'MEC_A',  label: 'Mecánico A',          tarifaUSD: 35 },
  { id: 'MEC_B',  label: 'Mecánico B',          tarifaUSD: 28 },
  { id: 'ELEC_A', label: 'Electricista A',      tarifaUSD: 38 },
  { id: 'ELEC_B', label: 'Electricista B',      tarifaUSD: 30 },
  { id: 'SOLD',   label: 'Soldador',            tarifaUSD: 32 },
  { id: 'LUBR',   label: 'Lubricador',          tarifaUSD: 22 },
  { id: 'INSP',   label: 'Inspector técnico',   tarifaUSD: 45 },
  { id: 'OP_EQ',  label: 'Operador de equipo',  tarifaUSD: 25 },
];

export const OT_COMBINATION_GUARDS = {
  'Preventivo_PM:Garantia_Fabrica':
    'Un Mantenimiento Preventivo es por desgaste natural. La Garantia de Fabrica no cubre desgaste. Seleccione Correctivo si un repuesto fallo.',
  'Preventivo_PM:Reclamo_Rework':
    'No se puede abrir un Preventivo por una mala practica. Si debe rehacer un trabajo mal ejecutado, el tipo de trabajo debe ser Correctivo.',
  'Overhaul:Reclamo_Rework':
    'Un Overhaul es una reconstruccion mayor planificada, no un Retrabajo. Verifique su seleccion.',
};

export const COMBINACIONES_BLOQUEADAS = [
  { tipo: 'Preventivo_PM', cargo: 'Garantia_Fabrica',
    motivo: 'El PM es desgaste natural — la garantía no cubre desgaste.' },
  { tipo: 'Preventivo_PM', cargo: 'Reclamo_Rework',
    motivo: 'Un retrabajo debe ser correctivo por naturaleza.' },
  { tipo: 'Overhaul',      cargo: 'Reclamo_Rework',
    motivo: 'El overhaul es reconstrucción planificada, no un retrabajo.' },
];

export const NON_BILLABLE_CARGOS = ['Interno_Zahory', 'Garantia_Fabrica', 'Reclamo_Rework', 'Garantia_Zahory'];

export const getBlockedCargoReason = (tipoTrabajo, tipoCargo) =>
  OT_COMBINATION_GUARDS[`${tipoTrabajo}:${tipoCargo}`] || '';

export const isCargoDisabledForTrabajo = (tipoTrabajo, tipoCargo) =>
  Boolean(getBlockedCargoReason(tipoTrabajo, tipoCargo));

// ── Factories ──────────────────────────────────────────────────────────────

export const makeOperacion = (n = 1) => ({
  codigo: String(n).padStart(2, '0'),
  tipo_servicio_interno_id: '',
  descripcion: '',
});

export const makeMOItem = () => ({
  especialidad_id: '',
  cantidad_tecnicos: 1,
  horas_estimadas: 4,
});

export const makeRepuestoItem = () => ({
  repuesto_id: '',
  cantidad: 1,
  precio_unitario: 0,
});

export const makeTerceroItem = () => ({
  descripcion_servicio: '',
  costo_estimado: 0,
});

export const makeSegmento = (n = 1) => ({
  codigo: String(n).padStart(2, '0'),
  descripcion: n === 1 ? 'Segmento principal' : '',
  ot_operaciones: [makeOperacion(1)],
  estimacion_mano_obra: [],
  estimacion_repuestos: [],
  estimacion_terceros: [],
});

// ── Totalizadores ──────────────────────────────────────────────────────────

export const calcSegmentoMO = (seg) =>
  seg.estimacion_mano_obra.reduce((sum, item) => {
    const esp = ESPECIALIDADES.find(e => e.id === item.especialidad_id);
    return sum + (esp?.tarifaUSD || 0) * Number(item.cantidad_tecnicos || 1) * Number(item.horas_estimadas || 0);
  }, 0);

export const calcSegmentoRepuestos = (seg) =>
  seg.estimacion_repuestos.reduce(
    (sum, item) => sum + Number(item.precio_unitario || 0) * Number(item.cantidad || 0),
    0
  );

export const calcSegmentoTerceros = (seg) =>
  seg.estimacion_terceros.reduce((sum, item) => sum + Number(item.costo_estimado || 0), 0);

export const calcOTTotals = (segmentos) => {
  const mo = segmentos.reduce((s, seg) => s + calcSegmentoMO(seg), 0);
  const repuestos = segmentos.reduce((s, seg) => s + calcSegmentoRepuestos(seg), 0);
  const terceros = segmentos.reduce((s, seg) => s + calcSegmentoTerceros(seg), 0);
  return { mo, repuestos, terceros, total: mo + repuestos + terceros };
};

// ── Validación ─────────────────────────────────────────────────────────────

export const validateOTForm = (data) => {
  const issues = [];
  const addIssue = (path, message) => issues.push({ path, message });
  const objetoCostoTipo = data.objetoCostoTipo || 'contrato';

  if (!data.lineaNegocio) addIssue(['lineaNegocio'], 'Seleccione la linea de negocio.');

  if (objetoCostoTipo !== 'equipo_interno') {
    if (data.lineaNegocio === 'flota_alquileres' && data.tipoCargo === 'Interno_Zahory')
      addIssue(['tipoCargo'], 'Una OT de Flota no puede tener cargo interno. Use Cliente_Contrato o Garantia_Fabrica.');
    if (!data.clienteId)  addIssue(['clienteId'],  'Seleccione un cliente.');
    if (!data.contratoId) addIssue(['contratoId'], 'Seleccione un contrato / proyecto.');
  }

  if (!data.equipo)           addIssue(['equipo'],                'Seleccione un activo / equipo.');
  if (!data.lugarEjecucion)   addIssue(['lugarEjecucion'],        'Seleccione el lugar de ejecucion.');
  if (data.lugarEjecucion === 'Campo_Mina' && !String(data.unidadMinera || '').trim())
    addIssue(['unidadMinera'], 'Ingrese la unidad minera.');
  if (!data.tipoTrabajo)      addIssue(['tipoTrabajo'],           'Seleccione el tipo de trabajo.');
  if (!data.tipoCargo)        addIssue(['tipoCargo'],             'Seleccione el cargo financiero.');
  if (!data.fechaProgramadaInicio) addIssue(['fechaProgramadaInicio'], 'Ingrese la fecha programada de inicio.');
  if (!data.tecnico)          addIssue(['tecnico'],               'Seleccione un tecnico responsable.');
  if (!data.descripcion)      addIssue(['descripcion'],           'Ingrese la descripcion del trabajo.');

  const blockedReason = getBlockedCargoReason(data.tipoTrabajo, data.tipoCargo);
  if (blockedReason) addIssue(['tipoCargo'], blockedReason);

  if (data.tipoCargo === 'Reclamo_Rework' && !String(data.motivoRetrabajo || '').trim())
    addIssue(['motivoRetrabajo'], 'La justificacion del retrabajo es obligatoria.');

  if (!data.hasValidSegment)
    addIssue(['segmentos'], 'Toda OT debe tener al menos 1 segmento con descripcion y 1 operacion.');

  return {
    success: issues.length === 0,
    issues,
    fieldErrors: issues.reduce((acc, issue) => {
      const key = issue.path[0];
      acc[key] = acc[key] || [];
      acc[key].push(issue.message);
      return acc;
    }, {}),
  };
};

// ── Zod equivalente para backend / Supabase edge functions ─────────────────
// const operacionSchema = z.object({
//   codigo: z.string().min(1),
//   descripcion: z.string().min(1),
// });
// const moItemSchema = z.object({
//   especialidad_id: z.enum(ESPECIALIDADES.map(e => e.id)),
//   cantidad_tecnicos: z.number().int().min(1),
//   horas_estimadas: z.number().min(0.5),
// });
// const repItemSchema = z.object({
//   repuesto_id: z.string().min(1),
//   cantidad: z.number().int().min(1),
//   precio_unitario: z.number().min(0),
// });
// const terItemSchema = z.object({
//   descripcion_servicio: z.string().min(1),
//   costo_estimado: z.number().min(0),
// });
// const segmentoSchema = z.object({
//   codigo: z.string().min(1),
//   descripcion: z.string().min(1),
//   ot_operaciones: z.array(operacionSchema).min(1),
//   estimacion_mano_obra: z.array(moItemSchema),
//   estimacion_repuestos: z.array(repItemSchema),
//   estimacion_terceros: z.array(terItemSchema),
// });
// export const otSchema = z.object({
//   tipoTrabajo: z.enum(TIPO_TRABAJO_VALUES),
//   tipoCargo: z.enum(TIPO_CARGO_VALUES),
//   fechaProgramadaInicio: z.string().min(1),
//   fechaPrimerLaborReal: z.string().datetime().nullable().optional(),
//   motivoRetrabajo: z.string().optional(),
//   ot_segmentos: z.array(segmentoSchema).min(1),
// }).superRefine((data, ctx) => {
//   const blockedReason = getBlockedCargoReason(data.tipoTrabajo, data.tipoCargo);
//   if (blockedReason)
//     ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tipoCargo'], message: blockedReason });
//   if (data.tipoCargo === 'Reclamo_Rework' && !data.motivoRetrabajo?.trim())
//     ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['motivoRetrabajo'], message: 'La justificacion del retrabajo es obligatoria.' });
// });

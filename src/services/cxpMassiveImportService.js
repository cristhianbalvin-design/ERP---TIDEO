import * as XLSX from 'xlsx';
import { comprasService } from './comprasService.js';
import { getTipoCambioPorFecha } from './tipoCambioService.js';

export const CXP_MASSIVE_SHEET = 'CxP';
export const CXP_MASSIVE_HEADERS = [
  'ruc_emisor', 'razon_social', 'tipo_cxp', 'documento', 'concepto',
  'fecha_emision', 'fecha_vencimiento', 'moneda', 'monto_total', 'monto_pagado',
  'fecha_pago', 'cuenta_bancaria', 'referencia_pago', 'categoria_er', 'centro_costo_codigo',
  'personal_id', 'numero_rhe', 'monto_bruto', 'trabajo_facturable',
];
export const TIPOS_CXP_MASIVA = ['Factura', 'Boleta', 'Nota de débito', 'Sin comprobante', 'RHE'];

export const normalizarRucCxp = value => String(value ?? '').replace(/\D/g, '');
export const normalizarTextoCxp = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();
export const normalizarCodigoCxp = value => String(value ?? '').trim().toUpperCase();

const texto = value => String(value ?? '').trim();
const mismoTexto = (left, right) => normalizarTextoCxp(left) === normalizarTextoCxp(right);

const numero = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const raw = texto(value);
  if (!raw) return 0;
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  return Number(normalized);
};

export const normalizarFechaCxp = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = texto(value);
  let year;
  let month;
  let day;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [year, month, day] = raw.split('-').map(Number);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    [day, month, year] = raw.split('/').map(Number);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
    : null;
};

const inCecoRange = (ceco, fecha) => {
  if (ceco.fecha_inicio && fecha < String(ceco.fecha_inicio).slice(0, 10)) return false;
  if (ceco.fecha_fin && fecha > String(ceco.fecha_fin).slice(0, 10)) return false;
  return true;
};

const redondear2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const normalizarBooleano = value => {
  const input = normalizarTextoCxp(value);
  if (['si', 'sí', 'true', '1'].includes(input)) return true;
  if (['no', 'false', '0'].includes(input)) return false;
  return null;
};

// Replica el filtro actual del selector de RHE en pages_fin.jsx.
export const esColaboradorElegibleRhe = persona => Boolean(persona)
  && (persona._origen_personal === 'administrativo' ? persona.estado === 'activo' : persona.estado !== 'inactivo')
  && (persona.tipo_contrato === 'Honorarios' || Boolean(persona.ruc_colaborador));

export const retencionRheInterna = (persona, fechaHoy = new Date().toISOString().slice(0, 10)) => {
  const suspensionVigente = Boolean(persona?.suspension_retenciones)
    && (!persona?.vencimiento_suspension || String(persona.vencimiento_suspension).slice(0, 10) >= fechaHoy);
  if (suspensionVigente) return 0;
  return Number(persona?.retencion_ir ?? persona?.retencion_ir_comision ?? 8) / 100;
};

export const huellaDuplicadoCxp = ({ ruc_emisor, concepto, fecha_emision, monto_total }) => [
  normalizarRucCxp(ruc_emisor),
  normalizarTextoCxp(concepto),
  String(fecha_emision || '').slice(0, 10),
  Number(numero(monto_total)).toFixed(2),
].join('|');

export const huellaDuplicadoRhe = ({ ruc_emisor, personal_id, numero_rhe }) => [
  'RHE',
  normalizarRucCxp(ruc_emisor) || `PERSONAL:${texto(personal_id)}`,
  normalizarTextoCxp(numero_rhe),
].join('|');

const rucDeCxp = (cxp, proveedoresPorId) => cxp?.ruc_emisor
  || cxp?.proveedores?.ruc
  || proveedoresPorId.get(cxp?.proveedor_id)?.ruc
  || '';

export async function cargarCatalogosCxpMasivo(supabase, empresaId) {
  const [proveedoresR, cecosR, categoriasR, cxpR, personalAdminR, personalOperativoR] = await Promise.all([
    supabase.from('proveedores').select('id,ruc,razon_social,estado').eq('empresa_id', empresaId),
    supabase.from('centros_costo').select('id,codigo,nombre,estado,fecha_inicio,fecha_fin').eq('empresa_id', empresaId),
    supabase.from('er_categorias').select('nombre,activo,tipo_sistema,seccion,orden').eq('empresa_id', empresaId),
    supabase.from('cxp').select('id,proveedor_id,ruc_emisor,personal_id,tipo_comprobante,factura_numero,concepto,fecha_emision,monto_total,proveedores(ruc)').eq('empresa_id', empresaId),
    supabase.from('personal_administrativo').select('id,nombre,estado,tipo_contrato,ruc_colaborador,retencion_ir,retencion_ir_comision,suspension_retenciones,vencimiento_suspension').eq('empresa_id', empresaId),
    supabase.from('personal_operativo').select('id,nombre,estado,tipo_contrato,ruc_colaborador,retencion_ir,suspension_retenciones,vencimiento_suspension').eq('empresa_id', empresaId),
  ]);
  const error = [proveedoresR, cecosR, categoriasR, cxpR, personalAdminR, personalOperativoR].find(result => result.error)?.error;
  if (error) throw error;
  return {
    proveedores: proveedoresR.data || [],
    centrosCosto: cecosR.data || [],
    categoriasEr: categoriasR.data || [],
    cxpExistentes: cxpR.data || [],
    personal: [
      ...(personalAdminR.data || []).map(persona => ({ ...persona, _origen_personal: 'administrativo' })),
      ...(personalOperativoR.data || []).map(persona => ({ ...persona, _origen_personal: 'operativo' })),
    ],
  };
}

export async function descargarPlantillaCxpMasiva(supabase, empresaId, empresaNombre = '') {
  const [cecosR, categoriasR, personalAdminR, personalOperativoR] = await Promise.all([
    supabase.from('centros_costo')
      .select('codigo,nombre,fecha_inicio,fecha_fin')
      .eq('empresa_id', empresaId)
      .eq('estado', 'activo')
      .order('codigo'),
    supabase.from('er_categorias')
      .select('nombre,seccion,regla_ot')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('orden'),
    supabase.from('personal_administrativo')
      .select('id,nombre,estado,tipo_contrato,ruc_colaborador,retencion_ir,retencion_ir_comision,suspension_retenciones,vencimiento_suspension')
      .eq('empresa_id', empresaId).order('nombre'),
    supabase.from('personal_operativo')
      .select('id,nombre,estado,tipo_contrato,ruc_colaborador,retencion_ir,suspension_retenciones,vencimiento_suspension')
      .eq('empresa_id', empresaId).order('nombre'),
  ]);
  if (cecosR.error) throw cecosR.error;
  if (categoriasR.error) throw categoriasR.error;
  if (personalAdminR.error) throw personalAdminR.error;
  if (personalOperativoR.error) throw personalOperativoR.error;

  const colaboradoresRhe = [
    ...(personalAdminR.data || []).map(persona => ({ ...persona, _origen_personal: 'administrativo' })),
    ...(personalOperativoR.data || []).map(persona => ({ ...persona, _origen_personal: 'operativo' })),
  ].filter(esColaboradorElegibleRhe);

  const wb = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([CXP_MASSIVE_HEADERS, [
    '20123456789', 'Proveedor Ejemplo S.A.C.', 'Factura', 'F001-000123', 'Servicio de mantenimiento',
    '2026-07-27', '2026-08-26', 'PEN', '1180.00', '0.00', '', '', '',
    (categoriasR.data || [])[0]?.nombre || '', (cecosR.data || [])[0]?.codigo || '', '', '', '', '',
  ], [
    '', '', 'RHE', '', 'Servicio profesional',
    '2026-07-27', '2026-08-26', 'PEN', '920.00', '0.00', '', '', '',
    'Servicios terceros', (cecosR.data || [])[0]?.codigo || '', '', 'RHE-00001', '1000.00', '',
  ]]);
  dataSheet['!cols'] = CXP_MASSIVE_HEADERS.map(header => ({ wch: Math.max(14, header.length + 2) }));

  const instructions = [
    ['Plantilla de carga masiva de Cuentas por Pagar'],
    ['Tenant', empresaNombre || empresaId],
    ['Generada en', new Date().toISOString()],
    [],
    ['Reglas obligatorias'],
    ['1', 'Proveedores: Factura, Boleta, Nota de débito o Sin comprobante. RHE: emisor externo o colaborador interno.'],
    ['2', 'El saldo debe quedar pendiente: monto_pagado debe ser menor que monto_total.'],
    ['3', 'Si monto_pagado es mayor a cero, fecha_pago es obligatoria.'],
    ['4', 'La categoría ER debe figurar como activa en esta hoja.'],
    ['5', 'El CECO debe estar activo y la fecha de emisión debe estar dentro de su vigencia.'],
    ['6', 'RUC no existente se crea como proveedor solo para comprobantes de proveedor; un RHE externo no crea proveedor.'],
    ['7', 'Duplicados por RUC + concepto + fecha de emisión + monto total son rechazados.'],
    ['8', 'Para USD el tipo de cambio se obtiene automáticamente; no agregues una columna de TC.'],
    ['9', 'RHE externo: RUC, razón social, número RHE, monto bruto y categoría ER. Retención automática: 8%.'],
    ['10', 'RHE interno: personal_id, número RHE, monto bruto y trabajo_facturable (SI/NO). RUC/nombre, retención y categoría se validan contra el maestro vigente.'],
    ['11', 'Para RHE, monto_total es neto (monto_bruto menos retención); el pago parcial se compara contra el neto.'],
    ['12', 'Formato de fechas: DD/MM/AAAA o AAAA-MM-DD.'],
    [],
    ['Valores permitidos de tipo_cxp', ...TIPOS_CXP_MASIVA],
    [],
    ['CECOs activos'],
    ['Código', 'Nombre', 'Fecha inicio', 'Fecha fin'],
    ...(cecosR.data || []).map(c => [c.codigo, c.nombre, c.fecha_inicio || '', c.fecha_fin || '']),
    [],
    ['Categorías ER activas'],
    ['Nombre', 'Sección', 'Regla OT'],
    ...(categoriasR.data || []).map(c => [c.nombre, c.seccion, c.regla_ot]),
    [],
    ['Colaboradores elegibles para RHE'],
    ['personal_id', 'Nombre', 'RUC', 'Tipo contrato', 'Retención IR', 'Suspensión vigente'],
    ...colaboradoresRhe.map(persona => [
      persona.id, persona.nombre, persona.ruc_colaborador || '', persona.tipo_contrato || '',
      persona.retencion_ir ?? persona.retencion_ir_comision ?? 8,
      Boolean(persona.suspension_retenciones) && (!persona.vencimiento_suspension || String(persona.vencimiento_suspension).slice(0, 10) >= new Date().toISOString().slice(0, 10)) ? 'SI' : 'NO',
    ]),
  ];
  const referenceSheet = XLSX.utils.aoa_to_sheet(instructions);
  referenceSheet['!cols'] = [{ wch: 28 }, { wch: 58 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
  referenceSheet['!protect'] = { selectLockedCells: true, selectUnlockedCells: false };

  XLSX.utils.book_append_sheet(wb, dataSheet, CXP_MASSIVE_SHEET);
  XLSX.utils.book_append_sheet(wb, referenceSheet, 'Referencia e instrucciones');
  XLSX.writeFile(wb, `plantilla_cxp_masiva_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function leerPlantillaCxpMasiva(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = event => {
      try {
        const workbook = XLSX.read(event.target.result, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[CXP_MASSIVE_SHEET];
        if (!sheet) throw new Error(`El archivo debe incluir la hoja "${CXP_MASSIVE_SHEET}".`);
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' }));
      } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function validarFilasCxpMasiva(rows, catalogos = {}) {
  const proveedoresPorId = new Map((catalogos.proveedores || []).map(p => [p.id, p]));
  const categorias = (catalogos.categoriasEr || []).filter(c => c.activo !== false);
  const personalPorId = new Map((catalogos.personal || []).map(persona => [persona.id, persona]));
  const cecosPorCodigo = new Map((catalogos.centrosCosto || []).map(c => [normalizarCodigoCxp(c.codigo), c]));
  const dbFingerprints = new Set((catalogos.cxpExistentes || []).filter(cxp => !mismoTexto(cxp.tipo_comprobante, 'RHE')).map(cxp => huellaDuplicadoCxp({
    ruc_emisor: rucDeCxp(cxp, proveedoresPorId), concepto: cxp.concepto,
    fecha_emision: cxp.fecha_emision, monto_total: cxp.monto_total,
  })));
  const dbRheFingerprints = new Set((catalogos.cxpExistentes || [])
    .filter(cxp => mismoTexto(cxp.tipo_comprobante, 'RHE'))
    .map(cxp => huellaDuplicadoRhe({
      ruc_emisor: cxp.ruc_emisor, personal_id: cxp.personal_id, numero_rhe: cxp.factura_numero,
    })));
  const fileFingerprints = new Map();

  return (rows || []).map((source, index) => {
    const errores = [];
    let ruc_emisor = normalizarRucCxp(source.ruc_emisor);
    let razon_social = texto(source.razon_social);
    const tipo_cxp = TIPOS_CXP_MASIVA.find(tipo => mismoTexto(tipo, source.tipo_cxp));
    const esRhe = tipo_cxp === 'RHE';
    const documento = texto(source.documento);
    const personal_id = texto(source.personal_id);
    const numero_rhe = texto(source.numero_rhe);
    const monto_bruto = numero(source.monto_bruto);
    const trabajo_facturable = normalizarBooleano(source.trabajo_facturable);
    const personal = personalPorId.get(personal_id);
    const concepto = texto(source.concepto);
    const fecha_emision = normalizarFechaCxp(source.fecha_emision);
    const fecha_vencimiento = normalizarFechaCxp(source.fecha_vencimiento);
    const moneda = texto(source.moneda || 'PEN').toUpperCase();
    const monto_total = numero(source.monto_total);
    const monto_pagado = numero(source.monto_pagado);
    const fecha_pago = normalizarFechaCxp(source.fecha_pago);
    const categoriaInput = texto(source.categoria_er);
    let categoria = categorias.find(item => mismoTexto(item.nombre, categoriaInput));
    const centro_costo_codigo = normalizarCodigoCxp(source.centro_costo_codigo);
    const centroCosto = cecosPorCodigo.get(centro_costo_codigo);

    if (!esRhe && !/^\d{11}$/.test(ruc_emisor)) errores.push('RUC emisor inválido: debe tener 11 dígitos.');
    if (!esRhe && !razon_social) errores.push('Razón social obligatoria.');
    if (!tipo_cxp) errores.push(`Tipo CxP inválido. Valores permitidos: ${TIPOS_CXP_MASIVA.join(', ')}.`);
    if (!concepto) errores.push('Concepto obligatorio.');
    if (!fecha_emision) errores.push('Fecha de emisión inválida: usa AAAA-MM-DD.');
    if (!fecha_vencimiento) errores.push('Fecha de vencimiento inválida: usa AAAA-MM-DD.');
    if (fecha_emision && fecha_vencimiento && fecha_vencimiento < fecha_emision) errores.push('Fecha de vencimiento no puede ser anterior a fecha de emisión.');
    if (!['PEN', 'USD'].includes(moneda)) errores.push('Moneda inválida: usa PEN o USD.');
    if (!Number.isFinite(monto_total) || monto_total <= 0) errores.push('Monto total inválido: debe ser mayor que cero.');
    if (!Number.isFinite(monto_pagado) || monto_pagado < 0) errores.push('Monto pagado inválido: debe ser mayor o igual a cero.');
    if (Number.isFinite(monto_total) && Number.isFinite(monto_pagado) && monto_pagado >= monto_total) errores.push('Solo se permiten saldos pendientes: monto_pagado debe ser menor que monto_total.');
    if (monto_pagado > 0 && !fecha_pago) errores.push('Fecha de pago obligatoria cuando existe monto pagado.');
    if (monto_pagado === 0 && texto(source.fecha_pago) && !fecha_pago) errores.push('Fecha de pago inválida: usa AAAA-MM-DD.');
    if (!esRhe && !categoria) errores.push(`Categoría ER inválida o inactiva: "${categoriaInput || '-'}".`);
    if (!centro_costo_codigo) errores.push('Código de centro de costo obligatorio.');
    else if (!centroCosto) errores.push(`CECO inexistente: no se encontró el código "${centro_costo_codigo}" en este tenant.`);
    else if (centroCosto.estado !== 'activo') errores.push(`CECO inactivo: "${centro_costo_codigo}" no está activo.`);
    else if (fecha_emision && !inCecoRange(centroCosto, fecha_emision)) errores.push(`CECO fuera de vigencia: "${centro_costo_codigo}" no está vigente para la fecha de emisión.`);

    if (esRhe) {
      const esInterno = Boolean(personal_id);
      if (!numero_rhe) errores.push('Número RHE obligatorio para carga masiva.');
      if (!Number.isFinite(monto_bruto) || monto_bruto <= 0) errores.push('Monto bruto RHE inválido: debe ser mayor que cero.');
      if (!esInterno) {
        if (!/^\d{11}$/.test(ruc_emisor)) errores.push('RUC emisor obligatorio para RHE externo: debe tener 11 dígitos.');
        if (!razon_social) errores.push('Razón social obligatoria para RHE externo.');
        if (!categoria) {
          categoria = categorias.find(item => mismoTexto(item.nombre, 'Servicios terceros'));
          if (!categoria) errores.push('Categoría ER obligatoria para RHE externo; no existe una categoría activa "Servicios terceros".');
        }
      } else {
        if (!personal) errores.push('personal_id inexistente en el maestro del tenant.');
        else if (!esColaboradorElegibleRhe(personal)) errores.push('personal_id no es elegible para RHE según el maestro vigente.');
        if (personal && ruc_emisor && normalizarRucCxp(personal.ruc_colaborador) !== ruc_emisor) errores.push('RUC del RHE interno no coincide con el maestro de personal.');
        if (personal && razon_social && !mismoTexto(personal.nombre, razon_social)) errores.push('Razón social del RHE interno no coincide con el maestro de personal.');
        if (trabajo_facturable === null) errores.push('trabajo_facturable obligatorio para RHE interno: usa SI o NO.');
        const categoriaAuto = trabajo_facturable === null ? null : categorias.find(item => item.tipo_sistema === 'mano_obra'
          && item.seccion === (trabajo_facturable ? 'costo_ventas' : 'gastos_operativos'));
        if (categoriaAuto) {
          if (categoria && !mismoTexto(categoria.nombre, categoriaAuto.nombre)) errores.push('La categoría ER del RHE interno no coincide con la categoría de mano de obra aplicable.');
          categoria = categoriaAuto;
        } else if (!categoria) {
          errores.push('No existe categoría de mano de obra activa para el destino indicado; ingresa una categoría ER activa de respaldo.');
        }
        if (personal) {
          ruc_emisor = normalizarRucCxp(personal.ruc_colaborador);
          razon_social = texto(personal.nombre);
        }
      }
      const tasa = esInterno && personal ? retencionRheInterna(personal) : 0.08;
      const montoNetoEsperado = redondear2(monto_bruto * (1 - tasa));
      if (Number.isFinite(monto_total) && Math.abs(monto_total - montoNetoEsperado) > 0.01) {
        errores.push(`Monto total RHE inválido: debe ser el neto calculado (${montoNetoEsperado.toFixed(2)}).`);
      }
      if (Number.isFinite(monto_pagado) && Number.isFinite(monto_total) && monto_pagado >= montoNetoEsperado) {
        errores.push('Solo se permiten saldos pendientes: monto_pagado debe ser menor que el neto RHE.');
      }
    }

    const fingerprint = esRhe
      ? huellaDuplicadoRhe({ ruc_emisor, personal_id, numero_rhe })
      : huellaDuplicadoCxp({ ruc_emisor, concepto, fecha_emision, monto_total });
    const positions = fileFingerprints.get(fingerprint) || [];
    positions.push(index + 2);
    fileFingerprints.set(fingerprint, positions);
    if (esRhe ? dbRheFingerprints.has(fingerprint) : dbFingerprints.has(fingerprint)) {
      errores.push(esRhe
        ? 'Duplicado: ya existe un RHE con el mismo RUC/personal y número RHE.'
        : 'Duplicado: ya existe una CxP con el mismo RUC, concepto, fecha de emisión y monto total.');
    }

    return {
      ...source,
      ruc_emisor, razon_social, tipo_cxp, documento, concepto, fecha_emision, fecha_vencimiento,
      moneda, monto_total, monto_pagado, fecha_pago, categoria_er: categoria?.nombre || categoriaInput,
      centro_costo_codigo, centro_costo_id: centroCosto?.id || null,
      personal_id: esRhe && personal_id ? personal_id : null, numero_rhe: esRhe ? numero_rhe : null,
      monto_bruto: esRhe ? monto_bruto : null, trabajo_facturable: esRhe && personal_id ? trabajo_facturable : null,
      cuenta_bancaria: texto(source.cuenta_bancaria) || null,
      referencia_pago: texto(source.referencia_pago) || null,
      _fila: index + 2, _huella: fingerprint, _errores: errores, _advertencias: [], _estado: errores.length ? 'RECHAZADA' : 'LISTA',
    };
  }).map(row => {
    const positions = fileFingerprints.get(row._huella) || [];
    if (positions.length > 1) {
      row._errores.push(row.tipo_cxp === 'RHE'
        ? `Duplicado en archivo: la combinación RUC/personal + número RHE aparece en filas ${positions.join(', ')}.`
        : `Duplicado en archivo: la combinación RUC + concepto + fecha + monto aparece en filas ${positions.join(', ')}.`);
      row._estado = 'RECHAZADA';
    }
    return row;
  });
}

const generarIdProveedor = () => `prv_imp_${(globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`).replace(/-/g, '').slice(0, 20)}`;

export async function ejecutarImportacionCxpMasiva({
  filas, empresaId, supabase, proveedores = [], authUserId = null, onProgress,
  crearProveedor = comprasService.crearProveedor, obtenerTipoCambio = getTipoCambioPorFecha,
}) {
  const proveedoresPorRuc = new Map((proveedores || [])
    .filter(p => normalizarRucCxp(p.ruc))
    .map(p => [normalizarRucCxp(p.ruc), p]));
  const resultado = { creadas: 0, rechazadas: 0, fallidas: 0, proveedoresCreados: 0, pagosRegistrados: 0, filas: [], registros: [], proveedoresNuevos: [] };

  for (const original of filas || []) {
    const row = { ...original, _errores: [...(original._errores || [])] };
    if (row._errores.length) {
      resultado.rechazadas++;
      resultado.filas.push({ ...row, _estado: 'RECHAZADA' });
      continue;
    }
    try {
      const esRhe = row.tipo_cxp === 'RHE';
      let proveedor = null;
      // Se conserva intacta la rama de proveedores de fase 1. RHE nunca crea proveedor.
      if (!esRhe) {
        proveedor = proveedoresPorRuc.get(row.ruc_emisor);
        if (!proveedor) {
          const { data: coincidencias, error: proveedorError } = await supabase
            .from('proveedores')
            .select('id,ruc,razon_social,estado')
            .eq('empresa_id', empresaId)
            .eq('ruc', row.ruc_emisor)
            .limit(2);
          if (proveedorError) throw proveedorError;
          proveedor = coincidencias?.[0] || null;
          if (!proveedor) {
            proveedor = await crearProveedor(empresaId, {
              id: generarIdProveedor(), ruc: row.ruc_emisor, razon_social: row.razon_social,
              nombre_comercial: row.razon_social, tipo: 'empresa', estado: 'potencial', pais: 'Peru',
            });
            resultado.proveedoresCreados++;
            resultado.proveedoresNuevos.push(proveedor);
          }
          proveedoresPorRuc.set(row.ruc_emisor, proveedor);
        }
      }
      let tipoCambio = null;
      if (row.moneda === 'USD') {
        const tc = await obtenerTipoCambio(row.fecha_emision, supabase);
        if (!tc?.usd || !Number.isFinite(Number(tc.usd))) throw new Error('No se encontró tipo de cambio USD vigente para la fecha de emisión.');
        tipoCambio = Number(tc.usd);
      }
      const { data, error } = await supabase.rpc('importar_cxp_masiva_fila', {
        p_payload: {
          empresa_id: empresaId, proveedor_id: proveedor?.id || null, ruc_emisor: row.ruc_emisor,
          razon_social: row.razon_social, tipo_comprobante: row.tipo_cxp,
          factura_numero: esRhe ? row.numero_rhe : (row.documento || null),
          concepto: row.concepto, fecha_emision: row.fecha_emision, fecha_vencimiento: row.fecha_vencimiento,
          moneda: row.moneda, monto_total: row.monto_total, monto_pagado: row.monto_pagado,
          fecha_pago: row.fecha_pago || null, cuenta_bancaria: row.cuenta_bancaria,
          referencia_pago: row.referencia_pago, categoria_er: row.categoria_er,
          centro_costo_id: row.centro_costo_id, tipo_cambio: tipoCambio, registrado_por: authUserId,
          personal_id: esRhe ? row.personal_id : null, monto_bruto: esRhe ? row.monto_bruto : null,
          trabajo_facturable: esRhe ? row.trabajo_facturable : null,
        },
      });
      if (error) throw error;
      resultado.creadas++;
      if (row.monto_pagado > 0) resultado.pagosRegistrados++;
      resultado.registros.push(data);
      resultado.filas.push({ ...row, _estado: 'CREADA', _resultado: data });
    } catch (error) {
      resultado.fallidas++;
      resultado.filas.push({ ...row, _estado: 'FALLIDA', _errores: [...row._errores, error.message || 'Error técnico al importar.'] });
    }
    onProgress?.(resultado);
  }
  return resultado;
}

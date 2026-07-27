import * as XLSX from 'xlsx';

export const CXC_MASSIVE_SHEET = 'CxC';
export const CXC_MASSIVE_HEADERS = [
  'ruc_cliente', 'razon_social', 'tipo_documento', 'numero',
  'fecha_emision', 'fecha_vencimiento', 'moneda', 'subtotal', 'igv', 'monto_total',
  'monto_pagado', 'fecha_cobro', 'medio_pago', 'cuenta_bancaria', 'numero_operacion',
  'os_cliente_codigo', 'centro_beneficio_codigo', 'confirmar_exceso', 'glosa', 'notas',
];
export const TIPOS_CXC_MASIVA = ['Factura', 'Boleta'];

const texto = value => String(value ?? '').trim();
export const normalizarRucCxc = value => texto(value).replace(/\D/g, '');
export const normalizarCodigoCxc = value => texto(value).toUpperCase();
export const normalizarNumeroCxc = value => texto(value).replace(/\s+/g, ' ').toLowerCase();

const numero = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const raw = texto(value);
  if (!raw) return 0;
  return Number(raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.'));
};

export const normalizarFechaCxc = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = texto(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? raw : null;
};

const mismoTexto = (a, b) => texto(a).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  === texto(b).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const dentroVigencia = (cebe, fecha) => (!cebe.fecha_inicio || fecha >= String(cebe.fecha_inicio).slice(0, 10))
  && (!cebe.fecha_fin || fecha <= String(cebe.fecha_fin).slice(0, 10));
const confirmarExceso = value => ['si', 'sí', 'true', '1'].includes(mismoTexto(value, 'sí') ? 'si' : texto(value).toLowerCase());

export const huellaDuplicadoCxc = ({ numero }) => normalizarNumeroCxc(numero);

export async function cargarCatalogosCxcMasivo(supabase, empresaId) {
  const [cuentasR, cebeR, osR, facturasR] = await Promise.all([
    supabase.from('cuentas').select('id,ruc,razon_social,nombre_comercial,agente_retencion_sunat,tasa_retencion_sunat').eq('empresa_id', empresaId),
    supabase.from('centros_beneficio').select('id,codigo,nombre,estado,fecha_inicio,fecha_fin').eq('empresa_id', empresaId),
    supabase.from('os_clientes').select('id,numero,cuenta_id,centro_beneficio_id,saldo_por_facturar,monto_facturado,estado').eq('empresa_id', empresaId),
    supabase.from('facturas').select('id,numero').eq('empresa_id', empresaId),
  ]);
  const error = [cuentasR, cebeR, osR, facturasR].find(result => result.error)?.error;
  if (error) throw error;
  return {
    cuentas: cuentasR.data || [], centrosBeneficio: cebeR.data || [], osClientes: osR.data || [], facturas: facturasR.data || [],
  };
}

export async function descargarPlantillaCxcMasiva(supabase, empresaId, empresaNombre = '') {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: cebes, error } = await supabase.from('centros_beneficio')
    .select('codigo,nombre,fecha_inicio,fecha_fin').eq('empresa_id', empresaId).eq('estado', 'activo')
    .or(`fecha_inicio.is.null,fecha_inicio.lte.${hoy}`)
    .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`)
    .order('codigo');
  if (error) throw error;

  const wb = XLSX.utils.book_new();
  const data = XLSX.utils.aoa_to_sheet([CXC_MASSIVE_HEADERS, [
    '20123456789', 'Cliente Ejemplo S.A.C.', 'Factura', 'F001-000123',
    new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10), 'PEN', '1000.00', '180.00', '1180.00',
    '0.00', '', '', '', '', '', (cebes || [])[0]?.codigo || '', 'NO', 'Venta registrada previamente', '',
  ]]);
  data['!cols'] = CXC_MASSIVE_HEADERS.map(header => ({ wch: Math.max(16, header.length + 2) }));

  const reference = XLSX.utils.aoa_to_sheet([
    ['Plantilla de carga masiva de Cuentas por Cobrar'],
    ['Tenant', empresaNombre || empresaId],
    ['Generada en', new Date().toISOString()], [],
    ['Reglas obligatorias'],
    ['1', 'Solo Factura y Boleta. El numero debe ser unico dentro del tenant.'],
    ['2', 'El archivo PDF/XML se adjunta por separado despues de crear la factura.'],
    ['3', 'Con OS Cliente, el CEBE se hereda de la OS. Sin OS, centro_beneficio_codigo es obligatorio.'],
    ['4', 'El CEBE debe estar activo y vigente para fecha_emision; fechas nulas son extremos abiertos.'],
    ['5', 'El monto no puede exceder el saldo de la OS salvo confirmar_exceso=SI; en ese caso el saldo queda en cero.'],
    ['6', 'Si monto_pagado es mayor a cero, fecha_cobro es obligatoria y debe quedar saldo pendiente.'],
    ['7', 'La retencion SUNAT se consulta en vivo desde la cuenta del cliente; el saldo CxC se calcula sobre el neto cobrable.'],
    ['8', 'Cliente inexistente por RUC: se crea automaticamente con RUC y razon social.'],
    [], ['Valores permitidos de tipo_documento', ...TIPOS_CXC_MASIVA], [],
    ['CEBEs activos al momento de la descarga'], ['Codigo', 'Nombre', 'Fecha inicio', 'Fecha fin'],
    ...(cebes || []).map(c => [c.codigo, c.nombre, c.fecha_inicio || '', c.fecha_fin || '']),
  ]);
  reference['!cols'] = [{ wch: 28 }, { wch: 80 }, { wch: 20 }, { wch: 20 }];
  reference['!protect'] = { selectLockedCells: true, selectUnlockedCells: false };
  XLSX.utils.book_append_sheet(wb, data, CXC_MASSIVE_SHEET);
  XLSX.utils.book_append_sheet(wb, reference, 'Referencia e instrucciones');
  XLSX.writeFile(wb, `plantilla_cxc_masiva_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function leerPlantillaCxcMasiva(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = event => {
      try {
        const workbook = XLSX.read(event.target.result, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[CXC_MASSIVE_SHEET];
        if (!sheet) throw new Error(`El archivo debe incluir la hoja "${CXC_MASSIVE_SHEET}".`);
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' }));
      } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function validarFilasCxcMasiva(rows, catalogos = {}) {
  const cebesPorCodigo = new Map((catalogos.centrosBeneficio || []).map(c => [normalizarCodigoCxc(c.codigo), c]));
  const osPorCodigo = new Map((catalogos.osClientes || []).map(os => [normalizarCodigoCxc(os.numero), os]));
  const cuentasPorRuc = new Map((catalogos.cuentas || []).map(c => [normalizarRucCxc(c.ruc), c]));
  const cebePorId = new Map((catalogos.centrosBeneficio || []).map(c => [c.id, c]));
  const existentes = new Set((catalogos.facturas || []).map(huellaDuplicadoCxc));
  const enArchivo = new Map();

  return (rows || []).map((source, index) => {
    const errores = [];
    const ruc_cliente = normalizarRucCxc(source.ruc_cliente);
    const razon_social = texto(source.razon_social);
    const tipo_documento = TIPOS_CXC_MASIVA.find(tipo => mismoTexto(tipo, source.tipo_documento));
    const numeroDocumento = texto(source.numero);
    const fecha_emision = normalizarFechaCxc(source.fecha_emision);
    const fecha_vencimiento = normalizarFechaCxc(source.fecha_vencimiento);
    const fecha_cobro = normalizarFechaCxc(source.fecha_cobro);
    const moneda = texto(source.moneda || 'PEN').toUpperCase();
    const subtotal = numero(source.subtotal);
    const igv = numero(source.igv);
    const monto_total = numero(source.monto_total);
    const monto_pagado = numero(source.monto_pagado);
    const os_cliente_codigo = normalizarCodigoCxc(source.os_cliente_codigo);
    const centro_beneficio_codigo = normalizarCodigoCxc(source.centro_beneficio_codigo);
    const os = os_cliente_codigo ? osPorCodigo.get(os_cliente_codigo) : null;
    const cuenta = cuentasPorRuc.get(ruc_cliente);

    if (!/^\d{11}$/.test(ruc_cliente)) errores.push('RUC del cliente invalido: debe tener 11 digitos.');
    if (!razon_social) errores.push('Razon social del cliente obligatoria.');
    if (!tipo_documento) errores.push(`Tipo de documento invalido. Valores permitidos: ${TIPOS_CXC_MASIVA.join(', ')}.`);
    if (!numeroDocumento) errores.push('Numero de comprobante obligatorio.');
    if (!fecha_emision) errores.push('Fecha de emision invalida: usa AAAA-MM-DD.');
    if (!fecha_vencimiento) errores.push('Fecha de vencimiento invalida: usa AAAA-MM-DD.');
    if (fecha_emision && fecha_vencimiento && fecha_vencimiento < fecha_emision) errores.push('Fecha de vencimiento no puede ser anterior a emision.');
    if (!['PEN', 'USD'].includes(moneda)) errores.push('Moneda invalida: usa PEN o USD.');
    if (![subtotal, igv, monto_total, monto_pagado].every(Number.isFinite) || subtotal < 0 || igv < 0 || monto_total <= 0 || monto_pagado < 0) errores.push('Importes invalidos.');
    if (Number.isFinite(subtotal) && Number.isFinite(igv) && Number.isFinite(monto_total) && Math.abs((subtotal + igv) - monto_total) > 0.01) errores.push('Monto total debe coincidir con subtotal mas IGV.');
    if (monto_pagado >= monto_total) errores.push('Solo se permiten saldos pendientes: monto_pagado debe ser menor que monto_total.');
    if (monto_pagado > 0 && !fecha_cobro) errores.push('Fecha de cobro obligatoria para pago parcial.');

    if (os_cliente_codigo) {
      if (!os) errores.push(`OS Cliente inexistente: "${os_cliente_codigo}".`);
      else {
        if (cuenta && os.cuenta_id !== cuenta.id) errores.push('La OS Cliente indicada no pertenece al cliente del RUC cargado.');
        const cebeOs = cebePorId.get(os.centro_beneficio_id);
        if (!cebeOs) errores.push('La OS Cliente indicada no tiene un CEBE valido.');
        else if (cebeOs.estado !== 'activo') errores.push('El CEBE heredado desde la OS esta inactivo.');
        else if (fecha_emision && !dentroVigencia(cebeOs, fecha_emision)) errores.push('El CEBE heredado desde la OS esta fuera de vigencia para la fecha de emision.');
        if (monto_total > Number(os.saldo_por_facturar || 0) && !confirmarExceso(source.confirmar_exceso)) errores.push('Monto excede el saldo pendiente de la OS: usa confirmar_exceso=SI para continuar.');
      }
    } else {
      if (!centro_beneficio_codigo) errores.push('Centro de beneficio obligatorio cuando no se vincula una OS Cliente.');
      else {
        const cebe = cebesPorCodigo.get(centro_beneficio_codigo);
        if (!cebe) errores.push(`CEBE inexistente: "${centro_beneficio_codigo}".`);
        else if (cebe.estado !== 'activo') errores.push(`CEBE inactivo: "${centro_beneficio_codigo}".`);
        else if (fecha_emision && !dentroVigencia(cebe, fecha_emision)) errores.push(`CEBE fuera de vigencia: "${centro_beneficio_codigo}".`);
      }
    }

    const huella = huellaDuplicadoCxc({ numero: numeroDocumento });
    if (huella && existentes.has(huella)) errores.push(`Duplicado: ya existe una factura con el numero "${numeroDocumento}" en este tenant.`);
    if (huella) {
      const posiciones = enArchivo.get(huella) || [];
      posiciones.push(index + 2);
      enArchivo.set(huella, posiciones);
    }
    return {
      ...source, _fila: index + 2, ruc_cliente, razon_social, tipo_documento: tipo_documento?.toLowerCase() || texto(source.tipo_documento),
      numero: numeroDocumento, fecha_emision, fecha_vencimiento, fecha_cobro, moneda, subtotal, igv, monto_total, monto_pagado,
      os_cliente_codigo, centro_beneficio_codigo, _errores: errores, _estado: errores.length ? 'RECHAZADA' : 'VALIDA',
    };
  }).map(row => {
    const posiciones = enArchivo.get(huellaDuplicadoCxc(row)) || [];
    if (posiciones.length > 1) return { ...row, _estado: 'RECHAZADA', _errores: [...row._errores, `Duplicado en archivo: el numero aparece en filas ${posiciones.join(', ')}.`] };
    return row;
  });
}

export async function ejecutarImportacionCxcMasiva({ filas, empresaId, supabase, onProgress }) {
  const resultado = { creadas: 0, rechazadas: 0, fallidas: 0, clientesCreados: 0, cobrosRegistrados: 0, filas: [], registros: [] };
  for (const original of filas || []) {
    const row = { ...original, _errores: [...(original._errores || [])] };
    if (row._errores.length) {
      resultado.rechazadas++;
      resultado.filas.push({ ...row, _estado: 'RECHAZADA' });
      onProgress?.(resultado);
      continue;
    }
    try {
      const { data, error } = await supabase.rpc('importar_cxc_masiva_fila', {
        p_payload: {
          empresa_id: empresaId, ruc_cliente: row.ruc_cliente, razon_social: row.razon_social,
          tipo_documento: row.tipo_documento, numero: row.numero, fecha_emision: row.fecha_emision,
          fecha_vencimiento: row.fecha_vencimiento, moneda: row.moneda, subtotal: row.subtotal, igv: row.igv,
          monto_total: row.monto_total, monto_pagado: row.monto_pagado, fecha_cobro: row.fecha_cobro || null,
          medio_pago: row.medio_pago || null, cuenta_bancaria: row.cuenta_bancaria || null, numero_operacion: row.numero_operacion || null,
          os_cliente_codigo: row.os_cliente_codigo || null, centro_beneficio_codigo: row.centro_beneficio_codigo || null,
          confirmar_exceso: row.confirmar_exceso || null, glosa: row.glosa || null, notas: row.notas || null,
          condicion_pago: row.condicion_pago || null,
        },
      });
      if (error) throw error;
      resultado.creadas++;
      if (data?.cuenta_creada) resultado.clientesCreados++;
      if (data?.cobro) resultado.cobrosRegistrados++;
      resultado.registros.push(data);
      resultado.filas.push({ ...row, _estado: 'CREADA', _resultado: data });
    } catch (error) {
      resultado.fallidas++;
      resultado.filas.push({ ...row, _estado: 'FALLIDA', _errores: [...row._errores, error.message || 'Error tecnico al importar.'] });
    }
    onProgress?.(resultado);
  }
  return resultado;
}

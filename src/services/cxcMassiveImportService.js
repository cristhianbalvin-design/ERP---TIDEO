import * as XLSX from 'xlsx';
import {
  TAX_ID_EXTRANJERO_MAX_LENGTH,
  TAX_ID_EXTRANJERO_MIN_LENGTH,
  TIPO_DOCUMENTO_TAX_ID_EXTRANJERO,
} from '../lib/formValidators.js';

export const CXC_MASSIVE_SHEET = 'CxC';
export const CXC_MASSIVE_HEADERS = [
  'ruc_cliente', 'razon_social', 'tipo_documento', 'numero',
  'fecha_emision', 'fecha_vencimiento', 'moneda', 'subtotal', 'igv', 'monto_total',
  'monto_pagado', 'monto_detraccion', 'codigo_spot', 'porcentaje_detraccion', 'detraccion_estado',
  'tipo_cambio_detraccion', 'tipo_cambio_fuente', 'cuenta_detraccion_id', 'fecha_cobro', 'medio_pago', 'cuenta_bancaria', 'numero_operacion',
  'condicion_pago', 'os_cliente_codigo', 'centro_beneficio_codigo', 'confirmar_exceso', 'glosa', 'notas',
];
export const TIPOS_CXC_MASIVA = ['Factura', 'Boleta'];

const texto = value => String(value ?? '').trim();
export const normalizarRucCxc = value => texto(value).replace(/\D/g, '');
export const normalizarIdentificadorClienteCxc = value => texto(value).toUpperCase();
export const normalizarCodigoCxc = value => texto(value).toUpperCase();
export const normalizarNumeroCxc = value => texto(value).replace(/\s+/g, ' ').toLowerCase();

// Excel puede entregar valores como numero o como texto. Cuando llegan como texto,
// no se puede asumir que coma sea siempre decimal: "15,000" y "15.000" son miles.
const numero = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const raw = texto(value).replace(/\s/g, '');
  if (!raw) return 0;

  const ultimoPunto = raw.lastIndexOf('.');
  const ultimaComa = raw.lastIndexOf(',');
  const separadoresDistintos = ultimoPunto >= 0 && ultimaComa >= 0;
  let normalizado = raw;

  if (separadoresDistintos) {
    // El ultimo separador es el decimal; el otro agrupa miles.
    if (ultimoPunto > ultimaComa) normalizado = raw.replace(/,/g, '');
    else normalizado = raw.replace(/\./g, '').replace(',', '.');
  } else {
    const separador = ultimoPunto >= 0 ? '.' : ultimaComa >= 0 ? ',' : null;
    if (separador) {
      const partes = raw.split(separador);
      const gruposDeMiles = partes.length > 1 && partes.slice(1).every(grupo => /^\d{3}$/.test(grupo));
      // Con un unico separador, tres digitos a la derecha representan miles
      // para importes monetarios (p. ej. 15,000 o 15.000), no decimales.
      normalizado = gruposDeMiles
        ? partes.join('')
        : separador === ',' ? raw.replace(',', '.') : raw;
    }
  }

  return Number(normalizado);
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
  const [cuentasR, cebeR, osR, facturasR, spotR, bancosR] = await Promise.all([
    supabase.from('cuentas').select('id,ruc,tipo_documento,razon_social,nombre_comercial,agente_retencion_sunat,tasa_retencion_sunat').eq('empresa_id', empresaId),
    supabase.from('centros_beneficio').select('id,codigo,nombre,estado,fecha_inicio,fecha_fin,sociedad_id').eq('empresa_id', empresaId),
    supabase.from('os_clientes').select('id,numero,cuenta_id,centro_beneficio_id,saldo_por_facturar,monto_facturado,estado,sociedad_id').eq('empresa_id', empresaId),
    supabase.from('facturas').select('id,cuenta_id,sociedad_id,numero').eq('empresa_id', empresaId),
    supabase.from('spot_catalogo').select('id,codigo,porcentaje,monto_minimo,umbral_operador,vigencia_desde,vigencia_hasta,estado').eq('estado', 'activo').order('codigo'),
    supabase.from('cuentas_bancarias').select('id,nombre,numero_cuenta,moneda,estado,sociedad_id,es_cuenta_detracciones').eq('empresa_id', empresaId).eq('es_cuenta_detracciones', true).order('nombre'),
  ]);
  const error = [cuentasR, cebeR, osR, facturasR, spotR, bancosR].find(result => result.error)?.error;
  if (error) throw error;
  return {
    cuentas: cuentasR.data || [], centrosBeneficio: cebeR.data || [], osClientes: osR.data || [], facturas: facturasR.data || [],
    spotCatalogo: spotR.data || [], cuentasDetracciones: bancosR.data || [],
  };
}

export async function descargarPlantillaCxcMasiva(supabase, empresaId, empresaNombre = '') {
  const hoy = new Date().toISOString().slice(0, 10);
  const [cebesR, spotR, bancosR] = await Promise.all([
    supabase.from('centros_beneficio')
      .select('codigo,nombre,fecha_inicio,fecha_fin').eq('empresa_id', empresaId).eq('estado', 'activo')
      .or(`fecha_inicio.is.null,fecha_inicio.lte.${hoy}`)
      .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`)
      .order('codigo'),
    supabase.from('spot_catalogo').select('codigo,porcentaje,monto_minimo,umbral_operador,vigencia_desde,vigencia_hasta').eq('estado', 'activo').order('codigo'),
    supabase.from('cuentas_bancarias').select('id,nombre,numero_cuenta,moneda,sociedad_id').eq('empresa_id', empresaId).eq('es_cuenta_detracciones', true).eq('estado', 'activo').order('nombre'),
  ]);
  if (cebesR.error) throw cebesR.error;
  if (spotR.error) throw spotR.error;
  if (bancosR.error) throw bancosR.error;
  const cebes = cebesR.data || [];
  const spots = spotR.data || [];
  const bancos = bancosR.data || [];

  const wb = XLSX.utils.book_new();
  const data = XLSX.utils.aoa_to_sheet([CXC_MASSIVE_HEADERS, [
    '20123456789', 'Cliente Ejemplo S.A.C.', 'Factura', 'F001-000123',
    new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10), 'PEN', '1000.00', '180.00', '1180.00',
    '0.00', '0.00', '', '', 'pendiente', '', '', '', '', '', '', 'Crédito', '', (cebes || [])[0]?.codigo || '', 'NO', 'Venta registrada previamente', '',
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
    ['6', 'monto_pagado es el cobro normal; si es mayor a cero, fecha_cobro es obligatoria.'],
    ['7', 'Para SPOT informa codigo_spot. El sistema calcula el porcentaje y monto; monto_detraccion es opcional como control.'],
    ['8', 'detraccion_estado admite pendiente, depositada o por_autodetraer. Depositada exige fecha_cobro y cuenta_detraccion_id.'],
    ['9', 'Para moneda USD con SPOT informa tipo_cambio_detraccion y tipo_cambio_fuente (manual o referencial).'],
    ['10', 'La retencion SUNAT se consulta en vivo desde la cuenta del cliente; no se permite combinar retencion y detraccion.'],
    ['11', 'condicion_pago se conserva en la factura y CxC. Cliente inexistente por RUC se crea automaticamente.'],
    [], ['Valores permitidos de tipo_documento', ...TIPOS_CXC_MASIVA], [],
    ['CEBEs activos al momento de la descarga'], ['Codigo', 'Nombre', 'Fecha inicio', 'Fecha fin'],
    ...(cebes || []).map(c => [c.codigo, c.nombre, c.fecha_inicio || '', c.fecha_fin || '']),
    [], ['Catalogo SPOT vigente'], ['Codigo', 'Porcentaje', 'Monto minimo', 'Operador', 'Desde', 'Hasta'],
    ...spots.map(s => [s.codigo, s.porcentaje, s.monto_minimo, s.umbral_operador, s.vigencia_desde || '', s.vigencia_hasta || '']),
    [], ['Cuentas de detracciones activas'], ['ID', 'Nombre', 'Numero', 'Moneda', 'Sociedad'],
    ...bancos.map(b => [b.id, b.nombre, b.numero_cuenta || '', b.moneda, b.sociedad_id || '']),
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
        // raw:true conserva el valor real (15000) y evita depender del formato
        // de visualizacion de Excel ("15,000" / "15.000").
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true, dateNF: 'yyyy-mm-dd' }));
      } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function validarFilasCxcMasiva(rows, catalogos = {}, { multisociedadHabilitada = false } = {}) {
  const cebesPorCodigo = new Map((catalogos.centrosBeneficio || []).map(c => [normalizarCodigoCxc(c.codigo), c]));
  const osPorCodigo = new Map((catalogos.osClientes || []).map(os => [normalizarCodigoCxc(os.numero), os]));
  const cuentasPorRuc = new Map((catalogos.cuentas || []).map(c => [normalizarRucCxc(c.ruc), c]));
  const cuentasPorId = new Map((catalogos.cuentas || []).map(c => [c.id, c]));
  const cuentasPorIdentificador = new Map((catalogos.cuentas || []).map(c => [normalizarIdentificadorClienteCxc(c.ruc), c]));
  const cebePorId = new Map((catalogos.centrosBeneficio || []).map(c => [c.id, c]));
  const spotsPorCodigo = new Map((catalogos.spotCatalogo || []).map(c => [normalizarCodigoCxc(c.codigo), c]));
  const cuentasDetraccionesPorId = new Map((catalogos.cuentasDetracciones || []).map(c => [c.id, c]));
  const enArchivo = new Map();

  return (rows || []).map((source, index) => {
    const errores = [];
    const identificador_cliente = texto(source.ruc_cliente);
    const rucNormalizado = normalizarRucCxc(identificador_cliente);
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
    const monto_detraccionInput = numero(source.monto_detraccion);
    const porcentaje_detraccion = numero(source.porcentaje_detraccion);
    const codigo_spot = normalizarCodigoCxc(source.codigo_spot);
    const detraccion_estado = texto(source.detraccion_estado || (monto_detraccionInput > 0 ? 'pendiente' : '')).toLowerCase();
    const tipo_cambio_detraccion = numero(source.tipo_cambio_detraccion);
    const tipo_cambio_fuente = texto(source.tipo_cambio_fuente).toLowerCase();
    const cuenta_detraccion_id = texto(source.cuenta_detraccion_id);
    const cuentaDetraccion = cuentasDetraccionesPorId.get(cuenta_detraccion_id);
    // El RPC legado de importacion modela una detraccion como ya depositada.
    // Para obligaciones pendientes la validacion antigua debe quedar inactiva;
    // el RPC v2 registra luego la obligacion con su estado real.
    const monto_detraccion = ['pendiente', 'por_autodetraer'].includes(detraccion_estado) ? 0 : monto_detraccionInput;
    const os_cliente_codigo = normalizarCodigoCxc(source.os_cliente_codigo);
    const centro_beneficio_codigo = normalizarCodigoCxc(source.centro_beneficio_codigo);
    const os = os_cliente_codigo ? osPorCodigo.get(os_cliente_codigo) : null;
    const cuenta = cuentasPorIdentificador.get(normalizarIdentificadorClienteCxc(identificador_cliente))
      || cuentasPorRuc.get(rucNormalizado);
    const esTaxIdExtranjero = cuenta?.tipo_documento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO;
    const ruc_cliente = esTaxIdExtranjero ? identificador_cliente : rucNormalizado;
    const cebeAsignado = os ? cebePorId.get(os.centro_beneficio_id) : cebesPorCodigo.get(centro_beneficio_codigo);
    const sociedad_id = os?.sociedad_id || cebeAsignado?.sociedad_id || null;
    const spot = codigo_spot ? spotsPorCodigo.get(codigo_spot) : null;

    if (esTaxIdExtranjero) {
      if (identificador_cliente.length < TAX_ID_EXTRANJERO_MIN_LENGTH || identificador_cliente.length > TAX_ID_EXTRANJERO_MAX_LENGTH) {
        errores.push(`Tax ID extranjero invalido: usa entre ${TAX_ID_EXTRANJERO_MIN_LENGTH} y ${TAX_ID_EXTRANJERO_MAX_LENGTH} caracteres.`);
      }
    } else if (!/^\d{11}$/.test(ruc_cliente)) errores.push('RUC del cliente invalido: debe tener 11 digitos.');
    if (!razon_social) errores.push('Razon social del cliente obligatoria.');
    if (!tipo_documento) errores.push(`Tipo de documento invalido. Valores permitidos: ${TIPOS_CXC_MASIVA.join(', ')}.`);
    if (!numeroDocumento) errores.push('Numero de comprobante obligatorio.');
    if (!fecha_emision) errores.push('Fecha de emision invalida: usa AAAA-MM-DD.');
    if (!fecha_vencimiento) errores.push('Fecha de vencimiento invalida: usa AAAA-MM-DD.');
    if (fecha_emision && fecha_vencimiento && fecha_vencimiento < fecha_emision) errores.push('Fecha de vencimiento no puede ser anterior a emision.');
    if (!['PEN', 'USD'].includes(moneda)) errores.push('Moneda invalida: usa PEN o USD.');
    if (![subtotal, igv, monto_total, monto_pagado, monto_detraccionInput].every(Number.isFinite) || subtotal < 0 || igv < 0 || monto_total <= 0 || monto_pagado < 0 || monto_detraccionInput < 0) errores.push('Importes invalidos.');
    if (Number.isFinite(subtotal) && Number.isFinite(igv) && Number.isFinite(monto_total) && Math.abs((subtotal + igv) - monto_total) > 0.01) errores.push('Monto total debe coincidir con subtotal mas IGV.');
    if (monto_detraccionInput > 0) {
      if (!['pendiente', 'depositada', 'por_autodetraer'].includes(detraccion_estado)) errores.push('detraccion_estado invalido: usa pendiente, depositada o por_autodetraer.');
      if (codigo_spot && !spot) errores.push(`Codigo SPOT inexistente o inactivo: "${codigo_spot}".`);
      if (spot && fecha_emision) {
        const vigente = (!spot.vigencia_desde || fecha_emision >= String(spot.vigencia_desde).slice(0, 10))
          && (!spot.vigencia_hasta || fecha_emision <= String(spot.vigencia_hasta).slice(0, 10));
        if (!vigente) errores.push(`Codigo SPOT fuera de vigencia para la fecha de emision: "${codigo_spot}".`);
        if (moneda === 'USD' && !(tipo_cambio_detraccion > 0)) errores.push('Para SPOT en USD informa tipo_cambio_detraccion mayor que cero.');
        const baseSoles = moneda === 'USD' ? monto_total * tipo_cambio_detraccion : monto_total;
        if (Number.isFinite(baseSoles) && ((spot.umbral_operador === '>' && baseSoles <= Number(spot.monto_minimo || 0)) || (spot.umbral_operador !== '>' && baseSoles < Number(spot.monto_minimo || 0)))) errores.push(`La base SPOT no supera el minimo de S/ ${Number(spot.monto_minimo || 0).toFixed(2)}.`);
        const esperado = moneda === 'USD' ? Math.round(monto_total * Number(spot.porcentaje || 0) / 100 * 100) / 100 : Math.round(monto_total * Number(spot.porcentaje || 0) / 100);
        if (Math.abs(monto_detraccionInput - esperado) > 0.01) errores.push(`Monto de detraccion no coincide con el catalogo SPOT: se espera ${esperado.toFixed(2)}.`);
        if (Number.isFinite(porcentaje_detraccion) && Math.abs(porcentaje_detraccion - Number(spot.porcentaje || 0)) > 0.0001) errores.push('porcentaje_detraccion no coincide con el catalogo SPOT vigente.');
      }
      if (moneda === 'USD' && !['manual', 'referencial'].includes(tipo_cambio_fuente)) errores.push('Para SPOT en USD informa tipo_cambio_fuente manual o referencial.');
      if (moneda === 'PEN' && (texto(source.tipo_cambio_detraccion) || texto(source.tipo_cambio_fuente))) errores.push('Para SPOT en PEN no se informa tipo de cambio.');
      if (cuenta_detraccion_id && (!cuentaDetraccion || cuentaDetraccion.moneda !== 'PEN' || cuentaDetraccion.estado !== 'activo' || cuentaDetraccion.es_cuenta_detracciones !== true || (sociedad_id && cuentaDetraccion.sociedad_id !== sociedad_id))) errores.push('cuenta_detraccion_id debe ser una cuenta PEN activa de detracciones de la misma sociedad.');
      if (detraccion_estado === 'depositada' && monto_pagado <= 0) errores.push('Una detraccion depositada requiere monto_pagado como deposito neto.');
      if (detraccion_estado === 'depositada' && !cuenta_detraccion_id) errores.push('cuenta_detraccion_id es obligatoria para una detraccion depositada.');
      if (detraccion_estado === 'depositada' && !fecha_cobro) errores.push('fecha_cobro es obligatoria para una detraccion depositada.');
    }
    if (monto_detraccion > 0 && monto_pagado <= 0) errores.push('Monto pagado debe incluir el depósito neto cuando se informa monto_detraccion.');
    if ((monto_pagado + monto_detraccion) >= monto_total) errores.push('Solo se permiten saldos pendientes: monto_pagado más monto_detraccion debe ser menor que monto_total.');
    if ((monto_pagado + monto_detraccion) > 0 && !fecha_cobro) errores.push('Fecha de cobro obligatoria para pago parcial.');

    if (os_cliente_codigo) {
      if (!os) errores.push(`OS Cliente inexistente: "${os_cliente_codigo}".`);
      else {
        if (multisociedadHabilitada && !os.sociedad_id) errores.push(`El OS Cliente "${os_cliente_codigo}" no tiene sociedad asignada; corrígelo antes de importar.`);
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
        if (multisociedadHabilitada && cebe && !cebe.sociedad_id) errores.push(`El CEBE "${centro_beneficio_codigo}" no tiene sociedad asignada; corrígelo antes de importar.`);
      }
    }

    const huella = huellaDuplicadoCxc({ numero: numeroDocumento });
    const coincidencias = huella ? (catalogos.facturas || []).filter(factura =>
      (factura.sociedad_id || null) === sociedad_id && huellaDuplicadoCxc(factura) === huella
    ) : [];
    const mismoCliente = coincidencias.some(factura => {
      const clienteFactura = cuentasPorId.get(factura.cuenta_id);
      return factura.cuenta_id === cuenta?.id || normalizarIdentificadorClienteCxc(clienteFactura?.ruc) === normalizarIdentificadorClienteCxc(ruc_cliente);
    });
    if (mismoCliente) errores.push(`Duplicado: ya existe la factura "${numeroDocumento}" para este cliente y sociedad.`);
    if (huella) {
      const clave = `${sociedad_id || 'sin-sociedad'}|${huella}`;
      const posiciones = enArchivo.get(clave) || [];
      posiciones.push({ fila: index + 2, cliente: normalizarIdentificadorClienteCxc(ruc_cliente) });
      enArchivo.set(clave, posiciones);
    }
    return {
      ...source, _fila: index + 2, ruc_cliente, razon_social, tipo_documento: tipo_documento?.toLowerCase() || texto(source.tipo_documento),
      numero: numeroDocumento, fecha_emision, fecha_vencimiento, fecha_cobro, moneda, subtotal, igv, monto_total, monto_pagado,
      monto_detraccion: monto_detraccionInput, codigo_spot: codigo_spot || null, porcentaje_detraccion: Number.isFinite(porcentaje_detraccion) ? porcentaje_detraccion : null,
      detraccion_estado: detraccion_estado || null, tipo_cambio_detraccion: Number.isFinite(tipo_cambio_detraccion) ? tipo_cambio_detraccion : null,
      tipo_cambio_fuente: tipo_cambio_fuente || null, cuenta_detraccion_id: cuenta_detraccion_id || null,
      condicion_pago: texto(source.condicion_pago) || null, os_cliente_codigo, centro_beneficio_codigo, sociedad_id, _errores: errores, _advertencias: [], _estado: errores.length ? 'RECHAZADA' : 'VALIDA',
    };
  }).map(row => {
    const huella = huellaDuplicadoCxc(row);
    const posiciones = enArchivo.get(`${row.sociedad_id || 'sin-sociedad'}|${huella}`) || [];
    const mismoClienteArchivo = posiciones.filter(item => item.cliente === normalizarIdentificadorClienteCxc(row.ruc_cliente));
    const otroClienteArchivo = posiciones.filter(item => item.cliente !== normalizarIdentificadorClienteCxc(row.ruc_cliente));
    if (mismoClienteArchivo.length > 1) return { ...row, _estado: 'RECHAZADA', _errores: [...row._errores, `Duplicado en archivo: la factura "${row.numero}" se repite para el mismo cliente en filas ${mismoClienteArchivo.map(item => item.fila).join(', ')}.`] };
    const otrosEnDb = (catalogos.facturas || []).filter(factura => {
      const clienteFactura = cuentasPorId.get(factura.cuenta_id);
      return (factura.sociedad_id || null) === (row.sociedad_id || null)
        && huellaDuplicadoCxc(factura) === huella
        && normalizarIdentificadorClienteCxc(clienteFactura?.ruc) !== normalizarIdentificadorClienteCxc(row.ruc_cliente);
    });
    if (otroClienteArchivo.length || otrosEnDb.length) {
      return { ...row, _advertencias: [...row._advertencias, `Posible error: la factura "${row.numero}" ya figura para otro cliente en esta sociedad.`] };
    }
    return row;
  });
}

export async function ejecutarImportacionCxcMasiva({ filas, empresaId, supabase, onProgress, confirmarNumerosRepetidos = false }) {
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
      const { data, error } = await supabase.rpc('importar_cxc_masiva_fila_v2', {
        p_payload: {
          empresa_id: empresaId, ruc_cliente: row.ruc_cliente, razon_social: row.razon_social,
          tipo_documento: row.tipo_documento, numero: row.numero, fecha_emision: row.fecha_emision,
          fecha_vencimiento: row.fecha_vencimiento, moneda: row.moneda, subtotal: row.subtotal, igv: row.igv,
          monto_total: row.monto_total, monto_pagado: row.monto_pagado, monto_detraccion: row.monto_detraccion, codigo_spot: row.codigo_spot || null,
          porcentaje_detraccion: row.porcentaje_detraccion || null, detraccion_estado: row.detraccion_estado || null,
          tipo_cambio_detraccion: row.tipo_cambio_detraccion || null, tipo_cambio_fuente: row.tipo_cambio_fuente || null,
          cuenta_detraccion_id: row.cuenta_detraccion_id || null, fecha_cobro: row.fecha_cobro || null,
          medio_pago: row.medio_pago || null, cuenta_bancaria: row.cuenta_bancaria || null, numero_operacion: row.numero_operacion || null,
          os_cliente_codigo: row.os_cliente_codigo || null, centro_beneficio_codigo: row.centro_beneficio_codigo || null,
          confirmar_exceso: row.confirmar_exceso || null, glosa: row.glosa || null, notas: row.notas || null,
          condicion_pago: row.condicion_pago || null,
          confirmar_numero_duplicado: confirmarNumerosRepetidos,
        },
      });
      if (error) throw error;
      resultado.creadas++;
      if (data?.cuenta_creada) resultado.clientesCreados++;
      const cobros = data?.cobros || (data?.cobro ? [data.cobro] : []);
      resultado.cobrosRegistrados += cobros.length;
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

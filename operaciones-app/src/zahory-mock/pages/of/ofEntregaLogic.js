import { hoyISO } from './ofAvanceLogic.js';

export function estadoInicialEntrega(datos = {}) {
  return { fotos: [], conformidad: '', observaciones: '', unidades: (datos.unidades || []).map(u => ({ ...u })),
    firma_responsable: null, firma_cliente: null, recibe_nombre: '', recibe_dni: '', garantia_meses: String(datos.garantia_meses ?? 12),
    guia: { partida_direccion: datos.partida || '', llegada_direccion: datos.cliente?.direccion || '', fecha_inicio_traslado: hoyISO(), peso_bruto_total: '', modalidad: 'remitente', vehiculo_placa: '', conductor_nombre: '', conductor_dni: '', conductor_brevete: '', transportista_ruc: '', transportista_razon_social: '' } };
}
const vacio = v => !String(v ?? '').trim();
export function validarPasoEntrega(f, paso) {
  const e = {};
  if (paso === 1) {
    if (f.fotos.length < 1 || f.fotos.length > 6) e.fotos = 'Agrega entre 1 y 6 fotos de la entrega.';
    if (!['conforme', 'con_observaciones'].includes(f.conformidad)) e.conformidad = 'Indica la conformidad del cliente.';
    if (f.conformidad === 'con_observaciones' && vacio(f.observaciones)) e.observaciones = 'Escribe las observaciones del cliente.';
    const series = f.unidades.map(u => String(u.serie || '').trim().toLowerCase());
    if (!series.length) e.unidades = 'Indica las unidades que se entregan.';
    series.forEach((s, i) => { if (!s || s.length > 60 || series.indexOf(s) !== i || series.lastIndexOf(s) !== i) e[`serie_${i}`] = 'Indica una serie distinta de hasta 60 caracteres.'; });
  }
  if (paso === 2) {
    if (!f.firma_responsable) e.firma_responsable = 'Falta la firma del responsable.';
    if (!f.firma_cliente) e.firma_cliente = 'Falta la firma del cliente.';
    if (vacio(f.recibe_nombre)) e.recibe_nombre = 'Indica el nombre de quien recibe.';
    if (!/^[0-9A-Za-z-]{6,15}$/.test(String(f.recibe_dni || '').trim())) e.recibe_dni = 'Indica un documento válido (DNI o carné de extranjería).';
  }
  if (paso === 3) {
    const g = f.guia;
    for (const [k, m] of [['partida_direccion', 'Indica el punto de partida.'], ['llegada_direccion', 'Indica el punto de llegada.'], ['fecha_inicio_traslado', 'Indica la fecha de inicio del traslado.']]) if (vacio(g[k])) e[k] = m;
    if (vacio(g.peso_bruto_total) || !Number.isFinite(Number(g.peso_bruto_total)) || Number(g.peso_bruto_total) <= 0) e.peso_bruto_total = 'Indica el peso bruto en kg.';
    if (!['remitente', 'transportista'].includes(g.modalidad)) e.modalidad = 'Modalidad de transporte no válida.';
    if (g.modalidad === 'remitente') for (const k of ['vehiculo_placa', 'conductor_nombre', 'conductor_dni', 'conductor_brevete']) if (vacio(g[k])) e[k] = 'Completa este dato del transporte privado.';
    if (g.modalidad === 'transportista') {
      if (!/^\d{11}$/.test(g.transportista_ruc)) e.transportista_ruc = 'Indica un RUC de 11 dígitos.';
      if (vacio(g.transportista_razon_social)) e.transportista_razon_social = 'Indica la razón social del transportista.';
    }
  }
  if (paso === 4 && (!/^\d+$/.test(String(f.garantia_meses)) || Number(f.garantia_meses) > 120)) e.garantia_meses = 'La garantía debe ser un entero entre 0 y 120 meses.';
  return e;
}
export function datosEntrega(f, fotos, firmaResponsable, firmaCliente) {
  return { conformidad: f.conformidad, observaciones: f.observaciones.trim(), recibe_nombre: f.recibe_nombre.trim(), recibe_dni: f.recibe_dni.trim(), firma_responsable_path: firmaResponsable, firma_cliente_path: firmaCliente, fotos, unidades: f.unidades.map(u => ({ unidad: u.unidad, serie: u.serie.trim() })), garantia_meses: Number(f.garantia_meses), guia: Object.fromEntries(Object.entries(f.guia).map(([k, v]) => [k, String(v).trim()])) };
}
export function finGarantia(fecha, meses) {
  if (!fecha || !Number.isInteger(Number(meses)) || Number(meses) <= 0) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  const destino = new Date(Date.UTC(a, m - 1 + Number(meses), 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimo));
  return destino.toISOString().slice(0, 10);
}

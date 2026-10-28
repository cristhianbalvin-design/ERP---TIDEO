// Lógica pura de la Bandeja de Órdenes de Fabricación (sin React ni Supabase).

export const ESTADOS_OF = [
  ['borrador', 'Borrador'],
  ['en_ingenieria', 'En ingeniería'],
  ['aprobada', 'Aprobada'],
  ['en_produccion', 'En producción'],
  ['en_calidad', 'En calidad'],
  ['lista_entrega', 'Lista para entrega'],
  ['entregada', 'Entregada'],
  ['cerrada', 'Cerrada'],
  ['anulada', 'Anulada'],
];

export const ETIQUETA_ESTADO_OF = Object.fromEntries(ESTADOS_OF);

export const ESTADOS_EN_CURSO = ['en_ingenieria', 'aprobada', 'en_produccion', 'en_calidad', 'lista_entrega'];
const ESTADOS_TERMINADOS = ['entregada', 'cerrada', 'anulada'];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function aFecha(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function diasEntre(desdeISO, hastaISO) {
  const a = aFecha(desdeISO);
  const b = aFecha(hastaISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function formatearFecha(iso) {
  const f = aFecha(iso);
  if (!f) return 'Sin dato';
  return `${f.getUTCDate()} ${MESES[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
}

export function formatearMonto(valor, moneda = 'PEN') {
  const n = Math.round((Number(valor) || 0) * 100) / 100;
  const simbolo = moneda === 'USD' ? 'US$' : moneda === 'EUR' ? '€' : 'S/';
  return `${simbolo} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Situación del compromiso: tono (late | soon | '') y nota legible.
export function situacionCompromiso(of, hoyISO) {
  if (!of.fecha_compromiso) return { tono: '', nota: 'Sin compromiso' };
  if (ESTADOS_TERMINADOS.includes(of.estado)) return { tono: '', nota: ETIQUETA_ESTADO_OF[of.estado] };
  const dias = diasEntre(hoyISO, of.fecha_compromiso);
  if (dias < 0) return { tono: 'late', nota: `atrasada ${plural(-dias, 'día', 'días')}` };
  if (dias === 0) return { tono: 'soon', nota: 'vence hoy' };
  if (dias <= 7) return { tono: 'soon', nota: `en ${plural(dias, 'día', 'días')}` };
  return { tono: '', nota: `en ${plural(dias, 'día', 'días')}` };
}

const abierta = of => !ESTADOS_TERMINADOS.includes(of.estado);
const atrasada = (of, hoy) => abierta(of) && of.fecha_compromiso && diasEntre(hoy, of.fecha_compromiso) < 0;
const vencePronto = (of, hoy) => {
  if (!abierta(of) || !of.fecha_compromiso) return false;
  const d = diasEntre(hoy, of.fecha_compromiso);
  return d >= 0 && d <= 7;
};

export function resumenBandejaOF(ofs, hoyISO) {
  const porEstado = Object.fromEntries(ESTADOS_OF.map(([k]) => [k, 0]));
  let enCurso = 0;
  let borrador = 0;
  let atrasadas = 0;
  let vencen = 0;
  for (const of of ofs) {
    porEstado[of.estado] = (porEstado[of.estado] || 0) + 1;
    if (ESTADOS_EN_CURSO.includes(of.estado)) enCurso += 1;
    if (of.estado === 'borrador') borrador += 1;
    if (atrasada(of, hoyISO)) atrasadas += 1;
    if (vencePronto(of, hoyISO)) vencen += 1;
  }
  return { total: ofs.length, enCurso, borrador, atrasadas, vencen, porEstado };
}

const normalizar = texto => String(texto || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarBandejaOF(ofs, { buscar = '', estado = '', kpi = '' } = {}, hoyISO) {
  const q = normalizar(buscar.trim());
  return ofs.filter(of => {
    if (estado && of.estado !== estado) return false;
    if (kpi === 'curso' && !ESTADOS_EN_CURSO.includes(of.estado)) return false;
    if (kpi === 'borrador' && of.estado !== 'borrador') return false;
    if (kpi === 'atrasadas' && !atrasada(of, hoyISO)) return false;
    if (kpi === 'vencen' && !vencePronto(of, hoyISO)) return false;
    if (!q) return true;
    return [of.numero, of.os_numero, of.cliente, of.componente, of.descripcion]
      .some(campo => normalizar(campo).includes(q));
  });
}

export function textoOperaciones(of) {
  const total = of.operaciones_total || 0;
  return total ? plural(total, 'operación', 'operaciones') : 'Sin operaciones';
}

export function textoSinBahia(of) {
  const sin = of.operaciones_sin_bahia || 0;
  if (!(of.operaciones_total > 0)) return '';
  return sin ? `${sin} sin bahía` : '';
}

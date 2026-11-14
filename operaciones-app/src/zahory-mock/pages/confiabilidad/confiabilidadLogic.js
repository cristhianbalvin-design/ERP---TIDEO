const formatearNumero = (valor, sufijo) => {
  if (valor == null || valor === '' || !Number.isFinite(Number(valor))) return 'Sin dato';
  return `${Number(valor).toLocaleString('es-PE', { maximumFractionDigits: 2 })} ${sufijo}`;
};

export const formatoHoras = (valor) => formatearNumero(valor, 'h');
export const formatoPorcentaje = (valor) => formatearNumero(valor, '%');

export function puntajeBacklog(impacto, urgencia) {
  const valores = [impacto, urgencia].map(Number);
  if (
    [impacto, urgencia].some((x) => x == null || x === '') ||
    valores.some((x) => !Number.isInteger(x) || x < 1 || x > 5)
  )
    return null;
  return valores[0] * valores[1];
}
export function prioridadBacklog(puntaje) {
  if (puntaje == null || puntaje === '' || !Number.isFinite(Number(puntaje))) return null;
  return puntaje >= 20 ? 'emergencia' : puntaje >= 12 ? 'urgente' : puntaje >= 6 ? 'programable' : 'baja';
}

export const CICLOS_BACKLOG = Object.freeze([
  'nuevo',
  'evaluado',
  'pendiente_recursos',
  'listo_para_ot',
  'en_ot',
  'cerrado',
  'descartado',
]);
export const transicionesBacklog = (ciclo) => (CICLOS_BACKLOG.includes(ciclo) ? [...CICLOS_BACKLOG] : []);
export const transicionBacklogValida = (desde, hasta, motivo = '') =>
  transicionesBacklog(desde).includes(hasta) && (hasta !== 'descartado' || Boolean(String(motivo || '').trim()));

export function semaforoPm({
  horas_restantes,
  dias_restantes,
  intervalo_horas,
  intervalo_dias,
  tolerancia_pct = 10,
} = {}) {
  const criterios = [
    [horas_restantes, intervalo_horas],
    [dias_restantes, intervalo_dias],
  ]
    .filter(
      ([restante, intervalo]) =>
        restante != null &&
        restante !== '' &&
        intervalo != null &&
        intervalo !== '' &&
        Number.isFinite(Number(restante)) &&
        Number(intervalo) > 0,
    )
    .map(([restante, intervalo]) =>
      Number(restante) <= 0
        ? 'vencido'
        : Number(restante) <= (Number(intervalo) * Number(tolerancia_pct ?? 10)) / 100
          ? 'por_vencer'
          : 'al_dia',
    );
  return ['vencido', 'por_vencer', 'al_dia'].find((x) => criterios.includes(x)) || 'sin_lectura';
}
export function nivelSos(valor, limite) {
  if (valor == null || valor === '' || !Number.isFinite(Number(valor)) || !limite) return null;
  const v = Number(valor);
  if (limite.tipo === 'max') {
    if (limite.critico != null && v >= Number(limite.critico)) return 'critico';
    if (limite.alerta != null && v >= Number(limite.alerta)) return 'alerta';
    return 'normal';
  }
  if (limite.tipo === 'rango') {
    if ([limite.minimo, limite.maximo, limite.alerta, limite.critico].some((x) => x == null)) return null;
    const fuera = (pct) =>
      v <= Number(limite.minimo) * (1 - Number(pct) / 100) || v >= Number(limite.maximo) * (1 + Number(pct) / 100);
    return fuera(limite.critico) ? 'critico' : fuera(limite.alerta) ? 'alerta' : 'normal';
  }
  return null;
}
export const condicionSos = (niveles) =>
  ['critico', 'alerta', 'normal'].find((n) => niveles.some((x) => (typeof x === 'string' ? x : x?.nivel) === n)) ||
  null;
export const estadoEquipo = (estados) =>
  estados.includes('critico') || estados.includes('vencido')
    ? 'critico'
    : estados.includes('alerta') || estados.includes('por_vencer')
      ? 'alerta'
      : 'ok';

const ETIQUETAS = {
  segmento: { todos: 'Todos', flota: 'Flota', taller: 'Taller', cliente: 'Cliente', otro: 'Otro' },
  ciclo: {
    nuevo: 'Nuevo',
    evaluado: 'Evaluado',
    pendiente_recursos: 'Pendiente de recursos',
    listo_para_ot: 'Listo para OT',
    en_ot: 'En OT',
    cerrado: 'Cerrado',
    descartado: 'Descartado',
  },
  fuente: {
    manual: 'Manual',
    diagnostico: 'Diagnóstico',
    parte_diario: 'Parte diario',
    pm: 'PM',
    sos: 'SOS',
    inspeccion: 'Inspección',
    ot: 'OT',
    parte_flota: 'Parte de flota',
  },
  sistema: {
    motor: 'Motor',
    transmision: 'Transmisión',
    hidraulico: 'Hidráulico',
    electrico: 'Eléctrico',
    tren_rodaje: 'Tren de rodaje',
    frenos: 'Frenos',
    direccion: 'Dirección',
    otro: 'Otro',
  },
};
export const etiquetaConfiabilidad = (tipo, valor) =>
  valor == null || valor === '' ? 'Sin dato' : ETIQUETAS[tipo]?.[valor] || String(valor).replaceAll('_', ' ');

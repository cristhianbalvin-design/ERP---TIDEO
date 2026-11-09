// Reglas compartidas de la Hoja de Ruta combinada (servicio comercial y logística propia).
// Las usan la app de Operaciones (Hoja de Ruta, detalle de viaje) y la app del conductor.

export const TIPO_VIAJE = {
  comercial: { label: 'Servicio comercial', corto: 'Comercial' },
  logistica: { label: 'Logística propia', corto: 'Logística' },
};

export const HITOS_COMERCIAL = [
  { key: 'salida_base', label: 'Salí de base', accion: 'Salí' },
  { key: 'llegada_carga', label: 'Llegué a carga', accion: 'Llegué a carga' },
  { key: 'fin_carga', label: 'Fin de carga', accion: 'Terminé de cargar' },
  { key: 'llegada_destino', label: 'Llegué a destino', accion: 'Llegué a destino' },
  { key: 'fin_descarga', label: 'Fin de descarga', accion: 'Terminé de descargar' },
  { key: 'entregado', label: 'Entregado con conformidad', accion: 'Registrar conformidad' },
];

export const NOVEDADES_CARGA = [
  ['conforme', 'Conforme'],
  ['faltante', 'Faltante'],
  ['danio', 'Daño'],
  ['rechazo_parcial', 'Rechazo parcial'],
];

export const TIPOS_GASTO = [
  ['peaje', 'Peaje'],
  ['combustible', 'Combustible'],
  ['estiba', 'Estiba'],
  ['viatico', 'Viático'],
  ['otro', 'Otro'],
];

// Inspección antes de salir (servicio comercial). Un punto crítico en falla bloquea la salida
// hasta que el despachador la autorice; uno no crítico solo queda observado.
export const INSPECCION_PUNTOS = [
  { texto: 'Luces y direccionales', critico: false },
  { texto: 'Llantas y repuesto', critico: true },
  { texto: 'Frenos y aire', critico: true },
  { texto: 'Extintor, botiquín y conos', critico: false },
  { texto: 'SOAT, MTC y brevete a bordo', critico: true },
  { texto: 'Amarre de la carga', critico: false },
];

export const DOCUMENTO_PARADA = {
  orden_compra_transito: 'Tránsito de OC',
  guia_remision: 'Guía de remisión',
  compra_gasto: 'Compra de campo',
  libre: 'Parada libre',
};

export const ORIGEN_PEDIDO = { compras: 'Compras', almacen: 'Almacén', despachador: 'Despachador' };

export const ESTADOS_EN_CURSO = ['despachado', 'en_ruta', 'con_incidente'];
export const ESTADOS_ACTIVOS = ['borrador', 'programado', 'despachado', 'en_ruta', 'con_incidente'];

export const hoyLima = (fecha = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(fecha);

// Fecha (AAAA-MM-DD) y hora (HH:MM) en Lima de un timestamp; acepta también 'AAAA-MM-DD'.
export const fechaLima = valor => {
  if (!valor) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return String(valor);
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '' : hoyLima(fecha);
};
export const horaLima = valor => {
  if (!valor || /^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return '';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? ''
    : fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
};
// Inicio del día en Lima (UTC−5, sin horario de verano) para filtrar timestamps.
export const inicioDiaLima = fecha => `${fecha}T00:00:00-05:00`;

export const sumarDias = (iso, dias) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d + dias));
  return fecha.toISOString().slice(0, 10);
};

export const ordenarParadas = paradas => [...(paradas || [])]
  .sort((a, b) => Number(a.secuencia || 0) - Number(b.secuencia || 0));

export const paradaPendiente = parada => parada?.estado === 'pendiente';

export function resumenParadas(paradas = []) {
  const lista = paradas || [];
  const hechas = lista.filter(p => p.estado === 'completada').length;
  const omitidas = lista.filter(p => p.estado === 'omitida').length;
  return { total: lista.length, hechas, omitidas, pendientes: lista.length - hechas - omitidas };
}

export const hitoRegistrado = (hitos, key) => (hitos || []).find(h => h.hito === key) || null;

// El siguiente hito comercial que le toca al conductor (null si ya entregó).
export function siguienteHito(hitos = []) {
  return HITOS_COMERCIAL.find(h => !hitoRegistrado(hitos, h.key)) || null;
}

const minutosEntre = (desde, hasta) => {
  if (!desde || !hasta) return null;
  const diff = Math.round((new Date(hasta) - new Date(desde)) / 60000);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
};

// Tiempos de espera en carga y descarga (minutos), base de la sobreestadía.
export function esperasViaje(hitos = []) {
  const at = key => hitoRegistrado(hitos, key)?.ocurrido_at || null;
  return {
    carga: minutosEntre(at('llegada_carga'), at('fin_carga')),
    descarga: minutosEntre(at('llegada_destino'), at('fin_descarga')),
  };
}

export function duracionTexto(minutos) {
  if (minutos == null) return '';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

// Validación de la constancia, igual que en la base de datos.
export function validarConstancia({ tipoViaje, tipoParada, datos }) {
  const errores = {};
  const texto = valor => String(valor ?? '').trim();
  if (!texto(datos.recibe_nombre)) errores.recibe_nombre = 'Escribe el nombre de quien recibe o entrega.';
  if (!datos.firma) errores.firma = 'Falta la firma.';
  if (tipoViaje === 'comercial') {
    if (!/^\d{8,12}$/.test(texto(datos.recibe_dni))) errores.recibe_dni = 'Escribe un DNI o documento válido.';
    if (!datos.foto) errores.foto = 'Toma la foto de la guía firmada.';
    if (datos.bultos_recibidos === '' || datos.bultos_recibidos == null || Number(datos.bultos_recibidos) < 0) {
      errores.bultos_recibidos = 'Indica los bultos recibidos.';
    }
    if (!datos.novedad) errores.novedad = 'Indica el estado de la carga.';
    if (datos.novedad && datos.novedad !== 'conforme' && !texto(datos.observaciones)) {
      errores.observaciones = 'Describe la novedad de la carga.';
    }
    if (tipoParada === 'destino' && !(Number(datos.km) > 0)) errores.km = 'Registra el km de llegada.';
  }
  return errores;
}

export function resumenInspeccion(items = []) {
  const fallas = (items || []).filter(item => !item.ok);
  return {
    criticos: fallas.filter(item => item.critico).length,
    observados: fallas.filter(item => !item.critico).length,
  };
}

export const totalGastos = (gastos = []) => Math.round((gastos || [])
  .reduce((suma, gasto) => suma + Number(gasto.monto || 0), 0) * 100) / 100;

// Datos sugeridos para enviar un documento a ruta.
export function pedidoDesdeTransito({ transito, orden, proveedor }) {
  const nombre = proveedor?.razon_social || proveedor?.nombre_comercial || 'Proveedor';
  return {
    documento_tipo: 'orden_compra_transito',
    oc_transito_id: transito.id,
    accion: 'recoger',
    titulo: `Recoger ${orden?.codigo || 'OC'} en ${nombre}`,
    lugar_nombre: nombre,
    direccion: proveedor?.direccion || '',
    fecha_requerida: transito.fecha_estimada_llegada || hoyLima(),
    origen: 'compras',
  };
}

export function pedidoDesdeGuia(guia) {
  const destino = guia.destinatario_razon_social || guia.llegada_direccion || 'Destino de la guía';
  return {
    documento_tipo: 'guia_remision',
    guia_remision_id: guia.id,
    accion: 'entregar',
    titulo: `Entregar ${guia.numero_completo || 'guía'} a ${destino}`,
    lugar_nombre: destino,
    direccion: guia.llegada_direccion || '',
    fecha_requerida: guia.fecha_inicio_traslado || hoyLima(),
    origen: 'almacen',
  };
}

export function validarPedido(datos) {
  const errores = {};
  if (!String(datos.titulo || '').trim()) errores.titulo = 'Describe qué hay que hacer.';
  if (!String(datos.lugar_nombre || '').trim()) errores.lugar_nombre = 'Indica el lugar.';
  if (!datos.fecha_requerida) errores.fecha_requerida = 'Indica el día.';
  if (datos.ventana_inicio && datos.ventana_fin && datos.ventana_fin <= datos.ventana_inicio) {
    errores.ventana_fin = 'La hora final debe ser posterior a la inicial.';
  }
  return errores;
}

export function ventanaTexto(inicio, fin) {
  const corto = valor => String(valor || '').slice(0, 5);
  if (inicio && fin) return `${corto(inicio)}–${corto(fin)}`;
  if (inicio) return `desde ${corto(inicio)}`;
  if (fin) return `hasta ${corto(fin)}`;
  return '';
}

// Viajes que se muestran en la Hoja de Ruta de un día: los programados para ese día
// y los que siguen en curso desde días anteriores.
export function viajesDelDia(viajes = [], fecha) {
  return (viajes || []).filter(viaje => {
    if (viaje.estado === 'cancelado') return false;
    const dia = fechaLima(viaje.fecha_programada);
    if (dia === fecha) return true;
    return dia && dia < fecha && ESTADOS_ACTIVOS.includes(viaje.estado) && viaje.estado !== 'borrador';
  });
}

export const atrasado = (viaje, hoy = hoyLima()) =>
  ['programado', 'borrador'].includes(viaje?.estado)
  && fechaLima(viaje?.fecha_programada) < hoy;

// Agrupa por unidad para el tablero; los viajes sin unidad van al final.
export function agruparPorUnidad(viajes = []) {
  const grupos = new Map();
  for (const viaje of viajes) {
    const key = viaje.vehiculo_id || '__sin__';
    if (!grupos.has(key)) grupos.set(key, { key, vehiculo: viaje.vehiculo || null, viajes: [] });
    grupos.get(key).viajes.push(viaje);
  }
  const lista = [...grupos.values()].map(grupo => ({
    ...grupo,
    viajes: grupo.viajes.sort((a, b) => String(a.fecha_programada || '9').localeCompare(String(b.fecha_programada || '9'))),
  }));
  return lista.sort((a, b) => {
    if (a.key === '__sin__') return 1;
    if (b.key === '__sin__') return -1;
    return String(a.vehiculo?.placa || '').localeCompare(String(b.vehiculo?.placa || ''));
  });
}

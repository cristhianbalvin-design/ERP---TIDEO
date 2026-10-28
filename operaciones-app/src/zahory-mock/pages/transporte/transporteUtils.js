export const fechaActualLocal = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export function decidirMotivoAccesoTransporte(estado, empresaId, error, ver) {
  if (estado === 'cargando') return 'verificando';
  if (estado === 'sin_sesion') return 'sin_sesion';
  if (estado === 'sin_empresa' || (estado === 'listo' && !empresaId)) return 'sin_empresa';
  if (estado === 'no_configurado') return 'no_configurado';
  if (estado !== 'listo') return 'verificando';
  if (error) return 'error';
  if (ver == null) return 'verificando';
  if (!ver) return 'restringido';
  return null;
}

const fechaHoyLocal = fechaActualLocal;

export function estadoVigencia(tarifa, fechaReferencia = fechaHoyLocal()) {
  if (!tarifa || tarifa.estado !== 'activa') return 'inactiva';
  if (tarifa.vigente_desde > fechaReferencia) return 'futura';
  if (tarifa.vigente_hasta && tarifa.vigente_hasta < fechaReferencia) return 'vencida';
  return 'vigente';
}

export const MODALIDAD_LABEL = Object.freeze({
  viaje: 'Por viaje',
  km: 'Por km',
  tonelada: 'Por tonelada',
  hora: 'Por hora',
});

export const etiquetaModalidad = modalidad => MODALIDAD_LABEL[modalidad] || modalidad || '—';

export function formatearNumeroTransporte(valor, maximumFractionDigits = 2) {
  if (valor === '' || valor == null || !Number.isFinite(Number(valor))) return 'Sin dato';
  return Number(valor).toLocaleString('es-PE', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  });
}

export function formatearFechaTransporte(fecha, vacio = 'Sin dato') {
  if (!fecha) return vacio;
  const [year, month, day] = String(fecha).split('-');
  return year && month && day ? `${day}/${month}/${year}` : 'Sin dato';
}

// offsetMinutes follows ISO convention: Lima (UTC-5) is -300.
export function fechaUtcAFechaLocalInput(fecha, offsetMinutes = -new Date().getTimezoneOffset()) {
  if (!fecha) return '';
  const instant = new Date(fecha);
  if (!Number.isFinite(instant.getTime())) return '';
  return new Date(instant.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 16);
}

export function fechaLocalInputAFechaUtc(fecha, offsetMinutes = -new Date().getTimezoneOffset()) {
  if (!fecha) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(fecha);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0'] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - offsetMinutes * 60_000).toISOString();
}

export function formatearFechaHoraTransporte(fecha, locale = 'es-PE') {
  if (!fecha) return 'Sin dato';
  const instant = new Date(fecha);
  if (!Number.isFinite(instant.getTime())) return 'Sin dato';
  const pad = value => String(value).padStart(2, '0');
  return `${pad(instant.getDate())}/${pad(instant.getMonth() + 1)}/${instant.getFullYear()} ${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
}

export function etiquetaContador(cantidad, singular, plural = `${singular}s`) {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

export function normalizarPayloadViaje(payload = {}) {
  const references = ['os_cliente_id', 'cotizacion_id', 'ruta_id', 'tarifa_id', 'sociedad_id', 'transportista_id', 'vehiculo_id', 'conductor_id'];
  const numbers = ['distancia_km', 'duracion_estimada_horas', 'peso_toneladas', 'volumen_m3', 'tarifa_unitaria', 'minimo_facturable', 'cantidad_facturable'];
  const normalized = { ...payload };
  for (const key of references) if (normalized[key] === '') normalized[key] = null;
  for (const key of numbers) {
    if (normalized[key] === '') normalized[key] = null;
    else if (normalized[key] != null && Number.isFinite(Number(normalized[key]))) normalized[key] = Number(normalized[key]);
  }
  if (Array.isArray(normalized.paradas)) normalized.paradas = normalized.paradas.map(stop => ({
    ...stop,
    guia_remision_id: stop.guia_remision_id === '' ? null : stop.guia_remision_id ?? null,
  }));
  return normalized;
}

export function sincronizarParadasViaje(stops = [], origen = '', destino = '') {
  const current = Array.isArray(stops) ? stops : [];
  const origin = current.find(stop => stop.tipo === 'origen') || { tipo: 'origen', nombre: '' };
  const final = current.find(stop => stop.tipo === 'destino') || { tipo: 'destino', nombre: '' };
  const movable = current.filter(stop => !['origen', 'destino'].includes(stop.tipo));
  return [
    { ...origin, nombre: origin.nombre_manual ? origin.nombre : origen },
    ...movable,
    { ...final, nombre: final.nombre_manual ? final.nombre : destino },
  ];
}

export function unificarTiposUnidad(defaults = [], catalogo = []) {
  const result = [];
  const seen = new Set();
  for (const value of [...defaults, ...catalogo]) {
    const label = String(value || '').trim();
    const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE');
    if (label && !seen.has(key)) {
      seen.add(key);
      result.push(label);
    }
  }
  return result;
}

export function formatearImporte(valor, moneda, modalidad) {
  if (valor === '' || valor == null || !Number.isFinite(Number(valor))) return '—';

  const maximumFractionDigits = modalidad === 'km' ? 4 : 2;
  const minimumFractionDigits = 2;
  const symbol = moneda === 'USD' ? 'US$' : moneda === 'PEN' ? 'S/' : '';
  const formatted = Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return `${symbol} ${formatted}`.trim();
}

export function enriquecerTarifas(tarifas = [], rutas = [], cuentas = []) {
  const routeById = new Map(rutas.map(route => [route.id, route]));
  const accountById = new Map(cuentas.map(account => [account.id, account]));

  return tarifas.map(tarifa => {
    const route = routeById.get(tarifa.ruta_id);
    const account = accountById.get(tarifa.cuenta_id);

    return {
      ...tarifa,
      route_name: tarifa.ruta_id
        ? route?.nombre || route?.codigo || 'Ruta'
        : 'Todas las rutas',
      cuenta_name: tarifa.cuenta_id
        ? account?.nombre_comercial || account?.razon_social || 'Cliente'
        : 'Tarifa base',
    };
  });
}

const numeric = (value, min = 0) => (
  value == null || value === '' || (Number.isFinite(Number(value)) && Number(value) >= min)
);

const coord = (value, min, max) => (
  value == null || value === '' || (Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max)
);

export function validarFormularioRuta(form) {
  const errors = {};

  for (const field of ['codigo', 'nombre', 'origen_nombre', 'destino_nombre']) {
    if (!String(form[field] || '').trim()) errors[field] = 'Este campo es obligatorio.';
  }
  for (const field of ['distancia_km', 'duracion_estimada_horas', 'peajes_estimados']) {
    if (!numeric(form[field])) errors[field] = 'Ingresa un n\u00famero igual o mayor que cero.';
  }
  for (const field of ['origen_latitud', 'destino_latitud']) {
    if (!coord(form[field], -90, 90)) errors[field] = 'La latitud debe estar entre -90 y 90.';
  }
  for (const field of ['origen_longitud', 'destino_longitud']) {
    if (!coord(form[field], -180, 180)) errors[field] = 'La longitud debe estar entre -180 y 180.';
  }
  if (!['PEN', 'USD'].includes(form.moneda_peajes)) {
    errors.moneda_peajes = 'Selecciona PEN o USD.';
  }

  return errors;
}

export function validarFormularioTarifa(form) {
  const errors = {};

  if (!String(form.tipo_unidad || '').trim()) errors.tipo_unidad = 'Indica el tipo de unidad.';
  if (!['viaje', 'km', 'tonelada', 'hora'].includes(form.modalidad)) {
    errors.modalidad = 'Selecciona una modalidad.';
  }
  if (form.modalidad === 'viaje' && !form.ruta_id) {
    errors.ruta_id = 'Selecciona una ruta para la modalidad Por viaje.';
  }
  if (!Number.isFinite(Number(form.tarifa)) || Number(form.tarifa) <= 0) {
    errors.tarifa = 'La tarifa debe ser mayor que cero.';
  }
  if (!['PEN', 'USD'].includes(form.moneda)) errors.moneda = 'Selecciona una moneda.';
  if (!numeric(form.minimo_facturable)) {
    errors.minimo_facturable = 'El m\u00ednimo debe ser igual o mayor que cero.';
  }
  if (!form.vigente_desde) errors.vigente_desde = 'Indica el inicio de vigencia.';
  if (form.vigente_hasta && form.vigente_hasta < form.vigente_desde) {
    errors.vigente_hasta = 'La fecha final no puede ser anterior al inicio.';
  }

  return errors;
}

export const ESTADOS_VIAJE = Object.freeze(['borrador','programado','despachado','en_ruta','con_incidente','entregado','en_liquidacion','cerrado','cancelado']);
export const ESTADO_VIAJE_LABEL = Object.freeze({ borrador:'Borrador', programado:'Programado', despachado:'Despachado', en_ruta:'En ruta', con_incidente:'Con incidente', entregado:'Entregado', en_liquidacion:'En liquidación', cerrado:'Cerrado', cancelado:'Cancelado' });
export const ESTADO_VIAJE_COLOR = Object.freeze({ borrador:'is-gray', programado:'is-cyan', despachado:'is-cyan', en_ruta:'is-cyan', con_incidente:'is-amber', entregado:'is-green', en_liquidacion:'is-violet', cerrado:'is-gray', cancelado:'is-red' });
export const TRANSICIONES_VIAJE = Object.freeze({ borrador:['programado','cancelado'], programado:['despachado','borrador','cancelado'], despachado:['en_ruta','cancelado'], en_ruta:['con_incidente','entregado'], con_incidente:['en_ruta','entregado'], entregado:['en_liquidacion'], en_liquidacion:['cerrado','entregado'], cerrado:[], cancelado:[] });
export const etiquetaEstadoViaje = estado => ESTADO_VIAJE_LABEL[estado] || 'Sin dato';
export const etiquetaTipoParada = tipo => ({ origen: 'Origen', recojo: 'Recojo', entrega: 'Entrega', destino: 'Destino' })[tipo] || 'Sin dato';
export const etiquetaEstadoParada = estado => ({ pendiente: 'Pendiente', completada: 'Completada', omitida: 'Omitida' })[estado] || 'Sin dato';
export const colorEstadoViaje = estado => ESTADO_VIAJE_COLOR[estado] || 'is-gray';
export const accionesPermitidasViaje = estado => TRANSICIONES_VIAJE[estado] || [];
export const grupoEstadoViaje = estado => estado === 'borrador' ? 'borrador' : estado === 'programado' ? 'programados' : ['despachado','en_ruta','con_incidente'].includes(estado) ? 'en_curso' : estado === 'entregado' ? 'entregados' : ['en_liquidacion','cerrado','cancelado'].includes(estado) ? 'cerrados' : 'todos';
export function cantidadFacturableViaje(modalidad, values = {}) {
  const amount = modalidad === 'viaje' ? 1 : modalidad === 'km' ? values.distancia_km : modalidad === 'tonelada' ? values.peso_toneladas : modalidad === 'hora' ? values.duracion_estimada_horas : null;
  return amount == null || amount === '' || !Number.isFinite(Number(amount)) ? null : Number(amount);
}
export function ingresoEstimadoViaje(tarifa, cantidad, minimo = 0) {
  if (tarifa == null || tarifa === '' || cantidad == null || cantidad === '' || !Number.isFinite(Number(tarifa)) || !Number.isFinite(Number(cantidad))) return null;
  return Math.round(Math.max(Number(tarifa) * Number(cantidad), Number(minimo) || 0) * 100) / 100;
}
const ESTADOS_COMPROMISO_INGRESO = new Set(['programado','despachado','en_ruta','con_incidente','entregado','en_liquidacion','cerrado']);
function mesLocalFecha(fecha) {
  if (!fecha) return null;
  const value = String(fecha);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}
export function ingresoEstimadoMesViajes(viajes = [], fechaReferencia = new Date()) {
  const mes = `${fechaReferencia.getFullYear()}-${String(fechaReferencia.getMonth() + 1).padStart(2, '0')}`;
  return viajes.reduce((totales, viaje) => {
    if (!ESTADOS_COMPROMISO_INGRESO.has(viaje.estado) || mesLocalFecha(viaje.fecha_programada) !== mes || viaje.ingreso_estimado == null || !Number.isFinite(Number(viaje.ingreso_estimado))) return totales;
    const moneda = viaje.moneda || 'Sin moneda';
    totales[moneda] = Math.round(((totales[moneda] || 0) + Number(viaje.ingreso_estimado)) * 100) / 100;
    return totales;
  }, {});
}
export function esFechaViajeMesLocal(fecha, fechaReferencia = new Date()) {
  return mesLocalFecha(fecha) === `${fechaReferencia.getFullYear()}-${String(fechaReferencia.getMonth() + 1).padStart(2, '0')}`;
}
export const ordenarParadasViaje = stops => [...(stops || [])].sort((a, b) => Number(a.secuencia || 0) - Number(b.secuencia || 0)).map((stop, index) => ({ ...stop, secuencia: index + 1 }));
export function validarFormularioViaje(form = {}) {
  const errors = {};
  for (const key of ['cuenta_id','fecha_programada','origen_nombre','destino_nombre','tipo_unidad']) if (!String(form[key] || '').trim()) errors[key] = 'Este campo es obligatorio.';
  if (!['viaje','km','tonelada','hora'].includes(form.modalidad)) errors.modalidad = 'Selecciona una modalidad.';
  if (!['PEN','USD'].includes(form.moneda)) errors.moneda = 'Selecciona PEN o USD.';
  for (const key of ['distancia_km','duracion_estimada_horas','peso_toneladas','volumen_m3','cantidad_facturable','tarifa_unitaria','minimo_facturable']) {
    if (form[key] !== '' && form[key] != null && (!Number.isFinite(Number(form[key])) || Number(form[key]) < 0)) errors[key] = 'Ingresa un número igual o mayor que cero.';
  }
  (form.paradas || []).forEach((stop, index) => { if (!String(stop.nombre || '').trim()) errors[`parada_${index}`] = 'Indica el nombre de esta parada.'; });
  return errors;
}

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
  const references = [
    'os_cliente_id', 'cotizacion_id', 'ruta_id', 'tarifa_id', 'sociedad_id',
    'transportista_id', 'vehiculo_id', 'conductor_id', 'contacto_id',
  ];
  const numbers = [
    'distancia_km', 'duracion_estimada_horas', 'peso_toneladas', 'volumen_m3',
    'tarifa_unitaria', 'minimo_facturable', 'cantidad_facturable', 'carga_bultos',
  ];
  const normalized = { ...payload };
  for (const key of references) if (normalized[key] === '') normalized[key] = null;
  for (const key of numbers) {
    if (normalized[key] === '') normalized[key] = null;
    else if (normalized[key] != null && Number.isFinite(Number(normalized[key]))) normalized[key] = Number(normalized[key]);
  }
  if (Array.isArray(normalized.paradas)) normalized.paradas = normalized.paradas.map(stop => ({
    ...stop,
    guia_remision_id: stop.guia_remision_id === '' ? null : stop.guia_remision_id ?? null,
    lugar_id: stop.lugar_id === '' ? null : stop.lugar_id ?? null,
    ventana_inicio: stop.ventana_inicio === '' ? null : stop.ventana_inicio ?? null,
    ventana_fin: stop.ventana_fin === '' ? null : stop.ventana_fin ?? null,
  }));
  for (const key of ['referencia_cliente', 'carga_unidad_bultos', 'tipo_carga']) if (normalized[key] === '') normalized[key] = null;
  return normalized;
}

export function armarParadasDesdeRuta(ruta, lugares = []) {
  const porId = new Map(lugares.map(lugar => [lugar.id, lugar]));
  return ['origen', 'destino'].map(tipo => {
    const origen = tipo === 'origen'; const id = origen ? ruta?.origen_lugar_id : ruta?.destino_lugar_id;
    const lugar = porId.get(id); const prefix = origen ? 'origen' : 'destino';
    return {
      tipo,
      lugar_id: lugar?.id || null,
      nombre: lugar?.nombre || ruta?.[`${prefix}_nombre`] || '',
      direccion: lugar?.direccion || ruta?.[`${prefix}_direccion`] || null,
      latitud: lugar?.latitud ?? ruta?.[`${prefix}_latitud`] ?? null,
      longitud: lugar?.longitud ?? ruta?.[`${prefix}_longitud`] ?? null,
    };
  });
}

export function validarPasoViaje(paso, form = {}) {
  if (paso === 1) return Object.fromEntries(
    ['cuenta_id', 'fecha_programada']
      .filter(key => !String(form[key] || '').trim())
      .map(key => [key, 'Este campo es obligatorio.']),
  );
  if (paso === 2) return Object.fromEntries([
    ['ruta_id', 'Selecciona una ruta activa.'], ['origen_nombre', 'Este campo es obligatorio.'],
    ['destino_nombre', 'Este campo es obligatorio.'],
  ].filter(([key]) => !String(form[key] || '').trim()));
  if (paso === 3) return Object.fromEntries([
    ['carga_descripcion', 'Describe la carga.'], ['peso_toneladas', 'Indica el peso.'],
    ['tipo_unidad', 'Selecciona un tipo de unidad.'],
  ].filter(([key]) => !String(form[key] || '').trim()));
  return validarFormularioViaje(form);
}

export function precioManualValido(form = {}) {
  return form.procedencia_tarifa === 'manual' && Number(form.tarifa_unitaria) > 0;
}

export function puedeProgramarViaje(form = {}) {
  return precioManualValido(form)
    || (Number(form.tarifa_unitaria) > 0 && Boolean(form.tarifa_id)
      && ['cliente', 'base'].includes(form.procedencia_tarifa));
}

export function debeCambiarEstadoAlProgramar(estado = 'borrador') {
  return estado === 'borrador';
}

export function incluirOSActual(os = [], osActual = null) {
  if (!osActual || os.some(item => item.id === osActual.id)) return os;
  return [osActual, ...os];
}

export function validarVentanaParada(parada = {}) {
  if (!parada.ventana_inicio || !parada.ventana_fin) return '';
  return parada.ventana_fin > parada.ventana_inicio
    ? '' : 'La hora final debe ser posterior a la hora de inicio.';
}

export function diasParaVencimientoTarifa(tarifa, fechaReferencia = fechaHoyLocal()) {
  if (!tarifa?.vigente_hasta || estadoVigencia(tarifa, fechaReferencia) !== 'vigente') return null;
  const today = new Date(`${fechaReferencia}T00:00:00Z`);
  const end = new Date(`${tarifa.vigente_hasta}T00:00:00Z`);
  return Math.max(0, Math.round((end - today) / 86400000));
}

export function llegadaEstimadaViaje(salida, duracionHoras) {
  if (!salida || duracionHoras == null || duracionHoras === '' || !Number.isFinite(Number(duracionHoras))) return null;
  const start = new Date(salida);
  if (!Number.isFinite(start.getTime())) return null;
  return new Date(start.getTime() + Number(duracionHoras) * 3600000);
}

export const mapearRequisitosViaje = values => (values || []).map(value => ({
  gps: 'GPS', epp: 'EPP', sctr: 'SCTR', escolta: 'Escolta', refrigerado: 'Refrigerado',
}[value] || value));

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

export const UNIT_DEFAULTS = Object.freeze([
  'Camioneta',
  'Furgón',
  'Camión 2 ejes',
  'Camión 3 ejes',
  'Tracto con semirremolque',
  'Cama baja',
]);

export function catalogoTiposUnidad(tiposVehiculo = [], tarifas = [], tipoActual = '') {
  const tiposTarifa = tarifas
    .filter(tarifa => tarifa.estado === 'activa')
    .map(tarifa => tarifa.tipo_unidad);
  return unificarTiposUnidad(UNIT_DEFAULTS, [
    ...tiposVehiculo,
    ...tiposTarifa,
    tipoActual,
  ]);
}

export function estimarTrayecto(origen, destino) {
  if ([origen?.latitud, origen?.longitud, destino?.latitud, destino?.longitud]
    .some(value => value == null || value === '')) return null;
  const lat1 = Number(origen?.latitud);
  const lng1 = Number(origen?.longitud);
  const lat2 = Number(destino?.latitud);
  const lng2 = Number(destino?.longitud);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const rad = grados => grados * Math.PI / 180;
  const deltaLat = rad(lat2 - lat1);
  const deltaLng = rad(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(deltaLng / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.3;
  const distancia = Math.round(km / 5) * 5;
  return { distancia_km: distancia, duracion_estimada_horas: Math.round((distancia / 55) * 2) / 2 };
}

export function parsearCoordenadasMaps(value = '') {
  const match = String(value).match(/(?:@|!3d)?(-?\d{1,2}\.\d+)(?:,|!4d)\s*(-?\d{1,3}\.\d+)/);
  if (!match) return null;
  const latitud = Number(match[1]);
  const longitud = Number(match[2]);
  if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) return null;
  return { latitud, longitud };
}

export function validarLugar(form = {}) {
  const errors = {};
  if (!String(form.nombre || '').trim()) errors.nombre = 'Ingresa el nombre del lugar.';
  const lat = form.latitud === '' || form.latitud == null ? null : Number(form.latitud);
  const lng = form.longitud === '' || form.longitud == null ? null : Number(form.longitud);
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)
    || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    errors.ubicacion = 'Marca la ubicación en el mapa o pega un enlace con coordenadas.';
  }
  return errors;
}

export function encontrarNombreLugarDuplicado(lugares = [], form = {}, excluirId = null) {
  const nombre = String(form.nombre || '').trim().toLocaleLowerCase('es-PE');
  if (!nombre) return null;
  const cuentaId = form.cuenta_id || null;
  return lugares.find(item => item.id !== excluirId && item.estado !== 'inactivo'
    && String(item.nombre || '').trim().toLocaleLowerCase('es-PE') === nombre
    && (item.cuenta_id || null) === cuentaId) || null;
}

export function encontrarCruceTarifa(tarifas = [], form = {}, excluirId = null) {
  if ((form.estado || 'activa') !== 'activa' || !form.vigente_desde) return null;
  const end = form.vigente_hasta || '9999-12-31';
  return tarifas.find(item => item.id !== excluirId && item.estado === 'activa'
    && item.ruta_id === (form.ruta_id || null)
    && (item.cuenta_id || null) === (form.cuenta_id || null)
    && item.tipo_unidad === form.tipo_unidad && item.modalidad === form.modalidad
    && item.moneda === form.moneda && item.vigente_desde <= end
    && (item.vigente_hasta || '9999-12-31') >= form.vigente_desde) || null;
}

export function ejemploCobroTarifa(tarifa, ruta) {
  if (!tarifa || !ruta || !(Number(tarifa.tarifa) > 0)) return null;
  const modalidad = tarifa.modalidad;
  const capacidad = Number((String(tarifa.tipo_unidad || '').match(/(\d+)\s*t\b/i) || [])[1]) || 25;
  const cantidad = { viaje: 1, km: Number(ruta.distancia_km) || 0,
    tonelada: capacidad, hora: Number(ruta.duracion_estimada_horas) || 0 }[modalidad];
  const subtotal = Number(tarifa.tarifa) * cantidad;
  const minimo = Number(tarifa.minimo_facturable) || 0;
  return { cantidad, subtotal, total: Math.max(subtotal, minimo), aplicaMinimo: minimo > subtotal };
}

export function contarUsosLugarEnRutas(lugarId, rutas = []) {
  return rutas.filter(route => route.origen_lugar_id === lugarId
    || route.destino_lugar_id === lugarId).length;
}

export function validarComposerRuta(form, tarifaActiva = true) {
  const errors = {};
  if (!form.origen_lugar_id) errors.origen_lugar_id = 'Selecciona un lugar de origen.';
  if (!form.destino_lugar_id) errors.destino_lugar_id = 'Selecciona un lugar de destino.';
  if (form.origen_lugar_id && form.origen_lugar_id === form.destino_lugar_id) {
    errors.destino_lugar_id = 'El origen y destino deben ser distintos.';
  }
  for (const key of ['distancia_km', 'duracion_estimada_horas']) {
    if (form[key] === '' || !Number.isFinite(Number(form[key])) || Number(form[key]) <= 0) {
      errors[key] = 'Ingresa un valor mayor que cero.';
    }
  }
  if (form.numero_peajes !== '' && form.numero_peajes != null
    && (!Number.isInteger(Number(form.numero_peajes)) || Number(form.numero_peajes) < 0)) {
    errors.numero_peajes = 'Ingresa un número entero igual o mayor que cero.';
  }
  if (form.peajes_estimados !== '' && form.peajes_estimados != null
    && (!Number.isFinite(Number(form.peajes_estimados)) || Number(form.peajes_estimados) < 0)) {
    errors.peajes_estimados = 'Ingresa un monto igual o mayor que cero.';
  }
  if (!String(form.codigo || '').trim()) errors.codigo = 'Ingresa un código.';
  if (!String(form.nombre || '').trim()) errors.nombre = 'Ingresa un nombre.';
  if (tarifaActiva) {
    for (const key of ['tipo_unidad', 'modalidad', 'tarifa', 'moneda', 'vigente_desde']) {
      if (!String(form.tarifa?.[key] || '').trim()) errors[`tarifa.${key}`] = key === 'tarifa'
        ? 'Indica el precio de la tarifa base.' : 'Completa este campo.';
    }
    if (form.tarifa?.tarifa !== '' && Number(form.tarifa?.tarifa) <= 0) {
      errors['tarifa.tarifa'] = 'El precio debe ser mayor que cero.';
    }
    if (form.tarifa?.minimo_facturable !== '' && form.tarifa?.minimo_facturable != null
      && Number(form.tarifa.minimo_facturable) < 0) {
      errors['tarifa.minimo_facturable'] = 'El mínimo no puede ser negativo.';
    }
  }
  return errors;
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

export function formatearValorUnidad(valor, unidad = '') {
  if (valor === '' || valor == null || !Number.isFinite(Number(valor))) return 'Sin dato';
  const formatted = Number(valor).toLocaleString('es-PE', { maximumFractionDigits: 1 });
  return unidad ? `${formatted} ${unidad}` : formatted;
}

export function encontrarRutaDuplicada(rutas = [], origenId, destinoId) {
  if (!origenId || !destinoId) return null;
  return rutas.find(ruta => ruta.estado === 'activa'
    && ruta.origen_lugar_id === origenId && ruta.destino_lugar_id === destinoId) || null;
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
  for (const [key, message] of [['carga_descripcion', 'Describe la carga.'], ['peso_toneladas', 'Indica el peso.']]) {
    if (!String(form[key] || '').trim()) errors[key] = message;
  }
  if (!['viaje','km','tonelada','hora'].includes(form.modalidad)) errors.modalidad = 'Selecciona una modalidad.';
  if (!['PEN','USD'].includes(form.moneda)) errors.moneda = 'Selecciona PEN o USD.';
  for (const key of ['distancia_km','duracion_estimada_horas','peso_toneladas','volumen_m3','cantidad_facturable','tarifa_unitaria','minimo_facturable']) {
    if (form[key] !== '' && form[key] != null && (!Number.isFinite(Number(form[key])) || Number(form[key]) < 0)) errors[key] = 'Ingresa un número igual o mayor que cero.';
  }
  (form.paradas || []).forEach((stop, index) => { if (!String(stop.nombre || '').trim()) errors[`parada_${index}`] = 'Indica el nombre de esta parada.'; });
  return errors;
}

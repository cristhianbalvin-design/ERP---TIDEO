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

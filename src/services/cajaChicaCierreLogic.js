const ESTADOS_INACTIVOS = new Set(['inactivo', 'eliminado']);

const MENSAJES_CIERRE = Object.freeze({
  FONDO_NO_ENCONTRADO: 'No se encontró el fondo de Caja Chica.',
  FONDO_NO_ACTIVO: 'Este fondo ya no está activo y no puede cerrarse.',
  PERMISO_DENEGADO: 'No tienes permiso para cerrar fondos de Caja Chica.',
  NO_AUTENTICADO: 'La sesión no está autenticada.',
  ALCANCE_DENEGADO: 'La sociedad del destino está fuera de tu alcance.',
  SALDO_NEGATIVO_CIERRE: 'No se puede cerrar porque el saldo recalculado es negativo.',
  DESTINO_REQUERIDO: 'El saldo es positivo. Selecciona una caja abierta o una cuenta bancaria de destino.',
  SOCIEDAD_ORIGEN_REQUERIDA: 'Este fondo no tiene sociedad clasificada y no puede transferirse a otra caja.',
  DESTINO_NO_VALIDO: 'El destino no pertenece a la empresa o no es válido.',
  DESTINO_NO_ABIERTO: 'La caja destino debe estar abierta.',
  MONEDA_NO_COINCIDE: 'El destino debe tener la misma moneda del fondo.',
  SOCIEDAD_NO_COINCIDE: 'El destino debe pertenecer a la misma sociedad del fondo.',
  CUENTA_NO_VALIDA: 'La cuenta bancaria no pertenece a la empresa.',
  CUENTA_NO_ACTIVA: 'La cuenta bancaria destino no está activa.',
  DESTINO_INVALIDO: 'El destino debe ser una transferencia a otra caja o una devolución a cuenta bancaria.',
});

export const MENSAJE_CUENTAS_SIN_SOCIEDAD_ACTIVA = 'No hay una sociedad activa seleccionada; solo se pueden usar cuentas bancarias sin sociedad clasificada.';
export const MENSAJE_CUENTAS_SIN_DESTINO = 'No hay cuentas activas en esta moneda dentro del alcance.';
export const MENSAJE_CIERRE_EXITO_REFRESH_FALLIDO = 'El fondo se cerró correctamente, pero no se pudo actualizar la lista. Recarga la pantalla para ver el estado actualizado.';
export const MENSAJE_CIERRE_MODO_DEMO = 'El cierre de fondos no está disponible en modo demostración.';

const normalizarMoneda = value => String(value == null ? 'PEN' : value).toUpperCase();
const estadoActivo = row => String(row?.estado || '').toLowerCase() === 'activo';

export function adaptarAlcanceCuentasCajaChica(modoVistaSociedad = {}) {
  const sinFiltro = modoVistaSociedad.sinFiltro === true;
  const sociedadesIds = Array.isArray(modoVistaSociedad.sociedadesIds)
    ? [...new Set(modoVistaSociedad.sociedadesIds.filter(Boolean))]
    : [];
  const sociedadIdEscritura = modoVistaSociedad.sociedadIdEscritura || null;
  return {
    sinFiltro,
    sociedadesIds,
    sociedadIdEscritura,
    tieneAlcance: sinFiltro || Boolean(sociedadIdEscritura) || sociedadesIds.length > 0,
  };
}

export function filtrarDestinosTransferencia(fondo, fondos = []) {
  if (!fondo?.sociedad_id) return [];

  const moneda = normalizarMoneda(fondo.moneda);
  return fondos.filter(destino => (
    destino?.id
    && destino.id !== fondo.id
    && estadoActivo(destino)
    && normalizarMoneda(destino.moneda) === moneda
    && destino.sociedad_id === fondo.sociedad_id
  ));
}

function cuentaDentroDelAlcance(cuenta, alcance) {
  // La RPC 585 no aplica alcance societario a cuentas sin sociedad.
  if (!cuenta?.sociedad_id) return true;
  if (!alcance) return true;
  if (alcance.sociedadIdEscritura) return cuenta?.sociedad_id === alcance.sociedadIdEscritura;
  if (alcance.sinFiltro) return true;
  if (Array.isArray(alcance.sociedadesIds)) return alcance.sociedadesIds.includes(cuenta?.sociedad_id);
  return false;
}

export function filtrarCuentasDevolucion(fondo, cuentas = [], alcance = null) {
  const moneda = normalizarMoneda(fondo?.moneda);
  return cuentas.filter(cuenta => (
    cuenta?.id
    && !ESTADOS_INACTIVOS.has(String(cuenta.estado || '').toLowerCase())
    && cuenta.es_cuenta_detracciones !== true
    && normalizarMoneda(cuenta.moneda) === moneda
    && cuentaDentroDelAlcance(cuenta, alcance)
    && (!fondo?.sociedad_id || cuenta.sociedad_id === fondo.sociedad_id)
  ));
}

export function mensajeCuentasDevolucion(alcance, cuentas = []) {
  if (cuentas.length > 0) return null;
  if (alcance?.tieneAlcance === false) return MENSAJE_CUENTAS_SIN_SOCIEDAD_ACTIVA;
  return MENSAJE_CUENTAS_SIN_DESTINO;
}

export function puedeConfirmarCierreCajaChica({
  guardando = false,
  finalizado = false,
  supabaseMode = true,
  saldoNegativo = false,
  requiereDestinoVisible = false,
  destinoTipo = '',
  destinoId = '',
  sinDestinosActuales = false,
} = {}) {
  return Boolean(
    !guardando
      && !finalizado
      && supabaseMode
      && !saldoNegativo
      && (!requiereDestinoVisible || (destinoTipo && destinoId && !sinDestinosActuales)),
  );
}

export function extraerCodigoErrorCierre(error) {
  const original = String(error?.message || error || '').trim();
  return original.match(/^([A-Z][A-Z0-9_]*)\s*:/)?.[1] || null;
}

export function mensajeErrorCierre(error) {
  const original = String(error?.message || error || '').trim();
  const codigo = extraerCodigoErrorCierre(error);
  if (codigo && MENSAJES_CIERRE[codigo]) return MENSAJES_CIERRE[codigo];
  return `No se pudo cerrar el fondo. ${original || 'Ocurrió un error inesperado.'}`;
}

export function buildCierreFondoRpcArgs(
  fondoId,
  { destino_tipo = null, destino_id = null, referencia = null } = {},
) {
  return {
    p_fondo_id: fondoId,
    p_destino_tipo: destino_tipo,
    p_destino_id: destino_id,
    p_referencia: referencia,
  };
}

export function mapTransferenciasHistorial(transferencias = [], fondo, fondos = []) {
  const fondoNombre = new Map(fondos.map(row => [row.id, row.nombre]));
  return transferencias
    .filter(transferencia => (
      transferencia?.fondo_origen_id === fondo?.id
      || transferencia?.fondo_destino_id === fondo?.id
    ))
    .map(transferencia => {
      const saliente = transferencia.fondo_origen_id === fondo.id;
      const contraparteId = saliente ? transferencia.fondo_destino_id : transferencia.fondo_origen_id;
      return {
        ...transferencia,
        tipo_movimiento: saliente ? 'transferencia_saliente' : 'transferencia_entrante',
        sentido: saliente ? 'saliente' : 'entrante',
        fondo_contraparte_id: contraparteId,
        fondo_contraparte_nombre: fondoNombre.get(contraparteId) || contraparteId || null,
        fecha_movimiento: transferencia.fecha,
        monto_movimiento: (saliente ? -1 : 1) * Number(transferencia.monto || 0),
      };
    });
}

export { MENSAJES_CIERRE };

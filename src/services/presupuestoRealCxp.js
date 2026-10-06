import {
  compraCoversCxp,
  cxpCanDevengarEr,
  cxpDevengoAmount,
  cxpDevengoLabel,
} from './estadoResultadosService.js';
import { crearEntradasDevengoCxp } from './cxpDistribucionCeco.js';

const isInPeriod = (fecha, periodo) => String(fecha || '').slice(0, periodo?.length === 7 ? 7 : 4) === periodo;

/** Construye las filas CxP que se incorporan al real del presupuesto. */
export const crearFilasRealPresupuestoCxp = ({
  cxp = [],
  cxpDistribucionesCeco = [],
  comprasGastos = [],
  empresaId,
  periodo,
  efectivoCecos = null,
} = {}) => {
  const distribucionesPorCxp = new Map();
  (cxpDistribucionesCeco || []).forEach(distribucion => {
    if (!distribucion?.cxp_id) return;
    if (distribucion.empresa_id != null && distribucion.empresa_id !== empresaId) return;
    const filas = distribucionesPorCxp.get(distribucion.cxp_id) || [];
    filas.push(distribucion);
    distribucionesPorCxp.set(distribucion.cxp_id, filas);
  });

  return (cxp || []).flatMap(cuenta => {
    if (cuenta?.empresa_id !== empresaId) return [];
    const distribuciones = distribucionesPorCxp.get(cuenta.id) || [];
    if (!cuenta?.orden_compra_id && !distribuciones.length) return [];
    if (!cxpCanDevengarEr(cuenta) || compraCoversCxp(cuenta, comprasGastos)) return [];
    if (!isInPeriod(cuenta.fecha_emision, periodo)) return [];

    return crearEntradasDevengoCxp(
      { ...cuenta, devengoAmount: cxpDevengoAmount(cuenta) },
      distribuciones,
      { hasScopedFilters: efectivoCecos != null, effectiveCecoIds: efectivoCecos },
    ).map(({ cecoId, amount: monto }) => ({
      cxpId: cuenta.id,
      fecha: cuenta.fecha_emision || '',
      categoriaEr: cxpDevengoLabel(cuenta),
      cecoId,
      monto,
      concepto: cuenta.concepto || cuenta.nombre_emisor || cuenta.factura_numero || 'Cuenta por pagar',
      proveedor: cuenta.nombre_emisor || cuenta.proveedores?.razon_social,
      documento: cuenta.factura_numero || cuenta.tipo_comprobante,
      moneda: cuenta.moneda,
    }));
  });
};

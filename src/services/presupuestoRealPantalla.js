import { crearResumenRealPresupuesto, otCompatibleConPresupuesto } from './presupuestoReal.js';
import { crearFilasRealPresupuestoCxp } from './presupuestoRealCxp.js';

/**
 * Real de un presupuesto tal como lo muestra la pantalla Presupuestos.
 * Lo usan la pantalla y Aria (copia en la Edge, ver scripts/aria/er-compartido.mjs), para dar las mismas cifras.
 */
export function crearRealDePresupuesto({
  presupuesto = null,
  partidas = [],
  cxp = [],
  cxpDistribucionesCeco = [],
  comprasGastos = [],
  ots = [],
  centrosCosto = [],
  centrosBeneficio = [],
  empresaId,
  periodo,
  sinMultisociedad = false,
} = {}) {
  const sociedadDeOt = o => {
    const ceco = (centrosCosto || []).find(c => c.id === o.centro_costo_id);
    const cebe = (centrosBeneficio || []).find(c => c.id === o.centro_beneficio_id);
    return ceco?.sociedad_id || cebe?.sociedad_id || null;
  };
  const perteneceASociedad = row => {
    if (sinMultisociedad || !presupuesto?.sociedad_id) return true;
    return (row.sociedad_id || sociedadDeOt(row)) === presupuesto.sociedad_id;
  };
  const filasCxp = crearFilasRealPresupuestoCxp({
    cxp: (cxp || []).filter(perteneceASociedad), cxpDistribucionesCeco, comprasGastos, empresaId, periodo, efectivoCecos: null,
  });
  return crearResumenRealPresupuesto({
    partidas, comprasGastos, ots, filasCxp, empresaId, periodo, efectivoCecos: null,
    incluirRegistro: (registro, tipo) => tipo === 'cxp' || (perteneceASociedad(registro) && (tipo !== 'ot' || otCompatibleConPresupuesto(registro, presupuesto))),
  });
}

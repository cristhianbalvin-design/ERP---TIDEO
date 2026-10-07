export const normalizarCategoriaPresupuesto = valor => {
  const categoria = String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return categoria === 'logistica directa' ? 'logistica' : categoria;
};

/** Una OT cuenta en un presupuesto con CECO solo si no declara otro CECO distinto. */
export const otCompatibleConPresupuesto = (ot, presupuesto) =>
  !presupuesto?.centro_costo_id || !ot?.centro_costo_id || ot.centro_costo_id === presupuesto.centro_costo_id;

export const normalizarMonedaPresupuesto = moneda => String(moneda || 'PEN').toUpperCase() === 'USD' ? 'USD' : 'PEN';

const perteneceAlPeriodo = (fecha, periodo) => String(fecha || '').slice(0, periodo?.length === 7 ? 7 : 4) === periodo;
const estaEnCeco = (registro, efectivoCecos) => efectivoCecos == null || efectivoCecos.includes(registro.centro_costo_id || registro.cecoId);
const sumar = registros => registros.reduce((total, registro) => total + Number(registro.monto || 0), 0);
const porMoneda = () => ({ PEN: 0, USD: 0 });
const redondearADosDecimales = monto => Math.round((monto + Number.EPSILON) * 100) / 100;

/** Consolida importes PEN y USD en PEN usando un TC referencial único. */
export const crearTotalesConsolidadosReferencialesPEN = (totales = {}, tcUSDaPEN) => {
  const hayMontosUSD = ['presupuestado', 'real', 'variacion'].some(clave =>
    Number(totales?.[clave]?.USD || 0) !== 0
  );
  const tipoCambio = Number(tcUSDaPEN);

  if (hayMontosUSD && (!Number.isFinite(tipoCambio) || tipoCambio <= 0)) return null;

  return ['presupuestado', 'real', 'variacion'].reduce((consolidados, clave) => {
    const montos = totales?.[clave] || {};
    consolidados[clave] = redondearADosDecimales(
      Number(montos.PEN || 0) + (hayMontosUSD ? Number(montos.USD || 0) * tipoCambio : 0)
    );
    return consolidados;
  }, {});
};

/**
 * Prepara el real presupuestal por partida y moneda. Los registros del desglose
 * son los mismos que se usan para el cálculo, para evitar divergencias.
 */
export const crearResumenRealPresupuesto = ({
  partidas = [],
  comprasGastos = [],
  ots = [],
  filasCxp = [],
  empresaId,
  periodo,
  efectivoCecos = null,
  incluirRegistro = () => true,
} = {}) => {
  const partidasNormalizadas = partidas.map((partida, indice) => ({
    partida,
    indice,
    categoria: normalizarCategoriaPresupuesto(partida.categoria),
    moneda: normalizarMonedaPresupuesto(partida.moneda),
  }));
  const categoriasConPartida = new Set(partidasNormalizadas.map(partida => partida.categoria));
  const tienePartida = (categoria, moneda) => partidasNormalizadas.some(partida => partida.categoria === categoria && partida.moneda === moneda);

  const compras = (comprasGastos || [])
    .filter(gasto => gasto.empresa_id === empresaId && perteneceAlPeriodo(gasto.fecha, periodo) && estaEnCeco(gasto, efectivoCecos) && incluirRegistro(gasto, 'compra'))
    .map(gasto => ({
      tipo: 'compra', categoria: normalizarCategoriaPresupuesto(gasto.categoria), categoriaOriginal: gasto.categoria || '', moneda: normalizarMonedaPresupuesto(gasto.moneda),
      fecha: gasto.fecha || '', descripcion: gasto.descripcion || '—', proveedor: gasto.proveedor || '—',
      monto: Number(gasto.monto || 0), documento: gasto.numero_documento || gasto.factura || '—',
    }));
  const ordenesTrabajo = (ots || [])
    .filter(ot => ot.empresa_id === empresaId && perteneceAlPeriodo(ot.fecha_cierre || ot.fecha_inicio, periodo) && ['cerrada', 'facturada'].includes(ot.estado) && incluirRegistro(ot, 'ot'))
    .map(ot => ({
      tipo: 'ot', categoria: 'mano de obra', categoriaOriginal: 'Mano de obra', moneda: 'PEN', fecha: ot.fecha_cierre || ot.fecha_inicio || '',
      descripcion: ot.numero ? `OT ${ot.numero}` : ot.nombre || 'OT', proveedor: ot.tecnico_lider || '—',
      monto: Number(ot.costo_real || 0), documento: ot.numero || '—',
    }));
  const cxp = (filasCxp || [])
    .filter(fila => estaEnCeco(fila, efectivoCecos) && incluirRegistro(fila, 'cxp'))
    .map(fila => ({
      tipo: 'cxp', categoria: normalizarCategoriaPresupuesto(fila.categoriaEr), categoriaOriginal: fila.categoriaEr || '', moneda: normalizarMonedaPresupuesto(fila.moneda),
      fecha: fila.fecha || '', descripcion: fila.concepto || 'Cuenta por pagar', proveedor: fila.proveedor || '—',
      monto: Number(fila.monto || 0), documento: fila.documento || '—',
    }));
  const registros = [...compras, ...ordenesTrabajo, ...cxp];

  const porPartida = partidasNormalizadas.map(meta => {
    const esManoDeObra = meta.categoria === 'mano de obra';
    const desglose = registros.filter(registro =>
      registro.categoria === meta.categoria && registro.moneda === meta.moneda &&
      (esManoDeObra ? registro.tipo !== 'compra' : registro.tipo !== 'ot')
    );
    return { ...meta, real: sumar(desglose), desglose };
  });

  const gruposSinPartida = new Map();
  const agregarSinPartida = (registro, esCxpSinCategoria) => {
    const clave = esCxpSinCategoria
      ? `cxp-sin-categoria:${registro.moneda}`
      : `sin-partida:${registro.categoria}:${registro.moneda}`;
    const existente = gruposSinPartida.get(clave) || {
      id: clave,
      categoria: esCxpSinCategoria ? 'Compras por OC sin categoría' : registro.categoriaOriginal || registro.categoria,
      moneda: registro.moneda,
      esCxpSinCategoria,
      desglose: [],
    };
    existente.desglose.push(registro);
    gruposSinPartida.set(clave, existente);
  };

  registros.forEach(registro => {
    const esManoDeObra = registro.categoria === 'mano de obra';
    if ((esManoDeObra && registro.tipo === 'compra') || (!esManoDeObra && registro.tipo === 'ot')) return;
    if (tienePartida(registro.categoria, registro.moneda)) return;
    if (registro.tipo === 'cxp' && !categoriasConPartida.has(registro.categoria)) {
      agregarSinPartida(registro, true);
    } else if (categoriasConPartida.has(registro.categoria)) {
      agregarSinPartida(registro, false);
    }
  });

  const sinPartida = [...gruposSinPartida.values()].map(grupo => ({
    ...grupo,
    real: sumar(grupo.desglose),
    descripcion: grupo.esCxpSinCategoria ? 'CxP de OC sin partida presupuestal coincidente' : 'Real sin partida presupuestal en esta moneda',
  }));
  const presupuestadoPorMoneda = porMoneda();
  const realPorMoneda = porMoneda();
  porPartida.forEach(resultado => {
    presupuestadoPorMoneda[resultado.moneda] += Number(resultado.partida.monto_presupuestado || 0);
    realPorMoneda[resultado.moneda] += resultado.real;
  });
  sinPartida.forEach(resultado => { realPorMoneda[resultado.moneda] += resultado.real; });

  return {
    porPartida,
    sinPartida,
    totales: {
      presupuestado: presupuestadoPorMoneda,
      real: realPorMoneda,
      variacion: {
        PEN: realPorMoneda.PEN - presupuestadoPorMoneda.PEN,
        USD: realPorMoneda.USD - presupuestadoPorMoneda.USD,
      },
    },
  };
};

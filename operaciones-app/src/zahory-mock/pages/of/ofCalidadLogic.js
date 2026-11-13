// F4 · Calidad de la OF: reglas de la pestaña Calidad.
// La base de datos es la que decide (of_calidad_*); esto solo prepara la vista con las mismas reglas.

export const DISPOSICIONES = [
  { id: 'reprocesar', titulo: 'Reprocesar', ayuda: 'Se corrige en taller y se vuelve a medir.' },
  { id: 'concesion', titulo: 'Aceptar por concesión del cliente', ayuda: 'Se entrega fuera de tolerancia con la aprobación del cliente (con evidencia).' },
  { id: 'rechazar', titulo: 'Rechazar y rehacer', ayuda: 'La unidad se descarta, se fabrica otra y se vuelve a medir.' },
];
export const ETIQUETA_DISPOSICION = Object.fromEntries(DISPOSICIONES.map(d => [d.id, d.titulo]));

export const ESTADOS_ENVIO = ['aprobada', 'en_produccion'];
export const ESTADOS_CON_CALIDAD = ['en_calidad', 'lista_entrega', 'entregada', 'cerrada'];

export const leerNumero = valor => {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(String(valor).replace(',', '.').replace('−', '-'));
  return Number.isFinite(n) ? n : null;
};
const corto = n => (n === null || n === undefined ? '' : Number(n).toLocaleString('es-PE', { maximumFractionDigits: 4 }));

export function normalizarCalidad(data = {}) {
  const caracteristicas = (data.caracteristicas || []).map(c => ({
    ...c,
    nominal: leerNumero(c.nominal),
    tol_menos: leerNumero(c.tol_menos),
    tol_mas: leerNumero(c.tol_mas),
    pieza_cantidad: Math.max(1, Number(c.pieza_cantidad) || 1),
    pos_x: leerNumero(c.pos_x),
    pos_y: leerNumero(c.pos_y),
  }));
  return {
    estado: data.estado || '',
    puedeEnviar: Boolean(data.puede_enviar),
    puedeInspeccionar: Boolean(data.puede_inspeccionar),
    puedeLiberar: Boolean(data.puede_liberar),
    enviadoEn: data.enviado_en || null,
    liberadoEn: data.liberado_en || null,
    liberadoPor: data.liberado_por || '',
    ficha: data.ficha || null,
    caracteristicas,
    mediciones: (data.mediciones || []).map(m => ({ ...m, valor: leerNumero(m.valor), unidad: Number(m.unidad) })),
    noConformidades: data.no_conformidades || [],
  };
}

export const claveMedicion = (caracteristicaId, unidad) => `${caracteristicaId}:${unidad}`;

export function textoTolerancia(c) {
  if (c.tipo_control !== 'medida') return 'Visual';
  const menos = c.tol_menos ? `−${corto(c.tol_menos)}` : '0';
  const mas = c.tol_mas ? `+${corto(c.tol_mas)}` : '0';
  return `${menos} / ${mas}`;
}

export function textoNominal(c) {
  if (c.tipo_control !== 'medida') return c.nominal_texto || 'Conforme / no conforme';
  return [corto(c.nominal), c.unidad].filter(Boolean).join(' ');
}

export function limites(c) {
  if (c.tipo_control !== 'medida' || c.nominal === null) return null;
  return { min: c.nominal - Math.abs(c.tol_menos || 0), max: c.nominal + Math.abs(c.tol_mas || 0) };
}

// Mismo criterio que of_calidad_conforme en la base de datos.
export function esConforme(c, valor) {
  const v = leerNumero(valor);
  const l = limites(c);
  if (v === null || !l) return null;
  return v >= l.min - 1e-9 && v <= l.max + 1e-9;
}

// 'ok' | 'fuera' | 'concesion' | 'pendiente' | 'opcional'
export function resultadoUnidad(c, medicion, ncs = []) {
  const concesion = ncs.some(n => n.caracteristica_id === c.id && Number(n.unidad) === medicion?.unidad
    && n.disposicion === 'concesion' && n.estado === 'cerrada');
  if (medicion) {
    if (medicion.conforme) return 'ok';
    return concesion ? 'concesion' : 'fuera';
  }
  return c.critica ? 'pendiente' : 'opcional';
}

export function ncAbierta(ncs, caracteristicaId, unidad) {
  return ncs.find(n => n.caracteristica_id === caracteristicaId && Number(n.unidad) === Number(unidad) && n.estado === 'abierta') || null;
}

export function resumenCalidad({ caracteristicas = [], mediciones = [], noConformidades = [] } = {}) {
  const porClave = new Map(mediciones.map(m => [claveMedicion(m.caracteristica_id, m.unidad), m]));
  let criticasOk = 0;
  let criticasTotal = 0;
  let fuera = 0;
  let opcionalesMedidas = 0;
  let opcionalesTotal = 0;
  caracteristicas.forEach(c => {
    for (let u = 1; u <= c.pieza_cantidad; u += 1) {
      const m = porClave.get(claveMedicion(c.id, u));
      const r = resultadoUnidad(c, m ? { ...m, unidad: u } : null, noConformidades);
      if (c.critica) {
        criticasTotal += 1;
        if (r === 'ok' || r === 'concesion') criticasOk += 1;
      } else {
        opcionalesTotal += 1;
        if (m) opcionalesMedidas += 1;
      }
      if (r === 'fuera') fuera += 1;
    }
  });
  const abiertas = noConformidades.filter(n => n.estado === 'abierta').length;
  return {
    criticasOk, criticasTotal, fuera, opcionalesMedidas, opcionalesTotal, ncAbiertas: abiertas,
    liberable: criticasOk === criticasTotal && abiertas === 0,
  };
}

// Agrupa las características por pieza (para mostrar una tarjeta por pieza con su plano).
export function piezasDeCalidad(caracteristicas = [], ficha = null) {
  const piezasFicha = new Map((ficha?.piezas || []).map(p => [String(p.id), p]));
  const grupos = new Map();
  caracteristicas.forEach(c => {
    const clave = `${c.pieza_orden}:${c.pieza_id || c.pieza_nombre}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        clave,
        orden: c.pieza_orden,
        nombre: c.pieza_nombre,
        cantidad: c.pieza_cantidad,
        ficha: piezasFicha.get(String(c.pieza_id)) || null,
        caracteristicas: [],
      });
    }
    grupos.get(clave).caracteristicas.push(c);
  });
  return [...grupos.values()].sort((a, b) => a.orden - b.orden)
    .map(g => ({ ...g, caracteristicas: g.caracteristicas.sort((a, b) => a.numero - b.numero) }));
}


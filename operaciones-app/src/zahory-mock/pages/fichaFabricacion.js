// Ficha técnica de fabricación: foto fija de lo que se entrega al cliente.
// Decisión (Cristhian, 2026-10-28): plano con pines numerados (críticas en rojo) y cotas encendidas,
// tabla de características, conclusión, trabajos a realizar (sin horas ni costos) y firma del emisor.
// Se guarda al emitir (v1, v2… tras reabrir) y se puede descargar como borrador en cualquier momento.

const texto = valor => (valor === null || valor === undefined ? '' : String(valor).trim());
const numero = valor => {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const toleranciaFicha = item => {
  const signo = (valor, prefijo) => {
    const limpio = texto(valor).replace(/^[+\-−]\s*/, '');
    return limpio ? `${prefijo}${limpio}` : '';
  };
  return [signo(item?.tolerancia_menos, '−'), signo(item?.tolerancia_mas, '+')].filter(Boolean).join(' / ');
};

export function totalMaterialFicha(pieza) {
  const consumo = numero(pieza?.consumo_material);
  const cantidad = numero(pieza?.cantidad);
  return consumo > 0 && cantidad > 0 ? Math.round(consumo * cantidad * 10000) / 10000 : null;
}

// Trabajos agrupados como en pantalla: trabajo › actividad › tareas (con su pieza). Sin horas ni costos.
export function trabajosFicha(lineas = [], catalogs = {}, piezas = []) {
  const porId = lista => new Map((lista || []).map(item => [item.id, item]));
  const familias = porId(catalogs.familias);
  const tipos = porId(catalogs.tipos);
  const nombrePieza = id => (id ? piezas.find(pieza => pieza.id === id)?.nombre || '' : '');
  const grupos = new Map();
  [...lineas].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0)).forEach(linea => {
    const familiaId = linea.familia_trabajo_id || 'sin-familia';
    if (!grupos.has(familiaId)) grupos.set(familiaId, { trabajo: familias.get(familiaId)?.nombre || 'Trabajo', actividades: new Map() });
    const grupo = grupos.get(familiaId);
    const actividadId = linea.actividad_id || 'sin-actividad';
    if (!grupo.actividades.has(actividadId)) grupo.actividades.set(actividadId, { actividad: tipos.get(actividadId)?.nombre || 'Actividad', tareas: [] });
    const tarea = linea.tarea_id ? tipos.get(linea.tarea_id)?.nombre || 'Tarea' : '';
    if (tarea) grupo.actividades.get(actividadId).tareas.push({ tarea, pieza: nombrePieza(linea.pieza_id) || 'Todas las piezas' });
  });
  return [...grupos.values()].map(grupo => ({ trabajo: grupo.trabajo, actividades: [...grupo.actividades.values()] }));
}

// dibujos: componentes del catálogo ({ id, nombre, svg, zonas[{ id, nombre, medidas[{ id, nombre, cota }] }] }).
// marcarDibujo(svg, zonas, cotas) devuelve el SVG con partes marcadas y cotas encendidas.
export function construirFichaFabricacion({
  piezas = [], dibujos = [], lineas = [], catalogs = {}, cabecera = {}, empresa = null,
  conclusion = '', emisor = null, borrador = true, marcarDibujo = svg => svg,
} = {}) {
  const dibujoPorId = new Map((dibujos || []).map(item => [item.id, item]));
  return {
    tipo: 'fabricacion',
    borrador: Boolean(borrador),
    generado_en: new Date().toISOString(),
    cabecera: {
      origen_tipo: texto(cabecera.origen_tipo),
      origen_numero: texto(cabecera.origen_numero),
      cliente: texto(cabecera.cliente),
      activo: texto(cabecera.activo),
      referencia_cliente: texto(cabecera.referencia_cliente),
      tecnico: texto(cabecera.tecnico),
      fecha: texto(cabecera.fecha),
    },
    empresa: empresa ? { razon_social: texto(empresa.razon_social), ruc: texto(empresa.ruc), logo_url: empresa.logo_url || null } : null,
    piezas: piezas.map((pieza, index) => {
      const componente = pieza.plano_origen === 'catalogo' ? dibujoPorId.get(pieza.componente_catalogo_id) || null : null;
      const zona = id => (componente?.zonas || []).find(item => item.id === id) || null;
      const medida = item => zona(item.zona_id)?.medidas?.find(m => m.id === item.medida_id) || null;
      const caracteristicas = [...(pieza.caracteristicas || [])].sort((a, b) => Number(a.numero) - Number(b.numero));
      return {
        id: pieza.id,
        orden: index + 1,
        nombre: texto(pieza.nombre),
        cantidad: numero(pieza.cantidad),
        material: pieza.material ? { codigo: texto(pieza.material.codigo), descripcion: texto(pieza.material.descripcion), unidad: texto(pieza.material.unidad) } : null,
        consumo_material: numero(pieza.consumo_material),
        total_material: totalMaterialFicha(pieza),
        observaciones: texto(pieza.observaciones),
        plano_origen: pieza.plano_origen || null,
        plano_imagen_ruta: pieza.plano_origen === 'subido' ? pieza.plano_imagen_ruta || null : null,
        plano_ancho: numero(pieza.plano_ancho),
        plano_alto: numero(pieza.plano_alto),
        dibujo_nombre: componente ? texto(componente.nombre) : '',
        svg: componente?.svg ? marcarDibujo(componente.svg, caracteristicas.map(item => item.zona_id), caracteristicas.map(item => medida(item)?.cota)) : null,
        caracteristicas: caracteristicas.map(item => ({
          numero: Number(item.numero),
          nombre: texto(item.nombre),
          parte: zona(item.zona_id)?.nombre ? texto(zona(item.zona_id).nombre) : '',
          nominal: [texto(item.nominal), texto(item.unidad)].filter(Boolean).join(' '),
          tolerancia: toleranciaFicha(item),
          critica: Boolean(item.critica),
          pos_x: numero(item.pos_x) ?? 0,
          pos_y: numero(item.pos_y) ?? 0,
        })),
      };
    }),
    trabajos: trabajosFicha(lineas, catalogs, piezas),
    conclusion: texto(conclusion),
    emisor: emisor ? {
      persona_id: emisor.persona_id || emisor.id || null,
      nombre: texto(emisor.nombre),
      cargo: texto(emisor.cargo),
      firma_bucket: emisor.firma_bucket || null,
      firma_storage_path: emisor.firma_storage_path || null,
      firma_url: emisor.firma_url || null,
    } : null,
  };
}

export const nombreArchivoFicha = (ficha, version = null) => {
  const base = String(ficha?.cabecera?.origen_numero || 'fabricacion').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'fabricacion';
  return `Ficha-tecnica-${base}${version ? `-v${version}` : '-borrador'}.pdf`;
};

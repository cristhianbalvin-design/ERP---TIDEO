const DEFAULTS = { conclusion: '', conclusion_origen: 'manual', conclusion_confirmada: false, incluir_mediciones: false, mostrar_horas: false, ocultar_conformes: false };
const value = (...values) => values.find(item => item !== undefined && item !== null && item !== '') ?? null;
const rows = catalog => Array.isArray(catalog) ? catalog : [];
const etiqueta = (items, codigo) => rows(items).find(item => item.codigo === codigo || item.id === codigo)?.etiqueta || rows(items).find(item => item.codigo === codigo || item.id === codigo)?.nombre || codigo || null;
const catalogOf = (catalogos, key) => catalogos?.[key] || [];

export function construirVistaInforme(diagnostico, opciones = {}, catalogos = {}, cabecera = {}, fotosPorHallazgo = {}) {
  const op = { ...DEFAULTS, ...opciones };
  const fotosDe = hallazgoId => fotosPorHallazgo instanceof Map ? fotosPorHallazgo.get(hallazgoId) : fotosPorHallazgo?.[hallazgoId];
  const hallazgosOrigen = diagnostico?.hallazgos || diagnostico?.diagnostico_tecnico_hallazgos || [];
  const hallazgos = hallazgosOrigen.filter(item => item.incluir_en_informe === true && !(op.ocultar_conformes && item.condicion === 'conforme')).map(item => ({
    hallazgo_id: item.id || item.hallazgo_id || null,
    componente_parte: item.componente_parte || null,
    tipo_dano_codigo: item.tipo_dano_codigo || null,
    tipo_dano_etiqueta: value(item.tipo_dano_etiqueta, etiqueta(catalogOf(catalogos, 'tipos_dano'), item.tipo_dano_codigo)),
    causa_probable_codigo: item.causa_probable_codigo || null,
    causa_probable_etiqueta: value(item.causa_probable_etiqueta, etiqueta(catalogOf(catalogos, 'causas_probables'), item.causa_probable_codigo)),
    condicion_codigo: item.condicion || null,
    condicion_etiqueta: value(item.condicion_etiqueta, etiqueta(catalogOf(catalogos, 'condiciones'), item.condicion), ({ conforme: 'Conforme', desgaste_aceptable: 'Desgaste aceptable', fuera_de_tolerancia: 'Fuera de tolerancia', falla_funcional: 'Falla funcional' })[item.condicion]),
    riesgo_codigo: item.riesgo || null,
    riesgo_etiqueta: value(item.riesgo_etiqueta, etiqueta(catalogOf(catalogos, 'riesgos'), item.riesgo), ({ monitorear: 'Monitorear', proximo_mantenimiento: 'Próximo mantenimiento', antes_de_operar: 'Antes de operar', inmediato_por_seguridad: 'Inmediato por seguridad' })[item.riesgo]),
    accion_recomendada_codigo: item.accion_recomendada || null,
    accion_recomendada_etiqueta: value(item.accion_recomendada_etiqueta, etiqueta(catalogOf(catalogos, 'acciones_recomendadas'), item.accion_recomendada), ({ reutilizar: 'Reutilizar', reparar: 'Reparar', reemplazar: 'Reemplazar', fabricar_nuevo: 'Fabricar nuevo', monitorear: 'Monitorear' })[item.accion_recomendada]),
    atribuible_a_codigo: item.atribuible_a || null,
    atribuible_a_etiqueta: value(item.atribuible_a_etiqueta, etiqueta(catalogOf(catalogos, 'atribuibles'), item.atribuible_a), ({ desgaste_normal: 'Desgaste normal', operacion: 'Operación', defecto_fabrica: 'Defecto de fábrica', instalacion: 'Instalación' })[item.atribuible_a]),
    prioridad: item.prioridad_efectiva || item.prioridad_override || item.prioridad_calculada || item.prioridad || null,
    observacion: item.observacion || null,
    fotos: (Array.isArray(fotosDe(item.id || item.hallazgo_id)) ? fotosDe(item.id || item.hallazgo_id) : [])
      .filter(foto => foto.excluir_del_informe === false && foto.signedUrl)
      .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
      .slice(0, 3)
      .map(foto => ({ url: foto.signedUrl, leyenda: foto.leyenda || null })),
  }));
  const ids = new Set(hallazgos.map(item => item.hallazgo_id));
  const medicionesOrigen = hallazgosOrigen.flatMap(h => (h.mediciones || []).map(m => ({ ...m, hallazgo_id: h.id || h.hallazgo_id })));
  const mediciones = op.incluir_mediciones ? medicionesOrigen.filter(m => ids.has(m.hallazgo_id)).map(m => ({
    hallazgo_id: m.hallazgo_id || null, parametro: m.parametro || null, unidad: m.unidad || null,
    nominal: m.nominal ?? null, minimo: m.minimo ?? null, maximo: m.maximo ?? null, medido: m.medido ?? null,
    resultado: m.resultado_calculado || m.resultado || null, condicion_sugerida: m.condicion_sugerida || null,
  })) : [];
  const lineas = diagnostico?.lineas || diagnostico?.tareas_repuestos || [];
  const tareas = op.mostrar_horas ? lineas.map(line => ({
    linea_id: line.id || line.linea_id || null,
    familia_trabajo_id: line.familia_trabajo_id || null,
    familia_trabajo_nombre: value(line.familia_trabajo_nombre, rows(catalogOf(catalogos, 'familias')).find(x => x.id === line.familia_trabajo_id)?.nombre),
    actividad_id: line.actividad_id || null,
    actividad_codigo: value(line.actividad_codigo, rows(catalogOf(catalogos, 'tipos')).find(x => x.id === line.actividad_id)?.codigo),
    actividad_nombre: value(line.actividad_nombre, rows(catalogOf(catalogos, 'tipos')).find(x => x.id === line.actividad_id)?.nombre),
    tarea_id: line.tarea_id || null,
    tarea_codigo: value(line.tarea_codigo, rows(catalogOf(catalogos, 'tipos')).find(x => x.id === line.tarea_id)?.codigo),
    tarea_nombre: value(line.tarea_nombre, rows(catalogOf(catalogos, 'tipos')).find(x => x.id === line.tarea_id)?.nombre),
    hallazgo: line.hallazgo || null,
    cargo_id: line.cargo_id || null,
    cargo_codigo: value(line.cargo_codigo, rows(catalogOf(catalogos, 'cargos')).find(x => x.id === line.cargo_id)?.codigo),
    cargo_nombre: value(line.cargo_nombre, rows(catalogOf(catalogos, 'cargos')).find(x => x.id === line.cargo_id)?.nombre),
    horas_mano_obra: line.horas_mano_obra ?? null,
    activo_id: line.activo_id || null,
    activo_codigo: value(line.activo_codigo, rows(catalogOf(catalogos, 'activos')).find(x => x.id === line.activo_id)?.codigo),
    activo_nombre: value(line.activo_nombre, rows(catalogOf(catalogos, 'activos')).find(x => x.id === line.activo_id)?.nombre),
    horas_maquina: line.horas_maquina ?? null,
    materiales: (line.materiales || []).map(m => ({ material_id: m.material_id || null, codigo: m.codigo || null, descripcion: m.descripcion || null, cantidad: m.cantidad ?? null, unidad: m.unidad || null })),
  })) : lineas.map(line => ({
    linea_id: line.id || line.linea_id || null,
    familia_trabajo_id: line.familia_trabajo_id || null,
    familia_trabajo_nombre: value(line.familia_trabajo_nombre, rows(catalogOf(catalogos, 'familias')).find(x => x.id === line.familia_trabajo_id)?.nombre),
    actividad_id: line.actividad_id || null,
    actividad_codigo: rows(catalogOf(catalogos, 'tipos')).find(x => x.id === line.actividad_id)?.codigo || null,
    actividad_nombre: rows(catalogOf(catalogos, 'tipos')).find(x => x.id === line.actividad_id)?.nombre || null,
    tarea_id: line.tarea_id || null,
    tarea_codigo: rows(catalogOf(catalogos, 'tipos')).find(x => x.id === line.tarea_id)?.codigo || null,
    tarea_nombre: rows(catalogOf(catalogos, 'tipos')).find(x => x.id === line.tarea_id)?.nombre || null,
    hallazgo: line.hallazgo || null, cargo_id: line.cargo_id || null,
    cargo_codigo: rows(catalogOf(catalogos, 'cargos')).find(x => x.id === line.cargo_id)?.codigo || null,
    cargo_nombre: rows(catalogOf(catalogos, 'cargos')).find(x => x.id === line.cargo_id)?.nombre || null,
    activo_id: line.activo_id || null,
    activo_codigo: rows(catalogOf(catalogos, 'activos')).find(x => x.id === line.activo_id)?.codigo || null,
    activo_nombre: rows(catalogOf(catalogos, 'activos')).find(x => x.id === line.activo_id)?.nombre || null,
    materiales: (line.materiales || []).map(m => ({ material_id: m.material_id || null, codigo: m.codigo || null, descripcion: m.descripcion || null, cantidad: m.cantidad ?? null, unidad: m.unidad || null })),
  }));
  const resumen = hallazgosOrigen.filter(item => item.incluir_en_informe === true).reduce((acc, item) => {
    const priority = item.prioridad_efectiva || item.prioridad_override || item.prioridad_calculada || item.prioridad;
    if (['P1', 'P2', 'P3', 'P4'].includes(priority)) acc[priority] += 1;
    if (item.condicion === 'conforme') acc.conformes += 1;
    return acc;
  }, { P1: 0, P2: 0, P3: 0, P4: 0, conformes: 0 });
  const head = { ...cabecera };
  const activo = head.activo || {};
  const cliente = head.cliente || {};
  return {
    version: null,
    emitido_en: null,
    cabecera: {
      recepcion_id: value(head.recepcion_id, diagnostico?.recepcion_id), numero_recepcion: value(head.numero_recepcion, head.numero, head.numero_rac), numero_caso: head.numero_caso ?? null,
      fecha_recepcion: value(head.fecha_recepcion, head.fecha_ingreso, head.fecha), activo_id: value(head.activo_id, activo.id, diagnostico?.activo_id),
      activo_codigo: value(head.activo_codigo, activo.codigo), activo_nombre: value(head.activo_nombre, activo.nombre), numero_serie: value(head.numero_serie, activo.placa_serie, activo.numero_serie),
      horometro: head.horometro ?? null, cliente_id: value(head.cliente_id, cliente.id), cliente_razon_social: value(head.cliente_razon_social, head.cliente_nombre, cliente.razon_social, cliente.nombre),
      diagnostico_id: diagnostico?.id || null, tipo: diagnostico?.tipo || null, estado_diagnostico: diagnostico?.estado || null,
    },
    hallazgos, mediciones, tareas_repuestos: tareas, resumen,
    conclusion: String(op.conclusion || '').trim() || null,
    conclusion_origen: op.conclusion_origen,
    emisor: { nombre: head.emisor_nombre || null, cargo: head.emisor_cargo || null },
  };
}

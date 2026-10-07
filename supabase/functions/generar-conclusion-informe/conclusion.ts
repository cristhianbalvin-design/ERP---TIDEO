const text = (value: unknown, limit: number) => String(value ?? '').replace(/<\s*\/?\s*datos\s*>/gi, '[dato]').trim().slice(0, limit);
const condiciones: Record<string, string> = { conforme: 'conforme', desgaste_aceptable: 'desgaste aceptable', fuera_de_tolerancia: 'fuera de tolerancia', falla_funcional: 'falla funcional' };
const riesgos: Record<string, string> = { monitorear: 'monitorear', proximo_mantenimiento: 'próximo mantenimiento', antes_de_operar: 'antes de operar', inmediato_por_seguridad: 'inmediato por seguridad' };
const acciones: Record<string, string> = { reutilizar: 'reutilizar', reparar: 'reparar', reemplazar: 'reemplazar', fabricar_nuevo: 'fabricar nuevo', monitorear: 'monitorear' };

export function esIdDiagnosticoValido(value: unknown): value is string {
  return typeof value === 'string' && /^dt_[0-9a-f]{32}$/i.test(value);
}

export function construirPayloadWhitelist(hallazgos: any[] = [], lineas: any[] = [], materiales: any[] = [], catalogos: any[] = []) {
  const labels = new Map(catalogos.map(item => [`${item.catalogo}:${item.codigo}`, item.etiqueta]));
  const materialByLine = new Map<string, any[]>();
  for (const material of materiales) {
    const values = materialByLine.get(material.linea_id) || [];
    values.push({ descripcion: text(material.descripcion, 120), cantidad: material.cantidad, unidad: text(material.unidad, 24) });
    materialByLine.set(material.linea_id, values);
  }
  return {
    hallazgos: hallazgos.slice(0, 40).map(item => ({
      componente: text(item.componente_parte, 100),
      dano: text(labels.get(`tipo_dano:${item.tipo_dano_codigo}`) || item.tipo_dano_codigo, 80),
      causa: text(labels.get(`causa_probable:${item.causa_probable_codigo}`) || item.causa_probable_codigo, 80),
      condicion: text(condiciones[item.condicion] || item.condicion, 40),
      riesgo: text(riesgos[item.riesgo] || item.riesgo, 60),
      prioridad: text(item.prioridad_efectiva || item.prioridad_override || item.prioridad_calculada, 16),
      accion_recomendada: text(acciones[item.accion_recomendada] || item.accion_recomendada, 60),
      observacion: text(item.observacion, 300),
    })),
    trabajos: lineas.slice(0, 60).map(item => ({
      familia: text(item.familia_nombre, 80), actividad: text(item.actividad_nombre, 80),
      tarea: text(item.tarea_nombre, 100), hallazgo: text(item.hallazgo, 300),
      cargo: text(item.cargo_nombre, 80), repuestos: (materialByLine.get(item.id) || []).slice(0, 20),
    })),
  };
}

export function sanearConclusion(value: unknown) {
  let result = String(value ?? '').replace(/```[\s\S]*?\n|```/g, '').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*|__(.*?)__/g, '$1$2').replace(/\*(.*?)\*|_(.*?)_/g, '$1$2').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
  if (result.length > 800) {
    const part = result.slice(0, 800);
    const sentence = part.search(/[.!?](?:\s|$)(?![\s\S]*[.!?](?:\s|$))/);
    result = sentence >= 500 ? part.slice(0, sentence + 1).trim() : part.trimEnd();
  }
  return result;
}

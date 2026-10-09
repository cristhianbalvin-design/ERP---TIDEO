const CONDITION_LABELS = {
  conforme: 'Conforme',
  desgaste_aceptable: 'Desgaste aceptable',
  fuera_de_tolerancia: 'Fuera de tolerancia',
  falla_funcional: 'Falla funcional',
};

const ACTION_LABELS = {
  reutilizar: 'Reutilizar',
  reparar: 'Reparar',
  reemplazar: 'Reemplazar',
  fabricar_nuevo: 'Fabricar nuevo',
  monitorear: 'Monitorear',
};

const labelFor = (catalogs, catalog, code) =>
  catalogs?.[catalog]?.find(option => option.codigo === code)?.etiqueta || code || '';

export function construirResumenDiagnostico(hallazgos = [], lineas = [], tipos = [], catalogs = {}) {
  if (!hallazgos.length) return '';

  const findings = hallazgos.map(item => {
    const component = String(item.componente_parte || '').trim();
    const damage = labelFor(catalogs, 'tipo_dano', item.tipo_dano_codigo);
    const condition = CONDITION_LABELS[item.condicion] || item.condicion || '';
    const state = [damage, condition].filter(Boolean).join(' · ');
    const cause = labelFor(catalogs, 'causa_probable', item.causa_probable_codigo);
    const action = ACTION_LABELS[item.accion_recomendada] || item.accion_recomendada || '';
    return `${component}: ${state}${cause ? ` por ${cause}` : ''}${action ? ` — ${action}` : ''}`;
  }).filter(sentence => sentence !== ': ').sort((a, b) => a.localeCompare(b, 'es'));

  const typeNames = new Map(tipos.map(type => [type.id, type.nombre]));
  const taskNames = [...new Set(lineas
    .map(line => typeNames.get(line.tarea_id) || line.tarea_nombre || '')
    .map(name => String(name).trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const uniqueFindings = [...new Set(findings)];
  if (taskNames.length) uniqueFindings.push(`Trabajos a realizar: ${taskNames.join(', ')}.`);
  return uniqueFindings.join(' ');
}

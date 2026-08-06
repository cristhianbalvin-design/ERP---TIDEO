const nombreSociedad = (sociedadId, sociedades = []) => {
  const sociedad = sociedades.find(item => item.id === sociedadId);
  if (!sociedad) return sociedadId || 'sin sociedad';
  return `${sociedad.codigo ? `${sociedad.codigo} - ` : ''}${sociedad.nombre}`;
};

// Los orígenes deben llegar en el mismo orden de precedencia usado al guardar.
export function resolverSociedadDestino({ origenes = [], sociedades = [], mensajeSinOrigen } = {}) {
  const seleccionados = origenes.filter(origen => origen?.seleccionado);
  const resueltos = seleccionados.filter(origen => origen.sociedadId);
  const sociedadesDistintas = [...new Set(resueltos.map(origen => origen.sociedadId))];

  if (sociedadesDistintas.length > 1) {
    const detalle = resueltos
      .map(origen => `${origen.label} pertenece a ${nombreSociedad(origen.sociedadId, sociedades)}`)
      .join('; ');
    return {
      sociedadId: null,
      conflictMessage: `Conflicto de sociedades: ${detalle}. Corrige los documentos de origen antes de guardar.`,
      emptyMessage: '',
    };
  }

  const origenPrecedente = seleccionados[0];
  if (origenPrecedente && !origenPrecedente.sociedadId) {
    return {
      sociedadId: null,
      conflictMessage: '',
      emptyMessage: `${origenPrecedente.label} no tiene sociedad. El registro quedará sin sociedad si continúas.`,
    };
  }

  if (origenPrecedente?.sociedadId) {
    return { sociedadId: origenPrecedente.sociedadId, conflictMessage: '', emptyMessage: '' };
  }

  return {
    sociedadId: null,
    conflictMessage: '',
    emptyMessage: mensajeSinOrigen || 'No hay un documento de origen con sociedad. El registro quedará sin sociedad si continúas.',
  };
}

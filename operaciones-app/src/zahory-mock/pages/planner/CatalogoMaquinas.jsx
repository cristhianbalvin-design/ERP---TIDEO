const FAMILIAS = {
  mec: 'Mecanizado',
  rect: 'Rectificado y acabado',
  corte: 'Corte',
  conf: 'Conformado y prensado',
  sold: 'Soldadura y recargue',
  trat: 'Tratamiento térmico y superficial',
  izaje: 'Elevación y manipulación',
  prue: 'Pruebas, hidráulica y medición',
  serv: 'Servicios y utilidades',
};

export function CatalogoMaquinas({
  datos,
  puestos,
  query,
  familia,
  ubicacion,
  onSetQuery,
  onSetFamilia,
  onSetUbicacion,
  onChoose,
  onClose,
}) {
  const tipos = (datos.tipos || []).filter(tipo => {
    const texto = `${tipo.nombre} ${tipo.clave} ${tipo.familia} ${tipo.descripcion || ''}`;
    return texto.toLowerCase().includes(query.toLowerCase())
      && (familia === 'todas' || tipo.familia === familia);
  });
  const ubicaciones = datos.bahias.flatMap(bahia => [
    [`${bahia.id}|`, `${bahia.nombre} · Bahía completa`],
    ...puestos
      .filter(puesto => puesto.bahia_id === bahia.id)
      .map(puesto => [
        `${bahia.id}|${puesto.id}`,
        `${bahia.nombre} · ${puesto.nombre || puesto.codigo}`,
      ]),
  ]);
  return (
    <div className="dx-planner-scrim">
      <section
        className="dx-planner-modal dx-ui-card dx-planner-catalog"
        role="dialog"
        aria-modal="true"
      >
        <div className="dx-ui-toolbar">
          <div>
            <span className="dx-ui-eyebrow">Catálogo maestro</span>
            <h2>Selecciona un tipo de máquina</h2>
          </div>
          <button className="dx-planner-close" onClick={onClose}>×</button>
        </div>
        <div className="dx-planner-catalog-filters">
          <input
            aria-label="Buscar catálogo"
            placeholder="Buscar por nombre o uso…"
            value={query}
            onChange={event => onSetQuery(event.target.value)}
          />
          <select value={familia} onChange={event => onSetFamilia(event.target.value)}>
            <option value="todas">Todas las familias</option>
            {Object.entries(FAMILIAS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <label>
            Ubicación de la máquina
            <select value={ubicacion} onChange={event => onSetUbicacion(event.target.value)}>
              {ubicaciones.map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="dx-planner-catalog-grid">
          {tipos.map(tipo => (
            <button key={tipo.clave} onClick={() => onChoose(tipo)}>
              <b>{tipo.nombre}</b>
              <small>{FAMILIAS[tipo.familia] || tipo.familia}</small>
              <span>{tipo.descripcion}</span>
            </button>
          ))}
          {!tipos.length && (
            <div className="dx-ui-empty">No se encontraron tipos con esos filtros.</div>
          )}
        </div>
      </section>
    </div>
  );
}

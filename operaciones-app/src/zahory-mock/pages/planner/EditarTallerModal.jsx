export function EditarTallerModal({
  datos,
  puestos,
  editBahia,
  editPuesto,
  seleccion,
  ubicacion,
  busy,
  onSetBahia,
  onSetPuesto,
  onSetSeleccion,
  onSetUbicacion,
  onSave,
  onClose,
  onOpenCatalog,
}) {
  const titulo = editBahia ? 'Editar bahía' : editPuesto ? 'Editar puesto' : 'Editar máquina';
  return (
    <div className="dx-planner-scrim">
      <section className="dx-planner-modal dx-ui-card" role="dialog" aria-modal="true">
        <div className="dx-ui-toolbar">
          <h2>{titulo}</h2>
          <button className="dx-planner-close" onClick={onClose}>×</button>
        </div>
        {editBahia && (
          <EditarBahia
            bahia={editBahia}
            busy={busy}
            onChange={onSetBahia}
            onSave={onSave}
          />
        )}
        {editPuesto && (
          <EditarPuesto
            datos={datos}
            puesto={editPuesto}
            busy={busy}
            onChange={onSetPuesto}
            onSave={onSave}
          />
        )}
        {seleccion && (
          <EditarMaquina
            datos={datos}
            puestos={puestos}
            maquina={seleccion}
            ubicacion={ubicacion}
            onChange={onSetSeleccion}
            onChangeUbicacion={onSetUbicacion}
            onSave={onSave}
            onOpenCatalog={onOpenCatalog}
          />
        )}
      </section>
    </div>
  );
}

function EditarBahia({ bahia, busy, onChange, onSave }) {
  return (
    <form className="dx-planner-config-body" onSubmit={event => {
      event.preventDefault();
      onSave('bahia', bahia);
    }}>
      <label>Código<input value={bahia.codigo} onChange={event => (
        onChange({ ...bahia, codigo: event.target.value })
      )} /></label>
      <label>Nombre<input value={bahia.nombre} onChange={event => (
        onChange({ ...bahia, nombre: event.target.value })
      )} /></label>
      <label>
        Categoría
        <select value={bahia.categoria} onChange={event => (
          onChange({ ...bahia, categoria: event.target.value })
        )}>
          <option value="general">General</option>
          <option value="pesada">Reparación pesada</option>
          <option value="sold">Soldadura</option>
          <option value="crom">Tratamientos</option>
          <option value="mec">Mecanizado</option>
          <option value="hidr">Hidráulica / banco</option>
        </select>
      </label>
      <button className="dx-btn primary" disabled={busy}>Guardar</button>
    </form>
  );
}

function EditarPuesto({ datos, puesto, busy, onChange, onSave }) {
  return (
    <form className="dx-planner-config-body" onSubmit={event => {
      event.preventDefault();
      onSave('puesto', { ...puesto, capacidad: Number(puesto.capacidad) });
    }}>
      <label>
        Bahía
        <select value={puesto.bahia_id} onChange={event => (
          onChange({ ...puesto, bahia_id: event.target.value })
        )}>
          {datos.bahias.map(bahia => (
            <option key={bahia.id} value={bahia.id}>{bahia.nombre}</option>
          ))}
        </select>
      </label>
      <label>Código<input value={puesto.codigo} onChange={event => (
        onChange({ ...puesto, codigo: event.target.value })
      )} /></label>
      <label>Nombre<input value={puesto.nombre || ''} onChange={event => (
        onChange({ ...puesto, nombre: event.target.value })
      )} /></label>
      <label>Capacidad<input
        type="number"
        min="1"
        max="6"
        value={puesto.capacidad}
        onChange={event => onChange({ ...puesto, capacidad: event.target.value })}
      /></label>
      <button className="dx-btn primary" disabled={busy}>Guardar</button>
    </form>
  );
}

function EditarMaquina({
  datos,
  puestos,
  maquina,
  ubicacion,
  onChange,
  onChangeUbicacion,
  onSave,
  onOpenCatalog,
}) {
  function submit(event) {
    event.preventDefault();
    const [bahia_id, puesto_id] = ubicacion.split('|');
    const tipo = datos.tipos.find(item => item.clave === maquina.tipo_clave);
    onSave('maquina', {
      ...maquina,
      bahia_id,
      puesto_id: puesto_id || null,
      tipo_clave: tipo?.clave,
    });
  }
  return (
    <form className="dx-planner-config-body" onSubmit={submit}>
      <label>
        Tipo
        <input value={maquina.tipo_clave} readOnly />
        <button type="button" className="dx-btn" onClick={onOpenCatalog}>
          Cambiar del catálogo
        </button>
      </label>
      <label>
        Bahía y puesto
        <select value={ubicacion} onChange={event => onChangeUbicacion(event.target.value)}>
          {datos.bahias.flatMap(bahia => [
            [`${bahia.id}|`, `${bahia.nombre} · Bahía completa`],
            ...puestos
              .filter(puesto => puesto.bahia_id === bahia.id)
              .map(puesto => [
                `${bahia.id}|${puesto.id}`,
                `${bahia.nombre} · ${puesto.nombre || puesto.codigo}`,
              ]),
          ]).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      <label>Nombre<input value={maquina.nombre} onChange={event => (
        onChange({ ...maquina, nombre: event.target.value })
      )} /></label>
      <button className="dx-btn primary">Guardar máquina</button>
    </form>
  );
}

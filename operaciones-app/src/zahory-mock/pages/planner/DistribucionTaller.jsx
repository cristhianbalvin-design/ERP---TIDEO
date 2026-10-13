const CATEGORIAS = {
  general: 'General',
  pesada: 'Reparación pesada',
  sold: 'Soldadura',
  crom: 'Tratamientos',
  mec: 'Mecanizado',
  hidr: 'Hidráulica / banco',
};

export function DistribucionTaller({
  datos,
  puestos,
  onEditBahia,
  onEditPuesto,
  onEditMaquina,
  onSave,
}) {
  return (
    <section className="dx-ui-card">
      <div className="dx-ui-toolbar"><h2>Distribución del taller</h2></div>
      <div className="dx-planner-bays">
        {datos.bahias.map(bahia => (
          <article key={bahia.id}>
            <h3>
              {bahia.nombre}
              <span>{CATEGORIAS[bahia.categoria] || bahia.categoria}</span>
            </h3>
            <AccionesBahia bahia={bahia} onEdit={onEditBahia} onSave={onSave} />
            <p>
              {puestos.filter(item => item.bahia_id === bahia.id).length} puestos ·
              {' '}{maquinasActivas(datos, bahia.id).length} máquinas
            </p>
            <ul>
              {puestos.filter(item => item.bahia_id === bahia.id).map(puesto => (
                <PuestoFila
                  key={puesto.id}
                  puesto={puesto}
                  onEdit={onEditPuesto}
                  onSave={onSave}
                />
              ))}
              {maquinasActivas(datos, bahia.id).map(maquina => (
                <MaquinaFila
                  key={maquina.id}
                  maquina={maquina}
                  puestos={puestos}
                  onEdit={onEditMaquina}
                  onSave={onSave}
                />
              ))}
            </ul>
          </article>
        ))}
        {!datos.bahias.length && (
          <div className="dx-ui-empty">No hay bahías activas. Crea una para armar el taller.</div>
        )}
      </div>
    </section>
  );
}

function maquinasActivas(datos, bahiaId) {
  return datos.maquinas.filter(maquina => (
    maquina.bahia_id === bahiaId && maquina.estado !== 'baja'
  ));
}

function AccionesBahia({ bahia, onEdit, onSave }) {
  return (
    <div className="dx-planner-config-actions">
      <button className="dx-btn" onClick={() => onEdit({ ...bahia })}>Editar bahía</button>
      <button className="dx-btn" onClick={() => onSave('desactivarBahia', bahia.id)}>
        Desactivar
      </button>
    </div>
  );
}

function PuestoFila({ puesto, onEdit, onSave }) {
  const { bahia, ...campos } = puesto;
  return (
    <li>
      {puesto.nombre || puesto.codigo} · capacidad {puesto.capacidad}
      {' '}<button onClick={() => onEdit(campos)}>Editar</button>
      {' '}<button onClick={() => onSave('desactivarPuesto', puesto.id)}>Desactivar</button>
    </li>
  );
}

function MaquinaFila({ maquina, puestos, onEdit, onSave }) {
  const puesto = puestos.find(item => item.id === maquina.puesto_id);
  return (
    <li>
      {maquina.nombre} · {maquina.horas_dia} h/día · {puesto?.nombre || 'Bahía completa'}
      {' '}<button onClick={() => onEdit(maquina)}>Editar ubicación / tipo</button>
      {' '}<button onClick={() => onSave('maquina', { ...maquina, estado: 'baja' })}>
        Retirar
      </button>
    </li>
  );
}

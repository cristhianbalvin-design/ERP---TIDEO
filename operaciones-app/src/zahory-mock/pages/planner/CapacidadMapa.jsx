const COLORES = ['var(--dx-ui-cyan)', 'var(--dx-ui-amber-fg)', 'var(--dx-ui-red-fg)'];

export function CapacidadMapa({ datos, mapa, onSelect }) {
  return (
    <div className="dx-planner-heat-wrap">
      <div className="dx-planner-heat">
        <div className="dx-planner-heat-head">Recurso</div>
        {mapa[0]?.dias.map(dia => (
          <div className="dx-planner-heat-head" key={dia.fecha}>
            {new Date(`${dia.fecha}T12:00:00`).toLocaleDateString('es-PE', {
              weekday: 'short',
              day: 'numeric',
            })}
          </div>
        ))}
        {mapa.map(recurso => (
          <FilaCalor
            key={recurso.id}
            datos={datos}
            recurso={recurso}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function FilaCalor({ datos, recurso, onSelect }) {
  const fuente = recurso.tipo === 'persona' ? datos.asignaciones : datos.equipos;
  const campoId = recurso.tipo === 'persona' ? 'tecnico_id' : 'maquina_id';
  const asignaciones = fuente.filter(item => item[campoId] === recurso.id);
  return (
    <div className="dx-planner-heat-row">
      <button onClick={() => onSelect({ recurso: { ...recurso, asignaciones } })}>
        <b>{recurso.nombre}</b><small>{recurso.especialidad}</small>
      </button>
      {recurso.dias.map(dia => <CeldaCalor key={dia.fecha} recurso={recurso} dia={dia} />)}
    </div>
  );
}

function CeldaCalor({ recurso, dia }) {
  const porcentaje = dia.capacidad ? dia.horas / dia.capacidad : 0;
  const color = COLORES[porcentaje >= 1 ? 2 : porcentaje >= 0.75 ? 1 : 0];
  const estilo = {
    '--heat': color,
    '--load': `${Math.min(100, porcentaje * 100)}%`,
  };
  return (
    <button
      className="dx-planner-heat-cell"
      title={`${recurso.nombre}: ${dia.horas} de ${dia.capacidad} h · ${dia.fecha}`}
      style={estilo}
    >
      <b>{Math.round(porcentaje * 100)}%</b>
      <span>{dia.horas}/{dia.capacidad} h</span>
    </button>
  );
}

import { analizarCuellos, calcularPronostico, esOtPlanificable } from './plannerEngine.js';
import { agruparPorOS, construirMapaCalor } from './plannerLogic.js';
import { Inspector } from './Inspector.jsx';
import { CapacidadMapa } from './CapacidadMapa.jsx';

const fecha = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-PE')
  : 'Por calcular';


export function PanelView({
  datos,
  ots,
  seleccionada,
  recursoSeleccionado,
  onSelect,
  onPlanificar,
  busqueda,
  setBusqueda,
  recursos,
}) {
  const planificables = ots.filter(esOtPlanificable);
  const recursosCalc = recursos || {
    personas: Math.max(1, datos.personas.length),
    maquinas: Math.max(1, datos.maquinas.length),
    horasMaquinaDia: 8,
  };
  const mapa = construirMapaCalor({
    ...datos,
    inicio: new Date().toISOString().slice(0, 10),
    dias: 10,
  });
  const grupos = agruparPorOS(ots.filter(ot => (
    `${ot.numero || ot.id} ${ot.descripcion || ''}`.toLowerCase().includes(busqueda.toLowerCase())
  )));
  const conRiesgo = grupos.filter(grupo => grupo.ots.some(ot => {
    if (!esOtPlanificable(ot)) return false;
    const pronostico = calcularPronostico(ot, recursosCalc);
    return pronostico.conservadora.fechaFin
      && ot.orden_servicio?.fecha_fin
      && pronostico.conservadora.fechaFin > ot.orden_servicio.fecha_fin;
  }));
  const pendientes = planificables.filter(ot => (
    !datos.asignaciones.some(asignacion => asignacion.ot_id === ot.id)
      && !datos.equipos.some(asignacion => asignacion.ot_id === ot.id)
  ));
  const cuellos = analizarCuellos(ots, datos);

  return (
    <>
      <ResumenPanel
        riesgos={conRiesgo.length}
        planificables={planificables.length}
        personas={datos.personas.length}
        critico={cuellos.critico}
      />
      {cuellos.impacto.length > 0 && (
        <section className="dx-planner-alert-banner" role="status">
          <b>Cuello de botella: {cuellos.critico?.nombre}</b>
          <span>{cuellos.critico?.diasEspera} días acumulados de espera.</span>
        </section>
      )}
      <div className="dx-planner-layout">
        <div className="dx-planner-main-stack">
          <CapacidadPanel
            datos={datos}
            mapa={mapa}
            cuellos={cuellos}
            onSelect={onSelect}
          />
          <OrdenesPanel
            grupos={grupos}
            recursos={recursosCalc}
            seleccionada={seleccionada}
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            onSelect={onSelect}
          />
        </div>
        <aside className="dx-planner-side-stack">
          <BandejaPlanificacion pendientes={pendientes} onPlanificar={onPlanificar} />
          <Inspector
            ot={seleccionada}
            recurso={recursoSeleccionado}
            recursos={recursos}
            onPlanificar={onPlanificar}
          />
        </aside>
      </div>
    </>
  );
}

function ResumenPanel({ riesgos, planificables, personas, critico }) {
  return (
    <section className="dx-ui-summary" aria-label="Resumen del plan">
      <ResumenChip valor={riesgos} etiqueta="OS con compromiso en riesgo" />
      <ResumenChip valor={planificables} etiqueta="OT planificables" />
      <ResumenChip valor={personas} etiqueta="personas disponibles" />
      <ResumenChip valor={critico?.nombre || 'Ninguno'} etiqueta="Cuello de botella principal" />
    </section>
  );
}

function ResumenChip({ valor, etiqueta }) {
  return <div className="dx-ui-chip"><b>{valor}</b><span>{etiqueta}</span></div>;
}

function CapacidadPanel({ datos, mapa, cuellos, onSelect }) {
  return (
    <section className="dx-ui-card" aria-labelledby="planner-cap-title">
      <div className="dx-ui-toolbar">
        <h2 id="planner-cap-title">Plan por capacidad</h2>
        <span className="dx-ui-count">Carga de trabajo por recurso y día</span>
      </div>
      {mapa.length
        ? <CapacidadMapa datos={datos} mapa={mapa} onSelect={onSelect} />
        : <div className="dx-ui-empty">No hay recursos activos para calcular la capacidad.</div>}
      <div className="dx-planner-bottlenecks">
        <h3>Alertas de capacidad</h3>
        {cuellos.esperas.length
          ? cuellos.esperas.map(espera => (
            <p key={`${espera.otId}-${espera.recursoId}`}>
              <b>OT {espera.otNumero}</b> espera {espera.diasEspera} días.
              {' '}Causa: {espera.causa}; disponible {fecha(espera.fechaDisponible)}.
            </p>
          ))
          : <p>Sin esperas registradas por recurso o puesto.</p>}
      </div>
    </section>
  );
}

function OrdenesPanel({ grupos, recursos, seleccionada, busqueda, setBusqueda, onSelect }) {
  return (
    <section className="dx-ui-card">
      <div className="dx-ui-toolbar">
        <h2>Plan por OS</h2>
        <label className="dx-ui-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Buscar OT"
            value={busqueda}
            onChange={event => setBusqueda(event.target.value)}
            placeholder="Buscar OT…"
          />
        </label>
      </div>
      {grupos.length
        ? grupos.map(grupo => (
          <GrupoOrden
            key={grupo.id}
            grupo={grupo}
            recursos={recursos}
            seleccionada={seleccionada}
            onSelect={onSelect}
          />
        ))
        : <div className="dx-ui-empty">No hay OTs que coincidan con la búsqueda.</div>}
    </section>
  );
}

function GrupoOrden({ grupo, recursos, seleccionada, onSelect }) {
  const compromisos = grupo.ots
    .map(ot => ot.orden_servicio?.fecha_fin)
    .filter(Boolean)
    .sort();
  const riesgos = grupo.ots.some(ot => {
    if (!esOtPlanificable(ot)) return false;
    const pronostico = calcularPronostico(ot, recursos);
    return pronostico.conservadora.fechaFin
      && ot.orden_servicio?.fecha_fin
      && pronostico.conservadora.fechaFin > ot.orden_servicio.fecha_fin;
  });
  const cerradas = grupo.ots.every(ot => !esOtPlanificable(ot));
  return (
    <article className="dx-planner-os">
      <header>
        <b>{grupo.orden?.numero || (grupo.id === 'sin-os' ? 'OT sin orden de servicio' : `OS ${grupo.id}`)}</b>
        <span>
          Compromiso {fecha(compromisos[0])} · {grupo.ots.length} OT ·
          {' '}<i className={cerradas ? 'is-safe' : riesgos ? 'is-risk' : 'is-safe'}>
            {cerradas ? 'Cerrada' : riesgos ? 'En riesgo' : 'A tiempo'}
          </i>
        </span>
      </header>
      {grupo.ots.map(ot => (
        <FilaOrden
          key={ot.id}
          ot={ot}
          recursos={recursos}
          seleccionada={seleccionada}
          onSelect={onSelect}
        />
      ))}
    </article>
  );
}

function FilaOrden({ ot, recursos, seleccionada, onSelect }) {
  const pronostico = calcularPronostico(ot, recursos);
  const cerrada = !esOtPlanificable(ot);
  return (
    <button
      className={`dx-planner-ot ${seleccionada?.id === ot.id ? 'is-selected' : ''}`}
      onClick={() => onSelect({ ot })}
    >
      <span>
        <b>OT {ot.numero || ot.id}</b>
        <small>{ot.descripcion || ot.servicio || 'Orden de trabajo'} · {ot.ot_tareas?.length || 0} tareas</small>
      </span>
      <span className="dx-planner-hours">{pronostico.totalHoras} h</span>
      <span><small>Fecha probable P50</small><b>{fecha(pronostico.p50.fechaFin)}</b></span>
      <span><small>Conservadora</small><b>{fecha(pronostico.conservadora.fechaFin)}</b></span>
      <span className={`dx-ui-pill ${cerrada ? 'is-safe' : 'is-green'}`}>
        <i />{cerrada ? 'Cerrada' : 'A tiempo'}
      </span>
    </button>
  );
}

function BandejaPlanificacion({ pendientes, onPlanificar }) {
  return (
    <section className="dx-ui-card">
      <div className="dx-ui-toolbar">
        <h2>Bandeja de OTs sin planificar</h2>
        <span className="dx-ui-count">{pendientes.length}</span>
      </div>
      {pendientes.length
        ? pendientes.map(ot => (
          <div className="dx-planner-tray-row" key={ot.id}>
            <span>
              <b>OT {ot.numero || ot.id}</b>
              <small>
                {ot.descripcion || ot.servicio || 'Sin descripción'} · {ot.ot_tareas.length} tareas
              </small>
            </span>
            <button className="dx-btn primary" onClick={() => onPlanificar(ot)}>Planificar</button>
          </div>
        ))
        : <div className="dx-ui-empty">
          Todas las OTs planificables tienen al menos una asignación.
        </div>}
    </section>
  );
}

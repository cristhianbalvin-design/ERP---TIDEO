import { PanelView } from './PanelView.jsx';
import { BoardView } from './BoardView.jsx';
import { Configurator } from './Configurator.jsx';
import { GemeloView } from './gemelo3d/GemeloView.jsx';

export function PlannerHeader({ vista, permiteEscritura, onChangeVista, onSimulate, onPlanificar }) {
  const tabs = [
    ['panel', 'Panel'],
    ['tablero', 'Tablero'],
    ['3d', 'Gemelo 3D'],
    ['config', 'Configurador'],
  ];
  return (
    <>
      <header className="dx-ui-head-page">
        <div>
          <span className="dx-ui-eyebrow">Taller &amp; Operaciones</span>
          <h1 className="dx-ui-title">Planner</h1>
          <p className="dx-ui-sub">
            Capacidad finita, fechas calculadas y recursos del taller en un solo lugar.
          </p>
        </div>
        <div className="dx-planner-actions">
          <button
            className="dx-btn"
            disabled={!permiteEscritura}
            onClick={() => onChangeVista('config')}
          >
            Configurar taller
          </button>
          <button className="dx-btn" disabled={!permiteEscritura} onClick={onSimulate}>Simular OT urgente</button>
          <button
            className="dx-btn primary"
            disabled={!permiteEscritura}
            onClick={() => onPlanificar(null)}
          >
            Planificar OT
          </button>
        </div>
      </header>
      <nav className="dx-planner-tabs" role="tablist" aria-label="Vistas del Planner">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={vista === id}
            onClick={() => onChangeVista(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}

export function PlannerVistas({
  vista,
  datos,
  ots,
  recursos,
  seleccion,
  undo,
  guardando,
  busqueda,
  onBusqueda,
  onSelect,
  onPlanificar,
  onMoveDate,
  onMoveOT,
  onUndo,
  onSaveConfig,
  permiteEscritura,
  onVerEnTablero,
}) {
  if (vista === 'panel') {
    return (
      <PanelView
        datos={datos}
        permiteEscritura={permiteEscritura}
        ots={ots}
        seleccionada={seleccion.ot}
        recursoSeleccionado={seleccion.recurso}
        recursos={recursos}
        onSelect={onSelect}
        onPlanificar={onPlanificar}
        busqueda={busqueda}
        setBusqueda={onBusqueda}
      />
    );
  }
  if (vista === 'tablero') {
    return (
      <BoardView
        datos={datos}
        permiteEscritura={permiteEscritura}
        onSelect={onSelect}
        onMoveDate={onMoveDate}
        onMoveOT={onMoveOT}
        undoDisponible={Boolean(undo)}
        onUndo={onUndo}
      />
    );
  }
  if (vista === 'config') {
    return <Configurator
      datos={datos}
      onSave={onSaveConfig}
      busy={guardando}
      permiteEscritura={permiteEscritura}
    />;
  }
  if (vista === '3d') return <GemeloView datos={datos} onVerEnTablero={onVerEnTablero} />;
  return null;
}

export function CargandoPlanner() {
  return (
    <div className="dx-ui-card dx-ui-empty" role="status">
      Cargando bahías, equipos, personal y órdenes…
    </div>
  );
}

export function SinBahias({ onConfigure }) {
  return (
    <div className="dx-ui-card dx-ui-empty">
      <h2>Configura tu taller para comenzar</h2>
      <p>Aún no hay bahías activas para esta sociedad.</p>
      <button className="dx-btn primary" onClick={onConfigure}>Configurar taller</button>
    </div>
  );
}

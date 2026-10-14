import { PanelView } from './PanelView.jsx';
import { BoardView } from './BoardView.jsx';
import { GemeloView } from './gemelo3d/GemeloView.jsx';

const ICONOS = {
  panel: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  tablero: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>,
  '3d': <><path d="M12 3l9 5v8l-9 5-9-5V8z" /><path d="M12 12l9-4M12 12v9M12 12L3 8" /></>,
};

export function PlannerHeader({
  vista, subtitulo, permiteEscritura, ocupado = false, undoDisponible = false, simulando = false,
  onChangeVista, onUndo = () => {}, onConfigurar, onSimulate, onPlanificar,
}) {
  const tabs = [['panel', 'Panel'], ['tablero', 'Tablero'], ['3d', 'Gemelo 3D']];
  return (
    <header className="dx-pl-hd">
      <div>
        <div className="dx-pl-eyebrow">Taller &amp; Operaciones</div>
        <h1>Planner</h1>
        <p className="dx-pl-sub">{subtitulo}</p>
      </div>
      <div className="dx-pl-acts">
        <div className="dx-pl-seg" role="tablist" aria-label="Vista del plan">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id} disabled={ocupado} onClick={() => onChangeVista(id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{ICONOS[id]}</svg>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="dx-pl-btn" disabled={!permiteEscritura || !undoDisponible || ocupado} onClick={onUndo}>Deshacer</button>
        <button type="button" className="dx-pl-btn is-ghost" disabled={!permiteEscritura || ocupado} onClick={onConfigurar || (() => onChangeVista('config'))}>
          Configurar taller
        </button>
        <button type="button" className="dx-pl-btn is-warn" disabled={!permiteEscritura || ocupado} onClick={onSimulate}>
          {simulando ? 'Quitar OT urgente' : 'Simular OT urgente'}
        </button>
        <button type="button" className="dx-pl-btn is-pri" disabled={!permiteEscritura || ocupado || simulando} onClick={() => onPlanificar(null)}>
          Planificar OT
        </button>
      </div>
    </header>
  );
}

export function PlannerVistas({
  vista, datos, modelo, seleccion, busqueda, onBusqueda, onSelect, onPlanificar, permiteEscritura,
  onMoverBloque, onMoverUnidad, onConfigurar, onVerEnTablero,
}) {
  if (vista === 'panel') {
    return (
      <PanelView
        datos={datos}
        modelo={modelo}
        seleccion={seleccion}
        busqueda={busqueda}
        setBusqueda={onBusqueda}
        onSelect={onSelect}
        onPlanificar={onPlanificar}
        permiteEscritura={permiteEscritura}
      />
    );
  }
  if (vista === 'tablero') {
    return (
      <BoardView
        datos={datos}
        modelo={modelo}
        seleccion={seleccion}
        permiteEscritura={permiteEscritura}
        onSelect={onSelect}
        onMoverBloque={onMoverBloque}
        onMoverUnidad={onMoverUnidad}
        onConfigurar={onConfigurar}
      />
    );
  }
  if (vista === '3d') {
    return (
      <GemeloView
        datos={datos}
        cargos={modelo.cargos}
        onVerEnTablero={onVerEnTablero}
        onSelectOT={ot => onSelect({ ot })}
      />
    );
  }
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

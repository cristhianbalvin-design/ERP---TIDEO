import { useEffect, useMemo, useRef, useState } from 'react';
import { colorUtilizacion, mapearEscena } from './sceneModel.js';
import { leerTokens } from './scene.js';

const FECHA_HOY = () => {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
};
const sumarDia = (date, days) => {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};
const fechaCorta = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
const CATEGORIAS = { general: 'General', pesada: 'Pesada', sold: 'Soldadura', crom: 'Cromado', mec: 'Mecánica', hidr: 'Hidráulica' };

export function GemeloView({ datos, importarThree = () => import('three') }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const [dia, setDia] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [mostrarTextos, setMostrarTextos] = useState(false);
  const [errorWebGL, setErrorWebGL] = useState(false);
  const [movimientoReducido] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [tooltip, setTooltip] = useState(null);
  const [capas, setCapas] = useState({ categorias: {}, objetos: { maquinas: true, personas: true, componentes: true } });
  const hoy = useMemo(FECHA_HOY, []);
  const fecha = sumarDia(hoy, dia);
  const escena = useMemo(() => mapearEscena(datos, fecha), [datos, fecha]);
  const fechas = useMemo(() => Array.from({ length: 10 }, (_, index) => sumarDia(hoy, index)), [hoy]);

  useEffect(() => {
    let activo = true;
    let observer;
    const host = hostRef.current;
    setErrorWebGL(false);
    importarThree().then(async THREE => {
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      if (!activo || !host) return;
      import('./scene.js').then(({ crearEscena, leerTokens: tokensDeEscena }) => {
        if (!activo) return;
        const session = crearEscena(THREE, OrbitControls, host, escena, tokensDeEscena(host.closest('.dx-ui') || host), {
          onError: () => activo && setErrorWebGL(true),
          onTooltip: setTooltip,
        });
        if (!session) { setErrorWebGL(true); return; }
        sceneRef.current = session;
        session.setLayers(capas);
        session.setLabels(mostrarTextos);
        const root = host.closest('.dx-ui') || host;
        observer = new MutationObserver(() => session.updateTheme(tokensDeEscena(root)));
        observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      }).catch(() => activo && setErrorWebGL(true));
    }).catch(() => activo && setErrorWebGL(true));
    return () => {
      activo = false;
      observer?.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setTooltip(null);
    };
  }, [escena]);

  useEffect(() => { sceneRef.current?.setLayers(capas); }, [capas]);
  useEffect(() => { sceneRef.current?.setLabels(mostrarTextos); }, [mostrarTextos]);
  useEffect(() => {
    if (!reproduciendo || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setDia(current => (current + 1) % fechas.length), 1400);
    return () => window.clearInterval(timer);
  }, [reproduciendo, fechas.length]);

  function cambiarCapa(grupo, clave, value) {
    setCapas(current => ({ ...current, [grupo]: { ...current[grupo], [clave]: value } }));
  }
  const otList = items => items.map(item => item.numero || item.id).join(', ') || 'Sin OT asignadas';

  return (
    <section className="dx-ui-card dx-planner-3d" aria-labelledby="planner-3d-title">
      <div className="dx-planner-3d-heading">
        <div><h2 id="planner-3d-title">Gemelo digital · taller, puestos y personal</h2><p>Vista de solo lectura del plan del día seleccionado.</p></div>
        <label className="dx-planner-3d-date">Día del plan
          <select value={dia} onChange={event => { setDia(Number(event.target.value)); setReproduciendo(false); }}>
            {fechas.map((value, index) => <option key={value} value={index}>{fechaCorta(value)}</option>)}
          </select>
        </label>
        <button className="dx-btn" type="button" disabled={movimientoReducido} onClick={() => setReproduciendo(value => !value)} aria-pressed={reproduciendo}>
          {reproduciendo ? 'Pausar' : 'Reproducir'}
        </button>
        {movimientoReducido && <small>La reproducción está desactivada por la preferencia de movimiento reducido.</small>}
      </div>
      <div className="dx-planner-3d-stage" ref={hostRef}>
        {errorWebGL && <div className="dx-planner-3d-fallback" role="status">Tu navegador no pudo iniciar la vista 3D. El tablero muestra el mismo plan.</div>}
        <div className="dx-planner-3d-tip" aria-hidden="true">Arrastra para girar · rueda o pellizco para acercar</div>
        <aside className="dx-planner-3d-legend" aria-label="Capas de la escena">
          <b>Capas</b>
          <fieldset><legend>Bahías por categoría</legend>{Object.entries(CATEGORIAS).map(([category, label]) => (
            <label key={category}><input type="checkbox" checked={capas.categorias[category] !== false} onChange={event => cambiarCapa('categorias', category, event.target.checked)} />{label}</label>
          ))}</fieldset>
          <fieldset><legend>Objetos</legend>{[['maquinas', 'Máquinas'], ['personas', 'Personal'], ['componentes', 'Componentes']].map(([key, title]) => (
            <label key={key}><input type="checkbox" checked={capas.objetos[key]} onChange={event => cambiarCapa('objetos', key, event.target.checked)} />{title}</label>
          ))}</fieldset>
          <label><input type="checkbox" checked={mostrarTextos} onChange={event => setMostrarTextos(event.target.checked)} />Mostrar textos</label>
          <small>Pasa el cursor sobre una bahía, persona o máquina para ver su detalle.</small>
        </aside>
        {tooltip && <div className="dx-planner-3d-tooltip" style={{ left: Math.min(tooltip.x + 12, 190), top: Math.max(tooltip.y - 12, 10) }} role="status">
          <b>{tooltip.data.nombre || tooltip.data.codigo || tooltip.data.numero}</b>
          <span>{tooltip.kind === 'bahia' ? `Carga: ${tooltip.data.horas} / ${tooltip.data.capacidad} h · ${Math.round(tooltip.data.utilizacion * 100)}%` : tooltip.kind === 'persona' ? `${tooltip.data.cargo || tooltip.data.especialidad || 'Personal'} · ${tooltip.data.horas} h` : tooltip.kind === 'maquina' ? `${tooltip.data.tipo?.nombre || tooltip.data.tipo_clave} · ${tooltip.data.estado} · ${escena.bahias.find(item => item.id === tooltip.data.bahia_id)?.nombre || 'Sin bahía'}` : 'Componente del equipo asignado'}</span>
          <span>OT: {otList(tooltip.data.ots || [])}</span>
        </div>}
        <div className="dx-planner-3d-hud"><span>{fechaCorta(fecha)} · {escena.bahias.length} bahías · {escena.personas.length} personas</span>
          <div className="dx-planner-3d-legend-key"><span className="is-green" /> &lt;75% <span className="is-amber" /> 75–89% <span className="is-red" /> ≥90%</div>
        </div>
      </div>
      <details className="dx-planner-3d-summary"><summary>Resumen textual del día</summary>
        <ul>{escena.bahias.map(bahia => <li key={bahia.id}><b>{bahia.nombre}</b>: {bahia.horas} de {bahia.capacidad} h ({Math.round(bahia.utilizacion * 100)}%); {bahia.ots.length ? `OT ${otList(bahia.ots)}` : 'sin OT asignadas'}.</li>)}</ul>
      </details>
    </section>
  );
}

export { colorUtilizacion };

import { useEffect, useMemo, useRef, useState } from 'react';
import { colorUtilizacion, crearDetalleSeleccion, mapearEscena } from './sceneModel.js';
import { leerTokens } from './scene.js';
import { generarDatosEjemplo } from './exampleData.js';

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

export function GemeloView({ datos, importarThree = () => import('three'), onVerEnTablero = () => {} }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const [dia, setDia] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [mostrarTextos, setMostrarTextos] = useState(false);
  const [errorWebGL, setErrorWebGL] = useState(false);
  const [movimientoReducido] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [tooltip, setTooltip] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [zoomHint, setZoomHint] = useState(false);
  const [ejemploActivo, setEjemploActivo] = useState(false);
  const [capasPlegadas, setCapasPlegadas] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 1099px)').matches);
  const [capas, setCapas] = useState({ categorias: {}, objetos: { maquinas: true, personas: true, componentes: true, equipos: true } });
  function elegirSeleccion(value) {
    setSeleccion(value);
    sceneRef.current?.setSelection(value);
  }
  const hoy = useMemo(FECHA_HOY, []);
  const fecha = sumarDia(hoy, dia);
  const datosEscena = useMemo(() => ejemploActivo ? generarDatosEjemplo(hoy) : datos, [ejemploActivo, hoy, datos]);
  const escena = useMemo(() => mapearEscena(datosEscena, fecha, hoy), [datosEscena, fecha, hoy]);
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
          onSelect: value => {
            setTooltip(null);
            if (value?.kind === 'dia') {
              const index = fechas.indexOf(value.data.fecha);
              if (index >= 0) setDia(index);
            } else elegirSeleccion(value);
          },
          onZoomHint: () => { if (activo && typeof window !== 'undefined') { setZoomHint(true); window.clearTimeout(host._zoomHintTimer); host._zoomHintTimer = window.setTimeout(() => setZoomHint(false), 1800); } },
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
      if (typeof window !== 'undefined') window.clearTimeout(host?._zoomHintTimer);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setTooltip(null);
    };
  }, [escena, fechas]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const cerrar = event => { if (event.key === 'Escape') elegirSeleccion(null); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, []);

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
  const detalle = seleccion ? crearDetalleSeleccion(seleccion.kind, seleccion.data, escena) : null;
  const seleccionarDesdeLista = (kind, data) => elegirSeleccion({ kind, data });

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
        <button className="dx-btn" type="button" onClick={() => setEjemploActivo(value => !value)}>{ejemploActivo ? 'Volver a mis datos' : 'Ver con datos de ejemplo'}</button>
        <button className="dx-btn" type="button" onClick={() => sceneRef.current?.centerView()}>Centrar vista</button>
        {movimientoReducido && <small>La reproducción está desactivada por la preferencia de movimiento reducido.</small>}
      </div>
      {ejemploActivo && <div className="dx-planner-3d-sample-banner" role="status"><b>Datos de ejemplo: no es tu taller</b><button className="dx-btn" type="button" onClick={() => setEjemploActivo(false)}>Volver a los datos reales</button></div>}
      <div className="dx-planner-3d-stage" ref={hostRef}>
        {errorWebGL && <div className="dx-planner-3d-fallback" role="status">Tu navegador no pudo iniciar la vista 3D. El tablero muestra el mismo plan.</div>}
        <div className="dx-planner-3d-tip" aria-live="polite">{zoomHint ? 'Usa Ctrl + rueda para acercar' : 'Arrastra para girar · Ctrl + rueda o pellizco para acercar'}</div>
        <aside className={`dx-planner-3d-legend${capasPlegadas ? ' is-collapsed' : ''}`} aria-label="Capas de la escena">
          <button type="button" className="dx-planner-3d-layer-toggle" aria-expanded={!capasPlegadas} onClick={() => setCapasPlegadas(value => !value)}>{capasPlegadas ? 'Mostrar capas' : 'Ocultar capas'}</button>
          {!capasPlegadas && <>
          <b>Capas</b>
          <fieldset><legend>Bahías por categoría</legend>{Object.entries(CATEGORIAS).map(([category, label]) => (
            <label key={category}><input type="checkbox" checked={capas.categorias[category] !== false} onChange={event => cambiarCapa('categorias', category, event.target.checked)} />{label}</label>
          ))}</fieldset>
          <fieldset><legend>Objetos</legend>{[['maquinas', 'Máquinas'], ['personas', 'Personal'], ['equipos', 'Equipo del cliente'], ['componentes', 'Componentes']].map(([key, title]) => (
            <label key={key}><input type="checkbox" checked={capas.objetos[key]} onChange={event => cambiarCapa('objetos', key, event.target.checked)} />{title}</label>
          ))}</fieldset>
          <label><input type="checkbox" checked={mostrarTextos} onChange={event => setMostrarTextos(event.target.checked)} />Mostrar textos</label>
          <small>Pasa el cursor sobre una bahía, persona o máquina para ver su detalle.</small>
          </>}
        </aside>
        {tooltip && <div className="dx-planner-3d-tooltip" style={{ left: Math.min(tooltip.x + 12, 190), top: Math.max(tooltip.y - 12, 10) }} role="status">
          <b>{tooltip.data.ot?.numero ? `OT ${tooltip.data.ot.numero}` : tooltip.data.nombre || tooltip.data.codigo || tooltip.data.numero || tooltip.data.fecha}</b>
          <span>{tooltip.kind === 'dia' ? `${fechaCorta(tooltip.data.fecha)} · ${Math.round(tooltip.data.utilizacion * 100)}% de uso` : tooltip.kind === 'equipo' ? `${tooltip.data.ot?.numero || 'OT'} · ${tooltip.data.ot?.tipo_equipo || tooltip.data.ot?.equipo_tipo || 'ilustración genérica'}` : tooltip.kind === 'componente' ? `${tooltip.data.ot?.componente_tipo || tooltip.data.ot?.componente_clave || 'ilustración genérica'} · ${tooltip.data.ot?.numero || 'OT'}` : tooltip.kind === 'bahia' ? `Carga: ${tooltip.data.horas} / ${tooltip.data.capacidad} h · ${Math.round(tooltip.data.utilizacion * 100)}%` : tooltip.kind === 'persona' ? `${tooltip.data.cargo || tooltip.data.especialidad || 'Personal'} · ${tooltip.data.horas} h` : tooltip.kind === 'maquina' ? `${tooltip.data.tipo?.nombre || tooltip.data.tipo_clave} · ${tooltip.data.asignaciones?.length ? 'En uso' : 'Libre'} · ${escena.bahias.find(item => item.id === tooltip.data.bahia_id)?.nombre || 'Sin bahía'}` : 'Puesto del taller'}</span>
          {tooltip.kind === 'puesto' && <span>Puesto de {escena.bahias.find(item => item.id === tooltip.data.bahia_id)?.nombre || 'bahía'} · capacidad {tooltip.data.capacidad || 1}</span>}
          <span>OT: {otList(tooltip.data.ots || [])}</span>
        </div>}
        <div className="dx-planner-3d-hud"><span>{fechaCorta(fecha)} · {escena.bahias.length} bahías · {escena.personas.length} personas</span>
          <div className="dx-planner-3d-legend-key"><span className="is-green" /> &lt;75% <span className="is-amber" /> 75–89% <span className="is-red" /> ≥90%</div>
        </div>
      </div>
      {detalle && <aside className="dx-planner-3d-detail" aria-live="polite" aria-label="Detalle seleccionado">
        <button type="button" className="dx-planner-3d-detail-close" onClick={() => elegirSeleccion(null)} aria-label="Cerrar detalle">Cerrar</button>
        {detalle.tipo === 'bahia' && <><h3>{detalle.bahia.nombre}</h3><p>Categoría: {CATEGORIAS[detalle.bahia.categoria] || 'General'} · capacidad {detalle.bahia.capacidad} h · utilización {Math.round(detalle.bahia.utilizacion * 100)}%.</p><p>OT: {otList(detalle.ots)} · Personal: {detalle.personas.map(item => item.nombre).join(', ') || 'Sin personas asignadas'}.</p><button type="button" className="dx-btn" onClick={() => onVerEnTablero(detalle.ots[0])} disabled={!detalle.ots.length}>Ver en el tablero</button></>}
        {detalle.tipo === 'ot' && <><h3>OT {detalle.ot.numero || detalle.ot.id}</h3><p>Trabajo: {detalle.trabajo}</p><p>Equipo: {detalle.equipo} · componente: {detalle.componente}</p><p>Bahía: {detalle.bahia?.nombre || 'No informada'} · fechas: {detalle.fechas.join(', ') || escena.fecha}</p><p>Personas: {detalle.personas.map(item => item.nombre).join(', ') || 'No informadas'} · {detalle.horas} h · estado: {detalle.ot.estado || 'No informado'} · {detalle.conflicto ? 'Con conflicto' : 'Sin conflicto'}</p><button type="button" className="dx-btn" onClick={() => onVerEnTablero(detalle.ot)}>Ver en el tablero</button></>}
        {detalle.tipo === 'persona' && <><h3>{detalle.persona.nombre}</h3><p>{detalle.cargo} · {detalle.horas} h en el día</p><p>OT: {otList(detalle.ots)}</p></>}
        {detalle.tipo === 'maquina' && <><h3>{detalle.maquina.nombre || detalle.maquina.tipo?.nombre || 'Máquina'}</h3><p>Tipo: {detalle.maquina.tipo?.nombre || detalle.maquina.tipo_clave || 'No informado'} · {detalle.uso}</p><p>OT: {otList(detalle.maquina.ots)}</p></>}
      </aside>}
      <details className="dx-planner-3d-summary"><summary>Resumen textual del día</summary>
        <h3>Bahías</h3><ul>{escena.bahias.map(bahia => <li key={bahia.id}><button type="button" className="dx-btn dx-planner-3d-list-button" onClick={() => seleccionarDesdeLista('bahia', bahia)}>{bahia.nombre}: {bahia.horas} de {bahia.capacidad} h ({Math.round(bahia.utilizacion * 100)}%); {bahia.ots.length ? `OT ${otList(bahia.ots)}` : 'sin OT asignadas'}.</button></li>)}</ul>
        <h3>OT del día</h3><ul>{escena.ots.map(ot => <li key={ot.id}><button type="button" className="dx-btn dx-planner-3d-list-button" onClick={() => seleccionarDesdeLista('ot', ot)}>OT {ot.numero || ot.id} · {ot.descripcion || ot.servicio || 'Trabajo no informado'} · equipo y componente: ilustración genérica</button></li>)}</ul>
        <h3>Personal</h3><ul>{escena.personas.map(persona => <li key={persona.id}><button type="button" className="dx-btn dx-planner-3d-list-button" onClick={() => seleccionarDesdeLista('persona', persona)}>{persona.nombre} · {persona.cargo || persona.especialidad || 'Personal'} · {persona.horas} h</button></li>)}</ul>
        <h3>Máquinas</h3><ul>{escena.maquinas.map(maquina => <li key={maquina.id}><button type="button" className="dx-btn dx-planner-3d-list-button" onClick={() => seleccionarDesdeLista('maquina', maquina)}>{maquina.nombre || maquina.tipo?.nombre} · {maquina.tipo?.nombre || maquina.tipo_clave}</button></li>)}</ul>
      </details>
    </section>
  );
}

export { colorUtilizacion };

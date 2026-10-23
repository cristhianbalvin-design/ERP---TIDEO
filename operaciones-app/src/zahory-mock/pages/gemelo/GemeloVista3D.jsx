import { useEffect, useRef, useState } from 'react';
import { ESTADOS, VAR_ESTADO } from './gemeloModelo.js';

const importarThree = () => Promise.all([import('three'), import('three/addons/controls/OrbitControls.js'), import('./gemeloEscena.js')]);

/** Crea el visor 3D al montar y lo destruye al desmontar. Devuelve una ref al visor y el estado de error. */
export function useVisor3D({ onZoomHint } = {}) {
  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  const visorRef = useRef(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState(false);
  const hintRef = useRef(onZoomHint);
  hintRef.current = onZoomHint;
  useEffect(() => {
    let vigente = true;
    importarThree().then(([THREE, { OrbitControls }, escena]) => {
      if (!vigente || !canvasRef.current || !hostRef.current) return;
      const v = escena.crearVisor(THREE, OrbitControls, canvasRef.current, hostRef.current, { onError: () => setError(true), onZoomHint: () => hintRef.current?.() });
      if (!v) { setError(true); return; }
      visorRef.current = v;
      setListo(true);
    }).catch(() => vigente && setError(true));
    return () => { vigente = false; visorRef.current?.dispose(); visorRef.current = null; };
  }, []);
  return { canvasRef, hostRef, visorRef, listo, error };
}

const color = (host, k) => (host ? getComputedStyle(host).getPropertyValue(VAR_ESTADO[k]).trim() : '');

export function GemeloVista3D({ plano, posiciones, info, porcentajeRack, modo, onModo, resaltados, seleccion, ruta, onSeleccionar, maxValor, dia, onDia, tema, ejemplo }) {
  const [hint, setHint] = useState('Arrastra para girar · Ctrl + rueda o pellizco para acercar');
  const hintT = useRef(null);
  const { canvasRef, hostRef, visorRef, listo, error } = useVisor3D({ onZoomHint: () => { setHint('Usa Ctrl + rueda para acercar'); clearTimeout(hintT.current); hintT.current = setTimeout(() => setHint('Arrastra para girar · Ctrl + rueda o pellizco para acercar'), 1800); } });
  const [capas, setCapas] = useState({ estructura: true, zonas: true, etiquetas: true, muros: true, vacias: true, racks: {} });
  const [plegadas, setPlegadas] = useState(true);
  const [filtrosOff, setFiltrosOff] = useState(() => new Set());
  const [tip, setTip] = useState(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onSelRef = useRef(onSeleccionar); onSelRef.current = onSeleccionar;
  const infoRef = useRef(info); infoRef.current = info;

  // construir cuando cambia el plano o el tema
  useEffect(() => { const v = visorRef.current; if (!v || !listo) return; v.info = infoRef.current; v.construir(plano, posiciones, porcentajeRack); }, [listo, plano, posiciones, tema]); // eslint-disable-line react-hooks/exhaustive-deps
  // recolorear
  useEffect(() => { const v = visorRef.current; if (!v || !listo) return; v.info = info; v.modo = modo; v.resaltados = resaltados; v.seleccion = seleccion; v.filtrosOff = filtrosOff; v.capas = capas; v.colorear(); }, [listo, info, modo, resaltados, seleccion, filtrosOff, capas, plano, posiciones, tema]);
  useEffect(() => { const v = visorRef.current; if (!v || !listo) return; v.mostrarRuta(ruta || null); if (ruta) v.vista('top'); }, [listo, ruta]);
  useEffect(() => { const v = visorRef.current; if (!v || !listo || !seleccion) return; const p = posiciones.find(x => x.cod === seleccion); if (p && !ruta) v.volarA(p); }, [listo, seleccion]); // eslint-disable-line react-hooks/exhaustive-deps
  // eventos del lienzo
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return undefined;
    let abajo = null;
    const mover = ev => { const v = visorRef.current; if (!v) return; const p = v.bajoPuntero(ev.clientX, ev.clientY); canvas.classList.toggle('is-hover', Boolean(p)); if (!p) { setTip(null); return; } const r = hostRef.current.getBoundingClientRect(); const it = infoRef.current.get(p.cod)?.items || []; setTip({ x: Math.min(r.width - 130, Math.max(130, ev.clientX - r.left)), y: ev.clientY - r.top, t: `${p.cod} · ${it.length ? `${it[0].desc.slice(0, 28)}${it.length > 1 ? ` +${it.length - 1}` : ''}` : 'Vacía'}` }); };
    const salir = () => setTip(null);
    const down = ev => { abajo = [ev.clientX, ev.clientY]; };
    const up = ev => { if (!abajo || Math.hypot(ev.clientX - abajo[0], ev.clientY - abajo[1]) > 5) return; const p = visorRef.current?.bajoPuntero(ev.clientX, ev.clientY); onSelRef.current(p || null); };
    const tecla = ev => { const v = visorRef.current; if (!v) return; const k = ev.key;
      if (k === 'ArrowLeft') v.girar(0.12, 0); else if (k === 'ArrowRight') v.girar(-0.12, 0); else if (k === 'ArrowUp') v.girar(0, -0.1); else if (k === 'ArrowDown') v.girar(0, 0.1);
      else if (k === '+' || k === '=') v.zoom(0.85); else if (k === '-') v.zoom(1.18); else if (k === 'Escape') onSelRef.current(null); else return; ev.preventDefault(); };
    canvas.addEventListener('pointermove', mover); canvas.addEventListener('pointerleave', salir); canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerup', up); canvas.addEventListener('keydown', tecla);
    return () => { canvas.removeEventListener('pointermove', mover); canvas.removeEventListener('pointerleave', salir); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('keydown', tecla); };
  }, [canvasRef, hostRef, visorRef]);
  // historial: reproducir
  useEffect(() => {
    if (!reproduciendo) return undefined;
    const t = setInterval(() => onDia(d => { if (d >= 0) { setReproduciendo(false); return 0; } return d + 1; }), 900);
    return () => clearInterval(t);
  }, [reproduciendo, onDia]);
  useEffect(() => () => clearTimeout(hintT.current), []);

  // mando de cámara: mantener presionado repite
  const mando = useRef(null);
  const detener = () => { if (mando.current) cancelAnimationFrame(mando.current.raf); mando.current = null; };
  useEffect(() => detener, []);
  const boton = (cls, etiqueta, accion, simbolo) => {
    const paso = () => { const v = visorRef.current; if (!v) return; if (accion.pan) v.paneo(accion.pan, 0.9); else v.zoom(accion.zoom > 0 ? 0.9 : 1.11); };
    return <button type="button" className={cls} aria-label={etiqueta} title={etiqueta}
      onPointerDown={ev => { ev.preventDefault(); detener(); paso(); if (reducido) return; const t0 = performance.now(); mando.current = { raf: 0 }; const rep = t => { if (!mando.current) return; if (t - t0 > 260) paso(); mando.current.raf = requestAnimationFrame(rep); }; mando.current.raf = requestAnimationFrame(rep); }}
      onPointerUp={detener} onPointerLeave={detener} onPointerCancel={detener}
      onClick={ev => { if (ev.detail === 0) paso(); }}>{simbolo}</button>;
  };

  const cambiarCapa = (k, v) => setCapas(c => ({ ...c, [k]: v }));
  const marcarTodo = v => setCapas({ estructura: v, zonas: v, etiquetas: v, muros: v, vacias: v, racks: Object.fromEntries(plano.racks.map(r => [r.id, v])) });
  const vacias = posiciones.filter(p => !info.get(p.cod)?.lleno).length;
  const fechaDia = d => { if (!d) return 'Hoy'; const f = new Date(Date.now() + d * 86400000); return f.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }); };
  const host = hostRef.current;

  return <div className="dx-ui-card dx-gem-card">
    <div className="dx-gem-bar">
      <span className="dx-gem-lbl">Colorear por</span>
      <div className="dx-gem-seg" role="group" aria-label="Colorear por">
        {[['estado', 'Estado'], ['valor', 'Valor'], ['antig', 'Días sin movimiento']].map(([k, t]) => <button key={k} type="button" className={modo === k ? 'on' : ''} aria-pressed={modo === k} onClick={() => onModo(k)}>{t}</button>)}
      </div>
      <span className="dx-gem-sp" />
      <button type="button" className="dx-btn dx-gem-sm" onClick={() => visorRef.current?.vista('iso')}>Vista general</button>
      <button type="button" className="dx-btn dx-gem-sm" onClick={() => visorRef.current?.vista('top')}>Planta</button>
    </div>
    <div className="dx-gem-stage" ref={hostRef}>
      <canvas ref={canvasRef} tabIndex={0} aria-label="Vista 3D del almacén. Flechas para girar, más y menos para acercar, Escape para quitar la selección." />
      {error && <div className="dx-gem-fallback" role="status">Tu navegador no pudo iniciar la vista 3D. El resumen de abajo muestra la misma información.</div>}
      {!error && <div className="dx-gem-hint" aria-live="polite">{listo ? hint : 'Cargando vista 3D…'}</div>}
      {ejemplo && <div className="dx-gem-ejemplo" role="status">Datos de ejemplo · no es tu almacén</div>}
      {tip && <div className="dx-gem-tip" style={{ left: tip.x, top: tip.y }}>{tip.t}</div>}
      <aside className={`dx-gem-layers${plegadas ? ' is-collapsed' : ''}`} aria-label="Capas de la escena">
        <div className="dx-gem-lh"><b>Capas</b>
          <button type="button" className="dx-gem-mini" onClick={() => marcarTodo(true)}>Todo</button>
          <button type="button" className="dx-gem-mini" onClick={() => marcarTodo(false)}>Nada</button>
          <button type="button" className="dx-gem-mini" aria-expanded={!plegadas} aria-label={plegadas ? 'Mostrar capas' : 'Ocultar capas'} onClick={() => setPlegadas(v => !v)}>{plegadas ? '▸' : '▾'}</button>
        </div>
        {!plegadas && <>
          <div className="dx-gem-lg"><span className="dx-gem-lgh">Escena</span>
            {[['estructura', 'Estructura de racks'], ['zonas', 'Zonas de piso'], ['muros', 'Muros y puertas'], ['vacias', 'Posiciones vacías', vacias], ['etiquetas', 'Textos sobre el 3D']].map(([k, t, n]) =>
              <label key={k}><input type="checkbox" checked={capas[k]} onChange={e => cambiarCapa(k, e.target.checked)} /><span>{t}</span>{n !== undefined && <em>{n}</em>}</label>)}
          </div>
          {plano.racks.length > 0 && <div className="dx-gem-lg"><span className="dx-gem-lgh">Racks</span>
            {plano.racks.map(r => <label key={r.id}><input type="checkbox" checked={capas.racks[r.id] !== false} onChange={e => setCapas(c => ({ ...c, racks: { ...c.racks, [r.id]: e.target.checked } }))} /><span>Rack {r.cod}</span><em>{Math.round(porcentajeRack(r) * 100)}%</em></label>)}
          </div>}
        </>}
      </aside>
      <div className="dx-gem-pad" role="group" aria-label="Controles de cámara">
        {boton('u', 'Mover vista hacia el fondo', { pan: 'arriba' }, '↑')}
        {boton('l', 'Mover vista a la izquierda', { pan: 'izq' }, '←')}
        <button type="button" className="c" aria-label="Centrar vista" title="Centrar vista" onClick={() => visorRef.current?.vista('iso')}>◎</button>
        {boton('r', 'Mover vista a la derecha', { pan: 'der' }, '→')}
        {boton('d', 'Mover vista hacia el frente', { pan: 'abajo' }, '↓')}
        {boton('zi', 'Acercar', { zoom: 1 }, '+')}
        {boton('zo', 'Alejar', { zoom: -1 }, '−')}
      </div>
    </div>
    <div className="dx-gem-foot">
      <div className="dx-gem-legend">
        {modo === 'estado' && Object.entries(ESTADOS).map(([k, [t]]) => <button key={k} type="button" className={filtrosOff.has(k) ? 'off' : ''} aria-pressed={!filtrosOff.has(k)} onClick={() => setFiltrosOff(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}><span className="dx-gem-dot" style={{ background: color(host, k) || undefined }} />{t}</button>)}
        {modo === 'valor' && <div className="dx-gem-grad">S/ 0<i className="is-valor" />S/ {Number(maxValor || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 })}</div>}
        {modo === 'antig' && <div className="dx-gem-grad">0 días<i className="is-antig" />90+ días sin movimiento</div>}
      </div>
      <div className="dx-gem-hist">
        <button type="button" className="dx-btn dx-gem-sm" disabled={reducido} aria-pressed={reproduciendo} onClick={() => { if (reproduciendo) { setReproduciendo(false); return; } if (dia >= 0) onDia(-13); setReproduciendo(true); }}>{reproduciendo ? 'Pausar' : 'Reproducir'}</button>
        <label htmlFor="dx-gem-dia" className="dx-gem-lbl">Historial</label>
        <input id="dx-gem-dia" type="range" min="-13" max="0" value={dia} onChange={e => { setReproduciendo(false); onDia(Number(e.target.value)); }} aria-valuetext={fechaDia(dia)} />
        <b>{fechaDia(dia)}</b>
      </div>
    </div>
  </div>;
}

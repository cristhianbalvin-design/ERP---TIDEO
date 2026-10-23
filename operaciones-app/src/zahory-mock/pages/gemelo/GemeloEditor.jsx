import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { capPiso, clonar, diferenciaUbicaciones, huellaRack, LADOS, MOD_W, pad2, PISO_PASO, posicionesDelPlano, RACK_D, revisarPlano, siguienteCodigoRack, snap, USOS } from './gemeloModelo.js';
import { useVisor3D } from './GemeloVista3D.jsx';

let correlativo = 0;
const nuevoId = p => `${p}${Date.now().toString(36)}${(correlativo++).toString(36)}`;
const fmt1 = n => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const coloresPlano = oscuro => ({ ink: oscuro ? '#CBD5E1' : '#1F2937', line: oscuro ? 'rgba(255,255,255,.10)' : '#E4E7EB', piso: oscuro ? '#1E293B' : '#FFFFFF', muro: oscuro ? '#94A3B8' : '#6B7280', fondo: oscuro ? '#0F172A' : '#F8F9FA', sel: oscuro ? '#22D3EE' : '#00ACC1', err: oscuro ? '#F87171' : '#DC2626' });

function Campo({ id, label, value, type = 'text', onCommit, ...extra }) {
  const [v, setV] = useState(String(value ?? ''));
  useEffect(() => { setV(String(value ?? '')); }, [value]);
  return <div className="dx-gem-field"><label htmlFor={id}>{label}</label>
    <input id={id} type={type} value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== String(value ?? '')) onCommit(v); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} {...extra} /></div>;
}

export function GemeloEditor({ guardado, conStock, puedeGuardar, motivoNoGuardar, guardando, errorGuardar, onGuardar, onSucio, oscuro, inventario }) {
  const [B, setB] = useState(() => clonar(guardado));
  const hist = useRef([]); const rehacer = useRef([]);
  const [, setVer] = useState(0);
  const [sel, setSel] = useState({ t: 'plano' });
  const [herr, setHerr] = useState('sel');
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState('');
  const [vista, setVista] = useState('2d');
  const [dibujo, setDibujo] = useState(null);
  const drag = useRef(null);
  const svgRef = useRef(null);
  const BRef = useRef(B); BRef.current = B;

  useEffect(() => { setB(clonar(guardado)); hist.current = []; rehacer.current = []; setSel({ t: 'plano' }); }, [guardado]);
  const sucio = useMemo(() => JSON.stringify(B) !== JSON.stringify(guardado), [B, guardado]);
  useEffect(() => { onSucio?.(sucio); }, [sucio, onSucio]);

  const issues = useMemo(() => revisarPlano(B), [B]);
  const errores = issues.filter(i => i.n === 'err');
  const conError = useMemo(() => new Set(errores.map(i => i.s.id).filter(Boolean)), [errores]);
  const dif = useMemo(() => diferenciaUbicaciones(guardado, B, conStock), [guardado, B, conStock]);
  const posB = useMemo(() => posicionesDelPlano(B), [B]);

  const commit = useCallback((fn, { historia = true } = {}) => {
    if (historia) { hist.current.push(JSON.stringify(BRef.current)); if (hist.current.length > 80) hist.current.shift(); rehacer.current = []; }
    setB(prev => { const n = clonar(prev); fn(n); return n; });
    setVer(v => v + 1);
  }, []);
  const deshacer = useCallback(() => { if (!hist.current.length) return; setAviso(''); setConfirmar(false); rehacer.current.push(JSON.stringify(BRef.current)); setB(JSON.parse(hist.current.pop())); setVer(v => v + 1); }, []);
  const rehacerF = useCallback(() => { if (!rehacer.current.length) return; hist.current.push(JSON.stringify(BRef.current)); setB(JSON.parse(rehacer.current.pop())); setVer(v => v + 1); }, []);

  const elSel = sel.t === 'rack' ? B.racks.find(r => r.id === sel.id) : sel.t === 'zona' ? B.zonas.find(z => z.id === sel.id) : sel.t === 'puerta' ? B.puertas.find(p => p.id === sel.id) : null;
  useEffect(() => { if (sel.t !== 'plano' && !elSel) setSel({ t: 'plano' }); }, [sel, elSel]);
  const stockDe = filtro => posB.filter(filtro).filter(p => conStock.has(p.cod));
  const seleccionar = s => { setSel(s); setConfirmar(false); setAviso(''); };

  const aPlano = ev => { const svg = svgRef.current; const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };

  const duplicar = () => {
    if (!elSel || sel.t === 'puerta') return;
    const nid = nuevoId(sel.t === 'rack' ? 'r' : 'z');
    commit(L => {
      if (sel.t === 'rack') { const o = L.racks.find(r => r.id === sel.id); const f = huellaRack(o); const n = { ...clonar(o), id: nid, cod: siguienteCodigoRack(L.racks) }; if (o.rot) n.x = Math.min(L.ancho - f.w, o.x + f.w + L.pasilloMin); else n.y = Math.min(L.largo - f.h, o.y + f.h + L.pasilloMin); L.racks.push(n); }
      else { const o = L.zonas.find(z => z.id === sel.id); L.zonas.push({ ...clonar(o), id: nid, cod: `${o.cod}2`.slice(0, 12), nombre: `${o.nombre} (copia)`, x: Math.min(L.ancho - o.w, o.x + 1), y: Math.min(L.largo - o.h, o.y + 1) }); }
    });
    setSel({ t: sel.t, id: nid });
  };
  const girar = () => { if (sel.t !== 'rack' || !elSel) return; commit(L => { const o = L.racks.find(r => r.id === sel.id); o.rot = o.rot ? 0 : 90; const f = huellaRack(o); o.x = Math.max(0, Math.min(L.ancho - f.w, o.x)); o.y = Math.max(0, Math.min(L.largo - f.h, o.y)); }); };
  const pedirBorrar = () => {
    if (!elSel) return;
    const st = sel.t === 'rack' ? stockDe(p => p.rackId === sel.id) : sel.t === 'zona' ? stockDe(p => p.zonaId === sel.id) : [];
    if (st.length) { setAviso(`No se puede eliminar: ${st.length} posición(es) con stock (${st.slice(0, 4).map(p => p.cod).join(', ')}${st.length > 4 ? '…' : ''}). Mueve el stock primero.`); setConfirmar(false); }
    else { setAviso(''); setConfirmar(true); }
  };
  const borrar = () => { const s = sel; commit(L => { if (s.t === 'rack') L.racks = L.racks.filter(r => r.id !== s.id); if (s.t === 'zona') L.zonas = L.zonas.filter(z => z.id !== s.id); if (s.t === 'puerta') L.puertas = L.puertas.filter(p => p.id !== s.id); }); setSel({ t: 'plano' }); setConfirmar(false); setAviso('Eliminado del borrador. Puedes deshacer con Ctrl + Z.'); };

  // Puntero sobre el plano
  const onPointerDown = ev => {
    const p = aPlano(ev), hdl = ev.target.closest?.('.dx-gem-hdl'), g = ev.target.closest?.('.dx-gem-el');
    svgRef.current.setPointerCapture?.(ev.pointerId); setConfirmar(false); setAviso('');
    if (hdl) { hist.current.push(JSON.stringify(B)); rehacer.current = []; drag.current = { h: hdl.dataset.h, sel, ini: clonar(elSel || {}) }; return; }
    if (herr === 'rack') { const nid = nuevoId('r'); commit(L => { L.racks.push({ id: nid, cod: siguienteCodigoRack(L.racks), x: snap(Math.max(0, Math.min(L.ancho - 4 * MOD_W, p.x - 2 * MOD_W))), y: snap(Math.max(0, Math.min(L.largo - RACK_D, p.y - RACK_D / 2))), mod: 4, niv: 3, rot: 0 }); }); setSel({ t: 'rack', id: nid }); setHerr('sel'); return; }
    if (herr === 'zona') { const x = snap(p.x), y = snap(p.y); setDibujo({ x0: x, y0: y, x1: x, y1: y }); drag.current = { dibujo: true }; return; }
    if (herr === 'puerta') {
      const dist = { N: Math.abs(p.y), S: Math.abs(B.largo - p.y), O: Math.abs(p.x), E: Math.abs(B.ancho - p.x) };
      const lado = Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0]; const h = lado === 'N' || lado === 'S'; const lim = h ? B.ancho : B.largo; const nid = nuevoId('p');
      commit(L => { L.puertas.push({ id: nid, lado, ancho: 3, pos: snap(Math.max(0, Math.min(lim - 3, (h ? p.x : p.y) - 1.5))) }); }); setSel({ t: 'puerta', id: nid }); setHerr('sel'); return;
    }
    if (g) {
      const s = { t: g.dataset.t, id: g.dataset.id }; setSel(s);
      const o = s.t === 'rack' ? B.racks.find(r => r.id === s.id) : s.t === 'zona' ? B.zonas.find(z => z.id === s.id) : B.puertas.find(x => x.id === s.id);
      drag.current = { mover: s, dx: p.x - (o.x ?? 0), dy: p.y - (o.y ?? 0), p0: p, pIni: o.pos, antes: JSON.stringify(B), movio: false };
      return;
    }
    setSel({ t: 'plano' });
  };
  const onPointerMove = ev => {
    const d = drag.current; if (!d) return; const p = aPlano(ev);
    if (d.dibujo) { setDibujo(x => x && ({ ...x, x1: snap(Math.max(0, Math.min(B.ancho, p.x))), y1: snap(Math.max(0, Math.min(B.largo, p.y))) })); return; }
    if (d.mover) {
      if (!d.movio) { hist.current.push(d.antes); rehacer.current = []; d.movio = true; }
      setB(prev => { const L = clonar(prev); const s = d.mover;
        if (s.t === 'puerta') { const o = L.puertas.find(x => x.id === s.id); const h = o.lado === 'N' || o.lado === 'S'; const lim = h ? L.ancho : L.largo; o.pos = snap(Math.max(0, Math.min(lim - o.ancho, d.pIni + (h ? p.x - d.p0.x : p.y - d.p0.y)))); }
        else { const o = s.t === 'rack' ? L.racks.find(r => r.id === s.id) : L.zonas.find(z => z.id === s.id); const f = s.t === 'rack' ? huellaRack(o) : o; o.x = snap(Math.max(0, Math.min(L.ancho - f.w, p.x - d.dx))); o.y = snap(Math.max(0, Math.min(L.largo - f.h, p.y - d.dy))); }
        return L; });
      return;
    }
    setB(prev => {
      const L = clonar(prev);
      if (d.h === 'plano-e') { L.ancho = Math.max(8, Math.min(200, snap(p.x))); return L; }
      if (d.h === 'plano-s') { L.largo = Math.max(6, Math.min(200, snap(p.y))); return L; }
      if (d.h === 'len') { const o = L.racks.find(r => r.id === d.sel.id); const f = huellaRack(d.ini); o.mod = Math.max(1, Math.min(20, Math.round((o.rot ? p.y - f.y : p.x - f.x) / MOD_W))); return L; }
      const o = L.zonas.find(z => z.id === d.sel.id); if (!o) return prev;
      const i = d.ini, x2 = i.x + i.w, y2 = i.y + i.h, X = snap(Math.max(0, Math.min(L.ancho, p.x))), Y = snap(Math.max(0, Math.min(L.largo, p.y)));
      if (d.h.includes('w')) { o.x = Math.min(X, x2 - 1); o.w = x2 - o.x; }
      if (d.h.includes('e')) o.w = Math.max(1, X - i.x);
      if (d.h.includes('n')) { o.y = Math.min(Y, y2 - 1); o.h = y2 - o.y; }
      if (d.h.includes('s')) o.h = Math.max(1, Y - i.y);
      return L;
    });
  };
  const onPointerUp = () => {
    const d = drag.current; drag.current = null;
    if (d?.dibujo && dibujo) {
      const w = Math.abs(dibujo.x1 - dibujo.x0), h = Math.abs(dibujo.y1 - dibujo.y0);
      if (w >= 1 && h >= 1) {
        const nid = nuevoId('z');
        commit(L => { const n = L.zonas.length + 1; let cod = `Z${n}`; while (L.zonas.some(z => z.cod === cod)) cod += 'X'; L.zonas.push({ id: nid, cod, nombre: `Zona ${n}`, uso: 'almacenaje', x: Math.min(dibujo.x0, dibujo.x1), y: Math.min(dibujo.y0, dibujo.y1), w, h, piso: 0 }); });
        setSel({ t: 'zona', id: nid }); setHerr('sel');
      } else setAviso('Arrastra en el plano para dibujar la zona (mínimo 1 × 1 m).');
      setDibujo(null);
    }
    if (d && !d.dibujo) setVer(v => v + 1);
  };

  // Teclado del editor (solo cuando el foco no está en un campo)
  useEffect(() => {
    const tecla = ev => {
      const raiz = svgRef.current?.closest('.dx-gem-ed'); if (!raiz || !raiz.isConnected) return;
      const activo = ev.composedPath?.()[0] || ev.target;
      if (!raiz.contains(activo) && activo !== document.body && !(activo?.shadowRoot)) return;
      const enCampo = ['INPUT', 'SELECT', 'TEXTAREA'].includes(activo?.tagName);
      const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
      if (mod && k === 'z' && !ev.shiftKey) { if (enCampo) return; ev.preventDefault(); deshacer(); return; }
      if (mod && (k === 'y' || (k === 'z' && ev.shiftKey))) { if (enCampo) return; ev.preventDefault(); rehacerF(); return; }
      if (enCampo) return;
      if (mod && k === 'd') { ev.preventDefault(); duplicar(); return; }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { if (elSel) { ev.preventDefault(); pedirBorrar(); } return; }
      if (ev.key === 'Escape') { setSel({ t: 'plano' }); setHerr('sel'); return; }
      if (ev.shiftKey && k === 'r') { girar(); return; }
      const hk = { v: 'sel', r: 'rack', z: 'zona', p: 'puerta' }[k];
      if (hk && !mod) { setHerr(hk); return; }
      if (!elSel || !ev.key.startsWith('Arrow')) return;
      ev.preventDefault(); const paso = ev.shiftKey ? 1 : 0.5;
      commit(L => {
        if (sel.t === 'puerta') { const o = L.puertas.find(x => x.id === sel.id); const h = o.lado === 'N' || o.lado === 'S'; const lim = h ? L.ancho : L.largo; o.pos = Math.max(0, Math.min(lim - o.ancho, o.pos + (['ArrowRight', 'ArrowDown'].includes(ev.key) ? paso : -paso))); return; }
        const o = sel.t === 'rack' ? L.racks.find(r => r.id === sel.id) : L.zonas.find(z => z.id === sel.id); const f = sel.t === 'rack' ? huellaRack(o) : o;
        if (ev.key === 'ArrowLeft') o.x = Math.max(0, o.x - paso); if (ev.key === 'ArrowRight') o.x = Math.min(L.ancho - f.w, o.x + paso);
        if (ev.key === 'ArrowUp') o.y = Math.max(0, o.y - paso); if (ev.key === 'ArrowDown') o.y = Math.min(L.largo - f.h, o.y + paso);
      });
    };
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  });

  // Vista previa 3D del borrador
  const { canvasRef, hostRef, visorRef, listo, error } = useVisor3D();
  useEffect(() => {
    const v = visorRef.current; if (!v || !listo || vista !== '3d') return;
    v.ajustar(); v.info = new Map(posB.map(p => { const items = inventario?.get(p.cod) || []; return [p.cod, { lleno: items.length > 0, estado: items.length ? 'ocupado' : 'vacio', valor: 0, dias: null, items }]; }));
    v.construir(B, posB, r => { const ps = posB.filter(p => p.rackId === r.id); return ps.length ? ps.filter(p => inventario?.get(p.cod)?.length).length / ps.length : 0; });
  }, [B, posB, vista, listo, oscuro, inventario, visorRef]);

  // ---------- Render del plano ----------
  const c = coloresPlano(oscuro);
  const W = B.ancho, H = B.largo;
  const lineas = [];
  for (let x = 1; x < W; x++) lineas.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={H} stroke={c.line} strokeWidth={x % 5 ? 0.03 : 0.06} pointerEvents="none" />);
  for (let y = 1; y < H; y++) lineas.push(<line key={`y${y}`} x1={0} y1={y} x2={W} y2={y} stroke={c.line} strokeWidth={y % 5 ? 0.03 : 0.06} pointerEvents="none" />);
  const teclaEl = (ev, s) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); seleccionar(s); } };

  const plano = <svg ref={svgRef} className={`dx-gem-svg t-${herr}`} viewBox={`-1.6 -1.6 ${W + 3.2} ${H + 3.2}`} role="application" aria-label="Plano del almacén"
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
    <rect x={-1.6} y={-1.6} width={W + 3.2} height={H + 3.2} fill="transparent" />
    <rect x={0} y={0} width={W} height={H} fill={c.piso} />
    {lineas}
    <text x={W / 2} y={H + 1.15} fontSize={0.55} textAnchor="middle" fill={c.ink} pointerEvents="none">{fmt1(W)} m</text>
    <text x={W + 1.1} y={H / 2} fontSize={0.55} textAnchor="middle" fill={c.ink} transform={`rotate(90 ${W + 1.1} ${H / 2})`} pointerEvents="none">{fmt1(H)} m</text>
    <rect x={0} y={0} width={W} height={H} fill="none" stroke={c.muro} strokeWidth={0.18} pointerEvents="none" />
    {B.puertas.map(p => { const h = p.lado === 'N' || p.lado === 'S'; const x = h ? p.pos : (p.lado === 'O' ? -0.25 : W - 0.25), y = h ? (p.lado === 'N' ? -0.25 : H - 0.25) : p.pos; const sl = sel.t === 'puerta' && sel.id === p.id; const tx = h ? p.pos + p.ancho / 2 : (p.lado === 'O' ? -0.75 : W + 0.75), ty = h ? (p.lado === 'N' ? -0.55 : H + 0.8) : p.pos + p.ancho / 2;
      return <g key={p.id} className="dx-gem-el" data-t="puerta" data-id={p.id} tabIndex={0} role="button" aria-label={`Puerta ${LADOS[p.lado]}`} onKeyDown={ev => teclaEl(ev, { t: 'puerta', id: p.id })}>
        <rect x={x} y={y} width={h ? p.ancho : 0.5} height={h ? 0.5 : p.ancho} fill={c.fondo} stroke={sl ? c.sel : conError.has(p.id) ? c.err : c.muro} strokeWidth={sl ? 0.12 : 0.05} strokeDasharray={sl ? undefined : '.2 .12'} />
        <text x={tx} y={ty} fontSize={0.5} textAnchor="middle" fill={c.ink} transform={h ? undefined : `rotate(-90 ${tx} ${ty})`}>Puerta · {fmt1(p.ancho)} m</text></g>; })}
    {B.zonas.map(z => { const col = USOS[z.uso][1], sl = sel.t === 'zona' && sel.id === z.id, er = conError.has(z.id); const cols = Math.max(1, Math.floor((z.w - 0.4) / PISO_PASO));
      return <g key={z.id} className="dx-gem-el" data-t="zona" data-id={z.id} tabIndex={0} role="button" aria-label={`Zona ${z.nombre}`} onKeyDown={ev => teclaEl(ev, { t: 'zona', id: z.id })}>
        <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={col} fillOpacity={0.14} stroke={er ? c.err : sl ? c.sel : col} strokeWidth={sl || er ? 0.12 : 0.06} strokeDasharray={sl ? undefined : '.3 .2'} />
        <text x={z.x + z.w / 2} y={z.y + 0.85} fontSize={0.6} fontWeight={700} textAnchor="middle" fill={c.ink} pointerEvents="none">{z.nombre}</text>
        {z.piso > 0 && <text x={z.x + z.w / 2} y={z.y + 1.5} fontSize={0.42} textAnchor="middle" fill={c.ink} opacity={0.7} pointerEvents="none">{z.piso} pos. de piso</text>}
        {Array.from({ length: z.piso }, (_, i) => <rect key={i} x={z.x + 0.2 + (i % cols) * PISO_PASO + 0.35} y={z.y + 1.2 + Math.floor(i / cols) * PISO_PASO + 0.35} width={1.5} height={1.5} rx={0.15} fill="none" stroke={col} strokeWidth={0.04} pointerEvents="none" />)}
      </g>; })}
    {B.racks.map(r => { const f = huellaRack(r), sl = sel.t === 'rack' && sel.id === r.id, er = conError.has(r.id); const pr = posB.filter(p => p.rackId === r.id), pc = pr.length ? pr.filter(p => conStock.has(p.cod)).length / pr.length : 0;
      return <g key={r.id} className="dx-gem-el" data-t="rack" data-id={r.id} tabIndex={0} role="button" aria-label={`Rack ${r.cod}, ${r.mod} módulos, ${r.niv} niveles`} onKeyDown={ev => teclaEl(ev, { t: 'rack', id: r.id })}>
        <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={0.08} fill="#E08A00" fillOpacity={0.35 + pc * 0.55} stroke={er ? c.err : sl ? c.sel : '#8A4B00'} strokeWidth={sl || er ? 0.14 : 0.05} />
        {Array.from({ length: r.mod - 1 }, (_, k) => r.rot ? <line key={k} x1={f.x} y1={f.y + (k + 1) * MOD_W} x2={f.x + f.w} y2={f.y + (k + 1) * MOD_W} stroke="#8A4B00" strokeWidth={0.035} pointerEvents="none" /> : <line key={k} x1={f.x + (k + 1) * MOD_W} y1={f.y} x2={f.x + (k + 1) * MOD_W} y2={f.y + f.h} stroke="#8A4B00" strokeWidth={0.035} pointerEvents="none" />)}
        <text x={r.rot ? f.x + f.w / 2 : f.x - 0.35} y={r.rot ? f.y - 0.3 : f.y + f.h / 2 + 0.22} fontSize={0.62} fontWeight={700} textAnchor={r.rot ? 'middle' : 'end'} fill={c.ink} pointerEvents="none">{r.cod}</text></g>; })}
    {sel.t === 'zona' && elSel && [['nw', elSel.x, elSel.y], ['ne', elSel.x + elSel.w, elSel.y], ['sw', elSel.x, elSel.y + elSel.h], ['se', elSel.x + elSel.w, elSel.y + elSel.h]].map(([k, x, y]) => <rect key={k} className="dx-gem-hdl" data-h={k} x={x - 0.28} y={y - 0.28} width={0.56} height={0.56} rx={0.1} fill={c.piso} stroke={c.sel} strokeWidth={0.08} />)}
    {sel.t === 'rack' && elSel && (() => { const f = huellaRack(elSel); const [x, y] = elSel.rot ? [f.x + f.w / 2, f.y + f.h] : [f.x + f.w, f.y + f.h / 2]; return <rect className={`dx-gem-hdl ${elSel.rot ? 'ns' : 'ew'}`} data-h="len" x={x - 0.3} y={y - 0.3} width={0.6} height={0.6} rx={0.3} fill={c.piso} stroke={c.sel} strokeWidth={0.08}><title>Arrastra para cambiar el número de módulos</title></rect>; })()}
    <rect className="dx-gem-hdl ew" data-h="plano-e" x={W - 0.3} y={H / 2 - 0.3} width={0.6} height={0.6} rx={0.1} fill={c.piso} stroke={c.muro} strokeWidth={0.07}><title>Arrastra para cambiar el ancho del almacén</title></rect>
    <rect className="dx-gem-hdl ns" data-h="plano-s" x={W / 2 - 0.3} y={H - 0.3} width={0.6} height={0.6} rx={0.1} fill={c.piso} stroke={c.muro} strokeWidth={0.07}><title>Arrastra para cambiar el largo del almacén</title></rect>
    {dibujo && <rect x={Math.min(dibujo.x0, dibujo.x1)} y={Math.min(dibujo.y0, dibujo.y1)} width={Math.abs(dibujo.x1 - dibujo.x0)} height={Math.abs(dibujo.y1 - dibujo.y0)} fill={c.sel} fillOpacity={0.12} stroke={c.sel} strokeWidth={0.08} strokeDasharray=".3 .2" pointerEvents="none" />}
  </svg>;

  // ---------- Panel de propiedades ----------
  const cambiar = (fn) => commit(L => fn(L));
  const conRack = fn => cambiar(L => fn(L.racks.find(r => r.id === sel.id), L));
  const conZona = fn => cambiar(L => fn(L.zonas.find(z => z.id === sel.id), L));
  const conPuerta = fn => cambiar(L => fn(L.puertas.find(p => p.id === sel.id), L));
  const acciones = extra => <>
    <div className="dx-gem-tools">{extra}<button type="button" className="dx-btn danger" onClick={pedirBorrar}>Eliminar</button></div>
    {confirmar && <div className="dx-gem-note is-red" role="alert">¿Eliminar del borrador? Sus ubicaciones se desactivan al guardar.
      <div className="dx-gem-tools"><button type="button" className="dx-btn dx-gem-sm" onClick={() => setConfirmar(false)}>Cancelar</button><button type="button" className="dx-btn dx-gem-sm danger" onClick={borrar}>Sí, eliminar</button></div></div>}
  </>;
  const cambiarTam = (o, k, v, max) => {
    const nuevo = Math.max(1, Math.min(max, Math.round(Number(v)) || 1));
    const st = posB.filter(p => p.rackId === o.id && conStock.has(p.cod) && (k === 'mod' ? p.m > nuevo : p.n > nuevo));
    if (st.length) { setAviso(`No puedes bajar a ${nuevo} ${k === 'mod' ? 'módulos' : 'niveles'}: ${st.slice(0, 4).map(p => p.cod).join(', ')} tienen stock.`); return; }
    conRack(r => { r[k] = nuevo; });
  };
  let props;
  if (sel.t === 'rack' && elSel) {
    const o = elSel, f = huellaRack(o), st = stockDe(p => p.rackId === o.id);
    props = <><h3>Rack {o.cod}</h3>
      <Campo id="gem-r-cod" label="Código" value={o.cod} maxLength={3} onCommit={v => v.trim() && conRack(r => { r.cod = v.trim().toUpperCase(); })} />
      <div className="dx-gem-two"><Campo id="gem-r-mod" label="Módulos" type="number" min="1" max="20" value={o.mod} onCommit={v => cambiarTam(o, 'mod', v, 20)} /><Campo id="gem-r-niv" label="Niveles" type="number" min="1" max="8" value={o.niv} onCommit={v => cambiarTam(o, 'niv', v, 8)} /></div>
      <div className="dx-gem-two"><Campo id="gem-r-x" label="Posición X (m)" type="number" step="0.5" value={o.x} onCommit={v => conRack(r => { r.x = snap(Math.max(0, Number(v) || 0)); })} /><Campo id="gem-r-y" label="Posición Y (m)" type="number" step="0.5" value={o.y} onCommit={v => conRack(r => { r.y = snap(Math.max(0, Number(v) || 0)); })} /></div>
      <div className="dx-gem-field"><label htmlFor="gem-r-rot">Orientación</label><select id="gem-r-rot" value={o.rot} onChange={e => conRack(r => { r.rot = Number(e.target.value); })}><option value={0}>Horizontal (a lo ancho)</option><option value={90}>Vertical (a lo largo)</option></select></div>
      <div className="dx-gem-note">Genera <b>{o.mod * o.niv} posiciones</b> ({o.cod}-01-1 … {o.cod}-{pad2(o.mod)}-{o.niv}) · huella {fmt1(f.w)} × {fmt1(f.h)} m.{st.length ? ` ${st.length} tienen stock: no puedes quitar esos módulos o niveles.` : ''}</div>
      {acciones(<><button type="button" className="dx-btn" onClick={duplicar}>Duplicar</button><button type="button" className="dx-btn" onClick={girar}>Girar 90°</button></>)}</>;
  } else if (sel.t === 'zona' && elSel) {
    const o = elSel, st = stockDe(p => p.zonaId === o.id);
    props = <><h3>{o.nombre}</h3>
      <div className="dx-gem-two"><Campo id="gem-z-cod" label="Código" value={o.cod} maxLength={12} onCommit={v => v.trim() && conZona(z => { z.cod = v.trim().toUpperCase(); })} /><Campo id="gem-z-nom" label="Nombre" value={o.nombre} onCommit={v => v.trim() && conZona(z => { z.nombre = v.trim(); })} /></div>
      <div className="dx-gem-field"><label htmlFor="gem-z-uso">Uso</label><select id="gem-z-uso" value={o.uso} onChange={e => conZona(z => { z.uso = e.target.value; })}>{Object.entries(USOS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="dx-gem-two"><Campo id="gem-z-x" label="X (m)" type="number" step="0.5" value={o.x} onCommit={v => conZona(z => { z.x = snap(Math.max(0, Number(v) || 0)); })} /><Campo id="gem-z-y" label="Y (m)" type="number" step="0.5" value={o.y} onCommit={v => conZona(z => { z.y = snap(Math.max(0, Number(v) || 0)); })} /></div>
      <div className="dx-gem-two"><Campo id="gem-z-w" label="Ancho (m)" type="number" step="0.5" min="1" value={o.w} onCommit={v => conZona(z => { z.w = Math.max(1, snap(Number(v) || 1)); })} /><Campo id="gem-z-h" label="Largo (m)" type="number" step="0.5" min="1" value={o.h} onCommit={v => conZona(z => { z.h = Math.max(1, snap(Number(v) || 1)); })} /></div>
      <Campo id="gem-z-piso" label={`Posiciones de piso (caben ${capPiso(o)})`} type="number" min="0" value={o.piso} onCommit={v => { const n = Math.max(0, Math.round(Number(v)) || 0); const bloqueadas = st.filter(p => Number(p.cod.split('-').pop()) > n); if (bloqueadas.length) { setAviso(`No puedes bajar a ${n}: ${bloqueadas.map(p => p.cod).join(', ')} tienen stock.`); return; } conZona(z => { z.piso = n; }); }} />
      <div className="dx-gem-note">{o.piso ? <>Genera <b>{o.piso} posiciones de piso</b> ({o.cod}-01 … {o.cod}-{pad2(o.piso)})</> : 'Zona sin posiciones de piso: los racks dentro de ella quedan en esta zona'}{o.uso === 'cuarentena' || o.uso === 'merma' ? '. Lo que esté aquí no cuenta como disponible.' : '.'}{st.length ? ` ${st.length} con stock.` : ''}</div>
      {acciones(<button type="button" className="dx-btn" onClick={duplicar}>Duplicar</button>)}</>;
  } else if (sel.t === 'puerta' && elSel) {
    const o = elSel;
    props = <><h3>Puerta {LADOS[o.lado].toLowerCase()}</h3>
      <div className="dx-gem-field"><label htmlFor="gem-p-lado">Muro</label><select id="gem-p-lado" value={o.lado} onChange={e => conPuerta(p => { p.lado = e.target.value; })}>{Object.entries(LADOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="dx-gem-two"><Campo id="gem-p-pos" label="Desde la esquina (m)" type="number" step="0.5" min="0" value={o.pos} onCommit={v => conPuerta(p => { p.pos = Math.max(0, snap(Number(v) || 0)); })} /><Campo id="gem-p-anc" label="Ancho (m)" type="number" step="0.5" min="1" value={o.ancho} onCommit={v => conPuerta(p => { p.ancho = Math.max(1, snap(Number(v) || 1)); })} /></div>
      <div className="dx-gem-note">La primera puerta es el punto de partida de las rutas de picking.</div>{acciones(null)}</>;
  } else {
    props = <><h3>Plano del almacén</h3>
      <div className="dx-gem-two"><Campo id="gem-an" label="Ancho (m)" type="number" step="0.5" min="8" value={B.ancho} onCommit={v => cambiar(L => { L.ancho = Math.max(8, Math.min(200, snap(Number(v) || 8))); })} /><Campo id="gem-la" label="Largo (m)" type="number" step="0.5" min="6" value={B.largo} onCommit={v => cambiar(L => { L.largo = Math.max(6, Math.min(200, snap(Number(v) || 6))); })} /></div>
      <Campo id="gem-pm" label="Pasillo mínimo entre racks (m)" type="number" step="0.1" min="0.8" value={B.pasilloMin} onCommit={v => cambiar(L => { L.pasilloMin = Math.max(0.8, Math.round((Number(v) || 0.8) * 10) / 10); })} />
      <div className="dx-gem-field"><label>Puertas</label></div>
      {B.puertas.length > 0 && <div className="dx-gem-door is-head"><span>Muro</span><span>Desde (m)</span><span>Ancho (m)</span><span /></div>}
      {B.puertas.map(p => <div key={p.id} className="dx-gem-door">
        <select aria-label="Muro de la puerta" value={p.lado} onChange={e => cambiar(L => { L.puertas.find(x => x.id === p.id).lado = e.target.value; })}>{Object.entries(LADOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <input aria-label="Distancia desde la esquina (m)" type="number" step="0.5" defaultValue={p.pos} key={`pos${p.pos}`} onBlur={e => cambiar(L => { L.puertas.find(x => x.id === p.id).pos = Math.max(0, snap(Number(e.target.value) || 0)); })} />
        <input aria-label="Ancho de la puerta (m)" type="number" step="0.5" min="1" defaultValue={p.ancho} key={`an${p.ancho}`} onBlur={e => cambiar(L => { L.puertas.find(x => x.id === p.id).ancho = Math.max(1, snap(Number(e.target.value) || 1)); })} />
        <button type="button" className="dx-gem-x" aria-label="Quitar puerta" onClick={() => cambiar(L => { L.puertas = L.puertas.filter(x => x.id !== p.id); })}>×</button></div>)}
      {!B.puertas.length && <div className="dx-ui-empty dx-gem-empty-sm">Sin puertas.</div>}
      <div className="dx-gem-tools"><button type="button" className="dx-btn dx-gem-sm" onClick={() => cambiar(L => { L.puertas.push({ id: nuevoId('p'), lado: 'S', pos: snap(L.ancho / 2 - 1.5), ancho: 3 }); })}>+ Puerta</button></div>
      <p className="dx-gem-keys">Selecciona un rack, zona o puerta para editarlo. <kbd>V</kbd> seleccionar · <kbd>R</kbd> rack · <kbd>Z</kbd> zona · <kbd>P</kbd> puerta · <kbd>Supr</kbd> eliminar · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicar · <kbd>Shift</kbd>+<kbd>R</kbd> girar · flechas mueven 0,5 m · <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer. Las manijas del borde cambian el tamaño del almacén.</p></>;
  }

  const filaCambio = (t, a, b) => { const ia = new Set(a.map(x => x.id)), ib = new Set(b.map(x => x.id)); const add = b.filter(x => !ia.has(x.id)).length, del = a.filter(x => !ib.has(x.id)).length, mod = b.filter(x => ia.has(x.id) && JSON.stringify(x) !== JSON.stringify(a.find(y => y.id === x.id))).length; return (add || del || mod) ? <div key={t}><span>{t}</span><b>{[add && `+${add}`, del && `−${del}`, mod && `${mod} editado(s)`].filter(Boolean).join(' · ')}</b></div> : null; };
  const bloqueoGuardar = !puedeGuardar ? motivoNoGuardar : errores.length ? `Corrige ${errores.length} error(es) del plano.` : dif.quitadasConStock.length ? `${dif.quitadasConStock.length} ubicación(es) con stock desaparecerían.` : '';

  return <div className="dx-gem-ed">
    <div className="dx-ui-card dx-gem-card">
      <div className="dx-gem-bar">
        <div className="dx-gem-seg" role="group" aria-label="Herramienta">
          {[['sel', 'Seleccionar', 'Seleccionar y mover (V)'], ['rack', '+ Rack', 'Clic en el plano para colocar un rack (R)'], ['zona', '+ Zona', 'Arrastra en el plano para dibujar una zona (Z)'], ['puerta', '+ Puerta', 'Clic sobre un muro para abrir una puerta (P)']].map(([k, t, ti]) => <button key={k} type="button" title={ti} className={herr === k ? 'on' : ''} aria-pressed={herr === k} disabled={vista === '3d'} onClick={() => setHerr(k)}>{t}</button>)}
        </div>
        <span className="dx-gem-sp" />
        <button type="button" className="dx-btn dx-gem-sm" title="Deshacer (Ctrl+Z)" disabled={!hist.current.length} onClick={deshacer}>Deshacer</button>
        <button type="button" className="dx-btn dx-gem-sm" title="Rehacer (Ctrl+Y)" disabled={!rehacer.current.length} onClick={rehacerF}>Rehacer</button>
        <div className="dx-gem-seg" role="group" aria-label="Vista del editor"><button type="button" className={vista === '2d' ? 'on' : ''} aria-pressed={vista === '2d'} onClick={() => setVista('2d')}>Plano 2D</button><button type="button" className={vista === '3d' ? 'on' : ''} aria-pressed={vista === '3d'} onClick={() => setVista('3d')}>Vista previa 3D</button></div>
      </div>
      <div className="dx-gem-plan" hidden={vista !== '2d'}>{plano}</div>
      <div className="dx-gem-prev" ref={hostRef} hidden={vista !== '3d'}><canvas ref={canvasRef} aria-label="Vista previa 3D del borrador" />{error && <div className="dx-gem-fallback" role="status">Tu navegador no pudo iniciar la vista 3D.</div>}</div>
      <div className="dx-gem-issues" aria-live="polite">
        {issues.length ? issues.map((i, k) => <div key={k} className={i.n}><span aria-hidden="true">{i.n === 'err' ? '●' : '▲'}</span><button type="button" onClick={() => seleccionar(i.s)}>{i.t}</button></div>) : <div className="ok"><span aria-hidden="true">✓</span><span>Plano sin observaciones.</span></div>}
      </div>
    </div>
    <aside className="dx-gem-side">
      <div className="dx-ui-card"><div className="dx-gem-sec">{props}{aviso && <div className="dx-gem-note is-amber" role="status">{aviso}</div>}</div></div>
      <div className="dx-ui-card"><div className="dx-gem-sec">
        <h3>Cambios del borrador</h3>
        {sucio ? <div className="dx-gem-chg">
          {filaCambio('Racks', guardado.racks, B.racks)}{filaCambio('Zonas', guardado.zonas, B.zonas)}{filaCambio('Puertas', guardado.puertas, B.puertas)}
          {(B.ancho !== guardado.ancho || B.largo !== guardado.largo) && <div><span>Dimensiones</span><b>{fmt1(B.ancho)} × {fmt1(B.largo)} m</b></div>}
          <div><span>Ubicaciones nuevas</span><b>{dif.nuevas.length}</b></div>
          <div><span>Ubicaciones a desactivar (vacías)</span><b>{dif.quitadas.length - dif.quitadasConStock.length}</b></div>
          <div><span>Total de posiciones</span><b>{dif.total}</b></div>
        </div> : <div className="dx-ui-empty dx-gem-empty-sm">Sin cambios. Lo que edites aquí no cambia la vista 3D hasta que guardes.</div>}
        {sucio && bloqueoGuardar && <div className="dx-gem-note is-red" role="status">{bloqueoGuardar}</div>}
        {errorGuardar && <div className="dx-gem-note is-red" role="alert">{errorGuardar}</div>}
        <div className="dx-gem-tools">
          <button type="button" className="dx-btn" disabled={!sucio || guardando} onClick={() => { hist.current.push(JSON.stringify(B)); setB(clonar(guardado)); setAviso('Borrador descartado. Ctrl + Z para recuperarlo.'); }}>Descartar</button>
          <button type="button" className="dx-btn primary" disabled={!sucio || guardando || Boolean(bloqueoGuardar)} onClick={() => onGuardar(B)}>{guardando ? 'Guardando…' : 'Guardar y generar ubicaciones'}</button>
        </div>
      </div></div>
    </aside>
  </div>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { cargarGemelo, guardarPlanoAlmacen, listarAlmacenesGemelo } from '../../../services/gemeloAlmacenService.js';
import { diasItems, ESTADOS, estadoPosicion, inventarioPorCodigo, itemsEnDia, normalizarPlano, planoVacio, posicionesDelPlano, rutaDesdePuerta, valorItems } from './gemeloModelo.js';
import { inventarioEjemplo, PLANO_EJEMPLO } from './gemeloEjemplo.js';
import { GemeloVista3D } from './GemeloVista3D.jsx';
import { GemeloEditor } from './GemeloEditor.jsx';
import { observarTema, temaOscuro } from './gemeloTema.js';

const mensaje = e => e?.message || 'No se pudo cargar la información.';
const soles = (n, d = 2) => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const cant = n => Number(n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });
const vacioInv = { porCodigo: new Map(), fueraDelPlano: { filas: 0, unidades: 0, ubicaciones: [] } };

export function GemeloAlmacenPage() {
  const sesion = useSesionOperativa();
  const { empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance } = sesion;
  const [permisos, setPermisos] = useState({ ver: false, editar: false, cargados: false });
  const [almacenes, setAlmacenes] = useState([]);
  const [almacenId, setAlmacenId] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('vista');
  const [ejemplo, setEjemplo] = useState(false);
  const [modo, setModo] = useState('estado');
  const [dia, setDia] = useState(0);
  const [seleccion, setSeleccion] = useState(null);
  const [ruta, setRuta] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const [aviso, setAviso] = useState('');
  const [sucio, setSucio] = useState(false);
  const [tema, setTema] = useState(0);
  const [salida, setSalida] = useState(null);
  const raizRef = useRef(null);
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    let vigente = true;
    if (sesion.cargando || sesion.estado !== 'listo' || !empresaId) return () => { vigente = false; };
    Promise.all(['ver', 'editar'].map(target_accion => getSupabaseClient().rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'inventario', target_accion })))
      .then(r => { const f = r.find(x => x.error)?.error; if (f) throw f; if (vigente) setPermisos({ ver: Boolean(r[0].data), editar: Boolean(r[1].data), cargados: true }); })
      .catch(e => { if (vigente) { setError(mensaje(e)); setPermisos(p => ({ ...p, cargados: true })); } });
    return () => { vigente = false; };
  }, [empresaId, sesion.cargando, sesion.estado]);

  useEffect(() => {
    let vigente = true;
    if (!permisos.ver || !empresaId) return () => { vigente = false; };
    listarAlmacenesGemelo(empresaId).then(lista => {
      if (!vigente) return;
      setAlmacenes(lista);
      setAlmacenId(actual => lista.some(a => a.id === actual) ? actual : (lista.find(a => a.plano)?.id || lista.find(a => a.clase !== 'periferico')?.id || lista[0]?.id || ''));
    }).catch(e => vigente && setError(mensaje(e)));
    return () => { vigente = false; };
  }, [permisos.ver, empresaId]);

  const alcanceKey = (sociedadesIdsAlcance || []).join(',');
  const cargar = useCallback(async () => {
    if (!almacenId || !empresaId) return;
    setCargando(true); setError('');
    try { setDatos(await cargarGemelo({ empresaId, almacenId, sociedadId, vistaConsolidada, sociedadesIdsAlcance: alcanceKey ? alcanceKey.split(',') : [] })); }
    catch (e) { setError(mensaje(e)); }
    finally { setCargando(false); }
  }, [almacenId, empresaId, sociedadId, vistaConsolidada, alcanceKey]);
  useEffect(() => { setSeleccion(null); setRuta(null); setDia(0); cargar(); }, [cargar]);

  useEffect(() => {
    const el = raizRef.current; if (!el) return undefined;
    setOscuro(temaOscuro(el));
    return observarTema(el, () => { setOscuro(temaOscuro(el)); setTema(t => t + 1); });
  }, [permisos.cargados]);

  // Plano e inventario vigentes (reales o de ejemplo)
  const planoGuardado = useMemo(() => (datos?.plano?.layout ? normalizarPlano(datos.plano.layout) : null), [datos]);
  const plano = ejemplo ? PLANO_EJEMPLO : (planoGuardado || null);
  const posiciones = useMemo(() => (plano ? posicionesDelPlano(plano) : []), [plano]);
  const inventario = useMemo(() => {
    if (ejemplo) return inventarioEjemplo();
    if (!datos) return vacioInv;
    return inventarioPorCodigo(datos, new Set(posiciones.map(p => p.cod)));
  }, [ejemplo, datos, posiciones]);
  const info = useMemo(() => new Map(posiciones.map(p => { const items = itemsEnDia(inventario.porCodigo.get(p.cod) || [], dia); return [p.cod, { items, lleno: items.length > 0, estado: estadoPosicion(p, items), valor: valorItems(items), dias: diasItems(items) }]; })), [posiciones, inventario, dia]);
  const porcentajeRack = useCallback(r => { const ps = posiciones.filter(p => p.rackId === r.id); return ps.length ? ps.filter(p => info.get(p.cod)?.lleno).length / ps.length : 0; }, [posiciones, info]);
  const conStock = useMemo(() => new Set(inventario.porCodigo.keys()), [inventario]);
  const conStockEditor = useMemo(() => {
    if (ejemplo || !datos) return conStock;
    // cualquier ubicación del almacén con stock, aunque hoy no esté en el plano
    const ids = new Set(datos.stock.filter(s => Number(s.fisico) > 0 || Number(s.reservado) > 0).map(s => s.ubicacion_id));
    return new Set(datos.ubicaciones.filter(u => ids.has(u.id)).map(u => u.codigo));
  }, [ejemplo, datos, conStock]);

  const resumen = useMemo(() => {
    const vals = [...info.values()];
    const n = k => vals.filter(v => v.estado === k).length;
    return { total: posiciones.length, ocupadas: vals.filter(v => v.lleno).length, reservado: n('reservado'), cuarentena: n('cuarentena'), reorden: n('reorden'), valor: vals.reduce((a, v) => a + v.valor, 0), maxValor: Math.max(0, ...vals.map(v => v.valor)) };
  }, [info, posiciones]);
  const indice = useMemo(() => { const out = []; posiciones.forEach(p => (info.get(p.cod)?.items || []).forEach(i => out.push({ p, i }))); return out; }, [posiciones, info]);
  const hits = useMemo(() => { const q = busqueda.trim().toLowerCase(); if (q.length < 2) return null; return indice.filter(x => `${x.i.codigo} ${x.i.desc}`.toLowerCase().includes(q)); }, [busqueda, indice]);
  const resaltados = useMemo(() => (hits ? new Set(hits.map(h => h.p.cod)) : null), [hits]);
  const alertas = useMemo(() => indice.filter(x => x.i.bajoReorden && !['cuarentena', 'merma'].includes(x.p.uso)), [indice]);
  const posSel = seleccion ? posiciones.find(p => p.cod === seleccion) : null;

  const seleccionar = useCallback(p => { setRuta(null); setSeleccion(p ? p.cod : null); }, []);
  const guardar = async B => {
    setGuardando(true); setErrorGuardar('');
    try {
      const r = await guardarPlanoAlmacen({ empresaId, almacenId, layout: B, version: datos?.plano?.version || 0 });
      await cargar();
      setAlmacenes(lista => lista.map(a => a.id === almacenId ? { ...a, plano: { version: r?.version } } : a));
      setAviso(`Plano guardado · ${r?.creadas || 0} ubicaciones creadas, ${r?.actualizadas || 0} actualizadas, ${r?.desactivadas || 0} desactivadas.`);
      setTimeout(() => setAviso(''), 5000);
    } catch (e) { setErrorGuardar(mensaje(e)); }
    finally { setGuardando(false); }
  };
  const conGuardia = accion => { if (tab === 'editor' && sucio) setSalida(() => accion); else accion(); };
  const cambiarTab = t => { if (t === tab) return; conGuardia(() => { setSucio(false); setTab(t); }); };
  useEffect(() => { if (!sucio || typeof window === 'undefined') return undefined; const h = e => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [sucio]);

  const cls = 'dx-ui dx-gem';
  if (sesion.cargando || sesion.estado === 'cargando') return <section className={cls}><div className="dx-ui-empty">Cargando sesión operativa…</div></section>;
  if (!empresaId || ['sin_empresa', 'sin_sesion'].includes(sesion.estado)) return <section className={cls}><div className="dx-ui-empty">Selecciona o solicita acceso a una empresa para ver el almacén.</div></section>;
  if (!permisos.cargados) return <section className={cls}><div className="dx-ui-empty">Cargando permisos de inventario…</div></section>;
  if (!permisos.ver) return <section className={cls}><div className="dx-ui-empty">{error || 'No tienes permiso para ver el inventario.'}</div></section>;

  const almacen = almacenes.find(a => a.id === almacenId);
  const puedeGuardar = permisos.editar && Boolean(sesion.permiteEscritura) && !ejemplo;
  const motivoNoGuardar = ejemplo ? 'Estás viendo datos de ejemplo: el plano no se guarda.' : !permisos.editar ? 'No tienes permiso para editar el inventario.' : !sesion.permiteEscritura ? 'Vista de solo lectura: selecciona una sociedad operativa para editar.' : '';
  const sinPlano = !plano;
  const it = posSel ? info.get(posSel.cod) : null;
  const rackSel = posSel?.rackId ? plano.racks.find(r => r.id === posSel.rackId) : null;
  const zonaSel = posSel?.zonaId ? plano.zonas.find(z => z.id === posSel.zonaId) : null;
  const rutaSel = posSel ? rutaDesdePuerta(plano, posSel) : null;
  const grupos = plano ? [...plano.racks.map(r => ({ t: `Rack ${r.cod}`, ps: posiciones.filter(p => p.rackId === r.id) })), ...plano.zonas.filter(z => z.piso).map(z => ({ t: z.nombre, ps: posiciones.filter(p => p.zonaId === z.id) }))] : [];

  return <section className={cls} ref={raizRef}>
    <header className="dx-ui-head-page">
      <div><div className="dx-ui-eyebrow">Almacén · WMS · Gemelo digital</div><h1 className="dx-ui-title">{almacen ? `${almacen.codigo} · ${almacen.nombre}` : 'Gemelo digital'}</h1><p className="dx-ui-sub">Vista 3D del almacén con la ocupación de cada posición según el stock real.</p></div>
      <div className="dx-ui-actions">
        <select className="dx-btn dx-gem-almacen" aria-label="Almacén" value={almacenId} onChange={e => { const id = e.target.value; conGuardia(() => { setSucio(false); setAlmacenId(id); setEjemplo(false); }); }}>
          {almacenes.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}{a.plano ? '' : ' (sin plano)'}</option>)}
        </select>
        <button type="button" className="dx-btn" aria-pressed={ejemplo} onClick={() => conGuardia(() => { setSucio(false); setEjemplo(v => !v); setSeleccion(null); setRuta(null); setBusqueda(''); })}>{ejemplo ? 'Volver a mis datos' : 'Ver con datos de ejemplo'}</button>
      </div>
    </header>
    {ejemplo && <div className="dx-gem-banner" role="status"><b>Datos de ejemplo: no es tu almacén.</b> Sirve para conocer el gemelo; nada se guarda.</div>}
    {!sesion.permiteEscritura && !ejemplo && <div className="dx-gem-banner is-gray" role="status">Vista de solo lectura. Selecciona una sociedad operativa para editar el plano.</div>}
    {error && <div className="dx-gem-banner is-red" role="alert">{error} <button type="button" className="dx-btn dx-gem-sm" onClick={cargar}>Reintentar</button></div>}
    {aviso && <div className="dx-gem-banner is-green" role="status">{aviso}</div>}

    <div className="dx-ui-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'vista'} className={`dx-ui-tab${tab === 'vista' ? ' on' : ''}`} onClick={() => cambiarTab('vista')}>Vista 3D</button>
      <button type="button" role="tab" aria-selected={tab === 'editor'} className={`dx-ui-tab${tab === 'editor' ? ' on' : ''}`} onClick={() => cambiarTab('editor')}>Editor de plano</button>
    </div>

    {cargando && !datos && !ejemplo && <div className="dx-ui-card"><div className="dx-ui-empty">Cargando el almacén…</div></div>}

    {tab === 'vista' && (datos || ejemplo) && (sinPlano ? <div className="dx-ui-card"><div className="dx-ui-empty dx-gem-vacio">
        <b>Este almacén todavía no tiene plano.</b>
        <span>Dibuja sus zonas y racks en el editor y el sistema generará las ubicaciones.</span>
        <div className="dx-gem-tools">{permisos.editar && <button type="button" className="dx-btn primary" onClick={() => setTab('editor')}>Dibujar el plano</button>}<button type="button" className="dx-btn" onClick={() => setEjemplo(true)}>Ver con datos de ejemplo</button></div>
      </div></div> : <>
      <div className="dx-ui-summary">
        <div className="dx-ui-chip"><b>{resumen.total}</b><span>posiciones</span></div>
        <div className="dx-ui-chip"><b>{resumen.total ? Math.round(resumen.ocupadas / resumen.total * 100) : 0}%</b><span>ocupación ({resumen.ocupadas})</span></div>
        <div className="dx-ui-chip"><b>{resumen.reservado}</b><span>con reserva de OT</span></div>
        <div className="dx-ui-chip"><b>{resumen.cuarentena}</b><span>en cuarentena</span></div>
        <div className="dx-ui-chip"><b>{resumen.reorden}</b><span>bajo reorden</span></div>
        <div className="dx-ui-chip"><b>{soles(resumen.valor)}</b><span>valor a costo promedio</span></div>
      </div>
      {inventario.fueraDelPlano.filas > 0 && dia === 0 && <div className="dx-gem-banner is-gray" role="status">{cant(inventario.fueraDelPlano.unidades)} unidades ({inventario.fueraDelPlano.filas} registros) están en ubicaciones fuera del plano: {inventario.fueraDelPlano.ubicaciones.slice(0, 4).join(', ')}{inventario.fueraDelPlano.ubicaciones.length > 4 ? '…' : ''}. Reubícalas desde Inventario &amp; Kardex para verlas en el 3D.</div>}
      <div className="dx-gem-grid">
        <div>
          <GemeloVista3D plano={plano} posiciones={posiciones} info={info} porcentajeRack={porcentajeRack} modo={modo} onModo={setModo} resaltados={resaltados} seleccion={seleccion} ruta={ruta} onSeleccionar={seleccionar} maxValor={resumen.maxValor} dia={dia} onDia={setDia} tema={tema} ejemplo={ejemplo} />
          <details className="dx-ui-card dx-gem-sum"><summary>Resumen textual por rack y zona</summary>
            <ul>{grupos.map(g => { const oc = g.ps.filter(p => info.get(p.cod)?.lleno).length; const ro = g.ps.filter(p => info.get(p.cod)?.estado === 'reorden').length; const val = g.ps.reduce((a, p) => a + (info.get(p.cod)?.valor || 0), 0);
              return <li key={g.t}><button type="button" onClick={() => { const p = g.ps.find(x => info.get(x.cod)?.lleno) || g.ps[0]; if (p) seleccionar(p); }}>{g.t}: {oc} de {g.ps.length} posiciones con stock{ro ? ` · ${ro} bajo reorden` : ''} · {soles(val, 0)}</button></li>; })}</ul>
          </details>
        </div>
        <aside className="dx-gem-side">
          <div className="dx-ui-card"><div className="dx-gem-sec">
            <h3>Buscar material</h3>
            <label className="dx-ui-search dx-gem-search"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg><input aria-label="Buscar material" placeholder="Código o descripción" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label>
            {hits && <div className="dx-gem-res">
              {hits.length ? <><small>{new Set(hits.map(h => h.p.cod)).size} posición(es) resaltadas en el 3D · {cant(hits.reduce((a, h) => a + h.i.fisico, 0))} en total</small>
                {hits.slice(0, 12).map((x, k) => <button key={k} type="button" onClick={() => seleccionar(x.p)}><span><b>{x.i.desc}</b><small>{x.i.codigo} · {cant(x.i.fisico)} {x.i.um}</small></span><span className="dx-gem-pos">{x.p.cod}</span></button>)}</>
                : <div className="dx-ui-empty dx-gem-empty-sm">Sin resultados en este almacén.</div>}
            </div>}
          </div></div>
          <div className="dx-ui-card"><div className="dx-gem-sec" aria-live="polite">
            {!posSel ? <div className="dx-ui-empty">Haz clic en una posición del 3D o busca un material para ver su contenido.</div> : <>
              <div className="dx-gem-det-h"><b>{posSel.cod}</b><span className={`dx-ui-pill ${ESTADOS[it.estado][1]}`}><i />{ESTADOS[it.estado][0]}</span><button type="button" className="dx-gem-mini" aria-label="Cerrar detalle" onClick={() => seleccionar(null)}>×</button></div>
              <div className="dx-gem-kv"><span>Ubicación</span><b>{rackSel ? `Rack ${rackSel.cod} · módulo ${posSel.m} · nivel ${posSel.n}` : `${zonaSel?.nombre || 'Zona'} · piso`}</b></div>
              <div className="dx-gem-kv"><span>Materiales</span><b>{it.items.length}</b></div>
              <div className="dx-gem-kv"><span>Valor a costo promedio</span><b>{soles(it.valor)}</b></div>
              {rackSel && <><div className="dx-gem-kv is-plain"><span>Ocupación del rack {rackSel.cod} por nivel</span></div>
                <div className="dx-gem-niv">{Array.from({ length: rackSel.niv }, (_, k) => rackSel.niv - k).map(n => { const ps = posiciones.filter(x => x.rackId === rackSel.id && x.n === n); const pc = ps.length ? Math.round(ps.filter(x => info.get(x.cod)?.lleno).length / ps.length * 100) : 0; return <div key={n}><span>Nivel {n}</span><span className="dx-gem-bar-niv"><i style={{ width: `${pc}%` }} /></span><span>{pc}%</span></div>; })}</div></>}
              {it.items.length ? it.items.map(i => <div key={i.materialId} className="dx-gem-mat"><b>{i.desc}</b><small>{i.codigo}{i.ultimo ? ` · último: ${i.ultimo}` : ''}{i.dias !== null && i.dias !== undefined ? ` · hace ${i.dias} días` : ''}</small>
                <div className="dx-gem-row"><span className="dx-ui-pill is-gray">Físico {cant(i.fisico)} {i.um}</span>{i.reservado > 0 && <span className="dx-ui-pill is-violet"><i />Reservado {cant(i.reservado)}</span>}{i.bajoReorden && <span className="dx-ui-pill is-red"><i />Bajo reorden</span>}</div></div>)
                : <div className="dx-ui-empty dx-gem-empty-sm">Posición vacía.</div>}
              {ruta && rutaSel && <div className="dx-gem-route">Recorrido de ≈ <b>{Math.round(rutaSel.d)} m</b> desde la {rutaSel.puerta} hasta {posSel.cod} por los pasillos.</div>}
              {!rutaSel && <div className="dx-gem-route">El plano no tiene puertas. Agrega una en el editor para calcular rutas.</div>}
              <div className="dx-gem-tools">
                {rutaSel && <button type="button" className="dx-btn" onClick={() => setRuta(ruta ? null : rutaSel.pts)}>{ruta ? 'Quitar ruta' : 'Ruta desde la puerta'}</button>}
                {!ejemplo && <a className="dx-btn" href="#/almacen-inventario">Ver en Inventario &amp; Kardex</a>}
              </div>
            </>}
          </div></div>
          <div className="dx-ui-card"><div className="dx-gem-sec"><h3>Bajo punto de reorden</h3>
            {alertas.length ? alertas.map((x, k) => <button key={k} type="button" className="dx-gem-alert" onClick={() => seleccionar(x.p)}><span><b>{x.i.desc}</b><small>{cant(x.i.fisico)} {x.i.um} en esta posición{x.i.reorden ? ` · reorden ${cant(x.i.reorden)}` : ''}</small></span><span className="dx-gem-pos">{x.p.cod}</span></button>)
              : <div className="dx-ui-empty dx-gem-empty-sm">{ejemplo ? 'Sin alertas.' : 'Sin alertas. Configura el punto de reorden de tus materiales para verlas aquí.'}</div>}
          </div></div>
        </aside>
      </div>
    </>)}

    {tab === 'editor' && (datos || ejemplo) && <GemeloEditor
      guardado={ejemplo ? PLANO_EJEMPLO : (planoGuardado || planoVacioMemo)}
      conStock={conStockEditor} puedeGuardar={puedeGuardar} motivoNoGuardar={motivoNoGuardar}
      guardando={guardando} errorGuardar={errorGuardar} onGuardar={guardar} onSucio={setSucio} oscuro={oscuro}
      inventario={inventario.porCodigo} />}

    {salida && <div className="dx-gem-modal" role="dialog" aria-modal="true" aria-labelledby="dx-gem-salida-t" onKeyDown={e => { if (e.key === 'Escape') setSalida(null); }}>
      <div className="dx-gem-modal-card">
        <h3 id="dx-gem-salida-t">Tienes cambios sin guardar</h3>
        <p>Si sales del editor se pierden los cambios del plano que no guardaste.</p>
        <div className="dx-gem-tools"><button type="button" className="dx-btn" autoFocus onClick={() => setSalida(null)}>Seguir editando</button><button type="button" className="dx-btn danger" onClick={() => { const a = salida; setSalida(null); a(); }}>Descartar y salir</button></div>
      </div>
    </div>}
  </section>;
}

const planoVacioMemo = planoVacio();

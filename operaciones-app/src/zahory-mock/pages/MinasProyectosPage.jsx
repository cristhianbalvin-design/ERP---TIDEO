import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { asignarAlmacenMina, crearAlmacenPeriferico, guardarMina, guardarProyectoMina, listarMinas } from '../../services/minasService.js';
import { contarResumenMinas, nombreAlmacen } from './minasProyectosLogic.js';

const mensaje = error => error?.message || 'No se pudo completar la operación.';
const vacios = { minas: [], proyectos_sin_mina: [], almacenes_centrales: [], cuentas: [] };

export function MinasProyectosPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const [datos, setDatos] = useState(vacios);
  const [minaId, setMinaId] = useState('');
  const [permisos, setPermisos] = useState({ ver: false, crear: false, editar: false, cargados: false });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [reintentoPermisos, setReintentoPermisos] = useState(0);
  const [errorAccion, setErrorAccion] = useState('');
  const [accion, setAccion] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [minaForm, setMinaForm] = useState({ id: null, cuenta_id: '', codigo: '', nombre: '', estado: 'activo' });
  const [proyectoForm, setProyectoForm] = useState({ modo: 'nuevo', proyecto_id: '', codigo: '', nombre: '', estado: 'activo' });
  const [almacenForm, setAlmacenForm] = useState({ modo: 'nuevo', almacen_id: '', codigo: '', nombre: '' });
  const puedeCrear = permisos.crear && Boolean(sesion.permiteEscritura);
  const puedeEditar = permisos.editar && Boolean(sesion.permiteEscritura);
  const seleccionada = datos.minas.find(mina => mina.id === minaId) || datos.minas[0] || null;
  const resumen = useMemo(() => contarResumenMinas(datos.minas), [datos.minas]);

  const cargar = useCallback(async () => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try {
      const resultado = await listarMinas({ empresa_id: empresaId });
      setDatos({ ...vacios, ...(resultado || {}) });
      setMinaId(actual => (resultado?.minas || []).some(item => item.id === actual) ? actual : (resultado?.minas?.[0]?.id || ''));
    } catch (e) { setError(mensaje(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver]);

  useEffect(() => {
    let vigente = true;
    if (sesion.cargando || sesion.estado !== 'listo' || !empresaId) return () => { vigente = false; };
    setPermisos(actual => ({ ...actual, cargados: false }));
    setError('');
    Promise.all(['ver', 'crear', 'editar'].map(target_accion => getSupabaseClient().rpc('usuario_puede', {
      target_empresa_id: empresaId, target_pantalla: 'inventario', target_accion,
    }))).then(resultados => {
      const fallo = resultados.find(item => item.error)?.error;
      if (fallo) throw fallo;
      if (vigente) setPermisos({ ver: Boolean(resultados[0].data), crear: Boolean(resultados[1].data), editar: Boolean(resultados[2].data), cargados: true });
    }).catch(e => { if (vigente) { setError(mensaje(e)); setPermisos(actual => ({ ...actual, cargados: true })); } });
    return () => { vigente = false; };
  }, [empresaId, sesion.cargando, sesion.estado, reintentoPermisos]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async operacion => {
    setOcupado(true); setErrorAccion('');
    try { await operacion(); setAccion(''); await cargar(); }
    catch (e) { setErrorAccion(mensaje(e)); }
    finally { setOcupado(false); }
  };
  const editarMina = mina => { setMinaForm(mina ? { id: mina.id, cuenta_id: mina.cuenta_id, codigo: mina.codigo, nombre: mina.nombre, estado: mina.estado } : { id: null, cuenta_id: '', codigo: '', nombre: '', estado: 'activo' }); setErrorAccion(''); setAccion('mina'); };

  if (sesion.cargando || sesion.estado === 'cargando') return <section className="dx-ui dx-minas"><div className="dx-ui-empty">Cargando sesión operativa…</div></section>;
  if (!empresaId || ['sin_empresa', 'sin_sesion'].includes(sesion.estado)) return <section className="dx-ui dx-minas"><div className="dx-ui-empty">Selecciona o solicita acceso a una empresa para ver minas.</div></section>;
  if (!permisos.cargados && !error) return <section className="dx-ui dx-minas"><div className="dx-ui-empty">Cargando permisos de inventario…</div></section>;
  if (error && !datos.minas.length && !permisos.ver) return <section className="dx-ui dx-minas"><div className="dx-min-alert" role="alert">{error}</div><button type="button" className="dx-btn" onClick={() => setReintentoPermisos(valor => valor + 1)}>Reintentar</button></section>;
  if (!permisos.ver) return <section className="dx-ui dx-minas"><div className="dx-ui-empty">No tienes permiso para ver minas y proyectos.</div></section>;

  return <section className="dx-ui dx-minas">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Almacén · WMS</div><h1 className="dx-ui-title">Minas y proyectos</h1><p className="dx-ui-sub">Gestiona proyectos y almacenes periféricos asociados a cada mina.</p></div>{puedeCrear && <button type="button" className="dx-btn primary" onClick={() => editarMina(null)}>Nueva mina</button>}</header>
    {!sesion.permiteEscritura && <div className="dx-min-readonly" role="status">Vista de solo lectura. Selecciona una sociedad operativa para editar.</div>}
    {error && <div className="dx-min-alert" role="alert">{error}<button type="button" className="dx-btn" onClick={cargar}>Reintentar</button></div>}
    {errorAccion && <div className="dx-min-alert" role="alert">{errorAccion}</div>}
    <div className="dx-ui-summary"><div className="dx-ui-chip"><b>{resumen.minas}</b><span>Minas</span></div><div className="dx-ui-chip"><b>{resumen.proyectos}</b><span>Proyectos en minas</span></div><div className="dx-ui-chip"><b>{resumen.sinAlmacen}</b><span>Minas sin periférico</span></div></div>
    {cargando && !datos.minas.length ? <div className="dx-ui-empty">Cargando minas…</div> : <div className="dx-min-grid">
      <div className="dx-ui-card"><div className="dx-ui-toolbar"><h2>Minas</h2><span className="dx-ui-count">{datos.minas.length} en total</span></div>
        {datos.minas.map(mina => <button type="button" key={mina.id} className={`dx-min-item${mina.id === seleccionada?.id ? ' on' : ''}`} onClick={() => { setMinaId(mina.id); setAccion(''); setErrorAccion(''); }}><span className="dx-ui-icon is-cyan">⛏</span><span><b>{mina.nombre}</b><small>{mina.cuenta_nombre || 'Sin cliente'} · {(mina.proyectos || []).length} proyectos</small></span><span className={`dx-ui-pill ${mina.estado === 'activo' ? 'is-green' : 'is-gray'}`}><i />{mina.estado === 'activo' ? 'Activa' : 'Inactiva'}</span></button>)}
        {!datos.minas.length && <div className="dx-ui-empty">Todavía no hay minas. Crea la primera para organizar sus proyectos y almacenes.</div>}
      </div>
      {seleccionada && <div className="dx-ui-card"><div className="dx-ui-toolbar"><h2>{seleccionada.nombre}</h2><span className={`dx-ui-pill ${seleccionada.estado === 'activo' ? 'is-green' : 'is-gray'}`}><i />{seleccionada.estado === 'activo' ? 'Activa' : 'Inactiva'}</span>{puedeEditar && <button type="button" className="dx-btn" onClick={() => editarMina(seleccionada)}>Editar mina</button>}</div>
        <section className="dx-min-sec"><h3>Proyectos</h3><p>Los proyectos se asignan a una mina o se crean directamente aquí.</p>
          {(seleccionada.proyectos || []).map(proyecto => <div className="dx-min-prow" key={proyecto.id}><span className="dx-ui-icon is-violet">▣</span><span><b>{proyecto.codigo} · {proyecto.nombre}</b></span><span className={`dx-ui-pill ${proyecto.estado === 'activo' ? 'is-green' : 'is-gray'} sp`}><i />{proyecto.estado}</span></div>)}
          {!(seleccionada.proyectos || []).length && <div className="dx-ui-empty dx-min-empty">Esta mina todavía no tiene proyectos.</div>}
          <div className="dx-min-actions">{puedeCrear && <button type="button" className="dx-btn" onClick={() => { setProyectoForm({ modo: 'nuevo', proyecto_id: '', codigo: '', nombre: '', estado: 'activo' }); setAccion('proyecto'); }}>+ Nuevo proyecto</button>}{puedeEditar && datos.proyectos_sin_mina.some(proyecto => proyecto.cuenta_id === seleccionada.cuenta_id) && <button type="button" className="dx-btn" onClick={() => { setProyectoForm({ modo: 'asignar', proyecto_id: '', codigo: '', nombre: '', estado: null }); setAccion('proyecto'); }}>Asignar proyecto existente</button>}</div>
        </section>
        <section className="dx-min-sec"><h3>Almacenes periféricos</h3><p>Una mina puede tener varios almacenes periféricos; cada almacén pertenece a una sola mina.</p>
          {(seleccionada.almacenes || []).map(almacen => <div className="dx-min-alm" key={almacen.id}><span className="dx-ui-icon is-cyan">▤</span><span><b>{nombreAlmacen(almacen)}</b><small className="dx-min-hint">{Number(almacen.materiales || 0).toLocaleString('es-PE')} materiales · {Number(almacen.unidades || 0).toLocaleString('es-PE')} unidades</small></span>{puedeEditar && <button type="button" className="dx-btn" disabled={ocupado} onClick={() => guardar(() => asignarAlmacenMina({ empresa_id: empresaId, almacen_id: almacen.id, mina_id: null }))}>Devolver a central</button>}</div>)}
          {!(seleccionada.almacenes || []).length && <div className="dx-ui-empty dx-min-empty">Esta mina todavía no tiene almacenes periféricos.</div>}
          {(puedeCrear || (puedeEditar && datos.almacenes_centrales.length > 0)) && <div className="dx-min-actions"><button type="button" className="dx-btn" onClick={() => { setAlmacenForm({ modo: puedeCrear ? 'nuevo' : 'asignar', almacen_id: '', codigo: '', nombre: '' }); setAccion('almacen'); }}>+ Agregar almacén periférico</button></div>}
        </section>
      </div>}
    </div>}
    <section className="dx-ui-card dx-min-sin-mina"><div className="dx-ui-toolbar"><h2>Proyectos sin mina</h2><span className="dx-ui-count">{datos.proyectos_sin_mina.length} proyectos</span></div>{datos.proyectos_sin_mina.map(proyecto => <div className="dx-min-prow" key={proyecto.id}><span><b>{proyecto.codigo} · {proyecto.nombre}</b><small>{proyecto.cuenta_nombre || 'Sin cliente'}</small></span><span className="dx-ui-pill is-gray sp"><i />{proyecto.estado}</span></div>)}{!datos.proyectos_sin_mina.length && <div className="dx-ui-empty">No hay proyectos sin mina.</div>}</section>
    {accion === 'mina' && <div className="dx-min-overlay"><form className="dx-min-modal" onSubmit={e => { e.preventDefault(); guardar(() => guardarMina({ empresa_id: empresaId, ...minaForm })); }}><h3>{minaForm.id ? 'Editar mina' : 'Nueva mina'}</h3><div className="dx-min-field"><label htmlFor="dx-min-cuenta">Cliente (cuenta)</label><select id="dx-min-cuenta" required value={minaForm.cuenta_id} onChange={e => setMinaForm({ ...minaForm, cuenta_id: e.target.value })}><option value="">Selecciona un cliente</option>{datos.cuentas.map(cuenta => <option key={cuenta.id} value={cuenta.id}>{cuenta.razon_social}</option>)}</select></div><div className="dx-min-field"><label htmlFor="dx-min-codigo">Código</label><input id="dx-min-codigo" required value={minaForm.codigo} onChange={e => setMinaForm({ ...minaForm, codigo: e.target.value })} /></div><div className="dx-min-field"><label htmlFor="dx-min-nombre">Nombre</label><input id="dx-min-nombre" required value={minaForm.nombre} onChange={e => setMinaForm({ ...minaForm, nombre: e.target.value })} /></div><div className="dx-min-field"><label htmlFor="dx-min-estado">Estado</label><select id="dx-min-estado" value={minaForm.estado} onChange={e => setMinaForm({ ...minaForm, estado: e.target.value })}><option value="activo">Activa</option><option value="inactivo">Inactiva</option></select></div>{errorAccion && <div className="dx-min-alert" role="alert">{errorAccion}</div>}<div className="dx-min-modal-actions"><button type="button" className="dx-btn" onClick={() => setAccion('')}>Cancelar</button><button className="dx-btn primary" disabled={ocupado || (minaForm.id ? !puedeEditar : !puedeCrear)}>{ocupado ? 'Guardando…' : 'Guardar mina'}</button></div></form></div>}
    {accion === 'proyecto' && seleccionada && <div className="dx-min-overlay"><form className="dx-min-modal" onSubmit={e => { e.preventDefault(); guardar(() => guardarProyectoMina({ empresa_id: empresaId, mina_id: seleccionada.id, proyecto_id: proyectoForm.modo === 'asignar' ? proyectoForm.proyecto_id : null, codigo: proyectoForm.modo === 'nuevo' ? proyectoForm.codigo : null, nombre: proyectoForm.modo === 'nuevo' ? proyectoForm.nombre : null, estado: proyectoForm.modo === 'nuevo' ? proyectoForm.estado : null })); }}><h3>{proyectoForm.modo === 'nuevo' ? 'Nuevo proyecto' : 'Asignar proyecto existente'}</h3>{proyectoForm.modo === 'asignar' ? <div className="dx-min-field"><label htmlFor="dx-min-proyecto">Proyecto sin mina</label><select id="dx-min-proyecto" required value={proyectoForm.proyecto_id} onChange={e => setProyectoForm({ ...proyectoForm, proyecto_id: e.target.value })}><option value="">Selecciona un proyecto</option>{datos.proyectos_sin_mina.filter(p => p.cuenta_id === seleccionada.cuenta_id).map(proyecto => <option key={proyecto.id} value={proyecto.id}>{proyecto.codigo} · {proyecto.nombre}</option>)}</select></div> : <><div className="dx-min-field"><label htmlFor="dx-min-pry-codigo">Código</label><input id="dx-min-pry-codigo" required value={proyectoForm.codigo} onChange={e => setProyectoForm({ ...proyectoForm, codigo: e.target.value })} /></div><div className="dx-min-field"><label htmlFor="dx-min-pry-nombre">Nombre</label><input id="dx-min-pry-nombre" required value={proyectoForm.nombre} onChange={e => setProyectoForm({ ...proyectoForm, nombre: e.target.value })} /></div><div className="dx-min-field"><label htmlFor="dx-min-pry-estado">Estado</label><select id="dx-min-pry-estado" value={proyectoForm.estado} onChange={e => setProyectoForm({ ...proyectoForm, estado: e.target.value })}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div></>}{errorAccion && <div className="dx-min-alert" role="alert">{errorAccion}</div>}<div className="dx-min-modal-actions"><button type="button" className="dx-btn" onClick={() => setAccion('')}>Cancelar</button><button className="dx-btn primary" disabled={ocupado || (proyectoForm.modo === 'nuevo' ? !puedeCrear : !puedeEditar)}>{ocupado ? 'Guardando…' : 'Guardar proyecto'}</button></div></form></div>}
    {accion === 'almacen' && seleccionada && <div className="dx-min-overlay"><form className="dx-min-modal" onSubmit={e => { e.preventDefault(); guardar(() => almacenForm.modo === 'nuevo' ? crearAlmacenPeriferico({ empresa_id: empresaId, mina_id: seleccionada.id, codigo: almacenForm.codigo, nombre: almacenForm.nombre }) : asignarAlmacenMina({ empresa_id: empresaId, almacen_id: almacenForm.almacen_id, mina_id: seleccionada.id })); }}><h3>Agregar almacén periférico</h3><div className="dx-min-field"><label htmlFor="dx-min-almacen-existente">Asignar almacén central existente</label><select id="dx-min-almacen-existente" value={almacenForm.modo === 'asignar' ? almacenForm.almacen_id : ''} onChange={e => setAlmacenForm({ ...almacenForm, modo: 'asignar', almacen_id: e.target.value })}><option value="">Selecciona almacén central</option>{datos.almacenes_centrales.map(item => <option key={item.id} value={item.id}>{nombreAlmacen(item)}</option>)}</select><span className="dx-min-hint">Solo almacenes centrales activos. Si tiene stock fuera de General, el RPC mostrará el error.</span></div><div className="dx-min-divider">o crear uno nuevo</div><div className="dx-min-field"><label htmlFor="dx-min-alm-codigo">Código del nuevo almacén</label><input value={almacenForm.modo === 'nuevo' ? almacenForm.codigo : ''} id="dx-min-alm-codigo" onFocus={() => setAlmacenForm(actual => ({ ...actual, modo: 'nuevo' }))} onChange={e => setAlmacenForm({ ...almacenForm, modo: 'nuevo', codigo: e.target.value })} required={almacenForm.modo === 'nuevo'} /></div><div className="dx-min-field"><label htmlFor="dx-min-alm-nombre">Nombre del nuevo almacén</label><input value={almacenForm.modo === 'nuevo' ? almacenForm.nombre : ''} id="dx-min-alm-nombre" onFocus={() => setAlmacenForm(actual => ({ ...actual, modo: 'nuevo' }))} onChange={e => setAlmacenForm({ ...almacenForm, modo: 'nuevo', nombre: e.target.value })} required={almacenForm.modo === 'nuevo'} /></div>{errorAccion && <div className="dx-min-alert" role="alert">{errorAccion}</div>}<div className="dx-min-modal-actions"><button type="button" className="dx-btn" onClick={() => setAccion('')}>Cancelar</button><button className="dx-btn primary" disabled={ocupado || (almacenForm.modo === 'nuevo' ? !puedeCrear : !puedeEditar)}>{ocupado ? 'Guardando…' : 'Guardar almacén'}</button></div></form></div>}
  </section>;
}

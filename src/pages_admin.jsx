import React, { useState, useEffect, useMemo } from 'react';
import { I, money } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { SIDEBAR } from './shell.jsx';
import { getSupabaseClient } from './lib/supabaseClient.js';

// Roles builder, Usuarios, Tenants/Planes, and simple stub pages

function Roles() {
  const { roles, clonarRol, actualizarPermisosRol, crearRol, eliminarRol, editarRol, usuarios, setUsuarios, addNotificacion } = useApp();
  const rolKeys = Object.keys(roles);
  const [sel, setSel] = useState(rolKeys.includes('comercial') ? 'comercial' : rolKeys[0] || '');
  const [tab, setTab] = useState('permisos');
  const role = roles[sel];
  const allowed = useMemo(() => new Set(role?.permisos?.ver || []), [role?.permisos?.ver]);
  const [preview, setPreview] = useState(false);

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalClonar, setModalClonar] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoDesc, setNuevoDesc] = useState('');
  const [clonarNombre, setClonarNombre] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [reasignarUsuario, setReasignarUsuario] = useState(null);
  const [reasignarRolId, setReasignarRolId] = useState('');

  // Sync sel cuando se elimina un rol
  useEffect(() => {
    if (!rolKeys.length) return;
    if (!sel || !roles[sel]) setSel(rolKeys[0]);
  }, [rolKeys, roles, sel]);

  const handleNuevoRol = async () => {
    if (!nuevoNombre.trim()) return;
    const newId = await crearRol({ nombre: nuevoNombre.trim(), descripcion: nuevoDesc.trim() });
    if (newId) setSel(newId);
    setModalNuevo(false);
    setNuevoNombre('');
    setNuevoDesc('');
  };

  const handleClonar = () => {
    if (!clonarNombre.trim()) return;
    const newId = clonarRol(sel, clonarNombre.trim());
    if (newId) setSel(newId);
    setModalClonar(false);
    setClonarNombre('');
  };

  const handleEliminar = () => {
    if (rolKeys.length <= 1) { addNotificacion('No puedes eliminar el único rol.', 'error'); return; }
    if (!confirm(`¿Eliminar el rol "${role?.nombre}"? Esta acción no se puede deshacer.`)) return;
    eliminarRol(sel);
  };

  const handleSaveMeta = () => {
    editarRol(sel, { nombre: editNombre, descripcion: editDesc });
    setEditingMeta(false);
  };

  const handleReasignar = () => {
    setUsuarios(prev => prev.map(u => u.id === reasignarUsuario.id ? { ...u, rol: reasignarRolId } : u));
    addNotificacion(`${reasignarUsuario.nombre} reasignado a "${roles[reasignarRolId]?.nombre || reasignarRolId}".`);
    setReasignarUsuario(null);
  };

  if (!role) {
    return (
      <div className="page-header">
        <div>
          <h1 className="page-title">Roles y Permisos</h1>
          <div className="page-sub">{rolKeys.length ? 'Cargando rol seleccionado...' : 'Cargando roles desde Supabase...'}</div>
        </div>
      </div>
    );
  }

  const cb = (p, act) => {
    let realKey = act;
    let isChecked;
    if (act === 'costos')        { realKey = 'ver_costos';   isChecked = role.permisos.ver_costos   || role.permisos.todo; }
    else if (act === 'finanzas') { realKey = 'ver_finanzas'; isChecked = role.permisos.ver_finanzas || role.permisos.todo; }
    else if (act === 'precios')  { realKey = 'ver_precios';  isChecked = role.permisos.ver_precios  || role.permisos.todo; }
    else {
      // ver, crear, editar, anular, aprobar, exportar — per-screen arrays
      const arr = role.permisos[act];
      isChecked = Array.isArray(arr) ? arr.includes(p.key) : (arr === true || role.permisos.todo);
    }
    return (
      <td key={act} style={{textAlign:'center'}}>
        <input type="checkbox" className="checkbox" checked={isChecked || false}
          onChange={e => actualizarPermisosRol(sel, p.key, realKey, e.target.checked)}
          disabled={role.permisos.plataforma && act === 'ver'}/>
      </td>
    );
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Roles y Permisos</h1><div className="page-sub">{rolKeys.length} roles configurados · permisos granulares por pantalla</div></div>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => { setClonarNombre(`Copia de ${role.nombre}`); setModalClonar(true); }}>{I.copy} Clonar rol</button>
          <button className="btn btn-primary" onClick={() => setModalNuevo(true)}>{I.plus} Nuevo rol</button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'280px 1fr', gap:20}}>
        {/* Sidebar roles */}
        <div className="card" style={{height:'fit-content'}}>
          <div className="card-head"><h3>Roles</h3></div>
          <div style={{padding:8}}>
            {Object.entries(roles).map(([k,r])=>(
              <div key={k} onClick={()=>setSel(k)} style={{padding:'10px 12px', borderRadius:8, cursor:'pointer', background:sel===k?'var(--surface-hover)':'transparent', borderLeft:sel===k?'3px solid var(--cyan)':'3px solid transparent', position:'relative'}}>
                <div style={{fontWeight:600, fontSize:13}}>{r.nombre}</div>
                <div className="text-muted" style={{fontSize:11,marginTop:2}}>{r.descripcion}</div>
                <div className="text-subtle" style={{fontSize:11,marginTop:4}}>{usuarios.filter(u=>u.rol===k).length} usuarios</div>
                {sel === k && (
                  <button className="icon-btn" style={{position:'absolute',top:8,right:4,opacity:0.4,fontSize:11}} title="Eliminar rol"
                    onClick={e => { e.stopPropagation(); handleEliminar(); }}>{I.trash}</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho */}
        <div className="card">
          <div className="card-head">
            {editingMeta ? (
              <div className="col" style={{gap:8, flex:1}}>
                <input className="input" value={editNombre} onChange={e=>setEditNombre(e.target.value)} style={{fontWeight:700, fontSize:16}}/>
                <input className="input" value={editDesc} onChange={e=>setEditDesc(e.target.value)} style={{fontSize:12}}/>
                <div className="row" style={{gap:6}}>
                  <button className="btn btn-sm btn-primary" onClick={handleSaveMeta}>Guardar</button>
                  <button className="btn btn-sm btn-secondary" onClick={()=>setEditingMeta(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="row" style={{gap:8, flex:1}}>
                <div>
                  <h3>{role.nombre}</h3>
                  <div className="text-muted" style={{fontSize:12,marginTop:2}}>{role.descripcion}</div>
                </div>
                <button className="icon-btn" style={{opacity:0.4}} title="Editar nombre" onClick={()=>{ setEditNombre(role.nombre); setEditDesc(role.descripcion||''); setEditingMeta(true); }}>{I.edit}</button>
              </div>
            )}
            <button className="btn btn-secondary btn-sm" onClick={()=>setPreview(true)}>{I.eye} ¿Cómo ve la app este rol?</button>
          </div>

          <div style={{padding:'0 20px'}}>
            <div className="tabs">
              <div className={'tab '+(tab==='permisos'?'active':'')} onClick={()=>setTab('permisos')}>Permisos por pantalla</div>
              <div className={'tab '+(tab==='especiales'?'active':'')} onClick={()=>setTab('especiales')}>Permisos especiales</div>
              <div className={'tab '+(tab==='usuarios'?'active':'')} onClick={()=>setTab('usuarios')}>Usuarios asignados</div>
            </div>
          </div>

          {tab === 'permisos' && (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr>
                  <th>Pantalla</th>
                  {['Ver','Crear','Editar','Anular','Aprobar','Export','Costos','Precios','Finanzas'].map(h=>(<th key={h} style={{textAlign:'center'}}>{h}</th>))}
                </tr></thead>
                <tbody>{MOCK.pantallasPermisos.map((p,i)=>(
                  <tr key={i}>
                    <td><div className="text-subtle" style={{fontSize:10,textTransform:'uppercase',letterSpacing:'0.08em'}}>{p.modulo}</div><strong>{p.pantalla}</strong></td>
                    {cb(p,'ver')}{cb(p,'crear')}{cb(p,'editar')}{cb(p,'anular')}{cb(p,'aprobar')}{cb(p,'exportar')}{cb(p,'costos')}{cb(p,'precios')}{cb(p,'finanzas')}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {tab === 'especiales' && (
            <div className="card-body col" style={{gap:14}}>
              {[
                {l:'Aprobar descuentos en cotizaciones', k:'aprobar_descuentos'},
                {l:'Ver salario y costo hora del personal', k:'ver_costos'},
                {l:'Puede anular documentos emitidos', k:'anular_documentos'},
                {l:'Acceso a vistas de campo móviles', k:'acceso_campo'},
                {l:'Ver información financiera (CxC, CxP, tesorería)', k:'ver_finanzas'},
              ].map(x=>(
                <div key={x.k} className="row" style={{justifyContent:'space-between',padding:12,border:'1px solid var(--border)',borderRadius:8}}>
                  <div style={{fontSize:13}}>{x.l}</div>
                  <div className={'toggle '+((role.permisos[x.k]||role.permisos.todo)?'on':'')} style={{cursor:'pointer'}}
                    onClick={()=>actualizarPermisosRol(sel, null, x.k, !(role.permisos[x.k]||role.permisos.todo))}/>
                </div>
              ))}
              <div className="row" style={{justifyContent:'space-between',padding:12,border:'1px solid var(--border)',borderRadius:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>Monto máximo para aprobar compras</div>
                  <div className="text-muted" style={{fontSize:11,marginTop:2}}>0 = no puede aprobar compras</div>
                </div>
                <input className="input" style={{width:140,textAlign:'right'}}
                  key={sel}
                  defaultValue={role.permisos.monto_max_compras ?? (role.permisos.plataforma ? '' : '0')}
                  placeholder="S/ 0"
                  onBlur={e => actualizarPermisosRol(sel, null, 'monto_max_compras', Number(e.target.value.replace(/[^0-9]/g,'')) || 0)}/>
              </div>
              <div className="row" style={{justifyContent:'space-between',padding:12,border:'1px solid var(--border)',borderRadius:8}}>
                <div style={{fontSize:13,fontWeight:500}}>Perfil de campo</div>
                <select className="select" style={{width:180}}
                  key={sel}
                  value={role.permisos.perfil_campo || 'ninguno'}
                  onChange={e => actualizarPermisosRol(sel, null, 'perfil_campo', e.target.value === 'ninguno' ? null : e.target.value)}>
                  <option value="ninguno">Ninguno</option>
                  <option value="Técnico">Técnico</option>
                  <option value="Vendedor">Vendedor</option>
                  <option value="Compras">Compras</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Gerencia">Gerencia</option>
                </select>
              </div>
            </div>
          )}

          {tab === 'usuarios' && (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Usuario</th><th>Email</th><th>Área</th><th>Último acceso</th><th></th></tr></thead>
                <tbody>
                  {usuarios.filter(u=>u.rol===sel).length === 0 && (
                    <tr><td colSpan={5} style={{textAlign:'center',color:'var(--fg-muted)',padding:24}}>Ningún usuario asignado a este rol.</td></tr>
                  )}
                  {usuarios.filter(u=>u.rol===sel).map(u=>(
                    <tr key={u.id}>
                      <td><strong>{u.nombre}</strong></td>
                      <td className="text-muted">{u.email}</td>
                      <td>{u.area}</td>
                      <td className="text-muted">{u.ultimo || u.ultimo_login || '—'}</td>
                      <td><button className="btn btn-sm btn-ghost" onClick={()=>{ setReasignarUsuario(u); setReasignarRolId(sel); }}>Reasignar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Nuevo rol */}
      {modalNuevo && <>
        <div className="side-panel-backdrop" onClick={()=>setModalNuevo(false)}/>
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:12,padding:28,width:420,zIndex:200,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
          <h3 style={{marginBottom:20}}>Nuevo rol</h3>
          <div className="col" style={{gap:14}}>
            <div className="input-group">
              <label>Nombre del rol *</label>
              <input className="input" value={nuevoNombre} onChange={e=>setNuevoNombre(e.target.value)} placeholder="Ej: Coordinador de Ventas" autoFocus onKeyDown={e=>e.key==='Enter'&&handleNuevoRol()}/>
            </div>
            <div className="input-group">
              <label>Descripción</label>
              <input className="input" value={nuevoDesc} onChange={e=>setNuevoDesc(e.target.value)} placeholder="Breve descripción del rol"/>
            </div>
          </div>
          <div className="row" style={{gap:8,marginTop:24,justifyContent:'flex-end'}}>
            <button className="btn btn-secondary" onClick={()=>setModalNuevo(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleNuevoRol} disabled={!nuevoNombre.trim()}>Crear rol</button>
          </div>
        </div>
      </>}

      {/* Modal: Clonar rol */}
      {modalClonar && <>
        <div className="side-panel-backdrop" onClick={()=>setModalClonar(false)}/>
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:12,padding:28,width:420,zIndex:200,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
          <h3 style={{marginBottom:8}}>Clonar rol</h3>
          <div className="text-muted" style={{fontSize:12,marginBottom:20}}>Se copiará "{role.nombre}" con todos sus permisos.</div>
          <div className="input-group">
            <label>Nombre del nuevo rol *</label>
            <input className="input" value={clonarNombre} onChange={e=>setClonarNombre(e.target.value)} autoFocus onKeyDown={e=>e.key==='Enter'&&handleClonar()}/>
          </div>
          <div className="row" style={{gap:8,marginTop:24,justifyContent:'flex-end'}}>
            <button className="btn btn-secondary" onClick={()=>setModalClonar(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleClonar} disabled={!clonarNombre.trim()}>Clonar</button>
          </div>
        </div>
      </>}

      {/* Modal: Reasignar usuario */}
      {reasignarUsuario && <>
        <div className="side-panel-backdrop" onClick={()=>setReasignarUsuario(null)}/>
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:12,padding:28,width:400,zIndex:200,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
          <h3 style={{marginBottom:8}}>Reasignar usuario</h3>
          <div className="text-muted" style={{fontSize:12,marginBottom:20}}>{reasignarUsuario.nombre} · {reasignarUsuario.email}</div>
          <div className="input-group">
            <label>Nuevo rol</label>
            <select className="select" value={reasignarRolId} onChange={e=>setReasignarRolId(e.target.value)}>
              {Object.entries(roles).map(([k,r])=><option key={k} value={k}>{r.nombre}</option>)}
            </select>
          </div>
          <div className="row" style={{gap:8,marginTop:24,justifyContent:'flex-end'}}>
            <button className="btn btn-secondary" onClick={()=>setReasignarUsuario(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleReasignar}>Confirmar</button>
          </div>
        </div>
      </>}

      {/* Preview sidebar */}
      {preview && <>
        <div className="side-panel-backdrop" onClick={()=>setPreview(false)}/>
        <div className="side-panel" style={{width:'min(420px, 92vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Vista previa · {role.nombre}</div>
              <div className="font-display" style={{fontSize:18,fontWeight:700,marginTop:2}}>Sidebar tal como lo ve este rol</div>
            </div>
            <button className="icon-btn" onClick={()=>setPreview(false)}>{I.x}</button>
          </div>
          <div style={{background:'var(--navy)',padding:20,flex:1,overflowY:'auto'}}>
            <div style={{color:'#fff'}}>
              {SIDEBAR.map((g,gi)=>{
                if (g.plataforma && !role.permisos.plataforma) return null;
                const items = g.items.filter(it => role.permisos.todo || allowed.has(it.key));
                if (!items.length) return null;
                return (
                  <div key={gi}>
                    {g.section && <div style={{fontSize:10,letterSpacing:'0.12em',color:'rgba(255,255,255,0.4)',textTransform:'uppercase',fontWeight:700,padding:'14px 4px 6px'}}>{g.section}</div>}
                    {items.map(it=>(
                      <div key={it.key} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:6,fontSize:13,color:'rgba(255,255,255,0.85)'}}>
                        <div style={{width:16,height:16,flexShrink:0}}>{it.icon}</div>
                        {it.label}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </>}
    </>
  );
}

function Usuarios() {
  const { usuarios, setUsuarios, addNotificacion, empresa, empresasPlataforma, crearUsuarioConAcceso, eliminarUsuario, roles: rolesCtx } = useApp();
  const [resetting, setResetting] = useState(null);
  const [tempPass, setTempPass] = useState('Tideo2026!');
  const [creando, setCreando] = useState(false);
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', email: '', rol: 'vendedor', area: '', password: '' });
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const handleReset = async () => {
    if (!resetting) return;
    try {
      const supabase = await getSupabaseClient();
      await supabase.auth.resetPasswordForEmail(resetting.email);
      addNotificacion(`Se envió un link de restablecimiento a ${resetting.email}`);
    } catch {
      addNotificacion(`Enlace de restablecimiento enviado a ${resetting.email}`);
    }
    setResetting(null);
  };

  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    setGuardandoNuevo(true);
    try {
      await crearUsuarioConAcceso(nuevoForm);
      setCreando(false);
      setNuevoForm({ nombre: '', email: '', rol: 'vendedor', area: '', password: '' });
    } catch { /* notificación ya mostrada */ }
    setGuardandoNuevo(false);
  };

  const rolesOpciones = Object.entries(rolesCtx || {}).filter(([,r]) => !r.es_superadmin);

  useEffect(() => {
    if (!rolesOpciones.length) return;
    if (rolesOpciones.some(([id]) => id === nuevoForm.rol)) return;
    setNuevoForm(p => ({ ...p, rol: rolesOpciones[0][0] }));
  }, [rolesOpciones, nuevoForm.rol]);

  const getEmpresa = (id) => {
    if (empresa?.id === id) return empresa.nombre;
    const found = (empresasPlataforma || []).find(e => e.id === id);
    return found ? found.nombre : (MOCK.empresas.find(e => e.id === id)?.nombre || 'Tenant asignado');
  };
  
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Usuarios</h1><div className="page-sub">{usuarios.length} usuarios · Acceso centralizado</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setCreando(true)}>{I.plus} Nuevo usuario</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Tenant</th><th>Área</th><th>Campo</th><th>Estado</th><th>Último login</th><th style={{textAlign:'right'}}>Acceso</th></tr></thead>
            <tbody>{usuarios.map(u=>{
              const r = MOCK.roles[u.rol] || { nombre: u.rol, color: 'gray' };
              return (
                <tr key={u.id}>
                  <td><div className="row"><div className="avatar" style={{width:28,height:28,fontSize:11}}>{u.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><strong>{u.nombre}</strong></div></td>
                  <td className="text-muted">{u.email}</td>
                  <td><span className={'badge badge-'+r.color}>{r.nombre}</span></td>
                  <td className="text-muted">{getEmpresa(u.empresa_id)}</td>
                  <td>{u.area}</td>
                  <td>{u.campo?<span className="badge badge-cyan">{I.mobile}{u.campoPerfil}</span>:<span className="text-subtle">—</span>}</td>
                  <td><span className="badge badge-green">{u.estado}</span></td>
                  <td className="text-muted">{u.ultimo || 'Nuevo'}</td>
                  <td style={{textAlign:'right'}}>
                    <div style={{display:'flex', gap:4, justifyContent:'flex-end'}}>
                      <button className="btn btn-ghost btn-sm" title="Enviar link de reset" onClick={() => setResetting(u)}>
                        <span style={{fontSize:16}}>🔑</span>
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Eliminar usuario" style={{color:'var(--danger)'}} onClick={() => eliminarUsuario(u.id)}>
                        <span style={{fontSize:15}}>🗑</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>

      {resetting && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-head">
              <h2>Asignar Contraseña Temporal</h2>
              <button className="icon-btn" onClick={() => setResetting(null)}>{I.x}</button>
            </div>
            <div className="modal-body col" style={{gap:16}}>
              <p style={{fontSize:13, color:'var(--fg-muted)'}}>
                Estás asignando una clave de acceso manual para <strong>{resetting.nombre}</strong>.
              </p>
              <div className="input-group">
                <label>Contraseña Temporal</label>
                <div style={{display:'flex', gap:8}}>
                  <input className="input" type="text" value={tempPass} onChange={e => setTempPass(e.target.value)} />
                  <button className="btn btn-secondary" onClick={() => setTempPass(Math.random().toString(36).slice(-8) + '!')}>Generar</button>
                </div>
              </div>
              <div className="modal-foot mt-4">
                <button className="btn btn-secondary" onClick={() => setResetting(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleReset}>Guardar y Notificar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {creando && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:480}}>
            <div className="modal-head">
              <h2>Nuevo usuario</h2>
              <button className="icon-btn" onClick={() => setCreando(false)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:14}} onSubmit={handleCrearUsuario}>
              <p style={{fontSize:13, color:'var(--fg-muted)'}}>
                Se creará una cuenta de acceso en Supabase Auth. El usuario deberá cambiar su contraseña al primer ingreso.
              </p>
              <div className="input-group">
                <label>Nombre completo</label>
                <input className="input" required value={nuevoForm.nombre} onChange={e => setNuevoForm(p => ({...p, nombre: e.target.value}))} />
              </div>
              <div className="input-group">
                <label>Email</label>
                <input className="input" type="email" required value={nuevoForm.email} onChange={e => setNuevoForm(p => ({...p, email: e.target.value}))} />
              </div>
              <div className="input-group">
                <label>Contraseña temporal</label>
                <div style={{display:'flex', gap:8}}>
                  <input className="input" required minLength={6} value={nuevoForm.password} onChange={e => setNuevoForm(p => ({...p, password: e.target.value}))} />
                  <button type="button" className="btn btn-secondary" onClick={() => setNuevoForm(p => ({...p, password: Math.random().toString(36).slice(-8) + '!'}))}>Generar</button>
                </div>
              </div>
              <div className="input-group">
                <label>Rol</label>
                <select className="input" value={nuevoForm.rol} onChange={e => setNuevoForm(p => ({...p, rol: e.target.value}))}>
                  {rolesOpciones.map(([id, r]) => <option key={id} value={id}>{r.nombre}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Área (opcional)</label>
                <input className="input" value={nuevoForm.area} onChange={e => setNuevoForm(p => ({...p, area: e.target.value}))} placeholder="Comercial, Operaciones..." />
              </div>
              <div className="modal-foot mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setCreando(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardandoNuevo}>{guardandoNuevo ? 'Creando...' : 'Crear usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function TenantsLegacy() {
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Empresas / Tenants</h1><div className="page-sub">2 tenants activos · 1 en plan Enterprise · 1 en Professional</div></div>
        <div className="row"><button className="btn btn-secondary">{I.download} Reporte plataforma</button><button className="btn btn-primary">{I.plus} Nueva empresa</button></div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Tenants activos</div><div className="kpi-value">2</div><div className="kpi-icon cyan">{I.building}</div></div>
        <div className="kpi-card"><div className="kpi-label">Usuarios totales</div><div className="kpi-value">27</div><div className="kpi-icon purple">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Storage plataforma</div><div className="kpi-value">12.4 GB</div><div className="kpi-icon orange">{I.package}</div></div>
        <div className="kpi-card"><div className="kpi-label">MRR estimado</div><div className="kpi-value">$ 3,200</div><div className="kpi-delta up">{I.arrowUp}+1 tenant</div><div className="kpi-icon green">{I.dollar}</div></div>
      </div>
      <div className="card mt-6"><div className="table-wrap"><table className="tbl">
        <thead><tr><th>Empresa</th><th>RUC</th><th>País</th><th>Plan</th><th>Usuarios</th><th>Storage</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          <tr><td><div className="row"><div style={{width:32,height:32,borderRadius:6,background:'var(--cyan-lt)',color:'var(--cyan-dk)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12}}>SI</div><strong>Servicios Industriales Norte SAC</strong></div></td>
            <td className="mono">20512345678</td><td>Perú</td>
            <td><span className="badge badge-purple">Enterprise</span></td>
            <td className="num">9 / 25</td><td className="num">7.2 GB</td>
            <td className="text-muted">31 Dic 2026</td>
            <td><span className="badge badge-green">Activo</span></td>
            <td><button className="btn btn-sm btn-ghost">Modo soporte</button></td>
          </tr>
          <tr><td><div className="row"><div style={{width:32,height:32,borderRadius:6,background:'var(--green-lt)',color:'var(--green-dk)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12}}>MA</div><strong>Mantenimiento Andes SRL</strong></div></td>
            <td className="mono">20598765432</td><td>Perú</td>
            <td><span className="badge badge-cyan">Professional</span></td>
            <td className="num">18 / 20</td><td className="num">5.2 GB</td>
            <td className="text-muted">15 Nov 2026</td>
            <td><span className="badge badge-green">Activo</span></td>
            <td><button className="btn btn-sm btn-ghost">Modo soporte</button></td>
          </tr>
        </tbody>
      </table></div></div>
    </>
  );
}

function Tenants() {
  const { empresasPlataforma = MOCK.empresas, usuarios = [] } = useApp();
  const tenants = empresasPlataforma.length ? empresasPlataforma : MOCK.empresas;
  const activos = tenants.filter(t => ['activa', 'activo'].includes(String(t.estado || '').toLowerCase())).length;
  const demos = tenants.filter(t => String(t.estado || '').toLowerCase() === 'demo').length;
  const paises = new Set(tenants.map(t => t.pais || 'PE')).size;
  const iniciales = (nombre = 'TN') => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const estadoBadge = (estado) => {
    const normal = String(estado || 'activa').toLowerCase();
    if (normal === 'suspendida' || normal === 'suspendido') return <span className="badge badge-orange">Suspendida</span>;
    if (normal === 'demo') return <span className="badge badge-cyan">Demo</span>;
    return <span className="badge badge-green">Activa</span>;
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Empresas / Tenants</h1><div className="page-sub">{activos} tenants activos · alta operativa sin dependencia de pagos</div></div>
        <div className="row"><button className="btn btn-secondary">{I.download} Reporte plataforma</button><button className="btn btn-primary">{I.plus} Nueva empresa</button></div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Tenants activos</div><div className="kpi-value">{activos}</div><div className="kpi-icon cyan">{I.building}</div></div>
        <div className="kpi-card"><div className="kpi-label">Usuarios vinculados</div><div className="kpi-value">{usuarios.length}</div><div className="kpi-icon purple">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Paises</div><div className="kpi-value">{paises}</div><div className="kpi-icon orange">{I.mapPin}</div></div>
        <div className="kpi-card"><div className="kpi-label">Tenants demo</div><div className="kpi-value">{demos}</div><div className="kpi-icon green">{I.clock}</div></div>
      </div>
      <div className="card mt-6"><div className="table-wrap"><table className="tbl">
        <thead><tr><th>Empresa</th><th>RUC / NIT</th><th>Pais</th><th>Moneda</th><th>Tenant ID</th><th>Fecha alta</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {tenants.map(t => {
            const nombre = t.nombre || t.nombre_comercial || t.razon_social || t.id;
            return (
              <tr key={t.id}>
                <td><div className="row"><div style={{width:32,height:32,borderRadius:6,background:'var(--cyan-lt)',color:'var(--cyan-dk)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12}}>{iniciales(nombre)}</div><strong>{nombre}</strong></div></td>
                <td className="mono">{t.ruc || 'Sin RUC'}</td>
                <td>{t.pais || 'PE'}</td>
                <td><span className="badge badge-cyan">{t.moneda_base || t.moneda || 'PEN'}</span></td>
                <td className="mono">{t.id}</td>
                <td className="text-muted">{t.fecha_inicio || (t.created_at ? String(t.created_at).slice(0, 10) : 'Hoy')}</td>
                <td>{estadoBadge(t.estado)}</td>
                <td><button className="btn btn-sm btn-ghost">Modo soporte</button></td>
              </tr>
            );
          })}
        </tbody>
      </table></div></div>
    </>
  );
}

function Planes() {
  const planes = [
    { nombre: 'Starter', precio: 99, usuarios: 5, modulos: ['CRM','Comercial','OT básico'], color: 'cyan' },
    { nombre: 'Professional', precio: 299, usuarios: 20, modulos: ['+ Finanzas','+ Inventario','+ Campo móvil'], color: 'green', popular: true },
    { nombre: 'Enterprise', precio: 799, usuarios: 50, modulos: ['+ Multitenant','+ API','+ SSO','+ Soporte 24/7'], color: 'purple' },
  ];
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Planes y Licencias</h1><div className="page-sub">Configuración de planes de suscripción del SaaS</div></div>
        <button className="btn btn-primary">{I.plus} Nuevo plan</button>
      </div>
      <div className="grid-3">{planes.map((p,i)=>(
        <div key={i} className="card" style={{padding:24, position:'relative', borderColor: p.popular?'var(--green)':'var(--border)', borderWidth: p.popular?'2px':'1px'}}>
          {p.popular && <div style={{position:'absolute',top:-12,right:20}} className="badge badge-green">Más popular</div>}
          <div className="eyebrow">{p.nombre}</div>
          <div style={{fontFamily:'Sora',fontSize:40,fontWeight:700,marginTop:4}}>${p.precio}<span style={{fontSize:14,color:'var(--fg-muted)',fontWeight:400}}>/mes</span></div>
          <div className="text-muted" style={{fontSize:13,marginTop:4}}>Hasta {p.usuarios} usuarios</div>
          <div className="col" style={{gap:6, margin:'20px 0', fontSize:13}}>
            {p.modulos.map((m,j)=>(<div key={j} className="row"><span style={{color:'var(--green)'}}>{I.check}</span>{m}</div>))}
          </div>
          <button className="btn btn-secondary" style={{width:'100%'}}>Configurar módulos</button>
        </div>
      ))}</div>
    </>
  );
}

// Stub pages for the rest
function Stub({title, description}) {
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">{title}</h1><div className="page-sub">{description}</div></div>
        <button className="btn btn-primary">{I.plus} Nuevo</button>
      </div>
      <div className="card" style={{padding:60, textAlign:'center', background:'var(--bg-subtle)', borderStyle:'dashed'}}>
        <div style={{width:48,height:48,margin:'0 auto 16px', borderRadius:12, background:'var(--surface)', display:'flex',alignItems:'center',justifyContent:'center',color:'var(--fg-muted)'}}>{I.clipboard}</div>
        <div style={{fontFamily:'Sora',fontSize:16,fontWeight:600,marginBottom:6}}>Módulo conectado a la arquitectura base</div>
        <div className="text-muted" style={{fontSize:13,maxWidth:480,margin:'0 auto'}}>Esta pantalla reutiliza los componentes de tabla, formularios y permisos ya construidos. El detalle funcional se expone en los módulos destacados del prototipo.</div>
      </div>
    </>
  );
}

// ============ CONFIGURACIÓN Y MAESTROS ============
function Maestros() {
  const { navigate, cuentas, proveedores, cargos, especialidades, tiposServicio, almacenes, sedes, industrias, crearCargo, crearEspecialidad, crearTipoServicio, crearAlmacen, crearSede, crearIndustria } = useApp();
  const [sel, setSel] = useState(null);
  const [clienteSearch, setClienteSearch] = useState('');
  const nuevoBase = { nombre:'', detalle:'', estado:'activo', area:'', requiere_cert:false, clasificacion:'', facturable:false, tipo:'', responsable:'', direccion:'', tipo_cargo:'' };
  const [rows, setRows] = useState({
    mst_clientes: [],
    mst_proveedores: [
      { codigo:'PRV-001', nombre:'Ferreteria Industrial SAC', detalle:'Ferreteria · Calificacion 4.5', estado:'activo' },
      { codigo:'PRV-002', nombre:'Electroandes', detalle:'Electricidad · Calificacion 5.0', estado:'activo' }
    ],
    mst_materiales: [
      { codigo:'ROD-001', nombre:'Rodamiento 6205 ZZ', detalle:'Und · barcode 775000620501', estado:'activo' },
      { codigo:'LUB-005', nombre:'Grasa Litio 500g', detalle:'Tarro · stock bajo', estado:'activo' }
    ],
    mst_impuestos: [
      { codigo:'IGV-18', nombre:'IGV 18%', detalle:'Impuesto ventas Peru', estado:'activo' },
      { codigo:'PEN', nombre:'Sol peruano', detalle:'Moneda base tenant', estado:'activo' }
    ]
  });
  const [nuevo, setNuevo] = useState(nuevoBase);
  const getSelectedRows = () => {
    if (!sel) return [];
    if (sel.id === 'mst_cargos') return cargos;
    if (sel.id === 'mst_especialidades') return especialidades;
    if (sel.id === 'mst_tipos_servicio') return tiposServicio;
    if (sel.id === 'mst_almacenes') return almacenes;
    if (sel.id === 'mst_sedes') return sedes;
    if (sel.id === 'mst_industrias') return industrias;
    return rows[sel.id] || [];
  };
  const selectedRows = getSelectedRows();

  const autoCode = (id, len) => {
    const prefixMap = { mst_cargos:'CAR', mst_especialidades:'ESP', mst_tipos_servicio:'TSI', mst_almacenes:'ALM', mst_sedes:'SED', mst_industrias:'IND', mst_clientes:'CLI', mst_proveedores:'PRV', mst_centros_costo:'CC', mst_materiales:'MAT', mst_impuestos:'TAX' };
    const prefix = prefixMap[id] || id.slice(4,7).toUpperCase();
    return `${prefix}-${String(len+1).padStart(3,'0')}`;
  };

  const addRow = async (e) => {
    e.preventDefault();
    if (!sel) return;
    const base = {
      codigo: autoCode(sel.id, selectedRows.length),
      nombre: nuevo.nombre || 'Nuevo valor',
      estado: nuevo.estado
    };
    try {
      if (sel.id === 'mst_cargos') {
        const item = { ...base, tipo:nuevo.tipo_cargo||'Administrativo', detalle:nuevo.detalle||'Pendiente de completar' };
        await crearCargo(item);
      } else if (sel.id === 'mst_especialidades') {
        const item = { ...base, area:nuevo.area||'General', requiere_cert:nuevo.requiere_cert, detalle:`${nuevo.area||'General'} · Cert: ${nuevo.requiere_cert?'Sí':'No'}` };
        await crearEspecialidad(item);
      } else if (sel.id === 'mst_tipos_servicio') {
        const item = { ...base, clasificacion:nuevo.clasificacion||'General', facturable:nuevo.facturable, detalle:`${nuevo.clasificacion||'General'} · ${nuevo.facturable?'Facturable':'No facturable'}` };
        await crearTipoServicio(item);
      } else if (sel.id === 'mst_almacenes') {
        const item = { ...base, tipo:nuevo.tipo||'Central', responsable:nuevo.responsable||'—', direccion:nuevo.direccion||'—', detalle:`${nuevo.tipo||'Central'} · ${nuevo.responsable||'—'}` };
        await crearAlmacen(item);
      } else if (sel.id === 'mst_sedes') {
        const item = { ...base, direccion:nuevo.direccion||'Sin dirección', gps:nuevo.gps||'', detalle: nuevo.gps ? `${nuevo.direccion||''} · GPS ${nuevo.gps}` : (nuevo.direccion||'Sin dirección') };
        await crearSede(item);
      } else if (sel.id === 'mst_industrias') {
        const item = { ...base, categoria:nuevo.detalle||'General', detalle:nuevo.detalle||'General' };
        await crearIndustria(item);
      } else {
        const item = { ...base, detalle:nuevo.detalle||'Pendiente de completar' };
        setRows(prev => ({ ...prev, [sel.id]: [item, ...(prev[sel.id]||[])] }));
      }
      setNuevo(nuevoBase);
    } catch (err) {
      console.error(err);
    }
  };

  const NOTAS_PANEL = {
    mst_especialidades: 'Estas especialidades se asignan al personal desde RRHH Operativo.',
    mst_tipos_servicio: 'Estos tipos se usan al crear Órdenes de Trabajo.',
    mst_almacenes: 'Los almacenes se administran con stock y movimientos desde el módulo de Inventario.'
  };

  const CodPreview = ({ id, len }) => (
    <div className="input-group">
      <label>Código <span style={{fontSize:10, color:'var(--fg-subtle)', fontWeight:400}}>· Auto-generado</span></label>
      <input className="input" readOnly value={autoCode(id, len)} style={{color:'var(--fg-muted)', cursor:'default', background:'var(--bg-subtle)'}}/>
    </div>
  );

  const renderForm = () => {
    if (sel?.id === 'mst_proveedores') return (
      <div style={{padding:'12px 16px', background:'rgba(26,43,74,0.08)', borderLeft:'3px solid var(--cyan)', borderRadius:6, fontSize:13, marginBottom:20}}>
        <p style={{marginBottom:8}}>Los proveedores se registran y gestionan desde <strong>Compras - Proveedores</strong>. Este catalogo es de referencia.</p>
        <button type="button" onClick={() => { setSel(null); navigate('proveedores'); }} style={{fontSize:13, color:'var(--cyan)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', padding:0}}>Ir a Proveedores</button>
      </div>
    );
    if (sel?.id === 'mst_clientes') return (
      <div style={{padding:'10px 16px', background:'rgba(6,182,212,0.06)', border:'1px solid var(--border)', borderLeft:'3px solid var(--cyan)', borderRadius:8, fontSize:13, marginBottom:16}}>
        Este catálogo es de <strong>solo lectura</strong>. Los clientes se crean desde el módulo de <strong>Leads</strong> (vía conversión) o desde <strong>Cuentas y Contactos</strong>. No se pueden agregar manualmente aquí.
        <span style={{marginLeft:10}}><button type="button" className="btn btn-ghost btn-sm" onClick={()=>navigate('cuentas')}>Ir a Cuentas →</button></span>
      </div>
    );
    if (sel?.id === 'mst_proveedores') return (
      <table className="tbl">
        <thead><tr><th>Codigo</th><th>Proveedor</th><th>Categoria</th><th>Estado</th><th>Responsable</th><th></th></tr></thead>
        <tbody>{proveedores.map(p => (
          <tr key={p.id}>
            <td className="mono text-muted">{p.codigo}</td>
            <td><strong>{p.razon_social}</strong><div className="text-muted" style={{fontSize:11}}>{p.ruc}</div></td>
            <td><span className="badge badge-cyan">{p.categoria}</span></td>
            <td><span className={'badge '+(p.estado==='homologado'?'badge-green':p.estado==='bloqueado'?'badge-red':p.estado==='observado'?'badge-orange':'badge-gray')}>{p.estado.replace('_',' ')}</span></td>
            <td>{p.responsable_compras || '-'}</td>
            <td><button className="btn btn-sm btn-ghost" onClick={()=>{ setSel(null); navigate('proveedores'); }}>Ir a ficha</button></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_cargos') return (
      <form className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={selectedRows.length}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre del cargo *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Analista de Calidad" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Tipo de personal *</label><select className="select" value={nuevo.tipo_cargo} onChange={e=>setNuevo(v=>({...v,tipo_cargo:e.target.value}))}><option value="">Seleccionar...</option><option value="Administrativo">Administrativo</option><option value="Operativo">Operativo</option><option value="Ambos">Ambos</option></select></div>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Descripción breve</label><input className="input" value={nuevo.detalle} onChange={e=>setNuevo(v=>({...v,detalle:e.target.value}))} placeholder="Ej: Responsable de análisis y reportes"/></div>
          <div style={{display:'flex', alignItems:'end'}}><button className="btn btn-primary" type="submit" style={{width:'100%'}}>{I.plus} Agregar cargo</button></div>
        </div>
      </form>
    );
    if (sel?.id === 'mst_especialidades') return (
      <form className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={selectedRows.length}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Electricista industrial" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Área</label><select className="select" value={nuevo.area} onChange={e=>setNuevo(v=>({...v,area:e.target.value}))}><option value="">Seleccionar...</option>{['Eléctrica','Mecánica','Civil','Instrumentación','Sistemas','Seguridad','General'].map(a=><option key={a}>{a}</option>)}</select></div>
          <div className="input-group"><label>Requiere certificación</label><select className="select" value={nuevo.requiere_cert?'si':'no'} onChange={e=>setNuevo(v=>({...v,requiere_cert:e.target.value==='si'}))}><option value="no">No</option><option value="si">Sí</option></select></div>
          <div style={{display:'flex', alignItems:'end', gridColumn:'span 2'}}><button className="btn btn-primary" type="submit" style={{width:'100%'}}>{I.plus} Agregar especialidad</button></div>
        </div>
      </form>
    );
    if (sel?.id === 'mst_tipos_servicio') return (
      <form className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={selectedRows.length}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Mantenimiento predictivo" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Clasificación</label><select className="select" value={nuevo.clasificacion} onChange={e=>setNuevo(v=>({...v,clasificacion:e.target.value}))}><option value="">Seleccionar...</option>{['Preventivo','Correctivo','Proyecto','Emergencia','Garantía','Interno'].map(c=><option key={c}>{c}</option>)}</select></div>
          <div className="input-group"><label>Facturable</label><select className="select" value={nuevo.facturable?'si':'no'} onChange={e=>setNuevo(v=>({...v,facturable:e.target.value==='si'}))}><option value="si">Sí</option><option value="no">No</option></select></div>
          <div style={{display:'flex', alignItems:'end', gridColumn:'span 2'}}><button className="btn btn-primary" type="submit" style={{width:'100%'}}>{I.plus} Agregar tipo</button></div>
        </div>
      </form>
    );
    if (sel?.id === 'mst_almacenes') return (
      <form className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={selectedRows.length}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre del almacén</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Almacén Sede Sur" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Tipo</label><select className="select" value={nuevo.tipo} onChange={e=>setNuevo(v=>({...v,tipo:e.target.value}))}><option value="">Seleccionar...</option>{['Central','Sede','Móvil','Tránsito'].map(t=><option key={t}>{t}</option>)}</select></div>
          <div className="input-group"><label>Responsable</label><input className="input" value={nuevo.responsable} onChange={e=>setNuevo(v=>({...v,responsable:e.target.value}))} placeholder="Nombre del responsable"/></div>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Dirección</label><input className="input" value={nuevo.direccion} onChange={e=>setNuevo(v=>({...v,direccion:e.target.value}))} placeholder="Dirección del almacén"/></div>
          <div style={{display:'flex', alignItems:'end'}}><button className="btn btn-primary" type="submit" style={{width:'100%'}}>{I.plus} Agregar</button></div>
        </div>
      </form>
    );
    if (sel?.id === 'mst_sedes') return (
      <form className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={selectedRows.length}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre de la sede *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Sede Norte, Planta Central" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group" style={{gridColumn:'span 3'}}><label>Dirección física</label><input className="input" value={nuevo.direccion} onChange={e=>setNuevo(v=>({...v,direccion:e.target.value}))} placeholder="Ej: Av. Industrial 1450, Ate Vitarte, Lima"/></div>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Coordenadas GPS <span style={{fontSize:10,color:'var(--fg-subtle)',fontWeight:400}}>· lat, lng</span></label><input className="input" value={nuevo.gps} onChange={e=>setNuevo(v=>({...v,gps:e.target.value}))} placeholder="Ej: -12.0464, -77.0428"/></div>
          <div style={{display:'flex', alignItems:'end', gridColumn:'span 2'}}><button className="btn btn-primary" type="submit" style={{width:'100%'}}>{I.plus} Agregar sede</button></div>
        </div>
      </form>
    );
    return (
      <form className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div className="grid-4" style={{gap:12}}>
          <CodPreview id={sel?.id||''} len={selectedRows.length}/>
          <div className="input-group"><label>Nombre</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option><option>bloqueado</option></select></div>
          <div style={{display:'flex', alignItems:'end'}}><button className="btn btn-primary" type="submit" style={{width:'100%'}}>{I.plus} Agregar</button></div>
          <div className="input-group" style={{gridColumn:'1 / -1'}}><label>Detalle</label><input className="input" value={nuevo.detalle} onChange={e=>setNuevo(v=>({...v,detalle:e.target.value}))}/></div>
        </div>
      </form>
    );
  };

  const renderTable = () => {
    if (sel?.id === 'mst_clientes') {
      const filtered = cuentas.filter(c => !clienteSearch || c.razon_social.toLowerCase().includes(clienteSearch.toLowerCase()) || (c.ruc||'').includes(clienteSearch));
      return (
        <>
          <div style={{marginBottom:12}}>
            <input className="input" placeholder="Buscar por razón social o RUC..." value={clienteSearch} onChange={e=>setClienteSearch(e.target.value)} style={{maxWidth:320}}/>
          </div>
          <table className="tbl">
            <thead><tr><th>RUC</th><th>Razón social</th><th>Industria</th><th>Responsable</th><th>Tipo</th><th></th></tr></thead>
            <tbody>{filtered.map(c => (
              <tr key={c.id}>
                <td className="mono text-muted" style={{fontSize:12}}>{c.ruc || '—'}</td>
                <td><strong>{c.razon_social}</strong></td>
                <td className="text-muted">{c.industria}</td>
                <td>{c.responsable_comercial}</td>
                <td><span className={'badge '+(c.tipo==='estrategico'?'badge-purple':c.tipo==='en_riesgo'?'badge-red':c.tipo==='prospecto'?'badge-cyan':'badge-green')} style={{fontSize:11}}>{c.tipo?.replace('_',' ')}</span></td>
                <td><button className="btn btn-sm btn-ghost" onClick={()=>navigate('cuentas')}>Ver →</button></td>
              </tr>
            ))}</tbody>
          </table>
        </>
      );
    }
    if (sel?.id === 'mst_cargos') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Cargo</th><th>Tipo</th><th>Descripción</th><th>Estado</th><th></th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono text-muted">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td><span className={'badge '+(r.tipo==='Operativo'?'badge-cyan':r.tipo==='Ambos'?'badge-purple':'badge-gray')} style={{fontSize:11}}>{r.tipo||'—'}</span></td>
            <td className="text-muted" style={{fontSize:12}}>{r.detalle}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td><button className="btn btn-sm btn-ghost">Editar</button></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_especialidades') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Especialidad</th><th>Área</th><th>Certif.</th><th>Estado</th><th></th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td className="text-muted">{r.area}</td>
            <td>{r.requiere_cert ? <span className="badge badge-orange">Sí</span> : <span className="badge badge-gray">No</span>}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td><button className="btn btn-sm btn-ghost">Editar</button></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_tipos_servicio') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Nombre</th><th>Clasificación</th><th>Facturable</th><th>Estado</th><th></th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td><span className="badge badge-cyan" style={{fontSize:11}}>{r.clasificacion}</span></td>
            <td>{r.facturable ? <span className="badge badge-green">Sí</span> : <span className="badge badge-gray">No</span>}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td><button className="btn btn-sm btn-ghost">Editar</button></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_almacenes') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th></th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong><div className="text-muted" style={{fontSize:11}}>{r.direccion}</div></td>
            <td><span className="badge badge-purple" style={{fontSize:11}}>{r.tipo}</span></td>
            <td className="text-muted">{r.responsable}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td><button className="btn btn-sm btn-ghost">Editar</button></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_sedes') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Nombre</th><th>Dirección física</th><th>GPS</th><th>Estado</th><th></th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono text-muted">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td className="text-muted" style={{fontSize:12}}>{r.direccion || '—'}</td>
            <td><span className="mono" style={{fontSize:11, color:'var(--cyan-dk)', background:'var(--cyan-lt)', padding:'2px 7px', borderRadius:6}}>{r.gps || '—'}</span></td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td><button className="btn btn-sm btn-ghost">Editar</button></td>
          </tr>
        ))}</tbody>
      </table>
    );
    return (
      <table className="tbl">
        <thead><tr><th>Codigo</th><th>Valor</th><th>Detalle</th><th>Estado</th><th></th></tr></thead>
        <tbody>{selectedRows.map((r, i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td className="text-muted">{r.detalle}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':r.estado==='bloqueado'?'badge-red':'badge-gray')}>{r.estado}</span></td>
            <td><button className="btn btn-sm btn-ghost">Editar</button></td>
          </tr>
        ))}</tbody>
      </table>
    );
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Maestros Base</h1>
          <div className="page-sub">Catálogos de referencia globales del sistema</div>
        </div>
      </div>
      <div className="grid-2">
        {MOCK.maestros.map(m => (
          <div key={m.id} className="card hover-raise" style={{padding:20, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div>
              <div style={{fontWeight:600, fontSize:15}}>{m.tabla}</div>
              <div className="text-muted" style={{fontSize:12, marginTop:4}}>
                {m.id === 'mst_clientes' ? cuentas.length : m.id === 'mst_proveedores' ? proveedores.length : m.valores} valores · Actualizado {m.id === 'mst_clientes' || m.id === 'mst_proveedores' ? 'en tiempo real' : m.actualizado}
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setSel(m); setNuevo(nuevoBase); }}>Gestionar</button>
          </div>
        ))}
      </div>

      <div style={{marginTop:20, padding:'16px 20px', background:'rgba(6,182,212,0.08)', border:'1px solid var(--border)', borderLeft:'3px solid var(--cyan)', borderRadius:10, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap'}}>
        <div style={{flex:1, minWidth:200}}>
          <div style={{fontWeight:600, fontSize:14, marginBottom:2}}>¿Buscas gestionar personal?</div>
          <div className="text-muted" style={{fontSize:13}}>El personal operativo se administra desde <strong>RRHH Operativo</strong> · El personal administrativo desde <strong>RRHH Administrativo</strong></div>
        </div>
        <div className="row" style={{gap:10}}>
          <button className="btn btn-secondary btn-sm" onClick={()=>navigate('rrhh_operativo')}>Ir a RRHH Operativo</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>navigate('rrhh_admin')}>Ir a RRHH Administrativo</button>
        </div>
      </div>

      {sel && <>
        <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
        <div className="side-panel" style={{width:'min(800px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Gestión de catálogo</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>{sel.tabla}</div>
              <div className="text-muted" style={{fontSize:12, marginTop:4}}>{sel.id === 'mst_clientes' ? cuentas.length : sel.id === 'mst_proveedores' ? proveedores.length : selectedRows.length} valores visibles · empresa actual</div>
              {NOTAS_PANEL[sel.id] && <div style={{fontSize:12, color:'var(--cyan)', marginTop:6}}>{NOTAS_PANEL[sel.id]}</div>}
            </div>
            <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
          </div>
          <div className="side-panel-body">
            {sel.id !== 'mst_clientes' && sel.id !== 'mst_proveedores' && (
              <div className="row" style={{gap:10, marginBottom:18}}>
                <button className="btn btn-secondary">{I.download} Importar Excel</button>
                <button className="btn btn-secondary">{I.download} Exportar</button>
                <span className="badge badge-cyan">Validación de duplicados activa</span>
              </div>
            )}
            {renderForm()}
            <div className="card">
              <div className="table-wrap">
                {renderTable()}
              </div>
            </div>
          </div>
        </div>
      </>}
    </>
  );
}

function Servicios() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Catálogo de Servicios</h1>
          <div className="page-sub">Servicios ofrecidos con estructura de costos</div>
        </div>
        <button className="btn btn-primary">{I.plus} Nuevo servicio</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Código</th>
                <th>Familia</th>
                <th>Descripción</th>
                <th>Unidad</th>
                <th>Costo Ref.</th>
                <th>Precio Ref.</th>
                <th>Margen</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {MOCK.servicios.map(s => (
                <tr key={s.id} className="hover-row">
                  <td className="mono">{s.id}</td>
                  <td>{s.familia}</td>
                  <td style={{fontWeight:500}}>{s.descripcion}</td>
                  <td>{s.unidad}</td>
                  <td className="mono text-muted">{money(s.costo)}</td>
                  <td className="mono" style={{fontWeight:600}}>{money(s.precio)}</td>
                  <td><span className="badge badge-cyan">{s.margen}%</span></td>
                  <td><span className="badge badge-green">{s.estado}</span></td>
                  <td><button className="icon-btn">{I.chev}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Tarifarios() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tarifarios</h1>
          <div className="page-sub">Listas de precios específicas por cliente o temporada</div>
        </div>
        <button className="btn btn-primary">{I.plus} Nuevo tarifario</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente / Lista</th>
                <th>Moneda</th>
                <th>Items</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {MOCK.tarifarios.map(t => (
                <tr key={t.id} className="hover-row">
                  <td className="mono">{t.id}</td>
                  <td style={{fontWeight:600}}>{t.cliente}</td>
                  <td>{t.moneda}</td>
                  <td>{t.items} servicios</td>
                  <td className="text-muted">{t.vigencia}</td>
                  <td><span className="badge badge-green">{t.estado}</span></td>
                  <td><button className="icon-btn">{I.chev}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Parametros() {
  const series = [
    { doc: 'Cotizaciones', serie: 'COT-2026', siguiente: '0042', regla: 'Anual por empresa', estado: 'activo' },
    { doc: 'OS Cliente', serie: 'OSC-2026', siguiente: '0018', regla: 'Anual por empresa', estado: 'activo' },
    { doc: 'Ordenes de Trabajo', serie: 'OT-26', siguiente: '0064', regla: 'Anual por empresa', estado: 'activo' },
    { doc: 'SOLPE', serie: 'SLP-2026', siguiente: '0028', regla: 'Anual por empresa', estado: 'activo' },
    { doc: 'Facturas', serie: 'F001', siguiente: '0520', regla: 'Serie fiscal externa', estado: 'activo' },
    { doc: 'CxC / CxP', serie: 'FIN-2026', siguiente: '0145', regla: 'Correlativo financiero', estado: 'activo' }
  ];
  const estados = [
    { modulo: 'OT', flujo: 'borrador -> programada -> ejecucion -> cerrada -> valorizada -> facturada', alerta: 'SLA por servicio' },
    { modulo: 'Cotizacion', flujo: 'borrador -> enviada -> aprobada -> ganada / perdida', alerta: 'Descuento requiere aprobacion' },
    { modulo: 'SOLPE', flujo: 'borrador -> solicitada -> aprobada -> atendida', alerta: 'Urgencia alta notifica supervisor' },
    { modulo: 'Compras campo', flujo: 'capturada -> pendiente revision -> validada -> CxP', alerta: 'IA con baja confianza' }
  ];
  const slas = [
    { servicio: 'Correctivo critico', respuesta: '4h', resolucion: '24h', semaforo: 'Rojo a 80%' },
    { servicio: 'Preventivo mensual', respuesta: '24h', resolucion: '5 dias', semaforo: 'Naranja a 70%' },
    { servicio: 'Instalacion proyecto', respuesta: '48h', resolucion: 'Segun cronograma', semaforo: 'Por hito vencido' }
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Parametros Generales</h1>
          <div className="page-sub">Series, estados, impuestos, plantillas PDF y SLA base por tenant</div>
        </div>
        <button className="btn btn-primary">{I.save} Guardar cambios</button>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Series documentarias</h3><span className="badge badge-cyan">{series.length} activas</span></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Documento</th><th>Serie</th><th>Siguiente</th><th>Regla</th><th>Estado</th></tr></thead>
              <tbody>{series.map(s => (
                <tr key={s.doc}>
                  <td><strong>{s.doc}</strong></td>
                  <td className="mono">{s.serie}</td>
                  <td className="mono">{s.siguiente}</td>
                  <td className="text-muted">{s.regla}</td>
                  <td><span className="badge badge-green">{s.estado}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Moneda, impuestos y PDF</h3></div>
          <div className="card-body col" style={{gap:12}}>
            {[
              ['Moneda base', 'PEN - Sol peruano'],
              ['IGV por defecto', '18%'],
              ['Zona horaria', 'America/Lima'],
              ['Plantilla cotizacion', 'TIDEO propuesta tecnica v3'],
              ['Plantilla factura', 'Exportacion fiscal externa'],
              ['2FA financiero', 'Obligatorio para roles con ver_finanzas']
            ].map(([l, v]) => (
              <div key={l} className="row" style={{justifyContent:'space-between', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8}}>
                <span className="text-muted" style={{fontSize:12}}>{l}</span>
                <strong style={{fontSize:13}}>{v}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid-2 mt-6">
        <div className="card">
          <div className="card-head"><h3>Estados por documento</h3></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Modulo</th><th>Flujo</th><th>Regla de alerta</th></tr></thead>
              <tbody>{estados.map(e => (
                <tr key={e.modulo}><td><strong>{e.modulo}</strong></td><td className="text-muted">{e.flujo}</td><td>{e.alerta}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>SLA basico por servicio</h3></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Servicio</th><th>Respuesta</th><th>Resolucion</th><th>Semaforo</th></tr></thead>
              <tbody>{slas.map(s => (
                <tr key={s.servicio}><td><strong>{s.servicio}</strong></td><td>{s.respuesta}</td><td>{s.resolucion}</td><td><span className="badge badge-orange">{s.semaforo}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// RRHH ADMINISTRATIVO — Fase 3
// ============================================================
const CARGOS_ADM = MOCK.cargosEmpresa.filter(c => c.tipo !== 'Operativo' && c.estado === 'activo').map(c => c.nombre);

function RRHHAdmin() {
  const { personalAdmin, vacacionesSolicitudes, licencias, solicitudesRRHH, aprobarVacacion, turnos } = useApp();
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('ficha');
  const [view, setView] = useState('personal');
  const [panelAlta, setPanelAlta] = useState(false);
  const [nuevosColabs, setNuevosColabs] = useState([]);
  const formAltaBase = { nombre:'', dni:'', fecha_nacimiento:'', telefono:'', email:'', direccion:'', codigo:'', cargo:'', area:'', sede:'', turno_id:'tur_005', modalidad:'Planilla', fecha_inicio:'', fecha_fin:'', remuneracion:'', dias_vacaciones:'30', estado:'activo' };
  const [formAlta, setFormAlta] = useState(formAltaBase);
  const todosPersonal = [...personalAdmin, ...nuevosColabs];
  const persona = sel ? todosPersonal.find(p => p.id === sel) : null;

  const guardarColaborador = (e) => {
    e.preventDefault();
    const idx = todosPersonal.length + 1;
    const nuevo = {
      id: `per_n${idx}`, empresa_id: 'emp_001',
      nombre: formAlta.nombre || 'Nuevo colaborador',
      dni: formAlta.dni || '00000000',
      fecha_nacimiento: formAlta.fecha_nacimiento || '',
      telefono: formAlta.telefono || '',
      email: formAlta.email || '',
      direccion: formAlta.direccion || '',
      cargo: formAlta.cargo || 'Por definir',
      area: formAlta.area || 'Sin área',
      supervisor: '', sede: formAlta.sede || 'Lima Principal', turno_id: formAlta.turno_id || 'tur_005',
      nivel_estudios: '', especialidad: '', institucion: '',
      tipo_contrato: formAlta.modalidad || 'Planilla',
      fecha_inicio_contrato: formAlta.fecha_inicio || '',
      fecha_fin_contrato: formAlta.fecha_fin || null,
      remuneracion: Number(formAlta.remuneracion) || 0,
      modalidad: 'Presencial',
      dias_vacaciones_total: Number(formAlta.dias_vacaciones) || 30,
      dias_vacaciones_usados: 0,
      dias_vacaciones_disponibles: Number(formAlta.dias_vacaciones) || 30,
      estado: formAlta.estado || 'activo',
      fecha_ingreso: formAlta.fecha_inicio || '2026-04-27',
      contacto_emergencia: '', relacion_emergencia: '', telefono_emergencia: '',
      documentos: []
    };
    setNuevosColabs(prev => [...prev, nuevo]);
    setFormAlta(formAltaBase);
    setPanelAlta(false);
  };

  const contratoColor = (tipo) => tipo === 'Indefinido' ? 'green' : tipo === 'Plazo fijo' ? 'orange' : 'cyan';
  const docColor = (estado) => estado === 'vigente' ? 'green' : estado === 'por_vencer' ? 'orange' : 'red';

  if (persona) {
    const vacPersona = vacacionesSolicitudes.filter(v => v.personal_id === sel);
    const licPersona = licencias.filter(l => l.personal_id === sel);
    const solPersona = solicitudesRRHH.filter(s => s.personal_id === sel);
    return (
      <>
        <div className="page-header">
          <div className="row" style={{gap:12}}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>{I.chev} Volver</button>
            <div>
              <h1 className="page-title">{persona.nombre}</h1>
              <div className="page-sub">{persona.cargo} · {persona.area} · Ingreso: {persona.fecha_ingreso}</div>
            </div>
          </div>
          <div className="row">
            <span className={'badge badge-' + contratoColor(persona.tipo_contrato)}>{persona.tipo_contrato}</span>
            <span className="badge badge-green">{persona.estado}</span>
          </div>
        </div>

        <div className="card">
          <div style={{padding:'0 20px'}}>
            <div className="tabs">
              {['ficha','contrato','vacaciones','licencias','solicitudes','documentos'].map(t => (
                <div key={t} className={'tab '+(tab===t?'active':'')} onClick={() => setTab(t)} style={{textTransform:'capitalize'}}>{t}</div>
              ))}
            </div>
          </div>

          {tab === 'ficha' && (
            <div className="card-body">
              <div className="grid-2" style={{gap:16}}>
                {[
                  ['DNI', persona.dni], ['Fecha de nacimiento', persona.fecha_nacimiento],
                  ['Dirección', persona.direccion], ['Nivel de estudios', persona.nivel_estudios],
                  ['Especialidad', persona.especialidad], ['Institución', persona.institucion],
                  ['Cargo', persona.cargo], ['Área', persona.area],
                  ['Supervisor directo', persona.supervisor], ['Sede base', persona.sede],
                  ['Modalidad', persona.modalidad],
                  ['Turno asignado', `${turnos.find(t => t.id === persona.turno_id)?.nombre || 'Administrativo'} (${turnos.find(t => t.id === persona.turno_id)?.hora_entrada || '09:00'} - ${turnos.find(t => t.id === persona.turno_id)?.hora_salida || '18:00'})`],
                ].map(([label, val]) => (
                  <div key={label} style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                    <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</div>
                    <div style={{fontWeight:500, fontSize:13}}>{val || '—'}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:16, padding:'14px 16px', background:'var(--bg-subtle)', borderRadius:8, borderLeft:'3px solid var(--orange)'}}>
                <div className="text-muted" style={{fontSize:11, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em'}}>Contacto de emergencia</div>
                <div style={{fontWeight:600}}>{persona.contacto_emergencia} <span className="text-muted">({persona.relacion_emergencia})</span></div>
                <div className="text-muted" style={{fontSize:13}}>{persona.telefono_emergencia}</div>
              </div>
            </div>
          )}

          {tab === 'contrato' && (
            <div className="card-body">
              <div className="grid-2" style={{gap:16}}>
                {[
                  ['Tipo de contrato', persona.tipo_contrato],
                  ['Fecha inicio', persona.fecha_inicio_contrato],
                  ['Fecha fin', persona.fecha_fin_contrato || 'Sin fecha de fin (indefinido)'],
                  ['Modalidad', persona.modalidad],
                  ['Remuneración base', `S/ ${persona.remuneracion.toLocaleString()}`],
                  ['Sede', persona.sede],
                ].map(([label, val]) => (
                  <div key={label} style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                    <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</div>
                    <div style={{fontWeight:500, fontSize:13}}>{val}</div>
                  </div>
                ))}
              </div>
              {persona.tipo_contrato === 'Plazo fijo' && (
                <div style={{marginTop:16, padding:14, background:'rgba(255,160,0,0.1)', border:'1px solid var(--orange)', borderRadius:8}} className="row">
                  <span style={{display:'flex',alignItems:'center',flexShrink:0,width:18,height:18,color:'var(--orange)'}}>{I.alert}</span><div><strong>Contrato por vencer</strong> — Vence el {persona.fecha_fin_contrato}. Evaluar renovación.</div>
                </div>
              )}
            </div>
          )}

          {tab === 'vacaciones' && (
            <>
              <div className="card-body" style={{paddingBottom:0}}>
                <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16}}>
                  <div className="kpi-card" style={{padding:16}}>
                    <div className="kpi-label">Días disponibles</div>
                    <div className="kpi-value" style={{color:'var(--green)'}}>{persona.dias_vacaciones_disponibles}</div>
                  </div>
                  <div className="kpi-card" style={{padding:16}}>
                    <div className="kpi-label">Días usados</div>
                    <div className="kpi-value">{persona.dias_vacaciones_usados}</div>
                  </div>
                  <div className="kpi-card" style={{padding:16}}>
                    <div className="kpi-label">Total anual</div>
                    <div className="kpi-value">{persona.dias_vacaciones_total}</div>
                  </div>
                </div>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Días</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {vacPersona.length === 0 && <tr><td colSpan={7} style={{textAlign:'center', color:'var(--fg-muted)', padding:24}}>Sin solicitudes registradas</td></tr>}
                    {vacPersona.map(v => (
                      <tr key={v.id}>
                        <td style={{textTransform:'capitalize'}}>{v.tipo}</td>
                        <td>{v.fecha_inicio}</td><td>{v.fecha_fin}</td>
                        <td className="num">{v.dias}</td>
                        <td className="text-muted">{v.motivo}</td>
                        <td><span className={'badge badge-'+(v.estado==='aprobado'?'green':v.estado==='pendiente'?'orange':'red')}>{v.estado}</span></td>
                        <td>{v.estado === 'pendiente' && <button className="btn btn-sm btn-primary" onClick={() => aprobarVacacion(v.id)}>Aprobar</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'licencias' && (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Días</th><th>Motivo</th><th>Documento</th><th>Estado</th></tr></thead>
                <tbody>
                  {licPersona.length === 0 && <tr><td colSpan={7} style={{textAlign:'center', color:'var(--fg-muted)', padding:24}}>Sin licencias registradas</td></tr>}
                  {licPersona.map(l => (
                    <tr key={l.id}>
                      <td style={{textTransform:'capitalize'}}>{l.tipo.replace('_', ' ')}</td>
                      <td>{l.fecha_inicio}</td><td>{l.fecha_fin}</td>
                      <td className="num">{l.dias}</td>
                      <td className="text-muted">{l.motivo}</td>
                      <td>{l.documento ? <span className="badge badge-cyan">{I.file} {l.documento}</span> : <span className="text-subtle">—</span>}</td>
                      <td><span className={'badge badge-'+(l.estado==='aprobado'?'green':'orange')}>{l.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'solicitudes' && (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Tipo</th><th>Descripción</th><th>Fecha</th><th>Estado</th><th>Entregado</th></tr></thead>
                <tbody>
                  {solPersona.length === 0 && <tr><td colSpan={5} style={{textAlign:'center', color:'var(--fg-muted)', padding:24}}>Sin solicitudes registradas</td></tr>}
                  {solPersona.map(s => (
                    <tr key={s.id}>
                      <td style={{textTransform:'capitalize'}}>{s.tipo}</td>
                      <td>{s.descripcion}{s.monto ? <span className="badge badge-orange" style={{marginLeft:8}}>S/ {s.monto}</span> : null}</td>
                      <td>{s.fecha}</td>
                      <td><span className={'badge badge-'+(s.estado==='atendido'?'green':s.estado==='aprobado'?'cyan':'orange')}>{s.estado}</span></td>
                      <td className="text-muted">{s.fecha_entrega || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'documentos' && (
            <div className="card-body">
              <div className="col" style={{gap:10}}>
                {(persona.documentos || []).map((doc, i) => (
                  <div key={i} className="row" style={{justifyContent:'space-between', padding:'12px 16px', border:'1px solid var(--border)', borderRadius:8}}>
                    <div className="row" style={{gap:10}}>
                      {I.file}
                      <div>
                        <div style={{fontWeight:600, fontSize:13}}>{doc.nombre}</div>
                        {doc.vencimiento && <div className="text-muted" style={{fontSize:11}}>Vence: {doc.vencimiento}</div>}
                      </div>
                    </div>
                    <span className={'badge badge-' + docColor(doc.estado)}>{doc.estado.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // Vista lista — datos comunes
  const vencimientosDocumentos = personalAdmin.flatMap(p =>
    (p.documentos || []).filter(d => d.estado !== 'vigente').map(d => ({ persona: p.nombre, doc: d.nombre, estado: d.estado }))
  );
  const vacPendientes = vacacionesSolicitudes.filter(v => v.estado === 'pendiente');

  // Vista Reportes — datos calculados
  const hoy = '2026-04-27';
  const porArea = personalAdmin.reduce((acc, p) => { acc[p.area] = (acc[p.area] || 0) + 1; return acc; }, {});
  const maxArea = Math.max(...Object.values(porArea), 1);
  const contratosVencer = personalAdmin
    .filter(p => p.fecha_fin_contrato && p.tipo_contrato !== 'Indefinido')
    .map(p => ({ ...p, dias_restantes: Math.round((new Date(p.fecha_fin_contrato) - new Date(hoy)) / 86400000) }))
    .sort((a, b) => a.dias_restantes - b.dias_restantes);
  const vacRanking = [...personalAdmin].sort((a, b) => b.dias_vacaciones_disponibles - a.dias_vacaciones_disponibles);
  const solPend = MOCK.solicitudesRRHH.filter(s => s.estado === 'pendiente');

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">RRHH Administrativo</h1><div className="page-sub">{personalAdmin.length} colaboradores activos · Fase 3</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setPanelAlta(true)}>{I.plus} Nuevo colaborador</button>
      </div>

      <div className="tabs">
        <div className={'tab '+(view==='personal'?'active':'')} onClick={()=>setView('personal')}>Personal</div>
        <div className={'tab '+(view==='reportes'?'active':'')} onClick={()=>setView('reportes')}>Reportes</div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Colaboradores activos</div><div className="kpi-value">{personalAdmin.filter(p=>p.estado==='activo').length}</div><div className="kpi-icon cyan">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Contratos por vencer</div><div className="kpi-value" style={{color:'var(--orange)'}}>1</div><div className="kpi-icon orange">{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">Vacaciones pendientes</div><div className="kpi-value" style={{color: vacPendientes.length > 0 ? 'var(--orange)' : 'inherit'}}>{vacPendientes.length}</div><div className="kpi-icon purple">{I.calendar}</div></div>
        <div className="kpi-card"><div className="kpi-label">Docs vencidos / por vencer</div><div className="kpi-value" style={{color:'var(--danger)'}}>{vencimientosDocumentos.length}</div><div className="kpi-icon red">{I.shield}</div></div>
      </div>

      {vencimientosDocumentos.length > 0 && (
        <div style={{padding:'12px 16px', background:'rgba(220,38,38,0.08)', border:'1px solid var(--danger)', borderRadius:10, marginBottom:16}} className="row">
          <span style={{display:'flex',alignItems:'center',flexShrink:0,width:18,height:18,color:'var(--danger)'}}>{I.alert}</span>
          <div><strong>Documentos que requieren atención:</strong> {vencimientosDocumentos.map(d => `${d.persona} — ${d.doc} (${d.estado.replace('_',' ')})`).join(' · ')}</div>
        </div>
      )}

      {view === 'personal' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Colaborador</th><th>Cargo</th><th>Área</th><th>Sede</th><th>Turno</th><th>Contrato</th><th>Modalidad</th><th>Vacaciones disp.</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {todosPersonal.map(p => (
                  <tr key={p.id} className="hover-row" onClick={() => { setSel(p.id); setTab('ficha'); }} style={{cursor:'pointer'}}>
                    <td>
                      <div className="row">
                        <div className="avatar" style={{width:30,height:30,fontSize:11}}>{p.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>
                        <div><strong>{p.nombre}</strong><div className="text-muted" style={{fontSize:11}}>{p.email || p.dni}</div></div>
                      </div>
                    </td>
                    <td>{p.cargo}</td>
                    <td>{p.area}</td>
                    <td>{p.sede ? <span className="badge badge-gray" style={{fontSize:11}}>{p.sede}</span> : <span className="text-subtle">—</span>}</td>
                    <td><span className="text-muted" style={{fontSize:12}}>{turnos.find(t => t.id === p.turno_id)?.nombre || 'Administrativo'}</span></td>
                    <td><span className={'badge badge-' + contratoColor(p.tipo_contrato)}>{p.tipo_contrato}</span></td>
                    <td>{p.modalidad}</td>
                    <td className="num">{p.dias_vacaciones_disponibles} días</td>
                    <td><span className="badge badge-green">{p.estado}</span></td>
                    <td><button className="btn btn-sm btn-ghost" onClick={e=>{e.stopPropagation();setSel(p.id);setTab('ficha');}}>Ver ficha</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'reportes' && (
          <div style={{display:'grid', gap:24}}>
            {/* Headcount por área */}
            <div className="card">
              <div className="card-head"><h3>Headcount por Área</h3><span style={{fontSize:12,color:'var(--fg-subtle)'}}>Total: {personalAdmin.length} colaboradores</span></div>
              <div style={{padding:'16px 20px', display:'flex', flexDirection:'column', gap:12}}>
                {Object.entries(porArea).map(([area, cnt]) => (
                  <div key={area} style={{display:'grid', gridTemplateColumns:'140px 1fr 40px', gap:12, alignItems:'center'}}>
                    <span style={{fontSize:13, fontWeight:500}}>{area}</span>
                    <div style={{background:'var(--bg-subtle)', borderRadius:4, height:10}}>
                      <div style={{width:Math.round(cnt/maxArea*100)+'%', height:'100%', background:'var(--cyan)', borderRadius:4}}/>
                    </div>
                    <span style={{fontSize:13, fontWeight:700, textAlign:'right'}}>{cnt}</span>
                  </div>
                ))}
              </div>
              <div style={{padding:'0 20px 16px', display:'flex', gap:24, fontSize:12, color:'var(--fg-subtle)'}}>
                <span>Remoto: <strong>{personalAdmin.filter(p=>p.modalidad==='Remoto').length}</strong></span>
                <span>Presencial: <strong>{personalAdmin.filter(p=>p.modalidad==='Presencial').length}</strong></span>
                <span>Híbrido: <strong>{personalAdmin.filter(p=>p.modalidad==='Híbrido').length}</strong></span>
              </div>
            </div>

            {/* Contratos por vencer */}
            <div className="card">
              <div className="card-head"><h3>Contratos Próximos a Vencer</h3></div>
              {contratosVencer.length === 0 ? (
                <div style={{padding:'20px', textAlign:'center', color:'var(--fg-muted)', fontSize:13}}>Sin contratos próximos a vencer.</div>
              ) : (
                <table className="tbl">
                  <thead><tr><th>Colaborador</th><th>Cargo</th><th>Tipo</th><th>Fecha fin</th><th>Días restantes</th></tr></thead>
                  <tbody>
                    {contratosVencer.map(p => (
                      <tr key={p.id}>
                        <td style={{fontWeight:600}}>{p.nombre}</td>
                        <td>{p.cargo}</td>
                        <td><span className={'badge badge-'+contratoColor(p.tipo_contrato)}>{p.tipo_contrato}</span></td>
                        <td>{p.fecha_fin_contrato}</td>
                        <td><span className={'badge '+(p.dias_restantes<=30?'badge-red':p.dias_restantes<=60?'badge-yellow':'badge-green')}>{p.dias_restantes}d</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Vacaciones disponibles */}
            <div className="card">
              <div className="card-head"><h3>Vacaciones Disponibles</h3><span style={{fontSize:12,color:'var(--fg-subtle)'}}>Total acumulado: {personalAdmin.reduce((s,p)=>s+p.dias_vacaciones_disponibles,0)} días</span></div>
              <table className="tbl">
                <thead><tr><th>Colaborador</th><th>Área</th><th>Días totales</th><th>Usados</th><th>Disponibles</th></tr></thead>
                <tbody>
                  {vacRanking.map(p => (
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.nombre}</td>
                      <td>{p.area}</td>
                      <td>{p.dias_vacaciones_total}</td>
                      <td>{p.dias_vacaciones_usados}</td>
                      <td>
                        <span style={{fontWeight:700, color:p.dias_vacaciones_disponibles>10?'var(--green)':p.dias_vacaciones_disponibles>0?'var(--warning)':'var(--fg-muted)'}}>
                          {p.dias_vacaciones_disponibles} días
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Solicitudes internas pendientes */}
            {solPend.length > 0 && (
              <div className="card">
                <div className="card-head"><h3>Solicitudes Pendientes de Atención</h3><span className="badge badge-orange">{solPend.length}</span></div>
                <table className="tbl">
                  <thead><tr><th>Colaborador</th><th>Tipo</th><th>Descripción</th><th>Fecha</th></tr></thead>
                  <tbody>
                    {solPend.map(s => {
                      const p = personalAdmin.find(x=>x.id===s.personal_id);
                      return (
                        <tr key={s.id}>
                          <td style={{fontWeight:600}}>{p?.nombre||s.personal_id}</td>
                          <td style={{textTransform:'capitalize'}}>{s.tipo}</td>
                          <td>{s.descripcion}{s.monto?<span className="badge badge-orange" style={{marginLeft:6}}>S/ {s.monto}</span>:null}</td>
                          <td>{s.fecha}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
      )}

      {panelAlta && <>
        <div className="side-panel-backdrop" onClick={() => setPanelAlta(false)}/>
        <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Alta de personal</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>Nuevo colaborador administrativo</div>
            </div>
            <button className="icon-btn" onClick={() => setPanelAlta(false)}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardarColaborador}>
            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos personales</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Nombre completo *</label><input className="input" required value={formAlta.nombre} onChange={e=>setFormAlta(v=>({...v,nombre:e.target.value}))} placeholder="Nombre completo" autoFocus/></div>
              <div className="input-group"><label>DNI / Documento *</label><input className="input" required value={formAlta.dni} onChange={e=>setFormAlta(v=>({...v,dni:e.target.value}))} placeholder="12345678"/></div>
              <div className="input-group"><label>Fecha de nacimiento</label><input className="input" type="date" value={formAlta.fecha_nacimiento} onChange={e=>setFormAlta(v=>({...v,fecha_nacimiento:e.target.value}))}/></div>
              <div className="input-group"><label>Teléfono celular</label><input className="input" value={formAlta.telefono} onChange={e=>setFormAlta(v=>({...v,telefono:e.target.value}))} placeholder="+51 9..."/></div>
              <div className="input-group"><label>Email corporativo</label><input className="input" type="email" value={formAlta.email} onChange={e=>setFormAlta(v=>({...v,email:e.target.value}))} placeholder="nombre@empresa.pe"/></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Dirección personal</label><input className="input" value={formAlta.direccion} onChange={e=>setFormAlta(v=>({...v,direccion:e.target.value}))} placeholder="Dirección completa"/></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos laborales</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Código de empleado *</label><input className="input" value={formAlta.codigo} onChange={e=>setFormAlta(v=>({...v,codigo:e.target.value}))} placeholder="ADM-008"/></div>
              <div className="input-group"><label>Modalidad de contrato</label><select className="select" value={formAlta.modalidad} onChange={e=>setFormAlta(v=>({...v,modalidad:e.target.value}))}>{['Planilla','Honorarios','CAS','Practicante'].map(m=><option key={m}>{m}</option>)}</select></div>
              <div className="input-group"><label>Cargo</label><select className="select" value={formAlta.cargo} onChange={e=>setFormAlta(v=>({...v,cargo:e.target.value}))}><option value="">Seleccionar cargo...</option>{CARGOS_ADM.map(c=><option key={c}>{c}</option>)}</select></div>
              <div className="input-group"><label>Área</label><select className="select" value={formAlta.area} onChange={e=>setFormAlta(v=>({...v,area:e.target.value}))}><option value="">Seleccionar área...</option>{['Comercial','Operaciones','Finanzas','RRHH','Gerencia','TI','Marketing'].map(a=><option key={a}>{a}</option>)}</select></div>
              <div className="input-group"><label>Sede asignada</label><select className="select" value={formAlta.sede} onChange={e=>setFormAlta(v=>({...v,sede:e.target.value}))}><option value="">Sin sede asignada</option>{[{nombre:'Planta Norte',dir:'Av. Industrial 1450, Ate Vitarte'},{nombre:'Sede Sur',dir:'Jr. Los Incas 320, Villa El Salvador'}].map(s=><option key={s.nombre} value={s.nombre}>{s.nombre} — {s.dir}</option>)}</select></div>
              <div className="input-group"><label>Turno asignado</label><select className="select" value={formAlta.turno_id} onChange={e=>setFormAlta(v=>({...v,turno_id:e.target.value}))}>{turnos.map(t=><option key={t.id} value={t.id}>{t.nombre} ({t.hora_entrada} - {t.hora_salida})</option>)}</select></div>
              <div className="input-group"><label>Fecha inicio contrato *</label><input className="input" type="date" value={formAlta.fecha_inicio} onChange={e=>setFormAlta(v=>({...v,fecha_inicio:e.target.value}))}/></div>
              <div className="input-group"><label>Fecha fin contrato <span className="text-muted">(vacío = indefinido)</span></label><input className="input" type="date" value={formAlta.fecha_fin} onChange={e=>setFormAlta(v=>({...v,fecha_fin:e.target.value}))}/></div>
              <div className="input-group"><label>Sueldo base (S/)</label><input className="input" type="number" min="0" value={formAlta.remuneracion} onChange={e=>setFormAlta(v=>({...v,remuneracion:e.target.value}))} placeholder="0"/></div>
              <div className="input-group"><label>Estado</label><select className="select" value={formAlta.estado} onChange={e=>setFormAlta(v=>({...v,estado:e.target.value}))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="suspendido">Suspendido</option></select></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Beneficios</div>
            <div className="grid-2" style={{gap:14, marginBottom:24}}>
              <div className="input-group"><label>Días de vacaciones/año</label><input className="input" type="number" min="0" value={formAlta.dias_vacaciones} onChange={e=>setFormAlta(v=>({...v,dias_vacaciones:e.target.value}))}/></div>
              <div className="input-group"><label>Días disponibles</label><input className="input" readOnly value={formAlta.dias_vacaciones || 0} style={{color:'var(--fg-muted)'}}/></div>
            </div>

            <div className="row" style={{justifyContent:'flex-end', gap:10}}>
              <button type="button" className="btn btn-secondary" onClick={() => setPanelAlta(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{I.save} Guardar colaborador</button>
            </div>
          </form>
        </div>
      </>}
    </>
  );
}

// ============================================================
// MÉTRICAS SAAS — Fase 3 (solo Superadmin TIDEO)
// ============================================================
function MetricasSaaS() {
  const { metricasSaaS: m } = useApp?.() || {};
  const datos = m || MOCK.metricasSaaS;
  const mrrMax = Math.max(...datos.tendencia_mrr.map(t => t.mrr), 1);

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Métricas de Plataforma SaaS</h1><div className="page-sub">Vista global de la salud del negocio TIDEO · Actualizado {datos.fecha}</div></div>
        <button className="btn btn-secondary">{I.download} Exportar reporte</button>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Tenants activos</div><div className="kpi-value">{datos.tenants.activos}</div><div className="kpi-delta up">{I.arrowUp}+{datos.tenants.nuevos_mes} este mes</div><div className="kpi-icon cyan">{I.building}</div></div>
        <div className="kpi-card"><div className="kpi-label">MRR</div><div className="kpi-value">$ {datos.mrr.toLocaleString()}</div><div className="kpi-delta up">{I.arrowUp}+{datos.upgrades_mes} upgrade</div><div className="kpi-icon green">{I.dollar}</div></div>
        <div className="kpi-card"><div className="kpi-label">ARR</div><div className="kpi-value">$ {datos.arr.toLocaleString()}</div><div className="kpi-icon purple">{I.trend}</div></div>
        <div className="kpi-card"><div className="kpi-label">Retención mensual</div><div className="kpi-value" style={{color:'var(--green)'}}>{datos.retencion_mensual_pct}%</div><div className="kpi-icon green">{I.check}</div></div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
        <div className="card">
          <div className="card-head"><h3>Distribución por Plan</h3></div>
          <div className="card-body col" style={{gap:14}}>
            {datos.distribucion_planes.map((p, i) => (
              <div key={i}>
                <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                  <div className="row" style={{gap:8}}>
                    <span className={'badge badge-' + p.color}>{p.plan}</span>
                    <span className="text-muted" style={{fontSize:12}}>{p.tenants} tenant{p.tenants !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{fontWeight:700}}>$ {p.mrr.toLocaleString()} <span className="text-muted" style={{fontWeight:400, fontSize:12}}>({p.pct_mrr}%)</span></div>
                </div>
                <div style={{height:8, background:'var(--bg-subtle)', borderRadius:4, overflow:'hidden'}}>
                  <div style={{height:'100%', width: p.pct_mrr+'%', background:`var(--${p.color})`, borderRadius:4, transition:'width 0.6s'}}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Tendencia MRR</h3></div>
          <div className="card-body">
            <div style={{display:'flex', alignItems:'flex-end', gap:8, height:120}}>
              {datos.tendencia_mrr.map((t, i) => (
                <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
                  <div style={{fontSize:10, color:'var(--fg-muted)', fontFamily:'monospace'}}>$ {(t.mrr/1000).toFixed(1)}k</div>
                  <div style={{width:'100%', background:'var(--cyan)', borderRadius:'4px 4px 0 0', height: (t.mrr / mrrMax * 80) + 'px', transition:'height 0.6s'}}/>
                  <div style={{fontSize:10, color:'var(--fg-subtle)'}}>{t.mes}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-6">
        <div className="card-head"><h3>Tenants</h3><span className="text-muted" style={{fontSize:12}}>{datos.tenants.en_prueba} en prueba</span></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Empresa</th><th>Plan</th><th>País</th><th>Usuarios</th><th>Storage</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <tr>
                <td><div className="row"><div style={{width:32,height:32,borderRadius:6,background:'var(--cyan-lt)',color:'var(--cyan-dk)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12}}>SI</div><strong>Servicios Industriales Norte SAC</strong></div></td>
                <td><span className="badge badge-purple">Enterprise</span></td><td>Perú</td>
                <td className="num">9 / 25</td><td className="num">7.2 GB</td>
                <td className="text-muted">Hace 5 min</td>
                <td><span className="badge badge-green">Activo</span></td>
                <td><button className="btn btn-sm btn-ghost">Modo soporte</button></td>
              </tr>
              <tr>
                <td><div className="row"><div style={{width:32,height:32,borderRadius:6,background:'var(--green-lt)',color:'var(--green-dk)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12}}>MA</div><strong>Mantenimiento Andes SRL</strong></div></td>
                <td><span className="badge badge-cyan">Professional</span></td><td>Perú</td>
                <td className="num">18 / 20</td><td className="num">5.2 GB</td>
                <td className="text-muted">Ayer</td>
                <td><span className="badge badge-orange">En prueba</span></td>
                <td><button className="btn btn-sm btn-ghost">Modo soporte</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {datos.tenants_riesgo.length === 0 && (
        <div style={{marginTop:16, padding:'14px 16px', background:'rgba(22,163,74,0.08)', border:'1px solid var(--green)', borderRadius:10}} className="row">
          {I.check}<strong>Sin tenants en riesgo.</strong> Todos los tenants tienen actividad reciente y soporte sin incidentes críticos.
        </div>
      )}
    </>
  );
}

export { Roles, Usuarios, Tenants, Planes, Stub, Maestros, Servicios, Tarifarios, Parametros, RRHHAdmin, MetricasSaaS };

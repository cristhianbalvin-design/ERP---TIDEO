import React, { useState, useEffect, useMemo } from 'react';
import { I, money } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { SIDEBAR } from './shell.jsx';
import { getSupabaseClient } from './lib/supabaseClient.js';

// Roles builder, Usuarios, Tenants/Planes, and simple stub pages

function Roles() {
  const { roles, clonarRol, actualizarPermisosRol, guardarPermisosRol, crearRol, eliminarRol, editarRol, usuarios, setUsuarios, addNotificacion, accessDebug } = useApp();
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
  const [nuevoCategoria, setNuevoCategoria] = useState('otro');
  const [clonarNombre, setClonarNombre] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategoria, setEditCategoria] = useState('otro');
  const [reasignarUsuario, setReasignarUsuario] = useState(null);
  const [reasignarRolId, setReasignarRolId] = useState('');
  const [roleActionError, setRoleActionError] = useState('');
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);
  const [permisosDirty, setPermisosDirty] = useState(false);

  // Sync sel cuando se elimina un rol
  useEffect(() => {
    if (!rolKeys.length) return;
    if (!sel || !roles[sel]) setSel(rolKeys[0]);
  }, [rolKeys, roles, sel]);

  useEffect(() => {
    setPermisosDirty(false);
    setRoleActionError('');
  }, [sel]);

  const handleNuevoRol = async () => {
    if (!nuevoNombre.trim()) return;
    const newId = await crearRol({ nombre: nuevoNombre.trim(), descripcion: nuevoDesc.trim(), categoria: nuevoCategoria });
    if (newId) setSel(newId);
    setModalNuevo(false);
    setNuevoNombre('');
    setNuevoDesc('');
    setNuevoCategoria('otro');
  };

  const handleClonar = () => {
    if (!clonarNombre.trim()) return;
    const newId = clonarRol(sel, clonarNombre.trim());
    if (newId) setSel(newId);
    setModalClonar(false);
    setClonarNombre('');
  };

  const handleEliminar = async () => {
    setRoleActionError('');
    if (role?.es_superadmin) {
      const message = 'No puedes eliminar un rol superadmin.';
      setRoleActionError(message);
      addNotificacion(message, 'error');
      return;
    }
    const assigned = role?.assigned_count ?? usuarios.filter(u => u.rol === sel).length;
    if (rolKeys.length <= 1) {
      const message = 'No puedes eliminar el unico rol.';
      setRoleActionError(message);
      addNotificacion(message, 'error');
      return;
    }
    const detail = assigned > 0
      ? ` Tambien se eliminaran ${assigned} asignacion(es) interna(s) de usuarios_empresas para liberar el rol.`
      : '';
    if (!confirm(`Eliminar el rol "${role?.nombre}"?${detail} Esta accion no se puede deshacer.`)) return;
    const eliminado = await eliminarRol(sel);
    if (eliminado) setSel(rolKeys.find(k => k !== sel) || '');
  };

  const handleSaveMeta = () => {
    editarRol(sel, { nombre: editNombre, descripcion: editDesc, categoria: editCategoria });
    setEditingMeta(false);
  };

  const handleGuardarPermisos = async () => {
    setRoleActionError('');
    setGuardandoPermisos(true);
    try {
      await guardarPermisosRol(sel);
      setPermisosDirty(false);
    } catch (error) {
      const message = `No se pudieron guardar los permisos: ${error?.message || 'Error desconocido'}`;
      setRoleActionError(message);
      addNotificacion(message, 'error');
    } finally {
      setGuardandoPermisos(false);
    }
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
          onChange={e => { actualizarPermisosRol(sel, p.key, realKey, e.target.checked); setPermisosDirty(true); }}
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

      {(accessDebug?.rolesError || accessDebug?.rolesLoadedAt) && (
        <div className={accessDebug?.rolesError ? 'alert alert-danger' : 'alert alert-info'} style={{marginBottom:16}}>
          {accessDebug?.rolesError
            ? `Roles: ${accessDebug.rolesError}`
            : `Roles cargados desde Supabase a las ${accessDebug.rolesLoadedAt}.`}
        </div>
      )}
      {roleActionError && (
        <div className="alert alert-danger" style={{marginBottom:16}}>
          {roleActionError}
        </div>
      )}

      <div style={{display:'grid', gridTemplateColumns:'280px 1fr', gap:20}}>
        {/* Sidebar roles */}
        <div className="card" style={{height:'fit-content'}}>
          <div className="card-head"><h3>Roles</h3></div>
          <div style={{padding:8}}>
            {Object.entries(roles).map(([k,r])=>(
              <div key={k} onClick={()=>setSel(k)} style={{padding:'10px 12px', borderRadius:8, cursor:'pointer', background:sel===k?'var(--surface-hover)':'transparent', borderLeft:sel===k?'3px solid var(--cyan)':'3px solid transparent', position:'relative'}}>
                <div style={{fontWeight:600, fontSize:13}}>{r.nombre}</div>
                <div className="text-muted" style={{fontSize:11,marginTop:2}}>{r.descripcion}</div>
                <div className="text-subtle" style={{fontSize:11,marginTop:4}}>{r.assigned_count ?? usuarios.filter(u=>u.rol===k).length} usuarios</div>
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
                <select className="select" style={{fontSize:12}} value={editCategoria} onChange={e=>setEditCategoria(e.target.value)}>
                  <option value="admin">Administración del tenant</option>
                  <option value="comercial">Comercial / Ventas</option>
                  <option value="operaciones">Operaciones</option>
                  <option value="finanzas">Finanzas</option>
                  <option value="rrhh">RRHH</option>
                  <option value="otro">Otro</option>
                </select>
                <div className="row" style={{gap:6}}>
                  <button className="btn btn-sm btn-primary" onClick={handleSaveMeta}>Guardar</button>
                  <button className="btn btn-sm btn-secondary" onClick={()=>setEditingMeta(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="col" style={{gap:4, flex:1}}>
                <h3 style={{margin:0}}>{role.nombre}</h3>
                <div className="text-muted" style={{fontSize:12}}>{role.descripcion}</div>
                <div className="row" style={{gap:8, alignItems:'center'}}>
                  <div className="text-subtle" style={{fontSize:11}}>Categoría: <strong>{role.categoria || 'otro'}</strong></div>
                  <button className="btn btn-sm btn-secondary" style={{fontSize:11,padding:'2px 8px'}} onClick={()=>{ setEditNombre(role.nombre); setEditDesc(role.descripcion||''); setEditCategoria(role.categoria||'otro'); setEditingMeta(true); }}>Editar</button>
                </div>
              </div>
            )}
            <div className="row" style={{gap:8}}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleGuardarPermisos}
                disabled={guardandoPermisos}
                title="Guardar permisos del rol seleccionado"
              >
                {I.save} {guardandoPermisos ? 'Guardando...' : permisosDirty ? 'Guardar permisos' : 'Guardar permisos'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={()=>setPreview(true)}>{I.eye} Como ve la app este rol?</button>
              <button
                className="btn btn-secondary btn-sm"
                style={{color:'var(--danger)'}}
                onClick={handleEliminar}
                title={role?.es_superadmin ? 'No se puede eliminar un rol superadmin' : 'Eliminar rol'}
              >
                {I.trash} Eliminar rol
              </button>
            </div>
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
                    onClick={()=>{ actualizarPermisosRol(sel, null, x.k, !(role.permisos[x.k]||role.permisos.todo)); setPermisosDirty(true); }}/>
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
                  onBlur={e => { actualizarPermisosRol(sel, null, 'monto_max_compras', Number(e.target.value.replace(/[^0-9]/g,'')) || 0); setPermisosDirty(true); }}/>
              </div>
              <div className="row" style={{justifyContent:'space-between',padding:12,border:'1px solid var(--border)',borderRadius:8}}>
                <div style={{fontSize:13,fontWeight:500}}>Perfil de campo</div>
                <select className="select" style={{width:180}}
                  key={sel}
                  value={role.permisos.perfil_campo || 'ninguno'}
                  onChange={e => { actualizarPermisosRol(sel, null, 'perfil_campo', e.target.value === 'ninguno' ? null : e.target.value); setPermisosDirty(true); }}>
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
                <thead><tr><th>Usuario</th><th>Email</th><th>Último acceso</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
                <tbody>
                  {usuarios.filter(u=>u.rol===sel).length === 0 && (
                    <tr><td colSpan={4} style={{textAlign:'center',color:'var(--fg-muted)',padding:24}}>Ningún usuario asignado a este rol.</td></tr>
                  )}
                  {usuarios.filter(u=>u.rol===sel).map(u=>(
                    <tr key={u.id}>
                      <td><strong>{u.nombre}</strong></td>
                      <td className="text-muted">{u.email}</td>
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
            <div className="input-group">
              <label>Categoría <span className="text-muted" style={{fontSize:11}}>— define qué puede seleccionar este rol en formularios</span></label>
              <select className="select" value={nuevoCategoria} onChange={e=>setNuevoCategoria(e.target.value)}>
                <option value="admin">Administración del tenant</option>
                <option value="comercial">Comercial / Ventas</option>
                <option value="operaciones">Operaciones</option>
                <option value="finanzas">Finanzas</option>
                <option value="rrhh">RRHH</option>
                <option value="otro">Otro</option>
              </select>
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
  const { usuarios, setUsuarios, addNotificacion, empresa, empresasPlataforma, crearUsuarioConAcceso, eliminarUsuario, actualizarUsuarioAcceso, roles: rolesCtx, accessDebug } = useApp();
  const [resetting, setResetting] = useState(null);
  const [tempPass, setTempPass] = useState('Tideo2026!');
  const [creando, setCreando] = useState(false);
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', email: '', rol: 'vendedor', password: '', campo: false, campoModulos: [] });
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [nuevoError, setNuevoError] = useState('');
  const [editando, setEditando] = useState(null);
  const mobileModuleOptions = [
    { id: 'tecnico', label: 'Tecnico' },
    { id: 'logistica', label: 'Logistica' },
    { id: 'vendedor', label: 'Vendedor' },
    { id: 'compras', label: 'Compras' },
    { id: 'supervisor', label: 'Supervisor' },
    { id: 'gerencia', label: 'Gerencia' },
    { id: 'asistencia', label: 'Control de asistencia' },
  ];
  const legacyModuloCampo = (perfil) => {
    const value = String(perfil || '').toLowerCase();
    if (value.includes('vendedor')) return 'vendedor';
    if (value.includes('compra')) return 'compras';
    if (value.includes('supervisor')) return 'supervisor';
    if (value.includes('gerencia')) return 'gerencia';
    return 'tecnico';
  };
  const getCampoModulos = (usuario) => {
    if (Array.isArray(usuario.campoModulos) && usuario.campoModulos.length) return usuario.campoModulos;
    if (Array.isArray(usuario.campo_modulos) && usuario.campo_modulos.length) return usuario.campo_modulos;
    return usuario.campo ? [legacyModuloCampo(usuario.campoPerfil || usuario.campo_perfil)] : [];
  };
  const [editForm, setEditForm] = useState({ nombre: '', email: '', rol: '', campo: false, campoModulos: [], estado: 'Activo' });
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [filtroTenant, setFiltroTenant] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

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
    setNuevoError('');
    setGuardandoNuevo(true);
    try {
      await crearUsuarioConAcceso(nuevoForm);
      setCreando(false);
      setNuevoForm({ nombre: '', email: '', rol: 'vendedor', password: '', campo: false, campoModulos: [] });
    } catch (error) {
      setNuevoError(error?.message || 'No se pudo crear el usuario.');
    }
    setGuardandoNuevo(false);
  };

  const abrirEditarUsuario = (usuario) => {
    setEditError('');
    setEditando(usuario);
    setEditForm({
      nombre: usuario.nombre || '',
      email: usuario.email || '',
      rol: usuario.rol || '',
      campo: Boolean(usuario.campo),
      campoModulos: getCampoModulos(usuario),
      estado: usuario.estado || 'Activo',
    });
  };

  const handleEditarUsuario = async (e) => {
    e.preventDefault();
    if (!editando) return;
    setEditError('');
    setGuardandoEdit(true);
    try {
      await actualizarUsuarioAcceso(editando.id, {
        ...editForm,
        empresa_id: editando.empresa_id,
        campoModulos: editForm.campo ? editForm.campoModulos : [],
      });
      setEditando(null);
    } catch (error) {
      setEditError(error?.message || 'No se pudo actualizar el usuario.');
    } finally {
      setGuardandoEdit(false);
    }
  };

  const rolPerteneceTenant = (r) => {
    if (!empresa?.id) return true;
    if (empresa.id === 'emp_tideo') return !r.empresa_id || r.empresa_id === empresa.id;
    return r.empresa_id === empresa.id;
  };
  const rolesOpciones = Object.entries(rolesCtx || {}).filter(([,r]) => !r.es_superadmin && rolPerteneceTenant(r));
  const rolesEditOpciones = Object.entries(rolesCtx || {}).filter(([id, r]) => (
    (!r.es_superadmin && rolPerteneceTenant(r)) || id === editando?.rol
  ));

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
      {(accessDebug?.usuariosError || accessDebug?.usuariosLoadedAt) && (
        <div className={accessDebug?.usuariosError ? 'alert alert-danger' : 'alert alert-info'} style={{marginBottom:16}}>
          {accessDebug?.usuariosError
            ? `Usuarios: ${accessDebug.usuariosError}`
            : `Usuarios cargados desde Supabase a las ${accessDebug.usuariosLoadedAt}.`}
        </div>
      )}
      <div style={{display:'flex', gap:10, marginBottom:14, flexWrap:'wrap'}}>
        <input
          className="input"
          style={{flex:'1 1 180px', minWidth:160}}
          placeholder="Buscar usuario o email..."
          value={filtroUsuario}
          onChange={e => setFiltroUsuario(e.target.value)}
        />
        <select
          className="input"
          style={{flex:'1 1 180px', minWidth:160}}
          value={filtroTenant}
          onChange={e => setFiltroTenant(e.target.value)}
        >
          <option value="">Todos los tenants</option>
          {[...new Map(usuarios.map(u => [u.empresa_id, getEmpresa(u.empresa_id)])).entries()].map(([id, nombre]) => (
            <option key={id} value={id}>{nombre}</option>
          ))}
        </select>
        <select
          className="input"
          style={{flex:'1 1 140px', minWidth:120}}
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {[...new Set(usuarios.map(u => u.estado).filter(Boolean))].map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Tenant</th><th>Campo</th><th>Estado</th><th>Último login</th><th style={{textAlign:'right'}}>Acceso</th></tr></thead>
            <tbody>
              {usuarios.filter(u => {
                if (filtroTenant && u.empresa_id !== filtroTenant) return false;
                if (filtroEstado && u.estado !== filtroEstado) return false;
                if (filtroUsuario) {
                  const q = filtroUsuario.toLowerCase();
                  if (!u.nombre?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
                }
                return true;
              }).length === 0 && (
                <tr><td colSpan={8} style={{textAlign:'center',color:'var(--fg-muted)',padding:24}}>No hay usuarios que coincidan con los filtros.</td></tr>
              )}
              {usuarios.filter(u => {
                if (filtroTenant && u.empresa_id !== filtroTenant) return false;
                if (filtroEstado && u.estado !== filtroEstado) return false;
                if (filtroUsuario) {
                  const q = filtroUsuario.toLowerCase();
                  if (!u.nombre?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
                }
                return true;
              }).map(u=>{
              const r = rolesCtx?.[u.rol] || MOCK.roles[u.rol] || { nombre: u.rol_nombre || u.rol, color: 'gray' };
              const isSuperadminTideo = Boolean(
                r.es_superadmin ||
                u.rol === 'rol_tideo_super' ||
                /superadmin\s+tideo/i.test(String(r.nombre || u.rol_nombre || u.rol || ''))
              );
              return (
                <tr key={`${u.id}_${u.empresa_id}`}>
                  <td><div className="row"><div className="avatar" style={{width:28,height:28,fontSize:11}}>{u.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><strong>{u.nombre}</strong></div></td>
                  <td className="text-muted">{u.email}</td>
                  <td><span className={'badge badge-'+r.color}>{r.nombre}</span></td>
                  <td className="text-muted">{getEmpresa(u.empresa_id)}</td>
                  <td>{u.campo?<span className="badge badge-cyan">{I.mobile}{getCampoModulos(u).map(m => mobileModuleOptions.find(x => x.id === m)?.label || m).join(', ')}</span>:<span className="text-subtle">—</span>}</td>
                  <td><span className="badge badge-green">{u.estado}</span></td>
                  <td className="text-muted">{u.ultimo || 'Nuevo'}</td>
                  <td style={{textAlign:'right'}}>
                    <div style={{display:'flex', gap:4, justifyContent:'flex-end'}}>
                      <button className="btn btn-ghost btn-sm" title="Editar usuario" onClick={() => abrirEditarUsuario(u)}>
                        <span style={{width:16,height:16,display:'inline-flex'}}>{I.edit}</span>
                      </button>
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

      {editando && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:520}}>
            <div className="modal-head">
              <h2>Editar usuario</h2>
              <button className="icon-btn" onClick={() => setEditando(null)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:14}} onSubmit={handleEditarUsuario}>
              {editError && <div className="alert alert-danger">{editError}</div>}
              <div className="input-group">
                <label>Nombre completo</label>
                <input className="input" required value={editForm.nombre} onChange={e => setEditForm(p => ({...p, nombre: e.target.value}))} />
              </div>
              <div className="input-group">
                <label>Email</label>
                <input className="input" type="email" required value={editForm.email} onChange={e => setEditForm(p => ({...p, email: e.target.value}))} />
              </div>
              <div className="input-group">
                <label>Rol</label>
                <select className="input" value={editForm.rol} onChange={e => setEditForm(p => ({...p, rol: e.target.value}))}>
                  {rolesEditOpciones.map(([id, r]) => <option key={id} value={id}>{r.nombre}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Estado</label>
                <select className="input" value={editForm.estado} onChange={e => setEditForm(p => ({...p, estado: e.target.value}))}>
                  <option value="Activo">Activo</option>
                  <option value="Invitado">Invitado</option>
                  <option value="Suspendido">Suspendido</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
              <label className="row" style={{gap:8, fontSize:13}}>
                <input type="checkbox" className="checkbox" checked={editForm.campo} onChange={e => setEditForm(p => ({...p, campo: e.target.checked}))} />
                Acceso a campo movil
              </label>
              {editForm.campo && (
                <div className="input-group">
                  <label>Modulos moviles habilitados</label>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                    {mobileModuleOptions.map(mod => (
                      <label key={mod.id} className="row" style={{gap:8, fontSize:13, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8}}>
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={editForm.campoModulos.includes(mod.id)}
                          onChange={e => setEditForm(p => ({
                            ...p,
                            campoModulos: e.target.checked
                              ? [...new Set([...p.campoModulos, mod.id])]
                              : p.campoModulos.filter(x => x !== mod.id)
                          }))}
                        />
                        {mod.label}
                      </label>
                    ))}
                  </div>
                  <div className="text-muted" style={{fontSize:12, marginTop:6}}>Control de asistencia requiere una ficha de colaborador con el mismo email y turno asignado.</div>
                </div>
              )}
              <div className="modal-foot mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardandoEdit}>{guardandoEdit ? 'Guardando...' : 'Guardar cambios'}</button>
              </div>
            </form>
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
              {nuevoError && <div className="alert alert-danger">{nuevoError}</div>}
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
              <label className="row" style={{gap:8, fontSize:13}}>
                <input type="checkbox" className="checkbox" checked={nuevoForm.campo} onChange={e => setNuevoForm(p => ({...p, campo: e.target.checked}))} />
                Acceso a campo movil
              </label>
              {nuevoForm.campo && (
                <div className="input-group">
                  <label>Modulos moviles habilitados</label>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                    {mobileModuleOptions.map(mod => (
                      <label key={mod.id} className="row" style={{gap:8, fontSize:13, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8}}>
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={nuevoForm.campoModulos.includes(mod.id)}
                          onChange={e => setNuevoForm(p => ({
                            ...p,
                            campoModulos: e.target.checked
                              ? [...new Set([...p.campoModulos, mod.id])]
                              : p.campoModulos.filter(x => x !== mod.id)
                          }))}
                        />
                        {mod.label}
                      </label>
                    ))}
                  </div>
                  <div className="text-muted" style={{fontSize:12, marginTop:6}}>Control de asistencia requiere una ficha de colaborador con el mismo email y turno asignado.</div>
                </div>
              )}
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


function Tenants() {
  const { empresasPlataforma = MOCK.empresas, usuarios = [], actualizarTenant, eliminarTenant, addNotificacion } = useApp();
  const tenants = empresasPlataforma.length ? empresasPlataforma : MOCK.empresas;
  const activos = tenants.filter(t => ['activa', 'activo'].includes(String(t.estado || '').toLowerCase())).length;
  const demos = tenants.filter(t => String(t.estado || '').toLowerCase() === 'demo').length;
  const paises = new Set(tenants.map(t => t.pais || 'PE')).size;

  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const abrirEditar = (t) => {
    setForm({
      razon_social: t.razon_social || t.nombre || '',
      nombre_comercial: t.nombre_comercial || '',
      ruc: t.ruc || '',
      pais: t.pais || 'PE',
      moneda_base: t.moneda_base || t.moneda || 'PEN',
      estado: t.estado || 'activa',
    });
    setEditando(t);
  };

  const guardar = async () => {
    if (!form.razon_social?.trim()) return;
    setSaving(true);
    try {
      await actualizarTenant(editando.id, form);
      addNotificacion(`Tenant "${form.nombre_comercial || form.razon_social}" actualizado.`);
      setEditando(null);
    } catch (e) {
      addNotificacion(`Error al actualizar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmarEliminar = async () => {
    setSaving(true);
    setDeleteError(null);
    try {
      await eliminarTenant(confirmando);
      addNotificacion('Tenant eliminado.');
      setConfirmando(null);
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setSaving(false);
    }
  };

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
        <thead><tr><th>Empresa</th><th>RUC / NIT</th><th>Pais</th><th>Moneda</th><th>Tenant ID</th><th>Fecha alta</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
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
                <td>
                  <div className="row" style={{gap:4, justifyContent:'flex-end'}}>
                    <button className="icon-btn" title="Editar" style={{color:'var(--cyan)'}} onClick={() => abrirEditar(t)}>{I.edit}</button>
                    <button className="icon-btn" title="Eliminar" style={{color:'var(--red)'}} onClick={() => setConfirmando(t.id)}>{I.trash}</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div></div>

      {/* Modal: Editar tenant */}
      {editando && <>
        <div className="side-panel-backdrop" onClick={() => setEditando(null)}/>
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:12,padding:28,width:480,zIndex:200,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
          <h3 style={{marginBottom:20}}>Editar tenant</h3>
          <div className="col" style={{gap:14}}>
            <div className="input-group">
              <label>Razón Social *</label>
              <input className="input" value={form.razon_social} onChange={e => setForm(f => ({...f, razon_social: e.target.value}))} placeholder="Razón Social" autoFocus/>
            </div>
            <div className="input-group">
              <label>Nombre Comercial</label>
              <input className="input" value={form.nombre_comercial} onChange={e => setForm(f => ({...f, nombre_comercial: e.target.value}))} placeholder="Nombre que aparece en el sistema"/>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div className="input-group">
                <label>RUC / NIT</label>
                <input className="input" value={form.ruc} onChange={e => setForm(f => ({...f, ruc: e.target.value}))} placeholder="20000000000"/>
              </div>
              <div className="input-group">
                <label>País</label>
                <input className="input" value={form.pais} onChange={e => setForm(f => ({...f, pais: e.target.value}))} placeholder="PE"/>
              </div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div className="input-group">
                <label>Moneda</label>
                <select className="input" value={form.moneda_base} onChange={e => setForm(f => ({...f, moneda_base: e.target.value}))}>
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                  <option value="COP">COP</option>
                  <option value="CLP">CLP</option>
                </select>
              </div>
              <div className="input-group">
                <label>Estado</label>
                <select className="input" value={form.estado} onChange={e => setForm(f => ({...f, estado: e.target.value}))}>
                  <option value="activa">Activa</option>
                  <option value="demo">Demo</option>
                  <option value="suspendida">Suspendida</option>
                </select>
              </div>
            </div>
          </div>
          <div className="row" style={{gap:8, marginTop:24, justifyContent:'flex-end'}}>
            <button className="btn btn-secondary" onClick={() => setEditando(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardar} disabled={saving || !form.razon_social?.trim()}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </div>
      </>}

      {/* Confirmación: Eliminar tenant */}
      {confirmando && <>
        <div className="side-panel-backdrop" onClick={() => setConfirmando(null)}/>
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:12,padding:28,width:420,zIndex:200,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
          <h3 style={{marginBottom:8}}>Eliminar tenant</h3>
          <p className="text-muted" style={{fontSize:14,marginBottom:16}}>¿Seguro que deseas eliminar <strong>{tenants.find(t => t.id === confirmando)?.nombre || confirmando}</strong>? Esta acción no se puede deshacer.</p>
          {deleteError && <div style={{background:'var(--red-lt,#fee)',color:'var(--red,#dc2626)',padding:'8px 12px',borderRadius:6,fontSize:13,marginBottom:12}}>{deleteError}</div>}
          <div className="row" style={{gap:8, justifyContent:'flex-end'}}>
            <button className="btn btn-secondary" onClick={() => { setConfirmando(null); setDeleteError(null); }} disabled={saving}>Cancelar</button>
            <button className="btn btn-danger" onClick={confirmarEliminar} disabled={saving}>{saving ? 'Eliminando...' : 'Eliminar'}</button>
          </div>
        </div>
      </>}
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
  const {
    navigate, cuentas, proveedores, personalAdmin = [], personalOperativo = [],
    areasEmpresa, cargos, especialidades, tiposServicio, almacenes, sedes, industrias,
    crearArea, actualizarArea, eliminarArea,
    crearCargo, actualizarCargo, eliminarCargo,
    crearEspecialidad, actualizarEspecialidad, eliminarEspecialidad,
    crearTipoServicio, actualizarTipoServicio, eliminarTipoServicio,
    crearAlmacen, actualizarAlmacen, eliminarAlmacen,
    crearSede, actualizarSede, eliminarSede,
    crearIndustria, actualizarIndustria, eliminarIndustria,
    addNotificacion
  } = useApp();
  const [sel, setSel] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const formRef = React.useRef(null);
  const [clienteSearch, setClienteSearch] = useState('');

  const maestrosCatalogos = [
    { id: 'mst_industrias', tabla: 'Industrias' },
    { id: 'mst_sedes', tabla: 'Sedes y ubicaciones GPS' },
    { id: 'mst_centros_costo', tabla: 'Centros de costo' },
    { id: 'mst_areas', tabla: 'Areas de la empresa' },
    { id: 'mst_cargos', tabla: 'Cargos de la empresa' },
    { id: 'mst_especialidades', tabla: 'Especialidades técnicas' },
    { id: 'mst_materiales', tabla: 'Materiales e insumos con codigo de barras' },
    { id: 'mst_impuestos', tabla: 'Monedas, impuestos y unidades' },
    { id: 'mst_tipos_servicio', tabla: 'Tipos de servicio interno' },
    { id: 'mst_almacenes', tabla: 'Almacenes y depósitos' },
  ];
  const nuevoBase = { nombre:'', detalle:'', estado:'activo', area:'', requiere_cert:false, clasificacion:'', facturable:false, tipo:'', responsable:'', direccion:'', tipo_cargo:'' };
  const [rows, setRows] = useState({
    mst_clientes: [],
    mst_proveedores: [],
    mst_materiales: [],
    mst_impuestos: [],
    mst_centros_costo: []
  });
  const [nuevo, setNuevo] = useState(nuevoBase);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const getSelectedRows = () => {
    if (!sel) return [];
    if (sel.id === 'mst_areas') return areasEmpresa;
    if (sel.id === 'mst_cargos') return cargos;
    if (sel.id === 'mst_especialidades') return especialidades;
    if (sel.id === 'mst_tipos_servicio') return tiposServicio;
    if (sel.id === 'mst_almacenes') return almacenes;
    if (sel.id === 'mst_sedes') return sedes;
    if (sel.id === 'mst_industrias') return industrias;
    return rows[sel.id] || [];
  };
  const selectedRows = getSelectedRows();
  const responsablesPersonal = [...personalAdmin, ...personalOperativo]
    .filter(p => p?.id && p?.nombre)
    .map(p => ({ id: p.id, nombre: p.nombre, tipo: personalOperativo.some(op => op.id === p.id) ? 'Operativo' : 'Administrativo' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const formLen = editandoId ? Math.max(selectedRows.length - 1, 0) : selectedRows.length;

  const scrollToForm = () => {
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const resetForm = () => {
    setNuevo(nuevoBase);
    setEditandoId(null);
    setFormError('');
  };

  const autoCode = (id, len) => {
    const prefixMap = { mst_areas:'ARE', mst_cargos:'CAR', mst_especialidades:'ESP', mst_tipos_servicio:'TSI', mst_almacenes:'ALM', mst_sedes:'SED', mst_industrias:'IND', mst_clientes:'CLI', mst_proveedores:'PRV', mst_centros_costo:'CC', mst_materiales:'MAT', mst_impuestos:'TAX' };
    const prefix = prefixMap[id] || id.slice(4,7).toUpperCase();
    return `${prefix}-${String(len+1).padStart(3,'0')}`;
  };

  const addRow = async (e) => {
    e.preventDefault();
    if (!sel) return;
    setFormSaving(true);
    setFormError('');
    const base = {
      codigo: editandoId ? nuevo.codigo : autoCode(sel.id, selectedRows.length),
      nombre: nuevo.nombre || 'Nuevo valor',
      estado: nuevo.estado
    };
    try {
      if (sel.id === 'mst_areas') {
        const item = { ...base, tipo: nuevo.tipo || 'Ambos', responsable: nuevo.responsable || '', detalle: nuevo.detalle || '' };
        if (editandoId) await actualizarArea(editandoId, item);
        else await crearArea(item);
      } else if (sel.id === 'mst_cargos') {
        const item = { ...base, tipo: nuevo.tipo_cargo || 'Administrativo', detalle: nuevo.detalle || 'Pendiente de completar' };
        if (editandoId) await actualizarCargo(editandoId, item);
        else await crearCargo(item);
      } else if (sel.id === 'mst_especialidades') {
        const item = { ...base, area: nuevo.area || 'General', requiere_cert: nuevo.requiere_cert };
        if (editandoId) await actualizarEspecialidad(editandoId, item);
        else await crearEspecialidad(item);
      } else if (sel.id === 'mst_tipos_servicio') {
        const item = { ...base, clasificacion: nuevo.clasificacion || 'General', facturable: nuevo.facturable };
        if (editandoId) await actualizarTipoServicio(editandoId, item);
        else await crearTipoServicio(item);
      } else if (sel.id === 'mst_almacenes') {
        const item = { ...base, tipo: nuevo.tipo || 'Central', responsable: nuevo.responsable || '', direccion: nuevo.direccion || '' };
        if (editandoId) await actualizarAlmacen(editandoId, item);
        else await crearAlmacen(item);
      } else if (sel.id === 'mst_sedes') {
        const item = { ...base, direccion: nuevo.direccion || 'Sin direccion', gps: nuevo.gps || '' };
        if (editandoId) await actualizarSede(editandoId, item);
        else await crearSede(item);
      } else if (sel.id === 'mst_industrias') {
        const item = { ...base, categoria: nuevo.detalle || 'General' };
        if (editandoId) await actualizarIndustria(editandoId, item);
        else await crearIndustria(item);
      } else {
        return;
      }
      addNotificacion?.(`${sel.tabla}: registro ${editandoId ? 'actualizado' : 'creado'}.`);
      resetForm();
    } catch (err) {
      console.error(err);
      const rawMsg = err?.message || 'No se pudo guardar el registro.';
      const msg = rawMsg.includes('areas_empresa') || rawMsg.includes('schema cache')
        ? 'No existe la tabla areas_empresa en Supabase. Aplica la migracion 050_maestro_areas_empresa.sql y recarga el schema cache.'
        : rawMsg;
      setFormError(msg);
      addNotificacion?.(`No se pudo guardar el registro: ${msg}`);
    } finally {
      setFormSaving(false);
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

  const submitLabel = (text) => (
    <>{!editandoId && I.plus} {formSaving ? 'Guardando...' : editandoId ? `Actualizar ${text}` : `Agregar ${text}`}</>
  );

  const FormActions = ({ label }) => (
    <div style={{display:'flex', gap:10, justifyContent:'flex-end', alignItems:'end', gridColumn:'1 / -1'}}>
      {editandoId && <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancelar</button>}
      <button className="btn btn-primary" type="submit" disabled={formSaving} style={{minWidth:180}}>{submitLabel(label)}</button>
    </div>
  );

  const editarRegistro = (r) => {
    const form = {
      ...nuevoBase,
      codigo: r.codigo || '',
      nombre: r.nombre || '',
      estado: r.estado || 'activo',
      detalle: r.detalle || r.categoria || '',
      area: r.area || '',
      requiere_cert: Boolean(r.requiere_cert),
      clasificacion: r.clasificacion || '',
      facturable: Boolean(r.facturable),
      tipo: r.tipo || '',
      responsable: r.responsable || '',
      direccion: r.direccion || '',
      gps: r.gps || '',
      tipo_cargo: r.tipo || ''
    };
    setEditandoId(r.id);
    setNuevo(form);
    setFormError('');
    scrollToForm();
  };

  const eliminarRegistro = async (r) => {
    if (!sel || !window.confirm(`Eliminar "${r.nombre}"? Esta accion se reflejara en la base de datos.`)) return;
    try {
      if (sel.id === 'mst_cargos') await eliminarCargo(r.id);
      else if (sel.id === 'mst_areas') await eliminarArea(r.id);
      else if (sel.id === 'mst_especialidades') await eliminarEspecialidad(r.id);
      else if (sel.id === 'mst_tipos_servicio') await eliminarTipoServicio(r.id);
      else if (sel.id === 'mst_almacenes') await eliminarAlmacen(r.id);
      else if (sel.id === 'mst_sedes') await eliminarSede(r.id);
      else if (sel.id === 'mst_industrias') await eliminarIndustria(r.id);
      else return;
      if (editandoId === r.id) resetForm();
      addNotificacion?.(`${sel.tabla}: registro eliminado.`);
    } catch (err) {
      const msg = err?.message || 'No se pudo eliminar el registro.';
      setFormError(msg);
      addNotificacion?.(`No se pudo eliminar el registro: ${msg}`);
    }
  };

  const RowActions = ({ item }) => (
    <div className="row" style={{justifyContent:'flex-end', gap:6}}>
      <button className="icon-btn" title="Editar" onClick={() => editarRegistro(item)} style={{color:'var(--cyan)'}}>{I.edit}</button>
      <button className="icon-btn" title="Eliminar" onClick={() => eliminarRegistro(item)} style={{color:'var(--danger)'}}>{I.trash}</button>
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
        <thead><tr><th>Codigo</th><th>Proveedor</th><th>Categoria</th><th>Estado</th><th>Responsable</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
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
    if (sel?.id === 'mst_areas') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={formLen}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre del area *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Operaciones" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group">
            <label>Tipo de area</label>
            <select className="select" value={nuevo.tipo || 'Ambos'} onChange={e=>setNuevo(v=>({...v,tipo:e.target.value}))}>
              <option value="Administrativa">Administrativa</option>
              <option value="Operativa">Operativa</option>
              <option value="Ambos">Ambos</option>
            </select>
          </div>
          <div className="input-group" style={{gridColumn:'span 2'}}>
            <label>Responsable</label>
            <select className="select" value={nuevo.responsable} onChange={e=>setNuevo(v=>({...v,responsable:e.target.value}))}>
              <option value="">Sin responsable asignado</option>
              {responsablesPersonal.map(p => <option key={`${p.tipo}-${p.id}`} value={p.nombre}>{p.nombre} - {p.tipo}</option>)}
            </select>
          </div>
          <div className="input-group"><label>Descripcion breve</label><input className="input" value={nuevo.detalle} onChange={e=>setNuevo(v=>({...v,detalle:e.target.value}))} placeholder="Ej: Gestion operativa y supervision"/></div>
          <FormActions label="area" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_cargos') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={formLen}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre del cargo *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Analista de Calidad" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Tipo de personal *</label><select className="select" value={nuevo.tipo_cargo} onChange={e=>setNuevo(v=>({...v,tipo_cargo:e.target.value}))}><option value="">Seleccionar...</option><option value="Administrativo">Administrativo</option><option value="Operativo">Operativo</option><option value="Ambos">Ambos</option></select></div>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Descripción breve</label><input className="input" value={nuevo.detalle} onChange={e=>setNuevo(v=>({...v,detalle:e.target.value}))} placeholder="Ej: Responsable de análisis y reportes"/></div>
          <FormActions label="cargo" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_especialidades') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={formLen}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Electricista industrial" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Área</label><select className="select" value={nuevo.area} onChange={e=>setNuevo(v=>({...v,area:e.target.value}))}><option value="">Seleccionar...</option>{['Eléctrica','Mecánica','Civil','Instrumentación','Sistemas','Seguridad','General'].map(a=><option key={a}>{a}</option>)}</select></div>
          <div className="input-group"><label>Requiere certificación</label><select className="select" value={nuevo.requiere_cert?'si':'no'} onChange={e=>setNuevo(v=>({...v,requiere_cert:e.target.value==='si'}))}><option value="no">No</option><option value="si">Sí</option></select></div>
          <FormActions label="especialidad" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_tipos_servicio') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={formLen}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Mantenimiento predictivo" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Clasificación</label><select className="select" value={nuevo.clasificacion} onChange={e=>setNuevo(v=>({...v,clasificacion:e.target.value}))}><option value="">Seleccionar...</option>{['Preventivo','Correctivo','Proyecto','Emergencia','Garantía','Interno'].map(c=><option key={c}>{c}</option>)}</select></div>
          <div className="input-group"><label>Facturable</label><select className="select" value={nuevo.facturable?'si':'no'} onChange={e=>setNuevo(v=>({...v,facturable:e.target.value==='si'}))}><option value="si">Sí</option><option value="no">No</option></select></div>
          <FormActions label="tipo" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_almacenes') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={formLen}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre del almacén</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Almacén Sede Sur" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Tipo</label><select className="select" value={nuevo.tipo} onChange={e=>setNuevo(v=>({...v,tipo:e.target.value}))}><option value="">Seleccionar...</option>{['Central','Sede','Móvil','Tránsito'].map(t=><option key={t}>{t}</option>)}</select></div>
          <div className="input-group"><label>Responsable</label><input className="input" value={nuevo.responsable} onChange={e=>setNuevo(v=>({...v,responsable:e.target.value}))} placeholder="Nombre del responsable"/></div>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Dirección</label><input className="input" value={nuevo.direccion} onChange={e=>setNuevo(v=>({...v,direccion:e.target.value}))} placeholder="Dirección del almacén"/></div>
          <FormActions label="almacen" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_sedes') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <CodPreview id={sel.id} len={formLen}/>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre de la sede *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Sede Norte, Planta Central" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group" style={{gridColumn:'span 3'}}><label>Dirección física</label><input className="input" value={nuevo.direccion} onChange={e=>setNuevo(v=>({...v,direccion:e.target.value}))} placeholder="Ej: Av. Industrial 1450, Ate Vitarte, Lima"/></div>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Coordenadas GPS <span style={{fontSize:10,color:'var(--fg-subtle)',fontWeight:400}}>· lat, lng</span></label><input className="input" value={nuevo.gps} onChange={e=>setNuevo(v=>({...v,gps:e.target.value}))} placeholder="Ej: -12.0464, -77.0428"/></div>
          <FormActions label="sede" />
        </div>
      </form>
    );
    return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div className="grid-4" style={{gap:12}}>
          <CodPreview id={sel?.id||''} len={formLen}/>
          <div className="input-group"><label>Nombre</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option><option>bloqueado</option></select></div>
          <FormActions label="industria" />
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
            <thead><tr><th>RUC</th><th>Razón social</th><th>Industria</th><th>Responsable</th><th>Tipo</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
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
    if (sel?.id === 'mst_areas') return (
      <table className="tbl">
        <thead><tr><th>Codigo</th><th>Area</th><th>Tipo</th><th>Responsable</th><th>Descripcion</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`} style={{background: editandoId === r.id ? 'var(--bg-subtle)' : 'transparent'}}>
            <td className="mono text-muted">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td><span className={'badge '+(r.tipo==='Operativa'?'badge-cyan':r.tipo==='Administrativa'?'badge-gray':'badge-purple')} style={{fontSize:11}}>{r.tipo || 'Ambos'}</span></td>
            <td className="text-muted">{r.responsable || '-'}</td>
            <td className="text-muted" style={{fontSize:12}}>{r.detalle}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_cargos') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Cargo</th><th>Tipo</th><th>Descripción</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`} style={{background: editandoId === r.id ? 'var(--bg-subtle)' : 'transparent'}}>
            <td className="mono text-muted">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td><span className={'badge '+(r.tipo==='Operativo'?'badge-cyan':r.tipo==='Ambos'?'badge-purple':'badge-gray')} style={{fontSize:11}}>{r.tipo||'—'}</span></td>
            <td className="text-muted" style={{fontSize:12}}>{r.detalle}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_especialidades') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Especialidad</th><th>Área</th><th>Certif.</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td className="text-muted">{r.area}</td>
            <td>{r.requiere_cert ? <span className="badge badge-orange">Sí</span> : <span className="badge badge-gray">No</span>}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_tipos_servicio') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Nombre</th><th>Clasificación</th><th>Facturable</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td><span className="badge badge-cyan" style={{fontSize:11}}>{r.clasificacion}</span></td>
            <td>{r.facturable ? <span className="badge badge-green">Sí</span> : <span className="badge badge-gray">No</span>}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_almacenes') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong><div className="text-muted" style={{fontSize:11}}>{r.direccion}</div></td>
            <td><span className="badge badge-purple" style={{fontSize:11}}>{r.tipo}</span></td>
            <td className="text-muted">{r.responsable}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_sedes') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Nombre</th><th>Dirección física</th><th>GPS</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono text-muted">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td className="text-muted" style={{fontSize:12}}>{r.direccion || '—'}</td>
            <td><span className="mono" style={{fontSize:11, color:'var(--cyan-dk)', background:'var(--cyan-lt)', padding:'2px 7px', borderRadius:6}}>{r.gps || '—'}</span></td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
          </tr>
        ))}</tbody>
      </table>
    );
    return (
      <table className="tbl">
        <thead><tr><th>Codigo</th><th>Valor</th><th>Detalle</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r, i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td className="text-muted">{r.detalle}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':r.estado==='bloqueado'?'badge-red':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
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
      <div className="maestros-grid">
        {maestrosCatalogos.map(m => (
          <div key={m.id} className="maestro-card hover-raise">
            <div className="maestro-card-icon">{I.settings}</div>
            <div className="maestro-card-main">
              <div className="maestro-card-title">{m.tabla}</div>
              {m.id === 'mst_industrias' && (
                <div className="maestro-card-meta">
                  {industrias.length} valores - Actualizado en tiempo real
                </div>
              )}
            </div>
            <button className="btn btn-secondary btn-sm maestro-card-action" onClick={() => { setSel(m); resetForm(); }}>
              Gestionar {I.chevRight}
            </button>
          </div>
        ))}
      </div>

      <div className="maestros-help">
        <div className="maestros-help-icon">{I.users}</div>
        <div className="maestros-help-copy">
          <div className="maestros-help-title">¿Buscas gestionar personal?</div>
          <div className="maestros-help-text">El personal operativo se administra desde <strong>RRHH Operativo</strong> · El personal administrativo desde <strong>RRHH Administrativo</strong></div>
        </div>
        <div className="maestros-help-actions">
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
            {formError && <div className="alert alert-danger" style={{marginBottom:16}}>{formError}</div>}
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
function RRHHAdmin() {
  const { personalAdmin, vacacionesSolicitudes, licencias, solicitudesRRHH, aprobarVacacion, turnos, cargos = [], sedes = [], areasEmpresa = [], crearAdminPersonalCtx, actualizarAdminPersonalCtx, eliminarAdminPersonalCtx, empresa, addNotificacion } = useApp();
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('ficha');
  const [view, setView] = useState('personal');
  const [panelAlta, setPanelAlta] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [altaSaving, setAltaSaving] = useState(false);
  const [altaError, setAltaError] = useState('');
  const turnosOptions = (turnos || []).filter(t => t.estado !== 'inactivo');
  const defaultTurnoId = turnosOptions[0]?.id || '';
  /*
    { id: 'turno_dia', nombre: 'D\u00eda', hora_entrada: '08:00', hora_salida: '18:00' },
    { id: 'turno_noche', nombre: 'Noche', hora_entrada: '20:00', hora_salida: '06:00' },
  ];
  const turnosOptions = [
    ...turnosBaseRRHH,
    ...(turnos || []).filter(t => {
      const nombre = String(t.nombre || '').toLowerCase();
      return !['turno_dia', 'turno_noche'].includes(t.id) && !['dia', 'día', 'noche'].includes(nombre);
    })
  ];
  const defaultTurnoIdLegacy = turnosOptions[0]?.id || 'turno_dia';
  */
  const formAltaBase = { nombre:'', dni:'', fecha_nacimiento:'', telefono:'', email:'', direccion:'', codigo:'', cargo:'', area:'', sede:'', turno_id:defaultTurnoId, modalidad:'Planilla', fecha_inicio:'', fecha_fin:'', remuneracion:'', dias_vacaciones:'30', estado:'activo' };
  const [formAlta, setFormAlta] = useState(formAltaBase);
  const cargosAdminOptions = cargos
    .filter(c => c.estado !== 'inactivo' && c.tipo !== 'Operativo')
    .map(c => c.nombre)
    .filter(Boolean);
  const sedesOptions = sedes
    .filter(s => s.estado !== 'inactivo')
    .map(s => ({ nombre: s.nombre, detalle: s.direccion || s.detalle || s.gps || '' }))
    .filter(s => s.nombre);
  const areasOptions = areasEmpresa.length
    ? areasEmpresa.filter(a => a.tipo !== 'Operativa').map(a => a.nombre).filter(Boolean)
    : [];
  const todosPersonal = personalAdmin;
  const persona = sel ? todosPersonal.find(p => p.id === sel) : null;

  const cerrarPanelColaborador = () => {
    setPanelAlta(false);
    setEditandoId(null);
    setFormAlta(formAltaBase);
    setAltaError('');
  };
  const abrirNuevoColaborador = () => {
    if (!turnosOptions.length) {
      addNotificacion('Primero crea un turno real en RRHH > Turnos y Horarios.');
      return;
    }
    setEditandoId(null);
    setFormAlta({ ...formAltaBase, turno_id: defaultTurnoId });
    setPanelAlta(true);
  };
  const abrirEditarColaborador = (p) => {
    setEditandoId(p.id);
    setFormAlta({
      ...formAltaBase,
      nombre: p.nombre || '',
      dni: p.dni || p.documento || '',
      fecha_nacimiento: p.fecha_nacimiento || '',
      telefono: p.telefono || '',
      email: p.email || '',
      direccion: p.direccion || '',
      codigo: p.codigo || p.id || '',
      cargo: p.cargo || '',
      area: p.area || '',
      sede: p.sede || '',
      turno_id: turnosOptions.some(t => t.id === p.turno_id) ? p.turno_id : defaultTurnoId,
      modalidad: p.tipo_contrato || 'Planilla',
      fecha_inicio: p.fecha_inicio_contrato || p.fecha_ingreso || '',
      fecha_fin: p.fecha_fin_contrato || '',
      remuneracion: String(p.remuneracion ?? p.sueldo_base ?? ''),
      dias_vacaciones: String(p.dias_vacaciones_total ?? p.dias_vacaciones_disponibles ?? 30),
      estado: p.estado || 'activo',
    });
    setPanelAlta(true);
  };
  const eliminarColaborador = async (p) => {
    if (!window.confirm(`Eliminar a ${p.nombre}? Esta accion se reflejara en la base de datos.`)) return;
    try {
      await eliminarAdminPersonalCtx(p.id);
      if (sel === p.id) setSel(null);
      addNotificacion('Colaborador eliminado.');
    } catch (_) {
      addNotificacion('No se pudo eliminar el colaborador. Revisa permisos o registros relacionados.');
    }
  };

  const guardarColaborador = async (e) => {
    e.preventDefault();
    if (altaSaving) return;
    if (!turnosOptions.some(t => t.id === formAlta.turno_id)) {
      setAltaError('Selecciona un turno real creado en Supabase antes de guardar el colaborador.');
      return;
    }
    setAltaSaving(true);
    setAltaError('');
    const idx = todosPersonal.length + 1;
    const nuevo = {
      id: editandoId || `per_${Date.now()}`, empresa_id: empresa?.id,
      nombre: formAlta.nombre || 'Nuevo colaborador',
      dni: formAlta.dni || '00000000',
      fecha_nacimiento: formAlta.fecha_nacimiento || '',
      telefono: formAlta.telefono || '',
      email: formAlta.email || '',
      direccion: formAlta.direccion || '',
      cargo: formAlta.cargo || 'Por definir',
      area: formAlta.area || 'Sin area',
      supervisor: '', sede: formAlta.sede || '', turno_id: formAlta.turno_id,
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
      fecha_ingreso: formAlta.fecha_inicio || new Date().toISOString().slice(0, 10),
      contacto_emergencia: '', relacion_emergencia: '', telefono_emergencia: '',
      documentos: []
    };
    try {
      if (editandoId) {
        await actualizarAdminPersonalCtx(editandoId, nuevo);
        addNotificacion('Colaborador actualizado.');
      } else {
        await crearAdminPersonalCtx(nuevo);
        addNotificacion('Colaborador creado.');
      }
      cerrarPanelColaborador();
    } catch (err) {
      console.error('Error guardando colaborador administrativo:', err);
      setAltaError(`No se pudo guardar el colaborador en Supabase: ${err?.message || 'error desconocido'}`);
    } finally {
      setAltaSaving(false);
    }
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
            <button className="btn btn-ghost btn-sm" title="Editar colaborador" onClick={() => { abrirEditarColaborador(persona); setSel(null); }}>{I.edit}</button>
            <button className="btn btn-ghost btn-sm" title="Eliminar colaborador" style={{color:'var(--danger)'}} onClick={() => eliminarColaborador(persona)}>{I.trash}</button>
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
                  ['Turno asignado', turnosOptions.find(t => t.id === persona.turno_id) ? `${turnosOptions.find(t => t.id === persona.turno_id).nombre} (${turnosOptions.find(t => t.id === persona.turno_id).hora_entrada} - ${turnosOptions.find(t => t.id === persona.turno_id).hora_salida})` : 'Sin turno asignado'],
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
                  <thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Días</th><th>Motivo</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
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
  const colaboradoresActivos = personalAdmin.filter(p => p.estado === 'activo').length;
  const vacPendientes = vacacionesSolicitudes.filter(v => v.estado === 'pendiente');

  // Vista Reportes — datos calculados
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const porArea = personalAdmin.reduce((acc, p) => { acc[p.area] = (acc[p.area] || 0) + 1; return acc; }, {});
  const maxArea = Math.max(...Object.values(porArea), 1);
  const contratosVencer = personalAdmin
    .filter(p => p.fecha_fin_contrato && p.tipo_contrato !== 'Indefinido')
    .map(p => {
      const fechaFin = new Date(p.fecha_fin_contrato);
      fechaFin.setHours(0, 0, 0, 0);
      return { ...p, dias_restantes: Math.round((fechaFin - hoy) / 86400000) };
    })
    .filter(p => p.dias_restantes >= 0 && p.dias_restantes <= 30)
    .sort((a, b) => a.dias_restantes - b.dias_restantes);
  const vacRanking = [...personalAdmin].sort((a, b) => b.dias_vacaciones_disponibles - a.dias_vacaciones_disponibles);
  const solPend = solicitudesRRHH.filter(s => s.estado === 'pendiente');

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">RRHH Administrativo</h1><div className="page-sub">{colaboradoresActivos} colaboradores activos · Fase 3</div></div>
        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4}}>
          <button className="btn btn-primary" data-local-form="true" onClick={abrirNuevoColaborador} disabled={!turnosOptions.length}>{I.plus} Nuevo colaborador</button>
          {!turnosOptions.length && <span style={{fontSize:11, color:'var(--danger, #e53e3e)'}}>Crea un turno en Turnos y Horarios para habilitar esta opción.</span>}
        </div>
      </div>

      <div className="tabs">
        <div className={'tab '+(view==='personal'?'active':'')} onClick={()=>setView('personal')}>Personal</div>
        <div className={'tab '+(view==='reportes'?'active':'')} onClick={()=>setView('reportes')}>Reportes</div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Colaboradores activos</div><div className="kpi-value">{colaboradoresActivos}</div><div className="kpi-icon cyan">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Contratos por vencer</div><div className="kpi-value" style={{color:'var(--orange)'}}>{contratosVencer.length}</div><div className="kpi-icon orange">{I.alert}</div></div>
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
              <thead><tr><th>Colaborador</th><th>Cargo</th><th>Área</th><th>Sede</th><th>Turno</th><th>Contrato</th><th>Modalidad</th><th>Vacaciones disp.</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
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
                    <td><span className="text-muted" style={{fontSize:12}}>{turnosOptions.find(t => t.id === p.turno_id)?.nombre || 'Sin turno'}</span></td>
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
        <div className="side-panel-backdrop" onClick={cerrarPanelColaborador}/>
        <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">{editandoId ? 'Edicion de personal' : 'Alta de personal'}</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>{editandoId ? 'Editar colaborador administrativo' : 'Nuevo colaborador administrativo'}</div>
            </div>
            <button className="icon-btn" onClick={cerrarPanelColaborador}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardarColaborador}>
            {altaError && <div className="alert alert-danger" style={{marginBottom:16}}>{altaError}</div>}
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
              <div className="input-group"><label>Cargo</label><select className="select" value={formAlta.cargo} onChange={e=>setFormAlta(v=>({...v,cargo:e.target.value}))}><option value="">Seleccionar cargo...</option>{cargosAdminOptions.map(c=><option key={c}>{c}</option>)}</select></div>
              <div className="input-group"><label>Área</label><select className="select" value={formAlta.area} onChange={e=>setFormAlta(v=>({...v,area:e.target.value}))}><option value="">Seleccionar área...</option>{areasOptions.map(a=><option key={a}>{a}</option>)}</select></div>
              <div className="input-group"><label>Sede asignada</label><select className="select" value={formAlta.sede} onChange={e=>setFormAlta(v=>({...v,sede:e.target.value}))}><option value="">Sin sede asignada</option>{sedesOptions.map(s=><option key={s.nombre} value={s.nombre}>{s.nombre}{s.detalle ? ` - ${s.detalle}` : ''}</option>)}</select></div>
              <div className="input-group"><label>Turno asignado *</label><select className="select" required value={formAlta.turno_id} onChange={e=>setFormAlta(v=>({...v,turno_id:e.target.value}))}><option value="">Seleccionar turno...</option>{turnosOptions.map(t=><option key={t.id} value={t.id}>{t.nombre} ({t.hora_entrada} - {t.hora_salida})</option>)}</select>{!turnosOptions.length && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Primero crea un turno en RRHH &gt; Turnos y Horarios.</div>}</div>
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
              <button type="button" className="btn btn-secondary" onClick={cerrarPanelColaborador}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={altaSaving}>{I.save} {altaSaving ? 'Guardando...' : editandoId ? 'Actualizar colaborador' : 'Guardar colaborador'}</button>
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
            <thead><tr><th>Empresa</th><th>Plan</th><th>País</th><th>Usuarios</th><th>Storage</th><th>Último acceso</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
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

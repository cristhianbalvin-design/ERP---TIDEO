import React, { useState, useEffect, useMemo } from 'react';
import { I, money } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { SIDEBAR } from './shell.jsx';
import { getSupabaseClient } from './lib/supabaseClient.js';
import { ROLE_CATEGORIES, HIERARCHY_LEVELS, getPotentialManagers } from './lib/hierarchy.js';
import { PHONE_PATTERN, RUC_PATTERN, sanitizePhone, sanitizeRuc } from './lib/formValidators.js';
import { VARIABLES_COMERCIALES } from './lib/textoComercial.js';
import { maestrosService } from './services/maestrosService.js';

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
  const [nuevoNivel, setNuevoNivel] = useState('operativo');
  const [clonarNombre, setClonarNombre] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategoria, setEditCategoria] = useState('otro');
  const [editNivel, setEditNivel] = useState('operativo');
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
    const newId = await crearRol({ nombre: nuevoNombre.trim(), descripcion: nuevoDesc.trim(), categoria: nuevoCategoria, nivel_jerarquico: nuevoNivel });
    if (newId) setSel(newId);
    setModalNuevo(false);
    setNuevoNombre('');
    setNuevoDesc('');
    setNuevoCategoria('otro');
    setNuevoNivel('operativo');
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
    editarRol(sel, { nombre: editNombre, descripcion: editDesc, categoria: editCategoria, nivel_jerarquico: editNivel });
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
          <button className="btn btn-primary" data-local-form="true" onClick={() => setModalNuevo(true)}>{I.plus} Nuevo rol</button>
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
                  {ROLE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <select className="select" style={{fontSize:12}} value={editNivel} onChange={e=>setEditNivel(e.target.value)}>
                  {HIERARCHY_LEVELS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
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
                  <div className="text-subtle" style={{fontSize:11}}>Nivel: <strong>{role.nivel_jerarquico || 'operativo'}</strong></div>
                  <button className="btn btn-sm btn-secondary" style={{fontSize:11,padding:'2px 8px'}} onClick={()=>{ setEditNombre(role.nombre); setEditDesc(role.descripcion||''); setEditCategoria(role.categoria||'otro'); setEditNivel(role.nivel_jerarquico||'operativo'); setEditingMeta(true); }}>Editar</button>
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
                {ROLE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Nivel jerarquico <span className="text-muted" style={{fontSize:11}}>define alcance: tenant, equipo o propio</span></label>
              <select className="select" value={nuevoNivel} onChange={e=>setNuevoNivel(e.target.value)}>
                {HIERARCHY_LEVELS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
          </div>
          <div className="row" style={{gap:8,marginTop:24,justifyContent:'flex-end'}}>
            <button className="btn btn-secondary" onClick={()=>setModalNuevo(false)}>Cancelar</button>
            <button className="btn btn-primary" data-local-form="true" onClick={handleNuevoRol} disabled={!nuevoNombre.trim()}>Crear rol</button>
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
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', email: '', rol: 'vendedor', jefe_user_id: '', password: '', asignaciones: [], campo: false, campoModulos: [] });
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
  const [editForm, setEditForm] = useState({ nombre: '', email: '', rol: '', jefe_user_id: '', asignaciones: [], campo: false, campoModulos: [], estado: 'Activo' });
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
      setNuevoForm({ nombre: '', email: '', rol: 'vendedor', jefe_user_id: '', password: '', asignaciones: [], campo: false, campoModulos: [] });
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
      jefe_user_id: usuario.jefe_user_id || '',
      asignaciones: (usuario.asignaciones || [])
        .filter(a => !a.principal)
        .map(a => ({
          rol_id: a.rol_id || a.rol,
          jefe_user_id: a.jefe_user_id || '',
          alcance_tipo: a.alcance_tipo || 'tenant',
          alcance_id: a.alcance_id || '',
        })),
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
    if (empresa.es_plataforma) return !r.empresa_id || r.empresa_id === empresa.id;
    return r.empresa_id === empresa.id;
  };
  const rolesOpciones = Object.entries(rolesCtx || {}).filter(([,r]) => !r.es_superadmin && rolPerteneceTenant(r));
  const rolesEditOpciones = Object.entries(rolesCtx || {}).filter(([id, r]) => (
    (!r.es_superadmin && rolPerteneceTenant(r)) || id === editando?.rol
  ));
  const getRoleCategory = (rolId) => rolesCtx?.[rolId]?.categoria || 'otro';
  const getOptionLabel = (items, value) => items.find(x => x.value === value)?.label || value || '-';
  const getRoleMeta = (rolId) => {
    const r = rolesCtx?.[rolId] || MOCK.roles?.[rolId] || {};
    const categoria = r.categoria || 'otro';
    const nivel = r.nivel_jerarquico || 'operativo';
    return {
      categoria,
      nivel,
      categoriaLabel: getOptionLabel(ROLE_CATEGORIES, categoria),
      nivelLabel: getOptionLabel(HIERARCHY_LEVELS, nivel),
    };
  };
  const roleOptionText = (r) => {
    const meta = getRoleMeta(r.id || r.key);
    return `${r.nombre} · ${meta.categoriaLabel} · ${meta.nivelLabel}`;
  };
  const nuevoRoleMeta = getRoleMeta(nuevoForm.rol);
  const editRoleMeta = getRoleMeta(editForm.rol);
  const alcanceOptions = [
    { value: 'tenant', label: 'Todo el tenant' },
    { value: 'area', label: 'Area' },
    { value: 'equipo', label: 'Equipo' },
    { value: 'sede', label: 'Sede' },
    { value: 'proyecto', label: 'Proyecto' },
    { value: 'centro_costo', label: 'Centro de costo' },
    { value: 'custom', label: 'Personalizado' },
  ];
  const crearAsignacionVacia = () => ({
    rol_id: rolesOpciones[0]?.[0] || '',
    jefe_user_id: '',
    alcance_tipo: 'tenant',
    alcance_id: '',
  });
  const actualizarAsignacion = (items, index, patch) => items.map((item, i) => (
    i === index ? { ...item, ...patch } : item
  ));
  const renderAsignacionesAvanzadas = ({ items, setItems, excludeUserId = null }) => (
    <details style={{border:'1px solid var(--border)', borderRadius:8, padding:12}}>
      <summary style={{cursor:'pointer', fontWeight:700, fontSize:13}}>Asignaciones adicionales opcionales</summary>
      <div className="text-muted" style={{fontSize:12, margin:'8px 0 12px'}}>
        Usalo solo si una persona trabaja en mas de un area, proyecto, sede o centro de costo. El rol principal de arriba sigue siendo suficiente para la mayoria de usuarios.
      </div>
      <div className="col" style={{gap:10}}>
        {items.map((asig, index) => {
          const meta = getRoleMeta(asig.rol_id);
          const managers = getPotentialManagers({
            users: usuarios,
            roles: rolesCtx,
            empresaId: empresa?.id,
            excludeUserId,
            category: getRoleCategory(asig.rol_id),
          });
          return (
            <div key={index} style={{border:'1px solid var(--border)', borderRadius:8, padding:10}}>
              <div className="grid-2" style={{gap:10}}>
                <div className="input-group">
                  <label>Rol adicional</label>
                  <select className="input" value={asig.rol_id} onChange={e => setItems(actualizarAsignacion(items, index, { rol_id: e.target.value, jefe_user_id: '' }))}>
                    {rolesOpciones.map(([id, r]) => <option key={id} value={id}>{roleOptionText({ ...r, id })}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Jefe funcional</label>
                  <select className="input" value={asig.jefe_user_id} onChange={e => setItems(actualizarAsignacion(items, index, { jefe_user_id: e.target.value }))}>
                    <option value="">Sin jefe funcional</option>
                    {managers.map(u => <option key={`${u.id}_${u.empresa_id}`} value={u.id}>{u.nombre} · {rolesCtx?.[u.rol]?.nombre || u.rol_nombre || u.rol}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Alcance</label>
                  <select className="input" value={asig.alcance_tipo} onChange={e => setItems(actualizarAsignacion(items, index, { alcance_tipo: e.target.value, alcance_id: e.target.value === 'tenant' ? '' : asig.alcance_id }))}>
                    {alcanceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>ID alcance</label>
                  <input className="input" disabled={asig.alcance_tipo === 'tenant'} value={asig.alcance_id || ''} onChange={e => setItems(actualizarAsignacion(items, index, { alcance_id: e.target.value }))} placeholder={asig.alcance_tipo === 'tenant' ? 'No aplica' : 'Ej: proyecto_001'} />
                </div>
              </div>
              <div className="row" style={{justifyContent:'space-between', marginTop:8}}>
                <div className="row" style={{gap:6, fontSize:12}}>
                  <span className="badge badge-gray">{meta.categoriaLabel}</span>
                  <span className="badge badge-cyan">{meta.nivelLabel}</span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} onClick={() => setItems(items.filter((_, i) => i !== index))}>Quitar</button>
              </div>
            </div>
          );
        })}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItems([...items, crearAsignacionVacia()])}>{I.plus} Agregar asignacion</button>
      </div>
    </details>
  );
  const nuevoJefes = getPotentialManagers({
    users: usuarios,
    roles: rolesCtx,
    empresaId: empresa?.id,
    category: getRoleCategory(nuevoForm.rol),
  });
  const editJefes = getPotentialManagers({
    users: usuarios,
    roles: rolesCtx,
    empresaId: editando?.empresa_id || empresa?.id,
    excludeUserId: editando?.id,
    category: getRoleCategory(editForm.rol),
  });

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
              const jefe = usuarios.find(x => x.id === u.jefe_user_id && x.empresa_id === u.empresa_id);
              const isSuperadminTideo = Boolean(
                r.es_superadmin ||
                u.rol === 'rol_tideo_super' ||
                /superadmin\s+tideo/i.test(String(r.nombre || u.rol_nombre || u.rol || ''))
              );
              return (
                <tr key={`${u.id}_${u.empresa_id}`}>
                  <td><div className="row"><div className="avatar" style={{width:28,height:28,fontSize:11}}>{u.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><strong>{u.nombre}</strong></div></td>
                  <td className="text-muted">{u.email}</td>
                  <td>
                    <span className={'badge badge-'+r.color}>{r.nombre}</span>
                    <div className="text-muted" style={{fontSize:11, marginTop:4}}>Jefe: {jefe?.nombre || 'Sin jefe directo'}</div>
                    {u.asignaciones?.filter?.(a => !a.principal).length > 0 && (
                      <div className="text-muted" style={{fontSize:11}}>+{u.asignaciones.filter(a => !a.principal).length} asignacion(es)</div>
                    )}
                  </td>
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
                  {rolesEditOpciones.map(([id, r]) => <option key={id} value={id}>{roleOptionText({ ...r, id })}</option>)}
                </select>
              </div>
              <div className="row" style={{gap:8, flexWrap:'wrap', fontSize:12}}>
                <span className="badge badge-gray">Categoria: {editRoleMeta.categoriaLabel}</span>
                <span className="badge badge-cyan">Nivel: {editRoleMeta.nivelLabel}</span>
              </div>
              <div className="input-group">
                <label>Jefe directo</label>
                <select className="input" value={editForm.jefe_user_id} onChange={e => setEditForm(p => ({...p, jefe_user_id: e.target.value}))}>
                  <option value="">Sin jefe directo</option>
                  {editJefes.map(u => <option key={`${u.id}_${u.empresa_id}`} value={u.id}>{u.nombre} · {rolesCtx?.[u.rol]?.nombre || u.rol_nombre || u.rol}</option>)}
                </select>
              </div>
              {renderAsignacionesAvanzadas({
                items: editForm.asignaciones,
                excludeUserId: editando?.id,
                setItems: next => setEditForm(p => ({ ...p, asignaciones: next })),
              })}
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
                  {rolesOpciones.map(([id, r]) => <option key={id} value={id}>{roleOptionText({ ...r, id })}</option>)}
                </select>
              </div>
              <div className="row" style={{gap:8, flexWrap:'wrap', fontSize:12}}>
                <span className="badge badge-gray">Categoria: {nuevoRoleMeta.categoriaLabel}</span>
                <span className="badge badge-cyan">Nivel: {nuevoRoleMeta.nivelLabel}</span>
              </div>
              <div className="input-group">
                <label>Jefe directo</label>
                <select className="input" value={nuevoForm.jefe_user_id} onChange={e => setNuevoForm(p => ({...p, jefe_user_id: e.target.value}))}>
                  <option value="">Sin jefe directo</option>
                  {nuevoJefes.map(u => <option key={`${u.id}_${u.empresa_id}`} value={u.id}>{u.nombre} · {rolesCtx?.[u.rol]?.nombre || u.rol_nombre || u.rol}</option>)}
                </select>
              </div>
              {renderAsignacionesAvanzadas({
                items: nuevoForm.asignaciones,
                setItems: next => setNuevoForm(p => ({ ...p, asignaciones: next })),
              })}
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
                <input className="input" inputMode="numeric" pattern={RUC_PATTERN} maxLength={11} value={form.ruc} onChange={e => setForm(f => ({...f, ruc: sanitizeRuc(e.target.value)}))} placeholder="20000000000"/>
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

// ============ CECO / CEBE ============
function CecoCebePanel({ onClose }) {
  const {
    centrosCosto, centrosBeneficio, cuentas, usuarios, empresa, ots,
    crearCentroCosto, actualizarCentroCosto, importarCentrosCosto,
    crearCentroBeneficio, actualizarCentroBeneficio, importarCentrosBeneficio,
    addNotificacion
  } = useApp();

  const [tab, setTab] = useState('ceco');

  const cecoBase = { codigo:'', nombre:'', tipo:'area_funcional', responsable_id:'', cebe_id:'', presupuesto_mensual:'', fecha_inicio:'', fecha_fin:'', descripcion:'', estado:'activo' };
  const [cecoForm, setCecoForm] = useState(cecoBase);
  const [cecoEditId, setCecoEditId] = useState(null);
  const [cecoSaving, setCecoSaving] = useState(false);
  const [cecoError, setCecoError] = useState('');
  const [cecoFiltroTipo, setCecoFiltroTipo] = useState('');
  const [cecoFiltroCebe, setCecoFiltroCebe] = useState('');
  const [cecoFiltroEstado, setCecoFiltroEstado] = useState('activo');
  const [cecoModalImport, setCecoModalImport] = useState(false);
  const [cecoImportRows, setCecoImportRows] = useState([]);
  const [cecoImportStep, setCecoImportStep] = useState(1);

  const cebeBase = { codigo:'', nombre:'', tipo:'linea_servicio', responsable_id:'', cuenta_id:'', meta_ingresos:'', fecha_inicio:'', fecha_fin:'', descripcion:'', estado:'activo' };
  const [cebeForm, setCebeForm] = useState(cebeBase);
  const [cebeEditId, setCebeEditId] = useState(null);
  const [cebeSaving, setCebeSaving] = useState(false);
  const [cebeError, setCebeError] = useState('');
  const [cebeFiltroTipo, setCebeFiltroTipo] = useState('');
  const [cebeFiltroEstado, setCebeFiltroEstado] = useState('activo');
  const [cebeModalImport, setCebeModalImport] = useState(false);
  const [cebeImportRows, setCebeImportRows] = useState([]);
  const [cebeImportStep, setCebeImportStep] = useState(1);

  const usuariosActivos = (usuarios || []).filter(u => u.estado !== 'inactivo');
  const cebesActivos = (centrosBeneficio || []).filter(c => c.estado === 'activo');
  const estadosOtCerrados = new Set(['cerrada', 'cerrado', 'cerrada_tecnica', 'cerrado_tecnico', 'valorizada', 'valorizado', 'facturada', 'facturado', 'anulada', 'anulado', 'cancelada', 'cancelado']);
  const otsActivasPorCeco = cecoId => (ots || []).filter(o => o.centro_costo_id === cecoId && !estadosOtCerrados.has(String(o.estado || '').toLowerCase()));
  const confirmarInactivacionCeco = ceco => {
    const otsActivas = otsActivasPorCeco(ceco.id);
    if (!otsActivas.length) return window.confirm(`¿Inactivar "${ceco.nombre}"?`);
    const muestra = otsActivas.slice(0, 5).map(o => o.numero || o.id).join(', ');
    const extra = otsActivas.length > 5 ? ` y ${otsActivas.length - 5} mas` : '';
    return window.confirm(`El CECO "${ceco.nombre}" tiene ${otsActivas.length} OT(s) activa(s) vinculada(s): ${muestra}${extra}.\n\nSi lo inactivas, no aparecera para nuevas asignaciones, pero las OTs existentes conservaran la vinculacion. ¿Deseas continuar?`);
  };
  const inactivarCeco = async ceco => {
    if (!confirmarInactivacionCeco(ceco)) return;
    await actualizarCentroCosto(ceco.id, { ...ceco, estado: 'inactivo' });
    addNotificacion?.('CECO inactivado.');
  };

  const CECO_TIPOS = ['area_funcional','proyecto','sede','temporal'];
  const CEBE_TIPOS = ['linea_servicio','cliente','proyecto','producto','temporal'];
  const labelTipo = t => ({ area_funcional:'Área funcional', proyecto:'Proyecto', sede:'Sede', temporal:'Temporal', linea_servicio:'Línea de servicio', cliente:'Cliente', producto:'Producto', temporal:'Temporal' }[t] || t);

  // ---- CECO ----
  const resetCecoForm = () => { setCecoForm(cecoBase); setCecoEditId(null); setCecoError(''); };
  const editarCeco = c => {
    setCecoForm({ codigo:c.codigo||'', nombre:c.nombre||'', tipo:c.tipo||'area_funcional', responsable_id:c.responsable_id||'', cebe_id:c.cebe_id||'', presupuesto_mensual:c.presupuesto_mensual||'', fecha_inicio:c.fecha_inicio||'', fecha_fin:c.fecha_fin||'', descripcion:c.descripcion||'', estado:c.estado||'activo' });
    setCecoEditId(c.id); setCecoError('');
  };
  const guardarCeco = async e => {
    e.preventDefault();
    if (!cecoForm.codigo.trim()) return setCecoError('El código del CECO es obligatorio.');
    if (!cecoForm.nombre.trim()) return setCecoError('El nombre es obligatorio.');
    if (!cecoForm.cebe_id) return setCecoError('El CEBE padre es obligatorio.');
    if ((centrosCosto||[]).some(c => c.codigo === cecoForm.codigo.trim() && c.id !== cecoEditId)) return setCecoError('Este código ya está en uso. Elige uno diferente.');
    const cecoActual = (centrosCosto || []).find(c => c.id === cecoEditId);
    if (cecoEditId && cecoActual?.estado !== 'inactivo' && cecoForm.estado === 'inactivo' && !confirmarInactivacionCeco(cecoActual)) return;
    setCecoSaving(true); setCecoError('');
    try {
      const resp = usuariosActivos.find(u => u.id === cecoForm.responsable_id);
      const datos = { ...cecoForm, responsable_nombre: resp?.nombre || '', fecha_inicio: cecoForm.fecha_inicio || null, fecha_fin: cecoForm.fecha_fin || null, presupuesto_mensual: cecoForm.presupuesto_mensual !== '' ? cecoForm.presupuesto_mensual : null, cebe_id: cecoForm.cebe_id || null };
      if (cecoEditId) await actualizarCentroCosto(cecoEditId, datos);
      else await crearCentroCosto(datos);
      addNotificacion?.(`CECO ${cecoEditId ? 'actualizado' : 'creado'} correctamente.`);
      resetCecoForm();
    } catch (err) { setCecoError(err?.message || 'No se pudo guardar el CECO.'); }
    finally { setCecoSaving(false); }
  };
  const cecosFiltrados = (centrosCosto||[]).filter(c =>
    (!cecoFiltroTipo || c.tipo === cecoFiltroTipo) &&
    (!cecoFiltroCebe || c.cebe_id === cecoFiltroCebe) &&
    (!cecoFiltroEstado || c.estado === cecoFiltroEstado)
  );

  // ---- CEBE ----
  const resetCebeForm = () => { setCebeForm(cebeBase); setCebeEditId(null); setCebeError(''); };
  const editarCebe = c => {
    setCebeForm({ codigo:c.codigo||'', nombre:c.nombre||'', tipo:c.tipo||'linea_servicio', responsable_id:c.responsable_id||'', cuenta_id:c.cuenta_id||'', meta_ingresos:c.meta_ingresos||'', fecha_inicio:c.fecha_inicio||'', fecha_fin:c.fecha_fin||'', descripcion:c.descripcion||'', estado:c.estado||'activo' });
    setCebeEditId(c.id); setCebeError('');
  };
  const guardarCebe = async e => {
    e.preventDefault();
    if (!cebeForm.codigo.trim()) return setCebeError('El código del CEBE es obligatorio.');
    if (!cebeForm.nombre.trim()) return setCebeError('El nombre es obligatorio.');
    if ((centrosBeneficio||[]).some(c => c.codigo === cebeForm.codigo.trim() && c.id !== cebeEditId)) return setCebeError('Este código ya está en uso. Elige uno diferente.');
    setCebeSaving(true); setCebeError('');
    try {
      const resp = usuariosActivos.find(u => u.id === cebeForm.responsable_id);
      const datos = { ...cebeForm, responsable_nombre: resp?.nombre || '', fecha_inicio: cebeForm.fecha_inicio || null, fecha_fin: cebeForm.fecha_fin || null, meta_ingresos: cebeForm.meta_ingresos !== '' ? cebeForm.meta_ingresos : null, cuenta_id: cebeForm.cuenta_id || null };
      if (cebeEditId) await actualizarCentroBeneficio(cebeEditId, datos);
      else await crearCentroBeneficio(datos);
      addNotificacion?.(`CEBE ${cebeEditId ? 'actualizado' : 'creado'} correctamente.`);
      resetCebeForm();
    } catch (err) { setCebeError(err?.message || 'No se pudo guardar el CEBE.'); }
    finally { setCebeSaving(false); }
  };
  const cebesFiltrados = (centrosBeneficio||[]).filter(c =>
    (!cebeFiltroTipo || c.tipo === cebeFiltroTipo) &&
    (!cebeFiltroEstado || c.estado === cebeFiltroEstado)
  );

  // ---- Import/Export ----
  const parseCsvLine = line => {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        vals.push(cur.trim().replace(/\r/g,''));
        cur = '';
      } else { cur += ch; }
    }
    vals.push(cur.trim().replace(/\r/g,''));
    return vals;
  };
  const parseCsv = text => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map(h => h.replace(/\r/g,''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = parseCsvLine(line);
      const row = {};
      headers.forEach((h,i) => row[h] = vals[i]||'');
      return row;
    });
  };
  const normEstado = v => (v||'').trim().toLowerCase();
  const tipoKeyMap = { 'área funcional':'area_funcional', 'area funcional':'area_funcional', 'proyecto':'proyecto', 'sede':'sede', 'temporal':'temporal', 'línea de servicio':'linea_servicio', 'linea de servicio':'linea_servicio', 'cliente':'cliente', 'producto':'producto' };
  const normTipo = v => tipoKeyMap[(v||'').trim().toLowerCase()] || (v||'').trim().toLowerCase();
  const findCebe = val => {
    if (!val) return null;
    const v = val.trim();
    return (centrosBeneficio||[]).find(b =>
      b.nombre === v ||
      b.codigo === v ||
      `${b.codigo} - ${b.nombre}` === v ||
      v.includes(b.nombre) ||
      v.includes(b.codigo)
    ) || null;
  };
  const validarCecoImport = rows => rows.map(r => {
    const errores = [];
    const estadoNorm = normEstado(r.estado);
    if (!r.codigo) errores.push('Código vacío');
    else if ((centrosCosto||[]).some(c=>c.codigo===r.codigo) || rows.filter(x=>x!==r).some(x=>x.codigo===r.codigo)) errores.push('Código duplicado');
    if (!r.nombre) errores.push('Nombre vacío');
    if (!r.tipo) errores.push('Tipo vacío');
    if (r.cebe_padre && !findCebe(r.cebe_padre)) errores.push(`CEBE "${r.cebe_padre}" no encontrado`);
    if (r.estado && !['activo','inactivo'].includes(estadoNorm)) errores.push('Estado inválido (usa "activo" o "inactivo")');
    const cebe = findCebe(r.cebe_padre);
    const resp = usuariosActivos.find(u=>u.nombre===r.responsable);
    return { ...r, tipo: normTipo(r.tipo), estado: estadoNorm || 'activo', cebe_id: cebe?.id || null, responsable_id: resp?.id || null, responsable_nombre: r.responsable || '', fecha_inicio: r.fecha_inicio || null, fecha_fin: r.fecha_fin || null, presupuesto_mensual: r.presupuesto_mensual || null, _errores: errores };
  });
  const validarCebeImport = rows => rows.map(r => {
    const errores = [];
    const estadoNorm = normEstado(r.estado);
    if (!r.codigo) errores.push('Código vacío');
    else if ((centrosBeneficio||[]).some(c=>c.codigo===r.codigo) || rows.filter(x=>x!==r).some(x=>x.codigo===r.codigo)) errores.push('Código duplicado');
    if (!r.nombre) errores.push('Nombre vacío');
    if (!r.tipo) errores.push('Tipo vacío');
    if (r.estado && !['activo','inactivo'].includes(estadoNorm)) errores.push('Estado inválido (usa "activo" o "inactivo")');
    const resp = usuariosActivos.find(u=>u.nombre===r.responsable);
    return { ...r, tipo: normTipo(r.tipo), estado: estadoNorm || 'activo', responsable_id: resp?.id || null, responsable_nombre: r.responsable || '', fecha_inicio: r.fecha_inicio || null, fecha_fin: r.fecha_fin || null, meta_ingresos: r.meta_ingresos || null, cuenta_id: r.cuenta_id || null, _errores: errores };
  });
  const exportCsv = (data, headers, filename) => {
    const rows = [headers.join(','), ...data.map(r => headers.map(h=>`"${r[h]??''}"` ).join(','))];
    const blob = new Blob([rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose}/>
      <div className="side-panel" style={{ width:'min(960px, 98vw)' }}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Gestión de catálogo</div>
            <div className="font-display" style={{ fontSize:22, fontWeight:700, marginTop:2 }}>Centros de Costo y Beneficio</div>
            <div className="text-muted" style={{ fontSize:12, marginTop:4 }}>{(centrosCosto||[]).length} CECOs · {(centrosBeneficio||[]).length} CEBEs · empresa actual</div>
          </div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>

        <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)', padding:'0 24px' }}>
          {[['ceco','CECO — Centros de Costo'],['cebe','CEBE — Centros de Beneficio']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding:'10px 20px', background:'none', border:'none', borderBottom: tab===id ? '2px solid var(--cyan)' : '2px solid transparent', color: tab===id ? 'var(--cyan)' : 'var(--fg-muted)', fontWeight: tab===id ? 700 : 400, fontSize:13, cursor:'pointer', marginBottom:-1 }}>{label}</button>
          ))}
        </div>

        <div className="side-panel-body">

          {/* ===== TAB CECO ===== */}
          {tab === 'ceco' && (<>
            <div className="row" style={{ gap:10, marginBottom:18 }}>
              <button className="btn btn-secondary" onClick={() => { setCecoModalImport(true); setCecoImportRows([]); setCecoImportStep(1); }}>{I.download} Importar Excel</button>
              <button className="btn btn-secondary" onClick={() => { const data = (centrosCosto||[]).map(c => ({ ...c, cebe_padre: (centrosBeneficio||[]).find(b=>b.id===c.cebe_id)?.nombre || '', responsable: c.responsable_nombre || '' })); exportCsv(data, ['codigo','nombre','tipo','responsable','cebe_padre','presupuesto_mensual','fecha_inicio','fecha_fin','descripcion','estado'], 'cecos.csv'); }}>{I.download} Exportar Excel</button>
              <span className="badge badge-cyan">Validación de duplicados activa</span>
            </div>

            <div className="card" style={{ marginBottom:16, padding:20 }}>
              <div style={{ fontWeight:600, fontSize:13, color:'var(--cyan)', marginBottom:14 }}>{cecoEditId ? 'Editar CECO' : 'Nuevo CECO'}</div>
              {cecoError && <div className="alert alert-danger" style={{ marginBottom:12, fontSize:13 }}>{cecoError}</div>}
              <form onSubmit={guardarCeco}>
                <div className="grid-2" style={{ gap:12, marginBottom:12 }}>
                  <div className="input-group">
                    <label>Código * <span style={{ fontSize:11, fontWeight:400, color:'var(--fg-subtle)' }}>· Lo define la empresa</span></label>
                    <input className="input" value={cecoForm.codigo} onChange={e=>setCecoForm(p=>({...p,codigo:e.target.value}))} placeholder="Ej: CC-OPS-01" disabled={!!cecoEditId}/>
                  </div>
                  <div className="input-group">
                    <label>Nombre *</label>
                    <input className="input" value={cecoForm.nombre} onChange={e=>setCecoForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Operaciones Lima"/>
                  </div>
                  <div className="input-group">
                    <label>Tipo *</label>
                    <select className="select" value={cecoForm.tipo} onChange={e=>setCecoForm(p=>({...p,tipo:e.target.value}))}>
                      {CECO_TIPOS.map(t=><option key={t} value={t}>{labelTipo(t)}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Responsable</label>
                    <select className="select" value={cecoForm.responsable_id} onChange={e=>setCecoForm(p=>({...p,responsable_id:e.target.value}))}>
                      <option value="">— Seleccionar —</option>
                      {usuariosActivos.map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>CEBE padre *</label>
                    <select className="select" value={cecoForm.cebe_id} onChange={e=>setCecoForm(p=>({...p,cebe_id:e.target.value}))}>
                      <option value="">— Seleccionar CEBE —</option>
                      {cebesActivos.map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Presupuesto mensual</label>
                    <input className="input" type="number" min="0" value={cecoForm.presupuesto_mensual} onChange={e=>setCecoForm(p=>({...p,presupuesto_mensual:e.target.value}))} placeholder="0.00"/>
                  </div>
                  {['proyecto','temporal'].includes(cecoForm.tipo) && <>
                    <div className="input-group">
                      <label>Fecha inicio</label>
                      <input className="input" type="date" value={cecoForm.fecha_inicio} onChange={e=>setCecoForm(p=>({...p,fecha_inicio:e.target.value}))}/>
                    </div>
                    <div className="input-group">
                      <label>Fecha fin</label>
                      <input className="input" type="date" value={cecoForm.fecha_fin} onChange={e=>setCecoForm(p=>({...p,fecha_fin:e.target.value}))}/>
                    </div>
                  </>}
                  <div className="input-group" style={{ gridColumn:'1/-1' }}>
                    <label>Descripción</label>
                    <input className="input" value={cecoForm.descripcion} onChange={e=>setCecoForm(p=>({...p,descripcion:e.target.value}))} placeholder="Opcional"/>
                  </div>
                  <div className="input-group">
                    <label>Estado *</label>
                    <select className="select" value={cecoForm.estado} onChange={e=>setCecoForm(p=>({...p,estado:e.target.value}))}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
                <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                  {cecoEditId && <button type="button" className="btn btn-secondary" onClick={resetCecoForm}>Cancelar</button>}
                  <button className="btn btn-primary" type="submit" disabled={cecoSaving}>{cecoSaving ? 'Guardando...' : cecoEditId ? 'Actualizar CECO' : '+ Agregar CECO'}</button>
                </div>
              </form>
            </div>

            <div className="row" style={{ gap:10, marginBottom:12, flexWrap:'wrap' }}>
              <select className="select" style={{ width:'auto', fontSize:12 }} value={cecoFiltroTipo} onChange={e=>setCecoFiltroTipo(e.target.value)}>
                <option value="">Todos los tipos</option>
                {CECO_TIPOS.map(t=><option key={t} value={t}>{labelTipo(t)}</option>)}
              </select>
              <select className="select" style={{ width:'auto', fontSize:12 }} value={cecoFiltroCebe} onChange={e=>setCecoFiltroCebe(e.target.value)}>
                <option value="">Todos los CEBEs</option>
                {(centrosBeneficio||[]).map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </select>
              <select className="select" style={{ width:'auto', fontSize:12 }} value={cecoFiltroEstado} onChange={e=>setCecoFiltroEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
              <span className="text-muted" style={{ fontSize:12, marginLeft:'auto' }}>{cecosFiltrados.length} registros</span>
            </div>

            <div className="card">
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>CEBE padre</th><th>Responsable</th><th>Presupuesto</th><th>Estado</th><th style={{ textAlign:'right' }}>Acciones</th></tr></thead>
                  <tbody>
                    {cecosFiltrados.length === 0
                      ? <tr><td colSpan="8" className="text-center text-muted" style={{ padding:'32px 0' }}>No hay CECOs con los filtros seleccionados.</td></tr>
                      : cecosFiltrados.map(c => {
                          const cebePadre = (centrosBeneficio||[]).find(b=>b.id===c.cebe_id);
                          const resp = usuariosActivos.find(u=>u.id===c.responsable_id);
                          return (
                            <tr key={c.id}>
                              <td className="mono">{c.codigo}</td>
                              <td style={{ fontWeight:500 }}>{c.nombre}</td>
                              <td><span className="badge badge-purple" style={{ fontSize:11 }}>{labelTipo(c.tipo)}</span></td>
                              <td className="text-muted" style={{ fontSize:12 }}>{cebePadre ? `${cebePadre.codigo} — ${cebePadre.nombre}` : '—'}</td>
                              <td className="text-muted" style={{ fontSize:12 }}>{resp?.nombre || c.responsable_nombre || '—'}</td>
                              <td className="mono text-muted" style={{ fontSize:12 }}>{c.presupuesto_mensual ? `S/ ${Number(c.presupuesto_mensual).toLocaleString('es-PE')}` : '—'}</td>
                              <td><span className={`badge ${c.estado==='activo'?'badge-green':'badge-gray'}`}>{c.estado}</span></td>
                              <td>
                                <div className="row" style={{ justifyContent:'flex-end', gap:4 }}>
                                  <button className="icon-btn" title="Editar" onClick={()=>editarCeco(c)} style={{ color:'var(--cyan)' }}>{I.edit}</button>
                                  <button className="icon-btn" title="Inactivar" onClick={() => inactivarCeco(c)} style={{ color:'var(--fg-muted)' }}>{I.trash}</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </>)}

          {/* ===== TAB CEBE ===== */}
          {tab === 'cebe' && (<>
            <div className="row" style={{ gap:10, marginBottom:18 }}>
              <button className="btn btn-secondary" onClick={() => { setCebeModalImport(true); setCebeImportRows([]); setCebeImportStep(1); }}>{I.download} Importar Excel</button>
              <button className="btn btn-secondary" onClick={() => exportCsv(centrosBeneficio||[], ['codigo','nombre','tipo','responsable_nombre','meta_ingresos','fecha_inicio','fecha_fin','descripcion','estado'], 'cebes.csv')}>{I.download} Exportar Excel</button>
              <span className="badge badge-cyan">Validación de duplicados activa</span>
            </div>

            <div className="card" style={{ marginBottom:16, padding:20 }}>
              <div style={{ fontWeight:600, fontSize:13, color:'var(--cyan)', marginBottom:14 }}>{cebeEditId ? 'Editar CEBE' : 'Nuevo CEBE'}</div>
              {cebeError && <div className="alert alert-danger" style={{ marginBottom:12, fontSize:13 }}>{cebeError}</div>}
              <form onSubmit={guardarCebe}>
                <div className="grid-2" style={{ gap:12, marginBottom:12 }}>
                  <div className="input-group">
                    <label>Código * <span style={{ fontSize:11, fontWeight:400, color:'var(--fg-subtle)' }}>· Lo define la empresa</span></label>
                    <input className="input" value={cebeForm.codigo} onChange={e=>setCebeForm(p=>({...p,codigo:e.target.value}))} placeholder="Ej: CEBE-001" disabled={!!cebeEditId}/>
                  </div>
                  <div className="input-group">
                    <label>Nombre *</label>
                    <input className="input" value={cebeForm.nombre} onChange={e=>setCebeForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: TIDEO Consulting"/>
                  </div>
                  <div className="input-group">
                    <label>Tipo *</label>
                    <select className="select" value={cebeForm.tipo} onChange={e=>setCebeForm(p=>({...p,tipo:e.target.value}))}>
                      {CEBE_TIPOS.map(t=><option key={t} value={t}>{labelTipo(t)}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Responsable</label>
                    <select className="select" value={cebeForm.responsable_id} onChange={e=>setCebeForm(p=>({...p,responsable_id:e.target.value}))}>
                      <option value="">— Seleccionar —</option>
                      {usuariosActivos.map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </div>
                  {cebeForm.tipo === 'cliente' && (
                    <div className="input-group">
                      <label>Cliente vinculado</label>
                      <select className="select" value={cebeForm.cuenta_id} onChange={e=>setCebeForm(p=>({...p,cuenta_id:e.target.value}))}>
                        <option value="">— Seleccionar cliente —</option>
                        {(cuentas||[]).filter(c=>c.estado!=='inactivo').map(c=><option key={c.id} value={c.id}>{c.razon_social||c.nombre}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="input-group">
                    <label>Meta de ingresos</label>
                    <input className="input" type="number" min="0" value={cebeForm.meta_ingresos} onChange={e=>setCebeForm(p=>({...p,meta_ingresos:e.target.value}))} placeholder="0.00"/>
                  </div>
                  <div className="input-group">
                    <label>Fecha inicio</label>
                    <input className="input" type="date" value={cebeForm.fecha_inicio} onChange={e=>setCebeForm(p=>({...p,fecha_inicio:e.target.value}))}/>
                  </div>
                  <div className="input-group">
                    <label>Fecha fin</label>
                    <input className="input" type="date" value={cebeForm.fecha_fin} onChange={e=>setCebeForm(p=>({...p,fecha_fin:e.target.value}))}/>
                  </div>
                  <div className="input-group" style={{ gridColumn:'1/-1' }}>
                    <label>Descripción</label>
                    <input className="input" value={cebeForm.descripcion} onChange={e=>setCebeForm(p=>({...p,descripcion:e.target.value}))} placeholder="Opcional"/>
                  </div>
                  <div className="input-group">
                    <label>Estado *</label>
                    <select className="select" value={cebeForm.estado} onChange={e=>setCebeForm(p=>({...p,estado:e.target.value}))}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
                <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                  {cebeEditId && <button type="button" className="btn btn-secondary" onClick={resetCebeForm}>Cancelar</button>}
                  <button className="btn btn-primary" type="submit" disabled={cebeSaving}>{cebeSaving ? 'Guardando...' : cebeEditId ? 'Actualizar CEBE' : '+ Agregar CEBE'}</button>
                </div>
              </form>
            </div>

            <div className="row" style={{ gap:10, marginBottom:12, flexWrap:'wrap' }}>
              <select className="select" style={{ width:'auto', fontSize:12 }} value={cebeFiltroTipo} onChange={e=>setCebeFiltroTipo(e.target.value)}>
                <option value="">Todos los tipos</option>
                {CEBE_TIPOS.map(t=><option key={t} value={t}>{labelTipo(t)}</option>)}
              </select>
              <select className="select" style={{ width:'auto', fontSize:12 }} value={cebeFiltroEstado} onChange={e=>setCebeFiltroEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
              <span className="text-muted" style={{ fontSize:12, marginLeft:'auto' }}>{cebesFiltrados.length} registros</span>
            </div>

            <div className="card">
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Responsable</th><th>Meta ingresos</th><th>CECOs</th><th>Estado</th><th style={{ textAlign:'right' }}>Acciones</th></tr></thead>
                  <tbody>
                    {cebesFiltrados.length === 0
                      ? <tr><td colSpan="8" className="text-center text-muted" style={{ padding:'32px 0' }}>No hay CEBEs con los filtros seleccionados.</td></tr>
                      : cebesFiltrados.map(c => {
                          const resp = usuariosActivos.find(u=>u.id===c.responsable_id);
                          const cecosCount = (centrosCosto||[]).filter(cc=>cc.cebe_id===c.id).length;
                          return (
                            <tr key={c.id}>
                              <td className="mono">{c.codigo}</td>
                              <td style={{ fontWeight:500 }}>{c.nombre}</td>
                              <td><span className="badge badge-cyan" style={{ fontSize:11 }}>{labelTipo(c.tipo)}</span></td>
                              <td className="text-muted" style={{ fontSize:12 }}>{resp?.nombre || c.responsable_nombre || '—'}</td>
                              <td className="mono text-muted" style={{ fontSize:12 }}>{c.meta_ingresos ? `S/ ${Number(c.meta_ingresos).toLocaleString('es-PE')}` : '—'}</td>
                              <td><span className="badge badge-gray" style={{ fontSize:11 }}>{cecosCount} CECOs</span></td>
                              <td><span className={`badge ${c.estado==='activo'?'badge-green':'badge-gray'}`}>{c.estado}</span></td>
                              <td>
                                <div className="row" style={{ justifyContent:'flex-end', gap:4 }}>
                                  <button className="icon-btn" title="Editar" onClick={()=>editarCebe(c)} style={{ color:'var(--cyan)' }}>{I.edit}</button>
                                  <button className="icon-btn" title="Inactivar" onClick={async()=>{ if(window.confirm(`¿Inactivar "${c.nombre}"?`)) { await actualizarCentroBeneficio(c.id,{...c,estado:'inactivo'}); addNotificacion?.('CEBE inactivado.'); }}} style={{ color:'var(--fg-muted)' }}>{I.trash}</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </>)}

        </div>

        {/* Modal importar CECO */}
        {cecoModalImport && (
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth:720, width:'96vw' }}>
              <div className="modal-head">
                <h2>Importar CECOs — Paso {cecoImportStep} de 3</h2>
                <button className="icon-btn" onClick={()=>setCecoModalImport(false)}>{I.x}</button>
              </div>
              <div className="modal-body">
                {cecoImportStep === 1 && (
                  <div>
                    <p className="text-muted" style={{ marginBottom:12, fontSize:13 }}>Sube un CSV con columnas: <code>codigo, nombre, tipo, responsable, cebe_padre, presupuesto_mensual, estado</code></p>
                    <input type="file" accept=".csv" onChange={e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>{ setCecoImportRows(validarCecoImport(parseCsv(ev.target.result))); setCecoImportStep(2); }; r.readAsText(f); }}/>
                  </div>
                )}
                {cecoImportStep === 2 && (
                  <div>
                    <p style={{ marginBottom:12, fontSize:13 }}><strong>{cecoImportRows.length} filas</strong> · {cecoImportRows.filter(r=>r._errores.length===0).length} válidas · {cecoImportRows.filter(r=>r._errores.length>0).length} con errores</p>
                    <div style={{ maxHeight:280, overflow:'auto' }}>
                      <table className="tbl">
                        <thead><tr><th>Fila</th><th>Código</th><th>Nombre</th><th>Estado</th><th>Errores</th></tr></thead>
                        <tbody>{cecoImportRows.map((r,i)=>(
                          <tr key={i} style={{ background: r._errores.length>0 ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                            <td className="mono text-muted">{i+2}</td><td className="mono">{r.codigo}</td><td>{r.nombre}</td>
                            <td>{r._errores.length===0 ? <span className="badge badge-green">OK</span> : <span className="badge badge-red">Error</span>}</td>
                            <td style={{ fontSize:11, color:'var(--danger)' }}>{r._errores.join(' · ')}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div style={{ display:'flex', gap:10, marginTop:16 }}>
                      <button className="btn btn-secondary" onClick={()=>setCecoImportStep(1)}>← Volver</button>
                      <button className="btn btn-primary" disabled={!cecoImportRows.some(r=>r._errores.length===0)} onClick={()=>setCecoImportStep(3)}>Confirmar importación →</button>
                    </div>
                  </div>
                )}
                {cecoImportStep === 3 && (
                  <div>
                    <p style={{ marginBottom:16, fontSize:13 }}>Se importarán <strong>{cecoImportRows.filter(r=>r._errores.length===0).length} CECOs</strong>. Los {cecoImportRows.filter(r=>r._errores.length>0).length} con errores serán ignorados.</p>
                    <button className="btn btn-primary" onClick={async e => {
                      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Importando...';
                      try {
                        const v = cecoImportRows.filter(r=>r._errores.length===0).map(({_errores,...r})=>r);
                        await importarCentrosCosto(v);
                        addNotificacion?.(`${v.length} CECOs importados correctamente.`);
                        setCecoModalImport(false);
                      } catch(err) {
                        btn.disabled = false; btn.textContent = 'Reintentar';
                        setCecoError(err?.message || 'Error al importar CECOs.');
                        setCecoImportStep(1);
                        setCecoModalImport(false);
                      }
                    }}>Importar {cecoImportRows.filter(r=>r._errores.length===0).length} CECOs</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal importar CEBE */}
        {cebeModalImport && (
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth:720, width:'96vw' }}>
              <div className="modal-head">
                <h2>Importar CEBEs — Paso {cebeImportStep} de 3</h2>
                <button className="icon-btn" onClick={()=>setCebeModalImport(false)}>{I.x}</button>
              </div>
              <div className="modal-body">
                {cebeImportStep === 1 && (
                  <div>
                    <p className="text-muted" style={{ marginBottom:12, fontSize:13 }}>Sube un CSV con columnas: <code>codigo, nombre, tipo, responsable_nombre, meta_ingresos, estado</code></p>
                    <input type="file" accept=".csv" onChange={e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>{ setCebeImportRows(validarCebeImport(parseCsv(ev.target.result))); setCebeImportStep(2); }; r.readAsText(f); }}/>
                  </div>
                )}
                {cebeImportStep === 2 && (
                  <div>
                    <p style={{ marginBottom:12, fontSize:13 }}><strong>{cebeImportRows.length} filas</strong> · {cebeImportRows.filter(r=>r._errores.length===0).length} válidas · {cebeImportRows.filter(r=>r._errores.length>0).length} con errores</p>
                    <div style={{ maxHeight:280, overflow:'auto' }}>
                      <table className="tbl">
                        <thead><tr><th>Fila</th><th>Código</th><th>Nombre</th><th>Estado</th><th>Errores</th></tr></thead>
                        <tbody>{cebeImportRows.map((r,i)=>(
                          <tr key={i} style={{ background: r._errores.length>0 ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                            <td className="mono text-muted">{i+2}</td><td className="mono">{r.codigo}</td><td>{r.nombre}</td>
                            <td>{r._errores.length===0 ? <span className="badge badge-green">OK</span> : <span className="badge badge-red">Error</span>}</td>
                            <td style={{ fontSize:11, color:'var(--danger)' }}>{r._errores.join(' · ')}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div style={{ display:'flex', gap:10, marginTop:16 }}>
                      <button className="btn btn-secondary" onClick={()=>setCebeImportStep(1)}>← Volver</button>
                      <button className="btn btn-primary" disabled={!cebeImportRows.some(r=>r._errores.length===0)} onClick={()=>setCebeImportStep(3)}>Confirmar importación →</button>
                    </div>
                  </div>
                )}
                {cebeImportStep === 3 && (
                  <div>
                    <p style={{ marginBottom:16, fontSize:13 }}>Se importarán <strong>{cebeImportRows.filter(r=>r._errores.length===0).length} CEBEs</strong>. Los {cebeImportRows.filter(r=>r._errores.length>0).length} con errores serán ignorados.</p>
                    <button className="btn btn-primary" onClick={async()=>{ const v=cebeImportRows.filter(r=>r._errores.length===0).map(({_errores,...r})=>({...r,estado:r.estado||'activo'})); await importarCentrosBeneficio(v); addNotificacion?.(`${v.length} CEBEs importados.`); setCebeModalImport(false); }}>Importar {cebeImportRows.filter(r=>r._errores.length===0).length} CEBEs</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

// ============ CONFIGURACIÓN Y MAESTROS ============
function Maestros() {
  const {
    navigate, cuentas, proveedores, personalAdmin = [], personalOperativo = [],
    areasEmpresa, cargos, especialidades, tiposServicio, almacenes, sedes, industrias,
    monedasImpuestosUnidades = [],
    crearArea, actualizarArea, eliminarArea,
    crearCargo, actualizarCargo, eliminarCargo,
    crearEspecialidad, actualizarEspecialidad, eliminarEspecialidad,
    crearTipoServicio, actualizarTipoServicio, eliminarTipoServicio,
    crearAlmacen, actualizarAlmacen, eliminarAlmacen,
    crearSede, actualizarSede, eliminarSede,
    crearIndustria, actualizarIndustria, eliminarIndustria,
    crearMonedaImpuestoUnidad, actualizarMonedaImpuestoUnidad, eliminarMonedaImpuestoUnidad,
    addNotificacion
  } = useApp();
  const { centrosCosto, centrosBeneficio } = useApp();
  const [sel, setSel] = useState(null);
  const [showCecoCebe, setShowCecoCebe] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const formRef = React.useRef(null);
  const [clienteSearch, setClienteSearch] = useState('');

  const maestrosCatalogos = [
    { id: 'mst_industrias', tabla: 'Industrias' },
    { id: 'mst_sedes', tabla: 'Sedes y ubicaciones GPS' },
    { id: 'mst_ceco_cebe', tabla: 'Centros de Costo y Beneficio' },
    { id: 'mst_areas', tabla: 'Areas de la empresa' },
    { id: 'mst_cargos', tabla: 'Cargos de la empresa' },
    { id: 'mst_especialidades', tabla: 'Especialidades técnicas' },
    { id: 'mst_materiales', tabla: 'Materiales e insumos con codigo de barras' },
    { id: 'mst_impuestos', tabla: 'Monedas, impuestos y unidades' },
    { id: 'mst_tipos_servicio', tabla: 'Tipos de servicio interno' },
    { id: 'mst_almacenes', tabla: 'Almacenes y depósitos' },
  ];
  const nuevoBase = { codigo:'', nombre:'', detalle:'', estado:'activo', area:'', requiere_cert:false, clasificacion:'', facturable:false, tipo:'', responsable:'', direccion:'', tipo_cargo:'', tipo_catalogo:'moneda' };
  const [rows, setRows] = useState({
    mst_clientes: [],
    mst_proveedores: [],
    mst_materiales: [],
    mst_impuestos: [],
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
    if (sel.id === 'mst_impuestos') return monedasImpuestosUnidades;
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
      } else if (sel.id === 'mst_impuestos') {
        const item = {
          codigo: String(nuevo.codigo || '').trim().toUpperCase(),
          tipo: nuevo.tipo_catalogo || 'moneda',
          nombre: nuevo.nombre || 'Nuevo valor',
          detalle: nuevo.detalle || '',
          estado: nuevo.estado || 'activo',
        };
        if (!item.codigo) throw new Error('Completa el codigo del valor.');
        if (editandoId) await actualizarMonedaImpuestoUnidad(editandoId, item);
        else await crearMonedaImpuestoUnidad(item);
      } else {
        return;
      }
      addNotificacion?.(`${sel.tabla}: registro ${editandoId ? 'actualizado' : 'creado'}.`);
      resetForm();
    } catch (err) {
      console.error(err);
      const rawMsg = err?.message || 'No se pudo guardar el registro.';
      let msg = rawMsg;
      if (rawMsg.includes('monedas_impuestos_unidades') || (sel.id === 'mst_impuestos' && rawMsg.includes('schema cache'))) {
        msg = 'No existe la tabla monedas_impuestos_unidades en Supabase. Aplica la migracion 095_parametros_generales_resto.sql y recarga el schema cache.';
      } else if (rawMsg.includes('areas_empresa') || (sel.id === 'mst_areas' && rawMsg.includes('schema cache'))) {
        msg = 'No existe la tabla areas_empresa en Supabase. Aplica la migracion 050_maestro_areas_empresa.sql y recarga el schema cache.';
      }
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
      tipo_catalogo: r.tipo || 'moneda',
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
      else if (sel.id === 'mst_impuestos') await eliminarMonedaImpuestoUnidad(r.id);
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
          <div className="input-group"><label>Área</label><select className="select" value={nuevo.area} onChange={e=>setNuevo(v=>({...v,area:e.target.value}))}><option value="">Seleccionar...</option>{(areasEmpresa||[]).map(a=><option key={a.id} value={a.nombre}>{a.nombre}</option>)}</select></div>
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
    if (sel?.id === 'mst_impuestos') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <div className="input-group">
            <label>Tipo</label>
            <select className="select" value={nuevo.tipo_catalogo} onChange={e=>setNuevo(v=>({...v,tipo_catalogo:e.target.value}))}>
              <option value="moneda">Moneda</option>
              <option value="impuesto">Impuesto</option>
              <option value="unidad">Unidad</option>
            </select>
          </div>
          <div className="input-group">
            <label>Codigo *</label>
            <input className="input" required value={nuevo.codigo} onChange={e=>setNuevo(v=>({...v,codigo:e.target.value.toUpperCase()}))} placeholder={nuevo.tipo_catalogo === 'moneda' ? 'PEN' : nuevo.tipo_catalogo === 'impuesto' ? 'IGV' : 'UN'} autoFocus/>
          </div>
          <div className="input-group" style={{gridColumn:'span 1'}}><label>Nombre *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Sol peruano"/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option><option>bloqueado</option></select></div>
          <div className="input-group" style={{gridColumn:'1 / -1'}}><label>Detalle</label><input className="input" value={nuevo.detalle} onChange={e=>setNuevo(v=>({...v,detalle:e.target.value}))} placeholder="Ej: Moneda base local, impuesto 18%, unidad de medida"/></div>
          <FormActions label="valor" />
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
    if (sel?.id === 'mst_impuestos') return (
      <table className="tbl">
        <thead><tr><th>Tipo</th><th>Codigo</th><th>Valor</th><th>Detalle</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td><span className="badge badge-cyan">{r.tipo}</span></td>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td className="text-muted">{r.detalle}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':r.estado==='bloqueado'?'badge-red':'badge-gray')}>{r.estado}</span></td>
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
                <div className="maestro-card-meta">{industrias.length} valores - Actualizado en tiempo real</div>
              )}
              {m.id === 'mst_ceco_cebe' && (
                <div className="maestro-card-meta">{(centrosCosto||[]).length} CECOs · {(centrosBeneficio||[]).length} CEBEs</div>
              )}
            </div>
            <button className="btn btn-secondary btn-sm maestro-card-action" onClick={() => { if (m.id === 'mst_ceco_cebe') { setShowCecoCebe(true); } else { setSel(m); resetForm(); } }}>
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

      {showCecoCebe && <CecoCebePanel onClose={() => setShowCecoCebe(false)} />}

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
  const { role, addNotificacion, empresa } = useApp();
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!empresa?.id) return;
    setLoading(true);
    maestrosService.getServicios(empresa.id).then(data => {
      setServicios(data || []);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      addNotificacion('Error cargando catálogo de servicios.', 'error');
      setLoading(false);
    });
  }, [empresa?.id]);

  const [modalImportar, setModalImportar] = useState(false);
  const [tabImport, setTabImport] = useState('subir');
  const [importRows, setImportRows] = useState([]);

  const formBase = { 
    codigo: '', familia: '', descripcion: '', unidad: 'Servicio', 
    moneda: 'PEN', costo: '', precio: '', estado: 'activo', facturable: true, 
    precio_incluido: false, detalle: '', entregables: [], notas_internas: '' 
  };
  const [form, setForm] = useState(formBase);
  const [nuevoEntregable, setNuevoEntregable] = useState('');

  const margenCalc = (c, p) => {
    const pc = Number(p), cc = Number(c);
    if (!pc) return 0;
    return Math.round(((pc - cc) / pc) * 100);
  };

  const verCostos = role?.permisos?.todo || role?.permisos?.ver_costos;
  const verPrecios = role?.permisos?.todo || role?.permisos?.ver_precios;
  
  const margenActual = margenCalc(form.costo, form.precio);
  const colorMargen = margenActual > 30 ? 'var(--green)' : margenActual >= 10 ? 'var(--orange)' : 'var(--danger)';

  const abrirNuevo = () => { 
    const nuevoCodigo = `SRV-${String(servicios.length + 1).padStart(3, '0')}`;
    setForm({ ...formBase, codigo: nuevoCodigo }); 
    setNuevoEntregable(''); 
    setEditando(null); 
    setFormError('');
    setPanelAbierto(true); 
  };
  
  const abrirEditar = (s) => {
    setForm({ 
      id: s.id,
      codigo: s.codigo || s.id || '',
      familia: s.familia || 'Mantenimiento', 
      descripcion: s.descripcion || '', 
      unidad: s.unidad || 'Servicio', 
      moneda: s.moneda || 'PEN',
      costo: s.costo || '', 
      precio: s.precio || '', 
      estado: s.estado || 'activo', 
      facturable: s.facturable ?? true, 
      precio_incluido: s.precio_incluido ?? false, 
      detalle: s.detalle || '', 
      notas_internas: s.notas_internas || '',
      entregables: s.entregables ? [...s.entregables] : [] 
    });
    setNuevoEntregable('');
    setEditando(s);
    setFormError('');
    setPanelAbierto(true);
  };
  
  const cerrar = () => { setPanelAbierto(false); setEditando(null); };

  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const agregarEntregable = () => {
    const txt = nuevoEntregable.trim();
    if (!txt) return;
    setForm(p => ({ ...p, entregables: [...p.entregables, txt] }));
    setNuevoEntregable('');
  };
  const quitarEntregable = (idx) => setForm(p => ({ ...p, entregables: p.entregables.filter((_, i) => i !== idx) }));

  const guardar = async () => {
    setFormError('');
    if (!form.codigo?.trim()) return setFormError('El código es obligatorio.');
    if (!form.descripcion?.trim()) return setFormError('La descripción es obligatoria.');
    
    if (!editando || editando.codigo !== form.codigo) {
      if (servicios.some(s => s.codigo === form.codigo)) {
        return setFormError('El código ya existe en el catálogo.');
      }
    }
    
    if (form.facturable && !form.precio_incluido && Number(form.precio) <= 0) {
      return setFormError('Si el servicio es facturable, el precio de referencia debe ser mayor a 0 (o estar incluido).');
    }

    const margen = margenCalc(form.costo, form.precio);
    
    try {
      if (editando) {
        const payload = { ...form, costo: Number(form.costo), precio: Number(form.precio), margen };
        const saved = await maestrosService.actualizarServicio(editando.id, payload);
        setServicios(prev => prev.map(s => s.id === editando.id ? saved : s));
      } else {
        const payload = { ...form, costo: Number(form.costo), precio: Number(form.precio), margen };
        delete payload.id;
        const saved = await maestrosService.crearServicio(empresa.id, payload);
        setServicios(prev => [...prev, saved]);
      }
      addNotificacion(editando ? 'Servicio actualizado' : 'Servicio creado');
      cerrar();
    } catch (err) {
      console.error(err);
      setFormError(err.message || 'Error al guardar el servicio en la base de datos.');
    }
  };

  const eliminar = async (s) => {
    if (confirm(`¿Estás seguro de eliminar el servicio "${s.descripcion}"?`)) {
      try {
        await maestrosService.eliminarServicio(s.id);
        setServicios(prev => prev.filter(x => x.id !== s.id));
        addNotificacion('Servicio eliminado', 'info');
      } catch (err) {
        console.error(err);
        addNotificacion('Error al eliminar el servicio.', 'error');
      }
    }
  };

  const descargarPlantilla = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "codigo,nombre,familia,unidad,costo_ref,precio_ref,facturable,estado,entregables\n"
      + "SRV-999,Mantenimiento Preventivo,Mantenimiento,Servicio,100,150,si,activo,Revision general|Cambio aceite\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "plantilla_servicios.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rowsParsed = [];
      for(let i=1; i<lines.length; i++){
        const cols = lines[i].split(',').map(c => c.trim());
        const row = {};
        headers.forEach((h, j) => { row[h] = cols[j] || ''; });
        
        const errors = [];
        if (!row.codigo) errors.push('Código vacío');
        else if (servicios.some(s => s.codigo === row.codigo) || rowsParsed.some(r => r.codigo === row.codigo)) errors.push('Código duplicado');
        if (!row.nombre) errors.push('Nombre vacío');
        
        const facturable = row.facturable?.toLowerCase() !== 'no';
        const precio = Number(row.precio_ref) || 0;
        if (facturable && precio <= 0) errors.push('Precio requerido si es facturable');
        
        rowsParsed.push({ ...row, facturable, _errores: errors });
      }
      setImportRows(rowsParsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const ejecutarImportacion = async () => {
    const validRows = importRows.filter(r => r._errores.length === 0);
    if (!validRows.length) return;
    const nuevos = validRows.map(r => ({
      codigo: r.codigo,
      descripcion: r.nombre,
      familia: r.familia || 'General',
      unidad: r.unidad || 'Servicio',
      moneda: r.moneda && String(r.moneda).toUpperCase() === 'USD' ? 'USD' : 'PEN',
      costo: Number(r.costo_ref) || 0,
      precio: Number(r.precio_ref) || 0,
      facturable: r.facturable,
      estado: r.estado === 'inactivo' ? 'inactivo' : 'activo',
      margen: margenCalc(r.costo_ref, r.precio_ref),
      entregables: r.entregables ? r.entregables.split('|').filter(Boolean) : []
    }));
    
    try {
      setLoading(true);
      await maestrosService.importarServiciosMasivo(empresa.id, nuevos);
      const data = await maestrosService.getServicios(empresa.id);
      setServicios(data || []);
      addNotificacion(`Se importaron ${nuevos.length} servicios exitosamente.`);
      setModalImportar(false);
      setImportRows([]);
    } catch (err) {
      console.error(err);
      addNotificacion('Error durante la importación masiva.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const familiasMst = ['Mantenimiento', 'Implementación', 'Supervisión', 'Suministro', 'Consultoría', 'General'];
  const familiasOpciones = [...new Set([...familiasMst, ...servicios.map(s => s.familia).filter(Boolean)])].sort();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Catálogo de Servicios</h1>
          <div className="page-sub">Servicios ofrecidos con estructura de costos</div>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => { setModalImportar(true); setTabImport('subir'); setImportRows([]); }}>{I.download} Carga masiva</button>
          <button className="btn btn-primary" onClick={abrirNuevo}>{I.plus} Nuevo servicio</button>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:90}}>Código</th>
                <th>Familia</th>
                <th>Descripción</th>
                <th>Unidad</th>
                {verCostos && <th>Costo Ref.</th>}
                {verPrecios && <th>Precio Ref.</th>}
                {(verCostos || verPrecios) && <th>Margen</th>}
                <th>Facturable</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" className="text-center text-muted" style={{padding:'40px 0'}}>Cargando catálogo...</td></tr>
              ) : servicios.length === 0 ? (
                <tr><td colSpan="10" className="text-center text-muted" style={{padding:'40px 0'}}>No hay servicios registrados en el catálogo.</td></tr>
              ) : servicios.map(s => (
                <tr key={s.id || s.codigo} className="hover-row">
                  <td className="mono">{s.codigo || s.id}</td>
                  <td>{s.familia}</td>
                  <td style={{fontWeight:500}}>
                    {s.descripcion}
                    {s.entregables?.length > 0 && <span className="text-muted" style={{fontSize:11, marginLeft:6}}>· <span className="badge badge-gray">{s.entregables.length} entregables</span></span>}
                  </td>
                  <td>{s.unidad}</td>
                  {verCostos && <td className="mono text-muted">{money(s.costo, s.moneda === 'USD' ? '$' : 'S/')}</td>}
                  {verPrecios && <td className="mono" style={{fontWeight:600}}>{s.precio_incluido ? <span className="badge badge-gray">Incluido</span> : money(s.precio, s.moneda === 'USD' ? '$' : 'S/')}</td>}
                  {(verCostos || verPrecios) && <td><span className="badge badge-cyan">{s.margen}%</span></td>}
                  <td>{s.facturable ? <span className="badge badge-green">Sí</span> : <span className="badge badge-gray">No</span>}</td>
                  <td><span className={`badge ${s.estado === 'activo' ? 'badge-green' : 'badge-gray'}`}>{s.estado}</span></td>
                  <td>
                    <button className="icon-btn" style={{color:'var(--fg-muted)'}} onClick={() => abrirEditar(s)} title="Editar servicio">{I.edit}</button>
                    <button className="icon-btn" style={{color:'var(--danger)', marginLeft: 6}} onClick={() => eliminar(s)} title="Eliminar servicio">{I.trash}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {panelAbierto && <>
        <div className="side-panel-backdrop" onClick={cerrar}/>
        <div className="side-panel" style={{width:'min(680px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Catálogo de Servicios</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>{editando ? 'Editar servicio' : 'Nuevo servicio'}</div>
            </div>
            <button className="icon-btn" style={{color:'var(--fg-muted)'}} onClick={cerrar}>{I.x}</button>
          </div>
          <div className="side-panel-body">
            {formError && <div className="alert alert-danger" style={{marginBottom:16}}>{formError}</div>}
            
            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--cyan)'}}>IDENTIFICACIÓN</div>
            <div className="grid-2" style={{gap:14, marginBottom:24}}>
              <div className="input-group">
                <label>Código *</label>
                <input className="input" value={form.codigo} onChange={e => upd('codigo', e.target.value)} placeholder="SRV-006" disabled={!!editando} />
              </div>
              <div className="input-group">
                <label>Familia / Categoría</label>
                <input className="input" list="familias-list" value={form.familia} onChange={e => upd('familia', e.target.value)} placeholder="Selecciona o escribe..." />
                <datalist id="familias-list">
                  {familiasOpciones.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>Descripción (nombre del servicio) *</label>
                <input className="input" value={form.descripcion} onChange={e => upd('descripcion', e.target.value)} placeholder="Ej: Mantenimiento preventivo mensual" autoFocus />
              </div>
              <div className="input-group">
                <label>Unidad de medida</label>
                <select className="select" value={form.unidad} onChange={e => upd('unidad', e.target.value)}>
                  {['Servicio','Hora','Proyecto','Informe','Actividad','Mes','Día','Unidad'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Estado</label>
                <select className="select" value={form.estado} onChange={e => upd('estado', e.target.value)}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
            </div>

            {(verCostos || verPrecios) && (
              <>
                <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--cyan)'}}>ECONOMÍA</div>
                <div className="grid-2" style={{gap:14, marginBottom:24, padding:16, background:'var(--bg-subtle)', borderRadius:8}}>
                  <div className="input-group" style={{gridColumn:'1/-1', display:'flex', gap:12, alignItems:'center'}}>
                    <label style={{margin:0}}>Moneda base:</label>
                    <select className="select" style={{width:150}} value={form.moneda} onChange={e => upd('moneda', e.target.value)}>
                      <option value="PEN">Soles (S/)</option>
                      <option value="USD">Dólares ($)</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Costo de referencia ({form.moneda === 'USD' ? '$' : 'S/'})</label>
                    <input className="input" type="number" min="0" step="0.01" value={form.costo} onChange={e => upd('costo', e.target.value)} placeholder="0.00" disabled={!verCostos || form.precio_incluido} />
                  </div>
                  <div className="input-group">
                    <label>Precio de referencia ({form.moneda === 'USD' ? '$' : 'S/'})</label>
                    <input className="input" type="number" min="0" step="0.01" value={form.precio} onChange={e => upd('precio', e.target.value)} placeholder="0.00" disabled={!verPrecios || form.precio_incluido} />
                  </div>
                  {!form.precio_incluido && (Number(form.costo) > 0 || Number(form.precio) > 0) && (
                    <div className="input-group" style={{gridColumn:'1/-1', display:'flex', flexDirection:'row', alignItems:'center', gap:10}}>
                      <label style={{margin:0}}>Margen calculado:</label>
                      <strong style={{color: colorMargen, fontSize:15}}>{margenActual}%</strong>
                    </div>
                  )}
                  <div className="input-group" style={{gridColumn:'1/-1'}}>
                    <label style={{display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:14, marginTop:4}}>
                      <input type="checkbox" checked={form.facturable} onChange={e => upd('facturable', e.target.checked)} style={{width:16, height:16}} />
                      <span><strong>Es facturable</strong> (Genera línea de cobro al cliente)</span>
                    </label>
                  </div>
                </div>
              </>
            )}

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--cyan)'}}>ENTREGABLES</div>
            <div style={{marginBottom:24}}>
              {form.entregables.map((ent, idx) => (
                <div key={idx} style={{display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, marginBottom:6, fontSize:13}}>
                  <span style={{color:'var(--fg-muted)'}}>•</span>
                  <span style={{flex:1}}>{ent}</span>
                  <button type="button" className="icon-btn" style={{padding:2, color:'var(--danger)'}} onClick={() => quitarEntregable(idx)}>{I.trash}</button>
                </div>
              ))}
              <div style={{display:'flex', gap:8, marginTop:8}}>
                <input className="input" style={{flex:1}} value={nuevoEntregable} onChange={e => setNuevoEntregable(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), agregarEntregable())} placeholder="Ej: Capacitación 36 horas" />
                <button type="button" className="btn btn-secondary" style={{padding:'0 16px'}} onClick={agregarEntregable}>{I.plus} Agregar entregable</button>
              </div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--cyan)'}}>NOTAS INTERNAS</div>
            <div className="input-group" style={{marginBottom:24}}>
              <textarea className="input" rows={3} value={form.notas_internas} onChange={e => upd('notas_internas', e.target.value)} placeholder="Instrucciones opcionales para ventas o cotizaciones..." />
            </div>

            <div className="row" style={{justifyContent:'flex-end', gap:10}}>
              <button type="button" className="btn btn-secondary" onClick={cerrar}>Cancelar</button>
              <button type="button" className="btn btn-primary" data-local-form="true" onClick={guardar}>{I.save} {editando ? 'Guardar cambios' : 'Crear servicio'}</button>
            </div>
          </div>
        </div>
      </>}

      {modalImportar && (
        <>
          <div className="side-panel-backdrop" onClick={() => setModalImportar(false)} />
          <div className="side-panel" style={{maxWidth: 800, width: '96vw', padding:0}}>
            <div className="side-panel-head" style={{padding:'20px 24px'}}>
              <div>
                <div className="font-display" style={{fontSize:22, fontWeight:700}}>Carga Masiva de Servicios</div>
              </div>
              <button className="icon-btn" onClick={() => setModalImportar(false)}>{I.x}</button>
            </div>
            
            <div style={{padding:'0 24px'}}>
              <div className="tabs">
                <div className={'tab '+(tabImport==='subir'?'active':'')} onClick={()=>setTabImport('subir')}>Subir archivo</div>
                <div className={'tab '+(tabImport==='plantilla'?'active':'')} onClick={()=>setTabImport('plantilla')}>Descargar plantilla</div>
              </div>
            </div>

            <div className="side-panel-body" style={{padding:'24px', maxHeight:'calc(100vh - 140px)', overflowY:'auto'}}>
              {tabImport === 'plantilla' ? (
                <div className="col" style={{gap:16, alignItems:'center', padding:'40px 20px', textAlign:'center'}}>
                  <div style={{fontSize:48}}>📄</div>
                  <h3 style={{margin:0}}>Plantilla CSV de Servicios</h3>
                  <p className="text-muted" style={{maxWidth:400}}>Descarga este archivo como guía. No modifiques los nombres de las columnas en la primera fila para asegurar una correcta importación.</p>
                  <button className="btn btn-primary" onClick={descargarPlantilla}>{I.download} Descargar plantilla CSV</button>
                </div>
              ) : (
                <div className="col" style={{gap:20}}>
                  {!importRows.length ? (
                    <div style={{border:'2px dashed var(--border)', borderRadius:12, padding:'60px 20px', textAlign:'center', cursor:'pointer'}} onClick={() => document.getElementById('csv-upload').click()}>
                      <div style={{fontSize:40, marginBottom:16, color:'var(--fg-muted)'}}>⬆️</div>
                      <h4 style={{margin:0}}>Selecciona un archivo CSV</h4>
                      <p className="text-muted" style={{marginTop:8, fontSize:13}}>Los archivos XLSX deben guardarse primero como CSV (delimitado por comas).</p>
                      <input id="csv-upload" type="file" accept=".csv" style={{display:'none'}} onChange={handleFileUpload} />
                    </div>
                  ) : (
                    <>
                      <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                        <div>
                          <strong>{importRows.length} filas analizadas</strong>
                          <div className="text-muted" style={{fontSize:12}}>
                            {importRows.filter(r => r._errores.length===0).length} válidas, {importRows.filter(r => r._errores.length>0).length} con errores
                          </div>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => setImportRows([])}>Subir otro archivo</button>
                      </div>
                      <div className="table-wrap" style={{maxHeight: 300, overflow:'auto'}}>
                        <table className="table" style={{minWidth: 1080}}>
                          <thead>
                            <tr>
                              <th>Código</th>
                              <th>Nombre</th>
                              <th>Familia</th>
                              <th>Unidad</th>
                              <th>Moneda</th>
                              <th>Costo</th>
                              <th>Precio</th>
                              <th>Facturable</th>
                              <th>Estado</th>
                              <th>Entregables</th>
                              <th>Errores</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importRows.map((r, i) => (
                              <tr key={i} style={{background: r._errores.length ? 'var(--danger-subtle)' : 'transparent'}}>
                                <td className="mono">{r.codigo}</td>
                                <td>{r.nombre}</td>
                                <td>{r.familia}</td>
                                <td>{r.unidad}</td>
                                <td>{String(r.moneda || 'PEN').toUpperCase()}</td>
                                <td className="mono">{r.costo_ref}</td>
                                <td>{r.precio_ref}</td>
                                <td>{r.facturable ? 'Sí' : 'No'}</td>
                                <td>{r.estado || 'activo'}</td>
                                <td className="text-muted" style={{maxWidth:220, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}} title={r.entregables}>{r.entregables}</td>
                                <td>
                                  {r._errores.length ? (
                                    <span style={{color:'var(--danger)', fontSize:12}}>{r._errores.join(', ')}</span>
                                  ) : (
                                    <span style={{color:'var(--green)', fontSize:12}}>OK</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="row" style={{justifyContent:'flex-end'}}>
                        <button className="btn btn-primary" onClick={ejecutarImportacion} disabled={!importRows.some(r => r._errores.length===0)}>
                          Importar {importRows.filter(r => r._errores.length===0).length} filas válidas
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
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
  const {
    empresaConfig, guardarEmpresaConfig, subirImagenEmpresa, addNotificacion,
    seriesDocumentarias = [], slaPlantillas = [], diccionarioComercial = [],
    monedasImpuestosUnidades = [],
    crearSerieDocumentaria, actualizarSerieDocumentaria, eliminarSerieDocumentaria,
    crearSlaPlantilla, actualizarSlaPlantilla, eliminarSlaPlantilla,
    crearDiccionarioComercial, actualizarDiccionarioComercial, eliminarDiccionarioComercial,
  } = useApp();
  const [saving, setSaving] = useState(false);
  const [savingSerie, setSavingSerie] = useState(false);
  const [savingSla, setSavingSla] = useState(false);
  const [savingDicc, setSavingDicc] = useState(false);

  const [datos, setDatos] = useState({ razon_social:'', ruc:'', email_comercial:'', sitio_web:'', direccion:'', firmante:'', cargo_firmante:'' });
  const [conds, setConds] = useState({ cond_forma_pago:'', cond_validez:'', cond_penalidad:'', cond_inicio_proyecto:'', cond_alcance:'', cond_integraciones:'', cond_confidencialidad:'', cond_glosa_factura:'' });
  const [colores, setColores] = useState({ color_primario:'#1A2B4A', color_secundario:'#607D8B' });
  const defaultFlujos = [
    { modulo: 'OT', flujo: 'borrador -> programada -> ejecucion -> cerrada -> valorizada -> facturada', alerta: 'SLA por contrato' },
    { modulo: 'Cotizacion', flujo: 'borrador -> enviada -> aprobada -> ganada / perdida', alerta: 'Descuento requiere aprobacion' },
    { modulo: 'SOLPE', flujo: 'borrador -> solicitada -> aprobada -> atendida', alerta: 'Urgencia alta notifica supervisor' },
    { modulo: 'Compras campo', flujo: 'capturada -> pendiente revision -> validada -> CxP', alerta: 'IA con baja confianza' },
  ];
  const emptySerie = { documento:'', serie:'', siguiente_correlativo:'1', regla:'', estado:'activo' };
  const emptySla = { nombre:'', tiempo_respuesta_horas:'4', tiempo_resolucion_horas:'24', semaforo_regla:'Rojo a 80%', estado:'activo' };
  const emptyDicc = { categoria:'Comercial', clave:'', texto:'', estado:'activo' };
  const [parametros, setParametros] = useState({ moneda_base:'PEN', igv_defecto:'18', zona_horaria:'America/Lima', plantilla_cotizacion:'TIDEO propuesta tecnica v3', plantilla_factura:'Exportacion fiscal externa', requiere_2fa_financiero:false });
  const [flujosAlertas, setFlujosAlertas] = useState(defaultFlujos);
  const [serieForm, setSerieForm] = useState(emptySerie);
  const [serieEditId, setSerieEditId] = useState(null);
  const [slaForm, setSlaForm] = useState(emptySla);
  const [slaEditId, setSlaEditId] = useState(null);
  const [diccForm, setDiccForm] = useState(emptyDicc);
  const [diccEditId, setDiccEditId] = useState(null);
  const [logoFile, setLogoFile]   = useState(null);
  const [firmaFile, setFirmaFile] = useState(null);
  const [logoPreview, setLogoPreview]   = useState(null);
  const [firmaPreview, setFirmaPreview] = useState(null);

  useEffect(() => {
    setDatos({ razon_social: empresaConfig.razon_social||'', ruc: empresaConfig.ruc||'', email_comercial: empresaConfig.email_comercial||'', sitio_web: empresaConfig.sitio_web||'', direccion: empresaConfig.direccion||'', firmante: empresaConfig.firmante||'', cargo_firmante: empresaConfig.cargo_firmante||'' });
    setConds({ cond_forma_pago: empresaConfig.cond_forma_pago||'', cond_validez: empresaConfig.cond_validez||'', cond_penalidad: empresaConfig.cond_penalidad||'', cond_inicio_proyecto: empresaConfig.cond_inicio_proyecto||'', cond_alcance: empresaConfig.cond_alcance||'', cond_integraciones: empresaConfig.cond_integraciones||'', cond_confidencialidad: empresaConfig.cond_confidencialidad||'', cond_glosa_factura: empresaConfig.cond_glosa_factura||'' });
    setColores({ color_primario: empresaConfig.color_primario||'#1A2B4A', color_secundario: empresaConfig.color_secundario||'#607D8B' });
    setParametros({
      moneda_base: empresaConfig.moneda_base || 'PEN',
      igv_defecto: empresaConfig.igv_defecto ?? '18',
      zona_horaria: empresaConfig.zona_horaria || 'America/Lima',
      plantilla_cotizacion: empresaConfig.plantilla_cotizacion || 'TIDEO propuesta tecnica v3',
      plantilla_factura: empresaConfig.plantilla_factura || 'Exportacion fiscal externa',
      requiere_2fa_financiero: Boolean(empresaConfig.requiere_2fa_financiero),
    });
    const cfgFlujos = Array.isArray(empresaConfig.config_flujos_alertas) ? empresaConfig.config_flujos_alertas : defaultFlujos;
    setFlujosAlertas(cfgFlujos.length ? cfgFlujos : defaultFlujos);
    if (empresaConfig.logo_url) setLogoPreview(empresaConfig.logo_url);
    if (empresaConfig.firma_url) setFirmaPreview(empresaConfig.firma_url);
  }, [empresaConfig]);

  const pickImagen = (campo, setFile, setPreview) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const extra = {};
      const { moneda_base, ...parametrosSinMoneda } = parametros;
      if (logoFile) {
        try { extra.logo_url = await subirImagenEmpresa('logo', logoFile); } catch (_) { addNotificacion('No se pudo subir el logo; verifique el bucket en Supabase.'); }
        setLogoFile(null);
      }
      if (firmaFile) {
        try { extra.firma_url = await subirImagenEmpresa('firma', firmaFile); } catch (_) { addNotificacion('No se pudo subir la firma; verifique el bucket en Supabase.'); }
        setFirmaFile(null);
      }
      await guardarEmpresaConfig({
        ...datos,
        ...conds,
        ...colores,
        ...parametrosSinMoneda,
        ...(monedasActivas.length ? { moneda_base } : {}),
        igv_defecto: Number(parametros.igv_defecto || 0),
        config_flujos_alertas: flujosAlertas,
        ...extra,
      });
    } finally {
      setSaving(false);
    }
  };

  const resetSerie = () => { setSerieForm(emptySerie); setSerieEditId(null); };
  const resetSla = () => { setSlaForm(emptySla); setSlaEditId(null); };
  const resetDicc = () => { setDiccForm(emptyDicc); setDiccEditId(null); };

  const guardarSerie = async (e) => {
    e.preventDefault();
    if (!serieForm.documento.trim() || !serieForm.serie.trim()) {
      addNotificacion('Completa documento y serie.');
      return;
    }
    setSavingSerie(true);
    try {
      if (serieEditId) await actualizarSerieDocumentaria(serieEditId, serieForm);
      else await crearSerieDocumentaria(serieForm);
      resetSerie();
      addNotificacion('Serie documentaria guardada.');
    } catch (error) {
      addNotificacion(`No se pudo guardar la serie: ${error?.message || 'error desconocido'}`);
    } finally {
      setSavingSerie(false);
    }
  };

  const guardarSla = async (e) => {
    e.preventDefault();
    if (!slaForm.nombre.trim()) {
      addNotificacion('Completa el nombre de la plantilla SLA.');
      return;
    }
    setSavingSla(true);
    try {
      if (slaEditId) await actualizarSlaPlantilla(slaEditId, slaForm);
      else await crearSlaPlantilla(slaForm);
      resetSla();
      addNotificacion('Plantilla SLA guardada.');
    } catch (error) {
      addNotificacion(`No se pudo guardar la plantilla SLA: ${error?.message || 'error desconocido'}`);
    } finally {
      setSavingSla(false);
    }
  };

  const guardarDicc = async (e) => {
    e.preventDefault();
    if (!diccForm.clave.trim() || !diccForm.texto.trim()) {
      addNotificacion('Completa clave y texto del diccionario.');
      return;
    }
    setSavingDicc(true);
    try {
      if (diccEditId) await actualizarDiccionarioComercial(diccEditId, diccForm);
      else await crearDiccionarioComercial(diccForm);
      resetDicc();
      addNotificacion('Frase comercial guardada.');
    } catch (error) {
      addNotificacion(`No se pudo guardar la frase: ${error?.message || 'error desconocido'}`);
    } finally {
      setSavingDicc(false);
    }
  };

  const editarSerie = (s) => {
    setSerieEditId(s.id);
    setSerieForm({ documento:s.documento||'', serie:s.serie||'', siguiente_correlativo:String(s.siguiente_correlativo ?? 1), regla:s.regla||'', estado:s.estado||'activo' });
  };

  const editarSla = (s) => {
    setSlaEditId(s.id);
    setSlaForm({ nombre:s.nombre||'', tiempo_respuesta_horas:String(s.tiempo_respuesta_horas ?? 0), tiempo_resolucion_horas:String(s.tiempo_resolucion_horas ?? 0), semaforo_regla:s.semaforo_regla||'', estado:s.estado||'activo' });
  };

  const editarDicc = (d) => {
    setDiccEditId(d.id);
    setDiccForm({ categoria:d.categoria||'Comercial', clave:d.clave||'', texto:d.texto||'', estado:d.estado||'activo' });
  };

  const setFlujoField = (idx, field, value) => {
    setFlujosAlertas(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const diccionarioActivo = (diccionarioComercial || []).filter(d => d.estado === 'activo');
  const insertarCond = (field, texto) => {
    if (!texto) return;
    setConds(prev => {
      const actual = prev[field] || '';
      return { ...prev, [field]: actual ? `${actual}${actual.endsWith(' ') || actual.endsWith('\n') ? '' : ' '}${texto}` : texto };
    });
  };
  const insertControls = (field) => (
    <div className="row" style={{gap:8, marginBottom:6, flexWrap:'wrap'}}>
      <select className="input" defaultValue="" style={{maxWidth:240, height:32, fontSize:12}}
        onChange={e => { insertarCond(field, e.target.value); e.currentTarget.value = ''; }}>
        <option value="">Insertar variable...</option>
        {VARIABLES_COMERCIALES.map(v => <option key={v.token} value={v.token}>{v.grupo} - {v.label}</option>)}
      </select>
      <select className="input" defaultValue="" style={{maxWidth:260, height:32, fontSize:12}}
        onChange={e => { insertarCond(field, e.target.value); e.currentTarget.value = ''; }}>
        <option value="">Insertar frase...</option>
        {diccionarioActivo.map(d => <option key={d.id} value={d.texto}>{d.categoria} - {d.clave}</option>)}
      </select>
    </div>
  );

  const inp = (field) => ({ className:'input', value: datos[field], onChange: e => setDatos(p=>({...p,[field]:e.target.value})) });
  const ta  = (field, rows=4) => ({ className:'input', rows, value: conds[field], onChange: e => setConds(p=>({...p,[field]:e.target.value})), style:{resize:'vertical'} });
  const pinp = (field) => ({ className:'input', value: parametros[field], onChange: e => setParametros(p=>({...p,[field]:e.target.value})) });
  const monedasActivas = monedasImpuestosUnidades
    .filter(m => m.tipo === 'moneda' && m.estado === 'activo' && m.codigo)
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Parametros Generales</h1>
          <div className="page-sub">Series, estados, impuestos, plantillas PDF y plantillas SLA por tenant</div>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{I.save} {saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>

      {/* ── Datos de la empresa ── */}
      <div className="card mb-6">
        <div className="card-head"><h3>Datos de la empresa</h3><span className="badge badge-cyan">Viajan a todos los documentos</span></div>
        <div className="card-body" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>

          {/* Logo */}
          <div className="input-group" style={{gridColumn:'1/-1', display:'flex', alignItems:'flex-start', gap:20}}>
            <div>
              <label>Logo de la empresa</label>
              <div style={{width:120, height:80, border:'1px dashed var(--border)', borderRadius:8, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-alt)', marginBottom:6}}>
                {logoPreview ? <img src={logoPreview} alt="Logo" style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}}/> : <span style={{fontSize:11, color:'var(--fg-subtle)'}}>Sin logo</span>}
              </div>
              <label className="btn btn-secondary" style={{cursor:'pointer', fontSize:12}}>
                {I.upload} Subir logo
                <input type="file" accept="image/*" style={{display:'none'}} onChange={pickImagen('logo', setLogoFile, setLogoPreview)}/>
              </label>
            </div>
            <div style={{flex:1}}>
              <label>Firma (cierre del PDF)</label>
              <div style={{width:160, height:80, border:'1px dashed var(--border)', borderRadius:8, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-alt)', marginBottom:6}}>
                {firmaPreview ? <img src={firmaPreview} alt="Firma" style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}}/> : <span style={{fontSize:11, color:'var(--fg-subtle)'}}>Sin firma</span>}
              </div>
              <label className="btn btn-secondary" style={{cursor:'pointer', fontSize:12}}>
                {I.upload} Subir firma
                <input type="file" accept="image/*" style={{display:'none'}} onChange={pickImagen('firma', setFirmaFile, setFirmaPreview)}/>
              </label>
            </div>
          </div>

          <div className="input-group">
            <label>Razón social</label>
            <input {...inp('razon_social')} placeholder="Ej: TIDEO S.A.C."/>
          </div>
          <div className="input-group">
            <label>RUC</label>
            <input {...inp('ruc')} placeholder="20XXXXXXXXX"/>
          </div>
          <div className="input-group">
            <label>Email comercial</label>
            <input {...inp('email_comercial')} type="email" placeholder="ventas@empresa.com"/>
          </div>
          <div className="input-group">
            <label>Sitio web</label>
            <input {...inp('sitio_web')} placeholder="www.empresa.com"/>
          </div>
          <div className="input-group" style={{gridColumn:'1/-1'}}>
            <label>Dirección</label>
            <input {...inp('direccion')} placeholder="Av. Ejemplo 123, Lima"/>
          </div>
          <div className="input-group">
            <label>Firmante por defecto</label>
            <input {...inp('firmante')} placeholder="Nombre completo"/>
          </div>
          <div className="input-group">
            <label>Cargo del firmante</label>
            <input {...inp('cargo_firmante')} placeholder="Ej: Gerente Comercial"/>
          </div>
          <div className="input-group">
            <label>Color primario (PDF, encabezados)</label>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <input type="color" value={colores.color_primario} onChange={e => setColores(p=>({...p, color_primario:e.target.value}))} style={{width:44, height:36, border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', padding:2}}/>
              <input className="input" value={colores.color_primario} onChange={e => setColores(p=>({...p, color_primario:e.target.value}))} style={{flex:1}} placeholder="#1A2B4A"/>
              <div style={{width:32, height:32, borderRadius:6, background:colores.color_primario, border:'1px solid var(--border)'}}/>
            </div>
          </div>
          <div className="input-group">
            <label>Color secundario (PDF, subtítulos)</label>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <input type="color" value={colores.color_secundario} onChange={e => setColores(p=>({...p, color_secundario:e.target.value}))} style={{width:44, height:36, border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', padding:2}}/>
              <input className="input" value={colores.color_secundario} onChange={e => setColores(p=>({...p, color_secundario:e.target.value}))} style={{flex:1}} placeholder="#607D8B"/>
              <div style={{width:32, height:32, borderRadius:6, background:colores.color_secundario, border:'1px solid var(--border)'}}/>
            </div>
          </div>
        </div>
      </div>

      {/* ── Condiciones comerciales por defecto ── */}
      <div className="card mb-6">
        <div className="card-head"><h3>Condiciones comerciales por defecto</h3><span className="badge badge-purple">Pre-cargadas en cada cotización</span></div>
        <div className="card-body col" style={{gap:16}}>
          {[
            ['cond_forma_pago',       'Forma de pago y datos bancarios',       'Ej: 50% adelanto, 50% contra entrega. Cuenta BCP…'],
            ['cond_validez',          'Validez de la oferta',                  'Ej: La presente cotización tiene validez de 30 días calendarios.'],
            ['cond_penalidad',        'Penalidad por mora',                    'Ej: 0.5% por día hábil de retraso sobre el monto pendiente.'],
            ['cond_inicio_proyecto',  'Inicio del proyecto',                   'Ej: El proyecto inicia 5 días hábiles después de la aprobación.'],
            ['cond_alcance',          'Alcance y exclusiones',                 'Ej: El presente servicio incluye… No incluye…'],
            ['cond_integraciones',    'Integraciones externas',                'Ej: Las integraciones con sistemas de terceros serán cotizadas por separado.'],
            ['cond_confidencialidad', 'Confidencialidad',                      'Ej: Ambas partes se comprometen a mantener confidencialidad…'],
            ['cond_glosa_factura',    'Glosa recomendada para facturas',       'Ej: Por servicio de mantenimiento según contrato N°…'],
          ].map(([field, label, placeholder]) => (
            <div className="input-group" key={field}>
              <label>{label}</label>
              {insertControls(field)}
              <textarea {...ta(field)} placeholder={placeholder}/>
            </div>
          ))}
        </div>
      </div>

      {/* ── Secciones existentes ── */}
      <div className="grid-2 mb-6">
        <div className="card">
          <div className="card-head"><h3>Variables del sistema</h3><span className="badge badge-cyan">{VARIABLES_COMERCIALES.length} disponibles</span></div>
          <div className="card-body" style={{display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:8}}>
            {VARIABLES_COMERCIALES.map(v => (
              <div key={v.token} style={{border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', background:'var(--bg-subtle)'}}>
                <div className="eyebrow" style={{marginBottom:3}}>{v.grupo}</div>
                <div style={{fontSize:12, fontWeight:700}}>{v.label}</div>
                <div className="mono text-muted" style={{fontSize:11, marginTop:3}}>{v.token}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Diccionario comercial</h3><span className="badge badge-purple">{diccionarioComercial.length} frases</span></div>
          <form className="card-body" onSubmit={guardarDicc} style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div className="input-group"><label>Categoria</label><select className="input" value={diccForm.categoria} onChange={e=>setDiccForm(p=>({...p, categoria:e.target.value}))}>{['Comercial','Proyecto','Pagos','Facturacion','Legal'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="input-group"><label>Estado</label><select className="input" value={diccForm.estado} onChange={e=>setDiccForm(p=>({...p, estado:e.target.value}))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Clave visible</label><input className="input" value={diccForm.clave} onChange={e=>setDiccForm(p=>({...p, clave:e.target.value}))} placeholder="Primera factura"/></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Texto a insertar</label><textarea className="input" rows={3} value={diccForm.texto} onChange={e=>setDiccForm(p=>({...p, texto:e.target.value}))} placeholder="Primera factura contra entrega de avance aprobado"/></div>
            <div className="row" style={{gridColumn:'1/-1', justifyContent:'flex-end'}}>
              {diccEditId && <button type="button" className="btn btn-secondary" onClick={resetDicc}>Cancelar</button>}
              <button type="submit" className="btn btn-primary" disabled={savingDicc}>{diccEditId ? I.save : I.plus} {savingDicc ? 'Guardando...' : diccEditId ? 'Actualizar frase' : 'Agregar frase'}</button>
            </div>
          </form>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Categoria</th><th>Clave</th><th>Texto</th><th>Estado</th><th></th></tr></thead>
              <tbody>{diccionarioComercial.map(d => (
                <tr key={d.id}>
                  <td><span className="badge badge-cyan">{d.categoria}</span></td>
                  <td><strong>{d.clave}</strong></td>
                  <td className="text-muted" style={{maxWidth:260}}>{d.texto}</td>
                  <td><span className={'badge ' + (d.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{d.estado}</span></td>
                  <td className="row" style={{justifyContent:'flex-end', gap:4}}>
                    <button className="icon-btn" title="Editar" onClick={() => editarDicc(d)} style={{color:'var(--cyan)'}}>{I.edit}</button>
                    <button className="icon-btn" title="Eliminar" onClick={() => { if (window.confirm('Eliminar frase comercial?')) eliminarDiccionarioComercial(d.id).catch(error => addNotificacion(`No se pudo eliminar la frase: ${error?.message || 'error desconocido'}`)); }} style={{color:'var(--danger)'}}>{I.trash}</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Series documentarias</h3><span className="badge badge-cyan">{seriesDocumentarias.filter(s => s.estado === 'activo').length} activas</span></div>
          <form className="card-body" onSubmit={guardarSerie} style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div className="input-group"><label>Documento</label><input className="input" value={serieForm.documento} onChange={e=>setSerieForm(p=>({...p, documento:e.target.value}))} placeholder="Cotizaciones"/></div>
            <div className="input-group"><label>Serie</label><input className="input" value={serieForm.serie} onChange={e=>setSerieForm(p=>({...p, serie:e.target.value}))} placeholder="COT-2026"/></div>
            <div className="input-group"><label>Siguiente correlativo</label><input className="input" type="number" min="1" value={serieForm.siguiente_correlativo} onChange={e=>setSerieForm(p=>({...p, siguiente_correlativo:e.target.value}))}/></div>
            <div className="input-group"><label>Estado</label><select className="input" value={serieForm.estado} onChange={e=>setSerieForm(p=>({...p, estado:e.target.value}))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Regla</label><input className="input" value={serieForm.regla} onChange={e=>setSerieForm(p=>({...p, regla:e.target.value}))} placeholder="Anual por empresa"/></div>
            <div className="row" style={{gridColumn:'1/-1', justifyContent:'flex-end'}}>
              {serieEditId && <button type="button" className="btn btn-secondary" onClick={resetSerie}>Cancelar</button>}
              <button type="submit" className="btn btn-primary" disabled={savingSerie}>{serieEditId ? I.save : I.plus} {savingSerie ? 'Guardando...' : serieEditId ? 'Actualizar serie' : 'Agregar serie'}</button>
            </div>
          </form>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Documento</th><th>Serie</th><th>Siguiente</th><th>Regla</th><th>Estado</th><th></th></tr></thead>
              <tbody>{seriesDocumentarias.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.documento}</strong></td>
                  <td className="mono">{s.serie}</td>
                  <td className="mono">{String(s.siguiente_correlativo).padStart(4, '0')}</td>
                  <td className="text-muted">{s.regla}</td>
                  <td><span className={'badge ' + (s.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{s.estado}</span></td>
                  <td className="row" style={{justifyContent:'flex-end', gap:4}}>
                    <button className="icon-btn" title="Editar" onClick={() => editarSerie(s)} style={{color:'var(--cyan)'}}>{I.edit}</button>
                    <button className="icon-btn" title="Eliminar" onClick={() => { if (window.confirm('Eliminar serie documentaria?')) eliminarSerieDocumentaria(s.id).catch(error => addNotificacion(`No se pudo eliminar la serie: ${error?.message || 'error desconocido'}`)); }} style={{color:'var(--danger)'}}>{I.trash}</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Moneda, impuestos y PDF</h3></div>
          <div className="card-body" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div className="input-group">
              <label>Moneda base</label>
              <select className="input" value={monedasActivas.length ? parametros.moneda_base : ''} disabled={!monedasActivas.length} onChange={e => setParametros(p=>({...p, moneda_base:e.target.value}))}>
                {!monedasActivas.length && <option value="">Sin monedas activas en el maestro</option>}
                {monedasActivas.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo} - {m.nombre}</option>)}
              </select>
              {!monedasActivas.length && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Crea al menos una moneda activa en Maestros Base &gt; Monedas, impuestos y unidades.</div>}
            </div>
            <div className="input-group"><label>IGV por defecto (%)</label><input {...pinp('igv_defecto')} type="number" step="0.01" min="0"/></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Zona horaria</label><input {...pinp('zona_horaria')} placeholder="America/Lima"/></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Plantilla cotizacion</label><input {...pinp('plantilla_cotizacion')} placeholder="TIDEO propuesta tecnica v3"/></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Plantilla factura</label><input {...pinp('plantilla_factura')} placeholder="Exportacion fiscal externa"/></div>
            <label className="row" style={{gridColumn:'1/-1', gap:10, padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8}}>
              <input type="checkbox" className="checkbox" checked={parametros.requiere_2fa_financiero} onChange={e=>setParametros(p=>({...p, requiere_2fa_financiero:e.target.checked}))}/>
              <span>Requiere 2FA financiero</span>
            </label>
          </div>
        </div>
      </div>
      <div className="grid-2 mt-6">
        <div className="card">
          <div className="card-head">
            <h3>Estados por documento</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setFlujosAlertas(prev => [...prev, { modulo:'', flujo:'', alerta:'' }])}>{I.plus} Agregar</button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Modulo</th><th>Flujo</th><th>Regla de alerta</th><th></th></tr></thead>
              <tbody>{flujosAlertas.map((e, idx) => (
                <tr key={`${e.modulo}_${idx}`}>
                  <td><input className="input" value={e.modulo || ''} onChange={ev => setFlujoField(idx, 'modulo', ev.target.value)} /></td>
                  <td><input className="input" value={e.flujo || ''} onChange={ev => setFlujoField(idx, 'flujo', ev.target.value)} /></td>
                  <td><input className="input" value={e.alerta || ''} onChange={ev => setFlujoField(idx, 'alerta', ev.target.value)} /></td>
                  <td><button className="icon-btn" title="Eliminar" onClick={() => setFlujosAlertas(prev => prev.filter((_, i) => i !== idx))} style={{color:'var(--danger)'}}>{I.trash}</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Plantillas de SLA (Para Contratos)</h3><span className="badge badge-orange">{slaPlantillas.length} plantillas</span></div>
          <form className="card-body" onSubmit={guardarSla} style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Nombre</label><input className="input" value={slaForm.nombre} onChange={e=>setSlaForm(p=>({...p, nombre:e.target.value}))} placeholder="Correctivo Critico"/></div>
            <div className="input-group"><label>Respuesta (horas)</label><input className="input" type="number" min="0" step="0.5" value={slaForm.tiempo_respuesta_horas} onChange={e=>setSlaForm(p=>({...p, tiempo_respuesta_horas:e.target.value}))}/></div>
            <div className="input-group"><label>Resolucion (horas)</label><input className="input" type="number" min="0" step="0.5" value={slaForm.tiempo_resolucion_horas} onChange={e=>setSlaForm(p=>({...p, tiempo_resolucion_horas:e.target.value}))}/></div>
            <div className="input-group"><label>Semaforo</label><input className="input" value={slaForm.semaforo_regla} onChange={e=>setSlaForm(p=>({...p, semaforo_regla:e.target.value}))} placeholder="Rojo a 80%"/></div>
            <div className="input-group"><label>Estado</label><select className="input" value={slaForm.estado} onChange={e=>setSlaForm(p=>({...p, estado:e.target.value}))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
            <div className="row" style={{gridColumn:'1/-1', justifyContent:'flex-end'}}>
              {slaEditId && <button type="button" className="btn btn-secondary" onClick={resetSla}>Cancelar</button>}
              <button type="submit" className="btn btn-primary" disabled={savingSla}>{slaEditId ? I.save : I.plus} {savingSla ? 'Guardando...' : slaEditId ? 'Actualizar SLA' : 'Agregar SLA'}</button>
            </div>
          </form>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Plantilla</th><th>Respuesta</th><th>Resolucion</th><th>Semaforo</th><th>Estado</th><th></th></tr></thead>
              <tbody>{slaPlantillas.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.nombre}</strong></td>
                  <td>{s.tiempo_respuesta_horas}h</td>
                  <td>{s.tiempo_resolucion_horas}h</td>
                  <td><span className="badge badge-orange">{s.semaforo_regla}</span></td>
                  <td><span className={'badge ' + (s.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{s.estado}</span></td>
                  <td className="row" style={{justifyContent:'flex-end', gap:4}}>
                    <button className="icon-btn" title="Editar" onClick={() => editarSla(s)} style={{color:'var(--cyan)'}}>{I.edit}</button>
                    <button className="icon-btn" title="Eliminar" onClick={() => { if (window.confirm('Eliminar plantilla SLA?')) eliminarSlaPlantilla(s.id).catch(error => addNotificacion(`No se pudo eliminar la plantilla SLA: ${error?.message || 'error desconocido'}`)); }} style={{color:'var(--danger)'}}>{I.trash}</button>
                  </td>
                </tr>
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
  const { personalAdmin, vacacionesSolicitudes, licencias, solicitudesRRHH, aprobarVacacion, turnos, cargos = [], sedes = [], areasEmpresa = [], crearAdminPersonalCtx, actualizarAdminPersonalCtx, eliminarAdminPersonalCtx, empresa, addNotificacion, centrosCosto } = useApp();
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('ficha');
  const [view, setView] = useState('personal');
  const [panelAlta, setPanelAlta] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [altaSaving, setAltaSaving] = useState(false);
  const [altaError, setAltaError] = useState('');
  const turnosOptions = (turnos || []).filter(t => t.estado !== 'inactivo');
  const defaultTurnoId = turnosOptions[0]?.id || '';
  const cecosActivos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const formAltaBase = { nombre:'', dni:'', fecha_nacimiento:'', telefono:'', email:'', direccion:'', codigo:'', cargo:'', area:'', sede:'', turno_id:defaultTurnoId, centro_costo_id:'', modalidad:'Planilla', fecha_inicio:'', fecha_fin:'', remuneracion:'', dias_vacaciones:'30', estado:'activo' };
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
      telefono: sanitizePhone(p.telefono || ''),
      email: p.email || '',
      direccion: p.direccion || '',
      codigo: p.codigo || p.id || '',
      cargo: p.cargo || '',
      area: p.area || '',
      sede: p.sede || '',
      turno_id: turnosOptions.some(t => t.id === p.turno_id) ? p.turno_id : defaultTurnoId,
      centro_costo_id: p.centro_costo_id || '',
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
    if (!formAlta.centro_costo_id) {
      setAltaError('Este campo es obligatorio. Selecciona un CECO antes de continuar.');
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
      centro_costo_id: formAlta.centro_costo_id,
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
                    <td>
                      <div style={{display:'flex', gap:4, justifyContent:'flex-end'}}>
                        <button className="btn btn-sm btn-ghost" onClick={e=>{e.stopPropagation();setSel(p.id);setTab('ficha');}}>Ver ficha</button>
                        <button className="icon-btn" title="Editar colaborador" style={{color:'var(--cyan)'}} onClick={e=>{e.stopPropagation();abrirEditarColaborador(p);}}>{I.edit}</button>
                        <button className="icon-btn" title="Eliminar colaborador" style={{color:'var(--danger)'}} onClick={e=>{e.stopPropagation();eliminarColaborador(p);}}>{I.trash}</button>
                      </div>
                    </td>
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
              <div className="input-group"><label>Teléfono celular</label><input className="input" type="tel" inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} value={formAlta.telefono} onChange={e=>setFormAlta(v=>({...v,telefono:sanitizePhone(e.target.value)}))} placeholder="9XXXXXXXX"/></div>
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
              <div className="input-group"><label>CECO *</label><select className="select" required value={formAlta.centro_costo_id} onChange={e=>setFormAlta(v=>({...v,centro_costo_id:e.target.value}))}><option value="">{cecosActivos.length ? 'Seleccionar CECO...' : 'No hay Centros de Costo activos. Crea uno en Maestros Base antes de continuar.'}</option>{cecosActivos.map(c=><option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}</option>)}</select></div>
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

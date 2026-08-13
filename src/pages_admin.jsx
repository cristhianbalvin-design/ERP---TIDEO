import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ColumnFilter } from './components/ColumnFilter.jsx';
import { DocumentoPreviewModal } from './components/DocumentoPreviewModal.jsx';
import { TIPO_CONTRATO_LABELS, MODALIDAD_TRABAJO_LABELS, REGIMEN_JORNADA_LABELS, ESTADO_VALIDACION_LABELS, labelOr } from './utils/rrhhLabels.js';
import { I, money } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { SIDEBAR } from './shell.jsx';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import { TiposGastoAdmin } from './components/NuevoEgreso.jsx';
import { SociedadBadge, SociedadFormField, SociedadReadOnlyField } from './components/SociedadFormField.jsx';
import {
  actualizarSociedad,
  crearSociedad,
  generarCodigoSociedadBase,
  listarSociedadesAdministracion,
  resolverFiltroSociedadesVista,
} from './services/sociedadesService.js';
import { resolverPersonalConContratosVigentes, resolverSociedadDocumentoLaboral } from './services/nominaSociedadService.js';
import { resolverIdentidadEmisora } from './services/identidadEmisoraService.js';
import { PosicionSelector } from './components/PosicionSelector.jsx';
import { AsignacionCargosModal } from './components/AsignacionCargosModal.jsx';
import { buildOcupantesPorPosicion, getPosicionesSinCargo, contarRespaldoPrincipal } from './lib/posicionesHelpers.js';
import { ROLE_CATEGORIES, getUserHierarchyLevel, getPrimaryPosicion } from './lib/hierarchy.js';
import { PHONE_PATTERN, RUC_PATTERN, isValidRuc, sanitizePhone, sanitizeRuc } from './lib/formValidators.js';
import { VARIABLES_COMERCIALES } from './lib/textoComercial.js';
import { maestrosService } from './services/maestrosService.js';
import {
  CEBE_TIPOS_IMPORTACION,
  CEBE_TIPOS_FINITOS,
  CARGOS_FINANCIEROS_DBS,
  CECO_TIPOS_IMPORTACION,
  NATURALEZAS_ECONOMICAS_CECO,
  validarSociedadFormularioCentro,
  validarFilasImportacionCebe,
  validarFilasImportacionCeco,
} from './utils/cecoCebeImport.js';
import { resolverSociedadInicialFormularioCentro } from './utils/centrosSociedadForm.js';
import { importarMaterialesMasivo, findOrCreateFabricante, guardarMaterialNumerosParte, guardarFabricanteNumeroParteOriginal, normalizarTextoMatching } from './services/materialService.js';
import { ER_TIPO_SISTEMA_LABELS, ER_TIPO_SISTEMA_OPTIONS } from './services/estadoResultadosService.js';
import * as personalDocumentosService from './services/personalDocumentosService.js';
import * as amonestacionesService from './services/amonestacionesService.js';
import * as tareosAdminService from './services/tareosAdminService.js';
import { CATEGORIA_FIRMA_RUBRICA } from './services/firmaPersonalService.js';
import { FileUpload } from './components/FileUpload.jsx';
import { AFP_PARAMETROS_DEFAULT, AFP_PRIMA_SEGURO_FALLBACK, latestAfpParametros } from './services/nominaService.js';
import { computarSaldoVacaciones } from './services/solicitudesRrhhService.js';
import { WHATSAPP_TIPOS_ALERTA, WHATSAPP_TEMPLATES_DEFAULT, WHATSAPP_RUTAS_DEFAULT, whatsappProviderStatus } from './services/whatsappService.js';
import {
  CONTRATO_DURACION_OPCIONES,
  asignacionFamiliarMonto,
  calcularHorasBaseMesDesdeTurno,
  diasVacacionesPorRegimen,
  esRegimenMinero,
  fiscalizacionLabel,
  getTipoFiscalizacion,
  normalizarModalidadContrato,
  normalizarTipoContratoDuracion,
  rrhhService,
  retencionIrHonorariosLabel,
} from './services/rrhhService.js';
import * as XLSX from 'xlsx';
const symOf = m => m === 'USD' ? 'US$' : 'S/';
import { SmartTextField } from './components/SmartTextField.jsx';

const rrhhPeriodoMesActual = () => new Date().toISOString().slice(0, 7);
const rrhhDesplazarPeriodoMes = (periodo, delta) => {
  const [year, month] = String(periodo || rrhhPeriodoMesActual()).split('-').map(Number);
  const d = new Date(year || new Date().getFullYear(), (month || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const rrhhRangoPeriodoMes = (periodo) => {
  const [year, month] = String(periodo || rrhhPeriodoMesActual()).split('-').map(Number);
  const inicio = new Date(year || new Date().getFullYear(), (month || 1) - 1, 1);
  const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0);
  return { desde: inicio.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
};
const rrhhHorasParteAprobado = p => Number(p?.horas ?? p?.horas_normales ?? p?.horas_total ?? 0) || 0;
const rrhhBajaProductividad = (persona, partes = [], tareos = [], periodo = rrhhDesplazarPeriodoMes(rrhhPeriodoMesActual(), -1)) => {
  if (!persona) return false;
  const { desde, hasta } = rrhhRangoPeriodoMes(periodo);
  const horasPartes = (partes || [])
    .filter(p => String(p.estado || '').toLowerCase() === 'aprobado')
    .filter(p => {
      const fecha = p.fecha || p.fecha_parte || p.created_at?.slice?.(0, 10);
      return fecha >= desde && fecha <= hasta && (p.tecnico_id || p.personal_id || p.tecnico) === persona.id;
    })
    .reduce((s, p) => s + rrhhHorasParteAprobado(p), 0);
  const horasTareo = (tareos || [])
    .filter(t => {
      const fecha = t.fecha || t.created_at?.slice?.(0, 10);
      return fecha >= desde && fecha <= hasta && t.personal_id === persona.id && String(t.estado || '').toLowerCase() !== 'anulado';
    })
    .reduce((s, t) => s + Number(t.horas || 0), 0);
  const base = Number(persona.horas_base_mes || 0) || 0;
  return base > 0 && ((horasPartes + horasTareo) / base) * 100 < 50;
};

// Roles builder, Usuarios, Tenants/Planes, and simple stub pages

function Roles() {
  const { roles, clonarRol, actualizarPermisosRol, guardarPermisosRol, crearRol, eliminarRol, editarRol, usuarios, setUsuarios, addNotificacion, accessDebug, nivelesJerarquicos = [] } = useApp();
  const nivelesActivos = nivelesJerarquicos.filter(n => n.estado === 'activo').sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100));
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
  const [editandoRolId, setEditandoRolId] = useState(null);
  const [guardandoRol, setGuardandoRol] = useState(false);
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
    if (!nuevoNombre.trim() || guardandoRol) return;
    setGuardandoRol(true);
    try {
      if (editandoRolId) {
        await editarRol(editandoRolId, { nombre: nuevoNombre.trim(), descripcion: nuevoDesc.trim(), categoria: nuevoCategoria, nivel_jerarquico: nuevoNivel });
      } else {
        const newId = await crearRol({ nombre: nuevoNombre.trim(), descripcion: nuevoDesc.trim(), categoria: nuevoCategoria, nivel_jerarquico: nuevoNivel });
        if (newId) setSel(newId);
      }
      cerrarModalNuevo();
    } finally {
      setGuardandoRol(false);
    }
  };

  const cerrarModalNuevo = () => {
    setModalNuevo(false);
    setEditandoRolId(null);
    setNuevoNombre('');
    setNuevoDesc('');
    setNuevoCategoria('otro');
    setNuevoNivel('operativo');
  };

  const abrirEditarRol = () => {
    setEditandoRolId(sel);
    setNuevoNombre(role.nombre || '');
    setNuevoDesc(role.descripcion || '');
    setNuevoCategoria(role.categoria || 'otro');
    setNuevoNivel(role.nivel_jerarquico || 'operativo');
    setModalNuevo(true);
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
          <button className="btn btn-primary" data-local-form="true" onClick={() => { setEditandoRolId(null); setNuevoNombre(''); setNuevoDesc(''); setNuevoCategoria('otro'); setNuevoNivel('operativo'); setModalNuevo(true); }}>{I.plus} Nuevo rol</button>
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
                  <button className="icon-btn" style={{position:'absolute',top:8,right:4,color:'var(--danger)'}} title="Eliminar rol"
                    onClick={e => { e.stopPropagation(); handleEliminar(); }}>{I.trash}</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho */}
        <div className="card">
          <div className="card-head">
            <div className="col" style={{gap:4, flex:1}}>
              <div className="row" style={{gap:6, alignItems:'center'}}>
                <h3 style={{margin:0}}>{role.nombre}</h3>
                <button className="icon-btn" title="Editar rol" style={{color:'var(--cyan)'}} onClick={abrirEditarRol}>{I.edit}</button>
              </div>
              <div className="text-muted" style={{fontSize:12}}>{role.descripcion}</div>
              <div className="row" style={{gap:8, alignItems:'center'}}>
                <div className="text-subtle" style={{fontSize:11}}>Categoría: <strong>{role.categoria || 'otro'}</strong></div>
                <div className="text-subtle" style={{fontSize:11}}>Nivel: <strong>{role.nivel_jerarquico || 'operativo'}</strong></div>
              </div>
            </div>
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
                {l:'Ver vista consolidada del grupo de sociedades', k:'ver_consolidado_grupo'},
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
                  <option value="Técnico">Técnico — Partes diarios, tareas en campo</option>
                  <option value="Vendedor">Vendedor — Pipeline, cotizaciones, comisiones</option>
                  <option value="Compras">Compras — SOLPE, órdenes, recepciones</option>
                  <option value="Supervisor">Supervisor — Aprobaciones y monitoreo</option>
                  <option value="Gerencia">Gerencia — Dashboard ejecutivo</option>
                  <option value="administrativo">Administrativo — Registro diario de horas por OT o actividad</option>
                  <option value="Empleado">Empleado - Mi espacio y solicitudes</option>
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

      {/* Modal: Nuevo rol / Editar rol */}
      {modalNuevo && <>
        <div className="side-panel-backdrop" onClick={cerrarModalNuevo}/>
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:12,padding:28,width:420,zIndex:200,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
          <h3 style={{marginBottom:20}}>{editandoRolId ? 'Editar rol' : 'Nuevo rol'}</h3>
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
                {nivelesActivos.map(n => <option key={n.codigo} value={n.codigo}>{n.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="row" style={{gap:8,marginTop:24,justifyContent:'flex-end'}}>
            <button className="btn btn-secondary" onClick={cerrarModalNuevo} disabled={guardandoRol}>Cancelar</button>
            <button className="btn btn-primary" data-local-form="true" onClick={handleNuevoRol} disabled={!nuevoNombre.trim() || guardandoRol}>{guardandoRol ? 'Guardando...' : editandoRolId ? 'Guardar cambios' : 'Crear rol'}</button>
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
  const { usuarios, setUsuarios, addNotificacion, empresa, empresasPlataforma, todasMembresias, crearUsuarioConAcceso, eliminarUsuario, actualizarUsuarioAcceso, asignarPasswordTemporal, roles: rolesCtx, accessDebug, navigate, authUser, sociedadesIdsAlcance, personalAdmin = [], personalOperativo = [], posiciones = [], posicionesUsuarios = [], unidadesOrganizacionales = [], cargos = [], crearPosicion, nivelesJerarquicos = [] } = useApp();
  const [resetting, setResetting] = useState(null);
  const [tempPass, setTempPass] = useState('');
  const [resetError, setResetError] = useState('');
  const [guardandoReset, setGuardandoReset] = useState(false);
  const generarPasswordTemporal = () => Math.random().toString(36).slice(-8) + '!';
  const abrirAsignarPassword = (u) => {
    setResetError('');
    setTempPass(generarPasswordTemporal());
    setResetting(u);
  };
  const [creando, setCreando] = useState(false);
  const alcanceFormInicial = { alcance_tipo: 'grupo', alcance_modo: 'todas', sociedades_ids: [] };
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', email: '', rol: 'vendedor', jefe_user_id: '', posicion_id: '', password: '', asignaciones: [], ...alcanceFormInicial, campo: false, campoModulos: [] });
  const [mostrarPasswordNuevo, setMostrarPasswordNuevo] = useState(false);
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [nuevoError, setNuevoError] = useState('');
  const [editando, setEditando] = useState(null);
  const [fichaUsuario, setFichaUsuario] = useState({ loading: false, error: '', tieneFicha: false, tieneTurno: false, ficha: null, tipo: null });
  const mobileModuleOptions = [
    { id: 'tecnico', label: 'Tecnico' },
    { id: 'logistica', label: 'Logistica' },
    { id: 'vendedor', label: 'Vendedor' },
    { id: 'compras', label: 'Compras' },
    { id: 'supervisor', label: 'Supervisor' },
    { id: 'gerencia', label: 'Gerencia' },
    { id: 'asistencia', label: 'Control de asistencia' },
    { id: 'mi_espacio', label: 'Mi espacio' },
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
  const modulosTransaccionales = new Set(['tecnico', 'asistencia', 'administrativo', 'compras']);
  const esRolAdminODireccion = (rolId) => {
    const rol = rolesCtx?.[rolId] || MOCK.roles?.[rolId] || {};
    return Boolean(rol.es_admin_empresa || ['direccion', 'jefatura'].includes(String(rol.nivel_jerarquico || '').toLowerCase()));
  };
  const estadoFichaDesdeListas = (email, userId) => {
    const normalized = normalizarEmail(email);
    const activo = p => !['inactivo', 'cesado', 'suspendido'].includes(String(p.estado || '').toLowerCase());
    const match = p => activo(p) && ((userId && p.auth_user_id === userId) || (normalized && normalizarEmail(p.email) === normalized));
    const operativo = (personalOperativo || []).find(match);
    if (operativo) return { tieneFicha: true, tieneTurno: Boolean(operativo.turno_id), ficha: operativo, tipo: 'operativo' };
    const administrativo = (personalAdmin || []).find(match);
    if (administrativo) return { tieneFicha: true, tieneTurno: Boolean(administrativo.turno_id), ficha: administrativo, tipo: 'administrativo' };
    return { tieneFicha: false, tieneTurno: false, ficha: null, tipo: null };
  };
  const consultarFichaUsuario = async ({ email, empresaId, userId }) => {
    const fallback = estadoFichaDesdeListas(email, userId);
    if ((!email && !userId) || !empresaId) {
      setFichaUsuario({ loading: false, error: '', ...fallback });
      return;
    }
    setFichaUsuario({ loading: true, error: '', ...fallback });
    try {
      const supabase = await getSupabaseClient();
      const selectColsOp = 'id,nombre,email,turno_id,estado,auth_user_id';
      const selectColsAdm = 'id,nombre,email,turno_id,estado,auth_user_id';
      
      const queries = [];
      
      if (userId) {
        queries.push(supabase.from('personal_operativo').select(selectColsOp).eq('empresa_id', empresaId).eq('auth_user_id', userId).limit(1));
        queries.push(supabase.from('personal_administrativo').select(selectColsAdm).eq('empresa_id', empresaId).eq('auth_user_id', userId).limit(1));
      } else {
        queries.push(Promise.resolve({ data: [] }));
        queries.push(Promise.resolve({ data: [] }));
      }
      
      if (email) {
        queries.push(supabase.from('personal_operativo').select(selectColsOp).eq('empresa_id', empresaId).ilike('email', email).limit(1));
        queries.push(supabase.from('personal_administrativo').select(selectColsAdm).eq('empresa_id', empresaId).ilike('email', email).limit(1));
      } else {
        queries.push(Promise.resolve({ data: [] }));
        queries.push(Promise.resolve({ data: [] }));
      }

      const [opUser, admUser, opEmail, admEmail] = await Promise.all(queries);
      
      if (opUser.error) throw opUser.error;
      if (admUser.error) throw admUser.error;
      if (opEmail.error) throw opEmail.error;
      if (admEmail.error) throw admEmail.error;
      
      const opData = [...(opUser.data || []), ...(opEmail.data || [])];
      const admData = [...(admUser.data || []), ...(admEmail.data || [])];
      
      const activo = row => row && !['inactivo', 'cesado', 'suspendido'].includes(String(row.estado || '').toLowerCase());
      const findBestMatch = (data) => data.find(r => activo(r) && r.auth_user_id === userId) || data.find(activo);
      
      const operativo = findBestMatch(opData);
      const administrativo = findBestMatch(admData);
      const ficha = operativo || administrativo || null;
      
      setFichaUsuario({
        loading: false,
        error: '',
        tieneFicha: Boolean(ficha),
        tieneTurno: Boolean(ficha?.turno_id),
        ficha,
        tipo: operativo ? 'operativo' : administrativo ? 'administrativo' : null,
      });
    } catch (error) {
      setFichaUsuario({ loading: false, error: error?.message || 'No se pudo verificar la ficha RRHH.', ...fallback });
    }
  };
  const getRestriccionModulo = (modId) => {
    const esAdminODireccion = esRolAdminODireccion(editForm.rol);
    if (!modulosTransaccionales.has(modId) || esAdminODireccion) return { disabled: false, tooltip: '' };
    if (!fichaUsuario.tieneFicha) {
      return {
        disabled: true,
        tooltip: 'Requiere ficha de colaborador en RRHH. Crea primero la ficha en Personal Operativo o Personal Administrativo.',
      };
    }
    if (modId === 'asistencia' && !fichaUsuario.tieneTurno) {
      return {
        disabled: true,
        tooltip: 'La ficha existe pero no tiene turno asignado. Asigna un turno en la ficha del colaborador.',
      };
    }
    return { disabled: false, tooltip: '' };
  };
  const [editForm, setEditForm] = useState({ nombre: '', email: '', rol: '', jefe_user_id: '', posicion_id: '', asignaciones: [], ...alcanceFormInicial, campo: false, campoModulos: [], estado: 'Activo' });
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [sociedadesGestion, setSociedadesGestion] = useState([]);
  const [sociedadesGestionError, setSociedadesGestionError] = useState('');
  const [alcanceInicialEdit, setAlcanceInicialEdit] = useState(null);
  const [confirmacionAlcance, setConfirmacionAlcance] = useState(null);
  const [filtroTenant, setFiltroTenant] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const normalizarEmail = (value) => String(value || '').trim().toLowerCase();
  const nuevoEmailNormalizado = normalizarEmail(nuevoForm.email);
  const nuevoEmailExistente = Boolean(nuevoEmailNormalizado) && usuarios.some(u => normalizarEmail(u.email) === nuevoEmailNormalizado);

  useEffect(() => {
    let mounted = true;
    if (!empresa?.multisociedad_habilitado || !empresa?.id) {
      setSociedadesGestion([]);
      setSociedadesGestionError('');
      return () => { mounted = false; };
    }
    listarSociedadesAdministracion(empresa.id)
      .then(rows => {
        if (!mounted) return;
        setSociedadesGestion(rows || []);
        setSociedadesGestionError('');
      })
      .catch(error => {
        if (!mounted) return;
        setSociedadesGestion([]);
        setSociedadesGestionError(error?.message || 'No se pudieron cargar las sociedades.');
      });
    return () => { mounted = false; };
  }, [empresa?.id, empresa?.multisociedad_habilitado]);

  const resolverAlcanceEfectivoUsuario = (asignaciones = []) => {
    const activas = asignaciones.filter(item => item?.activo !== false);
    const grupos = activas.filter(item => item.alcance_tipo === 'grupo');
    if (grupos.length) {
      if (grupos.some(item => item.sociedades_ids == null)) return null;
      return [...new Set(grupos.flatMap(item => item.sociedades_ids || []).filter(Boolean))];
    }
    const sociedades = activas.filter(item => item.alcance_tipo === 'sociedad');
    if (sociedades.length) {
      return [...new Set(sociedades.flatMap(item => item.sociedades_ids || []).filter(Boolean))];
    }
    return null;
  };

  const normalizarAlcanceForm = (form) => {
    if (!empresa?.multisociedad_habilitado) return {};
    const ids = [...new Set((form.sociedades_ids || []).filter(Boolean))];
    if (form.alcance_modo === 'especificas' && ids.length === 0) {
      throw new Error('Selecciona al menos una sociedad para usar un alcance especifico.');
    }
    if (form.alcance_modo === 'todas') {
      return {
        alcance_tipo: 'grupo',
        sociedades_ids: Array.isArray(sociedadesIdsAlcance) ? [...sociedadesIdsAlcance] : null,
      };
    }
    return { alcance_tipo: 'grupo', sociedades_ids: ids };
  };

  const sociedadesParaComparar = () => [...new Set(sociedadesGestion.map(item => item.id).filter(Boolean))];
  const calcularCambioAlcance = (anterior, siguiente) => {
    const universo = sociedadesParaComparar();
    const antes = anterior == null ? universo : anterior;
    const despues = siguiente == null ? universo : siguiente;
    const antesSet = new Set(antes);
    const despuesSet = new Set(despues);
    return {
      conserva: universo.filter(id => antesSet.has(id) && despuesSet.has(id)),
      pierde: universo.filter(id => antesSet.has(id) && !despuesSet.has(id)),
      gana: universo.filter(id => !antesSet.has(id) && despuesSet.has(id)),
      reduce: anterior == null ? siguiente != null : anterior.some(id => !despuesSet.has(id)),
    };
  };

  const nombreSociedad = (id) => {
    const sociedad = sociedadesGestion.find(item => item.id === id);
    return sociedad ? `${sociedad.nombre}${sociedad.activa === false ? ' (inactiva)' : ''}` : `${id} (no disponible)`;
  };

  const handleReset = async () => {
    if (!resetting) return;
    setResetError('');
    if (tempPass.length < 6) {
      setResetError('La contraseña temporal debe tener al menos 6 caracteres.');
      return;
    }
    setGuardandoReset(true);
    try {
      await asignarPasswordTemporal(resetting.id, tempPass);
      addNotificacion(`Contraseña temporal asignada a ${resetting.nombre}. Deberá cambiarla en su próximo inicio de sesión.`);
      setResetting(null);
    } catch (error) {
      setResetError(error?.message || 'No se pudo asignar la contraseña temporal.');
    }
    setGuardandoReset(false);
  };

  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    setNuevoError('');
    setGuardandoNuevo(true);
    try {
      const alcance = normalizarAlcanceForm(nuevoForm);
      const { alcance_tipo: _alcanceTipo, alcance_modo: _alcanceModo, sociedades_ids: _sociedadesIds, ...datosUsuario } = nuevoForm;
      await crearUsuarioConAcceso({ ...datosUsuario, ...alcance });
      setCreando(false);
      setMostrarPasswordNuevo(false);
      setNuevoForm({ nombre: '', email: '', rol: 'vendedor', jefe_user_id: '', posicion_id: '', password: '', asignaciones: [], ...alcanceFormInicial, campo: false, campoModulos: [] });
    } catch (error) {
      const message = error?.message || 'No se pudo crear el usuario.';
      if (normalizarEmail(message).includes('contrasena temporal es obligatoria')) {
        setMostrarPasswordNuevo(true);
        setNuevoError('Este email no existe todavia. Ingresa una contrasena temporal para crear la cuenta.');
      } else {
        setNuevoError(message);
      }
    }
    setGuardandoNuevo(false);
  };

  const abrirEditarUsuario = (usuario) => {
    const alcanceEfectivo = resolverAlcanceEfectivoUsuario(usuario.asignaciones || []);
    setEditError('');
    setConfirmacionAlcance(null);
    setEditando(usuario);
    setAlcanceInicialEdit(alcanceEfectivo == null ? null : [...alcanceEfectivo]);
    setFichaUsuario({ loading: true, error: '', ...estadoFichaDesdeListas(usuario.email) });
    setEditForm({
      nombre: usuario.nombre || '',
      email: usuario.email || '',
      rol: usuario.rol || '',
      jefe_user_id: usuario.jefe_user_id || '',
      posicion_id: getPrimaryPosicion(usuario)?.posicion_id || '',
      alcance_tipo: 'grupo',
      alcance_modo: alcanceEfectivo == null ? 'todas' : 'especificas',
      sociedades_ids: alcanceEfectivo == null ? [] : alcanceEfectivo,
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
    consultarFichaUsuario({ email: usuario.email || '', empresaId: usuario.empresa_id || empresa?.id, userId: usuario.id });
  };

  const guardarEdicionUsuario = async (alcance) => {
    if (!editando) return;
    setEditError('');
    setGuardandoEdit(true);
    try {
      const campoModulos = editForm.campo
        ? editForm.campoModulos.filter(mod => !getRestriccionModulo(mod).disabled)
        : [];
      const { alcance_tipo: _alcanceTipo, alcance_modo: _alcanceModo, sociedades_ids: _sociedadesIds, ...datosUsuario } = editForm;
      await actualizarUsuarioAcceso(editando.id, {
        ...datosUsuario,
        ...alcance,
        empresa_id: editando.empresa_id,
        campoModulos,
      });
      setEditando(null);
      setConfirmacionAlcance(null);
    } catch (error) {
      setEditError(error?.message || 'No se pudo actualizar el usuario.');
    } finally {
      setGuardandoEdit(false);
    }
  };

  const handleEditarUsuario = async (e) => {
    e.preventDefault();
    if (!editando) return;
    setEditError('');
    let alcance;
    try {
      alcance = normalizarAlcanceForm(editForm);
    } catch (error) {
      setEditError(error?.message || 'El alcance societario no es valido.');
      return;
    }
    const cambio = empresa?.multisociedad_habilitado
      ? calcularCambioAlcance(alcanceInicialEdit, alcance.sociedades_ids)
      : { reduce: false, conserva: [], pierde: [], gana: [] };
    if (cambio.reduce) {
      setConfirmacionAlcance({ alcance, ...cambio });
      return;
    }
    await guardarEdicionUsuario(alcance);
  };

  useEffect(() => {
    if (!editando) return;
    const handle = setTimeout(() => {
      consultarFichaUsuario({ email: editForm.email || '', empresaId: editando.empresa_id || empresa?.id, userId: editando.id });
    }, 250);
    return () => clearTimeout(handle);
  }, [editando?.id, editForm.email, editando?.empresa_id, empresa?.id]);

  const rolPerteneceTenant = (r) => {
    if (!empresa?.id) return true;
    if (empresa.es_plataforma) return !r.empresa_id || r.empresa_id === empresa.id;
    return r.empresa_id === empresa.id;
  };
  const rolesOpciones = Object.entries(rolesCtx || {}).filter(([,r]) => !r.es_superadmin && rolPerteneceTenant(r));
  const rolesEditOpciones = Object.entries(rolesCtx || {}).filter(([id, r]) => (
    (!r.es_superadmin && rolPerteneceTenant(r)) || id === editando?.rol
  ));
  const getOptionLabel = (items, value) => items.find(x => x.value === value)?.label || value || '-';
  const getRoleMeta = (rolId) => {
    const r = rolesCtx?.[rolId] || MOCK.roles?.[rolId] || {};
    const categoria = r.categoria || 'otro';
    const nivel = r.nivel_jerarquico || 'operativo';
    return {
      categoria,
      nivel,
      categoriaLabel: getOptionLabel(ROLE_CATEGORIES, categoria),
      nivelLabel: nivelesJerarquicos.find(x => x.codigo === nivel)?.nombre || nivel,
    };
  };
  const roleOptionText = (r) => {
    const meta = getRoleMeta(r.id || r.key);
    return `${r.nombre} · ${meta.categoriaLabel} · ${meta.nivelLabel}`;
  };
  const nuevoRoleMeta = getRoleMeta(nuevoForm.rol);
  const editRoleMeta = getRoleMeta(editForm.rol);
  const crearAsignacionVacia = () => ({
    rol_id: rolesOpciones[0]?.[0] || '',
    posicion_id: '',
  });
  const actualizarAsignacion = (items, index, patch) => items.map((item, i) => (
    i === index ? { ...item, ...patch } : item
  ));
  const renderAsignacionesAvanzadas = ({ items, setItems }) => (
    <details style={{border:'1px solid var(--border)', borderRadius:8, padding:12}}>
      <summary style={{cursor:'pointer', fontWeight:700, fontSize:13}}>Asignaciones adicionales opcionales</summary>
      <div className="text-muted" style={{fontSize:12, margin:'8px 0 12px'}}>
        Usalo solo si una persona trabaja en mas de un area, proyecto, sede o centro de costo. El rol principal de arriba sigue siendo suficiente para la mayoria de usuarios.
      </div>
      <div className="col" style={{gap:10}}>
        {items.map((asig, index) => {
          const meta = getRoleMeta(asig.rol_id);
          return (
            <div key={index} style={{border:'1px solid var(--border)', borderRadius:8, padding:10}}>
              <div className="grid-2" style={{gap:10}}>
                <div className="input-group">
                  <label>Rol adicional</label>
                  <select className="input" value={asig.rol_id} onChange={e => setItems(actualizarAsignacion(items, index, { rol_id: e.target.value }))}>
                    {rolesOpciones.map(([id, r]) => <option key={id} value={id}>{roleOptionText({ ...r, id })}</option>)}
                  </select>
                </div>
                <PosicionSelector
                  label="Posicion adicional"
                  value={asig.posicion_id}
                  onChange={posicionId => setItems(actualizarAsignacion(items, index, { posicion_id: posicionId }))}
                  posiciones={posiciones}
                  posicionesUsuarios={posicionesUsuarios}
                  unidadesOrganizacionales={unidadesOrganizacionales}
                  cargos={cargos}
                  usuarios={usuarios}
                  onCrearPosicion={crearPosicion}
                  currentUserId={editando?.id}
                />
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

  const renderAlcanceSocietario = ({ form, setForm, esEdicion = false }) => {
    if (!empresa?.multisociedad_habilitado) return null;
    const conocidas = new Set(sociedadesGestion.map(item => item.id));
    const faltantes = (form.sociedades_ids || [])
      .filter(id => !conocidas.has(id))
      .map(id => ({ id, nombre: id, activa: false, noDisponible: true }));
    const opciones = [...sociedadesGestion, ...faltantes];
    const siguientePreview = form.alcance_modo === 'todas'
      ? (Array.isArray(sociedadesIdsAlcance) ? sociedadesIdsAlcance : null)
      : (form.sociedades_ids || []);
    const cambioPreview = esEdicion
      ? calcularCambioAlcance(alcanceInicialEdit, siguientePreview)
      : null;
    return (
      <div className="input-group" data-alcance-societario="true">
        <label>Acceso a sociedades</label>
        <div className="col" style={{gap:8}}>
          <label className="row" style={{gap:8, fontSize:13, padding:'9px 10px', border:'1px solid var(--border)', borderRadius:8}}>
            <input
              type="radio"
              name={`alcance-societario-${editando ? 'edit' : 'new'}`}
              checked={form.alcance_modo === 'todas'}
              onChange={() => setForm(prev => ({ ...prev, alcance_tipo:'grupo', alcance_modo:'todas' }))}
            />
            <span><strong>Todas las sociedades</strong><br/><span className="text-muted" style={{fontSize:11}}>Acceso al grupo completo que el administrador puede conceder.</span></span>
          </label>
          <label className="row" style={{gap:8, fontSize:13, padding:'9px 10px', border:'1px solid var(--border)', borderRadius:8}}>
            <input
              type="radio"
              name={`alcance-societario-${editando ? 'edit' : 'new'}`}
              checked={form.alcance_modo === 'especificas'}
              onChange={() => setForm(prev => ({ ...prev, alcance_tipo:'grupo', alcance_modo:'especificas' }))}
            />
            <span><strong>Sociedades especificas</strong><br/><span className="text-muted" style={{fontSize:11}}>Solo las sociedades seleccionadas.</span></span>
          </label>
          {form.alcance_modo === 'especificas' && (
            <div className="col" style={{gap:6, padding:'4px 2px'}}>
              {sociedadesGestionError && <div className="alert alert-danger" style={{margin:0}}>{sociedadesGestionError}</div>}
              {!sociedadesGestionError && opciones.length === 0 && <div className="text-muted" style={{fontSize:12}}>No hay sociedades disponibles para asignar.</div>}
              {opciones.map(sociedad => {
                const checked = (form.sociedades_ids || []).includes(sociedad.id);
                return (
                  <label key={sociedad.id} className="row" style={{gap:8, fontSize:13, padding:'7px 9px', border:'1px solid var(--border)', borderRadius:7}}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={checked}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        sociedades_ids: e.target.checked
                          ? [...new Set([...(prev.sociedades_ids || []), sociedad.id])]
                          : (prev.sociedades_ids || []).filter(id => id !== sociedad.id),
                      }))}
                    />
                    <span style={{flex:1}}>{sociedad.codigo ? `${sociedad.codigo} - ` : ''}{sociedad.nombre}</span>
                    {sociedad.activa === false && <span className="badge badge-gray">Inactiva</span>}
                    {sociedad.noDisponible && <span className="badge badge-orange">No disponible</span>}
                  </label>
                );
              })}
            </div>
          )}
          <div className="alert alert-warning" style={{margin:0, fontSize:12}}>
            Al reducir este acceso, el usuario deja de ver y operar inmediatamente los registros de las sociedades excluidas en todas las pantallas protegidas.
          </div>
          {cambioPreview && (
            <div style={{border:'1px solid var(--border)', borderRadius:8, padding:10, fontSize:12}}>
              <strong>Resumen del cambio</strong>
              <div className="col" style={{gap:5, marginTop:7}}>
                <div><span className="text-muted">Conserva:</span> {cambioPreview.conserva.length ? cambioPreview.conserva.map(nombreSociedad).join(', ') : 'ninguna'}</div>
                <div><span className="text-muted">Pierde:</span> {cambioPreview.pierde.length ? cambioPreview.pierde.map(nombreSociedad).join(', ') : 'ninguna'}</div>
                <div><span className="text-muted">Gana:</span> {cambioPreview.gana.length ? cambioPreview.gana.map(nombreSociedad).join(', ') : 'ninguna'}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!rolesOpciones.length) return;
    if (rolesOpciones.some(([id]) => id === nuevoForm.rol)) return;
    setNuevoForm(p => ({ ...p, rol: rolesOpciones[0][0] }));
  }, [rolesOpciones, nuevoForm.rol]);

  useEffect(() => {
    if (!nuevoEmailExistente) return;
    if (mostrarPasswordNuevo) setMostrarPasswordNuevo(false);
    if (nuevoForm.password) setNuevoForm(p => ({ ...p, password: '' }));
  }, [nuevoEmailExistente, nuevoForm.password, mostrarPasswordNuevo]);

  const getEmpresa = (id) => {
    if (empresa?.id === id) return empresa.nombre;
    const found = (empresasPlataforma || []).find(e => e.id === id);
    if (found) return found.nombre;
    const mem = (todasMembresias || []).find(m => m.empresa_id === id);
    const memNombre = mem?.empresa?.nombre_comercial || mem?.empresa?.razon_social || mem?.empresa?.nombre;
    return memNombre || MOCK.empresas.find(e => e.id === id)?.nombre || 'Tenant asignado';
  };
  
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Usuarios</h1><div className="page-sub">{usuarios.length} usuarios · Acceso centralizado</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => { setMostrarPasswordNuevo(false); setCreando(true); }}>{I.plus} Nuevo usuario</button>
      </div>
      <div className="alert alert-info" style={{marginBottom:16, fontSize:13}}>
        Los usuarios del sistema son colaboradores con acceso activo al ERP. Para gestionar la ficha laboral de un colaborador sin acceso al sistema, ir a <strong>RRHH → Personal Operativo</strong> o <strong>Personal Administrativo</strong>.
      </div>
      {(accessDebug?.usuariosLoading || accessDebug?.usuariosError || accessDebug?.usuariosLoadedAt) && (
        <div className={accessDebug?.usuariosError ? 'alert alert-danger' : 'alert alert-info'} style={{marginBottom:16}}>
          {accessDebug?.usuariosLoading
            ? 'Cargando usuarios del tenant...'
            : accessDebug?.usuariosError
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
                  <td>{u.campo?<span className="badge badge-cyan">{I.mobile}{getCampoModulos(u).map(m => m === 'solicitudes' ? 'Solicitudes' : (mobileModuleOptions.find(x => x.id === m)?.label || m)).join(', ')}</span>:<span className="text-subtle">—</span>}</td>
                  <td><span className="badge badge-green">{u.estado}</span></td>
                  <td className="text-muted">{u.ultimo || 'Nuevo'}</td>
                  <td style={{textAlign:'right'}}>
                    <div style={{display:'flex', gap:4, justifyContent:'flex-end'}}>
                      <button className="btn btn-ghost btn-sm" title="Editar usuario" onClick={() => abrirEditarUsuario(u)}>
                        <span style={{width:16,height:16,display:'inline-flex'}}>{I.edit}</span>
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Asignar contraseña temporal" onClick={() => abrirAsignarPassword(u)}>
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
                Estás asignando una clave de acceso manual para <strong>{resetting.nombre}</strong>. Podrá ingresar con esta contraseña y el sistema le pedirá cambiarla en su próximo inicio de sesión.
              </p>
              {resetError && <div className="alert alert-danger">{resetError}</div>}
              <div className="input-group">
                <label>Contraseña Temporal</label>
                <div style={{display:'flex', gap:8}}>
                  <input className="input" type="text" value={tempPass} onChange={e => setTempPass(e.target.value)} />
                  <button className="btn btn-secondary" onClick={() => setTempPass(generarPasswordTemporal())}>Generar</button>
                </div>
              </div>
              <div className="modal-foot mt-4">
                <button className="btn btn-secondary" onClick={() => setResetting(null)} disabled={guardandoReset}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleReset} disabled={guardandoReset}>{guardandoReset ? 'Guardando...' : 'Guardar y Notificar'}</button>
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
              <PosicionSelector
                value={editForm.posicion_id}
                onChange={posicionId => setEditForm(p => ({...p, posicion_id: posicionId}))}
                posiciones={posiciones}
                posicionesUsuarios={posicionesUsuarios}
                unidadesOrganizacionales={unidadesOrganizacionales}
                cargos={cargos}
                usuarios={usuarios}
                onCrearPosicion={crearPosicion}
                currentUserId={editando?.id}
              />
              {renderAlcanceSocietario({ form: editForm, setForm: setEditForm, esEdicion: true })}
              {renderAsignacionesAvanzadas({
                items: editForm.asignaciones,
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
                    {mobileModuleOptions.map(mod => {
                      const restriccion = getRestriccionModulo(mod.id);
                      const checked = editForm.campoModulos.includes(mod.id) && !restriccion.disabled;
                      return (
                      <label
                        key={mod.id}
                        className="row"
                        title={restriccion.tooltip}
                        style={{
                          gap:8,
                          fontSize:13,
                          padding:'8px 10px',
                          border:'1px solid var(--border)',
                          borderRadius:8,
                          opacity: restriccion.disabled ? 0.55 : 1,
                          cursor: restriccion.disabled ? 'not-allowed' : 'pointer',
                          background: restriccion.disabled ? 'var(--bg-subtle)' : undefined,
                        }}
                      >
                        <input
                          type="checkbox"
                          className="checkbox"
                          disabled={restriccion.disabled}
                          checked={checked}
                          onChange={e => setEditForm(p => ({
                            ...p,
                            campoModulos: e.target.checked
                              ? [...new Set([...p.campoModulos, mod.id])]
                              : p.campoModulos.filter(x => x !== mod.id)
                          }))}
                        />
                        {mod.label}
                      </label>
                    )})}
                  </div>
                  {editForm.campoModulos.includes('mi_espacio') && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Mi espacio incluye automáticamente Solicitudes, sin necesidad de marcarlo por separado.</div>}
                  {fichaUsuario.loading && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Verificando ficha RRHH por email...</div>}
                  {fichaUsuario.error && <div className="text-muted" style={{fontSize:12, marginTop:6, color: 'var(--danger)'}}>Error consultando ficha: {fichaUsuario.error}</div>}
                  {!fichaUsuario.loading && !esRolAdminODireccion(editForm.rol) && !fichaUsuario.tieneFicha && (
                    <div className="alert alert-warning" style={{marginTop:10}}>
                      <div className="row" style={{alignItems:'flex-start', gap:8}}>
                        <span style={{width:18, height:18, display:'inline-flex', color:'var(--orange)', flex:'0 0 auto'}}>{I.alert}</span>
                        <div style={{fontSize:13}}>
                          Este usuario no tiene ficha de colaborador en RRHH. Los modulos de registro (asistencia, tecnico, administrativo, comprador) estan deshabilitados hasta que se cree la ficha.
                          <div className="row" style={{gap:8, marginTop:10, flexWrap:'wrap'}}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditando(null); navigate('rrhh_operativo', { action: 'new', email: editForm.email }); }}>Crear ficha en Personal Operativo</button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditando(null); navigate('rrhh_admin', { action: 'new', email: editForm.email }); }}>Crear ficha en Personal Administrativo</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {!fichaUsuario.loading && !esRolAdminODireccion(editForm.rol) && fichaUsuario.tieneFicha && !fichaUsuario.tieneTurno && (
                    <div className="alert alert-warning" style={{marginTop:10}}>
                      <div className="row" style={{alignItems:'flex-start', gap:8}}>
                        <span style={{width:18, height:18, display:'inline-flex', color:'var(--orange)', flex:'0 0 auto'}}>{I.alert}</span>
                        <div style={{fontSize:13}}>
                          La ficha de este colaborador no tiene turno asignado. El modulo de asistencia requiere turno para calcular tardanzas y horas extra.
                          <div style={{marginTop:10}}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditando(null); navigate(fichaUsuario.tipo === 'administrativo' ? 'rrhh_admin' : 'rrhh_operativo', { detail: fichaUsuario.ficha?.id, email: editForm.email }); }}>Ir a la ficha para asignar turno</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
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

      {editando && confirmacionAlcance && (
        <div className="modal-backdrop" style={{zIndex:1200}}>
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-head">
              <h2>Confirmar reduccion de acceso</h2>
              <button className="icon-btn" onClick={() => setConfirmacionAlcance(null)}>{I.x}</button>
            </div>
            <div className="modal-body col" style={{gap:14}}>
              <div className="alert alert-warning" style={{margin:0}}>
                Esta modificacion restringira inmediatamente el acceso de <strong>{editando.nombre}</strong> en las politicas societarias del sistema.
              </div>
              {editando.id === authUser?.id && (
                <div className="alert alert-danger" style={{margin:0}}>
                  Estas modificando tu propio alcance. Al confirmar, puedes perder acceso inmediato a informacion y operaciones que administras actualmente.
                </div>
              )}
              <div className="grid-3" style={{gap:10}}>
                {[
                  ['Conserva', confirmacionAlcance.conserva, 'badge-green'],
                  ['Pierde', confirmacionAlcance.pierde, 'badge-red'],
                  ['Gana', confirmacionAlcance.gana, 'badge-cyan'],
                ].map(([titulo, ids, badgeClass]) => (
                  <div key={titulo} style={{border:'1px solid var(--border)', borderRadius:8, padding:10}}>
                    <div style={{fontWeight:700, fontSize:12, marginBottom:7}}>{titulo}</div>
                    <div className="col" style={{gap:5}}>
                      {ids.length === 0
                        ? <span className="text-muted" style={{fontSize:11}}>Ninguna</span>
                        : ids.map(id => <span key={id} className={`badge ${badgeClass}`} style={{whiteSpace:'normal'}}>{nombreSociedad(id)}</span>)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmacionAlcance(null)} disabled={guardandoEdit}>Volver</button>
                <button type="button" className="btn btn-danger" onClick={() => guardarEdicionUsuario(confirmacionAlcance.alcance)} disabled={guardandoEdit}>
                  {guardandoEdit ? 'Guardando...' : 'Confirmar y restringir acceso'}
                </button>
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
              <button className="icon-btn" onClick={() => { setMostrarPasswordNuevo(false); setCreando(false); }}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:14}} onSubmit={handleCrearUsuario}>
              <p style={{fontSize:13, color:'var(--fg-muted)'}}>
                {nuevoEmailExistente
                  ? 'Este email ya tiene cuenta de acceso. Se agregara al tenant y conservara su contrasena actual.'
                  : 'Si el email ya existe, se conservara su contrasena actual. Para cuentas nuevas, define una contrasena temporal.'}
              </p>
              {nuevoError && <div className="alert alert-danger">{nuevoError}</div>}
              <div className="input-group">
                <label>Nombre completo</label>
                <input className="input" required value={nuevoForm.nombre} onChange={e => setNuevoForm(p => ({...p, nombre: e.target.value}))} />
              </div>
              <div className="input-group">
                <label>Email</label>
                <input
                  className="input"
                  type="email"
                  required
                  value={nuevoForm.email}
                  onChange={e => {
                    setMostrarPasswordNuevo(false);
                    setNuevoForm(p => ({...p, email: e.target.value, password: ''}));
                  }}
                />
              </div>
              {!nuevoEmailExistente && mostrarPasswordNuevo && (
                <div className="input-group">
                  <label>Contraseña temporal <span className="text-muted">(solo cuentas nuevas)</span></label>
                  <div style={{display:'flex', gap:8}}>
                    <input
                      className="input"
                      minLength={6}
                      placeholder="Minimo 6 caracteres"
                      value={nuevoForm.password}
                      onChange={e => setNuevoForm(p => ({...p, password: e.target.value}))}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setNuevoForm(p => ({...p, password: Math.random().toString(36).slice(-8) + '!'}))}
                    >
                      Generar
                    </button>
                  </div>
                </div>
              )}
              {!nuevoEmailExistente && !mostrarPasswordNuevo && (
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarPasswordNuevo(true)}>
                  Definir contrasena temporal
                </button>
              )}
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
              <PosicionSelector
                value={nuevoForm.posicion_id}
                onChange={posicionId => setNuevoForm(p => ({...p, posicion_id: posicionId}))}
                posiciones={posiciones}
                posicionesUsuarios={posicionesUsuarios}
                unidadesOrganizacionales={unidadesOrganizacionales}
                cargos={cargos}
                usuarios={usuarios}
                onCrearPosicion={crearPosicion}
              />
              {renderAlcanceSocietario({ form: nuevoForm, setForm: setNuevoForm })}
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
                  {nuevoForm.campoModulos.includes('mi_espacio') && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Mi espacio incluye automáticamente Solicitudes, sin necesidad de marcarlo por separado.</div>}
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
  const { empresasPlataforma = MOCK.empresas, usuarios = [], crearTenantConAdmin, actualizarTenant, eliminarTenant, addNotificacion } = useApp();
  const tenants = empresasPlataforma.length ? empresasPlataforma : MOCK.empresas;
  const activos = tenants.filter(t => ['activa', 'activo'].includes(String(t.estado || '').toLowerCase())).length;
  const demos = tenants.filter(t => String(t.estado || '').toLowerCase() === 'demo').length;
  const paises = new Set(tenants.map(t => t.pais || 'PE')).size;

  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [creando, setCreando] = useState(false);
  const [formNuevo, setFormNuevo] = useState({
    nombre_grupo: '', pais: 'PE', moneda_base: 'PEN', estado: 'activa',
    admin_email: '', admin_nombre: '',
    sociedad: { razon_social: '', nombre: '', ruc: '', codigo: '', direccion_fiscal: '' },
  });

  const abrirEditar = (t) => {
    setForm({
      razon_social: t.razon_social || t.nombre || '',
      nombre_comercial: t.nombre_comercial || '',
      ruc: t.ruc || '',
      pais: t.pais || 'PE',
      moneda_base: t.moneda_base || t.moneda || 'PEN',
      estado: t.estado || 'activa',
      multisociedad_habilitado: Boolean(t.multisociedad_habilitado),
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

  const crearNuevo = async () => {
    const sociedad = formNuevo.sociedad || {};
    if (!formNuevo.nombre_grupo?.trim()
      || !sociedad.razon_social?.trim()
      || !sociedad.nombre?.trim()
      || !sociedad.ruc?.trim()) return;
    setSaving(true);
    try {
      await crearTenantConAdmin(formNuevo);
      setCreando(false);
      setFormNuevo({
        nombre_grupo: '', pais: 'PE', moneda_base: 'PEN', estado: 'activa',
        admin_email: '', admin_nombre: '',
        sociedad: { razon_social: '', nombre: '', ruc: '', codigo: '', direccion_fiscal: '' },
      });
    } catch (e) {
      addNotificacion(`Error al crear tenant: ${e.message}`);
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
        <div className="row"><button className="btn btn-secondary">{I.download} Reporte plataforma</button><button className="btn btn-primary" onClick={() => setCreando(true)}>{I.plus} Nuevo grupo</button></div>
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
              <label>{form.multisociedad_habilitado ? 'Nombre del grupo *' : 'Razón Social *'}</label>
              <input className="input" value={form.razon_social} onChange={e => setForm(f => ({...f, razon_social: e.target.value}))} placeholder={form.multisociedad_habilitado ? 'Nombre del grupo' : 'Razón Social'} autoFocus/>
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
            <label style={{display:'flex',gap:10,alignItems:'flex-start',padding:'10px 12px',border:'1px solid var(--border)',borderRadius:8}}>
              <input
                type="checkbox"
                checked={Boolean(form.multisociedad_habilitado)}
                disabled={Boolean(editando?.multisociedad_habilitado)}
                onChange={e => setForm(f => ({ ...f, multisociedad_habilitado: e.target.checked }))}
                style={{marginTop:2}}
              />
              <span>
                <strong style={{display:'block',fontSize:13}}>Habilitar multisociedad</strong>
                <span className="text-muted" style={{fontSize:11}}>
                  {editando?.multisociedad_habilitado
                    ? 'Multisociedad ya está habilitada para este tenant.'
                    : 'Si no existen sociedades, se creará automáticamente la principal con los datos actuales del tenant.'}
                </span>
              </span>
            </label>
          </div>
          <div className="row" style={{gap:8, marginTop:24, justifyContent:'flex-end'}}>
            <button className="btn btn-secondary" onClick={() => setEditando(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardar} disabled={saving || !form.razon_social?.trim()}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </div>
      </>}

      {/* Modal: Nuevo grupo */}
      {creando && <>
        <div className="side-panel-backdrop" onClick={() => setCreando(false)}/>
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:12,padding:28,width:500,zIndex:200,boxShadow:'0 20px 60px rgba(0,0,0,0.2)',maxHeight:'90vh',overflowY:'auto'}}>
          <h3 style={{marginBottom:20}}>Nuevo grupo / tenant</h3>
          <div className="col" style={{gap:14}}>
            <div className="input-group">
              <label>Nombre del grupo *</label>
              <input className="input" value={formNuevo.nombre_grupo} onChange={e => setFormNuevo(f => ({...f, nombre_grupo: e.target.value}))} placeholder="Ej. Grupo DIFESMAQ" autoFocus/>
              <span className="text-muted" style={{fontSize:11}}>El código grp_ se genera automáticamente y no depende del RUC.</span>
            </div>
            <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Sociedad principal obligatoria</div>
              <div className="col" style={{gap:12}}>
                <div className="input-group">
                  <label>Razón social *</label>
                  <input className="input" value={formNuevo.sociedad.razon_social} onChange={e => setFormNuevo(f => ({ ...f, sociedad: { ...f.sociedad, razon_social: e.target.value } }))} placeholder="Razón social de la sociedad"/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div className="input-group">
                    <label>Nombre comercial *</label>
                    <input className="input" value={formNuevo.sociedad.nombre} onChange={e => setFormNuevo(f => ({ ...f, sociedad: { ...f.sociedad, nombre: e.target.value } }))} placeholder="Nombre corto"/>
                  </div>
                  <div className="input-group">
                    <label>RUC / NIT *</label>
                    <input className="input" inputMode="numeric" maxLength={11} value={formNuevo.sociedad.ruc} onChange={e => setFormNuevo(f => ({ ...f, sociedad: { ...f.sociedad, ruc: sanitizeRuc(e.target.value) } }))} placeholder="20000000000"/>
                  </div>
                </div>
                <div className="input-group">
                  <label>Código de sociedad</label>
                  <input className="input" value={formNuevo.sociedad.codigo} onChange={e => setFormNuevo(f => ({ ...f, sociedad: { ...f.sociedad, codigo: generarCodigoSociedadBase(e.target.value) } }))} placeholder="Se genera desde la razón social"/>
                </div>
                <div className="input-group">
                  <label>Dirección fiscal</label>
                  <input className="input" value={formNuevo.sociedad.direccion_fiscal} onChange={e => setFormNuevo(f => ({ ...f, sociedad: { ...f.sociedad, direccion_fiscal: e.target.value } }))} placeholder="Si se omite, se hereda de la configuración del tenant"/>
                </div>
              </div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div className="input-group">
                <label>País</label>
                <input className="input" value={formNuevo.pais} onChange={e => setFormNuevo(f => ({...f, pais: e.target.value}))} placeholder="PE"/>
              </div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div className="input-group">
                <label>Moneda</label>
                <select className="input" value={formNuevo.moneda_base} onChange={e => setFormNuevo(f => ({...f, moneda_base: e.target.value}))}>
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                  <option value="COP">COP</option>
                  <option value="CLP">CLP</option>
                </select>
              </div>
              <div className="input-group">
                <label>Estado</label>
                <select className="input" value={formNuevo.estado} onChange={e => setFormNuevo(f => ({...f, estado: e.target.value}))}>
                  <option value="activa">Activa</option>
                  <option value="demo">Demo</option>
                  <option value="suspendida">Suspendida</option>
                </select>
              </div>
            </div>
            <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
              <div style={{fontSize:12,color:'var(--fg-muted)',marginBottom:10}}>Admin inicial (opcional) — si el email ya existe en el sistema se vinculará automáticamente</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div className="input-group">
                  <label>Email admin</label>
                  <input className="input" type="email" value={formNuevo.admin_email} onChange={e => setFormNuevo(f => ({...f, admin_email: e.target.value}))} placeholder="admin@empresa.com"/>
                </div>
                <div className="input-group">
                  <label>Nombre admin</label>
                  <input className="input" value={formNuevo.admin_nombre} onChange={e => setFormNuevo(f => ({...f, admin_nombre: e.target.value}))} placeholder="Nombre completo"/>
                </div>
              </div>
            </div>
          </div>
          <div className="row" style={{gap:8, marginTop:24, justifyContent:'flex-end'}}>
            <button className="btn btn-secondary" onClick={() => setCreando(false)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={crearNuevo} disabled={saving || !formNuevo.nombre_grupo?.trim() || !formNuevo.sociedad.razon_social?.trim() || !formNuevo.sociedad.nombre?.trim() || !formNuevo.sociedad.ruc?.trim()}>{saving ? 'Creando...' : 'Crear grupo'}</button>
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
const NotaContextual = ({ children }) => <small className="text-muted" style={{ display:'block', marginTop:5, lineHeight:1.35 }}>{children}</small>;

const formatearFechaPeru = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
};

const serialExcelDesdeIso = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const fecha = new Date(Date.UTC(year, month - 1, day));
  if (fecha.getUTCFullYear() !== year || fecha.getUTCMonth() !== month - 1 || fecha.getUTCDate() !== day) return null;
  return (fecha.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
};

function SociedadCentroField({ esMultisociedad, permiteEscritura, sociedades = [], value, onChange }) {
  if (!esMultisociedad) return null;
  if (permiteEscritura) {
    const sociedad = sociedades.find(item => item.id === value);
    const texto = sociedad ? `${sociedad.codigo ? `${sociedad.codigo} — ` : ''}${sociedad.nombre}` : '';
    return <div className="input-group"><label>Sociedad</label><input className="input" value={texto} readOnly aria-readonly="true"/><NotaContextual>Este centro pertenecerá a esta persona jurídica de forma permanente y sus costos se registrarán en su contabilidad.</NotaContextual></div>;
  }
  return <><SociedadFormField value={value} onChange={onChange}/><NotaContextual>Este centro pertenecerá a esta persona jurídica de forma permanente y sus costos se registrarán en su contabilidad.</NotaContextual></>;
}

function CecoCebePanel({ onClose }) {
  const {
    centrosCosto, centrosBeneficio, cuentas, usuarios, empresa, ots, sedes, especialidades,
    perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles = [],
    crearCentroCosto, actualizarCentroCosto, eliminarCentroCosto, importarCentrosCosto,
    crearCentroBeneficio, actualizarCentroBeneficio, eliminarCentroBeneficio, importarCentrosBeneficio,
    addNotificacion
  } = useApp();

  const modoVistaSociedadCentros = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });
  const mostrarBadgeSociedadCentros = Boolean(
    empresa?.multisociedad_habilitado
    && !modoVistaSociedadCentros.permiteEscritura
    && (modoVistaSociedadCentros.sinFiltro || modoVistaSociedadCentros.sociedadesIds.length > 0)
  );
  const esMultisociedadCentros = Boolean(empresa?.multisociedad_habilitado);
  const sociedadesIdsVistaCentrosKey = modoVistaSociedadCentros.sociedadesIds.join('|');
  const centrosCostoVista = useMemo(() => {
    if (modoVistaSociedadCentros.sinFiltro) return centrosCosto || [];
    const permitidas = new Set(modoVistaSociedadCentros.sociedadesIds);
    return (centrosCosto || []).filter(centro => centro.sociedad_id && permitidas.has(centro.sociedad_id));
  }, [centrosCosto, modoVistaSociedadCentros.sinFiltro, sociedadesIdsVistaCentrosKey]);
  const centrosBeneficioVista = useMemo(() => {
    if (modoVistaSociedadCentros.sinFiltro) return centrosBeneficio || [];
    const permitidas = new Set(modoVistaSociedadCentros.sociedadesIds);
    return (centrosBeneficio || []).filter(centro => centro.sociedad_id && permitidas.has(centro.sociedad_id));
  }, [centrosBeneficio, modoVistaSociedadCentros.sinFiltro, sociedadesIdsVistaCentrosKey]);

  const [tab, setTab] = useState('ceco');

  const sociedadFormularioInicial = resolverSociedadInicialFormularioCentro({
    multisociedadHabilitado: esMultisociedadCentros,
    permiteEscritura: modoVistaSociedadCentros.permiteEscritura,
    sociedadIdEscritura: modoVistaSociedadCentros.sociedadIdEscritura,
  });
  const cecoBase = { codigo:'', nombre:'', tipo:'area_funcional', naturaleza_economica:'', responsable_id:'', cebe_id:'', sociedad_id:sociedadFormularioInicial, presupuesto_mensual:'', fecha_inicio:'', fecha_fin:'', descripcion:'', estado:'activo' };
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
  const [centroEliminando, setCentroEliminando] = useState('');
  const columnasCeco = [
    { key:'codigo', label:'Código' }, { key:'nombre', label:'Nombre' },
    { key:'sociedad', label:'Sociedad' }, { key:'tipo', label:'Tipo' },
    { key:'cebe_padre', label:'CEBE padre' }, { key:'responsable', label:'Responsable' },
    { key:'presupuesto', label:'Presupuesto' }, { key:'vigencia', label:'Vigencia' },
    { key:'estado', label:'Estado' },
  ];
  const columnasCebe = [
    { key:'codigo', label:'Código' }, { key:'nombre', label:'Nombre' },
    { key:'sociedad', label:'Sociedad' }, { key:'tipo', label:'Tipo' },
    { key:'responsable', label:'Responsable' }, { key:'meta_ingresos', label:'Meta de ingresos' },
    { key:'cecos', label:'CECOs' }, { key:'vigencia', label:'Vigencia' },
    { key:'estado', label:'Estado' },
  ];
  const [columnasCecoVisibles, setColumnasCecoVisibles] = useState(columnasCeco.map(c => c.key));
  const [columnasCebeVisibles, setColumnasCebeVisibles] = useState(columnasCebe.map(c => c.key));
  const estilosColumnasCeco = columnasCeco
    .filter(col => col.key !== 'sociedad' || mostrarBadgeSociedadCentros)
    .map((col, index) => columnasCecoVisibles.includes(col.key)
      ? ''
      : `.tabla-ceco th:nth-child(${index + 1}), .tabla-ceco td:nth-child(${index + 1}) { display: none; }`)
    .join('');
  const estilosColumnasCebe = columnasCebe
    .filter(col => col.key !== 'sociedad' || mostrarBadgeSociedadCentros)
    .map((col, index) => columnasCebeVisibles.includes(col.key)
      ? ''
      : `.tabla-cebe th:nth-child(${index + 1}), .tabla-cebe td:nth-child(${index + 1}) { display: none; }`)
    .join('');

  const cebeBase = { codigo:'', nombre:'', tipo:'linea_servicio', cargo_financiero_dbs:'', responsable_id:'', cuenta_id:'', sociedad_id:sociedadFormularioInicial, meta_ingresos:'', fecha_inicio:'', fecha_fin:'', descripcion:'', estado:'activo' };
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
  const cebesActivosParaCeco = (centrosBeneficio || [])
    .filter(c => c.estado === 'activo')
    .filter(c => !esMultisociedadCentros || (cecoForm.sociedad_id && c.sociedad_id === cecoForm.sociedad_id));
  const estadosOtCerrados = new Set(['pendiente_cierre', 'pendiente cierre', 'cerrada', 'cerrado', 'cerrada_tecnica', 'cerrado_tecnico', 'valorizada', 'valorizado', 'facturada', 'facturado', 'anulada', 'anulado', 'cancelada', 'cancelado']);
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
    try {
      await actualizarCentroCosto(ceco.id, { ...ceco, estado: 'inactivo' });
      addNotificacion?.('CECO inactivado.');
    } catch (err) {
      setCecoError(err?.message || 'No se pudo inactivar el CECO.');
    }
  };
  const activarCeco = async ceco => {
    try {
      await actualizarCentroCosto(ceco.id, { ...ceco, estado: 'activo' });
      addNotificacion?.('CECO activado.');
    } catch (err) {
      setCecoError(err?.message || 'No se pudo activar el CECO.');
    }
  };
  const cambiarEstadoCebe = async (cebe, estado) => {
    if (estado === 'inactivo' && !window.confirm(`¿Inactivar "${cebe.nombre}"?`)) return;
    try {
      await actualizarCentroBeneficio(cebe.id, { ...cebe, estado });
      addNotificacion?.(`CEBE ${estado === 'activo' ? 'activado' : 'inactivado'}.`);
    } catch (err) {
      setCebeError(err?.message || `No se pudo ${estado === 'activo' ? 'activar' : 'inactivar'} el CEBE.`);
    }
  };

  const abrirParaExpirar = (catalogo, centro) => {
    const fechaFin = new Date().toISOString().slice(0, 10);
    if (catalogo === 'centro_costo') {
      editarCeco(centro);
      setCecoForm(prev => ({ ...prev, fecha_fin: prev.fecha_fin || fechaFin }));
    } else {
      editarCebe(centro);
      setCebeForm(prev => ({ ...prev, fecha_fin: prev.fecha_fin || fechaFin }));
    }
  };

  const intentarEliminarCentro = async (catalogo, centro) => {
    const clave = `${catalogo}:${centro.id}`;
    setCentroEliminando(clave);
    try {
      let detalle = { referencias: [], total_referencias: 0, cecos_hijos: 0 };
      if (isSupabaseConfigured()) {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase.rpc('contar_referencias_centro', {
          p_catalogo: catalogo,
          p_centro_id: centro.id,
        });
        if (error) throw error;
        detalle = data || detalle;
      }
      const referencias = Array.isArray(detalle.referencias) ? detalle.referencias : [];
      const hijos = Number(detalle.cecos_hijos || 0);
      const total = Number(detalle.total_referencias || 0) + hijos;
      if (total > 0) {
        const modulos = [
          ...referencias.map(item => `${item.modulo}: ${item.cantidad}`),
          ...(hijos ? [`Centros de costo hijos: ${hijos}`] : []),
        ];
        const abrir = window.confirm(`No se puede eliminar "${centro.nombre}" porque tiene ${total} referencia(s).\n\n${modulos.join('\n')}\n\nPara conservar la trazabilidad, asígnale una fecha de fin para expirarlo. ¿Abrir el formulario para hacerlo?`);
        if (abrir) abrirParaExpirar(catalogo, centro);
        return;
      }
      const confirmado = window.confirm(`La eliminación de "${centro.nombre}" es permanente e irreversible. Su código quedará disponible para reutilizarse.\n\n¿Confirmas eliminarlo definitivamente?`);
      if (!confirmado) return;
      if (catalogo === 'centro_costo') await eliminarCentroCosto(centro.id);
      else await eliminarCentroBeneficio(centro.id);
      addNotificacion?.(`${catalogo === 'centro_costo' ? 'CECO' : 'CEBE'} eliminado permanentemente.`);
    } catch (err) {
      const mensaje = err?.message || 'No se pudo verificar las referencias del centro.';
      if (catalogo === 'centro_costo') setCecoError(mensaje); else setCebeError(mensaje);
    } finally {
      setCentroEliminando('');
    }
  };

  const CECO_TIPOS = CECO_TIPOS_IMPORTACION;
  const CEBE_TIPOS = CEBE_TIPOS_IMPORTACION;
  const labelTipo = t => ({
    area_funcional: 'Área funcional',
    proyecto: 'Proyecto',
    sede: 'Sede',
    temporal: 'Temporal',
    linea_servicio: 'Línea de servicio',
    cliente: 'Cliente',
    producto: 'Producto',
    estructural: 'Estructural / corporativo',
  }[t] || t);

  const notasTipoCebe = {
    linea_servicio: 'Agrupa ingresos y costos de una línea de negocio recurrente. Se factura contra él.',
    cliente: 'Mide la rentabilidad de un cliente específico.',
    proyecto: 'Centro finito; exige fecha de fin.',
    producto: 'Mide la rentabilidad de un producto o familia.',
    temporal: 'Centro finito de corta duración; exige fecha de fin.',
    estructural: 'No genera ingresos. Absorbe gastos de administración y estructura. No se factura contra él y no participa del margen por línea de negocio.',
  };
  const notasTipoCeco = {
    area_funcional: 'Centro permanente asociado a un área de la organización.',
    proyecto: 'Centro finito ligado a un proyecto.',
    temporal: 'Centro finito de corta duración.',
  };
  const notasNaturalezaCeco = {
    productivo: 'Ejecuta directamente el servicio que se factura. Su costo es costo de ventas.',
    apoyo: 'Da soporte a los centros productivos sin facturar directamente.',
    estructural: 'Existe independientemente del nivel de actividad comercial. Su costo es gasto administrativo.',
  };
  useEffect(() => {
    const sociedad_id = resolverSociedadInicialFormularioCentro({
      multisociedadHabilitado: esMultisociedadCentros,
      permiteEscritura: modoVistaSociedadCentros.permiteEscritura,
      sociedadIdEscritura: modoVistaSociedadCentros.sociedadIdEscritura,
    });
    if (!cecoEditId) {
      setCecoForm(prev => prev.sociedad_id === sociedad_id
        ? prev
        : { ...prev, sociedad_id, cebe_id: '' });
    }
    if (!cebeEditId) {
      setCebeForm(prev => prev.sociedad_id === sociedad_id
        ? prev
        : { ...prev, sociedad_id });
    }
  }, [cecoEditId, cebeEditId, esMultisociedadCentros, modoVistaSociedadCentros.permiteEscritura, modoVistaSociedadCentros.sociedadIdEscritura]);

  // ---- CECO ----
  const resetCecoForm = () => { setCecoForm(cecoBase); setCecoEditId(null); setCecoError(''); };
  const editarCeco = c => {
    setCecoForm({ codigo:c.codigo||'', nombre:c.nombre||'', tipo:c.tipo||'area_funcional', naturaleza_economica:c.naturaleza_economica||'', responsable_id:c.responsable_id||'', cebe_id:c.cebe_id||'', sociedad_id:c.sociedad_id||'', presupuesto_mensual:c.presupuesto_mensual||'', fecha_inicio:c.fecha_inicio||'', fecha_fin:c.fecha_fin||'', descripcion:c.descripcion||'', estado:c.estado||'activo' });
    setCecoEditId(c.id); setCecoError('');
  };
  const guardarCeco = async e => {
    e.preventDefault();
    if (!cecoForm.codigo.trim()) return setCecoError('El código del CECO es obligatorio.');
    if (!cecoForm.nombre.trim()) return setCecoError('El nombre es obligatorio.');
    const errorSociedadCeco = validarSociedadFormularioCentro({
      multisociedadHabilitado: esMultisociedadCentros,
      sociedadId: cecoForm.sociedad_id,
    });
    if (errorSociedadCeco) return setCecoError(errorSociedadCeco);
    const cebeSeleccionado = (centrosBeneficio || []).find(c => c.id === cecoForm.cebe_id);
    if (cebeSeleccionado && esMultisociedadCentros && cebeSeleccionado.sociedad_id !== cecoForm.sociedad_id) return setCecoError('El CEBE padre debe pertenecer a la sociedad seleccionada.');
    if ((centrosCosto||[]).some(c => c.codigo === cecoForm.codigo.trim() && c.sociedad_id === (esMultisociedadCentros ? cecoForm.sociedad_id : null) && c.id !== cecoEditId)) return setCecoError('Este código ya está en uso para esta sociedad. Elige uno diferente.');
    const cecoActual = (centrosCosto || []).find(c => c.id === cecoEditId);
    if (cecoEditId && cecoActual?.estado !== 'inactivo' && cecoForm.estado === 'inactivo' && !confirmarInactivacionCeco(cecoActual)) return;
    setCecoSaving(true); setCecoError('');
    try {
      const resp = usuariosActivos.find(u => u.id === cecoForm.responsable_id);
      const datos = { ...cecoForm, sociedad_id: esMultisociedadCentros ? cecoForm.sociedad_id : null, responsable_nombre: resp?.nombre || '', fecha_inicio: cecoForm.fecha_inicio || null, fecha_fin: cecoForm.fecha_fin || null, presupuesto_mensual: cecoForm.presupuesto_mensual !== '' ? cecoForm.presupuesto_mensual : null, cebe_id: cecoForm.cebe_id || null };
      if (cecoEditId) await actualizarCentroCosto(cecoEditId, datos);
      else await crearCentroCosto(datos);
      addNotificacion?.(`CECO ${cecoEditId ? 'actualizado' : 'creado'} correctamente.`);
      resetCecoForm();
    } catch (err) { setCecoError(err?.message || 'No se pudo guardar el CECO.'); }
    finally { setCecoSaving(false); }
  };
  const cecosFiltrados = centrosCostoVista.filter(c =>
    (!cecoFiltroTipo || c.tipo === cecoFiltroTipo) &&
    (!cecoFiltroCebe || c.cebe_id === cecoFiltroCebe) &&
    (!cecoFiltroEstado || c.estado === cecoFiltroEstado)
  );

  // ---- CEBE ----
  const resetCebeForm = () => { setCebeForm(cebeBase); setCebeEditId(null); setCebeError(''); };
  const editarCebe = c => {
    setCebeForm({ codigo:c.codigo||'', nombre:c.nombre||'', tipo:c.tipo||'linea_servicio', cargo_financiero_dbs:c.cargo_financiero_dbs||'', responsable_id:c.responsable_id||'', cuenta_id:c.cuenta_id||'', sociedad_id:c.sociedad_id||'', meta_ingresos:c.meta_ingresos||'', fecha_inicio:c.fecha_inicio||'', fecha_fin:c.fecha_fin||'', descripcion:c.descripcion||'', estado:c.estado||'activo' });
    setCebeEditId(c.id); setCebeError('');
  };
  const guardarCebe = async e => {
    e.preventDefault();
    if (!cebeForm.codigo.trim()) return setCebeError('El código del CEBE es obligatorio.');
    if (!cebeForm.nombre.trim()) return setCebeError('El nombre es obligatorio.');
    if (CEBE_TIPOS_FINITOS.includes(cebeForm.tipo) && !cebeForm.fecha_fin) return setCebeError(`Fecha de fin obligatoria para tipo ${cebeForm.tipo}.`);
    const errorSociedadCebe = validarSociedadFormularioCentro({
      multisociedadHabilitado: esMultisociedadCentros,
      sociedadId: cebeForm.sociedad_id,
    });
    if (errorSociedadCebe) return setCebeError(errorSociedadCebe);
    if ((centrosBeneficio||[]).some(c => c.codigo === cebeForm.codigo.trim() && c.sociedad_id === (esMultisociedadCentros ? cebeForm.sociedad_id : null) && c.id !== cebeEditId)) return setCebeError('Este código ya está en uso para esta sociedad. Elige uno diferente.');
    setCebeSaving(true); setCebeError('');
    try {
      const resp = usuariosActivos.find(u => u.id === cebeForm.responsable_id);
      const esEstructural = cebeForm.tipo === 'estructural';
      const datos = { ...cebeForm, cargo_financiero_dbs: esEstructural ? null : (cebeForm.cargo_financiero_dbs || null), responsable_nombre: resp?.nombre || '', fecha_inicio: cebeForm.fecha_inicio || null, fecha_fin: cebeForm.fecha_fin || null, meta_ingresos: esEstructural ? 0 : (cebeForm.meta_ingresos !== '' ? cebeForm.meta_ingresos : null), cuenta_id: cebeForm.cuenta_id || null };
      if (cebeEditId) await actualizarCentroBeneficio(cebeEditId, datos);
      else await crearCentroBeneficio(datos);
      addNotificacion?.(`CEBE ${cebeEditId ? 'actualizado' : 'creado'} correctamente.`);
      resetCebeForm();
    } catch (err) { setCebeError(err?.message || 'No se pudo guardar el CEBE.'); }
    finally { setCebeSaving(false); }
  };
  const cebesFiltrados = centrosBeneficioVista.filter(c =>
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
  const validarCecoImport = rows => validarFilasImportacionCeco(rows, {
    centrosCosto,
    centrosBeneficio,
    sedes,
    especialidades,
    usuarios,
    sociedades: sociedadesDisponibles,
    multisociedadHabilitado: Boolean(empresa?.multisociedad_habilitado),
  });
  const validarCebeImport = rows => validarFilasImportacionCebe(rows, {
    centrosBeneficio,
    cuentas,
    usuarios,
    sociedades: sociedadesDisponibles,
    multisociedadHabilitado: Boolean(empresa?.multisociedad_habilitado),
  });
  const exportCsv = (data, headers, filename) => {
    const rows = [headers.join(','), ...data.map(r => headers.map(h=>`"${r[h]??''}"` ).join(','))];
    const blob = new Blob([rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  };
  const exportXlsx = (data, headers, filename) => {
    const ws = XLSX.utils.json_to_sheet(data.map(r => Object.fromEntries(headers.map(h => [h, r[h] ?? '']))), { header: headers });
    headers.forEach((header, columnIndex) => {
      if (!['fecha_inicio', 'fecha_fin'].includes(header)) return;
      data.forEach((row, rowIndex) => {
        const serial = serialExcelDesdeIso(row?.[header]);
        if (serial === null) return;
        ws[XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex + 1 })] = { t: 'n', v: serial, z: 'dd/mm/yyyy' };
      });
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, filename);
  };
  const parseXlsx = (file, sheetName) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[sheetName];
        if (!ws) throw new Error(`El archivo no contiene la hoja "${sheetName}".`);
        const filas = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
        resolve(filas.filter(fila => Object.entries(fila).some(([campo, valor]) => (
          !['fecha_inicio', 'fecha_fin'].includes(campo) && String(valor ?? '').trim() !== ''
        ))));
      } catch(e) { reject(e); }
    };
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose}/>
      <div className="side-panel" style={{ width:'min(960px, 98vw)' }}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Gestión de catálogo</div>
            <div className="font-display" style={{ fontSize:22, fontWeight:700, marginTop:2 }}>Centros de Costo y Beneficio</div>
            <div className="text-muted" style={{ fontSize:12, marginTop:4 }}>{centrosCostoVista.length} CECOs · {centrosBeneficioVista.length} CEBEs · empresa actual</div>
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
              <a className="btn btn-secondary" href={`${import.meta.env.BASE_URL}plantillas/plantilla_cecos.xlsx`} download="plantilla_cecos.xlsx">{I.download} Descargar plantilla</a>
              <button className="btn btn-secondary" onClick={() => { setCecoModalImport(true); setCecoImportRows([]); setCecoImportStep(1); }}>{I.download} Importar Excel</button>
              <button className="btn btn-secondary" onClick={() => { const data = centrosCostoVista.map(c => ({ ...c, sociedad: (sociedadesDisponibles||[]).find(s=>s.id===c.sociedad_id)?.codigo || '', especialidad: (especialidades||[]).find(e=>e.id===c.especialidad)?.codigo || '', responsable: c.responsable_nombre || '', cebe_padre: (centrosBeneficio||[]).find(b=>b.id===c.cebe_id)?.codigo || '', sede_padre: (sedes||[]).find(s=>s.id===c.sede_padre)?.codigo || '' })); exportXlsx(data, ['codigo','nombre','sociedad','tipo','naturaleza_economica','especialidad','responsable','cebe_padre','sede_padre','presupuesto_mensual','fecha_inicio','fecha_fin','descripcion','estado'], 'cecos.xlsx'); }}>{I.download} Exportar Excel</button>
              <span className="badge badge-cyan">Validación de duplicados activa</span>
            </div>

            <div className="card" style={{ marginBottom:16, padding:20 }}>
              <div style={{ fontWeight:600, fontSize:13, color:'var(--cyan)', marginBottom:14 }}>{cecoEditId ? 'Editar CECO' : 'Nuevo CECO'}</div>
              {cecoError && <div className="alert alert-danger" style={{ marginBottom:12, fontSize:13 }}>{cecoError}</div>}
              <form onSubmit={guardarCeco}>
                <div className="grid-2" style={{ gap:12, marginBottom:12 }}>
                  <SociedadCentroField esMultisociedad={esMultisociedadCentros} permiteEscritura={modoVistaSociedadCentros.permiteEscritura} sociedades={sociedadesDisponibles} value={cecoForm.sociedad_id} onChange={sociedad_id => setCecoForm(prev => ({ ...prev, sociedad_id, cebe_id: prev.sociedad_id === sociedad_id ? prev.cebe_id : '' }))}/>
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
                    <NotaContextual>{notasTipoCeco[cecoForm.tipo]}</NotaContextual>
                  </div>
                  <div className="input-group">
                    <label>Naturaleza económica</label>
                    <select className="select" value={cecoForm.naturaleza_economica} onChange={e=>setCecoForm(p=>({...p,naturaleza_economica:e.target.value}))}>
                      <option value="">— Pendiente de clasificar —</option>
                      {NATURALEZAS_ECONOMICAS_CECO.map(n=><option key={n} value={n}>{n[0].toUpperCase()}{n.slice(1)}</option>)}
                    </select>
                    {cecoForm.naturaleza_economica && <NotaContextual>{notasNaturalezaCeco[cecoForm.naturaleza_economica]}</NotaContextual>}
                  </div>
                  <div className="input-group">
                    <label>Responsable</label>
                    <select className="select" value={cecoForm.responsable_id} onChange={e=>setCecoForm(p=>({...p,responsable_id:e.target.value}))}>
                      <option value="">— Seleccionar —</option>
                      {usuariosActivos.map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>CEBE padre</label>
                    <select className="select" value={cecoForm.cebe_id} disabled={esMultisociedadCentros && !cecoForm.sociedad_id} onChange={e=>setCecoForm(p=>({...p,cebe_id:e.target.value}))}>
                      <option value="">— Seleccionar CEBE —</option>
                      {cebesActivosParaCeco.map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Presupuesto mensual</label>
                    <input className="input" type="number" min="0" value={cecoForm.presupuesto_mensual} onChange={e=>setCecoForm(p=>({...p,presupuesto_mensual:e.target.value}))} placeholder="0.00"/>
                  </div>
                  <div className="input-group">
                    <label>Fecha inicio</label>
                    <input className="input" type="date" value={cecoForm.fecha_inicio} onChange={e=>setCecoForm(p=>({...p,fecha_inicio:e.target.value}))}/>
                  </div>
                  <div className="input-group">
                    <label>Fecha fin</label>
                    <input className="input" type="date" value={cecoForm.fecha_fin} onChange={e=>setCecoForm(p=>({...p,fecha_fin:e.target.value}))}/>
                    <small className="text-muted">Para dejar de usar un CECO, registra su fecha de fin; no se elimina ni se inactiva sin preservar el histórico.</small>
                  </div>
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
                {centrosBeneficioVista.map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </select>
              <select className="select" style={{ width:'auto', fontSize:12 }} value={cecoFiltroEstado} onChange={e=>setCecoFiltroEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
              <ColumnFilter columns={columnasCeco.filter(col => col.key !== 'sociedad' || mostrarBadgeSociedadCentros)} visibleCols={columnasCecoVisibles} onChange={setColumnasCecoVisibles} />
              <span className="text-muted" style={{ fontSize:12, marginLeft:'auto' }}>{cecosFiltrados.length} registros</span>
            </div>

            <div className="card">
              <div className="table-wrap">
                <style>{estilosColumnasCeco}</style>
                <table className="tbl tabla-ceco">
                  <thead><tr><th>Código</th><th>Nombre</th>{mostrarBadgeSociedadCentros && <th>Sociedad</th>}<th>Tipo</th><th>CEBE padre</th><th>Responsable</th><th>Presupuesto</th><th>Vigencia</th><th>Estado</th><th style={{ textAlign:'right' }}>Acciones</th></tr></thead>
                  <tbody>
                    {cecosFiltrados.length === 0
                      ? <tr><td colSpan={9 + (mostrarBadgeSociedadCentros ? 1 : 0)} className="text-center text-muted" style={{ padding:'32px 0' }}>No hay CECOs con los filtros seleccionados.</td></tr>
                      : cecosFiltrados.map(c => {
                          const cebePadre = (centrosBeneficio||[]).find(b=>b.id===c.cebe_id);
                          const resp = usuariosActivos.find(u=>u.id===c.responsable_id);
                          return (
                            <tr key={c.id}>
                              <td className="mono">{c.codigo}</td>
                              <td style={{ fontWeight:500 }}>{c.nombre}</td>
                              {mostrarBadgeSociedadCentros && <td><SociedadBadge sociedadId={c.sociedad_id} /></td>}
                              <td><span className="badge badge-purple" style={{ fontSize:11 }}>{labelTipo(c.tipo)}</span></td>
                              <td className="text-muted" style={{ fontSize:12 }}>{cebePadre ? `${cebePadre.codigo} — ${cebePadre.nombre}` : '—'}</td>
                              <td className="text-muted" style={{ fontSize:12 }}>{resp?.nombre || c.responsable_nombre || '—'}</td>
                              <td className="mono text-muted" style={{ fontSize:12 }}>{c.presupuesto_mensual ? `S/ ${Number(c.presupuesto_mensual).toLocaleString('es-PE')}` : '—'}</td>
                              <td className="text-muted" style={{ fontSize:12 }}>{formatearFechaPeru(c.fecha_inicio)} — {formatearFechaPeru(c.fecha_fin)}</td>
                              <td><span className={`badge ${c.estado==='activo'?'badge-green':'badge-gray'}`}>{c.estado}</span></td>
                              <td>
                                <div className="row" style={{ justifyContent:'flex-end', gap:4 }}>
                                  <button className="icon-btn" title="Editar" onClick={()=>editarCeco(c)} style={{ color:'var(--cyan)' }}>{I.edit}</button>
                                  {c.estado === 'activo'
                                    ? <button className="btn btn-secondary btn-sm" title="Inactivar CECO" onClick={() => inactivarCeco(c)}>{I.power} Inactivar</button>
                                    : <button className="btn btn-primary btn-sm" title="Activar CECO" onClick={() => activarCeco(c)}>{I.check} Activar</button>}
                                  <button className="btn btn-danger btn-sm" title="Eliminar permanentemente" disabled={centroEliminando === `centro_costo:${c.id}`} onClick={() => intentarEliminarCentro('centro_costo', c)}>{centroEliminando === `centro_costo:${c.id}` ? 'Verificando...' : 'Eliminar'}</button>
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
              <a className="btn btn-secondary" href={`${import.meta.env.BASE_URL}plantillas/plantilla_cebes.xlsx`} download="plantilla_cebes.xlsx">{I.download} Descargar plantilla</a>
              <button className="btn btn-secondary" title="Importar CEBEs con sociedad informada por fila" onClick={() => { setCebeModalImport(true); setCebeImportRows([]); setCebeImportStep(1); }}>{I.download} Importar Excel</button>
              <button className="btn btn-secondary" onClick={() => { const data=centrosBeneficioVista.map(c=>({...c,cliente_asociado:(cuentas||[]).find(x=>x.id===c.cuenta_id)?.nombre_comercial||'',responsable:c.responsable_nombre||'',sociedad:(sociedadesDisponibles||[]).find(s=>s.id===c.sociedad_id)?.codigo||''})); exportXlsx(data, ['codigo','nombre','tipo','cargo_financiero_dbs','modelo_negocio','cliente_asociado','responsable','sociedad','meta_ingresos','fecha_inicio','fecha_fin','descripcion','estado'], 'cebes.xlsx'); }}>{I.download} Exportar Excel</button>
              <span className="badge badge-cyan">Validación de duplicados activa</span>
            </div>

            <div className="card" style={{ marginBottom:16, padding:20 }}>
              <div style={{ fontWeight:600, fontSize:13, color:'var(--cyan)', marginBottom:14 }}>{cebeEditId ? 'Editar CEBE' : 'Nuevo CEBE'}</div>
              {cebeError && <div className="alert alert-danger" style={{ marginBottom:12, fontSize:13 }}>{cebeError}</div>}
              <form onSubmit={guardarCebe}>
                <div className="grid-2" style={{ gap:12, marginBottom:12 }}>
                  <SociedadCentroField esMultisociedad={esMultisociedadCentros} permiteEscritura={modoVistaSociedadCentros.permiteEscritura} sociedades={sociedadesDisponibles} value={cebeForm.sociedad_id} onChange={sociedad_id => setCebeForm(prev => ({ ...prev, sociedad_id }))}/>
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
                    <select className="select" value={cebeForm.tipo} onChange={e=>setCebeForm(p => e.target.value === 'estructural' ? ({...p, tipo:e.target.value, cargo_financiero_dbs:'', meta_ingresos:'0'}) : ({...p, tipo:e.target.value}))}>
                      {CEBE_TIPOS.map(t=><option key={t} value={t}>{labelTipo(t)}</option>)}
                    </select>
                    <NotaContextual>{notasTipoCebe[cebeForm.tipo]}</NotaContextual>
                  </div>
                  <div className="input-group">
                    <label>Cargo financiero DBS</label>
                    <select className="select" value={cebeForm.cargo_financiero_dbs} disabled={cebeForm.tipo === 'estructural'} onChange={e=>setCebeForm(p=>({...p,cargo_financiero_dbs:e.target.value}))}>
                      <option value="">— Sin cargo —</option>
                      {CARGOS_FINANCIEROS_DBS.map(cargo=><option key={cargo} value={cargo}>{cargo.replaceAll('_', ' ')}</option>)}
                    </select>
                    <NotaContextual>Determina si el trabajo asociado es facturable al cliente o asumido por la empresa. Debe quedar vacío para los centros estructurales.</NotaContextual>
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
                    <input className="input" type="number" min="0" value={cebeForm.tipo === 'estructural' ? '0' : cebeForm.meta_ingresos} disabled={cebeForm.tipo === 'estructural'} onChange={e=>setCebeForm(p=>({...p,meta_ingresos:e.target.value}))} placeholder="0.00"/>
                  </div>
                  <div className="input-group">
                    <label>Fecha inicio</label>
                    <input className="input" type="date" value={cebeForm.fecha_inicio} onChange={e=>setCebeForm(p=>({...p,fecha_inicio:e.target.value}))}/>
                  </div>
                  <div className="input-group">
                    <label>Fecha fin {CEBE_TIPOS_FINITOS.includes(cebeForm.tipo) && '*'}</label>
                    <input className="input" type="date" required={CEBE_TIPOS_FINITOS.includes(cebeForm.tipo)} value={cebeForm.fecha_fin} onChange={e=>setCebeForm(p=>({...p,fecha_fin:e.target.value}))}/>
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
              <ColumnFilter columns={columnasCebe.filter(col => col.key !== 'sociedad' || mostrarBadgeSociedadCentros)} visibleCols={columnasCebeVisibles} onChange={setColumnasCebeVisibles} />
              <span className="text-muted" style={{ fontSize:12, marginLeft:'auto' }}>{cebesFiltrados.length} registros</span>
            </div>

            <div className="card">
              <div className="table-wrap">
                <style>{estilosColumnasCebe}</style>
                <table className="tbl tabla-cebe">
                  <thead><tr><th>Código</th><th>Nombre</th>{mostrarBadgeSociedadCentros && <th>Sociedad</th>}<th>Tipo</th><th>Responsable</th><th>Meta ingresos</th><th>CECOs</th><th>Vigencia</th><th>Estado</th><th style={{ textAlign:'right' }}>Acciones</th></tr></thead>
                  <tbody>
                    {cebesFiltrados.length === 0
                      ? <tr><td colSpan={9 + (mostrarBadgeSociedadCentros ? 1 : 0)} className="text-center text-muted" style={{ padding:'32px 0' }}>No hay CEBEs con los filtros seleccionados.</td></tr>
                      : cebesFiltrados.map(c => {
                          const resp = usuariosActivos.find(u=>u.id===c.responsable_id);
                          const cecosCount = centrosCostoVista.filter(cc=>cc.cebe_id===c.id).length;
                          return (
                            <tr key={c.id}>
                              <td className="mono">{c.codigo}</td>
                              <td style={{ fontWeight:500 }}>{c.nombre}</td>
                              {mostrarBadgeSociedadCentros && <td><SociedadBadge sociedadId={c.sociedad_id} /></td>}
                              <td><span className="badge badge-cyan" style={{ fontSize:11 }}>{labelTipo(c.tipo)}</span></td>
                              <td className="text-muted" style={{ fontSize:12 }}>{resp?.nombre || c.responsable_nombre || '—'}</td>
                              <td className="mono text-muted" style={{ fontSize:12 }}>{c.meta_ingresos ? `S/ ${Number(c.meta_ingresos).toLocaleString('es-PE')}` : '—'}</td>
                              <td><span className="badge badge-gray" style={{ fontSize:11 }}>{cecosCount} CECOs</span></td>
                              <td className="text-muted" style={{ fontSize:12 }}>{formatearFechaPeru(c.fecha_inicio)} — {formatearFechaPeru(c.fecha_fin)}</td>
                              <td><span className={`badge ${c.estado==='activo'?'badge-green':'badge-gray'}`}>{c.estado}</span></td>
                              <td>
                                <div className="row" style={{ justifyContent:'flex-end', gap:4 }}>
                                  <button className="icon-btn" title="Editar" onClick={()=>editarCebe(c)} style={{ color:'var(--cyan)' }}>{I.edit}</button>
                                  {c.estado === 'activo'
                                    ? <button className="btn btn-secondary btn-sm" title="Inactivar CEBE" onClick={() => cambiarEstadoCebe(c, 'inactivo')}>{I.power} Inactivar</button>
                                    : <button className="btn btn-primary btn-sm" title="Activar CEBE" onClick={() => cambiarEstadoCebe(c, 'activo')}>{I.check} Activar</button>}
                                  <button className="btn btn-danger btn-sm" title="Eliminar permanentemente" disabled={centroEliminando === `centro_beneficio:${c.id}`} onClick={() => intentarEliminarCentro('centro_beneficio', c)}>{centroEliminando === `centro_beneficio:${c.id}` ? 'Verificando...' : 'Eliminar'}</button>
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
                    <p className="text-muted" style={{ marginBottom:12, fontSize:13 }}>Sube un Excel (.xlsx) con hoja <code>CECOs</code> y columnas: <code>codigo, nombre, tipo, especialidad, responsable, cebe_padre, sede_padre, presupuesto_mensual, estado</code></p>
                    <input type="file" accept=".xlsx,.xls" onChange={async e=>{ const f=e.target.files[0]; if(!f) return; const rows = await parseXlsx(f, 'CECOs'); setCecoImportRows(validarCecoImport(rows)); setCecoImportStep(2); }}/>
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
                            <td>{r._errores.length>0 ? <span className="badge badge-red">Error</span> : r._advertencias.length>0 ? <span className="badge badge-cyan">Advertencia</span> : <span className="badge badge-green">OK</span>}</td>
                            <td style={{ fontSize:11, color:r._errores.length ? 'var(--danger)' : 'var(--fg-muted)' }}>{[...r._errores, ...r._advertencias].join(' · ')}</td>
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
                    <p style={{ marginBottom:16, fontSize:13 }}>Se insertarán <strong>{cecoImportRows.filter(r=>r._errores.length===0).length} CECOs nuevos</strong>. Los {cecoImportRows.filter(r=>r._errores.length>0).length} rechazados no se sobrescribirán ni se enviarán a la base.</p>
                    <button className="btn btn-primary" onClick={async e => {
                      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Importando...';
                      try {
                        const v = cecoImportRows.filter(r=>r._errores.length===0).map(({_errores,_advertencias,_fila,...r})=>r);
                        const resultado = await importarCentrosCosto(v);
                        addNotificacion?.(`${resultado?.insertados?.length || 0} CECOs importados; ${resultado?.rechazados?.length || 0} rechazados.`);
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
                    <p className="text-muted" style={{ marginBottom:12, fontSize:13 }}>Sube un Excel (.xlsx) con hoja <code>CEBEs</code> y columnas: <code>codigo, nombre, tipo, cargo_financiero_dbs, modelo_negocio, cliente_asociado, responsable, sociedad, estado</code>. <code>sociedad</code> es obligatoria en tenants con multisociedad y se ignora cuando multisociedad no está habilitada.</p>
                    <input type="file" accept=".xlsx,.xls" onChange={async e=>{ const f=e.target.files[0]; if(!f) return; const rows = await parseXlsx(f, 'CEBEs'); setCebeImportRows(validarCebeImport(rows)); setCebeImportStep(2); }}/>
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
                            <td>{r._errores.length>0 ? <span className="badge badge-red">Error</span> : r._advertencias.length>0 ? <span className="badge badge-cyan">Advertencia</span> : <span className="badge badge-green">OK</span>}</td>
                            <td style={{ fontSize:11, color:r._errores.length ? 'var(--danger)' : 'var(--fg-muted)' }}>{[...r._errores, ...r._advertencias].join(' · ')}</td>
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
                    <p style={{ marginBottom:16, fontSize:13 }}>Se insertarán <strong>{cebeImportRows.filter(r=>r._errores.length===0).length} CEBEs nuevos</strong>. Los {cebeImportRows.filter(r=>r._errores.length>0).length} rechazados no se sobrescribirán ni se enviarán a la base.</p>
                    <button className="btn btn-primary" onClick={async()=>{ const v=cebeImportRows.filter(r=>r._errores.length===0).map(({_errores,_advertencias,_fila,...r})=>({...r,estado:r.estado||'activo'})); const resultado=await importarCentrosBeneficio(v); addNotificacion?.(`${resultado?.insertados?.length || 0} CEBEs importados; ${resultado?.rechazados?.length || 0} rechazados.`); setCebeModalImport(false); }}>Importar {cebeImportRows.filter(r=>r._errores.length===0).length} CEBEs</button>
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

// ─── helpers materiales ───────────────────────────────────────────────────────
function computeNextCodigo(subfamiliaId, grupos, familias, subfamilias, materiales, empresaId) {
  const sub = subfamilias.find(s => s.id === subfamiliaId);
  if (!sub) return '';
  const fam = familias.find(f => f.id === sub.familia_id);
  if (!fam) return '';
  const grp = grupos.find(g => g.id === fam.grupo_id);
  if (!grp) return '';
  const prefix = grp.codigo.padStart(2,'0') + fam.codigo.padStart(2,'0') + sub.codigo.padStart(2,'0');
  const existentes = materiales.filter(m => m.subfamilia_id === subfamiliaId && (m.empresa_id === empresaId || !m.empresa_id) && typeof m.codigo === 'string' && m.codigo.length === 10 && m.codigo.startsWith(prefix));
  const maxCorr = existentes.reduce((max, m) => { const n = parseInt(m.codigo.slice(6), 10); return isNaN(n) ? max : Math.max(max, n); }, 0);
  return prefix + String(maxCorr + 1).padStart(4, '0');
}

// ─── MaterialesMaestro ────────────────────────────────────────────────────────
function MaterialesMaestro({ onClose }) {
  const {
    empresa, addNotificacion,
    materialGrupos, materialFamilias, materialSubfamilias, materiales,
    crearMatGrupo, actualizarMatGrupo, eliminarMatGrupo,
    crearMatFamilia, actualizarMatFamilia, eliminarMatFamilia,
    crearMatSubfamilia, actualizarMatSubfamilia, eliminarMatSubfamilia,
    crearMaterialCtx, actualizarMaterialCtx, eliminarMaterialCtx, recargarMateriales,
    almacenes, fabricantes, setFabricantes, convertirMonto, tipoCambioHoy,
  } = useApp();

  const [tab, setTab] = useState('catalogo');
  const [filtros, setFiltros] = useState({ grupoId: '', familiaId: '', subfamiliaId: '', estado: '', texto: '' });
  const [editandoId, setEditandoId] = useState(null);
  const matBase = { descripcion: '', unidad: '', grupo_id: '', familia_id: '', subfamilia_id: '', nro_parte: '', unidades_contenidas: 1, almacen_id: '', ubicacion: '', observacion: '', precio_unitario: 0, stock_minimo: 0, punto_reorden: 0, stock_maximo: 0, stock_seguridad: 0, estado: 'activo' };
  const [formMat, setFormMat] = useState(matBase);
  const [parteOriginal, setParteOriginal] = useState({ id: '', fabricante_id: '', fabricante_nombre: '', precio_referencial: '', moneda: 'PEN' });
  const [partesAlternativos, setPartesAlternativos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [importando, setImportando] = useState(false);
  const [resultImport, setResultImport] = useState(null);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 50;

  // Jerarquía state
  const [selGrupoJ, setSelGrupoJ] = useState('');
  const [selFamiliaJ, setSelFamiliaJ] = useState('');
  const formGBase = { codigo: '', nombre: '', estado: 'activo' };
  const formFBase = { codigo: '', nombre: '', estado: 'activo' };
  const formSBase = { codigo: '', nombre: '', estado: 'activo' };
  const [formG, setFormG] = useState(formGBase);
  const [formF, setFormF] = useState(formFBase);
  const [formS, setFormS] = useState(formSBase);
  const [editGId, setEditGId] = useState(null);
  const [editFId, setEditFId] = useState(null);
  const [editSId, setEditSId] = useState(null);
  const [jerarErr, setJerarErr] = useState('');

  // Filtros de familia/subfamilia en catálogo
  const familiasFiltradas = filtros.grupoId
    ? materialFamilias.filter(f => f.grupo_id === filtros.grupoId)
    : materialFamilias;
  const subfamiliasFiltradas = filtros.familiaId
    ? materialSubfamilias.filter(s => s.familia_id === filtros.familiaId)
    : (filtros.grupoId ? materialSubfamilias.filter(s => familiasFiltradas.some(f => f.id === s.familia_id)) : materialSubfamilias);

  // Selectors en form: familias/subfamilias filtradas por selección
  const formFamilias = formMat.grupo_id ? materialFamilias.filter(f => f.grupo_id === formMat.grupo_id) : [];
  const formSubfamilias = formMat.familia_id ? materialSubfamilias.filter(s => s.familia_id === formMat.familia_id) : [];
  const codigoAuto = formMat.subfamilia_id ? computeNextCodigo(formMat.subfamilia_id, materialGrupos, materialFamilias, materialSubfamilias, materiales, empresa?.id) : '';

  // Resetear página al cambiar filtros
  useEffect(() => { setPagina(1); }, [filtros]);

  // Búsqueda en catálogo
  const materialsFiltrados = materiales.filter(m => {
    if (filtros.grupoId && m.grupo_id !== filtros.grupoId) return false;
    if (filtros.familiaId && m.familia_id !== filtros.familiaId) return false;
    if (filtros.subfamiliaId && m.subfamilia_id !== filtros.subfamiliaId) return false;
    if (filtros.estado && m.estado !== filtros.estado) return false;
    if (filtros.texto) {
      const q = filtros.texto.toLowerCase();
      const numerosParte = m.material_numeros_parte || [];
      if (!m.codigo?.toLowerCase().includes(q) && !m.descripcion?.toLowerCase().includes(q)
        && !numerosParte.some(n => n.activo !== false && n.numero_parte?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const totalFiltrados = materialsFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrados / POR_PAGINA));
  const materialsPagina = materialsFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const grupoNombre = (id) => materialGrupos.find(g => g.id === id)?.nombre || '—';
  const famNombre = (id) => materialFamilias.find(f => f.id === id)?.nombre || '—';
  const subNombre = (id) => materialSubfamilias.find(s => s.id === id)?.nombre || '—';
  const almNombre = (id) => almacenes.find(a => a.id === id)?.nombre || '—';

  const editarMaterial = (m) => {
    setFormMat({ descripcion: m.descripcion || '', unidad: m.unidad || '', grupo_id: m.grupo_id || '', familia_id: m.familia_id || '', subfamilia_id: m.subfamilia_id || '', nro_parte: m.nro_parte || '', unidades_contenidas: m.unidades_contenidas ?? 1, almacen_id: m.almacen_id || '', ubicacion: m.ubicacion || '', observacion: m.observacion || '', precio_unitario: m.precio_unitario ?? 0, stock_minimo: m.stock_minimo ?? 0, punto_reorden: m.punto_reorden ?? 0, stock_maximo: m.stock_maximo ?? 0, stock_seguridad: m.stock_seguridad ?? 0, estado: m.estado || 'activo' });
    setEditandoId(m.id);
    const original = (m.material_numeros_parte || []).find(p => p.tipo === 'original');
    setParteOriginal({ id: original?.id || '', fabricante_id: original?.fabricante_id || '', fabricante_nombre: original?.fabricantes?.nombre || '', precio_referencial: original?.precio_referencial ?? '', moneda: original?.moneda || 'PEN' });
    setPartesAlternativos((m.material_numeros_parte || [])
      .filter(p => p.tipo === 'alternativo')
      .sort((a, b) => Number(a.orden) - Number(b.orden))
      .map(p => ({ id: p.id, numero_parte: p.numero_parte || '', fabricante_id: p.fabricante_id || '', fabricante_nombre: p.fabricantes?.nombre || '', notas: p.notas || '', precio_referencial: p.precio_referencial ?? '', moneda: p.moneda || 'PEN', activo: p.activo !== false })));
    setFormErr('');
  };

  const resetFormMat = () => { setFormMat(matBase); setParteOriginal({ id: '', fabricante_id: '', fabricante_nombre: '', precio_referencial: '', moneda: 'PEN' }); setPartesAlternativos([]); setEditandoId(null); setFormErr(''); };

  const actualizarParteAlternativo = (index, cambios) => setPartesAlternativos(prev => prev.map((parte, i) => i === index ? { ...parte, ...cambios } : parte));
  const resolverFabricanteParte = async (parte) => {
    const nombre = String(parte.fabricante_nombre || '').trim();
    if (!nombre) return { ...parte, fabricante_id: null };
    const existente = fabricantes.find(f => normalizarTextoMatching(f.nombre) === normalizarTextoMatching(nombre));
    const fabricante = existente || await findOrCreateFabricante(empresa.id, nombre, fabricantes);
    if (!existente) setFabricantes(prev => prev.some(f => f.id === fabricante.id) ? prev : [...prev, fabricante]);
    return { ...parte, fabricante_id: fabricante.id, fabricante_nombre: fabricante.nombre };
  };
  const crearFabricanteParte = async (index) => {
    try {
      const parte = await resolverFabricanteParte(partesAlternativos[index]);
      actualizarParteAlternativo(index, parte);
    } catch (err) { setFormErr(err.message || 'No se pudo crear el fabricante.'); }
  };
  const crearFabricanteOriginal = async () => {
    try {
      const parte = await resolverFabricanteParte(parteOriginal);
      setParteOriginal(parte);
    } catch (err) { setFormErr(err.message || 'No se pudo crear el fabricante.'); }
  };

  const guardarMaterial = async (e) => {
    e.preventDefault();
    if (!formMat.descripcion.trim()) { setFormErr('La descripción es obligatoria.'); return; }
    if (!formMat.unidad.trim()) { setFormErr('La unidad es obligatoria.'); return; }
    setSaving(true); setFormErr('');
    try {
      const codigo = editandoId ? undefined : (codigoAuto || undefined);
      const original = await resolverFabricanteParte(parteOriginal);
      const alternativos = await Promise.all(partesAlternativos.map(resolverFabricanteParte));
      if (editandoId) {
        await actualizarMaterialCtx(editandoId, formMat);
        await guardarMaterialNumerosParte(empresa.id, editandoId, alternativos);
        if (String(formMat.nro_parte || '').trim()) await guardarFabricanteNumeroParteOriginal(empresa.id, editandoId, original.fabricante_id, original.id, original);
        addNotificacion('Material actualizado.');
      } else {
        const creado = await crearMaterialCtx({ ...formMat, codigo });
        await guardarMaterialNumerosParte(empresa.id, creado.id, alternativos);
        if (String(formMat.nro_parte || '').trim()) await guardarFabricanteNumeroParteOriginal(empresa.id, creado.id, original.fabricante_id, original.id, original);
        addNotificacion('Material creado.');
      }
      await recargarMateriales();
      resetFormMat();
    } catch (err) { setFormErr(err.message || 'Error al guardar.'); } finally { setSaving(false); }
  };

  const eliminarMat = async (m) => {
    if (!window.confirm(`Eliminar "${m.descripcion}"?`)) return;
    try { await eliminarMaterialCtx(m.id); addNotificacion('Material eliminado.'); }
    catch (err) { addNotificacion(err.message, 'error'); }
  };

  const withImportTimeout = (promise, ms, message) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
  };

  // ─── Importación Excel ────────────────────────────────────────────────────
  const importarExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportando(true);
    setResultImport(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const encabezados = Object.keys(rows[0] || {});
      const tieneAlternativos = [1, 2, 3, 4].some(n => encabezados.includes(`Nro Parte Alternativo ${n}`) || encabezados.includes(`nro_parte_alternativo_${n}`) || encabezados.includes(`Precio Referencial Alternativo ${n}`) || encabezados.includes(`precio_referencial_alternativo_${n}`));
      const tieneOriginalReferencial = ['Fabricante Original', 'Precio Referencial Original', 'Moneda Original', 'fabricante_original', 'precio_referencial_original', 'moneda_original'].some(h => encabezados.includes(h));
      // Columnas esperadas: Cod Grupo, Grupo, Cod Familia, Familia, Cod Sub-Familia, Sub-Familia, Correlativo, Codigo, Descripcion, Nro Parte, UM, Unidades Contenidas, Estado, Almacen, Ubicacion, Observacion, P.U. S/
      const filas = rows.map(r => ({
        cod_grupo: String(r['Cod Grupo'] ?? r['cod_grupo'] ?? '').trim(),
        grupo: String(r['Grupo'] ?? r['grupo'] ?? '').trim(),
        cod_familia: String(r['Cod Familia'] ?? r['cod_familia'] ?? '').trim(),
        familia: String(r['Familia'] ?? r['familia'] ?? '').trim(),
        cod_subfamilia: String(r['Cod Sub-Familia'] ?? r['cod_subfamilia'] ?? '').trim(),
        subfamilia: String(r['Sub-Familia'] ?? r['subfamilia'] ?? '').trim(),
        codigo: String(r['Codigo'] ?? r['codigo'] ?? '').trim() || null,
        descripcion: String(r['Descripcion'] ?? r['descripcion'] ?? '').trim(),
        nro_parte: String(r['Nro Parte'] ?? r['nro_parte'] ?? '').trim(),
        unidad: String(r['UM'] ?? r['unidad'] ?? '').trim(),
        unidades_contenidas: Number(r['Unidades Contenidas'] ?? r['unidades_contenidas'] ?? 1) || 1,
        estado: String(r['Estado'] ?? 'activo').trim() || 'activo',
        almacen: String(r['Almacen'] ?? r['almacen'] ?? '').trim(),
        ubicacion: String(r['Ubicacion'] ?? r['ubicacion'] ?? '').trim(),
        observacion: String(r['Observacion'] ?? r['observacion'] ?? '').trim(),
         precio_unitario: Number(r['P.U. S/'] ?? r['precio_unitario'] ?? 0) || 0,
         original_proporcionado: tieneOriginalReferencial,
         original: {
           fabricante_nombre: String(r['Fabricante Original'] ?? r['fabricante_original'] ?? '').trim(),
           precio_referencial: r['Precio Referencial Original'] ?? r['precio_referencial_original'] ?? '',
           moneda: String(r['Moneda Original'] ?? r['moneda_original'] ?? 'PEN').trim() || 'PEN',
         },
        alternativos_proporcionados: tieneAlternativos,
        alternativos: [1, 2, 3, 4].map(n => ({
          numero_parte: String(r[`Nro Parte Alternativo ${n}`] ?? r[`nro_parte_alternativo_${n}`] ?? '').trim(),
          fabricante_nombre: String(r[`Fabricante Alternativo ${n}`] ?? r[`fabricante_alternativo_${n}`] ?? '').trim(),
           notas: String(r[`Notas Alternativo ${n}`] ?? r[`notas_alternativo_${n}`] ?? '').trim(),
           precio_referencial: r[`Precio Referencial Alternativo ${n}`] ?? r[`precio_referencial_alternativo_${n}`] ?? '',
           moneda: String(r[`Moneda Alternativo ${n}`] ?? r[`moneda_alternativo_${n}`] ?? 'PEN').trim() || 'PEN',
        })),
      })).filter(f => {
        if (!f.cod_grupo || !f.cod_familia || !f.cod_subfamilia) return false;
        if (!f.descripcion) return false;
        if (!f.unidad) return false;
        return true;
      });
      if (!filas.length) { setResultImport({ creados: 0, actualizados: 0, errores: [{ fila: '—', error: 'No se encontraron filas válidas en el archivo.' }] }); return; }
      const importTimeoutMs = Math.max(45000, Math.min(180000, filas.length * 900));
      const res = await withImportTimeout(
        importarMaterialesMasivo(empresa.id, filas),
        importTimeoutMs,
        'La importacion esta demorando mas de lo esperado. Revisa tu conexion o intenta con menos filas.'
      );
      await withImportTimeout(
        recargarMateriales(),
        30000,
        'La importacion termino, pero no se pudo recargar el catalogo automaticamente.'
      );
      setResultImport(res);
    } catch (err) {
      setResultImport({ creados: 0, actualizados: 0, errores: [{ fila: '—', error: err.message }] });
    } finally { setImportando(false); }
  };

  const descargarPlantillaMateriales = () => {
    const headers = ['Cod Grupo','Grupo','Cod Familia','Familia','Cod Sub-Familia','Sub-Familia','Codigo','Descripcion','Nro Parte','Fabricante Original','Precio Referencial Original','Moneda Original','UM','Unidades Contenidas','Estado','Almacen','Ubicacion','Observacion','P.U. S/'];
    headers.push(...[1,2,3,4].flatMap(n => [`Nro Parte Alternativo ${n}`, `Fabricante Alternativo ${n}`, `Notas Alternativo ${n}`, `Precio Referencial Alternativo ${n}`, `Moneda Alternativo ${n}`]));
    const ejemplo = ['GRP01','Herramientas','FAM01','Herramientas Manuales','SUB01','Llaves','','Llave francesa 10"','MFR-1234','Fabricante OEM','25.50','PEN','und','1','activo','Almacén Central','Estante A-3','','25.50','ALT-MFR-1234','Fabricante Alternativo','Equivalente','22.00','USD'];
    const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
    ws['!cols'] = headers.map((h,i) => ({ wch: i < 6 ? 12 : i === 7 ? 30 : 16 }));
    
    const instrucciones = [
      ['INSTRUCCIONES PARA LLENAR LA PLANTILLA'],
      [''],
      ['1. Cod Grupo, Cod Familia, Cod Sub-Familia:', 'Deben ser códigos cortos y únicos (ej: GRP01, FAM01). Son obligatorios.'],
      ['2. Grupo, Familia, Sub-Familia:', 'Nombres descriptivos de la jerarquía (ej: Herramientas, Herramientas Manuales). Obligatorios.'],
      ['3. Codigo:', 'Dejar en blanco para que el sistema lo autogenere, o colocar un código único personalizado.'],
      ['4. Descripcion:', 'Nombre completo del material (ej: Llave francesa 10"). Obligatorio.'],
      ['5. UM:', 'Unidad de medida (ej: und, kg, m). Obligatorio.'],
      ['6. Estado:', 'Colocar "activo" o "inactivo". Por defecto es "activo".'],
       ['7. Precios referenciales:', 'Son independientes de P.U. S/. Cada número de parte puede tener precio y moneda PEN/USD; no cambian el precio oficial del material.'],
       ['8. Números alternativos:', 'Las cinco columnas de cada alternativo son opcionales. Registra hasta 4 equivalencias; el fabricante se busca normalizado o se crea automáticamente.'],
       ['9. Resto de campos:', 'Son opcionales (Nro Parte, Unidades Contenidas, Almacen, Ubicacion, Observacion, P.U. S/).'],
      [''],
      ['Ejemplo válido:'],
      headers,
      ejemplo
    ];
    const wsInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
    wsInstrucciones['!cols'] = [{ wch: 35 }, { wch: 80 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');
    XLSX.utils.book_append_sheet(wb, ws, 'Materiales');
    XLSX.writeFile(wb, 'plantilla_materiales.xlsx');
  };

  const exportarMaterialesExcel = () => {
    if (!materiales || materiales.length === 0) {
      alert('No hay materiales para exportar.');
      return;
    }
    const data = materiales.map(m => {
      const g = materialGrupos.find(x => x.id === m.grupo_id);
      const f = materialFamilias.find(x => x.id === m.familia_id);
      const s = materialSubfamilias.find(x => x.id === m.subfamilia_id);
      const a = almacenes.find(x => x.id === m.almacen_id);
      const original = (m.material_numeros_parte || []).find(p => p.tipo === 'original');
      return {
        'Cod Grupo': g ? g.codigo : '',
        'Grupo': g ? g.nombre : '',
        'Cod Familia': f ? f.codigo : '',
        'Familia': f ? f.nombre : '',
        'Cod Sub-Familia': s ? s.codigo : '',
        'Sub-Familia': s ? s.nombre : '',
        'Codigo': m.codigo || '',
        'Descripcion': m.descripcion || '',
        'Nro Parte': m.nro_parte || '',
        'Fabricante Original': original?.fabricantes?.nombre || '',
        'Precio Referencial Original': original?.precio_referencial ?? '',
        'Moneda Original': original?.moneda || 'PEN',
        'UM': m.unidad || '',
        'Unidades Contenidas': m.unidades_contenidas || 1,
        'Estado': m.estado || 'activo',
        'Almacen': a ? a.nombre : '',
        'Ubicacion': m.ubicacion || '',
        'Observacion': m.observacion || '',
        'P.U. S/': m.precio_unitario || 0,
        'Stock Minimo': m.stock_minimo || 0,
        'Punto Reorden': m.punto_reorden || 0,
        'Stock Maximo': m.stock_maximo || 0,
        'Stock Seguridad': m.stock_seguridad || 0,
        ...Object.fromEntries([1,2,3,4].flatMap(n => {
          const parte = (m.material_numeros_parte || []).find(p => p.tipo === 'alternativo' && Number(p.orden) === n);
          return [[`Nro Parte Alternativo ${n}`, parte?.numero_parte || ''], [`Fabricante Alternativo ${n}`, parte?.fabricantes?.nombre || ''], [`Notas Alternativo ${n}`, parte?.notas || ''], [`Precio Referencial Alternativo ${n}`, parte?.precio_referencial ?? ''], [`Moneda Alternativo ${n}`, parte?.moneda || 'PEN']];
        }))
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Materiales_Export');
    XLSX.writeFile(wb, 'catalogo_materiales.xlsx');
  };

  // ─── Jerarquía CRUD ───────────────────────────────────────────────────────
  const guardarGrupo = async (e) => {
    e.preventDefault(); setJerarErr('');
    if (!formG.codigo.trim() || !formG.nombre.trim()) { setJerarErr('Código y nombre requeridos.'); return; }
    try {
      if (editGId) { await actualizarMatGrupo(editGId, formG); setEditGId(null); }
      else { await crearMatGrupo(formG); }
      setFormG(formGBase);
    } catch (err) { setJerarErr(err.message); }
  };
  const guardarFamilia = async (e) => {
    e.preventDefault(); setJerarErr('');
    if (!selGrupoJ) { setJerarErr('Selecciona un grupo primero.'); return; }
    if (!formF.codigo.trim() || !formF.nombre.trim()) { setJerarErr('Código y nombre requeridos.'); return; }
    try {
      if (editFId) { await actualizarMatFamilia(editFId, { ...formF, grupo_id: selGrupoJ }); setEditFId(null); }
      else { await crearMatFamilia({ ...formF, grupo_id: selGrupoJ }); }
      setFormF(formFBase);
    } catch (err) { setJerarErr(err.message); }
  };
  const guardarSubfamilia = async (e) => {
    e.preventDefault(); setJerarErr('');
    if (!selFamiliaJ) { setJerarErr('Selecciona una familia primero.'); return; }
    if (!formS.codigo.trim() || !formS.nombre.trim()) { setJerarErr('Código y nombre requeridos.'); return; }
    try {
      if (editSId) { await actualizarMatSubfamilia(editSId, { ...formS, familia_id: selFamiliaJ }); setEditSId(null); }
      else { await crearMatSubfamilia({ ...formS, familia_id: selFamiliaJ }); }
      setFormS(formSBase);
    } catch (err) { setJerarErr(err.message); }
  };

  const familiasPorGrupo = selGrupoJ ? materialFamilias.filter(f => f.grupo_id === selGrupoJ) : [];
  const subfamiliasPorFamilia = selFamiliaJ ? materialSubfamilias.filter(s => s.familia_id === selFamiliaJ) : [];

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose} />
      <div className="side-panel" style={{ width: 'min(980px, 98vw)' }}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Gestión de catálogo</div>
            <div className="font-display" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>Materiales e Insumos</div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{materiales.length} materiales · {materialGrupos.length} grupos · {materialFamilias.length} familias</div>
          </div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="side-panel-body">
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
            {[['catalogo', 'Catálogo de materiales'], ['jerarquia', 'Jerarquía (Grupos / Familias / Sub-familias)']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: tab === id ? 700 : 400, borderBottom: tab === id ? '2px solid var(--cyan)' : '2px solid transparent', color: tab === id ? 'var(--cyan)' : 'var(--fg-muted)', marginBottom: -2, fontSize: 13 }}>{label}</button>
            ))}
          </div>

          {tab === 'catalogo' && (
            <>
              {/* Cabecera con botón importar */}
              <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <label className={'btn btn-secondary' + (importando ? ' disabled' : '')} style={{ cursor: importando ? 'not-allowed' : 'pointer' }}>
                  {importando ? 'Importando...' : <>{I.download} Importar Excel</>}
                  <input type="file" accept=".xlsx,.xls" onChange={importarExcel} style={{ display: 'none' }} disabled={importando} />
                </label>
                <button className="btn btn-secondary" onClick={descargarPlantillaMateriales}>{I.download} Descargar plantilla</button>
                <button className="btn btn-secondary" onClick={exportarMaterialesExcel}>{I.download} Exportar Excel</button>
                {resultImport && (
                  <div style={{ fontSize: 12, background: resultImport.errores?.length ? 'var(--danger-lt)' : 'var(--success-lt)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px' }}>
                    <strong>Resultado importación:</strong> {resultImport.creados} creados · {resultImport.actualizados} actualizados
                    {resultImport.errores?.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        {resultImport.errores.slice(0, 5).map((e, i) => <div key={i} style={{ color: 'var(--danger)' }}>⚠ {e.fila}: {e.error}</div>)}
                        {resultImport.errores.length > 5 && <div>...y {resultImport.errores.length - 5} errores más</div>}
                      </div>
                    )}
                    <button onClick={() => setResultImport(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--fg-muted)', marginLeft: 8 }}>×</button>
                  </div>
                )}
              </div>

              {/* Filtros */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 14 }}>
                <select className="select" value={filtros.grupoId} onChange={e => setFiltros(p => ({ ...p, grupoId: e.target.value, familiaId: '', subfamiliaId: '' }))}>
                  <option value="">Todos los grupos</option>
                  {materialGrupos.map(g => <option key={g.id} value={g.id}>{g.codigo} - {g.nombre}</option>)}
                </select>
                <select className="select" value={filtros.familiaId} onChange={e => setFiltros(p => ({ ...p, familiaId: e.target.value, subfamiliaId: '' }))}>
                  <option value="">Todas las familias</option>
                  {familiasFiltradas.map(f => <option key={f.id} value={f.id}>{f.codigo} - {f.nombre}</option>)}
                </select>
                <select className="select" value={filtros.subfamiliaId} onChange={e => setFiltros(p => ({ ...p, subfamiliaId: e.target.value }))}>
                  <option value="">Todas las sub-familias</option>
                  {subfamiliasFiltradas.map(s => <option key={s.id} value={s.id}>{s.codigo} - {s.nombre}</option>)}
                </select>
                <select className="select" value={filtros.estado} onChange={e => setFiltros(p => ({ ...p, estado: e.target.value }))}>
                  <option value="">Todos los estados</option>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
                <input className="input" placeholder="Buscar código o descripción..." value={filtros.texto} onChange={e => setFiltros(p => ({ ...p, texto: e.target.value }))} />
              </div>

              {/* Formulario nuevo/editar */}
              {formErr && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{formErr}</div>}
              <form className="card" style={{ padding: 14, marginBottom: 16 }} onSubmit={guardarMaterial}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{editandoId ? 'Editar material' : 'Nuevo material'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  <div className="input-group">
                    <label>Grupo</label>
                    <select className="select" value={formMat.grupo_id} onChange={e => setFormMat(p => ({ ...p, grupo_id: e.target.value, familia_id: '', subfamilia_id: '' }))}>
                      <option value="">Seleccionar...</option>
                      {materialGrupos.map(g => <option key={g.id} value={g.id}>{g.codigo} - {g.nombre}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Familia</label>
                    <select className="select" value={formMat.familia_id} onChange={e => setFormMat(p => ({ ...p, familia_id: e.target.value, subfamilia_id: '' }))} disabled={!formMat.grupo_id}>
                      <option value="">Seleccionar...</option>
                      {formFamilias.map(f => <option key={f.id} value={f.id}>{f.codigo} - {f.nombre}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Sub-familia</label>
                    <select className="select" value={formMat.subfamilia_id} onChange={e => setFormMat(p => ({ ...p, subfamilia_id: e.target.value }))} disabled={!formMat.familia_id}>
                      <option value="">Seleccionar...</option>
                      {formSubfamilias.map(s => <option key={s.id} value={s.id}>{s.codigo} - {s.nombre}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Código <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>· Auto</span></label>
                    <input className="input" readOnly value={editandoId ? (materiales.find(m => m.id === editandoId)?.codigo || '') : (codigoAuto || '—')} style={{ color: 'var(--fg-muted)', background: 'var(--bg-subtle)', cursor: 'default' }} />
                  </div>
                  <div className="input-group" style={{ gridColumn: 'span 2' }}>
                    <label>Descripción *</label>
                    <input className="input" required value={formMat.descripcion} onChange={e => setFormMat(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Tornillo hexagonal M8x25mm" />
                  </div>
                  <div className="input-group">
                    <label>UM *</label>
                    <input className="input" required value={formMat.unidad} onChange={e => setFormMat(p => ({ ...p, unidad: e.target.value }))} placeholder="Ej: und, kg, m" />
                  </div>
                  <div className="input-group">
                    <label>Nro Parte</label>
                    <input className="input" value={formMat.nro_parte} onChange={e => setFormMat(p => ({ ...p, nro_parte: e.target.value }))} placeholder="Código del fabricante" />
                  </div>
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>Números de parte</strong>
                        <div className="text-muted" style={{ fontSize: 11 }}>El original se edita en el campo “Nro Parte” de arriba. Registra hasta cuatro equivalentes.</div>
                      </div>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={partesAlternativos.length >= 4} onClick={() => setPartesAlternativos(prev => [...prev, { numero_parte: '', fabricante_id: '', fabricante_nombre: '', notas: '', precio_referencial: '', moneda: 'PEN', activo: true }])}>{I.plus} Alternativo</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      <div className="input-group" style={{ gridColumn: 'span 2' }}>
                        <label>Original heredado</label>
                        <input className="input" readOnly value={formMat.nro_parte || 'Sin número original'} style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }} />
                      </div>
                      <div className="input-group" style={{ gridColumn: 'span 2' }}>
                        <label>Fabricante original</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input className="input" list="fabricantes-material" disabled={!String(formMat.nro_parte || '').trim()} value={parteOriginal.fabricante_nombre} onChange={e => setParteOriginal(p => ({ ...p, fabricante_nombre: e.target.value, fabricante_id: '' }))} placeholder={formMat.nro_parte ? 'Buscar o crear fabricante' : 'Ingresa primero el Nro Parte'} />
                          {parteOriginal.fabricante_nombre && !fabricantes.some(f => normalizarTextoMatching(f.nombre) === normalizarTextoMatching(parteOriginal.fabricante_nombre)) && <button type="button" className="btn btn-secondary btn-sm" title="Crear fabricante" onClick={crearFabricanteOriginal}>Crear</button>}
                        </div>
                      </div>
                      <div className="input-group" style={{ gridColumn: 'span 2' }}>
                        <label>Precio referencial original</label>
                        <input className="input" type="number" min="0" step="0.0001" disabled={!String(formMat.nro_parte || '').trim()} value={parteOriginal.precio_referencial} onChange={e => setParteOriginal(p => ({ ...p, precio_referencial: e.target.value }))} placeholder="Opcional" />
                      </div>
                      <div className="input-group">
                        <label>Moneda</label>
                        <select className="select" disabled={!String(formMat.nro_parte || '').trim()} value={parteOriginal.moneda || 'PEN'} onChange={e => setParteOriginal(p => ({ ...p, moneda: e.target.value }))}><option value="PEN">PEN</option><option value="USD">USD</option></select>
                      </div>
                      {parteOriginal.moneda === 'USD' && tipoCambioHoy?.usd && Number(parteOriginal.precio_referencial) > 0 && <div className="text-muted" style={{ alignSelf: 'end', paddingBottom: 8, fontSize: 11 }}>≈ S/ {convertirMonto(Number(parteOriginal.precio_referencial), 'USD', 'PEN').toFixed(2)}</div>}
                    </div>
                    <datalist id="fabricantes-material">
                      {fabricantes.filter(f => f.estado !== 'inactivo').map(f => <option key={f.id} value={f.nombre}>{f.codigo}</option>)}
                    </datalist>
                    {partesAlternativos.map((parte, index) => {
                      const existeFabricante = fabricantes.some(f => normalizarTextoMatching(f.nombre) === normalizarTextoMatching(parte.fabricante_nombre));
                      return (
                        <div key={parte.id || index} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 1fr .85fr .65fr auto', gap: 8, alignItems: 'end', marginTop: 8, padding: 8, background: 'var(--bg-subtle)', borderRadius: 6 }}>
                          <div className="input-group">
                            <label>Alternativo {index + 1}</label>
                            <input className="input" value={parte.numero_parte} onChange={e => actualizarParteAlternativo(index, { numero_parte: e.target.value })} placeholder="Número de parte" />
                          </div>
                          <div className="input-group">
                            <label>Fabricante</label>
                            <input className="input" list="fabricantes-material" value={parte.fabricante_nombre} onChange={e => actualizarParteAlternativo(index, { fabricante_nombre: e.target.value, fabricante_id: '' })} placeholder="Buscar o crear fabricante" />
                          </div>
                          <div className="input-group">
                            <label>Notas</label>
                            <input className="input" value={parte.notas} onChange={e => actualizarParteAlternativo(index, { notas: e.target.value })} placeholder="Opcional" />
                          </div>
                          <div className="input-group">
                            <label>Precio ref.</label>
                            <input className="input" type="number" min="0" step="0.0001" value={parte.precio_referencial} onChange={e => actualizarParteAlternativo(index, { precio_referencial: e.target.value })} placeholder="Opcional" />
                            {parte.moneda === 'USD' && tipoCambioHoy?.usd && Number(parte.precio_referencial) > 0 && <div className="text-muted" style={{ fontSize: 10, marginTop: 3 }}>≈ S/ {convertirMonto(Number(parte.precio_referencial), 'USD', 'PEN').toFixed(2)}</div>}
                          </div>
                          <div className="input-group">
                            <label>Moneda</label>
                            <select className="select" value={parte.moneda || 'PEN'} onChange={e => actualizarParteAlternativo(index, { moneda: e.target.value })}><option value="PEN">PEN</option><option value="USD">USD</option></select>
                          </div>
                          <div style={{ display: 'flex', gap: 4, paddingBottom: 1 }}>
                            {parte.fabricante_nombre && !existeFabricante && <button type="button" className="btn btn-secondary btn-sm" title="Crear fabricante" onClick={() => crearFabricanteParte(index)}>Crear</button>}
                            <button type="button" className="icon-btn" title="Quitar número alternativo" onClick={() => setPartesAlternativos(prev => prev.filter((_, i) => i !== index))} style={{ color: 'var(--danger)' }}>{I.trash}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="input-group">
                    <label>Unidades contenidas</label>
                    <input className="input" type="number" min="0.01" step="0.01" value={formMat.unidades_contenidas} onChange={e => setFormMat(p => ({ ...p, unidades_contenidas: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label>Almacén por defecto</label>
                    <select className="select" value={formMat.almacen_id} onChange={e => setFormMat(p => ({ ...p, almacen_id: e.target.value }))}>
                      <option value="">Sin asignar</option>
                      {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Ubicación</label>
                    <input className="input" value={formMat.ubicacion} onChange={e => setFormMat(p => ({ ...p, ubicacion: e.target.value }))} placeholder="Ej: Pasillo A, Estante 3" />
                  </div>
                  <div className="input-group">
                    <label>Precio unitario S/</label>
                    <input className="input" type="number" min="0" step="0.01" value={formMat.precio_unitario} onChange={e => setFormMat(p => ({ ...p, precio_unitario: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label>Stock mínimo</label>
                    <input className="input" type="number" min="0" step="0.01" value={formMat.stock_minimo} onChange={e => setFormMat(p => ({ ...p, stock_minimo: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label>Punto de reorden</label>
                    <input className="input" type="number" min="0" step="0.01" value={formMat.punto_reorden} onChange={e => setFormMat(p => ({ ...p, punto_reorden: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label>Stock máximo</label>
                    <input className="input" type="number" min="0" step="0.01" value={formMat.stock_maximo} onChange={e => setFormMat(p => ({ ...p, stock_maximo: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label title="Cantidad reservada como buffer ante retrasos del proveedor">Stock de seguridad</label>
                    <input className="input" title="Cantidad reservada como buffer ante retrasos del proveedor" type="number" min="0" step="0.01" value={formMat.stock_seguridad} onChange={e => setFormMat(p => ({ ...p, stock_seguridad: e.target.value }))} />
                  </div>
                  <div className="input-group" style={{ gridColumn: 'span 2' }}>
                    <label>Observación</label>
                    <input className="input" value={formMat.observacion} onChange={e => setFormMat(p => ({ ...p, observacion: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label>Estado</label>
                    <select className="select" value={formMat.estado} onChange={e => setFormMat(p => ({ ...p, estado: e.target.value }))}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    {editandoId && <button type="button" className="btn btn-secondary" onClick={resetFormMat}>Cancelar</button>}
                    <button className="btn btn-primary" type="submit" disabled={saving} style={{ minWidth: 160 }}>{saving ? 'Guardando...' : editandoId ? 'Actualizar material' : <>{I.plus} Agregar material</>}</button>
                  </div>
                </div>
              </form>

              {/* Indicador y paginación */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                  {totalFiltrados === 0
                    ? 'Sin resultados'
                    : `Mostrando ${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, totalFiltrados)} de ${totalFiltrados}${Object.values(filtros).some(Boolean) ? ' filtrados' : ''} · ${materiales.length} en total`}
                </span>
                {totalPaginas > 1 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="btn btn-secondary btn-sm" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>← Ant.</button>
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Pág. {pagina} / {totalPaginas}</span>
                    <button className="btn btn-secondary btn-sm" disabled={pagina === totalPaginas} onClick={() => setPagina(p => p + 1)}>Sig. →</button>
                  </div>
                )}
              </div>

              {/* Tabla catálogo */}
              <div className="card">
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Descripción</th>
                        <th>Grupo / Familia / Sub-familia</th>
                        <th>UM</th>
                        <th style={{ textAlign: 'right' }}>Precio unit.</th>
                        <th>Almacén</th>
                        <th>Estado</th>
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {totalFiltrados === 0 && (
                        <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 24 }}>Sin materiales{Object.values(filtros).some(Boolean) ? ' para estos filtros' : '. Agrega uno arriba o importa desde Excel.'}</td></tr>
                      )}
                      {materialsPagina.map(m => (
                        <tr key={m.id} style={{ background: editandoId === m.id ? 'var(--bg-subtle)' : '' }}>
                          <td className="mono" style={{ fontSize: 12 }}>{m.codigo || '—'}</td>
                          <td><strong>{m.descripcion}</strong>{m.nro_parte && <div className="text-muted" style={{ fontSize: 11 }}>P/N: {m.nro_parte}</div>}</td>
                          <td className="text-muted" style={{ fontSize: 11 }}>{m.grupo_id ? grupoNombre(m.grupo_id) : '—'} / {m.familia_id ? famNombre(m.familia_id) : '—'} / {m.subfamilia_id ? subNombre(m.subfamilia_id) : '—'}</td>
                          <td>{m.unidad}</td>
                          <td style={{ textAlign: 'right' }}>{m.precio_unitario > 0 ? `S/ ${Number(m.precio_unitario).toFixed(2)}` : '—'}</td>
                          <td className="text-muted" style={{ fontSize: 11 }}>{m.almacen_id ? almNombre(m.almacen_id) : '—'}</td>
                          <td><span className={'badge ' + (m.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{m.estado}</span></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="icon-btn" title="Editar" onClick={() => editarMaterial(m)} style={{ color: 'var(--cyan)' }}>{I.edit}</button>
                            <button className="icon-btn" title="Eliminar" onClick={() => eliminarMat(m)} style={{ color: 'var(--danger)' }}>{I.trash}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginación pie */}
              {totalPaginas > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-secondary btn-sm" disabled={pagina === 1} onClick={() => setPagina(1)}>«</button>
                  <button className="btn btn-secondary btn-sm" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>← Ant.</button>
                  <span style={{ fontSize: 12, color: 'var(--fg-muted)', minWidth: 100, textAlign: 'center' }}>Pág. {pagina} / {totalPaginas}</span>
                  <button className="btn btn-secondary btn-sm" disabled={pagina === totalPaginas} onClick={() => setPagina(p => p + 1)}>Sig. →</button>
                  <button className="btn btn-secondary btn-sm" disabled={pagina === totalPaginas} onClick={() => setPagina(totalPaginas)}>»</button>
                </div>
              )}
            </>
          )}

          {tab === 'jerarquia' && (
            <>
              {jerarErr && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{jerarErr}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

                {/* Grupos */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Grupos</div>
                  <form onSubmit={guardarGrupo} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    <input className="input" placeholder="Código (2 dígitos)" value={formG.codigo} onChange={e => setFormG(p => ({ ...p, codigo: e.target.value }))} maxLength={2} />
                    <input className="input" placeholder="Nombre del grupo *" value={formG.nombre} onChange={e => setFormG(p => ({ ...p, nombre: e.target.value }))} />
                    <select className="select" value={formG.estado} onChange={e => setFormG(p => ({ ...p, estado: e.target.value }))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {editGId && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditGId(null); setFormG(formGBase); }}>Cancelar</button>}
                      <button className="btn btn-primary btn-sm" type="submit">{editGId ? 'Actualizar' : <>{I.plus} Agregar</>}</button>
                    </div>
                  </form>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {materialGrupos.map(g => (
                      <div key={g.id} style={{ padding: '8px 10px', border: '1px solid', borderRadius: 6, background: selGrupoJ === g.id ? 'var(--cyan-lt)' : 'var(--bg-card)', borderColor: selGrupoJ === g.id ? 'var(--cyan)' : 'var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button type="button" onClick={() => { setSelGrupoJ(g.id); setSelFamiliaJ(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, flex: 1 }}>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--cyan-dk)' }}>{g.codigo}</span> <strong style={{ fontSize: 13 }}>{g.nombre}</strong>
                            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{materialFamilias.filter(f => f.grupo_id === g.id).length} familias</div>
                          </button>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button type="button" className="icon-btn" style={{ color: 'var(--cyan)', fontSize: 12 }} onClick={() => { setFormG({ codigo: g.codigo, nombre: g.nombre, estado: g.estado }); setEditGId(g.id); }}>{I.edit}</button>
                            <button type="button" className="icon-btn" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={() => { if(window.confirm(`Eliminar grupo "${g.nombre}"?`)) eliminarMatGrupo(g.id).catch(err => setJerarErr(err.message)); }}>{I.trash}</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {materialGrupos.length === 0 && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Sin grupos aún.</div>}
                  </div>
                </div>

                {/* Familias */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Familias</div>
                  <select className="select" style={{ marginBottom: 10 }} value={selGrupoJ} onChange={e => { setSelGrupoJ(e.target.value); setSelFamiliaJ(''); }}>
                    <option value="">— Seleccionar grupo —</option>
                    {materialGrupos.map(g => <option key={g.id} value={g.id}>{g.codigo} · {g.nombre}</option>)}
                  </select>
                  {selGrupoJ && (
                    <form onSubmit={guardarFamilia} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      <input className="input" placeholder="Código (2 dígitos)" value={formF.codigo} onChange={e => setFormF(p => ({ ...p, codigo: e.target.value }))} maxLength={2} />
                      <input className="input" placeholder="Nombre de la familia *" value={formF.nombre} onChange={e => setFormF(p => ({ ...p, nombre: e.target.value }))} />
                      <select className="select" value={formF.estado} onChange={e => setFormF(p => ({ ...p, estado: e.target.value }))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {editFId && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditFId(null); setFormF(formFBase); }}>Cancelar</button>}
                        <button className="btn btn-primary btn-sm" type="submit">{editFId ? 'Actualizar' : <>{I.plus} Agregar</>}</button>
                      </div>
                    </form>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {familiasPorGrupo.map(f => (
                      <div key={f.id} style={{ padding: '8px 10px', border: '1px solid', borderRadius: 6, background: selFamiliaJ === f.id ? 'var(--cyan-lt)' : 'var(--bg-card)', borderColor: selFamiliaJ === f.id ? 'var(--cyan)' : 'var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button type="button" onClick={() => setSelFamiliaJ(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, flex: 1 }}>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--cyan-dk)' }}>{f.codigo}</span> <strong style={{ fontSize: 13 }}>{f.nombre}</strong>
                            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{materialSubfamilias.filter(s => s.familia_id === f.id).length} sub-familias</div>
                          </button>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button type="button" className="icon-btn" style={{ color: 'var(--cyan)', fontSize: 12 }} onClick={() => { setFormF({ codigo: f.codigo, nombre: f.nombre, estado: f.estado }); setEditFId(f.id); }}>{I.edit}</button>
                            <button type="button" className="icon-btn" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={() => { if(window.confirm(`Eliminar familia "${f.nombre}"?`)) eliminarMatFamilia(f.id).catch(err => setJerarErr(err.message)); }}>{I.trash}</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {selGrupoJ && familiasPorGrupo.length === 0 && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Sin familias en este grupo.</div>}
                    {!selGrupoJ && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Selecciona un grupo arriba.</div>}
                  </div>
                </div>

                {/* Sub-familias */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Sub-familias</div>
                  <select className="select" style={{ marginBottom: 10 }} value={selFamiliaJ} onChange={e => setSelFamiliaJ(e.target.value)}>
                    <option value="">— Seleccionar familia —</option>
                    {familiasPorGrupo.map(f => <option key={f.id} value={f.id}>{f.codigo} · {f.nombre}</option>)}
                  </select>
                  {selFamiliaJ && (
                    <form onSubmit={guardarSubfamilia} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      <input className="input" placeholder="Código (2 dígitos)" value={formS.codigo} onChange={e => setFormS(p => ({ ...p, codigo: e.target.value }))} maxLength={2} />
                      <input className="input" placeholder="Nombre de la sub-familia *" value={formS.nombre} onChange={e => setFormS(p => ({ ...p, nombre: e.target.value }))} />
                      <select className="select" value={formS.estado} onChange={e => setFormS(p => ({ ...p, estado: e.target.value }))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {editSId && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditSId(null); setFormS(formSBase); }}>Cancelar</button>}
                        <button className="btn btn-primary btn-sm" type="submit">{editSId ? 'Actualizar' : <>{I.plus} Agregar</>}</button>
                      </div>
                    </form>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {subfamiliasPorFamilia.map(s => (
                      <div key={s.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-card)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--cyan-dk)' }}>{s.codigo}</span> <strong style={{ fontSize: 13 }}>{s.nombre}</strong>
                            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{materiales.filter(m => m.subfamilia_id === s.id).length} materiales</div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button type="button" className="icon-btn" style={{ color: 'var(--cyan)', fontSize: 12 }} onClick={() => { setFormS({ codigo: s.codigo, nombre: s.nombre, estado: s.estado }); setEditSId(s.id); }}>{I.edit}</button>
                            <button type="button" className="icon-btn" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={() => { if(window.confirm(`Eliminar sub-familia "${s.nombre}"?`)) eliminarMatSubfamilia(s.id).catch(err => setJerarErr(err.message)); }}>{I.trash}</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {selFamiliaJ && subfamiliasPorFamilia.length === 0 && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Sin sub-familias en esta familia.</div>}
                    {!selFamiliaJ && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Selecciona una familia arriba.</div>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============ TIPOS DE DOCUMENTO (panel y plantilla) ============
const PLANTILLA_BASE_TIPOS_DOC = [
  { nombre: 'DNI', ambito: 'Ambos', exige_vencimiento: 'SÍ', dias_alerta: 60, es_habilitante: 'NO', requiere_validacion: 'SÍ', orden: 10 },
  { nombre: 'CV / Hoja de vida', ambito: 'Ambos', exige_vencimiento: 'NO', dias_alerta: '', es_habilitante: 'NO', requiere_validacion: 'NO', orden: 20 },
  { nombre: 'Contrato de trabajo', ambito: 'Ambos', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 30 },
  { nombre: 'Adenda contractual', ambito: 'Ambos', exige_vencimiento: 'NO', dias_alerta: 0, es_habilitante: 'NO', requiere_validacion: 'SÍ', orden: 31 },
  { nombre: 'Antecedentes penales', ambito: 'Ambos', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 40 },
  { nombre: 'Antecedentes policiales', ambito: 'Ambos', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 50 },
  { nombre: 'Declaración jurada de domicilio', ambito: 'Ambos', exige_vencimiento: 'SÍ', dias_alerta: 60, es_habilitante: 'NO', requiere_validacion: 'SÍ', orden: 60 },
  { nombre: 'SCTR Salud', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 100 },
  { nombre: 'SCTR Pensión', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 110 },
  { nombre: 'Examen Médico Ocupacional (EMO)', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 60, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 120 },
  { nombre: 'Inducción de seguridad', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 130 },
  { nombre: 'Entrega de EPP', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 140 },
  { nombre: 'Capacitación trabajos en altura', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 200 },
  { nombre: 'Capacitación espacios confinados', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 210 },
  { nombre: 'Capacitación trabajos en caliente', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 220 },
  { nombre: 'Capacitación bloqueo y etiquetado (LOTO)', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 230 },
  { nombre: 'Matriz IPERC', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 240 },
  { nombre: 'Licencia de conducir', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 60, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 300 },
  { nombre: 'Certificado de operador de equipos', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 310 },
  { nombre: 'Certificación técnica de especialidad', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 60, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 320 },
  { nombre: 'Pasaporte de seguridad minera', ambito: 'Operativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 330 },
  { nombre: 'Ficha RUC', ambito: 'Ambos', exige_vencimiento: 'NO', dias_alerta: '', es_habilitante: 'NO', requiere_validacion: 'SÍ', orden: 400 },
  { nombre: 'Suspensión de retención 4ta categoría', ambito: 'Administrativo', exige_vencimiento: 'SÍ', dias_alerta: 30, es_habilitante: 'SÍ', requiere_validacion: 'SÍ', orden: 410 },
  { nombre: 'Datos bancarios / cuenta de haberes', ambito: 'Ambos', exige_vencimiento: 'NO', dias_alerta: '', es_habilitante: 'NO', requiere_validacion: 'SÍ', orden: 420 }
];

function ImportarTiposDocPreview({ dataRows, tiposActuales, onClose, onImported }) {
  const { crearTipoDocumento, addNotificacion } = useApp();
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);

  React.useEffect(() => {
    const processRows = () => {
      const normalizeStr = (s) => s ? s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim() : '';
      const parseBool = (val, def) => {
        if (val === undefined || val === null || val === '') return def;
        const s = String(val).trim().toLowerCase();
        if (['si', 'sí', 'yes', 'y', 'true', '1'].includes(s)) return true;
        if (['no', 'n', 'false', '0'].includes(s)) return false;
        return def;
      };
      const parseAmbito = (val) => {
        if (!val) return 'Ambos';
        const s = String(val).trim().toLowerCase();
        if (s.includes('oper')) return 'Operativo';
        if (s.includes('admin')) return 'Administrativo';
        if (s.includes('ambos') || s.includes('ambas')) return 'Ambos';
        return null;
      };

      const dbNames = new Set(tiposActuales.map(t => normalizeStr(t.nombre)));
      const fileNames = new Set();
      let maxOrden = tiposActuales.length > 0 ? Math.max(...tiposActuales.map(t => t.orden||0)) : 0;
      
      const parsed = dataRows.map((r, index) => {
        const item = {
          id: `imp_${index}`,
          nombre: (r.nombre || '').toString().trim(),
          ambito: parseAmbito(r.ambito),
          exige_vencimiento: parseBool(r.exige_vencimiento, true),
          dias_alerta: parseInt(r.dias_alerta),
          es_habilitante: parseBool(r.es_habilitante, false),
          requiere_validacion: parseBool(r.requiere_validacion, true),
          orden: parseInt(r.orden),
          selected: false,
          status: 'LISTO',
          errorMsg: ''
        };

        if (!item.nombre) {
          item.status = 'ERROR';
          item.errorMsg = 'Nombre vacío';
        } else if (!item.ambito) {
          item.status = 'ERROR';
          item.errorMsg = 'Ámbito inválido';
        } else if (item.exige_vencimiento && (isNaN(item.dias_alerta) || item.dias_alerta < 0)) {
          item.status = 'ERROR';
          item.errorMsg = 'Días alerta inválido';
        } else {
          const norm = normalizeStr(item.nombre);
          if (dbNames.has(norm)) {
            item.status = 'OMITIDO_DB';
            item.errorMsg = 'Ya existe en el sistema';
          } else if (fileNames.has(norm)) {
            item.status = 'OMITIDO_EXCEL';
            item.errorMsg = 'Duplicada en el archivo';
          } else {
            fileNames.add(norm);
            item.selected = true;
          }
        }
        
        if (isNaN(item.orden) || item.orden <= 0) {
          maxOrden += 10;
          item.orden = maxOrden;
        }
        return item;
      });
      setItems(parsed);
    };
    if (dataRows?.length) processRows();
  }, [dataRows, tiposActuales]);

  const toggleSelect = (id) => setItems(p => p.map(t => t.id === id && t.status === 'LISTO' ? { ...t, selected: !t.selected } : t));
  const updateField = (id, field, value) => setItems(p => p.map(t => t.id === id ? { ...t, [field]: value } : t));

  const handleImport = async () => {
    const toImport = items.filter(t => t.selected && t.status === 'LISTO');
    if (!toImport.length) return;
    setSaving(true);
    let successCount = 0;
    let currentLength = tiposActuales.length;
    try {
      for (const t of toImport) {
        currentLength++;
        const codigo = `DOC${String(currentLength).padStart(3, '0')}`;
        await crearTipoDocumento({
          codigo,
          nombre: t.nombre,
          ambito: t.ambito,
          exige_vencimiento: t.exige_vencimiento,
          dias_alerta: t.exige_vencimiento ? (t.dias_alerta || 0) : 0,
          es_habilitante: t.es_habilitante,
          requiere_validacion: t.requiere_validacion,
          estado: 'activo',
          orden: t.orden
        });
        successCount++;
      }
      addNotificacion?.(`${successCount} tipos de documento importados exitosamente.`);
      onImported();
    } catch (err) {
      addNotificacion?.('Error al importar: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const validCount = items.filter(t => t.status === 'LISTO').length;
  const selCount = items.filter(t => t.selected).length;

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="modal" style={{ maxWidth: 1060, width: '96vw' }}>
        <div className="modal-head">
          <div>
            <h2>Previsualizar Importación</h2>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Se detectaron {items.length} filas. {validCount} listas para importar.
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={saving}>{I.x}</button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="tbl">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)' }}>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input type="checkbox" checked={validCount > 0 && selCount === validCount} onChange={e => setItems(p => p.map(t => t.status === 'LISTO' ? { ...t, selected: e.target.checked } : t))} disabled={validCount === 0} />
                  </th>
                  <th style={{ width: 40 }}>Est.</th>
                  <th>Nombre</th>
                  <th>Ámbito</th>
                  <th style={{ textAlign: 'center' }}>Exige Venc.</th>
                  <th style={{ textAlign: 'center' }}>Días Alerta</th>
                  <th style={{ textAlign: 'center' }}>Habilitante</th>
                  <th>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {items.map(t => (
                  <tr key={t.id} style={{ opacity: t.status !== 'LISTO' ? 0.6 : 1, background: t.status === 'ERROR' ? 'var(--danger-lt)' : t.status !== 'LISTO' ? 'var(--bg-subtle)' : 'transparent' }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={t.selected} onChange={() => toggleSelect(t.id)} disabled={t.status !== 'LISTO'} />
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 16 }}>
                      {t.status === 'LISTO' ? '✅' : t.status === 'ERROR' ? '❌' : '⏭'}
                    </td>
                    <td><input className="input" style={{ width: '100%', minWidth: 160 }} value={t.nombre} onChange={e => updateField(t.id, 'nombre', e.target.value)} disabled={t.status !== 'LISTO'} /></td>
                    <td>
                      <select className="select" value={t.ambito || ''} onChange={e => updateField(t.id, 'ambito', e.target.value)} disabled={t.status !== 'LISTO'}>
                        <option value="Operativo">Operativo</option>
                        <option value="Administrativo">Administrativo</option>
                        <option value="Ambos">Ambos</option>
                        {!['Operativo','Administrativo','Ambos'].includes(t.ambito) && <option value={t.ambito}>{t.ambito}</option>}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={t.exige_vencimiento} onChange={e => updateField(t.id, 'exige_vencimiento', e.target.checked)} disabled={t.status !== 'LISTO'} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" className="input" style={{ width: 60, textAlign: 'center' }} value={isNaN(t.dias_alerta)?'':t.dias_alerta} onChange={e => updateField(t.id, 'dias_alerta', parseInt(e.target.value) || 0)} disabled={t.status !== 'LISTO' || !t.exige_vencimiento} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={t.es_habilitante} onChange={e => updateField(t.id, 'es_habilitante', e.target.checked)} disabled={t.status !== 'LISTO'} />
                    </td>
                    <td style={{ fontSize: 12, color: t.status === 'ERROR' ? 'var(--danger)' : 'var(--fg-muted)', whiteSpace: 'nowrap' }}>{t.errorMsg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-foot" style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
            Omitidas por duplicado: {items.filter(i => i.status.startsWith('OMITIDO')).length} | Errores: {items.filter(i => i.status === 'ERROR').length}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleImport} disabled={saving || selCount === 0}>
              {saving ? 'Importando...' : `Importar ${selCount} tipos`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function TiposDocumentoPanel({ onClose, onGoToRequisitos }) {
  const { tiposDocumento = [], crearTipoDocumento, actualizarTipoDocumento, addNotificacion } = useApp();
  const [previewData, setPreviewData] = useState(null);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = React.useRef(null);

  const tiposActivos = tiposDocumento.filter(t => t.estado === 'activo');
  const tiposInactivos = tiposDocumento.filter(t => t.estado !== 'activo');
  const allTipos = [...tiposActivos, ...tiposInactivos];

  const handleEdit = (tipo) => {
    setForm({
      nombre: tipo.nombre,
      ambito: tipo.ambito || 'Ambos',
      exige_vencimiento: Boolean(tipo.exige_vencimiento),
      dias_alerta: tipo.dias_alerta ?? 30,
      es_habilitante: Boolean(tipo.es_habilitante),
      requiere_validacion: tipo.requiere_validacion !== false,
      orden: tipo.orden ?? 0,
      estado: tipo.estado || 'activo',
      captura_snapshot_laboral: Boolean(tipo.captura_snapshot_laboral),
      documento_padre_tipo_id: tipo.documento_padre_tipo_id || null,
      tipo_sucesor_id: tipo.tipo_sucesor_id || null,
      renovable: Boolean(tipo.renovable),
      permite_firma_trabajador: Boolean(tipo.permite_firma_trabajador),
    });
    setEditando(tipo);
  };

  const handleNew = () => {
    setForm({
      nombre: '',
      ambito: 'Ambos',
      exige_vencimiento: true,
      dias_alerta: 30,
      es_habilitante: false,
      requiere_validacion: true,
      orden: 0,
      estado: 'activo',
      captura_snapshot_laboral: false,
      documento_padre_tipo_id: null,
      tipo_sucesor_id: null,
      renovable: false,
      permite_firma_trabajador: false,
    });
    setEditando(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return addNotificacion?.('El nombre es requerido');
    
    setSaving(true);
    try {
      const payload = {
        ...form,
        codigo: editando ? editando.codigo : `DOC${String(allTipos.length + 1).padStart(3, '0')}`,
        dias_alerta: form.exige_vencimiento ? (form.dias_alerta || 0) : 0,
        documento_padre_tipo_id: form.documento_padre_tipo_id || null,
        tipo_sucesor_id: form.renovable ? null : (form.tipo_sucesor_id || null),
        renovable: form.documento_padre_tipo_id ? false : Boolean(form.renovable),
        permite_firma_trabajador: form.renovable ? Boolean(form.permite_firma_trabajador) : false,
      };

      if (editando) {
        await actualizarTipoDocumento(editando.id, payload);
        addNotificacion?.('Tipo de documento actualizado');
      } else {
        await crearTipoDocumento(payload);
        addNotificacion?.('Tipo de documento creado');
      }
      setForm(null);
    } catch (err) {
      addNotificacion?.('Error: ' + (err?.message || 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  const handleDescargarPlantilla = () => {
    const wsData = [
      ['nombre', 'ambito', 'exige_vencimiento', 'dias_alerta', 'es_habilitante', 'requiere_validacion', 'orden'],
      ['Ej: Certificado Médico', 'Ambos', 'SÍ', 30, 'SÍ', 'SÍ', 10]
    ];
    const wsInstr = [
      ['Instrucciones para Plantilla de Tipos de Documento'],
      [''],
      ['Columna', 'Requerido', 'Valores Permitidos', 'Descripción'],
      ['nombre', 'SÍ', 'Texto', 'Nombre del tipo de documento (ej: SCTR, DNI)'],
      ['ambito', 'SÍ', 'Operativo, Administrativo, Ambos', 'A qué tipo de personal aplica'],
      ['exige_vencimiento', 'SÍ', 'SÍ, NO', 'Si el documento caduca en el tiempo'],
      ['dias_alerta', 'Si exige_vencimiento=SÍ', 'Número entero >= 0', 'Días de anticipación para alertar expiración'],
      ['es_habilitante', 'SÍ', 'SÍ, NO', 'Si bloquea al trabajador en caso de no tenerlo'],
      ['requiere_validacion', 'SÍ', 'SÍ, NO', 'Si requiere que RRHH lo apruebe tras subirse'],
      ['orden', 'NO', 'Número entero', 'Orden de visualización (sugerencia: 10, 20, 30...)']
    ];
    const wb = XLSX.utils.book_new();
    const sheetInstr = XLSX.utils.aoa_to_sheet(wsInstr);
    const sheetData = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, sheetInstr, 'Instrucciones');
    XLSX.utils.book_append_sheet(wb, sheetData, 'Tipos de Documento');
    XLSX.writeFile(wb, 'plantilla_tipos_documento.xlsx');
  };

  const handleExportar = () => {
    if (!allTipos.length) return addNotificacion?.('No hay datos para exportar.');
    const data = allTipos.map(t => ({
      nombre: t.nombre,
      ambito: t.ambito || 'Ambos',
      exige_vencimiento: t.exige_vencimiento ? 'SÍ' : 'NO',
      dias_alerta: t.exige_vencimiento ? t.dias_alerta : '',
      es_habilitante: t.es_habilitante ? 'SÍ' : 'NO',
      requiere_validacion: t.requiere_validacion ? 'SÍ' : 'NO',
      orden: t.orden || 0,
      estado: t.estado
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tipos de Documento');
    XLSX.writeFile(wb, `tipos_documento_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames.find(n => n.trim() === 'Tipos de Documento') || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        setPreviewData(json);
      } catch (err) {
        addNotificacion?.('Error al leer el archivo Excel: ' + (err?.message || ''));
      }
      e.target.value = ''; // Reset input
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose} />
      <div className="side-panel" style={{ width: 'min(1060px, 98vw)' }}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Gestión Documental</div>
            <div className="font-display" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>Tipos de Documento</div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Catálogo central de documentos · {tiposActivos.length} activos
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {onGoToRequisitos && (
              <button className="btn btn-ghost btn-sm" onClick={onGoToRequisitos} title="Ir a Requisitos por Cargo">
                Requisitos por Cargo →
              </button>
            )}
            <button className="icon-btn" onClick={onClose}>{I.x}</button>
          </div>
        </div>

        <div className="side-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {form ? (
            <form className="card" onSubmit={handleSave} style={{ borderLeft: '3px solid var(--cyan)' }}>
              <h3 style={{ fontSize: 16, marginBottom: 16 }}>{editando ? 'Editar Tipo de Documento' : 'Nuevo Tipo de Documento'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                  <label>Nombre *</label>
                  <input className="input" required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} autoFocus placeholder="Ej: Certificado Médico" />
                </div>
                <div className="input-group">
                  <label>Ámbito *</label>
                  <select className="select" value={form.ambito} onChange={e => setForm({ ...form, ambito: e.target.value })}>
                    <option value="Operativo">Operativo</option>
                    <option value="Administrativo">Administrativo</option>
                    <option value="Ambos">Ambos</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Estado</label>
                  <select className="select" value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
                
                <div className="input-group">
                  <label>Exige vencimiento</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="checkbox" checked={form.exige_vencimiento} onChange={e => setForm({ ...form, exige_vencimiento: e.target.checked })} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 13 }}>Sí, vence</span>
                  </label>
                </div>
                <div className="input-group" style={{ opacity: form.exige_vencimiento ? 1 : 0.4 }}>
                  <label>Días de alerta previa</label>
                  <input className="input" type="number" min="0" value={form.dias_alerta} onChange={e => setForm({ ...form, dias_alerta: parseInt(e.target.value) || 0 })} disabled={!form.exige_vencimiento} />
                </div>
                <div className="input-group">
                  <label>Es habilitante</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="checkbox" checked={form.es_habilitante} onChange={e => setForm({ ...form, es_habilitante: e.target.checked })} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 13 }}>Bloquea si no está</span>
                  </label>
                </div>
                <div className="input-group">
                  <label>Validación RRHH</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="checkbox" checked={form.requiere_validacion} onChange={e => setForm({ ...form, requiere_validacion: e.target.checked })} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 13 }}>Requiere aprobación</span>
                  </label>
                </div>
                <div className="input-group">
                  <label>¿Es renovable?</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="checkbox" checked={form.renovable} disabled={!!form.documento_padre_tipo_id} onChange={e => setForm({ ...form, renovable: e.target.checked, permite_firma_trabajador: e.target.checked ? form.permite_firma_trabajador : false })} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 13 }}>Habilitar períodos y versión</span>
                  </label>
                  {form.documento_padre_tipo_id && <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>Los documentos vinculados heredan el período del documento padre.</div>}
                </div>
                {form.renovable && (
                  <div className="input-group">
                    <label>¿Permite firma del trabajador?</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <input type="checkbox" checked={Boolean(form.permite_firma_trabajador)} onChange={e => setForm({ ...form, permite_firma_trabajador: e.target.checked })} style={{ width: 18, height: 18 }} />
                      <span style={{ fontSize: 13 }}>Habilitar firma desde app del trabajador</span>
                    </label>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>El trabajador podrá subir la versión firmada desde Mi Portal una vez que RRHH cargue el documento.</div>
                  </div>
                )}
                <div className="input-group">
                  <label>Captura condiciones laborales</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="checkbox" checked={Boolean(form.captura_snapshot_laboral)} onChange={e => setForm({ ...form, captura_snapshot_laboral: e.target.checked })} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 13 }}>Al subir, captura cargo, remuneración, modalidad y sede</span>
                  </label>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>Al validar, actualiza la ficha del colaborador con esos valores.</div>
                </div>
                <div className="input-group" style={{ gridColumn: 'span 3' }}>
                  <label>Es documento vinculado a (opcional)</label>
                  <select className="select" value={form.documento_padre_tipo_id || ''} onChange={e => setForm({ ...form, documento_padre_tipo_id: e.target.value || null })}>
                    <option value="">— Ninguno (documento independiente) —</option>
                    {tiposActivos.filter(t => !editando || t.id !== editando.id).map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>Si seleccionas un tipo, este documento aparece vinculado bajo el documento padre en la ficha del colaborador. El botón de acceso aparece junto al documento padre.</div>
                </div>
                {!form.renovable && (
                  <div className="input-group" style={{ gridColumn: 'span 3' }}>
                    <label>Es sucedido por (opcional)</label>
                    <select className="select" value={form.tipo_sucesor_id || ''} onChange={e => setForm({ ...form, tipo_sucesor_id: e.target.value || null })}>
                      <option value="">— Ninguno —</option>
                      {tiposActivos.filter(t => !editando || t.id !== editando.id).map(t => (
                        <option key={t.id} value={t.id}>{t.nombre}</option>
                      ))}
                    </select>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>Cuando el colaborador tenga una versión aprobada del documento sucesor, este documento pasará a estado Histórico y dejará de alertar. (Ej: Contrato Primigenio sucedido por Contrato Laboral).</div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setForm(null)} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar Tipo'}</button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={handleNew}>{I.plus} Nuevo tipo de documento</button>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="file" ref={fileInputRef} accept=".xlsx" style={{ display: 'none' }} onChange={handleFileUpload} />
                <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>{I.download} Importar Excel</button>
                <button className="btn btn-secondary" onClick={handleExportar}>{I.download} Exportar</button>
                <button className="btn btn-secondary" onClick={handleDescargarPlantilla}>{I.download} Descargar plantilla vacía</button>
                <button className="btn btn-secondary" onClick={() => setPreviewData(PLANTILLA_BASE_TIPOS_DOC)}>{I.download} Importar Plantilla Base</button>
              </div>
            </div>
          )}

          {!form && (
            <div className="card" style={{ padding: 0 }}>
              {allTipos.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>No hay tipos de documento</div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>Crea uno manualmente o importa un archivo Excel.</div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Nombre</th>
                        <th>Ámbito</th>
                        <th style={{ textAlign: 'center' }}>Venc.</th>
                        <th style={{ textAlign: 'center' }}>Habilitante</th>
                        <th style={{ textAlign: 'center' }}>Validación</th>
                        <th style={{ textAlign: 'center' }}>Snapshot</th>
                        <th style={{ textAlign: 'center' }}>Renovable</th>
                        <th style={{ textAlign: 'center' }}>Firma trabajador</th>
                        <th>Vinculado a</th>
                        <th>Estado</th>
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allTipos.map(t => (
                        <tr key={t.id} style={{ opacity: t.estado === 'activo' ? 1 : 0.6 }}>
                          <td className="mono text-muted" style={{ fontSize: 12 }}>{t.codigo}</td>
                          <td><strong>{t.nombre}</strong></td>
                          <td><span className="badge badge-cyan" style={{ fontSize: 11 }}>{t.ambito || 'Ambos'}</span></td>
                          <td style={{ textAlign: 'center' }}>
                            {t.exige_vencimiento ? <span className="badge badge-orange" style={{ fontSize: 10 }}>Sí ({t.dias_alerta}d)</span> : <span className="badge badge-gray" style={{ fontSize: 10 }}>No</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {t.es_habilitante ? <span className="badge badge-green" style={{ fontSize: 10 }}>Sí</span> : <span className="badge badge-gray" style={{ fontSize: 10 }}>No</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {t.requiere_validacion ? <span className="badge badge-purple" style={{ fontSize: 10 }}>RRHH</span> : <span className="badge badge-gray" style={{ fontSize: 10 }}>Auto</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {t.captura_snapshot_laboral ? <span className="badge badge-blue" style={{ fontSize: 10 }}>Snapshot</span> : <span className="badge badge-gray" style={{ fontSize: 10 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {t.renovable ? <span className="badge badge-green" style={{ fontSize: 10 }}>Sí</span> : <span className="badge badge-gray" style={{ fontSize: 10 }}>No</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {t.permite_firma_trabajador ? <span className="badge badge-green" style={{ fontSize: 10 }}>Sí</span> : <span className="badge badge-gray" style={{ fontSize: 10 }}>No</span>}
                          </td>
                          <td>
                            {t.documento_padre_tipo_id
                              ? <span className="badge badge-cyan" style={{ fontSize: 10 }}>↳ {tiposDocumento.find(p => p.id === t.documento_padre_tipo_id)?.nombre || t.documento_padre_tipo_id}</span>
                              : <span className="text-muted" style={{ fontSize: 11 }}>—</span>}
                          </td>
                          <td><span className={'badge ' + (t.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{t.estado}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="icon-btn" style={{ color: 'var(--cyan)' }} onClick={() => handleEdit(t)}>{I.edit}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {previewData && <ImportarTiposDocPreview dataRows={previewData} tiposActuales={allTipos} onClose={() => setPreviewData(null)} onImported={() => setPreviewData(null)} />}
    </>
  );
}

// ============ REQUISITOS POR CARGO (panel master-detail) ============
function RequisitosPorCargo({ onClose, onGoToTiposDoc }) {
  const {
    cargos = [], tiposDocumento = [], requisitosCargo = [],
    upsertRequisitoCargo, eliminarRequisitoCargo, addNotificacion,
  } = useApp();

  const [busqueda, setBusqueda] = useState('');
  const [cargoSelId, setCargoSelId] = useState(null);
  const [saving, setSaving] = useState(false);

  const cargosActivos = (cargos || []).filter(c => c.estado === 'activo');
  const cargosFiltrados = busqueda.trim()
    ? cargosActivos.filter(c => c.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : cargosActivos;

  const cargoSel = cargoSelId ? cargosActivos.find(c => c.id === cargoSelId) : null;

  const contarRequisitos = (cargoId) =>
    (requisitosCargo || []).filter(r => r.cargo_id === cargoId).length;

  const ambitoLabel = (tipo) => {
    if (!tipo) return null;
    const m = { Operativo: 'Operativo', Administrativo: 'Administrativo', Ambos: 'Ambos' };
    return m[tipo] || tipo;
  };

  // Filtrar tipos por ámbito del cargo seleccionado
  const tiposCompatibles = cargoSel
    ? (tiposDocumento || []).filter(t => {
        if (t.estado !== 'activo') return false;
        const ambitoCargo = cargoSel.tipo;
        if (!ambitoCargo) return true; // sin ámbito definido → mostrar todos
        if (t.ambito === 'Ambos' || ambitoCargo === 'Ambos') return true;
        return t.ambito === ambitoCargo;
      })
    : [];

  const reqDelCargo = cargoSelId
    ? (requisitosCargo || []).filter(r => r.cargo_id === cargoSelId)
    : [];

  const toggle = async (tipo, campo) => {
    if (!cargoSelId || saving) return;
    setSaving(true);
    try {
      const req = reqDelCargo.find(r => r.tipo_documento_id === tipo.id);
      if (campo === 'requerido') {
        if (req) {
          await eliminarRequisitoCargo(req.id);
        } else {
          await upsertRequisitoCargo(cargoSelId, tipo.id, false);
        }
      } else if (campo === 'obligatorio') {
        if (!req) return;
        await upsertRequisitoCargo(cargoSelId, tipo.id, !req.obligatorio);
      }
    } catch (err) {
      addNotificacion?.('Error: ' + (err?.message || 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose} />
      <div className="side-panel" style={{ width: 'min(1060px, 98vw)' }}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Configuración de personal</div>
            <div className="font-display" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>Requisitos por Cargo</div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Define qué documentos requiere cada cargo · {cargosActivos.length} cargos · {(tiposDocumento||[]).filter(t=>t.estado==='activo').length} tipos de documento activos
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {onGoToTiposDoc && (
              <button className="btn btn-ghost btn-sm" onClick={onGoToTiposDoc} title="Ir al maestro de Tipos de Documento">
                Tipos de Documento →
              </button>
            )}
            <button className="icon-btn" onClick={onClose}>{I.x}</button>
          </div>
        </div>

        <div className="side-panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, minHeight: 500 }}>

            {/* COLUMNA MAESTRO — lista de cargos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                className="input"
                placeholder="Buscar cargo..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
              <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 2 }}>
                {cargosFiltrados.length} cargos
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 520, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cargosFiltrados.length === 0 && (
                  <div style={{ color: 'var(--fg-muted)', fontSize: 13, padding: '12px 8px' }}>
                    {busqueda ? 'Sin resultados.' : 'No hay cargos activos. Crea cargos en el maestro de Cargos.'}
                  </div>
                )}
                {cargosFiltrados.map(c => {
                  const cnt = contarRequisitos(c.id);
                  const isActive = cargoSelId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCargoSelId(c.id)}
                      style={{
                        textAlign: 'left', background: isActive ? 'var(--cyan-lt)' : 'var(--bg-card)',
                        border: `1px solid ${isActive ? 'var(--cyan)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? 'var(--cyan-dk)' : 'var(--fg)' }}>{c.nombre}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                        <span className={'badge badge-' + (c.tipo === 'Operativo' ? 'cyan' : c.tipo === 'Administrativo' ? 'gray' : 'purple')} style={{ fontSize: 10 }}>
                          {c.tipo || 'Sin ámbito'}
                        </span>
                        {cnt > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{cnt} req.</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* COLUMNA DETALLE — tipos de documento */}
            <div>
              {!cargoSel ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-muted)', fontSize: 14, flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 28 }}>📋</span>
                  <span>Selecciona un cargo para configurar sus requisitos</span>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{cargoSel.nombre}</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                        Ámbito: <strong>{ambitoLabel(cargoSel.tipo) || <span style={{ color: 'var(--orange)' }}>⚠ No definido — mostrando todos los tipos</span>}</strong>
                        {cargoSel.tipo && <> · Se muestran tipos de ámbito <em>{cargoSel.tipo === 'Ambos' ? 'Operativo, Administrativo y Ambos' : cargoSel.tipo + ' + Ambos'}</em></>}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{reqDelCargo.length} de {tiposCompatibles.length} asignados</div>
                  </div>

                  {tiposCompatibles.length === 0 ? (
                    <div style={{ padding: '24px', background: 'var(--bg-subtle)', borderRadius: 10, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                      No hay tipos de documento activos compatibles con el ámbito de este cargo.
                      {onGoToTiposDoc && (
                        <div style={{ marginTop: 10 }}>
                          <button className="btn btn-ghost btn-sm" onClick={onGoToTiposDoc}>→ Ir a Tipos de Documento</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="card" style={{ padding: 0 }}>
                      <div className="table-wrap">
                        <table className="tbl">
                          <thead>
                            <tr>
                              <th>Tipo de documento</th>
                              <th style={{ textAlign: 'center' }}>Venc.</th>
                              <th style={{ textAlign: 'center' }}>Habilitante</th>
                              <th style={{ textAlign: 'center' }}>Val. RRHH</th>
                              <th style={{ textAlign: 'center', width: 90 }}>Requerido</th>
                              <th style={{ textAlign: 'center', width: 110 }}>Obligatorio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tiposCompatibles.map(tipo => {
                              const req = reqDelCargo.find(r => r.tipo_documento_id === tipo.id);
                              const esRequerido = Boolean(req);
                              return (
                                <tr key={tipo.id}>
                                  <td>
                                    <strong style={{ fontSize: 13 }}>{tipo.nombre}</strong>
                                    <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{tipo.ambito}</div>
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {tipo.exige_vencimiento
                                      ? <span className="badge badge-orange" style={{ fontSize: 10 }}>Sí</span>
                                      : <span className="badge badge-gray" style={{ fontSize: 10 }}>No</span>}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {tipo.es_habilitante
                                      ? <span className="badge badge-green" style={{ fontSize: 10 }}>Sí</span>
                                      : <span className="badge badge-gray" style={{ fontSize: 10 }}>No</span>}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {tipo.requiere_validacion
                                      ? <span className="badge badge-cyan" style={{ fontSize: 10 }}>RRHH</span>
                                      : <span className="badge badge-gray" style={{ fontSize: 10 }}>Auto</span>}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={esRequerido}
                                      disabled={saving}
                                      title={esRequerido ? 'Quitar requisito' : 'Marcar como requerido'}
                                      style={{ width: 16, height: 16, cursor: saving ? 'wait' : 'pointer', accentColor: 'var(--cyan)' }}
                                      onChange={() => toggle(tipo, 'requerido')}
                                    />
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {esRequerido ? (
                                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: saving ? 'wait' : 'pointer', fontSize: 12 }}>
                                        <input
                                          type="checkbox"
                                          checked={Boolean(req?.obligatorio)}
                                          disabled={saving}
                                          style={{ width: 16, height: 16, accentColor: 'var(--cyan)' }}
                                          onChange={() => toggle(tipo, 'obligatorio')}
                                        />
                                        {req?.obligatorio ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Sí</span> : <span style={{ color: 'var(--fg-muted)' }}>No</span>}
                                      </label>
                                    ) : (
                                      <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {saving && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--cyan)', textAlign: 'right' }}>Guardando...</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Catalogo de mantenimiento de Posiciones (listado plano, no arbol -- complementa al Organigrama,
// que oculta posiciones matriciales y no permite filtrar). Reutiliza reasignarUnidadDePosicion,
// reasignarCargoDePosicion, crearPosicion y AsignacionCargosModal tal cual -- no duplica logica.
// Contenido de la pestaña "Gestion de Posiciones" del Organigrama: listado plano con filtros,
// complementa al arbol (que oculta posiciones matriciales y no permite filtrar). Presentacional
// puro -- recibe todo por props desde Organigrama(), que ya calcula posicionesDeEmpresa/
// ocupantesPorPosicion/unidadNombrePorId/posicionPorId para el arbol; no los recalcula aqui.
// "Asignar cargos" vive una sola vez en Organigrama (boton del header, compartido por ambas
// pestañas) para no duplicar la misma accion en dos lugares de la misma pantalla.
function GestionPosicionesTab({
  posiciones = [], posicionesUsuarios = [], ocupantesPorPosicion, unidadNombrePorId, posicionPorId,
  unidadesOrganizacionales = [], cargos = [], usuarios = [],
  reasignarUnidadDePosicion, reasignarCargoDePosicion, crearPosicion, archivarPosicion, eliminarPosicion, addNotificacion,
}) {
  const [filtroUnidad, setFiltroUnidad] = React.useState('');
  const [filtroCargo, setFiltroCargo] = React.useState('');
  const [filtroEstado, setFiltroEstado] = React.useState('');
  const [showCrearVacante, setShowCrearVacante] = React.useState(false);
  const [reasignandoUnidadId, setReasignandoUnidadId] = React.useState(null);
  const [nuevaUnidadInline, setNuevaUnidadInline] = React.useState('');
  const [guardandoUnidadInline, setGuardandoUnidadInline] = React.useState(false);
  const [editandoCargoId, setEditandoCargoId] = React.useState(null);
  const [nuevoCargoInline, setNuevoCargoInline] = React.useState('');
  const [guardandoCargoInline, setGuardandoCargoInline] = React.useState(false);

  const cargoNombrePorId = React.useMemo(() => new Map(cargos.map(c => [c.id, c.nombre])), [cargos]);

  const posicionesFiltradas = React.useMemo(() => posiciones.filter(p => {
    if (filtroUnidad && p.unidad_organizacional_id !== filtroUnidad) return false;
    if (filtroCargo === '__sin_cargo__' && p.cargo_id) return false;
    if (filtroCargo && filtroCargo !== '__sin_cargo__' && p.cargo_id !== filtroCargo) return false;
    if (filtroEstado === 'vacante' && p.estado !== 'vacante') return false;
    if (filtroEstado === 'ocupada' && p.estado === 'vacante') return false;
    return true;
  }), [posiciones, filtroUnidad, filtroCargo, filtroEstado]);

  const metrics = React.useMemo(() => {
    const total = posicionesFiltradas.length;
    let cubiertas = 0;
    let vacantes = 0;
    for (const p of posicionesFiltradas) {
      if (p.estado === 'vacante') vacantes++;
      else cubiertas++;
    }
    const ocupacion = total ? Math.round((cubiertas / total) * 100) : 0;
    return { total, cubiertas, vacantes, ocupacion };
  }, [posicionesFiltradas]);

  // Agrupacion por unidad para las tarjetas y la tabla
  const gruposPorUnidad = React.useMemo(() => {
    const map = new Map(); // unidadId -> { posiciones: [], cubiertas: 0, vacantes: 0 }
    posicionesFiltradas.forEach(p => {
      const uid = p.unidad_organizacional_id || '__sin_unidad__';
      if (!map.has(uid)) {
        map.set(uid, {
          unidadId: uid,
          nombre: uid === '__sin_unidad__' ? 'Sin unidad' : (unidadNombrePorId.get(uid) || 'Sin unidad'),
          posiciones: [],
          cubiertas: 0,
          vacantes: 0,
        });
      }
      const g = map.get(uid);
      g.posiciones.push(p);
      if (p.estado === 'vacante') g.vacantes++;
      else g.cubiertas++;
    });
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [posicionesFiltradas, unidadNombrePorId]);

  const labelReportaA = (posicion) => {
    if (!posicion.reporta_a_posicion_id) return <span className="text-subtle">Sin jefe (nivel superior)</span>;
    const jefe = posicionPorId.get(posicion.reporta_a_posicion_id);
    if (!jefe) return <span className="text-subtle">—</span>;
    const ocupantesJefe = ocupantesPorPosicion.get(jefe.id) || [];
    return ocupantesJefe.length
      ? ocupantesJefe.map(o => o.nombre).join(' + ')
      : <span className="text-subtle" style={{ fontStyle: 'italic' }}>Posición vacante</span>;
  };

  const estadoBadge = (estado) => {
    if (estado === 'vacante') return <span className="badge badge-gray">Vacante</span>;
    if (estado === 'parcial') return <span className="badge badge-orange">Parcial</span>;
    return <span className="badge badge-green">Cubierta</span>;
  };

  const iniciarReasignarUnidad = (posicion) => {
    setReasignandoUnidadId(posicion.id);
    setNuevaUnidadInline(posicion.unidad_organizacional_id || '');
  };
  const cancelarReasignarUnidad = () => { setReasignandoUnidadId(null); setNuevaUnidadInline(''); };
  const guardarReasignarUnidad = async (posicion) => {
    if (!nuevaUnidadInline || nuevaUnidadInline === posicion.unidad_organizacional_id) { cancelarReasignarUnidad(); return; }
    setGuardandoUnidadInline(true);
    try {
      await reasignarUnidadDePosicion(posicion.id, nuevaUnidadInline);
      addNotificacion('Unidad organizacional actualizada.');
    } catch {
      addNotificacion('No se pudo actualizar la unidad organizacional.');
    }
    setGuardandoUnidadInline(false);
    cancelarReasignarUnidad();
  };

  const iniciarEditarCargo = (posicion) => {
    setEditandoCargoId(posicion.id);
    setNuevoCargoInline(posicion.cargo_id || '');
  };
  const cancelarEditarCargo = () => { setEditandoCargoId(null); setNuevoCargoInline(''); };
  const guardarEditarCargo = async (posicion) => {
    if (nuevoCargoInline === (posicion.cargo_id || '')) { cancelarEditarCargo(); return; }
    setGuardandoCargoInline(true);
    try {
      await reasignarCargoDePosicion(posicion.id, nuevoCargoInline || null);
      addNotificacion('Cargo de la posición actualizado.');
    } catch {
      addNotificacion('No se pudo actualizar el cargo de la posición.');
    }
    setGuardandoCargoInline(false);
    cancelarEditarCargo();
  };

  const confirmarEliminar = async (posicionId) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar esta posición vacante? Esta acción no se puede deshacer.')) {
      try {
        await eliminarPosicion(posicionId);
        addNotificacion('Posición eliminada correctamente.');
      } catch (err) {
        addNotificacion('Error al eliminar la posición.');
      }
    }
  };

  const confirmarArchivar = async (posicionId) => {
    if (window.confirm('Esta posición tuvo ocupantes en el pasado. Será archivada para mantener el historial, pero ya no aparecerá como disponible. ¿Deseas continuar?')) {
      try {
        await archivarPosicion(posicionId);
        addNotificacion('Posición archivada correctamente.');
      } catch (err) {
        addNotificacion('Error al archivar la posición.');
      }
    }
  };

  return (
    <>
      <div className="kpi-grid mb-6">
        <div className="kpi-card">
          <div className="kpi-label">Headcount Total</div>
          <div className="kpi-value">{metrics.total}</div>
          <div className="kpi-icon cyan">{I.users}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cubiertas</div>
          <div className="kpi-value">{metrics.cubiertas}</div>
          <div className="kpi-icon green">{I.check}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Vacantes</div>
          <div className="kpi-value">{metrics.vacantes}</div>
          <div className="kpi-icon orange">{I.alertCircle}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">% Ocupación</div>
          <div className="kpi-value">{metrics.ocupacion}%</div>
          <div className="kpi-icon purple">{I.activity}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        {gruposPorUnidad.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
            {gruposPorUnidad.map(g => {
              const progreso = g.posiciones.length ? (g.cubiertas / g.posiciones.length) * 100 : 0;
              const isActive = filtroUnidad === g.unidadId || (!filtroUnidad && g.unidadId === '__sin_unidad__');
              return (
                <div 
                  key={g.unidadId} 
                  className="kpi-card" 
                  style={{ cursor: 'pointer', outline: isActive && filtroUnidad ? '2px solid var(--cyan)' : 'none', padding: '12px 16px', minHeight: 0 }}
                  onClick={() => setFiltroUnidad(filtroUnidad === g.unidadId ? '' : g.unidadId)}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={g.nombre}>
                    {g.nombre}
                  </div>
                  <div style={{ width: '100%', height: 4, backgroundColor: 'var(--bg-hover)', borderRadius: 2, marginBottom: 8 }}>
                    <div style={{ width: progreso + '%', height: '100%', backgroundColor: 'var(--cyan)', borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                    {g.cubiertas} cubiertas · {g.vacantes} vacantes
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <select className="input" style={{ flex: '1 1 200px' }} value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)}>
            <option value="">Todas las unidades</option>
            {unidadesOrganizacionales.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select className="input" style={{ flex: '1 1 200px' }} value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}>
            <option value="">Todos los cargos</option>
            <option value="__sin_cargo__">Sin cargo</option>
            {cargos.filter(c => c.estado === 'activo').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="input" style={{ flex: '1 1 160px' }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="vacante">Vacante</option>
            <option value="ocupada">Ocupada</option>
          </select>
          <button className="btn btn-secondary" onClick={() => setShowCrearVacante(true)}>{I.plus} Crear posición vacante</button>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Unidad</th><th>Cargo</th><th>Estado</th><th>Ocupante(s)</th><th>Reporta a</th><th style={{ textAlign: 'right' }}>Acciones</th></tr></thead>
            <tbody>
              {gruposPorUnidad.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 24 }}>Sin posiciones que coincidan con los filtros.</td></tr>
              )}
              {gruposPorUnidad.map(g => (
                <React.Fragment key={g.unidadId}>
                  <tr style={{ backgroundColor: 'var(--surface-1)' }}>
                    <td colSpan={6} style={{ borderTop: '2px solid var(--border-color)', fontWeight: 600, fontSize: 13, paddingTop: 16, paddingBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{g.nombre}</span>
                        <span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 12 }}>{g.cubiertas} cubiertas · {g.vacantes} vacantes</span>
                      </div>
                    </td>
                  </tr>
                  {g.posiciones.map(p => {
                    const ocupantes = ocupantesPorPosicion.get(p.id) || [];
                    const isOcupada = p.estado === 'cubierta' || p.estado === 'parcial';
                    const isVacante = p.estado === 'vacante';
                    const hasHistorial = posicionesUsuarios.some(pu => pu.posicion_id === p.id);

                    return (
                      <tr key={p.id}>
                        <td className="text-muted" style={{ fontSize: 12 }}>{g.nombre}</td>
                        <td className="text-muted" style={{ fontSize: 12 }}>{cargoNombrePorId.get(p.cargo_id) || <span className="text-subtle">Sin cargo</span>}</td>
                        <td>
                          {estadoBadge(p.estado)}
                          {isVacante && (
                            <span style={{ fontSize: 10, color: 'var(--fg-muted)', marginLeft: 4 }}>
                              {hasHistorial ? '[H: Sí]' : '[H: No]'}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, fontStyle: ocupantes.length ? 'normal' : 'italic' }}>
                          {ocupantes.length ? ocupantes.map(o => o.nombre).join(' + ') : <span className="text-subtle">Vacante</span>}
                        </td>
                        <td style={{ fontSize: 12 }}>{labelReportaA(p)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {reasignandoUnidadId === p.id ? (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <select className="select" style={{ fontSize: 11 }} value={nuevaUnidadInline} onChange={e => setNuevaUnidadInline(e.target.value)}>
                                {unidadesOrganizacionales.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                              </select>
                              <button className="btn btn-sm btn-primary" disabled={guardandoUnidadInline} onClick={() => guardarReasignarUnidad(p)}>Guardar</button>
                              <button className="btn btn-sm btn-ghost" onClick={cancelarReasignarUnidad}>Cancelar</button>
                            </div>
                          ) : editandoCargoId === p.id ? (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <select className="select" style={{ fontSize: 11 }} value={nuevoCargoInline} onChange={e => setNuevoCargoInline(e.target.value)}>
                                <option value="">Sin cargo</option>
                                {cargos.filter(c => c.estado === 'activo').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                              </select>
                              <button className="btn btn-sm btn-primary" disabled={guardandoCargoInline} onClick={() => guardarEditarCargo(p)}>Guardar</button>
                              <button className="btn btn-sm btn-ghost" onClick={cancelarEditarCargo}>Cancelar</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              <button className="btn btn-sm btn-ghost" onClick={() => iniciarReasignarUnidad(p)}>Reasignar unidad</button>
                              <button className="btn btn-sm btn-ghost" onClick={() => iniciarEditarCargo(p)}>Editar cargo</button>
                              {isVacante && !hasHistorial && (
                                <button className="btn btn-sm btn-ghost" style={{color:'var(--danger)'}} title="Eliminar posición vacante" onClick={() => confirmarEliminar(p.id)}>
                                  {I.trash} Eliminar
                                </button>
                              )}
                              {isVacante && hasHistorial && (
                                <button className="btn btn-sm btn-ghost" title="Archivar posición (preservar historial)" onClick={() => confirmarArchivar(p.id)}>
                                  {I.archive} Archivar
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCrearVacante && (
        <div className="modal-backdrop" onClick={() => setShowCrearVacante(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <h3>Crear posición vacante</h3>
              <button className="icon-btn" onClick={() => setShowCrearVacante(false)}>{I.x}</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12 }}>
                Usa "+ Crear nueva posición" para reservar una plaza sin asignarla a nadie todavía. También puedes elegir una posición vacante existente del listado si corresponde.
              </p>
              <PosicionSelector
                label="Posición"
                value=""
                onChange={(id) => { if (id) { setShowCrearVacante(false); addNotificacion('Posición vacante lista.'); } }}
                posiciones={posiciones}
                posicionesUsuarios={posicionesUsuarios}
                unidadesOrganizacionales={unidadesOrganizacionales}
                cargos={cargos}
                usuarios={usuarios}
                onCrearPosicion={crearPosicion}
                allowCrear
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
// ============ CONFIGURACIÓN Y MAESTROS ============
function Maestros() {
  const {
    navigate, cuentas, proveedores, personalAdmin = [], personalOperativo = [],
    areasEmpresa, cargos, especialidades, nivelesJerarquicos, tiposServicio, almacenes, sedes, industrias,
    monedasImpuestosUnidades = [],
    unidadesOrganizacionales = [], crearUnidadOrganizacional, actualizarUnidadOrganizacional, eliminarUnidadOrganizacional,
    crearCargo, actualizarCargo, eliminarCargo, fusionarCargos,
    crearEspecialidad, actualizarEspecialidad, eliminarEspecialidad,
    crearNivelJerarquico, actualizarNivelJerarquico, eliminarNivelJerarquico,
    crearTipoServicio, actualizarTipoServicio, eliminarTipoServicio,
    crearAlmacen, actualizarAlmacen, eliminarAlmacen,
    crearSede, actualizarSede, eliminarSede,
    crearIndustria, actualizarIndustria, eliminarIndustria,
    crearMonedaImpuestoUnidad, actualizarMonedaImpuestoUnidad, eliminarMonedaImpuestoUnidad,
    tiposContrato = [], crearTipoContrato, actualizarTipoContrato, eliminarTipoContrato,
    tiposDocumento = [], crearTipoDocumento, actualizarTipoDocumento, importarPlantillaTiposDoc,
    requisitosCargo = [], upsertRequisitoCargo, eliminarRequisitoCargo,
    posiciones = [], posicionesUsuarios = [], usuarios = [],
    addNotificacion, materiales = [], fabricantes = [], crearFabricanteCtx, actualizarFabricanteCtx
  } = useApp();
  const {
    centrosCosto, centrosBeneficio, empresa, perfilSociedad, sociedadesIdsAlcance,
    sociedadActiva, sociedadesDisponibles = [],
  } = useApp();
  const modoVistaSociedadMaestros = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });
  const centrosCostoEscrituraMaestros = (centrosCosto || []).filter(c => (
    !modoVistaSociedadMaestros.sociedadIdEscritura
    || c.sociedad_id === modoVistaSociedadMaestros.sociedadIdEscritura
  ));
  const [sel, setSel] = useState(null);
  const [checkedIds, setCheckedIds] = useState([]);
  useEffect(() => { setCheckedIds([]); }, [sel]);
  const [showCecoCebe, setShowCecoCebe] = useState(false);
  const [showRequisitos, setShowRequisitos] = useState(false);
  const [showTiposDocumento, setShowTiposDocumento] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [fusionOrigenId, setFusionOrigenId] = useState(null);
  const [fusionDestinoId, setFusionDestinoId] = useState('');
  const [fusionSaving, setFusionSaving] = useState(false);
  const [matrizCargoId, setMatrizCargoId] = useState('');
  const [matrizSaving, setMatrizSaving] = useState(false);
  const formRef = React.useRef(null);
  const [clienteSearch, setClienteSearch] = useState('');

  // Solo para mostrar el ocupante de responsable_compras_posicion_id en el catalogo de
  // referencia de Proveedores (la gestion real vive en Compras -> Proveedores).
  const usuariosPorId = useMemo(() => new Map(usuarios.map(u => [u.id, u])), [usuarios]);
  const posicionPorId = useMemo(() => new Map(posiciones.map(p => [p.id, p])), [posiciones]);
  const ocupantesPorPosicion = useMemo(
    () => buildOcupantesPorPosicion(posicionesUsuarios, usuariosPorId, posicionPorId),
    [posicionesUsuarios, usuariosPorId, posicionPorId]
  );
  const nombreResponsableCompras = (posicionId) => {
    if (!posicionId) return null;
    const ocupantes = ocupantesPorPosicion.get(posicionId) || [];
    return ocupantes.length ? ocupantes.map(o => o.nombre).join(' + ') : 'Vacante';
  };

  const maestrosCatalogos = [
    { id: 'mst_industrias', tabla: 'Industrias' },
    { id: 'mst_sedes', tabla: 'Sedes y ubicaciones GPS' },
    { id: 'mst_ceco_cebe', tabla: 'Centros de Costo y Beneficio' },
    { id: 'mst_unidades_organizacionales', tabla: 'Unidades Organizacionales' },
    { id: 'mst_cargos', tabla: 'Cargos de la empresa' },
    { id: 'mst_tipos_documento', tabla: 'Tipos de Documento' },
    { id: 'mst_requisitos_cargo', tabla: 'Requisitos por Cargo' },
    { id: 'mst_especialidades', tabla: 'Especialidades técnicas' },
    { id: 'mst_niveles_jerarquicos', tabla: 'Niveles Jerárquicos' },
    { id: 'mst_materiales', tabla: 'Materiales e insumos con codigo de barras' },
    { id: 'mst_impuestos', tabla: 'Monedas, impuestos y unidades' },
    { id: 'mst_tipos_servicio', tabla: 'Tipos de servicio interno' },
    { id: 'mst_almacenes', tabla: 'Almacenes y depósitos' },
    { id: 'mst_fabricantes', tabla: 'Fabricantes' },
    { id: 'mst_tipos_contrato', tabla: 'Tipos de Contrato' },
  ];
  const nuevoBase = { codigo:'', nombre:'', detalle:'', estado:'activo', area:'', requiere_cert:false, clasificacion:'', facturable:false, tipo:'', responsable:'', direccion:'', tipo_cargo:'', modo_gestion:'individual', tipo_catalogo:'moneda', ambito:'Ambos', exige_vencimiento:false, dias_alerta:30, es_habilitante:false, requiere_validacion:true, orden:0, unidad_padre_id:'', ceco_id:'', categoria:'otro', alcance:'propio' };
  const [rows, setRows] = useState({
    mst_clientes: [],
    mst_proveedores: [],
    mst_materiales: [],
    mst_impuestos: [],
  });
  const [nuevo, setNuevo] = useState(nuevoBase);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importStep, setImportStep] = useState(1);
  const [importandoUnidades, setImportandoUnidades] = useState(false);
  const getSelectedRows = () => {
    if (!sel) return [];
    if (sel.id === 'mst_unidades_organizacionales') return unidadesOrganizacionales;
    if (sel.id === 'mst_cargos') return cargos;
    if (sel.id === 'mst_tipos_documento') return tiposDocumento;
    if (sel.id === 'mst_requisitos_cargo') return requisitosCargo;
    if (sel.id === 'mst_especialidades') return especialidades;
    if (sel.id === 'mst_niveles_jerarquicos') return nivelesJerarquicos;
    if (sel.id === 'mst_tipos_servicio') return tiposServicio;
    if (sel.id === 'mst_almacenes') return almacenes;
    if (sel.id === 'mst_fabricantes') return fabricantes;
    if (sel.id === 'mst_sedes') return sedes;
    if (sel.id === 'mst_industrias') return industrias;
    if (sel.id === 'mst_impuestos') return monedasImpuestosUnidades;
    if (sel.id === 'mst_tipos_contrato') return tiposContrato;
    if (sel.id === 'mst_materiales') return materiales;
    return rows[sel.id] || [];
  };
  const selectedRows = getSelectedRows();
  const esImportacionUnidades = sel?.id === 'mst_unidades_organizacionales';
  const filasValidasImport = importRows.filter(row => (
    esImportacionUnidades ? row._estado === 'VALIDA' : row._errores?.length === 0
  ));

  // Ids de la propia unidad + todos sus descendientes, para excluirlos del selector de
  // "unidad padre" al editar (evita ciclos obvios en la UI; el trigger de la base de
  // datos es la proteccion real).
  const getDescendientesIds = (unidadId) => {
    const resultado = new Set([unidadId]);
    let agrego = true;
    while (agrego) {
      agrego = false;
      unidadesOrganizacionales.forEach(u => {
        if (u.unidad_padre_id && resultado.has(u.unidad_padre_id) && !resultado.has(u.id)) {
          resultado.add(u.id);
          agrego = true;
        }
      });
    }
    return resultado;
  };
  // Arbol de unidades en orden jerarquico (para la vista indentada), con huerfanos al final.
  const construirArbolUnidades = (unidades) => {
    const porPadre = new Map();
    unidades.forEach(u => {
      const key = u.unidad_padre_id || null;
      const lista = porPadre.get(key) || [];
      lista.push(u);
      porPadre.set(key, lista);
    });
    const resultado = [];
    const recorrer = (padreId, depth) => {
      const hijos = (porPadre.get(padreId) || []).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
      hijos.forEach(u => {
        resultado.push({ ...u, _depth: depth });
        recorrer(u.id, depth + 1);
      });
    };
    recorrer(null, 0);
    const incluidos = new Set(resultado.map(u => u.id));
    unidades.filter(u => !incluidos.has(u.id)).forEach(u => resultado.push({ ...u, _depth: 0 }));
    return resultado;
  };

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

  const MAESTRO_XLSX_CFG = {
    mst_unidades_organizacionales: {
      sheetName: 'Unidades Organizacionales', filename: 'unidades_organizacionales.xlsx',
      headers: ['Codigo','Unidad','Unidad padre (codigo)','CECO (codigo)','Categoria','Estado'],
      fields: ['codigo','nombre','unidad_padre_codigo','ceco_codigo','categoria','estado'],
      ejemplo: ['UO-001','Unidad de ejemplo','','','otro','activo'],
      hint: 'La unidad padre debe existir previamente en el catalogo. Categoria y Estado usan los valores de la hoja de instrucciones.',
    },
    mst_cargos: {
      sheetName: 'Cargos', filename: 'cargos.xlsx',
      headers: ['Codigo','Nombre','Tipo de personal','Descripcion','Estado'],
      fields:  ['codigo','nombre','tipo','detalle','estado'],
      ejemplo: ['CAR-001','Técnico de campo','Operativo','Ejecuta trabajos de mantenimiento','activo'],
      hint: 'Tipo de personal: Operativo / Administrativo / Ambos',
    },
    mst_especialidades: {
      sheetName: 'Especialidades', filename: 'especialidades.xlsx',
      headers: ['Codigo','Nombre','Area','Requiere certificacion','Estado'],
      fields:  ['codigo','nombre','area','requiere_cert','estado'],
      ejemplo: ['ESP-001','Electricidad industrial','Operaciones','si','activo'],
      hint: 'Requiere certificacion: si / no',
    },
    mst_tipos_servicio: {
      sheetName: 'Tipos de Servicio', filename: 'tipos_servicio.xlsx',
      headers: ['Codigo','Nombre','Clasificacion','Facturable','Estado'],
      fields:  ['codigo','nombre','clasificacion','facturable','estado'],
      ejemplo: ['TSI-001','Mantenimiento preventivo','Mantenimiento','si','activo'],
      hint: 'Facturable: si / no',
    },
    mst_almacenes: {
      sheetName: 'Almacenes', filename: 'almacenes.xlsx',
      headers: ['Codigo','Nombre','Tipo','Responsable','Direccion','Estado'],
      fields:  ['codigo','nombre','tipo','responsable','direccion','estado'],
      ejemplo: ['ALM-001','Almacén Central Lima','Central','','Av. Industrial 123','activo'],
      hint: 'Tipo: Central / Sede / Móvil / Tránsito',
    },
    mst_sedes: {
      sheetName: 'Sedes', filename: 'sedes.xlsx',
      headers: ['Codigo','Nombre','Direccion','GPS','Tipo','Estado'],
      fields:  ['codigo','nombre','direccion','gps','tipo','estado'],
      ejemplo: ['SED-001','Sede Lima Norte','Av. Naranjal 456, Lima','-12.0464,-77.0428','oficina','activo'],
      hint: 'Tipo: oficina / unidad_minera',
    },
    mst_industrias: {
      sheetName: 'Industrias', filename: 'industrias.xlsx',
      headers: ['Codigo','Nombre','Categoria','Estado'],
      fields:  ['codigo','nombre','categoria','estado'],
      ejemplo: ['IND-001','Manufactura','Industrial','activo'],
      hint: '',
    },
    mst_impuestos: {
      sheetName: 'Monedas, Impuestos y Unidades', filename: 'monedas_impuestos_unidades.xlsx',
      headers: ['Codigo','Tipo','Nombre','Detalle','Estado'],
      fields:  ['codigo','tipo','nombre','detalle','estado'],
      ejemplo: ['USD','moneda','Dólar americano','Dólar estadounidense','activo'],
      hint: 'Tipo: moneda / impuesto / unidad — Codigo es obligatorio',
    },
    mst_tipos_documento: {
      sheetName: 'TiposDocumento', filename: 'tipos_documento.xlsx',
      headers: ['Codigo','Nombre','Ambito','Exige vencimiento','Dias alerta','Es habilitante','Requiere validacion','Estado','Orden'],
      fields:  ['codigo','nombre','ambito','exige_vencimiento','dias_alerta','es_habilitante','requiere_validacion','estado','orden'],
      ejemplo: ['TDOC-001','SCTR','Operativo','si','30','si','si','activo','1'],
      hint: 'Ambito: Operativo / Administrativo / Ambos · Exige vencimiento, Es habilitante, Requiere validacion: si / no',
    },
    mst_tipos_contrato: {
      sheetName: 'TiposContrato', filename: 'tipos_contrato.xlsx',
      headers: ['Codigo','Nombre','Estado'],
      fields:  ['codigo','nombre','estado'],
      ejemplo: ['1000','PLAZO INDETERMINADO','activo'],
      hint: 'Se recomienda usar los códigos establecidos por SUNAT',
    },
  };

  const parseMstXlsx = async (file) => {
    const cfg = MAESTRO_XLSX_CFG[sel?.id]; if (!cfg) return [];
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return rawRows.map(r => {
      const row = {};
      cfg.headers.forEach((h, i) => {
        row[cfg.fields[i]] = String(r[h] ?? r[cfg.fields[i]] ?? '').trim();
      });
      return row;
    });
  };

  const validarImportMaestro = rows => {
    if (sel?.id === 'mst_unidades_organizacionales') {
      const clave = value => String(value || '').trim().toLocaleLowerCase();
      const codigoClave = value => String(value || '').trim().toUpperCase();
      const unidadesPorCodigo = new Map((unidadesOrganizacionales || []).map(u => [codigoClave(u.codigo), u]));
      const cecosPorCodigo = new Map((centrosCosto || []).map(c => [codigoClave(c.codigo), c]));
      const categoriasValidas = new Set(ROLE_CATEGORIES.map(c => c.value));
      const codigosArchivo = new Map();
      const nombresArchivo = new Map();

      (rows || []).forEach((row, index) => {
        const codigo = codigoClave(row.codigo);
        const nombre = clave(row.nombre);
        if (codigo) codigosArchivo.set(codigo, [...(codigosArchivo.get(codigo) || []), index + 2]);
        if (nombre) nombresArchivo.set(nombre, [...(nombresArchivo.get(nombre) || []), index + 2]);
      });

      return (rows || []).map((source, index) => {
        const codigo = String(source.codigo || '').trim();
        const nombre = String(source.nombre || '').trim();
        const unidad_padre_codigo = String(source.unidad_padre_codigo || '').trim();
        const ceco_codigo = String(source.ceco_codigo || '').trim();
        const categoria = String(source.categoria || 'otro').trim().toLowerCase();
        const estado = String(source.estado || 'activo').trim().toLowerCase();
        const errores = [];
        const codigoNormalizado = codigoClave(codigo);
        const nombreNormalizado = clave(nombre);
        const padreNormalizado = codigoClave(unidad_padre_codigo);
        const cecoNormalizado = codigoClave(ceco_codigo);

        if (!codigo) errores.push('Codigo obligatorio.');
        if (!nombre) errores.push('Unidad obligatoria.');
        if (!['activo', 'inactivo'].includes(estado)) errores.push('Estado invalido: usa activo o inactivo.');
        if (!categoriasValidas.has(categoria)) errores.push(`Categoria invalida: "${categoria || '-'}".`);
        if (codigoNormalizado && unidadesPorCodigo.has(codigoNormalizado)) errores.push(`Codigo duplicado: "${codigo}" ya existe.`);
        if (nombreNormalizado && (unidadesOrganizacionales || []).some(u => clave(u.nombre) === nombreNormalizado)) errores.push(`Unidad duplicada: "${nombre}" ya existe.`);
        const filasCodigo = codigosArchivo.get(codigoNormalizado) || [];
        const filasNombre = nombresArchivo.get(nombreNormalizado) || [];
        if (codigoNormalizado && filasCodigo.length > 1) errores.push(`Codigo duplicado en archivo: filas ${filasCodigo.join(', ')}.`);
        if (nombreNormalizado && filasNombre.length > 1) errores.push(`Unidad duplicada en archivo: filas ${filasNombre.join(', ')}.`);
        if (padreNormalizado) {
          if (padreNormalizado === codigoNormalizado) errores.push('La unidad padre no puede ser la misma unidad.');
          else if (!unidadesPorCodigo.has(padreNormalizado)) errores.push(`Unidad padre inexistente: "${unidad_padre_codigo}". Debe existir antes de importar.`);
        }
        if (cecoNormalizado && !cecosPorCodigo.has(cecoNormalizado)) errores.push(`CECO inexistente en el tenant: "${ceco_codigo}".`);

        return {
          ...source,
          _fila: index + 2,
          codigo,
          nombre,
          unidad_padre_codigo,
          ceco_codigo,
          categoria,
          estado,
          _errores: errores,
          _estado: errores.length ? 'RECHAZADA' : 'VALIDA',
        };
      });
    }

    return rows.map(r => {
    const errores = [];
    const estadoNorm = (r.estado||'').trim().toLowerCase();
    if (!r.nombre) errores.push('Nombre vacío');
    if (sel?.id === 'mst_impuestos' && !r.codigo) errores.push('Código vacío');
    if (estadoNorm && !['activo','inactivo'].includes(estadoNorm)) errores.push('Estado inválido');
    if (r.nombre && selectedRows.some(x=>x.nombre===r.nombre)) errores.push('Nombre ya existe');
    const tipoNorm = (r.tipo||'').trim().toLowerCase();
    if (sel?.id === 'mst_sedes' && tipoNorm && !['oficina','unidad_minera'].includes(tipoNorm)) {
      errores.push(`Tipo inválido: "${r.tipo}" (debe ser "oficina" o "unidad_minera")`);
    }
      return { ...r, estado: estadoNorm || 'activo', tipo: sel?.id === 'mst_sedes' ? (tipoNorm || 'oficina') : r.tipo, _errores: errores };
    });
  };

  const exportarMaestro = () => {
    const cfg = MAESTRO_XLSX_CFG[sel?.id]; if (!cfg) return;
    if (sel?.id === 'mst_unidades_organizacionales') {
      const unidadPorId = new Map((unidadesOrganizacionales || []).map(u => [u.id, u]));
      const cecoPorId = new Map((centrosCosto || []).map(c => [c.id, c]));
      const data = (selectedRows || []).map(unidad => ({
        'Codigo': unidad.codigo || '',
        'Unidad': unidad.nombre || '',
        'Unidad padre (codigo)': unidadPorId.get(unidad.unidad_padre_id)?.codigo || '',
        'CECO (codigo)': cecoPorId.get(unidad.ceco_id)?.codigo || '',
        'Categoria': unidad.categoria || 'otro',
        'Estado': unidad.estado || 'activo',
      }));
      const ws = XLSX.utils.json_to_sheet(data, { header: cfg.headers });
      ws['!cols'] = cfg.headers.map((header, index) => ({ wch: index === 1 ? 34 : Math.max(18, header.length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName);
      XLSX.writeFile(wb, cfg.filename);
      return;
    }
    const data = selectedRows.map(r => {
      const row = {};
      cfg.headers.forEach((h, i) => {
        const f = cfg.fields[i];
        if (f === 'categoria') row[h] = r.categoria || r.detalle || '';
        else if (f === 'requiere_cert') row[h] = r.requiere_cert ? 'si' : 'no';
        else if (f === 'facturable') row[h] = r.facturable ? 'si' : 'no';
        else row[h] = r[f] ?? '';
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: cfg.headers });
    ws['!cols'] = cfg.headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName);
    XLSX.writeFile(wb, cfg.filename);
  };

  const descargarPlantillaMaestro = () => {
    const cfg = MAESTRO_XLSX_CFG[sel?.id]; if (!cfg) return;
    if (sel?.id === 'mst_unidades_organizacionales') {
      const dataSheet = XLSX.utils.aoa_to_sheet([
        cfg.headers,
        cfg.ejemplo,
      ]);
      dataSheet['!cols'] = cfg.headers.map((header, index) => ({ wch: index === 1 ? 34 : Math.max(18, header.length + 2) }));

      const cecosActivos = (centrosCosto || [])
        .filter(ceco => ceco.estado === 'activo')
        .map(ceco => [ceco.codigo || '', ceco.nombre || '']);
      const instrucciones = XLSX.utils.aoa_to_sheet([
        ['Plantilla de Unidades Organizacionales'],
        [],
        ['Instrucciones'],
        ['1', 'Codigo: obligatorio y unico dentro del tenant.'],
        ['2', 'Unidad: nombre obligatorio y unico dentro del tenant.'],
        ['3', 'Unidad padre (codigo): opcional. Debe existir previamente en el catalogo; no se crean padres desde el archivo.'],
        ['4', 'CECO (codigo): opcional. Si se informa, debe existir en el tenant.'],
        ['5', 'Categoria: admin, comercial, operaciones, finanzas, rrhh, compras, logistica, customer_success u otro.'],
        ['6', 'Estado: activo o inactivo.'],
        ['7', 'Las filas con errores se rechazan y las filas validas se pueden importar.'],
        [],
        ['CECOs activos al momento de descargar'],
        ['Codigo CECO', 'Nombre CECO'],
        ...cecosActivos,
      ]);
      instrucciones['!cols'] = [{ wch: 42 }, { wch: 110 }];
      instrucciones['!protect'] = { selectLockedCells: true, selectUnlockedCells: false };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, dataSheet, cfg.sheetName);
      XLSX.utils.book_append_sheet(wb, instrucciones, 'Instrucciones');
      XLSX.writeFile(wb, 'plantilla_unidades_organizacionales.xlsx');
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet([cfg.headers, cfg.ejemplo]);
    ws['!cols'] = cfg.headers.map((_, i) => ({ wch: i <= 1 ? 14 : i === 2 ? 28 : 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName);
    XLSX.writeFile(wb, `plantilla_${cfg.filename}`);
  };

  const importarUnidadesOrganizacionales = async () => {
    if (importandoUnidades) return;
    const unidadesPorCodigo = new Map((unidadesOrganizacionales || []).map(u => [String(u.codigo || '').trim().toUpperCase(), u]));
    const cecosPorCodigo = new Map((centrosCosto || []).map(c => [String(c.codigo || '').trim().toUpperCase(), c]));
    const resultado = [];
    let creadas = 0;
    let fallidas = 0;
    let rechazadas = 0;

    setImportandoUnidades(true);
    try {
      for (const fila of importRows) {
        if (fila._errores?.length) {
          rechazadas++;
          resultado.push({ ...fila, _estado: 'RECHAZADA' });
          continue;
        }
        try {
          const padre = fila.unidad_padre_codigo
            ? unidadesPorCodigo.get(String(fila.unidad_padre_codigo).trim().toUpperCase())
            : null;
          const ceco = fila.ceco_codigo
            ? cecosPorCodigo.get(String(fila.ceco_codigo).trim().toUpperCase())
            : null;
          await crearUnidadOrganizacional({
            codigo: fila.codigo,
            nombre: fila.nombre,
            unidad_padre_id: padre?.id || null,
            ceco_id: ceco?.id || null,
            categoria: fila.categoria,
            estado: fila.estado,
          });
          creadas++;
          resultado.push({ ...fila, _estado: 'CREADA', _errores: [] });
        } catch (error) {
          fallidas++;
          resultado.push({
            ...fila,
            _estado: 'FALLIDA',
            _errores: [...(fila._errores || []), error?.message || 'No se pudo crear la unidad.'],
          });
        }
      }
      setImportRows(resultado);
      setImportStep(2);
      addNotificacion?.(`Importacion finalizada: ${creadas} creadas, ${rechazadas} rechazadas y ${fallidas} fallidas.`);
    } finally {
      setImportandoUnidades(false);
    }
  };

  const doImportMaestro = async (btn) => {
    btn.disabled = true; btn.textContent = 'Importando...';
    const valid = importRows.filter(r=>r._errores.length===0).map(({_errores,...r})=>r);
    let count = 0;
    try {
      for (let i = 0; i < valid.length; i++) {
        const r = valid[i];
        const base = { codigo: autoCode(sel.id, selectedRows.length + i), nombre: r.nombre, estado: r.estado || 'activo' };
        if (sel.id === 'mst_cargos') await crearCargo({ ...base, tipo: r.tipo || 'Administrativo', detalle: r.detalle || '' });
        else if (sel.id === 'mst_especialidades') await crearEspecialidad({ ...base, area: r.area || 'General', requiere_cert: (r.requiere_cert||'').toLowerCase()==='si' });
        else if (sel.id === 'mst_tipos_servicio') await crearTipoServicio({ ...base, clasificacion: r.clasificacion || 'General', facturable: (r.facturable||'').toLowerCase()==='si' });
        else if (sel.id === 'mst_almacenes') await crearAlmacen({ ...base, tipo: r.tipo || 'Central', responsable: r.responsable || '', direccion: r.direccion || '' });
        else if (sel.id === 'mst_sedes') await crearSede({ ...base, direccion: r.direccion || '', gps: r.gps || '', tipo: r.tipo || 'oficina' });
        else if (sel.id === 'mst_industrias') await crearIndustria({ ...base, categoria: r.categoria || r.detalle || 'General' });
        else if (sel.id === 'mst_impuestos') await crearMonedaImpuestoUnidad({ codigo: (r.codigo||'').trim().toUpperCase(), tipo: r.tipo || 'moneda', nombre: r.nombre, detalle: r.detalle || '', estado: r.estado || 'activo' });
        else if (sel.id === 'mst_tipos_documento') await crearTipoDocumento({ ...base, ambito: r.ambito || 'Ambos', exige_vencimiento: (r.exige_vencimiento||'').toLowerCase()==='si', dias_alerta: parseInt(r.dias_alerta)||30, es_habilitante: (r.es_habilitante||'').toLowerCase()==='si', requiere_validacion: (r.requiere_validacion||'si').toLowerCase()==='si', orden: parseInt(r.orden)||0 });
        else if (sel.id === 'mst_tipos_contrato') await crearTipoContrato({ codigo: (r.codigo||'').trim(), nombre: r.nombre, estado: r.estado || 'activo' });
        count++;
      }
      addNotificacion?.(`${count} registros importados correctamente.`);
      setImportModal(false);
    } catch(err) {
      btn.disabled = false; btn.textContent = 'Reintentar';
      addNotificacion?.(`Error al importar: ${err?.message || 'Error desconocido'}.`, 'error');
    }
  };

  const autoCode = (id, len) => {
    const prefixMap = { mst_unidades_organizacionales:'UO', mst_cargos:'CAR', mst_especialidades:'ESP', mst_tipos_servicio:'TSI', mst_almacenes:'ALM', mst_fabricantes:'FAB', mst_sedes:'SED', mst_industrias:'IND', mst_clientes:'CLI', mst_proveedores:'PRV', mst_centros_costo:'CC', mst_materiales:'MAT', mst_impuestos:'TAX', mst_tipos_documento:'TDOC', mst_requisitos_cargo:'CDR', mst_tipos_contrato:'TCON' };
    const prefix = prefixMap[id] || id.slice(4,7).toUpperCase();
    return `${prefix}-${String(len+1).padStart(3,'0')}`;
  };

  // El codigo de un nivel jerarquico es el valor real guardado en roles.nivel_jerarquico
  // (ej. 'practicante'), no un correlativo decorativo — se deriva del nombre.
  const slugifyNivel = (nombre) => String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  // Cuenta asignaciones vigentes en personal_asignaciones_um (sin fecha_fin, o con
  // fecha_fin >= hoy) para una sede — mismo criterio de "vigente" que ya usa la
  // grilla del roster (pages_ops.jsx, rosterGridGrupos) para no definirlo dos veces
  // de forma distinta. Usado para bloquear el downgrade de unidad_minera a oficina
  // si hay trabajadores dependiendo de ella. Consulta directa a Supabase: no se
  // toca ni se reutiliza el servicio del roster.
  const contarAsignacionesUmVigentes = async (sedeId) => {
    if (!isSupabaseConfigured()) return 0;
    const supabase = await getSupabaseClient();
    const hoy = new Date().toISOString().split('T')[0];
    const { count, error } = await supabase
      .from('personal_asignaciones_um')
      .select('id', { count: 'exact', head: true })
      .eq('sede_id', sedeId)
      .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`);
    if (error) throw error;
    return count || 0;
  };

  const addRow = async (e) => {
    e.preventDefault();
    if (!sel) return;
    setFormSaving(true);
    setFormError('');
    const base = {
      codigo: editandoId ? nuevo.codigo : (nuevo.codigo ?? autoCode(sel.id, selectedRows.length)),
      nombre: nuevo.nombre || 'Nuevo valor',
      estado: nuevo.estado
    };
    try {
      if (sel.id === 'mst_unidades_organizacionales') {
        const item = { ...base, unidad_padre_id: nuevo.unidad_padre_id || null, ceco_id: nuevo.ceco_id || null, categoria: nuevo.categoria || 'otro' };
        if (editandoId) await actualizarUnidadOrganizacional(editandoId, item);
        else await crearUnidadOrganizacional(item);
      } else if (sel.id === 'mst_cargos') {
        const item = { ...base, tipo: nuevo.tipo_cargo || 'Administrativo', detalle: nuevo.detalle || 'Pendiente de completar', modo_gestion: nuevo.modo_gestion || 'individual' };
        if (editandoId) await actualizarCargo(editandoId, item);
        else await crearCargo(item);
      } else if (sel.id === 'mst_especialidades') {
        const item = { ...base, area: nuevo.area || 'General', requiere_cert: nuevo.requiere_cert };
        if (editandoId) await actualizarEspecialidad(editandoId, item);
        else await crearEspecialidad(item);
      } else if (sel.id === 'mst_niveles_jerarquicos') {
        const item = {
          codigo: editandoId ? nuevo.codigo : (nuevo.codigo ?? slugifyNivel(nuevo.nombre)),
          nombre: nuevo.nombre || 'Nuevo valor',
          alcance: nuevo.alcance || 'propio',
          orden: parseInt(nuevo.orden) || 100,
          estado: nuevo.estado || 'activo',
        };
        if (!item.codigo) throw new Error('Completa el nombre para generar el codigo del nivel.');
        if (editandoId) await actualizarNivelJerarquico(editandoId, item);
        else await crearNivelJerarquico(item);
      } else if (sel.id === 'mst_tipos_servicio') {
        const item = { ...base, clasificacion: nuevo.clasificacion || 'General', facturable: nuevo.facturable };
        if (editandoId) await actualizarTipoServicio(editandoId, item);
        else await crearTipoServicio(item);
      } else if (sel.id === 'mst_almacenes') {
        const item = { ...base, tipo: nuevo.tipo || 'Central', responsable: nuevo.responsable || '', direccion: nuevo.direccion || '' };
        if (editandoId) await actualizarAlmacen(editandoId, item);
        else await crearAlmacen(item);
      } else if (sel.id === 'mst_fabricantes') {
        const item = { ...base, nombre: String(nuevo.nombre || '').trim(), estado: nuevo.estado || 'activo' };
        if (!item.nombre) throw new Error('Completa el nombre del fabricante.');
        if (editandoId) await actualizarFabricanteCtx(editandoId, item);
        else await crearFabricanteCtx(item);
      } else if (sel.id === 'mst_sedes') {
        const nuevoTipo = nuevo.tipo || 'oficina';
        if (editandoId) {
          const sedeActual = sedes.find(s => s.id === editandoId);
          if (sedeActual?.tipo === 'unidad_minera' && nuevoTipo !== 'unidad_minera') {
            const enUso = await contarAsignacionesUmVigentes(editandoId);
            if (enUso > 0) {
              setNuevo(v => ({ ...v, tipo: sedeActual.tipo }));
              throw new Error(`No se puede cambiar el tipo de "${sedeActual.nombre}" a oficina: ${enUso} trabajador(es) tienen una asignación vigente a esta unidad minera en personal_asignaciones_um. Reasigna o cierra esas asignaciones antes de cambiar el tipo.`);
            }
          }
        }
        const item = { ...base, direccion: nuevo.direccion || 'Sin direccion', gps: nuevo.gps || '', tipo: nuevoTipo };
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
      } else if (sel.id === 'mst_tipos_documento') {
        const item = {
          ...base,
          ambito: nuevo.ambito || 'Ambos',
          exige_vencimiento: Boolean(nuevo.exige_vencimiento),
          dias_alerta: parseInt(nuevo.dias_alerta) || 0,
          es_habilitante: Boolean(nuevo.es_habilitante),
          requiere_validacion: nuevo.requiere_validacion !== false,
          orden: parseInt(nuevo.orden) || 0,
        };
        if (editandoId) await actualizarTipoDocumento(editandoId, item);
        else await crearTipoDocumento(item);
      } else if (sel.id === 'mst_tipos_contrato') {
        const item = {
          codigo: String(nuevo.codigo || '').trim(),
          nombre: nuevo.nombre || 'Nuevo valor',
          estado: nuevo.estado || 'activo',
        };
        if (!item.codigo) throw new Error('Completa el codigo del tipo de contrato.');
        if (editandoId) await actualizarTipoContrato(editandoId, item);
        else await crearTipoContrato(item);
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
      } else if (rawMsg.includes('unidades_organizacionales') || (sel.id === 'mst_unidades_organizacionales' && rawMsg.includes('schema cache'))) {
        msg = 'No existe la tabla unidades_organizacionales en Supabase. Aplica las migraciones de la Fase 1 (292 en adelante) y recarga el schema cache.';
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
    mst_almacenes: 'Los almacenes se administran con stock y movimientos desde el módulo de Inventario.',
    mst_tipos_documento: 'Define qué documentos existen en tu empresa. Usa "Importar Plantilla" para partir de tipos comunes del sector minero. Puedes editarlos libremente después.',
    mst_requisitos_cargo: 'Define qué documentos requiere cada cargo. El sistema usará esta configuración para calcular el cumplimiento documental del personal.',
  };

  // No usar un componente declarado dentro de Maestros: su identidad cambiaba en
  // cada setNuevo y React desmontaba el input de código, perdiendo el foco.
  const renderCodPreview = (id, len) => (
    <div className="input-group">
      <label>Código *</label>
      <input className="input" required value={nuevo.codigo ?? autoCode(id, len)} onChange={e=>setNuevo(v=>({...v,codigo:e.target.value}))} style={{background:'var(--bg-subtle)'}} placeholder="Ej: COD-001"/>
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
      tipo_cargo: r.tipo || '',
      modo_gestion: r.modo_gestion || 'individual',
      ambito: r.ambito || 'Ambos',
      exige_vencimiento: Boolean(r.exige_vencimiento),
      dias_alerta: r.dias_alerta ?? 30,
      es_habilitante: Boolean(r.es_habilitante),
      requiere_validacion: r.requiere_validacion !== false,
      orden: r.orden ?? 0,
      unidad_padre_id: r.unidad_padre_id || '',
      ceco_id: r.ceco_id || '',
      categoria: r.categoria || 'otro',
      alcance: r.alcance || 'propio',
    };
    setEditandoId(r.id);
    setNuevo(form);
    setFormError('');
    scrollToForm();
  };

  const eliminarRegistro = async (r, silent = false) => {
    const confirmarEliminacion = sel?.id === 'mst_unidades_organizacionales'
      ? `Eliminar definitivamente la unidad organizacional "${r.nombre}"? No se puede eliminar si tiene posiciones asignadas.`
      : `Eliminar "${r.nombre}"? Esta accion se reflejara en la base de datos.`;
    if (!silent && (!sel || !window.confirm(confirmarEliminacion)) ) return;
    try {
      if (sel.id === 'mst_cargos') await eliminarCargo(r.id);
      else if (sel.id === 'mst_unidades_organizacionales') {
        await eliminarUnidadOrganizacional(r.id);
        if (editandoId === r.id) resetForm();
        if (!silent) addNotificacion?.('Unidad organizacional eliminada.');
        return;
      }
      else if (sel.id === 'mst_especialidades') await eliminarEspecialidad(r.id);
      else if (sel.id === 'mst_niveles_jerarquicos') await eliminarNivelJerarquico(r.id);
      else if (sel.id === 'mst_tipos_servicio') await eliminarTipoServicio(r.id);
      else if (sel.id === 'mst_almacenes') await eliminarAlmacen(r.id);
      else if (sel.id === 'mst_sedes') await eliminarSede(r.id);
      else if (sel.id === 'mst_industrias') await eliminarIndustria(r.id);
      else if (sel.id === 'mst_impuestos') await eliminarMonedaImpuestoUnidad(r.id);
      else if (sel.id === 'mst_tipos_contrato') await eliminarTipoContrato(r.id);
      else if (sel.id === 'mst_tipos_documento') {
        await actualizarTipoDocumento(r.id, { estado: 'inactivo' });
        if (editandoId === r.id) resetForm();
        if (!silent) addNotificacion?.(`Tipo de documento desactivado.`);
        return;
      }
      else return;
      if (editandoId === r.id) resetForm();
      if (!silent) addNotificacion?.(`${sel.tabla}: registro eliminado.`);
    } catch (err) {
      const msg = err?.message || 'No se pudo eliminar el registro.';
      setFormError(msg);
      if (!silent) addNotificacion?.(`No se pudo eliminar el registro: ${msg}`);
      throw err;
    }
  };

  const eliminarSeleccionados = async () => {
    if (!window.confirm(`¿Eliminar los ${checkedIds.length} registros seleccionados? Esta acción se reflejará en la base de datos.`)) return;
    setFormSaving(true);
    let eliminados = 0;
    for (const id of checkedIds) {
      try {
        const r = selectedRows.find(x => x.id === id);
        if (r) {
          await eliminarRegistro(r, true);
          eliminados++;
        }
      } catch (e) {
        console.error(e);
      }
    }
    setCheckedIds([]);
    setFormSaving(false);
    if (eliminados > 0) addNotificacion?.(`Se eliminaron ${eliminados} registros correctamente.`);
  };

  const RowActions = ({ item }) => (
    <div className="row" style={{justifyContent:'flex-end', gap:6}}>
      <button className="icon-btn" title="Editar" onClick={() => editarRegistro(item)} style={{color:'var(--cyan)'}}>{I.edit}</button>
      <button className="icon-btn" title="Eliminar" onClick={() => eliminarRegistro(item)} style={{color:'var(--danger)'}}>{I.trash}</button>
    </div>
  );

  const getMaestroMetaText = (mId) => {
    const emptyEl = <span style={{color: 'var(--orange)'}}>Aún no se ha cargado nada</span>;
    if (mId === 'mst_ceco_cebe') {
      const c = (centrosCosto||[]).length;
      const b = (centrosBeneficio||[]).length;
      if (c === 0 && b === 0) return emptyEl;
      return `${c} CECOs · ${b} CEBEs`;
    }
    
    let arr = [];
    switch (mId) {
      case 'mst_industrias': arr = industrias || []; break;
      case 'mst_sedes': arr = sedes || []; break;
      case 'mst_unidades_organizacionales': arr = unidadesOrganizacionales || []; break;
      case 'mst_cargos': arr = cargos || []; break;
      case 'mst_tipos_documento': arr = tiposDocumento || []; break;
      case 'mst_requisitos_cargo': arr = requisitosCargo || []; break;
      case 'mst_especialidades': arr = especialidades || []; break;
      case 'mst_niveles_jerarquicos': arr = nivelesJerarquicos || []; break;
      case 'mst_materiales': arr = materiales || []; break;
      case 'mst_impuestos': arr = monedasImpuestosUnidades || []; break;
      case 'mst_tipos_servicio': arr = tiposServicio || []; break;
      case 'mst_almacenes': arr = almacenes || []; break;
      case 'mst_fabricantes': arr = fabricantes || []; break;
      case 'mst_tipos_contrato': arr = tiposContrato || []; break;
    }
    
    if (!arr || arr.length === 0) return emptyEl;
    if (mId === 'mst_industrias') return `${arr.length} valores - Actualizado en tiempo real`;
    return `${arr.length} valor${arr.length === 1 ? '' : 'es'} cargado${arr.length === 1 ? '' : 's'}`;
  };

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
            <td>{nombreResponsableCompras(p.responsable_compras_posicion_id) || '-'}</td>
            <td><button className="btn btn-sm btn-ghost" onClick={()=>{ setSel(null); navigate('proveedores'); }}>Ir a ficha</button></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_unidades_organizacionales') {
      const excluidas = editandoId ? getDescendientesIds(editandoId) : new Set();
      const opcionesPadre = unidadesOrganizacionales.filter(u => !excluidas.has(u.id));
      return (
        <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
            {renderCodPreview(sel.id, formLen)}
            <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre de la unidad *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Operaciones" autoFocus/></div>
            <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
            <div className="input-group" style={{gridColumn:'span 2'}}>
              <label>Unidad padre</label>
              <select className="select" value={nuevo.unidad_padre_id} onChange={e=>setNuevo(v=>({...v,unidad_padre_id:e.target.value}))}>
                <option value="">Sin unidad padre (raíz)</option>
                {opcionesPadre.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
            <div className="input-group" style={{gridColumn:'span 2'}}>
              <label>Centro de Costo</label>
              <select className="select" value={nuevo.ceco_id} onChange={e=>setNuevo(v=>({...v,ceco_id:e.target.value}))}>
                <option value="">Sin CECO asignado</option>
                {centrosCostoEscrituraMaestros.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
              </select>
            </div>
            <div className="input-group" style={{gridColumn:'span 2'}}>
              <label>Categoría (para permisos)</label>
              <select className="select" value={nuevo.categoria} onChange={e=>setNuevo(v=>({...v,categoria:e.target.value}))}>
                {ROLE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <FormActions label="unidad" />
          </div>
        </form>
      );
    }
    if (sel?.id === 'mst_cargos') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          {renderCodPreview(sel.id, formLen)}
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre del cargo *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Analista de Calidad" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Tipo de personal *</label><select className="select" value={nuevo.tipo_cargo} onChange={e=>setNuevo(v=>({...v,tipo_cargo:e.target.value}))}><option value="">Seleccionar...</option><option value="Administrativo">Administrativo</option><option value="Operativo">Operativo</option><option value="Ambos">Ambos</option></select></div>
          <div className="input-group">
            <label>Modo de gestión de Posición</label>
            <select className="select" value={nuevo.modo_gestion} onChange={e=>setNuevo(v=>({...v,modo_gestion:e.target.value}))}>
              <option value="individual">Individual (1 persona = 1 Posición)</option>
              <option value="compartido">Compartido (varias personas, 1 sola Posición)</option>
            </select>
          </div>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Descripción breve</label><input className="input" value={nuevo.detalle} onChange={e=>setNuevo(v=>({...v,detalle:e.target.value}))} placeholder="Ej: Responsable de análisis y reportes"/></div>
          <FormActions label="cargo" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_especialidades') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          {renderCodPreview(sel.id, formLen)}
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Electricista industrial" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Área</label><select className="select" value={nuevo.area} onChange={e=>setNuevo(v=>({...v,area:e.target.value}))}><option value="">Seleccionar...</option>{(areasEmpresa||[]).map(a=><option key={a.id} value={a.nombre}>{a.nombre}</option>)}</select></div>
          <div className="input-group"><label>Requiere certificación</label><select className="select" value={nuevo.requiere_cert?'si':'no'} onChange={e=>setNuevo(v=>({...v,requiere_cert:e.target.value==='si'}))}><option value="no">No</option><option value="si">Sí</option></select></div>
          <FormActions label="especialidad" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_niveles_jerarquicos') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          <div className="input-group">
            <label>Código *</label>
            <input className="input" required value={nuevo.codigo ?? (editandoId ? nuevo.codigo : slugifyNivel(nuevo.nombre))} onChange={e=>setNuevo(v=>({...v,codigo:e.target.value}))} style={{background:'var(--bg-subtle)'}}/>
          </div>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Practicante" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group" style={{gridColumn:'span 2'}}>
            <label>Alcance <span className="text-muted" style={{fontSize:11}}>— define qué tanto puede ver alguien con este nivel</span></label>
            <select className="select" value={nuevo.alcance} onChange={e=>setNuevo(v=>({...v,alcance:e.target.value}))}>
              <option value="propio">Solo lo propio</option>
              <option value="equipo">Su equipo</option>
              <option value="tenant">Todo el tenant</option>
            </select>
          </div>
          <FormActions label="nivel" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_tipos_servicio') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          {renderCodPreview(sel.id, formLen)}
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
          {renderCodPreview(sel.id, formLen)}
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre del almacén</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Almacén Sede Sur" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Tipo</label><select className="select" value={nuevo.tipo} onChange={e=>setNuevo(v=>({...v,tipo:e.target.value}))}><option value="">Seleccionar...</option>{['Central','Sede','Móvil','Tránsito'].map(t=><option key={t}>{t}</option>)}</select></div>
          <div className="input-group"><label>Responsable</label><input className="input" value={nuevo.responsable} onChange={e=>setNuevo(v=>({...v,responsable:e.target.value}))} placeholder="Nombre del responsable"/></div>
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Dirección</label><input className="input" value={nuevo.direccion} onChange={e=>setNuevo(v=>({...v,direccion:e.target.value}))} placeholder="Dirección del almacén"/></div>
          <FormActions label="almacen" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_fabricantes') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          {renderCodPreview(sel.id, formLen)}
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre del fabricante *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Fabricante de referencia" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="text-muted" style={{gridColumn:'1 / -1', fontSize:12}}>El nombre se normaliza al guardar para evitar duplicados por mayúsculas, tildes o espacios.</div>
          <FormActions label="fabricante" />
        </div>
      </form>
    );
    if (sel?.id === 'mst_sedes') return (
      <form ref={formRef} className="card" style={{padding:16, marginBottom:18}} onSubmit={addRow}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          {renderCodPreview(sel.id, formLen)}
          <div className="input-group" style={{gridColumn:'span 2'}}><label>Nombre de la sede *</label><input className="input" required value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} placeholder="Ej: Sede Norte, Planta Central" autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option></select></div>
          <div className="input-group"><label>Tipo de sede</label><select className="select" value={nuevo.tipo || 'oficina'} onChange={e=>setNuevo(v=>({...v,tipo:e.target.value}))}><option value="oficina">Oficina administrativa</option><option value="unidad_minera">Unidad minera</option></select></div>
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
          {renderCodPreview(sel?.id || '', formLen)}
          <div className="input-group"><label>Nombre</label><input className="input" value={nuevo.nombre} onChange={e=>setNuevo(v=>({...v,nombre:e.target.value}))} autoFocus/></div>
          <div className="input-group"><label>Estado</label><select className="select" value={nuevo.estado} onChange={e=>setNuevo(v=>({...v,estado:e.target.value}))}><option>activo</option><option>inactivo</option><option>bloqueado</option></select></div>
          <FormActions label="industria" />
          <div className="input-group" style={{gridColumn:'1 / -1'}}><label>Detalle</label><input className="input" value={nuevo.detalle} onChange={e=>setNuevo(v=>({...v,detalle:e.target.value}))}/></div>
        </div>
      </form>
    );
    if (sel?.id === 'mst_requisitos_cargo') {
      const cargosActivos = (cargos || []).filter(c => c.estado === 'activo');
      const tiposActivos = (tiposDocumento || []).filter(t => t.estado === 'activo');
      const reqDelCargo = (requisitosCargo || []).filter(r => r.cargo_id === matrizCargoId);
      return (
        <div className="card" style={{padding:16, marginBottom:18}}>
          <div className="input-group" style={{maxWidth:360, marginBottom:20}}>
            <label>Cargo a configurar</label>
            <select className="select" value={matrizCargoId} onChange={e => setMatrizCargoId(e.target.value)}>
              <option value="">Elegir cargo...</option>
              {cargosActivos.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
            </select>
          </div>
          {!matrizCargoId ? (
            <div className="text-muted" style={{fontSize:13}}>Selecciona un cargo para ver y configurar sus documentos requeridos.</div>
          ) : tiposActivos.length === 0 ? (
            <div className="text-muted" style={{fontSize:13}}>No hay tipos de documento activos. Crea algunos en "Tipos de Documento" primero.</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Documento</th><th>Ámbito</th><th style={{textAlign:'center'}}>Habilitante</th><th style={{textAlign:'center'}}>Requerido</th><th style={{textAlign:'center'}}>Modalidad</th></tr></thead>
                <tbody>
                  {tiposActivos.map(tipo => {
                    const req = reqDelCargo.find(r => r.tipo_documento_id === tipo.id);
                    const estaRequerido = Boolean(req);
                    return (
                      <tr key={tipo.id}>
                        <td><strong style={{fontSize:13}}>{tipo.nombre}</strong></td>
                        <td><span className="badge badge-cyan" style={{fontSize:11}}>{tipo.ambito}</span></td>
                        <td style={{textAlign:'center'}}>{tipo.es_habilitante ? <span className="badge badge-orange" style={{fontSize:11}}>Sí</span> : <span className="badge badge-gray" style={{fontSize:11}}>No</span>}</td>
                        <td style={{textAlign:'center'}}>
                          <input type="checkbox" checked={estaRequerido} disabled={matrizSaving}
                            onChange={async (e) => {
                              setMatrizSaving(true);
                              try {
                                if (e.target.checked) await upsertRequisitoCargo(matrizCargoId, tipo.id, true);
                                else if (req) await eliminarRequisitoCargo(req.id);
                              } catch(err) { addNotificacion?.('Error: ' + (err?.message||'No se pudo guardar')); }
                              finally { setMatrizSaving(false); }
                            }}
                          />
                        </td>
                        <td style={{textAlign:'center'}}>
                          {estaRequerido && (
                            <select className="select" style={{fontSize:12, padding:'2px 8px', minWidth:100}} value={req?.obligatorio?'si':'no'} disabled={matrizSaving}
                              onChange={async (e) => {
                                if (!req) return;
                                setMatrizSaving(true);
                                try { await upsertRequisitoCargo(matrizCargoId, tipo.id, e.target.value==='si'); }
                                catch(err) { addNotificacion?.('Error: ' + (err?.message||'')); }
                                finally { setMatrizSaving(false); }
                              }}>
                              <option value="si">Obligatorio</option>
                              <option value="no">Opcional</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }
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
    if (sel?.id === 'mst_unidades_organizacionales') {
      const arbol = construirArbolUnidades(selectedRows);
      const cecoNombrePorId = new Map((centrosCosto || []).map(c => [c.id, `${c.codigo} · ${c.nombre}`]));
      return (
        <table className="tbl">
          <thead><tr><th style={{width:40}}><input type="checkbox" checked={checkedIds.length === selectedRows.length && selectedRows.length > 0} onChange={e => setCheckedIds(e.target.checked ? selectedRows.map(x=>x.id) : [])}/></th><th>Codigo</th><th>Unidad</th><th>CECO</th><th>Categoría</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
          <tbody>{arbol.map((r,i) => (
            <tr key={`${r.id}-${i}`} style={{background: editandoId === r.id ? 'var(--bg-subtle)' : 'transparent'}}>
              <td><input type="checkbox" checked={checkedIds.includes(r.id)} onChange={e => { e.stopPropagation(); setCheckedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)); }} /></td>
              <td className="mono text-muted">{r.codigo}</td>
              <td style={{paddingLeft: 12 + r._depth * 20}}>
                {r._depth > 0 && <span className="text-muted" style={{marginRight:6}}>↳</span>}
                <strong>{r.nombre}</strong>
              </td>
              <td className="text-muted" style={{fontSize:12}}>{cecoNombrePorId.get(r.ceco_id) || '-'}</td>
              <td><span className="badge badge-cyan">{ROLE_CATEGORIES.find(c => c.value === (r.categoria || 'otro'))?.label || r.categoria}</span></td>
              <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
              <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
            </tr>
          ))}</tbody>
        </table>
      );
    }
    if (sel?.id === 'mst_cargos') {
      const handleFusionar = async () => {
        if (!fusionOrigenId || !fusionDestinoId || fusionOrigenId === fusionDestinoId) return;
        setFusionSaving(true);
        try {
          await fusionarCargos(fusionOrigenId, fusionDestinoId);
          setFusionOrigenId(null);
          setFusionDestinoId('');
          addNotificacion('Cargos fusionados correctamente.');
        } catch (err) {
          alert(`Error al fusionar: ${err?.message || 'error desconocido'}`);
        } finally {
          setFusionSaving(false);
        }
      };
      const contarColaboradores = (cargoId) =>
        personalAdmin.filter(p => p.cargo_id === cargoId).length +
        personalOperativo.filter(p => p.cargo_id === cargoId).length;
      // Agrupa cargos activos que probablemente sean duplicados/variantes, para que Cristhian
      // decida cuales fusionar con fusionar_cargos. Es solo un reporte visual (union-find sobre
      // nombre normalizado exacto + palabras compartidas de 4+ letras); no fusiona nada por si
      // mismo. Sinonimos sin palabra en comun (ej. "Vendedor" / "Ventas") no se detectan aqui:
      // por eso la tabla completa de abajo sigue disponible para revision manual.
      const CARGOS_STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'para', 'con']);
      const CARGOS_ACENTOS = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u' };
      const normalizarNombreCargo = (s) => (s || '')
        .toLowerCase()
        .replace(/[áéíóúü]/g, ch => CARGOS_ACENTOS[ch] || ch)
        .replace(/\s+/g, ' ').trim();
      const cargosActivos = cargos.filter(c => c.estado === 'activo');
      const ufParent = new Map(cargosActivos.map(c => [c.id, c.id]));
      const ufFind = (x) => { while (ufParent.get(x) !== x) x = ufParent.get(x); return x; };
      const ufUnion = (a, b) => { const ra = ufFind(a), rb = ufFind(b); if (ra !== rb) ufParent.set(ra, rb); };
      const porNormKey = new Map();
      cargosActivos.forEach(c => {
        const key = normalizarNombreCargo(c.nombre);
        (porNormKey.get(key) || porNormKey.set(key, []).get(key)).push(c);
      });
      porNormKey.forEach(lista => lista.slice(1).forEach(c => ufUnion(c.id, lista[0].id)));
      const porToken = new Map();
      cargosActivos.forEach(c => {
        normalizarNombreCargo(c.nombre).split(' ').filter(t => t.length >= 4 && !CARGOS_STOPWORDS.has(t)).forEach(t => {
          (porToken.get(t) || porToken.set(t, []).get(t)).push(c);
        });
      });
      porToken.forEach(lista => lista.slice(1).forEach(c => ufUnion(c.id, lista[0].id)));
      const clustersMap = new Map();
      cargosActivos.forEach(c => {
        const root = ufFind(c.id);
        (clustersMap.get(root) || clustersMap.set(root, []).get(root)).push(c);
      });
      const candidatosFusion = [...clustersMap.values()]
        .filter(g => g.length > 1)
        .map(g => [...g].sort((a, b) => contarColaboradores(b.id) - contarColaboradores(a.id) || a.nombre.localeCompare(b.nombre, 'es')));

      return (<>
        {candidatosFusion.length > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Candidatos a fusión detectados ({candidatosFusion.length})</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12 }}>
              Cargos con nombres iguales o muy similares. Revisa cada grupo y decide si fusionar (esto no fusiona nada automáticamente).
              También pueden existir sinónimos sin palabra en común (ej. "Vendedor" / "Ventas") que no se detectan aquí — revisa la tabla completa abajo.
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {candidatosFusion.map((grupo, gi) => (
                <div key={gi} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {grupo.map((c, ci) => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: ci === 0 ? 'var(--bg-subtle)' : 'transparent', border: ci === 0 ? '1px solid var(--border)' : '1px dashed var(--border)' }}>
                        <span style={{ fontSize: 13, fontWeight: ci === 0 ? 700 : 500 }}>{c.nombre}</span>
                        <span className="badge badge-gray" style={{ fontSize: 10 }}>{c.tipo || '—'}</span>
                        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{contarColaboradores(c.id)} colab.</span>
                        {ci === 0 && <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>(sugerido destino)</span>}
                        {ci > 0 && (
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '1px 6px' }} onClick={() => { setFusionOrigenId(c.id); setFusionDestinoId(grupo[0].id); }}>
                            Fusionar con "{grupo[0].nombre}"
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {fusionOrigenId && (
          <div className="modal-backdrop" onClick={() => { setFusionOrigenId(null); setFusionDestinoId(''); }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:480}}>
              <div className="modal-head">
                <h3>Fusionar cargo</h3>
                <button className="icon-btn" onClick={() => { setFusionOrigenId(null); setFusionDestinoId(''); }}>{I.x}</button>
              </div>
              <div className="modal-body">
                <p style={{marginBottom:12}}>
                  Las fichas de <strong>{cargos.find(c=>c.id===fusionOrigenId)?.nombre}</strong> se reapuntarán al cargo destino y el origen quedará inactivo.
                </p>
                <div className="input-group" style={{marginBottom:16}}>
                  <label>Cargo destino *</label>
                  <select className="select" value={fusionDestinoId} onChange={e => setFusionDestinoId(e.target.value)}>
                    <option value="">Seleccionar cargo destino...</option>
                    {cargos.filter(c => c.id !== fusionOrigenId && c.estado === 'activo').map(c => (
                      <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>
                    ))}
                  </select>
                </div>
                <div className="row" style={{justifyContent:'flex-end', gap:8}}>
                  <button className="btn btn-secondary" onClick={() => { setFusionOrigenId(null); setFusionDestinoId(''); }}>Cancelar</button>
                  <button className="btn btn-primary" disabled={!fusionDestinoId || fusionSaving} onClick={handleFusionar}>
                    {fusionSaving ? 'Fusionando...' : 'Confirmar fusión'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <table className="tbl">
          <thead><tr><th style={{width:40}}><input type="checkbox" checked={checkedIds.length === selectedRows.length && selectedRows.length > 0} onChange={e => setCheckedIds(e.target.checked ? selectedRows.map(x=>x.id) : [])}/></th><th>Código</th><th>Cargo</th><th>Tipo</th><th>Posición</th><th>Colaboradores</th><th>Descripción</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
          <tbody>{selectedRows.map((r,i) => (
            <tr key={`${r.codigo}-${i}`} style={{background: editandoId === r.id ? 'var(--bg-subtle)' : 'transparent'}}>
              <td><input type="checkbox" checked={checkedIds.includes(r.id)} onChange={e => { e.stopPropagation(); setCheckedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)); }} /></td>
              <td className="mono text-muted">{r.codigo}</td>
              <td><strong>{r.nombre}</strong></td>
              <td><span className={'badge '+(r.tipo==='Operativo'?'badge-cyan':r.tipo==='Ambos'?'badge-purple':'badge-gray')} style={{fontSize:11}}>{r.tipo||'—'}</span></td>
              <td><span className={'badge '+(r.modo_gestion==='compartido'?'badge-purple':'badge-gray')} style={{fontSize:11}}>{r.modo_gestion==='compartido'?'Compartido':'Individual'}</span></td>
              <td className="text-muted" style={{fontSize:12}}>{contarColaboradores(r.id)}</td>
              <td className="text-muted" style={{fontSize:12}}>{r.detalle}</td>
              <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
              <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
                {r.estado === 'activo' && <button className="btn btn-ghost" style={{fontSize:11, padding:'2px 8px', marginRight:6}} title="Fusionar con otro cargo" onClick={() => { setFusionOrigenId(r.id); setFusionDestinoId(''); }}>Fusionar</button>}
                <RowActions item={r} />
              </td>
            </tr>
          ))}</tbody>
        </table>
      </>);
    }
    if (sel?.id === 'mst_especialidades') return (
      <table className="tbl">
        <thead><tr><th style={{width:40}}><input type="checkbox" checked={checkedIds.length === selectedRows.length && selectedRows.length > 0} onChange={e => setCheckedIds(e.target.checked ? selectedRows.map(x=>x.id) : [])}/></th><th>Código</th><th>Especialidad</th><th>Área</th><th>Certif.</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td><input type="checkbox" checked={checkedIds.includes(r.id)} onChange={e => { e.stopPropagation(); setCheckedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)); }} /></td>
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
    if (sel?.id === 'mst_niveles_jerarquicos') return (
      <table className="tbl">
        <thead><tr><th style={{width:40}}><input type="checkbox" checked={checkedIds.length === selectedRows.length && selectedRows.length > 0} onChange={e => setCheckedIds(e.target.checked ? selectedRows.map(x=>x.id) : [])}/></th><th>Código</th><th>Nombre</th><th>Alcance</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td><input type="checkbox" checked={checkedIds.includes(r.id)} onChange={e => { e.stopPropagation(); setCheckedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)); }} /></td>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td><span className="badge badge-cyan">{r.alcance === 'tenant' ? 'Todo el tenant' : r.alcance === 'equipo' ? 'Su equipo' : 'Solo lo propio'}</span></td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_tipos_servicio') return (
      <table className="tbl">
        <thead><tr><th style={{width:40}}><input type="checkbox" checked={checkedIds.length === selectedRows.length && selectedRows.length > 0} onChange={e => setCheckedIds(e.target.checked ? selectedRows.map(x=>x.id) : [])}/></th><th>Código</th><th>Nombre</th><th>Clasificación</th><th>Facturable</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td><input type="checkbox" checked={checkedIds.includes(r.id)} onChange={e => { e.stopPropagation(); setCheckedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)); }} /></td>
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
    if (sel?.id === 'mst_fabricantes') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Fabricante</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r, i) => (
          <tr key={`${r.codigo}-${i}`} style={{background: editandoId === r.id ? 'var(--bg-subtle)' : 'transparent'}}>
            <td className="mono">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td><span className={'badge '+(r.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
              <button className="btn btn-ghost" style={{fontSize:11, padding:'2px 8px', marginRight:6}} onClick={async () => {
                try {
                  await actualizarFabricanteCtx(r.id, { codigo: r.codigo, nombre: r.nombre, estado: r.estado === 'activo' ? 'inactivo' : 'activo' });
                  addNotificacion?.(`Fabricante ${r.estado === 'activo' ? 'desactivado' : 'activado'}.`);
                } catch (err) { setFormError(err?.message || 'No se pudo actualizar el fabricante.'); }
              }}>{r.estado === 'activo' ? 'Desactivar' : 'Activar'}</button>
              <button className="icon-btn" title="Editar" onClick={() => editarRegistro(r)} style={{color:'var(--cyan)'}}>{I.edit}</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_almacenes') return (
      <table className="tbl">
        <thead><tr><th style={{width:40}}><input type="checkbox" checked={checkedIds.length === selectedRows.length && selectedRows.length > 0} onChange={e => setCheckedIds(e.target.checked ? selectedRows.map(x=>x.id) : [])}/></th><th>Código</th><th>Nombre</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td><input type="checkbox" checked={checkedIds.includes(r.id)} onChange={e => { e.stopPropagation(); setCheckedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)); }} /></td>
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
        <thead><tr><th style={{width:40}}><input type="checkbox" checked={checkedIds.length === selectedRows.length && selectedRows.length > 0} onChange={e => setCheckedIds(e.target.checked ? selectedRows.map(x=>x.id) : [])}/></th><th>Código</th><th>Nombre</th><th>Dirección física</th><th>GPS</th><th>Tipo</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td><input type="checkbox" checked={checkedIds.includes(r.id)} onChange={e => { e.stopPropagation(); setCheckedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)); }} /></td>
            <td className="mono text-muted">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td className="text-muted" style={{fontSize:12}}>{r.direccion || '—'}</td>
            <td><span className="mono" style={{fontSize:11, color:'var(--cyan-dk)', background:'var(--cyan-lt)', padding:'2px 7px', borderRadius:6}}>{r.gps || '—'}</span></td>
            <td><span className={'badge '+(r.tipo==='unidad_minera'?'badge-orange':'badge-gray')}>{r.tipo === 'unidad_minera' ? 'Unidad minera' : 'Oficina'}</span></td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}><RowActions item={r} /></td>
          </tr>
        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_impuestos') return (
      <table className="tbl">
        <thead><tr><th style={{width:40}}><input type="checkbox" checked={checkedIds.length === selectedRows.length && selectedRows.length > 0} onChange={e => setCheckedIds(e.target.checked ? selectedRows.map(x=>x.id) : [])}/></th><th>Tipo</th><th>Codigo</th><th>Valor</th><th>Detalle</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td><input type="checkbox" checked={checkedIds.includes(r.id)} onChange={e => { e.stopPropagation(); setCheckedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)); }} /></td>
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
    if (sel?.id === 'mst_requisitos_cargo') return null;
    return (
      <table className="tbl">
        <thead><tr><th style={{width:40}}><input type="checkbox" checked={checkedIds.length === selectedRows.length && selectedRows.length > 0} onChange={e => setCheckedIds(e.target.checked ? selectedRows.map(x=>x.id) : [])}/></th><th>Codigo</th><th>Valor</th><th>Detalle</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r, i) => (
          <tr key={`${r.codigo}-${i}`}>
            <td><input type="checkbox" checked={checkedIds.includes(r.id)} onChange={e => { e.stopPropagation(); setCheckedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)); }} /></td>
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
              <div className="maestro-card-meta">{getMaestroMetaText(m.id)}</div>
            </div>
            <button className="btn btn-secondary btn-sm maestro-card-action" onClick={() => { if (m.id === 'mst_ceco_cebe') { setShowCecoCebe(true); } else if (m.id === 'mst_requisitos_cargo') { setShowRequisitos(true); } else if (m.id === 'mst_tipos_documento') { setShowTiposDocumento(true); } else { setSel(m); resetForm(); } }}>
              Gestionar {I.chevRight}
            </button>
          </div>
        ))}
      </div>

      {showCecoCebe && <CecoCebePanel onClose={() => setShowCecoCebe(false)} />}

      {showRequisitos && <RequisitosPorCargo onClose={() => setShowRequisitos(false)} onGoToTiposDoc={() => { setShowRequisitos(false); setShowTiposDocumento(true); }} />}

      {showTiposDocumento && <TiposDocumentoPanel onClose={() => setShowTiposDocumento(false)} onGoToRequisitos={() => { setShowTiposDocumento(false); setShowRequisitos(true); }} />}

      {sel?.id === 'mst_materiales' && <MaterialesMaestro onClose={() => setSel(null)} />}

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


      {importModal && sel && MAESTRO_XLSX_CFG[sel.id] && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:700, width:'96vw'}}>
            <div className="modal-head">
              <h2>Importar {sel.tabla} — Paso {importStep} de 3</h2>
              <button className="icon-btn" onClick={()=>setImportModal(false)}>{I.x}</button>
            </div>
            <div className="modal-body">
              {importStep === 1 && (
                <div>
                  <p className="text-muted" style={{marginBottom:10, fontSize:13}}>
                    Sube un archivo Excel (.xlsx) con las siguientes columnas:
                  </p>
                  <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:10}}>
                    {MAESTRO_XLSX_CFG[sel.id].headers.map((h,i) => (
                      <span key={i} className="badge badge-cyan" style={{fontSize:11}}>{h}</span>
                    ))}
                  </div>
                  {MAESTRO_XLSX_CFG[sel.id].hint && (
                    <p className="text-muted" style={{marginBottom:10, fontSize:12}}>{MAESTRO_XLSX_CFG[sel.id].hint}</p>
                  )}
                  {!esImportacionUnidades && <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:14}}>
                    <button className="btn btn-secondary btn-sm" onClick={descargarPlantillaMaestro}>{I.download} Descargar plantilla</button>
                    <span className="text-muted" style={{fontSize:12}}>Descarga la plantilla con las columnas correctas y un ejemplo</span>
                  </div>}
                  <input type="file" accept=".xlsx,.xls" onChange={async e => {
                    const f = e.target.files[0]; if (!f) return;
                    e.target.value = '';
                    try {
                      const parsed = await parseMstXlsx(f);
                      setImportRows(validarImportMaestro(parsed));
                      setImportStep(2);
                    } catch (error) {
                      addNotificacion?.(`No se pudo leer el Excel: ${error?.message || 'archivo invalido'}.`, 'error');
                    }
                  }}/>
                </div>
              )}
              {importStep === 2 && esImportacionUnidades && (
                <div>
                  <p style={{marginBottom:12, fontSize:13}}>
                    <strong>{importRows.length} filas</strong> - {filasValidasImport.length} validas - {importRows.filter(row => row._errores?.length > 0).length} con errores
                  </p>
                  <div style={{maxHeight:280, overflow:'auto'}}>
                    <table className="tbl">
                      <thead><tr><th>Fila</th><th>Codigo</th><th>Unidad</th><th>Padre</th><th>CECO</th><th>Categoria</th><th>Estado</th><th>Mensaje</th></tr></thead>
                      <tbody>{importRows.map((row, index) => {
                        const estado = row._estado || (row._errores?.length ? 'RECHAZADA' : 'VALIDA');
                        const color = estado === 'CREADA' ? 'var(--green)' : estado === 'VALIDA' ? 'var(--cyan)' : 'var(--danger)';
                        return <tr key={row._fila || index} style={{background: estado === 'CREADA' ? 'rgba(31,157,85,.06)' : estado === 'VALIDA' ? 'transparent' : 'rgba(239,68,68,.05)'}}>
                          <td className="mono text-muted">{row._fila || index + 2}</td><td>{row.codigo}</td><td>{row.nombre}</td><td>{row.unidad_padre_codigo || '-'}</td><td>{row.ceco_codigo || '-'}</td><td>{row.categoria}</td>
                          <td style={{fontWeight:700, color}}>{estado}</td><td style={{fontSize:11, color: row._errores?.length ? 'var(--danger)' : 'var(--fg-muted)'}}>{row._errores?.join(' | ') || (estado === 'CREADA' ? 'Importada correctamente.' : 'Lista para importar.')}</td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                  <div style={{display:'flex', gap:10, marginTop:16}}>
                    <button className="btn btn-secondary" onClick={()=>setImportStep(1)} disabled={importandoUnidades}>Volver</button>
                    <button className="btn btn-primary" disabled={filasValidasImport.length === 0 || importandoUnidades} onClick={()=>setImportStep(3)}>Confirmar importacion</button>
                  </div>
                </div>
              )}
              {importStep === 2 && !esImportacionUnidades && (
                <div>
                  <p style={{marginBottom:12, fontSize:13}}>
                    <strong>{importRows.length} filas</strong> · {importRows.filter(r=>r._errores.length===0).length} válidas · {importRows.filter(r=>r._errores.length>0).length} con errores
                  </p>
                  <div style={{maxHeight:280, overflow:'auto'}}>
                    <table className="tbl">
                      <thead><tr><th>Fila</th><th>Nombre</th><th>Estado</th><th>Errores</th></tr></thead>
                      <tbody>{importRows.map((r,i) => (
                        <tr key={i} style={{background: r._errores.length>0 ? 'rgba(239,68,68,0.05)' : 'transparent'}}>
                          <td className="mono text-muted">{i+2}</td>
                          <td>{r.nombre}</td>
                          <td>{r._errores.length===0 ? <span className="badge badge-green">OK</span> : <span className="badge badge-red">Error</span>}</td>
                          <td style={{fontSize:11, color:'var(--danger)'}}>{r._errores.join(' · ')}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div style={{display:'flex', gap:10, marginTop:16}}>
                    <button className="btn btn-secondary" onClick={()=>setImportStep(1)}>← Volver</button>
                    <button className="btn btn-primary" disabled={!importRows.some(r=>r._errores.length===0)} onClick={()=>setImportStep(3)}>Confirmar importación →</button>
                  </div>
                </div>
              )}
              {importStep === 3 && esImportacionUnidades && (
                <div>
                  <p style={{marginBottom:16, fontSize:13}}>
                    Se importaran <strong>{filasValidasImport.length} registros validos</strong>. Las filas rechazadas permaneceran visibles con su motivo.
                  </p>
                  <button className="btn btn-primary" disabled={importandoUnidades || filasValidasImport.length === 0} onClick={importarUnidadesOrganizacionales}>
                    {importandoUnidades ? 'Importando...' : `Importar ${filasValidasImport.length} registros`}
                  </button>
                </div>
              )}
              {importStep === 3 && !esImportacionUnidades && (
                <div>
                  <p style={{marginBottom:16, fontSize:13}}>
                    Se importarán <strong>{importRows.filter(r=>r._errores.length===0).length} registros</strong> en <em>{sel.tabla}</em>. Los {importRows.filter(r=>r._errores.length>0).length} con errores serán ignorados.
                  </p>
                  <button className="btn btn-primary" onClick={e => doImportMaestro(e.currentTarget)}>
                    Importar {importRows.filter(r=>r._errores.length===0).length} registros
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {sel && sel.id !== 'mst_materiales' && <>
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
            {sel.id !== 'mst_clientes' && sel.id !== 'mst_proveedores' && sel.id !== 'mst_requisitos_cargo' && (
              <div className="row" style={{gap:10, marginBottom:18, flexWrap:'wrap'}}>
                {checkedIds.length > 0 && (
                  <button className="btn" style={{backgroundColor: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)'}} onClick={eliminarSeleccionados}>
                    {I.trash} Eliminar seleccionados ({checkedIds.length})
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => { setImportRows([]); setImportStep(1); setImportModal(true); }}>{I.download} Importar Excel</button>
                {sel.id === 'mst_unidades_organizacionales' && <button className="btn btn-secondary" onClick={descargarPlantillaMaestro}>{I.download} Descargar plantilla</button>}
                <button className="btn btn-secondary" onClick={exportarMaestro}>{I.download} Exportar</button>
                {sel.id === 'mst_tipos_documento' && (
                  <button className="btn btn-secondary" onClick={async () => {
                    try {
                      await importarPlantillaTiposDoc();
                      addNotificacion?.('Plantilla importada. Puedes editar cada tipo libremente.');
                    } catch(err) { addNotificacion?.('Error al importar: ' + (err?.message || '')); }
                  }}>Importar Plantilla Base</button>
                )}
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

function ParamChipGroup({ options, value, onChange }) {
  return (
    <div className="params-chip-group">
      {options.map(opt => {
        const item = typeof opt === 'string' ? { value: opt, label: opt } : opt;
        return (
          <button
            type="button"
            key={item.value}
            className={`params-choice-chip ${value === item.value ? 'active' : ''}`}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function CuentasBancariasSection() {
  const { cuentasBancarias = [], crearCuentaBancaria, actualizarCuentaBancaria, eliminarCuentaBancaria, addNotificacion } = useApp();
  const empty = { nombre:'', banco:'', numero_cuenta:'', cci:'', moneda:'PEN', tipo:'corriente', estado:'activo', saldo_inicial:'' };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const guardar = async e => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.banco.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await actualizarCuentaBancaria(editId, { ...form, saldo_inicial: Number(form.saldo_inicial || 0) });
        addNotificacion('Cuenta bancaria actualizada.');
      } else {
        await crearCuentaBancaria({ ...form, saldo_inicial: Number(form.saldo_inicial || 0) });
      }
      setForm(empty); setEditId(null);
    } finally { setSaving(false); }
  };

  const editar = c => { setForm({ nombre:c.nombre, banco:c.banco, numero_cuenta:c.numero_cuenta||'', cci:c.cci||'', moneda:c.moneda||'PEN', tipo:c.tipo||'corriente', estado:c.estado||'activo', saldo_inicial:String(c.saldo_inicial||0) }); setEditId(c.id); };
  const cancelar = () => { setForm(empty); setEditId(null); };

  return (
    <div className="card">
      <div className="card-head"><h3>Cuentas Bancarias</h3><span className="badge badge-cyan">{cuentasBancarias.length} cuentas</span></div>
      <form className="card-body" onSubmit={guardar} data-local-form="true" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        <div className="input-group"><label>Nombre / Alias *</label><input className="input" value={form.nombre} onChange={set('nombre')} placeholder="BCP Soles Principal" required /></div>
        <div className="input-group"><label>Banco *</label><input className="input" value={form.banco} onChange={set('banco')} placeholder="BCP, BBVA, Interbank..." required /></div>
        <div className="input-group"><label>N° Cuenta</label><input className="input" value={form.numero_cuenta} onChange={set('numero_cuenta')} placeholder="194-XXXXXXXX-0-XX" /></div>
        <div className="input-group"><label>CCI</label><input className="input" value={form.cci} onChange={set('cci')} placeholder="002-194-XXXXXXXX-X" /></div>
        <div className="input-group"><label>Moneda</label><ParamChipGroup value={form.moneda} onChange={value => setForm(p => ({ ...p, moneda: value }))} options={[{ value:'PEN', label:'PEN' }, { value:'USD', label:'USD' }, { value:'EUR', label:'EUR' }]} /></div>
        <div className="input-group"><label>Tipo</label><ParamChipGroup value={form.tipo} onChange={value => setForm(p => ({ ...p, tipo: value }))} options={[{ value:'corriente', label:'Corriente' }, { value:'ahorros', label:'Ahorros' }, { value:'recaudadora', label:'Recaudadora' }, { value:'caja_chica', label:'Caja chica' }]} /></div>
        <div className="input-group"><label>Saldo inicial</label><input className="input" type="number" step="0.01" min="0" value={form.saldo_inicial} onChange={set('saldo_inicial')} /></div>
        <div className="input-group"><label>Estado</label><ParamChipGroup value={form.estado} onChange={value => setForm(p => ({ ...p, estado: value }))} options={[{ value:'activo', label:'Activo' }, { value:'inactivo', label:'Inactivo' }]} /></div>
        <div className="row" style={{gridColumn:'1/-1', justifyContent:'flex-end', gap:8}}>
          {editId && <button type="button" className="btn btn-secondary" onClick={cancelar}>Cancelar</button>}
          <button type="submit" className="btn btn-primary" disabled={saving}>{editId ? I.save : I.plus} {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Agregar cuenta'}</button>
        </div>
      </form>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Alias</th><th>Banco</th><th>N° Cuenta</th><th>Moneda</th><th>Tipo</th><th>Saldo inicial</th><th>Estado</th><th></th></tr></thead>
          <tbody>{cuentasBancarias.map(c => (
            <tr key={c.id}>
              <td><strong>{c.nombre}</strong></td>
              <td>{c.banco}</td>
              <td>{c.numero_cuenta || '—'}</td>
              <td><span className="badge badge-cyan">{c.moneda}</span></td>
              <td style={{textTransform:'capitalize'}}>{c.tipo}</td>
              <td>{Number(c.saldo_inicial||0).toLocaleString('es-PE', {minimumFractionDigits:2})}</td>
              <td><span className={'badge ' + (c.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{c.estado}</span></td>
              <td className="row" style={{justifyContent:'flex-end', gap:4}}>
                <button className="icon-btn" title="Editar" onClick={() => editar(c)} style={{color:'var(--cyan)'}}>{I.edit}</button>
                <button className="icon-btn" title="Eliminar" onClick={() => { if (window.confirm(`Eliminar "${c.nombre}"?`)) eliminarCuentaBancaria(c.id); }} style={{color:'var(--danger)'}}>{I.trash}</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Categorías ER por tenant: CRUD + Excel import ────────────────────────────
const ER_SECCIONES_LABELS = {
  costo_ventas:              'Costo de Ventas',
  gastos_operativos:         'Gastos Operativos',
  gastos_financieros:        'Gastos Financieros',
  depreciacion_amortizacion: 'Depreciación y Amortización',
};
const ER_SECCIONES_BADGES = {
  costo_ventas:              'badge-blue',
  gastos_operativos:         'badge-cyan',
  gastos_financieros:        'badge-yellow',
  depreciacion_amortizacion: 'badge-purple',
};
const ER_REGLA_LABELS = { siempre: 'Siempre', con_ot: 'Con OT', sin_ot: 'Sin OT' };
const ER_TIPO_SISTEMA_BADGE = tipo => tipo ? (ER_TIPO_SISTEMA_LABELS[tipo] || tipo) : 'Personalizado';

const normCat = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const SECCION_MAP_IMPORT = {
  'costo de ventas':   'costo_ventas',
  'gastos operativos': 'gastos_operativos',
  'gastos financieros':'gastos_financieros',
};
const REGLA_MAP_IMPORT = { 'con ot': 'con_ot', 'sin ot': 'sin_ot', 'siempre': 'siempre' };
const TIPO_SISTEMA_MAP_IMPORT = Object.fromEntries(ER_TIPO_SISTEMA_OPTIONS.map(o => [normCat(o.label), o.value]));
const parseTipoSistemaImport = raw => {
  const v = normCat(raw);
  if (!v || v.includes('personalizado') || v === 'sin tipo') return { ok: true, value: null };
  if (TIPO_SISTEMA_MAP_IMPORT[v]) return { ok: true, value: TIPO_SISTEMA_MAP_IMPORT[v] };
  return { ok: false, value: null };
};

function ErCategoriasAdmin() {
  const { empresa, addNotificacion } = useApp();
  const empresaId = empresa?.id;
  const [cats, setCats]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [panel, setPanel]       = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm]         = useState({ nombre: '', seccion: 'gastos_operativos', regla_ot: 'siempre', tipo_sistema: '', activo: true, orden: 0, es_capitalizacion: false });
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultImport, setResultImport] = useState(null);
  const [preview, setPreview]   = useState(null);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const cargar = async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const sb = await getSupabaseClient();
      const { data } = await sb.from('er_categorias').select('*').eq('empresa_id', empresaId).order('orden');
      setCats(data || []);
    } catch (err) { addNotificacion(`Error: ${err?.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, [empresaId]);

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ nombre: '', seccion: 'gastos_operativos', regla_ot: 'siempre', tipo_sistema: '', activo: true, orden: cats.length, es_capitalizacion: false });
    setPanel(true);
  };
  const abrirEditar = (c) => {
    setEditando(c);
    setForm({ nombre: c.nombre, seccion: c.seccion, regla_ot: c.regla_ot, tipo_sistema: c.tipo_sistema || '', activo: c.activo, orden: c.orden, es_capitalizacion: c.es_capitalizacion || false });
    setPanel(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !empresaId) return;
    setGuardando(true);
    try {
      const sb = await getSupabaseClient();
      if (editando) {
        const { data, error } = await sb.from('er_categorias')
          .update({ nombre: form.nombre, seccion: form.seccion, regla_ot: form.regla_ot, tipo_sistema: form.tipo_sistema || null, activo: form.activo, orden: form.orden, es_capitalizacion: form.es_capitalizacion })
          .eq('id', editando.id).select().single();
        if (error) throw error;
        setCats(prev => prev.map(c => c.id === editando.id ? data : c));
        addNotificacion('Categoría actualizada.');
      } else {
        const { data, error } = await sb.from('er_categorias')
          .insert({ nombre: form.nombre, seccion: form.seccion, regla_ot: form.regla_ot, tipo_sistema: form.tipo_sistema || null, activo: form.activo, orden: form.orden, empresa_id: empresaId, es_capitalizacion: form.es_capitalizacion || false })
          .select().single();
        if (error) throw error;
        setCats(prev => [...prev, data]);
        addNotificacion('Categoría creada.');
      }
      setPanel(false);
    } catch (err) { addNotificacion(`Error: ${err?.message}`); }
    finally { setGuardando(false); }
  };

  const toggleActivo = async (c) => {
    try {
      const sb = await getSupabaseClient();
      await sb.from('er_categorias').update({ activo: !c.activo }).eq('id', c.id);
      setCats(prev => prev.map(x => x.id === c.id ? { ...x, activo: !c.activo } : x));
      addNotificacion(c.activo ? 'Categoría desactivada.' : 'Categoría activada.');
    } catch (err) { addNotificacion(`Error: ${err?.message}`); }
  };

  const descargarPlantilla = () => {
    // Hoja 1: fila 1 = encabezados, fila 2 = notas, fila 3+ = datos del usuario
    const headers = ['Nombre tipo gasto', 'Categoría ER', 'Sección ER', 'Regla OT', 'Tipo Sistema'];
    const notas   = [
      'Nombre que verá el usuario al registrar un gasto. Ej: Mano de obra técnica, Materiales e insumos',
      'Cómo se agrupará esta línea en el ER. Texto libre. Si no existe, se creará automáticamente.',
      'Elegir de la lista desplegable',
      'Elegir de la lista desplegable',
      'OPCIONAL. Elegir de la lista desplegable solo si esta categoría corresponde a un concepto estándar del sistema. Ver hoja "Instrucciones" para el detalle. Deja "Personalizado" o vacío si no aplica.',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, notas]);
    ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 30 }];
    // Comentario indicativo en A3
    ws['A3'] = { t: 's', v: '', c: [{ a: 'Sistema', t: 'Ingresa tus datos a partir de esta fila' }] };
    const tipoSistemaListaValidacion = ['Personalizado', ...ER_TIPO_SISTEMA_OPTIONS.map(o => o.label)].join(',');
    ws['!dataValidations'] = [
      { type: 'list', sqref: 'C3:C1048576', formula1: '"Costo de Ventas,Gastos Operativos,Gastos Financieros"' },
      { type: 'list', sqref: 'D3:D1048576', formula1: '"Con OT,Sin OT,Siempre"' },
      { type: 'list', sqref: 'E3:E1048576', formula1: `"${tipoSistemaListaValidacion}"` },
    ];

    // Hoja 2: referencia de columnas + ejemplos + FAQ + guía detallada de Tipo Sistema
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Columna', 'Valores válidos', 'Ejemplo'],
      ['Nombre tipo gasto', 'Texto libre', 'Mano de obra técnica'],
      ['Categoría ER', 'Texto libre — si no existe se creará automáticamente', 'Mano de obra'],
      ['Sección ER', 'Costo de Ventas / Gastos Operativos / Gastos Financieros', 'Costo de Ventas'],
      ['Regla OT', 'Con OT / Sin OT / Siempre', 'Con OT'],
      ['Tipo Sistema', 'OPCIONAL. Ver guía detallada más abajo. Uno de: ' + ER_TIPO_SISTEMA_OPTIONS.map(o => o.label).join(', ') + ', o vacío/Personalizado', 'Mano de obra'],
      [],
      ['Ejemplos de llenado', '', '', '', ''],
      ['Nombre tipo gasto', 'Categoría ER', 'Sección ER', 'Regla OT', 'Tipo Sistema'],
      ['Mano de obra técnica',      'Mano de obra',        'Costo de Ventas',    'Con OT',  'Mano de obra'],
      ['Materiales e insumos',      'Materiales',          'Costo de Ventas',    'Con OT',  'Materiales'],
      ['Gasto administrativo',      'Administrativos',     'Gastos Operativos',  'Siempre', 'Administrativos'],
      ['Interés préstamo bancario', 'Gastos financieros',  'Gastos Financieros', 'Siempre', 'Intereses de financiamiento'],
      ['Comisión de venta especial','Comisiones especiales','Gastos Operativos', 'Siempre', ''],
      [],
      ['¿QUÉ ES "TIPO SISTEMA" Y PARA QUÉ SIRVE?', '', ''],
      ['Es una etiqueta OPCIONAL, distinta del nombre de la categoría o del tipo de gasto.', 'Sirve para que el ERP reconozca automáticamente esta categoría en reglas del sistema, sin importar cómo la hayas nombrado tú.', ''],
      ['¿Dónde se usa automáticamente?', 'Ej: en el formulario de Recibo por Honorarios (RHE), el sistema busca la categoría con Tipo Sistema = "Mano de obra" para asignarla sola, sin que el usuario tenga que elegirla. También se usa como respaldo en el cálculo del Estado de Resultados si falta configuración.', ''],
      ['¿Cómo se llena?', 'Solo si tu categoría corresponde EXACTAMENTE a uno de los conceptos estándar de la lista desplegable (columna E). Elige el valor de la lista; no escribas texto libre.', ''],
      ['¿Qué pongo si mi categoría es propia del negocio y no calza con ningún concepto estándar?', 'Déjala vacía, o escribe "Personalizado". La categoría funcionará normal en reportes; solo no participará de las reglas automáticas.', ''],
      ['¿Qué pasa si me equivoco o la dejo vacía?', 'No se pierde nada ni se generan errores. Puedes asignarla o corregirla después, manualmente, desde Parámetros Generales > Egresos > Categorías ER, editando la categoría y eligiendo el Tipo Sistema en el panel.', ''],
      ['¿Puedo repetir el mismo Tipo Sistema en varias categorías?', 'Evítalo. El sistema toma solo una categoría por Tipo Sistema (la que mejor calce con la Regla OT). Si repites el tipo, una de las categorías quedará sin usarse en las reglas automáticas.', ''],
      ['Lista completa de valores y su significado:', '', ''],
      ['Mano de obra', 'Costo de personal técnico/operativo facturable a los clientes (usado por el formulario de RHE).', ''],
      ['Materiales', 'Insumos y materiales consumidos en la prestación del servicio.', ''],
      ['Servicios terceros', 'Subcontratos y servicios prestados por terceros.', ''],
      ['Logistica', 'Transporte, fletes y movilización asociados al servicio.', ''],
      ['Administrativos', 'Gastos de administración general del negocio.', ''],
      ['Comerciales', 'Gastos de ventas, comisiones y marketing.', ''],
      ['Gastos financieros', 'Gastos financieros generales, distintos de intereses de préstamos.', ''],
      ['Planilla', 'Sueldos y planilla del personal fijo (no honorarios).', ''],
      ['Cargas sociales', 'EsSalud, CTS, gratificaciones y beneficios sociales.', ''],
      ['Intereses de financiamiento', 'Intereses de préstamos y financiamiento bancario.', ''],
      ['Inversiones / Activos', 'Compra de activos fijos o inversiones de capital (capitalizables).', ''],
      ['Personalizado / vacío', 'No corresponde a ningún concepto estándar del sistema; es exclusivo de tu empresa.', ''],
      [],
      ['PREGUNTAS FRECUENTES', '', ''],
      ['¿Qué pasa si la categoría ER ya existe?', 'Se reutiliza sin crear duplicado.', ''],
      ['¿Qué pasa si el tipo de gasto ya existe?', 'Se omite sin error. El sistema nunca duplica.', ''],
      ['¿Qué significa Regla OT?', "Con OT = solo aparece si el gasto tiene OT vinculada. Sin OT = solo sin OT. Siempre = siempre aparece en el ER.", ''],
    ]);
    ws2['!cols'] = [{ wch: 42 }, { wch: 90 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Configuración de egresos');
    XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones');
    XLSX.writeFile(wb, 'plantilla_egresos.xlsx');
  };

  const procesarFilas = rows => {
    // rows = array de arrays (header:1). rows[0]=headers, rows[1]=notas, rows[2+]=datos del usuario
    const dataRows = rows.slice(2).filter(r => String(r[0] || '').trim());
    const errores = [];
    const filasValidas = [];
    const catsActualesNorm = new Map(cats.map(c => [normCat(c.nombre), c]));
    const nuevasCatsSet = new Set();

    dataRows.forEach((r, idx) => {
      const excelRow = idx + 3;
      const nombre   = String(r[0] || '').trim();
      const catEr    = String(r[1] || '').trim();
      const secRaw   = normCat(String(r[2] || '').trim());
      const reglaRaw = normCat(String(r[3] || '').trim());
      const tipoSist = parseTipoSistemaImport(r[4]);
      const rowErrs  = [];
      if (!nombre)                          rowErrs.push('Nombre tipo gasto vacío');
      if (!catEr)                           rowErrs.push('Categoría ER vacía');
      if (!SECCION_MAP_IMPORT[secRaw])      rowErrs.push(`Sección ER inválida: "${r[2]}"`);
      if (!REGLA_MAP_IMPORT[reglaRaw])      rowErrs.push(`Regla OT inválida: "${r[3]}"`);
      if (!tipoSist.ok)                     rowErrs.push(`Tipo Sistema inválido: "${r[4]}" (debe ser uno de la lista o quedar vacío)`);
      if (rowErrs.length) { errores.push({ fila: excelRow, errores: rowErrs }); return; }
      filasValidas.push({ nombre, catEr, seccion: SECCION_MAP_IMPORT[secRaw], reglaOt: REGLA_MAP_IMPORT[reglaRaw], tipoSistema: tipoSist.value });
      if (!catsActualesNorm.has(normCat(catEr))) nuevasCatsSet.add(catEr);
    });
    return { total: dataRows.length, nuevasCats: [...nuevasCatsSet], errores, filasValidas };
  };

  const leerExcel = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      setPreview(procesarFilas(rows));
    } catch (err) { addNotificacion(`Error al leer el archivo: ${err?.message}`); }
  };

  const confirmarImport = async () => {
    if (!preview || !empresaId) return;
    setImportando(true);
    let tiposCreados = 0, catsCreadas = 0, omitidas = 0;
    try {
      const sb = await getSupabaseClient();
      const catsActuales = new Map(cats.map(c => [normCat(c.nombre), c]));
      for (const catNombre of preview.nuevasCats) {
        const nk = normCat(catNombre);
        if (!catsActuales.has(nk)) {
          const ref = preview.filasValidas.find(f => normCat(f.catEr) === nk);
          const { data, error } = await sb.from('er_categorias')
            .insert({ nombre: catNombre, seccion: ref?.seccion || 'gastos_operativos', regla_ot: ref?.reglaOt || 'siempre', tipo_sistema: ref?.tipoSistema || null, empresa_id: empresaId })
            .select().single();
          if (!error) { catsCreadas++; catsActuales.set(nk, data); setCats(prev => [...prev, data]); }
        }
      }
      const { data: exTipos } = await sb.from('tipos_gasto_empresa').select('nombre').eq('empresa_id', empresaId);
      const tiposExistentes = new Set((exTipos || []).map(t => normCat(t.nombre)));
      for (const fila of preview.filasValidas) {
        if (!tiposExistentes.has(normCat(fila.nombre))) {
          const { error } = await sb.from('tipos_gasto_empresa')
            .insert({ nombre: fila.nombre, categoria_er: fila.catEr, empresa_id: empresaId });
          if (!error) { tiposCreados++; tiposExistentes.add(normCat(fila.nombre)); }
          else omitidas++;
        } else { omitidas++; }
      }
      setPreview(null);
      setResultImport({ tiposCreados, catsCreadas, omitidas });
      addNotificacion(`Importación completada: ${tiposCreados} tipos creados, ${catsCreadas} categorías nuevas, ${omitidas} omitidas por duplicado.`);
    } catch (err) { addNotificacion(`Error en importación: ${err?.message}`); }
    finally { setImportando(false); }
  };

  return (
    <div className="card params-card mb-6">
      <div className="card-head">
        <h3>Categorías del Estado de Resultados</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className={'btn btn-secondary' + (importando ? ' disabled' : '')} style={{ cursor: importando ? 'not-allowed' : 'pointer', fontSize: 12 }}>
            {importando ? 'Importando...' : <>{I.download} Importar Excel</>}
            <input type="file" accept=".xlsx,.xls" onChange={leerExcel} style={{ display: 'none' }} disabled={importando} />
          </label>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={descargarPlantilla}>{I.download} Descargar plantilla</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={abrirNuevo}>{I.plus} Nueva</button>
        </div>
      </div>

      {resultImport && (
        <div style={{ margin: '0 20px 12px', fontSize: 12, background: 'var(--success-lt)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Importación completada: <strong>{resultImport.tiposCreados}</strong> tipos creados · <strong>{resultImport.catsCreadas}</strong> categorías nuevas · <strong>{resultImport.omitidas}</strong> omitidas</span>
          <button onClick={() => setResultImport(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--fg-muted)' }}>×</button>
        </div>
      )}

      {preview && (
        <div style={{ margin: '0 20px 12px', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: 'var(--bg-alt)', padding: '10px 16px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--border)' }}>
            Previsualización — confirmar importación
          </div>
          <div style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 24, marginBottom: 10, fontSize: 13 }}>
              <span><strong>{preview.total}</strong> filas detectadas</span>
              <span><strong>{preview.filasValidas.length}</strong> válidas</span>
              <span><strong>{preview.nuevasCats.length}</strong> categorías nuevas</span>
              {preview.errores.length > 0 && <span style={{ color: 'var(--danger)' }}><strong>{preview.errores.length}</strong> errores</span>}
            </div>
            {preview.nuevasCats.length > 0 && (
              <div style={{ fontSize: 12, marginBottom: 8 }}>
                <strong>Categorías a crear:</strong>{' '}
                {preview.nuevasCats.map(c => <span key={c} className="badge badge-cyan" style={{ marginRight: 4 }}>{c}</span>)}
              </div>
            )}
            {preview.errores.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {preview.errores.slice(0, 5).map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 3 }}>Fila {e.fila}: {e.errores.join(', ')}</div>
                ))}
                {preview.errores.length > 5 && <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>...y {preview.errores.length - 5} errores más</div>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setPreview(null)}>Cancelar</button>
              {preview.filasValidas.length > 0 && (
                <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={importando} onClick={confirmarImport}>
                  {importando ? 'Importando...' : `Confirmar e importar ${preview.filasValidas.length} filas`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card-body" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)' }}>Cargando...</div>
        ) : cats.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)' }}>Sin categorías — el ER usará las categorías base del sistema.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Nombre</th><th>Sección ER</th><th>Regla OT</th><th>Tipo</th><th>Estado</th>
                <th>Tipo sistema</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cats.map(c => (
                <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>
                    {c.nombre}
                    {c.es_capitalizacion && (
                      <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 400, marginTop: 2, lineHeight: 1.4 }}>
                        No aparece como gasto en el ER. Se capitaliza como activo fijo. Solo su depreciación mensual impacta el ER.
                      </div>
                    )}
                  </td>
                  <td><span className={`badge ${ER_SECCIONES_BADGES[c.seccion] || 'badge-gray'}`}>{ER_SECCIONES_LABELS[c.seccion] || c.seccion}</span></td>
                  <td><span className="badge badge-gray">{ER_REGLA_LABELS[c.regla_ot] || c.regla_ot}</span></td>
                  <td>
                    {c.es_base && <span className="badge badge-yellow">Base</span>}
                    {c.es_capitalizacion && <span className="badge badge-orange" style={{ marginLeft: c.es_base ? 4 : 0 }}>Capitalización</span>}
                  </td>
                  <td><span className={`badge ${c.activo ? 'badge-green' : 'badge-gray'}`}>{c.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td><span className={`badge ${c.tipo_sistema ? 'badge-cyan' : 'badge-gray'}`}>{ER_TIPO_SISTEMA_BADGE(c.tipo_sistema)}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => abrirEditar(c)}>{I.edit}</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => toggleActivo(c)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanel(false)} />
          <div className="side-panel" style={{ width: 'min(440px, 96vw)' }}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">ER · Categorías</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{editando ? 'Editar categoría' : 'Nueva categoría'}</div>
              </div>
              <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
            </div>
            <div className="side-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="input-group">
                <label>Nombre <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input" value={form.nombre} onChange={e => setF('nombre', e.target.value)} placeholder="Ej: Mano de obra, Explosivos, Insumos médicos" />
              </div>
              <div className="input-group">
                <label>Sección del ER</label>
                <select className="select" value={form.seccion} onChange={e => setF('seccion', e.target.value)}>
                  <option value="costo_ventas">Costo de Ventas</option>
                  <option value="gastos_operativos">Gastos Operativos</option>
                  <option value="gastos_financieros">Gastos Financieros</option>
                </select>
              </div>
              <div className="input-group">
                <label>Regla OT</label>
                <select className="select" value={form.regla_ot} onChange={e => setF('regla_ot', e.target.value)}>
                  <option value="siempre">Siempre</option>
                  <option value="con_ot">Solo con OT</option>
                  <option value="sin_ot">Solo sin OT</option>
                </select>
              </div>
              <div className="input-group">
                <label>Tipo sistema</label>
                <select className="select" value={form.tipo_sistema} onChange={e => setF('tipo_sistema', e.target.value)}>
                  <option value="">Personalizado / Sin tipo</option>
                  {ER_TIPO_SISTEMA_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:4,lineHeight:1.4}}>
                  El tipo de sistema permite que el ERP identifique esta categoria para reglas automaticas, como el formulario de RHE. Si no aplica ningun tipo estandar, deja Personalizado.
                </div>
              </div>
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: editando?.es_base ? 'not-allowed' : 'pointer',
                padding: '10px 14px', borderRadius: 8,
                background: form.es_capitalizacion
                  ? 'color-mix(in srgb, var(--orange) 8%, var(--surface))'
                  : 'var(--bg-subtle)',
                border: `1px solid ${form.es_capitalizacion ? 'color-mix(in srgb, var(--orange) 30%, var(--border))' : 'var(--border)'}`,
                opacity: editando?.es_base ? 0.7 : 1,
              }}>
                <input
                  type="checkbox"
                  checked={!!form.es_capitalizacion}
                  onChange={e => setF('es_capitalizacion', e.target.checked)}
                  disabled={!!editando?.es_base}
                  style={{ width: 16, height: 16, cursor: editando?.es_base ? 'not-allowed' : 'pointer', flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Es capitalización (Activo Fijo)
                    {editando?.es_base && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>Sistema — no editable</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2, lineHeight: 1.4 }}>
                    Los egresos de esta categoría no fluyen al ER como gasto del período. Se registran como activo fijo.
                  </div>
                </div>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label>Orden</label>
                  <input className="input" type="number" min="0" value={form.orden} onChange={e => setF('orden', Number(e.target.value))} />
                </div>
                <div className="input-group">
                  <label>Estado</label>
                  <select className="select" value={form.activo ? 'activo' : 'inactivo'} onChange={e => setF('activo', e.target.value === 'activo')}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                <button className="btn btn-secondary" type="button" onClick={() => setPanel(false)}>Cancelar</button>
                <button className="btn btn-primary" type="button" disabled={guardando || !form.nombre.trim()} onClick={guardar}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Vista de solo lectura del Estado de Resultados ────────────────────────────
function EstructuraERView() {
  const { empresa } = useApp();
  const empresaId   = empresa?.id;
  const [cats, setCats]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId) { setLoading(false); return; }
    getSupabaseClient().then(sb =>
      sb.from('er_categorias').select('id, nombre, seccion, regla_ot, tipo_sistema, es_base, es_capitalizacion')
        .eq('empresa_id', empresaId).eq('activo', true).order('orden')
    ).then(({ data }) => setCats(data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [empresaId]);

  const ER_AUTO = [
    { seccion: 'costo_ventas',              nombre: 'Mano de obra directa (costos OT)' },
    { seccion: 'gastos_operativos',         nombre: 'Planilla neta' },
    { seccion: 'gastos_operativos',         nombre: 'Cargas sociales' },
    { seccion: 'gastos_financieros',        nombre: 'Intereses de financiamiento' },
    { seccion: 'depreciacion_amortizacion', nombre: 'Depreciación de activos fijos' },
  ];

  return (
    <div className="card params-card mb-6">
      <div className="card-head">
        <h3>Vista previa del Estado de Resultados</h3>
        <span className="badge badge-gray" style={{ fontSize: 11 }}>Solo lectura — edita en Categorías ER</span>
      </div>
      {loading ? (
        <div style={{ padding: 24, color: 'var(--fg-muted)', fontSize: 13 }}>Cargando...</div>
      ) : (
        <div style={{ padding: '12px 20px' }}>
          {['costo_ventas', 'gastos_operativos', 'gastos_financieros', 'depreciacion_amortizacion'].map(sec => {
            const autoItems = ER_AUTO.filter(a => a.seccion === sec);
            const secCats   = cats.filter(c => c.seccion === sec && !c.es_capitalizacion);
            const capCats   = cats.filter(c => c.seccion === sec && c.es_capitalizacion);
            return (
              <div key={sec} style={{ marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, padding: '6px 10px', background: 'var(--bg-alt)', borderRadius: 6 }}>
                  {ER_SECCIONES_LABELS[sec]}
                </div>
                {autoItems.map(a => (
                  <div key={a.nombre} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', fontSize: 13, color: 'var(--fg-muted)' }}>
                    <span style={{ flex: 1 }}>{a.nombre}</span>
                    <span className="badge badge-gray" style={{ fontSize: 10 }}>Automático</span>
                  </div>
                ))}
                {secCats.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{c.nombre}</span>
                    <span className="badge badge-gray" style={{ fontSize: 10 }}>{ER_REGLA_LABELS[c.regla_ot] || c.regla_ot}</span>
                    <span className={`badge ${c.tipo_sistema ? 'badge-cyan' : 'badge-gray'}`} style={{ fontSize: 10 }}>{ER_TIPO_SISTEMA_BADGE(c.tipo_sistema)}</span>
                    {c.es_base && <span className="badge badge-yellow" style={{ fontSize: 10 }}>Base</span>}
                  </div>
                ))}
                {capCats.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', fontSize: 13, color: 'var(--fg-muted)' }}>
                    <span style={{ flex: 1 }}>{c.nombre}</span>
                    <span className="badge badge-orange" style={{ fontSize: 10 }}>Capitalización</span>
                    <span className="badge badge-gray" style={{ fontSize: 10, fontStyle: 'italic' }}>no fluye al ER</span>
                  </div>
                ))}
                {!autoItems.length && !secCats.length && !capCats.length && (
                  <div style={{ padding: '5px 10px', fontSize: 13, color: 'var(--fg-muted)', fontStyle: 'italic' }}>Sin categorías en esta sección</div>
                )}
                {sec === 'gastos_financieros' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', marginTop: 4, background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>
                    <span style={{ flex: 1 }}>= EBITDA</span>
                    <span className="badge badge-gray" style={{ fontSize: 10 }}>Antes de depreciación</span>
                  </div>
                )}
                {sec === 'depreciacion_amortizacion' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', marginTop: 4, background: 'var(--navy)', borderRadius: 6, fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    <span style={{ flex: 1 }}>= EBIT / Resultado Neto</span>
                    <span className="badge badge-cyan" style={{ fontSize: 10 }}>Después de depreciación</span>
                  </div>
                )}
              </div>
            );
          })}
          {!cats.length && (
            <div style={{ textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13, padding: 12 }}>
              Sin categorías configuradas — el ER usará las categorías base del sistema al calcular.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const EGRESOS_TABS = [
  { key: 'categorias', label: 'Categorías ER' },
  { key: 'tipos',      label: 'Tipos de gasto' },
  { key: 'estructura', label: 'Estructura del ER' },
];

function EgresosConfigAdmin() {
  const [tabEgresos, setTabEgresos] = useState('categorias');
  return (
    <div>
      <div className="card params-card" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div style={{ display: 'flex', gap: 0, padding: '4px 20px' }}>
          {EGRESOS_TABS.map(t => (
            <button key={t.key} onClick={() => setTabEgresos(t.key)} style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: tabEgresos === t.key ? 700 : 400, borderBottom: tabEgresos === t.key ? '2px solid var(--cyan)' : '2px solid transparent', color: tabEgresos === t.key ? 'var(--cyan)' : 'var(--fg-muted)', marginBottom: -1, fontSize: 13 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {tabEgresos === 'categorias' && <ErCategoriasAdmin />}
        {tabEgresos === 'tipos'      && <TiposGastoAdmin />}
        {tabEgresos === 'estructura' && <EstructuraERView />}
      </div>
    </div>
  );
}

const SOCIEDAD_FORM_INICIAL = {
  id: null,
  razon_social: '',
  nombre: '',
  ruc: '',
  codigo: '',
  direccion_fiscal: '',
  logo_url: null,
  firma_url: null,
  regimen_laboral: '',
  pct_quincena_1: '',
  hereda_pct_quincena: true,
  activa: true,
  es_principal: false,
};

const sociedadAFormulario = sociedad => ({
  ...SOCIEDAD_FORM_INICIAL,
  ...sociedad,
  razon_social: sociedad?.razon_social || '',
  nombre: sociedad?.nombre || '',
  ruc: sociedad?.ruc || '',
  codigo: sociedad?.codigo || '',
  direccion_fiscal: sociedad?.direccion_fiscal || '',
  regimen_laboral: sociedad?.regimen_laboral || '',
  pct_quincena_1: sociedad?.pct_quincena_1 == null ? '' : String(sociedad.pct_quincena_1),
  hereda_pct_quincena: sociedad?.pct_quincena_1 == null,
  activa: sociedad?.activa !== false,
  es_principal: Boolean(sociedad?.es_principal),
});

function SociedadesAdmin() {
  const {
    empresa,
    subirImagenEmpresa,
    recargarSociedades,
    addNotificacion,
  } = useApp();
  const [sociedades, setSociedades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(null);
  const [logoFileSociedad, setLogoFileSociedad] = useState(null);
  const [firmaFileSociedad, setFirmaFileSociedad] = useState(null);
  const [logoPreviewSociedad, setLogoPreviewSociedad] = useState(null);
  const [firmaPreviewSociedad, setFirmaPreviewSociedad] = useState(null);
  const [savingSociedad, setSavingSociedad] = useState(false);
  const [formError, setFormError] = useState('');

  const cargarSociedades = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    setLoadError('');
    try {
      setSociedades(await listarSociedadesAdministracion(empresa.id));
    } catch (error) {
      setLoadError(error?.message || 'No se pudo cargar la lista de sociedades.');
    } finally {
      setLoading(false);
    }
  }, [empresa?.id]);

  useEffect(() => { cargarSociedades(); }, [cargarSociedades]);

  const abrirFormulario = sociedad => {
    const siguiente = sociedad ? sociedadAFormulario(sociedad) : { ...SOCIEDAD_FORM_INICIAL };
    setForm(siguiente);
    setLogoFileSociedad(null);
    setFirmaFileSociedad(null);
    setLogoPreviewSociedad(siguiente.logo_url || null);
    setFirmaPreviewSociedad(siguiente.firma_url || null);
    setFormError('');
  };

  const cerrarFormulario = () => {
    setForm(null);
    setLogoFileSociedad(null);
    setFirmaFileSociedad(null);
    setLogoPreviewSociedad(null);
    setFirmaPreviewSociedad(null);
    setFormError('');
  };

  const seleccionarImagenSociedad = (setFile, setPreview) => event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const guardarSociedad = async event => {
    event.preventDefault();
    setSavingSociedad(true);
    setFormError('');
    try {
      const payload = {
        razon_social: form.razon_social,
        nombre: form.nombre,
        ruc: form.ruc,
        codigo: form.codigo,
        direccion_fiscal: form.direccion_fiscal,
        logo_url: form.logo_url,
        firma_url: form.firma_url,
        regimen_laboral: form.regimen_laboral || null,
        pct_quincena_1: form.hereda_pct_quincena ? null : form.pct_quincena_1,
        activa: Boolean(form.activa),
      };

      let guardada = form.id
        ? await actualizarSociedad(form.id, empresa.id, payload)
        : await crearSociedad({ ...payload, empresa_id: empresa.id, es_principal: false });

      const urls = {};
      const advertencias = [];
      if (logoFileSociedad) {
        try {
          const subida = await subirImagenEmpresa(`sociedad-${guardada.id}-logo`, logoFileSociedad);
          urls.logo_url = typeof subida === 'string' ? subida : subida?.url;
        } catch (error) {
          advertencias.push(`logo: ${error?.message || 'error de storage'}`);
        }
      }
      if (firmaFileSociedad) {
        try {
          const subida = await subirImagenEmpresa(`sociedad-${guardada.id}-firma`, firmaFileSociedad);
          urls.firma_url = typeof subida === 'string' ? subida : subida?.url;
        } catch (error) {
          advertencias.push(`firma: ${error?.message || 'error de storage'}`);
        }
      }
      if (Object.values(urls).some(Boolean)) {
        guardada = await actualizarSociedad(guardada.id, empresa.id, urls);
      }

      await cargarSociedades();
      await recargarSociedades?.();
      cerrarFormulario();
      addNotificacion(advertencias.length
        ? `Sociedad guardada. No se pudo subir ${advertencias.join(' / ')}.`
        : 'Sociedad guardada correctamente.');
    } catch (error) {
      const mensaje = error?.message || 'No se pudo guardar la sociedad.';
      setFormError(mensaje);
      addNotificacion(`No se pudo guardar la sociedad: ${mensaje}`);
    } finally {
      setSavingSociedad(false);
    }
  };

  return (
    <div>
      <div className="card params-card mb-6">
        <div className="card-head">
          <div>
            <h3>Sociedades del grupo</h3>
            <div className="text-muted" style={{fontSize:12, marginTop:4}}>Administra la identidad legal y los overrides de nomina de cada sociedad.</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => abrirFormulario(null)}>{I.plus} Nueva sociedad</button>
        </div>
        {loadError && <div className="alert alert-danger" style={{margin:16}}>{loadError}</div>}
        {loading ? (
          <div className="card-body text-muted">Cargando sociedades...</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Sociedad</th><th>Codigo</th><th>RUC</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
              <tbody>
                {sociedades.map(sociedad => (
                  <tr key={sociedad.id}>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                        <strong>{sociedad.nombre}</strong>
                        {sociedad.es_principal && <span className="badge badge-cyan">Principal</span>}
                      </div>
                      {sociedad.razon_social && <div className="text-muted" style={{fontSize:11, marginTop:2}}>{sociedad.razon_social}</div>}
                    </td>
                    <td><span className="mono">{sociedad.codigo}</span></td>
                    <td>{sociedad.ruc || '-'}</td>
                    <td><span className={`badge ${sociedad.activa ? 'badge-green' : 'badge-gray'}`}>{sociedad.activa ? 'Activa' : 'Inactiva'}</span></td>
                    <td style={{textAlign:'right'}}><button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirFormulario(sociedad)}>{I.edit} Editar</button></td>
                  </tr>
                ))}
                {!sociedades.length && <tr><td colSpan={5} className="text-muted" style={{textAlign:'center', padding:24}}>No hay sociedades registradas.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !savingSociedad) cerrarFormulario(); }}>
          <div className="modal" style={{maxWidth:760, width:'min(760px, calc(100vw - 32px))'}}>
            <div className="modal-head">
              <div><h3>{form.id ? 'Editar sociedad' : 'Nueva sociedad'}</h3>{form.es_principal && <span className="badge badge-cyan" style={{marginTop:6}}>Sociedad Principal</span>}</div>
              <button type="button" className="icon-btn" disabled={savingSociedad} onClick={cerrarFormulario}>{I.x}</button>
            </div>
            <form onSubmit={guardarSociedad}>
              <div className="modal-body" style={{maxHeight:'70vh', overflowY:'auto'}}>
                {formError && <div className="alert alert-danger" style={{marginBottom:16}}>{formError}</div>}
                <div className="grid-2" style={{gap:16}}>
                  <div className="input-group"><label>Razon social</label><input className="input" required value={form.razon_social} onChange={e=>setForm(p=>({...p,razon_social:e.target.value}))}/></div>
                  <div className="input-group"><label>Nombre comercial</label><input className="input" required value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/></div>
                  <div className="input-group"><label>RUC</label><input className="input" required value={form.ruc} onChange={e=>setForm(p=>({...p,ruc:e.target.value}))}/></div>
                  <div className="input-group"><label>Codigo</label><input className="input" value={form.codigo} onChange={e=>setForm(p=>({...p,codigo:e.target.value}))} placeholder="Se genera desde el nombre si se deja vacio"/></div>
                  <div className="input-group" style={{gridColumn:'1/-1'}}><label>Direccion fiscal</label><input className="input" value={form.direccion_fiscal} onChange={e=>setForm(p=>({...p,direccion_fiscal:e.target.value}))}/></div>

                  <div className="input-group">
                    <label>Logo</label>
                    <div style={{width:150, height:82, border:'1px dashed var(--border)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', marginBottom:8}}>
                      {logoPreviewSociedad ? <img src={logoPreviewSociedad} alt="Logo de la sociedad" style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}}/> : <span className="text-muted" style={{fontSize:11}}>Sin logo</span>}
                    </div>
                    <label className="btn btn-secondary btn-sm" style={{cursor:'pointer', width:'fit-content'}}>{I.upload} Subir logo<input type="file" accept="image/*" hidden onChange={seleccionarImagenSociedad(setLogoFileSociedad, setLogoPreviewSociedad)}/></label>
                  </div>
                  <div className="input-group">
                    <label>Firma</label>
                    <div style={{width:180, height:82, border:'1px dashed var(--border)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', marginBottom:8}}>
                      {firmaPreviewSociedad ? <img src={firmaPreviewSociedad} alt="Firma de la sociedad" style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}}/> : <span className="text-muted" style={{fontSize:11}}>Sin firma</span>}
                    </div>
                    <label className="btn btn-secondary btn-sm" style={{cursor:'pointer', width:'fit-content'}}>{I.upload} Subir firma<input type="file" accept="image/*" hidden onChange={seleccionarImagenSociedad(setFirmaFileSociedad, setFirmaPreviewSociedad)}/></label>
                  </div>

                  <div className="input-group">
                    <label>Regimen laboral</label>
                    <select className="select" value={form.regimen_laboral} onChange={e=>setForm(p=>({...p,regimen_laboral:e.target.value}))}>
                      <option value="">Heredar del tenant</option>
                      <option value="general">General</option>
                      <option value="pequena_empresa">Pequena empresa</option>
                      <option value="microempresa">Microempresa</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>% Quincena 1</label>
                    <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12, marginBottom:8, cursor:'pointer'}}><input type="checkbox" checked={form.hereda_pct_quincena} onChange={e=>setForm(p=>({...p,hereda_pct_quincena:e.target.checked,pct_quincena_1:e.target.checked?'':p.pct_quincena_1}))}/> Heredar del tenant</label>
                    <input className="input" type="number" min="1" max="99" step="0.01" required={!form.hereda_pct_quincena} disabled={form.hereda_pct_quincena} value={form.pct_quincena_1} onChange={e=>setForm(p=>({...p,pct_quincena_1:e.target.value}))}/>
                  </div>
                  <div className="input-group" style={{gridColumn:'1/-1'}}>
                    <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}}><input type="checkbox" checked={form.activa} onChange={e=>setForm(p=>({...p,activa:e.target.checked}))}/> Sociedad activa</label>
                    <div className="text-muted" style={{fontSize:11, marginTop:5}}>La base de datos impedira desactivar la ultima sociedad activa del tenant.</div>
                  </div>
                </div>
              </div>
              <div className="modal-foot" style={{display:'flex', justifyContent:'flex-end', gap:8}}>
                <button type="button" className="btn btn-secondary" disabled={savingSociedad} onClick={cerrarFormulario}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={savingSociedad}>{I.save} {savingSociedad ? 'Guardando...' : 'Guardar sociedad'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


function Parametros() {
  const {
    empresaConfig, guardarEmpresaConfig, subirImagenEmpresa, addNotificacion,
    empresa, role, authUser, membresiaActiva,
    afpParametros = AFP_PARAMETROS_DEFAULT, guardarAfpParametro,
    seriesDocumentarias = [], slaPlantillas = [], diccionarioComercial = [],
    monedasImpuestosUnidades = [],
    crearSerieDocumentaria, actualizarSerieDocumentaria, eliminarSerieDocumentaria,
    crearSlaPlantilla, actualizarSlaPlantilla, eliminarSlaPlantilla,
    crearDiccionarioComercial, actualizarDiccionarioComercial, eliminarDiccionarioComercial,
    whatsappPlantillas = [], whatsappMatriz = [], whatsappEnvios = [],
    guardarWhatsappPlantillaCtx, guardarWhatsappRutaCtx, registrarWhatsappSimuladoCtx,
    tipoCambioHoy,
  } = useApp();
  const [saving, setSaving] = useState(false);
  const [savingSerie, setSavingSerie] = useState(false);
  const [savingSla, setSavingSla] = useState(false);
  const [savingDicc, setSavingDicc] = useState(false);

  // ── Tipos de Cambio ──
  const [tcHoy, setTcHoy] = useState(null);
  const [historialTC, setHistorialTC] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const hoy = new Date().toISOString().split('T')[0];
  const [tcManual, setTcManual] = useState({ fecha: hoy, usd: '', eur: '', fuente: 'manual' });
  const [savingManual, setSavingManual] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const [datos, setDatos] = useState({ razon_social:'', ruc:'', email_comercial:'', sitio_web:'', direccion:'', firmante:'', cargo_firmante:'' });
  const [conds, setConds] = useState({ cond_forma_pago:'', cond_validez:'', cond_penalidad:'', cond_inicio_proyecto:'', cond_alcance:'', cond_integraciones:'', cond_confidencialidad:'', cond_glosa_factura:'' });
  const [colores, setColores] = useState({ color_primario:'#1A2B4A', color_secundario:'#607D8B' });
  const defaultFlujos = [
    { modulo: 'OT', flujo: 'borrador -> programada -> ejecucion -> pendiente cierre -> cerrada -> valorizada -> facturada', alerta: 'SLA por contrato' },
    { modulo: 'Cotizacion', flujo: 'borrador -> enviada -> aprobada -> ganada / perdida', alerta: 'Descuento requiere aprobacion' },
    { modulo: 'SOLPE', flujo: 'borrador -> solicitada -> aprobada -> atendida', alerta: 'Urgencia alta notifica supervisor' },
    { modulo: 'Compras campo', flujo: 'capturada -> pendiente revision -> validada -> CxP', alerta: 'IA con baja confianza' },
  ];
  const emptySerie = { documento:'', serie:'', siguiente_correlativo:'1', regla:'', estado:'activo' };
  const emptySla = { nombre:'', tiempo_respuesta_horas:'4', tiempo_resolucion_horas:'24', semaforo_regla:'Rojo a 80%', estado:'activo' };
  const emptyDicc = { categoria:'Comercial', clave:'', texto:'', estado:'activo' };
  const [parametros, setParametros] = useState({ moneda_base:'PEN', igv_defecto:'18', zona_horaria:'America/Lima', plantilla_cotizacion:'TIDEO propuesta tecnica v3', plantilla_factura:'Exportacion fiscal externa', condicion_pago_defecto:'30 días', requiere_2fa_financiero:false, agente_retencion:false });
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
  const [paramSection, setParamSection] = useState('identidad');
  const puedeAdministrarSociedades = Boolean(
    empresa?.multisociedad_habilitado
    && (
      authUser?.es_admin_empresa
      || authUser?.es_superadmin
      || (membresiaActiva && (role?.es_admin_empresa || role?.permisos?.tenant_admin || role?.permisos?.todo))
    )
  );

  useEffect(() => {
    if (paramSection === 'sociedades' && !puedeAdministrarSociedades) setParamSection('identidad');
  }, [paramSection, puedeAdministrarSociedades]);

  // ── Estado configuración de nómina ──
  const nominaBase = {
    regimen_laboral_empresa: 'general', frecuencia_pago: 'mensual',
    dia_corte_mensual: 25, dia_pago_mensual: 30,
    dia_corte_q1: 10, dia_pago_q1: 15,
    dia_corte_q2: 25, dia_pago_q2: 30,
    pct_quincena_1: 50,
    uit_vigente: 5500, rmv_vigente: 1130, ram_tope_afp: 12598.91,
  };
  const [nominaCfg, setNominaCfg] = useState(nominaBase);
  const [savingNomina, setSavingNomina] = useState(false);
  const [showRegimenModal, setShowRegimenModal] = useState(false);
  const [pendingRegimen, setPendingRegimen] = useState(null);
  const [afpEdit, setAfpEdit] = useState(null);
  const [afpSaving, setAfpSaving] = useState(false);
  const [regimenConfirmCheck, setRegimenConfirmCheck] = useState(false);
  const evaluacionBase = {
    eval_peso_autoevaluacion: 30,
    eval_peso_jefe: 70,
    eval_peso_competencias: 50,
    eval_peso_objetivos: 50,
    eval_escala_min: 1,
    eval_escala_max: 5,
    eval_escala_labels: {
      1: 'Insatisfactorio',
      2: 'Por mejorar',
      3: 'Satisfactorio',
      4: 'Destacado',
      5: 'Sobresaliente',
    },
  };
  const [evalCfg, setEvalCfg] = useState(evaluacionBase);
  const [savingEvalCfg, setSavingEvalCfg] = useState(false);
  const [whatsappCfg, setWhatsappCfg] = useState({
    whatsapp_habilitado: false,
    whatsapp_provider: 'simulado',
    whatsapp_base_url: '',
    whatsapp_phone_number_id: '',
    whatsapp_api_key_ref: 'WHATSAPP_API_KEY',
    whatsapp_internos_consentimiento_implicito: true,
    whatsapp_reintentos_max: 3,
  });
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

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
      condicion_pago_defecto: empresaConfig.condicion_pago_defecto || '30 días',
      requiere_2fa_financiero: Boolean(empresaConfig.requiere_2fa_financiero),
      agente_retencion: Boolean(empresaConfig.agente_retencion),
    });
    const cfgFlujos = Array.isArray(empresaConfig.config_flujos_alertas) ? empresaConfig.config_flujos_alertas : defaultFlujos;
    setFlujosAlertas(cfgFlujos.length ? cfgFlujos : defaultFlujos);
    if (empresaConfig.logo_url) setLogoPreview(empresaConfig.logo_url);
    if (empresaConfig.firma_url) setFirmaPreview(empresaConfig.firma_url);
    setNominaCfg({
      regimen_laboral_empresa: empresaConfig.regimen_laboral_empresa || 'general',
      frecuencia_pago: empresaConfig.frecuencia_pago || 'mensual',
      dia_corte_mensual: empresaConfig.dia_corte_mensual ?? 25,
      dia_pago_mensual: empresaConfig.dia_pago_mensual ?? 30,
      dia_corte_q1: empresaConfig.dia_corte_q1 ?? 10,
      dia_pago_q1: empresaConfig.dia_pago_q1 ?? 15,
      dia_corte_q2: empresaConfig.dia_corte_q2 ?? 25,
      dia_pago_q2: empresaConfig.dia_pago_q2 ?? 30,
      pct_quincena_1: empresaConfig.pct_quincena_1 ?? 50,
      uit_vigente: empresaConfig.uit_vigente ?? 5500,
      rmv_vigente: empresaConfig.rmv_vigente ?? 1130,
      ram_tope_afp: empresaConfig.ram_tope_afp ?? 12598.91,
    });
    setEvalCfg({
      eval_peso_autoevaluacion: empresaConfig.eval_peso_autoevaluacion ?? 30,
      eval_peso_jefe: empresaConfig.eval_peso_jefe ?? 70,
      eval_peso_competencias: empresaConfig.eval_peso_competencias ?? 50,
      eval_peso_objetivos: empresaConfig.eval_peso_objetivos ?? 50,
      eval_escala_min: empresaConfig.eval_escala_min ?? 1,
      eval_escala_max: empresaConfig.eval_escala_max ?? 5,
      eval_escala_labels: empresaConfig.eval_escala_labels || evaluacionBase.eval_escala_labels,
    });
    setWhatsappCfg({
      whatsapp_habilitado: Boolean(empresaConfig.whatsapp_habilitado),
      whatsapp_provider: empresaConfig.whatsapp_provider || 'simulado',
      whatsapp_base_url: empresaConfig.whatsapp_base_url || '',
      whatsapp_phone_number_id: empresaConfig.whatsapp_phone_number_id || '',
      whatsapp_api_key_ref: empresaConfig.whatsapp_api_key_ref || 'WHATSAPP_API_KEY',
      whatsapp_internos_consentimiento_implicito: empresaConfig.whatsapp_internos_consentimiento_implicito ?? true,
      whatsapp_reintentos_max: empresaConfig.whatsapp_reintentos_max ?? 3,
    });
  }, [empresaConfig]);

  useEffect(() => {
    if (paramSection !== 'tipo_cambio') return;
    setLoadingHistorial(true);
    getSupabaseClient().then(supabase =>
      supabase.from('tipo_cambio_historico').select('*').eq('moneda_base', 'PEN')
        .order('fecha', { ascending: false }).limit(30)
    ).then(({ data }) => {
      setHistorialTC(data || []);
      if (data?.[0]) setTcHoy(data[0]);
      else if (tipoCambioHoy?.usd) setTcHoy(tipoCambioHoy);
      setLoadingHistorial(false);
    }).catch(() => {
      if (tipoCambioHoy?.usd) setTcHoy(tipoCambioHoy);
      setLoadingHistorial(false);
    });
  }, [paramSection]);

  const handleActualizarTC = async () => {
    setActualizando(true);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/PEN');
      const json = await res.json();
      if (json.result !== 'success') throw new Error('La API no devolvió datos válidos.');
      const row = { fecha: hoy, moneda_base: 'PEN', usd: json.rates?.USD ?? null, eur: json.rates?.EUR ?? null, fuente: 'open.er-api.com' };
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('tipo_cambio_historico').upsert(row, { onConflict: 'fecha,moneda_base' });
      if (error) throw error;
      const { data } = await supabase.from('tipo_cambio_historico').select('*').eq('moneda_base', 'PEN').order('fecha', { ascending: false }).limit(30);
      setHistorialTC(data || []);
      setTcHoy({ ...row, creado_en: new Date().toISOString() });
      addNotificacion('Tipo de cambio actualizado desde open.er-api.com');
    } catch (err) {
      addNotificacion(`No se pudo actualizar el TC: ${err?.message || 'error'}`);
    } finally {
      setActualizando(false);
    }
  };

  const handleGuardarManual = async (e) => {
    e.preventDefault();
    const usdVal = Number(tcManual.usd);
    const eurVal = Number(tcManual.eur);
    if (!usdVal || !eurVal) { addNotificacion('Ingresa valores válidos para USD y EUR.'); return; }
    setSavingManual(true); setSavedMsg('');
    try {
      const row = { fecha: tcManual.fecha || hoy, moneda_base: 'PEN', usd: 1 / usdVal, eur: 1 / eurVal, fuente: tcManual.fuente || 'manual' };
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('tipo_cambio_historico').upsert(row, { onConflict: 'fecha,moneda_base' });
      if (error) throw error;
      const { data } = await supabase.from('tipo_cambio_historico').select('*').eq('moneda_base', 'PEN').order('fecha', { ascending: false }).limit(30);
      setHistorialTC(data || []);
      if (data?.[0]) setTcHoy(data[0]);
      setSavedMsg('Tipo de cambio guardado correctamente.');
      setTcManual({ fecha: hoy, usd: '', eur: '', fuente: 'manual' });
      addNotificacion('TC manual guardado.');
    } catch (err) {
      addNotificacion(`Error al guardar TC: ${err?.message || 'error'}`);
    } finally {
      setSavingManual(false);
    }
  };

  const pickImagen = (campo, setFile, setPreview) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const guardarNominaCfg = async () => {
    setSavingNomina(true);
    try {
      await guardarEmpresaConfig({ ...nominaCfg });
      addNotificacion('Configuracion de nomina guardada.');
    } catch (err) {
      addNotificacion(`Error al guardar: ${err?.message || 'error'}`);
    } finally {
      setSavingNomina(false);
    }
  };

  const guardarEvalCfg = async () => {
    const sumaEvaluadores = Number(evalCfg.eval_peso_autoevaluacion) + Number(evalCfg.eval_peso_jefe);
    const sumaDimensiones = Number(evalCfg.eval_peso_competencias) + Number(evalCfg.eval_peso_objetivos);
    if (sumaEvaluadores !== 100 || sumaDimensiones !== 100) {
      addNotificacion('Las ponderaciones de evaluacion deben sumar 100.');
      return;
    }
    setSavingEvalCfg(true);
    try {
      await guardarEmpresaConfig({
        ...evalCfg,
        eval_peso_autoevaluacion: Number(evalCfg.eval_peso_autoevaluacion),
        eval_peso_jefe: Number(evalCfg.eval_peso_jefe),
        eval_peso_competencias: Number(evalCfg.eval_peso_competencias),
        eval_peso_objetivos: Number(evalCfg.eval_peso_objetivos),
        eval_escala_min: Number(evalCfg.eval_escala_min),
        eval_escala_max: Number(evalCfg.eval_escala_max),
      });
      addNotificacion('Configuracion de evaluaciones guardada.');
    } catch (err) {
      addNotificacion(`Error al guardar evaluaciones: ${err?.message || 'error'}`);
    } finally {
      setSavingEvalCfg(false);
    }
  };

  const guardarWhatsappCfg = async () => {
    setSavingWhatsapp(true);
    try {
      await guardarEmpresaConfig({ ...whatsappCfg });
      addNotificacion('Configuracion WhatsApp guardada.');
    } catch (err) {
      addNotificacion(`Error al guardar WhatsApp: ${err?.message || 'error'}`);
    } finally {
      setSavingWhatsapp(false);
    }
  };

  const sembrarWhatsappDefaults = async () => {
    for (const tpl of WHATSAPP_TEMPLATES_DEFAULT) {
      const existente = whatsappPlantillas.find(t => t.tipo_alerta === tpl.tipo_alerta);
      await guardarWhatsappPlantillaCtx({ ...tpl, id: existente?.id || tpl.id });
    }
    for (const ruta of WHATSAPP_RUTAS_DEFAULT) {
      const existente = whatsappMatriz.find(r => r.tipo_alerta === ruta.tipo_alerta);
      await guardarWhatsappRutaCtx({ ...ruta, id: existente?.id || ruta.id });
    }
    addNotificacion('Plantillas y matriz WhatsApp inicializadas.');
  };

  const toggleWhatsappRuta = async (ruta, field) => {
    await guardarWhatsappRutaCtx({ ...ruta, [field]: !ruta[field] });
  };

  const simularWhatsapp = async () => {
    const plantilla = whatsappPlantillas[0] || WHATSAPP_TEMPLATES_DEFAULT[0];
    await registrarWhatsappSimuladoCtx({
      tipo_alerta: plantilla.tipo_alerta,
      destinatario_tipo: 'rrhh',
      telefono: '51999999999',
      plantilla_id: plantilla.id,
      proveedor_template: plantilla.proveedor_template,
      variables: { colaborador: 'Demo DIFESMAQ', documento: 'SCTR', fecha_vencimiento: new Date().toISOString().slice(0, 10), dias_restantes: 7 },
      referencia_tipo: 'simulacion',
      referencia_id: `sim_${Date.now()}`,
      estado: whatsappCfg.whatsapp_provider === 'simulado' ? 'simulado' : 'encolado',
    });
    addNotificacion('Envio WhatsApp simulado registrado en el log.');
  };

  const confirmarCambioRegimen = (nuevoRegimen) => {
    if (nuevoRegimen === nominaCfg.regimen_laboral_empresa) return;
    setPendingRegimen(nuevoRegimen);
    setRegimenConfirmCheck(false);
    setShowRegimenModal(true);
  };

  const abrirEditarAfp = (row) => {
    setAfpEdit({
      afp_nombre: row.afp_nombre,
      pct_prima_seguro: String(row.pct_prima_seguro ?? AFP_PRIMA_SEGURO_FALLBACK),
      vigente_desde: row.vigente_desde || new Date().toISOString().slice(0, 10),
    });
  };

  const guardarTasaAfp = async () => {
    if (!afpEdit?.afp_nombre) return;
    setAfpSaving(true);
    try {
      await guardarAfpParametro({
        afp_nombre: afpEdit.afp_nombre,
        pct_prima_seguro: Number(afpEdit.pct_prima_seguro),
        vigente_desde: afpEdit.vigente_desde,
      });
      setAfpEdit(null);
    } catch (err) {
      addNotificacion(`Error al guardar tasa AFP: ${err?.message || 'error'}`);
    } finally {
      setAfpSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const extra = {};
      const { moneda_base, ...parametrosSinMoneda } = parametros;
      if (logoFile) {
        try {
          const uploaded = await subirImagenEmpresa('logo', logoFile);
          extra.logo_url = typeof uploaded === 'string' ? uploaded : uploaded?.url;
          if (uploaded?.path) extra.logo_path = uploaded.path;
        } catch (_) { addNotificacion('No se pudo subir el logo; verifique el bucket en Supabase.'); }
        setLogoFile(null);
      }
      if (firmaFile) {
        try {
          const uploaded = await subirImagenEmpresa('firma', firmaFile);
          extra.firma_url = typeof uploaded === 'string' ? uploaded : uploaded?.url;
          if (uploaded?.path) extra.firma_path = uploaded.path;
        } catch (_) { addNotificacion('No se pudo subir la firma; verifique el bucket en Supabase.'); }
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
    } catch (err) {
      console.error('[Parametros.handleSave]', err);
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

  const inp = (field) => ({ className:'input', value: datos[field], onChange: e => setDatos(p=>({...p,[field]:e.target.value})) });
  const pinp = (field) => ({ className:'input', value: parametros[field], onChange: e => setParametros(p=>({...p,[field]:e.target.value})) });
  const condicionesPagoDefectoOptions = ['contado', 'anticipado', '15 días', '30 días', '45 días', '60 días', '90 días'];
  const monedasActivas = monedasImpuestosUnidades
    .filter(m => m.tipo === 'moneda' && m.estado === 'activo' && m.codigo)
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  const paramsSections = [
    { key: 'identidad', title: 'Identidad', description: 'Datos legales, marca, firma y colores que viajan a tus PDFs.' },
    ...(puedeAdministrarSociedades
      ? [{ key: 'sociedades', title: 'Sociedades', description: 'Identidad legal, estado y configuracion de nomina por sociedad.' }]
      : []),
    { key: 'comercial', title: 'Condiciones', description: 'Textos base que se precargan en cada cotizacion comercial.' },
    { key: 'biblioteca', title: 'Biblioteca', description: 'Variables del sistema y frases reutilizables para tus documentos.' },
    { key: 'documentos', title: 'Documentos', description: 'Series, moneda, impuestos y plantillas fiscales o comerciales.' },
    { key: 'flujos', title: 'Flujos', description: 'Estados por documento, transiciones y reglas de alerta para cada modulo.' },
    { key: 'sla', title: 'SLA', description: 'Plantillas de respuesta y resolucion para contratos de servicio.' },
    { key: 'cuentas', title: 'Cuentas', description: 'Cuentas bancarias, bancos y saldos base para tesoreria y pagos.' },
    { key: 'whatsapp', title: 'WhatsApp', description: 'Proveedor, plantillas, matriz de destinatarios y log de envios.' },
    { key: 'tipo_cambio', title: 'Tipos de Cambio', description: 'Historial diario de tipos de cambio. Fuente: open.er-api.com con ingreso manual como respaldo.' },
    { key: 'nomina', title: 'Nomina', description: 'Regimen laboral, frecuencia de pago, quincenas y valores fiscales vigentes.' },
    { key: 'evaluaciones', title: 'Evaluaciones', description: 'Ponderaciones, escala y labels para evaluaciones de desempeno.' },
    { key: 'egresos_config', title: 'Egresos', description: 'Tipos de gasto, estructura del ER y categorías personalizadas. Importa desde Excel para configurar todo de una vez.' },
  ];
  const activeParamSection = paramsSections.find(s => s.key === paramSection) || paramsSections[0];

  return (
    <div className="params-page" data-section={paramSection}>
      <div className="page-header params-hero">
        <div>
          <div className="eyebrow">Configuracion</div>
          <h1 className="page-title">Parametros Generales</h1>
          <div className="page-sub">Identidad, documentos, condiciones comerciales y reglas operativas del tenant</div>
        </div>
      </div>

      <div className="params-stepper" role="tablist" aria-label="Secciones de parametros">
        {paramsSections.map((section) => (
          <button
            type="button"
            key={section.key}
            className={`params-step ${paramSection === section.key ? 'active' : ''}`}
            onClick={() => setParamSection(section.key)}
          >
            {section.title}
          </button>
        ))}
      </div>

      <div className="params-workspace">
        <div className="params-section-stack">
          <div className="params-section-note">
            <strong>{activeParamSection.title}</strong>
            <span>{activeParamSection.description}</span>
          </div>

      {/* ── Datos de la empresa ── */}
      <div className="card params-card mb-6 params-section params-section-identidad">
        <div className="card-head"><h3>Datos de la empresa</h3><span className="badge badge-cyan">Viajan a todos los documentos</span></div>
        <div className="card-body params-identity-grid">

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
      <div className="card params-card mb-6 params-section params-section-comercial">
        <div className="card-head"><h3>Condiciones comerciales por defecto</h3><span className="badge badge-purple">Pre-cargadas en cada cotización</span></div>
        <div className="card-body params-commercial-grid">
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
              <SmartTextField
                value={conds[field]}
                onChange={value => setConds(p => ({ ...p, [field]: value }))}
                diccionario={diccionarioComercial}
                rows={2}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Secciones existentes ── */}
      <div className="params-split-grid mb-6 params-section params-section-biblioteca">
        <div className="card">
          <div className="card-head"><h3>Variables del sistema</h3><span className="badge badge-cyan">{VARIABLES_COMERCIALES.length} disponibles</span></div>
          <div className="card-body params-token-grid">
            {VARIABLES_COMERCIALES.map(v => (
              <div key={v.token} className="params-token">
                <div className="eyebrow" style={{marginBottom:3}}>{v.grupo}</div>
                <div style={{fontSize:12, fontWeight:700}}>{v.label}</div>
                <div className="mono text-muted" style={{fontSize:11, marginTop:3}}>{v.token}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Diccionario comercial</h3><span className="badge badge-purple">{diccionarioComercial.length} frases</span></div>
          <form className="card-body params-mini-form" onSubmit={guardarDicc}>
            <div className="input-group"><label>Categoria</label><ParamChipGroup value={diccForm.categoria} onChange={value=>setDiccForm(p=>({...p, categoria:value}))} options={['Comercial','Proyecto','Pagos','Facturacion','Legal']} /></div>
            <div className="input-group"><label>Estado</label><ParamChipGroup value={diccForm.estado} onChange={value=>setDiccForm(p=>({...p, estado:value}))} options={[{ value:'activo', label:'Activo' }, { value:'inactivo', label:'Inactivo' }]} /></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Clave visible</label><input className="input" value={diccForm.clave} onChange={e=>setDiccForm(p=>({...p, clave:e.target.value}))} placeholder="Primera factura"/></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Texto a insertar</label><textarea className="input" rows={2} value={diccForm.texto} onChange={e=>setDiccForm(p=>({...p, texto:e.target.value}))} placeholder="Primera factura contra entrega de avance aprobado"/></div>
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

      <div className="params-split-grid params-section params-section-documentos">
        <div className="card">
          <div className="card-head"><h3>Series documentarias</h3><span className="badge badge-cyan">{seriesDocumentarias.filter(s => s.estado === 'activo').length} activas</span></div>
          <form className="card-body" onSubmit={guardarSerie} style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div className="input-group"><label>Documento</label><input className="input" value={serieForm.documento} onChange={e=>setSerieForm(p=>({...p, documento:e.target.value}))} placeholder="Cotizaciones"/></div>
            <div className="input-group"><label>Serie</label><input className="input" value={serieForm.serie} onChange={e=>setSerieForm(p=>({...p, serie:e.target.value}))} placeholder="COT-2026"/></div>
            <div className="input-group"><label>Siguiente correlativo</label><input className="input" type="number" min="1" value={serieForm.siguiente_correlativo} onChange={e=>setSerieForm(p=>({...p, siguiente_correlativo:e.target.value}))}/></div>
            <div className="input-group"><label>Estado</label><ParamChipGroup value={serieForm.estado} onChange={value=>setSerieForm(p=>({...p, estado:value}))} options={[{ value:'activo', label:'Activo' }, { value:'inactivo', label:'Inactivo' }]} /></div>
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
            <div className="input-group" style={{gridColumn:'1/-1'}}>
              <label>Condición de pago por defecto para CxC</label>
              <select className="input" value={parametros.condicion_pago_defecto} onChange={e => setParametros(p=>({...p, condicion_pago_defecto:e.target.value}))}>
                {condicionesPagoDefectoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Zona horaria</label><input {...pinp('zona_horaria')} placeholder="America/Lima"/></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Plantilla cotizacion</label><input {...pinp('plantilla_cotizacion')} placeholder="TIDEO propuesta tecnica v3"/></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Plantilla factura</label><input {...pinp('plantilla_factura')} placeholder="Exportacion fiscal externa"/></div>
            <label className="params-toggle-row" style={{gridColumn:'1/-1'}}>
              <input type="checkbox" className="checkbox" checked={parametros.requiere_2fa_financiero} onChange={e=>setParametros(p=>({...p, requiere_2fa_financiero:e.target.checked}))}/>
              <span>Requiere 2FA financiero</span>
            </label>
            <label className="params-toggle-row" style={{gridColumn:'1/-1'}}>
              <input type="checkbox" className="checkbox" checked={parametros.agente_retencion} onChange={e=>setParametros(p=>({...p, agente_retencion:e.target.checked}))}/>
              <span>La empresa es Agente de Retención ante SUNAT</span>
              <span className="text-muted" style={{fontSize:11, marginLeft:8}}>(Aplica retención del 8% en recibos por honorarios &gt; S/ 1,500)</span>
            </label>
          </div>
        </div>
      </div>
      <div className="params-section params-section-flujos">
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
      </div>
      <div className="params-section params-section-sla">
        <div className="card">
          <div className="card-head"><h3>Plantillas de SLA (Para Contratos)</h3><span className="badge badge-orange">{slaPlantillas.length} plantillas</span></div>
          <form className="card-body" onSubmit={guardarSla} style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>Nombre</label><input className="input" value={slaForm.nombre} onChange={e=>setSlaForm(p=>({...p, nombre:e.target.value}))} placeholder="Correctivo Critico"/></div>
            <div className="input-group"><label>Respuesta (horas)</label><input className="input" type="number" min="0" step="0.5" value={slaForm.tiempo_respuesta_horas} onChange={e=>setSlaForm(p=>({...p, tiempo_respuesta_horas:e.target.value}))}/></div>
            <div className="input-group"><label>Resolucion (horas)</label><input className="input" type="number" min="0" step="0.5" value={slaForm.tiempo_resolucion_horas} onChange={e=>setSlaForm(p=>({...p, tiempo_resolucion_horas:e.target.value}))}/></div>
            <div className="input-group"><label>Semaforo</label><input className="input" value={slaForm.semaforo_regla} onChange={e=>setSlaForm(p=>({...p, semaforo_regla:e.target.value}))} placeholder="Rojo a 80%"/></div>
            <div className="input-group"><label>Estado</label><ParamChipGroup value={slaForm.estado} onChange={value=>setSlaForm(p=>({...p, estado:value}))} options={[{ value:'activo', label:'Activo' }, { value:'inactivo', label:'Inactivo' }]} /></div>
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
      <div className="params-section params-section-cuentas">
        <CuentasBancariasSection />
      </div>

      <div className="params-section params-section-whatsapp">
        {(() => {
          const plantillasUi = WHATSAPP_TEMPLATES_DEFAULT.map(base => ({
            ...base,
            ...(whatsappPlantillas.find(item => item.tipo_alerta === base.tipo_alerta) || {}),
          }));
          const rutasUi = WHATSAPP_RUTAS_DEFAULT.map(base => ({
            ...base,
            ...(whatsappMatriz.find(item => item.tipo_alerta === base.tipo_alerta) || {}),
          }));
          const labelTipo = tipo => WHATSAPP_TIPOS_ALERTA.find(([key]) => key === tipo)?.[1] || tipo;
          return (
            <>
              <div className="card params-card mb-6">
                <div className="card-head">
                  <div>
                    <h3>WhatsApp Business</h3>
                    <div className="text-muted" style={{ fontSize: 12 }}>Proveedor agnostico. El token real se lee desde secrets de Edge Function.</div>
                  </div>
                  <span className="badge badge-cyan">{whatsappProviderStatus(whatsappCfg)}</span>
                </div>
                <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <label className="params-toggle-row" style={{ gridColumn: '1 / -1' }}>
                    <input type="checkbox" className="checkbox" checked={Boolean(whatsappCfg.whatsapp_habilitado)} onChange={e => setWhatsappCfg(v => ({ ...v, whatsapp_habilitado: e.target.checked }))} />
                    <span>Activar cola WhatsApp</span>
                  </label>
                  <label>
                    <span className="label">Proveedor</span>
                    <select className="input" value={whatsappCfg.whatsapp_provider || 'simulado'} onChange={e => setWhatsappCfg(v => ({ ...v, whatsapp_provider: e.target.value }))}>
                      <option value="simulado">Simulado</option>
                      <option value="meta">Meta Cloud API</option>
                      <option value="generic">HTTP generico</option>
                    </select>
                  </label>
                  <label>
                    <span className="label">Endpoint proveedor</span>
                    <input className="input" value={whatsappCfg.whatsapp_base_url || ''} onChange={e => setWhatsappCfg(v => ({ ...v, whatsapp_base_url: e.target.value }))} placeholder="https://graph.facebook.com/v20.0/..." />
                  </label>
                  <label>
                    <span className="label">Phone number ID</span>
                    <input className="input" value={whatsappCfg.whatsapp_phone_number_id || ''} onChange={e => setWhatsappCfg(v => ({ ...v, whatsapp_phone_number_id: e.target.value }))} placeholder="ID de WhatsApp Business" />
                  </label>
                  <label>
                    <span className="label">Secret token</span>
                    <input className="input" value={whatsappCfg.whatsapp_api_key_ref || ''} onChange={e => setWhatsappCfg(v => ({ ...v, whatsapp_api_key_ref: e.target.value }))} placeholder="WHATSAPP_ACCESS_TOKEN" />
                  </label>
                  <label>
                    <span className="label">Reintentos maximos</span>
                    <input className="input" type="number" min="0" max="10" value={whatsappCfg.whatsapp_reintentos_max ?? 3} onChange={e => setWhatsappCfg(v => ({ ...v, whatsapp_reintentos_max: Number(e.target.value || 0) }))} />
                  </label>
                  <label className="params-toggle-row">
                    <input type="checkbox" className="checkbox" checked={Boolean(whatsappCfg.whatsapp_internos_consentimiento_implicito)} onChange={e => setWhatsappCfg(v => ({ ...v, whatsapp_internos_consentimiento_implicito: e.target.checked }))} />
                    <span>Consentimiento implicito para internos</span>
                  </label>
                  <div className="row" style={{ gridColumn: '1 / -1', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={sembrarWhatsappDefaults}>Inicializar plantillas</button>
                    <button className="btn btn-secondary" onClick={simularWhatsapp}>Simular envio</button>
                    <button className="btn btn-primary" onClick={guardarWhatsappCfg} disabled={savingWhatsapp}>{savingWhatsapp ? 'Guardando...' : 'Guardar WhatsApp'}</button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                <div className="card params-card">
                  <div className="card-head"><h3>Plantillas por alerta</h3><span className="badge badge-gray">{plantillasUi.length}</span></div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Alerta</th><th>Template</th><th>Texto</th><th>Estado</th></tr></thead>
                      <tbody>{plantillasUi.map(tpl => (
                        <tr key={tpl.tipo_alerta}>
                          <td><strong>{labelTipo(tpl.tipo_alerta)}</strong></td>
                          <td>{tpl.proveedor_template}</td>
                          <td className="truncate" title={tpl.texto_sugerido}>{tpl.texto_sugerido}</td>
                          <td><span className={'badge ' + (tpl.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{tpl.estado}</span></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>

                <div className="card params-card">
                  <div className="card-head"><h3>Matriz de destinatarios</h3><span className="badge badge-gray">{rutasUi.length}</span></div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Alerta</th><th>Colab.</th><th>Jefe</th><th>RRHH</th><th>Admin</th><th>Opt-in</th></tr></thead>
                      <tbody>{rutasUi.map(ruta => (
                        <tr key={ruta.tipo_alerta}>
                          <td><strong>{labelTipo(ruta.tipo_alerta)}</strong></td>
                          {['enviar_colaborador', 'enviar_jefe_area', 'enviar_rrhh', 'enviar_admin', 'requiere_opt_in_colaborador'].map(field => (
                            <td key={field}><input type="checkbox" className="checkbox" checked={Boolean(ruta[field])} onChange={() => toggleWhatsappRuta(ruta, field)} /></td>
                          ))}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="card params-card mt-6">
                <div className="card-head"><h3>Bitacora de envios</h3><span className="badge badge-gray">{whatsappEnvios.length}</span></div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Destinatario</th><th>Telefono</th><th>Estado</th></tr></thead>
                    <tbody>
                      {whatsappEnvios.slice(0, 12).map(envio => (
                        <tr key={envio.id}>
                          <td>{envio.created_at ? new Date(envio.created_at).toLocaleString('es-PE') : '-'}</td>
                          <td>{labelTipo(envio.tipo_alerta)}</td>
                          <td>{envio.destinatario_tipo}</td>
                          <td>{envio.telefono || '-'}</td>
                          <td><span className="badge badge-cyan">{envio.estado}</span></td>
                        </tr>
                      ))}
                      {!whatsappEnvios.length && <tr><td colSpan="5" className="text-muted">Sin envios registrados.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Tipos de Cambio ── */}
      <div className="params-section params-section-tipo_cambio">
        {(() => {
          const tcUSD = tcHoy?.usd ? Math.round(1 / tcHoy.usd * 10000) / 10000 : null;
          const tcEUR = tcHoy?.eur ? Math.round(1 / tcHoy.eur * 10000) / 10000 : null;
          const creado = tcHoy?.creado_en ? new Date(tcHoy.creado_en) : null;
          const esDesactualizado = creado ? (Date.now() - creado.getTime()) > 12 * 3600 * 1000 : false;
          const horaStr = creado ? creado.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : null;
          return (
            <>
              {/* Bloque 1 — TC del día */}
              <div className="card params-card mb-6">
                <div className="card-head">
                  <h3>TC del día</h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {esDesactualizado && <span className="badge badge-orange">Desactualizado</span>}
                    <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={handleActualizarTC} disabled={actualizando}>
                      {actualizando ? 'Actualizando...' : '↻ Actualizar ahora'}
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  {tcHoy ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                      <div style={{ background: 'var(--bg-subtle)', borderRadius: 10, padding: '16px 20px' }}>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>Fecha</div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{tcHoy.fecha}</div>
                        {horaStr && <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>Actualizado {horaStr}</div>}
                      </div>
                      <div style={{ background: 'var(--bg-subtle)', borderRadius: 10, padding: '16px 20px' }}>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>Dólar americano</div>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>S/ {tcUSD?.toFixed(4) ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>por 1 USD</div>
                      </div>
                      <div style={{ background: 'var(--bg-subtle)', borderRadius: 10, padding: '16px 20px' }}>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>Euro</div>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>S/ {tcEUR?.toFixed(4) ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>por 1 EUR</div>
                      </div>
                      <div style={{ background: 'var(--bg-subtle)', borderRadius: 10, padding: '16px 20px' }}>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>Fuente</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{tcHoy.fuente || '—'}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
                      {loadingHistorial ? 'Cargando...' : 'Sin datos de tipo de cambio. Haz clic en "Actualizar ahora".'}
                    </div>
                  )}
                </div>
              </div>

              {/* Bloque 2 — Historial */}
              <div className="card params-card mb-6">
                <div className="card-head"><h3>Historial de tipos de cambio</h3><span className="badge badge-gray" style={{ fontSize: 11 }}>Últimos 30 registros</span></div>
                <div className="card-body" style={{ padding: 0 }}>
                  {loadingHistorial ? (
                    <div style={{ padding: 20, color: 'var(--fg-muted)', fontSize: 13 }}>Cargando historial...</div>
                  ) : historialTC.length === 0 ? (
                    <div style={{ padding: 20, color: 'var(--fg-muted)', fontSize: 13 }}>Sin registros históricos.</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th style={{ textAlign: 'right' }}>USD (S/ por 1 USD)</th>
                            <th style={{ textAlign: 'right' }}>EUR (S/ por 1 EUR)</th>
                            <th>Fuente</th>
                            <th>Registrado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialTC.map(r => {
                            const rUSD = r.usd ? Math.round(1 / r.usd * 10000) / 10000 : null;
                            const rEUR = r.eur ? Math.round(1 / r.eur * 10000) / 10000 : null;
                            const rHora = r.creado_en ? new Date(r.creado_en).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                            return (
                              <tr key={r.id}>
                                <td style={{ fontWeight: 600 }}>{r.fecha}</td>
                                <td style={{ textAlign: 'right' }}>{rUSD != null ? `S/ ${rUSD.toFixed(4)}` : '—'}</td>
                                <td style={{ textAlign: 'right' }}>{rEUR != null ? `S/ ${rEUR.toFixed(4)}` : '—'}</td>
                                <td style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{r.fuente || '—'}</td>
                                <td style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{rHora}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Bloque 3 — Ingreso manual */}
              <div className="card params-card">
                <div className="card-head"><h3>Ingreso manual de TC</h3></div>
                <div className="card-body">
                  <form onSubmit={handleGuardarManual} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, alignItems: 'end' }}>
                    <div className="input-group" style={{ margin: 0 }}>
                      <label>Fecha</label>
                      <input className="input" type="date" value={tcManual.fecha} onChange={e => setTcManual(p => ({ ...p, fecha: e.target.value }))} />
                    </div>
                    <div className="input-group" style={{ margin: 0 }}>
                      <label>USD (S/ por 1 USD)</label>
                      <input className="input" type="number" step="0.0001" min="0.01" placeholder="ej: 3.4200" value={tcManual.usd} onChange={e => setTcManual(p => ({ ...p, usd: e.target.value }))} />
                    </div>
                    <div className="input-group" style={{ margin: 0 }}>
                      <label>EUR (S/ por 1 EUR)</label>
                      <input className="input" type="number" step="0.0001" min="0.01" placeholder="ej: 3.7500" value={tcManual.eur} onChange={e => setTcManual(p => ({ ...p, eur: e.target.value }))} />
                    </div>
                    <div className="input-group" style={{ margin: 0 }}>
                      <label>Fuente</label>
                      <input className="input" placeholder="manual" value={tcManual.fuente} onChange={e => setTcManual(p => ({ ...p, fuente: e.target.value }))} />
                    </div>
                    <div>
                      <button type="submit" className="btn btn-primary" disabled={savingManual} style={{ width: '100%' }}>
                        {savingManual ? 'Guardando...' : 'Guardar TC'}
                      </button>
                    </div>
                  </form>
                  {savedMsg && <div className="badge badge-green" style={{ marginTop: 12 }}>{savedMsg}</div>}
                  <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 10 }}>
                    Los valores ingresados se convierten automáticamente al formato interno (1/valor) para mantener consistencia con los registros de la API.
                  </p>
                </div>
              </div>
            </>
          );
        })()}
      </div>

          {/* ── Configuración de Nómina ── */}
          {paramSection === 'nomina' && (() => {
            const regimenes = [
              { key: 'general', label: 'Régimen General', desc: 'Legislación laboral estándar — Ley 728.' },
              { key: 'pequena_empresa', label: 'Pequeña Empresa (MYPE)', desc: '10 a 100 trabajadores — Ley 28015.' },
              { key: 'microempresa', label: 'Microempresa (MYPE)', desc: 'Hasta 10 trabajadores — Ley 28015.' },
            ];
            const pct2 = 100 - Number(nominaCfg.pct_quincena_1);
            const mesNombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            const mesActual = mesNombres[new Date().getMonth()];
            const tasasAfp = latestAfpParametros(afpParametros || []);
            return (<div className="params-section params-section-nomina" style={{overflowY:'auto', paddingBottom:24}}>
              {/* Bloque 1 — Régimen laboral */}
              <div className="card params-card mb-6">
                <div className="card-head"><h3>Régimen laboral de la empresa</h3></div>
                <div className="card-body">
                  <div className="text-muted" style={{fontSize:12, marginBottom:12}}>Selecciona el régimen que gobierna los beneficios laborales futuros de nómina.</div>
                  <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:20}}>
                    {regimenes.map(r => (
                      <button key={r.key} type="button" data-local-form="true"
                        className={`btn ${nominaCfg.regimen_laboral_empresa === r.key ? 'btn-primary' : 'btn-secondary'}`}
                        style={{flex:1, minWidth:180, flexDirection:'column', alignItems:'flex-start', padding:'14px 18px', height:'auto', textAlign:'left'}}
                        onClick={() => confirmarCambioRegimen(r.key)}>
                        <span style={{fontWeight:700, fontSize:14}}>{r.label}</span>
                        <span style={{fontSize:11, fontWeight:400, marginTop:4, opacity:0.75}}>{r.desc}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{overflowX:'auto', marginTop:8}}>
                    <table className="tbl" style={{fontSize:12}}>
                      <thead><tr><th>Beneficio</th><th>Microempresa<br/><span style={{fontWeight:400,opacity:0.65}}>Hasta 10 trab. — Ley 28015</span></th><th>Pequeña empresa<br/><span style={{fontWeight:400,opacity:0.65}}>10–100 trab. — Ley 28015</span></th><th>Régimen general<br/><span style={{fontWeight:400,opacity:0.65}}>D.Leg. 728</span></th></tr></thead>
                      <tbody>
                        <tr><td><strong>CTS</strong></td><td><span className="badge badge-red">✗ No aplica</span></td><td><span style={{color:'var(--success)'}}>✓</span> 1 rem/año</td><td><span style={{color:'var(--success)'}}>✓</span> 1 rem/año</td></tr>
                        <tr><td><strong>Gratificación</strong></td><td><span className="badge badge-red">✗ No aplica</span></td><td><span style={{color:'var(--success)'}}>✓</span> ½ sueldo (jul/dic)</td><td><span style={{color:'var(--success)'}}>✓</span> 1 sueldo (jul/dic)</td></tr>
                        <tr><td><strong>Bonificación extraordinaria 9%</strong></td><td><span className="badge badge-red">✗ No aplica</span></td><td><span style={{color:'var(--success)'}}>✓</span> 9% s/ ½ gratif.</td><td><span style={{color:'var(--success)'}}>✓</span> 9% s/ gratif. completa</td></tr>
                        <tr><td><strong>Vacaciones</strong></td><td>15 días/año</td><td>15 días/año</td><td>30 días/año</td></tr>
                        <tr><td><strong>ESSALUD empleador</strong></td><td>SIS (S/ 15 fijo)</td><td>9%</td><td>9%</td></tr>
                        <tr><td><strong>Indemnización por despido</strong></td><td>10 jornadas/año<br/><span style={{opacity:0.65}}>tope 90 días</span></td><td>20 jornadas/año<br/><span style={{opacity:0.65}}>tope 120 días</span></td><td>1.5 rem/año<br/><span style={{opacity:0.65}}>tope 12 rem</span></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Bloque 2 — Frecuencia de pago */}
              <div className="card params-card mb-6">
                <div className="card-head"><h3>Frecuencia de pago</h3></div>
                <div className="card-body">
                  <div style={{display:'flex', gap:8, marginBottom:20}}>
                    {['mensual','quincenal'].map(f => (
                      <button key={f} type="button" data-local-form="true"
                        className={`btn ${nominaCfg.frecuencia_pago === f ? 'btn-primary' : 'btn-secondary'}`}
                        style={{width:140}}
                        onClick={() => setNominaCfg(p=>({...p, frecuencia_pago:f}))}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                  {nominaCfg.frecuencia_pago === 'mensual' ? (
                    <div>
                      <div className="grid-2" style={{gap:14, maxWidth:400}}>
                        <div className="input-group"><label>Día de corte</label><input className="input" type="number" min="1" max="31" value={nominaCfg.dia_corte_mensual} onChange={e=>setNominaCfg(p=>({...p,dia_corte_mensual:Number(e.target.value)}))}/></div>
                        <div className="input-group"><label>Día de pago</label><input className="input" type="number" min="1" max="31" value={nominaCfg.dia_pago_mensual} onChange={e=>setNominaCfg(p=>({...p,dia_pago_mensual:Number(e.target.value)}))}/></div>
                      </div>
                      <div className="card" style={{padding:'10px 14px', marginTop:12, background:'var(--bg-subtle)', fontSize:13}}>
                        El período de <strong>{mesActual} {new Date().getFullYear()}</strong> se cortará el día <strong>{nominaCfg.dia_corte_mensual}</strong> y se pagará el día <strong>{nominaCfg.dia_pago_mensual}</strong>.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, maxWidth:500, marginBottom:12}}>
                        <div className="input-group"><label>1ra quincena — día de corte</label><input className="input" type="number" min="1" max="20" value={nominaCfg.dia_corte_q1} onChange={e=>setNominaCfg(p=>({...p,dia_corte_q1:Number(e.target.value)}))}/></div>
                        <div className="input-group"><label>1ra quincena — día de pago</label><input className="input" type="number" min="1" max="20" value={nominaCfg.dia_pago_q1} onChange={e=>setNominaCfg(p=>({...p,dia_pago_q1:Number(e.target.value)}))}/></div>
                        <div className="input-group"><label>2da quincena — día de corte</label><input className="input" type="number" min="15" max="31" value={nominaCfg.dia_corte_q2} onChange={e=>setNominaCfg(p=>({...p,dia_corte_q2:Number(e.target.value)}))}/></div>
                        <div className="input-group"><label>2da quincena — día de pago</label><input className="input" type="number" min="15" max="31" value={nominaCfg.dia_pago_q2} onChange={e=>setNominaCfg(p=>({...p,dia_pago_q2:Number(e.target.value)}))}/></div>
                      </div>
                      <div className="input-group" style={{maxWidth:300}}>
                        <label>% del sueldo mensual en la 1ra quincena</label>
                        <input className="input" type="number" min="1" max="99" value={nominaCfg.pct_quincena_1} onChange={e=>setNominaCfg(p=>({...p,pct_quincena_1:Number(e.target.value)}))}/>
                        <div style={{marginTop:8, fontSize:13}}>
                          <span className="badge badge-cyan" style={{marginRight:6}}>1ra quincena: {nominaCfg.pct_quincena_1}%</span>
                          <span className="badge badge-purple">2da quincena: {pct2}%</span>
                        </div>
                      </div>
                      <div className="card" style={{padding:'10px 14px', marginTop:12, background:'var(--bg-subtle)', fontSize:13}}>
                        <strong>{mesActual} {new Date().getFullYear()}</strong> — 1ra quincena: corte día {nominaCfg.dia_corte_q1}, pago día {nominaCfg.dia_pago_q1} ({nominaCfg.pct_quincena_1}% del sueldo). 2da quincena: corte día {nominaCfg.dia_corte_q2}, pago día {nominaCfg.dia_pago_q2} ({pct2}% + horas extra y variables del mes).
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bloque 3 — Valores fiscales */}
              <div className="card params-card mb-6">
                <div className="card-head"><h3>Valores fiscales vigentes</h3><span className="badge badge-orange">Actualizar al inicio de cada año fiscal</span></div>
                <div className="card-body">
                  <div className="grid-2" style={{gap:14, maxWidth:520}}>
                    <div className="input-group"><label>UIT vigente (S/)</label><input className="input" type="number" min="0" step="50" value={nominaCfg.uit_vigente} onChange={e=>setNominaCfg(p=>({...p,uit_vigente:Number(e.target.value)}))}/></div>
                    <div className="input-group"><label>RMV vigente (S/)</label><input className="input" type="number" min="0" step="10" value={nominaCfg.rmv_vigente} onChange={e=>setNominaCfg(p=>({...p,rmv_vigente:Number(e.target.value)}))}/></div>
                    <div className="input-group"><label>RAM tope AFP (S/)</label><input className="input" type="number" min="0" step="0.01" value={nominaCfg.ram_tope_afp} onChange={e=>setNominaCfg(p=>({...p,ram_tope_afp:Number(e.target.value)}))}/></div>
                  </div>
                  <p className="text-muted" style={{fontSize:12, marginTop:8}}>Actualizar según publicación oficial del MEF y SBS al inicio de cada año fiscal.</p>
                </div>
              </div>

              <div className="card params-card mb-6">
                <div className="card-head"><h3>Prima de seguro AFP por administradora</h3><span className="badge badge-cyan">SBS</span></div>
                <div className="card-body">
                  <div className="alert alert-info" style={{marginBottom:14}}>Actualizar al inicio de cada año fiscal según publicación de la SBS.</div>
                  <div className="table-wrap">
                    <table className="tbl" style={{fontSize:12}}>
                      <thead><tr><th>AFP</th><th>Prima de seguro vigente (%)</th><th>Comisión Flujo (%)</th><th>Comisión Mixta Saldo (%)</th><th>Vigente desde</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
                      <tbody>{tasasAfp.map(row => {
                        const editing = afpEdit?.afp_nombre === row.afp_nombre;
                        return (
                          <tr key={row.afp_nombre}>
                            <td><strong>{row.afp_nombre}</strong></td>
                            <td>{editing ? <input className="input" type="number" min="0" step="0.01" value={afpEdit.pct_prima_seguro} onChange={e=>setAfpEdit(p=>({...p,pct_prima_seguro:e.target.value}))}/> : `${Number(row.pct_prima_seguro ?? AFP_PRIMA_SEGURO_FALLBACK).toFixed(2)}%`}</td>
                            <td>{editing ? <input className="input" type="number" min="0" step="0.01" value={afpEdit.pct_comision_flujo} onChange={e=>setAfpEdit(p=>({...p,pct_comision_flujo:e.target.value}))}/> : `${Number(row.pct_comision_flujo ?? 0).toFixed(2)}%`}</td>
                            <td>{editing ? <input className="input" type="number" min="0" step="0.01" value={afpEdit.pct_comision_mixta_saldo} onChange={e=>setAfpEdit(p=>({...p,pct_comision_mixta_saldo:e.target.value}))}/> : `${Number(row.pct_comision_mixta_saldo ?? 0).toFixed(2)}%`}</td>
                            <td>{editing ? <input className="input" type="date" value={afpEdit.vigente_desde} onChange={e=>setAfpEdit(p=>({...p,vigente_desde:e.target.value}))}/> : (row.vigente_desde || '2026-01-01')}</td>
                            <td style={{textAlign:'right'}}>
                              {editing ? (
                                <div className="row" style={{justifyContent:'flex-end', gap:6}}>
                                  <button className="btn btn-secondary btn-sm" type="button" data-local-form="true" onClick={()=>setAfpEdit(null)}>Cancelar</button>
                                  <button className="btn btn-primary btn-sm" type="button" data-local-form="true" disabled={afpSaving} onClick={guardarTasaAfp}>{afpSaving ? 'Guardando...' : 'Guardar'}</button>
                                </div>
                              ) : (
                                <button className="icon-btn" type="button" title="Editar tasa AFP" style={{color:'var(--cyan)'}} onClick={()=>abrirEditarAfp(row)}>{I.edit}</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="params-footer-actions">
                <button className="btn btn-primary" onClick={guardarNominaCfg} disabled={savingNomina} data-local-form="true">
                  {I.save} {savingNomina ? 'Guardando...' : 'Guardar configuración de nómina'}
                </button>
              </div>

              {/* Modal confirmación cambio régimen */}
              {showRegimenModal && <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowRegimenModal(false)}}><div className="modal"><div className="modal-head"><h3>Confirmar cambio de régimen laboral</h3><button className="icon-btn" style={{color:'var(--fg-muted)'}} onClick={()=>setShowRegimenModal(false)}>{I.x}</button></div><div className="modal-body"><div className="alert alert-warning" style={{marginBottom:16}}>Cambiar el régimen laboral afecta el cálculo de todos los períodos futuros. Los períodos ya cerrados no se recalculan.</div><p>¿Confirmar el cambio a <strong>{regimenes.find(r=>r.key===pendingRegimen)?.label}</strong>?</p><label style={{display:'flex', alignItems:'center', gap:8, margin:'12px 0', fontSize:13, cursor:'pointer'}}><input type="checkbox" checked={regimenConfirmCheck} onChange={e=>setRegimenConfirmCheck(e.target.checked)}/> Entiendo que este cambio aplica solo a períodos futuros y no recalcula nóminas cerradas.</label><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setShowRegimenModal(false)}>Cancelar</button><button className="btn btn-primary" disabled={!regimenConfirmCheck} onClick={()=>{setNominaCfg(p=>({...p,regimen_laboral_empresa:pendingRegimen}));setShowRegimenModal(false);setPendingRegimen(null);}}>Confirmar cambio</button></div></div></div></div>}
            </div>);
          })()}

          {paramSection === 'evaluaciones' && (() => {
            const sumaEvaluadores = Number(evalCfg.eval_peso_autoevaluacion) + Number(evalCfg.eval_peso_jefe);
            const sumaDimensiones = Number(evalCfg.eval_peso_competencias) + Number(evalCfg.eval_peso_objetivos);
            const invalid = sumaEvaluadores !== 100 || sumaDimensiones !== 100 || Number(evalCfg.eval_escala_min) >= Number(evalCfg.eval_escala_max);
            const labels = evalCfg.eval_escala_labels || {};
            const scaleValues = [];
            for (let n = Number(evalCfg.eval_escala_min || 1); n <= Number(evalCfg.eval_escala_max || 5); n += 1) scaleValues.push(n);
            const setEvalField = (field, value) => setEvalCfg(p => ({ ...p, [field]: value }));
            const setEvalLabel = (n, value) => setEvalCfg(p => ({ ...p, eval_escala_labels: { ...(p.eval_escala_labels || {}), [n]: value } }));
            return (
              <>
                <div className="card params-card mb-6">
                  <div className="card-head"><h3>Configuracion de Evaluaciones de Desempeno</h3><span className="badge badge-cyan">360 basico</span></div>
                  <div className="card-body">
                    <div className="grid-2" style={{gap:16}}>
                      <div className="card" style={{padding:16}}>
                        <div className="eyebrow">Autoevaluacion vs jefe</div>
                        <div className="grid-2" style={{gap:12, marginTop:12}}>
                          <div className="input-group"><label>Autoevaluacion (%)</label><input className="input" type="number" min="0" max="100" value={evalCfg.eval_peso_autoevaluacion} onChange={e=>setEvalField('eval_peso_autoevaluacion', Number(e.target.value))}/></div>
                          <div className="input-group"><label>Jefe (%)</label><input className="input" type="number" min="0" max="100" value={evalCfg.eval_peso_jefe} onChange={e=>setEvalField('eval_peso_jefe', Number(e.target.value))}/></div>
                        </div>
                        {sumaEvaluadores !== 100 && <div className="alert alert-danger" style={{marginTop:10}}>La ponderacion autoevaluacion + jefe debe sumar 100. Suma actual: {sumaEvaluadores}%.</div>}
                      </div>
                      <div className="card" style={{padding:16}}>
                        <div className="eyebrow">Competencias vs objetivos</div>
                        <div className="grid-2" style={{gap:12, marginTop:12}}>
                          <div className="input-group"><label>Competencias (%)</label><input className="input" type="number" min="0" max="100" value={evalCfg.eval_peso_competencias} onChange={e=>setEvalField('eval_peso_competencias', Number(e.target.value))}/></div>
                          <div className="input-group"><label>Objetivos (%)</label><input className="input" type="number" min="0" max="100" value={evalCfg.eval_peso_objetivos} onChange={e=>setEvalField('eval_peso_objetivos', Number(e.target.value))}/></div>
                        </div>
                        {sumaDimensiones !== 100 && <div className="alert alert-danger" style={{marginTop:10}}>La ponderacion competencias + objetivos debe sumar 100. Suma actual: {sumaDimensiones}%.</div>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card params-card mb-6">
                  <div className="card-head"><h3>Escala de competencias</h3><span className="badge badge-gray">{evalCfg.eval_escala_min} a {evalCfg.eval_escala_max}</span></div>
                  <div className="card-body">
                    <div className="grid-2" style={{gap:16, maxWidth:520}}>
                      <div className="input-group"><label>Minimo</label><input className="input" type="number" min="0" value={evalCfg.eval_escala_min} onChange={e=>setEvalField('eval_escala_min', Number(e.target.value))}/></div>
                      <div className="input-group"><label>Maximo</label><input className="input" type="number" min="1" value={evalCfg.eval_escala_max} onChange={e=>setEvalField('eval_escala_max', Number(e.target.value))}/></div>
                    </div>
                    {Number(evalCfg.eval_escala_min) >= Number(evalCfg.eval_escala_max) && <div className="alert alert-danger" style={{marginTop:10}}>El minimo de la escala debe ser menor que el maximo.</div>}
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12, marginTop:16}}>
                      {scaleValues.map(n => (
                        <div className="input-group" key={n}>
                          <label>{n}</label>
                          <input className="input" value={labels[n] || labels[String(n)] || ''} onChange={e=>setEvalLabel(n, e.target.value)} placeholder={`Label ${n}`}/>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="params-footer-actions">
                  <button className="btn btn-primary" onClick={guardarEvalCfg} disabled={savingEvalCfg || invalid} data-local-form="true">
                    {I.save} {savingEvalCfg ? 'Guardando...' : 'Guardar configuracion de evaluaciones'}
                  </button>
                </div>
              </>
            );
          })()}

          {paramSection === 'egresos_config' && (
            <EgresosConfigAdmin />
          )}

          {paramSection === 'sociedades' && puedeAdministrarSociedades && (
            <SociedadesAdmin />
          )}

          {paramSection !== 'tipo_cambio' && paramSection !== 'nomina' && paramSection !== 'evaluaciones' && paramSection !== 'cuentas' && paramSection !== 'egresos_config' && paramSection !== 'sociedades' && (
          <div className="params-footer-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {I.save} {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ============================================================
// RRHH ADMINISTRATIVO — Fase 3
// ============================================================

const BANCOS_PERU_ADMIN = ['BCP','BBVA','Interbank','Scotiabank','BanBif','Banco de la Nación','Mibanco','Caja Cusco','Caja Piura','Caja Arequipa','Caja Huancayo','Caja Sullana','Otro'];

function DatosBancariosAdmin({ cuentas = [], onChange, readOnly = false }) {
  const [showForm, setShowForm] = React.useState(false);
  const [editId, setEditId] = React.useState(null);
  const [form, setForm] = React.useState({ banco:'BCP', numero_cuenta:'', cci:'', tipo_cuenta:'Ahorros', moneda:'Soles', es_principal:false });
  const [cciError, setCciError] = React.useState('');

  const resetForm = () => { setForm({ banco:'BCP', numero_cuenta:'', cci:'', tipo_cuenta:'Ahorros', moneda:'Soles', es_principal:false }); setCciError(''); setEditId(null); setShowForm(false); };

  const guardar = () => {
    if (!/^\d{20}$/.test(form.cci)) { setCciError('El CCI debe tener exactamente 20 dígitos numéricos.'); return; }
    setCciError('');
    const newId = editId || (globalThis.crypto?.randomUUID?.() || `bk_${Date.now()}`);
    let nuevas = editId ? cuentas.map(c => c.id === editId ? { ...form, id: editId } : c) : [...cuentas, { ...form, id: newId }];
    if (form.es_principal) nuevas = nuevas.map(c => ({ ...c, es_principal: c.id === newId || c.id === editId }));
    onChange(nuevas);
    resetForm();
  };

  const abrirEditar = (c) => { setForm({ banco:c.banco, numero_cuenta:c.numero_cuenta, cci:c.cci, tipo_cuenta:c.tipo_cuenta, moneda:c.moneda, es_principal:c.es_principal }); setEditId(c.id); setShowForm(true); };

  return (
    <div>
      <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos bancarios</div>
      {cuentas.length === 0 && <div style={{color:'var(--fg-muted)', fontSize:13, marginBottom:12}}>Sin cuentas bancarias registradas.</div>}
      {cuentas.map(c => (
        <div key={c.id} className="card" style={{padding:'10px 14px', marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10}}>
          <div>
            <div style={{fontWeight:600, fontSize:13}}>{c.banco} — •••• {String(c.numero_cuenta||'').slice(-4)}</div>
            <div className="text-muted" style={{fontSize:12}}>{c.tipo_cuenta} · {c.moneda}{c.es_principal && <span className="badge badge-green" style={{marginLeft:6, fontSize:10}}>Principal</span>}</div>
          </div>
          {!readOnly && <div style={{display:'flex', gap:4}}><button type="button" className="icon-btn" onClick={() => abrirEditar(c)}>{I.edit}</button><button type="button" className="icon-btn" style={{color:'var(--danger)'}} onClick={() => onChange(cuentas.filter(x => x.id !== c.id))}>{I.trash}</button></div>}
        </div>
      ))}
      {!readOnly && !showForm && <button type="button" className="btn btn-secondary btn-sm" style={{marginTop:4}} onClick={() => setShowForm(true)}>{I.plus} Agregar cuenta</button>}
      {!readOnly && showForm && (
        <div className="card" style={{padding:16, marginTop:8, border:'1px solid var(--border)'}}>
          <div className="grid-2" style={{gap:12}}>
            <div className="input-group"><label>Banco</label><select className="select" value={form.banco} onChange={e=>setForm(v=>({...v,banco:e.target.value}))}>{BANCOS_PERU_ADMIN.map(b=><option key={b}>{b}</option>)}</select></div>
            <div className="input-group"><label>Número de cuenta</label><input className="input" value={form.numero_cuenta} onChange={e=>setForm(v=>({...v,numero_cuenta:e.target.value}))} placeholder="Número de cuenta"/></div>
            <div className="input-group" style={{gridColumn:'1/-1'}}><label>CCI <span className="text-muted">(20 dígitos)</span></label><input className="input" value={form.cci} maxLength={20} onChange={e=>setForm(v=>({...v,cci:e.target.value.replace(/\D/g,'').slice(0,20)}))} placeholder="00000000000000000000"/>{cciError && <div style={{color:'var(--danger)', fontSize:11, marginTop:4}}>{cciError}</div>}</div>
            <div className="input-group"><label>Tipo de cuenta</label><select className="select" value={form.tipo_cuenta} onChange={e=>setForm(v=>({...v,tipo_cuenta:e.target.value}))}><option>Ahorros</option><option>Corriente</option></select></div>
            <div className="input-group"><label>Moneda</label><select className="select" value={form.moneda} onChange={e=>setForm(v=>({...v,moneda:e.target.value}))}><option>Soles</option><option>Dólares</option></select></div>
            <label className="row" style={{gap:8, alignItems:'center', gridColumn:'1/-1'}}><input type="checkbox" checked={form.es_principal} onChange={e=>setForm(v=>({...v,es_principal:e.target.checked}))}/>Marcar como cuenta principal</label>
          </div>
          <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:12}}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={guardar}>{I.save} {editId ? 'Actualizar' : 'Agregar'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const rrhhAdminContratoDocTexto = (valor) => String(valor || '').trim().toLowerCase();
const rrhhAdminEsDocContrato = (doc = {}, tiposDocumento = []) => {
  if (!tiposDocumento || tiposDocumento.length === 0) {
    console.warn('rrhhAdminEsDocContrato: catálogo tiposDocumento no disponible. Fallback por texto desactivado.');
    return false;
  }
  const tipo = tiposDocumento.find(t => t.id === doc.tipo_documento_id || t.id === doc.tipo_doc);
  return rrhhAdminEsTipoContrato(tipo);
};
const rrhhAdminContratoActivoPersonal = (docs = [], personalId, tiposDocumento = []) =>
  (docs || [])
    .filter(d => d.personal_id === personalId && d.activo !== false && ['aprobado', 'validado'].includes(d.estado_validacion) && rrhhAdminEsDocContrato(d, tiposDocumento))
    .sort((a, b) => String(b.fecha_vencimiento || b.fecha_emision || b.created_at || '').localeCompare(String(a.fecha_vencimiento || a.fecha_emision || a.created_at || '')))[0] || null;
const rrhhAdminCalcVacProp = (p, solicitudes) => {
  const misSols = (solicitudes || []).filter(s => String(s.personal_id) === String(p.id));
  return computarSaldoVacaciones(p.fecha_ingreso || null, p.dias_vacaciones_total ?? 30, misSols).saldo;
};
const rrhhAdminContratoVencimientoInfo = (doc) => {
  if (!doc) return { estado: 'sin_contrato', badge: 'badge-gray', texto: 'Sin contrato digital', dias: null };
  if (!doc.fecha_vencimiento) return { estado: 'sin_vencimiento', badge: 'badge-gray', texto: 'Sin vencimiento', dias: null };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencimiento = new Date(`${doc.fecha_vencimiento}T00:00:00`);
  const dias = Math.ceil((vencimiento - hoy) / 86400000);
  if (dias < 0) return { estado: 'vencido', badge: 'badge-red', texto: `Vencido hace ${Math.abs(dias)} d`, dias };
  if (dias <= 7) return { estado: 'critico', badge: 'badge-red', texto: `Vence en ${dias} d`, dias };
  if (dias <= 14) return { estado: 'advertencia', badge: 'badge-orange', texto: `Vence en ${dias} d`, dias };
  return { estado: 'vigente', badge: 'badge-green', texto: `Vence en ${dias} d`, dias };
};
const rrhhAdminContratoTipoDocValue = (tipos = []) => {
  if (!tipos || tipos.length === 0) {
    console.warn('rrhhAdminContratoTipoDocValue: catálogo tipos no disponible. Fallback por texto desactivado.');
    return null;
  }
  const tipo = tipos.find(rrhhAdminEsTipoContrato);
  return tipo?.id || tipo?.key || null;
};
const rrhhAdminTipoDocumentoTexto = (tipo, fallback = '') => [
  tipo?.key, tipo?.codigo, tipo?.nombre, tipo?.label, tipo?.id, fallback,
].map(rrhhAdminContratoDocTexto).join(' ');
const rrhhAdminEsTipoContrato = (tipo) => {
  if (!tipo) return false;
  const descriptor = rrhhAdminTipoDocumentoTexto(tipo);
  const esAdenda = Boolean(tipo.documento_padre_tipo_id) || descriptor.includes('adenda');
  return !esAdenda && (descriptor.includes('contrato') || rrhhAdminContratoDocTexto(tipo.categoria) === 'contractual' || Boolean(tipo.captura_snapshot_laboral));
};
const rrhhAdminEsTipoAdenda = (tipo, fallback = '') =>
  Boolean(tipo?.documento_padre_tipo_id) ||
  rrhhAdminTipoDocumentoTexto(tipo, fallback).includes('adenda');
const rrhhAdminSnapshotLaboral = (p = {}, extra = {}) => {
  const tipoContratoRaw = extra.tipo_contrato ?? p.tipo_contrato ?? '';
  const esHonorarios = tipoContratoRaw === 'honorarios';
  return {
    cargo: extra.cargo ?? p.cargo ?? '',
    cargo_id: extra.cargo_id ?? p.cargo_id ?? '',
    cargo_nombre: extra.cargo_nombre ?? extra.cargo ?? p.cargo ?? '',
    remuneracion_base: extra.remuneracion_base ?? p.sueldo_base ?? p.remuneracion ?? p.monto_mensual ?? 0,
    modalidad: extra.modalidad ?? p.modalidad ?? '',
    sede: extra.sede ?? p.sede ?? '',
    sede_id: extra.sede_id ?? p.sede_id ?? '',
    sede_nombre: extra.sede_nombre ?? extra.sede ?? p.sede ?? '',
    area_id: extra.area_id ?? p.area_id ?? '',
    area_nombre: extra.area_nombre ?? p.area ?? '',
    regimen_jornada: extra.regimen_jornada ?? p.regimen_jornada ?? 'general',
    tipo_contrato: tipoContratoRaw,
    modalidad_contrato: tipoContratoRaw ? (esHonorarios ? 'honorarios' : 'planilla') : (p.modalidad_contrato ?? ''),
    descripcion_cambio: extra.descripcion_cambio ?? '',
  };
};
const rrhhAdminContratoResumen = (doc = {}, docPrevio = null, tiposDocumento = []) => {
  const c = doc.condiciones_laborales || {};
  const cambios = doc.adenda_cambios || {};
  if (rrhhAdminEsDocContrato(doc, tiposDocumento)) {
    const snapVacio = !c.cargo && !c.cargo_nombre && !c.remuneracion_base && !c.sede && !c.sede_nombre;
    if (snapVacio) return 'Condiciones no registradas — contrato previo al sistema actual';
    const partes = [
      c.cargo_nombre || c.cargo,
      c.remuneracion_base !== undefined && c.remuneracion_base !== '' ? `S/ ${Number(c.remuneracion_base).toLocaleString()}` : null,
      c.regimen_jornada ? labelOr(REGIMEN_JORNADA_LABELS, c.regimen_jornada) : null,
      c.tipo_contrato ? labelOr(TIPO_CONTRATO_LABELS, c.tipo_contrato) : null,
      c.modalidad || null,
      c.sede_nombre || c.sede || null,
      c.area_nombre || null,
    ].filter(Boolean);
    return partes.join(' · ');
  }
  if (rrhhAdminEsTipoAdenda(doc, doc.tipo_doc)) {
    const partes = [];
    const prevC = docPrevio ? (docPrevio.condiciones_laborales || {}) : null;

    const buildDiff = (label, isChanged, prevVal, newVal) => {
      if (!isChanged) return null;
      if (!newVal || newVal === '-') return null;
      if (prevC && prevVal && prevVal !== '-' && prevVal !== newVal) {
        return `${label}: ${prevVal} → ${newVal}`;
      }
      return `${label}: ${newVal}`;
    };

    if (cambios.cargo) {
      const prevVal = prevC ? (prevC.cargo_nombre || prevC.cargo || '-') : '-';
      const newVal = c.cargo_nombre || c.cargo || '-';
      partes.push(buildDiff('Cargo', true, prevVal, newVal));
    }
    if (cambios.remuneracion) {
      const prevVal = prevC && prevC.remuneracion_base ? `S/ ${Number(prevC.remuneracion_base).toLocaleString()}` : '-';
      const newVal = c.remuneracion_base ? `S/ ${Number(c.remuneracion_base).toLocaleString()}` : '-';
      partes.push(buildDiff('Sueldo', true, prevVal, newVal));
    }
    if (cambios.modalidad) {
      const prevVal = prevC && prevC.modalidad ? labelOr(MODALIDAD_TRABAJO_LABELS, prevC.modalidad) : '-';
      const newVal = c.modalidad ? labelOr(MODALIDAD_TRABAJO_LABELS, c.modalidad) : '-';
      partes.push(buildDiff('Modalidad', true, prevVal, newVal));
    }
    if (cambios.regimen_jornada) {
      const prevVal = prevC && prevC.regimen_jornada ? labelOr(REGIMEN_JORNADA_LABELS, prevC.regimen_jornada) : '-';
      const newVal = c.regimen_jornada ? labelOr(REGIMEN_JORNADA_LABELS, c.regimen_jornada) : '-';
      partes.push(buildDiff('Jornada', true, prevVal, newVal));
    }
    if (cambios.tipo_contrato) {
      const prevVal = prevC && prevC.tipo_contrato ? labelOr(TIPO_CONTRATO_LABELS, prevC.tipo_contrato) : '-';
      const newVal = c.tipo_contrato ? labelOr(TIPO_CONTRATO_LABELS, c.tipo_contrato) : '-';
      partes.push(buildDiff('Contrato', true, prevVal, newVal));
    }
    if (cambios.sede) {
      const prevVal = prevC ? (prevC.sede_nombre || prevC.sede || '-') : '-';
      const newVal = c.sede_nombre || c.sede || '-';
      partes.push(buildDiff('Sede', true, prevVal, newVal));
    }
    if (cambios.otro && c.descripcion_cambio) {
      partes.push(c.descripcion_cambio);
    }
    return partes.filter(Boolean).join(' · ') || 'Adenda contractual';
  }
  return doc.notas || 'Documento contractual';
};

function CargaMasivaAdminPanel({ onClose, turnosOptions, cargosAdminOptions, areasOptions, sedesOptions, cecosActivos, empresaConfig, crearAdminPersonalCtx, addNotificacion, personalAdmin = [] }) {
  const [step, setStep] = React.useState(1);
  const [rows, setRows] = React.useState([]);
  const [procesando, setProcesando] = React.useState(false);

  const parseXlsx = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsedRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        resolve(parsedRows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

  const normalizar = (val) => String(val || '').trim().toLowerCase();

  const validarFilas = (data) => {
    // Start from row 1, skipping the example row if its name is exactly "Juan Pérez Ejemplo" or it looks like the example
    const filteredData = data.filter((r, i) => i > 0 || (r['Nombres y apellidos'] && r['Nombres y apellidos'] !== 'Juan Pérez Ejemplo'));

    return filteredData.map((r, i) => {
      const errores = [];
      const row = { ...r, _errores: errores, _originalIndex: i + 2 };

      // Validaciones obligatorias
      if (!row['Nombres y apellidos']) errores.push('Falta Nombres y apellidos');
      
      const dni = String(row['DNI'] || '').trim();
      if (!dni || dni.length !== 8) errores.push('DNI debe tener 8 dígitos');
      
      const email = String(row['Email corporativo'] || '').trim();
      if (!email) errores.push('Falta Email corporativo');

      if (!row['Fecha de ingreso']) errores.push('Falta Fecha de ingreso');

      // Modalidad de contrato
      const modContratoStr = normalizar(row['Modalidad de contrato']);
      if (!['planilla', 'honorarios'].includes(modContratoStr)) {
        errores.push('Modalidad de contrato inválida');
      }

      // Régimen de jornada (columna opcional; vacía = 'general')
      const regimenJornadaStr = normalizar(row['Régimen de jornada']);
      if (regimenJornadaStr && regimenJornadaStr !== 'general' && regimenJornadaStr !== 'ciclo_acumulativo' && !esRegimenMinero(regimenJornadaStr)) {
        errores.push(`Régimen de jornada "${row['Régimen de jornada']}" no reconocido (valores válidos: general, ciclo_acumulativo, minero_14x7, minero_20x10, minero_28x14, minero_2x1)`);
      }

      // Honorarios RUC
      if (modContratoStr === 'honorarios') {
        const ruc = String(row['RUC colaborador'] || '').trim();
        if (!ruc || ruc.length !== 11) errores.push('RUC obligatorio para honorarios y debe tener 11 dígitos');
        if (!row['Fecha fin encargo']) errores.push('Fecha fin encargo obligatoria para honorarios');
      }

      // FKs
      const turnoStr = normalizar(row['Turno asignado']);
      const turno = turnosOptions.find(t => normalizar(t.nombre) === turnoStr);
      if (!turno && modContratoStr !== 'honorarios') errores.push(`Turno "${row['Turno asignado']}" no encontrado`);
      row._turnoId = turno?.id || '';

      const cecoStr = normalizar(row['Centro de costo (CECO)']);
      const ceco = cecosActivos.find(c => normalizar(c.nombre) === cecoStr || normalizar(c.codigo) === cecoStr);
      if (!ceco) errores.push(`CECO "${row['Centro de costo (CECO)']}" no encontrado`);
      row._cecoId = ceco?.id || '';

      const cargoStr = normalizar(row['Cargo']);
      const cargo = cargosAdminOptions.find(c => normalizar(c.nombre) === cargoStr);
      row._cargoId = cargo?.id || '';
      row._cargoStr = cargo?.nombre || row['Cargo'] || 'Por definir';

      const areaStr = normalizar(row['Área']);
      const area = areasOptions.find(a => normalizar(a) === areaStr);
      row._areaStr = area || row['Área'] || 'Sin área';

      const sedeStr = normalizar(row['Sede base']);
      const sede = sedesOptions.find(s => normalizar(s.nombre) === sedeStr);
      row._sedeStr = sede?.nombre || row['Sede base'] || '';

      return row;
    });
  };

  const handleFileUpload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const parsed = await parseXlsx(f);
      if (parsed.length === 0) {
        addNotificacion('El archivo está vacío.', 'warning');
        return;
      }
      setRows(validarFilas(parsed));
      setStep(2);
    } catch (err) {
      addNotificacion('Error leyendo archivo Excel.', 'error');
    }
  };

  const procesarCarga = async () => {
    setProcesando(true);
    const validas = rows.filter(r => r._errores.length === 0);
    let exitosos = 0;
    let siguienteNumAdm = Math.max(
      0,
      ...(personalAdmin || []).map(p => Number(String(p.codigo || '').match(/^ADM-(\d+)$/i)?.[1])).filter(n => !isNaN(n)),
      (personalAdmin || []).length
    ) + 1;

    const parseExcelDate = (val) => {
      if (!val) return null;
      if (typeof val === 'number') {
        const d = new Date((val - 25569) * 86400 * 1000);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
      }
      if (typeof val === 'string') {
        const str = val.trim();
        if (/^\d+(\.\d+)?$/.test(str) && Number(str) > 10000) {
          const d = new Date((Number(str) - 25569) * 86400 * 1000);
          if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
        const m = str.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})$/);
        if (m) {
          if (m[1].length === 4) {
            const d = new Date(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
          } else if (m[3].length === 4) {
            const d = new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
          }
        }
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
      return null;
    };
    
    for (const r of validas) {
      const dniVal = String(r['DNI']).trim();
      const existe = personalAdmin.some(p => p.dni === dniVal);
      if (existe) {
        continue;
      }
      
      const modContrato = normalizar(r['Modalidad de contrato']);
      const tipoContratoRaw = normalizar(r['Tipo de contrato']);
      const modTrabajo = normalizar(r['Modalidad de trabajo']) || 'presencial';
      
      const codigoPlantilla = String(r['Código de empleado'] || '').trim();
      const nuevo = {
        id: `per_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        codigo: codigoPlantilla || `ADM-${String(siguienteNumAdm++).padStart(3, '0')}`,
        nombre: r['Nombres y apellidos'],
        dni: String(r['DNI']).trim(),
        fecha_nacimiento: parseExcelDate(r['Fecha de nacimiento']),
        telefono: String(r['Teléfono / celular'] || '').trim(),
        email: String(r['Email corporativo'] || '').trim(),
        email_personal: String(r['Correo personal'] || '').trim() || null,
        celular_personal: String(r['Celular / WhatsApp'] || '').trim() || null,
        direccion: String(r['Dirección'] || '').trim(),
        cargo: r._cargoStr,
        cargo_id: r._cargoId || null,
        area: r._areaStr,
        sede: r._sedeStr,
        turno_id: r._turnoId,
        centro_costo_id: r._cecoId,
        modalidad_contrato: modContrato === 'honorarios' ? 'honorarios' : 'planilla',
        tipo_contrato: tipoContratoRaw === 'indefinido' ? 'Indefinido' : (tipoContratoRaw === 'por_obra' ? 'Por obra o servicio' : 'Plazo fijo'),
        remuneracion: Number(r['Sueldo base / Honorario pactado']) || 0,
        moneda: normalizar(r['Moneda']) === 'usd' ? 'USD' : 'PEN',
        metodo_pago: normalizar(r['Método de pago']) === 'por_horas' ? 'por_horas' : 'mensual',
        monto_mensual: Number(r['Sueldo base / Honorario pactado']) || 0,
        horas_base_mes: Number(r['Horas base mes']) || 0,
        tarifa_hora: 0,
        modalidad: modTrabajo === 'remoto' ? 'Remoto' : (modTrabajo === 'hibrido' ? 'Híbrido' : 'Presencial'),
        dias_vacaciones_total: 30,
        dias_vacaciones_usados: 0,
        dias_vacaciones_disponibles: 30,
        estado: 'activo',
        fecha_ingreso: parseExcelDate(r['Fecha de ingreso']),
        contacto_emergencia: '', relacion_emergencia: '', telefono_emergencia: '',
        documentos: [],
        auth_user_id: null,
        tiene_comisiones: normalizar(r['Tiene comisiones']) === 'si',
        porcentaje_comision: Number(r['Porcentaje comisión'] || 0),
        modalidad_comision: r['Modalidad comisión'] || 'Planilla',
        ruc_vendedor: null,
        retencion_ir_comision: 8,
        ruc_colaborador: modContrato === 'honorarios' ? String(r['RUC colaborador']).trim() : null,
        sistema_pensionario: modContrato === 'planilla' ? (normalizar(r['Sistema pensionario']) === 'onp' ? 'ONP' : 'AFP') : null,
        retencion_ir: modContrato === 'honorarios' ? Number(r['Retención IR'] || empresaConfig?.pct_retencion_ir_honorarios || 8) : null,
        suspension_retenciones: modContrato === 'honorarios' ? normalizar(r['Suspensión de retenciones']) === 'si' : false,
        vencimiento_suspension: modContrato === 'honorarios' && normalizar(r['Suspensión de retenciones']) === 'si' ? parseExcelDate(r['Fecha vencimiento suspensión']) : null,
        afp_nombre: modContrato === 'planilla' && normalizar(r['Sistema pensionario']) !== 'onp' ? (r['AFP nombre'] || 'Integra') : null,
        tiene_hijos: modContrato === 'planilla' ? normalizar(r['Tiene hijos']) === 'si' : false,
        cargo_confianza: modContrato === 'planilla' ? normalizar(r['Cargo de confianza']) === 'si' : false,
        cuota_prestamo_mes: modContrato === 'planilla' ? Number(r['Cuota préstamo mes'] || 0) : 0,
        descuento_judicial: modContrato === 'planilla' ? Number(r['Descuento judicial'] || 0) : 0,
        regimen_laboral: 'general',
        regimen_jornada: (() => {
          const rj = normalizar(r['Régimen de jornada']);
          return modContrato === 'planilla' && esRegimenMinero(rj) ? rj : 'general';
        })(),
        horas_diarias_pactadas: Number(r['Horas diarias pactadas'] || 8),
        fecha_inicio_ciclo: modContrato === 'planilla' && esRegimenMinero(normalizar(r['Régimen de jornada'])) ? parseExcelDate(r['Fecha inicio ciclo']) : null,
        dias_ciclo_trabajo: modContrato === 'planilla' && esRegimenMinero(normalizar(r['Régimen de jornada'])) ? Number(r['Días ciclo trabajo'] || 0) : null,
        dias_ciclo_descanso: modContrato === 'planilla' && esRegimenMinero(normalizar(r['Régimen de jornada'])) ? Number(r['Días ciclo descanso'] || 0) : null,
        bonif_altitud: Number(r['Bonificación por altitud'] || 0),
        tipo_comision_afp: normalizar(r['Tipo comisión AFP']) === 'flujo' ? 'flujo' : 'mixta',
        pct_comision_afp_flujo: Number(r['Porcentaje comisión AFP flujo'] || 0),
        tarifa_hora_referencial: modContrato === 'honorarios' ? Number(r['Tarifa hora referencial'] || 0) : null,
        datos_bancarios: [],
      };

      try {
        await crearAdminPersonalCtx(nuevo);
        exitosos++;
      } catch (err) {
        console.error('Error insertando fila', r, err);
      }
    }

    setProcesando(false);
    addNotificacion(`Carga finalizada. ${exitosos} registros creados exitosamente.`);
    onClose();
  };

  const descargarPlantilla = () => {
    const wsData = [
      [
        'Nombres y apellidos', 'DNI', 'Email corporativo', 'Teléfono / celular', 'Fecha de nacimiento',
        'Cargo', 'Área', 'Sede base', 'Centro de costo (CECO)', 'Fecha de ingreso',
        'Modalidad de contrato', 'Tipo de contrato', 'Turno asignado', 'Modalidad de trabajo', 'Régimen de jornada',
        'Fecha inicio ciclo', 'Días ciclo trabajo', 'Días ciclo descanso',
        'Horas diarias pactadas', 'Código de empleado', 'Sueldo base / Honorario pactado',
        'Sistema pensionario', 'AFP nombre', 'Tipo comisión AFP', 'Porcentaje comisión AFP flujo',
        'Tiene hijos', 'Bonificación por altitud', 'Método de pago', 'Horas base mes',
        'RUC colaborador', 'Retención IR', 'Suspensión de retenciones', 'Fecha vencimiento suspensión', 'Fecha fin encargo',
        'Correo personal', 'Celular / WhatsApp', 'Dirección', 'Moneda', 'Tiene comisiones', 'Porcentaje comisión', 'Modalidad comisión',
        'Cargo de confianza', 'Cuota préstamo mes', 'Descuento judicial'
      ],
      [
        'Juan Pérez Ejemplo', '12345678', 'juan@ejemplo.com', '987654321', '1990-01-01',
        cargosAdminOptions[0]?.nombre || 'Asistente Administrativo', areasOptions[0] || 'Administración', sedesOptions[0]?.nombre || 'Sede Central', cecosActivos[0]?.nombre || 'Administración Central', '2026-06-01',
        'Planilla', 'Indefinido', turnosOptions[0]?.nombre || 'Turno Oficina', 'Presencial', 'general',
        '', '', '',
        '8', 'ADM-001', '2500',
        'AFP', 'Integra', 'Mixta', '0',
        'NO', 'NO', 'Mensual', '160',
        '', '8', 'NO', '', '',
        'juan.personal@gmail.com', '987654321', 'Av. Lima 123', 'PEN', 'NO', '0', 'Planilla',
        'NO', '0', '0'
      ]
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Aplicar estilo gris a la fila de ejemplo (simplificado)
    const range = XLSX.utils.decode_range(ws['!ref']);
    for(let C = range.s.c; C <= range.e.c; ++C) {
      const cell = ws[XLSX.utils.encode_cell({c: C, r: 1})];
      if(cell) cell.s = { font: { color: { rgb: "888888" }, italic: true } };
    }

    const wsInstrucciones = XLSX.utils.aoa_to_sheet([
      ['Columna', 'Obligatorio', 'Valores válidos / Formato esperado'],
      ['Nombres y apellidos', 'Sí', 'Texto'],
      ['DNI', 'Sí', '8 dígitos numéricos'],
      ['Email corporativo', 'Sí', 'Formato de correo'],
      ['Fecha de ingreso', 'Sí', 'YYYY-MM-DD'],
      ['Modalidad de contrato', 'Sí', 'Planilla, Honorarios'],
      ['Tipo de contrato', 'Sí', 'Indefinido, Plazo fijo, Por obra o servicio'],
      ['Turno asignado', 'Sí (Planilla)', 'Nombre exacto del turno (ver catálogo)'],
      ['Modalidad de trabajo', 'Sí', 'Presencial, Remoto, Híbrido'],
      ['Régimen de jornada', 'No (vacío = general)', 'Valor exacto en minúsculas: general, ciclo_acumulativo, minero_14x7, minero_20x10, minero_28x14, minero_2x1. Si es un régimen minero, completa también Fecha inicio ciclo, Días ciclo trabajo y Días ciclo descanso.'],
      ['Fecha inicio ciclo', 'Sí (si régimen minero)', 'YYYY-MM-DD. Se ignora si Régimen de jornada es general.'],
      ['Días ciclo trabajo', 'Sí (si régimen minero)', 'Número entero (ej. 14 para minero_14x7). Se ignora si Régimen de jornada es general.'],
      ['Días ciclo descanso', 'Sí (si régimen minero)', 'Número entero (ej. 7 para minero_14x7). Se ignora si Régimen de jornada es general.'],
      ['Sistema pensionario', 'Sí (Planilla)', 'AFP, ONP'],
      ['AFP nombre', 'Sí (si AFP)', 'Integra, Prima, Profuturo, Habitat'],
      ['Tipo comisión AFP', 'Sí (si AFP)', 'Mixta, Flujo'],
      ['RUC colaborador', 'Sí (Honorarios)', '11 dígitos'],
      ['Tiene hijos', 'No', 'SI, NO'],
      ['Cargo de confianza', 'No', 'SI, NO'],
    ]);

    const wsValores = XLSX.utils.aoa_to_sheet([
      ['Modalidad de contrato', 'Tipo de contrato', 'Modalidad de trabajo', 'Régimen de jornada (valor exacto)', 'Sistema pensionario', 'AFP nombre', 'Tipo comisión AFP', 'Método de pago', 'Booleanos'],
      ['Planilla', 'Indefinido', 'Presencial', 'general', 'AFP', 'Integra', 'Mixta', 'Mensual', 'SI'],
      ['Honorarios', 'Plazo fijo', 'Remoto', 'ciclo_acumulativo', 'ONP', 'Prima', 'Flujo', 'Por horas', 'NO'],
      ['', 'Por obra o servicio', 'Híbrido', 'minero_14x7', '', 'Profuturo', '', '', ''],
      ['', '', '', 'minero_20x10', '', 'Habitat', '', '', ''],
      ['', '', '', 'minero_28x14', '', '', '', '', ''],
      ['', '', '', 'minero_2x1', '', '', '', '', '']
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
    XLSX.utils.book_append_sheet(wb, wsInstrucciones, "Instrucciones");
    XLSX.utils.book_append_sheet(wb, wsValores, "Valores válidos");
    
    XLSX.writeFile(wb, "plantilla_personal_administrativo.xlsx");
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{maxWidth: 900}}>
        <div className="modal-head">
          <h2>Carga Masiva de Personal Administrativo</h2>
          <button className="icon-btn" style={{color: 'var(--fg-muted)'}} onClick={onClose} disabled={procesando}>{I.x}</button>
        </div>
        
        {step === 1 && (
          <div className="modal-body">
            <div className="grid-2" style={{gap:20, marginBottom: 20, alignItems: 'stretch'}}>
              <div className="card" style={{padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column'}}>
                <div style={{width: 48, height: 48, margin: '0 auto 12px', color: 'var(--primary)'}}>{I.download}</div>
                <h3 style={{marginBottom: 8}}>1. Descargar Plantilla</h3>
                <p className="text-muted" style={{fontSize: 13, marginBottom: 16, flex: 1}}>Descarga el archivo Excel con las columnas requeridas y las instrucciones de llenado.</p>
                <div style={{marginTop: 'auto'}}>
                  <button className="btn btn-secondary" onClick={descargarPlantilla}>Descargar plantilla</button>
                </div>
              </div>
              <div className="card" style={{padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column'}}>
                <div style={{width: 48, height: 48, margin: '0 auto 12px', color: 'var(--primary)'}}>{I.upload}</div>
                <h3 style={{marginBottom: 8}}>2. Cargar Archivo</h3>
                <p className="text-muted" style={{fontSize: 13, marginBottom: 16, flex: 1}}>Sube la plantilla completada para validar y procesar los registros.</p>
                <div style={{marginTop: 'auto'}}>
                  <input type="file" id="file-upload" accept=".xlsx,.xls" style={{display: 'none'}} onChange={handleFileUpload} />
                  <label htmlFor="file-upload" className="btn btn-primary" style={{cursor: 'pointer', margin: 0, display: 'inline-block'}}>Seleccionar archivo</label>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="modal-body">
            <p style={{marginBottom: 16, fontSize: 13}}>
              <strong>{rows.length} filas leídas</strong> · {rows.filter(r => r._errores.length === 0).length} válidas · {rows.filter(r => r._errores.length > 0).length} con errores
            </p>
            
            <div className="table-responsive" style={{maxHeight: 400, overflowY: 'auto', marginBottom: 16}}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Fila Excel</th>
                    <th>Nombres y apellidos</th>
                    <th>DNI</th>
                    <th>Cargo / Área / CECO</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r._originalIndex}</td>
                      <td>{r['Nombres y apellidos']}</td>
                      <td>{r['DNI']}</td>
                      <td>
                        <div style={{fontSize: 11}}>
                          <strong>Cargo:</strong> {r._cargoStr}<br/>
                          <strong>Área:</strong> {r._areaStr}<br/>
                          <strong>CECO:</strong> {r['Centro de costo (CECO)']}
                        </div>
                      </td>
                      <td>
                        {r._errores.length === 0 ? (
                          <span className="badge badge-green">Válida</span>
                        ) : (
                          <div style={{color: 'var(--danger)', fontSize: 11}}>
                            {r._errores.map((e, idx) => <div key={idx}>• {e}</div>)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row" style={{justifyContent: 'space-between'}}>
              <button className="btn btn-secondary" onClick={() => setStep(1)} disabled={procesando}>← Volver</button>
              <button className="btn btn-primary" onClick={procesarCarga} disabled={procesando || rows.filter(r => r._errores.length === 0).length === 0}>
                {procesando ? 'Procesando...' : `Importar ${rows.filter(r => r._errores.length === 0).length} registros válidos`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function RRHHAdmin() {
  const { personalAdmin, tiposContrato = [], partes = [], vacacionesSolicitudes, licencias, solicitudesRRHH = [], aprobarVacacion, turnos, cargos = [], sedes = [], areasEmpresa = [], crearAdminPersonalCtx, actualizarAdminPersonalCtx, eliminarAdminPersonalCtx, empresa, perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles = [], addNotificacion, centrosCosto, usuarios = [], comisiones = [], osClientes = [], oportunidades = [], recibosHonorarios = [], empresaConfig = {}, cxp = [], cxpPagos = [], personalDocumentos = [], subirDocumentoPersonalCtx, validarDocumentoPersonalCtx, corregirDocumentoPersonalCtx, nuevoContratoPeriodoCtx, enviarDocumentoAFirmaCtx, cancelarEnvioFirmaCtx, reenviarNotificacionFirmaCtx, recargarPersonalDocumentosPersonaCtx, cxc = [], facturas = [], activeParams, crearCargo, crearUsuarioConAcceso, role, roles: rolesCtx = {}, tiposDocumento = [], tiposDocumentoConfig = [], requisitosCargo = [], posiciones = [], posicionesUsuarios = [], unidadesOrganizacionales = [], crearPosicion, asignacionesJornada = [], crearAsignacionJornadaCtx, eliminarAsignacionJornadaCtx } = useApp();
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('ficha');
  const [view, setView] = useState('personal');
  const [filtroPersonal, setFiltroPersonal] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroModalidad, setFiltroModalidad] = useState('');
  const [panelAlta, setPanelAlta] = useState(false);
  const [showRequisitosRRHH, setShowRequisitosRRHH] = useState(false);
  const [showTiposDocumentoRRHH, setShowTiposDocumentoRRHH] = useState(false);
  const [showCargaMasivaAdmin, setShowCargaMasivaAdmin] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [altaSaving, setAltaSaving] = useState(false);
  const [altaError, setAltaError] = useState('');
  const paramsHandledRef = useRef('');
  const canFinanzasAdmin = Boolean(role?.permisos?.ver_finanzas || role?.permisos?.todo);
  const modoVistaSociedadPersonalAdmin = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });
  const mostrarBadgeSociedadPersonalAdmin = Boolean(
    empresa?.multisociedad_habilitado
    && !modoVistaSociedadPersonalAdmin.permiteEscritura
    && (modoVistaSociedadPersonalAdmin.sinFiltro || modoVistaSociedadPersonalAdmin.sociedadesIds.length > 0)
  );
  const vistaSociedadConcretaPersonalAdmin = Boolean(
    empresa?.multisociedad_habilitado && modoVistaSociedadPersonalAdmin.permiteEscritura
  );
  const sociedadesContratosPersonalAdminIds = modoVistaSociedadPersonalAdmin.sinFiltro
    ? sociedadesDisponibles.map(sociedad => sociedad.id).filter(Boolean)
    : modoVistaSociedadPersonalAdmin.sociedadesIds;
  const sociedadesContratosPersonalAdminKey = sociedadesContratosPersonalAdminIds.join('|');
  const fechaVigenciaPersonalAdmin = new Date().toISOString().slice(0, 10);
  const resolucionPersonalAdminSociedad = useMemo(() => {
    if (!empresa?.multisociedad_habilitado) {
      return { personal: personalAdmin, sociedadesPorPersonal: new Map(), ambiguos: [], personalSinContratoVigenteIds: new Set() };
    }
    if (!vistaSociedadConcretaPersonalAdmin && !mostrarBadgeSociedadPersonalAdmin) {
      return { personal: [], sociedadesPorPersonal: new Map(), ambiguos: [], personalSinContratoVigenteIds: new Set() };
    }
    const resolucionVista = resolverPersonalConContratosVigentes({
      personal: personalAdmin,
      documentos: personalDocumentos,
      tiposDocumento,
      sociedadIds: sociedadesContratosPersonalAdminIds,
      fecha: fechaVigenciaPersonalAdmin,
      incluirSinContrato: true,
    });
    if (!vistaSociedadConcretaPersonalAdmin) {
      return {
        ...resolucionVista,
        personalSinContratoVigenteIds: new Set(
          personalAdmin
            .filter(persona => !resolucionVista.sociedadesPorPersonal.has(persona.id))
            .map(persona => persona.id)
        ),
      };
    }

    const todasLasSociedadesIds = [...new Set(personalDocumentos.map(doc => doc.sociedad_id).filter(Boolean))];
    const resolucionGlobal = resolverPersonalConContratosVigentes({
      personal: personalAdmin,
      documentos: personalDocumentos,
      tiposDocumento,
      sociedadIds: todasLasSociedadesIds,
      fecha: fechaVigenciaPersonalAdmin,
      incluirSinContrato: true,
    });
    const personalSinContratoVigenteIds = new Set(
      personalAdmin
        .filter(persona => !resolucionGlobal.sociedadesPorPersonal.has(persona.id))
        .map(persona => persona.id)
    );
    return {
      ...resolucionVista,
      personal: resolucionVista.personal.filter(persona => (
        resolucionVista.sociedadesPorPersonal.has(persona.id)
        || personalSinContratoVigenteIds.has(persona.id)
      )),
      personalSinContratoVigenteIds,
    };
  }, [empresa?.multisociedad_habilitado, personalAdmin, personalDocumentos, tiposDocumento, sociedadesContratosPersonalAdminKey, fechaVigenciaPersonalAdmin, vistaSociedadConcretaPersonalAdmin, mostrarBadgeSociedadPersonalAdmin]);
  const [formDatosBancariosAdmin, setFormDatosBancariosAdmin] = useState([]);
  const [crearUsuarioSistemaAdmin, setCrearUsuarioSistemaAdmin] = useState(false);
  const [usuarioSistemaFormAdmin, setUsuarioSistemaFormAdmin] = useState({ email:'', rol:'', posicion_id:'', acceso_campo:false, perfil_campo:'administrativo' });
  // Estados para subida de documentos en tab Documentos
  const docUploadFormBase = { tipoDoc: '', sociedadId: '', fechaEmision: '', fechaVencimiento: '', notas: '', cargoFirma: '', cargoIdFirma: '', remuneracionFirma: '', modalidadFirma: '', sedeIdFirma: '', sedeFirma: '', areaIdFirma: '', areaNombreFirma: '', regimenJornadaFirma: '', tipoContratoFirma: '', contratoReferenciaId: '', cambioCargo: false, cambioRemuneracion: false, cambioModalidad: false, cambioSede: false, cambioOtro: false, descripcionCambio: '', fechaVigenciaCambio: '', esIndefinido: false };
  const [docUploadForm, setDocUploadForm] = useState(docUploadFormBase);
  const [docUploadFile, setDocUploadFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docUploadError, setDocUploadError] = useState('');
  const [docValidandoId, setDocValidandoId] = useState(null);
  const [showRechazoInput, setShowRechazoInput] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [docPreviewReqAdmin, setDocPreviewReqAdmin] = useState(null);
  const [docPreviewPersonaAdmin, setDocPreviewPersonaAdmin] = useState(null);
  const [showFormAsigAdmin, setShowFormAsigAdmin] = useState(false);
  const [formAsigAdmin, setFormAsigAdmin] = useState({ fecha_inicio:'', fecha_fin:'', regimen_jornada:'general', fecha_inicio_ciclo:'', motivo:'' });
  const [savingAsigAdmin, setSavingAsigAdmin] = useState(false);
  const [formAsigAdminError, setFormAsigAdminError] = useState('');
  const [retroWallAsigAdmin, setRetroWallAsigAdmin] = useState(null);
  const [retroWallMotivoAsigAdmin, setRetroWallMotivoAsigAdmin] = useState('');
  const [deletingAsigAdminId, setDeletingAsigAdminId] = useState(null);
  const [retroWallDeleteAsigAdmin, setRetroWallDeleteAsigAdmin] = useState(null);
  const [retroWallMotivoDeleteAsigAdmin, setRetroWallMotivoDeleteAsigAdmin] = useState('');

  const COLUMNAS_DEFAULT_ADMIN = [
    { key: 'codigo', label: 'Código' },
    { key: 'colaborador', label: 'Colaborador' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'unidad', label: 'Unidad organizacional' },
    { key: 'sede', label: 'Sede' },
    { key: 'turno', label: 'Turno' },
    { key: 'jornada', label: 'Jornada' },
    { key: 'contrato', label: 'Contrato' },
    { key: 'modalidad', label: 'Modalidad' },
    { key: 'vacaciones', label: 'Vacaciones disp.' },
    { key: 'estado', label: 'Estado' },
    { key: 'acciones', label: 'Acciones' },
  ];
  const [visibleColsAdmin, setVisibleColsAdmin] = useState(() => {
    try {
      const stored = localStorage.getItem('erp_rrhh_admin_cols');
      return stored ? JSON.parse(stored) : COLUMNAS_DEFAULT_ADMIN.map(c => c.key);
    } catch(e) { return COLUMNAS_DEFAULT_ADMIN.map(c => c.key); }
  });
  
  useEffect(() => {
    localStorage.setItem('erp_rrhh_admin_cols', JSON.stringify(visibleColsAdmin));
  }, [visibleColsAdmin]);
  const [visorUrlAdmin, setVisorUrlAdmin] = useState(null);
  const [previewLoadingUrlAdmin, setPreviewLoadingUrlAdmin] = useState(false);
  const visorTimerRefAdmin = useRef(null);

  const inlineUploadFormBase = { sociedadId: '', fechaEmision: '', fechaVencimiento: '', notas: '', cargoFirma: '', cargoIdFirma: '', remuneracionFirma: '', modalidadFirma: '', sedeIdFirma: '', sedeFirma: '', areaIdFirma: '', areaNombreFirma: '', regimenJornadaFirma: '', tipoContratoFirma: '', contratoReferenciaId: '', cambioCargo: false, cambioRemuneracion: false, cambioModalidad: false, cambioSede: false, cambioOtro: false, descripcionCambio: '', fechaVigenciaCambio: '', modoSubida: 'nueva_version', periodoIdAnterior: null, esIndefinido: false };
  const [inlineUploadReq, setInlineUploadReq] = useState(null);
  const [inlineUploadForm, setInlineUploadForm] = useState(inlineUploadFormBase);
  const [inlineUploadFile, setInlineUploadFile] = useState(null);
  const [inlineUploading, setInlineUploading] = useState(false);
  const [inlineUploadError, setInlineUploadError] = useState('');
  const [retroWallInline, setRetroWallInline] = useState(null);
  const [retroWallMotivoInline, setRetroWallMotivoInline] = useState('');
  const [modalEnviarFirmaDocAdmin, setModalEnviarFirmaDocAdmin] = useState(null);
  const [enviarFirmaMensajeAdmin, setEnviarFirmaMensajeAdmin] = useState('');
  const [enviandoFirmaAdmin, setEnviandoFirmaAdmin] = useState(false);
  const periodoAlertaHoras = useMemo(() => rrhhDesplazarPeriodoMes(rrhhPeriodoMesActual(), -1), []);
  const [tareosAlertaHoras, setTareosAlertaHoras] = useState([]);
  // Estados para tab de amonestaciones (GAP-19)
  const [amonestaciones, setAmonestaciones] = useState([]);
  const [amonLoading, setAmonLoading] = useState(false);
  const amonFormBase = { tipo:'verbal', motivo:'', descripcion:'', fecha:new Date().toISOString().split('T')[0], dias_suspension:'', fecha_inicio_suspension:'', fecha_fin_suspension:'', evidencia_url:'', impactar_asistencia:true };
  const [amonForm, setAmonForm] = useState(amonFormBase);
  const [amonPanel, setAmonPanel] = useState(false);
  const [amonSaving, setAmonSaving] = useState(false);
  const [amonError, setAmonError] = useState('');
  const [amonAnularId, setAmonAnularId] = useState(null);
  const [amonMotivoAnulacion, setAmonMotivoAnulacion] = useState('');
  const turnosOptions = (turnos || []).filter(t => t.estado !== 'inactivo');
  const defaultTurnoId = turnosOptions[0]?.id || '';
  const cecosActivos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const cecosActivosEscritura = cecosActivos.filter(c => (
    !modoVistaSociedadPersonalAdmin.sociedadIdEscritura
    || c.sociedad_id === modoVistaSociedadPersonalAdmin.sociedadIdEscritura
  ));
  const vacacionesSugeridas = String(diasVacacionesPorRegimen(empresaConfig?.regimen_laboral_empresa || 'general'));
  const formAltaBase = { nombre:'', dni:'', fecha_nacimiento:'', telefono:'', email:'', email_personal:'', celular_personal:'', direccion:'', codigo:'', cargo:'', cargo_id:'', posicion_id:'', area:'', sede:'', turno_id:'', centro_costo_id:'', modalidad:'planilla', tipo_contrato:'indefinido', fecha_inicio:'', remuneracion:'', moneda:'PEN', metodo_pago:'mensual', monto_mensual:'', horas_base_mes:'', tarifa_hora:'0', dias_vacaciones:vacacionesSugeridas, estado:'activo', auth_user_id:'', tiene_comisiones:false, porcentaje_comision:'', modalidad_comision:'Planilla', ruc_vendedor:'', retencion_ir_comision:'8', ruc_colaborador:'', sistema_pensionario:'AFP', retencion_ir:'8', suspension_retenciones:false, vencimiento_suspension:'', afp_nombre:'Integra', tiene_hijos:false, cargo_confianza:false, cuota_prestamo_mes:'0', descuento_judicial:'0', regimen_laboral:'general', regimen_jornada:'general', dias_ciclo_trabajo:'', dias_ciclo_descanso:'', horas_diarias_pactadas:'8', fecha_inicio_ciclo:'', bonif_altitud:'0', tipo_comision_afp:'mixta', pct_comision_afp_flujo:'0', tarifa_hora_referencial:'' };
  const usuariosEmpresa = usuarios.filter(u => u.empresa_id === empresa?.id);
  const [formAlta, setFormAlta] = useState(formAltaBase);
  const [nuevoCargoTextoAdmin, setNuevoCargoTextoAdmin] = useState('');
  const [historialDniAlta, setHistorialDniAlta] = useState(null);
  const [horasBaseOverride, setHorasBaseOverride] = useState(false);
  const horasBaseForm = Number(formAlta.horas_base_mes || 0);
  const tarifaHoraForm = Math.round((horasBaseForm > 0 ? Number(formAlta.monto_mensual || 0) / horasBaseForm : 0) * 100) / 100;
  const tarifaSym = symOf(formAlta.moneda || 'PEN');
  const modalidadAlta = normalizarModalidadContrato(formAlta.modalidad);
  const esHonorariosAlta = modalidadAlta === 'honorarios';
  const opcionesTipoContratoAlta = esHonorariosAlta ? [['honorarios', 'Honorarios']] : (tiposContrato.length > 0 ? tiposContrato.map(c => [c.codigo, c.nombre]) : CONTRATO_DURACION_OPCIONES);
  const tipoContratoAlta = esHonorariosAlta
    ? 'honorarios'
    : (tiposContrato.length > 0
        ? (tiposContrato.some(c => c.codigo === formAlta.tipo_contrato) ? formAlta.tipo_contrato : (tiposContrato[0]?.codigo || ''))
        : normalizarTipoContratoDuracion(formAlta.tipo_contrato, modalidadAlta));
  const asignacionFamiliar = asignacionFamiliarMonto(empresaConfig);
  const tipoFiscalizacionAlta = getTipoFiscalizacion({
    modalidad_contrato: modalidadAlta,
    regimen_jornada: formAlta.regimen_jornada,
    cargo_confianza: formAlta.cargo_confianza,
  });
  const adminOriginalEdicion = editandoId ? personalAdmin.find(p => p.id === editandoId) : null;
  const advAdendaManualAdmin = adminOriginalEdicion && (
    String(formAlta.cargo_id || '') !== String(adminOriginalEdicion.cargo_id || '') ||
    Number(formAlta.remuneracion || formAlta.monto_mensual || 0) !== Number(adminOriginalEdicion.sueldo_base || adminOriginalEdicion.remuneracion || adminOriginalEdicion.monto_mensual || 0)
  );
  const cargosAdminOptions = cargos
    .filter(c => c.estado !== 'inactivo' && c.tipo !== 'Operativo' && c.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const sedesOptions = sedes
    .filter(s => s.estado !== 'inactivo')
    .map(s => ({ nombre: s.nombre, detalle: s.direccion || s.detalle || s.gps || '' }))
    .filter(s => s.nombre);
  // La fuente de verdad para la unidad del colaborador es el maestro de
  // Unidades Organizacionales. `areasEmpresa` se mantiene solo como respaldo
  // transitorio para instalaciones que aun estan terminando la migracion.
  const unidadesOrganizacionalesOptions = (unidadesOrganizacionales.length ? unidadesOrganizacionales : areasEmpresa)
    .filter(u => u.estado !== 'inactivo' && u.nombre)
    .map(u => ({ id: u.id, nombre: u.nombre }));
  const areasOptions = unidadesOrganizacionalesOptions.map(u => u.nombre);
  const unidadNombrePorId = React.useMemo(() => new Map(unidadesOrganizacionalesOptions.map(u => [u.id, u.nombre])), [unidadesOrganizacionalesOptions]);
  const posicionesParaCargoAlta = React.useMemo(() => posiciones.filter(p => (
    p.activa !== false && p.estado !== 'inactivo' && p.cargo_id === formAlta.cargo_id
  )), [posiciones, formAlta.cargo_id]);
  const posicionSeleccionadaAlta = React.useMemo(
    () => posiciones.find(p => p.id === formAlta.posicion_id) || null,
    [posiciones, formAlta.posicion_id]
  );
  const verificarDniAlta = async (dni) => {
    const clean = String(dni || '').trim();
    if (clean.length < 8 || !empresa?.id) { setHistorialDniAlta(null); return; }
    try {
      const info = await rrhhService.verificarHistorialDni(clean, empresa.id);
      setHistorialDniAlta(info?.encontrado ? info : null);
    } catch {
      setHistorialDniAlta(null);
    }
  };
  const todosPersonal = resolucionPersonalAdminSociedad.personal;
  const persona = sel ? todosPersonal.find(p => p.id === sel) : null;

  // ── Motor de habilitaciones documentarias -- fuente unica: RPC calcular_habilitaciones_personal
  // (mismo patron que pages_ops.jsx). Reemplaza la antigua replica JS que reimplementaba el
  // calculo a mano (auditoria confirmo divergencias latentes, ej. checkbox "Es indefinido" nunca
  // se leia). En modo mock (Supabase no configurado) cae a un calculo local via
  // calcularEstadoDocumentoUI, que personalDocumentosService sigue exportando porque tambien lo
  // usa el fallback mock de Personal Operativo (pages_ops.jsx) -- no se elimina esa funcion.
  const [habilitacionesAdmin, setHabilitacionesAdmin] = useState({});

  const calcHabilitacionesMockAdmin = useCallback(() => {
    const tipoIdx = Object.fromEntries(tiposDocumento.map(t => [t.id, t]));
    const docIdx = {};
    for (const d of personalDocumentos) {
      if (!d.activo && d.estado_validacion !== 'pendiente') continue;
      const k = `${d.personal_id}|${d.tipo_documento_id || d.tipo_doc}`;
      const prev = docIdx[k];
      if (!prev || (d.version ?? 0) >= (prev.version ?? 0)) docIdx[k] = d;
    }
    const CRITICOS = new Set(['vencido', 'rechazado', 'falta', 'incompleto']);
    const ADV = new Set(['por_vencer', 'en_revision']);
    const mapa = {};
    for (const p of personalAdmin) {
      if (!p.cargo_id) { mapa[p.id] = { estado_global: 'sin_cargo', docs: [], tiene_cargo: false }; continue; }
      const reqCargo = requisitosCargo.filter(r => r.cargo_id === p.cargo_id);
      if (!reqCargo.length) { mapa[p.id] = { estado_global: 'sin_requisitos', docs: [], tiene_cargo: true, cargo_id: p.cargo_id }; continue; }
      const docs = reqCargo.map(req => {
        const tipo = tipoIdx[req.tipo_documento_id];
        const doc = docIdx[`${p.id}|${req.tipo_documento_id}`] || null;
        const uiState = personalDocumentosService.calcularEstadoDocumentoUI(doc, tipo, personalDocumentos || []);
        return { ...req, tipo, doc, estado: uiState.estado, dias_restantes: uiState.dias };
      });
      const obs = docs.filter(d => d.obligatorio).map(d => d.estado);
      const estado_global = obs.some(e => CRITICOS.has(e)) ? 'critico' : obs.some(e => ADV.has(e)) ? 'advertencia' : 'en_regla';
      mapa[p.id] = { estado_global, docs, tiene_cargo: true, cargo_id: p.cargo_id };
    }
    return mapa;
  }, [personalAdmin, requisitosCargo, tiposDocumento, personalDocumentos]);

  // Agrupa las filas planas del RPC en la estructura { estado_global, docs, tiene_cargo } por
  // personal_id, igual que agruparFilasMotorBD en pages_ops.jsx, pero con la agregacion propia de
  // Ficha Administrativa (por 'obligatorio', no por 'es_habilitante' -- decision de negocio
  // pre-existente, no se unifica aqui).
  const agruparHabilitacionesAdmin = useCallback((filas) => {
    const tipoIdx = Object.fromEntries(tiposDocumento.map(t => [t.id, t]));
    const mapa = {};
    for (const fila of filas) {
      if (fila.personal_tipo !== 'administrativo') continue;
      const pid = fila.personal_id;
      if (!mapa[pid]) mapa[pid] = { estado_global: null, docs: [], tiene_cargo: fila.tiene_cargo, cargo_id: fila.cargo_id };
      if (fila.estado === 'sin_cargo') { mapa[pid].estado_global = 'sin_cargo'; mapa[pid].tiene_cargo = false; continue; }
      mapa[pid].docs.push({
        tipo_documento_id: fila.tipo_documento_id,
        obligatorio: fila.obligatorio,
        tipo: tipoIdx[fila.tipo_documento_id] || { id: fila.tipo_documento_id, nombre: fila.tipo_doc_nombre, categoria: fila.categoria },
        estado: fila.estado,
        fecha_vencimiento: fila.fecha_vencimiento,
        dias_restantes: fila.dias_restantes,
        doc: null, // enriquecido abajo con el documento crudo, para preview/reemplazo
      });
    }
    const docIdx = {};
    for (const d of personalDocumentos) {
      if (!d.activo && d.estado_validacion !== 'pendiente') continue;
      const k = `${d.personal_id}|${d.tipo_documento_id || d.tipo_doc}`;
      const prev = docIdx[k];
      if (!prev || (d.version ?? 0) >= (prev.version ?? 0)) docIdx[k] = d;
    }
    const CRITICOS = new Set(['vencido', 'rechazado', 'falta', 'incompleto']);
    const ADV = new Set(['por_vencer', 'en_revision']);
    for (const pid of Object.keys(mapa)) {
      const h = mapa[pid];
      for (const d of h.docs) d.doc = docIdx[`${pid}|${d.tipo_documento_id}`] || null;
      if (h.estado_global === 'sin_cargo') continue;
      if (!h.docs.length) { h.estado_global = 'sin_requisitos'; continue; }
      const obs = h.docs.filter(d => d.obligatorio).map(d => d.estado);
      h.estado_global = obs.some(e => CRITICOS.has(e)) ? 'critico' : obs.some(e => ADV.has(e)) ? 'advertencia' : 'en_regla';
    }
    // Asegura que todo personalAdmin aparezca, incluso quien no tenga filas en el RPC.
    for (const p of personalAdmin) {
      if (!mapa[p.id]) mapa[p.id] = { estado_global: p.cargo_id ? 'sin_requisitos' : 'sin_cargo', tiene_cargo: !!p.cargo_id, cargo_id: p.cargo_id, docs: [] };
    }
    return mapa;
  }, [tiposDocumento, personalDocumentos, personalAdmin]);

  useEffect(() => {
    if (!empresa?.id) return;
    if (!isSupabaseConfigured || !isSupabaseConfigured()) {
      setHabilitacionesAdmin(calcHabilitacionesMockAdmin());
      return;
    }
    getSupabaseClient().then(sb =>
      sb.rpc('calcular_habilitaciones_personal', { p_empresa_id: empresa.id })
        .then(({ data, error }) => {
          if (error) {
            console.error('[Motor BD] Error al cargar habilitaciones administrativas:', error.message);
            setHabilitacionesAdmin(calcHabilitacionesMockAdmin());
          } else {
            setHabilitacionesAdmin(agruparHabilitacionesAdmin(data || []));
          }
        })
    );
  }, [empresa?.id, personalDocumentos, requisitosCargo]);

  useEffect(() => {
    if (!empresa?.id) return;
    const { desde, hasta } = rrhhRangoPeriodoMes(periodoAlertaHoras);
    tareosAdminService.cargarTareos(empresa.id, { desde, hasta })
      .then(setTareosAlertaHoras)
      .catch(() => setTareosAlertaHoras([]));
  }, [empresa?.id, periodoAlertaHoras]);

  useEffect(() => {
    if (!sel || !empresa?.id || tab !== 'amonestaciones') return;
    setAmonLoading(true);
    amonestacionesService.cargarAmonestaciones(empresa.id, sel)
      .then(setAmonestaciones)
      .catch(() => setAmonestaciones([]))
      .finally(() => setAmonLoading(false));
  }, [sel, empresa?.id, tab]);

  useEffect(() => {
    clearInterval(visorTimerRefAdmin.current);
    const doc = docPreviewReqAdmin?.doc;
    if (!doc) { setVisorUrlAdmin(null); return; }
    setVisorUrlAdmin(doc.archivo_url || null);
    const storageRef = doc.storage_path || doc.archivo_url || null;
    if (!storageRef || !isSupabaseConfigured || !isSupabaseConfigured()) return;
    personalDocumentosService.renovarUrlDocumento(storageRef)
      .then(url => setVisorUrlAdmin(url))
      .catch(() => {});
    visorTimerRefAdmin.current = setInterval(() => {
      personalDocumentosService.renovarUrlDocumento(storageRef)
        .then(url => setVisorUrlAdmin(url))
        .catch(() => {});
    }, 8 * 60 * 1000);
    return () => clearInterval(visorTimerRefAdmin.current);
  }, [docPreviewReqAdmin?.doc?.id]);

  const canGestionarDocsRrhhAdmin = Boolean(
    role?.permisos?.todo ||
    role?.es_admin_empresa ||
    role?.permisos?.tenant_admin ||
    role?.permisos?.aprobar?.includes?.('rrhh_admin') ||
    role?.permisos?.editar?.includes?.('rrhh_admin')
  );

  const abrirPreviewDocumentoAdmin = (req, pers) => {
    if (!req?.doc) return;
    setDocPreviewReqAdmin(req);
    setDocPreviewPersonaAdmin(pers || null);
  };

  const cerrarPreviewDocumentoAdmin = () => {
    setDocPreviewReqAdmin(null);
    setDocPreviewPersonaAdmin(null);
    setVisorUrlAdmin(null);
    setPreviewLoadingUrlAdmin(false);
  };

  const descargarPreviewDocumentoAdmin = async () => {
    const doc = docPreviewReqAdmin?.doc;
    if (!doc) return;
    try {
      const ref = doc.storage_path || doc.archivo_url;
      const url = (ref && isSupabaseConfigured && isSupabaseConfigured())
        ? await personalDocumentosService.renovarUrlDocumento(ref)
        : doc.archivo_url;
      if (url) window.open(url, '_blank');
    } catch {
      if (doc.archivo_url) window.open(doc.archivo_url, '_blank');
    }
  };

  const validarPreviewDocumentoAdmin = async (docId, decision, motivo) => {
    try {
      const actualizado = await validarDocumentoPersonalCtx(docId, decision, motivo);
      setDocPreviewReqAdmin(prev => prev?.doc?.id === docId ? { ...prev, doc: actualizado || { ...prev.doc, estado_validacion: decision } } : prev);
      addNotificacion(`Documento ${decision === 'aprobado' ? 'aprobado' : 'rechazado'}.`);
    } catch {
      addNotificacion('Error al validar.');
    }
  };

  const cerrarPanelColaborador = () => {
    setPanelAlta(false);
    setEditandoId(null);
    setFormAlta(formAltaBase);
    setHorasBaseOverride(false);
    setAltaError('');
    setFormDatosBancariosAdmin([]);
    setCrearUsuarioSistemaAdmin(false);
    setUsuarioSistemaFormAdmin({ email:'', rol:'', acceso_campo:false, perfil_campo:'administrativo' });
  };
  const horasBaseParaTurno = (turnoId) => {
    const turno = turnosOptions.find(t => t.id === turnoId);
    const horas = turno ? calcularHorasBaseMesDesdeTurno(turno) : 0;
    return horas ? String(horas) : '';
  };
  const codigoSugeridoAdmin = () => {
    const nums = (todosPersonal || [])
      .map(p => String(p.codigo || '').match(/^ADM-(\d+)$/i)?.[1])
      .filter(Boolean)
      .map(Number);
    const next = Math.max(0, ...nums, todosPersonal.length) + 1;
    return `ADM-${String(next).padStart(3, '0')}`;
  };
  const abrirNuevoColaborador = () => {
    setEditandoId(null);
    setHorasBaseOverride(false);
    setFormAlta({ ...formAltaBase, codigo: codigoSugeridoAdmin(), turno_id: '', horas_base_mes: '', dias_vacaciones: vacacionesSugeridas });
    setFormDatosBancariosAdmin([]);
    setCrearUsuarioSistemaAdmin(false);
    setUsuarioSistemaFormAdmin({ email:'', rol:'', acceso_campo:false, perfil_campo:'administrativo' });
    setPanelAlta(true);
  };
  const abrirEditarColaborador = (p) => {
    setEditandoId(p.id);
    const turnoActualId = turnosOptions.some(t => t.id === p.turno_id) ? p.turno_id : defaultTurnoId;
    const horasDerivadas = horasBaseParaTurno(turnoActualId);
    const horasActuales = p.horas_base_mes != null ? String(p.horas_base_mes) : horasDerivadas;
    setHorasBaseOverride(Boolean(horasActuales && horasDerivadas && horasActuales !== horasDerivadas));
    setFormAlta({
      ...formAltaBase,
      nombre: p.nombre || '',
      dni: p.dni || p.documento || '',
      fecha_nacimiento: p.fecha_nacimiento || '',
      telefono: sanitizePhone(p.telefono || ''),
      email: p.email || '',
      email_personal: p.email_personal || '',
      celular_personal: sanitizePhone(p.celular_personal || ''),
      direccion: p.direccion || '',
      codigo: p.codigo || p.id || '',
      cargo: p.cargo || '',
      cargo_id: p.cargo_id || '',
      posicion_id: p.posicion_id || '',
      area: p.area || '',
      sede: p.sede || '',
      turno_id: turnoActualId,
      centro_costo_id: p.centro_costo_id || '',
      modalidad: normalizarModalidadContrato(p.modalidad_contrato || p.tipo_contrato),
      tipo_contrato: normalizarTipoContratoDuracion(p.tipo_contrato, p.modalidad_contrato || p.tipo_contrato),
      fecha_inicio: p.fecha_ingreso || '',
      remuneracion: String(p.remuneracion ?? p.sueldo_base ?? ''),
      moneda: p.moneda || 'PEN',
      metodo_pago: p.metodo_pago || 'mensual',
      monto_mensual: String(p.monto_mensual ?? p.remuneracion ?? p.sueldo_base ?? ''),
      horas_base_mes: horasActuales,
      tarifa_hora: String(p.tarifa_hora ?? 0),
      dias_vacaciones: String(p.dias_vacaciones_total ?? p.dias_vacaciones_disponibles ?? vacacionesSugeridas),
      estado: p.estado || 'activo',
      auth_user_id: p.auth_user_id || '',
      tiene_comisiones: Boolean(p.tiene_comisiones),
      porcentaje_comision: String(p.porcentaje_comision ?? ''),
      modalidad_comision: p.modalidad_comision || 'Planilla',
      ruc_vendedor: p.ruc_vendedor || '',
      retencion_ir_comision: String(p.retencion_ir_comision ?? '8'),
      ruc_colaborador: p.ruc_colaborador || '',
      sistema_pensionario: p.sistema_pensionario || 'AFP',
      retencion_ir: String(p.retencion_ir ?? '8'),
      suspension_retenciones: Boolean(p.suspension_retenciones),
      vencimiento_suspension: p.vencimiento_suspension || '',
      afp_nombre: p.afp_nombre || 'Integra',
      tiene_hijos: Boolean(p.tiene_hijos),
      cargo_confianza: Boolean(p.cargo_confianza),
      cuota_prestamo_mes: String(p.cuota_prestamo_mes ?? '0'),
      descuento_judicial: String(p.descuento_judicial ?? '0'),
      regimen_laboral: p.regimen_laboral || 'general',
      regimen_jornada: p.regimen_jornada || 'general',
      dias_ciclo_trabajo: String(p.dias_ciclo_trabajo ?? ''),
      dias_ciclo_descanso: String(p.dias_ciclo_descanso ?? ''),
      horas_diarias_pactadas: String(p.horas_diarias_pactadas ?? '8'),
      fecha_inicio_ciclo: p.fecha_inicio_ciclo || '',
      bonif_altitud: String(p.bonif_altitud ?? '0'),
      tipo_comision_afp: p.tipo_comision_afp || 'mixta',
      pct_comision_afp_flujo: String(p.pct_comision_afp_flujo ?? '0'),
      tarifa_hora_referencial: p.tarifa_hora_referencial != null ? String(p.tarifa_hora_referencial) : '',
    });
    setFormDatosBancariosAdmin(Array.isArray(p.datos_bancarios) ? p.datos_bancarios : []);
    setCrearUsuarioSistemaAdmin(false);
    setUsuarioSistemaFormAdmin({ email:'', rol:'', acceso_campo:false, perfil_campo:'administrativo' });
    setPanelAlta(true);
  };
  useEffect(() => {
    const key = JSON.stringify(activeParams || {});
    if (!activeParams || paramsHandledRef.current === key) return;
    if (activeParams.detail) {
      const personaParam = todosPersonal.find(p => p.id === activeParams.detail);
      if (personaParam) {
        setSel(personaParam.id);
        setTab(activeParams.tab === 'documentos' ? 'documentos' : 'ficha');
        setView('personal');
        paramsHandledRef.current = key;
      }
      return;
    }
    if (activeParams.action === 'new') {
      setEditandoId(null);
      setHorasBaseOverride(false);
      setFormAlta({ ...formAltaBase, codigo: codigoSugeridoAdmin(), turno_id: '', horas_base_mes: '', dias_vacaciones: vacacionesSugeridas, email: activeParams.email || '', nombre: activeParams.nombre || '', dni: activeParams.dni || '', telefono: activeParams.telefono || '' });
      setPanelAlta(true);
      setView('personal');
      paramsHandledRef.current = key;
    }
  }, [activeParams, todosPersonal, vacacionesSugeridas]);
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
    const modalidad = normalizarModalidadContrato(formAlta.modalidad);
    const tipoContratoNombreCatalogo = tiposContrato.find(c => c.codigo === tipoContratoAlta)?.nombre || tipoContratoAlta;
    const tipoContrato = normalizarTipoContratoDuracion(tipoContratoNombreCatalogo, modalidad);
    if (modalidad !== 'honorarios' && !turnosOptions.some(t => t.id === formAlta.turno_id)) {
      setAltaError('Selecciona un turno real creado en Supabase antes de guardar el colaborador.');
      return;
    }
    if (modalidad === 'honorarios' && (!formAlta.ruc_colaborador || !isValidRuc(formAlta.ruc_colaborador))) {
      setAltaError('El RUC del colaborador es obligatorio y debe tener 11 dígitos (comenzar con 1 o 2).');
      return;
    }
    if (modalidad === 'honorarios' && !formAlta.fecha_inicio) {
      setAltaError('El inicio del encargo es obligatorio.');
      return;
    }
    if (!formAlta.centro_costo_id) {
      setAltaError('Este campo es obligatorio. Selecciona un CECO antes de continuar.');
      return;
    }
    if (formAlta.posicion_id && !posicionSeleccionadaAlta) {
      setAltaError('La posición seleccionada ya no está disponible. Selecciona otra o deja la ficha sin posición.');
      return;
    }
    setAltaSaving(true);
    setAltaError('');
    const idx = todosPersonal.length + 1;
    const nuevo = {
      id: editandoId || `per_${Date.now()}`, empresa_id: empresa?.id,
      codigo: formAlta.codigo || codigoSugeridoAdmin(),
      nombre: formAlta.nombre || 'Nuevo colaborador',
      dni: formAlta.dni || '00000000',
      fecha_nacimiento: formAlta.fecha_nacimiento || '',
      telefono: formAlta.telefono || '',
      email: formAlta.email || '',
      email_personal: formAlta.email_personal || null,
      celular_personal: formAlta.celular_personal || null,
      direccion: formAlta.direccion || '',
      cargo: formAlta.cargo || 'Por definir',
      cargo_id: formAlta.cargo_id || null,
      posicion_id: formAlta.posicion_id || null,
      area: posicionSeleccionadaAlta ? (unidadNombrePorId.get(posicionSeleccionadaAlta.unidad_organizacional_id) || null) : (formAlta.area || null),
      supervisor: '', sede: formAlta.sede || '', turno_id: formAlta.turno_id,
      centro_costo_id: formAlta.centro_costo_id,
      nivel_estudios: '', especialidad: '', institucion: '',
      modalidad_contrato: modalidad,
      tipo_contrato: tipoContrato,
      remuneracion: Number(formAlta.remuneracion) || 0,
      moneda: formAlta.moneda || 'PEN',
      metodo_pago: formAlta.metodo_pago || 'mensual',
      monto_mensual: Number(formAlta.monto_mensual || formAlta.remuneracion || 0),
      horas_base_mes: Number(formAlta.horas_base_mes || 0),
      tarifa_hora: tarifaHoraForm,
      modalidad: 'Presencial',
      dias_vacaciones_total: Number(vacacionesSugeridas),
      dias_vacaciones_usados: 0,
      dias_vacaciones_disponibles: Number(vacacionesSugeridas),
      estado: formAlta.estado || 'activo',
      fecha_ingreso: formAlta.fecha_inicio || new Date().toISOString().slice(0, 10),
      contacto_emergencia: '', relacion_emergencia: '', telefono_emergencia: '',
      documentos: [],
      auth_user_id: formAlta.auth_user_id || null,
      tiene_comisiones: Boolean(formAlta.tiene_comisiones),
      porcentaje_comision: Number(formAlta.porcentaje_comision || 0),
      modalidad_comision: formAlta.modalidad_comision || 'Planilla',
      ruc_vendedor: formAlta.modalidad_comision === 'Honorarios'
        ? (modalidad === 'honorarios' ? (formAlta.ruc_colaborador || null) : (formAlta.ruc_vendedor || null))
        : null,
      retencion_ir_comision: Number(formAlta.retencion_ir_comision || 8),
      ruc_colaborador: modalidad === 'honorarios' ? (formAlta.ruc_colaborador || null) : null,
      sistema_pensionario: modalidad === 'planilla' ? (formAlta.sistema_pensionario || 'AFP') : null,
      retencion_ir: modalidad === 'honorarios' ? Number(empresaConfig?.pct_retencion_ir_honorarios ?? formAlta.retencion_ir ?? 8) : null,
      suspension_retenciones: modalidad === 'honorarios' ? Boolean(formAlta.suspension_retenciones) : false,
      vencimiento_suspension: modalidad === 'honorarios' && formAlta.suspension_retenciones ? (formAlta.vencimiento_suspension || null) : null,
      afp_nombre: modalidad === 'planilla' && formAlta.sistema_pensionario === 'AFP' ? (formAlta.afp_nombre || 'Integra') : null,
      tiene_hijos: modalidad === 'planilla' ? Boolean(formAlta.tiene_hijos) : false,
      cargo_confianza: modalidad === 'planilla' ? Boolean(formAlta.cargo_confianza) : false,
      cuota_prestamo_mes: modalidad === 'planilla' ? Number(formAlta.cuota_prestamo_mes || 0) : 0,
      descuento_judicial: modalidad === 'planilla' ? Number(formAlta.descuento_judicial || 0) : 0,
      regimen_laboral: 'general',
      regimen_jornada: modalidad === 'planilla' ? (formAlta.regimen_jornada || 'general') : 'general',
      horas_diarias_pactadas: Number(formAlta.horas_diarias_pactadas || 8),
      fecha_inicio_ciclo: (modalidad === 'planilla' && formAlta.regimen_jornada !== 'general') ? (formAlta.fecha_inicio_ciclo || null) : null,
      bonif_altitud: Number(formAlta.bonif_altitud || 0),
      tipo_comision_afp: formAlta.tipo_comision_afp || 'mixta',
      pct_comision_afp_flujo: Number(formAlta.pct_comision_afp_flujo || 0),
      tarifa_hora_referencial: modalidad === 'honorarios' && formAlta.tarifa_hora_referencial !== '' ? Number(formAlta.tarifa_hora_referencial) : null,
      datos_bancarios: formDatosBancariosAdmin,
    };
    try {
      if (editandoId) {
        await actualizarAdminPersonalCtx(editandoId, nuevo);
        addNotificacion('Colaborador actualizado.');
      } else {
        await crearAdminPersonalCtx(nuevo);
        addNotificacion('Colaborador creado. Sube el contrato firmado en Documentos para activar alertas de vencimiento.');
        if (crearUsuarioSistemaAdmin && usuarioSistemaFormAdmin.email && crearUsuarioConAcceso) {
          try {
            const rolId = Object.keys(rolesCtx).find(k => rolesCtx[k]?.nombre === usuarioSistemaFormAdmin.rol) || usuarioSistemaFormAdmin.rol;
            await crearUsuarioConAcceso({ nombre: nuevo.nombre, email: usuarioSistemaFormAdmin.email, rol: rolId, posicion_id: usuarioSistemaFormAdmin.posicion_id || null, campo: usuarioSistemaFormAdmin.acceso_campo, campoModulos: usuarioSistemaFormAdmin.acceso_campo ? [usuarioSistemaFormAdmin.perfil_campo] : [] });
            addNotificacion('Usuario de sistema creado.');
          } catch (userErr) {
            addNotificacion(`Colaborador creado. Error al crear usuario: ${userErr?.message || 'error desconocido'}`, 'warning');
          }
        }
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
    const todasSolPersona = solicitudesRRHH.filter(s => s.personal_id === sel);
    const vacPersona = todasSolPersona.filter(s => s.tipo === 'vacaciones');
    const licPersona = todasSolPersona.filter(s => ['licencia_medica','licencia_maternidad','licencia_paternidad'].includes(s.tipo));
    const solPersona = todasSolPersona.filter(s => ['permiso_con_goce','permiso_sin_goce','compensacion_horas'].includes(s.tipo));
    const bajaProductividadFicha = rrhhBajaProductividad(persona, partes, tareosAlertaHoras, periodoAlertaHoras);
    const configsAdmin = (tiposDocumentoConfig || []).filter(c => c.activo);
    const useFallbackAdmin = configsAdmin.length === 0;

    const tiposDocAdmin = tiposDocumento.filter(t => t.estado === 'activo' && (t.ambito === 'Administrativo' || t.ambito === 'Ambos'));
    
    const tipoDocOptsAdmin = useFallbackAdmin
      ? (tiposDocAdmin.length > 0 ? tiposDocAdmin : personalDocumentosService.TIPOS_DOC_ADMIN)
      : configsAdmin.map(c => ({
          id: c.tipo_doc, key: c.tipo_doc, nombre: c.tipo_doc, label: c.tipo_doc,
          exige_vencimiento: c.renovable, renovable: c.renovable,
          es_habilitante: c.es_habilitante
        }));
    const docsPersonaFicha = personalDocumentos.filter(d => d.personal_id === persona.id && (d.activo || d.estado_validacion === 'pendiente'));
    const docTipoInfoLocal = (doc) => tiposDocumento.find(t => t.id === (doc.tipo_documento_id || doc.tipo_doc)) || tipoDocOptsAdmin.find(t => (t.id || t.key) === (doc.tipo_documento_id || doc.tipo_doc));
    const esDocContratoLocal = (doc) => rrhhAdminEsDocContrato(doc, tiposDocumento) || rrhhAdminEsTipoContrato(docTipoInfoLocal(doc));
    const esDocAdendaLocal = (doc) => rrhhAdminEsTipoAdenda(docTipoInfoLocal(doc), doc.tipo_doc);
    const contratoDoc = docsPersonaFicha
      .filter(d => d.activo !== false && esDocContratoLocal(d))
      .sort((a, b) => String(b.fecha_vencimiento || b.fecha_emision || b.created_at || '').localeCompare(String(a.fecha_vencimiento || a.fecha_emision || a.created_at || '')))[0] || null;
    const contratoInfo = rrhhAdminContratoVencimientoInfo(contratoDoc);
    const tieneContratoAprobado = docsPersonaFicha.some(d => d.activo === true && d.estado_validacion === 'aprobado' && esDocContratoLocal(d));
    const contratoTipoDoc = rrhhAdminContratoTipoDocValue(tipoDocOptsAdmin);
    const docsContractuales = docsPersonaFicha
      .filter(d => esDocContratoLocal(d) || esDocAdendaLocal(d))
      .sort((a, b) => String(b.fecha_emision || b.creado_en || b.created_at || '').localeCompare(String(a.fecha_emision || a.creado_en || a.created_at || '')));
    const contratosValidados = docsContractuales.filter(d => esDocContratoLocal(d) && d.estado_validacion === 'aprobado');
    const contratosValidadosEscritura = contratosValidados.filter(d => (
      !modoVistaSociedadPersonalAdmin.sociedadIdEscritura
      || d.sociedad_id === modoVistaSociedadPersonalAdmin.sociedadIdEscritura
    ));
    const condicionesContrato = (() => {
      if (!contratoDoc) return null;
      const cond = { ...(contratoDoc.condiciones_laborales || {}) };
      const hoy = new Date().toISOString().slice(0, 10);
      const adendasAplicables = docsContractuales
        .filter(d => esDocAdendaLocal(d) && d.estado_validacion === 'aprobado' && d.contrato_referencia_id === contratoDoc.id && (!d.fecha_vigencia_cambio || d.fecha_vigencia_cambio <= hoy))
        .sort((a, b) => String(a.fecha_vigencia_cambio || a.fecha_emision || '').localeCompare(String(b.fecha_vigencia_cambio || b.fecha_emision || '')));
      adendasAplicables.forEach(d => {
        const c = d.condiciones_laborales || {};
        const cambios = d.adenda_cambios || {};
        if (cambios.cargo) { cond.cargo = c.cargo; cond.cargo_id = c.cargo_id; cond.cargo_nombre = c.cargo_nombre || c.cargo; }
        if (cambios.remuneracion) cond.remuneracion_base = c.remuneracion_base;
        if (cambios.modalidad) cond.modalidad = c.modalidad;
        if (cambios.sede) { cond.sede = c.sede; cond.sede_id = c.sede_id; cond.sede_nombre = c.sede_nombre || c.sede; }
      });
      return cond;
    })();
    const irADocumentoContrato = () => {
      setTab('documentos');
      setDocUploadForm(prev => ({ ...prev, tipoDoc: contratoTipoDoc }));
    };
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
            <span className={'badge badge-' + contratoColor(persona.tipo_contrato)}>{labelOr(TIPO_CONTRATO_LABELS, persona.tipo_contrato)}</span>
            <span className="badge badge-green">{persona.estado}</span>
            {bajaProductividadFicha && <span className="badge badge-red">Baja productividad</span>}
            {persona.usuario_bloqueado_en ? (
              <span className="badge badge-red" title={`Bloqueado el ${persona.usuario_bloqueado_en?.slice(0,10)} por ${persona.usuario_bloqueado_por || '—'}`}>Acceso bloqueado</span>
            ) : persona.auth_user_id ? (
              <span className="badge badge-green">Tiene acceso al ERP</span>
            ) : (
              <span className="badge badge-gray">Sin acceso al ERP</span>
            )}
            <button className="btn btn-ghost btn-sm" title="Editar colaborador" onClick={() => { abrirEditarColaborador(persona); setSel(null); }}>{I.edit}</button>
            <button className="btn btn-ghost btn-sm" title="Eliminar colaborador" style={{color:'var(--danger)'}} onClick={() => eliminarColaborador(persona)}>{I.trash}</button>
          </div>
        </div>

        <div className="card">
          <div style={{padding:'0 20px'}}>
            <div className="tabs">
              {[...['ficha','jornada','contrato','vacaciones','licencias','solicitudes','documentos','reembolsos','amonestaciones'], ...(persona.tiene_comisiones ? ['comisiones'] : []), ...(canFinanzasAdmin ? ['bancarios'] : [])].map(t => (
                <div key={t} className={'tab '+(tab===t?'active':'')} onClick={() => setTab(t)} style={{textTransform:'capitalize'}}>{t}</div>
              ))}
            </div>
          </div>

          {tab === 'ficha' && (
            <div className="card-body" style={{display:'flex', flexDirection:'column', gap:24}}>

              {/* Sección 1 — Datos personales */}
              <div>
                <div style={{fontWeight:600, fontSize:11, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10}}>Datos personales</div>
                <div className="grid-2" style={{gap:12}}>
                  {[
                    ['DNI', persona.dni],
                    ['Fecha de nacimiento', persona.fecha_nacimiento],
                    ['Teléfono celular', persona.telefono],
                    ['Email corporativo', persona.email],
                    ['Correo personal', persona.email_personal],
                    ['Celular / WhatsApp', persona.celular_personal],
                    ['Dirección', persona.direccion],
                    persona.nivel_estudios ? ['Nivel de estudios', persona.nivel_estudios] : null,
                    persona.especialidad ? ['Especialidad', persona.especialidad] : null,
                    persona.institucion ? ['Institución', persona.institucion] : null,
                  ].filter(Boolean).map(([label, val]) => (
                    <div key={label} style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                      <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</div>
                      <div style={{fontWeight:500, fontSize:13}}>{val || '—'}</div>
                    </div>
                  ))}
                </div>
                {(persona.contacto_emergencia || persona.telefono_emergencia) && (
                  <div style={{marginTop:12, padding:'14px 16px', background:'var(--bg-subtle)', borderRadius:8, borderLeft:'3px solid var(--orange)'}}>
                    <div className="text-muted" style={{fontSize:11, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em'}}>Contacto de emergencia</div>
                    <div style={{fontWeight:600}}>{persona.contacto_emergencia || '—'}{persona.relacion_emergencia && <span className="text-muted"> ({persona.relacion_emergencia})</span>}</div>
                    <div className="text-muted" style={{fontSize:13}}>{persona.telefono_emergencia || '—'}</div>
                  </div>
                )}
              </div>

              {/* Sección 2 — Datos laborales */}
              <div>
                <div style={{fontWeight:600, fontSize:11, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10}}>Datos laborales</div>
                <div className="grid-2" style={{gap:12}}>
                  <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                    <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>Código de empleado</div>
                    <div style={{fontWeight:500, fontSize:13}}>{persona.codigo || '—'}</div>
                  </div>
                  <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                    <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>Estado</div>
                    <span className={`badge ${persona.estado === 'activo' ? 'badge-green' : 'badge-red'}`}>{persona.estado || '—'}</span>
                  </div>
                  {[
                    ['Cargo', persona.cargo],
                    ['Área', persona.area],
                    ['Sede asignada', persona.sede],
                    ['CECO', (centrosCosto || []).find(c => c.id === persona.centro_costo_id)?.nombre || persona.centro_costo_id || null],
                    ['Turno asignado', (() => { const t = turnosOptions.find(t => t.id === persona.turno_id); return t ? `${t.nombre} (${t.hora_entrada} - ${t.hora_salida})` : null; })()],
                    ['Modalidad', labelOr(MODALIDAD_TRABAJO_LABELS, persona.modalidad)],
                    ['Fecha de ingreso', persona.fecha_ingreso],
                    ['Tipo de contrato', labelOr(TIPO_CONTRATO_LABELS, persona.tipo_contrato)],
                    persona.supervisor ? ['Supervisor directo', persona.supervisor] : null,
                  ].filter(Boolean).map(([label, val]) => (
                    <div key={label} style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                      <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</div>
                      <div style={{fontWeight:500, fontSize:13}}>{val || '—'}</div>
                    </div>
                  ))}
                  <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                    <div className="text-muted" style={{fontSize:11, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em'}}>Régimen de jornada</div>
                    <div style={{fontWeight:500, fontSize:13, marginBottom:6}}>{(() => {
                      const asig = asignacionesJornada.find(a => a.personal_id === persona.id && a.tipo_tramo === 'normal' && a.fecha_inicio <= new Date().toISOString().slice(0, 10) && (!a.fecha_fin || a.fecha_fin >= new Date().toISOString().slice(0, 10)));
                      if (!asig) return <span className="text-muted">Sin jornada asignada</span>;
                      return asig.regimen_jornada === 'general' ? labelOr(REGIMEN_JORNADA_LABELS, 'general') : `Minero ${asig.dias_ciclo_trabajo}×${asig.dias_ciclo_descanso}`;
                    })()}</div>
                    <div className="row" style={{gap:6, flexWrap:'wrap'}}>
                      <span className="badge badge-gray">Fiscalización: {fiscalizacionLabel(getTipoFiscalizacion(persona))}</span>
                      <span className="badge badge-gray">Vacaciones: {diasVacacionesPorRegimen(empresaConfig?.regimen_laboral_empresa || 'general')} días/año</span>
                    </div>
                  </div>
                  {persona.cargo_confianza && (
                    <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                      <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>Cargo especial</div>
                      <span className="badge badge-orange">Dirección o confianza</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sección 3 — Nómina y finanzas */}
              {canFinanzasAdmin && (
                <div>
                  <div style={{fontWeight:600, fontSize:11, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10}}>Nómina y finanzas</div>
                  <div className="grid-2" style={{gap:12}}>
                    {[
                      ['Sueldo base', (persona.sueldo_base != null || persona.remuneracion != null) ? `S/ ${Number(persona.sueldo_base ?? persona.remuneracion ?? 0).toLocaleString()}` : null],
                      ['Modalidad de pago', persona.metodo_pago],
                      ['Monto mensual', persona.monto_mensual != null ? `S/ ${Number(persona.monto_mensual).toLocaleString()}` : null],
                      ['Horas base del mes', persona.horas_base_mes ? `${persona.horas_base_mes} h` : null],
                      ['Tarifa por hora', persona.tarifa_hora != null ? `S/ ${Number(persona.tarifa_hora).toFixed(2)}/h` : null],
                      ['Sistema pensionario', persona.sistema_pensionario],
                      ['AFP', persona.afp_nombre],
                      ['Tipo de comisión AFP', persona.tipo_comision_afp],
                      persona.bonif_altitud > 0 ? ['Bonificación por altitud', `S/ ${Number(persona.bonif_altitud).toLocaleString()}`] : null,
                      persona.cuota_prestamo_mes > 0 ? ['Cuota préstamo mes', `S/ ${Number(persona.cuota_prestamo_mes).toLocaleString()}`] : null,
                      persona.descuento_judicial > 0 ? ['Descuento judicial', `S/ ${Number(persona.descuento_judicial).toLocaleString()}`] : null,
                    ].filter(Boolean).filter(([, val]) => val != null).map(([label, val]) => (
                      <div key={label} style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                        <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</div>
                        <div style={{fontWeight:500, fontSize:13}}>{val || '—'}</div>
                      </div>
                    ))}
                    <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                      <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>Asignación familiar</div>
                      {persona.tiene_hijos
                        ? <span className="badge badge-green">Sí — S/ {asignacionFamiliar.toFixed(2)}</span>
                        : <span className="badge badge-gray">No</span>}
                    </div>
                    {persona.modalidad_contrato === 'honorarios' && (
                      <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                        <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>Const. suspensión retenciones</div>
                        {persona.suspension_retenciones
                          ? <span className="badge badge-orange">Activa{persona.vencimiento_suspension ? ` · vence ${persona.vencimiento_suspension}` : ''}</span>
                          : <span className="badge badge-gray">No</span>}
                      </div>
                    )}
                  </div>
                  {persona.tiene_comisiones && (
                    <div style={{marginTop:12, padding:'14px 16px', background:'var(--bg-subtle)', borderRadius:8, borderLeft:'3px solid var(--cyan)'}}>
                      <div className="text-muted" style={{fontSize:11, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em'}}>Comisiones activas</div>
                      <div className="grid-2" style={{gap:8}}>
                        {[
                          ['Modalidad', persona.modalidad_comision],
                          ['Comisión base', persona.porcentaje_comision ? `${persona.porcentaje_comision}%` : null],
                          ['RUC vendedor', persona.ruc_vendedor],
                          ['Retención IR', persona.retencion_ir_comision ? `${persona.retencion_ir_comision}%` : null],
                        ].filter(([, v]) => v).map(([label, val]) => (
                          <div key={label}>
                            <div className="text-muted" style={{fontSize:11}}>{label}</div>
                            <div style={{fontWeight:500, fontSize:13}}>{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sección 4 — Datos bancarios */}
              {canFinanzasAdmin && (
                <DatosBancariosAdmin cuentas={persona.datos_bancarios ?? []} readOnly />
              )}

              {/* Sección 4.5 — Firma / Rúbrica */}
              {canGestionarDocsRrhhAdmin && (
                <div>
                  <div style={{fontWeight:600, fontSize:11, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10}}>Firma / Rúbrica</div>
                  <FileUpload
                    entidadTipo="personal_administrativo"
                    entidadId={persona.id}
                    empresaId={empresa?.id}
                    categoria={CATEGORIA_FIRMA_RUBRICA}
                    multiple={false}
                    soloImagenes
                    soloUltimo
                    subidoPor={role?.id}
                  />
                </div>
              )}

              {/* Sección 5 — Acceso al sistema */}
              <div>
                <div style={{fontWeight:600, fontSize:11, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10}}>Acceso al sistema</div>
                <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                  <div className="text-muted" style={{fontSize:11, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em'}}>Cuenta de usuario vinculada</div>
                  {persona.usuario_bloqueado_en ? (
                    <span className="badge badge-red">Acceso bloqueado</span>
                  ) : persona.auth_user_id ? (
                    <div className="row" style={{gap:8, alignItems:'center'}}>
                      <span className="badge badge-green">Tiene acceso al ERP</span>
                      {persona.email && <span className="text-muted" style={{fontSize:12}}>{persona.email}</span>}
                    </div>
                  ) : (
                    <span className="badge badge-gray">Sin acceso al ERP</span>
                  )}
                </div>
              </div>

            </div>
          )}

          {tab === 'jornada' && (() => {
            const asigsTrabajador = asignacionesJornada.filter(a => a.personal_id === persona.id).sort((a, b) => String(b.fecha_inicio).localeCompare(String(a.fecha_inicio)));
            const hoyAsignacion = new Date().toISOString().slice(0, 10);
            const asigActiva = asigsTrabajador.find(a => a.fecha_inicio <= hoyAsignacion && (!a.fecha_fin || a.fecha_fin >= hoyAsignacion));
            const tramoReferencia = asigActiva || asigsTrabajador[0] || null;
            const sumarDia = fecha => {
              if (!fecha) return '';
              const d = new Date(`${fecha}T00:00:00`);
              d.setDate(d.getDate() + 1);
              return d.toISOString().slice(0, 10);
            };
            const fechaInicioSugerida = tramoReferencia
              ? (tramoReferencia.fecha_fin ? sumarDia(tramoReferencia.fecha_fin) : tramoReferencia.fecha_inicio)
              : (persona.fecha_ingreso || '');
            // Una jornada sin fecha_fin requiere cobertura hasta un contrato
            // indefinido. Para un contrato finito se propone su vencimiento
            // como fin del tramo, sin cambiar la regla de cobertura de la RPC.
            const finContratoParaFecha = fecha => {
              if (!fecha) return null;
              const contratos = (personalDocumentos || []).map(doc => {
                const tipo = (tiposDocumento || []).find(t => t.id === doc.tipo_documento_id);
                const esContractual = Boolean(tipo?.captura_snapshot_laboral)
                  || /contrato|adenda/i.test(String(doc.tipo_doc || ''));
                return {
                  inicio: doc.periodo_fecha_inicio || doc.fecha_vigencia_cambio || doc.fecha_emision || null,
                  fin: doc.es_indefinido ? null : (doc.periodo_fecha_fin || doc.fecha_vencimiento || null),
                  esContractual,
                  estado: doc.estado_validacion,
                  periodoEstado: doc.periodo_estado || 'vigente',
                  personalId: doc.personal_id,
                  personalTipo: doc.personal_tipo,
                };
              }).filter(doc => (
                doc.personalId === persona.id
                && doc.personalTipo === 'administrativo'
                && ['aprobado', 'validado'].includes(doc.estado)
                && !['rechazado', 'anulado'].includes(doc.periodoEstado)
                && doc.esContractual
                && doc.inicio <= fecha
                && (!doc.fin || doc.fin >= fecha)
              )).sort((a, b) => String(b.fin || '9999-12-31').localeCompare(String(a.fin || '9999-12-31')));
              return contratos[0]?.fin || null;
            };
            const finContratoSugerido = finContratoParaFecha(formAsigAdmin.fecha_inicio);
            const presets = {
              general: { regimen:'general', trabajo:null, descanso:null, label:'Jornada general' },
              minero_14x7: { regimen:'ciclo_acumulativo', trabajo:14, descanso:7, label:'Minero 14×7' },
              minero_20x10: { regimen:'ciclo_acumulativo', trabajo:20, descanso:10, label:'Minero 20×10' },
              minero_28x14: { regimen:'ciclo_acumulativo', trabajo:28, descanso:14, label:'Minero 28×14' },
              minero_2x1: { regimen:'ciclo_acumulativo', trabajo:2, descanso:1, label:'Minero 2×1' },
            };
            const presetDeAsignacion = a => {
              if (!a || a.regimen_jornada === 'general') return 'general';
              return ({ '14x7':'minero_14x7', '20x10':'minero_20x10', '28x14':'minero_28x14', '2x1':'minero_2x1' })[`${Number(a.dias_ciclo_trabajo)}x${Number(a.dias_ciclo_descanso)}`] || 'general';
            };
            const fechaAnteriorATramoVigente = Boolean(asigActiva?.fecha_inicio && formAsigAdmin.fecha_inicio && formAsigAdmin.fecha_inicio < asigActiva.fecha_inicio);
            const guardarAsignacion = async (override = {}) => {
              if (!formAsigAdmin.fecha_inicio) {
                const mensaje = 'La fecha de inicio es obligatoria.';
                setFormAsigAdminError(mensaje); addNotificacion(mensaje, 'error'); return;
              }
              if (formAsigAdmin.fecha_fin && formAsigAdmin.fecha_fin < formAsigAdmin.fecha_inicio) {
                const mensaje = 'La fecha de fin no puede ser anterior a la fecha de inicio.';
                setFormAsigAdminError(mensaje); addNotificacion(mensaje, 'error'); return;
              }
              if (finContratoSugerido && !formAsigAdmin.fecha_fin) {
                const mensaje = `Este contrato vence el ${finContratoSugerido}. Registra una fecha de fin para la jornada.`;
                setFormAsigAdminError(mensaje); addNotificacion(mensaje, 'error'); return;
              }
              const preset = presets[formAsigAdmin.regimen_jornada];
              if (!preset) {
                const mensaje = 'Selecciona un régimen de jornada válido.';
                setFormAsigAdminError(mensaje); addNotificacion(mensaje, 'error'); return;
              }
              if (preset.regimen === 'ciclo_acumulativo' && !formAsigAdmin.fecha_inicio_ciclo) {
                const mensaje = 'Completa la fecha de inicio del ciclo.';
                setFormAsigAdminError(mensaje); addNotificacion(mensaje, 'error'); return;
              }
              const eliminarAsigAdmin = async (id, overrideOpts) => {
                if (!confirm('¿Estás seguro de eliminar el tramo actual (el más reciente) de este trabajador?')) return;
                const forzarOverride = overrideOpts?.forzarOverride || false;
                const motivoOverride = overrideOpts?.motivoOverride || null;
                setDeletingAsigAdminId(id); setRetroWallDeleteAsigAdmin(null);
                try {
                  await eliminarAsignacionJornadaCtx(id, forzarOverride, motivoOverride);
                  setDeletingAsigAdminId(null);
                  setRetroWallDeleteAsigAdmin(null); setRetroWallMotivoDeleteAsigAdmin('');
                  addNotificacion('Tramo de jornada eliminado.');
                } catch (e) {
                  setDeletingAsigAdminId(null);
                  const msg = e.message || '';
                  if (msg.startsWith('RETRO_WALL_PERMISO:')) addNotificacion(msg.replace('RETRO_WALL_PERMISO:', '').trim(), 'error');
                  else if (msg.startsWith('RETRO_WALL:')) setRetroWallDeleteAsigAdmin(msg.replace('RETRO_WALL:', '').trim());
                  else addNotificacion(msg || 'Error al eliminar asignación.', 'error');
                }
              };
              setSavingAsigAdmin(true); setRetroWallAsigAdmin(null); setFormAsigAdminError('');
              try {
                await crearAsignacionJornadaCtx(persona.id, 'administrativo', {
                  ...formAsigAdmin,
                  fecha_inicio: !asigActiva ? fechaInicioSugerida : formAsigAdmin.fecha_inicio,
                  tipo_tramo: 'normal',
                  regimen_jornada: preset.regimen,
                  dias_ciclo_trabajo: preset.trabajo,
                  dias_ciclo_descanso: preset.descanso,
                  fecha_inicio_ciclo: preset.regimen === 'ciclo_acumulativo' ? formAsigAdmin.fecha_inicio_ciclo : null,
                  forzar_override: Boolean(override.forzarOverride),
                  motivo_override: override.motivoOverride || null,
                });
                setShowFormAsigAdmin(false);
                setFormAsigAdmin({ fecha_inicio:'', fecha_fin:'', regimen_jornada:'general', fecha_inicio_ciclo:'', motivo:'' });
                setRetroWallAsigAdmin(null); setRetroWallMotivoAsigAdmin('');
                addNotificacion('Asignación de jornada registrada.');
              } catch (error) {
                const msg = error?.message || '';
                if (msg.startsWith('RETRO_WALL_PERMISO:')) addNotificacion(msg.replace('RETRO_WALL_PERMISO:', '').trim(), 'error');
                else if (msg.startsWith('RETRO_WALL:')) setRetroWallAsigAdmin(msg.replace('RETRO_WALL:', '').trim());
                else {
                  const mensaje = msg || 'Error al guardar asignación.';
                  setFormAsigAdminError(mensaje); addNotificacion(mensaje, 'error');
                }
              } finally { setSavingAsigAdmin(false); }
            };
            return <div className="card-body">
              <div style={{display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', marginBottom:16}}>
                <div>
                  <div style={{fontWeight:600, marginBottom:4}}>Asignación vigente</div>
                  {asigActiva
                    ? <div><span className="badge badge-blue">{presets[presetDeAsignacion(asigActiva)]?.label || asigActiva.regimen_jornada}</span><span className="text-muted" style={{fontSize:12, marginLeft:8}}>desde {asigActiva.fecha_inicio}</span></div>
                    : <div className="text-muted" style={{fontSize:13}}>Sin jornada asignada.</div>}
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => {
                  setShowFormAsigAdmin(v => !v); setRetroWallAsigAdmin(null); setRetroWallMotivoAsigAdmin(''); setFormAsigAdminError('');
                  setFormAsigAdmin(f => ({ ...f, fecha_inicio: fechaInicioSugerida, fecha_fin: finContratoParaFecha(fechaInicioSugerida) || '', regimen_jornada: asigActiva ? presetDeAsignacion(asigActiva) : 'general', fecha_inicio_ciclo: asigActiva?.fecha_inicio_ciclo || '' }));
                }}>+ Nueva asignación</button>
              </div>

              {showFormAsigAdmin && <div className="card" style={{padding:16, marginBottom:20, background:'rgba(6,182,212,0.04)', border:'1px solid var(--cyan)'}}>
                <div className="grid-2" style={{gap:12}}>
                  <div className="input-group"><label>Fecha de inicio {!asigActiva && <span className="text-muted" style={{fontWeight:'normal'}}>(obligatoria por continuidad)</span>}</label><input className="input" type="date" disabled={!asigActiva} value={formAsigAdmin.fecha_inicio} onChange={e => { const fecha = e.target.value; setFormAsigAdmin(f => ({...f, fecha_inicio:fecha, fecha_fin:f.fecha_fin || finContratoParaFecha(fecha) || ''})); setFormAsigAdminError(''); }} /></div>
                  <div className="input-group"><label>Fecha de fin {finContratoSugerido ? <span className="text-muted">(propuesta: vence contrato {finContratoSugerido})</span> : <span className="text-muted">(opcional)</span>}</label><input className="input" type="date" min={formAsigAdmin.fecha_inicio || undefined} value={formAsigAdmin.fecha_fin} onChange={e => { setFormAsigAdmin(f => ({...f, fecha_fin:e.target.value})); setFormAsigAdminError(''); }} /></div>
                  {formAsigAdmin.fecha_fin && formAsigAdmin.fecha_inicio && formAsigAdmin.fecha_fin < formAsigAdmin.fecha_inicio && <div className="alert alert-danger" style={{gridColumn:'1/-1', fontSize:12, margin:0}}>La fecha de fin debe ser igual o posterior a la fecha de inicio.</div>}
                  {fechaAnteriorATramoVigente && <div className="alert alert-warning" style={{gridColumn:'1/-1', fontSize:12, margin:0}}>Esta fecha queda antes del tramo vigente actual ({asigActiva.fecha_inicio}). Es una advertencia: si el período tiene nómina procesada, el retro wall pedirá justificación y autorización al guardar.</div>}
                  <div className="input-group"><label>Régimen de jornada</label><select className="select" value={formAsigAdmin.regimen_jornada} onChange={e => setFormAsigAdmin(f => ({...f, regimen_jornada:e.target.value, fecha_inicio_ciclo:e.target.value === 'general' ? '' : f.fecha_inicio_ciclo}))}>
                    {Object.entries(presets).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
                  </select></div>
                  {formAsigAdmin.regimen_jornada !== 'general' && <>
                    <div className="input-group"><label>Patrón fijo</label><input className="input" readOnly value={`${presets[formAsigAdmin.regimen_jornada]?.trabajo || ''} trabajo / ${presets[formAsigAdmin.regimen_jornada]?.descanso || ''} descanso`} /></div>
                    <div className="input-group"><label>Fecha inicio de ciclo</label><input className="input" type="date" value={formAsigAdmin.fecha_inicio_ciclo} onChange={e => setFormAsigAdmin(f => ({...f, fecha_inicio_ciclo:e.target.value}))} /></div>
                  </>}
                  <div className="input-group" style={{gridColumn:'1/-1'}}><label>Motivo <span className="text-muted">(opcional)</span></label><input className="input" value={formAsigAdmin.motivo} onChange={e => setFormAsigAdmin(f => ({...f, motivo:e.target.value}))} /></div>
                </div>
                {formAsigAdminError && <div className="alert alert-danger" style={{fontSize:12, marginTop:12}}>{formAsigAdminError}</div>}
                {retroWallAsigAdmin && <div style={{fontSize:12, background:'var(--bg-subtle)', border:'1px solid var(--danger)', borderRadius:8, padding:12, marginTop:12}}>
                  <div style={{color:'var(--danger)', fontWeight:600, marginBottom:6}}>Cambio bloqueado por nómina ya procesada</div><div>{retroWallAsigAdmin}</div>
                  <div className="input-group" style={{marginTop:8}}><label>Justificación para forzar el cambio (obligatoria)</label><textarea className="input" rows={2} value={retroWallMotivoAsigAdmin} onChange={e => setRetroWallMotivoAsigAdmin(e.target.value)} /></div>
                  <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:8}}><button className="btn btn-secondary btn-sm" onClick={() => { setRetroWallAsigAdmin(null); setRetroWallMotivoAsigAdmin(''); }}>Cancelar</button><button className="btn btn-danger btn-sm" disabled={savingAsigAdmin || !retroWallMotivoAsigAdmin.trim()} onClick={() => guardarAsignacion({forzarOverride:true, motivoOverride:retroWallMotivoAsigAdmin.trim()})}>Forzar cambio (requiere autorización)</button></div>
                </div>}
                <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:12}}><button className="btn btn-secondary btn-sm" onClick={() => { setShowFormAsigAdmin(false); setFormAsigAdminError(''); }}>Cancelar</button><button className="btn btn-primary btn-sm" onClick={() => guardarAsignacion()} disabled={savingAsigAdmin}>{savingAsigAdmin ? 'Guardando...' : 'Guardar asignación'}</button></div>
              </div>}

              {retroWallDeleteAsigAdmin && <div style={{fontSize:12, background:'var(--bg-subtle)', border:'1px solid var(--danger)', borderRadius:8, padding:12, marginTop:12, marginBottom:16}}>
                <div style={{color:'var(--danger)', fontWeight:600, marginBottom:6}}>Eliminación bloqueada por nómina ya procesada</div><div>{retroWallDeleteAsigAdmin}</div>
                <div className="input-group" style={{marginTop:8}}><label>Justificación para forzar la eliminación (obligatoria)</label><textarea className="input" rows={2} value={retroWallMotivoDeleteAsigAdmin} onChange={e => setRetroWallMotivoDeleteAsigAdmin(e.target.value)} /></div>
                <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:8}}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setRetroWallDeleteAsigAdmin(null); setRetroWallMotivoDeleteAsigAdmin(''); setDeletingAsigAdminId(null); }}>Cancelar</button>
                  <button className="btn btn-danger btn-sm" disabled={!deletingAsigAdminId || !retroWallMotivoDeleteAsigAdmin.trim()} onClick={() => eliminarAsigAdmin(deletingAsigAdminId, {forzarOverride:true, motivoOverride:retroWallMotivoDeleteAsigAdmin.trim()})}>Forzar eliminación (requiere autorización)</button>
                </div>
              </div>}

              <div style={{fontWeight:600, marginBottom:8}}>Historial</div>
              {asigsTrabajador.length === 0 ? <div className="text-muted" style={{fontSize:13}}>Sin jornada asignada.</div> : <div className="table-wrap"><table className="tbl" style={{fontSize:12, width:'100%'}}><thead><tr><th>Desde</th><th>Hasta</th><th>Régimen</th><th>Ciclo</th><th>Motivo</th><th>Acciones</th></tr></thead><tbody>{asigsTrabajador.map((a, i) => { const isVigente = i === 0; return <tr key={a.id}><td>{a.fecha_inicio}</td><td>{a.fecha_fin || <span className="badge badge-green" style={{fontSize:10}}>Vigente</span>}</td><td>{presets[presetDeAsignacion(a)]?.label || a.regimen_jornada}</td><td>{a.regimen_jornada === 'ciclo_acumulativo' ? `${a.dias_ciclo_trabajo}×${a.dias_ciclo_descanso} · inicio ${a.fecha_inicio_ciclo || '—'}` : '—'}</td><td className="text-muted">{a.motivo || '—'}</td><td>{isVigente && <button className="btn btn-danger btn-sm" onClick={() => eliminarAsigAdmin(a.id)} disabled={deletingAsigAdminId === a.id} style={{padding:'2px 8px', fontSize:11}}>{deletingAsigAdminId === a.id ? 'Eliminando...' : 'Eliminar'}</button>}</td></tr>; })}</tbody></table></div>}
            </div>;
          })()}

          {tab === 'contrato' && (
            <div className="card-body">
              {!tieneContratoAprobado && (
                <div style={{marginBottom:16, padding:'14px 16px', background: persona.cargo_confianza ? 'var(--bg-subtle)' : 'rgba(229,62,62,0.08)', border:`1px solid ${persona.cargo_confianza ? 'var(--border)' : 'rgba(229,62,62,0.3)'}`, borderRadius:8}}>
                  {persona.cargo_confianza ? (
                    <div style={{fontSize:13, color:'var(--fg-muted)'}}>Este colaborador tiene cargo de dirección o confianza — no requiere contrato digital para el control de asistencia. Se recomienda igualmente registrar el contrato para trazabilidad.</div>
                  ) : (
                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
                      <div>
                        <div style={{fontWeight:600, fontSize:13, color:'var(--danger)', marginBottom:4}}>Sin contrato digital registrado</div>
                        <div style={{fontSize:12, color:'var(--fg-muted)'}}>La asistencia está bloqueada hasta que RRHH suba y valide el contrato en la pestaña Documentos.</div>
                      </div>
                      <button type="button" className="btn btn-sm btn-primary" onClick={irADocumentoContrato}>Ir a Documentos → Subir contrato</button>
                    </div>
                  )}
                </div>
              )}
              <div className="grid-2" style={{gap:16}}>
                {[
                  ['Tipo de contrato', condicionesContrato ? labelOr(TIPO_CONTRATO_LABELS, condicionesContrato.tipo_contrato) : null],
                  ['Fecha de ingreso', persona.fecha_ingreso],
                  ['Cargo vigente', condicionesContrato ? (condicionesContrato.cargo_nombre || condicionesContrato.cargo) : null],
                  ['Remuneración vigente', condicionesContrato ? (canFinanzasAdmin ? `S/ ${Number(condicionesContrato.remuneracion_base || 0).toLocaleString()}` : '***') : null],
                  ['Régimen de jornada vigente', condicionesContrato ? labelOr(REGIMEN_JORNADA_LABELS, condicionesContrato.regimen_jornada) : null],
                  ['Modalidad vigente', condicionesContrato ? labelOr(MODALIDAD_TRABAJO_LABELS, condicionesContrato.modalidad) : null],
                  ['Sede vigente', condicionesContrato ? (condicionesContrato.sede_nombre || condicionesContrato.sede) : null],
                  ['Área vigente', condicionesContrato ? ((areasEmpresa.find(a => a.id === condicionesContrato.area_id)?.nombre) || condicionesContrato.area_nombre || condicionesContrato.area || null) : null],
                  ['Contrato digital', contratoDoc ? (contratoDoc.nombre_archivo || contratoDoc.nombre || contratoDoc.tipo_doc_nombre || 'Contrato') : 'Sin contrato digital'],
                  ['Fecha inicio contrato', contratoDoc?.fecha_emision || '—'],
                  ['Vencimiento contrato', contratoDoc?.fecha_vencimiento || '—'],
                ].map(([label, val]) => (
                  <div key={label} style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8}}>
                    <div className="text-muted" style={{fontSize:11, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</div>
                    <div style={{fontWeight:500, fontSize:13}}>{val || '—'}</div>
                  </div>
                ))}
              </div>
              {(
                <div style={{marginTop:16, padding:14, background:'var(--bg-subtle)', border:'1px solid var(--border)', borderRadius:8}} className="row">
                  <span className={`badge ${contratoInfo.badge}`}>{contratoInfo.texto}</span><button type="button" className="btn btn-ghost btn-sm" onClick={irADocumentoContrato}>{contratoDoc ? 'Ver documento' : 'Subir contrato'}</button>
                </div>
              )}
              {(() => {
                const diasContratoVigente = (contratoDoc?.fecha_vencimiento && contratoInfo.dias !== null)
                  ? contratoInfo.dias
                  : null;
                if (diasContratoVigente !== null && diasContratoVigente <= 30) {
                  const texto = diasContratoVigente < 0
                    ? `Este contrato venció hace ${Math.abs(diasContratoVigente)} días.`
                    : diasContratoVigente === 0
                    ? 'Este contrato vence hoy.'
                    : `Este contrato vence en ${diasContratoVigente} días.`;
                  return (
                    <div style={{marginTop:14, padding:'10px 14px', background:'rgba(255,160,0,0.08)', border:'1px solid var(--orange)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                      <div style={{fontSize:12, color:'var(--orange)', fontWeight:500}}>⚡ {texto} ¿Deseas preparar la renovación?</div>
                      <button type="button" className="btn btn-ghost btn-sm" style={{color:'var(--orange)', flexShrink:0}} onClick={irADocumentoContrato}>→ Nuevo contrato</button>
                    </div>
                  );
                }
                return null;
              })()}
              <div style={{marginTop:24}}>
                <div style={{fontWeight:600, fontSize:12, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10}}>Línea de tiempo contractual</div>
                {(() => {
                  const historialContractual = personalDocumentos.filter(d => d.personal_id === persona.id && (esDocContratoLocal(d) || esDocAdendaLocal(d)));
                  if (historialContractual.length === 0) {
                    return (
                      <div style={{padding:20, textAlign:'center', border:'1px dashed var(--border)', borderRadius:8}}>
                        <div className="text-muted" style={{fontSize:13, marginBottom:10}}>Sin contrato digital registrado</div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={irADocumentoContrato}>Subir contrato</button>
                      </div>
                    );
                  }

                  const hoy = new Date().toISOString().slice(0, 10);
                  
                  // Agrupar por periodo_grupo_id
                  const periodosMap = {};
                  const sinGrupo = [];
                  
                  historialContractual.forEach(d => {
                    if (!d.periodo_grupo_id) {
                      sinGrupo.push(d);
                      return;
                    }
                    if (!periodosMap[d.periodo_grupo_id]) {
                      periodosMap[d.periodo_grupo_id] = {
                        id: d.periodo_grupo_id,
                        docs: [],
                        activo: false,
                        fechaInicio: d.fecha_emision || 'Sin fecha',
                        fechaFin: d.fecha_vencimiento || 'Sin fecha'
                      };
                    }
                    periodosMap[d.periodo_grupo_id].docs.push(d);
                    if (d.activo) periodosMap[d.periodo_grupo_id].activo = true;
                    // Mantenemos la fecha del documento representativo
                    if (!periodosMap[d.periodo_grupo_id].docRepresentativo || (d.version > (periodosMap[d.periodo_grupo_id].docRepresentativo.version || 0))) {
                        periodosMap[d.periodo_grupo_id].docRepresentativo = d;
                        periodosMap[d.periodo_grupo_id].fechaInicio = d.fecha_emision || periodosMap[d.periodo_grupo_id].fechaInicio;
                        periodosMap[d.periodo_grupo_id].fechaFin = d.fecha_vencimiento || periodosMap[d.periodo_grupo_id].fechaFin;
                    }
                  });

                  const hoyStr = new Date().toISOString().slice(0, 10);
                  Object.values(periodosMap).forEach(g => {
                    const tieneActivoAprobado = g.docs.some(v => v.activo && v.estado_validacion === 'aprobado');
                    const fVenc = g.fechaFin !== 'Sin fecha' ? g.fechaFin : null;
                    const fIni = g.fechaInicio !== 'Sin fecha' ? g.fechaInicio : null;

                    if (fIni && fIni > hoyStr) {
                      g.badge_color = 'badge-cyan';
                      g.badge_texto = `Futuro · inicia ${fIni}`;
                    } else if (fVenc && fVenc < hoyStr && !g.activo) {
                      g.badge_color = 'badge-gray';
                      g.badge_texto = 'Archivado';
                    } else if ((!fVenc || fVenc >= hoyStr) && tieneActivoAprobado) {
                      g.badge_color = 'badge-green';
                      g.badge_texto = 'Período activo';
                    } else {
                      g.badge_color = 'badge-orange';
                      g.badge_texto = 'Pendiente de activación';
                    }
                  });

                  const periodos = Object.values(periodosMap).sort((a, b) => {
                    if (a.activo && !b.activo) return -1;
                    if (b.activo && !a.activo) return 1;
                    return (b.fechaInicio || '').localeCompare(a.fechaInicio || '');
                  });

                  return (
                    <div style={{display:'flex', flexDirection:'column', gap:12}}>
                      {periodos.map(periodo => {
                        const esVigente = periodo.activo;
                        const rangoLabel = [periodo.fechaInicio, periodo.fechaFin].filter(Boolean).join(' → ') || 'Sin fechas';
                        
                        return (
                          <details key={periodo.id} open={esVigente} style={{border:'1px solid var(--border)', borderRadius:8, overflow:'hidden'}}>
                            <summary style={{padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:8, userSelect:'none', background: esVigente ? 'var(--bg-subtle)' : 'transparent'}}>
                              <span className={`badge ${periodo.badge_color}`}>{periodo.badge_texto}</span>
                              <span style={{fontSize:12, color:'var(--fg-muted)'}}>{rangoLabel}</span>
                            </summary>
                            <div style={{padding:'0 14px 12px', display:'flex', flexDirection:'column', gap:8}}>
                              {periodo.docs.sort((a, b) => (b.version || 0) - (a.version || 0)).map(doc => {
                                const tieneSnapshot = Boolean(doc.condiciones_laborales && Object.keys(doc.condiciones_laborales).length > 0);
                                const resumen = tieneSnapshot ? rrhhAdminContratoResumen(doc, null, tiposDocumento) : 'Condiciones no registradas — documento previo al sistema';
                                const esAdenda = esDocAdendaLocal(doc);
                                const badgeStr = esAdenda ? 'Adenda' : `Contrato v${doc.version || 1}${doc.es_correccion ? ' (corrección)' : ''}`;
                                
                                return (
                                  <div key={doc.id} style={{padding:'10px 12px', border:'1px solid var(--border)', borderRadius:6, display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', background: tieneSnapshot ? 'transparent' : 'var(--bg-subtle)'}}>
                                    <div>
                                      <div className="row" style={{gap:6, marginBottom:3}}>
                                        <span className={`badge ${esAdenda ? 'badge-cyan' : 'badge-green'}`}>{badgeStr}</span>
                                        <span className="text-muted" style={{fontSize:11}}>{doc.fecha_emision || 'Sin emisión'}</span>
                                        <span className={'badge ' + (personalDocumentosService.BADGE_VALIDACION[doc.estado_validacion] || 'badge-gray')}>{doc.estado_validacion}</span>
                                        {doc.activo && <span className="badge badge-green" style={{fontSize:10}}>Activo</span>}
                                      </div>
                                      <div style={{fontSize:12, fontWeight: tieneSnapshot ? 500 : 400, color: tieneSnapshot ? 'var(--fg)' : 'var(--fg-muted)'}}>{resumen}</div>
                                      {doc.fecha_vigencia_cambio && (() => {
                                        const esFutura = doc.fecha_vigencia_cambio > hoy;
                                        return (
                                          <div style={{fontSize:11, marginTop:3, color: esFutura ? 'var(--orange)' : 'var(--fg-muted)'}}>
                                            {esFutura ? `Entra en vigor el ${doc.fecha_vigencia_cambio}` : `Vigente desde: ${doc.fecha_vigencia_cambio}`}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setTab('documentos'); setDocHighlightTipo(doc.tipo_documento_id || doc.tipo_doc); }}>Ver</button>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                      
                      {sinGrupo.length > 0 && (
                        <div style={{marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)'}}>
                          <div style={{fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', marginBottom: 12}}>Documentos anteriores</div>
                          <div style={{display:'flex', flexDirection:'column', gap:8}}>
                            {sinGrupo.sort((a, b) => String(b.fecha_emision || b.creado_en || '').localeCompare(String(a.fecha_emision || a.creado_en || ''))).map(doc => {
                                const tieneSnapshot = Boolean(doc.condiciones_laborales && Object.keys(doc.condiciones_laborales).length > 0);
                                const resumen = tieneSnapshot ? rrhhAdminContratoResumen(doc, null, tiposDocumento) : 'Condiciones no registradas — documento previo al sistema';
                                const esAdenda = esDocAdendaLocal(doc);
                                const badgeStr = esAdenda ? 'Adenda' : `Contrato v${doc.version || 1}${doc.es_correccion ? ' (corrección)' : ''}`;
                                
                                return (
                                  <div key={doc.id} style={{padding:'10px 12px', border:'1px solid var(--border)', borderRadius:6, display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', opacity: 0.8, background: 'var(--bg-subtle)'}}>
                                    <div>
                                      <div className="row" style={{gap:6, marginBottom:3}}>
                                        <span className={`badge ${esAdenda ? 'badge-cyan' : 'badge-gray'}`}>{badgeStr}</span>
                                        <span className="text-muted" style={{fontSize:11}}>{doc.fecha_emision || 'Sin emisión'}</span>
                                        <span className={'badge badge-gray'}>{doc.estado_validacion}</span>
                                      </div>
                                      <div style={{fontSize:12, color: 'var(--fg-muted)'}}>{resumen}</div>
                                    </div>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setTab('documentos'); setDocHighlightTipo(doc.tipo_documento_id || doc.tipo_doc); }}>Ver</button>
                                  </div>
                                );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {tab === 'vacaciones' && (
            <>
              <div className="card-body" style={{paddingBottom:0}}>
                <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16}}>
                  <div className="kpi-card" style={{padding:16}}>
                    <div className="kpi-label">Días disponibles</div>
                    <div className="kpi-value" style={{color:'var(--green)'}}>{computarSaldoVacaciones(persona.fecha_ingreso||null, persona.dias_vacaciones_total??30, vacPersona).saldo}</div>
                  </div>
                  <div className="kpi-card" style={{padding:16}}>
                    <div className="kpi-label">Días usados</div>
                    <div className="kpi-value">{computarSaldoVacaciones(persona.fecha_ingreso||null, persona.dias_vacaciones_total??30, vacPersona).usados}</div>
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
                        <td style={{textTransform:'capitalize'}}>{(v.tipo||'').replace(/_/g,' ')}</td>
                        <td>{v.fecha_inicio}</td><td>{v.fecha_fin}</td>
                        <td className="num">{v.dias_habiles ?? v.dias}</td>
                        <td className="text-muted">{v.motivo}</td>
                        <td><span className={'badge badge-'+(v.estado==='confirmada_rrhh'||v.estado==='activa'?'green':v.estado==='enviada'||v.estado==='aprobada_jefe'?'orange':'red')}>{(v.estado||'').replace(/_/g,' ')}</span></td>
                        <td>{v.estado === 'enviada' && <button className="btn btn-sm btn-primary" onClick={() => aprobarVacacion(v.id)}>Aprobar</button>}</td>
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
                      <td style={{textTransform:'capitalize'}}>{(l.tipo||'').replace(/_/g,' ')}</td>
                      <td>{l.fecha_inicio}</td><td>{l.fecha_fin}</td>
                      <td className="num">{l.dias_habiles ?? l.dias}</td>
                      <td className="text-muted">{l.motivo}</td>
                      <td>{l.documento_url ? <a href={l.documento_url} target="_blank" rel="noreferrer" className="badge badge-cyan">{I.file} Ver</a> : <span className="text-subtle">—</span>}</td>
                      <td><span className={'badge badge-'+(l.estado==='confirmada_rrhh'||l.estado==='activa'?'green':l.estado==='enviada'?'orange':'red')}>{(l.estado||'').replace(/_/g,' ')}</span></td>
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
                      <td style={{textTransform:'capitalize'}}>{(s.tipo||'').replace(/_/g,' ')}</td>
                      <td>{s.motivo}</td>
                      <td>{s.fecha_inicio}{s.fecha_fin && s.fecha_fin !== s.fecha_inicio ? ` – ${s.fecha_fin}` : ''}</td>
                      <td><span className={'badge badge-'+(s.estado==='confirmada_rrhh'||s.estado==='activa'?'green':s.estado==='enviada'||s.estado==='aprobada_jefe'?'orange':'red')}>{(s.estado||'').replace(/_/g,' ')}</span></td>
                      <td className="text-muted">{s.dias_habiles ? `${s.dias_habiles} días` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'documentos' && (() => {
            const docsPersona = personalDocumentos.filter(d => d.personal_id === persona.id && (d.activo || d.estado_validacion === 'pendiente'));
            const DOC_LBL = { vigente:'Cargado / Validado', por_vencer:'Por vencer', vencido:'Vencido', en_revision:'En revisión', rechazado:'Rechazado', falta:'Falta', incompleto:'Sin fecha de vencimiento', historico:'Histórico' };
            const DOC_BDG = { vigente:'badge-green', por_vencer:'badge-orange', vencido:'badge-red', en_revision:'badge-cyan', rechazado:'badge-red', falta:'badge-gray', incompleto:'badge-orange', historico:'badge-gray' };
            // Fuente unica: RPC calcular_habilitaciones_personal (ver habilitacionesAdmin arriba).
            const habPersona = habilitacionesAdmin[persona.id] || { estado_global: 'sin_cargo', docs: [], tiene_cargo: false };
            const docReqPorTipo = Object.fromEntries(habPersona.docs.map(d => [d.tipo_documento_id, d]));
            const reqPendientes = habPersona.docs.filter(r => r.estado === 'falta' && r.obligatorio).length;

            const abrirDocUrl = async (doc, req) => {
              if (req) { abrirPreviewDocumentoAdmin(req, persona); return; }
              try {
                const ref = doc.storage_path || doc.archivo_url;
                const url = ref ? await personalDocumentosService.renovarUrlDocumento(ref) : null;
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
              } catch { if (doc.archivo_url) window.open(doc.archivo_url, '_blank', 'noopener,noreferrer'); }
            };

            const handleSubirInline = async (e, overrideOpts) => {
              e?.preventDefault?.();
              if (!inlineUploadReq) return;
              const inlineEsContrato = rrhhAdminEsTipoContrato(inlineUploadReq.tipo);
              const inlineEsAdenda = rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id);
              if (inlineEsAdenda && !inlineUploadForm.contratoReferenciaId) { setInlineUploadError('Selecciona el contrato original que modifica la adenda.'); return; }
              if (empresa?.multisociedad_habilitado && inlineEsContrato && !inlineUploadForm.sociedadId) { setInlineUploadError('Selecciona la sociedad empleadora.'); return; }
              const esCorreccion = inlineUploadForm.modoSubida === 'corregir' && inlineUploadReq.doc;
              const esNuevoContrato = inlineUploadForm.modoSubida === 'nuevo_contrato';
              if (inlineUploadReq.tipo?.exige_vencimiento && !inlineEsAdenda && !inlineUploadForm.esIndefinido && !inlineUploadForm.fechaVencimiento) {
                setInlineUploadError('Este tipo exige fecha de vencimiento o marcarlo como indefinido.'); return;
              }
              if (!esCorreccion && !inlineUploadFile) { setInlineUploadError('Selecciona el archivo.'); return; }
              const forzarOverride = overrideOpts?.forzarOverride || false;
              const motivoOverride = overrideOpts?.motivoOverride || null;
              setInlineUploading(true); setInlineUploadError(''); setRetroWallInline(null);
              try {
                const cargoSeleccionado = cargos.find(c => c.id === inlineUploadForm.cargoIdFirma);
                const sedeSeleccionada = sedes.find(s => s.id === inlineUploadForm.sedeIdFirma);
                const areaSeleccionada = areasEmpresa.find(a => a.id === inlineUploadForm.areaIdFirma);
                const condicionesLaborales = (inlineEsContrato || inlineEsAdenda) ? rrhhAdminSnapshotLaboral(persona, {
                  cargo: cargoSeleccionado?.nombre || inlineUploadForm.cargoFirma || persona.cargo,
                  cargo_id: inlineUploadForm.cargoIdFirma || persona.cargo_id,
                  cargo_nombre: cargoSeleccionado?.nombre || inlineUploadForm.cargoFirma || persona.cargo,
                  remuneracion_base: Number(inlineUploadForm.remuneracionFirma) || persona.sueldo_base || persona.remuneracion || 0,
                  modalidad: inlineUploadForm.modalidadFirma || '',
                  sede: sedeSeleccionada?.nombre || inlineUploadForm.sedeFirma || persona.sede,
                  sede_id: inlineUploadForm.sedeIdFirma || persona.sede_id,
                  sede_nombre: sedeSeleccionada?.nombre || inlineUploadForm.sedeFirma || persona.sede,
                  area_id: areaSeleccionada?.id || '',
                  area_nombre: areaSeleccionada?.nombre || inlineUploadForm.areaNombreFirma || persona.area || '',
                  regimen_jornada: inlineUploadForm.regimenJornadaFirma || persona.regimen_jornada || 'general',
                  tipo_contrato: inlineUploadForm.tipoContratoFirma || persona.tipo_contrato || '',
                  descripcion_cambio: inlineUploadForm.descripcionCambio || '',
                }) : {};
                const sociedadDocumento = inlineEsAdenda
                  ? contratosValidados.find(d => d.id === inlineUploadForm.contratoReferenciaId)?.sociedad_id
                  : inlineUploadForm.sociedadId;
                if (esNuevoContrato) {
                  await nuevoContratoPeriodoCtx({
                    personalId: persona.id, personalTipo: 'administrativo',
                    tipoDoc: inlineUploadReq.tipo_documento_id,
                    tipoDocumentoId: inlineUploadReq.tipo_documento_id,
                    file: inlineUploadFile,
                    fechaEmision: inlineUploadForm.fechaEmision || null,
                    fechaVencimiento: inlineUploadForm.esIndefinido ? null : (inlineUploadForm.fechaVencimiento || null),
                    esIndefinido: inlineUploadForm.esIndefinido,
                    notas: inlineUploadForm.notas || null,
                    condicionesLaborales,
                    periodoIdAnterior: inlineUploadForm.periodoIdAnterior || null,
                    sociedadId: sociedadDocumento || null,
                    forzarOverride, motivoOverride,
                  });
                  addNotificacion('Nuevo contrato creado. El período anterior quedó archivado.');
                } else if (esCorreccion) {
                  await corregirDocumentoPersonalCtx({
                    documentoId: inlineUploadReq.doc.id,
                    file: inlineUploadFile || null,
                    fechaEmision: inlineUploadForm.fechaEmision || null,
                    fechaVencimiento: inlineUploadForm.fechaVencimiento || null,
                    condicionesLaborales: (inlineEsContrato || inlineEsAdenda) ? condicionesLaborales : null,
                    notas: inlineUploadForm.notas || null,
                    esIndefinido: inlineUploadForm.esIndefinido,
                    personalId: persona.id,
                    personalTipo: 'administrativo',
                    tipoDoc: inlineUploadReq.tipo_documento_id,
                    sociedadId: inlineEsContrato ? (sociedadDocumento || null) : null,
                    forzarOverride, motivoOverride,
                  });
                  addNotificacion('Documento corregido correctamente.');
                } else if (inlineEsContrato && empresa?.multisociedad_habilitado) {
                  await nuevoContratoPeriodoCtx({
                    personalId: persona.id, personalTipo: 'administrativo',
                    tipoDoc: inlineUploadReq.tipo_documento_id,
                    tipoDocumentoId: inlineUploadReq.tipo_documento_id,
                    file: inlineUploadFile,
                    fechaEmision: inlineUploadForm.fechaEmision || null,
                    fechaVencimiento: inlineUploadForm.esIndefinido ? null : (inlineUploadForm.fechaVencimiento || null),
                    notas: inlineUploadForm.notas || null,
                    condicionesLaborales,
                    periodoIdAnterior: inlineUploadForm.periodoIdAnterior || null,
                    esIndefinido: inlineUploadForm.esIndefinido,
                    sociedadId: sociedadDocumento,
                    forzarOverride, motivoOverride,
                  });
                  addNotificacion('Contrato de la sociedad registrado correctamente.');
                } else {
                  await subirDocumentoPersonalCtx({
                    personalId: persona.id, personalTipo: 'administrativo',
                    tipoDoc: inlineUploadReq.tipo_documento_id,
                    tipoDocumentoId: inlineUploadReq.tipo_documento_id,
                    file: inlineUploadFile,
                    fechaEmision: inlineUploadForm.fechaEmision || null,
                    fechaVencimiento: inlineEsAdenda ? null : (inlineUploadReq.tipo?.exige_vencimiento ? (inlineUploadForm.fechaVencimiento || null) : null),
                    notas: inlineUploadForm.notas || null, subidoDesde: 'backoffice',
                    condicionesLaborales,
                    contratoReferenciaId: inlineEsAdenda ? inlineUploadForm.contratoReferenciaId : null,
                    adendaCambios: inlineEsAdenda ? {
                      cargo: Boolean(inlineUploadForm.cambioCargo),
                      remuneracion: Boolean(inlineUploadForm.cambioRemuneracion),
                      modalidad: Boolean(inlineUploadForm.cambioModalidad),
                      sede: Boolean(inlineUploadForm.cambioSede),
                      otro: Boolean(inlineUploadForm.cambioOtro),
                    } : {},
                    fechaVigenciaCambio: inlineEsAdenda ? (inlineUploadForm.fechaVigenciaCambio || null) : null,
                    seccionDocumental: 'requisito_cargo',
                    contratoPeriodoId: inlineUploadForm.periodoIdAnterior || null,
                    forzarOverride, motivoOverride,
                    sociedadId: sociedadDocumento || null,
                  });
                  addNotificacion('Documento subido correctamente.');
                }
                setInlineUploadFile(null);
                setInlineUploadForm(inlineUploadFormBase);
                setInlineUploadReq(null);
                setRetroWallInline(null);
                setRetroWallMotivoInline('');
                if (recargarPersonalDocumentosPersonaCtx) await recargarPersonalDocumentosPersonaCtx(persona.id);
              } catch (err) {
                const msg = err?.message || 'Error al guardar.';
                if (msg.startsWith('RETRO_WALL_PERMISO:')) {
                  setInlineUploadError(msg.replace('RETRO_WALL_PERMISO:', '').trim());
                } else if (msg.startsWith('RETRO_WALL:')) {
                  setRetroWallInline(msg.replace('RETRO_WALL:', '').trim());
                } else {
                  setInlineUploadError(msg);
                }
              }
              finally { setInlineUploading(false); }
            };

            const handleSubirDocAdmin = async (e) => {
              e.preventDefault();
              if (!docUploadFile || !docUploadForm.tipoDoc) { setDocUploadError('Selecciona el tipo y el archivo.'); return; }
              if (docUploadEsAdendaAdmin && !docUploadForm.contratoReferenciaId) { setDocUploadError('Selecciona el contrato original que modifica la adenda.'); return; }
              if (empresa?.multisociedad_habilitado && docUploadEsContratoAdmin && !docUploadForm.sociedadId) { setDocUploadError('Selecciona la sociedad empleadora.'); return; }
              setDocUploading(true); setDocUploadError('');
              try {
                const cargoSelDoc = cargos.find(c => c.id === docUploadForm.cargoIdFirma);
                const sedeSelDoc = sedes.find(s => s.id === docUploadForm.sedeIdFirma);
                const areaSelDoc = areasEmpresa.find(a => a.id === docUploadForm.areaIdFirma);
                const condicionesLaborales = (docUploadEsContratoAdmin || docUploadEsAdendaAdmin) ? rrhhAdminSnapshotLaboral(persona, {
                  cargo: cargoSelDoc?.nombre || docUploadForm.cargoFirma || persona.cargo,
                  cargo_id: docUploadForm.cargoIdFirma || persona.cargo_id,
                  cargo_nombre: cargoSelDoc?.nombre || docUploadForm.cargoFirma || persona.cargo,
                  remuneracion_base: Number(docUploadForm.remuneracionFirma) || persona.sueldo_base || persona.remuneracion || 0,
                  modalidad: docUploadForm.modalidadFirma || '',
                  sede: sedeSelDoc?.nombre || docUploadForm.sedeFirma || persona.sede,
                  sede_id: docUploadForm.sedeIdFirma || persona.sede_id,
                  sede_nombre: sedeSelDoc?.nombre || docUploadForm.sedeFirma || persona.sede,
                  area_id: areaSelDoc?.id || '',
                  area_nombre: areaSelDoc?.nombre || docUploadForm.areaNombreFirma || persona.area || '',
                  regimen_jornada: docUploadForm.regimenJornadaFirma || persona.regimen_jornada || 'general',
                  tipo_contrato: docUploadForm.tipoContratoFirma || persona.tipo_contrato || '',
                  descripcion_cambio: docUploadForm.descripcionCambio || '',
                }) : {};
                const sociedadDocumento = docUploadEsAdendaAdmin
                  ? contratosValidados.find(d => d.id === docUploadForm.contratoReferenciaId)?.sociedad_id
                  : docUploadForm.sociedadId;
                const payloadDocumento = {
                  personalId: persona.id, personalTipo: 'administrativo',
                  tipoDoc: docUploadForm.tipoDoc,
                  tipoDocumentoId: tiposDocAdminLocal.length > 0 ? docUploadForm.tipoDoc : null,
                  file: docUploadFile,
                  fechaEmision: docUploadForm.fechaEmision || null,
                  fechaVencimiento: docUploadEsAdendaAdmin ? null : (docUploadForm.fechaVencimiento || null),
                  notas: docUploadForm.notas || null, subidoDesde: 'backoffice',
                  condicionesLaborales,
                  contratoReferenciaId: docUploadEsAdendaAdmin ? docUploadForm.contratoReferenciaId : null,
                  adendaCambios: docUploadEsAdendaAdmin ? {
                    cargo: Boolean(docUploadForm.cambioCargo),
                    remuneracion: Boolean(docUploadForm.cambioRemuneracion),
                    modalidad: Boolean(docUploadForm.cambioModalidad),
                    sede: Boolean(docUploadForm.cambioSede),
                    otro: Boolean(docUploadForm.cambioOtro),
                  } : {},
                  fechaVigenciaCambio: docUploadEsAdendaAdmin ? (docUploadForm.fechaVigenciaCambio || null) : null,
                  seccionDocumental: 'adicional',
                  sociedadId: sociedadDocumento || null,
                };
                if (docUploadEsContratoAdmin && empresa?.multisociedad_habilitado) {
                  await nuevoContratoPeriodoCtx({ ...payloadDocumento, esIndefinido: docUploadForm.esIndefinido });
                } else {
                  await subirDocumentoPersonalCtx(payloadDocumento);
                }
                setDocUploadFile(null);
                setDocUploadForm(docUploadFormBase);
                addNotificacion('Documento subido correctamente.');
                if (recargarPersonalDocumentosPersonaCtx) await recargarPersonalDocumentosPersonaCtx(persona.id);
              } catch (err) { setDocUploadError(err?.message || 'Error al subir.'); }
              finally { setDocUploading(false); }
            };
            const handleValidarAdmin = async (docId, decision) => {
              if (decision === 'rechazado' && !motivoRechazo.trim()) { setShowRechazoInput(docId); return; }
              setDocValidandoId(docId);
              try {
                await validarDocumentoPersonalCtx(docId, decision, decision === 'rechazado' ? motivoRechazo : null);
                setShowRechazoInput(null); setMotivoRechazo('');
                addNotificacion(`Documento ${decision === 'aprobado' ? 'aprobado' : 'rechazado'}.`);
                if (recargarPersonalDocumentosPersonaCtx) await recargarPersonalDocumentosPersonaCtx(persona.id);
              } catch { addNotificacion('Error al validar.'); }
              finally { setDocValidandoId(null); }
            };
            
            const configsAdminLocal = (tiposDocumentoConfig || []).filter(c => c.activo);
            const useFallbackAdminLocal = configsAdminLocal.length === 0;

            const tiposDocAdminLocal = tiposDocumento.filter(t => t.estado === 'activo' && (t.ambito === 'Administrativo' || t.ambito === 'Ambos'));
            
            const tipoDocOptsAdminLocal = useFallbackAdminLocal
              ? (tiposDocAdminLocal.length > 0 ? tiposDocAdminLocal : personalDocumentosService.TIPOS_DOC_ADMIN)
              : configsAdminLocal.map(c => ({
                  id: c.tipo_doc, key: c.tipo_doc, nombre: c.tipo_doc, label: c.tipo_doc,
                  exige_vencimiento: c.renovable, renovable: c.renovable,
                  es_habilitante: c.es_habilitante
                }));
            const tipoDocSelecInfoAdmin = tiposDocAdminLocal.length > 0
              ? tiposDocAdminLocal.find(t => t.id === docUploadForm.tipoDoc)
              : personalDocumentosService.TIPOS_DOC_ADMIN.find(t => t.key === docUploadForm.tipoDoc);
            const docUploadEsContratoAdmin = rrhhAdminEsTipoContrato(tipoDocSelecInfoAdmin);
            const docUploadEsAdendaAdmin = rrhhAdminEsTipoAdenda(tipoDocSelecInfoAdmin, docUploadForm.tipoDoc);
            const tiposRestantes = tipoDocOptsAdminLocal.filter(t => !docReqPorTipo[t.id || t.key] && !t.documento_padre_tipo_id);
            
            const handleOpenInlineUpload = (req, docsList, pContext, forceModo = null) => {
              if (req.doc && !forceModo) { abrirPreviewDocumentoAdmin(req, pContext); return; }
              setInlineUploadReq(req);
              setRetroWallInline(null);
              setRetroWallMotivoInline('');
              let pCargoFirma = '';
              let pRemuneracion = '';
              let pModalidad = '';
              let pSedeId = '';
              let pSedeFirma = '';
              let pAreaId = '';
              let pAreaFirma = '';
              let pRegimen = '';
              let pTipoContrato = '';
              let origenPrefill = '';

              if (!req.doc || forceModo === 'nuevo_contrato') {
                if (req.tipo?.documento_padre_tipo_id) {
                  const padre = docsList.find(d => d.activo && d.tipo_documento_id === req.tipo.documento_padre_tipo_id && d.estado_validacion === 'aprobado');
                  if (padre && padre.condiciones_laborales) {
                    pCargoFirma = padre.condiciones_laborales.cargo || padre.condiciones_laborales.cargo_nombre || '';
                    pRemuneracion = padre.condiciones_laborales.remuneracion_base || '';
                    pModalidad = padre.condiciones_laborales.modalidad || '';
                    pSedeId = padre.condiciones_laborales.sede_id || '';
                    pSedeFirma = padre.condiciones_laborales.sede || padre.condiciones_laborales.sede_nombre || '';
                    pAreaId = padre.condiciones_laborales.area_id || '';
                    pAreaFirma = padre.condiciones_laborales.area_nombre || '';
                    pRegimen = padre.condiciones_laborales.regimen_jornada || '';
                    pTipoContrato = padre.condiciones_laborales.tipo_contrato || '';
                    origenPrefill = padre.tipo_doc || 'Documento padre';
                  }
                } else {
                  const tPredecesorParaFill = tiposDocumento.find(t => t.tipo_sucesor_id === req.tipo_documento_id || t.tipo_sucesor_id === req.tipo?.id);
                  const predecessor = tPredecesorParaFill ? docsList.find(d => d.activo && d.estado_validacion === 'aprobado' && (d.tipo_documento_id === tPredecesorParaFill.id || d.tipo_doc === tPredecesorParaFill.nombre || d.tipo_doc === tPredecesorParaFill.codigo)) : null;
                  if (predecessor && predecessor.condiciones_laborales) {
                    pCargoFirma = predecessor.condiciones_laborales.cargo || predecessor.condiciones_laborales.cargo_nombre || '';
                    pRemuneracion = predecessor.condiciones_laborales.remuneracion_base || '';
                    pModalidad = predecessor.condiciones_laborales.modalidad || '';
                    pSedeId = predecessor.condiciones_laborales.sede_id || '';
                    pSedeFirma = predecessor.condiciones_laborales.sede || predecessor.condiciones_laborales.sede_nombre || '';
                    pAreaId = predecessor.condiciones_laborales.area_id || '';
                    pAreaFirma = predecessor.condiciones_laborales.area_nombre || '';
                    pRegimen = predecessor.condiciones_laborales.regimen_jornada || '';
                    pTipoContrato = predecessor.condiciones_laborales.tipo_contrato || '';
                    origenPrefill = predecessor.tipo_doc || 'Documento anterior';
                  } else if (pContext) {
                    pCargoFirma = pContext.cargo || '';
                    pRemuneracion = pContext.salario || pContext.monto_mensual || '';
                    pSedeId = pContext.sede_id || '';
                    pSedeFirma = pContext.sede_nombre || pContext.sede || '';
                    pAreaId = pContext.area_id || '';
                    pAreaFirma = pContext.area_nombre || pContext.area || '';
                    origenPrefill = 'Ficha del trabajador';
                  }
                }
              }
              const c = req.doc?.condiciones_laborales || {};
              setInlineUploadForm({
                ...inlineUploadFormBase,
                _origenPrefill: origenPrefill,
                sociedadId: req.doc?.sociedad_id || '',
                fechaEmision: req.doc?.fecha_emision || '',
                fechaVencimiento: req.doc?.fecha_vencimiento || '',
                notas: req.doc?.notas || '',
                cargoIdFirma: c.cargo_id || '',
                cargoFirma: c.cargo_nombre || c.cargo || pCargoFirma,
                remuneracionFirma: c.remuneracion_base !== undefined && c.remuneracion_base !== '' ? String(c.remuneracion_base) : String(pRemuneracion),
                modalidadFirma: c.modalidad || pModalidad,
                sedeIdFirma: c.sede_id || pSedeId,
                sedeFirma: c.sede_nombre || c.sede || pSedeFirma,
                areaIdFirma: c.area_id || pAreaId,
                areaNombreFirma: c.area_nombre || pAreaFirma,
                regimenJornadaFirma: c.regimen_jornada || pRegimen,
                tipoContratoFirma: c.tipo_contrato || pTipoContrato,
                contratoReferenciaId: req.doc?.contrato_referencia_id || (req.tipo?.documento_padre_tipo_id ? (docsList.find(d => d.activo && d.tipo_documento_id === req.tipo.documento_padre_tipo_id && d.estado_validacion === 'aprobado')?.id || '') : ''),
                descripcionCambio: c.descripcion_cambio || '',
                fechaVigenciaCambio: c.fecha_vigencia_cambio || '',
                modoSubida: forceModo || 'nueva_version',
                periodoIdAnterior: req.doc?.periodo_id || null,
                esIndefinido: req.doc?.es_indefinido || false
              });
              setInlineUploadFile(null);
            };

            const previewNodeAdmin = docPreviewReqAdmin ? (
              <DocumentoPreviewModal
                req={docPreviewReqAdmin}
                persona={docPreviewPersonaAdmin}
                url={visorUrlAdmin}
                loadingUrl={previewLoadingUrlAdmin}
                canValidate={canGestionarDocsRrhhAdmin}
                validatingId={docValidandoId}
                onClose={cerrarPreviewDocumentoAdmin}
                                onValidate={async (docId, decision, motivo) => {
                  setDocValidandoId(docId);
                  try {
                    await validarDocumentoPersonalCtx(docId, decision, motivo || null);
                    addNotificacion('Documento ' + (decision === 'aprobado' ? 'aprobado' : 'rechazado') + '.');
                    if (typeof recargarPersonalDocumentosPersonaCtx === 'function') {
                      const pid = typeof persona !== 'undefined' ? persona?.id : (typeof p !== 'undefined' ? p?.id : null);
                      if (pid) await recargarPersonalDocumentosPersonaCtx(pid);
                    }
                  } catch (e) {
                    addNotificacion('Error al validar el documento.');
                  } finally {
                    setDocValidandoId(null);
                  }
                }}
                onCorregir={() => {
                  const req = docPreviewReqAdmin;
                  cerrarPreviewDocumentoAdmin();
                  handleOpenInlineUpload(req, habPersona.docs, persona, 'corregir');
                }}
                onNuevoContrato={() => {
                  const req = docPreviewReqAdmin;
                  cerrarPreviewDocumentoAdmin();
                  handleOpenInlineUpload(req, habPersona.docs, persona, 'nuevo_contrato');
                }}
                onDownload={descargarPreviewDocumentoAdmin}
              />
            ) : null;

            return (
              <>
              {previewNodeAdmin}
              {modalEnviarFirmaDocAdmin && (
                <div className="modal-backdrop" onClick={() => !enviandoFirmaAdmin && setModalEnviarFirmaDocAdmin(null)}>
                  <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:440}}>
                    <div className="modal-head">
                      <h3>Enviar a firma del trabajador</h3>
                      <button className="icon-btn" onClick={() => setModalEnviarFirmaDocAdmin(null)} disabled={enviandoFirmaAdmin}>{I.x}</button>
                    </div>
                    <div className="modal-body" style={{display:'flex', flexDirection:'column', gap:12}}>
                      <div style={{padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:8}}>
                        <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:2}}>Documento</div>
                        <div style={{fontWeight:600}}>{modalEnviarFirmaDocAdmin.nombre}</div>
                        <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>Colaborador: {persona?.nombre}</div>
                      </div>
                      <div className="input-group">
                        <label>Mensaje para el trabajador <span style={{fontSize:11, color:'var(--fg-muted)'}}>(opcional)</span></label>
                        <textarea className="input" rows={3} value={enviarFirmaMensajeAdmin} onChange={e => setEnviarFirmaMensajeAdmin(e.target.value)} placeholder="Ej: Tu contrato de renovacion esta listo para firma." />
                      </div>
                    </div>
                    <div style={{display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px', borderTop:'1px solid var(--border)'}}>
                      <button className="btn btn-secondary" onClick={() => setModalEnviarFirmaDocAdmin(null)} disabled={enviandoFirmaAdmin}>Cancelar</button>
                      <button className="btn btn-primary" disabled={enviandoFirmaAdmin} onClick={async () => {
                        setEnviandoFirmaAdmin(true);
                        try {
                          await enviarDocumentoAFirmaCtx({ documentoId: modalEnviarFirmaDocAdmin.doc.id, workerAuthUserId: persona?.auth_user_id, mensaje: enviarFirmaMensajeAdmin });
                          setModalEnviarFirmaDocAdmin(null);
                          addNotificacion('Documento enviado a firma del trabajador.');
                        } catch (err) {
                          addNotificacion(err?.message || 'Error al enviar a firma.');
                        } finally {
                          setEnviandoFirmaAdmin(false);
                        }
                      }}>
                        {enviandoFirmaAdmin ? 'Enviando...' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="card-body">
                {/* ── Badge habilitacional ── */}
                {(() => {
                  const BADGE_HAB = {
                    en_regla:       { cls: 'badge-green',  txt: 'En regla' },
                    advertencia:    { cls: 'badge-orange', txt: 'Atención requerida' },
                    critico:        { cls: 'badge-red',    txt: 'No habilitado para campo' },
                    sin_cargo:      { cls: 'badge-gray',   txt: 'Sin cargo asignado' },
                    sin_requisitos: { cls: 'badge-gray',   txt: 'Cargo sin requisitos' },
                  };
                  const cfg = BADGE_HAB[habPersona.estado_global] || BADGE_HAB.sin_cargo;
                  const docsProblema = habPersona.docs.filter(d =>
                    ['rechazado','falta','incompleto','en_revision'].includes(d.estado) && d.obligatorio
                  );
                  const tip = docsProblema.map(d => d.tipo?.nombre || d.tipo_documento_id).join(', ');
                  return (
                    <div style={{marginBottom:20, display:'flex', alignItems:'center', gap:12, padding:'14px 18px', background:'var(--bg-subtle)', borderRadius:10, border:'1px solid var(--border-subtle)'}}>
                      <span className={'badge ' + cfg.cls} style={{fontSize:12, padding:'5px 16px', flexShrink:0, letterSpacing:'0.02em'}} title={tip || undefined}>
                        {cfg.txt}
                      </span>
                      {tip && <span style={{fontSize:12, color:'var(--fg-muted)', flex:1}}>{tip}</span>}
                      {reqPendientes > 0 && (
                        <span style={{fontSize:11, color:'var(--danger)', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'3px 10px', flexShrink:0, fontWeight:600}}>
                          {reqPendientes} obligatorio{reqPendientes !== 1 ? 's' : ''} faltante{reqPendientes !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Requisitos del cargo */}
                <div style={{marginBottom:32}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
                    <div style={{fontWeight:700, fontSize:11, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.07em'}}>
                      Requisitos del cargo
                    </div>
                    {habPersona.docs.length > 0 && (
                      <span style={{fontSize:11, color:'var(--fg-muted)'}}>
                        {habPersona.docs.filter(d => d.doc).length} / {habPersona.docs.length} documentos
                      </span>
                    )}
                  </div>
                  
                  {!habPersona.tiene_cargo ? (
                    <div style={{textAlign:'center', color:'var(--fg-muted)', padding:'24px 0', background:'var(--bg-subtle)', borderRadius:8, fontSize:13}}>
                      Este colaborador no tiene cargo asignado. <a onClick={() => { abrirEditarColaborador(persona); setSel(null); }} style={{color:'var(--primary)', cursor:'pointer', textDecoration:'underline'}}>Asigna un cargo</a> para determinar sus requisitos documentales.
                    </div>
                  ) : tiposDocumento.length === 0 ? (
                    <div style={{textAlign:'center', color:'var(--fg-muted)', padding:'24px 0', background:'var(--bg-subtle)', borderRadius:8, fontSize:13}}>
                      No hay tipos de documento configurados en la plataforma. Configúralos en Tipos de Documento.
                    </div>
                  ) : habPersona.docs.length === 0 ? (
                    <div style={{textAlign:'center', color:'var(--fg-muted)', padding:'24px 0', background:'var(--bg-subtle)', borderRadius:8, fontSize:13}}>
                      El cargo <strong>{persona.cargo}</strong> aún no tiene requisitos documentales configurados. <a onClick={() => { setSel({id:'mst_requisitos_cargo'}); }} style={{color:'var(--primary)', cursor:'pointer', textDecoration:'underline'}}>Configurar matriz</a>.
                    </div>
                  ) : (
                    <div style={{display:'flex', flexDirection:'column', gap:10}}>
                      {(() => {

                        const groupedDocs = {};
                        habPersona.docs.forEach(req => {
                          const cat = req.tipo?.categoria || 'Otros';
                          if (!groupedDocs[cat]) groupedDocs[cat] = [];
                          groupedDocs[cat].push(req);
                        });
                        Object.entries(groupedDocs).forEach(([cat, catDocs]) => {
                          const chains = [];
                          const added = new Set();
                          const buildChain = (doc, currentChain = []) => {
                            if (added.has(doc.tipo_documento_id)) return currentChain;
                            currentChain.push(doc);
                            added.add(doc.tipo_documento_id);
                            const tHijos = tiposDocumento.filter(t => t.documento_padre_tipo_id === doc.tipo_documento_id);
                            for (const th of tHijos) {
                              const docHijo = catDocs.find(d => d.tipo_documento_id === th.id);
                              if (docHijo) return buildChain(docHijo, currentChain);
                            }
                            return currentChain;
                          };
                          const heads = catDocs.filter(d => !d.tipo?.documento_padre_tipo_id);
                          heads.forEach(head => {
                            const chain = buildChain(head);
                            if (chain.length > 0) chains.push(chain);
                          });
                          catDocs.forEach(doc => {
                            if (!added.has(doc.tipo_documento_id)) {
                              if (doc.tipo?.documento_padre_tipo_id && habPersona.docs.some(d => d.tipo_documento_id === doc.tipo.documento_padre_tipo_id)) return;
                              const chain = buildChain(doc);
                              if (chain.length > 0) chains.push(chain);
                            }
                          });
                                                                              chains.sort((a, b) => {
                            const reqA = a[0];
                            const reqB = b[0];
                            const nA = (reqA.tipo?.nombre || reqA.tipo_documento_id || '').toLowerCase();
                            const nB = (reqB.tipo?.nombre || reqB.tipo_documento_id || '').toLowerCase();
                            
                            const getW = (n) => {
                              if (n.includes('primigenio')) return 1;
                              if (n.includes('laboral')) return 2;
                              if (n.includes('adenda')) return 3;
                              return 99;
                            };
                            
                            const wA = getW(nA);
                            const wB = getW(nB);
                            
                            if (wA !== wB) return wA - wB;
                            return nA.localeCompare(nB);
                          });
                          groupedDocs[cat] = chains;
                        });

                        return (
                          <div style={{display:'flex', flexDirection:'column', gap:24}}>
                            {Object.entries(groupedDocs).map(([catName, chains]) => (
                              <div key={catName} style={{display:'flex', flexDirection:'column', gap:10}}>
                                <div style={{fontSize: 13, fontWeight: 700, color: 'var(--fg)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6, marginBottom: 4, textTransform:'uppercase', letterSpacing:'0.05em'}}>{catName}</div>
                                {chains.map((chain, chainIdx) => (
                                  <div key={'chain-'+chainIdx} style={{ display: 'flex', flexDirection: 'column', position: 'relative', gap: 12 }}>
                                    {chain.length > 1 && (
                                      <div style={{ position: 'absolute', top: 30, bottom: 30, left: 15, width: 2, background: 'var(--border)', zIndex: 0 }} />
                                    )}
                                    {chain.map((req, idx) => {
                        const destacado = false;
                        const tPredecesor = tiposDocumento.find(t => t.tipo_sucesor_id === req.tipo_documento_id || t.tipo_sucesor_id === req.tipo?.id);
                        const hasAprobadoPredecesor = tPredecesor ? docsPersona.some(d => (d.tipo_documento_id === tPredecesor.id || d.tipo_doc === tPredecesor.id || d.tipo_doc === tPredecesor.codigo || d.tipo_doc === tPredecesor.nombre) && d.estado_validacion === 'aprobado' && d.activo) : true;
                        const tooltipPredecesor = tPredecesor && !hasAprobadoPredecesor ? `Primero debes cargar el ${tPredecesor.nombre} aprobado para este colaborador.` : null;
                        const tiposHijos = tiposDocumento.filter(t => t.documento_padre_tipo_id === req.tipo_documento_id && t.estado === 'activo');
                        const docPadreValidado = req.doc?.estado_validacion === 'aprobado';
                        const docsVinculados = docsPersona.filter(d => d.activo && d.contrato_referencia_id === req.doc?.id).sort((a, b) => (a.creado_en || '').localeCompare(b.creado_en || ''));
                        const hoy = new Date().toISOString().slice(0, 10);
                        const _borderColor = {vigente:'#22c55e',por_vencer:'#f97316',vencido:'#ef4444',en_revision:'#06b6d4',rechazado:'#ef4444',falta:'#d1d5db',incompleto:'#f97316'}[req.estado] || '#d1d5db';

                            const isHistorico = req.estado === 'historico';
                            const opacityStyle = isHistorico ? 0.65 : 1;
                            return (
                              <div key={req.tipo_documento_id} style={{ display: 'flex', gap: 12, position: 'relative', zIndex: 1 }}>
                                {chain.length > 1 && (
                                  <div style={{ width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 16 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: isHistorico ? 'var(--border)' : 'var(--primary)', border: '2px solid var(--bg)' }} />
                                  </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{background:destacado ? 'rgba(251,191,36,0.12)' : 'var(--bg-subtle)', borderRadius:10, border:destacado ? '1px solid var(--orange)' : '1px solid var(--border-subtle)', borderLeft:destacado ? '4px solid var(--orange)' : `4px solid ${_borderColor}`, opacity: opacityStyle}}>
                              <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'12px 16px', gap:12, flexWrap:'wrap'}}>
                              <div style={{flex:1, minWidth:0}}>
                                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
                                  <span style={{fontWeight:700, fontSize:14}}>{req.tipo?.nombre || req.tipo_documento_id}</span>
                                  <span className={'badge ' + (DOC_BDG[req.estado] || 'badge-gray')} style={{fontSize:10}}>{DOC_LBL[req.estado] || req.estado}{req.estado === 'por_vencer' && req.dias_restantes != null ? ` (${req.dias_restantes}d)` : ''}</span>
                                </div>
                                <div style={{fontSize:11, color:'var(--fg-muted)', display:'flex', gap:10, flexWrap:'wrap'}}>
                                  <span style={{fontWeight:500}}>{!req.obligatorio ? 'Opcional' : 'Obligatorio'}</span>
                                  {req.doc?.version && <span>v{req.doc.version}</span>}
                                  {req.doc?.fecha_vencimiento && <span>Vence: {req.doc.fecha_vencimiento}</span>}
                                </div>
                              </div>
                              <div style={{display:'flex', gap:6, alignItems:'center', flexShrink:0, flexWrap:'wrap'}}>
                                {req.doc?.estado_validacion === 'pendiente' && req.tipo?.requiere_validacion && (
                                  <>
                                    <button className="btn btn-sm btn-primary" disabled={docValidandoId === req.doc.id} onClick={() => handleValidarAdmin(req.doc.id, 'aprobado')}>
                                      {docValidandoId === req.doc.id ? '...' : 'Validar'}
                                    </button>
                                    {showRechazoInput === req.doc.id ? (
                                      <>
                                        <input className="input" style={{fontSize:12, padding:'4px 8px', minWidth:160}} placeholder="Motivo de rechazo..." value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} />
                                        <button className="btn btn-sm btn-danger" disabled={!motivoRechazo.trim() || docValidandoId === req.doc.id} onClick={() => handleValidarAdmin(req.doc.id, 'rechazado')}>Confirmar</button>
                                        <button className="btn btn-sm btn-ghost" onClick={() => { setShowRechazoInput(null); setMotivoRechazo(''); }}>Cancelar</button>
                                      </>
                                    ) : (
                                      <button className="btn btn-sm btn-ghost" style={{color:'var(--danger)'}} disabled={docValidandoId === req.doc.id} onClick={() => setShowRechazoInput(req.doc.id)}>Rechazar</button>
                                    )}
                                  </>
                                )}
                                <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
                                  <button className="btn btn-sm btn-ghost" style={{borderColor:'var(--border)', background:'var(--bg)', opacity: tooltipPredecesor && !req.doc ? 0.5 : 1}} disabled={!!(tooltipPredecesor && !req.doc)} title={tooltipPredecesor || undefined} onClick={() => handleOpenInlineUpload(req, habPersona.docs, persona)}>
                                    {req.estado === 'falta' ? 'Subir' : 'Ver / Reemplazar'}
                                  </button>
                                  {tooltipPredecesor && !req.doc && <span style={{fontSize:9, color:'var(--danger)', maxWidth:140, textAlign:'center', lineHeight:1.1}}>{tooltipPredecesor}</span>}
                                </div>
                                {req.doc && req.tipo?.renovable && ['vigente','por_vencer','vencido'].includes(req.estado) && (
                                  <button className="btn btn-sm btn-ghost" style={{color:'var(--orange)', borderColor:'var(--orange)'}} onClick={() => handleOpenInlineUpload(req, habPersona.docs, persona, 'nuevo_contrato')}>Renovar</button>
                                )}
                                {docPadreValidado && tiposHijos.map(th => (
                                  <button key={th.id} className="btn btn-sm btn-ghost" style={{color:'var(--cyan)', borderColor:'var(--cyan)'}}
                                    onClick={() => {
                                      setInlineUploadReq({ tipo: th, tipo_documento_id: th.id, doc: null, estado: 'falta', obligatorio: false });
                                      setInlineUploadForm(f => ({ ...f, contratoReferenciaId: req.doc.id }));
                                      setRetroWallInline(null);
                                      setRetroWallMotivoInline('');
                                    }}>
                                    + {th.nombre}
                                  </button>
                                ))}
                                {req.doc && canGestionarDocsRrhhAdmin && req.tipo?.captura_snapshot_laboral && !req.tipo?.documento_padre_tipo_id && req.tipo?.permite_firma_trabajador !== false && (() => {
                                  const ef = req.doc?.estado_firma || 'no_requiere';
                                  if (ef === 'pendiente_trabajador') return (
                                    <>
                                      <span className="badge badge-orange" style={{fontSize:10}}>Esperando firma</span>
                                      <button className="btn btn-sm btn-ghost" style={{fontSize:11}} title="Reenviar notificacion al trabajador" onClick={async () => { await reenviarNotificacionFirmaCtx({ documentoId: req.doc.id, workerAuthUserId: persona.auth_user_id }); addNotificacion('Notificacion reenviada.'); }}>Reenviar</button>
                                      <button className="btn btn-sm btn-ghost" style={{fontSize:11, color:'var(--danger)'}} onClick={async () => { await cancelarEnvioFirmaCtx({ documentoId: req.doc.id }); addNotificacion('Envio a firma cancelado.'); }}>Cancelar</button>
                                    </>
                                  );
                                  if (ef === 'firmado_trabajador') return (
                                    <span className="badge badge-cyan" style={{fontSize:10}}>Firmado por trabajador</span>
                                  );
                                  const yaSubioFirmado = personalDocumentos.some(pd =>
                                    pd.personal_id === persona.id &&
                                    (pd.tipo_documento_id === req.doc.tipo_documento_id || pd.tipo_doc === req.doc.tipo_doc) &&
                                    pd.estado_validacion === 'pendiente' && pd.subido_desde === 'mobile' && pd.activo === false
                                  );
                                  if (yaSubioFirmado) return (
                                    <span className="badge badge-orange" style={{fontSize:10}}>Firmado · Por validar</span>
                                  );
                                  return (
                                    <button className="btn btn-sm btn-ghost" style={{color:'var(--cyan)', borderColor:'rgba(0,178,198,0.4)', fontSize:11}} onClick={() => { setModalEnviarFirmaDocAdmin({ doc: req.doc, nombre: req.tipo?.nombre || req.tipo_documento_id }); setEnviarFirmaMensajeAdmin(''); }}>
                                      Enviar a firma
                                    </button>
                                  );
                                })()}
                              </div>
                              </div>
                            </div>
                            {docsVinculados.map(dv => {
                              const dvTipo = tiposDocumento.find(t => t.id === dv.tipo_documento_id);
                              const dvCond = dv.condiciones_laborales || {};
                              const dvCambios = dv.adenda_cambios || {};
                              const dvResumen = [
                                dvCambios.cargo ? `Cargo: ${dvCond.cargo || '-'}` : '',
                                dvCambios.remuneracion ? `Sueldo: S/ ${Number(dvCond.remuneracion_base || 0).toLocaleString()}` : '',
                                dvCambios.modalidad ? `Modalidad: ${dvCond.modalidad || '-'}` : '',
                                dvCambios.sede ? `Sede: ${dvCond.sede || '-'}` : '',
                                dvCambios.otro && dvCond.descripcion_cambio ? dvCond.descripcion_cambio : '',
                              ].filter(Boolean).join(' · ') || 'Documento vinculado';
                              const dvVigenciaFutura = dv.fecha_vigencia_cambio && dv.fecha_vigencia_cambio > hoy;
                              return (
                                <div key={dv.id} style={{marginLeft:20, border:'1px solid var(--border)', borderLeft:'3px solid #06b6d4', borderRadius:10, overflow:'hidden'}}>
                                  <div style={{padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8}}>
                                  <div style={{flex:1, minWidth:0}}>
                                    <div style={{display:'flex', gap:6, alignItems:'center', marginBottom:4, flexWrap:'wrap'}}>
                                      <span style={{fontWeight:700, fontSize:13}}>{dvTipo?.nombre || dv.tipo_doc}</span>
                                      <span className={'badge ' + (personalDocumentosService.BADGE_VALIDACION[dv.estado_validacion] || 'badge-gray')} style={{fontSize:10}}>{labelOr(ESTADO_VALIDACION_LABELS, dv.estado_validacion)}</span>
                                      {dv.fecha_emision && <span className="text-muted" style={{fontSize:11}}>Emitido: {dv.fecha_emision}</span>}
                                    </div>
                                    <div style={{fontSize:12, color:'var(--fg-muted)'}}>{dvResumen}</div>
                                    {dv.fecha_vigencia_cambio && (
                                      <div style={{fontSize:11, color: dvVigenciaFutura ? 'var(--orange)' : 'var(--fg-muted)', padding: dvVigenciaFutura ? '4px 8px' : 0, background: dvVigenciaFutura ? 'rgba(255,160,0,0.1)' : 'transparent', borderRadius: dvVigenciaFutura ? 4 : 0, marginTop:4}}>
                                        {dvVigenciaFutura
                                          ? `Esta adenda entra en vigor el ${dv.fecha_vigencia_cambio}. Recuerda actualizar la ficha en esa fecha.`
                                          : `Vigente desde: ${dv.fecha_vigencia_cambio}`}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{display:'flex', gap:5, flexShrink:0, flexWrap:'wrap', alignItems:'flex-start'}}>
                                    {dv.archivo_url && <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirDocUrl(dv, { doc: dv, tipo: dvTipo, tipo_documento_id: dv.tipo_documento_id, estado: dv.estado_validacion })}>{I.file} Ver</button>}
                                    {dv.estado_validacion === 'pendiente' && <>
                                      <button className="btn btn-sm btn-primary" disabled={docValidandoId === dv.id} onClick={() => handleValidarAdmin(dv.id, 'aprobado')}>{docValidandoId === dv.id ? '...' : 'Aprobar'}</button>
                                      <button className="btn btn-sm btn-ghost" style={{color:'var(--danger)'}} onClick={() => setShowRechazoInput(dv.id)}>Rechazar</button>
                                    </>}
                                  </div>
                                  </div>
                                </div>
                              );
                            })}
                            
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })()}


                    </div>
                  )}
                </div>

                {inlineUploadReq && (
                  <div className="modal-backdrop" onClick={() => { setInlineUploadReq(null); setRetroWallInline(null); setRetroWallMotivoInline(''); }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:500}}>
                      <div className="modal-head">
                        <h3>Subir {inlineUploadReq.tipo?.nombre || inlineUploadReq.tipo_documento_id}</h3>
                        <button className="icon-btn" onClick={() => { setInlineUploadReq(null); setRetroWallInline(null); setRetroWallMotivoInline(''); }}>{I.x}</button>
                      </div>
                      <div className="modal-body">
                        {inlineUploadReq.doc?.archivo_url && (
                          <div style={{marginBottom:16, padding:12, background:'var(--bg-subtle)', borderRadius:6, border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                            <div>
                              <div style={{fontWeight:500, fontSize:13}}>Documento actual (v{inlineUploadReq.doc.version})</div>
                              <div className="text-muted" style={{fontSize:11}}>{inlineUploadReq.doc.nombre_archivo}</div>
                            </div>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => abrirDocUrl(inlineUploadReq.doc)}>{I.file} Ver archivo</button>
                          </div>
                        )}
                        <form onSubmit={handleSubirInline} style={{display:'grid', gap:14}}>
                          {inlineUploadReq.tipo?.requiere_validacion && (
                            <div style={{fontSize:12, color:'var(--orange)', padding:'8px 12px', background:'rgba(255,160,0,0.1)', borderRadius:6, border:'1px solid rgba(255,160,0,0.3)'}}>
                              Al subir este documento, quedará "En revisión" hasta que sea validado por RRHH.
                            </div>
                          )}
                          <div className="input-group">
                            <label>Tipo de documento</label>
                            <input className="input" type="text" value={inlineUploadReq.tipo?.nombre || inlineUploadReq.tipo_documento_id} disabled />
                          </div>
                          {inlineUploadReq.tipo?.nombre === 'Contrato Primigenio' && (
                            <div style={{fontSize:12, color:'var(--blue)', padding:'8px 12px', background:'rgba(0,112,243,0.1)', borderRadius:6, border:'1px solid rgba(0,112,243,0.3)'}}>
                              Este es el contrato original histórico. No requiere firma digital ni renovación. Se capturará el cargo y remuneración actual del trabajador.
                            </div>
                          )}
                          {inlineUploadReq.tipo?.renovable && inlineUploadReq.tipo?.permite_firma_trabajador && (
                            <div style={{fontSize:12, color:'var(--green)', padding:'8px 12px', background:'rgba(16,185,129,0.1)', borderRadius:6, border:'1px solid rgba(16,185,129,0.3)'}}>
                              Renovación de contrato. El trabajador recibirá una notificación para firmarlo desde su app.
                            </div>
                          )}
                          <div className="input-group">
                            <label>Archivo {inlineUploadForm.modoSubida !== 'corregir' ? '*' : ''}</label>
                            <input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setInlineUploadFile(e.target.files?.[0]||null)} required={inlineUploadForm.modoSubida !== 'corregir'} />
                            <div className="text-muted" style={{fontSize:11, marginTop:4}}>
                              {inlineUploadForm.modoSubida === 'corregir' && inlineUploadReq?.doc
                                ? 'Sin cambio de archivo — se mantiene el actual. Adjunta uno nuevo solo si quieres reemplazarlo.'
                                : 'PDF, JPG o PNG. Tamaño máximo recomendado 5MB.'}
                            </div>
                          </div>
                          {inlineUploadReq.tipo?.exige_vencimiento && (
                            <div className="grid-2" style={{gap:12}}>
                              <div className="input-group">
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                                  <label style={{marginBottom:0}}>Fecha de emisión *</label>
                                </div>
                                <input className="input" type="date" value={inlineUploadForm.fechaEmision} onChange={e=>setInlineUploadForm(f=>({...f,fechaEmision:e.target.value}))} required />
                              </div>
                              {!rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) && (
                                <div className="input-group">
                                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                                    <label style={{marginBottom:0}}>Fecha de vencimiento {!inlineUploadForm.esIndefinido && '*'}</label>
                                    <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:500, cursor:'pointer'}}>
                                      <input type="checkbox" checked={inlineUploadForm.esIndefinido} onChange={e => setInlineUploadForm(f => ({ ...f, esIndefinido: e.target.checked, fechaVencimiento: '' }))} />
                                      Indefinido
                                    </label>
                                  </div>
                                  {!inlineUploadForm.esIndefinido && <input className="input" type="date" value={inlineUploadForm.fechaVencimiento} onChange={e=>setInlineUploadForm(f=>({...f,fechaVencimiento:e.target.value}))} required />}
                                  {inlineUploadForm.esIndefinido && <div style={{ fontSize: 12, padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, color: 'var(--fg-muted)' }}>El contrato se considerará vigente hasta que se registre un cese o cambio.</div>}
                                </div>
                              )}
                            </div>
                          )}
                          {(rrhhAdminEsTipoContrato(inlineUploadReq.tipo) || rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id)) && (
                            <div style={{display:'grid', gap:12, padding:12, background:'var(--bg-subtle)', borderRadius:8}}>
                              {rrhhAdminEsTipoContrato(inlineUploadReq.tipo) && (
                                <SociedadFormField label="Sociedad empleadora" value={inlineUploadForm.sociedadId} onChange={sociedadId=>setInlineUploadForm(f=>({...f,sociedadId}))} />
                              )}
                              {inlineUploadReq.doc && inlineUploadForm.modoSubida !== 'nuevo_contrato' && (
                                <div className="input-group" style={{gridColumn:'1/-1'}}>
                                  <label>Modo de guardado</label>
                                  <div className="row" style={{gap:8}}>
                                    {[['nueva_version','Subir nueva versión'],['corregir','Corregir este documento']].map(([v,l])=>(
                                      <label key={v} className="row" style={{gap:6, cursor:'pointer'}}>
                                        <input type="radio" name="modoSubida" value={v} checked={inlineUploadForm.modoSubida===v} onChange={()=>setInlineUploadForm(f=>({...f,modoSubida:v}))}/>
                                        <span style={{fontSize:13}}>{l}</span>
                                      </label>
                                    ))}
                                  </div>
                                  {inlineUploadForm.modoSubida==='corregir' && <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:4}}>Se actualiza este documento sin crear una nueva versión. Si no adjuntas un archivo nuevo, se mantiene el actual.</div>}
                                </div>
                              )}
                              {inlineUploadForm.modoSubida === 'nuevo_contrato' && (
                                <div style={{gridColumn:'1/-1', padding:'10px 12px', background:'rgba(255,160,0,0.08)', border:'1px solid var(--orange)', borderRadius:8, fontSize:12, color:'var(--orange)'}}>
                                  Nuevo período contractual · versión 1. El período anterior quedará archivado al guardar.
                                </div>
                              )}
                              {rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) && <>
                                <div className="input-group" style={{gridColumn:'1/-1'}}><label>Contrato original *</label><select className="select" value={inlineUploadForm.contratoReferenciaId || ''} onChange={e=>setInlineUploadForm(f=>({...f,contratoReferenciaId:e.target.value}))} required><option value="">Seleccionar contrato validado...</option>{contratosValidadosEscritura.map(d=><option key={d.id} value={d.id}>{d.fecha_emision || 'Sin emisión'} · vence {d.fecha_vencimiento || 'sin vencimiento'}</option>)}</select></div>
                                <div className="input-group" style={{gridColumn:'1/-1'}}><label>Qué cambió</label><div className="row" style={{gap:12, flexWrap:'wrap'}}>{[['cambioCargo','Cargo'],['cambioRemuneracion','Remuneración'],['cambioModalidad','Modalidad'],['cambioSede','Sede'],['cambioOtro','Otro']].map(([k,l])=><label key={k} className="row" style={{gap:6}}><input type="checkbox" checked={Boolean(inlineUploadForm[k])} onChange={e=>setInlineUploadForm(f=>({...f,[k]:e.target.checked}))}/>{l}</label>)}</div></div>
                                <div className="input-group"><label>Vigencia del cambio</label><input className="input" type="date" value={inlineUploadForm.fechaVigenciaCambio || ''} onChange={e=>setInlineUploadForm(f=>({...f,fechaVigenciaCambio:e.target.value}))}/></div>
                              </>}
                              {(!rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) || inlineUploadForm.cambioCargo) && (
                                <div className="input-group">
                                  <label>Cargo *</label>
                                  <select className="select" value={inlineUploadForm.cargoIdFirma || ''} onChange={e=>{const c=cargos.find(x=>x.id===e.target.value);setInlineUploadForm(f=>({...f,cargoIdFirma:e.target.value,cargoFirma:c?.nombre||''}));}}>
                                    <option value="">{inlineUploadForm.cargoFirma ? `Histórico: ${inlineUploadForm.cargoFirma}` : 'Selecciona del catálogo...'}</option>
                                    {cargos.filter(c=>c.estado!=='inactivo'&&c.nombre).sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                                  </select>
                                </div>
                              )}
                              {(!rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) || inlineUploadForm.cambioRemuneracion) && (
                                <div className="input-group"><label>Remuneración base (S/) *</label><input className="input" type="number" min="0" placeholder="0" value={inlineUploadForm.remuneracionFirma} onChange={e=>setInlineUploadForm(f=>({...f,remuneracionFirma:e.target.value}))}/></div>
                              )}
                              {!rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) && (
                                <div className="input-group">
                                  <label>Régimen de jornada *</label>
                                  <select className="select" value={inlineUploadForm.regimenJornadaFirma||'general'} onChange={e=>setInlineUploadForm(f=>({...f,regimenJornadaFirma:e.target.value}))}>
                                    {[['general','General'],['minero_14x7','Minero 14×7'],['minero_20x10','Minero 20×10'],['minero_28x14','Minero 28×14'],['minero_2x1','Minero 2×1']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                                  </select>
                                </div>
                              )}
                              {!rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) && (
                                <div className="input-group">
                                  <label>Tipo de contrato *</label>
                                  <select className="select" value={inlineUploadForm.tipoContratoFirma||''} onChange={e=>setInlineUploadForm(f=>({...f,tipoContratoFirma:e.target.value}))}>
                                    <option value="">Seleccionar...</option>
                                    {[['plazo_fijo','Plazo fijo'],['indefinido','Indefinido'],['honorarios','Honorarios']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                                  </select>
                                </div>
                              )}
                              {(!rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) || inlineUploadForm.cambioModalidad) && (
                                <div className="input-group">
                                  <label>Modalidad</label>
                                  <select className="select" value={inlineUploadForm.modalidadFirma||''} onChange={e=>setInlineUploadForm(f=>({...f,modalidadFirma:e.target.value}))}>
                                    <option value="">Seleccionar...</option>
                                    {[['presencial','Presencial'],['remoto','Remoto'],['hibrido','Híbrido'],['campo','Campo'],['mina','Mina']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                                  </select>
                                </div>
                              )}
                              {(!rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) || inlineUploadForm.cambioSede) && (
                                <div className="input-group">
                                  <label>Sede</label>
                                  <select className="select" value={inlineUploadForm.sedeIdFirma||''} onChange={e=>{const s=sedes.find(x=>x.id===e.target.value);setInlineUploadForm(f=>({...f,sedeIdFirma:e.target.value,sedeFirma:s?.nombre||''}));}}>
                                    <option value="">{inlineUploadForm.sedeFirma ? `Histórico: ${inlineUploadForm.sedeFirma}` : 'Selecciona del catálogo...'}</option>
                                    {sedes.filter(s=>s.estado!=='inactivo'&&s.nombre).map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
                                  </select>
                                </div>
                              )}
                              {!rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) && (
                                <div className="input-group">
                                  <label>Área</label>
                                  <select className="select" value={inlineUploadForm.areaIdFirma||''} onChange={e=>{const a=areasEmpresa.find(x=>x.id===e.target.value);setInlineUploadForm(f=>({...f,areaIdFirma:e.target.value,areaNombreFirma:a?.nombre||''}));}}>
                                    <option value="">{inlineUploadForm.areaNombreFirma ? `Histórico: ${inlineUploadForm.areaNombreFirma}` : 'Selecciona del catálogo...'}</option>
                                    {areasEmpresa.filter(a=>a.estado!=='inactivo'&&a.nombre).map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
                                  </select>
                                </div>
                              )}
                              {rrhhAdminEsTipoAdenda(inlineUploadReq.tipo, inlineUploadReq.tipo_documento_id) && inlineUploadForm.cambioOtro && (
                                <div className="input-group" style={{gridColumn:'1/-1'}}><label>Descripción del cambio</label><input className="input" value={inlineUploadForm.descripcionCambio||''} onChange={e=>setInlineUploadForm(f=>({...f,descripcionCambio:e.target.value}))}/></div>
                              )}
                            </div>
                          )}
                          <div className="input-group">
                            <label>Notas (opcional)</label>
                            <input className="input" type="text" placeholder="Alguna observación sobre este documento..." value={inlineUploadForm.notas} onChange={e=>setInlineUploadForm(f=>({...f,notas:e.target.value}))} />
                          </div>
                          
                          {inlineUploadError && <div style={{fontSize:12, color:'var(--danger)'}}>{inlineUploadError}</div>}

                          {retroWallInline && (
                            <div style={{fontSize:12, background:'var(--bg-subtle)', border:'1px solid var(--danger)', borderRadius:8, padding:12, display:'flex', flexDirection:'column', gap:8}}>
                              <div style={{color:'var(--danger)', fontWeight:600}}>Cambio bloqueado por nómina ya procesada</div>
                              <div>{retroWallInline}</div>
                              <div className="input-group">
                                <label>Justificación para forzar el cambio (obligatoria)</label>
                                <textarea className="input" rows={2} value={retroWallMotivoInline} onChange={e=>setRetroWallMotivoInline(e.target.value)} />
                              </div>
                              <div className="row" style={{justifyContent:'flex-end', gap:8}}>
                                <button type="button" className="btn btn-secondary" onClick={() => { setRetroWallInline(null); setRetroWallMotivoInline(''); }}>Cancelar</button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  disabled={inlineUploading || !retroWallMotivoInline.trim()}
                                  onClick={() => handleSubirInline(null, { forzarOverride: true, motivoOverride: retroWallMotivoInline.trim() })}
                                >
                                  Forzar cambio (requiere autorización)
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:8}}>
                            <button type="button" className="btn btn-secondary" onClick={() => { setInlineUploadReq(null); setRetroWallInline(null); setRetroWallMotivoInline(''); }}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={inlineUploading}>
                              {inlineUploading ? 'Guardando...' : (inlineUploadForm.modoSubida === 'nuevo_contrato' ? 'Crear nuevo contrato' : inlineUploadForm.modoSubida === 'corregir' ? 'Guardar corrección' : (inlineUploadReq.doc ? 'Subir nueva versión' : 'Subir documento'))}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{marginTop:40, borderTop:'1px solid var(--border)', paddingTop:24}}>
                  <details>
                    <summary style={{cursor:'pointer', fontWeight:600, fontSize:13, padding:'10px 0', userSelect:'none'}}>
                      + Subir documento adicional (fuera de los requisitos del cargo)
                    </summary>
                    {tiposRestantes.length === 0 ? (
                      <div className="text-muted" style={{fontSize:12, padding:'12px 0'}}>
                        No hay más tipos de documentos aplicables fuera de los requeridos.
                      </div>
                    ) : (
                      <form onSubmit={handleSubirDocAdmin} style={{display:'grid', gap:12, marginTop:12, padding:16, background:'var(--bg-subtle)', borderRadius:8}}>
                        <div className="grid-2" style={{gap:12}}>
                          <div className="input-group">
                            <label>Tipo *</label>
                            <select className="select" value={docUploadForm.tipoDoc} onChange={e => setDocUploadForm(f=>({...f,tipoDoc:e.target.value}))} required>
                              <option value="">Seleccionar...</option>
                              {tiposRestantes.map(t => <option key={t.id || t.key} value={t.id || t.key}>{t.nombre || t.label}</option>)}
                            </select>
                          </div>
                          {(() => {
                            const selectedTipo = tiposRestantes.find(t => t.id === docUploadForm.tipoDoc || t.key === docUploadForm.tipoDoc);
                            if (!selectedTipo) return null;
                            return (
                              <>
                                {selectedTipo.nombre === 'Contrato Primigenio' && (
                                  <div style={{gridColumn:'1/-1', fontSize:12, color:'var(--blue)', padding:'8px 12px', background:'rgba(0,112,243,0.1)', borderRadius:6, border:'1px solid rgba(0,112,243,0.3)'}}>
                                    Este es el contrato original histórico. No requiere firma digital ni renovación. Se capturará el cargo y remuneración actual del trabajador.
                                  </div>
                                )}
                                {selectedTipo.renovable && selectedTipo.permite_firma_trabajador && (
                                  <div style={{gridColumn:'1/-1', fontSize:12, color:'var(--green)', padding:'8px 12px', background:'rgba(16,185,129,0.1)', borderRadius:6, border:'1px solid rgba(16,185,129,0.3)'}}>
                                    Renovación de contrato. El trabajador recibirá una notificación para firmarlo desde su app.
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          <div className="input-group">
                            <label>Archivo *</label>
                            <input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setDocUploadFile(e.target.files?.[0]||null)} required />
                          </div>
                          {(() => {
                            const selectedTipo = tiposRestantes.find(t => t.id === docUploadForm.tipoDoc || t.key === docUploadForm.tipoDoc);
                            if (!selectedTipo?.exige_vencimiento) return null;
                            return (
                              <>
                                <div className="input-group">
                                  <label>Fecha emisión *</label>
                                  <input className="input" type="date" value={docUploadForm.fechaEmision} onChange={e=>setDocUploadForm(f=>({...f,fechaEmision:e.target.value}))} required />
                                </div>
                                <div className="input-group">
                                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                                    <label style={{marginBottom:0}}>Fecha vencimiento {(!docUploadEsAdendaAdmin && !docUploadForm.esIndefinido) && '*'}</label>
                                    {!docUploadEsAdendaAdmin && (
                                      <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:500, cursor:'pointer'}}>
                                        <input type="checkbox" checked={docUploadForm.esIndefinido} onChange={e => setDocUploadForm(f => ({ ...f, esIndefinido: e.target.checked, fechaVencimiento: '' }))} />
                                        Indefinido
                                      </label>
                                    )}
                                  </div>
                                  {!docUploadForm.esIndefinido && <input className="input" type="date" value={docUploadForm.fechaVencimiento} onChange={e=>setDocUploadForm(f=>({...f,fechaVencimiento:e.target.value}))} disabled={docUploadEsAdendaAdmin} required />}
                                  {docUploadForm.esIndefinido && <div style={{ fontSize: 12, padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, color: 'var(--fg-muted)' }}>El contrato se considerará vigente indefinidamente.</div>}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        {(docUploadEsContratoAdmin || docUploadEsAdendaAdmin) && (
                          <div style={{display:'grid', gap:12, padding:12, background:'var(--bg-subtle)', borderRadius:8}}>
                            {docUploadEsContratoAdmin && (
                              <SociedadFormField label="Sociedad empleadora" value={docUploadForm.sociedadId} onChange={sociedadId=>setDocUploadForm(f=>({...f,sociedadId}))} />
                            )}
                            {docUploadEsAdendaAdmin && <>
                              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Contrato original *</label><select className="select" value={docUploadForm.contratoReferenciaId||''} onChange={e=>setDocUploadForm(f=>({...f,contratoReferenciaId:e.target.value}))} required><option value="">Seleccionar contrato validado...</option>{contratosValidadosEscritura.map(d=><option key={d.id} value={d.id}>{d.fecha_emision||'Sin emisión'} · vence {d.fecha_vencimiento||'sin vencimiento'}</option>)}</select></div>
                              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Qué cambió</label><div className="row" style={{gap:12,flexWrap:'wrap'}}>{[['cambioCargo','Cargo'],['cambioRemuneracion','Remuneración'],['cambioModalidad','Modalidad'],['cambioSede','Sede'],['cambioOtro','Otro']].map(([k,l])=><label key={k} className="row" style={{gap:6}}><input type="checkbox" checked={Boolean(docUploadForm[k])} onChange={e=>setDocUploadForm(f=>({...f,[k]:e.target.checked}))}/>{l}</label>)}</div></div>
                              <div className="input-group"><label>Vigencia del cambio</label><input className="input" type="date" value={docUploadForm.fechaVigenciaCambio||''} onChange={e=>setDocUploadForm(f=>({...f,fechaVigenciaCambio:e.target.value}))}/></div>
                            </>}
                            {(!docUploadEsAdendaAdmin || docUploadForm.cambioCargo) && (
                              <div className="input-group"><label>Cargo *</label><select className="select" value={docUploadForm.cargoIdFirma||''} onChange={e=>{const c=cargos.find(x=>x.id===e.target.value);setDocUploadForm(f=>({...f,cargoIdFirma:e.target.value,cargoFirma:c?.nombre||''}));}}><option value="">Selecciona del catálogo...</option>{cargos.filter(c=>c.estado!=='inactivo'&&c.nombre).sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
                            )}
                            {(!docUploadEsAdendaAdmin || docUploadForm.cambioRemuneracion) && (
                              <div className="input-group"><label>Remuneración base (S/) *</label><input className="input" type="number" min="0" placeholder="0" value={docUploadForm.remuneracionFirma} onChange={e=>setDocUploadForm(f=>({...f,remuneracionFirma:e.target.value}))}/></div>
                            )}
                            {!docUploadEsAdendaAdmin && (
                              <div className="input-group"><label>Régimen de jornada *</label><select className="select" value={docUploadForm.regimenJornadaFirma||'general'} onChange={e=>setDocUploadForm(f=>({...f,regimenJornadaFirma:e.target.value}))}>{[['general','General'],['minero_14x7','Minero 14×7'],['minero_20x10','Minero 20×10'],['minero_28x14','Minero 28×14'],['minero_2x1','Minero 2×1']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
                            )}
                            {!docUploadEsAdendaAdmin && (
                              <div className="input-group"><label>Tipo de contrato *</label><select className="select" value={docUploadForm.tipoContratoFirma||''} onChange={e=>setDocUploadForm(f=>({...f,tipoContratoFirma:e.target.value}))}><option value="">Seleccionar...</option>{[['plazo_fijo','Plazo fijo'],['indefinido','Indefinido'],['honorarios','Honorarios']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
                            )}
                            {(!docUploadEsAdendaAdmin || docUploadForm.cambioModalidad) && (
                              <div className="input-group"><label>Modalidad</label><select className="select" value={docUploadForm.modalidadFirma||''} onChange={e=>setDocUploadForm(f=>({...f,modalidadFirma:e.target.value}))}><option value="">Seleccionar...</option>{[['presencial','Presencial'],['remoto','Remoto'],['hibrido','Híbrido'],['campo','Campo'],['mina','Mina']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
                            )}
                            {(!docUploadEsAdendaAdmin || docUploadForm.cambioSede) && (
                              <div className="input-group"><label>Sede</label><select className="select" value={docUploadForm.sedeIdFirma||''} onChange={e=>{const s=sedes.find(x=>x.id===e.target.value);setDocUploadForm(f=>({...f,sedeIdFirma:e.target.value,sedeFirma:s?.nombre||''}));}}><option value="">Selecciona del catálogo...</option>{sedes.filter(s=>s.estado!=='inactivo'&&s.nombre).map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
                            )}
                            {!docUploadEsAdendaAdmin && (
                              <div className="input-group"><label>Área</label><select className="select" value={docUploadForm.areaIdFirma||''} onChange={e=>{const a=areasEmpresa.find(x=>x.id===e.target.value);setDocUploadForm(f=>({...f,areaIdFirma:e.target.value,areaNombreFirma:a?.nombre||''}));}}><option value="">Selecciona del catálogo...</option>{areasEmpresa.filter(a=>a.estado!=='inactivo'&&a.nombre).map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
                            )}
                            {docUploadEsAdendaAdmin && docUploadForm.cambioOtro && (
                              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Descripción del cambio</label><input className="input" value={docUploadForm.descripcionCambio||''} onChange={e=>setDocUploadForm(f=>({...f,descripcionCambio:e.target.value}))}/></div>
                            )}
                          </div>
                        )}
                        {docUploadError && <div style={{fontSize:12, color:'var(--danger)'}}>{docUploadError}</div>}
                        <div style={{display:'flex', justifyContent:'flex-end'}}>
                          <button className="btn btn-primary" type="submit" disabled={docUploading}>{docUploading?'Subiendo...':'Subir adicional'}</button>
                        </div>
                      </form>
                    )}
                  </details>
                </div>
                {(() => {
                  const docsAdicionales = docsPersona.filter(doc => !docReqPorTipo[doc.tipo_documento_id || doc.tipo_doc] && !doc.contrato_referencia_id);
                  if (docsAdicionales.length === 0) return null;
                  return (
                  <div style={{display:'flex', flexDirection:'column', gap:10}}>
                    {docsAdicionales.map(doc => {
                      const tipoInfo = tiposDocumento.find(t => t.id === (doc.tipo_documento_id || doc.tipo_doc)) || personalDocumentosService.TIPOS_DOC_ADMIN.find(t => t.key === doc.tipo_doc);
                      const reqDoc = docReqPorTipo[doc.tipo_documento_id || doc.tipo_doc];
                      const estadoMotor = reqDoc?.estado;
                      return (
                        <div key={doc.id} style={{border:'1px solid var(--border)', borderLeft:`4px solid ${{aprobado:'#22c55e',vigente:'#22c55e',pendiente:'#06b6d4',rechazado:'#ef4444'}[doc.estado_validacion]||'#d1d5db'}`, borderRadius:10, display:'flex', flexDirection:'column', gap:8, padding:'12px 16px'}}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8}}>
                            <div style={{flex:1, minWidth:0}}>
                              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
                                <span style={{fontWeight:700, fontSize:14}}>{tipoInfo?.nombre || tipoInfo?.label || doc.tipo_doc}</span>
                                <span className={'badge '+(personalDocumentosService.BADGE_VALIDACION[doc.estado_validacion]||'badge-gray')} style={{fontSize:10}}>{doc.estado_validacion}</span>
                              </div>
                              <div className="text-muted" style={{fontSize:11, display:'flex', gap:8, flexWrap:'wrap'}}>
                                {doc.nombre_archivo && <span>{doc.nombre_archivo}</span>}
                                <span>v{doc.version}</span>
                                {doc.fecha_emision && <span>Emitido: {doc.fecha_emision}</span>}
                                {doc.fecha_vencimiento && <span>Vence: {doc.fecha_vencimiento}</span>}
                              </div>
                            </div>
                            <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
                              {doc.archivo_url && <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirDocUrl(doc)}>{I.file} Ver</button>}
                            </div>
                          </div>
                          {doc.motivo_rechazo && (
                            <div style={{fontSize:12, color:'var(--danger)', padding:'6px 10px', background:'rgba(229,62,62,0.08)', borderRadius:4}}>
                              Motivo de rechazo: {doc.motivo_rechazo}
                            </div>
                          )}
                          {doc.notas && <div className="text-muted" style={{fontSize:12}}>Nota: {doc.notas}</div>}
                          {doc.estado_validacion === 'pendiente' && (
                            <div style={{display:'flex', gap:8, alignItems:'flex-start', flexWrap:'wrap'}}>
                              <button className="btn btn-sm btn-primary" disabled={docValidandoId===doc.id} onClick={()=>handleValidarAdmin(doc.id,'aprobado')}>
                                {docValidandoId===doc.id?'...':'Aprobar'}
                              </button>
                              {showRechazoInput===doc.id?(
                                <div style={{display:'flex', gap:6, flex:1, minWidth:200}}>
                                  <input className="input" style={{flex:1,fontSize:12,padding:'4px 8px'}} placeholder="Motivo de rechazo..." value={motivoRechazo} onChange={e=>setMotivoRechazo(e.target.value)}/>
                                  <button className="btn btn-sm btn-danger" onClick={()=>handleValidarAdmin(doc.id,'rechazado')}>Confirmar</button>
                                  <button className="btn btn-sm btn-ghost" onClick={()=>{setShowRechazoInput(null);setMotivoRechazo('');}}>Cancelar</button>
                                </div>
                              ):(
                                <button className="btn btn-sm btn-ghost" style={{color:'var(--danger)'}} onClick={()=>setShowRechazoInput(doc.id)}>Rechazar</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
              </div>
              </>
            );
          })()}

          {tab === 'reembolsos' && (() => {
            const reembolsosPersona = (cxp || []).filter(c => c.personal_id === persona.id && c.motivo_cxp === 'viaticos_reembolso');
            const pendientes = reembolsosPersona.filter(c => c.estado !== 'pagada' && c.estado !== 'anulada');
            const totalPendiente = pendientes.reduce((s, c) => s + Number(c.saldo ?? c.monto_total ?? 0), 0);
            const totalHistorico = reembolsosPersona.reduce((s, c) => s + Number(c.monto_total ?? 0), 0);
            return (
              <div className="card-body">
                <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20}}>
                  <div style={{background:'var(--bg-subtle)', borderRadius:8, padding:'12px 16px'}}>
                    <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Total reembolsos</div>
                    <div style={{fontWeight:700, fontSize:18}}>{reembolsosPersona.length}</div>
                  </div>
                  <div style={{background:'var(--bg-subtle)', borderRadius:8, padding:'12px 16px'}}>
                    <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Pendientes de pago</div>
                    <div style={{fontWeight:700, fontSize:18, color:totalPendiente > 0 ? 'var(--orange)' : 'var(--fg)'}}>{money(totalPendiente)}</div>
                  </div>
                  <div style={{background:'var(--bg-subtle)', borderRadius:8, padding:'12px 16px'}}>
                    <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Histórico total</div>
                    <div style={{fontWeight:700, fontSize:18}}>{money(totalHistorico)}</div>
                  </div>
                </div>
                {reembolsosPersona.length === 0 ? (
                  <div style={{textAlign:'center', color:'var(--fg-muted)', padding:'32px 0'}}>
                    No hay reembolsos de viáticos registrados para este colaborador.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Fecha</th><th>Concepto</th><th>OT</th><th>Monto</th><th>Estado</th>
                          <th>Pagado en</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reembolsosPersona.map(r => {
                          const pagos = (cxpPagos || []).filter(p => p.cxp_id === r.id);
                          const ultimoPago = pagos.sort((a,b) => (b.fecha_pago||'').localeCompare(a.fecha_pago||''))[0];
                          return (
                            <tr key={r.id}>
                              <td>{r.fecha_emision}</td>
                              <td style={{fontSize:12}}>{r.concepto}</td>
                              <td className="mono text-muted" style={{fontSize:11}}>{r.ot_vinc_id || '—'}</td>
                              <td className="num"><strong>{money(r.monto_total)}</strong></td>
                              <td>
                                <span className={'badge ' + (r.estado === 'pagada' ? 'badge-green' : r.estado === 'anulada' ? 'badge-gray' : 'badge-orange')}>
                                  {r.estado === 'pagada' ? 'Pagado' : r.estado === 'anulada' ? 'Anulado' : 'Pendiente'}
                                </span>
                              </td>
                              <td style={{fontSize:12, color:'var(--fg-muted)'}}>{ultimoPago?.fecha_pago || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {tab === 'amonestaciones' && (() => {
            const canRegister = Boolean(role?.permisos?.todo || role?.permisos?.rrhh || role?.permisos?.jefatura);
            const activas = amonestaciones.filter(a => a.estado === 'activo');
            const tipoLabel = { verbal:'Verbal', escrita:'Escrita', suspension:'Suspensión' };
            const tipoBadge = { verbal:'badge-orange', escrita:'badge-red', suspension:'badge-gray' };

            const guardarAmon = async () => {
              setAmonError('');
              setAmonSaving(true);
              try {
                const sociedadId = resolverSociedadDocumentoLaboral({
                  multisociedadHabilitado: empresa?.multisociedad_habilitado,
                  documentos: personalDocumentos,
                  tiposDocumento,
                  sociedades: sociedadesDisponibles,
                  personalId: persona.id,
                  fecha: amonForm.fecha,
                });
                const nueva = await amonestacionesService.registrarAmonestacion(empresa.id, {
                  personal_id: persona.id, personal_tipo: 'administrativo',
                  personal_nombre: persona.nombre,
                  sociedad_id: sociedadId,
                  tipo: amonForm.tipo, motivo: amonForm.motivo,
                  descripcion: amonForm.descripcion, fecha: amonForm.fecha,
                  dias_suspension: amonForm.tipo === 'suspension' ? Number(amonForm.dias_suspension) : null,
                  fecha_inicio_suspension: amonForm.tipo === 'suspension' ? amonForm.fecha_inicio_suspension : null,
                  fecha_fin_suspension: amonForm.tipo === 'suspension' ? amonForm.fecha_fin_suspension : null,
                  evidencia_url: amonForm.evidencia_url || null,
                  registrado_por: role?.nombre || 'RRHH',
                  impactar_asistencia: amonForm.tipo === 'suspension' ? Boolean(amonForm.impactar_asistencia) : false,
                });
                setAmonestaciones(prev => [nueva, ...prev]);
                setAmonPanel(false);
                setAmonForm(amonFormBase);
                addNotificacion('Amonestación registrada correctamente.');
                if (!persona.auth_user_id) {
                  addNotificacion('El colaborador no tiene usuario de sistema. Notifícale por medios físicos y adjunta el cargo firmado como evidencia.');
                }
              } catch (err) {
                setAmonError(err.message || 'Error al registrar.');
              } finally {
                setAmonSaving(false);
              }
            };

            const anular = async () => {
              if (!amonMotivoAnulacion.trim()) { addNotificacion('El motivo de anulación es obligatorio.'); return; }
              try {
                const updated = await amonestacionesService.anularAmonestacion(amonAnularId, empresa.id, amonMotivoAnulacion, role?.nombre || 'RRHH');
                setAmonestaciones(prev => prev.map(a => a.id === amonAnularId ? updated : a));
                setAmonAnularId(null);
                setAmonMotivoAnulacion('');
                addNotificacion('Amonestación anulada.');
              } catch (err) {
                addNotificacion(err.message || 'Error al anular.');
              }
            };

            const descargarAmonestacion = async (amonestacion) => {
              try {
                const sociedad = amonestacion.sociedad_id
                  ? sociedadesDisponibles.find(item => item.id === amonestacion.sociedad_id) || null
                  : null;
                const emisor = resolverIdentidadEmisora({
                  empresaConfig,
                  sociedad,
                  multisociedadHabilitado: empresa?.multisociedad_habilitado,
                });
                const { pdf } = await import('@react-pdf/renderer');
                const { AmonestacionPDF } = await import('./pages_pdf.jsx');
                const blob = await pdf(
                  <AmonestacionPDF amonestacion={amonestacion} empresa={empresa} persona={persona} emisor={emisor} />
                ).toBlob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `amonestacion_${(persona?.nombre || 'Colaborador').replace(/\s+/g, '_')}_${amonestacion.fecha}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (err) {
                addNotificacion('Error generando PDF: ' + (err?.message || ''));
              }
            };

            return (
              <div className="card-body">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                  <div>
                    <span className="badge badge-red" style={{fontSize:12, marginRight:8}}>{activas.length} activa{activas.length !== 1 ? 's' : ''}</span>
                    <span className="text-muted" style={{fontSize:12}}>{amonestaciones.length} total en historial</span>
                  </div>
                  {canRegister && (
                    <button className="btn btn-sm btn-secondary" onClick={() => { setAmonForm(amonFormBase); setAmonPanel(true); setAmonError(''); }}>
                      {I.plus} Registrar amonestación
                    </button>
                  )}
                </div>

                {amonLoading && <div className="text-muted" style={{padding:20}}>Cargando...</div>}

                {!amonLoading && amonestaciones.length === 0 && (
                  <div style={{textAlign:'center', color:'var(--fg-muted)', padding:'32px 0'}}>
                    No hay amonestaciones registradas para este colaborador.
                  </div>
                )}

                {!amonLoading && amonestaciones.length > 0 && (
                  <div style={{display:'flex', flexDirection:'column', gap:10}}>
                    {amonestaciones.map(a => (
                      <div key={a.id} className="card" style={{padding:'12px 16px', opacity: a.estado === 'anulado' ? 0.6 : 1, borderLeft: `3px solid ${a.estado === 'anulado' ? 'var(--border)' : a.tipo === 'suspension' ? 'var(--danger)' : a.tipo === 'escrita' ? 'var(--orange)' : 'var(--fg-muted)'}` }}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8}}>
                          <div>
                            <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:4}}>
                              <span className={`badge ${tipoBadge[a.tipo] || 'badge-gray'}`}>{tipoLabel[a.tipo] || a.tipo}</span>
                              {a.estado === 'anulado' && <span className="badge badge-gray" style={{fontSize:10}}>Anulada</span>}
                              <span className="text-muted" style={{fontSize:12}}>{a.fecha}</span>
                            </div>
                            <div style={{fontWeight:600, fontSize:14}}>{a.motivo}</div>
                            {a.descripcion && <div className="text-muted" style={{fontSize:12, marginTop:2}}>{a.descripcion}</div>}
                            {a.tipo === 'suspension' && <div style={{fontSize:12, marginTop:4, color:'var(--danger)'}}>
                              Suspensión: {a.dias_suspension} días ({a.fecha_inicio_suspension} → {a.fecha_fin_suspension})
                              {a.impactar_asistencia && <span className="badge badge-red" style={{marginLeft:6, fontSize:10}}>Impacto en asistencia</span>}
                            </div>}
                            {a.evidencia_url && <a href={a.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-muted" style={{fontSize:11, marginTop:4, display:'block'}}>Ver evidencia</a>}
                            {a.estado === 'anulado' && a.motivo_anulacion && <div style={{fontSize:11, marginTop:4, color:'var(--fg-muted)'}}>Anulada por {a.anulado_por}: {a.motivo_anulacion}</div>}
                          </div>
                          {canRegister && a.estado === 'activo' && (
                            <div style={{display:'flex', gap:8, alignItems:'center', flexShrink:0}}>
                              <button className="btn btn-sm btn-ghost" onClick={() => descargarAmonestacion(a)}>Descargar PDF</button>
                              <button className="btn btn-sm btn-ghost" style={{color:'var(--danger)'}} onClick={() => { setAmonAnularId(a.id); setAmonMotivoAnulacion(''); }}>
                                Anular
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Panel registrar */}
                {amonPanel && <>
                  <div className="side-panel-backdrop" onClick={() => setAmonPanel(false)} />
                  <div className="side-panel" style={{width:'min(520px,96vw)', zIndex:70}}>
                    <div className="side-panel-head">
                      <div><div className="eyebrow">RRHH</div><div style={{fontWeight:700, fontSize:18}}>Nueva amonestación — {persona?.nombre}</div></div>
                      <button className="icon-btn" onClick={() => setAmonPanel(false)}>{I.x}</button>
                    </div>
                    <div className="side-panel-body">
                      <div className="input-group"><label>Tipo *</label>
                        <select className="select" value={amonForm.tipo} onChange={e => setAmonForm(v => ({...v, tipo: e.target.value}))}>
                          <option value="verbal">Verbal</option>
                          <option value="escrita">Escrita (requiere evidencia)</option>
                          <option value="suspension">Suspensión sin goce (requiere evidencia)</option>
                        </select>
                      </div>
                      <div className="grid-2" style={{gap:12, marginTop:12}}>
                        <div className="input-group"><label>Fecha *</label><input type="date" className="input" value={amonForm.fecha} onChange={e => setAmonForm(v => ({...v, fecha: e.target.value}))} /></div>
                      </div>
                      <div className="input-group" style={{marginTop:12}}><label>Motivo *</label><input type="text" className="input" value={amonForm.motivo} onChange={e => setAmonForm(v => ({...v, motivo: e.target.value}))} placeholder="Breve descripción del motivo" /></div>
                      <div className="input-group" style={{marginTop:12}}><label>Descripción detallada</label><textarea className="input" rows={3} value={amonForm.descripcion} onChange={e => setAmonForm(v => ({...v, descripcion: e.target.value}))} /></div>
                      {amonForm.tipo === 'suspension' && <>
                        <div className="grid-2" style={{gap:12, marginTop:12}}>
                          <div className="input-group"><label>Días de suspensión *</label><input type="number" min="1" className="input" value={amonForm.dias_suspension} onChange={e => setAmonForm(v => ({...v, dias_suspension: e.target.value}))} /></div>
                        </div>
                        <div className="grid-2" style={{gap:12, marginTop:12}}>
                          <div className="input-group"><label>Fecha inicio *</label><input type="date" className="input" value={amonForm.fecha_inicio_suspension} onChange={e => setAmonForm(v => ({...v, fecha_inicio_suspension: e.target.value}))} /></div>
                          <div className="input-group"><label>Fecha fin *</label><input type="date" className="input" value={amonForm.fecha_fin_suspension} onChange={e => setAmonForm(v => ({...v, fecha_fin_suspension: e.target.value}))} /></div>
                        </div>
                        <label style={{display:'flex', alignItems:'center', gap:8, marginTop:12, fontSize:13, cursor:'pointer'}}>
                          <input type="checkbox" checked={!!amonForm.impactar_asistencia} onChange={e => setAmonForm(v => ({...v, impactar_asistencia: e.target.checked}))} />
                          Impactar asistencia automáticamente (descuento en nómina)
                        </label>
                      </>}
                      <div className="input-group" style={{marginTop:12}}>
                        <label>URL de evidencia {['escrita','suspension'].includes(amonForm.tipo) && <span style={{color:'var(--danger)'}}>*</span>}</label>
                        <input type="url" className="input" value={amonForm.evidencia_url} onChange={e => setAmonForm(v => ({...v, evidencia_url: e.target.value}))} placeholder="https://..." />
                        {['escrita','suspension'].includes(amonForm.tipo) && <div className="text-muted" style={{fontSize:11, marginTop:3}}>Obligatoria para amonestaciones escritas y suspensiones.</div>}
                      </div>
                      {amonError && <div style={{color:'var(--danger)', fontSize:12, marginTop:8}}>{amonError}</div>}
                      <div className="row" style={{justifyContent:'flex-end', gap:10, marginTop:20}}>
                        <button type="button" className="btn btn-secondary" onClick={() => setAmonPanel(false)}>Cancelar</button>
                        <button type="button" className="btn btn-primary" disabled={amonSaving} onClick={guardarAmon}>
                          {amonSaving ? 'Guardando...' : 'Registrar'}
                        </button>
                      </div>
                    </div>
                  </div>
                </>}

                {/* Modal anulación */}
                {amonAnularId && <>
                  <div className="side-panel-backdrop" onClick={() => setAmonAnularId(null)} />
                  <div className="modal" style={{zIndex:80}}>
                    <div className="modal-head"><h3>Anular amonestación</h3><button className="icon-btn" onClick={() => setAmonAnularId(null)}>{I.x}</button></div>
                    <div className="modal-body">
                      <p>Esta acción no se puede deshacer. La amonestación quedará en el historial como anulada.</p>
                      <div className="input-group" style={{marginTop:12}}>
                        <label>Motivo de anulación *</label>
                        <textarea className="input" rows={3} value={amonMotivoAnulacion} onChange={e => setAmonMotivoAnulacion(e.target.value)} placeholder="Explica por qué se anula esta amonestación..." />
                      </div>
                      <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:16}}>
                        <button className="btn btn-secondary" onClick={() => setAmonAnularId(null)}>Cancelar</button>
                        <button className="btn btn-primary" style={{background:'var(--danger)', borderColor:'var(--danger)'}} onClick={anular} disabled={!amonMotivoAnulacion.trim()}>Confirmar anulación</button>
                      </div>
                    </div>
                  </div>
                </>}
              </div>
            );
          })()}

          {tab === 'comisiones' && (() => {
            const isIntRef = v => /^(osc|fac|cxc|com|rec|cob|opp)_/i.test(String(v||'').trim()) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||'').trim());
            const getOsLabel = id => { const r = osClientes.find(o => o.id === id); return r?.numero && !isIntRef(r.numero) ? r.numero : null; };
            const getOppLabel = id => { const r = oportunidades.find(o => o.id === id); return r?.nombre && !isIntRef(r.nombre) ? r.nombre : null; };
            const resolveMoneda = (c) => {
              const raw = c.moneda ||
                (() => { const cx = cxc.find(x => x.id === c.cxc_id || x.id === c.cobro_cxc_id); const fId = c.factura_id || cx?.factura_id || cx?.facturas?.id; const fRef = facturas.find(f => f.id === fId) || cx?.facturas; const osRef = osClientes.find(o => o.id === (c.os_cliente_id || cx?.os_cliente_id || fRef?.os_cliente_id)); return cx?.moneda || cx?.facturas?.moneda || cx?.os_clientes?.moneda || fRef?.moneda || fRef?.os_clientes?.moneda || osRef?.moneda; })() ||
                empresa?.moneda || empresa?.moneda_base || 'PEN';
              const r = String(raw || '').trim().toUpperCase();
              return (r.includes('USD') || r.includes('US$') || r.includes('DOLAR')) ? 'USD' : 'PEN';
            };
            const misComisiones = comisiones.filter(c => c.vendedor_id === sel);
            const aprobadas = misComisiones.filter(c => c.estado === 'aprobada');
            const pendientePEN = aprobadas.filter(c => resolveMoneda(c) !== 'USD').reduce((s,c) => s + Number(c.monto_total||0), 0);
            const pendienteUSD = aprobadas.filter(c => resolveMoneda(c) === 'USD').reduce((s,c) => s + Number(c.monto_total||0), 0);
            const now = new Date();
            const periodos6 = Array.from({ length: 6 }, (_, i) => {
              const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            });
            const montoPorPeriodo = periodos6.map(p =>
              misComisiones
                .filter(c => c.periodo === p && (c.estado === 'pagada' || c.estado === 'aprobada'))
                .reduce((s, c) => s + Number(c.monto_total || 0), 0)
            );
            const montoPorPeriodoPEN = periodos6.map(p =>
              misComisiones.filter(c => c.periodo === p && (c.estado === 'pagada' || c.estado === 'aprobada') && resolveMoneda(c) !== 'USD')
                .reduce((s,c) => s + Number(c.monto_total||0), 0)
            );
            const montoPorPeriodoUSD = periodos6.map(p =>
              misComisiones.filter(c => c.periodo === p && (c.estado === 'pagada' || c.estado === 'aprobada') && resolveMoneda(c) === 'USD')
                .reduce((s,c) => s + Number(c.monto_total||0), 0)
            );
            const maxMonto = Math.max(...montoPorPeriodo, 1);
            const barW = 60, barGap = 20, svgW = periodos6.length * (barW + barGap) + barGap, svgH = 120;
            return (
              <div className="card-body">
                {/* KPI saldo pendiente */}
                <div style={{ display:'flex', alignItems:'center', gap:20, padding:'16px 20px', background:'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(6,182,212,0.04))', border:'1px solid rgba(6,182,212,0.3)', borderRadius:12, marginBottom:24 }}>
                  <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(6,182,212,0.15)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--cyan)', flexShrink:0 }}>{I.dollar}</div>
                  <div>
                    <div style={{ fontSize:11, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Saldo acumulado pendiente de pago</div>
                    <div style={{ fontSize:28, fontWeight:800, color:'var(--cyan)' }}>
                      {pendienteUSD === 0
                        ? money(pendientePEN)
                        : pendientePEN === 0
                          ? money(pendienteUSD, 'US$')
                          : <>{money(pendientePEN)}<div style={{fontSize:18,fontWeight:700,marginTop:2}}>{money(pendienteUSD,'US$')}</div></>
                      }
                    </div>
                    <div style={{ fontSize:12, color:'var(--fg-muted)', marginTop:2 }}>
                      {aprobadas.length} comisiones aprobadas sin pagar
                    </div>
                  </div>
                </div>

                {/* Gráfico últimos 6 períodos */}
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:12 }}>Comisiones cobradas por período</div>
                  <svg viewBox={`0 0 ${svgW} ${svgH + 28}`} style={{ width:'100%', maxWidth:svgW, display:'block' }}>
                    {periodos6.map((p, i) => {
                      const x = barGap + i * (barW + barGap);
                      const h = montoPorPeriodo[i] > 0 ? Math.max(4, Math.round((montoPorPeriodo[i] / maxMonto) * (svgH - 24))) : 0;
                      const y = svgH - h;
                      const [yr, mo] = p.split('-');
                      const label = `${mo}/${yr.slice(2)}`;
                      return (
                        <g key={p}>
                          <rect x={x} y={y} width={barW} height={h} rx={4} fill="rgba(6,182,212,0.7)" />
                          {montoPorPeriodo[i] > 0 && (() => {
                            const pen = montoPorPeriodoPEN[i], usd = montoPorPeriodoUSD[i];
                            const lbl = pen > 0 && usd > 0
                              ? `~${(montoPorPeriodo[i]/1000).toFixed(1)}k`
                              : usd > 0
                                ? `US$${(usd/1000).toFixed(1)}k`
                                : `S/${(pen/1000).toFixed(1)}k`;
                            return <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="var(--fg-muted)">{lbl}</text>;
                          })()}
                          <text x={x + barW / 2} y={svgH + 16} textAnchor="middle" fontSize={10} fill="var(--fg-muted)">{label}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Historial completo */}
                <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>Historial completo</div>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Fecha</th><th>OS / Oportunidad</th><th>Monto cobrado</th>
                        <th>Comisión</th><th>Bonificación</th><th>Total</th>
                        <th>Estado</th><th>Período pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {misComisiones.length === 0 && (
                        <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--fg-muted)', padding:24 }}>Sin comisiones registradas</td></tr>
                      )}
                      {misComisiones.map(c => (
                        <tr key={c.id}>
                          <td style={{ fontSize:12 }}>{c.creado_en?.slice(0, 10) || '—'}</td>
                          <td style={{ fontSize:12 }}>
                            {(() => {
                              const osLabel = c.os_cliente_id ? getOsLabel(c.os_cliente_id) : null;
                              const oppLabel = c.oportunidad_id ? getOppLabel(c.oportunidad_id) : null;
                              if (!osLabel && !oppLabel) return '—';
                              return (<>
                                {osLabel && <div>OS: {osLabel}</div>}
                                {oppLabel && <div style={{ color:'var(--fg-muted)' }}>{oppLabel}</div>}
                              </>);
                            })()}
                          </td>
                          <td>{money(c.monto_cobrado, symOf(resolveMoneda(c)))}</td>
                          <td>{money(c.monto_comision, symOf(resolveMoneda(c)))} <span style={{ fontSize:11, color:'var(--fg-muted)' }}>({c.porcentaje_comision}%)</span></td>
                          <td>{c.bonificacion > 0 ? money(c.bonificacion, symOf(resolveMoneda(c))) : '—'}</td>
                          <td style={{ fontWeight:600 }}>{money(c.monto_total, symOf(resolveMoneda(c)))}</td>
                          <td>
                            <span className={`badge badge-${c.estado === 'pagada' ? 'green' : c.estado === 'aprobada' ? 'cyan' : c.estado === 'rechazada' ? 'red' : 'orange'}`}>
                              {c.estado === 'pendiente_aprobacion' ? 'Pendiente' : c.estado}
                            </span>
                          </td>
                          <td style={{ fontSize:12 }}>{c.periodo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {persona.modalidad_comision === 'Honorarios' && (() => {
                  const misRecibos = recibosHonorarios.filter(r => r.vendedor_id === sel);
                  return (
                    <div style={{ marginTop:28 }}>
                      <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>Recibos de Honorarios</div>
                      <div className="table-wrap">
                        <table className="tbl">
                          <thead>
                            <tr>
                              <th>Período</th><th>Comisiones</th><th>Monto bruto</th>
                              <th>Retención IR</th><th>Monto neto</th><th>N° RHE</th><th>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {misRecibos.length === 0 && (
                              <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--fg-muted)', padding:24 }}>
                                Los recibos aparecerán aquí cuando se procesen las comisiones aprobadas desde el módulo de Comisiones.
                              </td></tr>
                            )}
                            {misRecibos.map(r => (
                              <tr key={r.id}>
                                <td style={{ fontSize:12 }}>{r.periodo || '—'}</td>
                                <td style={{ textAlign:'center' }}>{r.comisiones_ids?.length || 0}</td>
                                <td>{money(r.monto_bruto, symOf(r.moneda))}</td>
                                <td style={{ color:'var(--fg-muted)' }}>{money(r.retencion_ir, symOf(r.moneda))}</td>
                                <td style={{ fontWeight:600 }}>{money(r.monto_neto, symOf(r.moneda))}</td>
                                <td style={{ fontSize:12 }}>{r.numero_rhe || '—'}</td>
                                <td>
                                  <span className={`badge badge-${r.estado === 'pagado' ? 'green' : r.estado === 'pendiente_pago' ? 'orange' : 'gray'}`}>
                                    {r.estado === 'pendiente_pago' ? 'Pendiente pago' : r.estado === 'pagado' ? 'Pagado' : 'Borrador'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {tab === 'bancarios' && canFinanzasAdmin && (
            <div className="card-body">
              <DatosBancariosAdmin
                cuentas={persona.datos_bancarios ?? []}
                onChange={async (nuevas) => {
                  try {
                    await actualizarAdminPersonalCtx(persona.id, { datos_bancarios: nuevas });
                    addNotificacion('Datos bancarios actualizados.');
                  } catch (e) { addNotificacion('Error al guardar datos bancarios.', 'error'); }
                }}
              />
            </div>
          )}
        </div>
      </>
    );
  }

  // Vista lista — datos comunes
  const personalAdminVisibleIds = new Set(todosPersonal.map(p => p.id));
  const vencimientosDocumentos = todosPersonal.flatMap(p =>
    (p.documentos || []).filter(d => d.estado !== 'vigente').map(d => ({ persona: p.nombre, doc: d.nombre, estado: d.estado }))
  );
  const colaboradoresActivos = todosPersonal.filter(p => p.estado === 'activo').length;
  const vacPendientes = vacacionesSolicitudes.filter(v => v.estado === 'pendiente' && personalAdminVisibleIds.has(v.personal_id));

  // Vista Reportes — datos calculados
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const porArea = todosPersonal.reduce((acc, p) => { acc[p.area] = (acc[p.area] || 0) + 1; return acc; }, {});
  const maxArea = Math.max(...Object.values(porArea), 1);
  const contratosVencer = todosPersonal
    .map(p => {
      const contratoDoc = rrhhAdminContratoActivoPersonal(personalDocumentos, p.id, tiposDocumento);
      const contratoInfo = rrhhAdminContratoVencimientoInfo(contratoDoc);
      return { ...p, contratoDoc, contratoInfo, dias_restantes: contratoInfo.dias };
    })
    .filter(p => p.contratoDoc?.fecha_vencimiento && p.dias_restantes >= 0 && p.dias_restantes <= 30)
    .sort((a, b) => a.dias_restantes - b.dias_restantes);
  const vacRanking = [...todosPersonal]
    .map(p => ({ ...p, _vacDisp: rrhhAdminCalcVacProp(p, solicitudesRRHH) }))
    .sort((a, b) => b._vacDisp - a._vacDisp);
  const solPend = solicitudesRRHH.filter(s => s.estado === 'pendiente' && personalAdminVisibleIds.has(s.personal_id));

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">RRHH Administrativo</h1><div className="page-sub">{colaboradoresActivos} colaboradores activos</div></div>
        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4}}>
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowTiposDocumentoRRHH(true)} title="Gestionar catálogo de tipos de documento">📄 Tipos de Documento</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowRequisitosRRHH(true)} title="Configurar documentos requeridos por cargo">{I.shield} Requisitos por Cargo</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCargaMasivaAdmin(true)} title="Carga masiva de colaboradores">{I.upload} Carga masiva</button>
            <button className="btn btn-primary" data-local-form="true" onClick={abrirNuevoColaborador} disabled={!turnosOptions.length}>{I.plus} Nuevo colaborador</button>
          </div>
          {!turnosOptions.length && <span style={{fontSize:11, color:'var(--danger, #e53e3e)'}}>Crea un turno en Turnos y Horarios para habilitar esta opción.</span>}
        </div>
      </div>

      {showRequisitosRRHH && <RequisitosPorCargo onClose={() => setShowRequisitosRRHH(false)} onGoToTiposDoc={() => { setShowRequisitosRRHH(false); setShowTiposDocumentoRRHH(true); }} />}
      {showTiposDocumentoRRHH && <TiposDocumentoPanel onClose={() => setShowTiposDocumentoRRHH(false)} onGoToRequisitos={() => { setShowTiposDocumentoRRHH(false); setShowRequisitosRRHH(true); }} />}
      {showCargaMasivaAdmin && <CargaMasivaAdminPanel onClose={() => setShowCargaMasivaAdmin(false)} turnosOptions={turnosOptions} cargosAdminOptions={cargosAdminOptions} areasOptions={areasOptions} sedesOptions={sedesOptions} cecosActivos={cecosActivos} empresaConfig={empresaConfig} crearAdminPersonalCtx={crearAdminPersonalCtx} addNotificacion={addNotificacion} personalAdmin={personalAdmin} />}

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Colaboradores activos</div><div className="kpi-value">{colaboradoresActivos}</div><div className="kpi-icon cyan">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Contratos por vencer</div><div className="kpi-value" style={{color:'var(--orange)'}}>{contratosVencer.filter(p => p.dias_restantes <= 14).length}</div><div className="kpi-icon orange">{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">Vacaciones pendientes</div><div className="kpi-value" style={{color: vacPendientes.length > 0 ? 'var(--orange)' : 'inherit'}}>{vacPendientes.length}</div><div className="kpi-icon purple">{I.calendar}</div></div>
        <div className="kpi-card"><div className="kpi-label">Docs vencidos / por vencer</div><div className="kpi-value" style={{color:'var(--danger)'}}>{vencimientosDocumentos.length}</div><div className="kpi-icon red">{I.shield}</div></div>
      </div>

      <div className="tabs" style={{marginTop: 24}}>
        <div className={'tab '+(view==='personal'?'active':'')} onClick={()=>setView('personal')}>Personal</div>
        <div className={'tab '+(view==='reportes'?'active':'')} onClick={()=>setView('reportes')}>Reportes</div>
      </div>

      {vencimientosDocumentos.length > 0 && (
        <div style={{padding:'12px 16px', background:'rgba(220,38,38,0.08)', border:'1px solid var(--danger)', borderRadius:10, marginBottom:16}} className="row">
          <span style={{display:'flex',alignItems:'center',flexShrink:0,width:18,height:18,color:'var(--danger)'}}>{I.alert}</span>
          <div><strong>Documentos que requieren atención:</strong> {vencimientosDocumentos.map(d => `${d.persona} — ${d.doc} (${d.estado.replace('_',' ')})`).join(' · ')}</div>
        </div>
      )}

      {view === 'personal' && (
        <div className="card">
          <div className="card-head row" style={{gap:12}}>
            <input className="input" placeholder="Buscar personal..." value={filtroPersonal} onChange={e=>setFiltroPersonal(e.target.value)} style={{flex:'1 1 200px'}} />
            <select className="input" value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} style={{flex:'1 1 140px'}}>
              <option value="">Todos los estados</option>
              <option value="activo">Activo (Disponible)</option>
              <option value="no_disponible">No Disponible</option>
              <option value="bloqueado">Bloqueado</option>
              <option value="inactivo">Inactivo / Cesado</option>
            </select>
            <select className="input" value={filtroModalidad} onChange={e=>setFiltroModalidad(e.target.value)} style={{flex:'1 1 140px'}}>
              <option value="">Todas las modalidades</option>
              <option value="planilla">Planilla</option>
              <option value="honorarios">Honorarios</option>
            </select>
            <ColumnFilter columns={COLUMNAS_DEFAULT_ADMIN} visibleCols={visibleColsAdmin} onChange={setVisibleColsAdmin} />
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                {visibleColsAdmin.includes('codigo') && <th>Código</th>}
                {visibleColsAdmin.includes('colaborador') && <th>Colaborador</th>}
                {mostrarBadgeSociedadPersonalAdmin && <th>Sociedad</th>}
                {visibleColsAdmin.includes('cargo') && <th>Cargo</th>}
                {visibleColsAdmin.includes('unidad') && <th>Unidad organizacional</th>}
                {visibleColsAdmin.includes('sede') && <th>Sede</th>}
                {visibleColsAdmin.includes('turno') && <th>Turno</th>}
                {visibleColsAdmin.includes('jornada') && <th>Jornada</th>}
                {visibleColsAdmin.includes('contrato') && <th>Contrato</th>}
                {visibleColsAdmin.includes('modalidad') && <th>Modalidad</th>}
                {visibleColsAdmin.includes('vacaciones') && <th>Vacaciones disp.</th>}
                {visibleColsAdmin.includes('estado') && <th>Estado</th>}
                {visibleColsAdmin.includes('acciones') && <th style={{textAlign:'right'}}>Acciones</th>}
              </tr></thead>
              <tbody>
                {todosPersonal.length === 0 && <tr><td colSpan={Math.max(visibleColsAdmin.length + (mostrarBadgeSociedadPersonalAdmin ? 1 : 0), 1)} style={{textAlign:'center', color:'var(--fg-muted)', padding:28}}>Sin personal administrativo registrado.</td></tr>}
                {todosPersonal.filter(p => {
                  if (filtroEstado && p.estado !== filtroEstado) return false;
                  if (filtroModalidad) {
                    const esHon = normalizarModalidadContrato(p.modalidad_contrato || p.tipo_contrato) === 'honorarios';
                    if (filtroModalidad === 'honorarios' && !esHon) return false;
                    if (filtroModalidad === 'planilla' && esHon) return false;
                  }
                  if (filtroPersonal) {
                    const q = filtroPersonal.toLowerCase();
                    if (!p.nombre?.toLowerCase().includes(q) && !p.cargo?.toLowerCase().includes(q)) return false;
                  }
                  return true;
                }).map(p => {
                  const esHon = normalizarModalidadContrato(p.modalidad_contrato || p.tipo_contrato) === 'honorarios';
                  const contratoDocFila = rrhhAdminContratoActivoPersonal(personalDocumentos, p.id, tiposDocumento);
                  const contratoInfoFila = rrhhAdminContratoVencimientoInfo(contratoDocFila);
                  return (
                  <tr key={p.id} className="hover-row" onClick={() => { setSel(p.id); setTab('ficha'); }} style={{cursor:'pointer'}}>
                    {visibleColsAdmin.includes('codigo') && <td className="mono text-muted">{p.codigo || '—'}</td>}
                    {visibleColsAdmin.includes('colaborador') && <td>
                      <div className="row">
                        <div className="avatar" style={{width:30,height:30,fontSize:11}}>{p.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>
                        <div>
                          <strong>{p.nombre}</strong>
                          <div className="text-muted" style={{fontSize:11}}>DNI: {p.dni || p.documento || '—'}</div>
                          {vistaSociedadConcretaPersonalAdmin && resolucionPersonalAdminSociedad.personalSinContratoVigenteIds.has(p.id) && (
                            <span className="badge badge-orange" style={{fontSize:10, marginTop:4}}>Sin contrato vigente</span>
                          )}
                        </div>
                      </div>
                    </td>}
                    {mostrarBadgeSociedadPersonalAdmin && <td>
                      <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
                        {(resolucionPersonalAdminSociedad.sociedadesPorPersonal.get(p.id) || []).map(sociedadId => (
                          <SociedadBadge key={sociedadId} sociedadId={sociedadId} />
                        ))}
                        {resolucionPersonalAdminSociedad.personalSinContratoVigenteIds.has(p.id) && <span className="badge badge-orange">Sin contrato vigente</span>}
                      </div>
                    </td>}
                    {visibleColsAdmin.includes('cargo') && <td>{p.cargo}</td>}
                    {visibleColsAdmin.includes('unidad') && <td>{unidadNombrePorId.get(posiciones.find(pos => pos.id === p.posicion_id)?.unidad_organizacional_id) || p.area || <span className="text-subtle">Sin posición</span>}</td>}
                    {visibleColsAdmin.includes('sede') && <td>{p.sede ? <span className="badge badge-gray" style={{fontSize:11}}>{p.sede}</span> : <span className="text-subtle">—</span>}</td>}
                    {visibleColsAdmin.includes('turno') && <td>{esHon ? <span className="text-subtle">—</span> : <span className="text-muted" style={{fontSize:12}}>{turnosOptions.find(t => t.id === p.turno_id)?.nombre || 'Sin turno'}</span>}</td>}
                    {visibleColsAdmin.includes('jornada') && <td><span className="text-muted" style={{fontSize:12}}>{labelOr(REGIMEN_JORNADA_LABELS, p.regimen_jornada || p.personal_asignaciones_jornada || 'general')}</span></td>}
                    {visibleColsAdmin.includes('contrato') && <td>{esHon ? <span className="text-subtle">—</span> : (
                      <span className={`badge ${contratoInfoFila.estado === 'sin_contrato' && !p.cargo_confianza ? 'badge-red' : contratoInfoFila.badge}`}>
                        {contratoInfoFila.texto}
                      </span>
                    )}</td>}
                    {visibleColsAdmin.includes('modalidad') && <td>{esHon ? <span className="text-subtle">—</span> : p.modalidad}</td>}
                    {visibleColsAdmin.includes('vacaciones') && <td className="num">{esHon ? <span className="text-subtle">—</span> : `${rrhhAdminCalcVacProp(p, solicitudesRRHH)} días`}</td>}
                    {visibleColsAdmin.includes('estado') && <td>
                      <span className="badge badge-green">{p.estado}</span>
                      {!esHon && !p.sede && !p.turno_id && <span className="badge badge-gray" style={{fontSize:10, marginLeft:4}}>Ficha incompleta</span>}
                    </td>}
                    {visibleColsAdmin.includes('acciones') && <td>
                      <div style={{display:'flex', gap:4, justifyContent:'flex-end'}}>
                        <button className="btn btn-sm btn-ghost" onClick={e=>{e.stopPropagation();setSel(p.id);setTab('ficha');}}>Ver ficha</button>
                        <button className="icon-btn" title="Editar colaborador" style={{color:'var(--cyan)'}} onClick={e=>{e.stopPropagation();abrirEditarColaborador(p);}}>{I.edit}</button>
                        <button className="icon-btn" title="Eliminar colaborador" style={{color:'var(--danger)'}} onClick={e=>{e.stopPropagation();eliminarColaborador(p);}}>{I.trash}</button>
                      </div>
                    </td>}
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'reportes' && (
          <div style={{display:'grid', gap:24}}>
            {/* Headcount por área */}
            <div className="card">
              <div className="card-head"><h3>Headcount por Unidad organizacional</h3><span style={{fontSize:12,color:'var(--fg-subtle)'}}>Total: {todosPersonal.length} colaboradores</span></div>
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
                <span>Remoto: <strong>{todosPersonal.filter(p=>p.modalidad==='Remoto').length}</strong></span>
                <span>Presencial: <strong>{todosPersonal.filter(p=>p.modalidad==='Presencial').length}</strong></span>
                <span>Híbrido: <strong>{todosPersonal.filter(p=>p.modalidad==='Híbrido').length}</strong></span>
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
                        <td>{p.contratoDoc?.fecha_vencimiento || '—'}</td>
                        <td><span className={'badge '+(p.dias_restantes<=30?'badge-red':p.dias_restantes<=60?'badge-yellow':'badge-green')}>{p.dias_restantes}d</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Vacaciones disponibles */}
            <div className="card">
              <div className="card-head"><h3>Vacaciones Disponibles</h3><span style={{fontSize:12,color:'var(--fg-subtle)'}}>Total acumulado: {vacRanking.reduce((s,p)=>s+p._vacDisp,0)} días</span></div>
              <table className="tbl">
                <thead><tr><th>Colaborador</th><th>Unidad organizacional</th><th>Días totales</th><th>Usados</th><th>Disponibles</th></tr></thead>
                <tbody>
                  {vacRanking.map(p => (
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.nombre}</td>
                      <td>{p.area}</td>
                      <td>{p.dias_vacaciones_total}</td>
                      <td>{p.dias_vacaciones_usados}</td>
                      <td>
                        <span style={{fontWeight:700, color:p._vacDisp>10?'var(--green)':p._vacDisp>0?'var(--warning)':'var(--fg-muted)'}}>
                          {p._vacDisp} días
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
                      const p = todosPersonal.find(x=>x.id===s.personal_id);
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
            {advAdendaManualAdmin && <div className="alert alert-warning" style={{marginBottom:16}}>Estás modificando el sueldo/cargo directamente en la ficha. Recuerda que este cambio requiere una adenda al contrato para tener respaldo legal ante SUNAFIL. Puedes subir la adenda en la pestaña Documentos.</div>}
            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos personales</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Nombre completo *</label><input className="input" required value={formAlta.nombre} onChange={e=>setFormAlta(v=>({...v,nombre:e.target.value}))} placeholder="Nombre completo" autoFocus/></div>
              <div className="input-group"><label>DNI / Documento *</label><input className="input" required value={formAlta.dni} onBlur={e=>verificarDniAlta(e.target.value)} onChange={e=>{ const val=e.target.value; setFormAlta(v=>({...v,dni:val})); if (String(val).trim().length >= 8) verificarDniAlta(val); }} placeholder="12345678"/></div>
              {historialDniAlta?.no_recontratar && <div className="alert alert-danger" style={{gridColumn:'1/-1', fontSize:12}}><strong>ALERTA - Personal no recontratable.</strong><br/>{historialDniAlta.nombre} (DNI {historialDniAlta.dni}) fue cesado el {historialDniAlta.fecha_cese || '-'} por: {historialDniAlta.no_recontratar_motivo || historialDniAlta.tipo_cese || '-'}. Este colaborador esta marcado como NO RECONTRATABLE. Verifique con la jefatura de RRHH antes de continuar.</div>}
              {historialDniAlta && !historialDniAlta.no_recontratar && String(historialDniAlta.estado_laboral || '').toLowerCase() === 'cesado' && <div className="alert alert-warning" style={{gridColumn:'1/-1', fontSize:12}}><strong>Historial de cese encontrado.</strong> {historialDniAlta.nombre} fue cesado el {historialDniAlta.fecha_cese || '-'} por {historialDniAlta.tipo_cese || '-'}.</div>}
              {historialDniAlta && !historialDniAlta.no_recontratar && String(historialDniAlta.estado_laboral || '').toLowerCase() !== 'cesado' && <div className="alert alert-warning" style={{gridColumn:'1/-1', fontSize:12}}><strong>Posible duplicado.</strong> Ya existe una ficha activa para {historialDniAlta.nombre} con este DNI.</div>}
              <div className="input-group"><label>Fecha de nacimiento</label><input className="input" type="date" value={formAlta.fecha_nacimiento} onChange={e=>setFormAlta(v=>({...v,fecha_nacimiento:e.target.value}))}/></div>
              <div className="input-group"><label>Teléfono celular</label><input className="input" type="tel" inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} value={formAlta.telefono} onChange={e=>setFormAlta(v=>({...v,telefono:sanitizePhone(e.target.value)}))} placeholder="9XXXXXXXX"/></div>
              <div className="input-group"><label>Email corporativo</label><input className="input" type="email" value={formAlta.email} onChange={e=>setFormAlta(v=>({...v,email:e.target.value}))} placeholder="nombre@empresa.pe"/></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Correo personal</label><input className="input" type="email" value={formAlta.email_personal} onChange={e=>setFormAlta(v=>({...v,email_personal:e.target.value}))} placeholder="correo@personal.com"/><div className="text-muted" style={{fontSize:11, marginTop:4}}>Usado como canal de verificación para firma electrónica y notificaciones. Debe ser un correo de uso personal, no corporativo.</div></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Celular personal (WhatsApp)</label><input className="input" type="text" inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} value={formAlta.celular_personal} onChange={e=>setFormAlta(v=>({...v,celular_personal:sanitizePhone(e.target.value)}))} placeholder="9XXXXXXXX"/><div className="text-muted" style={{fontSize:11, marginTop:4}}>Usado para notificaciones por WhatsApp y verificación. Debe ser un número personal, no asignado por la empresa.</div></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Dirección personal</label><input className="input" value={formAlta.direccion} onChange={e=>setFormAlta(v=>({...v,direccion:e.target.value}))} placeholder="Dirección completa"/></div>
              {esHonorariosAlta && (
                <div className="input-group">
                  <label>RUC <span style={{color:'var(--red)'}}>*</span></label>
                  <input className="input" type="text" inputMode="numeric" maxLength={11} pattern="[0-9]{11}" value={formAlta.ruc_colaborador} onChange={e=>setFormAlta(v=>({...v,ruc_colaborador:e.target.value.replace(/\D/g,'')}))} placeholder="20XXXXXXXXX"/>
                  <div className="text-muted" style={{fontSize:11, marginTop:4}}>11 dígitos. Requerido para emitir recibos por honorarios.</div>
                </div>
              )}
            </div>

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos laborales</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Código de empleado *</label><input className="input" value={formAlta.codigo} onChange={e=>setFormAlta(v=>({...v,codigo:e.target.value}))} placeholder="ADM-008" style={{fontWeight:700}}/><div className="text-muted" style={{fontSize:11, marginTop:4}}>Autogenerado por correlativo. Puedes editarlo si lo necesitas.</div></div>
              <div className="input-group"><label>Modalidad</label><select className="select" value={formAlta.modalidad} onChange={e=>setFormAlta(v=>{ const modalidad = normalizarModalidadContrato(e.target.value); return {...v, modalidad, tipo_contrato: modalidad === 'honorarios' ? 'por_encargo' : (v.tipo_contrato === 'por_encargo' ? 'indefinido' : v.tipo_contrato), ruc_colaborador: modalidad === 'honorarios' ? v.ruc_colaborador : ''}; })}><option value="planilla">Planilla</option><option value="honorarios">Honorarios</option></select></div>
              <div className="input-group"><label>Tipo de contrato</label><select className="select" value={tipoContratoAlta} disabled={esHonorariosAlta} onChange={e=>setFormAlta(v=>({...v,tipo_contrato:e.target.value}))}>{opcionesTipoContratoAlta.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
              <div className="input-group"><label>Cargo</label>
                <select className="select" value={formAlta.cargo_id} onChange={e=>{
                  if(e.target.value==='__nuevo__'){setFormAlta(v=>({...v,cargo_id:'__nuevo__'}));setNuevoCargoTextoAdmin('');return;}
                  const c=cargosAdminOptions.find(x=>x.id===e.target.value);
                  setFormAlta(v=>({...v,cargo_id:e.target.value,cargo:c?.nombre||v.cargo,posicion_id:''}));
                }}>
                  <option value="">Seleccionar cargo...</option>
                  {cargosAdminOptions.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                  <option value="__nuevo__">+ Agregar nuevo cargo...</option>
                </select>
                {formAlta.cargo_id==='__nuevo__' && <div style={{display:'flex',gap:6,marginTop:6}}>
                  <input className="input" value={nuevoCargoTextoAdmin} onChange={e=>setNuevoCargoTextoAdmin(e.target.value)} placeholder="Nombre del nuevo cargo" autoFocus/>
                  <button type="button" className="btn btn-sm" disabled={!nuevoCargoTextoAdmin.trim()} onClick={async()=>{const c=await crearCargo({nombre:nuevoCargoTextoAdmin.trim(),tipo:'Administrativo',estado:'activo'});setFormAlta(v=>({...v,cargo_id:c.id,cargo:c.nombre}));setNuevoCargoTextoAdmin('');}}>Crear</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setFormAlta(v=>({...v,cargo_id:''}))}>×</button>
                </div>}
              </div>
              <div className="input-group">
                <label>Posición organizacional <span className="text-muted">(opcional)</span></label>
                <select className="select" value={formAlta.posicion_id} onChange={e=>{
                  const posicion = posiciones.find(p => p.id === e.target.value);
                  setFormAlta(v=>({...v, posicion_id:e.target.value, area: posicion ? (unidadNombrePorId.get(posicion.unidad_organizacional_id) || '') : v.area}));
                }} disabled={!formAlta.cargo_id || formAlta.cargo_id === '__nuevo__'}>
                  <option value="">Sin posición asignada</option>
                  {posicionesParaCargoAlta.map(p=><option key={p.id} value={p.id}>{unidadNombrePorId.get(p.unidad_organizacional_id) || 'Sin unidad'} — {p.codigo || p.id.slice(0,8)}</option>)}
                </select>
                {!formAlta.cargo_id && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Selecciona primero un cargo para ver sus posiciones.</div>}
                {formAlta.cargo_id && !posicionesParaCargoAlta.length && <div className="text-muted" style={{fontSize:12, marginTop:6}}>No hay posiciones activas para este cargo.</div>}
              </div>
              <div className="input-group">
                <label>Unidad organizacional</label>
                <input className="input" readOnly value={posicionSeleccionadaAlta ? (unidadNombrePorId.get(posicionSeleccionadaAlta.unidad_organizacional_id) || 'Sin unidad asignada') : (formAlta.area || 'Se deriva de la posición')} style={{background:'var(--bg-subtle)'}}/>
              </div>
              <div className="input-group"><label>Sede asignada</label><select className="select" value={formAlta.sede} onChange={e=>setFormAlta(v=>({...v,sede:e.target.value}))}><option value="">Sin sede asignada</option>{sedesOptions.map(s=><option key={s.nombre} value={s.nombre}>{s.nombre}</option>)}</select></div>
              <div className="input-group"><label>CECO *</label><select className="select" required value={formAlta.centro_costo_id} onChange={e=>setFormAlta(v=>({...v,centro_costo_id:e.target.value}))}><option value="">{cecosActivosEscritura.length ? 'Seleccionar CECO...' : 'No hay Centros de Costo activos. Crea uno en Maestros Base antes de continuar.'}</option>{cecosActivosEscritura.map(c=><option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}</option>)}</select></div>
              <div className="input-group"><label>Turno asignado {esHonorariosAlta ? <span className="text-muted">(opcional, requerido para tomar asistencia)</span> : '*'}</label><select className="select" required={!esHonorariosAlta} value={formAlta.turno_id} onChange={e=>{ setHorasBaseOverride(false); setFormAlta(v=>({...v,turno_id:e.target.value,horas_base_mes:horasBaseParaTurno(e.target.value)})); }}><option value="">Seleccionar turno...</option>{turnosOptions.map(t=><option key={t.id} value={t.id}>{t.nombre} ({t.hora_entrada} - {t.hora_salida})</option>)}</select>{!turnosOptions.length && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Primero crea un turno en RRHH &gt; Turnos y Horarios.</div>}</div>
              <div className="input-group">
                <label>{esHonorariosAlta ? 'Inicio del encargo *' : 'Fecha de ingreso *'}</label>
                <input className="input" type="date" required value={formAlta.fecha_inicio} onChange={e=>setFormAlta(v=>({...v,fecha_inicio:e.target.value}))}/>
              </div>
              {!esHonorariosAlta && <div className="input-group">
                <label>{`Sueldo base (${tarifaSym})`}</label>
                <input className="input" type="number" min="0" value={formAlta.remuneracion} onChange={e=>setFormAlta(v=>({...v,remuneracion:e.target.value,monto_mensual:e.target.value}))} placeholder="0"/>
              </div>}
              <div className="input-group"><label>Estado</label><select className="select" value={formAlta.estado} onChange={e=>setFormAlta(v=>({...v,estado:e.target.value}))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="suspendido">Suspendido</option></select></div>
              {esHonorariosAlta && <>
                <div className="input-group">
                  <label>Retención IR (%)</label>
                  <input className="input" readOnly value={retencionIrHonorariosLabel(empresaConfig)} style={{background:'var(--bg-subtle)'}}/>
                  <div className="text-muted" style={{fontSize:11, marginTop:4}}>Por defecto 8%. Solo aplica si la empresa es Agente de Retención, el monto supera S/ 1,500 y no hay suspensión vigente.</div>
                </div>
                <label className="params-toggle-row" style={{cursor:'pointer'}}>
                  <input type="checkbox" className="checkbox" checked={formAlta.suspension_retenciones} onChange={e=>setFormAlta(v=>({...v,suspension_retenciones:e.target.checked, vencimiento_suspension:''}))}/>
                  <span>Tiene constancia de suspensión de retenciones</span>
                </label>
                {formAlta.suspension_retenciones && (
                  <div className="input-group" style={{gridColumn:'1/-1'}}>
                    <label>Vencimiento de la constancia <span className="text-muted">(opcional)</span></label>
                    <input className="input" type="date" value={formAlta.vencimiento_suspension} onChange={e=>setFormAlta(v=>({...v,vencimiento_suspension:e.target.value}))}/>
                    <div className="text-muted" style={{fontSize:11, marginTop:4}}>Sin fecha = suspensión indefinida. Con fecha = vence el día indicado.</div>
                  </div>
                )}
              </>}
            </div>

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Tarifa y Costeo</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group">
                <label>Metodo de pago *</label>
                <select className="select" required value={formAlta.metodo_pago} onChange={e=>setFormAlta(v=>({...v,metodo_pago:e.target.value}))}>
                  <option value="mensual">Mensual</option>
                  <option value="por_horas">Por horas</option>
                </select>
              </div>
              {esHonorariosAlta ? <>
                <div className="input-group">
                  <label>Honorario pactado ({tarifaSym})</label>
                  <input className="input" type="number" min="0" step="0.01" value={formAlta.monto_mensual} onChange={e=>{const m=e.target.value;setFormAlta(v=>({...v,monto_mensual:m,remuneracion:m,tarifa_hora_referencial:Number(m)>0?String(Math.round(Number(m)/160*100)/100):'0'}));}} placeholder="0"/>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Tarifa hora referencial ({tarifaSym})</label>
                  <input className="input" type="number" min="0" step="0.01" value={formAlta.tarifa_hora_referencial} onChange={e=>setFormAlta(v=>({...v,tarifa_hora_referencial:e.target.value}))} placeholder="0"/>
                  <div className="text-muted" style={{fontSize:11,marginTop:4}}>Usado para imputar costo de mano de obra en órdenes de trabajo y partes diarios. No es un dato tributario ni laboral.</div>
                </div>
              </> : <>
                <div className="input-group">
                  <label>Monto mensual ({tarifaSym})</label>
                  <input className="input" type="number" min="0" step="0.01" value={formAlta.monto_mensual} onChange={e=>setFormAlta(v=>({...v,monto_mensual:e.target.value,remuneracion:e.target.value}))} placeholder="0"/>
                </div>
                <div className="input-group">
                  <label>Horas base del mes</label>
                  <div className="row" style={{gap:8, alignItems:'stretch'}}>
                    <input className="input" type="number" min="0" step="0.5" readOnly={!horasBaseOverride} value={formAlta.horas_base_mes} onChange={e=>setFormAlta(v=>({...v,horas_base_mes:e.target.value}))} placeholder="0" style={{background:horasBaseOverride ? undefined : 'var(--bg-subtle)', flex:1}}/>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={()=>{ if (horasBaseOverride) setFormAlta(v=>({...v,horas_base_mes:horasBaseParaTurno(v.turno_id)})); setHorasBaseOverride(v=>!v); }}>{horasBaseOverride ? 'Usar turno' : 'Override manual'}</button>
                  </div>
                  <div className="text-muted" style={{fontSize:11, marginTop:4}}>Se actualiza desde el turno asignado.</div>
                </div>
                <div className="input-group">
                  <label>Tarifa por hora ({tarifaSym})</label>
                  <input className="input" type="text" readOnly value={tarifaHoraForm.toFixed(2)} style={{background:'var(--bg-subtle)', fontWeight:700}}/>
                  <div className="text-muted" style={{fontSize:11, marginTop:4}}><span style={{display:'inline-block',width:12,height:12,verticalAlign:'middle'}}>{I.dollar}</span> Calculado automáticamente</div>
                </div>
              </>}
            </div>

            {!esHonorariosAlta && <>
              <div className="alert alert-info" style={{fontSize:12, marginBottom:12}}>La jornada se asigna después de registrar y validar el contrato, desde <strong>Jornada → + Nueva asignación</strong> en la ficha del trabajador.</div>
              {editandoId && <div className="alert alert-info" style={{fontSize:12, marginBottom:12}}>El régimen vigente es de solo lectura. Los cambios deben registrarse como una nueva asignación de jornada.</div>}
              <div className="grid-2" style={{display:'none'}} aria-hidden="true">
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Régimen de jornada</label>
                  <select className="select" disabled={!!editandoId} value={formAlta.regimen_jornada} onChange={e=>{
                    const val = e.target.value;
                    const presets = { minero_14x7:[14,7], minero_20x10:[20,10], minero_28x14:[28,14], minero_2x1:[2,1] };
                    if (presets[val]) {
                      const [t,d] = presets[val];
                      setFormAlta(v=>({...v, regimen_jornada:val, horas_diarias_pactadas:'12', dias_ciclo_trabajo:String(t), dias_ciclo_descanso:String(d)}));
                    } else {
                      setFormAlta(v=>({...v, regimen_jornada:val, horas_diarias_pactadas:'8', dias_ciclo_trabajo:'', dias_ciclo_descanso:'', fecha_inicio_ciclo:''}));
                    }
                  }}>
                    <option value="general">General (8h/día estándar)</option>
                    <option value="minero_14x7">Minero 14×7</option>
                    <option value="minero_20x10">Minero 20×10</option>
                    <option value="minero_28x14">Minero 28×14</option>
                    <option value="minero_2x1">Minero 2×1</option>
                  </select>
                </div>
                {formAlta.regimen_jornada !== 'general' && <>
                  <div className="input-group"><label>Horas diarias pactadas <span className="text-muted">(D. Leg. 857)</span></label><input className="input" type="number" min="1" max="12" value={formAlta.horas_diarias_pactadas} onChange={e=>setFormAlta(v=>({...v,horas_diarias_pactadas:e.target.value}))}/></div>
                  <div className="input-group"><label>Fecha inicio del ciclo actual</label><input className="input" type="date" readOnly={!!editandoId} value={formAlta.fecha_inicio_ciclo} onChange={e=>setFormAlta(v=>({...v,fecha_inicio_ciclo:e.target.value}))}/></div>
                  <div className="input-group"><label>Días de trabajo en el ciclo</label><input className="input" type="number" value={formAlta.dias_ciclo_trabajo} readOnly/></div>
                  <div className="input-group"><label>Días de descanso en el ciclo</label><input className="input" type="number" value={formAlta.dias_ciclo_descanso} readOnly/></div>
                  <div className="card" style={{gridColumn:'1/-1', padding:'8px 12px', background:'rgba(6,182,212,0.08)', fontSize:12, color:'var(--cyan)'}}>Ciclo de {(Number(formAlta.dias_ciclo_trabajo)||0) + (Number(formAlta.dias_ciclo_descanso)||0)} días: {Number(formAlta.dias_ciclo_trabajo)||0} en campo + {Number(formAlta.dias_ciclo_descanso)||0} de descanso.</div>
                  <div className="input-group" style={{gridColumn:'1/-1'}}><label>Bonificación por altitud (S/)</label><input className="input" type="number" min="0" step="0.01" value={formAlta.bonif_altitud} onChange={e=>setFormAlta(v=>({...v,bonif_altitud:e.target.value}))} placeholder="0 si no aplica"/></div>
                  <div className="card" style={{gridColumn:'1/-1', padding:'8px 12px', background:'rgba(6,182,212,0.08)', fontSize:12, color:'var(--cyan)'}}>⛏ Este trabajador usa cálculo proporcional por días computables en cada período.</div>
                </>}
              </div>

              <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Descuentos de nómina</div>
              <div className="grid-2" style={{gap:14, marginBottom:20}}>
                <div className="input-group"><label>Cuota préstamo mes</label><input className="input" type="number" min="0" value={formAlta.cuota_prestamo_mes} onChange={e=>setFormAlta(v=>({...v,cuota_prestamo_mes:e.target.value}))}/></div>
                <div className="input-group"><label>Descuento judicial</label><input className="input" type="number" min="0" value={formAlta.descuento_judicial} onChange={e=>setFormAlta(v=>({...v,descuento_judicial:e.target.value}))}/></div>
                <label className="row" style={{gap:8, gridColumn:'1/-1', alignItems:'center'}}><input type="checkbox" checked={formAlta.tiene_hijos} onChange={e=>setFormAlta(v=>({...v,tiene_hijos:e.target.checked}))}/> Tiene hijos (asignación familiar S/ {asignacionFamiliar.toFixed(2)})</label>
                <label className="params-toggle-row" style={{gridColumn:'1/-1', cursor:'pointer'}}><input type="checkbox" className="checkbox" checked={formAlta.cargo_confianza} onChange={e=>setFormAlta(v=>({...v,cargo_confianza:e.target.checked}))}/><span>Cargo de dirección o confianza (excluido de fiscalización de horario)</span></label>
                {formAlta.cargo_confianza && <div className="alert alert-warning" style={{gridColumn:'1/-1', fontSize:12}}>Este colaborador no aparecerá en el registro diario de asistencia ni se le calcularán tardanzas u horas extra. Asegúrate de que la exclusión conste en su contrato.</div>}
                <div style={{gridColumn:'1/-1'}}><span className="badge badge-gray">Fiscalización: {fiscalizacionLabel(tipoFiscalizacionAlta)}</span></div>
                <div style={{gridColumn:'1/-1'}}><span className="badge badge-gray">Vacaciones: {vacacionesSugeridas} días/año (según régimen {{general:'General',pequena_empresa:'Pequeña empresa',microempresa:'Microempresa'}[empresaConfig?.regimen_laboral_empresa||'general']||'General'})</span></div>
              </div>
            </>}

            {!esHonorariosAlta && <>
              <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Sistema previsional</div>
              <div className="grid-2" style={{gap:14, marginBottom:20}}>
                <div className="input-group">
                  <label>Sistema pensionario</label>
                  <select className="select" value={formAlta.sistema_pensionario} onChange={e=>setFormAlta(v=>({...v,sistema_pensionario:e.target.value}))}>
                    <option value="AFP">AFP</option>
                    <option value="ONP">ONP</option>
                  </select>
                </div>
                {formAlta.sistema_pensionario === 'AFP' ? <>
                  <div className="input-group">
                    <label>AFP</label>
                    <select className="select" value={formAlta.afp_nombre} onChange={e=>{
                      const tasas = {Habitat:1.47,Integra:1.55,Prima:1.60,Profuturo:1.69};
                      setFormAlta(v=>({...v,afp_nombre:e.target.value,pct_comision_afp_flujo:String(tasas[e.target.value]??v.pct_comision_afp_flujo)}));
                    }}>
                      <option>Habitat</option><option>Integra</option><option>Prima</option><option>Profuturo</option>
                    </select>
                  </div>
                  {!esHonorariosAlta && <>
                    <div className="input-group">
                      <label>Tipo de comisión</label>
                      <select className="select" value={formAlta.tipo_comision_afp} onChange={e=>setFormAlta(v=>({...v,tipo_comision_afp:e.target.value}))}>
                        <option value="mixta">Mixta</option><option value="flujo">Por flujo</option>
                      </select>
                    </div>
                    {formAlta.tipo_comision_afp === 'flujo'
                      ? <div className="input-group"><label>Comisión por flujo (%)</label><input className="input" type="number" min="0" step="0.01" value={formAlta.pct_comision_afp_flujo} onChange={e=>setFormAlta(v=>({...v,pct_comision_afp_flujo:e.target.value}))}/></div>
                      : <div className="card" style={{padding:'8px 12px', fontSize:12, color:'var(--fg-muted)'}}>Comisión mixta: se descuenta del fondo, no del sueldo mensual.</div>
                    }
                    <div className="card" style={{padding:'8px 12px', fontSize:12, color:'var(--fg-muted)'}}>Prima de seguro: según tasa vigente de la AFP seleccionada (ver Parámetros → Nómina)</div>
                  </>}
                </> : <div className="card" style={{gridColumn:'1/-1', padding:'10px 14px', fontSize:13}}>ONP — Tasa: 13% sobre remuneración asegurable.</div>}
              </div>
            </>}

            {(() => {
              return (
                <>
                  <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Configuración de comisiones</div>
                  <div className="grid-2" style={{gap:14, marginBottom:20}}>
                    <div className="input-group" style={{gridColumn:'1/-1'}}>
                      <label style={{display:'flex', alignItems:'center', gap:10, cursor:'pointer'}}>
                        <input type="checkbox" checked={Boolean(formAlta.tiene_comisiones)} onChange={e=>setFormAlta(v=>({...v,tiene_comisiones:e.target.checked}))} style={{width:16, height:16}}/>
                        <span>Tiene comisiones activas</span>
                      </label>
                    </div>
                    {formAlta.tiene_comisiones && <>
                      <div className="input-group">
                        <label>Comisión base (%)</label>
                        <input className="input" type="number" min="0" max="100" step="0.1" value={formAlta.porcentaje_comision} onChange={e=>setFormAlta(v=>({...v,porcentaje_comision:e.target.value}))} placeholder="5.0"/>
                        <div className="text-muted" style={{fontSize:11, marginTop:4}}>Porcentaje sobre el monto cobrado de cada factura.</div>
                      </div>
                      <div className="input-group">
                        <label>Modalidad de pago</label>
                        <select className="select" value={formAlta.modalidad_comision} onChange={e=>setFormAlta(v=>({...v,modalidad_comision:e.target.value}))}>
                          <option value="Planilla">Planilla</option>
                          <option value="Honorarios">Honorarios</option>
                        </select>
                      </div>
                      {formAlta.modalidad_comision === 'Honorarios' && <>
                        {esHonorariosAlta ? (
                          <div className="input-group" style={{gridColumn:'1/-1'}}>
                            <div className="text-muted" style={{fontSize:12, padding:'8px 12px', background:'var(--bg-subtle)', borderRadius:6}}>
                              RUC para el pago: se usará el RUC ingresado en Datos Personales (<strong>{formAlta.ruc_colaborador || '—'}</strong>).
                            </div>
                          </div>
                        ) : (
                          <div className="input-group">
                            <label>RUC del vendedor <span style={{color:'var(--red)'}}>*</span></label>
                            <input className="input" type="text" inputMode="numeric" maxLength={11} pattern="[0-9]{11}" value={formAlta.ruc_vendedor} onChange={e=>setFormAlta(v=>({...v,ruc_vendedor:e.target.value.replace(/\D/g,'')}))} placeholder="20XXXXXXXXX"/>
                            <div className="text-muted" style={{fontSize:11, marginTop:4}}>Requerido para emitir recibos por honorarios.</div>
                          </div>
                        )}
                        <div className="input-group">
                          <label>Retención IR (%)</label>
                          <input className="input" type="number" min="0" max="30" step="0.5" value={formAlta.retencion_ir_comision} onChange={e=>setFormAlta(v=>({...v,retencion_ir_comision:e.target.value}))} placeholder="8"/>
                          <div className="text-muted" style={{fontSize:11, marginTop:4}}>Por defecto 8%. Solo aplica si la empresa es Agente de Retención, el monto supera S/ 1,500 y no hay suspensión vigente.</div>
                        </div>
                        <label className="params-toggle-row" style={{gridColumn:'1/-1', cursor:'pointer'}}>
                          <input type="checkbox" className="checkbox" checked={formAlta.suspension_retenciones} onChange={e=>setFormAlta(v=>({...v,suspension_retenciones:e.target.checked, vencimiento_suspension:''}))}/>
                          <span>Tiene constancia de suspensión de retenciones</span>
                        </label>
                        {formAlta.suspension_retenciones && (
                          <div className="input-group">
                            <label>Vencimiento de la constancia <span className="text-muted">(opcional)</span></label>
                            <input className="input" type="date" value={formAlta.vencimiento_suspension} onChange={e=>setFormAlta(v=>({...v,vencimiento_suspension:e.target.value}))}/>
                            <div className="text-muted" style={{fontSize:11, marginTop:4}}>Sin fecha = suspensión indefinida. Con fecha = vence el día indicado.</div>
                          </div>
                        )}
                      </>}
                    </>}
                  </div>
                </>
              );
            })()}

            {canFinanzasAdmin && (
              <div style={{marginBottom:20}}>
                <DatosBancariosAdmin cuentas={formDatosBancariosAdmin} onChange={setFormDatosBancariosAdmin}/>
              </div>
            )}

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Acceso al sistema</div>
            <div style={{marginBottom:24}}>
              {editandoId ? (
                <div className="input-group">
                  <label>Cuenta de usuario <span className="text-muted">(opcional — para aislamiento de datos)</span></label>
                  <select className="select" value={formAlta.auth_user_id} onChange={e=>setFormAlta(v=>({...v,auth_user_id:e.target.value}))}>
                    <option value="">Sin cuenta vinculada</option>
                    {usuariosEmpresa.map(u=><option key={u.id} value={u.id}>{u.nombre || u.email} — {u.email}</option>)}
                  </select>
                  <div className="text-muted" style={{fontSize:11, marginTop:5}}>Vincula este colaborador a su cuenta de inicio de sesión para que las políticas de visibilidad se apliquen correctamente.</div>
                </div>
              ) : (
                <>
                  <label className="row" style={{gap:8, alignItems:'center', marginBottom:8}}>
                    <input type="checkbox" checked={crearUsuarioSistemaAdmin} onChange={e=>setCrearUsuarioSistemaAdmin(e.target.checked)}/>
                    ¿Crear usuario de sistema?
                  </label>
                  <div className="text-muted" style={{fontSize:12, marginBottom:crearUsuarioSistemaAdmin?12:0}}>Activa esto solo si este colaborador necesita acceder al ERP. No todo el personal administrativo requiere acceso al sistema.</div>
                  {crearUsuarioSistemaAdmin && (
                    <div className="grid-2" style={{gap:12}}>
                      <div className="input-group" style={{gridColumn:'1/-1'}}><label>Email de acceso <span style={{color:'var(--danger)'}}>*</span></label><input className="input" type="email" value={usuarioSistemaFormAdmin.email} onChange={e=>setUsuarioSistemaFormAdmin(v=>({...v,email:e.target.value}))} placeholder="colaborador@empresa.com"/></div>
                      <div className="input-group"><label>Rol de sistema</label><select className="select" value={usuarioSistemaFormAdmin.rol} onChange={e=>setUsuarioSistemaFormAdmin(v=>({...v,rol:e.target.value}))}><option value="">Seleccionar rol</option>{Object.entries(rolesCtx).map(([k,r])=><option key={k} value={k}>{r.nombre||k}</option>)}</select></div>
                      <div className="input-group"><label>Perfil de campo</label><select className="select" value={usuarioSistemaFormAdmin.perfil_campo} onChange={e=>setUsuarioSistemaFormAdmin(v=>({...v,perfil_campo:e.target.value}))}><option value="administrativo">Administrativo</option><option value="supervisor">Supervisor</option><option value="gerencia">Gerencia</option><option value="vendedor">Vendedor</option><option value="comprador">Comprador</option></select></div>
                      <div style={{gridColumn:'1/-1'}}>
                        <PosicionSelector
                          value={usuarioSistemaFormAdmin.posicion_id}
                          onChange={posicionId => setUsuarioSistemaFormAdmin(v=>({...v,posicion_id:posicionId}))}
                          posiciones={posiciones}
                          posicionesUsuarios={posicionesUsuarios}
                          unidadesOrganizacionales={unidadesOrganizacionales}
                          cargos={cargos}
                          usuarios={usuarios}
                          onCrearPosicion={crearPosicion}
                        />
                      </div>
                      <label className="row" style={{gap:8, alignItems:'center', gridColumn:'1/-1'}}><input type="checkbox" checked={usuarioSistemaFormAdmin.acceso_campo} onChange={e=>setUsuarioSistemaFormAdmin(v=>({...v,acceso_campo:e.target.checked}))}/>Acceso a app de campo</label>
                    </div>
                  )}
                </>
              )}
            </div>

            {altaError && <div className="alert alert-danger" style={{marginBottom:12}}>{altaError}</div>}
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

// ─── ORGANIGRAMA ─────────────────────────────────────────────────────────────

const NIVEL_COLORS = {
  direccion: '#7c3aed',
  jefatura: '#2563eb',
  supervisor: '#0891b2',
  asesor: '#16a34a',
  operativo: '#64748b',
  soporte: '#64748b',
};

function OrgNodo({ posicion, depth, getChildren, ocupantesPorPosicion, unidadNombrePorId, roles, selId, onSelect }) {
  const [abierto, setAbierto] = useState(depth < 2);
  const hijos = getChildren(posicion.id);
  const ocupantes = ocupantesPorPosicion.get(posicion.id) || [];
  const vacante = ocupantes.length === 0;
  const nivel = ocupantes[0] ? getUserHierarchyLevel(ocupantes[0], roles) : null;
  const color = vacante ? '#94a3b8' : (NIVEL_COLORS[nivel] || '#64748b');
  const seleccionado = selId === posicion.id;
  const unidadNombre = unidadNombrePorId.get(posicion.unidad_organizacional_id) || 'Sin unidad';
  const etiqueta = vacante ? 'Posicion vacante' : ocupantes.map(o => o.nombre).join(' + ');
  const otrasAsignaciones = (ocupantes[0]?.posiciones || []).filter(p => !p.principal);
  const tieneRespaldo = ocupantes.some(o => o.esPosicionRespaldo);

  return (
    <div style={{ position: 'relative', marginLeft: depth > 0 ? 28 : 0 }}>
      {depth > 0 && (
        <div style={{ position: 'absolute', left: -20, top: 19, width: 20, borderTop: '1px solid var(--border)' }} />
      )}
      <div
        onClick={() => onSelect(posicion)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 12px', borderRadius: 8, marginBottom: 5, cursor: 'pointer',
          border: `1px ${vacante ? 'dashed' : 'solid'} ${seleccionado ? color : 'var(--border)'}`,
          background: seleccionado ? `color-mix(in srgb, ${color} 9%, transparent)` : 'var(--card)',
          borderLeft: `3px solid ${color}`,
        }}
      >
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {vacante ? '—' : ocupantes.map(o => (o.nombre || '?')[0]).slice(0, 2).join('')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: vacante ? 'italic' : 'normal', color: vacante ? 'var(--fg-muted)' : 'inherit' }}>
            {etiqueta}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {unidadNombre}
            {otrasAsignaciones.length > 0 && ` · también en ${otrasAsignaciones.map(a => a.unidad_organizacional_nombre || '?').join(', ')}`}
          </div>
        </div>
        {tieneRespaldo && (
          <span
            title="Posición sin vínculo principal confirmado — revisar"
            style={{ width: 16, height: 16, flexShrink: 0, display: 'inline-flex', color: 'var(--orange)' }}
          >
            {I.alert}
          </span>
        )}
        {hijos.length > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setAbierto(x => !x); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: 'var(--fg-muted)', fontSize: 12, borderRadius: 4, flexShrink: 0 }}
          >
            {abierto ? '▾' : '▸'} {hijos.length}
          </button>
        )}
      </div>
      {abierto && hijos.length > 0 && (
        <div style={{ marginLeft: 16, paddingLeft: 12, borderLeft: '1px dashed var(--border)' }}>
          {hijos.map(h => (
            <OrgNodo
              key={h.id} posicion={h} depth={depth + 1} getChildren={getChildren}
              ocupantesPorPosicion={ocupantesPorPosicion} unidadNombrePorId={unidadNombrePorId}
              roles={roles} selId={selId} onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Organigrama() {
  const {
    usuarios, posiciones, posicionesUsuarios, unidadesOrganizacionales, cargos = [],
    empresa, empresasPlataforma, roles: rolesCtx, actualizarUsuarioAcceso, reasignarUnidadDePosicion, reasignarPadreDePosicion,
    crearPosicion, archivarPosicion, eliminarPosicion, reasignarCargoDePosicion, addNotificacion, authUser,
    personalAdmin = [], personalOperativo = [], nivelesJerarquicos = [],
  } = useApp();
  const nivelesActivos = nivelesJerarquicos.filter(n => n.estado === 'activo').sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100));
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [selNode, setSelNode] = useState(null);
  const [selOcupanteId, setSelOcupanteId] = useState(null);
  const [nuevaPosicionId, setNuevaPosicionId] = useState('');
  const [nuevoRolId, setNuevoRolId] = useState('');
  const [nuevaUnidadId, setNuevaUnidadId] = useState('');
  const [nuevaPosicionPadreId, setNuevaPosicionPadreId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardandoRol, setGuardandoRol] = useState(false);
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);
  const [guardandoPadre, setGuardandoPadre] = useState(false);
  const [showAsignarCargos, setShowAsignarCargos] = useState(false);
  const [vistaOrganigrama, setVistaOrganigrama] = useState('arbol');

  const empresaActiva = filtroEmpresa || empresa?.id || '';
  const usersDeEmpresa = useMemo(
    () => usuarios.filter(u => !empresaActiva || u.empresa_id === empresaActiva),
    [usuarios, empresaActiva]
  );
  const usuariosPorId = useMemo(() => new Map(usersDeEmpresa.map(u => [u.id, u])), [usersDeEmpresa]);
  const posicionesDeEmpresa = useMemo(
    () => (posiciones || []).filter(p => !empresaActiva || p.empresa_id === empresaActiva),
    [posiciones, empresaActiva]
  );
  const posicionPorId = useMemo(() => new Map(posicionesDeEmpresa.map(p => [p.id, p])), [posicionesDeEmpresa]);
  const unidadNombrePorId = useMemo(
    () => new Map((unidadesOrganizacionales || []).map(u => [u.id, u.nombre])),
    [unidadesOrganizacionales]
  );
  const ocupantesPorPosicion = useMemo(
    () => buildOcupantesPorPosicion(posicionesUsuarios.filter(pu => posicionPorId.has(pu.posicion_id)), usuariosPorId, posicionPorId),
    [posicionesUsuarios, posicionPorId, usuariosPorId]
  );

  // Conteo para el boton "Asignar cargos" -- el detalle/sugerencia vive en AsignacionCargosModal.
  const posicionesSinCargoCount = useMemo(
    () => getPosicionesSinCargo(posicionesDeEmpresa).length,
    [posicionesDeEmpresa]
  );

  // Una posicion se muestra como nodo propio del arbol si esta vacante o si es la posicion
  // PRINCIPAL de su ocupante (o, en su defecto, la posicion de respaldo elegida cuando la
  // persona no tiene ningun vinculo principal real -- ver buildOcupantesPorPosicion). Las
  // posiciones matriciales ocupadas no generan un nodo aparte (para no repetir el nombre de la
  // misma persona varias veces); su info se muestra como etiqueta secundaria en el nodo
  // principal de esa persona (ver OrgNodo).
  const esPosicionVisible = (posicion) => {
    const ocupantes = ocupantesPorPosicion.get(posicion.id) || [];
    return ocupantes.length === 0 || ocupantes.some(o => o.esPosicionPrincipal || o.esPosicionRespaldo);
  };
  const padreVisible = (posicion) => {
    let actual = posicionPorId.get(posicion.reporta_a_posicion_id);
    while (actual && !esPosicionVisible(actual)) {
      actual = posicionPorId.get(actual.reporta_a_posicion_id);
    }
    return actual || null;
  };
  const posicionesVisibles = useMemo(
    () => posicionesDeEmpresa.filter(esPosicionVisible),
    [posicionesDeEmpresa, ocupantesPorPosicion]
  );
  const roots = useMemo(
    () => posicionesVisibles.filter(p => !padreVisible(p)),
    [posicionesVisibles, posicionPorId, ocupantesPorPosicion]
  );
  const getChildren = (posicionId) => posicionesVisibles.filter(p => padreVisible(p)?.id === posicionId);

  const selOcupantes = selNode ? (ocupantesPorPosicion.get(selNode.id) || []) : [];
  const selOcupante = selOcupantes.find(o => o.id === selOcupanteId) || selOcupantes[0] || null;
  // Subordinados directos reales (incluye posiciones matriciales ocupadas, no solo las
  // que se muestran como nodo propio del arbol) -- para advertir antes de mover de unidad.
  const subordinadosDirectos = selNode
    ? posicionesDeEmpresa.filter(p => p.reporta_a_posicion_id === selNode.id).length
    : 0;

  const rolesOpciones = useMemo(
    () => Object.entries(rolesCtx || {})
      .filter(([, r]) => !r.es_superadmin && (!empresaActiva || !r.empresa_id || r.empresa_id === empresaActiva))
      .sort((a, b) => (a[1].nombre || '').localeCompare(b[1].nombre || '', 'es')),
    [rolesCtx, empresaActiva]
  );

  const seleccionarPosicion = (posicion) => {
    setSelNode(posicion);
    const ocupantes = ocupantesPorPosicion.get(posicion.id) || [];
    const primero = ocupantes[0] || null;
    setSelOcupanteId(primero?.id || null);
    setNuevaPosicionId(primero ? (getPrimaryPosicion(primero)?.posicion_id || '') : '');
    setNuevoRolId(primero?.rol || '');
    setNuevaUnidadId(posicion.unidad_organizacional_id || '');
    setNuevaPosicionPadreId(posicion.reporta_a_posicion_id || '');
  };

  const handleGuardarUnidad = async () => {
    if (!selNode || !nuevaUnidadId || nuevaUnidadId === selNode.unidad_organizacional_id) return;
    setGuardandoUnidad(true);
    try {
      await reasignarUnidadDePosicion(selNode.id, nuevaUnidadId);
      setSelNode(n => n ? { ...n, unidad_organizacional_id: nuevaUnidadId } : null);
      addNotificacion(
        subordinadosDirectos > 0
          ? `Unidad actualizada. Sus ${subordinadosDirectos} subordinado(s) directo(s) mantienen su propia unidad (no se movieron en cascada).`
          : 'Unidad organizacional actualizada.'
      );
    } catch {
      addNotificacion('No se pudo actualizar la unidad organizacional.');
    }
    setGuardandoUnidad(false);
  };

  const handleGuardarPosicion = async () => {
    if (!selOcupante || !nuevaPosicionId) return;
    setGuardando(true);
    try {
      await actualizarUsuarioAcceso(selOcupante.id, { ...selOcupante, posicion_id: nuevaPosicionId });
      addNotificacion('Posicion actualizada.');
    } catch {
      addNotificacion('No se pudo actualizar la posicion.');
    }
    setGuardando(false);
  };

  const handleGuardarPadre = async () => {
    if (!selNode) return;
    const padreId = nuevaPosicionPadreId || null;
    if (padreId === (selNode.reporta_a_posicion_id || null)) return;
    setGuardandoPadre(true);
    try {
      await reasignarPadreDePosicion(selNode.id, padreId);
      setSelNode(n => n ? { ...n, reporta_a_posicion_id: padreId } : null);
      addNotificacion('Jerarquía de la posición actualizada.');
    } catch (err) {
      addNotificacion(`No se pudo actualizar la jerarquía: ${err?.message || 'error desconocido'}`);
    } finally {
      setGuardandoPadre(false);
    }
  };

  const handleGuardarRol = async () => {
    if (!selOcupante || !nuevoRolId) return;
    setGuardandoRol(true);
    try {
      await actualizarUsuarioAcceso(selOcupante.id, { ...selOcupante, rol: nuevoRolId });
      addNotificacion('Rol actualizado.');
    } catch {
      addNotificacion('No se pudo actualizar el rol.');
    }
    setGuardandoRol(false);
  };

  const nivelLabel = (n) => nivelesJerarquicos.find(x => x.codigo === n)?.nombre || n;
  const getEmpresaNombre = (id) => {
    if (empresa?.id === id) return empresa.nombre;
    return (empresasPlataforma || []).find(e => e.id === id)?.nombre || id;
  };

  const isSuperadmin = authUser?.permisos?.plataforma;
  const selVacante = Boolean(selNode) && selOcupantes.length === 0;
  const selRolEfectivo = nuevoRolId || selOcupante?.rol;
  const selNivel = selOcupante ? (rolesCtx?.[selRolEfectivo]?.nivel_jerarquico || getUserHierarchyLevel(selOcupante, rolesCtx)) : null;
  const selColor = selVacante ? '#94a3b8' : (NIVEL_COLORS[selNivel] || '#64748b');
  const selRol = rolesCtx?.[selRolEfectivo];
  const posicionJefe = selNode ? posicionPorId.get(selNode.reporta_a_posicion_id) : null;
  const ocupantesJefe = posicionJefe ? (ocupantesPorPosicion.get(posicionJefe.id) || []) : [];
  const selHijos = selNode ? getChildren(selNode.id) : [];
  const posicionNoChanged = nuevaPosicionId === (getPrimaryPosicion(selOcupante)?.posicion_id || '');
  const padreNoChanged = nuevaPosicionPadreId === (selNode?.reporta_a_posicion_id || '');
  const opcionesPadre = selNode ? posicionesDeEmpresa.filter(p => p.id !== selNode.id) : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Organigrama</h1>
          <div className="page-sub">
            {vistaOrganigrama === 'arbol' ? 'Árbol de posiciones' : 'Gestión de posiciones'} · {posicionesDeEmpresa.length} posiciones
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAsignarCargos(true)}>
            Asignar cargos {posicionesSinCargoCount > 0 ? `(${posicionesSinCargoCount} pendientes)` : '(completo)'}
          </button>
          {isSuperadmin && (
            <select className="input" style={{ width: 240 }} value={filtroEmpresa} onChange={e => { setFiltroEmpresa(e.target.value); setSelNode(null); }}>
              <option value="">Todas las empresas</option>
              {[...new Map(usuarios.map(u => [u.empresa_id, getEmpresaNombre(u.empresa_id)])).entries()].map(([id, nombre]) => (
                <option key={id} value={id}>{nombre}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="tabs" style={{ marginTop: 24, marginBottom: 20 }}>
        <div className={'tab ' + (vistaOrganigrama === 'arbol' ? 'active' : '')} onClick={() => setVistaOrganigrama('arbol')}>Árbol</div>
        <div className={'tab ' + (vistaOrganigrama === 'gestion' ? 'active' : '')} onClick={() => setVistaOrganigrama('gestion')}>Gestión de Posiciones</div>
      </div>

      {showAsignarCargos && (
        <AsignacionCargosModal
          posiciones={posicionesDeEmpresa}
          ocupantesPorPosicion={ocupantesPorPosicion}
          unidadNombrePorId={unidadNombrePorId}
          cargos={cargos}
          personalAdmin={personalAdmin}
          personalOperativo={personalOperativo}
          reasignarCargoDePosicion={reasignarCargoDePosicion}
          addNotificacion={addNotificacion}
          onClose={() => setShowAsignarCargos(false)}
        />
      )}

      {vistaOrganigrama === 'gestion' && (
        <GestionPosicionesTab
          posiciones={posicionesDeEmpresa}
          posicionesUsuarios={posicionesUsuarios}
          ocupantesPorPosicion={ocupantesPorPosicion}
          unidadNombrePorId={unidadNombrePorId}
          posicionPorId={posicionPorId}
          unidadesOrganizacionales={unidadesOrganizacionales}
          cargos={cargos}
          usuarios={usersDeEmpresa}
          reasignarUnidadDePosicion={reasignarUnidadDePosicion}
          reasignarCargoDePosicion={reasignarCargoDePosicion}
          crearPosicion={crearPosicion}
          archivarPosicion={archivarPosicion}
          eliminarPosicion={eliminarPosicion}
          addNotificacion={addNotificacion}
        />
      )}

      {vistaOrganigrama === 'arbol' && (<>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {nivelesActivos.map(l => (
          <div key={l.codigo} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: NIVEL_COLORS[l.codigo] || '#64748b', flexShrink: 0 }} />
            <span style={{ color: 'var(--fg-muted)' }}>{l.nombre}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#94a3b8', flexShrink: 0, border: '1px dashed #64748b' }} />
          <span style={{ color: 'var(--fg-muted)' }}>Posicion vacante</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Árbol */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {roots.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--fg-muted)' }}>
              No hay posiciones configuradas todavia. Ve a Usuarios y asigna un jefe directo a cada persona.
            </div>
          ) : (
            <div className="card" style={{ padding: 20 }}>
              {roots.map(r => (
                <OrgNodo
                  key={r.id} posicion={r} depth={0}
                  getChildren={getChildren} ocupantesPorPosicion={ocupantesPorPosicion}
                  unidadNombrePorId={unidadNombrePorId} roles={rolesCtx}
                  selId={selNode?.id}
                  onSelect={seleccionarPosicion}
                />
              ))}
            </div>
          )}
        </div>

        {/* Panel lateral */}
        {selNode && (
          <div className="card" style={{ width: 300, padding: 20, flexShrink: 0, position: 'sticky', top: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Detalle</div>
              <button className="icon-btn" onClick={() => setSelNode(null)}>{I.x}</button>
            </div>

            <div className="input-group" style={{ marginBottom: 8 }}>
              <label>Unidad organizacional</label>
              <select className="select" value={nuevaUnidadId} onChange={e => setNuevaUnidadId(e.target.value)}>
                {(unidadesOrganizacionales || []).filter(u => u.estado === 'activo' || u.id === selNode.unidad_organizacional_id).map(u => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
            {subordinadosDirectos > 0 && (
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 8, fontStyle: 'italic' }}>
                Esta posición tiene {subordinadosDirectos} subordinado(s) directo(s). Cambiar su unidad no los mueve a ellos.
              </div>
            )}
            <button
              className="btn btn-secondary"
              style={{ width: '100%', marginBottom: 14 }}
              onClick={handleGuardarUnidad}
              disabled={guardandoUnidad || !nuevaUnidadId || nuevaUnidadId === selNode.unidad_organizacional_id}
            >
              {guardandoUnidad ? 'Guardando...' : 'Guardar unidad'}
            </button>

            <div className="input-group" style={{ marginBottom: 16 }}>
              <label>Reporta a posición</label>
              <select className="select" value={nuevaPosicionPadreId} onChange={e => setNuevaPosicionPadreId(e.target.value)}>
                <option value="">Sin jefe (nodo raíz)</option>
                {opcionesPadre.map(p => {
                  const ocupantes = ocupantesPorPosicion.get(p.id) || [];
                  const etiquetaOcupante = ocupantes.length ? ` · ${ocupantes.map(o => o.nombre).join(' + ')}` : ' · Vacante';
                  const etiquetaCargo = cargos.find(c => c.id === p.cargo_id)?.nombre || 'Sin cargo';
                  return <option key={p.id} value={p.id}>{unidadNombrePorId.get(p.unidad_organizacional_id) || 'Sin unidad'} · {etiquetaCargo}{etiquetaOcupante}</option>;
                })}
              </select>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 5 }}>
                {!posicionJefe ? 'La posición es un nodo raíz.' : ocupantesJefe.length ? `Jefe actual: ${ocupantesJefe.map(o => o.nombre).join(' + ')}` : 'La posición padre actual está vacante.'}
              </div>
              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={handleGuardarPadre} disabled={guardandoPadre || padreNoChanged}>
                {guardandoPadre ? 'Guardando jerarquía...' : 'Guardar jerarquía'}
              </button>
            </div>

            {selVacante ? (
              <div className="card" style={{ padding: 12, background: 'var(--bg-subtle)', border: '1px dashed var(--border)', marginBottom: 16, fontSize: 12, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
                Esta posicion no tiene ocupante activo.
              </div>
            ) : (
              <>
                {/* Selector de ocupante, solo si la posicion tiene mas de una persona */}
                {selOcupantes.length > 1 && (
                  <div className="input-group" style={{ marginBottom: 12 }}>
                    <label>Ocupante</label>
                    <select
                      className="select"
                      value={selOcupanteId || ''}
                      onChange={e => {
                        setSelOcupanteId(e.target.value);
                        const persona = selOcupantes.find(o => o.id === e.target.value);
                        setNuevoRolId(persona?.rol || '');
                      }}
                    >
                      {selOcupantes.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </div>
                )}

                {/* Avatar + nombre */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: selColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                    {(selOcupante?.nombre || '?').split(' ').map(x => x[0]).slice(0, 2).join('')}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selOcupante?.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selOcupante?.email}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  <span className="badge" style={{ background: `color-mix(in srgb, ${selColor} 15%, transparent)`, color: selColor, border: `1px solid color-mix(in srgb, ${selColor} 30%, transparent)` }}>
                    {selRol?.nombre || selOcupante?.rol}
                  </span>
                  <span className="badge badge-gray">{nivelLabel(selNivel)}</span>
                </div>

                {!selOcupante?.esPosicionPrincipal && (
                  <div className="card" style={{ padding: 10, background: 'var(--bg-subtle)', border: '1px dashed var(--border)', marginBottom: 16, fontSize: 12, color: 'var(--fg-muted)' }}>
                    Esta es una asignación matricial de {selOcupante?.nombre}. El editor de abajo cambia su jefe y rol <strong>principal</strong>, no esta posición matricial en particular.
                  </div>
                )}

                {/* Mover a otra posicion (afecta la posicion PRINCIPAL de la persona, disponible
                    desde cualquier posicion suya, igual que antes con "Cambiar jefe") */}
                <PosicionSelector
                  label={`Mover a otra posición${selOcupante?.esPosicionPrincipal ? '' : ' (principal)'}`}
                  value={nuevaPosicionId}
                  onChange={setNuevaPosicionId}
                  posiciones={posicionesDeEmpresa}
                  posicionesUsuarios={posicionesUsuarios}
                  unidadesOrganizacionales={unidadesOrganizacionales}
                  cargos={cargos}
                  usuarios={usuarios}
                  onCrearPosicion={crearPosicion}
                  currentUserId={selOcupante?.id}
                />

                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={handleGuardarPosicion}
                  disabled={guardando || posicionNoChanged}
                >
                  {guardando ? 'Guardando...' : 'Guardar posición'}
                </button>

                {/* Cambiar rol */}
                <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 16, marginBottom: 12 }}>
                  <div className="input-group" style={{ marginBottom: 10 }}>
                    <label>Rol</label>
                    <select className="select" value={nuevoRolId} onChange={e => setNuevoRolId(e.target.value)}>
                      {rolesOpciones.map(([id, r]) => (
                        <option key={id} value={id}>
                          {r.nombre} · {nivelLabel(r.nivel_jerarquico || 'operativo')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%' }}
                    onClick={handleGuardarRol}
                    disabled={guardandoRol || !nuevoRolId || nuevoRolId === selOcupante?.rol}
                  >
                    {guardandoRol ? 'Guardando...' : 'Guardar rol'}
                  </button>
                </div>
              </>
            )}

            {/* Reportes directos (posiciones hijas, incluidas vacantes) */}
            {selHijos.length > 0 && (
              <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 8 }}>
                  Reportes directos ({selHijos.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selHijos.map(h => {
                    const hOcupantes = ocupantesPorPosicion.get(h.id) || [];
                    const hVacante = hOcupantes.length === 0;
                    const hNivel = hOcupantes[0] ? getUserHierarchyLevel(hOcupantes[0], rolesCtx) : null;
                    const hColor = hVacante ? '#94a3b8' : (NIVEL_COLORS[hNivel] || '#64748b');
                    return (
                      <button
                        key={h.id} type="button"
                        onClick={() => seleccionarPosicion(h)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-subtle)', cursor: 'pointer', textAlign: 'left', borderLeft: `3px solid ${hColor}` }}
                      >
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: hColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                          {hVacante ? '—' : hOcupantes.map(o => (o.nombre || '?')[0]).slice(0, 2).join('')}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: hVacante ? 'italic' : 'normal' }}>
                            {hVacante ? 'Posicion vacante' : hOcupantes.map(o => o.nombre).join(' + ')}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{unidadNombrePorId.get(h.unidad_organizacional_id) || 'Sin unidad'}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </>)}
    </>
  );
}

function Comisiones() {
  const {
    comisiones = [], personalAdmin = [], role, roleKey,
    oportunidades = [], cuentas = [], cxc = [], facturas = [], osClientes = [], cobrosHistorial = [],
    aprobarComision, rechazarComision, corregirMontoComision, corregirBonificacionComision, generarReciboHonorarios, confirmarReciboHonorarios,
    aprobarAcuerdoComision, rechazarAcuerdoComision,
    reconciliarComisionesPendientes,
    recibosHonorarios = [], addNotificacion, empresa, navigate, tcUSDaPEN,
  } = useApp();

  const puedeAprobar = role?.permisos?.aprobar_descuentos || role?.permisos?.tenant_admin || role?.permisos?.todo;
  const puedeVerComisiones = role?.permisos?.ver_costos || role?.permisos?.todo || puedeAprobar;

  // Auto-rechazar comisiones huérfanas (CxC anulada) y excluirlas del display
  const comisionesEfectivas = useMemo(() => {
    return comisiones.filter(cm => {
      if (cm.estado === 'rechazada') return true; // siempre mostrar rechazadas
      if (cm.cxc_id) {
        const cxcRef = cxc.find(x => x.id === cm.cxc_id);
        if (cxcRef && cxcRef.estado === 'anulada') return false;
      }
      return true;
    });
  }, [comisiones, cxc]);

  // Rechazar en Supabase las comisiones huérfanas detectadas
  useEffect(() => {
    const huerfanas = comisiones.filter(cm => {
      if (cm.estado === 'rechazada' || cm.estado === 'pagada') return false;
      if (!cm.cxc_id) return false;
      const cxcRef = cxc.find(x => x.id === cm.cxc_id);
      return cxcRef && cxcRef.estado === 'anulada';
    });
    if (huerfanas.length === 0) return;
    huerfanas.forEach(cm => rechazarComision(cm.id, 'CxC anulada — comisión rechazada automáticamente'));
  }, []);  // solo al montar

  const periodoActual = new Date().toISOString().slice(0, 7);
  const ahora = Date.now();
  const MS_48H = 48 * 60 * 60 * 1000;

  const [mainTab, setMainTab] = useState('comisiones');
  const [filtVendedor, setFiltVendedor] = useState('');
  const [filtPeriodo, setFiltPeriodo] = useState('');
  const [filtEstado, setFiltEstado] = useState('');
  const [filtModalidad, setFiltModalidad] = useState('');
  const [panelComision, setPanelComision] = useState(null);
  const [acuerdoRechazandoId, setAcuerdoRechazandoId] = useState(null);
  const [acuerdoMotivoRechazo, setAcuerdoMotivoRechazo] = useState('');
  const [acuerdoAprobandoId, setAcuerdoAprobandoId] = useState(null);
  const [acuerdoAprobandoVals, setAcuerdoAprobandoVals] = useState({});

  // Acuerdos pendientes: oportunidades con acuerdo_estado = 'pendiente'
  const acuerdosPendientes = useMemo(() => {
    return oportunidades
      .filter(o => o.acuerdo_estado === 'pendiente')
      .map(o => {
        const vendedor = personalAdmin.find(p =>
          p.id === o.responsable_id || p.auth_user_id === o.responsable_id || p.nombre === o.responsable
        );
        const cuenta = cuentas.find(c => c.id === o.cuenta_id);
        const pctBase = Number(vendedor?.porcentaje_comision || 0);
        const pctProp = Number(o.acuerdo_pct || 0);
        const diff = pctProp - pctBase;
        // Estimar cuándo fue enviado (sin timestamp dedicado usamos updated_at o fallback)
        const enviadoEn = o.updated_at ? new Date(o.updated_at).getTime() : null;
        const horas48 = enviadoEn ? (ahora - enviadoEn) > MS_48H : false;
        return { opp: o, vendedor, cuenta, pctBase, pctProp, diff, horas48 };
      });
  }, [oportunidades, personalAdmin, cuentas, ahora]);

  const acuerdos48h = acuerdosPendientes.filter(a => a.horas48).length;
  const [bonif, setBonif] = useState('');
  const [notaApro, setNotaApro] = useState('');
  const [modoRechazo, setModoRechazo] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [editMonto, setEditMonto] = useState('');
  const [editandoMonto, setEditandoMonto] = useState(false);
  const [editBono, setEditBono] = useState('');
  const [editandoBono, setEditandoBono] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [reconciliando, setReconciliando] = useState(false);
  const [panelRecibo, setPanelRecibo] = useState(null);
  const [rheNumero, setRheNumero] = useState('');
  const [rheFechaEmision, setRheFechaEmision] = useState('');
  const [rheFechaVenc, setRheFechaVenc] = useState('');
  const [rheArchivoFile, setRheArchivoFile] = useState(null);
  const [rheConstanciaFile, setRheConstanciaFile] = useState(null);
  const [rheMoneda, setRheMoneda] = useState('');
  const [rheTc, setRheTc] = useState('');
  const autoReconciliacionKey = useRef('');
  const reconciliarRef = useRef(reconciliarComisionesPendientes);
  reconciliarRef.current = reconciliarComisionesPendientes;

  const vendedoresUniq = useMemo(() => {
    const ids = [...new Set(comisiones.map(c => c.vendedor_id).filter(Boolean))];
    return ids.map(id => {
      const c = comisiones.find(x => x.vendedor_id === id);
      return { id, nombre: c?.vendedor_nombre || id };
    });
  }, [comisiones]);

  const periodosUniq = useMemo(() => {
    return [...new Set(comisionesEfectivas.map(c => c.periodo).filter(Boolean))].sort().reverse();
  }, [comisionesEfectivas]);

  const filtradas = useMemo(() => comisionesEfectivas.filter(c =>
    (!filtVendedor || c.vendedor_id === filtVendedor) &&
    (!filtPeriodo || c.periodo === filtPeriodo) &&
    (!filtEstado || c.estado === filtEstado) &&
    (!filtModalidad || c.modalidad_pago === filtModalidad)
  ), [comisionesEfectivas, filtVendedor, filtPeriodo, filtEstado, filtModalidad]);

  const pendientes = comisionesEfectivas.filter(c => c.estado === 'pendiente_aprobacion');
  const aprobadas = comisionesEfectivas.filter(c => c.estado === 'aprobada');
  const pagadasPeriodo = comisionesEfectivas.filter(c => c.estado === 'pagada' && c.periodo === periodoActual);
  const monedasResumen = ['PEN', 'USD'];
  const normalizeMoneda = (moneda) => {
    const raw = String(moneda || '').trim().toUpperCase();
    if (raw.includes('USD') || raw.includes('US$') || raw.includes('DOLAR')) return 'USD';
    return 'PEN';
  };
  const moneyComision = (value, moneda = 'PEN') => `${normalizeMoneda(moneda) === 'USD' ? 'US$' : 'S/'} ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const isInternalRef = (value) => /^(osc|fac|cxc|com|rec|cob|opp)_/i.test(String(value || '').trim()) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  const firstReadable = (...values) => values
    .map(v => (v == null ? '' : String(v).trim()))
    .find(v => v && !isInternalRef(v));
  const getComisionRefs = (comision = {}) => {
    const cxcRef = cxc.find(x => x.id === comision.cxc_id || x.id === comision.cobro_cxc_id);
    const facturaId = comision.factura_id || cxcRef?.factura_id || cxcRef?.facturas?.id;
    const facturaRef = facturas.find(f => f.id === facturaId) || cxcRef?.facturas || null;
    const osId = comision.os_cliente_id || cxcRef?.os_cliente_id || facturaRef?.os_cliente_id || facturaRef?.os_clientes?.id || cxcRef?.os_clientes?.id;
    const osRef = osClientes.find(os => os.id === osId) || cxcRef?.os_clientes || facturaRef?.os_clientes || null;
    const oportunidadId = comision.oportunidad_id || osRef?.oportunidad_id || facturaRef?.oportunidad_id || cxcRef?.oportunidad_id;
    const oppRef = oportunidades.find(o => o.id === oportunidadId) || null;
    const vendedorRef = personalAdmin.find(p => p.id === comision.vendedor_id);
    return { cxcRef, facturaRef, osRef, oppRef, vendedorRef, facturaId, osId, oportunidadId };
  };
  const monedaComision = (comision) => {
    const { cxcRef, facturaRef, osRef } = getComisionRefs(comision);
    return normalizeMoneda(
      comision.moneda ||
      cxcRef?.moneda || cxcRef?.facturas?.moneda || cxcRef?.os_clientes?.moneda ||
      facturaRef?.moneda || facturaRef?.os_clientes?.moneda ||
      osRef?.moneda ||
      empresa?.moneda || empresa?.moneda_base || 'PEN'
    );
  };
  const getOportunidadNombre = (comision) => {
    const { oppRef } = getComisionRefs(comision);
    return firstReadable(comision.oportunidad_nombre, oppRef?.nombre, oppRef?.titulo) || null;
  };
  const renderOsFactura = (comision) => {
    const { cxcRef, facturaRef, osRef, facturaId, osId } = getComisionRefs(comision);
    const osNumero = firstReadable(comision.os_cliente_numero, osRef?.numero, cxcRef?.os_clientes?.numero, osId);
    const facturaNumero = firstReadable(comision.factura_numero, facturaRef?.numero, cxcRef?.facturas?.numero, cxcRef?.factura_numero, cxcRef?.factura, facturaId);
    if (!osNumero && !facturaNumero) return <span style={{ color: 'var(--fg-muted)' }}>Sin vincular</span>;
    return (
      <>
        {osNumero && <div>OS: {osNumero}</div>}
        {facturaNumero && <div style={{ color: 'var(--fg-muted)' }}>Fac: {facturaNumero}</div>}
      </>
    );
  };
  const getPorcentajeBase = (comision) => {
    const { vendedorRef } = getComisionRefs(comision);
    const base = comision.porcentaje_base ?? vendedorRef?.porcentaje_comision;
    return base === null || base === undefined || base === '' ? null : Number(base);
  };
  const tieneAcuerdoEspecial = (comision) => {
    if (comision.acuerdo_especial === true || comision.acuerdo_especial === 'true') return true;
    const base = getPorcentajeBase(comision);
    return base !== null && Math.abs(Number(comision.porcentaje_comision || 0) - base) > 0.0001;
  };
  const sumByCurrency = (list, field = 'monto_total') => monedasResumen.reduce((acc, moneda) => {
    acc[moneda] = list
      .filter(c => monedaComision(c) === moneda)
      .reduce((s, c) => s + Number(c[field] || 0), 0);
    return acc;
  }, {});
  const renderMoneyStack = (amounts, color) => (
    <div className="commission-money-stack">
      {monedasResumen.map(moneda => (
        <div key={moneda} className="commission-money-line" style={color ? { color } : undefined}>
          {moneyComision(amounts?.[moneda] || 0, moneda)}
        </div>
      ))}
    </div>
  );
  const sumPendientes = sumByCurrency(pendientes);
  const sumAprobadas = sumByCurrency(aprobadas);
  const sumPagadas = sumByCurrency(pagadasPeriodo);

  const topVendedorPorMoneda = useMemo(() => {
    const result = {};
    monedasResumen.forEach(moneda => {
      const por = {};
      comisionesEfectivas.filter(c => c.estado !== 'rechazada' && monedaComision(c) === moneda).forEach(c => {
        const key = c.vendedor_nombre || c.vendedor_id;
        if (!por[key]) por[key] = { nombre: key, total: 0 };
        por[key].total += Number(c.monto_total || 0);
      });
      const sorted = Object.values(por).sort((a, b) => b.total - a.total);
      if (sorted.length > 0) result[moneda] = sorted[0];
    });
    return result;
  }, [comisionesEfectivas]);

  const vendedoresHonorariosPendientes = useMemo(() => {
    const por = {};
    comisionesEfectivas.filter(c => c.estado === 'aprobada' && c.modalidad_pago === 'Honorarios').forEach(c => {
      const moneda = monedaComision(c);
      const key = `${c.vendedor_id}_${moneda}`;
      if (!por[key]) por[key] = { id: key, vendedor_id: c.vendedor_id, moneda, nombre: c.vendedor_nombre, items: [] };
      por[key].items.push(c);
    });
    return Object.values(por).map(v => {
      const recibo = recibosHonorarios.find(r =>
        r.vendedor_id === v.vendedor_id &&
        (r.estado === 'borrador' || r.estado === 'pendiente_pago') &&
        (r.comisiones_ids || []).some(id => v.items.find(c => c.id === id))
      ) || null;
      return { ...v, recibo };
    });
  }, [comisionesEfectivas, recibosHonorarios]);

  function abrirPanel(c) {
    setPanelComision(c);
    setBonif(c.bonificacion ? String(c.bonificacion) : '');
    setNotaApro('');
    setModoRechazo(false);
    setMotivoRechazo('');
    setEditandoMonto(false);
    setEditMonto('');
    setEditandoBono(false);
    setEditBono('');
  }

  async function handleAprobar() {
    if (!panelComision) return;
    setGuardando(true);
    try {
      await aprobarComision(panelComision.id, {
        bonificacion: Number(bonif || 0),
        nota_aprobacion: notaApro,
      });
      addNotificacion('Comisión aprobada.');
      setPanelComision(null);
    } finally {
      setGuardando(false);
    }
  }

  async function handleRechazar() {
    if (!motivoRechazo.trim()) { addNotificacion('El motivo de rechazo es obligatorio.'); return; }
    setGuardando(true);
    try {
      await rechazarComision(panelComision.id, motivoRechazo.trim());
      addNotificacion('Comisión rechazada.');
      setPanelComision(null);
    } finally {
      setGuardando(false);
    }
  }

  async function handleGenerarRecibo(vendedorId, moneda) {
    try {
      const recibo = await generarReciboHonorarios(vendedorId, moneda);
      if (recibo) setPanelRecibo(recibo);
    } catch (err) {
      addNotificacion(`Error al generar recibo: ${err?.message || 'Error desconocido'}`);
      console.error('[handleGenerarRecibo]', err);
    }
  }

  const cerrarPanelRecibo = () => {
    setPanelRecibo(null);
    setRheNumero(''); setRheFechaEmision(''); setRheFechaVenc(''); setRheArchivoFile(null); setRheConstanciaFile(null);
    setRheMoneda(''); setRheTc('');
  };

  async function handleConfirmarRecibo() {
    if (!panelRecibo) return;
    if (!rheNumero.trim()) { addNotificacion('Ingresa el N° de RHE antes de confirmar.'); return; }
    if (!rheArchivoFile) { addNotificacion('Adjunta el documento RHE antes de confirmar.'); return; }
    setGuardando(true);
    try {
      const monedaEfectiva = rheMoneda || panelReciboMoneda;
      const tcEfectivo = Number(rheTc) || tcUSDaPEN || 1;
      await confirmarReciboHonorarios(panelRecibo.id, {
        numero_rhe: rheNumero.trim(),
        fecha_emision: rheFechaEmision || undefined,
        fecha_vencimiento: rheFechaVenc || undefined,
        archivo_rhe_file: rheArchivoFile,
        archivo_constancia_file: rheConstanciaFile || undefined,
        moneda_rhe: monedaEfectiva,
        tipo_cambio: panelReciboMoneda === 'USD' && monedaEfectiva === 'PEN' ? tcEfectivo : undefined,
      });
      cerrarPanelRecibo();
    } catch (err) {
      addNotificacion(`Error al confirmar recibo: ${err?.message || 'Error desconocido'}`);
      console.error('[confirmarRecibo]', err);
    } finally {
      setGuardando(false);
    }
  }

  const ESTADO_BADGE = {
    pendiente_aprobacion: <span className="badge badge-orange">Pendiente</span>,
    aprobada: <span className="badge badge-cyan">Aprobada</span>,
    rechazada: <span className="badge badge-red">Rechazada</span>,
    pagada: <span className="badge badge-green">Pagada</span>,
  };
  const panelMoneda = panelComision ? monedaComision(panelComision) : 'PEN';
  const panelBonificacionPreview = panelComision ? Number(bonif || 0) : 0;
  const panelTotalPreview = panelComision
    ? Number(panelComision.monto_comision || 0) + panelBonificacionPreview
    : 0;
  const panelReciboMoneda = panelRecibo ? normalizeMoneda(panelRecibo.moneda || empresa?.moneda || empresa?.moneda_base) : 'PEN';

  useEffect(() => {
    if (!empresa?.id) return;
    if (!cobrosHistorial.length || !cxc.length || !personalAdmin.length) return;
    const key = `${empresa.id}:${cobrosHistorial.length}:${cxc.length}:${personalAdmin.length}:${comisiones.length}`;
    if (autoReconciliacionKey.current === key) return;
    autoReconciliacionKey.current = key;
    let alive = true;
    setReconciliando(true);
    reconciliarRef.current({ silencioso: true })
      .then(count => {
        if (alive && count > 0) addNotificacion(`Se recuperaron ${count} comision(es) cobradas sin registrar.`);
      })
      .finally(() => {
        if (alive) setReconciliando(false);
      });
    return () => { alive = false; };
  }, [empresa?.id, cobrosHistorial.length, cxc.length, personalAdmin.length, comisiones.length]);

  async function handleReconciliarComisiones() {
    if (!reconciliarComisionesPendientes) return;
    setReconciliando(true);
    try {
      await reconciliarComisionesPendientes({ silencioso: false });
    } finally {
      setReconciliando(false);
    }
  }

  return (
    <div className="page-content comisiones-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">RRHH</div>
          <h1 className="page-title">Comisiones</h1>
          <div className="page-sub">Liquidacion, aprobacion y pago de comisiones comerciales</div>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={handleReconciliarComisiones} disabled={reconciliando}>
            {reconciliando ? 'Revisando...' : 'Recalcular cobradas'}
          </button>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="ficha-detail-tabs comisiones-tabs">
        <button className={`ficha-detail-tab ${mainTab==='comisiones'?'active':''}`} onClick={() => setMainTab('comisiones')}>
          Comisiones
        </button>
        {puedeAprobar && (
          <button className={`ficha-detail-tab ${mainTab==='acuerdos'?'active':''}`} onClick={() => setMainTab('acuerdos')}>
            Acuerdos pendientes
            {acuerdosPendientes.length > 0 && (
              <span style={{marginLeft:6, background: acuerdos48h > 0 ? 'var(--danger)' : 'var(--orange)', color:'#fff', borderRadius:99, padding:'1px 7px', fontSize:10, fontWeight:700}}>
                {acuerdosPendientes.length}
              </span>
            )}
          </button>
        )}
      </div>

      {mainTab === 'acuerdos' && puedeAprobar && (
        <>
          {/* KPIs de acuerdos */}
          <div className="kpi-row" style={{marginBottom:20}}>
            <div className="kpi-card">
              <div className="kpi-label">Acuerdos pendientes</div>
              <div className="kpi-value" style={{color:'var(--orange)'}}>{acuerdosPendientes.length}</div>
              <div className="kpi-sub">esperando aprobación</div>
            </div>
            {acuerdos48h > 0 && (
              <div className="kpi-card" style={{borderColor:'var(--danger)'}}>
                <div className="kpi-label" style={{color:'var(--danger)'}}>Sin respuesta +48h</div>
                <div className="kpi-value" style={{color:'var(--danger)'}}>{acuerdos48h}</div>
                <div className="kpi-sub" style={{color:'var(--danger)'}}>requieren atención urgente</div>
              </div>
            )}
          </div>

          {acuerdosPendientes.length === 0 ? (
            <div className="card" style={{textAlign:'center', padding:'40px 20px', color:'var(--fg-muted)'}}>
              No hay acuerdos de comisión pendientes de aprobación.
            </div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th>Oportunidad</th>
                      <th>Cliente</th>
                      <th>% Base</th>
                      <th>% Propuesto</th>
                      <th>Diferencia</th>
                      <th>Bonificación</th>
                      <th>Justificación</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acuerdosPendientes.map(({ opp, vendedor, cuenta, pctBase, pctProp, diff, horas48 }) => (
                      <tr key={opp.id} style={horas48 ? {background:'rgba(239,68,68,0.04)'} : {}}>
                        <td>
                          <div style={{fontWeight:600}}>{opp.responsable || '—'}</div>
                          {horas48 && <span className="badge badge-red" style={{fontSize:9, padding:'1px 5px'}}>+48h</span>}
                        </td>
                        <td style={{maxWidth:180}}>
                          <div style={{fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{opp.nombre}</div>
                        </td>
                        <td>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</td>
                        <td style={{textAlign:'center'}}>{pctBase > 0 ? `${pctBase}%` : '—'}</td>
                        <td style={{textAlign:'center', fontWeight:700}}>{pctProp}%</td>
                        <td style={{textAlign:'center'}}>
                          <span className={`badge ${diff > 0 ? 'badge-red' : diff < 0 ? 'badge-green' : 'badge-gray'}`}>
                            {diff > 0 ? `+${diff.toFixed(1)}%` : diff < 0 ? `${diff.toFixed(1)}%` : '= base'}
                          </span>
                        </td>
                        <td style={{textAlign:'right'}}>
                          {Number(opp.acuerdo_bonificacion || 0) > 0
                            ? <strong>{opp.moneda === 'USD' ? 'US$ ' : 'S/ '}{Number(opp.acuerdo_bonificacion).toFixed(2)}</strong>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td style={{maxWidth:200, fontSize:12, color:'var(--fg-muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}} title={opp.acuerdo_justificacion || ''}>
                          {opp.acuerdo_justificacion || '—'}
                        </td>
                        <td>
                          {acuerdoAprobandoId === opp.id ? (
                            <div className="col" style={{gap:6, minWidth:200}}>
                              <div className="grid-2" style={{gap:6}}>
                                <div className="input-group" style={{marginBottom:0}}>
                                  <label style={{fontSize:10}}>% Comisión</label>
                                  <input type="number" min="0" max="100" step="0.01" className="input" style={{padding:'3px 6px', fontSize:12}}
                                    value={acuerdoAprobandoVals.pct ?? pctProp}
                                    onChange={e => setAcuerdoAprobandoVals(p => ({...p, pct: e.target.value}))}
                                  />
                                </div>
                                <div className="input-group" style={{marginBottom:0}}>
                                  <label style={{fontSize:10}}>Bonif.</label>
                                  <input type="number" min="0" step="0.01" className="input" style={{padding:'3px 6px', fontSize:12}}
                                    value={acuerdoAprobandoVals.bon ?? (opp.acuerdo_bonificacion || 0)}
                                    onChange={e => setAcuerdoAprobandoVals(p => ({...p, bon: e.target.value}))}
                                  />
                                </div>
                              </div>
                              <div className="row" style={{gap:4}}>
                                <button className="btn btn-sm btn-ghost flex-1" onClick={() => setAcuerdoAprobandoId(null)}>Cancelar</button>
                                <button className="btn btn-sm btn-primary flex-1" style={{background:'var(--green)', borderColor:'var(--green)'}}
                                  onClick={() => {
                                    aprobarAcuerdoComision(opp.id, {
                                      acuerdo_pct: Number(acuerdoAprobandoVals.pct ?? pctProp),
                                      acuerdo_bonificacion: Number(acuerdoAprobandoVals.bon ?? (opp.acuerdo_bonificacion || 0)),
                                    });
                                    setAcuerdoAprobandoId(null);
                                    setAcuerdoAprobandoVals({});
                                  }}>
                                  Confirmar
                                </button>
                              </div>
                            </div>
                          ) : acuerdoRechazandoId === opp.id ? (
                            <div className="col" style={{gap:6, minWidth:180}}>
                              <input type="text" className="input" placeholder="Motivo (obligatorio)" style={{padding:'3px 6px', fontSize:12}}
                                value={acuerdoMotivoRechazo}
                                onChange={e => setAcuerdoMotivoRechazo(e.target.value)}
                              />
                              <div className="row" style={{gap:4}}>
                                <button className="btn btn-sm btn-ghost flex-1" onClick={() => setAcuerdoRechazandoId(null)}>Cancelar</button>
                                <button className="btn btn-sm flex-1" style={{background:'var(--danger)', color:'#fff', border:'none', fontSize:12}}
                                  disabled={!acuerdoMotivoRechazo.trim()}
                                  onClick={() => {
                                    rechazarAcuerdoComision(opp.id, acuerdoMotivoRechazo.trim());
                                    setAcuerdoRechazandoId(null);
                                    setAcuerdoMotivoRechazo('');
                                  }}>
                                  Rechazar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="row" style={{gap:6}}>
                              <button className="btn btn-sm btn-primary" style={{background:'var(--green)', borderColor:'var(--green)', fontSize:11}}
                                onClick={() => { setAcuerdoAprobandoId(opp.id); setAcuerdoAprobandoVals({ pct: pctProp, bon: opp.acuerdo_bonificacion || 0 }); }}>
                                Aprobar
                              </button>
                              <button className="btn btn-sm btn-ghost" style={{color:'var(--danger)', fontSize:11}}
                                onClick={() => { setAcuerdoRechazandoId(opp.id); setAcuerdoMotivoRechazo(''); }}>
                                Rechazar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {mainTab === 'comisiones' && <>
      {/* KPIs */}
      <div className="kpi-grid comisiones-kpis">
        <div className="kpi-card">
          <div className="kpi-label">Pendiente aprobacion</div>
          {renderMoneyStack(sumPendientes, 'var(--orange)')}
          <div className="kpi-sub">{pendientes.length} comisiones</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Aprobadas no pagadas</div>
          {renderMoneyStack(sumAprobadas, 'var(--green)')}
          <div className="kpi-sub">{aprobadas.length} comisiones</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pagadas este período</div>
          {renderMoneyStack(sumPagadas)}
          <div className="kpi-sub">{periodoActual}</div>
        </div>
        <div className="kpi-card">
          {Object.keys(topVendedorPorMoneda).length === 0 ? (
            <>
              <div className="kpi-label">Top vendedor</div>
              <div className="commission-top-name">Sin datos</div>
            </>
          ) : Object.keys(topVendedorPorMoneda).length === 1 ? (
            (() => {
              const [[moneda, tv]] = Object.entries(topVendedorPorMoneda);
              return (
                <>
                  <div className="kpi-label">Top vendedor</div>
                  <div className="commission-top-name">{tv.nombre}</div>
                  <div style={{fontSize:13, fontWeight:700}}>{moneyComision(tv.total, moneda)}</div>
                </>
              );
            })()
          ) : (
            <>
              <div className="kpi-label">Top vendedor por moneda</div>
              {Object.entries(topVendedorPorMoneda).map(([moneda, tv]) => (
                <div key={moneda} style={{marginTop:6}}>
                  <div style={{fontSize:10, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2}}>{moneda}</div>
                  <div style={{fontSize:12, fontWeight:600, color:'var(--fg)'}}>{tv.nombre}</div>
                  <div style={{fontSize:13, fontWeight:700}}>{moneyComision(tv.total, moneda)}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Honorarios pendientes de recibo */}
      {vendedoresHonorariosPendientes.length > 0 && (
        <div className="card comisiones-honorarios-card">
          <div className="card-head">
            <h3>Recibos de honorarios pendientes</h3>
            <span className="badge badge-cyan">{vendedoresHonorariosPendientes.length} vendedores</span>
          </div>
          <div className="commission-receipt-list">
            {vendedoresHonorariosPendientes.map(v => {
              const total = v.items.reduce((s, c) => s + Number(c.monto_total || 0), 0);
              const { recibo } = v;
              const esPendientePago = recibo?.estado === 'pendiente_pago';
              const esBorrador = recibo?.estado === 'borrador';
              return (
                <div key={v.id} className="commission-receipt-card">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{v.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{v.items.length} comisiones aprobadas</div>
                  </div>
                  <div className="commission-receipt-amount">{moneyComision(total, v.moneda)}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {esPendientePago && (
                      <>
                        <span className="badge badge-orange" style={{ fontSize: 11 }}>RHE emitido · pendiente pago</span>
                        <button className="btn btn-sm btn-secondary" onClick={() => setPanelRecibo(recibo)}>Ver recibo</button>
                      </>
                    )}
                    {esBorrador && (
                      <button className="btn btn-sm btn-secondary" style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}
                        onClick={() => setPanelRecibo(recibo)}>
                        Completar RHE
                      </button>
                    )}
                    {!recibo && (
                      <button className="btn btn-sm btn-primary" onClick={() => handleGenerarRecibo(v.vendedor_id, v.moneda)}>
                        Generar {v.moneda}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card comisiones-filters">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="input-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label>Vendedor</label>
            <select className="select" value={filtVendedor} onChange={e => setFiltVendedor(e.target.value)}>
              <option value="">Todos</option>
              {vendedoresUniq.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ minWidth: 130, marginBottom: 0 }}>
            <label>Período</label>
            <select className="select" value={filtPeriodo} onChange={e => setFiltPeriodo(e.target.value)}>
              <option value="">Todos</option>
              {periodosUniq.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label>Estado</label>
            <select className="select" value={filtEstado} onChange={e => setFiltEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="pendiente_aprobacion">Pendiente</option>
              <option value="aprobada">Aprobada</option>
              <option value="rechazada">Rechazada</option>
              <option value="pagada">Pagada</option>
            </select>
          </div>
          <div className="input-group" style={{ minWidth: 140, marginBottom: 0 }}>
            <label>Modalidad</label>
            <select className="select" value={filtModalidad} onChange={e => setFiltModalidad(e.target.value)}>
              <option value="">Todas</option>
              <option value="Planilla">Planilla</option>
              <option value="Honorarios">Honorarios</option>
            </select>
          </div>
          {(filtVendedor || filtPeriodo || filtEstado || filtModalidad) && (
            <button className="btn btn-sm btn-secondary" onClick={() => { setFiltVendedor(''); setFiltPeriodo(''); setFiltEstado(''); setFiltModalidad(''); }}>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="card comisiones-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Oportunidad</th>
                <th>OS / Factura</th>
                <th>Monto cobrado</th>
                <th>%</th>
                <th>Comisión</th>
                <th>Bonificación</th>
                <th>Total</th>
                <th>Modalidad</th>
                <th>Período</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 32 }}>Sin comisiones</td></tr>
              )}
              {filtradas.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => abrirPanel(c)}>
                  <td><div style={{ fontWeight: 600 }}>{c.vendedor_nombre || c.vendedor_id}</div></td>
                  <td
                    style={{ maxWidth: 220 }}
                    onClick={e => {
                      if (c.oportunidad_id) { e.stopPropagation(); navigate('pipeline', { panel: c.oportunidad_id }); }
                    }}
                  >
                    <div
                      style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: c.oportunidad_id ? 'pointer' : 'default', color: c.oportunidad_id ? 'var(--cyan)' : undefined }}
                      title={getOportunidadNombre(c) || 'Sin vincular'}
                    >
                      {getOportunidadNombre(c) || <span style={{ color: 'var(--fg-muted)' }}>Sin vincular</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {renderOsFactura(c)}
                  </td>
                  <td>{moneyComision(c.monto_cobrado, monedaComision(c))}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{c.porcentaje_comision}%</span>
                      {tieneAcuerdoEspecial(c) && <span className="badge badge-green" style={{ fontSize: 10, padding: '1px 6px' }}>Acuerdo especial</span>}
                    </div>
                  </td>
                  <td>{moneyComision(c.monto_comision, monedaComision(c))}</td>
                  <td>{c.bonificacion > 0 ? moneyComision(c.bonificacion, monedaComision(c)) : '—'}</td>
                  <td style={{ fontWeight: 600 }}>{moneyComision(c.monto_total, monedaComision(c))}</td>
                  <td><span className="badge badge-gray">{c.modalidad_pago}</span></td>
                  <td style={{ fontSize: 12 }}>{c.periodo}</td>
                  <td>{ESTADO_BADGE[c.estado] || c.estado}</td>
                  <td>
                    {puedeAprobar && c.estado === 'pendiente_aprobacion' && (
                      <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); abrirPanel(c); }}>
                        Revisar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      </>}

      {/* Panel detalle / aprobación */}
      {panelComision && (
        <div className="side-panel-backdrop" onClick={() => setPanelComision(null)}>
          <div className="side-panel" onClick={e => e.stopPropagation()} style={{ width: 'min(580px, 96vw)' }}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Comisión</div>
                <div className="font-display" style={{ fontWeight: 700, fontSize: 22, marginTop: 2 }}>{panelComision.vendedor_nombre}</div>
              </div>
              <button className="icon-btn" onClick={() => setPanelComision(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="eyebrow" style={{marginBottom:12}}>Detalle de Comisión</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {[
                  ['Período', panelComision.periodo],
                  ['Estado', ESTADO_BADGE[panelComision.estado]],
                  ['Modalidad', panelComision.modalidad_pago],
                  ['Monto cobrado', moneyComision(panelComision.monto_cobrado, panelMoneda)],
                  ['% comisión', `${panelComision.porcentaje_comision}%`],
                  ['Monto comisión', moneyComision(panelComision.monto_comision, panelMoneda)],
                  ['Bonificación', moneyComision(panelBonificacionPreview, panelMoneda)],
                  ['Total', moneyComision(panelTotalPreview, panelMoneda)],
                ].map(([label, val]) => (
                  <div className="input-group" key={label} style={{ marginBottom: 0 }}>
                    <label>{label}</label>
                    <div className="input" style={{ background: 'var(--bg-subtle)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              {tieneAcuerdoEspecial(panelComision) && (
                <div style={{ marginBottom: 16 }}>
                  <span className="badge badge-green" style={{ fontSize: 11, padding: '2px 8px' }}>Acuerdo especial</span>
                </div>
              )}

              {panelComision.motivo_rechazo && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 13 }}>
                  <strong style={{display: 'block', marginBottom: 4, color: 'var(--red)'}}>Motivo de rechazo:</strong> {panelComision.motivo_rechazo}
                </div>
              )}
              {panelComision.nota_aprobacion && (
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 13 }}>
                  <strong style={{display: 'block', marginBottom: 4, color: 'var(--green-dk)'}}>Nota de aprobación:</strong> {panelComision.nota_aprobacion}
                </div>
              )}

              {puedeAprobar && panelComision.estado === 'aprobada' && (() => {
                const reciboVinculado = recibosHonorarios.find(r =>
                  (r.comisiones_ids || []).includes(panelComision.id) && r.estado !== 'borrador'
                );
                if (reciboVinculado) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div className="eyebrow" style={{ marginBottom: 12 }}>Corrección</div>
                    {!editandoBono ? (
                      <button className="btn btn-sm btn-secondary" onClick={() => { setEditBono(String(panelComision.bonificacion || '0')); setEditandoBono(true); }}>
                        Corregir bonificación
                      </button>
                    ) : (
                      <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                          <label>Nueva bonificación ({panelMoneda === 'USD' ? 'US$' : 'S/'})</label>
                          <input className="input" type="number" min="0" step="0.01" value={editBono} onChange={e => setEditBono(e.target.value)} autoFocus />
                          {editBono !== '' && (
                            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 6 }}>
                              Nuevo total: <strong style={{ color: 'var(--fg)' }}>
                                {moneyComision(Math.round((Number(panelComision.monto_comision || 0) + Number(editBono || 0)) * 100) / 100, panelMoneda)}
                              </strong>
                              {' '}(antes: {moneyComision(panelComision.monto_total, panelMoneda)})
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => setEditandoBono(false)}>Cancelar</button>
                          <button className="btn btn-sm btn-primary" disabled={editBono === '' || guardando}
                            onClick={async () => {
                              setGuardando(true);
                              const nuevaBonif = Number(editBono || 0);
                              await corregirBonificacionComision(panelComision.id, nuevaBonif);
                              setPanelComision(prev => ({
                                ...prev,
                                bonificacion: nuevaBonif,
                                monto_total: Math.round((Number(prev.monto_comision || 0) + nuevaBonif) * 100) / 100,
                              }));
                              setEditandoBono(false);
                              setGuardando(false);
                            }}>
                            Guardar corrección
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {puedeAprobar && panelComision.estado === 'pendiente_aprobacion' && (
                <>
                  <div className="eyebrow" style={{ marginBottom: 12, marginTop: 24 }}>Ajustes y Aprobación</div>
                  
                  {!editandoMonto ? (
                    <button className="btn btn-sm btn-secondary" style={{ marginBottom: 20 }}
                      onClick={() => { setEditMonto(String(panelComision.monto_cobrado || '')); setEditandoMonto(true); }}>
                      Corregir monto cobrado
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, background: 'var(--bg-subtle)', padding: 16, borderRadius: 8 }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label>Monto cobrado (subtotal sin IGV)</label>
                        <input className="input" type="number" min="0" step="0.01" value={editMonto} onChange={e => setEditMonto(e.target.value)} autoFocus />
                        {editMonto && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 6 }}>
                          Comisión: <strong>{moneyComision(Math.round(Number(editMonto) * Number(panelComision.porcentaje_comision || 0) / 100 * 100) / 100, panelMoneda)}</strong>
                        </div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditandoMonto(false)}>Cancelar</button>
                        <button className="btn btn-sm btn-primary" disabled={!editMonto || guardando}
                          onClick={async () => {
                            setGuardando(true);
                            await corregirMontoComision(panelComision.id, Number(editMonto));
                            setPanelComision(prev => {
                              const base = Number(editMonto);
                              const monto_comision = Math.round(base * Number(prev.porcentaje_comision || 0) / 100 * 100) / 100;
                              return { ...prev, monto_cobrado: base, monto_comision, monto_total: Math.round((monto_comision + Number(prev.bonificacion || 0)) * 100) / 100 };
                            });
                            setEditandoMonto(false);
                            setGuardando(false);
                          }}>
                          Guardar corrección
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {puedeAprobar && panelComision.estado === 'pendiente_aprobacion' && !modoRechazo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label>Bonificación adicional (opcional)</label>
                      <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={bonif} onChange={e => setBonif(e.target.value)} />
                      <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 6 }}>
                        Total actualizado: <strong style={{ color: 'var(--fg)' }}>{moneyComision(panelTotalPreview, panelMoneda)}</strong>
                      </div>
                    </div>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label>Nota de aprobación (opcional)</label>
                      <input className="input" type="text" placeholder="Notas..." value={notaApro} onChange={e => setNotaApro(e.target.value)} />
                    </div>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                    <button className="btn btn-secondary" style={{ color: 'var(--danger)' }} onClick={() => setModoRechazo(true)}>
                      Rechazar
                    </button>
                    <button className="btn btn-primary" style={{ background: 'var(--green-dk)', borderColor: 'var(--green-dk)' }} onClick={handleAprobar} disabled={guardando}>
                      {guardando ? 'Guardando...' : 'Aprobar'}
                    </button>
                  </div>
                </div>
              )}

              {puedeAprobar && panelComision.estado === 'pendiente_aprobacion' && modoRechazo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label>Motivo de rechazo <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input className="input" type="text" placeholder="Describe el motivo por el cual rechazas esta comisión..." value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} autoFocus />
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setModoRechazo(false)}>Cancelar</button>
                    <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleRechazar} disabled={guardando || !motivoRechazo.trim()}>
                      {guardando ? 'Guardando...' : 'Confirmar rechazo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panel recibo honorarios */}
      {panelRecibo && (() => {
        const vendedorRec = personalAdmin.find(p => p.id === panelRecibo.vendedor_id);
        const tieneSuspension = Boolean(vendedorRec?.suspension_retenciones);
        const fechaVencDefault = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
        return (
          <div className="side-panel-backdrop" onClick={cerrarPanelRecibo}>
            <div className="side-panel" onClick={e => e.stopPropagation()} style={{ width: 'min(480px, 96vw)' }}>
              <div className="side-panel-head">
                <div>
                  <div className="eyebrow">Recibo por honorarios</div>
                  <div className="font-display" style={{ fontWeight: 700, fontSize: 22, marginTop: 2 }}>{panelRecibo.vendedor_nombre}</div>
                </div>
                <button className="icon-btn" onClick={cerrarPanelRecibo}>{I.x}</button>
              </div>
              <div className="side-panel-body">

                {panelRecibo.estado === 'pendiente_pago' && (
                  <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--green-dk)', fontWeight: 600 }}>RHE emitido y CxP generada.</span>
                    <span style={{ color: 'var(--fg-muted)' }}>Pendiente de pago en Finanzas.</span>
                  </div>
                )}

                {/* Resumen calculado */}
                <div className="eyebrow" style={{ marginBottom: 12 }}>Resumen del recibo</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  {[
                    ['Período', panelRecibo.periodo],
                    ['N° comisiones', panelRecibo.comisiones_ids?.length || 0],
                    ['Monto bruto', moneyComision(panelRecibo.monto_bruto, panelReciboMoneda)],
                    ['Retención IR', panelRecibo.retencion_ir > 0 ? `-${moneyComision(panelRecibo.retencion_ir, panelReciboMoneda)}` : moneyComision(0, panelReciboMoneda)],
                    ['Monto neto', moneyComision(panelRecibo.monto_neto, panelReciboMoneda)],
                  ].map(([label, val]) => (
                    <div className="input-group" key={label} style={{ marginBottom: 0 }}>
                      <label>{label}</label>
                      <div className="input" style={{ background: 'var(--bg-subtle)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>{val}</div>
                    </div>
                  ))}
                </div>

                {panelRecibo.motivo_retencion && (
                  <div style={{ background: panelRecibo.retencion_ir > 0 ? '#fff8e1' : 'var(--bg-subtle)', border: `1px solid ${panelRecibo.retencion_ir > 0 ? '#f59e0b' : 'var(--border)'}`, borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 13 }}>
                    <strong style={{ display: 'block', marginBottom: 4, color: panelRecibo.retencion_ir > 0 ? '#b45309' : 'var(--fg)' }}>Regla de retención</strong>
                    <span style={{ color: 'var(--fg-muted)' }}>{panelRecibo.motivo_retencion}</span>
                  </div>
                )}

                {/* Datos del RHE — editable solo en borrador */}
                <div className="eyebrow" style={{ marginBottom: 12, marginTop: 4 }}>Datos del documento</div>

                {panelRecibo.estado === 'pendiente_pago' && panelRecibo.numero_rhe && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    {[
                      ['N° RHE', panelRecibo.numero_rhe],
                      ['Moneda del RHE', panelRecibo.moneda_cxp || panelRecibo.moneda || '—'],
                    ].map(([label, val]) => (
                      <div className="input-group" key={label} style={{ marginBottom: 0 }}>
                        <label>{label}</label>
                        <div className="input" style={{ background: 'var(--bg-subtle)', pointerEvents: 'none' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Moneda del RHE — solo aparece si la comisión es USD y está en borrador */}
                {panelReciboMoneda === 'USD' && panelRecibo.estado !== 'pendiente_pago' && (() => {
                  const monedaSel = rheMoneda || 'USD';
                  const tcValor = rheTc !== '' ? rheTc : (tcUSDaPEN ? String(tcUSDaPEN) : '');
                  const tcNum = Number(tcValor) || 0;
                  return (
                    <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                          <label>Moneda del RHE</label>
                          <select className="select" value={monedaSel} onChange={e => { setRheMoneda(e.target.value); if (!rheTc && tcUSDaPEN) setRheTc(String(tcUSDaPEN)); }}>
                            <option value="USD">USD — Dólares</option>
                            <option value="PEN">PEN — Soles</option>
                          </select>
                        </div>
                        {monedaSel === 'PEN' && (
                          <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>Tipo de cambio (S/ por US$)</label>
                            <input className="input" type="number" min="0" step="0.01" placeholder="3.80" value={tcValor} onChange={e => setRheTc(e.target.value)} />
                          </div>
                        )}
                      </div>
                      {monedaSel === 'PEN' && tcNum > 0 && (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                          {[
                            ['Monto bruto', panelRecibo.monto_bruto],
                            ['Retención IR', panelRecibo.retencion_ir],
                            ['Monto neto', panelRecibo.monto_neto],
                          ].map(([label, usd]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--fg-muted)' }}>{label} en soles</span>
                              <strong>S/ {(Math.round(Number(usd) * tcNum * 100) / 100).toFixed(2)}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {panelRecibo.estado !== 'pendiente_pago' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div className="input-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                      <label>N° RHE <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input className="input" placeholder="RHE-00001" value={rheNumero} onChange={e => setRheNumero(e.target.value)} />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label>Fecha de emisión <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input className="input" type="date" value={rheFechaEmision || new Date().toISOString().split('T')[0]} onChange={e => setRheFechaEmision(e.target.value)} />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label>Fecha de vencimiento</label>
                      <input className="input" type="date" value={rheFechaVenc || fechaVencDefault} onChange={e => setRheFechaVenc(e.target.value)} />
                    </div>
                  </div>
                )}

                {panelRecibo.estado !== 'pendiente_pago' ? (
                  <>
                    <div className="input-group" style={{ marginBottom: 16 }}>
                      <label>Adjuntar RHE (PDF o foto) <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input className="input" type="file" accept="image/*,.pdf" onChange={e => setRheArchivoFile(e.target.files[0] || null)} />
                      {rheArchivoFile && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>{rheArchivoFile.name} — listo para subir.</div>}
                    </div>

                    {tieneSuspension && (
                      <div className="input-group" style={{ marginBottom: 16 }}>
                        <label>Constancia de suspensión de retenciones <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input className="input" type="file" accept="image/*,.pdf" onChange={e => setRheConstanciaFile(e.target.files[0] || null)} />
                        {rheConstanciaFile && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>{rheConstanciaFile.name} — lista para subir.</div>}
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 20, lineHeight: 1.5 }}>
                      Al confirmar se subirán los archivos y se generará una CxP en el módulo financiero.
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleConfirmarRecibo} disabled={guardando}>
                      {guardando ? 'Subiendo archivos y generando CxP...' : 'Confirmar y generar CxP'}
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 8 }}>
                    Para modificar este recibo, gestiona la CxP directamente en el módulo de Finanzas.
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export { Roles, Usuarios, Tenants, Planes, Stub, Maestros, Servicios, Tarifarios, Parametros, RRHHAdmin, MetricasSaaS, Organigrama, Comisiones };

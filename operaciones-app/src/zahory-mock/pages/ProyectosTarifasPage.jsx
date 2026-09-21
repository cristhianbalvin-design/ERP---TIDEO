import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { NuevoProyectoModal } from '../../../../src/components/NuevoProyectoModal.jsx';

const TABS = [
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'mano_obra', label: 'Precio de Mano de Obra' },
  { id: 'equipos', label: 'Tarifas de Equipos' },
];

const CATEGORIAS_MO = ['Senior', 'Especialista', 'Pleno', 'Junior'];
const MONEDAS = ['PEN', 'USD'];
const MANO_OBRA_INIT = {
  especialidad: '', categoria: 'Senior', tarifaNormal: '', tarifaStandBy: '', moneda: 'PEN',
};
const EQUIPO_INIT = { activoId: '', tarifaHora: '', moneda: 'USD' };

const errorMessage = error => error?.message || 'No se pudo completar la operación.';
const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-PE') : '—';
const labelCuenta = cuenta => cuenta?.nombre_comercial || cuenta?.razon_social || cuenta?.id || 'Sin cuenta';
const labelActivo = activo => [activo?.codigo, activo?.nombre].filter(Boolean).join(' · ') || activo?.id || 'Activo';
const isNonNegativeNumber = value => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

function Modal({ title, children, onClose, busy = false, footer }) {
  return (
    <div className="ops-modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.65)', display: 'grid', placeItems: 'center', padding: 20, overflowY: 'auto' }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="card" style={{ width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="card-header" style={{ background: 'var(--navy)', color: 'white', borderRadius: '8px 8px 0 0' }}>
          <h3 style={{ margin: 0, color: 'white' }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} disabled={busy} style={{ color: 'white' }} aria-label="Cerrar">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
        {footer && <div style={{ display: 'flex', gap: 10, padding: '4px 16px 16px' }}>{footer}</div>}
      </div>
    </div>
  );
}

function AccessDenied({ loading, error }) {
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 680, margin: '48px auto', textAlign: 'center', padding: 32 }}>
        {loading ? <>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <h2>Verificando permisos</h2>
          <p className="muted">Estamos validando tu acceso al tarifario comercial.</p>
        </> : <>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <h2>Acceso restringido</h2>
          <p className="muted">No tienes permiso para consultar el tarifario comercial.</p>
          {error && <div className="alert alert-error" style={{ textAlign: 'left', marginTop: 16 }}>{error}</div>}
        </>}
      </div>
    </div>
  );
}

export const ProyectosTarifasPage = ({ onNav }) => {
  const sesion = useSesionOperativa();
  const [tab, setTab] = useState('proyectos');
  const [access, setAccess] = useState({ loading: true, ver: false, editar: false, error: '' });
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');
  const [cuentas, setCuentas] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [tarifasMO, setTarifasMO] = useState([]);
  const [activos, setActivos] = useState([]);
  const [tarifasEquipos, setTarifasEquipos] = useState([]);
  const [proyectoModal, setProyectoModal] = useState(null);
  const [manoObraModal, setManoObraModal] = useState(null);
  const [manoObraForm, setManoObraForm] = useState(MANO_OBRA_INIT);
  const [equipoModal, setEquipoModal] = useState(null);
  const [equipoForm, setEquipoForm] = useState(EQUIPO_INIT);
  const [saving, setSaving] = useState(false);

  const empresaId = sesion.empresaId;
  const canEdit = access.ver && access.editar;

  const comprobarAcceso = useCallback(async () => {
    if (!empresaId) {
      setAccess({ loading: false, ver: false, editar: false, error: '' });
      return;
    }
    setAccess(current => ({ ...current, loading: true, error: '' }));
    try {
      const supabase = getSupabaseClient();
      const [verRes, editarRes] = await Promise.all([
        supabase.rpc('usuario_puede', {
          target_empresa_id: empresaId,
          target_pantalla: 'tarifario_comercial',
          target_accion: 'ver',
        }),
        supabase.rpc('usuario_puede', {
          target_empresa_id: empresaId,
          target_pantalla: 'tarifario_comercial',
          target_accion: 'editar',
        }),
      ]);
      if (verRes.error) throw verRes.error;
      if (editarRes.error) throw editarRes.error;
      setAccess({ loading: false, ver: Boolean(verRes.data), editar: Boolean(editarRes.data), error: '' });
    } catch (error) {
      setAccess({ loading: false, ver: false, editar: false, error: errorMessage(error) });
    }
  }, [empresaId]);

  useEffect(() => { comprobarAcceso(); }, [comprobarAcceso]);

  const cargarDatos = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true);
    setPageError('');
    try {
      const supabase = getSupabaseClient();
      const [cuentasRes, proyectosRes, manoObraRes, activosRes] = await Promise.all([
        supabase.from('cuentas').select('id,nombre_comercial,razon_social,ruc,estado').eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre_comercial'),
        supabase.from('proyectos').select('id,empresa_id,cuenta_id,codigo,nombre,horas_disponibles_mes_pactadas,estado,created_at,updated_at').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('tarifas_mano_obra_comercial').select('id,empresa_id,especialidad,categoria,tarifa_normal,tarifa_stand_by,moneda,created_at,updated_at').eq('empresa_id', empresaId).order('especialidad').order('categoria'),
        supabase.from('activos').select('id,codigo,nombre,marca,modelo,estado,propietario_tipo').eq('empresa_id', empresaId).eq('propietario_tipo', 'propio').neq('estado', 'dado_baja').order('codigo'),
      ]);
      const firstError = [cuentasRes, proyectosRes, manoObraRes, activosRes].find(result => result.error)?.error;
      if (firstError) throw firstError;

      const proyectosData = proyectosRes.data || [];
      const activosData = activosRes.data || [];
      const projectIds = proyectosData.map(project => project.id);
      const assetIds = activosData.map(asset => asset.id);
      const [contratosRes, tarifasEquiposRes] = await Promise.all([
        projectIds.length
          ? supabase.from('contratos_alquiler').select('id,numero,proyecto_id,objeto,fecha_inicio,fecha_fin,estado').in('proyecto_id', projectIds).order('fecha_inicio')
          : Promise.resolve({ data: [], error: null }),
        assetIds.length
          ? supabase.from('tarifas_estandar_equipos').select('activo_id,tarifa_hora,moneda,created_at,updated_at').in('activo_id', assetIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (contratosRes.error) throw contratosRes.error;
      if (tarifasEquiposRes.error) throw tarifasEquiposRes.error;
      setCuentas(cuentasRes.data || []);
      setProyectos(proyectosData);
      setContratos(contratosRes.data || []);
      setTarifasMO(manoObraRes.data || []);
      setActivos(activosData);
      setTarifasEquipos(tarifasEquiposRes.data || []);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [access.ver, empresaId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const contratosPorProyecto = useMemo(() => contratos.reduce((map, contrato) => {
    if (!map[contrato.proyecto_id]) map[contrato.proyecto_id] = [];
    map[contrato.proyecto_id].push(contrato);
    return map;
  }, {}), [contratos]);

  const activosPorId = useMemo(() => Object.fromEntries(activos.map(activo => [activo.id, activo])), [activos]);
  const tarifasEquipoPorActivo = useMemo(() => Object.fromEntries(tarifasEquipos.map(tarifa => [tarifa.activo_id, tarifa])), [tarifasEquipos]);
  const cuentasPorId = useMemo(() => Object.fromEntries(cuentas.map(cuenta => [cuenta.id, cuenta])), [cuentas]);

  const closeModals = () => {
    setProyectoModal(null);
    setManoObraModal(null);
    setEquipoModal(null);
    setModalError('');
  };

  const notify = message => {
    setNotice(message);
    window.setTimeout(() => setNotice(current => current === message ? '' : current), 2800);
  };

  const saveManoObra = async () => {
    if (!canEdit) return;
    if (!manoObraForm.especialidad.trim() || !manoObraForm.categoria.trim() || !isNonNegativeNumber(manoObraForm.tarifaNormal) || !isNonNegativeNumber(manoObraForm.tarifaStandBy)) {
      setModalError('Completa especialidad, categoría y tarifas válidas mayores o iguales a cero.');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      const supabase = getSupabaseClient();
      const payload = {
        empresa_id: empresaId,
        especialidad: manoObraForm.especialidad.trim(),
        categoria: manoObraForm.categoria.trim(),
        tarifa_normal: Number(manoObraForm.tarifaNormal),
        tarifa_stand_by: Number(manoObraForm.tarifaStandBy),
        moneda: manoObraForm.moneda,
      };
      const result = manoObraModal?.id
        ? await supabase.from('tarifas_mano_obra_comercial').update(payload).eq('id', manoObraModal.id).select().single()
        : await supabase.from('tarifas_mano_obra_comercial').insert(payload).select().single();
      if (result.error) throw result.error;
      closeModals();
      notify(manoObraModal?.id ? 'Tarifa de mano de obra actualizada.' : 'Tarifa de mano de obra creada.');
      await cargarDatos();
    } catch (error) {
      setModalError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveEquipo = async () => {
    if (!canEdit) return;
    if (!equipoForm.activoId || !isNonNegativeNumber(equipoForm.tarifaHora)) {
      setModalError('Selecciona un activo y completa una tarifa por hora válida.');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      const supabase = getSupabaseClient();
      const payload = { activo_id: equipoForm.activoId, tarifa_hora: Number(equipoForm.tarifaHora), moneda: equipoForm.moneda };
      const result = equipoModal?.activo_id
        ? await supabase.from('tarifas_estandar_equipos').update({ tarifa_hora: payload.tarifa_hora, moneda: payload.moneda }).eq('activo_id', equipoModal.activo_id).select().single()
        : await supabase.from('tarifas_estandar_equipos').insert(payload).select().single();
      if (result.error) throw result.error;
      closeModals();
      notify(equipoModal?.activo_id ? 'Tarifa de equipo actualizada.' : 'Tarifa de equipo creada.');
      await cargarDatos();
    } catch (error) {
      setModalError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async ({ table, column, value, message }) => {
    if (!canEdit || !window.confirm('¿Eliminar este registro?')) return;
    setPageError('');
    const { error } = await getSupabaseClient().from(table).delete().eq(column, value);
    if (error) setPageError(errorMessage(error));
    else { notify(message); await cargarDatos(); }
  };

  const openProject = project => {
    setPageError('');
    setModalError('');
    setProyectoModal(project || {});
  };

  const openManoObra = tarifa => {
    setPageError('');
    setModalError('');
    setManoObraModal(tarifa || {});
    setManoObraForm(tarifa ? {
      especialidad: tarifa.especialidad || '',
      categoria: tarifa.categoria || '',
      tarifaNormal: tarifa.tarifa_normal ?? '',
      tarifaStandBy: tarifa.tarifa_stand_by ?? '',
      moneda: tarifa.moneda || 'PEN',
    } : MANO_OBRA_INIT);
  };

  const openEquipo = tarifa => {
    setPageError('');
    setModalError('');
    setEquipoModal(tarifa || {});
    setEquipoForm(tarifa ? {
      activoId: tarifa.activo_id,
      tarifaHora: tarifa.tarifa_hora ?? '',
      moneda: tarifa.moneda || 'USD',
    } : EQUIPO_INIT);
  };

  if (access.loading || sesion.cargando || !access.ver) return <AccessDenied loading={access.loading || sesion.cargando} error={access.error} />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Proyectos y Tarifas</h1>
          <div className="sub">Maestros comerciales para proyectos, mano de obra y equipos.</div>
        </div>
        <div className="spacer" />
        {!canEdit && <span className="badge slate">Solo lectura</span>}
      </div>

      <div className="report-toolbar" style={{ marginBottom: 16 }}>
        <div className="report-tabs" role="tablist" aria-label="Maestros comerciales">
          {TABS.map(item => <button key={item.id} className={`report-tab${tab === item.id ? ' active' : ''}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
        </div>
      </div>

      {pageError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{pageError}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 16 }}>{notice}</div>}
      {loading && <div className="alert alert-info" style={{ marginBottom: 16 }}>Cargando información real…</div>}

      {tab === 'proyectos' && <section>
        <div className="card">
          <div className="card-header">
            <div><h3>Proyectos</h3><div className="sub">Datos propios del proyecto; los contratos se gestionan en Contratos Rental.</div></div>
            <div className="spacer" />
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openProject()}><Icon name="plus" size={12} /> Nuevo Proyecto</button>}
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Código</th><th>Proyecto</th><th>Cuenta</th><th className="num">Horas pactadas / mes</th><th>Estado</th><th style={{ width: 170 }}>Acciones</th></tr></thead>
              <tbody>
                {proyectos.map(project => {
                  const projectContracts = contratosPorProyecto[project.id] || [];
                  return <Fragment key={project.id}>
                    <tr>
                      <td className="mono">{project.codigo}</td>
                      <td><div style={{ fontWeight: 700 }}>{project.nombre}</div><div className="sub">{project.id}</div></td>
                      <td>{labelCuenta(cuentasPorId[project.cuenta_id])}</td>
                      <td className="num">{project.horas_disponibles_mes_pactadas == null ? '—' : `${Number(project.horas_disponibles_mes_pactadas).toLocaleString('es-PE')} h`}</td>
                      <td><span className={`badge ${project.estado === 'activo' ? 'green' : 'slate'}`}><span className="dot" />{project.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
                      <td><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {canEdit && <><button className="btn btn-ghost btn-sm" onClick={() => openProject(project)} title="Editar"><Icon name="edit" size={13} /></button><button className="btn btn-ghost btn-sm" onClick={() => removeRow({ table: 'proyectos', column: 'id', value: project.id, message: 'Proyecto eliminado.' })} title="Eliminar"><Icon name="trash" size={13} /></button></>}
                        <button className="btn btn-secondary btn-sm" onClick={() => onNav?.('contratos-rental')}>Contratos Rental</button>
                      </div></td>
                    </tr>
                    <tr><td colSpan="6" style={{ padding: 0, background: 'var(--surface-2)' }}>
                      <div style={{ padding: '10px 14px 12px 42px' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: .6, marginBottom: 6 }}>Contratos asociados · solo lectura</div>
                        {projectContracts.length === 0 ? <div className="sub">Sin contratos asociados.</div> : <div style={{ display: 'grid', gap: 6 }}>
                          {projectContracts.map(contract => <div key={contract.id} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr) 180px 90px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                            <span className="mono">{contract.numero || contract.id}</span>
                            <span>{contract.objeto || 'Sin objeto registrado'}</span>
                            <span>{formatDate(contract.fecha_inicio)} — {formatDate(contract.fecha_fin)}</span>
                            <span className="badge slate">{contract.estado || '—'}</span>
                          </div>)}
                        </div>}
                      </div>
                    </td></tr>
                  </Fragment>;
                })}
                {!proyectos.length && !loading && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 28 }} className="muted">No hay proyectos registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>}

      {tab === 'mano_obra' && <section className="card">
        <div className="card-header">
          <div><h3>Precio de Mano de Obra</h3><div className="sub">Especialidad, categoría y tarifas normal / stand-by.</div></div>
          <div className="spacer" />
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openManoObra()}><Icon name="plus" size={12} /> Nueva tarifa</button>}
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Especialidad</th><th>Categoría</th><th className="num">Tarifa normal</th><th className="num">Stand-by</th><th>Moneda</th><th style={{ width: 100 }}>Acciones</th></tr></thead>
          <tbody>{tarifasMO.map(tarifa => <tr key={tarifa.id}>
            <td style={{ fontWeight: 700 }}>{tarifa.especialidad}</td><td>{tarifa.categoria}</td>
            <td className="num mono">{Number(tarifa.tarifa_normal).toFixed(2)}</td><td className="num mono">{Number(tarifa.tarifa_stand_by).toFixed(2)}</td><td>{tarifa.moneda}</td>
            <td>{canEdit && <div style={{ display: 'flex', gap: 4 }}><button className="btn btn-ghost btn-sm" onClick={() => openManoObra(tarifa)} title="Editar"><Icon name="edit" size={13} /></button><button className="btn btn-ghost btn-sm" onClick={() => removeRow({ table: 'tarifas_mano_obra_comercial', column: 'id', value: tarifa.id, message: 'Tarifa eliminada.' })} title="Eliminar"><Icon name="trash" size={13} /></button></div>}</td>
          </tr>)}{!tarifasMO.length && !loading && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 28 }} className="muted">No hay tarifas de mano de obra registradas.</td></tr>}</tbody>
        </table></div>
      </section>}

      {tab === 'equipos' && <section className="card">
        <div className="card-header">
          <div><h3>Tarifas de Equipos</h3><div className="sub">Maestro estándar por activo. El contrato solo consulta este valor y puede aplicar un override.</div></div>
          <div className="spacer" />
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openEquipo()}><Icon name="plus" size={12} /> Nueva tarifa</button>}
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Activo</th><th>Estado</th><th className="num">Tarifa / hora</th><th>Moneda</th><th style={{ width: 100 }}>Acciones</th></tr></thead>
          <tbody>{tarifasEquipos.map(tarifa => <tr key={tarifa.activo_id}>
            <td><div style={{ fontWeight: 700 }}>{labelActivo(activosPorId[tarifa.activo_id])}</div><div className="sub">{tarifa.activo_id}</div></td>
            <td>{activosPorId[tarifa.activo_id]?.estado || '—'}</td><td className="num mono">{Number(tarifa.tarifa_hora).toFixed(2)}</td><td>{tarifa.moneda}</td>
            <td>{canEdit && <div style={{ display: 'flex', gap: 4 }}><button className="btn btn-ghost btn-sm" onClick={() => openEquipo(tarifa)} title="Editar"><Icon name="edit" size={13} /></button><button className="btn btn-ghost btn-sm" onClick={() => removeRow({ table: 'tarifas_estandar_equipos', column: 'activo_id', value: tarifa.activo_id, message: 'Tarifa de equipo eliminada.' })} title="Eliminar"><Icon name="trash" size={13} /></button></div>}</td>
          </tr>)}{!tarifasEquipos.length && !loading && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 28 }} className="muted">No hay tarifas de equipos registradas.</td></tr>}</tbody>
        </table></div>
      </section>}

      <NuevoProyectoModal
        open={Boolean(proyectoModal)}
        empresaId={empresaId}
        cuentas={cuentas}
        proyecto={proyectoModal?.id ? proyectoModal : null}
        supabaseClient={getSupabaseClient()}
        onClose={closeModals}
        onCreated={async () => { closeModals(); notify('Proyecto creado.'); await cargarDatos(); }}
        onUpdated={async () => { closeModals(); notify('Proyecto actualizado.'); await cargarDatos(); }}
      />

      {manoObraModal && <Modal title={manoObraModal.id ? 'Editar tarifa de mano de obra' : 'Nueva tarifa de mano de obra'} onClose={closeModals} busy={saving} footer={<><button className="btn btn-secondary" onClick={closeModals} disabled={saving}>Cancelar</button><button className="btn btn-primary" onClick={saveManoObra} disabled={saving}>{saving ? 'Guardando…' : 'Guardar tarifa'}</button></>}>
        {modalError && <div className="alert alert-error">{modalError}</div>}
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Especialidad *</label><input className="input" value={manoObraForm.especialidad} onChange={event => setManoObraForm(current => ({ ...current, especialidad: event.target.value }))} placeholder="Ej. Mecánico Mina" /></div>
          <div className="field"><label>Categoría *</label><input className="input" list="categorias-mano-obra" value={manoObraForm.categoria} onChange={event => setManoObraForm(current => ({ ...current, categoria: event.target.value }))} />
            <datalist id="categorias-mano-obra">{CATEGORIAS_MO.map(value => <option key={value} value={value} />)}</datalist>
          </div>
          <div className="field"><label>Moneda</label><select className="select" value={manoObraForm.moneda} onChange={event => setManoObraForm(current => ({ ...current, moneda: event.target.value }))}>{MONEDAS.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="field"><label>Tarifa normal *</label><input className="input" type="number" min="0" step="0.01" value={manoObraForm.tarifaNormal} onChange={event => setManoObraForm(current => ({ ...current, tarifaNormal: event.target.value }))} /></div>
          <div className="field"><label>Tarifa stand-by *</label><input className="input" type="number" min="0" step="0.01" value={manoObraForm.tarifaStandBy} onChange={event => setManoObraForm(current => ({ ...current, tarifaStandBy: event.target.value }))} /></div>
        </div>
      </Modal>}

      {equipoModal && <Modal title={equipoModal.activo_id ? 'Editar tarifa de equipo' : 'Nueva tarifa de equipo'} onClose={closeModals} busy={saving} footer={<><button className="btn btn-secondary" onClick={closeModals} disabled={saving}>Cancelar</button><button className="btn btn-primary" onClick={saveEquipo} disabled={saving}>{saving ? 'Guardando…' : 'Guardar tarifa'}</button></>}>
        {modalError && <div className="alert alert-error">{modalError}</div>}
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Activo *</label><select className="select" value={equipoForm.activoId} disabled={Boolean(equipoModal.activo_id)} onChange={event => setEquipoForm(current => ({ ...current, activoId: event.target.value }))}><option value="">Seleccionar activo…</option>{activos.filter(activo => !tarifasEquipoPorActivo[activo.id] || activo.id === equipoForm.activoId).map(activo => <option key={activo.id} value={activo.id}>{labelActivo(activo)}</option>)}</select></div>
          <div className="field"><label>Tarifa por hora *</label><input className="input" type="number" min="0" step="0.01" value={equipoForm.tarifaHora} onChange={event => setEquipoForm(current => ({ ...current, tarifaHora: event.target.value }))} /></div>
          <div className="field"><label>Moneda</label><select className="select" value={equipoForm.moneda} onChange={event => setEquipoForm(current => ({ ...current, moneda: event.target.value }))}>{MONEDAS.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        </div>
      </Modal>}

      <FooterBrand />
    </div>
  );
};

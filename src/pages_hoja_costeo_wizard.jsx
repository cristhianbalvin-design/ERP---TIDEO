import React, { useEffect, useMemo, useState } from 'react';
import { I, moneyD } from './icons.jsx';
import { useApp } from './context.jsx';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';

const STEPS = [
  { id: 'mano_obra', label: 'Mano de obra' },
  { id: 'materiales', label: 'Materiales' },
  { id: 'terceros', label: 'Terceros / Logística' },
  { id: 'activos', label: 'Activos' },
  { id: 'resumen', label: 'Resumen' },
];

const moneyUsd = value => moneyD(Number(value || 0), 'US$');
const numero = value => Number(value || 0);

function PlaceholderPaso({ titulo, descripcion }) {
  return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div style={{ color: 'var(--fg-muted)', marginBottom: 8, fontSize: 15, fontWeight: 600 }}>{titulo}</div>
      <div className="text-muted" style={{ fontSize: 13 }}>{descripcion}</div>
    </div>
  );
}

export default function HojaCosteoWizard() {
  const { activeParams, hojasCosteo, empresa, navigate, addToast } = useApp();
  const hojaId = activeParams?.hojaId || activeParams?.id;
  const hoja = (hojasCosteo || []).find(item => item.id === hojaId);
  const bloqueada = hoja?.estado === 'aprobada';
  const [paso, setPaso] = useState('mano_obra');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [familias, setFamilias] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [trabajoNuevo, setTrabajoNuevo] = useState('');
  const [creandoTrabajo, setCreandoTrabajo] = useState(false);
  const [form, setForm] = useState({ familia_trabajo_id: '', actividad_id: '', cargo_id: '', horas: '', costo_hora_manual: '' });

  const tarifaPorCargo = useMemo(() => new Map(
    tarifas
      .filter(item => item?.cargo_id && item?.costo_hora_planilla != null && numero(item.costo_hora_planilla) > 0)
      .map(item => [item.cargo_id, numero(item.costo_hora_planilla)])
  ), [tarifas]);
  const familiaPorId = useMemo(() => new Map(familias.map(item => [item.id, item])), [familias]);
  const actividadPorId = useMemo(() => new Map(actividades.map(item => [item.id, item])), [actividades]);
  const cargoPorId = useMemo(() => new Map(cargos.map(item => [item.id, item])), [cargos]);
  const tarifaPlanilla = tarifaPorCargo.get(form.cargo_id) || null;
  const subtotalManoObra = useMemo(() => lineas.reduce((total, linea) => total + numero(linea.subtotal), 0), [lineas]);

  const cargarDatos = async () => {
    if (!hoja?.id || !empresa?.id || !isSupabaseConfigured()) {
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const sb = await getSupabaseClient();
      const [familiasResult, actividadesResult, cargosResult, tarifasResult, lineasResult] = await Promise.all([
        sb.from('familia_trabajo').select('id, nombre, activo').eq('empresa_id', empresa.id).eq('activo', true).order('nombre'),
        sb.from('tipos_servicio_interno').select('id, codigo, nombre, estado').eq('empresa_id', empresa.id).eq('estado', 'activo').order('nombre'),
        sb.from('cargos_empresa').select('id, codigo, nombre, estado').eq('empresa_id', empresa.id).eq('estado', 'activo').order('nombre'),
        sb.from('vw_costo_hora_planilla_por_cargo').select('empresa_id, cargo_id, costo_hora_planilla').eq('empresa_id', empresa.id),
        sb.from('hoja_costeo_lineas_mano_obra').select('*').eq('hoja_costeo_id', hoja.id).order('orden').order('creado_en'),
      ]);
      const error = [familiasResult, actividadesResult, cargosResult, tarifasResult, lineasResult].find(result => result.error)?.error;
      if (error) throw error;
      setFamilias(familiasResult.data || []);
      setActividades(actividadesResult.data || []);
      setCargos(cargosResult.data || []);
      setTarifas(tarifasResult.data || []);
      setLineas(lineasResult.data || []);
    } catch (error) {
      console.error('[HojaCosteoWizard] carga', error);
      addToast(`No se pudo cargar el wizard: ${error.message || error}`, 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarDatos(); }, [hoja?.id, empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const crearTrabajo = async () => {
    const nombre = trabajoNuevo.trim();
    if (!nombre) return;
    setCreandoTrabajo(true);
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from('familia_trabajo')
        .insert({ empresa_id: empresa.id, nombre })
        .select('id, nombre, activo')
        .single();
      if (error) throw error;
      setFamilias(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setForm(prev => ({ ...prev, familia_trabajo_id: data.id }));
      setTrabajoNuevo('');
      addToast('Trabajo creado y seleccionado.', 'success');
    } catch (error) {
      addToast(`No se pudo crear el trabajo: ${error.message || error}`, 'error');
    } finally {
      setCreandoTrabajo(false);
    }
  };

  const agregarLinea = async event => {
    event.preventDefault();
    if (bloqueada || guardando) return;
    const horas = numero(form.horas);
    const costoHora = tarifaPlanilla || numero(form.costo_hora_manual);
    const metodo = tarifaPlanilla ? 'planilla' : 'manual';
    if (!form.familia_trabajo_id || !form.actividad_id || !form.cargo_id || horas <= 0) {
      addToast('Completa Trabajo, Actividad, Cargo y Horas antes de agregar la línea.', 'error');
      return;
    }
    if (!tarifaPlanilla && costoHora <= 0) {
      addToast('Este cargo no tiene tarifa de planilla. Ingresa un costo/hora manual.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const sb = await getSupabaseClient();
      const payload = {
        hoja_costeo_id: hoja.id,
        familia_trabajo_id: form.familia_trabajo_id,
        actividad_id: form.actividad_id,
        cargo_id: form.cargo_id,
        horas,
        metodo_usado: metodo,
        costo_hora_snapshot: costoHora,
        subtotal: horas * costoHora,
        orden: lineas.length,
      };
      const { data, error } = await sb.from('hoja_costeo_lineas_mano_obra').insert(payload).select().single();
      if (error) throw error;
      setLineas(prev => [...prev, data]);
      setForm({ familia_trabajo_id: '', actividad_id: '', cargo_id: '', horas: '', costo_hora_manual: '' });
      addToast(`Línea agregada con costo por ${metodo}.`, 'success');
    } catch (error) {
      addToast(`No se pudo agregar la línea: ${error.message || error}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarLinea = async linea => {
    if (bloqueada || eliminandoId) return;
    setEliminandoId(linea.id);
    try {
      const sb = await getSupabaseClient();
      const { error } = await sb.from('hoja_costeo_lineas_mano_obra').delete().eq('id', linea.id);
      if (error) throw error;
      setLineas(prev => prev.filter(item => item.id !== linea.id));
      addToast('Línea eliminada.', 'success');
    } catch (error) {
      // La UI conserva el detalle que devuelve RLS en vez de ocultar una eliminación no persistida.
      addToast(`No se pudo eliminar la línea: ${error.message || error}`, 'error');
    } finally {
      setEliminandoId(null);
    }
  };

  if (!hojaId || !hoja) {
    return (
      <div className="page-content">
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Hoja de Costeo no encontrada</div>
          <button className="btn btn-secondary" onClick={() => navigate('hoja_costeo')}>Volver a Hojas de Costeo</button>
        </div>
      </div>
    );
  }

  const renderPaso = () => {
    if (paso === 'materiales') return <PlaceholderPaso titulo="Materiales" descripcion="Este paso se incorporará en la siguiente entrega." />;
    if (paso === 'terceros') return <PlaceholderPaso titulo="Terceros / Logística" descripcion="Este paso se incorporará en la siguiente entrega." />;
    if (paso === 'activos') return <PlaceholderPaso titulo="Activos" descripcion="Este paso se incorporará en la siguiente entrega." />;
    if (paso === 'resumen') return <PlaceholderPaso titulo="Resumen" descripcion="El resumen final se habilitará cuando los demás bloques estén implementados." />;

    return (
      <>
        {bloqueada && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.10)', color: 'var(--orange)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            {I.lock} Esta Hoja de Costeo está aprobada. Las líneas de mano de obra solo se muestran en modo lectura.
          </div>
        )}
        <section className="card" style={{ padding: 20, marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Nueva línea</div>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 18 }}>El costo/hora se toma de planilla cuando existe; en caso contrario se registra como manual.</div>
          <form onSubmit={agregarLinea}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Trabajo</label>
                <select className="select" disabled={bloqueada || cargando} value={form.familia_trabajo_id} onChange={e => setForm(prev => ({ ...prev, familia_trabajo_id: e.target.value }))}>
                  <option value="">Seleccionar trabajo...</option>
                  {familias.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
                {!bloqueada && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input className="input" value={trabajoNuevo} onChange={e => setTrabajoNuevo(e.target.value)} placeholder="Nuevo trabajo" aria-label="Nuevo trabajo" />
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!trabajoNuevo.trim() || creandoTrabajo} onClick={crearTrabajo}>{I.plus} Crear</button>
                  </div>
                )}
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Actividad</label>
                <select className="select" disabled={bloqueada || cargando} value={form.actividad_id} onChange={e => setForm(prev => ({ ...prev, actividad_id: e.target.value }))}>
                  <option value="">Seleccionar actividad...</option>
                  {actividades.map(item => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} — ` : ''}{item.nombre}</option>)}
                </select>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Cargo</label>
                <select className="select" disabled={bloqueada || cargando} value={form.cargo_id} onChange={e => setForm(prev => ({ ...prev, cargo_id: e.target.value, costo_hora_manual: '' }))}>
                  <option value="">Seleccionar cargo...</option>
                  {cargos.map(item => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} — ` : ''}{item.nombre}</option>)}
                </select>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Horas</label>
                <input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || cargando} value={form.horas} onChange={e => setForm(prev => ({ ...prev, horas: e.target.value }))} placeholder="0.00" />
              </div>
              {form.cargo_id && (
                <div className="input-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  {tarifaPlanilla ? (
                    <>
                      <label>Costo/hora de planilla</label>
                      <div className="input" style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>{moneyUsd(tarifaPlanilla)} <span style={{ marginLeft: 8 }} className="badge badge-cyan">Planilla</span></div>
                    </>
                  ) : (
                    <>
                      <label>Costo/hora manual</label>
                      <input type="number" className="input" min="0.01" step="0.01" disabled={bloqueada || cargando} value={form.costo_hora_manual} onChange={e => setForm(prev => ({ ...prev, costo_hora_manual: e.target.value }))} placeholder="US$ 0.00" />
                      <div className="text-muted" style={{ fontSize: 12, marginTop: 5 }}>No hay tarifa de planilla para este cargo; el snapshot se guardará con método manual.</div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn btn-primary" type="submit" disabled={bloqueada || cargando || guardando}>{I.plus} {guardando ? 'Agregando...' : 'Agregar línea'}</button>
            </div>
          </form>
        </section>

        <section className="card" style={{ padding: 20 }}>
          <div className="cost-section-head">
            <div className="row" style={{ gap: 10, alignItems: 'center' }}><h3>Mano de obra agregada</h3><span className="badge badge-cyan">{lineas.length}</span></div>
            <span className="num" style={{ fontWeight: 700 }}>{moneyUsd(subtotalManoObra)}</span>
          </div>
          {cargando ? <div className="text-muted" style={{ padding: 16 }}>Cargando líneas...</div> : lineas.length === 0 ? (
            <div className="text-muted" style={{ padding: '12px 0', fontSize: 13 }}>Aún no hay líneas de mano de obra.</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Trabajo</th><th>Actividad</th><th>Cargo</th><th className="num">Horas</th><th className="num">Costo/hora</th><th>Método</th><th className="num">Subtotal</th>{!bloqueada && <th />}</tr></thead>
                <tbody>
                  {lineas.map(linea => (
                    <tr key={linea.id}>
                      <td>{familiaPorId.get(linea.familia_trabajo_id)?.nombre || linea.familia_trabajo_id}</td>
                      <td>{actividadPorId.get(linea.actividad_id)?.nombre || linea.actividad_id}</td>
                      <td>{cargoPorId.get(linea.cargo_id)?.nombre || linea.cargo_id}</td>
                      <td className="num">{numero(linea.horas).toLocaleString('es-PE', { maximumFractionDigits: 2 })}</td>
                      <td className="num">{moneyUsd(linea.costo_hora_snapshot)}</td>
                      <td><span className={`badge ${linea.metodo_usado === 'planilla' ? 'badge-cyan' : 'badge-gray'}`}>{linea.metodo_usado}</span></td>
                      <td className="num" style={{ fontWeight: 700 }}>{moneyUsd(linea.subtotal)}</td>
                      {!bloqueada && <td><button className="icon-btn text-danger" type="button" disabled={eliminandoId === linea.id} onClick={() => eliminarLinea(linea)} title="Eliminar línea">{I.trash}</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  };

  return (
    <div className="page-content">
      <div className="page-header" style={{ borderBottom: 'none', paddingBottom: 8 }}>
        <div>
          <button className="btn btn-ghost" onClick={() => navigate('hoja_costeo', { detail: hoja.id })} style={{ marginBottom: 10, padding: 0, color: 'var(--cyan)' }}>← Volver a la hoja</button>
          <h1 className="page-title">{hoja.numero} · Wizard de Costeo</h1>
          <div className="page-sub">Nueva experiencia de costeo. El formulario original permanece disponible sin cambios.</div>
        </div>
        <span className={`badge ${bloqueada ? 'badge-green' : 'badge-gray'}`} style={{ alignSelf: 'flex-start', textTransform: 'uppercase' }}>{hoja.estado || 'borrador'}</span>
      </div>

      <nav aria-label="Pasos del wizard" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(110px, 1fr))', gap: 8, margin: '12px 0 20px', overflowX: 'auto' }}>
        {STEPS.map((item, index) => (
          <button key={item.id} className={paso === item.id ? 'btn btn-primary' : 'btn btn-secondary'} type="button" onClick={() => setPaso(item.id)} style={{ justifyContent: 'flex-start', whiteSpace: 'nowrap' }}>
            <span style={{ opacity: 0.8 }}>{index + 1}.</span> {item.label}
          </button>
        ))}
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)', gap: 20, alignItems: 'start' }}>
        <div>{renderPaso()}</div>
        <aside style={{ position: 'sticky', top: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>Resumen económico</div>
            {[
              ['Mano de obra', subtotalManoObra],
              ['Materiales', 0],
              ['Terceros / Logística', 0],
              ['Activos', 0],
            ].map(([label, valor]) => (
              <div key={label} className="row" style={{ justifyContent: 'space-between', marginBottom: 11, fontSize: 13 }}>
                <span className="text-muted">{label}</span><span className="num">{moneyUsd(valor)}</span>
              </div>
            ))}
            <div style={{ borderTop: '2px solid var(--border)', marginTop: 16, paddingTop: 14 }} className="row">
              <strong>Costo total</strong><strong className="num" style={{ fontSize: 17, color: 'var(--cyan)' }}>{moneyUsd(subtotalManoObra)}</strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

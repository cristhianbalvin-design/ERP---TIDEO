import { useEffect, useMemo, useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';

const ESTADOS_CIERRE = ['ejecucion', 'pendiente_cierre'];
const ESTADOS_PARTE_FINALIZADOS = new Set(['aprobado', 'rechazado']);

const generarIdCierre = () => `cier_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.floor(Math.random() * 1000000)}`}`;
const hoy = () => new Date().toISOString().slice(0, 10);

const estadoParte = estado => String(estado || '').toLowerCase();

const partesResumen = partes => {
  const aprobados = partes.filter(parte => estadoParte(parte.estado) === 'aprobado');
  const pendientes = partes.filter(parte => !ESTADOS_PARTE_FINALIZADOS.has(estadoParte(parte.estado)));
  return { aprobados, pendientes };
};

const estadoCierreOT = partes => {
  const { aprobados, pendientes } = partesResumen(partes);
  if (!aprobados.length) return { bloqueada: true, mensaje: 'Requiere al menos un parte aprobado.' };
  if (pendientes.length) return { bloqueada: true, mensaje: `Tiene ${pendientes.length} parte(s) pendiente(s) de aprobación.` };
  return { bloqueada: false, mensaje: 'Lista para cierre técnico.' };
};

const IndicadorPendiente = () => (
  <span className="badge orange" style={{ marginLeft: 8, fontSize: 10 }}>Pendiente de conexión real</span>
);

const Campo = ({ label, children, pendiente = false }) => (
  <div className="field">
    <label>{label}{pendiente && <IndicadorPendiente />}</label>
    {children}
  </div>
);

const EstadoPartes = ({ partes }) => {
  const { aprobados, pendientes } = partesResumen(partes);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <span className="badge green">{aprobados.length} aprobado(s)</span>
      {pendientes.length > 0 && <span className="badge orange">{pendientes.length} pendiente(s)</span>}
      {!partes.length && <span className="badge slate">Sin partes</span>}
    </div>
  );
};

export const CierreConformidadPage = () => {
  const sesionOperativa = useSesionOperativa();
  const [ots, setOts] = useState([]);
  const [partesPorOT, setPartesPorOT] = useState({});
  const [tareasPorOT, setTareasPorOT] = useState({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [otSeleccionada, setOtSeleccionada] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [form, setForm] = useState({
    fecha_cierre: hoy(),
    descripcion_trabajo: '',
    horas_total: 0,
    avance_final: 100,
    observaciones: '',
    costo_terceros: '',
    costo_logistica: '',
    conformidad: 'pendiente',
    horometro_final: '',
    firmado_por: '',
    cargo_supervisor: 'Supervisor de taller',
    cliente_conforme: 'si',
    representante_cliente: '',
    cargo_cliente: '',
    observaciones_cliente: '',
    motivo_rechazo: '',
  });

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId || sesionOperativa.estado !== 'listo') {
      setOts([]);
      setPartesPorOT({});
      setTareasPorOT({});
      return () => { vigente = false; };
    }

    const cargar = async () => {
      setCargando(true);
      setError('');
      try {
        const sb = getSupabaseClient();
        let consultaOTs = sb
          .from('ordenes_trabajo')
          .select('id,numero,estado,sociedad_id,fecha_programada,descripcion,servicio,tecnico_responsable_id,created_at')
          .eq('empresa_id', sesionOperativa.empresaId)
          .in('estado', ESTADOS_CIERRE)
          .order('fecha_programada', { ascending: true, nullsFirst: false });
        if (sesionOperativa.sociedadId && !sesionOperativa.vistaConsolidada) {
          consultaOTs = consultaOTs.eq('sociedad_id', sesionOperativa.sociedadId);
        }
        if (sesionOperativa.vistaConsolidada && Array.isArray(sesionOperativa.sociedadesIdsAlcance) && sesionOperativa.sociedadesIdsAlcance.length) {
          consultaOTs = consultaOTs.in('sociedad_id', sesionOperativa.sociedadesIdsAlcance);
        }
        const { data: otsData, error: otsError } = await consultaOTs;
        if (otsError) throw otsError;

        const otIds = (otsData || []).map(ot => ot.id);
        if (!otIds.length) {
          if (vigente) {
            setOts([]);
            setPartesPorOT({});
            setTareasPorOT({});
          }
          return;
        }

        // Filtro de sociedad en cliente conservado como defensa en profundidad.
        // RLS real ya existe a nivel de BD (migración 461): partes_diarios tiene
        // sociedad_id derivado por trigger + policies con alcance societario.
        let consultaPartes = sb
          .from('partes_diarios')
          .select('id,orden_trabajo_id,fecha,horas_normales,estado,actividad,ordenes_trabajo!inner(id,sociedad_id)')
          .eq('empresa_id', sesionOperativa.empresaId)
          .in('orden_trabajo_id', otIds);
        if (sesionOperativa.sociedadId && !sesionOperativa.vistaConsolidada) {
          consultaPartes = consultaPartes.eq('ordenes_trabajo.sociedad_id', sesionOperativa.sociedadId);
        }
        if (sesionOperativa.vistaConsolidada && Array.isArray(sesionOperativa.sociedadesIdsAlcance) && sesionOperativa.sociedadesIdsAlcance.length) {
          consultaPartes = consultaPartes.in('ordenes_trabajo.sociedad_id', sesionOperativa.sociedadesIdsAlcance);
        }
        const [partesResultado, tareasResultado] = await Promise.all([
          consultaPartes.order('fecha', { ascending: true }),
          sb.from('ot_tareas')
            .select('id,ot_id,titulo,estado,completada,avance_pct,horas_reales')
            .eq('empresa_id', sesionOperativa.empresaId)
            .in('ot_id', otIds)
            .order('orden', { ascending: true }),
        ]);
        if (partesResultado.error) throw partesResultado.error;
        if (tareasResultado.error) throw tareasResultado.error;

        const siguientesPartes = {};
        (partesResultado.data || []).forEach(parte => {
          (siguientesPartes[parte.orden_trabajo_id] ||= []).push(parte);
        });
        const siguientesTareas = {};
        (tareasResultado.data || []).forEach(tarea => {
          (siguientesTareas[tarea.ot_id] ||= []).push(tarea);
        });
        if (vigente) {
          setOts(otsData || []);
          setPartesPorOT(siguientesPartes);
          setTareasPorOT(siguientesTareas);
        }
      } catch (cargaError) {
        if (vigente) {
          setOts([]);
          setPartesPorOT({});
          setTareasPorOT({});
          setError(cargaError?.message || 'No se pudieron cargar las OTs para cierre.');
        }
      } finally {
        if (vigente) setCargando(false);
      }
    };

    cargar();
    return () => { vigente = false; };
  }, [sesionOperativa.empresaId, sesionOperativa.estado, sesionOperativa.sociedadId, sesionOperativa.sociedadesIdsAlcance, sesionOperativa.vistaConsolidada]);

  const partesSeleccionadas = otSeleccionada ? (partesPorOT[otSeleccionada.id] || []) : [];
  const tareasSeleccionadas = otSeleccionada ? (tareasPorOT[otSeleccionada.id] || []) : [];
  const reglaCierre = estadoCierreOT(partesSeleccionadas);
  const horasAprobadas = useMemo(
    () => partesResumen(partesSeleccionadas).aprobados.reduce((total, parte) => total + Number(parte.horas_normales || 0), 0),
    [partesSeleccionadas],
  );

  const abrirCierre = ot => {
    const partes = partesPorOT[ot.id] || [];
    const regla = estadoCierreOT(partes);
    if (regla.bloqueada) {
      setMensaje(`OT ${ot.numero || ot.id}: ${regla.mensaje}`);
      return;
    }
    const aprobados = partesResumen(partes).aprobados;
    setMensaje('');
    setOtSeleccionada(ot);
    setForm(actual => ({
      ...actual,
      fecha_cierre: hoy(),
      descripcion_trabajo: ot.descripcion || '',
      horas_total: aprobados.reduce((total, parte) => total + Number(parte.horas_normales || 0), 0),
      avance_final: 100,
      conformidad: 'pendiente',
    }));
  };

  const cerrarOT = async event => {
    event.preventDefault();
    if (!otSeleccionada || !sesionOperativa.permiteEscritura || guardando) return;
    if (reglaCierre.bloqueada) {
      setMensaje(reglaCierre.mensaje);
      return;
    }

    const tareasIncompletas = tareasSeleccionadas.filter(tarea => (
      !tarea.completada && !['completada', 'cerrada_sin_completar'].includes(String(tarea.estado || '').toLowerCase())
    ));
    const snapshotTareas = tareasIncompletas.map(tarea => ({
      id: tarea.id,
      titulo: tarea.titulo,
      estado: tarea.estado,
      avance_pct: tarea.avance_pct,
      horas_reales: tarea.horas_reales,
    }));
    const payload = {
      id: generarIdCierre(),
      empresa_id: sesionOperativa.empresaId,
      orden_trabajo_id: otSeleccionada.id,
      fecha_cierre: form.fecha_cierre || hoy(),
      resultado: 'conforme',
      observaciones: form.observaciones || null,
      conformidad_cliente: { tipo: 'pendiente' },
      evidencias: [],
      estado: 'cerrado',
      descripcion_trabajo: form.descripcion_trabajo || null,
      fecha_inicio_real: partesResumen(partesSeleccionadas).aprobados[0]?.fecha || null,
      horas_total: Number(form.horas_total || 0),
      avance_final: Number(form.avance_final || 0),
      costo_terceros: Number(form.costo_terceros || 0),
      costo_logistica: Number(form.costo_logistica || 0),
    };

    setGuardando(true);
    setMensaje('');
    try {
      const sb = getSupabaseClient();
      // sociedad_id y cerrado_por no se envían: trigger y auth.uid() los derivan en la RPC.
      const { data: cierreResultado, error: cierreError } = await sb.rpc('cerrar_ot_con_conformidad', {
        p_id: payload.id,
        p_empresa_id: payload.empresa_id,
        p_orden_trabajo_id: payload.orden_trabajo_id,
        p_fecha_cierre: payload.fecha_cierre,
        p_resultado: payload.resultado,
        p_observaciones: payload.observaciones,
        p_conformidad_cliente: payload.conformidad_cliente,
        p_evidencias: payload.evidencias,
        p_estado: payload.estado,
        p_descripcion_trabajo: payload.descripcion_trabajo,
        p_fecha_inicio_real: payload.fecha_inicio_real,
        p_horas_total: payload.horas_total,
        p_avance_final: payload.avance_final,
        p_costo_terceros: payload.costo_terceros,
        p_costo_logistica: payload.costo_logistica,
        p_tareas_incompletas: snapshotTareas,
      });
      if (cierreError) throw cierreError;
      if (!cierreResultado?.cierre_id) throw new Error('La RPC no devolvió el identificador del cierre.');

      setOts(actual => actual.filter(ot => ot.id !== otSeleccionada.id));
      setOtSeleccionada(null);
      setMensaje(`OT ${otSeleccionada.numero || otSeleccionada.id} cerrada correctamente.`);
    } catch (guardadoError) {
      setMensaje(`No se pudo completar el cierre: ${guardadoError?.message || 'error inesperado'}`);
    } finally {
      setGuardando(false);
    }
  };

  if (otSeleccionada) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => setOtSeleccionada(null)}>← Volver a OTs</button>
            <h1 style={{ marginTop: 12 }}>Cierre técnico · {otSeleccionada.numero || otSeleccionada.id}</h1>
            <div className="sub">La conformidad pendiente se registra sin token ni enlace público.</div>
          </div>
        </div>

        {!sesionOperativa.permiteEscritura && (
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>Vista de solo lectura: tu contexto actual no permite registrar cierres.</div>
        )}
        {mensaje && <div className="alert" style={{ marginBottom: 16 }}>{mensaje}</div>}
        {reglaCierre.bloqueada && <div className="alert alert-warning" style={{ marginBottom: 16 }}>{reglaCierre.mensaje}</div>}

        <form onSubmit={cerrarOT}>
          <fieldset disabled={!sesionOperativa.permiteEscritura || guardando} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Resumen real de la OT</h3></div>
              <div className="card-body">
                <div className="grid-3">
                  <div><div className="muted" style={{ fontSize: 11 }}>Estado</div><div style={{ fontWeight: 700 }}>{otSeleccionada.estado}</div></div>
                  <div><div className="muted" style={{ fontSize: 11 }}>Partes diarios</div><EstadoPartes partes={partesSeleccionadas} /></div>
                  <div><div className="muted" style={{ fontSize: 11 }}>Horas aprobadas</div><div style={{ fontWeight: 700 }}>{horasAprobadas.toFixed(2)} h</div></div>
                </div>
                <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>{otSeleccionada.descripcion || otSeleccionada.servicio || 'Sin descripción'}</div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Datos que se registran en el cierre</h3></div>
              <div className="card-body">
                <div className="grid-2">
                  <Campo label="Fecha de cierre"><input className="input" type="date" value={form.fecha_cierre} onChange={event => setForm(actual => ({ ...actual, fecha_cierre: event.target.value }))} required /></Campo>
                  <Campo label="Total de horas trabajadas"><input className="input" type="number" min="0" step="0.25" value={form.horas_total} onChange={event => setForm(actual => ({ ...actual, horas_total: event.target.value }))} required /></Campo>
                  <Campo label="Avance final (%)"><input className="input" type="number" min="0" max="100" value={form.avance_final} onChange={event => setForm(actual => ({ ...actual, avance_final: event.target.value }))} required /></Campo>
                  <Campo label="Costo de terceros"><input className="input" type="number" min="0" step="0.01" value={form.costo_terceros} onChange={event => setForm(actual => ({ ...actual, costo_terceros: event.target.value }))} /></Campo>
                  <Campo label="Costo logístico"><input className="input" type="number" min="0" step="0.01" value={form.costo_logistica} onChange={event => setForm(actual => ({ ...actual, costo_logistica: event.target.value }))} /></Campo>
                </div>
                <Campo label="Descripción del trabajo"><textarea className="input" rows="3" value={form.descripcion_trabajo} onChange={event => setForm(actual => ({ ...actual, descripcion_trabajo: event.target.value }))} /></Campo>
                <Campo label="Observaciones finales"><textarea className="input" rows="3" value={form.observaciones} onChange={event => setForm(actual => ({ ...actual, observaciones: event.target.value }))} /></Campo>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Conformidad del cliente</h3></div>
              <div className="card-body">
                <div className="field"><label>Modalidad de conformidad</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary" onClick={() => setForm(actual => ({ ...actual, conformidad: 'pendiente' }))}>Pendiente</button>
                    <button type="button" className="btn btn-secondary" disabled>Digital · próximamente</button>
                    <button type="button" className="btn btn-secondary" disabled>Física · próximamente</button>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Al cerrar se guardará <code>{'{ tipo: \'pendiente\' }'}</code>; no se genera token ni se invoca RPC de conformidad.</div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Campos del mock conservados</h3><IndicadorPendiente /></div>
              <div className="card-body">
                <div className="alert alert-warning" style={{ marginBottom: 16 }}>Estos campos permanecen visibles y editables. No tienen aún una columna o flujo real equivalente en esta fase, por lo que no se persisten en el cierre.</div>
                <div className="grid-2">
                  <Campo label="Horómetro final del equipo" pendiente><input className="input" type="number" min="0" value={form.horometro_final} onChange={event => setForm(actual => ({ ...actual, horometro_final: event.target.value }))} /></Campo>
                  <Campo label="Nombre del supervisor" pendiente><input className="input" value={form.firmado_por} onChange={event => setForm(actual => ({ ...actual, firmado_por: event.target.value }))} /></Campo>
                  <Campo label="Cargo del supervisor" pendiente><input className="input" value={form.cargo_supervisor} onChange={event => setForm(actual => ({ ...actual, cargo_supervisor: event.target.value }))} /></Campo>
                  <Campo label="Respuesta del cliente" pendiente><select className="select" value={form.cliente_conforme} onChange={event => setForm(actual => ({ ...actual, cliente_conforme: event.target.value }))}><option value="si">Sí, conforme</option><option value="no">No conforme</option></select></Campo>
                  <Campo label="Representante del cliente" pendiente><input className="input" value={form.representante_cliente} onChange={event => setForm(actual => ({ ...actual, representante_cliente: event.target.value }))} /></Campo>
                  <Campo label="Cargo del cliente" pendiente><input className="input" value={form.cargo_cliente} onChange={event => setForm(actual => ({ ...actual, cargo_cliente: event.target.value }))} /></Campo>
                </div>
                <Campo label="Observaciones del cliente" pendiente><textarea className="input" rows="2" value={form.observaciones_cliente} onChange={event => setForm(actual => ({ ...actual, observaciones_cliente: event.target.value }))} /></Campo>
                {form.cliente_conforme === 'no' && <Campo label="Motivo de no conformidad" pendiente><textarea className="input" rows="3" value={form.motivo_rechazo} onChange={event => setForm(actual => ({ ...actual, motivo_rechazo: event.target.value }))} /></Campo>}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setOtSeleccionada(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={reglaCierre.bloqueada || guardando || !sesionOperativa.permiteEscritura}>{guardando ? 'Cerrando…' : 'Confirmar cierre técnico'}</button>
            </div>
          </fieldset>
        </form>
        <FooterBrand />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Cierre & Conformidad</h1><div className="sub">OTs en ejecución o pendientes de cierre, con validación de partes diarios.</div></div>
      </div>
      {!sesionOperativa.permiteEscritura && sesionOperativa.estado === 'listo' && <div className="alert alert-warning" style={{ marginBottom: 16 }}>Vista de solo lectura: tu contexto actual no permite registrar cierres.</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {mensaje && <div className="alert" style={{ marginBottom: 16 }}>{mensaje}</div>}
      {cargando && <div className="card"><div className="card-body">Cargando OTs y partes diarios…</div></div>}
      {!cargando && !error && <div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>OT</th><th>Estado</th><th>Partes</th><th>Validación</th><th>Acción</th></tr></thead><tbody>
        {ots.map(ot => {
          const partes = partesPorOT[ot.id] || [];
          const regla = estadoCierreOT(partes);
          return <tr key={ot.id}><td><div style={{ fontWeight: 700 }}>{ot.numero || ot.id}</div><div className="muted" style={{ fontSize: 11 }}>{ot.descripcion || ot.servicio || 'Sin descripción'}</div></td><td><span className="badge slate">{ot.estado}</span></td><td><EstadoPartes partes={partes} /></td><td><span className={regla.bloqueada ? 'badge orange' : 'badge green'}>{regla.mensaje}</span></td><td><button className="btn btn-sm btn-primary" disabled={regla.bloqueada || !sesionOperativa.permiteEscritura} onClick={() => abrirCierre(ot)}>Cierre técnico</button></td></tr>;
        })}
      </tbody></table></div>{!ots.length && <div className="card-body muted">No hay OTs en ejecución o pendientes de cierre dentro de tu alcance societario.</div>}</div>}
      <FooterBrand />
    </div>
  );
};

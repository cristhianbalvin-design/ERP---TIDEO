import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { ActaConformidadWizard } from './ActaConformidadWizard.jsx';
import { etiquetaTipoCobro, reglaCierreOT, resumenPartes, tipoCobroOT } from './actaConformidadLogic.js';

const ESTADOS_CIERRE = ['ejecucion', 'pendiente_cierre'];

const normalizar = valor => String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const IconoOT = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h8l2 2v12H4V3z" /><path d="M7 8h6M7 11h6M7 14h3" /></svg>
);

export const CierreConformidadPage = () => {
  const sesionOperativa = useSesionOperativa();
  const [ots, setOts] = useState([]);
  const [partesPorOT, setPartesPorOT] = useState({});
  const [tareasPorOT, setTareasPorOT] = useState({});
  const [cuentas, setCuentas] = useState({});
  const [osPorId, setOsPorId] = useState({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [otSeleccionada, setOtSeleccionada] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [recarga, setRecarga] = useState(0);

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
          .select('id,numero,estado,sociedad_id,fecha_programada,descripcion,servicio,direccion_ejecucion,tecnico_responsable_id,cuenta_id,os_cliente_id,tipo_cobro,avance_pct,created_at')
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

        const lista = otsData || [];
        const otIds = lista.map(ot => ot.id);
        if (!otIds.length) {
          if (vigente) { setOts([]); setPartesPorOT({}); setTareasPorOT({}); }
          return;
        }

        // Filtro de sociedad en cliente conservado como defensa en profundidad; RLS ya lo aplica.
        let consultaPartes = sb
          .from('partes_diarios')
          .select('id,orden_trabajo_id,fecha,horas_normales,horas_extra,estado,actividad,ordenes_trabajo!inner(id,sociedad_id)')
          .eq('empresa_id', sesionOperativa.empresaId)
          .in('orden_trabajo_id', otIds);
        if (sesionOperativa.sociedadId && !sesionOperativa.vistaConsolidada) {
          consultaPartes = consultaPartes.eq('ordenes_trabajo.sociedad_id', sesionOperativa.sociedadId);
        }
        if (sesionOperativa.vistaConsolidada && Array.isArray(sesionOperativa.sociedadesIdsAlcance) && sesionOperativa.sociedadesIdsAlcance.length) {
          consultaPartes = consultaPartes.in('ordenes_trabajo.sociedad_id', sesionOperativa.sociedadesIdsAlcance);
        }
        const cuentaIds = [...new Set(lista.map(ot => ot.cuenta_id).filter(Boolean))];
        const osIds = [...new Set(lista.map(ot => ot.os_cliente_id).filter(Boolean))];
        const opcional = async consulta => { try { const { data, error: e } = await consulta; return e ? [] : (data || []); } catch { return []; } };
        const [partesResultado, tareasResultado, cuentasData, osData] = await Promise.all([
          consultaPartes.order('fecha', { ascending: true }),
          sb.from('ot_tareas')
            .select('id,ot_id,titulo,estado,completada,avance_pct,horas_reales')
            .eq('empresa_id', sesionOperativa.empresaId)
            .in('ot_id', otIds)
            .order('orden', { ascending: true }),
          cuentaIds.length ? opcional(sb.from('cuentas').select('id,razon_social,nombre_comercial').in('id', cuentaIds)) : [],
          osIds.length ? opcional(sb.from('os_clientes').select('id,numero,tipo_cobro').in('id', osIds)) : [],
        ]);
        if (partesResultado.error) throw partesResultado.error;
        if (tareasResultado.error) throw tareasResultado.error;

        const siguientesPartes = {};
        (partesResultado.data || []).forEach(parte => { (siguientesPartes[parte.orden_trabajo_id] ||= []).push(parte); });
        const siguientesTareas = {};
        (tareasResultado.data || []).forEach(tarea => { (siguientesTareas[tarea.ot_id] ||= []).push(tarea); });
        if (vigente) {
          setOts(lista);
          setPartesPorOT(siguientesPartes);
          setTareasPorOT(siguientesTareas);
          setCuentas(Object.fromEntries(cuentasData.map(c => [c.id, c.razon_social || c.nombre_comercial || ''])));
          setOsPorId(Object.fromEntries(osData.map(o => [o.id, o])));
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
  }, [sesionOperativa.empresaId, sesionOperativa.estado, sesionOperativa.sociedadId, sesionOperativa.sociedadesIdsAlcance, sesionOperativa.vistaConsolidada, recarga]);

  const filas = useMemo(() => ots.map(ot => {
    const partes = partesPorOT[ot.id] || [];
    return { ot, partes, regla: reglaCierreOT(partes), resumen: resumenPartes(partes), cliente: cuentas[ot.cuenta_id] || '', tipoCobro: tipoCobroOT(ot, osPorId[ot.os_cliente_id]) };
  }), [ots, partesPorOT, cuentas, osPorId]);

  const filtradas = useMemo(() => {
    const termino = normalizar(busqueda.trim());
    if (!termino) return filas;
    return filas.filter(({ ot, cliente }) => normalizar([ot.numero, ot.servicio, ot.descripcion, cliente].join(' ')).includes(termino));
  }, [filas, busqueda]);

  const listas = filas.filter(fila => !fila.regla.bloqueada).length;
  const conPendientes = filas.filter(fila => fila.resumen.pendientes.length > 0).length;

  const abrir = useCallback(fila => {
    if (fila.regla.bloqueada) {
      setMensaje(`OT ${fila.ot.numero || fila.ot.id}: ${fila.regla.mensaje.toLowerCase()}. Aprueba sus partes diarios antes de emitir el acta.`);
      return;
    }
    setMensaje('');
    setOtSeleccionada(fila.ot);
  }, []);

  if (otSeleccionada) {
    return (
      <ActaConformidadWizard
        ot={otSeleccionada}
        partes={partesPorOT[otSeleccionada.id] || []}
        tareas={tareasPorOT[otSeleccionada.id] || []}
        sesion={sesionOperativa}
        onVolver={() => { setOtSeleccionada(null); setRecarga(n => n + 1); }}
        onEmitida={() => setOts(actual => actual.filter(ot => ot.id !== otSeleccionada.id))}
      />
    );
  }

  return (
    <section className="dx-ui dx-acta dx-acta-listado" aria-labelledby="dx-acta-list-titulo">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Operaciones · Cierre técnico</div>
          <h1 className="dx-ui-title" id="dx-acta-list-titulo">Cierre y conformidad</h1>
          <p className="dx-ui-sub">OTs en ejecución o pendientes de cierre. Cada cierre emite un acta con fotos y las firmas del técnico y del cliente.</p>
        </div>
      </header>

      {!sesionOperativa.permiteEscritura && sesionOperativa.estado === 'listo' && <div className="dx-acta-note is-amber" role="status">Vista de solo lectura: tu contexto actual no permite emitir actas.</div>}
      {mensaje && <div className="dx-acta-alert" role="alert">{mensaje}</div>}

      <div className="dx-ui-summary" aria-label="Resumen de cierres">
        <div className="dx-ui-chip"><b>{filas.length}</b><span>OTs por cerrar</span></div>
        <div className="dx-ui-chip"><b>{listas}</b><span>listas para acta</span></div>
        <div className="dx-ui-chip"><b>{conPendientes}</b><span>con partes por aprobar</span></div>
      </div>

      <div className="dx-ui-card">
        <div className="dx-ui-toolbar">
          <h2>OTs por cerrar</h2>
          <span className="dx-ui-count">{filtradas.length} {filtradas.length === 1 ? 'resultado' : 'resultados'}</span>
          <label className="dx-ui-search">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
            <input value={busqueda} onChange={event => setBusqueda(event.target.value)} placeholder="Buscar por OT, servicio o cliente…" aria-label="Buscar OTs por cerrar" />
          </label>
        </div>
        <div className="dx-ui-head dx-acta-cols" aria-hidden="true"><span>OT</span><span>Servicio y cliente</span><span>Partes</span><span>Estado</span><span /></div>
        {cargando ? <div className="dx-ui-empty">Cargando OTs y partes diarios…</div>
          : error ? <div className="dx-ui-empty" role="alert">{error} <button type="button" className="dx-btn" onClick={() => setRecarga(n => n + 1)}>Reintentar</button></div>
          : !filas.length ? <div className="dx-ui-empty">No hay OTs en ejecución o pendientes de cierre dentro de tu alcance.</div>
          : !filtradas.length ? <div className="dx-ui-empty">No hay OTs que coincidan con la búsqueda.</div>
          : filtradas.map(fila => {
            const { ot, regla, resumen, cliente, tipoCobro } = fila;
            const mensual = tipoCobro === 'recurrente_mensual';
            return (
              <div
                key={ot.id}
                className={`dx-ui-row dx-acta-cols dx-acta-row${regla.bloqueada ? ' is-blocked' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Abrir acta de ${ot.numero || ot.id}`}
                onClick={() => abrir(fila)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrir(fila); }
                }}
              >
                <div className="dx-acta-row-ot">
                  <span className={`dx-ui-icon ${mensual ? 'is-violet' : 'is-cyan'}`}><IconoOT /></span>
                  <span><b>{ot.numero || ot.id}</b><small>{etiquetaTipoCobro(tipoCobro)}</small></span>
                </div>
                <div className="dx-acta-row-main">
                  <b>{ot.servicio || ot.descripcion || 'Sin descripción'}</b>
                  <small>{[cliente, ot.direccion_ejecucion].filter(Boolean).join(' · ') || '—'}</small>
                </div>
                <div className="dx-acta-row-partes">
                  <span>{resumen.aprobados.length} aprobado{resumen.aprobados.length === 1 ? '' : 's'}</span>
                  <small>{resumen.horas.toLocaleString('es-PE')} h</small>
                </div>
                <div className="dx-acta-row-estado"><span className={`dx-ui-pill is-${regla.tono}`}><i />{regla.mensaje}</span></div>
                <svg className="dx-ui-arrow" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5" /></svg>
              </div>
            );
          })}
      </div>
    </section>
  );
};

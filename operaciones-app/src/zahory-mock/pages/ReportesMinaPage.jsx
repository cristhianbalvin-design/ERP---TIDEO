import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { WorkMenuButton } from '../components/WorkMenuButton.jsx';
import { useCompactWorkMode } from '../../useCompactWorkMode.js';
import { subirAdjunto } from '../../../../src/services/storageService.js';
import {
  buscarMaterialesMina, contextoReporteMina, guardarReporteMina, listarReportesMina, revisarReporteMina,
} from '../../services/reportesMinaService.js';
import {
  CAMPOS_HORAS, CONTADORES, DURACION_TURNO, ESTADOS_EQUIPO, ESTADOS_REPORTE, FILTROS_ESTADO, PRIORIDADES_BACKLOG,
  TIPOS_MANTENIMIENTO, armarPayload, contarPorEstado, diferenciaHorometro, etiquetaTurno, fechaCorta, fechaLarga,
  filtrarReportes, formDesdeReporte, formNuevo, formatoNumero, horometrosValidos, mapearErrorReporte, minasDeReportes,
  puedeEditar, resumenHoras, textoEquipo, validarReporte,
} from './reportesMinaLogic.js';

const nuevoId = prefijo => `${prefijo}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.floor(Math.random() * 1e6)}`}`;

const RUTAS_ICONO = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-3.5-3.5',
  arrow: 'm9 6 6 6-6 6',
  mine: 'M3 21h18M6 21V9l6-5 6 5v12M10 21v-6h4v6',
  gauge: 'M12 5a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 13l3-3M9 2h6',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  box: 'M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8',
  cart: 'M6 6h15l-2 8H8L6 3H3M9 20h.01M18 20h.01',
  camera: 'M4 7h3l2-3h6l2 3h3v13H4zM12 9a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  x: 'M6 6l12 12M18 6 6 18',
};

function Icono({ nombre, className = 'dx-rmina-ic' }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={RUTAS_ICONO[nombre]} /></svg>;
}

function activarConTeclado(evento, accion) {
  if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); accion(); }
}

function PillEstado({ estado }) {
  const info = ESTADOS_REPORTE[estado] || { etiqueta: estado || '—', pill: 'is-gray' };
  return <span className={`dx-ui-pill ${info.pill}`}><i />{info.etiqueta}</span>;
}

function BarraHoras({ horas }) {
  const r = resumenHoras(horas);
  const ancho = valor => `${Math.min(Math.max(valor, 0), DURACION_TURNO) / DURACION_TURNO * 100}%`;
  return (
    <div className="dx-rmina-bar" aria-hidden="true">
      <span className="is-ht" style={{ width: ancho(r.grupos.ht) }} />
      <span className="is-prev" style={{ width: ancho(r.grupos.prev) }} />
      <span className="is-corr" style={{ width: ancho(r.grupos.corr) }} />
      <span className="is-sb" style={{ width: ancho(r.grupos.sb) }} />
    </div>
  );
}

function SeccionCabecera({ icono, tono = 'is-cyan', titulo, ayuda, extra }) {
  return (
    <div className="dx-rmina-sec-h">
      <span className={`dx-ui-icon ${tono}`}><Icono nombre={icono} /></span>
      <div><h3>{titulo}</h3>{ayuda && <p>{ayuda}</p>}</div>
      {extra}
    </div>
  );
}

function BuscadorMaterial({ empresaId, sociedadId, placeholder, etiqueta, onSelect, disabled }) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const termino = texto.trim();
    if (!empresaId || termino.length < 2) { setResultados([]); setError(''); return undefined; }
    let vigente = true;
    const temporizador = setTimeout(async () => {
      setCargando(true); setError('');
      try {
        const data = await buscarMaterialesMina({ empresa_id: empresaId, sociedad_id: sociedadId, busqueda: termino });
        if (vigente) setResultados(Array.isArray(data) ? data : []);
      } catch (fallo) {
        if (vigente) { setResultados([]); setError(mapearErrorReporte(fallo)); }
      } finally { if (vigente) setCargando(false); }
    }, 280);
    return () => { vigente = false; clearTimeout(temporizador); };
  }, [texto, empresaId, sociedadId]);
  const elegir = material => { onSelect(material); setTexto(''); setResultados([]); };
  return (
    <div className="dx-rmina-buscar">
      <label className="dx-ui-search">
        <Icono nombre="search" />
        <input type="search" value={texto} disabled={disabled} aria-label={etiqueta} placeholder={placeholder} onChange={e => setTexto(e.target.value)} />
      </label>
      {(cargando || error || resultados.length > 0) && (
        <div className="dx-rmina-opciones" role="listbox" aria-label={etiqueta}>
          {cargando && <div className="dx-rmina-opcion-info">Buscando materiales…</div>}
          {error && <div className="dx-rmina-opcion-info is-error">{error}</div>}
          {resultados.map(material => (
            <button type="button" role="option" aria-selected="false" key={material.material_id} className="dx-rmina-opcion"
              onMouseDown={e => e.preventDefault()} onClick={() => elegir(material)}>
              <b>{material.codigo}</b> {material.descripcion}
              <small>Disp. {formatoNumero(material.disponible, 2)} {material.unidad || 'und'}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportesMinaPage({ onNav, vistaInicial = 'lista' }) {
  const sesion = useSesionOperativa();
  const { empresaId } = sesion;
  const sociedadFiltro = sesion.vistaConsolidada ? null : (sesion.sociedadId || null);
  const [vista, setVista] = useState('lista');
  const [reportes, setReportes] = useState([]);
  const [permisos, setPermisos] = useState({ crear: false, aprobar: false, editar: false });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroMina, setFiltroMina] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState('');
  const [contexto, setContexto] = useState(null);
  const [form, setForm] = useState(null);
  const [errorForm, setErrorForm] = useState('');
  const [guardando, setGuardando] = useState('');
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [nuevoBacklog, setNuevoBacklog] = useState(null);
  const [observacion, setObservacion] = useState('');
  const [errorRevision, setErrorRevision] = useState('');
  const [revisando, setRevisando] = useState('');
  const vistaInicialAplicada = useRef(false);
  const inputFoto = useRef(null);

  const recargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    try {
      const resultado = await listarReportesMina({ empresa_id: empresaId, sociedad_id: sociedadFiltro });
      setReportes(Array.isArray(resultado?.reportes) ? resultado.reportes : []);
      setPermisos({ crear: false, aprobar: false, editar: false, ...(resultado?.permisos || {}) });
    } catch (fallo) { setError(mapearErrorReporte(fallo)); }
    finally { setCargando(false); }
  }, [empresaId, sociedadFiltro]);

  const cargarContexto = useCallback(async () => {
    const resultado = await contextoReporteMina({ empresa_id: empresaId, sociedad_id: sociedadFiltro });
    const ctx = { ots: [], tecnicos: [], tecnico: null, duracion_turno: DURACION_TURNO, ...(resultado || {}) };
    setContexto(ctx);
    return ctx;
  }, [empresaId, sociedadFiltro]);

  useEffect(() => {
    if (sesion.cargando || sesion.estado === 'cargando') return;
    if (empresaId && sesion.estado === 'listo') recargar();
  }, [empresaId, sesion.cargando, sesion.estado, recargar]);

  const abrirNuevo = useCallback(async () => {
    setAviso(''); setErrorForm(''); setNuevoBacklog(null);
    try {
      const ctx = contexto || await cargarContexto();
      const ot = ctx.ots.length === 1 ? ctx.ots[0] : null;
      setForm({ ...formNuevo({ ot, tecnico: ctx.tecnico }), id: nuevoId('pd') });
      setVista('form');
      if (typeof window !== 'undefined') window.scrollTo?.(0, 0);
    } catch (fallo) { setError(mapearErrorReporte(fallo)); }
  }, [contexto, cargarContexto]);

  useEffect(() => {
    if (vistaInicialAplicada.current || vistaInicial !== 'nuevo') return;
    if (!empresaId || sesion.estado !== 'listo') return;
    vistaInicialAplicada.current = true;
    abrirNuevo();
  }, [vistaInicial, empresaId, sesion.estado, abrirNuevo]);

  const seleccionado = reportes.find(r => r.id === seleccionadoId) || null;
  const filtrados = useMemo(() => filtrarReportes(reportes, { estado: filtroEstado, mina: filtroMina, turno: filtroTurno, busqueda }), [reportes, filtroEstado, filtroMina, filtroTurno, busqueda]);
  const conteo = useMemo(() => contarPorEstado(reportes), [reportes]);
  const minas = useMemo(() => minasDeReportes(reportes), [reportes]);

  const abrirDetalle = reporte => {
    setSeleccionadoId(reporte.id); setObservacion(''); setErrorRevision(''); setAviso('');
    setVista('detalle');
    if (typeof window !== 'undefined') window.scrollTo?.(0, 0);
  };

  const editarReporte = async reporte => {
    setErrorForm(''); setNuevoBacklog(null);
    try { if (!contexto) await cargarContexto(); } catch { /* el formulario funciona con los datos del reporte */ }
    setForm(formDesdeReporte(reporte));
    setVista('form');
    if (typeof window !== 'undefined') window.scrollTo?.(0, 0);
  };

  const volverLista = () => { setVista('lista'); setForm(null); setErrorForm(''); };
  useCompactWorkMode(true, vista === 'lista' ? {} : { backLabel: 'Volver al listado', onBack: volverLista });

  // ---------- Formulario ----------
  const otForm = form && (contexto?.ots || []).find(ot => ot.id === form.ot_id);
  const reporteForm = form && reportes.find(r => r.id === form.id);
  const infoOT = otForm || (reporteForm ? {
    numero: reporteForm.ot_numero, mina_nombre: reporteForm.mina_nombre, proyecto_codigo: reporteForm.proyecto_codigo,
    proyecto_nombre: reporteForm.proyecto_nombre, equipo_codigo: reporteForm.equipo_codigo, equipo_nombre: reporteForm.equipo_nombre,
    equipo_marca: reporteForm.equipo_marca, equipo_modelo: reporteForm.equipo_modelo, equipo_serie: reporteForm.equipo_serie,
  } : null);
  const esNuevo = form && !reporteForm;
  const requiereTecnico = Boolean(esNuevo && !contexto?.tecnico);
  const editable = Boolean(form) && sesion.permiteEscritura !== false;

  const cambiar = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }));
  const cambiarHorometro = (contador, extremo, valor) => setForm(prev => ({
    ...prev, horometros: { ...prev.horometros, [contador]: { ...prev.horometros[contador], [extremo]: valor } },
  }));
  const cambiarHora = (campo, valor) => setForm(prev => ({ ...prev, horas: { ...prev.horas, [campo]: valor } }));
  const cambiarLinea = (lista, indice, cambios) => setForm(prev => ({ ...prev, [lista]: prev[lista].map((l, i) => (i === indice ? { ...l, ...cambios } : l)) }));
  const quitarLinea = (lista, indice) => setForm(prev => ({ ...prev, [lista]: prev[lista].filter((_, i) => i !== indice) }));
  const agregarMaterial = (lista, material) => setForm(prev => {
    if (prev[lista].some(l => l.material_id === material.material_id)) return prev;
    return { ...prev, [lista]: [...prev[lista], {
      material_id: material.material_id, codigo: material.codigo, descripcion: material.descripcion,
      unidad: material.unidad || 'und', cantidad: '1', costo_unitario: material.precio_unitario ?? 0, urgente: false,
    }] };
  });
  const elegirOT = otId => {
    const ot = (contexto?.ots || []).find(item => item.id === otId);
    setForm(prev => {
      const base = formNuevo({ ot, tecnico: contexto?.tecnico, fecha: prev.fecha });
      return { ...prev, ot_id: otId, horometros: base.horometros, avance_pct: base.avance_pct };
    });
  };
  const alternarTipo = tipo => setForm(prev => ({
    ...prev,
    tipos_mantenimiento: prev.tipos_mantenimiento.includes(tipo) ? prev.tipos_mantenimiento.filter(t => t !== tipo) : [...prev.tipos_mantenimiento, tipo],
  }));

  const subirFoto = async archivo => {
    if (!archivo || !form) return;
    setSubiendoFoto(true); setErrorForm('');
    try {
      const adjunto = await subirAdjunto({
        empresaId, entidadTipo: 'partes_diarios', entidadId: form.id, file: archivo,
        categoria: 'evidencia_reporte_mina', descripcion: 'Foto del reporte de mina', subidoPor: sesion.usuario?.id || null,
      });
      const foto = {
        id: adjunto.id, bucket: adjunto.bucket, storage_path: adjunto.storage_path, url: adjunto.url,
        nombre_original: adjunto.nombre_original, mime_type: adjunto.mime_type, tamano_bytes: adjunto.tamano_bytes,
      };
      setForm(prev => ({ ...prev, evidencias: [...(prev.evidencias || []), foto] }));
    } catch (fallo) { setErrorForm(mapearErrorReporte(fallo)); }
    finally { setSubiendoFoto(false); if (inputFoto.current) inputFoto.current.value = ''; }
  };

  const guardar = async enviar => {
    if (!form || guardando) return;
    const mensaje = validarReporte(form, { enviar, requiereTecnico });
    if (mensaje) { setErrorForm(mensaje); return; }
    setGuardando(enviar ? 'enviar' : 'borrador'); setErrorForm('');
    try {
      const resultado = await guardarReporteMina({ empresa_id: empresaId, reporte: armarPayload(form), enviar });
      setAviso(enviar
        ? `Reporte ${resultado?.numero || ''} enviado a revisión.${(form.pedido || []).length ? ' El pedido entró a la reserva de la OT.' : ''}`
        : `Borrador ${resultado?.numero || ''} guardado.`);
      await recargar();
      setForm(null); setVista('lista');
      if (typeof window !== 'undefined') window.scrollTo?.(0, 0);
    } catch (fallo) { setErrorForm(mapearErrorReporte(fallo)); }
    finally { setGuardando(''); }
  };

  // ---------- Revisión ----------
  const revisar = async accion => {
    if (!seleccionado || revisando) return;
    if (accion === 'observar' && !observacion.trim()) { setErrorRevision('Escribe la observación para el técnico.'); return; }
    setRevisando(accion); setErrorRevision('');
    try {
      await revisarReporteMina({ empresa_id: empresaId, parte_id: seleccionado.id, accion, observacion: observacion.trim() || null });
      setAviso(accion === 'aprobar' ? `Reporte ${seleccionado.numero} aprobado.` : `Reporte ${seleccionado.numero} observado. El técnico puede corregirlo y reenviarlo.`);
      await recargar();
      setVista('lista');
    } catch (fallo) { setErrorRevision(mapearErrorReporte(fallo)); }
    finally { setRevisando(''); }
  };

  if (sesion.cargando || sesion.estado === 'cargando') {
    return <section className="dx-ui dx-rmina"><WorkMenuButton /><div className="dx-ui-empty" role="status">Cargando sesión operativa…</div></section>;
  }
  if (!empresaId || ['sin_empresa', 'sin_sesion'].includes(sesion.estado)) {
    return <section className="dx-ui dx-rmina"><WorkMenuButton /><div className="dx-ui-empty">Selecciona o solicita acceso a una empresa para ver los reportes de mina.</div></section>;
  }

  return (
    <section className="dx-ui dx-rmina">
      {aviso && <div className="dx-rmina-toast" role="status" aria-live="polite">{aviso}</div>}
      {vista === 'lista' && renderLista()}
      {vista === 'form' && form && renderForm()}
      {vista === 'detalle' && seleccionado && renderDetalle()}
      {vista === 'detalle' && !seleccionado && <div className="dx-ui-empty">El reporte ya no está disponible. <button type="button" className="dx-btn" onClick={volverLista}>Volver al listado</button></div>}
    </section>
  );

  function renderLista() {
    return (
      <>
        <div className="dx-ui-head-page">
          <WorkMenuButton />
          <div>
            <div className="dx-ui-eyebrow">Taller &amp; Operaciones · Campo</div>
            <h1 className="dx-ui-title">Reportes de mina</h1>
            <p className="dx-ui-sub">Parte diario por turno de los equipos que trabajan en mina: horómetros, horas, mantenimiento y repuestos.</p>
          </div>
          <div className="dx-ui-actions">
            {permisos.crear && (
              <button type="button" className="dx-btn primary" onClick={abrirNuevo} disabled={sesion.permiteEscritura === false}
                title={sesion.permiteEscritura === false ? 'Selecciona una sociedad operativa para registrar reportes.' : undefined}>
                <Icono nombre="plus" />Nuevo reporte
              </button>
            )}
          </div>
        </div>
        {sesion.permiteEscritura === false && permisos.crear && <div className="dx-rmina-alert is-info">Estás en la vista consolidada: para registrar un reporte elige una sociedad operativa.</div>}
        <div className="dx-ui-summary">
          {FILTROS_ESTADO.map(f => (
            <button type="button" key={f.id || 'todos'} className={`dx-ui-chip dx-rmina-chip${filtroEstado === f.id ? ' is-on' : ''}`}
              aria-pressed={filtroEstado === f.id} onClick={() => setFiltroEstado(f.id)}>
              <b>{conteo[f.id] || 0}</b><span>{f.etiqueta}</span>
            </button>
          ))}
        </div>
        <div className="dx-ui-card dx-rmina-list">
          <div className="dx-ui-toolbar">
            <h2>Reportes del periodo</h2>
            <span className="dx-ui-count">{filtrados.length} {filtrados.length === 1 ? 'reporte' : 'reportes'}</span>
            <div className="dx-rmina-filters">
              <select className="dx-rmina-select" aria-label="Filtrar por mina" value={filtroMina} onChange={e => setFiltroMina(e.target.value)}>
                <option value="">Todas las minas</option>
                {minas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
              <select className="dx-rmina-select" aria-label="Filtrar por turno" value={filtroTurno} onChange={e => setFiltroTurno(e.target.value)}>
                <option value="">Día y noche</option><option value="dia">Día</option><option value="noche">Noche</option>
              </select>
            </div>
            <label className="dx-ui-search">
              <Icono nombre="search" />
              <input type="search" aria-label="Buscar reportes" placeholder="Buscar por N°, OT, equipo o técnico" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </label>
          </div>
          {cargando && <div className="dx-ui-empty" role="status">Cargando reportes…</div>}
          {!cargando && error && <div className="dx-ui-empty"><p className="dx-rmina-error">{error}</p><button type="button" className="dx-btn" onClick={recargar}>Reintentar</button></div>}
          {!cargando && !error && reportes.length === 0 && <div className="dx-ui-empty">Aún no hay reportes de mina.{permisos.crear ? ' Crea el primero con «Nuevo reporte».' : ''}</div>}
          {!cargando && !error && reportes.length > 0 && filtrados.length === 0 && <div className="dx-ui-empty">No hay reportes que coincidan con los filtros.</div>}
          {!cargando && !error && filtrados.length > 0 && (
            <>
              <div className="dx-ui-head"><span>Reporte</span><span>OT · equipo</span><span>Mina · proyecto</span><span>Horas · D.M.</span><span>Estado</span><span /></div>
              {filtrados.map(r => {
                const d = r.datos_mina || {};
                const enviado = r.estado !== 'borrador';
                return (
                  <div className="dx-ui-row" role="button" tabIndex={0} key={r.id} onClick={() => abrirDetalle(r)} onKeyDown={e => activarConTeclado(e, () => abrirDetalle(r))}
                    aria-label={`Abrir reporte ${r.numero || ''}`}>
                    <div className="dx-rmina-id"><span className="dx-ui-icon is-cyan"><Icono nombre="mine" /></span>
                      <div className="dx-rmina-cell"><b>{r.numero || 'Sin número'}</b><small>{fechaCorta(r.fecha)} · {etiquetaTurno(d.turno)}</small></div></div>
                    <div className="dx-rmina-cell dx-rmina-c-ot"><b>{r.ot_numero}</b><small>{textoEquipo(r)}</small></div>
                    <div className="dx-rmina-cell dx-rmina-c-tec"><b>{r.mina_nombre || '—'}</b><small>{[r.proyecto_codigo, r.tecnico_nombre].filter(Boolean).join(' · ')}</small></div>
                    <div className="dx-rmina-kpi dx-rmina-c-kpi">{enviado
                      ? <>{formatoNumero(d.horas?.trabajadas ?? 0)} h<small>D.M. {formatoNumero(d.disponibilidad_mecanica, 1)} %</small></>
                      : <small>Sin enviar</small>}</div>
                    <div className="dx-rmina-c-est"><PillEstado estado={r.estado} /></div>
                    <Icono nombre="arrow" className="dx-rmina-ic dx-ui-arrow" />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </>
    );
  }

  function renderForm() {
    const resumen = resumenHoras(form.horas);
    const okHorometros = horometrosValidos(form.horometros);
    const estadoEquipo = ESTADOS_EQUIPO.find(e => e.id === form.estado_equipo);
    const urgentes = (form.pedido || []).filter(p => p.urgente).length;
    const ultimoAvance = otForm?.ultimo_avance_validado;
    const titulo = form.numero ? `Reporte ${form.numero}` : 'Nuevo reporte de mina';
    const observacionPrevia = reporteForm?.estado === 'observado' ? reporteForm?.datos_mina?.revision?.observacion : null;
    return (
      <>
        <div className="dx-ui-head-page">
          <WorkMenuButton />
          <div>
            <div className="dx-ui-eyebrow">Reportes de mina · {form.numero ? 'Edición' : 'Nuevo'}</div>
            <h1 className="dx-ui-title">{titulo}</h1>
            <p className="dx-ui-sub">Llénalo al cierre del turno. Se guarda como borrador y se envía al supervisor para revisión.</p>
          </div>
          <div className="dx-ui-actions"><button type="button" className="dx-btn" onClick={volverLista}>Volver al listado</button></div>
        </div>
        {observacionPrevia && <div className="dx-rmina-alert is-warn"><b>Observación del supervisor:</b> {observacionPrevia}</div>}
        <div className="dx-rmina-grid">
          <div>
            <div className="dx-ui-card">
              <div className="dx-rmina-sec">
                <SeccionCabecera icono="mine" titulo="Orden y turno" ayuda="Solo se listan OT programadas o en ejecución con proyecto de mina." />
                <div className="dx-rmina-fields">
                  <div className="dx-rmina-field wide">
                    <label htmlFor="rm-ot">Orden de trabajo *</label>
                    <select id="rm-ot" value={form.ot_id} disabled={!esNuevo || !editable} onChange={e => elegirOT(e.target.value)}>
                      <option value="">{(contexto?.ots || []).length ? 'Selecciona la OT de mina' : 'No hay OT de mina disponibles'}</option>
                      {(esNuevo ? contexto?.ots || [] : []).map(ot => (
                        <option key={ot.id} value={ot.id}>{[ot.numero, ot.proyecto_nombre, [ot.equipo_marca, ot.equipo_modelo].filter(Boolean).join(' ') || ot.equipo_nombre].filter(Boolean).join(' · ')}</option>
                      ))}
                      {!esNuevo && infoOT && <option value={form.ot_id}>{infoOT.numero}</option>}
                    </select>
                    {infoOT && (
                      <div className="dx-rmina-ctx">
                        <span><b>{infoOT.mina_nombre}</b> · {[infoOT.proyecto_codigo, infoOT.proyecto_nombre].filter(Boolean).join(' ')}</span>
                        <span>· Equipo <b>{textoEquipo(infoOT)}</b>{infoOT.equipo_serie ? ` (serie ${infoOT.equipo_serie})` : ''}</span>
                      </div>
                    )}
                  </div>
                  <div className="dx-rmina-field"><label htmlFor="rm-fecha">Fecha *</label><input id="rm-fecha" type="date" value={form.fecha} disabled={!editable} onChange={e => cambiar('fecha', e.target.value)} /></div>
                  <div className="dx-rmina-field"><span className="dx-rmina-label" id="rm-turno-l">Turno *</span>
                    <div className="dx-rmina-seg" role="group" aria-labelledby="rm-turno-l">
                      {['dia', 'noche'].map(t => <button type="button" key={t} className={form.turno === t ? 'is-on' : ''} aria-pressed={form.turno === t} disabled={!editable} onClick={() => cambiar('turno', t)}>{etiquetaTurno(t)}</button>)}
                    </div></div>
                  <div className="dx-rmina-field"><label htmlFor="rm-tec">Técnico</label>
                    {requiereTecnico
                      ? <select id="rm-tec" value={form.tecnico_id} onChange={e => cambiar('tecnico_id', e.target.value)}>
                          <option value="">Selecciona el técnico</option>
                          {(contexto?.tecnicos || []).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                      : <input id="rm-tec" readOnly value={reporteForm?.tecnico_nombre || contexto?.tecnico?.nombre || ''} />}
                  </div>
                  <div className="dx-rmina-field"><label htmlFor="rm-sup">Supervisor del cliente</label><input id="rm-sup" placeholder="Nombre del supervisor en mina" value={form.supervisor_cliente} disabled={!editable} onChange={e => cambiar('supervisor_cliente', e.target.value)} /></div>
                </div>
              </div>

              <div className="dx-rmina-sec">
                <SeccionCabecera icono="gauge" titulo="Horómetros" ayuda="El inicial se trae del último reporte del equipo. El final actualiza el horómetro del activo al aprobarse." />
                <div className="dx-rmina-horo">
                  <span className="h">Contador</span><span className="h r">Inicial</span><span className="h r">Final</span><span className="h r">Diferencia</span>
                  {CONTADORES.map(c => {
                    const h = form.horometros[c.id] || {};
                    const dif = diferenciaHorometro(h.inicial, h.final);
                    return [
                      <span className="n" key={`${c.id}-n`}>{c.etiqueta}</span>,
                      <input key={`${c.id}-i`} inputMode="decimal" aria-label={`${c.etiqueta} inicial`} value={h.inicial} disabled={!editable} onChange={e => cambiarHorometro(c.id, 'inicial', e.target.value)} />,
                      <input key={`${c.id}-f`} inputMode="decimal" aria-label={`${c.etiqueta} final`} value={h.final} disabled={!editable} onChange={e => cambiarHorometro(c.id, 'final', e.target.value)} />,
                      <span key={`${c.id}-d`} className={`d${dif !== null && dif < 0 ? ' is-error' : ''}`}>{dif === null ? '—' : `${formatoNumero(dif)} h`}</span>,
                    ];
                  })}
                </div>
              </div>

              <div className="dx-rmina-sec">
                <SeccionCabecera icono="clock" titulo="Distribución del turno" ayuda={`Las horas deben sumar la duración del turno (${DURACION_TURNO} h).`}
                  extra={<span className={`dx-ui-pill ${resumen.cuadra ? 'is-green' : 'is-red'}`}><i />{formatoNumero(resumen.total)} / {DURACION_TURNO} h</span>} />
                <div className="dx-rmina-hours">
                  {CAMPOS_HORAS.map(campo => (
                    <div className="dx-rmina-field" key={campo.id}>
                      <label htmlFor={`rm-h-${campo.id}`}><span className={`dx-rmina-dot is-${campo.grupo}`} />{campo.etiqueta}</label>
                      <input id={`rm-h-${campo.id}`} inputMode="decimal" placeholder="0.00" value={form.horas[campo.id]} disabled={!editable} onChange={e => cambiarHora(campo.id, e.target.value)} />
                    </div>
                  ))}
                </div>
                <BarraHoras horas={form.horas} />
                <div className="dx-rmina-total">Total <b>{formatoNumero(resumen.total)} h</b> · Disponibilidad mecánica <b>{formatoNumero(resumen.dm, 1)} %</b> <span className="dx-rmina-hint">(turno − mantenimientos − correctivos) ÷ turno</span></div>
              </div>

              <div className="dx-rmina-sec">
                <SeccionCabecera icono="wrench" tono="is-violet" titulo="Mantenimiento y estado final" ayuda="Marca todos los tipos de trabajo del turno." />
                <div className="dx-rmina-opts dx-rmina-gap">
                  {TIPOS_MANTENIMIENTO.map(t => {
                    const on = form.tipos_mantenimiento.includes(t.id);
                    return <button type="button" key={t.id} className={`dx-rmina-opt${on ? ' is-on' : ''}`} aria-pressed={on} disabled={!editable} onClick={() => alternarTipo(t.id)}><span className="box">✓</span>{t.etiqueta}</button>;
                  })}
                </div>
                <span className="dx-rmina-label" id="rm-estado-l">Estado del equipo al cierre *</span>
                <div className="dx-rmina-opts" role="radiogroup" aria-labelledby="rm-estado-l">
                  {ESTADOS_EQUIPO.map(e => {
                    const on = form.estado_equipo === e.id;
                    return <button type="button" role="radio" aria-checked={on} key={e.id} className={`dx-rmina-opt st ${e.tono}${on ? ' is-on' : ''}`} disabled={!editable} onClick={() => cambiar('estado_equipo', e.id)}><span className="box" />{e.etiqueta}</button>;
                  })}
                </div>
                {form.estado_equipo === 'retorno' && (
                  <div className="dx-rmina-note"><b>Retorno a taller.</b> Se avisará al planner para coordinar el traslado mina ↔ taller. Indica el motivo:
                    <div className="dx-rmina-field"><textarea aria-label="Motivo del retorno a taller" placeholder="Falla, programación, falta de repuesto…" value={form.motivo_retorno} disabled={!editable} onChange={e => cambiar('motivo_retorno', e.target.value)} /></div>
                  </div>
                )}
              </div>

              <div className="dx-rmina-sec">
                <SeccionCabecera icono="pen" titulo="Trabajos realizados" ayuda="Usa el micrófono del teclado del celular para dictar." />
                <div className="dx-rmina-field"><textarea aria-label="Trabajos realizados" value={form.actividad} disabled={!editable} onChange={e => cambiar('actividad', e.target.value)} placeholder="Describe lo que se hizo en el turno" /></div>
                <div className="dx-rmina-field dx-rmina-gap-t"><label htmlFor="rm-avance">Avance de la OT al cierre del turno</label>
                  <div className="dx-rmina-range"><input id="rm-avance" type="range" min="0" max="100" step="5" value={form.avance_pct} disabled={!editable} onChange={e => cambiar('avance_pct', Number(e.target.value))} /><output htmlFor="rm-avance">{form.avance_pct} %</output></div>
                  {ultimoAvance && <span className="dx-rmina-hint">Último avance validado: {formatoNumero(ultimoAvance.avance_pct, 0)} % ({ultimoAvance.numero}).</span>}
                </div>
              </div>

              <div className="dx-rmina-sec">
                <SeccionCabecera icono="box" titulo="Repuestos y lubricantes utilizados" ayuda="Solo registra el consumo (no mueve stock), igual que el parte de taller." />
                <div className="dx-rmina-lines">
                  {form.repuestos.map((r, i) => (
                    <div className="dx-rmina-line" key={r.material_id}>
                      <div><b>{r.descripcion}</b><small>{r.codigo}</small></div>
                      <input inputMode="decimal" aria-label={`Cantidad de ${r.codigo}`} value={r.cantidad} disabled={!editable} onChange={e => cambiarLinea('repuestos', i, { cantidad: e.target.value })} />
                      <span className="u">{r.unidad}</span>
                      <button type="button" className="dx-rmina-x" aria-label={`Quitar ${r.codigo}`} disabled={!editable} onClick={() => quitarLinea('repuestos', i)}><Icono nombre="x" /></button>
                    </div>
                  ))}
                </div>
                {editable && <div className="dx-rmina-add"><BuscadorMaterial empresaId={empresaId} sociedadId={sociedadFiltro} etiqueta="Buscar repuesto utilizado" placeholder="Buscar material por código o descripción" onSelect={m => agregarMaterial('repuestos', m)} /></div>}
                <table className="dx-rmina-lub"><thead><tr><th>Lubricante</th><th>UM</th><th className="r">Cantidad</th></tr></thead><tbody>
                  {form.lubricantes.map((l, i) => (
                    <tr key={l.tipo}><td>{l.tipo}</td><td>{l.unidad}</td><td className="r"><input inputMode="decimal" aria-label={`Cantidad de ${l.tipo}`} placeholder="0" value={l.cantidad} disabled={!editable} onChange={e => cambiarLinea('lubricantes', i, { cantidad: e.target.value })} /></td></tr>
                  ))}
                </tbody></table>
              </div>

              <div className="dx-rmina-sec">
                <SeccionCabecera icono="cart" tono="is-violet" titulo="Pedido de repuestos" ayuda="Al enviar el reporte entra a la reserva de la OT: periférico de la mina → central → SOLPE." />
                <div className="dx-rmina-lines">
                  {form.pedido.map((p, i) => (
                    <div className="dx-rmina-line ped" key={p.material_id}>
                      <div><b>{p.descripcion}</b><small>{p.codigo}</small></div>
                      <input inputMode="decimal" aria-label={`Cantidad pedida de ${p.codigo}`} value={p.cantidad} disabled={!editable} onChange={e => cambiarLinea('pedido', i, { cantidad: e.target.value })} />
                      <span className="u">{p.unidad}</span>
                      <button type="button" className={`dx-rmina-urg${p.urgente ? ' is-on' : ''}`} aria-pressed={Boolean(p.urgente)} disabled={!editable} onClick={() => cambiarLinea('pedido', i, { urgente: !p.urgente })}>● Urgente</button>
                      <button type="button" className="dx-rmina-x" aria-label={`Quitar ${p.codigo} del pedido`} disabled={!editable} onClick={() => quitarLinea('pedido', i)}><Icono nombre="x" /></button>
                    </div>
                  ))}
                </div>
                {editable && <div className="dx-rmina-add"><BuscadorMaterial empresaId={empresaId} sociedadId={sociedadFiltro} etiqueta="Buscar material a pedir" placeholder="Agregar material al pedido" onSelect={m => agregarMaterial('pedido', m)} /></div>}
              </div>

              <div className="dx-rmina-sec">
                <SeccionCabecera icono="camera" titulo="Fotos, backlog y comentarios" ayuda="El backlog registra hallazgos o trabajos pendientes para futuras OT." />
                <div className="dx-rmina-photos">
                  {(form.evidencias || []).map(foto => (
                    <div className="dx-rmina-photo" key={foto.id || foto.storage_path}>
                      {foto.url ? <img src={foto.url} alt={foto.nombre_original || 'Foto del reporte'} /> : <span>{foto.nombre_original}</span>}
                      {editable && <button type="button" className="dx-rmina-photo-x" aria-label="Quitar foto" onClick={() => setForm(prev => ({ ...prev, evidencias: prev.evidencias.filter(f => f !== foto) }))}><Icono nombre="x" /></button>}
                    </div>
                  ))}
                  {editable && (
                    <label className="dx-rmina-photo is-add">
                      <input ref={inputFoto} type="file" accept="image/*" capture="environment" disabled={subiendoFoto} onChange={e => subirFoto(e.target.files?.[0])} />
                      <Icono nombre="plus" /><span>{subiendoFoto ? 'Subiendo…' : 'Tomar foto'}</span>
                    </label>
                  )}
                </div>
                <div className="dx-rmina-gap-t">
                  {(form.backlog || []).map((b, i) => {
                    const pr = PRIORIDADES_BACKLOG.find(p => p.id === b.prioridad) || PRIORIDADES_BACKLOG[1];
                    return (
                      <div className="dx-rmina-blog" key={`${b.descripcion}-${i}`}>
                        <span className={`dx-ui-pill ${pr.pill}`}><i />{pr.etiqueta}</span>
                        <div><b>{b.descripcion}</b>{b.detalle && <small>{b.detalle}</small>}</div>
                        {editable && <button type="button" className="dx-rmina-x" aria-label={`Quitar hallazgo ${b.descripcion}`} onClick={() => quitarLinea('backlog', i)}><Icono nombre="x" /></button>}
                      </div>
                    );
                  })}
                  {nuevoBacklog ? (
                    <div className="dx-rmina-blog-form">
                      <div className="dx-rmina-fields">
                        <div className="dx-rmina-field wide"><label htmlFor="rm-bl-d">Hallazgo *</label><input id="rm-bl-d" value={nuevoBacklog.descripcion} onChange={e => setNuevoBacklog(prev => ({ ...prev, descripcion: e.target.value }))} placeholder="Ej. Fuga leve en manguera de retorno" /></div>
                        <div className="dx-rmina-field"><label htmlFor="rm-bl-p">Prioridad</label><select id="rm-bl-p" value={nuevoBacklog.prioridad} onChange={e => setNuevoBacklog(prev => ({ ...prev, prioridad: e.target.value }))}>{PRIORIDADES_BACKLOG.map(p => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}</select></div>
                        <div className="dx-rmina-field wide"><label htmlFor="rm-bl-t">Detalle</label><input id="rm-bl-t" value={nuevoBacklog.detalle} onChange={e => setNuevoBacklog(prev => ({ ...prev, detalle: e.target.value }))} placeholder="Qué se recomienda hacer" /></div>
                      </div>
                      <div className="dx-rmina-row-btns">
                        <button type="button" className="dx-btn" onClick={() => setNuevoBacklog(null)}>Cancelar</button>
                        <button type="button" className="dx-btn primary" disabled={!nuevoBacklog.descripcion.trim()} onClick={() => { setForm(prev => ({ ...prev, backlog: [...prev.backlog, { ...nuevoBacklog, descripcion: nuevoBacklog.descripcion.trim() }] })); setNuevoBacklog(null); }}>Agregar hallazgo</button>
                      </div>
                    </div>
                  ) : editable && <button type="button" className="dx-btn" onClick={() => setNuevoBacklog({ descripcion: '', detalle: '', prioridad: 'media' })}><Icono nombre="plus" />Agregar al backlog</button>}
                </div>
                <div className="dx-rmina-field dx-rmina-gap-t"><label htmlFor="rm-com">Comentarios finales</label><textarea id="rm-com" placeholder="Observaciones para el supervisor" value={form.comentarios} disabled={!editable} onChange={e => cambiar('comentarios', e.target.value)} /></div>
              </div>
              {errorForm && <div className="dx-rmina-alert is-error dx-rmina-alert-in" role="alert">{errorForm}</div>}
              <div className="dx-rmina-foot">
                <button type="button" className="dx-btn" onClick={volverLista} disabled={Boolean(guardando)}>Cancelar</button>
                <button type="button" className="dx-btn" onClick={() => guardar(false)} disabled={Boolean(guardando) || !editable}>{guardando === 'borrador' ? 'Guardando…' : 'Guardar borrador'}</button>
                <button type="button" className="dx-btn primary" onClick={() => guardar(true)} disabled={Boolean(guardando) || !editable}>{guardando === 'enviar' ? 'Enviando…' : 'Enviar a revisión'}</button>
              </div>
            </div>
          </div>
          <aside className="dx-rmina-side"><div className="dx-ui-card"><div className="dx-rmina-sum">
            <h3>Resumen del turno</h3>
            <div className="dx-rmina-big"><div><b>{formatoNumero(resumen.grupos.ht)}</b><span>horas trabajadas</span></div><div><b>{formatoNumero(resumen.dm, 1)} %</b><span>disp. mecánica</span></div></div>
            <div className="dx-rmina-kv"><span>OT</span><b>{infoOT?.numero || '—'}</b></div>
            <div className="dx-rmina-kv"><span>Mina</span><b>{infoOT?.mina_nombre || '—'}</b></div>
            <div className="dx-rmina-kv"><span>Turno</span><b>{fechaCorta(form.fecha)} · {etiquetaTurno(form.turno)}</b></div>
            <div className="dx-rmina-kv"><span>Estado del equipo</span><b>{estadoEquipo?.etiqueta || '—'}</b></div>
            <div className="dx-rmina-kv"><span>Avance OT</span><b>{form.avance_pct} %</b></div>
            <div className="dx-rmina-kv"><span>Repuestos usados</span><b>{form.repuestos.length} {form.repuestos.length === 1 ? 'ítem' : 'ítems'}</b></div>
            <div className="dx-rmina-kv"><span>Pedido</span><b>{form.pedido.length} {form.pedido.length === 1 ? 'ítem' : 'ítems'}{urgentes ? ` · ${urgentes} urgente${urgentes > 1 ? 's' : ''}` : ''}</b></div>
            <ul className="dx-rmina-checks">
              <li className={okHorometros ? 'ok' : 'no'}>{okHorometros ? '✓' : '✕'} Horómetros finales ≥ iniciales</li>
              <li className={resumen.cuadra ? 'ok' : 'no'}>{resumen.cuadra ? '✓' : '✕'} Horas suman {DURACION_TURNO} h{resumen.cuadra ? '' : ` (hoy ${formatoNumero(resumen.total)})`}</li>
              <li className={form.estado_equipo ? 'ok' : 'no'}>{form.estado_equipo ? '✓' : '✕'} Estado del equipo indicado</li>
            </ul>
          </div></div></aside>
        </div>
      </>
    );
  }

  function renderDetalle() {
    const r = seleccionado;
    const d = r.datos_mina || {};
    const resumen = resumenHoras(d.horas || {});
    const estadoEquipo = ESTADOS_EQUIPO.find(e => e.id === d.estado_equipo);
    const repuestos = (r.materiales || []).filter(m => m.tipo === 'repuesto');
    const lubricantes = d.lubricantes || [];
    const pedido = d.pedido || [];
    const resultadoPedido = d.pedido_resultado?.lineas || [];
    const puedeRevisar = permisos.aprobar && r.estado === 'en_revision';
    const editablePropio = puedeEditar(r, permisos) && sesion.permiteEscritura !== false;
    const tipos = (d.tipos_mantenimiento || []).map(t => TIPOS_MANTENIMIENTO.find(x => x.id === t)?.etiqueta).filter(Boolean);
    const horometroMotor = d.horometros?.motor?.final;
    return (
      <>
        <div className="dx-ui-head-page">
          <WorkMenuButton />
          <div>
            <div className="dx-ui-eyebrow">Reportes de mina · {puedeRevisar ? 'Revisión' : 'Detalle'}</div>
            <h1 className="dx-ui-title">{r.numero || 'Reporte sin número'}</h1>
            <p className="dx-ui-sub">{r.tecnico_nombre || 'Técnico'} · {fechaLarga(r.fecha)} · Turno {etiquetaTurno(d.turno).toLowerCase()}</p>
          </div>
          <div className="dx-ui-actions">
            <span className="dx-rmina-pill-head"><PillEstado estado={r.estado} /></span>
            {editablePropio && <button type="button" className="dx-btn primary" onClick={() => editarReporte(r)}>{r.estado === 'observado' ? 'Corregir y reenviar' : 'Continuar borrador'}</button>}
            <button type="button" className="dx-btn" onClick={volverLista}>Volver</button>
          </div>
        </div>
        {r.estado === 'observado' && d.revision?.observacion && <div className="dx-rmina-alert is-warn"><b>Observación del supervisor:</b> {d.revision.observacion}</div>}
        <div className="dx-rmina-grid">
          <div className="dx-ui-card">
            <div className="dx-rmina-sec"><div className="dx-rmina-sec-h"><h3>Datos del turno</h3></div>
              <div className="dx-rmina-dl">
                <div><span>OT</span><b>{r.ot_numero}</b></div>
                <div><span>Mina · proyecto</span><b>{[r.mina_nombre, r.proyecto_codigo].filter(Boolean).join(' · ') || '—'}</b></div>
                <div><span>Equipo</span><b>{textoEquipo(r)}</b></div>
                <div><span>Fecha · turno</span><b>{fechaLarga(r.fecha)} · {etiquetaTurno(d.turno)}</b></div>
                <div><span>Supervisor cliente</span><b>{d.supervisor_cliente || '—'}</b></div>
                <div><span>Estado del equipo</span><b>{estadoEquipo ? <span className={`dx-ui-pill ${estadoEquipo.pill}`}><i />{estadoEquipo.etiqueta}</span> : '—'}</b></div>
              </div>
              {d.estado_equipo === 'retorno' && d.motivo_retorno && <div className="dx-rmina-note"><b>Motivo del retorno a taller:</b> {d.motivo_retorno}</div>}
            </div>
            <div className="dx-rmina-sec"><div className="dx-rmina-sec-h"><h3>Horómetros y horas</h3></div>
              <div className="dx-rmina-dl">
                {CONTADORES.map(c => {
                  const h = d.horometros?.[c.id] || {};
                  if (h.inicial === null && h.final === null) return null;
                  if (h.inicial === undefined && h.final === undefined) return null;
                  const dif = diferenciaHorometro(h.inicial, h.final);
                  return <div key={c.id}><span>{c.etiqueta}</span><b>{formatoNumero(h.inicial)} → {formatoNumero(h.final)}{dif !== null ? ` (${formatoNumero(dif)} h)` : ''}</b></div>;
                })}
              </div>
              <BarraHoras horas={d.horas || {}} />
              <div className="dx-rmina-total">
                {CAMPOS_HORAS.filter(c => Number(d.horas?.[c.id] || 0) > 0).map(c => <span key={c.id}>{c.etiqueta} <b>{formatoNumero(d.horas[c.id])} h</b></span>)}
                <span>D.M. <b>{formatoNumero(d.disponibilidad_mecanica ?? resumen.dm, 1)} %</b></span>
              </div>
            </div>
            <div className="dx-rmina-sec"><div className="dx-rmina-sec-h"><h3>Trabajos realizados</h3><span className="dx-rmina-tags">{tipos.map(t => <span key={t} className="dx-ui-pill is-violet"><i />{t}</span>)}</span></div>
              <p className="dx-rmina-text">{r.actividad || 'Sin descripción.'}</p>
              <div className="dx-rmina-total">Avance de la OT reportado <b>{formatoNumero(r.avance_pct, 0)} %</b></div>
            </div>
            <div className="dx-rmina-sec"><div className="dx-rmina-sec-h"><h3>Repuestos usados y pedido</h3></div>
              {repuestos.length === 0 && pedido.length === 0 && lubricantes.length === 0 && <p className="dx-rmina-hint">Sin repuestos ni pedido.</p>}
              <div className="dx-rmina-lines">
                {repuestos.map(m => (
                  <div className="dx-rmina-line is-ro" key={`u-${m.material_id}`}><div><b>{m.descripcion}</b><small>Usado · {m.item_id}</small></div><b className="r">{formatoNumero(m.cantidad)}</b><span className="u">{m.unidad}</span></div>
                ))}
                {lubricantes.map(l => (
                  <div className="dx-rmina-line is-ro" key={`l-${l.tipo}`}><div><b>{l.tipo}</b><small>Lubricante</small></div><b className="r">{formatoNumero(l.cantidad)}</b><span className="u">{l.unidad}</span></div>
                ))}
                {pedido.map(p => {
                  const res = resultadoPedido.find(x => x.material_id === p.material_id);
                  const textoRes = res ? (Number(res.faltante || 0) === 0 ? 'reservado' : `faltan ${formatoNumero(res.faltante)} · SOLPE ${res.solpe_codigo || 'en curso'}`) : null;
                  return (
                    <div className="dx-rmina-line is-ro" key={`p-${p.material_id}`}>
                      <div><b>{p.descripcion}</b><small>Pedido · {p.codigo}{p.urgente && <span className="dx-rmina-urg-txt"> · urgente</span>}{textoRes && ` · ${textoRes}`}</small></div>
                      <b className="r">{formatoNumero(p.cantidad)}</b><span className="u">{p.unidad}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {((r.evidencias || []).length > 0 || (d.backlog || []).length > 0 || d.comentarios) && (
              <div className="dx-rmina-sec"><div className="dx-rmina-sec-h"><h3>Fotos, backlog y comentarios</h3></div>
                {(r.evidencias || []).length > 0 && <div className="dx-rmina-photos">{r.evidencias.map(f => <a className="dx-rmina-photo" key={f.id || f.storage_path} href={f.url} target="_blank" rel="noreferrer">{f.url ? <img src={f.url} alt={f.nombre_original || 'Foto del reporte'} /> : <span>{f.nombre_original}</span>}</a>)}</div>}
                {(d.backlog || []).map((b, i) => {
                  const pr = PRIORIDADES_BACKLOG.find(p => p.id === b.prioridad) || PRIORIDADES_BACKLOG[1];
                  return <div className="dx-rmina-blog dx-rmina-gap-t" key={`${b.descripcion}-${i}`}><span className={`dx-ui-pill ${pr.pill}`}><i />{pr.etiqueta}</span><div><b>{b.descripcion}</b>{b.detalle && <small>{b.detalle}</small>}</div></div>;
                })}
                {d.comentarios && <p className="dx-rmina-text dx-rmina-gap-t">{d.comentarios}</p>}
              </div>
            )}
            {puedeRevisar && (
              <>
                <div className="dx-rmina-sec"><div className="dx-rmina-field"><label htmlFor="rm-obs">Observación del supervisor</label>
                  <textarea id="rm-obs" placeholder="Obligatoria si se observa el reporte" value={observacion} onChange={e => setObservacion(e.target.value)} /></div></div>
                {errorRevision && <div className="dx-rmina-alert is-error dx-rmina-alert-in" role="alert">{errorRevision}</div>}
                <div className="dx-rmina-foot">
                  <button type="button" className="dx-btn danger" disabled={Boolean(revisando)} onClick={() => revisar('observar')}>{revisando === 'observar' ? 'Enviando…' : 'Observar'}</button>
                  <button type="button" className="dx-btn primary" disabled={Boolean(revisando)} onClick={() => revisar('aprobar')}>{revisando === 'aprobar' ? 'Aprobando…' : 'Aprobar reporte'}</button>
                </div>
              </>
            )}
          </div>
          <aside className="dx-rmina-side"><div className="dx-ui-card"><div className="dx-rmina-sum">
            {r.estado === 'aprobado' ? (
              <><h3>Aprobado</h3><ul className="dx-rmina-checks">
                <li className="ok">✓ Horómetro del equipo actualizado{horometroMotor != null ? ` a ${formatoNumero(horometroMotor)}` : ''}</li>
                <li className="ok">✓ Avance de la OT considerado: {formatoNumero(r.avance_pct, 0)} %</li>
                {(d.backlog || []).length > 0 && <li className="ok">✓ Backlog: {d.backlog.length} hallazgo{d.backlog.length > 1 ? 's' : ''} registrado{d.backlog.length > 1 ? 's' : ''}</li>}
              </ul></>
            ) : (
              <><h3>Al aprobar</h3><ul className="dx-rmina-checks">
                {horometroMotor != null && <li className="ok">✓ Horómetro del equipo pasa a {formatoNumero(horometroMotor)}</li>}
                <li className="ok">✓ Avance de la OT: {formatoNumero(r.avance_pct, 0)} % (nunca retrocede)</li>
                {pedido.length > 0 && <li className="ok">✓ El pedido ya entró a la reserva de {r.ot_numero} al enviarse</li>}
                {(d.backlog || []).length > 0 && <li className="ok">✓ Backlog: {d.backlog.length} hallazgo{d.backlog.length > 1 ? 's' : ''} nuevo{d.backlog.length > 1 ? 's' : ''}</li>}
                <li>• Consumo de repuestos solo se registra</li>
              </ul></>
            )}
          </div></div></aside>
        </div>
      </>
    );
  }
}

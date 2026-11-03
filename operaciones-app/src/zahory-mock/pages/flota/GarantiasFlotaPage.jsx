import { useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import {
  actualizarReclamo, cambiarEstadoGarantia, cargarContratos, cargarEquiposDeContratos, cargarEquiposPropios, cargarEventos, cargarGarantias,
  cargarSugeridos, cargarTiposGarantia, descartarArchivo, formatoFecha, formatoMonto, guardarGarantia, guardarTipoGarantia, hoyLocal,
  normalizar, permisosPantalla, registrarReclamo, subirDocumento, urlsFirmadas,
} from '../../../services/flotaRentalService.js';
import { Campo, Dato, Dialogo, ErrorPie, LineaTiempo, MotivoForm, Pill, contar, enfocarPrimerError, filaTeclado } from './flotaUi.jsx';

const CATEGORIAS = { fabrica: 'Fábrica', componente: 'Componente', overhaul: 'Overhaul', extendida: 'Extendida', carta_fianza: 'Carta fianza', poliza: 'Póliza', otro: 'Otro' };
const ESTADO_G = { vigente: ['Vigente', 'green'], liberada: ['Liberada', 'gray'], ejecutada: ['Ejecutada', 'violet'], reemplazada: ['Renovada', 'gray'], anulada: ['Anulada', 'gray'] };
const ESTADO_R = { abierto: ['Abierto', 'amber'], en_analisis: ['En análisis', 'amber'], aprobado: ['Aprobado', 'green'], rechazado: ['Rechazado', 'red'], cerrado: ['Cerrado', 'gray'] };
const RECLAMO_ABIERTO = r => ['abierto', 'en_analisis', 'aprobado'].includes(r.estado);

const situacion = g => {
  if (g.estado !== 'vigente') return 'cerrada';
  if (g.fecha_fin < hoyLocal()) return 'vencida';
  const dias = (new Date(`${g.fecha_fin}T12:00:00`) - new Date(`${hoyLocal()}T12:00:00`)) / 86400000;
  return dias <= (g.tipo?.dias_alerta ?? 60) ? 'por_vencer' : 'vigente';
};
const TABS = [['todas', 'Todas'], ['vigentes', 'Vigentes'], ['reclamo', 'Con reclamo'], ['por_vencer', 'Por vencer'], ['cerradas', 'Cerradas']];
const enTab = (g, tab) => tab === 'todas'
  || (tab === 'vigentes' && g.estado === 'vigente')
  || (tab === 'reclamo' && g.reclamos.some(RECLAMO_ABIERTO))
  || (tab === 'por_vencer' && ['por_vencer', 'vencida'].includes(situacion(g)))
  || (tab === 'cerradas' && g.estado !== 'vigente');

export function GarantiasFlotaPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const [permisos, setPermisos] = useState(null);
  const [garantias, setGarantias] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [tab, setTab] = useState('todas');
  const [q, setQ] = useState('');
  const [fecha, setFecha] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const [catalogo, setCatalogo] = useState(false);

  const recargar = async () => {
    setCargando(true); setError('');
    try {
      const [gs, ts, eq, cs, asg] = await Promise.all([cargarGarantias(empresaId), cargarTiposGarantia(empresaId), cargarEquiposPropios(empresaId), cargarContratos(empresaId), cargarEquiposDeContratos(empresaId)]);
      setGarantias(gs); setTipos(ts); setEquipos(eq); setContratos(cs); setAsignaciones(asg);
      setDetalle(actual => actual ? gs.find(g => g.id === actual.id) || null : null);
    } catch (e) { setError(e.message || 'No se pudieron cargar las garantías.'); } finally { setCargando(false); }
  };

  useEffect(() => {
    if (!empresaId) return;
    permisosPantalla(empresaId, 'garantias_flota').then(setPermisos);
    recargar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const visibles = useMemo(() => garantias.filter(g => enTab(g, tab)
    && (!fecha || g.fecha_inicio === fecha || g.fecha_fin === fecha)
    && normalizar([g.activo?.codigo, g.activo?.nombre, g.componente, g.tipo?.nombre, CATEGORIAS[g.tipo?.categoria], g.numero, g.emisor, g.beneficiario,
      g.contrato?.numero, g.responsable, ESTADO_G[g.estado]?.[0], formatoFecha(g.fecha_inicio), formatoFecha(g.fecha_fin), ...g.reclamos.map(r => r.codigo)].join(' ')).includes(normalizar(q))
  ), [garantias, tab, fecha, q]);

  const vigentes = garantias.filter(g => g.estado === 'vigente').length;
  const reclamosAbiertos = garantias.reduce((n, g) => n + g.reclamos.filter(RECLAMO_ABIERTO).length, 0);
  const porVencer = garantias.filter(g => ['por_vencer', 'vencida'].includes(situacion(g))).length;

  if (!permisos) return <section className="dx-ui dx-flotab dx-garantias"><div className="dx-ui-empty">Cargando permisos…</div></section>;
  if (!permisos.ver) return <section className="dx-ui dx-flotab dx-garantias"><div className="dx-ui-empty">No tienes permiso para ver Gestión de Garantías.</div></section>;

  const terminar = async mensaje => { setFormulario(null); setAviso(mensaje); await recargar(); };

  return (
    <section className="dx-ui dx-flotab dx-garantias">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Cobertura · reclamos y vigencias</div>
          <h1 className="dx-ui-title">Gestión de Garantías</h1>
          <p className="dx-ui-sub">Garantías por equipo, contrato y componente con responsables de reclamo.</p>
        </div>
        <div className="dx-ui-actions">
          <button className="dx-btn" onClick={() => setCatalogo(true)}>Catálogo de tipos</button>
          {permisos.crear && <button className="dx-btn primary" onClick={() => setFormulario({ modo: 'nuevo' })} disabled={!tipos.some(t => t.activo)}
            title={tipos.some(t => t.activo) ? '' : 'Configura primero el catálogo de tipos'}>Registrar garantía</button>}
        </div>
      </header>
      <div className="dx-ui-summary">
        <div className="dx-ui-chip"><b>{vigentes}</b><span>{vigentes === 1 ? 'garantía vigente' : 'garantías vigentes'}</span></div>
        <div className="dx-ui-chip"><b>{reclamosAbiertos}</b><span>{reclamosAbiertos === 1 ? 'reclamo abierto' : 'reclamos abiertos'}</span></div>
        <div className="dx-ui-chip"><b>{porVencer}</b><span>por vencer o vencidas</span></div>
      </div>
      {aviso && <p role="status" className="dx-ui-notice">{aviso}</p>}
      {error && <p role="alert" className="dx-ui-error">{error}</p>}
      {!cargando && !tipos.length && <p className="dx-ui-notice" role="status">La empresa aún no tiene tipos de garantía. Configúralos en «Catálogo de tipos».</p>}
      <div className="dx-ui-tabs" role="group" aria-label="Estado de garantías">
        {TABS.map(([v, l]) => <button key={v} type="button" className={`dx-ui-tab${tab === v ? ' on' : ''}`} aria-pressed={tab === v} onClick={() => setTab(v)}>{l} · {garantias.filter(g => enTab(g, v)).length}</button>)}
      </div>
      <div className="dx-ui-card">
        {garantias.length >= 2000 && <p className="dx-ui-notice" role="status">Se alcanzó el límite de 2000 garantías; los resultados pueden estar incompletos.</p>}
        <div className="dx-ui-toolbar">
          <h2>Garantías por activo</h2>
          <span className="dx-ui-count">{contar(visibles.length, 'garantía', 'garantías')}</span>
          <label className="dx-ui-search" aria-label="Buscar garantías"><span aria-hidden="true">⌕</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en los campos visibles…" /></label>
          <label className="dx-ui-filter-date">Fecha exacta<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        </div>
        <div className="dx-ui-head dx-garantias-cols" aria-hidden="true"><span>Equipo / cobertura</span><span>Contrato</span><span>Vigencia</span><span>Emisor</span><span>Reclamo / estado</span><span /></div>
        {cargando ? <div className="dx-ui-empty">Cargando garantías…</div>
          : !garantias.length ? <div className="dx-ui-empty">Aún no hay garantías registradas.</div>
          : !visibles.length ? <div className="dx-ui-empty">No hay garantías que coincidan con los filtros.</div>
          : visibles.map(g => {
            const abierto = g.reclamos.find(RECLAMO_ABIERTO);
            const sit = situacion(g);
            return (
              <div key={g.id} className="dx-ui-row dx-garantias-cols" aria-label={`Abrir garantía ${g.numero || g.tipo?.nombre}`} {...filaTeclado(() => setDetalle(g))}>
                <span className="dx-flotab-main"><b>{g.activo ? g.activo.codigo : 'Contrato'} · {g.componente || g.tipo?.nombre}</b><small>{CATEGORIAS[g.tipo?.categoria]}{g.numero ? ` · ${g.numero}` : ''}{g.monto != null ? ` · ${formatoMonto(g.monto, g.moneda)}` : ''}</small></span>
                <span>{g.contrato?.numero || 'Sin dato'}</span>
                <span>{formatoFecha(g.fecha_inicio)} — {formatoFecha(g.fecha_fin)}</span>
                <span>{g.emisor || 'Sin dato'}</span>
                <span className="dx-flotab-pills">
                  {abierto ? <Pill tono={ESTADO_R[abierto.estado][1]}>{abierto.codigo} · {ESTADO_R[abierto.estado][0]}</Pill>
                    : g.estado !== 'vigente' ? <Pill tono={ESTADO_G[g.estado][1]}>{ESTADO_G[g.estado][0]}</Pill>
                    : sit === 'vencida' ? <Pill tono="red">Vencida</Pill> : sit === 'por_vencer' ? <Pill tono="amber">Por vencer</Pill> : <Pill tono="green">Vigente</Pill>}
                </span>
                <span className="dx-ui-arrow" aria-hidden="true">›</span>
              </div>
            );
          })}
      </div>
      {detalle && <DetalleGarantia empresaId={empresaId} garantia={detalle} permisos={permisos} onCerrar={() => setDetalle(null)} onCambio={recargar}
        onEditar={() => setFormulario({ modo: 'editar', garantia: detalle })} onRenovar={() => setFormulario({ modo: 'renovar', garantia: detalle })} />}
      {formulario && <FormGarantia empresaId={empresaId} inicial={formulario} tipos={tipos} equipos={equipos} contratos={contratos} asignaciones={asignaciones}
        onCerrar={() => setFormulario(null)} onTerminar={terminar} />}
      {catalogo && <CatalogoGarantias empresaId={empresaId} tipos={tipos} puedeEditar={permisos.editar} onCerrar={() => setCatalogo(false)} onCambio={recargar} />}
    </section>
  );
}

function DetalleGarantia({ empresaId, garantia: g, permisos, onCerrar, onCambio, onEditar, onRenovar }) {
  const [url, setUrl] = useState(null);
  const [eventos, setEventos] = useState(null);
  const [accion, setAccion] = useState(null);
  const [nuevoReclamo, setNuevoReclamo] = useState(false);
  useEffect(() => {
    urlsFirmadas([g.storage_path]).then(m => setUrl(m.get(g.storage_path) || null)).catch(() => {});
    cargarEventos(empresaId, 'garantia', g.id).then(setEventos).catch(() => setEventos([]));
  }, [empresaId, g.id, g.storage_path, g.reclamos.length, g.estado]);
  const vigente = g.estado === 'vigente';
  const ACC = { liberada: ['Motivo de la liberación', 'Liberar garantía'], ejecutada: ['Motivo de la ejecución', 'Ejecutar garantía'], anulada: ['Motivo de anulación', 'Anular garantía'] };
  return (
    <Dialogo ancho titulo={`${g.tipo?.nombre || 'Garantía'}${g.numero ? ` · ${g.numero}` : ''}`} subtitulo={`${g.activo ? `${g.activo.codigo} · ${g.activo.nombre}` : 'Garantía de contrato'} · ${ESTADO_G[g.estado][0]}`} onCerrar={onCerrar}
      pie={<>
        {vigente && permisos.anular && !accion && <button className="dx-btn danger" onClick={() => setAccion('anulada')}>Anular</button>}
        {vigente && permisos.editar && !accion && <><button className="dx-btn" onClick={() => setAccion('liberada')}>Liberar</button><button className="dx-btn" onClick={() => setAccion('ejecutada')}>Ejecutar</button><button className="dx-btn" onClick={onEditar}>Editar</button></>}
        <button className="dx-btn" onClick={onCerrar}>Cerrar</button>
        {vigente && permisos.crear && <button className="dx-btn primary" onClick={onRenovar}>Renovar</button>}
      </>}>
      <div className="dx-ui-detail-grid">
        <Dato etiqueta="Categoría" valor={CATEGORIAS[g.tipo?.categoria]} />
        <Dato etiqueta="Componente" valor={g.componente} />
        <Dato etiqueta="Contrato" valor={g.contrato?.numero} />
        <Dato etiqueta="Vigencia" valor={`${formatoFecha(g.fecha_inicio)} — ${formatoFecha(g.fecha_fin)}`} />
        <Dato etiqueta="Emisor" valor={g.emisor} />
        <Dato etiqueta="Beneficiario" valor={g.beneficiario} />
        <Dato etiqueta="Monto" valor={g.monto != null ? formatoMonto(g.monto, g.moneda) : ''} />
        <Dato etiqueta="Responsable" valor={g.responsable} />
      </div>
      {g.motivo_estado && !vigente && <p className="dx-ui-notice">{ESTADO_G[g.estado][0]}: {g.motivo_estado}</p>}
      {accion && <MotivoForm etiqueta={ACC[accion][0]} boton={ACC[accion][1]} peligro={accion === 'anulada'} onCancelar={() => setAccion(null)}
        onConfirmar={async motivo => { await cambiarEstadoGarantia(g.id, accion, motivo); setAccion(null); await onCambio(); }} />}
      <div className="dx-flotab-sections">
        <div>
          <h3>Reclamos</h3>
          {!g.reclamos.length && <p className="dx-flotab-muted">Sin reclamos registrados.</p>}
          {g.reclamos.map(r => <Reclamo key={r.id} reclamo={r} puedeEditar={permisos.editar} onCambio={onCambio} />)}
          {vigente && permisos.crear && (nuevoReclamo
            ? <NuevoReclamo garantiaId={g.id} onCancelar={() => setNuevoReclamo(false)} onGuardado={async () => { setNuevoReclamo(false); await onCambio(); }} />
            : <button className="dx-btn dx-flotab-mt" onClick={() => setNuevoReclamo(true)}>Registrar reclamo</button>)}
        </div>
        <div>
          <h3>Documento</h3>
          {g.storage_path ? (url ? <a className="dx-btn" href={url} target="_blank" rel="noreferrer">Ver documento adjunto</a> : <p className="dx-flotab-muted">Adjunto registrado</p>) : <p className="dx-flotab-muted">Sin documento adjunto.</p>}
          {g.notas && <><h3>Notas</h3><p>{g.notas}</p></>}
          <h3>Trazabilidad</h3>
          {eventos ? <LineaTiempo eventos={eventos} /> : <p className="dx-flotab-muted">Cargando…</p>}
        </div>
      </div>
    </Dialogo>
  );
}

function Reclamo({ reclamo: r, puedeEditar, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [estado, setEstado] = useState(r.estado);
  const [resolucion, setResolucion] = useState(r.resolucion || '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardar = async evento => {
    evento.preventDefault();
    if (['aprobado', 'rechazado', 'cerrado'].includes(estado) && !resolucion.trim()) { setError('La resolución es obligatoria para este estado.'); return; }
    setGuardando(true); setError('');
    try { await actualizarReclamo(r.id, estado, resolucion.trim()); setEditando(false); await onCambio(); }
    catch (e) { setError(e.message || 'No se pudo actualizar el reclamo.'); } finally { setGuardando(false); }
  };
  return (
    <article className="dx-ui-detail-card dx-flotab-claim">
      <header><b>{r.codigo} · {formatoFecha(r.fecha)}</b><Pill tono={ESTADO_R[r.estado][1]}>{ESTADO_R[r.estado][0]}</Pill></header>
      <p>{r.descripcion}</p>
      <small className="dx-flotab-muted">{r.responsable ? `Responsable: ${r.responsable}` : 'Sin responsable'}{r.monto_reclamado != null ? ` · Reclamado: ${formatoMonto(r.monto_reclamado)}` : ''}{r.resolucion ? ` · ${r.resolucion}` : ''}</small>
      {puedeEditar && r.estado !== 'cerrado' && (!editando ? <div><button className="dx-btn" onClick={() => setEditando(true)}>Actualizar estado</button></div> : (
        <form className="dx-flotab-form dx-flotab-form-2" onSubmit={guardar} noValidate>
          <Campo etiqueta="Estado" requerido>
            <select className="dx-ui-select" value={estado} onChange={e => { setEstado(e.target.value); setError(''); }}>
              {Object.entries(ESTADO_R).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Resolución" requerido={['aprobado', 'rechazado', 'cerrado'].includes(estado)} error={error}>
            <input data-campo="resolucion" value={resolucion} onChange={e => { setResolucion(e.target.value); setError(''); }} />
          </Campo>
          <div className="dx-flotab-span dx-flotab-inline-actions">
            <button type="button" className="dx-btn" onClick={() => setEditando(false)}>Cancelar</button>
            <button className="dx-btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      ))}
    </article>
  );
}

function NuevoReclamo({ garantiaId, onCancelar, onGuardado }) {
  const contenedor = useRef(null);
  const [form, setForm] = useState({ fecha: hoyLocal(), descripcion: '', responsable: '', monto_reclamado: '' });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrores(e => ({ ...e, [k]: '' })); };
  const guardar = async evento => {
    evento.preventDefault();
    const e = {};
    if (!form.descripcion.trim()) e.descripcion = 'Describe la falla o el motivo del reclamo.';
    if (!form.fecha) e.fecha = 'Indica la fecha.';
    if (form.monto_reclamado !== '' && Number(form.monto_reclamado) < 0) e.monto_reclamado = 'El monto no puede ser negativo.';
    setErrores(e);
    if (!enfocarPrimerError(contenedor.current, e)) return;
    setGuardando(true); setErrorServidor('');
    try { await registrarReclamo(garantiaId, { ...form, monto_reclamado: form.monto_reclamado === '' ? null : Number(form.monto_reclamado) }); await onGuardado(); }
    catch (err) { setErrorServidor(err.message || 'No se pudo registrar el reclamo.'); } finally { setGuardando(false); }
  };
  return (
    <form ref={contenedor} className="dx-flotab-form dx-flotab-form-2 dx-flotab-mt" onSubmit={guardar} noValidate>
      <Campo etiqueta="Fecha" requerido error={errores.fecha}><input data-campo="fecha" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} /></Campo>
      <Campo etiqueta="Responsable"><input value={form.responsable} onChange={e => set('responsable', e.target.value)} /></Campo>
      <Campo etiqueta="Descripción" requerido ancho error={errores.descripcion}><textarea data-campo="descripcion" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} /></Campo>
      <Campo etiqueta="Monto reclamado" error={errores.monto_reclamado}><input data-campo="monto_reclamado" type="number" min="0" step="0.01" value={form.monto_reclamado} onChange={e => set('monto_reclamado', e.target.value)} /></Campo>
      <div className="dx-flotab-span dx-flotab-inline-actions">
        <ErrorPie mensaje={errorServidor} />
        <button type="button" className="dx-btn" onClick={onCancelar}>Cancelar</button>
        <button className="dx-btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar reclamo'}</button>
      </div>
    </form>
  );
}

function FormGarantia({ empresaId, inicial, tipos, equipos, contratos, asignaciones, onCerrar, onTerminar }) {
  const base = inicial.garantia || {};
  const editar = inicial.modo === 'editar';
  const renovar = inicial.modo === 'renovar';
  const contenedor = useRef(null);
  const [form, setForm] = useState({
    tipo_id: base.tipo_id || '', activo_id: base.activo_id || '', contrato_alquiler_id: base.contrato_alquiler_id || '',
    componente: base.componente || '', numero: renovar ? '' : base.numero || '', emisor: base.emisor || '', beneficiario: base.beneficiario || '',
    monto: base.monto ?? '', moneda: base.moneda || '', fecha_inicio: renovar ? base.fecha_fin || '' : base.fecha_inicio || '',
    fecha_fin: renovar ? '' : base.fecha_fin || '', responsable: base.responsable || '', notas: renovar ? '' : base.notas || '',
  });
  const [archivo, setArchivo] = useState(null);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const tipo = tipos.find(t => t.id === form.tipo_id);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrores(e => ({ ...e, [k]: '', objeto: '' })); setErrorServidor(''); };
  const contratosDelEquipo = form.activo_id ? contratos.filter(c => asignaciones.some(a => a.equipo_id === form.activo_id && a.contrato.id === c.id)) : contratos;
  const monedas = [...new Set(['PEN', 'USD', ...contratos.map(c => c.moneda).filter(Boolean)])];

  const guardar = async evento => {
    evento.preventDefault();
    const e = {};
    if (!form.tipo_id) e.tipo_id = 'Elige el tipo de garantía.';
    if (!form.activo_id && !form.contrato_alquiler_id) e.objeto = 'Indica el equipo, el contrato o ambos.';
    if (!form.fecha_inicio) e.fecha_inicio = 'Indica el inicio de la cobertura.';
    if (!form.fecha_fin) e.fecha_fin = 'Indica el fin de la cobertura.';
    if (form.fecha_inicio && form.fecha_fin && form.fecha_fin < form.fecha_inicio) e.fecha_fin = 'El fin no puede ser anterior al inicio.';
    if (tipo?.requiere_monto && form.monto === '') e.monto = 'Este tipo exige el monto.';
    if (form.monto !== '' && Number(form.monto) < 0) e.monto = 'El monto no puede ser negativo.';
    if ((form.monto !== '' || tipo?.requiere_monto) && !form.moneda) e.moneda = 'Indica la moneda.';
    setErrores(e);
    if (!enfocarPrimerError(contenedor.current, { ...e, ...(e.objeto ? { activo_id: e.objeto } : {}) })) return;
    setGuardando(true); setErrorServidor('');
    let ruta = null;
    try {
      if (archivo) ruta = await subirDocumento({ empresaId, carpeta: 'garantias', archivo });
      const payload = {
        ...form,
        monto: form.monto === '' ? null : Math.round(Number(form.monto) * 100) / 100,
        moneda: form.monto === '' ? null : form.moneda,
        ...(editar ? { id: base.id } : {}),
        ...(renovar ? { reemplaza_id: base.id } : {}),
        ...(ruta ? { storage_path: ruta } : editar ? {} : { storage_path: null }),
      };
      await guardarGarantia(empresaId, payload);
      await onTerminar(editar ? 'Garantía actualizada.' : renovar ? 'Garantía renovada; la anterior queda como renovada en el historial.' : 'Garantía registrada.');
    } catch (err) {
      if (ruta) await descartarArchivo(ruta);
      setErrorServidor(err.message || 'No se pudo guardar la garantía.');
    } finally { setGuardando(false); }
  };

  return (
    <Dialogo ancho cerrarFuera={false} titulo={editar ? 'Editar garantía' : renovar ? 'Renovar garantía' : 'Registrar garantía'} onCerrar={onCerrar}
      pie={<><ErrorPie mensaje={errorServidor} /><button type="button" className="dx-btn" onClick={onCerrar}>Cancelar</button><button type="submit" form="form-garantia" className="dx-btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button></>}>
      <form id="form-garantia" ref={contenedor} className="dx-flotab-form" onSubmit={guardar} noValidate>
        <Campo etiqueta="Tipo de garantía" requerido error={errores.tipo_id}>
          <select data-campo="tipo_id" className="dx-ui-select" value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)}>
            <option value="">Seleccionar…</option>{tipos.filter(t => t.activo || t.id === form.tipo_id).map(t => <option key={t.id} value={t.id}>{normalizar(t.nombre) === normalizar(CATEGORIAS[t.categoria]) ? t.nombre : `${t.nombre} · ${CATEGORIAS[t.categoria]}`}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Equipo" error={errores.objeto} ayuda="Indica el equipo, el contrato o ambos.">
          <select data-campo="activo_id" className="dx-ui-select" value={form.activo_id} onChange={e => { set('activo_id', e.target.value); if (e.target.value && form.contrato_alquiler_id && !asignaciones.some(a => a.equipo_id === e.target.value && a.contrato.id === form.contrato_alquiler_id)) set('contrato_alquiler_id', ''); }}>
            <option value="">Sin equipo (garantía del contrato)</option>{equipos.map(eq => <option key={eq.id} value={eq.id}>{eq.codigo} · {eq.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Contrato">
          <select className="dx-ui-select" value={form.contrato_alquiler_id} onChange={e => set('contrato_alquiler_id', e.target.value)}>
            <option value="">Sin contrato</option>{contratosDelEquipo.map(c => <option key={c.id} value={c.id}>{c.numero} · {c.estado}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Componente o cobertura"><input value={form.componente} onChange={e => set('componente', e.target.value)} placeholder="p. ej. bomba hidráulica" /></Campo>
        <Campo etiqueta="Número"><input value={form.numero} onChange={e => set('numero', e.target.value)} /></Campo>
        <Campo etiqueta={tipo?.categoria === 'carta_fianza' ? 'Banco emisor' : tipo?.categoria === 'poliza' ? 'Aseguradora' : 'Proveedor / emisor'}><input value={form.emisor} onChange={e => set('emisor', e.target.value)} /></Campo>
        <Campo etiqueta="Beneficiario"><input value={form.beneficiario} onChange={e => set('beneficiario', e.target.value)} /></Campo>
        <Campo etiqueta="Monto" requerido={Boolean(tipo?.requiere_monto)} error={errores.monto}>
          <input data-campo="monto" type="number" min="0" step="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} />
        </Campo>
        <Campo etiqueta="Moneda" requerido={Boolean(tipo?.requiere_monto) || form.monto !== ''} error={errores.moneda}>
          <select data-campo="moneda" className="dx-ui-select" value={form.moneda} onChange={e => set('moneda', e.target.value)}>
            <option value="">Seleccionar…</option>{monedas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Inicio de cobertura" requerido error={errores.fecha_inicio}><input data-campo="fecha_inicio" type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} /></Campo>
        <Campo etiqueta="Fin de cobertura" requerido error={errores.fecha_fin}><input data-campo="fecha_fin" type="date" value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} /></Campo>
        <Campo etiqueta="Responsable de reclamos"><input value={form.responsable} onChange={e => set('responsable', e.target.value)} /></Campo>
        <Campo etiqueta="Documento adjunto" ayuda={editar && base.storage_path ? 'Ya tiene adjunto; sube otro solo para reemplazarlo.' : 'PDF o imagen, hasta 10 MB.'}>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setArchivo(e.target.files?.[0] || null)} />
        </Campo>
        <Campo etiqueta="Notas" ancho><textarea value={form.notas} onChange={e => set('notas', e.target.value)} /></Campo>
      </form>
    </Dialogo>
  );
}

function CatalogoGarantias({ empresaId, tipos, puedeEditar, onCerrar, onCambio }) {
  const [edicion, setEdicion] = useState(null);
  const [error, setError] = useState('');
  const ejecutar = async fn => { setError(''); try { await fn(); await onCambio(); } catch (e) { setError(e.message || 'No se pudo guardar.'); } };
  return (
    <Dialogo ancho titulo="Catálogo de garantías" subtitulo="Cada tipo se asocia a un equipo, contrato, emisor y periodo de cobertura." onCerrar={onCerrar}
      pie={<><ErrorPie mensaje={error} /><button className="dx-btn" onClick={onCerrar}>Cerrar</button>{puedeEditar && !edicion && <button className="dx-btn primary" onClick={() => setEdicion({})}>Nuevo tipo</button>}</>}>
      {!tipos.length && <div className="dx-ui-empty">La empresa no tiene tipos configurados.{puedeEditar && <><br /><button className="dx-btn primary dx-flotab-mt" onClick={() => ejecutar(() => cargarSugeridos(empresaId, 'garantias'))}>Cargar tipos sugeridos</button></>}</div>}
      {edicion ? <TipoGarantiaForm empresaId={empresaId} tipo={edicion} onCancelar={() => setEdicion(null)} onGuardado={async () => { setEdicion(null); await onCambio(); }} /> : (
        <ul className="dx-flotab-catalog">{tipos.map(t => (
          <li key={t.id} className={t.activo ? '' : 'is-off'}>
            <div><b>{t.nombre}</b><small>{CATEGORIAS[t.categoria]} · {t.requiere_monto ? 'exige monto' : 'monto opcional'} · alerta {contar(t.dias_alerta, 'día', 'días')} antes · versión {t.version}{t.activo ? '' : ' · inactivo'}</small></div>
            {puedeEditar && <button className="dx-btn" onClick={() => setEdicion(t)}>Editar</button>}
          </li>
        ))}</ul>
      )}
    </Dialogo>
  );
}

function TipoGarantiaForm({ empresaId, tipo, onCancelar, onGuardado }) {
  const contenedor = useRef(null);
  const [form, setForm] = useState({ nombre: tipo.nombre || '', categoria: tipo.categoria || '', descripcion: tipo.descripcion || '', requiere_monto: Boolean(tipo.requiere_monto), dias_alerta: tipo.dias_alerta ?? 60, activo: tipo.activo ?? true });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrores(e => ({ ...e, [k]: '' })); setErrorServidor(''); };
  const guardar = async evento => {
    evento.preventDefault();
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'Indica el nombre del tipo.';
    if (!form.categoria) e.categoria = 'Elige la categoría.';
    if (form.dias_alerta === '' || Number(form.dias_alerta) < 0 || Number(form.dias_alerta) > 365) e.dias_alerta = 'Entre 0 y 365 días.';
    setErrores(e);
    if (!enfocarPrimerError(contenedor.current, e)) return;
    setGuardando(true);
    try { await guardarTipoGarantia(empresaId, { ...(tipo.id ? { id: tipo.id } : {}), ...form, dias_alerta: Number(form.dias_alerta) }); await onGuardado(); }
    catch (err) { setErrorServidor(err.message || 'No se pudo guardar el tipo.'); } finally { setGuardando(false); }
  };
  return (
    <form ref={contenedor} className="dx-flotab-form dx-flotab-form-2" onSubmit={guardar} noValidate>
      <Campo etiqueta="Nombre" requerido error={errores.nombre}><input data-campo="nombre" value={form.nombre} onChange={e => set('nombre', e.target.value)} /></Campo>
      <Campo etiqueta="Categoría" requerido error={errores.categoria}>
        <select data-campo="categoria" className="dx-ui-select" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
          <option value="">Seleccionar…</option>{Object.entries(CATEGORIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Descripción" ancho><input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} /></Campo>
      <Campo etiqueta="Días de alerta antes del vencimiento" requerido error={errores.dias_alerta}>
        <input data-campo="dias_alerta" type="number" min="0" max="365" value={form.dias_alerta} onChange={e => set('dias_alerta', e.target.value)} />
      </Campo>
      <label className="dx-flotab-check"><input type="checkbox" checked={form.requiere_monto} onChange={e => set('requiere_monto', e.target.checked)} /><span>Exige monto y moneda</span></label>
      {tipo.id && <label className="dx-flotab-check"><input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} /><span>Tipo activo</span></label>}
      <div className="dx-flotab-span dx-flotab-inline-actions">
        <ErrorPie mensaje={errorServidor} />
        <button type="button" className="dx-btn" onClick={onCancelar}>Cancelar</button>
        <button className="dx-btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar tipo'}</button>
      </div>
    </form>
  );
}

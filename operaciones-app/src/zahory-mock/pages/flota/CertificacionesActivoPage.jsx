import { useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import {
  actualizarCertificacion, anularCertificacion, cargarCertificaciones, cargarEquiposPropios, cargarEstadoEquipos, cargarEventos,
  cargarSugeridos, cargarTiposCertificacion, descartarArchivo, formatoFecha, guardarTipoCertificacion, normalizar, permisosPantalla,
  registrarCertificacion, subirDocumento, urlsFirmadas,
} from '../../../services/flotaRentalService.js';
import { Campo, Dato, Dialogo, ErrorPie, LineaTiempo, MotivoForm, Pill, contar, enfocarPrimerError, filaTeclado } from './flotaUi.jsx';

const ESTADO = {
  vigente: ['Vigente', 'green'], por_vencer: ['Por vencer', 'amber'], vencida: ['Vencida', 'red'],
  faltante: ['Faltante', 'red'], sin_adjunto: ['Sin adjunto', 'red'],
};
const TABS = [['todos', 'Todas'], ['vigente', 'Vigentes'], ['por_vencer', 'Por vencer'], ['vencida', 'Vencidas'], ['faltante', 'Faltantes']];
const enTab = (fila, tab) => tab === 'todos' || fila.estado === tab || (tab === 'faltante' && fila.estado === 'sin_adjunto');

export function CertificacionesActivoPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const [permisos, setPermisos] = useState(null);
  const [equipos, setEquipos] = useState([]);
  const [estados, setEstados] = useState(new Map());
  const [certs, setCerts] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [tab, setTab] = useState('todos');
  const [q, setQ] = useState('');
  const [fecha, setFecha] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const [catalogo, setCatalogo] = useState(false);

  const recargar = async () => {
    setCargando(true); setError('');
    try {
      const [eq, est, cs, ts] = await Promise.all([cargarEquiposPropios(empresaId), cargarEstadoEquipos(empresaId), cargarCertificaciones(empresaId), cargarTiposCertificacion(empresaId)]);
      setEquipos(eq); setEstados(est); setCerts(cs); setTipos(ts);
    } catch (e) { setError(e.message || 'No se pudieron cargar las certificaciones.'); } finally { setCargando(false); }
  };

  useEffect(() => {
    if (!empresaId) return;
    permisosPantalla(empresaId, 'certificaciones_activo').then(setPermisos);
    recargar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const filas = useMemo(() => {
    const porId = new Map(certs.map(c => [c.id, c]));
    return equipos.flatMap(eq => (estados.get(eq.id)?.requisitos || []).map(r => ({
      key: `${eq.id}:${r.tipo_id}`, equipo: eq, ...r, cert: r.certificacion_id ? porId.get(r.certificacion_id) : null,
    })));
  }, [equipos, estados, certs]);

  const visibles = useMemo(() => filas.filter(f => enTab(f, tab)
    && (!fecha || f.fecha_vencimiento === fecha || f.fecha_emision === fecha)
    && normalizar([f.equipo.codigo, f.equipo.nombre, f.tipo, f.numero, f.emisor, ESTADO[f.estado]?.[0], f.obligatoria ? 'obligatoria' : 'informativa',
      formatoFecha(f.fecha_emision), formatoFecha(f.fecha_vencimiento)].join(' ')).includes(normalizar(q))), [filas, tab, fecha, q]);

  const conteo = estado => filas.filter(f => enTab(f, estado)).length;
  const bloqueados = [...estados.values()].filter(e => e.bloqueado).length;

  if (!permisos) return <section className="dx-ui dx-flotab dx-certs"><div className="dx-ui-empty">Cargando permisos…</div></section>;
  if (!permisos.ver) return <section className="dx-ui dx-flotab dx-certs"><div className="dx-ui-empty">No tienes permiso para ver Certificaciones del Activo.</div></section>;

  const terminar = async mensaje => { setFormulario(null); setDetalle(null); setAviso(mensaje); await recargar(); };

  return (
    <section className="dx-ui dx-flotab dx-certs">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Cumplimiento · documentos del activo</div>
          <h1 className="dx-ui-title">Certificaciones del Activo</h1>
          <p className="dx-ui-sub">El bloqueo de despacho aplica solo a certificaciones obligatorias vencidas o faltantes.</p>
        </div>
        <div className="dx-ui-actions">
          <button className="dx-btn" onClick={() => setCatalogo(true)}>Catálogo de tipos</button>
          {permisos.crear && <button className="dx-btn primary" onClick={() => setFormulario({ modo: 'nuevo' })} disabled={!tipos.some(t => t.activo)}
            title={tipos.some(t => t.activo) ? '' : 'Configura primero el catálogo de tipos'}>Registrar certificación</button>}
        </div>
      </header>
      <div className="dx-ui-summary">
        <div className="dx-ui-chip"><b>{conteo('vigente')}</b><span>vigentes</span></div>
        <div className="dx-ui-chip"><b>{conteo('por_vencer')}</b><span>por vencer</span></div>
        <div className="dx-ui-chip"><b>{conteo('vencida') + conteo('faltante')}</b><span>vencidas o faltantes</span></div>
        <div className="dx-ui-chip"><b>{bloqueados}</b><span>{bloqueados === 1 ? 'equipo bloqueado' : 'equipos bloqueados'}</span></div>
      </div>
      {aviso && <p role="status" className="dx-ui-notice">{aviso}</p>}
      {error && <p role="alert" className="dx-ui-error">{error}</p>}
      {!cargando && !tipos.length && <p className="dx-ui-notice" role="status">La empresa aún no tiene tipos de certificación. Configúralos en «Catálogo de tipos»; solo los marcados como obligatorios bloquean un despacho.</p>}
      <div className="dx-ui-tabs" role="group" aria-label="Estado de certificaciones">
        {TABS.map(([v, l]) => <button key={v} type="button" className={`dx-ui-tab${tab === v ? ' on' : ''}`} aria-pressed={tab === v} onClick={() => setTab(v)}>{l} · {v === 'todos' ? filas.length : conteo(v)}</button>)}
      </div>
      <div className="dx-ui-card">
        <div className="dx-ui-toolbar">
          <h2>Certificaciones registradas</h2>
          <span className="dx-ui-count">{contar(visibles.length, 'documento', 'documentos')}</span>
          <label className="dx-ui-search" aria-label="Buscar certificaciones"><span aria-hidden="true">⌕</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en los campos visibles…" /></label>
          <label className="dx-ui-filter-date">Fecha exacta<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        </div>
        <div className="dx-ui-head dx-certs-cols" aria-hidden="true"><span>Equipo / documento</span><span>Tipo</span><span>Vigencia</span><span>Emisor</span><span>Estado / requisito</span><span /></div>
        {cargando ? <div className="dx-ui-empty">Cargando certificaciones…</div>
          : !filas.length ? <div className="dx-ui-empty">Aún no hay certificaciones registradas ni requisitos obligatorios.</div>
          : !visibles.length ? <div className="dx-ui-empty">No hay certificaciones que coincidan con los filtros.</div>
          : visibles.map(f => (
            <div key={f.key} className="dx-ui-row dx-certs-cols" aria-label={`Abrir ${f.tipo} de ${f.equipo.codigo}`} {...filaTeclado(() => setDetalle(f))}>
              <span className="dx-flotab-main"><b>{f.equipo.codigo} · {f.numero || (f.cert ? 'Sin número' : 'Sin registrar')}</b><small>{f.equipo.nombre}{f.cert?.storage_path ? ' · adjunto' : ''}</small></span>
              <span>{f.tipo}</span>
              <span>{f.cert ? `${formatoFecha(f.fecha_emision)} — ${formatoFecha(f.fecha_vencimiento)}` : 'Sin dato'}</span>
              <span>{f.emisor || 'Sin dato'}</span>
              <span className="dx-flotab-pills"><Pill tono={ESTADO[f.estado]?.[1]}>{ESTADO[f.estado]?.[0]}</Pill><small>{f.obligatoria ? 'Obligatoria' : 'Informativa'}</small></span>
              <span className="dx-ui-arrow" aria-hidden="true">›</span>
            </div>
          ))}
      </div>
      {detalle && <DetalleCert empresaId={empresaId} fila={detalle} historial={certs.filter(c => c.activo_id === detalle.equipo.id && c.tipo_id === detalle.tipo_id)}
        permisos={permisos} onCerrar={() => setDetalle(null)}
        onRegistrar={() => setFormulario({ modo: detalle.cert ? 'renovar' : 'nuevo', activo_id: detalle.equipo.id, tipo_id: detalle.tipo_id })}
        onEditar={() => setFormulario({ modo: 'editar', cert: detalle.cert })}
        onAnulada={() => terminar('Certificación anulada.')} />}
      {formulario && <FormCert empresaId={empresaId} inicial={formulario} equipos={equipos} tipos={tipos} onCerrar={() => setFormulario(null)} onTerminar={terminar} />}
      {catalogo && <CatalogoCert empresaId={empresaId} tipos={tipos} equipos={equipos} puedeEditar={permisos.editar} onCerrar={() => setCatalogo(false)} onCambio={recargar} />}
    </section>
  );
}

function DetalleCert({ empresaId, fila, historial, permisos, onCerrar, onRegistrar, onEditar, onAnulada }) {
  const [urls, setUrls] = useState(new Map());
  const [eventos, setEventos] = useState(null);
  const [anulando, setAnulando] = useState(false);
  const cert = fila.cert;
  useEffect(() => {
    urlsFirmadas(historial.map(c => c.storage_path)).then(setUrls).catch(() => {});
    if (cert) Promise.all(historial.map(c => cargarEventos(empresaId, 'certificacion', c.id))).then(l => setEventos(l.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)))).catch(() => setEventos([]));
    else setEventos([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, fila.key]);
  const principal = cert
    ? permisos.crear && <button className="dx-btn primary" onClick={onRegistrar}>Renovar</button>
    : permisos.crear && <button className="dx-btn primary" onClick={onRegistrar}>Registrar certificación</button>;
  return (
    <Dialogo ancho titulo={`${fila.tipo} · ${fila.equipo.codigo}`} subtitulo={`${fila.equipo.nombre} · ${fila.obligatoria ? 'obligatoria' : 'informativa'}`} onCerrar={onCerrar}
      pie={<>{cert && permisos.anular && !anulando && <button className="dx-btn danger" onClick={() => setAnulando(true)}>Anular</button>}
        {cert && permisos.editar && <button className="dx-btn" onClick={onEditar}>Editar</button>}
        <button className="dx-btn" onClick={onCerrar}>Cerrar</button>{principal}</>}>
      <div className="dx-ui-detail-grid">
        <Dato etiqueta="Estado" valor={ESTADO[fila.estado]?.[0]} />
        <Dato etiqueta="Número" valor={fila.numero} />
        <Dato etiqueta="Empresa emisora" valor={fila.emisor} />
        <Dato etiqueta="Vigencia" valor={cert ? `${formatoFecha(fila.fecha_emision)} — ${formatoFecha(fila.fecha_vencimiento)}` : ''} />
      </div>
      {fila.bloquea && <p role="alert" className="dx-ui-error">Este requisito bloquea el despacho del equipo hasta que se regularice.</p>}
      {anulando && <MotivoForm etiqueta="Motivo de anulación" boton="Anular certificación" peligro onCancelar={() => setAnulando(false)}
        onConfirmar={async motivo => { await anularCertificacion(cert.id, motivo); await onAnulada(); }} />}
      <div className="dx-flotab-sections">
        <div>
          <h3>Versiones del documento</h3>
          {!historial.length ? <p className="dx-flotab-muted">Aún no se ha registrado este documento.</p> : (
            <ul className="dx-flotab-catalog">{historial.map(c => (
              <li key={c.id}><div><b>{c.numero || 'Sin número'} · {c.estado === 'activa' ? 'Activa' : c.estado === 'reemplazada' ? 'Reemplazada' : 'Anulada'}</b>
                <small>{formatoFecha(c.fecha_emision)} — {formatoFecha(c.fecha_vencimiento)}{c.anulado_motivo ? ` · ${c.anulado_motivo}` : ''}</small></div>
                {c.storage_path && urls.get(c.storage_path) ? <a className="dx-btn" href={urls.get(c.storage_path)} target="_blank" rel="noreferrer">Ver adjunto</a> : <small className="dx-flotab-muted">{c.storage_path ? 'Adjunto' : 'Sin adjunto'}</small>}
              </li>
            ))}</ul>
          )}
          {cert?.notas && <><h3>Notas</h3><p>{cert.notas}</p></>}
        </div>
        <div>
          <h3>Trazabilidad</h3>
          {eventos ? <LineaTiempo eventos={eventos} /> : <p className="dx-flotab-muted">Cargando…</p>}
        </div>
      </div>
    </Dialogo>
  );
}

function FormCert({ empresaId, inicial, equipos, tipos, onCerrar, onTerminar }) {
  const editar = inicial.modo === 'editar';
  const c = inicial.cert || {};
  const contenedor = useRef(null);
  const [form, setForm] = useState({
    activo_id: editar ? c.activo_id : inicial.activo_id || '',
    tipo_id: editar ? c.tipo_id : inicial.tipo_id || '',
    numero: editar ? c.numero || '' : '', emisor: editar ? c.emisor || '' : '',
    fecha_emision: editar ? c.fecha_emision || '' : '', fecha_vencimiento: editar ? c.fecha_vencimiento || '' : '',
    obligatoria: editar ? c.obligatoria : false, notas: editar ? c.notas || '' : '',
  });
  const [archivo, setArchivo] = useState(null);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const tipo = tipos.find(t => t.id === form.tipo_id);
  const fijo = editar || inicial.modo === 'renovar' || Boolean(inicial.activo_id && inicial.tipo_id);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrores(e => ({ ...e, [k]: '' })); setErrorServidor(''); };

  const guardar = async evento => {
    evento.preventDefault();
    const e = {};
    if (!form.activo_id) e.activo_id = 'Elige el equipo.';
    if (!form.tipo_id) e.tipo_id = 'Elige el tipo de certificación.';
    if (form.fecha_emision && form.fecha_vencimiento && form.fecha_vencimiento < form.fecha_emision) e.fecha_vencimiento = 'El vencimiento no puede ser anterior a la emisión.';
    if (tipo?.requiere_adjunto && !archivo && !(editar && c.storage_path)) e.archivo = `El tipo ${tipo.nombre} exige adjuntar el documento.`;
    setErrores(e);
    if (!enfocarPrimerError(contenedor.current, e)) return;
    setGuardando(true); setErrorServidor('');
    let ruta = null;
    try {
      if (archivo) ruta = await subirDocumento({ empresaId, carpeta: 'certificaciones', archivo });
      const datos = { numero: form.numero, emisor: form.emisor, fecha_emision: form.fecha_emision, fecha_vencimiento: form.fecha_vencimiento, obligatoria: form.obligatoria, notas: form.notas };
      if (editar) await actualizarCertificacion(c.id, { ...datos, ...(ruta ? { storage_path: ruta } : {}) });
      else await registrarCertificacion(empresaId, { ...datos, activo_id: form.activo_id, tipo_id: form.tipo_id, storage_path: ruta });
      await onTerminar(editar ? 'Certificación actualizada.' : inicial.modo === 'renovar' ? 'Certificación renovada; la versión anterior queda en el historial.' : 'Certificación registrada.');
    } catch (err) {
      if (ruta) await descartarArchivo(ruta);
      setErrorServidor(err.message || 'No se pudo guardar la certificación.');
    } finally { setGuardando(false); }
  };

  const titulo = editar ? 'Editar certificación' : inicial.modo === 'renovar' ? 'Renovar certificación' : 'Registrar certificación';
  return (
    <Dialogo cerrarFuera={false} titulo={titulo} subtitulo={inicial.modo === 'renovar' ? 'La versión vigente pasará al historial como reemplazada.' : undefined} onCerrar={onCerrar}
      pie={<><ErrorPie mensaje={errorServidor} /><button type="button" className="dx-btn" onClick={onCerrar}>Cancelar</button><button type="submit" form="form-cert" className="dx-btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button></>}>
      <form id="form-cert" ref={contenedor} className="dx-flotab-form dx-flotab-form-2" onSubmit={guardar} noValidate>
        <Campo etiqueta="Equipo" requerido error={errores.activo_id}>
          {fijo ? <div className="dx-flotab-readonly">{(() => { const eq = equipos.find(x => x.id === form.activo_id); return eq ? `${eq.codigo} · ${eq.nombre}` : 'Sin dato'; })()}</div>
            : <select data-campo="activo_id" className="dx-ui-select" value={form.activo_id} onChange={e => set('activo_id', e.target.value)}>
              <option value="">Seleccionar…</option>{equipos.map(eq => <option key={eq.id} value={eq.id}>{eq.codigo} · {eq.nombre}</option>)}
            </select>}
        </Campo>
        <Campo etiqueta="Tipo de certificación" requerido error={errores.tipo_id}>
          {fijo ? <div className="dx-flotab-readonly">{tipo?.nombre || 'Sin dato'}</div>
            : <select data-campo="tipo_id" className="dx-ui-select" value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)}>
              <option value="">Seleccionar…</option>{tipos.filter(t => t.activo).map(t => <option key={t.id} value={t.id}>{t.nombre}{t.obligatoria ? ' · obligatoria' : ''}</option>)}
            </select>}
        </Campo>
        <Campo etiqueta="Número de documento"><input value={form.numero} onChange={e => set('numero', e.target.value)} /></Campo>
        <Campo etiqueta="Empresa emisora"><input value={form.emisor} onChange={e => set('emisor', e.target.value)} /></Campo>
        <Campo etiqueta="Fecha de emisión"><input type="date" value={form.fecha_emision} onChange={e => set('fecha_emision', e.target.value)} /></Campo>
        <Campo etiqueta="Fecha de vencimiento" error={errores.fecha_vencimiento} ayuda="Vacío = sin vencimiento.">
          <input data-campo="fecha_vencimiento" type="date" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)} />
        </Campo>
        <Campo etiqueta={`Adjunto${tipo?.requiere_adjunto ? '' : ' (opcional)'}`} requerido={Boolean(tipo?.requiere_adjunto)} error={errores.archivo}
          ayuda={editar && c.storage_path ? 'Ya tiene adjunto; sube otro solo para reemplazarlo.' : 'PDF o imagen, hasta 10 MB.'}>
          <input data-campo="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => { setArchivo(e.target.files?.[0] || null); setErrores(er => ({ ...er, archivo: '' })); }} />
        </Campo>
        <label className="dx-flotab-check">
          <input type="checkbox" checked={Boolean(tipo?.obligatoria) || form.obligatoria} disabled={Boolean(tipo?.obligatoria)} onChange={e => set('obligatoria', e.target.checked)} />
          <span>Obligatoria para despachar este equipo{tipo?.obligatoria ? ' (definido por el tipo)' : ''}</span>
        </label>
        <Campo etiqueta="Notas" ancho><textarea value={form.notas} onChange={e => set('notas', e.target.value)} /></Campo>
      </form>
    </Dialogo>
  );
}

function CatalogoCert({ empresaId, tipos, equipos, puedeEditar, onCerrar, onCambio }) {
  const [edicion, setEdicion] = useState(null);
  const [error, setError] = useState('');
  const categorias = [...new Set(equipos.map(e => e.tipo_categoria).filter(Boolean))].sort();
  const ejecutar = async fn => { setError(''); try { await fn(); await onCambio(); } catch (e) { setError(e.message || 'No se pudo guardar.'); } };
  return (
    <Dialogo ancho titulo="Catálogo de certificaciones" subtitulo="Solo los tipos marcados como obligatorios bloquean un despacho cuando faltan o vencen." onCerrar={onCerrar}
      pie={<><ErrorPie mensaje={error} /><button className="dx-btn" onClick={onCerrar}>Cerrar</button>{puedeEditar && !edicion && <button className="dx-btn primary" onClick={() => setEdicion({})}>Nuevo tipo</button>}</>}>
      {!tipos.length && <div className="dx-ui-empty">La empresa no tiene tipos configurados.{puedeEditar && <><br /><button className="dx-btn primary dx-flotab-mt" onClick={() => ejecutar(() => cargarSugeridos(empresaId, 'certificaciones'))}>Cargar tipos sugeridos</button></>}</div>}
      {edicion ? <TipoCertForm empresaId={empresaId} tipo={edicion} categorias={categorias} onCancelar={() => setEdicion(null)} onGuardado={async () => { setEdicion(null); await onCambio(); }} /> : (
        <ul className="dx-flotab-catalog">{tipos.map(t => (
          <li key={t.id} className={t.activo ? '' : 'is-off'}>
            <div><b>{t.nombre} {t.obligatoria ? <Pill tono="red">Obligatoria</Pill> : <Pill tono="gray">Informativa</Pill>}</b>
              <small>{t.aplica_categorias?.length ? `Categorías: ${t.aplica_categorias.join(', ')}` : 'Todas las categorías'} · {t.requiere_adjunto ? 'adjunto obligatorio' : 'adjunto opcional'} · alerta {contar(t.dias_alerta, 'día', 'días')} antes · versión {t.version}{t.activo ? '' : ' · inactivo'}</small></div>
            {puedeEditar && <button className="dx-btn" onClick={() => setEdicion(t)}>Editar</button>}
          </li>
        ))}</ul>
      )}
    </Dialogo>
  );
}

function TipoCertForm({ empresaId, tipo, categorias, onCancelar, onGuardado }) {
  const contenedor = useRef(null);
  const [form, setForm] = useState({
    nombre: tipo.nombre || '', descripcion: tipo.descripcion || '', obligatoria: Boolean(tipo.obligatoria),
    aplica_categorias: tipo.aplica_categorias || [], requiere_adjunto: Boolean(tipo.requiere_adjunto),
    dias_alerta: tipo.dias_alerta ?? 30, activo: tipo.activo ?? true,
  });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrores(e => ({ ...e, [k]: '' })); setErrorServidor(''); };
  const guardar = async evento => {
    evento.preventDefault();
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'Indica el nombre del tipo.';
    if (form.dias_alerta === '' || Number(form.dias_alerta) < 0 || Number(form.dias_alerta) > 365) e.dias_alerta = 'Entre 0 y 365 días.';
    setErrores(e);
    if (!enfocarPrimerError(contenedor.current, e)) return;
    setGuardando(true);
    try { await guardarTipoCertificacion(empresaId, { ...(tipo.id ? { id: tipo.id } : {}), ...form, dias_alerta: Number(form.dias_alerta) }); await onGuardado(); }
    catch (err) { setErrorServidor(err.message || 'No se pudo guardar el tipo.'); } finally { setGuardando(false); }
  };
  return (
    <form ref={contenedor} className="dx-flotab-form dx-flotab-form-2" onSubmit={guardar} noValidate>
      <Campo etiqueta="Nombre" requerido error={errores.nombre}><input data-campo="nombre" value={form.nombre} onChange={e => set('nombre', e.target.value)} /></Campo>
      <Campo etiqueta="Días de alerta antes del vencimiento" requerido error={errores.dias_alerta}>
        <input data-campo="dias_alerta" type="number" min="0" max="365" value={form.dias_alerta} onChange={e => set('dias_alerta', e.target.value)} />
      </Campo>
      <Campo etiqueta="Descripción" ancho><input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} /></Campo>
      <label className="dx-flotab-check"><input type="checkbox" checked={form.obligatoria} onChange={e => set('obligatoria', e.target.checked)} /><span>Obligatoria (bloquea el despacho si falta o vence)</span></label>
      <label className="dx-flotab-check"><input type="checkbox" checked={form.requiere_adjunto} onChange={e => set('requiere_adjunto', e.target.checked)} /><span>Exige adjuntar el documento</span></label>
      <fieldset className="dx-flotab-span dx-flotab-fieldset">
        <legend>Aplica a categorías de equipo <small>(ninguna marcada = todas)</small></legend>
        {!categorias.length ? <p className="dx-flotab-muted">Los equipos aún no tienen categoría registrada; aplicará a todos.</p>
          : categorias.map(cat => <label key={cat} className="dx-flotab-check"><input type="checkbox" checked={form.aplica_categorias.includes(cat)}
            onChange={e => set('aplica_categorias', e.target.checked ? [...form.aplica_categorias, cat] : form.aplica_categorias.filter(x => x !== cat))} /><span>{cat}</span></label>)}
      </fieldset>
      {tipo.id && <label className="dx-flotab-check"><input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} /><span>Tipo activo</span></label>}
      <div className="dx-flotab-span dx-flotab-inline-actions">
        <ErrorPie mensaje={errorServidor} />
        <button type="button" className="dx-btn" onClick={onCancelar}>Cancelar</button>
        <button className="dx-btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar tipo'}</button>
      </div>
    </form>
  );
}

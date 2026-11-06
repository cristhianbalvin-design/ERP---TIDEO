import { useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { nuevoId } from '../../../services/actaConformidadService.js';
import {
  ahoraLocalInput, anularActa, cargarActas, cargarChecklist, cargarDetalleActa, cargarEquiposDeContratos, cargarEstadoEquipos,
  cargarGuias, cargarRequisitos, hoyLocal, cargarSugeridos, descartarArchivo, formatoFecha, formatoFechaHora, guardarActa, guardarChecklistItem,
  normalizar, permisosPantalla, subirFirmaActa, subirFotoActa, tomarPreseleccionActa,
} from '../../../services/flotaRentalService.js';
import { FirmaTrazo } from '../FirmaTrazo.jsx';
import { Campo, Dato, Dialogo, ErrorPie, LineaTiempo, MotivoForm, Pill, contar, enfocarPrimerError, filaTeclado } from './flotaUi.jsx';

const ESTADOS = { borrador: ['Borrador', 'amber'], confirmada: ['Confirmada', 'green'], anulada: ['Anulada', 'gray'] };
const TIPOS = { despacho: ['Despacho', 'cyan', 'Salida de equipo a operación'], retorno: ['Retorno', 'violet', 'Retorno de equipo a base'] };
const REQ = { vigente: ['Vigente', 'green'], por_vencer: ['Por vencer', 'amber'], vencida: ['Vencida', 'red'], faltante: ['Faltante', 'red'], sin_adjunto: ['Sin adjunto', 'red'] };
const PASOS = ['Contrato y equipo', 'Requisitos', 'Estado y lecturas', 'Evidencia', 'Firma y confirmación'];
const ROLES = { responsable_empresa: 'Responsable de la empresa', cliente: 'Representante del cliente', transportista: 'Transportista', supervisor: 'Supervisor' };
const mesActual = () => new Date().toISOString().slice(0, 7);

export function ActasDespachosPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const [permisos, setPermisos] = useState(null);
  const [actas, setActas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [estado, setEstado] = useState('todos');
  const [fecha, setFecha] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [asistente, setAsistente] = useState(null);
  const [checklistAbierto, setChecklistAbierto] = useState(false);

  const recargar = async () => {
    setCargando(true); setError('');
    try { setActas(await cargarActas(empresaId)); } catch (e) { setError(e.message || 'No se pudieron cargar las actas.'); } finally { setCargando(false); }
  };

  useEffect(() => {
    if (!empresaId) return;
    permisosPantalla(empresaId, 'actas_despachos').then(setPermisos);
    recargar();
    const pre = tomarPreseleccionActa();
    if (pre) setAsistente({ tipo: pre.tipo || 'despacho', activoId: pre.activoId || '' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const visibles = useMemo(() => actas.filter(a =>
    (tipo === 'todos' || a.tipo === tipo)
    && (estado === 'todos' || a.estado === estado)
    && (!fecha || String(a.fecha_movimiento).slice(0, 10) === fecha)
    && normalizar([a.numero, TIPOS[a.tipo]?.[0], TIPOS[a.tipo]?.[2], a.contrato?.numero, a.activo?.codigo, a.activo?.nombre, a.cliente,
      formatoFecha(a.fecha_movimiento), ESTADOS[a.estado]?.[0], a.guia?.numero_completo, a.observaciones].join(' ')).includes(normalizar(q))
  ), [actas, tipo, estado, fecha, q]);

  const mes = mesActual();
  const confirmadasMes = actas.filter(a => a.estado === 'confirmada' && String(a.fecha_movimiento).slice(0, 7) === mes);
  const kpis = [
    [confirmadasMes.filter(a => a.tipo === 'despacho').length, 'despachos este mes'],
    [confirmadasMes.filter(a => a.tipo === 'retorno').length, 'retornos este mes'],
    [actas.filter(a => a.estado === 'borrador').length, 'pendientes de firma'],
  ];

  if (!permisos) return <section className="dx-ui dx-flotab dx-actas"><div className="dx-ui-empty">Cargando permisos…</div></section>;
  if (!permisos.ver) return <section className="dx-ui dx-flotab dx-actas"><div className="dx-ui-empty">No tienes permiso para ver Actas &amp; Despachos.</div></section>;

  const alTerminar = async mensaje => { setAsistente(null); setAviso(mensaje); await recargar(); };

  return (
    <section className="dx-ui dx-flotab dx-actas">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Custodia · despacho y retorno</div>
          <h1 className="dx-ui-title">Actas &amp; Despachos</h1>
          <p className="dx-ui-sub">El traslado registra acta y evidencia; la guía se enlaza cuando corresponde.</p>
        </div>
        <div className="dx-ui-actions">
          <button className="dx-btn" onClick={() => setChecklistAbierto(true)}>Checklist</button>
          {permisos.crear && <button className="dx-btn primary" onClick={() => setAsistente({ tipo: 'despacho' })}>Crear acta</button>}
        </div>
      </header>
      <div className="dx-ui-summary">{kpis.map(([n, label]) => <div className="dx-ui-chip" key={label}><b>{n}</b><span>{label}</span></div>)}</div>
      {aviso && <p role="status" className="dx-ui-notice">{aviso}</p>}
      {error && <p role="alert" className="dx-ui-error">{error}</p>}
      <div className="dx-ui-tabs" role="group" aria-label="Tipo de acta">
        {[['todos', `Todas · ${actas.length}`], ['despacho', `Despachos · ${actas.filter(a => a.tipo === 'despacho').length}`], ['retorno', `Retornos · ${actas.filter(a => a.tipo === 'retorno').length}`]].map(([v, l]) =>
          <button key={v} type="button" className={`dx-ui-tab${tipo === v ? ' on' : ''}`} aria-pressed={tipo === v} onClick={() => setTipo(v)}>{l}</button>)}
      </div>
      <div className="dx-ui-card">
        {actas.length >= 1000 && <p className="dx-ui-notice" role="status">Se alcanzó el límite de 1000 actas; los resultados pueden estar incompletos.</p>}
        <div className="dx-ui-toolbar">
          <h2>Actas de despacho y retorno</h2>
          <span className="dx-ui-count">{contar(visibles.length, 'acta', 'actas')}</span>
          <label className="dx-ui-search" aria-label="Buscar actas"><span aria-hidden="true">⌕</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en los campos visibles…" /></label>
          <select className="dx-ui-control dx-flotab-select" value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado del acta">
            <option value="todos">Todos los estados</option>{Object.entries(ESTADOS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="dx-ui-filter-date">Fecha exacta<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        </div>
        <div className="dx-ui-head dx-actas-cols" aria-hidden="true"><span>Acta</span><span>Tipo</span><span>Contrato / equipo</span><span>Fecha</span><span>Estado</span><span /></div>
        {cargando ? <div className="dx-ui-empty">Cargando actas…</div>
          : !actas.length ? <div className="dx-ui-empty">Aún no hay actas. Crea la primera desde «Crear acta» o desde el Panel de Flota.</div>
          : !visibles.length ? <div className="dx-ui-empty">No hay actas que coincidan con los filtros.</div>
          : visibles.map(a => (
            <div key={a.id} className="dx-ui-row dx-actas-cols" aria-label={`Abrir acta ${a.numero}`} {...filaTeclado(() => setDetalle(a))}>
              <span className="dx-flotab-main"><b>{a.numero}</b><small>{TIPOS[a.tipo]?.[2]}</small></span>
              <span><Pill tono={TIPOS[a.tipo]?.[1]}>{TIPOS[a.tipo]?.[0]}</Pill></span>
              <span className="dx-flotab-main"><b>{a.contrato?.numero || 'Sin dato'} · {a.activo?.codigo || 'Sin dato'}</b><small>{a.cliente || a.activo?.nombre || 'Sin dato'}</small></span>
              <span>{formatoFecha(a.fecha_movimiento)}</span>
              <span><Pill tono={ESTADOS[a.estado]?.[1]}>{ESTADOS[a.estado]?.[0]}</Pill></span>
              <span className="dx-ui-arrow" aria-hidden="true">›</span>
            </div>
          ))}
      </div>
      {detalle && <DetalleActa empresaId={empresaId} acta={detalle} permisos={permisos} onCerrar={() => setDetalle(null)}
        onContinuar={() => { setAsistente({ borrador: detalle }); setDetalle(null); }}
        onAnulada={async () => { setDetalle(null); setAviso(`Acta ${detalle.numero} anulada.`); await recargar(); }} />}
      {asistente && <AsistenteActa empresaId={empresaId} inicial={asistente} onCerrar={() => setAsistente(null)} onTerminar={alTerminar} />}
      {checklistAbierto && <ChecklistConfig empresaId={empresaId} puedeEditar={permisos.editar} onCerrar={() => setChecklistAbierto(false)} />}
    </section>
  );
}

function DetalleActa({ empresaId, acta, permisos, onCerrar, onContinuar, onAnulada }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [anulando, setAnulando] = useState(false);
  useEffect(() => { cargarDetalleActa(empresaId, acta.id).then(setInfo).catch(e => setError(e.message || 'No se pudo cargar el acta.')); }, [empresaId, acta.id]);
  const requisitos = acta.requisitos_snapshot?.requisitos || [];
  const accionPrincipal = acta.estado === 'borrador' && permisos.crear
    ? <button className="dx-btn primary" onClick={onContinuar}>Continuar acta</button> : null;
  return (
    <Dialogo ancho titulo={`Acta ${acta.numero}`} subtitulo={`${TIPOS[acta.tipo]?.[2]} · ${ESTADOS[acta.estado]?.[0]}`} onCerrar={onCerrar}
      pie={<>{permisos.anular && acta.estado !== 'anulada' && !anulando && <button className="dx-btn danger" onClick={() => setAnulando(true)}>Anular acta</button>}<button className="dx-btn" onClick={onCerrar}>Cerrar</button>{accionPrincipal}</>}>
      <div className="dx-ui-detail-grid">
        <Dato etiqueta="Contrato" valor={acta.contrato?.numero} />
        <Dato etiqueta="Cliente" valor={acta.cliente} />
        <Dato etiqueta="Equipo" valor={acta.activo ? `${acta.activo.codigo} · ${acta.activo.nombre}` : ''} />
        <Dato etiqueta="Fecha y hora" valor={formatoFechaHora(acta.fecha_movimiento)} />
        <Dato etiqueta="Horómetro" valor={acta.horometro == null ? '' : `${Number(acta.horometro).toLocaleString('es-PE')} h`} />
        <Dato etiqueta="Destino" valor={acta.ubicacion_destino} />
        <Dato etiqueta="Guía de remisión" valor={acta.guia?.numero_completo || (acta.guia_no_requerida_motivo ? `No exigida · ${acta.guia_no_requerida_motivo}` : '')} />
        <Dato etiqueta="Confirmada" valor={acta.confirmada_at ? formatoFechaHora(acta.confirmada_at) : ''} />
      </div>
      {acta.estado === 'anulada' && <p className="dx-ui-error">Anulada: {acta.anulado_motivo || 'Sin motivo'}</p>}
      {anulando && <MotivoForm etiqueta="Motivo de anulación" boton="Anular acta" peligro onCancelar={() => setAnulando(false)}
        onConfirmar={async motivo => { await anularActa(acta.id, motivo); await onAnulada(); }} />}
      {error && <p role="alert" className="dx-ui-error">{error}</p>}
      <div className="dx-flotab-sections">
        <div>
          <h3>Checklist de condición</h3>
          {acta.checklist?.length ? <ul className="dx-flotab-check-list">{acta.checklist.map((c, i) =>
            <li key={i}><Pill tono={c.ok === true ? 'green' : c.ok === false ? 'red' : 'gray'}>{c.ok === true ? 'Conforme' : c.ok === false ? 'Observado' : 'Sin respuesta'}</Pill><span>{c.texto}{c.observacion ? ` · ${c.observacion}` : ''}</span></li>)}</ul>
            : <p className="dx-flotab-muted">Sin checklist registrado.</p>}
          <h3>Requisitos al confirmar</h3>
          {requisitos.length ? <ul className="dx-flotab-check-list">{requisitos.map(r =>
            <li key={r.tipo_id}><Pill tono={REQ[r.estado]?.[1]}>{REQ[r.estado]?.[0]}</Pill><span>{r.tipo}{r.obligatoria ? ' · obligatoria' : ''}</span></li>)}</ul>
            : <p className="dx-flotab-muted">{acta.estado === 'borrador' ? 'Se evalúan al confirmar.' : 'Sin certificaciones evaluadas.'}</p>}
        </div>
        <div>
          <h3>Evidencia</h3>
          {!info ? <p className="dx-flotab-muted">Cargando…</p> : info.evidencias.length
            ? <div className="dx-flotab-thumbs">{info.evidencias.map(e => e.url ? <a key={e.id} href={e.url} target="_blank" rel="noreferrer"><img src={e.url} alt={e.descripcion || 'Foto del equipo'} /></a> : <span key={e.id} className="dx-flotab-muted">Foto no disponible</span>)}</div>
            : <p className="dx-flotab-muted">Sin fotos.</p>}
          <h3>Firmas</h3>
          {!info ? null : info.firmas.length ? <div className="dx-flotab-signs">{info.firmas.map(f =>
            <figure key={f.id}>{f.url ? <img src={f.url} alt={`Firma de ${f.nombre}`} /> : null}<figcaption><b>{f.nombre}</b><small>{ROLES[f.rol]}{f.documento ? ` · ${f.documento}` : ''} · {formatoFechaHora(f.firmado_at)}</small></figcaption></figure>)}</div>
            : <p className="dx-flotab-muted">Sin firmas.</p>}
          <h3>Trazabilidad</h3>
          <LineaTiempo eventos={info?.eventos} />
        </div>
      </div>
    </Dialogo>
  );
}

function AsistenteActa({ empresaId, inicial, onCerrar, onTerminar }) {
  const borrador = inicial.borrador || null;
  const contenedor = useRef(null);
  const carpeta = useRef(borrador?.id || nuevoId()).current;
  const [paso, setPaso] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [opciones, setOpciones] = useState([]);
  const [estados, setEstados] = useState(new Map());
  const [guias, setGuias] = useState([]);
  const [plantilla, setPlantilla] = useState([]);
  const [form, setForm] = useState(() => ({
    tipo: borrador?.tipo || inicial.tipo || 'despacho',
    contrato_equipo_id: borrador?.contrato_equipo_id || '',
    fecha_movimiento: borrador ? aInputLocal(borrador.fecha_movimiento) : ahoraLocalInput(),
    horometro: borrador?.horometro ?? '',
    ubicacion_destino: borrador?.ubicacion_destino || '',
    observaciones: borrador?.observaciones || '',
    guia_modo: borrador?.guia_remision_id ? 'guia' : borrador?.guia_no_requerida_motivo ? 'no' : '',
    guia_remision_id: borrador?.guia_remision_id || '',
    guia_no_requerida_motivo: borrador?.guia_no_requerida_motivo || '',
  }));
  const [checklist, setChecklist] = useState(borrador?.checklist || []);
  const [fotos, setFotos] = useState([]);
  const [firmas, setFirmas] = useState({ responsable_empresa: { nombre: '', documento: '', dataUrl: null, existente: null }, cliente: { nombre: '', documento: '', dataUrl: null, existente: null } });
  const [requisitos, setRequisitos] = useState(null);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const subidasNuevas = useRef([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [ops, est, gs, items] = await Promise.all([cargarEquiposDeContratos(empresaId), cargarEstadoEquipos(empresaId), cargarGuias(empresaId).catch(() => []), cargarChecklist(empresaId)]);
        if (!vivo) return;
        setOpciones(ops); setEstados(est); setGuias(gs); setPlantilla(items.filter(i => i.activo));
        if (!borrador && inicial.activoId) {
          const candidatos = ops.filter(o => o.equipo_id === inicial.activoId && disponibleParaActa(o, est.get(o.equipo_id), inicial.tipo || 'despacho'));
          if (candidatos.length === 1) setForm(f => ({ ...f, contrato_equipo_id: candidatos[0].id }));
        }
        if (borrador) {
          const det = await cargarDetalleActa(empresaId, borrador.id);
          if (!vivo) return;
          setFotos(det.evidencias.map(e => ({ tipo: e.tipo, storage_path: e.storage_path, url: e.url, descripcion: e.descripcion })));
          setFirmas(actual => {
            const copia = { ...actual };
            det.firmas.forEach(f => { copia[f.rol] = { nombre: f.nombre, documento: f.documento || '', dataUrl: null, existente: { storage_path: f.storage_path, url: f.url } }; });
            return copia;
          });
        }
      } catch (e) { if (vivo) setErrorCarga(e.message || 'No se pudieron cargar los datos del acta.'); } finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const opcionesTipo = useMemo(() => opciones.filter(o => disponibleParaActa(o, estados.get(o.equipo_id), form.tipo)), [opciones, estados, form.tipo]);
  const seleccion = opciones.find(o => o.id === form.contrato_equipo_id) || null;
  const estadoSel = seleccion ? estados.get(seleccion.equipo_id) : null;

  // Plantilla de checklist según el tipo; conserva respuestas al volver.
  useEffect(() => {
    if (borrador?.checklist?.length) return;
    const items = plantilla.filter(i => i.tipo_acta === 'ambos' || i.tipo_acta === form.tipo);
    setChecklist(actual => items.map(i => actual.find(a => a.texto === i.texto) || { texto: i.texto, ok: null, observacion: '' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantilla, form.tipo]);

  // Resultados obsoletos: al cambiar equipo o fecha se recalculan los requisitos.
  useEffect(() => {
    setRequisitos(null);
    if (!seleccion) return;
    let vigente = true;
    cargarRequisitos(empresaId, seleccion.equipo_id, form.fecha_movimiento.slice(0, 10))
      .then(r => { if (vigente) setRequisitos(r); })
      .catch(e => { if (vigente) setRequisitos({ error: e.message }); });
    return () => { vigente = false; };
  }, [empresaId, seleccion?.equipo_id, form.fecha_movimiento]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrores(e => ({ ...e, [k]: '' })); setErrorServidor(''); };
  const bloqueado = form.tipo === 'despacho' && requisitos?.bloqueado;
  const activoHorometro = seleccion ? (seleccion.activo?.horometro_actual ?? null) : null;

  const validarPaso = n => {
    const e = {};
    if (n === 0) {
      if (!form.contrato_equipo_id) e.contrato_equipo_id = form.tipo === 'despacho' ? 'Elige el contrato y el equipo a despachar.' : 'Elige el equipo que retorna.';
    }
    if (n === 1 && bloqueado) e.requisitos = 'El equipo tiene certificaciones obligatorias faltantes o vencidas.';
    if (n === 2) {
      if (!form.fecha_movimiento) e.fecha_movimiento = 'Indica la fecha y hora.';
      if (form.horometro === '' || Number(form.horometro) < 0) e.horometro = 'Registra el horómetro.';
      checklist.forEach((c, i) => { if (c.ok !== true && c.ok !== false) e[`check_${i}`] = 'Marca Conforme u Observado.'; });
      if (!checklist.length) e.checklist = 'Configura el checklist antes de continuar.';
    }
    if (n === 3) {
      if (!fotos.some(f => f.tipo === 'foto')) e.fotos = 'Agrega al menos una foto del equipo.';
      if (!form.guia_modo) e.guia_modo = 'Indica si enlazas una guía o si el traslado no la exige.';
      if (form.guia_modo === 'guia' && !form.guia_remision_id) e.guia_remision_id = 'Elige la guía de remisión.';
      if (form.guia_modo === 'no' && !form.guia_no_requerida_motivo.trim()) e.guia_no_requerida_motivo = 'Indica por qué no se exige guía.';
    }
    if (n === 4) {
      const r = firmas.responsable_empresa;
      if (!r.nombre.trim()) e.firma_responsable_nombre = 'Indica el nombre del responsable.';
      if (!r.dataUrl && !r.existente) e.firma_responsable = 'Falta la firma del responsable.';
      const c = firmas.cliente;
      if ((c.dataUrl || c.existente) && !c.nombre.trim()) e.firma_cliente_nombre = 'Indica el nombre de quien firma por el cliente.';
    }
    setErrores(e);
    return enfocarPrimerError(contenedor.current, e);
  };

  const avanzar = () => { if (validarPaso(paso)) setPaso(p => Math.min(4, p + 1)); };

  const agregarFotos = async archivos => {
    if (!archivos?.length) return;
    setSubiendo(true); setErrorServidor('');
    try {
      for (const archivo of archivos) {
        const foto = await subirFotoActa({ empresaId, carpeta, archivo });
        subidasNuevas.current.push(foto.storage_path);
        setFotos(actual => [...actual, { ...foto, url: foto.local }]);
      }
      setErrores(e => ({ ...e, fotos: '' }));
    } catch (e) { setErrores(er => ({ ...er, fotos: e.message || 'No se pudo subir la foto.' })); } finally { setSubiendo(false); }
  };

  const quitarFoto = async foto => {
    setFotos(actual => actual.filter(f => f.storage_path !== foto.storage_path));
    if (subidasNuevas.current.includes(foto.storage_path)) await descartarArchivo(foto.storage_path);
  };

  const cancelar = async () => {
    await Promise.all(subidasNuevas.current.map(descartarArchivo));
    onCerrar();
  };

  const guardar = async confirmar => {
    if (confirmar) {
      for (const n of [0, 1, 2, 3, 4]) { if (!validarPaso(n)) { setPaso(n); return; } }
    } else if (!form.contrato_equipo_id) { setPaso(0); validarPaso(0); return; }
    setGuardando(true); setErrorServidor('');
    try {
      const firmasPayload = [];
      for (const rol of ['responsable_empresa', 'cliente']) {
        const f = firmas[rol];
        let ruta = f.existente?.storage_path || null;
        if (f.dataUrl) {
          const subida = await subirFirmaActa({ empresaId, carpeta, rol, dataUrl: f.dataUrl });
          subidasNuevas.current.push(subida.storage_path);
          ruta = subida.storage_path;
        }
        if (ruta && f.nombre.trim()) firmasPayload.push({ rol, nombre: f.nombre.trim(), documento: f.documento.trim() || null, storage_path: ruta });
      }
      const payload = {
        ...(borrador ? { id: borrador.id } : { tipo: form.tipo, contrato_equipo_id: form.contrato_equipo_id }),
        fecha_movimiento: new Date(form.fecha_movimiento).toISOString(),
        horometro: form.horometro === '' ? null : Number(form.horometro),
        ubicacion_destino: form.ubicacion_destino,
        observaciones: form.observaciones,
        checklist: checklist.map(c => ({ texto: c.texto, ok: c.ok, observacion: c.observacion || null })),
        guia_remision_id: form.guia_modo === 'guia' ? form.guia_remision_id : null,
        guia_no_requerida_motivo: form.guia_modo === 'no' ? form.guia_no_requerida_motivo : null,
        evidencias: fotos.map(f => ({ tipo: f.tipo || 'foto', storage_path: f.storage_path, descripcion: f.descripcion || null, sha256: f.sha256 || null })),
        firmas: firmasPayload,
      };
      const r = await guardarActa(empresaId, payload, confirmar);
      subidasNuevas.current = [];
      await onTerminar(confirmar ? `Acta ${r.numero} confirmada. El equipo quedó ${form.tipo === 'despacho' ? 'entregado al cliente' : 'de vuelta en base'}.` : `Borrador ${r.numero} guardado.`);
    } catch (e) {
      setErrorServidor(e.message || 'No se pudo guardar el acta.');
    } finally { setGuardando(false); }
  };

  const titulo = borrador ? `Continuar acta ${borrador.numero}` : 'Asistente de acta · despacho / retorno';
  const pie = (
    <>
      <ErrorPie mensaje={errorServidor} />
      <button type="button" className="dx-btn" onClick={cancelar} disabled={guardando}>Cancelar</button>
      {paso > 0 && <button type="button" className="dx-btn" onClick={() => setPaso(p => p - 1)} disabled={guardando}>Atrás</button>}
      {form.contrato_equipo_id && <button type="button" className="dx-btn" onClick={() => guardar(false)} disabled={guardando || subiendo}>Guardar borrador</button>}
      {paso < 4 ? <button type="button" className="dx-btn primary" onClick={avanzar} disabled={guardando || (paso === 1 && (bloqueado || !requisitos))} title={paso === 1 && bloqueado ? 'Renueva las certificaciones obligatorias para despachar.' : ''}>Avanzar</button>
        : <button type="button" className="dx-btn primary" onClick={() => guardar(true)} disabled={guardando || subiendo || bloqueado}>{guardando ? 'Confirmando…' : 'Confirmar acta'}</button>}
    </>
  );

  return (
    <Dialogo ancho cerrarFuera={false} titulo={titulo} onCerrar={cancelar} pie={pie}>
      <div ref={contenedor} className="dx-actas-wizard">
        <ol className="dx-flotab-steps" aria-label="Pasos del acta">
          {PASOS.map((nombre, i) => (
            <li key={nombre} className={i === paso ? 'is-current' : i < paso ? 'is-done' : ''}>
              {i < paso ? <button type="button" onClick={() => setPaso(i)}>{i + 1} · {nombre}</button> : <span aria-current={i === paso ? 'step' : undefined}>{i + 1} · {nombre}</span>}
            </li>
          ))}
        </ol>
        {cargando ? <div className="dx-ui-empty">Cargando contratos y equipos…</div> : errorCarga ? <p role="alert" className="dx-ui-error">{errorCarga}</p> : (
          <>
            {paso === 0 && (
              <div className="dx-flotab-form">
                <Campo etiqueta="Tipo de acta" requerido>
                  <div className="dx-flotab-segmented" role="radiogroup" aria-label="Tipo de acta">
                    {['despacho', 'retorno'].map(t => <button key={t} type="button" role="radio" aria-checked={form.tipo === t} disabled={Boolean(borrador)}
                      className={form.tipo === t ? 'on' : ''} onClick={() => { set('tipo', t); set('contrato_equipo_id', ''); }}>{TIPOS[t][0]}</button>)}
                  </div>
                </Campo>
                {borrador ? (
                  <Campo etiqueta="Contrato y equipo" ancho><div className="dx-flotab-readonly">{borrador.contrato?.numero} · {borrador.activo?.codigo} · {borrador.activo?.nombre}</div></Campo>
                ) : (
                  <Campo etiqueta={form.tipo === 'despacho' ? 'Contrato y equipo a despachar' : 'Equipo que retorna'} requerido ancho error={errores.contrato_equipo_id}
                    ayuda={opcionesTipo.length ? undefined : form.tipo === 'despacho' ? 'No hay equipos de contratos vigentes pendientes de despacho.' : 'No hay equipos despachados pendientes de retorno.'}>
                    <select data-campo="contrato_equipo_id" className="dx-ui-select" value={form.contrato_equipo_id} onChange={e => set('contrato_equipo_id', e.target.value)}>
                      <option value="">Seleccionar…</option>
                      {opcionesTipo.map(o => <option key={o.id} value={o.id}>{equipoEtiqueta(o)} · {o.contrato.numero} · {o.cliente || 'Sin cliente'}</option>)}
                    </select>
                  </Campo>
                )}
                {seleccion && <div className="dx-ui-detail-grid dx-flotab-span">
                  <Dato etiqueta="Contrato" valor={seleccion.contrato.numero} />
                  <Dato etiqueta="Cliente" valor={seleccion.cliente} />
                  <Dato etiqueta="Vigencia" valor={`${formatoFecha(seleccion.contrato.fecha_inicio)} — ${formatoFecha(seleccion.contrato.fecha_fin)}`} />
                  <Dato etiqueta="Equipo" valor={equipoEtiqueta(seleccion)} />
                  <Dato etiqueta="Acta de salida" valor={estadoSel?.acta_salida_numero} />
                </div>}
              </div>
            )}
            {paso === 1 && (
              <div className="dx-flotab-form">
                <div className="dx-flotab-span">
                  <h3>Certificaciones del equipo</h3>
                  {!requisitos ? <p className="dx-flotab-muted">Evaluando requisitos…</p>
                    : requisitos.error ? <p role="alert" className="dx-ui-error">{requisitos.error}</p>
                    : !requisitos.requisitos.length ? <p className="dx-flotab-muted">El equipo no tiene certificaciones registradas ni obligatorias según el catálogo.</p>
                    : <ul className="dx-flotab-check-list">{requisitos.requisitos.map(r => (
                      <li key={r.tipo_id}><Pill tono={REQ[r.estado]?.[1]}>{REQ[r.estado]?.[0]}</Pill>
                        <span>{r.tipo}{r.obligatoria ? ' · obligatoria' : ' · informativa'}{r.fecha_vencimiento ? ` · vence ${formatoFecha(r.fecha_vencimiento)}` : ''}{r.numero ? ` · ${r.numero}` : ''}</span></li>
                    ))}</ul>}
                  {bloqueado && <p role="alert" className="dx-ui-error">Despacho bloqueado: renueva o registra las certificaciones obligatorias marcadas en rojo en «Certificaciones del Activo».</p>}
                  {form.tipo === 'retorno' && requisitos?.bloqueado && <p className="dx-ui-notice">El equipo tiene certificaciones obligatorias pendientes; el retorno se permite, pero no podrá volver a despacharse hasta regularizarlas.</p>}
                </div>
              </div>
            )}
            {paso === 2 && (
              <div className="dx-flotab-form">
                <Campo etiqueta="Fecha y hora del movimiento" requerido error={errores.fecha_movimiento}>
                  <input data-campo="fecha_movimiento" type="datetime-local" value={form.fecha_movimiento} onChange={e => set('fecha_movimiento', e.target.value)} />
                </Campo>
                <Campo etiqueta={`Horómetro de ${form.tipo === 'despacho' ? 'salida' : 'retorno'} (h)`} requerido error={errores.horometro}
                  ayuda={activoHorometro != null ? `Último registrado: ${activoHorometro} h` : 'Debe ser igual o mayor al último registrado.'}>
                  <input data-campo="horometro" type="number" min="0" step="0.1" value={form.horometro} onChange={e => set('horometro', e.target.value)} />
                </Campo>
                <Campo etiqueta={form.tipo === 'despacho' ? 'Destino / frente de trabajo' : 'Ubicación de recepción'}>
                  <input value={form.ubicacion_destino} onChange={e => set('ubicacion_destino', e.target.value)} />
                </Campo>
                <div className="dx-flotab-span">
                  <h3>Checklist de condición</h3>
                  {errores.checklist && <p role="alert" className="dx-ui-error">{errores.checklist}</p>}
                  <ul className="dx-flotab-checklist">
                    {checklist.map((c, i) => (
                      <li key={c.texto} className={errores[`check_${i}`] ? 'has-error' : ''}>
                        <span className="dx-flotab-check-text">{c.texto}</span>
                        <div className="dx-flotab-segmented" role="radiogroup" aria-label={c.texto}>
                          <button type="button" data-campo={`check_${i}`} role="radio" aria-checked={c.ok === true} className={c.ok === true ? 'on' : ''}
                            onClick={() => { setChecklist(l => l.map((x, j) => j === i ? { ...x, ok: true } : x)); setErrores(e => ({ ...e, [`check_${i}`]: '' })); }}>Conforme</button>
                          <button type="button" role="radio" aria-checked={c.ok === false} className={c.ok === false ? 'on is-bad' : ''}
                            onClick={() => { setChecklist(l => l.map((x, j) => j === i ? { ...x, ok: false } : x)); setErrores(e => ({ ...e, [`check_${i}`]: '' })); }}>Observado</button>
                        </div>
                        {c.ok === false && <input aria-label={`Observación: ${c.texto}`} placeholder="Describe la observación" value={c.observacion || ''}
                          onChange={e => setChecklist(l => l.map((x, j) => j === i ? { ...x, observacion: e.target.value } : x))} />}
                        {errores[`check_${i}`] && <small className="dx-flotab-field-error" role="alert">{errores[`check_${i}`]}</small>}
                      </li>
                    ))}
                  </ul>
                </div>
                <Campo etiqueta="Observaciones generales" ancho>
                  <textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
                </Campo>
              </div>
            )}
            {paso === 3 && (
              <div className="dx-flotab-form">
                <Campo etiqueta="Fotos del equipo" requerido ancho error={errores.fotos} ayuda="JPEG, PNG o WEBP; se reducen automáticamente.">
                  <input data-campo="fotos" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" disabled={subiendo}
                    onChange={e => { agregarFotos([...e.target.files]); e.target.value = ''; }} />
                </Campo>
                {subiendo && <p className="dx-flotab-muted dx-flotab-span" role="status">Subiendo fotos…</p>}
                {fotos.length > 0 && <div className="dx-flotab-thumbs dx-flotab-span">{fotos.map(f => (
                  <figure key={f.storage_path}>{f.url ? <img src={f.url} alt="Foto del equipo" /> : <span className="dx-flotab-muted">Foto guardada</span>}
                    <button type="button" className="dx-btn" aria-label="Quitar foto" onClick={() => quitarFoto(f)}>Quitar</button></figure>
                ))}</div>}
                <Campo etiqueta="Guía de remisión" requerido error={errores.guia_modo}>
                  <select data-campo="guia_modo" className="dx-ui-select" value={form.guia_modo} onChange={e => set('guia_modo', e.target.value)}>
                    <option value="">Seleccionar…</option>
                    <option value="guia">Enlazar guía de remisión</option>
                    <option value="no">Este traslado no la exige</option>
                  </select>
                </Campo>
                {form.guia_modo === 'guia' && <Campo etiqueta="Guía" requerido error={errores.guia_remision_id} ayuda={guias.length ? undefined : 'No hay guías disponibles o no tienes permiso para verlas.'}>
                  <select data-campo="guia_remision_id" className="dx-ui-select" value={form.guia_remision_id} onChange={e => set('guia_remision_id', e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {guias.map(g => <option key={g.id} value={g.id}>{g.numero_completo} · {formatoFecha(g.fecha_emision)}{g.destinatario_razon_social ? ` · ${g.destinatario_razon_social}` : ''}</option>)}
                  </select>
                </Campo>}
                {form.guia_modo === 'no' && <Campo etiqueta="Motivo" requerido ancho error={errores.guia_no_requerida_motivo}>
                  <input data-campo="guia_no_requerida_motivo" value={form.guia_no_requerida_motivo} onChange={e => set('guia_no_requerida_motivo', e.target.value)} placeholder="p. ej. traslado dentro de la misma unidad minera" />
                </Campo>}
              </div>
            )}
            {paso === 4 && (
              <div className="dx-flotab-form">
                {['responsable_empresa', 'cliente'].map(rol => {
                  const f = firmas[rol];
                  const actualizar = cambios => { setFirmas(a => ({ ...a, [rol]: { ...a[rol], ...cambios } })); setErrores(e => ({ ...e, [`firma_${rol === 'cliente' ? 'cliente' : 'responsable'}`]: '', [`firma_${rol === 'cliente' ? 'cliente' : 'responsable'}_nombre`]: '' })); };
                  const clave = rol === 'cliente' ? 'cliente' : 'responsable';
                  return (
                    <div key={rol} className="dx-flotab-sign-block">
                      <h3>{ROLES[rol]}{rol === 'responsable_empresa' ? <b className="dx-flotab-required" aria-hidden="true"> *</b> : <small> (opcional)</small>}</h3>
                      <div className="dx-flotab-form dx-flotab-form-2">
                        <Campo etiqueta="Nombre" requerido={rol === 'responsable_empresa'} error={errores[`firma_${clave}_nombre`]}>
                          <input data-campo={`firma_${clave}_nombre`} value={f.nombre} onChange={e => actualizar({ nombre: e.target.value })} />
                        </Campo>
                        <Campo etiqueta="DNI / documento"><input value={f.documento} onChange={e => actualizar({ documento: e.target.value })} /></Campo>
                      </div>
                      {f.existente && !f.dataUrl ? (
                        <div className="dx-flotab-sign-existing"><img src={f.existente.url} alt={`Firma registrada de ${f.nombre}`} />
                          <button type="button" className="dx-btn" onClick={() => actualizar({ existente: null })}>Volver a firmar</button></div>
                      ) : (
                        <div data-campo={`firma_${clave}`} tabIndex={-1}>
                          <FirmaTrazo etiqueta={`Firma: ${ROLES[rol]}`} valor={f.dataUrl} onChange={dataUrl => actualizar({ dataUrl })} />
                        </div>
                      )}
                      {errores[`firma_${clave}`] && <small className="dx-flotab-field-error" role="alert">{errores[`firma_${clave}`]}</small>}
                    </div>
                  );
                })}
                <div className="dx-flotab-span dx-flotab-summary">
                  <b>Resumen</b>
                  <span>{TIPOS[form.tipo][0]} · {seleccion ? `${seleccion.contrato.numero} · ${equipoEtiqueta(seleccion)}` : 'sin equipo'} · horómetro {form.horometro || 'Sin dato'} h · {contar(fotos.length, 'foto', 'fotos')} · checklist {checklist.filter(c => c.ok === true).length}/{checklist.length} conforme.</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}

// Despacho: contrato vigente que no terminó y equipo sin salida abierta. Retorno: equipo despachado con ese contrato.
function disponibleParaActa(opcion, estado, tipo) {
  if (!estado) return false;
  if (tipo === 'despacho') return opcion.contrato.estado === 'vigente' && !estado.despachado && opcion.contrato.fecha_fin >= hoyLocal();
  return estado.despachado && estado.contrato_alquiler_id === opcion.contrato.id;
}

function equipoEtiqueta(opcion) {
  return opcion.activo ? `${opcion.activo.codigo} · ${opcion.activo.nombre}` : 'Equipo sin dato';
}

function aInputLocal(valor) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return ahoraLocalInput();
  fecha.setMinutes(fecha.getMinutes() - fecha.getTimezoneOffset());
  return fecha.toISOString().slice(0, 16);
}

function ChecklistConfig({ empresaId, puedeEditar, onCerrar }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState({ texto: '', tipo_acta: 'ambos' });
  const [errorNuevo, setErrorNuevo] = useState('');
  const recargar = () => cargarChecklist(empresaId).then(setItems).catch(e => setError(e.message || 'No se pudo cargar el checklist.'));
  useEffect(() => { recargar(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);
  const ejecutar = async fn => { setError(''); try { await fn(); await recargar(); } catch (e) { setError(e.message || 'No se pudo guardar.'); } };
  const agregar = async evento => {
    evento.preventDefault();
    if (!nuevo.texto.trim()) { setErrorNuevo('Escribe el punto de control.'); return; }
    await ejecutar(() => guardarChecklistItem(empresaId, { ...nuevo, orden: (items?.length || 0) + 1 }));
    setNuevo({ texto: '', tipo_acta: 'ambos' });
  };
  const ETQ = { ambos: 'Despacho y retorno', despacho: 'Solo despacho', retorno: 'Solo retorno' };
  return (
    <Dialogo titulo="Checklist de condición" subtitulo="Puntos que se revisan en cada acta de la empresa." onCerrar={onCerrar}
      pie={<><ErrorPie mensaje={error} /><button className="dx-btn" onClick={onCerrar}>Cerrar</button></>}>
      {!items ? <p className="dx-flotab-muted">Cargando…</p> : !items.length ? (
        <div className="dx-ui-empty">Aún no hay puntos de control.{puedeEditar && <><br /><button className="dx-btn primary dx-flotab-mt" onClick={() => ejecutar(() => cargarSugeridos(empresaId, 'checklist'))}>Cargar checklist sugerido</button></>}</div>
      ) : (
        <ul className="dx-flotab-catalog">{items.map(i => (
          <li key={i.id} className={i.activo ? '' : 'is-off'}>
            <div><b>{i.texto}</b><small>{ETQ[i.tipo_acta]}{i.activo ? '' : ' · inactivo'}</small></div>
            {puedeEditar && <button className="dx-btn" onClick={() => ejecutar(() => guardarChecklistItem(empresaId, { id: i.id, texto: i.texto, activo: !i.activo }))}>{i.activo ? 'Desactivar' : 'Activar'}</button>}
          </li>
        ))}</ul>
      )}
      {puedeEditar && items && (
        <form className="dx-flotab-form dx-flotab-form-2" onSubmit={agregar}>
          <Campo etiqueta="Nuevo punto de control" requerido error={errorNuevo}>
            <input data-campo="texto" value={nuevo.texto} onChange={e => { setNuevo(n => ({ ...n, texto: e.target.value })); setErrorNuevo(''); }} />
          </Campo>
          <Campo etiqueta="Aplica a" requerido>
            <select className="dx-ui-select" value={nuevo.tipo_acta} onChange={e => setNuevo(n => ({ ...n, tipo_acta: e.target.value }))}>
              {Object.entries(ETQ).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Campo>
          <div className="dx-flotab-span dx-flotab-inline-actions"><button className="dx-btn primary">Agregar</button></div>
        </form>
      )}
    </Dialogo>
  );
}

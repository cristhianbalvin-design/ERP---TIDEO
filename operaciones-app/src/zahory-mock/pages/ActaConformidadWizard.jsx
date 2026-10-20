import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FirmaTrazo } from './FirmaTrazo.jsx';
import {
  PASOS_ACTA, PASO_REVISION, MAX_FOTOS_ACTA,
  claveBorradorActa, construirDatosActa, contarFotos, datosDispositivo, enmascararCorreo,
  etiquetaTipoCobro, faltantePaso, formatoFecha, formatoFechaHora, leerBorrador, mensajeErrorActa,
  pasoBloqueado, reglaCierreOT, resumenPartes, serializarBorrador, tareaCompleta, tipoCobroOT,
} from './actaConformidadLogic.js';
import {
  cargarContextoActa, descargarComoDataUrl, emitirActa, enviarCorreoActa, guardarPdfActa, nuevoId,
  obtenerUbicacion, quitarFotoBorrador, subirFirmaActa, subirFotoActa, urlsFirmadasActa,
} from '../../services/actaConformidadService.js';

const leerLocal = clave => { try { return globalThis.localStorage?.getItem(clave) || null; } catch { return null; } };
const escribirLocal = (clave, valor) => { try { globalThis.localStorage?.setItem(clave, valor); } catch { /* sin almacenamiento local */ } };
const borrarLocal = clave => { try { globalThis.localStorage?.removeItem(clave); } catch { /* sin almacenamiento local */ } };

const IconoCamara = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const IconoCheck = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);

const RESULTADOS = [
  { valor: 'conforme', titulo: 'Conforme', detalle: 'El cliente acepta el trabajo sin observaciones.' },
  { valor: 'observaciones', titulo: 'Conforme con observaciones', detalle: 'Acepta el trabajo y deja observaciones en el acta.' },
  { valor: 'pendiente', titulo: 'Cliente no disponible o no firma', detalle: 'La OT se cierra con la conformidad pendiente y se envía un enlace al cliente.' },
];

export function ActaConformidadWizard({ ot, partes = [], tareas = [], sesion, onVolver, onEmitida }) {
  const empresaId = sesion?.empresaId;
  const claveBorrador = claveBorradorActa(empresaId, ot.id);
  const inicial = useMemo(() => leerBorrador(leerLocal(claveBorrador)), [claveBorrador]);
  const [borradorId] = useState(() => inicial?.borradorId || `borrador-${nuevoId()}`);
  const [paso, setPaso] = useState(0);
  const [descripcion, setDescripcion] = useState(() => inicial?.descripcion || ot.descripcion || ot.servicio || '');
  const [fotos, setFotos] = useState(() => inicial?.fotos || []);
  const [vistas, setVistas] = useState({});
  const [subiendo, setSubiendo] = useState(0);
  const [resultado, setResultado] = useState(() => inicial?.resultado || 'conforme');
  const [observaciones, setObservaciones] = useState(() => inicial?.observaciones || '');
  const [cliente, setCliente] = useState(() => inicial?.cliente || { nombre: '', documento: '', cargo: '', correo: '' });
  const [firmaTecnico, setFirmaTecnico] = useState(null);
  const [firmaCliente, setFirmaCliente] = useState(null);
  const [contexto, setContexto] = useState(null);
  const [aviso, setAviso] = useState('');
  const [emitiendo, setEmitiendo] = useState('');
  const [emision, setEmision] = useState(null);
  const [pdf, setPdf] = useState({ estado: 'pendiente', blob: null, error: '' });
  const [correo, setCorreo] = useState({ estado: 'pendiente', error: '' });
  const headingRef = useRef(null);

  const regla = useMemo(() => reglaCierreOT(partes, ot), [partes, ot]);
  const resumen = useMemo(() => resumenPartes(partes), [partes]);
  const tareasCompletas = tareas.filter(tareaCompleta).length;
  const tipoCobro = tipoCobroOT(ot, contexto?.os);
  const mensual = tipoCobro === 'recurrente_mensual';
  const soloLectura = !sesion?.permiteEscritura;

  const estado = { reglaCierre: regla, descripcion, fotos, subiendoFotos: subiendo > 0, resultado, observaciones, cliente, firmaTecnico, firmaCliente };
  const falta = emision ? '' : faltantePaso(paso, estado);

  useEffect(() => {
    let vigente = true;
    cargarContextoActa({ empresaId, ot }).then(ctx => {
      if (!vigente) return;
      setContexto(ctx);
      setCliente(actual => ({
        ...actual,
        correo: actual.correo || ctx.correoContacto || '',
        nombre: actual.nombre || ctx.contactoNombre || '',
        cargo: actual.cargo || ctx.contactoCargo || '',
      }));
    }).catch(() => vigente && setContexto({}));
    return () => { vigente = false; };
  }, [empresaId, ot]);

  // Vistas previas de las fotos que vienen del borrador (ya subidas).
  useEffect(() => {
    const sinVista = fotos.filter(foto => !vistas[foto.path]).map(foto => foto.path);
    if (!sinVista.length) return;
    urlsFirmadasActa(sinVista).then(mapa => setVistas(actual => ({ ...actual, ...Object.fromEntries(mapa) }))).catch(() => {});
  }, [fotos, vistas]);

  useEffect(() => {
    if (emision) return;
    escribirLocal(claveBorrador, serializarBorrador({ borradorId, descripcion, resultado, observaciones, cliente, fotos }));
  }, [claveBorrador, borradorId, descripcion, resultado, observaciones, cliente, fotos, emision]);

  useEffect(() => { headingRef.current?.focus?.(); }, [paso]);

  const irA = destino => {
    if (emision || destino < 0 || destino > PASO_REVISION) return;
    if (destino > paso && pasoBloqueado(destino, estado)) return;
    setAviso('');
    setPaso(destino);
    globalThis.scrollTo?.({ top: 0 });
  };

  const agregarFoto = async (tipo, archivo) => {
    if (!archivo) return;
    if (contarFotos(fotos).total >= MAX_FOTOS_ACTA) { setAviso(`El acta admite hasta ${MAX_FOTOS_ACTA} fotos.`); return; }
    setAviso('');
    setSubiendo(n => n + 1);
    const vista = URL.createObjectURL(archivo);
    try {
      const geo = await obtenerUbicacion({ timeoutMs: 5000 });
      const foto = await subirFotoActa({ empresaId, otId: ot.id, borradorId, tipo, archivo, geo });
      setVistas(actual => ({ ...actual, [foto.path]: vista }));
      setFotos(actual => [...actual, foto]);
    } catch (error) {
      URL.revokeObjectURL(vista);
      setAviso(mensajeErrorActa(error));
    } finally {
      setSubiendo(n => n - 1);
    }
  };

  const quitarFoto = async foto => {
    setFotos(actual => actual.filter(f => f.path !== foto.path));
    try { await quitarFotoBorrador(foto.path); } catch { /* el archivo huérfano no afecta el acta */ }
  };

  const generarYGuardarPdf = useCallback(async datosEmision => {
    setPdf({ estado: 'generando', blob: null, error: '' });
    try {
      const snapshot = datosEmision.snapshot;
      const rutasFotos = (snapshot.evidencias || []).map(f => f.path);
      const firmasSnap = snapshot.firmas || [];
      const mapa = await urlsFirmadasActa([...rutasFotos, ...firmasSnap.map(f => f.path)], 600).catch(() => new Map());
      const fotosData = {};
      await Promise.all(rutasFotos.map(async ruta => {
        try { if (mapa.get(ruta)) fotosData[ruta] = await descargarComoDataUrl(mapa.get(ruta)); } catch { /* foto omitida */ }
      }));
      const firmasData = {};
      await Promise.all(firmasSnap.map(async firma => {
        const local = firma.rol === 'tecnico' ? datosEmision.firmasLocales?.tecnico : datosEmision.firmasLocales?.cliente;
        if (local) { firmasData[firma.rol] = local; return; }
        try { if (mapa.get(firma.path)) firmasData[firma.rol] = await descargarComoDataUrl(mapa.get(firma.path)); } catch { /* firma omitida */ }
      }));
      let logo = null;
      if (snapshot.emisor?.logo_url) { try { logo = await descargarComoDataUrl(snapshot.emisor.logo_url); } catch { logo = null; } }
      const { generarPdfActa } = await import('./ActaConformidadPdf.jsx');
      const blob = await generarPdfActa(snapshot, { logo, fotos: fotosData, firmas: firmasData });
      await guardarPdfActa({ empresaId, otId: ot.id, cierreId: datosEmision.cierre_id, numero: datosEmision.acta_numero, blob });
      setPdf({ estado: 'listo', blob, error: '' });
      return true;
    } catch (error) {
      setPdf({ estado: 'error', blob: null, error: mensajeErrorActa(error) });
      return false;
    }
  }, [empresaId, ot.id]);

  const enviarCorreo = useCallback(async datosEmision => {
    setCorreo({ estado: 'enviando', error: '' });
    try {
      await enviarCorreoActa({ empresaId, cierreId: datosEmision.cierre_id });
      setCorreo({ estado: 'enviado', error: '' });
    } catch (error) {
      setCorreo({ estado: 'error', error: mensajeErrorActa(error) });
    }
  }, [empresaId]);

  const emitir = async () => {
    if (soloLectura || emitiendo) return;
    const pendiente = [0, 1, 2, 3, 4].find(p => faltantePaso(p, estado));
    if (pendiente !== undefined) { setPaso(pendiente); setAviso(faltantePaso(pendiente, estado)); return; }
    setAviso('');
    try {
      setEmitiendo('Registrando ubicación…');
      const geo = await obtenerUbicacion();
      const dispositivo = datosDispositivo();
      setEmitiendo('Guardando firmas…');
      const firmaTec = await subirFirmaActa({ empresaId, otId: ot.id, borradorId, rol: 'tecnico', dataUrl: firmaTecnico, dispositivo, geo });
      const firmaCli = resultado === 'pendiente' ? null : await subirFirmaActa({ empresaId, otId: ot.id, borradorId, rol: 'cliente', dataUrl: firmaCliente, dispositivo, geo });
      setEmitiendo('Emitiendo el acta…');
      const datos = construirDatosActa(estado, { tareas, firmaTecnico: firmaTec, firmaCliente: firmaCli });
      const respuesta = await emitirActa({ empresaId, otId: ot.id, datos });
      const datosEmision = { ...respuesta, firmasLocales: { tecnico: firmaTecnico, cliente: firmaCliente } };
      borrarLocal(claveBorrador);
      setEmision(datosEmision);
      onEmitida?.(respuesta);
      setEmitiendo('Generando el PDF…');
      const pdfOk = await generarYGuardarPdf(datosEmision);
      setEmitiendo('Enviando el correo…');
      if (pdfOk || resultado === 'pendiente') await enviarCorreo(datosEmision);
      else setCorreo({ estado: 'error', error: 'El correo se envía cuando el PDF esté guardado.' });
    } catch (error) {
      setAviso(mensajeErrorActa(error));
    } finally {
      setEmitiendo('');
    }
  };

  const descargarPdf = () => {
    if (!pdf.blob) return;
    const url = URL.createObjectURL(pdf.blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `Acta-${emision?.acta_numero || ot.numero || 'conformidad'}.pdf`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const pasoActual = emision ? PASOS_ACTA.length : paso;
  const correoMostrado = cliente.correo?.trim();
  const nombreTecnico = contexto?.tecnico?.nombre || 'Técnico responsable';
  const estadoOT = emision ? { clase: 'is-green', texto: 'Cerrada' } : { clase: 'is-amber', texto: ot.estado === 'pendiente_cierre' ? 'Pendiente de cierre' : 'En ejecución' };
  const clienteNombre = contexto?.cliente?.razon_social || contexto?.cliente?.nombre_comercial || '';

  return (
    <section className="dx-ui dx-acta" aria-labelledby="dx-acta-titulo">
      <button type="button" className="dx-acta-back" onClick={onVolver}>← Volver a cierres</button>
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Cierre técnico · Acta de conformidad</div>
          <h1 className="dx-ui-title" id="dx-acta-titulo">{ot.numero || ot.id}</h1>
          <p className="dx-ui-sub">{[ot.servicio || ot.descripcion, clienteNombre].filter(Boolean).join(' · ')}</p>
          <div className="dx-acta-tags">
            <span className={`dx-ui-pill ${mensual ? 'is-violet' : 'is-cyan'}`}><i />{etiquetaTipoCobro(tipoCobro)}</span>
            <span className={`dx-ui-pill ${estadoOT.clase}`}><i />{estadoOT.texto}</span>
          </div>
        </div>
      </header>

      {soloLectura && <div className="dx-acta-note is-amber" role="status">Vista de solo lectura: tu contexto actual no permite emitir actas.</div>}

      <div className="dx-acta-wrap">
        <nav className="dx-acta-steps" aria-label="Pasos del acta">
          {PASOS_ACTA.map((nombre, indice) => {
            const hecho = (indice < pasoActual) && !faltantePaso(indice, estado);
            return (
              <button
                key={nombre}
                type="button"
                className={`dx-acta-step${hecho ? ' is-done' : ''}`}
                aria-current={indice === pasoActual ? 'step' : undefined}
                aria-label={`Paso ${indice + 1}: ${nombre}${hecho ? ' (completo)' : ''}`}
                disabled={Boolean(emision) || (indice > paso && pasoBloqueado(indice, estado))}
                onClick={() => irA(indice)}
              >
                <span className="dx-acta-num">{hecho ? <IconoCheck /> : indice + 1}</span>
                <span>{nombre}</span>
              </button>
            );
          })}
        </nav>
        <div className="dx-acta-compact" aria-live="polite">
          {emision ? 'Acta emitida' : `Paso ${paso + 1} de ${PASOS_ACTA.length} · ${PASOS_ACTA[paso]}`}
          {!emision && <div className="dx-acta-bar"><i style={{ width: `${((paso + 1) / PASOS_ACTA.length) * 100}%` }} /></div>}
        </div>

        {aviso && <div className="dx-acta-alert" role="alert">{aviso}</div>}

        {!emision && paso === 0 && (
          <div className="dx-ui-card dx-acta-panel">
            <div className="dx-acta-meta">
              <div><small>Cliente</small><span>{clienteNombre || '—'}</span></div>
              <div><small>{mensual ? 'Periodo' : 'Fecha de ejecución'}</small><span>{resumen.fechaInicio && resumen.fechaFin && resumen.fechaInicio !== resumen.fechaFin ? `${formatoFecha(resumen.fechaInicio)} – ${formatoFecha(resumen.fechaFin)}` : formatoFecha(resumen.fechaFin || ot.fecha_programada)}</span></div>
              <div><small>Lugar</small><span>{ot.direccion_ejecucion || '—'}</span></div>
              <div><small>Técnico responsable</small><span>{nombreTecnico}</span></div>
              <div><small>OS cliente</small><span>{contexto?.os?.numero || '—'}</span></div>
              <div><small>Contacto del cliente</small><span>{contexto?.contactoNombre || '—'}</span></div>
            </div>
            <div className="dx-acta-heading"><h2 ref={headingRef} tabIndex={-1}>Resumen del trabajo</h2><p>Se arma con los partes diarios aprobados y las tareas de la OT.</p></div>
            <div className="dx-acta-body">
              {regla.bloqueada && <div className="dx-acta-note is-amber" role="status">{regla.mensaje}. {regla.accion}</div>}
              <div className="dx-acta-kpis">
                <div className="dx-acta-kpi"><b>{resumen.aprobados.length}</b><span>partes aprobados</span></div>
                <div className="dx-acta-kpi"><b>{resumen.horas.toLocaleString('es-PE')}</b><span>horas hombre</span></div>
                <div className="dx-acta-kpi"><b>{tareasCompletas}/{tareas.length}</b><span>tareas completas</span></div>
              </div>
              {tareas.length > 0 && (
                <ul className="dx-acta-list">
                  {tareas.map(tarea => {
                    const completa = tareaCompleta(tarea);
                    return (
                      <li key={tarea.id}>
                        <div><b>{tarea.titulo || 'Tarea'}</b><small>{completa ? 'Completa' : `Avance ${Number(tarea.avance_pct || 0)}%`}{tarea.horas_reales ? ` · ${tarea.horas_reales} h` : ''}</small></div>
                        <span className={`dx-ui-pill ${completa ? 'is-green' : 'is-amber'}`}><i />{completa ? 'Completa' : 'Se cierra incompleta'}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="dx-acta-field is-wide dx-acta-gap">
                <label className="dx-acta-label" htmlFor="dx-acta-desc">Descripción del trabajo realizado *</label>
                <textarea className="dx-acta-input" id="dx-acta-desc" value={descripcion} disabled={soloLectura} onChange={e => setDescripcion(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {!emision && paso === 1 && (
          <div className="dx-ui-card dx-acta-panel">
            <div className="dx-acta-heading"><h2 ref={headingRef} tabIndex={-1}>Fotos del trabajo</h2><p>Mínimo una de antes y una de después; hasta {MAX_FOTOS_ACTA} en total. Cada foto guarda la hora y la ubicación.</p></div>
            <div className="dx-acta-body">
              {['antes', 'despues'].map(tipo => {
                const lista = fotos.filter(foto => foto.tipo === tipo);
                const titulo = tipo === 'antes' ? 'Antes' : 'Después';
                const lleno = contarFotos(fotos).total >= MAX_FOTOS_ACTA;
                return (
                  <div className="dx-acta-photo-group" key={tipo}>
                    <div className="dx-acta-photo-head">
                      <h3>{titulo}</h3>
                      {lista.length ? <span className="dx-ui-pill is-green"><i />{lista.length}</span> : <span className="dx-ui-pill is-amber"><i />Falta</span>}
                    </div>
                    <div className="dx-acta-photos">
                      {lista.map((foto, indice) => (
                        <figure className="dx-acta-photo" key={foto.path}>
                          {vistas[foto.path] ? <img src={vistas[foto.path]} alt={`Foto ${titulo.toLowerCase()} ${indice + 1}`} /> : <span className="dx-acta-photo-wait">Cargando…</span>}
                          <figcaption>{formatoFechaHora(foto.tomada_en)}{foto.geo ? ' · GPS ✓' : ''}</figcaption>
                          {!soloLectura && <button type="button" aria-label={`Quitar foto ${titulo.toLowerCase()} ${indice + 1}`} onClick={() => quitarFoto(foto)}>×</button>}
                        </figure>
                      ))}
                      {!lleno && !soloLectura && (
                        <label className="dx-acta-add">
                          <IconoCamara />
                          {subiendo > 0 ? 'Subiendo…' : 'Tomar foto'}
                          <input type="file" accept="image/*" capture="environment" aria-label={`Tomar foto ${titulo.toLowerCase()}`} onChange={e => { const archivo = e.target.files?.[0]; e.target.value = ''; agregarFoto(tipo, archivo); }} />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="dx-acta-note">Las fotos se guardan en un almacenamiento privado y solo se comparten dentro del acta.</div>
            </div>
          </div>
        )}

        {!emision && paso === 2 && (
          <div className="dx-ui-card dx-acta-panel">
            <div className="dx-acta-heading"><h2 ref={headingRef} tabIndex={-1}>Conformidad del cliente</h2><p>El cliente revisa el trabajo en sitio antes de firmar.</p></div>
            <div className="dx-acta-body">
              <div className="dx-acta-choices" role="radiogroup" aria-label="Resultado de la conformidad">
                {RESULTADOS.map(opcion => (
                  <label className={`dx-acta-choice${resultado === opcion.valor ? ' is-on' : ''}`} key={opcion.valor}>
                    <input type="radio" name="dx-acta-resultado" value={opcion.valor} checked={resultado === opcion.valor} disabled={soloLectura} onChange={() => setResultado(opcion.valor)} />
                    <div><b>{opcion.titulo}</b><small>{opcion.detalle}</small></div>
                  </label>
                ))}
              </div>
              <div className="dx-acta-field is-wide dx-acta-gap">
                <label className="dx-acta-label" htmlFor="dx-acta-obs">{resultado === 'pendiente' ? 'Motivo por el que el cliente no firma *' : resultado === 'observaciones' ? 'Observaciones del cliente *' : 'Observaciones (opcional)'}</label>
                <textarea className="dx-acta-input" id="dx-acta-obs" value={observaciones} disabled={soloLectura} placeholder="Escribe lo que el cliente quiera dejar registrado" onChange={e => setObservaciones(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {!emision && paso === 3 && (
          <div className="dx-ui-card dx-acta-panel">
            <div className="dx-acta-heading"><h2 ref={headingRef} tabIndex={-1}>Firma del técnico</h2><p>Firma el técnico responsable de la OT. Sus datos vienen de su ficha de personal.</p></div>
            <div className="dx-acta-body">
              <div className="dx-acta-fields">
                <div className="dx-acta-field"><label className="dx-acta-label" htmlFor="dx-acta-tec-nombre">Nombre</label><input className="dx-acta-input" id="dx-acta-tec-nombre" value={nombreTecnico} readOnly /></div>
                <div className="dx-acta-field"><label className="dx-acta-label" htmlFor="dx-acta-tec-doc">Documento</label><input className="dx-acta-input" id="dx-acta-tec-doc" value={contexto?.tecnico?.documento || '—'} readOnly /></div>
                <div className="dx-acta-field is-wide"><label className="dx-acta-label" htmlFor="dx-acta-tec-cargo">Cargo</label><input className="dx-acta-input" id="dx-acta-tec-cargo" value={contexto?.tecnico?.cargo || '—'} readOnly /></div>
              </div>
              <FirmaTrazo etiqueta="Área de firma del técnico" valor={firmaTecnico} onChange={setFirmaTecnico} deshabilitado={soloLectura} />
            </div>
          </div>
        )}

        {!emision && paso === 4 && (
          <div className="dx-ui-card dx-acta-panel">
            <div className="dx-acta-heading">
              <h2 ref={headingRef} tabIndex={-1}>Firma del cliente</h2>
              <p>{resultado === 'pendiente' ? 'El cliente no firma en sitio: confirma el correo al que se enviará el enlace para firmar.' : 'Pasa el dispositivo al cliente para que complete sus datos y firme.'}</p>
            </div>
            <div className="dx-acta-body">
              <div className="dx-acta-fields">
                {resultado !== 'pendiente' && <>
                  <div className="dx-acta-field"><label className="dx-acta-label" htmlFor="dx-acta-cli-nombre">Nombre completo *</label><input className="dx-acta-input" id="dx-acta-cli-nombre" autoComplete="name" value={cliente.nombre} disabled={soloLectura} onChange={e => setCliente(c => ({ ...c, nombre: e.target.value }))} /></div>
                  <div className="dx-acta-field"><label className="dx-acta-label" htmlFor="dx-acta-cli-doc">DNI o documento *</label><input className="dx-acta-input" id="dx-acta-cli-doc" inputMode="numeric" maxLength={15} value={cliente.documento} disabled={soloLectura} onChange={e => setCliente(c => ({ ...c, documento: e.target.value.replace(/\s/g, '') }))} /></div>
                  <div className="dx-acta-field"><label className="dx-acta-label" htmlFor="dx-acta-cli-cargo">Cargo</label><input className="dx-acta-input" id="dx-acta-cli-cargo" value={cliente.cargo} disabled={soloLectura} onChange={e => setCliente(c => ({ ...c, cargo: e.target.value }))} /></div>
                </>}
                <div className={`dx-acta-field${resultado === 'pendiente' ? ' is-wide' : ''}`}>
                  <label className="dx-acta-label" htmlFor="dx-acta-cli-mail">{resultado === 'pendiente' ? 'Correo para enviar el enlace *' : 'Correo para recibir el acta *'}</label>
                  <input className="dx-acta-input" id="dx-acta-cli-mail" type="email" inputMode="email" autoComplete="email" value={cliente.correo} disabled={soloLectura} onChange={e => setCliente(c => ({ ...c, correo: e.target.value.trim() }))} />
                  <span className="dx-acta-hint">{contexto?.correoContacto ? 'Precargado del contacto del cliente; se puede corregir.' : 'Escribe el correo del cliente.'}</span>
                </div>
              </div>
              {resultado !== 'pendiente' && <>
                <FirmaTrazo etiqueta="Área de firma del cliente" valor={firmaCliente} onChange={setFirmaCliente} deshabilitado={soloLectura} />
                <p className="dx-acta-hint">Al firmar, el cliente acepta el contenido del acta.</p>
              </>}
            </div>
          </div>
        )}

        {!emision && paso === PASO_REVISION && (
          <div className="dx-ui-card dx-acta-panel">
            <div className="dx-acta-heading"><h2 ref={headingRef} tabIndex={-1}>Revisa y emite el acta</h2><p>Después de emitir, la OT se cierra y el acta, sus firmas y sus fotos quedan bloqueadas.</p></div>
            <div className="dx-acta-body">
              <div className="dx-acta-review">
                {[
                  ['Trabajo', descripcion.trim(), 0],
                  ['Fotos', `${contarFotos(fotos).antes} de antes · ${contarFotos(fotos).despues} de después`, 1],
                  ['Conformidad', `${RESULTADOS.find(r => r.valor === resultado)?.titulo}${observaciones.trim() ? ` — ${observaciones.trim()}` : ''}`, 2],
                  ['Técnico', <>{firmaTecnico && <img alt="Firma del técnico" src={firmaTecnico} />}{nombreTecnico}</>, 3],
                  ['Cliente', resultado === 'pendiente' ? `Sin firma en sitio · enlace a ${correoMostrado}` : <>{firmaCliente && <img alt="Firma del cliente" src={firmaCliente} />}{`${cliente.nombre.trim()} · Doc. ${cliente.documento.trim()}`}</>, 4],
                ].map(([titulo, valor, destino]) => (
                  <div className="dx-acta-review-row" key={titulo}>
                    <strong>{titulo}</strong>
                    <span>{valor}</span>
                    <button type="button" className="dx-acta-link" onClick={() => irA(destino)} disabled={Boolean(emitiendo)}>Editar</button>
                  </div>
                ))}
              </div>
              <div className="dx-acta-device">
                <b>Datos que quedan registrados en el acta</b>
                <dl>
                  <dt>Dispositivo</dt><dd>{datosDispositivo().plataforma || '—'} · {datosDispositivo().pantalla || '—'}</dd>
                  <dt>Idioma y zona</dt><dd>{datosDispositivo().idioma || '—'} · {datosDispositivo().zona_horaria || '—'}</dd>
                  <dt>Ubicación</dt><dd>Se pide al emitir (permiso del navegador)</dd>
                  <dt>IP y hora oficial</dt><dd>Las registra el servidor al emitir</dd>
                </dl>
              </div>
              <div className={`dx-acta-note${resultado === 'pendiente' ? ' is-amber' : ''}`}>
                {resultado === 'pendiente'
                  ? `Al emitir, la OT se cierra con la conformidad pendiente y se envía a ${correoMostrado} un enlace para firmar, válido por 7 días.`
                  : `Al emitir, la OT se cierra y se envía el PDF del acta a ${correoMostrado}.`}
              </div>
            </div>
          </div>
        )}

        {emision && (
          <div className="dx-ui-card dx-acta-panel">
            <div className="dx-acta-done">
              <div className="dx-ui-icon dx-acta-done-icon"><IconoCheck size={28} /></div>
              <h2 ref={headingRef} tabIndex={-1}>Acta {emision.acta_numero} emitida</h2>
              <p>{emision.conformidad_resultado === 'pendiente' ? 'La OT quedó cerrada con la conformidad pendiente.' : 'La OT quedó cerrada con la conformidad del cliente.'}</p>
              <p className="dx-acta-hint">Emitida el {formatoFechaHora(emision.emitida_en)}</p>
              <ul className="dx-acta-status" aria-live="polite">
                <li className={`is-${pdf.estado}`}>
                  <b>PDF del acta</b>
                  <span>{pdf.estado === 'listo' ? 'Guardado' : pdf.estado === 'generando' ? 'Generando…' : pdf.estado === 'error' ? pdf.error : 'Pendiente'}</span>
                </li>
                <li className={`is-${correo.estado}`}>
                  <b>Correo al cliente</b>
                  <span>{correo.estado === 'enviado' ? `Enviado a ${enmascararCorreo(correoMostrado)}` : correo.estado === 'enviando' ? 'Enviando…' : correo.estado === 'error' ? correo.error : 'Pendiente'}</span>
                </li>
              </ul>
              <div className="dx-ui-actions dx-acta-done-actions">
                {pdf.estado === 'listo' && <button type="button" className="dx-btn primary" onClick={descargarPdf}>Descargar PDF</button>}
                {pdf.estado === 'error' && <button type="button" className="dx-btn primary" disabled={Boolean(emitiendo)} onClick={async () => { const ok = await generarYGuardarPdf(emision); if (ok && correo.estado !== 'enviado') enviarCorreo(emision); }}>Reintentar PDF</button>}
                {correo.estado === 'error' && (pdf.estado === 'listo' || emision.conformidad_resultado === 'pendiente') && <button type="button" className="dx-btn" onClick={() => enviarCorreo(emision)}>Reenviar correo</button>}
                <button type="button" className="dx-btn" onClick={onVolver}>Volver a cierres</button>
              </div>
            </div>
          </div>
        )}

        {!emision && (
          <footer className="dx-acta-foot">
            <span className={`dx-acta-foot-msg${falta ? ' is-pending' : ''}`}>{emitiendo || falta || (paso === PASO_REVISION ? 'Todo listo para emitir.' : 'Paso completo.')}</span>
            <button type="button" className="dx-btn" disabled={paso === 0 || Boolean(emitiendo)} onClick={() => irA(paso - 1)}>Atrás</button>
            {paso < PASO_REVISION
              ? <button type="button" className="dx-btn primary" disabled={Boolean(falta)} onClick={() => irA(paso + 1)}>Siguiente</button>
              : <button type="button" className="dx-btn primary" disabled={Boolean(falta) || Boolean(emitiendo) || soloLectura} onClick={emitir}>{emitiendo ? 'Emitiendo…' : resultado === 'pendiente' ? 'Cerrar OT y enviar enlace' : 'Emitir acta y enviar'}</button>}
          </footer>
        )}
      </div>
    </section>
  );
}

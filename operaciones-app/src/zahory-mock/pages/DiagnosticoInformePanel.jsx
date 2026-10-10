import React, { useEffect, useMemo, useState } from 'react';
import { actualizarOpciones, emitirInformeDiagnostico, generarConclusionIA, obtenerIdentidadEmpresa, obtenerInformeVigente, obtenerOCrearBorrador, OPCIONES_INFORME_POR_DEFECTO, usuarioPuedeInforme } from '../../services/diagnosticoInformeService.js';
import { construirVistaInforme } from './informeSnapshot.js';
import { InformeHoja } from './InformeHoja.jsx';
import { firmarRutasFotosHallazgos, listarFotosHallazgos } from '../../services/diagnosticoHallazgoFotosService.js';
import { ejecutarEmisionInformeDosPasos, obtenerMotivoEmisionInforme } from '../../services/emisionInformeFlujo.js';
import { listarEmisoresConFirma, obtenerFirmaPersonaParaVista, preseleccionarPersonaVinculada, seleccionarEmisorPersona } from '../../services/emisorPersonal.js';
import { getSupabaseClient } from '../../lib/supabaseClient.js';

const normalize = options => ({ ...OPCIONES_INFORME_POR_DEFECTO, ...(options || {}) });

export function DiagnosticoInformePanel({ diagnostico, catalogos, cabecera, puedeVer = true, puedeEditar = false, puedeEmitirDiagnostico = false, firmaUrl = null, onEmitirDiagnostico, onRecargarDiagnostico, cambiosSinGuardar = false, resumenPendiente = false, onResumenChange, onGuardarResumen, onGuardarDiagnosticoPendiente, onClose }) {
  const [informe, setInforme] = useState(null);
  const [borrador, setBorrador] = useState(null);
  const [emitidos, setEmitidos] = useState([]);
  const [opcionesGuardadas, setOpcionesGuardadas] = useState(normalize());
  const [opciones, setOpciones] = useState(normalize());
  const [seleccionVersion, setSeleccionVersion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [identidadEmpresa, setIdentidadEmpresa] = useState(null);
  const [identidadCargada, setIdentidadCargada] = useState(false);
  const [emisoresPersona, setEmisoresPersona] = useState([]);
  const [emisoresCargados, setEmisoresCargados] = useState(false);
  const [emisorPersonaId, setEmisorPersonaId] = useState(null);
  const [firmaPersonaUrl, setFirmaPersonaUrl] = useState(null);
  const [firmaPersonaEstado, setFirmaPersonaEstado] = useState('idle');
  const [firmaEmitidaUrl, setFirmaEmitidaUrl] = useState(null);
  const [permisoAprobar, setPermisoAprobar] = useState(false);
  const [fotosPorHallazgo, setFotosPorHallazgo] = useState(() => new Map());
  const [snapshotEmitidoVista, setSnapshotEmitidoVista] = useState(null);
  const [errorFotos, setErrorFotos] = useState(false);
  const [generandoIA, setGenerandoIA] = useState(false);
  const [iaError, setIaError] = useState('');
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false);
  const [confirmarEmision, setConfirmarEmision] = useState(false);
  const [emisorNombre, setEmisorNombre] = useState('');
  const [emisorCargo, setEmisorCargo] = useState('');
  const [emitiendo, setEmitiendo] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  useEffect(() => {
    let active = true;
    setPermisoAprobar(false);
    setIdentidadCargada(false);
    if (!informe?.empresa_id) { setIdentidadEmpresa(null); setIdentidadCargada(true); return () => { active = false; }; }
    obtenerIdentidadEmpresa(informe.empresa_id).then(value => { if (active) {
      setIdentidadEmpresa(value);
      setIdentidadCargada(true);
    } }).catch(() => { if (active) { setIdentidadEmpresa(null); setIdentidadCargada(true); } });
    usuarioPuedeInforme(informe.empresa_id, 'aprobar').then(value => { if (active) setPermisoAprobar(value); }).catch(() => { if (active) setPermisoAprobar(false); });
    return () => { active = false; };
  }, [informe?.empresa_id]);

  useEffect(() => {
    let active = true;
    setEmisoresCargados(false);
    setEmisoresPersona([]);
    setEmisorPersonaId(null);
    if (!informe?.empresa_id) { setEmisoresCargados(true); return () => { active = false; }; }
    (async () => {
      try {
        const [personas, userResult] = await Promise.all([
          listarEmisoresConFirma(informe.empresa_id),
          getSupabaseClient().auth.getUser(),
        ]);
        if (!active) return;
        setEmisoresPersona(personas);
        setEmisorPersonaId(preseleccionarPersonaVinculada(personas, userResult.data?.user?.id));
      } catch {
        if (active) setEmisoresPersona([]);
      } finally { if (active) setEmisoresCargados(true); }
    })();
    return () => { active = false; };
  }, [informe?.empresa_id]);

  const emisorSeleccionado = useMemo(() => seleccionarEmisorPersona(emisoresPersona, emisorPersonaId, identidadEmpresa), [emisoresPersona, emisorPersonaId, identidadEmpresa]);
  useEffect(() => {
    let active = true;
    setFirmaPersonaUrl(null);
    setFirmaPersonaEstado(emisorSeleccionado.fuente === 'persona' ? 'cargando' : 'idle');
    if (emisorSeleccionado.fuente !== 'persona') return () => { active = false; };
    obtenerFirmaPersonaParaVista(emisorSeleccionado.persona)
      .then(url => { if (active) { setFirmaPersonaUrl(url); setFirmaPersonaEstado(url ? 'lista' : 'error'); } })
      .catch(() => { if (active) { setFirmaPersonaUrl(null); setFirmaPersonaEstado('error'); } });
    return () => { active = false; };
  }, [emisorSeleccionado.persona]);

  useEffect(() => {
    let active = true;
    const emisorSnapshot = seleccionVersion?.estado === 'emitido' ? seleccionVersion.snapshot?.emisor : null;
    setFirmaEmitidaUrl(emisorSnapshot?.firma_url || null);
    if (!emisorSnapshot?.persona_id) return () => { active = false; };
    const persona = emisoresPersona.find(item => String(item.id) === String(emisorSnapshot.persona_id));
    if (!persona) return () => { active = false; };
    obtenerFirmaPersonaParaVista(persona).then(url => { if (active && url) setFirmaEmitidaUrl(url); }).catch(() => {});
    return () => { active = false; };
  }, [seleccionVersion, emisoresPersona]);

  const idsHallazgosIncluidos = useMemo(() => (diagnostico?.hallazgos || diagnostico?.diagnostico_tecnico_hallazgos || [])
    .filter(item => item.incluir_en_informe === true && !(opciones.ocultar_conformes && item.condicion === 'conforme'))
    .map(item => item.id || item.hallazgo_id)
    .filter(Boolean), [diagnostico, opciones.ocultar_conformes]);
  const idsHallazgosKey = idsHallazgosIncluidos.join('|');

  useEffect(() => {
    let active = true;
    const ids = idsHallazgosKey ? idsHallazgosKey.split('|') : [];
    setFotosPorHallazgo(new Map());
    setErrorFotos(false);
    if (!informe?.empresa_id || !ids.length) return () => { active = false; };
    listarFotosHallazgos(informe.empresa_id, ids).then(fotos => {
      if (!active) return;
      const agrupadas = new Map();
      fotos.forEach(foto => {
        const grupo = agrupadas.get(foto.hallazgo_id) || [];
        grupo.push(foto);
        agrupadas.set(foto.hallazgo_id, grupo);
      });
      setFotosPorHallazgo(agrupadas);
    }).catch(() => { if (active) { setFotosPorHallazgo(new Map()); setErrorFotos(true); } });
    return () => { active = false; };
  }, [informe?.empresa_id, idsHallazgosKey]);

  useEffect(() => {
    let active = true;
    const snapshot = seleccionVersion?.estado === 'emitido' ? seleccionVersion.snapshot : null;
    setSnapshotEmitidoVista(null);
    if (!snapshot) return () => { active = false; };
    setErrorFotos(false);
    const hallazgos = snapshot.hallazgos || [];
    const fotos = hallazgos.flatMap(hallazgo => hallazgo.fotos || []);
    const rutas = [...new Set(fotos.map(foto => foto.ruta_storage).filter(Boolean))];
    if (!rutas.length) return () => { active = false; };
    firmarRutasFotosHallazgos(rutas).then(firmas => {
      if (!active) return;
      const snapshotVista = {
        ...snapshot,
        hallazgos: hallazgos.map(hallazgo => ({
          ...hallazgo,
          fotos: (hallazgo.fotos || []).map(foto => {
            const url = firmas.get(foto.ruta_storage);
            if (!url) throw new Error('No se pudo firmar una foto del informe.');
            return { ...foto, url };
          }),
        })),
      };
      setSnapshotEmitidoVista(snapshotVista);
    }).catch(() => {
      if (!active) return;
      setSnapshotEmitidoVista({ ...snapshot, hallazgos: hallazgos.map(hallazgo => ({ ...hallazgo, fotos: [] })) });
      setErrorFotos(true);
    });
    return () => { active = false; };
  }, [seleccionVersion]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = puedeEditar
          ? await Promise.all([obtenerOCrearBorrador(diagnostico.recepcion_id), obtenerInformeVigente(diagnostico.recepcion_id)])
          : await obtenerInformeVigente(diagnostico.recepcion_id);
        if (!active) return;
        if (puedeEditar) {
          const [draft, current] = result;
          setInforme(draft);
          setBorrador(draft);
          setOpcionesGuardadas(normalize(draft?.opciones));
          setOpciones(normalize(draft?.opciones));
          setEmitidos(current.emitidos || []);
        } else {
          const draft = result.borrador;
          const first = draft || result.emitidos[0] || null;
          setInforme(first);
          setBorrador(draft);
          setOpcionesGuardadas(normalize(first?.opciones));
          setOpciones(normalize(first?.opciones));
          setEmitidos(result.emitidos || []);
          setSeleccionVersion(first?.estado === 'emitido' ? first : null);
        }
      } catch (loadError) { if (active) setError(loadError.message || 'No se pudo cargar el informe.'); }
      finally { if (active) setCargando(false); }
    })();
    return () => { active = false; };
  }, [diagnostico.recepcion_id, puedeEditar]);

  const isEditable = Boolean(puedeEditar && borrador?.estado === 'borrador' && !seleccionVersion);
  const esMantenimiento = diagnostico?.tipo === 'mantenimiento';
  const textoConclusion = esMantenimiento ? (diagnostico?.resumen_diagnostico || '') : (opciones.conclusion || '');
  const conclusionModificada = esMantenimiento ? resumenPendiente : opciones.conclusion !== opcionesGuardadas.conclusion;
  const conclusionSinConfirmar = !String(textoConclusion).trim() || !opciones.conclusion_confirmada || conclusionModificada;
  const opcionesPendientes = JSON.stringify(opciones) !== JSON.stringify(opcionesGuardadas);
  const motivoEmision = obtenerMotivoEmisionInforme({ textoConclusion, conclusionConfirmada: opciones.conclusion_confirmada, conclusionModificada, permisoInforme: permisoAprobar, permisoDiagnostico: diagnostico?.estado !== 'borrador' || puedeEmitirDiagnostico });
  const motivoCambiosSinGuardar = cambiosSinGuardar ? 'Hay cambios sin guardar; se guardar\u00e1n antes de emitir.' : '';
  const emisionBloqueada = Boolean(motivoEmision);
  const effectiveSnapshot = useMemo(() => {
    const base = seleccionVersion?.snapshot ? (snapshotEmitidoVista || seleccionVersion.snapshot) : construirVistaInforme(diagnostico, opciones, catalogos, cabecera, fotosPorHallazgo);
    const firmaActiva = seleccionVersion?.estado === 'emitido'
      ? (firmaEmitidaUrl || base?.emisor?.firma_url || firmaUrl || null)
      : (emisorSeleccionado.fuente === 'persona' ? firmaPersonaUrl : emisorSeleccionado.firma || firmaUrl || null);
    return { ...base, emisor: {
      ...(base?.emisor || {}),
      ...(seleccionVersion?.estado !== 'emitido' ? { nombre: emisorSeleccionado.nombre || null, cargo: emisorSeleccionado.cargo || null } : {}),
      firma_url: firmaActiva,
    } };
  }, [seleccionVersion, snapshotEmitidoVista, diagnostico, opciones, catalogos, cabecera, fotosPorHallazgo, firmaUrl, emisorSeleccionado, firmaPersonaUrl, firmaEmitidaUrl]);
  const patch = (key, value) => { setSeleccionVersion(null); setOpciones(current => ({ ...current, [key]: value })); };

  const generarIA = async () => {
    if (!isEditable || generandoIA) return;
    setGenerandoIA(true); setIaError(''); setConfirmarReemplazo(false);
    try {
      if (cambiosSinGuardar && onGuardarDiagnosticoPendiente) await onGuardarDiagnosticoPendiente();
      await obtenerOCrearBorrador(diagnostico.recepcion_id);
      const result = await generarConclusionIA(diagnostico.id);
      if (esMantenimiento) {
        onResumenChange?.(result.conclusion, 'editado');
        setOpciones(current => ({ ...current, conclusion_confirmada: false }));
      } else setOpciones(current => ({ ...current, conclusion: result.conclusion, conclusion_origen: 'ia', conclusion_confirmada: false }));
      setSeleccionVersion(null);
      setAviso(esMantenimiento ? 'Redacción mejorada. Revísala y guarda el diagnóstico para poder confirmarlo.' : 'Conclusión generada. Revísala y guárdala para poder confirmarla.');
    } catch (generationError) { setIaError(generationError.message || 'No se pudo generar la conclusión.'); }
    finally { setGenerandoIA(false); }
  };

  const guardar = async ({ silencioso = false } = {}) => {
    if (!isEditable || guardando) return false;
    setGuardando(true); setError(''); setAviso('');
    try {
      if (esMantenimiento && resumenPendiente && onGuardarResumen) await onGuardarResumen();
      const opcionesAGuardar = esMantenimiento && resumenPendiente ? { ...opciones, conclusion_confirmada: false } : opciones;
      const saved = await actualizarOpciones(informe.id, opcionesAGuardar);
      const next = normalize(saved.opciones);
      setInforme(saved); setBorrador(saved); setOpcionesGuardadas(next); setOpciones(next);
      if (!silencioso) setAviso('Borrador guardado.');
      return true;
    } catch (saveError) { setError(saveError.message || 'No se pudo guardar el borrador.'); return false; }
    finally { setGuardando(false); }
  };

  const emitir = async () => {
    const emisor = seleccionarEmisorPersona(emisoresPersona, emisorPersonaId, identidadEmpresa);
    if ((emisoresPersona.length && !emisorPersonaId) || (emisor.fuente === 'persona' && !firmaPersonaUrl)) return;
    const nombreFinal = emisor.fuente === 'manual' ? String(emisorNombre || '').trim() : String(emisor.nombre || '').trim();
    const cargoFinal = emisor.fuente === 'manual' ? emisorCargo : emisor.cargo;
    if (!isEditable || emitiendo || !nombreFinal || emisionBloqueada || (diagnostico.estado === 'borrador' && !puedeEmitirDiagnostico)) return;
    setEmitiendo(true); setError(''); setAviso('');
    try {
      const issued = await ejecutarEmisionInformeDosPasos({
        estadoDiagnostico: diagnostico.estado,
        guardarPendiente: async () => {
          if (cambiosSinGuardar) await onGuardarDiagnosticoPendiente?.();
          if (opcionesPendientes) {
            const saved = await guardar({ silencioso: true });
            if (!saved) throw new Error('No se pudieron guardar las opciones del informe.');
          }
        },
        emitirDiagnostico: () => onEmitirDiagnostico(),
        emitirInforme: () => emitirInformeDiagnostico({ informeId: informe.id, emisorNombre: nombreFinal, emisorCargo: cargoFinal }),
      });
      const current = await obtenerInformeVigente(diagnostico.recepcion_id);
      const selectedRow = (current.emitidos || []).find(row => row.id === issued?.id) || issued;
      const firmaFinal = emisor.fuente === 'persona' ? firmaPersonaUrl : emisor.firma || firmaUrl || null;
      const selected = selectedRow ? { ...selectedRow, snapshot: { ...(selectedRow.snapshot || {}), emisor: { ...(selectedRow.snapshot?.emisor || {}), nombre: nombreFinal, cargo: cargoFinal, firma_url: firmaFinal || null, ...(emisor.fuente === 'persona' ? { persona_id: emisor.persona.id, firma_adjunto_id: emisor.persona.firma_adjunto_id, firma_bucket: emisor.persona.firma_bucket, firma_storage_path: emisor.persona.firma_storage_path } : {}) } } } : selectedRow;
      setEmitidos(current.emitidos || [selected]);
      setBorrador(current.borrador || null);
      setInforme(selected);
      setOpciones(normalize(selected?.opciones));
      setOpcionesGuardadas(normalize(selected?.opciones));
      setSeleccionVersion(selected);
      setConfirmarEmision(false);
      try { await onRecargarDiagnostico?.(); } catch { /* El RPC de emisión terminó; la pantalla puede recargarse al volver a consultar. */ }
      setAviso(`Informe emitido (versi\u00f3n ${selected?.version}).`);
    } catch (issueError) { setError(issueError.message || 'No se pudo emitir el informe.'); }
    finally { setEmitiendo(false); }
  };

  const confirmarConclusion = async event => {
    if (!event.target.checked || !isEditable || conclusionModificada || guardando) return;
    setGuardando(true); setError(''); setAviso('');
    try {
      const saved = await actualizarOpciones(informe.id, { ...opcionesGuardadas, conclusion_confirmada: true });
      const next = normalize(saved.opciones);
      setInforme(saved); setBorrador(saved); setOpcionesGuardadas(next); setOpciones(next); setAviso('Conclusión confirmada.');
    } catch (confirmError) { setError(confirmError.message || 'No se pudo confirmar la conclusión.'); }
    finally { setGuardando(false); }
  };

  const chooseVersion = version => {
    setSeleccionVersion(version);
    if (version) { setInforme(version); setOpciones(normalize(version.opciones)); setOpcionesGuardadas(normalize(version.opciones)); }
    else {
      setInforme(borrador);
      setOpciones(normalize(borrador?.opciones));
      setOpcionesGuardadas(normalize(borrador?.opciones));
    }
  };

  const descargarPdf = async () => {
    const snapshot = seleccionVersion?.estado === 'emitido' ? seleccionVersion.snapshot : null;
    if (!snapshot || generandoPdf) return;
    setGenerandoPdf(true); setError(''); setAviso('');
    let objectUrl = null;
    try {
      const { generarPdfInforme } = await import('./InformePdf.jsx');
      let firmaEmitida = snapshot?.emisor?.firma_url || firmaUrl || null;
      if (snapshot?.emisor?.firma_bucket && snapshot?.emisor?.firma_storage_path) {
        try {
          const { data, error: firmaError } = await getSupabaseClient().storage.from(snapshot.emisor.firma_bucket).createSignedUrl(snapshot.emisor.firma_storage_path, 600);
          if (!firmaError && data?.signedUrl) firmaEmitida = data.signedUrl;
        } catch { /* Usar la URL disponible si el adjunto no se puede renovar. */ }
      }
      const { blob, warnings = [] } = await generarPdfInforme({ ...snapshot, emisor: { ...(snapshot?.emisor || {}), firma_url: firmaEmitida } });
      objectUrl = URL.createObjectURL(blob);
      const recepcion = String(snapshot.cabecera?.numero_recepcion || 'recepcion').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'recepcion';
      const version = String(snapshot.version ?? seleccionVersion.version ?? '1').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-');
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `Informe-diagnostico-${recepcion}-v${version}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (warnings.length) setAviso(`El PDF se generó sin algunas fotos: ${warnings.join(' ')}`);
    } catch (pdfError) {
      setError(pdfError?.message ? `No se pudo generar el PDF: ${pdfError.message}` : 'No se pudo generar el PDF.');
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setGenerandoPdf(false);
    }
  };

  return <div className="dx-inf-overlay" role="dialog" aria-modal="true" aria-labelledby="dx-inf-panel-title">
    <div className="dx-inf-layout">
      <aside className="dx-inf-controls">
        <header className="dx-inf-controls-head"><div><h2 id="dx-inf-panel-title">Informe al cliente</h2><p>Lo emite Comercial. Solo lectura sobre el diagnóstico. Sin precios.</p></div><button type="button" aria-label="Cerrar" onClick={onClose}>×</button></header>
        {informe && <div className={`dx-inf-status ${informe.estado === 'emitido' ? 'is-issued' : ''}`}>{informe.estado === 'emitido' ? `Emitido · v${informe.version}` : 'Borrador'}</div>}
        {cargando ? <p role="status">Cargando informe…</p> : error && !informe ? <div className="dx-inf-error" role="alert">{error}</div> : !informe ? <div className="dx-inf-empty">No hay borrador ni versiones emitidas para esta recepción.</div> : <>
          <fieldset disabled={!isEditable || guardando} className="dx-inf-options">
            <label><input type="checkbox" checked={Boolean(opciones.incluir_mediciones)} onChange={e => patch('incluir_mediciones', e.target.checked)} /> Incluir mediciones</label>
            <label><input type="checkbox" checked={Boolean(opciones.mostrar_horas)} onChange={e => patch('mostrar_horas', e.target.checked)} /> Mostrar horas estimadas</label>
            <label><input type="checkbox" checked={Boolean(opciones.ocultar_conformes)} onChange={e => patch('ocultar_conformes', e.target.checked)} /> Ocultar hallazgos conformes</label>
          </fieldset>
          <div className="dx-inf-conclusion-editor"><label htmlFor="dx-inf-conclusion">Conclusión</label><textarea id="dx-inf-conclusion" rows={5} maxLength={2000} value={textoConclusion} disabled={esMantenimiento || !isEditable || guardando} onChange={e => {
            const changed = e.target.value !== opcionesGuardadas.conclusion;
            patch('conclusion', e.target.value);
            if (changed && opciones.conclusion_confirmada) setOpciones(current => ({ ...current, conclusion_confirmada: false }));
            if (changed && opciones.conclusion_origen === 'ia') setOpciones(current => ({ ...current, conclusion_origen: 'ia_editada' }));
            else if (changed && opciones.conclusion_origen !== 'ia_editada') setOpciones(current => ({ ...current, conclusion_origen: 'manual' }));
          }} /><div className="dx-inf-counter">{textoConclusion.length}/2000</div>
            {(opciones.conclusion_origen === 'ia' || opciones.conclusion_origen === 'ia_editada') && <small className="dx-inf-ai-label">Generado por IA, requiere revisión</small>}
            {esMantenimiento && <small className="dx-inf-ai-label">Este texto se edita en el Diagnóstico</small>}
            {esMantenimiento && !String(textoConclusion).trim() && <small className="dx-inf-missing-diagnosis" role="status">Primero redacta el diagn&#xF3;stico en la pantalla del diagn&#xF3;stico</small>}
            {isEditable && !esMantenimiento && <button type="button" className="dx-inf-ai-button" disabled={generandoIA || guardando} onClick={() => String(textoConclusion).trim() ? setConfirmarReemplazo(true) : generarIA()}>{generandoIA ? 'Generando\u2026' : 'Generar conclusi\u00f3n con IA'}</button>}
            {confirmarReemplazo && <div className="dx-inf-ai-confirm" role="group" aria-label="Confirmar reemplazo de conclusión"><span>La conclusión actual se reemplazará. ¿Continuar?</span><button type="button" onClick={generarIA} disabled={generandoIA}>Sí, reemplazar</button><button type="button" onClick={() => setConfirmarReemplazo(false)}>Cancelar</button></div>}
            {iaError && <div className="dx-inf-error" role="alert">{iaError}</div>}
          </div>
          <label className="dx-inf-confirm"><input type="checkbox" checked={Boolean(opciones.conclusion_confirmada)} disabled={!isEditable || guardando || conclusionModificada} onChange={confirmarConclusion} /> Revisé y confirmo la conclusión</label>
          {Boolean(String(textoConclusion).trim()) && !opciones.conclusion_confirmada && <p className="dx-inf-unconfirmed">No podrá emitirse hasta confirmarla.</p>}
          {isEditable && <button type="button" className="dx-inf-save" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar borrador'}</button>}
          {isEditable && <button type="button" className="dx-informe-emitir" onClick={() => {
            setError(''); setAviso(''); setConfirmarEmision(true);
          }} disabled={guardando || emitiendo || !identidadCargada || !emisoresCargados || !permisoAprobar || emisionBloqueada || (diagnostico.estado === 'borrador' && !puedeEmitirDiagnostico)} title={!permisoAprobar ? 'No tienes permiso para emitir el informe' : diagnostico.estado === 'borrador' && !puedeEmitirDiagnostico ? 'No tienes permiso para emitir el diagn\u00f3stico' : undefined}>{emitiendo ? 'Emitiendo\u2026' : 'Emitir informe'}</button>}
          {isEditable && motivoEmision && <p className="dx-inf-emit-help" role="status">{motivoEmision}</p>}
          {isEditable && !motivoEmision && motivoCambiosSinGuardar && <p className="dx-inf-emit-help" role="status">{motivoCambiosSinGuardar}</p>}
          {seleccionVersion?.estado === 'emitido' && seleccionVersion?.snapshot && <button type="button" className="dx-inf-save" onClick={descargarPdf} disabled={generandoPdf}>{generandoPdf ? 'Generando PDF\u2026' : 'Descargar PDF'}</button>}
          {confirmarEmision && isEditable && <section className="dx-informe-emitir-panel" aria-label="Confirmar emisi\u00f3n">
            {emisoresPersona.length > 0 ? <>
              <label htmlFor="dx-inf-emisor-persona">Persona que firma</label>
              <EmisorPersonaSelector personas={emisoresPersona} value={emisorPersonaId} onChange={setEmisorPersonaId} disabled={emitiendo} />
              {emisorSeleccionado.fuente === 'persona' && <div className="dx-inf-emisor-firma"><span>Con firma</span>{firmaPersonaUrl ? <img src={firmaPersonaUrl} alt={`Firma de ${emisorSeleccionado.nombre}`} /> : <small>{firmaPersonaEstado === 'error' ? 'No se pudo cargar la firma.' : 'Cargando firma…'}</small>}</div>}
              {emisorSeleccionado.fuente === 'persona' && <p>{emisorSeleccionado.nombre}{emisorSeleccionado.cargo ? ` · ${emisorSeleccionado.cargo}` : ''}</p>}
            </> : String(identidadEmpresa?.firmante || '').trim()
              ? <p>No hay personas activas con firma cargada. Se usará el firmante configurado para la sociedad.</p>
              : <><label>Nombre del emisor<input value={emisorNombre} onChange={event => setEmisorNombre(event.target.value)} required maxLength={200} disabled={emitiendo} /></label><label>Cargo<input value={emisorCargo} onChange={event => setEmisorCargo(event.target.value)} maxLength={200} disabled={emitiendo} /></label><p>No hay personas activas con firma ni firmante configurado en la sociedad. Ingresa los datos manualmente.</p></>}
            {diagnostico.estado === 'borrador'
              ? <p>Se emitir\u00e1 el diagn\u00f3stico y luego el informe. Ninguno podr\u00e1 editarse y el diagn\u00f3stico pasar\u00e1 a costeo.</p>
              : <p>Al emitir, el informe queda congelado y no podr\u00e1 editarse; para cambios se emite una nueva versi\u00f3n.</p>}
            {cambiosSinGuardar && <p>Los cambios pendientes se guardar\u00e1n antes de emitir.</p>}
            <div className="dx-informe-emitir-actions"><button type="button" onClick={emitir} disabled={emitiendo || guardando || (emisoresPersona.length > 0 && (!emisorPersonaId || !firmaPersonaUrl)) || (!emisoresPersona.length && !String(identidadEmpresa?.firmante || '').trim() && !String(emisorNombre || '').trim()) || emisionBloqueada || !permisoAprobar || (diagnostico.estado === 'borrador' && !puedeEmitirDiagnostico)}>{emitiendo ? 'Emitiendo\u2026' : 'Confirmar emisi\u00f3n'}</button><button type="button" onClick={() => setConfirmarEmision(false)} disabled={emitiendo}>Cancelar</button></div>
          </section>}
          {emitidos.length > 0 && <section className="dx-inf-versions"><h3>Versiones emitidas</h3>{borrador && <button type="button" className={!seleccionVersion ? 'is-selected' : ''} onClick={() => chooseVersion(null)}>Borrador actual</button>}{emitidos.map(row => <button key={row.id} type="button" className={seleccionVersion?.id === row.id ? 'is-selected' : ''} onClick={() => chooseVersion(row)}>Versión {row.version}{row.emitido_en ? ` · ${new Date(row.emitido_en).toLocaleDateString('es-PE')}` : ''}</button>)}</section>}
          {cambiosSinGuardar && <div className="dx-inf-warning" role="status">Hay cambios sin guardar en el diagnóstico.</div>}
          {error && <div className="dx-inf-error" role="alert">{error}</div>}{aviso && <div className="dx-inf-notice" role="status">{aviso}</div>}
        </>}
      </aside>
      <main className="dx-inf-preview"><div className="dx-inf-preview-scroll">{!cargando && informe && <>{errorFotos && <div className="dx-informe-foto-aviso" role="status">No se pudieron cargar las fotos.</div>}<InformeHoja snapshot={effectiveSnapshot} borrador={!seleccionVersion} identidadEmpresa={{ ...identidadEmpresa, firma_url: firmaUrl }} /></>}</div></main>
    </div>
  </div>;
}

function EmisorPersonaSelector({ personas, value, onChange, disabled }) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const seleccionada = personas.find(persona => String(persona.id) === String(value));
  const filtradas = personas.filter(persona => `${persona.nombre} ${persona.cargo || ''}`.toLocaleLowerCase().includes(busqueda.trim().toLocaleLowerCase()));
  return <div className="dx-inf-persona-selector">
    <input id="dx-inf-emisor-persona" role="combobox" aria-autocomplete="list" aria-expanded={abierto} aria-controls="dx-inf-emisor-persona-list" value={abierto ? busqueda : (seleccionada?.etiqueta || '')} placeholder="Buscar persona…" disabled={disabled} onFocus={() => { setBusqueda(''); setAbierto(true); }} onChange={event => { setBusqueda(event.target.value); setAbierto(true); }} onBlur={() => window.setTimeout(() => setAbierto(false), 120)} />
    {abierto && <ul id="dx-inf-emisor-persona-list" role="listbox">{filtradas.map(persona => <li key={`${persona.personal_tipo}-${persona.id}`} role="option" aria-selected={String(value) === String(persona.id)}><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(persona.id); setBusqueda(''); setAbierto(false); }}><strong>{persona.nombre}</strong><span>{persona.cargo || 'Cargo no especificado'}</span><small>Con firma</small></button></li>)}{!filtradas.length && <li role="status">No hay coincidencias.</li>}</ul>}
  </div>;
}

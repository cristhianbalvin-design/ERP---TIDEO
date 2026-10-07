import React, { useEffect, useMemo, useState } from 'react';
import { actualizarOpciones, generarConclusionIA, obtenerIdentidadEmpresa, obtenerInformeVigente, obtenerOCrearBorrador, OPCIONES_INFORME_POR_DEFECTO } from '../../services/diagnosticoInformeService.js';
import { construirVistaInforme } from './informeSnapshot.js';
import { InformeHoja } from './InformeHoja.jsx';

const normalize = options => ({ ...OPCIONES_INFORME_POR_DEFECTO, ...(options || {}) });

export function DiagnosticoInformePanel({ diagnostico, catalogos, cabecera, puedeVer = true, puedeEditar = false, cambiosSinGuardar = false, onClose }) {
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
  const [generandoIA, setGenerandoIA] = useState(false);
  const [iaError, setIaError] = useState('');
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false);

  useEffect(() => {
    let active = true;
    if (!informe?.empresa_id) { setIdentidadEmpresa(null); return () => { active = false; }; }
    obtenerIdentidadEmpresa(informe.empresa_id).then(value => { if (active) setIdentidadEmpresa(value); });
    return () => { active = false; };
  }, [informe?.empresa_id]);

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
  const conclusionModificada = opciones.conclusion !== opcionesGuardadas.conclusion;
  const effectiveSnapshot = useMemo(() => {
    if (seleccionVersion?.snapshot) return seleccionVersion.snapshot;
    return construirVistaInforme(diagnostico, opciones, catalogos, cabecera);
  }, [seleccionVersion, diagnostico, opciones, catalogos, cabecera]);
  const patch = (key, value) => { setSeleccionVersion(null); setOpciones(current => ({ ...current, [key]: value })); };

  const generarIA = async () => {
    if (!isEditable || generandoIA) return;
    setGenerandoIA(true); setIaError(''); setConfirmarReemplazo(false);
    try {
      const result = await generarConclusionIA(diagnostico.id);
      setOpciones(current => ({ ...current, conclusion: result.conclusion, conclusion_origen: 'ia', conclusion_confirmada: false }));
      setSeleccionVersion(null);
      setAviso('Conclusión generada. Revísala y guárdala para poder confirmarla.');
    } catch (generationError) { setIaError(generationError.message || 'No se pudo generar la conclusión.'); }
    finally { setGenerandoIA(false); }
  };

  const guardar = async () => {
    if (!isEditable || guardando) return;
    setGuardando(true); setError(''); setAviso('');
    try {
      const saved = await actualizarOpciones(informe.id, opciones);
      const next = normalize(saved.opciones);
      setInforme(saved); setBorrador(saved); setOpcionesGuardadas(next); setOpciones(next);
      setAviso('Borrador guardado.');
    } catch (saveError) { setError(saveError.message || 'No se pudo guardar el borrador.'); }
    finally { setGuardando(false); }
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
          <div className="dx-inf-conclusion-editor"><label htmlFor="dx-inf-conclusion">Conclusión</label><textarea id="dx-inf-conclusion" rows={5} maxLength={2000} value={opciones.conclusion || ''} disabled={!isEditable || guardando} onChange={e => {
            const changed = e.target.value !== opcionesGuardadas.conclusion;
            patch('conclusion', e.target.value);
            if (changed && opciones.conclusion_confirmada) setOpciones(current => ({ ...current, conclusion_confirmada: false }));
            if (changed && opciones.conclusion_origen === 'ia') setOpciones(current => ({ ...current, conclusion_origen: 'ia_editada' }));
            else if (changed && opciones.conclusion_origen !== 'ia_editada') setOpciones(current => ({ ...current, conclusion_origen: 'manual' }));
          }} /><div className="dx-inf-counter">{(opciones.conclusion || '').length}/2000</div>
            {(opciones.conclusion_origen === 'ia' || opciones.conclusion_origen === 'ia_editada') && <small className="dx-inf-ai-label">Generado por IA, requiere revisión</small>}
            {isEditable && <button type="button" className="dx-inf-ai-button" disabled={generandoIA || guardando} onClick={() => String(opciones.conclusion || '').trim() ? setConfirmarReemplazo(true) : generarIA()}>{generandoIA ? 'Generando…' : 'Generar conclusión con IA'}</button>}
            {confirmarReemplazo && <div className="dx-inf-ai-confirm" role="group" aria-label="Confirmar reemplazo de conclusión"><span>La conclusión actual se reemplazará. ¿Continuar?</span><button type="button" onClick={generarIA} disabled={generandoIA}>Sí, reemplazar</button><button type="button" onClick={() => setConfirmarReemplazo(false)}>Cancelar</button></div>}
            {iaError && <div className="dx-inf-error" role="alert">{iaError}</div>}
          </div>
          <label className="dx-inf-confirm"><input type="checkbox" checked={Boolean(opciones.conclusion_confirmada)} disabled={!isEditable || guardando || conclusionModificada} onChange={confirmarConclusion} /> Revisé y confirmo la conclusión</label>
          {Boolean(String(opciones.conclusion || '').trim()) && !opciones.conclusion_confirmada && <p className="dx-inf-unconfirmed">No podrá emitirse hasta confirmarla.</p>}
          {isEditable && <button type="button" className="dx-inf-save" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar borrador'}</button>}
          {emitidos.length > 0 && <section className="dx-inf-versions"><h3>Versiones emitidas</h3>{borrador && <button type="button" className={!seleccionVersion ? 'is-selected' : ''} onClick={() => chooseVersion(null)}>Borrador actual</button>}{emitidos.map(row => <button key={row.id} type="button" className={seleccionVersion?.id === row.id ? 'is-selected' : ''} onClick={() => chooseVersion(row)}>Versión {row.version}{row.emitido_en ? ` · ${new Date(row.emitido_en).toLocaleDateString('es-PE')}` : ''}</button>)}</section>}
          {cambiosSinGuardar && <div className="dx-inf-warning" role="status">Hay cambios sin guardar en el diagnóstico.</div>}
          {error && <div className="dx-inf-error" role="alert">{error}</div>}{aviso && <div className="dx-inf-notice" role="status">{aviso}</div>}
        </>}
      </aside>
      <main className="dx-inf-preview"><div className="dx-inf-preview-scroll">{!cargando && informe && <InformeHoja snapshot={effectiveSnapshot} borrador={!seleccionVersion} identidadEmpresa={identidadEmpresa} />}</div></main>
    </div>
  </div>;
}

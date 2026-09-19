import React, { useEffect, useRef, useState } from 'react';
import { I } from '../icons.jsx';
import { listarPlantillasCotizacionPublicadas } from '../services/plantillasCotizacionService.js';

// Sin plantillas Especiales, conserva el acceso directo a Estándar cuando no
// se ofrece Hoja de Costeo. Con ella, el selector debe seguir siendo visible.
export function SelectorTipoCotizacion({ empresaId, onHojaCosteo, onEstandar, onEspecial, onCancel, onError, forzarSelector = false }) {
  const [plantillas, setPlantillas] = useState(null);
  const [error, setError] = useState('');
  const onHojaCosteoRef = useRef(onHojaCosteo);
  const onEstandarRef = useRef(onEstandar);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onHojaCosteoRef.current = onHojaCosteo;
    onEstandarRef.current = onEstandar;
    onErrorRef.current = onError;
  }, [onHojaCosteo, onEstandar, onError]);

  useEffect(() => {
    let activa = true;
    listarPlantillasCotizacionPublicadas(empresaId)
      .then(data => {
        if (!activa) return;
        if (!data.length && !onHojaCosteoRef.current && !forzarSelector) {
          onEstandarRef.current?.();
          return;
        }
        setPlantillas(data);
      })
      .catch(err => {
        if (!activa) return;
        const mensaje = err?.message || 'No se pudieron consultar las plantillas de cotización.';
        setPlantillas([]);
        setError(mensaje);
        onErrorRef.current?.(mensaje);
      });
    return () => { activa = false; };
  }, [empresaId, forzarSelector]);

  if (plantillas === null && !error) return null;
  if (!plantillas?.length && !error && !onHojaCosteo && !forzarSelector) return null;

  return <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 560 }}><div className="modal-head"><div><h2>Tipo de cotización</h2><div className="text-muted" style={{ fontSize: 12 }}>Elige cómo deseas iniciar esta cotización.</div></div><button className="icon-btn" onClick={onCancel}>{I.x}</button></div><div className="modal-body">{error && <div className="alert alert-warning" style={{ marginBottom: 12 }}>No se pudieron cargar las plantillas de Cotización Especial. {onHojaCosteo ? 'Aún puedes iniciar una Hoja de Costeo o una Cotización Estándar.' : 'Aún puedes iniciar una Cotización Estándar.'}</div>}<div style={{ display: 'grid', gap: 10 }}>{onHojaCosteo && <button type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={onHojaCosteo}><span>{I.receipt}</span><span><strong>Hoja de Costeo</strong><br /><small>Construye costos antes de generar la cotización.</small></span></button>}<button type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={onEstandar}><span>{I.file}</span><span><strong>Cotización Estándar</strong><br /><small>Imputación manual de datos y partidas.</small></span></button>{(plantillas || []).map(plantilla => <button key={plantilla.id} type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={() => onEspecial(plantilla)}><span>{I.clipboard}</span><span><strong>{plantilla.etiqueta}</strong><br /><small>{plantilla.tipo_documento?.nombre || 'Cotización Especial'}{plantilla.version ? ` · v${plantilla.version}` : ''}</small></span></button>)}</div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button></div></div></div>;
}

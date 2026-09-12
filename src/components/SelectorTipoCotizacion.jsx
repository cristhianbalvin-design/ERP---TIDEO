import React, { useEffect, useRef, useState } from 'react';
import { I } from '../icons.jsx';
import { listarPlantillasCotizacionPublicadas } from '../services/plantillasCotizacionService.js';

// Si no hay plantillas publicadas, conserva el flujo Estándar sin mostrar UI.
export function SelectorTipoCotizacion({ empresaId, onEstandar, onEspecial, onCancel, onError }) {
  const [plantillas, setPlantillas] = useState(null);
  const [error, setError] = useState('');
  const onEstandarRef = useRef(onEstandar);
  const onErrorRef = useRef(onError);
  useEffect(() => { onEstandarRef.current = onEstandar; onErrorRef.current = onError; }, [onEstandar, onError]);

  useEffect(() => {
    let activa = true;
    listarPlantillasCotizacionPublicadas(empresaId)
      .then(data => {
        if (!activa) return;
        if (!data.length) {
          onEstandarRef.current?.();
          return;
        }
        setPlantillas(data);
      })
      .catch(err => {
        if (!activa) return;
        const mensaje = err?.message || 'No se pudieron consultar las plantillas de cotización.';
        setError(mensaje);
        onErrorRef.current?.(mensaje);
      });
    return () => { activa = false; };
  }, [empresaId]);

  if (!plantillas?.length && !error) return null;
  if (error) return <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 520 }}><div className="modal-head"><h2>No se pudo elegir el tipo de cotización</h2><button className="icon-btn" onClick={onCancel}>{I.x}</button></div><div className="modal-body"><div className="alert alert-danger">{error}</div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cerrar</button></div></div></div>;

  return <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 560 }}><div className="modal-head"><div><h2>Tipo de cotización</h2><div className="text-muted" style={{ fontSize: 12 }}>Elige cómo deseas iniciar esta cotización.</div></div><button className="icon-btn" onClick={onCancel}>{I.x}</button></div><div className="modal-body"><div style={{ display: 'grid', gap: 10 }}><button type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={onEstandar}><span>{I.file}</span><span><strong>Cotización Estándar</strong><br /><small>Imputación manual de datos y partidas.</small></span></button>{plantillas.map(plantilla => <button key={plantilla.id} type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={() => onEspecial(plantilla)}><span>{I.clipboard}</span><span><strong>{plantilla.etiqueta}</strong><br /><small>{plantilla.tipo_documento?.nombre || 'Cotización Especial'}{plantilla.version ? ` · v${plantilla.version}` : ''}</small></span></button>)}</div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button></div></div></div>;
}

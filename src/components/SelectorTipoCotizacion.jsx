import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../icons.jsx';
import { listarPlantillasCotizacionPublicadas } from '../services/plantillasCotizacionService.js';

const LINEAS_NEGOCIO = [
  { value: 'flota_alquileres', label: 'Flota & Alquileres' },
  { value: 'maestranza_fab', label: 'Maestranza / Fabricación' },
  { value: 'transporte_comercial', label: 'Transporte Comercial' },
  { value: 'venta_repuestos', label: 'Venta de Repuestos' },
];

const LINEA_NEGOCIO_VALUES = new Set(LINEAS_NEGOCIO.map(linea => linea.value));
const normalizarLineaNegocio = value => (LINEA_NEGOCIO_VALUES.has(value) ? value : '');

// Sin plantillas Especiales, conserva el acceso directo a Estándar cuando no
// se ofrece Hoja de Costeo. Con ella, el selector debe seguir siendo visible.
export function SelectorTipoCotizacion({ empresaId, lineaNegocioInicial = '', onHojaCosteo, onEstandar, onEspecial, onCancel, onError, forzarSelector = false }) {
  const [lineaNegocio, setLineaNegocio] = useState(() => normalizarLineaNegocio(lineaNegocioInicial));
  const [lineaConfirmada, setLineaConfirmada] = useState(false);
  const [plantillas, setPlantillas] = useState(null);
  const [error, setError] = useState('');
  const onHojaCosteoRef = useRef(onHojaCosteo);
  const onEstandarRef = useRef(onEstandar);
  const lineaNegocioRef = useRef(lineaNegocio);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onHojaCosteoRef.current = onHojaCosteo;
    onEstandarRef.current = onEstandar;
    lineaNegocioRef.current = lineaNegocio;
    onErrorRef.current = onError;
  }, [lineaNegocio, onHojaCosteo, onEstandar, onError]);

  useEffect(() => {
    if (!lineaConfirmada) return undefined;
    let activa = true;
    listarPlantillasCotizacionPublicadas(empresaId)
      .then(data => {
        if (!activa) return;
        const permiteHojaCosteo = Boolean(onHojaCosteoRef.current && lineaNegocioRef.current !== 'venta_repuestos');
        if (!data.length && !permiteHojaCosteo && !forzarSelector) {
          onEstandarRef.current?.(lineaNegocioRef.current);
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
  }, [empresaId, forzarSelector, lineaConfirmada]);

  const permiteHojaCosteo = Boolean(onHojaCosteo && lineaNegocio !== 'venta_repuestos');
  const confirmarLineaNegocio = () => {
    if (!lineaNegocio) return;
    setError('');
    setPlantillas(null);
    setLineaConfirmada(true);
  };

  if (!lineaConfirmada) {
    return createPortal(<div className="modal-backdrop"><div className="modal" style={{ maxWidth: 560 }}>
      <div className="modal-head"><div><h2>Línea de negocio</h2><div className="text-muted" style={{ fontSize: 12 }}>Selecciona la línea para iniciar esta cotización.</div></div><button className="icon-btn" onClick={onCancel}>{I.x}</button></div>
      <div className="modal-body"><div className="input-group"><label>Línea de negocio *</label><select className="select" value={lineaNegocio} onChange={event => setLineaNegocio(event.target.value)}><option value="">Selecciona una línea…</option>{LINEAS_NEGOCIO.map(linea => <option key={linea.value} value={linea.value}>{linea.label}</option>)}</select></div></div>
      <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!lineaNegocio} onClick={confirmarLineaNegocio}>Continuar</button></div>
    </div></div>, document.body);
  }

  if (plantillas === null && !error) return null;
  if (!plantillas?.length && !error && !permiteHojaCosteo && !forzarSelector) return null;

  return createPortal(<div className="modal-backdrop"><div className="modal" style={{ maxWidth: 560 }}><div className="modal-head"><div><h2>Tipo de cotización</h2><div className="text-muted" style={{ fontSize: 12 }}>Línea: {LINEAS_NEGOCIO.find(linea => linea.value === lineaNegocio)?.label || lineaNegocio} · Elige cómo deseas iniciar.</div></div><button className="icon-btn" onClick={onCancel}>{I.x}</button></div><div className="modal-body">{error && <div className="alert alert-warning" style={{ marginBottom: 12 }}>No se pudieron cargar las plantillas de Cotización Especial. {permiteHojaCosteo ? 'Aún puedes iniciar una Hoja de Costeo o una Cotización Estándar.' : 'Aún puedes iniciar una Cotización Estándar.'}</div>}<div style={{ display: 'grid', gap: 10 }}>{/* TODO: flota_alquileres y transporte_comercial conservarán este flujo hasta tener motor propio. */}{permiteHojaCosteo && <button type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={() => onHojaCosteo(lineaNegocio)}><span>{I.receipt}</span><span><strong>Hoja de Costeo</strong><br /><small>Construye costos antes de generar la cotización.</small></span></button>}<button type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={() => onEstandar?.(lineaNegocio)}><span>{I.file}</span><span><strong>Cotización Estándar</strong><br /><small>Imputación manual de datos y partidas.</small></span></button>{(plantillas || []).map(plantilla => <button key={plantilla.id} type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={() => onEspecial?.(plantilla, lineaNegocio)}><span>{I.clipboard}</span><span><strong>{plantilla.etiqueta}</strong><br /><small>{plantilla.tipo_documento?.nombre || 'Cotización Especial'}{plantilla.version ? ` · v${plantilla.version}` : ''}</small></span></button>)}</div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button></div></div></div>, document.body);
}

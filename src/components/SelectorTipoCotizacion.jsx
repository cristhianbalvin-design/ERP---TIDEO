import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../icons.jsx';
import { listarPlantillasCotizacionPublicadas } from '../services/plantillasCotizacionService.js';
import { CotizacionTarifarioFlota } from './CotizacionTarifarioFlota.jsx';

const LINEAS_NEGOCIO = [
  { value: 'flota_alquileres', label: 'Flota & Alquileres' },
  { value: 'maestranza_fab', label: 'Maestranza / Fabricación' },
  { value: 'transporte_comercial', label: 'Transporte Comercial' },
  { value: 'venta_repuestos', label: 'Venta de Repuestos' },
];

const LINEA_NEGOCIO_VALUES = new Set(LINEAS_NEGOCIO.map(linea => linea.value));
const normalizarLineaNegocio = value => (LINEA_NEGOCIO_VALUES.has(value) ? value : '');

export function SelectorTipoCotizacion({ empresaId, cuentaIdInicial = '', lineaNegocioInicial = '', crearCuenta, comercialesAsignables = [], onHojaCosteo, onEstandar, onEspecial, onCancel, onError, forzarSelector = false }) {
  const lineaInicialNormalizada = normalizarLineaNegocio(lineaNegocioInicial);
  const [lineaNegocio, setLineaNegocio] = useState(lineaInicialNormalizada);
  const [lineaConfirmada, setLineaConfirmada] = useState(Boolean(lineaInicialNormalizada));
  const [plantillas, setPlantillas] = useState(null);
  const [error, setError] = useState('');
  const [tarifarioAbierto, setTarifarioAbierto] = useState(false);
  const [tarifarioContexto, setTarifarioContexto] = useState(null);
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
        const permiteHojaCosteo = Boolean(onHojaCosteoRef.current && !['venta_repuestos', 'flota_alquileres'].includes(lineaNegocioRef.current));
        const requiereTarifario = lineaNegocioRef.current === 'flota_alquileres';
        if (!data.length && !permiteHojaCosteo && !requiereTarifario && !forzarSelector) {
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

  const esFlotaAlquileres = lineaNegocio === 'flota_alquileres';
  const permiteHojaCosteo = Boolean(onHojaCosteo && !['venta_repuestos', 'flota_alquileres'].includes(lineaNegocio));
  const confirmarLineaNegocio = () => {
    if (!lineaNegocio) return;
    setError('');
    setPlantillas(null);
    setTarifarioContexto(null);
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
  if (tarifarioAbierto) return <CotizacionTarifarioFlota
    empresaId={empresaId}
    cuentaInicialId={cuentaIdInicial}
    crearCuenta={crearCuenta}
    comercialesAsignables={comercialesAsignables}
    onCancel={() => setTarifarioAbierto(false)}
    onError={onError}
    onContinue={contexto => { setTarifarioContexto(contexto); setTarifarioAbierto(false); }}
  />;
  if (!plantillas?.length && !error && !permiteHojaCosteo && !esFlotaAlquileres && !forzarSelector) return null;

  const contextoActual = tarifarioContexto || null;
  const activarEstandar = () => onEstandar?.(lineaNegocio, contextoActual);
  const activarEspecial = plantilla => onEspecial?.(plantilla, lineaNegocio, contextoActual);

  return createPortal(<div className="modal-backdrop"><div className="modal" style={{ maxWidth: 560 }}>
    <div className="modal-head"><div><h2>{contextoActual ? 'Tipo de cotización' : esFlotaAlquileres ? 'Tarifario de Flota & Alquileres' : 'Tipo de cotización'}</h2><div className="text-muted" style={{ fontSize: 12 }}>Línea: {LINEAS_NEGOCIO.find(linea => linea.value === lineaNegocio)?.label || lineaNegocio} · {contextoActual ? 'Continúa con el formato de cotización.' : 'Elige cómo deseas iniciar.'}</div></div><button className="icon-btn" onClick={onCancel}>{I.x}</button></div>
    <div className="modal-body">
      {error && <div className="alert alert-warning" style={{ marginBottom: 12 }}>No se pudieron cargar las plantillas de Cotización Especial. {permiteHojaCosteo ? 'Aún puedes iniciar una Hoja de Costeo o una Cotización Estándar.' : esFlotaAlquileres ? 'Puedes continuar desde el Tarifario de Flota.' : 'Aún puedes iniciar una Cotización Estándar.'}</div>}
      {esFlotaAlquileres && !contextoActual && <div style={{ display: 'grid', gap: 10 }}><button type="button" className="btn btn-primary" style={{ justifyContent: 'flex-start', minHeight: 58 }} onClick={() => setTarifarioAbierto(true)}><span>{I.file}</span><span><strong>Cotizar desde Tarifario</strong><br /><small>Selecciona cuenta, proyecto opcional, equipos y horas estimadas.</small></span></button></div>}
      {(!esFlotaAlquileres || contextoActual) && <div style={{ display: 'grid', gap: 10 }}>
        {permiteHojaCosteo && <button type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={() => onHojaCosteo(lineaNegocio)}><span>{I.receipt}</span><span><strong>Hoja de Costeo</strong><br /><small>Construye costos antes de generar la cotización.</small></span></button>}
        <button type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={activarEstandar}><span>{I.file}</span><span><strong>Cotización Estándar</strong><br /><small>Continúa con las partidas ya calculadas.</small></span></button>
        {(plantillas || []).map(plantilla => <button key={plantilla.id} type="button" className="btn btn-secondary" style={{ justifyContent: 'flex-start', minHeight: 52 }} onClick={() => activarEspecial(plantilla)}><span>{I.clipboard}</span><span><strong>{plantilla.etiqueta}</strong><br /><small>{plantilla.tipo_documento?.nombre || 'Cotización Especial'}{plantilla.version ? ` · v${plantilla.version}` : ''}</small></span></button>)}
      </div>}
    </div>
    <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button></div>
  </div></div>, document.body);
}

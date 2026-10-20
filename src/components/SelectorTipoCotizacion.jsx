import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../icons.jsx';
import { listarPlantillasCotizacionPublicadas } from '../services/plantillasCotizacionService.js';
import { CotizacionTarifarioFlota } from './CotizacionTarifarioFlota.jsx';
import '../cotizacion_selector.css';

const LINEAS_NEGOCIO = [
  { value: 'flota_alquileres', label: 'Flota & Alquileres', descripcion: 'Equipos y vehículos por hora, día o mes con el tarifario.', icono: 'truck', clase: 'is-violet' },
  { value: 'maestranza_fab', label: 'Maestranza / Fabricación', descripcion: 'Reparación, fabricación y servicios de taller.', icono: 'wrench', clase: 'is-cyan' },
  { value: 'transporte_comercial', label: 'Transporte Comercial', descripcion: 'Fletes y traslados de carga.', icono: 'mapPin', clase: 'is-amber' },
  { value: 'venta_repuestos', label: 'Venta de Repuestos', descripcion: 'Venta directa de repuestos y materiales.', icono: 'cart', clase: 'is-green' },
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
    return createPortal(<div className="modal-backdrop dx-cotsel-backdrop" onClick={onCancel}><div className="dx-cotsel" role="dialog" aria-modal="true" aria-labelledby="dx-cotsel-titulo" onClick={event => event.stopPropagation()}>
      <div className="dx-cotsel-head">
        <div>
          <div className="dx-cotsel-steps" aria-hidden="true"><span className="is-on" /><span /></div>
          <div className="dx-cotsel-eyebrow">Nueva cotización · paso 1 de 2</div>
          <h2 id="dx-cotsel-titulo">¿Para qué línea de negocio?</h2>
          <p>Define las opciones disponibles y la numeración de la cotización.</p>
        </div>
        <button type="button" className="dx-cotsel-close" onClick={onCancel} aria-label="Cerrar">{I.x}</button>
      </div>
      <div className="dx-cotsel-body">
        <div className="dx-cotsel-opts" role="radiogroup" aria-label="Línea de negocio">
          {LINEAS_NEGOCIO.map(linea => (
            <button type="button" role="radio" aria-checked={lineaNegocio === linea.value} key={linea.value} className={`dx-cotsel-opt${lineaNegocio === linea.value ? ' is-on' : ''}`} onClick={() => setLineaNegocio(linea.value)}>
              <span className={`dx-cotsel-ic ${linea.clase}`}>{I[linea.icono]}</span>
              <span><b>{linea.label}</b><small>{linea.descripcion}</small></span>
            </button>
          ))}
        </div>
      </div>
      <div className="dx-cotsel-foot">
        <span />
        <div className="dx-cotsel-foot-acts">
          <button type="button" className="dx-cotsel-btn" onClick={onCancel}>Cancelar</button>
          <button type="button" className="dx-cotsel-btn is-primary" disabled={!lineaNegocio} onClick={confirmarLineaNegocio}>Continuar</button>
        </div>
      </div>
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

  const lineaEtiqueta = LINEAS_NEGOCIO.find(linea => linea.value === lineaNegocio)?.label || lineaNegocio;
  const puedeCambiarLinea = !lineaInicialNormalizada && !contextoActual;
  const cambiarLinea = () => { setError(''); setPlantillas(null); setTarifarioContexto(null); setLineaConfirmada(false); };
  const opcion = ({ clave, icono, clase, titulo, texto, onClick, principal = false }) => (
    <button type="button" key={clave} className={`dx-cotsel-opt${principal ? ' is-main' : ''}`} onClick={onClick}>
      <span className={`dx-cotsel-ic ${clase}`}>{icono}</span>
      <span><b>{titulo}</b><small>{texto}</small></span>
    </button>
  );

  return createPortal(<div className="modal-backdrop dx-cotsel-backdrop" onClick={onCancel}><div className="dx-cotsel" role="dialog" aria-modal="true" aria-labelledby="dx-cotsel-titulo" onClick={event => event.stopPropagation()}>
    <div className="dx-cotsel-head">
      <div>
        <div className="dx-cotsel-steps" aria-hidden="true"><span className="is-on" /><span className="is-on" /></div>
        <div className="dx-cotsel-eyebrow">Nueva cotización · paso 2 de 2</div>
        <h2 id="dx-cotsel-titulo">{esFlotaAlquileres && !contextoActual ? 'Tarifario de Flota & Alquileres' : '¿Cómo quieres empezar?'}</h2>
        <p>Línea: <strong>{lineaEtiqueta}</strong>{contextoActual ? ' · Tarifario listo, elige el formato de la cotización.' : ''}</p>
      </div>
      <button type="button" className="dx-cotsel-close" onClick={onCancel} aria-label="Cerrar">{I.x}</button>
    </div>
    <div className="dx-cotsel-body">
      {error && <div className="dx-cotsel-warn" role="alert">No se pudieron cargar las plantillas de Cotización Especial. {permiteHojaCosteo ? 'Aún puedes iniciar una Hoja de Costeo o una Cotización Estándar.' : esFlotaAlquileres ? 'Puedes continuar desde el Tarifario de Flota.' : 'Aún puedes iniciar una Cotización Estándar.'}</div>}
      {esFlotaAlquileres && !contextoActual && (
        <div className="dx-cotsel-opts is-one">
          {opcion({ clave:'tarifario', icono:I.truck, clase:'is-violet', titulo:'Cotizar desde Tarifario', texto:'Selecciona cuenta, proyecto opcional, equipos y horas estimadas.', onClick:() => setTarifarioAbierto(true), principal:true })}
        </div>
      )}
      {(!esFlotaAlquileres || contextoActual) && (
        <>
          {permiteHojaCosteo && (
            <>
              <div className="dx-cotsel-grp">Calcular primero</div>
              <div className="dx-cotsel-opts is-one">
                {opcion({ clave:'hoja_costeo', icono:I.receipt, clase:'is-cyan', titulo:'Hoja de Costeo', texto:'Calcula mano de obra, materiales, equipos y margen; luego genera la cotización con las partidas listas.', onClick:() => onHojaCosteo(lineaNegocio) })}
              </div>
            </>
          )}
          <div className="dx-cotsel-grp">Cotizar directo</div>
          <div className="dx-cotsel-opts is-one">
            {opcion({ clave:'estandar', icono:I.file, clase:'is-gray', titulo:'Cotización Estándar', texto:'Partidas, totales, hitos de pago y condiciones comerciales en el formato estándar.', onClick:activarEstandar })}
          </div>
          {(plantillas || []).length > 0 && (
            <>
              <div className="dx-cotsel-grp">Cotización Especial · plantillas publicadas</div>
              <div className="dx-cotsel-opts">
                {plantillas.map(plantilla => opcion({ clave:plantilla.id, icono:I.clipboard, clase:'is-violet', titulo:plantilla.etiqueta, texto:`${plantilla.tipo_documento?.nombre || 'Cotización Especial'}${plantilla.version ? ` · v${plantilla.version}` : ''}`, onClick:() => activarEspecial(plantilla) }))}
              </div>
            </>
          )}
        </>
      )}
    </div>
    <div className="dx-cotsel-foot">
      {puedeCambiarLinea ? <button type="button" className="dx-cotsel-btn" onClick={cambiarLinea}>{I.chevLeft}Cambiar línea</button> : <span />}
      <button type="button" className="dx-cotsel-btn" onClick={onCancel}>Cancelar</button>
    </div>
  </div></div>, document.body);
}

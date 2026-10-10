import { useMemo } from 'react';
import { calcularTotalesUbicacion, etiquetaTipoUbicacion, etiquetaUsoUbicacion, usoUbicacion } from './ubicacionesLogic.js';

const numero = valor => Number(valor || 0).toLocaleString('es-PE');
const iconoPin = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
const flecha = <svg aria-hidden="true" className="dx-ui-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>;

export function UbicacionDetalle({ ubicacion, almacen, ubicaciones, stock, materiales, errorMateriales, cargandoMateriales, motivoNoDesactivar = '', errorAccion = '', onBack, onOpen, onRetry }) {
  const padre = ubicaciones.find(item => item.id === ubicacion.padre_id);
  const hijos = ubicaciones.filter(item => item.padre_id === ubicacion.id).sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { numeric: true }));
  const stockPropio = stock.filter(item => item.ubicacion_id === ubicacion.id && Number(item.fisico) > 0);
  const totales = useMemo(() => calcularTotalesUbicacion(ubicacion, ubicaciones, stock), [ubicacion, ubicaciones, stock]);
  const materialPorId = new Map(materiales.map(item => [item.id, item]));
  return <>
    <button type="button" className="dx-ubicaciones-back" onClick={onBack}>← Volver a ubicaciones</button>
    {errorAccion && <div className="dx-ubicaciones-alert" role="alert">{errorAccion}</div>}
    <div className="dx-ui-card">
      <div className="dx-ui-toolbar"><h2>{ubicacion.codigo} · {ubicacion.nombre}</h2>
        {ubicacion.es_general && <span className="dx-ui-pill is-gray"><i />General</span>}
        {usoUbicacion(ubicacion) !== 'almacenaje' && <span className={`dx-ui-pill ${['cuarentena', 'merma'].includes(usoUbicacion(ubicacion)) ? 'is-amber' : 'is-cyan'}`}><i />{etiquetaUsoUbicacion(usoUbicacion(ubicacion))}</span>}
        <span className={`dx-ui-pill ${ubicacion.activo ? 'is-green' : 'is-gray'}`}><i />{ubicacion.activo ? 'Activa' : 'Inactiva'}</span>
      </div>
      <div className="dx-ubicaciones-meta">
        <div><small>Tipo</small><span>{etiquetaTipoUbicacion(ubicacion.tipo)}</span></div>
        <div><small>Ubicada en</small><span>{padre?.nombre || almacen?.nombre || '—'}</span></div>
        <div><small>Materiales (total)</small><span>{numero(totales.materiales)}</span></div>
        <div><small>Unidades (total)</small><span>{numero(totales.unidades)}</span></div>
      </div>
      {(ubicacion.es_general || motivoNoDesactivar) && <div className="dx-ubicaciones-note" id="dx-ubicaciones-motivo">{ubicacion.es_general ? 'La ubicación general existe en todos los almacenes: recibe el stock sin ubicar. No se edita ni se desactiva.' : motivoNoDesactivar}</div>}
      {!ubicacion.activo && <div className="dx-ubicaciones-note">Inactiva: no aparece al elegir destino en Recepciones. Reactívala para volver a usarla.</div>}
      <div className="dx-ubicaciones-subhead">Stock almacenado directamente aquí</div>
      {errorMateriales ? <div className="dx-ui-empty"><div className="dx-ubicaciones-alert" role="alert">{errorMateriales}</div><button type="button" className="dx-btn" onClick={onRetry}>Reintentar</button></div> : cargandoMateriales ? <div className="dx-ui-empty">Cargando materiales…</div> : stockPropio.length ? <>
        <div className="dx-ui-head dx-ubicaciones-det-cols" aria-hidden="true"><span>Material</span><span>Lote</span><span>Físico</span></div>
        {stockPropio.map((fila, idx) => { const material = materialPorId.get(fila.material_id); return <div className="dx-ui-row dx-ubicaciones-det-cols" key={`${fila.material_id}-${fila.lote || ''}-${idx}`}>
          <span className="dx-ubicaciones-material"><b>{material?.descripcion || 'Material sin nombre'}</b><small>{material?.codigo || fila.material_id || '—'}</small></span><span className="dx-ubicaciones-lote">{fila.lote || '—'}</span><span className="dx-ubicaciones-num">{numero(fila.fisico)}</span>
        </div>; })}
      </> : <div className="dx-ui-empty">Esta ubicación no guarda stock directamente.</div>}
      {hijos.length > 0 && <><div className="dx-ubicaciones-subhead">Contiene {hijos.length} sub-ubicación(es)</div>{hijos.map(hijo => <div key={hijo.id} className="dx-ui-row dx-ubicaciones-sub" role="button" tabIndex={0} aria-label={`Abrir ${hijo.nombre}`} onClick={() => onOpen(hijo)} onKeyDown={evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); onOpen(hijo); } }}>
        <span className="dx-ubicaciones-nombre"><span className="dx-ui-icon is-cyan">{iconoPin}</span><em>{hijo.nombre}</em><small>{hijo.codigo}</small></span>{!hijo.activo && <span className="dx-ui-pill is-gray"><i />Inactiva</span>}{flecha}
      </div>)}</>}
    </div>
  </>;
}

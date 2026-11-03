import React from 'react';
import {
  diasParaVencimientoTarifa, estadoVigencia, etiquetaModalidad, formatearFechaTransporte,
  formatearImporte,
} from './transporteUtils.js';

const stateLabel = { vigente: 'Vigente', futura: 'Futura', vencida: 'Vencida', inactiva: 'Inactiva' };

export function TarifaGrupo({ ruta, tarifas, today, onCreate, onEdit }) {
  const columns = 'minmax(0,1.4fr) minmax(0,1fr) 100px 112px 96px 132px 128px';
  return <section className="dx-transporte-route-group">
    <header><div><h2>{ruta?.nombre || 'Todas las rutas'}</h2>
      <p>{ruta?.codigo || 'Sin ruta'} · {ruta?.distancia_km ?? '—'} km · {tarifas.length} tarifas</p></div>
      <button type="button" className="dx-btn sm" onClick={() => onCreate(ruta?.id || null)}>+ Tarifa</button>
    </header>
    <div className="dx-transporte-tariff-table" style={{ '--dx-tariff-columns': columns }}>
      <div className="dx-transporte-tariff-row is-heading"><span>Aplica a</span><span>Unidad</span>
        <span>Modalidad</span><span className="is-right">Precio</span><span className="is-right">Mínimo</span>
        <span>Vigencia</span><span>Estado</span></div>
      {tarifas.map(tariff => {
        const state = estadoVigencia(tariff, today);
        const due = diasParaVencimientoTarifa(tariff, today);
        return <article className="dx-transporte-tariff-row" key={tariff.id}>
          <span className="dx-transporte-tariff-client" data-label="Aplica a">
            <b>{tariff.cuenta_id ? tariff.cuenta_name || 'Sin dato' : 'Tarifa base'}</b>
            <small>{tariff.cuenta_id ? 'Tarifa de cliente' : 'Todos los clientes'}</small>
          </span>
          <span data-label="Unidad">{tariff.tipo_unidad}</span>
          <span data-label="Modalidad">{etiquetaModalidad(tariff.modalidad)}</span>
          <strong className="is-right" data-label="Precio">
            {formatearImporte(tariff.tarifa, tariff.moneda, tariff.modalidad)}</strong>
          <span className="is-right" data-label="Mínimo">{tariff.minimo_facturable == null
            ? 'Sin mínimo' : formatearImporte(tariff.minimo_facturable, tariff.moneda, tariff.modalidad)}</span>
          <span data-label="Vigencia">{tariff.vigente_desde
            ? `${formatearFechaTransporte(tariff.vigente_desde)} – ${formatearFechaTransporte(tariff.vigente_hasta, 'Sin fecha final')}`
            : 'Sin dato'}</span>
          <span data-label="Estado"><span className={`dx-transporte-state is-${state}`}>
            {due !== null && due <= 7 ? `Vence en ${due} días` : stateLabel[state]}</span>
            <button type="button" className="dx-transporte-edit-link"
              aria-label={`Editar tarifa de ${tariff.cuenta_name}, ${tariff.tipo_unidad}`}
              onClick={() => onEdit(tariff)}>Editar</button></span>
        </article>;
      })}
    </div>
  </section>;
}

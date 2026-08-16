import React, { useEffect, useState } from 'react';

// Dialogo unico para resolver coincidencias de cargos. La deteccion y las escrituras
// siguen en el servicio/contexto; este componente solo presenta la decision humana.
export function CargoCreationDialog({ solicitud, guardando, onResolver, onCancelar }) {
  const activos = solicitud?.activas || [];
  const inactivos = solicitud?.inactivas || [];
  const [cargoSeleccionadoId, setCargoSeleccionadoId] = useState('');

  useEffect(() => {
    setCargoSeleccionadoId((activos[0] || inactivos[0])?.id || '');
  }, [solicitud?.id, activos, inactivos]);

  if (!solicitud) return null;

  const tieneActivo = activos.length > 0;
  const opciones = tieneActivo ? activos : inactivos;
  const cargoSeleccionado = opciones.find(cargo => cargo.id === cargoSeleccionadoId) || opciones[0];
  const etiqueta = cargo => `${cargo.nombre}${cargo.codigo ? ` (${cargo.codigo})` : ''}`;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cargo-creation-dialog-title" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3 id="cargo-creation-dialog-title">{tieneActivo ? 'Cargo ya existente' : 'Cargo inactivo encontrado'}</h3>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
          {tieneActivo ? (
            <p style={{ margin: 0 }}>
              Ya existe un cargo activo con el nombre <strong>{solicitud.nombre}</strong>. Reutilízalo para evitar crear un duplicado.
            </p>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                Existe un cargo inactivo con el nombre <strong>{solicitud.nombre}</strong>. Elige explícitamente si deseas reactivarlo o crear otro cargo de todos modos.
              </p>
              <div className="alert alert-warning" style={{ margin: 0, fontSize: 12 }}>
                Reactivar el cargo no reactiva sus posiciones. Antes de asignarlo, verifica en Organigrama que tenga una posición activa utilizable.
              </div>
            </>
          )}

          {opciones.length > 1 ? (
            <div className="input-group">
              <label>{tieneActivo ? 'Cargo activo a reutilizar' : 'Cargo inactivo a reactivar'}</label>
              <select className="select" value={cargoSeleccionado?.id || ''} onChange={event => setCargoSeleccionadoId(event.target.value)} disabled={guardando}>
                {opciones.map(cargo => <option key={cargo.id} value={cargo.id}>{etiqueta(cargo)}</option>)}
              </select>
            </div>
          ) : (
            <div className="text-muted" style={{ fontSize: 12 }}>{etiqueta(cargoSeleccionado)}</div>
          )}
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" disabled={guardando} onClick={onCancelar}>Cancelar</button>
          {tieneActivo ? (
            <button type="button" className="btn btn-primary" disabled={!cargoSeleccionado || guardando} onClick={() => onResolver({ accion: 'reutilizar', cargoId: cargoSeleccionado.id })}>
              {guardando ? 'Procesando...' : 'Usar cargo existente'}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" disabled={!cargoSeleccionado || guardando} onClick={() => onResolver({ accion: 'reactivar', cargoId: cargoSeleccionado.id })}>
                {guardando ? 'Procesando...' : 'Reactivar cargo'}
              </button>
              <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => onResolver({ accion: 'crear_duplicado' })}>
                {guardando ? 'Procesando...' : 'Crear nuevo de todos modos'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

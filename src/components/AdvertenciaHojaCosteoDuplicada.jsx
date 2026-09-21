import React from 'react';

export function AdvertenciaHojaCosteoDuplicada({ hojas = [], saving = false, onCancel, onContinue }) {
  return <div className="modal-backdrop" style={{ zIndex: 1200 }}><div className="modal" style={{ maxWidth: 620 }}>
    <div className="modal-head"><div><h2>Hoja de Costeo existente</h2><div className="text-muted" style={{ fontSize: 12 }}>Ya existe una hoja asociada a esta operación.</div></div></div>
    <div className="modal-body"><p>¿Deseas abrir la hoja existente o crear una nueva de todas formas?</p>{hojas.length > 0 && <div className="table-wrap"><table className="tbl"><thead><tr><th>Número</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{hojas.map(hoja => <tr key={hoja.id}><td>{hoja.numero || hoja.id}</td><td>{hoja.estado || '—'}</td><td>{hoja.created_at ? new Date(hoja.created_at).toLocaleDateString('es-PE') : '—'}</td></tr>)}</tbody></table></div>}</div>
    <div className="modal-foot"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>Abrir existente</button><button type="button" className="btn btn-primary" disabled={saving} onClick={onContinue}>{saving ? 'Creando…' : 'Crear nueva'}</button></div>
  </div></div>;
}

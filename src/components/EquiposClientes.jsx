import React from 'react';
import { I } from '../icons.jsx';

const clienteNombre = (ficha, cuentasPorId) => {
  const cuenta = cuentasPorId?.get(ficha.activo.cliente_propietario_id);
  return cuenta?.razon_social || cuenta?.nombre_comercial || 'Cliente no disponible';
};

export function EquipoClienteHistorial({ ficha, cuentasPorId }) {
  if (!ficha) return null;
  const { activo, historial } = ficha;
  return <div className="card" style={{ marginTop: 16 }}>
    <div className="card-head"><div><h3>{activo.codigo} · {activo.nombre}</h3><div className="text-muted" style={{ fontSize: 12 }}>{[activo.marca, activo.modelo, activo.placa_serie].filter(Boolean).join(' · ') || 'Sin marca, modelo ni serie'}</div></div><span className="badge badge-gray">{historial.length} OS</span></div>
    <div className="card-body">
      <div className="grid-2" style={{ gap: 10, marginBottom: 16, fontSize: 13 }}>
        <div><span className="text-muted">Estado: </span><strong>{String(activo.estado || '—').replace('_', ' ')}</strong></div>
        <div><span className="text-muted">Cliente propietario: </span><strong>{clienteNombre(ficha, cuentasPorId)}</strong></div>
        {activo.observacion && <div style={{ gridColumn: '1/-1' }}><span className="text-muted">Observación: </span>{activo.observacion}</div>}
      </div>
      <h4 style={{ margin: '0 0 10px' }}>Historial de OS Cliente</h4>
      {historial.length ? <div className="table-wrap"><table className="tbl"><thead><tr><th>OS</th><th>Estado</th><th>Emisión</th><th>Cliente</th></tr></thead><tbody>{historial.map(os => <tr key={os.id}><td className="mono"><strong>{os.numero || '—'}</strong></td><td><span className="badge badge-gray">{String(os.estado || '—').replace('_', ' ')}</span></td><td>{os.fecha_emision || '—'}</td><td>{cuentasPorId?.get(os.cuenta_id)?.razon_social || cuentasPorId?.get(os.cuenta_id)?.nombre_comercial || '—'}</td></tr>)}</tbody></table></div> : <div className="text-muted" style={{ fontSize: 13 }}>Este equipo aún no tiene OS Cliente asociadas.</div>}
    </div>
  </div>;
}

export function EquiposClientesListado({ fichas = [], cuentasPorId, showCliente = true, selectedId, onSelect, loading = false, emptyMessage = 'No hay equipos de clientes para mostrar.' }) {
  if (loading) return <div className="card p-4 text-muted">Cargando equipos…</div>;
  if (!fichas.length) return <div className="card p-4 text-muted">{emptyMessage}</div>;
  return <div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>Código</th><th>Equipo</th>{showCliente && <th>Cliente</th>}<th>Marca / modelo</th><th>OS asociadas</th><th /></tr></thead><tbody>
    {fichas.map(ficha => <tr key={ficha.activo.id} className="hover-row" style={{ cursor: 'pointer', background: selectedId === ficha.activo.id ? 'var(--bg-subtle)' : undefined }} onClick={() => onSelect?.(ficha.activo.id)}>
      <td className="mono"><strong>{ficha.activo.codigo || '—'}</strong></td><td>{ficha.activo.nombre || '—'}{ficha.activo.placa_serie && <div className="text-muted" style={{ fontSize: 11 }}>{ficha.activo.placa_serie}</div>}</td>{showCliente && <td>{clienteNombre(ficha, cuentasPorId)}</td>}<td>{[ficha.activo.marca, ficha.activo.modelo].filter(Boolean).join(' / ') || '—'}</td><td><span className="badge badge-cyan">{ficha.osCount}</span></td><td><button type="button" className="btn btn-secondary btn-sm" onClick={event => { event.stopPropagation(); onSelect?.(ficha.activo.id); }}>{I.eye} Ver historial</button></td>
    </tr>)}
  </tbody></table></div></div>;
}

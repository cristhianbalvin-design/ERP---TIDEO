import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context.jsx';
import { RutaParadasMapa } from './RutaParadasMapa.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const routeStates = { planificada: 'Planificada', en_curso: 'En curso', completada: 'Completada', cancelada: 'Cancelada' };
const stopStates = { pendiente: 'Pendiente', en_curso: 'En curso', completada: 'Completada', omitida: 'Omitida' };
const stopsOf = route => [...(route?.ruta_paradas || [])].sort((a, b) => Number(a.secuencia || 0) - Number(b.secuencia || 0));
const stateClass = value => ({ planificada: 'badge-gray', en_curso: 'badge-cyan', completada: 'badge-green', cancelada: 'badge-red', pendiente: 'badge-gray', omitida: 'badge-orange' }[value] || 'badge-gray');

const Badge = ({ value }) => <span className={`badge ${stateClass(value)}`}>{routeStates[value] || stopStates[value] || value || '-'}</span>;

export function RutasPanel() {
  const {
    empresa, rutas = [], candidatosParadas = { transitos: [], guias: [] }, transportistas = [],
    crearRutaCtx, eliminarRutaCtx, actualizarEstadoRutaCtx, agregarParadaRutaCtx,
    actualizarEstadoParadaRutaCtx, reordenarParadasRutaCtx, quitarParadaRutaCtx, addToast,
  } = useApp();
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ codigo: '', fecha: today(), vehiculo_id: '', conductor_id: '', transportista_id: '', observaciones: '' });
  const [type, setType] = useState('orden_compra_transito');
  const [docId, setDocId] = useState('');
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const route = rutas.find(row => row.id === selectedId) || rutas[0] || null;
  const stops = useMemo(() => stopsOf(route), [route]);
  const vehicles = useMemo(() => transportistas.flatMap(t => (t.vehiculos || []).map(v => ({ ...v, transportista_id: v.transportista_id || t.id }))), [transportistas]);
  const drivers = useMemo(() => transportistas.flatMap(t => (t.conductores || []).map(c => ({ ...c, transportista_id: c.transportista_id || t.id }))), [transportistas]);
  const documents = type === 'guia_remision' ? candidatosParadas.guias : candidatosParadas.transitos;
  const run = async (fn, message) => { if (busy) return; setBusy(true); try { await fn(); addToast?.(message, 'success'); } catch (error) { addToast?.(error?.message || 'No se pudo completar la operación.'); } finally { setBusy(false); } };

  useEffect(() => { if (route && !rutas.some(row => row.id === selectedId)) setSelectedId(route.id); }, [route, rutas, selectedId]);

  const create = event => {
    event.preventDefault();
    if (!form.transportista_id || !form.vehiculo_id || !form.conductor_id) { addToast?.('Transportista, vehículo y conductor son obligatorios para crear una ruta.'); return; }
    run(async () => { const created = await crearRutaCtx(form); setSelectedId(created.id); setForm({ codigo: '', fecha: today(), vehiculo_id: '', conductor_id: '', transportista_id: '', observaciones: '' }); }, 'Ruta creada.');
  };
  const addStop = event => { event.preventDefault(); if (!route || !docId) return; const seq = stops.reduce((max, row) => Math.max(max, Number(row.secuencia || 0)), 0) + 1; run(async () => { await agregarParadaRutaCtx(route.id, { tipo_documento: type, documento_id: docId, secuencia: seq }); setDocId(''); }, 'Parada agregada; el documento fuente no cambió.'); };
  const move = (index, delta) => { const next = [...stops]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; run(() => reordenarParadasRutaCtx(route.id, next), 'Orden de paradas actualizado.'); };
  const stopAction = (stop, state) => run(() => actualizarEstadoParadaRutaCtx(stop.id, state, notes[stop.id] || null), `Parada ${state === 'completada' ? 'completada' : 'omitida'}; documento fuente sin cambios.`);
  const removeRoute = () => {
    if (!route || !window.confirm(`¿Eliminar la ruta ${route.codigo || route.id}? Sus paradas también se eliminarán.`)) return;
    run(async () => { await eliminarRutaCtx(route.id); setSelectedId(''); }, 'Ruta eliminada.');
  };
  const transportistaName = id => transportistas.find(t => t.id === id)?.razon_social || 'Sin transportista';
  const vehicleName = id => vehicles.find(v => v.id === id)?.placa || 'Sin vehículo';
  const driverName = id => drivers.find(c => c.id === id)?.nombre || 'Sin conductor';

  if (!empresa?.id) return <div className="card mt-6"><div className="card-body">Selecciona una empresa para gestionar rutas.</div></div>;

  return <div className="mt-6">
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, .8fr) minmax(420px, 1.2fr)', gap: 16, alignItems: 'start' }}>
      <form className="card" onSubmit={create}>
        <div className="card-head"><div><div className="eyebrow">Planificación</div><h3 style={{ margin: 0 }}>Nueva ruta</h3></div><span className="badge badge-cyan">Multi-parada</span></div>
        <div className="card-body" style={{ display: 'grid', gap: 12 }}>
          <div className="grid-2" style={{ gap: 10 }}><div className="input-group"><label>Código</label><input className="input" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="RUT-2026-001" /></div><div className="input-group"><label>Fecha *</label><input className="input" type="date" required value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div></div>
          <div className="input-group"><label>Transportista</label><select className="input" required value={form.transportista_id} onChange={e => setForm({ ...form, transportista_id: e.target.value })}><option value="">Seleccionar</option>{transportistas.map(t => <option key={t.id} value={t.id}>{t.razon_social || t.nombre_comercial || t.id}</option>)}</select></div>
          <div className="grid-2" style={{ gap: 10 }}><div className="input-group"><label>Vehículo</label><select className="input" required value={form.vehiculo_id} onChange={e => setForm({ ...form, vehiculo_id: e.target.value })}><option value="">Seleccionar</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.placa}</option>)}</select></div><div className="input-group"><label>Conductor</label><select className="input" required value={form.conductor_id} onChange={e => setForm({ ...form, conductor_id: e.target.value })}><option value="">Seleccionar</option>{drivers.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div></div>
          <div className="input-group"><label>Observaciones</label><textarea className="input" rows="3" value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} /></div>
          <button className="btn btn-primary" type="submit" disabled={busy}>Crear ruta</button>
        </div>
      </form>

      <div className="card">
        <div className="card-head"><div><div className="eyebrow">Seguimiento</div><h3 style={{ margin: 0 }}>Rutas registradas</h3></div><span className="text-muted">{rutas.length} total</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, padding: 14 }}>
          {rutas.map(row => <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} style={{ textAlign: 'left', border: `1px solid ${row.id === route?.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: 12, background: row.id === route?.id ? 'var(--primary-light,#eff6ff)' : 'var(--surface,#fff)', cursor: 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><strong>{row.codigo}</strong><Badge value={row.estado} /></div><div className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>{row.fecha || 'Sin fecha'} · {row.ruta_paradas?.length || 0} paradas</div><div style={{ marginTop: 5, fontSize: 11 }}>{vehicleName(row.vehiculo_id)} · {driverName(row.conductor_id)}</div></button>)}
          {!rutas.length && <div className="text-muted" style={{ padding: 10 }}>No hay rutas registradas.</div>}
        </div>
      </div>
    </div>

    {route && <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) minmax(420px, 1.25fr)', gap: 16, alignItems: 'start', marginTop: 16 }}>
      <div className="card">
        <div className="card-head"><div><div className="eyebrow">Ruta seleccionada</div><h3 style={{ margin: 0 }}>{route.codigo}</h3><div className="text-muted" style={{ marginTop: 4 }}>{transportistaName(route.transportista_id)} · {vehicleName(route.vehiculo_id)} · {driverName(route.conductor_id)}</div></div><div className="row" style={{ gap: 8 }}><select className="input" style={{ width: 145 }} value={route.estado} disabled={busy} onChange={e => run(() => actualizarEstadoRutaCtx(route.id, e.target.value), 'Estado de ruta actualizado.')}>{Object.entries(routeStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button className="btn btn-danger btn-sm" type="button" disabled={busy} onClick={removeRoute}>Eliminar ruta</button></div></div>
        <form className="card-body" onSubmit={addStop}><div className="eyebrow">Agregar parada</div><div className="row" style={{ gap: 8, alignItems: 'end', flexWrap: 'wrap', marginTop: 8 }}><div className="input-group"><label>Tipo</label><select className="input" value={type} onChange={e => { setType(e.target.value); setDocId(''); }}><option value="orden_compra_transito">Tránsito OC</option><option value="guia_remision">Guía despacho de servicio</option></select></div><div className="input-group" style={{ minWidth: 220, flex: 1 }}><label>Documento</label><select className="input" value={docId} onChange={e => setDocId(e.target.value)}><option value="">Seleccionar documento</option>{documents.map(row => <option key={row.id} value={row.id}>{type === 'guia_remision' ? (row.numero_completo || row.id) : `${row.orden_compra_id || row.id} · ${row.estado}`}</option>)}</select></div><button className="btn btn-secondary" type="submit" disabled={!docId || busy}>Agregar</button></div>{!documents.length && <div className="text-muted" style={{ marginTop: 10 }}>No hay candidatos de este tipo sin ruta asignada.</div>}</form>
      </div>

      <div className="card"><div className="card-head"><div><div className="eyebrow">Operación</div><h3 style={{ margin: 0 }}>Paradas</h3><div className="text-muted" style={{ marginTop: 4 }}>Completar u omitir solo modifica la parada.</div></div><span className="badge badge-gray">{stops.length} total</span></div><div className="table-wrap"><table className="tbl"><thead><tr><th>#</th><th>Documento</th><th>Estado</th><th>Observaciones</th><th>Acciones</th></tr></thead><tbody>
        {stops.map((stop, index) => { const cerrada = ['completada', 'omitida'].includes(stop.estado); return <tr key={stop.id}><td><strong>{stop.secuencia}</strong></td><td>{stop.tipo_documento === 'guia_remision' ? 'Guía de remisión' : 'Tránsito OC'}<div className="text-muted mono" style={{ fontSize: 10 }}>{stop.documento_id}</div></td><td><Badge value={stop.estado} /></td><td><input className="input" value={notes[stop.id] ?? stop.observaciones ?? ''} onChange={e => setNotes(prev => ({ ...prev, [stop.id]: e.target.value }))} placeholder="Opcional" /></td><td><div className="row" style={{ gap: 4, flexWrap: 'wrap' }}><button className="btn btn-ghost btn-sm" type="button" disabled={index === 0 || busy} onClick={() => move(index, -1)}>↑</button><button className="btn btn-ghost btn-sm" type="button" disabled={index === stops.length - 1 || busy} onClick={() => move(index, 1)}>↓</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy || cerrada} onClick={() => stopAction(stop, 'completada')}>Completar</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy || cerrada} onClick={() => stopAction(stop, 'omitida')}>Omitir</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy || cerrada} onClick={() => run(() => quitarParadaRutaCtx(stop.id), 'Parada retirada; documento fuente sin cambios.')}>Quitar</button></div></td></tr>; })}
        {!stops.length && <tr><td colSpan="5" className="text-muted">Agrega documentos pendientes a esta ruta.</td></tr>}
      </tbody></table></div></div>
    </div>}

    {route && <div style={{ marginTop: 16 }}><RutaParadasMapa paradas={stops} /></div>}
  </div>;
}

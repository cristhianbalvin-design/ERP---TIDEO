import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context.jsx';
import { I } from '../icons.jsx';
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
    crearRutaCtx, eliminarRutaCtx, actualizarEstadoRutaCtx, agregarParadaRutaCtx, recargarCandidatosParadas,
    actualizarEstadoParadaRutaCtx, reordenarParadasRutaCtx, quitarParadaRutaCtx, buscarGastosCampoCtx, addToast,
  } = useApp();
  const [selectedId, setSelectedId] = useState('');
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [routeDateFilter, setRouteDateFilter] = useState('');
  const [form, setForm] = useState({ codigo: '', fecha: today(), vehiculo_id: '', conductor_id: '', transportista_id: '', observaciones: '' });
  const [type, setType] = useState('orden_compra_transito');
  const [docId, setDocId] = useState('');
  const [freeStop, setFreeStop] = useState({ descripcion_libre: '', direccion_parada: '', latitud_parada: '', longitud_parada: '', gasto_campo_id: '' });
  const [gastoQuery, setGastoQuery] = useState('');
  const [gastoOptions, setGastoOptions] = useState([]);
  const [loadingGastos, setLoadingGastos] = useState(false);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [evidenceModal, setEvidenceModal] = useState(null);
  const route = rutas.find(row => row.id === selectedId) || rutas[0] || null;
  const visibleRutas = useMemo(() => routeDateFilter ? rutas.filter(row => row.fecha === routeDateFilter) : rutas, [rutas, routeDateFilter]);
  const stops = useMemo(() => stopsOf(route), [route]);
  const vehicles = useMemo(() => transportistas.flatMap(t => (t.vehiculos || []).map(v => ({ ...v, transportista_id: v.transportista_id || t.id }))), [transportistas]);
  const drivers = useMemo(() => transportistas.flatMap(t => (t.conductores || []).map(c => ({ ...c, transportista_id: c.transportista_id || t.id }))), [transportistas]);
  const documents = type === 'guia_remision' ? candidatosParadas.guias : candidatosParadas.transitos;
  const run = async (fn, message) => { if (busy) return; setBusy(true); try { await fn(); addToast?.(message, 'success'); } catch (error) { addToast?.(error?.message || 'No se pudo completar la operación.'); } finally { setBusy(false); } };

  useEffect(() => { if (route && !rutas.some(row => row.id === selectedId)) setSelectedId(route.id); }, [route, rutas, selectedId]);

  useEffect(() => {
    if (!empresa?.id || !recargarCandidatosParadas) return;
    recargarCandidatosParadas().catch(error => addToast?.(error?.message || 'No se pudieron actualizar los documentos disponibles.'));
  }, [empresa?.id]);

  useEffect(() => {
    if (type !== 'libre' || gastoQuery.trim().length < 2) {
      setGastoOptions([]);
      return undefined;
    }
    let activo = true;
    const timer = setTimeout(async () => {
      setLoadingGastos(true);
      try {
        const data = await buscarGastosCampoCtx?.(gastoQuery);
        if (activo) setGastoOptions(data || []);
      } catch (error) {
        if (activo) addToast?.(error?.message || 'No se pudieron buscar los gastos de campo.');
      } finally {
        if (activo) setLoadingGastos(false);
      }
    }, 250);
    return () => { activo = false; clearTimeout(timer); };
  }, [type, gastoQuery]);

  const create = event => {
    event.preventDefault();
    if (!form.transportista_id || !form.vehiculo_id || !form.conductor_id) { addToast?.('Transportista, vehículo y conductor son obligatorios para crear una ruta.'); return; }
    run(async () => { const created = await crearRutaCtx(form); setSelectedId(created.id); setForm({ codigo: '', fecha: today(), vehiculo_id: '', conductor_id: '', transportista_id: '', observaciones: '' }); }, 'Ruta creada.');
  };
  const addStop = event => {
    event.preventDefault();
    if (!route) return;
    const seq = stops.reduce((max, row) => Math.max(max, Number(row.secuencia || 0)), 0) + 1;
    if (type === 'libre') {
      if (!freeStop.descripcion_libre.trim()) {
        addToast?.('La descripción de la parada libre es obligatoria.');
        return;
      }
      run(async () => {
        await agregarParadaRutaCtx(route.id, {
          tipo_documento: 'libre',
          documento_id: null,
          secuencia: seq,
          descripcion_libre: freeStop.descripcion_libre,
          direccion_parada: freeStop.direccion_parada,
          latitud_parada: freeStop.latitud_parada,
          longitud_parada: freeStop.longitud_parada,
          gasto_campo_id: freeStop.gasto_campo_id || null,
        });
        setFreeStop({ descripcion_libre: '', direccion_parada: '', latitud_parada: '', longitud_parada: '', gasto_campo_id: '' });
        setGastoQuery('');
        setGastoOptions([]);
      }, 'Parada libre agregada.');
      return;
    }
    if (!docId) return;
    run(async () => {
      await agregarParadaRutaCtx(route.id, {
        tipo_documento: type,
        documento_id: docId,
        secuencia: seq,
        direccion_parada: freeStop.direccion_parada,
        latitud_parada: freeStop.latitud_parada,
        longitud_parada: freeStop.longitud_parada,
      });
      setDocId('');
      setFreeStop(prev => ({ ...prev, direccion_parada: '', latitud_parada: '', longitud_parada: '' }));
    }, 'Parada agregada; el documento fuente no cambió.');
  };
  const move = (index, delta) => { const next = [...stops]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; run(() => reordenarParadasRutaCtx(route.id, next), 'Orden de paradas actualizado.'); };
  const stopAction = (stop, state) => run(() => actualizarEstadoParadaRutaCtx(stop.id, state, notes[stop.id] || null), `Parada ${state === 'completada' ? 'completada' : 'omitida'}; documento fuente sin cambios.`);
  const removeRoute = () => {
    if (!route || !window.confirm(`¿Eliminar la ruta ${route.codigo || route.id}? Sus paradas también se eliminarán.`)) return;
    run(async () => { await eliminarRutaCtx(route.id); setSelectedId(''); }, 'Ruta eliminada.');
  };
  const transportistaName = id => transportistas.find(t => t.id === id)?.razon_social || 'Sin transportista';
  const vehicleName = id => vehicles.find(v => v.id === id)?.placa || 'Sin vehículo';
  const driverName = id => drivers.find(c => c.id === id)?.nombre || 'Sin conductor';
  const openEvidence = (stop, kind) => setEvidenceModal({ stop, kind });
  const stopTitle = stop => stop.tipo_documento === 'libre'
    ? 'Parada libre'
    : stop.tipo_documento === 'guia_remision' ? 'Guía de remisión' : 'Tránsito OC';
  const stopReference = stop => stop.tipo_documento === 'libre'
    ? (stop.descripcion_libre || 'Sin descripción').slice(0, 90)
    : stop.documento_id;

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
        <div className="card-head"><div><div className="eyebrow">Seguimiento</div><h3 style={{ margin: 0 }}>Rutas registradas</h3></div><div className="row" style={{ gap: 8, alignItems: 'center' }}><label className="text-muted" htmlFor="filtro-rutas-fecha">Fecha</label><input id="filtro-rutas-fecha" className="input" type="date" value={routeDateFilter} onChange={e => setRouteDateFilter(e.target.value)} /><button className="btn btn-ghost btn-sm" type="button" onClick={() => setRouteDateFilter('')} disabled={!routeDateFilter}>Todas</button><span className="text-muted">{visibleRutas.length} total</span></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, padding: 14 }}>
          {visibleRutas.map(row => <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} style={{ textAlign: 'left', border: `1px solid ${row.id === route?.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: 12, background: row.id === route?.id ? 'var(--primary-light,#eff6ff)' : 'var(--surface,#fff)', cursor: 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><strong>{row.codigo}</strong><Badge value={row.estado} /></div><div className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>{row.fecha || 'Sin fecha'} · {row.ruta_paradas?.length || 0} paradas</div><div style={{ marginTop: 5, fontSize: 11 }}>{vehicleName(row.vehiculo_id)} · {driverName(row.conductor_id)}</div></button>)}
          {!visibleRutas.length && <div className="text-muted" style={{ padding: 10 }}>No hay rutas para la fecha seleccionada.</div>}
        </div>
      </div>
    </div>

    {route && <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) minmax(420px, 1.25fr)', gap: 16, alignItems: 'start', marginTop: 16 }}>
      <div className="card">
        <div className="card-head"><div><div className="eyebrow">Ruta seleccionada</div><h3 style={{ margin: 0 }}>{route.codigo}</h3><div className="text-muted" style={{ marginTop: 4 }}>{transportistaName(route.transportista_id)} · {vehicleName(route.vehiculo_id)} · {driverName(route.conductor_id)}</div></div><div className="row" style={{ gap: 8 }}><select className="input" style={{ width: 145 }} value={route.estado} disabled={busy} onChange={e => run(() => actualizarEstadoRutaCtx(route.id, e.target.value), 'Estado de ruta actualizado.')}>{Object.entries(routeStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button className="btn btn-danger btn-sm" type="button" disabled={busy} onClick={removeRoute}>Eliminar ruta</button></div></div>
        <form className="card-body" onSubmit={addStop}>
          <div className="eyebrow">Agregar parada</div>
          <div className="row" style={{ gap: 8, alignItems: 'end', flexWrap: 'wrap', marginTop: 8 }}>
            <div className="input-group"><label>Tipo</label><select className="input" value={type} onChange={e => { setType(e.target.value); setDocId(''); setFreeStop(prev => ({ ...prev, direccion_parada: '', latitud_parada: '', longitud_parada: '' })); }}><option value="orden_compra_transito">Tránsito OC</option><option value="guia_remision">Guía despacho de servicio</option><option value="libre">Parada libre</option></select></div>
            {type !== 'libre' && <div className="input-group" style={{ minWidth: 220, flex: 1 }}><label>Documento</label><select className="input" value={docId} onChange={e => setDocId(e.target.value)}><option value="">Seleccionar documento</option>{documents.map(row => <option key={row.id} value={row.id}>{type === 'guia_remision' ? (row.numero_completo || row.id) : `${row.orden_compra_codigo || row.orden_compra_id || row.id} · ${row.estado}`}</option>)}</select></div>}
            {type === 'libre' && <div className="input-group" style={{ minWidth: 260, flex: 1 }}><label>Descripción *</label><textarea className="input" rows="2" value={freeStop.descripcion_libre} onChange={e => setFreeStop(prev => ({ ...prev, descripcion_libre: e.target.value }))} placeholder="Qué se hizo en la parada" /></div>}
            <div className="input-group" style={{ minWidth: 220, flex: 1 }}><label>Dirección</label><input className="input" value={freeStop.direccion_parada} onChange={e => setFreeStop(prev => ({ ...prev, direccion_parada: e.target.value }))} placeholder="Dirección opcional" /></div>
            <div className="grid-2" style={{ gap: 8, width: '100%' }}><div className="input-group"><label>Latitud</label><input className="input" type="number" step="any" value={freeStop.latitud_parada} onChange={e => setFreeStop(prev => ({ ...prev, latitud_parada: e.target.value }))} placeholder="-12.0464" /></div><div className="input-group"><label>Longitud</label><input className="input" type="number" step="any" value={freeStop.longitud_parada} onChange={e => setFreeStop(prev => ({ ...prev, longitud_parada: e.target.value }))} placeholder="-77.0428" /></div></div>
            {type === 'libre' && <>
              <div className="input-group" style={{ minWidth: 260, flex: 1 }}><label>Buscar gasto de campo</label><input className="input" value={gastoQuery} onChange={e => { setGastoQuery(e.target.value); setFreeStop(prev => ({ ...prev, gasto_campo_id: '' })); }} placeholder="Descripción del gasto" /><select className="input" style={{ marginTop: 6 }} value={freeStop.gasto_campo_id} onChange={e => setFreeStop(prev => ({ ...prev, gasto_campo_id: e.target.value }))}><option value="">Sin gasto vinculado</option>{loadingGastos && <option disabled>Buscando...</option>}{gastoOptions.map(gasto => <option key={gasto.id} value={gasto.id}>{gasto.descripcion} · {gasto.monto} {gasto.moneda || 'PEN'} · {gasto.fecha || '-'}</option>)}</select></div>
            </>}
            <button className="btn btn-secondary" type="submit" disabled={busy || (type === 'libre' ? !freeStop.descripcion_libre.trim() : !docId)}>Agregar</button>
          </div>
          {type !== 'libre' && !documents.length && <div className="text-muted" style={{ marginTop: 10 }}>No hay candidatos de este tipo sin ruta asignada.</div>}
        </form>
      </div>

      <div className="card"><div className="card-head"><div><div className="eyebrow">Operación</div><h3 style={{ margin: 0 }}>Paradas</h3><div className="text-muted" style={{ marginTop: 4 }}>Completar u omitir solo modifica la parada.</div></div><span className="badge badge-gray">{stops.length} total</span></div><div className="table-wrap"><table className="tbl"><thead><tr><th>#</th><th>Documento</th><th>Estado</th><th>Observaciones</th><th>Acciones</th></tr></thead><tbody>
        {stops.map((stop, index) => { const cerrada = ['completada', 'omitida'].includes(stop.estado); return <tr key={stop.id} onClick={() => setSelectedStopId(stop.id)} style={{ cursor: 'pointer', background: selectedStopId === stop.id ? 'var(--primary-light,#eff6ff)' : undefined }}><td><strong>{stop.secuencia}</strong></td><td>{stopTitle(stop)}<div className="text-muted mono" style={{ fontSize: 10, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stopReference(stop)}>{stopReference(stop)}</div>{stop.tipo_documento === 'libre' && stop.gasto_campo_id && <div className="text-muted" style={{ fontSize: 10 }}>Gasto vinculado</div>}</td><td><Badge value={stop.estado} /></td><td><input className="input" value={notes[stop.id] ?? stop.observaciones ?? ''} onChange={e => setNotes(prev => ({ ...prev, [stop.id]: e.target.value }))} placeholder="Opcional" /></td><td><div className="row" style={{ gap: 4, flexWrap: 'wrap' }}><button className="btn btn-ghost btn-sm" type="button" disabled={index === 0 || busy} onClick={() => move(index, -1)}>↑</button><button className="btn btn-ghost btn-sm" type="button" disabled={index === stops.length - 1 || busy} onClick={() => move(index, 1)}>↓</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy || cerrada} onClick={() => stopAction(stop, 'completada')}>Completar</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy || cerrada} onClick={() => stopAction(stop, 'omitida')}>Omitir</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy || cerrada} onClick={() => run(() => quitarParadaRutaCtx(stop.id), 'Parada retirada; documento fuente sin cambios.')}>Quitar</button>{stop.observaciones && <button className="icon-btn" type="button" title="Ver observaciones" aria-label="Ver observaciones" onClick={e => { e.stopPropagation(); openEvidence(stop, 'observaciones'); }}>{I.file}</button>}{stop.firma_entrega_url && <button className="icon-btn" type="button" title="Ver firma" aria-label="Ver firma" onClick={e => { e.stopPropagation(); openEvidence(stop, 'firma'); }}>{I.edit}</button>}{stop.foto_entrega_url && <button className="icon-btn" type="button" title="Ver foto" aria-label="Ver foto" onClick={e => { e.stopPropagation(); openEvidence(stop, 'foto'); }}>{I.camera}</button>}</div></td></tr>; })}
        {!stops.length && <tr><td colSpan="5" className="text-muted">Agrega documentos pendientes a esta ruta.</td></tr>}
      </tbody></table></div></div>
    </div>}

    {route && <div style={{ marginTop: 16 }}><RutaParadasMapa paradas={stops} selectedStopId={selectedStopId} /></div>}

    {evidenceModal && <div className="modal-overlay" role="presentation" onClick={() => setEvidenceModal(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Evidencia de parada" style={{ width: 520, maxWidth: 'calc(100vw - 32px)' }} onClick={event => event.stopPropagation()}>
        <div className="modal-header"><div><div className="eyebrow">Evidencia de parada</div><h2 style={{ margin: 0 }}>{stopTitle(evidenceModal.stop)}</h2></div><button className="icon-btn" type="button" onClick={() => setEvidenceModal(null)}>×</button></div>
        <div className="modal-body">
          {evidenceModal.kind === 'observaciones' && <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{evidenceModal.stop.observaciones}</div>}
          {evidenceModal.kind === 'firma' && <img src={evidenceModal.stop.firma_entrega_url} alt="Firma de entrega" style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'contain', background: 'var(--surface-2,#f8fafc)', borderRadius: 8 }} />}
          {evidenceModal.kind === 'foto' && <img src={evidenceModal.stop.foto_entrega_url} alt="Foto de entrega" style={{ display: 'block', width: '100%', maxHeight: 420, objectFit: 'contain', background: 'var(--surface-2,#f8fafc)', borderRadius: 8 }} />}
        </div>
      </div>
    </div>}
  </div>;
}

import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context.jsx';

const fechaDe = value => value ? String(value).slice(0, 10) : '';
const texto = value => value == null || value === '' ? '-' : String(value);
const monto = value => value == null || value === '' ? '-' : Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TablaEstado = ({ children }) => (
  <div className="table-wrap" style={{ maxHeight: 430, overflow: 'auto' }}>
    <table className="tbl">{children}</table>
  </div>
);

export function ReportesFlotaPanel() {
  const {
    rutas = [], transportistas = [], listarLecturasFlotaCtx, listarIncidentesFlotaCtx, listarParadasLibresCtx,
  } = useApp();
  const [lecturas, setLecturas] = useState([]);
  const [incidentes, setIncidentes] = useState([]);
  const [paradasLibres, setParadasLibres] = useState([]);
  const [filtros, setFiltros] = useState({ fecha: '', ruta_id: '', vehiculo_id: '' });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const rutasPorId = useMemo(() => new Map(rutas.map(ruta => [ruta.id, ruta])), [rutas]);
  const vehiculos = useMemo(() => transportistas.flatMap(transportista => (
    (transportista.vehiculos || []).map(vehiculo => ({ ...vehiculo, transportista_id: transportista.id }))
  )), [transportistas]);

  useEffect(() => {
    let activo = true;
    Promise.all([
      listarLecturasFlotaCtx?.(),
      listarIncidentesFlotaCtx?.(),
      listarParadasLibresCtx?.(),
    ]).then(([lecturasData, incidentesData, paradasData]) => {
      if (!activo) return;
      setLecturas(lecturasData || []);
      setIncidentes(incidentesData || []);
      setParadasLibres(paradasData || []);
    }).catch(cause => {
      if (activo) setError(cause?.message || 'No se pudieron cargar los reportes de flota.');
    }).finally(() => {
      if (activo) setCargando(false);
    });
    return () => { activo = false; };
  }, []);

  const coincide = (row, fecha, vehiculoId = row.vehiculo_id) => (
    (!filtros.fecha || fechaDe(fecha) === filtros.fecha)
    && (!filtros.ruta_id || row.ruta_id === filtros.ruta_id)
    && (!filtros.vehiculo_id || vehiculoId === filtros.vehiculo_id)
  );
  const lecturasVisibles = lecturas.filter(row => coincide(row, row.fecha));
  const incidentesVisibles = incidentes.filter(row => coincide(row, row.created_at));
  const paradasVisibles = paradasLibres.filter(row => coincide(row, row.created_at, rutasPorId.get(row.ruta_id)?.vehiculo_id));
  const limpiarFiltros = () => setFiltros({ fecha: '', ruta_id: '', vehiculo_id: '' });

  return (
    <div className="col" style={{ gap: 14, marginTop: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div className="card-head" style={{ padding: 0, border: 0, marginBottom: 12 }}>
          <div><h2 style={{ margin: 0 }}>Reportes de flota</h2><div className="text-muted" style={{ fontSize: 12 }}>Lecturas, incidentes y paradas libres registradas.</div></div>
          <button className="btn btn-secondary" onClick={limpiarFiltros}>Limpiar filtros</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 10 }}>
          <label className="input-group"><span>Fecha</span><input className="input" type="date" value={filtros.fecha} onChange={event => setFiltros(prev => ({ ...prev, fecha: event.target.value }))} /></label>
          <label className="input-group"><span>Ruta</span><select className="select" value={filtros.ruta_id} onChange={event => setFiltros(prev => ({ ...prev, ruta_id: event.target.value }))}><option value="">Todas</option>{rutas.map(ruta => <option key={ruta.id} value={ruta.id}>{ruta.codigo || ruta.id}</option>)}</select></label>
          <label className="input-group"><span>Vehículo</span><select className="select" value={filtros.vehiculo_id} onChange={event => setFiltros(prev => ({ ...prev, vehiculo_id: event.target.value }))}><option value="">Todos</option>{vehiculos.map(vehiculo => <option key={vehiculo.id} value={vehiculo.id}>{vehiculo.placa || vehiculo.id}</option>)}</select></label>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {cargando && <div className="card" style={{ padding: 18 }}>Cargando reportes...</div>}

      {!cargando && <>
        <div className="card">
          <div className="card-head"><h3>Lecturas de odómetro / horómetro ({lecturasVisibles.length})</h3></div>
          <TablaEstado>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Valor</th><th>Unidad</th><th>Vehículo</th><th>Ruta</th><th>Parada</th><th>Conductor</th><th>Foto</th><th>Observaciones</th></tr></thead>
            <tbody>{lecturasVisibles.length ? lecturasVisibles.map(row => <tr key={row.id}><td>{texto(row.fecha)}</td><td>{texto(row.tipo_lectura)}</td><td>{texto(row.valor)}</td><td>{texto(row.unidad)}</td><td>{texto(vehiculos.find(v => v.id === row.vehiculo_id)?.placa || row.vehiculo_id)}</td><td>{texto(rutasPorId.get(row.ruta_id)?.codigo || row.ruta_id)}</td><td>{texto(row.parada_id)}</td><td>{texto(row.conductor_id)}</td><td>{row.foto_url ? <a href={row.foto_url} target="_blank" rel="noreferrer">Ver</a> : '-'}</td><td>{texto(row.observaciones)}</td></tr>) : <tr><td colSpan={10} className="text-muted">No hay lecturas para los filtros.</td></tr>}</tbody>
          </TablaEstado>
        </div>

        <div className="card">
          <div className="card-head"><h3>Incidentes ({incidentesVisibles.length})</h3></div>
          <TablaEstado>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Severidad</th><th>Estado</th><th>Descripción</th><th>Ruta</th><th>Parada</th><th>Vehículo</th><th>Conductor</th><th>GPS</th><th>Foto</th><th>Reportado por</th></tr></thead>
            <tbody>{incidentesVisibles.length ? incidentesVisibles.map(row => <tr key={row.id}><td>{texto(row.created_at)}</td><td>{texto(row.tipo)}</td><td>{texto(row.severidad)}</td><td>{texto(row.estado)}</td><td style={{ minWidth: 220 }}>{texto(row.descripcion)}</td><td>{texto(rutasPorId.get(row.ruta_id)?.codigo || row.ruta_id)}</td><td>{texto(row.parada_id)}</td><td>{texto(vehiculos.find(v => v.id === row.vehiculo_id)?.placa || row.vehiculo_id)}</td><td>{texto(row.conductor_id)}</td><td>{row.latitud != null && row.longitud != null ? `${row.latitud}, ${row.longitud}` : '-'}</td><td>{row.foto_url ? <a href={row.foto_url} target="_blank" rel="noreferrer">Ver</a> : '-'}</td><td>{texto(row.reportado_por)}</td></tr>) : <tr><td colSpan={12} className="text-muted">No hay incidentes para los filtros.</td></tr>}</tbody>
          </TablaEstado>
        </div>

        <div className="card">
          <div className="card-head"><h3>Paradas libres ({paradasVisibles.length})</h3></div>
          <TablaEstado>
            <thead><tr><th>Creada</th><th>Ruta</th><th>Secuencia</th><th>Estado</th><th>Descripción</th><th>Dirección</th><th>GPS planificado</th><th>Gasto campo</th><th>GPS entrega</th><th>Foto</th><th>Firma</th><th>Observaciones</th></tr></thead>
            <tbody>{paradasVisibles.length ? paradasVisibles.map(row => <tr key={row.id}><td>{texto(row.created_at)}</td><td>{texto(rutasPorId.get(row.ruta_id)?.codigo || row.ruta_id)}</td><td>{texto(row.secuencia)}</td><td>{texto(row.estado)}</td><td style={{ minWidth: 220 }}>{texto(row.descripcion_libre)}</td><td>{texto(row.direccion_parada)}</td><td>{row.latitud_parada != null && row.longitud_parada != null ? `${row.latitud_parada}, ${row.longitud_parada}` : '-'}</td><td>{texto(row.gasto_campo_id)}</td><td>{row.latitud_entrega != null && row.longitud_entrega != null ? `${row.latitud_entrega}, ${row.longitud_entrega}` : '-'}</td><td>{row.foto_entrega_url ? <a href={row.foto_entrega_url} target="_blank" rel="noreferrer">Ver</a> : '-'}</td><td>{row.firma_entrega_url ? <a href={row.firma_entrega_url} target="_blank" rel="noreferrer">Ver</a> : '-'}</td><td>{texto(row.observaciones)}</td></tr>) : <tr><td colSpan={12} className="text-muted">No hay paradas libres para los filtros.</td></tr>}</tbody>
          </TablaEstado>
        </div>
      </>}
    </div>
  );
}

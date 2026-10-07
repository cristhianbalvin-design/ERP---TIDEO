import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons.jsx';
import { recetasActividadService, mensajeErrorRecetaActividad } from '../services/recetasActividadService.js';

const estiloFila = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' };

function firmaReceta(filas = []) {
  return JSON.stringify(filas.map(fila => ({ tarea_id: fila.tarea_id, cargo_id: fila.cargo_id || null })));
}

function errorCarga(error) {
  const detalle = [error?.message, error?.details].filter(Boolean).join(' ');
  if (String(error?.code || '').toUpperCase() === '42501' || /row-level security|permission denied/i.test(detalle)) {
    return 'No tienes permiso para consultar las recetas de actividad.';
  }
  return 'No se pudieron cargar las recetas de actividad. Inténtalo nuevamente.';
}

export function RecetasActividadPanel({ empresaId, tiposServicio = [], cargos = [], role, onClose }) {
  const puedeEditar = Boolean(role?.permisos?.todo || role?.permisos?.editar?.includes('maestros'));
  const [actividades, setActividades] = useState([]);
  const [actividadId, setActividadId] = useState('');
  const [originales, setOriginales] = useState([]);
  const [filas, setFilas] = useState([]);
  const [busquedaActividad, setBusquedaActividad] = useState('');
  const [busquedaTarea, setBusquedaTarea] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState('');

  const cargarActividades = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const data = await recetasActividadService.listarActividades(empresaId);
      setActividades(data);
      setActividadId(actual => data.some(item => item.id === actual) ? actual : (data[0]?.id || ''));
    } catch (err) {
      setError(errorCarga(err));
    } finally {
      setCargando(false);
    }
  }, [empresaId]);

  useEffect(() => { cargarActividades(); }, [cargarActividades]);

  useEffect(() => {
    let vigente = true;
    if (!empresaId || !actividadId) {
      setOriginales([]);
      setFilas([]);
      return () => { vigente = false; };
    }
    setError('');
    setResultado('');
    recetasActividadService.listarTareasReceta(empresaId, actividadId)
      .then(data => {
        if (!vigente) return;
        setOriginales(data);
        setFilas(data.map(fila => ({ ...fila })));
      })
      .catch(err => { if (vigente) setError(errorCarga(err)); });
    return () => { vigente = false; };
  }, [empresaId, actividadId]);

  const actividadesVisibles = useMemo(() => {
    const busqueda = busquedaActividad.trim().toLocaleLowerCase('es');
    return actividades.filter(item => !busqueda || `${item.codigo || ''} ${item.nombre || ''}`.toLocaleLowerCase('es').includes(busqueda));
  }, [actividades, busquedaActividad]);
  const incluidas = useMemo(() => new Set(filas.map(fila => fila.tarea_id)), [filas]);
  const tareasDisponibles = useMemo(() => {
    const busqueda = busquedaTarea.trim().toLocaleLowerCase('es');
    return (tiposServicio || [])
      .filter(tarea => tarea.estado === 'activo' && tarea.id !== actividadId && !incluidas.has(tarea.id))
      .filter(tarea => !busqueda || `${tarea.codigo || ''} ${tarea.nombre || ''}`.toLocaleLowerCase('es').includes(busqueda))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  }, [tiposServicio, actividadId, incluidas, busquedaTarea]);
  const cambiosPendientes = firmaReceta(filas) !== firmaReceta(originales);
  const actividadSeleccionada = actividades.find(item => item.id === actividadId);
  const cargosActivos = (cargos || []).filter(cargo => cargo.estado === 'activo').sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

  const cambiarOrden = (indice, delta) => {
    setFilas(actuales => {
      const destino = indice + delta;
      if (destino < 0 || destino >= actuales.length) return actuales;
      const siguientes = [...actuales];
      [siguientes[indice], siguientes[destino]] = [siguientes[destino], siguientes[indice]];
      return siguientes;
    });
    setResultado('');
  };

  const guardar = async () => {
    if (!puedeEditar || !cambiosPendientes || guardando) return;
    setGuardando(true);
    setError('');
    setResultado('');
    try {
      await recetasActividadService.guardarReceta(empresaId, actividadId, originales, filas);
      const guardadas = await recetasActividadService.listarTareasReceta(empresaId, actividadId);
      setOriginales(guardadas);
      setFilas(guardadas.map(fila => ({ ...fila })));
      await cargarActividades();
      setResultado('Receta guardada correctamente.');
    } catch (err) {
      setError(mensajeErrorRecetaActividad(err));
    } finally {
      setGuardando(false);
    }
  };

  return <div className="modal-backdrop">
    <div className="modal" style={{ width: 'min(1100px, 96vw)', maxWidth: 1100, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
      <div className="modal-head">
        <div><h2>Recetas de actividad</h2><div className="text-muted" style={{ fontSize: 12 }}>Define las tareas y el cargo sugerido de cada actividad.</div></div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">{I.x}</button>
      </div>
      <div className="modal-body" style={{ overflow: 'auto' }}>
        {error && <div className="alert alert-danger" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
        {resultado && <div className="alert alert-info" role="status" style={{ marginBottom: 12 }}>{resultado}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 18 }}>
          <section>
            <label className="input-group"><span>Buscar actividad</span><input className="input" value={busquedaActividad} onChange={event => setBusquedaActividad(event.target.value)} placeholder="Nombre o código" /></label>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 10, maxHeight: 480, overflow: 'auto' }}>
              {cargando ? <div className="text-muted" style={{ padding: 14 }}>Cargando actividades…</div>
                : actividadesVisibles.length ? actividadesVisibles.map(actividad => <button key={actividad.id} type="button" onClick={() => setActividadId(actividad.id)} style={{ ...estiloFila, width: '100%', textAlign: 'left', cursor: 'pointer', background: actividad.id === actividadId ? 'var(--surface-2)' : 'transparent', color: 'inherit', border: 0, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ minWidth: 0, flex: 1 }}><strong style={{ display: 'block' }}>{actividad.nombre}</strong><small className="text-muted">{actividad.codigo || 'Sin código'}</small></span>
                  <span className="badge badge-cyan">{actividad.cantidad_tareas} tareas</span>
                </button>) : <div className="text-muted" style={{ padding: 14 }}>{actividades.length ? 'No hay coincidencias.' : 'No hay actividades activas en esta empresa.'}</div>}
            </div>
          </section>

          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 10 }}>
              <div><div className="eyebrow">Actividad seleccionada</div><strong>{actividadSeleccionada?.nombre || 'Selecciona una actividad'}</strong></div>
              <span className={`badge ${cambiosPendientes ? 'badge-orange' : 'badge-green'}`}>{cambiosPendientes ? 'Cambios sin guardar' : 'Sin cambios'}</span>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="tbl" style={{ minWidth: 520 }}>
                <thead><tr><th style={{ width: 44 }}>Orden</th><th>Tarea</th><th style={{ minWidth: 170 }}>Cargo sugerido</th><th>Acciones</th></tr></thead>
                <tbody>{filas.map((fila, indice) => <tr key={fila.tarea_id}>
                  <td>{indice + 1}</td>
                  <td><strong>{fila.tarea?.nombre || 'Tarea no disponible'}</strong><div className="text-muted" style={{ fontSize: 11 }}>{fila.tarea?.codigo || fila.tarea_id}</div></td>
                  <td><select className="select" value={fila.cargo_id || ''} disabled={!puedeEditar} onChange={event => { setFilas(actuales => actuales.map((item, i) => i === indice ? { ...item, cargo_id: event.target.value || null } : item)); setResultado(''); }}>
                    <option value="">Sin cargo sugerido</option>{cargosActivos.map(cargo => <option key={cargo.id} value={cargo.id}>{cargo.codigo ? `${cargo.codigo} · ` : ''}{cargo.nombre}</option>)}
                  </select></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" title="Subir" aria-label="Subir tarea" disabled={!puedeEditar || indice === 0} onClick={() => cambiarOrden(indice, -1)}>{I.arrowUp}</button>
                    <button className="btn btn-ghost btn-sm" title="Bajar" aria-label="Bajar tarea" disabled={!puedeEditar || indice === filas.length - 1} onClick={() => cambiarOrden(indice, 1)}>{I.arrowDown}</button>
                    <button className="btn btn-ghost btn-sm" title="Quitar" aria-label="Quitar tarea" disabled={!puedeEditar} onClick={() => { setFilas(actuales => actuales.filter((_, i) => i !== indice)); setResultado(''); }}>{I.trash}</button>
                  </td>
                </tr>)}
                  {!filas.length && <tr><td colSpan="4" className="text-muted" style={{ textAlign: 'center', padding: 18 }}>Esta actividad todavía no tiene tareas.</td></tr>}
                </tbody>
              </table>
            </div>

            {puedeEditar && <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
              <strong>Agregar tarea</strong>
              <input className="input" style={{ marginTop: 8, marginBottom: 8 }} value={busquedaTarea} onChange={event => setBusquedaTarea(event.target.value)} placeholder="Buscar por nombre o código" />
              <div style={{ maxHeight: 170, overflow: 'auto' }}>
                {tareasDisponibles.slice(0, 30).map(tarea => <div key={tarea.id} style={estiloFila}>
                  <span style={{ flex: 1 }}>{tarea.codigo ? `${tarea.codigo} · ` : ''}{tarea.nombre}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setFilas(actuales => [...actuales, { tarea_id: tarea.id, cargo_id: null, tarea }]); setBusquedaTarea(''); setResultado(''); }}>Agregar</button>
                </div>)}
                {!tareasDisponibles.length && <div className="text-muted" style={{ padding: 8 }}>No hay tareas disponibles que coincidan.</div>}
              </div>
            </div>}
            {!puedeEditar && <div className="text-muted" style={{ marginTop: 12 }}>Tienes acceso de solo lectura a las recetas de actividad.</div>}
          </section>
        </div>
      </div>
      <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span className="text-muted" style={{ fontSize: 12 }}>{puedeEditar ? 'La receta se guardará con orden consecutivo.' : 'Sin permiso de edición.'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          {puedeEditar && <button className="btn btn-primary" disabled={!cambiosPendientes || guardando || !actividadId} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar receta'}</button>}
        </div>
      </div>
    </div>
  </div>;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { calcularChipsUbicaciones, construirArbolUbicaciones, etiquetaTipoUbicacion } from './ubicacionesLogic.js';
import { cargarMapaUbicaciones } from '../../services/ubicacionesService.js';

const mensaje = error => error?.message || 'No se pudo cargar la información.';
const numero = valor => Number(valor || 0).toLocaleString('es-PE');
const iconoPin = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>;

export function UbicacionesPage() {
  const sesion = useSesionOperativa();
  const { empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance } = sesion;
  const [puedeVer, setPuedeVer] = useState(false);
  const [permisosCargados, setPermisosCargados] = useState(false);
  const [datos, setDatos] = useState({ almacenes: [], ubicaciones: [], stock: [] });
  const [almacenId, setAlmacenId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [reintento, setReintento] = useState(0);

  const recargar = useCallback(() => setReintento(valor => valor + 1), []);
  useEffect(() => {
    let vigente = true;
    if (sesion.cargando || sesion.estado !== 'listo' || !empresaId) return () => { vigente = false; };
    setPermisosCargados(false);
    setErrorCarga('');
    (async () => {
      try {
        const { data, error } = await getSupabaseClient().rpc('usuario_puede', {
          target_empresa_id: empresaId, target_pantalla: 'inventario', target_accion: 'ver',
        });
        if (error) throw error;
        if (!vigente) return;
        setPuedeVer(Boolean(data));
        setPermisosCargados(true);
      } catch (error) { if (vigente) setErrorCarga(mensaje(error)); }
    })();
    return () => { vigente = false; };
  }, [empresaId, sesion.cargando, sesion.estado, reintento]);

  useEffect(() => {
    if (!empresaId || !puedeVer || !permisosCargados || sesion.estado !== 'listo') return undefined;
    let vigente = true;
    setCargando(true);
    setErrorCarga('');
    cargarMapaUbicaciones({ empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance })
      .then(resultado => {
        if (!vigente) return;
        setDatos(resultado);
        setAlmacenId(actual => resultado.almacenes.some(item => item.id === actual) ? actual : (resultado.almacenes[0]?.id || ''));
      })
      .catch(error => { if (vigente) setErrorCarga(mensaje(error)); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, puedeVer, permisosCargados, sesion.estado, reintento]);

  const filas = useMemo(() => construirArbolUbicaciones(datos.ubicaciones, datos.stock, almacenId, busqueda), [datos, almacenId, busqueda]);
  const chips = useMemo(() => calcularChipsUbicaciones(datos.ubicaciones, datos.stock, almacenId), [datos, almacenId]);

  if (sesion.cargando || sesion.estado === 'cargando') return <section className="dx-ui dx-ubicaciones"><div className="dx-ui-empty">Cargando sesión operativa…</div></section>;
  if (!empresaId || sesion.estado === 'sin_empresa' || sesion.estado === 'sin_sesion') return <section className="dx-ui dx-ubicaciones"><div className="dx-ui-empty">Selecciona o solicita acceso a una empresa para ver ubicaciones.</div></section>;
  if (errorCarga) return <section className="dx-ui dx-ubicaciones"><div className="dx-ubicaciones-alert" role="alert">{errorCarga}</div><button type="button" className="dx-btn" onClick={recargar}>Reintentar</button></section>;
  if (!permisosCargados) return <section className="dx-ui dx-ubicaciones"><div className="dx-ui-empty">Cargando permisos de inventario…</div></section>;
  if (!puedeVer) return <section className="dx-ui dx-ubicaciones"><div className="dx-ui-empty">No tienes permiso para ver ubicaciones.</div></section>;

  const tieneUbicacionesActivas = datos.ubicaciones.some(item => item.almacen_id === almacenId && item.activo !== false);
  const textoVacio = !datos.almacenes.length ? 'No hay almacenes activos.'
    : !tieneUbicacionesActivas ? 'Este almacén no tiene ubicaciones activas.'
      : busqueda.trim() && !filas.length ? 'Sin coincidencias para tu búsqueda.' : '';

  return <section className="dx-ui dx-ubicaciones">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Almacén · WMS</div><h1 className="dx-ui-title">Ubicaciones</h1><p className="dx-ui-sub">Zonas, racks y posiciones de cada almacén. Todo el stock vive en una ubicación.</p></div></header>
    {cargando ? <div className="dx-ui-empty">Cargando mapa de ubicaciones…</div> : <>
      <div className="dx-ui-summary">
        <div className="dx-ui-chip"><b>{numero(chips.ubicaciones)}</b><span>Ubicaciones</span></div>
        <div className="dx-ui-chip"><b>{numero(chips.materialesAlmacenados)}</b><span>Materiales almacenados</span></div>
        <div className="dx-ui-chip"><b>{numero(chips.sinUbicar)}</b><span>Sin ubicar (en General)</span></div>
      </div>
      <div className="dx-ui-card">
        <div className="dx-ui-toolbar"><h2>Mapa del almacén</h2><span className="dx-ui-count">{numero(filas.length)} resultado(s)</span><label className="dx-ui-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar ubicación por código o nombre" placeholder="Buscar ubicación" value={busqueda} onChange={evento => setBusqueda(evento.target.value)} /></label></div>
        {datos.almacenes.length > 0 && <div className="dx-ubicaciones-almacenes" role="tablist" aria-label="Almacenes">{datos.almacenes.map(item => <button type="button" className={`dx-ui-tab${item.id === almacenId ? ' on' : ''}`} role="tab" aria-selected={item.id === almacenId} aria-controls="dx-ubicaciones-panel" key={item.id} onClick={() => setAlmacenId(item.id)}>{item.nombre}</button>)}</div>}
        <div id="dx-ubicaciones-panel" role="tabpanel" className="dx-ubicaciones-panel">
          {!textoVacio && <>
            <div className="dx-ui-head dx-ubicaciones-cols" aria-hidden="true"><span>Ubicación</span><span>Tipo</span><span>Materiales</span><span>Unidades</span></div>
            {filas.map(item => <div className="dx-ui-row dx-ubicaciones-cols" key={item.id}>
              <div className="dx-ubicaciones-nombre" style={{ '--dx-ubicaciones-nivel': item.nivel }}><span className={`dx-ui-icon ${item.es_general ? 'is-violet' : 'is-cyan'}`}>{iconoPin}</span><em>{item.nombre}</em><small>{item.codigo}</small></div>
              <span><span className={`dx-ui-pill ${item.es_general ? 'is-gray' : 'is-cyan'}`}><i />{etiquetaTipoUbicacion(item.tipo)}</span></span>
              <span className="dx-ubicaciones-num">{numero(item.materiales)}</span>
              <span className="dx-ubicaciones-num">{numero(item.unidades)} <small>und</small></span>
              <span className="dx-ubicaciones-movil"><b>{numero(item.unidades)} und</b><small>{numero(item.materiales)} materiales</small></span>
            </div>)}
          </>}
          {textoVacio && <div className="dx-ui-empty">{textoVacio}</div>}
        </div>
      </div>
    </>}
  </section>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { calcularChipsUbicaciones, calcularMotivoNoDesactivar, construirArbolUbicaciones, contarInactivasUbicaciones, etiquetaTipoUbicacion, etiquetaUsoUbicacion, usoUbicacion, USOS_UBICACION } from './ubicacionesLogic.js';
import { UbicacionDetalle } from './UbicacionDetalle.jsx';
import { UbicacionPanel } from './UbicacionPanel.jsx';
import { actualizarUbicacion, cargarMapaUbicaciones, cargarMaterialesPorIds, cambiarEstadoUbicacion, crearUbicacion } from '../../services/ubicacionesService.js';

const mensaje = error => error?.message || 'No se pudo cargar la información.';
const numero = valor => Number(valor || 0).toLocaleString('es-PE');
const iconoPin = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>;

export function UbicacionesPage() {
  const sesion = useSesionOperativa();
  const { empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance } = sesion;
  const [puedeVer, setPuedeVer] = useState(false);
  const [puedeCrear, setPuedeCrear] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [permisosCargados, setPermisosCargados] = useState(false);
  const [datos, setDatos] = useState({ almacenes: [], ubicaciones: [], stock: [] });
  const [almacenId, setAlmacenId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [reintentoPermisos, setReintentoPermisos] = useState(0);
  const [reintentoDatos, setReintentoDatos] = useState(0);
  const [filtroUso, setFiltroUso] = useState('');
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [seleccionadaId, setSeleccionadaId] = useState('');
  const [panel, setPanel] = useState(null);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const [enviandoEstado, setEnviandoEstado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [materiales, setMateriales] = useState([]);
  const [cargandoMateriales, setCargandoMateriales] = useState(false);
  const [errorMateriales, setErrorMateriales] = useState('');
  const controlQueAbre = useRef(null);
  const controlConfirmacion = useRef(null);
  const focoConfirmar = useRef(null);
  const enviando = useRef(false);
  const temporizadorAviso = useRef(null);

  const reintentarPermisos = useCallback(() => setReintentoPermisos(valor => valor + 1), []);
  const recargarDatos = useCallback(() => setReintentoDatos(valor => valor + 1), []);
  useEffect(() => {
    let vigente = true;
    if (sesion.cargando || sesion.estado !== 'listo' || !empresaId) return () => { vigente = false; };
    setPermisosCargados(false);
    setErrorCarga('');
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const [ver, crear, editar] = await Promise.all(['ver', 'crear', 'editar'].map(target_accion => supabase.rpc('usuario_puede', {
          target_empresa_id: empresaId, target_pantalla: 'inventario', target_accion,
        })));
        if (ver.error) throw ver.error;
        if (crear.error) throw crear.error;
        if (editar.error) throw editar.error;
        if (!vigente) return;
        setPuedeVer(Boolean(ver.data));
        setPuedeCrear(Boolean(crear.data) && Boolean(sesion.permiteEscritura));
        setPuedeEditar(Boolean(editar.data) && Boolean(sesion.permiteEscritura));
        setPermisosCargados(true);
      } catch (error) { if (vigente) setErrorCarga(mensaje(error)); }
    })();
    return () => { vigente = false; };
  }, [empresaId, sesion.cargando, sesion.estado, sesion.permiteEscritura, reintentoPermisos]);

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
  }, [empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, puedeVer, permisosCargados, sesion.estado, reintentoDatos]);

  const filas = useMemo(() => construirArbolUbicaciones(datos.ubicaciones, datos.stock, almacenId, busqueda, filtroUso, mostrarInactivas), [datos, almacenId, busqueda, filtroUso, mostrarInactivas]);
  const chips = useMemo(() => calcularChipsUbicaciones(datos.ubicaciones, datos.stock, almacenId), [datos, almacenId]);
  const inactivas = contarInactivasUbicaciones(datos.ubicaciones, almacenId);
  const seleccionada = datos.ubicaciones.find(item => item.id === seleccionadaId);
  const almacen = datos.almacenes.find(item => item.id === almacenId);
  const recargarMateriales = useCallback(async () => {
    if (!seleccionada) return;
    const ids = [...new Set(datos.stock.filter(item => item.ubicacion_id === seleccionada.id && Number(item.fisico) > 0).map(item => item.material_id).filter(Boolean))];
    setCargandoMateriales(true); setErrorMateriales('');
    try { setMateriales(await cargarMaterialesPorIds(empresaId, ids)); }
    catch (error) { setErrorMateriales(mensaje(error)); }
    finally { setCargandoMateriales(false); }
  }, [empresaId, datos.stock, seleccionadaId]);
  useEffect(() => { if (seleccionada) recargarMateriales(); }, [seleccionadaId, seleccionada, recargarMateriales]);

  const enfocarControlQueAbre = () => globalThis.setTimeout(() => {
    const control = controlQueAbre.current;
    if (control?.isConnected && globalThis.document?.contains(control)) control.focus?.();
  }, 0);
  const abrirPanel = item => { setAviso(''); setErrorAccion(''); controlQueAbre.current = globalThis.document?.activeElement; setPanel(item || {}); };
  const cerrarPanel = () => { setPanel(null); enfocarControlQueAbre(); };
  const guardarUbicacion = async formulario => {
    if (enviando.current) return;
    enviando.current = true;
    try {
      if (formulario.modo === 'nuevo') await crearUbicacion({ empresaId, almacenId: formulario.almacen_id, codigo: formulario.codigo, nombre: formulario.nombre, tipo: formulario.tipo, padreId: formulario.padre_id, uso: formulario.uso });
      else await actualizarUbicacion({ empresaId, id: formulario.id, codigo: formulario.codigo, nombre: formulario.nombre, uso: formulario.uso });
      setPanel(null);
      enfocarControlQueAbre();
      setAviso(formulario.modo === 'nuevo' ? `Se creó «${formulario.nombre}» (sin stock todavía).` : 'Cambios guardados.');
      recargarDatos();
    } finally { enviando.current = false; }
  };
  const cambiarEstado = async activo => {
    if (!seleccionada || !puedeEditar || enviando.current) return;
    enviando.current = true;
    setEnviandoEstado(true);
    setErrorAccion('');
    try {
      await cambiarEstadoUbicacion({ empresaId, id: seleccionada.id, activo });
      setConfirmarDesactivar(false);
      setAviso(`«${seleccionada.nombre}» se ${activo ? 'reactivó' : 'desactivó'}.`);
      recargarDatos();
    } catch (error) { setErrorAccion(mensaje(error)); }
    finally { enviando.current = false; setEnviandoEstado(false); }
  };
  const abrirConfirmacion = () => { setAviso(''); setErrorAccion(''); controlConfirmacion.current = globalThis.document?.activeElement; setConfirmarDesactivar(true); };
  const cerrarConfirmacion = () => { setConfirmarDesactivar(false); setErrorAccion(''); globalThis.setTimeout(() => { const control = controlConfirmacion.current; if (control?.isConnected && globalThis.document?.contains(control)) control.focus?.(); }, 0); };
  useEffect(() => { if (confirmarDesactivar) globalThis.requestAnimationFrame?.(() => focoConfirmar.current?.focus()); }, [confirmarDesactivar]);
  useEffect(() => {
    if (!aviso) return undefined;
    temporizadorAviso.current = globalThis.setTimeout(() => setAviso(''), 6000);
    return () => globalThis.clearTimeout(temporizadorAviso.current);
  }, [aviso]);
  useEffect(() => () => globalThis.clearTimeout(temporizadorAviso.current), []);

  if (sesion.cargando || sesion.estado === 'cargando') return <section className="dx-ui dx-ubicaciones"><div className="dx-ui-empty">Cargando sesión operativa…</div></section>;
  if (!empresaId || sesion.estado === 'sin_empresa' || sesion.estado === 'sin_sesion') return <section className="dx-ui dx-ubicaciones"><div className="dx-ui-empty">Selecciona o solicita acceso a una empresa para ver ubicaciones.</div></section>;
  if (errorCarga) return <section className="dx-ui dx-ubicaciones"><div className="dx-ubicaciones-alert" role="alert">{errorCarga}</div><button type="button" className="dx-btn" onClick={permisosCargados ? recargarDatos : reintentarPermisos}>Reintentar</button></section>;
  if (!permisosCargados) return <section className="dx-ui dx-ubicaciones"><div className="dx-ui-empty">Cargando permisos de inventario…</div></section>;
  if (!puedeVer) return <section className="dx-ui dx-ubicaciones"><div className="dx-ui-empty">No tienes permiso para ver ubicaciones.</div></section>;

  const tieneActivas = datos.ubicaciones.some(item => item.almacen_id === almacenId && item.activo !== false);
  const textoVacio = !datos.almacenes.length ? 'No hay almacenes activos.' : !tieneActivas ? 'Este almacén no tiene ubicaciones activas.'
    : !filas.length && (busqueda.trim() || filtroUso) ? 'Sin coincidencias para tu búsqueda.' : '';
  const abrirFila = item => { setAviso(''); setErrorAccion(''); setSeleccionadaId(item.id); };
  const volverAlMapa = () => { setAviso(''); setErrorAccion(''); setSeleccionadaId(''); };
  const motivoNoDesactivar = seleccionada?.activo ? calcularMotivoNoDesactivar(seleccionada, datos.ubicaciones, datos.stock) : '';
  const detalle = seleccionada && almacen && <UbicacionDetalle ubicacion={seleccionada} almacen={almacen} ubicaciones={datos.ubicaciones} stock={datos.stock} materiales={materiales} errorMateriales={errorMateriales} cargandoMateriales={cargandoMateriales} motivoNoDesactivar={motivoNoDesactivar} errorAccion={seleccionada.activo ? '' : errorAccion} onBack={volverAlMapa} onOpen={item => { setAviso(''); setErrorAccion(''); setSeleccionadaId(item.id); }} onRetry={recargarMateriales} />;
  return <section className="dx-ui dx-ubicaciones">
    <header className={`dx-ui-head-page${seleccionada ? ' dx-ubicaciones-head-detalle' : ''}`}><div><div className="dx-ui-eyebrow">Almacén · WMS</div><h1 className="dx-ui-title">{seleccionada ? seleccionada.nombre : 'Ubicaciones'}</h1><p className="dx-ui-sub">{seleccionada ? `${almacen?.nombre || ''} · ${seleccionada.codigo}` : 'Zonas, racks y posiciones de cada almacén. Todo el stock vive en una ubicación.'}</p></div>{seleccionada && puedeEditar && !seleccionada.es_general ? <div className="dx-ubicaciones-acciones"><button type="button" className="dx-btn" onClick={() => abrirPanel(seleccionada)}>Editar</button>{seleccionada.activo
      ? <button type="button" className="dx-btn danger" onClick={abrirConfirmacion} disabled={Boolean(motivoNoDesactivar)} aria-describedby={motivoNoDesactivar ? 'dx-ubicaciones-motivo' : undefined}>Desactivar</button>
      : <button type="button" className="dx-btn primary" onClick={() => cambiarEstado(true)} disabled={enviandoEstado}>Reactivar</button>}</div> : !seleccionada && puedeCrear && <button type="button" className="dx-btn primary" onClick={() => abrirPanel(null)}>+ Nueva ubicación</button>}</header>
    {aviso && <div className="dx-ubicaciones-toast" role="status">{aviso}</div>}
    {cargando && !seleccionada && !datos.almacenes.length ? <div className="dx-ui-empty">Cargando mapa de ubicaciones…</div> : seleccionada ? detalle : <>
      <div className="dx-ui-summary"><div className="dx-ui-chip"><b>{numero(chips.ubicaciones)}</b><span>Ubicaciones</span></div><div className="dx-ui-chip"><b>{numero(chips.materialesAlmacenados)}</b><span>Materiales almacenados</span></div><div className="dx-ui-chip"><b>{numero(chips.sinUbicar)}</b><span>Sin ubicar (en General)</span></div></div>
      <div className="dx-ui-card">
        <div className="dx-ui-toolbar"><h2>Mapa del almacén</h2><span className="dx-ui-count">{numero(filas.length)} resultado(s)</span>
          <select className="dx-ubicaciones-filtro" aria-label="Filtrar por uso" value={filtroUso} onChange={evento => setFiltroUso(evento.target.value)}><option value="">Todos los usos</option>{Object.entries(USOS_UBICACION).map(([uso, etiqueta]) => <option key={uso} value={uso}>{etiqueta}</option>)}</select>
          <button type="button" className={`dx-ubicaciones-switch${mostrarInactivas ? ' on' : ''}`} role="switch" aria-checked={mostrarInactivas} disabled={!inactivas} onClick={() => setMostrarInactivas(actual => !actual)}>Mostrar inactivas ({numero(inactivas)})</button>
          <label className="dx-ui-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar ubicación por código o nombre" placeholder="Buscar ubicación" value={busqueda} onChange={evento => setBusqueda(evento.target.value)} /></label></div>
        {datos.almacenes.length > 0 && <div className="dx-ubicaciones-almacenes" role="tablist" aria-label="Almacenes">{datos.almacenes.map(item => <button type="button" className={`dx-ui-tab${item.id === almacenId ? ' on' : ''}`} role="tab" aria-selected={item.id === almacenId} aria-controls="dx-ubicaciones-panel" key={item.id} onClick={() => { setAviso(''); setAlmacenId(item.id); }}>{item.nombre}</button>)}</div>}
        <div id="dx-ubicaciones-panel" role="tabpanel" className="dx-ubicaciones-panel">
          {!textoVacio && filas.length > 0 && <div className="dx-ui-head dx-ubicaciones-cols" aria-hidden="true"><span>Ubicación</span><span>Tipo</span><span>Materiales</span><span>Unidades</span><span /></div>}
          {!textoVacio && filas.map(item => <div className={`dx-ui-row dx-ubicaciones-cols${item.activo === false ? ' is-off' : ''}`} key={item.id} role="button" tabIndex={0} aria-label={`Abrir ${item.nombre}`} onClick={() => abrirFila(item)} onKeyDown={evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); abrirFila(item); } }}>
            <div className="dx-ubicaciones-nombre" style={{ '--dx-ubicaciones-nivel': item.nivel }}><span className={`dx-ui-icon ${item.es_general ? 'is-violet' : 'is-cyan'}`}>{iconoPin}</span><em>{item.nombre}</em><small>{item.codigo}</small></div>
            <span>{item.activo === false ? <span className="dx-ui-pill is-gray"><i />Inactiva</span> : <span className={`dx-ui-pill ${item.es_general ? 'is-gray' : 'is-cyan'}`}><i />{etiquetaTipoUbicacion(item.tipo)}</span>}{item.activo !== false && usoUbicacion(item) !== 'almacenaje' && <span className={`dx-ui-pill ${['cuarentena', 'merma'].includes(usoUbicacion(item)) ? 'is-amber' : 'is-cyan'}`}><i />{etiquetaUsoUbicacion(usoUbicacion(item))}</span>}</span>
            <span className="dx-ubicaciones-num">{numero(item.materiales)}</span><span className="dx-ubicaciones-num">{numero(item.unidades)} <small>und</small></span><span className="dx-ubicaciones-movil"><b>{numero(item.unidades)} und</b><small>{numero(item.materiales)} materiales</small></span><span className="dx-ubicaciones-flecha" aria-hidden="true">›</span>
          </div>)}
          {textoVacio && <div className="dx-ui-empty">{textoVacio}</div>}{!textoVacio && !filas.length && <div className="dx-ui-empty">Sin coincidencias para tu búsqueda.</div>}
        </div>
      </div>
    </>}
    {panel && almacen && <UbicacionPanel almacen={almacen} ubicaciones={datos.ubicaciones} ubicacion={panel.id ? panel : null} onClose={cerrarPanel} onSave={guardarUbicacion} />}
    {confirmarDesactivar && seleccionada && <div className="dx-ubicaciones-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget && !enviandoEstado) cerrarConfirmacion(); }}><section className="dx-ubicaciones-confirm" role="alertdialog" aria-modal="true" aria-labelledby="dx-ubicaciones-confirm-titulo" aria-describedby="dx-ubicaciones-confirm-texto" onKeyDown={evento => { if (evento.key === 'Escape' && !enviandoEstado) { evento.stopPropagation(); cerrarConfirmacion(); } else if (evento.key === 'Tab' && evento.shiftKey && globalThis.document?.activeElement === focoConfirmar.current) { evento.preventDefault(); evento.currentTarget.querySelector('[data-confirmar]')?.focus(); } else if (evento.key === 'Tab' && !evento.shiftKey && evento.target === evento.currentTarget.querySelector('[data-confirmar]')) { evento.preventDefault(); focoConfirmar.current?.focus(); } }}><h2 id="dx-ubicaciones-confirm-titulo">¿Desactivar «{seleccionada.nombre}»?</h2><p id="dx-ubicaciones-confirm-texto">Dejará de aparecer como destino en Recepciones. El historial y el kardex no cambian, y podrás reactivarla cuando quieras.</p>{errorAccion && <div className="dx-ubicaciones-alert" role="alert">{errorAccion}</div>}<div><button ref={focoConfirmar} type="button" className="dx-btn" onClick={cerrarConfirmacion} disabled={enviandoEstado}>Cancelar</button><button data-confirmar type="button" className="dx-btn danger" onClick={() => cambiarEstado(false)} disabled={enviandoEstado}>{enviandoEstado ? 'Desactivando…' : 'Desactivar'}</button></div></section></div>}
  </section>;
}

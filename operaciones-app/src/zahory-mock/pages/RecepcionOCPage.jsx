import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { armarPayloadRecepcion, componerObservacion, lineaHabilitada, ordenarUbicacionesPorJerarquia, pendientePorLinea, textoUbicacionDestino, validarCantidades } from './recepcionOCLogic.js';
import { cargarRecepcionesOC, cargarUbicacionesAlmacen, registrarRecepcionOC } from '../../services/recepcionOCService.js';

const mensaje = error => error?.message || 'No se pudo cargar la información.';
const nombreProveedor = (proveedores, id) => {
  const proveedor = proveedores.find(item => item.id === id);
  return proveedor?.nombre_comercial || proveedor?.razon_social || id || 'Proveedor sin nombre';
};
const fechaCorta = valor => valor ? new Date(`${String(valor).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function RecepcionOCPage() {
  const sesion = useSesionOperativa();
  const { empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance } = sesion;
  const [datos, setDatos] = useState({ ordenes: [], almacenes: [], recepciones: [], proveedores: [] });
  const [ubicaciones, setUbicaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [error, setError] = useState('');
  const [puedeVer, setPuedeVer] = useState(false);
  const [permisosCargados, setPermisosCargados] = useState(false);
  const [puedeCrear, setPuedeCrear] = useState(false);
  const [q, setQ] = useState('');
  const [seleccionada, setSeleccionada] = useState(null);
  const [almacenId, setAlmacenId] = useState('');
  const [cantidades, setCantidades] = useState({});
  const [ubicacionesPorLinea, setUbicacionesPorLinea] = useState({});
  const [observadas, setObservadas] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState('');
  const enviando = useRef(false);

  const cargar = async () => {
    setCargando(true); setErrorCarga('');
    try {
      const resultado = await cargarRecepcionesOC({ empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance });
      setDatos(resultado);
      if (resultado.almacenes.length === 1) setAlmacenId(resultado.almacenes[0].id);
    } catch (err) { setErrorCarga(mensaje(err)); }
    finally { setCargando(false); }
  };

  useEffect(() => {
    let vigente = true;
    async function iniciar() {
      if (sesion.cargando || sesion.estado !== 'listo' || !empresaId) return;
      try {
        const supabase = getSupabaseClient();
        const [ver, recepciones, inventario] = await Promise.all([
          supabase.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'recepciones', target_accion: 'ver' }),
          supabase.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'recepciones', target_accion: 'crear' }),
          supabase.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'inventario', target_accion: 'crear' }),
        ]);
        if (!vigente) return;
        if (ver.error) throw ver.error;
        if (recepciones.error) throw recepciones.error;
        if (inventario.error) throw inventario.error;
        setPuedeVer(Boolean(ver.data));
        setPuedeCrear(Boolean(recepciones.data) && Boolean(inventario.data) && Boolean(sesion.permiteEscritura));
        setPermisosCargados(true);
      } catch (err) { if (vigente) setErrorCarga(mensaje(err)); }
    }
    iniciar();
    return () => { vigente = false; };
  }, [empresaId, sesion.cargando, sesion.estado, sesion.permiteEscritura]);

  useEffect(() => {
    if (!empresaId || !puedeVer || sesion.estado !== 'listo') return;
    cargar();
  }, [empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, puedeVer, sesion.estado]);

  useEffect(() => {
    if (!seleccionada || !almacenId) { setUbicaciones([]); return; }
    let vigente = true;
    setCargandoUbicaciones(true);
    cargarUbicacionesAlmacen(empresaId, almacenId).then(items => {
      if (!vigente) return;
      const ordenadas = ordenarUbicacionesPorJerarquia(items);
      setUbicaciones(ordenadas);
      setUbicacionesPorLinea(actual => {
        const siguiente = { ...actual };
        (seleccionada.items || []).forEach((_, idx) => {
          if (!ordenadas.some(item => item.id === siguiente[idx])) siguiente[idx] = ordenadas.find(item => item.es_general)?.id || '';
        });
        return siguiente;
      });
    }).catch(err => { if (vigente) setError(mensaje(err)); }).finally(() => { if (vigente) setCargandoUbicaciones(false); });
    return () => { vigente = false; };
  }, [empresaId, almacenId, seleccionada?.id]);

  const lineas = useMemo(() => (seleccionada?.items || []).map((item, idx) => ({ ...item, idx, pendiente: pendientePorLinea(seleccionada, datos.recepciones, idx) })), [seleccionada, datos.recepciones]);
  const cantidadesActuales = lineas.map(linea => lineaHabilitada(linea) ? (cantidades[linea.idx] ?? linea.pendiente) : 0);
  const cantidadesValidas = validarCantidades(lineas, cantidadesActuales);
  const total = cantidadesActuales.reduce((suma, cantidad) => suma + (Number(cantidad) || 0), 0);
  const nObservadas = lineas.filter(linea => observadas[linea.idx]).length;
  const ordenesFiltradas = datos.ordenes.filter(oc => `${oc.codigo || oc.id} ${nombreProveedor(datos.proveedores, oc.proveedor_id)}`.toLowerCase().includes(q.toLowerCase()));
  const observadasOC = new Set(datos.recepciones.filter(item => item.estado === 'observada').map(item => item.orden_compra_id)).size;
  const parciales = datos.ordenes.filter(oc => oc.estado === 'recibida_parcial').length;

  const abrir = oc => {
    setSeleccionada(oc); setError(''); setExito(''); setCantidades({}); setUbicacionesPorLinea({}); setObservadas({});
    setAlmacenId(datos.almacenes.length === 1 ? datos.almacenes[0].id : '');
  };
  const volver = () => { setSeleccionada(null); setError(''); };
  const registrar = async () => {
    if (enviando.current || !puedeCrear || !almacenId || !cantidadesValidas || total <= 0) return;
    enviando.current = true; setGuardando(true); setError('');
    try {
      const payload = armarPayloadRecepcion(seleccionada, lineas, cantidadesActuales, ubicacionesPorLinea);
      const observaciones = componerObservacion(lineas, observadas);
      const resultado = await registrarRecepcionOC({ empresaId, ordenCompraId: seleccionada.id, almacenId, lineas: payload, observaciones });
      setExito(`Recepción registrada. ${resultado?.movimientos ?? ''} movimiento(s) en kardex.`);
      setSeleccionada(null);
      await cargar();
    } catch (err) { setError(mensaje(err)); }
    finally { enviando.current = false; setGuardando(false); }
  };

  if (sesion.cargando || sesion.estado === 'cargando') return <section className="dx-ui dx-recepcion"><div className="dx-ui-empty">Cargando sesión operativa…</div></section>;
  if (!sesion.empresaId || sesion.estado === 'sin_empresa' || sesion.estado === 'sin_sesion') return <section className="dx-ui dx-recepcion"><div className="dx-ui-empty">Selecciona o solicita acceso a una empresa para ver recepciones.</div></section>;
  if (errorCarga) return <section className="dx-ui dx-recepcion"><div className="dx-recepcion-alert" role="alert">{errorCarga}</div><button className="dx-btn" onClick={cargar}>Reintentar</button></section>;
  if (!permisosCargados) return <section className="dx-ui dx-recepcion"><div className="dx-ui-empty">Cargando permisos de recepciones...</div></section>;
  if (!puedeVer) return <section className="dx-ui dx-recepcion"><div className="dx-ui-empty">No tienes permiso para ver recepciones de compra.</div></section>;

  return <section className="dx-ui dx-recepcion">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Almacén · WMS</div><h1 className="dx-ui-title">{seleccionada ? `Recepción ${seleccionada.codigo || seleccionada.id}` : 'Recepciones de compra'}</h1><p className="dx-ui-sub">{seleccionada ? 'Confirma cantidades y asigna la ubicación de cada línea.' : 'Registra el ingreso físico de las órdenes de compra a su ubicación.'}</p></div></header>
    {exito && <div className="dx-recepcion-success" role="status">{exito}</div>}
    {error && <div className="dx-recepcion-alert" role="alert">{error}</div>}
    {!puedeCrear && <div className="dx-recepcion-readonly">Vista de solo lectura: necesitas permiso para crear recepciones e inventario.</div>}
    {cargando ? <div className="dx-ui-empty">Cargando órdenes de compra…</div> : seleccionada ? <>
      <button type="button" className="dx-recepcion-back" onClick={volver}>← Volver a recepciones</button>
      <div className="dx-ui-card">
        <div className="dx-ui-toolbar"><h2>{seleccionada.codigo || seleccionada.id} · {nombreProveedor(datos.proveedores, seleccionada.proveedor_id)}</h2><span className="dx-ui-pill is-cyan"><i />{seleccionada.estado === 'recibida_parcial' ? 'Parcial' : 'Pendiente'}</span></div>
        <div className="dx-recepcion-meta"><label><small>Almacén destino</small><select aria-label="Almacén destino" className="dx-recepcion-field" value={almacenId} disabled={!puedeCrear || guardando || datos.almacenes.length === 1} onChange={e => setAlmacenId(e.target.value)}><option value="">Seleccionar almacén…</option>{datos.almacenes.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><div><small>Emisión</small><span>{fechaCorta(seleccionada.fecha_emision)}</span></div><div><small>Avance</small><span>{Number(seleccionada.porcentaje_recibido) || 0}% recibido</span></div></div>
        <div className="dx-ui-head dx-recepcion-line-cols" aria-hidden="true"><span>Material</span><span>Pedido</span><span>Pendiente</span><span>A recibir</span><span>Ubicación destino</span><span /></div>
        {lineas.map(linea => {
          const enabled = puedeCrear && !guardando && lineaHabilitada(linea);
          const quantity = lineaHabilitada(linea) ? (cantidades[linea.idx] ?? linea.pendiente) : 0;
          const bad = !Number.isFinite(Number(quantity)) || Number(quantity) < 0 || Number(quantity) > linea.pendiente;
          return <div className={`dx-ui-row dx-recepcion-line-cols${!linea.material_id ? ' is-disabled' : ''}`} key={`${linea.item_id || linea.idx}`}>
            <span className="dx-recepcion-main"><b>{linea.descripcion || 'Línea sin descripción'}</b><small>{linea.codigo || linea.material_id || '—'}</small>{!linea.material_id && <em>Sin material del catálogo: se recibe desde Administración</em>}</span>
            <span><span className="dx-recepcion-label">Pedido</span><span className="dx-recepcion-num">{Number(linea.cantidad) || 0} {linea.unidad || ''}</span></span><span><span className="dx-recepcion-label">Pendiente</span><span className="dx-recepcion-num">{linea.pendiente}</span></span>
            <span><span className="dx-recepcion-label">A recibir</span><input aria-label={`Cantidad a recibir de ${linea.descripcion || 'línea'}`} className={`dx-recepcion-field${bad ? ' is-bad' : ''}`} type="number" min="0" max={linea.pendiente} step="any" value={quantity} disabled={!enabled} onChange={e => setCantidades(actual => ({ ...actual, [linea.idx]: e.target.value }))} /></span>
            <span><span className="dx-recepcion-label">Ubicación destino</span><select aria-label={`Ubicación destino de ${linea.descripcion || 'línea'}`} className="dx-recepcion-field" value={ubicacionesPorLinea[linea.idx] || ''} disabled={!enabled || cargandoUbicaciones || !almacenId} onChange={e => setUbicacionesPorLinea(actual => ({ ...actual, [linea.idx]: e.target.value }))}><option value="">General (sin asignar)</option>{ubicaciones.map(item => <option key={item.id} value={item.id}>{'　'.repeat(item.nivel)}{textoUbicacionDestino(item)}</option>)}</select></span>
            <button type="button" aria-label={`Marcar observación en ${linea.descripcion || 'línea'}`} title="Observar línea" className={`dx-recepcion-obs${observadas[linea.idx] ? ' on' : ''}`} disabled={!enabled} onClick={() => setObservadas(actual => ({ ...actual, [linea.idx]: !actual[linea.idx] }))}>!</button>
          </div>;
        })}
        <div className="dx-recepcion-valid"><span className={`dx-ui-pill ${cantidadesValidas ? 'is-green' : 'is-red'}`}><i />Cantidades ≤ pendiente</span><span className={`dx-ui-pill ${cantidadesValidas ? 'is-green' : 'is-red'}`}><i />{cantidadesValidas ? 'Validación 3 vías de cantidad OK' : 'Cantidad fuera de rango'}</span><span className={`dx-ui-pill ${almacenId ? 'is-green' : 'is-red'}`}><i />{almacenId ? 'Almacén seleccionado' : 'Selecciona almacén destino'}</span><span className="dx-ui-pill is-gray"><i />Factura: se completa después en Administración</span></div>
        {cargandoUbicaciones && <div className="dx-recepcion-note">Cargando ubicaciones activas del almacén…</div>}
        <div className="dx-recepcion-note">Esta pantalla registra solo el ingreso <b>físico</b> (stock y kardex). La factura y la cuenta por pagar se completan desde Administración con &quot;Completar factura&quot;.</div>
        <div className="dx-recepcion-foot"><span className="msg">Total a recibir: <b>{total}</b> unidad(es) · {nObservadas} línea(s) observada(s)</span><span className={`dx-ui-pill ${nObservadas ? 'is-amber' : 'is-green'}`}><i />Quedará {nObservadas ? 'observada' : 'conforme'}</span><button type="button" className="dx-btn" disabled={guardando} onClick={volver}>Cancelar</button><button type="button" className="dx-btn primary" disabled={guardando || !puedeCrear || !almacenId || !cantidadesValidas || total === 0 || cargandoUbicaciones} onClick={registrar}>{guardando ? 'Registrando…' : 'Registrar recepción'}</button></div>
      </div>
    </> : <>
      <div className="dx-ui-summary"><div className="dx-ui-chip"><b>{datos.ordenes.length}</b><span>OC por recibir</span></div><div className="dx-ui-chip"><b>{parciales}</b><span>Recepción parcial</span></div><div className="dx-ui-chip"><b>{observadasOC}</b><span>Observadas</span></div></div>
      <div className="dx-ui-card"><div className="dx-ui-toolbar"><h2>Órdenes de compra</h2><span className="dx-ui-count">{ordenesFiltradas.length} resultado(s)</span><label className="dx-ui-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar orden de compra por código o proveedor" placeholder="Buscar por OC o proveedor" value={q} onChange={e => setQ(e.target.value)} /></label></div>
        <div className="dx-ui-head dx-recepcion-cols" aria-hidden="true"><span>OC</span><span>Proveedor</span><span>Avance</span><span>Estado</span><span>Emisión</span><span /></div>
        {ordenesFiltradas.map(oc => { const pct = Number(oc.porcentaje_recibido) || 0; return <div key={oc.id} className="dx-ui-row dx-recepcion-cols" role="button" tabIndex={0} aria-label={`Abrir ${oc.codigo || oc.id}`} onClick={() => abrir(oc)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(oc); } }}><span className="dx-recepcion-oc"><span className="dx-ui-icon is-cyan">▣</span>{oc.codigo || oc.id}</span><span className="dx-recepcion-main"><b>{nombreProveedor(datos.proveedores, oc.proveedor_id)}</b><small>{(oc.items || []).length} línea(s) · {datos.almacenes.length === 1 ? datos.almacenes[0].nombre : `${datos.almacenes.length} almacenes disponibles`}</small></span><span className="dx-recepcion-progress">{pct}% recibido<span className="dx-recepcion-bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span></span><span><span className={`dx-ui-pill ${oc.estado === 'recibida_parcial' ? 'is-cyan' : 'is-amber'}`}><i />{oc.estado === 'recibida_parcial' ? 'Parcial' : 'Pendiente'}</span></span><span>{fechaCorta(oc.fecha_emision)}</span><span className="dx-recepcion-arrow">›</span></div>; })}
        {!ordenesFiltradas.length && <div className="dx-ui-empty">{q ? 'Sin coincidencias para tu búsqueda.' : cargando ? 'Cargando órdenes…' : 'No hay órdenes de compra pendientes de recepción.'}</div>}
      </div>
    </>}
  </section>;
}

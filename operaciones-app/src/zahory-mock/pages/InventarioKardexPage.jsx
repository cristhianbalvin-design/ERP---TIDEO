import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { cargarInventarioKardex, cargarKardexPorMaterial } from '../../services/inventarioKardexService.js';
import { calcularStockMaterial, cantidadConSigno, claseTipoMovimiento, consolidarStockPorMaterial, etiquetaTipoMovimiento, etiquetaValorizacion, esTransferencia } from './inventarioKardexLogic.js';
import { MovimientoPanel } from './MovimientoPanel.jsx';
import { MovimientoDetalle } from './MovimientoDetalle.jsx';
import { TransferenciaPanel } from './TransferenciaPanel.jsx';
import { LiberarCuarentenaPanel } from './LiberarCuarentenaPanel.jsx';
import { anularMovimiento, liberarCuarentena, registrarMovimientoManual, transferirStock } from '../../services/inventarioMovimientosService.js';
import { etiquetaMotivoMovimiento, mapearErrorMovimiento } from './inventarioMovimientosLogic.js';

const fmtNumero = valor => Number(valor || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });
const fmtDinero = (valor, moneda = 'PEN') => {
  const codigo = String(moneda || 'PEN').toUpperCase();
  const simbolo = codigo === 'PEN' ? 'S/' : codigo === 'USD' ? 'US$' : `${codigo} `;
  return `${simbolo} ${Number(valor || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtTotales = items => {
  const porMoneda = new Map();
  items.forEach(({ material, calculo }) => {
    const moneda = String(material.moneda || 'PEN').toUpperCase();
    porMoneda.set(moneda, (porMoneda.get(moneda) || 0) + calculo.valor);
  });
  return [...porMoneda].map(([moneda, valor]) => fmtDinero(valor, moneda)).join(' · ') || fmtDinero(0);
};
const fmtFecha = valor => valor ? new Date(valor).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const mensajeError = error => error?.message || 'No se pudo cargar la información.';
const costoMovimiento = movimiento => String(movimiento.moneda || 'PEN').toUpperCase() === 'USD'
  ? movimiento.costo_unitario_usd ?? movimiento.precio_unitario_provisional ?? movimiento.precio_unitario_real
  : movimiento.costo_unitario ?? movimiento.precio_unitario_real ?? movimiento.precio_unitario_provisional;

function PillEstado({ estado }) {
  const variante = estado === 'agotado' ? 'is-red' : estado === 'bajo' ? 'is-amber' : 'is-green';
  const etiqueta = estado === 'agotado' ? 'Agotado' : estado === 'bajo' ? 'Bajo reorden' : 'Normal';
  return <span className={`dx-ui-pill ${variante}`}><i />{etiqueta}</span>;
}

function PillTipo({ tipo }) {
  return <span className={`dx-ui-pill ${claseTipoMovimiento(tipo)}`}><i />{etiquetaTipoMovimiento(tipo)}</span>;
}

function MovimientoFila({ movimiento, conMaterial, onOpen, onSelect }) {
  const material = movimiento.materiales || {};
  const cantidad = cantidadConSigno(movimiento);
  const nombre = material.descripcion || movimiento.material_id;
  const nombreAlmacen = movimiento.almacenes?.nombre || movimiento.almacenes?.codigo || movimiento.almacen_id || '—';
  const nombreUbicacion = movimiento.ubicaciones?.nombre || movimiento.ubicaciones?.codigo;
  const referencia = movimiento.nro_documento || movimiento.referencia_id || movimiento.referencia_tipo || '';
  const transferencia = esTransferencia(movimiento);
  const motivoVisible = movimiento.motivo === 'liberacion_cuarentena' ? etiquetaMotivoMovimiento(movimiento.motivo) : transferencia ? 'Transferencia' : etiquetaMotivoMovimiento(movimiento.motivo);
  const detalle = [motivoVisible, referencia].filter(Boolean).join(' · ');
  const saldo = movimiento.saldo_cantidad;
  const anulado = Boolean(movimiento.anulado);
  const abrir = () => onSelect ? onSelect(movimiento) : conMaterial ? onOpen?.(movimiento.material_id) : undefined;
  return <div className={`dx-ui-row ${conMaterial ? 'dx-stk-kcols' : 'dx-stk-dcols'} dx-mov-click${anulado ? ' is-void' : ''}`} role="button" tabIndex={0} aria-label={conMaterial ? `Ver movimiento de ${nombre}` : `Ver movimiento: ${detalle || etiquetaTipoMovimiento(movimiento.tipo)}`} onClick={abrir} onKeyDown={evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); abrir(); } }}>
    <span className="dx-stk-date">{fmtFecha(movimiento.created_at || movimiento.fecha)}</span>
    {conMaterial ? <span className="dx-stk-main"><span><b>{nombre}</b><small>{[nombreAlmacen, nombreUbicacion, detalle].filter(Boolean).join(' \u00b7 ')}</small></span></span> : <PillTipo tipo={movimiento.tipo} />}
    {conMaterial ? <PillTipo tipo={movimiento.tipo} /> : <span className="dx-stk-main"><span><b>{detalle || etiquetaTipoMovimiento(movimiento.tipo)}</b><small>{nombreAlmacen}{movimiento.ubicaciones?.nombre ? ` · ${movimiento.ubicaciones.nombre}` : ''}</small></span></span>}
    <div className={`dx-stk-qty ${cantidad >= 0 ? 'in' : 'out'}`}>{cantidad > 0 ? '+' : '−'}{fmtNumero(Math.abs(cantidad))}</div>
    <div className="dx-stk-n"><span className="dx-stk-lbl">Costo unit.</span>{fmtDinero(costoMovimiento(movimiento), movimiento.moneda || material.moneda)}<small><span className={`dx-ui-pill ${anulado ? 'is-gray' : etiquetaValorizacion(movimiento) === 'Provisional' ? 'is-amber' : 'is-green'}`}><i />{etiquetaValorizacion(movimiento)}</span></small></div>
    <div className="dx-stk-n"><span className="dx-stk-lbl">Saldo</span>{saldo == null ? '—' : fmtNumero(saldo)}</div>
    {conMaterial && <svg className="dx-ui-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>}
  </div>;
}

export function InventarioKardexPage() {
  const sesion = useSesionOperativa();
  const { empresaId, sociedadId, sociedadActiva, vistaConsolidada, sociedadesIdsAlcance } = sesion;
  const [puedeVer, setPuedeVer] = useState(false);
  const [permiteCrear, setPermiteCrear] = useState(false);
  const [permiteEditar, setPermiteEditar] = useState(false);
  const [permiteLiberar, setPermiteLiberar] = useState(false);
  const [permisosCargados, setPermisosCargados] = useState(false);
  const [datos, setDatos] = useState({ almacenes: [], ubicaciones: [], stock: [], kardex: [], kardexParcial: false, limiteKardex: 200 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [reintentoPermisos, setReintentoPermisos] = useState(0);
  const [reintentoCarga, setReintentoCarga] = useState(0);
  const [vista, setVista] = useState('stock');
  const [busqueda, setBusqueda] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [kardexMaterial, setKardexMaterial] = useState([]);
  const [kardexMaterialParcial, setKardexMaterialParcial] = useState(false);
  const [cargandoKardexMaterial, setCargandoKardexMaterial] = useState(false);
  const [errorKardexMaterial, setErrorKardexMaterial] = useState('');
  const [reintentoKardexMaterial, setReintentoKardexMaterial] = useState(0);
  const [panelAccion, setPanelAccion] = useState('');
  const [transferenciaInicial, setTransferenciaInicial] = useState(null);
  const [liberacionInicial, setLiberacionInicial] = useState(null);
  const [movimientoDetalle, setMovimientoDetalle] = useState(null);
  const [toast, setToast] = useState('');
  const controlQueAbre = useRef(null);

  useEffect(() => {
    if (!toast) return undefined;
    const temporizador = globalThis.setTimeout(() => setToast(''), 6000);
    return () => globalThis.clearTimeout(temporizador);
  }, [toast]);

  useEffect(() => {
    let vigente = true;
    if (sesion.cargando || sesion.estado !== 'listo' || !empresaId) return () => { vigente = false; };
    setPermisosCargados(false);
    Promise.all(['ver', 'crear', 'editar', 'liberar'].map(target_accion => getSupabaseClient().rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'inventario', target_accion })))
      .then(([ver, crear, editar, liberar]) => {
        if (ver.error) throw ver.error;
        if (crear.error) throw crear.error;
        if (editar.error) throw editar.error;
        if (liberar.error) throw liberar.error;
        if (vigente) { setPuedeVer(Boolean(ver.data)); setPermiteCrear(Boolean(crear.data)); setPermiteEditar(Boolean(editar.data)); setPermiteLiberar(Boolean(liberar.data)); setPermisosCargados(true); }
      }).catch(err => { if (vigente) { setError(mensajeError(err)); setPermisosCargados(true); } });
    return () => { vigente = false; };
  }, [empresaId, sesion.cargando, sesion.estado, sesion.permiteEscritura, reintentoPermisos]);

  const puedeEscribir = sesion.permiteEscritura !== false;
  const puedeCrear = permiteCrear && puedeEscribir;
  const puedeEditar = permiteEditar && puedeEscribir;
  const puedeLiberar = permiteLiberar && puedeEscribir;

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const resultado = await cargarInventarioKardex({ empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance });
      setDatos(resultado);
      setAlmacenId(actual => resultado.almacenes.some(item => item.id === actual) ? actual : '');
    } catch (err) { setError(mensajeError(err)); }
    finally { setCargando(false); }
  }, [empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance]);

  useEffect(() => {
    if (!empresaId || !puedeVer || !permisosCargados || sesion.estado !== 'listo') return;
    cargar();
  }, [empresaId, puedeVer, permisosCargados, sesion.estado, cargar, reintentoCarga]);

  useEffect(() => {
    let vigente = true;
    if (!materialId || !empresaId || !puedeVer || !permisosCargados || sesion.estado !== 'listo') return () => { vigente = false; };
    setCargandoKardexMaterial(true);
    setErrorKardexMaterial('');
    cargarKardexPorMaterial({ empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, materialId })
      .then(resultado => {
        if (vigente) { setKardexMaterial(resultado.kardex); setKardexMaterialParcial(resultado.kardexParcial); }
      })
      .catch(err => { if (vigente) { setKardexMaterial([]); setKardexMaterialParcial(false); setErrorKardexMaterial(mensajeError(err)); } })
      .finally(() => { if (vigente) setCargandoKardexMaterial(false); });
    return () => { vigente = false; };
  }, [empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance, materialId, puedeVer, permisosCargados, sesion.estado, reintentoKardexMaterial]);

  const materiales = useMemo(() => consolidarStockPorMaterial(datos.stock), [datos.stock]);
  const materialesPorId = useMemo(() => new Map(materiales.map(material => [material.id, material])), [materiales]);
  const materialSeleccionado = materialesPorId.get(materialId);
  const inventarioFiltrado = useMemo(() => materiales.map(material => {
    const calculo = calcularStockMaterial(material);
    const texto = `${material.descripcion} ${material.codigo} ${material.familia}`.toLocaleLowerCase('es-PE');
    const cumpleAlmacen = !almacenId || material.filas.some(fila => fila.almacen_id === almacenId);
    return { material, calculo, texto, cumpleAlmacen };
  }).filter(item => (!busqueda || item.texto.includes(busqueda.toLocaleLowerCase('es-PE'))) && item.cumpleAlmacen && (!estado || item.calculo.estado === estado)), [materiales, busqueda, almacenId, estado]);
  const resumen = useMemo(() => materiales.map(material => ({ material, calculo: calcularStockMaterial(material) })), [materiales]);
  const tiposKardex = useMemo(() => [...new Set(datos.kardex.map(movimiento => movimiento.tipo).filter(Boolean))], [datos.kardex]);
  const movimientosFiltrados = useMemo(() => datos.kardex.filter(movimiento => {
    const material = movimiento.materiales || materialesPorId.get(movimiento.material_id) || {};
    const texto = `${material.descripcion || ''} ${material.codigo || ''} ${movimiento.motivo || ''} ${movimiento.referencia_id || ''} ${movimiento.nro_documento || ''}`.toLocaleLowerCase('es-PE');
    return (!busqueda || texto.includes(busqueda.toLocaleLowerCase('es-PE'))) && (!almacenId || movimiento.almacen_id === almacenId) && (!tipo || movimiento.tipo === tipo);
  }), [datos.kardex, materialesPorId, busqueda, almacenId, tipo]);
  const movimientosMaterialFiltrados = useMemo(() => kardexMaterial.filter(movimiento => !tipo || movimiento.tipo === tipo), [kardexMaterial, tipo]);
  const tiposKardexMaterial = useMemo(() => [...new Set(kardexMaterial.map(movimiento => movimiento.tipo).filter(Boolean))], [kardexMaterial]);

  if (sesion.cargando || sesion.estado === 'cargando') return <section className="dx-ui dx-stk"><div className="dx-ui-empty">Cargando sesión operativa…</div></section>;
  if (!empresaId || ['sin_empresa', 'sin_sesion'].includes(sesion.estado)) return <section className="dx-ui dx-stk"><div className="dx-ui-empty">Selecciona o solicita acceso a una empresa para ver el inventario.</div></section>;
  if (error && !permisosCargados) return <section className="dx-ui dx-stk"><div className="dx-ui-empty" role="alert">{error} <button type="button" className="dx-btn" onClick={() => { setError(''); setReintentoPermisos(value => value + 1); }}>Reintentar</button></div></section>;
  if (permisosCargados && !puedeVer && !error) return <section className="dx-ui dx-stk"><div className="dx-ui-empty">No tienes permiso para ver el inventario.</div></section>;

  const fmtSearchLabel = materialSeleccionado ? 'Buscar movimiento del material' : vista === 'stock' ? 'Buscar material' : 'Buscar movimiento';
  const abrirMaterial = id => { setMaterialId(id); setTipo(''); };
  const volver = () => setMaterialId('');
  const abrirPanelMovimiento = accion => { controlQueAbre.current = globalThis.document?.activeElement; setToast(''); setPanelAccion(accion); };
  const cerrarPanelMovimiento = () => { setPanelAccion(''); globalThis.setTimeout(() => controlQueAbre.current?.isConnected && controlQueAbre.current.focus?.(), 0); };
  const abrirPanelTransferencia = (fila, opciones = {}, focoRestaurar) => { controlQueAbre.current = focoRestaurar || globalThis.document?.activeElement; setToast(''); setTransferenciaInicial({ stockOrigen: fila, cantidadInicial: opciones.cantidadInicial ?? Math.max(Number(fila.disponible ?? (Number(fila.fisico) - Number(fila.reservado))), 0), ...opciones }); };
  const cerrarPanelTransferencia = () => { setTransferenciaInicial(null); globalThis.setTimeout(() => controlQueAbre.current?.isConnected && controlQueAbre.current.focus?.(), 0); };
  const abrirPanelLiberacion = fila => { controlQueAbre.current = globalThis.document?.activeElement; setToast(''); setLiberacionInicial(fila); };
  const cerrarPanelLiberacion = () => { setLiberacionInicial(null); globalThis.setTimeout(() => controlQueAbre.current?.isConnected && controlQueAbre.current.focus?.(), 0); };
  const abrirDetalleMovimiento = movimiento => { controlQueAbre.current = globalThis.document?.activeElement; setMovimientoDetalle(movimiento); };
  const cerrarDetalleMovimiento = () => { setMovimientoDetalle(null); globalThis.setTimeout(() => controlQueAbre.current?.isConnected && controlQueAbre.current.focus?.(), 0); };
  const ejecutarMovimiento = async form => {
    try {
      const sociedadFila = form.stock_id ? datos.stock.find(item => item.id === form.stock_id)?.sociedad_id : null;
      const sociedadActivaId = sociedadActiva?.id === '**todas**' ? null : sociedadActiva?.id;
      const sociedadSesionId = sociedadId === '**todas**' ? null : sociedadId;
      const sociedadParaMovimiento = sociedadFila || sociedadActivaId || sociedadSesionId || form.sociedad_id;
      if (!sociedadParaMovimiento || sociedadParaMovimiento === '**todas**') throw new Error('Selecciona una sociedad concreta antes de registrar el movimiento.');
      await registrarMovimientoManual({ empresa_id: empresaId, accion: panelAccion, ...form, sociedad_id: sociedadParaMovimiento });
      setPanelAccion(''); setToast(`${panelAccion === 'entrada' ? 'Entrada registrada' : panelAccion === 'salida' ? 'Salida registrada' : 'Ajuste aplicado'} correctamente.`);
      setReintentoCarga(value => value + 1); setReintentoKardexMaterial(value => value + 1);
    } catch (err) { throw new Error(mapearErrorMovimiento(err)); }
  };
  const ejecutarTransferencia = async form => {
    try {
      await transferirStock({ empresa_id: empresaId, stock_origen_id: transferenciaInicial.stockOrigen.id, almacen_destino_id: form.almacen_destino_id, ubicacion_destino_id: form.ubicacion_destino_id, cantidad: form.cantidad, observacion: form.observacion });
      setTransferenciaInicial(null); setToast('Transferencia registrada correctamente.');
      setReintentoCarga(value => value + 1); setReintentoKardexMaterial(value => value + 1);
      globalThis.setTimeout(() => controlQueAbre.current?.isConnected && controlQueAbre.current.focus?.(), 0);
    } catch (err) { throw new Error(mapearErrorMovimiento(err)); }
  };
  const ejecutarLiberacion = async form => {
    try {
      await liberarCuarentena({ empresa_id: empresaId, stock_origen_id: liberacionInicial.id, almacen_destino_id: form.almacen_destino_id, ubicacion_destino_id: form.ubicacion_destino_id, cantidad: form.cantidad, motivo: form.motivo, observacion: form.observacion });
      setLiberacionInicial(null); setToast('Stock liberado. Se trasladó a una ubicación normal y quedó disponible.');
      setReintentoCarga(value => value + 1); setReintentoKardexMaterial(value => value + 1);
      globalThis.setTimeout(() => controlQueAbre.current?.isConnected && controlQueAbre.current.focus?.(), 0);
    } catch (err) { throw new Error(mapearErrorMovimiento(err)); }
  };
  const ejecutarAnulacion = async motivo => {
    try {
      await anularMovimiento({ empresa_id: empresaId, kardex_id: movimientoDetalle.id, motivo });
      cerrarDetalleMovimiento(); setToast('Movimiento anulado. Se registró el movimiento inverso.');
      setReintentoCarga(value => value + 1); setReintentoKardexMaterial(value => value + 1);
    } catch (err) { throw new Error(mapearErrorMovimiento(err)); }
  };
  const buscar = <label className="dx-ui-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg><input value={busqueda} onChange={evento => setBusqueda(evento.target.value)} placeholder={vista === 'stock' ? 'Buscar por material, código o categoría' : 'Buscar por material, código o referencia'} aria-label={fmtSearchLabel} /></label>;

  return <section className="dx-ui dx-stk">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Almacén · WMS</div><h1 className="dx-ui-title">{materialSeleccionado ? materialSeleccionado.descripcion : materialId ? 'Material' : 'Inventario & Kardex'}</h1><p className="dx-ui-sub">{materialSeleccionado ? `${materialSeleccionado.codigo} · ${materialSeleccionado.familia}` : 'Qué hay, dónde está y cuánto vale, con el historial de cada movimiento.'}</p></div><div className="dx-ui-actions">{permisosCargados && puedeEditar && <button type="button" className="dx-btn" onClick={() => abrirPanelMovimiento('ajuste')}>Ajustar stock</button>}{permisosCargados && puedeCrear && <><button type="button" className="dx-btn" onClick={() => abrirPanelMovimiento('salida')}>Registrar salida</button><button type="button" className="dx-btn primary" onClick={() => abrirPanelMovimiento('entrada')}>Registrar entrada</button></>}{permisosCargados && !puedeEscribir && (permiteCrear || permiteEditar) && <p className="dx-mov-hint">Elige una sociedad concreta en el selector superior para registrar movimientos.</p>}</div></header>
    {toast && <div className="dx-mov-toast" role="status">{toast}</div>}
    {!materialSeleccionado && <div className="dx-ui-tabs" role="tablist" aria-label="Vistas de inventario">
      <button type="button" className={`dx-ui-tab${vista === 'stock' ? ' on' : ''}`} role="tab" aria-selected={vista === 'stock'} onClick={() => { setVista('stock'); setMaterialId(''); setTipo(''); }}>Stock</button>
      <button type="button" className={`dx-ui-tab${vista === 'kardex' ? ' on' : ''}`} role="tab" aria-selected={vista === 'kardex'} onClick={() => { setVista('kardex'); setMaterialId(''); setTipo(''); }}>Kardex</button>
    </div>}
    {materialId && <button type="button" className="dx-stk-back" aria-label="Volver al listado" onClick={volver}>← Volver a {vista === 'kardex' ? 'Kardex' : 'Stock'}</button>}
    {error && <div className="dx-stk-alert" role="alert">{error} <button type="button" className="dx-btn" onClick={() => setReintentoCarga(value => value + 1)}>Reintentar</button></div>}
    {cargando && !datos.stock.length && !datos.kardex.length ? <div className="dx-ui-empty">Cargando inventario y kardex…</div> : !puedeVer ? null : materialSeleccionado ? <>
      {(() => { const calculo = calcularStockMaterial(materialSeleccionado); const filas = materialSeleccionado.filas; return <>
        <div className="dx-ui-summary"><div className="dx-ui-chip"><b>{fmtNumero(calculo.fisico)}</b><span>Físico ({materialSeleccionado.unidad})</span></div><div className="dx-ui-chip"><b>{fmtNumero(calculo.reservado)}</b><span>Reservado</span></div><div className="dx-ui-chip dx-stk-chip-warn"><b>{fmtNumero(calculo.noDisponible)}</b><span>En cuarentena o merma</span></div><div className="dx-ui-chip dx-stk-chip-hl"><b>{fmtNumero(calculo.disponible)}</b><span>Disponible</span></div></div>
        <div className="dx-ui-card"><div className="dx-stk-meta"><div><small>Costo promedio</small><span>{fmtDinero(calculo.costoPromedio, calculo.moneda)}</span></div><div><small>Valor en inventario</small><span>{fmtDinero(calculo.valor, calculo.moneda)}</span></div><div><small>Control</small><span>{materialSeleccionado.tipo_control === 'lote' ? 'Por lote' : materialSeleccionado.tipo_control === 'serie' ? 'Por serie' : 'Sin control'}</span></div><div><small>Alerta de reposición</small><span>{fmtNumero(calculo.reorden)} {materialSeleccionado.unidad} <em style={{ fontStyle: 'normal', color: 'var(--dx-ui-gray)', fontWeight: 500, fontSize: 12 }}>(reorden {fmtNumero(materialSeleccionado.punto_reorden || materialSeleccionado.stock_minimo)} + seguridad {fmtNumero(materialSeleccionado.stock_seguridad)})</em></span></div></div>
          <div className="dx-ui-toolbar"><h2>Dónde está</h2><span className="dx-ui-count">{filas.length} ubicación(es)</span></div><div className="dx-ui-head dx-stk-wcols" aria-hidden="true"><span>Ubicación</span><span>Uso</span><span>Lote</span><span>Físico</span><span>Reservado</span></div>
          {filas.map(fila => <div className="dx-ui-row dx-stk-wcols" key={fila.id}><div className="dx-stk-main"><span><b>{fila.ubicacion}</b><small>{fila.almacen}</small></span></div><span><span className={`dx-ui-pill ${['cuarentena', 'merma'].includes(fila.uso) ? 'is-amber' : 'is-gray'}`}><i />{fila.uso === 'almacenaje' ? 'Almacenaje' : fila.uso === 'cuarentena' ? 'Cuarentena' : fila.uso === 'merma' ? 'Merma' : fila.uso}</span></span><div className="dx-stk-n" style={{ textAlign: 'left' }}><span className="dx-stk-lbl">Lote / serie</span>{[fila.lote, fila.serie].filter(Boolean).join(' / ') || '—'}</div><div className="dx-stk-n"><span className="dx-stk-lbl">Físico</span>{fmtNumero(fila.fisico)}</div><div className="dx-stk-n"><span className="dx-stk-lbl">Reservado</span>{fmtNumero(fila.reservado)}</div><div className="dx-mov-row-actions">{permisosCargados && ['cuarentena', 'merma'].includes(fila.uso) ? puedeLiberar ? <button type="button" className="dx-btn" aria-label={`Liberar ${materialSeleccionado.descripcion} desde ${fila.ubicacion}`} onClick={() => abrirPanelLiberacion(fila)}>Liberar</button> : <span><button type="button" className="dx-btn" disabled title="Sin permiso para liberar" aria-label="Liberar deshabilitado: sin permiso">Liberar</button><small className="dx-mov-disabled-reason">Sin permiso para liberar</small></span> : permisosCargados && puedeCrear && <button type="button" className="dx-btn" aria-label={`Mover ${materialSeleccionado.descripcion} desde ${fila.ubicacion}`} onClick={() => abrirPanelTransferencia(fila)}>Mover</button>}</div></div>)}
          {!filas.length && <div className="dx-ui-empty">Sin existencias en ning&uacute;n almac&eacute;n.</div>}
        </div>
        <div className="dx-ui-card"><div className="dx-ui-toolbar"><h2>Kardex del material</h2><span className="dx-ui-count">{movimientosMaterialFiltrados.length} movimiento(s)</span><select className="dx-stk-sel" aria-label="Filtrar por tipo de movimiento" value={tipo} onChange={evento => setTipo(evento.target.value)}><option value="">Todos los tipos</option>{tiposKardexMaterial.map(valor => <option key={valor} value={valor}>{etiquetaTipoMovimiento(valor)}</option>)}</select></div>{errorKardexMaterial && <div className="dx-stk-alert" role="alert">{errorKardexMaterial} <button type="button" className="dx-btn" onClick={() => setReintentoKardexMaterial(value => value + 1)}>Reintentar</button></div>}{cargandoKardexMaterial ? <div className="dx-ui-empty" role="status">Cargando kardex del material...</div> : !errorKardexMaterial && <><div className="dx-ui-head dx-stk-dcols" aria-hidden="true"><span>Fecha</span><span>Tipo</span><span>Detalle</span><span>Cant.</span><span>Costo unit.</span><span>Saldo</span></div>{movimientosMaterialFiltrados.map(movimiento => <MovimientoFila key={movimiento.id} movimiento={movimiento} onSelect={abrirDetalleMovimiento} />)}{!movimientosMaterialFiltrados.length && <div className="dx-ui-empty">Sin movimientos de este tipo.</div>}{kardexMaterialParcial && <div className="dx-stk-note">El kardex muestra solo los 200 movimientos m&aacute;s recientes; el historial de este material podr&iacute;a estar incompleto.</div>}</>}</div>
      </>; })()}
    </> : vista === 'stock' ? <>
      <div className="dx-ui-summary"><div className="dx-ui-chip dx-stk-chip-hl"><b>{fmtTotales(resumen)}</b><span>Valor del inventario</span></div><div className="dx-ui-chip"><b>{resumen.filter(item => item.calculo.fisico > 0).length}</b><span>Materiales con stock</span></div><div className="dx-ui-chip dx-stk-chip-warn"><b>{resumen.filter(item => item.calculo.estado === 'bajo').length}</b><span>Bajo reorden</span></div><div className="dx-ui-chip dx-stk-chip-bad"><b>{resumen.filter(item => item.calculo.estado === 'agotado').length}</b><span>Agotados</span></div></div>
      <div className="dx-stk-note">El stock en <b>cuarentena</b> y <b>merma</b> cuenta como existencia física, pero no como disponible.</div>
      <div className="dx-ui-card"><div className="dx-ui-toolbar"><h2>Materiales</h2><span className="dx-ui-count">{inventarioFiltrado.length} resultado(s)</span>{buscar}</div><div className="dx-stk-filters"><select className="dx-stk-sel" aria-label="Filtrar por almacén" value={almacenId} onChange={evento => setAlmacenId(evento.target.value)}><option value="">Todos los almacenes</option>{datos.almacenes.map(almacen => <option value={almacen.id} key={almacen.id}>{almacen.nombre}</option>)}</select><select className="dx-stk-sel" aria-label="Filtrar por estado" value={estado} onChange={evento => setEstado(evento.target.value)}><option value="">Todos los estados</option><option value="normal">Normal</option><option value="bajo">Bajo reorden</option><option value="agotado">Agotado</option></select></div><div className="dx-ui-head dx-stk-cols" aria-hidden="true"><span>Material</span><span>Físico</span><span>Disponible</span><span>Costo prom.</span><span>Valor</span><span>Estado</span><span /></div>{inventarioFiltrado.map(({ material, calculo }) => <div className="dx-ui-row dx-stk-cols" key={material.id} role="button" tabIndex={0} aria-label={`Abrir ${material.descripcion}`} onClick={() => abrirMaterial(material.id)} onKeyDown={evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); abrirMaterial(material.id); } }}><div className="dx-stk-main"><span className="dx-ui-icon is-cyan"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg></span><span><b>{material.descripcion}</b><small>{material.codigo} · {material.familia} · {[...new Set(material.filas.map(fila => fila.almacen).filter(Boolean))].join(' + ') || 'Sin stock'}</small></span></div><div className="dx-stk-n"><span className="dx-stk-lbl">Físico</span>{fmtNumero(calculo.fisico)}<small>{material.unidad}</small></div><div className={`dx-stk-n ${calculo.estado === 'agotado' ? 'is-out' : calculo.estado === 'bajo' ? 'is-low' : ''}`}><span className="dx-stk-lbl">Disponible</span>{fmtNumero(calculo.disponible)}<small>{calculo.noDisponible ? `${fmtNumero(calculo.noDisponible)} en cuarentena o merma` : ' '}</small></div><div className="dx-stk-n"><span className="dx-stk-lbl">Costo prom.</span>{fmtDinero(calculo.costoPromedio, calculo.moneda)}</div><div className="dx-stk-n"><span className="dx-stk-lbl">Valor</span>{fmtDinero(calculo.valor, calculo.moneda)}</div><span><PillEstado estado={calculo.estado} /></span><svg className="dx-ui-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></div>)}{!inventarioFiltrado.length && <div className="dx-ui-empty">{materiales.length ? 'Sin coincidencias para tu búsqueda.' : 'No hay existencias registradas.'}</div>}</div>
    </> : <>
      {datos.kardexParcial && <div className="dx-stk-note">Se muestra una parte del historial: los {datos.limiteKardex} movimientos más recientes.</div>}
      <div className="dx-ui-summary"><div className="dx-ui-chip"><b>{movimientosFiltrados.length}</b><span>Movimientos visibles</span></div><div className="dx-ui-chip"><b>{movimientosFiltrados.filter(m => ['entrada', 'transferencia_entrada'].includes(m.tipo) && !m.anulado).length}</b><span>Entradas</span></div><div className="dx-ui-chip"><b>{movimientosFiltrados.filter(m => ['salida', 'transferencia_salida'].includes(m.tipo) && !m.anulado).length}</b><span>Salidas</span></div><div className="dx-ui-chip"><b>{movimientosFiltrados.filter(m => m.anulado).length}</b><span>Anulados</span></div></div>
      <div className="dx-ui-card"><div className="dx-ui-toolbar"><h2>Movimientos</h2><span className="dx-ui-count">{movimientosFiltrados.length} resultado(s)</span>{buscar}</div><div className="dx-stk-filters"><select className="dx-stk-sel" aria-label="Filtrar por almacén" value={almacenId} onChange={evento => setAlmacenId(evento.target.value)}><option value="">Todos los almacenes</option>{datos.almacenes.map(almacen => <option value={almacen.id} key={almacen.id}>{almacen.nombre}</option>)}</select><select className="dx-stk-sel" aria-label="Filtrar por tipo de movimiento" value={tipo} onChange={evento => setTipo(evento.target.value)}><option value="">Todos los tipos</option>{tiposKardex.map(valor => <option key={valor} value={valor}>{etiquetaTipoMovimiento(valor)}</option>)}</select></div><div className="dx-ui-head dx-stk-kcols" aria-hidden="true"><span>Fecha</span><span>Material</span><span>Tipo</span><span>Cant.</span><span>Costo unit.</span><span>Saldo</span><span /></div>{movimientosFiltrados.map(movimiento => <MovimientoFila key={movimiento.id} movimiento={movimiento} conMaterial onOpen={abrirMaterial} onSelect={abrirDetalleMovimiento} />)}{!movimientosFiltrados.length && <div className="dx-ui-empty">{datos.kardex.length ? 'Sin movimientos para estos filtros.' : 'No hay movimientos de inventario.'}</div>}</div>
    </>}
    {panelAccion && <MovimientoPanel accion={panelAccion} materiales={materiales} almacenes={datos.almacenes} ubicaciones={datos.ubicaciones} stock={datos.stock} sociedades={sesion.sociedadesDisponibles || []} initialMaterialId={materialSeleccionado?.id || ''} sociedadId={sociedadActiva?.id === '**todas**' || sociedadId === '**todas**' ? null : sociedadActiva?.id || sociedadId} onClose={cerrarPanelMovimiento} onSubmit={ejecutarMovimiento} />}
    {transferenciaInicial && <TransferenciaPanel material={materialesPorId.get(transferenciaInicial.stockOrigen.material_id) || transferenciaInicial.stockOrigen.materiales} stockOrigen={transferenciaInicial.stockOrigen} destinoInicial={transferenciaInicial.destinoInicial} cantidadInicial={transferenciaInicial.cantidadInicial} almacenes={datos.almacenes} ubicaciones={datos.ubicaciones} onClose={cerrarPanelTransferencia} onSubmit={ejecutarTransferencia} />}
    {liberacionInicial && <LiberarCuarentenaPanel material={materialesPorId.get(liberacionInicial.material_id) || liberacionInicial.materiales} stockOrigen={liberacionInicial} almacenes={datos.almacenes} ubicaciones={datos.ubicaciones} onClose={cerrarPanelLiberacion} onSubmit={ejecutarLiberacion} />}
    {movimientoDetalle && <MovimientoDetalle movimiento={movimientoDetalle} movimientosRelacionados={[...datos.kardex, ...kardexMaterial]} stock={datos.stock} almacenes={datos.almacenes} ubicaciones={datos.ubicaciones} puedeEditar={puedeEditar} onClose={cerrarDetalleMovimiento} onAnnul={ejecutarAnulacion} onReverseTransfer={permisosCargados && puedeCrear ? (fila, opciones) => { const retorno = controlQueAbre.current; cerrarDetalleMovimiento(); abrirPanelTransferencia(fila, opciones, retorno); } : undefined} />}
  </section>;
}

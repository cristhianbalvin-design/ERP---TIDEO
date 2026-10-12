import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { despacharReservaOT, liberarReservaOT, listarReservasOT, revertirDespachoOT } from '../../services/reservasRepuestosService.js';
import { DespachoPanel } from './DespachoPanel.jsx';
import { LiberarReservaPanel } from './LiberarReservaPanel.jsx';
import { RevertirDespachoPanel } from './RevertirDespachoPanel.jsx';
import { estadoAgregadoOT, etiquetaConteoLineas, etiquetaEstadoLinea, etiquetaEstadoOT, mapearErrorReserva, puedeOperarLinea, textoUbicacionOrigen, tonoEstadoLinea } from './reservasRepuestosLogic.js';

const num = valor => Number(valor || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });
const fecha = valor => valor ? new Date(valor).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function ReservaRepuestosPage() {
  const sesion = useSesionOperativa();
  const { empresaId } = sesion;
  const [ordenes, setOrdenes] = useState([]);
  const [permisos, setPermisos] = useState(null);
  const [seleccionadaId, setSeleccionadaId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [reintento, setReintento] = useState(0);
  const [panel, setPanel] = useState(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const envioRef = useRef(false);
  const controlQueAbre = useRef(null);
  const ordenSeleccionada = ordenes.find(ot => ot.id === seleccionadaId) || null;
  const recargar = useCallback(async otId => {
    if (!empresaId) return;
    setCargando(true); setError('');
    try {
      const resultado = await listarReservasOT({ empresa_id: empresaId, ot_id: otId || null });
      setOrdenes(Array.isArray(resultado?.ordenes) ? resultado.ordenes : []);
      setPermisos(resultado?.permisos || { despachar: false, liberar: false });
    } catch (fallo) { setError(mapearErrorReserva(fallo)); }
    finally { setCargando(false); }
  }, [empresaId]);
  useEffect(() => {
    if (sesion.cargando || sesion.estado === 'cargando') return;
    setCargandoSesion(false);
    if (empresaId && sesion.estado === 'listo') recargar(null);
  }, [empresaId, sesion.cargando, sesion.estado, recargar, reintento]);
  const filtradas = useMemo(() => ordenes.filter(ot => `${ot.numero || ''} ${ot.estado || ''} ${(ot.lineas || []).map(linea => `${linea.codigo || ''} ${linea.descripcion || ''}`).join(' ')}`.toLocaleLowerCase('es-PE').includes(busqueda.toLocaleLowerCase('es-PE').trim())), [ordenes, busqueda]);
  const cerrarPanel = useCallback(() => {
    if (envioRef.current) return;
    setPanel(null); setErrorAccion('');
    requestAnimationFrame(() => {
      if (controlQueAbre.current?.isConnected) controlQueAbre.current.focus();
      else document.querySelector('.dx-desp .dx-ui-head-page button')?.focus();
    });
  }, []);
  const abrirPanel = (tipo, ot, linea, evento) => {
    controlQueAbre.current = evento.currentTarget;
    setErrorAccion(''); setPanel({ tipo, ot, linea });
  };
  const enviarAccion = async datos => {
    if (!panel || envioRef.current) return;
    envioRef.current = true; setEnviando(true); setErrorAccion('');
    try {
      if (panel.tipo === 'despachar') await despacharReservaOT({ empresa_id: empresaId, ot_id: panel.ot.id, lineas: [{ ot_segmento_repuesto_id: panel.linea.id, cantidad: datos.cantidad }], recibe_en_taller: datos.recibe_en_taller, observacion: datos.observacion });
      else if (panel.tipo === 'revertir') await revertirDespachoOT({ empresa_id: empresaId, ot_id: panel.ot.id, lineas: [{ ot_segmento_repuesto_id: panel.linea.id, cantidad: datos.cantidad }], motivo: datos.motivo, observacion: datos.observacion });
      else await liberarReservaOT({ empresa_id: empresaId, ot_segmento_repuesto_id: panel.linea.id, cantidad: datos.cantidad, motivo: datos.motivo, observacion: datos.observacion });
      setAviso(panel.tipo === 'despachar' ? 'Despacho registrado. Kardex actualizado.' : panel.tipo === 'revertir' ? 'Despacho revertido. La cantidad vuelve a la reserva de la OT.' : 'Reserva liberada. La cantidad vuelve a Disponible.');
      setPanel(null);
      await recargar(panel.ot.id);
      requestAnimationFrame(() => {
        if (controlQueAbre.current?.isConnected) controlQueAbre.current.focus();
        else document.querySelector('.dx-desp .dx-ui-head-page button')?.focus();
      });
    } catch (fallo) { setErrorAccion(mapearErrorReserva(fallo)); }
    finally { envioRef.current = false; setEnviando(false); }
  };
  if (cargandoSesion || sesion.estado === 'cargando') return <section className="dx-ui dx-desp"><div className="dx-ui-empty" role="status">Cargando sesión operativa…</div></section>;
  if (!empresaId || ['sin_empresa', 'sin_sesion'].includes(sesion.estado)) return <section className="dx-ui dx-desp"><div className="dx-ui-empty">Selecciona o solicita acceso a una empresa para ver las reservas.</div></section>;
  const canOperate = (ot, linea, accion) => puedeOperarLinea(permisos, accion, ot, linea);
  return <section className="dx-ui dx-desp">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Almacén · WMS · Fase 2b-C</div><h1 className="dx-ui-title">{ordenSeleccionada?.numero || 'Reserva de Repuestos'}</h1><p className="dx-ui-sub">{ordenSeleccionada ? `Reserva de repuestos · ${etiquetaEstadoOT(ordenSeleccionada.estado)}` : 'Despacha a taller o libera la reserva de una orden de trabajo.'}</p></div>{ordenSeleccionada && <div className="dx-ui-actions"><button type="button" className="dx-btn" onClick={() => { setSeleccionadaId(''); setAviso(''); }}>Volver a OT</button><button type="button" className="dx-btn" onClick={() => { if (globalThis.window?.location) globalThis.window.location.hash = '#/almacen-inventario'; }}>Ver Kardex</button><button type="button" className="dx-btn" onClick={() => recargar(ordenSeleccionada.id)} disabled={cargando}>Actualizar</button></div>}</header>
    {aviso && <div className="dx-desp-toast" role="status" aria-live="polite">{aviso}</div>}
    {error && <div className="dx-desp-alert" role="alert">{error} <button type="button" className="dx-btn" onClick={() => setReintento(valor => valor + 1)}>Reintentar</button></div>}
    {cargando && <div className="dx-ui-empty" role="status" aria-live="polite">Cargando reservas de órdenes de trabajo…</div>}
    {!cargando && !error && !ordenSeleccionada && <>
      {!ordenes.length ? <div className="dx-ui-empty">No hay órdenes de trabajo con reservas.</div> : <div className="dx-ui-card">
        <div className="dx-ui-toolbar"><h2>Órdenes de trabajo</h2><span className="dx-ui-count">{filtradas.length} OT</span><label className="dx-ui-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar OT o repuesto" placeholder="Buscar OT, material o código" value={busqueda} onChange={evento => setBusqueda(evento.target.value)} /></label></div>
        <div className="dx-desp-list-head" aria-hidden="true"><span>Orden de trabajo</span><span>Estado</span><span>Líneas</span><span>Reservado / estimado</span><span /></div>
        {!filtradas.length ? <div className="dx-ui-empty">No hay resultados para esa búsqueda.</div> : filtradas.map(ot => {
          const lineas = ot.lineas || []; const estadoBase = estadoAgregadoOT(ot); const estado = ['Reservado', 'Reserva pendiente'].includes(estadoBase.texto) && lineas.length > 0 && lineas.every(linea => Number(linea.pendiente || 0) === 0) ? { ...estadoBase, texto: 'Reserva completa' } : estadoBase;
          const resumen = [...new Set(lineas.map(linea => linea.unidad || 'und'))].map(unidad => `${num(lineas.filter(linea => (linea.unidad || 'und') === unidad).reduce((total, linea) => total + Number(linea.reservado || 0), 0))} / ${num(lineas.filter(linea => (linea.unidad || 'und') === unidad).reduce((total, linea) => total + Number(linea.cantidad_estimada || 0), 0))} ${unidad}`).join(' · ');
          return <button type="button" className="dx-desp-list-row" key={ot.id} onClick={() => { setSeleccionadaId(ot.id); setAviso(''); }}><span><b>{ot.numero || ot.id}</b><small>{etiquetaEstadoOT(ot.estado)}</small></span><span><i className={`dx-ui-pill ${estado.tono}`}><i />{estado.texto}</i></span><span>{etiquetaConteoLineas(lineas.length)}</span><span>{resumen || '—'}</span><span aria-hidden="true" className="dx-ui-arrow">›</span></button>;
        })}
      </div>}
    </>}
    {!cargando && !error && ordenSeleccionada && <>
      <button type="button" className="dx-desp-back" onClick={() => setSeleccionadaId('')}>← Volver a la lista</button>
      <div className="dx-ui-summary"><div className="dx-ui-chip"><b>{num(ordenSeleccionada.lineas?.length || 0)}</b><span>{ordenSeleccionada.lineas?.length === 1 ? 'Línea' : 'Líneas'}</span></div><div className="dx-ui-chip"><b>{num((ordenSeleccionada.lineas || []).reduce((s, linea) => s + Number(linea.reservado || 0), 0))}</b><span>Reservado</span></div><div className="dx-ui-chip"><b>{num((ordenSeleccionada.lineas || []).reduce((s, linea) => s + Number(linea.despachado || 0), 0))}</b><span>Despachado</span></div><div className="dx-ui-chip"><b>{num((ordenSeleccionada.lineas || []).reduce((s, linea) => s + Number(linea.liberado || 0), 0))}</b><span>Liberado</span></div></div>
      <div className="dx-desp-notice">Al cerrar técnicamente la OT, el consumo heredado solo descontará lo que todavía no se haya despachado a taller.</div>
      <div className="dx-ui-card"><div className="dx-ui-toolbar"><h2>Repuestos reservados</h2><span className="dx-ui-count">{etiquetaConteoLineas(ordenSeleccionada.lineas?.length || 0)} · {ordenSeleccionada.estado}</span></div>
        <div className="dx-desp-line-head" aria-hidden="true"><span>Material</span><span>Estimado</span><span>Reservado</span><span>Despachado</span><span>Pendiente</span><span>Estado</span><span>Acciones</span></div>
        {(ordenSeleccionada.lineas || []).length === 0 ? <div className="dx-ui-empty">Esta OT no tiene líneas de repuesto.</div> : ordenSeleccionada.lineas.map(linea => {
          const despacho = canOperate(ordenSeleccionada, linea, 'despachar'); const liberar = canOperate(ordenSeleccionada, linea, 'liberar'); const revertir = canOperate(ordenSeleccionada, linea, 'revertir');
          const sinPermisoDespacho = permisos?.despachar !== true; const sinPermisoLiberar = permisos?.liberar !== true;
          const motivoReversa = sinPermisoDespacho ? 'Sin permiso para revertir' : Number(linea.despachado || 0) <= 0 ? 'Nada despachado' : !['programada', 'ejecucion'].includes(ordenSeleccionada.estado) ? 'OT cerrada' : '';
          const origenes = linea.origenes || [];
          const origenTexto = origenes.map(textoUbicacionOrigen).join(' · ') || 'Sin ubicación (sin stock reservado)';
          return <div className="dx-desp-line-row" key={linea.id}>
            <div className="dx-desp-material"><b>{linea.descripcion}</b><small>{linea.codigo || '—'} · {linea.unidad || 'und'} · {origenTexto}</small></div>
            <div className="dx-desp-n"><small>Estimado</small>{num(linea.cantidad_estimada)} {linea.unidad}</div><div className="dx-desp-n"><small>Reservado</small>{num(linea.reservado)} {linea.unidad}</div><div className="dx-desp-n"><small>Despachado</small>{num(linea.despachado)} {linea.unidad}</div><div className="dx-desp-n"><small>Pendiente</small>{num(linea.pendiente)} {linea.unidad}</div>
            <span className="dx-desp-state"><i className={`dx-ui-pill ${tonoEstadoLinea(linea.estado)}`}><i />{etiquetaEstadoLinea(linea.estado)}</i></span>
            <div className="dx-desp-actions">
              {linea.solpe_id && Number(linea.reservado) === 0 && <small className="dx-desp-warn">SOLPE en curso</small>}
              {despacho ? <button type="button" className="dx-btn primary" onClick={evento => abrirPanel('despachar', ordenSeleccionada, linea, evento)}>Despachar</button> : <span><button type="button" className="dx-btn primary" disabled title={sinPermisoDespacho ? 'Tu rol no tiene permiso para despachar.' : 'No hay cantidad pendiente o la OT no está programada o en ejecución.'} aria-label={`Despachar deshabilitado: ${sinPermisoDespacho ? 'sin permiso' : 'sin cantidad pendiente o estado no operativo'}`}>Despachar</button>{sinPermisoDespacho && <small className="dx-desp-disabled-reason">Sin permiso de despacho</small>}</span>}
              {liberar ? <button type="button" className="dx-btn" onClick={evento => abrirPanel('liberar', ordenSeleccionada, linea, evento)}>Liberar</button> : <span><button type="button" className="dx-btn" disabled title={sinPermisoLiberar ? 'Tu rol no tiene permiso para liberar reservas.' : 'No hay cantidad pendiente o la OT no está programada o en ejecución.'} aria-label={`Liberar deshabilitado: ${sinPermisoLiberar ? 'sin permiso' : 'sin cantidad pendiente o estado no operativo'}`}>Liberar</button>{sinPermisoLiberar && <small className="dx-desp-disabled-reason">Sin permiso para liberar</small>}</span>}
              {revertir ? <button type="button" className="dx-btn" onClick={evento => abrirPanel('revertir', ordenSeleccionada, linea, evento)}>Revertir</button> : <span><button type="button" className="dx-btn" disabled title={motivoReversa} aria-label={motivoReversa}>Revertir</button><small className="dx-desp-disabled-reason">{motivoReversa}</small></span>}
            </div>
          </div>;
        })}
      </div>
      <div className="dx-ui-card dx-desp-history"><div className="dx-ui-toolbar"><h2>Historial de acciones</h2><span className="dx-ui-count">{ordenSeleccionada.acciones?.length || 0} acciones</span></div>
        {!ordenSeleccionada.acciones?.length ? <div className="dx-ui-empty">Aún no hay despachos ni liberaciones para esta OT.</div> : <ol>{ordenSeleccionada.acciones.map(accion => <li key={accion.id}><b>{accion.tipo === 'despacho' ? 'Despacho a taller' : accion.tipo === 'liberacion' ? 'Liberación de reserva' : accion.tipo === 'reversa_despacho' ? 'Reversa de despacho' : 'Cierre técnico'}</b><span>{num(accion.cantidad)} · {accion.motivo || accion.recibe_en_taller || '—'}</span><small>{fecha(accion.created_at)}{accion.observacion ? ` · ${accion.observacion}` : ''}</small></li>)}</ol>}
      </div>
    </>}
    {panel?.tipo === 'despachar' && <DespachoPanel ot={panel.ot} linea={panel.linea} enviando={enviando} error={errorAccion} onClose={cerrarPanel} onSubmit={enviarAccion} />}
    {panel?.tipo === 'liberar' && <LiberarReservaPanel ot={panel.ot} linea={panel.linea} enviando={enviando} error={errorAccion} onClose={cerrarPanel} onSubmit={enviarAccion} />}
    {panel?.tipo === 'revertir' && <RevertirDespachoPanel ot={panel.ot} linea={panel.linea} enviando={enviando} error={errorAccion} onClose={cerrarPanel} onSubmit={enviarAccion} />}
  </section>;
}

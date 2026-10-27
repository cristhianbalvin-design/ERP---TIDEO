import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { despacharReservaOT } from '../../../services/reservasRepuestosService.js';
import { despacharDemanda, listarColaDespachos, reintentarReserva } from '../../../services/wmsMultipropositoService.js';
import { fechaLocalISO } from '../fechaLocal.js';
import { AvisoSoloLectura, Encabezado, PaginaPrevia, SelectorAlmacen } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import {
  CANALES, filtrarCola, formatoCantidad, lineaPorEscaneo, normalizarPedido, resumenCola, validarGuia, validarPreparado,
} from './wmsMultiLogic.js';

const guiaInicial = () => ({
  llegada_direccion: '', fecha_inicio_traslado: fechaLocalISO(), modalidad: 'remitente', peso_bruto_total: '',
  vehiculo_placa: '', conductor_dni: '', conductor_nombre: '', transportista_ruc: '', transportista_razon_social: '',
});

export function DespachosPage() {
  const base = useWmsBase();
  const { empresaId, permisos, puede, almacenes, sesion } = base;
  const [almacenId, setAlmacenId] = useState('');
  const [canal, setCanal] = useState('todos');
  const [texto, setTexto] = useState('');
  const [cola, setCola] = useState([]);
  const [seleccion, setSeleccion] = useState('');
  const [preparado, setPreparado] = useState({});
  const [guia, setGuia] = useState(guiaInicial);
  const [recibe, setRecibe] = useState('');
  const [escaneo, setEscaneo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const detalleRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try { setCola((await listarColaDespachos({ empresa_id: empresaId, almacen_id: almacenId })).map(normalizarPedido)); }
    catch (e) { setError(mensajeError(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver, almacenId]);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => filtrarCola(cola, { canal, texto }), [cola, canal, texto]);
  const resumen = useMemo(() => resumenCola(cola), [cola]);
  const pedido = cola.find(p => p.id === seleccion) || null;

  const elegir = p => {
    setSeleccion(p.id); setError(''); setAviso(''); setEscaneo(''); setRecibe(''); setGuia(guiaInicial());
    setPreparado(Object.fromEntries((p.lineas || []).map(l => [l.linea_id, ''])));
    // En pantallas angostas el detalle queda debajo de la cola: se lleva a la vista.
    if (globalThis.window?.innerWidth <= 1100) requestAnimationFrame(() => detalleRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  };
  const escanear = e => {
    e.preventDefault();
    const linea = lineaPorEscaneo(pedido, escaneo);
    if (!linea) { setError(`El código «${escaneo}» no corresponde a ninguna línea de este pedido.`); return; }
    setError('');
    setPreparado(actual => {
      const actualNum = Number(String(actual[linea.linea_id] || '0').replace(',', '.')) || 0;
      return { ...actual, [linea.linea_id]: String(Math.min(Number(linea.pendiente), actualNum + 1)) };
    });
    setEscaneo('');
  };
  const prepararTodo = () => setPreparado(Object.fromEntries(pedido.lineas.map(l => [l.linea_id, Number(l.pendiente) > 0 ? String(l.pendiente) : ''])));

  const despachar = async () => {
    const { lineas, error: errorLineas } = validarPreparado(pedido, preparado);
    if (errorLineas) { setError(errorLineas); return; }
    if (pedido.canal === 'venta') {
      const errorGuia = validarGuia(guia);
      if (errorGuia) { setError(errorGuia); return; }
    }
    setOcupado(true); setError(''); setAviso('');
    try {
      if (pedido.canal === 'ot') {
        await despacharReservaOT({
          empresa_id: empresaId, ot_id: pedido.id,
          lineas: lineas.map(l => ({ ot_segmento_repuesto_id: l.linea_id, cantidad: l.cantidad })),
          recibe_en_taller: recibe.trim() || null, observacion: null,
        });
        setAviso(`Entregado a taller · ${pedido.numero}. Kardex actualizado.`);
      } else {
        const r = await despacharDemanda({
          empresa_id: empresaId, demanda_id: pedido.id, lineas,
          guia: pedido.canal === 'venta' ? { ...guia, peso_bruto_total: Number(String(guia.peso_bruto_total).replace(',', '.')) } : null,
        });
        setAviso(pedido.canal === 'venta'
          ? `Guía ${r?.guia_numero || ''} emitida y mercadería despachada${r?.estado === 'parcial' ? ' (despacho parcial)' : ''}.`
          : `Entregado al cliente · ${pedido.numero}${r?.estado === 'parcial' ? ' (entrega parcial)' : ''}.`);
      }
      setSeleccion('');
      await cargar();
    } catch (e) { setError(mensajeError(e)); }
    finally { setOcupado(false); }
  };

  const reservarFaltante = async () => {
    setOcupado(true); setError('');
    try {
      const r = await reintentarReserva({ empresa_id: empresaId, demanda_id: pedido.id });
      setAviso((r?.faltantes || []).length ? 'Se reservó lo disponible; aún hay faltantes.' : 'Faltante reservado. El pedido está completo.');
      await cargar();
    } catch (e) { setError(mensajeError(e)); }
    finally { setOcupado(false); }
  };

  const previo = estadoPrevio(base, { clase: 'dx-wdesp', nombre: 'los despachos' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  const meta = pedido ? CANALES[pedido.canal] : null;
  const hayFaltante = pedido && pedido.canal !== 'ot' && pedido.lineas.some(l => Number(l.faltante) > 0);
  const campo = (clave, etiqueta, props = {}) => <div className="dx-w-field"><label htmlFor={`dx-wdesp-${clave}`}>{etiqueta}</label><input id={`dx-wdesp-${clave}`} value={guia[clave]} onChange={e => { const valor = e.target.value; setGuia(actual => ({ ...actual, [clave]: valor })); }} {...props} /></div>;

  return <section className="dx-ui dx-wms dx-wdesp">
    <Encabezado titulo="Despachos" sub="Cola única de salida: entregas a taller (OT), ventas con guía y retiros de custodia, preparadas en ruta de picking." >
      <SelectorAlmacen id="dx-wdesp-almacen" almacenes={almacenes} valor={almacenId} onCambio={valor => { setAlmacenId(valor); setSeleccion(''); }} />
    </Encabezado>
    <AvisoSoloLectura sesion={sesion} />
    {aviso && <div className="dx-w-note green" role="status">{aviso}</div>}
    <div className="dx-ui-summary">
      <div className="dx-ui-chip"><b>{resumen.total}</b><span>Por despachar</span></div>
      <div className="dx-ui-chip"><b>{resumen.ot}</b><span>A taller (OT)</span></div>
      <div className="dx-ui-chip"><b>{resumen.venta}</b><span>Ventas</span></div>
      <div className="dx-ui-chip"><b>{resumen.custodia}</b><span>Retiros de custodia</span></div>
      <div className="dx-ui-chip"><b>{resumen.parciales}</b><span>Con faltante</span></div>
    </div>
    <div className="dx-w-side">
      <div className="dx-ui-card">
        <div className="dx-w-bar">
          <h2>Cola de salida</h2>
          <div className="dx-w-seg" role="group" aria-label="Filtrar por canal">
            {[['todos', 'Todos'], ['ot', 'OT'], ['venta', 'Venta'], ['custodia', 'Custodia']].map(([id, label]) => <button key={id} type="button" className={canal === id ? 'on' : ''} aria-pressed={canal === id} onClick={() => setCanal(id)}>{label}</button>)}
          </div>
          <label className="dx-ui-search" htmlFor="dx-wdesp-buscar"><span aria-hidden="true">⌕</span><input id="dx-wdesp-buscar" placeholder="Buscar documento, destino o material" value={texto} onChange={e => setTexto(e.target.value)} /></label>
        </div>
        {error && !pedido && <div className="dx-w-sec"><div className="dx-w-note red" role="alert">{error}<button type="button" className="dx-btn sm" onClick={cargar}>Reintentar</button></div></div>}
        {cargando && !cola.length ? <div className="dx-ui-empty">Cargando cola de despachos…</div>
          : !visibles.length ? <div className="dx-ui-empty">{cola.length ? 'Ningún pedido coincide con el filtro.' : 'No hay pedidos pendientes de despacho.'}</div>
          : <div className="dx-w-scroll"><table className="dx-w-table">
            <thead><tr><th>Documento</th><th>Canal</th><th className="dx-w-hide-m">Destino</th><th className="num">Líneas</th><th className="dx-w-hide-m">Requerido</th><th>Estado</th></tr></thead>
            <tbody>{visibles.map(p => <tr key={`${p.canal}-${p.id}`} className={`click${p.id === seleccion ? ' sel' : ''}`} tabIndex={0} onClick={() => elegir(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(p); } }}>
              <td><b>{p.numero}</b></td>
              <td><span className={`dx-ui-pill ${CANALES[p.canal]?.pill || 'is-gray'}`}><i />{CANALES[p.canal]?.label || p.canal}</span></td>
              <td className="dx-w-hide-m">{p.destino}</td>
              <td className="num">{p.lineas.length}</td>
              <td className="dx-w-hide-m">{p.fecha_requerida || '—'}</td>
              <td>{p.estado === 'parcial' ? <span className="dx-ui-pill is-amber"><i />Faltante</span> : <span className="dx-ui-pill is-green"><i />Listo</span>}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>

      <div className="dx-ui-card" ref={detalleRef}>
        {!pedido ? <div className="dx-ui-empty">Selecciona un pedido de la cola para prepararlo.</div> : <>
          <div className="dx-w-bar"><h2>{pedido.numero}</h2><span className={`dx-ui-pill ${meta.pill}`}><i />{meta.label}</span></div>
          <div className="dx-w-sec">
            <div className="dx-w-flow" aria-label="Avance del pedido"><span className="done">Reservado</span><span className="cur">Picking</span><span>{pedido.canal === 'venta' ? 'Guía y despacho' : pedido.canal === 'ot' ? 'Entrega a taller' : 'Entrega al cliente'}</span></div>
            <div className="dx-w-kv"><span>Destino</span><b>{pedido.destino}</b></div>
            {pedido.fecha_requerida && <div className="dx-w-kv"><span>Requerido para</span><b>{pedido.fecha_requerida}</b></div>}
            {hayFaltante && <div className="dx-w-note amber" role="status">Parte del pedido no tiene stock reservado{pedido.canal === 'venta' ? ' (en almacenes mixtos, ventas no toma lo protegido para operaciones)' : ''}. Puedes despachar lo listo o reintentar la reserva.</div>}
            {error && <div className="dx-w-note red" role="alert">{error}</div>}
            <form className="dx-w-scan" onSubmit={escanear}><span aria-hidden="true">▦</span><input aria-label="Escanear código de material o ubicación" placeholder="Escanea material o ubicación (+1)" value={escaneo} onChange={e => setEscaneo(e.target.value)} /></form>
            <div role="list" aria-label="Ruta de picking">
              {pedido.lineas.map(l => {
                const listo = Number(String(preparado[l.linea_id] || '0').replace(',', '.')) >= Number(l.pendiente) && Number(l.pendiente) > 0;
                return <div role="listitem" key={l.linea_id} className={`dx-w-pick${listo ? ' ok' : ''}`}>
                  <span className="ubi">{l.ubicacion || '—'}</span>
                  <span><b>{l.codigo}</b><small>{l.descripcion}{Number(l.faltante) > 0 ? ` · faltan ${formatoCantidad(l.faltante)}` : ''}</small></span>
                  <span className="num dx-w-hide-m"><small>listo</small><br />{formatoCantidad(l.pendiente)} {l.unidad || ''}</span>
                  <input className="dx-w-in" inputMode="decimal" aria-label={`Cantidad preparada de ${l.codigo}`} placeholder="0" value={preparado[l.linea_id] ?? ''} disabled={!(Number(l.pendiente) > 0)} onChange={e => { const valor = e.target.value; setPreparado(actual => ({ ...actual, [l.linea_id]: valor })); }} />
                </div>;
              })}
            </div>
            <div className="dx-w-tools"><button type="button" className="dx-btn sm" onClick={prepararTodo}>Preparar todo lo listo</button>{hayFaltante && puede.despachar && <button type="button" className="dx-btn sm" disabled={ocupado} onClick={reservarFaltante}>Reintentar reserva</button>}</div>
          </div>
          {pedido.canal === 'venta' && <div className="dx-w-sec">
            <h3>Guía de remisión</h3><p className="sub">Se emite al despachar, con el correlativo de la serie T001.</p>
            {campo('llegada_direccion', 'Punto de llegada', { required: true, maxLength: 250 })}
            <div className="dx-w-two">{campo('fecha_inicio_traslado', 'Fecha de traslado', { type: 'date' })}{campo('peso_bruto_total', 'Peso bruto (kg)', { inputMode: 'decimal' })}</div>
            <div className="dx-w-field"><label htmlFor="dx-wdesp-modalidad">Modalidad</label><select id="dx-wdesp-modalidad" value={guia.modalidad} onChange={e => { const valor = e.target.value; setGuia(actual => ({ ...actual, modalidad: valor })); }}><option value="remitente">Transporte privado (propio)</option><option value="transportista">Transporte público (transportista)</option></select></div>
            {guia.modalidad === 'remitente'
              ? <><div className="dx-w-two">{campo('vehiculo_placa', 'Placa del vehículo', { maxLength: 10 })}{campo('conductor_dni', 'DNI del conductor', { maxLength: 12, inputMode: 'numeric' })}</div>{campo('conductor_nombre', 'Nombre del conductor', { maxLength: 120 })}</>
              : <div className="dx-w-two">{campo('transportista_ruc', 'RUC transportista', { maxLength: 11, inputMode: 'numeric' })}{campo('transportista_razon_social', 'Razón social', { maxLength: 150 })}</div>}
          </div>}
          {pedido.canal === 'ot' && <div className="dx-w-sec"><div className="dx-w-field"><label htmlFor="dx-wdesp-recibe">Recibe en taller · opcional</label><input id="dx-wdesp-recibe" maxLength={120} value={recibe} onChange={e => setRecibe(e.target.value)} /></div></div>}
          <div className="dx-w-sec"><div className="dx-w-tools">
            <button type="button" className="dx-btn" onClick={() => setSeleccion('')}>Cerrar</button>
            <button type="button" className="dx-btn primary" disabled={ocupado || !puede.despachar} title={!puede.despachar ? 'No tienes permiso para despachar' : undefined} onClick={despachar}>{ocupado ? 'Procesando…' : meta.destino}</button>
          </div></div>
        </>}
      </div>
    </div>
  </section>;
}

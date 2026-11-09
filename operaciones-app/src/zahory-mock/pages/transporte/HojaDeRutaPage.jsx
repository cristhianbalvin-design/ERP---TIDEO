import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { listarFlota } from '../../../services/transporteFlotaService.js';
import {
  agregarPedidosARuta, listarPedidosRuta, listarViajesHojaRuta, obtenerViajeCompleto, retirarPedidoRuta,
} from '../../../services/transporteLogisticaService.js';
import {
  DOCUMENTO_PARADA, ORIGEN_PEDIDO, TIPO_VIAJE, agruparPorUnidad, atrasado, fechaLima, horaLima, hoyLima,
  ordenarParadas, resumenParadas, sumarDias, ventanaTexto, viajesDelDia,
} from '../../../../../src/lib/transporteLogistica.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { RutaLogisticaEditor } from './RutaLogisticaEditor.jsx';
import { colorEstadoViaje, etiquetaContador, etiquetaEstadoViaje, etiquetaTipoVehiculo } from './transporteUtils.js';

const FILTROS = [['', 'Todos'], ['orden_compra_transito', 'OC'], ['guia_remision', 'Guías'], ['compra_gasto', 'Compras'], ['libre', 'Libres']];
const ICONO_DOC = { orden_compra_transito: ['⇩', 'is-violet'], guia_remision: ['⇧', 'is-cyan'], compra_gasto: ['S/', 'is-amber'], libre: ['◎', 'is-gray'] };
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const fechaCorta = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};
const fechaDM = valor => { const iso = fechaLima(valor); return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''; };
const cliente = viaje => viaje.cuenta?.nombre_comercial || viaje.cuenta?.razon_social || 'Sin cliente';
const enCurso = viaje => ['despachado', 'en_ruta', 'con_incidente'].includes(viaje.estado);

function Paradas({ viaje }) {
  const paradas = ordenarParadas(viaje.paradas);
  if (!paradas.length) return <div className="dx-tmshr-stops-empty">Sin paradas registradas</div>;
  const actual = enCurso(viaje) ? paradas.findIndex(p => p.estado === 'pendiente') : -1;
  return <ol className="dx-tmshr-stops" aria-label={`Paradas de ${viaje.codigo}`}>
    {paradas.map((parada, index) => {
      const hecho = parada.estado === 'completada';
      const omitida = parada.estado === 'omitida';
      return <li key={parada.id} className={`${hecho ? 'is-ok' : ''}${omitida ? ' is-skip' : ''}${index === actual ? ' is-now' : ''}`}>
        <i aria-hidden="true">{hecho ? '✓' : omitida ? '–' : index + 1}</i>
        <b>{parada.nombre}</b>
        <small>{hecho ? `${parada.recibe_nombre ? `${parada.recibe_nombre} · ` : ''}${horaLima(parada.salida_at)}`
          : omitida ? 'Omitida' : DOCUMENTO_PARADA[parada.documento_tipo] || (parada.tipo === 'origen' ? 'Carga' : parada.tipo === 'destino' ? 'Destino' : '')}</small>
      </li>;
    })}
  </ol>;
}

export function HojaDeRutaPage({ onNav, routeParams = {} }) {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const empresaNombre = sesion.empresa?.razon_social || sesion.empresa?.nombre_comercial || sesion.empresa?.nombre || '';
  const access = usePermisosTransporte(sesion);
  const hoy = hoyLima();
  const [fecha, setFecha] = useState(hoy);
  const [viajes, setViajes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [flota, setFlota] = useState({ vehiculos: [], conductores: [], transportistas: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [filtro, setFiltro] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [destino, setDestino] = useState('');
  const [editor, setEditor] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const reload = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true); setError('');
    try {
      const [listaViajes, listaPedidos, datosFlota] = await Promise.all([
        listarViajesHojaRuta(empresaId, fecha), listarPedidosRuta(empresaId), listarFlota(empresaId)]);
      setViajes(listaViajes); setPedidos(listaPedidos); setFlota(datosFlota);
      setSel(old => new Set([...old].filter(id => listaPedidos.some(p => p.id === id))));
    } catch (e) { setError(e.message || 'No se pudo cargar la Hoja de Ruta.'); }
    finally { setLoading(false); }
  }, [empresaId, access.ver, fecha]);
  useEffect(() => { reload(); }, [reload]);
  // Desde el detalle de un viaje («Editar», «Asignar en la Hoja de Ruta») se abre su día y su editor.
  useEffect(() => {
    if (!routeParams.id || !access.ver) return undefined;
    let vigente = true;
    obtenerViajeCompleto(routeParams.id).then(viaje => {
      if (!vigente || !viaje) return;
      setFecha(fechaLima(viaje.fecha_programada) || hoy);
      if (viaje.tipo_viaje === 'logistica' && ['borrador', 'programado'].includes(viaje.estado) && access.editar) setEditor({ viaje });
    }).catch(() => {});
    return () => { vigente = false; };
  }, [routeParams.id, access.ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const delDia = useMemo(() => viajesDelDia(viajes, fecha), [viajes, fecha]);
  const grupos = useMemo(() => agruparPorUnidad(delDia), [delDia]);
  const todasParadas = delDia.flatMap(v => v.paradas || []);
  const resumen = resumenParadas(todasParadas);
  const comerciales = delDia.filter(v => v.tipo_viaje === 'comercial').length;
  const sinUnidad = delDia.filter(v => !v.vehiculo_id);
  const pedidosVisibles = pedidos.filter(p => !filtro || p.documento_tipo === filtro);
  const rutasAbiertas = delDia.filter(v => v.tipo_viaje === 'logistica' && ['borrador', 'programado', 'despachado', 'en_ruta', 'con_incidente'].includes(v.estado));
  const destinoValido = rutasAbiertas.some(v => v.id === destino) ? destino : rutasAbiertas[0]?.id || '';

  const abrir = viaje => onNav('transporte-viaje', { id: viaje.id });
  const teclado = (event, viaje) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrir(viaje); } };
  const descargarHoja = async lista => {
    if (!lista.length) return;
    const { generarHojaRutaPdf } = await import('../../../../../src/lib/hojaRutaPdf.js');
    const doc = generarHojaRutaPdf({ viajes: lista, empresa: empresaNombre });
    doc.save(lista.length === 1 ? `hoja-ruta-${lista[0].codigo}.pdf` : `hojas-ruta-${fecha}.pdf`);
  };
  const alternar = id => setSel(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function agregarSeleccion() {
    if (!destinoValido || !sel.size) return;
    const ruta = rutasAbiertas.find(v => v.id === destinoValido);
    if (['borrador', 'programado'].includes(ruta.estado)) {
      setEditor({ viaje: ruta, pedidosNuevos: pedidos.filter(p => sel.has(p.id)) });
      return;
    }
    setTrabajando(true); setAviso('');
    try {
      await agregarPedidosARuta(destinoValido, [...sel]);
      setSel(new Set()); setAviso(`${etiquetaContador(sel.size, 'parada agregada', 'paradas agregadas')} a ${ruta.codigo}.`);
      await reload();
    } catch (e) { setAviso(e.message || 'No se pudo agregar a la ruta.'); }
    finally { setTrabajando(false); }
  }

  async function retirar(pedido) {
    setTrabajando(true); setAviso('');
    try { await retirarPedidoRuta(pedido.id); setAviso(`Se retiró «${pedido.titulo}» de la Hoja de Ruta.`); await reload(); }
    catch (e) { setAviso(e.message || 'No se pudo retirar el pedido.'); }
    finally { setTrabajando(false); }
  }

  if (access.motivo) return <AccesoTransporte acceso={access} />;

  const tarjeta = viaje => {
    const tipo = TIPO_VIAJE[viaje.tipo_viaje] || TIPO_VIAJE.comercial;
    const paradas = resumenParadas(viaje.paradas);
    const editable = viaje.tipo_viaje === 'logistica' && ['borrador', 'programado'].includes(viaje.estado) && access.editar;
    const tarde = atrasado(viaje, hoy);
    return <article key={viaje.id} className="dx-tmshr-trip" role="button" tabIndex={0} aria-label={`Abrir ${viaje.codigo}`}
      onClick={() => abrir(viaje)} onKeyDown={event => teclado(event, viaje)}>
      <div className="dx-tmshr-trip-t1">
        <span className="dx-tms-code">{viaje.codigo}</span>
        <span className={`dx-tmshr-mini ${viaje.tipo_viaje === 'logistica' ? 'is-violet' : 'is-cyan'}`}>{tipo.label}</span>
        <span className={`dx-ui-pill ${colorEstadoViaje(viaje.estado)}`}><i />{etiquetaEstadoViaje(viaje.estado)}</span>
        <span className="dx-tmshr-what">{viaje.tipo_viaje === 'comercial'
          ? `${cliente(viaje)} · ${viaje.origen_nombre} → ${viaje.destino_nombre}`
          : `${etiquetaContador(paradas.total, 'parada')} · sale de ${viaje.origen_nombre}`}</span>
        {tarde ? <span className="dx-tmshr-mini is-red">⚠ Atrasado desde {fechaDM(viaje.fecha_programada)}</span>
          : horaLima(viaje.fecha_programada) && <span className="dx-tmshr-mini is-gray">◷ {fechaLima(viaje.fecha_programada) < fecha
            ? `Salió ${fechaDM(viaje.fecha_programada)}` : `Sale ${horaLima(viaje.fecha_programada)}`}</span>}
      </div>
      <div className="dx-tmshr-trip-acts">
        <button type="button" className="dx-btn" onClick={event => { event.stopPropagation(); descargarHoja([viaje]); }}>⎙ Hoja</button>
        {editable && <button type="button" className="dx-btn" onClick={event => { event.stopPropagation(); setEditor({ viaje }); }}>Editar</button>}
        {!viaje.vehiculo_id && ['borrador', 'programado'].includes(viaje.estado) && access.editar
          && <button type="button" className="dx-btn primary" onClick={event => {
            event.stopPropagation();
            if (viaje.tipo_viaje === 'logistica') setEditor({ viaje }); else abrir(viaje);
          }}>Asignar</button>}
      </div>
      <Paradas viaje={viaje} />
    </article>;
  };

  return <section className="dx-ui dx-tms dx-tmshr">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Transporte · Operación</div>
      <h1 className="dx-ui-title">Hoja de Ruta</h1>
      <p className="dx-ui-sub">El plan del día por unidad: viajes comerciales y rutas de logística propia.</p></div>
      <div className="dx-ui-actions">
        <div className="dx-tmshr-datenav" role="group" aria-label="Fecha de la Hoja de Ruta">
          <button type="button" aria-label="Día anterior" onClick={() => setFecha(sumarDias(fecha, -1))}>‹</button>
          <label><span className="dx-tmshr-sr">Fecha</span><b>{fecha === hoy ? 'Hoy · ' : ''}{fechaCorta(fecha)}</b>
            <input type="date" value={fecha} aria-label="Elegir fecha" onChange={event => event.target.value && setFecha(event.target.value)} /></label>
          <button type="button" aria-label="Día siguiente" onClick={() => setFecha(sumarDias(fecha, 1))}>›</button>
        </div>
        <button type="button" className="dx-btn" disabled={!delDia.length} onClick={() => descargarHoja(delDia)}>⎙ Imprimir hojas del día</button>
        {access.editar && <button type="button" className="dx-btn primary" onClick={() => setEditor({ viaje: null, pedidosNuevos: pedidos.filter(p => sel.has(p.id)) })}>
          ＋ Nueva ruta de logística</button>}
      </div>
    </header>

    <div className="dx-tms-kpis">
      <div className="dx-tms-kpi"><div className="dx-tms-kpi-k"><i>⛟</i>Viajes del día</div>
        <div className="dx-tms-kpi-v">{delDia.length}<small>{comerciales} comerciales · {delDia.length - comerciales} logística</small></div>
        <div className="dx-tms-kpi-s">{delDia.filter(v => ['en_ruta', 'con_incidente'].includes(v.estado)).length} en ruta ahora</div></div>
      <div className="dx-tms-kpi"><div className="dx-tms-kpi-k"><i>◎</i>Paradas</div>
        <div className="dx-tms-kpi-v">{resumen.hechas}<small>de {resumen.total} hechas</small></div>
        <div className="dx-tms-kpi-bar"><b style={{ width: `${resumen.total ? resumen.hechas / resumen.total * 100 : 0}%` }} /></div>
        <div className="dx-tms-kpi-s">Con constancia de entrega</div></div>
      <div className={`dx-tms-kpi${sinUnidad.length ? ' is-warn' : ''}`}><div className="dx-tms-kpi-k"><i>!</i>Sin unidad</div>
        <div className="dx-tms-kpi-v">{sinUnidad.length}</div>
        <div className="dx-tms-kpi-s">{sinUnidad.length ? sinUnidad.map(v => v.codigo).slice(0, 4).join(' · ') : 'Todo asignado'}</div></div>
      <div className="dx-tms-kpi"><div className="dx-tms-kpi-k"><i>⇅</i>Por enviar a ruta</div>
        <div className="dx-tms-kpi-v">{pedidos.length}</div><div className="dx-tms-kpi-s">De Compras, Almacén y el despachador</div></div>
    </div>

    {aviso && <div className="dx-tmshr-aviso" role="status">{aviso}<button type="button" aria-label="Cerrar aviso" onClick={() => setAviso('')}>×</button></div>}

    <div className="dx-tmshr-layout">
      <div className="dx-tmshr-lanes">
        {loading ? <div className="dx-tms-skeletons" aria-label="Cargando Hoja de Ruta">{[1, 2, 3].map(key => <div key={key} className="dx-tms-sk" />)}</div>
          : error ? <div className="dx-ui-card dx-tms-state"><span className="dx-tms-state-i is-red">!</span><b>No pudimos cargar la Hoja de Ruta</b>
            <span>{error}</span><button type="button" className="dx-btn primary" onClick={reload}>Reintentar</button></div>
            : !grupos.length ? <div className="dx-ui-card dx-tms-state"><span className="dx-tms-state-i">⛟</span><b>No hay viajes para este día</b>
              <span>Arma una ruta de logística con los pendientes o programa un viaje comercial desde el Monitor.</span></div>
              : grupos.map(grupo => {
                const sin = grupo.key === '__sin__';
                const conductores = [...new Set(grupo.viajes.map(v => v.conductor?.nombre).filter(Boolean))];
                return <section key={grupo.key} className={`dx-tmshr-lane${sin ? ' is-none' : ''}`} aria-label={sin ? 'Sin unidad asignada' : `Unidad ${grupo.vehiculo?.placa}`}>
                  <div className="dx-tmshr-laneh">
                    {sin ? <b className="dx-tmshr-none">⚠ Sin unidad asignada</b> : <>
                      <span className="dx-tmsflota-plate"><span>{grupo.vehiculo?.placa || '———'}</span></span>
                      <span className="dx-tmshr-who"><b>{conductores.join(' · ') || 'Sin conductor'}</b>
                        <small>{[grupo.vehiculo?.tipo && etiquetaTipoVehiculo(grupo.vehiculo.tipo),
                          grupo.vehiculo?.capacidad_toneladas != null && `${grupo.vehiculo.capacidad_toneladas} t`].filter(Boolean).join(' · ')}</small></span></>}
                    <span className="dx-tmshr-load"><span className="dx-tmshr-mini is-gray">{etiquetaContador(grupo.viajes.length, 'viaje')}</span>
                      {grupo.viajes.some(v => ['en_ruta', 'con_incidente'].includes(v.estado)) && <span className="dx-tmshr-mini is-violet">● En ruta</span>}</span>
                  </div>
                  <div className="dx-tmshr-trips">{grupo.viajes.map(tarjeta)}</div>
                </section>;
              })}
      </div>

      <aside className="dx-tmshr-pend" aria-label="Pendientes por enviar a ruta">
        <header><h2>Por enviar a ruta</h2><span className="dx-tmshr-mini is-cyan">{pedidos.length}</span></header>
        <div className="dx-tms-filters">{FILTROS.map(([clave, texto]) => <button key={clave || 'todos'} type="button"
          className={`dx-tms-fchip${filtro === clave ? ' is-on' : ''}`} aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>{texto}</button>)}</div>
        <div className="dx-tmshr-plist">
          {!pedidosVisibles.length ? <div className="dx-tmshr-pempty">{pedidos.length ? 'Nada con este filtro.'
            : 'No hay pendientes. Compras y Almacén los envían desde la OC o la guía con «Enviar a ruta».'}</div>
            : pedidosVisibles.map(pedido => {
              const [icono, tono] = ICONO_DOC[pedido.documento_tipo] || ICONO_DOC.libre;
              const tarde = pedido.fecha_requerida && pedido.fecha_requerida < hoy;
              return <div key={pedido.id} className={`dx-tmshr-pi${sel.has(pedido.id) ? ' is-on' : ''}`}>
                <input type="checkbox" id={`ped-${pedido.id}`} checked={sel.has(pedido.id)} onChange={() => alternar(pedido.id)} />
                <span className={`dx-tmshr-ic ${tono}`} aria-hidden="true">{icono}</span>
                <label htmlFor={`ped-${pedido.id}`} className="dx-tmshr-pi-t"><b>{pedido.titulo}</b>
                  <small>{[pedido.documento_codigo, pedido.direccion || pedido.lugar_nombre].filter(Boolean).join(' · ')}</small>
                  <span className="dx-tmshr-pi-meta">
                    <span className="dx-tmshr-mini is-gray">{pedido.accion === 'entregar' ? 'Entregar' : 'Recoger'}</span>
                    <span className={`dx-tmshr-mini ${pedido.origen === 'almacen' ? 'is-cyan' : pedido.origen === 'compras' ? 'is-violet' : 'is-gray'}`}>
                      {ORIGEN_PEDIDO[pedido.origen] || pedido.origen}</span>
                    {pedido.fecha_requerida && <span className={`dx-tmshr-mini ${tarde ? 'is-red' : 'is-gray'}`}>{tarde ? 'Atrasado · ' : ''}{fechaDM(pedido.fecha_requerida)}
                      {ventanaTexto(pedido.ventana_inicio, pedido.ventana_fin) && ` ${ventanaTexto(pedido.ventana_inicio, pedido.ventana_fin)}`}</span>}
                  </span></label>
                {access.editar && <button type="button" className="dx-tmshr-x" aria-label={`Retirar ${pedido.titulo}`} disabled={trabajando}
                  onClick={() => retirar(pedido)}>×</button>}
              </div>;
            })}
        </div>
        <footer>
          {sel.size ? <>
            <small>{etiquetaContador(sel.size, 'seleccionado')}</small>
            {access.editar && <button type="button" className="dx-btn primary" onClick={() => setEditor({ viaje: null, pedidosNuevos: pedidos.filter(p => sel.has(p.id)) })}>
              ＋ Crear ruta con {sel.size}</button>}
            {access.editar && rutasAbiertas.length > 0 && <div className="dx-tmshr-addto">
              <select className="dx-ui-select" aria-label="Ruta de destino" value={destinoValido} onChange={event => setDestino(event.target.value)}>
                {rutasAbiertas.map(v => <option key={v.id} value={v.id}>{v.codigo} · {v.vehiculo?.placa || 'sin unidad'}</option>)}</select>
              <button type="button" className="dx-btn" disabled={trabajando} onClick={agregarSeleccion}>Agregar</button></div>}
          </> : <small>Marca pendientes para armar una ruta o agrégalos a una ruta del día.</small>}
        </footer>
      </aside>
    </div>

    {editor && <RutaLogisticaEditor empresaId={empresaId} fecha={fecha} viaje={editor.viaje} pedidosNuevos={editor.pedidosNuevos || []}
      pedidos={pedidos} flota={flota} onClose={() => setEditor(null)}
      onSaved={async guardado => { setEditor(null); setSel(new Set()); setAviso(`Ruta ${guardado.codigo} guardada.`); await reload(); }} />}
  </section>;
}

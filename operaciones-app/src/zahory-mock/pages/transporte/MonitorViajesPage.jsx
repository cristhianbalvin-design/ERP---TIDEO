import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { listarViajes } from '../../../services/transporteViajesService.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { filtrarBusquedaInteligente } from '../../components/dx/busquedaInteligente.js';
import { TransporteMapaRutas } from './TransporteMapaRutas.jsx';
import {
  avanceEstimadoViaje, colorEstadoViaje, columnaTableroViaje, etiquetaContador, etiquetaEstadoViaje, etiquetaTipoVehiculo,
  fechaActualLocal, fechaLocalDeViaje, filtrarPeriodoViajes, formatearFechaTransporte, formatearImporte,
  formatearNumeroTransporte, ingresoEstimadoMesViajes, resumenMonitorViajes,
} from './transporteUtils.js';

const COLUMNAS = [['programado', 'Programado', 'is-amber'], ['despachado', 'Despachado', 'is-cyan'],
  ['en_ruta', 'En ruta', 'is-violet'], ['entregado', 'Entregado', 'is-green']];
const PERIODOS = [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['todos', 'Todos']];
const MONEDAS = [['', 'Todas las monedas'], ['PEN', 'S/'], ['USD', 'US$']];
const POR_COLUMNA = 4;
const cliente = row => row.cuenta?.nombre_comercial || row.cuenta?.razon_social || 'Sin cliente';
const iniciales = nombre => String(nombre || '').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('')
  .toLocaleUpperCase('es-PE');
const hora = fecha => new Date(fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
const coordsParada = parada => parada && parada.latitud != null && parada.longitud != null
  ? [Number(parada.latitud), Number(parada.longitud)] : null;

function etiquetaSalida(row, hoy) {
  const fecha = fechaLocalDeViaje(row.fecha_programada);
  const dia = formatearFechaTransporte(fecha).slice(0, 5);
  const horaSalida = row.fecha_programada ? hora(row.fecha_programada) : '';
  if (row.estado === 'programado' && fecha && fecha < hoy) return { texto: `⚠ Atrasado · ${dia} ${horaSalida}`, tono: 'is-late' };
  if (row.estado === 'programado' && fecha === hoy) return { texto: `◷ Hoy ${horaSalida}`, tono: 'is-hot' };
  if (row.estado === 'entregado') return { texto: `Entregado ${dia}`, tono: '' };
  return { texto: fecha ? `◷ ${dia} ${horaSalida}` : 'Sin fecha', tono: '' };
}

function Recurso({ row }) {
  if (row.vehiculo?.placa) {
    return <span className="dx-tms-who"><span className="dx-tms-av" aria-hidden="true">{iniciales(row.conductor?.nombre)}</span>
      <span className="dx-tms-who-text"><b>{row.vehiculo.placa}</b><small>{row.conductor?.nombre || 'Sin conductor'}</small></span></span>;
  }
  if (['borrador', 'programado'].includes(row.estado)) return <span className="dx-tms-flag is-amber">● Sin unidad asignada</span>;
  return <span className="dx-tms-muted">—</span>;
}

export function MonitorViajesPage({ onNav }) {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [vista, setVista] = useState('tablero');
  const [periodo, setPeriodo] = useState('semana');
  const [moneda, setMoneda] = useState('');
  const [abiertas, setAbiertas] = useState({});
  const hoy = fechaActualLocal();

  const reload = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true); setError('');
    try { setRows(await listarViajes(empresaId)); } catch (e) { setError(e.message || 'No se pudieron cargar los viajes.'); }
    finally { setLoading(false); }
  }, [empresaId, access.ver]);
  useEffect(() => { reload(); }, [reload]);

  const resumen = useMemo(() => resumenMonitorViajes(rows, hoy), [rows, hoy]);
  const ingresos = ingresoEstimadoMesViajes(rows);
  const enRuta = useMemo(() => rows.filter(row => ['en_ruta', 'con_incidente'].includes(row.estado)).map(row => {
    const avance = avanceEstimadoViaje(row, row.eventos);
    const origen = coordsParada(row.paradas[0]);
    const destino = coordsParada(row.paradas.at(-1));
    const posicion = avance && origen && destino ? [origen[0] + (destino[0] - origen[0]) * avance.avance,
      origen[1] + (destino[1] - origen[1]) * avance.avance] : null;
    return { row, avance, origen, destino, posicion };
  }), [rows]);
  const rutasMapa = useMemo(() => enRuta.map(item => ({ id: item.row.id, enVivo: true, posicion: item.posicion,
    marca: item.row.vehiculo?.placa || item.row.codigo, alerta: item.row.estado === 'con_incidente',
    puntos: [{ coords: item.origen }, { coords: item.destino }] })), [enRuta]);
  const filtrados = useMemo(() => filtrarBusquedaInteligente(filtrarPeriodoViajes(rows, periodo, hoy)
    .filter(row => !moneda || row.moneda === moneda)
    .map(row => ({ ...row, busqueda: [row.codigo, cliente(row), row.origen_nombre, row.destino_nombre, row.os?.numero,
      row.vehiculo?.placa, row.conductor?.nombre] })), query), [rows, periodo, hoy, moneda, query]);
  const abrir = row => onNav('transporte-viaje', { id: row.id });
  const teclado = (event, row) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrir(row); } };

  function exportar() {
    const encabezado = ['Código', 'Cliente', 'OS', 'Origen', 'Destino', 'Salida', 'Unidad', 'Conductor', 'Moneda', 'Ingreso', 'Estado'];
    const filas = filtrados.map(row => [row.codigo, cliente(row), row.os?.numero || '', row.origen_nombre, row.destino_nombre,
      row.fecha_programada ? `${fechaLocalDeViaje(row.fecha_programada)} ${hora(row.fecha_programada)}` : '',
      row.vehiculo?.placa || '', row.conductor?.nombre || '', row.moneda || '', row.ingreso_estimado ?? '', etiquetaEstadoViaje(row.estado)]);
    const csv = [encabezado, ...filas].map(fila => fila.map(valor => `"${String(valor ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    enlace.download = `viajes-${hoy}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  if (access.motivo) return <AccesoTransporte acceso={access} />;
  const avisoAccion = resumen.atrasados.length || resumen.hoySinUnidad.length;
  const tarjeta = row => {
    const salida = etiquetaSalida(row, hoy);
    const vivo = enRuta.find(item => item.row.id === row.id);
    return <article key={row.id} className="dx-tms-tc" role="button" tabIndex={0} aria-label={`Abrir ${row.codigo}`}
      onClick={() => abrir(row)} onKeyDown={event => teclado(event, row)}>
      <div className="dx-tms-tc-head"><span className="dx-tms-code">{row.codigo}</span>
        <span className="dx-tms-amt">{formatearImporte(row.ingreso_estimado, row.moneda)}</span></div>
      <div className="dx-tms-tc-cli">{cliente(row)}{row.os?.numero && <small> · {row.os.numero}</small>}</div>
      <div className="dx-tms-route"><b>{row.origen_nombre}</b><i>→</i><b>{row.destino_nombre}</b></div>
      <div className="dx-tms-tc-meta">{[row.distancia_km != null && `${formatearNumeroTransporte(row.distancia_km)} km`,
        row.paradas.length > 0 && etiquetaContador(row.paradas.length, 'parada'), row.tipo_unidad && etiquetaTipoVehiculo(row.tipo_unidad)].filter(Boolean).join(' · ')}</div>
      {vivo?.avance && <div className="dx-tms-prog" aria-label={`Avance estimado ${Math.round(vivo.avance.avance * 100)} %`}>
        <b style={{ width: `${vivo.avance.avance * 100}%` }} /></div>}
      <div className="dx-tms-tc-foot"><span className={`dx-tms-when ${salida.tono}`}>{salida.texto}</span><Recurso row={row} />
        {row.estado === 'con_incidente' && <span className="dx-tms-flag is-red">⚑ Incidente</span>}
        {row.estado === 'en_liquidacion' && <span className="dx-ui-pill is-violet"><i />En liquidación</span>}</div>
    </article>;
  };

  return <section className="dx-ui dx-tms dx-tmsmon">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Transporte comercial · Operación</div>
      <h1 className="dx-ui-title">Monitor de Viajes</h1><p className="dx-ui-sub">Planifica, despacha y sigue cada viaje de punta a punta.</p></div>
      <div className="dx-ui-actions"><button type="button" className="dx-btn" onClick={exportar} disabled={!filtrados.length}>Exportar</button>
        {access.crear && <button type="button" className="dx-btn primary" onClick={() => onNav('transporte-crear-ov')}>＋ Nueva orden de viaje</button>}</div>
    </header>

    <div className="dx-tms-kpis">
      <div className="dx-tms-kpi is-warn"><div className="dx-tms-kpi-k"><i>◷</i>Por despachar hoy</div>
        <div className="dx-tms-kpi-v">{resumen.porDespachar}<small>{resumen.porDespachar - resumen.porDespacharConUnidad} sin unidad</small></div>
        <div className="dx-tms-kpi-bar"><b style={{ width: `${resumen.porDespachar ? resumen.porDespacharConUnidad / resumen.porDespachar * 100 : 0}%` }} /></div>
        <div className="dx-tms-kpi-s">{resumen.porDespacharConUnidad} de {resumen.porDespachar} con unidad asignada</div></div>
      <div className="dx-tms-kpi"><div className="dx-tms-kpi-k"><i>⛟</i>En curso</div>
        <div className="dx-tms-kpi-v">{resumen.enRuta + resumen.despachados}</div>
        <div className="dx-tms-kpi-s">{resumen.enRuta} en ruta · {resumen.despachados} despachados</div></div>
      <div className="dx-tms-kpi is-alert"><div className="dx-tms-kpi-k"><i>⚑</i>Con incidente</div>
        <div className="dx-tms-kpi-v">{resumen.conIncidente.length}</div>
        <div className="dx-tms-kpi-s">{resumen.conIncidente.length ? resumen.conIncidente.map(row => row.codigo).join(' · ') : 'Sin incidentes abiertos'}</div>
        {resumen.conIncidente.length > 0 && <span className="dx-tms-pulse" aria-hidden="true" />}</div>
      <div className="dx-tms-kpi"><div className="dx-tms-kpi-k"><i>S/</i>Ingreso estimado del mes</div>
        {Object.keys(ingresos).length ? Object.entries(ingresos).map(([mon, total], index) =>
          <div key={mon} className={index ? 'dx-tms-kpi-v2' : 'dx-tms-kpi-v'}>{formatearImporte(total, mon)}</div>)
          : <div className="dx-tms-kpi-v is-empty">Sin dato</div>}
        <div className="dx-tms-kpi-s">Cada moneda por separado</div></div>
    </div>

    {!loading && avisoAccion > 0 && <div className="dx-tms-hero" role="status"><span className="dx-tms-hero-i" aria-hidden="true">⚡</span>
      <div className="dx-tms-hero-t"><b>{[resumen.atrasados.length && etiquetaContador(resumen.atrasados.length, 'viaje atrasado', 'viajes atrasados'),
        resumen.hoySinUnidad.length && `${etiquetaContador(resumen.hoySinUnidad.length, 'viaje')} de hoy sin unidad`].filter(Boolean).join(' y ')}</b>
        <span>{[...resumen.atrasados.map(row => `${row.codigo} debió salir ${formatearFechaTransporte(fechaLocalDeViaje(row.fecha_programada))}`),
          ...resumen.hoySinUnidad.map(row => `${row.codigo} sale ${hora(row.fecha_programada)}`)].slice(0, 4).join(' · ')}</span></div>
      <button type="button" className="dx-btn" onClick={() => abrir(resumen.atrasados[0] || resumen.hoySinUnidad[0])}>Asignar y despachar →</button></div>}

    {enRuta.length > 0 && <section className="dx-tms-live" aria-label="Viajes en ruta ahora">
      <TransporteMapaRutas rutas={rutasMapa} className="dx-tms-live-map" zoomMaximo={9}
        aviso={rutasMapa.some(ruta => ruta.posicion) ? 'Posición estimada por tiempo' : ''} />
      <div className="dx-tms-live-list"><h3><span className="dx-tms-livedot" aria-hidden="true" />En ruta ahora</h3>
        {enRuta.map(({ row, avance }) => <div key={row.id} className="dx-tms-trk" role="button" tabIndex={0}
          onClick={() => abrir(row)} onKeyDown={event => teclado(event, row)}>
          <div className="dx-tms-trk-r1"><b>{row.codigo}</b><span>{row.origen_nombre} → {row.destino_nombre}</span><em>{row.vehiculo?.placa}</em></div>
          <div className="dx-tms-prog"><b style={{ width: `${(avance?.avance || 0) * 100}%` }} /></div>
          <div className="dx-tms-trk-r2"><span>{avance ? `${Math.round(avance.avance * 100)} % estimado` : 'Sin hora de salida'} · {row.conductor?.nombre || 'Sin conductor'}</span>
            {avance && <em>ETA {hora(avance.llegada)}</em>}</div>
          {row.estado === 'con_incidente' && <div className="dx-tms-trk-inc">⚑ {[...row.eventos].reverse().find(evento => evento.estado_nuevo === 'con_incidente')?.nota || 'Incidente reportado'}</div>}
        </div>)}</div>
    </section>}

    <div className="dx-ui-card dx-tms-card">
      <div className="dx-ui-toolbar"><h2>Viajes</h2><span className="dx-ui-count">{etiquetaContador(filtrados.length, 'viaje')}</span>
        <DxBuscador value={query} onChange={setQuery} placeholder="Código, cliente, ruta, placa u OS…" label="Buscar viajes" />
        <div className="dx-tms-toggle" role="tablist" aria-label="Vista">{[['tablero', '▦ Tablero'], ['lista', '☰ Lista']].map(([clave, texto]) =>
          <button key={clave} type="button" role="tab" aria-selected={vista === clave} className={vista === clave ? 'is-on' : ''}
            onClick={() => setVista(clave)}>{texto}</button>)}</div></div>
      <div className="dx-tms-filters">
        {PERIODOS.map(([clave, texto]) => <button key={clave} type="button" className={`dx-tms-fchip${periodo === clave ? ' is-on' : ''}`}
          aria-pressed={periodo === clave} onClick={() => setPeriodo(clave)}>{texto}</button>)}
        <span className="dx-tms-sep" aria-hidden="true" />
        {MONEDAS.map(([clave, texto]) => <button key={clave || 'todas'} type="button" className={`dx-tms-fchip${moneda === clave ? ' is-on' : ''}`}
          aria-pressed={moneda === clave} onClick={() => setMoneda(clave)}>{texto}</button>)}
      </div>
      {loading ? <div className="dx-tms-skeletons" aria-label="Cargando viajes">{[1, 2, 3, 4].map(key => <div key={key} className="dx-tms-sk" />)}</div>
        : error ? <div className="dx-tms-state"><span className="dx-tms-state-i is-red">!</span><b>No pudimos cargar los viajes</b><span>{error}</span>
          <button type="button" className="dx-btn primary" onClick={reload}>Reintentar</button></div>
          : !rows.length ? <div className="dx-tms-state"><span className="dx-tms-state-i">⛟</span><b>Aún no hay viajes</b>
            <span>Crea la primera orden de viaje desde una OS del cliente o como viaje directo.</span>
            {access.crear && <button type="button" className="dx-btn primary" onClick={() => onNav('transporte-crear-ov')}>＋ Nueva orden de viaje</button>}</div>
            : !filtrados.length ? <div className="dx-tms-state"><span className="dx-tms-state-i">⌕</span><b>Sin resultados</b>
              <span>Prueba con otra búsqueda, periodo o moneda.</span>
              <button type="button" className="dx-btn" onClick={() => { setQuery(''); setPeriodo('todos'); setMoneda(''); }}>Limpiar filtros</button></div>
              : vista === 'tablero' ? <div className="dx-tms-board">{COLUMNAS.map(([clave, texto, tono]) => {
                const items = filtrados.filter(row => columnaTableroViaje(row.estado) === clave)
                  .sort((a, b) => String(a.fecha_programada).localeCompare(String(b.fecha_programada)));
                const visibles = abiertas[clave] ? items : items.slice(0, POR_COLUMNA);
                return <div key={clave} className="dx-tms-col"><div className={`dx-tms-colh ${tono}`}>{texto}<span>{items.length}</span></div>
                  {visibles.length ? visibles.map(tarjeta) : <div className="dx-tms-colempty">Sin viajes</div>}
                  {items.length > POR_COLUMNA && <button type="button" className="dx-tms-more" onClick={() => setAbiertas(old => ({ ...old, [clave]: !old[clave] }))}>
                    {abiertas[clave] ? 'Ver menos' : `Ver ${items.length - POR_COLUMNA} más`}</button>}</div>;
              })}</div>
                : <div role="table" aria-label="Viajes"><div className="dx-ui-head dx-tmsmon-cols" role="row" aria-hidden="true"><span>Código · estado</span><span>Cliente / OS</span>
                  <span>Ruta</span><span>Salida</span><span>Unidad · conductor</span><span className="is-right">Ingreso</span><span /></div>
                  {[...filtrados].sort((a, b) => String(a.fecha_programada).localeCompare(String(b.fecha_programada))).map(row => {
                    const salida = etiquetaSalida(row, hoy);
                    return <div key={row.id} className="dx-ui-row dx-tmsmon-cols" role="button" tabIndex={0}
                      onClick={() => abrir(row)} onKeyDown={event => teclado(event, row)}>
                      <span className="dx-tmsmon-c1"><b className="dx-tms-code">{row.codigo}</b>
                        <span className={`dx-ui-pill ${colorEstadoViaje(row.estado)}`}><i />{etiquetaEstadoViaje(row.estado)}</span></span>
                      <span className="dx-tmsmon-c2"><b>{cliente(row)}</b><small>{row.os?.numero || 'Viaje directo'}</small></span>
                      <span className="dx-tmsmon-c3"><span className="dx-tms-route"><b>{row.origen_nombre}</b><i>→</i><b>{row.destino_nombre}</b></span>
                        <small>{[row.distancia_km != null && `${formatearNumeroTransporte(row.distancia_km)} km`, row.paradas.length > 0 && etiquetaContador(row.paradas.length, 'parada')].filter(Boolean).join(' · ')}</small></span>
                      <span className="dx-tmsmon-c4"><span className={`dx-tms-when ${salida.tono}`}>{salida.texto}</span></span>
                      <span className="dx-tmsmon-c5"><Recurso row={row} /></span>
                      <span className="dx-tmsmon-c6 dx-tms-amt">{formatearImporte(row.ingreso_estimado, row.moneda)}</span>
                      <span className="dx-ui-arrow" aria-hidden="true">›</span></div>;
                  })}</div>}
    </div>
  </section>;
}

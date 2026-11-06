import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { listarViajes, obtenerViaje, cambiarEstadoViaje, eliminarViajeBorrador } from '../../../services/transporteViajesService.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { ModalShell } from '../../components/ModalShell.jsx';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { DxFechaExacta } from '../../components/dx/DxFechaExacta.jsx';
import { DxFiltroMoneda } from '../../components/dx/DxFiltroMoneda.jsx';
import { filtrarBusquedaInteligente } from '../../components/dx/busquedaInteligente.js';
import { accionesPermitidasViaje, colorEstadoViaje, etiquetaEstadoViaje, etiquetaModalidad, etiquetaTipoParada, etiquetaEstadoParada, formatearImporte, formatearFechaTransporte, formatearFechaHoraTransporte, formatearNumeroTransporte, grupoEstadoViaje, etiquetaContador, ingresoEstimadoMesViajes, esFechaViajeMesLocal } from './transporteUtils.js';

const GROUPS = [['todos','Todos'],['borrador','Borrador'],['programados','Programados'],['en_curso','En curso'],['entregados','Entregados'],['cerrados','Cerrados / Cancelados']];
const clientName = row => row.cuenta?.nombre_comercial || row.cuenta?.razon_social || 'Sin dato';
const money = (row, digits = 2) => row.ingreso_estimado == null ? 'Sin dato' : `${row.moneda === 'USD' ? 'US$' : 'S/'} ${Number(row.ingreso_estimado).toLocaleString('es-PE',{ minimumFractionDigits:digits, maximumFractionDigits:digits })}`;
const moneyTotal = (amount, currency) => `${currency === 'USD' ? 'US$' : currency === 'PEN' ? 'S/' : `${currency} `} ${Number(amount).toLocaleString('es-PE',{ minimumFractionDigits:2, maximumFractionDigits:2 })}`;

export function MonitorViajesPage({ onNav }) {
  const sesion = useSesionOperativa(); const empresaId = sesion.empresaId; const access = usePermisosTransporte(sesion);
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [query,setQuery]=useState(''); const [group,setGroup]=useState('todos'); const [date,setDate]=useState(''); const [currency,setCurrency]=useState(''); const [detail,setDetail]=useState(null); const [busy,setBusy]=useState(false); const [serverError,setServerError]=useState(''); const [cancelNote,setCancelNote]=useState('');
  const reload=useCallback(async()=>{if(!empresaId||!access.ver)return;setLoading(true);setError('');try{setRows(await listarViajes(empresaId));}catch(e){setError(e.message||'No se pudieron cargar los viajes.');}finally{setLoading(false);}},[empresaId,access.ver]);
  useEffect(()=>{reload();},[reload]);
  const filtered=useMemo(()=>filtrarBusquedaInteligente(rows.map(row=>({...row,busqueda:[row.codigo,clientName(row),row.origen_nombre,row.destino_nombre,row.os?.numero,row.os_cliente_id]})),query)
    .filter(row=>group==='todos'||grupoEstadoViaje(row.estado)===group)
    .filter(row=>!date||String(row.fecha_programada||'').slice(0,10)===date)
    .filter(row=>!currency||row.moneda===currency),[rows,query,group,date,currency]);
  const incomeByCurrency=ingresoEstimadoMesViajes(rows);
  const income=Object.entries(incomeByCurrency).map(([currency,amount])=>moneyTotal(amount,currency)).join(' · ')||'Sin dato';
  const kpis=[['Programados',rows.filter(r=>r.estado==='programado').length],['En curso',rows.filter(r=>['despachado','en_ruta','con_incidente'].includes(r.estado)).length],['Entregados del mes',rows.filter(r=>esFechaViajeMesLocal(r.fecha_programada)&&['entregado','en_liquidacion','cerrado'].includes(r.estado)).length],['Ingreso estimado del mes',income]];
  const detailGroups=detail?[
    ['General',[['Cliente',clientName(detail)],['OS cliente',detail.os?.numero||'Sin dato'],['Fecha programada',formatearFechaHoraTransporte(detail.fecha_programada)]]],
    ['Ruta',[['Ruta',`${detail.origen_nombre} → ${detail.destino_nombre}`],['Distancia',detail.distancia_km==null?'Sin dato':`${formatearNumeroTransporte(detail.distancia_km)} km`]]],
    ['Carga',[['Unidad',detail.tipo_unidad||'Sin dato'],['Descripción',detail.carga_descripcion||'Sin dato'],['Peso / volumen',`${formatearNumeroTransporte(detail.peso_toneladas)} t / ${formatearNumeroTransporte(detail.volumen_m3)} m³`]]],
    ['Tarifa',[['Modalidad',etiquetaModalidad(detail.modalidad)],['Tarifa unitaria',detail.tarifa_unitaria==null?'Sin dato':formatearImporte(detail.tarifa_unitaria,detail.moneda,detail.modalidad)],['Mínimo facturable',detail.minimo_facturable==null?'Sin dato':formatearImporte(detail.minimo_facturable,detail.moneda)],['Cantidad facturable',formatearNumeroTransporte(detail.cantidad_facturable)],['Ingreso estimado',money(detail)],['Observaciones',detail.observaciones||'Sin dato']]],
  ]:[];
  async function open(row){setServerError('');try{setDetail(await obtenerViaje(empresaId,row.id));}catch(e){setServerError(e.message);}}
  async function transition(next,note=null){if(!detail)return;setBusy(true);setServerError('');try{await cambiarEstadoViaje(detail.id,next,note);await reload();await open(detail);}catch(e){setServerError(e.message);}finally{setBusy(false);}}
  async function remove(){if(!detail||!globalThis.confirm(`¿Eliminar el viaje ${detail.codigo}? Esta acción no se puede deshacer.`))return;setBusy(true);try{await eliminarViajeBorrador(empresaId,detail.id);setDetail(null);await reload();}catch(e){setServerError(e.message);}finally{setBusy(false);}}
  if(access.motivo)return <AccesoTransporte acceso={access}/>;
  return <section className="dx-ui dx-transporte dx-transporte-viajes">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Transporte Comercial</div><h1 className="dx-ui-title">Monitor de Viajes</h1><p className="dx-ui-sub">Órdenes de viaje y seguimiento de operaciones.</p></div><div className="dx-ui-actions">{access.crear&&<button className="dx-btn primary" onClick={()=>onNav('transporte-crear-ov')}>Nueva orden de viaje</button>}</div></header>
    <div className="dx-ui-kpi-row">{kpis.map(([label,value])=><div className="dx-ui-kpi" key={label}><strong className={value==='Sin dato'?'dx-transporte-no-data':''}>{value}</strong><span>{label}</span></div>)}</div>
    <div className="dx-ui-card dx-transporte-list"><div className="dx-ui-toolbar"><h2>Viajes</h2><span className="dx-ui-count">{etiquetaContador(filtered.length,'viaje')}</span><div className="dx-ui-segment" role="tablist" aria-label="Grupo de estado">{GROUPS.map(([key,label])=><button key={key} className={group===key?'on':''} aria-pressed={group===key} onClick={()=>setGroup(key)}>{label}</button>)}</div><DxBuscador value={query} onChange={setQuery} placeholder="Código, cliente, origen, destino u OS…"/><DxFechaExacta value={date} onChange={setDate} label="Fecha programada"/><DxFiltroMoneda value={currency} onChange={setCurrency}/></div>
      <div className="dx-ui-head dx-transporte-trip-cols"><span>Código</span><span>Cliente / OS</span><span>Ruta</span><span>Fecha programada</span><span>Unidad / Conductor</span><span>Ingreso estimado</span><span>Estado</span></div>
      {loading?<div className="dx-ui-empty">Cargando viajes…</div>:error?<div className="dx-ui-empty">{error}<button onClick={reload}>Reintentar</button></div>:!filtered.length?<div className="dx-ui-empty">No hay viajes que coincidan con los filtros.</div>:filtered.map(row=><div className="dx-ui-row dx-transporte-trip-cols" key={row.id} role="button" tabIndex="0" onClick={()=>open(row)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(row);}}}>
        <strong className="dx-transporte-code">{row.codigo}</strong><span><small className="dx-transporte-card-label">Cliente / OS</small><b>{clientName(row)}</b><small>{row.os?.numero||'Sin OS cliente'}</small></span><strong>{row.origen_nombre} → {row.destino_nombre}</strong><span><small className="dx-transporte-card-label">Fecha programada</small>{formatearFechaTransporte(String(row.fecha_programada||'').slice(0,10))}</span><span className="dx-transporte-unit"><small className="dx-transporte-card-label">Unidad / Conductor</small><b>{row.tipo_unidad||'Sin dato'}</b><small>{[row.vehiculo?.placa,row.conductor?.nombre].filter(Boolean).join(' · ')||'Sin asignar'}</small></span><strong><small className="dx-transporte-card-label">Ingreso estimado</small>{money(row)}</strong><span><small className="dx-transporte-card-label">Estado</small><span className={`dx-ui-pill ${colorEstadoViaje(row.estado)}`}><i/>{etiquetaEstadoViaje(row.estado)}</span></span>
      </div>)}
    </div>
    <ModalShell open={Boolean(detail)} title={detail?.codigo||'Detalle del viaje'} subtitle={detail?`${clientName(detail)} · ${etiquetaEstadoViaje(detail.estado)}`:''} variant="dx-modal dx-transporte-modal" width={980} onClose={()=>setDetail(null)} footer={detail&&<div className="dx-ui-actions dx-transporte-detail-actions">
      {access.editar&&['borrador','programado'].includes(detail.estado)&&<button className="dx-btn" onClick={()=>onNav('transporte-crear-ov',{id:detail.id})}>Editar</button>}
      {access.editar&&accionesPermitidasViaje(detail.estado).includes('programado')&&<button className="dx-btn primary" onClick={()=>transition('programado')}>Programar</button>}
      {access.editar&&accionesPermitidasViaje(detail.estado).includes('borrador')&&<button className="dx-btn" onClick={()=>transition('borrador')}>Volver a borrador</button>}
      {access.editar&&accionesPermitidasViaje(detail.estado).includes('cancelado')&&<><input aria-label="Motivo de cancelación" placeholder="Motivo obligatorio" value={cancelNote} onChange={e=>setCancelNote(e.target.value)}/><button className="dx-btn" disabled={!cancelNote.trim()||busy} onClick={()=>transition('cancelado',cancelNote)}>Cancelar viaje</button></>}
      {access.editar&&detail.estado==='borrador'&&<button className="dx-btn" disabled={busy} onClick={remove}>Eliminar borrador</button>}
    </div>}>
      {detail&&<div className="card-body dx-transporte-detail">{detailGroups.map(([title,items])=><section className="dx-transporte-detail-block" key={title}><h3>{title}</h3><dl className="dx-transporte-detail-grid">{items.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>)}
        <h3>Paradas</h3><ol className="dx-transporte-stops">{(detail.paradas||[]).map(stop=><li key={stop.id}><b>{stop.nombre}</b><span>{etiquetaTipoParada(stop.tipo)} · {etiquetaEstadoParada(stop.estado)}</span><small>{stop.direccion||'Sin dato'}</small></li>)}</ol>
        <h3>Historial</h3><ol className="dx-transporte-events">{(detail.eventos||[]).map(event=><li key={event.id}><b>{event.estado_anterior ? `${etiquetaEstadoViaje(event.estado_anterior)} → ${etiquetaEstadoViaje(event.estado_nuevo)}` : `Creado como ${etiquetaEstadoViaje(event.estado_nuevo)}`}</b><time>{new Date(event.created_at).toLocaleString('es-PE')}</time><span>{[event.nota||'Sin nota', event.created_by_name && !/^[0-9a-f-]{36}$/i.test(event.created_by_name) ? event.created_by_name : null].filter(Boolean).join(' · ')}</span></li>)}</ol>
        <div className="dx-transporte-next"><b>Siguientes etapas</b><p>Despacho y asignación, seguimiento en ruta, entrega y liquidación se habilitarán en las siguientes etapas.</p></div>{serverError&&<div className="dx-transporte-error" role="alert">{serverError}</div>}
      </div>}
    </ModalShell>
  </section>;
}

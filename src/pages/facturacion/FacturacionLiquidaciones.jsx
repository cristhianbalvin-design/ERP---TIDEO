import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context.jsx';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { calcularFechaVencimientoCxC, resolverCondicionPagoCxC, revisarDuplicadoFactura } from '../../services/finanzasService.js';
import { getTipoCambioPorFecha } from '../../services/tipoCambioService.js';
import { facturarLiquidacion, liquidacionesPorFacturar } from '../../services/flotaFacturacionService.js';
import { calcularVistaLiquidacion } from './facturacionLiquidaciones.js';

const dinero = (n, moneda) => `${moneda === 'USD' ? 'US$' : 'S/'} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const idNuevo = prefijo => `${prefijo}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;
const periodo = fecha => new Date(`${fecha.slice(0, 10)}T00:00:00Z`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function FacturacionLiquidaciones({ empresa, cuentas, centrosBeneficio, sociedades, modoVista, puedeCrear, nextNumero, serie, condiciones, condicionFallback, onCantidad }) {
  const { setFacturas, setCxc, setOsClientes, addNotificacion, recargarParametrosGenerales } = useApp();
  const [datos, setDatos] = useState([]), [cargando, setCargando] = useState(true), [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState(''), [filtro, setFiltro] = useState('saldo'), [seleccion, setSeleccion] = useState(null);
  const [ids, setIds] = useState([]), [form, setForm] = useState({}), [tipoCambio, setTipoCambio] = useState(''), [fuente, setFuente] = useState('referencial');
  const [guardando, setGuardando] = useState(false), [errorPanel, setErrorPanel] = useState(''), [duplicado, setDuplicado] = useState(false);
  const emitiendo = useRef(false);
  const cargar = async () => {
    setCargando(true); setError('');
    try { setDatos(await liquidacionesPorFacturar(empresa.id)); } catch (e) { setError(e.message || 'No se pudieron cargar las liquidaciones.'); } finally { setCargando(false); }
  };
  useEffect(() => { if (empresa?.id) cargar(); }, [empresa?.id]);
  const visibles = datos.filter(l => modoVista.sinFiltro || modoVista.sociedadesIds.includes(l.sociedad_id));
  const pendientes = l => (l.lineas || []).filter(x => !x.factura_vigente);
  useEffect(() => { onCantidad(visibles.filter(l => pendientes(l).length > 0).length); }, [datos, modoVista.sinFiltro, modoVista.sociedadesIds.join('|')]);
  const parcial = l => pendientes(l).length > 0 && pendientes(l).length < (l.lineas || []).length;
  const filtradas = visibles.filter(l => {
    const p = pendientes(l).length;
    return (filtro === 'todas' || (filtro === 'saldo' && p > 0) || (filtro === 'parcial' && parcial(l)) || (filtro === 'facturadas' && !p)) && normalizar(`${l.numero} ${l.cliente} ${l.contrato_numero} ${l.periodo}`).includes(normalizar(busqueda));
  });
  const abrir = l => {
    const hoy = new Date().toISOString().slice(0, 10);
    const cuenta = cuentas.find(c => c.id === l.cuenta_id);
    const condicion = resolverCondicionPagoCxC({ condicionCliente: cuenta?.condicion_pago, condicionFallback }).condicion_pago;
    setForm({ numero: nextNumero, fecha_emision: hoy, condicion_pago: condicion, fecha_vencimiento: calcularFechaVencimientoCxC(hoy, condicion, condicionFallback), centro_beneficio_id: '', glosa: '' });
    setIds(pendientes(l).map(x => x.id)); setSeleccion(l); setErrorPanel(''); setDuplicado(false); setTipoCambio(''); setFuente('referencial');
  };
  useEffect(() => {
    if (!seleccion || seleccion.moneda !== 'USD' || !form.fecha_emision || fuente === 'manual') return undefined;
    let cancelado = false; setTipoCambio('');
    getSupabaseClient().then(sb => getTipoCambioPorFecha(form.fecha_emision, sb)).then(tc => {
      if (!cancelado && Number(tc?.usd) > 0) setTipoCambio((1 / Number(tc.usd)).toFixed(6));
    }).catch(() => {});
    return () => { cancelado = true; };
  }, [seleccion?.id, form.fecha_emision, fuente]);
  const cambiar = (campo, valor) => {
    setForm(f => { const n = { ...f, [campo]: valor }; if (campo === 'fecha_emision' || campo === 'condicion_pago') n.fecha_vencimiento = calcularFechaVencimientoCxC(n.fecha_emision, n.condicion_pago, condicionFallback); return n; });
    if (campo === 'numero') setDuplicado(false);
    setErrorPanel('');
  };
  const lineas = (seleccion?.lineas || []).filter(l => ids.includes(l.id));
  const preview = calcularVistaLiquidacion(lineas, seleccion?.moneda, tipoCambio);
  const cebes = centrosBeneficio.filter(c => c.empresa_id === empresa.id && c.estado === 'activo' && (!c.fecha_inicio || c.fecha_inicio.slice(0, 10) <= form.fecha_emision) && (!c.fecha_fin || c.fecha_fin.slice(0, 10) >= form.fecha_emision) && (!empresa.multisociedad_habilitado || c.sociedad_id === seleccion?.sociedad_id));
  const emitir = async () => {
    if (emitiendo.current) return;
    if (!puedeCrear || !ids.length || !form.numero?.trim() || !form.fecha_emision || !form.fecha_vencimiento || form.fecha_vencimiento < form.fecha_emision || !cebes.some(c => c.id === form.centro_beneficio_id)) { setErrorPanel('Selecciona equipos y completa número, fechas válidas y CEBE vigente.'); return; }
    if (seleccion.moneda === 'USD' && !(Number(tipoCambio) > 0)) { setErrorPanel('Indica el tipo de cambio para determinar la detracción.'); return; }
    emitiendo.current = true; setGuardando(true); setErrorPanel('');
    try {
      const revision = await revisarDuplicadoFactura({ empresaId: empresa.id, sociedadId: seleccion.sociedad_id, cuentaId: seleccion.cuenta_id, numero: form.numero.trim() });
      if (revision.mismoBeneficiario.length) throw new Error('El número ya existe para este cliente y sociedad.');
      if (revision.otrosBeneficiarios.length && !duplicado) throw new Error('El número ya existe para otro cliente. Confirma su uso para continuar.');
      const r = await facturarLiquidacion(seleccion.id, ids, { ...form, numero: form.numero.trim(), factura_id: idNuevo('fac'), cxc_id: idNuevo('cxc'), tipo_cambio_detraccion: seleccion.moneda === 'USD' ? Number(tipoCambio) : null, tipo_cambio_fuente: seleccion.moneda === 'USD' ? fuente : null, confirmar_numero_duplicado: duplicado });
      if (r.factura?.id) setFacturas(prev => [r.factura, ...prev.filter(f => f.id !== r.factura.id)]);
      if (r.cxc?.id) setCxc(prev => [r.cxc, ...prev.filter(c => c.id !== r.cxc.id)]);
      if (r.os?.id) setOsClientes(prev => prev.map(o => o.id === r.os.id ? r.os : o));
      addNotificacion(`Factura ${r.factura?.numero || form.numero} emitida. Saldo restante: ${dinero(r.saldo_restante, seleccion.moneda)}.`);
      setSeleccion(null);
      if (serie && form.numero.trim() === nextNumero) {
        try { const sb = await getSupabaseClient(); const { error: e } = await sb.from('series_documentarias').update({ siguiente_correlativo: Number(serie.siguiente_correlativo) + 1 }).eq('id', serie.id); if (e) throw e; await recargarParametrosGenerales(); } catch (e) { addNotificacion(`Factura emitida; revisa el correlativo de la serie: ${e.message}`); }
      }
      await cargar();
    } catch (e) { setErrorPanel(e.message || 'No se pudo emitir la factura.'); } finally { emitiendo.current = false; setGuardando(false); }
  };
  const montos = ['PEN', 'USD'].map(m => ({ moneda: m, saldo: visibles.filter(l => l.moneda === m).reduce((s, l) => s + Number(l.saldo || 0), 0) })).filter(x => x.saldo || x.moneda === 'PEN');
  return <>
    <div className="dx-ui-kpi-row dx-facliq-kpis">
      <div className="dx-ui-kpi"><strong>{visibles.filter(l => pendientes(l).length).length}</strong><span>Por facturar</span></div>
      <div className="dx-ui-kpi"><strong>{montos.map(x => dinero(x.saldo, x.moneda)).join(' · ')}</strong><span>Saldo sin IGV · con IGV {montos.map(x => dinero(x.saldo * 1.18, x.moneda)).join(' · ')}</span></div>
      <div className="dx-ui-kpi"><strong>{visibles.reduce((s, l) => s + pendientes(l).length, 0)}</strong><span>Equipos pendientes</span></div>
      <div className="dx-ui-kpi"><strong>{visibles.filter(parcial).length}</strong><span>Facturadas en parte</span></div>
    </div>
    <div className="dx-ui-card dx-facliq-card">
      <div className="dx-ui-toolbar"><h2>Liquidaciones por facturar</h2><span className="dx-ui-count">{filtradas.length}</span><label className="dx-ui-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar liquidaciones" placeholder="Buscar liquidación, cliente o contrato…" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label><select className="dx-ui-select" aria-label="Estado de facturación" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="saldo">Con saldo</option><option value="parcial">Facturadas en parte</option><option value="facturadas">Facturadas</option><option value="todas">Todas</option></select></div>
      <div className="dx-ui-head dx-facliq-cols"><span>Liquidación</span><span>Cliente · contrato</span><span>Periodo</span><span>Equipos</span><span>Total</span><span>Facturado</span><span>Saldo</span><span /></div>
      {filtradas.map(l => <div className="dx-ui-row dx-facliq-cols" key={l.id}>
        <div><span className="dx-facliq-label">Liquidación</span><strong>{l.numero}</strong>{(l.lineas || []).some(linea => Number(linea.penalidad) > 0) && <small className="dx-facliq-penalidad">con penalidad DMR</small>}</div><div><span className="dx-facliq-label">Cliente · contrato</span><strong>{l.cliente}</strong><small>{l.contrato_numero}</small></div><div><span className="dx-facliq-label">Periodo</span>{periodo(l.periodo)}</div><div><span className="dx-facliq-label">Equipos facturados</span><div className="dx-facliq-avance"><div className="dx-facliq-barra" role="progressbar" aria-label="Equipos facturados" aria-valuemin={0} aria-valuemax={(l.lineas || []).length} aria-valuenow={(l.lineas || []).length - pendientes(l).length}><div style={{ width: `${(l.lineas || []).length ? ((l.lineas || []).length - pendientes(l).length) / l.lineas.length * 100 : 0}%` }} /></div><small>{(l.lineas || []).length - pendientes(l).length} de {(l.lineas || []).length} equipos facturados</small></div></div><div><span className="dx-facliq-label">Total</span>{dinero(l.total, l.moneda)}</div><div><span className="dx-facliq-label">Facturado</span>{dinero(l.facturado_vigente, l.moneda)}</div><div><span className="dx-facliq-label">Saldo</span><strong>{dinero(l.saldo, l.moneda)}</strong></div><div>{pendientes(l).length > 0 && <button className="dx-btn" disabled={!puedeCrear} title={!puedeCrear ? 'No tienes permiso para emitir comprobantes' : undefined} onClick={() => abrir(l)}>Facturar</button>}</div>
      </div>)}
      {cargando ? <div className="dx-ui-empty">Cargando liquidaciones…</div> : error ? <div className="dx-ui-empty" role="alert">{error} <button className="dx-btn" onClick={cargar}>Reintentar</button></div> : !filtradas.length && <div className="dx-ui-empty">No hay liquidaciones para estos filtros.</div>}
    </div>
    {seleccion && <div className="dx-ui-overlay"><section className="dx-ui-dialog dx-ui-dialog-wide dx-facliq-panel" role="dialog" aria-modal="true" aria-labelledby="facliq-titulo">
      <div className="dx-ui-dialog-head"><div><h2 id="facliq-titulo">Facturar {seleccion.numero}</h2><p>{seleccion.cliente} · {seleccion.contrato_numero} · {periodo(seleccion.periodo)}</p></div><button className="dx-btn" aria-label="Cerrar" disabled={guardando} onClick={() => setSeleccion(null)}>×</button></div>
      <div className="dx-facliq-body"><div className="dx-facliq-form"><h3>Equipos</h3><label><input type="checkbox" checked={pendientes(seleccion).length > 0 && ids.length === pendientes(seleccion).length} onChange={e => setIds(e.target.checked ? pendientes(seleccion).map(x => x.id) : [])} /> Todos los pendientes</label>
        {(seleccion.lineas || []).map(l => <label className="dx-facliq-equipo" key={l.id}><input type="checkbox" disabled={!!l.factura_vigente} checked={ids.includes(l.id)} onChange={e => setIds(e.target.checked ? [...ids, l.id] : ids.filter(id => id !== l.id))} /><span><strong>{l.codigo} · {l.nombre}</strong><small>{l.factura_vigente ? `Facturado · ${l.factura_vigente.numero}` : `${l.horas_facturables} h · DMR ${l.dmr}%`}</small></span><b>{dinero(l.total, seleccion.moneda)}</b></label>)}
        <h3>Datos del comprobante</h3><div className="dx-ui-form-grid is-2">
          <label className="dx-ui-field"><span>Número</span><input value={form.numero} onChange={e => cambiar('numero', e.target.value)} /></label><label className="dx-ui-field"><span>Fecha de emisión</span><input type="date" value={form.fecha_emision} onChange={e => cambiar('fecha_emision', e.target.value)} /></label>
          <label className="dx-ui-field"><span>Condición de pago</span><select className="dx-ui-select" value={form.condicion_pago} onChange={e => cambiar('condicion_pago', e.target.value)}>{condiciones.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label><label className="dx-ui-field"><span>Vencimiento</span><input type="date" value={form.fecha_vencimiento} onChange={e => cambiar('fecha_vencimiento', e.target.value)} /></label>
          <label className="dx-ui-field"><span>CEBE</span><select className="dx-ui-select" value={form.centro_beneficio_id} onChange={e => cambiar('centro_beneficio_id', e.target.value)}><option value="">Selecciona</option>{cebes.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}</select></label><label className="dx-ui-field"><span>Moneda</span><input readOnly value={seleccion.moneda} /></label><label className="dx-ui-field"><span>Sociedad</span><input readOnly value={sociedades.find(s => s.id === seleccion.sociedad_id)?.nombre || '—'} /></label>
          {seleccion.moneda === 'USD' && <label className="dx-ui-field"><span>Tipo de cambio · PEN por USD</span><input type="number" min="0" step="0.000001" value={tipoCambio} onChange={e => { setTipoCambio(e.target.value); setFuente('manual'); }} /><small>{fuente === 'manual' ? 'Manual' : 'Referencial'}</small></label>}
          <label className="dx-ui-field dx-facliq-glosa"><span>Glosa</span><textarea value={form.glosa} onChange={e => cambiar('glosa', e.target.value)} /></label>
        </div>
      </div><aside className="dx-facliq-aside"><h3>Saldo de la liquidación</h3><div className="dx-facliq-total"><span>Total liquidado</span><b>{dinero(seleccion.total, seleccion.moneda)}</b></div><div className="dx-facliq-total"><span>Ya facturado</span><b>{dinero(seleccion.facturado_vigente, seleccion.moneda)}</b></div><div className="dx-facliq-total"><span>Saldo después</span><b>{dinero(Number(seleccion.saldo) - preview.subtotal, seleccion.moneda)}</b></div><h3>Vista previa</h3><small>Importes informativos; la RPC calcula los importes definitivos.</small>
        {lineas.map(l => <React.Fragment key={l.id}><div className="dx-facliq-total"><span>{l.codigo} · {l.nombre}</span><b>{dinero(l.importe_base, seleccion.moneda)}</b></div>{Number(l.penalidad) > 0 && <div className="dx-facliq-total dx-facliq-penalidad"><span>Penalidad DMR · {l.codigo}</span><b>− {dinero(l.penalidad, seleccion.moneda)}</b></div>}</React.Fragment>)}
        <div className="dx-facliq-total"><span>Valor de venta</span><b>{dinero(preview.subtotal, seleccion.moneda)}</b></div><div className="dx-facliq-total"><span>IGV 18 %</span><b>{dinero(preview.igv, seleccion.moneda)}</b></div><div className="dx-facliq-total"><strong>Total</strong><strong>{dinero(preview.total, seleccion.moneda)}</strong></div>{preview.baseSoles === null ? <small>Indica el tipo de cambio para estimar la detracción.</small> : preview.aplica && <><div className="dx-facliq-total"><span>Detracción 10 %</span><b>{dinero(preview.detraccion, seleccion.moneda)}</b></div><div className="dx-facliq-total"><span>Neto</span><b>{dinero(preview.neto, seleccion.moneda)}</b></div></>}
      </aside></div><div className="dx-ui-dialog-foot">{errorPanel && <div className="dx-facliq-error" role="alert">{errorPanel}{errorPanel.includes('otro cliente') && <label><input type="checkbox" checked={duplicado} onChange={e => setDuplicado(e.target.checked)} /> Confirmo el número duplicado</label>}</div>}<button className="dx-btn" disabled={guardando} onClick={() => setSeleccion(null)}>Cancelar</button><button className="dx-btn primary" disabled={guardando || !puedeCrear || !ids.length} onClick={emitir}>{guardando ? 'Emitiendo…' : 'Emitir factura'}</button></div>
    </section></div>}
  </>;
}

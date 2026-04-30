import React, { useState } from 'react';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { formatCurrencyTotals, formatMoney, sumByCurrency } from './lib/currency.js';
import {
  buildEgresoTesoreria,
  buildDebtSummary,
  buildFinanciamiento,
  buildGastoIntereses,
  buildPagoFinanciamiento,
  createFinanciamientosDataSource,
  generarAmortizacion as generarAmortizacionService,
  isCapitalPayment,
  nextCuota,
  recalcularTabla as recalcularTablaService,
} from './services/financiamientosService.js';

const tipoLabel = { bancario:'Bancario', tercero:'Tercero', leasing:'Leasing', linea_credito:'Linea credito', otro:'Otro' };
const fmtMoney = (moneda, monto) => formatMoney(monto, moneda);
const finMoney = (f, monto) => fmtMoney(f?.moneda || 'PEN', monto);
const fmtDate = date => date ? new Date(date + 'T00:00:00').toLocaleDateString('es-PE') : '-';
const badgeEstado = estado => estado === 'vigente' ? 'badge-green' : estado === 'atrasado' ? 'badge-red' : estado === 'en_gracia' ? 'badge-orange' : 'badge-gray';
const badgeCuota = estado => estado === 'pagada' ? 'badge-green' : estado === 'pendiente' ? 'badge-orange' : estado === 'cancelada' ? 'badge-red' : 'badge-gray';

function moneyByCurrency(totals) {
  return formatCurrencyTotals(totals);
  return keys.length ? keys.map(m => fmtMoney(m, totals[m])).join(' · ') : fmtMoney('PEN', 0);
}

function NuevoFinanciamientoPanel({ form, setForm, onClose, onSubmit }) {
  const tabla = generarAmortizacionService({ monto:form.monto_original, tasaAnual:form.tasa_anual, plazoMeses:form.plazo_meses, mesesGracia:form.meses_gracia, fechaDesembolso:form.fecha_desembolso, diaPago:form.dia_pago, tipoCuota:form.tipo_cuota });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]:v }));
  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose}/>
      <div className="side-panel" style={{width:'min(580px, 96vw)'}}>
        <div className="side-panel-head"><div><div className="eyebrow">Nuevo financiamiento</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Los campos * son obligatorios</div></div><button className="icon-btn" onClick={onClose}>{I.x}</button></div>
        <form className="side-panel-body" onSubmit={onSubmit}>
          <div className="grid-2" style={{gap:16}}>
            <div className="input-group"><label>Tipo *</label><select className="select" value={form.tipo} onChange={e=>set('tipo', e.target.value)}><option value="bancario">Prestamo bancario</option><option value="tercero">Prestamo de tercero</option><option value="leasing">Leasing</option><option value="linea_credito">Linea de credito</option><option value="otro">Otro</option></select></div>
            <div className="input-group"><label>Entidad *</label><input className="input" value={form.entidad} onChange={e=>set('entidad', e.target.value)} required/></div>
            <div className="input-group"><label>Moneda</label><select className="select" value={form.moneda} onChange={e=>set('moneda', e.target.value)}><option>PEN</option><option>USD</option></select></div>
            <div className="input-group"><label>Monto recibido *</label><input className="input" type="number" value={form.monto_original} onChange={e=>set('monto_original', e.target.value)} required/></div>
            <div className="input-group"><label>Fecha desembolso</label><input className="input" type="date" value={form.fecha_desembolso} onChange={e=>set('fecha_desembolso', e.target.value)}/></div>
            <div className="input-group"><label>Tasa anual</label><input className="input" type="number" value={form.tasa_anual} onChange={e=>set('tasa_anual', e.target.value)}/></div>
            <div className="input-group"><label>Plazo meses</label><input className="input" type="number" value={form.plazo_meses} onChange={e=>set('plazo_meses', e.target.value)}/></div>
            <div className="input-group"><label>Gracia meses</label><input className="input" type="number" value={form.meses_gracia} onChange={e=>set('meses_gracia', e.target.value)}/></div>
            <div className="input-group"><label>Dia de pago</label><input className="input" type="number" value={form.dia_pago} onChange={e=>set('dia_pago', e.target.value)}/></div>
            <div className="input-group"><label>Tipo cuota</label><select className="select" value={form.tipo_cuota} onChange={e=>set('tipo_cuota', e.target.value)}><option value="frances">Cuota fija</option><option value="aleman">Decreciente</option><option value="bullet">Solo intereses</option></select></div>
            <div className="input-group"><label>Contacto</label><input className="input" value={form.contacto_nombre} onChange={e=>set('contacto_nombre', e.target.value)}/></div>
            <div className="input-group"><label>Banco receptor</label><input className="input" value={form.cuenta_bancaria_destino} onChange={e=>set('cuenta_bancaria_destino', e.target.value)}/></div>
            <div className="input-group" style={{gridColumn:'1 / -1'}}><label>Proposito</label><textarea className="input" rows="2" value={form.proposito} onChange={e=>set('proposito', e.target.value)}/></div>
          </div>
          <div className="card mt-6" style={{padding:16}}><strong>Vista previa</strong><div className="mt-4">Cuota estimada: <strong>{fmtMoney(form.moneda, tabla[0]?.total || 0)}</strong></div><div>Total a pagar: <strong>{fmtMoney(form.moneda, tabla.reduce((s,c)=>s+c.total,0))}</strong></div><div>Total intereses: <strong>{fmtMoney(form.moneda, tabla.reduce((s,c)=>s+c.interes,0))}</strong></div></div>
          <div className="row mt-6" style={{justifyContent:'flex-end'}}><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary">Guardar y generar tabla</button></div>
        </form>
      </div>
    </>
  );
}

function PagoModal({ data, onClose, onConfirm }) {
  const { financiamiento, cuota } = data;
  const cuotas = (financiamiento.tabla_amortizacion || []).filter(c => c.estado !== 'pagada' && c.estado !== 'cancelada');
  const inicial = cuota || cuotas[0];
  const [modo, setModo] = useState(inicial ? 'cuota' : 'capital_parcial');
  const [cuotaNumero, setCuotaNumero] = useState(inicial?.numero || '');
  const [pago, setPago] = useState({ fecha:'2026-04-28', cuenta_bancaria:financiamiento.cuenta_bancaria_destino || 'BCP Cta. cte.', referencia:'', comprobante:'', capital:Math.min(financiamiento.saldo_pendiente || 0, 1000) });
  const cuotaSel = cuotas.find(c => c.numero === Number(cuotaNumero)) || inicial;
  const capitalAbono = modo === 'capital_total' ? Number(financiamiento.saldo_pendiente || 0) : Math.min(Number(pago.capital || 0), Number(financiamiento.saldo_pendiente || 0));
  const resumen = modo === 'cuota' && cuotaSel ? { capital:cuotaSel.capital, interes:cuotaSel.interes, total:cuotaSel.total } : { capital:capitalAbono, interes:0, total:capitalAbono };
  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose}/>
      <div className="side-panel" style={{width:'min(580px, 96vw)'}}>
        <div className="side-panel-head"><div><div className="eyebrow">Registrar pago / abono</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{financiamiento.codigo} · {financiamiento.entidad}</div></div><button className="icon-btn" onClick={onClose}>{I.x}</button></div>
        <div className="side-panel-body">
          <div className="input-group"><label>Tipo de pago</label><select className="select" value={modo} onChange={e=>setModo(e.target.value)}><option value="cuota">Pagar cuota pactada</option><option value="capital_parcial">Abono parcial a capital</option><option value="capital_total">Cancelar saldo total de capital</option></select></div>
          {modo === 'cuota' && <div className="input-group"><label>Cuota</label><select className="select" value={cuotaNumero} onChange={e=>setCuotaNumero(e.target.value)}>{cuotas.map(c => <option key={c.numero} value={c.numero}>Cuota N {c.numero} - {fmtDate(c.fecha)} - {finMoney(financiamiento, c.total)}</option>)}</select></div>}
          {modo === 'capital_parcial' && <div className="input-group"><label>Monto a capital</label><input className="input" type="number" value={pago.capital} onChange={e=>setPago(v=>({...v, capital:e.target.value}))}/></div>}
          <div className="card" style={{padding:16}}><div>Capital: <strong>{finMoney(financiamiento, resumen.capital)}</strong></div><div>Interes: <strong>{finMoney(financiamiento, resumen.interes)}</strong></div><div>Total egreso: <strong>{finMoney(financiamiento, resumen.total)}</strong></div></div>
          <div className="grid-2 mt-6" style={{gap:16}}><div className="input-group"><label>Fecha</label><input className="input" type="date" value={pago.fecha} onChange={e=>setPago(v=>({...v, fecha:e.target.value}))}/></div><div className="input-group"><label>Cuenta</label><input className="input" value={pago.cuenta_bancaria} onChange={e=>setPago(v=>({...v, cuenta_bancaria:e.target.value}))}/></div><div className="input-group"><label>Referencia</label><input className="input" value={pago.referencia} onChange={e=>setPago(v=>({...v, referencia:e.target.value}))}/></div><div className="input-group"><label>Comprobante</label><input className="input" value={pago.comprobante} onChange={e=>setPago(v=>({...v, comprobante:e.target.value}))}/></div></div>
          <div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={()=>onConfirm(financiamiento, { modo, cuota:cuotaSel, resumen, ...pago })}>Confirmar pago</button></div>
        </div>
      </div>
    </>
  );
}

export function FinanciamientoDeuda() {
  const { financiamientos, setFinanciamientos, setComprasGastos, setMovimientosTesoreria, empresa, activeParams, navigate, addNotificacion } = useApp();
  const [tab, setTab] = useState('todos');
  const [detalleTab, setDetalleTab] = useState('resumen');
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [pagoOpen, setPagoOpen] = useState(null);
  const [form, setForm] = useState({ tipo:'bancario', entidad:'', tipo_entidad:'banco', contacto_nombre:'', contacto_telefono:'', contacto_email:'', monto_original:50000, moneda:'PEN', fecha_desembolso:'2026-04-01', tasa_anual:12, tipo_tasa:'TEA', plazo_meses:24, meses_gracia:0, dia_pago:5, tipo_cuota:'frances', centro_costo:'CC-OPS', proposito:'', cuenta_bancaria_destino:'BCP Cta. cte.', notas:'' });
  const detalle = activeParams?.detail ? financiamientos.find(f => f.id === activeParams.detail) : null;
  const dataSource = createFinanciamientosDataSource({
    empresa,
    getFinanciamientos: () => financiamientos,
    setFinanciamientos,
    getComprasGastos: () => [],
    setComprasGastos,
    getMovimientosTesoreria: () => [],
    setMovimientosTesoreria,
  });
  const empresaFinanciamientos = financiamientos.filter(f => f.empresa_id === empresa.id);
  const { activos, deudaTotalPorMoneda, cuotasMesPorMoneda, interesesMesPorMoneda, interesesPagadosPorMoneda } = buildDebtSummary(empresaFinanciamientos);
  const visibles = financiamientos.filter(f => f.empresa_id === empresa.id && (tab === 'todos' || tab === 'reporte' || (tab === 'vigentes' ? f.estado === 'vigente' : f.estado === 'cancelado')));

  const guardarFinanciamiento = e => {
    e.preventDefault();
    const nuevo = buildFinanciamiento({ form, empresa, sequence: financiamientos.length + 1 });
    dataSource.financiamientos.create(nuevo);
    setNuevoOpen(false);
    addNotificacion(`Financiamiento ${nuevo.codigo} creado con tabla de amortizacion.`);
  };

  const registrarPago = (financiamiento, datos) => {
    const esCuota = datos.modo === 'cuota';
    const capital = +datos.resumen.capital || 0;
    const interes = +datos.resumen.interes || 0;
    const total = +datos.resumen.total || 0;
    const nuevoSaldo = Math.max(0, (financiamiento.saldo_pendiente || 0) - capital);
    const pago = buildPagoFinanciamiento({ financiamiento, datos, nuevoSaldo });
    const tablaMarcada = (financiamiento.tabla_amortizacion || []).map(c => esCuota && c.numero === datos.cuota?.numero ? { ...c, estado:'pagada', fecha_pago_real:datos.fecha, referencia:datos.referencia, comprobante:datos.comprobante } : c);
    const tabla = esCuota ? tablaMarcada : recalcularTablaService(financiamiento, tablaMarcada, nuevoSaldo, datos.fecha);
    if (esCuota && interes > 0) dataSource.gastos.create(buildGastoIntereses({ financiamiento, cuota: datos.cuota, interes, fecha: datos.fecha, empresa }));
    dataSource.tesoreria.create(buildEgresoTesoreria({ financiamiento, pago, datos, empresa }));
    setFinanciamientos(prev => prev.map(f => f.id === financiamiento.id ? { ...f, saldo_pendiente:nuevoSaldo, estado:nuevoSaldo <= 0 ? 'cancelado' : f.estado, tabla_amortizacion:tabla, cuotas_pagadas:esCuota ? (f.cuotas_pagadas || 0) + 1 : (f.cuotas_pagadas || 0), intereses_pagados_total:(f.intereses_pagados_total || 0) + interes, pagos_realizados:[...(f.pagos_realizados || []), pago] } : f));
    setPagoOpen(null);
  };

  if (detalle) {
    const primerAbono = [...(detalle.pagos_realizados || [])].filter(isCapitalPayment).sort((a,b)=>(a.fecha_pago || '').localeCompare(b.fecha_pago || ''))[0];
    const tablaDetalle = primerAbono ? recalcularTablaService(detalle, detalle.tabla_amortizacion || [], detalle.saldo_pendiente, primerAbono.fecha_pago) : (detalle.tabla_amortizacion || []);
    const detalleVista = { ...detalle, tabla_amortizacion:tablaDetalle };
    const cuota = nextCuota(detalleVista);
    const pagosTabla = [...(detalle.pagos_realizados || []), ...tablaDetalle.filter(c => c.estado === 'pagada' && !(detalle.pagos_realizados || []).some(p => p.cuota_numero === c.numero)).map(c => ({ id:`hist_${c.numero}`, fecha_pago:c.fecha_pago_real, tipo:'cuota', cuota_numero:c.numero, capital:c.capital, interes:c.interes, total:c.total, moneda:detalle.moneda || 'PEN', cuenta_bancaria:detalle.cuenta_bancaria_destino || '-', registrado_por:'Admin' }))].sort((a,b)=>(a.fecha_pago || '').localeCompare(b.fecha_pago || ''));
    const pagoPorCuota = new Map(pagosTabla.filter(p => p.tipo === 'cuota' && p.cuota_numero).map(p => [p.cuota_numero, p]));
    const eventos = pagosTabla.filter(isCapitalPayment).map(p => ({ tipo_fila:'abono', id:`abono_${p.id}`, fecha:p.fecha_pago, capital:p.capital, interes:0, total:p.total, saldo:p.saldo_despues ?? detalle.saldo_pendiente, descripcion:p.tipo === 'capital_total' ? 'Cancelacion anticipada de capital' : 'Abono a capital' }));
    const filas = [...tablaDetalle.map(c => { const p = pagoPorCuota.get(c.numero); return p ? { tipo_fila:'cuota', ...c, capital:p.capital, interes:p.interes, total:p.total, estado:'pagada', id:`cuota_${c.numero}` } : { tipo_fila:'cuota', ...c, id:`cuota_${c.numero}` }; }), ...eventos].sort((a,b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.tipo_fila === 'cuota' ? -1 : 1));
    const capitalPagado = detalle.monto_original - detalle.saldo_pendiente;
    return (
      <>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('financiamiento')}>Volver a Financiamiento y Deuda</button>
        <div className="page-header mt-4"><div><h1 className="page-title">{detalle.entidad}</h1><div className="page-sub">{detalle.codigo} · {detalle.moneda || 'PEN'} · Desembolsado: {fmtDate(detalle.fecha_desembolso)}</div></div><div className="row"><span className={'badge '+badgeEstado(detalle.estado)}>{detalle.estado}</span><button className="btn btn-primary" data-local-form="true" onClick={()=>setPagoOpen({ financiamiento:detalleVista, cuota })}>Registrar pago / abono</button></div></div>
        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}><div className="kpi-card"><div className="kpi-label">Monto original</div><div className="kpi-value">{finMoney(detalle, detalle.monto_original)}</div></div><div className="kpi-card"><div className="kpi-label">Capital pagado</div><div className="kpi-value">{finMoney(detalle, capitalPagado)}</div></div><div className="kpi-card"><div className="kpi-label">Saldo pendiente</div><div className="kpi-value">{finMoney(detalle, detalle.saldo_pendiente)}</div></div><div className="kpi-card"><div className="kpi-label">Intereses pagados</div><div className="kpi-value">{finMoney(detalle, detalle.intereses_pagados_total)}</div></div></div>
        <div className="tabs">{[['resumen','Resumen'],['amortizacion','Tabla de amortizacion'],['pagos','Pagos realizados'],['documentos','Documentos']].map(([k,l]) => <div key={k} className={'tab '+(detalleTab===k?'active':'')} onClick={()=>setDetalleTab(k)}>{l}</div>)}</div>
        {detalleTab === 'resumen' && <div className="card"><div className="card-head"><h3>Datos del financiamiento</h3><span className="badge badge-cyan">Proxima cuota {cuota ? fmtDate(cuota.fecha) : '-'}</span></div><div className="card-body grid-2"><div><p><strong>Entidad:</strong> {detalle.entidad}</p><p><strong>Moneda:</strong> {detalle.moneda || 'PEN'}</p><p><strong>Tipo:</strong> {tipoLabel[detalle.tipo]}</p><p><strong>Tasa:</strong> {detalle.tasa_anual}% {detalle.tipo_tasa}</p><p><strong>Plazo:</strong> {detalle.plazo_meses || 'Revolvente'} meses</p></div><div><p><strong>Cuotas pagadas:</strong> {detalle.cuotas_pagadas} de {detalle.plazo_meses}</p><p><strong>Proxima cuota:</strong> {cuota ? `${fmtDate(cuota.fecha)} · ${finMoney(detalle, cuota.total)}` : '-'}</p>{cuota && <p className="text-muted">Capital: {finMoney(detalle, cuota.capital)} · Intereses: {finMoney(detalle, cuota.interes)}</p>}</div></div></div>}
        {detalleTab === 'amortizacion' && <div className="card"><div className="card-head"><h3>Tabla de amortizacion</h3><button className="btn btn-primary btn-sm" data-local-form="true" onClick={()=>setPagoOpen({financiamiento:detalleVista, cuota})}>Pagar / abonar capital</button></div><div className="table-wrap"><table className="tbl"><thead><tr><th>N</th><th>Fecha</th><th>Cuota total</th><th>Capital</th><th>Interes</th><th>Saldo</th><th>Estado</th><th></th></tr></thead><tbody>{filas.map(c => c.tipo_fila === 'abono' ? <tr key={c.id} style={{background:'rgba(0,188,212,0.06)'}}><td className="mono">ABO</td><td>{fmtDate(c.fecha)}</td><td className="num">{finMoney(detalle,c.total)}</td><td className="num"><strong>{finMoney(detalle,c.capital)}</strong></td><td className="num">{finMoney(detalle,c.interes)}</td><td className="num"><strong>{finMoney(detalle,c.saldo)}</strong></td><td><span className="badge badge-cyan">{c.descripcion}</span></td><td></td></tr> : <tr key={c.id}><td>{c.numero}</td><td>{fmtDate(c.fecha)}</td><td className="num">{finMoney(detalle,c.total)}</td><td className="num">{finMoney(detalle,c.capital)}</td><td className="num">{finMoney(detalle,c.interes)}</td><td className="num">{finMoney(detalle,c.saldo)}</td><td><span className={'badge '+badgeCuota(c.estado)}>{c.estado}</span></td><td>{c.estado !== 'pagada' && c.estado !== 'cancelada' && <button className="btn btn-sm btn-primary" data-local-form="true" onClick={()=>setPagoOpen({financiamiento:detalleVista, cuota:c})}>Pagar</button>}</td></tr>)}</tbody></table></div><div className="card-body row" style={{justifyContent:'flex-end', gap:24}}><strong>Total cuotas futuras: {finMoney(detalle, tablaDetalle.filter(c => c.estado !== 'pagada' && c.estado !== 'cancelada').reduce((s,c)=>s+c.total,0))}</strong><strong>Intereses futuros: {finMoney(detalle, tablaDetalle.filter(c => c.estado !== 'pagada' && c.estado !== 'cancelada').reduce((s,c)=>s+c.interes,0))}</strong></div></div>}
        {detalleTab === 'pagos' && <div className="card"><div className="card-head"><h3>Pagos realizados</h3><button className="btn btn-primary btn-sm" data-local-form="true" onClick={()=>setPagoOpen({financiamiento:detalleVista, cuota})}>Registrar pago / abono</button></div><div className="table-wrap"><table className="tbl"><thead><tr><th>Fecha pago</th><th>Tipo</th><th>N cuota</th><th>Capital</th><th>Interes</th><th>Total</th><th>Banco / Cuenta</th><th>Registrado por</th></tr></thead><tbody>{pagosTabla.map(p => <tr key={p.id}><td>{fmtDate(p.fecha_pago)}</td><td>{p.tipo === 'cuota' ? 'Cuota' : p.tipo === 'capital_total' ? 'Cancelacion capital' : 'Abono capital'}</td><td>{p.cuota_numero || '-'}</td><td className="num">{finMoney(detalle,p.capital)}</td><td className="num">{finMoney(detalle,p.interes)}</td><td className="num">{finMoney(detalle,p.total)}</td><td>{p.cuenta_bancaria || '-'}</td><td>{p.registrado_por}</td></tr>)}</tbody></table></div></div>}
        {detalleTab === 'documentos' && <div className="card"><div className="card-head"><h3>Documentos</h3><button className="btn btn-secondary btn-sm">{I.plus} Adjuntar</button></div><div className="card-body text-muted">Sin documentos adjuntos para este financiamiento.</div></div>}
        {pagoOpen && <PagoModal data={pagoOpen} onClose={()=>setPagoOpen(null)} onConfirm={registrarPago}/>}
      </>
    );
  }

  const porTipo = ['bancario','leasing','tercero'].map(tipo => {
    const rows = activos.filter(f => f.tipo === tipo);
    const totals = sumByCurrency(rows, f => f.saldo_pendiente);
    const pct = Object.fromEntries(Object.entries(totals).map(([m,total]) => [m, deudaTotalPorMoneda[m] ? Math.round(total / deudaTotalPorMoneda[m] * 100) : 0]));
    return { tipo, totals, pct };
  });
  const meses = Array.from({length:12}, (_,i) => {
    const d = new Date('2026-05-01T00:00:00'); d.setMonth(d.getMonth()+i);
    const ym = d.toISOString().slice(0,7);
    const totals = activos.reduce((acc, f) => {
      const total = (f.tabla_amortizacion || []).filter(c => (c.estado === 'pendiente' || c.estado === 'futura') && c.fecha.slice(0,7) === ym).reduce((s,c)=>s+c.total,0);
      if (total) acc[f.moneda || 'PEN'] = (acc[f.moneda || 'PEN'] || 0) + total;
      return acc;
    }, {});
    return { label:d.toLocaleDateString('es-PE',{month:'short', year:'numeric'}), totals, visual:Object.values(totals).reduce((s,v)=>s+v,0) };
  });
  const maxMes = Math.max(...meses.map(m => m.visual), 1);

  return (
    <>
      <div className="page-header"><div><h1 className="page-title">Financiamiento y Deuda</h1><div className="page-sub">Prestamos recibidos por la empresa, lineas de credito y obligaciones financieras</div></div><button className="btn btn-primary" data-local-form="true" onClick={()=>setNuevoOpen(true)}>{I.plus} Nuevo financiamiento</button></div>
      <div style={{ background:'rgba(26,43,74,0.08)', borderLeft:'3px solid var(--orange)', borderRadius:'6px', padding:'10px 16px', marginBottom:'20px', fontSize:'13px', color:'var(--slate)' }}>Los prestamos registrados aqui son <strong>obligaciones de la empresa</strong>. Los importes se muestran por moneda; no se mezclan PEN y USD sin tipo de cambio.</div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}><div className="kpi-card"><div className="kpi-label">Deuda total vigente</div><div className="kpi-value" style={{fontSize:20}}>{moneyByCurrency(deudaTotalPorMoneda)}</div></div><div className="kpi-card"><div className="kpi-label">Cuotas este mes</div><div className="kpi-value" style={{fontSize:20}}>{moneyByCurrency(cuotasMesPorMoneda)}</div></div><div className="kpi-card"><div className="kpi-label">Intereses este mes</div><div className="kpi-value" style={{fontSize:20}}>{moneyByCurrency(interesesMesPorMoneda)}</div></div><div className="kpi-card"><div className="kpi-label">Capital pendiente</div><div className="kpi-value" style={{fontSize:20}}>{moneyByCurrency(deudaTotalPorMoneda)}</div></div><div className="kpi-card"><div className="kpi-label">Prestamos activos</div><div className="kpi-value" style={{fontSize:22}}>{activos.length}</div></div></div>
      <div className="tabs"><div className={'tab '+(tab==='todos'?'active':'')} onClick={()=>setTab('todos')}>Todos los prestamos</div><div className={'tab '+(tab==='vigentes'?'active':'')} onClick={()=>setTab('vigentes')}>Vigentes</div><div className={'tab '+(tab==='cancelados'?'active':'')} onClick={()=>setTab('cancelados')}>Cancelados</div><div className={'tab '+(tab==='reporte'?'active':'')} onClick={()=>setTab('reporte')}>Reporte de deuda</div></div>
      {tab === 'reporte' ? <div className="card"><div className="card-head"><h3>Reporte de deuda financiera</h3><button className="btn btn-secondary btn-sm">{I.download} Exportar reporte Excel</button></div><div className="card-body"><div className="grid-2" style={{gap:20}}><div style={{padding:16, border:'1px solid var(--border)', borderRadius:8}}><h3 style={{marginTop:0}}>Resumen ejecutivo por moneda</h3><p>Deuda total vigente: <strong>{moneyByCurrency(deudaTotalPorMoneda)}</strong></p><p>Cuotas del mes: <strong>{moneyByCurrency(cuotasMesPorMoneda)}</strong></p><p>Intereses del mes: <strong>{moneyByCurrency(interesesMesPorMoneda)}</strong></p><p>Intereses acumulados 2026: <strong>{moneyByCurrency(interesesPagadosPorMoneda)}</strong></p></div><div style={{padding:16, border:'1px solid var(--border)', borderRadius:8}}><h3 style={{marginTop:0}}>Deuda por tipo de acreedor</h3>{porTipo.map(x => <div key={x.tipo} style={{marginBottom:10}}><div className="row" style={{justifyContent:'space-between'}}><span>{tipoLabel[x.tipo]}</span><strong>{moneyByCurrency(x.totals)}</strong></div>{Object.entries(x.totals).map(([m]) => <div key={m} className="text-muted" style={{fontSize:12}}>{m}: {x.pct[m]}% de la deuda en {m}</div>)}</div>)}</div></div><div className="mt-6"><h3>Calendario de pagos - proximos 12 meses</h3>{meses.map(m => <div key={m.label} className="row" style={{gap:12, margin:'8px 0'}}><span style={{width:90}}>{m.label}</span><strong style={{width:190}}>{moneyByCurrency(m.totals)}</strong><div className="bar" style={{flex:1}}><div style={{width:(m.visual/maxMes*100)+'%', background:'var(--orange)'}}/></div></div>)}<div className="mt-4"><strong>Total comprometido 12 meses: {moneyByCurrency(meses.reduce((acc,m)=>{Object.entries(m.totals).forEach(([moneda,total])=>{acc[moneda]=(acc[moneda]||0)+total;});return acc;},{}))}</strong></div></div><div className="grid-2 mt-6">{activos.map(f => <div key={f.id} style={{border:'1px solid var(--border)', borderRadius:8, padding:14}}><div className="row" style={{justifyContent:'space-between'}}><strong>{f.entidad}</strong><span>{finMoney(f, f.saldo_pendiente)}</span></div><div className="text-muted" style={{fontSize:12}}>Moneda: {f.moneda || 'PEN'} · Interes mes: {finMoney(f, nextCuota(f)?.interes || 0)}</div><div className="bar mt-4"><div style={{width:Math.min(100,(f.cuotas_pagadas || 0)/(f.plazo_meses || 1)*100)+'%', background:'var(--green)'}}/></div></div>)}</div></div></div> : <div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>ID</th><th>Entidad prestamista</th><th>Moneda</th><th>Tipo</th><th>Monto original</th><th>Tasa</th><th>Plazo</th><th>Saldo pendiente</th><th>Prox. cuota</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibles.map(f => { const c=nextCuota(f); return <tr key={f.id}><td className="mono">{f.codigo}</td><td><strong>{f.entidad}</strong></td><td>{f.moneda || 'PEN'}</td><td>{tipoLabel[f.tipo]}</td><td className="num">{finMoney(f, f.monto_original)}</td><td>{f.tasa_anual}% anual</td><td>{f.plazo_meses ? `${f.plazo_meses} meses` : 'Revolvente'}</td><td className="num"><strong>{finMoney(f, f.saldo_pendiente)}</strong></td><td>{c ? `${finMoney(f, c.total)} · ${fmtDate(c.fecha)}` : '-'}</td><td><span className={'badge '+badgeEstado(f.estado)}>{f.estado}</span></td><td><button className="btn btn-sm btn-ghost" onClick={()=>{setDetalleTab('resumen'); navigate('financiamiento',{detail:f.id});}}>{I.eye} Ver</button></td></tr>;})}</tbody></table></div></div>}
      {nuevoOpen && <NuevoFinanciamientoPanel form={form} setForm={setForm} onClose={()=>setNuevoOpen(false)} onSubmit={guardarFinanciamiento}/>}
    </>
  );
}

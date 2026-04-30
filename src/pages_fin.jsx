import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { buildEstadoResultados } from './services/estadoResultadosService.js';
import { buildTesoreriaSummary } from './services/tesoreriaService.js';

// Finanzas: CxC, Tesorería/Match, Estado de Resultados, Facturación

function CxCLegacy() {
  const { cxc } = useApp();
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Cuentas por Cobrar</h1><div className="page-sub">Total por cobrar {money(172900)} · {money(51300)} vencido</div></div>
        <div className="row"><button className="btn btn-secondary">{I.filter} Filtros</button><button className="btn btn-secondary">{I.download} Exportar</button></div>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        {[
          {l:'0-30 días', v:money(121600), c:'green'},
          {l:'31-60 días', v:money(18500), c:'orange'},
          {l:'61-90 días', v:money(0), c:'orange'},
          {l:'+90 días', v:money(32800), c:'danger'}
        ].map((x,i)=>(
          <div key={i} className="kpi-card"><div className="kpi-label">{x.l}</div><div className="kpi-value" style={{fontSize:22}}>{x.v}</div><div className={'kpi-icon '+x.c}>{I.clock}</div></div>
        ))}
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Factura</th><th>Emisión</th><th>Vence</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Mora</th><th>Estado</th></tr></thead>
            <tbody>{(cxc || []).map((c,i)=>(
              <tr key={c.id || i}>
                <td><strong>{c.cliente || (c.cuentas && c.cuentas.razon_social)}</strong></td>
                <td className="mono">{c.factura || (c.facturas && c.facturas.numero)}</td>
                <td className="text-muted">{c.fecha_emision || c.emision}</td>
                <td className="text-muted">{c.fecha_vencimiento || c.vence}</td>
                <td className="num">{money(c.monto_total || c.total)}</td>
                <td className="num text-muted">{money(c.monto_pagado || c.pagado)}</td>
                <td className="num"><strong>{money(c.saldo)}</strong></td>
                <td className="num">{c.mora>0?<span style={{color:c.mora>30?'var(--danger)':'var(--orange)',fontWeight:600}}>{c.mora}d</span>:<span className="text-subtle">—</span>}</td>
                <td><span className={'badge '+(c.estado==='pagada'?'badge-green':c.estado==='vencida'?'badge-red':c.estado==='por_vencer'?'badge-orange':'badge-cyan')}>{c.estado.replace('_',' ')}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CxC() {
  const { cxc, cuentas, registrarCobroCxC } = useApp();
  const today = new Date().toISOString().split('T')[0];
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ monto: '', fecha: today, cuenta_bancaria: 'Cuenta principal', referencia: '' });
  const saldoDe = c => Number(c?.saldo ?? c?.monto_total ?? c?.total ?? 0);
  const totalDe = c => Number(c?.monto_total ?? c?.total ?? 0);
  const pagadoDe = c => Number(c?.monto_pagado ?? c?.pagado ?? 0);
  const clienteDe = c => c?.cliente || c?.cuentas?.razon_social || (cuentas || []).find(x => x.id === c?.cuenta_id)?.razon_social || (cuentas || []).find(x => x.id === c?.cuenta_id)?.nombre_comercial || '-';
  const facturaDe = c => c?.factura || c?.facturas?.numero || c?.factura_id || '-';
  const moraDe = c => {
    if (c?.mora) return c.mora;
    const vence = c?.fecha_vencimiento || c?.vence;
    if (!vence || saldoDe(c) <= 0) return 0;
    return Math.max(0, Math.floor((new Date(`${today}T00:00:00`) - new Date(`${vence}T00:00:00`)) / 86400000));
  };
  const totalPorCobrar = (cxc || []).reduce((s, c) => s + saldoDe(c), 0);
  const totalVencido = (cxc || []).filter(c => moraDe(c) > 0).reduce((s, c) => s + saldoDe(c), 0);
  const bucket = (min, max) => (cxc || []).filter(c => {
    const d = moraDe(c);
    return saldoDe(c) > 0 && d >= min && (max == null || d <= max);
  }).reduce((s, c) => s + saldoDe(c), 0);
  const abrirCobro = c => {
    setSel(c);
    setForm({ monto: String(saldoDe(c)), fecha: today, cuenta_bancaria: 'Cuenta principal', referencia: '' });
    setPanel(true);
  };
  const guardarCobro = async event => {
    event.preventDefault();
    const monto = Number(form.monto || 0);
    if (!sel || monto <= 0) return;
    await registrarCobroCxC(sel.id, monto, form);
    setPanel(false);
    setSel(null);
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Cuentas por Cobrar</h1><div className="page-sub">Total por cobrar {money(totalPorCobrar)} · {money(totalVencido)} vencido</div></div>
        <div className="row"><button className="btn btn-secondary">{I.filter} Filtros</button><button className="btn btn-secondary">{I.download} Exportar</button></div>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        {[
          {l:'0-30 dias', v:money(bucket(0, 30)), c:'green'},
          {l:'31-60 dias', v:money(bucket(31, 60)), c:'orange'},
          {l:'61-90 dias', v:money(bucket(61, 90)), c:'orange'},
          {l:'+90 dias', v:money(bucket(91, null)), c:'danger'}
        ].map((x,i)=>(
          <div key={i} className="kpi-card"><div className="kpi-label">{x.l}</div><div className="kpi-value" style={{fontSize:22}}>{x.v}</div><div className={'kpi-icon '+x.c}>{I.clock}</div></div>
        ))}
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Factura</th><th>Emision</th><th>Vence</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Mora</th><th>Estado</th><th></th></tr></thead>
            <tbody>{(cxc || []).length ? (cxc || []).map((c,i)=>(
              <tr key={c.id || i}>
                <td><strong>{clienteDe(c)}</strong></td>
                <td className="mono">{facturaDe(c)}</td>
                <td className="text-muted">{c.fecha_emision || c.emision}</td>
                <td className="text-muted">{c.fecha_vencimiento || c.vence}</td>
                <td className="num">{money(totalDe(c))}</td>
                <td className="num text-muted">{money(pagadoDe(c))}</td>
                <td className="num"><strong>{money(saldoDe(c))}</strong></td>
                <td className="num">{moraDe(c)>0?<span style={{color:moraDe(c)>30?'var(--danger)':'var(--orange)',fontWeight:600}}>{moraDe(c)}d</span>:<span className="text-subtle">-</span>}</td>
                <td><span className={'badge '+(c.estado==='cobrada'||c.estado==='pagada'?'badge-green':c.estado==='vencida'?'badge-red':c.estado==='por_vencer'?'badge-orange':'badge-cyan')}>{String(c.estado || 'por_cobrar').replace('_',' ')}</span></td>
                <td>{saldoDe(c) > 0 && <button className="btn btn-sm btn-primary" data-local-form="true" onClick={() => abrirCobro(c)}>Cobrar</button>}</td>
              </tr>
            )) : (
              <tr><td colSpan="10" className="text-center text-muted" style={{padding:36}}>No hay cuentas por cobrar registradas.</td></tr>
            )}</tbody>
          </table>
        </div>
      </div>
      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
          <div className="side-panel" style={{width:'min(520px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Registrar cobro</div>
                <div className="font-display" style={{fontSize:22,fontWeight:700}}>{facturaDe(sel)}</div>
              </div>
              <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarCobro}>
              <div className="card" style={{padding:14}}>
                <p><strong>Cliente:</strong> {clienteDe(sel)}</p>
                <p><strong>Saldo pendiente:</strong> {money(saldoDe(sel))}</p>
              </div>
              <div className="grid-2 mt-6" style={{gap:12}}>
                <div className="input-group">
                  <label>Monto cobrado</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.monto} onChange={e => setForm(v => ({...v, monto: e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label>Fecha</label>
                  <input className="input" type="date" value={form.fecha} onChange={e => setForm(v => ({...v, fecha: e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label>Cuenta bancaria</label>
                  <input className="input" value={form.cuenta_bancaria} onChange={e => setForm(v => ({...v, cuenta_bancaria: e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label>Referencia</label>
                  <input className="input" value={form.referencia} onChange={e => setForm(v => ({...v, referencia: e.target.value}))} placeholder="Operacion bancaria"/>
                </div>
              </div>
              <div className="row mt-6" style={{justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Registrar cobro</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function TesoreriaLegacy() {
  const [tab, setTab] = useState('match');
  const { movimientosTesoreria, movimientosBanco, conciliarMovimientoBanco, empresa } = useApp();
  const tesoreria = buildTesoreriaSummary({
    movimientos: movimientosTesoreria,
    empresa,
    periodo: '2026-04',
    saldosIniciales: { PEN: 490900 },
  });
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Tesorería y Match Bancario</h1><div className="page-sub">3 de 5 movimientos conciliados este mes</div></div>
        <button className="btn btn-secondary">{I.download} Importar extracto</button>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Saldo total por moneda</div><div className="kpi-value" style={{fontSize:20}}>{tesoreria.saldoDisplay}</div><div className="kpi-icon cyan">{I.bank}</div></div>
        <div className="kpi-card"><div className="kpi-label">Movimientos vinculados</div><div className="kpi-value">{tesoreria.movimientosEmpresa.length}</div><div className="kpi-icon cyan">{I.receipt}</div></div>
        <div className="kpi-card"><div className="kpi-label">Cobros del mes</div><div className="kpi-value" style={{fontSize:20}}>{tesoreria.ingresosDisplay}</div><div className="kpi-icon green">{I.arrowDown}</div></div>
        <div className="kpi-card"><div className="kpi-label">Pagos del mes</div><div className="kpi-value" style={{fontSize:20}}>{tesoreria.egresosDisplay}</div><div className="kpi-icon orange">{I.arrowUp}</div></div>
      </div>
      <div className="tabs mt-6">
        {['resumen','ingresos','egresos','match','flujo'].map(t=>(
          <div key={t} className={'tab '+(tab===t?'active':'')} onClick={()=>setTab(t)}>{t==='match'?'Match Bancario':t==='flujo'?'Flujo de Caja':t.charAt(0).toUpperCase()+t.slice(1)}</div>
        ))}
      </div>
      {tab === 'match' && (
        <div className="card">
          <div className="card-head"><h3>Movimientos bancarios — BBVA Corriente</h3><span className="badge badge-cyan">3 de 5 conciliados</span></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th>Vinculado a</th><th>Estado</th><th></th></tr></thead>
              <tbody>{(movimientosBanco || []).map((m,i)=>(
                <tr key={m.id || i}>
                  <td className="text-muted">{m.fecha}</td>
                  <td><strong>{m.descripcion || m.desc}</strong></td>
                  <td><span className={'badge '+(m.tipo==='credito'?'badge-green':'badge-orange')}>{m.tipo==='credito'?'↓ Crédito':'↑ Débito'}</span></td>
                  <td className="num"><strong style={{color:m.tipo==='credito'?'var(--green)':'var(--fg)'}}>{m.tipo==='credito'?'+':'-'}{money(m.monto)}</strong></td>
                  <td>{m.vinculado_id || m.vinculado ? <span className="mono">{m.vinculado_id || m.vinculado}</span> : <span className="text-subtle">—</span>}</td>
                  <td>{m.conciliado ? <span className="badge badge-green">{I.check}Conciliado</span> : <span className="badge badge-orange">Sin conciliar</span>}</td>
                  <td>{!m.conciliado && <button className="btn btn-sm btn-primary" onClick={() => conciliarMovimientoBanco(m.id, 'otros', 'id')}>Conciliar</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'flujo' && (
        <div className="card">
          <div className="card-head"><h3>Flujo de caja · últimas 6 semanas</h3></div>
          <div className="card-body">
            <svg viewBox="0 0 600 220" width="100%" height="220">
              {[0,50,100,150,200].map((y,i)=>(<line key={i} x1="40" y1={200-y} x2="590" y2={200-y} stroke="var(--border-subtle)"/>))}
              {[{c:80,p:55,s:260},{c:92,p:60,s:292},{c:70,p:70,s:292},{c:110,p:65,s:337},{c:95,p:85,s:347},{c:120,p:72,s:395}].map((d,i)=>{
                const x = 70+i*90;
                return (<g key={i}>
                  <rect x={x} y={200-d.c} width="24" height={d.c} fill="var(--green)" rx="2"/>
                  <rect x={x+28} y={200-d.p} width="24" height={d.p} fill="var(--orange)" rx="2"/>
                  <text x={x+26} y="215" textAnchor="middle" fontSize="11" fill="var(--fg-muted)">S{i+1}</text>
                </g>);
              })}
              <polyline points="95,140 185,108 275,108 365,63 455,53 545,5" stroke="var(--cyan)" strokeWidth="2.5" fill="none"/>
              {[{x:95,y:140},{x:185,y:108},{x:275,y:108},{x:365,y:63},{x:455,y:53},{x:545,y:5}].map((p,i)=>(<circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--cyan)"/>))}
              <g transform="translate(420,10)">
                <rect x="0" y="0" width="10" height="10" fill="var(--green)" rx="2"/><text x="16" y="9" fontSize="11" fill="var(--fg)">Cobros</text>
                <rect x="60" y="0" width="10" height="10" fill="var(--orange)" rx="2"/><text x="76" y="9" fontSize="11" fill="var(--fg)">Pagos</text>
                <line x1="115" y1="5" x2="130" y2="5" stroke="var(--cyan)" strokeWidth="2.5"/><text x="134" y="9" fontSize="11" fill="var(--fg)">Saldo acum.</text>
              </g>
            </svg>
          </div>
        </div>
      )}
    </>
  );
}

function Tesoreria() {
  const [tab, setTab] = useState('match');
  const [panel, setPanel] = useState(false);
  const [movSel, setMovSel] = useState(null);
  const [target, setTarget] = useState('');
  const {
    movimientosTesoreria, movimientosBanco, cxc, cxp, cuentas,
    conciliarMovimientoBancoConDocumento, empresa
  } = useApp();
  const tesoreria = buildTesoreriaSummary({
    movimientos: movimientosTesoreria,
    empresa,
    periodo: '2026-04',
    saldosIniciales: { PEN: 490900 },
  });
  const clienteNombre = id => {
    const c = (cuentas || []).find(x => x.id === id);
    return c?.razon_social || c?.nombre_comercial || id || '-';
  };
  const saldoCxc = c => Number(c.saldo ?? c.monto_total ?? c.total ?? 0);
  const saldoCxp = p => Number(p.saldo ?? p.monto_total ?? 0);
  const candidatos = useMemo(() => {
    if (!movSel) return [];
    const monto = Number(movSel.monto || 0);
    const moneda = movSel.moneda || 'PEN';
    if (movSel.tipo === 'credito') {
      return (cxc || []).filter(c => saldoCxc(c) > 0 && (c.moneda || 'PEN') === moneda).map(c => ({
        tipo: 'cxc',
        id: c.id,
        label: `${c.facturas?.numero || c.factura || c.factura_id || c.id} - ${clienteNombre(c.cuenta_id)}`,
        monto: saldoCxc(c),
        diff: Math.abs(saldoCxc(c) - monto)
      })).sort((a,b) => a.diff - b.diff);
    }
    return (cxp || []).filter(p => saldoCxp(p) > 0 && (p.moneda || 'PEN') === moneda).map(p => ({
      tipo: 'cxp',
      id: p.id,
      label: `${p.factura_numero || p.id} - ${p.proveedores?.razon_social || p.proveedor_id || 'Proveedor'}`,
      monto: saldoCxp(p),
      diff: Math.abs(saldoCxp(p) - monto)
    })).sort((a,b) => a.diff - b.diff);
  }, [movSel, cxc, cxp, cuentas]);
  const abrirMatch = mov => {
    setMovSel(mov);
    setPanel(true);
    setTarget('');
  };
  const confirmar = async event => {
    event.preventDefault();
    const cand = candidatos.find(c => `${c.tipo}:${c.id}` === target);
    if (!movSel || !cand) return;
    await conciliarMovimientoBancoConDocumento(movSel.id, cand.tipo, cand.id);
    setPanel(false);
    setMovSel(null);
  };
  const vinculados = (movimientosBanco || []).filter(m => m.conciliado).length;

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Tesoreria y Match Bancario</h1><div className="page-sub">{vinculados} de {(movimientosBanco || []).length} movimientos conciliados</div></div>
        <button className="btn btn-secondary">{I.download} Importar extracto</button>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Saldo total por moneda</div><div className="kpi-value" style={{fontSize:20}}>{tesoreria.saldoDisplay}</div><div className="kpi-icon cyan">{I.bank}</div></div>
        <div className="kpi-card"><div className="kpi-label">Movimientos vinculados</div><div className="kpi-value">{tesoreria.movimientosEmpresa.length}</div><div className="kpi-icon cyan">{I.receipt}</div></div>
        <div className="kpi-card"><div className="kpi-label">Cobros del mes</div><div className="kpi-value" style={{fontSize:20}}>{tesoreria.ingresosDisplay}</div><div className="kpi-icon green">{I.arrowDown}</div></div>
        <div className="kpi-card"><div className="kpi-label">Pagos del mes</div><div className="kpi-value" style={{fontSize:20}}>{tesoreria.egresosDisplay}</div><div className="kpi-icon orange">{I.arrowUp}</div></div>
      </div>
      <div className="tabs mt-6">
        {['match','resumen'].map(t => <div key={t} className={'tab '+(tab===t?'active':'')} onClick={()=>setTab(t)}>{t === 'match' ? 'Match Bancario' : 'Resumen'}</div>)}
      </div>
      {tab === 'match' ? (
        <div className="card">
          <div className="card-head"><h3>Movimientos bancarios</h3><span className="badge badge-cyan">{vinculados} conciliados</span></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Descripcion</th><th>Tipo</th><th>Monto</th><th>Vinculado a</th><th>Estado</th><th></th></tr></thead>
              <tbody>{(movimientosBanco || []).map((m,i)=>(
                <tr key={m.id || i}>
                  <td className="text-muted">{m.fecha}</td>
                  <td><strong>{m.descripcion || m.desc}</strong></td>
                  <td><span className={'badge '+(m.tipo==='credito'?'badge-green':'badge-orange')}>{m.tipo === 'credito' ? 'Credito' : 'Debito'}</span></td>
                  <td className="num"><strong style={{color:m.tipo==='credito'?'var(--green)':'var(--fg)'}}>{m.tipo==='credito'?'+':'-'}{money(m.monto)}</strong></td>
                  <td>{m.vinculado_id ? <span className="mono">{m.vinculado_tipo}:{m.vinculado_id}</span> : <span className="text-subtle">-</span>}</td>
                  <td>{m.conciliado ? <span className="badge badge-green">{I.check}Conciliado</span> : <span className="badge badge-orange">Sin conciliar</span>}</td>
                  <td>{!m.conciliado && <button className="btn btn-sm btn-primary" data-local-form="true" onClick={() => abrirMatch(m)}>Conciliar</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-head"><h3>Movimientos de tesoreria registrados</h3></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Descripcion</th><th>Tipo</th><th>Monto</th><th>Vinculo</th></tr></thead>
              <tbody>{tesoreria.movimientosEmpresa.map(m => (
                <tr key={m.id}>
                  <td>{m.fecha}</td><td>{m.descripcion}</td><td>{m.tipo}</td><td className="num">{money(m.monto)}</td><td className="mono">{m.vinculo_tipo || '-'}:{m.vinculo_id || '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
          <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Match bancario</div>
                <div className="font-display" style={{fontSize:22,fontWeight:700}}>{money(movSel?.monto || 0)}</div>
              </div>
              <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={confirmar}>
              <div className="card" style={{padding:14}}>
                <p><strong>Banco:</strong> {movSel?.descripcion || movSel?.desc}</p>
                <p><strong>Fecha:</strong> {movSel?.fecha}</p>
                <p><strong>Tipo:</strong> {movSel?.tipo}</p>
              </div>
              <div className="input-group mt-6">
                <label>{movSel?.tipo === 'credito' ? 'Cuenta por cobrar candidata' : 'Cuenta por pagar candidata'}</label>
                <select className="select" value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="">Seleccionar documento...</option>
                  {candidatos.map(c => <option key={`${c.tipo}:${c.id}`} value={`${c.tipo}:${c.id}`}>{c.label} - saldo {money(c.monto)} - dif. {money(c.diff)}</option>)}
                </select>
              </div>
              <div className="row mt-6" style={{justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={!target}>Confirmar match</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function Resultados({ role }) {
  const [expanded, setExpanded] = useState({ingresos:true, costo:false, gastos:false});
  const { comprasGastos, ots, empresa } = useApp();
  const canFin = role.permisos.ver_finanzas || role.permisos.todo;
  if (!canFin) return (
    <div className="card" style={{padding:40, textAlign:'center'}}>
      {I.lock}
      <h2 className="font-display" style={{marginTop:12}}>Sin acceso</h2>
      <div className="text-muted">Tu rol no tiene permiso <code>ver_finanzas</code>. Consulta con el administrador.</div>
    </div>
  );
  const periodoSeleccionado = '2026-04';
  const estaEnPeriodo = (fecha, periodo) => (fecha || '').slice(0, 7) === periodo;
  const monedaSimbolo = moneda => moneda === 'USD' ? 'US$' : 'S/';
  const moneyByCurrency = totals => {
    const keys = ['PEN', 'USD'].filter(m => totals[m]).concat(Object.keys(totals).filter(m => !['PEN', 'USD'].includes(m) && totals[m]));
    return keys.length ? keys.map(m => moneyD(totals[m], monedaSimbolo(m))).join(' · ') : moneyD(0);
  };
  const interesesPorMoneda = comprasGastos.filter(g =>
    g.empresa_id === empresa.id &&
    g.categoria === 'Gastos financieros' &&
    estaEnPeriodo(g.fecha, periodoSeleccionado)
  ).reduce((acc, g) => {
    const moneda = g.moneda || 'PEN';
    acc[moneda] = (acc[moneda] || 0) + Number(g.monto || 0);
    return acc;
  }, {});
  const gastosFinancierosIntereses = interesesPorMoneda.PEN || 0;
  const comisionesBancarias = MOCK.estadoResultados.gastosFin.items.find(i => i.label.toLowerCase().includes('comisiones'))?.valor || 0;
  const erLegacy = {
    ...MOCK.estadoResultados,
    gastosFin: {
      total: gastosFinancierosIntereses + comisionesBancarias,
      items: [
        { label: 'Intereses de prestamos', valor: gastosFinancierosIntereses, valorDisplay: moneyByCurrency(interesesPorMoneda) },
        { label: 'Comisiones bancarias', valor: comisionesBancarias }
      ],
      display: moneyByCurrency({ PEN: gastosFinancierosIntereses + comisionesBancarias, ...Object.fromEntries(Object.entries(interesesPorMoneda).filter(([m]) => m !== 'PEN')) })
    }
  };
  const { er, utilidadBruta, resultadoOp, resultadoNeto } = buildEstadoResultados({
    base: MOCK.estadoResultados,
    comprasGastos,
    ots,
    empresa,
    periodo: periodoSeleccionado,
  });
  const toggle = k => setExpanded(e => ({...e, [k]: !e[k]}));
  const Row = ({label, value, valueDisplay, bold, neg, margen, expandKey, items}) => (
    <>
      <div onClick={() => expandKey && toggle(expandKey)} style={{display:'flex', alignItems:'center', padding:'14px 20px', borderBottom:'1px solid var(--border-subtle)', cursor:expandKey?'pointer':'default', background:bold?'var(--bg-subtle)':'transparent'}}>
        {expandKey && <span style={{marginRight:8, display:'inline-flex', transform: expanded[expandKey]?'rotate(0)':'rotate(-90deg)', transition:'transform 0.2s', color:'var(--fg-muted)'}}>{I.chev}</span>}
        <div style={{flex:1, fontWeight:bold?700:500, fontFamily: bold?'Sora':'inherit', fontSize: bold?15:13}}>{label}</div>
        {margen && <div style={{marginRight:20, color:'var(--fg-muted)', fontSize:12}}>[{margen}% margen]</div>}
        <div className="num" style={{fontFamily:'Sora', fontWeight:bold?700:500, fontSize:bold?16:14, color: neg?'var(--fg-muted)':'var(--fg)', minWidth:140, textAlign:'right'}}>
          {neg && '('}{valueDisplay || money(value)}{neg && ')'}
        </div>
      </div>
      {expandKey && expanded[expandKey] && items && items.map((it,i)=>(
        <div key={i} style={{display:'flex', padding:'8px 20px 8px 52px', borderBottom:'1px solid var(--border-subtle)', fontSize:12, color:'var(--fg-muted)'}}>
          <div style={{flex:1}}>{it.label}</div>
          <div className="num" style={{minWidth:140, textAlign:'right'}}>{it.valorDisplay || money(it.valor)}</div>
        </div>
      ))}
    </>
  );
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Estado de Resultados</h1><div className="page-sub">Abril 2026 · Servicios Industriales Norte SAC</div></div>
        <div className="row">
          <select className="select" style={{width:160}}><option>Abril 2026</option><option>Marzo 2026</option></select>
          <button className="btn btn-secondary">{I.download} PDF</button>
        </div>
      </div>
      <div className="card">
        <Row label="INGRESOS" value={er.ingresos.total} bold expandKey="ingresos" items={er.ingresos.items}/>
        <Row label="COSTO DE VENTAS" value={er.costoVentas.total} bold neg expandKey="costo" items={er.costoVentas.items}/>
        <Row label="UTILIDAD BRUTA" value={utilidadBruta} bold margen={Math.round(utilidadBruta/er.ingresos.total*100)}/>
        <Row label="GASTOS OPERATIVOS" value={er.gastosOp.total} bold neg expandKey="gastos" items={er.gastosOp.items}/>
        <Row label="RESULTADO OPERATIVO" value={resultadoOp} bold margen={Math.round(resultadoOp/er.ingresos.total*100)}/>
        <Row label="GASTOS FINANCIEROS" value={er.gastosFin.total} valueDisplay={er.gastosFin.display} bold neg expandKey="gastosFin" items={er.gastosFin.items}/>
        <div style={{display:'flex', alignItems:'center', padding:'18px 20px', background:'var(--navy)', color:'#fff'}}>
          <div style={{flex:1, fontFamily:'Sora', fontWeight:700, fontSize:16, letterSpacing:'0.02em'}}>RESULTADO NETO (PEN)</div>
          <div style={{marginRight:20, color:'rgba(255,255,255,0.7)', fontSize:12}}>[{Math.round(resultadoNeto/er.ingresos.total*100)}% margen]</div>
          <div className="num" style={{fontFamily:'Sora', fontWeight:700, fontSize:22, minWidth:140, textAlign:'right', color:'var(--cyan)'}}>{money(resultadoNeto)}</div>
        </div>
      </div>
      <div className="text-muted mt-4" style={{fontSize:12, textAlign:'center'}}>Haz clic en las filas principales para expandir el detalle por concepto</div>
    </>
  );
}

function FacturacionLegacy() {
  const { facturas } = useApp();
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Facturación</h1><div className="page-sub">6 facturas · 2 vencidas</div></div>
        <button className="btn btn-primary">{I.plus} Nueva factura desde valorización</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Factura</th><th>Cliente</th><th>Valorización</th><th>Monto</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
            <tbody>{(facturas || []).map((r,i)=>(
              <tr key={r.id || i}>
                <td className="mono" style={{fontWeight:600}}>{r.numero || r.id}</td>
                <td>{r.cliente || (r.cuentas && r.cuentas.razon_social)}</td>
                <td className="mono text-muted">{r.valorizacion || (r.valorizaciones && r.valorizaciones.numero)}</td>
                <td className="num"><strong>{money(r.total || r.monto)}</strong></td>
                <td className="text-muted">{r.fecha_emision || r.fecha}</td>
                <td><span className={'badge '+(r.estado==='pagada'?'badge-green':r.estado==='vencida'?'badge-red':'badge-cyan')}>{r.estado}</span></td>
                <td><button className="btn btn-sm btn-ghost">{I.eye}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Facturacion() {
  const {
    facturas, valorizaciones, osClientes, cuentas,
    emitirFacturaDesdeValorizacion, addNotificacion
  } = useApp();
  const today = new Date().toISOString().split('T')[0];
  const defaultVence = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }, [today]);
  const valorizacionesFacturadas = new Set((facturas || []).map(f => f.valorizacion_id).filter(Boolean));
  const valorizacionesPendientes = (valorizaciones || []).filter(v => v.estado === 'aprobada' && !valorizacionesFacturadas.has(v.id));
  const [panel, setPanel] = useState(false);
  const [form, setForm] = useState({
    valorizacion_id: '',
    numero: '',
    fecha_emision: today,
    fecha_vencimiento: defaultVence
  });

  const cuentaNombre = (cuentaId) => {
    const c = (cuentas || []).find(x => x.id === cuentaId);
    return c?.razon_social || c?.nombre_comercial || cuentaId || '-';
  };
  const valorizacionLabel = (v) => {
    const os = (osClientes || []).find(x => x.id === v.os_cliente_id);
    return `${v.numero || v.id} - ${cuentaNombre(os?.cuenta_id)} - ${money(v.total || 0)}`;
  };
  const facturaCliente = (r) => r.cliente || r.cuentas?.razon_social || cuentaNombre(r.cuenta_id);
  const facturaValorizacion = (r) => r.valorizacion || r.valorizaciones?.numero || (valorizaciones || []).find(v => v.id === r.valorizacion_id)?.numero || '-';
  const guardar = async (event) => {
    event.preventDefault();
    if (!form.valorizacion_id) {
      addNotificacion('Selecciona una valorizacion aprobada.');
      return;
    }
    const id = await emitirFacturaDesdeValorizacion(form.valorizacion_id, {
      numero: form.numero || undefined,
      fecha_emision: form.fecha_emision,
      fecha_vencimiento: form.fecha_vencimiento
    });
    if (id) {
      setPanel(false);
      setForm({ valorizacion_id: '', numero: '', fecha_emision: today, fecha_vencimiento: defaultVence });
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Facturacion</h1>
          <div className="page-sub">{(facturas || []).length} facturas registradas · {valorizacionesPendientes.length} valorizaciones listas</div>
        </div>
        <button className="btn btn-primary" data-local-form="true" disabled={!valorizacionesPendientes.length} onClick={() => setPanel(true)}>{I.plus} Nueva factura desde valorizacion</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Factura</th><th>Cliente</th><th>Valorizacion</th><th>Monto</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
            <tbody>{(facturas || []).length ? (facturas || []).map((r,i)=>(
              <tr key={r.id || i}>
                <td className="mono" style={{fontWeight:600}}>{r.numero || r.id}</td>
                <td>{facturaCliente(r)}</td>
                <td className="mono text-muted">{facturaValorizacion(r)}</td>
                <td className="num"><strong>{money(r.total || r.monto)}</strong></td>
                <td className="text-muted">{r.fecha_emision || r.fecha}</td>
                <td><span className={'badge '+(r.estado==='pagada'?'badge-green':r.estado==='vencida'?'badge-red':'badge-cyan')}>{r.estado}</span></td>
                <td><button className="btn btn-sm btn-ghost">{I.eye}</button></td>
              </tr>
            )) : (
              <tr><td colSpan="7" className="text-center text-muted" style={{padding:36}}>No hay facturas registradas.</td></tr>
            )}</tbody>
          </table>
        </div>
      </div>
      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
          <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Factura desde valorizacion</div>
                <div className="font-display" style={{fontSize:22,fontWeight:700}}>Emitir factura y CxC</div>
              </div>
              <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardar}>
              <div className="input-group">
                <label>Valorizacion aprobada</label>
                <select className="select" value={form.valorizacion_id} onChange={e => setForm(v => ({...v, valorizacion_id: e.target.value}))}>
                  <option value="">Seleccionar valorizacion...</option>
                  {valorizacionesPendientes.map(v => <option key={v.id} value={v.id}>{valorizacionLabel(v)}</option>)}
                </select>
              </div>
              <div className="grid-2" style={{gap:12}}>
                <div className="input-group">
                  <label>Numero de factura</label>
                  <input className="input" value={form.numero} onChange={e => setForm(v => ({...v, numero: e.target.value}))} placeholder="Automatico si se deja vacio"/>
                </div>
                <div className="input-group">
                  <label>Fecha emision</label>
                  <input className="input" type="date" value={form.fecha_emision} onChange={e => setForm(v => ({...v, fecha_emision: e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label>Fecha vencimiento CxC</label>
                  <input className="input" type="date" value={form.fecha_vencimiento} onChange={e => setForm(v => ({...v, fecha_vencimiento: e.target.value}))}/>
                </div>
              </div>
              {form.valorizacion_id && (() => {
                const v = valorizacionesPendientes.find(x => x.id === form.valorizacion_id);
                const os = osClientes.find(x => x.id === v?.os_cliente_id);
                return (
                  <div className="card mt-6" style={{padding:14}}>
                    <p><strong>Cliente:</strong> {cuentaNombre(os?.cuenta_id)}</p>
                    <p><strong>Subtotal:</strong> {money(v?.subtotal || 0)}</p>
                    <p><strong>IGV:</strong> {money(v?.igv || 0)}</p>
                    <p><strong>Total a facturar:</strong> {money(v?.total || 0)}</p>
                  </div>
                );
              })()}
              <div className="row mt-6" style={{justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Emitir factura</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

// ============ VENTAS ============
function Ventas() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ventas</h1>
          <div className="page-sub">Registro y seguimiento de ventas y facturación directa</div>
        </div>
        <button className="btn btn-primary">{I.plus} Registrar Venta</button>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Venta ID</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Concepto</th>
                <th>Monto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {MOCK.ventas.map(v => (
                <tr key={v.id} className="hover-row">
                  <td className="mono" style={{fontWeight:600}}>{v.id}</td>
                  <td className="text-muted">{v.fecha}</td>
                  <td style={{fontWeight:600}}>{v.cliente}</td>
                  <td>{v.concepto}</td>
                  <td className="num"><strong>{money(v.monto)} {v.moneda}</strong></td>
                  <td>
                    <span className={'badge ' + (v.estado==='cobrada'?'badge-green':'badge-orange')}>
                      {v.estado.toUpperCase()}
                    </span>
                  </td>
                  <td><button className="icon-btn">{I.chev}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============ CAJA CHICA ============
function CajaChica() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Caja Chica</h1>
          <div className="page-sub">Fondos fijos y rendición de gastos menores</div>
        </div>
        <button className="btn btn-primary">{I.plus} Registrar Gasto</button>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha</th>
                <th>Responsable</th>
                <th>Concepto</th>
                <th>Comprobante</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {MOCK.cajaChica.map(c => (
                <tr key={c.id} className="hover-row">
                  <td className="mono" style={{fontWeight:600}}>{c.id}</td>
                  <td className="text-muted">{c.fecha}</td>
                  <td>{c.responsable}</td>
                  <td>{c.concepto}</td>
                  <td className="mono text-muted">{c.comprobante}</td>
                  <td className="num"><strong>{money(c.monto)}</strong></td>
                  <td>
                    <span className={'badge ' + (c.estado==='aprobado'?'badge-green':c.estado==='rendido'?'badge-cyan':'badge-orange')}>
                      {c.estado.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============ PRÉSTAMOS Y PAGOS ============
function PrestamosPersonal() {
  const { navigate, setTrabajadoresDatosNomina } = useApp();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ empleado:'', trabajador_id:'TEC-001', monto:0, cuotas:1, descuento_nomina:true });
  const cuota = Number(form.cuotas || 0) ? Number(form.monto || 0) / Number(form.cuotas || 1) : 0;
  const guardar = (e) => {
    e.preventDefault();
    if (form.descuento_nomina) {
      setTrabajadoresDatosNomina(prev => ({
        ...prev,
        [form.trabajador_id]: { ...(prev[form.trabajador_id] || {}), cuota_prestamo_mes: Number(cuota.toFixed(2)) }
      }));
    }
    setOpen(false);
  };
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Préstamos al Personal</h1>
          <div className="page-sub">Adelantos y préstamos internos descontados en nómina</div>
        </div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setOpen(true)}>{I.plus} Nuevo Préstamo</button>
      </div>
      <div style={{ background:'rgba(0,188,212,0.08)', borderLeft:'3px solid var(--cyan)', borderRadius:'6px', padding:'10px 16px', marginBottom:'20px', fontSize:'13px' }}>
        Estos son préstamos que la empresa otorga a sus trabajadores. Si buscas préstamos bancarios o financiamiento recibido por la empresa, ve a{' '}
        <button onClick={() => navigate('financiamiento')} style={{ color:'var(--cyan)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Financiamiento y Deuda</button>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>Empleado</th>
                <th>Fecha Otorgado</th>
                <th>Monto Total</th>
                <th>Cuotas</th>
                <th>Descuento en nomina</th>
                <th>Avance Pagado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {MOCK.prestamos.map(p => (
                <tr key={p.id} className="hover-row">
                  <td className="mono" style={{fontWeight:600}}>{p.id}</td>
                  <td style={{fontWeight:600}}>{p.empleado}</td>
                  <td className="text-muted">{p.fecha}</td>
                  <td className="num">{money(p.monto)}</td>
                  <td>{p.cuotas}</td>
                  <td><strong>{moneyD(p.cuota_mensual || (p.monto / p.cuotas))}</strong></td>
                  <td style={{width:120}}>
                    <div className="bar">
                      <div style={{width:(p.pagado/p.monto*100)+'%', background:p.pagado===p.monto?'var(--green)':'var(--cyan)'}}/>
                    </div>
                    <div style={{fontSize:11,marginTop:2}}>{money(p.pagado)} / {money(p.monto)}</div>
                  </td>
                  <td>
                    <span className={'badge ' + (p.estado==='cancelado'?'badge-purple':'badge-green')}>
                      {p.estado.toUpperCase()}
                    </span>
                    {p.estado === 'vigente' && p.descuento_nomina && <span className="badge badge-cyan" style={{marginLeft:6}}>Vinculado a nomina</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && (
        <>
          <div className="side-panel-backdrop" onClick={() => setOpen(false)}/>
          <div className="side-panel" style={{width:'min(580px, 96vw)'}}>
            <div className="side-panel-head">
              <div><div className="eyebrow">Prestamo interno</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Nuevo prestamo al personal</div></div>
              <button className="icon-btn" onClick={() => setOpen(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardar}>
              <div className="grid-2" style={{gap:16}}>
                <div className="input-group"><label>Empleado</label><input className="input" value={form.empleado} onChange={e=>setForm(v=>({...v, empleado:e.target.value}))}/></div>
                <div className="input-group"><label>Trabajador nomina</label><select className="select" value={form.trabajador_id} onChange={e=>setForm(v=>({...v, trabajador_id:e.target.value}))}><option value="TEC-001">TEC-001</option><option value="per_001">per_001</option><option value="per_002">per_002</option></select></div>
                <div className="input-group"><label>Monto</label><input className="input" type="number" value={form.monto} onChange={e=>setForm(v=>({...v, monto:e.target.value}))}/></div>
                <div className="input-group"><label>Cuotas</label><input className="input" type="number" min="1" value={form.cuotas} onChange={e=>setForm(v=>({...v, cuotas:e.target.value}))}/></div>
                <div className="input-group" style={{gridColumn:'1 / -1'}}>
                  <label><input type="checkbox" checked={form.descuento_nomina} onChange={e=>setForm(v=>({...v, descuento_nomina:e.target.checked}))}/> Descontar automaticamente en nomina</label>
                  <div className="text-muted" style={{fontSize:12}}>Cuota mensual estimada: {moneyD(cuota)}</div>
                </div>
              </div>
              <div className="row mt-6" style={{justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>setOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar prestamo</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

// ============ CUENTAS POR PAGAR (CXP) ============
function CxPLegacy() {
  const { cxp, registrarPagoCxP } = useApp();
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas por Pagar (CxP)</h1>
          <div className="page-sub">Seguimiento de facturas de proveedores y vencimientos</div>
        </div>
        <div className="row">
          <button className="btn btn-secondary">{I.filter} Filtros</button>
          <button className="btn btn-primary">{I.plus} Registrar Factura</button>
        </div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>Proveedor</th>
                <th>Factura</th>
                <th>Emisión</th>
                <th>Vencimiento</th>
                <th>Monto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(cxp || []).map(c => (
                <tr key={c.id} className="hover-row">
                  <td className="mono">{c.id}</td>
                  <td style={{fontWeight:600}}>{c.proveedor || (c.proveedores && c.proveedores.razon_social)}</td>
                  <td className="mono text-muted">{c.factura_numero || c.factura}</td>
                  <td className="text-muted">{c.fecha_emision || c.emision}</td>
                  <td className="text-muted" style={{color: c.estado==='por_vencer'?'var(--danger)':''}}>{c.fecha_vencimiento || c.vencimiento}</td>
                  <td className="num"><strong>{money(c.monto_total || c.monto)}</strong></td>
                  <td>
                    <span className={'badge ' + (c.estado==='pagada'?'badge-green':c.estado==='por_pagar'?'badge-orange':'badge-red')}>
                      {c.estado.replace('_',' ').toUpperCase()}
                    </span>
                  </td>
                  <td>{c.estado !== 'pagada' && <button className="btn btn-sm btn-ghost" onClick={() => registrarPagoCxP(c.id, c.saldo)}>Pagar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CxP() {
  const { cxp, proveedores, registrarPagoCxP } = useApp();
  const today = new Date().toISOString().split('T')[0];
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ monto: '', fecha: today, cuenta_bancaria: 'Cuenta principal', referencia: '' });
  const proveedorNombre = c => c?.proveedor || c?.proveedores?.razon_social || proveedores?.find?.(p => p.id === c?.proveedor_id)?.razon_social || c?.proveedor_id || '-';
  const saldoDe = c => Number(c?.saldo ?? c?.monto_total ?? c?.monto ?? 0);
  const totalDe = c => Number(c?.monto_total ?? c?.monto ?? 0);
  const pagadoDe = c => Number(c?.monto_pagado ?? 0);
  const moraDe = c => {
    const vence = c?.fecha_vencimiento || c?.vencimiento;
    if (!vence || saldoDe(c) <= 0) return 0;
    return Math.max(0, Math.floor((new Date(`${today}T00:00:00`) - new Date(`${vence}T00:00:00`)) / 86400000));
  };
  const totalPorPagar = (cxp || []).reduce((s, c) => s + saldoDe(c), 0);
  const totalVencido = (cxp || []).filter(c => moraDe(c) > 0).reduce((s, c) => s + saldoDe(c), 0);
  const abrirPago = c => {
    setSel(c);
    setForm({ monto: String(saldoDe(c)), fecha: today, cuenta_bancaria: 'Cuenta principal', referencia: '' });
    setPanel(true);
  };
  const guardarPago = async event => {
    event.preventDefault();
    const monto = Number(form.monto || 0);
    if (!sel || monto <= 0) return;
    await registrarPagoCxP(sel.id, monto, form);
    setPanel(false);
    setSel(null);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas por Pagar (CxP)</h1>
          <div className="page-sub">Total por pagar {money(totalPorPagar)} · {money(totalVencido)} vencido</div>
        </div>
        <div className="row">
          <button className="btn btn-secondary">{I.filter} Filtros</button>
        </div>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Pendiente</div><div className="kpi-value">{money(totalPorPagar)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Vencido</div><div className="kpi-value">{money(totalVencido)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Documentos abiertos</div><div className="kpi-value">{(cxp || []).filter(c => saldoDe(c) > 0).length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Pagadas</div><div className="kpi-value">{(cxp || []).filter(c => c.estado === 'pagada').length}</div></div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>ID</th><th>Proveedor</th><th>Factura</th><th>Emision</th><th>Vencimiento</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {(cxp || []).length ? (cxp || []).map(c => (
                <tr key={c.id} className="hover-row">
                  <td className="mono">{c.id}</td>
                  <td style={{fontWeight:600}}>{proveedorNombre(c)}</td>
                  <td className="mono text-muted">{c.factura_numero || c.factura || '-'}</td>
                  <td className="text-muted">{c.fecha_emision || c.emision}</td>
                  <td className="text-muted" style={{color: moraDe(c)>0 ? 'var(--danger)' : undefined}}>{c.fecha_vencimiento || c.vencimiento}</td>
                  <td className="num"><strong>{money(totalDe(c))}</strong></td>
                  <td className="num text-muted">{money(pagadoDe(c))}</td>
                  <td className="num"><strong>{money(saldoDe(c))}</strong></td>
                  <td><span className={'badge ' + (c.estado==='pagada'?'badge-green':moraDe(c)>0?'badge-red':'badge-orange')}>{String(c.estado || 'por_pagar').replace('_',' ').toUpperCase()}</span></td>
                  <td>{saldoDe(c) > 0 && <button className="btn btn-sm btn-primary" data-local-form="true" onClick={() => abrirPago(c)}>Pagar</button>}</td>
                </tr>
              )) : <tr><td colSpan="10" className="text-center text-muted" style={{padding:32}}>No hay cuentas por pagar registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
          <div className="side-panel" style={{width:'min(520px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Registrar pago</div>
                <div className="font-display" style={{fontSize:22,fontWeight:700}}>{sel?.factura_numero || sel?.factura || sel?.id}</div>
              </div>
              <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarPago}>
              <div className="card" style={{padding:14}}>
                <p><strong>Proveedor:</strong> {proveedorNombre(sel)}</p>
                <p><strong>Saldo pendiente:</strong> {money(saldoDe(sel))}</p>
              </div>
              <div className="grid-2 mt-6" style={{gap:12}}>
                <div className="input-group">
                  <label>Monto pagado</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.monto} onChange={e => setForm(v => ({...v, monto: e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label>Fecha</label>
                  <input className="input" type="date" value={form.fecha} onChange={e => setForm(v => ({...v, fecha: e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label>Cuenta bancaria</label>
                  <input className="input" value={form.cuenta_bancaria} onChange={e => setForm(v => ({...v, cuenta_bancaria: e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label>Referencia</label>
                  <input className="input" value={form.referencia} onChange={e => setForm(v => ({...v, referencia: e.target.value}))} placeholder="Operacion bancaria"/>
                </div>
              </div>
              <div className="row mt-6" style={{justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Registrar pago</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function Presupuestos() {
  const [tab, setTab] = useState('control');
  const S = n => 'S/ ' + n.toLocaleString('es-PE');
  const pv = Object.entries(MOCK.biFinanciero.presupuesto_vs_real).map(([key, value]) => ({
    key,
    partida: key.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    presupuesto: value.presupuesto,
    real: value.real,
    variacion: value.real - value.presupuesto,
    ejecucion_pct: Math.round((value.real / value.presupuesto) * 100)
  }));
  const totalPres = pv.reduce((s, p) => s + p.presupuesto, 0);
  const totalReal = pv.reduce((s, p) => s + p.real, 0);
  const totalVar  = totalReal - totalPres;
  const ejecPct   = Math.round(totalReal / totalPres * 100);

  const alertas = pv.filter(p => p.ejecucion_pct > 100).length;
  const enLimite = pv.filter(p => p.ejecucion_pct > 80 && p.ejecucion_pct <= 100).length;

  const aprobaciones = [
    { rol: 'Director General',      fecha: '2026-04-01', estado: 'aprobado',    comentario: 'Aprobado según plan estratégico 2026' },
    { rol: 'Gerente de Finanzas',   fecha: '2026-04-02', estado: 'aprobado',    comentario: 'Validado con proyecciones de tesorería' },
    { rol: 'Gerente de Operaciones',fecha: '2026-04-03', estado: 'aprobado',    comentario: 'Confirmado con capacidad operativa' },
    { rol: 'Contabilidad',          fecha: null,         estado: 'en_revision', comentario: 'Revisando conciliación con EEFF preliminares' },
  ];

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Presupuesto vs Real</h1><div className="page-sub">Control presupuestal mensual · Abril 2026</div></div>
        <div className="row"><button className="btn btn-secondary">{I.download} Exportar</button><button className="btn btn-primary">{I.plus} Solicitar ajuste</button></div>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Presupuesto total</div><div className="kpi-value" style={{fontSize:20}}>{S(totalPres)}</div><div className="kpi-icon cyan">{I.trend}</div></div>
        <div className="kpi-card"><div className="kpi-label">Ejecutado</div><div className="kpi-value" style={{fontSize:20, color:totalVar>0?'var(--danger)':'var(--green)'}}>{S(totalReal)}</div><div className={'kpi-icon '+(totalVar>0?'red':'green')}>{I.dollar}</div></div>
        <div className="kpi-card"><div className="kpi-label">Variación neta</div><div className="kpi-value" style={{fontSize:20, color:totalVar>0?'var(--danger)':'var(--green)'}}>{totalVar>0?'+':''}{S(totalVar)}</div><div className={'kpi-icon '+(totalVar>0?'orange':'green')}>{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">Ejecución global</div><div className="kpi-value" style={{fontSize:20, color:ejecPct>100?'var(--danger)':ejecPct>80?'var(--orange)':'inherit'}}>{ejecPct}%</div><div className="kpi-icon purple">{I.trend}</div></div>
      </div>

      {alertas > 0 && (
        <div style={{padding:'12px 16px', background:'rgba(220,38,38,0.08)', border:'1px solid var(--danger)', borderRadius:10, marginBottom:16}} className="row">
          <span style={{display:'flex',alignItems:'center',flexShrink:0,width:18,height:18,color:'var(--danger)'}}>{I.alert}</span><div><strong>{alertas} partida{alertas>1?'s':''} excedida{alertas>1?'s':''} del presupuesto</strong> · {enLimite} en límite (&gt; 80 %)</div>
        </div>
      )}

      <div className="tabs">
        <div className={'tab '+(tab==='control'?'active':'')} onClick={()=>setTab('control')}>Control de Gastos</div>
        <div className={'tab '+(tab==='aprobacion'?'active':'')} onClick={()=>setTab('aprobacion')}>Flujo de Aprobación</div>
      </div>

      {tab === 'control' && (
        <div className="card">
          <div className="card-head"><h3>Partidas presupuestales — Abril 2026</h3><span className="text-muted" style={{fontSize:12}}>{pv.length} partidas</span></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Partida</th><th className="num">Presupuesto</th><th className="num">Real</th><th className="num">Variación</th><th style={{width:160}}>Ejecución</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {pv.map((p, i) => {
                  const over = p.ejecucion_pct > 100;
                  const limit = p.ejecucion_pct > 80;
                  const barColor = over ? 'var(--danger)' : limit ? 'var(--orange)' : 'var(--green)';
                  return (
                    <tr key={i}>
                      <td style={{fontWeight:600}}>{p.partida}</td>
                      <td className="num text-muted">{S(p.presupuesto)}</td>
                      <td className="num"><strong style={{color:over?'var(--danger)':'inherit'}}>{S(p.real)}</strong></td>
                      <td className="num"><span style={{color:p.variacion>0?'var(--danger)':'var(--green)', fontWeight:600}}>{p.variacion>0?'+':''}{S(p.variacion)}</span></td>
                      <td>
                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                          <div style={{flex:1, height:7, background:'var(--bg-subtle)', borderRadius:4}}>
                            <div style={{width:Math.min(p.ejecucion_pct,100)+'%', height:'100%', background:barColor, borderRadius:4}}/>
                          </div>
                          <span style={{fontSize:12, fontWeight:700, minWidth:36, color:barColor}}>{p.ejecucion_pct}%</span>
                        </div>
                      </td>
                      <td><span className={'badge '+(over?'badge-red':limit?'badge-orange':'badge-green')}>{over?'Excedido':limit?'En límite':'OK'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:'14px 20px', borderTop:'1px solid var(--border-subtle)', display:'flex', gap:32, justifyContent:'flex-end', fontFamily:'Sora', fontSize:13}}>
            <span className="text-muted">Total presupuesto: <strong style={{color:'var(--fg)'}}>{S(totalPres)}</strong></span>
            <span className="text-muted">Total ejecutado: <strong style={{color:totalVar>0?'var(--danger)':'var(--green)'}}>{S(totalReal)}</strong></span>
            <span className="text-muted">Variación: <strong style={{color:totalVar>0?'var(--danger)':'var(--green)'}}>{totalVar>0?'+':''}{S(totalVar)}</strong></span>
          </div>
        </div>
      )}

      {tab === 'aprobacion' && (
        <div className="card">
          <div className="card-head"><h3>Cadena de aprobación — Presupuesto 2026</h3><span className="badge badge-cyan">3 de 4 aprobados</span></div>
          <div style={{padding:'20px 24px', display:'flex', flexDirection:'column', gap:0}}>
            {aprobaciones.map((a, i) => {
              const aprobado = a.estado === 'aprobado';
              return (
                <div key={i} style={{display:'flex', gap:20, position:'relative'}}>
                  <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
                    <div style={{width:36, height:36, borderRadius:'50%', background:aprobado?'var(--green)':'var(--bg-subtle)', border:'2px solid '+(aprobado?'var(--green)':'var(--border)'), display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0}}>
                      {aprobado ? '✓' : '⏳'}
                    </div>
                    {i < aprobaciones.length-1 && <div style={{width:2, flex:1, minHeight:32, background:aprobado?'var(--green)':'var(--border)', margin:'4px 0'}}/>}
                  </div>
                  <div style={{paddingBottom:28, flex:1}}>
                    <div style={{fontWeight:600, fontSize:14, color:aprobado?'var(--fg)':'var(--fg-muted)'}}>{a.rol}</div>
                    {a.fecha && <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>{a.fecha}</div>}
                    <div style={{fontSize:12, marginTop:6, padding:'8px 12px', background:'var(--bg-subtle)', borderRadius:6, color:'var(--fg-subtle)', borderLeft:'3px solid '+(aprobado?'var(--green)':'var(--border)')}}>{a.comentario}</div>
                  </div>
                  <div style={{paddingTop:8}}>
                    <span className={'badge '+(aprobado?'badge-green':'badge-cyan')}>{aprobado?'Aprobado':'En revisión'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export { CxC, Tesoreria, Resultados, Facturacion, Ventas, CajaChica, PrestamosPersonal, CxP, Presupuestos };

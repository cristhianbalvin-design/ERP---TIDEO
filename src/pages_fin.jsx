import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { isSupabaseMode } from './lib/dataMode.js';
import { ER_CURRENCIES, buildEstadoResultados, getEstadoResultados } from './services/estadoResultadosService.js';
import { buildTesoreriaSummary } from './services/tesoreriaService.js';
import {
  CONDICION_PAGO_DEFECTO_CXC,
  calcularFechaVencimientoCxC,
  finanzasService,
  resolverCondicionPagoCxC,
} from './services/finanzasService.js';
import { rrhhService } from './services/rrhhService.js';
import * as storageService from './services/storageService.js';
import { NuevoEgreso } from './components/NuevoEgreso.jsx';
import * as XLSX from 'xlsx';

// Finanzas: CxC, Tesorería/Match, Estado de Resultados, Facturación
const symOf = m => m === 'USD' ? 'US$' : 'S/';
const moneyCurrency = (value, moneda = 'PEN') => money(value, symOf(moneda));
const moneyDCurrency = (value, moneda = 'PEN') => moneyD(value, symOf(moneda));
const normText = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
  const {
    cxc, cuentas, osClientes, facturas, usuarios,
    cobrosHistorial, gestionesCobranza, cuentasBancarias,
    registrarCobroCxC, registrarGestionCobranza, actualizarVencimientoCxC, revertirCobroCxC, comisiones,
    condonarMoraCxC, restaurarMoraCxC,
    navigate, role,
  } = useApp();

  const today = new Date().toISOString().split('T')[0];
  const TASA_MORA_DIARIA = 0.000833; // 0.083% diario — tasa legal Perú ~30% anual

  // ── Helpers ───────────────────────────────────────────────────────────
  const saldoDe   = c => Number(c?.saldo ?? c?.monto_total ?? c?.total ?? 0);
  const totalDe   = c => Number(c?.monto_total ?? c?.total ?? 0);
  const pagadoDe  = c => Number(c?.monto_pagado ?? c?.pagado ?? 0);
  const clienteDe = c => c?.cliente || c?.cuentas?.razon_social || (cuentas||[]).find(x=>x.id===c?.cuenta_id)?.razon_social || '-';
  const facturaNumeroDe = c => c?.facturas?.numero || c?.factura || (facturas||[]).find(f=>f.id===c?.factura_id)?.numero || '-';
  const osNumeroDe = c => c?.os_clientes?.numero || (osClientes||[]).find(o=>o.id===c?.os_cliente_id)?.numero || '-';

  const diasMoraDe = c => {
    if (saldoDe(c) <= 0 || c?.estado === 'anulada' || c?.estado === 'cobrada') return 0;
    const vence = c?.fecha_vencimiento || c?.vence;
    if (!vence) return 0;
    return Math.max(0, Math.floor((new Date(`${today}T00:00:00`) - new Date(`${vence}T00:00:00`)) / 86400000));
  };

  const interesMoraDe = c => {
    const dias = diasMoraDe(c);
    if (dias <= 0) return 0;
    const tasa = c?.tasa_mora_diaria != null ? Number(c.tasa_mora_diaria) : TASA_MORA_DIARIA;
    return Math.round(saldoDe(c) * tasa * dias * 100) / 100;
  };

  const estadoDe = c => {
    if (c?.estado === 'anulada') return 'anulada';
    const saldo = saldoDe(c);
    if (saldo <= 0) return 'cobrada';
    if (c?.estado === 'en_gestion') return 'en_gestion';
    const tieneGestion = (gestionesCobranza||[]).some(g => g.cxc_id === c.id);
    if (tieneGestion) return 'en_gestion';
    const dias = diasMoraDe(c);
    if (dias > 0) return 'vencida';
    const vence = c?.fecha_vencimiento || c?.vence;
    if (vence) {
      const diasParaVencer = Math.floor((new Date(`${vence}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
      if (diasParaVencer >= 0 && diasParaVencer <= 7) return 'por_vencer';
    }
    if (pagadoDe(c) > 0 && saldo > 0) return 'cobrada_parcial';
    return 'por_cobrar';
  };

  const ESTADO_META = {
    por_cobrar:      { label: 'Por cobrar',    cls: 'badge-cyan'   },
    por_vencer:      { label: 'Por vencer',    cls: 'badge-orange' },
    vencida:         { label: 'Vencida',       cls: 'badge-red'    },
    en_gestion:      { label: 'En gestión',    cls: 'badge-purple' },
    cobrada_parcial: { label: 'Cobro parcial', cls: 'badge-orange' },
    cobrada:         { label: 'Cobrada',       cls: 'badge-green'  },
    anulada:         { label: 'Anulada',       cls: 'badge-gray'   },
  };

  // ── State ─────────────────────────────────────────────────────────────
  const [selCxC, setSelCxC] = useState(null);
  const [fichaTab, setFichaTab] = useState('resumen');
  const [agingFilter, setAgingFilter] = useState(null);
  const [showFiltros, setShowFiltros] = useState(false);
  const [fCliente, setFCliente] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fMoneda, setFMoneda] = useState('');
  const [fVenceDesde, setFVenceDesde] = useState('');
  const [fVenceHasta, setFVenceHasta] = useState('');
  const [fMoraDesde, setFMoraDesde] = useState('');
  const [fMoraHasta, setFMoraHasta] = useState('');
  const [fGestor, setFGestor] = useState('');

  const [panelCobro, setPanelCobro] = useState(false);
  const [cobroSel, setCobroSel] = useState(null);
  const [formCobro, setFormCobro] = useState({ monto:'', incluye_mora:false, monto_mora:'', fecha_cobro:today, medio_pago:'', cuenta_bancaria:'', numero_operacion:'', notas:'' });
  const [montoError, setMontoError] = useState('');
  const cuentasBancariasActivas = (cuentasBancarias||[]).filter(cb=>cb.estado!=='inactivo'&&cb.estado!=='eliminado');

  const [panelGestion, setPanelGestion] = useState(false);
  const [gestionSel, setGestionSel] = useState(null);
  const [formGestion, setFormGestion] = useState({ tipo_gestion:'', resultado:'', fecha_proxima_accion:'', fecha_acordada_pago:'', notas:'' });
  const [editVencimiento, setEditVencimiento] = useState(null);
  const [savingVencimiento, setSavingVencimiento] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(null); // CxC a anular
  const [savingCondonar, setSavingCondonar] = useState(false);

  // ── KPIs ──────────────────────────────────────────────────────────────
  const cxcActivas = useMemo(() => (cxc||[]).filter(c => c.estado !== 'anulada'), [cxc]);
  const totalPorCobrarPEN = useMemo(() => cxcActivas.filter(c => (c.moneda||'PEN') !== 'USD').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas]);
  const totalPorCobrarUSD = useMemo(() => cxcActivas.filter(c => (c.moneda||'PEN') === 'USD').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas]);
  const totalVencidoPEN   = useMemo(() => cxcActivas.filter(c => diasMoraDe(c) > 0 && (c.moneda||'PEN') !== 'USD').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas, today]);
  const totalVencidoUSD   = useMemo(() => cxcActivas.filter(c => diasMoraDe(c) > 0 && (c.moneda||'PEN') === 'USD').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas, today]);
  const totalEnGestionPEN = useMemo(() => cxcActivas.filter(c => estadoDe(c) === 'en_gestion' && (c.moneda||'PEN') !== 'USD').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas, gestionesCobranza, today]);
  const totalEnGestionUSD = useMemo(() => cxcActivas.filter(c => estadoDe(c) === 'en_gestion' && (c.moneda||'PEN') === 'USD').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas, gestionesCobranza, today]);

  // ── Aging ─────────────────────────────────────────────────────────────
  const aging = useMemo(() => [
    { key:'0-30',  label:'0–30 días',  min:0,  max:30,  color:'green'  },
    { key:'31-60', label:'31–60 días', min:31, max:60,  color:'orange' },
    { key:'61-90', label:'61–90 días', min:61, max:90,  color:'orange' },
    { key:'+90',   label:'+90 días',   min:91, max:null, color:'danger' },
  ].map(b => {
    const items = cxcActivas.filter(c => {
      const d = diasMoraDe(c);
      return saldoDe(c) > 0 && d >= b.min && (b.max == null || d <= b.max);
    });
    return { 
      ...b, 
      montoPEN: items.filter(c => (c.moneda||'PEN') !== 'USD').reduce((s,c) => s + saldoDe(c), 0),
      montoUSD: items.filter(c => (c.moneda||'PEN') === 'USD').reduce((s,c) => s + saldoDe(c), 0), 
      count: items.length 
    };
  }), [cxcActivas, today]);

  // ── Filtered rows ─────────────────────────────────────────────────────
  const cxcFiltrada = useMemo(() => {
    let rows = cxcActivas;
    if (agingFilter) {
      const b = aging.find(a => a.key === agingFilter);
      if (b) rows = rows.filter(c => { const d = diasMoraDe(c); return saldoDe(c) > 0 && d >= b.min && (b.max == null || d <= b.max); });
    }
    if (fCliente)    rows = rows.filter(c => clienteDe(c).toLowerCase().includes(fCliente.toLowerCase()));
    if (fEstado)     rows = rows.filter(c => estadoDe(c) === fEstado);
    if (fMoneda)     rows = rows.filter(c => (c.moneda||'PEN') === fMoneda);
    if (fVenceDesde) rows = rows.filter(c => (c.fecha_vencimiento||c.vence||'') >= fVenceDesde);
    if (fVenceHasta) rows = rows.filter(c => (c.fecha_vencimiento||c.vence||'') <= fVenceHasta);
    if (fMoraDesde)  rows = rows.filter(c => diasMoraDe(c) >= Number(fMoraDesde));
    if (fMoraHasta)  rows = rows.filter(c => diasMoraDe(c) <= Number(fMoraHasta));
    if (fGestor)     rows = rows.filter(c => (c.gestor_cobranza_id || '') === fGestor);
    return rows;
  }, [cxcActivas, agingFilter, fCliente, fEstado, fMoneda, fVenceDesde, fVenceHasta, fMoraDesde, fMoraHasta, fGestor, today, gestionesCobranza]);

  const hayFiltros = !!(agingFilter||fCliente||fEstado||fMoneda||fVenceDesde||fVenceHasta||fMoraDesde||fMoraHasta||fGestor);

  // ── Handlers ─────────────────────────────────────────────────────────
  const abrirFicha = c => { setSelCxC(c.id); setFichaTab('resumen'); };

  const abrirCobro = (c, e) => {
    if (e) e.stopPropagation();
    setCobroSel(c);
    setFormCobro({ monto: String(saldoDe(c)), incluye_mora: false, monto_mora: '', fecha_cobro: today, medio_pago: '', cuenta_bancaria: '', numero_operacion: '', notas: '' });
    setPanelCobro(true);
  };

  const guardarCobro = async e => {
    e.preventDefault();
    const monto = Number(formCobro.monto || 0);
    const saldo = saldoDe(cobroSel);
    if (monto <= 0) return;
    if (monto > saldo) {
      setMontoError(`El monto no puede superar el saldo pendiente de ${money(saldo)}.`);
      return;
    }
    setMontoError('');
    if (!formCobro.medio_pago) {
      alert('Seleccione el medio de pago.');
      return;
    }
    if (['Transferencia bancaria','Depósito'].includes(formCobro.medio_pago) && !formCobro.numero_operacion) {
      alert('Ingrese el número de operación o referencia bancaria.');
      return;
    }
    await registrarCobroCxC(cobroSel.id, monto, formCobro);
    setPanelCobro(false);
    setCobroSel(null);
  };

  const abrirGestion = (c, e) => {
    if (e) e.stopPropagation();
    setGestionSel(c);
    setFormGestion({ tipo_gestion:'', resultado:'', fecha_proxima_accion:'', fecha_acordada_pago:'', notas:'' });
    setPanelGestion(true);
  };

  const permisosEditarCxC = role?.permisos?.editar;
  const puedeEditarCxC = Boolean(role?.permisos?.todo || permisosEditarCxC === true || permisosEditarCxC?.includes?.('cxc'));

  const abrirEdicionVencimiento = (c, e) => {
    if (e) e.stopPropagation();
    if (!puedeEditarCxC) return;
    setEditVencimiento({ id: c.id, fecha: c.fecha_vencimiento || c.vence || today });
  };

  const cancelarEdicionVencimiento = () => {
    setEditVencimiento(null);
  };

  const confirmarEdicionVencimiento = async () => {
    if (!editVencimiento?.id || !editVencimiento?.fecha) return;
    setSavingVencimiento(true);
    try {
      await actualizarVencimientoCxC(editVencimiento.id, editVencimiento.fecha);
      setEditVencimiento(null);
    } finally {
      setSavingVencimiento(false);
    }
  };

  const guardarGestion = async e => {
    e.preventDefault();
    const necesitaFecha = ['promesa_pago','pagara_en_fecha_acordada'].includes(formGestion.resultado);
    if (necesitaFecha && !formGestion.fecha_proxima_accion) {
      alert('Debe ingresar la fecha de próxima acción para este resultado.');
      return;
    }
    await registrarGestionCobranza(gestionSel.id, formGestion);
    setPanelGestion(false);
    setGestionSel(null);
  };

  const exportarCSV = () => {
    const cols = ['Cliente','Factura','OS Cliente','Emisión','Vencimiento','Total','Pagado','Saldo','Mora (días)','Interés mora','Medio pago esp.','Gestor','Estado','Últ. gestión','Resultado gestión'];
    const rows = cxcFiltrada.map(c => {
      const gs = (gestionesCobranza||[]).filter(g=>g.cxc_id===c.id).sort((a,b)=>b.fecha_gestion.localeCompare(a.fecha_gestion));
      const ug = gs[0];
      return [
        `"${clienteDe(c)}"`, facturaNumeroDe(c), osNumeroDe(c),
        c.fecha_emision||c.emision||'', c.fecha_vencimiento||c.vence||'',
        totalDe(c), pagadoDe(c), saldoDe(c),
        diasMoraDe(c), interesMoraDe(c).toFixed(2),
        c.medio_pago_esperado||'', c.gestor_cobranza_id||'',
        estadoDe(c),
        ug?.fecha_gestion||'', ug?.resultado||'',
      ].join(',');
    });
    const csv = [cols.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`cxc_${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Ficha ─────────────────────────────────────────────────────────────
  let fichaJSX = null;
  if (selCxC) {
    const c = (cxc||[]).find(x => x.id === selCxC);
    if (!c) { setSelCxC(null); return null; }
    const dias     = diasMoraDe(c);
    const interes  = interesMoraDe(c);
    const saldo    = saldoDe(c);
    const estado   = estadoDe(c);
    const tasaEfectiva = c?.tasa_mora_diaria != null ? Number(c.tasa_mora_diaria) : TASA_MORA_DIARIA;
    const moraCondonada = c?.tasa_mora_diaria != null && Number(c.tasa_mora_diaria) === 0;
    const tasa     = tasaEfectiva * 100;
    const cobros   = (cobrosHistorial||[]).filter(cb=>cb.cxc_id===c.id).sort((a,b)=>a.fecha_cobro.localeCompare(b.fecha_cobro));
    const gestiones= (gestionesCobranza||[]).filter(g=>g.cxc_id===c.id).sort((a,b)=>b.fecha_gestion.localeCompare(a.fecha_gestion));
    const proyMora = d => Math.round(saldo * tasaEfectiva * (dias+d) * 100) / 100;
    const metaEst  = ESTADO_META[estado] || ESTADO_META.por_cobrar;
    const fechaVencimientoActual = c?.fecha_vencimiento || c?.vence || '';
    const vencimientoLabel = fechaVencimientoActual || '—';
    const editandoVencimiento = editVencimiento?.id === c.id;
    const fechaVencimientoEditada = editandoVencimiento ? editVencimiento.fecha : fechaVencimientoActual;
    const vencimientoColor = dias > 0 ? 'var(--danger)' : dias === 0 ? 'var(--orange)' : 'var(--fg)';
    const tituloEditarVencimiento = puedeEditarCxC ? 'Editar vencimiento' : 'Requiere permiso cxc:editar';
    const TABS_FICHA = [
      { id:'resumen',  label:'Resumen'                       },
      { id:'pagos',    label:`Historial pagos (${cobros.length})` },
      { id:'gestion',  label:`Gestión (${gestiones.length})` },
      ...(dias > 0 || moraCondonada ? [{ id:'mora', label: moraCondonada ? 'Mora · Condonada' : 'Mora' }] : []),
    ];

    fichaJSX = (
      <>
        <div className="side-panel-backdrop" onClick={()=>setSelCxC(null)} />
        <div className="side-panel">
          <div className="side-panel-head">
            <div>
              <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>{clienteDe(c)} · Vence: {vencimientoLabel}</div>
              <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <strong style={{fontSize:16}}>{facturaNumeroDe(c)}</strong>
                <span className={'badge '+metaEst.cls}>{metaEst.label}</span>
                {dias > 0 && !moraCondonada && <span style={{fontSize:11,fontWeight:600,color:'var(--danger)'}}>{dias}d mora</span>}
                {moraCondonada && <span className="badge badge-green">✓ Condonada</span>}
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {saldo > 0 && <button className="btn btn-secondary btn-sm" data-local-form="true" onClick={e=>abrirGestion(c,e)} title="Registrar gestión">{I.send}</button>}
              {saldo > 0 && <button className="btn btn-primary btn-sm" data-local-form="true" onClick={e=>abrirCobro(c,e)}>Cobrar</button>}
              <button className="icon-btn" onClick={()=>setSelCxC(null)}>{I.x}</button>
            </div>
          </div>
          <div className="tabs" style={{margin:'0 22px'}}>
            {TABS_FICHA.map(t=><div key={t.id} className={'tab '+(fichaTab===t.id?'active':'')} onClick={()=>setFichaTab(t.id)}>{t.label}</div>)}
          </div>
          <div className="side-panel-body">

        {/* Tab Resumen */}
        {fichaTab === 'resumen' && (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div className="card" style={{padding:20}}>
                <div className="grid-2" style={{gap:16}}>
                  <div>
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>Cliente</div>
                    <button className="btn btn-ghost" style={{padding:0,fontSize:13,color:'var(--cyan)'}} onClick={()=>{setSelCxC(null);navigate('cuentas',{detail:c.cuenta_id});}}>{clienteDe(c)}</button>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>Factura vinculada</div>
                    {c.factura_id
                      ? <button className="btn btn-ghost" style={{padding:0,fontSize:13,color:'var(--cyan)'}} onClick={()=>{setSelCxC(null);navigate('facturacion',{selFac:c.factura_id});}}>{facturaNumeroDe(c)}</button>
                      : <span style={{fontSize:13,color:'var(--fg-muted)'}}>Sin factura vinculada</span>
                    }
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>OS Cliente</div>
                    <div style={{fontSize:13}}>{osNumeroDe(c)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>Emisión</div>
                    <div style={{fontSize:13}}>{c?.fecha_emision||c?.emision||'—'}</div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>Vencimiento</div>
                    {editandoVencimiento ? (
                      <div className="row" style={{gap:6,alignItems:'center',flexWrap:'wrap'}}>
                        <input className="input" type="date" value={fechaVencimientoEditada} disabled={savingVencimiento} onChange={e=>setEditVencimiento(v=>({...v,fecha:e.target.value}))} style={{width:150}} autoFocus />
                        <button className="icon-btn" title="Confirmar" disabled={savingVencimiento || !fechaVencimientoEditada} onClick={confirmarEdicionVencimiento}>{I.check}</button>
                        <button className="icon-btn" title="Cancelar" disabled={savingVencimiento} onClick={cancelarEdicionVencimiento}>{I.x}</button>
                      </div>
                    ) : puedeEditarCxC ? (
                      <button type="button" className="btn btn-ghost" title={tituloEditarVencimiento} onClick={e=>abrirEdicionVencimiento(c,e)} style={{padding:0,fontSize:13,fontWeight:600,color:vencimientoColor,display:'inline-flex',alignItems:'center',gap:6}}>
                        <span>{vencimientoLabel}</span>
                        <span style={{fontSize:11,color:'var(--cyan)'}}>{I.edit}</span>
                      </button>
                    ) : (
                      <div title={tituloEditarVencimiento} style={{fontSize:13,fontWeight:600,color:vencimientoColor}}>{vencimientoLabel}</div>
                    )}
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>Gestor asignado</div>
                    <div style={{fontSize:13}}>{c?.gestor_cobranza_id ? ((usuarios||[]).find(u=>u.id===c.gestor_cobranza_id)?.nombre||c.gestor_cobranza_id) : <span style={{color:'var(--fg-muted)'}}>Sin asignar</span>}</div>
                  </div>
                </div>
              </div>
              <div className="card" style={{padding:20}}>
                {Number(c.monto_retencion||0) > 0 ? (
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12,padding:'10px 14px',borderRadius:8,background:'rgba(251,191,36,0.05)',border:'1px solid rgba(251,191,36,0.25)'}}>
                    <div style={{fontWeight:700,fontSize:12,color:'var(--warning)',marginBottom:4}}>⚠ Agente de Retención SUNAT</div>
                    {[
                      ['Total facturado', moneyCurrency(totalDe(c), c.moneda), null],
                      ['Retención SUNAT', `- ${moneyCurrency(Number(c.monto_retencion), c.moneda)}`, 'var(--warning)'],
                      ['Neto a cobrar', moneyCurrency(totalDe(c) - Number(c.monto_retencion||0), c.moneda), 'var(--cyan)'],
                      ['Cobrado a la fecha', moneyCurrency(pagadoDe(c), c.moneda), 'var(--green)'],
                      ['Saldo pendiente', moneyCurrency(saldo, c.moneda), saldo>0?'var(--orange)':'var(--fg)'],
                    ].map(([label,val,color])=>(
                      <div key={label} style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                        <span style={{color:'var(--fg-muted)'}}>{label}</span>
                        <span style={{fontWeight:600,color:color||'var(--fg)'}}>{val}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,textAlign:'center',marginBottom:12}}>
                    <div><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Total facturado</div><div style={{fontSize:20,fontWeight:700,fontFamily:'Sora'}}>{moneyCurrency(totalDe(c), c.moneda)}</div></div>
                    <div><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Total pagado</div><div style={{fontSize:20,fontWeight:700,fontFamily:'Sora',color:'var(--green)'}}>{moneyCurrency(pagadoDe(c), c.moneda)}</div></div>
                    <div><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Saldo pendiente</div><div style={{fontSize:20,fontWeight:700,fontFamily:'Sora',color:saldo>0?'var(--orange)':'var(--fg)'}}>{moneyCurrency(saldo, c.moneda)}</div></div>
                  </div>
                )}
                {dias > 0 && (
                  <div style={{marginTop:16,paddingTop:16,borderTop:'1px solid var(--border)',display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,textAlign:'center'}}>
                    <div><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Días de mora</div><div style={{fontSize:22,fontWeight:700,fontFamily:'Sora',color:'var(--danger)'}}>{dias}d</div></div>
                    <div><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Interés de mora</div><div style={{fontSize:22,fontWeight:700,fontFamily:'Sora',color:'var(--danger)'}}>{moneyDCurrency(interes, c.moneda)}</div></div>
                  </div>
                )}
              </div>
          </div>
        )}

        {/* Tab Historial de pagos */}
        {fichaTab === 'pagos' && (
          <div className="card mt-6">
            {cobros.length === 0 ? (
              <div style={{padding:40,textAlign:'center',color:'var(--fg-muted)'}}>No hay cobros registrados para esta CxC.</div>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Capital</th><th>Mora</th><th>Medio de pago</th><th>Referencia</th><th>Cuenta destino</th><th>Registrado por</th></tr></thead>
                  <tbody>{cobros.map(cb=>(
                    <tr key={cb.id}>
                      <td>{cb.fecha_cobro}</td>
                      <td className="num"><strong>{moneyCurrency(cb.monto_capital, c.moneda)}</strong></td>
                      <td className="num text-muted">{cb.monto_mora>0?moneyCurrency(cb.monto_mora, c.moneda):'—'}</td>
                      <td>{cb.medio_pago||'—'}</td>
                      <td className="mono">{cb.numero_operacion||cb.referencia||'—'}</td>
                      <td>{cb.cuenta_bancaria||'—'}</td>
                      <td style={{fontSize:12,color:'var(--fg-muted)'}}>{cb.registrado_por||'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab Gestión de cobranza */}
        {fichaTab === 'gestion' && (
          <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:20}}>
            {saldo > 0 && (
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button className="btn btn-primary" data-local-form="true" onClick={e=>abrirGestion(c,e)}>{I.plus} Nueva gestión</button>
              </div>
            )}
            {gestiones.length === 0 ? (
              <div className="card" style={{padding:40,textAlign:'center',color:'var(--fg-muted)'}}>No hay gestiones de cobranza registradas.</div>
            ) : gestiones.map(g=>(
              <div key={g.id} className="card" style={{padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <span className="badge badge-purple">{g.tipo_gestion.replace(/_/g,' ')}</span>
                    <span className="badge badge-cyan">{g.resultado.replace(/_/g,' ')}</span>
                  </div>
                  <span style={{fontSize:12,color:'var(--fg-muted)',whiteSpace:'nowrap',marginLeft:12}}>{g.fecha_gestion}</span>
                </div>
                <div style={{fontSize:13,marginBottom:6}}>{g.notas}</div>
                {g.fecha_acordada_pago && <div style={{fontSize:12,color:'var(--orange)',fontWeight:600}}>Pago acordado: {g.fecha_acordada_pago}</div>}
                {g.fecha_proxima_accion && <div style={{fontSize:12,color:'var(--fg-muted)'}}>Próxima acción: {g.fecha_proxima_accion}</div>}
                {g.usuario && <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:4}}>Registrado por: {g.usuario}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Tab Mora */}
        {fichaTab === 'mora' && (dias > 0 || moraCondonada) && (
          <div style={{display:'flex',flexDirection:'column',gap:16,marginTop:20}}>

            {/* Banner condonada */}
            {moraCondonada && (
              <div style={{padding:'14px 18px',borderRadius:8,border:'1px solid var(--green)',background:'rgba(76,175,80,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:'var(--green)',marginBottom:4}}>✓ Mora condonada</div>
                  <div style={{fontSize:13,color:'var(--fg-muted)'}}>El interés por mora no aplica para esta CxC por acuerdo con el cliente.</div>
                </div>
                {puedeEditarCxC && (
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={savingCondonar}
                    onClick={async () => {
                      if (!window.confirm('¿Restaurar la tasa de mora al valor estándar (0.0833% diario)?')) return;
                      setSavingCondonar(true);
                      try { await restaurarMoraCxC(c.id); } finally { setSavingCondonar(false); }
                    }}
                  >
                    {savingCondonar ? 'Restaurando...' : 'Restaurar tasa'}
                  </button>
                )}
              </div>
            )}

            {/* Cálculo (solo si hay días de mora y no está condonada) */}
            {dias > 0 && !moraCondonada && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 280px',gap:16}}>
                <div className="card" style={{padding:20}}>
                  <div className="grid-2" style={{gap:16}}>
                    <div><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>Fecha de vencimiento</div><div style={{fontSize:14,fontWeight:600}}>{vencimientoLabel}</div></div>
                    <div><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>Días de mora</div><div style={{fontSize:22,fontWeight:700,color:'var(--danger)'}}>{dias} días</div></div>
                    <div><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>Tasa de mora diaria</div><div style={{fontSize:14}}>{tasa.toFixed(4)}%</div></div>
                    <div><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>Interés acumulado</div><div style={{fontSize:14,fontWeight:700,color:'var(--danger)'}}>{moneyD(interes)}</div></div>
                    <div style={{gridColumn:'1/-1'}}>
                      <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Fórmula aplicada</div>
                      <div style={{fontSize:12,fontFamily:'monospace',background:'var(--bg-subtle)',padding:'8px 12px',borderRadius:6}}>
                        {money(saldo)} × {tasa.toFixed(4)}% × {dias} días = {moneyD(interes)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card" style={{padding:20}}>
                  <div style={{fontSize:12,color:'var(--fg-muted)',marginBottom:12,fontWeight:600}}>Proyección de interés</div>
                  {[30,60,90].map(d=>(
                    <div key={d} className="row" style={{justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border-subtle)'}}>
                      <span style={{fontSize:13}}>+{d} días adicionales</span>
                      <span style={{fontWeight:700,color:'var(--danger)'}}>{moneyD(proyMora(d))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botón condonar (solo si hay mora y no está condonada) */}
            {dias > 0 && !moraCondonada && puedeEditarCxC && (
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button
                  className="btn btn-secondary"
                  disabled={savingCondonar}
                  onClick={async () => {
                    if (!window.confirm(`¿Condonar la mora de ${moneyD(interes)} para esta CxC? El interés dejará de calcularse. Esta acción queda registrada en el historial.`)) return;
                    setSavingCondonar(true);
                    try { await condonarMoraCxC(c.id); } finally { setSavingCondonar(false); }
                  }}
                >
                  {savingCondonar ? 'Guardando...' : '✕ Condonar mora'}
                </button>
              </div>
            )}

          </div>
        )}
          </div>{/* end side-panel-body */}
        </div>{/* end side-panel */}
      </>
    );
  }

  // ── Lista principal ───────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas por Cobrar</h1>
          <div className="page-sub" style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
            <span>Total por cobrar: <strong>{money(totalPorCobrarPEN)}</strong>{totalPorCobrarUSD > 0 && <> · <strong>{money(totalPorCobrarUSD, 'US$')}</strong></>}</span>
            <span style={{color:'var(--danger)',fontWeight:600}}>· Vencido: {money(totalVencidoPEN)}{totalVencidoUSD > 0 && <> · {money(totalVencidoUSD, 'US$')}</>}</span>
            <span style={{color:'var(--orange)',fontWeight:600}}>· En gestión: {money(totalEnGestionPEN)}{totalEnGestionUSD > 0 && <> · {money(totalEnGestionUSD, 'US$')}</>}</span>
          </div>
        </div>
        <div className="row" style={{gap:8}}>
          <button className="btn btn-secondary" onClick={()=>setShowFiltros(v=>!v)}>
            {I.filter} Filtros{hayFiltros?' ·':''}
          </button>
          <button className="btn btn-secondary" onClick={exportarCSV}>{I.download} Exportar</button>
        </div>
      </div>

      {/* Aging — clickable */}
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        {aging.map(b=>(
          <div key={b.key} className="kpi-card" style={{cursor:'pointer',outline:agingFilter===b.key?'2px solid var(--cyan)':'none',transition:'outline 0.15s'}}
            onClick={()=>setAgingFilter(agingFilter===b.key?null:b.key)}>
            <div className="kpi-label" style={{ paddingRight: 40 }}>{b.label}</div>
            <div className="kpi-value" style={{fontSize:20, display:'flex', flexDirection:'column', gap:4, marginTop:12}}>
              <span>{money(b.montoPEN)}</span>
              {b.montoUSD > 0 && <span style={{fontSize:16, color:'var(--fg-muted)'}}>{money(b.montoUSD, 'US$')}</span>}
            </div>
            <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:8}}>{b.count} {b.count===1?'factura':'facturas'}</div>
            <div className={'kpi-icon '+b.color}>{I.clock}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      {showFiltros && (
        <div className="card" style={{padding:16,marginTop:12}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,alignItems:'end'}}>
            <div className="input-group">
              <label>Cliente</label>
              <input className="input" value={fCliente} onChange={e=>setFCliente(e.target.value)} placeholder="Nombre del cliente..." />
            </div>
            <div className="input-group">
              <label>Estado</label>
              <select className="select" value={fEstado} onChange={e=>setFEstado(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(ESTADO_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Vence desde</label>
              <input className="input" type="date" value={fVenceDesde} onChange={e=>setFVenceDesde(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Vence hasta</label>
              <input className="input" type="date" value={fVenceHasta} onChange={e=>setFVenceHasta(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Moneda</label>
              <select className="select" value={fMoneda} onChange={e=>setFMoneda(e.target.value)}>
                <option value="">Todas</option>
                <option value="PEN">S/ Soles (PEN)</option>
                <option value="USD">US$ Dólares (USD)</option>
              </select>
            </div>
            <div className="input-group">
              <label>Mora mín. (días)</label>
              <input className="input" type="number" min="0" value={fMoraDesde} onChange={e=>setFMoraDesde(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Mora máx. (días)</label>
              <input className="input" type="number" min="0" value={fMoraHasta} onChange={e=>setFMoraHasta(e.target.value)} />
            </div>
            <button className="btn btn-secondary" onClick={()=>{setFCliente('');setFEstado('');setFMoneda('');setFVenceDesde('');setFVenceHasta('');setFMoraDesde('');setFMoraHasta('');setFGestor('');setAgingFilter(null);}}>Limpiar</button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Cliente</th><th>Factura</th><th>OS Cliente</th><th>Vencimiento</th>
                <th>Total</th><th>Saldo</th><th>Mora</th><th>Interés mora</th>
                <th>Medio pago esp.</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cxcFiltrada.length ? cxcFiltrada.map(c=>{
                const dias  = diasMoraDe(c);
                const inter = interesMoraDe(c);
                const est   = estadoDe(c);
                const meta  = ESTADO_META[est] || ESTADO_META.por_cobrar;
                const vence = c.fecha_vencimiento||c.vence||'—';
                return (
                  <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>abrirFicha(c)}>
                    <td>
                      <strong>{clienteDe(c)}</strong>
                      {Number(c.monto_retencion||0)>0 && <span className="badge badge-orange" style={{marginLeft:6,fontSize:10}}>Retención SUNAT</span>}
                    </td>
                    <td className="mono">{facturaNumeroDe(c)}</td>
                    <td className="text-muted">{osNumeroDe(c)}</td>
                    <td style={{color:dias>0?'var(--danger)':dias===0?'var(--orange)':'inherit',fontWeight:dias>0?600:400}}>{vence}</td>
                    <td className="num">{moneyCurrency(totalDe(c), c.moneda)}</td>
                    <td className="num"><strong>{moneyCurrency(saldoDe(c), c.moneda)}</strong></td>
                    <td className="num">{dias>0?<span style={{color:'var(--danger)',fontWeight:600}}>{dias}d</span>:<span className="text-subtle">—</span>}</td>
                    <td className="num">{inter>0?<span style={{color:'var(--danger)'}}>{moneyCurrency(inter, c.moneda)}</span>:<span className="text-subtle">—</span>}</td>
                    <td style={{color:'var(--fg-muted)',fontSize:12}}>{c.medio_pago_esperado||<span className="text-subtle">—</span>}</td>
                    <td><span className={'badge '+meta.cls}>{meta.label}</span></td>
                    <td onClick={e=>e.stopPropagation()} style={{whiteSpace:'nowrap'}}>
                      {saldoDe(c)>0 && <button className="btn btn-sm btn-primary" data-local-form="true" onClick={e=>abrirCobro(c,e)} style={{marginRight:6}}>Cobrar</button>}
                      {puedeEditarCxC && est !== 'anulada' && (
                        <button className="icon-btn" title="Anular CxC" style={{color:'var(--danger)'}} onClick={e=>{e.stopPropagation();setConfirmAnular(c);}}>{I.trash}</button>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="11" style={{textAlign:'center',padding:36,color:'var(--fg-muted)'}}>
                  {hayFiltros ? 'Sin resultados con los filtros aplicados.' : 'No hay cuentas por cobrar registradas.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {fichaJSX}

      {/* Modal: Revertir cobros de CxC */}
      {confirmAnular && (
        <>
          <div className="side-panel-backdrop" onClick={()=>setConfirmAnular(null)}/>
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:1001,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:12,padding:28,width:'min(460px,92vw)',boxShadow:'0 8px 32px rgba(0,0,0,0.24)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
              <span style={{color:'var(--danger)',fontSize:22}}>{I.trash}</span>
              <div style={{fontSize:17,fontWeight:700}}>Revertir cobros por error</div>
            </div>
            <div className="card" style={{padding:14,marginBottom:16,background:'var(--bg-subtle)',display:'flex',flexDirection:'column',gap:8}}>
              {[
                ['Factura', facturaNumeroDe(confirmAnular)],
                ['Cliente', clienteDe(confirmAnular)],
                ['Total',   moneyCurrency(totalDe(confirmAnular), confirmAnular.moneda)],
                ['Pagado',  moneyCurrency(pagadoDe(confirmAnular), confirmAnular.moneda)],
              ].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                  <span style={{color:'var(--fg-muted)'}}>{k}</span><strong>{v}</strong>
                </div>
              ))}
            </div>
            {(() => {
              const cobrosDeEsta = (cobrosHistorial||[]).filter(cb => cb.cxc_id === confirmAnular.id);
              const cobrosIds = cobrosDeEsta.map(cb => cb.id);
              const comisionesDeEsta = (comisiones||[]).filter(cm =>
                cm.cxc_id === confirmAnular.id || cobrosIds.includes(cm.cobro_cxc_id)
              );
              const hayComisionPagada = comisionesDeEsta.some(cm => cm.estado === 'pagada');
              const hayComisionPendiente = comisionesDeEsta.some(cm => cm.estado === 'pendiente_aprobacion' || cm.estado === 'aprobada');
              return (
                <>
                  {hayComisionPagada ? (
                    <div style={{fontSize:13,padding:'10px 12px',borderRadius:6,background:'rgba(239,68,68,0.08)',border:'1px solid var(--danger)',marginBottom:12}}>
                      <strong style={{color:'var(--danger)'}}>Bloqueado: comisión ya pagada</strong>
                      <div style={{marginTop:4,color:'var(--fg-muted)'}}>Existe una comisión pagada vinculada a este cobro. Realiza un ajuste manual en Comisiones antes de revertir.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{fontSize:13,marginBottom:12}}>
                        <div style={{marginBottom:6,fontWeight:600}}>Qué se va a revertir:</div>
                        <ul style={{margin:0,paddingLeft:18,color:'var(--fg-muted)',display:'flex',flexDirection:'column',gap:4}}>
                          <li>Los cobros registrados serán eliminados</li>
                          <li>La CxC vuelve a <strong>Por cobrar</strong> con saldo completo</li>
                          <li>Las conciliaciones bancarias serán desvinculadas</li>
                          {hayComisionPendiente && <li>Las comisiones pendientes/aprobadas serán <strong>rechazadas</strong></li>}
                        </ul>
                      </div>
                      <div style={{fontSize:13,marginBottom:16,padding:'8px 12px',borderRadius:6,background:'rgba(16,185,129,0.08)',border:'1px solid var(--green)'}}>
                        La factura y la valorización <strong>no se modifican</strong>. Podrás registrar el cobro nuevamente.
                      </div>
                    </>
                  )}
                  <div style={{fontSize:12,fontWeight:600,color:'var(--danger)',marginBottom:16}}>Esta acción no se puede deshacer.</div>
                  <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                    <button className="btn btn-secondary" onClick={()=>setConfirmAnular(null)}>Cancelar</button>
                    {!hayComisionPagada && (
                      <button className="btn btn-danger" onClick={()=>{revertirCobroCxC(confirmAnular.id);setConfirmAnular(null);}}>Revertir cobros</button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Panel: Registrar cobro */}
      {panelCobro && cobroSel && (
        <>
          <div className="side-panel-backdrop" onClick={()=>setPanelCobro(false)}/>
          <div className="side-panel" style={{width:'min(520px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Registrar cobro</div>
                <div className="font-display" style={{fontSize:18,fontWeight:700}}>{facturaNumeroDe(cobroSel)}</div>
              </div>
              <button className="icon-btn" onClick={()=>setPanelCobro(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarCobro}>
              {(() => {
                const montoForm        = Number(formCobro.monto || 0);
                const pagadoPrev       = pagadoDe(cobroSel);
                const saldoActual      = saldoDe(cobroSel);
                const saldoTras        = Math.max(0, saldoActual - montoForm);
                const hayMonto         = montoForm > 0;
                const retencionCxC     = Number(cobroSel.monto_retencion || 0);
                const hayRetencion     = retencionCxC > 0;
                const montoExcedeNeto  = hayRetencion && montoForm > saldoActual && montoForm > 0;
                return (
                  <div className="card" style={{padding:14,display:'flex',flexDirection:'column',gap:7}}>
                    {[
                      ['Cliente',          clienteDe(cobroSel),                                    null],
                      ['Factura vinculada', facturaNumeroDe(cobroSel),                             null],
                      ['Total facturado',  moneyCurrency(totalDe(cobroSel), cobroSel.moneda),      null],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{display:'flex',justifyContent:'space-between'}}>
                        <span style={{fontSize:13,color:'var(--fg-muted)'}}>{label}</span>
                        <span style={{fontSize:13,fontWeight:600,color:color||'var(--fg)'}}>{val}</span>
                      </div>
                    ))}
                    {hayRetencion && (
                      <>
                        <div style={{display:'flex',justifyContent:'space-between'}}>
                          <span style={{fontSize:13,color:'var(--warning)'}}>Retención SUNAT</span>
                          <span style={{fontSize:13,fontWeight:600,color:'var(--warning)'}}>- {moneyCurrency(retencionCxC, cobroSel.moneda)}</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',paddingBottom:4,borderBottom:'1px dashed rgba(251,191,36,0.3)'}}>
                          <span style={{fontSize:13,color:'var(--cyan)',fontWeight:600}}>Neto a cobrar</span>
                          <span style={{fontSize:13,fontWeight:700,color:'var(--cyan)'}}>{moneyCurrency(saldoActual, cobroSel.moneda)}</span>
                        </div>
                      </>
                    )}
                    {montoExcedeNeto && (
                      <div style={{fontSize:12,padding:'8px 10px',borderRadius:6,background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.35)',color:'var(--warning)'}}>
                        ⚠ El monto ingresado supera el neto esperado. El cliente retiene {moneyCurrency(retencionCxC, cobroSel.moneda)} como Agente de Retención SUNAT — no transfiere el total facturado.
                      </div>
                    )}
                    {pagadoPrev > 0 && (
                      <div style={{display:'flex',justifyContent:'space-between'}}>
                        <span style={{fontSize:13,color:'var(--fg-muted)'}}>Ya pagado</span>
                        <span style={{fontSize:13,fontWeight:600,color:'var(--green)'}}>{moneyCurrency(pagadoPrev, cobroSel.moneda)}</span>
                      </div>
                    )}
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      <span style={{fontSize:13,color:'var(--fg-muted)'}}>Este cobro</span>
                      <span style={{fontSize:13,fontWeight:600,color:hayMonto?'var(--cyan)':'var(--fg-muted)'}}>{hayMonto ? moneyCurrency(montoForm, cobroSel.moneda) : '—'}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border-subtle)',paddingTop:7,marginTop:2}}>
                      <span style={{fontSize:13,fontWeight:600}}>Saldo pendiente tras cobro</span>
                      <span style={{fontSize:14,fontWeight:700,color:saldoTras>0?'var(--orange)':'var(--green)'}}>
                        {hayMonto ? moneyCurrency(saldoTras, cobroSel.moneda) : moneyCurrency(saldoActual, cobroSel.moneda)}
                      </span>
                    </div>
                    {diasMoraDe(cobroSel) > 0 && (
                      <div style={{display:'flex',justifyContent:'space-between'}}>
                        <span style={{fontSize:13,color:'var(--fg-muted)'}}>Interés de mora</span>
                        <span style={{fontSize:13,fontWeight:600,color:'var(--danger)'}}>{moneyDCurrency(interesMoraDe(cobroSel), cobroSel.moneda)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid-2 mt-6" style={{gap:12}}>
                <div className="input-group">
                  <label>Monto cobrado <span style={{color:'var(--danger)'}}>*</span></label>
                  <input className="input num" type="number" min="0.01" step="0.01" required
                    value={formCobro.monto} onChange={e=>{setFormCobro(v=>({...v,monto:e.target.value}));setMontoError('');}} autoFocus/>
                  {montoError && <div style={{color:'var(--danger)',fontSize:12,marginTop:4}}>{montoError}</div>}
                </div>
                <div className="input-group">
                  <label>Fecha de cobro <span style={{color:'var(--danger)'}}>*</span></label>
                  <input className="input" type="date" required max={today} value={formCobro.fecha_cobro} onChange={e=>setFormCobro(v=>({...v,fecha_cobro:e.target.value}))}/>
                </div>
              </div>

              <div style={{marginTop:12,padding:'10px 12px',borderRadius:6,border:'1px solid var(--border-subtle)',background:'var(--bg-subtle)'}}>
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13}}>
                  <input type="checkbox" checked={formCobro.incluye_mora} onChange={e=>setFormCobro(v=>({...v,incluye_mora:e.target.checked}))}/>
                  Incluye interés de mora en este cobro
                </label>
                {formCobro.incluye_mora && (
                  <div className="input-group" style={{marginTop:8}}>
                    <label>Monto mora cobrado</label>
                    <input className="input num" type="number" min="0" step="0.01"
                      value={formCobro.monto_mora} onChange={e=>setFormCobro(v=>({...v,monto_mora:e.target.value}))}
                      placeholder={diasMoraDe(cobroSel)>0 ? String(interesMoraDe(cobroSel).toFixed(2)) : '0.00'}/>
                  </div>
                )}
              </div>

              <div className="grid-2 mt-6" style={{gap:12}}>
                <div className="input-group">
                  <label>Medio de pago <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="select" required value={formCobro.medio_pago} onChange={e=>setFormCobro(v=>({...v,medio_pago:e.target.value}))}>
                    <option value="">Seleccionar...</option>
                    <option>Transferencia bancaria</option>
                    <option>Depósito</option>
                    <option>Cheque</option>
                    <option>Efectivo</option>
                    <option>Otro</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Cuenta bancaria destino</label>
                  {cuentasBancariasActivas.length > 0 ? (
                    <select className="select" value={formCobro.cuenta_bancaria} onChange={e=>setFormCobro(v=>({...v,cuenta_bancaria:e.target.value}))}>
                      <option value="">Seleccionar cuenta...</option>
                      {cuentasBancariasActivas.map(cb=>(
                        <option key={cb.id} value={cb.id}>
                          {cb.nombre} — {cb.banco} — {cb.moneda==='PEN'?'Soles':cb.moneda==='USD'?'Dólares':cb.moneda}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{fontSize:12,color:'var(--fg-muted)',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:6,background:'var(--bg-subtle)'}}>
                      No hay cuentas bancarias configuradas.{' '}
                      <button type="button" className="btn btn-ghost" style={{padding:0,fontSize:12,color:'var(--cyan)'}} onClick={()=>navigate('parametros')}>Ve a Parámetros Generales para agregarlas.</button>
                    </div>
                  )}
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>N° operación / referencia {['Transferencia bancaria','Depósito'].includes(formCobro.medio_pago)&&<span style={{color:'var(--danger)'}}>*</span>}</label>
                  <input className="input" value={formCobro.numero_operacion} onChange={e=>setFormCobro(v=>({...v,numero_operacion:e.target.value}))} placeholder="N° transferencia, depósito, cheque..."/>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Notas <span style={{color:'var(--fg-muted)',fontWeight:400}}>(opcional)</span></label>
                  <textarea className="input" rows={2} value={formCobro.notas} onChange={e=>setFormCobro(v=>({...v,notas:e.target.value}))}/>
                </div>
              </div>

              <div className="row mt-6" style={{justifyContent:'flex-end',gap:10}}>
                <button type="button" className="btn btn-secondary" onClick={()=>setPanelCobro(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.check} Registrar cobro</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Panel: Registrar gestión */}
      {panelGestion && (
        <>
          <div className="side-panel-backdrop" onClick={()=>setPanelGestion(false)}/>
          <div className="side-panel" style={{width:'min(520px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Gestión de cobranza</div>
                <div className="font-display" style={{fontSize:16,fontWeight:700}}>{clienteDe(gestionSel)} · {facturaNumeroDe(gestionSel)}</div>
              </div>
              <button className="icon-btn" onClick={()=>setPanelGestion(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarGestion}>
              <div className="grid-2" style={{gap:12}}>
                <div className="input-group">
                  <label>Tipo de gestión <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="select" required value={formGestion.tipo_gestion} onChange={e=>setFormGestion(v=>({...v,tipo_gestion:e.target.value}))}>
                    <option value="">Seleccionar...</option>
                    <option value="llamada_telefonica">Llamada telefónica</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="visita_presencial">Visita presencial</option>
                    <option value="carta_notarial">Carta notarial</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Resultado <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="select" required value={formGestion.resultado} onChange={e=>setFormGestion(v=>({...v,resultado:e.target.value}))}>
                    <option value="">Seleccionar...</option>
                    <option value="promesa_pago">Promesa de pago</option>
                    <option value="no_contesta">No contesta</option>
                    <option value="numero_equivocado">Número equivocado</option>
                    <option value="cliente_solicita_plazo">Cliente solicita plazo</option>
                    <option value="cliente_disputa_monto">Cliente disputa monto</option>
                    <option value="pagara_en_fecha_acordada">Pagará en fecha acordada</option>
                    <option value="sin_respuesta">Sin respuesta</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              {['promesa_pago','pagara_en_fecha_acordada'].includes(formGestion.resultado) && (
                <div className="input-group mt-6">
                  <label>Fecha acordada de pago <span style={{color:'var(--danger)'}}>*</span></label>
                  <input className="input" type="date" value={formGestion.fecha_acordada_pago} onChange={e=>setFormGestion(v=>({...v,fecha_acordada_pago:e.target.value}))}/>
                </div>
              )}

              <div className="input-group mt-6">
                <label>Fecha próxima acción {['promesa_pago','pagara_en_fecha_acordada'].includes(formGestion.resultado)&&<span style={{color:'var(--danger)'}}>*</span>}</label>
                <input className="input" type="date" value={formGestion.fecha_proxima_accion} onChange={e=>setFormGestion(v=>({...v,fecha_proxima_accion:e.target.value}))}/>
              </div>

              <div className="input-group mt-6">
                <label>Notas <span style={{color:'var(--danger)'}}>*</span></label>
                <textarea className="input" rows={4} required value={formGestion.notas} onChange={e=>setFormGestion(v=>({...v,notas:e.target.value}))} placeholder="Detalla la gestión realizada, quién atendió, acuerdos..."/>
              </div>

              <div className="row mt-6" style={{justifyContent:'flex-end',gap:10}}>
                <button type="button" className="btn btn-secondary" onClick={()=>setPanelGestion(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.check} Guardar gestión</button>
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

const CATS_INGRESO = [
  { v: 'cobro_factura', l: 'Cobro de factura' },
  { v: 'anticipo_cliente', l: 'Anticipo de cliente' },
  { v: 'transferencia', l: 'Transferencia entre cuentas' },
  { v: 'otros_ingresos', l: 'Otros ingresos' },
];
const CATS_EGRESO = [
  { v: 'pago_proveedor', l: 'Pago a proveedor (CxP)' },
  { v: 'planilla', l: 'Planilla' },
  { v: 'cargas_sociales', l: 'Cargas sociales' },
  { v: 'cuota_financiamiento', l: 'Cuota de financiamiento' },
  { v: 'caja_chica', l: 'Caja chica' },
  { v: 'gasto_operativo', l: 'Gasto operativo' },
  { v: 'transferencia', l: 'Transferencia entre cuentas' },
  { v: 'otros_egresos', l: 'Otros egresos' },
];
const catLabel = v => [...CATS_INGRESO, ...CATS_EGRESO].find(c => c.v === v)?.l || v || '—';

function BarChartProyeccion({ semanas, saldoInicial }) {
  const W = 700, H = 160, PX = 30, PY = 16;
  const iW = W - PX * 2, iH = H - PY * 2;
  const n = semanas.length;
  const cW = iW / n;
  const bW = Math.max(3, cW * 0.3);
  const maxBar = Math.max(1, ...semanas.flatMap(s => [s.ingresos, s.egresos]));
  const bScale = iH / maxBar;
  let saldo = saldoInicial;
  const saldos = semanas.map(s => { saldo += s.ingresos - s.egresos; return saldo; });
  const sMin = Math.min(saldoInicial, ...saldos, 0);
  const sMax = Math.max(saldoInicial, ...saldos, 1);
  const sRange = sMax - sMin || 1;
  const sY = v => PY + iH - ((v - sMin) / sRange) * iH;
  const pts = [`${PX},${sY(saldoInicial)}`, ...semanas.map((_, i) => `${PX + (i + 0.5) * cW},${sY(saldos[i])}`)].join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} style={{width:'100%', display:'block', marginTop:8}}>
      {[0,0.25,0.5,0.75,1].map(f => (
        <line key={f} x1={PX} y1={PY + iH*(1-f)} x2={W-PX} y2={PY + iH*(1-f)} stroke="var(--border)" strokeWidth={0.5}/>
      ))}
      {semanas.map((s, i) => {
        const x = PX + i * cW;
        return (
          <g key={i}>
            <rect x={x + cW*0.1} y={PY + iH - s.ingresos*bScale} width={bW} height={Math.max(0, s.ingresos*bScale)} fill="rgba(0,200,100,0.65)" rx={2}/>
            <rect x={x + cW*0.1 + bW + 2} y={PY + iH - s.egresos*bScale} width={bW} height={Math.max(0, s.egresos*bScale)} fill="rgba(255,120,0,0.65)" rx={2}/>
            <text x={x + cW/2} y={H + 20} textAnchor="middle" fontSize={8} fill="var(--muted)">{s.label}</text>
          </g>
        );
      })}
      <polyline points={pts} fill="none" stroke="var(--cyan)" strokeWidth={2} strokeLinejoin="round"/>
      {semanas.map((_, i) => (
        <circle key={i} cx={PX + (i+0.5)*cW} cy={sY(saldos[i])} r={3} fill={saldos[i] < 0 ? 'var(--danger)' : 'var(--cyan)'}/>
      ))}
      <text x={PX} y={PY - 4} fontSize={8} fill="var(--muted)">▲ Saldo (línea cyan) · Ingresos (verde) · Egresos (naranja)</text>
    </svg>
  );
}

function ManualMovimientoPanel({ cuentasBancarias, onClose, onGuardar }) {
  const empty = { tipo: 'ingreso', fecha: new Date().toISOString().slice(0,10), descripcion: '', monto: '', categoria: '', cuenta_origen_id: '', cuenta_destino_id: '', referencia: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(p => ({...p, [k]: e.target.value}));
  const cuentasActivas = (cuentasBancarias || []).filter(c => c.estado === 'activo');
  const cats = form.tipo === 'egreso' ? CATS_EGRESO : form.tipo === 'ingreso' ? CATS_INGRESO : [...CATS_INGRESO.slice(-1), ...CATS_EGRESO.slice(-1)];

  const guardar = async e => {
    e.preventDefault();
    if (!form.descripcion.trim() || !Number(form.monto)) return;
    setSaving(true);
    try { await onGuardar(form); onClose(); } finally { setSaving(false); }
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose}/>
      <div className="side-panel" style={{width:'min(520px, 96vw)'}}>
        <div className="side-panel-head">
          <div><div className="eyebrow">Tesorería</div><div style={{fontSize:20, fontWeight:700}}>Movimiento manual</div></div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <form className="side-panel-body" onSubmit={guardar} data-local-form="true" style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="input-group"><label>Tipo *</label>
            <select className="input" value={form.tipo} onChange={e => setForm(p => ({...p, tipo:e.target.value, categoria:''}))}>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
              <option value="transferencia">Transferencia entre cuentas</option>
            </select>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div className="input-group"><label>Fecha *</label><input className="input" type="date" value={form.fecha} onChange={set('fecha')} required/></div>
            <div className="input-group"><label>Monto *</label><input className="input" type="number" step="0.01" min="0.01" value={form.monto} onChange={set('monto')} required/></div>
          </div>
          <div className="input-group"><label>Descripción *</label><input className="input" value={form.descripcion} onChange={set('descripcion')} placeholder="Detalle del movimiento" required/></div>
          <div className="input-group"><label>Categoría</label>
            <select className="input" value={form.categoria} onChange={set('categoria')}>
              <option value="">Sin categoría</option>
              {cats.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          {(form.tipo === 'egreso' || form.tipo === 'transferencia') && (
            <div className="input-group"><label>Cuenta origen</label>
              <select className="input" value={form.cuenta_origen_id} onChange={set('cuenta_origen_id')}>
                <option value="">Seleccionar...</option>
                {cuentasActivas.map(c => <option key={c.id} value={c.id}>{c.nombre} — {c.banco} ({c.moneda})</option>)}
              </select>
            </div>
          )}
          {(form.tipo === 'ingreso' || form.tipo === 'transferencia') && (
            <div className="input-group"><label>Cuenta destino</label>
              <select className="input" value={form.cuenta_destino_id} onChange={set('cuenta_destino_id')}>
                <option value="">Seleccionar...</option>
                {cuentasActivas.map(c => <option key={c.id} value={c.id}>{c.nombre} — {c.banco} ({c.moneda})</option>)}
              </select>
            </div>
          )}
          <div className="input-group"><label>Referencia</label><input className="input" value={form.referencia} onChange={set('referencia')} placeholder="N° operación, cheque, etc."/></div>
          <div className="input-group"><label>Adjuntar comprobante</label><input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png"/><div style={{fontSize:11, color:'var(--muted)', marginTop:4}}>Opcional — subida próximamente.</div></div>
          <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:8}}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : `${I.plus} Registrar`}</button>
          </div>
        </form>
      </div>
    </>
  );
}

function ImportarExtractoModal({ cuentasBancarias, onClose }) {
  const [step, setStep] = useState(1);
  const [cuentaId, setCuentaId] = useState('');
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [csvRows, setCsvRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [colMap, setColMap] = useState({ fecha: '', descripcion: '', monto: '', tipo: '' });
  const [errores, setErrores] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };
    const sep = lines[0].includes(';') ? ';' : ',';
    const hs = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(l => {
      const vals = l.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
      return Object.fromEntries(hs.map((h, i) => [h, vals[i] || '']));
    });
    return { headers: hs, rows };
  };

  const onFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const { headers: hs, rows } = parseCSV(ev.target.result);
      setHeaders(hs);
      setCsvRows(rows);
      const guess = f => hs.find(h => h.toLowerCase().includes(f)) || '';
      setColMap({ fecha: guess('fecha') || guess('date'), descripcion: guess('desc') || guess('concepto') || guess('detalle'), monto: guess('monto') || guess('importe') || guess('amount'), tipo: guess('tipo') || guess('type') });
      setStep(2);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const preview = useMemo(() => csvRows.slice(0, 5).map(r => ({
    fecha: r[colMap.fecha] || '',
    descripcion: r[colMap.descripcion] || '',
    monto: r[colMap.monto] || '',
    tipo: r[colMap.tipo] || 'credito',
  })), [csvRows, colMap]);

  const validar = () => {
    const errs = [];
    csvRows.forEach((r, i) => {
      if (!r[colMap.fecha]) errs.push(`Fila ${i+2}: falta fecha`);
      if (isNaN(Number(r[colMap.monto]))) errs.push(`Fila ${i+2}: monto inválido "${r[colMap.monto]}"`);
    });
    setErrores(errs);
    setStep(3);
  };

  const confirmar = () => {
    setImporting(true);
    setTimeout(() => { setImporting(false); onClose(); }, 800);
  };

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{background:'var(--surface)', borderRadius:12, width:'min(640px,96vw)', maxHeight:'90vh', overflowY:'auto', padding:24}}>
        <div className="row" style={{justifyContent:'space-between', marginBottom:16}}>
          <h2 style={{margin:0}}>Importar extracto bancario</h2>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="row" style={{gap:8, marginBottom:20}}>
          {[1,2,3,4].map(s => <div key={s} style={{flex:1, height:4, borderRadius:2, background: step >= s ? 'var(--cyan)' : 'var(--border)'}} />)}
        </div>
        {step === 1 && (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            <div className="input-group"><label>Cuenta bancaria *</label>
              <select className="input" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
                <option value="">Seleccionar cuenta...</option>
                {(cuentasBancarias || []).filter(c => c.estado === 'activo').map(c => <option key={c.id} value={c.id}>{c.nombre} — {c.banco} ({c.moneda})</option>)}
              </select>
            </div>
            <div className="input-group"><label>Período</label><input className="input" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} /></div>
            <div className="input-group"><label>Archivo CSV</label><input ref={fileRef} type="file" accept=".csv,.txt" className="input" onChange={onFile} /></div>
            <div style={{fontSize:12, color:'var(--muted)'}}>Formatos soportados: CSV con separador coma o punto y coma. PDF: próximamente.</div>
          </div>
        )}
        {step === 2 && (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            <p style={{margin:0, fontSize:13, color:'var(--muted)'}}>Mapea las columnas de tu archivo a los campos del sistema. ({csvRows.length} filas detectadas)</p>
            {['fecha','descripcion','monto','tipo'].map(f => (
              <div className="input-group" key={f}><label style={{textTransform:'capitalize'}}>{f}</label>
                <select className="input" value={colMap[f]} onChange={e => setColMap(p => ({...p, [f]: e.target.value}))}>
                  <option value="">-- no mapear --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <p style={{margin:0, fontSize:12, color:'var(--muted)'}}>Vista previa (primeras 5 filas):</p>
            <div className="table-wrap" style={{maxHeight:160}}>
              <table className="tbl"><thead><tr><th>Fecha</th><th>Descripción</th><th>Monto</th><th>Tipo</th></tr></thead>
                <tbody>{preview.map((r,i) => <tr key={i}><td>{r.fecha}</td><td>{r.descripcion}</td><td>{r.monto}</td><td>{r.tipo}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="row" style={{justifyContent:'flex-end', gap:8}}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>Atrás</button>
              <button className="btn btn-primary" onClick={validar} disabled={!colMap.fecha || !colMap.monto}>Validar</button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {errores.length === 0 ? (
              <div className="row" style={{gap:8, padding:12, background:'rgba(0,200,100,0.08)', borderRadius:8}}>
                <span style={{color:'var(--green)', fontSize:20}}>{I.check}</span>
                <span style={{color:'var(--green)'}}>Validación correcta — {csvRows.length} movimientos listos para importar.</span>
              </div>
            ) : (
              <>
                <div style={{color:'var(--danger)', fontWeight:600}}>{errores.length} error(es) encontrados:</div>
                <ul style={{margin:0, paddingLeft:16, fontSize:12, color:'var(--danger)'}}>{errores.slice(0,10).map((e,i)=><li key={i}>{e}</li>)}</ul>
                {errores.length > 10 && <div style={{fontSize:12, color:'var(--muted)'}}>... y {errores.length - 10} más.</div>}
              </>
            )}
            <div className="row" style={{justifyContent:'flex-end', gap:8}}>
              <button className="btn btn-secondary" onClick={() => setStep(2)}>Atrás</button>
              <button className="btn btn-primary" onClick={() => setStep(4)} disabled={errores.length > 0}>Continuar</button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            <div style={{padding:16, background:'var(--surface-2)', borderRadius:8, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <div><div style={{fontSize:11, color:'var(--muted)'}}>Cuenta</div><strong>{(cuentasBancarias||[]).find(c=>c.id===cuentaId)?.nombre || cuentaId}</strong></div>
              <div><div style={{fontSize:11, color:'var(--muted)'}}>Período</div><strong>{periodo}</strong></div>
              <div><div style={{fontSize:11, color:'var(--muted)'}}>Movimientos</div><strong>{csvRows.length}</strong></div>
              <div><div style={{fontSize:11, color:'var(--muted)'}}>Estado</div><span className="badge badge-green">Sin errores</span></div>
            </div>
            <p style={{margin:0, fontSize:13, color:'var(--muted)'}}>Al confirmar, los movimientos se importarán como extracto bancario y estarán disponibles para conciliar.</p>
            <div className="row" style={{justifyContent:'flex-end', gap:8}}>
              <button className="btn btn-secondary" onClick={() => setStep(3)}>Atrás</button>
              <button className="btn btn-primary" onClick={confirmar} disabled={importing}>{importing ? 'Importando...' : `${I.check} Confirmar importación`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tesoreria() {
  const [tab, setTab] = useState('match');
  const [panel, setPanel] = useState(false);
  const [movSel, setMovSel] = useState(null);
  const [target, setTarget] = useState('');
  const [conDiferencia, setConDiferencia] = useState(false);
  const [motifoDif, setMotivoDif] = useState('');
  const [montoDif, setMontoDif] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [panelManual, setPanelManual] = useState(false);
  const [resumenCuenta, setResumenCuenta] = useState('');
  const [resumenDesde, setResumenDesde] = useState(new Date().toISOString().slice(0,7) + '-01');
  const [resumenHasta, setResumenHasta] = useState(new Date().toISOString().slice(0,10));
  const {
    movimientosTesoreria, movimientosBanco, cxc, cxp, cuentas, cuentasBancarias = [],
    conciliarMovimientoBancoConDocumento, empresa, addNotificacion,
    registrarMovimientoManual, empresaConfig, financiamientos = [], periodosNomina = [],
  } = useApp();

  const hoy = new Date().toISOString().slice(0, 7);
  const tesoreria = buildTesoreriaSummary({
    movimientos: movimientosTesoreria,
    empresa,
    periodo: hoy,
    saldosIniciales: { PEN: 0 },
  });

  const cuentasActivas = useMemo(() => (cuentasBancarias || []).filter(c => c.estado === 'activo'), [cuentasBancarias]);

  const saldoPorCuenta = useMemo(() => {
    return cuentasActivas.map(cb => {
      const movsCuenta = (movimientosTesoreria || []).filter(m => m.cuenta_bancaria_id === cb.id);
      const ingresos = movsCuenta.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto || 0), 0);
      const egresos = movsCuenta.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto || 0), 0);
      return { ...cb, saldo: Number(cb.saldo_inicial || 0) + ingresos - egresos };
    });
  }, [cuentasActivas, movimientosTesoreria]);

  const totalPEN = useMemo(() => saldoPorCuenta.filter(c => c.moneda === 'PEN').reduce((s, c) => s + c.saldo, 0), [saldoPorCuenta]);
  const totalUSD = useMemo(() => saldoPorCuenta.filter(c => c.moneda === 'USD').reduce((s, c) => s + c.saldo, 0), [saldoPorCuenta]);

  const pendienteCxC = useMemo(() => (cxc || []).filter(c => !['cobrada','anulada'].includes(c.estado)).reduce((s, c) => s + Number(c.saldo ?? c.monto_total ?? 0), 0), [cxc]);
  const pendienteCxP = useMemo(() => (cxp || []).filter(p => !['pagada','anulada'].includes(p.estado)).reduce((s, p) => s + Number(p.saldo ?? p.monto_total ?? 0), 0), [cxp]);

  const movBancoFiltrado = useMemo(() => {
    const all = movimientosBanco || [];
    if (filtroEstado === 'conciliados') return all.filter(m => m.conciliado);
    if (filtroEstado === 'pendientes') return all.filter(m => !m.conciliado);
    return all;
  }, [movimientosBanco, filtroEstado]);

  const vinculados = (movimientosBanco || []).filter(m => m.conciliado).length;
  const pendientes = (movimientosBanco || []).length - vinculados;
  const pctConciliado = (movimientosBanco || []).length > 0 ? Math.round(vinculados / (movimientosBanco || []).length * 100) : 0;

  const clienteNombre = id => {
    const c = (cuentas || []).find(x => x.id === id);
    return c?.razon_social || c?.nombre_comercial || '-';
  };
  const saldoCxc = c => Number(c.saldo ?? c.monto_total ?? 0);
  const saldoCxp = p => Number(p.saldo ?? p.monto_total ?? 0);

  const candidatos = useMemo(() => {
    if (!movSel) return [];
    const monto = Number(movSel.monto || 0);
    const moneda = movSel.moneda || 'PEN';
    const pct2 = monto * 0.02;
    if (movSel.tipo === 'credito') {
      return (cxc || []).filter(c => saldoCxc(c) > 0 && (c.moneda || 'PEN') === moneda).map(c => {
        const retencionCxCMatch = Number(c.monto_retencion || 0);
        const montoEsperado = retencionCxCMatch > 0
          ? Math.max(0, saldoCxc(c))
          : saldoCxc(c);
        return {
          tipo: 'cxc', id: c.id,
          label: `${c.facturas?.numero || c.factura || c.id} — ${clienteNombre(c.cuenta_id)}${retencionCxCMatch > 0 ? ' (neto)' : ''}`,
          monto: saldoCxc(c),
          diff: Math.abs(montoEsperado - monto),
          sugerido: Math.abs(montoEsperado - monto) <= pct2,
        };
      }).sort((a, b) => a.diff - b.diff);
    }
    return (cxp || []).filter(p => saldoCxp(p) > 0 && (p.moneda || 'PEN') === moneda).map(p => ({
      tipo: 'cxp', id: p.id,
      label: `${p.factura_numero || p.id} — ${p.proveedores?.razon_social || 'Proveedor'}`,
      monto: saldoCxp(p),
      diff: Math.abs(saldoCxp(p) - monto),
      sugerido: Math.abs(saldoCxp(p) - monto) <= pct2,
    })).sort((a, b) => a.diff - b.diff);
  }, [movSel, cxc, cxp, cuentas]);

  const sugeridos = candidatos.filter(c => c.sugerido);

  const abrirMatch = mov => { setMovSel(mov); setPanel(true); setTarget(''); setConDiferencia(false); setMotivoDif(''); setMontoDif(''); };

  const confirmar = async e => {
    e.preventDefault();
    const cand = candidatos.find(c => `${c.tipo}:${c.id}` === target);
    if (!movSel || !cand) return;
    await conciliarMovimientoBancoConDocumento(movSel.id, cand.tipo, cand.id);
    if (conDiferencia && Number(montoDif) !== 0) {
      addNotificacion(`Diferencia de ${money(Math.abs(Number(montoDif)))} registrada: ${motifoDif || 'sin motivo'}.`);
    }
    setPanel(false); setMovSel(null);
  };

  const mesActual = new Date().toISOString().slice(0, 7);
  const cobrosDelMes = (movimientosTesoreria || []).filter(m => m.tipo === 'ingreso' && (m.fecha || '').startsWith(mesActual)).reduce((s, m) => s + Number(m.monto || 0), 0);
  const pagosDelMes = (movimientosTesoreria || []).filter(m => m.tipo === 'egreso' && (m.fecha || '').startsWith(mesActual)).reduce((s, m) => s + Number(m.monto || 0), 0);

  // Resumen tab: filtered movements with running balance
  const movResumen = useMemo(() => {
    let movs = (movimientosTesoreria || [])
      .filter(m => m.estado !== 'anulado')
      .filter(m => !resumenCuenta || m.cuenta_bancaria_id === resumenCuenta)
      .filter(m => (!resumenDesde || (m.fecha || '') >= resumenDesde) && (!resumenHasta || (m.fecha || '') <= resumenHasta))
      .slice().sort((a, b) => (a.fecha || '') < (b.fecha || '') ? -1 : 1);

    const cuentaObj = cuentasActivas.find(c => c.id === resumenCuenta);
    let saldoAcum = resumenCuenta
      ? Number(cuentaObj?.saldo_inicial || 0)
      : cuentasActivas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0);

    return movs.map(m => {
      saldoAcum = m.tipo === 'ingreso' ? saldoAcum + Number(m.monto || 0) : saldoAcum - Number(m.monto || 0);
      return { ...m, saldoAcum };
    });
  }, [movimientosTesoreria, resumenCuenta, resumenDesde, resumenHasta, cuentasActivas]);

  // Proyección 90 días (13 semanas)
  const proyeccionSemanas = useMemo(() => {
    const hoyDate = new Date();
    return Array.from({ length: 13 }, (_, i) => {
      const ini = new Date(hoyDate); ini.setDate(ini.getDate() + i * 7);
      const fin = new Date(ini); fin.setDate(fin.getDate() + 6);
      const s = ini.toISOString().slice(0, 10);
      const e = fin.toISOString().slice(0, 10);
      let ingresos = 0, egresos = 0;
      (cxc || []).filter(c => !['cobrada','anulada'].includes(c.estado) && c.fecha_vencimiento >= s && c.fecha_vencimiento <= e)
        .forEach(c => { ingresos += Number(c.saldo ?? c.monto_total ?? 0); });
      (cxp || []).filter(p => !['pagada','anulada'].includes(p.estado) && p.fecha_vencimiento >= s && p.fecha_vencimiento <= e)
        .forEach(p => { egresos += Number(p.saldo ?? p.monto_total ?? 0); });
      const ultimaNomina = (periodosNomina || []).slice(-1)[0];
      if (i === 4 && ultimaNomina) egresos += Number(ultimaNomina.total_neto || ultimaNomina.total || 0);
      return { label: `S${i+1}`, startStr: s, endStr: e, ingresos, egresos };
    });
  }, [cxc, cxp, periodosNomina]);

  const bloques90 = useMemo(() => [0,1,2].map(b => {
    const sems = proyeccionSemanas.slice(b * 4, b * 4 + (b === 2 ? 5 : 4));
    const ingresos = sems.reduce((s, x) => s + x.ingresos, 0);
    const egresos = sems.reduce((s, x) => s + x.egresos, 0);
    return { label: `Días ${b*30+1}–${(b+1)*30}`, ingresos, egresos, flujoNeto: ingresos - egresos };
  }), [proyeccionSemanas]);

  const umbralMinimo = Number(empresaConfig?.umbral_liquidez_minimo || 0);
  const alertaLiquidez = useMemo(() => {
    if (!umbralMinimo) return null;
    let saldo = totalPEN;
    for (let i = 0; i < proyeccionSemanas.length; i++) {
      saldo += proyeccionSemanas[i].ingresos - proyeccionSemanas[i].egresos;
      if (saldo < umbralMinimo) {
        return { saldo, semana: i + 1, fecha: proyeccionSemanas[i].startStr };
      }
    }
    return null;
  }, [proyeccionSemanas, totalPEN, umbralMinimo]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tesorería</h1>
          <div className="page-sub">{vinculados}/{(movimientosBanco||[]).length} conciliados · {pctConciliado}%</div>
        </div>
        <div className="row" style={{gap:8}}>
          <button className="btn btn-secondary" onClick={() => setPanelManual(true)}>{I.plus} Movimiento manual</button>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>{I.download} Importar extracto</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card">
          <div className="kpi-label">Saldo disponible (PEN)</div>
          <div className="kpi-value" style={{fontSize:20}}>{money(totalPEN)}</div>
          {totalUSD > 0 && <div style={{fontSize:12, color:'var(--muted)', marginTop:2}}>+ USD {totalUSD.toLocaleString('es-PE',{minimumFractionDigits:2})}</div>}
          <div className="kpi-icon cyan">{I.bank}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cobros del mes</div>
          <div className="kpi-value" style={{fontSize:20, color:'var(--green)'}}>{money(cobrosDelMes)}</div>
          <div className="kpi-icon green">{I.arrowDown}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pagos del mes</div>
          <div className="kpi-value" style={{fontSize:20, color:'var(--orange)'}}>{money(pagosDelMes)}</div>
          <div className="kpi-icon orange">{I.arrowUp}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Por cobrar pendiente</div>
          <div className="kpi-value" style={{fontSize:20, color:'var(--orange)'}}>{money(pendienteCxC)}</div>
          <div style={{fontSize:11, color:'var(--muted)'}}>CxP pendiente: {money(pendienteCxP)}</div>
          <div className="kpi-icon orange">{I.clock}</div>
        </div>
      </div>

      {/* Saldo por cuenta */}
      {saldoPorCuenta.length > 0 && (
        <div style={{display:'flex', gap:10, flexWrap:'wrap', marginTop:12}}>
          {saldoPorCuenta.map(cb => (
            <div key={cb.id} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 18px', minWidth:180, flex:'1 1 180px'}}>
              <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:1}}>{cb.banco}</div>
              <div style={{fontWeight:700, fontSize:15, marginTop:2}}>{cb.nombre}</div>
              <div style={{fontSize:21, fontWeight:800, color: cb.saldo >= 0 ? 'var(--cyan)' : 'var(--danger)', marginTop:4}}>{cb.moneda} {cb.saldo.toLocaleString('es-PE',{minimumFractionDigits:2})}</div>
              <div style={{fontSize:11, color:'var(--muted)', marginTop:2, textTransform:'capitalize'}}>{cb.tipo} · {cb.moneda}</div>
            </div>
          ))}
        </div>
      )}

      <div className="tabs mt-6">
        {[{id:'match',label:'Match Bancario'},{id:'resumen',label:'Flujo de caja'},{id:'extracto',label:'Extracto banco'}].map(t => (
          <div key={t.id} className={'tab '+(tab===t.id?'active':'')} onClick={()=>setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {tab === 'match' && (
        <>
          <div className="row" style={{gap:8, marginBottom:12, flexWrap:'wrap'}}>
            {[{v:'todos',l:'Todos'},{v:'pendientes',l:`Pendientes (${pendientes})`},{v:'conciliados',l:`Conciliados (${vinculados})`}].map(f=>(
              <button key={f.v} className={'btn btn-sm '+(filtroEstado===f.v?'btn-primary':'btn-secondary')} onClick={()=>setFiltroEstado(f.v)}>{f.l}</button>
            ))}
            <div style={{marginLeft:'auto', fontSize:13, color:'var(--muted)', alignSelf:'center'}}>
              Conciliación: <strong style={{color: pctConciliado === 100 ? 'var(--green)' : pctConciliado > 50 ? 'var(--orange)' : 'var(--danger)'}}>{pctConciliado}%</strong>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
            {/* Sistema */}
            <div className="card">
              <div className="card-head"><h3>Sistema (movimientos tesorería)</h3><span className="badge badge-cyan">{(movimientosTesoreria||[]).length}</span></div>
              <div className="table-wrap" style={{maxHeight:420}}>
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th></tr></thead>
                  <tbody>{(movimientosTesoreria||[]).slice(0,50).map((m,i) => (
                    <tr key={m.id||i}>
                      <td className="text-muted" style={{fontSize:12}}>{m.fecha}</td>
                      <td style={{fontSize:12}}>{m.descripcion}</td>
                      <td><span className={'badge '+(m.tipo==='ingreso'?'badge-green':'badge-orange')} style={{fontSize:10}}>{m.tipo}</span></td>
                      <td className="num" style={{fontSize:12, color:m.tipo==='ingreso'?'var(--green)':'var(--fg)'}}>{m.tipo==='ingreso'?'+':'-'}{money(m.monto)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
            {/* Extracto bancario */}
            <div className="card">
              <div className="card-head"><h3>Extracto bancario</h3><span className={'badge '+(pendientes>0?'badge-orange':'badge-green')}>{pendientes} pendientes</span></div>
              <div className="table-wrap" style={{maxHeight:420}}>
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th></th></tr></thead>
                  <tbody>{movBancoFiltrado.map((m, i) => (
                    <tr key={m.id||i} style={{background: m.conciliado ? 'transparent' : sugeridos.length > 0 && !m.conciliado ? 'rgba(255,160,0,0.04)' : 'transparent'}}>
                      <td className="text-muted" style={{fontSize:12}}>{m.fecha}</td>
                      <td style={{fontSize:12}}><strong>{m.descripcion || m.desc}</strong></td>
                      <td><span className={'badge '+(m.tipo==='credito'?'badge-green':'badge-orange')} style={{fontSize:10}}>{m.tipo==='credito'?'Crédito':'Débito'}</span></td>
                      <td className="num" style={{fontSize:12, color:m.tipo==='credito'?'var(--green)':'var(--fg)'}}>{m.tipo==='credito'?'+':'-'}{money(m.monto)}</td>
                      <td>
                        {m.conciliado
                          ? <span style={{fontSize:11, color:'var(--green)'}}>{I.check}</span>
                          : <button className="btn btn-sm btn-primary" data-local-form="true" style={{fontSize:11, padding:'2px 8px'}} onClick={() => abrirMatch(m)}>Conciliar</button>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {movBancoFiltrado.length === 0 && (
                <div style={{padding:'32px 16px', textAlign:'center', color:'var(--muted)', fontSize:13}}>
                  {filtroEstado === 'pendientes' ? 'Todos los movimientos conciliados' : 'Sin movimientos. Importa un extracto para comenzar.'}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'resumen' && (
        <>
          {/* Filters */}
          <div className="row" style={{gap:10, flexWrap:'wrap', marginBottom:12}}>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:12, color:'var(--muted)'}}>Cuenta:</span>
              <select className="input" style={{fontSize:12, padding:'4px 8px', minWidth:180}} value={resumenCuenta} onChange={e=>setResumenCuenta(e.target.value)}>
                <option value="">Todas las cuentas</option>
                {cuentasActivas.map(c=><option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
              </select>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:12, color:'var(--muted)'}}>Desde:</span>
              <input className="input" type="date" style={{fontSize:12, padding:'4px 8px'}} value={resumenDesde} onChange={e=>setResumenDesde(e.target.value)}/>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:12, color:'var(--muted)'}}>Hasta:</span>
              <input className="input" type="date" style={{fontSize:12, padding:'4px 8px'}} value={resumenHasta} onChange={e=>setResumenHasta(e.target.value)}/>
            </div>
            <div style={{marginLeft:'auto', fontSize:12, color:'var(--muted)'}}>
              {movResumen.length} movimientos · Saldo final: <strong style={{color:'var(--cyan)'}}>{money(movResumen[movResumen.length-1]?.saldoAcum ?? 0)}</strong>
            </div>
          </div>

          {/* Cash flow table */}
          <div className="card">
            <div className="card-head"><h3>Flujo de caja real</h3><span className="badge badge-cyan">{movResumen.length}</span></div>
            <div className="table-wrap" style={{maxHeight:380}}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Categoría</th>
                    <th className="num">Monto</th><th>Cuenta</th><th className="num">Saldo acum.</th>
                    <th>Conciliado</th><th>Vinculado a</th>
                  </tr>
                </thead>
                <tbody>{movResumen.map((m, i) => {
                  const cb = cuentasActivas.find(c => c.id === m.cuenta_bancaria_id);
                  const vinculo = m.vinculo_id || m.vinculado_id;
                  const vinculoTipo = m.vinculo_tipo || m.vinculado_tipo;
                  const movBanco = (movimientosBanco||[]).find(b => b.conciliado && (b.vinculado_id === m.id || b.vinculado_id === vinculo));
                  return (
                    <tr key={m.id || i}>
                      <td style={{fontSize:12}}>{m.fecha}</td>
                      <td style={{fontSize:12}}>
                        {m.descripcion}
                        {m.es_manual && <span className="badge badge-gray" style={{fontSize:9, marginLeft:4}}>Manual</span>}
                      </td>
                      <td><span className={'badge '+(m.tipo==='ingreso'?'badge-green':'badge-orange')} style={{fontSize:10}}>{m.tipo}</span></td>
                      <td style={{fontSize:11, color:'var(--muted)'}}>{catLabel(m.categoria)}</td>
                      <td className="num" style={{fontWeight:600, color:m.tipo==='ingreso'?'var(--green)':'var(--fg)'}}>{m.tipo==='ingreso'?'+':'-'}{money(m.monto)}</td>
                      <td style={{fontSize:11}}>{cb?.nombre || '—'}</td>
                      <td className="num" style={{fontWeight:700, color: m.saldoAcum >= 0 ? 'var(--cyan)' : 'var(--danger)'}}>{money(m.saldoAcum)}</td>
                      <td>{movBanco ? <span style={{color:'var(--green)', fontSize:11}}>{I.check} Sí</span> : <span style={{color:'var(--muted)', fontSize:11}}>No</span>}</td>
                      <td style={{fontSize:11, color:'var(--muted)'}}>{vinculo ? `${vinculoTipo}` : '—'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              {movResumen.length === 0 && (
                <div style={{padding:'40px 16px', textAlign:'center', color:'var(--muted)'}}>Sin movimientos para el período seleccionado.</div>
              )}
            </div>
          </div>

          {/* Proyección 90 días */}
          <div className="card" style={{marginTop:16}}>
            <div className="card-head"><h3>Proyección de flujo de caja — 90 días</h3><span className="badge badge-cyan">Basado en CxC y CxP pendientes</span></div>
            <div className="card-body">
              {alertaLiquidez && (
                <div style={{padding:'10px 14px', background:'rgba(220,30,30,0.08)', border:'1px solid rgba(220,30,30,0.3)', borderRadius:8, marginBottom:14, display:'flex', gap:10, alignItems:'center'}}>
                  <span style={{color:'var(--danger)', fontSize:18}}>⚠</span>
                  <span style={{fontSize:13, color:'var(--danger)'}}>
                    <strong>Alerta de liquidez:</strong> el saldo proyectado cae a {money(alertaLiquidez.saldo)} en la semana {alertaLiquidez.semana} ({alertaLiquidez.fecha}).
                    Revisa tus cobros pendientes.
                  </span>
                </div>
              )}

              {/* 3-block summary table */}
              <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16}}>
                {(() => {
                  let saldoAcum = totalPEN;
                  return bloques90.map((b, i) => {
                    saldoAcum += b.flujoNeto;
                    return (
                      <div key={i} style={{background:'var(--surface-2)', borderRadius:10, padding:'14px 16px', border:'1px solid var(--border)'}}>
                        <div style={{fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:8}}>{b.label}</div>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4}}>
                          <span style={{color:'var(--muted)'}}>Ingresos proyect.</span>
                          <strong style={{color:'var(--green)'}}>{money(b.ingresos)}</strong>
                        </div>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4}}>
                          <span style={{color:'var(--muted)'}}>Egresos proyect.</span>
                          <strong style={{color:'var(--orange)'}}>{money(b.egresos)}</strong>
                        </div>
                        <div style={{borderTop:'1px solid var(--border)', marginTop:6, paddingTop:6, display:'flex', justifyContent:'space-between', fontSize:13}}>
                          <span style={{color:'var(--muted)'}}>Flujo neto</span>
                          <strong style={{color: b.flujoNeto >= 0 ? 'var(--green)' : 'var(--danger)'}}>{b.flujoNeto >= 0 ? '+' : ''}{money(b.flujoNeto)}</strong>
                        </div>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginTop:4}}>
                          <span style={{color:'var(--muted)'}}>Saldo proy.</span>
                          <strong style={{color: saldoAcum >= 0 ? 'var(--cyan)' : 'var(--danger)'}}>{money(saldoAcum)}</strong>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Bar chart */}
              <BarChartProyeccion semanas={proyeccionSemanas} saldoInicial={totalPEN} />
            </div>
          </div>
        </>
      )}

      {tab === 'extracto' && (
        <div className="card">
          <div className="card-head">
            <h3>Extracto bancario cargado</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>{I.download} Importar</button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th>Conciliado</th><th>Vinculado a</th></tr></thead>
              <tbody>{(movimientosBanco||[]).map((m,i) => (
                <tr key={m.id||i}>
                  <td>{m.fecha}</td>
                  <td>{m.descripcion || m.desc}</td>
                  <td><span className={'badge '+(m.tipo==='credito'?'badge-green':'badge-orange')}>{m.tipo==='credito'?'Crédito':'Débito'}</span></td>
                  <td className="num" style={{color:m.tipo==='credito'?'var(--green)':'var(--fg)'}}>{m.tipo==='credito'?'+':'-'}{money(m.monto)}</td>
                  <td>{m.conciliado ? <span className="badge badge-green">{I.check} Sí</span> : <span className="badge badge-gray">No</span>}</td>
                  <td className="text-muted mono" style={{fontSize:11}}>{m.vinculado_id ? `${m.vinculado_tipo}:${m.vinculado_id}` : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            {(movimientosBanco||[]).length === 0 && (
              <div style={{padding:'40px 16px', textAlign:'center', color:'var(--muted)'}}>
                No hay extracto bancario cargado.{' '}
                <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>Importar CSV</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Panel conciliar */}
      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanel(false)} />
          <div className="side-panel" style={{width:'min(580px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Match bancario</div>
                <div style={{fontSize:22, fontWeight:700}}>{movSel?.tipo === 'credito' ? '+' : '-'}{money(movSel?.monto || 0)}</div>
              </div>
              <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={confirmar} data-local-form="true">
              <div style={{background:'var(--surface-2)', borderRadius:8, padding:12, fontSize:13, display:'flex', flexDirection:'column', gap:4}}>
                <div><strong>Descripción:</strong> {movSel?.descripcion || movSel?.desc}</div>
                <div><strong>Fecha:</strong> {movSel?.fecha} &nbsp; <strong>Tipo:</strong> {movSel?.tipo}</div>
              </div>

              {sugeridos.length > 0 && (
                <div style={{marginTop:14, padding:10, background:'rgba(0,200,100,0.07)', borderRadius:8, border:'1px solid rgba(0,200,100,0.2)'}}>
                  <div style={{fontSize:12, fontWeight:600, color:'var(--green)', marginBottom:6}}>Sugerencias automáticas (diferencia ≤ 2%)</div>
                  {sugeridos.map(c => (
                    <div key={`${c.tipo}:${c.id}`} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0'}}>
                      <span style={{fontSize:12}}>{c.label} · {money(c.monto)}</span>
                      <button type="button" className="btn btn-sm btn-primary" style={{fontSize:11}} onClick={() => setTarget(`${c.tipo}:${c.id}`)}>Seleccionar</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="input-group" style={{marginTop:14}}>
                <label>{movSel?.tipo === 'credito' ? 'CxC a vincular' : 'CxP a vincular'}</label>
                <select className="input" value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="">Seleccionar documento...</option>
                  {candidatos.map(c => (
                    <option key={`${c.tipo}:${c.id}`} value={`${c.tipo}:${c.id}`}>
                      {c.sugerido ? '★ ' : ''}{c.label} — saldo {money(c.monto)} — dif. {money(c.diff)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{marginTop:12}}>
                <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13}}>
                  <input type="checkbox" checked={conDiferencia} onChange={e => setConDiferencia(e.target.checked)} />
                  Conciliar con diferencia (banco vs sistema)
                </label>
                {conDiferencia && (
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8}}>
                    <div className="input-group"><label>Monto diferencia</label><input className="input" type="number" step="0.01" value={montoDif} onChange={e => setMontoDif(e.target.value)} placeholder="0.00" /></div>
                    <div className="input-group"><label>Motivo</label><input className="input" value={motifoDif} onChange={e => setMotivoDif(e.target.value)} placeholder="Comisión bancaria, redondeo..." /></div>
                  </div>
                )}
              </div>

              <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:18}}>
                <button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={!target}>{I.check} Confirmar match</button>
              </div>
            </form>
          </div>
        </>
      )}

      {panelManual && <ManualMovimientoPanel cuentasBancarias={cuentasBancarias} onClose={() => setPanelManual(false)} onGuardar={registrarMovimientoManual} />}
      {showImport && <ImportarExtractoModal cuentasBancarias={cuentasBancarias} onClose={() => setShowImport(false)} />}
    </>
  );
}

function MultiSelect({ opts, sel, onSel, placeholder }) {
  const [open, setOpen] = useState(false);
  const allSel = sel.length === 0;
  return (
    <div style={{position:'relative'}}>
      <button type="button" className="select" style={{cursor:'pointer', textAlign:'left', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, minWidth:160}} onClick={()=>setOpen(o=>!o)}>
        <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1}}>
          {allSel ? placeholder : `${sel.length} seleccionado${sel.length>1?'s':''}`}
        </span>
        <span style={{color:'var(--fg-muted)', fontSize:10}}>▾</span>
      </button>
      {open && (
        <>
          <div style={{position:'fixed', inset:0, zIndex:99}} onClick={()=>setOpen(false)} />
          <div style={{position:'absolute', top:'calc(100% + 4px)', left:0, minWidth:220, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, boxShadow:'0 4px 16px rgba(0,0,0,.15)', zIndex:100, maxHeight:240, overflowY:'auto'}}>
            <div onClick={()=>{onSel([]); setOpen(false);}} style={{padding:'8px 14px', cursor:'pointer', fontSize:13, fontWeight:allSel?700:400, background:allSel?'var(--bg-subtle)':'transparent', borderBottom:'1px solid var(--border-subtle)'}}>
              Todos
            </div>
            {opts.map(o => {
              const on = sel.includes(o.id);
              return (
                <div key={o.id} onClick={()=>onSel(on ? sel.filter(x=>x!==o.id) : [...sel, o.id])} style={{padding:'8px 14px', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:8, background:on?'var(--bg-subtle)':'transparent'}}>
                  <span style={{width:14, height:14, border:'2px solid '+(on?'var(--cyan)':'var(--border)'), borderRadius:3, background:on?'var(--cyan)':'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff', fontSize:9}}>{on?'✓':''}</span>
                  {o.nombre}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const erAmount = (totals, currency) => Number(totals?.[currency] || 0);
const erMoney = (totals, currency) => moneyCurrency(erAmount(totals, currency), currency);

function Resultados({ role }) {
  const [expanded, setExpanded] = useState({ ingresos: true, costo: false, gastos: false, gastosFin: false });
  const { comprasGastos, ots, empresa, centrosCosto, centrosBeneficio } = useApp();
  const [cecosSel, setCecosSel] = useState([]);
  const [cebesSel, setCebesSel] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [erData, setErData] = useState(null);
  const supabaseMode = isSupabaseMode();
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const now = new Date();
  const [periodo, setPeriodo] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const periodoOpts = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { v: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, l: `${MESES[d.getMonth()]} ${d.getFullYear()}` };
  });

  const canFin = role.permisos.ver_finanzas || role.permisos.todo;
  const cecosDeEmpresa = (centrosCosto || []).filter(c => c.empresa_id === empresa?.id && c.estado === 'activo');
  const cebesDeEmpresa = (centrosBeneficio || []).filter(c => c.empresa_id === empresa?.id && c.estado === 'activo');

  const cecosPorCebe = cebesSel.length > 0 ? cecosDeEmpresa.filter(c => cebesSel.includes(c.cebe_id)).map(c => c.id) : null;
  let efectivoCecos = null;
  if (cecosSel.length > 0 && cecosPorCebe != null) {
    efectivoCecos = cecosSel.filter(id => cecosPorCebe.includes(id));
  } else if (cecosSel.length > 0) {
    efectivoCecos = cecosSel;
  } else if (cecosPorCebe != null) {
    efectivoCecos = cecosPorCebe;
  }

  const cgFiltrado = efectivoCecos ? comprasGastos.filter(g => efectivoCecos.includes(g.centro_costo_id)) : comprasGastos;
  const otsFiltradas = efectivoCecos ? ots.filter(o => efectivoCecos.includes(o.centro_costo_id)) : ots;
  const mockErData = useMemo(() => buildEstadoResultados({
    base: MOCK.estadoResultados,
    comprasGastos: cgFiltrado,
    ots: otsFiltradas,
    empresa,
    periodo,
  }), [cgFiltrado, otsFiltradas, empresa, periodo]);

  useEffect(() => {
    if (!supabaseMode || !canFin) {
      setErData(null);
      setLoading(false);
      setError('');
      return;
    }
    if (!empresa?.id) {
      setErData(null);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError('');
    getEstadoResultados({
      empresaId: empresa.id,
      periodo,
      cecoIds: cecosSel,
      cebeIds: cebesSel,
    })
      .then(data => {
        if (mounted) setErData(data);
      })
      .catch(err => {
        if (mounted) {
          setError(err?.message || 'No se pudo calcular el Estado de Resultados.');
          setErData(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [supabaseMode, canFin, empresa?.id, periodo, cecosSel, cebesSel]);

  if (!canFin) return (
    <div className="card" style={{ padding:40, textAlign:'center' }}>
      {I.lock}
      <h2 className="font-display" style={{ marginTop:12 }}>Sin acceso</h2>
      <div className="text-muted">Tu rol no tiene permiso <code>ver_finanzas</code>. Consulta con el administrador.</div>
    </div>
  );

  const data = supabaseMode ? erData : mockErData;
  const er = data?.er || mockErData.er;
  const utilidadBruta = data?.utilidadBruta || mockErData.utilidadBruta;
  const resultadoOp = data?.resultadoOp || mockErData.resultadoOp;
  const resultadoNeto = data?.resultadoNeto || mockErData.resultadoNeto;
  const margenes = data?.margenes || mockErData.margenes;
  const waitingForData = supabaseMode && !data && !error;
  const showEmpty = supabaseMode && !loading && !error && data && !data.hasMovements;

  const [yy, mm] = periodo.split('-');
  const periodoLabel = `${MESES[parseInt(mm)-1]} ${yy}`;
  const filtroStr = [
    cecosSel.length ? `CECO: ${cecosDeEmpresa.filter(c=>cecosSel.includes(c.id)).map(c=>c.nombre).join(', ')}` : '',
    cebesSel.length ? `CEBE: ${cebesDeEmpresa.filter(c=>cebesSel.includes(c.id)).map(c=>c.nombre).join(', ')}` : '',
  ].filter(Boolean).join(' / ');

  const toggle = k => setExpanded(e => ({ ...e, [k]: !e[k] }));
  const MoneyCols = ({ totals, neg, marginTotals }) => (
    <>
      {ER_CURRENCIES.map(currency => {
        const value = erAmount(totals, currency);
        return (
          <div key={currency} className="num" style={{ minWidth:130, textAlign:'right' }}>
            <div>{neg && value !== 0 ? '(' : ''}{erMoney(totals, currency)}{neg && value !== 0 ? ')' : ''}</div>
            {marginTotals && <div style={{ color:'var(--fg-muted)', fontSize:11 }}>[{erAmount(marginTotals, currency)}% margen]</div>}
          </div>
        );
      })}
    </>
  );
  const Row = ({ label, totals, bold, neg, marginTotals, expandKey, items }) => (
    <>
      <div onClick={() => expandKey && toggle(expandKey)} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 20px', borderBottom:'1px solid var(--border-subtle)', cursor:expandKey?'pointer':'default', background:bold?'var(--bg-subtle)':'transparent' }}>
        {expandKey && <span style={{ marginRight:2, display:'inline-flex', transform: expanded[expandKey]?'rotate(0)':'rotate(-90deg)', transition:'transform 0.2s', color:'var(--fg-muted)' }}>{I.chev}</span>}
        <div style={{ flex:1, fontWeight:bold?700:500, fontFamily:bold?'Sora':'inherit', fontSize:bold?15:13 }}>{label}</div>
        <MoneyCols totals={totals} neg={neg} marginTotals={marginTotals} />
      </div>
      {expandKey && expanded[expandKey] && items && items.map((it, i) => (
        <div key={`${it.label}-${i}`} style={{ display:'flex', gap:12, padding:'8px 20px 8px 52px', borderBottom:'1px solid var(--border-subtle)', fontSize:12, color:'var(--fg-muted)' }}>
          <div style={{ flex:1 }}>{it.label}</div>
          <MoneyCols totals={it.totals} neg={neg} />
        </div>
      ))}
    </>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Estado de Resultados{filtroStr ? ` - ${filtroStr}` : ''}</h1>
          <div className="page-sub">{periodoLabel} - {empresa?.nombre || 'Empresa'}</div>
        </div>
        <div className="row" style={{ gap:8, flexWrap:'wrap' }}>
          <select className="select" style={{ width:160 }} value={periodo} onChange={e=>setPeriodo(e.target.value)}>
            {periodoOpts.map(p=><option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          <MultiSelect opts={cecosDeEmpresa} sel={cecosSel} onSel={setCecosSel} placeholder="CECO: Todos" />
          <MultiSelect opts={cebesDeEmpresa} sel={cebesSel} onSel={setCebesSel} placeholder="CEBE: Todos" />
          <button className="btn btn-secondary">{I.download} PDF</button>
        </div>
      </div>
      {error && <div className="alert alert-danger mt-4">{error}</div>}
      {data?.otherCurrenciesWarning && (
        <div style={{ background:'var(--orange)', color:'#fff', padding:'10px 16px', borderRadius:8, marginTop:16, fontSize:13 }}>
          Existen registros en moneda no reconocida (distinta de PEN y USD) que no se incluyen en los totales. Revise y convierta manualmente antes de cerrar el período.
        </div>
      )}
      <div className="card">
        <div style={{ display:'flex', gap:12, padding:'10px 20px', borderBottom:'1px solid var(--border-subtle)', color:'var(--fg-muted)', fontSize:12, fontWeight:700 }}>
          <div style={{ flex:1 }}>Concepto</div>
          {ER_CURRENCIES.map(currency => <div key={currency} className="num" style={{ minWidth:130, textAlign:'right' }}>{currency}</div>)}
        </div>
        {loading || waitingForData ? (
          <div className="text-center text-muted" style={{ padding:40 }}>Calculando Estado de Resultados...</div>
        ) : error ? (
          <div className="text-center text-muted" style={{ padding:40 }}>No se pudo cargar el Estado de Resultados real.</div>
        ) : showEmpty ? (
          <div className="text-center text-muted" style={{ padding:40 }}>
            No hay movimientos reales registrados para {periodoLabel} con los filtros seleccionados.
          </div>
        ) : (
          <>
            <Row label="INGRESOS" totals={er.ingresos.total} bold expandKey="ingresos" items={er.ingresos.items}/>
            <Row label="COSTO DE VENTAS" totals={er.costoVentas.total} bold neg expandKey="costo" items={er.costoVentas.items}/>
            <Row label="UTILIDAD BRUTA" totals={utilidadBruta} bold marginTotals={margenes.utilidadBruta}/>
            <Row label="GASTOS OPERATIVOS" totals={er.gastosOp.total} bold neg expandKey="gastos" items={er.gastosOp.items}/>
            <Row label="RESULTADO OPERATIVO" totals={resultadoOp} bold marginTotals={margenes.resultadoOp}/>
            <Row label="GASTOS FINANCIEROS" totals={er.gastosFin.total} bold neg expandKey="gastosFin" items={er.gastosFin.items}/>
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'18px 20px', background:'var(--navy)', color:'#fff' }}>
              <div style={{ flex:1, fontFamily:'Sora', fontWeight:700, fontSize:16, letterSpacing:'0.02em' }}>RESULTADO NETO</div>
              {ER_CURRENCIES.map(currency => (
                <div key={currency} className="num" style={{ fontFamily:'Sora', fontWeight:700, fontSize:20, minWidth:130, textAlign:'right', color:'var(--cyan)' }}>
                  <div>{erMoney(resultadoNeto, currency)}</div>
                  <div style={{ color:'rgba(255,255,255,0.7)', fontSize:11, fontFamily:'DM Sans' }}>[{erAmount(margenes.resultadoNeto, currency)}% margen]</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="text-muted mt-4" style={{ fontSize:12, textAlign:'center' }}>Haz clic en las filas principales para expandir el detalle por concepto. El ER no convierte entre PEN y USD.</div>
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

const TIPO_DOC_LABELS = { factura: 'Factura', nota_credito: 'Nota de Crédito', nota_debito: 'Nota de Débito' };
const CONDICION_PAGO_OPTIONS = [
  { value:'contado', label:'Contado' },
  { value:'anticipado', label:'Anticipado' },
  { value:'15 días', label:'15 días' },
  { value:'30 días', label:'30 días' },
  { value:'45 días', label:'45 días' },
  { value:'60 días', label:'60 días' },
  { value:'90 días', label:'90 días' },
];
const CONDICION_LABELS = {
  contado:'Contado',
  anticipado:'Anticipado',
  '15 días':'15 días',
  '30 días':'30 días',
  '45 días':'45 días',
  '60 días':'60 días',
  '90 días':'90 días',
  '0':'Contado',
  '15':'15 días',
  '30':'30 días',
  '45':'45 días',
  '60':'60 días',
  '90':'90 días',
};
const FAC_BADGE_CLASS = { emitida:'badge-cyan', cobro_parcial:'badge-orange', cobrada:'badge-green', vencida:'badge-red', anulada:'badge-gray' };
const FAC_BADGE_LABEL = { emitida:'Emitida', cobro_parcial:'Cobro parcial', cobrada:'Cobrada', vencida:'Vencida', anulada:'Anulada' };

function Facturacion() {
  const {
    facturas, valorizaciones, osClientes, cuentas, cxc, movimientosTesoreria, seriesDocumentarias,
    emitirFacturaConCxC, actualizarFechaEmisionFactura, actualizarDatosFactura, subirArchivoFactura, eliminarArchivoFactura, anularFactura, restaurarFacturaPorError, emitirNotaCredito, emitirNotaDebito,
    registrarCobroCxC, generarCxC, generarCxP, navigate, activeParams, searchQuery,
    empresaConfig, role,
  } = useApp();

  const today = new Date().toISOString().split('T')[0];
  const condicionPagoDefecto = empresaConfig?.condicion_pago_defecto || CONDICION_PAGO_DEFECTO_CXC;
  const condicionPagoInicial = resolverCondicionPagoCxC({ condicionFallback: condicionPagoDefecto }).condicion_pago;
  const fechaVencimientoInicial = calcularFechaVencimientoCxC(today, condicionPagoInicial, condicionPagoDefecto);
  const calcularVencimientoForm = (fechaEmision, condicionPago) => calcularFechaVencimientoCxC(fechaEmision, condicionPago, condicionPagoDefecto);
  const resolverCondicionCliente = cuenta => resolverCondicionPagoCxC({
    condicionCliente: cuenta?.condicion_pago,
    condicionFallback: condicionPagoDefecto,
  });

  // ── mode: null=lista, 'val'=desde val, 'directa' ──────────────────────
  const [mode, setMode] = useState(null);

  // ── Form state ────────────────────────────────────────────────────────
  const [valSel, setValSel] = useState('');
  const [cuentaSel, setCuentaSel] = useState('');
  const [osSel, setOsSel] = useState('');
  const [form, setForm] = useState({ tipo_documento:'factura', numero:'', fecha_emision:today, condicion_pago:condicionPagoInicial, fecha_vencimiento: fechaVencimientoInicial, glosa:'', notas:'', moneda:'PEN' });
  const [partidas, setPartidas] = useState([{ id:1, descripcion:'', cantidad:1, precio_unitario:'' }]);
  const [igvPct, setIgvPct] = useState(18);
  const [saving, setSaving] = useState(false);
  const emitiendoRef = useRef(false);
  const [vencimientoManual, setVencimientoManual] = useState(false);
  const [condicionManual, setCondicionManual] = useState(false);
  const [clienteRetencion, setClienteRetencion] = useState({ aplica: false, tasa: 3 });
  const [ventaContextId, setVentaContextId] = useState(null);
  const [ventaCtxLabel, setVentaCtxLabel] = useState('');

  // ── Ficha state ───────────────────────────────────────────────────────
  const [selFac, setSelFac] = useState(null);
  const [fichaTab, setFichaTab] = useState('detalle');
  const [modalAnularFac, setModalAnularFac] = useState(false);
  const [motivoAnularFac, setMotivoAnularFac] = useState('');
  const [modalPago, setModalPago] = useState(false);
  const [montoPago, setMontoPago] = useState('');
  const [fechaPago, setFechaPago] = useState(today);
  const [refPago, setRefPago] = useState('');
  const [editEmisionFac, setEditEmisionFac] = useState(null);
  const [savingEmisionFac, setSavingEmisionFac] = useState(false);
  const [panelEditFac, setPanelEditFac] = useState(null);   // { id, items, igvPct, form }
  const [savingEditFac, setSavingEditFac] = useState(false);
  const [generandoCxC, setGenerandoCxC] = useState(false);

  const generarCxCDesdeFac = async (f) => {
    if (!f?.id || !f?.cuenta_id) return;
    setGenerandoCxC(true);
    try {
      const saldoInicial = f.aplica_retencion ? (f.monto_neto_cobrable || f.total) : f.total;
      await generarCxC({
        cuenta_id: f.cuenta_id,
        factura_id: f.id,
        os_cliente_id: f.os_cliente_id || null,
        fecha_emision: f.fecha_emision,
        fecha_vencimiento: f.fecha_vencimiento,
        fecha_vencimiento_resuelta: true,
        omitir_aviso_condicion_pago: true,
        condicion_pago: f.condicion_pago,
        monto_total: f.total,
        monto_pagado: 0,
        saldo: saldoInicial,
        monto_retencion: f.monto_retencion || 0,
        moneda: f.moneda || 'PEN',
        estado: 'por_cobrar',
      });
    } finally {
      setGenerandoCxC(false);
    }
  };

  // ── Archivos factura (PDF / ZIP) — almacenados como URLs en la factura ──
  const [uploadingFac, setUploadingFac] = useState(null); // 'pdf' | 'zip' | null
  const pdfInputRef = useRef(null);
  const zipInputRef = useRef(null);

  const handleSubirFac = async (file, tipo) => {
    if (!file || !selFac) return;
    setUploadingFac(tipo);
    try {
      await subirArchivoFactura(selFac, tipo, file);
    } catch(e) {
      alert('Error al subir: ' + (e?.message || 'intenta de nuevo'));
    } finally {
      setUploadingFac(null);
    }
  };

  const handleEliminarArchivoFac = async (tipo) => {
    if (!window.confirm(`¿Eliminar el archivo ${tipo.toUpperCase()}?`)) return;
    try {
      await eliminarArchivoFactura(selFac, tipo);
    } catch(e) {
      alert('Error al eliminar: ' + (e?.message || 'intenta de nuevo'));
    }
  };

  // ── NC / ND form state ────────────────────────────────────────────────
  const [ncndForm, setNcndForm] = useState(null); // null | 'nc' | 'nd'
  const [ncndFacId, setNcndFacId] = useState(null);
  const [ncMotivo, setNcMotivo] = useState('');
  const [ncPartidasSel, setNcPartidasSel] = useState([]);
  const [ncNotas, setNcNotas] = useState('');
  const [ncDevolucion, setNcDevolucion] = useState(false);
  const [ndMotivo, setNdMotivo] = useState('');
  const [ndConcepto, setNdConcepto] = useState('');
  const [ndMonto, setNdMonto] = useState('');
  const [ndConIgv, setNdConIgv] = useState(true);
  const [ndNotas, setNdNotas] = useState('');
  const [confirmarExcesoFac, setConfirmarExcesoFac] = useState(false);

  // ── Filter state ──────────────────────────────────────────────────────
  const [fCliente, setFCliente] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fMoneda, setFMoneda] = useState('');
  const [fEmitDesde, setFEmitDesde] = useState('');
  const [fEmitHasta, setFEmitHasta] = useState('');
  const [fVenceDesde, setFVenceDesde] = useState('');
  const [fVenceHasta, setFVenceHasta] = useState('');

  // ── Helpers ───────────────────────────────────────────────────────────
  const getCuenta = id => (cuentas || []).find(c => c.id === id);
  const getOs = id => (osClientes || []).find(o => o.id === id);
  const getVal = id => (valorizaciones || []).find(v => v.id === id);
  const cuentaNombre = id => { const c = getCuenta(id); return c?.razon_social || c?.nombre_comercial || '—'; };
  const rucCliente = id => getCuenta(id)?.ruc || '—';

  const serieFactura = (seriesDocumentarias || []).find(s => s.documento === 'Facturas' && s.estado === 'activo');
  const nextNumero = serieFactura
    ? `${serieFactura.serie}-${String(Number(serieFactura.siguiente_correlativo)).padStart(4,'0')}`
    : `F001-${String((facturas||[]).length + 1).padStart(4,'0')}`;
  const serieBoleta = (seriesDocumentarias || []).find(s => s.documento === 'Boletas' && s.estado === 'activo');
  const nextNumeroBoleta = serieBoleta
    ? `${serieBoleta.serie}-${String(Number(serieBoleta.siguiente_correlativo)).padStart(4,'0')}`
    : `B001-${String((facturas||[]).filter(f => f.tipo_documento === 'boleta').length + 1).padStart(4,'0')}`;

  const valFacturadas = useMemo(() => new Set(
    (facturas||[])
      .filter(f => f.estado !== 'anulada' && f.tipo_documento !== 'nota_credito' && f.tipo_documento !== 'nota_debito')
      .map(f => f.valorizacion_id)
      .filter(Boolean)
  ), [facturas]);
  const valsParaFacturar = (valorizaciones||[]).filter(v => v.estado === 'aprobada' && !valFacturadas.has(v.id));

  // ── Partidas calc ─────────────────────────────────────────────────────
  const esBoleta = form.tipo_documento === 'boleta';
  const subtotalCalc = partidas.reduce((s, p) => s + Number(p.cantidad||0) * Number(p.precio_unitario||0), 0);
  // Boleta: precio con IGV incluido; factura: precio sin IGV.
  const totalCalc = esBoleta ? subtotalCalc : subtotalCalc + Math.round(subtotalCalc * (igvPct/100) * 100) / 100;
  const subtotalNeto = esBoleta ? Math.round(subtotalCalc / (1 + igvPct/100) * 100) / 100 : subtotalCalc;
  const igvCalc = esBoleta ? totalCalc - subtotalNeto : Math.round(subtotalCalc * (igvPct/100) * 100) / 100;
  const retencionCalc = clienteRetencion.aplica
    ? Math.round(totalCalc * (clienteRetencion.tasa / 100) * 100) / 100
    : 0;
  const netoCobrableCalc = clienteRetencion.aplica ? totalCalc - retencionCalc : totalCalc;

  // P7.3 — exceso saldo OS (solo modo 'val')
  const osParaValidar = mode === 'val' ? getOs(getVal(valSel)?.os_cliente_id) : getOs(osSel);
  const excedeOsSaldo = mode === 'val' && osParaValidar != null && totalCalc > Number(osParaValidar.saldo_por_facturar || 0);

  const addPartida = () => setPartidas(prev => [...prev, { id: Date.now(), descripcion:'', cantidad:1, precio_unitario:'' }]);
  const removePartida = id => setPartidas(prev => prev.filter(p => p.id !== id));
  const updatePartida = (id, field, val) => setPartidas(prev => prev.map(p => p.id === id ? {...p, [field]: val} : p));
  const permisosEditarFacturacion = role?.permisos?.editar;
  const puedeEditarFacturacion = Boolean(role?.permisos?.todo || permisosEditarFacturacion === true || permisosEditarFacturacion?.includes?.('facturacion'));

  // Detecta si una factura anulada lo fue directamente (sin NC) — permite restaurarla
  const tieneNC = (fac) =>
    facturas.some(nc => nc.tipo_documento === 'nota_credito' && nc.factura_origen_id === fac.id) ||
    String(fac.motivo_anulacion || '').startsWith('NC emitida');
  const esAnuladaSinNC = (fac) => fac.estado === 'anulada' && !tieneNC(fac);

  const abrirEdicionEmisionFactura = (factura, e) => {
    if (e) e.stopPropagation();
    if (!puedeEditarFacturacion) return;
    setEditEmisionFac({ id: factura.id, fecha: factura.fecha_emision || today });
  };

  const cancelarEdicionEmisionFactura = () => {
    setEditEmisionFac(null);
  };

  const confirmarEdicionEmisionFactura = async () => {
    if (!editEmisionFac?.id || !editEmisionFac?.fecha) return;
    setSavingEmisionFac(true);
    try {
      await actualizarFechaEmisionFactura(editEmisionFac.id, editEmisionFac.fecha);
      setEditEmisionFac(null);
    } finally {
      setSavingEmisionFac(false);
    }
  };

  // ── Form change helper (auto-update fecha_vencimiento y numero al cambiar tipo) ────
  const handleFormChange = (field, value) => {
    if (field === 'condicion_pago') setCondicionManual(true);
    if (field === 'fecha_emision' || field === 'condicion_pago') setVencimientoManual(false);
    if (field === 'fecha_vencimiento') setVencimientoManual(true);
    setForm(f => {
      const updated = { ...f, [field]: value };
      if (field === 'fecha_emision' || field === 'condicion_pago') {
        const fe = field === 'fecha_emision' ? value : f.fecha_emision;
        const condicion = field === 'condicion_pago' ? value : f.condicion_pago;
        updated.fecha_vencimiento = calcularVencimientoForm(fe, condicion);
      }
      if (field === 'tipo_documento') {
        updated.numero = value === 'boleta' ? nextNumeroBoleta : nextNumero;
      }
      return updated;
    });
  };

  // ── Open form ─────────────────────────────────────────────────────────
  const openMode = m => {
    setMode(m);
    setValSel(''); setCuentaSel(''); setOsSel('');
    setPartidas([{ id: Date.now(), descripcion:'', cantidad:1, precio_unitario:0 }]);
    setIgvPct(18);
    setForm({ tipo_documento:'factura', numero: nextNumero, fecha_emision:today, condicion_pago:condicionPagoInicial, fecha_vencimiento: calcularVencimientoForm(today, condicionPagoInicial), glosa:'', notas:'', moneda:'PEN' });
    setVencimientoManual(false);
    setCondicionManual(false);
    setConfirmarExcesoFac(false);
    setClienteRetencion({ aplica: false, tasa: 3 });
    setVentaContextId(null);
    setVentaCtxLabel('');
  };

  // ── Pre-fill from val ─────────────────────────────────────────────────
  const handleSelectVal = vId => {
    setValSel(vId);
    if (!vId) { setPartidas([{ id: Date.now(), descripcion:'', cantidad:1, precio_unitario:0 }]); return; }
    const v = getVal(vId);
    const os = getOs(v?.os_cliente_id);
    const cuentaId = os?.cuenta_id;
    setCuentaSel(cuentaId || '');
    const igvDerived = v?.subtotal > 0 ? Math.round(((v?.igv||0)/v.subtotal)*100) : 18;
    setIgvPct(igvDerived);
    setPartidas((v?.items||[]).length > 0
      ? (v.items).map((it,i) => ({...it, id: it.id || `vp_${i}`}))
      : [{ id: Date.now(), descripcion:'', cantidad:1, precio_unitario:0 }]);
    const cuenta = getCuenta(cuentaId);
    const condicion = resolverCondicionPagoCxC({
      condicionCliente: os?.condicion_pago || cuenta?.condicion_pago,
      condicionFallback: condicionPagoDefecto,
    }).condicion_pago;
    setVencimientoManual(false);
    setForm(f => {
      const nuevaCondicion = condicionManual ? f.condicion_pago : condicion;
      return {
        ...f,
        moneda: v?.moneda || os?.moneda || 'PEN',
        condicion_pago: nuevaCondicion,
        fecha_vencimiento: calcularVencimientoForm(f.fecha_emision, nuevaCondicion),
      };
    });
    setClienteRetencion({
      aplica: Boolean(cuenta?.agente_retencion_sunat),
      tasa: Number(cuenta?.tasa_retencion_sunat || 3),
    });
  };

  // ── Pre-fill desde Venta ──────────────────────────────────────────────
  const handleVentaPrefill = (params) => {
    const cuentaId = params.cuenta_id;
    setCuentaSel(cuentaId || '');
    setOsSel('');
    const cuenta = getCuenta(cuentaId);
    const condicionVenta = params.condicion_pago === 'credito'
      ? `${params.dias_credito || 30} días`
      : 'contado';
    const condicion = resolverCondicionPagoCxC({ condicionCliente: condicionVenta, condicionFallback: condicionPagoDefecto }).condicion_pago;
    setVencimientoManual(false);
    setForm(f => ({
      ...f,
      moneda: params.moneda || 'PEN',
      condicion_pago: condicion,
      fecha_vencimiento: calcularVencimientoForm(f.fecha_emision, condicion),
    }));
    setPartidas([{ id: Date.now(), descripcion: params.concepto || '', cantidad: 1, precio_unitario: params.monto_total || 0 }]);
    setClienteRetencion({
      aplica: Boolean(cuenta?.agente_retencion_sunat),
      tasa: Number(cuenta?.tasa_retencion_sunat || 3),
    });
  };

  // Abre el formulario si se navegó desde Valorizaciones con params
  useEffect(() => {
    if (activeParams?.mode === 'val' && activeParams?.valSel && !mode) {
      openMode('val');
      handleSelectVal(activeParams.valSel);
      navigate('facturacion', {});
    }
  }, [activeParams]);

  // Abre el formulario si se navegó desde Ventas con params
  useEffect(() => {
    if (activeParams?.mode === 'venta' && activeParams?.ventaSel && !mode) {
      openMode('directa');
      setVentaContextId(activeParams.ventaSel);
      setVentaCtxLabel(activeParams.cliente_nombre || '');
      handleVentaPrefill(activeParams);
      navigate('facturacion', {});
    }
  }, [activeParams]);

  // Abre ficha de factura si se navegó con selFac en params
  useEffect(() => {
    if (activeParams?.selFac && !mode && !selFac) {
      setSelFac(activeParams.selFac);
      navigate('facturacion', {});
    }
  }, [activeParams]);

  // ── Pre-fill from cliente (directa) ──────────────────────────────────
  const handleSelectCuenta = cId => {
    setCuentaSel(cId);
    setOsSel('');
    const cuenta = getCuenta(cId);
    const condicion = resolverCondicionCliente(cuenta).condicion_pago;
    setVencimientoManual(false);
    setForm(f => ({
      ...f,
      condicion_pago: condicion,
      fecha_vencimiento: calcularVencimientoForm(f.fecha_emision, condicion),
      moneda: cuenta?.moneda || 'PEN',
    }));
    setClienteRetencion({
      aplica: Boolean(cuenta?.agente_retencion_sunat),
      tasa: Number(cuenta?.tasa_retencion_sunat || 3),
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────
  const handleGuardar = async () => {
    const cuentaId = mode === 'val'
      ? getCuenta(getOs(getVal(valSel)?.os_cliente_id)?.cuenta_id)?.id
      : cuentaSel;
    if (!cuentaId) { alert('Debe seleccionar un cliente.'); return; }
    if (mode === 'val' && !valSel) { alert('Debe seleccionar una valorización.'); return; }
    if (partidas.every(p => !p.descripcion && !p.precio_unitario)) { alert('Debe completar al menos una partida.'); return; }

    // P7.1 — una valorización solo puede tener una factura activa (excluye NC/ND)
    if (mode === 'val' && valSel) {
      const facActiva = (facturas || []).find(f =>
        f.valorizacion_id === valSel &&
        f.estado !== 'anulada' &&
        f.tipo_documento !== 'nota_credito' &&
        f.tipo_documento !== 'nota_debito'
      );
      if (facActiva) {
        alert('Esta valorización ya tiene una factura emitida. Si necesitas corregirla usa una nota de crédito o nota de débito.');
        return;
      }
    }
    // P7.2 — cuenta bloqueada
    const cuentaObj = getCuenta(cuentaId);
    if (cuentaObj?.estado === 'bloqueado') {
      alert('No se puede emitir la factura. La cuenta de este cliente está bloqueada.');
      return;
    }
    // P7.3 — total supera saldo OS (requiere confirmación explícita)
    if (excedeOsSaldo && !confirmarExcesoFac) return;

    if (emitiendoRef.current) return;
    emitiendoRef.current = true;
    setSaving(true);
    try {
      const facturaEmitidaId = await emitirFacturaConCxC({
        tipo_documento: form.tipo_documento,
        numero: form.numero || (esBoleta ? nextNumeroBoleta : nextNumero),
        cuenta_id: cuentaId,
        os_cliente_id: mode === 'val' ? getVal(valSel)?.os_cliente_id : (osSel || null),
        valorizacion_id: mode === 'val' ? valSel : null,
        items: partidas.map(p => ({ descripcion: p.descripcion, cantidad: Number(p.cantidad||0), precio_unitario: Number(p.precio_unitario||0) })),
        subtotal: subtotalNeto,
        igv: igvCalc,
        total: totalCalc,
        moneda: form.moneda,
        fecha_emision: form.fecha_emision,
        condicion_pago: form.condicion_pago,
        fecha_vencimiento: form.fecha_vencimiento,
        fecha_vencimiento_manual: vencimientoManual,
        glosa: form.glosa || null,
        notas: form.notas || null,
        aplica_retencion: clienteRetencion.aplica,
        monto_retencion: retencionCalc,
        monto_neto_cobrable: netoCobrableCalc,
      });
      if (ventaContextId && facturaEmitidaId) {
        try {
          await finanzasService.confirmarVenta(ventaContextId, facturaEmitidaId, null);
        } catch (e) {
          console.warn('[ventas] confirmarVenta falló (no crítico):', e?.message);
        }
      }
      setMode(null);
    } finally {
      emitiendoRef.current = false;
      setSaving(false);
    }
  };

  // ── Panel editar factura (compartido entre ficha y lista) ────────────
  const renderPanelEditFac = () => {
    if (!panelEditFac) return null;
    const ef = panelEditFac;
    const esDirecta = ef.esDirecta;
    const subtotalEd = (ef.items||[]).reduce((s,p) => s + Number(p.cantidad||0)*Number(p.precio_unitario||0), 0);
    const igvEd = Math.round(subtotalEd * (ef.igvPct/100) * 100) / 100;
    const totalEd = subtotalEd + igvEd;
    const setEfForm = upd => setPanelEditFac(prev => ({...prev, form: {...prev.form, ...upd}}));
    const setEfItems = upd => setPanelEditFac(prev => ({...prev, items: typeof upd === 'function' ? upd(prev.items) : upd}));

    const handleSaveEdit = async () => {
      if (esDirecta && (ef.items||[]).every(p => !p.descripcion && !p.precio_unitario)) {
        alert('Agrega al menos una partida.'); return;
      }
      if (!ef.form.numero?.trim()) { alert('El número de factura es obligatorio.'); return; }
      setSavingEditFac(true);
      try {
        await actualizarDatosFactura(ef.id, {
          numero: ef.form.numero,
          fecha_emision: ef.form.fecha_emision,
          condicion_pago: ef.form.condicion_pago,
          fecha_vencimiento: ef.form.fecha_vencimiento,
          moneda: ef.form.moneda,
          glosa: ef.form.glosa,
          notas: ef.form.notas,
          ...(esDirecta && { items: ef.items, subtotal: subtotalEd, igv: igvEd, total: totalEd }),
        });
        setPanelEditFac(null);
      } finally {
        setSavingEditFac(false);
      }
    };

    return (
      <>
        <div className="side-panel-backdrop" onClick={() => setPanelEditFac(null)}/>
        <div className="side-panel" style={{width:'min(580px,96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Editar factura · {esDirecta ? 'Directa' : 'Desde valorización'}</div>
              <div className="font-display" style={{fontSize:18,fontWeight:700}}>{ef.form.numero}</div>
            </div>
            <button className="icon-btn" onClick={() => setPanelEditFac(null)}>{I.x}</button>
          </div>
          <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:16}}>

            {!esDirecta && (
              <div style={{fontSize:13,padding:'8px 12px',borderRadius:6,background:'rgba(234,179,8,0.08)',border:'1px solid var(--orange)'}}>
                Esta factura fue generada desde una <strong>Valorización</strong>. Los montos solo se pueden corregir mediante <strong>Nota de Crédito</strong> o <strong>Nota de Débito</strong>.
              </div>
            )}

            <div className="grid-2" style={{gap:12}}>
              <div className="input-group">
                <label>N° Factura <span style={{color:'var(--danger)'}}>*</span></label>
                <input className="input" value={ef.form.numero} onChange={e => setEfForm({numero: e.target.value})} placeholder="F001-0001" />
              </div>
              <div className="input-group">
                <label>Fecha de emisión</label>
                <input className="input" type="date" value={ef.form.fecha_emision} onChange={e => {
                  const fe = e.target.value;
                  setEfForm({ fecha_emision: fe, fecha_vencimiento: calcularVencimientoForm(fe, ef.form.condicion_pago) });
                }} />
              </div>
            </div>

            <div className="grid-2" style={{gap:12}}>
              <div className="input-group">
                <label>Condición de pago</label>
                <select className="select" value={ef.form.condicion_pago} onChange={e => {
                  const condicion = e.target.value;
                  setEfForm({ condicion_pago: condicion, fecha_vencimiento: calcularVencimientoForm(ef.form.fecha_emision, condicion) });
                }}>
                  {['contado','anticipado','15 días','30 días','45 días','60 días','90 días'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Fecha vencimiento</label>
                <input className="input" type="date" value={ef.form.fecha_vencimiento} onChange={e => setEfForm({fecha_vencimiento: e.target.value})} />
              </div>
              <div className="input-group">
                <label>Moneda</label>
                <select className="select" value={ef.form.moneda} onChange={e => setEfForm({moneda: e.target.value})}>
                  <option value="PEN">S/ Soles</option>
                  <option value="USD">US$ Dólares</option>
                </select>
              </div>
              {esDirecta && (
                <div className="input-group">
                  <label>IGV %</label>
                  <input className="input num" type="number" min="0" max="30" step="1" value={ef.igvPct} onChange={e => setPanelEditFac(prev => ({...prev, igvPct: Number(e.target.value)}))} />
                </div>
              )}
            </div>

            {esDirecta && (
              <div>
                <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Partidas</div>
                {(ef.items||[]).map((p,i) => (
                  <div key={p.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:8,marginBottom:8,alignItems:'end'}}>
                    <div className="input-group" style={{gridColumn:'1/-1'}}>
                      {i === 0 && <label>Descripción</label>}
                      <input className="input" value={p.descripcion||''} onChange={e => setEfItems(prev => prev.map(x => x.id===p.id ? {...x,descripcion:e.target.value} : x))} placeholder="Descripción del servicio..." />
                    </div>
                    <div className="input-group">
                      {i === 0 && <label>Cant.</label>}
                      <input className="input num" type="number" min="0" step="any" value={p.cantidad} onChange={e => setEfItems(prev => prev.map(x => x.id===p.id ? {...x,cantidad:e.target.value} : x))} style={{width:70}} />
                    </div>
                    <div className="input-group">
                      {i === 0 && <label>Precio unit.</label>}
                      <input className="input num" type="number" min="0" step="any" value={p.precio_unitario} onChange={e => setEfItems(prev => prev.map(x => x.id===p.id ? {...x,precio_unitario:e.target.value} : x))} style={{width:110}} />
                    </div>
                    {(ef.items||[]).length > 1 && (
                      <button className="icon-btn" style={{color:'var(--danger)',alignSelf:'flex-end',marginBottom:2}} onClick={() => setEfItems(prev => prev.filter(x => x.id!==p.id))}>{I.x}</button>
                    )}
                  </div>
                ))}
                <button className="btn btn-ghost" style={{fontSize:12}} onClick={() => setEfItems(prev => [...prev, {id:Date.now(),descripcion:'',cantidad:1,precio_unitario:''}])}>{I.plus} Agregar partida</button>
                <div className="card" style={{padding:12,marginTop:12}}>
                  {[['Subtotal', subtotalEd],['IGV', igvEd],['Total', totalEd]].map(([k,v]) => (
                    <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:k==='Total'?700:400,marginTop:k==='Total'?6:0,paddingTop:k==='Total'?6:0,borderTop:k==='Total'?'1px solid var(--border)':'none'}}>
                      <span style={{color:'var(--fg-muted)'}}>{k}</span>
                      <span>{moneyCurrency(v, ef.form.moneda)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid-2" style={{gap:12}}>
              <div className="input-group">
                <label>Glosa</label>
                <input className="input" value={ef.form.glosa} onChange={e => setEfForm({glosa:e.target.value})} placeholder="Referencia interna..." />
              </div>
              <div className="input-group">
                <label>Notas</label>
                <input className="input" value={ef.form.notas} onChange={e => setEfForm({notas:e.target.value})} placeholder="Observaciones..." />
              </div>
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end',paddingTop:8}}>
              <button className="btn btn-secondary" onClick={() => setPanelEditFac(null)} disabled={savingEditFac}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={savingEditFac}>
                {savingEditFac ? 'Guardando...' : <>{I.check} Guardar cambios</>}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  // ── Nota de Crédito form ──────────────────────────────────────────────
  if (ncndForm === 'nc') {
    const facOrigen = (facturas||[]).find(x => x.id === ncndFacId);
    if (!facOrigen) { setNcndForm(null); return null; }
    const itemsOrigen = facOrigen.items || [];
    const igvPctOrig = facOrigen.subtotal > 0 ? (facOrigen.igv||0) / facOrigen.subtotal : 0.18;
    const ncSubtotal = Math.round(ncPartidasSel.filter(p => p.sel).reduce((s,p) => s + Number(p.monto_acreditar||0), 0) * 100) / 100;
    const ncIgvAmt = Math.round(ncSubtotal * igvPctOrig * 100) / 100;
    const totalNC = ncSubtotal + ncIgvAmt;
    const cubreTotal = totalNC >= Number(facOrigen.total||0);

    const handleEmitirNC = async () => {
      if (!ncMotivo) { alert('Seleccione un motivo.'); return; }
      if (totalNC <= 0) { alert('Seleccione al menos una partida con monto mayor a cero.'); return; }
      const items = itemsOrigen.map((it,i) => {
        const pId = it.id || `p_${i}`;
        const p = ncPartidasSel.find(x => x.id === pId);
        return p?.sel ? { descripcion: it.descripcion, cantidad: it.cantidad, precio_unitario: Number(p.monto_acreditar||0) } : null;
      }).filter(Boolean);
      const nc = await emitirNotaCredito(ncndFacId, { motivo: ncMotivo, items, subtotal: ncSubtotal, igv: ncIgvAmt, total: totalNC, notas: ncNotas });
      if (ncDevolucion && totalNC > 0) {
        const ncId = nc?.id || ncndFacId;
        const today = new Date().toISOString().split('T')[0];
        const addDias30 = d => { const dt = new Date(`${d}T00:00:00`); dt.setDate(dt.getDate() + 15); return dt.toISOString().split('T')[0]; };
        await generarCxP({
          tipo_beneficiario: 'cliente',
          cuenta_id: facOrigen.cuenta_id,
          concepto: `Devolución NC — ${facOrigen.numero} — ${cuentaNombre(facOrigen.cuenta_id)}`,
          factura_numero: `NC/${facOrigen.numero}`,
          fecha_emision: today,
          fecha_vencimiento: addDias30(today),
          monto_total: totalNC,
          moneda: facOrigen.moneda || 'PEN',
          estado: 'por_pagar',
          origen: 'nc_devolucion',
          motivo_cxp: 'devolucion_nc',
          nc_id: ncId,
        });
      }
      setNcndForm(null); setNcndFacId(null); setSelFac(nc?.id || null); setFichaTab('detalle'); setNcDevolucion(false);
    };

    return (
      <>
        <div className="page-header" style={{borderBottom:'none',paddingBottom:0}}>
          <div>
            <button className="btn btn-ghost" onClick={() => { setNcndForm(null); setSelFac(ncndFacId); }} style={{marginBottom:10,padding:0,color:'var(--cyan)'}}>
              ← Volver a la factura
            </button>
            <h1 className="page-title">Nota de Crédito</h1>
            <div className="page-sub">Acreditar contra factura <strong>{facOrigen.numero}</strong> — {cuentaNombre(facOrigen.cuenta_id)}</div>
          </div>
          <div className="row" style={{gap:10}}>
            <button className="btn btn-secondary" onClick={() => { setNcndForm(null); setSelFac(ncndFacId); }}>Cancelar</button>
            <button className="btn btn-primary" disabled={!ncMotivo || totalNC <= 0} onClick={handleEmitirNC}>{I.check} Emitir NC</button>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:20,marginTop:20}}>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div className="card card-body">
              <div className="grid-2" style={{gap:16}}>
                <div className="input-group">
                  <label>Factura de origen</label>
                  <input className="input mono" readOnly value={`${facOrigen.numero} — ${moneyCurrency(facOrigen.total, facOrigen.moneda)}`} style={{color:'var(--fg-muted)',cursor:'default'}} />
                </div>
                <div className="input-group">
                  <label>Motivo <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="select" value={ncMotivo} onChange={e => setNcMotivo(e.target.value)}>
                    <option value="">Seleccione motivo...</option>
                    <option value="error_precio">Error en precio</option>
                    <option value="devolucion">Devolución de servicio</option>
                    <option value="descuento">Descuento posterior</option>
                    <option value="anulacion_parcial">Anulación parcial</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card">
              <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)'}}>
                <h3 style={{margin:0,fontSize:14}}>Partidas a acreditar</h3>
                <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:4}}>Selecciona las partidas y ajusta el monto a acreditar.</div>
              </div>
              {itemsOrigen.length === 0 ? (
                <div className="card-body" style={{textAlign:'center',color:'var(--fg-muted)',fontSize:13}}>La factura original no tiene partidas registradas.</div>
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{width:44}}></th>
                        <th>Descripción</th>
                        <th style={{width:130}} className="num">Total original</th>
                        <th style={{width:150}}>Monto a acreditar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsOrigen.map((it,i) => {
                        const pId = it.id || `p_${i}`;
                        const pSel = ncPartidasSel.find(p => p.id === pId) || { sel:false, monto_acreditar:0 };
                        const totalOrig = Number(it.cantidad||0)*Number(it.precio_unitario||0);
                        return (
                          <tr key={i} style={{opacity: pSel.sel ? 1 : 0.5}}>
                            <td style={{textAlign:'center'}}>
                              <input type="checkbox" checked={pSel.sel}
                                onChange={e => setNcPartidasSel(prev => prev.map(p => p.id===pId ? {...p, sel:e.target.checked} : p))} />
                            </td>
                            <td style={{fontSize:12}}>{it.descripcion||'—'}</td>
                            <td className="num text-muted">{moneyCurrency(totalOrig, facOrigen.moneda)}</td>
                            <td>
                              <input type="number" className="input num" min="0" max={totalOrig} step="0.01"
                                value={pSel.monto_acreditar} disabled={!pSel.sel}
                                onChange={e => setNcPartidasSel(prev => prev.map(p => p.id===pId ? {...p, monto_acreditar:e.target.value} : p))} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="input-group">
              <label>Notas <span style={{color:'var(--fg-muted)',fontWeight:400}}>(opcional)</span></label>
              <textarea className="input" rows={2} value={ncNotas} onChange={e => setNcNotas(e.target.value)} placeholder="Observaciones adicionales..." />
            </div>

            <div style={{padding:'12px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-subtle)'}}>
              <label style={{display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:13, fontWeight:600}}>
                <input type="checkbox" checked={ncDevolucion} onChange={e => setNcDevolucion(e.target.checked)}/>
                Esta NC implica una devolución de dinero al cliente
              </label>
              {ncDevolucion && (
                <div style={{marginTop:8, fontSize:12, color:'var(--orange)', padding:'6px 8px', background:'color-mix(in srgb, var(--orange) 8%, transparent)', borderRadius:6}}>
                  Se creará una obligación de pago pendiente en Tesorería por <strong>{moneyCurrency(totalNC, facOrigen.moneda)}</strong>, vinculada a esta NC. El tesorero podrá ejecutar la transferencia desde CxP.
                </div>
              )}
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div className="card" style={{padding:'16px 20px'}}>
              <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:8}}>Resumen NC</div>
              <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
                <span className="text-muted" style={{fontSize:13}}>Subtotal</span>
                <span className="num">{moneyCurrency(ncSubtotal, facOrigen.moneda)}</span>
              </div>
              <div className="row" style={{justifyContent:'space-between',marginBottom:8}}>
                <span className="text-muted" style={{fontSize:13}}>IGV ({Math.round(igvPctOrig*100)}%)</span>
                <span className="num">{moneyCurrency(ncIgvAmt, facOrigen.moneda)}</span>
              </div>
              <div className="row" style={{justifyContent:'space-between',paddingTop:8,borderTop:'1px solid var(--border)',fontWeight:700,fontFamily:'Sora',fontSize:16}}>
                <span>Total NC</span>
                <span className="num">{moneyCurrency(totalNC, facOrigen.moneda)}</span>
              </div>
            </div>

            {cubreTotal && (
              <div style={{padding:'12px 14px',borderRadius:8,border:'1px solid var(--orange)',background:'color-mix(in srgb, var(--orange) 8%, transparent)',fontSize:12}}>
                <div style={{fontWeight:600,color:'var(--orange)',marginBottom:4}}>Anulación total</div>
                La NC cubre el 100% de la factura. Al emitir: la factura y la CxC quedarán anuladas
                {facOrigen.valorizacion_id && ' y la valorización vinculada volverá a estado Aprobada'}.
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── Nota de Débito form ───────────────────────────────────────────────
  if (ncndForm === 'nd') {
    const facOrigen = (facturas||[]).find(x => x.id === ncndFacId);
    if (!facOrigen) { setNcndForm(null); return null; }
    const igvPctOrig = facOrigen.subtotal > 0 ? Math.round((facOrigen.igv||0)/facOrigen.subtotal*100) : 18;
    const ndSubtotal = Number(ndMonto || 0);
    const ndIgvAmt = ndConIgv ? Math.round(ndSubtotal * igvPctOrig / 100 * 100) / 100 : 0;
    const ndTotal = ndSubtotal + ndIgvAmt;

    const handleEmitirND = async () => {
      if (!ndMotivo) { alert('Seleccione un motivo.'); return; }
      if (!ndMonto || ndSubtotal <= 0) { alert('Ingrese el monto del cargo.'); return; }
      await emitirNotaDebito(ncndFacId, {
        motivo: ndMotivo,
        items: [{ descripcion: ndConcepto || 'Cargo adicional', cantidad: 1, precio_unitario: ndSubtotal }],
        subtotal: ndSubtotal, igv: ndIgvAmt, total: ndTotal, notas: ndNotas,
      });
      setNcndForm(null); setNcndFacId(null); setSelFac(ncndFacId);
    };

    return (
      <>
        <div className="page-header" style={{borderBottom:'none',paddingBottom:0}}>
          <div>
            <button className="btn btn-ghost" onClick={() => { setNcndForm(null); setSelFac(ncndFacId); }} style={{marginBottom:10,padding:0,color:'var(--cyan)'}}>
              ← Volver a la factura
            </button>
            <h1 className="page-title">Nota de Débito</h1>
            <div className="page-sub">Cargo adicional sobre factura <strong>{facOrigen.numero}</strong> — {cuentaNombre(facOrigen.cuenta_id)}</div>
          </div>
          <div className="row" style={{gap:10}}>
            <button className="btn btn-secondary" onClick={() => { setNcndForm(null); setSelFac(ncndFacId); }}>Cancelar</button>
            <button className="btn btn-primary" disabled={!ndMotivo || ndSubtotal <= 0} onClick={handleEmitirND}>{I.check} Emitir ND</button>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:20,marginTop:20}}>
          <div className="card card-body" style={{display:'flex',flexDirection:'column',gap:16}}>
            <div className="input-group">
              <label>Factura de origen</label>
              <input className="input mono" readOnly value={`${facOrigen.numero} — ${money(facOrigen.total)}`} style={{color:'var(--fg-muted)',cursor:'default'}} />
            </div>
            <div className="input-group">
              <label>Motivo <span style={{color:'var(--danger)'}}>*</span></label>
              <select className="select" value={ndMotivo} onChange={e => setNdMotivo(e.target.value)}>
                <option value="">Seleccione motivo...</option>
                <option value="interes_mora">Interés por mora</option>
                <option value="ajuste_precio">Ajuste de precio</option>
                <option value="cargo_adicional">Cargo adicional</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="input-group">
              <label>Concepto del cargo</label>
              <input className="input" value={ndConcepto} onChange={e => setNdConcepto(e.target.value)} placeholder="Describe el cargo adicional..." />
            </div>
            <div className="grid-2" style={{gap:16}}>
              <div className="input-group">
                <label>Monto (sin IGV) <span style={{color:'var(--danger)'}}>*</span></label>
                <input className="input num" type="number" min="0" step="0.01" value={ndMonto} onChange={e => setNdMonto(e.target.value)} />
              </div>
              <div className="input-group">
                <label>IGV</label>
                <label style={{display:'flex',alignItems:'center',gap:8,height:36,cursor:'pointer'}}>
                  <input type="checkbox" checked={ndConIgv} onChange={e => setNdConIgv(e.target.checked)} />
                  <span style={{fontSize:13}}>Incluir IGV ({igvPctOrig}%)</span>
                </label>
              </div>
            </div>
            <div className="input-group">
              <label>Notas <span style={{color:'var(--fg-muted)',fontWeight:400}}>(opcional)</span></label>
              <textarea className="input" rows={2} value={ndNotas} onChange={e => setNdNotas(e.target.value)} placeholder="Observaciones adicionales..." />
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div className="card" style={{padding:'16px 20px'}}>
              <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:8}}>Resumen ND</div>
              <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
                <span className="text-muted" style={{fontSize:13}}>Subtotal</span>
                <span className="num">{money(ndSubtotal)}</span>
              </div>
              <div className="row" style={{justifyContent:'space-between',marginBottom:8}}>
                <span className="text-muted" style={{fontSize:13}}>IGV ({ndConIgv ? igvPctOrig : 0}%)</span>
                <span className="num">{money(ndIgvAmt)}</span>
              </div>
              <div className="row" style={{justifyContent:'space-between',paddingTop:8,borderTop:'1px solid var(--border)',fontWeight:700,fontFamily:'Sora',fontSize:16}}>
                <span>Total ND</span>
                <span className="num">{money(ndTotal)}</span>
              </div>
            </div>
            <div style={{padding:'12px 14px',borderRadius:8,border:'1px solid var(--cyan)',background:'color-mix(in srgb, var(--cyan) 6%, transparent)',fontSize:12}}>
              <div style={{fontWeight:600,color:'var(--cyan)',marginBottom:4}}>Efecto en CxC</div>
              El saldo de la CxC vinculada aumentará en <strong>{money(ndTotal)}</strong>. El cliente deberá pagar el monto adicional.
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Ficha detail view ─────────────────────────────────────────────────
  let fichaFac = null;
  if (selFac) {
    const f = (facturas||[]).find(x => x.id === selFac);
    if (f) {

    const cuenta = getCuenta(f.cuenta_id);
    const clienteNombreFac = cuenta?.razon_social || cuenta?.nombre_comercial || '—';
    const osVinc = getOs(f.os_cliente_id);
    const valVinc = getVal(f.valorizacion_id);
    const cxcVinc = (cxc||[]).find(c => c.factura_id === f.id);
    const facOrigen = f.factura_origen_id ? (facturas||[]).find(x => x.id === f.factura_origen_id) : null;
    const items = f.items || [];
    const fechaEmisionLabel = f.fecha_emision || '—';
    const editandoEmisionFac = editEmisionFac?.id === f.id;
    const fechaEmisionEditada = editandoEmisionFac ? editEmisionFac.fecha : (f.fecha_emision || today);
    const tituloEditarEmision = puedeEditarFacturacion ? 'Editar emisión' : 'Requiere permiso facturacion:editar';

    // Días para vencer / días vencida
    const diasVencer = (() => {
      if (!f.fecha_vencimiento) return null;
      return Math.ceil((new Date(f.fecha_vencimiento) - new Date(today)) / (1000*60*60*24));
    })();

    // Historial construido desde datos disponibles
    const movsCxC = cxcVinc ? (movimientosTesoreria||[]).filter(m => m.vinculo_id === cxcVinc.id || m.vinculo_tipo === 'cxc' && m.vinculo_id === cxcVinc.id).sort((a,b) => (a.fecha||'').localeCompare(b.fecha||'')) : [];
    const historialFac = [
      { tipo: 'emision', fecha: f.fecha_emision || '—', texto: `Factura emitida — ${TIPO_DOC_LABELS[f.tipo_documento]||'Factura'}` },
      ...movsCxC.map(m => ({ tipo: 'cobro', fecha: m.fecha||'—', texto: `Cobro registrado: ${moneyCurrency(m.monto, m.moneda || cxcVinc?.moneda || f.moneda)} — Ref: ${m.referencia||'—'}` })),
      ...(f.estado === 'anulada' ? [{ tipo: 'anulacion', fecha: '—', texto: `Anulada${f.motivo_anulacion ? ': '+f.motivo_anulacion : ''}` }] : []),
    ];

    const TABS_FAC = [
      { id:'detalle', label:'Detalle' },
      { id:'vinculaciones', label:'Vinculaciones' },
      { id:'historial', label:`Historial (${historialFac.length})` },
    ];

    const handleRegistrarPago = async () => {
      if (!cxcVinc || !montoPago) return;
      await registrarCobroCxC(cxcVinc.id, Number(montoPago), { fecha: fechaPago, referencia: refPago });
      setModalPago(false); setMontoPago(''); setRefPago(''); setFechaPago(today);
    };

    const handleAnular = () => {
      if (!motivoAnularFac.trim()) return;
      anularFactura(f.id, motivoAnularFac.trim());
      setModalAnularFac(false); setMotivoAnularFac(''); setSelFac(null);
    };

    const handleNcNd = tipo => {
      const tipoForm = tipo === 'nota_credito' ? 'nc' : 'nd';
      setNcndFacId(f.id);
      setNcndForm(tipoForm);
      setNcMotivo(''); setNcNotas(''); setNcDevolucion(false);
      setNcPartidasSel((f.items||[]).map((it,i) => ({
        id: it.id || `p_${i}`,
        sel: true,
        monto_acreditar: Number(it.cantidad||0) * Number(it.precio_unitario||0),
      })));
      setNdMotivo(''); setNdConcepto(''); setNdMonto(''); setNdConIgv(true); setNdNotas('');
    };

    fichaFac = (
      <>
        {/* Modal anular */}
        {modalAnularFac && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div className="card" style={{width:440,padding:28}}>
              <h3 style={{margin:'0 0 8px'}}>Anular Factura</h3>
              <div style={{fontSize:13,color:'var(--fg-muted)',marginBottom:16}}>
                Esta acción anulará la factura y la CxC vinculada si está pendiente de cobro.
              </div>
              <div className="input-group">
                <label>Motivo <span style={{color:'var(--danger)'}}>*</span></label>
                <textarea className="input" rows={3} value={motivoAnularFac} onChange={e => setMotivoAnularFac(e.target.value)} placeholder="Describe el motivo..." autoFocus />
              </div>
              <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
                <button className="btn btn-secondary" onClick={() => { setModalAnularFac(false); setMotivoAnularFac(''); }}>Cancelar</button>
                <button className="btn btn-danger" disabled={!motivoAnularFac.trim()} onClick={handleAnular}>Confirmar anulación</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal registrar pago */}
        {modalPago && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div className="card" style={{width:420,padding:28}}>
              <h3 style={{margin:'0 0 8px'}}>Registrar cobro</h3>
              {cxcVinc && (
                <div style={{fontSize:12,color:'var(--fg-muted)',marginBottom:16}}>
                  Saldo pendiente: <strong style={{color:'var(--orange)'}}>{money(cxcVinc.saldo||cxcVinc.monto_total||0)}</strong>
                </div>
              )}
              <div className="grid-2" style={{gap:12}}>
                <div className="input-group">
                  <label>Monto cobrado <span style={{color:'var(--danger)'}}>*</span></label>
                  <input className="input num" type="number" min="0" step="0.01" value={montoPago} onChange={e => setMontoPago(e.target.value)} autoFocus />
                </div>
                <div className="input-group">
                  <label>Fecha</label>
                  <input className="input" type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Referencia / Número de operación</label>
                  <input className="input" value={refPago} onChange={e => setRefPago(e.target.value)} placeholder="N° transferencia, cheque, etc." />
                </div>
              </div>
              <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
                <button className="btn btn-secondary" onClick={() => { setModalPago(false); setMontoPago(''); setRefPago(''); }}>Cancelar</button>
                <button className="btn btn-primary" disabled={!montoPago} onClick={handleRegistrarPago}>{I.check} Registrar cobro</button>
              </div>
            </div>
          </div>
        )}

        <div className="side-panel-backdrop" onClick={() => setSelFac(null)} />
        <div className="side-panel">
        {/* Header */}
        <div className="side-panel-head">
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {clienteNombreFac}{osVinc && <> · OS: {osVinc.numero}</>}{diasVencer !== null && <span style={{color:diasVencer<0?'var(--danger)':diasVencer<=7?'var(--orange)':'inherit'}}> · {diasVencer<0?`${Math.abs(diasVencer)}d vencida`:diasVencer===0?'Vence hoy':`${diasVencer}d para vencer`}</span>}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <strong style={{fontSize:16}}>{f.numero}</strong>
              <span style={{fontSize:12,color:'var(--fg-muted)',fontWeight:400}}>{TIPO_DOC_LABELS[f.tipo_documento]||'Factura'}</span>
              <span className={'badge '+(FAC_BADGE_CLASS[f.estado]||'badge-cyan')}>{FAC_BADGE_LABEL[f.estado]||f.estado}</span>
              {f.aplica_retencion && <span className="badge badge-orange" style={{fontSize:10}}>Retención SUNAT</span>}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            {['emitida','cobro_parcial'].includes(f.estado) && (
              <button className="btn btn-primary btn-sm" onClick={() => setModalPago(true)}>Registrar pago</button>
            )}
            <button className="icon-btn" onClick={() => setSelFac(null)}>{I.x}</button>
          </div>
        </div>
        <div className="side-panel-body">
          <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" style={{display:'none'}} onChange={e => { handleSubirFac(e.target.files[0], 'pdf'); e.target.value=''; }} />
          <input ref={zipInputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" style={{display:'none'}} onChange={e => { handleSubirFac(e.target.files[0], 'zip'); e.target.value=''; }} />
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
            {f.archivo_pdf_url ? (
              <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,background:'color-mix(in srgb,var(--green) 10%,transparent)',border:'1px solid var(--green)',borderRadius:6,padding:'4px 8px',color:'var(--green)'}}>
                <button type="button" className="btn btn-ghost" style={{padding:0,fontSize:12,fontWeight:700,gap:5,color:'var(--green)'}} onClick={() => window.open(f.archivo_pdf_url,'_blank','noopener,noreferrer')}>{I.download} PDF</button>
                <button type="button" className="icon-btn" style={{width:14,height:14,color:'var(--green)',opacity:0.6,flexShrink:0}} onClick={() => handleEliminarArchivoFac('pdf')}>{I.x}</button>
              </span>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" disabled={uploadingFac==='pdf'} onClick={() => pdfInputRef.current?.click()}>
                {uploadingFac==='pdf' ? 'Subiendo...' : <>{I.upload} PDF</>}
              </button>
            )}
            {f.archivo_zip_url ? (
              <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,background:'color-mix(in srgb,var(--green) 10%,transparent)',border:'1px solid var(--green)',borderRadius:6,padding:'4px 8px',color:'var(--green)'}}>
                <button type="button" className="btn btn-ghost" style={{padding:0,fontSize:12,fontWeight:700,gap:5,color:'var(--green)'}} onClick={() => window.open(f.archivo_zip_url,'_blank','noopener,noreferrer')}>{I.download} ZIP</button>
                <button type="button" className="icon-btn" style={{width:14,height:14,color:'var(--green)',opacity:0.6,flexShrink:0}} onClick={() => handleEliminarArchivoFac('zip')}>{I.x}</button>
              </span>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" disabled={uploadingFac==='zip'} onClick={() => zipInputRef.current?.click()}>
                {uploadingFac==='zip' ? 'Subiendo...' : <>{I.upload} ZIP</>}
              </button>
            )}
            {f.estado === 'emitida' && puedeEditarFacturacion && (
              <button className="btn btn-secondary btn-sm" onClick={() => { const igvDerived = f.subtotal > 0 ? Math.round(((f.igv||0)/f.subtotal)*100) : 18; setPanelEditFac({ id: f.id, esDirecta: !f.valorizacion_id, form: { numero: f.numero||'', fecha_emision: f.fecha_emision||today, condicion_pago: f.condicion_pago||'30 días', fecha_vencimiento: f.fecha_vencimiento||'', moneda: f.moneda||'PEN', glosa: f.glosa||'', notas: f.notas||'' }, items: (f.items||[]).length > 0 ? f.items.map((it,i) => ({...it, id: it.id||`ep_${i}`})) : [{ id: Date.now(), descripcion:'', cantidad:1, precio_unitario:'' }], igvPct: igvDerived }); }}>{I.edit} Editar</button>
            )}
            {f.estado === 'emitida' && <button className="btn btn-secondary btn-sm" onClick={() => handleNcNd('nota_credito')}>Nota de Crédito</button>}
            {f.estado === 'emitida' && <button className="btn btn-secondary btn-sm" onClick={() => handleNcNd('nota_debito')}>Nota de Débito</button>}
            {f.estado === 'cobro_parcial' && <button className="btn btn-secondary btn-sm" onClick={() => handleNcNd('nota_credito')}>Nota de Crédito</button>}
            {f.estado === 'emitida' && <button className="btn btn-secondary btn-sm" style={{color:'var(--danger)',borderColor:'var(--danger)'}} onClick={() => setModalAnularFac(true)}>Anular</button>}
            {esAnuladaSinNC(f) && puedeEditarFacturacion && (
              <button className="btn btn-secondary btn-sm" style={{color:'var(--green)',borderColor:'var(--green)'}} onClick={() => { if (window.confirm(`¿Restaurar ${f.numero} a emitida?`)) restaurarFacturaPorError(f.id); }}>{I.check} Restaurar</button>
            )}
          </div>
          {facOrigen && (
            <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13,padding:'8px 12px',borderRadius:6,background:'color-mix(in srgb,var(--cyan) 8%,transparent)',border:'1px solid color-mix(in srgb,var(--cyan) 25%,transparent)',marginBottom:12}}>
              <span style={{color:'var(--fg-muted)'}}>Vinculada a:</span>
              <button type="button" className="btn btn-ghost" style={{padding:0,fontWeight:700,color:'var(--cyan)',fontSize:13}} onClick={() => setSelFac(facOrigen.id)}>{facOrigen.numero}</button>
              <span className={'badge '+(FAC_BADGE_CLASS[facOrigen.estado]||'badge-cyan')} style={{fontSize:10}}>{FAC_BADGE_LABEL[facOrigen.estado]||facOrigen.estado}</span>
            </div>
          )}
          {esAnuladaSinNC(f) && (
            <div style={{fontSize:13,padding:'8px 14px',borderRadius:6,background:'rgba(234,179,8,0.08)',border:'1px solid var(--orange)',marginBottom:12}}>
              Anulada directamente (sin NC). Puedes restaurar si fue un error.
            </div>
          )}
          {/* Info cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12,marginBottom:16}}>
          <div className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Cliente</div>
            <div style={{fontWeight:600,fontSize:13}}>{clienteNombreFac}</div>
            <div style={{fontSize:12,color:'var(--fg-muted)'}}>RUC: {cuenta?.ruc||'—'}</div>
          </div>
          <div className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Condición de pago</div>
            <div style={{fontWeight:600}}>{CONDICION_LABELS[f.condicion_pago]||f.condicion_pago||'—'}</div>
            <div style={{fontSize:12,color:'var(--fg-muted)'}}>Moneda: {f.moneda||'PEN'}</div>
          </div>
          <div className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>CxC</div>
            <div style={{fontWeight:600}}>{cxcVinc ? moneyCurrency(cxcVinc.saldo||0, f.moneda) : '—'}</div>
            <div style={{fontSize:12,color:'var(--fg-muted)'}}>
              {cxcVinc ? (FAC_BADGE_LABEL[cxcVinc.estado]||cxcVinc.estado) : 'Sin CxC'}
            </div>
          </div>
          <div className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Total</div>
            <div style={{fontWeight:700,fontSize:18,fontFamily:'Sora',color:'var(--cyan)'}}>{moneyCurrency(f.total||0, f.moneda)}</div>
            <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:2}}>IGV: {moneyCurrency(f.igv||0, f.moneda)}</div>
          </div>
        </div>

        {f.estado === 'anulada' && f.motivo_anulacion && (
          <div style={{marginBottom:16,padding:'12px 16px',borderRadius:8,border:'1px solid var(--danger)',background:'color-mix(in srgb, var(--danger) 6%, transparent)'}}>
            <div style={{fontWeight:600,fontSize:13,color:'var(--danger)',marginBottom:4}}>Motivo de anulación</div>
            <div style={{fontSize:13}}>{f.motivo_anulacion}</div>
          </div>
        )}

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'2px solid var(--border)',marginBottom:16,gap:0}}>
          {TABS_FAC.map(t => (
            <button key={t.id} className="btn btn-ghost"
              onClick={() => setFichaTab(t.id)}
              style={{borderRadius:0,padding:'10px 20px',fontWeight:fichaTab===t.id?700:400,
                borderBottom:fichaTab===t.id?'2px solid var(--cyan)':'2px solid transparent',
                marginBottom:-2,color:fichaTab===t.id?'var(--cyan)':'var(--fg-muted)'}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Detalle */}
        {fichaTab === 'detalle' && (
          <div className="card">
            {items.length > 0 ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th style={{width:80}} className="num">Cant.</th>
                      <th style={{width:140}} className="num">P. Unitario</th>
                      <th style={{width:140}} className="num">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item,i) => (
                      <tr key={i}>
                        <td>{item.descripcion||'—'}</td>
                        <td className="num">{item.cantidad}</td>
                        <td className="num">{moneyCurrency(item.precio_unitario, f.moneda)}</td>
                        <td className="num" style={{fontWeight:600}}>{moneyCurrency(Number(item.cantidad)*Number(item.precio_unitario), f.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card-body" style={{textAlign:'center',color:'var(--fg-muted)',fontSize:13}}>Sin partidas registradas.</div>
            )}
            <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)'}}>
              <div style={{width:280,marginLeft:'auto'}}>
                <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
                  <span className="text-muted" style={{fontSize:13}}>Subtotal</span>
                  <span className="num">{moneyCurrency(f.subtotal, f.moneda)}</span>
                </div>
                <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
                  <span className="text-muted" style={{fontSize:13}}>IGV</span>
                  <span className="num">{moneyCurrency(f.igv, f.moneda)}</span>
                </div>
                <div className="row" style={{justifyContent:'space-between',paddingTop:6,borderTop:'1px solid var(--border)',fontWeight:700,fontSize:15,fontFamily:'Sora'}}>
                  <span>Total facturado</span>
                  <span className="num">{moneyCurrency(f.total, f.moneda)}</span>
                </div>
                {f.aplica_retencion && (
                  <>
                    <div className="row" style={{justifyContent:'space-between',marginTop:8,paddingTop:6,borderTop:'1px dashed rgba(251,191,36,0.4)'}}>
                      <span style={{fontSize:13,color:'var(--warning)',fontWeight:600}}>Retención SUNAT</span>
                      <span style={{fontSize:13,fontWeight:700,color:'var(--warning)'}}>- {moneyCurrency(f.monto_retencion||0, f.moneda)}</span>
                    </div>
                    <div className="row" style={{justifyContent:'space-between',paddingTop:6,borderTop:'1px solid var(--border)',fontWeight:700,fontSize:15,fontFamily:'Sora',color:'var(--cyan)'}}>
                      <span>Neto a cobrar</span>
                      <span className="num">{moneyCurrency(f.monto_neto_cobrable ?? (f.total-(f.monto_retencion||0)), f.moneda)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            {(f.glosa||f.notas) && (
              <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
                {f.glosa && <div><span style={{fontSize:11,color:'var(--fg-muted)'}}>Glosa: </span><span style={{fontSize:13}}>{f.glosa}</span></div>}
                {f.notas && <div><span style={{fontSize:11,color:'var(--fg-muted)'}}>Notas: </span><span style={{fontSize:13,whiteSpace:'pre-wrap'}}>{f.notas}</span></div>}
              </div>
            )}
          </div>
        )}

        {/* Tab: Vinculaciones */}
        {fichaTab === 'vinculaciones' && (
          <div className="card card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
            {facOrigen && (
              <div style={{padding:'12px 14px',borderRadius:6,border:'1px solid color-mix(in srgb,var(--cyan) 30%,transparent)',background:'color-mix(in srgb,var(--cyan) 5%,transparent)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:11,color:'var(--cyan)',fontWeight:600,marginBottom:4,textTransform:'uppercase',letterSpacing:0.5}}>Factura origen</div>
                  <div style={{fontWeight:700,fontSize:15}}>{facOrigen.numero}</div>
                  <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:3,display:'flex',gap:12,alignItems:'center'}}>
                    <span>Total: <strong>{moneyCurrency(facOrigen.total, facOrigen.moneda)}</strong></span>
                    <span>Emitida: {facOrigen.fecha_emision||'—'}</span>
                    <span className={'badge '+(FAC_BADGE_CLASS[facOrigen.estado]||'badge-cyan')} style={{fontSize:10}}>{FAC_BADGE_LABEL[facOrigen.estado]||facOrigen.estado}</span>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" style={{fontSize:11}} onClick={() => setSelFac(facOrigen.id)}>Ver factura</button>
              </div>
            )}
            <div style={{padding:'12px 14px',borderRadius:6,border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Valorización vinculada</div>
                <div style={{fontWeight:600}}>{valVinc?.numero||'—'}</div>
                {valVinc && <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:2}}>Estado: {valVinc.estado} · Total: {moneyCurrency(valVinc.total, valVinc.moneda || f.moneda)}</div>}
              </div>
              {valVinc && <button className="btn btn-secondary btn-sm" style={{fontSize:11}} onClick={() => navigate('valorizaciones',{detail:valVinc.id})}>Ver valorización</button>}
              {!valVinc && <span style={{fontSize:12,color:'var(--fg-muted)'}}>Sin valorización</span>}
            </div>
            <div style={{padding:'12px 14px',borderRadius:6,border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>OS Cliente</div>
                <div style={{fontWeight:600}}>{osVinc?.numero||'—'}</div>
                {osVinc && <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:2}}>Monto aprobado: {moneyCurrency(osVinc.monto_aprobado, osVinc.moneda || f.moneda)}</div>}
              </div>
              {osVinc && <button className="btn btn-secondary btn-sm" style={{fontSize:11}} onClick={() => navigate('os_clientes',{detail:osVinc.id})}>Ver OS</button>}
              {!osVinc && <span style={{fontSize:12,color:'var(--fg-muted)'}}>Sin OS vinculada</span>}
            </div>
            <div style={{padding:'12px 14px',borderRadius:6,border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>Cuenta por Cobrar</div>
                {cxcVinc ? (
                  <>
                    <div style={{fontWeight:600}}>{moneyCurrency(cxcVinc.monto_total||0, cxcVinc.moneda || f.moneda)}</div>
                    <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:2,display:'flex',gap:12}}>
                      <span>Pagado: {moneyCurrency(cxcVinc.monto_pagado||0, cxcVinc.moneda || f.moneda)}</span>
                      <span>Saldo: <strong style={{color:'var(--orange)'}}>{moneyCurrency(cxcVinc.saldo||0, cxcVinc.moneda || f.moneda)}</strong></span>
                      <span className={'badge '+(FAC_BADGE_CLASS[cxcVinc.estado]||'badge-cyan')} style={{fontSize:10}}>{FAC_BADGE_LABEL[cxcVinc.estado]||cxcVinc.estado}</span>
                    </div>
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:4}}>Vence: {cxcVinc.fecha_vencimiento||'—'}</div>
                  </>
                ) : (
                  <div>
                    <div style={{fontWeight:400,color:'var(--fg-muted)',marginBottom:8}}>Sin CxC generada</div>
                    {f.estado !== 'anulada' && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={generandoCxC}
                        onClick={() => generarCxCDesdeFac(f)}
                      >
                        {generandoCxC ? 'Generando...' : '+ Generar CxC'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {cxcVinc && <button className="btn btn-secondary btn-sm" style={{fontSize:11}} onClick={() => navigate('cxc')}>Ver CxC</button>}
            </div>
          </div>
        )}

        {/* Tab: Historial */}
        {fichaTab === 'historial' && (
          <div className="card card-body">
            {historialFac.length === 0 ? (
              <div style={{textAlign:'center',color:'var(--fg-muted)',fontSize:13,padding:24}}>Sin eventos registrados.</div>
            ) : historialFac.map((h,i) => (
              <div key={i} style={{display:'flex',gap:14,padding:'10px 0',borderBottom:i<historialFac.length-1?'1px solid var(--border)':'none'}}>
                <div style={{
                  width:8,height:8,borderRadius:'50%',marginTop:5,flexShrink:0,
                  background: h.tipo==='cobro' ? 'var(--green)' : h.tipo==='anulacion' ? 'var(--danger)' : 'var(--cyan)',
                }}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{h.texto}</div>
                  <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:2}}>{h.fecha}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {renderPanelEditFac()}
        </div>{/* end side-panel-body */}
        </div>{/* end side-panel */}
      </>
    );
    } // end if (f)
  } // end if (selFac)

  // ── Form view (shared for both modes) ─────────────────────────────────
  if (mode) {
    const valSrc = mode === 'val' ? getVal(valSel) : null;
    const osSrc = getOs(valSrc?.os_cliente_id || osSel);
    const osesDelCliente = cuentaSel ? osClientes.filter(os => os.cuenta_id === cuentaSel && os.estado === 'activa') : [];

    return (
      <>
        <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
          <div>
            <button className="btn btn-ghost" onClick={() => setMode(null)} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>
              ← Volver a Facturación
            </button>
            <h1 className="page-title">{mode === 'val' ? 'Factura desde Valorización' : 'Comprobante Directo'}</h1>
            <div className="page-sub">
              {mode === 'val' ? 'Emite la factura y genera la CxC automáticamente desde una valorización aprobada.' : 'Emite factura o boleta sin valorización previa — mensualidad, anticipo, servicio puntual.'}
            </div>
          </div>
          <div className="row" style={{gap:10}}>
            <button className="btn btn-secondary" onClick={() => setMode(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardar} disabled={saving || (mode === 'val' && !valSel) || (!cuentaSel && mode === 'directa') || (excedeOsSaldo && !confirmarExcesoFac)}>
              {saving ? 'Emitiendo...' : <>{I.check} Emitir factura</>}
            </button>
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 360px', gap:20, marginTop:20}}>
          {/* Left — main form */}
          <div style={{display:'flex', flexDirection:'column', gap:16}}>

            {/* Banner origen venta */}
            {ventaContextId && (
              <div style={{padding:'10px 14px',borderRadius:8,background:'color-mix(in srgb,var(--cyan) 8%,transparent)',border:'1px solid color-mix(in srgb,var(--cyan) 30%,transparent)',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:13}}>
                <span>Facturando desde venta — <strong>{ventaCtxLabel || ventaContextId}</strong></span>
                <button type="button" className="btn btn-ghost" style={{fontSize:11,padding:0,color:'var(--fg-muted)'}} onClick={() => { setVentaContextId(null); setVentaCtxLabel(''); }}>Descartar vínculo</button>
              </div>
            )}

            {/* Tipo y número */}
            <div className="card card-body">
              <div className="grid-2" style={{gap:16}}>
                <div className="input-group">
                  <label>Tipo de documento</label>
                  <select className="select" value={form.tipo_documento} onChange={e => handleFormChange('tipo_documento', e.target.value)}>
                    <option value="factura">Factura</option>
                    <option value="boleta">Boleta de Venta</option>
                    <option value="nota_credito">Nota de Crédito</option>
                    <option value="nota_debito">Nota de Débito</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Número <span style={{fontWeight:400,color:'var(--fg-muted)',fontSize:11}}>(editable)</span></label>
                  <input className="input mono" value={form.numero} onChange={e => handleFormChange('numero', e.target.value)} placeholder={nextNumero} />
                  {form.numero === nextNumero && <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:3}}>Número auto-generado — cámbialo si usas otra serie (ej. E001-16)</div>}
                </div>
              </div>
            </div>

            {/* Origen */}
            <div className="card card-body">
              <h3 style={{margin:'0 0 14px', fontSize:14}}>Origen</h3>
              {mode === 'val' ? (
                <div className="input-group">
                  <label>Valorización aprobada <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="select" value={valSel} onChange={e => handleSelectVal(e.target.value)}>
                    <option value="">Seleccione valorización...</option>
                    {valsParaFacturar.map(v => {
                      const os = getOs(v.os_cliente_id);
                      return <option key={v.id} value={v.id}>{v.numero} — {cuentaNombre(os?.cuenta_id)} — {moneyCurrency(v.total||0, v.moneda)}</option>;
                    })}
                  </select>
                  {valsParaFacturar.length === 0 && (
                    <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:6}}>No hay valorizaciones aprobadas sin facturar.</div>
                  )}
                </div>
              ) : (
                <div className="grid-2" style={{gap:16}}>
                  <div className="input-group" style={{gridColumn:'1/-1'}}>
                    <label>Cliente <span style={{color:'var(--danger)'}}>*</span></label>
                    <select className="select" value={cuentaSel} onChange={e => handleSelectCuenta(e.target.value)}>
                      <option value="">Seleccione cliente...</option>
                      {(cuentas||[]).filter(c => c.estado !== 'inactivo').map(c => (
                        <option key={c.id} value={c.id}>{c.razon_social || c.nombre_comercial}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group" style={{gridColumn:'1/-1'}}>
                    <label>OS Cliente <span style={{color:'var(--fg-muted)', fontWeight:400}}>(opcional)</span></label>
                    <select className="select" value={osSel} onChange={e => setOsSel(e.target.value)}>
                      <option value="">Sin OS asociada</option>
                      {osesDelCliente.map(os => <option key={os.id} value={os.id}>{os.numero} — {money(os.monto_aprobado||0)}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {valSrc && (
                <div style={{marginTop:12, padding:'10px 14px', borderRadius:6, background:'var(--bg-subtle)', fontSize:12, display:'flex', gap:24, flexWrap:'wrap'}}>
                  <span>OS: <strong>{osSrc?.numero || '—'}</strong></span>
                  <span>Cliente: <strong>{cuentaNombre(osSrc?.cuenta_id)}</strong></span>
                  <span>Período: <strong>{valSrc.periodo || '—'}</strong></span>
                  <span>Moneda: <strong>{valSrc.moneda || 'PEN'}</strong></span>
                </div>
              )}
            </div>

            {/* Partidas */}
            <div className="card">
              <div style={{padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <h3 style={{margin:0, fontSize:14}}>Partidas</h3>
                <button className="btn btn-secondary btn-sm" onClick={addPartida}>{I.plus} Agregar línea</button>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th style={{width:90}}>Cant.</th>
                      <th style={{width:140}}>P. Unitario</th>
                      <th style={{width:130}} className="num">Subtotal</th>
                      <th style={{width:40}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {partidas.map(p => (
                      <tr key={p.id}>
                        <td><input type="text" className="input" value={p.descripcion} onChange={e => updatePartida(p.id, 'descripcion', e.target.value)} /></td>
                        <td><input type="number" className="input num" min="1" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', e.target.value)} /></td>
                        <td><input type="number" className="input num" min="0" step="0.01" value={p.precio_unitario} onChange={e => updatePartida(p.id, 'precio_unitario', e.target.value)} /></td>
                        <td className="num" style={{fontWeight:600}}>{moneyCurrency(Number(p.cantidad||0) * Number(p.precio_unitario||0), form.moneda)}</td>
                        <td><button className="icon-btn text-danger" onClick={() => removePartida(p.id)}>{I.x}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{padding:'12px 16px', borderTop:'1px solid var(--border)'}}>
                <div style={{width:280, marginLeft:'auto'}}>
                  {!esBoleta && (
                    <>
                      <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                        <span className="text-muted" style={{fontSize:13}}>Subtotal</span>
                        <span className="num">{moneyCurrency(subtotalCalc, form.moneda)}</span>
                      </div>
                      <div className="row" style={{justifyContent:'space-between', marginBottom:6, alignItems:'center'}}>
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <span className="text-muted" style={{fontSize:13}}>IGV</span>
                          <input type="number" className="input num" min="0" max="100" style={{width:56, padding:'3px 6px', fontSize:12}}
                            value={igvPct} onChange={e => setIgvPct(Number(e.target.value))} />
                          <span style={{fontSize:12, color:'var(--fg-muted)'}}>%</span>
                        </div>
                        <span className="num">{moneyCurrency(igvCalc, form.moneda)}</span>
                      </div>
                    </>
                  )}
                  <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)', fontWeight:700, fontSize:16, fontFamily:'Sora'}}>
                    <span>Total</span>
                    <span className="num">{moneyCurrency(totalCalc, form.moneda)}</span>
                  </div>
                  {esBoleta && (
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:4,textAlign:'right'}}>IGV incluido — {igvPct}%</div>
                  )}
                </div>
              </div>
            </div>

            {/* Glosa y notas */}
            <div className="card card-body">
              <div className="input-group" style={{marginBottom:14}}>
                <label>Glosa <span style={{color:'var(--fg-muted)', fontWeight:400}}>(opcional)</span></label>
                <input className="input" value={form.glosa} onChange={e => handleFormChange('glosa', e.target.value)} placeholder="Por servicios de mantenimiento según OS N°..." />
              </div>
              <div className="input-group">
                <label>Notas adicionales <span style={{color:'var(--fg-muted)', fontWeight:400}}>(opcional)</span></label>
                <textarea className="input" rows={2} value={form.notas} onChange={e => handleFormChange('notas', e.target.value)} placeholder="Instrucciones de pago, cuentas bancarias, etc." />
              </div>
            </div>
          </div>

          {/* Right — sidebar */}
          <div style={{display:'flex', flexDirection:'column', gap:16}}>
            <div className="card card-body">
              <h3 style={{margin:'0 0 14px', fontSize:14}}>Fechas y cobro</h3>
              <div className="input-group" style={{marginBottom:12}}>
                <label>Fecha de emisión</label>
                <input className="input" type="date" value={form.fecha_emision} onChange={e => handleFormChange('fecha_emision', e.target.value)} />
              </div>
              <div className="input-group" style={{marginBottom:12}}>
                <label>Condición de pago</label>
                <select className="select" value={form.condicion_pago} onChange={e => handleFormChange('condicion_pago', e.target.value)}>
                  {CONDICION_PAGO_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div className="input-group" style={{marginBottom:12}}>
                <label>Fecha de vencimiento</label>
                <input className="input" type="date" value={form.fecha_vencimiento} onChange={e => handleFormChange('fecha_vencimiento', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Moneda</label>
                <select className="select" value={form.moneda} onChange={e => handleFormChange('moneda', e.target.value)}>
                  <option value="PEN">Soles (PEN)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
            </div>

            {/* Cliente info */}
            {cuentaSel && (
              <div className="card card-body">
                <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:8}}>Datos del cliente</div>
                <div style={{fontWeight:600, marginBottom:4}}>{cuentaNombre(cuentaSel)}</div>
                <div style={{fontSize:12, color:'var(--fg-muted)'}}>RUC: {rucCliente(cuentaSel)}</div>
              </div>
            )}

            {/* Bloque retención SUNAT */}
            {clienteRetencion.aplica && totalCalc > 0 && (
              <div style={{padding:'12px 14px', borderRadius:8, border:'2px solid rgba(251,191,36,0.4)', background:'rgba(251,191,36,0.06)'}}>
                <div style={{fontWeight:700, fontSize:13, color:'var(--warning)', marginBottom:10}}>⚠ Agente de Retención SUNAT ({clienteRetencion.tasa}%)</div>
                {[
                  ['Total facturado', moneyCurrency(totalCalc, form.moneda), null],
                  [`Retención SUNAT (${clienteRetencion.tasa}%)`, `- ${moneyCurrency(retencionCalc, form.moneda)}`, 'var(--warning)'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4}}>
                    <span style={{color:'var(--fg-muted)'}}>{label}</span>
                    <span style={{fontWeight:600, color: color || 'var(--fg)'}}>{val}</span>
                  </div>
                ))}
                <div style={{display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700, borderTop:'1px solid rgba(251,191,36,0.3)', paddingTop:8, marginTop:4}}>
                  <span>Neto a cobrar</span>
                  <span style={{color:'var(--cyan)', fontFamily:'Sora'}}>{moneyCurrency(netoCobrableCalc, form.moneda)}</span>
                </div>
                <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:8}}>El cliente retendrá este monto al momento del pago. No afecta el Estado de Resultados — es crédito fiscal ante SUNAT.</div>
              </div>
            )}

            {/* P7.3 — aviso exceso saldo OS */}
            {excedeOsSaldo && (
              <div className="card card-body" style={{border:'1px solid var(--warning)', background:'color-mix(in srgb, var(--warning) 8%, transparent)'}}>
                <div style={{fontWeight:600, fontSize:13, color:'var(--warning)', marginBottom:6}}>Total supera saldo OS</div>
                <div style={{fontSize:12, color:'var(--fg-muted)', marginBottom:10}}>
                  El total ({moneyCurrency(totalCalc, form.moneda)}) supera el saldo por facturar ({moneyCurrency(Number(osParaValidar?.saldo_por_facturar || 0), form.moneda)}). ¿Deseas continuar igualmente?
                </div>
                <label style={{display:'flex', gap:8, alignItems:'center', fontSize:13, cursor:'pointer'}}>
                  <input type="checkbox" checked={confirmarExcesoFac} onChange={e => setConfirmarExcesoFac(e.target.checked)} />
                  Confirmo que el exceso es intencional
                </label>
              </div>
            )}

            {/* Total resumen */}
            <div className="card" style={{padding:'16px 20px', background:'color-mix(in srgb, var(--cyan) 6%, transparent)', border:'1px solid color-mix(in srgb, var(--cyan) 20%, transparent)'}}>
              <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Total a facturar</div>
              <div style={{fontSize:28, fontWeight:700, fontFamily:'Sora', color:'var(--cyan)'}}>{moneyCurrency(totalCalc, form.moneda)}</div>
              <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Vence: {form.fecha_vencimiento || '—'}</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────
  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const facMes = (facturas||[]).filter(f => f.estado !== 'anulada' && (f.fecha_emision||'').startsWith(mesActual));
  const montoMesPEN = facMes.filter(f => (f.moneda||'PEN') !== 'USD').reduce((s,f) => s + Number(f.total||0), 0);
  const montoMesUSD = facMes.filter(f => (f.moneda||'PEN') === 'USD').reduce((s,f) => s + Number(f.total||0), 0);
  const facPendiente = (facturas||[]).filter(f => ['emitida','cobro_parcial'].includes(f.estado));
  const montoPendientePEN = facPendiente.filter(f => (f.moneda||'PEN') !== 'USD').reduce((s,f) => s + Number(f.total||0), 0);
  const montoPendienteUSD = facPendiente.filter(f => (f.moneda||'PEN') === 'USD').reduce((s,f) => s + Number(f.total||0), 0);

  const clienteOpts = [...new Map((facturas||[]).map(f => [f.cuenta_id, cuentaNombre(f.cuenta_id)])).entries()].filter(([k]) => k);
  const hasFilters = fCliente||fTipo||fEstado||fMoneda||fEmitDesde||fEmitHasta||fVenceDesde||fVenceHasta;
  const q = (searchQuery||'').toLowerCase();
  const filtered = (facturas||[]).filter(f => {
    if (fCliente && f.cuenta_id !== fCliente) return false;
    if (fTipo && f.tipo_documento !== fTipo) return false;
    if (fEstado && f.estado !== fEstado) return false;
    if (fMoneda && (f.moneda||'PEN') !== fMoneda) return false;
    if (fEmitDesde && (f.fecha_emision||'') < fEmitDesde) return false;
    if (fEmitHasta && (f.fecha_emision||'') > fEmitHasta) return false;
    if (fVenceDesde && (f.fecha_vencimiento||'') < fVenceDesde) return false;
    if (fVenceHasta && (f.fecha_vencimiento||'') > fVenceHasta) return false;
    if (q) return (f.numero||'').toLowerCase().includes(q) || cuentaNombre(f.cuenta_id).toLowerCase().includes(q);
    return true;
  });

  return (
    <>
      {fichaFac}
      <div className="page-header">
        <div>
          <h1 className="page-title">Facturación</h1>
          <div className="page-sub">{(facturas||[]).length} facturas · {valsParaFacturar.length} valorizaciones listas para facturar</div>
        </div>
        <div className="row" style={{gap:10}}>
          <button className="btn btn-secondary" onClick={() => openMode('directa')}>{I.plus} Factura directa</button>
          <button className="btn btn-primary" onClick={() => openMode('val')} disabled={valsParaFacturar.length === 0}>{I.plus} Desde valorización</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card">
          <div className="kpi-label">Facturas emitidas este mes</div>
          <div className="kpi-value" style={{marginTop:12}}>{facMes.length}</div>
          <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Documentos emitidos</div>
          <div className="kpi-icon cyan">{I.receipt}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Facturado este mes</div>
          <div className="kpi-value" style={{fontSize:20, display:'flex', flexDirection:'column', gap:4, marginTop:12}}>
            <span>{money(montoMesPEN)}</span>
            {montoMesUSD > 0 && <span style={{fontSize:16, color:'var(--fg-muted)'}}>{money(montoMesUSD, 'US$')}</span>}
          </div>
          <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>{facMes.length} facturas</div>
          <div className="kpi-icon green">{I.dollar}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pendiente de cobro</div>
          <div className="kpi-value" style={{fontSize:20, display:'flex', flexDirection:'column', gap:4, marginTop:12, color:'var(--orange)'}}>
            <span>{money(montoPendientePEN)}</span>
            {montoPendienteUSD > 0 && <span style={{fontSize:16}}>{money(montoPendienteUSD, 'US$')}</span>}
          </div>
          <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Emitidas + cobro parcial</div>
          <div className="kpi-icon orange">{I.clock}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Valorizaciones por facturar</div>
          <div className="kpi-value" style={{marginTop:12}}>{valsParaFacturar.length}</div>
          <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Aprobadas sin factura</div>
          <div className="kpi-icon cyan">{I.clipboard}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{marginBottom:8}}>
        <div style={{padding:'12px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
          <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={fCliente} onChange={e => setFCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clienteOpts.map(([id,nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={fTipo} onChange={e => setFTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {Object.entries(TIPO_DOC_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="select" style={{flex:'1 1 140px', minWidth:120}} value={fEstado} onChange={e => setFEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(FAC_BADGE_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="select" style={{flex:'1 1 110px', minWidth:100}} value={fMoneda} onChange={e => setFMoneda(e.target.value)}>
            <option value="">Todas las monedas</option>
            <option value="PEN">S/ Soles (PEN)</option>
            <option value="USD">US$ Dólares (USD)</option>
          </select>
          <div style={{display:'flex', alignItems:'center', gap:6, flex:'1 1 220px'}}>
            <span style={{fontSize:12, color:'var(--fg-muted)', whiteSpace:'nowrap'}}>Emisión:</span>
            <input className="input" type="date" style={{flex:1}} value={fEmitDesde} onChange={e => setFEmitDesde(e.target.value)} title="Desde" />
            <input className="input" type="date" style={{flex:1}} value={fEmitHasta} onChange={e => setFEmitHasta(e.target.value)} title="Hasta" />
          </div>
          <div style={{display:'flex', alignItems:'center', gap:6, flex:'1 1 220px'}}>
            <span style={{fontSize:12, color:'var(--fg-muted)', whiteSpace:'nowrap'}}>Vence:</span>
            <input className="input" type="date" style={{flex:1}} value={fVenceDesde} onChange={e => setFVenceDesde(e.target.value)} title="Desde" />
            <input className="input" type="date" style={{flex:1}} value={fVenceHasta} onChange={e => setFVenceHasta(e.target.value)} title="Hasta" />
          </div>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFCliente(''); setFTipo(''); setFEstado(''); setFMoneda(''); setFEmitDesde(''); setFEmitHasta(''); setFVenceDesde(''); setFVenceHasta(''); }}>
              {I.x} Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° Factura</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Valorización</th>
                <th>OS Cliente</th>
                <th className="num">Subtotal</th>
                <th className="num">IGV</th>
                <th className="num">Total</th>
                <th>F. Emisión</th>
                <th>F. Vencimiento</th>
                <th>Estado</th>
                <th style={{textAlign:'center',width:64}}>Docs</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => {
                const os = getOs(f.os_cliente_id);
                const val = (valorizaciones||[]).find(v => v.id === f.valorizacion_id);
                return (
                  <tr key={f.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => { setSelFac(f.id); setFichaTab('detalle'); }}>
                    <td className="mono" style={{fontWeight:600}}>{f.numero || f.id}</td>
                    <td style={{maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{f.cuentas?.razon_social || cuentaNombre(f.cuenta_id)}</td>
                    <td style={{fontSize:12}}>{TIPO_DOC_LABELS[f.tipo_documento] || f.tipo_documento || 'Factura'}</td>
                    <td className="mono text-muted" style={{fontSize:12}}>{val?.numero || f.valorizaciones?.numero || '—'}</td>
                    <td className="mono text-muted" style={{fontSize:12}}>{os?.numero || '—'}</td>
                    <td className="num">{moneyCurrency(f.subtotal, f.moneda)}</td>
                    <td className="num">{moneyCurrency(f.igv, f.moneda)}</td>
                    <td className="num" style={{fontWeight:600}}>{moneyCurrency(f.total || f.monto, f.moneda)}</td>
                    <td className="text-muted">{f.fecha_emision || '—'}</td>
                    <td className="text-muted">{f.fecha_vencimiento || '—'}</td>
                    <td style={{whiteSpace:'nowrap'}}>
                      <span className={'badge ' + (FAC_BADGE_CLASS[f.estado] || 'badge-cyan')}>
                        {FAC_BADGE_LABEL[f.estado] || f.estado || '—'}
                      </span>
                      {esAnuladaSinNC(f) && puedeEditarFacturacion && (
                        <span
                          title="Anulada por error — haz clic para restaurarla"
                          style={{marginLeft:8,fontSize:11,color:'var(--orange)',fontWeight:600,cursor:'pointer',textDecoration:'underline'}}
                          onClick={e => { e.stopPropagation(); setSelFac(f.id); setFichaTab('detalle'); }}
                        >
                          ↩ Restaurar
                        </span>
                      )}
                    </td>
                    <td style={{textAlign:'center'}} onClick={e => e.stopPropagation()}>
                      <span style={{display:'inline-flex',gap:4,alignItems:'center'}}>
                        <span
                          title={f.archivo_pdf_url ? 'PDF adjunto' : 'Sin PDF'}
                          style={{fontSize:10,fontWeight:700,padding:'2px 5px',borderRadius:4,
                            background: f.archivo_pdf_url ? 'color-mix(in srgb,var(--green) 15%,transparent)' : 'var(--surface-2)',
                            color: f.archivo_pdf_url ? 'var(--green)' : 'var(--fg-muted)',
                            border: `1px solid ${f.archivo_pdf_url ? 'var(--green)' : 'var(--border)'}`,
                            cursor: f.archivo_pdf_url ? 'pointer' : 'default',
                          }}
                          onClick={() => f.archivo_pdf_url && window.open(f.archivo_pdf_url,'_blank','noopener,noreferrer')}
                        >PDF</span>
                        <span
                          title={f.archivo_zip_url ? 'ZIP adjunto' : 'Sin ZIP'}
                          style={{fontSize:10,fontWeight:700,padding:'2px 5px',borderRadius:4,
                            background: f.archivo_zip_url ? 'color-mix(in srgb,var(--green) 15%,transparent)' : 'var(--surface-2)',
                            color: f.archivo_zip_url ? 'var(--green)' : 'var(--fg-muted)',
                            border: `1px solid ${f.archivo_zip_url ? 'var(--green)' : 'var(--border)'}`,
                            cursor: f.archivo_zip_url ? 'pointer' : 'default',
                          }}
                          onClick={() => f.archivo_zip_url && window.open(f.archivo_zip_url,'_blank','noopener,noreferrer')}
                        >ZIP</span>
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="icon-btn" title="Ver detalle" onClick={() => { setSelFac(f.id); setFichaTab('detalle'); }}>{I.eye}</button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="12" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>
                  {q || hasFilters ? 'No se encontraron resultados' : 'No hay facturas registradas'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel lateral: Editar factura */}
      {renderPanelEditFac()}
    </>
  );
}

// ============ VENTAS ============
const VENTA_ESTADOS = [
  ['borrador',   'Borrador'],
  ['confirmada', 'Confirmada'],
  ['facturada',  'Facturada'],
  ['anulada',    'Anulada'],
];
const VENTA_FORM_INIT = {
  fecha: new Date().toISOString().split('T')[0],
  cuenta_id: '',
  concepto: '',
  monto_total: '',
  moneda: 'PEN',
  estado: 'borrador',
  condicion_pago: 'contado',
  dias_credito: 30,
};
const ventaEstadoLabel = estado => VENTA_ESTADOS.find(([k]) => k === estado)?.[1] || estado || 'Borrador';
const ventaBadgeClass = estado => {
  switch (estado) {
    case 'borrador':   return 'badge-gray';
    case 'confirmada': return 'badge-cyan';
    case 'facturada':  return 'badge-green';
    case 'anulada':    return 'badge-red';
    default:           return 'badge-gray';
  }
};
function ventaTransicionesValidas(estado) {
  if (estado === 'borrador')   return [['borrador','Borrador'],['confirmada','Confirmada'],['anulada','Anulada']];
  if (estado === 'confirmada') return [['confirmada','Confirmada'],['borrador','Borrador'],['anulada','Anulada']];
  return [[estado, ventaEstadoLabel(estado)]];
}
const cuentaVentaNombre = cuenta => cuenta?.razon_social || cuenta?.nombre_comercial || cuenta?.cliente || cuenta?.nombre || '';
const ventaClienteNombre = venta => venta?.cliente_nombre_snapshot || venta?.cliente || venta?.cuentas?.razon_social || '-';
const ventaMonto = venta => Number(venta?.monto_total ?? venta?.monto ?? 0);
const calcVentaFechaVencimiento = (fecha, diasCredito) => {
  if (!fecha || !diasCredito || Number(diasCredito) <= 0) return '';
  const d = new Date(`${fecha}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + Number(diasCredito));
  return d.toISOString().split('T')[0];
};

function Ventas() {
  const { empresa, authUser, addNotificacion, navigate } = useApp();
  const supabaseMode = isSupabaseMode();
  const [ventas, setVentas] = useState(() => supabaseMode ? [] : (MOCK.ventas || []));
  const [clientes, setClientes] = useState(() => supabaseMode ? [] : (MOCK.cuentas || []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(false);
  const [form, setForm] = useState(VENTA_FORM_INIT);
  const [guardando, setGuardando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState(null);
  const [selVenta, setSelVenta] = useState(null);

  const fechaVencimientoCalc = calcVentaFechaVencimiento(form.fecha, form.dias_credito);

  useEffect(() => {
    if (!supabaseMode) {
      setVentas(MOCK.ventas || []);
      setClientes(MOCK.cuentas || []);
      setLoading(false);
      setError('');
      return;
    }
    if (!empresa?.id) { setVentas([]); setClientes([]); return; }
    let mounted = true;
    setLoading(true);
    setError('');
    Promise.all([
      finanzasService.getVentas(empresa.id),
      finanzasService.getCuentasVentas(empresa.id),
    ])
      .then(([ventasData, cuentasData]) => {
        if (!mounted) return;
        setVentas(ventasData || []);
        setClientes((cuentasData || []).filter(c => c.estado !== 'inactivo' && c.estado !== 'eliminado'));
      })
      .catch(err => { if (!mounted) return; setError(err?.message || 'No se pudieron cargar las ventas.'); setVentas([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [supabaseMode, empresa?.id]);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const resetForm = () => setForm({ ...VENTA_FORM_INIT, fecha: new Date().toISOString().split('T')[0] });

  const guardarVenta = async e => {
    e.preventDefault();
    setError('');
    const cuenta = clientes.find(c => c.id === form.cuenta_id);
    const monto = Number(form.monto_total);
    if (!form.cuenta_id || !cuenta) { setError('Selecciona un cliente.'); return; }
    if (!form.concepto.trim() || !(monto > 0)) { setError('Completa concepto y monto.'); return; }
    if (form.condicion_pago === 'credito' && !(Number(form.dias_credito) > 0)) { setError('Ingresa los días de crédito.'); return; }

    const estadoSeguro = ['borrador','confirmada'].includes(form.estado) ? form.estado : 'borrador';
    const datos = {
      fecha: form.fecha,
      cuenta_id: form.cuenta_id,
      cliente_nombre_snapshot: cuentaVentaNombre(cuenta),
      concepto: form.concepto.trim(),
      monto_total: monto,
      moneda: form.moneda,
      estado: estadoSeguro,
      condicion_pago: form.condicion_pago || 'contado',
      dias_credito: form.condicion_pago === 'credito' ? Number(form.dias_credito) : null,
      fecha_vencimiento_pago: form.condicion_pago === 'credito' ? fechaVencimientoCalc : null,
    };

    if (!supabaseMode) {
      const anio = new Date(`${datos.fecha}T00:00:00`).getFullYear();
      const correlativo = (ventas || []).length + 1;
      setVentas(prev => [{ id: `VEN-${anio}-${String(correlativo).padStart(4,'0')}`, ...datos, cliente: datos.cliente_nombre_snapshot }, ...prev]);
      setPanel(false); resetForm(); return;
    }

    setGuardando(true);
    try {
      const venta = await finanzasService.registrarVenta({ empresaId: empresa?.id, usuarioId: authUser?.id || null, datos });
      setVentas(prev => [venta, ...prev]);
      setPanel(false); resetForm();
      addNotificacion?.(`Venta ${venta.numero || ''} registrada en estado ${ventaEstadoLabel(venta.estado)}.`);
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la venta.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (venta, nuevoEstado) => {
    const prevEstado = venta.estado || 'borrador';
    if (['facturada','anulada'].includes(prevEstado)) return;
    if (prevEstado === nuevoEstado) return;
    setError('');
    setVentas(prev => prev.map(v => v.id === venta.id ? { ...v, estado: nuevoEstado } : v));
    if (!supabaseMode) return;
    setActualizandoId(venta.id);
    try {
      const actualizada = await finanzasService.actualizarEstadoVenta(venta.id, nuevoEstado);
      setVentas(prev => prev.map(v => v.id === venta.id ? actualizada : v));
      addNotificacion?.(`Venta ${actualizada.numero || ''} → ${ventaEstadoLabel(nuevoEstado)}.`);
    } catch (err) {
      setVentas(prev => prev.map(v => v.id === venta.id ? { ...v, estado: prevEstado } : v));
      setError(err?.message || 'No se pudo actualizar el estado.');
    } finally {
      setActualizandoId(null);
    }
  };

  const ventaDetalle = selVenta ? ventas.find(x => x.id === selVenta) : null;

  const emitirComprobante = vd => {
    setSelVenta(null);
    navigate('facturacion', {
      mode: 'venta',
      ventaSel: vd.id,
      cuenta_id: vd.cuenta_id,
      cliente_nombre: ventaClienteNombre(vd),
      concepto: vd.concepto,
      monto_total: ventaMonto(vd),
      moneda: vd.moneda || 'PEN',
      condicion_pago: vd.condicion_pago,
      dias_credito: vd.dias_credito,
    });
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ventas</h1>
          <div className="page-sub">Pre-facturación con seguimiento — el ingreso en el ER lo registra la factura emitida</div>
        </div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => { setError(''); setPanel(true); }}>{I.plus} Registrar Venta</button>
      </div>
      {error && <div className="alert alert-danger mt-4">{error}</div>}
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° Venta</th><th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Condición</th><th className="num">Monto</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="8" className="text-center text-muted" style={{padding:32}}>Cargando ventas...</td></tr>}
              {!loading && ventas.length === 0 && <tr><td colSpan="8" className="text-center text-muted" style={{padding:32}}>No hay ventas registradas.</td></tr>}
              {!loading && ventas.map(v => {
                const bloqueado = ['facturada','anulada'].includes(v.estado);
                const transiciones = ventaTransicionesValidas(v.estado);
                return (
                  <tr key={v.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => setSelVenta(v.id)}>
                    <td className="mono" style={{fontWeight:600}}>{v.numero || v.id}</td>
                    <td className="text-muted">{v.fecha}</td>
                    <td style={{fontWeight:600,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ventaClienteNombre(v)}</td>
                    <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.concepto}</td>
                    <td>
                      {v.condicion_pago === 'credito'
                        ? <span className="badge badge-orange" style={{fontSize:11}}>{v.dias_credito || 30}d crédito</span>
                        : <span className="badge badge-gray" style={{fontSize:11}}>Contado</span>}
                    </td>
                    <td className="num" onClick={e => e.stopPropagation()}>
                      <strong>{money(ventaMonto(v), symOf(v.moneda || 'PEN'))}</strong>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <select
                        className={'badge ' + ventaBadgeClass(v.estado)}
                        style={{border:0,cursor: bloqueado ? 'default' : 'pointer',fontFamily:'inherit'}}
                        value={v.estado || 'borrador'}
                        disabled={bloqueado || actualizandoId === v.id}
                        onChange={e => cambiarEstado(v, e.target.value)}
                      >
                        {transiciones.map(([est, lbl]) => <option key={est} value={est}>{lbl.toUpperCase()}</option>)}
                      </select>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="icon-btn" title="Ver detalle" onClick={() => setSelVenta(v.id)}>{I.eye}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Formulario Registrar Venta ─── */}
      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => { setPanel(false); resetForm(); }}/>
          <div className="side-panel" style={{width:'min(560px,96vw)'}}>
            <div className="side-panel-head">
              <div><div className="eyebrow">Ventas</div><div className="font-display" style={{fontSize:20,fontWeight:700}}>Registrar venta</div></div>
              <button className="icon-btn" onClick={() => { setPanel(false); resetForm(); }}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarVenta} style={{display:'flex',flexDirection:'column',gap:14}}>
              <div className="input-group">
                <label>Cliente <span style={{color:'var(--danger)'}}>*</span></label>
                <select className="select" value={form.cuenta_id} onChange={e => setF('cuenta_id', e.target.value)} required>
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{cuentaVentaNombre(c)}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Fecha <span style={{color:'var(--danger)'}}>*</span></label>
                <input className="input" type="date" value={form.fecha} onChange={e => setF('fecha', e.target.value)} required/>
              </div>
              <div className="input-group">
                <label>Concepto <span style={{color:'var(--danger)'}}>*</span></label>
                <input className="input" value={form.concepto} onChange={e => setF('concepto', e.target.value)} placeholder="Servicio vendido" required/>
              </div>
              <div className="grid-2" style={{gap:12}}>
                <div className="input-group">
                  <label>Monto <span style={{color:'var(--danger)'}}>*</span></label>
                  <input className="input" type="number" min="0.01" step="0.01" value={form.monto_total} onChange={e => setF('monto_total', e.target.value)} placeholder="0.00" required/>
                </div>
                <div className="input-group">
                  <label>Moneda</label>
                  <select className="select" value={form.moneda} onChange={e => setF('moneda', e.target.value)}>
                    <option value="PEN">S/ Soles</option>
                    <option value="USD">US$ Dólares</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label>Condición de pago</label>
                <select className="select" value={form.condicion_pago} onChange={e => setF('condicion_pago', e.target.value)}>
                  <option value="contado">Contado</option>
                  <option value="credito">Crédito</option>
                </select>
              </div>
              {form.condicion_pago === 'credito' && (
                <div className="grid-2" style={{gap:12}}>
                  <div className="input-group">
                    <label>Días de crédito <span style={{color:'var(--danger)'}}>*</span></label>
                    <input className="input" type="number" min="1" step="1" value={form.dias_credito} onChange={e => setF('dias_credito', Number(e.target.value))} required/>
                  </div>
                  <div className="input-group">
                    <label>Fecha de vencimiento</label>
                    <input className="input" type="date" value={fechaVencimientoCalc} readOnly style={{background:'var(--bg-subtle)',color:'var(--fg-muted)',cursor:'default'}}/>
                  </div>
                </div>
              )}
              <div className="input-group">
                <label>Estado inicial</label>
                <select className="select" value={form.estado} onChange={e => setF('estado', e.target.value)}>
                  <option value="borrador">Borrador</option>
                  <option value="confirmada">Confirmada</option>
                </select>
              </div>
              <div className="row mt-4" style={{justifyContent:'flex-end',gap:8}}>
                <button type="button" className="btn btn-secondary" onClick={() => { setPanel(false); resetForm(); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardando || (supabaseMode && !empresa?.id)}>{guardando ? 'Guardando...' : 'Guardar venta'}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ─── Panel de detalle ─── */}
      {ventaDetalle && (
        <>
          <div className="side-panel-backdrop" onClick={() => setSelVenta(null)}/>
          <div className="side-panel" style={{width:'min(560px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Venta</div>
                <div className="font-display" style={{fontSize:20,fontWeight:700}}>{ventaDetalle.numero || ventaDetalle.id}</div>
              </div>
              <button className="icon-btn" onClick={() => setSelVenta(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:14}}>

              {/* Factura vinculada */}
              {ventaDetalle.factura_id && (
                <div style={{padding:'10px 14px',borderRadius:8,background:'color-mix(in srgb,var(--green) 8%,transparent)',border:'1px solid color-mix(in srgb,var(--green) 30%,transparent)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{fontSize:13}}>
                    <span className="badge badge-green" style={{marginRight:8}}>Facturada</span>
                    <span style={{color:'var(--fg-muted)'}}>Comprobante emitido</span>
                  </div>
                  <button className="btn btn-ghost" style={{fontSize:12,color:'var(--cyan)',padding:0}} onClick={() => { setSelVenta(null); navigate('facturacion', { selFac: ventaDetalle.factura_id }); }}>
                    Ver factura →
                  </button>
                </div>
              )}

              {/* Datos */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                {[
                  ['Fecha', ventaDetalle.fecha],
                  ['Cliente', ventaClienteNombre(ventaDetalle)],
                  ['Concepto', ventaDetalle.concepto],
                  ['Monto', money(ventaMonto(ventaDetalle), symOf(ventaDetalle.moneda || 'PEN'))],
                  ['Moneda', ventaDetalle.moneda || 'PEN'],
                  ['Condición', ventaDetalle.condicion_pago === 'credito' ? `Crédito ${ventaDetalle.dias_credito || 30} días` : 'Contado'],
                ].map(([lbl, val]) => (
                  <div key={lbl}>
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:3}}>{lbl}</div>
                    <div style={{fontWeight:600,fontSize:14}}>{val || '—'}</div>
                  </div>
                ))}
                {ventaDetalle.condicion_pago === 'credito' && (ventaDetalle.fecha_vencimiento_pago || ventaDetalle.fecha_vencimiento) && (
                  <div>
                    <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:3}}>Fecha vencimiento pago</div>
                    <div style={{fontWeight:600,fontSize:14}}>{ventaDetalle.fecha_vencimiento_pago || ventaDetalle.fecha_vencimiento}</div>
                  </div>
                )}
              </div>

              {/* Estado inline — solo si puede cambiar */}
              {!['facturada','anulada'].includes(ventaDetalle.estado) && (
                <div>
                  <div style={{fontSize:12,color:'var(--fg-muted)',marginBottom:6}}>Estado</div>
                  <select
                    className={'badge ' + ventaBadgeClass(ventaDetalle.estado)}
                    style={{border:0,cursor:'pointer',fontFamily:'inherit',fontSize:13,padding:'6px 12px'}}
                    value={ventaDetalle.estado || 'borrador'}
                    disabled={actualizandoId === ventaDetalle.id}
                    onChange={e => cambiarEstado(ventaDetalle, e.target.value)}
                  >
                    {ventaTransicionesValidas(ventaDetalle.estado).map(([est, lbl]) => (
                      <option key={est} value={est}>{lbl}</option>
                    ))}
                  </select>
                </div>
              )}
              {['facturada','anulada'].includes(ventaDetalle.estado) && (
                <div>
                  <div style={{fontSize:12,color:'var(--fg-muted)',marginBottom:6}}>Estado</div>
                  <span className={'badge ' + ventaBadgeClass(ventaDetalle.estado)} style={{fontSize:13,padding:'6px 12px'}}>{ventaEstadoLabel(ventaDetalle.estado)}</span>
                </div>
              )}

              {/* Botones de acción */}
              {ventaDetalle.estado === 'borrador' && (
                <button
                  className="btn btn-secondary"
                  disabled={actualizandoId === ventaDetalle.id}
                  onClick={() => cambiarEstado(ventaDetalle, 'confirmada')}
                >
                  {actualizandoId === ventaDetalle.id ? 'Actualizando...' : 'Confirmar venta'}
                </button>
              )}
              {ventaDetalle.estado === 'confirmada' && !ventaDetalle.factura_id && (
                <button className="btn btn-primary" onClick={() => emitirComprobante(ventaDetalle)}>
                  Emitir Comprobante
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ============ CAJA CHICA ============
// El módulo es ahora una vista de consulta. Los egresos se crean exclusivamente
// a través de NuevoEgreso (método de pago "Caja chica"), que es el único flujo
// de escritura seguro sin riesgo de duplicación.

const CC_PRECONFIG_RAPIDO = {
  paso: 2,
  form: { ya_pagado: true, metodo_pago: 'Caja chica' },
};

function CajaChica() {
  const { cajaChica } = useApp();
  const [panelNuevoEgreso, setPanelNuevoEgreso] = useState(false);
  const [preconfigNE, setPreconfigNE] = useState(null);

  const mesActual = new Date().toISOString().slice(0, 7);
  const totalMes = cajaChica
    .filter(c => c.estado !== 'anulado' && String(c.fecha || '').slice(0, 7) === mesActual)
    .reduce((s, c) => s + Number(c.monto || 0), 0);

  const totalFondo = cajaChica
    .filter(c => c.estado !== 'anulado')
    .reduce((s, c) => s + Number(c.monto || 0), 0);

  const abrirNuevoEgreso = (preconfig = null) => {
    setPreconfigNE(preconfig);
    setPanelNuevoEgreso(true);
  };

  const cerrarNuevoEgreso = () => {
    setPanelNuevoEgreso(false);
    setPreconfigNE(null);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Caja Chica</h1>
          <div className="page-sub">Vista de movimientos · Registra egresos desde "Nuevo egreso"</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-secondary" style={{fontSize:13}} onClick={() => abrirNuevoEgreso(CC_PRECONFIG_RAPIDO)}>{I.plus} Rápido</button>
          <button className="btn btn-primary" onClick={() => abrirNuevoEgreso(null)}>{I.plus} Nuevo egreso</button>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Saldo del fondo</div>
          <div className="kpi-value" style={{color:'var(--cyan)'}}>{money(totalFondo)}</div>
          <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:4}}>Total acumulado sin anulados</div>
        </div>
        <div className="kpi-card"><div className="kpi-label">Mes actual</div><div className="kpi-value">{money(totalMes)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Movimientos</div><div className="kpi-value">{cajaChica.filter(c => c.estado !== 'anulado').length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Anulados</div><div className="kpi-value">{cajaChica.filter(c => c.estado === 'anulado').length}</div></div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Categoría</th>
                <th>Comprobante</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cajaChica.length ? cajaChica.map(c => (
                <tr key={c.id} className="hover-row" style={{opacity: c.estado === 'anulado' ? 0.5 : 1}}>
                  <td className="text-muted">{c.fecha}</td>
                  <td>{c.concepto}</td>
                  <td><span className="badge badge-gray">{c.categoria}</span></td>
                  <td className="mono text-muted">{c.num_comprobante || '—'}</td>
                  <td className="num"><strong>{money(c.monto)}</strong></td>
                  <td><span className={'badge ' + (c.estado === 'anulado' ? 'badge-red' : 'badge-green')}>{c.estado}</span></td>
                </tr>
              )) : (
                <tr><td colSpan="6" className="text-center text-muted" style={{padding:32}}>No hay movimientos de caja chica. Registra egresos usando "Nuevo egreso" con método "Caja chica".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {panelNuevoEgreso && (
        <NuevoEgreso
          origen="caja_chica"
          preconfig={preconfigNE}
          onClose={cerrarNuevoEgreso}
          onSaved={cerrarNuevoEgreso}
        />
      )}
    </>
  );
}

// ============ PRÉSTAMOS Y PAGOS ============
function PrestamosPersonal() {
  const { navigate, empresa, dataMode, personalOperativo, personalAdmin, setPersonalOperativo, setPersonalAdmin } = useApp();
  const [prestamos, setPrestamos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [pagandoId, setPagandoId] = useState(null);
  const [cancelandoId, setCancelandoId] = useState(null);
  const formBase = { trabajador_id: '', monto: '', cuotas: 12, descontar_nomina: true };
  const [form, setForm] = useState(formBase);

  const todoElPersonal = useMemo(() => [
    ...(personalOperativo || []).map(p => ({ ...p, tipo: 'operativo' })),
    ...(personalAdmin || []).map(p => ({ ...p, tipo: 'admin' })),
  ].filter(p => p.estado !== 'inactivo' && p.estado_laboral !== 'cesado'), [personalOperativo, personalAdmin]);

  const cuota = Number(form.cuotas) > 0 ? Number(form.monto || 0) / Number(form.cuotas) : 0;

  useEffect(() => {
    if (!empresa?.id && dataMode !== 'mock') return;
    setLoading(true);
    if (dataMode === 'mock') {
      setPrestamos(MOCK.prestamos.map(p => ({
        ...p,
        cuotas_pagadas: p.cuota_mensual ? Math.round((p.pagado || 0) / p.cuota_mensual) : 0,
        saldo: p.monto - (p.pagado || 0),
        descontar_nomina: p.descuento_nomina,
        fecha_otorgamiento: p.fecha,
      })));
      setLoading(false);
      return;
    }
    rrhhService.getPrestamosPersonal(empresa.id).then(data => {
      setPrestamos(data || []);
      setLoading(false);
    });
  }, [empresa?.id, dataMode]);

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.trabajador_id || !form.monto || Number(form.cuotas) < 1) return;
    setSaving(true);
    try {
      const trabajador = todoElPersonal.find(p => p.id === form.trabajador_id);
      const cuotaMensual = Number((Number(form.monto) / Number(form.cuotas)).toFixed(2));
      const nuevo = await rrhhService.crearPrestamoPersonal(empresa.id, {
        trabajador_id: form.trabajador_id,
        trabajador_tipo: trabajador?.tipo || 'operativo',
        empleado: trabajador?.nombre || '',
        monto: Number(form.monto),
        cuotas: Number(form.cuotas),
        cuota_mensual: cuotaMensual,
        cuotas_pagadas: 0,
        saldo: Number(form.monto),
        descontar_nomina: form.descontar_nomina,
        estado: 'vigente',
        fecha_otorgamiento: new Date().toISOString().split('T')[0],
      });
      if (form.descontar_nomina && trabajador) {
        if (trabajador.tipo === 'operativo') {
          const upd = await rrhhService.actualizarPersonalOperativo(trabajador.id, { cuota_prestamo_mes: cuotaMensual });
          setPersonalOperativo(prev => prev.map(p => p.id === trabajador.id ? upd : p));
        } else {
          const upd = await rrhhService.actualizarPersonalAdmin(trabajador.id, { cuota_prestamo_mes: cuotaMensual });
          setPersonalAdmin(prev => prev.map(p => p.id === trabajador.id ? upd : p));
        }
      }
      setPrestamos(prev => [nuevo, ...prev]);
      setOpenForm(false);
      setForm(formBase);
    } catch (err) {
      alert('Error al guardar préstamo: ' + (err.message || 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const abrirDetalle = async (p) => {
    setDetalle(p);
    setPagos([]);
    if (dataMode !== 'mock') {
      const data = await rrhhService.getPrestamoPagos(empresa?.id, p.id);
      setPagos(data || []);
    }
  };

  const registrarPago = async (prestamo) => {
    const cuotaMonto = Number(prestamo.cuota_mensual || (prestamo.monto / prestamo.cuotas));
    if (!window.confirm(`¿Registrar pago manual de cuota por ${moneyD(cuotaMonto)}?`)) return;
    setPagandoId(prestamo.id);
    try {
      const { prestamo: actualizado, pago } = await rrhhService.pagarCuotaPrestamo(empresa.id, prestamo.id, { monto: cuotaMonto });
      setPrestamos(prev => prev.map(p => p.id === actualizado.id ? actualizado : p));
      if (detalle?.id === actualizado.id) {
        setDetalle(actualizado);
        setPagos(prev => [pago, ...prev]);
      }
      if (actualizado.estado === 'cancelado') {
        const trabajador = todoElPersonal.find(p => p.id === actualizado.trabajador_id);
        if (trabajador) {
          if (trabajador.tipo === 'operativo') setPersonalOperativo(prev => prev.map(p => p.id === trabajador.id ? { ...p, cuota_prestamo_mes: 0 } : p));
          else setPersonalAdmin(prev => prev.map(p => p.id === trabajador.id ? { ...p, cuota_prestamo_mes: 0 } : p));
        }
      }
    } catch (err) {
      alert('Error al registrar pago: ' + (err.message || 'Error desconocido'));
    } finally {
      setPagandoId(null);
    }
  };

  const cancelar = async (prestamo) => {
    if (!window.confirm(`¿Cancelar el préstamo de ${prestamo.empleado}? Esta acción no se puede deshacer.`)) return;
    setCancelandoId(prestamo.id);
    try {
      const actualizado = await rrhhService.cancelarPrestamo(empresa.id, prestamo.id);
      setPrestamos(prev => prev.map(p => p.id === actualizado.id ? actualizado : p));
      if (detalle?.id === actualizado.id) setDetalle(actualizado);
      if (actualizado.descontar_nomina) {
        const trabajador = todoElPersonal.find(p => p.id === actualizado.trabajador_id);
        if (trabajador) {
          if (trabajador.tipo === 'operativo') setPersonalOperativo(prev => prev.map(p => p.id === trabajador.id ? { ...p, cuota_prestamo_mes: 0 } : p));
          else setPersonalAdmin(prev => prev.map(p => p.id === trabajador.id ? { ...p, cuota_prestamo_mes: 0 } : p));
        }
      }
    } catch (err) {
      alert('Error al cancelar préstamo: ' + (err.message || 'Error desconocido'));
    } finally {
      setCancelandoId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Préstamos al Personal</h1>
          <div className="page-sub">Adelantos y préstamos internos descontados en nómina</div>
        </div>
        <button className="btn btn-primary" onClick={() => setOpenForm(true)}>{I.plus} Nuevo Préstamo</button>
      </div>
      <div style={{ background:'rgba(0,188,212,0.08)', borderLeft:'3px solid var(--cyan)', borderRadius:'6px', padding:'10px 16px', marginBottom:'20px', fontSize:'13px' }}>
        Estos son préstamos que la empresa otorga a sus trabajadores. Si buscas préstamos bancarios o financiamiento recibido por la empresa, ve a{' '}
        <button onClick={() => navigate('financiamiento')} style={{ color:'var(--cyan)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Financiamiento y Deuda</button>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          {loading ? (
            <div style={{padding:'40px', textAlign:'center', color:'var(--muted)'}}>Cargando préstamos...</div>
          ) : prestamos.length === 0 ? (
            <div style={{padding:'40px', textAlign:'center', color:'var(--muted)'}}>No hay préstamos registrados</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Fecha Otorgado</th>
                  <th>Monto Total</th>
                  <th>Cuota Mensual</th>
                  <th>Avance Cuotas</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {prestamos.map(p => {
                  const pagado = p.monto - (p.saldo ?? p.monto);
                  const pct = p.monto > 0 ? Math.min(100, (pagado / p.monto) * 100) : 0;
                  const cuotaMensual = p.cuota_mensual || (p.monto / (p.cuotas || 1));
                  return (
                    <tr key={p.id} className="hover-row">
                      <td style={{fontWeight:600}}>{p.empleado}</td>
                      <td className="text-muted">{p.fecha_otorgamiento || p.fecha || '—'}</td>
                      <td className="num">{money(p.monto)}</td>
                      <td><strong>{moneyD(cuotaMensual)}</strong></td>
                      <td style={{width:150}}>
                        <div className="bar">
                          <div style={{width:pct+'%', background:p.estado==='cancelado'?'var(--green)':'var(--cyan)'}}/>
                        </div>
                        <div style={{fontSize:11,marginTop:2}}>{p.cuotas_pagadas ?? 0}/{p.cuotas} cuotas · saldo {money(p.saldo ?? p.monto)}</div>
                      </td>
                      <td>
                        <span className={'badge ' + (p.estado==='cancelado'?'badge-purple':'badge-green')}>{(p.estado||'vigente').toUpperCase()}</span>
                        {p.estado !== 'cancelado' && (p.descontar_nomina || p.descuento_nomina) && <span className="badge badge-cyan" style={{marginLeft:6}}>Vinculado a nómina</span>}
                      </td>
                      <td>
                        <div className="row" style={{gap:6}}>
                          <button className="btn btn-secondary" style={{padding:'4px 10px',fontSize:12}} onClick={() => abrirDetalle(p)}>Ver</button>
                          {p.estado !== 'cancelado' && (
                            <>
                              <button className="btn btn-primary" style={{padding:'4px 10px',fontSize:12}} disabled={pagandoId===p.id} onClick={() => registrarPago(p)}>
                                {pagandoId===p.id ? '...' : 'Pagar cuota'}
                              </button>
                              <button className="btn btn-secondary" style={{padding:'4px 10px',fontSize:12,color:'var(--red)'}} disabled={cancelandoId===p.id} onClick={() => cancelar(p)}>
                                {cancelandoId===p.id ? '...' : 'Cancelar'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Panel de detalle e historial de pagos */}
      {detalle && (
        <>
          <div className="side-panel-backdrop" onClick={() => setDetalle(null)}/>
          <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Préstamo · {detalle.empleado}</div>
                <div className="font-display" style={{fontSize:20,fontWeight:700}}>{money(detalle.monto)} en {detalle.cuotas} cuotas</div>
              </div>
              <button className="icon-btn" onClick={() => setDetalle(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="grid-2" style={{gap:12, marginBottom:20}}>
                <div><div className="eyebrow" style={{fontSize:10}}>Cuota mensual</div><div style={{fontWeight:600}}>{moneyD(detalle.cuota_mensual || detalle.monto/detalle.cuotas)}</div></div>
                <div><div className="eyebrow" style={{fontSize:10}}>Saldo pendiente</div><div style={{fontWeight:600}}>{money(detalle.saldo ?? detalle.monto)}</div></div>
                <div><div className="eyebrow" style={{fontSize:10}}>Cuotas pagadas</div><div style={{fontWeight:600}}>{detalle.cuotas_pagadas ?? 0} / {detalle.cuotas}</div></div>
                <div><div className="eyebrow" style={{fontSize:10}}>Estado</div><div><span className={'badge '+(detalle.estado==='cancelado'?'badge-purple':'badge-green')}>{(detalle.estado||'vigente').toUpperCase()}</span></div></div>
                <div><div className="eyebrow" style={{fontSize:10}}>Descuento en nómina</div><div style={{fontWeight:600}}>{(detalle.descontar_nomina||detalle.descuento_nomina) ? 'Sí' : 'No'}</div></div>
                <div><div className="eyebrow" style={{fontSize:10}}>Tipo trabajador</div><div style={{fontWeight:600,textTransform:'capitalize'}}>{detalle.trabajador_tipo || 'Operativo'}</div></div>
              </div>
              {detalle.estado !== 'cancelado' && (
                <div className="row mb-4" style={{justifyContent:'flex-end', gap:8}}>
                  <button className="btn btn-primary" disabled={pagandoId===detalle.id} onClick={() => registrarPago(detalle)}>
                    {pagandoId===detalle.id ? 'Registrando...' : `Pagar cuota (${moneyD(detalle.cuota_mensual || detalle.monto/detalle.cuotas)})`}
                  </button>
                </div>
              )}
              <div style={{fontWeight:600, fontSize:13, marginBottom:10}}>Historial de pagos</div>
              {pagos.length === 0 ? (
                <div style={{color:'var(--muted)', fontSize:13}}>Sin pagos registrados aún.</div>
              ) : (
                <table className="tbl" style={{fontSize:13}}>
                  <thead><tr><th>Fecha</th><th>Monto</th><th>Origen</th></tr></thead>
                  <tbody>
                    {pagos.map(pg => (
                      <tr key={pg.id}>
                        <td>{pg.fecha}</td>
                        <td className="num">{money(pg.monto)}</td>
                        <td><span className={'badge '+(pg.concepto==='nomina'?'badge-cyan':'badge-green')}>{pg.concepto==='nomina'?'NÓMINA':'MANUAL'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* Formulario nuevo préstamo */}
      {openForm && (
        <>
          <div className="side-panel-backdrop" onClick={() => setOpenForm(false)}/>
          <div className="side-panel" style={{width:'min(580px, 96vw)'}}>
            <div className="side-panel-head">
              <div><div className="eyebrow">Préstamo interno</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Nuevo préstamo al personal</div></div>
              <button className="icon-btn" onClick={() => setOpenForm(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardar}>
              <div className="grid-2" style={{gap:16}}>
                <div className="input-group" style={{gridColumn:'1 / -1'}}>
                  <label>Trabajador</label>
                  <select className="select" required value={form.trabajador_id} onChange={e => setForm(v => ({ ...v, trabajador_id: e.target.value }))}>
                    <option value="">— Seleccionar trabajador —</option>
                    {todoElPersonal.map(p => (
                      <option key={p.id} value={p.id}>[{p.tipo === 'admin' ? 'Admin' : 'Op.'}] {p.nombre} — {p.cargo || ''}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Monto total (S/)</label>
                  <input className="input" type="number" min="1" required value={form.monto} onChange={e => setForm(v => ({ ...v, monto: e.target.value }))}/>
                </div>
                <div className="input-group">
                  <label>Número de cuotas</label>
                  <input className="input" type="number" min="1" required value={form.cuotas} onChange={e => setForm(v => ({ ...v, cuotas: e.target.value }))}/>
                </div>
                <div className="input-group" style={{gridColumn:'1 / -1'}}>
                  <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}}>
                    <input type="checkbox" checked={form.descontar_nomina} onChange={e => setForm(v => ({ ...v, descontar_nomina: e.target.checked }))}/>
                    Descontar automáticamente en nómina
                  </label>
                  <div className="text-muted" style={{fontSize:12, marginTop:4}}>Cuota mensual estimada: <strong>{moneyD(cuota)}</strong></div>
                  {form.descontar_nomina && <div style={{fontSize:12, color:'var(--cyan)', marginTop:4}}>Al guardar se actualizará el campo "Cuota préstamo mes" del trabajador seleccionado en la BD.</div>}
                </div>
              </div>
              <div className="row mt-6" style={{justifyContent:'flex-end', gap:8}}>
                <button type="button" className="btn btn-secondary" onClick={() => setOpenForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar préstamo'}</button>
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
          <h1 className="page-title">Cuentas por Pagar</h1>
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

const TRIBUTO_TIPOS = [
  { value: 'igv_mensual', label: 'IGV mensual' },
  { value: 'ir_cuenta_3ra', label: 'IR a cuenta 3ra categoria' },
  { value: 'essalud', label: 'ESSALUD' },
  { value: 'onp_afp_empleador', label: 'ONP/AFP empleador' },
  { value: 'retencion_ir_4ta', label: 'Retencion IR 4ta categoria' },
  { value: 'retencion_ir_5ta', label: 'Retencion IR 5ta categoria' },
  { value: 'otros_tributos', label: 'Otros tributos' },
];
const TRIBUTO_LABEL = Object.fromEntries(TRIBUTO_TIPOS.map(t => [t.value, t.label]));
const TRIBUTO_CATEGORIA_KEYS = ['tribut', 'impuesto', 'sunat', 'essalud', 'onp', 'afp', 'retencion'];
const DIVIDENDO_TIPO = 'socio_accionista';

const cxpEsTributo = c => {
  const tipoComp = normText(c?.tipo_comprobante);
  const categoria = normText(c?.categoria_er);
  const motivo = normText(c?.motivo_cxp);
  return tipoComp === 'tributo'
    || Boolean(c?.tributo_tipo)
    || TRIBUTO_CATEGORIA_KEYS.some(k => categoria.includes(k))
    || ['essalud', 'pensiones', 'ir_5ta'].includes(motivo);
};

const cxpTributoPeriodo = c => c?.tributo_periodo || (() => {
  const match = String(c?.concepto || '').match(/Periodo:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
})();

const cxpTributoTipoLabel = c => TRIBUTO_LABEL[c?.tributo_tipo] || c?.tributo_tipo || (() => {
  const match = String(c?.concepto || '').match(/Tributo:\s*([^|]+)/i);
  return match ? match[1].trim() : 'Tributo';
})();

function CxP() {
  const { cxp, cxpPagos, proveedores, personalAdmin, personalOperativo, ots, registrarPagoCxP, generarCxP, crearGasto, addNotificacion, centrosCosto, setCxp } = useApp();
  const cecos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const today = new Date().toISOString().split('T')[0];

  // Panel states
  const [panelCrear, setPanelCrear] = useState(false);
  const [panelNuevoEgreso, setPanelNuevoEgreso] = useState(false);
  const [sel, setSel] = useState(null);
  const [fichaTab, setFichaTab] = useState('pago');
  const [guardando, setGuardando] = useState(false);
  const [tabCxP, setTabCxP] = useState('general');

  // Form: pago
  const [formPago, setFormPago] = useState({ monto: '', fecha: today, cuenta_bancaria: 'Cuenta principal', referencia: '' });

  // Form: nueva CxP
  const FORM_VACIO = { proveedor_id: '', tipo_beneficiario: 'proveedor', tipo_comprobante: 'Factura', factura_numero: '', fecha_emision: today, fecha_vencimiento: '', monto_total: '', moneda: 'PEN', concepto: '' };
  const [formCrear, setFormCrear] = useState(FORM_VACIO);
  const [archivoCrearUrl, setArchivoCrearUrl] = useState('');
  // Campos viáticos reembolso
  const [motivoCxP, setMotivoCxP] = useState('');
  const [viaticosPersonalId, setViaticosPersonalId] = useState('');
  const [viaticosOtId, setViaticosOtId] = useState('');
  // Campos tributos y distribucion de utilidades
  const [tributoTipo, setTributoTipo] = useState(TRIBUTO_TIPOS[0].value);
  const [tributoPeriodo, setTributoPeriodo] = useState(today.slice(0, 7));
  const [tributoFormulario, setTributoFormulario] = useState('');
  const [socioNombre, setSocioNombre] = useState('');
  const [socioParticipacion, setSocioParticipacion] = useState('');
  const [periodoUtilidades, setPeriodoUtilidades] = useState(String(new Date().getFullYear()));
  const [actaReferencia, setActaReferencia] = useState('');
  // Campos RHE externo
  const [rheRuc, setRheRuc] = useState('');
  const [rheNombre, setRheNombre] = useState('');
  const [rheMontoBruto, setRheMontoBruto] = useState('');
  const [rheNumeroDoc, setRheNumeroDoc] = useState('');
  const [cxpCategoriaEr, setCxpCategoriaEr] = useState('');
  const [cxpCentroCostoId, setCxpCentroCostoId] = useState('');
  const [cxpYaRegistrado, setCxpYaRegistrado] = useState(false);
  // Edición de clasificación ER en ficha existente
  const [fichaClasifCategoria, setFichaClasifCategoria] = useState('');
  const [fichaClasifCeco, setFichaClasifCeco] = useState('');
  const [guardandoClasif, setGuardandoClasif] = useState(false);
  const rheRetencion = Math.round(Number(rheMontoBruto || 0) * 0.08 * 100) / 100;
  const rheMontoNeto = Math.round((Number(rheMontoBruto || 0) - rheRetencion) * 100) / 100;

  // Filtros
  const [filtTipo, setFiltTipo] = useState('todos');
  const [filtOrigen, setFiltOrigen] = useState('todos');
  const [filtMoneda, setFiltMoneda] = useState('todos');

  // ── Helpers ──────────────────────────────────────────────────────────────
  const saldoDe  = c => Number(c?.saldo ?? c?.monto_total ?? c?.monto ?? 0);
  const totalDe  = c => Number(c?.monto_total ?? c?.monto ?? 0);
  const pagadoDe = c => Number(c?.monto_pagado ?? 0);

  const addDays = (dateStr, n) => {
    const d = new Date(`${dateStr || today}T00:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  };

  const diasDesdeCondicion = condicion => {
    const m = String(condicion || '').match(/(\d+)\s*d[ií]as?/i);
    return m ? Number(m[1]) : 30;
  };

  // Semáforo: verde >7d, naranja 0-7d, rojo vencida, gris pagada
  const semaforoDe = c => {
    if (saldoDe(c) <= 0 || c.estado === 'pagada')
      return { bg: 'var(--fg-muted)', label: 'Pagada', badgeCls: 'badge-gray' };
    const vence = c?.fecha_vencimiento;
    if (!vence) return { bg: 'var(--orange)', label: 'Sin fecha', badgeCls: 'badge-orange' };
    const dias = Math.floor((new Date(`${vence}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
    if (dias < 0)  return { bg: 'var(--danger)',       label: `Vencida hace ${-dias}d`, badgeCls: 'badge-red' };
    if (dias <= 7) return { bg: 'var(--orange)',       label: `Vence en ${dias}d`,      badgeCls: 'badge-orange' };
    return             { bg: 'var(--green)',        label: `Vence en ${dias}d`,      badgeCls: 'badge-green' };
  };

  const beneficiarioNombre = c => {
    if (c?.tipo_beneficiario === DIVIDENDO_TIPO) return c?.socio_nombre || c?.concepto || 'Socio / accionista';
    if (c?.tipo_beneficiario === 'colectivo') return c?.concepto || 'Obligación institucional';
    if (c?.tipo_beneficiario === 'personal') {
      const persona = [...(personalAdmin||[]), ...(personalOperativo||[])].find(p => p.id === c?.personal_id);
      return persona?.nombre
        || c?.personal_administrativo?.nombre
        || c?.personal_id || '-';
    }
    return c?.proveedor || c?.proveedores?.razon_social
      || (proveedores || []).find(p => p.id === c?.proveedor_id)?.razon_social
      || c?.proveedor_id || '-';
  };

  const pagosDe = cxpId => (cxpPagos || []).filter(p => p.cxp_id === cxpId);
  const esTributoForm = tabCxP === 'tributos' || motivoCxP === 'tributo' || formCrear.tipo_comprobante === 'Tributo';
  const esDividendoForm = formCrear.tipo_beneficiario === DIVIDENDO_TIPO;
  const tributoConcepto = `Tributo: ${TRIBUTO_LABEL[tributoTipo] || tributoTipo} | Periodo: ${tributoPeriodo || '-'}${tributoFormulario ? ` | Formulario: ${tributoFormulario}` : ''}`;
  const dividendoConcepto = `Distribucion de utilidades - ${periodoUtilidades || new Date().getFullYear()}`;

  const resetCrearCxP = () => {
    setPanelCrear(false);
    setFormCrear(FORM_VACIO);
    setArchivoCrearUrl('');
    setMotivoCxP('');
    setViaticosPersonalId('');
    setViaticosOtId('');
    setTributoTipo(TRIBUTO_TIPOS[0].value);
    setTributoPeriodo(today.slice(0, 7));
    setTributoFormulario('');
    setSocioNombre('');
    setSocioParticipacion('');
    setPeriodoUtilidades(String(new Date().getFullYear()));
    setActaReferencia('');
    setRheRuc('');
    setRheNombre('');
    setRheMontoBruto('');
    setRheNumeroDoc('');
    setCxpCategoriaEr('');
    setCxpCentroCostoId('');
    setCxpYaRegistrado(false);
  };

  const abrirCrearCxP = (modo = 'general') => {
    resetCrearCxP();
    const base = { ...FORM_VACIO, tipo_beneficiario: 'proveedor', tipo_comprobante: 'Factura' };
    if (modo === 'tributos') {
      setMotivoCxP('tributo');
      setCxpCategoriaEr('Tributos');
      setFormCrear({ ...base, proveedor_id: '', tipo_comprobante: 'Tributo', concepto: tributoConcepto });
    } else if (modo === 'dividendos') {
      setFormCrear({ ...base, tipo_beneficiario: DIVIDENDO_TIPO, tipo_comprobante: 'distribucion_utilidades', concepto: dividendoConcepto });
    } else {
      setFormCrear(base);
    }
    setPanelCrear(true);
  };

  // ── Datos filtrados y KPIs ────────────────────────────────────────────────
  const cxpFiltrada = (cxp || []).filter(c => {
    if (tabCxP === 'tributos' && !cxpEsTributo(c)) return false;
    if (filtTipo !== 'todos' && (c.tipo_beneficiario || 'proveedor') !== filtTipo) return false;
    if (filtOrigen !== 'todos' && (c.origen || 'manual') !== filtOrigen) return false;
    if (filtMoneda !== 'todos' && (c.moneda || 'PEN') !== filtMoneda) return false;
    return true;
  });
  const cxpTributos = (cxp || []).filter(cxpEsTributo);

  const totalPorPagar = cxpFiltrada.reduce((s, c) => s + saldoDe(c), 0);
  const totalVencido  = cxpFiltrada.filter(c => semaforoDe(c).badgeCls === 'badge-red').reduce((s, c) => s + saldoDe(c), 0);
  const porVencer7    = cxpFiltrada.filter(c => semaforoDe(c).badgeCls === 'badge-orange' && saldoDe(c) > 0).length;

  const saldosPEN  = cxpFiltrada.filter(c => (c.moneda||'PEN') !== 'USD').reduce((s,c) => s + saldoDe(c), 0);
  const saldosUSD  = cxpFiltrada.filter(c => (c.moneda||'PEN') === 'USD').reduce((s,c) => s + saldoDe(c), 0);
  const vencidoPEN = cxpFiltrada.filter(c => semaforoDe(c).badgeCls === 'badge-red' && (c.moneda||'PEN') !== 'USD').reduce((s,c) => s + saldoDe(c), 0);
  const vencidoUSD = cxpFiltrada.filter(c => semaforoDe(c).badgeCls === 'badge-red' && (c.moneda||'PEN') === 'USD').reduce((s,c) => s + saldoDe(c), 0);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const abrirFicha = c => {
    setSel(c);
    setFichaTab('pago');
    setFormPago({ monto: String(saldoDe(c)), fecha: today, cuenta_bancaria: 'Cuenta principal', referencia: '' });
    setFichaClasifCategoria(c.categoria_er || '');
    setFichaClasifCeco(c.centro_costo_id || '');
  };

  const guardarPago = async e => {
    e.preventDefault();
    const monto = Number(formPago.monto || 0);
    if (!sel || monto <= 0) return;
    setGuardando(true);
    try {
      await registrarPagoCxP(sel.id, monto, formPago);
      setSel(null);
    } finally {
      setGuardando(false);
    }
  };

  const guardarNuevaCxP = async e => {
    e.preventDefault();
    const esRhe = formCrear.tipo_comprobante === 'RHE';
    const esViaticos = motivoCxP === 'viaticos_reembolso';
    const esTributo = esTributoForm;
    const esDividendo = esDividendoForm;
    const montoTotal = esRhe ? rheMontoNeto : Number(formCrear.monto_total);
    if (!formCrear.fecha_emision || !formCrear.fecha_vencimiento || montoTotal <= 0) {
      addNotificacion('Completa fecha de emisión, vencimiento y monto.');
      return;
    }
    if (esRhe && (!rheRuc || rheRuc.length !== 11 || !rheNombre || !Number(rheMontoBruto))) {
      addNotificacion('Para RHE: ingresa RUC (11 dígitos), nombre del emisor y monto bruto.');
      return;
    }
    if (esViaticos && !viaticosPersonalId) {
      addNotificacion('Para reembolso de viáticos: selecciona al colaborador.');
      return;
    }
    if (esTributo && (!tributoTipo || !tributoPeriodo)) {
      addNotificacion('Para tributos: selecciona tipo de tributo y periodo tributario.');
      return;
    }
    if (esDividendo && (!socioNombre.trim() || !periodoUtilidades)) {
      addNotificacion('Para distribucion de utilidades: ingresa socio y periodo.');
      return;
    }
    setGuardando(true);
    try {
      const personal = esViaticos
        ? ([...(personalAdmin||[]), ...(personalOperativo||[])]).find(p => p.id === viaticosPersonalId)
        : null;
      const cxpPayload = {
        proveedor_id:      (esViaticos || esTributo || esDividendo) ? null : (formCrear.proveedor_id || null),
        tipo_beneficiario: esDividendo ? DIVIDENDO_TIPO : esViaticos ? 'personal' : esTributo ? 'colectivo' : (formCrear.tipo_beneficiario || 'proveedor'),
        personal_id:       esViaticos ? viaticosPersonalId : null,
        ot_vinc_id:        esViaticos && viaticosOtId ? viaticosOtId : null,
        tipo_comprobante:  esTributo ? 'Tributo' : esDividendo ? 'distribucion_utilidades' : formCrear.tipo_comprobante,
        factura_numero:    esTributo ? (tributoFormulario || null) : esRhe ? (rheNumeroDoc || null) : (formCrear.factura_numero || null),
        concepto:          esTributo ? tributoConcepto : esDividendo ? dividendoConcepto : (formCrear.concepto || (esRhe ? `RHE - ${rheNombre}` : esViaticos ? `Viaticos - ${personal?.nombre || viaticosPersonalId}` : null)),
        fecha_emision:     formCrear.fecha_emision,
        fecha_vencimiento: formCrear.fecha_vencimiento,
        monto_total:       montoTotal,
        monto_pagado:      0,
        saldo:             montoTotal,
        moneda:            formCrear.moneda || 'PEN',
        estado:            'por_pagar',
        origen:            esTributo ? 'tributos' : esDividendo ? 'dividendos' : esRhe ? 'rhe_externo' : esViaticos ? 'viaticos' : 'manual',
        motivo_cxp:        esTributo ? `${TRIBUTO_LABEL[tributoTipo] || tributoTipo} - ${tributoPeriodo}` : esDividendo ? dividendoConcepto : (motivoCxP || null),
        ...(esTributo ? { tributo_tipo: tributoTipo, tributo_periodo: tributoPeriodo, tributo_formulario: tributoFormulario || null, categoria_er: cxpCategoriaEr || 'Tributos', no_devengar_er: true } : {}),
        ...(esDividendo ? { socio_nombre: socioNombre.trim(), socio_participacion_pct: socioParticipacion ? Number(socioParticipacion) : null, periodo_utilidades: periodoUtilidades, acta_referencia: actaReferencia || null, no_devengar_er: true } : {}),
        ...(esRhe ? { ruc_emisor: rheRuc, nombre_emisor: rheNombre, monto_bruto: Number(rheMontoBruto), retencion_ir: rheRetencion } : {}),
        ...(archivoCrearUrl ? { archivo_factura_url: archivoCrearUrl } : {}),
        ...(cxpCategoriaEr   ? { categoria_er:    cxpCategoriaEr   } : {}),
        ...(cxpCentroCostoId ? { centro_costo_id: cxpCentroCostoId } : {}),
        ...(!esTributo && !esDividendo && cxpYaRegistrado ? { no_devengar_er: true } : {}),
      };
      await generarCxP(cxpPayload);
      resetCrearCxP();
    } finally {
      setGuardando(false);
    }
  };

  const guardarClasificacion = async () => {
    if (!sel) return;
    setGuardandoClasif(true);
    try {
      const camposCxP = {
        categoria_er:    fichaClasifCategoria || null,
        centro_costo_id: fichaClasifCeco || null,
      };
      await finanzasService.actualizarCxP(sel.id, camposCxP);
      // Propagar al compras_gastos vinculado para que el ER lo refleje
      if (sel.gasto_id) {
        const camposGasto = { categoria: fichaClasifCategoria || sel.categoria_er || 'Gastos operativos' };
        if (fichaClasifCeco) camposGasto.centro_costo_id = fichaClasifCeco;
        await finanzasService.actualizarGasto(sel.gasto_id, camposGasto);
      }
      const updated = { ...sel, ...camposCxP };
      setSel(updated);
      setCxp(prev => prev.map(c => c.id === sel.id ? updated : c));
      addNotificacion('Clasificación guardada.');
    } catch (e) {
      addNotificacion('Error al guardar: ' + e.message);
    } finally {
      setGuardandoClasif(false);
    }
  };

  const onProveedorChange = proveedorId => {
    const prov = (proveedores || []).find(p => p.id === proveedorId);
    const dias  = diasDesdeCondicion(prov?.condicion_pago);
    const vence = addDays(formCrear.fecha_emision, dias);
    setFormCrear(v => ({ ...v, proveedor_id: proveedorId, fecha_vencimiento: vence }));
  };

  const onEmisionChange = fecha => {
    const prov  = (proveedores || []).find(p => p.id === formCrear.proveedor_id);
    const dias  = prov ? diasDesdeCondicion(prov.condicion_pago) : 30;
    const vence = addDays(fecha, dias);
    setFormCrear(v => ({ ...v, fecha_emision: fecha, fecha_vencimiento: vence }));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas por Pagar</h1>
          <div className="page-sub">
            Total por pagar {money(saldosPEN)}{saldosUSD > 0 && <> · {money(saldosUSD, 'US$')}</>}
            {' · '}
            {money(vencidoPEN)}{vencidoUSD > 0 && <> · {money(vencidoUSD, 'US$')}</>} vencido
          </div>
        </div>
        <div className="row" style={{gap:8}}>
          <button className="btn btn-secondary" onClick={() => abrirCrearCxP(tabCxP === 'tributos' ? 'tributos' : 'general')} style={{fontSize:13}}>
            {I.plus} {tabCxP === 'tributos' ? 'Registrar tributo' : 'Avanzado'}
          </button>
          <button className="btn btn-primary" onClick={() => setPanelNuevoEgreso(true)}>
            {I.plus} Nuevo egreso
          </button>
        </div>
      </div>

      <div className="tabs" style={{marginBottom:16}}>
        {[
          { id:'general', label:`General (${(cxp || []).length})` },
          { id:'tributos', label:`Tributos (${cxpTributos.length})` },
        ].map(t => (
          <div key={t.id} className={'tab '+(tabCxP===t.id?'active':'')} onClick={() => setTabCxP(t.id)}>{t.label}</div>
        ))}
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card">
          <div className="kpi-label">Pendiente</div>
          <div className="kpi-value" style={{fontSize:20, display:'flex', flexDirection:'column', gap:4, marginTop:12}}>
            <span>{money(saldosPEN)}</span>
            {saldosUSD > 0 && <span style={{fontSize:16, color:'var(--fg-muted)'}}>{money(saldosUSD,'US$')}</span>}
          </div>
          <div className="kpi-icon cyan">{I.dollar}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Vencido</div>
          <div className="kpi-value" style={{fontSize:20, display:'flex', flexDirection:'column', gap:4, marginTop:12, color:'var(--danger)'}}>
            <span>{money(vencidoPEN)}</span>
            {vencidoUSD > 0 && <span style={{fontSize:16}}>{money(vencidoUSD,'US$')}</span>}
          </div>
          <div className="kpi-icon danger">{I.alert}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Por vencer (7 d)</div>
          <div className="kpi-value" style={{marginTop:12, color:'var(--orange)'}}>{porVencer7}</div>
          <div className="kpi-icon orange">{I.clock}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pagadas</div>
          <div className="kpi-value" style={{marginTop:12}}>{(cxp||[]).filter(c => c.estado === 'pagada').length}</div>
          <div className="kpi-icon green">{I.check}</div>
        </div>
      </div>

      <div className="row" style={{gap:8, marginTop:16, marginBottom:4, flexWrap:'wrap'}}>
        {[{v:'todos',l:'Todos'},{v:'proveedor',l:'Proveedores'},{v:'personal',l:'Colaboradores'},{v:DIVIDENDO_TIPO,l:'Socio / accionista'}].map(f => (
          <button key={f.v} className={'btn btn-sm '+(filtTipo===f.v?'btn-primary':'btn-secondary')} onClick={() => setFiltTipo(f.v)}>{f.l}</button>
        ))}
        <div style={{width:1,background:'var(--border)',margin:'0 4px'}}/>
        {[{v:'todos',l:'Origen: Todos'},{v:'recepcion',l:'OC'},{v:'gasto',l:'Gasto directo'},{v:'rhe_externo',l:'RHE'},{v:'honorarios',l:'Honorarios'},{v:'viaticos',l:'Viáticos'},{v:'nomina',l:'Nómina'},{v:'manual',l:'Manual'}].map(f => (
          <button key={f.v} className={'btn btn-sm '+(filtOrigen===f.v?'btn-primary':'btn-secondary')} onClick={() => setFiltOrigen(f.v)}>{f.l}</button>
        ))}
        <div style={{width:1,background:'var(--border)',margin:'0 4px'}}/>
        {[{v:'todos',l:'Todas'},{v:'PEN',l:'S/ PEN'},{v:'USD',l:'US$ USD'}].map(f => (
          <button key={f.v} className={'btn btn-sm '+(filtMoneda===f.v?'btn-primary':'btn-secondary')} onClick={() => setFiltMoneda(f.v)}>{f.l}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:12}}></th>
                <th>{tabCxP === 'tributos' ? 'Periodo tributario' : 'Beneficiario'}</th>
                <th>{tabCxP === 'tributos' ? 'Tipo de tributo' : 'Documento / Concepto'}</th>
                <th>Emisión</th>
                <th>{tabCxP === 'tributos' ? 'Vencimiento SUNAT' : 'Vencimiento'}</th>
                <th>Total</th>
                <th>{tabCxP === 'tributos' ? 'Estado' : 'Pagado'}</th>
                <th>{tabCxP === 'tributos' ? 'Formulario' : 'Saldo'}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cxpFiltrada.length ? cxpFiltrada.map(c => {
                const sem = semaforoDe(c);
                return (
                  <tr key={c.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => abrirFicha(c)}>
                    <td><span title={sem.label} style={{display:'inline-block',width:10,height:10,borderRadius:999,background:sem.bg,flexShrink:0}}/></td>
                    <td style={{fontWeight:600}}>
                      {tabCxP === 'tributos' ? (cxpTributoPeriodo(c) || '-') : (
                        <>
                          {beneficiarioNombre(c)}
                          {c.tipo_beneficiario === 'personal' && <span className="badge badge-cyan" style={{marginLeft:6,fontSize:10,padding:'1px 5px'}}>Colab.</span>}
                        </>
                      )}
                    </td>
                    <td className={tabCxP === 'tributos' ? '' : 'mono text-muted'} style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {tabCxP === 'tributos' ? (
                        <>
                          <strong>{cxpTributoTipoLabel(c)}</strong>
                          <div className="text-muted" style={{fontSize:11}}>{c.motivo_cxp || 'tributo'}</div>
                        </>
                      ) : (c.factura_numero || c.concepto || '-')}
                    </td>
                    <td className="text-muted">{c.fecha_emision}</td>
                    <td style={{color: sem.badgeCls === 'badge-red' || sem.badgeCls === 'badge-orange' ? sem.bg : undefined, fontWeight: sem.badgeCls === 'badge-red' ? 600 : undefined}}>
                      <span style={{display:'flex',alignItems:'center',gap:5}}>
                        {c.fecha_vencimiento}
                        {sem.badgeCls !== 'badge-gray' && <span className={'badge '+sem.badgeCls} style={{fontSize:9,padding:'1px 5px'}}>{sem.label}</span>}
                      </span>
                    </td>
                    <td className="num"><strong>{money(totalDe(c), symOf(c.moneda))}</strong></td>
                    <td className={tabCxP === 'tributos' ? '' : 'num text-muted'}>
                      {tabCxP === 'tributos'
                        ? <span className={'badge '+(c.estado === 'pagada' ? 'badge-green' : sem.badgeCls)}>{String(c.estado || 'por_pagar').replace('_',' ')}</span>
                        : money(pagadoDe(c), symOf(c.moneda))}
                    </td>
                    <td className={tabCxP === 'tributos' ? 'mono text-muted' : 'num'}>
                      {tabCxP === 'tributos' ? (c.tributo_formulario || c.factura_numero || '-') : <strong>{money(saldoDe(c), symOf(c.moneda))}</strong>}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{whiteSpace:'nowrap'}}>
                      {c.archivo_factura_url && <a href={c.archivo_factura_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary" style={{marginRight:4}} title="Ver RHE adjunto">{I.file}</a>}
                      {c.archivo_constancia_url && <a href={c.archivo_constancia_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary" style={{marginRight:6}} title="Ver constancia de suspensión">{I.doc}</a>}
                      {saldoDe(c) > 0 && <button className="btn btn-sm btn-primary" onClick={() => abrirFicha(c)}>Pagar</button>}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="9" className="text-center text-muted" style={{padding:32}}>No hay cuentas por pagar registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Panel ficha (pago + historial) ─────────────────────────────── */}
      {sel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
          <div className="side-panel" style={{width:'min(520px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">{sel.tipo_beneficiario === 'personal' ? 'Honorarios colaborador' : 'Factura proveedor'}</div>
                <div style={{fontWeight:700,fontSize:20}}>{beneficiarioNombre(sel)}</div>
                <div style={{fontSize:12,color:'var(--fg-muted)'}}>{sel.factura_numero || sel.concepto || sel.id}</div>
              </div>
              <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
            </div>

            <div className="tabs" style={{padding:'0 20px'}}>
              {[
                {id:'pago',label:'Registrar pago'},
                {id:'historial',label:`Historial (${pagosDe(sel.id).length})`},
                ...(sel.archivo_factura_url ? [{id:'comprobante',label:'RHE'}] : []),
                ...(sel.archivo_constancia_url ? [{id:'constancia',label:'Constancia'}] : []),
              ].map(t => (
                <div key={t.id} className={'tab '+(fichaTab===t.id?'active':'')} onClick={() => setFichaTab(t.id)}>{t.label}</div>
              ))}
            </div>

            {fichaTab === 'pago' && (
              <form className="side-panel-body" onSubmit={guardarPago}>
                <div className="card" style={{padding:14,marginBottom:16}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    {[['Total',money(totalDe(sel),symOf(sel.moneda))],['Pagado',money(pagadoDe(sel),symOf(sel.moneda))],['Saldo pendiente',money(saldoDe(sel),symOf(sel.moneda))],['Vencimiento',sel.fecha_vencimiento || '—']].map(([l,v]) => (
                      <div key={l}><div style={{fontSize:10,color:'var(--fg-muted)',marginBottom:2}}>{l}</div><div style={{fontWeight:600,fontSize:13}}>{v}</div></div>
                    ))}
                  </div>
                  {sel.gasto_id && (
                    <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border-subtle)',fontSize:12,color:'var(--fg-muted)',display:'flex',alignItems:'center',gap:6}}>
                      {I.receipt} Originada desde gasto: <span className="mono" style={{fontWeight:600,color:'var(--fg)'}}>{sel.gasto_id}</span>
                    </div>
                  )}
                  <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border-subtle)',display:'flex',flexDirection:'column',gap:8}}>
                    <div style={{fontSize:11,color:'var(--fg-muted)',fontWeight:600}}>Clasificación en Estado de Resultados</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <div className="input-group" style={{marginBottom:0}}>
                        <label style={{fontSize:11}}>Categoría ER</label>
                        <select className="select" style={{fontSize:12}} value={fichaClasifCategoria} onChange={e => setFichaClasifCategoria(e.target.value)}>
                          <option value="">Automático</option>
                          <option value="Materiales">Materiales</option>
                          <option value="Servicios terceros">Servicios terceros</option>
                          <option value="Logística">Logística</option>
                          <option value="Administrativos">Administrativos</option>
                          <option value="Comerciales">Comerciales</option>
                        </select>
                      </div>
                      <div className="input-group" style={{marginBottom:0}}>
                        <label style={{fontSize:11}}>Centro de costo</label>
                        <select className="select" style={{fontSize:12}} value={fichaClasifCeco} onChange={e => setFichaClasifCeco(e.target.value)}>
                          <option value="">Sin CECO</option>
                          {cecos.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                        </select>
                      </div>
                    </div>
                    <button type="button" className="btn btn-sm btn-secondary" style={{alignSelf:'flex-end'}} onClick={guardarClasificacion} disabled={guardandoClasif}>
                      {guardandoClasif ? 'Guardando...' : 'Guardar clasificación'}
                    </button>
                  </div>
                </div>
                {saldoDe(sel) > 0 ? (
                  <>
                    <div className="grid-2" style={{gap:12}}>
                      <div className="input-group">
                        <label>Monto pagado</label>
                        <input className="input" type="number" min="0" step="0.01" value={formPago.monto} onChange={e => setFormPago(v => ({...v,monto:e.target.value}))}/>
                      </div>
                      <div className="input-group">
                        <label>Fecha</label>
                        <input className="input" type="date" value={formPago.fecha} onChange={e => setFormPago(v => ({...v,fecha:e.target.value}))}/>
                      </div>
                      <div className="input-group">
                        <label>Cuenta bancaria</label>
                        <input className="input" value={formPago.cuenta_bancaria} onChange={e => setFormPago(v => ({...v,cuenta_bancaria:e.target.value}))}/>
                      </div>
                      <div className="input-group">
                        <label>Referencia</label>
                        <input className="input" value={formPago.referencia} onChange={e => setFormPago(v => ({...v,referencia:e.target.value}))} placeholder="Operación bancaria"/>
                      </div>
                    </div>
                    <div className="row mt-6" style={{justifyContent:'flex-end'}}>
                      <button type="button" className="btn btn-secondary" onClick={() => setSel(null)}>Cancelar</button>
                      <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Registrando...' : 'Registrar pago'}</button>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted" style={{padding:24}}>Esta CxP está completamente pagada.</div>
                )}
              </form>
            )}

            {fichaTab === 'historial' && (
              <div className="side-panel-body">
                {pagosDe(sel.id).length === 0 ? (
                  <div className="text-center text-muted" style={{padding:24}}>Sin pagos registrados aún.</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {pagosDe(sel.id).map((p, i) => (
                      <div key={p.id || i} style={{background:'var(--bg-subtle)',borderRadius:8,padding:'10px 14px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                          <span style={{fontWeight:700,fontSize:15}}>{money(p.monto, symOf(sel.moneda))}</span>
                          <span style={{fontSize:12,color:'var(--fg-muted)'}}>{p.fecha_pago}</span>
                        </div>
                        <div style={{fontSize:11,color:'var(--fg-muted)'}}>
                          {p.cuenta_bancaria && <span>{p.cuenta_bancaria}</span>}
                          {p.referencia && <span> · Ref: {p.referencia}</span>}
                        </div>
                      </div>
                    ))}
                    <div style={{borderTop:'1px solid var(--border)',paddingTop:10,display:'flex',justifyContent:'space-between',fontSize:13}}>
                      <span style={{color:'var(--fg-muted)'}}>Total pagado</span>
                      <strong>{money(pagosDe(sel.id).reduce((s,p) => s + Number(p.monto||0), 0), symOf(sel.moneda))}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {fichaTab === 'comprobante' && sel.archivo_factura_url && (
              <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:12,alignItems:'center'}}>
                {/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(sel.archivo_factura_url) ? (
                  <img src={sel.archivo_factura_url} alt="RHE" style={{maxWidth:'100%',borderRadius:8,border:'1px solid var(--border)'}}/>
                ) : null}
                <a href={sel.archivo_factura_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{width:'100%',justifyContent:'center'}}>
                  {I.file} Abrir RHE en nueva pestaña
                </a>
              </div>
            )}

            {fichaTab === 'constancia' && sel.archivo_constancia_url && (
              <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:12,alignItems:'center'}}>
                {/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(sel.archivo_constancia_url) ? (
                  <img src={sel.archivo_constancia_url} alt="Constancia" style={{maxWidth:'100%',borderRadius:8,border:'1px solid var(--border)'}}/>
                ) : null}
                <a href={sel.archivo_constancia_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{width:'100%',justifyContent:'center'}}>
                  {I.file} Abrir constancia en nueva pestaña
                </a>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Panel Nuevo Egreso (flujo unificado) ──────────────────────── */}
      {panelNuevoEgreso && (
        <NuevoEgreso
          origen="cxp"
          onClose={() => setPanelNuevoEgreso(false)}
          onSaved={() => setPanelNuevoEgreso(false)}
        />
      )}

      {/* ── Panel crear CxP manual ─────────────────────────────────────── */}
      {panelCrear && (
        <>
          <div className="side-panel-backdrop" onClick={resetCrearCxP}/>
          <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Nueva cuenta por pagar</div>
                <div style={{fontWeight:700,fontSize:20}}>{motivoCxP === 'viaticos_reembolso' ? 'Reembolso de viáticos' : 'Registrar factura'}</div>
              </div>
              <button className="icon-btn" onClick={resetCrearCxP}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarNuevaCxP}>
              <div className="input-group">
                <label>Motivo</label>
                <select className="select" value={motivoCxP} onChange={e => {
                  const value = e.target.value;
                  setMotivoCxP(value);
                  if (value === 'tributo') {
                    setCxpCategoriaEr('Tributos');
                    setFormCrear(v => ({...v, tipo_beneficiario:'colectivo', tipo_comprobante:'Tributo', proveedor_id:'', concepto: tributoConcepto}));
                  } else if (value === 'viaticos_reembolso') {
                    setFormCrear(v => ({...v, tipo_beneficiario:'personal'}));
                  }
                }}>
                  <option value="">Factura / gasto de proveedor (estándar)</option>
                  <option value="viaticos_reembolso">Reembolso de viáticos o gastos de campo a colaborador</option>
                </select>
              </div>
              {!esTributoForm && (
                <div className="input-group">
                  <label>Tipo de beneficiario</label>
                  <select className="select" value={formCrear.tipo_beneficiario || 'proveedor'} onChange={e => {
                    const value = e.target.value;
                    setFormCrear(v => ({
                      ...v,
                      tipo_beneficiario: value,
                      proveedor_id: value === 'proveedor' ? v.proveedor_id : '',
                      tipo_comprobante: value === DIVIDENDO_TIPO ? 'distribucion_utilidades' : (v.tipo_comprobante === 'distribucion_utilidades' ? 'Factura' : v.tipo_comprobante),
                      concepto: value === DIVIDENDO_TIPO ? dividendoConcepto : v.concepto,
                    }));
                    if (value === DIVIDENDO_TIPO) setMotivoCxP('');
                  }}>
                    <option value="proveedor">Proveedor</option>
                    <option value="personal">Colaborador</option>
                    <option value={DIVIDENDO_TIPO}>Socio / accionista</option>
                  </select>
                </div>
              )}
              {motivoCxP === 'viaticos_reembolso' && (
                <div style={{background:'var(--bg-subtle)', borderRadius:8, padding:'12px 14px', display:'flex', flexDirection:'column', gap:12}}>
                  <div style={{fontSize:12, color:'var(--fg-muted)', fontWeight:600}}>Datos del reembolso</div>
                  <div className="input-group">
                    <label>Colaborador <span style={{color:'var(--danger)'}}>*</span></label>
                    <select className="select" value={viaticosPersonalId} onChange={e => setViaticosPersonalId(e.target.value)}>
                      <option value="">— Seleccionar colaborador —</option>
                      {[...(personalAdmin||[]), ...(personalOperativo||[])].filter(p => p.estado !== 'inactivo').map(p => (
                        <option key={p.id} value={p.id}>{p.nombre} — {p.cargo || 'Sin cargo'}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>OT vinculada (opcional)</label>
                    <select className="select" value={viaticosOtId} onChange={e => setViaticosOtId(e.target.value)}>
                      <option value="">Sin OT</option>
                      {(ots||[]).filter(o => o.estado !== 'anulada').map(o => (
                        <option key={o.id} value={o.id}>{o.numero || o.id} — {o.nombre || o.descripcion || ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {esTributoForm && (
                <div style={{background:'var(--bg-subtle)', borderRadius:8, padding:'12px 14px', display:'flex', flexDirection:'column', gap:12}}>
                  <div style={{fontSize:12, color:'var(--fg-muted)', fontWeight:600}}>Datos tributarios</div>
                  <div className="grid-2" style={{gap:12}}>
                    <div className="input-group">
                      <label>Tipo de tributo <span style={{color:'var(--danger)'}}>*</span></label>
                      <select className="select" value={tributoTipo} onChange={e => setTributoTipo(e.target.value)}>
                        {TRIBUTO_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Periodo tributario <span style={{color:'var(--danger)'}}>*</span></label>
                      <input className="input" type="month" value={tributoPeriodo} onChange={e => setTributoPeriodo(e.target.value)} />
                    </div>
                    <div className="input-group" style={{gridColumn:'1/-1'}}>
                      <label>Nro. declaracion / formulario SUNAT</label>
                      <input className="input" value={tributoFormulario} onChange={e => setTributoFormulario(e.target.value)} placeholder="Formulario, orden o constancia" />
                    </div>
                  </div>
                </div>
              )}
              {esDividendoForm && (
                <div style={{background:'var(--bg-subtle)', borderRadius:8, padding:'12px 14px', display:'flex', flexDirection:'column', gap:12}}>
                  <div style={{fontSize:12, color:'var(--fg-muted)', fontWeight:600}}>Datos del socio / accionista</div>
                  <div className="input-group">
                    <label>Nombre del socio o accionista <span style={{color:'var(--danger)'}}>*</span></label>
                    <input className="input" value={socioNombre} onChange={e => setSocioNombre(e.target.value)} placeholder="Nombre completo o razon social" />
                  </div>
                  <div className="grid-2" style={{gap:12}}>
                    <div className="input-group">
                      <label>Participacion %</label>
                      <input className="input" type="number" min="0" max="100" step="0.01" value={socioParticipacion} onChange={e => setSocioParticipacion(e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Periodo utilidades <span style={{color:'var(--danger)'}}>*</span></label>
                      <input className="input" type="number" min="2000" max="2100" value={periodoUtilidades} onChange={e => setPeriodoUtilidades(e.target.value)} />
                    </div>
                    <div className="input-group" style={{gridColumn:'1/-1'}}>
                      <label>Acuerdo o acta de referencia</label>
                      <input className="input" value={actaReferencia} onChange={e => setActaReferencia(e.target.value)} placeholder="Acta de junta, acuerdo interno, etc." />
                    </div>
                  </div>
                </div>
              )}
              <div className="input-group">
                <label>Tipo de comprobante</label>
                <select className="select" value={formCrear.tipo_comprobante} onChange={e => setFormCrear(v => ({...v,tipo_comprobante:e.target.value}))}>
                  <option value="Factura">Factura</option>
                  <option value="Boleta">Boleta</option>
                  <option value="RHE">RHE — Recibo por Honorarios (externo)</option>
                </select>
              </div>
              {formCrear.tipo_comprobante === 'RHE' ? (
                <div style={{background:'var(--bg-subtle)',borderRadius:8,padding:'14px',display:'flex',flexDirection:'column',gap:12}}>
                  <div style={{fontSize:12,color:'var(--fg-muted)',marginBottom:2}}>Datos del emisor del RHE</div>
                  <div className="grid-2" style={{gap:12}}>
                    <div className="input-group" style={{gridColumn:'1/-1'}}>
                      <label>RUC del emisor <span style={{color:'var(--danger)'}}>*</span></label>
                      <input className="input" value={rheRuc} onChange={e => setRheRuc(e.target.value.replace(/\D/g,'').slice(0,11))} placeholder="20512345678" maxLength={11}/>
                      {rheRuc && rheRuc.length !== 11 && <div style={{fontSize:11,color:'var(--danger)',marginTop:2}}>El RUC debe tener 11 dígitos</div>}
                    </div>
                    <div className="input-group" style={{gridColumn:'1/-1'}}>
                      <label>Nombre / Razón Social <span style={{color:'var(--danger)'}}>*</span></label>
                      <input className="input" value={rheNombre} onChange={e => setRheNombre(e.target.value)} placeholder="Consultor Externo SAC"/>
                    </div>
                    <div className="input-group" style={{gridColumn:'1/-1'}}>
                      <label>N° RHE</label>
                      <input className="input" value={rheNumeroDoc} onChange={e => setRheNumeroDoc(e.target.value)} placeholder="RHE-00001"/>
                    </div>
                    <div className="input-group">
                      <label>Monto bruto <span style={{color:'var(--danger)'}}>*</span></label>
                      <input className="input" type="number" min="0" step="0.01" value={rheMontoBruto} onChange={e => setRheMontoBruto(e.target.value)} placeholder="0.00"/>
                    </div>
                    <div className="input-group">
                      <label>Moneda</label>
                      <select className="select" value={formCrear.moneda} onChange={e => setFormCrear(v => ({...v,moneda:e.target.value}))}>
                        <option value="PEN">PEN</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>
                  {Number(rheMontoBruto) > 0 && (
                    <div style={{background:'var(--bg)',borderRadius:6,padding:'10px 12px',fontSize:13}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{color:'var(--fg-muted)'}}>Monto bruto</span><strong>{Number(rheMontoBruto).toFixed(2)}</strong></div>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{color:'var(--danger)'}}>Retención IR 8%</span><span style={{color:'var(--danger)'}}>- {rheRetencion.toFixed(2)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,borderTop:'1px solid var(--border)',paddingTop:6}}><span>Monto a pagar (neto)</span><span>{rheMontoNeto.toFixed(2)}</span></div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="input-group" style={esTributoForm || esDividendoForm ? {display:'none'} : undefined}>
                    <label>Proveedor</label>
                    <select className="select" value={formCrear.proveedor_id} onChange={e => onProveedorChange(e.target.value)}>
                      <option value="">— Seleccionar proveedor —</option>
                      {(proveedores || []).filter(p => p.estado !== 'inactivo').map(p => (
                        <option key={p.id} value={p.id}>{p.razon_social}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid-2" style={{gap:12}}>
                    <div className="input-group">
                      <label>N° factura / documento</label>
                      <input className="input" value={formCrear.factura_numero} onChange={e => setFormCrear(v => ({...v,factura_numero:e.target.value}))} placeholder="E001-001234"/>
                    </div>
                    <div className="input-group">
                      <label>Moneda</label>
                      <select className="select" value={formCrear.moneda} onChange={e => setFormCrear(v => ({...v,moneda:e.target.value}))}>
                        <option value="PEN">PEN — Soles</option>
                        <option value="USD">USD — Dólares</option>
                      </select>
                    </div>
                    <div className="input-group" style={{gridColumn:'1/-1'}}>
                      <label>Monto total <span style={{color:'var(--danger)'}}>*</span></label>
                      <input className="input" type="number" min="0" step="0.01" value={formCrear.monto_total} onChange={e => setFormCrear(v => ({...v,monto_total:e.target.value}))} placeholder="0.00" required/>
                    </div>
                    <div className="input-group" style={{gridColumn:'1/-1'}}>
                      <label>Concepto (opcional)</label>
                      <input className="input" value={formCrear.concepto} onChange={e => setFormCrear(v => ({...v,concepto:e.target.value}))} placeholder="Descripción del gasto o servicio"/>
                    </div>
                  </div>
                </>
              )}
              <div style={{background:'var(--bg-subtle)', borderRadius:8, padding:'12px 14px', display:'flex', flexDirection:'column', gap:12}}>
                <div style={{fontSize:12, color:'var(--fg-muted)', fontWeight:600}}>Clasificación en Estado de Resultados</div>
                <div className="input-group">
                  <label>Categoría ER</label>
                  <select className="select" value={cxpCategoriaEr} onChange={e => setCxpCategoriaEr(e.target.value)}>
                    <option value="">Automático (según tipo de comprobante)</option>
                    <option value="Materiales">Materiales</option>
                    <option value="Servicios terceros">Servicios terceros</option>
                    <option value="Logística">Logística</option>
                    <option value="Administrativos">Administrativos</option>
                    <option value="Comerciales">Comerciales</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Centro de costo (opcional)</label>
                  <select className="select" value={cxpCentroCostoId} onChange={e => setCxpCentroCostoId(e.target.value)}>
                    <option value="">Sin CECO asignado</option>
                    {cecos.map(c => (
                      <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              {!esTributoForm && !esDividendoForm && (
                <label style={{
                  display:'flex', alignItems:'center', gap:10, cursor:'pointer',
                  padding:'10px 14px', borderRadius:8,
                  background: cxpYaRegistrado
                    ? 'color-mix(in srgb, var(--orange) 8%, var(--surface))'
                    : 'var(--bg-subtle)',
                  border: `1px solid ${cxpYaRegistrado ? 'color-mix(in srgb, var(--orange) 30%, var(--border))' : 'var(--border)'}`,
                }}>
                  <input
                    type="checkbox"
                    checked={cxpYaRegistrado}
                    onChange={e => setCxpYaRegistrado(e.target.checked)}
                    style={{width:16, height:16, cursor:'pointer', flexShrink:0}}
                  />
                  <div>
                    <div style={{fontSize:13, fontWeight:600}}>Este gasto ya fue registrado en Compras/Gastos</div>
                    <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:2}}>
                      Marca esto si el gasto ya existe en compras_gastos para evitar que se cree un devengo duplicado en el ER.
                    </div>
                  </div>
                </label>
              )}
              <div className="grid-2" style={{gap:12, marginTop:4}}>
                <div className="input-group">
                  <label>Fecha de emisión</label>
                  <input className="input" type="date" value={formCrear.fecha_emision} onChange={e => onEmisionChange(e.target.value)}/>
                </div>
                <div className="input-group">
                  <label>Fecha de vencimiento</label>
                  <input className="input" type="date" value={formCrear.fecha_vencimiento} onChange={e => setFormCrear(v => ({...v,fecha_vencimiento:e.target.value}))}/>
                </div>
              </div>
              <div className="input-group">
                <label>Adjuntar comprobante (foto o PDF)</label>
                <input className="input" type="file" accept="image/*,.pdf" onChange={e => {
                  const file = e.target.files[0];
                  setArchivoCrearUrl(file ? URL.createObjectURL(file) : '');
                }}/>
                {archivoCrearUrl && <div style={{fontSize:12,color:'var(--green)',marginTop:4}}>Archivo adjunto listo.</div>}
              </div>
              <div className="row mt-6" style={{justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={() => { setPanelCrear(false); setArchivoCrearUrl(''); setFormCrear(FORM_VACIO); setRheRuc(''); setRheNombre(''); setRheMontoBruto(''); setRheNumeroDoc(''); setCxpCategoriaEr(''); setCxpCentroCostoId(''); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Registrar CxP'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

const ACTIVO_TIPOS = [
  { value:'equipo', label:'Equipo' },
  { value:'vehiculo', label:'Vehiculo' },
  { value:'mueble', label:'Mueble' },
  { value:'intangible', label:'Intangible' },
  { value:'otro', label:'Otro' },
];

function ActivosFijos() {
  const { comprasGastos = [], centrosCosto = [], crearGasto, addNotificacion } = useApp();
  const today = new Date().toISOString().split('T')[0];
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const init = { descripcion:'', activo_tipo:'equipo', fecha:today, monto:'', moneda:'PEN', vida_util_anos:'', centro_costo_id:'', proveedor_referencia:'', notas:'', archivo_url:'', activo_estado:'activo' };
  const [form, setForm] = useState(init);
  const cecos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const cecoNombre = id => {
    const c = (centrosCosto || []).find(x => x.id === id);
    return c ? `${c.codigo || c.id} - ${c.nombre}` : (id || '-');
  };
  const activos = (comprasGastos || [])
    .filter(g => g.es_activo_fijo)
    .sort((a,b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || String(a.id || '').localeCompare(String(b.id || '')))
    .map((g, i) => ({ ...g, codigo_af: g.codigo_af || `AF-${String(i + 1).padStart(3,'0')}`, activo_estado: g.activo_estado || g.estado_activo || 'activo' }));
  const activosActivos = activos.filter(a => a.activo_estado === 'activo' && a.estado !== 'anulado');
  const anioActual = new Date().getFullYear();
  const valorPeriodo = activos.filter(a => new Date(`${a.fecha || today}T00:00:00`).getFullYear() === anioActual).reduce((s,a) => s + Number(a.monto || 0), 0);
  const vidaCumplida = a => {
    if (!a.fecha || !a.vida_util_anos) return false;
    const fin = new Date(`${a.fecha}T00:00:00`);
    fin.setFullYear(fin.getFullYear() + Number(a.vida_util_anos));
    return fin <= new Date(`${today}T00:00:00`);
  };
  const porDarBaja = activosActivos.filter(vidaCumplida);
  const reset = () => { setPanel(false); setForm(init); };

  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(activosActivos.map(a => ({
      codigo: a.codigo_af,
      descripcion: a.descripcion,
      tipo: a.activo_tipo || '',
      fecha_adquisicion: a.fecha || '',
      valor_adquisicion: Number(a.monto || 0),
      moneda: a.moneda || 'PEN',
      vida_util_anos: a.vida_util_anos || '',
      ceco: cecoNombre(a.centro_costo_id),
      estado: a.activo_estado,
      origen_registro: a.origen_registro || 'compras_gastos',
      gasto_origen_id: a.id,
      referencia: a.num_comprobante || a.proveedor_referencia || a.referencia_pago || '',
      notas: a.notas || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Activos Fijos');
    XLSX.writeFile(wb, `activos_fijos_${today}.xlsx`);
  };

  const guardar = async e => {
    e.preventDefault();
    if (!form.descripcion.trim() || !form.monto || !form.fecha || !form.vida_util_anos) {
      addNotificacion('Completa nombre, fecha, valor y vida util.');
      return;
    }
    setGuardando(true);
    try {
      await crearGasto({
        tipo: 'activo_fijo',
        descripcion: form.descripcion.trim(),
        categoria: 'Activos fijos',
        monto: Number(form.monto || 0),
        moneda: form.moneda || 'PEN',
        fecha: form.fecha,
        centro_costo_id: form.centro_costo_id || null,
        es_activo_fijo: true,
        activo_tipo: form.activo_tipo,
        vida_util_anos: Number(form.vida_util_anos),
        origen_registro: 'backoffice',
        estado: 'registrado',
        activo_estado: form.activo_estado,
        proveedor_referencia: form.proveedor_referencia || null,
        notas: form.notas || null,
        archivo_url: form.archivo_url || null,
      });
      reset();
      addNotificacion('Activo fijo registrado.');
    } finally {
      setGuardando(false);
    }
  };

  const eventos = a => [
    { fecha: a.created_at || a.fecha || '-', texto: `Alta registrada desde ${a.origen_registro || 'compras_gastos'}` },
    ...(a.activo_estado !== 'activo' ? [{ fecha: today, texto: `Estado actual: ${a.activo_estado}` }] : []),
    ...(a.notas ? [{ fecha: a.fecha || '-', texto: a.notas }] : []),
  ];

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Activos Fijos</h1><div className="page-sub">Kardex de activos registrados en compras_gastos</div></div>
        <div className="row"><button className="btn btn-secondary" onClick={exportarExcel}>{I.download} Exportar a Excel</button><button className="btn btn-primary" onClick={() => setPanel(true)}>{I.plus} Nuevo activo</button></div>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Activos activos</div><div className="kpi-value">{activosActivos.length}</div><div className="kpi-icon green">{I.package}</div></div>
        <div className="kpi-card"><div className="kpi-label">Valor adquirido {anioActual}</div><div className="kpi-value" style={{fontSize:22}}>{money(valorPeriodo)}</div><div className="kpi-icon cyan">{I.dollar}</div></div>
        <div className="kpi-card"><div className="kpi-label">Por dar de baja</div><div className="kpi-value" style={{color:porDarBaja.length?'var(--orange)':undefined}}>{porDarBaja.length}</div><div className="kpi-icon orange">{I.clock}</div></div>
      </div>
      <div className="card mt-6"><div className="table-wrap"><table className="tbl">
        <thead><tr><th>Codigo</th><th>Activo</th><th>Tipo</th><th>Adquisicion</th><th>Valor</th><th>Vida util</th><th>CECO</th><th>Estado</th><th>Origen</th></tr></thead>
        <tbody>{activos.length ? activos.map(a => (
          <tr key={a.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => setSel(a)}>
            <td className="mono" style={{fontWeight:700}}>{a.codigo_af}</td><td><strong>{a.descripcion}</strong></td><td>{ACTIVO_TIPOS.find(t => t.value === a.activo_tipo)?.label || a.activo_tipo || '-'}</td><td className="text-muted">{a.fecha || '-'}</td><td className="num"><strong>{money(Number(a.monto || 0), symOf(a.moneda))}</strong></td><td className="num">{a.vida_util_anos ? `${a.vida_util_anos} anos` : '-'}</td><td className="text-muted" style={{fontSize:11}}>{cecoNombre(a.centro_costo_id)}</td><td><span className={'badge '+(a.activo_estado === 'activo' ? 'badge-green' : a.activo_estado === 'mantenimiento' ? 'badge-orange' : 'badge-gray')}>{String(a.activo_estado).replace('_',' ')}</span></td><td>{a.origen_registro === 'backoffice' ? <span className="badge badge-cyan">Backoffice</span> : <span className="badge badge-gray">Compras</span>}</td>
          </tr>
        )) : <tr><td colSpan="9" className="text-center text-muted" style={{padding:32}}>No hay activos fijos registrados.</td></tr>}</tbody>
      </table></div></div>

      {panel && <><div className="side-panel-backdrop" onClick={reset}/><div className="side-panel" style={{width:'min(560px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Alta manual</div><div style={{fontWeight:700,fontSize:20}}>Nuevo activo fijo</div></div><button className="icon-btn" onClick={reset}>{I.x}</button></div><form className="side-panel-body" onSubmit={guardar}>
        <div className="input-group"><label>Nombre / descripcion</label><input className="input" value={form.descripcion} onChange={e => setForm(v => ({...v,descripcion:e.target.value}))}/></div>
        <div className="grid-2" style={{gap:12}}><div className="input-group"><label>Tipo</label><select className="select" value={form.activo_tipo} onChange={e => setForm(v => ({...v,activo_tipo:e.target.value}))}>{ACTIVO_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div><div className="input-group"><label>Fecha adquisicion</label><input className="input" type="date" value={form.fecha} onChange={e => setForm(v => ({...v,fecha:e.target.value}))}/></div><div className="input-group"><label>Valor</label><input className="input" type="number" min="0" step="0.01" value={form.monto} onChange={e => setForm(v => ({...v,monto:e.target.value}))}/></div><div className="input-group"><label>Moneda</label><select className="select" value={form.moneda} onChange={e => setForm(v => ({...v,moneda:e.target.value}))}><option value="PEN">PEN</option><option value="USD">USD</option></select></div><div className="input-group"><label>Vida util en anos</label><input className="input" type="number" min="1" step="1" value={form.vida_util_anos} onChange={e => setForm(v => ({...v,vida_util_anos:e.target.value}))}/></div><div className="input-group"><label>Estado</label><select className="select" value={form.activo_estado} onChange={e => setForm(v => ({...v,activo_estado:e.target.value}))}><option value="activo">Activo</option><option value="mantenimiento">En mantenimiento</option><option value="dado_baja">Dado de baja</option></select></div></div>
        <div className="input-group"><label>CECO</label><select className="select" value={form.centro_costo_id} onChange={e => setForm(v => ({...v,centro_costo_id:e.target.value}))}><option value="">Sin CECO</option>{cecos.map(c => <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>)}</select></div>
        <div className="input-group"><label>Proveedor o referencia</label><input className="input" value={form.proveedor_referencia} onChange={e => setForm(v => ({...v,proveedor_referencia:e.target.value}))}/></div>
        <div className="input-group"><label>Adjunto del comprobante o contrato</label><input className="input" type="file" accept="image/*,.pdf" onChange={e => setForm(v => ({...v,archivo_url:e.target.files[0] ? URL.createObjectURL(e.target.files[0]) : ''}))}/></div>
        <div className="input-group"><label>Notas</label><textarea className="input" rows="3" value={form.notas} onChange={e => setForm(v => ({...v,notas:e.target.value}))}/></div>
        <div className="row mt-6" style={{justifyContent:'flex-end'}}><button type="button" className="btn btn-secondary" onClick={reset}>Cancelar</button><button className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar activo'}</button></div>
      </form></div></>}

      {sel && <><div className="side-panel-backdrop" onClick={() => setSel(null)}/><div className="side-panel" style={{width:'min(560px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">{sel.codigo_af}</div><div style={{fontWeight:700,fontSize:20}}>{sel.descripcion}</div></div><button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button></div><div className="side-panel-body">
        <div className="card" style={{padding:14,marginBottom:14}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>{[['Tipo', ACTIVO_TIPOS.find(t => t.value === sel.activo_tipo)?.label || sel.activo_tipo || '-'],['Estado', sel.activo_estado],['Fecha adquisicion', sel.fecha || '-'],['Valor', money(Number(sel.monto || 0), symOf(sel.moneda))],['Vida util', sel.vida_util_anos ? `${sel.vida_util_anos} anos` : '-'],['CECO', cecoNombre(sel.centro_costo_id)]].map(([l,v]) => <div key={l}><div style={{fontSize:10,color:'var(--fg-muted)'}}>{l}</div><div style={{fontWeight:600,fontSize:13}}>{v}</div></div>)}</div></div>
        <div className="card" style={{padding:14,marginBottom:14}}><div style={{fontSize:12,color:'var(--fg-muted)',fontWeight:700,marginBottom:8}}>Datos para depreciacion</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}><div><div style={{fontSize:10,color:'var(--fg-muted)'}}>Valor base</div><strong>{money(Number(sel.monto || 0), symOf(sel.moneda))}</strong></div><div><div style={{fontSize:10,color:'var(--fg-muted)'}}>Vida util</div><strong>{sel.vida_util_anos || '-'} anos</strong></div><div><div style={{fontSize:10,color:'var(--fg-muted)'}}>Fecha inicio</div><strong>{sel.fecha || '-'}</strong></div></div></div>
        <div className="card" style={{padding:14,marginBottom:14}}><div style={{fontSize:12,color:'var(--fg-muted)',fontWeight:700,marginBottom:8}}>Origen</div><div style={{fontSize:13}}>Registro: <span className="mono">{sel.id}</span></div><div style={{fontSize:13}}>Referencia: {sel.num_comprobante || sel.proveedor_referencia || sel.referencia_pago || '-'}</div>{sel.archivo_url && <a className="btn btn-secondary btn-sm mt-4" href={sel.archivo_url} target="_blank" rel="noreferrer">{I.file} Ver adjunto</a>}</div>
        <div className="card" style={{padding:14}}><div style={{fontSize:12,color:'var(--fg-muted)',fontWeight:700,marginBottom:8}}>Historial de eventos</div>{eventos(sel).map((ev,i) => <div key={i} style={{padding:'8px 0',borderBottom:i<eventos(sel).length-1?'1px solid var(--border-subtle)':'none'}}><div style={{fontSize:11,color:'var(--fg-muted)'}}>{ev.fecha}</div><div style={{fontSize:13}}>{ev.texto}</div></div>)}</div>
      </div></div></>}
    </>
  );
}

const CATS_PRE = ['Materiales','Servicios terceros','Logística','Administrativos','Comerciales','Gastos financieros','Mano de obra'];
const MESES_PRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_C_PRE = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const BADGE_E = {
  borrador:      { label:'Borrador',      cls:'badge-cyan'   },
  en_aprobacion: { label:'En aprobación', cls:'badge-orange'  },
  aprobado:      { label:'Aprobado',      cls:'badge-green'   },
  rechazado:     { label:'Rechazado',     cls:'badge-red'     },
  cerrado:       { label:'Cerrado',       cls:''              },
};

function Presupuestos() {
  const {
    presupuestos, presupuestoPartidas, presupuestoAprobaciones,
    crearPresupuesto, enviarPresupuestoAAprobacion, procesarAprobacionPresupuesto,
    comprasGastos, ots, usuarios, empresa, authUser,
    centrosCosto, centrosBeneficio,
  } = useApp();

  const now = new Date();
  const [periodo, setPeriodo]       = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [tab, setTab]               = useState('control');
  const [preSelId, setPreSelId]     = useState(null);
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [panelDetalle, setPanelDetalle] = useState(null);
  const [panelEnviar, setPanelEnviar]   = useState(false);
  const [formPre, setFormPre]       = useState({ nombre:'', periodo, centro_costo_id:'', cebe_id:'' });
  const [formParts, setFormParts]   = useState([{ categoria:'Materiales', descripcion:'', monto_presupuestado:'' }]);
  const [aprobadores, setAprobadores] = useState([null]);
  const [comentarioApr, setComentarioApr] = useState('');
  const [saving, setSaving]         = useState(false);

  const empresaId = empresa?.id;

  const periodoOpts = Array.from({length:12}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    return { v:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, l:`${MESES_C_PRE[d.getMonth()]} ${d.getFullYear()}` };
  });

  const [yy, mm] = periodo.split('-');
  const periodoLabel = `${MESES_PRE[parseInt(mm)-1]} ${yy}`;

  const presDePeriodo = (presupuestos||[]).filter(p => p.empresa_id === empresaId && p.periodo === periodo);
  const presActivo = preSelId
    ? (presupuestos||[]).find(p => p.id === preSelId)
    : presDePeriodo[0] || null;

  const partidas = useMemo(() =>
    presActivo ? (presupuestoPartidas||[]).filter(p => p.presupuesto_id === presActivo.id).sort((a,b)=>a.orden-b.orden) : [],
    [presActivo, presupuestoPartidas]);

  const cadena = useMemo(() =>
    presActivo ? (presupuestoAprobaciones||[]).filter(a => a.presupuesto_id === presActivo.id).sort((a,b)=>a.orden-b.orden) : [],
    [presActivo, presupuestoAprobaciones]);

  const esPeriodoMensual = periodo.length === 7;

  const calcReal = (categoria) => {
    if (categoria === 'Mano de obra') {
      return (ots||[]).filter(o => {
        if (o.empresa_id !== empresaId) return false;
        const p = esPeriodoMensual ? (o.fecha_cierre||o.fecha_inicio||'').slice(0,7) : (o.fecha_cierre||o.fecha_inicio||'').slice(0,4);
        return p === periodo && ['cerrada','facturada'].includes(o.estado);
      }).reduce((s,o) => s + Number(o.costo_real||0), 0);
    }
    return (comprasGastos||[]).filter(g => {
      if (g.empresa_id !== empresaId) return false;
      const p = esPeriodoMensual ? (g.fecha||'').slice(0,7) : (g.fecha||'').slice(0,4);
      return p === periodo && g.categoria === categoria;
    }).reduce((s,g) => s + Number(g.monto||0), 0);
  };

  const getDesglose = (categoria) => {
    if (categoria === 'Mano de obra') {
      return (ots||[]).filter(o => {
        if (o.empresa_id !== empresaId) return false;
        const p = esPeriodoMensual ? (o.fecha_cierre||o.fecha_inicio||'').slice(0,7) : (o.fecha_cierre||o.fecha_inicio||'').slice(0,4);
        return p === periodo && ['cerrada','facturada'].includes(o.estado);
      }).map(o => ({ fecha:o.fecha_cierre||o.fecha_inicio||'', descripcion:o.numero?`OT ${o.numero}`:o.nombre||'OT', proveedor:o.tecnico_lider||'—', monto:Number(o.costo_real||0), documento:o.numero||'—' }));
    }
    return (comprasGastos||[]).filter(g => {
      if (g.empresa_id !== empresaId) return false;
      const p = esPeriodoMensual ? (g.fecha||'').slice(0,7) : (g.fecha||'').slice(0,4);
      return p === periodo && g.categoria === categoria;
    }).map(g => ({ fecha:g.fecha||'', descripcion:g.descripcion||'—', proveedor:g.proveedor||'—', monto:Number(g.monto||0), documento:g.numero_documento||g.factura||'—' }));
  };

  const S = n => n == null ? '—' : 'S/ ' + Number(n).toLocaleString('es-PE', {minimumFractionDigits:0, maximumFractionDigits:0});

  const totPres = partidas.reduce((s,p) => s + Number(p.monto_presupuestado||0), 0);
  const totReal = partidas.reduce((s,p) => s + calcReal(p.categoria), 0);
  const varNeta = totReal - totPres;
  const execPct = totPres > 0 ? Math.round(totReal/totPres*100) : 0;
  const alertas = partidas.filter(p => calcReal(p.categoria) > Number(p.monto_presupuestado||0));

  const siguienteApr = cadena.find(a => a.estado === 'pendiente');
  const puedoAprobar = siguienteApr && siguienteApr.aprobador_id === authUser?.id;

  const usuariosEmpresa = (usuarios||[]).filter(u => u.empresa_id === empresaId || !u.empresa_id);

  const guardarNuevo = async () => {
    if (!formPre.nombre.trim() || !formPre.periodo.trim() || formParts.length === 0) return;
    setSaving(true);
    try {
      const pre = await crearPresupuesto(formPre, formParts);
      setPreSelId(pre.id);
      setPanelNuevo(false);
    } finally { setSaving(false); }
  };

  const handleEnviar = async () => {
    const aprs = aprobadores.filter(Boolean);
    if (!aprs.length || !presActivo) return;
    setSaving(true);
    try {
      await enviarPresupuestoAAprobacion(presActivo.id, aprs);
      setPanelEnviar(false);
      setAprobadores([null]);
    } finally { setSaving(false); }
  };

  const handleProcesar = async (aprId, accion) => {
    if (!presActivo) return;
    await procesarAprobacionPresupuesto(presActivo.id, aprId, accion, comentarioApr);
    setComentarioApr('');
  };


  return (
    <>
      {/* ── Cabecera ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Presupuesto vs Real</h1>
          <div className="page-sub">Control presupuestal mensual · {periodoLabel}</div>
        </div>
        <div className="row" style={{gap:8, flexWrap:'wrap'}}>
          <select className="select" style={{width:150}} value={periodo} onChange={e => { setPeriodo(e.target.value); setPreSelId(null); }}>
            {periodoOpts.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          {presDePeriodo.length > 0 && (
            <select className="select" style={{width:200}} value={presActivo?.id||''} onChange={e => setPreSelId(e.target.value||null)}>
              {presDePeriodo.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
          {presActivo?.estado === 'borrador' && (
            <button className="btn btn-secondary" data-local-form="true" onClick={() => setPanelEnviar(true)}>Enviar a aprobación</button>
          )}
          <button className="btn btn-primary" data-local-form="true" onClick={() => { setFormPre({nombre:'',periodo,centro_costo_id:'',cebe_id:''}); setFormParts([{categoria:'Materiales',descripcion:'',monto_presupuestado:''}]); setPanelNuevo(true); }}>
            {I.plus} Nuevo presupuesto
          </button>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Presupuesto total</div><div className="kpi-value" style={{fontSize:20}}>{S(totPres)}</div><div className="kpi-icon cyan">{I.trend}</div></div>
        <div className="kpi-card"><div className="kpi-label">Ejecutado</div><div className="kpi-value" style={{fontSize:20, color:varNeta>0?'var(--danger)':'var(--green)'}}>{S(totReal)}</div><div className={'kpi-icon '+(varNeta>0?'red':'green')}>{I.dollar}</div></div>
        <div className="kpi-card"><div className="kpi-label">Variación neta</div><div className="kpi-value" style={{fontSize:20, color:varNeta>0?'var(--danger)':'var(--green)'}}>{varNeta>0?'+':''}{S(varNeta)}</div><div className={'kpi-icon '+(varNeta>0?'orange':'green')}>{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">Ejecución global</div><div className="kpi-value" style={{fontSize:20, color:execPct>100?'var(--danger)':execPct>80?'var(--orange)':'inherit'}}>{execPct}%</div><div className="kpi-icon purple">{I.trend}</div></div>
      </div>

      {/* ── Sin presupuesto ───────────────────────────────────────────── */}
      {!presActivo && (
        <div className="card" style={{padding:'48px 24px', textAlign:'center', color:'var(--fg-muted)'}}>
          No hay presupuesto para {periodoLabel}. Usa "+ Nuevo presupuesto" para crear uno.
        </div>
      )}

      {presActivo && (
        <>
          {/* ── Alerta excedidos ──────────────────────────────────────── */}
          {alertas.length > 0 && (
            <div style={{padding:'12px 16px', background:'rgba(220,38,38,0.08)', border:'1px solid var(--danger)', borderRadius:10, marginBottom:16}} className="row">
              <span style={{display:'flex',alignItems:'center',flexShrink:0,width:18,height:18,color:'var(--danger)'}}>{I.alert}</span>
              <div><strong>{alertas.length} partida{alertas.length>1?'s':''} excedida{alertas.length>1?'s':''} del presupuesto</strong>: {alertas.map(a=>a.categoria).join(', ')}</div>
            </div>
          )}

          {/* ── Tabs ─────────────────────────────────────────────────── */}
          <div className="tabs">
            <div className={'tab '+(tab==='control'?'active':'')} onClick={()=>setTab('control')}>Control de Gastos</div>
            <div className={'tab '+(tab==='aprobacion'?'active':'')} onClick={()=>setTab('aprobacion')}>Flujo de Aprobación</div>
          </div>

          {/* ── Control de Gastos ─────────────────────────────────────── */}
          {tab === 'control' && (
            <div className="card">
              <div className="card-head">
                <h3>Partidas presupuestales — {periodoLabel}</h3>
                <div className="row" style={{gap:8}}>
                  <span className={`badge ${BADGE_E[presActivo.estado]?.cls||''}`}>{BADGE_E[presActivo.estado]?.label||presActivo.estado}</span>
                  <span className="text-muted" style={{fontSize:12}}>{partidas.length} partidas</span>
                </div>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Partida</th><th>Descripción</th><th className="num">Presupuesto</th><th className="num">Real</th><th className="num">Variación</th><th style={{width:160}}>Ejecución</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {partidas.length === 0 && (
                      <tr><td colSpan={7} style={{textAlign:'center',color:'var(--fg-muted)',padding:24}}>Sin partidas registradas.</td></tr>
                    )}
                    {partidas.map((p, i) => {
                      const real = calcReal(p.categoria);
                      const pres = Number(p.monto_presupuestado||0);
                      const varAbs = real - pres;
                      const ep = pres > 0 ? Math.round(real/pres*100) : 0;
                      const over = real > pres;
                      const limit = ep > 80 && !over;
                      const barColor = over ? 'var(--danger)' : limit ? 'var(--orange)' : 'var(--green)';
                      return (
                        <tr key={p.id} style={{cursor:'pointer'}} onClick={() => setPanelDetalle(p)}>
                          <td style={{fontWeight:600}}>{p.categoria}</td>
                          <td style={{color:'var(--fg-muted)',fontSize:12}}>{p.descripcion||'—'}</td>
                          <td className="num text-muted">{S(pres)}</td>
                          <td className="num"><strong style={{color:over?'var(--danger)':'inherit'}}>{S(real)}</strong></td>
                          <td className="num"><span style={{color:varAbs>0?'var(--danger)':'var(--green)',fontWeight:600}}>{varAbs>0?'+':''}{S(varAbs)}</span></td>
                          <td>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <div style={{flex:1,height:7,background:'var(--bg-subtle)',borderRadius:4}}>
                                <div style={{width:Math.min(ep,100)+'%',height:'100%',background:barColor,borderRadius:4}}/>
                              </div>
                              <span style={{fontSize:12,fontWeight:700,minWidth:36,color:barColor}}>{ep}%</span>
                            </div>
                          </td>
                          <td><span className={'badge '+(over?'badge-red':limit?'badge-orange':'badge-green')}>{over?'Excedido':limit?'En límite':'OK'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {partidas.length > 0 && (
                <div style={{padding:'14px 20px',borderTop:'1px solid var(--border-subtle)',display:'flex',gap:32,justifyContent:'flex-end',fontSize:13}}>
                  <span className="text-muted">Total presupuesto: <strong style={{color:'var(--fg)'}}>{S(totPres)}</strong></span>
                  <span className="text-muted">Total ejecutado: <strong style={{color:varNeta>0?'var(--danger)':'var(--green)'}}>{S(totReal)}</strong></span>
                  <span className="text-muted">Variación: <strong style={{color:varNeta>0?'var(--danger)':'var(--green)'}}>{varNeta>0?'+':''}{S(varNeta)}</strong></span>
                </div>
              )}
            </div>
          )}

          {/* ── Flujo de Aprobación ───────────────────────────────────── */}
          {tab === 'aprobacion' && (
            <div className="card">
              <div className="card-head">
                <h3>Cadena de aprobación</h3>
                {cadena.length > 0 && (
                  <span className="badge badge-cyan">{cadena.filter(a=>a.estado==='aprobado').length} de {cadena.length} aprobados</span>
                )}
              </div>
              {cadena.length === 0 ? (
                <div style={{padding:'32px 24px',textAlign:'center',color:'var(--fg-muted)'}}>
                  Sin cadena configurada.
                  {presActivo.estado === 'borrador' && (
                    <div style={{marginTop:12}}><button className="btn btn-secondary" onClick={()=>setPanelEnviar(true)}>Enviar a aprobación</button></div>
                  )}
                </div>
              ) : (
                <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:0}}>
                  {cadena.map((a, i) => {
                    const aprobado = a.estado === 'aprobado';
                    const rechazado = a.estado === 'rechazado';
                    const esActual = siguienteApr?.id === a.id;
                    return (
                      <div key={a.id} style={{display:'flex',gap:20,position:'relative'}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                          <div style={{width:36,height:36,borderRadius:'50%',background:aprobado?'var(--green)':rechazado?'var(--danger)':esActual?'var(--accent)':'var(--bg-subtle)',border:'2px solid '+(aprobado?'var(--green)':rechazado?'var(--danger)':esActual?'var(--accent)':'var(--border)'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,color:aprobado||rechazado||esActual?'#fff':'var(--fg-muted)'}}>
                            {aprobado?'✓':rechazado?'✗':a.orden}
                          </div>
                          {i < cadena.length-1 && <div style={{width:2,flex:1,minHeight:32,background:aprobado?'var(--green)':'var(--border)',margin:'4px 0'}}/>}
                        </div>
                        <div style={{paddingBottom:28,flex:1}}>
                          <div style={{fontWeight:600,fontSize:14}}>{a.nombre_aprobador}</div>
                          <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:2}}>
                            {aprobado ? `Aprobado ${a.fecha_accion?new Date(a.fecha_accion).toLocaleDateString('es-PE'):''}` : rechazado ? `Rechazado ${a.fecha_accion?new Date(a.fecha_accion).toLocaleDateString('es-PE'):''}` : esActual ? 'Pendiente — turno actual' : 'Pendiente'}
                          </div>
                          {a.comentario && <div style={{fontSize:12,marginTop:6,padding:'8px 12px',background:'var(--bg-subtle)',borderRadius:6,color:'var(--fg-subtle)',borderLeft:'3px solid '+(aprobado?'var(--green)':'var(--border)')}}>{a.comentario}</div>}
                          {puedoAprobar && esActual && (
                            <div style={{marginTop:10,display:'flex',gap:8,flexWrap:'wrap'}}>
                              <input className="input" style={{flex:1,minWidth:160,fontSize:12}} placeholder="Comentario (opcional)" value={comentarioApr} onChange={e=>setComentarioApr(e.target.value)}/>
                              <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>handleProcesar(a.id,'aprobar')}>Aprobar</button>
                              <button className="btn btn-danger" style={{fontSize:12}} onClick={()=>handleProcesar(a.id,'rechazar')}>Rechazar</button>
                            </div>
                          )}
                        </div>
                        <div style={{paddingTop:8}}>
                          <span className={'badge '+(aprobado?'badge-green':rechazado?'badge-red':esActual?'badge-orange':'badge-cyan')}>{aprobado?'Aprobado':rechazado?'Rechazado':esActual?'En revisión':'Pendiente'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Panel: Nuevo presupuesto ──────────────────────────────────── */}
      {panelNuevo && (
        <>
          <div className="side-panel-backdrop" onClick={()=>setPanelNuevo(false)}/>
          <div className="side-panel" style={{width:'min(520px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Nuevo presupuesto</div>
                <div className="font-display" style={{fontSize:18,fontWeight:700}}>{formPre.periodo||'—'}</div>
              </div>
              <button className="icon-btn" onClick={()=>setPanelNuevo(false)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="grid-2" style={{gap:12}}>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Nombre del presupuesto <span style={{color:'var(--danger)'}}>*</span></label>
                  <input className="input" value={formPre.nombre} onChange={e=>setFormPre(p=>({...p,nombre:e.target.value}))} placeholder="Ej. Presupuesto Operativo Mayo 2026" autoFocus/>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Período <span style={{color:'var(--fg-muted)',fontWeight:400}}>(YYYY-MM mensual · YYYY anual)</span></label>
                  <input className="input" value={formPre.periodo} onChange={e=>setFormPre(p=>({...p,periodo:e.target.value}))} placeholder="2026-05"/>
                </div>
                <div className="input-group">
                  <label>CECO <span style={{color:'var(--fg-muted)',fontWeight:400}}>(opcional)</span></label>
                  <select className="select" value={formPre.centro_costo_id} onChange={e=>setFormPre(p=>({...p,centro_costo_id:e.target.value}))}>
                    <option value="">— Todos —</option>
                    {(centrosCosto||[]).filter(c=>c.empresa_id===empresaId).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>CEBE <span style={{color:'var(--fg-muted)',fontWeight:400}}>(opcional)</span></label>
                  <select className="select" value={formPre.cebe_id} onChange={e=>setFormPre(p=>({...p,cebe_id:e.target.value}))}>
                    <option value="">— Todos —</option>
                    {(centrosBeneficio||[]).filter(c=>c.empresa_id===empresaId).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{marginTop:20,marginBottom:8,fontWeight:600,fontSize:13}}>Partidas presupuestales</div>
              <div className="card" style={{padding:0,overflow:'hidden',marginBottom:12}}>
                <table className="tbl" style={{fontSize:13}}>
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th>Descripción</th>
                      <th className="num">Monto S/</th>
                      <th style={{width:32}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formParts.map((fp,i) => (
                      <tr key={i}>
                        <td style={{padding:'6px 8px'}}>
                          <select className="select" value={fp.categoria} onChange={e=>setFormParts(prev=>prev.map((x,j)=>j===i?{...x,categoria:e.target.value}:x))}>
                            {CATS_PRE.map(c=><option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <input className="input" value={fp.descripcion} placeholder="Descripción" onChange={e=>setFormParts(prev=>prev.map((x,j)=>j===i?{...x,descripcion:e.target.value}:x))}/>
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <input className="input num" type="number" min="0" step="0.01" value={fp.monto_presupuestado} placeholder="0.00" onChange={e=>setFormParts(prev=>prev.map((x,j)=>j===i?{...x,monto_presupuestado:e.target.value}:x))}/>
                        </td>
                        <td style={{textAlign:'center',padding:'6px 4px'}}>
                          <button className="icon-btn" style={{width:24,height:24}} onClick={()=>setFormParts(prev=>prev.filter((_,j)=>j!==i))}>{I.x}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-secondary" style={{width:'100%',marginBottom:20}} onClick={()=>setFormParts(prev=>[...prev,{categoria:'Materiales',descripcion:'',monto_presupuestado:''}])}>
                {I.plus} Agregar partida
              </button>

              <div className="row mt-6" style={{justifyContent:'flex-end',gap:10}}>
                <button className="btn btn-secondary" onClick={()=>setPanelNuevo(false)}>Cancelar</button>
                <button className="btn btn-primary" disabled={saving||!formPre.nombre.trim()||formParts.length===0} onClick={guardarNuevo}>
                  {saving ? 'Guardando…' : `${I.check} Guardar presupuesto`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Panel: Detalle de partida ─────────────────────────────────── */}
      {panelDetalle && (
        <>
          <div className="side-panel-backdrop" onClick={()=>setPanelDetalle(null)}/>
          <div className="side-panel" style={{width:'min(600px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Detalle de partida</div>
                <div className="font-display" style={{fontSize:18,fontWeight:700}}>{panelDetalle.categoria}</div>
                {panelDetalle.descripcion && <div style={{fontSize:13,color:'var(--fg-muted)',marginTop:2}}>{panelDetalle.descripcion}</div>}
              </div>
              <button className="icon-btn" onClick={()=>setPanelDetalle(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="grid-2" style={{gap:12,marginBottom:20}}>
                <div className="card" style={{padding:'12px 16px'}}>
                  <div className="eyebrow" style={{marginBottom:6}}>Presupuestado</div>
                  <div style={{fontSize:22,fontWeight:700}}>{S(panelDetalle.monto_presupuestado)}</div>
                </div>
                <div className="card" style={{padding:'12px 16px'}}>
                  <div className="eyebrow" style={{marginBottom:6}}>Real ejecutado</div>
                  {(()=>{ const r=calcReal(panelDetalle.categoria); return <div style={{fontSize:22,fontWeight:700,color:r>Number(panelDetalle.monto_presupuestado)?'var(--danger)':'var(--green)'}}>{S(r)}</div>; })()}
                </div>
              </div>

              <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Registros que componen el Real</div>
              {(()=>{
                const items = getDesglose(panelDetalle.categoria);
                if (!items.length) return (
                  <div className="card" style={{padding:'24px',textAlign:'center',color:'var(--fg-muted)',fontSize:13}}>
                    Sin registros de {panelDetalle.categoria} para este período.
                  </div>
                );
                return (
                  <div className="card" style={{padding:0,overflow:'hidden'}}>
                    <table className="tbl">
                      <thead><tr><th>Fecha</th><th>Descripción</th><th>Proveedor/Técnico</th><th className="num">Monto</th><th>Documento</th></tr></thead>
                      <tbody>
                        {items.map((g,i) => (
                          <tr key={i}>
                            <td className="text-muted" style={{whiteSpace:'nowrap'}}>{g.fecha}</td>
                            <td>{g.descripcion}</td>
                            <td className="text-muted">{g.proveedor}</td>
                            <td className="num"><strong>{S(g.monto)}</strong></td>
                            <td className="text-muted">{g.documento}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── Panel: Enviar a aprobación ────────────────────────────────── */}
      {panelEnviar && (
        <>
          <div className="side-panel-backdrop" onClick={()=>setPanelEnviar(false)}/>
          <div className="side-panel" style={{width:'min(440px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Enviar a aprobación</div>
                <div className="font-display" style={{fontSize:18,fontWeight:700}}>{presActivo?.nombre}</div>
              </div>
              <button className="icon-btn" onClick={()=>setPanelEnviar(false)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="card" style={{padding:'12px 14px',marginBottom:16,fontSize:13,color:'var(--fg-muted)'}}>
                La cadena es secuencial: cada aprobador solo puede actuar después del anterior. Puedes configurar hasta 4 firmantes.
              </div>
              {aprobadores.map((apr,i) => (
                <div key={i} className="input-group" style={{marginBottom:10}}>
                  <label>Aprobador {i+1}</label>
                  <div className="row" style={{gap:8}}>
                    <select className="select" style={{flex:1}} value={apr?.id||''} onChange={e=>{ const u=usuariosEmpresa.find(u=>u.id===e.target.value); setAprobadores(prev=>prev.map((a,j)=>j===i?(u||null):a)); }}>
                      <option value="">— Seleccionar usuario —</option>
                      {usuariosEmpresa.map(u=><option key={u.id} value={u.id}>{u.nombre||u.email}</option>)}
                    </select>
                    {aprobadores.length>1 && (
                      <button className="icon-btn" onClick={()=>setAprobadores(prev=>prev.filter((_,j)=>j!==i))}>{I.x}</button>
                    )}
                  </div>
                </div>
              ))}
              {aprobadores.length < 4 && (
                <button className="btn btn-secondary" style={{marginBottom:20}} onClick={()=>setAprobadores(prev=>[...prev,null])}>
                  {I.plus} Agregar aprobador
                </button>
              )}
              <div className="row mt-6" style={{justifyContent:'flex-end',gap:10}}>
                <button className="btn btn-secondary" onClick={()=>setPanelEnviar(false)}>Cancelar</button>
                <button className="btn btn-primary" disabled={saving||aprobadores.filter(Boolean).length===0} onClick={handleEnviar}>
                  {saving ? 'Enviando…' : 'Enviar a aprobación'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export { CxC, Tesoreria, Resultados, Facturacion, Ventas, CajaChica, PrestamosPersonal, CxP, ActivosFijos, Presupuestos };

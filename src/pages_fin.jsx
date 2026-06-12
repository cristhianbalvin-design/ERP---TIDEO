import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { isSupabaseMode } from './lib/dataMode.js';
import { ER_CURRENCIES, buildEstadoResultados, getEstadoResultados, cargarConfiguracionER } from './services/estadoResultadosService.js';
import {
  buildTesoreriaSummary,
  calcularMovimientosMesPorMoneda,
  calcularMovimientosSinCuentaPorMoneda,
  calcularSaldosCuentasBancarias,
  calcularTotalesPorMonedaCuentas,
  claveEquivalenciaMovimientoCuenta,
  monedasDifierenMovimientoCuenta,
  montoMovimientoEnCuenta,
} from './services/tesoreriaService.js';
import { getTipoCambioPorFecha, convertirMonto as convertirMontoConTc } from './services/tipoCambioService.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import {
  CONDICION_PAGO_DEFECTO_CXC,
  calcularFechaVencimientoCxC,
  finanzasService,
  resolverCondicionPagoCxC,
} from './services/finanzasService.js';
import { cajaChicaService } from './services/cajaChicaService.js';
import { rrhhService } from './services/rrhhService.js';
import * as storageService from './services/storageService.js';
import { NuevoEgreso } from './components/NuevoEgreso.jsx';
import * as XLSX from 'xlsx';

// Finanzas: CxC, Tesorería/Match, Estado de Resultados, Facturación
const symOf = m => m === 'USD' ? 'US$' : 'S/';
const moneyCurrency = (value, moneda = 'PEN') => money(value, symOf(moneda));
const moneyDCurrency = (value, moneda = 'PEN') => moneyD(value, symOf(moneda));
const normText = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Futuro: mover este umbral a Parametros Generales.
const RHE_DESVIACION_UMBRAL = 0.20;
const RHE_MESES = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const periodoRhePrevio = todayStr => {
  const base = new Date(`${todayStr}T00:00:00`);
  base.setMonth(base.getMonth() - 1);
  const mes = String(base.getMonth() + 1);
  const anio = String(base.getFullYear());
  return { inicioMes: mes, inicioAnio: anio, finMes: mes, finAnio: anio };
};

const rangoFechasRhe = periodo => {
  const inicioMes = Number(periodo?.inicioMes);
  const inicioAnio = Number(periodo?.inicioAnio);
  const finMes = Number(periodo?.finMes);
  const finAnio = Number(periodo?.finAnio);
  if (!inicioMes || !inicioAnio || !finMes || !finAnio) return { inicio: '', fin: '', valido: false };
  const inicioDate = new Date(inicioAnio, inicioMes - 1, 1);
  const finDate = new Date(finAnio, finMes, 0);
  const valido = inicioDate <= finDate;
  return {
    inicio: inicioDate.toISOString().split('T')[0],
    fin: finDate.toISOString().split('T')[0],
    valido,
  };
};

const tarifaHoraColaborador = p => Number(p?.tarifa_hora ?? p?.costo_hora_real ?? p?.costo ?? p?.costo_hora ?? 0) || 0;

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
  const totalDe   = c => Number(c?.monto_total ?? c?.total ?? 0);
  const pagadoDe  = c => Number(c?.monto_pagado ?? c?.pagado ?? 0);
  const retencionDe = c => Number(c?.monto_retencion || 0);
  const estadoNormalizadoCxC = c => String(c?.estado || '').trim().toLowerCase();
  const estadoTerminalCxC = c => ['cobrada','pagada','anulada','cancelada'].includes(estadoNormalizadoCxC(c));
  const montoNetoCobrableDe = c => {
    const netoSnapshot = Number(c?.monto_neto_cobrable || c?.facturas?.monto_neto_cobrable || 0);
    if (netoSnapshot > 0) return netoSnapshot;
    return Math.max(0, totalDe(c) - retencionDe(c));
  };
  const saldoDe = c => {
    if (estadoTerminalCxC(c)) return 0;
    const saldoNormalizado = c?.saldo_neto_cobranza;
    if (saldoNormalizado != null) return Math.max(0, Number(saldoNormalizado || 0));
    const netoSnapshot = Number(c?.monto_neto_cobrable || c?.facturas?.monto_neto_cobrable || 0);
    if (netoSnapshot > 0) return Math.max(0, netoSnapshot - pagadoDe(c));
    if (c?.saldo != null) return Math.max(0, Number(c.saldo || 0) - retencionDe(c));
    return Math.max(0, montoNetoCobrableDe(c) - pagadoDe(c));
  };
  const clienteDe = c => c?.cliente || c?.cuentas?.razon_social || (cuentas||[]).find(x=>x.id===c?.cuenta_id)?.razon_social || '-';
  const facturaNumeroDe = c => c?.facturas?.numero || c?.factura || (facturas||[]).find(f=>f.id===c?.factura_id)?.numero || '-';
  const osNumeroDe = c => c?.os_clientes?.numero || (osClientes||[]).find(o=>o.id===c?.os_cliente_id)?.numero || '-';

  const diasMoraDe = c => {
    if (saldoDe(c) <= 0 || estadoTerminalCxC(c)) return 0;
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
    const estadoOriginal = estadoNormalizadoCxC(c);
    if (['anulada','cancelada'].includes(estadoOriginal)) return estadoOriginal;
    const saldo = saldoDe(c);
    const montoNeto = montoNetoCobrableDe(c);
    if (montoNeto > 0 && pagadoDe(c) >= montoNeto) return 'cobrada';
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
    cancelada:       { label: 'Cancelada',     cls: 'badge-gray'   },
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
  const [fPeriodoEmision, setFPeriodoEmision] = useState('');

  const [panelCobro, setPanelCobro] = useState(false);
  const [cobroSel, setCobroSel] = useState(null);
  const [formCobro, setFormCobro] = useState({ monto:'', incluye_mora:false, monto_mora:'', fecha_cobro:today, medio_pago:'', cuenta_bancaria:'', numero_operacion:'', notas:'' });
  const [montoError, setMontoError] = useState('');
  const [savingCobro, setSavingCobro] = useState(false);
  const cuentasBancariasActivas = (cuentasBancarias||[]).filter(cb=>cb.estado!=='inactivo'&&cb.estado!=='eliminado');

  const [panelGestion, setPanelGestion] = useState(false);
  const [gestionSel, setGestionSel] = useState(null);
  const [formGestion, setFormGestion] = useState({ tipo_gestion:'', resultado:'', fecha_proxima_accion:'', fecha_acordada_pago:'', notas:'' });
  const [editVencimiento, setEditVencimiento] = useState(null);
  const [savingVencimiento, setSavingVencimiento] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(null); // CxC a anular
  const [savingCondonar, setSavingCondonar] = useState(false);

  // ── KPIs ──────────────────────────────────────────────────────────────
  const MONEDAS_CXC = [
    { moneda: 'PEN', titulo: 'Soles (PEN)' },
    { moneda: 'USD', titulo: 'Dolares (USD)' },
  ];
  const AGING_BUCKETS_CXC = [
    { key:'0-30',  label:'0-30 dias',  min:0,  max:30,  color:'green'  },
    { key:'31-60', label:'31-60 dias', min:31, max:60,  color:'orange' },
    { key:'61-90', label:'61-90 dias', min:61, max:90,  color:'orange' },
    { key:'+90',   label:'+90 dias',   min:91, max:null, color:'danger' },
  ];
  const monedaCxCDe = c => (c?.moneda || c?.facturas?.moneda || 'PEN') === 'USD' ? 'USD' : 'PEN';
  const cxcActivas = useMemo(() => (cxc||[]).filter(c => !estadoTerminalCxC(c) && saldoDe(c) > 0), [cxc]);
  const totalPorCobrarPEN = useMemo(() => cxcActivas.filter(c => monedaCxCDe(c) === 'PEN').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas]);
  const totalPorCobrarUSD = useMemo(() => cxcActivas.filter(c => monedaCxCDe(c) === 'USD').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas]);
  const totalVencidoPEN   = useMemo(() => cxcActivas.filter(c => diasMoraDe(c) > 0 && monedaCxCDe(c) === 'PEN').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas, today]);
  const totalVencidoUSD   = useMemo(() => cxcActivas.filter(c => diasMoraDe(c) > 0 && monedaCxCDe(c) === 'USD').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas, today]);
  const totalEnGestionPEN = useMemo(() => cxcActivas.filter(c => estadoDe(c) === 'en_gestion' && monedaCxCDe(c) === 'PEN').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas, gestionesCobranza, today]);
  const totalEnGestionUSD = useMemo(() => cxcActivas.filter(c => estadoDe(c) === 'en_gestion' && monedaCxCDe(c) === 'USD').reduce((s,c) => s + saldoDe(c), 0), [cxcActivas, gestionesCobranza, today]);
  const cxcPendientesAging = useMemo(
    () => cxcActivas.filter(c => {
      if (fPeriodoEmision && (c.fecha_emision || '').slice(0, 7) !== fPeriodoEmision) return false;
      return saldoDe(c) > 0 && !['cobrada','pagada','anulada','cancelada'].includes(estadoDe(c));
    }),
    [cxcActivas, gestionesCobranza, today, fPeriodoEmision],
  );

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
  const agingPorMoneda = useMemo(() => MONEDAS_CXC.reduce((acc, meta) => {
    acc[meta.moneda] = AGING_BUCKETS_CXC.map(b => {
      const items = cxcPendientesAging.filter(c => {
        const d = diasMoraDe(c);
        return monedaCxCDe(c) === meta.moneda && d >= b.min && (b.max == null || d <= b.max);
      });
      return {
        ...b,
        monto: items.reduce((s,c) => s + saldoDe(c), 0),
        count: items.length,
      };
    });
    return acc;
  }, {}), [cxcPendientesAging, today]);

  const cxcFiltrada = useMemo(() => {
    let rows = cxc || [];
    if (agingFilter) {
      const b = AGING_BUCKETS_CXC.find(a => a.key === agingFilter);
      if (b) rows = cxcActivas.filter(c => { const d = diasMoraDe(c); return saldoDe(c) > 0 && !['cobrada','pagada','anulada','cancelada'].includes(estadoDe(c)) && d >= b.min && (b.max == null || d <= b.max); });
    }
    if (fCliente)    rows = rows.filter(c => clienteDe(c).toLowerCase().includes(fCliente.toLowerCase()));
    if (fEstado)     rows = rows.filter(c => estadoDe(c) === fEstado);
    if (fMoneda)     rows = rows.filter(c => monedaCxCDe(c) === fMoneda);
    if (fVenceDesde) rows = rows.filter(c => (c.fecha_vencimiento||c.vence||'') >= fVenceDesde);
    if (fVenceHasta) rows = rows.filter(c => (c.fecha_vencimiento||c.vence||'') <= fVenceHasta);
    if (fMoraDesde)  rows = rows.filter(c => diasMoraDe(c) >= Number(fMoraDesde));
    if (fMoraHasta)       rows = rows.filter(c => diasMoraDe(c) <= Number(fMoraHasta));
    if (fGestor)          rows = rows.filter(c => (c.gestor_cobranza_id || '') === fGestor);
    if (fPeriodoEmision)  rows = rows.filter(c => (c.fecha_emision || '').slice(0, 7) === fPeriodoEmision);
    return rows;
  }, [cxc, cxcActivas, agingFilter, fCliente, fEstado, fMoneda, fVenceDesde, fVenceHasta, fMoraDesde, fMoraHasta, fGestor, fPeriodoEmision, today, gestionesCobranza]);

  const cobradoEsteMesPorMoneda = useMemo(() => {
    const mes = fPeriodoEmision || today.slice(0, 7);

    const cxcById = new Map((cxc || []).map(c => [c.id, c]));
    const vistos = new Set();
    const resultado = {};

    (cobrosHistorial || [])
      .filter(cb => (cb.fecha_cobro || cb.fecha || '').slice(0, 7) === mes)
      .forEach(cb => {
        const monto = Number(cb.monto_capital ?? cb.monto ?? cb.importe ?? cb.total ?? 0);
        if (monto <= 0) return;
        const dedupeKey = cb.id || [
          cb.cxc_id || cb.factura_id || 'sin-cxc',
          cb.fecha_cobro || cb.fecha || '',
          monto,
          cb.numero_operacion || cb.referencia || '',
        ].join('|');
        if (vistos.has(dedupeKey)) return;
        vistos.add(dedupeKey);
        const cxcRel = cxcById.get(cb.cxc_id);
        const moneda = String(cb.moneda || cxcRel?.moneda || cxcRel?.facturas?.moneda || 'PEN').trim().toUpperCase();
        resultado[moneda] = (resultado[moneda] || 0) + monto;
      });

    if (Object.keys(resultado).length) return resultado;

    const pagadoDeFallback = c => {
      const explicito = Number(c?.monto_pagado ?? c?.pagado ?? NaN);
      if (!isNaN(explicito) && explicito > 0) return explicito;
      return Math.max(0,
        Number(c?.monto_neto_cobrable || c?.monto_total || 0) -
        Number(c?.saldo_neto_cobranza ?? c?.saldo ?? 0)
      );
    };

    return (cxc || [])
      .filter(c => (c.fecha_cobro || c.fecha_pago || c.fecha_emision || '').slice(0, 7) === mes && pagadoDeFallback(c) > 0)
      .reduce((acc, c) => {
        const m = String(monedaCxCDe(c)).trim().toUpperCase();
        return { ...acc, [m]: (acc[m] || 0) + pagadoDeFallback(c) };
      }, {});
  }, [cobrosHistorial, cxc, fPeriodoEmision, today]);

  const seccionesMoneda = useMemo(() => MONEDAS_CXC.map(meta => {
    const rows = cxcFiltrada.filter(c => monedaCxCDe(c) === meta.moneda);
    const aging = fMoneda && fMoneda !== meta.moneda
      ? AGING_BUCKETS_CXC.map(b => ({ ...b, monto: 0, count: 0 }))
      : agingPorMoneda[meta.moneda] || [];
    return {
      ...meta,
      rows,
      aging,
      mostrarRetencion: rows.some(c => retencionDe(c) > 0),
      cobradoEsteMes: cobradoEsteMesPorMoneda[meta.moneda] || 0,
    };
  }), [cxcFiltrada, agingPorMoneda, fMoneda, cobradoEsteMesPorMoneda]);

  const hayFiltros = !!(agingFilter||fCliente||fEstado||fMoneda||fVenceDesde||fVenceHasta||fMoraDesde||fMoraHasta||fGestor||fPeriodoEmision);

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
    if (savingCobro) return;
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
    setSavingCobro(true);
    try {
      await registrarCobroCxC(cobroSel.id, monto, formCobro);
      setPanelCobro(false);
      setCobroSel(null);
    } finally {
      setSavingCobro(false);
    }
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
                      ['Neto a cobrar', moneyCurrency(montoNetoCobrableDe(c), c.moneda), 'var(--cyan)'],
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
  const periodoOptsEmision = (() => {
    const opts = [];
    const d = new Date(`${today}T00:00:00`);
    for (let i = 0; i < 12; i++) {
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const l = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
      opts.push({ v, l: l.charAt(0).toUpperCase() + l.slice(1) });
      d.setMonth(d.getMonth() - 1);
    }
    return opts;
  })();
  const labelCobradoMes = fPeriodoEmision
    ? `Cobrado en ${periodoOptsEmision.find(o => o.v === fPeriodoEmision)?.l || fPeriodoEmision}`
    : 'Cobrado este mes';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas por Cobrar</h1>
          <div className="page-sub" style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
            <span>Total por cobrar: <strong>{money(totalPorCobrarPEN)}</strong>{totalPorCobrarUSD > 0 && <> · <strong>{money(totalPorCobrarUSD, 'US$')}</strong></>}</span>
            {(totalVencidoPEN > 0 || totalVencidoUSD > 0) && (
              <span style={{color:'var(--danger)',fontWeight:600}}>
                · Vencido:{totalVencidoPEN > 0 && <> {money(totalVencidoPEN)}</>}{totalVencidoUSD > 0 && <> · {money(totalVencidoUSD, 'US$')}</>}
              </span>
            )}
            {(totalEnGestionPEN > 0 || totalEnGestionUSD > 0) && (
              <span style={{color:'var(--orange)',fontWeight:600}}>
                · En gestión:{totalEnGestionPEN > 0 && <> {money(totalEnGestionPEN)}</>}{totalEnGestionUSD > 0 && <> · {money(totalEnGestionUSD, 'US$')}</>}
              </span>
            )}
          </div>
        </div>
        <div className="row" style={{gap:8,alignItems:'center'}}>
          <select className="select" style={{fontSize:12,padding:'4px 8px'}} value={fPeriodoEmision} onChange={e=>setFPeriodoEmision(e.target.value)}>
            <option value="">Todos los períodos</option>
            {periodoOptsEmision.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={()=>setShowFiltros(v=>!v)}>
            {I.filter} Filtros{hayFiltros?' ·':''}
          </button>
          <button className="btn btn-secondary" onClick={exportarCSV}>{I.download} Exportar</button>
        </div>
      </div>

      {/* Aging — clickable */}
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
            <button className="btn btn-secondary" onClick={()=>{setFCliente('');setFEstado('');setFMoneda('');setFVenceDesde('');setFVenceHasta('');setFMoraDesde('');setFMoraHasta('');setFGestor('');setFPeriodoEmision('');setAgingFilter(null);}}>Limpiar</button>
          </div>
        </div>
      )}

      {seccionesMoneda.map(sec => {
        if (sec.rows.length === 0) return null;
        return (
        <React.Fragment key={sec.moneda}>
          <div style={{marginTop:18,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <div>
              <div className="eyebrow">CxC {sec.moneda}</div>
              <h2 style={{fontSize:18,margin:0,fontWeight:700}}>{sec.titulo}</h2>
            </div>
            <div style={{fontSize:12,color:'var(--fg-muted)'}}>{sec.rows.length} {sec.rows.length===1?'registro':'registros'}</div>
          </div>

          <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)',marginTop:12}}>
            {sec.aging.map(b=>(
              <div key={`${sec.moneda}-${b.key}`} className="kpi-card" style={{cursor:'pointer',outline:agingFilter===b.key?'2px solid var(--cyan)':'none',transition:'outline 0.15s'}}
                onClick={()=>setAgingFilter(agingFilter===b.key?null:b.key)}>
                <div className="kpi-label" style={{ paddingRight: 40 }}>{b.label}</div>
                <div className="kpi-value" style={{fontSize:20, display:'flex', flexDirection:'column', gap:4, marginTop:12}}>
                  <span>{moneyCurrency(b.monto, sec.moneda)}</span>
                </div>
                <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:8}}>{b.count} {b.count===1?'factura':'facturas'}</div>
                <div className={'kpi-icon '+b.color}>{I.clock}</div>
              </div>
            ))}
            <div className="kpi-card">
              <div className="kpi-label">{labelCobradoMes}</div>
              <div className="kpi-value" style={{fontSize:20,color:'var(--green)'}}>{moneyCurrency(sec.cobradoEsteMes, sec.moneda)}</div>
              <div className="kpi-icon green">{I.check}</div>
            </div>
          </div>

          <div className="card mt-6">
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Cliente</th><th>Factura</th><th>OS Cliente</th><th>Vencimiento</th>
                    <th>Total</th><th>Saldo neto</th>{sec.mostrarRetencion && <th>Retencion SUNAT</th>}
                    <th>Medio pago esp.</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.length ? sec.rows.map(c=>{
                    const dias  = diasMoraDe(c);
                    const est   = estadoDe(c);
                    const meta  = ESTADO_META[est] || ESTADO_META.por_cobrar;
                    const vence = c.fecha_vencimiento||c.vence||'--';
                    const moneda = monedaCxCDe(c);
                    return (
                      <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>abrirFicha(c)}>
                        <td>
                          <strong>{clienteDe(c)}</strong>
                          {retencionDe(c)>0 && <span className="badge badge-orange" style={{marginLeft:6,fontSize:10}}>Retencion SUNAT</span>}
                        </td>
                        <td className="mono">{facturaNumeroDe(c)}</td>
                        <td className="text-muted">{osNumeroDe(c)}</td>
                        <td style={{color:dias>0?'var(--danger)':dias===0?'var(--orange)':'inherit',fontWeight:dias>0?600:400}}>{vence}</td>
                        <td className="num">{moneyCurrency(totalDe(c), moneda)}</td>
                        <td className="num"><strong>{moneyCurrency(saldoDe(c), moneda)}</strong></td>
                        {sec.mostrarRetencion && <td className="num">{retencionDe(c)>0 ? moneyCurrency(retencionDe(c), moneda) : <span className="text-subtle">--</span>}</td>}
                        <td style={{color:'var(--fg-muted)',fontSize:12}}>{c.medio_pago_esperado||<span className="text-subtle">--</span>}</td>
                        <td><span className={'badge '+meta.cls}>{meta.label}</span></td>
                        <td onClick={e=>e.stopPropagation()} style={{whiteSpace:'nowrap'}}>
                          {saldoDe(c)>0 && !estadoTerminalCxC(c) && <button className="btn btn-sm btn-primary" data-local-form="true" onClick={e=>abrirCobro(c,e)} style={{marginRight:6}}>Cobrar</button>}
                          {puedeEditarCxC && !estadoTerminalCxC(c) && (
                            <button className="icon-btn" title="Anular CxC" style={{color:'var(--danger)'}} onClick={e=>{e.stopPropagation();setConfirmAnular(c);}}>{I.trash}</button>
                          )}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={sec.mostrarRetencion ? 10 : 9} style={{textAlign:'center',padding:36,color:'var(--fg-muted)'}}>
                      {hayFiltros ? 'Sin resultados con los filtros aplicados.' : 'Sin facturas en esta moneda.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </React.Fragment>
        );
      })}

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
                <button type="submit" className="btn btn-primary" disabled={savingCobro}>{savingCobro ? 'Registrando...' : <>{I.check} Registrar cobro</>}</button>
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
                  <td className="num"><strong style={{color:m.tipo==='credito'?'var(--green)':'var(--fg)'}}>{m.tipo==='credito'?'+':'-'}{moneyCurrency(m.monto, m.moneda)}</strong></td>
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

function BarChartProyeccion({ semanas, saldoInicialPorMoneda = {} }) {
  const W = 700, H = 160, PX = 30, PY = 16;
  const iW = W - PX * 2, iH = H - PY * 2;
  const n = semanas.length;
  if (!n) return null;
  const cW = iW / n;
  const bW = Math.max(3, cW * 0.3);

  // Sumar todas las monedas para las barras (visual de magnitud por semana)
  const semanasNorm = semanas.map(s => ({
    ...s,
    ingresos: s.ingresosPorMoneda ? Object.values(s.ingresosPorMoneda).reduce((a, v) => a + v, 0) : (s.ingresos || 0),
    egresos:  s.egresosPorMoneda  ? Object.values(s.egresosPorMoneda).reduce((a, v) => a + v, 0)  : (s.egresos  || 0),
  }));
  const maxBar = Math.max(1, ...semanasNorm.flatMap(s => [s.ingresos, s.egresos]));
  const bScale = iH / maxBar;

  // Línea de saldo por moneda
  const COLORES = { PEN: 'var(--cyan)', USD: '#a855f7' };
  const monedas = Object.keys(saldoInicialPorMoneda).length ? Object.keys(saldoInicialPorMoneda) : ['PEN'];
  const lineas = monedas.map(mon => {
    let saldo = Number(saldoInicialPorMoneda[mon] || 0);
    const puntos = semanas.map(s => {
      saldo += ((s.ingresosPorMoneda || {})[mon] || 0) - ((s.egresosPorMoneda || {})[mon] || 0);
      return saldo;
    });
    return { mon, saldoIni: Number(saldoInicialPorMoneda[mon] || 0), puntos, color: COLORES[mon] || 'var(--cyan)' };
  });

  const allV = lineas.flatMap(l => [l.saldoIni, ...l.puntos]);
  const sMin = Math.min(...allV, 0);
  const sMax = Math.max(...allV, 1);
  const sRange = sMax - sMin || 1;
  const sY = v => PY + iH - ((v - sMin) / sRange) * iH;

  const legendaMonedas = lineas.map((l, idx) => `${l.mon} (${idx === 0 ? 'cyan' : 'morado'})`).join(' · ');

  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} style={{width:'100%', display:'block', marginTop:8}}>
      {[0,0.25,0.5,0.75,1].map(f => (
        <line key={f} x1={PX} y1={PY + iH*(1-f)} x2={W-PX} y2={PY + iH*(1-f)} stroke="var(--border)" strokeWidth={0.5}/>
      ))}
      {semanasNorm.map((s, i) => {
        const x = PX + i * cW;
        return (
          <g key={i}>
            <rect x={x + cW*0.1} y={PY + iH - s.ingresos*bScale} width={bW} height={Math.max(0, s.ingresos*bScale)} fill="rgba(0,200,100,0.65)" rx={2}/>
            <rect x={x + cW*0.1 + bW + 2} y={PY + iH - s.egresos*bScale} width={bW} height={Math.max(0, s.egresos*bScale)} fill="rgba(255,120,0,0.65)" rx={2}/>
            <text x={x + cW/2} y={H + 20} textAnchor="middle" fontSize={8} fill="var(--muted)">{s.label}</text>
          </g>
        );
      })}
      {lineas.map(({ mon, saldoIni, puntos, color }) => {
        const allPts = [
          { x: PX, y: sY(saldoIni), v: saldoIni },
          ...puntos.map((v, i) => ({ x: PX + (i + 0.5) * cW, y: sY(v), v })),
        ];
        return (
          <g key={mon}>
            {allPts.slice(0, -1).map((p1, k) => {
              const p2 = allPts[k + 1];
              const sc = p1.v < 0 || p2.v < 0 ? 'var(--danger)' : color;
              return <line key={k} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={sc} strokeWidth={2} strokeLinecap="round"/>;
            })}
            {allPts.slice(1).map(({ x, y, v }, i) => (
              <circle key={i} cx={x} cy={y} r={3} fill={v < 0 ? 'var(--danger)' : color}/>
            ))}
          </g>
        );
      })}
      <text x={PX} y={PY - 4} fontSize={8} fill="var(--muted)">▲ Saldo {legendaMonedas} · Ingresos (verde) · Egresos (naranja)</text>
    </svg>
  );
}

function ManualMovimientoPanel({ cuentasBancarias, onClose, onGuardar }) {
  const empty = { tipo: 'ingreso', fecha: new Date().toISOString().slice(0,10), descripcion: '', monto: '', categoria: '', cuenta_origen_id: '', cuenta_destino_id: '', moneda: '', referencia: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(p => ({...p, [k]: e.target.value}));
  const cuentasActivas = (cuentasBancarias || []).filter(c => c.estado === 'activo');
  const cuentaActiva = cuentasActivas.find(c =>
    c.id === (form.tipo === 'ingreso' ? form.cuenta_destino_id : form.cuenta_origen_id)
  );
  const monedaEfectiva = form.moneda || cuentaActiva?.moneda || '';
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
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
            <div className="input-group"><label>Fecha *</label><input className="input" type="date" value={form.fecha} onChange={set('fecha')} required/></div>
            <div className="input-group"><label>Monto *</label><input className="input" type="number" step="0.01" min="0.01" value={form.monto} onChange={set('monto')} required/></div>
            <div className="input-group"><label>Moneda *</label>
              <select className="input" value={monedaEfectiva} onChange={set('moneda')} required>
                <option value="">—</option>
                <option value="PEN">S/ Soles (PEN)</option>
                <option value="USD">US$ Dólares (USD)</option>
              </select>
            </div>
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
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : <>{I.plus} Registrar</>}</button>
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
  const cuentaBancariaFormVacio = { nombre:'', banco:'', numero_cuenta:'', cci:'', moneda:'PEN', tipo:'corriente', estado:'activo', saldo_inicial:'' };
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
  const [panelCuentaBancaria, setPanelCuentaBancaria] = useState(false);
  const [savingCuentaBancaria, setSavingCuentaBancaria] = useState(false);
  const [formCuentaBancaria, setFormCuentaBancaria] = useState(cuentaBancariaFormVacio);
  const [periodoTesoreria, setPeriodoTesoreria] = useState(new Date().toISOString().slice(0, 7));
  const [resumenCuenta, setResumenCuenta] = useState('');
  const [editandoCuentaMovId, setEditandoCuentaMovId] = useState(null);
  const [asignandoCuentaMovId, setAsignandoCuentaMovId] = useState(null);
  const [equivalenciasCuenta, setEquivalenciasCuenta] = useState({});
  const [editandoSaldoInicialId, setEditandoSaldoInicialId] = useState(null);
  const [saldoInicialDraft, setSaldoInicialDraft] = useState('');
  const [guardandoSaldoInicialId, setGuardandoSaldoInicialId] = useState(null);
  const [hoverCuentaSaldoId, setHoverCuentaSaldoId] = useState(null);
  const [resumenDesde, setResumenDesde] = useState(new Date().toISOString().slice(0,7) + '-01');
  const [resumenHasta, setResumenHasta] = useState(new Date().toISOString().slice(0,10));
  const {
    movimientosTesoreria, movimientosBanco, cxc, cxp, facturas, cuentas, cuentasBancarias = [],
    conciliarMovimientoBancoConDocumento, deshacerConciliacionBanco, asignarCuentaMovimientoTesoreria, empresa, addNotificacion, actualizarCuentaBancaria, crearCuentaBancaria,
    registrarMovimientoManual, empresaConfig, financiamientos = [], periodosNomina = [],
    tipoCambioHoy, convertirMonto,
  } = useApp();
  const empresaId = empresa?.id;
  const SIN_VINCULAR = '__sin_vincular';

  const hoy = new Date().toISOString().slice(0, 7);
  const cuentasActivas = useMemo(() => (cuentasBancarias || []).filter(c => c.estado === 'activo'), [cuentasBancarias]);
  const cuentaResumenActiva = useMemo(
    () => cuentasActivas.find(c => c.id === resumenCuenta) || null,
    [cuentasActivas, resumenCuenta],
  );
  const filtroSinVincularActivo = resumenCuenta === SIN_VINCULAR;
  const cuentasParaResumen = useMemo(
    () => cuentaResumenActiva ? [cuentaResumenActiva] : cuentasActivas,
    [cuentaResumenActiva, cuentasActivas],
  );

  const normalizeFinText = value => String(value || '').trim().toLowerCase();
  const monedaMov = (m, fallback = 'PEN') => String(m?.moneda || fallback || 'PEN').trim().toUpperCase();
  const fechaMov = m => m?.fecha || m?.fecha_movimiento || m?.fecha_operacion || m?.created_at || m?.creado_en || '';
  const esIngresoMov = m => ['ingreso', 'credito', 'crédito'].includes(normalizeFinText(m?.tipo));
  const esEgresoMov = m => ['egreso', 'debito', 'débito'].includes(normalizeFinText(m?.tipo));
  const movTieneCuentaExplicita = m => Boolean(m?.cuenta_bancaria_id);
  const movPerteneceCuenta = (m, cb) => {
    if (!cb) return true;
    return m?.cuenta_bancaria_id === cb.id;
  };
  const sumarMoneda = (rows, montoDe = r => r.monto, monedaDe = r => r.moneda || 'PEN') =>
    rows.reduce((acc, row) => {
      const moneda = String(monedaDe(row) || 'PEN').trim().toUpperCase();
      return { ...acc, [moneda]: (acc[moneda] || 0) + Number(montoDe(row) || 0) };
    }, {});
  const formatTotales = (totales, defaultCurrency = empresa?.moneda || 'PEN') => {
    const entries = Object.entries(totales || {}).filter(([, value]) => Math.abs(Number(value || 0)) > 0.009);
    if (!entries.length) return moneyCurrency(0, defaultCurrency);
    return entries.map(([moneda, value]) => moneyCurrency(value, moneda)).join(' - ');
  };
  const totalesEntries = (totales, defaultCurrency = empresa?.moneda || 'PEN') => {
    const entries = Object.entries(totales || {}).filter(([, value]) => Math.abs(Number(value || 0)) > 0.009);
    return entries.length ? entries : [[defaultCurrency, 0]];
  };

  const facturasPorId = useMemo(() => new Map((facturas || []).map(f => [f.id, f])), [facturas]);
  const cxcPorId = useMemo(() => new Map((cxc || []).map(row => [row.id, row])), [cxc]);
  const cxpPorId = useMemo(() => new Map((cxp || []).map(row => [row.id, row])), [cxp]);
  const categoriaMovimientoDe = m => {
    if (m.categoria) return catLabel(m.categoria);
    const vt = normalizeFinText(m.vinculo_tipo || m.vinculado_tipo || '');
    const vid = m.vinculo_id || m.vinculado_id;
    if (vt === 'cxc') return 'Cobranza';
    if (vt === 'cxp') {
      const row = vid ? cxpPorId.get(vid) : null;
      return row?.concepto || row?.descripcion || 'Cuenta por pagar';
    }
    if (vt === 'gasto') return 'Gasto';
    if (m.es_manual) return 'Manual';
    return '—';
  };
  const movimientoEsCobroFactura = m => {
    const vinculoTipo = normalizeFinText(m?.vinculo_tipo || m?.vinculado_tipo);
    return normalizeFinText(m?.tipo) === 'ingreso' && (vinculoTipo === 'cxc' || m?.cxc_id || m?.factura_id);
  };
  const descripcionCobroUsaIdInterno = descripcion => {
    const value = String(descripcion || '').trim();
    return !value || /^cobro\s+(fac_|cxc_|[0-9a-f]{6,})/i.test(value);
  };
  const movimientosTesoreriaVista = useMemo(() => {
    // Dedup de cobros con mismo cxc_id + monto + fecha (registro doble del mismo cobro)
    const cobrosVistos = new Set();
    return (movimientosTesoreria || []).reduce((acc, m) => {
      if (!movimientoEsCobroFactura(m)) { acc.push(m); return acc; }
      const vinculoTipo = normalizeFinText(m.vinculo_tipo || m.vinculado_tipo);
      const cxcId = m.cxc_id || (vinculoTipo === 'cxc' ? (m.vinculo_id || m.vinculado_id) : null);
      const facturaIdDirecto = m.factura_id || (vinculoTipo === 'factura' ? (m.vinculo_id || m.vinculado_id) : null);
      if (cxcId) {
        const dk = `${cxcId}|${m.monto}|${m.fecha || ''}`;
        if (cobrosVistos.has(dk)) return acc;
        cobrosVistos.add(dk);
      }
      const cxcOrigen = cxcPorId.get(cxcId) || null;
      const facturaOrigen = cxcOrigen?.facturas ||
        facturasPorId.get(cxcOrigen?.factura_id) ||
        facturasPorId.get(facturaIdDirecto) ||
        null;
      const numeroFactura = facturaOrigen?.numero || null;
      const monedaOrigen = cxcOrigen?.moneda || facturaOrigen?.moneda || m.moneda || 'PEN';
      acc.push({
        ...m,
        moneda: monedaOrigen,
        descripcion: descripcionCobroUsaIdInterno(m.descripcion) ? `Cobro ${numeroFactura || 'factura'}` : m.descripcion,
      });
      return acc;
    }, []);
  }, [movimientosTesoreria, cxcPorId, facturasPorId]);

  const movimientosEmpresa = useMemo(() => (movimientosTesoreriaVista || []).filter(m =>
    (!empresaId || m.empresa_id === empresaId) &&
    m.estado !== 'anulado'
  ), [movimientosTesoreriaVista, empresaId]);
  const fechaBanco = m => m?.fecha || m?.fecha_operacion || m?.created_at || m?.creado_en || '';
  const periodoOpcionesTesoreria = useMemo(() => {
    const opciones = new Map();
    const base = new Date(`${hoy}-01T00:00:00`);
    for (let i = 0; i < 36; i++) {
      const d = new Date(base);
      d.setMonth(base.getMonth() - i);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
      opciones.set(value, label.charAt(0).toUpperCase() + label.slice(1));
    }
    movimientosEmpresa.forEach(m => {
      const value = fechaMov(m).slice(0, 7);
      if (!value || opciones.has(value)) return;
      const d = new Date(`${value}-01T00:00:00`);
      const label = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
      opciones.set(value, label.charAt(0).toUpperCase() + label.slice(1));
    });
    return [...opciones.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [hoy, movimientosEmpresa]);
  const periodoTesoreriaLabel = periodoTesoreria
    ? periodoOpcionesTesoreria.find(o => o.value === periodoTesoreria)?.label || periodoTesoreria
    : 'Todos';
  const periodoTesoreriaLabelCorto = periodoTesoreria
    ? periodoTesoreriaLabel.slice(0, 3).toUpperCase() + ` ${periodoTesoreria.slice(0, 4)}`
    : 'TODOS';
  const filtraPeriodoTesoreria = fecha => !periodoTesoreria || String(fecha || '').slice(0, 7) === periodoTesoreria;
  const movimientosPeriodoTesoreria = useMemo(
    () => movimientosEmpresa.filter(m => filtraPeriodoTesoreria(fechaMov(m))),
    [movimientosEmpresa, periodoTesoreria],
  );

  const movimientosConConversionLegacy = useMemo(() => movimientosEmpresa
    .map(mov => {
      const cuenta = cuentasActivas.find(c => c.id === mov?.cuenta_bancaria_id);
      return cuenta ? { mov, cuenta, key: claveEquivalenciaMovimientoCuenta(mov, cuenta) } : null;
    })
    .filter(item =>
      item &&
      monedasDifierenMovimientoCuenta(item.mov, item.cuenta) &&
      (item.mov.monto_en_moneda_cuenta == null || item.mov.monto_en_moneda_cuenta === '')
    ), [movimientosEmpresa, cuentasActivas]);

  useEffect(() => {
    if (!movimientosConConversionLegacy.length) return;
    let activo = true;
    const cargarEquivalencias = async () => {
      const supabase = isSupabaseConfigured() ? await getSupabaseClient() : null;
      const calculadas = {};
      for (const item of movimientosConConversionLegacy) {
        const tc = await getTipoCambioPorFecha(fechaMov(item.mov), supabase);
        calculadas[item.key] = convertirMontoConTc(
          item.mov.monto,
          monedaMov(item.mov),
          item.cuenta.moneda,
          tc
        );
      }
      if (!activo) return;
      setEquivalenciasCuenta(prev => {
        const next = { ...prev };
        let cambio = false;
        Object.entries(calculadas).forEach(([key, value]) => {
          if (next[key] !== value) {
            next[key] = value;
            cambio = true;
          }
        });
        return cambio ? next : prev;
      });
    };
    cargarEquivalencias();
    return () => { activo = false; };
  }, [movimientosConConversionLegacy]);

  const movimientosResumen = useMemo(() => movimientosPeriodoTesoreria.filter(m => {
    if (cuentaResumenActiva) {
      return movPerteneceCuenta(m, cuentaResumenActiva);
    }
    if (filtroSinVincularActivo) return !movTieneCuentaExplicita(m);
    return true;
  }), [movimientosPeriodoTesoreria, cuentaResumenActiva, filtroSinVincularActivo]);

  const saldoPorCuenta = useMemo(() => {
    return calcularSaldosCuentasBancarias(cuentasActivas, movimientosEmpresa, equivalenciasCuenta);
  }, [cuentasActivas, movimientosEmpresa, equivalenciasCuenta]);

  const saldoDisponiblePorMoneda = useMemo(() => {
    const cuentasSaldo = cuentaResumenActiva
      ? saldoPorCuenta.filter(cb => cb.id === cuentaResumenActiva.id)
      : saldoPorCuenta;
    return calcularTotalesPorMonedaCuentas(cuentasSaldo);
  }, [saldoPorCuenta, cuentaResumenActiva]);
  const movimientosSinCuentaPorMoneda = useMemo(
    () => calcularMovimientosSinCuentaPorMoneda(movimientosPeriodoTesoreria),
    [movimientosPeriodoTesoreria],
  );
  const totalPEN = Number(saldoDisponiblePorMoneda.PEN || 0);
  const saldoPendienteCxPDe = p => {
    if (p?.saldo != null) return Math.max(0, Number(p.saldo || 0));
    return Math.max(0, Number(p?.monto_total ?? p?.monto ?? 0) - Number(p?.monto_pagado || 0));
  };

  const cxcPendienteRows = useMemo(() => (cxc || []).filter(c =>
    (!empresaId || c.empresa_id === empresaId) &&
    !['cobrada','pagada','anulada','cancelada'].includes(normalizeFinText(c.estado)) &&
    Number(c.saldo ?? c.monto_total ?? 0) > 0
  ), [cxc, empresaId]);
  const cxpPendienteRows = useMemo(() => (cxp || []).filter(p =>
    (!empresaId || p.empresa_id === empresaId) &&
    !['pagada','cobrada','anulada','cancelada'].includes(normalizeFinText(p.estado)) &&
    saldoPendienteCxPDe(p) > 0
  ), [cxp, empresaId]);
  const pendienteCxC = useMemo(() => sumarMoneda(cxcPendienteRows, c => c.saldo ?? c.monto_total, c => c.moneda || 'PEN'), [cxcPendienteRows]);
  const pendienteCxP = useMemo(() => sumarMoneda(cxpPendienteRows, saldoPendienteCxPDe, p => p.moneda || 'PEN'), [cxpPendienteRows]);

  const movBancoFiltrado = useMemo(() => {
    const all = (movimientosBanco || []).filter(m => filtraPeriodoTesoreria(fechaBanco(m)));
    if (filtroEstado === 'conciliados') return all.filter(m => m.conciliado);
    if (filtroEstado === 'pendientes') return all.filter(m => !m.conciliado);
    return all;
  }, [movimientosBanco, filtroEstado, periodoTesoreria]);

  const movimientosBancoPeriodo = useMemo(
    () => (movimientosBanco || []).filter(m => filtraPeriodoTesoreria(fechaBanco(m))),
    [movimientosBanco, periodoTesoreria],
  );
  const vinculados = movimientosBancoPeriodo.filter(m => m.conciliado).length;
  const pendientes = movimientosBancoPeriodo.length - vinculados;
  const pctConciliado = movimientosBancoPeriodo.length > 0 ? Math.round(vinculados / movimientosBancoPeriodo.length * 100) : 0;

  const clienteNombre = id => {
    const c = (cuentas || []).find(x => x.id === id);
    return c?.razon_social || c?.nombre_comercial || '-';
  };
  const saldoCxc = c => Number(c.saldo ?? c.monto_total ?? 0);
  const saldoCxp = saldoPendienteCxPDe;

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
  const cuentaBancoMovSel = useMemo(
    () => cuentasActivas.find(c => c.id === movSel?.cuenta_bancaria_id) || null,
    [cuentasActivas, movSel],
  );
  const candidatoSeleccionado = useMemo(
    () => candidatos.find(c => `${c.tipo}:${c.id}` === target) || null,
    [candidatos, target],
  );
  const monedaSistemaMatch = useMemo(() => {
    if (!candidatoSeleccionado) return movSel?.moneda || 'PEN';
    if (candidatoSeleccionado.tipo === 'cxc') {
      const row = (cxc || []).find(c => c.id === candidatoSeleccionado.id);
      const factura = (facturas || []).find(f => f.id === row?.factura_id);
      return row?.moneda || factura?.moneda || movSel?.moneda || 'PEN';
    }
    const row = (cxp || []).find(p => p.id === candidatoSeleccionado.id);
    return row?.moneda || movSel?.moneda || 'PEN';
  }, [candidatoSeleccionado, cxc, cxp, facturas, movSel]);
  const requiereTcMatch = Boolean(cuentaBancoMovSel && candidatoSeleccionado && monedaSistemaMatch !== cuentaBancoMovSel.moneda);
  const tcPreviewMatch = requiereTcMatch
    ? (monedaSistemaMatch === 'PEN' && cuentaBancoMovSel.moneda === 'USD'
      ? tipoCambioHoy?.usd
      : monedaSistemaMatch === 'USD' && cuentaBancoMovSel.moneda === 'PEN' && tipoCambioHoy?.usd
        ? Math.round((1 / tipoCambioHoy.usd) * 10000) / 10000
        : null)
    : 1;
  const equivalentePreviewMatch = requiereTcMatch && candidatoSeleccionado && convertirMonto
    ? convertirMonto(candidatoSeleccionado.monto, monedaSistemaMatch, cuentaBancoMovSel.moneda)
    : candidatoSeleccionado?.monto;

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

  const cuentaNombreCorto = cuenta => cuenta?.alias || cuenta?.nombre || cuenta?.banco || 'Cuenta';
  const cuentaOptionLabel = cuenta => `${cuentaNombreCorto(cuenta)} (${cuenta?.moneda || 'PEN'})`;
  const cuentaMovimientoDe = mov => cuentasActivas.find(c => c.id === mov?.cuenta_bancaria_id) || null;
  const cambiarCuentaMovimiento = async (mov, cuentaId) => {
    if (!mov?.id || asignandoCuentaMovId) return;
    setAsignandoCuentaMovId(mov.id);
    try {
      await asignarCuentaMovimientoTesoreria?.(mov.id, cuentaId || null);
      setEditandoCuentaMovId(null);
    } finally {
      setAsignandoCuentaMovId(null);
    }
  };

  const iniciarEdicionSaldoInicial = cuenta => {
    setEditandoSaldoInicialId(cuenta.id);
    setSaldoInicialDraft(String(Number(cuenta.saldo_inicial || 0)));
  };

  const cancelarEdicionSaldoInicial = () => {
    setEditandoSaldoInicialId(null);
    setSaldoInicialDraft('');
  };

  const guardarSaldoInicialCuenta = async cuenta => {
    if (!cuenta?.id || guardandoSaldoInicialId) return;
    const saldoInicial = Number(saldoInicialDraft || 0);
    if (!Number.isFinite(saldoInicial)) {
      alert('Ingrese un saldo inicial valido.');
      return;
    }
    setGuardandoSaldoInicialId(cuenta.id);
    try {
      await actualizarCuentaBancaria?.(cuenta.id, {
        saldo_inicial: saldoInicial,
        fecha_saldo_inicial: cuenta.fecha_saldo_inicial || new Date().toISOString().slice(0, 10),
      });
      addNotificacion?.('Saldo inicial actualizado.');
      cancelarEdicionSaldoInicial();
    } finally {
      setGuardandoSaldoInicialId(null);
    }
  };

  const setCuentaBancariaField = field => e => setFormCuentaBancaria(prev => ({ ...prev, [field]: e.target.value }));

  const abrirNuevaCuentaBancaria = () => {
    setFormCuentaBancaria(cuentaBancariaFormVacio);
    setPanelCuentaBancaria(true);
  };

  const cerrarNuevaCuentaBancaria = () => {
    setPanelCuentaBancaria(false);
    setFormCuentaBancaria(cuentaBancariaFormVacio);
  };

  const guardarNuevaCuentaBancaria = async e => {
    e.preventDefault();
    if (!formCuentaBancaria.nombre.trim() || !formCuentaBancaria.banco.trim() || savingCuentaBancaria) return;
    setSavingCuentaBancaria(true);
    try {
      await crearCuentaBancaria?.({
        ...formCuentaBancaria,
        saldo_inicial: Number(formCuentaBancaria.saldo_inicial || 0),
      });
      cerrarNuevaCuentaBancaria();
    } finally {
      setSavingCuentaBancaria(false);
    }
  };

  const cobrosDelMes = useMemo(
    () => calcularMovimientosMesPorMoneda(movimientosEmpresa, 'ingreso', periodoTesoreria),
    [movimientosEmpresa, periodoTesoreria]
  );
  const pagosDelMes = useMemo(
    () => calcularMovimientosMesPorMoneda(movimientosEmpresa, 'egreso', periodoTesoreria),
    [movimientosEmpresa, periodoTesoreria]
  );
  const movimientosEgresoPeriodo = useMemo(
    () => movimientosPeriodoTesoreria.filter(esEgresoMov),
    [movimientosPeriodoTesoreria],
  );
  const pagosPeriodoCuentaPorMoneda = useMemo(() => movimientosEgresoPeriodo.reduce((acc, mov) => {
    const cuenta = cuentaMovimientoDe(mov);
    const moneda = String(cuenta?.moneda || mov.moneda || 'PEN').trim().toUpperCase();
    const monto = cuenta ? montoMovimientoEnCuenta(mov, cuenta, equivalenciasCuenta) : Number(mov.monto || 0);
    return { ...acc, [moneda]: (acc[moneda] || 0) + monto };
  }, {}), [movimientosEgresoPeriodo, cuentasActivas, equivalenciasCuenta]);
  const pagosPeriodoOrigenPorMoneda = useMemo(() => movimientosEgresoPeriodo.reduce((acc, mov) => {
    const cuenta = cuentaMovimientoDe(mov);
    const monedaOrigen = String(mov.moneda || 'PEN').trim().toUpperCase();
    if (!cuenta || String(cuenta.moneda || 'PEN').trim().toUpperCase() === monedaOrigen) return acc;
    return { ...acc, [monedaOrigen]: (acc[monedaOrigen] || 0) + Number(mov.monto || 0) };
  }, {}), [movimientosEgresoPeriodo, cuentasActivas]);

  // Resumen tab: filtered movements with running balance
  const movResumen = useMemo(() => {
    const movs = (movimientosTesoreriaVista || [])
      .filter(m => m.estado !== 'anulado')
      .filter(m => {
        if (resumenCuenta === SIN_VINCULAR) return !m.cuenta_bancaria_id;
        return !resumenCuenta || m.cuenta_bancaria_id === resumenCuenta;
      })
      .filter(m => (!resumenDesde || (m.fecha || '') >= resumenDesde) && (!resumenHasta || (m.fecha || '') <= resumenHasta))
      .slice().sort((a, b) => (a.fecha || '') < (b.fecha || '') ? -1 : 1);

    const cuentaObj = cuentasActivas.find(c => c.id === resumenCuenta);

    if (cuentaObj) {
      const monedaCuenta = (cuentaObj.moneda || 'PEN').toUpperCase();
      let saldoAcum = Number(cuentaObj.saldo_inicial || 0);
      return movs.map(m => {
        const monedaMov = (m.moneda || 'PEN').toUpperCase();
        const montoCuenta = monedaMov === monedaCuenta
          ? Number(m.monto || 0)
          : Number(m.monto_en_moneda_cuenta ?? equivalenciasCuenta[claveEquivalenciaMovimientoCuenta(m, cuentaObj)] ?? 0);
        saldoAcum = m.tipo === 'ingreso' ? saldoAcum + montoCuenta : saldoAcum - montoCuenta;
        return { ...m, saldoAcum, saldoAcumMoneda: monedaCuenta, montoCuenta };
      });
    }

    // Todas las cuentas o Sin vincular: acumulador por moneda usando la moneda de la cuenta asignada
    const acumPorMoneda = {};
    if (resumenCuenta !== SIN_VINCULAR) {
      cuentasActivas.forEach(c => {
        const mon = (c.moneda || 'PEN').toUpperCase();
        acumPorMoneda[mon] = (acumPorMoneda[mon] || 0) + Number(c.saldo_inicial || 0);
      });
    }
    return movs.map(m => {
      const cuentaMov = cuentasActivas.find(c => c.id === m.cuenta_bancaria_id);
      const mon = cuentaMov ? (cuentaMov.moneda || 'PEN').toUpperCase() : (m.moneda || 'PEN').toUpperCase();
      const monto = cuentaMov ? montoMovimientoEnCuenta(m, cuentaMov, equivalenciasCuenta) : Number(m.monto || 0);
      acumPorMoneda[mon] = m.tipo === 'ingreso'
        ? (acumPorMoneda[mon] || 0) + monto
        : (acumPorMoneda[mon] || 0) - monto;
      return { ...m, saldoAcum: acumPorMoneda[mon], saldoAcumMoneda: mon, montoCuenta: monto };
    });
  }, [movimientosTesoreriaVista, resumenCuenta, resumenDesde, resumenHasta, cuentasActivas, equivalenciasCuenta]);

  // Proyección 90 días (13 semanas), agrupada por moneda
  const proyeccionSemanas = useMemo(() => {
    const hoyDate = new Date();
    return Array.from({ length: 13 }, (_, i) => {
      const ini = new Date(hoyDate); ini.setDate(ini.getDate() + i * 7);
      const fin = new Date(ini); fin.setDate(fin.getDate() + 6);
      const s = ini.toISOString().slice(0, 10);
      const e = fin.toISOString().slice(0, 10);
      const ingresosPorMoneda = {};
      const egresosPorMoneda = {};
      (cxc || []).filter(c => !['cobrada','pagada','anulada','cancelada'].includes(normalizeFinText(c.estado)) && c.fecha_vencimiento >= s && c.fecha_vencimiento <= e)
        .forEach(c => {
          const mon = (c.moneda || 'PEN').toUpperCase();
          ingresosPorMoneda[mon] = (ingresosPorMoneda[mon] || 0) + Number(c.saldo ?? c.monto_total ?? 0);
        });
      (cxp || []).filter(p => !['pagada','anulada'].includes(p.estado) && p.fecha_vencimiento >= s && p.fecha_vencimiento <= e)
        .forEach(p => {
          const mon = (p.moneda || 'PEN').toUpperCase();
          egresosPorMoneda[mon] = (egresosPorMoneda[mon] || 0) + saldoPendienteCxPDe(p);
        });
      const ultimaNomina = (periodosNomina || []).slice(-1)[0];
      if (i === 4 && ultimaNomina) {
        egresosPorMoneda['PEN'] = (egresosPorMoneda['PEN'] || 0) + Number(ultimaNomina.total_neto || ultimaNomina.total || 0);
      }
      return { label: `S${i+1}`, startStr: s, endStr: e, ingresosPorMoneda, egresosPorMoneda };
    });
  }, [cxc, cxp, periodosNomina]);

  const bloques90 = useMemo(() => {
    const acumPorMoneda = {};
    Object.entries(saldoDisponiblePorMoneda).forEach(([mon, v]) => { acumPorMoneda[mon] = v; });
    return [0, 1, 2].map(b => {
      const sems = proyeccionSemanas.slice(b * 4, b * 4 + (b === 2 ? 5 : 4));
      const ingresosPorMoneda = {};
      const egresosPorMoneda = {};
      sems.forEach(s => {
        Object.entries(s.ingresosPorMoneda).forEach(([mon, v]) => { ingresosPorMoneda[mon] = (ingresosPorMoneda[mon] || 0) + v; });
        Object.entries(s.egresosPorMoneda).forEach(([mon, v]) => { egresosPorMoneda[mon] = (egresosPorMoneda[mon] || 0) + v; });
      });
      const flujoNetoPorMoneda = {};
      const allMon = new Set([...Object.keys(ingresosPorMoneda), ...Object.keys(egresosPorMoneda), ...Object.keys(acumPorMoneda)]);
      allMon.forEach(mon => {
        flujoNetoPorMoneda[mon] = (ingresosPorMoneda[mon] || 0) - (egresosPorMoneda[mon] || 0);
        acumPorMoneda[mon] = (acumPorMoneda[mon] || 0) + flujoNetoPorMoneda[mon];
      });
      return { label: `Días ${b*30+1}–${(b+1)*30}`, ingresosPorMoneda, egresosPorMoneda, flujoNetoPorMoneda, saldoProyPorMoneda: { ...acumPorMoneda } };
    });
  }, [proyeccionSemanas, saldoDisponiblePorMoneda]);

  const umbralMinimo = Number(empresaConfig?.umbral_liquidez_minimo || 0);
  const alertaLiquidez = useMemo(() => {
    if (!umbralMinimo) return null;
    let saldo = totalPEN;
    for (let i = 0; i < proyeccionSemanas.length; i++) {
      const s = proyeccionSemanas[i];
      saldo += (s.ingresosPorMoneda['PEN'] || 0) - (s.egresosPorMoneda['PEN'] || 0);
      if (saldo < umbralMinimo) {
        return { saldo, semana: i + 1, fecha: s.startStr };
      }
    }
    return null;
  }, [proyeccionSemanas, totalPEN, umbralMinimo]);
  const proyeccionSemanasGrafico = useMemo(() => {
    const lastActive = proyeccionSemanas.reduce((last, s, i) => {
      const hayDatos = Object.values(s.ingresosPorMoneda).some(v => v > 0) ||
                       Object.values(s.egresosPorMoneda).some(v => v > 0);
      return hayDatos ? i : last;
    }, -1);
    if (lastActive === -1) return proyeccionSemanas.slice(0, 1);
    return proyeccionSemanas.slice(0, Math.min(proyeccionSemanas.length, lastActive + 2));
  }, [proyeccionSemanas]);
  const hayProyeccion = useMemo(
    () => proyeccionSemanas.some(s =>
      Object.values(s.ingresosPorMoneda).some(v => v > 0) || Object.values(s.egresosPorMoneda).some(v => v > 0)
    ),
    [proyeccionSemanas]
  );
  const alertasNegativas = useMemo(() => {
    const result = [];
    const monedas = Object.keys(saldoDisponiblePorMoneda).length ? Object.keys(saldoDisponiblePorMoneda) : ['PEN'];
    monedas.forEach(mon => {
      let saldo = Number(saldoDisponiblePorMoneda[mon] || 0);
      for (const s of proyeccionSemanasGrafico) {
        saldo += (s.ingresosPorMoneda[mon] || 0) - (s.egresosPorMoneda[mon] || 0);
        if (saldo < 0) { result.push({ mon, semana: s.label, saldo }); break; }
      }
    });
    return result;
  }, [proyeccionSemanasGrafico, saldoDisponiblePorMoneda]);

  const saldoFinalResumenDisplay = cuentaResumenActiva
    ? moneyCurrency(movResumen[movResumen.length - 1]?.saldoAcum ?? cuentaResumenActiva.saldo_inicial ?? 0, cuentaResumenActiva.moneda)
    : formatTotales(saldoDisponiblePorMoneda);
  const monedasCuentasActivas = [...new Set(cuentasActivas.map(c => String(c.moneda || 'PEN').trim().toUpperCase()))];
  const posicionTotalEntries = monedasCuentasActivas.length
    ? monedasCuentasActivas.map(moneda => [moneda, Number(saldoDisponiblePorMoneda[moneda] || 0)])
    : totalesEntries(saldoDisponiblePorMoneda);
  const cobrosPeriodoEntries = totalesEntries(cobrosDelMes);
  const pagosCuentaEntries = totalesEntries(pagosPeriodoCuentaPorMoneda);
  const pagosOrigenEntries = Object.entries(pagosPeriodoOrigenPorMoneda).filter(([, value]) => Math.abs(Number(value || 0)) > 0.009);
  const sinCuentaTienePendientes = Object.values(movimientosSinCuentaPorMoneda || {}).some(value => Math.abs(Number(value || 0)) > 0.009);
  const sinCuentaEntries = sinCuentaTienePendientes ? totalesEntries(movimientosSinCuentaPorMoneda) : [['USD', 0]];
  const ingresosPeriodoCount = movimientosPeriodoTesoreria.filter(esIngresoMov).length;
  const facturasPendientesCount = cxcPendienteRows.length;
  const pendienteCxPEntries = totalesEntries(pendienteCxP);
  const sinVincularPorCuenta = useMemo(() => {
    const conciliadosIds = new Set(
      (movimientosBancoPeriodo || []).filter(b => b.conciliado && b.vinculado_id).map(b => b.vinculado_id)
    );
    const result = {};
    movimientosPeriodoTesoreria.forEach(m => {
      if (!m.cuenta_bancaria_id) return;
      if (!result[m.cuenta_bancaria_id]) result[m.cuenta_bancaria_id] = 0;
      if (!conciliadosIds.has(m.id)) result[m.cuenta_bancaria_id]++;
    });
    return result;
  }, [movimientosBancoPeriodo, movimientosPeriodoTesoreria]);
  const metricCardStyle = {background:'var(--bg-subtle)', border:'none', borderRadius:8, padding:'14px 16px', minHeight:116};
  const accountGridStyle = {display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:10, marginTop:8};
  const accountCardStyle = {background:'var(--surface)', border:'0.5px solid var(--border-subtle)', borderRadius:10, padding:'12px 14px', minHeight:154};

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tesorería</h1>
          <div className="page-sub">{vinculados}/{movimientosBancoPeriodo.length} conciliados · {pctConciliado}%</div>
        </div>
        <div className="row" style={{gap:8,alignItems:'center'}}>
          <select className="select" style={{fontSize:12,padding:'4px 8px'}} value={periodoTesoreria} onChange={e=>setPeriodoTesoreria(e.target.value)}>
            <option value="">Todos</option>
            {periodoOpcionesTesoreria.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={() => setPanelManual(true)}>{I.plus} Movimiento manual</button>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>{I.download} Importar extracto</button>
        </div>
      </div>

      <div style={{fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:1, margin:'6px 0 8px'}}>Resumen global del periodo</div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:10}}>
        <div style={metricCardStyle}>
          <div className="kpi-label">Posicion total</div>
          <div className="kpi-value" style={{fontSize:20}}>{moneyCurrency(posicionTotalEntries[0]?.[1] || 0, posicionTotalEntries[0]?.[0] || empresa?.moneda || 'PEN')}</div>
          {posicionTotalEntries.slice(1).map(([moneda, value]) => (
            <div key={moneda} className="text-muted" style={{fontSize:12, marginTop:2}}>{moneyCurrency(value, moneda)}</div>
          ))}
          <div className="text-muted" style={{fontSize:11, marginTop:8}}>Saldo acumulado real</div>
        </div>
        <div style={metricCardStyle}>
          <div className="kpi-label">Cobros - {periodoTesoreriaLabelCorto}</div>
          <div className="kpi-value" style={{fontSize:20, color:'var(--green)'}}>{moneyCurrency(cobrosPeriodoEntries[0]?.[1] || 0, cobrosPeriodoEntries[0]?.[0] || empresa?.moneda || 'PEN')}</div>
          {cobrosPeriodoEntries.slice(1).map(([moneda, value]) => (
            <div key={moneda} className="text-muted" style={{fontSize:12, marginTop:2}}>{moneyCurrency(value, moneda)}</div>
          ))}
          <div className="text-muted" style={{fontSize:11, marginTop:8}}>{ingresosPeriodoCount} ingresos en el periodo</div>
        </div>
        <div style={metricCardStyle}>
          <div className="kpi-label">Pagos - {periodoTesoreriaLabelCorto}</div>
          <div className="kpi-value" style={{fontSize:20, color:'var(--danger)'}}>{moneyCurrency(pagosCuentaEntries[0]?.[1] || 0, pagosCuentaEntries[0]?.[0] || empresa?.moneda || 'PEN')}</div>
          {pagosCuentaEntries.slice(1).map(([moneda, value]) => (
            <div key={moneda} className="text-muted" style={{fontSize:12, marginTop:2}}>{moneyCurrency(value, moneda)}</div>
          ))}
          {pagosOrigenEntries.map(([moneda, value]) => (
            <div key={moneda} style={{fontSize:11, marginTop:4, color:'var(--orange)'}}>{moneyCurrency(value, moneda)} en origen</div>
          ))}
          <div className="text-muted" style={{fontSize:11, marginTop:8}}>Convertido al TC del dia</div>
        </div>
        <div style={metricCardStyle}>
          <div className="kpi-label">Por cobrar pendiente</div>
          <div className="kpi-value" style={{fontSize:20, color:'var(--orange)'}}>{formatTotales(pendienteCxC)}</div>
          {pendienteCxPEntries.map(([mon, val]) => (
            <div key={mon} className="text-muted" style={{fontSize:11, marginTop:4}}>CxP pendiente: {moneyCurrency(val, mon)}</div>
          ))}
          <div className="text-muted" style={{fontSize:11, marginTop:8}}>{facturasPendientesCount} facturas por vencer</div>
        </div>
      </div>

      <div style={{fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:1, margin:'16px 0 8px'}}>Cuentas bancarias</div>
      <div style={accountGridStyle}>
        {saldoPorCuenta.map(cb => {
          const saldoInicialCuenta = Number(cb.saldo_inicial || 0);
          const editandoSaldoInicial = editandoSaldoInicialId === cb.id;
          const guardandoSaldoInicial = guardandoSaldoInicialId === cb.id;
          const tieneMovimientosCuenta = Number(cb.movimientos_asignados || 0) > 0;
          const sinVincularCuenta = sinVincularPorCuenta[cb.id] ?? 0;
          return (
            <div key={cb.id} style={{...accountCardStyle, opacity: tieneMovimientosCuenta ? 1 : 0.6}}>
              <div className="text-muted" style={{fontSize:11, textTransform:'uppercase'}}>{cb.banco} - {cb.moneda}</div>
              <div style={{fontSize:13, fontWeight:500, marginTop:4}}>{cb.alias || cb.nombre}</div>
              <div style={{fontSize:20, fontWeight:800, color: cb.saldo >= 0 ? 'var(--green)' : 'var(--danger)', marginTop:8}}>{moneyCurrency(cb.saldo, cb.moneda)}</div>
              {editandoSaldoInicial ? (
                <div className="row" style={{gap:6, alignItems:'center', marginTop:6, flexWrap:'nowrap'}}>
                  <span className="text-muted" style={{fontSize:11}}>Saldo inicial:</span>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    autoFocus
                    value={saldoInicialDraft}
                    onChange={e => setSaldoInicialDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') guardarSaldoInicialCuenta(cb);
                      if (e.key === 'Escape') cancelarEdicionSaldoInicial();
                    }}
                    placeholder="0.00"
                    style={{fontSize:11, padding:'3px 6px', width:92}}
                  />
                  <button className="icon-btn" style={{width:22, height:22}} title="Guardar saldo inicial" disabled={guardandoSaldoInicial} onClick={() => guardarSaldoInicialCuenta(cb)}>{I.check}</button>
                  <button className="icon-btn" style={{width:22, height:22}} title="Cancelar" disabled={guardandoSaldoInicial} onClick={cancelarEdicionSaldoInicial}>{I.x}</button>
                </div>
              ) : (
                <div className="text-muted" style={{fontSize:11, marginTop:6, display:'flex', alignItems:'center', gap:6}}>
                  <span>Saldo inicial: {moneyCurrency(saldoInicialCuenta, cb.moneda)}</span>
                  <button className="icon-btn" style={{width:22, height:22}} title="Editar saldo inicial" onClick={() => iniciarEdicionSaldoInicial(cb)}>{I.edit}</button>
                </div>
              )}
              <div style={{borderTop:'1px solid var(--border-subtle)', marginTop:10, paddingTop:8, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                <span className="text-muted" style={{fontSize:11, textTransform:'capitalize'}}>{cb.tipo}</span>
                {tieneMovimientosCuenta && (
                  sinVincularCuenta > 0
                    ? <span className="badge badge-orange" style={{fontSize:10}}>{sinVincularCuenta} sin vincular</span>
                    : <span className="badge badge-green" style={{fontSize:10}}>Al día</span>
                )}
              </div>
            </div>
          );
        })}
        <button type="button" onClick={abrirNuevaCuentaBancaria} style={{...accountCardStyle, border:'1.5px dashed var(--border-subtle)', background:'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, color:'var(--muted)', minHeight:154}}>
          <span style={{width:22, height:22, display:'inline-flex'}}>{I.plus}</span>
          <span style={{fontSize:13}}>Agregar cuenta</span>
        </button>
        <div style={{...metricCardStyle, minHeight:154}}>
          <div className="kpi-label">Sin cuenta asignada</div>
          <div className="kpi-value" style={{fontSize:20, color: sinCuentaTienePendientes ? 'var(--orange)' : 'var(--fg)'}}>{moneyCurrency(sinCuentaEntries[0]?.[1] || 0, sinCuentaEntries[0]?.[0] || 'USD')}</div>
          {sinCuentaEntries.slice(1).map(([moneda, value]) => (
            <div key={moneda} className="text-muted" style={{fontSize:12, marginTop:2}}>{moneyCurrency(value, moneda)}</div>
          ))}
          <div className="text-muted" style={{fontSize:11, marginTop:8}}>{sinCuentaTienePendientes ? 'Movimientos pendientes de match bancario' : 'Todos los movimientos vinculados'}</div>
        </div>
      </div>

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
              <div className="card-head"><h3>Sistema (movimientos tesorería)</h3><span className="badge badge-cyan">{movimientosPeriodoTesoreria.length}</span></div>
              <div className="table-wrap" style={{maxHeight:420}}>
                <table className="tbl" style={{minWidth:720}}>
                  <thead><tr><th>Fecha</th><th>Descripcion</th><th>Tipo</th><th>Monto</th><th>Cuenta</th></tr></thead>
                  <tbody>{(movimientosPeriodoTesoreria||[]).slice(0,50).map((m,i) => {
                    const cuentaMov = cuentaMovimientoDe(m);
                    const editandoCuenta = editandoCuentaMovId === m.id || !cuentaMov;
                    const asignandoCuenta = asignandoCuentaMovId === m.id;
                    const mostrarEquivalente = cuentaMov && monedasDifierenMovimientoCuenta(m, cuentaMov);
                    const montoEquivalenteCuenta = mostrarEquivalente
                      ? montoMovimientoEnCuenta(m, cuentaMov, equivalenciasCuenta)
                      : 0;
                    return (
                      <tr key={m.id||i}>
                        <td className="text-muted" style={{fontSize:12}}>{m.fecha}</td>
                        <td style={{fontSize:12}}>{m.descripcion}</td>
                        <td><span className={'badge '+(m.tipo==='ingreso'?'badge-green':'badge-orange')} style={{fontSize:10}}>{m.tipo}</span></td>
                        <td className="num" style={{fontSize:12, color:m.tipo==='ingreso'?'var(--green)':'var(--fg)'}}>
                          <div>{m.tipo==='ingreso'?'+':'-'}{moneyCurrency(m.monto, m.moneda)}</div>
                          {mostrarEquivalente && (
                            <div className="text-muted" style={{fontSize:11}}>≈ {m.tipo==='ingreso'?'+':'-'}{moneyCurrency(montoEquivalenteCuenta, cuentaMov.moneda)}</div>
                          )}
                        </td>
                        <td style={{fontSize:12, minWidth:150}}>
                          {editandoCuenta ? (
                            <select
                              className="input"
                              style={{fontSize:11, padding:'3px 6px', minWidth:138}}
                              value={cuentaMov?.id || ''}
                              disabled={asignandoCuenta}
                              onChange={e => cambiarCuentaMovimiento(m, e.target.value)}
                              onBlur={() => cuentaMov && setEditandoCuentaMovId(null)}
                            >
                              {cuentaMov ? <option value="">Sin cuenta</option> : <option value="">Asignar cuenta</option>}
                              {cuentasActivas.map(cuenta => (
                                <option key={cuenta.id} value={cuenta.id}>{cuentaOptionLabel(cuenta)}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{display:'inline-flex', alignItems:'center', gap:6, whiteSpace:'nowrap'}}>
                              <span>{cuentaOptionLabel(cuentaMov)}</span>
                              <button className="icon-btn" style={{width:22, height:22}} title="Editar cuenta" onClick={() => setEditandoCuentaMovId(m.id)}>{I.edit}</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}</tbody>
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
                      <td className="num" style={{fontSize:12, color:m.tipo==='credito'?'var(--green)':'var(--fg)'}}>{m.tipo==='credito'?'+':'-'}{moneyCurrency(m.monto, m.moneda)}</td>
                      <td>
                        {m.conciliado
                          ? <button className="btn btn-sm btn-secondary" data-local-form="true" style={{fontSize:11, padding:'2px 8px'}} onClick={() => deshacerConciliacionBanco?.(m.id)}>Deshacer</button>
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
                <option value={SIN_VINCULAR}>Sin vincular</option>
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
              {movResumen.length} movimientos · Saldo final: <strong style={{color:'var(--cyan)'}}>{saldoFinalResumenDisplay}</strong>
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
                      <td style={{fontSize:11, color:'var(--muted)'}}>{categoriaMovimientoDe(m)}</td>
                      <td className="num" style={{fontWeight:600, color:m.tipo==='ingreso'?'var(--green)':'var(--fg)'}}>{m.tipo==='ingreso'?'+':'-'}{moneyCurrency(m.monto, m.moneda || cb?.moneda)}</td>
                      <td style={{fontSize:11}}>{cb?.nombre || '—'}</td>
                      <td className="num" style={{fontWeight:700, color: m.saldoAcum >= 0 ? 'var(--cyan)' : 'var(--danger)'}}>{moneyCurrency(m.saldoAcum, m.saldoAcumMoneda || cb?.moneda || m.moneda)}</td>
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
                {bloques90.map((b, i) => {
                  const monedas = Object.keys(b.saldoProyPorMoneda).length
                    ? Object.keys(b.saldoProyPorMoneda)
                    : ['PEN'];
                  return (
                    <div key={i} style={{background:'var(--surface-2)', borderRadius:10, padding:'14px 16px', border:'1px solid var(--border)'}}>
                      <div style={{fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:8}}>{b.label}</div>
                      <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4, alignItems:'flex-start'}}>
                        <span style={{color:'var(--muted)'}}>Ingresos proyect.</span>
                        <div style={{textAlign:'right'}}>
                          {monedas.map(mon => <div key={mon}><strong style={{color:'var(--green)'}}>{moneyCurrency(b.ingresosPorMoneda[mon] || 0, mon)}</strong></div>)}
                        </div>
                      </div>
                      <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4, alignItems:'flex-start'}}>
                        <span style={{color:'var(--muted)'}}>Egresos proyect.</span>
                        <div style={{textAlign:'right'}}>
                          {monedas.map(mon => <div key={mon}><strong style={{color:'var(--orange)'}}>{moneyCurrency(b.egresosPorMoneda[mon] || 0, mon)}</strong></div>)}
                        </div>
                      </div>
                      <div style={{borderTop:'1px solid var(--border)', marginTop:6, paddingTop:6, display:'flex', justifyContent:'space-between', fontSize:13, alignItems:'flex-start'}}>
                        <span style={{color:'var(--muted)'}}>Flujo neto</span>
                        <div style={{textAlign:'right'}}>
                          {monedas.map(mon => {
                            const neto = b.flujoNetoPorMoneda[mon] || 0;
                            return <div key={mon}><strong style={{color: neto >= 0 ? 'var(--green)' : 'var(--danger)'}}>{neto >= 0 ? '+' : ''}{moneyCurrency(neto, mon)}</strong></div>;
                          })}
                        </div>
                      </div>
                      <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginTop:4, alignItems:'flex-start'}}>
                        <span style={{color:'var(--muted)'}}>Saldo proy.</span>
                        <div style={{textAlign:'right'}}>
                          {monedas.map(mon => {
                            const saldo = b.saldoProyPorMoneda[mon] || 0;
                            return <div key={mon}><strong style={{color: saldo >= 0 ? 'var(--cyan)' : 'var(--danger)'}}>{moneyCurrency(saldo, mon)}</strong></div>;
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bar chart */}
              <BarChartProyeccion semanas={proyeccionSemanasGrafico} saldoInicialPorMoneda={saldoDisponiblePorMoneda} />
              {alertasNegativas.map(({ mon, semana, saldo }) => (
                <div key={mon} style={{marginTop:8, padding:'8px 12px', background:'rgba(220,30,30,0.07)', border:'1px solid rgba(220,30,30,0.25)', borderRadius:6, fontSize:12, color:'var(--danger)'}}>
                  ⚠ Alerta: saldo {mon} proyectado negativo en {semana} ({moneyCurrency(saldo, mon)}). Considera transferir fondos o programar el pago desde tu cuenta {mon === 'PEN' ? 'USD' : 'PEN'}.
                </div>
              ))}
              {!hayProyeccion && (
                <div style={{textAlign:'center', color:'var(--muted)', fontSize:12, marginTop:8}}>
                  Sin CxC ni CxP con vencimiento en los próximos 90 días
                </div>
              )}
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
              <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th>Conciliado</th><th>Vinculado a</th><th></th></tr></thead>
              <tbody>{(movimientosBanco||[]).map((m,i) => (
                <tr key={m.id||i}>
                  <td>{m.fecha}</td>
                  <td>{m.descripcion || m.desc}</td>
                  <td><span className={'badge '+(m.tipo==='credito'?'badge-green':'badge-orange')}>{m.tipo==='credito'?'Crédito':'Débito'}</span></td>
                  <td className="num" style={{color:m.tipo==='credito'?'var(--green)':'var(--fg)'}}>{m.tipo==='credito'?'+':'-'}{moneyCurrency(m.monto, m.moneda)}</td>
                  <td>{m.conciliado ? <span className="badge badge-green">{I.check} Sí</span> : <span className="badge badge-gray">No</span>}</td>
                  <td className="text-muted mono" style={{fontSize:11}}>{m.vinculado_id ? `${m.vinculado_tipo}:${m.vinculado_id}` : '—'}</td>
                  <td>{m.conciliado && <button className="btn btn-sm btn-secondary" onClick={() => deshacerConciliacionBanco?.(m.id)}>Deshacer</button>}</td>
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
                <div><strong>Cuenta bancaria:</strong> {cuentaBancoMovSel ? `${cuentaBancoMovSel.alias || cuentaBancoMovSel.nombre} · ${cuentaBancoMovSel.banco} · ${cuentaBancoMovSel.moneda}` : 'Sin cuenta en extracto'}</div>
              </div>

              {requiereTcMatch && (
                <div style={{marginTop:12, padding:10, background:'rgba(0,180,216,0.08)', borderRadius:8, border:'1px solid rgba(0,180,216,0.25)', fontSize:12}}>
                  <strong>Conversión a moneda de cuenta:</strong>{' '}
                  TC {tcPreviewMatch ? Number(tcPreviewMatch).toFixed(4) : 'por fecha del movimiento'} · equivalente {moneyCurrency(equivalentePreviewMatch || 0, cuentaBancoMovSel.moneda)}
                </div>
              )}

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

      {panelCuentaBancaria && (
        <>
          <div className="side-panel-backdrop" onClick={cerrarNuevaCuentaBancaria} />
          <div className="side-panel" style={{width:'min(520px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Cuentas bancarias</div>
                <div style={{fontSize:22, fontWeight:700}}>Agregar cuenta</div>
              </div>
              <button className="icon-btn" onClick={cerrarNuevaCuentaBancaria}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarNuevaCuentaBancaria} data-local-form="true">
              <div className="grid-2" style={{gap:12}}>
                <div className="input-group"><label>Nombre / Alias *</label><input className="input" value={formCuentaBancaria.nombre} onChange={setCuentaBancariaField('nombre')} placeholder="Interbank USD principal" required /></div>
                <div className="input-group"><label>Banco *</label><input className="input" value={formCuentaBancaria.banco} onChange={setCuentaBancariaField('banco')} placeholder="Interbank" required /></div>
                <div className="input-group"><label>Nro. cuenta</label><input className="input" value={formCuentaBancaria.numero_cuenta} onChange={setCuentaBancariaField('numero_cuenta')} placeholder="000-000000000" /></div>
                <div className="input-group"><label>CCI</label><input className="input" value={formCuentaBancaria.cci} onChange={setCuentaBancariaField('cci')} placeholder="00000000000000000000" /></div>
                <div className="input-group"><label>Moneda</label><select className="select" value={formCuentaBancaria.moneda} onChange={setCuentaBancariaField('moneda')}><option value="PEN">PEN</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div>
                <div className="input-group"><label>Tipo</label><select className="select" value={formCuentaBancaria.tipo} onChange={setCuentaBancariaField('tipo')}><option value="corriente">Corriente</option><option value="ahorros">Ahorros</option><option value="recaudadora">Recaudadora</option><option value="caja_chica">Caja chica</option></select></div>
                <div className="input-group" style={{gridColumn:'1/-1'}}><label>Saldo inicial ({formCuentaBancaria.moneda})</label><input className="input" type="number" step="0.01" value={formCuentaBancaria.saldo_inicial} onChange={setCuentaBancariaField('saldo_inicial')} placeholder="0.00 - dejar en blanco si la cuenta empieza desde cero" /></div>
              </div>
              <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:18}}>
                <button type="button" className="btn btn-secondary" onClick={cerrarNuevaCuentaBancaria}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={savingCuentaBancaria}>{I.plus} {savingCuentaBancaria ? 'Guardando...' : 'Agregar cuenta'}</button>
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
  const { comprasGastos, ots, empresa, centrosCosto, centrosBeneficio, tipoCambioHoy } = useApp();
  const [cecosSel, setCecosSel] = useState([]);
  const [cebesSel, setCebesSel] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [erData, setErData] = useState(null);
  const [tcPeriodo, setTcPeriodo] = useState(null);
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
  }, [supabaseMode, canFin, empresa?.id, periodo, cecosSel, cebesSel, comprasGastos?.length]);

  useEffect(() => {
    const currentPeriodo = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if (periodo === currentPeriodo || !supabaseMode) {
      setTcPeriodo(null);
      return;
    }
    const [y, m] = periodo.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0));
    const fechaFin = lastDay.toISOString().split('T')[0];
    let cancelled = false;
    getSupabaseClient().then(sb => getTipoCambioPorFecha(fechaFin, sb)).then(tc => {
      if (!cancelled) setTcPeriodo(tc?.usd ? Math.round(100 / tc.usd) / 100 : null);
    }).catch(() => { if (!cancelled) setTcPeriodo(null); });
    return () => { cancelled = true; };
  }, [periodo, supabaseMode]);

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
  const ebitda = data?.ebitda || mockErData.ebitda;
  const ebit   = data?.ebit   || mockErData.ebit;
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

  const tcFallback = tipoCambioHoy?.usd ? Math.round(100 / tipoCambioHoy.usd) / 100 : null;
  const tcRef = tcPeriodo ?? tcFallback;
  const erRefValue = totals => erAmount(totals, 'PEN') + erAmount(totals, 'USD') * (tcRef || 0);
  const tcRefLabel = tcRef ? `S/ ${tcRef.toFixed(2)}` : '';
  const tooltipRef = tcRef
    ? `Valor referencial calculado al TC de S/ ${tcRef.toFixed(2)} del período. No usar para reportes formales ni declaraciones tributarias.`
    : '';

  const toggle = k => setExpanded(e => ({ ...e, [k]: !e[k] }));
  const MoneyCols = ({ totals, neg, marginTotals }) => {
    const refVal = tcRef ? erRefValue(totals) : null;
    return (
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
        {tcRef && (
          <div className="num" style={{ minWidth:120, textAlign:'right', borderLeft:'2px solid var(--border-subtle)', paddingLeft:8, color:'var(--fg-muted)', opacity:0.7 }}>
            {neg && refVal !== 0 ? `(${money(refVal)})` : money(refVal)}
          </div>
        )}
      </>
    );
  };
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
          {tcRef && (
            <div className="num" style={{ minWidth:120, textAlign:'right', borderLeft:'2px solid var(--border-subtle)', paddingLeft:8, fontWeight:400, fontSize:11, color:'var(--fg-muted)' }}>
              <span>Total S/ (ref.)</span>{' '}
              <span style={{ cursor:'help', display:'inline-flex', alignItems:'center', verticalAlign:'middle' }} title={tooltipRef}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width={11} height={11} style={{ strokeWidth:2, flexShrink:0 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              </span>
            </div>
          )}
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
              {tcRef && (
                <div className="num" style={{ minWidth:120, textAlign:'right', borderLeft:'2px solid rgba(255,255,255,0.15)', paddingLeft:8, color:'rgba(255,255,255,0.5)', fontFamily:'Sora' }}>
                  <div style={{ fontSize:14, fontWeight:600 }}>{money(erRefValue(resultadoNeto))} <span style={{ fontSize:10, fontWeight:400, opacity:0.8 }}>(ref.)</span></div>
                  <div style={{ fontSize:9, fontWeight:400, marginTop:2 }}>TC {tcRefLabel}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="text-muted mt-4" style={{ fontSize:12, textAlign:'center' }}>
        Haz clic en las filas principales para expandir el detalle por concepto. El ER no convierte entre PEN y USD.
        {tcRef && <span> · La columna Total S/ es referencial y usa el TC {tcRefLabel} del período. El ER no consolida monedas para fines contables.</span>}
      </div>
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

function CajaChicaLegacy() {
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

const CC_FONDO_FORM = {
  nombre: '',
  responsable_id: '',
  monto_asignado: '',
  monto_minimo: '',
  cuenta_bancaria_id: '',
  moneda: 'PEN',
  fecha_apertura: new Date().toISOString().slice(0, 10),
  notas: '',
};

function CajaChica() {
  const { empresa, authUser, role, cajaChica, centrosCosto, cuentasBancarias, usuarios, addNotificacion } = useApp();
  const empresaId = empresa?.id;
  const [tab, setTab] = useState('fondos');
  const [fondos, setFondos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [panelNuevoEgreso, setPanelNuevoEgreso] = useState(false);
  const [preconfigNE, setPreconfigNE] = useState(null);
  const [panelFondo, setPanelFondo] = useState(false);
  const [formFondo, setFormFondo] = useState(CC_FONDO_FORM);
  const [savingFondo, setSavingFondo] = useState(false);
  const [fondoSelId, setFondoSelId] = useState(null);
  const [rendicionForm, setRendicionForm] = useState(null);
  const [arqueoFondo, setArqueoFondo] = useState(null);
  const [arqueoForm, setArqueoForm] = useState({ efectivo_declarado: '', comprobantes_pendientes: '', justificacion: '' });
  const [fFondo, setFFondo] = useState('');
  const [fPeriodo, setFPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [fCeco, setFCeco] = useState('');

  const perm = accion => {
    const p = role?.permisos || {};
    const current = p[accion];
    return Boolean(p.todo || p.tenant_admin || p.ver_finanzas || current === true || current?.includes?.('caja'));
  };
  const puedeCrear = perm('crear');
  const puedeAprobar = perm('aprobar');
  const puedeGestionar = perm('editar') || perm('anular');

  const usuariosEmpresa = useMemo(() => (usuarios || []).filter(u => !u.empresa_id || u.empresa_id === empresaId), [usuarios, empresaId]);
  const cuentasActivas = useMemo(() => (cuentasBancarias || []).filter(c => !['inactivo', 'eliminado'].includes(c.estado)), [cuentasBancarias]);
  const fondoSel = fondos.find(f => f.id === fondoSelId) || null;
  const usuarioDe = id => usuariosEmpresa.find(u => u.id === id);
  const cuentaDe = id => (cuentasBancarias || []).find(c => c.id === id);
  const cecoDe = id => (centrosCosto || []).find(c => c.id === id);
  const esResponsable = fondo => {
    const u = usuarioDe(fondo?.responsable_id);
    return Boolean(fondo?.responsable_id && (
      fondo.responsable_id === authUser?.id ||
      String(u?.email || '').toLowerCase() === String(authUser?.email || '').toLowerCase()
    ));
  };

  const construirMock = () => {
    const activos = (cajaChica || []).filter(c => c.estado !== 'anulado');
    const gastado = activos.reduce((s, c) => s + Number(c.monto || 0), 0);
    const moneda = empresa?.moneda || 'PEN';
    const fondo = {
      id: 'mock_fondo_general',
      empresa_id: empresaId,
      nombre: 'Caja Chica General',
      responsable_id: authUser?.id || null,
      monto_asignado: Math.max(5000, gastado),
      monto_minimo: 500,
      moneda,
      estado: 'activo',
      fecha_apertura: new Date().toISOString().slice(0, 10),
      saldo_disponible: Math.max(0, 5000 - gastado),
      monto_gastado: gastado,
      monto_repuesto: 0,
      requiere_reposicion: Math.max(0, 5000 - gastado) <= 500,
    };
    return {
      fondos: [fondo],
      movimientos: activos.map(c => ({
        ...c,
        fondo_id: c.fondo_id || fondo.id,
        fondo_nombre: fondo.nombre,
        tipo_movimiento: 'egreso',
        fecha_movimiento: c.fecha,
        monto_movimiento: -Number(c.monto || 0),
      })),
    };
  };

  const cargar = async () => {
    if (!empresaId) return;
    if (!isSupabaseMode()) {
      const mock = construirMock();
      setFondos(mock.fondos);
      setMovimientos(mock.movimientos);
      return;
    }
    setLoading(true);
    try {
      const [fondosData, movsData] = await Promise.all([
        cajaChicaService.listarFondos(empresaId),
        cajaChicaService.listarMovimientos(empresaId),
      ]);
      setFondos(fondosData || []);
      setMovimientos(movsData || []);
    } catch (err) {
      console.warn('[CajaChica] fondos:', err?.message || err);
      setFondos([]);
      setMovimientos((cajaChica || []).map(c => ({
        ...c,
        tipo_movimiento: 'egreso',
        fecha_movimiento: c.fecha,
        monto_movimiento: -Number(c.monto || 0),
      })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [empresaId, cajaChica.length]);

  const fondosActivos = fondos.filter(f => f.estado === 'activo');
  const fondosAlerta = fondosActivos.filter(f => f.requiere_reposicion);
  const saldoTotal = fondosActivos.reduce((s, f) => s + Number(f.saldo_disponible || 0), 0);
  const asignadoTotal = fondosActivos.reduce((s, f) => s + Number(f.monto_asignado || 0), 0);
  const egresosMes = movimientos
    .filter(m => m.tipo_movimiento === 'egreso' && String(m.fecha_movimiento || m.fecha || '').slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, m) => s + Math.abs(Number(m.monto_movimiento || m.monto || 0)), 0);

  const abrirEgreso = fondo => {
    setPreconfigNE({ ...CC_PRECONFIG_RAPIDO, form: { ...CC_PRECONFIG_RAPIDO.form, fondo_caja_chica_id: fondo?.id || '' } });
    setPanelNuevoEgreso(true);
  };
  const cerrarNuevoEgreso = () => {
    setPanelNuevoEgreso(false);
    setPreconfigNE(null);
    cargar();
  };

  const guardarFondo = async () => {
    const monto = Number(formFondo.monto_asignado || 0);
    if (!formFondo.nombre.trim() || monto <= 0) return;
    setSavingFondo(true);
    try {
      const payload = {
        empresa_id: empresaId,
        nombre: formFondo.nombre.trim(),
        responsable_id: formFondo.responsable_id || null,
        monto_asignado: monto,
        monto_minimo: Number(formFondo.monto_minimo || 0),
        cuenta_bancaria_id: formFondo.cuenta_bancaria_id || null,
        moneda: formFondo.moneda || empresa?.moneda || 'PEN',
        fecha_apertura: formFondo.fecha_apertura,
        notas: formFondo.notas || null,
        creado_por: authUser?.id || null,
      };
      if (isSupabaseMode()) {
        await cajaChicaService.crearFondo(payload);
        await cargar();
      } else {
        setFondos(prev => [{ ...payload, id: `ccf_${Date.now()}`, estado: 'activo', saldo_disponible: monto, monto_gastado: 0, monto_repuesto: 0 }, ...prev]);
      }
      setPanelFondo(false);
      addNotificacion('Fondo de caja chica creado.');
    } catch (err) {
      addNotificacion(`No se pudo crear el fondo: ${err?.message || err}`);
    } finally {
      setSavingFondo(false);
    }
  };

  const solicitarRendicion = async fondo => {
    const monto = Number(rendicionForm?.monto_solicitado || 0);
    if (!monto) return;
    try {
      if (isSupabaseMode()) {
        await cajaChicaService.solicitarRendicion({
          empresa_id: empresaId,
          fondo_id: fondo.id,
          periodo_inicio: rendicionForm.periodo_inicio,
          periodo_fin: rendicionForm.periodo_fin,
          monto_solicitado: monto,
          moneda: fondo.moneda || empresa?.moneda || 'PEN',
          creado_por: authUser?.id || null,
        });
        await cargar();
      }
      setRendicionForm(null);
      addNotificacion('Rendicion solicitada.');
    } catch (err) {
      addNotificacion(`No se pudo solicitar rendicion: ${err?.message || err}`);
    }
  };

  const procesarRendicion = async (rendicion, accion) => {
    const monto = accion === 'aprobar' ? Number(window.prompt('Monto aprobado', rendicion.monto_solicitado) || 0) : 0;
    if (accion === 'aprobar' && monto <= 0) return;
    const referencia = accion === 'aprobar' ? window.prompt('Referencia de transferencia', '') : '';
    try {
      if (isSupabaseMode()) {
        await cajaChicaService.procesarRendicion(rendicion.id, {
          accion,
          monto_aprobado: monto,
          aprobado_por: authUser?.id || null,
          transferencia_reposicion_ref: referencia,
          cuenta_bancaria_id: rendicion.cuenta_bancaria_id || fondoSel?.cuenta_bancaria_id || null,
        });
        await cargar();
      }
      addNotificacion(accion === 'aprobar' ? 'Rendicion aprobada y reposicion registrada.' : 'Rendicion rechazada.');
    } catch (err) {
      addNotificacion(`No se pudo procesar rendicion: ${err?.message || err}`);
    }
  };

  const registrarArqueo = async () => {
    try {
      if (isSupabaseMode()) {
        await cajaChicaService.registrarArqueo({
          empresa_id: empresaId,
          fondo_id: arqueoFondo.id,
          saldo_sistema: Number(arqueoFondo.saldo_disponible || 0),
          efectivo_declarado: Number(arqueoForm.efectivo_declarado || 0),
          comprobantes_pendientes: Number(arqueoForm.comprobantes_pendientes || 0),
          justificacion: arqueoForm.justificacion || null,
          arqueado_por: authUser?.id || null,
        });
        await cargar();
      }
      setArqueoFondo(null);
      setArqueoForm({ efectivo_declarado: '', comprobantes_pendientes: '', justificacion: '' });
      addNotificacion('Arqueo registrado.');
    } catch (err) {
      addNotificacion(err?.message || 'No se pudo registrar el arqueo.');
    }
  };

  const cerrarFondo = async fondo => {
    if (!window.confirm(`Cerrar el fondo ${fondo.nombre}?`)) return;
    const remanente = Number(window.prompt('Remanente devuelto a banco', fondo.saldo_disponible || 0) || 0);
    try {
      if (isSupabaseMode()) {
        await cajaChicaService.cerrarFondo(fondo.id, { remanente, cuenta_bancaria_id: fondo.cuenta_bancaria_id || null, cerrado_por: authUser?.id || null });
        await cargar();
      } else {
        setFondos(prev => prev.map(f => f.id === fondo.id ? { ...f, estado: 'cerrado', fecha_cierre: new Date().toISOString().slice(0, 10) } : f));
      }
      setFondoSelId(null);
      addNotificacion('Fondo cerrado.');
    } catch (err) {
      addNotificacion(`No se pudo cerrar el fondo: ${err?.message || err}`);
    }
  };

  const movsFiltrados = movimientos.filter(m => {
    if (fFondo && m.fondo_id !== fFondo) return false;
    if (fPeriodo && String(m.fecha_movimiento || m.fecha || '').slice(0, 7) !== fPeriodo) return false;
    if (fCeco && (m.ceco_id || m.centro_costo_id) !== fCeco) return false;
    return true;
  });
  const historialFondo = fondoSel ? movimientos.filter(m => m.fondo_id === fondoSel.id) : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Caja Chica</h1>
          <div className="page-sub">Fondos administrados con saldo, rendicion, reposicion y arqueo</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {puedeCrear && <button className="btn btn-secondary" style={{fontSize:13}} onClick={() => { setFormFondo({ ...CC_FONDO_FORM, moneda: empresa?.moneda || 'PEN' }); setPanelFondo(true); }}>{I.plus} Nuevo fondo</button>}
          <button className="btn btn-primary" onClick={() => abrirEgreso(null)}>{I.plus} Nuevo egreso</button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Saldo disponible</div><div className="kpi-value" style={{color:'var(--cyan)'}}>{money(saldoTotal)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Asignado</div><div className="kpi-value">{money(asignadoTotal)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Egresos mes</div><div className="kpi-value">{money(egresosMes)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Alertas</div><div className="kpi-value" style={{color:fondosAlerta.length?'var(--orange)':'var(--green)'}}>{fondosAlerta.length}</div></div>
      </div>

      {fondosAlerta.length > 0 && (
        <div className="card mt-6" style={{ padding: '14px 18px', borderColor: 'color-mix(in srgb, var(--orange) 45%, var(--border))', background: 'color-mix(in srgb, var(--orange) 7%, var(--surface))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: 'var(--orange)' }}>{I.alert} Fondos en minimo de reposicion</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>{fondosAlerta.map(f => `${f.nombre}: ${moneyCurrency(f.saldo_disponible, f.moneda)}`).join(' · ')}</div>
        </div>
      )}

      <div className="card mt-6" style={{padding:0}}>
        <div style={{display:'flex',gap:0,padding:'4px 20px'}}>
          {[{key:'fondos',label:'Fondos'}, {key:'movimientos',label:'Movimientos'}].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{padding:'10px 18px',border:'none',background:'none',cursor:'pointer',fontWeight:tab===t.key?700:400,borderBottom:tab===t.key?'2px solid var(--cyan)':'2px solid transparent',color:tab===t.key?'var(--cyan)':'var(--fg-muted)',fontSize:13}}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'fondos' && (
        <div className="card mt-6">
          <div className="card-head"><h3>Fondos administrados</h3><span className="badge badge-gray">{fondosActivos.length} activos</span></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Fondo</th><th>Responsable</th><th>Cuenta origen</th><th className="num">Asignado</th><th className="num">Disponible</th><th>Minimo</th><th>Estado</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" className="text-center text-muted" style={{padding:28}}>Cargando fondos...</td></tr>
                ) : fondos.length ? fondos.map(f => {
                  const responsable = usuarioDe(f.responsable_id);
                  const cuenta = cuentaDe(f.cuenta_bancaria_id);
                  return (
                    <tr key={f.id} className="hover-row" onClick={() => setFondoSelId(f.id)} style={{cursor:'pointer'}}>
                      <td><strong>{f.nombre}</strong>{f.requiere_reposicion && <span className="badge badge-orange" style={{marginLeft:8}}>Reponer</span>}</td>
                      <td className="text-muted">{responsable?.nombre || responsable?.email || 'Sin asignar'}</td>
                      <td className="text-muted">{cuenta ? `${cuenta.banco || ''} ${cuenta.nombre || ''}`.trim() : 'Sin cuenta'}</td>
                      <td className="num">{moneyCurrency(f.monto_asignado, f.moneda)}</td>
                      <td className="num"><strong style={{color:f.requiere_reposicion?'var(--orange)':'var(--green)'}}>{moneyCurrency(f.saldo_disponible, f.moneda)}</strong></td>
                      <td>{moneyCurrency(f.monto_minimo, f.moneda)}</td>
                      <td><span className={`badge ${f.estado === 'activo' ? 'badge-green' : f.estado === 'cerrado' ? 'badge-gray' : 'badge-orange'}`}>{f.estado}</span></td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan="7" className="text-center text-muted" style={{padding:32}}>Sin fondos configurados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'movimientos' && (
        <div className="card mt-6">
          <div className="card-head" style={{alignItems:'flex-end'}}>
            <div><h3>Movimientos consolidados</h3><div style={{fontSize:12,color:'var(--fg-muted)'}}>Egresos, reposiciones y registros legacy.</div></div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
              <select className="select" style={{width:180}} value={fFondo} onChange={e=>setFFondo(e.target.value)}>
                <option value="">Todos los fondos</option>
                {fondos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
              <input className="input" style={{width:135}} type="month" value={fPeriodo} onChange={e=>setFPeriodo(e.target.value)} />
              <select className="select" style={{width:180}} value={fCeco} onChange={e=>setFCeco(e.target.value)}>
                <option value="">Todos los CECO</option>
                {(centrosCosto || []).map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Fondo</th><th>Tipo</th><th>Concepto</th><th>CECO</th><th>Comprobante</th><th className="num">Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {movsFiltrados.length ? movsFiltrados.map(m => {
                  const tipo = m.tipo_movimiento || 'egreso';
                  const ceco = cecoDe(m.ceco_id || m.centro_costo_id);
                  return (
                    <tr key={`${tipo}_${m.id}`}>
                      <td className="text-muted">{String(m.fecha_movimiento || m.fecha || '').slice(0,10)}</td>
                      <td>{m.fondo_nombre || fondos.find(f => f.id === m.fondo_id)?.nombre || 'Legacy sin fondo'}</td>
                      <td><span className={`badge ${tipo === 'reposicion' ? 'badge-green' : 'badge-cyan'}`}>{tipo}</span></td>
                      <td>{m.concepto || m.descripcion}</td>
                      <td className="text-muted">{ceco?.nombre || '-'}</td>
                      <td className="mono text-muted">{m.num_comprobante || m.transferencia_reposicion_ref || '-'}</td>
                      <td className="num"><strong>{moneyCurrency(Math.abs(Number(m.monto_movimiento || m.monto || 0)), m.moneda)}</strong></td>
                      <td><span className={`badge ${m.estado === 'anulado' || m.estado === 'rechazada' ? 'badge-red' : 'badge-green'}`}>{m.estado || 'registrado'}</span></td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan="8" className="text-center text-muted" style={{padding:32}}>Sin movimientos para los filtros seleccionados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {fondoSel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setFondoSelId(null)} />
          <div className="side-panel" style={{width:'min(760px,96vw)'}}>
            <div className="side-panel-head">
              <div><div className="eyebrow">Fondo caja chica</div><div className="font-display" style={{fontSize:20,fontWeight:700}}>{fondoSel.nombre}</div></div>
              <button className="icon-btn" onClick={() => setFondoSelId(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:16}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                <div style={{padding:14,border:'1px solid var(--border)',borderRadius:8}}><div className="kpi-label">Disponible</div><div className="kpi-value" style={{fontSize:24,color:fondoSel.requiere_reposicion?'var(--orange)':'var(--green)'}}>{moneyCurrency(fondoSel.saldo_disponible, fondoSel.moneda)}</div></div>
                <div style={{padding:14,border:'1px solid var(--border)',borderRadius:8}}><div className="kpi-label">Asignado</div><div className="kpi-value" style={{fontSize:20}}>{moneyCurrency(fondoSel.monto_asignado, fondoSel.moneda)}</div></div>
                <div style={{padding:14,border:'1px solid var(--border)',borderRadius:8}}><div className="kpi-label">Minimo</div><div className="kpi-value" style={{fontSize:20}}>{moneyCurrency(fondoSel.monto_minimo, fondoSel.moneda)}</div></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13}}>
                <div><span className="text-muted">Responsable: </span><strong>{usuarioDe(fondoSel.responsable_id)?.nombre || usuarioDe(fondoSel.responsable_id)?.email || 'Sin asignar'}</strong></div>
                <div><span className="text-muted">Cuenta origen: </span><strong>{cuentaDe(fondoSel.cuenta_bancaria_id)?.nombre || 'Sin cuenta'}</strong></div>
                <div><span className="text-muted">Apertura: </span><strong>{fondoSel.fecha_apertura}</strong></div>
                <div><span className="text-muted">Estado: </span><span className={`badge ${fondoSel.estado === 'activo' ? 'badge-green' : 'badge-gray'}`}>{fondoSel.estado}</span></div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button className="btn btn-primary" onClick={() => abrirEgreso(fondoSel)}>{I.plus} Nuevo egreso</button>
                {(esResponsable(fondoSel) || puedeCrear) && <button className="btn btn-secondary" onClick={() => setRendicionForm({ periodo_inicio: `${new Date().toISOString().slice(0,7)}-01`, periodo_fin: new Date().toISOString().slice(0,10), monto_solicitado: String(fondoSel.monto_gastado || 0) })}>{I.receipt} Solicitar rendicion</button>}
                {puedeGestionar && <button className="btn btn-secondary" onClick={() => { setArqueoFondo(fondoSel); setArqueoForm({ efectivo_declarado: fondoSel.saldo_disponible || '', comprobantes_pendientes: '', justificacion: '' }); }}>{I.clipboard} Arqueo</button>}
                {puedeGestionar && fondoSel.estado === 'activo' && <button className="btn btn-secondary" onClick={() => cerrarFondo(fondoSel)}>{I.x} Cerrar</button>}
              </div>
              {fondoSel.rendicion_vigente && (
                <div style={{padding:12,border:'1px solid var(--border)',borderRadius:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
                    <div><div style={{fontWeight:700}}>Rendicion vigente</div><div style={{fontSize:12,color:'var(--fg-muted)'}}>{fondoSel.rendicion_vigente.periodo_inicio} - {fondoSel.rendicion_vigente.periodo_fin} · {moneyCurrency(fondoSel.rendicion_vigente.monto_solicitado, fondoSel.moneda)}</div></div>
                    <span className="badge badge-orange">{fondoSel.rendicion_vigente.estado}</span>
                  </div>
                  {puedeAprobar && fondoSel.rendicion_vigente.estado === 'solicitada' && (
                    <div style={{marginTop:10,display:'flex',gap:8}}>
                      <button className="btn btn-primary" style={{fontSize:12}} onClick={() => procesarRendicion(fondoSel.rendicion_vigente, 'aprobar')}>Aprobar</button>
                      <button className="btn btn-secondary" style={{fontSize:12}} onClick={() => procesarRendicion(fondoSel.rendicion_vigente, 'rechazar')}>Rechazar</button>
                    </div>
                  )}
                </div>
              )}
              {rendicionForm && (
                <div style={{padding:12,border:'1px solid var(--border)',borderRadius:8}}>
                  <div style={{fontWeight:700,marginBottom:10}}>Nueva rendicion</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                    <input className="input" type="date" value={rendicionForm.periodo_inicio} onChange={e=>setRendicionForm(p=>({...p,periodo_inicio:e.target.value}))}/>
                    <input className="input" type="date" value={rendicionForm.periodo_fin} onChange={e=>setRendicionForm(p=>({...p,periodo_fin:e.target.value}))}/>
                    <input className="input" type="number" min="0" step="0.01" value={rendicionForm.monto_solicitado} onChange={e=>setRendicionForm(p=>({...p,monto_solicitado:e.target.value}))}/>
                  </div>
                  <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:10}}>
                    <button className="btn btn-secondary" style={{fontSize:12}} onClick={() => setRendicionForm(null)}>Cancelar</button>
                    <button className="btn btn-primary" style={{fontSize:12}} onClick={() => solicitarRendicion(fondoSel)}>Solicitar</button>
                  </div>
                </div>
              )}
              <div>
                <div style={{fontWeight:700,marginBottom:8}}>Historial</div>
                <div className="table-wrap" style={{border:'1px solid var(--border)',borderRadius:8}}>
                  <table className="tbl">
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th className="num">Monto</th><th>Estado</th></tr></thead>
                    <tbody>{historialFondo.length ? historialFondo.map(m => (
                      <tr key={`${m.tipo_movimiento}_${m.id}`}><td className="text-muted">{String(m.fecha_movimiento || m.fecha || '').slice(0,10)}</td><td><span className={`badge ${m.tipo_movimiento === 'reposicion' ? 'badge-green' : 'badge-cyan'}`}>{m.tipo_movimiento}</span></td><td>{m.concepto || m.descripcion}</td><td className="num"><strong>{moneyCurrency(Math.abs(Number(m.monto_movimiento || m.monto || 0)), m.moneda || fondoSel.moneda)}</strong></td><td><span className="badge badge-gray">{m.estado || 'registrado'}</span></td></tr>
                    )) : <tr><td colSpan="5" className="text-center text-muted" style={{padding:24}}>Sin movimientos vinculados.</td></tr>}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {panelFondo && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanelFondo(false)} />
          <div className="side-panel" style={{width:'min(520px,96vw)'}}>
            <div className="side-panel-head"><div><div className="eyebrow">Caja chica</div><div className="font-display" style={{fontSize:18,fontWeight:700}}>Nuevo fondo</div></div><button className="icon-btn" onClick={() => setPanelFondo(false)}>{I.x}</button></div>
            <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:14}}>
              <div className="input-group"><label>Nombre *</label><input className="input" value={formFondo.nombre} onChange={e=>setFormFondo(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Caja chica Operaciones Lima"/></div>
              <div className="input-group"><label>Responsable</label><select className="select" value={formFondo.responsable_id} onChange={e=>setFormFondo(p=>({...p,responsable_id:e.target.value}))}><option value="">- Seleccionar usuario -</option>{usuariosEmpresa.map(u=><option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}</select></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="input-group"><label>Monto asignado *</label><input className="input" type="number" min="0" step="0.01" value={formFondo.monto_asignado} onChange={e=>setFormFondo(p=>({...p,monto_asignado:e.target.value}))}/></div>
                <div className="input-group"><label>Monto minimo</label><input className="input" type="number" min="0" step="0.01" value={formFondo.monto_minimo} onChange={e=>setFormFondo(p=>({...p,monto_minimo:e.target.value}))}/></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="input-group"><label>Cuenta origen</label><select className="select" value={formFondo.cuenta_bancaria_id} onChange={e=>setFormFondo(p=>({...p,cuenta_bancaria_id:e.target.value}))}><option value="">- Sin cuenta -</option>{cuentasActivas.map(c=><option key={c.id} value={c.id}>{c.banco} - {c.nombre}</option>)}</select></div>
                <div className="input-group"><label>Moneda</label><select className="select" value={formFondo.moneda} onChange={e=>setFormFondo(p=>({...p,moneda:e.target.value}))}><option value="PEN">PEN</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div>
              </div>
              <div className="input-group"><label>Fecha apertura</label><input className="input" type="date" value={formFondo.fecha_apertura} onChange={e=>setFormFondo(p=>({...p,fecha_apertura:e.target.value}))}/></div>
              <div className="input-group"><label>Notas</label><textarea className="input" rows={3} value={formFondo.notas} onChange={e=>setFormFondo(p=>({...p,notas:e.target.value}))}/></div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button className="btn btn-secondary" onClick={() => setPanelFondo(false)}>Cancelar</button><button className="btn btn-primary" disabled={savingFondo || !formFondo.nombre.trim() || !Number(formFondo.monto_asignado || 0)} onClick={guardarFondo}>{savingFondo ? 'Guardando...' : 'Crear fondo'}</button></div>
            </div>
          </div>
        </>
      )}

      {arqueoFondo && (
        <>
          <div className="side-panel-backdrop" onClick={() => setArqueoFondo(null)} />
          <div className="side-panel" style={{width:'min(460px,96vw)'}}>
            <div className="side-panel-head"><div><div className="eyebrow">Arqueo</div><div className="font-display" style={{fontSize:18,fontWeight:700}}>{arqueoFondo.nombre}</div></div><button className="icon-btn" onClick={() => setArqueoFondo(null)}>{I.x}</button></div>
            <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:14}}>
              <div style={{padding:12,border:'1px solid var(--border)',borderRadius:8}}><div className="kpi-label">Saldo sistema</div><div style={{fontSize:22,fontWeight:700}}>{moneyCurrency(arqueoFondo.saldo_disponible, arqueoFondo.moneda)}</div></div>
              <div className="input-group"><label>Efectivo declarado</label><input className="input" type="number" min="0" step="0.01" value={arqueoForm.efectivo_declarado} onChange={e=>setArqueoForm(p=>({...p,efectivo_declarado:e.target.value}))}/></div>
              <div className="input-group"><label>Comprobantes pendientes</label><input className="input" type="number" min="0" step="0.01" value={arqueoForm.comprobantes_pendientes} onChange={e=>setArqueoForm(p=>({...p,comprobantes_pendientes:e.target.value}))}/></div>
              <div className="input-group"><label>Justificacion si hay diferencia</label><textarea className="input" rows={3} value={arqueoForm.justificacion} onChange={e=>setArqueoForm(p=>({...p,justificacion:e.target.value}))}/></div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button className="btn btn-secondary" onClick={() => setArqueoFondo(null)}>Cancelar</button><button className="btn btn-primary" onClick={registrarArqueo}>Registrar arqueo</button></div>
            </div>
          </div>
        </>
      )}

      {panelNuevoEgreso && (
        <NuevoEgreso origen="caja_chica" preconfig={preconfigNE} onClose={cerrarNuevoEgreso} onSaved={cerrarNuevoEgreso} />
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
  const { cxp, cxpPagos, proveedores, personalAdmin, personalOperativo, partes, recibosHonorarios, ots, comprasGastos = [], registrarPagoCxP, generarCxP, crearGasto, addNotificacion, centrosCosto, setCxp, empresa } = useApp();
  const cecos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const [erCatOpts, setErCatOpts] = useState([]);
  const [erCategorias, setErCategorias] = useState([]);
  useEffect(() => {
    cargarConfiguracionER(empresa?.id).then(cats => {
      setErCategorias(cats || []);
      setErCatOpts((cats || []).map(c => c.nombre));
    });
  }, [empresa?.id]);
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
  const [rheTipoEmisor, setRheTipoEmisor] = useState('');
  const [rheColaboradorId, setRheColaboradorId] = useState('');
  const [rheTrabajoFacturable, setRheTrabajoFacturable] = useState(true);
  const [rheOtId, setRheOtId] = useState('');
  const [rheRucAviso, setRheRucAviso] = useState(null);
  const [rhePeriodoServicio, setRhePeriodoServicio] = useState(() => periodoRhePrevio(today));
  const [rheReferenciaHoras, setRheReferenciaHoras] = useState(null);
  const [rheReferenciaLoading, setRheReferenciaLoading] = useState(false);
  const [rheReferenciaError, setRheReferenciaError] = useState('');
  const [rheMontoEditadoManual, setRheMontoEditadoManual] = useState(false);
  const [cxpCategoriaEr, setCxpCategoriaEr] = useState('');
  const [cxpCentroCostoId, setCxpCentroCostoId] = useState('');
  const [cxpYaRegistrado, setCxpYaRegistrado] = useState(false);
  // Edición de clasificación ER en ficha existente
  const [fichaClasifCategoria, setFichaClasifCategoria] = useState('');
  const [fichaClasifCeco, setFichaClasifCeco] = useState('');
  const [guardandoClasif, setGuardandoClasif] = useState(false);
  const rheRetencion = Math.round(Number(rheMontoBruto || 0) * 0.08 * 100) / 100;
  const rheMontoNeto = Math.round((Number(rheMontoBruto || 0) - rheRetencion) * 100) / 100;
  const colaboradoresHonorarios = [
    ...(personalAdmin||[]).filter(p => p.estado === 'activo' && (p.tipo_contrato === 'Honorarios' || p.ruc_colaborador)),
    ...(personalOperativo||[]).filter(p => p.estado !== 'inactivo' && (p.tipo_contrato === 'Honorarios' || p.ruc_colaborador)),
  ];
  const rheColaboradorSel = colaboradoresHonorarios.find(p => p.id === rheColaboradorId) || null;
  const rheColaboradorTasaIR = (() => {
    if (!rheColaboradorSel) return 0.08;
    const suspVigente = Boolean(rheColaboradorSel.suspension_retenciones) &&
      (!rheColaboradorSel.vencimiento_suspension || rheColaboradorSel.vencimiento_suspension >= today);
    if (suspVigente) return 0;
    return Number(rheColaboradorSel.retencion_ir ?? rheColaboradorSel.retencion_ir_comision ?? 8) / 100;
  })();
  const rheRetencionInterna = Math.round(Number(rheMontoBruto || 0) * rheColaboradorTasaIR * 100) / 100;
  const rheMontoNetoInterno = Math.round((Number(rheMontoBruto || 0) - rheRetencionInterna) * 100) / 100;
  const rheCategoriaManoObraCosto = (erCategorias || []).find(c => c.tipo_sistema === 'mano_obra' && c.seccion === 'costo_ventas') || null;
  const rheCategoriaManoObraGasto = (erCategorias || []).find(c => c.tipo_sistema === 'mano_obra' && c.seccion === 'gastos_operativos') || null;
  const rheCategoriaManoObra = rheTipoEmisor === 'interno'
    ? (rheTrabajoFacturable ? rheCategoriaManoObraCosto : rheCategoriaManoObraGasto)
    : null;
  const rheFaltaCategoriaManoObra = rheTipoEmisor === 'interno' && !rheCategoriaManoObra;
  const rheCategoriaErAuto = rheTipoEmisor === 'interno' ? (rheCategoriaManoObra?.nombre || '') : '';
  const rheCategoriaErAsignada = rheTipoEmisor === 'interno' ? (rheCategoriaErAuto || cxpCategoriaEr || '') : '';
  const rheSinCategoriasManoObra = rheTipoEmisor === 'interno' && !rheCategoriaManoObraCosto && !rheCategoriaManoObraGasto;
  const rheDestinoErLabel = rheTrabajoFacturable ? 'Costo de Ventas' : 'Gastos Operativos';
  const rhePeriodoRango = rangoFechasRhe(rhePeriodoServicio);
  const rheTarifaHora = tarifaHoraColaborador(rheColaboradorSel);
  const rheHorasTotal = Number(rheReferenciaHoras?.horasTotal || 0);
  const rheMontoSugerido = rheHorasTotal > 0 && rheTarifaHora > 0
    ? Math.round(rheHorasTotal * rheTarifaHora * 100) / 100
    : 0;
  const rheMontoIngresado = Number(rheMontoBruto || 0);
  const rheAdvertenciaDesviacion = rheMontoSugerido > 0 && rheMontoIngresado > 0
    && Math.abs(rheMontoIngresado - rheMontoSugerido) / rheMontoSugerido > RHE_DESVIACION_UMBRAL;
  const rheYearOptions = useMemo(() => {
    const current = new Date(`${today}T00:00:00`).getFullYear();
    return Array.from({ length: 6 }, (_, idx) => String(current - 4 + idx));
  }, [today]);
  const actualizarPeriodoRhe = cambios => {
    setRhePeriodoServicio(prev => ({ ...prev, ...cambios }));
    setRheMontoEditadoManual(false);
    setRheMontoBruto('');
  };
  useEffect(() => {
    if (rheTipoEmisor !== 'externo' || rheRuc.length !== 11) { setRheRucAviso(null); return; }
    const match = [...(personalAdmin||[]), ...(personalOperativo||[])].find(
      p => p.ruc_colaborador === rheRuc && p.estado !== 'inactivo'
    );
    setRheRucAviso(match ? { nombre: match.nombre, id: match.id } : null);
  }, [rheRuc, rheTipoEmisor, personalAdmin, personalOperativo]);

  useEffect(() => {
    if (rheTipoEmisor !== 'interno' || !empresa?.id || !rheColaboradorId || !rhePeriodoRango.valido) {
      setRheReferenciaHoras(null);
      setRheReferenciaLoading(false);
      setRheReferenciaError('');
      return;
    }
    if (!isSupabaseMode()) {
      const partesPeriodo = (partes || []).filter(p =>
        p.empresa_id === empresa.id &&
        (p.tecnico_id || p.personal_id || p.tecnico) === rheColaboradorId &&
        p.estado === 'aprobado' &&
        (p.fecha || p.fecha_parte || p.created_at?.slice?.(0, 10)) >= rhePeriodoRango.inicio &&
        (p.fecha || p.fecha_parte || p.created_at?.slice?.(0, 10)) <= rhePeriodoRango.fin
      );
      const horasPartes = Math.round(partesPeriodo.reduce((sum, p) => sum + Number(p.horas ?? p.horas_normales ?? p.horas_total ?? 0), 0) * 100) / 100;
      const existeEnCxp = (cxp || []).some(c =>
        c.empresa_id === empresa.id &&
        c.personal_id === rheColaboradorId &&
        c.tipo_comprobante === 'RHE' &&
        c.fecha_emision <= rhePeriodoRango.fin &&
        c.fecha_vencimiento >= rhePeriodoRango.inicio
      );
      const existeEnRecibos = (recibosHonorarios || []).some(r =>
        r.empresa_id === empresa.id &&
        r.personal_id === rheColaboradorId &&
        r.periodo >= rhePeriodoRango.inicio.slice(0, 7) &&
        r.periodo <= rhePeriodoRango.fin.slice(0, 7)
      );
      setRheReferenciaHoras({
        horasPartes,
        horasTareos: 0,
        horasTotal: horasPartes,
        existeRhePeriodo: existeEnCxp || existeEnRecibos,
      });
      setRheReferenciaLoading(false);
      setRheReferenciaError('');
      return;
    }
    let cancelado = false;
    setRheReferenciaLoading(true);
    setRheReferenciaError('');
    finanzasService.getReferenciaRheInterno({
      empresaId: empresa.id,
      personalId: rheColaboradorId,
      periodoInicio: rhePeriodoRango.inicio,
      periodoFin: rhePeriodoRango.fin,
    }).then(ref => {
      if (!cancelado) setRheReferenciaHoras(ref);
    }).catch(err => {
      console.error('[RHE referencia]', err);
      if (!cancelado) {
        setRheReferenciaHoras(null);
        setRheReferenciaError('No se pudo consultar las horas registradas para este periodo.');
      }
    }).finally(() => {
      if (!cancelado) setRheReferenciaLoading(false);
    });
    return () => { cancelado = true; };
  }, [cxp, empresa?.id, partes, recibosHonorarios, rheColaboradorId, rhePeriodoRango.fin, rhePeriodoRango.inicio, rhePeriodoRango.valido, rheTipoEmisor]);

  useEffect(() => {
    if (rheTipoEmisor !== 'interno' || rheReferenciaLoading || rheMontoEditadoManual) return;
    if (rheMontoSugerido > 0) {
      setRheMontoBruto(rheMontoSugerido.toFixed(2));
    } else if (rheReferenciaHoras) {
      setRheMontoBruto('');
    }
  }, [rheMontoEditadoManual, rheMontoSugerido, rheReferenciaHoras, rheReferenciaLoading, rheTipoEmisor]);

  // Filtros
  const [filtTipo, setFiltTipo] = useState('todos');
  const [filtOrigen, setFiltOrigen] = useState('todos');
  const [filtMoneda, setFiltMoneda] = useState('todos');

  // ── Helpers ──────────────────────────────────────────────────────────────
  const saldoDe  = c => Number(c?.saldo ?? c?.monto_total ?? c?.monto ?? 0);
  const totalDe  = c => Number(c?.monto_total ?? c?.monto ?? 0);
  const pagadoDe = c => Number(c?.monto_pagado ?? 0);
  const gastoOrigenDe = c => (comprasGastos || []).find(g => g.id === c?.gasto_id) || null;
  const conceptoGastoDe = gasto => gasto?.concepto || gasto?.descripcion || gasto?.detalle || '';
  const cecoNombreDe = id => {
    const ceco = (centrosCosto || []).find(c => c.id === id);
    return ceco ? `${ceco.codigo ? `${ceco.codigo} - ` : ''}${ceco.nombre}` : '';
  };
  const categoriaGastoDe = gasto => gasto?.categoria_er || gasto?.categoria || '';

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

  const beneficiarioDetalle = c => {
    if (c?.tipo_beneficiario === DIVIDENDO_TIPO) {
      return { nombre: c?.socio_nombre || c?.concepto || 'Socio / accionista', badge: 'Socio', badgeCls: 'badge-purple', tipo: 'socio' };
    }
    if (c?.tipo_beneficiario === 'colectivo') {
      return { nombre: c?.concepto || 'Obligacion institucional', badge: 'Colectivo', badgeCls: 'badge-gray', tipo: 'colectivo' };
    }
    if (c?.tipo_beneficiario === 'personal') {
      const persona = [...(personalAdmin||[]), ...(personalOperativo||[])].find(p => p.id === c?.personal_id);
      return {
        nombre: persona?.nombre || c?.personal_administrativo?.nombre || c?.personal_id || 'Colaborador',
        badge: 'Colab.',
        badgeCls: 'badge-cyan',
        tipo: 'personal',
      };
    }
    if (c?.proveedor_id) {
      const nombreProveedor = c?.proveedor || c?.proveedores?.razon_social
        || (proveedores || []).find(p => p.id === c?.proveedor_id)?.razon_social
        || c?.proveedor_id;
      return { nombre: nombreProveedor, badge: 'Proveedor', badgeCls: 'badge-blue', tipo: 'proveedor' };
    }
    if (c?.origen === 'auto_gasto') {
      const gasto = gastoOrigenDe(c);
      return {
        nombre: conceptoGastoDe(gasto) || c?.concepto || 'Gasto directo',
        badge: 'Gasto directo',
        badgeCls: 'badge-gray',
        tipo: 'gasto',
        icon: I.receipt,
        tone: 'var(--fg-muted)',
      };
    }
    const nombreFallback = c?.proveedor || c?.proveedores?.razon_social
      || (proveedores || []).find(p => p.id === c?.proveedor_id)?.razon_social
      || c?.proveedor_id;
    return nombreFallback
      ? { nombre: nombreFallback, badge: 'Proveedor', badgeCls: 'badge-blue', tipo: 'proveedor' }
      : { nombre: 'Gasto directo', badge: 'Gasto directo', badgeCls: 'badge-gray', tipo: 'gasto', tone: 'var(--fg-subtle)' };
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
    setRheTipoEmisor('');
    setRheColaboradorId('');
    setRheTrabajoFacturable(true);
    setRheRucAviso(null);
    setRhePeriodoServicio(periodoRhePrevio(today));
    setRheReferenciaHoras(null);
    setRheReferenciaLoading(false);
    setRheReferenciaError('');
    setRheMontoEditadoManual(false);
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
    } else if (modo === 'rhe') {
      setFormCrear({ ...base, tipo_comprobante: 'RHE' });
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
    const esRheInterno = esRhe && rheTipoEmisor === 'interno';
    const montoTotal = esRhe ? (esRheInterno ? rheMontoNetoInterno : rheMontoNeto) : Number(formCrear.monto_total);
    if (!formCrear.fecha_emision || !formCrear.fecha_vencimiento || montoTotal <= 0) {
      addNotificacion('Completa fecha de emisión, vencimiento y monto.');
      return;
    }
    if (esRhe && !rheTipoEmisor) {
      addNotificacion('Selecciona el tipo de emisor del RHE antes de continuar.');
      return;
    }
    if (esRhe && esRheInterno && (!rheColaboradorId || !Number(rheMontoBruto))) {
      addNotificacion('Para RHE interno: selecciona el colaborador y el monto bruto.');
      return;
    }
    if (esRheInterno && !rheCategoriaErAsignada) {
      addNotificacion('Selecciona una categoria ER para registrar el RHE del colaborador interno.');
      return;
    }
    if (esRhe && !esRheInterno && (!rheRuc || rheRuc.length !== 11 || !rheNombre || !Number(rheMontoBruto))) {
      addNotificacion('Para RHE externo: ingresa RUC (11 dígitos), nombre del emisor y monto bruto.');
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
      const rheRetencionEfectiva = esRheInterno ? rheRetencionInterna : rheRetencion;
      const cxpPayload = {
        proveedor_id:      (esViaticos || esTributo || esDividendo || esRheInterno) ? null : (formCrear.proveedor_id || null),
        tipo_beneficiario: esDividendo ? DIVIDENDO_TIPO : esViaticos ? 'personal' : esTributo ? 'colectivo' : esRheInterno ? 'personal' : (formCrear.tipo_beneficiario || 'proveedor'),
        personal_id:       esViaticos ? viaticosPersonalId : esRheInterno ? rheColaboradorId : null,
        ot_vinc_id:        (esViaticos && viaticosOtId) ? viaticosOtId : null,
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
        ...(esRhe ? { ruc_emisor: rheRuc, nombre_emisor: rheNombre, monto_bruto: Number(rheMontoBruto), retencion_ir: rheRetencionEfectiva } : {}),
        ...(archivoCrearUrl ? { archivo_factura_url: archivoCrearUrl } : {}),
        ...(esRheInterno ? { categoria_er: rheCategoriaErAsignada } : cxpCategoriaEr ? { categoria_er: cxpCategoriaEr } : {}),
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

  const selBeneficiario = sel ? beneficiarioDetalle(sel) : null;
  const selGastoOrigen = sel ? gastoOrigenDe(sel) : null;
  const selSemaforo = sel ? semaforoDe(sel) : null;
  const selDocumento = sel ? (sel.factura_numero || sel.tipo_comprobante || sel.concepto || 'Sin documento') : '';
  const selCecoNombre = sel ? (cecoNombreDe(sel.centro_costo_id) || '-') : '-';
  const selGastoCecoNombre = selGastoOrigen ? (cecoNombreDe(selGastoOrigen.centro_costo_id) || '-') : '-';
  const selGastoConcepto = conceptoGastoDe(selGastoOrigen);
  const selGastoCategoria = categoriaGastoDe(selGastoOrigen);
  const selComprobanteValor = sel
    ? (sel.archivo_factura_url
        ? 'Adjunto disponible'
        : (sel.factura_numero || sel.tipo_comprobante || '-'))
    : '-';
  const selDatosComprobante = sel ? [
    ['Concepto', sel.concepto || selGastoConcepto || '-'],
    ['Moneda y monto total', money(totalDe(sel), symOf(sel.moneda))],
    ['Monto pagado', money(pagadoDe(sel), symOf(sel.moneda))],
    ['Saldo pendiente', money(saldoDe(sel), symOf(sel.moneda))],
    ['Fecha de emision', sel.fecha_emision || '-'],
    ['Fecha de vencimiento', sel.fecha_vencimiento || '-'],
    ['CECO', selCecoNombre],
    ['Categoria ER', sel.categoria_er || '-'],
    ['Comprobante', selComprobanteValor],
  ] : [];

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
          <button className="btn btn-secondary" onClick={() => abrirCrearCxP(tabCxP === 'tributos' ? 'tributos' : 'rhe')} style={{fontSize:13}}>
            {I.plus} {tabCxP === 'tributos' ? 'Registrar tributo' : 'Registrar RHE'}
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
        {[{v:'todos',l:'Origen: Todos'},{v:'recepcion',l:'OC'},{v:'auto_gasto',l:'Gasto directo'},{v:'rhe_externo',l:'RHE'},{v:'honorarios',l:'Honorarios'},{v:'viaticos',l:'Viáticos'},{v:'nomina',l:'Nómina'},{v:'manual',l:'Manual'}].map(f => (
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
                const ben = beneficiarioDetalle(c);
                return (
                  <tr key={c.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => abrirFicha(c)}>
                    <td><span title={sem.label} style={{display:'inline-block',width:10,height:10,borderRadius:999,background:sem.bg,flexShrink:0}}/></td>
                    <td style={{fontWeight:600}}>
                      {tabCxP === 'tributos' ? (cxpTributoPeriodo(c) || '-') : (
                        <>
                          <span style={{color: ben.tone || 'inherit', display:'inline-flex', alignItems:'center', gap:5}}>
                            {ben.icon && <span style={{width:14,height:14,display:'inline-flex'}}>{ben.icon}</span>}
                            {ben.nombre}
                          </span>
                          {ben.badge && <span className={'badge '+ben.badgeCls} style={{marginLeft:6,fontSize:10,padding:'1px 5px'}}>{ben.badge}</span>}
                        </>
                      )}
                    </td>
                    <td className={tabCxP === 'tributos' ? '' : 'mono text-muted'} style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {tabCxP === 'tributos' ? (
                        <>
                          <strong>{cxpTributoTipoLabel(c)}</strong>
                          <div className="text-muted" style={{fontSize:11}}>{c.motivo_cxp || 'tributo'}</div>
                        </>
                      ) : (
                        <span style={{display:'flex',alignItems:'center',gap:6}}>
                          {c.factura_numero || c.concepto || '-'}
                          {c.origen === 'nc_devolucion' && <span className="badge badge-cyan" style={{fontSize:9,padding:'1px 5px'}}>NC Prov.</span>}
                        </span>
                      )}
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
                      {c.archivo_factura_url && <a href={c.archivo_factura_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary" style={{marginRight:4}} title="Ver comprobante adjunto">{I.file}</a>}
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
                <div className="eyebrow">{sel.origen === 'rhe_externo' || sel.tipo_comprobante === 'RHE' ? 'RHE — Recibo por Honorarios' : sel.tipo_beneficiario === 'personal' ? 'Honorarios colaborador' : 'Factura proveedor'}</div>
                <div style={{fontWeight:700,fontSize:20}}>{selBeneficiario?.nombre}</div>
                <div style={{fontSize:12,color:'var(--fg-muted)'}}>{selDocumento}</div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginTop:6}}>
                  <span className={'badge '+(sel.estado === 'pagada' ? 'badge-green' : sel.estado === 'pago_parcial' ? 'badge-orange' : selSemaforo?.badgeCls || 'badge-orange')}>
                    {sel.estado === 'pagada' ? 'Pagado' : sel.estado === 'pago_parcial' ? 'Parcial' : 'Pendiente'}
                  </span>
                  {selBeneficiario?.badge && <span className={'badge '+selBeneficiario.badgeCls}>{selBeneficiario.badge}</span>}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
            </div>

            <div className="tabs" style={{padding:'0 20px'}}>
              {[
                {id:'pago',label:'Registrar pago'},
                {id:'historial',label:`Historial (${pagosDe(sel.id).length})`},
              ].map(t => (
                <div key={t.id} className={'tab '+(fichaTab===t.id?'active':'')} onClick={() => setFichaTab(t.id)}>{t.label}</div>
              ))}
            </div>

            {fichaTab === 'pago' && (
              <form className="side-panel-body" onSubmit={guardarPago}>
                <div className="card" style={{padding:14,marginBottom:16}}>
                  <div style={{fontSize:11,color:'var(--fg-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Datos del comprobante</div>
                  <div style={{display:'grid',gridTemplateColumns:'minmax(130px, 0.8fr) 1fr',gap:'8px 12px',fontSize:13,marginBottom:12}}>
                    {selDatosComprobante.map(([l,v]) => (
                      <React.Fragment key={l}>
                        <div style={{color:'var(--fg-muted)'}}>{l}</div>
                        <div style={{fontWeight:600,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                          <span>{v}</span>
                          {l === 'Fecha de vencimiento' && selSemaforo?.badgeCls !== 'badge-gray' && (
                            <span className={'badge '+selSemaforo.badgeCls} style={{fontSize:9,padding:'1px 5px'}}>{selSemaforo.label}</span>
                          )}
                          {l === 'Comprobante' && sel.archivo_factura_url && (
                            <a href={sel.archivo_factura_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary" style={{padding:'2px 6px'}}>{I.file}</a>
                          )}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  {sel.origen === 'auto_gasto' && selGastoOrigen && (
                    <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border-subtle)'}}>
                      <div style={{fontSize:11,color:'var(--fg-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Gasto de origen</div>
                      <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                        <span style={{width:16,height:16,color:'var(--fg-muted)',marginTop:2}}>{I.receipt}</span>
                        <div style={{display:'flex',flexDirection:'column',gap:3}}>
                          <div style={{fontWeight:700,fontSize:13}}>{selGastoConcepto || sel.concepto}</div>
                          <div style={{fontSize:12,color:'var(--fg-muted)'}}>
                            {[selGastoCategoria, selGastoCecoNombre].filter(Boolean).join(' · ')}
                          </div>
                          <div style={{fontSize:11,color:'var(--fg-subtle)'}}>Registro en Compras/Gastos</div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border-subtle)',fontSize:11,color:'var(--fg-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>Resumen de pago</div>
                  <div style={{height:8}}/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    {[['Total',money(totalDe(sel),symOf(sel.moneda))],['Pagado',money(pagadoDe(sel),symOf(sel.moneda))],['Saldo pendiente',money(saldoDe(sel),symOf(sel.moneda))],['Vencimiento',sel.fecha_vencimiento || '—']].map(([l,v]) => (
                      <div key={l}><div style={{fontSize:10,color:'var(--fg-muted)',marginBottom:2}}>{l}</div><div style={{fontWeight:600,fontSize:13}}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border-subtle)',display:'flex',flexDirection:'column',gap:8}}>
                    <div style={{fontSize:11,color:'var(--fg-muted)',fontWeight:600}}>Clasificación en Estado de Resultados</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <div className="input-group" style={{marginBottom:0}}>
                        <label style={{fontSize:11}}>Categoría ER</label>
                        <select className="select" style={{fontSize:12}} value={fichaClasifCategoria} onChange={e => setFichaClasifCategoria(e.target.value)}>
                          <option value="">Automático</option>
                          {erCatOpts.map(n => <option key={n} value={n}>{n}</option>)}
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
                <div style={{fontWeight:700,fontSize:20}}>{formCrear.tipo_comprobante === 'RHE' ? 'Registrar RHE' : motivoCxP === 'viaticos_reembolso' ? 'Reembolso de viáticos' : 'Registrar factura'}</div>
              </div>
              <button className="icon-btn" onClick={resetCrearCxP}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarNuevaCxP}>
              {formCrear.tipo_comprobante !== 'RHE' && (
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
              )}
              {!esTributoForm && formCrear.tipo_comprobante !== 'RHE' && (
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
              {formCrear.tipo_comprobante !== 'RHE' && (
                <div className="input-group">
                  <label>Tipo de comprobante</label>
                  <select className="select" value={formCrear.tipo_comprobante} onChange={e => setFormCrear(v => ({...v,tipo_comprobante:e.target.value}))}>
                    <option value="Factura">Factura</option>
                    <option value="Boleta">Boleta</option>
                    <option value="RHE">RHE — Recibo por Honorarios (externo)</option>
                  </select>
                </div>
              )}
              {formCrear.tipo_comprobante === 'RHE' ? (
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  {/* Cambio 5 — Regla de negocio permanente */}
                  <div style={{background:'var(--bg-subtle)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--fg-muted)',lineHeight:1.5}}>
                    <strong style={{color:'var(--fg)',display:'block',marginBottom:3}}>Regla de registro RHE</strong>
                    Colaboradores recurrentes con OT asignada → <strong>colaborador interno</strong> (Mano de obra / Costo de Ventas). Externos puntuales sin OT → <strong>proveedor externo</strong> (Servicios terceros / Gastos Operativos). El canal determina el impacto en el Estado de Resultados.
                  </div>
                  {/* Cambio 1 — Selección de tipo de emisor */}
                  {!rheTipoEmisor ? (
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      <div style={{fontSize:12,color:'var(--fg-muted)',fontWeight:600}}>¿Quién emite este RHE? <span style={{color:'var(--danger)'}}>*</span></div>
                      {[
                        {val:'interno', titulo:'Colaborador interno con honorarios', desc:'Persona registrada en RRHH con modalidad Honorarios'},
                        {val:'externo', titulo:'Proveedor externo / tercero', desc:'Consultor, freelance o persona natural sin ficha en el sistema'},
                      ].map(opt => (
                        <button key={opt.val} type="button" onClick={() => { setRheTipoEmisor(opt.val); setRheMontoEditadoManual(false); setRheMontoBruto(''); }} style={{display:'flex',flexDirection:'column',alignItems:'flex-start',padding:'12px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-subtle)',cursor:'pointer',textAlign:'left',gap:4,width:'100%'}}>
                          <span style={{fontSize:13,fontWeight:600,color:'var(--fg)'}}>{opt.titulo}</span>
                          <span style={{fontSize:11,color:'var(--fg-muted)'}}>{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'var(--bg-subtle)',borderRadius:8,border:'1px solid var(--border)'}}>
                      <span style={{fontSize:12,fontWeight:600,color:'var(--fg)'}}>
                        {rheTipoEmisor === 'interno' ? 'Colaborador interno con honorarios' : 'Proveedor externo / tercero'}
                      </span>
                      <button type="button" onClick={() => { setRheTipoEmisor(''); setRheColaboradorId(''); setRheTrabajoFacturable(true); setRheRuc(''); setRheNombre(''); setRheRucAviso(null); setRheReferenciaHoras(null); setRheReferenciaError(''); setRheMontoEditadoManual(false); setRheMontoBruto(''); setCxpCategoriaEr(''); }} style={{fontSize:11,color:'var(--fg-muted)',background:'none',border:'none',cursor:'pointer',padding:'2px 6px',borderRadius:4}}>
                        Cambiar
                      </button>
                    </div>
                  )}
                  {/* Cambio 2 — Flujo colaborador interno */}
                  {rheTipoEmisor === 'interno' && (
                    <div style={{background:'var(--bg-subtle)',borderRadius:8,padding:'14px',display:'flex',flexDirection:'column',gap:12}}>
                      <div style={{fontSize:12,color:'var(--fg-muted)',fontWeight:600}}>Datos del colaborador</div>
                      <div className="input-group">
                        <label>Colaborador <span style={{color:'var(--danger)'}}>*</span></label>
                        <select className="select" value={rheColaboradorId} onChange={e => {
                          const id = e.target.value;
                          setRheColaboradorId(id);
                          setRheMontoEditadoManual(false);
                          setRheMontoBruto('');
                          const col = colaboradoresHonorarios.find(p => p.id === id);
                          setRheRuc(col?.ruc_colaborador || '');
                          setRheNombre(col?.nombre || '');
                        }}>
                          <option value="">— Seleccionar colaborador —</option>
                          {colaboradoresHonorarios.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre} — {p.cargo || p.area || 'Sin cargo'}</option>
                          ))}
                        </select>
                      </div>
                      {rheColaboradorSel && (
                        <div style={{background:'var(--bg)',borderRadius:6,padding:'8px 12px',fontSize:12,color:'var(--fg-muted)',display:'flex',flexDirection:'column',gap:4}}>
                          {rheColaboradorSel.ruc_colaborador && <span>RUC: <strong style={{color:'var(--fg)'}}>{rheColaboradorSel.ruc_colaborador}</strong></span>}
                          {rheColaboradorTasaIR === 0 && <span style={{color:'var(--green)'}}>Sin retención IR — constancia de suspensión vigente</span>}
                        </div>
                      )}
                      <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,padding:'12px',display:'flex',flexDirection:'column',gap:10}}>
                        <div style={{fontSize:12,color:'var(--fg-muted)',fontWeight:600}}>Periodo de servicio</div>
                        <div className="grid-2" style={{gap:10}}>
                          <div className="input-group">
                            <label>Mes inicio</label>
                            <select className="select" value={rhePeriodoServicio.inicioMes} onChange={e => actualizarPeriodoRhe({ inicioMes: e.target.value })}>
                              {RHE_MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          </div>
                          <div className="input-group">
                            <label>Anio inicio</label>
                            <select className="select" value={rhePeriodoServicio.inicioAnio} onChange={e => actualizarPeriodoRhe({ inicioAnio: e.target.value })}>
                              {rheYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                          </div>
                          <div className="input-group">
                            <label>Mes fin</label>
                            <select className="select" value={rhePeriodoServicio.finMes} onChange={e => actualizarPeriodoRhe({ finMes: e.target.value })}>
                              {RHE_MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          </div>
                          <div className="input-group">
                            <label>Anio fin</label>
                            <select className="select" value={rhePeriodoServicio.finAnio} onChange={e => actualizarPeriodoRhe({ finAnio: e.target.value })}>
                              {rheYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                          </div>
                        </div>
                        {!rhePeriodoRango.valido && (
                          <div style={{fontSize:12,color:'var(--danger)'}}>El periodo final no puede ser anterior al periodo inicial.</div>
                        )}
                      </div>
                      {rheColaboradorId && (
                        <div style={{background:'color-mix(in srgb, var(--cyan) 8%, var(--surface))',border:'1px solid color-mix(in srgb, var(--cyan) 28%, var(--border))',borderRadius:8,padding:'12px 14px',fontSize:12,lineHeight:1.5,display:'flex',flexDirection:'column',gap:8}}>
                          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
                            <strong style={{color:'var(--fg)'}}>Referencia por horas reales</strong>
                            {rheReferenciaLoading && <span style={{color:'var(--fg-muted)'}}>Consultando...</span>}
                          </div>
                          {rheReferenciaError ? (
                            <span style={{color:'var(--danger)'}}>{rheReferenciaError}</span>
                          ) : rheReferenciaHoras ? (
                            <>
                              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'4px 12px'}}>
                                <span style={{color:'var(--fg-muted)'}}>Partes aprobados</span>
                                <strong>{Number(rheReferenciaHoras.horasPartes || 0).toFixed(2)} h</strong>
                                <span style={{color:'var(--fg-muted)'}}>Tareos enviados</span>
                                <strong>{Number(rheReferenciaHoras.horasTareos || 0).toFixed(2)} h</strong>
                                <span style={{color:'var(--fg-muted)'}}>Horas registradas</span>
                                <strong>{rheHorasTotal.toFixed(2)} h</strong>
                              </div>
                              {rheTarifaHora > 0 ? (
                                <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'4px 12px',borderTop:'1px solid color-mix(in srgb, var(--cyan) 22%, var(--border))',paddingTop:8}}>
                                  <span style={{color:'var(--fg-muted)'}}>Tarifa hora</span>
                                  <strong>{moneyD(rheTarifaHora, symOf(formCrear.moneda))}/h</strong>
                                  <span style={{color:'var(--fg-muted)'}}>Monto sugerido</span>
                                  <strong style={{fontSize:14}}>{moneyD(rheMontoSugerido, symOf(formCrear.moneda))}</strong>
                                </div>
                              ) : (
                                <span style={{color:'var(--orange)',fontWeight:600}}>Tarifa hora no configurada - configurala en la ficha del colaborador.</span>
                              )}
                              {rheReferenciaHoras.existeRhePeriodo && (
                                <div style={{background:'color-mix(in srgb, var(--orange) 12%, var(--surface))',border:'1px solid color-mix(in srgb, var(--orange) 35%, var(--border))',borderRadius:6,padding:'8px 10px',color:'var(--fg)'}}>
                                  Ya existe un RHE registrado para este colaborador en el periodo seleccionado. Verifica si es un registro duplicado antes de continuar.
                                </div>
                              )}
                              <span style={{color:'var(--fg-muted)'}}>Referencia orientativa. Puedes ingresar un monto distinto si el acuerdo aplicado es diferente.</span>
                            </>
                          ) : (
                            <span style={{color:'var(--fg-muted)'}}>Selecciona un periodo valido para consultar horas registradas.</span>
                          )}
                        </div>
                      )}
                      <div className="input-group">
                        <label>¿Este honorario es por trabajo directo en proyectos facturables?</label>
                        <div className="row" style={{gap:8,flexWrap:'wrap'}}>
                          <button type="button" className={'btn btn-sm ' + (rheTrabajoFacturable ? 'btn-primary' : 'btn-secondary')} onClick={() => { setRheTrabajoFacturable(true); setCxpCategoriaEr(''); }}>Sí</button>
                          <button type="button" className={'btn btn-sm ' + (!rheTrabajoFacturable ? 'btn-primary' : 'btn-secondary')} onClick={() => { setRheTrabajoFacturable(false); setCxpCategoriaEr(''); }}>No</button>
                        </div>
                        <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:4,lineHeight:1.4}}>
                          {rheTrabajoFacturable
                            ? 'Impacta como Mano de obra en Costo de Ventas del ER.'
                            : 'Impacta como Mano de obra en Gastos Operativos del ER.'}
                        </div>
                      </div>
                      <div className="input-group" style={{display:'none'}}>
                        <label>Legacy RHE OT</label>
                        <select className="select" value={rheOtId} onChange={e => setRheOtId(e.target.value)}>
                          <option value="">Sin OT</option>
                          {(ots||[]).filter(o => o.estado !== 'anulada').map(o => (
                            <option key={o.id} value={o.id}>{o.numero || o.id} — {o.nombre || o.descripcion || ''}</option>
                          ))}
                        </select>
                        <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:4,lineHeight:1.4}}>
                          {rheOtId ? 'Con OT → Mano de obra en Costo de Ventas.' : 'Sin OT → Mano de obra en Gastos Operativos.'}
                        </div>
                      </div>
                      <div className="input-group">
                        <label>Categoría ER (automático)</label>
                        <input className="input" value={rheCategoriaErAsignada} readOnly style={{background:'var(--bg)',color:'var(--fg-muted)',cursor:'default'}}/>
                        {rheFaltaCategoriaManoObra && (
                          <>
                            <div style={{fontSize:11,color:'var(--orange)',marginTop:4,lineHeight:1.4}}>
                              {rheSinCategoriasManoObra
                                ? 'Este tenant no tiene configurada una categoria de Mano de obra. Configurala en Parametros Generales - Categorias ER o selecciona una categoria manual como fallback.'
                                : `No hay una categoria de Mano de obra para ${rheDestinoErLabel}. Puedes configurarla en Parametros Generales - Categorias ER o seleccionar una categoria manual como fallback.`}
                            </div>
                            <select className="select" value={cxpCategoriaEr} onChange={e => setCxpCategoriaEr(e.target.value)} style={{marginTop:8}}>
                              <option value="">Seleccionar categoria fallback...</option>
                              {erCatOpts.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                      <div className="grid-2" style={{gap:12}}>
                        <div className="input-group" style={{gridColumn:'1/-1'}}>
                          <label>N° RHE</label>
                          <input className="input" value={rheNumeroDoc} onChange={e => setRheNumeroDoc(e.target.value)} placeholder="RHE-00001"/>
                        </div>
                        <div className="input-group">
                          <label>Monto bruto <span style={{color:'var(--danger)'}}>*</span></label>
                          <input className="input" type="number" min="0" step="0.01" value={rheMontoBruto} onChange={e => { setRheMontoBruto(e.target.value); setRheMontoEditadoManual(true); }} placeholder="0.00"/>
                          {rheAdvertenciaDesviacion && (
                            <div style={{fontSize:11,color:'var(--orange)',marginTop:4,lineHeight:1.4}}>
                              El monto ingresado difiere significativamente del calculado segun horas registradas. Puedes continuar si el acuerdo es diferente a la tarifa hora configurada.
                            </div>
                          )}
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
                          {rheColaboradorTasaIR > 0
                            ? <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{color:'var(--danger)'}}>Retención IR {(rheColaboradorTasaIR*100).toFixed(0)}%</span><span style={{color:'var(--danger)'}}>- {rheRetencionInterna.toFixed(2)}</span></div>
                            : <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{color:'var(--green)'}}>Sin retención IR (suspensión vigente)</span><span style={{color:'var(--green)'}}>0.00</span></div>
                          }
                          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,borderTop:'1px solid var(--border)',paddingTop:6}}><span>Monto a pagar (neto)</span><span>{rheMontoNetoInterno.toFixed(2)}</span></div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Cambio 3 — Flujo proveedor externo */}
                  {rheTipoEmisor === 'externo' && (
                    <div style={{background:'var(--bg-subtle)',borderRadius:8,padding:'14px',display:'flex',flexDirection:'column',gap:12}}>
                      <div style={{fontSize:12,color:'var(--fg-muted)',fontWeight:600}}>Datos del emisor del RHE</div>
                      {/* Cambio 4 — Advertencia RUC coincide con colaborador */}
                      {rheRucAviso && (
                        <div style={{background:'color-mix(in srgb, var(--orange) 10%, var(--surface))',border:'1px solid color-mix(in srgb, var(--orange) 30%, var(--border))',borderRadius:8,padding:'10px 12px',fontSize:12,lineHeight:1.5}}>
                          <strong style={{display:'block',marginBottom:4}}>Este RUC pertenece a {rheRucAviso.nombre}</strong>
                          <span style={{color:'var(--fg-muted)'}}>Está registrado como colaborador interno con modalidad Honorarios. Si este pago es por trabajo en una OT, considera registrarlo como colaborador interno para que impacte correctamente el Costo de Ventas.</span>
                          <button type="button" onClick={() => {
                            setRheTipoEmisor('interno');
                            const col = [...(personalAdmin||[]), ...(personalOperativo||[])].find(p => p.ruc_colaborador === rheRuc && p.estado !== 'inactivo');
                            if (col) { setRheColaboradorId(col.id); setRheNombre(col.nombre || ''); }
                            setRheRucAviso(null);
                          }} style={{display:'block',marginTop:8,fontSize:12,fontWeight:600,color:'var(--fg)',background:'none',border:'none',cursor:'pointer',padding:0,textDecoration:'underline'}}>
                            Registrar como colaborador interno →
                          </button>
                        </div>
                      )}
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
                {(formCrear.tipo_comprobante !== 'RHE' || rheTipoEmisor !== 'interno') && (
                  <div className="input-group">
                    <label>Categoría ER</label>
                    <select className="select" value={cxpCategoriaEr} onChange={e => setCxpCategoriaEr(e.target.value)}>
                      <option value="">Automático (según tipo de comprobante)</option>
                      {erCatOpts.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
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
                <button type="button" className="btn btn-secondary" onClick={() => { setPanelCrear(false); setArchivoCrearUrl(''); setFormCrear(FORM_VACIO); setRheRuc(''); setRheNombre(''); setRheMontoBruto(''); setRheNumeroDoc(''); setRheTipoEmisor(''); setRheColaboradorId(''); setRheTrabajoFacturable(true); setRheOtId(''); setRheRucAviso(null); setCxpCategoriaEr(''); setCxpCentroCostoId(''); }}>Cancelar</button>
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
  { value: 'MAQUINARIA PESADA',     label: 'MAQUINARIA PESADA' },
  { value: 'COMPONENTES',           label: 'COMPONENTES' },
  { value: 'VEHICULOS',             label: 'VEHICULOS' },
  { value: 'INSTRUMENTO',           label: 'INSTRUMENTO' },
  { value: 'HERRAMIENTA',           label: 'HERRAMIENTA' },
  { value: 'INFORMATICA',           label: 'INFORMATICA' },
  { value: 'MOBILIARIO',            label: 'MOBILIARIO' },
  { value: 'ACTIVO INTANGIBLE',     label: 'ACTIVO INTANGIBLE' },
  { value: 'ACTIVO NO DEPRECIABLE', label: 'ACTIVO NO DEPRECIABLE' },
  { value: 'equipo',                label: 'EQUIPO' },
  { value: 'inmueble',              label: 'INMUEBLE' },
  { value: 'otro',                  label: 'OTRO' },
];

const DOC_TIPOS_ACTIVO = ['SOAT', 'Póliza todo riesgo', 'Revisión técnica', 'Inspección interna', 'Seguro carga', 'Otro'];

function ActivosFijos() {
  const {
    activos = [], comprasGastos = [], centrosCosto = [],
    crearActivoCtx, actualizarActivoCtx, bajaActivoCtx, importarActivosCtx,
    crearGasto, addNotificacion,
  } = useApp();

  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState('maestro');

  // ─── Maestro: estado local ─────────────────────────────────────────────────
  const [panel, setPanel] = useState(null); // null | 'nuevo' | 'editar' | 'ver'
  const [selActivo, setSelActivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultImport, setResultImport] = useState(null);
  const [modalBaja, setModalBaja] = useState(null);
  const [bajaMotivo, setBajaMotivo] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const initForm = {
    codigo: '', nombre: '', tipo_categoria: 'equipo', marca: '', modelo: '',
    placa_serie: '', ubicacion: '', estado: 'operativo', centro_costo_id: '',
    responsable_nombre: '', fecha_alta: today, valor_adquisicion: '',
    moneda: 'PEN', vida_util_anos: '', observacion: '', compras_gasto_id: null,
  };
  const [form, setForm] = useState(initForm);
  const [formDocs, setFormDocs] = useState([]);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const cecos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const cecoNombre = id => {
    const c = (centrosCosto || []).find(x => x.id === id);
    return c ? `${c.codigo || ''} ${c.nombre}`.trim() : (id || '-');
  };

  const semaforo = (doc) => {
    if (!doc?.fecha_vencimiento) return 'gris';
    const diasAlerta = Number(doc.dias_alerta || 30);
    const hoy = new Date(today + 'T00:00:00');
    const venc = new Date(doc.fecha_vencimiento + 'T00:00:00');
    const diff = Math.floor((venc - hoy) / 86400000);
    if (diff < 0) return 'rojo';
    if (diff <= diasAlerta) return 'amarillo';
    return 'verde';
  };

  const colorSemaforo = { verde: 'var(--success)', amarillo: 'var(--orange)', rojo: 'var(--danger)', gris: 'var(--fg-muted)' };

  const semaforoActivo = (a) => {
    const docs = Array.isArray(a.documentos) ? a.documentos : [];
    if (!docs.length) return 'gris';
    if (docs.some(d => semaforo(d) === 'rojo')) return 'rojo';
    if (docs.some(d => semaforo(d) === 'amarillo')) return 'amarillo';
    return 'verde';
  };

  const calcDeprec = (activo) => {
    if (!activo.valor_adquisicion || !activo.vida_util_anos || !activo.fecha_alta) return null;
    const alta = new Date(activo.fecha_alta + 'T00:00:00');
    const hoy = new Date(today + 'T00:00:00');
    const mesesVividos = (hoy.getFullYear() - alta.getFullYear()) * 12 + (hoy.getMonth() - alta.getMonth());
    const vidaMeses = Number(activo.vida_util_anos) * 12;
    if (vidaMeses <= 0) return null;
    const base = Number(activo.valor_adquisicion);
    const deprecAcum = Math.min(base, (base / vidaMeses) * Math.max(0, mesesVividos));
    const pct = Math.min(100, Math.round((deprecAcum / base) * 100));
    return { pct, valorActual: Math.max(0, base - deprecAcum) };
  };

  // ─── KPIs maestro ─────────────────────────────────────────────────────────
  const activosOperativos = activos.filter(a => a.estado === 'operativo');
  const activosMantenimiento = activos.filter(a => a.estado === 'en_mantenimiento');
  const activosConAlerta = activos.filter(a => ['rojo', 'amarillo'].includes(semaforoActivo(a)));
  const valorTotal = activos.filter(a => a.estado !== 'dado_baja').reduce((s, a) => s + Number(a.valor_adquisicion || 0), 0);

  const activosFiltrados = activos.filter(a => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (a.codigo || '').toLowerCase().includes(q) || (a.nombre || '').toLowerCase().includes(q) || (a.marca || '').toLowerCase().includes(q) || (a.placa_serie || '').toLowerCase().includes(q);
  });

  // ─── CRUD maestro ─────────────────────────────────────────────────────────
  const abrirNuevo = () => { setForm(initForm); setFormDocs([]); setSelActivo(null); setPanel('nuevo'); };

  const abrirNuevoDesdeCompras = (gasto) => {
    setForm({
      ...initForm,
      nombre:           gasto.descripcion || '',
      tipo_categoria:   gasto.activo_tipo || 'equipo',
      valor_adquisicion: gasto.monto ?? '',
      moneda:           gasto.moneda || 'PEN',
      vida_util_anos:   gasto.vida_util_anos ?? '',
      fecha_alta:       gasto.fecha || today,
      placa_serie:      gasto.numero_serie || '',
      centro_costo_id:  gasto.centro_costo_id || '',
      compras_gasto_id: gasto.id,
      observacion:      `Promovido desde Compras/Gastos${gasto.num_comprobante ? ` · ${gasto.num_comprobante}` : ''}`,
    });
    setFormDocs([]);
    setSelActivo(null);
    setSelC(null);
    setTab('maestro');
    setPanel('nuevo');
  };
  const abrirEditar = (a) => {
    setSelActivo(a);
    setForm({ ...initForm, ...a, valor_adquisicion: a.valor_adquisicion ?? '', vida_util_anos: a.vida_util_anos ?? '' });
    setFormDocs(Array.isArray(a.documentos) ? a.documentos : []);
    setPanel('editar');
  };
  const abrirVer = (a) => { setSelActivo(a); setPanel('ver'); };
  const cerrarPanel = () => { setPanel(null); setSelActivo(null); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.codigo.trim() || !form.nombre.trim()) { addNotificacion('Código y nombre son obligatorios.', 'error'); return; }
    setGuardando(true);
    try {
      const payload = {
        ...form,
        documentos: formDocs,
        valor_adquisicion: Number(form.valor_adquisicion) || 0,
        vida_util_anos: parseInt(form.vida_util_anos, 10) || 0,
        centro_costo_id: form.centro_costo_id || null,
      };
      if (panel === 'nuevo') await crearActivoCtx(payload);
      else await actualizarActivoCtx(selActivo.id, payload);
      cerrarPanel();
      addNotificacion(panel === 'nuevo' ? 'Activo creado.' : 'Activo actualizado.');
    } catch (err) {
      addNotificacion(`Error: ${err.message}`, 'error');
    } finally { setGuardando(false); }
  };

  const confirmarBaja = async () => {
    if (!bajaMotivo.trim()) { addNotificacion('Indica el motivo de baja.', 'error'); return; }
    try {
      await bajaActivoCtx(modalBaja.id, bajaMotivo.trim());
      setModalBaja(null); setBajaMotivo('');
      addNotificacion('Activo dado de baja.');
    } catch (err) { addNotificacion(`Error: ${err.message}`, 'error'); }
  };

  // ─── Documentos en form ────────────────────────────────────────────────────
  const addDoc = () => setFormDocs(prev => [...prev, { tipo: 'SOAT', nombre: '', fecha_vencimiento: '', dias_alerta: 30 }]);
  const updDoc = (i, k, v) => setFormDocs(prev => prev.map((d, idx) => idx === i ? { ...d, [k]: v } : d));
  const delDoc = (i) => setFormDocs(prev => prev.filter((_, idx) => idx !== i));

  // ─── Importación Excel ─────────────────────────────────────────────────────
  const descargarPlantilla = () => {
    const headers = ['codigo','nombre','tipo_categoria','marca','modelo','placa_serie','ubicacion','estado','centro_costo','responsable','fecha_alta','valor_adquisicion','moneda','vida_util_anos','observacion'];
    const ejemplo = ['ACT-001','Volquete Volvo FMX','vehiculo','Volvo','FMX 440','ABC-123','Patio Sur','operativo','CC-OPS','Juan Pérez','2023-05-15','280000','PEN','10',''];
    const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
    ws['!cols'] = headers.map((_, i) => ({ wch: i === 1 ? 28 : i === 0 ? 12 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Activos');
    XLSX.writeFile(wb, 'plantilla_activos.xlsx');
  };

  const importarExcel = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    setImportando(true); setResultImport(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!filas.length) {
        setResultImport({ creados: 0, actualizados: 0, errores: [{ fila: '—', error: 'El archivo está vacío o sin filas de datos.' }] });
        return;
      }
      const res = await importarActivosCtx(filas);
      setResultImport(res);
    } catch (err) {
      setResultImport({ creados: 0, actualizados: 0, errores: [{ fila: '—', error: err.message }] });
    } finally { setImportando(false); }
  };

  // ─── Tab Compras: estado local (preservado del original) ──────────────────
  const [panelC, setPanelC] = useState(false);
  const [selC, setSelC] = useState(null);
  const [guardandoC, setGuardandoC] = useState(false);
  const initC = { descripcion:'', activo_tipo:'equipo', fecha:today, monto:'', moneda:'PEN', vida_util_anos:'', centro_costo_id:'', proveedor_referencia:'', notas:'', archivo_url:'', activo_estado:'activo' };
  const [formC, setFormC] = useState(initC);
  const resetC = () => { setPanelC(false); setFormC(initC); };

  const activosDeCompras = (comprasGastos || [])
    .filter(g => g.es_activo_fijo)
    .sort((a,b) => String(a.fecha || '').localeCompare(String(b.fecha || '')))
    .map((g, i) => ({ ...g, codigo_af: g.codigo_af || `AF-${String(i + 1).padStart(3,'0')}`, activo_estado: g.activo_estado || g.estado_activo || 'activo' }));
  const vidaCumplida = a => {
    if (!a.fecha || !a.vida_util_anos) return false;
    const fin = new Date(`${a.fecha}T00:00:00`);
    fin.setFullYear(fin.getFullYear() + Number(a.vida_util_anos));
    return fin <= new Date(`${today}T00:00:00`);
  };
  const activosComprasActivos = activosDeCompras.filter(a => a.activo_estado === 'activo' && a.estado !== 'anulado');
  const porDarBajaC = activosComprasActivos.filter(vidaCumplida);

  const guardarCompras = async e => {
    e.preventDefault();
    if (!formC.descripcion.trim() || !formC.monto || !formC.fecha || !formC.vida_util_anos) {
      addNotificacion('Completa nombre, fecha, valor y vida util.'); return;
    }
    setGuardandoC(true);
    try {
      await crearGasto({
        tipo: 'activo_fijo', descripcion: formC.descripcion.trim(), categoria: 'Activos fijos',
        monto: Number(formC.monto || 0), moneda: formC.moneda || 'PEN', fecha: formC.fecha,
        centro_costo_id: formC.centro_costo_id || null, es_activo_fijo: true,
        activo_tipo: formC.activo_tipo, vida_util_anos: Number(formC.vida_util_anos),
        origen_registro: 'backoffice', estado: 'registrado', activo_estado: formC.activo_estado,
        proveedor_referencia: formC.proveedor_referencia || null, notas: formC.notas || null, archivo_url: formC.archivo_url || null,
      });
      resetC(); addNotificacion('Activo registrado en Compras/Gastos.');
    } finally { setGuardandoC(false); }
  };

  const badgeEstado = (e) => {
    if (e === 'operativo') return 'badge-green';
    if (e === 'en_mantenimiento') return 'badge-orange';
    if (e === 'dado_baja') return 'badge-gray';
    return 'badge-gray';
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activos Fijos</h1>
          <div className="page-sub">Maestro de activos operativos de la empresa</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {[['maestro', 'Maestro de Activos'], ['compras', 'Desde Compras/Gastos']].map(([k, l]) => (
          <button key={k} className={`tab-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ── TAB MAESTRO ─────────────────────────────────────────────────────── */}
      {tab === 'maestro' && (
        <>
          {/* KPIs */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
            <div className="kpi-card"><div className="kpi-label">Operativos</div><div className="kpi-value">{activosOperativos.length}</div><div className="kpi-icon green">{I.package}</div></div>
            <div className="kpi-card"><div className="kpi-label">En mantenimiento</div><div className="kpi-value" style={{ color: activosMantenimiento.length ? 'var(--orange)' : undefined }}>{activosMantenimiento.length}</div><div className="kpi-icon orange">{I.wrench}</div></div>
            <div className="kpi-card"><div className="kpi-label">Docs por vencer/vencidos</div><div className="kpi-value" style={{ color: activosConAlerta.length ? 'var(--danger)' : undefined }}>{activosConAlerta.length}</div><div className="kpi-icon red">{I.alert}</div></div>
            <div className="kpi-card"><div className="kpi-label">Valor total activos</div><div className="kpi-value" style={{ fontSize: 20 }}>{money(valorTotal)}</div><div className="kpi-icon cyan">{I.dollar}</div></div>
          </div>

          {/* Toolbar */}
          <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={abrirNuevo}>{I.plus} Nuevo activo</button>
            <label className={'btn btn-secondary' + (importando ? ' disabled' : '')} style={{ cursor: importando ? 'not-allowed' : 'pointer' }}>
              {importando ? 'Importando...' : <>{I.download} Importar Excel</>}
              <input type="file" accept=".xlsx,.xls" onChange={importarExcel} style={{ display: 'none' }} disabled={importando} />
            </label>
            <button className="btn btn-secondary" onClick={descargarPlantilla}>{I.download} Descargar plantilla</button>
            <input className="input" style={{ width: 240, marginLeft: 'auto' }} placeholder="Buscar activo..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>

          {/* Resultado importación */}
          {resultImport && (
            <div style={{ fontSize: 12, background: resultImport.errores?.length ? 'var(--danger-lt)' : 'var(--success-lt)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 14px', marginBottom: 12 }}>
              <strong>Resultado importación:</strong> {resultImport.creados} creados · {resultImport.actualizados} actualizados
              {resultImport.errores?.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {resultImport.errores.slice(0, 6).map((e, i) => (
                    <div key={i} style={{ color: 'var(--danger)' }}>⚠ {e.fila}: {e.error}</div>
                  ))}
                  {resultImport.errores.length > 6 && <div>…y {resultImport.errores.length - 6} errores más</div>}
                </div>
              )}
            </div>
          )}

          {/* Tabla */}
          <div className="card"><div className="table-wrap"><table className="tbl">
            <thead>
              <tr>
                <th>Código</th><th>Nombre</th><th>Tipo</th><th>Marca / Modelo</th>
                <th>Placa / Serie</th><th>Ubicación</th><th>CECO</th>
                <th>Estado</th><th>Valor Adq.</th><th>Deprec.</th><th>Docs</th><th></th>
              </tr>
            </thead>
            <tbody>
              {activosFiltrados.length ? activosFiltrados.map(a => {
                const deprec = calcDeprec(a);
                const semDoc = semaforoActivo(a);
                return (
                  <tr key={a.id} className="hover-row" style={{ cursor: 'pointer' }} onClick={() => abrirVer(a)}>
                    <td className="mono" style={{ fontWeight: 700 }}>{a.codigo}</td>
                    <td><strong>{a.nombre}</strong>{a.responsable_nombre && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{a.responsable_nombre}</div>}</td>
                    <td>{ACTIVO_TIPOS.find(t => t.value === a.tipo_categoria)?.label || a.tipo_categoria || '-'}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{[a.marca, a.modelo].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{a.placa_serie || '-'}</td>
                    <td style={{ fontSize: 12 }}>{a.ubicacion || '-'}</td>
                    <td style={{ fontSize: 11 }}>{cecoNombre(a.centro_costo_id)}</td>
                    <td><span className={`badge ${badgeEstado(a.estado)}`}>{String(a.estado || '').replace('_', ' ')}</span></td>
                    <td className="num">{money(Number(a.valor_adquisicion || 0), symOf(a.moneda))}</td>
                    <td className="num">
                      {deprec ? (
                        <span title={`Valor actual estimado: ${money(deprec.valorActual, symOf(a.moneda))}`} style={{ fontSize: 12 }}>
                          <span style={{ color: deprec.pct >= 80 ? 'var(--danger)' : deprec.pct >= 50 ? 'var(--orange)' : 'var(--fg-muted)' }}>{deprec.pct}%</span>
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {Array.isArray(a.documentos) && a.documentos.length > 0 ? (
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: colorSemaforo[semDoc] }} title={semDoc} />
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirEditar(a)}>Editar</button>
                        {a.estado !== 'dado_baja' && <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => { setModalBaja(a); setBajaMotivo(''); }}>Baja</button>}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="12" className="text-center text-muted" style={{ padding: 32 }}>
                  {activos.length ? 'Sin resultados para la búsqueda.' : 'No hay activos registrados. Usa "+ Nuevo activo" o importa la plantilla Excel.'}
                </td></tr>
              )}
            </tbody>
          </table></div></div>
        </>
      )}

      {/* ── TAB DESDE COMPRAS ──────────────────────────────────────────────── */}
      {tab === 'compras' && (
        <>
          <div className="row" style={{ gap: 10, marginBottom: 14 }}>
            <div className="text-muted" style={{ fontSize: 13, alignSelf: 'center' }}>Activos registrados a través del módulo Compras/Gastos con flag "es activo fijo".</div>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setPanelC(true)}>{I.plus} Nuevo activo (Compras)</button>
          </div>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
            <div className="kpi-card"><div className="kpi-label">Activos activos</div><div className="kpi-value">{activosComprasActivos.length}</div><div className="kpi-icon green">{I.package}</div></div>
            <div className="kpi-card"><div className="kpi-label">Vida útil cumplida</div><div className="kpi-value" style={{ color: porDarBajaC.length ? 'var(--orange)' : undefined }}>{porDarBajaC.length}</div><div className="kpi-icon orange">{I.clock}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total registrados</div><div className="kpi-value">{activosDeCompras.length}</div><div className="kpi-icon cyan">{I.receipt}</div></div>
          </div>
          <div className="card"><div className="table-wrap"><table className="tbl">
            <thead><tr><th>Código</th><th>Activo</th><th>Tipo</th><th>Adquisición</th><th>Valor</th><th>Vida útil</th><th>CECO</th><th>Estado</th><th>Origen</th></tr></thead>
            <tbody>{activosDeCompras.length ? activosDeCompras.map(a => (
              <tr key={a.id} className="hover-row" style={{ cursor: 'pointer' }} onClick={() => setSelC(a)}>
                <td className="mono" style={{ fontWeight: 700 }}>{a.codigo_af}</td>
                <td><strong>{a.descripcion}</strong></td>
                <td>{ACTIVO_TIPOS.find(t => t.value === a.activo_tipo)?.label || a.activo_tipo || '-'}</td>
                <td className="text-muted">{a.fecha || '-'}</td>
                <td className="num"><strong>{money(Number(a.monto || 0), symOf(a.moneda))}</strong></td>
                <td className="num">{a.vida_util_anos ? `${a.vida_util_anos} años` : '-'}</td>
                <td style={{ fontSize: 11 }}>{cecoNombre(a.centro_costo_id)}</td>
                <td><span className={`badge ${a.activo_estado === 'activo' ? 'badge-green' : a.activo_estado === 'mantenimiento' ? 'badge-orange' : 'badge-gray'}`}>{String(a.activo_estado || '').replace('_', ' ')}</span></td>
                <td>{a.origen_registro === 'backoffice' ? <span className="badge badge-cyan">Backoffice</span> : <span className="badge badge-gray">Compras</span>}</td>
              </tr>
            )) : <tr><td colSpan="9" className="text-center text-muted" style={{ padding: 32 }}>No hay activos fijos registrados en Compras/Gastos.</td></tr>}</tbody>
          </table></div></div>

          {/* Panel Compras: nuevo */}
          {panelC && <><div className="side-panel-backdrop" onClick={resetC} /><div className="side-panel" style={{ width: 'min(520px,96vw)' }}>
            <div className="side-panel-head"><div><div className="eyebrow">Alta desde Compras</div><div style={{ fontWeight: 700, fontSize: 20 }}>Nuevo activo fijo</div></div><button className="icon-btn" onClick={resetC}>{I.x}</button></div>
            <form className="side-panel-body" onSubmit={guardarCompras}>
              <div className="input-group"><label>Nombre / descripción</label><input className="input" value={formC.descripcion} onChange={e => setFormC(v => ({ ...v, descripcion: e.target.value }))} /></div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="input-group"><label>Tipo</label><select className="select" value={formC.activo_tipo} onChange={e => setFormC(v => ({ ...v, activo_tipo: e.target.value }))}>{ACTIVO_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                <div className="input-group"><label>Fecha adquisición</label><input className="input" type="date" value={formC.fecha} onChange={e => setFormC(v => ({ ...v, fecha: e.target.value }))} /></div>
                <div className="input-group"><label>Valor</label><input className="input" type="number" min="0" step="0.01" value={formC.monto} onChange={e => setFormC(v => ({ ...v, monto: e.target.value }))} /></div>
                <div className="input-group"><label>Moneda</label><select className="select" value={formC.moneda} onChange={e => setFormC(v => ({ ...v, moneda: e.target.value }))}><option value="PEN">PEN</option><option value="USD">USD</option></select></div>
                <div className="input-group"><label>Vida útil (años)</label><input className="input" type="number" min="1" step="1" value={formC.vida_util_anos} onChange={e => setFormC(v => ({ ...v, vida_util_anos: e.target.value }))} /></div>
                <div className="input-group"><label>Estado</label><select className="select" value={formC.activo_estado} onChange={e => setFormC(v => ({ ...v, activo_estado: e.target.value }))}><option value="activo">Activo</option><option value="mantenimiento">En mantenimiento</option><option value="dado_baja">Dado de baja</option></select></div>
              </div>
              <div className="input-group"><label>CECO</label><select className="select" value={formC.centro_costo_id} onChange={e => setFormC(v => ({ ...v, centro_costo_id: e.target.value }))}><option value="">Sin CECO</option>{cecos.map(c => <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>)}</select></div>
              <div className="input-group"><label>Proveedor o referencia</label><input className="input" value={formC.proveedor_referencia} onChange={e => setFormC(v => ({ ...v, proveedor_referencia: e.target.value }))} /></div>
              <div className="input-group"><label>Notas</label><textarea className="input" rows="2" value={formC.notas} onChange={e => setFormC(v => ({ ...v, notas: e.target.value }))} /></div>
              <div className="row mt-6" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-secondary" onClick={resetC}>Cancelar</button><button className="btn btn-primary" disabled={guardandoC}>{guardandoC ? 'Guardando...' : 'Guardar'}</button></div>
            </form>
          </div></>}

          {/* Panel Compras: ver detalle */}
          {selC && <><div className="side-panel-backdrop" onClick={() => setSelC(null)} /><div className="side-panel" style={{ width: 'min(520px,96vw)' }}>
            <div className="side-panel-head"><div><div className="eyebrow">{selC.codigo_af}</div><div style={{ fontWeight: 700, fontSize: 20 }}>{selC.descripcion}</div></div><button className="icon-btn" onClick={() => setSelC(null)}>{I.x}</button></div>
            <div className="side-panel-body">
              <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[['Tipo', ACTIVO_TIPOS.find(t => t.value === selC.activo_tipo)?.label || selC.activo_tipo || '-'], ['Estado', selC.activo_estado], ['Fecha adquisición', selC.fecha || '-'], ['Valor', money(Number(selC.monto || 0), symOf(selC.moneda))], ['Vida útil', selC.vida_util_anos ? `${selC.vida_util_anos} años` : '-'], ['CECO', cecoNombre(selC.centro_costo_id)]].map(([l, v]) => (
                    <div key={l}><div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{l}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div></div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 700, marginBottom: 8 }}>Origen del registro</div>
                <div style={{ fontSize: 13 }}>ID: <span className="mono">{selC.id}</span></div>
                <div style={{ fontSize: 13 }}>Ref: {selC.num_comprobante || selC.proveedor_referencia || selC.referencia_pago || '-'}</div>
                {selC.archivo_url && <a className="btn btn-secondary btn-sm mt-4" href={selC.archivo_url} target="_blank" rel="noreferrer">{I.file} Ver adjunto</a>}
              </div>
              {selC.notas && <div className="card" style={{ padding: 14, marginBottom: 14 }}><div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 4 }}>Notas</div><div style={{ fontSize: 13 }}>{selC.notas}</div></div>}
              <div style={{
                padding: '14px 16px', borderRadius: 8,
                background: 'color-mix(in srgb, var(--cyan) 6%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--cyan) 25%, var(--border))',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Promover al Maestro de Activos</div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10 }}>
                  Registra este activo en el Maestro con los campos pre-llenados. Quedará vinculado al egreso de origen.
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => abrirNuevoDesdeCompras(selC)}>
                  {I.plus} Promover al Maestro
                </button>
              </div>
            </div>
          </div></>}
        </>
      )}

      {/* ── PANEL NUEVO / EDITAR (Maestro) ─────────────────────────────────── */}
      {(panel === 'nuevo' || panel === 'editar') && (
        <><div className="side-panel-backdrop" onClick={cerrarPanel} /><div className="side-panel" style={{ width: 'min(580px,96vw)' }}>
          <div className="side-panel-head">
            <div><div className="eyebrow">{panel === 'nuevo' ? 'Alta' : 'Editar'}</div><div style={{ fontWeight: 700, fontSize: 20 }}>{panel === 'nuevo' ? 'Nuevo activo' : selActivo?.nombre}</div></div>
            <button className="icon-btn" onClick={cerrarPanel}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardar}>
            {form.compras_gasto_id && (
              <div style={{
                marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 12,
                background: 'color-mix(in srgb, var(--cyan) 6%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--cyan) 25%, var(--border))',
                color: 'var(--fg-muted)',
              }}>
                Promovido desde Compras/Gastos · <span className="mono" style={{ fontSize: 11 }}>{form.compras_gasto_id}</span>
              </div>
            )}
            <div className="grid-2" style={{ gap: 12 }}>
              <div className="input-group"><label>Código *</label><input className="input" value={form.codigo} onChange={e => setForm(v => ({ ...v, codigo: e.target.value }))} /></div>
              <div className="input-group"><label>Tipo / Categoría</label><select className="select" value={form.tipo_categoria} onChange={e => setForm(v => ({ ...v, tipo_categoria: e.target.value }))}>{ACTIVO_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            </div>
            <div className="input-group"><label>Nombre *</label><input className="input" value={form.nombre} onChange={e => setForm(v => ({ ...v, nombre: e.target.value }))} /></div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div className="input-group"><label>Marca</label><input className="input" value={form.marca} onChange={e => setForm(v => ({ ...v, marca: e.target.value }))} /></div>
              <div className="input-group"><label>Modelo</label><input className="input" value={form.modelo} onChange={e => setForm(v => ({ ...v, modelo: e.target.value }))} /></div>
              <div className="input-group"><label>Placa / Nro serie</label><input className="input" value={form.placa_serie} onChange={e => setForm(v => ({ ...v, placa_serie: e.target.value }))} /></div>
              <div className="input-group"><label>Ubicación</label><input className="input" value={form.ubicacion} onChange={e => setForm(v => ({ ...v, ubicacion: e.target.value }))} /></div>
              <div className="input-group"><label>Estado</label><select className="select" value={form.estado} onChange={e => setForm(v => ({ ...v, estado: e.target.value }))}><option value="operativo">Operativo</option><option value="en_mantenimiento">En mantenimiento</option><option value="dado_baja">Dado de baja</option></select></div>
              <div className="input-group"><label>Fecha de alta</label><input className="input" type="date" value={form.fecha_alta} onChange={e => setForm(v => ({ ...v, fecha_alta: e.target.value }))} /></div>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div className="input-group"><label>Valor adquisición</label><input className="input" type="number" min="0" step="0.01" value={form.valor_adquisicion} onChange={e => setForm(v => ({ ...v, valor_adquisicion: e.target.value }))} /></div>
              <div className="input-group"><label>Moneda</label><select className="select" value={form.moneda} onChange={e => setForm(v => ({ ...v, moneda: e.target.value }))}><option value="PEN">PEN</option><option value="USD">USD</option></select></div>
              <div className="input-group"><label>Vida útil (años)</label><input className="input" type="number" min="0" step="1" value={form.vida_util_anos} onChange={e => setForm(v => ({ ...v, vida_util_anos: e.target.value }))} /></div>
              <div className="input-group"><label>CECO por defecto</label><select className="select" value={form.centro_costo_id} onChange={e => setForm(v => ({ ...v, centro_costo_id: e.target.value }))}><option value="">Sin CECO</option>{cecos.map(c => <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>)}</select></div>
            </div>
            <div className="input-group"><label>Responsable</label><input className="input" placeholder="Nombre del responsable" value={form.responsable_nombre} onChange={e => setForm(v => ({ ...v, responsable_nombre: e.target.value }))} /></div>
            <div className="input-group"><label>Observación</label><textarea className="input" rows="2" value={form.observacion} onChange={e => setForm(v => ({ ...v, observacion: e.target.value }))} /></div>

            {/* Documentos con vencimiento */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Documentos con vencimiento</div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addDoc}>{I.plus} Agregar doc</button>
              </div>
              {formDocs.length === 0 && <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>Sin documentos. Agrega SOAT, pólizas, revisiones técnicas.</div>}
              {formDocs.map((doc, i) => (
                <div key={i} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <div className="grid-2" style={{ gap: 8, marginBottom: 8 }}>
                    <div className="input-group" style={{ marginBottom: 0 }}><label style={{ fontSize: 11 }}>Tipo</label>
                      <select className="select" value={doc.tipo} onChange={e => updDoc(i, 'tipo', e.target.value)}>
                        {DOC_TIPOS_ACTIVO.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="input-group" style={{ marginBottom: 0 }}><label style={{ fontSize: 11 }}>Nombre / descripción</label><input className="input" value={doc.nombre} onChange={e => updDoc(i, 'nombre', e.target.value)} /></div>
                    <div className="input-group" style={{ marginBottom: 0 }}><label style={{ fontSize: 11 }}>Vencimiento</label><input className="input" type="date" value={doc.fecha_vencimiento} onChange={e => updDoc(i, 'fecha_vencimiento', e.target.value)} /></div>
                    <div className="input-group" style={{ marginBottom: 0 }}><label style={{ fontSize: 11 }}>Días de alerta</label><input className="input" type="number" min="0" step="1" value={doc.dias_alerta} onChange={e => updDoc(i, 'dias_alerta', e.target.value)} /></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {doc.fecha_vencimiento ? (
                      <span style={{ fontSize: 11, color: colorSemaforo[semaforo(doc)] }}>
                        ● {semaforo(doc) === 'verde' ? 'Vigente' : semaforo(doc) === 'amarillo' ? 'Por vencer' : 'VENCIDO'}
                      </span>
                    ) : <span />}
                    <button type="button" className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => delDoc(i)}>Quitar</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="row mt-6" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={cerrarPanel}>Cancelar</button>
              <button className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : panel === 'nuevo' ? 'Crear activo' : 'Guardar cambios'}</button>
            </div>
          </form>
        </div></>
      )}

      {/* ── PANEL VER DETALLE (Maestro) ─────────────────────────────────────── */}
      {panel === 'ver' && selActivo && (
        <><div className="side-panel-backdrop" onClick={cerrarPanel} /><div className="side-panel" style={{ width: 'min(560px,96vw)' }}>
          <div className="side-panel-head">
            <div><div className="eyebrow">{selActivo.codigo}</div><div style={{ fontWeight: 700, fontSize: 20 }}>{selActivo.nombre}</div></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => abrirEditar(selActivo)}>Editar</button>
              {selActivo.estado !== 'dado_baja' && (
                <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => { setModalBaja(selActivo); setBajaMotivo(''); cerrarPanel(); }}>Dar de baja</button>
              )}
              <button className="icon-btn" onClick={cerrarPanel}>{I.x}</button>
            </div>
          </div>
          <div className="side-panel-body">
            {/* Ficha */}
            <div className="card" style={{ padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Tipo', ACTIVO_TIPOS.find(t => t.value === selActivo.tipo_categoria)?.label || selActivo.tipo_categoria || '-'],
                  ['Estado', String(selActivo.estado || '').replace('_', ' ')],
                  ['Marca / Modelo', [selActivo.marca, selActivo.modelo].filter(Boolean).join(' / ') || '-'],
                  ['Placa / Serie', selActivo.placa_serie || '-'],
                  ['Ubicación', selActivo.ubicacion || '-'],
                  ['Responsable', selActivo.responsable_nombre || '-'],
                  ['CECO', cecoNombre(selActivo.centro_costo_id)],
                  ['Fecha alta', selActivo.fecha_alta || '-'],
                ].map(([l, v]) => <div key={l}><div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{l}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div></div>)}
              </div>
            </div>

            {/* Depreciación referencial */}
            {(() => { const d = calcDeprec(selActivo); return d ? (
              <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 700, marginBottom: 8 }}>Depreciación referencial lineal</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Valor adquisición</div><strong>{money(Number(selActivo.valor_adquisicion || 0), symOf(selActivo.moneda))}</strong></div>
                  <div><div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Valor actual est.</div><strong>{money(d.valorActual, symOf(selActivo.moneda))}</strong></div>
                  <div><div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Depreciado</div><strong style={{ color: d.pct >= 80 ? 'var(--danger)' : d.pct >= 50 ? 'var(--orange)' : undefined }}>{d.pct}%</strong></div>
                </div>
                <div style={{ background: 'var(--border-subtle)', borderRadius: 4, height: 6, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${d.pct}%`, height: '100%', background: d.pct >= 80 ? 'var(--danger)' : d.pct >= 50 ? 'var(--orange)' : 'var(--success)', borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>Vida útil: {selActivo.vida_util_anos} años · Inicio: {selActivo.fecha_alta}</div>
              </div>
            ) : null; })()}

            {/* Documentos */}
            {Array.isArray(selActivo.documentos) && selActivo.documentos.length > 0 && (
              <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 700, marginBottom: 8 }}>Documentos con vencimiento</div>
                {selActivo.documentos.map((doc, i) => {
                  const s = semaforo(doc);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < selActivo.documentos.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{doc.tipo}{doc.nombre ? ` — ${doc.nombre}` : ''}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Vence: {doc.fecha_vencimiento || 'Sin fecha'}</div>
                      </div>
                      <span style={{ fontSize: 12, color: colorSemaforo[s], fontWeight: 700 }}>
                        ● {s === 'verde' ? 'Vigente' : s === 'amarillo' ? 'Por vencer' : s === 'rojo' ? 'VENCIDO' : 'Sin fecha'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {selActivo.observacion && (
              <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 4 }}>Observación</div>
                <div style={{ fontSize: 13 }}>{selActivo.observacion}</div>
              </div>
            )}

            {selActivo.estado === 'dado_baja' && selActivo.baja_motivo && (
              <div className="card" style={{ padding: 14, border: '1px solid var(--danger)', background: 'var(--danger-lt)' }}>
                <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 700, marginBottom: 4 }}>Dado de baja</div>
                <div style={{ fontSize: 13 }}>{selActivo.baja_motivo}</div>
                {selActivo.baja_at && <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>{selActivo.baja_at.slice(0, 10)}</div>}
              </div>
            )}
          </div>
        </div></>
      )}

      {/* ── MODAL BAJA ────────────────────────────────────────────────────────── */}
      {modalBaja && (
        <><div className="side-panel-backdrop" onClick={() => setModalBaja(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 'min(460px,96vw)', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Dar de baja: {modalBaja.nombre}</div>
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>Esta acción desactiva el activo. El registro queda con historial completo (no se elimina).</div>
            <div className="input-group">
              <label>Motivo de baja *</label>
              <textarea className="input" rows="3" placeholder="Ej: Siniestro total, fin de vida útil, venta..." value={bajaMotivo} onChange={e => setBajaMotivo(e.target.value)} />
            </div>
            <div className="row mt-6" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setModalBaja(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={confirmarBaja}>Confirmar baja</button>
            </div>
          </div>
        </>
      )}
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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import {
  consultarPermisosLiquidacion, crearLiquidacion, listarLiquidaciones, listarPorLiquidar, listarRendiciones,
} from '../../../services/transporteLiquidacionService.js';
import { fechaLima, hoyLima } from '../../../../../src/lib/transporteLogistica.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { etiquetaContador, formatearImporte } from './transporteUtils.js';
import { LiquidacionDetalle } from './LiquidacionDetalle.jsx';
import { RendicionDetalle } from './RendicionDetalle.jsx';
import { DialogoLiq, ESTADO_LIQ, ESTADO_REN, fechaDMY, nombreCuenta } from './liquidacionComun.jsx';

const TABS = [['liq', 'Liquidaciones'], ['por', 'Por liquidar'], ['ren', 'Rendiciones de conductores']];
const FILTROS = [['', 'Todas'], ['borrador', 'Borrador'], ['en_revision', 'En revisión'], ['con_cliente', 'Con el cliente'],
  ['aprobada', 'Aprobadas'], ['en_ventas', 'En Ventas'], ['anulada', 'Anuladas']];
const sumaPorMoneda = (filas, campo) => {
  const por = filas.reduce((acc, f) => { acc[f.moneda || 'PEN'] = (acc[f.moneda || 'PEN'] || 0) + Number(f[campo] || 0); return acc; }, {});
  const partes = Object.entries(por).filter(([, v]) => v).map(([m, v]) => formatearImporte(v, m));
  return partes.length ? partes.join(' · ') : formatearImporte(0, 'PEN');
};

function CrearLiquidacion({ empresaId, grupo, onClose, onCreada }) {
  const fechas = grupo.viajes.map(v => fechaLima(v.fecha_programada)).filter(Boolean).sort();
  const [desde, setDesde] = useState(fechas[0] ? `${fechas[0].slice(0, 7)}-01` : hoyLima());
  const [hasta, setHasta] = useState(fechas.at(-1) || hoyLima());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errHasta = desde && hasta && hasta < desde ? 'Debe ser igual o posterior a «Desde».' : '';
  async function crear() {
    if (!desde || !hasta || errHasta) return;
    setBusy(true); setError('');
    try { const liq = await crearLiquidacion(empresaId, grupo.cuentaId, desde, hasta, grupo.viajes.map(v => v.id)); onCreada(liq); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  return <DialogoLiq title="Nueva liquidación" subtitle={`${grupo.nombre} · ${etiquetaContador(grupo.viajes.length, 'viaje')}`} busy={busy} onClose={onClose}
    error={error} footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="dx-btn primary" onClick={crear} disabled={busy || !!errHasta}>{busy ? 'Creando…' : 'Crear liquidación'}</button></>}>
    <div className="dx-tmsliq-fgrid">
      <label className="dx-ui-field" htmlFor="liq-desde"><span>Desde <b className="dx-ui-required">*</b></span>
        <input id="liq-desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
      <label className="dx-ui-field" htmlFor="liq-hasta"><span>Hasta <b className="dx-ui-required">*</b></span>
        <input id="liq-hasta" type="date" value={hasta} aria-invalid={!!errHasta} onChange={e => setHasta(e.target.value)} />
        {errHasta && <small className="dx-ui-field-error">{errHasta}</small>}</label>
    </div>
    <ul className="dx-tmsliq-mini-list">{grupo.viajes.map(v => <li key={v.id}><b>{v.codigo}</b>
      <span>{fechaDMY(v.fecha_programada)} · {v.origen_nombre} → {v.destino_nombre}</span>
      <em>{formatearImporte(v.ingreso_estimado, v.moneda)}</em></li>)}</ul>
    <p className="dx-tmsliq-help">Los viajes pasan a «En liquidación». La espera, los peajes y los gastos del conductor se calculan solos; luego puedes agregar recargos.</p>
  </DialogoLiq>;
}

export function LiquidacionTransportePage({ onNav, routeParams = {} }) {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const [perm, setPerm] = useState({ crear: false, editar: false, aprobar: false, anular: false });
  const [tab, setTab] = useState(routeParams.tab || 'liq');
  const [liqs, setLiqs] = useState([]);
  const [por, setPor] = useState([]);
  const [rens, setRens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('');
  const [quitados, setQuitados] = useState(() => new Set());
  const [crear, setCrear] = useState(null);

  useEffect(() => { if (routeParams.tab) setTab(routeParams.tab); }, [routeParams.tab]);
  useEffect(() => {
    if (!empresaId || !access.ver) return;
    consultarPermisosLiquidacion(empresaId).then(setPerm).catch(() => {});
  }, [empresaId, access.ver]);
  const reload = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true); setError('');
    try {
      const [a, b, c] = await Promise.all([listarLiquidaciones(empresaId), listarPorLiquidar(empresaId), listarRendiciones(empresaId)]);
      setLiqs(a); setPor(b); setRens(c);
    } catch (e) { setError(e.message || 'No se pudo cargar la liquidación.'); }
    finally { setLoading(false); }
  }, [empresaId, access.ver]);
  useEffect(() => { if (!routeParams.id && !routeParams.rendicion) reload(); }, [reload, routeParams.id, routeParams.rendicion]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    por.forEach(v => {
      const clave = `${v.cuenta_id}|${v.moneda || 'PEN'}`;
      if (!mapa.has(clave)) mapa.set(clave, { clave, cuentaId: v.cuenta_id, moneda: v.moneda || 'PEN', nombre: nombreCuenta(v.cuenta), viajes: [] });
      mapa.get(clave).viajes.push(v);
    });
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [por]);
  const liqsVisibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return liqs.filter(l => (!filtro || l.estado === filtro)
      && (!q || `${l.numero} ${nombreCuenta(l.cuenta)}`.toLowerCase().includes(q)));
  }, [liqs, buscar, filtro]);

  if (access.motivo) return <AccesoTransporte acceso={access} />;
  if (routeParams.id) return <LiquidacionDetalle id={routeParams.id} empresaId={empresaId} perm={perm} onNav={onNav} sesion={sesion} />;
  if (routeParams.rendicion) return <RendicionDetalle viajeId={routeParams.rendicion} empresaId={empresaId} perm={perm} onNav={onNav} />;

  const mes = hoyLima().slice(0, 7);
  const enVentasMes = liqs.filter(l => l.estado === 'en_ventas' && String(l.en_ventas_at || '').slice(0, 7) === mes);
  const renPorRevisar = rens.filter(r => r.estado === 'abierta' && r.n_pendientes > 0);
  const abrirLiq = id => onNav?.('transporte-liquidacion', { id });
  const teclado = (event, fn) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fn(); } };

  return <section className="dx-ui dx-tms dx-tmsliq">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Transporte · Comercial</div>
      <h1 className="dx-ui-title">Liquidación</h1>
      <p className="dx-ui-sub">Junta los viajes entregados de cada cliente, calcula recargos y margen, y los envía a Ventas para facturar.</p></div>
      {perm.crear && <div className="dx-ui-actions"><button type="button" className="dx-btn primary" onClick={() => setTab('por')}>＋ Nueva liquidación</button></div>}
    </header>

    <div className="dx-ui-kpi-row">
      <div className="dx-ui-kpi" title={`${sumaPorMoneda(por, 'ingreso_estimado')} de flete`}><strong>{por.length}</strong><span>Viajes por liquidar</span></div>
      <div className="dx-ui-kpi"><strong>{liqs.filter(l => l.estado === 'en_revision').length}</strong><span>En revisión</span></div>
      <div className="dx-ui-kpi"><strong>{liqs.filter(l => l.estado === 'con_cliente').length}</strong><span>Esperando al cliente</span></div>
      <div className="dx-ui-kpi"><strong>{renPorRevisar.length}</strong><span>Rendiciones por revisar</span></div>
      <div className="dx-ui-kpi"><strong>{sumaPorMoneda(enVentasMes, 'total')}</strong><span>A Ventas este mes</span></div>
    </div>

    <div className="dx-tmsliq-tabs" role="tablist" aria-label="Vistas de liquidación">
      {TABS.map(([clave, texto]) => <button key={clave} type="button" role="tab" aria-selected={tab === clave}
        className={tab === clave ? 'is-on' : ''} onClick={() => setTab(clave)}>{texto}</button>)}</div>

    {loading ? <div className="dx-tms-skeletons" aria-label="Cargando">{[1, 2, 3].map(k => <div key={k} className="dx-tms-sk" />)}</div>
      : error ? <div className="dx-ui-card dx-tms-state"><span className="dx-tms-state-i is-red">!</span><b>No pudimos cargar la liquidación</b>
        <span>{error}</span><button type="button" className="dx-btn primary" onClick={reload}>Reintentar</button></div>
        : tab === 'liq' ? <div className="dx-ui-card">
          <div className="dx-ui-toolbar"><h2>Liquidaciones <span className="dx-tmsliq-count">{etiquetaContador(liqsVisibles.length, 'liquidación', 'liquidaciones')}</span></h2>
            <label className="dx-ui-search"><span aria-hidden="true">⌕</span><input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Buscar cliente o código" aria-label="Buscar liquidación" /></label></div>
          <div className="dx-tms-filters dx-tmsliq-filters">{FILTROS.map(([clave, texto]) => <button key={clave || 'todas'} type="button"
            className={`dx-tms-fchip${filtro === clave ? ' is-on' : ''}`} aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>{texto}</button>)}</div>
          {!liqsVisibles.length ? <div className="dx-tms-state"><span className="dx-tms-state-i">S/</span>
            <b>{liqs.length ? 'Nada con este filtro' : 'Aún no hay liquidaciones'}</b>
            <span>{liqs.length ? 'Prueba con otro estado o búsqueda.' : 'Crea la primera desde «Por liquidar» cuando haya viajes entregados.'}</span></div>
            : liqsVisibles.map(l => {
              const [tono, texto] = ESTADO_LIQ[l.estado] || ['is-gray', l.estado];
              return <div key={l.id} className="dx-tmsliq-row" role="button" tabIndex={0} onClick={() => abrirLiq(l.id)} onKeyDown={e => teclado(e, () => abrirLiq(l.id))}>
                <div><b>{l.numero}</b><small>{fechaDMY(l.periodo_desde)} – {fechaDMY(l.periodo_hasta)} · {etiquetaContador(l.n_viajes, 'viaje')}</small></div>
                <div className="dx-tmsliq-hide">{nombreCuenta(l.cuenta)}</div>
                <div className="dx-tmsliq-num">{formatearImporte(l.total, l.moneda)}<small>con IGV</small></div>
                <div><span className={`dx-ui-pill ${tono}`}><i />{texto}</span></div><span className="dx-tmsliq-arrow" aria-hidden="true">›</span>
              </div>;
            })}
        </div>
          : tab === 'por' ? <div className="dx-ui-card">
            <div className="dx-ui-toolbar"><h2>Viajes entregados por liquidar <span className="dx-tmsliq-count">{etiquetaContador(por.length, 'viaje')}</span></h2>
              {por.length > 0 && <span className="dx-tmsliq-help">{sumaPorMoneda(por, 'ingreso_estimado')} de flete sin IGV</span>}</div>
            {!grupos.length ? <div className="dx-tms-state"><span className="dx-tms-state-i">✓</span><b>No hay viajes por liquidar</b>
              <span>Los viajes comerciales aparecen aquí cuando se entregan.</span></div>
              : grupos.map(g => {
                const elegidos = g.viajes.filter(v => !quitados.has(v.id));
                return <section key={g.clave} className="dx-tmsliq-group" aria-label={g.nombre}>
                  <header><b>{g.nombre}</b><span className="dx-tmsliq-count">{etiquetaContador(g.viajes.length, 'viaje')}</span>
                    <div className="dx-tmsliq-group-r"><span>Flete {formatearImporte(elegidos.reduce((s, v) => s + Number(v.ingreso_estimado || 0), 0), g.moneda)}</span>
                      {perm.crear && <button type="button" className="dx-btn primary" disabled={!elegidos.length}
                        onClick={() => setCrear({ ...g, viajes: elegidos })}>Crear liquidación</button>}</div></header>
                  {g.viajes.map(v => <label key={v.id} className="dx-tmsliq-trip" htmlFor={`liqv-${v.id}`}>
                    <input id={`liqv-${v.id}`} type="checkbox" checked={!quitados.has(v.id)} onChange={() => setQuitados(old => {
                      const s = new Set(old); if (s.has(v.id)) s.delete(v.id); else s.add(v.id); return s; })} />
                    <span><b>{v.codigo}</b>{v.os && <span className="dx-ui-pill is-violet">{v.os.numero}</span>}
                      <small>{fechaDMY(v.fecha_programada)} · {v.origen_nombre} → {v.destino_nombre}</small></span>
                    <span className="dx-tmsliq-hide"><small>{v.vehiculo?.placa || 'Sin unidad'} · {v.conductor?.nombre || 'Sin conductor'}</small></span>
                    <span className="dx-tmsliq-num">{formatearImporte(v.ingreso_estimado, v.moneda)}<small>flete</small></span>
                  </label>)}
                </section>;
              })}
          </div>
            : <div className="dx-ui-card">
              <div className="dx-ui-toolbar"><h2>Rendiciones de gastos <span className="dx-tmsliq-count">{etiquetaContador(rens.length, 'rendición', 'rendiciones')}</span></h2></div>
              {!rens.length ? <div className="dx-tms-state"><span className="dx-tms-state-i">⛽</span><b>No hay rendiciones</b>
                <span>Se abren solas cuando el conductor registra su primer gasto en la app.</span></div>
                : rens.map(r => {
                  const [tono, texto] = r.estado === 'aprobada' ? ESTADO_REN.aprobada
                    : r.n_pendientes ? ESTADO_REN.por_revisar : ESTADO_REN.abierta;
                  const abrir = () => onNav?.('transporte-liquidacion', { rendicion: r.viaje_id });
                  return <div key={r.id} className="dx-tmsliq-row" role="button" tabIndex={0} onClick={abrir} onKeyDown={e => teclado(e, abrir)}>
                    <div><b>{r.numero}</b><small>{r.viaje?.conductor?.nombre || 'Sin conductor'}</small></div>
                    <div className="dx-tmsliq-hide">{r.viaje?.codigo} · {etiquetaContador(r.n_gastos, 'gasto')}{r.n_pendientes ? ` · ${r.n_pendientes} por revisar` : ''}</div>
                    <div className="dx-tmsliq-num">{formatearImporte(r.total_gastado, r.moneda)}<small>gastado</small></div>
                    <div><span className={`dx-ui-pill ${tono}`}><i />{texto}</span></div><span className="dx-tmsliq-arrow" aria-hidden="true">›</span>
                  </div>;
                })}
            </div>}

    {crear && <CrearLiquidacion empresaId={empresaId} grupo={crear} onClose={() => setCrear(null)}
      onCreada={liq => { setCrear(null); abrirLiq(liq.id); }} />}
  </section>;
}

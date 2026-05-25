// BI Financiero — Rentabilidad · CxC/CxP · Flujo de Caja · Presupuesto vs Real
// Datos reales: buildEstadoResultados, cxc, cxp, movimientosTesoreria

import React, { useState, useMemo } from 'react';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { buildEstadoResultados } from './services/estadoResultadosService.js';

const S = (n) => n == null ? '—' : 'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const P = (n) => n == null ? '—' : Number(n).toFixed(1) + '%';
const vc = (v) => v >= 0 ? 'var(--green)' : 'var(--danger)';
const vi = (v) => v >= 0 ? '▲' : '▼';
const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function KPI({ label, value, sub, subColor }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub" style={{ color: subColor }}>{sub}</div>}
    </div>
  );
}

function BarH({ value, max, color = 'var(--cyan)' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ background: 'var(--bg-subtle)', borderRadius: 4, height: 8, width: '100%' }}>
      <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 4, transition: 'width .3s' }} />
    </div>
  );
}

function MultiSelect({ opts, sel, onSel, placeholder }) {
  const [open, setOpen] = useState(false);
  const allSel = sel.length === 0;
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="select" style={{ cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minWidth: 160 }} onClick={() => setOpen(o => !o)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {allSel ? placeholder : `${sel.length} seleccionado${sel.length > 1 ? 's' : ''}`}
        </span>
        <span style={{ color: 'var(--fg-muted)', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: 220, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.15)', zIndex: 100, maxHeight: 240, overflowY: 'auto' }}>
            <div onClick={() => { onSel([]); setOpen(false); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: allSel ? 700 : 400, background: allSel ? 'var(--bg-subtle)' : 'transparent', borderBottom: '1px solid var(--border-subtle)' }}>
              Todos
            </div>
            {opts.map(o => {
              const on = sel.includes(o.id);
              return (
                <div key={o.id} onClick={() => onSel(on ? sel.filter(x => x !== o.id) : [...sel, o.id])} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, background: on ? 'var(--bg-subtle)' : 'transparent' }}>
                  <span style={{ width: 14, height: 14, border: '2px solid ' + (on ? 'var(--cyan)' : 'var(--border)'), borderRadius: 3, background: on ? 'var(--cyan)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 9 }}>{on ? '✓' : ''}</span>
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

// ─── TAB 1: Rentabilidad ──────────────────────────────────────────────────────

function TabRentabilidad({ data }) {
  const maxFact = Math.max(1, ...data.margen_por_cliente.map(c => c.facturacion));
  const maxEvol = Math.max(1, ...data.evolucion_margen.map(e => e.facturacion));
  const rColor = { bajo: 'badge-green', medio: 'badge-yellow', alto: 'badge-red' };

  return (
    <div style={{ display: 'grid', gap: 24 }}>

      {/* Evolución facturación + margen mensual */}
      <div className="card">
        <div className="card-header"><span className="card-title">Evolución Facturación y Margen (6 meses)</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 160, padding: '8px 0' }}>
          {data.evolucion_margen.map((e, i) => {
            const isLast = i === data.evolucion_margen.length - 1;
            const h = maxEvol > 0 ? Math.round((e.facturacion / maxEvol) * 120) : 4;
            const hMargen = Math.round(h * (e.margen_pct || 0) / 100);
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color: isLast ? 'var(--green)' : 'var(--fg-subtle)', fontWeight: isLast ? 700 : 400 }}>{P(e.margen_pct)}</div>
                <div style={{ width: '100%', height: Math.max(h, 4), background: isLast ? 'var(--cyan)' : 'var(--border)', borderRadius: '4px 4px 0 0', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: hMargen, background: isLast ? 'var(--green)' : 'var(--fg-subtle)', opacity: 0.55 }} />
                </div>
                <div style={{ fontSize: 10, color: isLast ? 'var(--fg)' : 'var(--fg-muted)', fontWeight: isLast ? 700 : 400 }}>{e.mes}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--fg-subtle)', paddingTop: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--border)', borderRadius: 2, display: 'inline-block' }} /> Facturación</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--fg-subtle)', opacity: 0.55, borderRadius: 2, display: 'inline-block' }} /> Margen bruto</span>
        </div>
      </div>

      {/* Rentabilidad por cliente */}
      <div className="card">
        <div className="card-header"><span className="card-title">Rentabilidad por Cliente</span></div>
        {data.margen_por_cliente.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>Sin datos de CxC u OTs para el período seleccionado</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Cliente</th><th>Facturación</th><th>Costo</th><th>Margen S/</th><th>Margen %</th><th>OTs</th><th>Riesgo</th><th style={{ width: 100 }}>Ejecución</th></tr>
            </thead>
            <tbody>
              {data.margen_por_cliente.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                  <td>{S(c.facturacion)}</td>
                  <td style={{ color: 'var(--fg-subtle)' }}>{S(c.costo)}</td>
                  <td style={{ color: c.margen >= 0 ? 'var(--green)' : 'var(--danger)', fontWeight: 600 }}>{S(c.margen)}</td>
                  <td style={{ fontWeight: 700, color: c.margen_pct >= 40 ? 'var(--green)' : c.margen_pct >= 30 ? 'var(--warning)' : 'var(--danger)' }}>{P(c.margen_pct)}</td>
                  <td>{c.ots}</td>
                  <td><span className={'badge ' + rColor[c.riesgo]}>{c.riesgo}</span></td>
                  <td><BarH value={c.facturacion} max={maxFact} color={c.margen_pct >= 40 ? 'var(--green)' : c.margen_pct >= 30 ? 'var(--warning)' : 'var(--danger)'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Mix de costos por tipo */}
      <div className="card">
        <div className="card-header"><span className="card-title">Distribución de Costos por Categoría</span><span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Ordenado por monto</span></div>
        {data.margen_por_servicio.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>Sin datos de gastos para el período seleccionado</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
            {data.margen_por_servicio.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 100px 70px', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{s.servicio}</span>
                <BarH value={s.margen_pct} max={100} color={s.margen_pct >= 40 ? 'var(--cyan)' : s.margen_pct >= 20 ? 'var(--warning)' : 'var(--border)'} />
                <span style={{ fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'right' }}>{S(s.facturacion)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)', textAlign: 'right' }}>{P(s.margen_pct)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB 2: CxC / CxP ────────────────────────────────────────────────────────

function TabCxCxP({ data }) {
  const aging = data.cxc_antiguedad;
  const buckets = [
    { label: 'Vigente',  ...aging.vigente, color: 'var(--green)' },
    { label: '1-30 d',  ...aging.d30,     color: 'var(--cyan)' },
    { label: '31-60 d', ...aging.d60,     color: 'var(--warning)' },
    { label: '61-90 d', ...aging.d90,     color: 'var(--orange, #f97316)' },
    { label: '+90 d',   ...aging.mas90,   color: 'var(--danger)' },
  ];
  const total = buckets.reduce((s, b) => s + (b.monto || 0), 0);
  const maxMonto = Math.max(1, ...buckets.map(b => b.monto || 0));

  return (
    <div style={{ display: 'grid', gap: 24 }}>

      {/* Pirámide de antigüedad CxC */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Antigüedad de Saldos — CxC</span>
          <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Total: {S(total)} · {buckets.reduce((s, b) => s + (b.clientes || 0), 0)} clientes</span>
        </div>
        {total === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>Sin CxC activas registradas</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 140, padding: '8px 0' }}>
              {buckets.map((b, i) => {
                const h = Math.round(((b.monto || 0) / maxMonto) * 110);
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg)' }}>{S(b.monto)}</div>
                    <div style={{ width: '100%', height: Math.max(h, 2), background: b.color, borderRadius: '4px 4px 0 0' }} />
                    <div style={{ fontSize: 10, color: 'var(--fg-muted)', textAlign: 'center' }}>{b.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>{b.clientes} cli.</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              {buckets.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span style={{ width: 10, height: 10, background: b.color, borderRadius: 2, display: 'inline-block' }} />
                  <span style={{ color: 'var(--fg-subtle)' }}>{b.label}: <strong>{total > 0 ? P((b.monto || 0) / total * 100) : '0.0%'}</strong></span>
                </div>
              ))}
            </div>
            {(aging.mas90?.monto || 0) > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,.08)', borderRadius: 8, borderLeft: '3px solid var(--danger)', fontSize: 13 }}>
                ⚠ <strong>{S(aging.mas90.monto)}</strong> con más de 90 días — {aging.mas90.clientes} cliente(s). Revisar inmediatamente.
              </div>
            )}
          </>
        )}
      </div>

      {/* CxP próximos vencimientos */}
      <div className="card">
        <div className="card-header"><span className="card-title">CxP — Próximos Vencimientos</span></div>
        {data.cxp_proximos.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>Sin CxP con vencimientos pendientes</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Proveedor</th><th>Categoría</th><th>Monto</th><th>Fecha vence</th><th>Días</th></tr>
            </thead>
            <tbody>
              {data.cxp_proximos.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{p.proveedor}</td>
                  <td>{p.categoria}</td>
                  <td style={{ fontWeight: 600 }}>{S(p.monto)}</td>
                  <td>{p.vence}</td>
                  <td>
                    <span className={'badge ' + (p.dias <= 5 ? 'badge-red' : p.dias <= 10 ? 'badge-yellow' : 'badge-green')}>
                      {p.dias}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── TAB 3: Flujo de Caja ────────────────────────────────────────────────────

function TabFlujoCaja({ data }) {
  const semanas = data.flujo_caja;
  const confirmados = semanas.filter(s => s.ing_real != null);
  const ingConf  = confirmados.reduce((s, r) => s + (r.ing_real || 0), 0);
  const egrConf  = confirmados.reduce((s, r) => s + (r.egr_real || 0), 0);

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="card">
        <div className="card-header"><span className="card-title">Flujo de Caja — Movimientos Reales (últimas 8 semanas)</span></div>
        {semanas.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>Sin movimientos de tesorería registrados</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th style={{ textAlign: 'right' }}>Ing. Real</th>
                    <th style={{ textAlign: 'right' }}>Egr. Real</th>
                    <th style={{ textAlign: 'right' }}>Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {semanas.map((s, i) => {
                    const neto = s.ing_real != null && s.egr_real != null ? s.ing_real - s.egr_real : null;
                    const pending = s.ing_real == null;
                    return (
                      <tr key={i} style={{ opacity: pending ? 0.5 : 1 }}>
                        <td style={{ fontWeight: 600 }}>
                          {s.semana}
                          {pending && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>sin datos</span>}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: pending ? 400 : 600 }}>
                          {s.ing_real != null ? S(s.ing_real) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: pending ? 400 : 600 }}>
                          {s.egr_real != null ? S(s.egr_real) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: neto != null ? vc(neto) : 'var(--fg-muted)' }}>
                          {neto != null ? S(neto) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 16, padding: '14px 0 4px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 4 }}>Ingresos confirmados</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{S(ingConf)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 4 }}>Egresos confirmados</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{S(egrConf)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 4 }}>Neto confirmado</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: vc(ingConf - egrConf) }}>{S(ingConf - egrConf)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TAB 4: Presupuesto vs Real (módulo completo) ────────────────────────────

const CATEGORIAS_PRESUPUESTO = ['Materiales','Servicios terceros','Logística','Administrativos','Comerciales','Gastos financieros','Mano de obra'];

const BADGE_PRE = {
  borrador:      { label: 'Borrador',      color: 'var(--fg-muted)', bg: 'var(--bg-subtle)' },
  en_aprobacion: { label: 'En aprobación', color: 'var(--warning)',  bg: 'rgba(245,158,11,.12)' },
  aprobado:      { label: 'Aprobado',      color: 'var(--green)',    bg: 'rgba(34,197,94,.12)' },
  rechazado:     { label: 'Rechazado',     color: 'var(--danger)',   bg: 'rgba(239,68,68,.12)' },
  cerrado:       { label: 'Cerrado',       color: 'var(--fg-muted)', bg: 'var(--bg-subtle)' },
};

function BadgePre({ estado }) {
  const b = BADGE_PRE[estado] || BADGE_PRE.borrador;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, color: b.color, background: b.bg }}>{b.label}</span>;
}

function TabPresupuesto({ periodo, efectivoCecos }) {
  const {
    presupuestos, presupuestoPartidas, presupuestoAprobaciones,
    crearPresupuesto, enviarPresupuestoAAprobacion, procesarAprobacionPresupuesto,
    comprasGastos, ots, usuarios, empresa, authUser,
    centrosCosto, centrosBeneficio,
  } = useApp();

  const [subTab, setSubTab]         = useState('partidas');
  const [preSelId, setPreSelId]     = useState(null);
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [panelDetalle, setPanelDetalle] = useState(null);
  const [panelEnviar, setPanelEnviar]   = useState(false);
  const [formPre, setFormPre]       = useState({ nombre: '', periodo, centro_costo_id: '', cebe_id: '' });
  const [formPartidas, setFormPartidas] = useState([{ categoria: 'Materiales', descripcion: '', monto_presupuestado: '' }]);
  const [aprobadores, setAprobadores]   = useState([null]);
  const [comentarioApr, setComentarioApr] = useState('');
  const [saving, setSaving]         = useState(false);

  const empresaId = empresa?.id;

  const presDePeriodo = (presupuestos || []).filter(p => p.empresa_id === empresaId && p.periodo === periodo);
  const presActivo = preSelId
    ? (presupuestos || []).find(p => p.id === preSelId)
    : presDePeriodo[0] || null;

  const partidas = useMemo(() =>
    presActivo ? (presupuestoPartidas || []).filter(p => p.presupuesto_id === presActivo.id).sort((a, b) => a.orden - b.orden) : [],
    [presActivo, presupuestoPartidas]);

  const cadena = useMemo(() =>
    presActivo ? (presupuestoAprobaciones || []).filter(a => a.presupuesto_id === presActivo.id).sort((a, b) => a.orden - b.orden) : [],
    [presActivo, presupuestoAprobaciones]);

  const esPeriodoMensual = periodo.length === 7;

  const calcularReal = (categoria) => {
    if (categoria === 'Mano de obra') {
      return (ots || []).filter(o => {
        if (o.empresa_id !== empresaId) return false;
        const otP = esPeriodoMensual ? (o.fecha_cierre || o.fecha_inicio || '').slice(0, 7) : (o.fecha_cierre || o.fecha_inicio || '').slice(0, 4);
        if (otP !== periodo) return false;
        if (!['cerrada', 'facturada'].includes(o.estado)) return false;
        if (presActivo?.centro_costo_id && o.centro_costo_id && o.centro_costo_id !== presActivo.centro_costo_id) return false;
        return true;
      }).reduce((s, o) => s + Number(o.costo_real || 0), 0);
    }
    return (comprasGastos || []).filter(g => {
      if (g.empresa_id !== empresaId) return false;
      const gP = esPeriodoMensual ? (g.fecha || '').slice(0, 7) : (g.fecha || '').slice(0, 4);
      if (gP !== periodo || g.categoria !== categoria) return false;
      if (efectivoCecos && !efectivoCecos.includes(g.centro_costo_id)) return false;
      return true;
    }).reduce((s, g) => s + Number(g.monto || 0), 0);
  };

  const getDesglose = (categoria) => {
    if (categoria === 'Mano de obra') {
      return (ots || [])
        .filter(o => {
          if (o.empresa_id !== empresaId) return false;
          const otP = esPeriodoMensual ? (o.fecha_cierre || o.fecha_inicio || '').slice(0, 7) : (o.fecha_cierre || o.fecha_inicio || '').slice(0, 4);
          return otP === periodo && ['cerrada', 'facturada'].includes(o.estado);
        })
        .map(o => ({ fecha: o.fecha_cierre || o.fecha_inicio || '', descripcion: o.numero ? `OT ${o.numero}` : o.nombre || 'OT', proveedor: o.tecnico_lider || '—', monto: Number(o.costo_real || 0), documento: o.numero || '—' }));
    }
    return (comprasGastos || [])
      .filter(g => {
        if (g.empresa_id !== empresaId) return false;
        const gP = esPeriodoMensual ? (g.fecha || '').slice(0, 7) : (g.fecha || '').slice(0, 4);
        return gP === periodo && g.categoria === categoria;
      })
      .map(g => ({ fecha: g.fecha || '', descripcion: g.descripcion || '—', proveedor: g.proveedor || '—', monto: Number(g.monto || 0), documento: g.numero_documento || g.factura || '—' }));
  };

  const totPres = partidas.reduce((s, p) => s + Number(p.monto_presupuestado || 0), 0);
  const totReal = partidas.reduce((s, p) => s + calcularReal(p.categoria), 0);
  const varNeta = totReal - totPres;
  const execPct = totPres > 0 ? Math.round(totReal / totPres * 100) : 0;
  const alertas = partidas.filter(p => calcularReal(p.categoria) > Number(p.monto_presupuestado || 0));

  const siguienteApr = cadena.find(a => a.estado === 'pendiente');
  const puedoAprobar = siguienteApr && siguienteApr.aprobador_id === authUser?.id;

  const usuariosEmpresa = (usuarios || []).filter(u => u.empresa_id === empresaId || !u.empresa_id);

  const abrirNuevo = () => {
    setFormPre({ nombre: '', periodo, centro_costo_id: '', cebe_id: '' });
    setFormPartidas([{ categoria: 'Materiales', descripcion: '', monto_presupuestado: '' }]);
    setPanelNuevo(true);
  };

  const guardarNuevo = async () => {
    if (!formPre.nombre.trim() || !formPre.periodo.trim() || formPartidas.length === 0) return;
    setSaving(true);
    try {
      const pre = await crearPresupuesto(formPre, formPartidas);
      setPreSelId(pre.id);
      setPanelNuevo(false);
    } finally {
      setSaving(false);
    }
  };

  const handleEnviar = async () => {
    const aprs = aprobadores.filter(Boolean);
    if (!aprs.length || !presActivo) return;
    setSaving(true);
    try {
      await enviarPresupuestoAAprobacion(presActivo.id, aprs);
      setPanelEnviar(false);
      setAprobadores([null]);
    } finally {
      setSaving(false);
    }
  };

  const handleProcesar = async (aprId, accion) => {
    if (!presActivo) return;
    await procesarAprobacionPresupuesto(presActivo.id, aprId, accion, comentarioApr);
    setComentarioApr('');
  };

  const panelStyle = {
    position: 'fixed', top: 0, right: 0, width: 480, height: '100vh',
    background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
    boxShadow: '-8px 0 32px rgba(0,0,0,.18)',
    zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };
  const pHead = { padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const pBody = { flex: 1, overflowY: 'auto', padding: '20px 24px' };
  const Overlay = ({ onClick }) => <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 999 }} onClick={onClick} />;
  const CloseBtn = ({ onClick }) => <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--fg-muted)', lineHeight: 1 }} onClick={onClick}>×</button>;

  return (
    <div>
      {/* ── Cabecera módulo ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {presDePeriodo.length > 0 ? (
            <select className="select" style={{ width: 240 }} value={presActivo?.id || ''}
              onChange={e => setPreSelId(e.target.value || null)}>
              {presDePeriodo.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Sin presupuesto para este período</span>
          )}
          {presActivo && <BadgePre estado={presActivo.estado} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {presActivo?.estado === 'borrador' && (
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setPanelEnviar(true)}>
              Enviar a aprobación
            </button>
          )}
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={abrirNuevo}>
            + Nuevo presupuesto
          </button>
        </div>
      </div>

      {/* ── Alertas excedidas ─────────────────────────────────────────── */}
      {alertas.length > 0 && presActivo && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 14, fontSize: 13 }}>
          <strong style={{ color: 'var(--danger)' }}>⚠ Partidas excedidas:</strong>{' '}
          {alertas.map(a => a.categoria).join(', ')}
        </div>
      )}

      {!presActivo ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--fg-muted)' }}>
          No hay presupuesto para este período. Crea uno con el botón de arriba.
        </div>
      ) : (
        <>
          {/* ── KPIs ──────────────────────────────────────────────────── */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 18 }}>
            <div className="kpi-card"><div className="kpi-label">Presupuestado</div><div className="kpi-value" style={{ fontSize: 20 }}>{S(totPres)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Real ejecutado</div><div className="kpi-value" style={{ fontSize: 20, color: totReal > totPres ? 'var(--danger)' : 'var(--fg)' }}>{S(totReal)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Variación neta</div><div className="kpi-value" style={{ fontSize: 20, color: vc(-varNeta) }}>{varNeta > 0 ? '+' : ''}{S(varNeta)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Ejecución</div><div className="kpi-value" style={{ fontSize: 20, color: execPct > 100 ? 'var(--danger)' : execPct > 80 ? 'var(--warning)' : 'var(--green)' }}>{execPct}%</div></div>
          </div>

          {/* ── Sub-tabs ──────────────────────────────────────────────── */}
          <div className="tab-bar" style={{ marginBottom: 14 }}>
            <button className={'tab-btn ' + (subTab === 'partidas' ? 'active' : '')} onClick={() => setSubTab('partidas')}>Partidas</button>
            <button className={'tab-btn ' + (subTab === 'aprobacion' ? 'active' : '')} onClick={() => setSubTab('aprobacion')}>Flujo de aprobación</button>
          </div>

          {/* ── Partidas ──────────────────────────────────────────────── */}
          {subTab === 'partidas' && (
            <div className="card">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Presupuestado</th>
                    <th style={{ textAlign: 'right' }}>Real</th>
                    <th style={{ textAlign: 'right' }}>Variación</th>
                    <th style={{ width: 130 }}>Ejecución</th>
                  </tr>
                </thead>
                <tbody>
                  {partidas.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 24 }}>Sin partidas.</td></tr>
                  )}
                  {partidas.map(p => {
                    const real = calcularReal(p.categoria);
                    const pres = Number(p.monto_presupuestado || 0);
                    const varAbs = real - pres;
                    const excede = real > pres;
                    const ep = pres > 0 ? Math.round(real / pres * 100) : 0;
                    return (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setPanelDetalle(p)}>
                        <td>
                          {excede && <span style={{ color: 'var(--danger)', fontWeight: 700, marginRight: 4 }}>!</span>}
                          {p.categoria}
                        </td>
                        <td style={{ color: 'var(--fg-muted)' }}>{p.descripcion || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{S(pres)}</td>
                        <td style={{ textAlign: 'right', color: excede ? 'var(--danger)' : 'var(--fg)', fontWeight: excede ? 700 : 400 }}>{S(real)}</td>
                        <td style={{ textAlign: 'right', color: excede ? 'var(--danger)' : 'var(--green)' }}>
                          {varAbs >= 0 ? '+' : ''}{S(varAbs)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BarH value={Math.min(ep, 100)} max={100} color={excede ? 'var(--danger)' : ep > 80 ? 'var(--warning)' : 'var(--green)'} />
                            <span style={{ fontSize: 10, color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>{ep}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Flujo de aprobación ───────────────────────────────────── */}
          {subTab === 'aprobacion' && (
            <div className="card">
              {cadena.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--fg-muted)' }}>
                  Sin cadena de aprobación.
                  {presActivo.estado === 'borrador' && (
                    <div style={{ marginTop: 12 }}>
                      <button className="btn btn-secondary" onClick={() => setPanelEnviar(true)}>Enviar a aprobación</button>
                    </div>
                  )}
                </div>
              ) : (
                cadena.map((apr, i) => {
                  const esActual = siguienteApr?.id === apr.id;
                  return (
                    <div key={apr.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 20px',
                      borderBottom: i < cadena.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      background: esActual ? 'rgba(99,102,241,.04)' : 'transparent',
                    }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                        background: apr.estado === 'aprobado' ? 'var(--green)' : apr.estado === 'rechazado' ? 'var(--danger)' : esActual ? 'var(--accent)' : 'var(--bg-subtle)',
                        color: apr.estado !== 'pendiente' || esActual ? '#fff' : 'var(--fg-muted)',
                      }}>
                        {apr.estado === 'aprobado' ? '✓' : apr.estado === 'rechazado' ? '✗' : apr.orden}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{apr.nombre_aprobador}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                          {apr.estado === 'pendiente'
                            ? (esActual ? 'Pendiente — turno actual' : 'Pendiente')
                            : apr.estado === 'aprobado'
                              ? `Aprobado ${apr.fecha_accion ? new Date(apr.fecha_accion).toLocaleDateString('es-PE') : ''}`
                              : `Rechazado ${apr.fecha_accion ? new Date(apr.fecha_accion).toLocaleDateString('es-PE') : ''}`}
                        </div>
                        {apr.comentario && <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 4, fontStyle: 'italic' }}>"{apr.comentario}"</div>}
                        {puedoAprobar && esActual && (
                          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <input className="input" style={{ flex: 1, minWidth: 160, fontSize: 12 }}
                              placeholder="Comentario (opcional)"
                              value={comentarioApr}
                              onChange={e => setComentarioApr(e.target.value)} />
                            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => handleProcesar(apr.id, 'aprobar')}>Aprobar</button>
                            <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => handleProcesar(apr.id, 'rechazar')}>Rechazar</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {/* ── Panel: Nuevo presupuesto ──────────────────────────────────── */}
      {panelNuevo && (
        <>
          <Overlay onClick={() => setPanelNuevo(false)} />
          <div style={panelStyle}>
            <div style={pHead}><strong>Nuevo presupuesto</strong><CloseBtn onClick={() => setPanelNuevo(false)} /></div>
            <div style={pBody}>
              <div className="input-group" style={{ marginBottom: 12 }}>
                <label>Nombre</label>
                <input className="input" value={formPre.nombre} onChange={e => setFormPre(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej. Presupuesto Operativo Mayo 2026" />
              </div>
              <div className="input-group" style={{ marginBottom: 12 }}>
                <label>Período (YYYY-MM o YYYY)</label>
                <input className="input" value={formPre.periodo} onChange={e => setFormPre(p => ({ ...p, periodo: e.target.value }))} placeholder="2026-05" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="input-group">
                  <label>CECO (opcional)</label>
                  <select className="select" value={formPre.centro_costo_id} onChange={e => setFormPre(p => ({ ...p, centro_costo_id: e.target.value }))}>
                    <option value="">— Todos —</option>
                    {(centrosCosto || []).filter(c => c.empresa_id === empresaId).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>CEBE (opcional)</label>
                  <select className="select" value={formPre.cebe_id} onChange={e => setFormPre(p => ({ ...p, cebe_id: e.target.value }))}>
                    <option value="">— Todos —</option>
                    {(centrosBeneficio || []).filter(c => c.empresa_id === empresaId).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Partidas</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 4px 4px 0', fontWeight: 600 }}>Categoría</th>
                    <th style={{ textAlign: 'left', padding: '4px', fontWeight: 600 }}>Descripción</th>
                    <th style={{ textAlign: 'right', padding: '4px 0 4px 4px', fontWeight: 600 }}>Monto S/</th>
                    <th style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {formPartidas.map((fp, i) => (
                    <tr key={i}>
                      <td style={{ padding: '3px 4px 3px 0' }}>
                        <select className="select" style={{ fontSize: 12 }} value={fp.categoria}
                          onChange={e => setFormPartidas(prev => prev.map((x, j) => j === i ? { ...x, categoria: e.target.value } : x))}>
                          {CATEGORIAS_PRESUPUESTO.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <input className="input" style={{ fontSize: 12 }} value={fp.descripcion} placeholder="Descripción"
                          onChange={e => setFormPartidas(prev => prev.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))} />
                      </td>
                      <td style={{ padding: '3px 0 3px 4px' }}>
                        <input className="input" style={{ fontSize: 12, textAlign: 'right' }} type="number" min="0" step="0.01" value={fp.monto_presupuestado} placeholder="0.00"
                          onChange={e => setFormPartidas(prev => prev.map((x, j) => j === i ? { ...x, monto_presupuestado: e.target.value } : x))} />
                      </td>
                      <td style={{ textAlign: 'center', padding: 3 }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16, lineHeight: 1 }}
                          onClick={() => setFormPartidas(prev => prev.filter((_, j) => j !== i))}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-ghost" style={{ fontSize: 12, width: '100%', marginBottom: 20 }}
                onClick={() => setFormPartidas(prev => [...prev, { categoria: 'Materiales', descripcion: '', monto_presupuestado: '' }])}>
                + Agregar partida
              </button>
              <button className="btn btn-primary" style={{ width: '100%' }}
                disabled={saving || !formPre.nombre.trim() || formPartidas.length === 0}
                onClick={guardarNuevo}>
                {saving ? 'Guardando…' : 'Guardar presupuesto'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Panel: Detalle de partida ─────────────────────────────────── */}
      {panelDetalle && (
        <>
          <Overlay onClick={() => setPanelDetalle(null)} />
          <div style={{ ...panelStyle, width: 560 }}>
            <div style={pHead}>
              <div>
                <strong>{panelDetalle.categoria}</strong>
                {panelDetalle.descripcion && <span style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 8 }}>{panelDetalle.descripcion}</span>}
              </div>
              <CloseBtn onClick={() => setPanelDetalle(null)} />
            </div>
            <div style={pBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>Presupuestado</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{S(panelDetalle.monto_presupuestado)}</div>
                </div>
                <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>Real ejecutado</div>
                  {(() => {
                    const r = calcularReal(panelDetalle.categoria);
                    return <div style={{ fontSize: 18, fontWeight: 700, color: r > Number(panelDetalle.monto_presupuestado) ? 'var(--danger)' : 'var(--green)' }}>{S(r)}</div>;
                  })()}
                </div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Desglose del Real</div>
              {(() => {
                const items = getDesglose(panelDetalle.categoria);
                if (!items.length) return <div style={{ color: 'var(--fg-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Sin registros para este período.</div>;
                return (
                  <table className="tbl" style={{ fontSize: 12 }}>
                    <thead><tr><th>Fecha</th><th>Descripción</th><th>Proveedor</th><th style={{ textAlign: 'right' }}>Monto</th><th>Documento</th></tr></thead>
                    <tbody>
                      {items.map((g, i) => (
                        <tr key={i}>
                          <td style={{ whiteSpace: 'nowrap' }}>{g.fecha}</td>
                          <td>{g.descripcion}</td>
                          <td style={{ color: 'var(--fg-muted)' }}>{g.proveedor}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{S(g.monto)}</td>
                          <td style={{ color: 'var(--fg-muted)' }}>{g.documento}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── Panel: Enviar a aprobación ────────────────────────────────── */}
      {panelEnviar && (
        <>
          <Overlay onClick={() => setPanelEnviar(false)} />
          <div style={{ ...panelStyle, width: 420 }}>
            <div style={pHead}><strong>Cadena de aprobación</strong><CloseBtn onClick={() => setPanelEnviar(false)} /></div>
            <div style={pBody}>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 16 }}>
                Selecciona 1 a 4 aprobadores. La firma es secuencial: cada uno actúa después del anterior.
              </p>
              {aprobadores.map((apr, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', width: 20 }}>{i + 1}.</span>
                  <select className="select" style={{ flex: 1 }} value={apr?.id || ''}
                    onChange={e => {
                      const u = usuariosEmpresa.find(u => u.id === e.target.value);
                      setAprobadores(prev => prev.map((a, j) => j === i ? (u || null) : a));
                    }}>
                    <option value="">— Seleccionar usuario —</option>
                    {usuariosEmpresa.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
                  </select>
                  {aprobadores.length > 1 && (
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 20, lineHeight: 1 }}
                      onClick={() => setAprobadores(prev => prev.filter((_, j) => j !== i))}>×</button>
                  )}
                </div>
              ))}
              {aprobadores.length < 4 && (
                <button className="btn btn-ghost" style={{ fontSize: 12, marginBottom: 20 }}
                  onClick={() => setAprobadores(prev => [...prev, null])}>
                  + Agregar aprobador
                </button>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }}
                disabled={saving || aprobadores.filter(Boolean).length === 0}
                onClick={handleEnviar}>
                {saving ? 'Enviando…' : 'Enviar a aprobación'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BIFinanciero() {
  const [tab, setTab] = useState('rentabilidad');
  const { comprasGastos, ots, empresa, centrosCosto, centrosBeneficio, cxc, cxp, cxpPagos, cuentas, movimientosTesoreria } = useApp();

  const now = new Date();
  const [periodo, setPeriodo] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [cecosSel, setCecosSel] = useState([]);
  const [cebesSel, setCebesSel] = useState([]);

  const periodoOpts = Array.from({length:12}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    return { v:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, l:`${MESES[d.getMonth()]} ${d.getFullYear()}` };
  });

  // ── CECO/CEBE filter ────────────────────────────────────────────────────────
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

  const cgFiltrado = efectivoCecos ? (comprasGastos || []).filter(g => efectivoCecos.includes(g.centro_costo_id)) : (comprasGastos || []);
  const otsFiltradas = efectivoCecos ? (ots || []).filter(o => efectivoCecos.includes(o.centro_costo_id)) : (ots || []);

  // ── ER actual y anterior ────────────────────────────────────────────────────
  const { er, utilidadBruta, resultadoOp, resultadoNeto } = buildEstadoResultados({
    base: MOCK.estadoResultados,
    comprasGastos: cgFiltrado,
    ots: otsFiltradas,
    empresa,
    periodo,
  });

  const prevPeriodo = (() => {
    const [y, m] = periodo.split('-').map(Number);
    const d = new Date(y, m-2, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  })();
  const { er: erPrev, utilidadBruta: ubPrev } = buildEstadoResultados({
    base: MOCK.estadoResultados,
    comprasGastos: cgFiltrado,
    ots: otsFiltradas,
    empresa,
    periodo: prevPeriodo,
  });

  // ── CxC helpers ─────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0,10);
  const saldoCxc = c => Number(c?.saldo ?? c?.monto_total ?? c?.total ?? 0);
  const diasMoraCxc = c => {
    if (saldoCxc(c) <= 0 || c?.estado === 'anulada') return 0;
    const vence = c?.fecha_vencimiento || c?.vence;
    if (!vence) return 0;
    return Math.max(0, Math.floor((new Date(today) - new Date(vence)) / 86400000));
  };
  const cxcActivas = (cxc || []).filter(c => c.estado !== 'anulada' && saldoCxc(c) > 0);
  const cxcTotal = cxcActivas.reduce((s,c) => s + saldoCxc(c), 0);
  const cxcVencida = cxcActivas.filter(c => diasMoraCxc(c) > 0).reduce((s,c) => s + saldoCxc(c), 0);

  // ── CxP helpers ─────────────────────────────────────────────────────────────
  const saldoCxp = c => Number(c.monto_total || 0) - (cxpPagos || []).filter(p => p.cxp_id === c.id).reduce((s,p) => s+Number(p.monto||0), 0);
  const cxpActivas = (cxp || []).filter(c => c.estado !== 'anulada' && saldoCxp(c) > 0);
  const cxpTotal = cxpActivas.reduce((s,c) => s + saldoCxp(c), 0);
  const cxpProximos30d = cxpActivas.filter(c => {
    if (!c.fecha_vencimiento) return false;
    const dias = Math.floor((new Date(c.fecha_vencimiento) - new Date(today)) / 86400000);
    return dias >= 0 && dias <= 30;
  }).reduce((s,c) => s + saldoCxp(c), 0);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const facturacionMes = er.ingresos.total;
  const margenBrutoPct = facturacionMes > 0 ? utilidadBruta / facturacionMes * 100 : 0;
  const margenNetoPct  = facturacionMes > 0 ? resultadoNeto / facturacionMes * 100 : 0;
  const varFactPct     = erPrev.ingresos.total > 0 ? (facturacionMes - erPrev.ingresos.total) / erPrev.ingresos.total * 100 : 0;
  const margenBrutoAntPct = erPrev.ingresos.total > 0 ? ubPrev / erPrev.ingresos.total * 100 : 0;

  // ── Evolución margen 6 meses ─────────────────────────────────────────────────
  const evolucionMargen = useMemo(() => {
    const [y, m] = periodo.split('-').map(Number);
    return Array.from({length:6}, (_, i) => {
      const d = new Date(y, m-6+i, 1);
      const p = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const cecosPorCebeM = cebesSel.length > 0 ? (centrosCosto||[]).filter(c => c.empresa_id === empresa?.id && c.estado === 'activo' && cebesSel.includes(c.cebe_id)).map(c => c.id) : null;
      let efM = null;
      if (cecosSel.length > 0 && cecosPorCebeM != null) { efM = cecosSel.filter(id => cecosPorCebeM.includes(id)); }
      else if (cecosSel.length > 0) { efM = cecosSel; }
      else if (cecosPorCebeM != null) { efM = cecosPorCebeM; }
      const cgF = efM ? (comprasGastos||[]).filter(g => efM.includes(g.centro_costo_id)) : (comprasGastos||[]);
      const otsF = efM ? (ots||[]).filter(o => efM.includes(o.centro_costo_id)) : (ots||[]);
      const { er: erM, utilidadBruta: ubM } = buildEstadoResultados({ base: MOCK.estadoResultados, comprasGastos: cgF, ots: otsF, empresa, periodo: p });
      return { mes: MESES_CORTOS[d.getMonth()], facturacion: erM.ingresos.total, margen_pct: erM.ingresos.total > 0 ? Math.round(ubM / erM.ingresos.total * 100) : 0 };
    });
  }, [comprasGastos, ots, cecosSel, cebesSel, centrosCosto, empresa, periodo]);

  // ── Margen por cliente ───────────────────────────────────────────────────────
  const margenPorCliente = (() => {
    const byCliente = {};
    (cxc || []).filter(c => (c.fecha_emision || c.fecha || '').slice(0,7) === periodo && c.empresa_id === empresa?.id).forEach(c => {
      const id = c.cuenta_id || 'sin_cliente';
      if (!byCliente[id]) byCliente[id] = { facturacion: 0, costo: 0, ots: 0 };
      byCliente[id].facturacion += Number(c.monto_total || 0);
    });
    otsFiltradas.filter(o => (o.fecha_inicio || '').slice(0,7) === periodo).forEach(o => {
      const id = o.cuenta_id || 'sin_cliente';
      if (!byCliente[id]) byCliente[id] = { facturacion: 0, costo: 0, ots: 0 };
      byCliente[id].costo += Number(o.costo_real || 0);
      byCliente[id].ots++;
    });
    return Object.entries(byCliente).map(([id, d]) => {
      const cuenta = (cuentas || []).find(x => x.id === id);
      const margen = d.facturacion - d.costo;
      const pct = d.facturacion > 0 ? margen / d.facturacion * 100 : 0;
      return { nombre: cuenta?.razon_social || (id === 'sin_cliente' ? 'Sin cliente' : id), facturacion: d.facturacion, costo: d.costo, margen, margen_pct: Math.round(pct * 10)/10, ots: d.ots, riesgo: pct < 20 ? 'alto' : pct < 35 ? 'medio' : 'bajo' };
    }).sort((a,b) => b.margen_pct - a.margen_pct);
  })();

  // ── Distribución de costos por categoría ────────────────────────────────────
  const margenPorServicio = (() => {
    const byCat = {};
    cgFiltrado.filter(g => (g.fecha || '').slice(0,7) === periodo).forEach(g => {
      const cat = g.categoria || 'Otros';
      if (!byCat[cat]) byCat[cat] = 0;
      byCat[cat] += Number(g.monto || 0);
    });
    otsFiltradas.filter(o => (o.fecha_inicio || '').slice(0,7) === periodo).forEach(o => {
      if (Number(o.costo_real || 0) > 0) {
        const serv = o.servicio || o.tipo || 'OTs / Mano de Obra';
        if (!byCat[serv]) byCat[serv] = 0;
        byCat[serv] += Number(o.costo_real || 0);
      }
    });
    const totalCosto = Object.values(byCat).reduce((s,v) => s+v, 0);
    return Object.entries(byCat).map(([cat, costo]) => ({ servicio: cat, facturacion: costo, margen_pct: totalCosto > 0 ? Math.round(costo / totalCosto * 100) : 0 })).sort((a,b) => b.facturacion - a.facturacion).slice(0, 8);
  })();

  // ── CxC aging ───────────────────────────────────────────────────────────────
  const cxcAging = (() => {
    const buckets = [
      { key: 'vigente', min: -Infinity, max: 0 },
      { key: 'd30',     min: 1,  max: 30  },
      { key: 'd60',     min: 31, max: 60  },
      { key: 'd90',     min: 61, max: 90  },
      { key: 'mas90',   min: 91, max: Infinity },
    ];
    const result = {};
    buckets.forEach(b => {
      const items = cxcActivas.filter(c => { const d = diasMoraCxc(c); return d >= b.min && d <= b.max; });
      result[b.key] = { monto: items.reduce((s,c) => s+saldoCxc(c), 0), clientes: items.length };
    });
    return result;
  })();

  // ── CxP próximos vencimientos ────────────────────────────────────────────────
  const cxpProximosLista = cxpActivas
    .filter(c => c.fecha_vencimiento)
    .map(c => ({ proveedor: c.proveedores?.razon_social || c.proveedor || 'Proveedor', categoria: c.concepto || c.categoria || '—', monto: saldoCxp(c), vence: c.fecha_vencimiento, dias: Math.max(0, Math.floor((new Date(c.fecha_vencimiento) - new Date(today)) / 86400000)) }))
    .sort((a,b) => a.dias - b.dias)
    .slice(0, 10);

  // ── Flujo de caja (movimientosTesoreria por semana) ──────────────────────────
  const flujoCaja = (() => {
    const weeks = [];
    const base = new Date(today);
    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(base);
      const dow = wStart.getDay() === 0 ? 6 : wStart.getDay()-1;
      wStart.setDate(base.getDate() - dow - 7*i);
      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 6);
      const ws = wStart.toISOString().slice(0,10);
      const we = wEnd.toISOString().slice(0,10);
      const movs = (movimientosTesoreria || []).filter(m => m.empresa_id === empresa?.id && m.fecha >= ws && m.fecha <= we);
      const ingReal = movs.filter(m => m.tipo === 'ingreso' || m.tipo === 'credito').reduce((s,m) => s+Number(m.monto||0), 0);
      const egrReal = movs.filter(m => m.tipo === 'egreso' || m.tipo === 'debito').reduce((s,m) => s+Number(m.monto||0), 0);
      const hasDatos = ingReal > 0 || egrReal > 0;
      weeks.push({ semana:`S${8-i} ${MESES_CORTOS[wStart.getMonth()]}`, ing_proy:ingReal, egr_proy:egrReal, ing_real: hasDatos ? ingReal : null, egr_real: hasDatos ? egrReal : null });
    }
    return weeks;
  })();

  // ── Filtro label ─────────────────────────────────────────────────────────────
  const [yy, mm] = periodo.split('-');
  const periodoLabel = `${MESES_CORTOS[parseInt(mm)-1]} ${yy}`;
  const filtroStr = [
    cecosSel.length ? `CECO: ${cecosDeEmpresa.filter(c=>cecosSel.includes(c.id)).map(c=>c.nombre).join(', ')}` : '',
    cebesSel.length ? `CEBE: ${cebesDeEmpresa.filter(c=>cebesSel.includes(c.id)).map(c=>c.nombre).join(', ')}` : '',
  ].filter(Boolean).join(' / ');

  // ── Build data objects para tabs ─────────────────────────────────────────────
  const data = {
    periodo: `${MESES[parseInt(mm)-1]} ${yy}`,
    evolucion_margen: evolucionMargen,
    margen_por_cliente: margenPorCliente,
    margen_por_servicio: margenPorServicio,
    cxc_antiguedad: cxcAging,
    cxp_proximos: cxpProximosLista,
    flujo_caja: flujoCaja,
  };

  const tabs = [
    { key: 'rentabilidad', label: 'Rentabilidad' },
    { key: 'cxcxp',        label: 'CxC / CxP' },
    { key: 'flujo',        label: 'Flujo de Caja' },
    { key: 'presupuesto',  label: 'Presupuesto vs Real' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">BI Financiero{filtroStr ? ` — ${filtroStr}` : ''}</div>
          <div className="page-sub">Rentabilidad · Cobranza · Flujo · Presupuesto — {data.periodo}</div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select className="select" style={{ width: 160 }} value={periodo} onChange={e => setPeriodo(e.target.value)}>
            {periodoOpts.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          <MultiSelect opts={cecosDeEmpresa} sel={cecosSel} onSel={setCecosSel} placeholder="CECO: Todos" />
          <MultiSelect opts={cebesDeEmpresa} sel={cebesSel} onSel={setCebesSel} placeholder="CEBE: Todos" />
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPI label="Facturación Mes" value={S(facturacionMes)} sub={`${vi(varFactPct)} ${P(Math.abs(varFactPct))} vs mes ant.`} subColor={vc(varFactPct)} />
        <KPI label="Margen Bruto" value={S(utilidadBruta)} sub={P(margenBrutoPct) + ' del total'} subColor="var(--green)" />
        <KPI label="Margen Neto" value={S(resultadoNeto)} sub={P(margenNetoPct) + ' del total'} subColor={vc(resultadoNeto)} />
        <KPI label="CxC Total" value={S(cxcTotal)} sub={S(cxcVencida) + ' vencida'} subColor="var(--danger)" />
        <KPI label="CxP Total" value={S(cxpTotal)} sub={S(cxpProximos30d) + ' próx. 30d'} subColor="var(--warning)" />
        <KPI label="Δ Margen Bruto" value={`${margenBrutoPct >= margenBrutoAntPct ? '+' : ''}${P(margenBrutoPct - margenBrutoAntPct)}`} sub="vs mes anterior" subColor={margenBrutoPct >= margenBrutoAntPct ? 'var(--green)' : 'var(--danger)'} />
      </div>

      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} className={'tab-btn ' + (tab === t.key ? 'active' : '')} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rentabilidad' && <TabRentabilidad data={data} />}
      {tab === 'cxcxp'        && <TabCxCxP data={data} />}
      {tab === 'flujo'        && <TabFlujoCaja data={data} />}
      {tab === 'presupuesto'  && <TabPresupuesto periodo={periodo} efectivoCecos={efectivoCecos} />}
    </div>
  );
}

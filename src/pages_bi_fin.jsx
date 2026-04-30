// BI Financiero — Rentabilidad · CxC/CxP · Flujo de Caja · Presupuesto vs Real

import React, { useState } from 'react';
import { MOCK } from './data.js';

const S = (n) => n == null ? '—' : 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const P = (n) => n == null ? '—' : n.toFixed(1) + '%';
const vc = (v) => v >= 0 ? 'var(--green)' : 'var(--danger)';
const vi = (v) => v >= 0 ? '▲' : '▼';

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

// ─── TAB 1: Rentabilidad ──────────────────────────────────────────────────────

function TabRentabilidad({ data }) {
  const maxFact = Math.max(...data.margen_por_cliente.map(c => c.facturacion));
  const maxEvol = Math.max(...data.evolucion_margen.map(e => e.facturacion));
  const rColor = { bajo: 'badge-green', medio: 'badge-yellow', alto: 'badge-red' };

  return (
    <div style={{ display: 'grid', gap: 24 }}>

      {/* Evolución facturación + margen mensual */}
      <div className="card">
        <div className="card-header"><span className="card-title">Evolución Facturación y Margen (6 meses)</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 160, padding: '8px 0' }}>
          {data.evolucion_margen.map((e, i) => {
            const isLast = i === data.evolucion_margen.length - 1;
            const h = Math.round((e.facturacion / maxEvol) * 120);
            const hMargen = Math.round(h * e.margen_pct / 100);
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color: isLast ? 'var(--green)' : 'var(--fg-subtle)', fontWeight: isLast ? 700 : 400 }}>{P(e.margen_pct)}</div>
                <div style={{ width: '100%', height: h, background: isLast ? 'var(--cyan)' : 'var(--border)', borderRadius: '4px 4px 0 0', position: 'relative', overflow: 'hidden' }}>
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
                <td style={{ color: 'var(--green)', fontWeight: 600 }}>{S(c.margen)}</td>
                <td style={{ fontWeight: 700, color: c.margen_pct >= 40 ? 'var(--green)' : c.margen_pct >= 30 ? 'var(--warning)' : 'var(--danger)' }}>{P(c.margen_pct)}</td>
                <td>{c.ots}</td>
                <td><span className={'badge ' + rColor[c.riesgo]}>{c.riesgo}</span></td>
                <td><BarH value={c.facturacion} max={maxFact} color={c.margen_pct >= 40 ? 'var(--green)' : c.margen_pct >= 30 ? 'var(--warning)' : 'var(--danger)'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mix de servicios ordenado por margen */}
      <div className="card">
        <div className="card-header"><span className="card-title">Mix de Servicios — Margen %</span><span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Ordenado por rentabilidad</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
          {data.margen_por_servicio.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 100px 70px', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{s.servicio}</span>
              <BarH value={s.margen_pct} max={80} color={s.margen_pct >= 60 ? 'var(--green)' : s.margen_pct >= 45 ? 'var(--cyan)' : 'var(--warning)'} />
              <span style={{ fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'right' }}>{S(s.facturacion)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', textAlign: 'right' }}>{P(s.margen_pct)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── TAB 2: CxC / CxP ────────────────────────────────────────────────────────

function TabCxCxP({ data }) {
  const aging = data.cxc_antiguedad;
  const buckets = [
    { label: 'Vigente',    ...aging.vigente, color: 'var(--green)' },
    { label: '1-30 d',    ...aging.d30,     color: 'var(--cyan)' },
    { label: '31-60 d',   ...aging.d60,     color: 'var(--warning)' },
    { label: '61-90 d',   ...aging.d90,     color: 'var(--orange, #f97316)' },
    { label: '+90 d',     ...aging.mas90,   color: 'var(--danger)' },
  ];
  const total = buckets.reduce((s, b) => s + b.monto, 0);
  const maxMonto = Math.max(...buckets.map(b => b.monto));

  return (
    <div style={{ display: 'grid', gap: 24 }}>

      {/* Pirámide de antigüedad CxC */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Antigüedad de Saldos — CxC</span>
          <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Total: {S(total)} · {buckets.reduce((s, b) => s + b.clientes, 0)} clientes</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 140, padding: '8px 0' }}>
          {buckets.map((b, i) => {
            const h = Math.round((b.monto / maxMonto) * 110);
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg)' }}>{S(b.monto)}</div>
                <div style={{ width: '100%', height: h, background: b.color, borderRadius: '4px 4px 0 0' }} />
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
              <span style={{ color: 'var(--fg-subtle)' }}>{b.label}: <strong>{P(b.monto / total * 100)}</strong></span>
            </div>
          ))}
        </div>
        {aging.mas90.monto > 0 && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,.08)', borderRadius: 8, borderLeft: '3px solid var(--danger)', fontSize: 13 }}>
            ⚠ <strong>{S(aging.mas90.monto)}</strong> con más de 90 días — {aging.mas90.clientes} cliente(s). Revisar inmediatamente.
          </div>
        )}
      </div>

      {/* CxP próximos vencimientos */}
      <div className="card">
        <div className="card-header"><span className="card-title">CxP — Próximos Vencimientos</span></div>
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
      </div>
    </div>
  );
}

// ─── TAB 3: Flujo de Caja ────────────────────────────────────────────────────

function TabFlujoCaja({ data }) {
  const confirmados = data.flujo_caja.filter(s => s.ing_real != null);
  const ingConf  = confirmados.reduce((s, r) => s + r.ing_real, 0);
  const egrConf  = confirmados.reduce((s, r) => s + r.egr_real, 0);

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="card">
        <div className="card-header"><span className="card-title">Flujo de Caja — Proyectado vs Real</span></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Semana</th>
                <th style={{ textAlign: 'right' }}>Ing. Proyectado</th>
                <th style={{ textAlign: 'right' }}>Ing. Real</th>
                <th style={{ textAlign: 'right' }}>Egr. Proyectado</th>
                <th style={{ textAlign: 'right' }}>Egr. Real</th>
                <th style={{ textAlign: 'right' }}>Neto Proyectado</th>
                <th style={{ textAlign: 'right' }}>Neto Real</th>
              </tr>
            </thead>
            <tbody>
              {data.flujo_caja.map((s, i) => {
                const netoProy = s.ing_proy - s.egr_proy;
                const netoReal = s.ing_real != null && s.egr_real != null ? s.ing_real - s.egr_real : null;
                const pending = s.ing_real == null;
                return (
                  <tr key={i} style={{ opacity: pending ? 0.65 : 1 }}>
                    <td style={{ fontWeight: 600 }}>
                      {s.semana}
                      {pending && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>proyectado</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{S(s.ing_proy)}</td>
                    <td style={{ textAlign: 'right', color: pending ? 'var(--fg-muted)' : 'var(--green)', fontWeight: pending ? 400 : 600 }}>
                      {s.ing_real != null ? S(s.ing_real) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>{S(s.egr_proy)}</td>
                    <td style={{ textAlign: 'right', color: pending ? 'var(--fg-muted)' : 'var(--danger)', fontWeight: pending ? 400 : 600 }}>
                      {s.egr_real != null ? S(s.egr_real) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: vc(netoProy) }}>{S(netoProy)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: netoReal != null ? vc(netoReal) : 'var(--fg-muted)' }}>
                      {netoReal != null ? S(netoReal) : '—'}
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
      </div>
    </div>
  );
}

// ─── TAB 4: Presupuesto vs Real ───────────────────────────────────────────────

function TabPresupuesto({ data }) {
  const pvr = data.presupuesto_vs_real;
  const filas = [
    { label: 'Ingresos',              key: 'ingresos',            bold: true,  sep: false, indent: 0, positiveGood: true  },
    { label: 'Costo de Ventas',       key: 'costo_ventas',        bold: false, sep: false, indent: 1, positiveGood: false },
    { label: 'Utilidad Bruta',        key: 'margen_bruto',        bold: true,  sep: true,  indent: 0, positiveGood: true  },
    { label: 'Gastos Administrativos',key: 'gastos_admin',        bold: false, sep: false, indent: 1, positiveGood: false },
    { label: 'Gastos Comerciales',    key: 'gastos_comercial',    bold: false, sep: false, indent: 1, positiveGood: false },
    { label: 'Resultado Operativo',   key: 'resultado_operativo', bold: true,  sep: true,  indent: 0, positiveGood: true  },
    { label: 'Resultado Neto',        key: 'resultado_neto',      bold: true,  sep: true,  indent: 0, positiveGood: true  },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Presupuesto vs Real — {data.periodo}</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Concepto</th>
            <th style={{ textAlign: 'right' }}>Presupuesto</th>
            <th style={{ textAlign: 'right' }}>Real</th>
            <th style={{ textAlign: 'right' }}>Variación S/</th>
            <th style={{ textAlign: 'right' }}>Variación %</th>
            <th style={{ width: 120 }}>Ejecución</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const d = pvr[f.key];
            const varAbs = d.real - d.presupuesto;
            const good = f.positiveGood ? varAbs >= 0 : varAbs <= 0;
            const execPct = Math.min(110, Math.round((d.real / d.presupuesto) * 100));
            return (
              <tr key={i} style={{ borderTop: f.sep ? '2px solid var(--border)' : undefined, fontWeight: f.bold ? 700 : 400 }}>
                <td style={{ paddingLeft: f.indent ? 20 : 0 }}>{f.label}</td>
                <td style={{ textAlign: 'right' }}>{S(d.presupuesto)}</td>
                <td style={{ textAlign: 'right' }}>{S(d.real)}</td>
                <td style={{ textAlign: 'right', color: good ? 'var(--green)' : 'var(--danger)' }}>
                  {varAbs >= 0 ? '+' : ''}{S(varAbs)}
                </td>
                <td style={{ textAlign: 'right', color: good ? 'var(--green)' : 'var(--danger)' }}>
                  {vi(d.var_pct)} {Math.abs(d.var_pct).toFixed(1)}%
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarH value={Math.min(execPct, 100)} max={100} color={good ? 'var(--green)' : 'var(--danger)'} />
                    <span style={{ fontSize: 10, color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>{execPct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: 13, color: 'var(--fg-subtle)' }}>
        Ejecución de ingresos al {Math.round(pvr.ingresos.real / pvr.ingresos.presupuesto * 100)}% — resultado neto {pvr.resultado_neto.var_pct > 0 ? 'supera' : 'por debajo de'} presupuesto en {Math.abs(pvr.resultado_neto.var_pct).toFixed(1)}%. Principal desviación: margen bruto ({pvr.margen_bruto.var_pct.toFixed(1)}%).
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BIFinanciero() {
  const [tab, setTab] = useState('rentabilidad');
  const data = MOCK.biFinanciero;
  const r = data.resumen;

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
          <div className="page-title">BI Financiero</div>
          <div className="page-sub">Rentabilidad · Cobranza · Flujo · Presupuesto — {data.periodo}</div>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPI
          label="Facturación Mes"
          value={S(r.facturacion_mes)}
          sub={`${vi(r.var_facturacion_pct)} ${P(Math.abs(r.var_facturacion_pct))} vs mes ant.`}
          subColor={vc(r.var_facturacion_pct)}
        />
        <KPI
          label="Margen Bruto"
          value={S(r.margen_bruto)}
          sub={P(r.margen_bruto_pct) + ' del total'}
          subColor="var(--green)"
        />
        <KPI
          label="Margen Neto"
          value={S(r.margen_neto)}
          sub={P(r.margen_neto_pct) + ' del total'}
          subColor="var(--green)"
        />
        <KPI
          label="CxC Total"
          value={S(r.cxc_total)}
          sub={S(r.cxc_vencida) + ' vencida'}
          subColor="var(--danger)"
        />
        <KPI
          label="CxP Total"
          value={S(r.cxp_total)}
          sub={S(r.cxp_proximos_30d) + ' próx. 30d'}
          subColor="var(--warning)"
        />
        <KPI
          label="Δ Margen Bruto"
          value={`+${P(r.margen_bruto_pct - r.margen_bruto_ant_pct)}`}
          sub="vs mes anterior"
          subColor="var(--green)"
        />
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
      {tab === 'presupuesto'  && <TabPresupuesto data={data} />}
    </div>
  );
}

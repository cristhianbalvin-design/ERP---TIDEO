import React, { useState } from 'react';
import { calcularFacturadoMes, calcularSaldos, fechaLocal } from './facturacionKpis.js';
import './facturacion.css';
const tipos = { factura: 'Factura', boleta: 'Boleta', nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito' };
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const importe = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, m = 'PEN') => `${m === 'USD' ? 'US$' : 'S/'} ${importe(n)}`;
const fecha = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const diff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
function estado(f, c, hoy) {
  if (f.estado === 'anulada') return { key: 'anulada', text: 'Anulada', tone: 'gray' };
  if (['nota_credito', 'nota_debito'].includes(f.tipo_documento))
    return {
      key: f.estado,
      text:
        {
          emitida: 'Emitida',
          anulada: 'Anulada',
          cobro_parcial: 'Cobro parcial',
          cobrada: 'Cobrada',
          vencida: 'Vencida',
        }[f.estado] || '—',
      tone: 'gray',
    };
  if (!c) return { key: 'sin_cxc', text: 'Sin CxC', tone: 'gray' };
  if (['anulada', 'cancelada'].includes(c.estado)) return { key: 'anulada', text: 'Anulada', tone: 'gray' };
  if (['cobrada', 'pagada'].includes(c.estado) || Number(c.saldo || 0) <= 0)
    return { key: 'cobrada', text: 'Cobrada', tone: 'green' };
  const vence = c.fecha_vencimiento || f.fecha_vencimiento;
  if (vence && vence < hoy) {
    const n = diff(vence, hoy);
    return {
      key: 'vencida',
      text: `Vencida · ${n} ${n === 1 ? 'día' : 'días'}`,
      tone: 'red',
      detail: `Saldo ${money(c.saldo, c.moneda || f.moneda)}`,
    };
  }
  if (c.estado === 'cobro_parcial')
    return {
      key: 'cobro_parcial',
      text: 'Cobro parcial',
      tone: 'amber',
      detail: `Saldo ${money(c.saldo, c.moneda || f.moneda)}`,
    };
  return {
    key: 'por_cobrar',
    text: 'Por cobrar',
    tone: 'cyan',
    detail: vence ? `Vence en ${diff(hoy, vence)} días` : '',
  };
}
export default function FacturacionListado({
  facturas,
  cxc,
  cuentaNombre,
  vals,
  abrir,
  openMode,
  abrirCarga,
  mostrarBadge,
  Badge,
  searchQuery,
  loading,
  puedeCrear = true,
}) {
  const [filters, setFilters] = useState({
    cliente: '',
    tipo: '',
    estado: '',
    moneda: '',
    ed: '',
    eh: '',
    vd: '',
    vh: '',
    q: '',
  });
  const set = (k, v) => setFilters((p) => ({ ...p, [k]: v }));
  const hoy = fechaLocal();
  const facturado = calcularFacturadoMes(facturas, hoy),
    saldos = calcularSaldos(facturas, cxc, hoy);
  const clientes = [
    ...new Map(facturas.filter((f) => f.cuenta_id).map((f) => [f.cuenta_id, cuentaNombre(f.cuenta_id)])).entries(),
  ];
  const porId = new Map(facturas.map((f) => [f.id, f]));
  const cxcs = new Map(cxc.map((c) => [c.factura_id, c]));
  const filtradas = facturas
    .filter((f) => {
      const c = cxcs.get(f.id),
        ven = c?.fecha_vencimiento || f.fecha_vencimiento || '',
        e = estado(f, c, hoy);
      const q = norm(`${filters.q} ${searchQuery || ''}`)
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      return (
        (!filters.cliente || f.cuenta_id === filters.cliente) &&
        (!filters.tipo || (f.tipo_documento || 'factura') === filters.tipo) &&
        (!filters.estado || e.key === filters.estado) &&
        (!filters.moneda || (f.moneda || 'PEN') === filters.moneda) &&
        (!filters.ed || (f.fecha_emision || '') >= filters.ed) &&
        (!filters.eh || (f.fecha_emision || '') <= filters.eh) &&
        (!filters.vd || ven >= filters.vd) &&
        (!filters.vh || (ven && ven <= filters.vh)) &&
        q.every((t) => norm(`${f.numero} ${f.cuentas?.razon_social || cuentaNombre(f.cuenta_id)}`).includes(t))
      );
    })
    .sort(
      (a, b) =>
        (b.fecha_emision || '').localeCompare(a.fecha_emision || '') ||
        (b.numero || '').localeCompare(a.numero || '', undefined, { numeric: true }),
    );
  const kpi = (m, label, alert = false) => {
    const principal = m.PEN === 0 && m.USD !== 0 ? 'USD' : 'PEN',
      otra = principal === 'PEN' ? 'USD' : 'PEN';
    const texto = `${label} · ${money(m[otra], otra)}`;
    return (
      <div className={`dx-ui-kpi ${alert ? 'dx-fac-kpi-alert' : ''}`} title={texto}>
        <strong>{money(m[principal], principal)}</strong>
        <span>{texto}</span>
      </div>
    );
  };
  const mes = new Intl.DateTimeFormat('es-PE', { month: 'short' }).format(new Date()).toLowerCase();
  const mesLargo = new Intl.DateTimeFormat('es-PE', { month: 'long' }).format(new Date()).toLowerCase();
  return (
    <section className="dx-ui dx-fac">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Finanzas · Ventas</div>
          <h1 className="dx-ui-title">Facturación</h1>
          <p className="dx-ui-sub">
            {facturas.length} {facturas.length === 1 ? 'comprobante' : 'comprobantes'} · {facturado.emitidas}{' '}
            {facturado.emitidas === 1 ? 'emitido' : 'emitidos'} en {mesLargo} · {vals}{' '}
            {vals === 1 ? 'valorización lista' : 'valorizaciones listas'} para facturar
          </p>
        </div>
        <div className="dx-ui-actions">
          <button
            className="dx-btn"
            onClick={abrirCarga}
            disabled={!puedeCrear}
            title={puedeCrear ? undefined : 'No tienes permiso para emitir comprobantes'}
          >
            Carga masiva
          </button>
          <button
            className="dx-btn"
            onClick={() => openMode('directa')}
            disabled={!puedeCrear}
            title={puedeCrear ? undefined : 'No tienes permiso para emitir comprobantes'}
          >
            Factura directa
          </button>
          <button
            className="dx-btn primary"
            onClick={() => openMode('val')}
            disabled={!vals || !puedeCrear}
            title={puedeCrear ? undefined : 'No tienes permiso para emitir comprobantes'}
          >
            Desde valorización
          </button>
        </div>
      </header>
      <div className="dx-fac-kpis">
        <div className="dx-ui-kpi-row">
          {kpi(facturado.montos, `Facturado ${mes}`)}
          {kpi(
            saldos.porCobrar.montos,
            `Por cobrar · ${saldos.porCobrar.facturas} ${saldos.porCobrar.facturas === 1 ? 'factura' : 'facturas'}`,
          )}
          {kpi(
            saldos.vencido.montos,
            `Vencido · ${saldos.vencido.facturas} ${saldos.vencido.facturas === 1 ? 'factura' : 'facturas'}`,
            true,
          )}
          <div className="dx-ui-kpi">
            <strong>{vals}</strong>
            <span>{vals === 1 ? 'Valorización por facturar' : 'Valorizaciones por facturar'}</span>
          </div>
        </div>
      </div>
      <div className="dx-ui-card">
        <div className="dx-ui-toolbar">
          <h2>Comprobantes</h2>
          <span className="dx-ui-count">
            {filtradas.length} {filtradas.length === 1 ? 'comprobante' : 'comprobantes'}
          </span>
          <label className="dx-ui-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              aria-label="Buscar comprobantes"
              placeholder="Buscar por número o cliente…"
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
            />
          </label>
        </div>
        <div className="dx-fac-filters">
          {[
            ['cliente', 'Cliente', clientes],
            ['tipo', 'Tipo', Object.entries(tipos)],
            [
              'estado',
              'Estado de cobro',
              Object.entries({
                por_cobrar: 'Por cobrar',
                cobro_parcial: 'Cobro parcial',
                vencida: 'Vencida',
                cobrada: 'Cobrada',
                anulada: 'Anulada',
              }),
            ],
            [
              'moneda',
              'Moneda',
              [
                ['PEN', 'PEN'],
                ['USD', 'USD'],
              ],
            ],
          ].map(([k, label, options]) => (
            <div className="dx-ui-field" key={k}>
              <label htmlFor={`fac-${k}`}>{label}</label>
              <select
                id={`fac-${k}`}
                className="dx-ui-select"
                value={filters[k]}
                onChange={(e) => set(k, e.target.value)}
              >
                <option value="">{k === 'cliente' ? 'Todos los clientes' : k === 'moneda' ? 'Todas' : 'Todos'}</option>
                {options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            className="dx-btn"
            onClick={() =>
              setFilters({ cliente: '', tipo: '', estado: '', moneda: '', ed: '', eh: '', vd: '', vh: '', q: '' })
            }
          >
            Limpiar
          </button>
          <div className="dx-fac-dates">
            {[
              ['Emisión', 'ed', 'eh'],
              ['Vencimiento', 'vd', 'vh'],
            ].map(([label, a, b]) => (
              <div className="dx-ui-field" key={a}>
                <label>{label}</label>
                <div className="dx-fac-range">
                  <input
                    type="date"
                    aria-label={`${label} desde`}
                    value={filters[a]}
                    onChange={(e) => set(a, e.target.value)}
                  />
                  <input
                    type="date"
                    aria-label={`${label} hasta`}
                    value={filters[b]}
                    onChange={(e) => set(b, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="dx-ui-head dx-fac-cols">
          <span>Comprobante</span>
          <span>Cliente</span>
          <span>Emisión · vence</span>
          <span>Total</span>
          <span>Estado</span>
          <span />
        </div>
        {!loading &&
          filtradas.map((f) => {
            const c = cxcs.get(f.id),
              e = estado(f, c, hoy),
              origen = porId.get(f.factura_origen_id),
              ven = c?.fecha_vencimiento || f.fecha_vencimiento,
              cliente = f.cuentas?.razon_social || cuentaNombre(f.cuenta_id),
              desglose = `Subt. ${importe(f.subtotal)} · IGV ${importe(f.igv)}`;
            return (
              <div
                key={f.id}
                className="dx-ui-row dx-fac-cols"
                role="button"
                tabIndex={0}
                aria-label={`Abrir ${f.numero || f.id}`}
                onClick={() => abrir(f.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    abrir(f.id);
                  }
                }}
              >
                <div>
                  <span className="dx-fac-label">Comprobante</span>
                  <strong className="dx-fac-num">{f.numero || f.id}</strong>
                  {mostrarBadge && <Badge sociedadId={f.sociedad_id} />}
                  <span className="dx-fac-small">
                    {tipos[f.tipo_documento] || 'Factura'} · {f.moneda || 'PEN'}
                  </span>
                </div>
                <div className="dx-fac-client">
                  <span className="dx-fac-label">Cliente</span>
                  <strong title={cliente}>{cliente}</strong>
                  <span className="dx-fac-small">
                    {origen
                      ? `Afecta a ${origen.numero || origen.id}`
                      : f.os_cliente_id
                        ? 'OS de cliente vinculada'
                        : 'Sin OS de cliente'}
                  </span>
                </div>
                <div>
                  <span className="dx-fac-label">Emisión · vence</span>
                  {fecha(f.fecha_emision)}
                  <span className={`dx-fac-small ${e.key === 'vencida' ? 'dx-fac-due-late' : ''}`}>
                    {ven ? `Vence ${fecha(ven)}` : 'Sin vencimiento'}
                  </span>
                </div>
                <div>
                  <span className="dx-fac-label">Total</span>
                  <strong className="dx-fac-num">{money(f.total ?? f.monto, f.moneda)}</strong>
                  <span className="dx-fac-small" title={desglose}>
                    {desglose}
                  </span>
                </div>
                <div>
                  <span className="dx-fac-label">Estado de cobro</span>
                  <span className={`dx-ui-pill is-${e.tone}`}>
                    <i />
                    {e.text}
                  </span>
                  {e.detail && <span className="dx-fac-small">{e.detail}</span>}
                </div>
                <span className="dx-ui-arrow">›</span>
              </div>
            );
          })}
        {loading ? (
          <div className="dx-ui-empty">Cargando comprobantes…</div>
        ) : (
          !filtradas.length && (
            <div className="dx-ui-empty">
              {facturas.length
                ? 'No se encontraron resultados con estos filtros.'
                : 'Aún no hay comprobantes. Emite tu primera factura para verla aquí.'}
            </div>
          )
        )}
        <div className="dx-fac-foot">
          Ordenado por fecha de emisión, más reciente primero{' '}
          <span>Archivos PDF/XML: se ven en la ficha de cada comprobante</span>
        </div>
      </div>
    </section>
  );
}

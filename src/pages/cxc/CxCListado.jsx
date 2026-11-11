import React, { useEffect, useRef, useState } from 'react';
import { formatearFecha, diasEntreFechas, plural, textoVencimiento, tramoAntiguedad } from './cxcCalculos.js';

const TRAMOS = [
  { key: 'al-dia', label: 'Al día', color: 't-ok' },
  { key: '1-30', label: '1–30 días', color: 't-1' },
  { key: '31-60', label: '31–60 días', color: 't-2' },
  { key: '61-90', label: '61–90 días', color: 't-3' },
  { key: '+90', label: '+90 días', color: 't-4' },
];
const PILL = {
  por_cobrar: 'is-cyan',
  por_vencer: 'is-amber',
  vencida: 'is-red',
  en_gestion: 'is-cyan',
  cobrada_parcial: 'is-amber',
  cobrada: 'is-green',
  anulada: 'is-gray',
  cancelada: 'is-gray',
};

export default function CxCListado({
  rows,
  todas,
  pendientes,
  pendientesMoneda,
  moneda,
  cambiarMoneda,
  agingFilter,
  setAgingFilter,
  today,
  filtros,
  setters,
  limpiar,
  periodos,
  usuarios,
  estados,
  cobrado,
  labelCobrado,
  helpers,
  mostrarBadge,
  Badge,
  puedeEditar,
  puedeAnular,
  abrirFicha,
  abrirCobro,
  abrirGestion,
  editarVencimiento,
  revertir,
  anular,
  cargaMasiva,
  exportar,
  error,
}) {
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (menu == null) return undefined;
    const cerrarFuera = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenu(null);
    };
    const cerrarEscape = (e) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', cerrarFuera);
    document.addEventListener('keydown', cerrarEscape);
    return () => {
      document.removeEventListener('pointerdown', cerrarFuera);
      document.removeEventListener('keydown', cerrarEscape);
    };
  }, [menu]);
  const {
    saldoDe,
    totalDe,
    clienteDe,
    facturaNumeroDe,
    osNumeroDe,
    diasMoraDe,
    estadoDe,
    estadoTerminalCxC,
    monedaCxCDe,
    pendienteSpotDe,
    autodetraccionPendienteDe,
    retencionDe,
    cobrosRegistradosDe,
    facturaPuedeAnularseDe,
    moneyDCurrency,
  } = helpers;
  const monto = (lista) => lista.reduce((sum, c) => sum + saldoDe(c), 0);
  const vencidas = pendientesMoneda.filter((c) => diasMoraDe(c) > 0);
  const proximas = pendientesMoneda.filter((c) => {
    const fecha = c.fecha_vencimiento || c.vence;
    if (!fecha) return false;
    const dias = diasEntreFechas(today, fecha);
    return dias >= 0 && dias <= 7;
  });
  const tramos = TRAMOS.map((t) => {
    const items = pendientesMoneda.filter((c) => tramoAntiguedad(diasMoraDe(c)) === t.key);
    return { ...t, count: items.length, monto: monto(items) };
  });
  const total = monto(pendientesMoneda);
  const dinero = (n) => moneyDCurrency(n, moneda);
  const elegirAccion = (accion, c) => {
    setMenu(null);
    accion(c);
  };
  return (
    <>
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Finanzas · Cobranza</div>
          <h1 className="dx-ui-title">Cuentas por Cobrar</h1>
          <p className="dx-ui-sub">
            {plural(pendientesMoneda.length, 'cuenta pendiente', 'cuentas pendientes')} en{' '}
            {moneda === 'PEN' ? 'soles' : 'dólares'} · {plural(vencidas.length, 'vencida', 'vencidas')}
          </p>
        </div>
        <div className="dx-ui-actions">
          <button className="dx-btn" type="button" onClick={cargaMasiva}>
            ⇪ Carga masiva
          </button>
          <button className="dx-btn" type="button" onClick={exportar}>
            ⇩ Exportar
          </button>
        </div>
      </header>
      {error && (
        <div className="alert alert-danger">
          No se pudieron cargar las detracciones. Actualiza la pantalla antes de registrar cobros.
        </div>
      )}
      <div className="dx-cxc-topline">
        <div className="dx-cxc-seg" role="group" aria-label="Moneda">
          {[
            ['PEN', 'Soles'],
            ['USD', 'Dólares'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={moneda === id}
              onClick={() => {
                setMenu(null);
                cambiarMoneda(id);
              }}
            >
              {label} <small>({pendientes.filter((c) => monedaCxCDe(c) === id).length})</small>
            </button>
          ))}
        </div>
        <p>Los montos y la antigüedad se muestran en la moneda elegida; nunca se suman soles con dólares.</p>
      </div>
      <div className="dx-cxc-kpis">
        <section className="dx-ui-kpi-row" aria-label="Resumen">
          <div className="dx-ui-kpi">
            <strong>{dinero(total)}</strong>
            <span>Por cobrar · {plural(pendientesMoneda.length, 'factura', 'facturas')}</span>
          </div>
          <div className={`dx-ui-kpi ${monto(vencidas) > 0 ? 'dx-cxc-kpi-alert' : ''}`}>
            <strong>{dinero(monto(vencidas))}</strong>
            <span>Vencido · {plural(vencidas.length, 'factura', 'facturas')}</span>
          </div>
          <div className="dx-ui-kpi">
            <strong>{dinero(monto(proximas))}</strong>
            <span>Vence en 7 días · {plural(proximas.length, 'factura', 'facturas')}</span>
          </div>
          <div className="dx-ui-kpi dx-cxc-kpi-ok">
            <strong>{dinero(cobrado)}</strong>
            <span>{labelCobrado}</span>
          </div>
        </section>
      </div>
      <section className="dx-ui-card" aria-labelledby="cxc-listado-titulo">
        <div className="dx-ui-toolbar">
          <h2 id="cxc-listado-titulo">Cuentas por cobrar</h2>
          <span className="dx-ui-count">{plural(rows.length, 'cuenta', 'cuentas')}</span>
          <label className="dx-ui-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Buscar por cliente, factura u OS…"
              aria-label="Buscar cuentas por cobrar"
              value={filtros.fCliente}
              onChange={(e) => setters.setFCliente(e.target.value)}
            />
          </label>
        </div>
        <div className="dx-cxc-aging" aria-label="Antigüedad del saldo">
          <div className="dx-cxc-aging-head">
            <span>Antigüedad del saldo pendiente</span>
            <span>{dinero(total)}</span>
          </div>
          <div className="dx-cxc-bar" aria-hidden="true">
            {tramos.map((t) => (
              <i key={t.key} className={t.color} style={{ width: total ? `${(t.monto / total) * 100}%` : '0%' }} />
            ))}
          </div>
          <div className="dx-cxc-buckets">
            {tramos.map((t) => (
              <button
                key={t.key}
                type="button"
                className="dx-cxc-bucket"
                aria-pressed={agingFilter === t.key}
                onClick={() => setAgingFilter(agingFilter === t.key ? null : t.key)}
              >
                <span>
                  <i className={t.color} />
                  {t.label}
                </span>
                <strong>{dinero(t.monto)}</strong>
                <small>{plural(t.count, 'factura', 'facturas')}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="dx-cxc-filters">
          <div className="dx-ui-field">
            <label htmlFor="cxc-estado">Estado</label>
            <select
              id="cxc-estado"
              className="dx-ui-select"
              value={filtros.fEstado}
              onChange={(e) => setters.setFEstado(e.target.value)}
            >
              <option value="pendientes">Pendientes</option>
              <option value="">Todas</option>
              {Object.entries(estados).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="dx-ui-field">
            <label htmlFor="cxc-periodo">Período de emisión</label>
            <select
              id="cxc-periodo"
              className="dx-ui-select"
              value={filtros.fPeriodoEmision}
              onChange={(e) => setters.setFPeriodoEmision(e.target.value)}
            >
              <option value="">Todos</option>
              {periodos.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>
          <div className="dx-ui-field">
            <label htmlFor="cxc-gestor">Gestor</label>
            <select
              id="cxc-gestor"
              className="dx-ui-select"
              value={filtros.fGestor}
              onChange={(e) => setters.setFGestor(e.target.value)}
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre || u.nombre_completo || u.email || u.id}
                </option>
              ))}
            </select>
          </div>
          <div className="dx-ui-field">
            <label>Vencimiento</label>
            <div className="dx-cxc-range">
              <input
                type="date"
                aria-label="Vencimiento desde"
                value={filtros.fVenceDesde}
                onChange={(e) => setters.setFVenceDesde(e.target.value)}
              />
              <input
                type="date"
                aria-label="Vencimiento hasta"
                value={filtros.fVenceHasta}
                onChange={(e) => setters.setFVenceHasta(e.target.value)}
              />
            </div>
          </div>
          <button className="dx-btn" type="button" onClick={limpiar}>
            Limpiar
          </button>
        </div>
        <div className="dx-ui-head dx-cxc-cols" aria-hidden="true">
          <span>Factura</span>
          <span>Cliente</span>
          <span>Vencimiento</span>
          <span>Saldo</span>
          <span>Estado</span>
          <span />
        </div>
        {rows.map((c, index) => {
          const saldo = saldoDe(c),
            estado = estadoDe(c),
            fecha = c.fecha_vencimiento || c.vence,
            dias = fecha ? diasEntreFechas(today, fecha) : null,
            tieneCobros = cobrosRegistradosDe(c).length > 0,
            terminal = estadoTerminalCxC(c);
          return (
            <div
              key={c.id}
              className="dx-ui-row dx-cxc-cols"
              role="button"
              tabIndex={0}
              aria-label={`Abrir ${facturaNumeroDe(c)}`}
              onClick={() => abrirFicha(c)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  abrirFicha(c);
                }
              }}
            >
              <div>
                <span className="dx-cxc-label">Factura</span>
                <strong className="dx-cxc-num">{facturaNumeroDe(c)}</strong>
                <span className="dx-cxc-small">{osNumeroDe(c) === '-' ? 'Sin OS de cliente' : osNumeroDe(c)}</span>
              </div>
              <div className="dx-cxc-c-client">
                <span className="dx-cxc-client" title={clienteDe(c)}>
                  {clienteDe(c)}
                </span>
                <div className="dx-cxc-tags">
                  {mostrarBadge && <Badge sociedadId={c.sociedad_id} />}
                  {pendienteSpotDe(c) && <span className="dx-cxc-tag">Detracción pendiente</span>}
                  {autodetraccionPendienteDe(c) && <span className="dx-cxc-tag">Autodetracción pendiente</span>}
                  {retencionDe(c) > 0 && <span className="dx-cxc-tag">Retención SUNAT</span>}
                </div>
              </div>
              <div>
                <span className="dx-cxc-label">Vencimiento</span>
                {formatearFecha(fecha)}
                <span
                  className={`dx-cxc-small ${saldo > 0 && dias < 0 ? 'dx-cxc-late' : saldo > 0 && dias != null && dias <= 7 ? 'dx-cxc-soon' : ''}`}
                >
                  {fecha ? textoVencimiento(dias, saldo <= 0) : 'Sin vencimiento'}
                </span>
              </div>
              <div>
                <span className="dx-cxc-label">Saldo</span>
                <span className="dx-cxc-money">{dinero(saldo)}</span>
                <span className="dx-cxc-small">de {dinero(totalDe(c))}</span>
              </div>
              <div>
                <span className="dx-cxc-label">Estado</span>
                <span className={`dx-ui-pill ${PILL[estado] || 'is-gray'}`}>
                  <i />
                  {estados[estado]?.label || estado}
                </span>
              </div>
              <div className="dx-cxc-acts" onClick={(e) => e.stopPropagation()}>
                {saldo > 0 && !terminal && (
                  <button type="button" className="dx-btn primary" onClick={(e) => abrirCobro(c, e)}>
                    Cobrar
                  </button>
                )}
                <div ref={menu === c.id ? menuRef : null}>
                  <button
                    className="dx-cxc-more"
                    type="button"
                    aria-label={`Más acciones de ${facturaNumeroDe(c)}`}
                    aria-expanded={menu === c.id}
                    onClick={() => setMenu(menu === c.id ? null : c.id)}
                  >
                    ⋯
                  </button>
                  {menu === c.id && (
                    <div className={`dx-cxc-menu ${index >= rows.length - 2 ? 'is-up' : ''}`} role="menu">
                      {saldo > 0 && (
                        <button type="button" role="menuitem" onClick={() => elegirAccion(abrirGestion, c)}>
                          Registrar gestión
                        </button>
                      )}
                      {puedeEditar && (
                        <button type="button" role="menuitem" onClick={() => elegirAccion(editarVencimiento, c)}>
                          Editar vencimiento
                        </button>
                      )}
                      {puedeEditar && tieneCobros && !terminal && (
                        <button
                          type="button"
                          role="menuitem"
                          className="is-danger"
                          onClick={() => elegirAccion(revertir, c)}
                        >
                          Revertir cobros…
                        </button>
                      )}
                      {puedeAnular && !tieneCobros && facturaPuedeAnularseDe(c) && !terminal && (
                        <button
                          type="button"
                          role="menuitem"
                          className="is-danger"
                          onClick={() => elegirAccion(anular, c)}
                        >
                          Anular factura y su CxC…
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <div className="dx-ui-empty">
            {todas.some((c) => monedaCxCDe(c) === moneda)
              ? 'No hay registros que coincidan con los filtros.'
              : 'No hay cuentas por cobrar en esta moneda.'}
          </div>
        )}
        <div className="dx-cxc-foot">
          <span>
            Mostrando {rows.length} de {todas.filter((c) => monedaCxCDe(c) === moneda).length}
          </span>
          <span>Clic en una fila para ver la ficha · Enter o Espacio con el teclado</span>
        </div>
      </section>
    </>
  );
}

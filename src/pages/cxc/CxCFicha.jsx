import React from 'react';
import { formatearFecha } from './cxcCalculos.js';

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
const ETIQUETAS = {
  detraccion: 'Detracci?n',
  por_autodetraer: 'Por autodetraer',
  autodetraida: 'Autodetra?da',
  autodetraido: 'Autodetra?do',
  depositada: 'Depositada',
  depositado: 'Depositado',
  pendiente: 'Pendiente',
  promesa_pago: 'Promesa de pago',
  pagara_en_fecha_acordada: 'Pagar? en fecha acordada',
};
const legible = (v) =>
  v
    ? ETIQUETAS[String(v).toLowerCase()] ||
      String(v)
        .replace(/_/g, ' ')
        .replace(/^./, (x) => x.toUpperCase())
    : 'Sin dato';
const Dato = ({ nombre, children }) => (
  <div>
    <dt>{nombre}</dt>
    <dd>{children || 'Sin dato'}</dd>
  </div>
);

export default function CxCFicha({ c, datos, acciones, vista, panelRef, Adjunto }) {
  const {
    dias,
    interes,
    saldo,
    estado,
    moraCondonada,
    tasa,
    cobros,
    gestiones,
    notas,
    obligaciones,
    proyMora,
    metaEst,
    vencimiento,
    autodetraccion,
    total,
    pagado,
    neto,
    retencion,
    cliente,
    factura,
    os,
    gestor,
    moneda,
    terminal,
    puedeAnularFactura,
  } = datos;
  const {
    cerrar,
    cambiarTab,
    cobrar,
    gestion,
    autodetraer,
    editar,
    cambiarFecha,
    guardarFecha,
    cancelarFecha,
    navegar,
    revertir,
    anular,
    abrirMenu,
    confirmarMora,
    ejecutarMora,
  } = acciones;
  const {
    panelAbierto,
    tab,
    puedeEditar,
    puedeAnular,
    editando,
    fechaEditada,
    savingVencimiento,
    menu,
    confirmMora,
    savingCondonar,
    today,
    empresaId,
  } = vista;
  const tabs = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'pagos', label: `Cobros (${cobros.length})` },
    { id: 'gestion', label: `Gestión (${gestiones.length})` },
    { id: 'detracciones', label: `Detracciones (${obligaciones.length})` },
    { id: 'notas', label: `Notas de crédito/débito (${notas.length})` },
    ...(dias > 0 || moraCondonada ? [{ id: 'mora', label: 'Mora' }] : []),
  ];
  const porcentaje = total > 0 ? Math.max(0, Math.min(100, Math.round((pagado / total) * 100))) : 0;
  const dinero = (n) => datos.moneyDCurrency(n, moneda);
  return (
    <>
      <div className={'dx-cxc-drawer-bg' + (panelAbierto ? ' is-behind' : '')} onClick={cerrar} />
      <aside
        className={'dx-cxc-drawer' + (panelAbierto ? ' is-behind' : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cxc-ficha-titulo"
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="dx-cxc-drawer-head">
          <div>
            <div className="dx-ui-eyebrow">Cuenta por cobrar</div>
            <div className="dx-cxc-title-line">
              <h2 id="cxc-ficha-titulo">{factura}</h2>
              <span className={`dx-ui-pill ${PILL[estado] || 'is-gray'}`}>
                <i />
                {metaEst.label}
              </span>
              {moraCondonada ? (
                <span className="dx-ui-pill is-green">
                  <i />
                  Mora condonada
                </span>
              ) : (
                dias > 0 && (
                  <span className="dx-ui-pill is-red">
                    <i />
                    {dias} días de mora
                  </span>
                )
              )}
            </div>
            <p>
              {cliente} · {os === '-' ? 'Sin OS' : os}
            </p>
          </div>
          <button type="button" className="dx-cxc-x" aria-label="Cerrar ficha" onClick={cerrar}>
            ×
          </button>
          <div className="dx-cxc-drawer-actions">
            {saldo > 0 && (
              <>
                <button type="button" className="dx-btn primary" onClick={cobrar}>
                  Registrar cobro
                </button>
                <button type="button" className="dx-btn" onClick={gestion}>
                  Registrar gestión
                </button>
              </>
            )}
            {autodetraccion && (
              <button type="button" className="dx-btn" onClick={() => autodetraer(autodetraccion)}>
                Registrar autodetracción
              </button>
            )}
            <div className="dx-cxc-menu-wrap">
              <button
                type="button"
                className="dx-cxc-more"
                aria-label="Más acciones"
                aria-expanded={menu}
                onClick={abrirMenu}
              >
                ⋯
              </button>
              {menu && (
                <div className="dx-cxc-menu" role="menu">
                  {saldo > 0 && (
                    <button role="menuitem" onClick={gestion}>
                      Registrar gestión
                    </button>
                  )}
                  {puedeEditar && (
                    <button role="menuitem" onClick={editar}>
                      Editar vencimiento
                    </button>
                  )}
                  {puedeEditar && cobros.length > 0 && !terminal && (
                    <button role="menuitem" className="is-danger" onClick={revertir}>
                      Revertir cobros…
                    </button>
                  )}
                  {puedeAnular && !cobros.length && puedeAnularFactura && !terminal && (
                    <button role="menuitem" className="is-danger" onClick={anular}>
                      Anular factura y su CxC…
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="dx-ui-tabs dx-cxc-tabs" role="tablist" aria-label="Detalle de cuenta por cobrar">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={'dx-ui-tab ' + (tab === t.id ? 'on' : '')}
              onClick={() => cambiarTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="dx-cxc-drawer-body">
          {tab === 'resumen' && (
            <>
              <section className="dx-cxc-block">
                <h3>Cobranza</h3>
                <div className="dx-cxc-totals">
                  <div>
                    <span>Total</span>
                    <strong className="dx-cxc-money">{dinero(total)}</strong>
                  </div>
                  <div>
                    <span>Cobrado</span>
                    <strong className="dx-cxc-money">{dinero(pagado)}</strong>
                  </div>
                  <div>
                    <span>Saldo</span>
                    <strong className="dx-cxc-money">{dinero(saldo)}</strong>
                  </div>
                </div>
                <div
                  className="dx-cxc-progress"
                  role="progressbar"
                  aria-label="Cobrado"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={porcentaje}
                >
                  <i style={{ width: `${porcentaje}%` }} />
                </div>
                <small>{porcentaje}% cobrado</small>
                {retencion > 0 && (
                  <p>
                    Neto a cobrar: <span className="dx-cxc-money">{dinero(neto)}</span>
                  </p>
                )}
                {dias > 0 && (
                  <p>
                    Interés de mora: <span className="dx-cxc-money">{datos.moneyDCurrency(interes, moneda)}</span>
                  </p>
                )}
              </section>
              <section className="dx-cxc-block">
                <h3>Datos</h3>
                <dl className="dx-cxc-data">
                  <Dato nombre="Emisión">{formatearFecha(c.fecha_emision || c.emision)}</Dato>
                  <Dato nombre="Vencimiento">
                    {editando ? (
                      <span className="dx-cxc-date-edit">
                        <input
                          type="date"
                          value={fechaEditada}
                          disabled={savingVencimiento}
                          onChange={(e) => cambiarFecha(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="dx-btn"
                          disabled={savingVencimiento || !fechaEditada}
                          onClick={guardarFecha}
                        >
                          Guardar
                        </button>
                        <button type="button" className="dx-btn" disabled={savingVencimiento} onClick={cancelarFecha}>
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <>
                        {formatearFecha(vencimiento)}{' '}
                        {puedeEditar && (
                          <button type="button" className="dx-cxc-link" onClick={editar}>
                            Editar
                          </button>
                        )}
                      </>
                    )}
                  </Dato>
                  <Dato nombre="Días de mora">{dias > 0 ? `${dias} días` : 'Al día'}</Dato>
                  <Dato nombre="Moneda">{moneda === 'USD' ? 'Dólares (USD)' : 'Soles (PEN)'}</Dato>
                  <Dato nombre="Medio de pago esperado">{legible(c.medio_pago_esperado)}</Dato>
                  <Dato nombre="Gestor de cobranza">{gestor}</Dato>
                  <Dato nombre="Detracción">
                    {obligaciones.length
                      ? obligaciones
                          .map(
                            (o) =>
                              `${datos.moneySpotCurrency(o.monto_detraccion_origen, o.moneda_origen || moneda)} · ${legible(o.estado)}`,
                          )
                          .join('; ')
                      : 'No aplica'}
                  </Dato>
                  <Dato nombre="Retención SUNAT">{retencion > 0 ? dinero(retencion) : 'No aplica'}</Dato>
                  <Dato nombre="Cliente">
                    <button
                      type="button"
                      className="dx-cxc-link"
                      onClick={() => navegar('cuentas', { detail: c.cuenta_id })}
                    >
                      {cliente}
                    </button>
                  </Dato>
                  <Dato nombre="Factura vinculada">
                    {c.factura_id ? (
                      <button
                        type="button"
                        className="dx-cxc-link"
                        onClick={() => navegar('facturacion', { selFac: c.factura_id })}
                      >
                        {factura}
                      </button>
                    ) : (
                      'Sin factura vinculada'
                    )}
                  </Dato>
                  <Dato nombre="OS Cliente">{os === '-' ? 'Sin dato' : os}</Dato>
                </dl>
              </section>
            </>
          )}
          {tab === 'pagos' && (
            <section className="dx-cxc-block">
              {!cobros.length ? (
                <div className="dx-ui-empty">Todavía no hay cobros registrados.</div>
              ) : (
                <div className="dx-cxc-list">
                  {cobros.map((cb) => (
                    <article className="dx-cxc-item" key={cb.id}>
                      <div>
                        <strong>{formatearFecha(cb.fecha_cobro)}</strong>
                        <span className="dx-cxc-money">{dinero(cb.monto_capital)}</span>
                      </div>
                      <dl className="dx-cxc-data">
                        <Dato nombre="Mora">{cb.monto_mora > 0 ? dinero(cb.monto_mora) : 'No aplica'}</Dato>
                        <Dato nombre="Medio de pago">{legible(cb.medio_pago)}</Dato>
                        <Dato nombre="Referencia">{cb.numero_operacion || cb.referencia}</Dato>
                        <Dato nombre="Cuenta destino">{cb.cuenta_bancaria}</Dato>
                        <Dato nombre="Registrado por">{cb.registrado_por}</Dato>
                        <Dato nombre="Comprobante">
                          <Adjunto registro={cb} empresaId={empresaId} entidadTipo="cobros_cxc" />
                        </Dato>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === 'gestion' && (
            <section className="dx-cxc-block">
              {saldo > 0 && (
                <button type="button" className="dx-btn primary" onClick={gestion}>
                  Nueva gestión
                </button>
              )}
              {!gestiones.length ? (
                <div className="dx-ui-empty">Todavía no hay gestiones de cobranza registradas.</div>
              ) : (
                <div className="dx-cxc-list">
                  {gestiones.map((g) => (
                    <article className="dx-cxc-item" key={g.id}>
                      <div>
                        <span className="dx-ui-pill is-cyan">
                          <i />
                          {legible(g.tipo_gestion)}
                        </span>{' '}
                        <span className="dx-ui-pill is-gray">
                          <i />
                          {legible(g.resultado)}
                        </span>
                        <span>{formatearFecha(g.fecha_gestion)}</span>
                      </div>
                      <p>{g.notas || 'Sin dato'}</p>
                      {g.fecha_acordada_pago && <p>Pago acordado: {formatearFecha(g.fecha_acordada_pago)}</p>}
                      {g.fecha_proxima_accion && <p>Próxima acción: {formatearFecha(g.fecha_proxima_accion)}</p>}
                      {g.usuario && <p>Registrado por: {g.usuario}</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === 'detracciones' && (
            <section className="dx-cxc-block">
              {!obligaciones.length ? (
                <div className="dx-ui-empty">Todavía no hay detracciones registradas.</div>
              ) : (
                <div className="dx-cxc-list">
                  {obligaciones.map((row) => (
                    <article className="dx-cxc-item" key={row.id}>
                      <div>
                        <strong>{row.documento_ajuste_id ? 'Ajuste' : 'Principal'}</strong>
                        <span className={`dx-ui-pill ${row.estado === 'por_autodetraer' ? 'is-amber' : 'is-cyan'}`}>
                          <i />
                          {legible(row.estado)}
                        </span>
                      </div>
                      <dl className="dx-cxc-data">
                        <Dato nombre="Origen">{legible(row.origen)}</Dato>
                        <Dato nombre="Origen moneda CxC">
                          <span className="dx-cxc-money">
                            {datos.moneySpotCurrency(row.monto_detraccion_origen, row.moneda_origen || moneda)}
                          </span>
                        </Dato>
                        <Dato nombre="Depósito PEN">
                          <span className="dx-cxc-money">{datos.moneySpot(row.monto_detraccion_soles)}</span>
                        </Dato>
                        <Dato nombre="Cuenta destino">{row.cuenta_destino_id}</Dato>
                        <Dato nombre="Constancia">{row.numero_constancia}</Dato>
                        {row.fecha_limite_deposito && row.estado === 'por_autodetraer' && (
                          <Dato nombre="Límite">
                            {formatearFecha(row.fecha_limite_deposito)}
                            {row.fecha_limite_deposito < today ? ' · Vencida' : ''}
                          </Dato>
                        )}
                      </dl>
                      {row.estado === 'por_autodetraer' && (
                        <button type="button" className="dx-btn primary" onClick={() => autodetraer(row)}>
                          Registrar
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === 'notas' && (
            <section className="dx-cxc-block">
              {!notas.length ? (
                <div className="dx-ui-empty">Todavía no hay notas de crédito o débito relacionadas.</div>
              ) : (
                <div className="dx-cxc-list">
                  {notas.map((n) => (
                    <article className="dx-cxc-item" key={n.id}>
                      <div>
                        <button
                          type="button"
                          className="dx-cxc-link"
                          onClick={() => navegar('facturacion', { selFac: n.id })}
                        >
                          {n.numero || n.id}
                        </button>
                        <span className="dx-cxc-money">
                          {datos.moneyDCurrency(n.total || n.monto, n.moneda || moneda)}
                        </span>
                      </div>
                      <p>
                        {n.tipo_documento === 'nota_credito' ? 'Nota de crédito' : 'Nota de débito'} ·{' '}
                        {formatearFecha(n.fecha_emision)} · Motivo: {n.motivo_codigo || n.motivo || 'Sin dato'}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === 'mora' && (dias > 0 || moraCondonada) && (
            <section className="dx-cxc-block">
              <h3>Mora</h3>
              {moraCondonada && (
                <>
                  <p>Mora condonada. El interés por mora no aplica para esta CxC por acuerdo con el cliente.</p>
                  {puedeEditar && (
                    <button
                      type="button"
                      className="dx-btn"
                      disabled={savingCondonar}
                      onClick={() => confirmarMora('restaurar')}
                    >
                      {savingCondonar ? 'Restaurando...' : 'Restaurar tasa'}
                    </button>
                  )}
                </>
              )}
              {dias > 0 && !moraCondonada && (
                <>
                  <dl className="dx-cxc-data">
                    <Dato nombre="Fecha de vencimiento">{formatearFecha(vencimiento)}</Dato>
                    <Dato nombre="Días de mora">{`${dias} días`}</Dato>
                    <Dato nombre="Tasa de mora diaria">{`${tasa.toFixed(4)}%`}</Dato>
                    <Dato nombre="Interés acumulado">
                      <span className="dx-cxc-money">{dinero(interes)}</span>
                    </Dato>
                    <Dato nombre="Fórmula aplicada">{`${dinero(saldo)} × ${tasa.toFixed(4)}% × ${dias} días = ${dinero(interes)}`}</Dato>
                  </dl>
                  <h3 className="dx-cxc-mora-proyeccion">Proyección de interés</h3>
                  <div className="dx-cxc-list">
                    {[30, 60, 90].map((d) => (
                      <div className="dx-cxc-item" key={d}>
                        <div>
                          <span>+{d} días adicionales</span>
                          <span className="dx-cxc-money">{dinero(proyMora(d))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {puedeEditar && (
                    <button
                      type="button"
                      className="dx-btn"
                      disabled={savingCondonar}
                      onClick={() => confirmarMora('condonar')}
                    >
                      {savingCondonar ? 'Guardando...' : 'Condonar mora'}
                    </button>
                  )}
                </>
              )}
              {confirmMora && (
                <div role="status">
                  <p>
                    {confirmMora === 'restaurar'
                      ? 'Se restaurará la tasa de mora al valor estándar (0.0833% diario).'
                      : `Se condonará la mora de ${dinero(interes)}. El interés dejará de calcularse y la acción quedará registrada en el historial.`}
                  </p>
                  <button type="button" className="dx-btn" disabled={savingCondonar} onClick={() => confirmarMora('')}>
                    Cancelar
                  </button>{' '}
                  <button type="button" className="dx-btn primary" disabled={savingCondonar} onClick={ejecutarMora}>
                    Confirmar
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

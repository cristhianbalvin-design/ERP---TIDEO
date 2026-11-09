import React, { useEffect, useRef } from 'react';
import './facturacionEmision.css';

const fmt = (n, moneda = 'PEN') =>
  `${moneda === 'USD' ? 'US$' : 'S/'} ${Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const idCampo = (clave) => `fem-${String(clave).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

function Campo({ clave, label, requerido, error, ayuda, children }) {
  return (
    <div className="dx-ui-field">
      <label htmlFor={idCampo(clave)}>
        {label}
        {requerido && <span className="dx-ui-required"> *</span>}
      </label>
      {children}
      {error ? (
        <span className="dx-ui-field-error" id={`${idCampo(clave)}-error`}>
          {error}
        </span>
      ) : (
        ayuda && <span className="dx-ui-field-hint">{ayuda}</span>
      )}
    </div>
  );
}

const ctrl = (clave, errores) => ({
  id: idCampo(clave),
  'aria-invalid': errores[clave] ? 'true' : undefined,
  'aria-describedby': errores[clave] ? `${idCampo(clave)}-error` : undefined,
});

export default function FacturacionEmisionModal({ ctx }) {
  const {
    mode,
    cambiarOrigen,
    onClose,
    onEmitir,
    saving,
    form,
    onFormChange,
    errores = {},
    errorServidor,
    focoError,
    sociedad,
    numeroSugerido,
    valorizacion,
    cliente,
    cebes,
    cebeAyuda,
    partidas,
    catalogo,
    spot,
    totales,
    igvPct,
    onIgvPct,
    detraccion,
    tipoCambio,
    retencion,
    exceso,
    duplicado,
    venta,
    condiciones,
  } = ctx;
  const dialogo = useRef(null);
  const esBoleta = form.tipo_documento === 'boleta';
  const moneda = form.moneda;

  useEffect(() => {
    const anterior = document.activeElement;
    dialogo.current?.focus();
    return () => anterior?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);
  useEffect(() => {
    if (focoError?.clave) document.getElementById(idCampo(focoError.clave))?.focus();
  }, [focoError]);

  const totalErrores = Object.keys(errores).length;
  const bloqueado = saving || (exceso?.aplica && !exceso.confirmado) || (duplicado && !duplicado.confirmado);

  return (
    <div className="dx-ui">
      <div className="dx-ui-overlay">
        <div
          className="dx-ui-dialog dx-ui-dialog-wide dx-fem"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fem-titulo"
          tabIndex={-1}
          ref={dialogo}
        >
          <div className="dx-ui-dialog-head">
            <div>
              <h2 id="fem-titulo">Emitir comprobante</h2>
              <p>
                {mode === 'val'
                  ? `Desde valorización${valorizacion.seleccionada ? ` · ${valorizacion.seleccionada.titulo}` : ''}`
                  : 'Comprobante directo · se crea con su cuenta por cobrar'}
              </p>
            </div>
            <div className="dx-fem-headtools">
              {!venta && (
                <div className="dx-fem-tabs" role="group" aria-label="Origen del comprobante">
                  <button
                    type="button"
                    aria-pressed={mode === 'directa'}
                    onClick={() => cambiarOrigen('directa')}
                    disabled={saving}
                  >
                    Directa
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === 'val'}
                    onClick={() => cambiarOrigen('val')}
                    disabled={saving || !valorizacion.opciones.length}
                  >
                    Desde valorización
                  </button>
                </div>
              )}
              <button type="button" className="dx-fem-x" onClick={onClose} disabled={saving} aria-label="Cerrar">
                ×
              </button>
            </div>
          </div>

          <div className="dx-fem-body">
            <div className="dx-fem-main">
              {venta && (
                <div className="dx-fem-venta">
                  <span>
                    Facturando desde la venta <b>{venta.label}</b>
                  </span>
                  <button type="button" className="dx-fem-link" onClick={venta.onDescartar}>
                    Descartar vínculo
                  </button>
                </div>
              )}

              <section className="dx-fem-block" aria-labelledby="fem-b1">
                <h3 id="fem-b1">
                  <b>1</b>Documento
                </h3>
                <div className="dx-ui-form-grid">
                  <Campo clave="tipo_documento" label="Tipo" requerido>
                    <select
                      className="dx-ui-select"
                      {...ctrl('tipo_documento', errores)}
                      value={form.tipo_documento}
                      onChange={(e) => onFormChange('tipo_documento', e.target.value)}
                    >
                      <option value="factura">Factura</option>
                      <option value="boleta">Boleta de venta</option>
                      <option value="nota_credito">Nota de crédito</option>
                      <option value="nota_debito">Nota de débito</option>
                    </select>
                  </Campo>
                  <Campo
                    clave="numero"
                    label="Número"
                    requerido
                    error={errores.numero}
                    ayuda={form.numero === numeroSugerido ? 'Propuesto por la serie; puedes cambiarlo.' : ''}
                  >
                    <input
                      {...ctrl('numero', errores)}
                      value={form.numero}
                      placeholder={numeroSugerido}
                      onChange={(e) => onFormChange('numero', e.target.value)}
                    />
                  </Campo>
                  {sociedad.visible && (
                    <Campo
                      clave="sociedad"
                      label="Sociedad"
                      requerido={sociedad.editable}
                      error={errores.sociedad}
                      ayuda={sociedad.editable ? '' : sociedad.ayuda}
                    >
                      {sociedad.editable ? (
                        <select
                          className="dx-ui-select"
                          {...ctrl('sociedad', errores)}
                          value={form.sociedad_id || ''}
                          onChange={(e) => onFormChange('sociedad_id', e.target.value)}
                        >
                          <option value="">Selecciona la sociedad…</option>
                          {sociedad.opciones.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.etiqueta}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="dx-fem-readonly" id={idCampo('sociedad')} tabIndex={-1}>
                          {sociedad.texto || 'Sin dato'}
                        </div>
                      )}
                    </Campo>
                  )}
                </div>
              </section>

              <section className="dx-fem-block" aria-labelledby="fem-b2">
                <h3 id="fem-b2">
                  <b>2</b>
                  {mode === 'val' ? 'Origen' : 'Cliente y origen'}
                </h3>
                {mode === 'val' ? (
                  <div className="dx-ui-form-grid is-2">
                    <Campo
                      clave="valorizacion"
                      label="Valorización"
                      requerido
                      error={errores.valorizacion}
                      ayuda={!valorizacion.opciones.length ? 'No hay valorizaciones aprobadas sin facturar.' : ''}
                    >
                      {valorizacion.seleccionada ? (
                        <div className="dx-fem-resolved" id={idCampo('valorizacion')} tabIndex={-1}>
                          <div>
                            <b>{valorizacion.seleccionada.titulo}</b>
                            <small>{valorizacion.seleccionada.detalle}</small>
                          </div>
                          <button
                            type="button"
                            className="dx-btn"
                            onClick={() => valorizacion.onSeleccionar('')}
                            disabled={saving}
                          >
                            Cambiar
                          </button>
                        </div>
                      ) : (
                        <select
                          className="dx-ui-select"
                          {...ctrl('valorizacion', errores)}
                          value=""
                          onChange={(e) => valorizacion.onSeleccionar(e.target.value)}
                        >
                          <option value="">Selecciona la valorización…</option>
                          {valorizacion.opciones.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.etiqueta}
                            </option>
                          ))}
                        </select>
                      )}
                    </Campo>
                    <Campo clave="cebe" label="CEBE" requerido error={errores.cebe} ayuda={cebeAyuda}>
                      <select
                        className="dx-ui-select"
                        {...ctrl('cebe', errores)}
                        value={form.centro_beneficio_id}
                        onChange={(e) => onFormChange('centro_beneficio_id', e.target.value)}
                      >
                        <option value="">Selecciona el CEBE…</option>
                        {cebes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  </div>
                ) : (
                  <div className="dx-ui-form-grid">
                    <Campo clave="cliente" label="Cliente" requerido error={errores.cliente}>
                      <select
                        className="dx-ui-select"
                        {...ctrl('cliente', errores)}
                        value={cliente.id}
                        onChange={(e) => cliente.onSeleccionar(e.target.value)}
                        disabled={Boolean(venta)}
                      >
                        <option value="">Selecciona el cliente…</option>
                        {cliente.opciones.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo
                      clave="os"
                      label="OS de cliente"
                      ayuda={
                        cliente.id ? 'Opcional. Si eliges una OS se valida su saldo.' : 'Elige primero el cliente.'
                      }
                    >
                      <select
                        className="dx-ui-select"
                        {...ctrl('os', errores)}
                        value={cliente.osId}
                        onChange={(e) => cliente.onSeleccionarOs(e.target.value)}
                        disabled={!cliente.id}
                      >
                        <option value="">Sin OS (comprobante directo)</option>
                        {cliente.oses.map((os) => (
                          <option key={os.id} value={os.id}>
                            {os.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo clave="cebe" label="CEBE" requerido error={errores.cebe} ayuda={cebeAyuda}>
                      <select
                        className="dx-ui-select"
                        {...ctrl('cebe', errores)}
                        value={form.centro_beneficio_id}
                        onChange={(e) => onFormChange('centro_beneficio_id', e.target.value)}
                        disabled={!cebes.length && !form.centro_beneficio_id}
                      >
                        <option value="">Selecciona el CEBE…</option>
                        {cebes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  </div>
                )}
              </section>

              <section className="dx-fem-block" aria-labelledby="fem-b3">
                <h3 id="fem-b3">
                  <b>3</b>Partidas
                </h3>
                {errores.partidas && (
                  <span className="dx-ui-field-error" id={idCampo('partidas')} tabIndex={-1}>
                    {errores.partidas}
                  </span>
                )}
                {catalogo.habilitado && (
                  <datalist id="fem-catalogo-servicios">
                    {catalogo.servicios.map((s) => (
                      <option key={s.id} value={catalogo.etiqueta(s)} />
                    ))}
                  </datalist>
                )}
                <div className="dx-fem-lines">
                  <div className="dx-ui-head dx-fem-lcols">
                    <span>Descripción</span>
                    <span>Detracción</span>
                    <span>Cant.</span>
                    <span>{esBoleta ? 'P. unitario (con IGV)' : 'P. unitario'}</span>
                    <span className="dx-fem-right">Importe</span>
                    <span />
                  </div>
                  {partidas.lista.map((p, i) => {
                    const k = (campo) => `partida:${p.id}:${campo}`;
                    const resuelto = spot.resolver(p);
                    return (
                      <div className="dx-ui-row dx-fem-lcols" key={p.id}>
                        <div className="dx-fem-desc">
                          {catalogo.habilitado &&
                            (p.servicio_id ? (
                              <div className="dx-fem-servicio">
                                <span>{p.catalogo_busqueda || p.servicio_id}</span>
                                {p.precio_origen && (
                                  <span className="dx-ui-pill is-cyan">
                                    Precio {p.precio_origen === 'cliente' ? 'del cliente' : 'general'}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="dx-fem-link"
                                  onClick={() => catalogo.onDesvincular(p.id)}
                                >
                                  Desvincular
                                </button>
                              </div>
                            ) : (
                              <input
                                list="fem-catalogo-servicios"
                                aria-label={`Servicio del catálogo, partida ${i + 1}`}
                                value={p.catalogo_busqueda || ''}
                                disabled={!cliente.id || catalogo.cargando}
                                placeholder={
                                  !cliente.id
                                    ? 'Elige el cliente para usar el catálogo'
                                    : catalogo.cargando
                                      ? 'Cargando servicios…'
                                      : 'Buscar servicio del catálogo (opcional)'
                                }
                                onChange={(e) => catalogo.onSeleccionar(p.id, e.target.value)}
                              />
                            ))}
                          <input
                            {...ctrl(k('descripcion'), errores)}
                            aria-label={`Descripción, partida ${i + 1}`}
                            value={p.descripcion || ''}
                            placeholder="Descripción de la partida"
                            onChange={(e) => partidas.onCambiar(p.id, 'descripcion', e.target.value)}
                          />
                          {errores[k('descripcion')] && (
                            <span className="dx-ui-field-error" id={`${idCampo(k('descripcion'))}-error`}>
                              {errores[k('descripcion')]}
                            </span>
                          )}
                          {p.catalogo_cargando && <span className="dx-ui-field-hint">Resolviendo precio…</span>}
                          {p.catalogo_advertencia && <span className="dx-fem-warntext">{p.catalogo_advertencia}</span>}
                        </div>
                        <div className="dx-fem-cell">
                          <select
                            className="dx-ui-select"
                            aria-label={`Código de detracción, partida ${i + 1}`}
                            value={p.spot_catalogo_id || ''}
                            disabled={Boolean(p.servicio_id)}
                            onChange={(e) => partidas.onCambiar(p.id, 'spot_catalogo_id', e.target.value)}
                          >
                            <option value="">
                              {resuelto.spot ? `${resuelto.spot.codigo} · desde ${resuelto.origen}` : 'Sin detracción'}
                            </option>
                            {!p.servicio_id &&
                              spot.catalogo.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {spot.etiqueta(s)}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="dx-fem-cell">
                          <input
                            {...ctrl(k('cantidad'), errores)}
                            className="dx-fem-num"
                            type="number"
                            min="0"
                            step="any"
                            aria-label={`Cantidad, partida ${i + 1}`}
                            value={p.cantidad}
                            onChange={(e) => partidas.onCambiar(p.id, 'cantidad', e.target.value)}
                          />
                          {errores[k('cantidad')] && (
                            <span className="dx-ui-field-error" id={`${idCampo(k('cantidad'))}-error`}>
                              {errores[k('cantidad')]}
                            </span>
                          )}
                        </div>
                        <div className="dx-fem-cell">
                          <input
                            {...ctrl(k('precio'), errores)}
                            className="dx-fem-num"
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`Precio unitario, partida ${i + 1}`}
                            value={p.precio_unitario}
                            onChange={(e) => partidas.onCambiar(p.id, 'precio_unitario', e.target.value)}
                          />
                          {errores[k('precio')] && (
                            <span className="dx-ui-field-error" id={`${idCampo(k('precio'))}-error`}>
                              {errores[k('precio')]}
                            </span>
                          )}
                        </div>
                        <span className="dx-fem-amt">
                          {fmt(Number(p.cantidad || 0) * Number(p.precio_unitario || 0), moneda)}
                        </span>
                        <button
                          type="button"
                          className="dx-fem-del"
                          aria-label={`Quitar partida ${i + 1}`}
                          onClick={() => partidas.onQuitar(p.id)}
                          disabled={partidas.lista.length === 1}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <div className="dx-fem-addline">
                    <button type="button" className="dx-btn" onClick={partidas.onAgregar}>
                      ＋ Agregar partida
                    </button>
                    {catalogo.error && <span className="dx-fem-warntext">{catalogo.error}</span>}
                  </div>
                </div>
              </section>

              <section className="dx-fem-block" aria-labelledby="fem-b4">
                <h3 id="fem-b4">
                  <b>4</b>Fechas, cobro y moneda
                </h3>
                <div className="dx-ui-form-grid">
                  <Campo clave="moneda" label="Moneda" requerido error={errores.moneda}>
                    <select
                      className="dx-ui-select"
                      {...ctrl('moneda', errores)}
                      value={form.moneda}
                      onChange={(e) => onFormChange('moneda', e.target.value)}
                    >
                      <option value="PEN">PEN · Soles</option>
                      <option value="USD">USD · Dólares</option>
                    </select>
                  </Campo>
                  <Campo clave="fecha_emision" label="Fecha de emisión" requerido error={errores.fecha_emision}>
                    <input
                      type="date"
                      {...ctrl('fecha_emision', errores)}
                      value={form.fecha_emision}
                      onChange={(e) => onFormChange('fecha_emision', e.target.value)}
                    />
                  </Campo>
                  <Campo clave="condicion_pago" label="Condición de pago" requerido>
                    <select
                      className="dx-ui-select"
                      {...ctrl('condicion_pago', errores)}
                      value={form.condicion_pago}
                      onChange={(e) => onFormChange('condicion_pago', e.target.value)}
                    >
                      {condiciones.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo
                    clave="fecha_vencimiento"
                    label="Vencimiento"
                    requerido
                    error={errores.fecha_vencimiento}
                    ayuda="Calculado con la condición de pago; puedes cambiarlo."
                  >
                    <input
                      type="date"
                      {...ctrl('fecha_vencimiento', errores)}
                      value={form.fecha_vencimiento}
                      onChange={(e) => onFormChange('fecha_vencimiento', e.target.value)}
                    />
                  </Campo>
                  {tipoCambio.visible && (
                    <>
                      <Campo
                        clave="tipo_cambio"
                        label="Tipo de cambio para la detracción"
                        requerido
                        error={errores.tipo_cambio}
                        ayuda={tipoCambio.ayuda}
                      >
                        <input
                          type="number"
                          min="0"
                          step="0.000001"
                          {...ctrl('tipo_cambio', errores)}
                          value={tipoCambio.valor}
                          onChange={(e) => tipoCambio.onCambiar(e.target.value)}
                        />
                      </Campo>
                      <Campo
                        clave="tipo_cambio_fuente"
                        label="Fuente del tipo de cambio"
                        requerido
                        error={errores.tipo_cambio_fuente}
                      >
                        <select
                          className="dx-ui-select"
                          {...ctrl('tipo_cambio_fuente', errores)}
                          value={tipoCambio.fuente}
                          onChange={(e) => tipoCambio.onFuente(e.target.value)}
                        >
                          <option value="referencial">Referencial</option>
                          <option value="manual">Manual</option>
                        </select>
                      </Campo>
                    </>
                  )}
                </div>
              </section>

              <section className="dx-fem-block" aria-labelledby="fem-b5">
                <h3 id="fem-b5">
                  <b>5</b>Glosa y notas
                </h3>
                <div className="dx-ui-form-grid is-2">
                  <Campo clave="glosa" label="Glosa">
                    <textarea
                      {...ctrl('glosa', errores)}
                      value={form.glosa}
                      placeholder="Texto que acompaña al comprobante"
                      onChange={(e) => onFormChange('glosa', e.target.value)}
                    />
                  </Campo>
                  <Campo clave="notas" label="Notas internas">
                    <textarea
                      {...ctrl('notas', errores)}
                      value={form.notas}
                      placeholder="Solo visibles en el ERP"
                      onChange={(e) => onFormChange('notas', e.target.value)}
                    />
                  </Campo>
                </div>
              </section>
            </div>

            <aside className="dx-fem-aside" aria-label="Resumen del comprobante">
              <div className="dx-fem-tot">
                <div>
                  <span>{esBoleta ? 'Valor de venta' : 'Subtotal'}</span>
                  <b>{fmt(totales.subtotal, moneda)}</b>
                </div>
                <div>
                  <span className="dx-fem-igv">
                    IGV
                    {esBoleta ? (
                      ` ${igvPct} % incluido`
                    ) : (
                      <>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          aria-label="Porcentaje de IGV"
                          value={igvPct}
                          onChange={(e) => onIgvPct(Number(e.target.value))}
                        />
                        %
                      </>
                    )}
                  </span>
                  <b>{fmt(totales.igv, moneda)}</b>
                </div>
                <div className="is-total">
                  <span>Total</span>
                  <b>{fmt(totales.total, moneda)}</b>
                </div>
              </div>

              <ResumenDetraccion detraccion={detraccion} moneda={moneda} />

              {retencion.aplica && (
                <div className="dx-fem-card">
                  <h4>Retención SUNAT · {retencion.tasa} %</h4>
                  <div>
                    <span>El cliente retiene</span>
                    <b>{fmt(totales.montoRetencion, moneda)}</b>
                  </div>
                </div>
              )}

              <div className="dx-fem-tot">
                <div className="is-net">
                  <span>Neto a cobrar al cliente</span>
                  <b>{fmt(detraccion.estado === 'aplica' ? detraccion.netoCliente : totales.netoCobrable, moneda)}</b>
                </div>
              </div>

              <div className="dx-fem-card">
                <h4>Cobro</h4>
                <div>
                  <span>Vence</span>
                  <b>{form.fecha_vencimiento ? form.fecha_vencimiento.split('-').reverse().join('/') : 'Sin dato'}</b>
                </div>
                <div>
                  <span>Retención</span>
                  <b>{retencion.aplica ? `Agente · ${retencion.tasa} %` : 'No aplica'}</b>
                </div>
              </div>

              {exceso?.aplica && (
                <div className="dx-fem-warn" role="alert">
                  <b>El total supera el saldo por facturar de la OS.</b>
                  <span>{exceso.texto}</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={exceso.confirmado}
                      onChange={(e) => exceso.onConfirmar(e.target.checked)}
                    />
                    Confirmo que el exceso es intencional
                  </label>
                </div>
              )}
              {duplicado && (
                <div className="dx-fem-warn" role="alert">
                  <b>El número {duplicado.numero} ya existe para otro cliente.</b>
                  <span>Lo usa {duplicado.clientes} en esta sociedad.</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={duplicado.confirmado}
                      onChange={(e) => duplicado.onConfirmar(e.target.checked)}
                    />
                    Emitirlo de todas formas para este cliente
                  </label>
                </div>
              )}
            </aside>
          </div>

          <div className="dx-ui-dialog-foot">
            <span className="dx-fem-foot-msg">
              {errorServidor ? (
                <span className="dx-fem-err" role="alert">
                  {errorServidor}
                </span>
              ) : totalErrores ? (
                <span className="dx-fem-err" role="alert">
                  {totalErrores === 1 ? 'Revisa el campo marcado.' : `Revisa los ${totalErrores} campos marcados.`}
                </span>
              ) : exceso?.aplica && !exceso.confirmado ? (
                'Confirma el exceso de saldo de la OS para emitir.'
              ) : (
                'Se emite el comprobante y su cuenta por cobrar en una sola operación.'
              )}
            </span>
            <button type="button" className="dx-btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="dx-btn primary" onClick={onEmitir} disabled={bloqueado}>
              {saving ? 'Emitiendo…' : esBoleta ? 'Emitir boleta' : 'Emitir factura'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumenDetraccion({ detraccion, moneda }) {
  const pct = detraccion.spot ? `${Number(detraccion.spot.porcentaje || 0)} %` : '';
  if (detraccion.estado === 'sin_codigo') {
    return (
      <div className="dx-fem-card">
        <h4>Detracción</h4>
        <div>
          <span>Sin código SPOT</span>
          <b>No aplica</b>
        </div>
      </div>
    );
  }
  const titulo = `Detracción SPOT ${detraccion.spot.codigo} · ${pct}`;
  if (detraccion.estado === 'no_aplica_documento') {
    return (
      <div className="dx-fem-card">
        <h4>{titulo}</h4>
        <div>
          <span>Boleta</span>
          <b>No aplica</b>
        </div>
      </div>
    );
  }
  if (detraccion.estado === 'falta_tipo_cambio') {
    return (
      <div className="dx-fem-card">
        <h4>{titulo}</h4>
        <div>
          <span>Base en soles</span>
          <b>Falta tipo de cambio</b>
        </div>
      </div>
    );
  }
  return (
    <div className="dx-fem-card">
      <h4>{titulo}</h4>
      <div>
        <span>Base en soles</span>
        <b>{fmt(detraccion.baseSoles, 'PEN')}</b>
      </div>
      <div>
        <span>Umbral</span>
        <b>
          {fmt(detraccion.minimo, 'PEN')} · {detraccion.estado === 'aplica' ? 'aplica' : 'no aplica'}
        </b>
      </div>
      {detraccion.estado === 'aplica' && (
        <>
          <div>
            <span>Depósito (redondeado)</span>
            <b>{fmt(detraccion.depositoSoles, 'PEN')}</b>
          </div>
          {moneda === 'USD' && (
            <div>
              <span>En la moneda de la factura</span>
              <b>{fmt(detraccion.montoOrigen, 'USD')}</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}

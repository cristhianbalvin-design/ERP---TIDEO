import React, { useEffect, useRef } from 'react';

function Dialogo({
  titulo,
  subtitulo,
  cerrar,
  children,
  ancho = false,
  saving = false,
  puedeCerrarFondo = () => true,
}) {
  useEffect(() => {
    const escape = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!saving) cerrar();
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [cerrar, saving]);
  return (
    <div
      className="dx-ui-overlay"
      onClick={() => {
        if (!saving && puedeCerrarFondo()) cerrar();
      }}
    >
      <div
        className={`dx-ui-dialog${ancho ? ' dx-ui-dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cxc-modal-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dx-ui-dialog-head">
          <div>
            <h2 id="cxc-modal-titulo">{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" className="dx-cxc-x" aria-label="Cerrar" onClick={cerrar}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Campo({ nombre, etiqueta, error, children, completo = false }) {
  const obligatorio = typeof etiqueta === 'string' && etiqueta.endsWith(' *');
  return (
    <div className={`dx-ui-field${completo ? ' is-full' : ''}`}>
      <label htmlFor={`cxc-${nombre}`}>
        {obligatorio ? etiqueta.slice(0, -2) : etiqueta}
        {obligatorio && (
          <>
            {' '}
            <span className="dx-ui-required">*</span>
          </>
        )}
      </label>
      {children}
      {error && (
        <span id={`cxc-${nombre}-error`} className="dx-ui-field-error">
          {error}
        </span>
      )}
    </div>
  );
}
const atributos = (nombre, errores) => ({
  id: `cxc-${nombre}`,
  name: nombre,
  'aria-invalid': !!errores[nombre],
  'aria-describedby': errores[nombre] ? `cxc-${nombre}-error` : undefined,
});

export function CxCCobroModal({
  c,
  form,
  setForm,
  errores,
  setErrores,
  errorServidor,
  guardar,
  cerrar,
  saving,
  saldo,
  total,
  pagado,
  reservado,
  maxNormal,
  pendiente,
  bloqueado,
  cargadas,
  errorCarga,
  cuentas,
  cuentasDetraccion,
  cuentaUnica,
  cliente,
  factura,
  formato,
  formatoSpot,
  diasMora,
  interes,
  today,
  archivo,
  setArchivo,
  errorArchivo,
  setErrorArchivo,
  validarArchivo,
  navigate,
}) {
  const modificado = useRef(false);
  const inicial = useRef(null);
  if (!modificado.current) inicial.current = JSON.stringify(form);
  const cambiar = (nombre, valor) => {
    setForm((v) => ({ ...v, [nombre]: valor }));
    setErrores((v) => ({ ...v, [nombre]: undefined }));
  };
  const detraccion = form.tipo_cobro === 'detraccion';
  const cambiarTipo = (tipo) => {
    if (tipo !== form.tipo_cobro) modificado.current = true;
    setForm((v) => ({
      ...v,
      tipo_cobro: tipo,
      cliente_pago_total_sin_detraer: false,
      monto: tipo === 'detraccion' ? String(pendiente?.monto_detraccion_origen || '') : String(maxNormal),
      monto_deposito_soles: tipo === 'detraccion' ? String(pendiente?.monto_detraccion_soles || '') : '',
      tipo_cambio_detraccion: tipo === 'detraccion' ? (pendiente?.tipo_cambio ?? null) : null,
      cuenta_bancaria: tipo === 'detraccion' ? cuentaUnica : '',
      medio_pago: tipo === 'detraccion' ? 'Detraccion' : v.medio_pago === 'Detraccion' ? '' : v.medio_pago,
    }));
    setErrores({});
  };
  const importe = Number(form.monto || 0);
  const saldoTras = Math.max(0, saldo - (detraccion ? importe : Math.min(importe, maxNormal)));
  return (
    <Dialogo
      titulo="Registrar cobro"
      subtitulo={`${cliente} · ${factura}`}
      cerrar={cerrar}
      saving={saving}
      puedeCerrarFondo={() => !modificado.current || (JSON.stringify(form) === inicial.current && !archivo)}
      ancho
    >
      <form
        noValidate
        onChangeCapture={() => {
          modificado.current = true;
        }}
        onSubmit={guardar}
      >
        <div className="dx-cxc-pay">
          <div className="dx-cxc-pay-main">
            <div className="dx-cxc-seg" role="group" aria-label="Tipo de cobro">
              <button
                type="button"
                aria-pressed={!detraccion}
                disabled={!cargadas}
                onClick={() => cambiarTipo('normal')}
              >
                Cobro normal
              </button>
              <button
                type="button"
                aria-pressed={detraccion}
                disabled={!pendiente}
                onClick={() => cambiarTipo('detraccion')}
              >
                Detracción
              </button>
            </div>
            {detraccion && (
              <p className="dx-cxc-note">
                Registra el depósito recibido en la cuenta de detracciones del Banco de la Nación. Usa la fecha del
                depósito.
              </p>
            )}
            {errorCarga && (
              <p className="dx-cxc-note">
                No se pudieron cargar las detracciones. El cobro está bloqueado hasta completar la carga.
              </p>
            )}
            {!detraccion && pendiente && (
              <label>
                <input
                  type="checkbox"
                  checked={form.cliente_pago_total_sin_detraer}
                  onChange={(e) =>
                    setForm((v) => ({
                      ...v,
                      cliente_pago_total_sin_detraer: e.target.checked,
                      monto: String(e.target.checked ? saldo : maxNormal),
                    }))
                  }
                />{' '}
                El cliente pagó el total sin detraer. La empresa deberá depositar la detracción dentro de 5 días
                hábiles.
              </label>
            )}
            {!detraccion && bloqueado && !form.cliente_pago_total_sin_detraer && (
              <p className="dx-cxc-note">
                No hay saldo cobrable como normal; lo pendiente corresponde a la detracción.
              </p>
            )}
            <div className="dx-ui-form-grid">
              <Campo
                nombre="monto"
                etiqueta={detraccion ? 'Se aplica a la CxC' : 'Monto cobrado *'}
                error={errores.monto}
              >
                <input
                  {...atributos('monto', errores)}
                  type={detraccion ? 'text' : 'number'}
                  min="0.01"
                  step="0.01"
                  readOnly={detraccion}
                  value={form.monto}
                  onChange={(e) => cambiar('monto', e.target.value)}
                  autoFocus
                />
              </Campo>
              {detraccion && (
                <Campo nombre="deposito" etiqueta="Depósito en tu cuenta de detracciones">
                  <input id="cxc-deposito" readOnly value={formatoSpot(form.monto_deposito_soles)} />
                </Campo>
              )}
              <Campo nombre="fecha_cobro" etiqueta="Fecha de cobro *" error={errores.fecha_cobro}>
                <input
                  {...atributos('fecha_cobro', errores)}
                  type="date"
                  value={form.fecha_cobro}
                  onChange={(e) => cambiar('fecha_cobro', e.target.value)}
                />
              </Campo>
              <div className="is-full">
                <label>
                  <input
                    type="checkbox"
                    checked={form.incluye_mora}
                    onChange={(e) => cambiar('incluye_mora', e.target.checked)}
                  />{' '}
                  Incluye interés de mora en este cobro
                </label>
              </div>
              {form.incluye_mora && (
                <Campo nombre="monto_mora" etiqueta="Monto mora cobrado">
                  <input
                    id="cxc-monto_mora"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monto_mora}
                    onChange={(e) => cambiar('monto_mora', e.target.value)}
                    placeholder={diasMora > 0 ? String(interes.toFixed(2)) : '0.00'}
                  />
                </Campo>
              )}
              <Campo nombre="medio_pago" etiqueta="Medio de pago *" error={errores.medio_pago}>
                <select
                  {...atributos('medio_pago', errores)}
                  className="dx-ui-select"
                  disabled={detraccion}
                  value={form.medio_pago}
                  onChange={(e) => cambiar('medio_pago', e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  <option>Transferencia bancaria</option>
                  <option>Depósito</option>
                  {detraccion && <option value="Detraccion">Depósito de detracción recibido</option>}
                  <option>Cheque</option>
                  <option>Efectivo</option>
                  <option>Otro</option>
                </select>
              </Campo>
              <Campo nombre="cuenta_bancaria" etiqueta="Cuenta bancaria destino" error={errores.cuenta_bancaria}>
                <select
                  {...atributos('cuenta_bancaria', errores)}
                  className="dx-ui-select"
                  value={form.cuenta_bancaria}
                  onChange={(e) => cambiar('cuenta_bancaria', e.target.value)}
                >
                  <option value="">Seleccionar cuenta...</option>
                  {(detraccion ? cuentasDetraccion : cuentas.filter((cb) => !cb.es_cuenta_detracciones)).map((cb) => (
                    <option key={cb.id} value={cb.id}>
                      {cb.nombre} — {cb.banco} — {cb.moneda}
                    </option>
                  ))}
                </select>
                {detraccion && !cuentasDetraccion.length && (
                  <span className="dx-ui-field-hint">No hay una cuenta de detracciones PEN para esta sociedad.</span>
                )}
                {!cuentas.length && (
                  <button type="button" className="dx-cxc-link" onClick={() => navigate('parametros')}>
                    Agregar cuentas en Parámetros Generales
                  </button>
                )}
              </Campo>
              <Campo
                nombre="numero_operacion"
                etiqueta="N° operación / referencia"
                error={errores.numero_operacion}
                completo
              >
                <input
                  {...atributos('numero_operacion', errores)}
                  value={form.numero_operacion}
                  onChange={(e) => cambiar('numero_operacion', e.target.value)}
                  placeholder="N° transferencia, depósito, cheque..."
                />
              </Campo>
              {detraccion && (
                <Campo nombre="numero_constancia" etiqueta="Número de constancia (opcional)" completo>
                  <input
                    id="cxc-numero_constancia"
                    value={form.numero_constancia}
                    onChange={(e) => cambiar('numero_constancia', e.target.value)}
                  />
                </Campo>
              )}
              <Campo nombre="notas" etiqueta="Notas (opcional)" completo>
                <textarea
                  id="cxc-notas"
                  rows={2}
                  value={form.notas}
                  onChange={(e) => cambiar('notas', e.target.value)}
                />
              </Campo>
              <Campo
                nombre="archivo"
                etiqueta="Comprobante de pago (opcional)"
                error={errores.archivo || errorArchivo}
                completo
              >
                <input
                  {...atributos('archivo', { archivo: errores.archivo || errorArchivo })}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip,application/x-zip-compressed"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    const v = f && validarArchivo(f);
                    setArchivo(v && !v.ok ? null : f);
                    setErrorArchivo(v && !v.ok ? v.error : '');
                    setErrores((x) => ({ ...x, archivo: undefined }));
                  }}
                />
                <span className="dx-ui-field-hint">PDF, imagen, Office o ZIP; máximo 20 MB. {archivo?.name}</span>
              </Campo>
            </div>
          </div>
          <aside className="dx-cxc-pay-aside" aria-label="Resumen del cobro">
            <div>
              <span>Total facturado</span>
              <strong>{formato(total, c.moneda)}</strong>
            </div>
            {Number(c.monto_retencion || 0) > 0 && (
              <div>
                <span>Retención SUNAT</span>
                <strong>{formato(c.monto_retencion, c.moneda)}</strong>
              </div>
            )}
            {reservado > 0 && (
              <>
                <div>
                  <span>Reservado para detracción</span>
                  <strong>{formato(reservado, c.moneda)}</strong>
                </div>
                <div>
                  <span>Máximo cobrable ahora</span>
                  <strong>{formato(maxNormal, c.moneda)}</strong>
                </div>
              </>
            )}
            <div>
              <span>Ya pagado</span>
              <strong>{formato(pagado, c.moneda)}</strong>
            </div>
            <div>
              <span>Saldo actual</span>
              <strong>{formato(saldo, c.moneda)}</strong>
            </div>
            <div>
              <span>Este cobro</span>
              <strong>{formato(importe, c.moneda)}</strong>
            </div>
            <div className="is-total">
              <span>Saldo tras cobro</span>
              <strong>{formato(saldoTras, c.moneda)}</strong>
            </div>
            {diasMora > 0 && (
              <div>
                <span>Interés de mora</span>
                <strong>{formato(interes, c.moneda)}</strong>
              </div>
            )}
          </aside>
        </div>
        <div className="dx-ui-dialog-foot">
          {errorServidor && (
            <span role="alert" className="dx-ui-field-error">
              {errorServidor}
            </span>
          )}
          <button type="button" className="dx-btn" onClick={cerrar} disabled={saving}>
            Cancelar
          </button>
          <button className="dx-btn primary" type="submit" disabled={saving}>
            {saving ? 'Registrando...' : 'Registrar cobro'}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

export function CxCGestionModal({
  form,
  setForm,
  error,
  setError,
  errorServidor,
  guardar,
  cerrar,
  saving,
  cliente,
  factura,
}) {
  const modificado = useRef(false);
  const inicial = useRef(JSON.stringify(form));
  const requiereFecha = ['promesa_pago', 'pagara_en_fecha_acordada'].includes(form.resultado);
  return (
    <Dialogo
      titulo="Gestión de cobranza"
      subtitulo={`${cliente} · ${factura}`}
      cerrar={cerrar}
      saving={saving}
      puedeCerrarFondo={() => !modificado.current || JSON.stringify(form) === inicial.current}
    >
      <form
        onChangeCapture={() => {
          modificado.current = true;
        }}
        onSubmit={guardar}
      >
        <div className="dx-cxc-modal-body dx-ui-form-grid">
          <Campo nombre="tipo_gestion" etiqueta="Tipo de gestión *">
            <select
              id="cxc-tipo_gestion"
              className="dx-ui-select"
              required
              value={form.tipo_gestion}
              onChange={(e) => setForm((v) => ({ ...v, tipo_gestion: e.target.value }))}
            >
              <option value="">Seleccionar...</option>
              {[
                ['llamada_telefonica', 'Llamada telefónica'],
                ['email', 'Email'],
                ['whatsapp', 'WhatsApp'],
                ['visita_presencial', 'Visita presencial'],
                ['carta_notarial', 'Carta notarial'],
                ['otro', 'Otro'],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Campo>
          <Campo nombre="resultado" etiqueta="Resultado *">
            <select
              id="cxc-resultado"
              className="dx-ui-select"
              required
              value={form.resultado}
              onChange={(e) => setForm((v) => ({ ...v, resultado: e.target.value }))}
            >
              <option value="">Seleccionar...</option>
              {[
                ['promesa_pago', 'Promesa de pago'],
                ['no_contesta', 'No contesta'],
                ['numero_equivocado', 'Número equivocado'],
                ['cliente_solicita_plazo', 'Cliente solicita plazo'],
                ['cliente_disputa_monto', 'Cliente disputa monto'],
                ['pagara_en_fecha_acordada', 'Pagará en fecha acordada'],
                ['sin_respuesta', 'Sin respuesta'],
                ['otro', 'Otro'],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Campo>
          {requiereFecha && (
            <Campo nombre="fecha_acordada_pago" etiqueta="Fecha acordada de pago">
              <input
                id="cxc-fecha_acordada_pago"
                type="date"
                value={form.fecha_acordada_pago}
                onChange={(e) => setForm((v) => ({ ...v, fecha_acordada_pago: e.target.value }))}
              />
            </Campo>
          )}
          <Campo
            nombre="fecha_proxima_accion"
            etiqueta={`Fecha próxima acción${requiereFecha ? ' *' : ''}`}
            error={error}
          >
            <input
              {...atributos('fecha_proxima_accion', { fecha_proxima_accion: error })}
              type="date"
              value={form.fecha_proxima_accion}
              onChange={(e) => {
                setError('');
                setForm((v) => ({ ...v, fecha_proxima_accion: e.target.value }));
              }}
            />
          </Campo>
          <Campo nombre="gestion_notas" etiqueta="Notas *" completo>
            <textarea
              id="cxc-gestion_notas"
              rows={4}
              required
              value={form.notas}
              onChange={(e) => setForm((v) => ({ ...v, notas: e.target.value }))}
              placeholder="Detalla la gestión realizada, quién atendió, acuerdos..."
            />
          </Campo>
        </div>
        <div className="dx-ui-dialog-foot">
          {errorServidor && (
            <span role="alert" className="dx-ui-field-error">
              {errorServidor}
            </span>
          )}
          <button type="button" className="dx-btn" onClick={cerrar} disabled={saving}>
            Cancelar
          </button>
          <button className="dx-btn primary" type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar gestión'}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

export function CxCAnularFacturaModal({ c, factura, cliente, total, motivo, setMotivo, cerrar, confirmar }) {
  return (
    <Dialogo titulo="Anular documento financiero" cerrar={cerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (motivo.trim()) confirmar(motivo.trim());
        }}
      >
        <div className="dx-cxc-modal-body">
          <div className="dx-cxc-pay-aside">
            <div>
              <span>Factura</span>
              <strong>{factura}</strong>
            </div>
            <div>
              <span>Cliente</span>
              <strong>{cliente}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{total}</strong>
            </div>
          </div>
          <p className="dx-cxc-note">
            La factura y la CxC relacionada quedarán anuladas. El registro se conservará para auditoría y dejará de
            generar saldo pendiente.{' '}
            {c.valorizacion_id && 'Se aplicarán las reglas existentes de anulación de valorización.'}
          </p>
          <Campo nombre="motivo" etiqueta="Motivo obligatorio">
            <textarea id="cxc-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </Campo>
        </div>
        <div className="dx-ui-dialog-foot">
          <button type="button" className="dx-btn" onClick={cerrar}>
            Cancelar
          </button>
          <button type="submit" className="dx-btn danger" disabled={!motivo.trim()}>
            Confirmar anulación
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

export function CxCRevertirCobrosModal({
  factura,
  cliente,
  total,
  pagado,
  comisionPagada,
  comisionPendiente,
  cerrar,
  confirmar,
}) {
  return (
    <Dialogo titulo="Revertir cobros por error" cerrar={cerrar}>
      <div className="dx-cxc-modal-body">
        <div className="dx-cxc-pay-aside">
          {[
            ['Factura', factura],
            ['Cliente', cliente],
            ['Total', total],
            ['Pagado', pagado],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        {comisionPagada ? (
          <p className="dx-cxc-note">
            Bloqueado: existe una comisión pagada vinculada. Realiza un ajuste manual en Comisiones antes de revertir.
          </p>
        ) : (
          <>
            <p>
              Se eliminarán los cobros, la CxC volverá a Por cobrar y se desvincularán las conciliaciones bancarias.{' '}
              {comisionPendiente && 'Las comisiones pendientes o aprobadas serán rechazadas.'}
            </p>
            <p>La factura y la valorización no se modifican. Podrás registrar el cobro nuevamente.</p>
          </>
        )}
        <p>Esta acción no se puede deshacer.</p>
      </div>
      <div className="dx-ui-dialog-foot">
        <button type="button" className="dx-btn" onClick={cerrar}>
          Cancelar
        </button>
        {!comisionPagada && (
          <button type="button" className="dx-btn danger" onClick={confirmar}>
            Revertir cobros
          </button>
        )}
      </div>
    </Dialogo>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../lib/currency.js';
import { cuentasParaFinanciamiento, esInteresSaldo, tasaMensualFinanciamiento, tcSugerido } from '../../services/financiamientosService.js';
import './financiamiento.css';

const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const fecha = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : 'Sin dato');
const mesAnio = s => (s ? new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(s).slice(0, 10)}T12:00:00Z`)) : '');
const r2 = v => Math.round(Number(v || 0) * 100) / 100;
const num = v => (v === '' || v === null || v === undefined ? NaN : Number(v));
const impaga = c => c.estado !== 'pagada' && c.estado !== 'cancelada';
const etiquetaCuenta = c => `${c.nombre?.trim() || 'Cuenta'} · ${c.banco?.trim() || 'Sin banco'} (${c.moneda || 'PEN'})`;

const MODOS_SALDO = [
  { value: 'interes', label: 'Interés del mes', ayuda: 'Paga el interés de un período.' },
  { value: 'capital', label: 'Abono a capital', ayuda: 'Baja la deuda y el interés futuro.' },
  { value: 'ambos', label: 'Interés + capital', ayuda: 'Las dos cosas en una operación.' },
];
const MODOS_CUOTA = [
  { value: 'cuota', label: 'Cuota pactada', ayuda: 'Paga una cuota del cronograma.' },
  { value: 'capital_parcial', label: 'Abono a capital', ayuda: 'Se recalculan las cuotas que faltan.' },
  { value: 'capital_total', label: 'Cancelar el capital', ayuda: 'Paga todo el saldo pendiente.' },
];

// Calcula lo que se va a pagar según el modo (sin tocar el servidor).
export function resumenPago(financiamiento, { modo, periodo, capital }) {
  const saldo = Number(financiamiento?.saldo_pendiente || 0);
  if (esInteresSaldo(financiamiento)) {
    const interes = modo === 'capital' ? 0 : r2(periodo?.interes);
    const cap = modo === 'interes' ? 0 : r2(Math.min(Math.max(num(capital) || 0, 0), saldo));
    return { interes, capital: cap, total: r2(interes + cap), saldoDespues: r2(saldo - cap) };
  }
  if (modo === 'cuota') {
    return { interes: r2(periodo?.interes), capital: r2(periodo?.capital), total: r2(periodo?.total), saldoDespues: r2(Math.max(0, saldo - Number(periodo?.capital || 0))) };
  }
  const cap = modo === 'capital_total' ? r2(saldo) : r2(Math.min(Math.max(num(capital) || 0, 0), saldo));
  return { interes: 0, capital: cap, total: cap, saldoDespues: r2(saldo - cap) };
}

export default function FinanciamientoPago({ financiamiento: f, cuotaInicial = null, cuentasBancarias = [], empresaId, tcUsdPorPen = null, onCerrar, onConfirmar }) {
  const interesSaldo = esInteresSaldo(f);
  const moneda = f.moneda || 'PEN';
  const money = v => formatMoney(v, moneda);
  const saldo = Number(f.saldo_pendiente || 0);
  const periodos = [...(f.tabla_amortizacion || [])].filter(impaga).sort((a, b) => Number(a.numero) - Number(b.numero));
  const inicial = (cuotaInicial && periodos.find(c => c.numero === cuotaInicial.numero)) || periodos[0] || null;
  const cuentas = cuentasParaFinanciamiento(cuentasBancarias, { empresaId, sociedadId: f.sociedad_id || null });
  const cuentaPorDefecto = cuentas.find(c => c.id === f.cuenta_bancaria_id) || cuentas.find(c => (c.moneda || 'PEN') === moneda) || null;
  const [modo, setModo] = useState(interesSaldo ? (inicial ? 'interes' : 'capital') : (inicial ? 'cuota' : 'capital_parcial'));
  const [form, setForm] = useState({
    periodo: inicial?.numero ?? '',
    capital: '',
    fecha: hoyLima(),
    cuenta_bancaria_id: cuentaPorDefecto?.id || '',
    tc_aplicado: cuentaPorDefecto ? (tcSugerido(moneda, cuentaPorDefecto.moneda, tcUsdPorPen) ?? '') : '',
    referencia: '',
    comprobante: '',
  });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const dialogo = useRef(null);

  useEffect(() => {
    const esc = e => { if (e.key === 'Escape' && !guardando) onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [guardando, onCerrar]);

  const modos = interesSaldo ? MODOS_SALDO : MODOS_CUOTA;
  const usaPeriodo = interesSaldo ? modo !== 'capital' : modo === 'cuota';
  const usaCapital = interesSaldo ? modo !== 'interes' : modo === 'capital_parcial';
  const periodo = periodos.find(c => Number(c.numero) === Number(form.periodo)) || null;
  const cuenta = cuentas.find(c => c.id === form.cuenta_bancaria_id) || null;
  const otraMoneda = Boolean(cuenta && (cuenta.moneda || 'PEN') !== moneda);
  const res = resumenPago(f, { modo, periodo, capital: form.capital });

  const set = (k, v) => {
    setErrorServidor('');
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'cuenta_bancaria_id') {
        const c = cuentas.find(x => x.id === v);
        next.tc_aplicado = c ? (tcSugerido(moneda, c.moneda, tcUsdPorPen) ?? '') : '';
      }
      return next;
    });
    setErrores(prev => { if (!prev[k]) return prev; const n = { ...prev }; delete n[k]; return n; });
  };
  const cambiarModo = m => { setModo(m); setErrores({}); setErrorServidor(''); };

  const validar = () => {
    const e = {};
    if (usaPeriodo && !periodo) e.periodo = interesSaldo ? 'Elige el período a pagar.' : 'Elige la cuota a pagar.';
    if (usaCapital) {
      const c = num(form.capital);
      if (!(c > 0)) e.capital = 'Indica el capital a amortizar.';
      else if (c > saldo + 0.005) e.capital = `No puede pasar del saldo (${money(saldo)}).`;
    }
    if (!form.fecha) e.fecha = 'Indica la fecha del pago.';
    else if (f.fecha_desembolso && form.fecha < f.fecha_desembolso) e.fecha = 'No puede ser anterior al desembolso.';
    if (!cuenta) e.cuenta_bancaria_id = 'Elige la cuenta de Tesorería desde la que pagas.';
    else if (otraMoneda && !(num(form.tc_aplicado) > 0)) e.tc_aplicado = 'Indica el tipo de cambio.';
    return e;
  };
  const confirmar = async () => {
    const e = validar();
    setErrores(e);
    const primero = Object.keys(e)[0];
    if (primero) { requestAnimationFrame(() => dialogo.current?.querySelector(`#pago-${primero}`)?.focus()); return; }
    setGuardando(true); setErrorServidor('');
    try {
      await onConfirmar({
        modo, periodo, resumen: res, cuenta,
        fecha: form.fecha,
        cuenta_bancaria_id: cuenta.id,
        tc_aplicado: otraMoneda ? Number(form.tc_aplicado) : null,
        referencia: form.referencia.trim(),
        comprobante: form.comprobante.trim(),
      });
    } catch (err) {
      setErrorServidor(err?.message || 'No se pudo registrar el pago.');
      setGuardando(false);
    }
  };

  const props = (k, extra = {}) => ({
    id: `pago-${k}`, value: form[k] ?? '', onChange: ev => set(k, ev.target.value),
    'aria-invalid': errores[k] ? 'true' : undefined, 'aria-describedby': errores[k] ? `pago-${k}-error` : undefined, ...extra,
  });
  const err = k => errores[k] && <span className="dx-ui-field-error" id={`pago-${k}-error`}>{errores[k]}</span>;
  const textoPeriodo = c => interesSaldo
    ? `Interés de ${mesAnio(c.fecha)} · vence ${fecha(c.fecha)} · ${money(c.interes)}`
    : `Cuota ${c.numero} · vence ${fecha(c.fecha)} · ${money(c.total)}`;
  const tm = tasaMensualFinanciamiento(f);

  return (
    <div className="dx-ui dx-fin dx-fin-pago">
      <div className="dx-ui-overlay" onClick={guardando ? undefined : onCerrar}>
        <div className="dx-ui-dialog dx-ui-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="pago-titulo" ref={dialogo} onClick={e => e.stopPropagation()}>
          <div className="dx-ui-dialog-head">
            <div>
              <div className="dx-ui-eyebrow">Registrar pago · {f.codigo}</div>
              <h2 id="pago-titulo">{f.entidad} · saldo {money(saldo)}</h2>
            </div>
            <button type="button" className="dx-btn sm" onClick={onCerrar} disabled={guardando} aria-label="Cerrar">×</button>
          </div>

          <div className="dx-fin-pago-body">
            <fieldset className="dx-fin-modalidades">
              <legend>Qué vas a pagar <span className="dx-ui-required">*</span></legend>
              <div className="dx-fin-modalidad-grid is-3">
                {modos.map(m => {
                  const sinPeriodos = (m.value === 'interes' || m.value === 'ambos' || m.value === 'cuota') && !periodos.length;
                  return (
                    <label key={m.value} className={`dx-fin-modalidad${modo === m.value ? ' is-on' : ''}${sinPeriodos ? ' is-off' : ''}`}>
                      <input type="radio" name="pago-modo" value={m.value} checked={modo === m.value} disabled={sinPeriodos} onChange={() => cambiarModo(m.value)} />
                      <strong>{m.label}</strong>
                      <span>{m.ayuda}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="dx-ui-form-grid">
              {usaPeriodo && (
                <div className="dx-ui-field" style={{ gridColumn: usaCapital ? 'span 2' : '1 / -1' }}>
                  <label htmlFor="pago-periodo">{interesSaldo ? 'Período' : 'Cuota'}<span className="dx-ui-required"> *</span></label>
                  <select className="dx-ui-select" {...props('periodo')}>
                    {!periodos.length && <option value="">Sin pagos pendientes</option>}
                    {periodos.map(c => <option key={c.numero} value={c.numero}>{textoPeriodo(c)}</option>)}
                  </select>
                  {err('periodo') || (interesSaldo && periodo && <span className="dx-ui-field-hint">{(tm * 100).toLocaleString('es-PE', { maximumFractionDigits: 4 })} % sobre el saldo al corte {money(periodo.saldo_base ?? periodo.saldo)}</span>)}
                </div>
              )}
              {usaCapital && (
                <div className="dx-ui-field">
                  <label htmlFor="pago-capital">Capital a amortizar<span className="dx-ui-required"> *</span></label>
                  <input {...props('capital', { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })} />
                  {err('capital') || <button type="button" className="dx-fin-link" onClick={() => set('capital', String(r2(saldo)))}>Todo el saldo ({money(saldo)})</button>}
                </div>
              )}
              <div className="dx-ui-field">
                <label htmlFor="pago-fecha">Fecha del pago<span className="dx-ui-required"> *</span></label>
                <input {...props('fecha', { type: 'date' })} />
                {err('fecha')}
              </div>
              <div className="dx-ui-field" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="pago-cuenta_bancaria_id">Cuenta de Tesorería<span className="dx-ui-required"> *</span></label>
                <select className="dx-ui-select" {...props('cuenta_bancaria_id')}>
                  <option value="">Elige la cuenta</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{etiquetaCuenta(c)}</option>)}
                </select>
                {err('cuenta_bancaria_id') || (!cuentas.length && <span className="dx-ui-field-hint">No hay cuentas activas en Tesorería para esta sociedad.</span>)}
              </div>
              {otraMoneda && (
                <div className="dx-ui-field">
                  <label htmlFor="pago-tc_aplicado">Tipo de cambio · 1 {moneda} = ? {cuenta.moneda}<span className="dx-ui-required"> *</span></label>
                  <input {...props('tc_aplicado', { type: 'number', min: 0, step: '0.0001', inputMode: 'decimal' })} />
                  {err('tc_aplicado') || (num(form.tc_aplicado) > 0 && <span className="dx-ui-field-hint">Sale {formatMoney(r2(res.total * num(form.tc_aplicado)), cuenta.moneda)} de la cuenta.</span>)}
                </div>
              )}
              <div className="dx-ui-field">
                <label htmlFor="pago-referencia">N.° de operación</label>
                <input {...props('referencia', { maxLength: 80 })} />
              </div>
              <div className="dx-ui-field">
                <label htmlFor="pago-comprobante">Comprobante</label>
                <input {...props('comprobante', { maxLength: 80 })} />
              </div>
            </div>

            <div className="dx-fin-pago-resumen" aria-live="polite">
              <div><span>Interés</span><strong>{money(res.interes)}</strong></div>
              <div><span>Capital</span><strong>{money(res.capital)}</strong></div>
              <div className="is-total"><span>Total a pagar</span><strong>{money(res.total)}</strong></div>
              <div><span>Saldo después</span><strong>{money(res.saldoDespues)}</strong></div>
            </div>
            {interesSaldo && modo === 'ambos' && <p className="dx-fin-nota dx-fin-small">El interés del período se calcula antes del abono: el capital que pagas hoy baja el interés de los meses siguientes.</p>}
            <p className="dx-fin-nota dx-fin-small">Se registra el egreso en Tesorería{res.interes > 0 ? ' y el gasto financiero de intereses' : ''}.</p>
          </div>

          <div className="dx-ui-dialog-foot">
            {errorServidor && <div className="dx-fin-barra-error" role="alert">{errorServidor}</div>}
            <button type="button" className="dx-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
            <button type="button" className="dx-btn primary" onClick={confirmar} disabled={guardando}>{guardando ? 'Registrando…' : res.total > 0 ? `Registrar pago de ${money(res.total)}` : 'Registrar pago'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

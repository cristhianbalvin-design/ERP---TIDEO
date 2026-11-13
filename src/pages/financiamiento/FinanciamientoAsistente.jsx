import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '../../lib/currency.js';
import { resolverSociedadUnicaId } from '../../services/sociedadesService.js';
import {
  MODALIDADES_FINANCIAMIENTO,
  construirEdicionFinanciamiento,
  cuentasParaFinanciamiento,
  fechaPeriodo,
  generarAmortizacion,
  tasaMensualDe,
  tcSugerido,
  teaEquivalente,
} from '../../services/financiamientosService.js';
import './financiamiento.css';

const TIPOS_ACREEDOR = [
  { value: 'bancario', label: 'Banco' },
  { value: 'tercero', label: 'Persona o tercero' },
  { value: 'leasing', label: 'Leasing' },
  { value: 'linea_credito', label: 'Línea de crédito' },
  { value: 'otro', label: 'Otro' },
];
const PASOS = [
  { id: 'acreedor', titulo: 'Acreedor', ayuda: 'Quién presta' },
  { id: 'condiciones', titulo: 'Condiciones', ayuda: 'Monto, tasa y modalidad' },
  { id: 'desembolso', titulo: 'Desembolso', ayuda: 'Cuenta de Tesorería' },
  { id: 'revision', titulo: 'Revisión', ayuda: 'Confirmar y guardar' },
];
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const fecha = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : 'Sin dato');
const num = v => (v === '' || v === null || v === undefined ? NaN : Number(v));
const pct = (n, d = 2) => `${(Number(n || 0) * 100).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const etiquetaCuenta = c => `${c.nombre?.trim() || 'Cuenta'} · ${c.banco?.trim() || 'Sin banco'} (${c.moneda || 'PEN'})`;

export function formularioDesdeFinanciamiento(f) {
  return {
    tipo: f.tipo || 'bancario',
    entidad: f.entidad || '',
    contacto_nombre: f.contacto_nombre || '',
    contacto_telefono: f.contacto_telefono || '',
    sociedad_id: f.sociedad_id || '',
    proposito: f.proposito || '',
    tipo_cuota: f.tipo_cuota || 'frances',
    moneda: f.moneda || 'PEN',
    monto_original: f.monto_original ?? '',
    fecha_desembolso: f.fecha_desembolso || '',
    tasa_anual: f.tasa_anual ?? '',
    tipo_tasa: f.tipo_cuota === 'interes_saldo' ? 'TEM' : (f.tipo_tasa || 'TEA'),
    plazo_meses: f.plazo_meses ?? 12,
    meses_gracia: f.meses_gracia ?? 0,
    dia_pago: f.dia_pago ?? '',
    cuenta_bancaria_id: f.cuenta_bancaria_id || '',
    registrar_ingreso: false,
    tc_aplicado: '',
    referencia: '',
    notas: f.notas || '',
  };
}

export const FORMULARIO_NUEVO = () => ({
  tipo: 'bancario', entidad: '', contacto_nombre: '', contacto_telefono: '', sociedad_id: '', proposito: '',
  tipo_cuota: 'frances', moneda: 'PEN', monto_original: '', fecha_desembolso: hoyLima(), tasa_anual: '', tipo_tasa: 'TEA',
  plazo_meses: 12, meses_gracia: 0, dia_pago: Number(hoyLima().slice(8, 10)), cuenta_bancaria_id: '', registrar_ingreso: true,
  tc_aplicado: '', referencia: '', notas: '',
});

// Errores por campo de cada paso (todos a la vez). Devuelve { campo: mensaje }.
export function validarPaso(paso, form, { multisociedad = false, edicion = null, cuentas = [] } = {}) {
  const e = {};
  const interesSaldo = form.tipo_cuota === 'interes_saldo';
  if (paso === 'acreedor') {
    if (!String(form.entidad || '').trim()) e.entidad = 'Indica quién presta el dinero.';
    if (multisociedad && !form.sociedad_id) e.sociedad_id = 'Elige la sociedad que recibe el préstamo.';
  }
  if (paso === 'condiciones') {
    const monto = num(form.monto_original);
    if (!(monto > 0)) e.monto_original = 'El monto debe ser mayor a cero.';
    if (!form.fecha_desembolso) e.fecha_desembolso = 'Indica la fecha del desembolso.';
    const tasa = num(form.tasa_anual);
    if (!(tasa >= 0)) e.tasa_anual = 'Indica la tasa (0 si no cobra intereses).';
    else if (interesSaldo && tasa > 100) e.tasa_anual = 'La tasa mensual no puede pasar de 100 %.';
    const dia = num(form.dia_pago);
    if (!(Number.isInteger(dia) && dia >= 1 && dia <= 31)) e.dia_pago = 'Elige un día entre 1 y 31.';
    if (!interesSaldo) {
      const plazo = num(form.plazo_meses);
      if (!(Number.isInteger(plazo) && plazo >= 1 && plazo <= 600)) e.plazo_meses = 'El plazo va de 1 a 600 meses.';
      const gracia = num(form.meses_gracia);
      if (!(Number.isInteger(gracia) && gracia >= 0)) e.meses_gracia = 'Indica 0 o más meses.';
      else if (Number.isInteger(plazo) && gracia >= plazo) e.meses_gracia = 'La gracia debe ser menor que el plazo.';
    }
  }
  if (paso === 'desembolso' && !edicion && form.registrar_ingreso) {
    const cuenta = cuentas.find(c => c.id === form.cuenta_bancaria_id);
    if (!cuenta) e.cuenta_bancaria_id = 'Elige la cuenta donde entró el dinero o desmarca el registro del ingreso.';
    else if ((cuenta.moneda || 'PEN') !== form.moneda && !(num(form.tc_aplicado) > 0)) e.tc_aplicado = 'Indica el tipo de cambio.';
  }
  return e;
}

function Campo({ id, label, requerido, error, hint, children, ancho }) {
  return (
    <div className="dx-ui-field" style={ancho ? { gridColumn: ancho } : undefined}>
      <label htmlFor={id}>{label}{requerido && <span className="dx-ui-required"> *</span>}</label>
      {children}
      {error ? <span className="dx-ui-field-error" id={`${id}-error`}>{error}</span> : hint ? <span className="dx-ui-field-hint">{hint}</span> : null}
    </div>
  );
}

export default function FinanciamientoAsistente({
  edicion = null,
  empresa,
  sociedadesDisponibles = [],
  sociedadInicial = '',
  cuentasBancarias = [],
  tcUsdPorPen = null,
  onCancelar,
  onGuardar,
}) {
  const multisociedad = Boolean(empresa?.multisociedad_habilitado);
  const sociedadUnica = multisociedad ? resolverSociedadUnicaId(sociedadesDisponibles) : null;
  const inicial = useMemo(() => {
    const base = edicion ? formularioDesdeFinanciamiento(edicion) : FORMULARIO_NUEVO();
    if (!edicion && multisociedad) base.sociedad_id = sociedadUnica || sociedadInicial || '';
    return base;
  }, [edicion]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(inicial);
  const [paso, setPaso] = useState(0);
  const [completos, setCompletos] = useState(() => new Set(edicion ? [0, 1, 2, 3] : []));
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const cuerpo = useRef(null);

  // En móvil se oculta el botón flotante de Aria mientras el asistente está abierto (taparía la barra).
  useEffect(() => {
    document.documentElement.dataset.dxFinAsistente = 'true';
    return () => { delete document.documentElement.dataset.dxFinAsistente; };
  }, []);

  const hayCambios = JSON.stringify(form) !== JSON.stringify(inicial);
  useEffect(() => {
    if (!hayCambios) return undefined;
    const aviso = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [hayCambios]);

  const interesSaldo = form.tipo_cuota === 'interes_saldo';
  const moneda = form.moneda || 'PEN';
  const money = v => formatMoney(v, moneda);
  const cuentas = cuentasParaFinanciamiento(cuentasBancarias, { empresaId: empresa?.id, sociedadId: multisociedad ? form.sociedad_id : null });
  const cuenta = cuentas.find(c => c.id === form.cuenta_bancaria_id) || null;
  const otraMoneda = Boolean(cuenta && (cuenta.moneda || 'PEN') !== moneda);
  const conPagos = Boolean(edicion && ((edicion.pagos_realizados || []).length || (edicion.tabla_amortizacion || []).some(c => c.estado === 'pagada')));
  const ctx = { multisociedad: multisociedad && !sociedadUnica, edicion, cuentas };

  const set = (k, v) => {
    setErrorServidor('');
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'tipo_cuota') next.tipo_tasa = v === 'interes_saldo' ? 'TEM' : (prev.tipo_tasa === 'TEM' && prev.tipo_cuota === 'interes_saldo' ? 'TEA' : prev.tipo_tasa);
      if (k === 'fecha_desembolso' && v && !edicion && String(prev.dia_pago) === String(Number(String(prev.fecha_desembolso).slice(8, 10)))) next.dia_pago = Number(v.slice(8, 10));
      if (k === 'cuenta_bancaria_id' || k === 'moneda') {
        const c = cuentas.find(x => x.id === (k === 'cuenta_bancaria_id' ? v : next.cuenta_bancaria_id));
        const sug = c ? tcSugerido(next.moneda, c.moneda, tcUsdPorPen) : null;
        next.tc_aplicado = sug ?? '';
      }
      if (k === 'sociedad_id' && prev.cuenta_bancaria_id) {
        const c = cuentasBancarias.find(x => x.id === prev.cuenta_bancaria_id);
        if (c?.sociedad_id && c.sociedad_id !== v) { next.cuenta_bancaria_id = ''; next.tc_aplicado = ''; }
      }
      return next;
    });
    setErrores(prev => { if (!prev[k]) return prev; const n = { ...prev }; delete n[k]; return n; });
  };

  // Vista previa (aside y revisión)
  const montoN = num(form.monto_original) > 0 ? num(form.monto_original) : 0;
  const calculoEdicion = edicion ? construirEdicionFinanciamiento(edicion, form) : null;
  const tablaNueva = !edicion && !interesSaldo && montoN && num(form.plazo_meses) >= 1
    ? generarAmortizacion({ monto: montoN, tasaAnual: form.tasa_anual, plazoMeses: form.plazo_meses, mesesGracia: form.meses_gracia, fechaDesembolso: form.fecha_desembolso, diaPago: form.dia_pago, tipoCuota: form.tipo_cuota, tipoTasa: form.tipo_tasa })
    : [];
  const tablaPorPagar = edicion && !interesSaldo
    ? (calculoEdicion?.tabla || []).filter(c => c.estado !== 'pagada' && c.estado !== 'cancelada')
    : tablaNueva;
  const saldoBase = edicion ? (calculoEdicion?.nuevoSaldo ?? montoN) : montoN;
  const tm = tasaMensualDe(form.tasa_anual, interesSaldo ? 'TEM' : form.tipo_tasa);
  const primerCorte = form.fecha_desembolso && form.dia_pago ? fechaPeriodo(form.fecha_desembolso, form.dia_pago, 1) : null;
  const resumen = interesSaldo
    ? [
        ['Saldo de capital', money(saldoBase)],
        ['Interés mensual', money(Math.round(saldoBase * tm * 100) / 100)],
        ['Tasa', `${pct(tm)} mensual · TEA ${pct(teaEquivalente(tm))}`],
        [edicion ? 'Día de corte' : 'Primer corte', edicion ? `Día ${form.dia_pago || 'Sin dato'} de cada mes` : fecha(primerCorte)],
        ['Plazo', 'Sin plazo: amortizas cuando puedas'],
      ]
    : [
        ...(edicion ? [['Capital ya pagado', money(calculoEdicion?.capitalPagado || 0)], ['Saldo por pagar', money(saldoBase)]] : [['Monto', money(montoN)]]),
        [edicion ? 'Próxima cuota' : 'Primera cuota', tablaPorPagar[0] ? `${money(tablaPorPagar[0].total)} · ${fecha(tablaPorPagar[0].fecha)}` : 'Sin dato'],
        ['Cuotas por pagar', tablaPorPagar.length ? plural(tablaPorPagar.length, 'cuota', 'cuotas') : 'Sin dato'],
        ['Total intereses', money(tablaPorPagar.reduce((s, c) => s + Number(c.interes || 0), 0))],
        ['Último pago', fecha(tablaPorPagar[tablaPorPagar.length - 1]?.fecha)],
      ];
  const totalPagar = interesSaldo ? null : tablaPorPagar.reduce((s, c) => s + Number(c.total || 0), 0);

  const enfocarPrimerError = errs => {
    const primero = Object.keys(errs)[0];
    if (!primero) return;
    requestAnimationFrame(() => cuerpo.current?.querySelector(`#fin-${primero}`)?.focus());
  };
  const validar = i => {
    const errs = validarPaso(PASOS[i].id, form, ctx);
    setErrores(errs);
    enfocarPrimerError(errs);
    return !Object.keys(errs).length;
  };
  const irA = i => {
    if (i === paso) return;
    if (i < paso || completos.has(i)) {
      if (i > paso && !validar(paso)) return;
      setPaso(i); setErrores({});
    }
  };
  const siguiente = () => {
    if (!validar(paso)) return;
    setCompletos(prev => new Set([...prev, paso]));
    setPaso(p => Math.min(PASOS.length - 1, p + 1));
    cuerpo.current?.scrollIntoView?.({ block: 'start' });
  };
  const guardar = async () => {
    for (let i = 0; i < PASOS.length - 1; i += 1) {
      const errs = validarPaso(PASOS[i].id, form, ctx);
      if (Object.keys(errs).length) { setPaso(i); setErrores(errs); enfocarPrimerError(errs); return; }
    }
    if (calculoEdicion?.error) { setErrorServidor(calculoEdicion.error); return; }
    setGuardando(true); setErrorServidor('');
    try {
      await onGuardar({ ...form, cuenta, sociedad_id: multisociedad ? (form.sociedad_id || sociedadUnica || '') : '' });
    } catch (err) {
      setErrorServidor(err?.message || 'No se pudo guardar el préstamo.');
      setGuardando(false);
    }
  };
  const cancelar = () => (hayCambios ? setConfirmarSalida(true) : onCancelar());

  const inputProps = (k, extra = {}) => ({
    id: `fin-${k}`, value: form[k] ?? '', onChange: e => set(k, e.target.value),
    'aria-invalid': errores[k] ? 'true' : undefined, 'aria-describedby': errores[k] ? `fin-${k}-error` : undefined, ...extra,
  });
  const ultimo = paso === PASOS.length - 1;

  return (
    <section className="dx-ui dx-fin dx-fin-asis">
      <button type="button" className="dx-fin-volver" onClick={cancelar}>‹ {edicion ? `${edicion.codigo} · ${edicion.entidad}` : 'Financiamiento y Deuda'}</button>
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">{edicion ? `Editar préstamo · ${edicion.codigo}` : 'Nuevo préstamo'}</div>
          <h1 className="dx-ui-title">{form.entidad?.trim() || (edicion ? edicion.entidad : 'Registrar un préstamo')}</h1>
          <p className="dx-ui-sub">Los campos con <span className="dx-ui-required">*</span> son obligatorios.</p>
        </div>
      </header>

      <div className="dx-fin-wrap">
        <div className="dx-fin-layout">
          <div className="dx-ui-card">
            <nav className="dx-fin-steps" aria-label="Pasos del registro">
              {PASOS.map((p, i) => {
                const alcanzable = i < paso || completos.has(i);
                const estado = i === paso ? 'is-current' : completos.has(i) ? 'is-done' : '';
                return (
                  <button key={p.id} type="button" className={`dx-fin-step ${estado}`} aria-current={i === paso ? 'step' : undefined}
                    disabled={!alcanzable && i !== paso} onClick={() => irA(i)}>
                    <span className="dx-fin-step-n" aria-hidden="true">{completos.has(i) && i !== paso ? '✓' : i + 1}</span>
                    <span className="dx-fin-step-txt"><strong>{p.titulo}</strong><small>{p.ayuda}</small></span>
                  </button>
                );
              })}
            </nav>

            <div className="dx-fin-asis-body" ref={cuerpo}>
              {paso === 0 && (
                <div className="dx-ui-form-grid">
                  <Campo id="fin-tipo" label="Tipo de acreedor" requerido>
                    <select className="dx-ui-select" {...inputProps('tipo')}>
                      {TIPOS_ACREEDOR.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Campo>
                  <Campo id="fin-entidad" label={form.tipo === 'tercero' ? 'Nombre de quien presta' : 'Acreedor'} requerido error={errores.entidad} ancho="span 2">
                    <input {...inputProps('entidad', { maxLength: 160, placeholder: form.tipo === 'tercero' ? 'Ej. Alex Ricalde' : 'Ej. BBVA' })} />
                  </Campo>
                  <Campo id="fin-contacto_nombre" label="Contacto">
                    <input {...inputProps('contacto_nombre', { maxLength: 120 })} />
                  </Campo>
                  <Campo id="fin-contacto_telefono" label="Teléfono">
                    <input {...inputProps('contacto_telefono', { maxLength: 40, inputMode: 'tel' })} />
                  </Campo>
                  {multisociedad && !sociedadUnica ? (
                    <Campo id="fin-sociedad_id" label="Sociedad" requerido error={errores.sociedad_id}>
                      <select className="dx-ui-select" {...inputProps('sociedad_id')}>
                        <option value="">Elige la sociedad</option>
                        {sociedadesDisponibles.map(s => <option key={s.id} value={s.id}>{s.codigo ? `${s.codigo} · ` : ''}{s.nombre}</option>)}
                      </select>
                    </Campo>
                  ) : <div />}
                  <Campo id="fin-proposito" label="Para qué es el préstamo" ancho="1 / -1">
                    <input {...inputProps('proposito', { maxLength: 240, placeholder: 'Ej. Capital de trabajo, compra de equipo' })} />
                  </Campo>
                </div>
              )}

              {paso === 1 && (
                <>
                  <fieldset className="dx-fin-modalidades">
                    <legend>Modalidad de pago <span className="dx-ui-required">*</span></legend>
                    {conPagos && <p className="dx-fin-aviso">Este préstamo ya tiene pagos: no se puede cambiar entre interés sobre saldo y cuotas, ni la moneda. Las cuotas pagadas no cambian; las pendientes se recalculan sobre el saldo que queda.</p>}
                    <div className="dx-fin-modalidad-grid">
                      {MODALIDADES_FINANCIAMIENTO.map(m => {
                        const bloqueada = conPagos && ((m.value === 'interes_saldo') !== (edicion.tipo_cuota === 'interes_saldo'));
                        return (
                          <label key={m.value} className={`dx-fin-modalidad${form.tipo_cuota === m.value ? ' is-on' : ''}${bloqueada ? ' is-off' : ''}`}>
                            <input type="radio" name="fin-modalidad" value={m.value} checked={form.tipo_cuota === m.value} disabled={bloqueada} onChange={() => set('tipo_cuota', m.value)} />
                            <strong>{m.label}</strong>
                            <span>{m.ayuda}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  <div className="dx-ui-form-grid">
                    <Campo id="fin-moneda" label="Moneda" requerido={!conPagos} hint={conPagos ? 'No se puede cambiar: tiene pagos.' : undefined}>
                      {conPagos ? <span className="dx-fin-solo-lectura">{moneda === 'USD' ? 'Dólares (USD)' : 'Soles (PEN)'}</span> : (
                        <select className="dx-ui-select" {...inputProps('moneda')}>
                          <option value="PEN">Soles (PEN)</option>
                          <option value="USD">Dólares (USD)</option>
                        </select>
                      )}
                    </Campo>
                    <Campo id="fin-monto_original" label="Monto recibido" requerido error={errores.monto_original}>
                      <input {...inputProps('monto_original', { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })} />
                    </Campo>
                    <Campo id="fin-fecha_desembolso" label="Fecha del desembolso" requerido error={errores.fecha_desembolso}>
                      <input {...inputProps('fecha_desembolso', { type: 'date' })} />
                    </Campo>
                    {interesSaldo ? (
                      <Campo id="fin-tasa_anual" label="Tasa mensual (%)" requerido error={errores.tasa_anual}
                        hint={num(form.tasa_anual) >= 0 ? `Cada mes: ${pct(tm)} del capital que se debe · TEA ${pct(teaEquivalente(tm))}` : undefined}>
                        <input {...inputProps('tasa_anual', { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })} />
                      </Campo>
                    ) : (
                      <>
                        <Campo id="fin-tasa_anual" label="Tasa (%)" requerido error={errores.tasa_anual}
                          hint={num(form.tasa_anual) >= 0 ? `Equivale a ${pct(tm, 3)} mensual` : undefined}>
                          <input {...inputProps('tasa_anual', { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })} />
                        </Campo>
                        <Campo id="fin-tipo_tasa" label="Tipo de tasa" requerido>
                          <select className="dx-ui-select" {...inputProps('tipo_tasa')}>
                            <option value="TEA">TEA · efectiva anual</option>
                            <option value="TNA">TNA · nominal anual</option>
                            <option value="TEM">TEM · efectiva mensual</option>
                          </select>
                        </Campo>
                      </>
                    )}
                    <Campo id="fin-dia_pago" label={interesSaldo ? 'Día de corte' : 'Día de pago'} requerido error={errores.dia_pago}
                      hint={interesSaldo ? 'El interés de cada mes se calcula sobre el saldo a ese día.' : 'Si el mes es más corto, vence el último día.'}>
                      <input {...inputProps('dia_pago', { type: 'number', min: 1, max: 31, step: 1, inputMode: 'numeric' })} />
                    </Campo>
                    {!interesSaldo && (
                      <>
                        <Campo id="fin-plazo_meses" label="Plazo (meses)" requerido error={errores.plazo_meses}>
                          <input {...inputProps('plazo_meses', { type: 'number', min: 1, max: 600, step: 1, inputMode: 'numeric' })} />
                        </Campo>
                        <Campo id="fin-meses_gracia" label="Meses de gracia" error={errores.meses_gracia} hint="Meses en que solo se pagan intereses.">
                          <input {...inputProps('meses_gracia', { type: 'number', min: 0, step: 1, inputMode: 'numeric' })} />
                        </Campo>
                      </>
                    )}
                  </div>
                </>
              )}

              {paso === 2 && (
                <div className="dx-ui-form-grid is-2">
                  <Campo id="fin-cuenta_bancaria_id" label={edicion ? 'Cuenta de Tesorería del préstamo' : 'Cuenta donde entró el dinero'}
                    requerido={!edicion && form.registrar_ingreso} error={errores.cuenta_bancaria_id} ancho="1 / -1"
                    hint={cuentas.length ? (edicion ? 'Solo referencia: cambiarla no mueve el ingreso ya registrado.' : undefined) : 'No hay cuentas activas en Tesorería para esta sociedad. Créalas en Tesorería › Cuentas.'}>
                    <select className="dx-ui-select" {...inputProps('cuenta_bancaria_id')}>
                      <option value="">{edicion ? 'Sin cuenta' : 'Elige la cuenta'}</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{etiquetaCuenta(c)}</option>)}
                    </select>
                  </Campo>
                  {!edicion && (
                    <label className="dx-fin-check" style={{ gridColumn: '1 / -1' }}>
                      <input type="checkbox" checked={Boolean(form.registrar_ingreso)} onChange={e => set('registrar_ingreso', e.target.checked)} />
                      <span><strong>Registrar el ingreso del desembolso en Tesorería</strong><small>Suma {money(montoN)} al saldo de la cuenta el {fecha(form.fecha_desembolso)}. Desmárcalo si el dinero no pasó por una cuenta de la empresa o si el ingreso ya está registrado.</small></span>
                    </label>
                  )}
                  {!edicion && form.registrar_ingreso && otraMoneda && (
                    <Campo id="fin-tc_aplicado" label={`Tipo de cambio · 1 ${moneda} = ? ${cuenta.moneda}`} requerido error={errores.tc_aplicado}
                      hint={num(form.tc_aplicado) > 0 ? `Entran ${formatMoney(Math.round(montoN * num(form.tc_aplicado) * 100) / 100, cuenta.moneda)} a la cuenta.` : undefined}>
                      <input {...inputProps('tc_aplicado', { type: 'number', min: 0, step: '0.0001', inputMode: 'decimal' })} />
                    </Campo>
                  )}
                  {!edicion && form.registrar_ingreso && (
                    <Campo id="fin-referencia" label="N.° de operación">
                      <input {...inputProps('referencia', { maxLength: 80 })} />
                    </Campo>
                  )}
                  <Campo id="fin-notas" label="Notas" ancho="1 / -1">
                    <input {...inputProps('notas', { maxLength: 500 })} />
                  </Campo>
                </div>
              )}

              {paso === 3 && (
                <div className="dx-fin-revision">
                  <dl className="dx-fin-dl">
                    <dt>Acreedor</dt><dd>{form.entidad || 'Sin dato'} · {TIPOS_ACREEDOR.find(t => t.value === form.tipo)?.label}</dd>
                    {multisociedad && <><dt>Sociedad</dt><dd>{sociedadesDisponibles.find(s => s.id === (form.sociedad_id || sociedadUnica))?.nombre || 'Sin dato'}</dd></>}
                    <dt>Modalidad</dt><dd>{MODALIDADES_FINANCIAMIENTO.find(m => m.value === form.tipo_cuota)?.label}</dd>
                    <dt>Monto</dt><dd>{money(montoN)} · desembolsado {fecha(form.fecha_desembolso)}</dd>
                    <dt>Tasa</dt><dd>{interesSaldo ? `${pct(tm)} mensual` : `${form.tasa_anual}% ${form.tipo_tasa}`}</dd>
                    {!interesSaldo && <><dt>Plazo</dt><dd>{plural(Number(form.plazo_meses), 'mes', 'meses')}{Number(form.meses_gracia) > 0 ? ` · ${form.meses_gracia} de gracia` : ''}</dd></>}
                    <dt>Cuenta</dt><dd>{cuenta ? etiquetaCuenta(cuenta) : 'Sin cuenta'}</dd>
                    {!edicion && <><dt>Ingreso en Tesorería</dt><dd>{form.registrar_ingreso ? (otraMoneda ? `Sí · TC ${form.tc_aplicado}` : 'Sí') : 'No'}</dd></>}
                  </dl>
                  {interesSaldo ? (
                    <p className="dx-fin-nota">Cada mes, el día {form.dia_pago}, se genera el interés del período: {pct(tm)} del saldo de capital a esa fecha. Si amortizas capital antes del corte, el interés de ese mes baja. Un interés no pagado queda vencido aparte; no se suma al capital.</p>
                  ) : tablaPorPagar.length > 0 && (
                    <div className="dx-fin-tbl-wrap">
                      <table className="dx-fin-tbl">
                        <thead><tr><th>N.°</th><th>Vence</th><th className="dx-fin-num">Capital</th><th className="dx-fin-num">Interés</th><th className="dx-fin-num">Cuota</th><th className="dx-fin-num">Saldo</th></tr></thead>
                        <tbody>
                          {tablaPorPagar.slice(0, 6).map(c => (
                            <tr key={c.numero}>
                              <td className="dx-fin-c-num" data-label="N.°">Cuota {c.numero}</td>
                              <td data-label="Vence">{fecha(c.fecha)}</td>
                              <td className="dx-fin-num" data-label="Capital">{money(c.capital)}</td>
                              <td className="dx-fin-num" data-label="Interés">{money(c.interes)}</td>
                              <td className="dx-fin-num" data-label="Cuota">{money(c.total)}</td>
                              <td className="dx-fin-num" data-label="Saldo">{money(c.saldo)}</td>
                            </tr>
                          ))}
                          {tablaPorPagar.length > 6 && <tr className="dx-fin-plegadas"><td colSpan={6}>y {plural(tablaPorPagar.length - 6, 'cuota más', 'cuotas más')} hasta {fecha(tablaPorPagar[tablaPorPagar.length - 1].fecha)}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="dx-ui-card dx-fin-aside" aria-label="Resumen del préstamo">
            <h3>Resumen</h3>
            {calculoEdicion?.error ? (
              <p className="dx-fin-nota dx-ui-field-error" role="status">{calculoEdicion.error}</p>
            ) : (
              <>
                <dl className="dx-fin-dl">
                  {resumen.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
                </dl>
                {totalPagar != null && (
                  <div className="dx-fin-total"><span>Total por pagar</span><strong>{money(totalPagar)}</strong></div>
                )}
              </>
            )}
          </aside>
        </div>
      </div>

      <div className="dx-fin-barra">
        {errorServidor && <div className="dx-fin-barra-error" role="alert">{errorServidor}</div>}
        <button type="button" className="dx-btn" onClick={cancelar} disabled={guardando}>Cancelar</button>
        <span className="dx-fin-barra-sep" />
        {paso > 0 && <button type="button" className="dx-btn" onClick={() => { setPaso(p => p - 1); setErrores({}); }} disabled={guardando}>Atrás</button>}
        {ultimo
          ? <button type="button" className="dx-btn primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : edicion ? 'Guardar cambios' : 'Registrar préstamo'}</button>
          : <button type="button" className="dx-btn primary" onClick={siguiente}>Siguiente</button>}
      </div>

      {confirmarSalida && (
        <div className="dx-ui-overlay" onClick={() => setConfirmarSalida(false)}>
          <div className="dx-ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby="fin-salir-t" onClick={e => e.stopPropagation()}>
            <div className="dx-ui-dialog-head"><div><h2 id="fin-salir-t">¿Descartar los cambios?</h2><p>Lo que escribiste en este préstamo no se guardará.</p></div></div>
            <div className="dx-ui-dialog-foot">
              <button type="button" className="dx-btn" onClick={() => setConfirmarSalida(false)} autoFocus>Seguir editando</button>
              <button type="button" className="dx-btn danger" onClick={onCancelar}>Descartar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

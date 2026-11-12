import React, { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../lib/currency.js';
import { estadoFinanciamiento, nextCuota, tasaMensualFinanciamiento, teaEquivalente } from '../../services/financiamientosService.js';
import { cargarAdjuntos, eliminarAdjunto, formatoTamano, obtenerUrlAdjunto, subirAdjunto, validarArchivo } from '../../services/storageService.js';
import { modalidadTexto } from './FinanciamientoListado.jsx';
import './financiamiento.css';

const TIPO_ACREEDOR = { bancario: 'Banco', tercero: 'Persona o tercero', leasing: 'Leasing', linea_credito: 'Línea de crédito', otro: 'Otro' };
const fecha = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : 'Sin dato');
const mesAnio = s => (s ? new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(s).slice(0, 10)}T12:00:00Z`)) : '');
const dias = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const pct = n => `${(Number(n || 0) * 100).toLocaleString('es-PE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
const impaga = c => c.estado !== 'pagada' && c.estado !== 'cancelada';
const activar = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

function estadoCuota(c, hoy) {
  if (c.estado === 'pagada') return { tone: 'green', text: 'Pagada' };
  if (c.estado === 'cancelada') return { tone: 'gray', text: 'Cancelada' };
  if (c.fecha && c.fecha < hoy) return { tone: 'red', text: `Vencida · ${plural(dias(c.fecha, hoy), 'día', 'días')}` };
  if (c.estado === 'pendiente') return { tone: 'amber', text: 'Por pagar' };
  return { tone: 'gray', text: 'Futura' };
}

// Línea de tiempo: lo que falta pagar (vencido y lo próximo) y, debajo, lo pagado y el desembolso.
function construirMovimientos(f, hoy) {
  const moneda = f.moneda || 'PEN';
  const interesSaldo = f.tipo_cuota === 'interes_saldo';
  const tabla = f.tabla_amortizacion || [];
  const porNumero = new Map(tabla.map(c => [Number(c.numero), c]));
  const pendientes = tabla.filter(impaga).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const proxima = pendientes.find(c => c.fecha >= hoy);
  const porPagar = pendientes.filter(c => c.fecha < hoy || c === proxima).map(c => {
    const e = c === proxima ? { tone: 'amber', text: 'Por pagar' } : estadoCuota(c, hoy);
    return {
      key: `p_${c.numero}`, fecha: c.fecha, estado: e.tone === 'red' ? 'vencido' : 'pendiente',
      titulo: interesSaldo ? `Interés de ${mesAnio(c.fecha)}` : `Cuota ${c.numero}`,
      detalle: interesSaldo
        ? `Vence ${fecha(c.fecha)} · ${pct(tasaMensualFinanciamiento(f))} sobre el saldo al corte ${formatMoney(c.saldo_base ?? c.saldo, moneda)}`
        : `Vence ${fecha(c.fecha)} · capital ${formatMoney(c.capital, moneda)} · interés ${formatMoney(c.interes, moneda)}`,
      monto: c.total, pill: e,
    };
  });
  const pagos = [...(f.pagos_realizados || [])].sort((a, b) => String(b.fecha_pago).localeCompare(String(a.fecha_pago)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const pagados = pagos.map(p => {
    const cuenta = p.cuenta_bancaria ? ` · ${p.cuenta_bancaria}` : '';
    const ref = p.referencia ? ` · Op. ${p.referencia}` : '';
    if (p.tipo === 'cuota') {
      const c = porNumero.get(Number(p.cuota_numero));
      const soloInteres = Number(p.capital || 0) === 0 && Number(p.interes || 0) > 0;
      return {
        key: p.id, fecha: p.fecha_pago, estado: 'hecho',
        titulo: interesSaldo || soloInteres ? `Interés de ${mesAnio(c?.fecha || p.fecha_pago)}` : `Cuota ${p.cuota_numero || ''} pagada`,
        detalle: `${fecha(p.fecha_pago)}${cuenta}${ref}${soloInteres ? ' · gasto financiero registrado' : ` · capital ${formatMoney(p.capital, moneda)} · interés ${formatMoney(p.interes, moneda)}`}`,
        monto: p.total, nota: 'Pagado',
      };
    }
    const antes = Number(p.saldo_despues || 0) + Number(p.capital || 0);
    return {
      key: p.id, fecha: p.fecha_pago, estado: 'hecho',
      titulo: p.tipo === 'capital_total' ? 'Cancelación del capital' : 'Amortización de capital',
      detalle: `${fecha(p.fecha_pago)}${cuenta}${ref}`,
      monto: p.capital, nota: `Saldo ${formatMoney(antes, moneda)} → ${formatMoney(p.saldo_despues, moneda)}`,
    };
  });
  const desembolso = f.fecha_desembolso ? [{
    key: 'desembolso', fecha: f.fecha_desembolso, estado: 'hecho', titulo: 'Desembolso recibido',
    detalle: `${fecha(f.fecha_desembolso)}${f.cuenta_bancaria_destino ? ` · ${f.cuenta_bancaria_destino}` : ''}`,
    monto: f.monto_original,
  }] : [];
  return [...porPagar.reverse(), ...pagados, ...desembolso];
}

function Documentos({ financiamiento, empresaId, puedeEditar, onCantidad }) {
  const [docs, setDocs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef(null);
  const recargar = async () => {
    setCargando(true);
    try {
      const filas = await cargarAdjuntos({ empresaId, entidadTipo: 'financiamientos', entidadId: financiamiento.id });
      setDocs(filas); onCantidad?.(filas.length); setError('');
    } catch (e) { setError(e?.message || 'No se pudieron cargar los documentos.'); }
    finally { setCargando(false); }
  };
  useEffect(() => { recargar(); }, [financiamiento.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const subir = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const v = validarArchivo(file);
    if (!v.ok) { setError(v.error); return; }
    setSubiendo(true); setError('');
    try {
      await subirAdjunto({ empresaId, entidadTipo: 'financiamientos', entidadId: financiamiento.id, file, categoria: 'documento' });
      await recargar();
    } catch (err) { setError(err?.message || 'No se pudo subir el archivo.'); }
    finally { setSubiendo(false); }
  };
  const abrir = async doc => {
    try { const url = await obtenerUrlAdjunto(doc, 600, { download: true }); if (url) window.open(url, '_blank', 'noopener'); }
    catch (err) { setError(err?.message || 'No se pudo abrir el archivo.'); }
  };
  const borrar = async doc => {
    try { await eliminarAdjunto(doc); await recargar(); }
    catch (err) { setError(err?.message || 'No se pudo eliminar el archivo.'); }
  };

  return (
    <div className="dx-fin-docs">
      <div className="dx-fin-docs-bar">
        <span className="dx-fin-small">Contrato, cronograma del banco, vouchers u otros respaldos · PDF, imagen, Word, Excel o ZIP hasta 20 MB</span>
        <input ref={input} type="file" hidden onChange={subir} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip" />
        <button type="button" className="dx-btn" disabled={!puedeEditar || subiendo} title={puedeEditar ? undefined : 'No tienes permiso para editar financiamientos'} onClick={() => input.current?.click()}>
          {subiendo ? 'Subiendo…' : '+ Adjuntar'}
        </button>
      </div>
      {error && <div className="dx-fin-error" role="alert">{error}</div>}
      {cargando ? <div className="dx-ui-empty">Cargando documentos…</div> : !docs.length ? (
        <div className="dx-ui-empty">Aún no hay documentos para este préstamo.</div>
      ) : docs.map(d => (
        <div key={d.id} className="dx-fin-doc">
          <span className="dx-ui-icon is-cyan" aria-hidden="true">{String(d.nombre_original || '').split('.').pop()?.slice(0, 4).toUpperCase() || 'DOC'}</span>
          <div className="dx-fin-doc-txt">
            <strong title={d.nombre_original}>{d.nombre_original}</strong>
            <span className="dx-fin-small">{formatoTamano(d.tamano_bytes)} · subido {fecha(d.subido_en)}</span>
          </div>
          <button type="button" className="dx-btn sm" onClick={() => abrir(d)} aria-label={`Descargar ${d.nombre_original}`}>Descargar</button>
          {puedeEditar && <button type="button" className="dx-btn sm danger" onClick={() => borrar(d)} aria-label={`Eliminar ${d.nombre_original}`}>Eliminar</button>}
        </div>
      ))}
    </div>
  );
}

export default function FinanciamientoDetalle({
  financiamiento: f,
  empresaId,
  puedeEditar = false,
  puedeEliminar = false,
  onVolver,
  onEditar,
  onEliminar,
  onPagar,
}) {
  const [tab, setTab] = useState('movimientos');
  const [nDocs, setNDocs] = useState(null);
  const [verPagadas, setVerPagadas] = useState(false);
  const hoy = hoyLima();
  const moneda = f.moneda || 'PEN';
  const money = v => formatMoney(v, moneda);
  const interesSaldo = f.tipo_cuota === 'interes_saldo';
  const est = estadoFinanciamiento(f, hoy);
  const pillEstado = est.estado === 'cancelado' ? { tone: 'gray', text: 'Cancelado' } : est.estado === 'atrasado' ? { tone: 'red', text: `Atrasado · ${plural(est.diasAtraso, 'día', 'días')}` } : { tone: 'green', text: 'Al día' };
  const prox = nextCuota(f);
  const amortizado = Math.max(0, Number(f.monto_original || 0) - Number(f.saldo_pendiente || 0));
  const interesesPagados = (f.pagos_realizados || []).reduce((s, p) => s + Number(p.interes || 0), 0) || Number(f.intereses_pagados_total || 0);
  const movimientos = construirMovimientos(f, hoy);
  const tabla = [...(f.tabla_amortizacion || [])].sort((a, b) => Number(a.numero) - Number(b.numero));
  // Préstamos largos: se pliegan las cuotas pagadas y se muestran solo las 3 últimas.
  const pagadasTabla = tabla.filter(c => !impaga(c));
  const ocultas = !verPagadas && pagadasTabla.length > 6 ? pagadasTabla.slice(0, -3) : [];
  const ocultasIds = new Set(ocultas.map(c => c.numero));
  const tablaVisible = tabla.filter(c => !ocultasIds.has(c.numero));
  const tm = tasaMensualFinanciamiento(f);
  const proxEtiqueta = prox
    ? (prox.fecha < hoy ? `Vencido hace ${plural(dias(prox.fecha, hoy), 'día', 'días')}` : `${interesSaldo ? 'Interés' : `Cuota ${prox.numero}`} · vence ${fecha(prox.fecha)}`)
    : 'Sin pagos pendientes';
  const tabs = [['movimientos', 'Movimientos'], ['cronograma', 'Cronograma'], ['documentos', nDocs ? `Documentos · ${nDocs}` : 'Documentos']];

  return (
    <section className="dx-ui dx-fin">
      <button type="button" className="dx-fin-volver" onClick={onVolver}>‹ Financiamiento y Deuda</button>
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Financiamiento · {f.entidad}</div>
          <h1 className="dx-ui-title">{f.codigo} · {money(f.monto_original)}</h1>
          <p className="dx-ui-sub">
            {modalidadTexto(f)} · {interesSaldo || !f.plazo_meses ? 'sin plazo' : plural(f.plazo_meses, 'mes', 'meses')} · desembolsado {fecha(f.fecha_desembolso)}{' '}
            <span className={`dx-ui-pill is-${pillEstado.tone}`}><i />{pillEstado.text}</span>
          </p>
        </div>
        <div className="dx-ui-actions">
          <button type="button" className="dx-btn" disabled={!puedeEditar} title={puedeEditar ? undefined : 'No tienes permiso para editar financiamientos'} onClick={onEditar}>Editar</button>
          <button type="button" className="dx-btn danger" disabled={!puedeEliminar} title={puedeEliminar ? undefined : 'No tienes permiso para eliminar financiamientos'} onClick={onEliminar}>Eliminar</button>
          <button type="button" className="dx-btn primary" disabled={!puedeEditar || f.estado === 'cancelado'} title={puedeEditar ? undefined : 'No tienes permiso para registrar pagos'} onClick={() => onPagar?.(prox)}>Registrar pago</button>
        </div>
      </header>

      <div className="dx-fin-kpis">
        <div className="dx-ui-kpi-row dx-fin-kpis-4">
          <div className="dx-ui-kpi"><strong>{money(f.saldo_pendiente)}</strong><span>Saldo de capital</span></div>
          <div className={`dx-ui-kpi${prox && prox.fecha < hoy ? ' dx-fin-kpi-alerta' : ''}`} title={proxEtiqueta}>
            {prox ? <strong>{money(prox.total)}</strong> : <strong className="dx-fin-kpi-vacio">Nada</strong>}
            <span>{proxEtiqueta}</span>
          </div>
          <div className="dx-ui-kpi"><strong>{money(amortizado)}</strong><span>Capital amortizado</span></div>
          <div className="dx-ui-kpi"><strong>{money(interesesPagados)}</strong><span>Intereses pagados</span></div>
        </div>
      </div>

      <div className="dx-fin-wrap">
      <div className="dx-fin-layout">
        <div className="dx-ui-card">
          <div className="dx-ui-toolbar">
            <div className="dx-ui-tabs dx-fin-tabs" role="tablist" aria-label="Secciones del préstamo">
              {tabs.map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dx-ui-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
          </div>

          {tab === 'movimientos' && (movimientos.length ? (
            <ol className="dx-fin-tl">
              {movimientos.map(m => (
                <li key={m.key} className={`is-${m.estado}`}>
                  <span className="dx-fin-dot" aria-hidden="true" />
                  <div className="dx-fin-tl-txt"><strong>{m.titulo}</strong><span className="dx-fin-small">{m.detalle}</span></div>
                  <div className="dx-fin-tl-monto">
                    {m.pill ? <span className={`dx-ui-pill is-${m.pill.tone}`}><i />{m.pill.text} · {money(m.monto)}</span> : <strong className="dx-fin-monto">{money(m.monto)}</strong>}
                    {m.nota && <span className="dx-fin-small">{m.nota}</span>}
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="dx-ui-empty">Este préstamo aún no tiene movimientos.</div>)}

          {tab === 'cronograma' && (
            <div className="dx-fin-tbl-wrap">
              <table className="dx-fin-tbl">
                <thead>
                  <tr>
                    <th>{interesSaldo ? 'Período' : 'N.º'}</th><th>Vence</th>
                    {interesSaldo ? <th className="dx-fin-num">Saldo al corte</th> : <th className="dx-fin-num">Capital</th>}
                    <th className="dx-fin-num">Interés</th><th className="dx-fin-num">Total</th>
                    {!interesSaldo && <th className="dx-fin-num">Saldo</th>}
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ocultas.length > 0 && (
                    <tr className="dx-fin-plegadas">
                      <td colSpan={interesSaldo ? 6 : 7}>
                        <button type="button" className="dx-fin-volver" onClick={() => setVerPagadas(true)}>
                          Mostrar {plural(ocultas.length, 'cuota pagada anterior', 'cuotas pagadas anteriores')}
                        </button>
                      </td>
                    </tr>
                  )}
                  {tablaVisible.map(c => {
                    const e = estadoCuota(c, hoy);
                    const pagable = impaga(c) && puedeEditar;
                    return (
                      <tr key={c.id || c.numero} className={pagable ? 'is-pagable' : ''} tabIndex={pagable ? 0 : undefined} role={pagable ? 'button' : undefined}
                        aria-label={pagable ? `Pagar ${interesSaldo ? 'interés' : 'cuota'} ${c.numero}` : undefined}
                        onClick={pagable ? () => onPagar?.(c) : undefined} onKeyDown={pagable ? activar(() => onPagar?.(c)) : undefined}>
                        <td>{interesSaldo ? mesAnio(c.fecha) : c.numero}</td>
                        <td>{fecha(c.fecha)}</td>
                        <td className="dx-fin-num">{money(interesSaldo ? (c.saldo_base ?? c.saldo) : c.capital)}</td>
                        <td className="dx-fin-num">{money(c.interes)}</td>
                        <td className="dx-fin-num"><strong>{money(c.total)}</strong></td>
                        {!interesSaldo && <td className="dx-fin-num">{money(c.saldo)}</td>}
                        <td><span className={`dx-ui-pill is-${e.tone}`}><i />{e.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!tabla.length && <div className="dx-ui-empty">Este préstamo no tiene cronograma.</div>}
              <div className="dx-fin-foot">
                {interesSaldo
                  ? 'El interés de cada mes se calcula sobre el saldo de capital a la fecha de corte; el siguiente período se genera solo.'
                  : `${plural(tabla.filter(impaga).length, 'cuota por pagar', 'cuotas por pagar')} · intereses por pagar ${money(tabla.filter(impaga).reduce((s, c) => s + Number(c.interes || 0), 0))}`}
              </div>
            </div>
          )}

          {tab === 'documentos' && <Documentos financiamiento={f} empresaId={empresaId} puedeEditar={puedeEditar} onCantidad={setNDocs} />}
        </div>

        <aside className="dx-ui-card dx-fin-aside" aria-label="Condiciones del préstamo">
          <h3>Condiciones</h3>
          <dl className="dx-fin-dl">
            <dt>Acreedor</dt><dd>{f.entidad}</dd>
            <dt>Tipo</dt><dd>{TIPO_ACREEDOR[f.tipo] || 'Otro'}</dd>
            <dt>Modalidad</dt><dd>{interesSaldo ? 'Interés sobre saldo' : f.tipo_cuota === 'aleman' ? 'Cuota decreciente' : f.tipo_cuota === 'bullet' ? 'Solo intereses' : 'Cuota fija'}</dd>
            <dt>Tasa</dt><dd>{interesSaldo ? `${pct(tm)} mensual` : `${f.tipo_tasa || 'TEA'} ${Number(f.tasa_anual || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })}%`}</dd>
            <dt>{interesSaldo ? 'TEA equivalente' : 'Tasa mensual'}</dt><dd>{interesSaldo ? pct(teaEquivalente(tm)) : pct(tm)}</dd>
            <dt>{interesSaldo ? 'Día de corte' : 'Día de pago'}</dt><dd>{f.dia_pago ? `${f.dia_pago} de cada mes` : 'Sin dato'}</dd>
            <dt>Plazo</dt><dd>{interesSaldo || !f.plazo_meses ? 'Sin plazo' : plural(f.plazo_meses, 'mes', 'meses')}</dd>
            {interesSaldo && <><dt>Interés impago</dt><dd>Queda vencido aparte</dd></>}
            <dt>Moneda</dt><dd>{moneda}</dd>
            <dt>Cuenta</dt><dd>{f.cuenta_bancaria_destino || 'Sin dato'}</dd>
            {f.contacto_nombre && <><dt>Contacto</dt><dd>{f.contacto_nombre}</dd></>}
            {f.proposito && <><dt>Propósito</dt><dd>{f.proposito}</dd></>}
          </dl>
          <div className="dx-fin-total">
            <span className="dx-fin-small">Próximo pago</span>
            <strong>{prox ? money(prox.total) : 'Nada'}</strong>
          </div>
          {interesSaldo && f.estado !== 'cancelado' && (
            <p className="dx-fin-small dx-fin-nota">Si amortizas capital antes del próximo corte, el interés de ese mes se calcula sobre el nuevo saldo.</p>
          )}
        </aside>
      </div>
      </div>
    </section>
  );
}

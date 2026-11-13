import React, { useCallback, useEffect, useState } from 'react';
import {
  accionLiquidacion, agregarViajesLiquidacion, ajustarEspera, eliminarCargo, guardarCargo, guardarCostoTercero,
  listarPorLiquidar, obtenerLiquidacion, quitarViajeLiquidacion,
} from '../../../services/transporteLiquidacionService.js';
import { hoyLima } from '../../../../../src/lib/transporteLogistica.js';
import { etiquetaContador, formatearImporte } from './transporteUtils.js';
import { DialogoLiq, ESTADO_LIQ, fechaDMY, horasTexto, nombreCuenta } from './liquidacionComun.jsx';

const PASOS = [['borrador', 'Borrador'], ['en_revision', 'En revisión'], ['con_cliente', 'Conformidad del cliente', 'Opcional'],
  ['aprobada', 'Aprobada'], ['en_ventas', 'En Ventas', 'Se factura allí']];
const ORDEN = { borrador: 0, en_revision: 1, con_cliente: 2, aprobada: 3, en_ventas: 4 };
const TIPO_CARGO = { recargo: 'Recargo al cliente', descuento: 'Descuento al cliente', costo: 'Otro costo del viaje' };
const num = valor => (valor === '' || valor == null ? null : Number(valor));

function FormCargo({ dlg, busy, onGuardar, onClose, error }) {
  const [tipo, setTipo] = useState(dlg.cargo?.tipo || dlg.tipo || 'recargo');
  const [descripcion, setDescripcion] = useState(dlg.cargo?.descripcion || '');
  const [monto, setMonto] = useState(dlg.cargo?.monto ?? '');
  const [intento, setIntento] = useState(false);
  const errDesc = !descripcion.trim() ? 'Escribe el concepto.' : '';
  const errMonto = !(Number(monto) > 0) ? 'Ingresa un monto mayor a cero.' : '';
  const guardar = () => { setIntento(true); if (!errDesc && !errMonto) onGuardar({ tipo, descripcion: descripcion.trim(), monto: Number(monto) }); };
  return <DialogoLiq title={dlg.cargo ? 'Editar cargo' : 'Agregar cargo'} subtitle={dlg.linea.viaje?.codigo} busy={busy} onClose={onClose} error={error}
    footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="dx-btn primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></>}>
    <div className="dx-tmsliq-seg" role="radiogroup" aria-label="Tipo de cargo">
      {Object.entries(TIPO_CARGO).map(([clave, texto]) => <button key={clave} type="button" role="radio" aria-checked={tipo === clave}
        className={tipo === clave ? 'is-on' : ''} onClick={() => setTipo(clave)}>{texto}</button>)}</div>
    <div className="dx-tmsliq-fgrid">
      <label className="dx-ui-field dx-tmsliq-full" htmlFor="cargo-desc"><span>Concepto <b className="dx-ui-required">*</b></span>
        <input id="cargo-desc" value={descripcion} aria-invalid={intento && !!errDesc} placeholder="Ej.: maniobra de descarga con grúa"
          onChange={e => setDescripcion(e.target.value)} />{intento && errDesc && <small className="dx-ui-field-error">{errDesc}</small>}</label>
      <label className="dx-ui-field" htmlFor="cargo-monto"><span>Monto sin IGV <b className="dx-ui-required">*</b></span>
        <input id="cargo-monto" type="number" min="0" step="0.01" inputMode="decimal" value={monto} aria-invalid={intento && !!errMonto}
          onChange={e => setMonto(e.target.value)} />{intento && errMonto && <small className="dx-ui-field-error">{errMonto}</small>}</label>
    </div>
  </DialogoLiq>;
}

function FormEspera({ dlg, busy, onGuardar, onClose, error }) {
  const l = dlg.linea;
  const [h, setH] = useState(Math.floor((l.espera_minutos_cobrables || 0) / 60));
  const [m, setM] = useState((l.espera_minutos_cobrables || 0) % 60);
  const [precio, setPrecio] = useState(l.espera_precio_hora ?? '');
  const [motivo, setMotivo] = useState(l.espera_motivo || '');
  const [intento, setIntento] = useState(false);
  const minutos = Number(h || 0) * 60 + Number(m || 0);
  const errPrecio = !(Number(precio) >= 0) || precio === '' ? 'Indica el precio por hora.' : '';
  const errMotivo = !motivo.trim() ? 'Escribe el motivo del ajuste.' : '';
  const errTiempo = Number(m) > 59 || Number(m) < 0 || Number(h) < 0 ? 'Revisa las horas y minutos.' : '';
  const guardar = () => { setIntento(true); if (!errPrecio && !errMotivo && !errTiempo) onGuardar({ minutos, precio: Number(precio), motivo: motivo.trim() }); };
  return <DialogoLiq title="Ajustar espera" subtitle={`${l.viaje?.codigo} · registrada: carga ${horasTexto(l.espera_carga_min)}, descarga ${horasTexto(l.espera_descarga_min)}`}
    busy={busy} onClose={onClose} error={error}
    footer={<>{l.espera_ajustada && <button type="button" className="dx-btn" disabled={busy} onClick={() => onGuardar({ minutos: null })}>Volver al cálculo automático</button>}
      <button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="dx-btn primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar ajuste'}</button></>}>
    <div className="dx-tmsliq-fgrid is-3">
      <label className="dx-ui-field" htmlFor="esp-h"><span>Horas cobrables</span>
        <input id="esp-h" type="number" min="0" step="1" value={h} onChange={e => setH(e.target.value)} /></label>
      <label className="dx-ui-field" htmlFor="esp-m"><span>Minutos</span>
        <input id="esp-m" type="number" min="0" max="59" step="1" value={m} aria-invalid={intento && !!errTiempo} onChange={e => setM(e.target.value)} />
        {intento && errTiempo && <small className="dx-ui-field-error">{errTiempo}</small>}</label>
      <label className="dx-ui-field" htmlFor="esp-p"><span>Precio por hora <b className="dx-ui-required">*</b></span>
        <input id="esp-p" type="number" min="0" step="0.01" value={precio} aria-invalid={intento && !!errPrecio} onChange={e => setPrecio(e.target.value)} />
        {intento && errPrecio && <small className="dx-ui-field-error">{errPrecio}</small>}</label>
      <label className="dx-ui-field dx-tmsliq-full" htmlFor="esp-mot"><span>Motivo <b className="dx-ui-required">*</b></span>
        <input id="esp-mot" value={motivo} aria-invalid={intento && !!errMotivo} placeholder="Ej.: el cliente reconoce solo 1 h por demora propia"
          onChange={e => setMotivo(e.target.value)} />{intento && errMotivo && <small className="dx-ui-field-error">{errMotivo}</small>}</label>
    </div>
    <p className="dx-tmsliq-help">Resultado: {horasTexto(minutos)} × {formatearImporte(num(precio) || 0, dlg.moneda)} = <b>{formatearImporte(Math.round(minutos / 60 * (num(precio) || 0) * 100) / 100, dlg.moneda)}</b></p>
  </DialogoLiq>;
}

function FormMonto({ titulo, subtitulo, etiqueta, inicial, ayuda, busy, onGuardar, onClose, error }) {
  const [monto, setMonto] = useState(inicial ?? '');
  const [intento, setIntento] = useState(false);
  const err = monto === '' || !(Number(monto) >= 0) ? 'Ingresa un monto (0 si no aplica).' : '';
  return <DialogoLiq title={titulo} subtitle={subtitulo} busy={busy} onClose={onClose} error={error}
    footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="dx-btn primary" disabled={busy} onClick={() => { setIntento(true); if (!err) onGuardar(Number(monto)); }}>{busy ? 'Guardando…' : 'Guardar'}</button></>}>
    <label className="dx-ui-field" htmlFor="monto-unico"><span>{etiqueta} <b className="dx-ui-required">*</b></span>
      <input id="monto-unico" type="number" min="0" step="0.01" value={monto} aria-invalid={intento && !!err} onChange={e => setMonto(e.target.value)} />
      {intento && err && <small className="dx-ui-field-error">{err}</small>}</label>
    {ayuda && <p className="dx-tmsliq-help">{ayuda}</p>}
  </DialogoLiq>;
}

function FormMotivo({ titulo, subtitulo, boton, peligro, busy, onGuardar, onClose, error }) {
  const [motivo, setMotivo] = useState('');
  const [intento, setIntento] = useState(false);
  const err = !motivo.trim() ? 'Escribe el motivo.' : '';
  return <DialogoLiq title={titulo} subtitle={subtitulo} busy={busy} onClose={onClose} error={error}
    footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className={`dx-btn primary${peligro ? ' dx-tmsliq-danger' : ''}`} disabled={busy}
        onClick={() => { setIntento(true); if (!err) onGuardar(motivo.trim()); }}>{busy ? 'Guardando…' : boton}</button></>}>
    <label className="dx-ui-field" htmlFor="motivo-txt"><span>Motivo <b className="dx-ui-required">*</b></span>
      <textarea id="motivo-txt" rows={3} value={motivo} aria-invalid={intento && !!err} onChange={e => setMotivo(e.target.value)} />
      {intento && err && <small className="dx-ui-field-error">{err}</small>}</label>
  </DialogoLiq>;
}

function FormConformidad({ liq, busy, onGuardar, onClose, error }) {
  const [f, setF] = useState({ resultado: 'conforme', nombre: '', cargo: '', fecha: hoyLima(), medio: 'Correo', respaldo_url: '', comentario: '' });
  const [intento, setIntento] = useState(false);
  const set = (k, v) => setF(old => ({ ...old, [k]: v }));
  const errs = { nombre: !f.nombre.trim() ? 'Escribe el nombre.' : '', fecha: !f.fecha ? 'Indica la fecha.' : '',
    comentario: f.resultado === 'observada' && !f.comentario.trim() ? 'Escribe la observación del cliente.' : '' };
  const guardar = () => { setIntento(true); if (!Object.values(errs).some(Boolean)) onGuardar(f); };
  return <DialogoLiq title="Conformidad del cliente" subtitle={`${liq.numero} · ${nombreCuenta(liq.cuenta)} · ${formatearImporte(liq.total, liq.moneda)}`}
    busy={busy} onClose={onClose} error={error}
    footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="dx-btn primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : f.resultado === 'conforme' ? 'Registrar conformidad' : 'Registrar observación'}</button></>}>
    <div className="dx-tmsliq-seg" role="radiogroup" aria-label="Respuesta del cliente">
      <button type="button" role="radio" aria-checked={f.resultado === 'conforme'} className={f.resultado === 'conforme' ? 'is-on' : ''}
        onClick={() => set('resultado', 'conforme')}><b>✓ Conforme</b>Pasa a «Aprobada»</button>
      <button type="button" role="radio" aria-checked={f.resultado === 'observada'} className={f.resultado === 'observada' ? 'is-on' : ''}
        onClick={() => set('resultado', 'observada')}><b>✎ Observada</b>Vuelve a «Borrador»</button></div>
    <div className="dx-tmsliq-fgrid">
      <label className="dx-ui-field" htmlFor="conf-nombre"><span>Quién responde <b className="dx-ui-required">*</b></span>
        <input id="conf-nombre" value={f.nombre} aria-invalid={intento && !!errs.nombre} onChange={e => set('nombre', e.target.value)} />
        {intento && errs.nombre && <small className="dx-ui-field-error">{errs.nombre}</small>}</label>
      <label className="dx-ui-field" htmlFor="conf-cargo"><span>Cargo</span><input id="conf-cargo" value={f.cargo} onChange={e => set('cargo', e.target.value)} /></label>
      <label className="dx-ui-field" htmlFor="conf-fecha"><span>Fecha <b className="dx-ui-required">*</b></span>
        <input id="conf-fecha" type="date" value={f.fecha} aria-invalid={intento && !!errs.fecha} onChange={e => set('fecha', e.target.value)} />
        {intento && errs.fecha && <small className="dx-ui-field-error">{errs.fecha}</small>}</label>
      <label className="dx-ui-field" htmlFor="conf-medio"><span>Medio</span>
        <select id="conf-medio" className="dx-ui-select" value={f.medio} onChange={e => set('medio', e.target.value)}>
          {['Correo', 'Firma en la prefactura', 'Orden de compra del cliente', 'Otro'].map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="dx-ui-field dx-tmsliq-full" htmlFor="conf-url"><span>Enlace al respaldo</span>
        <input id="conf-url" value={f.respaldo_url} placeholder="Ej.: enlace al correo o al PDF firmado" onChange={e => set('respaldo_url', e.target.value)} /></label>
      <label className="dx-ui-field dx-tmsliq-full" htmlFor="conf-com"><span>Comentario {f.resultado === 'observada' && <b className="dx-ui-required">*</b>}</span>
        <textarea id="conf-com" rows={3} value={f.comentario} aria-invalid={intento && !!errs.comentario} onChange={e => set('comentario', e.target.value)} />
        {intento && errs.comentario && <small className="dx-ui-field-error">{errs.comentario}</small>}</label>
    </div>
  </DialogoLiq>;
}

function FormAgregar({ liq, empresaId, busy, onGuardar, onClose, error }) {
  const [viajes, setViajes] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  useEffect(() => {
    listarPorLiquidar(empresaId).then(lista => setViajes(lista.filter(v => v.cuenta_id === liq.cuenta_id && (v.moneda || 'PEN') === liq.moneda)))
      .catch(() => setViajes([]));
  }, [empresaId, liq.cuenta_id, liq.moneda]);
  return <DialogoLiq title="Agregar viajes" subtitle={`Viajes entregados de ${nombreCuenta(liq.cuenta)}`} busy={busy} onClose={onClose} error={error}
    footer={<><button type="button" className="dx-btn" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" className="dx-btn primary" disabled={busy || !sel.size} onClick={() => onGuardar([...sel])}>
        {busy ? 'Agregando…' : `Agregar ${sel.size || ''}`}</button></>}>
    {viajes === null ? <p className="dx-tmsliq-help">Cargando…</p> : !viajes.length ? <p className="dx-tmsliq-help">No hay otros viajes entregados de este cliente.</p>
      : <ul className="dx-tmsliq-mini-list is-check">{viajes.map(v => <li key={v.id}><label htmlFor={`agv-${v.id}`}>
        <input id={`agv-${v.id}`} type="checkbox" checked={sel.has(v.id)} onChange={() => setSel(old => {
          const s = new Set(old); if (s.has(v.id)) s.delete(v.id); else s.add(v.id); return s; })} />
        <b>{v.codigo}</b><span>{fechaDMY(v.fecha_programada)} · {v.origen_nombre} → {v.destino_nombre}</span>
        <em>{formatearImporte(v.ingreso_estimado, v.moneda)}</em></label></li>)}</ul>}
  </DialogoLiq>;
}

function TarjetaViaje({ linea, liq, editable, perm, onDlg, onNav, onQuitar, busy }) {
  const v = linea.viaje || {};
  const moneda = liq.moneda;
  const recargos = (linea.cargos || []).filter(c => c.tipo !== 'costo');
  const costos = (linea.cargos || []).filter(c => c.tipo === 'costo');
  const tercero = v.transportista?.tipo_operador && v.transportista.tipo_operador !== 'propio';
  const ren = linea.rendicion;
  const observados = linea.gastos.filter(g => g.estado === 'observado').length;
  const margenPct = Number(linea.ingreso) ? (Number(linea.margen) / Number(linea.ingreso)) * 100 : 0;
  return <article className="dx-tmsliq-vcard">
    <div className="dx-tmsliq-vh"><b>{v.codigo}</b>{v.os && <span className="dx-ui-pill is-violet">{v.os.numero}</span>}
      <small>{fechaDMY(v.fecha_programada)} · {v.origen_nombre} → {v.destino_nombre}</small>
      <div className="dx-tmsliq-vh-r"><button type="button" className="dx-btn link" onClick={() => onNav?.('transporte-viaje', { id: v.id })}>Ver viaje</button>
        {editable && <button type="button" className="dx-btn link dx-tmsliq-danger-t" disabled={busy} onClick={() => onQuitar(linea)}>Quitar</button>}</div></div>
    {linea.facturasOs.length > 0 && <div className="dx-tmsliq-note is-amber" role="note">⚠ {v.os?.numero} ya tiene {linea.facturasOs.map(f => `${f.numero} por ${formatearImporte(f.total, f.moneda)}`).join(', ')}.
      Revisa que este viaje no esté incluido antes de liquidarlo.</div>}
    <div className="dx-tmsliq-cols">
      <div className="dx-tmsliq-col"><h4>Ingreso al cliente</h4>
        <div className="dx-tmsliq-ln"><b>Flete</b><span>{formatearImporte(linea.flete, moneda)}</span>
          <small>{Number(v.cantidad_facturable || 1)} × {formatearImporte(v.tarifa_unitaria ?? linea.flete, moneda)} · del viaje</small></div>
        <div className="dx-tmsliq-ln"><b>Espera{linea.espera_ajustada && <span className="dx-ui-pill is-amber dx-tmsliq-tag">Ajustada</span>}
          {editable && <button type="button" className="dx-btn link" onClick={() => onDlg({ tipo: 'espera', linea, moneda })}>Ajustar</button>}</b>
          <span>{formatearImporte(linea.espera_monto, moneda)}</span>
          <small>{linea.espera_ajustada ? `${horasTexto(linea.espera_minutos_cobrables)} × ${formatearImporte(linea.espera_precio_hora, moneda)}/h · ${linea.espera_motivo}`
            : linea.espera_franquicia_horas == null || !Number(linea.espera_precio_hora)
              ? `Carga ${horasTexto(linea.espera_carga_min)} · descarga ${horasTexto(linea.espera_descarga_min)} · la tarifa no cobra espera`
              : `Carga ${horasTexto(linea.espera_carga_min)} · descarga ${horasTexto(linea.espera_descarga_min)} − ${Number(linea.espera_franquicia_horas)} h libres por parada = ${horasTexto(linea.espera_minutos_cobrables)} × ${formatearImporte(linea.espera_precio_hora, moneda)}/h`}</small></div>
        <div className="dx-tmsliq-ln"><b>Peajes</b><span>{formatearImporte(linea.peajes, moneda)}</span>
          <small>{linea.peajes_incluidos ? 'Incluidos en la tarifa' : 'Según los tickets del conductor (no observados)'}</small></div>
        {recargos.map(c => <div key={c.id} className="dx-tmsliq-ln"><b>{c.descripcion}
          {editable && <><button type="button" className="dx-btn link" onClick={() => onDlg({ tipo: 'cargo', linea, cargo: c })}>Editar</button>
            <button type="button" className="dx-btn link dx-tmsliq-danger-t" aria-label={`Eliminar ${c.descripcion}`} onClick={() => onDlg({ tipo: 'eliminarCargo', cargo: c })}>Eliminar</button></>}</b>
          <span>{c.tipo === 'descuento' ? '−' : ''}{formatearImporte(c.monto, moneda)}</span><small>{c.tipo === 'descuento' ? 'Descuento' : 'Recargo'}</small></div>)}
        {editable && <button type="button" className="dx-btn link dx-tmsliq-add" onClick={() => onDlg({ tipo: 'cargo', linea, tipoCargo: 'recargo' })}>＋ Recargo o descuento</button>}
        <div className="dx-tmsliq-ln is-tot"><b>Ingreso sin IGV</b><span>{formatearImporte(linea.ingreso, moneda)}</span></div></div>
      <div className="dx-tmsliq-col"><h4>Costo del viaje</h4>
        <div className="dx-tmsliq-ln"><b>Gastos del conductor</b><span>{formatearImporte(linea.costo_gastos, moneda)}</span>
          <small>{linea.gastos.length ? `${etiquetaContador(linea.gastos.length - observados, 'gasto')}${observados ? ` · ${etiquetaContador(observados, 'observado')}` : ''}` : 'Sin gastos registrados'}
            {ren && <> · <button type="button" className="dx-btn link" onClick={() => onNav?.('transporte-liquidacion', { rendicion: v.id })}>{ren.numero}</button>
              {' '}<span className={`dx-ui-pill dx-tmsliq-tag ${ren.estado === 'aprobada' ? 'is-green' : linea.gastos_pendientes ? 'is-amber' : 'is-gray'}`}>
                {ren.estado === 'aprobada' ? 'Aprobada' : linea.gastos_pendientes ? `${linea.gastos_pendientes} por revisar` : 'Abierta'}</span></>}</small></div>
        <div className="dx-tmsliq-ln"><b>Flete del transportista
          {editable && <button type="button" className="dx-btn link" onClick={() => onDlg({ tipo: 'tercero', linea })}>Editar</button>}</b>
          <span>{formatearImporte(linea.costo_tercero, moneda)}</span>
          <small>{tercero ? `${v.transportista?.nombre_comercial || v.transportista?.razon_social} · tercero` : 'Unidad propia'}</small></div>
        {costos.map(c => <div key={c.id} className="dx-tmsliq-ln"><b>{c.descripcion}
          {editable && <><button type="button" className="dx-btn link" onClick={() => onDlg({ tipo: 'cargo', linea, cargo: c })}>Editar</button>
            <button type="button" className="dx-btn link dx-tmsliq-danger-t" aria-label={`Eliminar ${c.descripcion}`} onClick={() => onDlg({ tipo: 'eliminarCargo', cargo: c })}>Eliminar</button></>}</b>
          <span>{formatearImporte(c.monto, moneda)}</span><small>Otro costo</small></div>)}
        {editable && <button type="button" className="dx-btn link dx-tmsliq-add" onClick={() => onDlg({ tipo: 'cargo', linea, tipoCargo: 'costo' })}>＋ Otro costo</button>}
        <div className="dx-tmsliq-ln is-tot"><b>Costo total</b><span>{formatearImporte(linea.costo_total, moneda)}</span></div></div>
    </div>
    {perm.ver_costos !== false && <div className="dx-tmsliq-margin"><span>Margen del viaje</span>
      <span><b className={Number(linea.margen) < 0 ? 'is-neg' : ''}>{formatearImporte(linea.margen, moneda)}</b> · {margenPct.toFixed(1)}%</span></div>}
  </article>;
}

export function LiquidacionDetalle({ id, empresaId, perm, onNav, sesion }) {
  const [liq, setLiq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dlg, setDlg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dlgError, setDlgError] = useState('');
  const [aviso, setAviso] = useState('');

  const reload = useCallback(async () => {
    if (!empresaId) return;
    setError('');
    try { setLiq(await obtenerLiquidacion(empresaId, id)); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [empresaId, id]);
  useEffect(() => { setLoading(true); reload(); }, [reload]);

  async function ejecutar(fn, ok) {
    setBusy(true); setDlgError('');
    try { await fn(); setDlg(null); if (ok) setAviso(ok); await reload(); }
    catch (e) { if (dlg) setDlgError(e.message); else setAviso(e.message); }
    finally { setBusy(false); }
  }
  const abrirDlg = d => { setDlgError(''); setDlg(d); };
  const accion = (nombre, datos, ok) => ejecutar(() => accionLiquidacion(id, nombre, datos), ok);

  const volver = <button type="button" className="dx-tmsliq-back" onClick={() => onNav?.('transporte-liquidacion', {})}>‹ Liquidaciones</button>;
  if (loading) return <section className="dx-ui dx-tms dx-tmsliq">{volver}<div className="dx-tms-skeletons">{[1, 2].map(k => <div key={k} className="dx-tms-sk is-tall" />)}</div></section>;
  if (error || !liq) return <section className="dx-ui dx-tms dx-tmsliq">{volver}<div className="dx-ui-card dx-tms-state"><span className="dx-tms-state-i is-red">!</span>
    <b>{error ? 'No pudimos cargar la liquidación' : 'La liquidación no existe'}</b><span>{error}</span>
    {error && <button type="button" className="dx-btn primary" onClick={reload}>Reintentar</button>}</div></section>;

  const [tono, texto] = ESTADO_LIQ[liq.estado] || ['is-gray', liq.estado];
  const editable = liq.estado === 'borrador' && perm.editar;
  const actual = ORDEN[liq.estado] ?? -1;
  const flete = liq.lineas.reduce((s, l) => s + Number(l.flete), 0);
  const empresaNombre = sesion?.empresa?.razon_social || sesion?.empresa?.nombre_comercial || '';
  const pdf = async () => {
    const { generarPrefacturaPdf } = await import('../../../../../src/lib/liquidacionTransportePdf.js');
    generarPrefacturaPdf({ liquidacion: liq, empresa: empresaNombre });
  };
  const pendientes = liq.lineas.reduce((s, l) => s + Number(l.gastos_pendientes || 0), 0);

  const acciones = [];
  if (liq.estado === 'borrador') {
    if (perm.anular) acciones.push(['Anular', () => abrirDlg({ tipo: 'anular' }), 'danger']);
    if (perm.editar) acciones.push(['Recalcular', () => accion('recalcular', {}, 'Liquidación recalculada.')]);
    if (perm.editar) acciones.push(['＋ Agregar viajes', () => abrirDlg({ tipo: 'agregar' })]);
    if (perm.editar) acciones.push(['Enviar a revisión', () => accion('enviar_revision', {}, 'Enviada a revisión.'), 'primary']);
  } else if (liq.estado === 'en_revision') {
    if (perm.editar) acciones.push(['Devolver a borrador', () => abrirDlg({ tipo: 'devolver' })]);
    if (perm.editar) acciones.push(['Enviar al cliente', () => accion('enviar_cliente', {}, 'Marcada como enviada al cliente. Descarga la prefactura y envíasela.')]);
    if (perm.aprobar) acciones.push(['Aprobar', () => accion('aprobar', {}, 'Liquidación aprobada.'), 'primary']);
  } else if (liq.estado === 'con_cliente') {
    if (perm.editar) acciones.push(['Devolver a borrador', () => abrirDlg({ tipo: 'devolver' })]);
    if (perm.aprobar) acciones.push(['Registrar respuesta del cliente', () => abrirDlg({ tipo: 'conformidad' }), 'primary']);
  } else if (liq.estado === 'aprobada') {
    if (perm.anular) acciones.push(['Anular', () => abrirDlg({ tipo: 'anular' }), 'danger']);
    if (perm.editar) acciones.push(['Devolver a borrador', () => abrirDlg({ tipo: 'devolver' })]);
    if (perm.aprobar) acciones.push(['Enviar a Ventas', () => abrirDlg({ tipo: 'ventas' }), 'primary']);
  }

  return <section className="dx-ui dx-tms dx-tmsliq">
    {volver}
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Liquidación de transporte · <span className={`dx-ui-pill ${tono}`}><i />{texto}</span></div>
      <h1 className="dx-ui-title">{liq.numero} · {nombreCuenta(liq.cuenta)}</h1>
      <p className="dx-ui-sub">{fechaDMY(liq.periodo_desde)} – {fechaDMY(liq.periodo_hasta)} · {etiquetaContador(liq.lineas.length, 'viaje')} · {liq.moneda === 'USD' ? 'Dólares' : 'Soles'}</p></div>
      <div className="dx-ui-actions"><button type="button" className="dx-btn" onClick={pdf}>⎙ Prefactura PDF</button>
        {acciones.map(([t, fn, k]) => <button key={t} type="button" className={`dx-btn${k === 'primary' ? ' primary' : ''}${k === 'danger' ? ' dx-tmsliq-danger-t' : ''}`}
          disabled={busy} onClick={fn}>{t}</button>)}</div>
    </header>

    {aviso && <div className="dx-tmsliq-note is-cyan" role="status">{aviso}<button type="button" aria-label="Cerrar aviso" onClick={() => setAviso('')}>×</button></div>}
    {liq.observacion && liq.estado === 'borrador' && <div className="dx-tmsliq-note is-amber" role="note">↩ {liq.observacion}</div>}
    {liq.estado === 'anulada' && <div className="dx-tmsliq-note is-red" role="note">Anulada: {liq.anulado_motivo}. Sus viajes volvieron a «Por liquidar».</div>}
    {liq.estado === 'en_ventas' && <div className="dx-tmsliq-note is-green" role="note">✓ Enviada a Ventas el {fechaDMY(liq.en_ventas_at)}: la factura se emite desde Ventas / Facturación. Sus viajes están cerrados.</div>}
    {editable && pendientes > 0 && <div className="dx-tmsliq-note is-amber" role="note">Hay {etiquetaContador(pendientes, 'gasto')} del conductor sin revisar: el costo puede cambiar al aprobarlos u observarlos.</div>}

    {liq.estado !== 'anulada' && <ol className="dx-tmsliq-steps" aria-label="Avance de la liquidación">{PASOS.map(([clave, t, e], i) => {
      const saltado = clave === 'con_cliente' && actual > 2 && !liq.conformidad;
      const cls = i < actual ? (saltado ? 'is-skip' : 'is-done') : i === actual ? 'is-cur' : '';
      return <li key={clave} className={cls}><span>{i < actual && !saltado ? '✓' : i + 1}</span><b>{t}</b>
        <em>{clave === 'con_cliente' && liq.conformidad ? `${liq.conformidad.nombre} · ${fechaDMY(liq.conformidad.fecha)}` : saltado ? 'No se usó' : e || ''}</em></li>;
    })}</ol>}

    <div className="dx-tmsliq-lay">
      <div>{liq.lineas.map(linea => <TarjetaViaje key={linea.id} linea={linea} liq={liq} editable={editable} perm={perm} busy={busy}
        onDlg={abrirDlg} onNav={onNav} onQuitar={l => abrirDlg({ tipo: 'quitar', linea: l })} />)}
        <p className="dx-tmsliq-help">Los viajes quedan «En liquidación». Al enviarla a Ventas pasan a «Cerrado» y ya no se editan.</p></div>
      <aside className="dx-tmsliq-aside">
        <div className="dx-tmsliq-box"><h3>Total a facturar</h3>
          <div className="dx-tmsliq-ln"><b>Flete</b><span>{formatearImporte(flete, liq.moneda)}</span></div>
          <div className="dx-tmsliq-ln"><b>Recargos y descuentos</b><span>{formatearImporte(Number(liq.subtotal) - flete, liq.moneda)}</span></div>
          <div className="dx-tmsliq-ln"><b>Subtotal</b><span>{formatearImporte(liq.subtotal, liq.moneda)}</span></div>
          <div className="dx-tmsliq-ln"><b>IGV 18%</b><span>{formatearImporte(liq.igv, liq.moneda)}</span></div>
          <div className="dx-tmsliq-big"><span>Total</span><b>{formatearImporte(liq.total, liq.moneda)}</b></div></div>
        <div className="dx-tmsliq-box"><h3>Rentabilidad</h3>
          <div className="dx-tmsliq-ln"><b>Costo de los viajes</b><span>{formatearImporte(liq.costo_total, liq.moneda)}</span></div>
          <div className="dx-tmsliq-ln"><b>Margen</b><span className={Number(liq.margen) < 0 ? 'is-neg' : 'is-pos'}>{formatearImporte(liq.margen, liq.moneda)}</span></div>
          <div className="dx-tmsliq-ln"><b>Margen %</b><span>{Number(liq.subtotal) ? (Number(liq.margen) / Number(liq.subtotal) * 100).toFixed(1) : '0.0'}%</span></div></div>
        <div className="dx-tmsliq-box dx-tmsliq-meta">
          <div><small>Cliente</small><b>{liq.cuenta?.razon_social || nombreCuenta(liq.cuenta)}</b></div>
          <div><small>RUC</small><b>{liq.cuenta?.ruc || 'Sin dato'}</b></div>
          <div><small>Creada</small><b>{fechaDMY(liq.created_at)}</b></div>
          <div><small>Venta</small><b>{liq.venta_id ? 'Creada en Ventas' : 'Aún no'}</b></div>
          {liq.conformidad && <div className="dx-tmsliq-meta-full"><small>Respuesta del cliente</small>
            <b>{liq.conformidad.resultado === 'conforme' ? 'Conforme' : 'Observada'} · {liq.conformidad.nombre}{liq.conformidad.cargo ? `, ${liq.conformidad.cargo}` : ''} · {fechaDMY(liq.conformidad.fecha)}{liq.conformidad.medio ? ` · ${liq.conformidad.medio}` : ''}</b>
            {/^https?:\/\//i.test(liq.conformidad.respaldo_url || '') && <a href={liq.conformidad.respaldo_url} target="_blank" rel="noreferrer">Ver respaldo</a>}</div>}</div>
      </aside>
    </div>

    {dlg?.tipo === 'cargo' && <FormCargo dlg={{ ...dlg, tipo: dlg.tipoCargo }} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      onGuardar={d => ejecutar(() => guardarCargo(dlg.linea.id, dlg.cargo?.id, d.tipo, d.descripcion, d.monto), 'Cargo guardado.')} />}
    {dlg?.tipo === 'espera' && <FormEspera dlg={dlg} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      onGuardar={d => ejecutar(() => ajustarEspera(dlg.linea.id, d.minutos, d.precio ?? null, d.motivo ?? null), 'Espera actualizada.')} />}
    {dlg?.tipo === 'tercero' && <FormMonto titulo="Flete del transportista" subtitulo={dlg.linea.viaje?.codigo} etiqueta="Monto pactado sin IGV"
      inicial={dlg.linea.costo_tercero} ayuda="Solo se registra como costo del viaje; no crea una cuenta por pagar." busy={busy} error={dlgError}
      onClose={() => setDlg(null)} onGuardar={m => ejecutar(() => guardarCostoTercero(dlg.linea.id, m), 'Costo actualizado.')} />}
    {dlg?.tipo === 'eliminarCargo' && <DialogoLiq title="Eliminar cargo" subtitle={dlg.cargo.descripcion} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      footer={<><button type="button" className="dx-btn" onClick={() => setDlg(null)} disabled={busy}>Cancelar</button>
        <button type="button" className="dx-btn primary dx-tmsliq-danger" disabled={busy} onClick={() => ejecutar(() => eliminarCargo(dlg.cargo.id), 'Cargo eliminado.')}>Eliminar</button></>}>
      <p className="dx-tmsliq-help">Se quita {formatearImporte(dlg.cargo.monto, liq.moneda)} de la liquidación.</p></DialogoLiq>}
    {dlg?.tipo === 'quitar' && <DialogoLiq title={`Quitar ${dlg.linea.viaje?.codigo}`} subtitle="El viaje vuelve a «Por liquidar»." busy={busy} error={dlgError} onClose={() => setDlg(null)}
      footer={<><button type="button" className="dx-btn" onClick={() => setDlg(null)} disabled={busy}>Cancelar</button>
        <button type="button" className="dx-btn primary" disabled={busy} onClick={() => ejecutar(() => quitarViajeLiquidacion(id, dlg.linea.viaje_id), 'Viaje quitado.')}>Quitar viaje</button></>}>
      <p className="dx-tmsliq-help">Sus recargos y ajustes manuales en esta liquidación se pierden.</p></DialogoLiq>}
    {dlg?.tipo === 'agregar' && <FormAgregar liq={liq} empresaId={empresaId} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      onGuardar={ids => ejecutar(() => agregarViajesLiquidacion(id, ids), 'Viajes agregados.')} />}
    {dlg?.tipo === 'devolver' && <FormMotivo titulo="Devolver a borrador" subtitulo={liq.numero} boton="Devolver" busy={busy} error={dlgError}
      onClose={() => setDlg(null)} onGuardar={m => accion('devolver', { motivo: m }, 'Devuelta a borrador.')} />}
    {dlg?.tipo === 'anular' && <FormMotivo titulo="Anular liquidación" subtitulo={`${liq.numero} · sus viajes vuelven a «Por liquidar»`} boton="Anular" peligro
      busy={busy} error={dlgError} onClose={() => setDlg(null)} onGuardar={m => accion('anular', { motivo: m }, 'Liquidación anulada.')} />}
    {dlg?.tipo === 'conformidad' && <FormConformidad liq={liq} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      onGuardar={d => accion('conformidad', d, d.resultado === 'conforme' ? 'Conformidad registrada: liquidación aprobada.' : 'Observación registrada: vuelve a borrador.')} />}
    {dlg?.tipo === 'ventas' && <DialogoLiq title="Enviar a Ventas" subtitle={`${liq.numero} · ${formatearImporte(liq.total, liq.moneda)} con IGV`} busy={busy} error={dlgError} onClose={() => setDlg(null)}
      footer={<><button type="button" className="dx-btn" onClick={() => setDlg(null)} disabled={busy}>Cancelar</button>
        <button type="button" className="dx-btn primary" disabled={busy} onClick={() => accion('enviar_ventas', {}, 'Enviada a Ventas. La factura se emite desde allí.')}>{busy ? 'Enviando…' : 'Enviar a Ventas'}</button></>}>
      <p className="dx-tmsliq-help">Se crea una venta pendiente de facturar con una línea por viaje y los {etiquetaContador(liq.lineas.length, 'viaje')} pasan a «Cerrado». Necesitas permiso para crear ventas.</p></DialogoLiq>}
  </section>;
}

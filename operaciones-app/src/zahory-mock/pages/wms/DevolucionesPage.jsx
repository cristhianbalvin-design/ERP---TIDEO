import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cerrarDevolucion, listarDevoluciones, registrarDevolucion } from '../../../services/wmsMultipropositoService.js';
import { AvisoSoloLectura, Encabezado, PaginaPrevia } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import { formatoCantidad } from './wmsMultiLogic.js';
import {
  ORIGENES_DEVOLUCION, estadoDevolucion, resumenDevoluciones, textoContador, validarCierreInspeccion, validarLineasDevolucion,
} from './wmsPr2Logic.js';

const MOTIVOS = {
  cliente: ['Producto no conforme', 'Error de despacho', 'Producto dañado en transporte', 'Garantía', 'Otro'],
  taller: ['Sobrante de OT', 'Repuesto no utilizado', 'Repuesto equivocado', 'Otro'],
};
const R = <span className="dx-ui-required" aria-hidden="true">*</span>;
const vacio = { devoluciones: [], guias: [], ots: [] };

export function DevolucionesPage() {
  const base = useWmsBase();
  const { empresaId, permisos, puede, sesion, almacenes } = base;
  const [datos, setDatos] = useState(vacio);
  const [filtro, setFiltro] = useState('todas');
  const [seleccion, setSeleccion] = useState('');
  const [destino, setDestino] = useState({});
  const [form, setForm] = useState(null);
  const [erroresForm, setErroresForm] = useState({});
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [errorModal, setErrorModal] = useState('');
  const [aviso, setAviso] = useState('');
  const detalleRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try { setDatos(await listarDevoluciones({ empresa_id: empresaId })); }
    catch (e) { setError(mensajeError(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver]);
  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => resumenDevoluciones(datos.devoluciones), [datos.devoluciones]);
  const visibles = datos.devoluciones.filter(d => filtro === 'todas' || d.origen === filtro);
  const devolucion = datos.devoluciones.find(d => d.id === seleccion) || null;
  const cierre = devolucion ? validarCierreInspeccion(devolucion, destino) : { lineas: [], errores: {} };
  const documentos = form ? (form.origen === 'cliente' ? datos.guias : datos.ots) : [];
  const documento = documentos.find(d => d.id === form?.referencia_id) || null;
  const nombreAlmacen = id => { const a = almacenes.find(x => x.id === id); return a ? `${a.codigo} · ${a.nombre}` : 'Sin dato'; };

  const elegir = d => {
    setSeleccion(d.id); setError(''); setAviso('');
    setDestino(Object.fromEntries((d.lineas || []).map(l => [l.linea_id, { liberar: String(l.cantidad), merma: '0' }])));
    if (globalThis.window?.innerWidth <= 1100) requestAnimationFrame(() => detalleRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  };
  const cambiarDestino = (lineaId, campo, valor, total) => setDestino(actual => {
    const otro = campo === 'liberar' ? 'merma' : 'liberar';
    const n = Number(String(valor).replace(',', '.'));
    return { ...actual, [lineaId]: { ...actual[lineaId], [campo]: valor, ...(Number.isFinite(n) && n >= 0 && n <= total ? { [otro]: String(Math.round((total - n) * 100) / 100) } : {}) } };
  });

  const cerrar = async () => {
    if (Object.keys(cierre.errores).length) { setError('Revisa las cantidades de cada línea.'); return; }
    setOcupado(true); setError(''); setAviso('');
    try {
      const r = await cerrarDevolucion({ empresa_id: empresaId, devolucion_id: devolucion.id, lineas: cierre.lineas });
      setAviso(r?.nc_estado === 'pendiente' ? `Inspección cerrada. Administración verá ${devolucion.numero} para emitir la nota de crédito.` : `Inspección de ${devolucion.numero} cerrada.`);
      await cargar();
    } catch (e) { setError(mensajeError(e)); }
    finally { setOcupado(false); }
  };

  const abrirRegistro = () => { setErrorModal(''); setErroresForm({}); setAviso(''); setForm({ origen: 'cliente', referencia_id: '', motivo: MOTIVOS.cliente[0], observacion: '', cantidades: {} }); };
  const registrar = async e => {
    e.preventDefault();
    const errores = {};
    if (!form.referencia_id) errores.referencia_id = form.origen === 'cliente' ? 'Elige la guía de origen.' : 'Elige la OT.';
    const v = documento ? validarLineasDevolucion(documento, form.cantidades) : { lineas: [], errores: {} };
    Object.assign(errores, Object.fromEntries(Object.entries(v.errores).map(([k, m]) => [`linea_${k}`, m])));
    if (documento && !v.lineas.length && !Object.keys(v.errores).length) errores.lineas = 'Indica la cantidad devuelta de al menos un material.';
    setErroresForm(errores);
    if (Object.keys(errores).length) {
      const primero = Object.keys(errores)[0];
      requestAnimationFrame(() => globalThis.document?.querySelector('.ops-zahory-host')?.shadowRoot?.getElementById(primero === 'referencia_id' ? 'dx-wdev-doc' : primero.startsWith('linea_') ? `dx-wdev-${primero}` : 'dx-wdev-doc')?.focus());
      return;
    }
    setOcupado(true); setErrorModal('');
    try {
      const r = await registrarDevolucion({ empresa_id: empresaId, origen: form.origen, referencia_id: form.referencia_id, motivo: form.motivo, lineas: v.lineas, observacion: form.observacion.trim() || null });
      setForm(null); setAviso(`Devolución ${r?.numero} registrada: la mercadería está en cuarentena para inspección.`);
      await cargar();
      if (r?.id) setSeleccion(r.id);
    } catch (er) { setErrorModal(mensajeError(er)); }
    finally { setOcupado(false); }
  };

  const previo = estadoPrevio(base, { clase: 'dx-wdev', nombre: 'las devoluciones' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  const meta = devolucion ? ORIGENES_DEVOLUCION[devolucion.origen] : null;
  return <section className="dx-ui dx-wms dx-wdev">
    <Encabezado titulo="Devoluciones" sub="Lo que regresa al almacén entra a cuarentena para inspección; luego se libera a stock o se envía a merma.">
      {puede.crear && <button type="button" className="dx-btn primary" onClick={abrirRegistro}>Registrar devolución</button>}
    </Encabezado>
    <AvisoSoloLectura sesion={sesion} />
    {aviso && <div className="dx-w-note green" role="status">{aviso}</div>}
    {error && !devolucion && <div className="dx-w-note red" role="alert">{error}<button type="button" className="dx-btn sm" onClick={cargar}>Reintentar</button></div>}
    <div className="dx-ui-kpi-row">
      <div className="dx-ui-kpi"><strong>{resumen.inspeccion}</strong><span>En inspección</span></div>
      <div className="dx-ui-kpi"><strong>{resumen.ncPendiente}</strong><span>{resumen.ncPendiente === 1 ? 'Nota de crédito pendiente' : 'Notas de crédito pendientes'}</span></div>
      <div className="dx-ui-kpi"><strong>{resumen.cerradasMes}</strong><span>Cerradas este mes</span></div>
    </div>
    <div className="dx-w-side">
      <div className="dx-ui-card">
        <div className="dx-w-bar"><h2>Devoluciones</h2><span className="dx-ui-count">{textoContador(visibles.length, 'devolución', 'devoluciones')}</span>
          <div className="dx-w-seg" role="group" aria-label="Filtrar por origen">{[['todas', 'Todas'], ['cliente', 'Cliente'], ['taller', 'Taller']].map(([id, label]) => <button key={id} type="button" className={filtro === id ? 'on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</button>)}</div>
        </div>
        {cargando && !datos.devoluciones.length ? <div className="dx-ui-empty">Cargando devoluciones…</div>
          : !visibles.length ? <div className="dx-ui-empty">{datos.devoluciones.length ? 'No hay devoluciones con ese origen.' : 'Aún no hay devoluciones registradas.'}</div>
          : <div className="dx-w-scroll"><table className="dx-w-table">
            <thead><tr><th>Documento</th><th>Origen</th><th className="dx-w-hide-m">Desde</th><th className="num">Líneas</th><th>Estado</th></tr></thead>
            <tbody>{visibles.map(d => { const est = estadoDevolucion(d); return <tr key={d.id} className={`click${d.id === seleccion ? ' sel' : ''}`} tabIndex={0} role="button" aria-label={`Abrir ${d.numero}`} onClick={() => elegir(d)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(d); } }}>
              <td><b>{d.numero}</b></td>
              <td><span className={`dx-ui-pill ${ORIGENES_DEVOLUCION[d.origen].pill}`}><i />{ORIGENES_DEVOLUCION[d.origen].label}</span></td>
              <td className="wrap dx-w-hide-m">{d.origen === 'cliente' ? `Guía ${d.guia_numero || 'Sin dato'} · ${d.cliente || 'Sin dato'}` : `${d.ot_numero || 'Sin dato'} · ${d.motivo}`}</td>
              <td className="num">{(d.lineas || []).length}</td>
              <td><span className={`dx-ui-pill ${est.pill}`}><i />{est.label}</span></td>
            </tr>; })}</tbody>
          </table></div>}
      </div>
      <div className="dx-ui-card" ref={detalleRef}>
        {!devolucion ? <div className="dx-ui-empty">Selecciona una devolución para ver su inspección.</div> : <>
          <div className="dx-w-bar"><h2>{devolucion.numero}</h2><span className={`dx-ui-pill ${meta.pill}`}><i />{meta.label}</span></div>
          <div className="dx-w-sec">
            <div className="dx-w-flow" aria-label="Avance"><span className="done">Recibida</span><span className={devolucion.estado === 'en_inspeccion' ? 'cur' : 'done'}>Inspección</span><span className={devolucion.estado === 'cerrada' ? 'done' : ''}>Cerrada</span></div>
            <div className="dx-w-kv"><span>{devolucion.origen === 'cliente' ? 'Guía de origen' : 'OT de origen'}</span><b>{devolucion.origen === 'cliente' ? devolucion.guia_numero || 'Sin dato' : devolucion.ot_numero || 'Sin dato'}</b></div>
            {devolucion.cliente && <div className="dx-w-kv"><span>Cliente</span><b>{devolucion.cliente}</b></div>}
            <div className="dx-w-kv"><span>Motivo</span><b>{devolucion.motivo}</b></div>
            <div className="dx-w-kv"><span>Almacén · cuarentena</span><b>{nombreAlmacen(devolucion.almacen_id)} · {devolucion.ubicacion_cuarentena}</b></div>
            {devolucion.observacion && <div className="dx-w-kv"><span>Observación</span><b>{devolucion.observacion}</b></div>}
            {error && <div className="dx-w-note red" role="alert">{error}</div>}
            <h3 className="dx-w-gap-top">{devolucion.estado === 'en_inspeccion' ? 'Resultado de la inspección' : 'Resultado'}</h3>
            {devolucion.estado === 'en_inspeccion' && <p className="sub">Por línea: cuánto vuelve a stock (ubicación General) y cuánto va a merma.</p>}
            {(devolucion.lineas || []).map(l => devolucion.estado === 'en_inspeccion'
              ? <div key={l.linea_id} className="dx-w-insp">
                  <span><b>{l.codigo}</b><small>{l.descripcion} · {formatoCantidad(l.cantidad)} {l.unidad || ''}</small></span>
                  <label className="dx-ui-field"><span className="dx-ui-label">A stock</span><input className="dx-w-in" inputMode="decimal" value={destino[l.linea_id]?.liberar ?? ''} aria-invalid={Boolean(cierre.errores[l.linea_id])} onChange={e => cambiarDestino(l.linea_id, 'liberar', e.target.value, Number(l.cantidad))} disabled={!puede.crear} /></label>
                  <label className="dx-ui-field"><span className="dx-ui-label">Merma</span><input className="dx-w-in" inputMode="decimal" value={destino[l.linea_id]?.merma ?? ''} aria-invalid={Boolean(cierre.errores[l.linea_id])} onChange={e => cambiarDestino(l.linea_id, 'merma', e.target.value, Number(l.cantidad))} disabled={!puede.crear} /></label>
                  {cierre.errores[l.linea_id] && <small className="dx-ui-field-error">{cierre.errores[l.linea_id]}</small>}
                </div>
              : <div key={l.linea_id} className="dx-w-kv"><span>{l.codigo} · {l.descripcion}</span><b>{formatoCantidad(l.liberada)} a stock · {formatoCantidad(l.merma)} merma</b></div>)}
            {devolucion.estado === 'en_inspeccion' && devolucion.origen === 'cliente' && <div className="dx-w-note amber dx-w-gap-top">Al cerrar, Administración verá la devolución para emitir la nota de crédito al cliente.</div>}
            {devolucion.nc_estado === 'pendiente' && <div className="dx-w-note dx-w-gap-top">Nota de crédito pendiente de emisión en Administración.</div>}
            <div className="dx-w-tools">
              <button type="button" className="dx-btn" onClick={() => setSeleccion('')}>Cerrar panel</button>
              {devolucion.estado === 'en_inspeccion' && <button type="button" className="dx-btn primary" disabled={ocupado || !permisos.cargados || !sesion.permiteEscritura} onClick={cerrar}>{ocupado ? 'Cerrando…' : 'Cerrar inspección'}</button>}
            </div>
          </div>
        </>}
      </div>
    </div>

    {form && <div className="dx-w-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) setForm(null); }}>
      <form className="dx-w-modal is-wide" role="dialog" aria-modal="true" aria-labelledby="dx-wdev-nuevo-t" onSubmit={registrar} noValidate>
        <h3 id="dx-wdev-nuevo-t">Registrar devolución</h3>
        <div className="dx-ui-field"><span className="dx-ui-label">Origen{R}</span>
          <div className="dx-w-seg" role="group" aria-label="Origen">{Object.entries(ORIGENES_DEVOLUCION).map(([id, o]) => <button key={id} type="button" className={form.origen === id ? 'on' : ''} aria-pressed={form.origen === id} onClick={() => { setErroresForm({}); setForm({ ...form, origen: id, referencia_id: '', motivo: MOTIVOS[id][0], cantidades: {} }); }}>{id === 'cliente' ? 'Cliente (venta)' : `${o.label} (OT)`}</button>)}</div>
        </div>
        <div className="dx-ui-form-grid is-2">
          <div className="dx-ui-field"><label htmlFor="dx-wdev-doc">{form.origen === 'cliente' ? 'Guía de remisión' : 'Orden de trabajo'}{R}</label>
            <select id="dx-wdev-doc" value={form.referencia_id} aria-invalid={Boolean(erroresForm.referencia_id)} onChange={e => { setErroresForm({}); setForm({ ...form, referencia_id: e.target.value, cantidades: {} }); }}>
              <option value="">{documentos.length ? 'Selecciona' : form.origen === 'cliente' ? 'No hay guías de venta en los últimos 180 días' : 'No hay OT con despachos en los últimos 180 días'}</option>
              {documentos.map(d => <option key={d.id} value={d.id}>{d.numero}{d.cliente ? ` · ${d.cliente}` : ''}</option>)}
            </select>
            {erroresForm.referencia_id && <small className="dx-ui-field-error">{erroresForm.referencia_id}</small>}
          </div>
          <div className="dx-ui-field"><label htmlFor="dx-wdev-motivo">Motivo{R}</label>
            <select id="dx-wdev-motivo" value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })}>{MOTIVOS[form.origen].map(m => <option key={m} value={m}>{m}</option>)}</select>
          </div>
        </div>
        {documento && <div className="dx-ui-field"><span className="dx-ui-label">Materiales devueltos{R}</span>
          <table className="dx-w-table"><thead><tr><th>Material</th><th className="num">Despachado</th><th className="num">Devuelve</th></tr></thead>
            <tbody>{[...new Map((documento.lineas || []).map(l => [l.material_id, { ...l, cantidad: (documento.lineas || []).filter(x => x.material_id === l.material_id).reduce((t, x) => t + Number(x.cantidad), 0) }])).values()].map(l => <tr key={l.material_id}>
              <td className="mat"><b>{l.codigo}</b><small>{l.descripcion}</small></td><td className="num">{formatoCantidad(l.cantidad)}</td>
              <td className="num"><input id={`dx-wdev-linea_${l.material_id}`} className="dx-w-in" inputMode="decimal" placeholder="0" aria-label={`Cantidad devuelta de ${l.codigo}`} aria-invalid={Boolean(erroresForm[`linea_${l.material_id}`])} value={form.cantidades[l.material_id] ?? ''} onChange={e => setForm({ ...form, cantidades: { ...form.cantidades, [l.material_id]: e.target.value } })} />
                {erroresForm[`linea_${l.material_id}`] && <small className="dx-ui-field-error">{erroresForm[`linea_${l.material_id}`]}</small>}</td>
            </tr>)}</tbody></table>
          {erroresForm.lineas && <small className="dx-ui-field-error">{erroresForm.lineas}</small>}
        </div>}
        <div className="dx-ui-field"><label htmlFor="dx-wdev-obs">Observación</label><textarea id="dx-wdev-obs" maxLength={300} value={form.observacion} onChange={e => setForm({ ...form, observacion: e.target.value })} /></div>
        <p className="dx-ui-field-hint">Entra a la ubicación de cuarentena del almacén de origen, al costo promedio vigente.</p>
        {errorModal && <div className="dx-w-note red" role="alert">{errorModal}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setForm(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Registrando…' : 'Registrar devolución'}</button></div>
      </form>
    </div>}
  </section>;
}

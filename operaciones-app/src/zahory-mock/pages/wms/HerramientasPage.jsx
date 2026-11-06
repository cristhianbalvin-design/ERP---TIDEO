import { useCallback, useEffect, useMemo, useState } from 'react';
import { obtenerPrestamos, prestarHerramienta, recibirHerramienta } from '../../../services/wmsMultipropositoService.js';
import { fechaLocalISO } from '../fechaLocal.js';
import { AvisoSoloLectura, Encabezado, PaginaPrevia } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import { formatoCantidad } from './wmsMultiLogic.js';
import { estadoPrestamo, filtrarPrestamos, resumenPrestamos, textoContador, validarPrestamo } from './wmsPr2Logic.js';

const R = <span className="dx-ui-required" aria-hidden="true">*</span>;
const vacio = { prestamos: [], disponibles: [], personal: [], ots: [] };
const enDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return fechaLocalISO(d); };
const ESTADOS_RECEPCION = [['bueno', 'Buen estado (vuelve a stock)'], ['danado', 'Dañada (a cuarentena)'], ['perdido', 'Perdida (baja en kardex)']];

export function HerramientasPage() {
  const base = useWmsBase();
  const { empresaId, permisos, puede, sesion, config } = base;
  const [datos, setDatos] = useState(vacio);
  const [filtro, setFiltro] = useState('activos');
  const [texto, setTexto] = useState('');
  const [modal, setModal] = useState(null);
  const [errores, setErrores] = useState({});
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [errorModal, setErrorModal] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try { setDatos(await obtenerPrestamos({ empresa_id: empresaId })); }
    catch (e) { setError(mensajeError(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver]);
  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => resumenPrestamos(datos.prestamos, datos.disponibles), [datos]);
  const visibles = useMemo(() => filtrarPrestamos(datos.prestamos, { filtro, texto }), [datos.prestamos, filtro, texto]);
  const candidatos = useMemo(() => {
    if (!modal || modal.tipo !== 'prestar') return [];
    const q = (modal.busqueda || '').trim().toLowerCase();
    return datos.disponibles.filter(d => (modal.todos || d.es_herramienta) && (!q || `${d.codigo} ${d.descripcion} ${d.serie || ''}`.toLowerCase().includes(q))).slice(0, 50);
  }, [modal, datos.disponibles]);
  const elegido = modal?.tipo === 'prestar' ? datos.disponibles.find(d => d.stock_id === modal.stock_id) : null;

  const abrirPrestar = () => { setErrores({}); setErrorModal(''); setAviso(''); setModal({ tipo: 'prestar', stock_id: '', busqueda: '', todos: !datos.disponibles.some(d => d.es_herramienta), cantidad: '1', personal_id: '', ot_id: '', fecha_devolucion: enDias(3), observacion: '' }); };
  const abrirRecibir = p => { setErrores({}); setErrorModal(''); setAviso(''); setModal({ tipo: 'recibir', prestamo: p, cantidad: String(p.pendiente), estado: 'bueno', observacion: '' }); };

  const enfocar = id => requestAnimationFrame(() => globalThis.document?.querySelector('.ops-zahory-host')?.shadowRoot?.getElementById(id)?.focus());
  const prestar = async e => {
    e.preventDefault();
    const err = validarPrestamo(modal, elegido?.disponible);
    setErrores(err);
    if (Object.keys(err).length) { enfocar({ stock_id: 'dx-wher-buscar-h', cantidad: 'dx-wher-cant', personal_id: 'dx-wher-persona', fecha_devolucion: 'dx-wher-fecha' }[Object.keys(err)[0]]); return; }
    setOcupado(true); setErrorModal('');
    try {
      const r = await prestarHerramienta({ empresa_id: empresaId, stock_id: modal.stock_id, cantidad: Number(String(modal.cantidad).replace(',', '.')), personal_id: modal.personal_id, fecha_devolucion: modal.fecha_devolucion, ot_id: modal.ot_id || null, observacion: modal.observacion.trim() || null });
      const persona = datos.personal.find(p => p.id === modal.personal_id);
      setModal(null); setAviso(`Préstamo ${r?.numero} registrado: ${elegido?.codigo} a ${persona?.nombre || 'la persona elegida'}.`);
      await cargar();
    } catch (er) { setErrorModal(mensajeError(er)); }
    finally { setOcupado(false); }
  };
  const recibir = async e => {
    e.preventDefault();
    const q = Number(String(modal.cantidad).replace(',', '.'));
    if (!(q > 0) || q > Number(modal.prestamo.pendiente)) { setErrores({ cantidad: `Indica entre 1 y ${formatoCantidad(modal.prestamo.pendiente)}.` }); enfocar('dx-wher-rcant'); return; }
    setOcupado(true); setErrorModal(''); setErrores({});
    try {
      await recibirHerramienta({ empresa_id: empresaId, prestamo_id: modal.prestamo.id, cantidad: q, estado: modal.estado, observacion: modal.observacion.trim() || null });
      setModal(null); setAviso(`Devolución de ${modal.prestamo.codigo} registrada${modal.estado === 'danado' ? ' (a cuarentena)' : modal.estado === 'perdido' ? ' (baja por pérdida)' : ''}.`);
      await cargar();
    } catch (er) { setErrorModal(mensajeError(er)); }
    finally { setOcupado(false); }
  };

  const previo = estadoPrevio(base, { clase: 'dx-wher', nombre: 'los préstamos de herramientas' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  return <section className="dx-ui dx-wms dx-wher">
    <Encabezado titulo="Préstamo de herramientas" sub="La herramienta sigue siendo del almacén y conserva su valor; mientras está prestada no está disponible.">
      {puede.despachar && <button type="button" className="dx-btn primary" onClick={abrirPrestar}>Prestar herramienta</button>}
    </Encabezado>
    <AvisoSoloLectura sesion={sesion} />
    {!config.modulos.herramientas && <div className="dx-w-note amber" role="status">El módulo de préstamo de herramientas está apagado en Configuración del WMS.</div>}
    {aviso && <div className="dx-w-note green" role="status">{aviso}</div>}
    {error && <div className="dx-w-note red" role="alert">{error}<button type="button" className="dx-btn sm" onClick={cargar}>Reintentar</button></div>}
    <div className="dx-ui-kpi-row">
      <div className="dx-ui-kpi"><strong>{formatoCantidad(resumen.prestadas)}</strong><span>Prestadas</span></div>
      <div className="dx-ui-kpi"><strong>{resumen.vencidos}</strong><span>Con devolución vencida</span></div>
      <div className="dx-ui-kpi"><strong>{formatoCantidad(resumen.disponibles)}</strong><span>Herramientas disponibles</span></div>
    </div>
    <div className="dx-ui-card">
      <div className="dx-w-bar"><h2>Préstamos</h2><span className="dx-ui-count">{textoContador(visibles.length, 'préstamo', 'préstamos')}</span>
        <div className="dx-w-seg" role="group" aria-label="Filtrar préstamos">{[['activos', 'Activos'], ['vencidos', 'Vencidos'], ['devueltos', 'Devueltos']].map(([id, label]) => <button key={id} type="button" className={filtro === id ? 'on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</button>)}</div>
        <label className="dx-ui-search" htmlFor="dx-wher-buscar"><span aria-hidden="true">⌕</span><input id="dx-wher-buscar" placeholder="Buscar herramienta, persona u OT" value={texto} onChange={e => setTexto(e.target.value)} /></label>
      </div>
      {cargando && !datos.prestamos.length ? <div className="dx-ui-empty">Cargando préstamos…</div>
        : !visibles.length ? <div className="dx-ui-empty">{datos.prestamos.length ? 'No hay préstamos con ese filtro.' : 'Aún no hay préstamos. Usa «Prestar herramienta» para registrar el primero.'}</div>
        : <div className="dx-w-scroll"><table className="dx-w-table">
          <thead><tr><th>Herramienta</th><th className="num">Pendiente</th><th>Prestada a</th><th className="dx-w-hide-m">OT</th><th className="dx-w-hide-m">Desde</th><th>Devolver</th><th>Estado</th><th /></tr></thead>
          <tbody>{visibles.map(p => { const est = estadoPrestamo(p); return <tr key={p.id}>
            <td className="mat"><b>{p.codigo}</b><small>{p.descripcion}{p.serie ? ` · Serie ${p.serie}` : ''} · {p.numero}</small></td>
            <td className="num">{formatoCantidad(p.pendiente)} / {formatoCantidad(p.cantidad)}</td>
            <td>{p.personal || 'Sin dato'}<small>{p.personal_codigo || ''}</small></td>
            <td className="dx-w-hide-m">{p.ot_numero || 'Sin dato'}</td>
            <td className="dx-w-hide-m">{p.fecha_prestamo}</td>
            <td>{p.fecha_devolucion_prevista}</td>
            <td><span className={`dx-ui-pill ${est.pill}`}><i />{est.label}</span></td>
            <td>{p.estado === 'activo' && puede.despachar && <button type="button" className="dx-btn sm" onClick={() => abrirRecibir(p)}>Recibir</button>}</td>
          </tr>; })}</tbody>
        </table></div>}
    </div>

    {modal?.tipo === 'prestar' && <div className="dx-w-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) setModal(null); }}>
      <form className="dx-w-modal is-wide" role="dialog" aria-modal="true" aria-labelledby="dx-wher-p-t" onSubmit={prestar} noValidate>
        <h3 id="dx-wher-p-t">Prestar herramienta</h3>
        <div className="dx-ui-field"><label htmlFor="dx-wher-buscar-h">Herramienta{R}</label>
          <input id="dx-wher-buscar-h" type="search" placeholder="Busca por código, descripción o serie" value={modal.busqueda} aria-invalid={Boolean(errores.stock_id)} onChange={e => setModal({ ...modal, busqueda: e.target.value })} />
          <label className="dx-w-toggle"><input type="checkbox" className="dx-w-check" checked={modal.todos} onChange={e => setModal({ ...modal, todos: e.target.checked })} />Mostrar todo el stock, no solo herramientas</label>
          <div className="dx-w-scroll dx-w-pickbox" role="listbox" aria-label="Herramientas disponibles">
            {!candidatos.length ? <div className="dx-ui-empty">No hay herramientas disponibles con ese filtro.</div> : candidatos.map(d => <button type="button" role="option" aria-selected={modal.stock_id === d.stock_id} key={d.stock_id} className={`dx-w-opt${modal.stock_id === d.stock_id ? ' on' : ''}`} onClick={() => setModal({ ...modal, stock_id: d.stock_id, cantidad: d.serie ? '1' : modal.cantidad })}>
              <span><b>{d.codigo}</b><small>{d.descripcion}{d.serie ? ` · Serie ${d.serie}` : ''}</small></span><span className="num">{formatoCantidad(d.disponible)} {d.unidad || ''}<small>{d.almacen_codigo} · {d.ubicacion}</small></span>
            </button>)}
          </div>
          {errores.stock_id && <small className="dx-ui-field-error">{errores.stock_id}</small>}
        </div>
        <div className="dx-ui-form-grid is-2">
          <div className="dx-ui-field"><label htmlFor="dx-wher-persona">Prestada a{R}</label>
            <select id="dx-wher-persona" value={modal.personal_id} aria-invalid={Boolean(errores.personal_id)} onChange={e => setModal({ ...modal, personal_id: e.target.value })}><option value="">Selecciona a la persona</option>{datos.personal.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.codigo}</option>)}</select>
            {errores.personal_id && <small className="dx-ui-field-error">{errores.personal_id}</small>}
          </div>
          <div className="dx-ui-field"><label htmlFor="dx-wher-ot">OT</label>
            <select id="dx-wher-ot" value={modal.ot_id} onChange={e => setModal({ ...modal, ot_id: e.target.value })}><option value="">Sin OT</option>{datos.ots.map(o => <option key={o.id} value={o.id}>{o.numero}</option>)}</select>
          </div>
          <div className="dx-ui-field"><label htmlFor="dx-wher-cant">Cantidad{R}</label>
            <input id="dx-wher-cant" inputMode="decimal" value={modal.cantidad} disabled={Boolean(elegido?.serie)} aria-invalid={Boolean(errores.cantidad)} onChange={e => setModal({ ...modal, cantidad: e.target.value })} />
            {errores.cantidad ? <small className="dx-ui-field-error">{errores.cantidad}</small> : elegido && <small className="dx-ui-field-hint">Disponibles: {formatoCantidad(elegido.disponible)}</small>}
          </div>
          <div className="dx-ui-field"><label htmlFor="dx-wher-fecha">Devolver el{R}</label>
            <input id="dx-wher-fecha" type="date" min={fechaLocalISO()} value={modal.fecha_devolucion} aria-invalid={Boolean(errores.fecha_devolucion)} onChange={e => setModal({ ...modal, fecha_devolucion: e.target.value })} />
            {errores.fecha_devolucion && <small className="dx-ui-field-error">{errores.fecha_devolucion}</small>}
          </div>
        </div>
        <div className="dx-ui-field"><label htmlFor="dx-wher-obs">Observación</label><input id="dx-wher-obs" maxLength={200} value={modal.observacion} onChange={e => setModal({ ...modal, observacion: e.target.value })} /></div>
        {errorModal && <div className="dx-w-note red" role="alert">{errorModal}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setModal(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Registrando…' : 'Registrar préstamo'}</button></div>
      </form>
    </div>}

    {modal?.tipo === 'recibir' && <div className="dx-w-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) setModal(null); }}>
      <form className="dx-w-modal" role="dialog" aria-modal="true" aria-labelledby="dx-wher-r-t" onSubmit={recibir} noValidate>
        <h3 id="dx-wher-r-t">Recibir {modal.prestamo.codigo} de {modal.prestamo.personal || 'Sin dato'}</h3>
        <p className="dx-ui-field-hint">Indica en qué estado vuelve. Si vuelve dañada pasa a cuarentena; si se perdió se da de baja en el kardex.</p>
        <div className="dx-ui-form-grid is-2">
          <div className="dx-ui-field"><label htmlFor="dx-wher-rcant">Cantidad devuelta{R}</label>
            <input id="dx-wher-rcant" inputMode="decimal" value={modal.cantidad} aria-invalid={Boolean(errores.cantidad)} onChange={e => setModal({ ...modal, cantidad: e.target.value })} />
            {errores.cantidad ? <small className="dx-ui-field-error">{errores.cantidad}</small> : <small className="dx-ui-field-hint">Pendiente: {formatoCantidad(modal.prestamo.pendiente)}</small>}
          </div>
          <div className="dx-ui-field"><label htmlFor="dx-wher-restado">Estado{R}</label>
            <select id="dx-wher-restado" value={modal.estado} onChange={e => setModal({ ...modal, estado: e.target.value })}>{ESTADOS_RECEPCION.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          </div>
        </div>
        <div className="dx-ui-field"><label htmlFor="dx-wher-robs">Observación</label><input id="dx-wher-robs" maxLength={200} placeholder="Opcional" value={modal.observacion} onChange={e => setModal({ ...modal, observacion: e.target.value })} /></div>
        {errorModal && <div className="dx-w-note red" role="alert">{errorModal}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setModal(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Registrando…' : 'Registrar devolución'}</button></div>
      </form>
    </div>}
  </section>;
}

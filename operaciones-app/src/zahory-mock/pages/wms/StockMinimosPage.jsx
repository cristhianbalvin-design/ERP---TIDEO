import { useCallback, useEffect, useMemo, useState } from 'react';
import { crearSolpeInterna } from '../../../services/solpeService.js';
import { guardarParametrosStock, listarCentrosCostoActivos, listarStockMinimos } from '../../../services/wmsMultipropositoService.js';
import { AvisoSoloLectura, Encabezado, PaginaPrevia, SelectorAlmacen } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import {
  cantidadSugerida, coberturaMeses, estadoStock, formatoCantidad, formatoMoneda, itemsSolpe, resumenMinimos, validarParametros,
} from './wmsMultiLogic.js';

const clave = f => `${f.material_id}|${f.almacen_id}`;

export function StockMinimosPage() {
  const base = useWmsBase();
  const { empresaId, permisos, puede, almacenes, sesion } = base;
  const [almacenId, setAlmacenId] = useState('');
  const [filtro, setFiltro] = useState('alertas');
  const [texto, setTexto] = useState('');
  const [filas, setFilas] = useState([]);
  const [seleccion, setSeleccion] = useState(new Set());
  const [editando, setEditando] = useState(null);
  const [solpe, setSolpe] = useState(null);
  const [cecos, setCecos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [errorModal, setErrorModal] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try { setFilas(await listarStockMinimos({ empresa_id: empresaId, almacen_id: almacenId })); setSeleccion(new Set()); }
    catch (e) { setError(mensajeError(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver, almacenId]);
  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => resumenMinimos(filas), [filas]);
  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return filas.filter(f => {
      const est = estadoStock(f).id;
      if (filtro === 'alertas' && !['quiebre', 'bajo_minimo', 'reordenar'].includes(est)) return false;
      if (filtro === 'sin_parametro' && est !== 'sin_parametro') return false;
      return !q || `${f.codigo} ${f.descripcion} ${f.almacen_codigo}`.toLowerCase().includes(q);
    }).sort((a, b) => estadoStock(a).orden - estadoStock(b).orden || String(a.codigo).localeCompare(String(b.codigo), 'es'));
  }, [filas, filtro, texto]);
  const elegidas = filas.filter(f => seleccion.has(clave(f)) && cantidadSugerida(f) > 0);
  const almacenesPropios = almacenes.filter(a => a.proposito !== 'custodia');

  const alternar = f => setSeleccion(actual => { const n = new Set(actual); if (n.has(clave(f))) n.delete(clave(f)); else n.add(clave(f)); return n; });
  const seleccionarAlertas = () => setSeleccion(new Set(visibles.filter(f => cantidadSugerida(f) > 0).map(clave)));

  const guardarEdicion = async e => {
    e.preventDefault();
    const err = validarParametros(editando);
    if (err) { setErrorModal(err); return; }
    setOcupado(true); setErrorModal('');
    try {
      await guardarParametrosStock({ empresa_id: empresaId, filas: [{
        material_id: editando.material_id, almacen_id: editando.almacen_id,
        stock_minimo: Number(editando.stock_minimo) || 0, punto_reorden: Number(editando.punto_reorden) || 0,
        stock_maximo: Number(editando.stock_maximo) || 0, stock_seguridad: Number(editando.stock_seguridad) || 0,
        protegido_operaciones: Number(editando.protegido_operaciones) || 0,
      }] });
      setEditando(null); setAviso(`Parámetros de ${editando.codigo} guardados.`);
      await cargar();
    } catch (er) { setErrorModal(mensajeError(er)); }
    finally { setOcupado(false); }
  };

  const abrirSolpe = async () => {
    setErrorModal(''); setAviso('');
    setSolpe({ descripcion: `Reposición de stock · ${elegidas.length} materiales`, centro_costo_id: '' });
    try { setCecos(await listarCentrosCostoActivos({ empresa_id: empresaId })); } catch (e) { setErrorModal(mensajeError(e)); }
  };
  const generarSolpe = async e => {
    e.preventDefault();
    if (!solpe.centro_costo_id || !solpe.descripcion.trim()) { setErrorModal('La descripción y el centro de costo son obligatorios.'); return; }
    setOcupado(true); setErrorModal('');
    try {
      const items = itemsSolpe(elegidas).map((it, i) => ({
        id: `rep-${i + 1}`, material_id: it.material_id, material_codigo: it.codigo, descripcion: it.descripcion,
        cantidad: it.cantidad, unidad: it.unidad, observacion: 'Reposición por punto de reorden',
      }));
      const creada = await crearSolpeInterna({ empresaId, usuarioId: sesion.usuario?.id, datos: {
        descripcion: solpe.descripcion.trim(), tipo: 'bien', prioridad: 'normal', centro_costo_id: solpe.centro_costo_id, items,
      } });
      setSolpe(null); setSeleccion(new Set());
      setAviso(`SOLPE ${creada?.codigo || ''} creada con ${items.length} materiales. Compras la verá en su bandeja.`);
    } catch (er) { setErrorModal(mensajeError(er)); }
    finally { setOcupado(false); }
  };

  const previo = estadoPrevio(base, { clase: 'dx-wmin', nombre: 'los mínimos de stock' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  const num = (k, etiqueta) => <div className="dx-w-field"><label htmlFor={`dx-wmin-${k}`}>{etiqueta}</label><input id={`dx-wmin-${k}`} inputMode="decimal" value={editando[k]} onChange={e => setEditando({ ...editando, [k]: e.target.value })} /></div>;
  const almacenEditado = editando && almacenes.find(a => a.id === editando.almacen_id);

  return <section className="dx-ui dx-wms dx-wmin">
    <Encabezado titulo="Stock mínimos y reposición" sub="Mínimo, punto de reorden y máximo por material y almacén. Lo que cae bajo el reorden se repone con una SOLPE.">
      <SelectorAlmacen id="dx-wmin-almacen" almacenes={almacenesPropios} valor={almacenId} onCambio={setAlmacenId} />
      {puede.crear && <button type="button" className="dx-btn primary" disabled={!elegidas.length} onClick={abrirSolpe}>Generar SOLPE ({elegidas.length})</button>}
    </Encabezado>
    <AvisoSoloLectura sesion={sesion} />
    {aviso && <div className="dx-w-note green" role="status">{aviso}</div>}
    {error && <div className="dx-w-note red" role="alert">{error}<button type="button" className="dx-btn sm" onClick={cargar}>Reintentar</button></div>}
    <div className="dx-ui-summary">
      <div className="dx-ui-chip"><b>{resumen.quiebre}</b><span>En quiebre</span></div>
      <div className="dx-ui-chip"><b>{resumen.bajo_minimo}</b><span>Bajo mínimo</span></div>
      <div className="dx-ui-chip"><b>{resumen.reordenar}</b><span>Por reordenar</span></div>
      <div className="dx-ui-chip"><b>{resumen.sin_parametro}</b><span>Sin parámetro</span></div>
      <div className="dx-ui-chip"><b>{formatoMoneda(resumen.valor_sugerido)}</b><span>Reposición sugerida</span></div>
    </div>
    <div className="dx-ui-card">
      <div className="dx-w-bar">
        <h2>Materiales</h2>
        <div className="dx-w-seg" role="group" aria-label="Filtrar por estado">
          {[['alertas', 'Alertas'], ['sin_parametro', 'Sin parámetro'], ['todos', 'Todos']].map(([id, label]) => <button key={id} type="button" className={filtro === id ? 'on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</button>)}
        </div>
        <label className="dx-ui-search" htmlFor="dx-wmin-buscar"><span aria-hidden="true">⌕</span><input id="dx-wmin-buscar" placeholder="Buscar material o almacén" value={texto} onChange={e => setTexto(e.target.value)} /></label>
        {puede.crear && visibles.some(f => cantidadSugerida(f) > 0) && <button type="button" className="dx-btn sm" onClick={seleccionarAlertas}>Seleccionar sugeridos</button>}
      </div>
      {cargando && !filas.length ? <div className="dx-ui-empty">Cargando stock…</div>
        : !visibles.length ? <div className="dx-ui-empty">{filtro === 'alertas' ? 'Ningún material está bajo su punto de reorden.' : 'No hay materiales para mostrar.'}</div>
        : <div className="dx-w-scroll"><table className="dx-w-table">
          <thead><tr>{puede.crear && <th aria-label="Seleccionar" />}<th>Material</th><th>Estado</th><th className="num">Disponible</th><th className="num">Mínimo</th><th className="num">Reorden</th><th className="num dx-w-hide-m">Máximo</th><th className="num dx-w-hide-m">Protegido OT</th><th className="num dx-w-hide-m">Consumo/mes</th><th className="num dx-w-hide-m">Cobertura</th><th className="num">Sugerido</th>{puede.editar && <th />}</tr></thead>
          <tbody>{visibles.map(f => {
            const est = estadoStock(f); const sug = cantidadSugerida(f); const cob = coberturaMeses(f);
            return <tr key={clave(f)}>
              {puede.crear && <td><input type="checkbox" className="dx-w-check" aria-label={`Seleccionar ${f.codigo}`} disabled={!sug} checked={seleccion.has(clave(f))} onChange={() => alternar(f)} /></td>}
              <td className="mat"><b>{f.codigo}</b><small>{f.descripcion} · {f.almacen_codigo}</small></td>
              <td><span className={`dx-ui-pill ${est.pill}`}><i />{est.label}</span></td>
              <td className="num">{formatoCantidad(f.disponible)} {f.unidad || ''}</td>
              <td className="num">{formatoCantidad(f.stock_minimo)}</td>
              <td className="num">{formatoCantidad(f.punto_reorden)}</td>
              <td className="num dx-w-hide-m">{formatoCantidad(f.stock_maximo)}</td>
              <td className="num dx-w-hide-m">{f.proposito === 'mixto' ? formatoCantidad(f.protegido_operaciones) : '—'}</td>
              <td className="num dx-w-hide-m">{formatoCantidad(f.consumo_mes)}</td>
              <td className="num dx-w-hide-m">{cob === null ? '—' : `${cob} meses`}</td>
              <td className="num"><b>{sug ? formatoCantidad(sug) : '—'}</b></td>
              {puede.editar && <td><button type="button" className="dx-btn sm" onClick={() => { setErrorModal(''); setEditando({ ...f }); }}>Editar</button></td>}
            </tr>;
          })}</tbody>
        </table></div>}
    </div>

    {editando && <div className="dx-w-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) setEditando(null); }}>
      <form className="dx-w-modal" role="dialog" aria-modal="true" aria-labelledby="dx-wmin-edit-t" onSubmit={guardarEdicion}>
        <h3 id="dx-wmin-edit-t">{editando.codigo} · {editando.almacen_codigo}</h3>
        <p className="dx-ui-sub">{editando.descripcion}. Disponible: {formatoCantidad(editando.disponible)} {editando.unidad || ''}.</p>
        <div className="dx-w-two">{num('stock_minimo', 'Stock mínimo')}{num('punto_reorden', 'Punto de reorden')}</div>
        <div className="dx-w-two">{num('stock_maximo', 'Stock máximo')}{num('stock_seguridad', 'Stock de seguridad')}</div>
        {almacenEditado?.proposito === 'mixto' && <>{num('protegido_operaciones', 'Protegido para operaciones')}<p className="dx-ui-sub">Cantidad que los pedidos de venta no pueden reservar en este almacén mixto.</p></>}
        {errorModal && <div className="dx-w-note red" role="alert">{errorModal}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setEditando(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar parámetros'}</button></div>
      </form>
    </div>}

    {solpe && <div className="dx-w-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) setSolpe(null); }}>
      <form className="dx-w-modal" role="dialog" aria-modal="true" aria-labelledby="dx-wmin-solpe-t" onSubmit={generarSolpe}>
        <h3 id="dx-wmin-solpe-t">Generar SOLPE de reposición</h3>
        <div className="dx-w-field"><label htmlFor="dx-wmin-solpe-desc">Descripción</label><input id="dx-wmin-solpe-desc" maxLength={200} value={solpe.descripcion} onChange={e => setSolpe({ ...solpe, descripcion: e.target.value })} /></div>
        <div className="dx-w-field"><label htmlFor="dx-wmin-solpe-ceco">Centro de costo</label><select id="dx-wmin-solpe-ceco" value={solpe.centro_costo_id} onChange={e => setSolpe({ ...solpe, centro_costo_id: e.target.value })}><option value="">Selecciona un centro de costo</option>{cecos.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}</select></div>
        <table className="dx-w-table"><thead><tr><th>Material</th><th className="num">Cantidad</th></tr></thead><tbody>{itemsSolpe(elegidas).map(it => <tr key={`${it.material_id}|${it.almacen_id}`}><td><b>{it.codigo}</b><small>{it.descripcion}</small></td><td className="num">{formatoCantidad(it.cantidad)} {it.unidad}</td></tr>)}</tbody></table>
        {errorModal && <div className="dx-w-note red" role="alert">{errorModal}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setSolpe(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Creando…' : 'Crear SOLPE'}</button></div>
      </form>
    </div>}
  </section>;
}

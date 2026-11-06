import { useCallback, useEffect, useMemo, useState } from 'react';
import { guardarProductoCatalogo, obtenerCatalogoVenta } from '../../../services/wmsMultipropositoService.js';
import { AvisoSoloLectura, PaginaPrevia } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import { formatoCantidad, formatoMoneda } from './wmsMultiLogic.js';
import { textoContador } from './wmsPr2Logic.js';
import {
  bajoCosto, buscarMateriales, filtrarCatalogo, formatoPct, margenProducto, payloadProducto, resumenCatalogo, validarProductoCatalogo,
} from './catalogoVentaLogic.js';

const VACIO = { items: [], materiales: [], puede_crear: false, puede_editar: false };
const enfocar = id => requestAnimationFrame(() => globalThis.document?.querySelector('.ops-zahory-host')?.shadowRoot?.getElementById(id)?.focus());

function BuscadorMaterial({ materiales, valor, onElegir, error }) {
  const [texto, setTexto] = useState(valor ? `${valor.codigo} · ${valor.descripcion}` : '');
  const [abierto, setAbierto] = useState(false);
  const resultados = useMemo(() => (valor && texto === `${valor.codigo} · ${valor.descripcion}` ? [] : buscarMateriales(materiales, texto)), [materiales, texto, valor]);
  const elegir = m => { if (m.en_catalogo) return; onElegir(m); setTexto(`${m.codigo} · ${m.descripcion}`); setAbierto(false); };
  return <div className="dx-ui-field dx-wcat-buscar">
    <label htmlFor="dx-wcat-mat">Material<span className="dx-ui-required" aria-hidden="true">*</span></label>
    <input id="dx-wcat-mat" type="search" autoComplete="off" placeholder="Busca por código o descripción" value={texto}
      role="combobox" aria-expanded={abierto && resultados.length > 0} aria-controls="dx-wcat-mat-lista"
      aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'dx-wcat-mat-err' : undefined}
      onChange={e => { setTexto(e.target.value); setAbierto(true); if (valor) onElegir(null); }}
      onKeyDown={e => { if (e.key === 'Escape') setAbierto(false); }} />
    {abierto && resultados.length > 0 && <div className="dx-wcat-pop" id="dx-wcat-mat-lista" role="listbox" aria-label="Materiales">
      {resultados.map(m => <button key={m.material_id} type="button" role="option" aria-selected={false} disabled={m.en_catalogo} onClick={() => elegir(m)}>
        <span><b>{m.codigo}</b> {m.descripcion}</span>
        <small>{m.en_catalogo ? 'Ya está en el catálogo' : `${formatoCantidad(m.disponible)} ${m.unidad || ''} · costo ${formatoMoneda(m.costo_promedio)}`}</small>
      </button>)}
    </div>}
    {abierto && texto.trim().length >= 2 && !resultados.length && !valor && <small className="dx-ui-field-hint">Sin materiales que coincidan.</small>}
    {error && <small className="dx-ui-field-error" id="dx-wcat-mat-err" role="alert">{error}</small>}
  </div>;
}

// Formulario de alta y edición; también lo usa Admin (Nueva OV) mediante su propio componente.
function ModalProducto({ empresaId, producto, materiales, onCerrar, onGuardado }) {
  const nuevo = !producto;
  const [f, setF] = useState(() => (nuevo
    ? { material: null, precio_lista: '', moneda: 'PEN', descuento_maximo_pct: '', activo: true }
    : { material: null, precio_lista: String(producto.precio_lista ?? ''), moneda: producto.moneda || 'PEN', descuento_maximo_pct: String(Number(producto.descuento_maximo_pct || 0)), activo: producto.activo !== false }));
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cambiar = (campo, valor) => { setF(a => ({ ...a, [campo]: valor })); setErrores(a => ({ ...a, [campo]: undefined })); setErrorServidor(''); };
  const base = nuevo ? f.material : producto;
  const vista = base ? { precio_lista: Number(String(f.precio_lista).replace(',', '.')) || 0, costo_promedio: base.costo_promedio, moneda: f.moneda } : null;
  const margen = vista ? margenProducto(vista) : null;
  const aviso = vista && Number(vista.precio_lista) > 0 && bajoCosto(vista);
  const err = c => errores[c] ? <small className="dx-ui-field-error" id={`dx-wcat-${c}-err`} role="alert">{errores[c]}</small> : null;
  const inv = c => (errores[c] ? { 'aria-invalid': 'true', 'aria-describedby': `dx-wcat-${c}-err` } : {});

  const guardar = async e => {
    e.preventDefault();
    const encontrados = validarProductoCatalogo(f, { nuevo });
    setErrores(encontrados);
    const primero = [['material', 'dx-wcat-mat'], ['precio_lista', 'dx-wcat-precio'], ['moneda', 'dx-wcat-moneda'], ['descuento_maximo_pct', 'dx-wcat-desc']].find(([k]) => encontrados[k]);
    if (primero) { enfocar(primero[1]); return; }
    setOcupado(true); setErrorServidor('');
    try {
      const guardado = await guardarProductoCatalogo({ empresa_id: empresaId, id: producto?.id || null, ...payloadProducto(nuevo ? f : { ...f, material: { material_id: producto.material_id } }) });
      onGuardado(guardado, nuevo);
    } catch (ex) { setErrorServidor(mensajeError(ex)); }
    finally { setOcupado(false); }
  };

  return <div className="dx-w-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
    <form className="dx-w-modal" role="dialog" aria-modal="true" aria-labelledby="dx-wcat-t" onSubmit={guardar} noValidate>
      <h3 id="dx-wcat-t">{nuevo ? 'Agregar producto al catálogo' : `Editar ${producto.codigo}`}</h3>
      <p className="dx-ui-sub">{nuevo ? 'Elige un material del maestro y fija su precio de venta.' : producto.descripcion}</p>
      {nuevo && <BuscadorMaterial materiales={materiales} valor={f.material} error={errores.material} onElegir={m => cambiar('material', m)} />}
      <div className="dx-ui-form-grid">
        <div className="dx-ui-field"><label htmlFor="dx-wcat-precio">Precio de lista<span className="dx-ui-required" aria-hidden="true">*</span></label>
          <input id="dx-wcat-precio" inputMode="decimal" value={f.precio_lista} {...inv('precio_lista')} onChange={e => cambiar('precio_lista', e.target.value)} />{err('precio_lista')}</div>
        <div className="dx-ui-field"><label htmlFor="dx-wcat-moneda">Moneda<span className="dx-ui-required" aria-hidden="true">*</span></label>
          <select id="dx-wcat-moneda" className="dx-ui-select" value={f.moneda} {...inv('moneda')} onChange={e => cambiar('moneda', e.target.value)}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select>{err('moneda')}</div>
        <div className="dx-ui-field"><label htmlFor="dx-wcat-desc">Descuento máximo %</label>
          <input id="dx-wcat-desc" inputMode="decimal" value={f.descuento_maximo_pct} {...inv('descuento_maximo_pct')} onChange={e => cambiar('descuento_maximo_pct', e.target.value)} />
          {err('descuento_maximo_pct') || <small className="dx-ui-field-hint">Tope al vender. Vacío = 0.</small>}</div>
      </div>
      {!nuevo && <label className="dx-w-toggle dx-w-gap-top"><input type="checkbox" className="dx-w-check" checked={f.activo} onChange={e => cambiar('activo', e.target.checked)} />Activo (se puede elegir en las órdenes de venta)</label>}
      {base && <div className="dx-wcat-resumen">
        <div><span>Costo promedio</span><b>{formatoMoneda(base.costo_promedio)}</b></div>
        <div><span>Margen</span><b>{f.moneda === 'PEN' ? formatoPct(margen) : 'Sin dato'}</b></div>
        <div><span>Disponible</span><b>{formatoCantidad(base.disponible)} {base.unidad || ''}</b></div>
      </div>}
      {f.moneda === 'USD' && base && <p className="dx-ui-field-hint">El costo está en soles: el margen se calcula solo con precio en soles.</p>}
      {aviso && <div className="dx-w-note amber" role="status">Aviso: el precio queda por debajo del costo promedio. Se puede guardar igual.</div>}
      {errorServidor && <div className="dx-w-note red" role="alert">{errorServidor}</div>}
      <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
        <button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Guardando…' : nuevo ? 'Agregar al catálogo' : 'Guardar cambios'}</button></div>
    </form>
  </div>;
}

export function CatalogoVentaPage() {
  const base = useWmsBase();
  const { empresaId, permisos, sesion } = base;
  const [datos, setDatos] = useState(VACIO);
  const [filtro, setFiltro] = useState('activos');
  const [texto, setTexto] = useState('');
  const [modal, setModal] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try { setDatos(await obtenerCatalogoVenta({ empresa_id: empresaId })); }
    catch (e) { setError(mensajeError(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver]);
  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => resumenCatalogo(datos.items), [datos.items]);
  const visibles = useMemo(() => filtrarCatalogo(datos.items, { filtro, texto }), [datos.items, filtro, texto]);
  const escritura = Boolean(sesion.permiteEscritura);
  const puedeCrear = datos.puede_crear && escritura;
  const puedeEditar = datos.puede_editar && escritura;

  const previo = estadoPrevio(base, { clase: 'dx-wcat', nombre: 'el catálogo de venta' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  const abrir = p => { if (!puedeEditar) return; setAviso(''); setModal({ producto: p }); };

  return <section className="dx-ui dx-wms dx-wcat">
    <header className="dx-ui-head-page">
      <div><div className="dx-ui-eyebrow">Venta de repuestos</div><h1 className="dx-ui-title">Catálogo de venta</h1>
        <p className="dx-ui-sub">Productos que se pueden vender en una orden de venta. Cada uno sale de un material del almacén, con su precio de lista.</p></div>
      {puedeCrear && <div className="dx-ui-actions"><button type="button" className="dx-btn primary" onClick={() => { setAviso(''); setModal({ producto: null }); }}>+ Agregar producto</button></div>}
    </header>
    <AvisoSoloLectura sesion={sesion} />
    {aviso && <div className="dx-w-note green" role="status">{aviso}</div>}
    {error && <div className="dx-w-note red" role="alert">{error}<button type="button" className="dx-btn sm" onClick={cargar}>Reintentar</button></div>}
    <div className="dx-ui-kpi-row">
      <div className="dx-ui-kpi"><strong>{resumen.activos}</strong><span>{resumen.activos === 1 ? 'Producto activo' : 'Productos activos'}</span></div>
      <div className="dx-ui-kpi"><strong>{resumen.sinStock}</strong><span>Sin stock disponible</span></div>
      <div className="dx-ui-kpi"><strong>{resumen.bajoCosto}</strong><span>Precio bajo el costo</span></div>
      <div className="dx-ui-kpi"><strong>{formatoPct(resumen.margenPromedio)}</strong><span>Margen promedio (soles)</span></div>
    </div>
    <div className="dx-ui-card">
      <div className="dx-w-bar">
        <h2>Productos</h2>
        <span className="dx-ui-count">{textoContador(visibles.length, 'producto', 'productos')}</span>
        <div className="dx-w-seg" role="group" aria-label="Filtrar productos">
          {[['activos', 'Activos'], ['inactivos', 'Inactivos'], ['todos', 'Todos']].map(([id, label]) => <button key={id} type="button" className={filtro === id ? 'on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</button>)}
        </div>
        <label className="dx-ui-search" htmlFor="dx-wcat-q"><span aria-hidden="true">⌕</span><input id="dx-wcat-q" aria-label="Buscar en el catálogo" placeholder="Código o descripción" value={texto} onChange={e => setTexto(e.target.value)} /></label>
      </div>
      {cargando && !datos.items.length ? <div className="dx-ui-empty">Cargando catálogo…</div>
        : !visibles.length ? <div className="dx-ui-empty">{!datos.items.length
          ? 'Aún no hay productos en el catálogo de venta. Agrega el primero para poder vender desde el almacén.'
          : filtro === 'inactivos' ? 'No hay productos inactivos.' : 'Sin coincidencias para tu búsqueda.'}</div>
        : <div className="dx-w-scroll"><table className="dx-w-table">
          <thead><tr><th>Producto</th><th className="num">Precio lista</th><th className="num dx-w-hide-m">Costo promedio</th><th className="num dx-w-hide-m">Margen</th><th className="num">Disponible</th><th>Estado</th></tr></thead>
          <tbody>{visibles.map(p => {
            const m = margenProducto(p);
            const estado = p.activo === false ? ['is-gray', 'Inactivo'] : bajoCosto(p) ? ['is-amber', 'Bajo el costo'] : !(Number(p.disponible) > 0) ? ['is-red', 'Sin stock'] : ['is-green', 'Activo'];
            return <tr key={p.id} className={puedeEditar ? 'dx-wcat-row' : undefined} role={puedeEditar ? 'button' : undefined} tabIndex={puedeEditar ? 0 : undefined}
              aria-label={puedeEditar ? `Editar ${p.codigo}` : undefined}
              onClick={() => abrir(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(p); } }}>
              <td className="mat"><b>{p.codigo}</b><small>{p.descripcion} · {p.unidad || 'Sin dato'}</small></td>
              <td className="num">{formatoMoneda(p.precio_lista, p.moneda)}</td>
              <td className="num dx-w-hide-m">{formatoMoneda(p.costo_promedio)}</td>
              <td className="num dx-w-hide-m">{formatoPct(m)}</td>
              <td className="num">{formatoCantidad(p.disponible)} {p.unidad || ''}</td>
              <td><span className={`dx-ui-pill ${estado[0]}`}><i />{estado[1]}</span></td>
            </tr>;
          })}</tbody>
        </table></div>}
      {datos.items.length > 0 && <p className="dx-ui-sub dx-wcat-pie">Los productos no se borran: se desactivan, y las órdenes de venta antiguas los siguen mostrando.</p>}
    </div>
    {modal && <ModalProducto empresaId={empresaId} producto={modal.producto} materiales={datos.materiales}
      onCerrar={() => setModal(null)}
      onGuardado={async (g, nuevo) => { setModal(null); setAviso(nuevo ? `${g?.codigo || 'Producto'} agregado al catálogo.` : `${g?.codigo || 'Producto'} actualizado.`); await cargar(); }} />}
  </section>;
}

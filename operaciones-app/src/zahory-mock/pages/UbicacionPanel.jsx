import { useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaTipoUbicacion, USOS_UBICACION, validarFormularioUbicacion } from './ubicacionesLogic.js';

const TIPOS_NUEVOS = ['zona', 'rack', 'posicion', 'piso'];

export function UbicacionPanel({ almacen, ubicaciones, ubicacion = null, onClose, onSave }) {
  const esNueva = !ubicacion;
  const [form, setForm] = useState(() => ({ modo: esNueva ? 'nuevo' : 'editar', id: ubicacion?.id, almacen_id: almacen.id,
    tipo: ubicacion?.tipo || 'zona', padre_id: ubicacion?.padre_id || '', uso: ubicacion?.uso || 'almacenaje', codigo: ubicacion?.codigo || '', nombre: ubicacion?.nombre || '', errorServidor: '' }));
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const panelRef = useRef(null);
  const segmentoRef = useRef(null);
  const primeroRef = useRef(null);
  const ubicacionesActivas = ubicaciones.filter(item => item.almacen_id === almacen.id && item.activo !== false);
  const zonas = ubicacionesActivas.filter(item => item.tipo === 'zona');
  const racks = ubicacionesActivas.filter(item => item.tipo === 'rack');
  const padre = ubicaciones.find(item => item.id === form.padre_id);
  const ruta = useMemo(() => [almacen.nombre, ...(padre ? [padre.nombre] : []), form.nombre || '…'].join(' › '), [almacen.nombre, padre, form.nombre]);

  useEffect(() => { primeroRef.current?.focus(); }, []);
  const cambia = (campo, valor) => { setForm(actual => ({ ...actual, [campo]: valor, errorServidor: '' })); setErrores(actual => ({ ...actual, [campo]: '' })); };
  const elegirTipo = tipo => setForm(actual => ({ ...actual, tipo, padre_id: '', errorServidor: '' }));
  const moverTipo = evento => {
    const paso = evento.key === 'ArrowRight' || evento.key === 'ArrowDown' ? 1 : evento.key === 'ArrowLeft' || evento.key === 'ArrowUp' ? -1 : 0;
    const actual = TIPOS_NUEVOS.indexOf(form.tipo);
    const indice = evento.key === 'Home' ? 0 : evento.key === 'End' ? TIPOS_NUEVOS.length - 1 : (actual + paso + TIPOS_NUEVOS.length) % TIPOS_NUEVOS.length;
    if (paso || evento.key === 'Home' || evento.key === 'End') {
      evento.preventDefault(); elegirTipo(TIPOS_NUEVOS[indice]);
      requestAnimationFrame(() => segmentoRef.current?.querySelector(`[data-tipo="${TIPOS_NUEVOS[indice]}"]`)?.focus());
    }
  };
  const enviar = async evento => {
    evento.preventDefault();
    if (guardando) return;
    const validacion = validarFormularioUbicacion(form, ubicaciones);
    setErrores(validacion);
    if (Object.keys(validacion).length) {
      requestAnimationFrame(() => panelRef.current?.querySelector(`#${validacion.padre ? 'ubi-padre' : validacion.codigo ? 'ubi-codigo' : 'ubi-nombre'}`)?.focus());
      return;
    }
    setGuardando(true);
    try { await onSave({ ...form, codigo: form.codigo.trim(), nombre: form.nombre.trim(), padre_id: form.padre_id || null }); }
    catch (error) { setForm(actual => ({ ...actual, errorServidor: error?.code === '23505' ? 'Ya existe una ubicación con ese código en este almacén.' : error?.message || 'No se pudo guardar la ubicación.' })); }
    finally { setGuardando(false); }
  };
  const atrapaTab = evento => {
    if (evento.key === 'Escape') { evento.stopPropagation(); onClose(); return; }
    if (evento.key !== 'Tab') return;
    const focuseables = [...(panelRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || [])];
    if (!focuseables.length) return;
    const primero = focuseables[0]; const ultimo = focuseables[focuseables.length - 1];
    if (evento.shiftKey && document.activeElement === primero) { evento.preventDefault(); ultimo.focus(); }
    else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primero.focus(); }
  };
  const opcionPadre = item => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>;
  return <div className="dx-ubicaciones-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget) onClose(); }}>
    <section ref={panelRef} className="dx-ubicaciones-dialog" role="dialog" aria-modal="true" aria-labelledby="dx-ubicaciones-panel-titulo" onKeyDown={atrapaTab}>
      <header><h2 id="dx-ubicaciones-panel-titulo">{esNueva ? 'Nueva ubicación' : 'Editar ubicación'}</h2><button type="button" className="dx-ubicaciones-x" aria-label="Cerrar" onClick={onClose}>×</button></header>
      <form className="dx-ubicaciones-panel-form" onSubmit={enviar}>
        <div className="dx-ubicaciones-panel-body">
          {form.errorServidor && <div className="dx-ubicaciones-alert" role="alert">{form.errorServidor}</div>}
          <div className="dx-ubicaciones-campo"><label>Almacén</label><div className="dx-ubicaciones-readonly">{almacen.nombre}</div></div>
          <div className="dx-ubicaciones-campo"><span id="dx-ubicaciones-tipo-label">Tipo</span>{esNueva
            ? <><div ref={segmentoRef} className="dx-ubicaciones-segmento" role="radiogroup" aria-labelledby="dx-ubicaciones-tipo-label" onKeyDown={moverTipo}>{TIPOS_NUEVOS.map((tipo, indice) => <button key={tipo} ref={indice === 0 ? primeroRef : undefined} data-tipo={tipo} type="button" role="radio" tabIndex={form.tipo === tipo ? 0 : -1} aria-checked={form.tipo === tipo} className={form.tipo === tipo ? 'on' : ''} onClick={() => elegirTipo(tipo)}>{etiquetaTipoUbicacion(tipo)}</button>)}</div><small>Zona › rack › posición. Una posición también puede ir directo en una zona, y un piso es un área en el suelo dentro de una zona.</small></>
            : <><div className="dx-ubicaciones-readonly">{etiquetaTipoUbicacion(form.tipo)}</div><small>El tipo y la ubicación padre no se cambian una vez creada.</small></>}</div>
          {esNueva && form.tipo !== 'zona' && <div className="dx-ubicaciones-campo"><label htmlFor="ubi-padre">{form.tipo === 'posicion' ? 'Rack o zona donde está' : 'Zona a la que pertenece'}</label><select id="ubi-padre" ref={!primeroRef.current && form.tipo !== 'zona' ? primeroRef : undefined} value={form.padre_id} aria-invalid={Boolean(errores.padre)} aria-describedby={errores.padre ? 'ubi-padre-error' : undefined} onChange={evento => cambia('padre_id', evento.target.value)}><option value="">Selecciona…</option>{form.tipo === 'posicion' ? <><optgroup label="Racks">{racks.map(opcionPadre)}</optgroup><optgroup label="Zonas (posición sin rack)">{zonas.map(opcionPadre)}</optgroup></> : zonas.map(opcionPadre)}</select>{errores.padre && <small className="bad" id="ubi-padre-error">{errores.padre}</small>}</div>}
          {!esNueva && <div className="dx-ubicaciones-campo"><label>Ubicada en</label><div className="dx-ubicaciones-readonly">{padre?.nombre || almacen.nombre}</div></div>}
          <div className="dx-ubicaciones-campo"><label htmlFor="ubi-uso">Uso</label><select id="ubi-uso" ref={!esNueva ? primeroRef : undefined} value={form.uso} onChange={evento => cambia('uso', evento.target.value)}>{Object.entries(USOS_UBICACION).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}</select><small>Ayuda a ordenar y filtrar el mapa. Por ahora no cambia la disponibilidad del stock.</small></div>
          <div className="dx-ubicaciones-campo"><label htmlFor="ubi-codigo">Código</label><input id="ubi-codigo" ref={esNueva && form.tipo === 'zona' ? primeroRef : undefined} value={form.codigo} maxLength={30} placeholder="Ej. Z-A-R03" aria-invalid={Boolean(errores.codigo)} aria-describedby={errores.codigo ? 'ubi-codigo-error' : 'ubi-codigo-ayuda'} onChange={evento => cambia('codigo', evento.target.value)} />{errores.codigo ? <small id="ubi-codigo-error" className="bad">{errores.codigo}</small> : <small id="ubi-codigo-ayuda">Único dentro del almacén. Es lo que se ve en etiquetas y reportes.</small>}</div>
          <div className="dx-ubicaciones-campo"><label htmlFor="ubi-nombre">Nombre</label><input id="ubi-nombre" value={form.nombre} maxLength={80} placeholder="Ej. Rack 03" aria-invalid={Boolean(errores.nombre)} aria-describedby={errores.nombre ? 'ubi-nombre-error' : undefined} onChange={evento => cambia('nombre', evento.target.value)} />{errores.nombre && <small id="ubi-nombre-error" className="bad">{errores.nombre}</small>}</div>
          {esNueva && <div className="dx-ubicaciones-path"><small>Se creará en</small><span>{ruta}</span></div>}
        </div>
        <footer><button type="button" className="dx-btn" onClick={onClose} disabled={guardando}>Cancelar</button><button type="submit" className="dx-btn primary" disabled={guardando}>{guardando ? 'Guardando…' : esNueva ? 'Crear ubicación' : 'Guardar cambios'}</button></footer>
      </form>
    </section>
  </div>;
}

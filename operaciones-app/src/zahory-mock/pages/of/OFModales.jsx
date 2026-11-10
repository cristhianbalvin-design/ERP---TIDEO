import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DxReferenceSelector } from '../../components/dx/DxReferenceSelector.jsx';
import { formatearMonto } from './ofBandejaLogic.js';
import {
  CAMPOS_MATERIAL, CAMPOS_TAREA, MATERIAL_VACIO, ORIGENES_MATERIAL, TAREA_VACIA,
  costoTarea, datosMaterial, datosTarea, hayCambios, opcionesPosicion, primerError, textoStock,
  validarMaterial, validarTarea,
} from './ofFichaLogic.js';

// Marco común: fondo, Escape, foco inicial y aviso de cambios sin guardar.
export function ModalBase({ titulo, ayuda, onClose, sucio = false, estrecho = false, children, pie }) {
  const ref = useRef(null);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const intentarCerrar = () => { if (sucio) setConfirmarSalida(true); else onClose(); };

  useEffect(() => {
    const primero = ref.current?.querySelector('input:not([readonly]),select,textarea') || ref.current?.querySelector('[data-cerrar]');
    primero?.focus();
  }, []);
  // Escape cierra primero la lista abierta del selector con buscador; si no hay ninguna, el modal.
  const alTeclear = e => {
    if (e.key !== 'Escape') return;
    if (ref.current?.querySelector('.dx-ui-reference-options')) return;
    e.stopPropagation();
    intentarCerrar();
  };
  useEffect(() => {
    if (!sucio || typeof window === 'undefined') return undefined;
    const antes = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', antes);
    return () => window.removeEventListener('beforeunload', antes);
  }, [sucio]);

  return (
    <div className="dx-ofd-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) intentarCerrar(); }}>
      <div ref={ref} className={`dx-ofd-modal${estrecho ? ' is-narrow' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dx-ofd-modal-t" onKeyDown={alTeclear}>
        <div className="dx-ui">
          <h3 id="dx-ofd-modal-t">{titulo}</h3>
          {ayuda && <p className="dx-ofd-modal-help">{ayuda}</p>}
          {children}
          {confirmarSalida ? (
            <div className="dx-ofd-modal-actions is-confirm" role="alert">
              <span>Tienes cambios sin guardar. ¿Descartarlos?</span>
              <button type="button" className="dx-ofd-ghost" onClick={() => setConfirmarSalida(false)}>Seguir editando</button>
              <button type="button" className="dx-ofd-primary is-danger" data-cerrar onClick={onClose}>Descartar</button>
            </div>
          ) : pie(intentarCerrar)}
        </div>
      </div>
    </div>
  );
}

export function Campo({ id, label, requerido, error, ayuda, children, completo }) {
  return (
    <div className={`dx-ui-field${completo ? ' dx-ui-field-full' : ''}`}>
      <label htmlFor={id}>{label}{requerido && <span className="dx-ui-required"> *</span>}</label>
      {children}
      {error ? <span className="dx-ui-field-error" id={`${id}-err`}>{error}</span> : ayuda ? <span className="dx-ui-field-hint">{ayuda}</span> : null}
    </div>
  );
}

function Selector({ id, value, onChange, opciones, error, vacio = 'Elige…' }) {
  return (
    <select id={id} className="dx-ui-select" value={value} onChange={e => onChange(e.target.value)}
      aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined}>
      <option value="">{vacio}</option>
      {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function enfocarPrimerError(raiz, errores, orden) {
  const campo = primerError(errores, orden);
  if (campo) raiz?.querySelector(`#of-${campo}`)?.focus();
}

export function TareaModal({ of, operacion, preset, catalogo, onClose, onGuardar }) {
  const inicial = useMemo(() => {
    if (operacion) {
      return { ...TAREA_VACIA, ...operacion._form };
    }
    return { ...TAREA_VACIA, ...preset, posicion: preset?.posicion || String((of.operaciones || []).length + 1) };
  }, [operacion, preset, of]);
  const [form, setForm] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const raiz = useRef(null);
  const sucio = hayCambios(form, inicial);
  const set = campo => valor => {
    setForm(f => ({ ...f, [campo]: valor, ...(campo === 'familia_trabajo_id' ? { actividad_id: '' } : {}) }));
    setErrores(e => ({ ...e, [campo]: undefined }));
    setErrorServidor('');
  };

  const actividades = (catalogo?.actividades || [])
    .filter(a => !form.familia_trabajo_id || !a.familia_trabajo_id || a.familia_trabajo_id === form.familia_trabajo_id);
  const equipo = (catalogo?.equipos || []).find(e => e.id === form.activo_id);
  const { costo, sinTarifa } = costoTarea(form, catalogo);
  const moneda = of.moneda;

  const guardar = async e => {
    e.preventDefault();
    const errs = validarTarea(form);
    setErrores(errs);
    if (Object.keys(errs).length) { enfocarPrimerError(raiz.current, errs, CAMPOS_TAREA); return; }
    setGuardando(true);
    setErrorServidor('');
    try {
      const r = await onGuardar(operacion?.id || null, datosTarea(form));
      onClose(r);
    } catch (err) {
      setErrorServidor(err?.message || 'No se pudo guardar la tarea.');
      setGuardando(false);
    }
  };

  const op = (lista, etiqueta = x => x.nombre) => lista.map(x => ({ value: x.id, label: etiqueta(x) }));
  return (
    <ModalBase titulo={operacion ? 'Editar tarea' : 'Nueva tarea'} sucio={sucio && !guardando} onClose={() => onClose()}
      ayuda="La bahía se deduce del equipo (máquina del Planner). Sin equipo, la asigna el Planner."
      pie={cerrar => (
        <>
          {errorServidor && <div className="dx-ofd-server" role="alert">{errorServidor}</div>}
          <div className="dx-ofd-modal-actions">
            <button type="button" className="dx-ofd-ghost" data-cerrar onClick={cerrar} disabled={guardando}>Cancelar</button>
            <button type="submit" form="dx-ofd-form-tarea" className="dx-ofd-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : operacion ? 'Guardar cambios' : 'Agregar tarea'}
            </button>
          </div>
        </>
      )}>
      <form id="dx-ofd-form-tarea" ref={raiz} className="dx-ui-form-grid" noValidate onSubmit={guardar}>
        <Campo id="of-familia_trabajo_id" label="Trabajo" requerido error={errores.familia_trabajo_id}>
          <Selector id="of-familia_trabajo_id" value={form.familia_trabajo_id} onChange={set('familia_trabajo_id')} opciones={op(catalogo?.trabajos || [])} error={errores.familia_trabajo_id} />
        </Campo>
        <Campo id="of-actividad_id" label="Actividad" requerido error={errores.actividad_id}>
          <Selector id="of-actividad_id" value={form.actividad_id} onChange={set('actividad_id')} opciones={op(actividades)} error={errores.actividad_id} />
        </Campo>
        <Campo id="of-tarea_id" label="Tarea" requerido error={errores.tarea_id}>
          <Selector id="of-tarea_id" value={form.tarea_id} onChange={set('tarea_id')} opciones={op(catalogo?.tareas || [])} error={errores.tarea_id} />
        </Campo>
        <Campo id="of-cargo_id" label="Cargo" requerido error={errores.cargo_id}
          ayuda={sinTarifa ? 'Este cargo no tiene tarifa: la tarea queda sin costo de mano de obra.' : undefined}>
          <Selector id="of-cargo_id" value={form.cargo_id} onChange={set('cargo_id')} opciones={op(catalogo?.cargos || [])} error={errores.cargo_id} />
        </Campo>
        <Campo id="of-horas_estimadas" label="Horas-hombre" requerido error={errores.horas_estimadas}>
          <input id="of-horas_estimadas" inputMode="decimal" value={form.horas_estimadas} onChange={e => set('horas_estimadas')(e.target.value)}
            aria-invalid={Boolean(errores.horas_estimadas)} aria-describedby={errores.horas_estimadas ? 'of-horas_estimadas-err' : undefined} />
        </Campo>
        <Campo id="of-horas_maquina" label="Horas-máquina" error={errores.horas_maquina} ayuda="Opcional">
          <input id="of-horas_maquina" inputMode="decimal" value={form.horas_maquina} onChange={e => set('horas_maquina')(e.target.value)}
            aria-invalid={Boolean(errores.horas_maquina)} aria-describedby={errores.horas_maquina ? 'of-horas_maquina-err' : undefined} />
        </Campo>
        <Campo id="of-activo_id" label="Equipo" error={errores.activo_id}
          ayuda={equipo ? (equipo.bahia ? `Bahía: ${equipo.bahia}` : 'Sin máquina del Planner: la bahía la asigna el Planner') : 'Opcional'}>
          <Selector id="of-activo_id" value={form.activo_id} onChange={set('activo_id')} vacio="Sin equipo"
            opciones={op(catalogo?.equipos || [], e => (e.codigo && e.codigo !== e.nombre ? `${e.codigo} · ${e.nombre}` : e.nombre))} />
        </Campo>
        <Campo id="of-posicion" label="Posición" requerido error={errores.posicion} ayuda="Orden de la tarea en la ruta">
          <Selector id="of-posicion" value={form.posicion} onChange={set('posicion')} opciones={opcionesPosicion(of.operaciones, operacion?.id)} error={errores.posicion} />
        </Campo>
        <Campo id="of-costo" label="Costo estimado" ayuda="Tarifa del cargo y del equipo">
          <input id="of-costo" readOnly value={formatearMonto(costo, moneda)} />
        </Campo>
      </form>
    </ModalBase>
  );
}

export function MaterialModal({ of, linea, noPlanificado, materiales, cargandoMateriales, onClose, onGuardar }) {
  const inicial = useMemo(() => (linea ? { ...MATERIAL_VACIO, ...linea._form } : { ...MATERIAL_VACIO }), [linea]);
  const [form, setForm] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const raiz = useRef(null);
  const sucio = hayCambios(form, inicial);
  const set = campo => valor => {
    setForm(f => ({ ...f, [campo]: valor ?? '' }));
    setErrores(e => ({ ...e, [campo]: undefined }));
    setErrorServidor('');
  };
  const elegido = materiales.find(m => m.id === form.material_id);
  const cantidad = Number(String(form.cantidad || '').replace(',', '.')) || 0;
  const stock = textoStock(elegido, cantidad || null);
  const cu = form.origen === 'cliente' ? 0 : elegido?.costo_unitario;

  const guardar = async e => {
    e.preventDefault();
    const errs = validarMaterial(form, { noPlanificado });
    setErrores(errs);
    if (Object.keys(errs).length) {
      const campo = primerError(errs, CAMPOS_MATERIAL);
      raiz.current?.querySelector(campo === 'material_id' ? '#of-material_id' : `#of-${campo}`)?.focus();
      return;
    }
    setGuardando(true);
    setErrorServidor('');
    try {
      const r = await onGuardar(linea?.id || null, datosMaterial(form));
      onClose(r);
    } catch (err) {
      setErrorServidor(err?.message || 'No se pudo guardar el material.');
      setGuardando(false);
    }
  };

  const etiqueta = m => `${m.descripcion} · ${m.codigo || 'sin código'} · ${m.disponible} ${m.unidad || 'und'} disponibles`;
  return (
    <ModalBase titulo={noPlanificado ? 'Material no planificado' : linea ? 'Editar material' : 'Agregar material'} sucio={sucio && !guardando} onClose={() => onClose()}
      ayuda={noPlanificado
        ? 'La OF ya está aprobada: el material se agrega como no planificado.'
        : 'Busca en el catálogo de materiales. El costo unitario sale del costo promedio.'}
      pie={cerrar => (
        <>
          {errorServidor && <div className="dx-ofd-server" role="alert">{errorServidor}</div>}
          <div className="dx-ofd-modal-actions">
            <button type="button" className="dx-ofd-ghost" data-cerrar onClick={cerrar} disabled={guardando}>Cancelar</button>
            <button type="submit" form="dx-ofd-form-material" className="dx-ofd-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : linea ? 'Guardar cambios' : 'Agregar material'}
            </button>
          </div>
        </>
      )}>
      <form id="dx-ofd-form-material" ref={raiz} className="dx-ui-form-grid" noValidate onSubmit={guardar}>
        <div className="dx-ui-field-full dx-ofd-ref">
          <DxReferenceSelector id="of-material_id" name="of-material_id" label="Material" required
            options={materiales} value={form.material_id || null} onChange={set('material_id')}
            getLabel={etiqueta} loading={cargandoMateriales} optionalLabel="" placeholder="Buscar por descripción o código"
            error={errores.material_id} />
          {!errores.material_id && stock && <span className={`dx-ofd-stock is-${stock.tono}`}>{stock.texto}</span>}
        </div>
        <Campo id="of-cantidad" label="Cantidad" requerido error={errores.cantidad} ayuda={elegido ? `Unidad: ${elegido.unidad || 'und'}` : undefined}>
          <input id="of-cantidad" inputMode="decimal" value={form.cantidad} onChange={e => set('cantidad')(e.target.value)}
            aria-invalid={Boolean(errores.cantidad)} aria-describedby={errores.cantidad ? 'of-cantidad-err' : undefined} />
        </Campo>
        <Campo id="of-origen" label="Origen" requerido error={errores.origen}>
          <Selector id="of-origen" value={form.origen} onChange={set('origen')} error={errores.origen}
            opciones={ORIGENES_MATERIAL.map(([value, label]) => ({ value, label }))} />
        </Campo>
        <Campo id="of-operacion_id" label="Operación" ayuda="Opcional">
          <Selector id="of-operacion_id" value={form.operacion_id} onChange={set('operacion_id')} vacio="Sin operación"
            opciones={(of.operaciones || []).map(o => ({ value: o.id, label: `${o.secuencia} · ${o.tarea}` }))} />
        </Campo>
        <Campo id="of-costo-unit" label="Costo unitario" ayuda={form.origen === 'cliente' ? 'Lo entrega el cliente: sin costo' : cu == null && elegido ? 'El material no tiene costo promedio' : undefined}>
          <input id="of-costo-unit" readOnly value={elegido ? formatearMonto(cu || 0, of.moneda) : 'Sin dato'} />
        </Campo>
        {noPlanificado && (
          <Campo id="of-motivo" label="Motivo" requerido error={errores.motivo} completo>
            <textarea id="of-motivo" value={form.motivo} onChange={e => set('motivo')(e.target.value)}
              aria-invalid={Boolean(errores.motivo)} aria-describedby={errores.motivo ? 'of-motivo-err' : undefined} />
          </Campo>
        )}
      </form>
    </ModalBase>
  );
}

export function ConfirmarModal({ titulo, ayuda, filas = [], accion, peligro = false, onClose, onConfirmar }) {
  const [trabajando, setTrabajando] = useState(false);
  const [errorServidor, setErrorServidor] = useState('');
  const confirmar = async () => {
    setTrabajando(true);
    setErrorServidor('');
    try {
      const r = await onConfirmar();
      onClose(r);
    } catch (err) {
      setErrorServidor(err?.message || 'No se pudo completar la acción.');
      setTrabajando(false);
    }
  };
  return (
    <ModalBase titulo={titulo} ayuda={ayuda} estrecho onClose={() => onClose()}
      pie={cerrar => (
        <>
          {errorServidor && <div className="dx-ofd-server" role="alert">{errorServidor}</div>}
          <div className="dx-ofd-modal-actions">
            <button type="button" className="dx-ofd-ghost" data-cerrar onClick={cerrar} disabled={trabajando}>Cancelar</button>
            <button type="button" className={`dx-ofd-primary${peligro ? ' is-danger' : ''}`} onClick={confirmar} disabled={trabajando}>
              {trabajando ? 'Procesando…' : accion}
            </button>
          </div>
        </>
      )}>
      {filas.length > 0 && (
        <dl className="dx-ofd-cmp">
          {filas.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
        </dl>
      )}
    </ModalBase>
  );
}

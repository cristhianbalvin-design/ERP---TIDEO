import React, { useMemo, useState } from 'react';
import { TransportePanel } from './TransportePanel.jsx';
import { guardarRutaLogistica } from '../../../services/transporteLogisticaService.js';
import { DOCUMENTO_PARADA, fechaLima, horaLima, hoyLima, ordenarParadas, ventanaTexto } from '../../../../../src/lib/transporteLogistica.js';
import { estadoDocumento, etiquetaTipoVehiculo } from './transporteUtils.js';

const LIBRE_VACIA = { accion: 'entregar', nombre: '', direccion: '', descripcion: '' };
const desdePedido = pedido => ({ key: `p-${pedido.id}`, pedido_id: pedido.id, nombre: pedido.lugar_nombre,
  detalle: [pedido.accion === 'entregar' ? 'Entregar' : 'Recoger', pedido.documento_codigo || DOCUMENTO_PARADA[pedido.documento_tipo],
    ventanaTexto(pedido.ventana_inicio, pedido.ventana_fin)].filter(Boolean).join(' · ') });
const desdeParada = parada => ({ key: `s-${parada.id}`, parada_id: parada.id, nombre: parada.nombre, bloqueada: parada.estado !== 'pendiente',
  detalle: [parada.tipo === 'entrega' ? 'Entregar' : 'Recoger', DOCUMENTO_PARADA[parada.documento_tipo], parada.descripcion].filter(Boolean).join(' · ') });

// Panel para crear o editar una ruta de logística propia (borrador o programada).
export function RutaLogisticaEditor({ empresaId, fecha, viaje, pedidosNuevos = [], pedidos = [], flota, onClose, onSaved }) {
  const nuevo = !viaje;
  const inicial = useMemo(() => ({
    fecha: viaje ? fechaLima(viaje.fecha_programada) || fecha : fecha,
    hora: viaje ? horaLima(viaje.fecha_programada) || '08:00' : '08:00',
    origen: viaje?.origen_nombre && viaje.origen_nombre !== 'Base' ? viaje.origen_nombre : '',
    vehiculo_id: viaje?.vehiculo_id || '',
    conductor_id: viaje?.conductor_id || '',
    observaciones: viaje?.observaciones || '',
    paradas: [...ordenarParadas(viaje?.paradas).map(desdeParada), ...pedidosNuevos.map(desdePedido)],
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(inicial);
  const [libre, setLibre] = useState(null);
  const [agregarPedido, setAgregarPedido] = useState('');
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState('');
  const [errorServidor, setErrorServidor] = useState('');
  const dirty = JSON.stringify(form) !== JSON.stringify(inicial);
  const set = (clave, valor) => { setForm(old => ({ ...old, [clave]: valor })); setErrores(old => ({ ...old, [clave]: '' })); };

  const usados = new Set(form.paradas.map(p => p.pedido_id).filter(Boolean));
  const disponibles = pedidos.filter(p => !usados.has(p.id));
  const vehiculos = (flota?.vehiculos || []).filter(v => v.activo !== false || v.id === form.vehiculo_id);
  const conductores = (flota?.conductores || []).filter(c => c.activo !== false || c.id === form.conductor_id);
  const conductor = conductores.find(c => c.id === form.conductor_id);
  const unidad = vehiculos.find(v => v.id === form.vehiculo_id);
  const brevete = conductor ? estadoDocumento(conductor.vigencia_brevete) : null;
  const mtc = unidad ? estadoDocumento(unidad.vigencia_certificado_habilitacion) : null;

  const mover = (index, delta) => setForm(old => {
    const paradas = [...old.paradas];
    const destino = index + delta;
    if (destino < 0 || destino >= paradas.length) return old;
    [paradas[index], paradas[destino]] = [paradas[destino], paradas[index]];
    return { ...old, paradas };
  });
  const quitar = index => setForm(old => ({ ...old, paradas: old.paradas.filter((_, i) => i !== index) }));

  function sumarPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (pedido) set('paradas', [...form.paradas, desdePedido(pedido)]);
    setAgregarPedido('');
  }
  function sumarLibre() {
    if (!libre.nombre.trim()) { setErrores(old => ({ ...old, libre: 'Escribe el lugar de la parada.' })); return; }
    set('paradas', [...form.paradas, { key: `l-${Date.now()}`, libre: true, ...libre,
      detalle: [libre.accion === 'recoger' ? 'Recoger' : 'Entregar', 'Parada libre', libre.descripcion].filter(Boolean).join(' · ') }]);
    setLibre(null);
  }

  async function guardar(programar) {
    const errs = {};
    if (!form.paradas.length) errs.paradas = 'Agrega al menos una parada.';
    if (!form.fecha) errs.fecha = 'Indica la fecha.';
    if (!form.hora) errs.hora = 'Indica la hora de salida.';
    if (programar && !form.vehiculo_id) errs.vehiculo_id = 'Para programar, asigna la unidad.';
    if (programar && !form.conductor_id) errs.conductor_id = 'Para programar, asigna el conductor.';
    if (form.conductor_id && brevete?.clave === 'vencido') errs.conductor_id = 'El brevete de este conductor está vencido.';
    setErrores(errs);
    if (Object.keys(errs).length) return;
    setGuardando(programar ? 'programar' : 'borrador'); setErrorServidor('');
    try {
      const guardado = await guardarRutaLogistica(empresaId, viaje?.id || null, {
        fecha_programada: form.fecha, hora_salida: form.hora, origen_nombre: form.origen.trim() || 'Base',
        vehiculo_id: form.vehiculo_id || null, conductor_id: form.conductor_id || null,
        transportista_id: unidad?.transportista_id || null, observaciones: form.observaciones,
      }, form.paradas.map(p => (p.parada_id ? { parada_id: p.parada_id } : p.pedido_id ? { pedido_id: p.pedido_id }
        : { accion: p.accion, nombre: p.nombre.trim(), direccion: p.direccion, descripcion: p.descripcion })), programar);
      onSaved(guardado);
    } catch (e) { setErrorServidor(e.message || 'No se pudo guardar la ruta.'); }
    finally { setGuardando(''); }
  }

  const ocupado = Boolean(guardando);
  return <TransportePanel title={nuevo ? 'Nueva ruta de logística' : `Editar ${viaje.codigo}`} dirty={dirty} busy={ocupado} onClose={onClose}
    subtitle="Recojos de compras, entregas de Almacén y compras de campo en un solo recorrido."
    footer={close => <>
      <button type="button" className="dx-btn" onClick={close} disabled={ocupado}>Cancelar</button>
      <span className="dx-tmshr-sp" />
      {(nuevo || viaje.estado === 'borrador') && <button type="button" className="dx-btn" disabled={ocupado} onClick={() => guardar(false)}>
        {guardando === 'borrador' ? 'Guardando…' : 'Guardar como borrador'}</button>}
      <button type="button" className="dx-btn primary" disabled={ocupado} onClick={() => guardar(nuevo || viaje.estado === 'borrador')}>
        {guardando === 'programar' ? 'Guardando…' : nuevo || viaje.estado === 'borrador' ? 'Programar ruta' : 'Guardar cambios'}</button></>}>
    <div className="dx-transporte-composer-body dx-tmshr-ed">
      <div className="dx-transporte-composer-form">
        <section className="dx-transporte-composer-section"><h3><i>1</i> Fecha y salida</h3>
          <div className="dx-transporte-composer-grid dx-tmshr-grid3">
            <label className="dx-ui-field" htmlFor="ruta-fecha"><span>Fecha <b className="dx-ui-required">*</b></span>
              <input id="ruta-fecha" type="date" value={form.fecha} min={nuevo ? hoyLima() : undefined} aria-invalid={Boolean(errores.fecha)}
                onChange={event => set('fecha', event.target.value)} />{errores.fecha && <small className="dx-ui-field-error">{errores.fecha}</small>}</label>
            <label className="dx-ui-field" htmlFor="ruta-hora"><span>Hora de salida <b className="dx-ui-required">*</b></span>
              <input id="ruta-hora" type="time" value={form.hora} aria-invalid={Boolean(errores.hora)} onChange={event => set('hora', event.target.value)} />
              {errores.hora && <small className="dx-ui-field-error">{errores.hora}</small>}</label>
            <label className="dx-ui-field" htmlFor="ruta-origen"><span>Sale de y vuelve a</span>
              <input id="ruta-origen" value={form.origen} placeholder="Ej.: Taller Ate" onChange={event => set('origen', event.target.value)} /></label>
          </div></section>

        <section className="dx-transporte-composer-section"><h3><i>2</i> Paradas <small className="dx-tmshr-h3s">el orden es el del recorrido</small></h3>
          {errores.paradas && <div className="dx-transporte-composer-alert is-red" role="alert">{errores.paradas}</div>}
          <ol className="dx-tmshr-rstops">
            {form.paradas.map((parada, index) => <li key={parada.key} className="dx-tmshr-rs">
              <span className="dx-tmshr-rs-n" aria-hidden="true">{index + 1}</span>
              <span className="dx-tmshr-rs-t"><b>{parada.nombre}</b><small>{parada.detalle}</small></span>
              <span className="dx-tmshr-rs-mv">
                <button type="button" aria-label={`Subir ${parada.nombre}`} disabled={index === 0} onClick={() => mover(index, -1)}>↑</button>
                <button type="button" aria-label={`Bajar ${parada.nombre}`} disabled={index === form.paradas.length - 1} onClick={() => mover(index, 1)}>↓</button>
                <button type="button" aria-label={`Quitar ${parada.nombre}`} disabled={parada.bloqueada} onClick={() => quitar(index)}>×</button>
              </span></li>)}
            {!form.paradas.length && <li className="dx-tmshr-rs-empty">Aún no hay paradas. Agrégalas desde los pendientes o como parada libre.</li>}
          </ol>
          <div className="dx-tmshr-addrow">
            <select className="dx-ui-select" aria-label="Agregar desde pendientes" value={agregarPedido} disabled={!disponibles.length}
              onChange={event => sumarPedido(event.target.value)}>
              <option value="">{disponibles.length ? `＋ De pendientes (${disponibles.length})` : 'Sin pendientes por agregar'}</option>
              {disponibles.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}</select>
            {!libre && <button type="button" className="dx-btn" onClick={() => setLibre({ ...LIBRE_VACIA })}>＋ Parada libre</button>}
          </div>
          {libre && <div className="dx-tmshr-libre">
            <div className="dx-tms-filters dx-tmshr-chips" role="radiogroup" aria-label="Qué hacer">{[['recoger', '⇩ Recoger'], ['entregar', '⇧ Entregar']].map(([clave, texto]) =>
              <button key={clave} type="button" role="radio" aria-checked={libre.accion === clave} className={`dx-tms-fchip${libre.accion === clave ? ' is-on' : ''}`}
                onClick={() => setLibre(old => ({ ...old, accion: clave }))}>{texto}</button>)}</div>
            <div className="dx-transporte-composer-grid">
              <label className="dx-ui-field" htmlFor="libre-nombre"><span>Lugar <b className="dx-ui-required">*</b></span>
                <input id="libre-nombre" value={libre.nombre} aria-invalid={Boolean(errores.libre)} placeholder="Ej.: Ferretería Cajamarquilla"
                  onChange={event => { setLibre(old => ({ ...old, nombre: event.target.value })); setErrores(old => ({ ...old, libre: '' })); }} />
                {errores.libre && <small className="dx-ui-field-error">{errores.libre}</small>}</label>
              <label className="dx-ui-field" htmlFor="libre-dir"><span>Dirección</span>
                <input id="libre-dir" value={libre.direccion} onChange={event => setLibre(old => ({ ...old, direccion: event.target.value }))} /></label>
            </div>
            <label className="dx-ui-field" htmlFor="libre-desc"><span>Qué hacer</span>
              <input id="libre-desc" value={libre.descripcion} placeholder="Ej.: comprar pernos grado 8 (×40)"
                onChange={event => setLibre(old => ({ ...old, descripcion: event.target.value }))} /></label>
            <div className="dx-tmshr-libre-acts"><button type="button" className="dx-btn" onClick={() => setLibre(null)}>Cancelar</button>
              <button type="button" className="dx-btn primary" onClick={sumarLibre}>Agregar parada</button></div>
          </div>}
        </section>

        <section className="dx-transporte-composer-section"><h3><i>3</i> Unidad y conductor</h3>
          <div className="dx-transporte-composer-grid">
            <label className="dx-ui-field" htmlFor="ruta-unidad"><span>Unidad</span>
              <select id="ruta-unidad" className="dx-ui-select" value={form.vehiculo_id} aria-invalid={Boolean(errores.vehiculo_id)} onChange={event => set('vehiculo_id', event.target.value)}>
                <option value="">Asignar después</option>
                {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa} · {etiquetaTipoVehiculo(v.tipo)}{v.capacidad_toneladas != null ? ` ${v.capacidad_toneladas} t` : ''}</option>)}</select>
              {errores.vehiculo_id && <small className="dx-ui-field-error">{errores.vehiculo_id}</small>}</label>
            <label className="dx-ui-field" htmlFor="ruta-conductor"><span>Conductor</span>
              <select id="ruta-conductor" className="dx-ui-select" value={form.conductor_id} aria-invalid={Boolean(errores.conductor_id)} onChange={event => set('conductor_id', event.target.value)}>
                <option value="">Asignar después</option>
                {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
              {errores.conductor_id && <small className="dx-ui-field-error">{errores.conductor_id}</small>}</label>
          </div>
          {brevete?.clave === 'vencido' && <div className="dx-transporte-composer-alert is-red" role="alert">El brevete de {conductor.nombre} está vencido: elige otro conductor o actualiza su brevete en Flota.</div>}
          {brevete?.clave === 'vence' && <div className="dx-transporte-composer-alert is-amber" role="status">Brevete de {conductor.nombre}: {brevete.etiqueta}.</div>}
          {mtc?.clave === 'vencido' && <div className="dx-transporte-composer-alert is-amber" role="status">El certificado MTC de {unidad.placa} está vencido; quedará anotado en la bitácora.</div>}
        </section>

        <label className="dx-ui-field" htmlFor="ruta-obs"><span>Indicaciones para el conductor</span>
          <textarea id="ruta-obs" value={form.observaciones} placeholder="Ej.: llevar copia de la OC; preguntar por Carlos en almacén."
            onChange={event => set('observaciones', event.target.value)} /></label>
        {errorServidor && <div className="dx-transporte-composer-alert is-red" role="alert">{errorServidor}</div>}
      </div>
      <aside className="dx-transporte-composer-aside">
        <div className="dx-tmshr-sum"><div><small>Paradas</small><b>{form.paradas.length}</b></div>
          <div><small>Salida</small><b>{form.hora || '—'}</b></div>
          <div><small>Unidad</small><b>{unidad?.placa || '—'}</b></div></div>
        <div className="dx-tmshr-help">Al guardar, los pendientes elegidos salen de «Por enviar a ruta» y la OC o la guía muestran en qué ruta van.
          El conductor ve la ruta en su app el día de salida.</div>
        {(nuevo || viaje.estado === 'borrador') && <div className="dx-tmshr-help">«Programar ruta» exige unidad y conductor; como borrador puedes completarla después.</div>}
      </aside>
    </div>
  </TransportePanel>;
}

import React, { useEffect, useMemo, useState } from 'react';
import { TransportePanel } from './TransportePanel.jsx';
import { listarFlota, listarViajesEnCurso } from '../../../services/transporteFlotaService.js';
import { asignarViaje } from '../../../services/transporteViajesService.js';
import {
  controlesDespacho, etiquetaTipoVehiculo, evaluarConductorDespacho, evaluarUnidadDespacho,
  fechaActualLocal, formatearFechaTransporte, formatearNumeroTransporte, recursosEnCurso, requiereExcepcionDespacho,
} from './transporteUtils.js';

const ICONO_CONTROL = { ok: '✓', warn: '!', bad: '✕', pend: '•' };
const iniciales = nombre => String(nombre || '').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('')
  .toLocaleUpperCase('es-PE');
const nombreTransportista = item => item.nombre_comercial || item.razon_social;

function Opcion({ elegida, bloqueo, observaciones, icono, titulo, detalle, lateral, onElegir }) {
  const avisos = observaciones.filter(item => item.nivel !== 'info');
  return <button type="button" className={`dx-tmsdesp-opt${elegida ? ' is-on' : ''}`} aria-pressed={elegida}
    aria-disabled={Boolean(bloqueo)} onClick={() => { if (!bloqueo) onElegir(); }}>
    <span className="dx-tmsdesp-rad" aria-hidden="true" /><span className="dx-tmsdesp-ico" aria-hidden="true">{icono}</span>
    <span className="dx-tmsdesp-txt"><b>{titulo}</b><small>{detalle}</small>
      <span className="dx-tmsdesp-tags">{bloqueo && <span className="dx-tms-mini is-bad">{bloqueo}</span>}
        {observaciones.map(item => <span key={item.texto} className={`dx-tms-mini is-${item.nivel}`}>{item.texto}</span>)}
        {!bloqueo && !avisos.length && <span className="dx-tms-mini is-ok">✓ Lista</span>}</span></span>
    {lateral}
  </button>;
}

function Grupo({ items, render, nombre }) {
  const libres = items.filter(item => !item.bloqueo);
  const ocupados = items.filter(item => item.bloqueo);
  return <>
    <div className="dx-tmsdesp-list">{libres.length ? libres.map(render)
      : <div className="dx-tms-muted">No hay {nombre} disponibles de este transportista.</div>}</div>
    {ocupados.length > 0 && <details className="dx-transporte-composer-details dx-tmsdesp-off">
      <summary>No disponibles <small>{ocupados.length} {nombre} · en viaje, inactivos o con documentos vencidos</small></summary>
      <div className="dx-tmsdesp-list">{ocupados.map(render)}</div></details>}
  </>;
}

export function DespachoPanel({ open, viaje, empresaId, onClose, onDone }) {
  const [flota, setFlota] = useState(null);
  const [ocupados, setOcupados] = useState({ vehiculos: {}, conductores: {} });
  const [cargaError, setCargaError] = useState('');
  const [sel, setSel] = useState({ transportista: '', unidad: '', conductor: '' });
  const [inicial, setInicial] = useState('');
  const [sctr, setSctr] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [motivoError, setMotivoError] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const hoy = fechaActualLocal();

  useEffect(() => {
    if (!open || !viaje) return undefined;
    let vigente = true;
    setFlota(null); setCargaError(''); setServerError(''); setMotivo(''); setMotivoError(''); setSctr(false);
    Promise.all([listarFlota(empresaId), listarViajesEnCurso(empresaId)]).then(([datos, enCurso]) => {
      if (!vigente) return;
      const activos = { ...datos, transportistas: datos.transportistas.filter(item => item.activo !== false) };
      const ocupadosAhora = recursosEnCurso(enCurso, viaje.id);
      const transportista = viaje.transportista_id || activos.transportistas.find(item => item.tipo_operador === 'propio')?.id
        || activos.transportistas[0]?.id || '';
      const inicio = { transportista, unidad: viaje.vehiculo_id || '', conductor: viaje.conductor_id || '' };
      setFlota(activos); setOcupados(ocupadosAhora); setSel(inicio); setInicial(JSON.stringify(inicio));
    }).catch(error => { if (vigente) setCargaError(error.message || 'No se pudo cargar la flota.'); });
    return () => { vigente = false; };
  }, [open, viaje?.id, empresaId]);

  const delTransportista = item => !item.transportista_id || item.transportista_id === sel.transportista;
  const unidades = useMemo(() => (flota?.vehiculos || []).filter(delTransportista)
    .map(unidad => ({ unidad, ...evaluarUnidadDespacho(unidad, viaje, ocupados, hoy) })), [flota, sel.transportista, ocupados, viaje]);
  const conductores = useMemo(() => (flota?.conductores || []).filter(delTransportista)
    .map(conductor => ({ conductor, ...evaluarConductorDespacho(conductor, ocupados, hoy) })), [flota, sel.transportista, ocupados]);
  const unidad = unidades.find(item => item.unidad.id === sel.unidad && !item.bloqueo)?.unidad || null;
  const conductor = conductores.find(item => item.conductor.id === sel.conductor && !item.bloqueo)?.conductor || null;
  const controles = controlesDespacho({ viaje, unidad, conductor, hoy, sctrConfirmado: sctr });
  const excepcion = requiereExcepcionDespacho(controles);
  const observados = controles.filter(item => ['warn', 'bad'].includes(item.nivel)).length;
  const peso = Number(viaje?.peso_toneladas);
  const ocupacion = unidad?.capacidad_toneladas ? Math.min(100, peso / Number(unidad.capacidad_toneladas) * 100) : null;
  const listo = Boolean(sel.transportista && unidad && conductor);
  const sinSctr = controles.some(item => item.confirmar);

  function elegirTransportista(id) {
    const deId = item => !item.transportista_id || item.transportista_id === id;
    setSel({ transportista: id,
      unidad: flota.vehiculos.filter(deId).find(item => !evaluarUnidadDespacho(item, viaje, ocupados, hoy).bloqueo)?.id || '',
      conductor: flota.conductores.filter(deId).find(item => !evaluarConductorDespacho(item, ocupados, hoy).bloqueo)?.id || '' });
  }

  async function guardar(despachar) {
    if (!listo || busy) return;
    if (despachar && sinSctr) { setServerError('Confirma el SCTR del conductor antes de despachar.'); return; }
    if (despachar && excepcion && !motivo.trim()) { setMotivoError('Escribe el motivo para despachar con excepción.'); return; }
    setBusy(true); setServerError('');
    const nota = [sctr ? 'SCTR confirmado' : null, motivo.trim() || null].filter(Boolean).join(' · ') || null;
    try {
      await asignarViaje(viaje.id, { transportistaId: sel.transportista, vehiculoId: unidad.id, conductorId: conductor.id, despachar, nota });
      onDone?.(despachar);
    } catch (error) { setServerError(error.message || 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }

  if (!open || !viaje) return null;
  const dirty = Boolean(flota) && (JSON.stringify(sel) !== inicial || Boolean(motivo.trim()) || sctr);
  return <TransportePanel open={open} title="Asignar y despachar" dirty={dirty} busy={busy} onClose={onClose}
    subtitle={`${viaje.codigo} · ${viaje.origen_nombre} → ${viaje.destino_nombre} · requiere ${(viaje.tipo_unidad ? etiquetaTipoVehiculo(viaje.tipo_unidad) : 'unidad').toLocaleLowerCase('es-PE')}${viaje.peso_toneladas != null ? ` para ${formatearNumeroTransporte(viaje.peso_toneladas)} t` : ''}`}
    footer={close => <>
      <button type="button" className="dx-btn" onClick={close} disabled={busy}>Cancelar</button>
      <span className="dx-tmsdesp-sp" />
      <button type="button" className="dx-btn" onClick={() => guardar(false)} disabled={!listo || busy}>Guardar asignación</button>
      <button type="button" className="dx-btn primary" onClick={() => guardar(true)} disabled={!listo || busy}>
        {busy ? 'Guardando…' : excepcion ? 'Despachar con excepción' : 'Despachar ahora'}</button>
    </>}>
    <div className="dx-transporte-composer-body dx-tmsdesp-body">
      <div className="dx-transporte-composer-form">
        {cargaError ? <div className="dx-transporte-composer-alert is-red" role="alert">{cargaError}</div>
          : !flota ? <div className="dx-tms-skeletons">{[1, 2, 3].map(key => <div key={key} className="dx-tms-sk" />)}</div>
            : !flota.transportistas.length ? <div className="dx-transporte-composer-alert is-amber" role="status">
              No hay transportistas activos. Regístralos en Flota para poder despachar.</div> : <>
              <section className="dx-transporte-composer-section"><h3><i>1</i> Transportista</h3>
                <div className="dx-transporte-composer-segmented" role="radiogroup" aria-label="Transportista">
                  {flota.transportistas.map(item => <button key={item.id} type="button" role="radio" aria-checked={sel.transportista === item.id}
                    className={sel.transportista === item.id ? 'is-on' : ''} onClick={() => elegirTransportista(item.id)}>
                    {nombreTransportista(item)} · {item.tipo_operador === 'propio' ? 'propio' : 'tercero'}</button>)}</div></section>
              <section className="dx-transporte-composer-section"><h3><i>2</i> Unidad <small>{unidades.filter(item => !item.bloqueo).length} disponibles de {unidades.length}</small></h3>
                <Grupo nombre="unidades" items={unidades} render={({ unidad: item, bloqueo, observaciones }) => <Opcion key={item.id}
                  elegida={sel.unidad === item.id && !bloqueo} bloqueo={bloqueo} observaciones={observaciones} icono="⛟" titulo={item.placa}
                  detalle={[etiquetaTipoVehiculo(item.tipo), [item.marca, item.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                  onElegir={() => setSel(old => ({ ...old, unidad: item.id }))}
                  lateral={<span className="dx-tmsdesp-cap"><b>{item.capacidad_toneladas != null ? `${formatearNumeroTransporte(item.capacidad_toneladas)} t` : '—'}</b>
                    <small>{item.capacidad_m3 != null ? `${formatearNumeroTransporte(item.capacidad_m3)} m³` : 'sin capacidad'}</small></span>} />} /></section>
              <section className="dx-transporte-composer-section"><h3><i>3</i> Conductor</h3>
                <Grupo nombre="conductores" items={conductores} render={({ conductor: item, bloqueo, observaciones }) => <Opcion key={item.id}
                  elegida={sel.conductor === item.id && !bloqueo} bloqueo={bloqueo} observaciones={observaciones} icono={iniciales(item.nombre)}
                  titulo={item.nombre} detalle={[`DNI ${item.dni}`, item.categoria_brevete && `Brevete ${item.categoria_brevete}`].filter(Boolean).join(' · ')}
                  onElegir={() => setSel(old => ({ ...old, conductor: item.id }))}
                  lateral={<span className="dx-tmsdesp-cap"><small>brevete vence</small><b className="is-sm">{formatearFechaTransporte(item.vigencia_brevete, '—')}</b></span>} />} /></section>
              {(viaje.requisitos || []).includes('sctr') && <section className="dx-transporte-composer-section"><h3><i>4</i> Requisitos del viaje</h3>
                <label className="dx-transporte-composer-switch"><input type="checkbox" checked={sctr} onChange={event => setSctr(event.target.checked)} />
                  <span>Confirmo que el conductor cuenta con SCTR vigente</span></label></section>}
            </>}
      </div>
      <aside className="dx-transporte-composer-aside dx-tmsdesp-aside">
        <div className="dx-tmsdesp-gauge"><div className="dx-tmsdesp-gh"><span>Ocupación de la unidad</span><span>{unidad?.placa || ''}</span></div>
          <div className="dx-tmsdesp-gv">{!unidad ? 'Elige una unidad' : ocupacion == null ? 'Capacidad desconocida'
            : `${formatearNumeroTransporte(peso)} t de ${formatearNumeroTransporte(unidad.capacidad_toneladas)} t`}</div>
          <div className="dx-tmsdesp-gb"><b className={ocupacion == null ? 'is-warn' : peso > Number(unidad?.capacidad_toneladas) ? 'is-bad' : ''}
            style={{ width: `${ocupacion == null ? (unidad ? 100 : 0) : ocupacion}%` }} /></div></div>
        <div className="dx-tmsdesp-checks">{controles.map(item => <div key={item.clave} className={`dx-tmsdesp-chk is-${item.nivel}`}>
          <span aria-hidden="true">{ICONO_CONTROL[item.nivel]}</span><div><b>{item.titulo}</b><small>{item.detalle}</small></div></div>)}</div>
        {listo && (observados ? <div className="dx-transporte-composer-alert is-amber" role="status"><span><b>{observados} control{observados === 1 ? '' : 'es'} con observación.</b>{' '}
          {excepcion ? 'Puedes despachar como excepción indicando el motivo; quedará en la bitácora.' : 'Revísalo antes de despachar.'}</span></div>
          : <div className="dx-transporte-composer-alert is-green" role="status"><span><b>Todo en orden.</b> La unidad y el conductor cumplen los controles.</span></div>)}
        {listo && excepcion && <label className="dx-ui-field"><span>Motivo de la excepción <b className="dx-ui-required">*</b></span>
          <textarea value={motivo} aria-invalid={Boolean(motivoError)} placeholder="Ej.: capacidad verificada en campo; se registrará en Flota."
            onChange={event => { setMotivo(event.target.value); setMotivoError(''); }} />
          {motivoError && <small className="dx-ui-field-error" role="alert">{motivoError}</small>}</label>}
        {serverError && <div className="dx-transporte-composer-alert is-red" role="alert">{serverError}</div>}
      </aside>
    </div>
  </TransportePanel>;
}

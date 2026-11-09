import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import {
  agregarNotaViaje, cambiarEstadoViaje, eliminarViajeBorrador, obtenerViaje,
} from '../../../services/transporteViajesService.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { TransporteMapaRutas } from './TransporteMapaRutas.jsx';
import { DespachoPanel } from './DespachoPanel.jsx';
import { BotonConstancia, EvidenciaParada, OperacionComercial } from './ViajeOperacion.jsx';
import { autorizarSalida, obtenerOperacionViaje } from '../../../services/transporteLogisticaService.js';
import {
  accionesPermitidasViaje, avanceEstimadoViaje, colorEstadoViaje, estadoDocumento, etapasViaje, etiquetaEstadoViaje,
  etiquetaModalidad, etiquetaTipoParada, etiquetaTipoVehiculo, etiquetaContador, fechaActualLocal, fechaLocalDeViaje,
  formatearFechaHoraTransporte, formatearFechaTransporte, formatearImporte, formatearNumeroTransporte,
} from './transporteUtils.js';

const REQUISITOS = { gps: 'GPS', epp: 'EPP', sctr: 'SCTR', escolta: 'Escolta', refrigerado: 'Refrigerado' };
const TIPOS_CARGA = { general: 'Carga general', peligrosa: 'Peligrosa', refrigerada: 'Refrigerada',
  sobredimensionada: 'Sobredimensionada', fragil: 'Frágil' };
const MOTIVOS_CANCELACION = ['Cliente canceló', 'Sin unidad disponible', 'Reprogramado en otro viaje', 'Error de registro', 'Otro'];
const ICONO_EVENTO = { borrador: '✎', programado: '◷', despachado: '⛟', en_ruta: '➜', con_incidente: '⚑',
  entregado: '✓', en_liquidacion: 'S/', cerrado: '■', cancelado: '⊘' };
const TONO_EVENTO = { programado: 'is-amber', despachado: 'is-cyan', en_ruta: 'is-violet', con_incidente: 'is-red',
  entregado: 'is-green', en_liquidacion: 'is-violet', cancelado: 'is-red' };
const iniciales = nombre => String(nombre || '').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('')
  .toLocaleUpperCase('es-PE');
const fechaCorta = fecha => {
  if (!fecha) return '—';
  const texto = formatearFechaHoraTransporte(fecha);
  return `${texto.slice(0, 5)} ${texto.slice(11)}`;
};
const nombreCliente = viaje => viaje.cuenta?.nombre_comercial || viaje.cuenta?.razon_social || 'Sin cliente';

function tituloEvento(evento) {
  if (!evento.estado_anterior) return 'Viaje creado';
  if (evento.estado_anterior === evento.estado_nuevo) return /^Asignación:/.test(evento.nota || '') ? 'Asignación guardada' : 'Nota';
  if (evento.estado_nuevo === 'con_incidente') return 'Incidente reportado';
  if (evento.estado_anterior === 'con_incidente' && evento.estado_nuevo === 'en_ruta') return 'Incidente cerrado';
  return etiquetaEstadoViaje(evento.estado_nuevo);
}

// Confirmación con motivo opcional u obligatorio (cancelar, incidente, eliminar).
function Confirmacion({ datos, busy, error, onCancel, onConfirm }) {
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const foco = useRef(null);
  useEffect(() => { foco.current?.focus(); }, []);
  useEffect(() => {
    const tecla = event => { if (event.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [busy, onCancel]);
  const requiereDetalle = datos.detalleObligatorio || motivo === 'Otro';
  const valido = (!datos.motivos || motivo) && (!requiereDetalle || detalle.trim());
  const nota = [motivo && motivo !== 'Otro' ? motivo : null, detalle.trim() || null].filter(Boolean).join(' · ');
  return <div className="dx-ui-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="dx-ui-dialog dx-tmsvd-confirm" role="alertdialog" aria-modal="true" aria-labelledby="tmsvd-confirm-title">
      <div className="dx-tmsvd-confirm-head"><span className={`dx-tmsvd-confirm-i ${datos.peligro ? 'is-red' : 'is-amber'}`} aria-hidden="true">{datos.icono}</span>
        <div><h2 id="tmsvd-confirm-title">{datos.titulo}</h2><p>{datos.texto}</p></div></div>
      <div className="dx-tmsvd-confirm-body">
        {datos.resumen && <dl className="dx-tmsvd-sum">{datos.resumen.map(([clave, valor]) => <React.Fragment key={clave}><dt>{clave}</dt><dd>{valor}</dd></React.Fragment>)}</dl>}
        {datos.motivos && <div className="dx-ui-field"><span>Motivo <b className="dx-ui-required">*</b></span>
          <div className="dx-tms-chips">{datos.motivos.map(item => <button key={item} type="button" className={`dx-tms-fchip${motivo === item ? ' is-on' : ''}`}
            aria-pressed={motivo === item} onClick={() => setMotivo(item)} ref={item === datos.motivos[0] ? foco : undefined}>{item}</button>)}</div></div>}
        {datos.conDetalle && <label className="dx-ui-field"><span>{datos.etiquetaDetalle || 'Detalle'} {requiereDetalle ? <b className="dx-ui-required">*</b> : '(opcional)'}</span>
          <textarea ref={datos.motivos ? undefined : foco} value={detalle} placeholder={datos.placeholder || 'Agrega contexto para el equipo…'}
            onChange={event => setDetalle(event.target.value)} /></label>}
        {error && <div className="dx-ui-error" role="alert">{error}</div>}
      </div>
      <div className="dx-ui-dialog-foot"><button type="button" className="dx-btn" onClick={onCancel} disabled={busy}
        ref={!datos.motivos && !datos.conDetalle ? foco : undefined}>{datos.volver || 'Volver'}</button>
        <button type="button" className={`dx-btn ${datos.peligro ? 'dx-tmsvd-danger' : 'primary'}`} disabled={!valido || busy}
          onClick={() => onConfirm(nota || null)}>{busy ? 'Guardando…' : datos.accion}</button></div>
    </section>
  </div>;
}

export function ViajeDetallePage({ onNav, routeParams = {} }) {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const viajeId = routeParams.id;
  const [viaje, setViaje] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accionError, setAccionError] = useState('');
  const [menu, setMenu] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [despacho, setDespacho] = useState(false);
  const [nota, setNota] = useState('');
  const [aviso, setAviso] = useState('');
  const [operacion, setOperacion] = useState(null);
  const hoy = fechaActualLocal();
  const empresaNombre = sesion.empresa?.razon_social || sesion.empresa?.nombre_comercial || sesion.empresa?.nombre || '';

  const cargar = useCallback(async () => {
    if (!empresaId || !access.ver || !viajeId) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const data = await obtenerViaje(empresaId, viajeId);
      if (!data) setError('No se encontró el viaje.');
      setViaje(data);
      setOperacion(data?.tipo_viaje === 'comercial' ? await obtenerOperacionViaje(viajeId).catch(() => null) : null);
    } catch (e) { setError(e.message || 'No se pudo cargar el viaje.'); }
    finally { setLoading(false); }
  }, [empresaId, access.ver, viajeId]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!menu) return undefined;
    const cerrar = () => setMenu(false);
    window.addEventListener('click', cerrar);
    return () => window.removeEventListener('click', cerrar);
  }, [menu]);

  const etapas = useMemo(() => viaje ? etapasViaje(viaje.estado, viaje.eventos, viaje.tipo_viaje) : [], [viaje]);
  const avance = useMemo(() => viaje ? avanceEstimadoViaje(viaje, viaje.eventos) : null, [viaje]);
  const paradas = viaje?.paradas || [];
  const coords = paradas.map(parada => parada.latitud != null && parada.longitud != null ? [Number(parada.latitud), Number(parada.longitud)] : null);
  const rutasMapa = useMemo(() => {
    if (!viaje) return [];
    const puntos = paradas.map((parada, index) => ({ coords: coords[index],
      etiqueta: index === 0 ? 'A' : index === paradas.length - 1 ? 'B' : String(index), tono: index === 0 ? 'a' : index === paradas.length - 1 ? 'b' : 'n' }));
    const conCoords = coords.filter(Boolean);
    const posicion = avance && conCoords.length > 1 ? [conCoords[0][0] + (conCoords.at(-1)[0] - conCoords[0][0]) * avance.avance,
      conCoords[0][1] + (conCoords.at(-1)[1] - conCoords[0][1]) * avance.avance] : null;
    return [{ id: viaje.id, puntos, posicion, marca: viaje.vehiculo?.placa, alerta: viaje.estado === 'con_incidente',
      enVivo: ['en_ruta', 'con_incidente', 'entregado', 'en_liquidacion', 'cerrado'].includes(viaje.estado) }];
  }, [viaje, avance]);

  async function transicion(estado, notaCambio = null, mensaje = '') {
    setBusy(true); setAccionError('');
    try {
      await cambiarEstadoViaje(viaje.id, estado, notaCambio);
      setConfirmar(null); setAviso(mensaje); await cargar();
    } catch (e) { setAccionError(e.message || 'No se pudo cambiar el estado.'); }
    finally { setBusy(false); }
  }
  async function eliminar() {
    setBusy(true); setAccionError('');
    try { await eliminarViajeBorrador(empresaId, viaje.id); onNav('transporte-viajes'); }
    catch (e) { setAccionError(e.message || 'No se pudo eliminar.'); setBusy(false); }
  }
  async function guardarNota() {
    if (!nota.trim() || busy) return;
    setBusy(true); setAccionError('');
    try { await agregarNotaViaje(viaje.id, nota.trim()); setNota(''); await cargar(); }
    catch (e) { setAccionError(e.message || 'No se pudo guardar la nota.'); }
    finally { setBusy(false); }
  }

  if (access.motivo) return <AccesoTransporte acceso={access} />;
  const volver = <nav className="dx-tmsvd-crumbs" aria-label="Ruta de navegación"><button type="button" className="dx-btn link"
    onClick={() => onNav(viaje?.tipo_viaje === 'logistica' ? 'transporte-ruta' : 'transporte-viajes')}>{viaje?.tipo_viaje === 'logistica' ? 'Hoja de Ruta' : 'Monitor de Viajes'}</button>
    <span aria-hidden="true">›</span><span>{viaje?.codigo || 'Viaje'}</span></nav>;
  if (loading) return <section className="dx-ui dx-tms dx-tmsvd">{volver}<div className="dx-tms-skeletons">{[1, 2, 3].map(key => <div key={key} className="dx-tms-sk is-tall" />)}</div></section>;
  if (error || !viaje) return <section className="dx-ui dx-tms dx-tmsvd">{volver}<div className="dx-ui-card"><div className="dx-tms-state">
    <span className="dx-tms-state-i is-red">!</span><b>{error || 'No se encontró el viaje.'}</b>
    <button type="button" className="dx-btn primary" onClick={cargar}>Reintentar</button></div></div></section>;

  const esLogistica = viaje.tipo_viaje === 'logistica';
  const permitidas = accionesPermitidasViaje(viaje.estado);
  const fecha = fechaLocalDeViaje(viaje.fecha_programada);
  const atrasado = viaje.estado === 'programado' && fecha && fecha < hoy;
  const diasAtraso = atrasado ? Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${fecha}T12:00:00Z`)) / 864e5) : 0;
  const ultimoIncidente = [...(viaje.eventos || [])].reverse().find(evento => evento.estado_nuevo === 'con_incidente');
  const entrega = [...(viaje.eventos || [])].reverse().find(evento => evento.estado_nuevo === 'entregado');
  const salida = viaje.fecha_programada ? formatearFechaHoraTransporte(viaje.fecha_programada) : 'Sin fecha';
  const resumenConfirmacion = [['Ruta', `${viaje.origen_nombre} → ${viaje.destino_nombre}`], ['Cliente', nombreCliente(viaje)],
    ['Ingreso', formatearImporte(viaje.ingreso_estimado, viaje.moneda)]];
  const abrirCancelar = () => setConfirmar({ tipo: 'cancelar', icono: '⊘', peligro: true, titulo: `Cancelar ${viaje.codigo}`,
    texto: 'El viaje saldrá del plan y no se podrá despachar. Quedará en la bitácora con el motivo.', resumen: resumenConfirmacion,
    motivos: MOTIVOS_CANCELACION, conDetalle: true, accion: 'Cancelar viaje' });
  const abrirEliminar = () => setConfirmar({ tipo: 'eliminar', icono: '🗑', peligro: true, titulo: `¿Eliminar el borrador ${viaje.codigo}?`,
    texto: 'Se borrará por completo. Esta acción no se puede deshacer.', resumen: resumenConfirmacion.slice(0, 2), accion: 'Eliminar borrador', volver: 'Conservar' });
  const abrirIncidente = () => setConfirmar({ tipo: 'incidente', icono: '⚑', titulo: `Reportar incidente en ${viaje.codigo}`,
    texto: 'El viaje queda marcado con incidente hasta que lo cierres.', conDetalle: true, detalleObligatorio: true,
    etiquetaDetalle: 'Qué pasó', placeholder: 'Ej.: control policial en Cañete, demora estimada 25 min.', accion: 'Reportar incidente' });
  const acciones = [];
  const primaria = !access.editar ? null
    : esLogistica ? (viaje.estado === 'programado' ? ['Marcar en ruta', () => transicion('en_ruta', 'Ruta iniciada por el despachador', 'Ruta en curso.')]
      : viaje.estado === 'en_ruta' ? ['Registrar fin de ruta', () => transicion('entregado', 'Ruta terminada por el despachador', 'Ruta terminada.')]
        : viaje.estado === 'con_incidente' ? ['Cerrar incidente', () => transicion('en_ruta', 'Incidente cerrado', 'Incidente cerrado.')] : null)
    : viaje.estado === 'borrador' ? ['Programar viaje', () => transicion('programado', null, 'Viaje programado.')]
      : viaje.estado === 'programado' ? ['Asignar y despachar', () => setDespacho(true)]
        : viaje.estado === 'despachado' ? ['Marcar en ruta', () => transicion('en_ruta', null, 'Viaje en ruta.')]
          : viaje.estado === 'en_ruta' ? ['Registrar entrega', () => transicion('entregado', null, 'Entrega registrada.')]
            : viaje.estado === 'con_incidente' ? ['Cerrar incidente', () => transicion('en_ruta', 'Incidente cerrado', 'Incidente cerrado.')]
              : viaje.estado === 'entregado' ? ['Enviar a liquidación', () => transicion('en_liquidacion', null, 'Viaje enviado a liquidación.')] : null;
  if (access.editar && ['borrador', 'programado'].includes(viaje.estado)) acciones.push(['Editar', () => onNav(esLogistica ? 'transporte-ruta' : 'transporte-crear-ov', { id: viaje.id })]);
  if (access.editar && viaje.estado === 'en_ruta') acciones.push(['Reportar incidente', abrirIncidente]);
  if (access.editar && viaje.estado === 'con_incidente') acciones.push(['Registrar entrega', () => transicion('entregado', null, 'Entrega registrada.')]);
  const menuItems = !access.editar ? [] : [
    permitidas.includes('borrador') && ['↶', 'Volver a borrador', () => transicion('borrador', null, 'El viaje volvió a borrador.'), ''],
    viaje.estado === 'borrador' && ['🗑', 'Eliminar borrador', abrirEliminar, 'is-danger'],
    permitidas.includes('cancelado') && ['⊘', 'Cancelar viaje', abrirCancelar, 'is-danger'],
  ].filter(Boolean);
  const callout = atrasado ? <div className="dx-tmsvd-callout is-red" role="alert"><span className="dx-tmsvd-callout-i" aria-hidden="true">!</span>
    <div><b>Atrasado: debió salir el {formatearFechaTransporte(fecha)} (hace {etiquetaContador(diasAtraso, 'día')})</b>
      Asigna unidad y conductor para despachar, o edita la fecha para reprogramarlo.</div>
    {access.editar && <button type="button" className="dx-btn" onClick={() => onNav(esLogistica ? 'transporte-ruta' : 'transporte-crear-ov', { id: viaje.id })} disabled={busy}>Reprogramar</button>}</div>
    : viaje.estado === 'con_incidente' ? <div className="dx-tmsvd-callout is-amber" role="status"><span className="dx-tmsvd-callout-i" aria-hidden="true">⚑</span>
      <div><b>Incidente abierto{ultimoIncidente?.nota ? ` · ${ultimoIncidente.nota}` : ''}</b>Reportado el {fechaCorta(ultimoIncidente?.created_at)}.</div></div>
      : viaje.estado === 'entregado' ? <div className="dx-tmsvd-callout is-green" role="status"><span className="dx-tmsvd-callout-i" aria-hidden="true">✓</span>
        <div><b>{esLogistica ? 'Ruta terminada' : 'Entregado'} el {fechaCorta(entrega?.created_at)}</b>{esLogistica ? 'Revisa la constancia de cada parada.' : 'Listo para enviar a liquidación.'}</div></div>
        : viaje.estado === 'borrador' ? <div className="dx-tmsvd-callout is-amber" role="status"><span className="dx-tmsvd-callout-i" aria-hidden="true">✎</span>
          <div><b>Borrador: aún no está en el plan</b>Revisa los datos y prográmalo para que aparezca en el tablero de despacho.</div></div>
          : viaje.estado === 'cancelado' ? <div className="dx-tmsvd-callout is-red" role="status"><span className="dx-tmsvd-callout-i" aria-hidden="true">⊘</span>
            <div><b>Viaje cancelado</b>{viaje.motivo_cancelacion || 'Sin motivo registrado.'}</div></div> : null;
  const docUnidad = viaje.vehiculo ? estadoDocumento(viaje.vehiculo.vigencia_certificado_habilitacion, hoy) : null;
  const docConductor = viaje.conductor ? estadoDocumento(viaje.conductor.vigencia_brevete, hoy) : null;
  const sinUbicacion = coords.filter(item => !item).length;

  return <section className="dx-ui dx-tms dx-tmsvd">
    {volver}
    <header className="dx-tmsvd-head">
      <div className="dx-tmsvd-top"><div className="dx-tmsvd-tit">
        <div className="dx-tmsvd-k">{esLogistica ? 'Ruta de logística propia' : 'Orden de viaje'} <span className={`dx-ui-pill ${colorEstadoViaje(viaje.estado)}`}><i />{etiquetaEstadoViaje(viaje.estado)}</span></div>
        <h1>{viaje.origen_nombre} <i aria-hidden="true">→</i> {viaje.destino_nombre}</h1>
        <div className="dx-tmsvd-cl"><b>{viaje.codigo}</b> · {esLogistica ? 'Recojos, entregas y compras de la empresa' : `${nombreCliente(viaje)} · ${viaje.os?.numero || 'Viaje directo'}`}</div></div>
        <div className="dx-tmsvd-acts">
          {acciones.map(([texto, accion]) => <button key={texto} type="button" className="dx-btn" onClick={accion} disabled={busy}>{texto}</button>)}
          {menuItems.length > 0 && <div className="dx-tmsvd-menu"><button type="button" className="dx-btn" aria-label="Más acciones" aria-haspopup="menu"
            aria-expanded={menu} disabled={busy} onClick={event => { event.stopPropagation(); setMenu(value => !value); }}>⋯</button>
            {menu && <div className="dx-tmsvd-pop" role="menu">{menuItems.map(([icono, texto, accion, clase]) => <button key={texto} type="button" role="menuitem"
              className={clase} onClick={() => { setMenu(false); accion(); }}><span aria-hidden="true">{icono}</span>{texto}</button>)}</div>}</div>}
          {primaria && <button type="button" className="dx-btn primary" onClick={primaria[1]} disabled={busy}>{busy ? 'Guardando…' : primaria[0]}</button>}
        </div></div>
      <div className="dx-tmsvd-meta"><span>◷ Salida <b>{salida}</b></span>
        {viaje.distancia_km != null && <span>↔ <b>{formatearNumeroTransporte(viaje.distancia_km)} km</b></span>}
        {viaje.duracion_estimada_horas != null && <span>⏱ <b>{formatearNumeroTransporte(viaje.duracion_estimada_horas)} h</b> estimadas</span>}
        <span>◎ <b>{paradas.length}</b> paradas</span>
        {viaje.tipo_unidad && <span>⛟ <b>{etiquetaTipoVehiculo(viaje.tipo_unidad)}</b></span>}
        {!esLogistica && <span>Ingreso <b>{formatearImporte(viaje.ingreso_estimado, viaje.moneda)}</b></span>}</div>
      {viaje.estado !== 'cancelado' && <ol className="dx-tmsvd-stages" aria-label="Etapas del viaje">{etapas.map((etapa, index) =>
        <li key={etapa.clave} className={`is-${etapa.paso}`} aria-current={etapa.paso === 'actual' ? 'step' : undefined}>
          <span className="dx-tmsvd-dot">{etapa.paso === 'hecho' ? '✓' : index + 1}</span><b>{etapa.etiqueta}</b>
          <small>{etapa.fecha ? fechaCorta(etapa.fecha) : etapa.paso === 'actual' ? 'Ahora' : '—'}</small></li>)}</ol>}
    </header>
    {aviso && <div className="dx-ui-notice dx-tmsvd-notice" role="status">{aviso}</div>}
    {accionError && <div className="dx-ui-error dx-tmsvd-notice" role="alert">{accionError}</div>}
    {callout}

    <div className="dx-tmsvd-grid">
      <div className="dx-tmsvd-main">
      <section className="dx-tmsvd-blk dx-tmsvd-o1"><header><h3>Recorrido</h3><small>{etiquetaContador(paradas.length, 'parada')}</small>
        {avance && <span className="dx-tms-mini is-ok dx-tmsvd-sp">● {Math.round(avance.avance * 100)} % estimado</span>}
        <BotonConstancia viaje={viaje} empresa={empresaNombre} /></header>
        <div className="dx-tmsvd-rec"><TransporteMapaRutas rutas={rutasMapa} className="dx-tmsvd-map"
          aviso={!paradas.length ? 'Sin paradas registradas' : sinUbicacion ? `Solo ${paradas.length - sinUbicacion} de ${paradas.length} paradas con ubicación` : avance ? 'Posición estimada por tiempo' : ''} />
          {!paradas.length && <div className="dx-tmsvd-stops-empty">Este viaje no tiene paradas registradas. Edítalo para agregar origen, destino y paradas.</div>}
          <ol className="dx-tmsvd-stops">{paradas.map((parada, index) => {
            const hecha = parada.estado === 'completada';
            const tono = index === 0 ? 'is-a' : index === paradas.length - 1 ? 'is-b' : '';
            return <li key={parada.id || index} className={hecha ? 'is-ok' : ''}><span className={`dx-tmsvd-p ${tono}`}>{hecha ? '✓' : index === 0 ? 'A' : index === paradas.length - 1 ? 'B' : index}</span>
              <div><span className="dx-tmsvd-tp">{etiquetaTipoParada(parada.tipo)}</span><b>{parada.nombre}</b><small>{parada.direccion || 'Sin dirección registrada'}</small>
                <span className="dx-tmsvd-row">{(parada.ventana_inicio || parada.ventana_fin) && <span className="dx-tms-mini is-info">◷ {[parada.ventana_inicio, parada.ventana_fin].filter(Boolean).map(item => String(item).slice(0, 5)).join(' – ')}</span>}
                  {!coords[index] && <span className="dx-tms-mini is-warn">⌖ Sin ubicación en mapa</span>}</span>
                <EvidenciaParada parada={parada} /></div></li>;
          })}</ol></div>
        {sinUbicacion > 0 && <div className="dx-transporte-composer-alert is-amber dx-tmsvd-gpsnote" role="status"><span>{sinUbicacion} de {paradas.length} paradas no tienen ubicación.
          Complétalas en <b>Lugares</b> para ver el recorrido completo.</span></div>}
      </section>

      {!esLogistica && operacion && <OperacionComercial operacion={operacion} puedeAutorizar={access.editar}
        onAutorizar={async motivo => { await autorizarSalida(viaje.id, motivo); setAviso('Salida autorizada.'); await cargar(); }} />}

      {esLogistica ? viaje.observaciones && <section className="dx-tmsvd-blk dx-tmsvd-o2"><header><h3>Indicaciones</h3></header>
        <div className="dx-tmsvd-in"><b>{viaje.observaciones}</b></div></section>
      : <section className="dx-tmsvd-blk dx-tmsvd-o2"><header><h3>Carga</h3></header><div className="dx-tmsvd-in dx-tmsvd-kv">
        <div className="is-wide"><small>Descripción</small><b>{viaje.carga_descripcion || '—'}</b></div>
        <div><small>Tipo de carga</small><b>{TIPOS_CARGA[viaje.tipo_carga] || viaje.tipo_carga || '—'}</b></div>
        <div><small>Peso</small><b className="is-big">{viaje.peso_toneladas != null ? `${formatearNumeroTransporte(viaje.peso_toneladas)} t` : '—'}</b></div>
        <div><small>Volumen</small><b className={viaje.volumen_m3 == null ? 'is-muted' : ''}>{viaje.volumen_m3 != null ? `${formatearNumeroTransporte(viaje.volumen_m3)} m³` : 'No registrado'}</b></div>
        {viaje.carga_bultos != null && <div><small>Bultos</small><b>{formatearNumeroTransporte(viaje.carga_bultos)} {viaje.carga_unidad_bultos || ''}</b></div>}
        <div className="is-wide"><small>Requisitos</small><div className="dx-tms-chips">{(viaje.requisitos || []).length
          ? viaje.requisitos.map(item => <span key={item} className="dx-tmsvd-req">✓ {REQUISITOS[item] || item}</span>) : <b className="is-muted">Sin requisitos especiales</b>}</div></div>
        {viaje.observaciones && <div className="is-wide"><small>Observaciones</small><b>{viaje.observaciones}</b></div>}
      </div></section>}

      <section className="dx-tmsvd-blk dx-tmsvd-o5"><header><h3>Bitácora</h3><small>{etiquetaContador((viaje.eventos || []).length, 'evento')}</small></header>
        {!(viaje.eventos || []).length && <div className="dx-tmsvd-stops-empty">Aún no hay eventos registrados.</div>}
        <ol className="dx-tmsvd-log">{[...(viaje.eventos || [])].reverse().map(evento => {
          const clave = evento.estado_anterior === evento.estado_nuevo ? 'nota' : evento.estado_nuevo;
          const texto = (evento.nota || '').replace(/^Asignación:\s*/, '');
          return <li key={evento.id}><span className={`dx-tmsvd-ei ${TONO_EVENTO[clave] || ''}`} aria-hidden="true">{clave === 'nota' ? '✎' : ICONO_EVENTO[clave] || '•'}</span>
            <div><b>{tituloEvento(evento)}</b>{texto && <small>{texto}</small>}</div><time>{fechaCorta(evento.created_at)}</time></li>;
        })}</ol>
        {access.editar && <form className="dx-tmsvd-note" onSubmit={event => { event.preventDefault(); guardarNota(); }}>
          <input aria-label="Agregar nota a la bitácora" placeholder="Agregar una nota a la bitácora…" value={nota} onChange={event => setNota(event.target.value)} />
          <button type="submit" className="dx-btn" disabled={!nota.trim() || busy}>Agregar</button></form>}
      </section>
      </div>
      <div className="dx-tmsvd-side">
      <section className="dx-tmsvd-blk dx-tmsvd-o0"><header><h3>Unidad y conductor</h3></header><div className="dx-tmsvd-in">
        {!viaje.vehiculo ? <div className="dx-tmsvd-empty"><span className="dx-tmsvd-empty-i" aria-hidden="true">⛟</span><b>Sin unidad ni conductor</b>
          <span>Requiere {(viaje.tipo_unidad ? etiquetaTipoVehiculo(viaje.tipo_unidad) : 'una unidad').toLocaleLowerCase('es-PE')}{viaje.peso_toneladas != null ? ` para ${formatearNumeroTransporte(viaje.peso_toneladas)} t` : ''}
            {(viaje.requisitos || []).length ? ` · ${viaje.requisitos.map(item => REQUISITOS[item] || item).join(', ')}` : ''}.</span>
          {viaje.estado === 'programado' && access.editar ? <button type="button" className="dx-btn primary" onClick={() => (esLogistica ? onNav('transporte-ruta', { id: viaje.id }) : setDespacho(true))}
            disabled={busy}>{esLogistica ? 'Asignar en la Hoja de Ruta' : 'Asignar y despachar'}</button>
            : <small>Se asigna al despachar.</small>}</div>
          : <div className="dx-tmsvd-res">
            <div className="dx-tmsvd-rcard"><span className="dx-tmsvd-ri" aria-hidden="true">⛟</span><div><b>{viaje.vehiculo.placa}</b>
              <small>{[etiquetaTipoVehiculo(viaje.vehiculo.tipo), [viaje.vehiculo.marca, viaje.vehiculo.modelo].filter(Boolean).join(' '),
                viaje.vehiculo.capacidad_toneladas != null && `${formatearNumeroTransporte(viaje.vehiculo.capacidad_toneladas)} t`].filter(Boolean).join(' · ')}</small></div></div>
            {viaje.conductor && <div className="dx-tmsvd-rcard"><span className="dx-tmsvd-ri" aria-hidden="true">{iniciales(viaje.conductor.nombre)}</span><div><b>{viaje.conductor.nombre}</b>
              <small>{[viaje.conductor.brevete && `Brevete ${viaje.conductor.brevete}`, viaje.conductor.categoria_brevete].filter(Boolean).join(' · ')}</small></div></div>}
            {viaje.transportista && <small className="dx-tms-muted">{viaje.transportista.nombre_comercial || viaje.transportista.razon_social} · {viaje.transportista.tipo_operador === 'propio' ? 'propio' : 'tercero'}</small>}
            <div className="dx-tmsvd-docs"><div><i className={`dx-tms-dot is-${docUnidad.clave}`} />Certificado MTC {viaje.vehiculo.nro_certificado_habilitacion || ''}<span>{docUnidad.etiqueta}</span></div>
              {docConductor && <div><i className={`dx-tms-dot is-${docConductor.clave}`} />Brevete<span>{docConductor.etiqueta}</span></div>}</div>
            {viaje.estado === 'programado' && access.editar && <button type="button" className="dx-btn"
              onClick={() => (esLogistica ? onNav('transporte-ruta', { id: viaje.id }) : setDespacho(true))} disabled={busy}>Cambiar asignación</button>}
          </div>}
      </div></section>

      {!esLogistica && <section className="dx-tmsvd-blk dx-tmsvd-o3"><header><h3>Ingreso</h3>{['entregado', 'en_liquidacion', 'cerrado'].includes(viaje.estado) && <span className="dx-tms-mini is-info dx-tmsvd-sp">Guardado</span>}</header>
        <div className="dx-tmsvd-in"><small className="dx-tmsvd-lbl">Ingreso estimado</small><div className="dx-tmsvd-tot">{formatearImporte(viaje.ingreso_estimado, viaje.moneda)}</div>
          <dl className="dx-tmsvd-lines"><dt>Modalidad</dt><dd>{etiquetaModalidad(viaje.modalidad)}</dd>
            <dt>Tarifa unitaria</dt><dd>{formatearImporte(viaje.tarifa_unitaria, viaje.moneda, viaje.modalidad)}</dd>
            <dt>Cantidad</dt><dd>{formatearNumeroTransporte(viaje.cantidad_facturable, 3)}</dd>
            <dt>Mínimo facturable</dt><dd>{viaje.minimo_facturable == null ? '—' : formatearImporte(viaje.minimo_facturable, viaje.moneda)}</dd></dl></div></section>}

      <section className="dx-tmsvd-blk dx-tmsvd-o4"><header><h3>Datos</h3></header><div className="dx-tmsvd-in dx-tmsvd-kv is-one">
        {esLogistica ? <div><small>Tipo</small><b>Logística propia · el costo va al centro de costos</b></div> : <>
        <div><small>Cliente</small><b>{nombreCliente(viaje)}</b></div>
        <div><small>OS del cliente</small><b className={viaje.os ? '' : 'is-muted'}>{viaje.os?.numero || 'Viaje directo (sin OS)'}</b></div></>}
        {viaje.referencia_cliente && <div><small>Referencia del cliente</small><b>{viaje.referencia_cliente}</b></div>}
        {!esLogistica && <div><small>Ruta maestra</small><b className={viaje.ruta ? '' : 'is-muted'}>{viaje.ruta ? [viaje.ruta.codigo, viaje.ruta.nombre].filter(Boolean).join(' · ') : 'Sin ruta maestra'}</b></div>}
        <div><small>Creado</small><b>{formatearFechaHoraTransporte(viaje.created_at)}</b></div>
      </div></section>

      </div>
    </div>

    {confirmar && <Confirmacion datos={confirmar} busy={busy} error={accionError} onCancel={() => { setConfirmar(null); setAccionError(''); }}
      onConfirm={valor => confirmar.tipo === 'eliminar' ? eliminar() : confirmar.tipo === 'cancelar'
        ? transicion('cancelado', valor, 'Viaje cancelado.') : transicion('con_incidente', valor, 'Incidente reportado.')} />}
    <DespachoPanel open={despacho} viaje={viaje} empresaId={empresaId} onClose={() => setDespacho(false)}
      onDone={despachado => { setDespacho(false); setAviso(despachado ? 'Viaje despachado.' : 'Asignación guardada.'); cargar(); }} />
  </section>;
}

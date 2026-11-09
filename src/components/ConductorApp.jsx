import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../icons.jsx';
import * as storageService from '../services/storageService.js';
import {
  agregarParadaLibre, completarParada, continuarViaje, iniciarViaje, listarViajesConductor, marcarLlegada, obtenerViajeCompleto,
  registrarGasto, registrarHito, registrarInspeccion, registrarLectura, reportarIncidente, terminarRutaLogistica,
} from '../services/hojaRutaService.js';
import {
  HITOS_COMERCIAL, INSPECCION_PUNTOS, NOVEDADES_CARGA, TIPOS_GASTO, duracionTexto, esperasViaje, fechaLima, hitoRegistrado,
  horaLima, hoyLima, ordenarParadas, resumenInspeccion, resumenParadas, siguienteHito, totalGastos, validarConstancia, ventanaTexto,
} from '../lib/transporteLogistica.js';
import '../conductor_app.css';

const ESTADO = {
  borrador: ['Borrador', 'gray'], programado: ['Programado', 'orange'], despachado: ['Despachado', 'cyan'], en_ruta: ['En ruta', 'violet'],
  con_incidente: ['Con incidente', 'red'], entregado: ['Entregado', 'green'],
};
const REQUISITOS = { gps: 'GPS', epp: 'EPP completo', sctr: 'SCTR', escolta: 'Escolta', refrigerado: 'Refrigerado' };
const cliente = viaje => viaje.cuenta?.nombre_comercial || viaje.cuenta?.razon_social || 'Cliente';
const fechaDM = valor => { const iso = fechaLima(valor); return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''; };
const accionParada = parada => (parada.tipo === 'recojo' ? 'Recoger' : parada.tipo === 'origen' ? 'Carga' : parada.tipo === 'destino' ? 'Destino' : 'Entregar');

async function capturarGps() {
  if (!navigator.geolocation) return {};
  try {
    const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }));
    return { latitud: pos.coords.latitude, longitud: pos.coords.longitude };
  } catch { return {}; }
}

function Firma({ onChange }) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const [trazo, setTrazo] = useState(false);
  const preparar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const ancho = Math.max(canvas.clientWidth || 300, 240);
    canvas.width = ancho * ratio; canvas.height = 160 * ratio;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, ancho, 160);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a';
  }, []);
  useEffect(() => { preparar(); }, [preparar]);
  const punto = event => { const r = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; };
  const limpiar = () => { preparar(); setTrazo(false); onChange(null); };
  return <div className="dx-cond-firma">
    <canvas ref={canvasRef} aria-label="Espacio para la firma"
      onPointerDown={event => { const p = punto(event); const ctx = event.currentTarget.getContext('2d'); event.currentTarget.setPointerCapture?.(event.pointerId);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); dibujando.current = true; }}
      onPointerMove={event => { if (!dibujando.current) return; const p = punto(event); const ctx = event.currentTarget.getContext('2d'); ctx.lineTo(p.x, p.y); ctx.stroke(); }}
      onPointerUp={() => { if (!dibujando.current) return; dibujando.current = false; setTrazo(true); onChange(canvasRef.current); }}
      onPointerCancel={() => { dibujando.current = false; }} />
    <div className="dx-cond-row"><small className={trazo ? 'dx-cond-ok' : ''}>{trazo ? '✓ Firma capturada' : 'Firma obligatoria'}</small>
      <button type="button" className="btn btn-secondary btn-sm" onClick={limpiar}>Limpiar</button></div>
  </div>;
}

function Foto({ etiqueta, url, subiendo, onArchivo }) {
  return <label className={`btn btn-secondary dx-cond-foto${url ? ' is-ok' : ''}`}>
    {I.camera} {subiendo ? 'Subiendo foto…' : url ? `✓ ${etiqueta}` : etiqueta}
    <input type="file" accept="image/*" capture="environment" hidden disabled={subiendo} onChange={onArchivo} />
  </label>;
}

function Cabecera({ titulo, sub, onVolver }) {
  return <>
    <button type="button" className="dx-cond-back" onClick={onVolver}>← {sub || 'Volver'}</button>
    <h2 className="font-display dx-cond-h2">{titulo}</h2>
  </>;
}

// App del conductor: rutas de logística propia (simple) y servicios comerciales (completo).
export function ConductorApp({ usuario, authUser, empresa, addToast }) {
  const [viajes, setViajes] = useState([]);
  const [vinculado, setVinculado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [vista, setVista] = useState({ tipo: 'inicio' });
  const [detalle, setDetalle] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    if (!empresa?.id || !authUser?.id) return;
    setErrorCarga('');
    try {
      const datos = await listarViajesConductor(empresa.id, authUser.id);
      setViajes(datos.viajes); setVinculado(datos.vinculado);
    } catch (e) { setErrorCarga(e.message || 'No se pudieron cargar tus viajes.'); }
    finally { setCargando(false); }
  }, [empresa?.id, authUser?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirViaje = useCallback(async (viajeId, destino = 'viaje') => {
    const extra = typeof destino === 'string' ? { tipo: destino } : destino;
    try { setDetalle(await obtenerViajeCompleto(viajeId)); setVista({ ...extra, viajeId }); }
    catch (e) { addToast?.(e.message || 'No se pudo abrir el viaje.'); }
  }, [addToast]);
  const refrescar = async () => {
    await cargar();
    if (vista.viajeId) setDetalle(await obtenerViajeCompleto(vista.viajeId).catch(() => null));
  };
  const accion = async (fn, mensaje, despues) => {
    if (ocupado) return false;
    setOcupado(true);
    try { await fn(); if (mensaje) addToast?.(mensaje); await refrescar(); despues?.(); return true; }
    catch (e) { addToast?.(e.message || 'No se pudo guardar.'); return false; }
    finally { setOcupado(false); }
  };
  const subir = async (file, entidad, id) => {
    const resultado = await storageService.subirObjetoSinAdjunto({ empresaId: empresa.id, entidadTipo: entidad, entidadId: id, file,
      bucket: storageService.STORAGE_BUCKETS.DOCUMENTOS_GENERALES });
    return resultado.url;
  };
  const hojaPdf = async viaje => {
    const completo = viaje.paradas ? viaje : await obtenerViajeCompleto(viaje.id);
    const { generarHojaRutaPdf } = await import('../lib/hojaRutaPdf.js');
    generarHojaRutaPdf({ viajes: [completo], empresa: empresa?.razon_social || empresa?.nombre || '' }).save(`hoja-ruta-${viaje.codigo}.pdf`);
  };
  const volverInicio = () => { setVista({ tipo: 'inicio' }); setDetalle(null); };

  const header = <div className="mobile-header">
    <div><div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Perfil Logística</div>
      <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>{usuario.nombre}</div></div>
    <div className="avatar" style={{ width: 34, height: 34 }}>{usuario.iniciales}</div>
  </div>;
  const nav = <div className="mobile-nav"><div className="mobile-nav-item active">{I.truck}Rutas</div>
    <div className="mobile-nav-item">{I.clipboard}Guías</div><div className="mobile-nav-item">{I.settings}Ajustes</div></div>;

  let contenido;
  if (vista.tipo !== 'inicio' && detalle) {
    const props = { viaje: detalle, ocupado, accion, subir, volver: () => setVista({ tipo: detalle.tipo_viaje === 'comercial' ? 'viaje' : 'inicio', viajeId: detalle.id }),
      alInicio: volverInicio, addToast, abrir: (tipo, extra = {}) => setVista({ tipo, viajeId: detalle.id, ...extra }), hojaPdf };
    if (vista.tipo === 'viaje') contenido = <ViajeComercial {...props} volver={volverInicio} />;
    else if (vista.tipo === 'inspeccion') contenido = <Inspeccion {...props} />;
    else if (vista.tipo === 'entrega') contenido = <Constancia {...props} parada={detalle.paradas.find(p => p.id === vista.paradaId)} />;
    else if (vista.tipo === 'gasto') contenido = <Gasto {...props} />;
    else if (vista.tipo === 'incidente') contenido = <Incidente {...props} paradaId={vista.paradaId} />;
    else if (vista.tipo === 'lectura') contenido = <Lectura {...props} />;
    else if (vista.tipo === 'libre') contenido = <ParadaLibre {...props} />;
  }
  if (!contenido) {
    contenido = <Inicio viajes={viajes} cargando={cargando} error={errorCarga} vinculado={vinculado} ocupado={ocupado} onReintentar={cargar}
      abrirViaje={abrirViaje} accion={accion} hojaPdf={hojaPdf} />;
  }
  return <div className="dx-cond">{header}<div className="mobile-content">{contenido}</div>{nav}</div>;
}

function Inicio({ viajes, cargando, error, vinculado, ocupado, onReintentar, abrirViaje, accion, hojaPdf }) {
  if (cargando) return <div className="card dx-cond-card"><div className="text-muted">Cargando tus viajes…</div></div>;
  if (error) return <div className="card dx-cond-card"><b>No pudimos cargar tus viajes</b><div className="text-muted">{error}</div>
    <button type="button" className="btn btn-primary" onClick={onReintentar}>Reintentar</button></div>;
  return <>
    <div className="eyebrow" style={{ marginBottom: 10 }}>Rutas y viajes · Hoy</div>
    {!vinculado && <div className="dx-cond-aviso">Ves los viajes de la empresa. Pide que vinculen tu usuario a tu ficha de conductor (Operaciones › Flota) para ver solo los tuyos.</div>}
    {!viajes.length && <div className="card dx-cond-card"><div className="text-muted">No tienes rutas ni viajes para hoy.</div></div>}
    {viajes.map(viaje => viaje.tipo_viaje === 'comercial'
      ? <TarjetaComercial key={viaje.id} viaje={viaje} onAbrir={() => abrirViaje(viaje.id)} />
      : <TarjetaLogistica key={viaje.id} viaje={viaje} ocupado={ocupado} accion={accion} abrirViaje={abrirViaje} hojaPdf={hojaPdf} />)}
  </>;
}

function Estado({ viaje }) {
  const [texto, color] = ESTADO[viaje.estado] || [viaje.estado, 'gray'];
  return <span className={`badge badge-${color}`}>{texto}</span>;
}

function TarjetaComercial({ viaje, onAbrir }) {
  const salio = fechaLima(viaje.fecha_programada) < hoyLima();
  return <div className="card dx-cond-card">
    <div className="dx-cond-row"><span className="mono" style={{ fontWeight: 600 }}>{viaje.codigo}</span><span className="badge badge-cyan">Servicio comercial</span></div>
    <div className="text-muted dx-cond-sub">{cliente(viaje)} · {viaje.vehiculo?.placa || 'sin unidad'} · {viaje.origen_nombre} → {viaje.destino_nombre}</div>
    <div className="text-muted dx-cond-sub">{salio ? `Salió el ${fechaDM(viaje.fecha_programada)}` : `Sale ${horaLima(viaje.fecha_programada)}`} · <Estado viaje={viaje} /></div>
    <button type="button" className="btn btn-primary btn-lg dx-cond-full" onClick={onAbrir}>Abrir viaje</button>
  </div>;
}

function TarjetaLogistica({ viaje, ocupado, accion, abrirViaje, hojaPdf }) {
  const paradas = ordenarParadas(viaje.paradas);
  const resumen = resumenParadas(paradas);
  const enCurso = ['en_ruta', 'con_incidente'].includes(viaje.estado);
  return <div className="card dx-cond-card">
    <div className="dx-cond-row"><span className="mono" style={{ fontWeight: 600 }}>{viaje.codigo}</span><Estado viaje={viaje} /></div>
    <div className="text-muted dx-cond-sub">Logística propia · {viaje.vehiculo?.placa || 'sin unidad'} · {resumen.total} parada{resumen.total === 1 ? '' : 's'} · sale {horaLima(viaje.fecha_programada)}</div>
    {viaje.observaciones && <div className="dx-cond-nota">{viaje.observaciones}</div>}
    {enCurso && <div className="dx-cond-b3">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirViaje(viaje.id, 'lectura')}>{I.camera} Lectura</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirViaje(viaje.id, 'incidente')}>{I.alert} Incidente</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirViaje(viaje.id, 'libre')}>＋ Parada</button></div>}
    <button type="button" className="btn btn-secondary dx-cond-full" onClick={() => hojaPdf(viaje)}>⎙ Ver hoja de ruta (PDF)</button>
    {['programado', 'despachado'].includes(viaje.estado) && <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado}
      onClick={async () => accion(async () => iniciarViaje(viaje.id, await capturarGps()), 'Ruta iniciada.')}>▶ Iniciar ruta</button>}
    {paradas.map(parada => <div key={parada.id} className="dx-cond-stop">
      <div className="dx-cond-row"><b>Parada {parada.secuencia} · {parada.nombre}</b>
        <span className={`badge badge-${parada.estado === 'completada' ? 'green' : parada.estado === 'omitida' ? 'gray' : 'orange'}`}>
          {parada.estado === 'completada' ? 'Completada' : parada.estado === 'omitida' ? 'Omitida' : parada.llegada_at ? 'En la parada' : 'Pendiente'}</span></div>
      <div className="text-muted dx-cond-sub">{accionParada(parada)}{parada.descripcion ? ` · ${parada.descripcion}` : ''}{parada.direccion ? ` · ${parada.direccion}` : ''}
        {ventanaTexto(parada.ventana_inicio, parada.ventana_fin) ? ` · ${ventanaTexto(parada.ventana_inicio, parada.ventana_fin)}` : ''}</div>
      {enCurso && parada.estado === 'pendiente' && <>
        <div className="dx-cond-b2">
          <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || Boolean(parada.llegada_at)}
            onClick={async () => accion(async () => marcarLlegada(parada.id, await capturarGps()), 'Llegada registrada.')}>📍 {parada.llegada_at ? `Llegaste ${horaLima(parada.llegada_at)}` : 'Llegué'}</button>
          {parada.direccion || parada.latitud ? <a className="btn btn-secondary btn-sm" target="_blank" rel="noreferrer"
            href={parada.latitud ? `https://www.google.com/maps/dir/?api=1&destination=${parada.latitud},${parada.longitud}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parada.direccion)}`}>🧭 Cómo llegar</a> : <span />}
        </div>
        <button type="button" className="btn btn-primary btn-sm dx-cond-full" onClick={() => abrirViaje(viaje.id, { tipo: 'entrega', paradaId: parada.id })}>{I.check} Gestionar parada</button>
      </>}
    </div>)}
    {enCurso && resumen.pendientes === 0 && <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado}
      onClick={() => accion(() => terminarRutaLogistica(viaje.id, {}), 'Ruta terminada.')}>■ Terminar ruta</button>}
  </div>;
}

function ViajeComercial({ viaje, ocupado, accion, abrir, volver, hojaPdf }) {
  const hitos = viaje.hitos || [];
  const siguiente = siguienteHito(hitos);
  const esperas = esperasViaje(hitos);
  const destino = ordenarParadas(viaje.paradas).find(p => p.tipo === 'destino' && p.estado === 'pendiente');
  const ins = viaje.inspeccion;
  const esperaAutorizacion = ins && ins.criticos > 0 && !ins.autorizada_at;
  let principal = null;
  if (['programado', 'despachado'].includes(viaje.estado)) {
    if (!ins) principal = <button type="button" className="btn btn-primary btn-lg dx-cond-full" onClick={() => abrir('inspeccion')}>Inspección antes de salir</button>;
    else if (viaje.estado === 'programado') principal = <div className="dx-cond-aviso">Inspección lista. Espera a que el despachador despache el viaje para salir.</div>;
    else if (esperaAutorizacion) principal = <div className="dx-cond-aviso is-red">Hay puntos críticos en la inspección: espera la autorización del despachador.</div>;
    else principal = <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado}
      onClick={async () => accion(async () => iniciarViaje(viaje.id, await capturarGps()), 'Salida registrada.')}>▶ Salí · registrar hora y GPS</button>;
  } else if (viaje.estado === 'con_incidente') {
    principal = <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado}
      onClick={() => accion(() => continuarViaje(viaje.id), 'Ruta reanudada.')}>Continuar ruta</button>;
  } else if (viaje.estado === 'en_ruta' && siguiente) {
    if (siguiente.key === 'entregado' || (siguiente.key === 'fin_descarga' && destino)) {
      principal = <>
        {siguiente.key === 'fin_descarga' && <button type="button" className="btn btn-secondary btn-lg dx-cond-full" disabled={ocupado}
          onClick={async () => accion(async () => registrarHito(viaje.id, 'fin_descarga', await capturarGps()), 'Fin de descarga registrado.')}>Terminé de descargar</button>}
        {destino && <button type="button" className="btn btn-primary btn-lg dx-cond-full" onClick={() => abrir('entrega', { paradaId: destino.id })}>Registrar conformidad del cliente</button>}
      </>;
    } else {
      principal = <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado}
        onClick={async () => accion(async () => registrarHito(viaje.id, siguiente.key, await capturarGps()), `${siguiente.label} registrado.`)}>📍 {siguiente.accion}</button>;
    }
  } else if (viaje.estado === 'entregado') {
    principal = <div className="dx-cond-aviso is-green">Entregado con conformidad. ¡Buen viaje!</div>;
  }
  return <>
    <Cabecera titulo={viaje.codigo} sub="Volver a Rutas" onVolver={volver} />
    <div className="dx-cond-row" style={{ marginBottom: 6 }}><span className="text-muted dx-cond-sub">{cliente(viaje)}{viaje.referencia_cliente ? ` · Ref. ${viaje.referencia_cliente}` : ''}</span><Estado viaje={viaje} /></div>
    <div className="dx-cond-kv">
      <div><small>Carga</small><b>{viaje.carga_descripcion || '—'}</b></div>
      <div><small>Bultos · peso</small><b>{[viaje.carga_bultos != null && `${viaje.carga_bultos}`, viaje.peso_toneladas != null && `${viaje.peso_toneladas} t`].filter(Boolean).join(' · ') || '—'}</b></div>
      <div><small>Origen</small><b>{viaje.origen_nombre}</b></div>
      <div><small>Destino</small><b>{viaje.destino_nombre}</b></div>
    </div>
    {(viaje.requisitos || []).length > 0 && <div className="dx-cond-req">{viaje.requisitos.map(r => <span key={r}>{REQUISITOS[r] || r}</span>)}</div>}
    {viaje.contacto?.telefono && <a className="btn btn-secondary dx-cond-full" href={`tel:${viaje.contacto.telefono}`}>📞 Llamar a {viaje.contacto.nombre}</a>}
    <div className="dx-cond-sec">Hitos</div>
    <ol className="dx-cond-hitos">{HITOS_COMERCIAL.map(hito => {
      const registro = hitoRegistrado(hitos, hito.key);
      const espera = hito.key === 'fin_carga' ? esperas.carga : hito.key === 'fin_descarga' ? esperas.descarga : null;
      return <li key={hito.key} className={registro ? 'is-ok' : siguiente?.key === hito.key ? 'is-next' : ''}><i aria-hidden="true" />
        <span>{hito.label}{espera != null && <em> espera {duracionTexto(espera)}</em>}</span>
        <time>{registro ? `${fechaDM(registro.ocurrido_at)} ${horaLima(registro.ocurrido_at)}` : '—'}</time></li>;
    })}</ol>
    {principal}
    <div className="dx-cond-b3">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrir('incidente')}>{I.alert} Incidente</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrir('gasto')}>S/ Gasto</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => hojaPdf(viaje)}>⎙ Hoja</button></div>
    <div className="text-muted dx-cond-sub">La ruta es la contratada: un desvío o una parada no prevista se reporta como incidente.</div>
  </>;
}

function Inspeccion({ viaje, ocupado, accion, subir, volver }) {
  const previo = viaje.inspeccion;
  const [items, setItems] = useState(() => INSPECCION_PUNTOS.map(p => {
    const guardado = (previo?.items || []).find(i => i.texto === p.texto);
    return { ...p, ok: guardado ? guardado.ok : true, observacion: guardado?.observacion || '' };
  }));
  const [requisitos, setRequisitos] = useState(() => (viaje.requisitos || []).map(r => ({ texto: REQUISITOS[r] || r, ok: true })));
  const [km, setKm] = useState(previo?.km_salida ?? '');
  const [foto, setFoto] = useState(previo?.foto_tablero_url || '');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const resumen = resumenInspeccion(items);
  const cambiar = (index, cambios) => setItems(old => old.map((item, i) => (i === index ? { ...item, ...cambios } : item)));
  const archivo = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setSubiendo(true);
    try { setFoto(await subir(file, 'transporte_inspecciones', `${viaje.id}-${Date.now()}`)); } catch (e) { setError(e.message || 'No se pudo subir la foto.'); }
    finally { setSubiendo(false); event.target.value = ''; }
  };
  const guardar = () => {
    if (!(Number(km) > 0)) { setError('Registra el km de salida.'); return; }
    if (items.some(i => !i.ok && !i.observacion.trim())) { setError('Describe cada punto observado.'); return; }
    accion(() => registrarInspeccion(viaje.id, { items, requisitos, km_salida: km, foto_tablero_url: foto }),
      resumen.criticos ? 'Inspección guardada: el despachador debe autorizar la salida.' : 'Inspección guardada.', volver);
  };
  return <>
    <Cabecera titulo="Antes de salir" sub={viaje.codigo} onVolver={volver} />
    <div className="text-muted dx-cond-sub">{viaje.vehiculo?.placa || 'Unidad'} · marca cada punto</div>
    <div className="dx-cond-sec">Inspección de la unidad</div>
    {items.map((item, index) => <div key={item.texto} className="dx-cond-chk">
      <span>{item.texto}{item.critico && <em> crítico</em>}</span>
      <div className="dx-cond-seg" role="radiogroup" aria-label={item.texto}>
        <button type="button" role="radio" aria-checked={item.ok} className={item.ok ? 'is-ok' : ''} onClick={() => cambiar(index, { ok: true })}>Bien</button>
        <button type="button" role="radio" aria-checked={!item.ok} className={!item.ok ? 'is-bad' : ''} onClick={() => cambiar(index, { ok: false })}>Falla</button></div>
      {!item.ok && <input className="input" placeholder="¿Qué observaste?" value={item.observacion} onChange={event => cambiar(index, { observacion: event.target.value })} />}
    </div>)}
    {requisitos.length > 0 && <><div className="dx-cond-sec">Requisitos del cliente</div>
      {requisitos.map((req, index) => <label key={req.texto} className="dx-cond-check"><input type="checkbox" checked={req.ok}
        onChange={event => setRequisitos(old => old.map((r, i) => (i === index ? { ...r, ok: event.target.checked } : r)))} />{req.texto}</label>)}</>}
    <div className="dx-cond-sec">Kilometraje</div>
    <label className="dx-cond-field">Km de salida *<input className="input" inputMode="decimal" value={km} onChange={event => setKm(event.target.value.replace(',', '.'))} /></label>
    <Foto etiqueta="Foto del tablero (opcional)" url={foto} subiendo={subiendo} onArchivo={archivo} />
    {resumen.criticos > 0 && <div className="dx-cond-aviso is-red">Un punto crítico en falla bloquea la salida hasta que el despachador la autorice.</div>}
    {error && <div className="dx-cond-aviso is-red" role="alert">{error}</div>}
    <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado || subiendo} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar inspección'}</button>
  </>;
}

function Constancia({ viaje, parada, ocupado, accion, subir, volver }) {
  const comercial = viaje.tipo_viaje === 'comercial';
  const [datos, setDatos] = useState({ recibe_nombre: '', recibe_dni: '', bultos_recibidos: viaje.carga_bultos ?? '', novedad: comercial ? 'conforme' : '',
    observaciones: '', km: '', foto: '', foto_carga: '' });
  const [firma, setFirma] = useState(null);
  const [subiendo, setSubiendo] = useState('');
  const [errores, setErrores] = useState({});
  const [omitir, setOmitir] = useState(false);
  if (!parada) return <><Cabecera titulo="Parada" onVolver={volver} /><div className="text-muted">La parada ya no está disponible.</div></>;
  const set = (clave, valor) => { setDatos(old => ({ ...old, [clave]: valor })); setErrores(old => ({ ...old, [clave]: '' })); };
  const archivo = clave => async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setSubiendo(clave);
    try { set(clave, await subir(file, 'transporte_paradas', `${parada.id}-${clave}-${Date.now()}`)); } catch (e) { setErrores(old => ({ ...old, [clave]: e.message || 'No se pudo subir la foto.' })); }
    finally { setSubiendo(''); event.target.value = ''; }
  };
  async function finalizar() {
    const errs = validarConstancia({ tipoViaje: viaje.tipo_viaje, tipoParada: parada.tipo, datos: { ...datos, firma: Boolean(firma) } });
    setErrores(errs);
    if (Object.keys(errs).length) return;
    await accion(async () => {
      const blob = await new Promise(resolve => firma.toBlob(resolve, 'image/png'));
      const firmaUrl = await subir(new File([blob], `firma-${parada.id}.png`, { type: 'image/png' }), 'transporte_paradas', `${parada.id}-firma`);
      const gps = await capturarGps();
      await completarParada(parada.id, { recibe_nombre: datos.recibe_nombre, recibe_dni: datos.recibe_dni, firma_url: firmaUrl,
        foto_url: datos.foto, foto_carga_url: datos.foto_carga, bultos_recibidos: datos.bultos_recibidos, novedad: datos.novedad,
        observaciones: datos.observaciones, km: datos.km, ...gps });
    }, comercial ? 'Conformidad registrada.' : 'Parada completada.', volver);
  }
  async function confirmarOmitir() {
    if (!datos.observaciones.trim()) { setErrores({ observaciones: 'Indica por qué se omite la parada.' }); return; }
    await accion(async () => completarParada(parada.id, { omitir: true, observaciones: datos.observaciones, ...(await capturarGps()) }), 'Parada omitida.', volver);
  }
  const err = clave => errores[clave] && <small className="dx-cond-err">{errores[clave]}</small>;
  return <>
    <Cabecera titulo={comercial ? 'Conformidad del cliente' : 'Confirmación de recepción'} sub={viaje.codigo} onVolver={volver} />
    <div className="text-muted mono dx-cond-sub">Parada {parada.secuencia} · {parada.nombre}{parada.descripcion ? ` · ${parada.descripcion}` : ''}</div>
    <div className={comercial ? 'dx-cond-g2' : ''}>
      <label className="dx-cond-field">Nombre de quien {parada.tipo === 'recojo' ? 'entrega' : 'recibe'} *<input className="input" value={datos.recibe_nombre} onChange={event => set('recibe_nombre', event.target.value)} />{err('recibe_nombre')}</label>
      {comercial && <label className="dx-cond-field">DNI *<input className="input" inputMode="numeric" maxLength={12} value={datos.recibe_dni} onChange={event => set('recibe_dni', event.target.value.replace(/\D/g, ''))} />{err('recibe_dni')}</label>}
    </div>
    {comercial && <>
      <div className="dx-cond-sec">Bultos recibidos</div>
      <div className="dx-cond-num"><button type="button" className="btn btn-secondary" onClick={() => set('bultos_recibidos', Math.max(0, Number(datos.bultos_recibidos || 0) - 1))}>−</button>
        <b>{datos.bultos_recibidos === '' ? '—' : datos.bultos_recibidos}{viaje.carga_bultos != null ? ` de ${viaje.carga_bultos}` : ''}</b>
        <button type="button" className="btn btn-secondary" onClick={() => set('bultos_recibidos', Number(datos.bultos_recibidos || 0) + 1)}>＋</button></div>{err('bultos_recibidos')}
      <div className="dx-cond-sec">Estado de la carga</div>
      <div className="dx-cond-chips">{NOVEDADES_CARGA.map(([clave, texto]) => <button key={clave} type="button" className={datos.novedad === clave ? 'is-on' : ''}
        aria-pressed={datos.novedad === clave} onClick={() => set('novedad', clave)}>{texto}</button>)}</div>{err('novedad')}
    </>}
    <div className="dx-cond-sec">Firma</div>
    <Firma onChange={canvas => { setFirma(canvas); setErrores(old => ({ ...old, firma: '' })); }} />{err('firma')}
    <Foto etiqueta={comercial ? 'Foto de la guía firmada *' : 'Foto de la guía firmada (opcional)'} url={datos.foto} subiendo={subiendo === 'foto'} onArchivo={archivo('foto')} />{err('foto')}
    {comercial && <Foto etiqueta="Foto de la carga (opcional)" url={datos.foto_carga} subiendo={subiendo === 'foto_carga'} onArchivo={archivo('foto_carga')} />}
    {comercial && parada.tipo === 'destino' && <label className="dx-cond-field">Km de llegada *<input className="input" inputMode="decimal" value={datos.km} onChange={event => set('km', event.target.value.replace(',', '.'))} />{err('km')}</label>}
    <label className="dx-cond-field">Observaciones{comercial && datos.novedad !== 'conforme' ? ' *' : ''}<textarea className="input" rows={3} value={datos.observaciones}
      placeholder="Observaciones de la parada" onChange={event => set('observaciones', event.target.value)} />{err('observaciones')}</label>
    <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado || Boolean(subiendo)} onClick={finalizar}>{ocupado ? 'Guardando…' : comercial ? 'Finalizar entrega' : 'Finalizar parada'}</button>
    {!comercial && (omitir ? <button type="button" className="btn btn-secondary dx-cond-full" disabled={ocupado} onClick={confirmarOmitir}>Confirmar: omitir parada</button>
      : <button type="button" className="btn btn-secondary dx-cond-full" onClick={() => setOmitir(true)}>Omitir parada</button>)}
    {omitir && <div className="text-muted dx-cond-sub">Escribe el motivo en Observaciones; el pedido vuelve a «Por enviar a ruta».</div>}
    {comercial && <div className="text-muted dx-cond-sub">Al finalizar se registra la hora, el GPS y la conformidad del cliente para la facturación.</div>}
  </>;
}

function Gasto({ viaje, ocupado, accion, subir, volver }) {
  const [form, setForm] = useState({ tipo: 'peaje', monto: '', lugar: '', foto_url: '' });
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const gastos = viaje.gastos || [];
  const archivo = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setSubiendo(true);
    try { const url = await subir(file, 'transporte_gastos', `${viaje.id}-${Date.now()}`); setForm(old => ({ ...old, foto_url: url })); }
    catch (e) { setError(e.message || 'No se pudo subir la foto.'); }
    finally { setSubiendo(false); event.target.value = ''; }
  };
  const guardar = () => {
    if (!(Number(form.monto) > 0)) { setError('Ingresa el monto.'); return; }
    if (!form.foto_url) { setError('Toma la foto del comprobante.'); return; }
    accion(() => registrarGasto(viaje.id, form), 'Gasto registrado.', () => setForm({ tipo: form.tipo, monto: '', lugar: '', foto_url: '' }));
    setError('');
  };
  return <>
    <Cabecera titulo="Gasto en ruta" sub={viaje.codigo} onVolver={volver} />
    <div className="text-muted dx-cond-sub">Va a la liquidación del viaje.</div>
    <div className="dx-cond-chips">{TIPOS_GASTO.map(([clave, texto]) => <button key={clave} type="button" className={form.tipo === clave ? 'is-on' : ''}
      aria-pressed={form.tipo === clave} onClick={() => setForm(old => ({ ...old, tipo: clave }))}>{texto}</button>)}</div>
    <div className="dx-cond-g2">
      <label className="dx-cond-field">Monto (S/) *<input className="input" inputMode="decimal" value={form.monto} onChange={event => setForm(old => ({ ...old, monto: event.target.value.replace(',', '.') }))} /></label>
      <label className="dx-cond-field">Lugar<input className="input" value={form.lugar} onChange={event => setForm(old => ({ ...old, lugar: event.target.value }))} /></label></div>
    <Foto etiqueta="Foto del comprobante *" url={form.foto_url} subiendo={subiendo} onArchivo={archivo} />
    {error && <div className="dx-cond-aviso is-red" role="alert">{error}</div>}
    <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado || subiendo} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar gasto'}</button>
    {gastos.length > 0 && <><div className="dx-cond-sec">Registrados en este viaje</div>
      {gastos.map(g => <div key={g.id} className="dx-cond-row dx-cond-gasto"><span>{TIPOS_GASTO.find(([k]) => k === g.tipo)?.[1] || g.tipo}{g.lugar ? ` · ${g.lugar}` : ''}</span><b>S/ {Number(g.monto).toFixed(2)}</b></div>)}
      <div className="dx-cond-row dx-cond-gasto is-total"><b>Total</b><b>S/ {totalGastos(gastos).toFixed(2)}</b></div></>}
  </>;
}

function Incidente({ viaje, paradaId, ocupado, accion, subir, volver }) {
  const [form, setForm] = useState({ tipo: 'otro', severidad: 'media', descripcion: '', foto_url: '' });
  const [subiendo, setSubiendo] = useState(false);
  const archivo = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setSubiendo(true);
    try { const url = await subir(file, 'incidentes_flota', `${viaje.id}-${Date.now()}`); setForm(old => ({ ...old, foto_url: url })); }
    finally { setSubiendo(false); event.target.value = ''; }
  };
  return <>
    <Cabecera titulo="Reportar incidente" sub={viaje.codigo} onVolver={volver} />
    {viaje.tipo_viaje === 'comercial' && <div className="dx-cond-aviso">El viaje quedará «con incidente» y el despachador lo verá en el Monitor.</div>}
    <label className="dx-cond-field">Tipo<select className="select" value={form.tipo} onChange={event => setForm(old => ({ ...old, tipo: event.target.value }))}>
      <option value="mecanico">Mecánico</option><option value="accidente">Accidente</option><option value="retraso">Retraso</option><option value="otro">Otro</option></select></label>
    <label className="dx-cond-field">Severidad<select className="select" value={form.severidad} onChange={event => setForm(old => ({ ...old, severidad: event.target.value }))}>
      <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
    <label className="dx-cond-field">Qué pasó *<textarea className="input" rows={4} value={form.descripcion} onChange={event => setForm(old => ({ ...old, descripcion: event.target.value }))} /></label>
    <Foto etiqueta="Foto (opcional)" url={form.foto_url} subiendo={subiendo} onArchivo={archivo} />
    <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado || subiendo || !form.descripcion.trim()}
      onClick={async () => accion(async () => reportarIncidente(viaje.id, { ...form, parada_id: paradaId, ...(await capturarGps()) }), 'Incidente reportado.', volver)}>
      {ocupado ? 'Guardando…' : 'Guardar incidente'}</button>
  </>;
}

function Lectura({ viaje, ocupado, accion, subir, volver }) {
  const [form, setForm] = useState({ tipo_lectura: 'odometro', valor: '', unidad: 'km', observaciones: '', foto_url: '' });
  const [subiendo, setSubiendo] = useState(false);
  const archivo = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setSubiendo(true);
    try { const url = await subir(file, 'lecturas_flota', `${viaje.id}-${Date.now()}`); setForm(old => ({ ...old, foto_url: url })); }
    finally { setSubiendo(false); event.target.value = ''; }
  };
  return <>
    <Cabecera titulo="Lectura de la unidad" sub={viaje.codigo} onVolver={volver} />
    <label className="dx-cond-field">Tipo de lectura<select className="select" value={form.tipo_lectura}
      onChange={event => setForm(old => ({ ...old, tipo_lectura: event.target.value, unidad: event.target.value === 'horometro' ? 'h' : 'km' }))}>
      <option value="odometro">Odómetro</option><option value="horometro">Horómetro</option></select></label>
    <label className="dx-cond-field">Valor ({form.unidad}) *<input className="input" inputMode="decimal" value={form.valor} onChange={event => setForm(old => ({ ...old, valor: event.target.value.replace(',', '.') }))} /></label>
    <Foto etiqueta="Foto del tablero *" url={form.foto_url} subiendo={subiendo} onArchivo={archivo} />
    <label className="dx-cond-field">Observaciones<textarea className="input" rows={2} value={form.observaciones} onChange={event => setForm(old => ({ ...old, observaciones: event.target.value }))} /></label>
    <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado || subiendo || !form.valor || !form.foto_url}
      onClick={() => accion(() => registrarLectura(viaje.id, form), 'Lectura guardada.', volver)}>{ocupado ? 'Guardando…' : 'Guardar lectura'}</button>
  </>;
}

function ParadaLibre({ viaje, ocupado, accion, subir, volver }) {
  const [form, setForm] = useState({ descripcion: '', nombre: '', direccion: '', foto_url: '' });
  const [subiendo, setSubiendo] = useState(false);
  const archivo = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setSubiendo(true);
    try { const url = await subir(file, 'transporte_paradas', `libre-${viaje.id}-${Date.now()}`); setForm(old => ({ ...old, foto_url: url })); }
    finally { setSubiendo(false); event.target.value = ''; }
  };
  return <>
    <Cabecera titulo="Parada libre" sub={viaje.codigo} onVolver={volver} />
    <label className="dx-cond-field">Qué hay que hacer *<textarea className="input" rows={3} value={form.descripcion} placeholder="Ej.: comprar abrazaderas"
      onChange={event => setForm(old => ({ ...old, descripcion: event.target.value }))} /></label>
    <label className="dx-cond-field">Lugar<input className="input" value={form.nombre} onChange={event => setForm(old => ({ ...old, nombre: event.target.value }))} /></label>
    <label className="dx-cond-field">Dirección<input className="input" value={form.direccion} onChange={event => setForm(old => ({ ...old, direccion: event.target.value }))} /></label>
    <Foto etiqueta="Foto (opcional)" url={form.foto_url} subiendo={subiendo} onArchivo={archivo} />
    <button type="button" className="btn btn-primary btn-lg dx-cond-full" disabled={ocupado || subiendo || !form.descripcion.trim()}
      onClick={async () => accion(async () => agregarParadaLibre(viaje.id, { ...form, ...(await capturarGps()) }), 'Parada agregada a la ruta.', volver)}>
      {ocupado ? 'Guardando…' : 'Guardar parada'}</button>
  </>;
}

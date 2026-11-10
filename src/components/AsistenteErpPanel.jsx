import AriaFab from './AriaFab.jsx';
import AriaLogo from './AriaLogo.jsx';
import AriaTarjetaEgreso from './AriaTarjetaEgreso.jsx';
import AriaMicrofono, { MAX_SEGUNDOS_DICTADO } from './AriaMicrofono.jsx';
import { hablar } from '../lib/ariaHabla.js';
import React, { useEffect, useRef, useState } from 'react';
import { useAsistenteErp } from '../context/AsistenteErpContext.jsx';
import { consultarAsistenteErp, mensajeErrorAsistente } from '../services/asistenteErpService.js';

const LIMITE_DIARIO = 30;

const sugerenciasPorTipo = {
  cotizacion: ['¿En qué estado está esta cotización?', '¿Hasta cuándo es vigente y cuál es el total?', '¿Qué otras cotizaciones tiene este cliente?'],
  orden_compra: ['¿En qué estado está esta orden de compra?', '¿Qué falta recibir de esta orden?', '¿Quién aprobó esta orden?'],
  recepcion: ['¿Qué orden de compra corresponde a esta recepción?', '¿Qué materiales se recibieron?', '¿Hay recepciones pendientes?'],
  solpe: ['¿En qué estado está esta SOLPE?', '¿Quién debe atender esta solicitud?', '¿Hay órdenes de compra relacionadas?'],
  proveedor: ['¿Qué órdenes de compra tiene este proveedor?', '¿Hay recepciones pendientes?', '¿Cuál es el estado de este proveedor?'],
  cuenta: ['¿Qué cotizaciones tiene este cliente?', '¿Qué órdenes de servicio están abiertas?', '¿Cuál es el estado de cuenta?'],
  lead: ['¿En qué etapa está este lead?', '¿Qué actividades tiene pendientes?', '¿Tiene cotizaciones asociadas?'],
  os_cliente: ['¿En qué estado está esta orden de servicio?', '¿Qué avances tiene esta orden?', '¿Qué cotización la originó?'],
};

const sugerenciasPredeterminadas = ['¿Cuánto hay en bancos?', '¿Qué fondos de caja chica debo reponer?', '¿Cuánto tengo vencido por cobrar?', '¿Qué debo pagar con prioridad alta?'];

function etiquetaHerramienta(tool) {
  const nombre = String(tool || '').toLowerCase().replace(/^asistente_/, '');
  const grupos = [
    [['consultar_manual'], 'Consulté el manual'],
    [['resumen_mensual'], 'Calculé el resumen mensual'],
    [['gasto'], 'Revisé Gastos'],
    [['tesoreria'], 'Revisé Tesorería'], [['caja_chica'], 'Revisé Caja chica'], [['cxc'], 'Revisé Cuentas por cobrar'],
    [['cxp'], 'Revisé Cuentas por pagar'], [['cuenta'], 'Revisé Cuentas comerciales'], [['lead'], 'Revisé Leads'],
    [['oportunidad', 'pipeline'], 'Revisé Oportunidades'], [['cotizacion', 'os_cliente'], 'Revisé Cotizaciones'],
    [['proveedor', 'solpe', 'procesos_compra', 'orden_compra', 'ordenes_compra', 'recepcion'], 'Revisé Compras'],
    [['material', 'almacen', 'stock', 'kardex'], 'Revisé Almacén'], [['guia'], 'Revisé Guías de remisión'],
    [['orden_venta', 'ordenes_venta'], 'Revisé Órdenes de venta'], [['contar_registros'], 'Revisé Registros'],
  ];
  return grupos.find(([fragmentos]) => fragmentos.some(fragmento => nombre.includes(fragmento)))?.[1] || 'Revisé tu ERP';
}

function TextoSeguro({ texto }) {
  const lineas = String(texto || '').split('\n');
  return lineas.map((linea, index) => {
    const lista = linea.match(/^\s*[-•]\s+(.+)$/);
    const cifra = linea.match(/^\s*(?:[-•]\s*)?(.+?):\s*((?:S\/|US\$)\s*-?\d[\d,]*(?:\.\d{1,2})?)\s*$/);
    const lineaSinEspacios = linea.trimStart();
    const indiceNota = linea.indexOf('Ojo:');
    const nota = lineaSinEspacios.startsWith('Ojo:');
    const salto = index < lineas.length - 1 ? <br /> : null;
    if (nota) return <div key={index} className="dx-asis-note"><b>Ojo:</b>{lineaSinEspacios.slice(4)}</div>;
    if (indiceNota > 0) return <React.Fragment key={index}>{linea.slice(0, indiceNota)}<div className="dx-asis-note"><b>Ojo:</b>{linea.slice(indiceNota + 4)}</div></React.Fragment>;
    if (cifra) {
      const total = /^total\b/i.test(cifra[1].trim());
      const negativo = /-\d/.test(cifra[2]);
      return <div key={index} className={`dx-asis-amount${total ? ' total' : ''}${negativo ? ' negative' : ''}`}><span>{cifra[1].trim()}</span><b>{cifra[2]}</b></div>;
    }
    if (lista) return <div key={index} className="dx-asis-listitem">• {lista[1]}</div>;
    return <React.Fragment key={index}>{linea}{salto}</React.Fragment>;
  });
}

// Panel de Aria sin dependencia del contexto de una app: lo usan Administración y Operaciones.
export function AsistenteErpPanelBase({ empresaId, sociedadId, nombreUsuario, habilitado, pantallaActiva, ocultarFab = false }) {
  const { contexto, solicitudApertura } = useAsistenteErp();
  const [abierto, setAbierto] = useState(false);
  const [pendientes, setPendientes] = useState(null);
  useEffect(() => {
    const recibir = event => setPendientes(event.detail ?? null);
    window.addEventListener('dx-inicio-pendientes', recibir);
    return () => window.removeEventListener('dx-inicio-pendientes', recibir);
  }, []);
  const [pregunta, setPregunta] = useState('');
  const [mensajes, setMensajes] = useState([]);
  const [error, setError] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const [cuotaRestante, setCuotaRestante] = useState(null);
  const [voz, setVoz] = useState({ estado: 'listo', segundos: 0 });
  const [avisoVoz, setAvisoVoz] = useState(null);
  const [hablando, setHablando] = useState(false);
  const porVoz = useRef(false);
  const detenerLectura = useRef(null);
  const botonRef = useRef(null);
  const campoRef = useRef(null);
  const panelRef = useRef(null);
  const mensajesRef = useRef(null);
  const ultimaConsulta = useRef(null);
  const solicitudInicial = useRef(solicitudApertura);
  const solicitudEnviada = useRef(solicitudApertura);
  const sugerencias = sugerenciasPorTipo[contexto?.tipo] || sugerenciasPredeterminadas;
  const primerNombre = String(nombreUsuario || '').trim().split(/\s+/)[0];
  const tituloContexto = contexto?.etiqueta || (contexto?.tipo ? `${contexto.tipo} ${contexto.id}` : '');
  const agotada = error?.status === 429 || cuotaRestante === 0;

  useEffect(() => { if (abierto) requestAnimationFrame(() => campoRef.current?.focus()); }, [abierto]);
  useEffect(() => {
    const contenedor = mensajesRef.current;
    if (!contenedor) return;
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    contenedor.scrollTo({ top: contenedor.scrollHeight, behavior: reducido ? 'instant' : 'smooth' });
  }, [mensajes, consultando]);
  useEffect(() => {
    if (solicitudApertura !== solicitudInicial.current) {
      solicitudInicial.current = solicitudApertura;
      setAbierto(true);
    }
  }, [solicitudApertura]);
  useEffect(() => {
    if (!abierto) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') { cerrar(); return; }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const enfocables = [...panel.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled):not([type="file"]), a[href]')]
        .filter(elemento => elemento.getClientRects().length > 0 && window.getComputedStyle(elemento).visibility !== 'hidden');
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const activo = document.activeElement;
      if (!panel.contains(activo)) {
        event.preventDefault();
        (event.shiftKey ? ultimo : primero).focus();
      } else if (event.shiftKey && activo === primero) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && activo === ultimo) {
        event.preventDefault();
        primero.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [abierto]);

  // Si la pregunta se dictó, Aria lee la respuesta en voz alta; la persona puede detenerla.
  const callar = () => { detenerLectura.current?.(); detenerLectura.current = null; setHablando(false); };
  const leerEnVozAlta = texto => {
    callar();
    setHablando(true);
    detenerLectura.current = hablar(texto, { onFin: () => setHablando(false) });
  };
  useEffect(() => () => detenerLectura.current?.(), []);
  const recibirDictado = texto => {
    setPregunta(actual => (actual.trim() ? `${actual.trim()} ${texto}` : texto).slice(0, 1000));
    porVoz.current = true;
    requestAnimationFrame(() => campoRef.current?.focus());
  };
  const cambioVoz = (estado, segundos) => {
    setVoz({ estado, segundos });
    if (estado === 'pidiendo') callar();
  };
  const cerrar = () => { callar(); setAbierto(false); requestAnimationFrame(() => botonRef.current?.focus()); };
  const nuevaConversacion = () => { callar(); porVoz.current = false; setAvisoVoz(null); setMensajes([]); setPregunta(''); setError(null); setCuotaRestante(null); ultimaConsulta.current = null; requestAnimationFrame(() => campoRef.current?.focus()); };
  const enviar = async (texto = pregunta, reintento = false) => {
    const contenido = String(texto || '').trim().slice(0, 1000);
    if (!contenido || consultando || agotada) return;
    const base = reintento ? mensajes : [...mensajes, { role: 'user', content: contenido }];
    const historial = (reintento ? mensajes.slice(0, -1) : mensajes).slice(-10).map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
    const leerRespuesta = reintento ? Boolean(ultimaConsulta.current?.porVoz) : porVoz.current;
    porVoz.current = false;
    ultimaConsulta.current = { contenido, base, porVoz: leerRespuesta };
    if (!reintento) { setMensajes(base); setPregunta(''); setAvisoVoz(null); }
    callar();
    setError(null); setConsultando(true);
    try {
      const data = await consultarAsistenteErp({ empresaId, sociedadId, pregunta: contenido, historial, contexto: { ...contexto, pantalla: pantallaActiva } });
      setMensajes(prev => [...prev, { role: 'assistant', content: String(data?.respuesta || '') , herramientas: Array.isArray(data?.herramientas_usadas) ? data.herramientas_usadas : [], borrador: data?.borrador?.id ? data.borrador : null }]);
      if (leerRespuesta && data?.respuesta) leerEnVozAlta(String(data.respuesta));
      if (Number.isFinite(data?.cuota_restante)) setCuotaRestante(data.cuota_restante);
    } catch (cause) {
      setError({ status: cause.status || 0, mensaje: mensajeErrorAsistente(cause.status) });
      if (cause.status === 429) setCuotaRestante(0);
    } finally { setConsultando(false); }
  };
  useEffect(() => {
    if (solicitudEnviada.current === solicitudApertura || !habilitado || consultando) return;
    solicitudEnviada.current = solicitudApertura;
    if (solicitudApertura?.texto) enviar(solicitudApertura.texto);
  }, [solicitudApertura, habilitado, consultando]);
  const enviarForm = event => { event.preventDefault(); enviar(); };

  if (!habilitado) return null;
  return <div className="dx-asis">
    <AriaFab ref={botonRef} pendientes={pendientes} abierto={abierto} oculto={ocultarFab} onClick={() => setAbierto(true)} />
    {abierto && <>
      <button className="dx-asis-backdrop" aria-label="Cerrar asistente" onClick={cerrar} />
      <section ref={panelRef} className="dx-asis-panel" role="dialog" aria-modal="true" aria-labelledby="dx-asis-title">
        <header className="dx-asis-head"><div className="dx-asis-ico" aria-hidden="true"><AriaLogo size={44} /></div>
          <div><div className="dx-asis-eyebrow">OPERA · Asistente</div><h2 className="dx-asis-title" id="dx-asis-title">Aria</h2><div className="dx-asis-sub">Respeta tus permisos · confirma antes de registrar</div></div>
          <button className="dx-asis-x" type="button" aria-label="Cerrar asistente" onClick={cerrar}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </header>
        {contexto?.tipo && contexto?.id && <div className="dx-asis-ctx"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg><span>Viendo: <b>{tituloContexto}</b></span></div>}
        <div ref={mensajesRef} className="dx-asis-body" aria-live="polite" aria-relevant="additions text">
          {!mensajes.length && <><div className="dx-asis-hello"><h3>{primerNombre ? `Hola, ${primerNombre}. Soy Aria.` : 'Hola. Soy Aria.'}</h3><p>Te ayudo a ver tus números de tesorería, caja chica, cobros y pagos, compras y stock. También registro gastos de caja chica, siempre con tu confirmación.</p></div><div className="dx-asis-sug-label">Prueba preguntando</div><div className="dx-asis-sugs" role="list">{sugerencias.map(texto => <button className="dx-asis-sug" type="button" role="listitem" key={texto} onClick={() => enviar(texto)}>{texto}<span aria-hidden="true">›</span></button>)}</div></>}
          {mensajes.map((mensaje, index) => <React.Fragment key={`${index}-${mensaje.role}`}>
            <div className={`dx-asis-message ${mensaje.role === 'user' ? 'me' : 'ai'}`}>{mensaje.role === 'assistant' && <span className="dx-asis-mini" aria-hidden="true"><AriaLogo size={24} /></span>}<div className={`dx-asis-msg ${mensaje.role === 'user' ? 'me' : 'ai'}`}><TextoSeguro texto={mensaje.content} /></div></div>
            {mensaje.role === 'assistant' && mensaje.borrador && <AriaTarjetaEgreso borrador={mensaje.borrador} empresaId={empresaId} estadoInicial={mensaje.borradorEstado}
              onCambio={info => setMensajes(prev => prev.map((item, posicion) => posicion === index ? { ...item, borradorEstado: info } : item))} />}
            {mensaje.role === 'assistant' && mensaje.herramientas?.length > 0 && <div className="dx-asis-tools">{[...new Set(mensaje.herramientas.map(etiquetaHerramienta))].map(etiqueta => <span className="dx-asis-pill cy" key={etiqueta}><i />{etiqueta}</span>)}</div>}
          </React.Fragment>)}
          {consultando && <div className="dx-asis-tools"><span className="dx-asis-dots" aria-hidden="true"><span/><span/><span/></span><span role="status">Aria está revisando…</span></div>}
          {error && <div className="dx-asis-err" role="alert">{error.mensaje}{error.status !== 429 && <button type="button" onClick={() => ultimaConsulta.current && enviar(ultimaConsulta.current.contenido, true)}>Reintentar</button>}</div>}
          {agotada && <div className="dx-asis-quota" role="status"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>Hoy ya conversamos mucho: llegaste al límite de {LIMITE_DIARIO} preguntas. Mañana a las 00:00 (hora de Lima) volvemos a empezar.</span></div>}
        </div>
        <footer className="dx-asis-foot">{(voz.estado === 'grabando' || voz.estado === 'transcribiendo' || hablando || avisoVoz) && <div className={`dx-asis-voz${voz.estado === 'grabando' ? ' is-rec' : ''}`} role="status">
          {voz.estado === 'grabando' ? <><i aria-hidden="true" />Te escucho… {Math.floor(voz.segundos / 60)}:{String(voz.segundos % 60).padStart(2, '0')} de {Math.floor(MAX_SEGUNDOS_DICTADO / 60)}:00 · toca ■ al terminar</>
            : voz.estado === 'transcribiendo' ? <><span className="dx-asis-dots" aria-hidden="true"><span/><span/><span/></span>Escribiendo lo que dijiste…</>
            : hablando ? <><span>Aria está leyendo su respuesta</span><button type="button" onClick={callar}>Detener voz</button></>
            : <><span>{avisoVoz}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setAvisoVoz(null)}>×</button></>}
        </div>}<form className="dx-asis-form" onSubmit={enviarForm}><label className="dx-asis-label" htmlFor="dx-asis-question">Tu pregunta</label><textarea id="dx-asis-question" ref={campoRef} className="dx-asis-in" rows="1" placeholder={agotada ? 'Límite diario alcanzado' : 'Pregúntale a Aria…'} maxLength="1000" value={pregunta} disabled={agotada || consultando} onChange={event => { setPregunta(event.target.value); if (!event.target.value.trim()) porVoz.current = false; }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); enviar(); } }} />
          <AriaMicrofono empresaId={empresaId} deshabilitado={agotada || consultando} onTexto={recibirDictado} onAviso={setAvisoVoz} onEstado={cambioVoz} />
          <button className="dx-asis-send" type="submit" aria-label="Enviar pregunta" disabled={!pregunta.trim() || agotada || consultando || voz.estado === 'grabando' || voz.estado === 'transcribiendo'}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>
          <div className="dx-asis-meta">{mensajes.length ? <button type="button" onClick={nuevaConversacion}>Nueva conversación</button> : <span className="dx-asis-legal">Las respuestas pueden contener errores. Verifica antes de decidir.</span>}{cuotaRestante !== null && <span>{Math.max(0, LIMITE_DIARIO - cuotaRestante)} de {LIMITE_DIARIO} hoy</span>}</div>
        </footer>
      </section>
    </>}
  </div>;
}

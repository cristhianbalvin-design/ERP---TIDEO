import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
import { useAsistenteErp } from '../context/AsistenteErpContext.jsx';
import { consultarAsistenteErp, mensajeErrorAsistente } from '../services/asistenteErpService.js';

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

function TextoSeguro({ texto }) {
  return String(texto || '').split('\n').map((linea, index) => {
    const match = linea.match(/^\s*[-•]\s+(.+)$/);
    return match
      ? <div className="dx-asis-listitem" key={index}>• {match[1]}</div>
      : <React.Fragment key={index}>{linea}{index < String(texto || '').split('\n').length - 1 ? <br /> : null}</React.Fragment>;
  });
}

export function AsistenteErpPanel() {
  const { empresa, sociedadActiva, authSession } = useApp();
  const { contexto } = useAsistenteErp();
  const [abierto, setAbierto] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [mensajes, setMensajes] = useState([]);
  const [error, setError] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const [cuotaRestante, setCuotaRestante] = useState(null);
  const botonRef = useRef(null);
  const campoRef = useRef(null);
  const ultimaConsulta = useRef(null);
  const habilitado = Boolean(authSession && empresa?.id);
  const sociedadId = sociedadActiva?.id && !['todas', 'all', '**todas**'].includes(String(sociedadActiva.id).toLowerCase()) ? sociedadActiva.id : undefined;
  const sugerencias = sugerenciasPorTipo[contexto?.tipo] || ['¿Qué pendientes requieren atención?', '¿Qué movimientos hubo recientemente?', '¿Puedes resumir la información disponible?'];
  const tituloContexto = contexto?.etiqueta || (contexto?.tipo ? `${contexto.tipo} ${contexto.id}` : '');
  const agotada = error?.status === 429 || cuotaRestante === 0;

  useEffect(() => { if (abierto) requestAnimationFrame(() => campoRef.current?.focus()); }, [abierto]);
  useEffect(() => {
    if (!abierto) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [abierto]);

  const cerrar = () => { setAbierto(false); requestAnimationFrame(() => botonRef.current?.focus()); };
  const nuevaConversacion = () => { setMensajes([]); setPregunta(''); setError(null); setCuotaRestante(null); ultimaConsulta.current = null; requestAnimationFrame(() => campoRef.current?.focus()); };
  const enviar = async (texto = pregunta, reintento = false) => {
    const contenido = String(texto || '').trim().slice(0, 1000);
    if (!contenido || consultando || agotada) return;
    const base = reintento ? mensajes : [...mensajes, { role: 'user', content: contenido }];
    const historial = (reintento ? mensajes.slice(0, -1) : mensajes).slice(-10).map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
    ultimaConsulta.current = { contenido, base };
    if (!reintento) { setMensajes(base); setPregunta(''); }
    setError(null); setConsultando(true);
    try {
      const data = await consultarAsistenteErp({ empresaId: empresa.id, sociedadId, pregunta: contenido, historial, contexto });
      setMensajes(prev => [...prev, { role: 'assistant', content: String(data?.respuesta || '') , herramientas: Array.isArray(data?.herramientas_usadas) ? data.herramientas_usadas : [] }]);
      if (Number.isFinite(data?.cuota_restante)) setCuotaRestante(data.cuota_restante);
    } catch (cause) {
      setError({ status: cause.status || 0, mensaje: mensajeErrorAsistente(cause.status) });
      if (cause.status === 429) setCuotaRestante(0);
    } finally { setConsultando(false); }
  };
  const enviarForm = event => { event.preventDefault(); enviar(); };

  if (!habilitado) return null;
  return <div className="dx-asis">
    <button ref={botonRef} className="dx-asis-fab" type="button" aria-expanded={abierto} aria-haspopup="dialog" onClick={() => setAbierto(true)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>Asistente
    </button>
    {abierto && <>
      <button className="dx-asis-backdrop" aria-label="Cerrar asistente" onClick={cerrar} />
      <section className="dx-asis-panel" role="dialog" aria-modal="true" aria-labelledby="dx-asis-title">
        <header className="dx-asis-head"><div className="dx-asis-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/></svg></div>
          <div><div className="dx-asis-eyebrow">Asistente</div><h2 className="dx-asis-title" id="dx-asis-title">Pregunta a tu ERP</h2><div className="dx-asis-sub">Solo lectura · respeta tus permisos</div></div>
          <button className="dx-asis-x" type="button" aria-label="Cerrar asistente" onClick={cerrar}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </header>
        {contexto?.tipo && contexto?.id && <div className="dx-asis-ctx"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg><span>Viendo: <b>{tituloContexto}</b></span></div>}
        <div className="dx-asis-body" aria-live="polite" aria-relevant="additions text">
          {!mensajes.length && <><div className="dx-asis-hello"><h3>¿En qué te ayudo?</h3><p>Consulto cuentas, cotizaciones, compras, stock y guías de tu empresa. No puedo crear ni modificar datos.</p></div><div className="dx-asis-sugs" role="list">{sugerencias.map(texto => <button className="dx-asis-sug" type="button" role="listitem" key={texto} onClick={() => enviar(texto)}>{texto}<span aria-hidden="true">›</span></button>)}</div></>}
          {mensajes.map((mensaje, index) => <React.Fragment key={`${index}-${mensaje.role}`}>
            <div className={`dx-asis-msg ${mensaje.role === 'user' ? 'me' : 'ai'}`}><TextoSeguro texto={mensaje.content} /></div>
            {mensaje.role === 'assistant' && mensaje.herramientas?.length > 0 && <div className="dx-asis-tools">{mensaje.herramientas.map((tool, i) => <span className="dx-asis-pill cy" key={`${tool}-${i}`}><i />{String(tool).replaceAll('_', ' ')}</span>)}</div>}
          </React.Fragment>)}
          {consultando && <div className="dx-asis-tools"><span className="dx-asis-dots" aria-hidden="true"><span/><span/><span/></span><span role="status">Consultando…</span></div>}
          {error && <div className="dx-asis-err" role="alert">{error.mensaje}{error.status !== 429 && <button type="button" onClick={() => ultimaConsulta.current && enviar(ultimaConsulta.current.contenido, true)}>Reintentar</button>}</div>}
          {agotada && <div className="dx-asis-quota" role="status"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>Llegaste al límite de <b>50 preguntas</b> de hoy. Se renueva mañana a las 00:00 (hora de Lima).</span></div>}
        </div>
        <footer className="dx-asis-foot"><form className="dx-asis-form" onSubmit={enviarForm}><label className="dx-asis-label" htmlFor="dx-asis-question">Tu pregunta</label><textarea id="dx-asis-question" ref={campoRef} className="dx-asis-in" rows="1" placeholder={agotada ? 'Límite diario alcanzado' : 'Escribe tu pregunta…'} maxLength="1000" value={pregunta} disabled={agotada || consultando} onChange={event => setPregunta(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); enviar(); } }} />
          <button className="dx-asis-send" type="submit" aria-label="Enviar pregunta" disabled={!pregunta.trim() || agotada || consultando}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>
          <div className="dx-asis-meta">{mensajes.length ? <button type="button" onClick={nuevaConversacion}>Nueva conversación</button> : <span className="dx-asis-legal">Las respuestas pueden contener errores. Verifica antes de decidir.</span>}{cuotaRestante !== null && <span>{Math.max(0, 50 - cuotaRestante)} de 50 hoy</span>}</div>
        </footer>
      </section>
    </>}
  </div>;
}

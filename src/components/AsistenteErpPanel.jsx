import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
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

function IconoAria({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 26 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" /></svg>;
}

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

export function AsistenteErpPanel({ pantallaActiva }) {
  const { empresa, sociedadActiva, authSession, authUser } = useApp();
  const { contexto, solicitudApertura } = useAsistenteErp();
  const [abierto, setAbierto] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [mensajes, setMensajes] = useState([]);
  const [error, setError] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const [cuotaRestante, setCuotaRestante] = useState(null);
  const botonRef = useRef(null);
  const campoRef = useRef(null);
  const panelRef = useRef(null);
  const mensajesRef = useRef(null);
  const ultimaConsulta = useRef(null);
  const solicitudInicial = useRef(solicitudApertura);
  const habilitado = Boolean(authSession && empresa?.id);
  const sociedadId = sociedadActiva?.id && !['todas', 'all', '**todas**'].includes(String(sociedadActiva.id).toLowerCase()) ? sociedadActiva.id : undefined;
  const sugerencias = sugerenciasPorTipo[contexto?.tipo] || sugerenciasPredeterminadas;
  const primerNombre = String(authUser?.nombre || '').trim().split(/\s+/)[0];
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
      const enfocables = [...panel.querySelectorAll('button:not(:disabled), textarea:not(:disabled), a[href]')]
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
      const data = await consultarAsistenteErp({ empresaId: empresa.id, sociedadId, pregunta: contenido, historial, contexto: { ...contexto, pantalla: pantallaActiva } });
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
    <button ref={botonRef} className="dx-asis-fab" type="button" aria-label="Abrir Aria, asistente de OPERA" aria-expanded={abierto} aria-haspopup="dialog" tabIndex={abierto ? -1 : 0} onClick={() => setAbierto(true)}>
      <IconoAria size={26} />
    </button>
    <span className="dx-asis-hint" aria-hidden="true">Pregúntale a Aria</span>
    {abierto && <>
      <button className="dx-asis-backdrop" aria-label="Cerrar asistente" onClick={cerrar} />
      <section ref={panelRef} className="dx-asis-panel" role="dialog" aria-modal="true" aria-labelledby="dx-asis-title">
        <header className="dx-asis-head"><div className="dx-asis-ico" aria-hidden="true"><IconoAria /></div>
          <div><div className="dx-asis-eyebrow">OPERA · Asistente</div><h2 className="dx-asis-title" id="dx-asis-title">Aria</h2><div className="dx-asis-sub">Solo lectura · respeta tus permisos</div></div>
          <button className="dx-asis-x" type="button" aria-label="Cerrar asistente" onClick={cerrar}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </header>
        {contexto?.tipo && contexto?.id && <div className="dx-asis-ctx"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg><span>Viendo: <b>{tituloContexto}</b></span></div>}
        <div ref={mensajesRef} className="dx-asis-body" aria-live="polite" aria-relevant="additions text">
          {!mensajes.length && <><div className="dx-asis-hello"><h3>{primerNombre ? `Hola, ${primerNombre}. Soy Aria.` : 'Hola. Soy Aria.'}</h3><p>Te ayudo a ver tus números de tesorería, caja chica, cobros y pagos, compras y stock. Solo leo: no modifico nada.</p></div><div className="dx-asis-sug-label">Prueba preguntando</div><div className="dx-asis-sugs" role="list">{sugerencias.map(texto => <button className="dx-asis-sug" type="button" role="listitem" key={texto} onClick={() => enviar(texto)}>{texto}<span aria-hidden="true">›</span></button>)}</div></>}
          {mensajes.map((mensaje, index) => <React.Fragment key={`${index}-${mensaje.role}`}>
            <div className={`dx-asis-message ${mensaje.role === 'user' ? 'me' : 'ai'}`}>{mensaje.role === 'assistant' && <span className="dx-asis-mini" aria-hidden="true"><IconoAria size={13} /></span>}<div className={`dx-asis-msg ${mensaje.role === 'user' ? 'me' : 'ai'}`}><TextoSeguro texto={mensaje.content} /></div></div>
            {mensaje.role === 'assistant' && mensaje.herramientas?.length > 0 && <div className="dx-asis-tools">{[...new Set(mensaje.herramientas.map(etiquetaHerramienta))].map(etiqueta => <span className="dx-asis-pill cy" key={etiqueta}><i />{etiqueta}</span>)}</div>}
          </React.Fragment>)}
          {consultando && <div className="dx-asis-tools"><span className="dx-asis-dots" aria-hidden="true"><span/><span/><span/></span><span role="status">Aria está revisando…</span></div>}
          {error && <div className="dx-asis-err" role="alert">{error.mensaje}{error.status !== 429 && <button type="button" onClick={() => ultimaConsulta.current && enviar(ultimaConsulta.current.contenido, true)}>Reintentar</button>}</div>}
          {agotada && <div className="dx-asis-quota" role="status"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>Hoy ya conversamos mucho: llegaste al límite de {LIMITE_DIARIO} preguntas. Mañana a las 00:00 (hora de Lima) volvemos a empezar.</span></div>}
        </div>
        <footer className="dx-asis-foot"><form className="dx-asis-form" onSubmit={enviarForm}><label className="dx-asis-label" htmlFor="dx-asis-question">Tu pregunta</label><textarea id="dx-asis-question" ref={campoRef} className="dx-asis-in" rows="1" placeholder={agotada ? 'Límite diario alcanzado' : 'Pregúntale a Aria…'} maxLength="1000" value={pregunta} disabled={agotada || consultando} onChange={event => setPregunta(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); enviar(); } }} />
          <button className="dx-asis-send" type="submit" aria-label="Enviar pregunta" disabled={!pregunta.trim() || agotada || consultando}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>
          <div className="dx-asis-meta">{mensajes.length ? <button type="button" onClick={nuevaConversacion}>Nueva conversación</button> : <span className="dx-asis-legal">Las respuestas pueden contener errores. Verifica antes de decidir.</span>}{cuotaRestante !== null && <span>{Math.max(0, LIMITE_DIARIO - cuotaRestante)} de {LIMITE_DIARIO} hoy</span>}</div>
        </footer>
      </section>
    </>}
  </div>;
}

import AriaFab from './AriaFab.jsx';
import AriaLogo from './AriaLogo.jsx';
import AriaTarjetaEgreso from './AriaTarjetaEgreso.jsx';
import AriaMicrofono, { MAX_SEGUNDOS_DICTADO } from './AriaMicrofono.jsx';
import { hablar } from '../lib/ariaHabla.js';
import React, { useEffect, useRef, useState } from 'react';
import { useAsistenteErp } from '../context/AsistenteErpContext.jsx';
import { consultarAsistenteErp, mensajeErrorAsistente, cuotaModoExperto } from '../services/asistenteErpService.js';
import { abrirConversacion, avisosDeRecuerdo, borrarRecuerdo, conversacionActual, destinoValido, etiquetaRetomada, mensajesDelPanel } from '../services/ariaMemoriaService.js';
import AriaConversaciones from './AriaConversaciones.jsx';
import AriaRecuerdos from './AriaRecuerdos.jsx';

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

// En Aria experta cada pregunta gasta una consulta del mes: las sugerencias son de proceso y de análisis.
const sugerenciasExperto = ['Explícame de punta a punta cómo paso de una cotización aprobada hasta cobrarla', '¿Qué clientes y órdenes de trabajo me dejan menos margen?', '¿Cómo está mi personal este mes: faltas, tardanzas y pendientes?', '¿Qué debería priorizar esta semana?'];
const sugerenciasPredeterminadas = ['¿Cuánto hay en bancos?', '¿Qué fondos de caja chica debo reponer?', '¿Cuánto tengo vencido por cobrar?', '¿Qué debo pagar con prioridad alta?'];

function etiquetaHerramienta(tool) {
  const nombre = String(tool || '').toLowerCase().replace(/^asistente_/, '');
  const grupos = [
    [['modo_experto'], 'Modo experto'],
    [['consultar_manual'], 'Consulté el manual'],
    [['buscar_conversaciones'], 'Revisé tus conversaciones'],
    [['recuerdo_guardar'], 'Guardé un recuerdo'],
    [['resumen_operaciones', 'buscar_ots', 'estado_ot'], 'Revisé Operaciones'], [['resumen_personal'], 'Revisé Personal'], [['resumen_planilla'], 'Revisé Planilla'],
    [['resumen_financiamiento'], 'Revisé Financiamiento'], [['resumen_comisiones'], 'Revisé Comisiones'], [['resumen_transporte'], 'Revisé Transporte'], [['vencimientos'], 'Revisé vencimientos'], [['estado_resultados'], 'Calculé el Estado de Resultados'], [['presupuesto_real'], 'Revisé Presupuestos'], [['clientes_facturacion'], 'Revisé clientes'],
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

// Negritas del modelo (**texto**) como <b>, sin interpretar HTML.
function conNegritas(texto) {
  const partes = String(texto).split(/\*\*([^*]+)\*\*/);
  return partes.length === 1 ? texto : partes.map((parte, i) => i % 2 ? <b key={i}>{parte}</b> : parte);
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
    const subtitulo = linea.match(/^\s*(?:#{1,4}\s+(.+?)|\*\*([^*]+)\*\*:?)\s*$/);
    if (subtitulo) return <div key={index} className="dx-asis-h">{subtitulo[1] || subtitulo[2]}</div>;
    if (lista) return <div key={index} className="dx-asis-listitem">• {conNegritas(lista[1])}</div>;
    return <React.Fragment key={index}>{conNegritas(linea)}{salto}</React.Fragment>;
  });
}

// Panel de Aria sin dependencia del contexto de una app: lo usan Administración y Operaciones.
// Botones de opciones que devuelve Aria (fondo, categoría, CECO…). Solo se aceptan textos simples.
function opcionesValidas(opciones) {
  if (!opciones || typeof opciones.titulo !== 'string' || !Array.isArray(opciones.items)) return null;
  const items = opciones.items
    .filter(item => item && typeof item.etiqueta === 'string' && typeof item.valor === 'string' && item.etiqueta.trim() && item.valor.trim())
    .slice(0, 20)
    .map(item => ({ etiqueta: item.etiqueta.slice(0, 80), valor: item.valor.slice(0, 200), detalle: typeof item.detalle === 'string' ? item.detalle.slice(0, 80) : '' }));
  return items.length ? { titulo: opciones.titulo.slice(0, 80), items } : null;
}

// El modo experto amplía respuestas que Aria dio consultando el manual o los datos; no aplica a registros ni a elecciones pendientes.
function puedeAmpliar(mensaje) {
  const usadas = mensaje.herramientas || [];
  return usadas.length > 0 && !usadas.includes('aria_modo_experto') && !usadas.includes('aria_recuerdo_guardar') && !mensaje.borrador && !mensaje.opciones;
}

export function AsistenteErpPanelBase({ empresaId, sociedadId, nombreUsuario, habilitado, pantallaActiva, ocultarFab = false, onIr }) {
  const { contexto, solicitudApertura } = useAsistenteErp();
  const [abierto, setAbierto] = useState(false);
  // Modo experto: solo administradores, con cuota mensual de la empresa; se consulta al abrir el chat.
  const [experto, setExperto] = useState(null);
  useEffect(() => {
    let vigente = true;
    if (abierto && habilitado && empresaId) cuotaModoExperto(empresaId).then(info => { if (vigente) setExperto(info); });
    return () => { vigente = false; };
  }, [abierto, habilitado, empresaId]);
  const [pendientes, setPendientes] = useState(null);
  useEffect(() => {
    const recibir = event => setPendientes(event.detail ?? null);
    window.addEventListener('dx-inicio-pendientes', recibir);
    return () => window.removeEventListener('dx-inicio-pendientes', recibir);
  }, []);
  const [pregunta, setPregunta] = useState('');
  const [mensajes, setMensajes] = useState([]);
  // Memoria: conversación guardada en la base (se retoma si tiene menos de 24 h) y vista de conversaciones anteriores.
  const [conversacionId, setConversacionId] = useState(null);
  const [retomada, setRetomada] = useState(null);
  const [vista, setVista] = useState('chat');
  // Chat activo: 'normal' (Aria) o 'experto' (Aria experta, solo administradores). Cada uno tiene su conversación.
  const [modo, setModo] = useState('normal');
  const preguntaPendiente = useRef(null);
  const modoActual = useRef('normal');
  const memoriaCargada = useRef(null);
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
  const sugerencias = modo === 'experto' ? sugerenciasExperto : sugerenciasPorTipo[contexto?.tipo] || sugerenciasPredeterminadas;
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
  // Botón "Ir a…": abre la pantalla exacta; en pantallas angostas el chat se cierra para dejarla ver.
  const irA = destino => { if (window.matchMedia?.('(max-width: 900px)').matches) { callar(); setAbierto(false); } onIr?.(destino); };
  const nuevaConversacion = () => { callar(); porVoz.current = false; setAvisoVoz(null); setMensajes([]); setPregunta(''); setError(null); setCuotaRestante(null); ultimaConsulta.current = null; setConversacionId(null); setRetomada(null); setVista('chat'); requestAnimationFrame(() => campoRef.current?.focus()); };
  const enviar = async (texto = pregunta, reintento = false) => {
    const contenido = String(texto || '').trim().slice(0, 1000);
    if (!contenido || consultando || agotada) return;
    const base = reintento ? mensajes : [...mensajes, { role: 'user', content: contenido }];
    const historial = (reintento ? mensajes.slice(0, -1) : mensajes).slice(-10).map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
    const leerRespuesta = reintento ? Boolean(ultimaConsulta.current?.porVoz) : porVoz.current;
    porVoz.current = false;
    const modoEnvio = reintento ? ultimaConsulta.current?.modo ?? null : (modo === 'experto' ? 'experto' : null);
    ultimaConsulta.current = { contenido, base, porVoz: leerRespuesta, modo: modoEnvio };
    if (!reintento) { setMensajes(base); setPregunta(''); setAvisoVoz(null); }
    callar();
    setError(null); setConsultando(true);
    try {
      const data = await consultarAsistenteErp({ empresaId, sociedadId, pregunta: contenido, historial, contexto: { ...contexto, pantalla: pantallaActiva }, conversacionId, modo: modoEnvio });
      if (Number.isFinite(data?.experto?.restantes)) setExperto({ permitido: data.experto.permitido === true, restantes: data.experto.restantes, limite: data.experto.limite || 150 });
      if (typeof data?.conversacion_id === 'string') setConversacionId(data.conversacion_id);
      setMensajes(prev => [...prev, { role: 'assistant', content: String(data?.respuesta || '') , herramientas: Array.isArray(data?.herramientas_usadas) ? data.herramientas_usadas : [], borrador: data?.borrador?.id ? data.borrador : null, opciones: opcionesValidas(data?.opciones), recuerdos: avisosDeRecuerdo(data?.recuerdos), destino: destinoValido(data?.destino) }]);
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
  const mostrarConversacion = (datos, comoRetomada) => {
    if (!datos?.id) return false;
    callar(); setError(null); ultimaConsulta.current = null;
    setConversacionId(datos.id);
    setMensajes(mensajesDelPanel(datos.mensajes));
    setRetomada(comoRetomada ? { fecha: datos.actualizado_en } : null);
    setVista('chat');
    return true;
  };
  // Al abrir Aria por primera vez en esta empresa, retoma la conversación de las últimas 24 horas.
  useEffect(() => {
    if (!abierto || !empresaId || memoriaCargada.current === empresaId) return;
    memoriaCargada.current = empresaId;
    if (mensajes.length) return;
    conversacionActual(empresaId, modo).then(datos => mostrarConversacion(datos, true)).catch(() => undefined);
  }, [abierto, empresaId]);
  // Cambiar de chat: se guarda aparte, así que se limpia el panel y se retoma la conversación de ese modo.
  // Con una pregunta inicial (botón «Ampliar en Aria experta») empieza una conversación nueva y la envía.
  const cambiarModo = (nuevo, preguntaInicial = null) => {
    if (consultando || (nuevo === modo && !preguntaInicial)) return;
    callar(); porVoz.current = false; setAvisoVoz(null); setError(null); ultimaConsulta.current = null;
    setMensajes([]); setPregunta(''); setConversacionId(null); setRetomada(null); setVista('chat');
    preguntaPendiente.current = preguntaInicial;
    modoActual.current = nuevo;
    setModo(nuevo);
    if (!preguntaInicial && empresaId) conversacionActual(empresaId, nuevo).then(datos => { if (modoActual.current === nuevo) mostrarConversacion(datos, true); }).catch(() => undefined);
  };
  useEffect(() => {
    if (!preguntaPendiente.current || consultando) return;
    const texto = preguntaPendiente.current;
    preguntaPendiente.current = null;
    enviar(texto);
  }, [modo, mensajes.length === 0]);
  // Deshacer un recuerdo recién guardado: se borra de la memoria y el aviso queda como borrado.
  const deshacerRecuerdo = (posicion, id) => {
    const marcar = cambio => setMensajes(prev => prev.map((item, index) => index === posicion ? { ...item, recuerdos: (item.recuerdos || []).map(r => r.id === id ? { ...r, ...cambio } : r) } : item));
    marcar({ borrando: true });
    borrarRecuerdo(id).then(() => marcar({ borrando: false, borrado: true }))
      .catch(causa => { marcar({ borrando: false }); setError({ status: 0, mensaje: causa.message }); });
  };
  const abrirAnterior = id => {
    if (id === conversacionId) { setVista('chat'); return; }
    abrirConversacion(id).then(datos => mostrarConversacion(datos, false)).catch(() => setError({ status: 0, mensaje: 'No pude abrir esa conversación. Inténtalo de nuevo.' }));
  };

  if (!habilitado) return null;
  return <div className="dx-asis">
    <AriaFab ref={botonRef} pendientes={pendientes} abierto={abierto} oculto={ocultarFab} onClick={() => setAbierto(true)} />
    {abierto && <>
      <button className="dx-asis-backdrop" aria-label="Cerrar asistente" onClick={cerrar} />
      <section ref={panelRef} className={`dx-asis-panel${modo === 'experto' ? ' is-experto' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dx-asis-title">
        <header className="dx-asis-head">{vista === 'chat' && <div className="dx-asis-ico" aria-hidden="true"><AriaLogo size={44} /></div>}
          {vista === 'recuerdos'
            ? <><button className="dx-asis-x dx-asis-back" type="button" aria-label="Volver a conversaciones" onClick={() => setVista('lista')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
              <div><div className="dx-asis-eyebrow">Aria · Memoria</div><h2 className="dx-asis-title" id="dx-asis-title">Lo que recuerdo de ti</h2></div></>
            : vista === 'lista'
            ? <><button className="dx-asis-x dx-asis-back" type="button" aria-label="Volver al chat" onClick={() => setVista('chat')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
              <div><div className="dx-asis-eyebrow">Aria</div><h2 className="dx-asis-title" id="dx-asis-title">Conversaciones</h2></div></>
            : modo === 'experto' ? <div><div className="dx-asis-eyebrow">OPERA · Modo experto</div><h2 className="dx-asis-title" id="dx-asis-title">Aria experta</h2><div className="dx-asis-sub">Análisis y explicaciones a fondo · solo administradores</div></div>
            : <div><div className="dx-asis-eyebrow">OPERA · Asistente</div><h2 className="dx-asis-title" id="dx-asis-title">Aria</h2><div className="dx-asis-sub">Respeta tus permisos · confirma antes de registrar</div></div>}
          <div className="dx-asis-head-acts">
          {vista === 'chat' && <><button className="dx-asis-x" type="button" aria-label="Conversaciones anteriores" title="Conversaciones anteriores" onClick={() => setVista('lista')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 103-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg></button>
          <button className="dx-asis-x" type="button" aria-label="Nueva conversación" title="Nueva conversación" onClick={nuevaConversacion}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button></>}
          <button className="dx-asis-x" type="button" aria-label="Cerrar asistente" onClick={cerrar}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        </header>
        {vista === 'chat' && experto?.permitido && <div className="dx-asis-modo" role="tablist" aria-label="Modo de Aria">
          <button type="button" role="tab" aria-selected={modo === 'normal'} className={`dx-asis-modo-b${modo === 'normal' ? ' on' : ''}`} disabled={consultando} onClick={() => cambiarModo('normal')}>Aria</button>
          <button type="button" role="tab" aria-selected={modo === 'experto'} className={`dx-asis-modo-b${modo === 'experto' ? ' on' : ''}`} disabled={consultando} onClick={() => cambiarModo('experto')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/></svg><span>Aria experta</span></button>
        </div>}
        {contexto?.tipo && contexto?.id && <div className="dx-asis-ctx"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg><span>Viendo: <b>{tituloContexto}</b></span></div>}
        {vista === 'recuerdos' ? <AriaRecuerdos empresaId={empresaId} />
          : vista === 'lista' ? <AriaConversaciones empresaId={empresaId} activaId={conversacionId} onAbrir={abrirAnterior} onNueva={nuevaConversacion} onRecuerdos={() => setVista('recuerdos')} modo={modo} /> : <>
        <div ref={mensajesRef} className="dx-asis-body" aria-live="polite" aria-relevant="additions text">
          {retomada && mensajes.length > 0 && <div className="dx-asis-ret" role="status"><span>Retomando tu conversación {etiquetaRetomada(retomada.fecha)}</span><button type="button" onClick={nuevaConversacion}>Empezar una nueva</button></div>}
          {!mensajes.length && <><div className="dx-asis-hello"><h3>{modo === 'experto' ? 'Aria experta' : primerNombre ? `Hola, ${primerNombre}. Soy Aria.` : 'Hola. Soy Aria.'}</h3><p>{modo === 'experto' ? 'Estás en Aria experta. Pregúntame cómo funciona un proceso de punta a punta o pídeme un análisis del negocio: respondo a fondo. Cada pregunta usa una de las consultas expertas del mes de tu empresa.' : 'Te ayudo a ver tus números de tesorería, caja chica, cobros y pagos, compras y stock. También registro gastos de caja chica, siempre con tu confirmación.'}</p></div><div className="dx-asis-sug-label">Prueba preguntando</div><div className="dx-asis-sugs" role="list">{sugerencias.map(texto => <button className="dx-asis-sug" type="button" role="listitem" key={texto} onClick={() => enviar(texto)}>{texto}<span aria-hidden="true">›</span></button>)}</div></>}
          {mensajes.map((mensaje, index) => <React.Fragment key={`${index}-${mensaje.role}`}>
            <div className={`dx-asis-message ${mensaje.role === 'user' ? 'me' : 'ai'}`}>{mensaje.role === 'assistant' && <span className="dx-asis-mini" aria-hidden="true"><AriaLogo size={24} /></span>}<div className={`dx-asis-msg ${mensaje.role === 'user' ? 'me' : 'ai'}`}><TextoSeguro texto={mensaje.content} /></div></div>
            {mensaje.role === 'assistant' && mensaje.borrador && <AriaTarjetaEgreso borrador={mensaje.borrador} empresaId={empresaId} estadoInicial={mensaje.borradorEstado}
              onCambio={info => setMensajes(prev => prev.map((item, posicion) => posicion === index ? { ...item, borradorEstado: info } : item))} />}
            {mensaje.role === 'assistant' && mensaje.opciones && index === mensajes.length - 1 && !consultando && <div className="dx-asis-opciones" role="group" aria-label={mensaje.opciones.titulo}>
              <span className="dx-asis-opciones-t">{mensaje.opciones.titulo}</span>
              <div className="dx-asis-opciones-l">{mensaje.opciones.items.map(item => <button type="button" key={item.valor} className="dx-asis-opcion" disabled={agotada} onClick={() => enviar(item.valor)}>
                <b>{item.etiqueta}</b>{item.detalle && <small>{item.detalle}</small>}
              </button>)}</div>
            </div>}
            {mensaje.role === 'assistant' && mensaje.destino && onIr && <div className="dx-asis-ir">
              <button type="button" className="dx-asis-ir-b" onClick={() => irA(mensaje.destino)}><span>Ir a {mensaje.destino.titulo}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
              {mensaje.destino.donde && <small>{mensaje.destino.donde}</small>}
            </div>}
            {mensaje.role === 'assistant' && index === mensajes.length - 1 && modo === 'normal' && !consultando && !agotada && experto?.permitido && experto.restantes > 0 && puedeAmpliar(mensaje) && mensajes[index - 1]?.role === 'user' && <div className="dx-asis-exp">
              <button type="button" className="dx-asis-exp-b" onClick={() => cambiarModo('experto', `Amplía en modo experto: ${String(mensajes[index - 1].content)}`.slice(0, 1000))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/></svg><span>Ampliar en Aria experta</span></button>
              <small>Abre el chat experto con esta pregunta · quedan {experto.restantes} de {experto.limite} este mes</small>
            </div>}
            {mensaje.role === 'assistant' && (mensaje.recuerdos || []).map(r => <div className={`dx-asis-rec${r.tipo === 'automatico' ? ' auto' : ''}`} key={r.id} role="status">
              {r.borrado ? <span>Recuerdo borrado.</span> : <><span><b>{r.tipo === 'automatico' ? 'Aria recordó:' : 'Guardado en tu memoria:'}</b> {r.texto}</span>
                <button type="button" disabled={r.borrando} onClick={() => deshacerRecuerdo(index, r.id)}>{r.borrando ? 'Borrando…' : 'Deshacer'}</button></>}
            </div>)}
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
        </div>}<form className="dx-asis-form" onSubmit={enviarForm}><label className="dx-asis-label" htmlFor="dx-asis-question">Tu pregunta</label><textarea id="dx-asis-question" ref={campoRef} className="dx-asis-in" rows="1" placeholder={agotada ? 'Límite diario alcanzado' : modo === 'experto' ? 'Pregúntale a Aria experta…' : 'Pregúntale a Aria…'} maxLength="1000" value={pregunta} disabled={agotada || consultando} onChange={event => { setPregunta(event.target.value); if (!event.target.value.trim()) porVoz.current = false; }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); enviar(); } }} />
          <AriaMicrofono empresaId={empresaId} deshabilitado={agotada || consultando} onTexto={recibirDictado} onAviso={setAvisoVoz} onEstado={cambioVoz} />
          <button className="dx-asis-send" type="submit" aria-label="Enviar pregunta" disabled={!pregunta.trim() || agotada || consultando || voz.estado === 'grabando' || voz.estado === 'transcribiendo'}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>
          <div className="dx-asis-meta">{mensajes.length ? <button type="button" onClick={nuevaConversacion}>Nueva conversación</button> : <span className="dx-asis-legal">Las respuestas pueden contener errores. Verifica antes de decidir.</span>}{modo === 'experto' && experto ? <span>Quedan {experto.restantes} de {experto.limite} este mes en tu empresa</span> : cuotaRestante !== null && <span>{Math.max(0, LIMITE_DIARIO - cuotaRestante)} de {LIMITE_DIARIO} hoy</span>}</div>
        </footer>
        </>}
      </section>
    </>}
  </div>;
}

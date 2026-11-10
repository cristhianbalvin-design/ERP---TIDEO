import React, { useEffect, useRef, useState } from 'react';
import { transcribirPreguntaAria } from '../services/ariaVozService.js';

// Botón de dictado del panel de Aria: tocar para grabar, tocar de nuevo para terminar.
// El texto transcrito no se envía solo: cae en el cuadro para que la persona lo revise.
export const MAX_SEGUNDOS_DICTADO = 60;
const MIME_PREFERIDOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const puedeGrabar = () => typeof window !== 'undefined' && Boolean(window.navigator?.mediaDevices?.getUserMedia) && typeof window.MediaRecorder === 'function';
const elegirMime = () => MIME_PREFERIDOS.find(mime => window.MediaRecorder.isTypeSupported?.(mime)) || '';

export default function AriaMicrofono({ empresaId, deshabilitado = false, onTexto, onAviso, onEstado }) {
  const [estado, setEstado] = useState('listo'); // listo | pidiendo | grabando | transcribiendo
  const [segundos, setSegundos] = useState(0);
  const grabador = useRef(null);
  const flujo = useRef(null);
  const partes = useRef([]);
  const reloj = useRef(null);
  const inicio = useRef(0);
  const montado = useRef(true);

  const liberar = () => {
    clearInterval(reloj.current);
    flujo.current?.getTracks().forEach(pista => pista.stop());
    flujo.current = null;
  };
  useEffect(() => { onEstado?.(estado, segundos); }, [estado, segundos]);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (grabador.current?.state === 'recording') grabador.current.stop();
      liberar();
    };
  }, []);

  if (!puedeGrabar()) return null;

  const detener = () => {
    clearInterval(reloj.current);
    if (grabador.current?.state === 'recording') grabador.current.stop();
  };

  const procesar = async mime => {
    const duracion = (Date.now() - inicio.current) / 1000;
    liberar();
    grabador.current = null;
    if (!montado.current) return;
    const blob = new Blob(partes.current, { type: String(mime || 'audio/webm').split(';')[0] });
    partes.current = [];
    if (duracion < 0.7 || !blob.size) {
      setEstado('listo');
      onAviso?.('La grabación fue muy corta. Toca el micrófono, habla y vuelve a tocarlo al terminar.');
      return;
    }
    setEstado('transcribiendo');
    try {
      const { texto, restantes } = await transcribirPreguntaAria({ empresaId, blob });
      if (!montado.current) return;
      onTexto?.(texto);
      if (restantes !== null && restantes <= 10) onAviso?.(`Te quedan ${restantes} dictados hoy.`);
    } catch (error) {
      if (montado.current) onAviso?.(error.message);
    } finally {
      if (montado.current) setEstado('listo');
    }
  };

  const iniciar = async () => {
    onAviso?.(null);
    setEstado('pidiendo');
    try {
      flujo.current = await window.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      setEstado('listo');
      const sinPermiso = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      onAviso?.(sinPermiso ? 'Permite el uso del micrófono en tu navegador para dictar tu pregunta.' : 'No encontré un micrófono disponible en este equipo.');
      return;
    }
    if (!montado.current) { liberar(); return; }
    const mime = elegirMime();
    partes.current = [];
    let grabacion;
    try {
      grabacion = new window.MediaRecorder(flujo.current, mime ? { mimeType: mime } : undefined);
      grabacion.ondataavailable = event => { if (event.data?.size) partes.current.push(event.data); };
      grabacion.onstop = () => procesar(grabacion.mimeType || mime);
      grabacion.start();
    } catch {
      if (grabacion) grabacion.onstop = null;
      liberar();
      setEstado('listo');
      onAviso?.('Tu navegador no permite grabar audio. Escribe tu pregunta.');
      return;
    }
    grabador.current = grabacion;
    inicio.current = Date.now();
    setSegundos(0);
    setEstado('grabando');
    reloj.current = setInterval(() => {
      const transcurrido = Math.floor((Date.now() - inicio.current) / 1000);
      setSegundos(transcurrido);
      if (transcurrido >= MAX_SEGUNDOS_DICTADO) detener();
    }, 250);
  };

  const grabando = estado === 'grabando';
  const ocupado = estado === 'pidiendo' || estado === 'transcribiendo';
  const etiqueta = grabando ? 'Terminar dictado' : estado === 'transcribiendo' ? 'Transcribiendo tu pregunta' : 'Dictar pregunta';
  return <button type="button" className={`dx-asis-mic${grabando ? ' is-rec' : ''}${ocupado ? ' is-busy' : ''}`} aria-label={etiqueta} title={etiqueta} aria-pressed={grabando}
    disabled={(deshabilitado && !grabando) || ocupado} onClick={grabando ? detener : iniciar}>
    {grabando
      ? <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" /></svg>
      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>}
  </button>;
}

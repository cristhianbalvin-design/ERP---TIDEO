import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './shell.jsx';
import { MejorarRedaccionIA } from './MejorarRedaccionIA.jsx';
import { iniciarGrabacion } from '../utils/grabadorAudio.js';
import { transcribirAudio } from '../../services/transcribirAudio.js';

export function unirTranscripcion(existing, transcript) {
  const base = String(existing || '').trimEnd();
  const text = String(transcript || '').trim();
  const separator = /\s$/.test(String(existing || '')) || /^\s/.test(String(transcript || '')) || /[.!?…]$/.test(base) ? ' ' : '. ';
  return !text ? String(existing || '') : !base ? text : base + separator + text;
}

export default function ObservationField({ item, disabled, diagnosticoId, onChange }) {
  const textareaRef = useRef(null);
  const recorderRef = useRef(null);
  const audioRef = useRef(null);
  const recognitionRef = useRef(null);
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState('');
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [retryUsed, setRetryUsed] = useState(false);
  useEffect(() => {
    setSupported(Boolean(globalThis.MediaRecorder && globalThis.navigator?.mediaDevices?.getUserMedia) || Boolean(typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)));
    return () => { recognitionRef.current?.stop?.(); recorderRef.current?.cancel?.(); };
  }, []);
  const transcribe = async blob => {
    setTranscribing(true); setRetryAvailable(false); setMessage('');
    try {
      const text = await transcribirAudio({ diagnosticoId, blob, idioma: 'es' });
      onChange(unirTranscripcion(textareaRef.current?.value ?? item.observacion, text).slice(0, 1000));
      audioRef.current = null; setRetryUsed(false); setMessage('Audio transcrito.');
    } catch (error) {
      audioRef.current = blob; setRetryAvailable(!retryUsed); setMessage(error?.message || 'No se pudo transcribir el audio.');
    } finally { setTranscribing(false); }
  };
  const startRecording = async () => {
    try {
      recorderRef.current = await iniciarGrabacion({ onTick: setElapsed, onLimit: () => { setMessage('Límite de 2 minutos alcanzado.'); stopRecording(); } });
      setRecording(true); setElapsed(0); setRetryUsed(false); setMessage('');
    } catch (error) { setMessage(error.message); }
  };
  const stopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setRecording(false); setTranscribing(true);
    try { const blob = await recorder.stop(); recorderRef.current = null; await transcribe(blob); }
    catch (error) { setTranscribing(false); setMessage(error?.message || 'No se pudo leer la grabación.'); }
  };
  const cancelRecording = async () => {
    await recorderRef.current?.cancel?.(); recorderRef.current = null; audioRef.current = null;
    setRecording(false); setElapsed(0); setMessage('Grabación cancelada.');
  };
  const startWebSpeech = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setSupported(false); setMessage('Este navegador no admite dictado.'); return; }
    const recognition = new Recognition();
    recognitionRef.current = recognition; recognition.lang = 'es-PE'; recognition.interimResults = true; recognition.continuous = false;
    const base = String(textareaRef.current?.value ?? item.observacion ?? '').slice(0, 1000);
    const session = { finals: [], interims: [] };
    recognition.onstart = () => { setRecording(true); setMessage(''); };
    recognition.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const phrase = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) { session.finals[i] = phrase; session.interims[i] = ''; } else session.interims[i] = phrase;
      }
      const transcript = Array.from({ length: Math.max(session.finals.length, session.interims.length) }, (_, i) => session.finals[i] || session.interims[i] || '').join(' ');
      const next = unirTranscripcion(base, transcript).slice(0, 1000); onChange(next);
      requestAnimationFrame(() => { textareaRef.current?.focus({ preventScroll: true }); textareaRef.current?.setSelectionRange(next.length, next.length); });
    };
    recognition.onerror = event => setMessage(event.error === 'not-allowed' ? 'Permiso de micrófono denegado. Habilítalo en el navegador.' : 'No se pudo iniciar el dictado. Revisa el micrófono.');
    recognition.onend = () => { setRecording(false); recognitionRef.current = null; };
    try { recognition.start(); } catch { setRecording(false); setMessage('No se pudo iniciar el dictado.'); }
  };
  const begin = () => {
    const canRecord = Boolean(globalThis.MediaRecorder && globalThis.navigator?.mediaDevices?.getUserMedia);
    if (canRecord && diagnosticoId) startRecording();
    else { startWebSpeech(); if (canRecord && !diagnosticoId) setMessage('Guarda el diagnóstico para usar transcripción precisa; se usó el dictado del navegador.'); }
  };
  const stop = () => recorderRef.current ? stopRecording() : recognitionRef.current?.stop?.();
  const retry = async () => { if (!audioRef.current || retryUsed) return; setRetryUsed(true); await transcribe(audioRef.current); };
  return <div className="field hallazgo-observation-field">
    <label htmlFor={'hallazgo-observaciones-' + item._key}>Observaciones</label>
    <textarea ref={textareaRef} id={'hallazgo-observaciones-' + item._key} className="input" rows={3} maxLength={1000} value={item.observacion || ''} disabled={disabled} onChange={event => onChange(event.target.value)} />
    <div className="hallazgo-observation-tools">
      {supported && <button type="button" className={'hallazgo-dictation-button dx-voz-button' + (recording ? ' is-listening' : '')} aria-label={recording ? 'Detener dictado' : 'Dictar observaciones'} aria-pressed={recording} disabled={disabled || transcribing} onMouseDown={event => event.preventDefault()} onClick={recording ? stop : begin}><Icon name="mic" size={16} />{recording ? recorderRef.current ? '● Grabando ' + Math.floor(elapsed / 60000) + ':' + String(Math.floor(elapsed / 1000) % 60).padStart(2, '0') + ' · Detener' : 'Detener dictado' : 'Dictar'}</button>}
      {recording && recorderRef.current && <button type="button" className="dx-voz-cancel" onMouseDown={event => event.preventDefault()} onClick={cancelRecording}>Cancelar</button>}
      {transcribing && <span className="dx-voz-transcribing" role="status">Transcribiendo…</span>}
      {retryAvailable && !transcribing && <button type="button" className="dx-voz-retry" disabled={retryUsed} onClick={retry}>Reintentar</button>}
      <MejorarRedaccionIA diagnosticoId={diagnosticoId} texto={item.observacion || ''} disabled={disabled || recording || transcribing} compact onApply={onChange} />
      {!supported && <span className="hint">Tu navegador no admite dictado; usa el dictado del sistema (Windows: tecla Windows + H)</span>}
      {message && <span role="status">{message}</span>}
    </div>
  </div>;
}

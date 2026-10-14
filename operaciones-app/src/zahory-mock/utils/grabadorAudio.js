export const DURACION_MAXIMA_AUDIO_MS = 120_000;
const CANDIDATOS_MIME = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

export function elegirMimeAudio(MediaRecorderClass = globalThis.MediaRecorder) {
  return CANDIDATOS_MIME.find(type => MediaRecorderClass?.isTypeSupported?.(type)) || '';
}

export async function iniciarGrabacion({ onTick = () => {}, onLimit = () => {}, maxMs = DURACION_MAXIMA_AUDIO_MS } = {}) {
  if (!globalThis.MediaRecorder || !globalThis.navigator?.mediaDevices?.getUserMedia) throw new Error('Este navegador no admite grabación de audio.');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') throw new Error('Permiso de micrófono denegado. Habilítalo en el navegador para grabar.');
    throw new Error('No se pudo acceder al micrófono. Revisa sus permisos.');
  }
  const mimeType = elegirMimeAudio();
  let recorder;
  try { recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
  catch { stream.getTracks().forEach(track => track.stop()); throw new Error('No se pudo iniciar la grabación de audio.'); }
  const chunks = [];
  let settled = false;
  let elapsed = 0;
  let timer;
  let resolveStop;
  const stopped = new Promise(resolve => { resolveStop = resolve; });
  const release = () => {
    clearInterval(timer);
    stream.getTracks().forEach(track => track.stop());
  };
  recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
  recorder.onstop = () => {
    release();
    if (!settled) { settled = true; resolveStop(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })); }
  };
  recorder.onerror = () => { if (recorder.state !== 'inactive') recorder.stop(); };
  recorder.start(1000);
  timer = setInterval(() => {
    elapsed = Math.min(maxMs, elapsed + 1000);
    onTick(elapsed);
    if (elapsed >= maxMs) { onLimit(); recorder.stop(); }
  }, 1000);
  return {
    mimeType: recorder.mimeType || mimeType,
    stop() { if (recorder.state !== 'inactive') recorder.stop(); return stopped; },
    async cancel() {
      if (recorder.state !== 'inactive') recorder.stop();
      release();
      await stopped;
      return null;
    },
  };
}

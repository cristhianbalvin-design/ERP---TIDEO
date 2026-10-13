import { afterEach, describe, expect, it, vi } from 'vitest';
import { DURACION_MAXIMA_AUDIO_MS, elegirMimeAudio, iniciarGrabacion } from '../src/zahory-mock/utils/grabadorAudio.js';

describe('grabador de audio', () => {
  afterEach(() => { vi.useRealTimers(); delete globalThis.MediaRecorder; });
  it('elige el primer formato compatible', () => {
    class Recorder { static isTypeSupported = type => type === 'audio/mp4'; }
    expect(elegirMimeAudio(Recorder)).toBe('audio/mp4');
  });
  it('detiene a los 120 segundos y libera las pistas al cancelar', async () => {
    vi.useFakeTimers();
    const track = { stop: vi.fn() };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } } });
    class Recorder {
      static isTypeSupported = () => false;
      constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'audio/webm'; globalThis.recorderInstance = this; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio']) }); this.onstop?.(); }
    }
    globalThis.MediaRecorder = Recorder;
    const onLimit = vi.fn();
    const session = await iniciarGrabacion({ onLimit });
    await vi.advanceTimersByTimeAsync(DURACION_MAXIMA_AUDIO_MS);
    expect(onLimit).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    await session.cancel();
    expect(track.stop).toHaveBeenCalled();
  });
});

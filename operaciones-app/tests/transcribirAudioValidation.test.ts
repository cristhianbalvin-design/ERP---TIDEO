import { describe, expect, it } from 'vitest';
import { MAX_AUDIO_BYTES, validarAudio, validarDiagnosticoId, validarIdioma } from '../../supabase/functions/transcribir-audio/transcribirAudio.ts';

describe('validaciones transcribir-audio', () => {
  it('acepta tipos permitidos y rechaza vacío, tamaño y formato incorrectos', () => {
    expect(validarAudio({ size: 100, type: 'audio/webm;codecs=opus' })).toEqual({ value: { mime: 'audio/webm' } });
    expect(validarAudio({ size: 0, type: 'audio/webm' })).toHaveProperty('error');
    expect(validarAudio({ size: MAX_AUDIO_BYTES + 1, type: 'audio/webm' })).toHaveProperty('error');
    expect(validarAudio({ size: 100, type: 'audio/aac' })).toHaveProperty('error');
  });
  it('normaliza idioma y valida diagnóstico', () => {
    expect(validarIdioma(null)).toEqual({ value: 'es' });
    expect(validarIdioma('es-PE')).toEqual({ value: 'es' });
    expect(validarIdioma('??')).toHaveProperty('error');
    expect(validarDiagnosticoId('dt_' + 'a'.repeat(32))).toBe(true);
    expect(validarDiagnosticoId('diagnostico')).toBe(false);
  });
});

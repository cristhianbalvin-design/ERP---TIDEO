import { describe, expect, it } from 'vitest';
import { sanearTextoMejorado, validarEntradaRedaccion } from '../../supabase/functions/mejorar-redaccion/redaccion.ts';

describe('validación de mejorar-redaccion', () => {
  const id = `dt_${'a'.repeat(32)}`;
  it('acepta texto dentro de los límites y conserva el original', () => {
    expect(validarEntradaRedaccion({ diagnostico_id: id, texto: '  Revisar la bomba.  ' })).toEqual({ value: { diagnostico_id: id, texto: '  Revisar la bomba.  ', contexto: '' } });
  });
  it('rechaza texto vacío, excesivo e identificadores inválidos', () => {
    expect(validarEntradaRedaccion({ diagnostico_id: id, texto: '  ' }).error).toMatch(/escribe un texto/i);
    expect(validarEntradaRedaccion({ diagnostico_id: id, texto: 'x'.repeat(4001) }).error).toMatch(/4000 caracteres/i);
    expect(validarEntradaRedaccion({ diagnostico_id: 'id', texto: 'texto válido' }).error).toMatch(/identificador/i);
  });
  it('devuelve texto plano saneado', () => {
    expect(sanearTextoMejorado('```text\n Revisar bomba. \n```')).toBe('Revisar bomba.');
  });
});

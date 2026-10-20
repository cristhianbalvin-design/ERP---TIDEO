import { describe, expect, it } from 'vitest';
import { datosDispositivoCliente, estadoEnlace, faltanteConformidad, formatoFecha, iniciales, payloadFirma } from '../src/utils/conformidadActa.js';

const base = { resultado: 'conforme', observaciones: '', nombre: 'Persona Cliente', documento: '40000002', cargo: '', firma: 'data:image/png;base64,AAA' };

describe('firma del cliente por enlace', () => {
  it('valida el formulario', () => {
    expect(faltanteConformidad(base)).toBe('');
    expect(faltanteConformidad({ ...base, resultado: '' })).toMatch(/Elige/);
    expect(faltanteConformidad({ ...base, resultado: 'observaciones' })).toMatch(/observaciones/);
    expect(faltanteConformidad({ ...base, resultado: 'observaciones', observaciones: 'Faltó un baño' })).toBe('');
    expect(faltanteConformidad({ ...base, nombre: 'Al' })).toMatch(/nombre/);
    expect(faltanteConformidad({ ...base, documento: '12 34' })).toMatch(/documento/);
    expect(faltanteConformidad({ ...base, firma: null })).toMatch(/firma/);
  });

  it('arma el envío sin observaciones si es conforme', () => {
    const p = payloadFirma('tok', { ...base, observaciones: 'ignorado', documento: 'ab12345', cargo: ' Supervisor ' }, { idioma: 'es' });
    expect(p).toMatchObject({ accion: 'firmar', token: 'tok', resultado: 'conforme', observaciones: null, documento: 'AB12345', cargo: 'Supervisor', dispositivo: { idioma: 'es' } });
    expect(payloadFirma('tok', { ...base, resultado: 'observaciones', observaciones: ' x ' }, {}).observaciones).toBe('x');
  });

  it('interpreta el estado del enlace', () => {
    expect(estadoEnlace({ estado: 'pendiente' })).toBe('pendiente');
    expect(estadoEnlace({ estado: 'legacy' })).toBe('legacy');
    expect(estadoEnlace({ estado: 'raro' })).toBe('error');
    expect(estadoEnlace(null)).toBe('error');
  });

  it('utilidades', () => {
    expect(formatoFecha('2026-10-27')).toBe('27/10/2026');
    expect(iniciales('Servicios Andinos SAC')).toBe('SA');
    expect(iniciales('')).toBe('AC');
    expect(datosDispositivoCliente({ navigator: { userAgent: 'UA', language: 'es-PE', maxTouchPoints: 0 }, screen: { width: 390, height: 844 } }))
      .toMatchObject({ user_agent: 'UA', idioma: 'es-PE', pantalla: '390x844', tactil: false });
  });
});

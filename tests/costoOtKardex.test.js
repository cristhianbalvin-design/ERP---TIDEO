import { describe, expect, it } from 'vitest';
import { calcularCostoRealOT } from '../src/services/operacionesService.js';

// Cliente falso: cada tabla devuelve sus filas; los filtros encadenados se ignoran.
function clienteFalso(tablas) {
  return {
    from(tabla) {
      const filas = tablas[tabla] || [];
      const q = {
        select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q, limit: () => q,
        then: (ok, ko) => Promise.resolve({ data: filas, error: null }).then(ok, ko),
      };
      return q;
    },
  };
}

describe('costo de materiales de la OT desde el kardex', () => {
  it('resta las entradas ligadas a la OT (devolución de taller y reversa) y mantiene la merma', async () => {
    const supabase = clienteFalso({
      kardex: [
        { tipo: 'salida', motivo: 'despacho_taller', referencia_tipo: 'ot', cantidad: 10, costo_unitario: 5 },
        { tipo: 'entrada', motivo: 'devolucion_taller', referencia_tipo: 'ot', cantidad: 4, costo_unitario: 5 },
        { tipo: 'salida', motivo: 'merma', referencia_tipo: 'ot', cantidad: 1, costo_unitario: 5 },
        { tipo: 'entrada', motivo: 'reversa_despacho', referencia_tipo: 'ot', cantidad: 2, costo_unitario: 5 },
        { tipo: 'entrada', motivo: 'compra', referencia_tipo: 'oc', cantidad: 99, costo_unitario: 5 },
      ],
    });
    const r = await calcularCostoRealOT(supabase, 'ot1', 'e1');
    // 50 despachado − 20 devuelto + 5 merma − 10 reversa = 25
    expect(r.materiales).toBe(25);
  });
});

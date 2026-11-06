import { describe, expect, it } from 'vitest';
import { normalizarCuentaCebe } from '../src/services/maestrosService.js';
import { persistirOSCliente, loadCrmFromSupabase } from '../src/services/crmService.js';

// Cliente falso: devuelve filas por tabla y registra los filtros eq aplicados.
function clienteFalso(tablas, registro = []) {
  return {
    from(tabla) {
      const filas = tablas[tabla] || [];
      const filtros = [];
      const resultado = () => ({ data: filas.filter(f => filtros.every(([k, v]) => f[k] === v)), error: null });
      const q = {
        select: () => q, in: () => q, is: () => q, order: () => q, limit: () => q, gte: () => q, lte: () => q, neq: () => q, or: () => q,
        eq: (k, v) => { filtros.push([k, v]); return q; },
        maybeSingle: async () => { const r = resultado(); return { data: r.data[0] || null, error: null }; },
        upsert: (row) => { registro.push({ tabla, row }); return q; },
        insert: (row) => { registro.push({ tabla, row }); return q; },
        single: async () => ({ data: registro.at(-1)?.row || null, error: null }),
        then: (ok, ko) => Promise.resolve(resultado()).then(ok, ko),
      };
      return q;
    },
  };
}

describe('normalizarCuentaCebe', () => {
  it('solo un CEBE de tipo cliente conserva la cuenta vinculada', () => {
    expect(normalizarCuentaCebe({ tipo: 'cliente', cuenta_id: 'cta_1' }).cuenta_id).toBe('cta_1');
    expect(normalizarCuentaCebe({ tipo: 'cliente', cuenta_id: '' }).cuenta_id).toBeNull();
    expect(normalizarCuentaCebe({ tipo: 'estructural', cuenta_id: 'cta_1' }).cuenta_id).toBeNull();
    expect(normalizarCuentaCebe({ tipo: 'proyecto', cuenta_id: 'cta_1', nombre: 'X' })).toMatchObject({ cuenta_id: null, nombre: 'X' });
  });
});

describe('persistirOSCliente', () => {
  it('rechaza una cuenta que no es de la empresa activa sin escribir la OS', async () => {
    const registro = [];
    const sb = clienteFalso({ cuentas: [{ id: 'cta_otra', empresa_id: 'emp_B' }] }, registro);
    await expect(persistirOSCliente(sb, 'emp_A', { id: 'osc_1', cuenta_id: 'cta_otra', nombre: 'OS' }))
      .rejects.toThrow('no existe en la empresa activa');
    expect(registro.filter(r => r.tabla === 'os_clientes')).toHaveLength(0);
  });
});

describe('loadCrmFromSupabase', () => {
  it('descarta cuentas de otra empresa aunque lleguen en la respuesta', async () => {
    const sb = clienteFalso({ cuentas: [{ id: 'cta_a', empresa_id: 'emp_A' }, { id: 'cta_b', empresa_id: 'emp_B' }] });
    // Ignora los filtros para simular una respuesta mezclada.
    const sbMezclado = { from: (t) => { const q = sb.from(t); q.eq = () => q; return q; } };
    const data = await loadCrmFromSupabase(sbMezclado, 'emp_A');
    expect(data.cuentas.map(c => c.id)).toEqual(['cta_a']);
  });
});

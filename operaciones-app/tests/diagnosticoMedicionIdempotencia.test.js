import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => supabase }));
import { crearDiagnosticoMedicion } from '../src/services/diagnosticoTecnicoService.js';

describe('guardar mediciones ligadas de forma idempotente', () => {
  it('guarda dos veces la misma medición ligada sin duplicar la fila', async () => {
    const rows = [];
    let nextId = 1;
    supabase.from.mockImplementation(() => {
      let operation = 'select';
      let payload = null;
      const filters = {};
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column, value) => { filters[column] = value; return query; }),
        maybeSingle: vi.fn(async () => ({ data: rows.find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) || null, error: null })),
        insert: vi.fn(value => { operation = 'insert'; payload = value; return query; }),
        update: vi.fn(value => { operation = 'update'; payload = value; return query; }),
        single: vi.fn(async () => {
          if (operation === 'insert') {
            const row = { ...payload, id: `measurement-${nextId++}` };
            rows.push(row);
            return { data: row, error: null };
          }
          const row = rows.find(item => item.id === filters.id && item.empresa_id === filters.empresa_id && item.hallazgo_id === filters.hallazgo_id);
          Object.assign(row, payload);
          return { data: row, error: null };
        }),
      };
      return query;
    });

    const measurement = { zona_id: 'tapaT', medida_id: 'diametro', parametro: 'Ø vástago', unidad: 'mm', nominal: 60, minimo: 59.97, maximo: 60, medido: 59.82 };
    const first = await crearDiagnosticoMedicion('empresa-1', 'hallazgo-1', measurement);
    const second = await crearDiagnosticoMedicion('empresa-1', 'hallazgo-1', measurement);

    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.medido).toBe(59.82);
  });
});

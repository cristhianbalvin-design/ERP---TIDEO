import { describe, expect, it } from 'vitest';
import { construirPayloadWhitelist, esIdDiagnosticoValido, sanearConclusion } from '../../supabase/functions/generar-conclusion-informe/conclusion.ts';

describe('conclusion IA', () => {
  it('valida el formato de texto de los IDs de diagn\u00f3stico', () => {
    expect(esIdDiagnosticoValido('dt_dd576e1f60174674b600a7d266fa3170')).toBe(true);
    expect(esIdDiagnosticoValido('')).toBe(false);
    expect(esIdDiagnosticoValido('dd576e1f-6017-4674-b600-a7d266fa3170')).toBe(false);
    expect(esIdDiagnosticoValido('dt_0123456789abcdef0123456789abcdef; DROP TABLE')).toBe(false);
  });

  it('construye un payload acotado desde campos whitelist y relaciona repuestos por línea', () => {
    const payload = construirPayloadWhitelist(
      [{ componente_parte: 'Bomba', tipo_dano_codigo: 'fuga', causa_probable_codigo: 'sello', condicion: 'falla_funcional', riesgo: 'inmediato_por_seguridad', prioridad_efectiva: 'P1', accion_recomendada: 'reparar', observacion: 'x'.repeat(350), extra: 'se descarta' }],
      [{ id: 'l1', familia_nombre: 'Mecánica', actividad_nombre: 'Inspección', tarea_nombre: 'Cambiar sello', hallazgo: 'Fuga visible', cargo_nombre: 'Técnico' }],
      [{ linea_id: 'l1', descripcion: 'Sello', cantidad: 2, unidad: 'und', extra: 'se descarta' }],
      [{ catalogo: 'tipo_dano', codigo: 'fuga', etiqueta: 'Fuga' }, { catalogo: 'causa_probable', codigo: 'sello', etiqueta: 'Sello deteriorado' }],
    );
    expect(payload.hallazgos[0]).toMatchObject({ componente: 'Bomba', dano: 'Fuga', causa: 'Sello deteriorado', prioridad: 'P1' });
    expect(construirPayloadWhitelist([
      { prioridad_override: 'P2', prioridad_calculada: 'P3' },
      { prioridad_calculada: 'P4' },
    ]).hallazgos.map(item => item.prioridad)).toEqual(['P2', 'P4']);
    expect(payload.hallazgos[0].observacion).toHaveLength(300);
    expect(payload.trabajos[0].repuestos).toEqual([{ descripcion: 'Sello', cantidad: 2, unidad: 'und' }]);
    expect(JSON.stringify(payload)).not.toContain('extra');
    expect(construirPayloadWhitelist(Array.from({ length: 45 }, () => ({}))).hallazgos).toHaveLength(40);
    expect(construirPayloadWhitelist([], Array.from({ length: 65 }, () => ({}))).trabajos).toHaveLength(60);
  });

  it('quita markdown, limita a 800 caracteres y rechaza texto vacío por medio de salida vacía', () => {
    expect(sanearConclusion('**Conclusión técnica.**')).toBe('Conclusión técnica.');
    expect(sanearConclusion('   ')).toBe('');
    const long = `${'A'.repeat(790)}. ${'B'.repeat(40)}.`;
    expect(sanearConclusion(long).length).toBeLessThanOrEqual(800);
    expect(sanearConclusion(long).endsWith('.')).toBe(true);
  });
});

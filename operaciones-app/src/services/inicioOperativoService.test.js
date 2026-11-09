import { describe, expect, it } from 'vitest';
import { agruparBacklog, calcularKpis, certificacionesPorVencer, otsSinParte, saludoHora } from './inicioOperativoService.js';

describe('Inicio operativo', () => {
  it('saluda según la hora', () => {
    expect([saludoHora(6), saludoHora(12), saludoHora(19)]).toEqual(['Buenos días', 'Buenas tardes', 'Buenas noches']);
  });
  it('calcula indicadores y vacíos', () => {
    const ordenes = [{ estado: 'ejecucion', avance_pct: 30 }, { estado: 'ejecucion', avance_pct: 70 }, { estado: 'programada', fecha_programada: '2026-11-09', numero: 'OT-1' }];
    expect(calcularKpis(ordenes, [{}], [{ estado: 'en_mantenimiento' }, { estado: 'disponible' }], '2026-11-09')).toMatchObject({ ejecucion: 2, avance: 50, partes: 1, mantenimiento: 1, propios: 2, programadas: [{ numero: 'OT-1' }] });
    expect(calcularKpis([], [], [], '2026-11-09')).toMatchObject({ ejecucion: 0, avance: 0, programadas: [], partes: 0, mantenimiento: 0, propios: 0 });
  });
  it('detecta OT sin parte durante al menos tres días', () => {
    const ots = ['a', 'b', 'c'].map(id => ({ id, estado: 'ejecucion', created_at: '2026-11-01' }));
    expect(otsSinParte(ots, [{ orden_trabajo_id: 'a', fecha: '2026-11-06' }, { orden_trabajo_id: 'b', fecha: '2026-11-07' }], '2026-11-09').map(o => o.id)).toEqual(['a', 'c']);
    expect(otsSinParte([], [], '2026-11-09')).toEqual([]);
  });
  it('incluye vencimientos hasta 30 días y excluye anuladas', () => {
    const certs = [{ fecha_vencimiento: '2026-12-09', estado: 'activa' }, { fecha_vencimiento: '2026-12-10', estado: 'activa' }, { fecha_vencimiento: '2026-11-09', estado: 'anulada' }];
    expect(certificacionesPorVencer(certs, '2026-11-09')).toEqual([certs[0]]);
    expect(certificacionesPorVencer([], '2026-11-09')).toEqual([]);
  });
  it('agrupa descripciones iguales y acepta vacíos', () => {
    expect(agruparBacklog([{ descripcion: 'Cambio de filtro' }, { descripcion: ' cambio de filtro ' }])).toEqual([{ descripcion: 'Cambio de filtro', cantidad: 2 }]);
    expect(agruparBacklog([])).toEqual([]);
  });
});

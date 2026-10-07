import { describe, expect, it } from 'vitest';
import { construirVistaInforme } from '../src/zahory-mock/pages/informeSnapshot.js';

const hallazgo = { id: 'h1', incluir_en_informe: true, componente_parte: 'Rodamiento', tipo_dano_codigo: 'desgaste', causa_probable_codigo: 'lubricacion', condicion: 'fuera_de_tolerancia', riesgo: 'antes_de_operar', accion_recomendada: 'reemplazar', atribuible_a: 'operacion', prioridad_efectiva: 'P1', observacion: 'Vibración elevada', mediciones: [{ parametro: 'Juego', unidad: 'mm', nominal: 1, minimo: 0.8, maximo: 1.2, medido: 1.8, resultado_calculado: 'fuera_de_rango' }] };
const diagnostico = { id: 'd1', tipo: 'mantenimiento', estado: 'emitido', recepcion_id: 'r1', hallazgos: [hallazgo, { id: 'h2', incluir_en_informe: true, condicion: 'conforme', prioridad_efectiva: 'P4' }, { id: 'h3', incluir_en_informe: false, prioridad_efectiva: 'P2' }], lineas: [{ id: 'l1', familia_trabajo_id: 'f1', tarea_id: 't1', cargo_id: 'c1', horas_mano_obra: 2, materiales: [{ descripcion: 'Sello', cantidad: 1, unidad: 'und' }] }] };
const catalogs = { tipos_dano: [{ codigo: 'desgaste', etiqueta: 'Desgaste' }], causas_probables: [{ codigo: 'lubricacion', etiqueta: 'Falta de lubricación' }], condiciones: [{ codigo: 'fuera_de_tolerancia', etiqueta: 'Fuera de tolerancia' }], riesgos: [], acciones_recomendadas: [], atribuibles: [], familias: [{ id: 'f1', nombre: 'Conjunto rotativo' }], tipos: [{ id: 't1', nombre: 'Cambiar sello', codigo: 'T-1' }], cargos: [{ id: 'c1', nombre: 'Técnico', codigo: 'TEC' }], activos: [] };

describe('construirVistaInforme', () => {
  it('devuelve exactamente la forma del snapshot 595 y resuelve etiquetas de catálogos', () => {
    const result = construirVistaInforme(diagnostico, { incluir_mediciones: true, mostrar_horas: true }, catalogs, { numero: 'RAC-1' });
    expect(Object.keys(result)).toEqual(['version', 'emitido_en', 'cabecera', 'hallazgos', 'mediciones', 'tareas_repuestos', 'resumen', 'conclusion', 'conclusion_origen', 'emisor']);
    expect(Object.keys(result.cabecera)).toEqual(['recepcion_id', 'numero_recepcion', 'numero_caso', 'fecha_recepcion', 'activo_id', 'activo_codigo', 'activo_nombre', 'numero_serie', 'horometro', 'cliente_id', 'cliente_razon_social', 'diagnostico_id', 'tipo', 'estado_diagnostico']);
    expect(result.hallazgos[0].tipo_dano_etiqueta).toBe('Desgaste');
    expect(result.hallazgos[0].causa_probable_etiqueta).toBe('Falta de lubricación');
    expect(result.tareas_repuestos[0].familia_trabajo_nombre).toBe('Conjunto rotativo');
    expect(result.resumen).toEqual({ P1: 1, P2: 0, P3: 0, P4: 1, conformes: 1 });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/costo|precio|tarifa|margen|salario|sueldo/i);
  });

  it('respeta opciones: filtra conformes/no incluidos, oculta mediciones y horas', () => {
    const result = construirVistaInforme(diagnostico, { ocultar_conformes: true, incluir_mediciones: false, mostrar_horas: false }, catalogs);
    expect(result.hallazgos.map(row => row.hallazgo_id)).toEqual(['h1']);
    expect(result.mediciones).toEqual([]);
    expect(result.tareas_repuestos[0]).not.toHaveProperty('horas_mano_obra');
    expect(result.tareas_repuestos[0].tarea_nombre).toBe('Cambiar sello');
  });

  it('incluye hasta tres fotos firmadas, ordenadas y no excluidas por hallazgo', () => {
    const fotos = [
      { orden: 4, signedUrl: 'url-4', excluir_del_informe: false, leyenda: 'Cuatro' },
      { orden: 2, signedUrl: 'url-2', excluir_del_informe: false, leyenda: 'Dos' },
      { orden: 1, signedUrl: 'url-1', excluir_del_informe: true, leyenda: 'Oculta' },
      { orden: 3, signedUrl: 'url-3', excluir_del_informe: false },
      { orden: 5, signedUrl: null, excluir_del_informe: false },
      { orden: 6, signedUrl: 'url-6', excluir_del_informe: false },
    ];
    const result = construirVistaInforme(diagnostico, {}, {}, {}, { h1: fotos });
    expect(result.hallazgos[0].fotos).toEqual([
      { url: 'url-2', leyenda: 'Dos' },
      { url: 'url-3', leyenda: null },
      { url: 'url-4', leyenda: 'Cuatro' },
    ]);
  });

  it('deja fotos vacías si no se pasa el parámetro o no hay fotos', () => {
    expect(construirVistaInforme(diagnostico).hallazgos[0].fotos).toEqual([]);
    expect(construirVistaInforme(diagnostico, {}, {}, {}, { h1: [] }).hallazgos[0].fotos).toEqual([]);
  });
});

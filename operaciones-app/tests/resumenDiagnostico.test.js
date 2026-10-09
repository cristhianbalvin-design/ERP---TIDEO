import test from 'node:test';
import assert from 'node:assert/strict';
import { construirResumenDiagnostico } from '../src/services/resumenDiagnostico.js';

const catalogs = {
  tipo_dano: [{ codigo: 'desgaste', etiqueta: 'Desgaste' }],
  causa_probable: [{ codigo: 'uso', etiqueta: 'Uso prolongado' }],
};

test('construye frases estables con daño, condición, causa, acción y tareas sin duplicados', () => {
  const hallazgo = { componente_parte: 'Vástago', tipo_dano_codigo: 'desgaste', condicion: 'fuera_de_tolerancia', causa_probable_codigo: 'uso', accion_recomendada: 'reparar' };
  const actual = construirResumenDiagnostico([hallazgo, hallazgo], [{ tarea_id: 't2' }, { tarea_id: 't1' }], [{ id: 't1', nombre: 'Bruñido' }, { id: 't2', nombre: 'Cambio de sellos' }], catalogs);
  assert.equal(actual, 'Vástago: Desgaste · Fuera de tolerancia por Uso prolongado — Reparar Trabajos a realizar: Bruñido, Cambio de sellos.');
});

test('no genera resumen si no hay hallazgos', () => {
  assert.equal(construirResumenDiagnostico([], [{ tarea_nombre: 'Prueba' }]), '');
});

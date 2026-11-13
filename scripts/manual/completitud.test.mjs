import test from 'node:test';
import assert from 'node:assert/strict';
import { botonesPropios, evaluarFicha } from './completitud.mjs';

const botones = ['Nueva cuenta (solo si puedeCrear)', 'Guardando… / Guardar condiciones', 'Importar Excel', 'Cancelar', '‹ Cuentas', 'Agregar precio'];

test('descarta botones genéricos, de navegación y textos de progreso', () => {
  assert.deepEqual(botonesPropios(botones).map(b => b.texto), ['Nueva cuenta', 'Guardar condiciones', 'Importar Excel', 'Agregar precio']);
});

test('una ficha que solo lista dos botones queda incompleta y dice qué falta', () => {
  const r = evaluarFicha({ resumen: 'Clientes.', pasos: ['Crea un cliente con Nueva cuenta.', 'Usa Importar Excel.'] }, botones);
  assert.equal(r.faltas.length, 5);
  assert.match(r.faltas.join('\n'), /Guardar condiciones · Agregar precio/);
});

test('una ficha completa no tiene faltas', () => {
  const r = evaluarFicha({ resumen: 'Clientes y sus contactos.', pasos: [
    'Para qué sirve: guardar las empresas con las que se cotiza y factura.',
    'Nueva cuenta crea el cliente; hace falta el permiso de crear en Cuentas.',
    'Importar Excel carga muchas cuentas con la plantilla.',
    'Agregar precio registra un precio pactado y Guardar condiciones conserva las condiciones comerciales.',
    'Si no ves Nueva cuenta, tu rol no tiene permiso de crear.',
  ] }, botones);
  assert.deepEqual(r.faltas, []);
});

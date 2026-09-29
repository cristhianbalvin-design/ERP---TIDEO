import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularTerminosEquipo, subtotalItem } from './terminosEquipo.js';

test('costo mes = costo hora x horas mínimas x unidades; período = mes x meses', () => {
  assert.deepEqual(
    calcularTerminosEquipo({ cantidad: 2, costo_hora: 40, horas_minimas_garantizadas: 200, duracion_meses: 2 }),
    { costo_mes: 16000, costo_periodo: 32000 },
  );
  assert.deepEqual(
    calcularTerminosEquipo({ cantidad: 2, costo_hora: 30, horas_minimas_garantizadas: 200, duracion_meses: 3 }),
    { costo_mes: 12000, costo_periodo: 36000 },
  );
});

test('sin términos de equipo no calcula y el subtotal es cantidad x precio', () => {
  const item = { cantidad: 3, precio_unitario: 10 };
  assert.equal(calcularTerminosEquipo(item), null);
  assert.equal(subtotalItem(item), 30);
});

test('el subtotal de una cotización es la suma de los costos del período', () => {
  const items = [
    { cantidad: 2, costo_hora: 40, horas_minimas_garantizadas: 200, duracion_meses: 2, precio_unitario: 40 },
    { cantidad: 2, costo_hora: 30, horas_minimas_garantizadas: 200, duracion_meses: 3, precio_unitario: 30 },
  ];
  assert.equal(items.reduce((suma, item) => suma + subtotalItem(item), 0), 68000);
});

test('un valor guardado viejo no pisa el cálculo actual', () => {
  const item = { cantidad: 2, costo_hora: 40, horas_minimas_garantizadas: 200, duracion_meses: 2, costo_mes: 8000, costo_periodo: 16000 };
  assert.equal(calcularTerminosEquipo(item).costo_periodo, 32000);
});

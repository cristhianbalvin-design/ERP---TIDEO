import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTextoDocumental } from './variablesDocumentales.js';

test('reconoce variables documentales con eñe y sin tilde', () => {
  const resultado = renderTextoDocumental(
    'Marca {{item.marca}} / Año {{item.año_fabricacion}}',
    'cotizacion',
    { item: { marca: 'ASUS', año_fabricacion: 2018 } },
  );

  assert.equal(resultado, 'Marca ASUS / Año 2018');
});

test('normaliza una clave Unicode combinada antes de resolverla', () => {
  const claveCombinada = 'año_fabricacion'.normalize('NFD');
  const resultado = renderTextoDocumental(`{{item.${claveCombinada}}}`, 'cotizacion', {
    item: { año_fabricacion: 2018 },
  });

  assert.equal(resultado, '2018');
});

test('resuelve nombre del activo y campos del tarifario de flota', () => {
  const resultado = renderTextoDocumental(
    '{{item.nombre_activo}} / {{item.horas_estimadas}} h / {{item.horas_minimas_garantizadas}} h min / {{item.duracion_meses}} meses',
    'cotizacion',
    { item: { nombre_activo: 'Excavadora', horas_estimadas: 10, horas_minimas_garantizadas: 8, duracion_meses: 6 } },
  );

  assert.equal(resultado, 'Excavadora / 10 h / 8 h min / 6 meses');
});

test('costo mes y costo del período se derivan de costo hora, horas mínimas, unidades y meses', () => {
  const item = { cantidad: 2, costo_hora: 40, horas_minimas_garantizadas: 200, duracion_meses: 2, costo_mes: 8000, costo_periodo: 16000 };
  const resultado = renderTextoDocumental(
    '{{item.costo_hora}} | {{item.costo_mes}} | {{item.costo_periodo}} | {{item.subtotal}}',
    'cotizacion',
    { cotizacion: { moneda: 'USD' }, item },
  );

  assert.equal(resultado, 'US$ 40.00 | US$ 16,000.00 | US$ 32,000.00 | US$ 32,000');
});

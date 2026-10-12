import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./estadoResultadosService.js', import.meta.url), 'utf8');
const start = source.indexOf('export function filtrarIngresosVentaSinComprobante');
const end = source.indexOf('\n}', start) + 2;
const filterFunction = source.slice(start, end).replace('export function', 'function');
const dependencies = `
  const isInPeriod = (date, period) => String(date || '').slice(0, 7) === period;
  const normalizeSociedadIds = ids => Array.isArray(ids) && ids.filter(Boolean).length ? [...new Set(ids.filter(Boolean))] : null;
  const matchesSociedad = (id, ids) => ids == null || ids.includes(id);
`;
const { filtrarIngresosVentaSinComprobante } = runInNewContext(`${dependencies}${filterFunction}; ({ filtrarIngresosVentaSinComprobante })`);

test('filtra ingresos sin comprobante por tipo, estado, periodo y sociedad', () => {
  const rows = [
    { id: 'direct-ok', tipo_venta: 'sin_comprobante', estado: 'confirmada', fecha: '2026-03-15', sociedad_id: 'soc-a', subtotal: 100 },
    { id: 'other-period', tipo_venta: 'sin_comprobante', estado: 'confirmada', fecha: '2026-02-28', sociedad_id: 'soc-a', subtotal: 200 },
    { id: 'cancelled', tipo_venta: 'sin_comprobante', estado: 'anulada', fecha: '2026-03-15', sociedad_id: 'soc-a', subtotal: 300 },
    { id: 'invoice', tipo_venta: 'con_comprobante', estado: 'confirmada', fecha: '2026-03-15', sociedad_id: 'soc-a', subtotal: 400 },
    { id: 'other-society', tipo_venta: 'sin_comprobante', estado: 'confirmada', fecha: '2026-03-15', sociedad_id: 'soc-b', subtotal: 500 },
  ];
  assert.deepEqual(filtrarIngresosVentaSinComprobante(rows, '2026-03', ['soc-a']).map(v => v.id), ['direct-ok']);
  assert.deepEqual(filtrarIngresosVentaSinComprobante(rows, '2026-03').map(v => v.id), ['direct-ok', 'other-society']);
});

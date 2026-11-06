import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crearPayloadSugerenciaCategoriaEgreso,
  validarRespuestaSugerenciaCategoriaEgreso,
  sugerirCategoriaEgreso,
} from './sugerirCategoriaEgresoService.js';

test('el payload solo incluye empresa, descripción, tipo y el indicador opcional de caja chica', () => {
  const payload = crearPayloadSugerenciaCategoriaEgreso({
    empresaId: 'empresa-1', descripcion: 'Compra de cable', tipoGasto: 'Materiales',
    cajaChica: true, proveedor: 'Privado', monto: 900, categorias: ['No viajan'],
  });
  assert.deepEqual(Object.keys(payload), ['empresa_id', 'descripcion', 'tipo_gasto', 'caja_chica']);
  assert.deepEqual(payload, { empresa_id: 'empresa-1', descripcion: 'Compra de cable', tipo_gasto: 'Materiales', caja_chica: true });
  assert.deepEqual(Object.keys(crearPayloadSugerenciaCategoriaEgreso({ empresaId: 'e1', descripcion: 'cable', tipoGasto: 'Materiales' })), ['empresa_id', 'descripcion', 'tipo_gasto']);
});

const tiposActivos = [
  { id: 't1', nombre: 'Materiales e insumos', categoria_er: 'Materiales', activo: true, aplica_caja_chica: true },
  { id: 't2', nombre: 'Movilidad comercial', categoria_er: 'Comerciales', activo: true, aplica_caja_chica: false },
];

test('acepta tipo y categoría activos coincidentes con razón breve', () => {
  assert.deepEqual(validarRespuestaSugerenciaCategoriaEgreso(
    { tipo_gasto_id: 't1', tipo_gasto: 'Materiales e insumos', categoria: 'Materiales', razon: 'Describe compra de insumos.' },
    tiposActivos, ['Materiales', 'Servicios'],
  ), { tipo_gasto_id: 't1', tipo_gasto: 'Materiales e insumos', categoria: 'Materiales', razon: 'Describe compra de insumos.', flujo_sugerido: null });
});

test('rechaza tipos inventados, categoría que no coincide, categoría inactiva y tipo no elegible para caja chica', () => {
  const base = { tipo_gasto_id: 't1', tipo_gasto: 'Materiales e insumos', categoria: 'Materiales', razon: 'x' };
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso({ ...base, tipo_gasto_id: 'inventado' }, tiposActivos, ['Materiales']), null);
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso({ ...base, categoria: 'Comerciales' }, tiposActivos, ['Materiales', 'Comerciales']), null);
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso(base, tiposActivos, ['Servicios']), null);
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso({ ...base, tipo_gasto_id: 't2', tipo_gasto: 'Movilidad comercial', categoria: 'Comerciales' }, tiposActivos, ['Comerciales'], true), null);
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso(null, tiposActivos, ['Materiales']), null);
});

test('acepta una respuesta sin coincidencia representada con todos los campos nulos', () => {
  assert.deepEqual(validarRespuestaSugerenciaCategoriaEgreso(
    { tipo_gasto_id: null, tipo_gasto: null, categoria: null, razon: null }, tiposActivos, ['Materiales'],
  ), { tipo_gasto_id: null, tipo_gasto: null, categoria: null, razon: null, flujo_sugerido: null });
});

test('acepta flujos permitidos con gasto nulo y razón válida, incluso sin enviar flujo en respuestas antiguas', () => {
  const flujo = validarRespuestaSugerenciaCategoriaEgreso(
    { tipo_gasto_id: null, tipo_gasto: null, categoria: null, razon: 'El principal recibido corresponde a un préstamo.', flujo_sugerido: 'prestamo' },
    tiposActivos, ['Materiales'],
  );
  assert.deepEqual(flujo, { tipo_gasto_id: null, tipo_gasto: null, categoria: null, razon: 'El principal recibido corresponde a un préstamo.', flujo_sugerido: 'prestamo' });
  assert.deepEqual(validarRespuestaSugerenciaCategoriaEgreso(
    { tipo_gasto_id: 't1', tipo_gasto: 'Materiales e insumos', categoria: 'Materiales', razon: 'Compra de materiales.' },
    tiposActivos, ['Materiales'],
  ), { tipo_gasto_id: 't1', tipo_gasto: 'Materiales e insumos', categoria: 'Materiales', razon: 'Compra de materiales.', flujo_sugerido: null });
});

test('rechaza flujos no permitidos, mezclados con gasto o sin razón válida', () => {
  const base = { tipo_gasto_id: null, tipo_gasto: null, categoria: null, razon: 'Movimiento de fondos propios.' };
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso({ ...base, flujo_sugerido: 'inventado' }, tiposActivos, ['Materiales']), null);
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso({ ...base, tipo_gasto: 'Materiales e insumos', flujo_sugerido: 'transferencia' }, tiposActivos, ['Materiales']), null);
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso({ ...base, razon: ' ', flujo_sugerido: 'cambio_moneda' }, tiposActivos, ['Materiales']), null);
  assert.equal(validarRespuestaSugerenciaCategoriaEgreso({ ...base, razon: 'x'.repeat(301), flujo_sugerido: 'prestamo' }, tiposActivos, ['Materiales']), null);
});

test('propaga de forma controlada errores de red de la invocación', async () => {
  const cliente = { functions: { invoke: async () => { throw new TypeError('Failed to fetch'); } } };
  await assert.rejects(
    sugerirCategoriaEgreso({ empresaId: 'e1', descripcion: 'cable', tipoGasto: 'Materiales', cliente }),
    /Failed to fetch/,
  );
});

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const llamadas = [];
let respuesta = { data: { insertadas: 1, actualizadas: 0, eliminadas: 0 }, error: null };
const cliente = {
  rpc: async (...args) => {
    llamadas.push(args);
    return respuesta;
  },
};

mock.module('../lib/supabaseClient.js', {
  namedExports: { getSupabaseClient: async () => cliente },
});

const { recetasActividadService } = await import('./recetasActividadService.js');

test('guardarReceta envía una sola RPC con filas normalizadas', async () => {
  llamadas.length = 0;
  respuesta = { data: { insertadas: 1, actualizadas: 0, eliminadas: 0 }, error: null };
  const resultado = await recetasActividadService.guardarReceta('emp-1', 'act-1', [], [
    { tarea_id: 'tar-1', cargo_id: '' },
    { tarea_id: 'tar-2', cargo_id: 'cargo-1' },
  ]);

  assert.deepEqual(llamadas, [[
    'reemplazar_receta_actividad',
    {
      p_empresa_id: 'emp-1',
      p_actividad_id: 'act-1',
      p_filas: [
        { tarea_id: 'tar-1', cargo_id: null, orden: 1 },
        { tarea_id: 'tar-2', cargo_id: 'cargo-1', orden: 2 },
      ],
    },
  ]]);
  assert.deepEqual(resultado, { insertadas: 1, actualizadas: 0, eliminadas: 0 });
});

test('guardarReceta propaga el error de la RPC sin llamadas adicionales', async () => {
  llamadas.length = 0;
  const error = new Error('falló RPC');
  respuesta = { data: null, error };

  await assert.rejects(recetasActividadService.guardarReceta('emp-1', 'act-1', [], []), error);
  assert.equal(llamadas.length, 1);
});

test('guardarReceta conserva el mensaje cuando falta empresa o actividad', async () => {
  llamadas.length = 0;
  const mensaje = 'Selecciona una empresa y una actividad para guardar la receta.';

  await assert.rejects(recetasActividadService.guardarReceta('', 'act-1', [], []), { message: mensaje });
  await assert.rejects(recetasActividadService.guardarReceta('emp-1', '', [], []), { message: mensaje });
  assert.equal(llamadas.length, 0);
});

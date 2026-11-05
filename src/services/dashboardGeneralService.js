import { getSupabaseClient } from '../lib/supabaseClient.js';
async function leerTodo(empresaId, tabla) {
  const cliente = await getSupabaseClient();
  const filas = [];
  const tamano = 1000;
  for (let inicio = 0;; inicio += tamano) {
    const { data, error } = await cliente.from(tabla).select('*').eq('empresa_id', empresaId).order('id').range(inicio, inicio + tamano - 1);
    if (error)
      throw error;
    filas.push(...(data || []));
    if (!data || data.length < tamano)
      return filas;
  }
}
export async function cargarFuentesDashboard(empresaId) {
  const nombres = ['cobros', 'tickets', 'recepciones'];
  const tablas = ['cobros_cxc', 'tickets_con_sla', 'recepciones_activos_cliente'];
  const resultados = await Promise.allSettled(tablas.map(tabla => leerTodo(empresaId, tabla)));
  return Object.fromEntries(resultados.map((resultado, indice) => [
    nombres[indice],
    resultado.status === 'fulfilled'
      ? { data: resultado.value, error: '' }
      : { data: [], error: resultado.reason?.message || 'No se pudo cargar la fuente.' },
  ]));
}

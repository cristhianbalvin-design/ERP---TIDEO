// Entorno de la Edge para el código compartido con la pantalla de Finanzas (ver scripts/aria/er-compartido.mjs).
// Cada consulta corre con el cliente de Supabase de la persona que pregunta, así que aplican sus permisos y su RLS.
import { AsyncLocalStorage } from 'node:async_hooks';

const almacen = new AsyncLocalStorage();

export const isSupabaseMode = () => true;

export async function getSupabaseClient() {
  const cliente = almacen.getStore();
  if (!cliente) throw new Error('Sin cliente de Supabase en esta consulta');
  return cliente;
}

export function conCliente(cliente, operacion) {
  return almacen.run(cliente, operacion);
}

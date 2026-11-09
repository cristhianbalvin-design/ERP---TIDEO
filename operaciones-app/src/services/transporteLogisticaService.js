// Hoja de Ruta combinada en Operaciones: usa el acceso a datos compartido con la app del conductor.
import { getSupabaseClient } from '../lib/supabaseClient.js';
import * as api from '../../../src/services/transporteLogisticaApi.js';

const conCliente = fn => (...args) => fn(getSupabaseClient(), ...args);

export const listarViajesHojaRuta = conCliente(api.listarViajesHojaRuta);
export const obtenerViajeCompleto = conCliente(api.obtenerViajeCompleto);
export const obtenerOperacionViaje = conCliente(api.obtenerOperacionViaje);
export const listarPedidosRuta = conCliente(api.listarPedidosRuta);
export const crearPedidoRuta = conCliente(api.crearPedidoRuta);
export const retirarPedidoRuta = conCliente(api.retirarPedidoRuta);
export const guardarRutaLogistica = conCliente(api.guardarRutaLogistica);
export const agregarPedidosARuta = conCliente(api.agregarPedidosARuta);
export const autorizarSalida = conCliente(api.autorizarSalida);
export const listarUsuariosEmpresa = conCliente(api.listarUsuariosEmpresa);
export const { imagenComoDataUrl } = api;

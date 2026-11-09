// Hoja de Ruta combinada en el panel administrativo («Enviar a ruta» y app del conductor).
import { getSupabaseClient } from '../lib/supabaseClient.js';
import * as api from './transporteLogisticaApi.js';

const conCliente = fn => async (...args) => fn(await getSupabaseClient(), ...args);

export const pedidoActivoDeDocumento = conCliente(api.pedidoActivoDeDocumento);
export const crearPedidoRuta = conCliente(api.crearPedidoRuta);
export const retirarPedidoRuta = conCliente(api.retirarPedidoRuta);
export const listarViajesConductor = conCliente(api.listarViajesConductor);
export const obtenerViajeCompleto = conCliente(api.obtenerViajeCompleto);
export const iniciarViaje = conCliente(api.iniciarViaje);
export const registrarHito = conCliente(api.registrarHito);
export const marcarLlegada = conCliente(api.marcarLlegada);
export const completarParada = conCliente(api.completarParada);
export const terminarRutaLogistica = conCliente(api.terminarRutaLogistica);
export const agregarParadaLibre = conCliente(api.agregarParadaLibre);
export const registrarInspeccion = conCliente(api.registrarInspeccion);
export const registrarGasto = conCliente(api.registrarGasto);
export const reportarIncidente = conCliente(api.reportarIncidente);
export const registrarLectura = conCliente(api.registrarLectura);
export const continuarViaje = conCliente(api.continuarViaje);
export const { imagenComoDataUrl } = api;

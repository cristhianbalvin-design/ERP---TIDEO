import { getSupabaseClient } from '../lib/supabaseClient.js';

export const OPCIONES_INFORME_POR_DEFECTO = Object.freeze({
  conclusion: '',
  conclusion_origen: 'manual',
  conclusion_confirmada: false,
  incluir_mediciones: false,
  mostrar_horas: false,
  ocultar_conformes: false,
});

const columns = 'id,empresa_id,recepcion_id,diagnostico_id,estado,version,opciones,snapshot,creado_en,actualizado_en,emitido_en,emisor_nombre,emisor_cargo';

export function mensajeErrorDiagnosticoInforme(error) {
  const code = error?.code;
  const message = String(error?.message || '').toLocaleLowerCase();
  if (code === '42501' || /no autorizado|no tienes permiso|se requiere una sesión/.test(message)) return 'No tienes permiso para ver o editar el informe.';
  if (code === 'P0002' || /no existe un diagnóstico|diagnóstico.*no existe|borrador.*no existe/.test(message)) return 'No existe un diagnóstico para esta recepción.';
  if (/informe emitido es inmutable|informe.*inmutable|solo se puede emitir un borrador/.test(message)) return 'El informe emitido es inmutable.';
  if (/conclusión debe confirmarse|conclusion.*confirmar/.test(message)) return 'La conclusión debe confirmarse antes de emitir.';
  return error?.message || 'No se pudo completar la operación del informe.';
}

const unwrap = data => Array.isArray(data) ? data[0] : data;
const throwMapped = error => { if (error) throw new Error(mensajeErrorDiagnosticoInforme(error)); };

export async function usuarioPuedeInforme(empresaId, accion) {
  if (!empresaId) return false;
  const { data, error } = await getSupabaseClient().rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'informe_diagnostico', target_accion: accion });
  throwMapped(error);
  return Boolean(data);
}

export async function obtenerOCrearBorrador(recepcionId) {
  if (!recepcionId) throw new Error('Falta la recepción del informe.');
  const { data, error } = await getSupabaseClient().rpc('obtener_o_crear_borrador_informe', { p_recepcion_id: recepcionId });
  throwMapped(error);
  return unwrap(data);
}

export async function obtenerInformeVigente(recepcionId) {
  if (!recepcionId) throw new Error('Falta la recepción del informe.');
  const { data, error } = await getSupabaseClient().from('diagnostico_informes').select(columns).eq('recepcion_id', recepcionId).order('version', { ascending: false, nullsFirst: false });
  throwMapped(error);
  const rows = data || [];
  return { borrador: rows.find(row => row.estado === 'borrador') || null, emitidos: rows.filter(row => row.estado === 'emitido') };
}

export async function actualizarOpciones(informeId, opciones) {
  if (!informeId) throw new Error('Falta el borrador del informe.');
  const { data, error } = await getSupabaseClient().from('diagnostico_informes').update({ opciones }).eq('id', informeId).eq('estado', 'borrador').select(columns).single();
  throwMapped(error);
  return data;
}

export async function emitirInformeDiagnostico({ informeId, emisorNombre, emisorCargo }) {
  if (!informeId) throw new Error('Falta el borrador del informe.');
  if (!String(emisorNombre || '').trim()) throw new Error('El nombre del emisor es obligatorio.');
  const { data, error } = await getSupabaseClient().rpc('emitir_informe_diagnostico', {
    p_id: informeId,
    p_emisor_nombre: String(emisorNombre).trim(),
    p_emisor_cargo: String(emisorCargo || '').trim() || null,
  });
  if (error?.code === '42501') throw new Error('No tienes permiso para emitir este informe.');
  if (error?.code === '22023') throw new Error(error.message || 'No se pudo emitir el informe.');
  throwMapped(error);
  return unwrap(data);
}

export async function generarConclusionIA(diagnosticoId) {
  try {
    const { data, error } = await getSupabaseClient().functions.invoke('generar-conclusion-informe', { body: { diagnostico_id: diagnosticoId } });
    if (error) {
      const status = error.context?.status;
      let errorBody = data;
      if (error.context && typeof error.context.json === 'function') {
        try { errorBody = await error.context.json(); } catch { /* El cuerpo puede no ser JSON o ya haberse consumido. */ }
      }
      if (error.name === 'FunctionsFetchError') throw new Error('No se pudo conectar con el servicio de IA.');
      if (status === 401 || status === 403) throw new Error('No tienes permiso para generar la conclusi\u00f3n.');
      if (status === 429) throw new Error(errorBody?.error || 'Se agot? la cuota diaria de IA.');
      if (status === 502 || status === 504) throw new Error(errorBody?.error || 'La IA no est? disponible en este momento.');
      throw new Error(errorBody?.error || 'No se pudo generar la conclusi\u00f3n.');
    }
    if (!data?.ok || typeof data.conclusion !== 'string') throw new Error(data?.error || 'No se pudo generar la conclusi\u00f3n.');
    return data;
  } catch (error) {
    if (error?.name === 'FunctionsFetchError') throw new Error('No se pudo conectar con el servicio de IA.');
    if (error instanceof Error) throw error;
    throw new Error('No se pudo generar la conclusi\u00f3n.');
  }
}

export async function obtenerIdentidadEmpresa(empresaId) {
  if (!empresaId) return null;
  try {
    const { data, error } = await getSupabaseClient().from('empresa_config').select('logo_url,razon_social,ruc,firmante,cargo_firmante').eq('empresa_id', empresaId).maybeSingle();
    return error ? null : data;
  } catch { return null; }
}

import { getSupabaseClient } from '../lib/supabaseClient.js';
import { crearSociedad, normalizarSlugTideo } from './sociedadesService.js';

const ALFANUMERICOS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function hashAleatorio(longitud = 6) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('El navegador no dispone de un generador aleatorio seguro.');
  }
  const bytes = new Uint8Array(longitud);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => ALFANUMERICOS[byte % ALFANUMERICOS.length]).join('');
}

export async function generarCodigoTenant(nombreGrupo, opciones = {}) {
  const slug = normalizarSlugTideo(nombreGrupo, { maximo: 20 }) || 'grupo';
  const verificarDisponibilidad = opciones.verificarDisponibilidad || (async codigo => {
    const supabase = opciones.supabase || await getSupabaseClient();
    const { data, error } = await supabase
      .from('empresas')
      .select('id')
      .eq('id', codigo)
      .maybeSingle();
    if (error) throw error;
    return !data;
  });

  for (let intento = 0; intento < 30; intento += 1) {
    const codigo = `grp_${slug}_${hashAleatorio(6)}`;
    if (await verificarDisponibilidad(codigo)) return codigo;
  }

  throw new Error('No fue posible generar un código único para el tenant.');
}

export const plataformaService = {
  async listarEmpresas() {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('empresas')
      .select('id, razon_social, nombre_comercial, ruc, pais, moneda_base, zona_horaria, plan_id, estado, fecha_inicio, created_at, multisociedad_habilitado, modulo_operativo_habilitado')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async actualizarEmpresa(id, datos) {
    const supabase = await getSupabaseClient();
    const cambios = { ...datos };

    if (cambios.multisociedad_habilitado === true) {
      const { error: activacionError } = await supabase.rpc('activar_multisociedad_legacy', {
        p_empresa_id: id,
      });
      if (activacionError) throw activacionError;
      delete cambios.multisociedad_habilitado;
    }

    if (Object.keys(cambios).length === 0) {
      const { data, error } = await supabase
        .from('empresas')
        .select()
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from('empresas')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async eliminarEmpresa(id) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('eliminar_tenant_completo', { p_empresa_id: id });
    if (error) throw error;
  },

  async crearTenantConAdmin(payload) {
    const nombreGrupo = String(payload.nombre_grupo || '').trim();
    const sociedad = payload.sociedad || {};
    if (!nombreGrupo) throw new Error('El nombre del grupo es obligatorio.');
    if (!String(sociedad.razon_social || '').trim()
      || !String(sociedad.nombre || '').trim()
      || !String(sociedad.ruc || '').trim()) {
      throw new Error('Debes registrar al menos una sociedad con razón social, nombre y RUC.');
    }

    const supabase = await getSupabaseClient();
    let tenant;
    for (let intento = 0; intento < 10; intento += 1) {
      const codigoTenant = await generarCodigoTenant(nombreGrupo, { supabase });
      const { data, error } = await supabase.rpc('crear_tenant_con_admin', {
        p_nombre_grupo: nombreGrupo,
        p_codigo_tenant: codigoTenant,
        p_nombre_comercial: nombreGrupo,
        p_pais: payload.pais || 'PE',
        p_moneda_base: payload.moneda_base || 'PEN',
        p_zona_horaria: payload.zona_horaria || 'America/Lima',
        p_estado: payload.estado || 'activa',
        p_admin_email: payload.admin_email || null,
        p_admin_nombre: payload.admin_nombre || 'Administrador del tenant',
      });
      if (!error) {
        tenant = data;
        break;
      }
      if (error.code !== '23505') throw error;
    }

    if (!tenant?.empresa_id) {
      throw new Error('No fue posible reservar un código único para el tenant.');
    }

    let sociedadCreada;
    try {
      sociedadCreada = await crearSociedad({
        ...sociedad,
        empresa_id: tenant.empresa_id,
        activa: true,
        es_principal: true,
      });
    } catch (error) {
      const { error: limpiezaError } = await supabase.rpc('eliminar_tenant_completo', {
        p_empresa_id: tenant.empresa_id,
      });
      if (limpiezaError) {
        error.message = `${error.message} El tenant quedó suspendido y requiere limpieza manual: ${limpiezaError.message}`;
      }
      throw error;
    }

    const estadoFinal = tenant.estado_solicitado || payload.estado || 'activa';
    const { data: empresaActiva, error: activacionError } = await supabase
      .from('empresas')
      .update({ estado: estadoFinal })
      .eq('id', tenant.empresa_id)
      .select()
      .single();
    if (activacionError) throw activacionError;

    return {
      ...tenant,
      estado: empresaActiva.estado,
      multisociedad_habilitado: empresaActiva.multisociedad_habilitado,
      sociedad: sociedadCreada,
    };
  },
};

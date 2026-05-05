import { getSupabaseClient } from '../lib/supabaseClient.js';

export const rolesService = {
  async getRoles(empresaId) {
    const supabase = await getSupabaseClient();
    const { data: fnData, error: fnError } = await supabase.functions.invoke('listar-roles-acceso', {
      body: { empresa_id: empresaId },
    });
    if (!fnError && fnData?.success) return fnData.roles || [];

    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nombre');
    if (error) throw error;
    return data || [];
  },

  async getPermisosRoles(rolId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('permisos_roles')
      .select('*')
      .eq('rol_id', rolId);
    if (error) throw error;
    return data || [];
  },

  async getRolesConPermisos(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('listar-roles-acceso', {
      body: { empresa_id: empresaId },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'No se pudieron cargar los roles.');
    return {
      roles: data.roles || [],
      permisos: data.permisos || [],
    };
  },

  async crearRol(rol) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('roles')
      .insert([rol])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarPermisos(rolId, permisos) {
    const supabase = await getSupabaseClient();
    // upsert handles insert or update based on (rol_id, pantalla) unique constraint
    const { error } = await supabase
      .from('permisos_roles')
      .upsert(permisos.map(p => ({ ...p, rol_id: rolId })));
    if (error) throw error;
  },

  async actualizarRol(rolId, datos) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('roles')
      .update(datos)
      .eq('id', rolId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async eliminarRol(rolId) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', rolId);
    if (error) throw error;
  },

  async clonarRol(sourceRolId, newRolName, empresaId) {
    const supabase = await getSupabaseClient();
    
    // 1. Get source role
    const { data: sourceRol, error: rolErr } = await supabase
      .from('roles')
      .select('*')
      .eq('id', sourceRolId)
      .single();
    if (rolErr) throw rolErr;

    // 2. Create new role
    const newRolId = `rol_${empresaId}_${Math.random().toString(36).slice(2, 7)}`;
    const { data: newRol, error: createErr } = await supabase
      .from('roles')
      .insert([{
        id: newRolId,
        empresa_id: empresaId,
        nombre: newRolName,
        descripcion: `Copia de ${sourceRol.nombre}`,
        es_admin_empresa: sourceRol.es_admin_empresa,
        es_superadmin: false, // Never clone superadmin status
        activo: true
      }])
      .select()
      .single();
    if (createErr) throw createErr;

    // 3. Get source permissions
    const { data: sourcePermisos, error: permErr } = await supabase
      .from('permisos_roles')
      .select('*')
      .eq('rol_id', sourceRolId);
    if (permErr) throw permErr;

    // 4. Copy permissions
    if (sourcePermisos && sourcePermisos.length > 0) {
      const newPermisos = sourcePermisos.map(p => {
        const { id, created_at, updated_at, rol_id, ...rest } = p;
        return { ...rest, rol_id: newRolId };
      });
      const { error: insertErr } = await supabase
        .from('permisos_roles')
        .insert(newPermisos);
      if (insertErr) throw insertErr;
    }

    return newRol;
  }
};

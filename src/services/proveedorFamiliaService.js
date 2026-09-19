import { getSupabaseClient } from '../lib/supabaseClient.js';

const TENANT_ERROR = 'El proveedor y la familia deben pertenecer al tenant actual.';

const requireTenant = (empresaId) => {
  if (!empresaId) throw new Error('No se pudo determinar el tenant actual.');
  return empresaId;
};

const validarReferenciasTenant = async (supabase, empresaId, proveedorId, familiaId) => {
  const [{ data: proveedor, error: proveedorError }, { data: familia, error: familiaError }] = await Promise.all([
    supabase
      .from('proveedores')
      .select('id, empresa_id')
      .eq('id', proveedorId)
      .eq('empresa_id', empresaId)
      .maybeSingle(),
    supabase
      .from('material_familias')
      .select('id, empresa_id')
      .eq('id', familiaId)
      .eq('empresa_id', empresaId)
      .maybeSingle(),
  ]);

  if (proveedorError) throw proveedorError;
  if (familiaError) throw familiaError;
  if (!proveedor || !familia) throw new Error(TENANT_ERROR);

  return { proveedor, familia };
};

export const proveedorFamiliaService = {
  async listarPorProveedor(empresaId, proveedorId) {
    const tenantId = requireTenant(empresaId);
    if (!proveedorId) return [];

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('proveedor_familia')
      .select('id, empresa_id, proveedor_id, familia_id, created_at, updated_at')
      .eq('empresa_id', tenantId)
      .eq('proveedor_id', proveedorId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async asignarFamilia(empresaId, proveedorId, familiaId) {
    const tenantId = requireTenant(empresaId);
    if (!proveedorId || !familiaId) throw new Error('Proveedor y familia son obligatorios.');

    const supabase = await getSupabaseClient();
    await validarReferenciasTenant(supabase, tenantId, proveedorId, familiaId);

    const { data, error } = await supabase
      .from('proveedor_familia')
      .insert({ empresa_id: tenantId, proveedor_id: proveedorId, familia_id: familiaId })
      .select('id, empresa_id, proveedor_id, familia_id, created_at, updated_at')
      .single();
    if (error) throw error;
    return data;
  },

  async quitarFamilia(empresaId, proveedorId, familiaId) {
    const tenantId = requireTenant(empresaId);
    if (!proveedorId || !familiaId) throw new Error('Proveedor y familia son obligatorios.');

    const supabase = await getSupabaseClient();
    await validarReferenciasTenant(supabase, tenantId, proveedorId, familiaId);

    const { error } = await supabase
      .from('proveedor_familia')
      .delete()
      .eq('empresa_id', tenantId)
      .eq('proveedor_id', proveedorId)
      .eq('familia_id', familiaId);
    if (error) throw error;
  },
};


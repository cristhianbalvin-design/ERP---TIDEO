export async function obtenerEstadoMultisociedad(supabase, empresaId) {
  if (!supabase || !empresaId) throw new Error('Empresa requerida para validar la sociedad.');

  const { data, error } = await supabase
    .from('empresas')
    .select('multisociedad_habilitado')
    .eq('id', empresaId)
    .single();

  if (error) throw error;
  return Boolean(data?.multisociedad_habilitado);
}

export async function validarSociedadActivaParaEscritura(
  supabase,
  empresaId,
  sociedadId,
  mensaje = 'Selecciona una sociedad activa antes de continuar.',
) {
  const multisociedadHabilitado = await obtenerEstadoMultisociedad(supabase, empresaId);
  if (!multisociedadHabilitado) {
    return { multisociedadHabilitado: false, sociedadId: null };
  }
  if (!sociedadId) throw new Error(mensaje);

  const { data, error } = await supabase
    .from('sociedades')
    .select('id')
    .eq('id', sociedadId)
    .eq('empresa_id', empresaId)
    .eq('activa', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('La sociedad indicada no pertenece al tenant o está inactiva.');

  return { multisociedadHabilitado: true, sociedadId: data.id };
}

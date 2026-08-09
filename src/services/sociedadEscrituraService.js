import { resolverSociedadDocumentoLaboral } from './nominaSociedadService.js';

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

export async function resolverSociedadLaboralParaEscritura(
  supabase,
  empresaId,
  personalId,
  fecha,
) {
  const multisociedadHabilitado = await obtenerEstadoMultisociedad(supabase, empresaId);
  if (!multisociedadHabilitado) return null;
  if (!personalId) throw new Error('El trabajador es obligatorio para resolver la sociedad.');
  if (!fecha) throw new Error('La fecha del documento es obligatoria para resolver la sociedad.');

  const [documentosResult, tiposResult, sociedadesResult] = await Promise.all([
    supabase
      .from('personal_documentos')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('personal_id', personalId),
    supabase
      .from('tipos_documento_empresa')
      .select('*')
      .eq('empresa_id', empresaId),
    supabase
      .from('sociedades')
      .select('id,codigo,nombre,activa')
      .eq('empresa_id', empresaId)
      .eq('activa', true),
  ]);

  if (documentosResult.error) throw documentosResult.error;
  if (tiposResult.error) throw tiposResult.error;
  if (sociedadesResult.error) throw sociedadesResult.error;

  return resolverSociedadDocumentoLaboral({
    multisociedadHabilitado: true,
    documentos: documentosResult.data || [],
    tiposDocumento: tiposResult.data || [],
    sociedades: sociedadesResult.data || [],
    personalId,
    fecha,
  });
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

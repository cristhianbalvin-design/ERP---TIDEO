const TRUE = true;

export function buildRoleDePermisos(rol, permisosRows = [], accesoCampo = false, campoModulos = []) {
  const rows = Array.isArray(permisosRows) ? permisosRows : [];
  // Las banderas tecnicas solo conceden acceso cuando el servidor entrega el
  // booleano true. Valores ausentes, nulos o serializados se tratan como false.
  const esSuperadmin = rol?.es_superadmin === TRUE;
  const esAdmin = esSuperadmin || rol?.es_admin_empresa === TRUE;
  const especialesExtra = rows.find(p => p.pantalla === '__especiales__')?.permisos_extra || {};
  const ver = rows.filter(p => p.puede_ver === TRUE).map(p => p.pantalla);
  const crear = rows.filter(p => p.puede_crear === TRUE).map(p => p.pantalla);
  const editar = rows.filter(p => p.puede_editar === TRUE).map(p => p.pantalla);
  const anular = rows.filter(p => p.puede_anular === TRUE).map(p => p.pantalla);
  const aprobar = rows.filter(p => p.puede_aprobar === TRUE).map(p => p.pantalla);
  const exportar = rows.filter(p => p.puede_exportar === TRUE).map(p => p.pantalla);
  const verFinanzas = esSuperadmin || rows.some(p => p.puede_ver_finanzas === TRUE);
  const verCostos = esSuperadmin || rows.some(p => p.puede_ver_costos === TRUE);
  const verPrecios = esSuperadmin || rows.some(p => p.permisos_extra?.puede_ver_precios === TRUE);
  const puedeAprobar = esSuperadmin || rows.some(p => p.puede_aprobar === TRUE);
  const verConsolidadoGrupo = esAdmin || especialesExtra.ver_consolidado_grupo === TRUE;

  return {
    nombre: rol?.nombre || 'Usuario',
    color: esSuperadmin ? 'navy' : esAdmin ? 'purple' : 'cyan',
    permisos: {
      ver,
      crear,
      editar,
      anular,
      aprobar,
      exportar,
      todo: esAdmin,
      plataforma: esSuperadmin,
      soporte_tenant: esSuperadmin,
      tenant_admin: esAdmin,
      ver_finanzas: verFinanzas,
      ver_costos: verCostos,
      ver_precios: verPrecios,
      aprobar_descuentos: Boolean(esAdmin || especialesExtra.aprobar_descuentos === TRUE || puedeAprobar),
      anular_documentos: Boolean(esAdmin || especialesExtra.anular_documentos === TRUE),
      ver_agenda_equipo: esAdmin,
      ver_consolidado_grupo: verConsolidadoGrupo,
      acceso_campo: Boolean(esAdmin || especialesExtra.acceso_campo === TRUE || accesoCampo === TRUE),
      monto_max_compras: especialesExtra.monto_max_compras ?? 0,
      perfil_campo: especialesExtra.perfil_campo ?? null,
      campo_modulos: Array.isArray(campoModulos) ? campoModulos : [],
    },
  };
}

export function tieneAccesoTotal(role) {
  return role?.permisos?.todo === TRUE;
}

export function puedeVerPantalla(role, pantalla, alternativas = []) {
  if (tieneAccesoTotal(role)) return true;
  if (pantalla === 'mi_portal') return true;

  const permitidas = new Set(Array.isArray(role?.permisos?.ver) ? role.permisos.ver : []);
  if (permitidas.has(pantalla)) return true;
  return alternativas.some(alternativa => permitidas.has(alternativa));
}

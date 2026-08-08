const conFallback = (valor, fallback) => (
  valor === null || valor === undefined || valor === '' ? fallback : valor
);

/**
 * Compone la configuracion usada al emitir un documento.
 *
 * La configuracion del tenant conserva los atributos comunes del grupo. En un
 * tenant multisociedad, la sociedad solo reemplaza los campos de identidad
 * legal y cada campo ausente vuelve individualmente al valor del tenant.
 */
export function resolverIdentidadEmisora({
  empresaConfig = {},
  sociedad = null,
  multisociedadHabilitado = false,
} = {}) {
  const config = empresaConfig || {};
  if (!multisociedadHabilitado || !sociedad) return config;

  return {
    ...config,
    razon_social: conFallback(
      sociedad.razon_social,
      conFallback(sociedad.nombre, config.razon_social),
    ),
    ruc: conFallback(sociedad.ruc, config.ruc),
    direccion: conFallback(sociedad.direccion_fiscal, config.direccion),
    logo_url: conFallback(sociedad.logo_url, config.logo_url),
    firma_url: conFallback(sociedad.firma_url, config.firma_url),
  };
}

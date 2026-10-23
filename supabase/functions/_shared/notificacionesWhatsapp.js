function limpiarTexto(value, limite, fallback) {
  let texto = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {5,}/g, '    ')
    .trim();
  if (!texto) texto = fallback;
  if (texto.length > limite) texto = `${texto.slice(0, limite - 1).trimEnd()}…`;
  return texto || fallback;
}

export function construirCuerpoWhatsApp({ telefono, titulo, mensaje }, {
  template = 'opera_alerta',
  language = 'es',
} = {}) {
  return {
    messaging_product: 'whatsapp',
    to: String(telefono ?? ''),
    type: 'template',
    template: {
      name: template,
      language: { code: language },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: limpiarTexto(titulo, 60, 'Aviso') },
          { type: 'text', text: limpiarTexto(mensaje, 900, 'Sin detalles disponibles.') },
        ],
      }],
    },
  };
}

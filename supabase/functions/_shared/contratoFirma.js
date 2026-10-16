export const sha256Hex = async value => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export const crearTokenFirma = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const crearOtpFirma = () => {
  const max = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const sample = new Uint32Array(1);
  do { crypto.getRandomValues(sample); } while (sample[0] >= max);
  return String(sample[0] % 1_000_000).padStart(6, '0');
};

// Orden: cf-connecting-ip, que fija la capa Cloudflare de Supabase; como fallback,
// primer salto de X-Forwarded-For. Ambos se limitan para evitar valores excesivos.
export const extraerIpCliente = headers =>
  (headers.get('cf-connecting-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconocida').slice(0, 80);

export function distribuirTextoPdf({ texto, font, size, maxWidth, lineHeight, startY, bottomY, pageHeight }) {
  const words = String(texto ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
    if (font.widthOfTextAtSize(line, size) > maxWidth) {
      let fragment = '';
      for (const character of [...line]) {
        if (fragment && font.widthOfTextAtSize(fragment + character, size) > maxWidth) {
          lines.push(fragment);
          fragment = character;
        } else fragment += character;
      }
      line = fragment;
    }
  }
  if (line) lines.push(line);
  const positioned = [];
  let y = startY;
  let page = 0;
  for (const text of lines) {
    if (y < bottomY) { page += 1; y = pageHeight - 64; }
    positioned.push({ text, y, page });
    y -= lineHeight;
  }
  return { lines, positioned, nextY: y, pages: page + 1 };
}

export function extraerParrafosTipTap(node) {
  if (!node) return [];
  if (node.type === 'doc') return (node.content || []).flatMap(extraerParrafosTipTap);
  if (node.type === 'paragraph' || node.type === 'heading') {
    return [{ align: node.attrs?.textAlign || 'left', runs: (node.content || []).flatMap(child => {
      if (child.type !== 'text') return child.type === 'hardBreak' ? [{ text: '\n', bold: false }] : [];
      return [{ text: child.text || '', bold: (child.marks || []).some(mark => mark.type === 'bold') }];
    }) }];
  }
  return (node.content || []).flatMap(extraerParrafosTipTap);
}

export function ajustarRunsPdf(runs, maxWidth, measure) {
  const lines = [];
  let line = [];
  let lineWidth = 0;
  const push = () => { if (line.length) lines.push(line); line = []; lineWidth = 0; };
  for (const run of runs) {
    const chunks = String(run.text || '').split(/(\s+)/).filter(Boolean);
    for (const chunk of chunks) {
      if (chunk === '\n') { push(); continue; }
      const width = measure(chunk, run.bold);
      if (/^\s+$/.test(chunk) && !line.length) continue;
      if (line.length && lineWidth + width > maxWidth && !/^\s+$/.test(chunk)) push();
      const previous = line[line.length - 1];
      if (previous && previous.bold === run.bold) previous.text += chunk;
      else line.push({ text: chunk, bold: run.bold });
      lineWidth += width;
    }
  }
  push();
  return lines;
}

export function construirContextoRenovacion({ empresa = {}, sociedad = null, persona = {}, documento = {}, snapshot = {}, fechaInicio, fechaFin } = {}) {
  const condiciones = { ...(documento.condiciones_laborales || {}), ...snapshot };
  const empleado = {
    ...persona,
    documento: persona.documento || persona.dni || persona.numero_documento || '',
    direccion: persona.direccion || persona.direccion_domicilio || '',
    cargo: persona.cargo || condiciones.cargo_nombre || condiciones.cargo || '',
    area: persona.area || condiciones.area_nombre || condiciones.area || '',
    moneda: condiciones.moneda || persona.moneda || empresa.moneda_base || 'PEN',
    modalidad_contrato: condiciones.modalidad || persona.modalidad_contrato || '',
  };
  const empresaContext = {
    ...empresa,
    razon_social: sociedad?.razon_social || empresa.razon_social || empresa.nombre_legal || empresa.nombre_comercial || '',
    ruc: sociedad?.ruc || empresa.ruc || empresa.numero_ruc || '',
    direccion: sociedad?.direccion_fiscal || empresa.direccion || empresa.direccion_fiscal || empresa.domicilio_fiscal || '',
  };
  const contrato = {
    ...documento,
    condiciones_laborales: condiciones,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    tipo_contrato: condiciones.tipo_contrato || persona.tipo_contrato || persona.modalidad_contrato || '',
    modalidad: condiciones.modalidad || persona.modalidad_contrato || persona.tipo_contrato || '',
  };
  return { empresa: empresaContext, empleado, contrato, condiciones_laborales: condiciones,
    vigencia_efectiva: { fecha_desde: fechaInicio, fecha_hasta: fechaFin },
    cargo: { nombre: empleado.cargo, area: empleado.area } };
}

export const mensajeMotivoFirma = (motivo, intentos = 0) => ({
  no_existe: 'El enlace no es válido o ya no está disponible.',
  firmado: 'Este contrato ya fue firmado.',
  anulado: 'Esta solicitud de firma fue anulada. Contacta con Recursos Humanos.',
  expirado: 'El enlace de firma venció. Contacta con Recursos Humanos.',
  limite_envios: 'Se alcanzó el límite de códigos. Contacta con Recursos Humanos.',
  sin_otp_vigente: 'Solicita un nuevo código para continuar.',
  otp_expirado: 'El código venció. Solicita uno nuevo.',
  intentos_agotados: 'Se agotaron los intentos. Solicita un nuevo código.',
  codigo_incorrecto: `El código no coincide. Te quedan ${Math.max(0, Number(intentos) || 0)} intentos.`,
}[motivo] || 'No se pudo completar la firma. Contacta con Recursos Humanos.');

export const enmascararEmail = value => {
  if (!value || !value.includes('@')) return null;
  const [name, domain] = value.split('@');
  return `${name.slice(0, 1)}***@${domain}`;
};

export const enmascararTelefono = value => value
  ? `${value.replace(/\D/g, '').slice(0, 2)}${'•'.repeat(Math.max(0, value.replace(/\D/g, '').length - 4))}${value.replace(/\D/g, '').slice(-2)}`
  : null;

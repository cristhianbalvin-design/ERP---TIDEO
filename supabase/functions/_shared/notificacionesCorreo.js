const APP_URL_DEFAULT = 'https://erp.tideo.tech';

const escaparHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const valor = value => String(value ?? '').trim();

export function formatearFechaNotificacion(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : valor(value);
}

function plantilla({ asunto, contenidoHtml, contenidoTexto, appUrl }) {
  const url = valor(appUrl).replace(/\/$/, '') || APP_URL_DEFAULT;
  const safeUrl = escaparHtml(url);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f6f8;color:#243247;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escaparHtml(asunto)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f8;padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden"><tr><td style="background:#1A2B4A;padding:24px 32px;color:#fff;font-size:20px;font-weight:700;letter-spacing:1px">TIDEO</td></tr><tr><td style="height:4px;background:#00ACC1;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:30px 32px 20px;font-size:15px;line-height:1.6">${contenidoHtml}<p style="margin:28px 0 8px"><a href="${safeUrl}" style="display:inline-block;background:#00ACC1;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:5px">Abrir en el ERP</a></p></td></tr><tr><td style="padding:16px 32px 24px;color:#718096;font-size:12px;border-top:1px solid #e8edf1">Notificación automática de TIDEO.</td></tr></table></td></tr></table></body></html>`;
  return { asunto, html, texto: `${contenidoTexto}\n\nAbrir en el ERP: ${url}` };
}

function construirResumenVencimiento({ row, payload, appUrl, asuntoBase, titulo, fechaColumna, diasColumna, diasKey, nombrePlural, orden, alertaCompleta = false }) {
  const fecha = formatearFechaNotificacion(payload.fecha);
  const items = payload.items.slice().sort((a, b) => orden * (Number(a?.[diasKey] || 0) - Number(b?.[diasKey] || 0)));
  const total = Number(payload.total ?? items.length) || 0;
  const noun = total === 1 ? nombrePlural[0] : nombrePlural[1];
  const asunto = `${asuntoBase} · ${total} ${noun} · ${fecha}`;
  const mensaje = valor(row.mensaje);
  const rowsHtml = items.map(item => {
    const diasNum = Number(item?.[diasKey]);
    const style = alertaCompleta || diasNum <= 7 ? 'color:#9B1C1C;' : '';
    return `<tr><td style="padding:9px 10px;border-bottom:1px solid #e8edf1;${style}">${escaparHtml(item?.nombre)}</td><td style="padding:9px 10px;border-bottom:1px solid #e8edf1;${style}">${escaparHtml(item?.tipo_documento)}</td><td style="padding:9px 10px;border-bottom:1px solid #e8edf1;${style}">${escaparHtml(formatearFechaNotificacion(item?.fecha_vencimiento))}</td><td style="padding:9px 10px;text-align:right;border-bottom:1px solid #e8edf1;${style}">${escaparHtml(item?.[diasKey])}</td></tr>`;
  }).join('');
  const contenidoHtml = `<h1 style="margin:0 0 16px;color:#1A2B4A;font-size:22px">${escaparHtml(titulo)}</h1><p>${escaparHtml(mensaje)}</p><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:20px 0"><thead><tr style="background:#1A2B4A;color:#fff"><th align="left" style="padding:10px">Colaborador</th><th align="left" style="padding:10px">Documento</th><th align="left" style="padding:10px">${escaparHtml(fechaColumna)}</th><th align="right" style="padding:10px">${escaparHtml(diasColumna)}</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
  const contenidoTexto = `${mensaje}\n\nColaborador | Documento | ${fechaColumna} | ${diasColumna}\n${items.map(item => `${valor(item?.nombre)} | ${valor(item?.tipo_documento)} | ${formatearFechaNotificacion(item?.fecha_vencimiento)} | ${valor(item?.[diasKey])}`).join('\n')}`;
  return plantilla({ asunto, contenidoHtml, contenidoTexto, appUrl });
}

export function construirCorreoNotificacion(row = {}, appUrl = APP_URL_DEFAULT) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const evento = valor(row.evento_codigo);
  if (['contrato_por_vencer', 'documento_por_vencer', 'contrato_vencido'].includes(evento) && Array.isArray(payload.items) && payload.items.length > 0) {
    if (evento === 'documento_por_vencer') return construirResumenVencimiento({ row, payload, appUrl, asuntoBase: 'Documentos por vencer', titulo: 'Documentos por vencer', fechaColumna: 'Vence', diasColumna: 'Días', diasKey: 'dias_restantes', nombrePlural: ['documento', 'documentos'], orden: 1 });
    if (evento === 'contrato_vencido') return construirResumenVencimiento({ row, payload, appUrl, asuntoBase: 'Contratos vencidos sin renovar', titulo: 'Contratos vencidos sin renovar', fechaColumna: 'Venció', diasColumna: 'Días vencido', diasKey: 'dias_vencido', nombrePlural: ['colaborador', 'colaboradores'], orden: -1, alertaCompleta: true });
    return construirResumenVencimiento({ row, payload, appUrl, asuntoBase: 'Contratos por vencer', titulo: 'Contratos por vencer', fechaColumna: 'Vence', diasColumna: 'Días', diasKey: 'dias_restantes', nombrePlural: ['colaborador', 'colaboradores'], orden: 1 });
  }

  if (evento === 'contrato_por_vencer') {
    const nombre = valor(payload.nombre) || 'Colaborador';
    const fecha = formatearFechaNotificacion(payload.fecha_vencimiento);
    const dias = valor(payload.dias_restantes);
    const asunto = `Contrato por vencer · ${nombre} · ${fecha}`;
    const mensaje = valor(row.mensaje) || 'El contrato está próximo a vencer.';
    const datos = [
      ['Colaborador', nombre],
      ['Documento', valor(payload.tipo_documento) || '—'],
      ['Vence', fecha || '—'],
      ['Días restantes', dias || '—'],
    ];
    const contenidoHtml = `<h1 style="margin:0 0 16px;color:#1A2B4A;font-size:22px">Contrato por vencer</h1><p>${escaparHtml(mensaje)}</p><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f3f8fa;border-left:4px solid #00ACC1;margin:22px 0">${datos.map(([label, value]) => `<tr><td style="padding:9px 12px;color:#526174;font-weight:700;border-bottom:1px solid #e2eaf0">${escaparHtml(label)}</td><td style="padding:9px 12px;border-bottom:1px solid #e2eaf0">${escaparHtml(value)}</td></tr>`).join('')}</table>`;
    const contenidoTexto = `${mensaje}\n\nColaborador: ${nombre}\nDocumento: ${valor(payload.tipo_documento) || '—'}\nVence: ${fecha || '—'}\nDías restantes: ${dias || '—'}`;
    return plantilla({ asunto, contenidoHtml, contenidoTexto, appUrl });
  }

  if (evento === 'tardanza_resumen_diario') {
    const fecha = formatearFechaNotificacion(payload.fecha);
    const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => Number(b?.minutos || 0) - Number(a?.minutos || 0));
    const total = Number(payload.total ?? items.length) || 0;
    const noun = total === 1 ? 'colaborador' : 'colaboradores';
    const asunto = `Tardanzas del ${fecha} · ${total} ${noun}`;
    const alcance = payload.alcance === 'equipo' ? 'tu equipo' : 'toda la empresa';
    const umbral = valor(payload.umbral_minutos) || '0';
    const mensaje = valor(row.mensaje) || `Resumen de tardanzas de ${alcance}.`;
    const rowsHtml = items.map(item => `<tr><td style="padding:9px 10px;border-bottom:1px solid #e8edf1">${escaparHtml(item?.nombre)}</td><td style="padding:9px 10px;border-bottom:1px solid #e8edf1">${escaparHtml(item?.hora_entrada)}</td><td style="padding:9px 10px;text-align:right;border-bottom:1px solid #e8edf1">${escaparHtml(item?.minutos)}</td></tr>`).join('');
    const contenidoHtml = `<h1 style="margin:0 0 16px;color:#1A2B4A;font-size:22px">Resumen diario de tardanzas</h1><p>${escaparHtml(mensaje)}</p><p>Umbral: <strong>${escaparHtml(umbral)} minutos</strong>. Alcance: <strong>${escaparHtml(alcance)}</strong>.</p><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:20px 0"><thead><tr style="background:#1A2B4A;color:#fff"><th align="left" style="padding:10px">Nombre</th><th align="left" style="padding:10px">Hora de entrada</th><th align="right" style="padding:10px">Minutos</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
    const contenidoTexto = `${mensaje}\nUmbral: ${umbral} minutos. Alcance: ${alcance}.\n\nNombre | Hora de entrada | Minutos\n${items.map(item => `${valor(item?.nombre)} | ${valor(item?.hora_entrada)} | ${valor(item?.minutos)}`).join('\n')}`;
    return plantilla({ asunto, contenidoHtml, contenidoTexto, appUrl });
  }

  const asunto = valor(row.titulo) || 'Notificación de TIDEO';
  const mensaje = valor(row.mensaje);
  return plantilla({
    asunto,
    contenidoHtml: `<h1 style="margin:0 0 16px;color:#1A2B4A;font-size:22px">${escaparHtml(asunto)}</h1><p>${escaparHtml(mensaje)}</p>`,
    contenidoTexto: mensaje,
    appUrl,
  });
}

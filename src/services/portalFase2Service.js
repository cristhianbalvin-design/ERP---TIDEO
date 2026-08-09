import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { resolverSociedadLaboralParaEscritura } from './sociedadEscrituraService.js';

const jsonStable = value => JSON.stringify(value ?? null, Object.keys(value || {}).sort());

export async function sha256Text(value) {
  const text = typeof value === 'string' ? value : jsonStable(value);
  if (typeof crypto !== 'undefined' && crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash) + text.charCodeAt(i);
  return `mock_${Math.abs(hash)}`;
}

export function plantillaConstanciaHtml({ empresa = {}, emisor = null, ficha = {}, proposito = '', emitidaEn = new Date().toISOString() }) {
  const nombre = ficha.nombre || 'Trabajador';
  const cargo = ficha.cargo || ficha.area || 'Colaborador';
  const ingreso = ficha.fecha_ingreso || 'fecha no registrada';
  const nombreEmpresa = emisor?.razon_social || empresa.nombre || 'la empresa';
  return `
    <section style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:42px;color:#111827">
      ${emisor?.logo_url ? `<img src="${emisor.logo_url}" alt="${nombreEmpresa}" style="display:block;max-width:180px;max-height:72px;object-fit:contain;margin-bottom:24px"/>` : ''}
      <h1 style="text-align:center;font-size:22px;letter-spacing:.08em">CONSTANCIA DE TRABAJO</h1>
      <p style="line-height:1.7;margin-top:32px">
        Por medio de la presente, <strong>${nombreEmpresa}</strong>${emisor?.ruc ? `, identificada con RUC <strong>${emisor.ruc}</strong>` : ''}, deja constancia de que
        <strong>${nombre}</strong>, identificado con documento <strong>${ficha.documento || ficha.dni || '-'}</strong>,
        labora en nuestra organizacion desempeñando el cargo de <strong>${cargo}</strong> desde el
        <strong>${ingreso}</strong>.
      </p>
      ${proposito ? `<p style="line-height:1.7">La presente se emite a solicitud del trabajador para: <strong>${proposito}</strong>.</p>` : ''}
      <p style="line-height:1.7">Se expide para los fines que el interesado estime conveniente.</p>
      <p style="margin-top:42px">Emitido el ${emitidaEn.slice(0, 10)}.</p>
      <div style="margin-top:70px;text-align:center">
        ${emisor?.firma_url ? `<img src="${emisor.firma_url}" alt="Firma" style="display:block;max-width:160px;max-height:64px;object-fit:contain;margin:0 auto 8px"/>` : ''}
        <div style="border-top:1px solid #111827;width:260px;margin:0 auto 8px"></div>
        <strong>Recursos Humanos</strong><br/>
        <span>${nombreEmpresa}</span>
        ${emisor?.direccion ? `<br/><span style="font-size:12px;color:#4b5563">${emisor.direccion}</span>` : ''}
      </div>
    </section>
  `;
}

const insertReturning = async (table, row) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from(table).insert(row).select('*').single();
  if (error) throw error;
  return data;
};

const updateReturning = async (table, id, patch) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
};

export const portalFase2Service = {
  async listar(empresaId) {
    if (!isSupabaseConfigured() || !empresaId) {
      return {
        datosSolicitudes: [],
        constancias: [],
        boletaAcuses: [],
        boletaVisualizaciones: [],
        firmaRegistros: [],
        firmaOtpIntentos: [],
      };
    }
    const supabase = await getSupabaseClient();
    const [datos, constancias, acuses, vistas, firmas, otps] = await Promise.all([
      supabase.from('portal_datos_solicitudes').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('portal_constancias_trabajo').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('portal_boleta_acuses').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('portal_boleta_visualizaciones').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('portal_contrato_firma_registros').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('portal_firma_otp_intentos').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    ]);
    [datos, constancias, acuses, vistas, firmas, otps].forEach(res => { if (res.error) throw res.error; });
    return {
      datosSolicitudes: datos.data || [],
      constancias: constancias.data || [],
      boletaAcuses: acuses.data || [],
      boletaVisualizaciones: vistas.data || [],
      firmaRegistros: firmas.data || [],
      firmaOtpIntentos: otps.data || [],
    };
  },

  crearSolicitudDatos(empresaId, payload) {
    return insertReturning('portal_datos_solicitudes', { ...payload, empresa_id: empresaId });
  },

  resolverSolicitudDatos(id, patch) {
    return updateReturning('portal_datos_solicitudes', id, { ...patch, resuelto_en: new Date().toISOString() });
  },

  async resolverSociedadConstancia(empresaId, personalId, fecha) {
    const supabase = await getSupabaseClient();
    return resolverSociedadLaboralParaEscritura(supabase, empresaId, personalId, fecha);
  },

  async crearConstancia(empresaId, payload) {
    const supabase = await getSupabaseClient();
    const createdAt = new Date().toISOString();
    const sociedadId = await resolverSociedadLaboralParaEscritura(
      supabase,
      empresaId,
      payload.personal_id,
      createdAt.slice(0, 10),
    );
    const {
      empresa_id: _empresaId,
      sociedad_id: _sociedadId,
      created_at: _createdAt,
      ...campos
    } = payload;
    const { data, error } = await supabase
      .from('portal_constancias_trabajo')
      .insert({ ...campos, empresa_id: empresaId, sociedad_id: sociedadId, created_at: createdAt })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async resolverConstancia(id, patch) {
    const supabase = await getSupabaseClient();
    const { data: constancia, error: constanciaError } = await supabase
      .from('portal_constancias_trabajo')
      .select('id,empresa_id,personal_id,sociedad_id')
      .eq('id', id)
      .single();
    if (constanciaError) throw constanciaError;

    const emitida = patch.estado === 'emitida';
    const emitidaEn = emitida ? (patch.emitida_en || new Date().toISOString()) : null;
    const sociedadId = emitida
      ? await resolverSociedadLaboralParaEscritura(
          supabase,
          constancia.empresa_id,
          constancia.personal_id,
          emitidaEn.slice(0, 10),
        )
      : constancia.sociedad_id;
    const {
      empresa_id: _empresaId,
      personal_id: _personalId,
      sociedad_id: _sociedadId,
      created_at: _createdAt,
      ...campos
    } = patch;
    const { data, error } = await supabase
      .from('portal_constancias_trabajo')
      .update({
        ...campos,
        emitida_en: emitidaEn,
        sociedad_id: sociedadId,
        resuelto_en: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  registrarAcuseBoleta(empresaId, payload) {
    return insertReturning('portal_boleta_acuses', { ...payload, empresa_id: empresaId });
  },

  registrarVisualizacionBoleta(empresaId, payload) {
    return insertReturning('portal_boleta_visualizaciones', { ...payload, empresa_id: empresaId });
  },

  crearOtpFirma(empresaId, payload) {
    return insertReturning('portal_firma_otp_intentos', { ...payload, empresa_id: empresaId });
  },

  registrarFirmaContrato(empresaId, payload) {
    return insertReturning('portal_contrato_firma_registros', { ...payload, empresa_id: empresaId });
  },
};

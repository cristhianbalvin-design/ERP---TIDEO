import { getSupabaseClient } from '../lib/supabaseClient.js';

const BUCKET = 'documentos-privados';
// Signed URLs para documentos privados: 10 minutos (600s).
// La renovación automática ocurre en el previsualizador del frontend.
const SIGNED_URL_TTL = 600;

// Calcula el estado de un documento en el frontend, aplicando la regla de sucesor
export function calcularEstadoDocumentoUI(doc, tipo, todosLosDocumentosActivos = []) {
  if (!doc) return { estado: 'falta', dias: null };
  if (doc.estado_validacion === 'rechazado') return { estado: 'rechazado', dias: null };
  if (doc.estado_validacion === 'pendiente' && tipo?.requiere_validacion) return { estado: 'en_revision', dias: null };
  
  // Regla Sucesor
  if (tipo?.tipo_sucesor_id) {
    const sucesorAprobado = todosLosDocumentosActivos.some(d =>
      d.personal_id === doc.personal_id &&
      (d.tipo_documento_id === tipo.tipo_sucesor_id || d.tipo_doc === tipo.tipo_sucesor_id) &&
      d.estado_validacion === 'aprobado' &&
      d.activo === true
    );
    if (sucesorAprobado) {
      return { estado: 'historico', dias: null };
    }
  }

  if (tipo?.exige_vencimiento && !doc.fecha_vencimiento) return { estado: 'incompleto', dias: null };

  let dias = null;
  if (doc.fecha_vencimiento) {
    const hoy = new Date();
    const base = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    const vence = new Date(`${doc.fecha_vencimiento}T00:00:00Z`);
    dias = Math.round((vence - base) / 86400000);
  }

  if (dias !== null && dias < 0) return { estado: 'vencido', dias };
  if (dias !== null && dias <= Number(tipo?.dias_alerta || 0)) return { estado: 'por_vencer', dias };

  return { estado: 'vigente', dias };
}

export function normalizar(doc = {}) {
  // Preserva los campos del documento; el campo estado viene del motor BD, no se recalcula aquí.
  return { ...doc };
}

// ── Consultas ─────────────────────────────────────────────────────────────────

export async function getDocumentosPersona(empresaId, personalId) {
  if (!empresaId || !personalId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('personal_id', personalId)
    .order('tipo_doc')
    .order('version', { ascending: false });
  if (error) { console.error('Error getDocumentosPersona:', error); return []; }
  return (data || []).map(normalizar);
}

// Documentos activos para una sola persona (usado para recargar local sin traer todos)
export async function getDocumentosActivosPersona(empresaId, personalId) {
  if (!empresaId || !personalId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('personal_id', personalId)
    .or('activo.eq.true,estado_validacion.eq.pendiente')
    .order('fecha_vencimiento', { ascending: true });
  if (error) { console.error('Error getDocumentosActivosPersona:', error); return []; }
  return (data || []).map(normalizar);
}

// Todos los documentos activos de la empresa (para el panel RRHH con alertas)
export async function getDocumentosActivos(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .or('activo.eq.true,estado_validacion.eq.pendiente')
    .order('fecha_vencimiento', { ascending: true });
  if (error) { console.error('Error getDocumentosActivos:', error); return []; }
  return (data || []).map(normalizar);
}

// Documentos pendientes de validación
export async function getDocumentosPendientes(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('estado_validacion', 'pendiente')
    .order('creado_en', { ascending: false });
  if (error) { console.error('Error getDocumentosPendientes:', error); return []; }
  return (data || []).map(normalizar);
}

// ── Tipos de Documento Config (Períodos) ──────────────────────────────────────

export async function getTiposDocumentoConfig(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tipos_documento_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo');
  if (error) { console.error('Error getTiposDocumentoConfig:', error); return []; }
  return (data || []).map(d => ({
    id: d.id,
    empresa_id: d.empresa_id,
    tipo_doc: d.nombre,
    renovable: d.renovable,
    es_habilitante: d.es_habilitante,
    activo: d.estado === 'activo'
  }));
}

export function getDocumentoActivoPorTipo(documentos, tipoDoc) {
  if (!documentos) return null;
  const docsTipo = documentos.filter(d => d.tipo_doc === tipoDoc && d.activo === true);
  if (docsTipo.length === 0) return null;
  if (docsTipo.length === 1) return docsTipo[0];

  // Si hay más de uno activo (ej. error/BUG 2) o activos en distintos periodos:
  // Retornar solo el más reciente (mayor fecha_vencimiento o creado_en)
  docsTipo.sort((a, b) => {
    const timeA = a.fecha_vencimiento ? new Date(a.fecha_vencimiento).getTime() : 0;
    const timeB = b.fecha_vencimiento ? new Date(b.fecha_vencimiento).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime();
  });
  
  console.warn(`[Documentos] Múltiples documentos activos encontrados para ${tipoDoc}. Retornando el más reciente.`, docsTipo);
  return docsTipo[0];
}

export async function getHistorialPorGrupo(empresaId, personalId, tipoDoc) {
  if (!empresaId || !personalId || !tipoDoc) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('personal_id', personalId)
    .eq('tipo_doc', tipoDoc)
    .order('fecha_vencimiento', { ascending: false, nullsFirst: false })
    .order('version', { ascending: false });
  
  if (error) { console.error('Error getHistorialPorGrupo:', error); return []; }
  
  const gruposMap = new Map();
  const sinGrupo = [];
  
  (data || []).forEach(doc => {
    const d = normalizar(doc);
    if (!d.periodo_grupo_id) {
      sinGrupo.push(d);
    } else {
      if (!gruposMap.has(d.periodo_grupo_id)) {
        gruposMap.set(d.periodo_grupo_id, {
          periodoGrupoId: d.periodo_grupo_id,
          fechaVencimiento: d.fecha_vencimiento,
          fechaEmision: d.fecha_emision,
          creadoEn: d.creado_en,
          activo: false,
          versiones: []
        });
      }
      const grupo = gruposMap.get(d.periodo_grupo_id);
      grupo.versiones.push(d);
      if (d.activo) grupo.activo = true;
      if (d.activo || (!grupo.activo && grupo.versiones.length === 1)) {
        grupo.fechaVencimiento = d.fecha_vencimiento;
        grupo.fechaEmision = d.fecha_emision;
      }
    }
  });
  
  const grupos = Array.from(gruposMap.values()).sort((a, b) => {
     const dateA = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : 0;
     const dateB = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : 0;
     if (dateA !== dateB) return dateB - dateA;
     return new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime();
  });
  
  const hoyStr = new Date().toISOString().slice(0, 10);
  
  grupos.forEach(g => {
    const tieneActivoAprobado = g.versiones.some(v => v.activo && v.estado_validacion === 'aprobado');
    const fVenc = g.fechaVencimiento ? g.fechaVencimiento.slice(0, 10) : null;
    const fIni = g.fechaEmision ? g.fechaEmision.slice(0, 10) : null;

    if (fIni && fIni > hoyStr) {
      g.estado_periodo = 'futuro';
      g.badge_texto = `Futuro · inicia ${fIni}`;
      g.badge_color = 'badge-cyan';
    } else if (fVenc && fVenc < hoyStr && !g.activo) {
      g.estado_periodo = 'archivado';
      g.badge_texto = 'Archivado';
      g.badge_color = 'badge-gray';
    } else if ((!fVenc || fVenc >= hoyStr) && tieneActivoAprobado) {
      g.estado_periodo = 'activo';
      g.badge_texto = 'Período activo';
      g.badge_color = 'badge-green';
    } else {
      g.estado_periodo = 'pendiente_activacion';
      g.badge_texto = 'Pendiente de activación';
      g.badge_color = 'badge-orange';
    }
  });
  
  if (sinGrupo.length > 0) {
    grupos.push({
      periodoGrupoId: null,
      isLegacy: true,
      titulo: 'Documentos anteriores al sistema',
      versiones: sinGrupo
    });
  }
  
  return grupos;
}

// ── Upload a Storage + registro en tabla ──────────────────────────────────────

export async function subirDocumento({
  empresaId,
  personalId,
  personalTipo,
  tipoDoc,
  tipoDocumentoId,
  file,
  fechaEmision,
  fechaVencimiento,
  notas,
  subidoDesde = 'backoffice',
  condicionesLaborales,
  contratoReferenciaId,
  adendaCambios,
  fechaVigenciaCambio,
  seccionDocumental,
  contratoPeriodoId,
  periodoGrupoId,
  origen = 'backoffice',
  esIndefinido,
  forzarOverride,
  motivoOverride,
}) {
  const supabase = await getSupabaseClient();

  // 1. Subir archivo al bucket
  const ext = file.name.split('.').pop();
  const storagePath = `${empresaId}/personal/${personalTipo}/${personalId}/${tipoDoc}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) throw uploadError;

  // 2. Obtener URL firmada
  const { data: urlData, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  if (urlError) throw urlError;

  // 3. Consultar config
  const configs = await getTiposDocumentoConfig(empresaId);
  const config = configs.find(c => c.tipo_doc === tipoDoc);
  const isRenovable = config ? config.renovable : false;

  let rpcName = 'subir_documento_personal';
  let rpcParams = {
    p_empresa_id:        empresaId,
    p_personal_id:       personalId,
    p_personal_tipo:     personalTipo,
    p_tipo_doc:          tipoDoc,
    p_nombre_archivo:    file.name,
    p_archivo_url:       urlData.signedUrl,
    p_fecha_emision:     fechaEmision || null,
    p_fecha_vencimiento: fechaVencimiento || null,
    p_notas:             notas || null,
    p_subido_desde:      subidoDesde,
    p_tipo_documento_id: tipoDocumentoId || null,
    p_condiciones_laborales: condicionesLaborales || {},
    p_contrato_referencia_id: contratoReferenciaId || null,
    p_adenda_cambios: adendaCambios || {},
    p_fecha_vigencia_cambio: fechaVigenciaCambio || null,
    p_seccion_documental: seccionDocumental || null,
    p_contrato_periodo_id: contratoPeriodoId || null,
    p_origen:            origen,
    p_es_indefinido:     esIndefinido || false,
    p_forzar_override:   forzarOverride || false,
    p_motivo_override:   motivoOverride || null,
  };

  if (isRenovable) {
    rpcName = 'subir_version_documento';
    rpcParams.p_periodo_grupo_id = periodoGrupoId || null;
  }

  // 4. Registrar en tabla via RPC
  const { data, error: rpcError } = await supabase.rpc(rpcName, rpcParams);

  if (rpcError) throw rpcError;
  // subir_version_documento retorna un UUID; subir_documento_personal retorna la fila completa.
  return normalizar(isRenovable ? { id: data } : data);
}

export async function renovarDocumento({
  empresaId,
  personalId,
  personalTipo,
  tipoDoc,
  tipoDocumentoId,
  file,
  fechaEmision,
  fechaVencimiento,
  notas,
  subidoDesde = 'backoffice',
  condicionesLaborales,
  contratoReferenciaId,
  adendaCambios,
  fechaVigenciaCambio,
  seccionDocumental,
  contratoPeriodoId,
}) {
  const supabase = await getSupabaseClient();

  const ext = file.name.split('.').pop();
  const storagePath = `${empresaId}/personal/${personalTipo}/${personalId}/${tipoDoc}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) throw uploadError;

  const { data: urlData, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  if (urlError) throw urlError;

  const { data, error: rpcError } = await supabase.rpc('renovar_documento', {
    p_empresa_id:        empresaId,
    p_personal_id:       personalId,
    p_personal_tipo:     personalTipo,
    p_tipo_doc:          tipoDoc,
    p_nombre_archivo:    file.name,
    p_archivo_url:       urlData.signedUrl,
    p_fecha_emision:     fechaEmision || null,
    p_fecha_vencimiento: fechaVencimiento || null,
    p_notas:             notas || null,
    p_subido_desde:      subidoDesde,
    p_tipo_documento_id: tipoDocumentoId || null,
    p_condiciones_laborales: condicionesLaborales || {},
    p_contrato_referencia_id: contratoReferenciaId || null,
    p_adenda_cambios: adendaCambios || {},
    p_fecha_vigencia_cambio: fechaVigenciaCambio || null,
    p_seccion_documental: seccionDocumental || null,
    p_contrato_periodo_id: contratoPeriodoId || null,
  });

  if (rpcError) throw rpcError;
  return normalizar({ id: data });
}

// ── Validación por RRHH ───────────────────────────────────────────────────────

export async function validarDocumento(documentoId, decision, motivoRechazo = null) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('validar_documento_personal', {
    p_documento_id:   documentoId,
    p_decision:       decision,
    p_motivo_rechazo: motivoRechazo,
  });
  if (error) throw error;
  return normalizar(data);
}

// ── Corrección de metadatos sin nueva versión ─────────────────────────────────

export async function corregirDocumento({
  documentoId,
  file,
  fechaEmision,
  fechaVencimiento,
  condicionesLaborales,
  notas,
  empresaId,
  personalId,
  personalTipo,
  tipoDoc,
  forzarOverride,
  motivoOverride,
}) {
  const supabase = await getSupabaseClient();

  let archivoUrl = null;
  let nombreArchivo = null;

  if (file) {
    const ext = file.name.split('.').pop();
    const storagePath = `${empresaId}/personal/${personalTipo}/${personalId}/${tipoDoc}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (urlError) throw urlError;
    archivoUrl = urlData.signedUrl;
    nombreArchivo = file.name;
  }

  const { data, error } = await supabase.rpc('corregir_documento_personal', {
    p_documento_id:          documentoId,
    p_fecha_emision:         fechaEmision || null,
    p_fecha_vencimiento:     fechaVencimiento || null,
    p_condiciones_laborales: condicionesLaborales || null,
    p_notas:                 notas || null,
    p_archivo_url:           archivoUrl,
    p_nombre_archivo:        nombreArchivo,
    p_forzar_override:       forzarOverride || false,
    p_motivo_override:       motivoOverride || null,
  });
  if (error) throw error;
  return normalizar(data);
}

// ── Nuevo período contractual ─────────────────────────────────────────────────

export async function nuevoContrato({
  empresaId, personalId, personalTipo, tipoDoc, tipoDocumentoId,
  file, fechaEmision, fechaVencimiento, notas, condicionesLaborales,
  periodoIdAnterior,
  esIndefinido,
  forzarOverride,
  motivoOverride,
}) {
  const supabase = await getSupabaseClient();

  let archivoUrl = null;
  let nombreArchivo = null;

  if (file) {
    const ext = file.name.split('.').pop();
    const storagePath = `${empresaId}/personal/${personalTipo}/${personalId}/${tipoDocumentoId || tipoDoc}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (urlError) throw urlError;
    archivoUrl = urlData.signedUrl;
    nombreArchivo = file.name;
  }

  const { data, error } = await supabase.rpc('nuevo_contrato_periodo', {
    p_empresa_id:            empresaId,
    p_personal_id:           personalId,
    p_personal_tipo:         personalTipo,
    p_tipo_doc:              tipoDoc,
    p_nombre_archivo:        nombreArchivo,
    p_archivo_url:           archivoUrl,
    p_fecha_emision:         fechaEmision || null,
    p_fecha_vencimiento:     fechaVencimiento || null,
    p_notas:                 notas || null,
    p_condiciones_laborales: condicionesLaborales || null,
    p_tipo_documento_id:     tipoDocumentoId || null,
    p_periodo_id_anterior:   periodoIdAnterior || null,
    p_es_indefinido:         esIndefinido || false,
    p_forzar_override:       forzarOverride || false,
    p_motivo_override:       motivoOverride || null,
  });
  if (error) throw error;
  return normalizar(data);
}

// ── URL firmada renovada ──────────────────────────────────────────────────────

// Extrae el storage path desde una URL firmada de Supabase.
// Formato: .../storage/v1/object/sign/<bucket>/<path>?token=...
function pathFromSignedUrl(url) {
  if (!url) return null;
  try {
    const { pathname } = new URL(url);
    const prefix = `/storage/v1/object/sign/${BUCKET}/`;
    if (pathname.startsWith(prefix)) return decodeURIComponent(pathname.slice(prefix.length));
  } catch {}
  return null;
}

// Acepta un storage path directo o una URL firmada expirada.
export async function renovarUrlDocumento(storagePathOrUrl) {
  const path = (storagePathOrUrl && storagePathOrUrl.startsWith('http'))
    ? pathFromSignedUrl(storagePathOrUrl)
    : storagePathOrUrl;
  if (!path) throw new Error('No se pudo determinar el path del documento');
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

// ── Tipos de documento por perfil ─────────────────────────────────────────────

export const TIPOS_DOC_OPERATIVO = [
  { key: 'sctr',              label: 'SCTR',                   requiereVencimiento: true  },
  { key: 'medico',            label: 'Examen Médico',          requiereVencimiento: true  },
  { key: 'epp',               label: 'Entrega de EPP',         requiereVencimiento: false },
  { key: 'licencia_conducir', label: 'Licencia de Conducir',   requiereVencimiento: true  },
  { key: 'carnet_minero',     label: 'Carnet Minero',          requiereVencimiento: true  },
  { key: 'cert_altura',       label: 'Cert. Trabajo en Altura',requiereVencimiento: true  },
  { key: 'dni',               label: 'DNI',                    requiereVencimiento: false },
  { key: 'contrato',          label: 'Contrato',               requiereVencimiento: true  },
  { key: 'adenda',            label: 'Adenda',                 requiereVencimiento: false },
  { key: 'otro',              label: 'Otro',                   requiereVencimiento: false },
];

export const TIPOS_DOC_ADMIN = [
  { key: 'dni',      label: 'DNI',        requiereVencimiento: false },
  { key: 'contrato', label: 'Contrato',   requiereVencimiento: true  },
  { key: 'adenda',   label: 'Adenda',     requiereVencimiento: false },
  { key: 'sctr',     label: 'SCTR',       requiereVencimiento: true  },
  { key: 'medico',   label: 'Examen Médico', requiereVencimiento: true },
  { key: 'otro',     label: 'Otro',       requiereVencimiento: false },
];

export const BADGE_VENCIMIENTO = {
  vigente:         'badge-green',
  por_vencer:      'badge-orange',
  vencido:         'badge-red',
  sin_vencimiento: 'badge-gray',
  historico:       'badge-gray',
};

export const LABEL_VENCIMIENTO = {
  vigente:         'Vigente',
  por_vencer:      'Por vencer',
  vencido:         'Vencido',
  sin_vencimiento: 'Sin vencimiento',
  historico:       'Histórico',
};

export const BADGE_VALIDACION = {
  pendiente: 'badge-orange',
  aprobado:  'badge-green',
  rechazado: 'badge-red',
};

// ── Firma del trabajador ──────────────────────────────────────────────────────

export const BADGE_FIRMA = {
  no_requiere:          '',
  pendiente_trabajador: 'badge-orange',
  firmado_trabajador:   'badge-cyan',
  no_aplica:            'badge-gray',
};

export const LABEL_FIRMA = {
  no_requiere:          '',
  pendiente_trabajador: 'Esperando firma del trabajador',
  firmado_trabajador:   'Firmado por trabajador',
  no_aplica:            '',
};

export async function enviarDocumentoAFirma({ documentoId, empresaId, workerAuthUserId, mensaje }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .update({
      estado_firma: 'pendiente_trabajador',
      enviado_a_firma_en: new Date().toISOString(),
      enviado_a_firma_mensaje: mensaje || null,
    })
    .eq('id', documentoId)
    .select()
    .single();
  if (error) throw error;
  if (workerAuthUserId) {
    await supabase.from('notificaciones_sistema').insert({
      empresa_id: empresaId,
      user_id: workerAuthUserId,
      tipo: 'documento_pendiente_firma',
      title: 'Documento pendiente de firma',
      texto: mensaje || 'RRHH ha enviado un documento para tu firma. Revisa el tab "Firma y consentimiento" en Mi portal.',
      prioridad: 'alta',
      leida: false,
    });
  }
  return normalizar(data);
}

export async function cancelarEnvioFirma({ documentoId }) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_documentos')
    .update({ estado_firma: 'no_requiere', enviado_a_firma_en: null, enviado_a_firma_mensaje: null })
    .eq('id', documentoId)
    .select()
    .single();
  if (error) throw error;
  return normalizar(data);
}

export async function reenviarNotificacionFirma({ documentoId, empresaId, workerAuthUserId }) {
  const supabase = await getSupabaseClient();
  if (workerAuthUserId) {
    await supabase.from('notificaciones_sistema').insert({
      empresa_id: empresaId,
      user_id: workerAuthUserId,
      tipo: 'documento_pendiente_firma',
      title: 'Recordatorio: Documento pendiente de firma',
      texto: 'Tienes un documento pendiente de firma en Mi portal, tab "Firma y consentimiento".',
      prioridad: 'alta',
      leida: false,
    });
  }
}

export async function vincularDocumentoFirmado({ nuevoDocId, documentoEnviadoAFirmaId, empresaId, nombreColaborador }) {
  const supabase = await getSupabaseClient();
  if (nuevoDocId) {
    await supabase.from('personal_documentos')
      .update({ estado_firma: 'firmado_trabajador', documento_enviado_a_firma_id: documentoEnviadoAFirmaId || null })
      .eq('id', nuevoDocId);
  }
  if (documentoEnviadoAFirmaId) {
    await supabase.from('personal_documentos')
      .update({ estado_firma: 'firmado_trabajador' })
      .eq('id', documentoEnviadoAFirmaId);
  }
  await supabase.from('notificaciones_sistema').insert({
    empresa_id: empresaId,
    tipo: 'documento_firmado_trabajador',
    title: 'Documento firmado cargado',
    texto: `${nombreColaborador || 'El colaborador'} ha cargado su documento firmado. Pendiente de validacion RRHH.`,
    prioridad: 'media',
    leida: false,
  });
}

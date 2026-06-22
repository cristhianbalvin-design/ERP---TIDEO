import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { rrhhService } from './rrhhService.js';
import { computarSaldoVacaciones } from './solicitudesRrhhService.js';

const norm = value => String(value || '').trim().toLowerCase();
const monthRange = (periodo = new Date().toISOString().slice(0, 7)) => {
  const [year, month] = String(periodo).split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    desde: start.toISOString().slice(0, 10),
    hasta: end.toISOString().slice(0, 10),
  };
};

export function resolverFichaEmpleadoLocal({ authUser, usuarios = [], personalAdmin = [], personalOperativo = [] }) {
  const uid = authUser?.id || authUser?.user_id || null;
  const email = norm(authUser?.email);
  const usuario = (usuarios || []).find(u => String(u.id) === String(uid) || (email && norm(u.email) === email));
  const emailRef = email || norm(usuario?.email);
  const listas = [
    ...(personalOperativo || []).map(p => ({ ...p, personal_tipo: 'operativo' })),
    ...(personalAdmin || []).map(p => ({ ...p, personal_tipo: 'administrativo' })),
  ];
  return listas.find(p =>
    String(p.auth_user_id || p.user_id || '') === String(uid) ||
    String(p.id || '') === String(uid) ||
    (emailRef && norm(p.email) === emailRef)
  ) || null;
}

const contratoEstado = (ficha = {}, docs = []) => {
  const contratos = docs
    .slice()
    .sort((a, b) => String(b.fecha_vencimiento || '').localeCompare(String(a.fecha_vencimiento || '')));
  const vigente = contratos.find(d => d.activo !== false) || contratos[0] || null;
  const fechaFin = vigente?.fecha_vencimiento || null;
  if (!vigente) return { estado: 'sin_contrato', dias: null, contrato: null };
  if (!fechaFin) return { estado: 'vigente', dias: null, contrato: vigente };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fin = new Date(`${fechaFin}T00:00:00`);
  const dias = Math.ceil((fin.getTime() - today.getTime()) / 86400000);
  return {
    estado: dias < 0 ? 'vencido' : dias <= 30 ? 'por_vencer' : 'vigente',
    dias,
    contrato: vigente,
  };
};

function calcSaldoVacaciones(ficha, solicitudesDelPersonal, configAusencias) {
  const diasAnio = configAusencias?.dias_vacaciones_anio ?? ficha.dias_vacaciones_total ?? 30;
  return computarSaldoVacaciones(ficha.fecha_ingreso || null, diasAnio, solicitudesDelPersonal).saldo;
}

export function construirAutoservicioLocal({
  authUser,
  usuarios = [],
  personalAdmin = [],
  personalOperativo = [],
  personalDocumentos = [],
  solicitudesRRHH = [],
  registrosAsistencia = [],
  periodosNomina = [],
  trabajadoresDatosNomina = {},
  prestamos = [],
  amonestaciones = [],
  horasExtraCompensacion = [],
  notificaciones = [],
  evaluacionPlantillas = [],
  evaluacionEvaluaciones = [],
  portalDatosSolicitudes = [],
  portalConstanciasTrabajo = [],
  portalBoletaAcuses = [],
  portalBoletaVisualizaciones = [],
  portalFirmaRegistros = [],
  periodo = new Date().toISOString().slice(0, 7),
  configAusencias = {},
  tiposDocumentoContratoIds = [],
}) {
  const ficha = resolverFichaEmpleadoLocal({ authUser, usuarios, personalAdmin, personalOperativo });
  if (!ficha) {
    return { ficha: null, resumen: null, boletas: [], contratos: [], documentos: [], solicitudes: [], asistencia: [], prestamos: [], amonestaciones: [], notificaciones: [], evaluacionesPendientes: [], evaluacionesCerradas: [], datosSolicitudes: [], constancias: [], boletaAcuses: [], boletaVisualizaciones: [], firmaRegistros: [] };
  }
  const personalTipo = ficha.personal_tipo;
  const personalId = ficha.id;
  const docs = (personalDocumentos || []).filter(d => d.personal_id === personalId && (!d.personal_tipo || d.personal_tipo === personalTipo) && (d.activo !== false || d.estado_validacion === 'pendiente'));
  const esContratoDoc = d => {
    if (!tiposDocumentoContratoIds || tiposDocumentoContratoIds.length === 0) {
      console.warn('autoservicioEmpleadoService: tiposDocumentoContratoIds no disponible. Fallback por texto desactivado.');
      return false;
    }
    return tiposDocumentoContratoIds.includes(d.tipo_doc) || tiposDocumentoContratoIds.includes(d.tipo_documento_id);
  };
  const contratos = docs.filter(esContratoDoc);
  const documentos = docs.filter(d => !esContratoDoc(d));
  const { desde, hasta } = monthRange(periodo);
  const asistencia = (registrosAsistencia || []).filter(r =>
    String(r.trabajador_id || r.personal_id) === String(personalId) &&
    (!r.fecha || (r.fecha >= desde && r.fecha <= hasta))
  );
  const solicitudes = (solicitudesRRHH || []).filter(s => String(s.personal_id) === String(personalId));
  const prestamosPropios = (prestamos || []).filter(p => String(p.trabajador_id || p.personal_id) === String(personalId));
  const amonestacionesPropias = (amonestaciones || []).filter(a => String(a.personal_id) === String(personalId) && a.estado !== 'anulada');
  const hePendienteMin = (horasExtraCompensacion || []).filter(h => String(h.personal_id) === String(personalId) && h.estado === 'pendiente').reduce((sum, h) => sum + Number(h.minutos || 0), 0);
  const acusesPropios = (portalBoletaAcuses || []).filter(a => String(a.personal_id) === String(personalId));
  const visualizacionesPropias = (portalBoletaVisualizaciones || []).filter(v => String(v.personal_id) === String(personalId));
  const boletas = (periodosNomina || [])
    .filter(p => p.estado === 'cerrado')
    .map(p => {
      const detalle = trabajadoresDatosNomina?.[p.id]?.[personalId] || trabajadoresDatosNomina?.[personalId] || null;
      const acuse = acusesPropios.find(a => String(a.periodo_id) === String(p.id));
      const vistas = visualizacionesPropias.filter(v => String(v.periodo_id) === String(p.id));
      return { id: `bol_${p.id}_${personalId}`, periodo_id: p.id, periodo: p.periodo || p.nombre || p.fecha_inicio?.slice(0, 7), estado: acuse ? 'acusada' : 'disponible', detalle, archivo_url: detalle?.boleta_url || null, acuse, visualizaciones: vistas };
    });
  const cEstado = contratoEstado(ficha, contratos);
  const notificacionesPropias = (notificaciones || []).filter(n => !n.user_id || String(n.user_id) === String(authUser?.id || ''));
  const plantillaPorId = new Map((evaluacionPlantillas || []).map(p => [p.id, p]));
  const evaluacionesPropias = (evaluacionEvaluaciones || []).filter(e => String(e.evaluado_id || e.personal_id) === String(personalId));
  const evaluacionesPendientes = evaluacionesPropias
    .filter(e => e.estado === 'pendiente' && plantillaPorId.get(e.plantilla_id)?.estado !== 'cerrada')
    .map(e => ({ ...e, plantilla: plantillaPorId.get(e.plantilla_id) || null }));
  const evaluacionesCerradas = evaluacionesPropias
    .filter(e => e.estado === 'completada' && plantillaPorId.get(e.plantilla_id)?.estado === 'cerrada')
    .map(e => ({ ...e, plantilla: plantillaPorId.get(e.plantilla_id) || null }));
  const datosSolicitudes = (portalDatosSolicitudes || []).filter(s => String(s.personal_id) === String(personalId));
  const constancias = (portalConstanciasTrabajo || []).filter(c => String(c.personal_id) === String(personalId));
  const firmaRegistros = (portalFirmaRegistros || []).filter(f => String(f.personal_id) === String(personalId));
  return {
    ficha,
    resumen: {
      contrato: cEstado,
      ultima_boleta: boletas[0] || null,
      vacaciones: calcSaldoVacaciones(ficha, solicitudes, configAusencias),
      he_pendiente_minutos: hePendienteMin,
      ciclo_minero: ficha.regimen_jornada === 'ciclo_acumulativo' ? {
        dia: ficha.dia_ciclo_actual || null,
        proxima_bajada: ficha.proxima_bajada || null,
        regimen: `${ficha.dias_ciclo_trabajo || 14}x${ficha.dias_ciclo_descanso || 7}`,
      } : null,
    },
    boletas,
    contratos,
    documentos,
    solicitudes,
    asistencia,
    prestamos: prestamosPropios,
    amonestaciones: amonestacionesPropias,
    notificaciones: notificacionesPropias,
    evaluacionesPendientes,
    evaluacionesCerradas,
    datosSolicitudes,
    constancias,
    boletaAcuses: acusesPropios,
    boletaVisualizaciones: visualizacionesPropias,
    firmaRegistros,
    misDatos: {
      documento: ficha.documento || ficha.dni || '',
      email: ficha.email || '',
      telefono: ficha.telefono || '',
      telefono_personal: ficha.telefono_personal || ficha.telefono || '',
      email_personal: ficha.email_personal || ficha.email || '',
      celular_personal: ficha.celular_personal || ficha.telefono_personal || ficha.telefono || '',
      direccion: ficha.direccion || '',
      contacto_emergencia: ficha.contacto_emergencia || '',
      relacion_emergencia: ficha.relacion_emergencia || '',
      datos_bancarios: ficha.datos_bancarios || '',
      consentimiento_entrega_electronica: Boolean(ficha.consentimiento_entrega_electronica),
      firma_onboarding_completo: Boolean(ficha.firma_onboarding_completo),
    },
  };
}

export const autoservicioEmpleadoService = {
  async resolverMiFicha() {
    if (!isSupabaseConfigured()) return null;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('resolver_mi_personal_rrhh');
    if (error) throw error;
    return Array.isArray(data) ? data[0] || null : data;
  },

  async obtenerMiEspacio({ periodo = new Date().toISOString().slice(0, 7) } = {}) {
    if (!isSupabaseConfigured()) return null;
    const supabase = await getSupabaseClient();
    const ficha = await this.resolverMiFicha();
    if (!ficha?.personal_id) return { ficha: null };
    const { desde, hasta } = monthRange(periodo);
    const [docsRes, solRes, asisRes, periodosRes, prestamosRes, amonRes, notRes, heRes, configAusRes, tiposContratoRes] = await Promise.all([
      supabase.from('personal_documentos').select('*').eq('personal_id', ficha.personal_id).eq('empresa_id', ficha.empresa_id).order('created_at', { ascending: false }),
      supabase.from('solicitudes_rrhh').select('*').eq('personal_id', ficha.personal_id).eq('empresa_id', ficha.empresa_id).order('created_at', { ascending: false }),
      supabase.from('registros_asistencia').select('*').eq('trabajador_id', ficha.personal_id).eq('empresa_id', ficha.empresa_id).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
      supabase.from('periodos_nomina').select('*').eq('empresa_id', ficha.empresa_id).eq('estado', 'cerrado').order('fecha_inicio', { ascending: false }),
      supabase.from('prestamos_personal').select('*').eq('empresa_id', ficha.empresa_id).eq('trabajador_id', ficha.personal_id).order('created_at', { ascending: false }),
      supabase.from('amonestaciones_personal').select('*').eq('empresa_id', ficha.empresa_id).eq('personal_id', ficha.personal_id).order('fecha', { ascending: false }),
      supabase.from('notificaciones_sistema').select('*').eq('empresa_id', ficha.empresa_id).order('created_at', { ascending: false }).limit(30),
      supabase.from('horas_extra_compensacion').select('*').eq('empresa_id', ficha.empresa_id).eq('personal_id', ficha.personal_id),
      supabase.from('rrhh_config_ausencias').select('dias_vacaciones_anio').eq('empresa_id', ficha.empresa_id).maybeSingle(),
      supabase.from('tipos_documento_empresa').select('id').eq('empresa_id', ficha.empresa_id).eq('captura_snapshot_laboral', true),
    ]);
    const auth = await supabase.auth.getUser();
    return construirAutoservicioLocal({
      authUser: auth?.data?.user,
      personalAdmin: ficha.personal_tipo === 'administrativo' ? [{ ...ficha, id: ficha.personal_id, personal_tipo: ficha.personal_tipo }] : [],
      personalOperativo: ficha.personal_tipo === 'operativo' ? [{ ...ficha, id: ficha.personal_id, personal_tipo: ficha.personal_tipo }] : [],
      personalDocumentos: docsRes.data || [],
      solicitudesRRHH: solRes.data || [],
      registrosAsistencia: asisRes.data || [],
      periodosNomina: periodosRes.data || [],
      prestamos: prestamosRes.data || [],
      amonestaciones: amonRes.data || [],
      horasExtraCompensacion: heRes.data || [],
      notificaciones: notRes.data || [],
      periodo,
      configAusencias: configAusRes.data || {},
      tiposDocumentoContratoIds: (tiposContratoRes.data || []).map(t => t.id),
    });
  },

  async obtenerSaldoHePendiente(empresaId, personalId) {
    return rrhhService.obtenerSaldoHePendiente(empresaId, personalId);
  },

  async acusarAmonestacion(id) {
    const supabase = await getSupabaseClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('amonestaciones_personal')
      .update({ acusado_en: new Date().toISOString(), acusado_por_user_id: auth?.user?.id || null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async marcarAsistenciaMobile(empresaId, ficha, registro) {
    // GAP-15: captura puntual de ubicacion. La PWA adjunta fix/precision/timestamps;
    // la validacion definitiva de geofence corre en Supabase. No hay rastreo continuo.
    return rrhhService.registrarAsistencia(empresaId, {
      ...registro,
      trabajador_id: ficha.id,
      trabajador_tipo: ficha.personal_tipo || ficha.trabajador_tipo,
      origen_registro: 'mobile_pwa',
    });
  },
};

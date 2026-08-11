import React, { useState, useEffect, useRef, useMemo } from 'react';
import BarcodeScanner from './components/BarcodeScanner.jsx';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { rrhhService } from './services/rrhhService.js';
import * as solicitudesRrhhService from './services/solicitudesRrhhService.js';
import * as personalDocumentosService from './services/personalDocumentosService.js';
import * as tareosAdminService from './services/tareosAdminService.js';
import { resolverFiltroSociedadesVista } from './services/sociedadesService.js';
import { PHONE_PATTERN, isValidPhone, isValidRuc, sanitizePhone, sanitizeRuc } from './lib/formValidators.js';
import { getSupabaseClient } from './lib/supabaseClient.js';
import { porcentajeBaseComision, resolverVendedorComision } from './lib/comisiones.js';
import { construirAutoservicioLocal } from './services/autoservicioEmpleadoService.js';
import { GEO_CONFIG_DEFAULT, GEO_CONSENT_VERSION, enqueueGeoMark, evaluarGeofenceLocal, getGeoQueue, setGeoQueue, syncGeoQueue } from './services/geofencingService.js';

// Mobile field views - all field profiles

function MobileFieldView({ onExit, profile, setProfile, dark, setDark }) {
  const { authUser, usuarios, personalAdmin, personalOperativo, role } = useApp();
  const [screen, setScreen] = useState('home');
  const fichaColaborador = getFichaColaboradorMovil({ authUser, usuarios, personalAdmin, personalOperativo });
  const trabajadorAsistencia = fichaColaborador?.turno_id ? fichaColaborador : null;
  // Usar role.permisos.campo_modulos (de membresiaActiva, disponible desde el login)
  // en lugar de buscar en usuarios[] que puede estar vacío por RLS para roles no-admin.
  const modulosAsignados = (role?.permisos?.campo_modulos?.length ? role.permisos.campo_modulos : null)
    ?? getUsuarioCampoModulos(authUser, usuarios);
  const esSupervisionSinFicha = !fichaColaborador && esAdminODireccionMovil(authUser, role);
  const modulosSinFichaPermitidos = modulosAsignados.filter(m => m === 'vendedor');
  const requiereConfiguracion = !fichaColaborador && !esSupervisionSinFicha && !modulosSinFichaPermitidos.length;
  const modulosUsuario = esSupervisionSinFicha
    ? modulosAsignados.filter(m => ['supervisor', 'gerencia'].includes(m))
    : fichaColaborador
      ? modulosAsignados
      : modulosSinFichaPermitidos;
  const modulosUsuarioKey = modulosUsuario.join('|');
  const puedeVerAsistencia = Boolean(trabajadorAsistencia);

  const profiles = useMemo(() => [
    { k: 'tecnico', l: 'Técnico', icon: I.wrench },
    { k: 'logistica', l: 'Logística', icon: I.truck },
    { k: 'vendedor', l: 'Vendedor', icon: I.target },
    { k: 'compras', l: 'Compras', icon: I.camera },
    { k: 'supervisor', l: 'Supervisor', icon: I.shield },
    { k: 'gerencia', l: 'Gerencia', icon: I.trend },
    { k: 'asistencia', l: 'Asistencia', icon: I.clock, requiereAsistencia: true },
    { k: 'mi_espacio', l: 'Mi portal', icon: I.userCheck },
    { k: 'administrativo', l: 'Tareo', icon: I.users },
  ].filter(p => modulosUsuario.includes(p.k) && (!p.requiereAsistencia || puedeVerAsistencia)), [modulosUsuarioKey, puedeVerAsistencia]);

  useEffect(() => {
    if (!profiles.length) return;
    if (profile === 'asistencia' && !puedeVerAsistencia) {
      setProfile(profiles[0].k);
      setScreen('home');
      return;
    }
    // null (inicial) o perfil no permitido → asignar el primero disponible
    if (!profile || !profiles.some(p => p.k === profile)) {
      setProfile(profiles[0].k);
      setScreen('home');
    }
  }, [profile, puedeVerAsistencia, setProfile, profiles]);

  return (
    <div className="mobile-field-shell" style={{background:dark?'#0D1B2E':'#EEF2F6'}}>
      <div className="mobile-field-toolbar">
        <div className="mobile-field-brand">
          <div style={{width:32,height:32,background:dark?'#162038':'#fff',borderRadius:6,padding:4,display:'flex',alignItems:'center',justifyContent:'center'}}><img src="assets/tideo-isotipo.svg" alt="" style={{width:'100%'}}/></div>
          <div>
            <div className="font-display" style={{fontWeight:700,fontSize:16,color:dark?'#fff':'var(--navy)'}}>Modo Campo</div>
            <div style={{fontSize:11,color:'var(--fg-muted)'}}>TIDEO ERP · Mobile PWA</div>
          </div>
        </div>
        <div className="header-spacer"/>
        <div className="mobile-field-profiles">
          {profiles.map(p => (
            <button key={p.k} onClick={()=>{setProfile(p.k); setScreen('home');}} className={'btn btn-sm '+(profile===p.k?'btn-navy':'btn-secondary')}>
              <span style={{width:14,height:14}}>{p.icon}</span>{p.l}
            </button>
          ))}
        </div>
        <button className="icon-btn mobile-field-theme" onClick={()=>setDark(!dark)}>{dark?I.sun:I.moon}</button>
        <button className="btn btn-secondary mobile-field-exit" onClick={onExit}>{I.x} Salir modo campo</button>
      </div>

      <div className="mobile-field-stage">
        <div className={dark?'dark':''} style={{display:'contents'}}>
          <div className="mobile-frame">
            <div className="mobile-notch"/>
            <div className="mobile-screen">
              {requiereConfiguracion ? (
                <MobileAccessMessage text="Tu acceso de campo requiere configuracion adicional. Contacta al administrador." />
              ) : profiles.length === 0 ? (
                <MobileAccessMessage text={esSupervisionSinFicha ? 'No tienes modulos de supervision habilitados para esta empresa.' : 'No tienes modulos moviles habilitados.'} />
              ) : (
                <>
                  {profile === 'tecnico' && <TecnicoView screen={screen} setScreen={setScreen}/>}
                  {profile === 'logistica' && <LogisticaView screen={screen} setScreen={setScreen}/>}
                  {profile === 'vendedor' && <VendedorView screen={screen} setScreen={setScreen} dark={dark} setDark={setDark} onExit={onExit} profile={profile} setProfile={setProfile}/>}
                  {profile === 'compras' && <ComprasView screen={screen} setScreen={setScreen}/>}
                  {profile === 'supervisor' && <SupervisorView screen={screen} setScreen={setScreen}/>}
                  {profile === 'gerencia' && <GerenciaView screen={screen} setScreen={setScreen}/>}
                  {profile === 'asistencia' && <AsistenciaMobileView screen={screen} setScreen={setScreen}/>}
                  {profile === 'mi_espacio' && <MiEspacioMobileView setScreen={setScreen}/>}
                  {profile === 'administrativo' && <AdministrativoView screen={screen} setScreen={setScreen}/>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileAccessMessage({ text }) {
  return (
    <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center'}}>
      <div>
        <div style={{width:44, height:44, margin:'0 auto 14px', color:'var(--orange)'}}>{I.alert}</div>
        <div style={{fontWeight:700, color:'var(--navy)', lineHeight:1.35}}>{text}</div>
      </div>
    </div>
  );
}

function normalizarTexto(valor) {
  return String(valor || '').trim().toLowerCase();
}

function currencySymbol(moneda = 'PEN') {
  return moneda === 'USD' ? 'US$' : moneda === 'EUR' ? '€' : 'S/';
}

function moneyCurrency(value, moneda = 'PEN') {
  return money(value, currencySymbol(moneda));
}

function slugPersona(valor) {
  return normalizarTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function inicialesDe(nombre, fallback = 'U') {
  const partes = String(nombre || fallback).trim().split(/\s+/).filter(Boolean);
  return (partes.length ? partes : [fallback])
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getUsuarioMovil(authUser, usuarios = []) {
  const email = normalizarTexto(authUser?.email);
  const usuario = usuarios.find(u =>
    u.id === authUser?.id ||
    (email && normalizarTexto(u.email) === email)
  );
  const nombre =
    usuario?.nombre ||
    authUser?.user_metadata?.nombre ||
    authUser?.user_metadata?.full_name ||
    authUser?.email?.split('@')[0] ||
    'Usuario';

  return {
    id: usuario?.id || authUser?.id || null,
    nombre,
    email: usuario?.email || authUser?.email || null,
    iniciales: inicialesDe(nombre),
  };
}

function getTrabajadorAsistenciaMovil({ authUser, usuarios = [], personalAdmin = [], personalOperativo = [] }) {
  return getFichaColaboradorMovil({ authUser, usuarios, personalAdmin, personalOperativo });
}

function getFichaColaboradorMovil({ authUser, usuarios = [], personalAdmin = [], personalOperativo = [] }) {
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const emailAuth = normalizarTexto(authUser?.email || usuarioMovil.email);
  const usuarioSlug = slugPersona(usuarioMovil.nombre || emailAuth.split('@')[0]);
  const trabajadores = [
    ...(personalOperativo || [])
      .map(p => ({ ...p, trabajador_tipo: 'operativo' })),
    ...(personalAdmin || [])
      .map(p => ({ ...p, trabajador_tipo: 'administrativo' })),
  ];

  return trabajadores.find(p => {
    const email = normalizarTexto(p.email);
    const nombreSlug = slugPersona(p.nombre);
    // p.auth_user_id es nullable (empleados sin cuenta vinculada): nunca comparar
    // contra un id de sesion vacio, o cualquier ficha sin vincular calzaria por error
    // con una sesion aun no resuelta (authUser/usuarioMovil.id en null).
    return (authUser?.id && p.auth_user_id === authUser.id) ||
      (usuarioMovil.id && p.auth_user_id === usuarioMovil.id) ||
      p.id === authUser?.id ||
      p.id === usuarioMovil.id ||
      (emailAuth && email === emailAuth) ||
      (usuarioSlug && nombreSlug === usuarioSlug);
  }) || null;
}

function esAdminODireccionMovil(authUser, role) {
  const nivel = normalizarTexto(authUser?.nivel_jerarquico);
  return Boolean(
    authUser?.es_admin_empresa ||
    authUser?.es_superadmin ||
    role?.permisos?.tenant_admin ||
    role?.permisos?.todo ||
    ['direccion', 'jefatura'].includes(nivel)
  );
}

function getUsuarioCampoModulos(authUser, usuarios = []) {
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const emailAuth = normalizarTexto(authUser?.email || usuarioMovil.email);
  const usuario = usuarios.find(u =>
    u.id === authUser?.id ||
    u.id === usuarioMovil.id ||
    (emailAuth && normalizarTexto(u.email) === emailAuth)
  );
  if (!usuario?.campo) return [];
  if (Array.isArray(usuario.campoModulos) && usuario.campoModulos.length) return usuario.campoModulos;
  if (Array.isArray(usuario.campo_modulos) && usuario.campo_modulos.length) return usuario.campo_modulos;
  const perfil = String(usuario.campoPerfil || usuario.campo_perfil || '').toLowerCase();
  if (perfil.includes('vendedor')) return ['vendedor'];
  if (perfil.includes('compra')) return ['compras'];
  if (perfil.includes('supervisor')) return ['supervisor'];
  if (perfil.includes('gerencia')) return ['gerencia'];
  if (perfil.includes('admin')) return ['administrativo', 'solicitudes'];
  return ['tecnico'];
}

function telefonoParaLlamar(valor) {
  const limpio = String(valor || '').trim();
  if (!limpio) return '';
  const prefijo = limpio.startsWith('+') ? '+' : '';
  const digitos = limpio.replace(/[^\d]/g, '');
  return digitos ? `${prefijo}${digitos}` : '';
}

function extraerDatosTarjeta(texto = '') {
  const limpio = String(texto || '').replace(/\r/g, '\n');
  const lineas = limpio
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const email = limpio.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const telefono = limpio.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s{2,}/g, ' ').trim() || '';
  const empresa = lineas.find(l => /\b(SAC|S\.A\.C\.|SA|S\.A\.|SRL|S\.R\.L\.|EIRL|E\.I\.R\.L\.|CORP|GROUP|GRUPO|INDUSTRIAL|MINERA|SERVICIOS)\b/i.test(l)) || '';
  const web = lineas.find(l => /\b(www\.|\.com|\.pe|\.net)\b/i.test(l) && !l.includes('@')) || '';
  const cargo = lineas.find(l => /\b(gerente|jefe|director|coordinador|supervisor|comercial|ventas|compras|operaciones|administrador|analista|ejecutivo)\b/i.test(l)) || '';
  const nombre = lineas.find(l => {
    if ([email, telefono, empresa, web, cargo].some(v => v && normalizarTexto(v) === normalizarTexto(l))) return false;
    if (/@|www\.|\.com|\.pe|\d/.test(l)) return false;
    return l.split(/\s+/).length >= 2 && l.length <= 45;
  }) || '';

  return {
    nombre_contacto: nombre,
    empresa_nombre: empresa,
    cargo,
    telefono,
    email,
    necesidad: limpio ? `Lead capturado desde tarjeta de presentacion.\n\nTexto detectado:\n${limpio}` : 'Lead capturado desde foto de tarjeta.',
  };
}

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function AsistenciaMobileView({ screen, setScreen }) {
  const {
    authUser, usuarios, addNotificacion, registrosAsistencia, setRegistrosAsistencia, empresa, personalAdmin, personalOperativo, turnos,
    empresaConfig = {}, geocercas = [], geocercaAsignaciones = [], ubicacionConsentimientos = [], registrarConsentimientoUbicacionCtx,
  } = useApp();
  const [loading, setLoading] = useState(false);
  const [geoEstado, setGeoEstado] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [offlinePendientes, setOfflinePendientes] = useState(() => getGeoQueue().length);
  const [aviso, setAviso] = useState('');
  const [marcacionesHoy, setMarcacionesHoy] = useState([]);
  const [modo, setModo] = useState('entrada');
  const [verificandoHoy, setVerificandoHoy] = useState(true);
  
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const trabajadorActual = getTrabajadorAsistenciaMovil({ authUser, usuarios, personalAdmin, personalOperativo });
  
  const hoy = new Date();
  const today = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  const trabajadorId = trabajadorActual?.id || '';
  const turnoIdPersistible = turnos?.some(t => t.id === trabajadorActual?.turno_id) ? trabajadorActual.turno_id : null;
  const geoCfg = { ...GEO_CONFIG_DEFAULT, ...(empresaConfig || {}) };
  const geoActivo = Boolean(geoCfg.asistencia_movil_ubicacion_habilitada);
  const consentimientoActual = ubicacionConsentimientos.find(c => c.personal_id === trabajadorId && c.version === GEO_CONSENT_VERSION);
  const necesitaConsentimiento = geoActivo && Boolean(geoCfg.asistencia_movil_consentimiento_requerido) && !consentimientoActual;

  const turno = turnos?.find(t => t.id === turnoIdPersistible) || {};
  const refrigerioHabilitado = (turno.modo_refrigerio === 'medido_informativo' || turno.modo_refrigerio === 'medido_efectivo') && 
                               (turno.refrigerio_origenes_permitidos || []).includes('mobile_pwa');
  const showRefrigerio = modo === 'salida' && refrigerioHabilitado;

  const periodosRefrigerio = [];
  marcacionesHoy.forEach(m => {
    if (m.tipo_marca === 'refrigerio_salida') {
      periodosRefrigerio[m.secuencia - 1] = { ...periodosRefrigerio[m.secuencia - 1], salida: m };
    } else if (m.tipo_marca === 'refrigerio_retorno') {
      periodosRefrigerio[m.secuencia - 1] = { ...periodosRefrigerio[m.secuencia - 1], retorno: m };
    }
  });
  const refrigerioAbiertoIndex = periodosRefrigerio.findIndex(p => p && p.salida && !p.retorno);
  const refrigerioAbierto = refrigerioAbiertoIndex >= 0;
  const nextRefrigerioSeq = refrigerioAbierto ? refrigerioAbiertoIndex + 1 : periodosRefrigerio.length + 1;

  


  useEffect(() => {
    if (!trabajadorId) {
      setModo('entrada');
      return;
    }
    const rh = registrosAsistencia.filter(r => r.trabajador_id === trabajadorId && r.fecha === today);
    if (rh.some(r => !r.hora_salida)) {
      setModo('salida');
    } else if (rh.length > 0) {
      setModo('completado');
    } else if (geoActivo) {
      setModo('entrada');
    }
  }, [registrosAsistencia, trabajadorId, today]);

  useEffect(() => {
    if (!trabajadorId || !empresa?.id) { setVerificandoHoy(false); return; }
    let cancelled = false;
    setVerificandoHoy(true);
    rrhhService.getAsistencia(empresa.id, today, today)
      .then(rows => {
        if (cancelled) return;
        setRegistrosAsistencia(prev => {
          const idsFrescos = new Set(rows.map(r => r.id));
          return [...rows, ...prev.filter(r => !idsFrescos.has(r.id))];
        });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setVerificandoHoy(false); });
    return () => { cancelled = true; };
  }, [trabajadorId, empresa?.id, today]);

  useEffect(() => {
    const sincronizar = () => {
      syncGeoQueue({
        onSynced: saved => setRegistrosAsistencia(prev => [saved, ...prev.filter(r => r.id !== saved.id && !(r.trabajador_id === saved.trabajador_id && r.fecha === saved.fecha && r.offline_marcacion))]),
      }).then(res => {
        setOfflinePendientes(getGeoQueue().length);
        if (res.synced) addNotificacion(`${res.synced} marcacion(es) offline sincronizadas.`);
      }).catch(() => {});
    };
    window.addEventListener('online', sincronizar);
    if (navigator.onLine) sincronizar();
    return () => window.removeEventListener('online', sincronizar);
  }, [addNotificacion, setRegistrosAsistencia]);

  const aceptarConsentimiento = async () => {
    if (!trabajadorActual) return;
    try {
      await registrarConsentimientoUbicacionCtx?.({
        personal_id: trabajadorActual.id,
        personal_tipo: trabajadorActual.personal_tipo || trabajadorActual.trabajador_tipo || 'operativo',
        auth_user_id: authUser?.id || null,
        texto: geoCfg.asistencia_movil_consentimiento_texto,
        version: GEO_CONSENT_VERSION,
        origen: 'mobile_pwa',
      });
    } catch {
      addNotificacion('No se pudo guardar el consentimiento. Intenta nuevamente con conexion.');
      return;
    }
    setShowConsent(false);
  };

  const capturarFixGps = async () => {
    if (!geoActivo) return { fix: null, motivo: 'geofencing_inactivo' };
    if (!navigator.geolocation) return { fix: null, motivo: 'geolocalizacion_no_soportada' };
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      });
      return {
        fix: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision_m: Math.round(pos.coords.accuracy || 0),
          fix_at: new Date(pos.timestamp || Date.now()).toISOString(),
          enviado_at: new Date().toISOString(),
          simulated: false,
          fuente: 'navigator.geolocation',
        },
        motivo: null,
      };
    } catch (error) {
      const motivo = error?.code === 1 ? 'permiso_denegado' : error?.code === 3 ? 'timeout' : 'sin_senal';
      return { fix: null, motivo };
    }
  };

  const manejarMarcacionRefrigerio = async () => {
    if (verificandoHoy) return;
    setAviso('');
    if (necesitaConsentimiento) { setShowConsent(true); return; }
    setLoading(true); setGeoEstado('Obteniendo ubicación...');
    
    let lat = null, lng = null, accuracy = null, fixAt = null;
    if (geoActivo && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => { navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); });
        lat = pos.coords.latitude; lng = pos.coords.longitude; accuracy = Math.round(pos.coords.accuracy || 0); fixAt = new Date(pos.timestamp || Date.now()).toISOString();
      } catch (error) { addNotificacion('No se pudo obtener la ubicación exacta. Asegúrate de dar permisos.'); }
    } else { addNotificacion('Geolocalización no soportada en este dispositivo.'); }

    const fix = lat != null && lng != null ? { lat, lng, precision_m: accuracy, fix_at: fixAt || new Date().toISOString(), enviado_at: new Date().toISOString(), simulated: false, fuente: 'navigator.geolocation' } : null;
    const motivo = fix ? null : (geoActivo ? 'gps_no_disponible' : 'geofencing_inactivo');
    if (!fix && geoActivo && !geoCfg.geofencing_permitir_sin_gps) {
      const msg = 'No se pudo marcar: la politica exige ubicacion GPS.';
      addNotificacion(msg); setAviso(msg); setLoading(false); setGeoEstado(''); return;
    }
    const geoLocal = evaluarGeofenceLocal({ trabajador: trabajadorActual, geocercas, asignaciones: geocercaAsignaciones, fix: fix || { motivo }, fecha: today, config: geoCfg });
    if (geoLocal.estado === 'rechazable') {
      const msg = `Fuera de perimetro (${geoLocal.distancia_m} m). Politica estricta activa.`;
      addNotificacion(msg); setAviso(msg); setLoading(false); setGeoEstado(''); return;
    }

    const ahora = new Date();
    const horaActual = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
    const tipoMarca = refrigerioAbierto ? 'refrigerio_retorno' : 'refrigerio_salida';
    
    const metadata = {
      latitud: lat, longitud: lng, ubicacion: fix, geofence_estado: geoLocal.estado === 'rechazable' ? 'fuera' : geoLocal.estado, geocerca_id: geoLocal.geocerca_id || null, distancia_m: geoLocal.distancia_m ?? null, precision_m: fix?.precision_m ?? null, ubicacion_fix_at: fix?.fix_at || null, ubicacion_enviado_at: fix?.enviado_at || new Date().toISOString(), ubicacion_motivo: motivo || null, ubicacion_simulada: Boolean(fix?.simulated), offline_marcacion: !navigator.onLine, notas: 'Marcación móvil (Modo Campo)'
    };

    const rpcParams = {
      p_empresa_id: empresa?.id || 'emp_001', p_trabajador_id: trabajadorId, p_trabajador_tipo: trabajadorActual.trabajador_tipo || 'operativo', p_fecha: today, p_tipo_marca: tipoMarca, p_secuencia: nextRefrigerioSeq, p_origen: 'mobile_pwa', p_metadata: metadata
    };

    try {
      if (!navigator.onLine) throw new Error('offline');
      const data = await rrhhService.registrarMarcacionRPC(rpcParams);
      
      if (data.resultado === 'rechazado') {
        const motivosMap = {
          sin_turno: 'No tienes un turno asignado hoy.',
          turno_no_mide_refrigerio: 'Tu turno no admite marcación de refrigerio.',
          origen_no_permitido: 'No tienes permitido marcar refrigerio desde la aplicación móvil.',
          fuera_de_ventana: 'Estás fuera del horario permitido para tomar refrigerio.',
          excede_pares_esperados: 'Ya has tomado todos los refrigerios permitidos por hoy.'
        };
        const msg = motivosMap[data.motivo] || `Marca rechazada: ${data.motivo || 'sin detalle'}.`;
        addNotificacion(msg); setAviso(msg);
      } else if (data.consolidado === false) {
        addNotificacion(`Tu refrigerio se registró, pero no actualizó la jornada actual debido a una marca de mayor prioridad (${data.origen_vigente}).`);
        setAviso(`Precedencia menor: no sobrescribió marca previa de ${data.origen_vigente}.`);
      } else {
        addNotificacion(`Refrigerio (${tipoMarca === 'refrigerio_retorno' ? 'retorno' : 'salida'}) registrado a las ${horaActual}.`);
      }
      
      // Fetch fresh data
      const [rows, marcas] = await Promise.all([
        rrhhService.getAsistencia(empresa.id, today, today),
        rrhhService.getMarcaciones(empresa.id, trabajadorId, today)
      ]);
      setRegistrosAsistencia(prev => {
        const idsFrescos = new Set(rows.map(r => r.id));
        return [...rows, ...prev.filter(r => !idsFrescos.has(r.id))];
      });
      setMarcacionesHoy(marcas || []);
    } catch (e) {
      const msg = `Error BD (Refrigerio): ${e.message || JSON.stringify(e)}`;
      addNotificacion(msg); setAviso(msg);
    }
    
    setLoading(false); setGeoEstado('');
  };

  const manejarMarcacion = async () => {
    if (modo === 'completado' || verificandoHoy) return;
    setAviso('');
    if (!trabajadorId) {
      const msg = 'No encuentro un colaborador habilitado para asistencia móvil. Revisa el email y el permiso en Personal.';
      addNotificacion(msg);
      setAviso(msg);
      return;
    }
    if (!turnoIdPersistible) {
      const msg = 'Tu ficha no tiene un turno real asignado. Pide a RRHH asignarte un turno creado en Supabase.';
      addNotificacion(msg);
      setAviso(msg);
      return;
    }
    if (necesitaConsentimiento) {
      setShowConsent(true);
      return;
    }
    setLoading(true);
    setGeoEstado('Obteniendo ubicación...');
    
    let lat = null, lng = null, accuracy = null, fixAt = null;
    if (geoActivo && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        accuracy = Math.round(pos.coords.accuracy || 0);
        fixAt = new Date(pos.timestamp || Date.now()).toISOString();
      } catch (error) {
        addNotificacion('No se pudo obtener la ubicación exacta. Asegúrate de dar permisos.');
      }
    } else {
      addNotificacion('Geolocalización no soportada en este dispositivo.');
    }

    const fix = lat != null && lng != null
      ? { lat, lng, precision_m: accuracy, fix_at: fixAt || new Date().toISOString(), enviado_at: new Date().toISOString(), simulated: false, fuente: 'navigator.geolocation' }
      : null;
    const motivo = fix ? null : (geoActivo ? 'gps_no_disponible' : 'geofencing_inactivo');
    if (!fix && geoActivo && !geoCfg.geofencing_permitir_sin_gps) {
      const msg = 'No se pudo marcar: la politica exige ubicacion GPS.';
      addNotificacion(msg);
      setAviso(msg);
      setLoading(false);
      setGeoEstado('');
      return;
    }
    const geoLocal = evaluarGeofenceLocal({ trabajador: trabajadorActual, geocercas, asignaciones: geocercaAsignaciones, fix: fix || { motivo }, fecha: today, config: geoCfg });
    if (geoLocal.estado === 'rechazable') {
      const msg = `Fuera de perimetro (${geoLocal.distancia_m} m). Politica estricta activa.`;
      addNotificacion(msg);
      setAviso(msg);
      setLoading(false);
      setGeoEstado('');
      return;
    }

    const ahora = new Date();
    const horaActual = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
    
    if (modo === 'entrada') {
      const metadata = {
        latitud: lat, longitud: lng,
        ubicacion_entrada: fix,
        geofence_entrada_estado: geoLocal.estado === 'rechazable' ? 'fuera' : geoLocal.estado,
        geocerca_entrada_id: geoLocal.geocerca_id || null,
        distancia_entrada_m: geoLocal.distancia_m ?? null,
        precision_entrada_m: fix?.precision_m ?? null,
        ubicacion_fix_entrada_at: fix?.fix_at || null,
        ubicacion_enviado_at: fix?.enviado_at || new Date().toISOString(),
        ubicacion_motivo: motivo || null,
        ubicacion_simulada: Boolean(fix?.simulated),
        offline_marcacion: !navigator.onLine,
        notas: 'Marcación móvil (Modo Campo)'
      };

      const rpcParams = {
        p_empresa_id: empresa?.id || 'emp_001',
        p_trabajador_id: trabajadorId,
        p_trabajador_tipo: trabajadorActual.trabajador_tipo || 'operativo',
        p_fecha: today,
        p_tipo_marca: 'entrada',
        p_origen: 'mobile_pwa',
        p_metadata: metadata
      };

      // Representación local para actualizar la UI inmediatamente
      const local = {
        empresa_id: rpcParams.p_empresa_id, trabajador_id: trabajadorId, fecha: today,
        turno_id: turnoIdPersistible, hora_entrada: horaActual, hora_salida: null,
        estado: 'incompleto', origen_registro: 'mobile_pwa', ...metadata
      };
      
      try {
        if (!navigator.onLine) throw new Error('offline');
        const data = await rrhhService.registrarMarcacionRPC(rpcParams);
        
        if (data.consolidado === false) {
           addNotificacion(`Tu entrada se registró, pero no actualizó la jornada actual debido a una marca de mayor prioridad (${data.origen_vigente}).`);
           setAviso(`Precedencia menor: no sobrescribió marca previa de ${data.origen_vigente}.`);
        } else {
           addNotificacion(`Entrada registrada a las ${horaActual}`);
        }
        
        const uiRegistro = { ...local, id: data.registro_id, estado: data.estado || 'incompleto' };
        setRegistrosAsistencia(prev => [uiRegistro, ...prev]);
        setModo('salida');
      } catch (e) {
        local.id = `asis_off_${Date.now()}`;
        local.offline_marcacion = true;
        if (!navigator.onLine || e.message === 'offline') {
          rpcParams.p_metadata.offline_marcacion = true;
          enqueueGeoMark({ empresaId: rpcParams.p_empresa_id, rpcParams, registro: local });
          setOfflinePendientes(getGeoQueue().length);
          addNotificacion(`Entrada guardada offline a las ${horaActual}. Se sincronizará al recuperar señal.`);
          setRegistrosAsistencia(prev => [local, ...prev]);
          setModo('salida');
        } else {
          const msg = `Error BD (Entrada): ${e.message || JSON.stringify(e)}`;
          addNotificacion(msg);
          setAviso(msg);
        }
      }
    } else if (modo === 'salida') {
      if (refrigerioAbierto) {
        if (!window.confirm('Tienes un periodo de refrigerio sin cerrar. ¿Estás seguro de marcar tu salida del día?')) {
          return;
        }
      }
      const abierto = registrosAsistencia.find(r => r.trabajador_id === trabajadorId && r.fecha === today && !r.hora_salida);
      if (abierto) {
        const metadata = {
          latitud_salida: lat, longitud_salida: lng,
          ubicacion_salida: fix,
          geofence_salida_estado: geoLocal.estado === 'rechazable' ? 'fuera' : geoLocal.estado,
          geocerca_salida_id: geoLocal.geocerca_id || null,
          distancia_salida_m: geoLocal.distancia_m ?? null,
          precision_salida_m: fix?.precision_m ?? null,
          ubicacion_fix_salida_at: fix?.fix_at || null,
          ubicacion_enviado_at: fix?.enviado_at || new Date().toISOString(),
          ubicacion_motivo: motivo || abierto.ubicacion_motivo || null,
          ubicacion_simulada: Boolean(fix?.simulated || abierto.ubicacion_simulada),
          offline_marcacion: Boolean(abierto.offline_marcacion || !navigator.onLine),
          notas: 'Marcación móvil (Modo Campo)'
        };

        const rpcParams = {
          p_empresa_id: empresa?.id || 'emp_001',
          p_trabajador_id: trabajadorId,
          p_trabajador_tipo: trabajadorActual.trabajador_tipo || 'operativo',
          p_fecha: today,
          p_tipo_marca: 'salida',
          p_origen: 'mobile_pwa',
          p_metadata: metadata
        };
        
        const updatedLocal = { ...abierto, hora_salida: horaActual, estado: 'completo', ...metadata };

        try {
          if (!navigator.onLine) throw new Error('offline');
          const data = await rrhhService.registrarMarcacionRPC(rpcParams);
          
          if (data.consolidado === false) {
             addNotificacion(`Tu salida se registró, pero no actualizó la jornada actual debido a una marca de mayor prioridad (${data.origen_vigente}).`);
             setAviso(`Precedencia menor: no sobrescribió marca previa de ${data.origen_vigente}.`);
          } else {
             addNotificacion(`Salida registrada a las ${horaActual}`);
          }
          
          updatedLocal.id = data.registro_id;
          updatedLocal.estado = data.estado || 'completo';
          setRegistrosAsistencia(prev => prev.map(r => r.id === abierto.id ? updatedLocal : r));
          setModo('completado');
        } catch (e) {
          if (!navigator.onLine || e.message === 'offline') {
            rpcParams.p_metadata.offline_marcacion = true;
            updatedLocal.offline_marcacion = true;
            const queue = getGeoQueue();
            const idx = queue.findIndex(item => item.payload?.registro?.id === abierto.id || item.payload?.registro?.trabajador_id === abierto.trabajador_id && item.payload?.registro?.fecha === abierto.fecha);
            if (idx >= 0) {
              queue[idx].payload.rpcParams = rpcParams;
              queue[idx].payload.registro = updatedLocal;
              setGeoQueue(queue);
            } else {
              enqueueGeoMark({ empresaId: rpcParams.p_empresa_id, rpcParams, registro: updatedLocal, updateId: abierto.id?.startsWith?.('asis_off_') ? null : abierto.id });
            }
            setOfflinePendientes(getGeoQueue().length);
            addNotificacion(`Salida guardada offline a las ${horaActual}. Se sincronizará al recuperar señal.`);
            setRegistrosAsistencia(prev => prev.map(r => r.id === abierto.id ? updatedLocal : r));
            setModo('completado');
          } else {
            const msg = `Error BD (Salida): ${e.message || JSON.stringify(e)}`;
            addNotificacion(msg);
            setAviso(msg);
          }
        }
      }
    }
    
    setLoading(false);
    setGeoEstado('');
  };

  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Control de Asistencia</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>{usuarioMovil.nombre}</div></div>
      <div className="avatar" style={{width:34,height:34}}>{usuarioMovil.iniciales}</div>
    </div>
    
    <div className="mobile-content" style={{display:'flex', flexDirection:'column', justifyContent: 'flex-start', alignItems:'center', width:'100%', padding: '20px'}}>
      <div className="font-display" style={{fontSize:38, fontWeight:700, marginBottom:4, textAlign:'center', color:'var(--fg)'}}>
        {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
      </div>
      <div className="text-muted" style={{fontSize:14, marginBottom:30, textAlign:'center', textTransform:'capitalize'}}>
        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
      
      <div style={{position:'relative', width:220, height:220, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:30}}>
        {verificandoHoy ? (
          <div style={{width:200, height:200, borderRadius:'50%', background:'var(--bg-subtle)', border:'2px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'var(--fg-muted)', fontWeight:600, textAlign:'center', padding:20}}>
            Verificando estado del dia...
          </div>
        ) : <>
        {modo === 'entrada' && (
          <button 
            onClick={manejarMarcacion} 
            disabled={loading}
            className="hover-raise"
            style={{width:200, height:200, borderRadius:'50%', background:'var(--green)', color:'white', border:'none', fontSize:32, fontWeight:700, boxShadow:'0 10px 30px rgba(34,197,94,0.4)', cursor:'pointer', transition:'all 0.2s', opacity: loading ? 0.7 : 1}}
          >
            {loading ? <span style={{fontSize:16}}>Ubicando...</span> : 'Entrada'}
          </button>
        )}
        {modo === 'salida' && (
          <button 
            onClick={manejarMarcacion} 
            disabled={loading}
            className="hover-raise"
            style={{width:200, height:200, borderRadius:'50%', background:'var(--danger)', color:'white', border:'none', fontSize:32, fontWeight:700, boxShadow:'0 10px 30px rgba(239,68,68,0.4)', cursor:'pointer', transition:'all 0.2s', opacity: loading ? 0.7 : 1}}
          >
            {loading ? <span style={{fontSize:16}}>Ubicando...</span> : 'Salida'}
          </button>
        )}
        {modo === 'completado' && (
          <button 
            onClick={manejarMarcacion} 
            className="hover-raise"
            style={{width:200, height:200, borderRadius:'50%', background:'var(--bg-subtle)', color:'var(--fg)', border:'2px dashed var(--border)', fontSize:20, fontWeight:700, cursor:'pointer'}}
          >
            Nuevo registro
          </button>
        )}
        </>}
      </div>
      
      {showRefrigerio && !verificandoHoy && (
        <div style={{marginBottom: 30}}>
          <button
            onClick={manejarMarcacionRefrigerio}
            disabled={loading}
            className="hover-raise"
            style={{padding: '12px 24px', borderRadius: 20, background: refrigerioAbierto ? 'var(--orange)' : 'var(--blue)', color: 'white', border: 'none', fontSize: 16, fontWeight: 700, boxShadow: refrigerioAbierto ? '0 4px 12px rgba(249,115,22,0.3)' : '0 4px 12px rgba(59,130,246,0.3)', cursor: 'pointer', transition: 'all 0.2s', opacity: loading ? 0.7 : 1}}
          >
            {loading ? <span>Procesando...</span> : (refrigerioAbierto ? 'Regresar de refrigerio' : 'Salir a refrigerio')}
          </button>
        </div>
      )}

      {loading && <div className="text-muted" style={{fontSize:14, fontWeight:600, marginBottom:20}}>{I.mapPin} {geoEstado}</div>}
      {aviso && !loading && <div className="alert alert-warning" style={{width:'100%', marginBottom:14}}>{aviso}</div>}
      {geoActivo && !loading && (
        <div className="card" style={{width:'100%', padding:12, marginBottom:14}}>
          <div style={{fontWeight:800, fontSize:13}}>Ubicacion puntual</div>
          <div className="text-muted" style={{fontSize:12, marginTop:4}}>Solo se captura al marcar entrada/salida. No hay rastreo continuo ni en segundo plano.</div>
          <div className="row" style={{gap:6, marginTop:8, flexWrap:'wrap'}}>
            <span className="badge badge-cyan">{geoCfg.geofencing_modo === 'estricto' ? 'Modo estricto' : 'Modo flexible'}</span>
            {offlinePendientes > 0 && <span className="badge badge-orange">{offlinePendientes} offline</span>}
            {necesitaConsentimiento && <span className="badge badge-red">Consentimiento pendiente</span>}
          </div>
        </div>
      )}
      
      {modo === 'completado' && !loading && (
        <div className="badge badge-green" style={{fontSize:14, padding:'10px 20px', borderRadius:20, marginBottom:20}}>{I.check} Turno registrado exitosamente</div>
      )}
      
      <div style={{width:'100%', marginTop:'auto', paddingTop:20, borderTop:'1px solid var(--border-subtle)'}}>
        <div className="eyebrow" style={{marginBottom:12}}>Historial de Hoy</div>
        {registrosAsistencia.filter(r => r.trabajador_id === trabajadorId && r.fecha === today).map(r => (
          <div key={r.id} className="card" style={{padding:16, marginBottom:12, width:'100%'}}>
            <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
              <div style={{fontWeight:700, fontSize:15}}>{r.fecha}</div>
              <span className={'badge ' + (r.estado === 'completo' ? 'badge-green' : 'badge-orange')}>{r.estado === 'completo' ? 'Completado' : 'Abierto'}</span>
            </div>
            <div className="text-muted" style={{fontSize:14, marginBottom:4}}>Entrada: <strong style={{color:'var(--fg)'}}>{r.hora_entrada || '--:--'}</strong></div>
            <div className="text-muted" style={{fontSize:14, marginBottom:10}}>Salida: <strong style={{color:'var(--fg)'}}>{r.hora_salida || '--:--'}</strong></div>
            {periodosRefrigerio.length > 0 && (
              <div style={{marginTop: 8, marginBottom: 12, padding: 8, background: 'var(--bg)', borderRadius: 8}}>
                <div style={{fontSize: 12, fontWeight: 700, marginBottom: 4, color: 'var(--fg-muted)'}}>Refrigerios Registrados</div>
                {periodosRefrigerio.filter(Boolean).map((p, i) => (
                  <div key={i} style={{fontSize: 13, display: 'flex', justifyContent: 'space-between', marginBottom: 4}}>
                    <span>Periodo {p.salida.secuencia}:</span>
                    <strong style={{color: 'var(--fg)'}}>
                      {new Date(p.salida.marcado_en).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                      {p.retorno ? new Date(p.retorno.marcado_en).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : <span style={{color: 'var(--orange)'}}> En curso</span>}
                    </strong>
                  </div>
                ))}
              </div>
            )}
            {(r.geofence_entrada_estado || r.geofence_salida_estado) && <div className="row" style={{gap:6, marginBottom:8}}>
              {r.geofence_entrada_estado && <span className={'badge ' + (r.geofence_entrada_estado === 'dentro' ? 'badge-green' : r.geofence_entrada_estado === 'fuera' ? 'badge-orange' : 'badge-gray')}>Entrada {r.geofence_entrada_estado}</span>}
              {r.geofence_salida_estado && <span className={'badge ' + (r.geofence_salida_estado === 'dentro' ? 'badge-green' : r.geofence_salida_estado === 'fuera' ? 'badge-orange' : 'badge-gray')}>Salida {r.geofence_salida_estado}</span>}
              {Number(r.precision_entrada_m || 0) > Number(geoCfg.geofencing_precision_baja_m || 80) && <span className="badge badge-orange">precision baja</span>}
            </div>}
            {r.latitud && (
              <div style={{marginTop: 8, background:'var(--bg)', padding:8, borderRadius:8}}>
                <div style={{fontSize:12, color:'var(--fg-muted)', marginBottom: 6, display:'flex', alignItems:'center', gap:4}}>
                  <span style={{width:14, height:14, display:'inline-block'}}>{I.mapPin}</span> 
                  Ingreso: {r.latitud}, {r.longitud}
                </div>
                <a href={`https://www.google.com/maps?q=${r.latitud},${r.longitud}`} target="_blank" rel="noreferrer" style={{display:'block'}}>
                  <iframe 
                    width="100%" 
                    height="120" 
                    frameBorder="0" 
                    style={{border:0, borderRadius:6, pointerEvents: 'none'}}
                    src={`https://maps.google.com/maps?q=${r.latitud},${r.longitud}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                    allowFullScreen
                  ></iframe>
                </a>
              </div>
            )}
            {r.latitud_salida && (
              <div style={{marginTop: 8, background:'var(--bg)', padding:8, borderRadius:8}}>
                <div style={{fontSize:12, color:'var(--fg-muted)', marginBottom: 6, display:'flex', alignItems:'center', gap:4}}>
                  <span style={{width:14, height:14, display:'inline-block'}}>{I.mapPin}</span> 
                  Salida: {r.latitud_salida}, {r.longitud_salida}
                </div>
                <a href={`https://www.google.com/maps?q=${r.latitud_salida},${r.longitud_salida}`} target="_blank" rel="noreferrer" style={{display:'block'}}>
                  <iframe 
                    width="100%" 
                    height="120" 
                    frameBorder="0" 
                    style={{border:0, borderRadius:6, pointerEvents: 'none'}}
                    src={`https://maps.google.com/maps?q=${r.latitud_salida},${r.longitud_salida}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                    allowFullScreen
                  ></iframe>
                </a>
              </div>
            )}
          </div>
        ))}
        {registrosAsistencia.filter(r => r.trabajador_id === trabajadorId && r.fecha === today).length === 0 && (
          <div className="text-muted" style={{textAlign:'center', padding:20, fontSize:13}}>Aún no hay marcaciones hoy.</div>
        )}
      </div>
    </div>
    <div className="mobile-nav">
      <div className="mobile-nav-item active">{I.clock}Asistencia</div>
      <div className="mobile-nav-item">{I.settings}Ajustes</div>
    </div>
    {showConsent && (
      <div className="modal-backdrop" style={{position:'fixed', inset:0, zIndex:80, background:'rgba(0,0,0,.45)', display:'grid', placeItems:'center', padding:16}}>
        <div className="card" style={{padding:18, maxWidth:420, width:'100%'}}>
          <div style={{fontWeight:900, fontSize:18, marginBottom:8}}>Consentimiento de ubicacion</div>
          <p className="text-muted" style={{fontSize:13, lineHeight:1.5}}>{geoCfg.asistencia_movil_consentimiento_texto}</p>
          <div className="alert alert-warning" style={{fontSize:12}}>La ubicacion se captura solo al marcar asistencia o al iniciar una OT. La PWA no realiza rastreo continuo.</div>
          <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:12}}>
            <button className="btn btn-secondary" onClick={()=>setShowConsent(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={aceptarConsentimiento}>Acepto</button>
          </div>
        </div>
      </div>
    )}
  </>;
}

function TecnicoView({ screen, setScreen }) {
  const { ots, cuentas, partes, personalOperativo, registrarParteDiario, authUser, usuarios, personalDocumentos = [], subirDocumentoPersonalCtx, empresa, materiales } = useApp();
  const [selectedOt, setSelectedOt] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [escaneadoMaterial, setEscaneadoMaterial] = useState(null);
  const today = new Date().toISOString().split('T')[0];
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const tecnico =
    personalOperativo.find(p => p.id === usuarioMovil.id || normalizarTexto(p.email) === normalizarTexto(usuarioMovil.email)) ||
    { id: usuarioMovil.id || 'tecnico_campo', nombre: usuarioMovil.nombre };
  const iniciales = inicialesDe(tecnico.nombre, usuarioMovil.iniciales);
  const getCuenta = id => cuentas.find(c => c.id === id)?.razon_social || id || 'Cliente';
  const otsTecnico = ots
    .filter(o => o.estado !== 'anulada')
    .filter(o => !o.tecnico_responsable_id || o.tecnico_responsable_id === tecnico.id || o.responsable_id === tecnico.id)
    .sort((a, b) => String(a.fecha_programada || a.fecha_inicio || '').localeCompare(String(b.fecha_programada || b.fecha_inicio || '')))
    .slice(0, 4);
  const partesTecnico = partes.filter(p => p.tecnico_id === tecnico.id || p.tecnico === tecnico.id || p.tecnico === tecnico.nombre);
  const tareasPendientes = ots
    .flatMap(o => (o.tareas || [])
      .filter(t => !(t.completada || t.completado || t.estado === 'completada'))
      .filter(t => !t.tecnico_id || String(t.tecnico_id) === String(tecnico.id))
      .map(t => ({ ...t, ot: o, titulo: t.titulo || t.descripcion || 'Tarea sin titulo', avance_pct: Number(t.avance_pct || 0) })))
    .sort((a, b) => String(b.actualizado_en || b.ultima_actividad_fecha || '').localeCompare(String(a.actualizado_en || a.ultima_actividad_fecha || '')))
    .slice(0, 6);
  const docsActivos = personalDocumentos.filter(d => d.personal_id === tecnico.id && d.activo);
  const [docFile, setDocFile] = useState(null);
  const [docTipo, setDocTipo] = useState('');
  const [docFechaVenc, setDocFechaVenc] = useState('');
  const [docSubiendo, setDocSubiendo] = useState(false);
  const [docError, setDocError] = useState('');
  const [docExito, setDocExito] = useState('');
  const [avanceForm, setAvanceForm] = useState({ avance_pct: 0, completada: false, horas: 8, avance_global: 0 });

  const handleSubirDocMovil = async (e) => {
    e.preventDefault();
    if (!docFile || !docTipo) { setDocError('Elige el tipo y el archivo.'); return; }
    setDocSubiendo(true); setDocError(''); setDocExito('');
    try {
      await subirDocumentoPersonalCtx({
        personalId: tecnico.id,
        personalTipo: 'operativo',
        tipoDoc: docTipo,
        file: docFile,
        fechaVencimiento: docFechaVenc || null,
        subidoDesde: 'mobile',
      });
      setDocFile(null); setDocTipo(''); setDocFechaVenc('');
      setDocExito('Documento enviado. RRHH lo revisará a la brevedad.');
    } catch (err) {
      setDocError(err?.message || 'Error al subir.');
    } finally {
      setDocSubiendo(false);
    }
  };

  const enviarParte = () => {
    const ot = selectedOt || otsTecnico[0];
    if (!ot) return;
    const tarea = selectedTask;
    registrarParteDiario({
      ot_id: ot.id,
      tecnico_id: tecnico.id,
      tecnico: tecnico.nombre,
      fecha: today,
      horas: avanceForm.horas || 8,
      tarea_id: tarea?.id || null,
      avance_tarea_reportado: tarea ? avanceForm.avance_pct : null,
      tarea_completada_reportada: tarea ? avanceForm.completada : false,
      avance_reportado: tarea ? 0 : avanceForm.avance_global,
      actividad: tarea ? `Trabajo en tarea: ${tarea.titulo}` : `Ejecucion en campo de ${ot.numero || ot.id}`,
      tareas_trabajadas: tarea ? [{ tarea_id: tarea.id, nombre: tarea.titulo, estado_actual: tarea.estado || 'pendiente', avance_hoy: avanceForm.avance_pct }] : [],
      evidencias: [{ tipo: 'foto', nombre: 'evidencia_campo.jpg' }],
      registrado_desde: 'campo',
    });
    setSelectedTask(null);
    setScreen('home');
  };

  return <>
    <div className="mobile-header">
      <div>
        <div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Técnico</div>
        <div className="font-display" style={{fontWeight:700,fontSize:16}}>{tecnico.nombre}</div>
      </div>
      <div className="avatar" style={{width:34,height:34}}>{iniciales}</div>
    </div>
    <div className="mobile-content">
      {screen === 'home' && <>
        {tareasPendientes.length > 0 && (
          <>
            <div className="eyebrow" style={{marginBottom:10}}>Mis tareas pendientes</div>
            {tareasPendientes.map(t => (
              <div key={t.id} className="card" style={{padding:14, marginBottom:10}}>
                <div className="mono" style={{fontSize:11, color:'var(--fg-muted)', fontWeight:600, marginBottom:4}}>{t.ot.numero || t.ot.id} · {getCuenta(t.ot.cuenta_id || t.ot.cliente)}</div>
                <div style={{fontWeight:700, fontSize:14, marginBottom:8}}>→ {t.titulo}</div>
                <div className="bar" style={{marginBottom:6}}><div style={{width:`${Math.min(100, Math.max(0, t.avance_pct))}%`, background:'var(--cyan)'}}/></div>
                <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:10}}>{t.ultima_actividad_fecha ? `Ultima vez: ${t.ultima_actividad_fecha}` : 'Sin registro previo'} · {t.avance_pct}%</div>
                <button className="btn btn-sm btn-primary" style={{width:'100%'}} onClick={() => { setSelectedOt(t.ot); setSelectedTask(t); setAvanceForm({ avance_pct: t.avance_pct || 0, completada: false, horas: 8, avance_global: t.ot.avance ?? 0 }); setScreen('parte'); }}>
                  {t.avance_pct > 0 ? 'Continuar trabajando en esta tarea' : 'Iniciar esta tarea'}
                </button>
              </div>
            ))}
          </>
        )}
        <div className="eyebrow" style={{marginBottom:10}}>OTs de hoy · 22 Abr</div>
        {otsTecnico.map(o=>(
          <div key={o.id} className="card hover-raise" style={{padding:14,marginBottom:10,cursor:'pointer'}}>
            <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
              <div className="mono" style={{fontSize:11,color:'var(--fg-muted)',fontWeight:600}}>{o.numero || o.id}</div>
              <span className={'badge '+(o.estado === 'ejecucion' ? 'badge-orange' : 'badge-cyan')}>{o.estado}</span>
            </div>
            <div style={{fontWeight:700,fontFamily:'Sora',fontSize:15,marginBottom:4}}>{getCuenta(o.cuenta_id || o.cliente)}</div>
            <div className="text-muted" style={{fontSize:12,marginBottom:10}}>{o.sede} · 08:00 - 17:00</div>
            <div className="row" style={{gap:6}}>
              <button className="btn btn-sm btn-secondary flex-1" onClick={()=>{ setSelectedOt(o); setScreen('checklist'); }}>{I.check} SSOMA</button>
              <button className="btn btn-sm btn-primary flex-1" onClick={()=>{ setSelectedOt(o); setSelectedTask(null); setAvanceForm({ avance_pct: 0, completada: false, horas: 8, avance_global: o.avance ?? 0 }); setScreen('parte'); }}>{I.play} Parte</button>
            </div>
          </div>
        ))}
        {otsTecnico.length === 0 && <div className="card" style={{padding:16, textAlign:'center', color:'var(--fg-muted)'}}>No tienes OTs asignadas para campo.</div>}
        <div className="row" style={{gap:8, marginTop:10}}>
          <button className="btn btn-secondary flex-1" onClick={()=>setScreen('escaner')}>{I.camera} Escanear Material</button>
          <button className="btn btn-secondary" style={{color:'var(--danger)'}}>{I.alert} SOS</button>
        </div>
      </>}
      {screen === 'checklist' && <>
        <div onClick={()=>setScreen('home')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:10,cursor:'pointer'}}>← Volver</div>
        <div className="eyebrow">Checklist Pre-Trabajo</div>
        <div className="font-display" style={{fontSize:18,fontWeight:700,margin:'4px 0 16px'}}>Seguridad (SSOMA)</div>
        <div style={{display:'flex', flexDirection:'column', gap:10, marginBottom:20}}>
          <label style={{display:'flex', gap:8, alignItems:'center', background:'var(--bg)', padding:12, borderRadius:8}}><input type="checkbox"/> Charla de 5 min</label>
          <label style={{display:'flex', gap:8, alignItems:'center', background:'var(--bg)', padding:12, borderRadius:8}}><input type="checkbox"/> EPP Completo</label>
          <label style={{display:'flex', gap:8, alignItems:'center', background:'var(--bg)', padding:12, borderRadius:8}}><input type="checkbox"/> Permiso Trabajo Seguro (ATS)</label>
        </div>
        <button className="btn btn-primary btn-lg" style={{width:'100%'}} onClick={()=>setScreen('home')}>Firmar y Completar</button>
      </>}
      {screen === 'escaner' && <>
        <div onClick={()=>{ setScreen('home'); setEscaneadoMaterial(null); }} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:10,cursor:'pointer'}}>← Volver</div>
        <div className="eyebrow">Almacén Móvil</div>
        <div className="font-display" style={{fontSize:18,fontWeight:700,margin:'4px 0 16px'}}>Escanear Código de Barras</div>
        <BarcodeScanner
          onScan={(codigo) => {
            const mat = (materiales || []).find(m => m.codigo_barras === codigo);
            setEscaneadoMaterial(mat ? { ...mat, codigoEscaneado: codigo } : { codigoEscaneado: codigo, noEncontrado: true });
          }}
          onClose={() => { setScreen('home'); setEscaneadoMaterial(null); }}
        />
        {escaneadoMaterial && (
          <div style={{marginTop:12, padding:12, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-2)'}}>
            {escaneadoMaterial.noEncontrado ? (
              <div style={{color:'var(--orange)',fontSize:13}}>Código <span style={{fontFamily:'monospace'}}>{escaneadoMaterial.codigoEscaneado}</span> no encontrado en el catálogo.</div>
            ) : (
              <>
                <div style={{fontWeight:700,fontSize:15}}>{escaneadoMaterial.descripcion}</div>
                <div className="text-muted" style={{fontSize:12}}>{escaneadoMaterial.codigo} · {escaneadoMaterial.unidad || 'und'}</div>
                <div style={{fontSize:11,fontFamily:'monospace',marginTop:4,color:'var(--cyan)'}}>{escaneadoMaterial.codigoEscaneado}</div>
              </>
            )}
          </div>
        )}
        <p className="text-muted" style={{fontSize:12, textAlign:'center', marginTop:12}}>Apunta la cámara al código del repuesto para registrarlo en tu consumo diario automáticamente.</p>
      </>}
      {screen === 'documentos' && <>
        <div onClick={()=>setScreen('home')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:10,cursor:'pointer'}}>← Volver</div>
        <div className="eyebrow">Mis Documentos</div>
        <div className="font-display" style={{fontWeight:700,fontSize:18,margin:'4px 0 16px'}}>Habilitaciones</div>

        {/* Documentos actuales */}
        {docsActivos.length === 0 ? (
          <div style={{color:'var(--fg-muted)', fontSize:13, marginBottom:20, padding:'12px', background:'var(--bg)', borderRadius:8}}>
            No tienes documentos registrados aún.
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:20}}>
            {docsActivos.map(doc => {
              const tipoInfo = personalDocumentosService.TIPOS_DOC_OPERATIVO.find(t => t.key === doc.tipo_doc);
              // En móvil, el estado lo indica estado_validacion (el motor BD no está disponible en este contexto).
              const badgeVenc = doc.estado_validacion === 'aprobado' ? 'badge-green' : doc.estado_validacion === 'rechazado' ? 'badge-red' : 'badge-orange';
              const labelVenc = doc.estado_validacion === 'aprobado' ? 'Vigente' : doc.estado_validacion === 'rechazado' ? 'Rechazado' : 'En revisión';
              return (
                <div key={doc.id} style={{background:'var(--bg)', borderRadius:8, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontWeight:600, fontSize:13}}>{tipoInfo?.label || doc.tipo_doc}</div>
                    {doc.fecha_vencimiento && <div style={{fontSize:11, color:'var(--fg-muted)'}}>Vence: {doc.fecha_vencimiento}</div>}
                    <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:2}}>
                      {doc.estado_validacion === 'aprobado' ? '✓ Aprobado por RRHH' : doc.estado_validacion === 'rechazado' ? '✗ Rechazado — revisa el motivo' : '⏳ Pendiente de revisión'}
                    </div>
                    {doc.motivo_rechazo && <div style={{fontSize:11, color:'var(--danger)', marginTop:2}}>{doc.motivo_rechazo}</div>}
                  </div>
                  <span className={'badge ' + badgeVenc} style={{fontSize:10, whiteSpace:'nowrap'}}>{labelVenc}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Subir nuevo documento */}
        <div style={{fontWeight:600, fontSize:13, marginBottom:10}}>Subir documento</div>
        <form onSubmit={handleSubirDocMovil} style={{display:'flex', flexDirection:'column', gap:10}}>
          <div>
            <label style={{fontSize:12, color:'var(--fg-muted)', display:'block', marginBottom:4}}>Tipo de documento *</label>
            <select className="select" value={docTipo} onChange={e=>setDocTipo(e.target.value)} required style={{width:'100%'}}>
              <option value="">Seleccionar...</option>
              {personalDocumentosService.TIPOS_DOC_OPERATIVO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:12, color:'var(--fg-muted)', display:'block', marginBottom:4}}>Fecha de vencimiento</label>
            <input className="input" type="date" value={docFechaVenc} onChange={e=>setDocFechaVenc(e.target.value)} style={{width:'100%'}}/>
          </div>
          <div>
            <label style={{fontSize:12, color:'var(--fg-muted)', display:'block', marginBottom:4}}>Archivo (foto o PDF) *</label>
            <input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setDocFile(e.target.files?.[0]||null)} required style={{width:'100%'}}/>
          </div>
          {docError && <div style={{fontSize:12, color:'var(--danger)'}}>{docError}</div>}
          {docExito && <div style={{fontSize:12, color:'var(--green)'}}>{docExito}</div>}
          <button className="btn btn-primary btn-lg" style={{width:'100%'}} type="submit" disabled={docSubiendo}>
            {docSubiendo ? 'Subiendo...' : '↑ Enviar a RRHH'}
          </button>
        </form>
      </>}

      {screen === 'parte' && <>
        <div onClick={()=>setScreen('home')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:10,cursor:'pointer'}}>← OTs de hoy</div>
        <div className="eyebrow">Parte diario · Paso 4 de 5</div>
        <div className="font-display" style={{fontSize:18,fontWeight:700,margin:'4px 0 16px'}}>{selectedOt?.numero || selectedOt?.id || 'Evidencias'}</div>
        {selectedTask && (
          <div className="card" style={{padding:12, marginBottom:14}}>
            <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Tarea seleccionada</div>
            <div style={{fontWeight:700, marginBottom:6}}>{selectedTask.titulo}</div>
            <div style={{fontSize:12, color:'var(--fg-muted)'}}>Avance actual: {selectedTask.avance_pct}%</div>
          </div>
        )}
        <div className="bar" style={{marginBottom:20}}><div style={{width:'80%',background:'var(--cyan)'}}/></div>
        {selectedTask ? (
          <div style={{marginBottom: 16}}>
            <label style={{fontSize:12, color:'var(--fg-muted)', display:'block', marginBottom:4}}>¿En qué porcentaje quedó esta tarea hoy?</label>
            <input className="input" type="number" min="0" max="100" value={avanceForm.avance_pct} onChange={e => setAvanceForm(s => ({...s, avance_pct: Math.min(100, Math.max(0, Number(e.target.value)))}))} style={{width:'100%', marginBottom:12}} />
            <label style={{display:'flex', alignItems:'center', gap:8, fontSize:13}}>
              <input type="checkbox" checked={avanceForm.completada} onChange={e => setAvanceForm(s => ({...s, completada: e.target.checked}))} />
              Esta tarea está completamente terminada
            </label>
          </div>
        ) : (
          <div style={{marginBottom: 16}}>
            <label style={{fontSize:12, color:'var(--fg-muted)', display:'block', marginBottom:4}}>Avance global de la OT (%)</label>
            <input className="input" type="number" min="0" max="100" value={avanceForm.avance_global} onChange={e => setAvanceForm(s => ({...s, avance_global: Math.min(100, Math.max(0, Number(e.target.value)))}))} style={{width:'100%', marginBottom:12}} />
          </div>
        )}
        <div style={{marginBottom: 16}}>
          <label style={{fontSize:12, color:'var(--fg-muted)', display:'block', marginBottom:4}}>Horas trabajadas</label>
          <input className="input" type="number" min="0.5" step="0.5" value={avanceForm.horas} onChange={e => setAvanceForm(s => ({...s, horas: Number(e.target.value)}))} style={{width:'100%'}} />
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
          {[1,2,3].map(i=>(<div key={i} style={{aspectRatio:'1',background:'linear-gradient(135deg,#1A2B4A,#0F1B30)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.4)'}}>{I.camera}</div>))}
          <button style={{aspectRatio:'1',border:'2px dashed var(--border)',borderRadius:8,background:'var(--bg-subtle)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,fontSize:11,color:'var(--fg-muted)',cursor:'pointer'}}>{I.camera}<span>Agregar</span></button>
        </div>
        <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:14}}>3 de 5 fotos · GPS registrado</div>
        <button className="btn btn-primary btn-lg" style={{width:'100%'}} onClick={enviarParte}>{I.check} Enviar al supervisor</button>
      </>}
    </div>
    <div className="mobile-nav">
      <div className={'mobile-nav-item '+(screen==='home'?'active':'')} onClick={()=>setScreen('home')}>{I.home}OTs</div>
      <div className="mobile-nav-item">{I.clipboard}{partesTecnico.length} Partes</div>
      <div className={'mobile-nav-item '+(screen==='documentos'?'active':'')} onClick={()=>setScreen('documentos')}>{I.shield}Docs{docsActivos.filter(d=>d.estado_validacion==='rechazado').length > 0 ? <span style={{background:'var(--danger)',color:'#fff',borderRadius:'50%',width:14,height:14,fontSize:9,display:'flex',alignItems:'center',justifyContent:'center'}}>!</span> : null}</div>
      <div className="mobile-nav-item">{I.alert}SOS</div>
    </div>
  </>;
}

function LogisticaView({ screen, setScreen }) {
  const { authUser, usuarios } = useApp();
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Logística</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>{usuarioMovil.nombre}</div></div>
      <div className="avatar" style={{width:34,height:34}}>{usuarioMovil.iniciales}</div>
    </div>
    <div className="mobile-content">
      <div className="eyebrow" style={{marginBottom:10}}>Rutas de Entrega · Hoy</div>
      <div className="card" style={{padding:14, marginBottom:10}}>
        <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
          <div className="mono" style={{fontWeight:600}}>GR-002-4512</div>
          <span className="badge badge-orange">En Tránsito</span>
        </div>
        <div style={{fontWeight:700, marginBottom:4}}>Proyecto Sur Módulo B</div>
        <div className="text-muted" style={{fontSize:12, marginBottom:12}}>Entrega de repuestos y cable vulcanizado para OT-0045.</div>
        <button className="btn btn-primary btn-sm" style={{width:'100%'}} onClick={()=>setScreen('entrega')}>{I.check} Confirmar Entrega</button>
      </div>
      
      {screen === 'entrega' && (
        <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'var(--bg)', padding:20, zIndex:10}}>
          <div onClick={()=>setScreen('home')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:10,cursor:'pointer'}}>← Volver a Rutas</div>
          <h2 className="font-display" style={{marginBottom:16}}>Confirmación de Recepción</h2>
          <div style={{background:'var(--bg-subtle)', height:120, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', border:'1px dashed var(--border)', marginBottom:16}}>
            <span className="text-muted">[ Área para Firma Digital ]</span>
          </div>
          <button className="btn btn-secondary" style={{width:'100%', marginBottom:10}}>{I.camera} Adjuntar Foto Guía Firmada</button>
          <button className="btn btn-primary btn-lg" style={{width:'100%'}} onClick={()=>setScreen('home')}>Finalizar Entrega</button>
        </div>
      )}
    </div>
    <div className="mobile-nav">
      <div className="mobile-nav-item active">{I.truck}Rutas</div>
      <div className="mobile-nav-item">{I.clipboard}Guías</div>
      <div className="mobile-nav-item">{I.settings}Ajustes</div>
    </div>
  </>;
}

function VendedorView({ screen, setScreen, dark, setDark, onExit, profile, setProfile }) {
  const { agendaEventos, cuentas, contactos, oportunidades, cotizaciones, actividades, leads, historialEstados, oppHistorialEtapas, updateLeadState, convertirLead, descartarLead, actualizarAgendaEvento, crearAgendaEvento, actualizarEtapaOportunidad, marcarPerdida, searchQuery, crearLead, industrias, registrarActividad, authUser, usuarios, role, membresiaActiva, empresa, dataMode, supabaseStatus, signOut, notificaciones, markNotificacionesRead, addNotificacion, monedasActivas, personalAdmin, setPersonalAdmin, actualizarAcuerdoComision, enviarAcuerdoAAprobacion, retirarAcuerdoComision, actualizarLeadDatos } = useApp();
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const esDelUsuario = valor => normalizarTexto(valor) === normalizarTexto(usuarioMovil.nombre);
  const rolNombre = normalizarTexto(role?.nombre || membresiaActiva?.rol?.nombre);
  const puedeVerEquipoComercial = Boolean(
    role?.permisos?.plataforma ||
    role?.permisos?.tenant_admin ||
    role?.permisos?.todo ||
    role?.permisos?.ver_agenda_equipo ||
    rolNombre.includes('admin') ||
    rolNombre.includes('jefe comercial') ||
    rolNombre.includes('supervisor comercial')
  );
  const query = searchQuery.toLowerCase();
  const eventos = agendaEventos
    .filter(e => puedeVerEquipoComercial || esDelUsuario(e.vendedor) || esDelUsuario(e.registrado_por))
    .filter(e => !query || e.titulo.toLowerCase().includes(query) || (cuentas.find(c=>c.id===e.cuenta_id)?.razon_social||'').toLowerCase().includes(query))
    .sort((a,b) => a.fecha.localeCompare(b.fecha));
  
  const getCuentaNombre = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  const today = new Date().toISOString().split('T')[0];
  const [toast, setToast] = useState(null);
  const [localQuery, setLocalQuery] = useState('');
  const [pipelineTab, setPipelineTab] = useState('leads');
  const leadFileInputRef = useRef(null);
  const [leadFotoPreview, setLeadFotoPreview] = useState(null);
  const [leadFotoEstado, setLeadFotoEstado] = useState('idle');
  const [leadFotoTexto, setLeadFotoTexto] = useState('');
  const [leadDesdeFoto, setLeadDesdeFoto] = useState(null);
  const [notificacionesCampo, setNotificacionesCampo] = useState(true);
  const [modalMovLead, setModalMovLead] = useState(null); // { lead, destino }
  const [movMotivo, setMovMotivo] = useState('');
  const [movError, setMovError] = useState('');
  const [movPresupuesto, setMovPresupuesto] = useState('');
  const [movMoneda, setMovMoneda] = useState('PEN');
  const [modalConvertirLead, setModalConvertirLead] = useState(null);
  const [convertirForm, setConvertirForm] = useState(null);
  const [convertirError, setConvertirError] = useState('');
  const [modalPerderOpp, setModalPerderOpp] = useState(null);
  const [motivoPerdida, setMotivoPerdida] = useState('');
  const [perdidaError, setPerdidaError] = useState('');
  const [drawerItem, setDrawerItem] = useState(null); // { type: 'lead'|'opp', data: object }
  const [drawerTab, setDrawerTab] = useState('timeline');
  const [comisionEdit, setComisionEdit] = useState(null); // { pct, bonificacion, justificacion }
  const [comisionEnviando, setComisionEnviando] = useState(false);
  useEffect(() => {
    if (!empresa?.id || !authUser?.id || !setPersonalAdmin) return;
    const emailAuth = normalizarTexto(authUser.email);
    const yaTieneFicha = (personalAdmin || []).some(p =>
      p.auth_user_id === authUser.id ||
      (emailAuth && normalizarTexto(p.email) === emailAuth)
    );
    if (yaTieneFicha) return;
    let cancelado = false;
    rrhhService.getPersonalAdminPropio(empresa.id, {
      authUserId: authUser.id,
      email: authUser.email || usuarioMovil.email,
      nombre: usuarioMovil.nombre,
    })
      .then(ficha => {
        if (cancelado || !ficha) return;
        setPersonalAdmin(prev => {
          if ((prev || []).some(p => p.id === ficha.id)) {
            return prev.map(p => p.id === ficha.id ? { ...p, ...ficha } : p);
          }
          return [ficha, ...(prev || [])];
        });
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [empresa?.id, authUser?.id, authUser?.email, personalAdmin, setPersonalAdmin]);
  const patchDrawerOpp = (oppId, patch) => {
    setDrawerItem(prev => {
      if (!prev || prev.type !== 'opp' || prev.data?.id !== oppId) return prev;
      return { ...prev, data: { ...prev.data, ...patch } };
    });
  };
  useEffect(() => {
    setDrawerItem(prev => {
      if (!prev || prev.type !== 'opp') return prev;
      const latest = oportunidades.find(o => o.id === prev.data?.id);
      if (!latest || latest === prev.data) return prev;
      return { ...prev, data: { ...prev.data, ...latest } };
    });
  }, [oportunidades]);
  const ESTADOS_LEAD_ORDER = ['nuevo', 'en_contacto', 'calificado'];
  const MOV_CFG = {
    en_contacto: { titulo: 'Primer contacto', placeholder: '¿Cómo fue el primer contacto?' },
    calificado:  { titulo: 'Calificar lead', placeholder: '¿Por qué califica? ¿Confirmaste necesidad, presupuesto y decisión?' },
    descartado:  { titulo: 'Descartar lead', placeholder: '¿Por qué se descarta este lead?' },
  };
  const mobileFormGrid = { display:'grid', gridTemplateColumns:'1fr', gap:12 };
  const abrirMovLead = (lead, destino) => { setModalMovLead({ lead, destino }); setMovMotivo(''); setMovError(''); };
  const buildConvertirFormLead = (lead) => ({
    nombre_comercial: lead.empresa_nombre || lead.empresa_contacto || '',
    razon_social: lead.razon_social || lead.empresa_nombre || lead.empresa_contacto || '',
    ruc: lead.ruc || '',
    fuente: lead.fuente || '',
    industria: lead.industria || '',
    contacto_nombre: lead.nombre_contacto || lead.nombre || '',
    contacto_cargo: lead.cargo || '',
    contacto_telefono: sanitizePhone(lead.telefono || ''),
    contacto_email: lead.email || '',
    nombre_oportunidad: `${(lead.necesidad || 'Venta').slice(0, 50)} — ${lead.empresa_nombre || lead.empresa_contacto || 'Prospecto'}`,
    monto_estimado: lead.presupuesto_estimado || '',
    moneda: lead.moneda || monedasActivas?.[0]?.codigo || 'PEN',
  });
  const abrirConvertirLead = (lead) => {
    setModalConvertirLead(lead);
    setConvertirForm(buildConvertirFormLead(lead));
    setConvertirError('');
  };
  const updateConvertirForm = (campo, valor) => {
    setConvertirForm(prev => ({ ...prev, [campo]: valor }));
    setConvertirError('');
  };
  const confirmarConvertirLead = () => {
    if (!modalConvertirLead || !convertirForm) return;
    const requeridos = [
      'nombre_comercial',
      'razon_social',
      'ruc',
      'fuente',
      'industria',
      'contacto_nombre',
      'contacto_cargo',
      'contacto_telefono',
      'contacto_email',
      'nombre_oportunidad',
      'monto_estimado',
    ];
    const faltaCampo = requeridos.some(k => !String(convertirForm[k] || '').trim());
    if (faltaCampo) {
      setConvertirError('Completa todos los campos obligatorios para crear la oportunidad.');
      return;
    }
    if (!isValidRuc(convertirForm.ruc)) {
      setConvertirError('El RUC debe tener 11 digitos y empezar con 1 o 2.');
      return;
    }
    if (!isValidPhone(convertirForm.contacto_telefono)) {
      setConvertirError('El celular debe tener 9 digitos y empezar con 9.');
      return;
    }
    if (!(Number(convertirForm.monto_estimado) > 0)) {
      setConvertirError('El monto estimado debe ser mayor a cero.');
      return;
    }
    convertirLead(modalConvertirLead.id, convertirForm);
    setModalConvertirLead(null);
    setConvertirForm(null);
    setConvertirError('');
    setPipelineTab('opps');
    mostrarToast('Lead convertido a oportunidad');
  };
  const confirmarMovLead = () => {
    const { lead, destino } = modalMovLead;
    if (destino === 'calificado') {
      const presupFinal = Number(movPresupuesto) > 0 ? Number(movPresupuesto) : lead.presupuesto_estimado;
      if (!(presupFinal > 0)) {
        setMovError('Ingresa el presupuesto estimado para calificar.');
        return;
      }
      if (Number(movPresupuesto) > 0) {
        actualizarLeadDatos(lead.id, { presupuesto_estimado: Number(movPresupuesto), moneda: movMoneda });
      }
    }
    if (!movMotivo.trim()) { setMovError('El motivo es obligatorio.'); return; }
    if (destino === 'descartado') descartarLead(lead.id, movMotivo.trim());
    else updateLeadState(lead.id, destino, movMotivo.trim());
    setModalMovLead(null);
    setMovMotivo('');
    setMovError('');
    setMovPresupuesto('');
    setMovMoneda('PEN');
  };
  const abrirPerderOpp = (opp) => {
    setModalPerderOpp(opp);
    setMotivoPerdida('');
    setPerdidaError('');
  };
  const confirmarPerderOpp = () => {
    if (!modalPerderOpp) return;
    if (!motivoPerdida.trim()) {
      setPerdidaError('Registra el motivo de perdida.');
      return;
    }
    marcarPerdida(modalPerderOpp.id, motivoPerdida.trim());
    setModalPerderOpp(null);
    setMotivoPerdida('');
    setPerdidaError('');
    mostrarToast('Oportunidad marcada como perdida');
  };
  const ETAPAS = ['prospecto', 'calificacion', 'propuesta', 'negociacion'];
  const oppsUsuario = oportunidades.filter(o => (puedeVerEquipoComercial || esDelUsuario(o.responsable)) && o.estado === 'abierta');
  const etapaPipelineMobile = (opp) => normalizarTexto(opp?.etapa) === 'cierre' ? 'negociacion' : normalizarTexto(opp?.etapa);
  const getOppMontoEfectivo = (opp) => {
    const oppCots = (cotizaciones || []).filter(c => c.oportunidad_id === opp.id);
    if (!oppCots.length) return { monto: opp.monto_estimado || 0, moneda: opp.moneda || 'PEN' };
    const latest = oppCots.reduce((best, c) => (c.version || 1) > (best.version || 1) ? c : best, oppCots[0]);
    return { monto: latest.subtotal || 0, moneda: latest.moneda || 'PEN' };
  };
  const ETAPAS_PIPELINE = ['calificacion', 'propuesta', 'negociacion', 'ganada'];
  const ETAPA_LABELS = { calificacion: 'Calificación', propuesta: 'Propuesta', negociacion: 'Negociación', ganada: 'Ganada' };
  const resumenEtapas = ETAPAS_PIPELINE.map(etapa => {
    const oppsEtapa = oppsUsuario.filter(o => etapaPipelineMobile(o) === etapa);
    const totalUSD = oppsEtapa.reduce((s, o) => { const m = getOppMontoEfectivo(o); return m.moneda === 'USD' ? s + m.monto : s; }, 0);
    const totalPEN = oppsEtapa.reduce((s, o) => { const m = getOppMontoEfectivo(o); return m.moneda !== 'USD' ? s + m.monto : s; }, 0);
    return { etapa, totalUSD, totalPEN, count: oppsEtapa.length };
  }).filter(r => r.count > 0);
  const actsUsuario = actividades
    .filter(a => puedeVerEquipoComercial || esDelUsuario(a.responsable))
    .sort((a,b) => b.fecha.localeCompare(a.fecha));
  const leadsUsuario = (leads || [])
    .filter(l => (puedeVerEquipoComercial || esDelUsuario(l.responsable)) && !['convertido', 'descartado'].includes(normalizarTexto(l.estado)))
    .sort((a,b) => String(b.fecha_creacion || '').localeCompare(String(a.fecha_creacion || '')));
  const etapaColor = { prospecto:'cyan', calificacion:'purple', propuesta:'orange', negociacion:'navy', cierre:'green', ganada:'green' };
  const estadoLeadColor = { nuevo:'cyan', contactado:'purple', en_contacto:'purple', calificado:'green', en_proceso:'orange', interesado:'orange' };
  const cuentaActiva =
    cuentas.find(c => esDelUsuario(c.responsable_comercial) || esDelUsuario(c.vendedor) || esDelUsuario(c.responsable)) ||
    cuentas[0];
  const contactosCuentaActiva = contactos.filter(c => c.cuenta_id === cuentaActiva?.id);
  const contactoPrincipal =
    contactosCuentaActiva.find(c => c.principal || c.es_principal) ||
    contactosCuentaActiva[0] ||
    null;
  const telefonoContactoPrincipal = contactoPrincipal?.telefono || cuentaActiva?.telefono || '';
  const telefonoLlamada = telefonoParaLlamar(telefonoContactoPrincipal);
  const scopeLabel = puedeVerEquipoComercial ? 'Equipo Comercial' : 'Mi';
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  const puedeUsarCamara = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const puedeLlamar = typeof window !== 'undefined' && 'location' in window;
  const sincronizacionEstado = dataMode === 'supabase'
    ? (supabaseStatus?.connected ? 'Conectado' : 'Pendiente')
    : 'Modo demo';
  const unreadCount = notificaciones.filter(n => !n.read).length;
  const puedeNotificar = typeof window !== 'undefined' && 'Notification' in window;
  const permisoNotificacion = puedeNotificar ? Notification.permission : 'unsupported';
  const mostrarToast = (mensaje) => {
    setToast(mensaje);
    setTimeout(() => setToast(null), 3000);
  };
  const abrirNotificaciones = () => {
    markNotificacionesRead();
    setScreen('notificaciones');
  };
  const solicitarPermisoNotificaciones = async () => {
    if (!puedeNotificar) {
      mostrarToast('Este navegador no soporta notificaciones');
      return;
    }
    const permiso = await Notification.requestPermission();
    mostrarToast(permiso === 'granted' ? 'Notificaciones activadas' : 'Permiso no concedido');
  };
  const probarNotificacion = () => {
    const texto = 'Aviso de prueba para modo campo';
    addNotificacion(texto);
    if (puedeNotificar && Notification.permission === 'granted') {
      new Notification('TIDEO ERP', { body: texto, icon: '/icons/tideo-icon-192.png' });
    }
    mostrarToast('Notificacion enviada');
  };

  const handleRealizado = (id) => {
    actualizarAgendaEvento(id, { estado: 'realizado' });
    if (confirm('¿Deseas registrar una Actividad Comercial para este evento?')) {
      // Flujo rápido: en un caso real abriría el modal de nueva actividad
      alert('Se abrirá el modal de nueva actividad pre-llenado.');
    }
  };

  const guardarLeadDesdeFormData = (fd, extra = {}) => {
    crearLead({
      id: 'ld_' + Date.now(),
      nombre_contacto: fd.get('nombre_contacto'),
      empresa_nombre: fd.get('empresa_nombre'),
      telefono: fd.get('telefono') || null,
      email: fd.get('email') || null,
      industria: fd.get('industria') || null,
      cargo: fd.get('cargo') || null,
      urgencia: fd.get('urgencia'),
      necesidad: fd.get('necesidad') || null,
      fuente: extra.fuente || 'campo_movil',
      responsable: usuarioMovil.nombre,
      registrado_desde: 'campo',
      estado: 'nuevo',
      convertido: false,
      ...extra,
    });
  };

  const analizarFotoTarjeta = async (file) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setLeadFotoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return preview;
    });
    setLeadFotoEstado('analizando');
    setLeadFotoTexto('');
    setLeadDesdeFoto(null);
    setScreen('lead-foto');

    try {
      // Convertir imagen a base64
      const imageBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Llamar a la Edge Function de Supabase (GPT-4o Vision)
      const sb = await getSupabaseClient();
      const { data: fnData, error: fnError } = await sb.functions.invoke('extraer-tarjeta-lead', {
        body: { imageBase64 },
      });

      if (fnError) throw fnError;
      if (!fnData?.success) throw new Error(fnData?.error || 'Edge Function error');

      const datos = {
        nombre_contacto: fnData.data?.nombre_contacto || '',
        empresa_nombre: fnData.data?.nombre_empresa || fnData.data?.razon_social || '',
        cargo: fnData.data?.cargo || '',
        telefono: fnData.data?.telefono || '',
        email: fnData.data?.email || '',
        necesidad: 'Lead capturado desde tarjeta de presentación con IA.',
      };

      setLeadDesdeFoto(datos);
      setLeadFotoEstado('detectado');
    } catch (error) {
      console.error('No se pudo analizar la tarjeta con IA:', error);
      // Fallback: form vacío para completar manualmente
      setLeadDesdeFoto(extraerDatosTarjeta(''));
      setLeadFotoEstado('sin_ocr');
    }
  };

  const submitLeadFoto = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    guardarLeadDesdeFormData(fd, {
      fuente: 'tarjeta_foto_movil',
      evidencia_tipo: 'foto_tarjeta',
    });
    setToast('Lead creado desde tarjeta');
    setTimeout(() => setToast(null), 3000);
    setScreen('home');
  };

  const submitNuevoEvento = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    crearAgendaEvento({
      titulo: fd.get('titulo'),
      tipo: fd.get('tipo'),
      fecha: fd.get('fecha'),
      hora: fd.get('hora'),
      cuenta_id: fd.get('cuenta_id'),
      vendedor: usuarioMovil.nombre,
      registrado_por: usuarioMovil.nombre,
      estado: 'programado',
      duracion_minutos: 60
    });
    setScreen('agenda');
  };

  const submitNuevoLead = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    guardarLeadDesdeFormData(fd);
    setToast('Lead creado correctamente');
    setTimeout(() => setToast(null), 3000);
    setScreen('home');
  };

  const submitNuevaActividad = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    registrarActividad({
      tipo: fd.get('tipo'),
      cuenta_id: fd.get('cuenta_id'),
      vinculo_tipo: 'cuenta',
      vinculo_id: fd.get('cuenta_id'),
      fecha: fd.get('fecha'),
      hora: fd.get('hora') || null,
      descripcion: fd.get('descripcion'),
      resultado: fd.get('resultado') || null,
      proxima_accion: fd.get('proxima_accion') || null,
      responsable: usuarioMovil.nombre,
    });
    setToast('Actividad registrada');
    setTimeout(() => setToast(null), 3000);
    setScreen('home');
  };

  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Vendedor</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>{usuarioMovil.nombre}</div></div>
      <div className="avatar" style={{width:34,height:34}}>{usuarioMovil.iniciales}</div>
    </div>
    <div className="mobile-content">
      {screen === 'home' || screen === 'clientes' ? (
        <>
          <input
            ref={leadFileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{display:'none'}}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              analizarFotoTarjeta(file);
            }}
          />
          <button className="input hover-raise" style={{marginBottom:14,display:'flex',alignItems:'center',gap:8,cursor:'pointer',width:'100%',textAlign:'left',border:'none'}} onClick={() => setScreen('buscar')}><span style={{width:16,height:16,flexShrink:0,opacity:0.5}}>{I.search}</span><span style={{flex:1,fontSize:13,color:'var(--fg-muted)'}}>Buscar cliente...</span></button>
          <div className="eyebrow" style={{marginBottom:8}}>Cliente activo</div>
          <div className="card" style={{padding:14,marginBottom:14}}>
            <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
              <div style={{fontFamily:'Sora',fontWeight:700,fontSize:15}}>{cuentaActiva?.razon_social || 'Sin cliente activo'}</div>
              <span className="health-dot health-green"/>
            </div>
            <div className="text-muted" style={{fontSize:12,marginBottom:10}}>{cuentaActiva?.industria || 'Sin industria'} · {usuarioMovil.nombre}</div>
            <div className="row" style={{gap:6}}>
              <a
                className="btn btn-sm btn-secondary flex-1"
                href={telefonoLlamada ? `tel:${telefonoLlamada}` : undefined}
                aria-disabled={!telefonoLlamada}
                onClick={e => {
                  if (!telefonoLlamada) {
                    e.preventDefault();
                    mostrarToast('El contacto principal no tiene telefono');
                  }
                }}
              >
                {I.phone}Llamar
              </a>
              <button className="btn btn-sm btn-primary flex-1" onClick={() => setScreen('nueva-actividad')}>{I.plus}Actividad</button>
            </div>
          </div>
          <div className="eyebrow" style={{marginBottom:8}}>Acciones rápidas</div>
          <div className="col" style={{gap:8}}>
            <button className="card hover-raise row" style={{padding:12,cursor:'pointer',width:'100%'}} onClick={() => leadFileInputRef.current?.click()}>
              <div className="kpi-icon cyan" style={{position:'static',width:34,height:34}}>{I.camera}</div>
              <div style={{flex:1,textAlign:'left',marginLeft:10}}>
                <div style={{fontWeight:600,fontSize:13}}>Crear lead con foto de tarjeta</div>
                <div className="text-muted" style={{fontSize:11}}>IA extrae datos automáticamente</div>
              </div>
            </button>
            <button className="card hover-raise row" style={{padding:12,cursor:'pointer',width:'100%'}} onClick={() => setScreen('nuevo-evento')}>
              <div className="kpi-icon purple" style={{position:'static',width:34,height:34}}>{I.calendar}</div>
              <div style={{flex:1,textAlign:'left',marginLeft:10}}>
                <div style={{fontWeight:600,fontSize:13}}>Planificar en agenda</div>
                <div className="text-muted" style={{fontSize:11}}>Agendar próxima reunión o visita</div>
              </div>
            </button>
            <button className="card hover-raise row" style={{padding:12,cursor:'pointer',width:'100%'}} onClick={() => setScreen('nuevo-lead')}>
              <div className="kpi-icon" style={{position:'static',width:34,height:34,background:'var(--green-lt)',color:'var(--green-dk)'}}>{I.plus}</div>
              <div style={{flex:1,textAlign:'left',marginLeft:10}}>
                <div style={{fontWeight:600,fontSize:13}}>Agregar lead</div>
                <div className="text-muted" style={{fontSize:11}}>Registrar nuevo prospecto manualmente</div>
              </div>
            </button>
          </div>
        </>
      ) : screen === 'agenda' ? (
        <>
          <div className="row" style={{justifyContent:'space-between', marginBottom: 16}}>
            <div className="eyebrow">{scopeLabel} Agenda Comercial</div>
            <button className="btn btn-sm btn-primary" data-local-form="true" onClick={() => setScreen('nuevo-evento')}>{I.plus} Nuevo</button>
          </div>
          <div className="col" style={{gap:10}}>
            {eventos.map(e => (
              <div key={e.id} className="card" style={{padding:14, borderLeft:`4px solid var(--${e.tipo==='visita'?'green':'cyan'})`}}>
                <div className="row" style={{justifyContent:'space-between', marginBottom:4}}>
                  <div style={{fontWeight:600, fontSize:14}}>{e.titulo}</div>
                  <span className={'badge ' + (e.estado==='realizado'?'badge-green':'badge-cyan')} style={{fontSize:10}}>{e.estado}</span>
                </div>
                <div className="text-muted" style={{fontSize:12, marginBottom:8}}>{e.cuenta_id ? getCuentaNombre(e.cuenta_id) : 'Prospecto'}</div>
                <div className="row" style={{justifyContent:'space-between', marginTop:4}}>
                  <div className="row" style={{gap:4, fontSize:12, fontWeight:600, color:'var(--fg-muted)'}}>
                    <span style={{width:14, height:14}}>{I.clock}</span> {e.fecha} {e.hora}
                  </div>
                  {e.estado !== 'realizado' && (
                    <button className="btn btn-sm btn-secondary" onClick={() => handleRealizado(e.id)}>{I.check} Realizado</button>
                  )}
                </div>
              </div>
            ))}
            {eventos.length === 0 && <div className="text-muted" style={{textAlign:'center', padding:20, fontSize:13}}>No tienes eventos programados.</div>}
          </div>
        </>
      ) : screen === 'nuevo-evento' ? (
        <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'var(--bg)', padding:20, zIndex:10}}>
          <div onClick={()=>setScreen('agenda')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:16,cursor:'pointer'}}>← Volver a Agenda</div>
          <h2 className="font-display" style={{marginBottom:16}}>Nuevo Evento</h2>
          <form className="col" style={{gap:16}} onSubmit={submitNuevoEvento}>
            <div className="input-group">
              <label>Tipo de Evento</label>
              <select name="tipo" className="select" required defaultValue="visita">
                <option value="visita">Visita presencial</option>
                <option value="reunion">Reunión virtual</option>
                <option value="llamada">Llamada</option>
                <option value="demo">Demo de producto</option>
              </select>
            </div>
            <div className="input-group">
              <label>Cliente o Prospecto</label>
              <select name="cuenta_id" className="select" required>
                <option value="">Seleccionar...</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Título breve</label>
              <input name="titulo" type="text" className="input" placeholder="Ej: Presentación de servicios" required />
            </div>
            <div className="grid-2">
              <div className="input-group">
                <label>Fecha</label>
                <input name="fecha" type="date" className="input" defaultValue={today} required />
              </div>
              <div className="input-group">
                <label>Hora</label>
                <input name="hora" type="time" className="input" defaultValue="10:00" required />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{width:'100%', marginTop:10}}>Guardar en Agenda</button>
          </form>
        </div>
      ) : screen === 'lead-foto' ? (
        <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'var(--bg)', padding:20, zIndex:10, overflowY:'auto'}}>
          <div onClick={()=>setScreen('home')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:16,cursor:'pointer'}}>← Volver</div>
          <h2 className="font-display" style={{marginBottom:6}}>Lead desde tarjeta</h2>
          <div className="text-muted" style={{fontSize:12,marginBottom:14}}>Revisa los datos extraidos antes de guardar.</div>
          {leadFotoPreview && (
            <div className="card" style={{padding:0,overflow:'hidden',marginBottom:14}}>
              <img src={leadFotoPreview} alt="Tarjeta capturada" style={{display:'block',width:'100%',maxHeight:160,objectFit:'cover'}}/>
            </div>
          )}
          {leadFotoEstado === 'analizando' ? (
            <div className="card" style={{padding:16,textAlign:'center'}}>
              <div className="kpi-icon cyan" style={{position:'static',margin:'0 auto 10px'}}>{I.sparkles}</div>
              <div style={{fontWeight:700,fontSize:14}}>Analizando tarjeta...</div>
              <div className="text-muted" style={{fontSize:12,marginTop:4}}>Intentando detectar nombre, empresa, email y telefono.</div>
            </div>
          ) : (
            <form key={`${leadFotoEstado}-${leadFotoTexto.length}`} className="col" style={{gap:14}} onSubmit={submitLeadFoto}>
              {leadFotoEstado === 'detectado' ? (
                <div className="badge badge-green" style={{alignSelf:'flex-start'}}>{I.check} Datos detectados</div>
              ) : (
                <div className="card" style={{padding:12,background:'var(--cyan-lt)',borderColor:'rgba(6,182,212,0.25)'}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:3}}>OCR no disponible en este navegador</div>
                  <div className="text-muted" style={{fontSize:12}}>La foto queda como evidencia y puedes completar los datos manualmente.</div>
                </div>
              )}
              <div className="input-group">
                <label>Nombre del contacto *</label>
                <input name="nombre_contacto" type="text" className="input" defaultValue={leadDesdeFoto?.nombre_contacto || ''} placeholder="Ej: Juan Perez" required />
              </div>
              <div className="input-group">
                <label>Empresa</label>
                <input name="empresa_nombre" type="text" className="input" defaultValue={leadDesdeFoto?.empresa_nombre || ''} placeholder="Ej: Minera del Sur SAC" />
              </div>
              <div className="input-group">
                <label>Cargo</label>
                <input name="cargo" type="text" className="input" defaultValue={leadDesdeFoto?.cargo || ''} placeholder="Ej: Jefe de Compras" />
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label>Telefono</label>
                  <input name="telefono" type="tel" className="input" defaultValue={sanitizePhone(leadDesdeFoto?.telefono || '')} inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} onInput={e => { e.currentTarget.value = sanitizePhone(e.currentTarget.value); }} placeholder="9XXXXXXXX" />
                </div>
                <div className="input-group">
                  <label>Email</label>
                  <input name="email" type="email" className="input" defaultValue={leadDesdeFoto?.email || ''} placeholder="correo@empresa.com" />
                </div>
              </div>
              <div className="input-group">
                <label>Industria</label>
                <select name="industria" className="select" defaultValue="">
                  <option value="">Seleccionar...</option>
                  {(industrias?.length ? industrias : ['Mineria','Industrial','Construccion','Agroindustria','Facilities','Energia','Petroleo & Gas','Logistica','Retail','Salud','Educacion','Tecnologia','Servicios profesionales','Sector publico','Otro'].map(n=>({id:n,nombre:n}))).map(i => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Urgencia</label>
                <select name="urgencia" className="select" defaultValue="media">
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
              <div className="input-group">
                <label>Notas</label>
                <textarea name="necesidad" className="input" defaultValue={leadDesdeFoto?.necesidad || ''} rows={4} style={{resize:'none'}} />
              </div>
              <button type="submit" className="btn btn-primary btn-lg" style={{width:'100%', marginTop:6}}>{I.check} Crear lead</button>
            </form>
          )}
        </div>
      ) : screen === 'nuevo-lead' ? (
        <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'var(--bg)', padding:20, zIndex:10, overflowY:'auto'}}>
          <div onClick={()=>setScreen('home')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:16,cursor:'pointer'}}>← Volver</div>
          <h2 className="font-display" style={{marginBottom:16}}>Nuevo Lead</h2>
          <form className="col" style={{gap:14}} onSubmit={submitNuevoLead}>
            <div className="input-group">
              <label>Nombre del contacto *</label>
              <input name="nombre_contacto" type="text" className="input" placeholder="Ej: Juan Pérez" required />
            </div>
            <div className="input-group">
              <label>Empresa</label>
              <input name="empresa_nombre" type="text" className="input" placeholder="Ej: Minera del Sur SAC" />
            </div>
            <div className="input-group">
              <label>Cargo</label>
              <input name="cargo" type="text" className="input" placeholder="Ej: Gerente de Operaciones" />
            </div>
            <div className="grid-2">
              <div className="input-group">
                <label>Teléfono</label>
                <input name="telefono" type="tel" className="input" inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} onInput={e => { e.currentTarget.value = sanitizePhone(e.currentTarget.value); }} placeholder="9XXXXXXXX" />
              </div>
              <div className="input-group">
                <label>Email</label>
                <input name="email" type="email" className="input" placeholder="correo@empresa.com" />
              </div>
            </div>
            <div className="input-group">
              <label>Industria</label>
              <select name="industria" className="select" defaultValue="">
                <option value="">Seleccionar...</option>
                {(industrias?.length ? industrias : ['Mineria','Industrial','Construccion','Agroindustria','Facilities','Energia','Petroleo & Gas','Logistica','Retail','Salud','Educacion','Tecnologia','Servicios profesionales','Sector publico','Otro'].map(n=>({id:n,nombre:n}))).map(i => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Urgencia</label>
              <select name="urgencia" className="select" defaultValue="media">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div className="input-group">
              <label>Necesidad / Notas</label>
              <textarea name="necesidad" className="input" placeholder="Describe brevemente la necesidad del prospecto..." rows={3} style={{resize:'none'}} />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{width:'100%', marginTop:6}}>Guardar Lead</button>
          </form>
        </div>
      ) : screen === 'buscar' ? (
        <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'var(--bg)', padding:16, zIndex:10}}>
          <div className="row" style={{gap:8, marginBottom:14}}>
            <div className="input" style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
              <span style={{width:16,height:16,flexShrink:0,opacity:0.5}}>{I.search}</span>
              <input autoFocus placeholder="Buscar cliente o industria..." value={localQuery} onChange={e => setLocalQuery(e.target.value)} style={{border:'none',outline:'none',background:'transparent',flex:1,color:'inherit',fontSize:13}}/>
              {localQuery && <span onClick={() => setLocalQuery('')} style={{cursor:'pointer',opacity:0.5,lineHeight:1}}>{I.x}</span>}
            </div>
            <button className="btn btn-secondary" style={{flexShrink:0}} onClick={() => { setLocalQuery(''); setScreen('home'); }}>Cancelar</button>
          </div>
          <div className="col" style={{gap:8, overflowY:'auto', maxHeight:'calc(100% - 60px)'}}>
            {cuentas.filter(c => !localQuery || (c.razon_social||'').toLowerCase().includes(localQuery.toLowerCase()) || (c.industria||'').toLowerCase().includes(localQuery.toLowerCase())).slice(0,10).map(c => (
              <div key={c.id} className="card hover-raise" style={{padding:14, cursor:'pointer'}} onClick={() => { setLocalQuery(''); setScreen('home'); }}>
                <div className="row" style={{justifyContent:'space-between', marginBottom:2}}>
                  <div style={{fontWeight:700, fontSize:14}}>{c.razon_social}</div>
                  <span className="badge badge-cyan" style={{fontSize:10}}>{c.industria}</span>
                </div>
                <div className="text-muted" style={{fontSize:12}}>{c.ciudad || c.pais || ''}</div>
              </div>
            ))}
            {localQuery && !cuentas.some(c => (c.razon_social||'').toLowerCase().includes(localQuery.toLowerCase()) || (c.industria||'').toLowerCase().includes(localQuery.toLowerCase())) && (
              <div className="text-muted" style={{textAlign:'center', padding:20, fontSize:13}}>Sin resultados para "{localQuery}"</div>
            )}
          </div>
        </div>
      ) : screen === 'pipeline' ? (
        <>
          <div className="eyebrow" style={{marginBottom:12}}>{scopeLabel} Pipeline</div>
          <div className="row" style={{gap:6, marginBottom:14}}>
            <button className={'btn btn-sm flex-1 '+(pipelineTab==='leads'?'btn-navy':'btn-secondary')} onClick={() => setPipelineTab('leads')}>Leads · {leadsUsuario.length}</button>
            <button className={'btn btn-sm flex-1 '+(pipelineTab==='opps'?'btn-navy':'btn-secondary')} onClick={() => setPipelineTab('opps')}>Opps · {oppsUsuario.length}</button>
            <button className={'btn btn-sm flex-1 '+(pipelineTab==='acts'?'btn-navy':'btn-secondary')} onClick={() => setPipelineTab('acts')}>Acts · {actsUsuario.length}</button>
          </div>
          {pipelineTab === 'leads' ? (
            <div className="col" style={{gap:10}}>
              {leadsUsuario.length > 0 && (() => {
                const grupos = leadsUsuario.reduce((acc, l) => {
                  const k = normalizarTexto(l.estado) || 'nuevo';
                  if (!acc[k]) acc[k] = { label: l.estado || 'Nuevo', color: estadoLeadColor[k] || 'cyan', count: 0 };
                  acc[k].count++;
                  return acc;
                }, {});
                return (
                  <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:4}}>
                    {Object.values(grupos).map(g => (
                      <div key={g.label} style={{display:'flex', alignItems:'center', gap:6, background:'var(--bg-subtle)', borderRadius:8, padding:'7px 12px', borderLeft:`3px solid var(--${g.color})`}}>
                        <span style={{fontSize:11, fontWeight:700, textTransform:'capitalize', color:`var(--${g.color})`}}>{g.label}</span>
                        <span style={{fontSize:14, fontWeight:800, color:`var(--${g.color})`}}>{g.count}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {leadsUsuario.length === 0 && <div className="text-muted" style={{textAlign:'center', padding:30, fontSize:13}}>No tienes leads activos.</div>}
              {leadsUsuario.map(l => {
                const estadoActual = normalizarTexto(l.estado);
                const color = estadoLeadColor[estadoActual] || 'cyan';
                const telefonoLead = telefonoParaLlamar(l.telefono);
                const idxActual = ESTADOS_LEAD_ORDER.indexOf(estadoActual);
                const siguienteEstado = idxActual >= 0 ? ESTADOS_LEAD_ORDER[idxActual + 1] : null;
                const siguienteLabel = siguienteEstado ? (MOV_CFG[siguienteEstado]?.titulo || siguienteEstado) : null;
                const esCalificado = estadoActual === 'calificado';
                return (
                  <div key={l.id} className="card" style={{padding:14, borderLeft:`3px solid var(--${color})`}}>
                    <div style={{cursor:'pointer'}} onClick={() => { setDrawerItem({ type: 'lead', data: l }); setDrawerTab('timeline'); }}>
                      <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                        <span className={`badge badge-${color}`} style={{fontSize:10, textTransform:'capitalize'}}>{l.estado || 'Nuevo'}</span>
                        <span style={{fontSize:12, fontWeight:600, color:'var(--fg-muted)'}}>{l.fecha_creacion?.substring(0,10) || ''}</span>
                      </div>
                      <div style={{fontWeight:700, fontSize:14, marginBottom:2}}>{l.nombre_contacto || l.nombre}</div>
                      <div className="text-muted" style={{fontSize:12, marginBottom:10}}>{l.empresa_nombre || l.empresa_contacto || 'Sin empresa'} {l.cargo ? `· ${l.cargo}` : ''}</div>
                    </div>
                    <div className="row" style={{justifyContent:'space-between', alignItems:'center', gap:6}}>
                      <a
                        className="btn btn-sm btn-secondary"
                        href={telefonoLead ? `tel:${telefonoLead}` : undefined}
                        aria-disabled={!telefonoLead}
                        onClick={e => { if (!telefonoLead) { e.preventDefault(); mostrarToast('El lead no tiene teléfono válido'); } }}
                        style={{fontSize:11, padding:'4px 8px'}}
                      >{I.phone} Llamar</a>
                      <div className="row" style={{gap:6}}>
                        {esCalificado ? (
                          <button className="btn btn-sm" style={{fontSize:11, padding:'4px 10px', background:'var(--green)', color:'#fff', border:'none'}}
                            onClick={() => abrirConvertirLead(l)}>
                            Convertir →
                          </button>
                        ) : siguienteLabel && (
                          <button className="btn btn-sm" style={{fontSize:11, padding:'4px 10px', background:'var(--cyan)', color:'#fff', border:'none'}}
                            onClick={() => abrirMovLead(l, siguienteEstado)}>
                            {siguienteLabel} →
                          </button>
                        )}
                        <button className="btn btn-sm" style={{fontSize:11, padding:'4px 10px', background:'var(--bg-subtle)', color:'var(--orange)', border:'1px solid var(--orange)'}}
                          onClick={() => abrirMovLead(l, 'descartado')}>
                          Descartar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {modalMovLead && (
                <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', zIndex:200, display:'flex', alignItems:'flex-end'}}
                  onClick={e => { if (e.target === e.currentTarget) { setModalMovLead(null); setMovMotivo(''); setMovError(''); setMovPresupuesto(''); setMovMoneda('PEN'); } }}>
                  <div style={{background:'var(--bg)', borderRadius:'16px 16px 0 0', padding:20, width:'100%', boxSizing:'border-box'}}>
                    <div style={{fontWeight:700, fontSize:15, marginBottom:12, color:'var(--navy)'}}>
                      {MOV_CFG[modalMovLead.destino]?.titulo || 'Cambiar estado'}
                    </div>
                    {modalMovLead.destino === 'calificado' && (
                      <div style={{marginBottom:12}}>
                        <div style={{fontSize:12, fontWeight:600, color:'var(--fg-muted)', marginBottom:6}}>Presupuesto estimado {!(modalMovLead.lead.presupuesto_estimado > 0) && <span style={{color:'var(--danger)'}}>*</span>}</div>
                        <div className="row" style={{gap:8}}>
                          <select
                            className="select"
                            value={movMoneda}
                            onChange={e => setMovMoneda(e.target.value)}
                            style={{width:90, flexShrink:0}}
                          >
                            {(monedasActivas?.length ? monedasActivas : [{codigo:'PEN'},{codigo:'USD'}]).map(m => (
                              <option key={m.codigo} value={m.codigo}>{m.codigo}</option>
                            ))}
                          </select>
                          <input
                            className="input"
                            type="number"
                            inputMode="decimal"
                            placeholder={modalMovLead.lead.presupuesto_estimado > 0 ? String(modalMovLead.lead.presupuesto_estimado) : 'Ej: 15000'}
                            value={movPresupuesto}
                            onChange={e => { setMovPresupuesto(e.target.value); setMovError(''); }}
                            style={{flex:1}}
                          />
                        </div>
                        {modalMovLead.lead.presupuesto_estimado > 0 && (
                          <div style={{fontSize:11, color:'var(--fg-subtle)', marginTop:4}}>
                            Actual: {modalMovLead.lead.moneda || 'PEN'} {Number(modalMovLead.lead.presupuesto_estimado).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                    <textarea
                      className="input"
                      rows={3}
                      placeholder={MOV_CFG[modalMovLead.destino]?.placeholder || 'Escribe el motivo...'}
                      value={movMotivo}
                      onChange={e => { setMovMotivo(e.target.value); setMovError(''); }}
                      style={{width:'100%', boxSizing:'border-box', marginBottom:6, ...(movError ? {borderColor:'var(--danger)'} : {})}}
                      autoFocus
                    />
                    {movError && <div style={{fontSize:12, color:'var(--danger)', marginBottom:8}}>{movError}</div>}
                    <div className="row" style={{gap:8, marginTop:4}}>
                      <button className="btn btn-secondary flex-1" onClick={() => { setModalMovLead(null); setMovMotivo(''); setMovError(''); setMovPresupuesto(''); setMovMoneda('PEN'); }}>Cancelar</button>
                      <button className="btn btn-primary flex-1" style={{background:'var(--green)', border:'none'}} onClick={confirmarMovLead}>Confirmar</button>
                    </div>
                  </div>
                </div>
              )}

              {modalConvertirLead && convertirForm && (
                <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', zIndex:210, display:'flex', alignItems:'flex-end'}}
                  onClick={e => { if (e.target === e.currentTarget) { setModalConvertirLead(null); setConvertirForm(null); } }}>
                  <div style={{background:'var(--bg)', borderRadius:'16px 16px 0 0', padding:18, width:'100%', boxSizing:'border-box', maxHeight:'88%', overflowY:'auto'}}>
                    <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12}}>
                      <div>
                        <div style={{fontWeight:800, fontSize:15, color:'var(--navy)'}}>Convertir a oportunidad</div>
                        <div className="text-muted" style={{fontSize:12, marginTop:2}}>Completa los datos faltantes para continuar el flujo.</div>
                      </div>
                      <button className="icon-btn" style={{width:30, height:30}} onClick={() => { setModalConvertirLead(null); setConvertirForm(null); }}>{I.x}</button>
                    </div>

                    <div className="col" style={{gap:12}}>
                      <div className="input-group">
                        <label>Nombre comercial *</label>
                        <input className="input" value={convertirForm.nombre_comercial} onChange={e => updateConvertirForm('nombre_comercial', e.target.value)} autoFocus />
                      </div>
                      <div className="input-group">
                        <label>Razon social *</label>
                        <input className="input" value={convertirForm.razon_social} onChange={e => updateConvertirForm('razon_social', e.target.value)} />
                      </div>
                      <div style={mobileFormGrid}>
                        <div className="input-group">
                          <label>RUC *</label>
                          <input className="input" inputMode="numeric" maxLength={11} value={convertirForm.ruc}
                            onChange={e => updateConvertirForm('ruc', sanitizeRuc(e.target.value))} placeholder="20xxxxxxxxx" />
                        </div>
                        <div className="input-group">
                          <label>Fuente *</label>
                          <select className="select" value={convertirForm.fuente} onChange={e => updateConvertirForm('fuente', e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {['Referido','Formulario web','LinkedIn','Evento / Feria','Cold outreach','Manual'].map(f => <option key={f}>{f}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="input-group">
                        <label>Industria *</label>
                        <select className="select" value={convertirForm.industria} onChange={e => updateConvertirForm('industria', e.target.value)}>
                          <option value="">Seleccionar...</option>
                          {(industrias || []).map(i => <option key={i.id || i.nombre} value={i.nombre || i}>{i.nombre || i}</option>)}
                          {(!industrias || industrias.length === 0) && ['Mineria','Industrial','Construccion','Servicios','Otro'].map(i => <option key={i}>{i}</option>)}
                        </select>
                      </div>

                      <div style={mobileFormGrid}>
                        <div className="input-group">
                          <label>Contacto *</label>
                          <input className="input" value={convertirForm.contacto_nombre} onChange={e => updateConvertirForm('contacto_nombre', e.target.value)} />
                        </div>
                        <div className="input-group">
                          <label>Cargo *</label>
                          <input className="input" value={convertirForm.contacto_cargo} onChange={e => updateConvertirForm('contacto_cargo', e.target.value)} />
                        </div>
                      </div>
                      <div style={mobileFormGrid}>
                        <div className="input-group">
                          <label>Celular *</label>
                          <input className="input" inputMode="numeric" maxLength={9} value={convertirForm.contacto_telefono}
                            onChange={e => updateConvertirForm('contacto_telefono', sanitizePhone(e.target.value))} placeholder="9XXXXXXXX" />
                        </div>
                        <div className="input-group">
                          <label>Email *</label>
                          <input className="input" type="email" value={convertirForm.contacto_email} onChange={e => updateConvertirForm('contacto_email', e.target.value)} />
                        </div>
                      </div>

                      <div className="input-group">
                        <label>Nombre oportunidad *</label>
                        <input className="input" value={convertirForm.nombre_oportunidad} onChange={e => updateConvertirForm('nombre_oportunidad', e.target.value)} />
                      </div>
                      <div style={mobileFormGrid}>
                        <div className="input-group">
                          <label>Monto *</label>
                          <input className="input" type="number" min="0" step="0.01" value={convertirForm.monto_estimado}
                            onChange={e => updateConvertirForm('monto_estimado', e.target.value)} />
                        </div>
                        <div className="input-group">
                          <label>Moneda</label>
                          <select className="select" value={convertirForm.moneda} onChange={e => updateConvertirForm('moneda', e.target.value)}>
                            {(monedasActivas?.length ? monedasActivas : [{ codigo: convertirForm.moneda, nombre: 'Moneda del lead' }]).map(m => (
                              <option key={m.codigo} value={m.codigo}>{m.codigo} - {m.nombre}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {convertirError && <div style={{fontSize:12, color:'var(--danger)', marginTop:10}}>{convertirError}</div>}
                    <div className="row" style={{gap:8, marginTop:14}}>
                      <button className="btn btn-secondary flex-1" onClick={() => { setModalConvertirLead(null); setConvertirForm(null); }}>Cancelar</button>
                      <button className="btn btn-primary flex-1" style={{background:'var(--green)', border:'none'}} onClick={confirmarConvertirLead}>
                        {I.check} Convertir
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : pipelineTab === 'opps' ? (
            <div className="col" style={{gap:10}}>
              {resumenEtapas.length > 0 && (
                <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:4}}>
                  {resumenEtapas.map(r => (
                    <div key={r.etapa} style={{background:'var(--bg-subtle)', borderRadius:10, padding:'10px 12px', borderLeft:`3px solid var(--${etapaColor[r.etapa] || 'cyan'})`}}>
                      <div style={{fontSize:10, color:`var(--${etapaColor[r.etapa] || 'cyan'})`, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, marginBottom:4}}>{ETAPA_LABELS[r.etapa]}</div>
                      {r.totalUSD > 0 && <div style={{fontSize:13, fontWeight:800, color:'var(--navy)', lineHeight:1.2}}>{moneyCurrency(r.totalUSD, 'USD')}</div>}
                      {r.totalPEN > 0 && <div style={{fontSize:13, fontWeight:800, color:'var(--navy)', lineHeight:1.2}}>{moneyCurrency(r.totalPEN, 'PEN')}</div>}
                      <div style={{fontSize:10, color:'var(--fg-muted)', marginTop:2}}>{r.count} opp{r.count !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {oppsUsuario.length === 0 && <div className="text-muted" style={{textAlign:'center', padding:30, fontSize:13}}>No tienes oportunidades abiertas.</div>}
              {oppsUsuario.map(o => {
                const cuenta = cuentas.find(c => c.id === o.cuenta_id);
                const etapaActual = etapaPipelineMobile(o);
                const color = etapaColor[etapaActual] || 'cyan';
                const etapaIdx = ETAPAS.indexOf(etapaActual);
                const nextEtapa = ETAPAS[etapaIdx + 1];
                const montoEfectivo = getOppMontoEfectivo(o);
                return (
                  <div key={o.id} className="card" style={{padding:14, borderLeft:`3px solid var(--${color})`}}>
                    <div style={{cursor:'pointer'}} onClick={() => { setDrawerItem({ type: 'opp', data: o }); setDrawerTab('timeline'); }}>
                      <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                        <span className={`badge badge-${color}`} style={{fontSize:10, textTransform:'capitalize'}}>{ETAPA_LABELS[etapaActual] || etapaActual}</span>
                        <span style={{fontSize:13, fontWeight:700, color:'var(--green-dk)'}}>{moneyCurrency(montoEfectivo.monto, montoEfectivo.moneda)}</span>
                      </div>
                      <div style={{fontWeight:700, fontSize:14, marginBottom:2}}>{o.nombre}</div>
                      <div className="text-muted" style={{fontSize:12, marginBottom:8}}>{cuenta?.razon_social || o.cuenta_id}</div>
                      <div className="bar" style={{marginBottom:6}}><div style={{width:`${o.probabilidad}%`, background:'var(--green)'}}/></div>
                    </div>
                    <div className="row" style={{justifyContent:'space-between', alignItems:'center', gap:6}}>
                      <div style={{fontSize:11, color:'var(--fg-muted)'}}>{o.probabilidad}% · {o.fecha_cierre_estimada}</div>
                      <div className="row" style={{gap:6}}>
                        <button className="btn btn-sm" style={{fontSize:11, padding:'4px 10px', background:'var(--bg-subtle)', color:'var(--orange)', border:'1px solid var(--orange)'}}
                          onClick={() => abrirPerderOpp(o)}>
                          Perdida
                        </button>
                        {nextEtapa && !['propuesta', 'negociacion', 'ganada'].includes(nextEtapa) && (
                          <button className="btn btn-sm btn-secondary" style={{fontSize:11}} onClick={() => actualizarEtapaOportunidad(o.id, nextEtapa)}>{nextEtapa} →</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {modalPerderOpp && (
                <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', zIndex:220, display:'flex', alignItems:'flex-end'}}
                  onClick={e => { if (e.target === e.currentTarget) setModalPerderOpp(null); }}>
                  <div style={{background:'var(--bg)', borderRadius:'16px 16px 0 0', padding:20, width:'100%', boxSizing:'border-box'}}>
                    <div style={{fontWeight:800, fontSize:15, marginBottom:4, color:'var(--navy)'}}>Marcar oportunidad perdida</div>
                    <div className="text-muted" style={{fontSize:12, marginBottom:12}}>{modalPerderOpp.nombre}</div>
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="Motivo de perdida: precio, competencia, sin presupuesto, timing..."
                      value={motivoPerdida}
                      onChange={e => { setMotivoPerdida(e.target.value); setPerdidaError(''); }}
                      style={{width:'100%', boxSizing:'border-box', marginBottom:6, ...(perdidaError ? {borderColor:'var(--danger)'} : {})}}
                      autoFocus
                    />
                    {perdidaError && <div style={{fontSize:12, color:'var(--danger)', marginBottom:8}}>{perdidaError}</div>}
                    <div className="row" style={{gap:8, marginTop:4}}>
                      <button className="btn btn-secondary flex-1" onClick={() => setModalPerderOpp(null)}>Cancelar</button>
                      <button className="btn btn-primary flex-1" style={{background:'var(--orange)', border:'none'}} onClick={confirmarPerderOpp}>
                        Confirmar perdida
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="col" style={{gap:10}}>
              {actsUsuario.length === 0 && <div className="text-muted" style={{textAlign:'center', padding:30, fontSize:13}}>No tienes actividades registradas.</div>}
              {actsUsuario.slice(0, 10).map(a => {
                const cuenta = cuentas.find(c => c.id === a.cuenta_id);
                const tipoColor = {llamada:'cyan', visita:'green', email:'purple', reunion:'orange', demo:'navy'}[a.tipo] || 'cyan';
                return (
                  <div key={a.id} className="card" style={{padding:14, borderLeft:`3px solid var(--${tipoColor})`}}>
                    <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                      <span className={`badge badge-${tipoColor}`} style={{fontSize:10, textTransform:'capitalize'}}>{a.tipo}</span>
                      <span className={'badge '+(a.estado==='completada'?'badge-green':'badge-cyan')} style={{fontSize:10}}>{a.estado}</span>
                    </div>
                    <div style={{fontWeight:700, fontSize:13, marginBottom:2}}>{cuenta?.razon_social || a.cuenta_id}</div>
                    <div className="text-muted" style={{fontSize:12, marginBottom:4}}>{(a.descripcion||'').substring(0, 80)}{(a.descripcion||'').length > 80 ? '…' : ''}</div>
                    <div style={{fontSize:11, color:'var(--fg-muted)'}}>{a.fecha}{a.hora ? ' · ' + a.hora : ''}</div>
                  </div>
                );
              })}
            </div>
          )}

          {drawerItem && (() => {
            const isLead = drawerItem.type === 'lead';
            const item = drawerItem.data;
            const hoyStr = new Date().toISOString().split('T')[0];
            const ayerStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            const tipoConfigDrw = {
              creacion:     { color: 'var(--cyan)',    icon: I.plus,      bg: 'rgba(6,182,212,0.12)' },
              estado:       { color: '#64748b',        icon: I.arrowUp,   bg: 'rgba(100,116,139,0.12)' },
              reactivacion: { color: 'var(--orange)',  icon: I.refresh,   bg: 'rgba(249,115,22,0.12)' },
              actividad:    { color: 'var(--navy)',    icon: I.clipboard, bg: 'rgba(26,43,74,0.12)' },
              conversion:   { color: 'var(--green)',   icon: I.check,     bg: 'rgba(16,185,129,0.12)' },
              cotizacion:   { color: '#7c3aed',        icon: I.file,      bg: 'rgba(124,58,237,0.10)' },
              agenda:       { color: 'var(--cyan)',    icon: I.calendar,  bg: 'rgba(6,182,212,0.12)' },
              etapa:        { color: '#64748b',        icon: I.arrowUp,   bg: 'rgba(100,116,139,0.12)' },
            };

            let eventos;
            if (isLead) {
              const actsLead = (actividades || []).filter(a => a.lead_id === item.id).map(a => ({
                id: `act-${a.id}`, tipo: 'actividad',
                fecha: a.fecha || hoyStr, ts: a.updated_at || a.created_at || null,
                titulo: `${a.tipo ? a.tipo.charAt(0).toUpperCase() + a.tipo.slice(1) : 'Actividad'}: ${(a.descripcion || 'Sin detalle').slice(0, 60)}`,
                descripcion: a.resultado || '', usuario: a.responsable || item.responsable || '—',
              }));
              const histLead = (historialEstados || []).filter(h => h.lead_id === item.id).map(h => {
                const esReact = h.estado_desde === 'descartado' && h.estado_hasta === 'en_contacto';
                return { id: `hist-${h.id}`, tipo: esReact ? 'reactivacion' : 'estado',
                  fecha: h.creado_en?.split('T')[0] || hoyStr, ts: h.creado_en || null,
                  titulo: esReact ? 'Lead reactivado' : `${(h.estado_desde||'').replace(/_/g,' ')} → ${(h.estado_hasta||'').replace(/_/g,' ')}`,
                  descripcion: h.motivo || '', usuario: item.responsable || '—' };
              });
              eventos = [
                { id: `crea-${item.id}`, tipo: 'creacion', fecha: item.fecha_creacion || hoyStr, ts: item.fecha_creacion || null,
                  titulo: 'Lead registrado', descripcion: `Origen: ${item.fuente || 'Manual'}`, usuario: item.responsable || 'Sistema' },
                ...(item.convertido ? [{ id: `conv-${item.id}`, tipo: 'conversion', fecha: item.fecha_creacion || hoyStr, ts: null,
                  titulo: 'Convertido a oportunidad', descripcion: '', usuario: item.responsable || 'Sistema' }] : []),
                ...actsLead, ...histLead,
              ];
            } else {
              const actsOpp = (actividades || []).filter(a => a.oportunidad_id === item.id).map(a => ({
                id: `act-${a.id}`, tipo: 'actividad',
                fecha: a.fecha || hoyStr, ts: a.updated_at || a.created_at || null,
                titulo: `${a.tipo ? a.tipo.charAt(0).toUpperCase() + a.tipo.slice(1) : 'Actividad'}: ${(a.descripcion || 'Sin detalle').slice(0, 60)}`,
                descripcion: a.resultado || '', usuario: a.responsable || item.responsable || '—',
              }));
              const evtsOpp = (agendaEventos || []).filter(e => e.oportunidad_id === item.id).map(e => ({
                id: `evt-${e.id}`, tipo: 'agenda',
                fecha: e.fecha || hoyStr, ts: null,
                titulo: e.titulo || 'Evento agendado',
                descripcion: `${e.tipo || 'Reunión'} · ${e.estado || ''}`,
                usuario: e.vendedor || item.responsable || '—',
              }));
              const cotsOpp = (cotizaciones || []).filter(c => c.oportunidad_id === item.id).map(c => ({
                id: `cot-${c.id}`, tipo: 'cotizacion',
                fecha: c.fecha || c.created_at?.slice(0, 10) || hoyStr, ts: c.created_at || null,
                titulo: `${c.numero || 'Cotización'} · v${c.version || 1}`,
                descripcion: `${moneyCurrency(c.total || c.subtotal || 0, c.moneda || 'PEN')} · ${c.estado || 'borrador'}`,
                usuario: item.responsable || '—',
                aprobacion: c.aprobada_interna_por ? { por: c.aprobada_interna_por, at: c.aprobada_interna_at } : null,
              }));
              const etapasOpp = (oppHistorialEtapas || []).filter(h => h.opp_id === item.id).map(h => ({
                id: `etapa-${h.id}`, tipo: 'etapa',
                fecha: h.creado_en?.split('T')[0] || hoyStr, ts: h.creado_en || null,
                titulo: `Etapa: ${(h.etapa_desde||'').replace(/_/g,' ')} → ${(h.etapa_hasta||'').replace(/_/g,' ')}`,
                descripcion: '', usuario: h.usuario || item.responsable || '—',
              }));
              eventos = [
                { id: `crea-${item.id}`, tipo: 'creacion',
                  fecha: item.fecha_creacion || item.created_at?.slice(0,10) || hoyStr, ts: item.created_at || null,
                  titulo: 'Oportunidad creada',
                  descripcion: `Monto estimado: ${moneyCurrency(item.monto_estimado || 0, item.moneda || 'PEN')}`,
                  usuario: item.responsable || 'Sistema' },
                ...actsOpp, ...evtsOpp, ...cotsOpp, ...etapasOpp,
              ];
            }

            eventos = eventos.sort((a, b) => (b.ts || b.fecha || '').localeCompare(a.ts || a.fecha || ''));

            const fmtLabel = f => {
              if (!f || f === hoyStr) return 'Hoy';
              if (f === ayerStr) return 'Ayer';
              return new Date(f + 'T12:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
            };
            const grupos = [];
            eventos.forEach(ev => {
              const lbl = fmtLabel(ev.fecha || hoyStr);
              if (!grupos.length || grupos[grupos.length-1].label !== lbl) grupos.push({ label: lbl, eventos: [] });
              grupos[grupos.length-1].eventos.push(ev);
            });

            const itemNombre = isLead ? (item.nombre_contacto || item.nombre) : item.nombre;
            const itemSub = isLead
              ? (item.empresa_nombre || item.empresa_contacto || '')
              : (cuentas.find(c => c.id === item.cuenta_id)?.razon_social || '');

            return (
              <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', zIndex:300, display:'flex', flexDirection:'column', justifyContent:'flex-end'}}
                onClick={e => { if (e.target === e.currentTarget) setDrawerItem(null); }}>
                <div style={{background:'var(--bg)', borderRadius:'16px 16px 0 0', width:'100%', boxSizing:'border-box', maxHeight:'90%', display:'flex', flexDirection:'column'}}>
                  <div style={{display:'flex', justifyContent:'center', paddingTop:10, paddingBottom:4}}>
                    <div style={{width:36, height:4, borderRadius:99, background:'var(--border)'}}/>
                  </div>
                  <div style={{padding:'6px 16px 0', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12}}>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:800, fontSize:15, color:'var(--navy)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{itemNombre}</div>
                      <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>{itemSub}</div>
                    </div>
                    <button className="icon-btn" style={{flexShrink:0, width:28, height:28}} onClick={() => setDrawerItem(null)}>{I.x}</button>
                  </div>
                  <div style={{display:'flex', borderBottom:'1px solid var(--border)', padding:'0 16px', marginTop:10}}>
                    <button onClick={() => setDrawerTab('info')} style={{flex:1, padding:'8px 0', fontSize:12, fontWeight:600, border:'none', background:'transparent', borderBottom: drawerTab==='info' ? '2px solid var(--navy)' : '2px solid transparent', color: drawerTab==='info' ? 'var(--navy)' : 'var(--fg-muted)', cursor:'pointer'}}>Info</button>
                    <button onClick={() => setDrawerTab('timeline')} style={{flex:1, padding:'8px 0', fontSize:12, fontWeight:600, border:'none', background:'transparent', borderBottom: drawerTab==='timeline' ? '2px solid var(--navy)' : '2px solid transparent', color: drawerTab==='timeline' ? 'var(--navy)' : 'var(--fg-muted)', cursor:'pointer'}}>
                      Timeline{eventos.length > 0 ? ` · ${eventos.length}` : ''}
                    </button>
                    {!isLead && (
                      <button onClick={() => setDrawerTab('comision')} style={{flex:1, padding:'8px 0', fontSize:12, fontWeight:600, border:'none', background:'transparent', borderBottom: drawerTab==='comision' ? '2px solid var(--navy)' : '2px solid transparent', color: drawerTab==='comision' ? 'var(--navy)' : 'var(--fg-muted)', cursor:'pointer', position:'relative'}}>
                        Comisión
                        {item?.acuerdo_estado === 'pendiente' && <span style={{position:'absolute', top:6, right:6, width:6, height:6, borderRadius:99, background:'var(--orange)'}}/>}
                        {item?.acuerdo_estado === 'rechazado' && <span style={{position:'absolute', top:6, right:6, width:6, height:6, borderRadius:99, background:'var(--danger)'}}/>}
                      </button>
                    )}
                  </div>
                  <div style={{overflowY:'auto', flex:1, padding:'14px 16px 32px'}}>
                    {drawerTab === 'info' && (
                      <div className="col" style={{gap:12}}>
                        {isLead ? (
                          <>
                            {item.necesidad && <div><div className="eyebrow" style={{fontSize:10}}>Necesidad</div><div style={{fontSize:13}}>{item.necesidad}</div></div>}
                            {item.telefono && <div><div className="eyebrow" style={{fontSize:10}}>Teléfono</div><div style={{fontSize:13}}>{item.telefono}</div></div>}
                            {item.email && <div><div className="eyebrow" style={{fontSize:10}}>Email</div><div style={{fontSize:13}}>{item.email}</div></div>}
                            {(item.presupuesto_estimado > 0) && <div><div className="eyebrow" style={{fontSize:10}}>Presupuesto</div><div style={{fontFamily:'Sora', fontWeight:700, fontSize:14}}>{moneyCurrency(item.presupuesto_estimado, item.moneda || 'PEN')}</div></div>}
                            <div><div className="eyebrow" style={{fontSize:10}}>Fuente</div><div style={{fontSize:13}}>{item.fuente || 'Manual'}</div></div>
                            <div><div className="eyebrow" style={{fontSize:10}}>Responsable</div><div style={{fontSize:13}}>{item.responsable || '—'}</div></div>
                          </>
                        ) : (
                          <>
                            {item.descripcion && <div><div className="eyebrow" style={{fontSize:10}}>Descripción</div><div style={{fontSize:13}}>{item.descripcion}</div></div>}
                            <div><div className="eyebrow" style={{fontSize:10}}>Etapa</div><div style={{fontSize:13, textTransform:'capitalize'}}>{item.etapa || '—'}</div></div>
                            <div><div className="eyebrow" style={{fontSize:10}}>Probabilidad</div><div style={{fontSize:13}}>{item.probabilidad || 0}%</div></div>
                            {item.fecha_cierre_estimada && <div><div className="eyebrow" style={{fontSize:10}}>Cierre estimado</div><div style={{fontSize:13}}>{item.fecha_cierre_estimada}</div></div>}
                            <div><div className="eyebrow" style={{fontSize:10}}>Responsable</div><div style={{fontSize:13}}>{item.responsable || '—'}</div></div>
                          </>
                        )}
                      </div>
                    )}
                    {drawerTab === 'timeline' && (
                      eventos.length === 0 ? (
                        <div style={{textAlign:'center', padding:'32px 0', color:'var(--fg-muted)', fontSize:13}}>Sin actividad registrada.</div>
                      ) : grupos.map((g, gi) => (
                        <div key={gi}>
                          <div style={{display:'flex', alignItems:'center', gap:8, margin:`${gi===0?0:8}px 0 12px`}}>
                            <div style={{flex:1, height:1, background:'var(--border)'}}/>
                            <span style={{fontSize:10, fontWeight:700, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap'}}>{g.label}</span>
                            <div style={{flex:1, height:1, background:'var(--border)'}}/>
                          </div>
                          {g.eventos.map((ev, ei) => {
                            const cfg = tipoConfigDrw[ev.tipo] || tipoConfigDrw.estado;
                            const isLastEv = gi === grupos.length-1 && ei === g.eventos.length-1;
                            return (
                              <div key={ev.id} style={{display:'flex', gap:10, alignItems:'flex-start'}}>
                                <div style={{display:'flex', flexDirection:'column', alignItems:'center', width:28, flex:'0 0 28px'}}>
                                  <div style={{width:26, height:26, borderRadius:99, background:cfg.bg, border:`1.5px solid ${cfg.color}`, display:'flex', alignItems:'center', justifyContent:'center', color:cfg.color, flex:'0 0 26px'}}>
                                    <span style={{width:11, height:11, display:'inline-flex'}}>{cfg.icon}</span>
                                  </div>
                                  {!isLastEv && <div style={{width:2, flex:1, background:'var(--border)', marginTop:3, minHeight:16}}/>}
                                </div>
                                <div style={{flex:1, paddingBottom: isLastEv ? 0 : 16}}>
                                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6, marginBottom:2}}>
                                    <div style={{fontWeight:700, fontSize:12, color:'var(--fg)', lineHeight:1.35}}>{ev.titulo}</div>
                                    <div style={{fontSize:10, color:'var(--fg-muted)', flexShrink:0}}>{ev.fecha}</div>
                                  </div>
                                  {ev.descripcion && <div style={{fontSize:11, color:'var(--fg-muted)', lineHeight:1.5}}>{ev.descripcion}</div>}
                                  {ev.aprobacion && (
                                    <div style={{display:'flex', alignItems:'center', gap:4, marginTop:4, fontSize:11, color:'var(--green-dk)', fontWeight:600}}>
                                      <span style={{width:11, height:11, display:'inline-flex'}}>{I.check}</span>
                                      Aprobada por {ev.aprobacion.por}
                                      {ev.aprobacion.at && <span style={{color:'var(--fg-muted)', fontWeight:400}}> · {ev.aprobacion.at.slice(0,10)}</span>}
                                    </div>
                                  )}
                                  <div style={{fontSize:10, color:'var(--fg-muted)', marginTop:4, display:'flex', alignItems:'center', gap:3}}>
                                    <span style={{width:10, height:10, display:'inline-flex', opacity:0.6}}>{I.users}</span>
                                    {ev.usuario}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                    {drawerTab === 'comision' && !isLead && (() => {
                      const opp = item;
                      const usarAuthComoFallback = esDelUsuario(opp.responsable) ||
                        opp.responsable_id === authUser?.id;
                      const vendedorPersonal = resolverVendedorComision({
                        oportunidad: opp,
                        usuarios,
                        personalAdmin,
                        authUser,
                        usuarioActual: usuarioMovil,
                        usarAuthComoFallback,
                      });
                      const pctBase = porcentajeBaseComision(vendedorPersonal);
                      const monedaSim = opp.moneda === 'USD' ? 'US$' : 'S/';
                      const estado = opp.acuerdo_estado || 'sin_acuerdo';
                      const editando = comisionEdit !== null;
                      const pctVal = editando ? (comisionEdit.pct ?? '') : (opp.acuerdo_pct ?? pctBase ?? '');
                      const bonVal = editando ? (comisionEdit.bonificacion ?? 0) : Number(opp.acuerdo_bonificacion || 0);
                      const justVal = editando ? (comisionEdit.justificacion ?? '') : (opp.acuerdo_justificacion || '');
                      const diffBase = pctBase !== null && pctVal !== '' && Number(pctVal) !== pctBase;
                      const hayBon = Number(bonVal) > 0;
                      const requiereAprobacion = hayBon || (pctBase !== null ? diffBase : Number(pctVal || 0) > 0);
                      const necesitaJustificacion = requiereAprobacion;
                      const justificacionLista = !necesitaJustificacion || String(justVal || '').trim().length > 0;
                      const bloqueado = estado === 'aprobado' || ['ganada','perdida'].includes(opp.etapa);
                      const ESTADO_COLOR = { sin_acuerdo:'var(--fg-muted)', borrador:'var(--fg-muted)', pendiente:'var(--orange)', aprobado:'var(--green)', rechazado:'var(--danger)' };
                      const ESTADO_LABEL = { sin_acuerdo:'Sin acuerdo especial', borrador:'Borrador', pendiente:'Pendiente de aprobación', aprobado:'Aprobado', rechazado:'Rechazado' };

                      const guardar = () => {
                        const pct = Number(comisionEdit.pct ?? opp.acuerdo_pct ?? pctBase ?? 0);
                        const bon = Number(comisionEdit.bonificacion ?? 0);
                        const justificacion = comisionEdit.justificacion || '';
                        const esBase = pctBase !== null && pct === pctBase && bon === 0;
                        const patch = {
                          acuerdo_pct: pct, acuerdo_bonificacion: bon,
                          acuerdo_justificacion: justificacion,
                          acuerdo_estado: esBase ? 'sin_acuerdo' : 'borrador',
                        };
                        actualizarAcuerdoComision(opp.id, patch);
                        patchDrawerOpp(opp.id, patch);
                        setComisionEdit(null);
                        mostrarToast(esBase ? 'Acuerdo restablecido a la base' : 'Borrador guardado');
                      };
                      const enviar = async () => {
                        const patch = { acuerdo_estado: 'pendiente', acuerdo_motivo_rechazo: null };
                        setComisionEnviando(true);
                        patchDrawerOpp(opp.id, patch);
                        try {
                          await enviarAcuerdoAAprobacion(opp.id);
                          mostrarToast('Propuesta enviada a aprobacion');
                        } finally {
                          setComisionEnviando(false);
                        }
                      };
                      const retirar = () => {
                        const patch = { acuerdo_estado: 'borrador' };
                        retirarAcuerdoComision(opp.id);
                        patchDrawerOpp(opp.id, patch);
                        mostrarToast('Solicitud retirada');
                      };

                      return (
                        <div className="col" style={{gap:14}}>
                          {/* Estado */}
                          <div style={{display:'flex', alignItems:'center', gap:8, justifyContent:'space-between'}}>
                            <span style={{fontSize:12, fontWeight:700, color:ESTADO_COLOR[estado] || 'var(--fg-muted)'}}>
                              {ESTADO_LABEL[estado] || estado}
                            </span>
                            {estado === 'aprobado' && opp.acuerdo_aprobado_por && (
                              <span style={{fontSize:11, color:'var(--fg-muted)'}}>por {opp.acuerdo_aprobado_por}</span>
                            )}
                          </div>

                          {/* Rechazo */}
                          {estado === 'rechazado' && opp.acuerdo_motivo_rechazo && (
                            <div style={{background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--danger)'}}>
                              <strong>Motivo:</strong> {opp.acuerdo_motivo_rechazo}
                            </div>
                          )}

                          {/* % base de referencia */}
                          {pctBase !== null && (
                            <div style={{fontSize:12, color:'var(--fg-muted)'}}>
                              Tu comisión base es <strong>{pctBase}%</strong>
                            </div>
                          )}

                          {/* Campos */}
                          {(editando || !bloqueado) && (
                            <div className="col" style={{gap:10}}>
                              <div className="input-group" style={{marginBottom:0}}>
                                <label style={{fontSize:11}}>% Comisión propuesto</label>
                                {editando ? (
                                  <>
                                    <input type="number" min="0" max="100" step="0.01" className="input"
                                      value={pctVal}
                                      onChange={e => setComisionEdit(p => ({...p, pct: e.target.value}))}
                                    />
                                    {diffBase && pctBase !== null && (
                                      <div style={{marginTop:4, fontSize:11, color:'#c2410c', background:'rgba(249,115,22,0.08)', borderRadius:6, padding:'4px 8px', lineHeight:1.4}}>
                                        Difiere del base ({pctBase}%) — requiere aprobación del Gerente.
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div style={{fontSize:14, fontWeight:700, color:'var(--navy)', padding:'6px 0'}}>{pctVal !== '' ? `${pctVal}%` : '—'}</div>
                                )}
                              </div>
                              <div className="input-group" style={{marginBottom:0}}>
                                <label style={{fontSize:11}}>Bonificación adicional ({monedaSim})</label>
                                {editando ? (
                                  <>
                                    <input type="number" min="0" step="0.01" className="input"
                                      value={bonVal}
                                      onChange={e => setComisionEdit(p => ({...p, bonificacion: e.target.value}))}
                                    />
                                    {hayBon && (
                                      <div style={{marginTop:4, fontSize:11, color:'#c2410c', background:'rgba(249,115,22,0.08)', borderRadius:6, padding:'4px 8px', lineHeight:1.4}}>
                                        Bonificación de {monedaSim} {Number(bonVal).toFixed(2)} — requiere aprobación.
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div style={{fontSize:14, fontWeight:700, color: hayBon ? 'var(--orange)' : 'var(--fg-muted)', padding:'6px 0'}}>{hayBon ? `${monedaSim} ${Number(bonVal).toFixed(2)}` : '—'}</div>
                                )}
                              </div>
                              {(necesitaJustificacion || editando) && (
                                <div className="input-group" style={{marginBottom:0}}>
                                  <label style={{fontSize:11}}>Justificación {necesitaJustificacion ? <span style={{color:'var(--danger)'}}>*</span> : ''}</label>
                                  {editando ? (
                                    <textarea className="input" rows={2} placeholder="Ej: Cliente estratégico con contrato multianual"
                                      value={justVal}
                                      onChange={e => setComisionEdit(p => ({...p, justificacion: e.target.value}))}
                                      style={{resize:'none'}}
                                    />
                                  ) : (
                                    <div style={{fontSize:12, color:'var(--fg-muted)', padding:'4px 0'}}>{justVal || '—'}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Botones */}
                          {bloqueado ? (
                            <div style={{fontSize:11, color:'var(--fg-muted)', fontStyle:'italic', textAlign:'center'}}>
                              {['ganada','perdida'].includes(opp.etapa) ? 'Oportunidad cerrada.' : 'Acuerdo aprobado — no editable.'}
                            </div>
                          ) : editando ? (
                            <div className="col" style={{gap:8}}>
                              <button className="btn btn-primary" style={{width:'100%', justifyContent:'center'}} disabled={!justificacionLista} onClick={guardar}>
                                Guardar borrador
                              </button>
                              {!justificacionLista && (
                                <div style={{fontSize:11, color:'var(--danger)', textAlign:'center'}}>La justificación es obligatoria para enviar un acuerdo especial.</div>
                              )}
                              <button className="btn btn-ghost" style={{width:'100%', justifyContent:'center'}} onClick={() => setComisionEdit(null)}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="col" style={{gap:8}}>
                              {['sin_acuerdo','borrador','rechazado'].includes(estado) && (
                                <button className="btn btn-secondary" style={{width:'100%', justifyContent:'center'}}
                                  onClick={() => setComisionEdit({ pct: opp.acuerdo_pct ?? pctBase ?? '', bonificacion: opp.acuerdo_bonificacion ?? 0, justificacion: opp.acuerdo_justificacion ?? '' })}>
                                  {estado === 'sin_acuerdo' ? 'Proponer acuerdo especial' : 'Editar propuesta'}
                                </button>
                              )}
                              {['borrador','rechazado'].includes(estado) && requiereAprobacion && (
                                <button className="btn btn-primary" style={{width:'100%', justifyContent:'center', background:'var(--orange)', borderColor:'var(--orange)'}}
                                  disabled={comisionEnviando || !justificacionLista}
                                  onClick={enviar}>
                                  {comisionEnviando ? 'Enviando...' : 'Enviar a aprobación'}
                                </button>
                              )}
                              {['borrador','rechazado'].includes(estado) && requiereAprobacion && !justificacionLista && (
                                <div style={{fontSize:11, color:'var(--danger)', textAlign:'center'}}>Agrega una justificación para enviarla.</div>
                              )}
                              {estado === 'pendiente' && (
                                <>
                                  <div style={{fontSize:12, color:'var(--fg-muted)', fontStyle:'italic', textAlign:'center', padding:'4px 0'}}>
                                    Esperando aprobación del Gerente Comercial
                                  </div>
                                  <button className="btn btn-ghost" style={{width:'100%', justifyContent:'center', color:'var(--fg-muted)', fontSize:12}}
                                    onClick={retirar}>
                                    Retirar solicitud
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      ) : screen === 'nueva-actividad' ? (
        <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'var(--bg)', padding:20, zIndex:10, overflowY:'auto'}}>
          <div onClick={()=>setScreen('home')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:16,cursor:'pointer'}}>← Volver</div>
          <h2 className="font-display" style={{marginBottom:16}}>Nueva Actividad</h2>
          <form className="col" style={{gap:14}} onSubmit={submitNuevaActividad}>
            <div className="input-group">
              <label>Tipo</label>
              <select name="tipo" className="select" required defaultValue="llamada">
                <option value="llamada">Llamada</option>
                <option value="visita">Visita presencial</option>
                <option value="email">Email</option>
                <option value="reunion">Reunión</option>
                <option value="demo">Demo</option>
              </select>
            </div>
            <div className="input-group">
              <label>Cliente</label>
              <select name="cuenta_id" className="select" required defaultValue="cta_001">
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
              </select>
            </div>
            <div className="grid-2">
              <div className="input-group">
                <label>Fecha</label>
                <input name="fecha" type="date" className="input" defaultValue={today} required />
              </div>
              <div className="input-group">
                <label>Hora</label>
                <input name="hora" type="time" className="input" defaultValue="10:00" />
              </div>
            </div>
            <div className="input-group">
              <label>Descripción *</label>
              <textarea name="descripcion" className="input" placeholder="¿Qué se trató?" rows={3} style={{resize:'none'}} required />
            </div>
            <div className="input-group">
              <label>Resultado</label>
              <textarea name="resultado" className="input" placeholder="¿Cuál fue el resultado?" rows={2} style={{resize:'none'}} />
            </div>
            <div className="input-group">
              <label>Próxima acción</label>
              <input name="proxima_accion" type="text" className="input" placeholder="Ej: Enviar cotización esta semana" />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{width:'100%', marginTop:6}}>Registrar Actividad</button>
          </form>
        </div>
      ) : screen === 'notificaciones' ? (
        <>
          <div className="row" style={{justifyContent:'space-between', marginBottom:12}}>
            <div>
              <div className="eyebrow">Notificaciones</div>
              <div className="text-muted" style={{fontSize:12, marginTop:2}}>{notificaciones.length} avisos recientes</div>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={probarNotificacion}>{I.bell} Probar</button>
          </div>

          <div className="card" style={{padding:14, marginBottom:12}}>
            <div className="row" style={{justifyContent:'space-between', gap:12}}>
              <div>
                <div style={{fontWeight:700, fontSize:13}}>Push del navegador</div>
                <div className="text-muted" style={{fontSize:12}}>
                  {permisoNotificacion === 'granted' ? 'Permiso concedido' : permisoNotificacion === 'denied' ? 'Bloqueado por el navegador' : 'Pendiente de activar'}
                </div>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={solicitarPermisoNotificaciones} disabled={permisoNotificacion === 'granted'}>
                {I.bell} Activar
              </button>
            </div>
          </div>

          <div className="col" style={{gap:8}}>
            {notificaciones.length === 0 && (
              <div className="card" style={{padding:18, textAlign:'center'}}>
                <div className="text-muted" style={{fontSize:13}}>No hay notificaciones.</div>
              </div>
            )}
            {notificaciones.map(n => (
              <div key={n.id} className="card" style={{padding:12, borderLeft:`3px solid ${n.read ? 'var(--border)' : 'var(--cyan)'}`}}>
                <div className="row" style={{gap:10, alignItems:'flex-start'}}>
                  <div className="kpi-icon cyan" style={{position:'static', width:32, height:32, flexShrink:0}}>{I.bell}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13, fontWeight:n.read ? 500 : 700, lineHeight:1.35}}>{n.text}</div>
                    <div className="text-muted" style={{fontSize:11, marginTop:4}}>{n.time || 'Reciente'}</div>
                  </div>
                  {!n.read && <span className="health-dot health-green" style={{marginTop:5}}/>}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : screen === 'ajustes' ? (
        <>
          <div className="eyebrow" style={{marginBottom:12}}>Ajustes</div>
          <div className="card" style={{padding:14, marginBottom:12}}>
            <div className="row" style={{gap:10, alignItems:'center'}}>
              <div className="avatar" style={{width:38,height:38}}>{usuarioMovil.iniciales}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontWeight:700, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{usuarioMovil.nombre}</div>
                <div className="text-muted" style={{fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{usuarioMovil.email || 'Sin email registrado'}</div>
              </div>
            </div>
          </div>

          <div className="col" style={{gap:10}}>
            <button className="card hover-raise row" style={{padding:12, cursor:'pointer', width:'100%'}} onClick={abrirNotificaciones}>
              <div className="kpi-icon cyan" style={{position:'static', width:34, height:34}}>{I.bell}</div>
              <div style={{flex:1, textAlign:'left', marginLeft:10}}>
                <div style={{fontWeight:700, fontSize:13}}>Centro de notificaciones</div>
                <div className="text-muted" style={{fontSize:11}}>{unreadCount ? `${unreadCount} avisos sin leer` : 'Sin avisos pendientes'}</div>
              </div>
              {unreadCount > 0 && <span className="badge badge-orange">{unreadCount}</span>}
            </button>

            <div className="card" style={{padding:14}}>
              <div className="eyebrow" style={{marginBottom:10}}>Empresa y sincronizacion</div>
              <div className="row" style={{justifyContent:'space-between', gap:12, marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700, fontSize:13}}>{empresa?.nombre || empresa?.razon_social || 'Empresa activa'}</div>
                  <div className="text-muted" style={{fontSize:12}}>{online ? 'Online' : 'Offline'} · {sincronizacionEstado}</div>
                </div>
                <span className={'badge '+(online && supabaseStatus?.connected ? 'badge-green' : 'badge-cyan')}>{dataMode}</span>
              </div>
              <button
                className="btn btn-sm btn-secondary"
                style={{width:'100%'}}
                onClick={() => mostrarToast(online ? 'Datos sincronizados' : 'Sin conexion para sincronizar')}
              >
                {I.download} Sincronizar ahora
              </button>
            </div>

            <div className="card" style={{padding:14}}>
              <div className="eyebrow" style={{marginBottom:10}}>Preferencias</div>
              <div className="row" style={{justifyContent:'space-between', gap:12, marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700, fontSize:13}}>Tema</div>
                  <div className="text-muted" style={{fontSize:12}}>{dark ? 'Oscuro' : 'Claro'}</div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => setDark(!dark)}>{dark ? I.sun : I.moon} Cambiar</button>
              </div>
              <div className="row" style={{justifyContent:'space-between', gap:12}}>
                <div>
                  <div style={{fontWeight:700, fontSize:13}}>Notificaciones</div>
                  <div className="text-muted" style={{fontSize:12}}>{notificacionesCampo ? 'Activas' : 'Silenciadas'}</div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => setNotificacionesCampo(v => !v)}>{I.bell} {notificacionesCampo ? 'Silenciar' : 'Activar'}</button>
              </div>
            </div>

            <div className="card" style={{padding:14}}>
              <div className="eyebrow" style={{marginBottom:10}}>Perfil movil</div>
              <select
                className="select"
                value={profile || 'vendedor'}
                onChange={e => {
                  setProfile(e.target.value);
                  setScreen('home');
                }}
              >
                <option value="tecnico">Tecnico</option>
                <option value="logistica">Logistica</option>
                <option value="vendedor">Vendedor</option>
                <option value="compras">Compras</option>
                <option value="supervisor">Supervisor</option>
                <option value="gerencia">Gerencia</option>
              </select>
            </div>

            <div className="card" style={{padding:14}}>
              <div className="eyebrow" style={{marginBottom:10}}>Permisos del celular</div>
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                <span style={{fontSize:13}}>Camara</span>
                <span className={'badge '+(puedeUsarCamara ? 'badge-green' : 'badge-orange')}>{puedeUsarCamara ? 'Disponible' : 'Revisar'}</span>
              </div>
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                <span style={{fontSize:13}}>Llamadas</span>
                <span className={'badge '+(puedeLlamar ? 'badge-green' : 'badge-orange')}>{puedeLlamar ? 'Disponible' : 'Revisar'}</span>
              </div>
              <div className="row" style={{justifyContent:'space-between'}}>
                <span style={{fontSize:13}}>Conexion</span>
                <span className={'badge '+(online ? 'badge-green' : 'badge-orange')}>{online ? 'Online' : 'Offline'}</span>
              </div>
            </div>

            <div className="row" style={{gap:8}}>
              <button className="btn btn-secondary flex-1" onClick={onExit}>{I.mobile} Salir campo</button>
              <button className="btn btn-secondary flex-1" style={{color:'var(--danger)'}} onClick={signOut}>{I.power} Cerrar sesion</button>
            </div>
          </div>
        </>
      ) : null}
      {toast && (
        <div style={{position:'absolute', bottom:72, left:16, right:16, background:'var(--green)', color:'#fff', padding:'10px 16px', borderRadius:8, fontSize:13, fontWeight:600, textAlign:'center', zIndex:20}}>
          {toast}
        </div>
      )}
    </div>
    <div className="mobile-nav">
      <div className={`mobile-nav-item ${screen==='home'||screen==='clientes'?'active':''}`} onClick={()=>setScreen('clientes')}>{I.home}Clientes</div>
      <div className={`mobile-nav-item ${screen==='pipeline'?'active':''}`} onClick={() => setScreen('pipeline')}>{I.pipe}Pipeline</div>
      <div className={`mobile-nav-item ${screen==='agenda'||screen==='nuevo-evento'?'active':''}`} onClick={()=>setScreen('agenda')}>{I.calendar}Agenda</div>
      <div className={`mobile-nav-item ${screen==='ajustes'||screen==='notificaciones'?'active':''}`} onClick={()=>setScreen('ajustes')}>{I.settings}Ajustes</div>
    </div>
  </>;
}

function ComprasView({ screen, setScreen }) {
  const {
    authUser, usuarios, crearGasto, generarCxP, ots, centrosCosto, empresa,
    perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles = [],
  } = useApp();
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const fileInputRef = useRef(null);
  const modoVistaSociedadCompras = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });

  const [paso, setPaso] = useState('inicio');
  const [fotoUrl, setFotoUrl] = useState('');
  const [campos, setCampos] = useState({ ruc:'', proveedor:'', num_factura:'', fecha_emision: new Date().toISOString().split('T')[0], monto_sin_igv:'', igv:'', monto_total:'' });
  const [extractError, setExtractError] = useState(false);
  const [otId, setOtId] = useState('');
  const [cecoId, setCecoId] = useState('');
  const [genCxP, setGenCxP] = useState(false);
  const [cxpVence, setCxpVence] = useState('');
  const [guardando, setGuardando] = useState(false);

  const setC = (k, v) => setCampos(p => ({ ...p, [k]: v }));
  const ESTADOS_CERRADOS = ['cerrada','cerrada_tecnica','anulada','valorizada','facturada','cerrado_conforme'];
  const otsActivas = (ots || [])
    .filter(o => !ESTADOS_CERRADOS.includes(o.estado) && (!empresa?.id || !o.empresa_id || o.empresa_id === empresa.id))
    .filter(o => !modoVistaSociedadCompras.sociedadIdEscritura || o.sociedad_id === modoVistaSociedadCompras.sociedadIdEscritura);
  const cecosActivos = (centrosCosto || [])
    .filter(c => c.estado === 'activo')
    .filter(c => !modoVistaSociedadCompras.sociedadIdEscritura || c.sociedad_id === modoVistaSociedadCompras.sociedadIdEscritura);

  const reiniciar = () => {
    if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    setFotoUrl(''); setExtractError(false); setOtId(''); setCecoId(''); setGenCxP(false); setCxpVence(''); setGuardando(false);
    setCampos({ ruc:'', proveedor:'', num_factura:'', fecha_emision: new Date().toISOString().split('T')[0], monto_sin_igv:'', igv:'', monto_total:'' });
    setPaso('inicio');
  };

  const analizarFoto = async (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFotoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
    setExtractError(false);
    setPaso('analizando');
    try {
      const imageBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const sb = await getSupabaseClient();
      const { data: fnData, error: fnError } = await sb.functions.invoke('extraer-factura', { body: { imageBase64 } });
      if (fnError || !fnData?.success) throw new Error('failed');
      const d = fnData.data || {};
      setCampos({
        ruc: d.ruc || '',
        proveedor: d.proveedor || '',
        num_factura: d.num_factura || '',
        fecha_emision: d.fecha_emision || new Date().toISOString().split('T')[0],
        monto_sin_igv: d.monto_sin_igv != null ? String(d.monto_sin_igv) : '',
        igv: d.igv != null ? String(d.igv) : '',
        monto_total: d.monto_total != null ? String(d.monto_total) : '',
      });
    } catch {
      setExtractError(true);
      setCampos({ ruc:'', proveedor:'', num_factura:'', fecha_emision: new Date().toISOString().split('T')[0], monto_sin_igv:'', igv:'', monto_total:'' });
    }
    setPaso('revision');
  };

  const guardar = async () => {
    if (!cecoId || (genCxP && !cxpVence)) return;
    setGuardando(true);
    try {
      const monto = parseFloat(campos.monto_total) || parseFloat(campos.monto_sin_igv) || 0;
      const gastoBase = {
        descripcion: campos.proveedor || 'Gasto en campo',
        categoria: 'Materiales',
        monto, moneda: 'PEN',
        fecha: campos.fecha_emision || new Date().toISOString().split('T')[0],
        num_comprobante: campos.num_factura || '',
        tipo_comprobante: 'Factura',
        centro_costo_id: cecoId,
        tipo: 'gasto', campo: true,
        ruc_proveedor: campos.ruc || '',
        ot_id: otId || null,
      };
      if (genCxP) {
        const cxpId = `cxp_${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
        await generarCxP({
          id: cxpId, proveedor_id: null, tipo_beneficiario: 'proveedor',
          factura_numero: campos.num_factura || null,
          concepto: campos.proveedor || 'Gasto en campo',
          fecha_emision: campos.fecha_emision, fecha_vencimiento: cxpVence,
          monto_total: monto, moneda: 'PEN', estado: 'por_pagar', origen: 'gasto',
          categoria_er: gastoBase.categoria, centro_costo_id: gastoBase.centro_costo_id,
          ot_vinc_id: otId || null,
        });
      } else {
        crearGasto(gastoBase);
      }
      setPaso('guardado');
    } finally {
      setGuardando(false);
    }
  };

  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Compras</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>{usuarioMovil.nombre}</div></div>
      <div className="avatar" style={{width:34,height:34}}>{usuarioMovil.iniciales}</div>
    </div>

    <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{display:'none'}}
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) analizarFoto(f); }}/>

    {paso === 'inicio' && (
      <div className="mobile-content">
        <div className="eyebrow" style={{marginBottom:10}}>Capturar factura · Paso 1 de 2</div>
        <div className="bar" style={{marginBottom:16}}><div style={{width:'33%',background:'var(--cyan)'}}/></div>
        <div className="card" style={{padding:32,textAlign:'center',cursor:'pointer',borderStyle:'dashed'}} onClick={() => fileInputRef.current?.click()}>
          <div className="mobile-icon-lg" style={{color:'var(--cyan)'}}>{I.camera}</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Fotografiar factura</div>
          <div style={{fontSize:12,color:'var(--fg-muted)'}}>La IA extraerá los datos automáticamente</div>
        </div>
        <button className="btn btn-secondary" style={{width:'100%',marginTop:12}}
          onClick={() => { setCampos(c => ({...c, fecha_emision: new Date().toISOString().split('T')[0]})); setPaso('revision'); }}>
          Ingresar datos manualmente
        </button>
      </div>
    )}

    {paso === 'analizando' && (
      <div className="mobile-content" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:300,gap:14}}>
        <div style={{fontSize:36,color:'var(--cyan)'}}>{I.sparkles}</div>
        <div style={{fontWeight:700,fontSize:15}}>Analizando factura...</div>
        <div style={{fontSize:12,color:'var(--fg-muted)',textAlign:'center'}}>Analizando documento...</div>
      </div>
    )}

    {paso === 'revision' && (
      <div className="mobile-content">
        <div className="eyebrow" style={{marginBottom:10}}>Verificar y guardar · Paso 2 de 2</div>
        <div className="bar" style={{marginBottom:12}}><div style={{width:'100%',background:'var(--cyan)'}}/></div>

        {extractError && (
          <div style={{background:'var(--orange-lt,#fff7ed)',color:'var(--orange-dk,#92400e)',border:'1px solid var(--orange)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:12}}>
            No se pudo leer la factura automáticamente. Completa los datos manualmente.
          </div>
        )}

        {fotoUrl && <img src={fotoUrl} alt="Factura" style={{width:'100%',borderRadius:8,marginBottom:12,maxHeight:140,objectFit:'cover'}}/>}

        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {[['ruc','RUC proveedor','20512345678','text'],['proveedor','Proveedor','Ferretería Industrial SAC','text'],['num_factura','N° Factura','F001-0001','text']].map(([k,l,ph,t]) => (
            <div key={k}>
              <div className="eyebrow row" style={{gap:4,marginBottom:3}}><span className="badge badge-purple" style={{fontSize:8,padding:'0 4px'}}>IA</span>{l}</div>
              <input className="input" type={t} value={campos[k]} onChange={e=>setC(k,e.target.value)} placeholder={ph}/>
            </div>
          ))}
          <div>
            <div className="eyebrow row" style={{gap:4,marginBottom:3}}><span className="badge badge-purple" style={{fontSize:8,padding:'0 4px'}}>IA</span>Fecha emisión</div>
            <input className="input" type="date" value={campos.fecha_emision} onChange={e=>setC('fecha_emision',e.target.value)}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {[['monto_sin_igv','Sin IGV'],['igv','IGV'],['monto_total','Total *']].map(([k,l]) => (
              <div key={k}>
                <div style={{fontSize:10,color:'var(--fg-muted)',marginBottom:3,display:'flex',gap:3,alignItems:'center'}}><span className="badge badge-purple" style={{fontSize:8,padding:'0 3px'}}>IA</span>{l}</div>
                <input className="input" type="number" step="0.01" value={campos[k]} onChange={e=>setC(k,e.target.value)} placeholder="0.00"/>
              </div>
            ))}
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>OT asignada</div>
            <select className="select" value={otId} onChange={e=>setOtId(e.target.value)}>
              <option value="">— Sin OT —</option>
              {otsActivas.map(o=><option key={o.id} value={o.id}>{o.numero||o.id}{o.descripcion?` – ${o.descripcion}`:''}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Centro de Costo <span style={{color:'var(--danger)'}}>*</span></div>
            <select className="select" value={cecoId} onChange={e=>setCecoId(e.target.value)}>
              <option value="">— Seleccionar CECO —</option>
              {cecosActivos.map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
            </select>
          </div>
          <div style={{background:'var(--bg-subtle)',borderRadius:8,padding:'10px 12px'}}>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',margin:0}}>
              <input type="checkbox" checked={genCxP} onChange={e=>setGenCxP(e.target.checked)}/>
              <span style={{fontWeight:600,fontSize:13}}>Generar Cuenta por Pagar</span>
            </label>
            {genCxP && (
              <div style={{marginTop:10}}>
                <div style={{fontSize:12,marginBottom:4}}>Fecha vencimiento <span style={{color:'var(--danger)'}}>*</span></div>
                <input className="input" type="date" value={cxpVence} onChange={e=>setCxpVence(e.target.value)}/>
              </div>
            )}
          </div>
        </div>

        <div className="row mt-6" style={{gap:8}}>
          <button className="btn btn-secondary" onClick={reiniciar}>Nueva foto</button>
          <button className="btn btn-primary flex-1" onClick={guardar} disabled={guardando || !cecoId || (genCxP && !cxpVence)}>
            {guardando ? 'Guardando...' : <>{I.check} Guardar gasto</>}
          </button>
        </div>
      </div>
    )}

    {paso === 'guardado' && (
      <div className="mobile-content" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:300,gap:16,textAlign:'center'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:'var(--green-lt,#f0fdf4)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--green)'}}>
          {I.check}
        </div>
        <div style={{fontWeight:700,fontSize:16}}>Gasto guardado</div>
        <div style={{fontSize:13,color:'var(--fg-muted)'}}>
          {campos.proveedor || 'Gasto en campo'} — {campos.monto_total ? `S/ ${campos.monto_total}` : ''}
          {genCxP && <div style={{marginTop:4,fontSize:12}}>CxP generada</div>}
        </div>
        <button className="btn btn-primary" style={{marginTop:8}} onClick={reiniciar}>
          {I.camera} Nueva captura
        </button>
      </div>
    )}

    <div className="mobile-nav">
      <div className="mobile-nav-item active">{I.camera}Capturar</div>
      <div className="mobile-nav-item">{I.list}Historial</div>
      <div className="mobile-nav-item">{I.settings}Ajustes</div>
    </div>
  </>;
}

function SupervisorView({ screen, setScreen }) {
  const { partes, ots, personalOperativo, aprobarParteDiario, authUser, usuarios } = useApp();
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const pendientes = partes.filter(p => p.estado === 'en_revision' || p.estado === 'observado');
  const equipoActivo = personalOperativo.filter(p => !['vacaciones', 'inactivo', 'baja'].includes(p.estado)).slice(0, 4);
  const getOtNumero = id => ots.find(o => o.id === id)?.numero || id;
  const getTecnicoNombre = id => personalOperativo.find(p => p.id === id)?.nombre || id;

  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Supervisor</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>{usuarioMovil.nombre}</div></div>
      <div className="avatar" style={{width:34,height:34}}>{usuarioMovil.iniciales}</div>
    </div>
    <div className="mobile-content">
      <div className="eyebrow" style={{marginBottom:10}}>Partes pendientes - {pendientes.length}</div>
      {pendientes.map(p=>(
        <div key={p.id} className="card" style={{padding:14,marginBottom:10}}>
          <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
            <div className="mono" style={{fontSize:11,color:'var(--fg-muted)',fontWeight:600}}>{p.id} - {getOtNumero(p.ot_id)}</div>
            <span className="badge badge-cyan">{I.mobile}Campo</span>
          </div>
          <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{getTecnicoNombre(p.tecnico_id || p.tecnico)}</div>
          <div className="text-muted" style={{fontSize:12,marginBottom:10}}>{p.horas}h trabajadas · avance {p.avance_reportado || p.avance || 0}% · {(p.evidencias?.length || p.fotos || 0)} fotos</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4,marginBottom:10}}>
            {Array.from({length:Math.max(1, Math.min(p.evidencias?.length || p.fotos || 1,3))}).map((_,i)=>(<div key={i} style={{aspectRatio:'1',background:'linear-gradient(135deg,#1A2B4A,#0F1B30)',borderRadius:6,color:'rgba(255,255,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center'}}>{I.camera}</div>))}
          </div>
          <div className="row" style={{gap:6}}>
            <button className="btn btn-sm btn-primary flex-1" onClick={() => aprobarParteDiario(p.id)}>{I.check}Aprobar</button>
            <button className="btn btn-sm btn-secondary flex-1" style={{background:'var(--orange-lt)',color:'var(--orange-dk)',borderColor:'var(--orange)'}}>Observar</button>
          </div>
        </div>
      ))}
      <div className="eyebrow" style={{margin:'16px 0 8px'}}>Equipo activo hoy</div>
      <div className="card" style={{padding:14}}>
        {equipoActivo.map((p,i)=>(
          <div key={i} className="row" style={{padding:'6px 0',borderBottom:i<2?'1px solid var(--border-subtle)':'',fontSize:12}}>
            <span style={{width:6,height:6,borderRadius:999,background:'var(--green)'}}/><span style={{marginLeft:8}}>{p.nombre} - {p.estado}</span>
          </div>
        ))}
      </div>
    </div>
    <div className="mobile-nav">
      <div className="mobile-nav-item active">{I.check}Aprobar</div>
      <div className="mobile-nav-item">{I.mapPin}Equipo</div>
      <div className="mobile-nav-item">{I.alert}Alertas</div>
      <div className="mobile-nav-item">{I.settings}Ajustes</div>
    </div>
  </>;
}

function GerenciaView({ screen, setScreen }) {
  const { ots, cotizaciones, authUser, usuarios, oportunidades, personalAdmin, aprobarAcuerdoComision, rechazarAcuerdoComision } = useApp();
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const cxcVencida = MOCK.cxc.filter(c => c.estado === 'vencida').reduce((s, c) => s + c.saldo, 0);
  const otsActivas = ots.filter(o => o.estado === 'programada' || o.estado === 'ejecucion').length;
  const cotAprobar = cotizaciones.filter(c => c.estado === 'enviada' || c.estado === 'negociacion').length;
  const margen = MOCK.biFinanciero.resumen.margen_bruto_pct;

  const [showAcuerdos, setShowAcuerdos] = useState(false);
  const [acuerdoAprobandoId, setAcuerdoAprobandoId] = useState(null);
  const [acuerdoAprobandoVals, setAcuerdoAprobandoVals] = useState({ pct: '', bonificacion: '' });
  const [acuerdoRechazandoId, setAcuerdoRechazandoId] = useState(null);
  const [acuerdoMotivoRechazo, setAcuerdoMotivoRechazo] = useState('');
  const [acuerdoLoading, setAcuerdoLoading] = useState(false);

  const acuerdosPendientes = useMemo(() =>
    (oportunidades || []).filter(o => o.acuerdo_estado === 'pendiente'),
    [oportunidades]
  );

  const getPctBase = (opp) => {
    const vendedorId = opp.responsable_id || opp.vendedor_id;
    const norm = s => (s || '').trim().toLowerCase();
    const pa = (personalAdmin || []).find(p =>
      p.auth_user_id === vendedorId ||
      p.usuario_id === vendedorId ||
      p.id === vendedorId ||
      norm(p.nombre) === norm(opp.responsable) ||
      (p.email && norm(p.email) === norm(opp.responsable))
    );
    return pa?.porcentaje_comision ?? 0;
  };

  const handleAprobar = async (opp) => {
    setAcuerdoLoading(true);
    await aprobarAcuerdoComision(opp.id, {
      acuerdo_pct: acuerdoAprobandoVals.pct !== '' ? Number(acuerdoAprobandoVals.pct) : opp.acuerdo_pct,
      acuerdo_bonificacion: acuerdoAprobandoVals.bonificacion !== '' ? Number(acuerdoAprobandoVals.bonificacion) : opp.acuerdo_bonificacion,
    });
    setAcuerdoAprobandoId(null);
    setAcuerdoAprobandoVals({ pct: '', bonificacion: '' });
    setAcuerdoLoading(false);
  };

  const handleRechazar = async (opp) => {
    if (!acuerdoMotivoRechazo.trim()) return;
    setAcuerdoLoading(true);
    await rechazarAcuerdoComision(opp.id, acuerdoMotivoRechazo.trim());
    setAcuerdoRechazandoId(null);
    setAcuerdoMotivoRechazo('');
    setAcuerdoLoading(false);
  };

  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Gerencia</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>{usuarioMovil.nombre}</div></div>
      <div className="avatar" style={{width:34,height:34}}>{usuarioMovil.iniciales}</div>
    </div>
    <div className="mobile-content">
      <div className="eyebrow" style={{marginBottom:10}}>KPIs del mes</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14}}>
        <div className="card" style={{padding:12}}><div className="text-muted" style={{fontSize:11}}>Ventas</div><div style={{fontFamily:'Sora', fontWeight:800, fontSize:18}}>{money(MOCK.biFinanciero.resumen.facturacion_mes)}</div></div>
        <div className="card" style={{padding:12}}><div className="text-muted" style={{fontSize:11}}>Margen bruto</div><div style={{fontFamily:'Sora', fontWeight:800, fontSize:18, color:'var(--green)'}}>{margen}%</div></div>
        <div className="card" style={{padding:12}}><div className="text-muted" style={{fontSize:11}}>OTs activas</div><div style={{fontFamily:'Sora', fontWeight:800, fontSize:18}}>{otsActivas}</div></div>
        <div className="card" style={{padding:12}}><div className="text-muted" style={{fontSize:11}}>CxC vencida</div><div style={{fontFamily:'Sora', fontWeight:800, fontSize:18, color:'var(--danger)'}}>{money(cxcVencida)}</div></div>
      </div>

      {/* Acuerdos de comisión pendientes */}
      <div
        className="card"
        style={{padding:14, marginBottom:14, cursor:'pointer', border: acuerdosPendientes.length ? '1px solid var(--orange)' : undefined}}
        onClick={() => setShowAcuerdos(v => !v)}
      >
        <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
          <div className="row" style={{gap:8, alignItems:'center'}}>
            <div className="kpi-icon orange" style={{position:'static',width:32,height:32}}>{I.dollar}</div>
            <div>
              <div style={{fontWeight:700, fontSize:13}}>Acuerdos de comision pendientes</div>
              <div className="text-muted" style={{fontSize:11}}>Requieren tu aprobacion</div>
            </div>
          </div>
          <div className="row" style={{gap:6, alignItems:'center'}}>
            {acuerdosPendientes.length > 0 && (
              <span style={{background:'var(--orange)', color:'#fff', borderRadius:12, padding:'2px 9px', fontWeight:800, fontSize:14}}>
                {acuerdosPendientes.length}
              </span>
            )}
            <span style={{color:'var(--fg-muted)', fontSize:16}}>{showAcuerdos ? '▲' : '▼'}</span>
          </div>
        </div>
        {!acuerdosPendientes.length && (
          <div className="text-muted" style={{fontSize:12, marginTop:8}}>No hay acuerdos pendientes</div>
        )}
      </div>

      {showAcuerdos && acuerdosPendientes.length > 0 && (
        <div className="col" style={{gap:10, marginBottom:14}}>
          {acuerdosPendientes.map(opp => {
            const pctBase = getPctBase(opp);
            const diff = Number(opp.acuerdo_pct ?? 0) - pctBase;
            const isAprobando = acuerdoAprobandoId === opp.id;
            const isRechazando = acuerdoRechazandoId === opp.id;
            return (
              <div key={opp.id} className="card" style={{padding:14, border:'1px solid var(--orange)'}}>
                <div style={{fontWeight:700, fontSize:13, marginBottom:2}}>{opp.nombre || opp.titulo || 'Oportunidad'}</div>
                <div className="text-muted" style={{fontSize:11, marginBottom:8}}>{opp.cliente_nombre || opp.cuenta_nombre || ''}</div>
                <div className="row" style={{gap:8, flexWrap:'wrap', marginBottom:8}}>
                  <div style={{fontSize:12}}>
                    <span className="text-muted">Base: </span>
                    <span style={{fontWeight:700}}>{pctBase}%</span>
                  </div>
                  <div style={{fontSize:12}}>
                    <span className="text-muted">Propuesto: </span>
                    <span style={{fontWeight:700, color: diff > 0 ? 'var(--danger)' : diff < 0 ? 'var(--green)' : undefined}}>
                      {opp.acuerdo_pct ?? pctBase}%
                    </span>
                  </div>
                  {diff !== 0 && (
                    <span style={{
                      fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:8,
                      background: diff > 0 ? 'var(--danger)' : 'var(--green)',
                      color:'#fff'
                    }}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}pp
                    </span>
                  )}
                  {Number(opp.acuerdo_bonificacion) > 0 && (
                    <div style={{fontSize:12}}>
                      <span className="text-muted">Bon: </span>
                      <span style={{fontWeight:700, color:'var(--orange)'}}>{money(opp.acuerdo_bonificacion)}</span>
                    </div>
                  )}
                </div>
                {opp.acuerdo_justificacion && (
                  <div style={{fontSize:11, color:'var(--fg-muted)', fontStyle:'italic', marginBottom:8, padding:'6px 8px', background:'var(--bg-soft)', borderRadius:6}}>
                    "{opp.acuerdo_justificacion}"
                  </div>
                )}

                {!isAprobando && !isRechazando && (
                  <div className="row" style={{gap:8}}>
                    <button
                      className="btn btn-sm flex-1"
                      style={{background:'var(--green)', color:'#fff', border:'none'}}
                      onClick={e => { e.stopPropagation(); setAcuerdoAprobandoId(opp.id); setAcuerdoAprobandoVals({ pct: opp.acuerdo_pct ?? '', bonificacion: opp.acuerdo_bonificacion ?? '' }); setAcuerdoRechazandoId(null); }}
                    >
                      {I.check} Aprobar
                    </button>
                    <button
                      className="btn btn-sm flex-1"
                      style={{background:'var(--danger)', color:'#fff', border:'none'}}
                      onClick={e => { e.stopPropagation(); setAcuerdoRechazandoId(opp.id); setAcuerdoMotivoRechazo(''); setAcuerdoAprobandoId(null); }}
                    >
                      {I.x} Rechazar
                    </button>
                  </div>
                )}

                {isAprobando && (
                  <div onClick={e => e.stopPropagation()}>
                    <div style={{fontSize:11, fontWeight:600, color:'var(--green)', marginBottom:8}}>Editar valores antes de aprobar:</div>
                    <div className="row" style={{gap:8, marginBottom:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:3}}>% Comision</div>
                        <input
                          type="number" step="0.01" min="0" max="100"
                          className="input"
                          style={{padding:'6px 8px', fontSize:13}}
                          value={acuerdoAprobandoVals.pct}
                          onChange={e => setAcuerdoAprobandoVals(v => ({...v, pct: e.target.value}))}
                        />
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:3}}>Bonificacion</div>
                        <input
                          type="number" step="0.01" min="0"
                          className="input"
                          style={{padding:'6px 8px', fontSize:13}}
                          value={acuerdoAprobandoVals.bonificacion}
                          onChange={e => setAcuerdoAprobandoVals(v => ({...v, bonificacion: e.target.value}))}
                        />
                      </div>
                    </div>
                    <div className="row" style={{gap:8}}>
                      <button
                        className="btn btn-sm flex-1"
                        style={{background:'var(--green)', color:'#fff', border:'none'}}
                        disabled={acuerdoLoading}
                        onClick={() => handleAprobar(opp)}
                      >
                        {acuerdoLoading ? 'Guardando...' : `${I.check} Confirmar aprobacion`}
                      </button>
                      <button className="btn btn-sm btn-secondary" style={{flex:'0 0 auto'}} onClick={() => setAcuerdoAprobandoId(null)}>Cancelar</button>
                    </div>
                  </div>
                )}

                {isRechazando && (
                  <div onClick={e => e.stopPropagation()}>
                    <div style={{fontSize:11, fontWeight:600, color:'var(--danger)', marginBottom:6}}>Motivo de rechazo (obligatorio):</div>
                    <textarea
                      className="input"
                      rows={2}
                      style={{width:'100%', resize:'none', fontSize:12, padding:'6px 8px', marginBottom:8}}
                      placeholder="Explica el motivo del rechazo..."
                      value={acuerdoMotivoRechazo}
                      onChange={e => setAcuerdoMotivoRechazo(e.target.value)}
                    />
                    <div className="row" style={{gap:8}}>
                      <button
                        className="btn btn-sm flex-1"
                        style={{background:'var(--danger)', color:'#fff', border:'none'}}
                        disabled={acuerdoLoading || !acuerdoMotivoRechazo.trim()}
                        onClick={() => handleRechazar(opp)}
                      >
                        {acuerdoLoading ? 'Guardando...' : `${I.x} Confirmar rechazo`}
                      </button>
                      <button className="btn btn-sm btn-secondary" style={{flex:'0 0 auto'}} onClick={() => setAcuerdoRechazandoId(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="eyebrow" style={{marginBottom:8}}>Alertas prioritarias</div>
      <div className="col" style={{gap:8}}>
        {[
          { icon: I.dollar, text: `${money(cxcVencida)} vencidos en cartera critica`, badge: 'Cobranza' },
          { icon: I.file, text: `${cotAprobar} cotizaciones requieren aprobacion`, badge: 'Comercial' },
          { icon: I.alert, text: '2 OTs con SLA en riesgo esta semana', badge: 'Operaciones' },
          { icon: I.trend, text: 'Logistica Altiplano con health score critico', badge: 'CS' }
        ].map((a, i) => (
          <div key={i} className="card row" style={{padding:12, gap:10}}>
            <div className="kpi-icon orange" style={{position:'static',width:32,height:32}}>{a.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:12, fontWeight:600}}>{a.text}</div>
              <span className="badge badge-cyan" style={{fontSize:10, marginTop:4}}>{a.badge}</span>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-lg" style={{width:'100%',marginTop:14}}>{I.check} Aprobar pendientes</button>
    </div>
    <div className="mobile-nav">
      <div className="mobile-nav-item active">{I.trend}KPIs</div>
      <div className="mobile-nav-item">{I.alert}Alertas</div>
      <div className="mobile-nav-item">{I.users}Clientes</div>
      <div className="mobile-nav-item">{I.settings}Ajustes</div>
    </div>
  </>;
}

// ── Solicitudes de RRHH — Vista mobile ─────────────────────────────────────

const SOL_TIPO_LABELS_M = {
  vacaciones: 'Vacaciones',
  permiso_con_goce: 'Permiso con goce',
  permiso_sin_goce: 'Permiso sin goce',
  licencia_medica: 'Licencia médica',
  licencia_maternidad: 'Licencia maternidad',
  licencia_paternidad: 'Licencia paternidad',
  compensacion_horas: 'Compensación horas',
};

const SOL_ESTADO_LABELS_M = {
  borrador: 'Borrador', enviada: 'Enviada', aprobada_jefe: 'Aprobada',
  rechazada_jefe: 'Rechazada', confirmada_rrhh: 'Confirmada', rechazada_rrhh: 'Rechazada',
  activa: 'Activa', anulada: 'Anulada',
};

const SOL_TIPO_ICONS_M = {
  vacaciones: I.calendar, permiso_con_goce: I.clock, permiso_sin_goce: I.clock,
  licencia_medica: I.userCheck, licencia_maternidad: I.userCheck, licencia_paternidad: I.userCheck,
  compensacion_horas: I.arrowUp,
};

function solEstadoBadgeM(estado) {
  if (['aprobada_jefe', 'confirmada_rrhh', 'activa'].includes(estado)) return 'badge-green';
  if (['rechazada_jefe', 'rechazada_rrhh', 'anulada'].includes(estado)) return 'badge-red';
  if (estado === 'enviada') return 'badge-orange';
  return 'badge-gray';
}

function MiEspacioMobileView({ setScreen }) {
  const app = useApp();
  const {
    authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos,
    solicitudesRRHH, registrosAsistencia, periodosNomina, trabajadoresDatosNomina,
    amonestacionesPersonal, empresaConfig = {}, evaluacionPlantillas = [], evaluacionEvaluaciones = [],
    portalDatosSolicitudes = [], portalConstanciasTrabajo = [], portalBoletaAcuses = [], portalBoletaVisualizaciones = [], portalFirmaRegistros = [],
    crearConstanciaPortalCtx, registrarVisualizacionBoletaPortalCtx,
    tiposDocumento = [], subirDocumentoFirmadoPortalCtx, subirContratoFirmadoAprobadoCtx, addNotificacion,
  } = app;
  const [tab, setTab] = useState('resumen');
  const [uploading, setUploading] = useState('');
  const [modalSubirContrato, setModalSubirContrato] = useState(null);
  const [fileSubir, setFileSubir] = useState(null);
  const tiposDocumentoContratoIds = useMemo(() => (tiposDocumento || []).filter(t => t.captura_snapshot_laboral).map(t => t.id), [tiposDocumento]);
  const data = useMemo(() => construirAutoservicioLocal({
    authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos,
    solicitudesRRHH, registrosAsistencia, periodosNomina, trabajadoresDatosNomina,
    amonestaciones: amonestacionesPersonal, notificaciones: app.notificaciones,
    evaluacionPlantillas, evaluacionEvaluaciones, portalDatosSolicitudes, portalConstanciasTrabajo,
    portalBoletaAcuses, portalBoletaVisualizaciones, portalFirmaRegistros,
    tiposDocumentoContratoIds,
  }), [authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos, solicitudesRRHH, registrosAsistencia, periodosNomina, trabajadoresDatosNomina, amonestacionesPersonal, app.notificaciones, evaluacionPlantillas, evaluacionEvaluaciones, portalDatosSolicitudes, portalConstanciasTrabajo, portalBoletaAcuses, portalBoletaVisualizaciones, portalFirmaRegistros, tiposDocumentoContratoIds]);
  const ficha = data.ficha;
  const marcarActivo = Boolean(empresaConfig?.habilitar_marcacion_mobile_autoservicio);
  const contrato = data.resumen?.contrato;

  const getNombreDoc = (d) => {
    if (!d) return 'Documento';
    const tInfo = (tiposDocumento || []).find(t => t.id === d.tipo_documento_id || t.id === d.tipo_doc);
    return tInfo?.nombre || d.tipo_documento_nombre || d.tipo_doc || 'Documento';
  };

  const abrirDoc = async (doc) => {
    try {
      const ref = doc.storage_path || doc.archivo_url;
      if (!ref) return;
      const url = await personalDocumentosService.renovarUrlDocumento(ref);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      if (doc.archivo_url) window.open(doc.archivo_url, '_blank', 'noopener,noreferrer');
    }
  };

  const confirmarSubidaContrato = async () => {
    if (!fileSubir || !modalSubirContrato || !ficha) return;
    if (fileSubir.size === 0) {
      addNotificacion('El archivo no puede estar vacío.', 'error');
      return;
    }
    setUploading('contrato');
    try {
      await subirContratoFirmadoAprobadoCtx({ file: fileSubir, docOriginal: modalSubirContrato });
      addNotificacion('Contrato firmado subido con éxito. Queda en revisión por RRHH.');
      if (modalSubirContrato) {
        modalSubirContrato.estado_validacion = 'pendiente';
        modalSubirContrato.subido_desde = 'mobile';
        modalSubirContrato.creado_en = new Date().toISOString();
      }
      setModalSubirContrato(null);
      setFileSubir(null);
    } catch (err) {
      addNotificacion(`Error al subir contrato: ${err?.message || err}`, 'error');
    } finally {
      setUploading('');
    }
  };

  const subirDocumentoFirmado = async (file, docOriginal) => {
    if (!file || !ficha) return;
    setUploading(docOriginal.id);
    try {
      await subirDocumentoFirmadoPortalCtx({
        personalId: ficha.id,
        personalTipo: ficha.personal_tipo,
        tipoDoc: docOriginal.tipo_doc || docOriginal.tipo_documento_id || 'contrato',
        tipoDocumentoId: docOriginal.tipo_documento_id || null,
        file,
        documentoEnviadoAFirmaId: docOriginal.id,
        nombreColaborador: ficha.nombre,
      });
      addNotificacion('Documento firmado subido con éxito. RRHH lo validará pronto.');
      docOriginal.estado_validacion = 'pendiente';
      docOriginal.subido_desde = 'mobile';
      docOriginal.creado_en = new Date().toISOString();
    } catch (err) {
      addNotificacion(`Error al subir el documento: ${err?.message || err}`, 'error');
    } finally {
      setUploading('');
    }
  };

  if (!ficha) {
    return (
      <div style={{ padding: 18, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ width: 42, height: 42, margin: '0 auto 12px', color: 'var(--orange)' }}>{I.alert}</div>
          <div style={{ fontWeight: 800 }}>Sin ficha vinculada</div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>RRHH debe asociar tu usuario a una ficha de personal.</div>
        </div>
      </div>
    );
  }

  const cards = [
    ['Vencimiento contrato', contrato?.estado === 'por_vencer' ? `En ${contrato.dias} dias` : (contrato?.estado || 'vigente')],
    ['Ultima boleta', data.resumen?.ultima_boleta?.periodo || 'Sin boleta'],
    ['Vacaciones', `${data.resumen?.vacaciones || 0} dias`],
    ['HE pendiente', `${Math.round(Number(data.resumen?.he_pendiente_minutos || 0) / 60 * 10) / 10} h`],
  ];

  return (
    <>
      <div className="mobile-header">
        <div><div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Mi portal</div><div className="font-display" style={{ fontWeight: 800, fontSize: 17 }}>{ficha.nombre}</div></div>
        <div className="avatar" style={{ width: 34, height: 34 }}>{inicialesDe(ficha.nombre)}</div>
      </div>
      <div className="mobile-content">
      {tab === 'resumen' && (
      <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {cards.map(([label, value]) => (
          <div key={label} className="card" style={{ padding: 12, minHeight: 78 }}>
            <div className="text-muted" style={{ fontSize: 11 }}>{label}</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6 }}>{value}</div>
          </div>
        ))}
      </div>

      {data.resumen?.ciclo_minero && (
        <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: 'var(--cyan)' }}>
          <div style={{ fontWeight: 800 }}>Ciclo minero {data.resumen.ciclo_minero.regimen}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>Proxima bajada: {data.resumen.ciclo_minero.proxima_bajada || '-'}</div>
        </div>
      )}

      {data.evaluacionesPendientes.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: 'var(--orange)' }}>
          <div style={{ fontWeight: 800 }}>Autoevaluacion pendiente</div>
          <div className="text-muted" style={{ fontSize: 12 }}>{data.evaluacionesPendientes[0].plantilla?.nombre || 'Evaluacion de desempeno'}</div>
          <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => app.navigate('evaluaciones_desempeno', { auto: data.evaluacionesPendientes[0].id })}>Responder</button>
        </div>
      )}

      {marcarActivo && (
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={() => setScreen('home')}>
          {I.clock} Marcar entrada/salida
        </button>
      )}

      <div className="card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Boletas</div>
        {!data.misDatos?.consentimiento_entrega_electronica && <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>Activa el consentimiento electronico desde Mi portal para abrir boletas.</div>}
        {data.boletas.slice(0, 3).map(b => <div key={b.id} className="row" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}><span>{b.periodo}</span><button className="btn btn-secondary btn-sm" onClick={() => registrarVisualizacionBoletaPortalCtx?.({ boleta_id: b.id, periodo_id: b.periodo_id, personal_id: ficha.id, personal_tipo: ficha.personal_tipo, detalle: b.detalle || b })}>{b.acuse ? 'Abrir' : 'Pendiente'}</button></div>)}
        {!data.boletas.length && <div className="text-muted" style={{ fontSize: 12 }}>Sin boletas disponibles.</div>}
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Datos y constancias</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-gray">{data.datosSolicitudes.filter(s => s.estado === 'pendiente').length} datos pendientes</span>
          <span className="badge badge-gray">{data.constancias.length} constancias</span>
        </div>
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => crearConstanciaPortalCtx?.({ ficha, personal_id: ficha.id, personal_tipo: ficha.personal_tipo, proposito: 'Solicitud mobile' })}>Solicitar constancia</button>
      </div>

      <button className="btn btn-primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => setTab('solicitudes')}>
        {I.clipboard} Solicitudes
      </button>
      </>
      )}

      {tab === 'solicitudes' && <SolicitudesMovilView />}

      {tab === 'contratos' && (
      <div className="card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Contratos y documentos</div>
        {(() => {
          const allDocs = [...(data.contratos || []), ...(data.documentos || [])];
          const docsPendMobile = allDocs.filter(d => d.estado_validacion === 'pendiente_firma' || d.estado_firma === 'pendiente_trabajador');
          
          const sinContratoAprobado = data.resumen?.contrato?.estado === 'sin_contrato' || !(data.contratos || []).some(c => c.estado_validacion === 'aprobado');

          if (allDocs.length === 0) {
            return (
              <>
                {sinContratoAprobado && (
                  <div className="alert alert-info" style={{ fontSize: 12, padding: '10px 14px', marginBottom: 8 }}>
                    Tu contrato será cargado por RRHH. Recibirás una notificación cuando esté listo.
                  </div>
                )}
                <div className="text-muted" style={{ fontSize: 12 }}>0 documentos personales registrados.</div>
              </>
            );
          }
          
          return (
            <div style={{ padding: '8px 0', marginBottom: 8 }}>
              {sinContratoAprobado && (
                <div className="alert alert-info" style={{ fontSize: 12, padding: '10px 14px', marginBottom: 12 }}>
                  Tu contrato será cargado por RRHH. Recibirás una notificación cuando esté listo.
                </div>
              )}
              {docsPendMobile.length > 0 && (
                <span className="badge badge-orange" style={{ marginBottom: 12, display: 'inline-block' }}>
                  Tienes {docsPendMobile.length} documento{docsPendMobile.length !== 1 ? 's' : ''} pendiente{docsPendMobile.length !== 1 ? 's' : ''} de firma
                </span>
              )}
              {allDocs.map(d => {
                const isPendienteFirma = (d.estado_validacion === 'pendiente_firma' || d.estado_firma === 'pendiente_trabajador') || (d.estado_validacion === 'pendiente' && d.subido_desde === 'backoffice');
                const isPendienteValidacion = d.estado_validacion === 'pendiente' && d.subido_desde === 'mobile';
                const isEnRevision = d.estado_validacion === 'en_revision' || (d.estado_validacion === 'pendiente' && d.subido_desde !== 'mobile' && d.subido_desde !== 'backoffice');
                const isAprobado = d.estado_validacion === 'aprobado' || d.estado_validacion === 'vigente';
                const isRechazado = d.estado_validacion === 'rechazado';
                const yaSubioFirmado = isAprobado && (personalDocumentos || []).some(pd =>
                  pd.personal_id === ficha?.id &&
                  (pd.tipo_documento_id === d.tipo_documento_id || pd.tipo_doc === d.tipo_doc) &&
                  pd.estado_validacion === 'pendiente' && pd.subido_desde === 'mobile' && pd.activo === false
                );
                
                let subtext = '';
                if (isPendienteFirma) subtext = `Enviado el ${d.creado_en ? new Date(d.creado_en).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' }) : (d.enviado_a_firma_en ? d.enviado_a_firma_en.slice(0, 10) : 'hoy')} · Esperando tu firma`;
                else if (isPendienteValidacion) {
                  const f = d.creado_en ? new Date(d.creado_en) : new Date();
                  const fStr = `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()} a las ${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
                  subtext = `Documento enviado — pendiente de validación · Enviado el ${fStr}`;
                }
                else if (isEnRevision) subtext = 'En revisión por RRHH';
                else if (isAprobado) subtext = `Vigente ${d.fecha_vencimiento ? `· Vence: ${d.fecha_vencimiento}` : ''}`;
                else if (isRechazado) subtext = `Rechazado${d.motivo_rechazo ? ` · ${d.motivo_rechazo}` : ''}`;
                else subtext = d.estado_validacion || 'Registrado';

                const tInfo = (tiposDocumento || []).find(t => t.id === d.tipo_documento_id || t.id === d.tipo_doc);
                const permiteFirma = tInfo ? tInfo.permite_firma_trabajador !== false : true;
                const isContrato = Boolean(d.tipo_documento_id && tiposDocumentoContratoIds.includes(d.tipo_documento_id)) || Boolean(d.tipo_doc === 'contrato');
                
                let docBadge = null;
                if (isContrato) {
                  if (tInfo && !tInfo.renovable && tInfo.permite_firma_trabajador === false) {
                    docBadge = <span className="badge badge-gray" style={{ fontSize: 10, marginLeft: 6 }}>Contrato original</span>;
                  } else if (tInfo && tInfo.renovable) {
                    docBadge = <span className="badge badge-cyan" style={{ fontSize: 10, marginLeft: 6 }}>Renovación vigente</span>;
                  }
                }

                return (
                  <div key={d.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center' }}>
                      {getNombreDoc(d)}
                      {docBadge}
                    </div>
                    <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
                      {subtext}
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn btn-sm btn-secondary flex-1" onClick={() => abrirDoc(d)}>{I.file} Ver</button>
                      
                      {isPendienteFirma && permiteFirma && (
                        ficha.firma_onboarding_completo ? (
                          <button className="btn btn-sm btn-ghost flex-1" style={{ color: 'var(--fg-muted)', cursor: 'default' }} disabled title="Próximamente">Firma electrónica</button>
                        ) : (
                          <label className="btn btn-sm btn-primary flex-1" style={{ justifyContent: 'center' }}>
                            {uploading === d.id ? 'Subiendo...' : 'Subir firmado'}
                            <input type="file" accept="application/pdf,image/*" capture="environment" style={{ display: 'none' }}
                              onClick={e => { e.target.value = null; }}
                              onChange={e => subirDocumentoFirmado(e.target.files?.[0], d)} />
                          </label>
                        )
                      )}
                      
                      {isAprobado && !yaSubioFirmado && permiteFirma && (
                        <button className="btn btn-sm btn-primary flex-1" onClick={() => setModalSubirContrato(d)}>Subir contrato firmado</button>
                      )}
                      {isAprobado && yaSubioFirmado && (
                        <span className="badge badge-orange" style={{ alignSelf: 'center' }}>Pendiente de validación</span>
                      )}
                      
                      {isRechazado && permiteFirma && (
                        <label className="btn btn-sm btn-primary flex-1" style={{ justifyContent: 'center' }}>
                          {uploading === d.id ? 'Subiendo...' : 'Subir nueva versión'}
                          <input type="file" accept="application/pdf,image/*" capture="environment" style={{ display: 'none' }}
                            onClick={e => { e.target.value = null; }}
                            onChange={e => subirDocumentoFirmado(e.target.files?.[0], d)} />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      )}

      {tab === 'mas' && (
      <>
      <div className="card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Asistencia del mes</div>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge badge-cyan">{data.asistencia.length} registros</span>
          <span className="badge badge-orange">{data.asistencia.reduce((s, r) => s + Number(r.tardanza_min || r.tardanza_minutos || 0), 0)} min tardanza</span>
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Amonestaciones</div>
        {data.amonestaciones.slice(0, 2).map(a => <div key={a.id} style={{ fontSize: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>{a.descripcion || a.motivo}</div>)}
        {!data.amonestaciones.length && <div className="text-muted" style={{ fontSize: 12 }}>Sin amonestaciones activas.</div>}
      </div>
      </>
      )}
      </div>

      <div className="mobile-nav">
        <div className={'mobile-nav-item '+(tab==='resumen'?'active':'')} onClick={()=>setTab('resumen')}>{I.dashboard}Resumen</div>
        <div className={'mobile-nav-item '+(tab==='solicitudes'?'active':'')} onClick={()=>setTab('solicitudes')}>{I.clipboard}Solicitudes</div>
        <div className={'mobile-nav-item '+(tab==='contratos'?'active':'')} onClick={()=>setTab('contratos')}>{I.file}Contratos</div>
        <div className={'mobile-nav-item '+(tab==='mas'?'active':'')} onClick={()=>setTab('mas')}>{I.settings}Más</div>
      </div>

      {modalSubirContrato && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => { setModalSubirContrato(null); setFileSubir(null); }}>
          <div style={{ backgroundColor: 'var(--bg)', width: '100%', maxWidth: 500, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Subir contrato firmado</div>
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>Por favor, sube una copia escaneada o foto legible de tu contrato firmado ({getNombreDoc(modalSubirContrato)}).</div>
            
            <label className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: 14 }}>
              {fileSubir ? fileSubir.name : 'Seleccionar archivo (PDF, JPG, PNG)'}
              <input type="file" accept="application/pdf,image/*" capture="environment" style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f && f.size > 20 * 1024 * 1024) { addNotificacion('El archivo excede los 20MB', 'error'); return; }
                  setFileSubir(f);
                }} />
            </label>
            
            <div className="row" style={{ gap: 12, marginTop: 24 }}>
              <button className="btn btn-ghost flex-1" onClick={() => { setModalSubirContrato(null); setFileSubir(null); }}>Cancelar</button>
              <button className="btn btn-primary flex-1" onClick={confirmarSubidaContrato} disabled={!fileSubir || uploading === 'contrato'}>{uploading === 'contrato' ? 'Subiendo...' : 'Confirmar subida'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SolicitudesMovilView() {
  const { empresa, role, personalOperativo, personalAdmin, authUser, addNotificacion } = useApp();
  const [screen, setScreen] = useState('home');
  const [solicitudes, setSolicitudes] = useState([]);
  const [autorizacionesHE, setAutorizacionesHE] = useState([]);
  const [saldoVac, setSaldoVac] = useState({ disponibles: 30, usados: 0, saldo: 30 });
  const [paso, setPaso] = useState(1); // 1 tipo, 2 fechas, 3 motivo, 4 confirmación
  const [form, setForm] = useState({ tipo: 'vacaciones', fecha_inicio: new Date().toISOString().slice(0,10), fecha_fin: new Date().toISOString().slice(0,10), motivo: '', documento_url: '' });
  const [formHE, setFormHE] = useState({ fecha: new Date().toISOString().slice(0,10), horas_estimadas: 1, motivo: '' });
  const [saving, setSaving] = useState(false);
  const [accionSolId, setAccionSolId] = useState(null);
  const [accionIsHE, setAccionIsHE] = useState(false);
  const [accionTipo, setAccionTipo] = useState('');
  const [accionComentario, setAccionComentario] = useState('');
  const [accionSaving, setAccionSaving] = useState(false);

  const todosPersonal = useMemo(() => [
    ...personalOperativo.map(p => ({ ...p, _tipo: 'operativo' })),
    ...personalAdmin.map(p => ({ ...p, _tipo: 'administrativo' })),
  ], [personalOperativo, personalAdmin]);

  const personalActual = useMemo(() => {
    const uid = authUser?.id || authUser?.user_id;
    const email = (authUser?.email || '').toLowerCase().trim();
    return todosPersonal.find(p =>
      (uid && (p.auth_user_id === uid || p.id === uid)) ||
      (email && (p.email || '').toLowerCase().trim() === email)
    ) || null;
  }, [authUser, todosPersonal]);

  const supervisor = useMemo(() => {
    if (!personalActual) return null;
    const jefe = personalActual.supervisor_id || personalActual.jefe_user_id;
    return todosPersonal.find(p => p.id === jefe || p.auth_user_id === jefe) || null;
  }, [personalActual, todosPersonal]);

  const diasHabiles = useMemo(() => {
    if (!form.fecha_inicio || !form.fecha_fin || form.fecha_fin < form.fecha_inicio) return 0;
    return solicitudesRrhhService.diasHabilesLocal(form.fecha_inicio, form.fecha_fin);
  }, [form.fecha_inicio, form.fecha_fin]);

  const subordinadosIds = useMemo(() => {
    if (!personalActual) return [];
    const uid = personalActual.id;
    const authUid = personalActual.auth_user_id || personalActual.user_id;
    return todosPersonal
      .filter(p => (p.supervisor_id && p.supervisor_id === uid) || (p.jefe_user_id && authUid && p.jefe_user_id === authUid))
      .map(p => p.id);
  }, [personalActual, todosPersonal]);

  const esJefe = subordinadosIds.length > 0;

  const pendientesEquipo = useMemo(() => {
    return solicitudes.filter(s => s.estado === 'enviada' && subordinadosIds.includes(s.personal_id) && s.personal_id !== personalActual?.id);
  }, [solicitudes, subordinadosIds, personalActual]);

  useEffect(() => {
    if (!empresa?.id) return;
    solicitudesRrhhService.cargarSolicitudes(empresa.id).then(setSolicitudes).catch(() => {});
    rrhhService.getAutorizacionesHorasExtra(empresa.id).then(setAutorizacionesHE).catch(() => {});
  }, [empresa?.id]);

  useEffect(() => {
    if (!empresa?.id || !personalActual?.id) return;
    solicitudesRrhhService.calcularSaldoVacaciones(empresa.id, personalActual.id, null, personalActual?.fecha_ingreso)
      .then(setSaldoVac).catch(() => {});
  }, [empresa?.id, personalActual?.id, solicitudes]);

  const misSolicitudes = useMemo(() =>
    solicitudes.filter(s => s.personal_id === personalActual?.id)
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
  , [solicitudes, personalActual]);

  const pendientesEquipoMixto = useMemo(() => {
    const arr1 = solicitudes.filter(s => s.estado === 'enviada' && subordinadosIds.includes(s.personal_id) && s.personal_id !== personalActual?.id).map(s => ({...s, _isHE: false}));
    const arr2 = autorizacionesHE.filter(s => s.estado === 'pendiente' && subordinadosIds.includes(s.personal_id) && s.personal_id !== personalActual?.id).map(s => ({...s, _isHE: true, tipo: 'horas_extra'}));
    return [...arr1, ...arr2];
  }, [solicitudes, autorizacionesHE, subordinadosIds, personalActual]);

  const misSolicitudesMixtas = useMemo(() => {
    const arr1 = solicitudes.filter(s => s.personal_id === personalActual?.id).map(s => ({...s, _isHE: false}));
    const arr2 = autorizacionesHE.filter(s => s.personal_id === personalActual?.id).map(s => ({...s, _isHE: true, tipo: 'horas_extra', creado_en: s.creado_en || s.solicitado_en || new Date().toISOString()}));
    return [...arr1, ...arr2].sort((a, b) => b.creado_en.localeCompare(a.creado_en));
  }, [solicitudes, autorizacionesHE, personalActual]);

  const enviarSolicitud = async () => {
    if (!personalActual) {
      addNotificacion('No se encontró tu ficha de personal. Contacta a RRHH.');
      return;
    }
    if (!form.motivo.trim() || diasHabiles <= 0 || !empresa?.id) {
      addNotificacion('Completa todos los campos obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const esAutoAprobacion = supervisor?.id === personalActual.id || (supervisor?.auth_user_id && supervisor?.auth_user_id === (personalActual.auth_user_id || personalActual.user_id));
      const nueva = await solicitudesRrhhService.crearSolicitud(empresa.id, {
        personal_id: personalActual.id,
        personal_nombre: personalActual.nombre,
        personal_tipo: personalActual._tipo || 'operativo',
        aprobador_id: esAutoAprobacion ? null : (supervisor?.id || null),
        aprobador_nombre: esAutoAprobacion ? null : (supervisor?.nombre || null),
        tipo: form.tipo,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        motivo: form.motivo.trim(),
        documento_url: form.documento_url.trim() || null,
        registrado_desde: 'mobile',
      });
      setSolicitudes(prev => [nueva, ...prev]);
      addNotificacion('Solicitud enviada.');
      setPaso(1);
      setForm({ tipo: 'vacaciones', fecha_inicio: new Date().toISOString().slice(0,10), fecha_fin: new Date().toISOString().slice(0,10), motivo: '', documento_url: '' });
      setScreen('home');
    } catch (err) {
      addNotificacion('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const enviarSolicitudHE = async () => {
    if (!personalActual) return;
    if (!formHE.motivo.trim() || Number(formHE.horas_estimadas) <= 0 || !empresa?.id) {
      addNotificacion('Completa todos los campos obligatorios para horas extra.');
      return;
    }
    setSaving(true);
    try {
      const nueva = await rrhhService.crearAutorizacionHorasExtra(empresa.id, {
        personal_id: personalActual.id,
        personal_nombre: personalActual.nombre,
        personal_tipo: personalActual._tipo || 'operativo',
        fecha: formHE.fecha,
        horas_estimadas: Number(formHE.horas_estimadas),
        minutos_autorizados: Math.round(Number(formHE.horas_estimadas) * 60),
        motivo: formHE.motivo.trim(),
        estado: 'pendiente',
        solicitado_por: 'empleado',
      });
      setAutorizacionesHE(prev => [nueva, ...prev]);
      addNotificacion('Solicitud de horas extra enviada al supervisor/RRHH.');
      setPaso(1);
      setFormHE({ fecha: new Date().toISOString().slice(0,10), horas_estimadas: 1, motivo: '' });
      setScreen('home');
    } catch (err) {
      addNotificacion('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const ejecutarAccion = async () => {
    if (!accionSolId) return;
    if (accionTipo === 'rechazar_jefe' && !accionComentario.trim()) {
      addNotificacion('El comentario es obligatorio.');
      return;
    }
    setAccionSaving(true);
    const usuario = role?.nombre || authUser?.email || '';
    try {
      let updated;
      if (accionTipo === 'aprobar_jefe') {
        updated = await solicitudesRrhhService.aprobarJefe(accionSolId, empresa.id, { comentario: accionComentario, usuario });
      } else if (accionTipo === 'rechazar_jefe') {
        updated = await solicitudesRrhhService.rechazarJefe(accionSolId, empresa.id, accionComentario, usuario);
      }
      if (updated) setSolicitudes(prev => prev.map(s => s.id === updated.id ? updated : s));
      addNotificacion('Acción aplicada.');
      setAccionSolId(null);
      setAccionTipo('');
      setAccionComentario('');
      setScreen('home');
    } catch (err) {
      addNotificacion('Error: ' + err.message);
    } finally {
      setAccionSaving(false);
    }
  };

  const reqDoc = solicitudesRrhhService.requiereDocumento(form.tipo);
  const excedeSaldo = form.tipo === 'vacaciones' && diasHabiles > saldoVac.saldo && diasHabiles > 0;

  // ── Pantalla home ────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <div style={{padding:'16px 14px', overflowY:'auto', height:'100%'}}>
      <div style={{fontWeight:700, fontSize:17, marginBottom:4}}>Mis Solicitudes</div>

      <div className="card row" style={{padding:'10px 14px', marginBottom:14, gap:12, alignItems:'center'}}>
        <div style={{width:32, height:32, color:'var(--cyan)'}}>{I.calendar}</div>
        <div>
          <div style={{fontSize:11, color:'var(--fg-muted)'}}>Vacaciones disponibles</div>
          <div style={{fontSize:20, fontWeight:700, color:'var(--cyan)'}}>{saldoVac.saldo} días</div>
          <div style={{fontSize:10, color:'var(--fg-muted)'}}>{saldoVac.usados} usados de {saldoVac.disponibles}</div>
        </div>
        {esJefe && pendientesEquipoMixto.length > 0 && (
          <div style={{marginLeft:'auto', textAlign:'right'}}>
            <div style={{fontSize:10, color:'var(--fg-muted)'}}>Pendientes de aprobar</div>
            <span className="badge badge-orange" style={{fontSize:13, padding:'2px 10px'}}>{pendientesEquipoMixto.length}</span>
          </div>
        )}
      </div>

      <div className="row" style={{gap:10, marginBottom:14}}>
        <button className="btn btn-primary" style={{flex:1}} onClick={() => { setPaso(1); setScreen('nueva'); }}>
          {I.plus} Nueva licencia
        </button>
        <button className="btn btn-secondary" style={{flex:1}} onClick={() => { setPaso(1); setScreen('nueva_he'); }}>
          {I.clock} Solicitar HE
        </button>
      </div>

      {esJefe && pendientesEquipoMixto.length > 0 && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12, fontWeight:700, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>Pendientes de tu aprobación</div>
          {pendientesEquipoMixto.map(sol => (
            <div key={sol.id} className="card" style={{padding:12, marginBottom:8}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6}}>
                <div>
                  <div style={{fontWeight:600, fontSize:13}}>{sol.personal_nombre}</div>
                  <div style={{fontSize:12, color:'var(--fg-muted)'}}>{sol._isHE ? 'Horas Extra' : (SOL_TIPO_LABELS_M[sol.tipo] || sol.tipo)}</div>
                </div>
                <span className={'badge ' + solEstadoBadgeM(sol.estado)}>{sol._isHE ? (sol.estado === 'pendiente' ? 'Enviada' : sol.estado) : SOL_ESTADO_LABELS_M[sol.estado]}</span>
              </div>
              <div style={{fontSize:12, color:'var(--fg-muted)', marginBottom:8}}>
                {sol._isHE ? `${sol.fecha} · ${sol.horas_estimadas} horas` : `${sol.fecha_inicio} — ${sol.fecha_fin} · ${sol.dias_habiles} días hábiles`}
              </div>
              <div className="row" style={{gap:8}}>
                <button className="btn btn-primary btn-sm" style={{flex:1}}
                  onClick={() => { setAccionSolId(sol.id); setAccionIsHE(sol._isHE); setAccionTipo('aprobar_jefe'); setAccionComentario(''); setScreen('accion'); }}>
                  Aprobar
                </button>
                <button className="btn btn-secondary btn-sm" style={{flex:1, color:'var(--red)'}}
                  onClick={() => { setAccionSolId(sol.id); setAccionIsHE(sol._isHE); setAccionTipo('rechazar_jefe'); setAccionComentario(''); setScreen('accion'); }}>
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{fontSize:12, fontWeight:700, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>Mis solicitudes recientes</div>
      {misSolicitudesMixtas.length === 0
        ? <div className="text-muted" style={{textAlign:'center', padding:24, fontSize:13}}>No tienes solicitudes.</div>
        : misSolicitudesMixtas.slice(0, 8).map(sol => {
          const comentario = sol._isHE ? sol.comentario_resolucion : (sol.comentario_rrhh || sol.comentario_jefe || sol.motivo_anulacion);
          return (
            <div key={sol.id} className="card" style={{padding:12, marginBottom:8}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{width:18, height:18, color:'var(--fg-muted)'}}>{sol._isHE ? I.clock : SOL_TIPO_ICONS_M[sol.tipo]}</span>
                  <div>
                    <div style={{fontWeight:600, fontSize:13}}>{sol._isHE ? 'Horas Extra' : (SOL_TIPO_LABELS_M[sol.tipo] || sol.tipo)}</div>
                    <div style={{fontSize:11, color:'var(--fg-muted)'}}>{sol._isHE ? `${sol.fecha} · ${sol.horas_estimadas} horas` : `${sol.fecha_inicio} — ${sol.fecha_fin} · ${sol.dias_habiles} días`}</div>
                  </div>
                </div>
                <span className={'badge ' + solEstadoBadgeM(sol.estado)} style={{fontSize:11}}>{sol._isHE ? sol.estado : SOL_ESTADO_LABELS_M[sol.estado]}</span>
              </div>
              {comentario && (
                <div style={{marginTop: 8, padding: 8, backgroundColor: 'var(--bg-subtle)', borderRadius: 6, fontSize: 11, color: 'var(--fg-subtle)'}}>
                  <span style={{fontWeight: 600}}>Obs:</span> {comentario}
                </div>
              )}
            </div>
          );
        })
      }
    </div>
  );

  // ── Pantalla nueva solicitud — paso a paso ───────────────────────────────────
  if (screen === 'nueva') {
    const tiposOrdenados = Object.entries(SOL_TIPO_LABELS_M);
    return (
      <div style={{padding:'16px 14px', overflowY:'auto', height:'100%', display:'flex', flexDirection:'column'}}>
        <div className="row" style={{alignItems:'center', marginBottom:16, gap:8}}>
          <button className="btn btn-secondary btn-sm" onClick={() => setScreen('home')}>{I.chevLeft}</button>
          <div style={{fontWeight:700, fontSize:15}}>Nueva solicitud · Paso {paso} de {reqDoc ? 4 : 3}</div>
        </div>

        {paso === 1 && (
          <div style={{flex:1}}>
            <div className="text-muted" style={{fontSize:12, marginBottom:12}}>Selecciona el tipo de solicitud</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
              {tiposOrdenados.map(([k, v]) => (
                <button
                  key={k} type="button"
                  className={'btn ' + (form.tipo === k ? 'btn-primary' : 'btn-secondary')}
                  style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 8px', height:'auto', fontSize:12}}
                  onClick={() => setForm(f => ({...f, tipo: k}))}
                >
                  <span style={{width:22, height:22}}>{SOL_TIPO_ICONS_M[k]}</span>
                  {v}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" style={{width:'100%', marginTop:16}}
              onClick={() => setPaso(2)}>
              Continuar
            </button>
          </div>
        )}

        {paso === 2 && (
          <div style={{flex:1}}>
            <div className="text-muted" style={{fontSize:12, marginBottom:12}}>Selecciona las fechas</div>
            {form.tipo === 'vacaciones' && (
              <div className="card" style={{padding:'8px 12px', marginBottom:12, background:'rgba(6,182,212,0.08)'}}>
                <div style={{fontSize:12}}>Saldo vacaciones: <strong style={{color:'var(--cyan)'}}>{saldoVac.saldo} días</strong> disponibles</div>
              </div>
            )}
            <div className="input-group" style={{marginBottom:12}}>
              <label>Fecha inicio</label>
              <input className="input" type="date" value={form.fecha_inicio}
                onChange={e => setForm(f => ({...f, fecha_inicio: e.target.value}))}/>
            </div>
            <div className="input-group" style={{marginBottom:12}}>
              <label>Fecha fin</label>
              <input className="input" type="date" value={form.fecha_fin} min={form.fecha_inicio}
                onChange={e => setForm(f => ({...f, fecha_fin: e.target.value}))}/>
            </div>
            <div style={{padding:'10px 12px', background:'var(--bg-subtle)', borderRadius:8, fontSize:14, fontWeight:600, marginBottom:12}}>
              Días calendario: {diasHabiles}
              {excedeSaldo && <span style={{color:'var(--red)', fontWeight:400, fontSize:12, display:'block', marginTop:2}}>Supera tu saldo disponible ({saldoVac.saldo} días)</span>}
            </div>
            <div className="row" style={{gap:10, marginTop:8}}>
              <button className="btn btn-secondary" style={{flex:1}} onClick={() => setPaso(1)}>{I.chevLeft} Atrás</button>
              <button className="btn btn-primary" style={{flex:2}} disabled={diasHabiles <= 0 || excedeSaldo}
                onClick={() => setPaso(3)}>
                Continuar
              </button>
            </div>
          </div>
        )}

        {paso === 3 && (
          <div style={{flex:1}}>
            <div className="text-muted" style={{fontSize:12, marginBottom:12}}>Motivo{reqDoc && ' y documento'}</div>
            <div className="input-group" style={{marginBottom:12}}>
              <label>Motivo *</label>
              <textarea className="input" rows={4} value={form.motivo}
                onChange={e => setForm(f => ({...f, motivo: e.target.value}))}
                placeholder="Describe el motivo de tu solicitud..."/>
            </div>
            {reqDoc && (
              <div className="input-group" style={{marginBottom:12}}>
                <label>URL del documento adjunto *</label>
                <input className="input" type="url" placeholder="https://..." value={form.documento_url}
                  onChange={e => setForm(f => ({...f, documento_url: e.target.value}))}/>
                <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Requerido para este tipo de licencia.</div>
              </div>
            )}
            <div className="row" style={{gap:10, marginTop:8}}>
              <button className="btn btn-secondary" style={{flex:1}} onClick={() => setPaso(2)}>{I.chevLeft} Atrás</button>
              <button className="btn btn-primary" style={{flex:2}} disabled={!form.motivo.trim()}
                onClick={() => setPaso(4)}>
                Revisar
              </button>
            </div>
          </div>
        )}

        {paso === 4 && (
          <div style={{flex:1}}>
            <div className="text-muted" style={{fontSize:12, marginBottom:12}}>Confirma tu solicitud</div>
            <div className="card" style={{padding:14, marginBottom:14}}>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
                <span style={{width:20, height:20, color:'var(--fg-muted)'}}>{SOL_TIPO_ICONS_M[form.tipo]}</span>
                <div style={{fontWeight:700, fontSize:15}}>{SOL_TIPO_LABELS_M[form.tipo]}</div>
              </div>
              <div style={{fontSize:13, lineHeight:1.7}}>
                <div><strong>Desde:</strong> {form.fecha_inicio}</div>
                <div><strong>Hasta:</strong> {form.fecha_fin}</div>
                <div><strong>Días calendario:</strong> {diasHabiles}</div>
                <div style={{marginTop:8, color:'var(--fg-muted)'}}>{form.motivo}</div>
              </div>
            </div>
            <div className="row" style={{gap:10}}>
              <button className="btn btn-secondary" style={{flex:1}} onClick={() => setPaso(3)}>{I.chevLeft} Atrás</button>
              <button className="btn btn-primary" style={{flex:2}} onClick={enviarSolicitud} disabled={saving}>
                {saving ? 'Enviando...' : 'Confirmar y enviar'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Pantalla nueva solicitud HE ───────────────────────────────────────
  if (screen === 'nueva_he') {
    return (
      <div style={{padding:'16px 14px', overflowY:'auto', height:'100%', display:'flex', flexDirection:'column'}}>
        <div className="row" style={{alignItems:'center', marginBottom:16, gap:8}}>
          <button className="btn btn-secondary btn-sm" onClick={() => setScreen('home')}>{I.chevLeft}</button>
          <div style={{fontWeight:700, fontSize:15}}>Solicitar Horas Extra</div>
        </div>

        {paso === 1 && (
          <div style={{flex:1}}>
            <div className="text-muted" style={{fontSize:12, marginBottom:12}}>Detalles de horas extra</div>
            <div className="input-group" style={{marginBottom:12}}>
              <label>Fecha</label>
              <input className="input" type="date" value={formHE.fecha}
                onChange={e => setFormHE(f => ({...f, fecha: e.target.value}))}/>
            </div>
            <div className="input-group" style={{marginBottom:12}}>
              <label>Horas estimadas</label>
              <input className="input" type="number" min="0.5" step="0.5" value={formHE.horas_estimadas}
                onChange={e => setFormHE(f => ({...f, horas_estimadas: e.target.value}))}/>
            </div>
            <div className="input-group" style={{marginBottom:12}}>
              <label>Motivo / Actividad a realizar *</label>
              <textarea className="input" rows={4} value={formHE.motivo}
                onChange={e => setFormHE(f => ({...f, motivo: e.target.value}))}
                placeholder="Explica qué trabajo necesitas completar..."/>
            </div>

            <div className="row" style={{gap:10, marginTop:16}}>
              <button className="btn btn-primary" style={{flex:1}} disabled={!formHE.motivo.trim() || Number(formHE.horas_estimadas) <= 0}
                onClick={() => setPaso(2)}>
                Revisar
              </button>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div style={{flex:1}}>
            <div className="text-muted" style={{fontSize:12, marginBottom:12}}>Confirma tu solicitud de horas extra</div>
            <div className="card" style={{padding:14, marginBottom:14}}>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
                <span style={{width:20, height:20, color:'var(--cyan)'}}>{I.clock}</span>
                <div style={{fontWeight:700, fontSize:15}}>Horas Extra</div>
              </div>
              <div style={{fontSize:13, lineHeight:1.7}}>
                <div><strong>Fecha:</strong> {formHE.fecha}</div>
                <div><strong>Estimado:</strong> {formHE.horas_estimadas} horas</div>
                <div style={{marginTop:8, color:'var(--fg-muted)'}}>{formHE.motivo}</div>
              </div>
            </div>
            <div className="row" style={{gap:10}}>
              <button className="btn btn-secondary" style={{flex:1}} onClick={() => setPaso(1)}>{I.chevLeft} Atrás</button>
              <button className="btn btn-primary" style={{flex:2}} onClick={enviarSolicitudHE} disabled={saving}>
                {saving ? 'Enviando...' : 'Confirmar y enviar'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Pantalla acción (aprobar/rechazar) ───────────────────────────────────────
  if (screen === 'accion') {
    const accionSol = accionIsHE ? autorizacionesHE.find(s => s.id === accionSolId) : solicitudes.find(s => s.id === accionSolId);
    const esRechazo = accionTipo === 'rechazar_jefe';
    return (
      <div style={{padding:'16px 14px', overflowY:'auto', height:'100%', display:'flex', flexDirection:'column'}}>
        <div className="row" style={{alignItems:'center', marginBottom:16, gap:8}}>
          <button className="btn btn-secondary btn-sm" onClick={() => setScreen('home')}>{I.chevLeft}</button>
          <div style={{fontWeight:700, fontSize:15}}>{esRechazo ? 'Rechazar' : 'Aprobar'} solicitud</div>
        </div>
        {accionSol && (
          <div className="card" style={{padding:14, marginBottom:14}}>
            <div style={{fontWeight:600, fontSize:14}}>{accionSol.personal_nombre}</div>
            <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>{accionIsHE ? 'Horas Extra' : SOL_TIPO_LABELS_M[accionSol.tipo]} · {accionIsHE ? `${accionSol.horas_estimadas} horas` : `${accionSol.dias_habiles} días`}</div>
            <div style={{fontSize:12, color:'var(--fg-muted)'}}>{accionIsHE ? accionSol.fecha : `${accionSol.fecha_inicio} — ${accionSol.fecha_fin}`}</div>
            <div style={{fontSize:12, marginTop:8}}>{accionSol.motivo}</div>
          </div>
        )}
        <div className="input-group" style={{marginBottom:14}}>
          <label>{esRechazo ? 'Motivo del rechazo *' : 'Comentario (opcional)'}</label>
          <textarea className="input" rows={3} value={accionComentario}
            onChange={e => setAccionComentario(e.target.value)}
            placeholder={esRechazo ? 'Obligatorio' : 'Opcional'}/>
        </div>
        <div className="row" style={{gap:10, marginTop:'auto'}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={() => setScreen('home')}>Cancelar</button>
          <button
            className={'btn ' + (esRechazo ? 'btn-secondary' : 'btn-primary')}
            style={{flex:2, ...(esRechazo ? {color:'var(--red)', borderColor:'var(--red)'} : {})}}
            onClick={ejecutarAccion} disabled={accionSaving}
          >
            {accionSaving ? 'Procesando...' : (esRechazo ? 'Confirmar rechazo' : 'Confirmar aprobación')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista mobile — Perfil Administrativo: "Mi registro del día"
// ─────────────────────────────────────────────────────────────────────────────
function AdministrativoView({ screen, setScreen }) {
  const {
    empresa, personalAdmin, authUser, centrosCosto, ots, addNotificacion,
    perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles = [],
  } = useApp();
  const hoy = new Date().toISOString().slice(0, 10);
  const modoVistaSociedadTareoAdmin = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });

  // Colaborador actual
  const personalActual = useMemo(() => {
    const uid = authUser?.id || authUser?.user_id;
    const email = (authUser?.email || '').toLowerCase().trim();
    return (personalAdmin || []).find(p =>
      (uid && (p.auth_user_id === uid || p.id === uid)) ||
      (email && (p.email || '').toLowerCase().trim() === email)
    ) || null;
  }, [authUser, personalAdmin]);

  // Estado principal
  const [otsAsignadas, setOtsAsignadas] = useState([]);
  const [tareosDia, setTareosDia] = useState([]);
  const [cecos, setCecos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Tareo libre — líneas
  const [lineasLibres, setLineasLibres] = useState([]);

  // Formulario OT seleccionada
  const [otSelId, setOtSelId] = useState(null);
  const [formOT, setFormOT] = useState({ horas: '', descripcion: '' });
  const [savingOT, setSavingOT] = useState(false);
  const [savingEnvio, setSavingEnvio] = useState(false);
  const [confirmEnvio, setConfirmEnvio] = useState(false);

  useEffect(() => {
    if (!empresa?.id || !personalActual?.id) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      tareosAdminService.cargarOTsAdminDelDia(empresa.id, personalActual.id),
      tareosAdminService.cargarTareos(empresa.id, { personalId: personalActual.id, fecha: hoy }),
      tareosAdminService.cargarCecosActivos(empresa.id, modoVistaSociedadTareoAdmin.sociedadIdEscritura),
    ]).then(([otsRes, tareosRes, cecosRes]) => {
      setOtsAsignadas(otsRes);
      setTareosDia(tareosRes);
      setCecos(cecosRes);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [empresa?.id, personalActual?.id, modoVistaSociedadTareoAdmin.sociedadIdEscritura]);

  const tareoDeOT = (otId) => tareosDia.find(t => t.ot_id === otId && t.tipo === 'ot');

  const registrarHorasOT = async () => {
    if (!formOT.horas || !formOT.descripcion.trim()) {
      addNotificacion('Completa horas y descripción.');
      return;
    }
    setSavingOT(true);
    try {
      const ot = otsAsignadas.find(o => o.id === otSelId);
      const nuevo = await tareosAdminService.crearTareo(empresa.id, {
        personal_id:    personalActual.id,
        personal_nombre: personalActual.nombre,
        fecha:          hoy,
        horas:          Number(formOT.horas),
        descripcion:    formOT.descripcion.trim(),
        tipo:           'ot',
        ot_id:          otSelId,
        estado:         'borrador',
        origen:         'mobile',
      });
      setTareosDia(prev => [...prev, nuevo]);
      addNotificacion(`Horas registradas para ${ot?.numero || 'la OT'}.`);
      setOtSelId(null);
      setFormOT({ horas: '', descripcion: '' });
      setScreen('home');
    } catch (err) {
      addNotificacion('Error: ' + err.message);
    } finally {
      setSavingOT(false);
    }
  };

  const registrarLineaLibre = async (linea) => {
    if (!linea.ceco_id || !linea.horas || !linea.descripcion.trim()) return;
    try {
      const ceco = cecos.find(c => c.id === linea.ceco_id);
      const nuevo = await tareosAdminService.crearTareo(empresa.id, {
        personal_id:    personalActual.id,
        personal_nombre: personalActual.nombre,
        fecha:          hoy,
        horas:          Number(linea.horas),
        descripcion:    linea.descripcion.trim(),
        tipo:           'libre',
        ceco_id:        linea.ceco_id,
        ceco_nombre:    ceco?.nombre || '',
        estado:         'borrador',
        origen:         'mobile',
      });
      setTareosDia(prev => [...prev, nuevo]);
    } catch (_err) { /* falla silenciosa, se reintenta al enviar */ }
  };

  const enviarRegistroDia = async () => {
    // Guardar líneas libres pendientes
    for (const l of lineasLibres) {
      if (l.ceco_id && l.horas && l.descripcion.trim()) {
        await registrarLineaLibre(l).catch(() => {});
      }
    }
    setSavingEnvio(true);
    try {
      await tareosAdminService.enviarTareosDia(empresa.id, personalActual.id, hoy);
      const actualizados = tareosDia.map(t => ({ ...t, estado: 'enviado' }));
      setTareosDia(actualizados);
      setLineasLibres([]);
      addNotificacion('Registro del día enviado.');
      setConfirmEnvio(false);
    } catch (err) {
      addNotificacion('Error: ' + err.message);
    } finally {
      setSavingEnvio(false);
    }
  };

  const otsSinRegistro = otsAsignadas.filter(o => !tareoDeOT(o.id));
  const yaTodoEnviado = tareosDia.length > 0 && tareosDia.every(t => t.estado === 'enviado');

  // ── Pantalla: registrar horas de OT ────────────────────────────────────────
  if (screen === 'reg_ot' && otSelId) {
    const ot = otsAsignadas.find(o => o.id === otSelId);
    const pa = (ot?.participantes_admin || []).find(a => a.personal_id === personalActual?.id);
    return (
      <div style={{padding:'16px 14px', overflowY:'auto', height:'100%', display:'flex', flexDirection:'column'}}>
        <div className="row" style={{alignItems:'center', marginBottom:16, gap:8}}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setOtSelId(null); setScreen('home'); }}>{I.chevLeft}</button>
          <div style={{fontWeight:700, fontSize:15}}>Registrar horas en OT</div>
        </div>
        <div className="card" style={{padding:14, marginBottom:14}}>
          <div style={{fontWeight:700, fontSize:14}}>{ot?.numero || '—'}</div>
          <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>{ot?.descripcion || '—'}</div>
          {pa?.horas_estimadas && (
            <div style={{fontSize:11, color:'var(--cyan)', marginTop:4}}>Horas estimadas: {pa.horas_estimadas}h</div>
          )}
        </div>
        <div className="col" style={{gap:12, flex:1}}>
          <div className="input-group">
            <label>Horas trabajadas hoy <span style={{color:'var(--danger)'}}>*</span></label>
            <input className="input" type="number" min="0.5" max="24" step="0.5"
              value={formOT.horas} onChange={e => setFormOT(f => ({...f, horas: e.target.value}))}
              placeholder="Ej. 4" />
          </div>
          <div className="input-group">
            <label>Descripción de la actividad <span style={{color:'var(--danger)'}}>*</span></label>
            <textarea className="input" rows={4}
              value={formOT.descripcion} onChange={e => setFormOT(f => ({...f, descripcion: e.target.value}))}
              placeholder="¿Qué hiciste hoy en esta OT?" />
          </div>
        </div>
        <button className="btn btn-primary" style={{width:'100%', marginTop:16}}
          onClick={registrarHorasOT} disabled={savingOT}>
          {savingOT ? 'Guardando...' : `${I.check} Guardar`}
        </button>
      </div>
    );
  }

  // ── Pantalla home ───────────────────────────────────────────────────────────
  if (loading) return <div style={{padding:24, textAlign:'center', color:'var(--fg-muted)'}}>Cargando...</div>;

  return (
    <div style={{padding:'16px 14px', overflowY:'auto', height:'100%'}}>
      <div style={{fontWeight:700, fontSize:17, marginBottom:2}}>Mi registro del día</div>
      <div style={{fontSize:12, color:'var(--fg-muted)', marginBottom:16}}>{hoy}</div>

      {/* OTs asignadas */}
      {otsAsignadas.length > 0 && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12, fontWeight:700, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>
            OTs asignadas
            {otsSinRegistro.length > 0 && (
              <span className="badge badge-orange" style={{marginLeft:8, fontSize:10}}>{otsSinRegistro.length} sin registrar</span>
            )}
          </div>
          {otsAsignadas.map(ot => {
            const tareo = tareoDeOT(ot.id);
            return (
              <div key={ot.id} className="card" style={{padding:12, marginBottom:8, border: tareo ? '1px solid var(--border)' : '1px solid var(--orange)'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontWeight:700, fontSize:13}}>{ot.numero}</div>
                    <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:2}}>{ot.descripcion || '—'}</div>
                  </div>
                  {tareo
                    ? <span className="badge badge-green" style={{fontSize:11}}>✓ {tareo.horas}h</span>
                    : (
                      <button className="btn btn-primary btn-sm"
                        onClick={() => { setOtSelId(ot.id); setFormOT({ horas: '', descripcion: '' }); setScreen('reg_ot'); }}>
                        Registrar
                      </button>
                    )
                  }
                </div>
                {tareo && (
                  <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:6, borderTop:'1px solid var(--border)', paddingTop:6}}>
                    {tareo.descripcion}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Otras actividades del día */}
      <div style={{marginBottom:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <div style={{fontSize:12, fontWeight:700, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em'}}>
            Otras actividades
          </div>
          <button className="btn btn-ghost" style={{fontSize:11}}
            onClick={() => setLineasLibres(prev => [...prev, { ceco_id: '', horas: '', descripcion: '' }])}>
            {I.plus} Agregar
          </button>
        </div>
        {/* tareos libres ya enviados hoy */}
        {tareosDia.filter(t => t.tipo === 'libre').map(t => (
          <div key={t.id} className="card" style={{padding:10, marginBottom:8, opacity:0.8}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div>
                <div style={{fontSize:12, fontWeight:600}}>{t.ceco_nombre || '—'}</div>
                <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:2}}>{t.descripcion}</div>
              </div>
              <span className="badge badge-gray" style={{fontSize:11}}>{t.horas}h</span>
            </div>
          </div>
        ))}
        {/* líneas pendientes de guardar */}
        {lineasLibres.map((l, idx) => (
          <div key={idx} className="card" style={{padding:12, marginBottom:8, border:'1px solid var(--cyan)'}}>
            <div className="col" style={{gap:8}}>
              <select className="select" value={l.ceco_id}
                onChange={e => setLineasLibres(prev => prev.map((x, i) => i === idx ? {...x, ceco_id: e.target.value} : x))}>
                <option value="">Seleccionar CECO...</option>
                {cecos.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ''}{c.nombre}</option>)}
              </select>
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <input className="input" type="number" min="0.5" max="24" step="0.5" placeholder="Horas"
                  value={l.horas} style={{width:90}}
                  onChange={e => setLineasLibres(prev => prev.map((x, i) => i === idx ? {...x, horas: e.target.value} : x))} />
                <input className="input" placeholder="Descripción de la actividad" style={{flex:1}}
                  value={l.descripcion}
                  onChange={e => setLineasLibres(prev => prev.map((x, i) => i === idx ? {...x, descripcion: e.target.value} : x))} />
                <button className="icon-btn"
                  onClick={() => setLineasLibres(prev => prev.filter((_, i) => i !== idx))}>{I.x}</button>
              </div>
            </div>
          </div>
        ))}
        {lineasLibres.length === 0 && tareosDia.filter(t => t.tipo === 'libre').length === 0 && (
          <div className="text-muted" style={{fontSize:12, textAlign:'center', padding:8}}>Sin actividades libres registradas.</div>
        )}
      </div>

      {/* Enviar registro */}
      {yaTodoEnviado ? (
        <div className="card" style={{padding:14, textAlign:'center', borderColor:'var(--green)'}}>
          <div style={{color:'var(--green)', fontWeight:700, fontSize:14}}>✓ Registro del día enviado</div>
          <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>El equipo puede ver tu registro de hoy.</div>
        </div>
      ) : confirmEnvio ? (
        <div className="card" style={{padding:14, border:'1px solid var(--orange)'}}>
          {otsSinRegistro.length > 0 && (
            <div style={{fontSize:12, color:'var(--orange)', marginBottom:10}}>
              Tienes {otsSinRegistro.length} OT(s) sin registrar horas. ¿Enviar igual?
            </div>
          )}
          <div className="row" style={{gap:8}}>
            <button className="btn btn-secondary" style={{flex:1}} onClick={() => setConfirmEnvio(false)}>Cancelar</button>
            <button className="btn btn-primary" style={{flex:2}} onClick={enviarRegistroDia} disabled={savingEnvio}>
              {savingEnvio ? 'Enviando...' : 'Sí, enviar registro'}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" style={{width:'100%'}} onClick={() => setConfirmEnvio(true)}>
          {I.check} Enviar registro del día
        </button>
      )}
    </div>
  );
}

export { MobileFieldView };

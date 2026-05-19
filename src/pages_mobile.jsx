import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { rrhhService } from './services/rrhhService.js';
import { PHONE_PATTERN, isValidPhone, isValidRuc, sanitizePhone, sanitizeRuc } from './lib/formValidators.js';

// Mobile field views - all field profiles

function MobileFieldView({ onExit, profile, setProfile, dark, setDark }) {
  const { authUser, usuarios, personalAdmin, personalOperativo, role } = useApp();
  const [screen, setScreen] = useState('home');
  const trabajadorAsistencia = getTrabajadorAsistenciaMovil({ authUser, usuarios, personalAdmin, personalOperativo });
  // Usar role.permisos.campo_modulos (de membresiaActiva, disponible desde el login)
  // en lugar de buscar en usuarios[] que puede estar vacío por RLS para roles no-admin.
  const modulosUsuario = (role?.permisos?.campo_modulos?.length ? role.permisos.campo_modulos : null)
    ?? getUsuarioCampoModulos(authUser, usuarios);
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
              {profile === 'tecnico' && <TecnicoView screen={screen} setScreen={setScreen}/>}
              {profile === 'logistica' && <LogisticaView screen={screen} setScreen={setScreen}/>}
              {profile === 'vendedor' && <VendedorView screen={screen} setScreen={setScreen} dark={dark} setDark={setDark} onExit={onExit} profile={profile} setProfile={setProfile}/>}
              {profile === 'compras' && <ComprasView screen={screen} setScreen={setScreen}/>}
              {profile === 'supervisor' && <SupervisorView screen={screen} setScreen={setScreen}/>}
              {profile === 'gerencia' && <GerenciaView screen={screen} setScreen={setScreen}/>}
              {profile === 'asistencia' && <AsistenciaMobileView screen={screen} setScreen={setScreen}/>}
            </div>
          </div>
        </div>
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
    return p.id === authUser?.id ||
      p.id === usuarioMovil.id ||
      (emailAuth && email === emailAuth) ||
      (usuarioSlug && nombreSlug === usuarioSlug);
  }) || null;
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
  const { authUser, usuarios, addNotificacion, registrosAsistencia, setRegistrosAsistencia, empresa, personalAdmin, personalOperativo, turnos } = useApp();
  const [loading, setLoading] = useState(false);
  const [geoEstado, setGeoEstado] = useState('');
  
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const trabajadorActual = getTrabajadorAsistenciaMovil({ authUser, usuarios, personalAdmin, personalOperativo });
  
  const hoy = new Date();
  const today = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  const trabajadorId = trabajadorActual?.id || '';
  const turnoIdPersistible = turnos?.some(t => t.id === trabajadorActual?.turno_id) ? trabajadorActual.turno_id : null;
  
  // Estado local para gobernar el flujo: entrada -> salida -> completado
  const [modo, setModo] = useState('entrada');

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
    } else {
      setModo('entrada');
    }
  }, [registrosAsistencia, trabajadorId, today]);

  const manejarMarcacion = async () => {
    if (modo === 'completado') return;
    if (!trabajadorId) {
      addNotificacion('No encuentro un colaborador habilitado para asistencia móvil. Revisa el email y el permiso en Personal.');
      return;
    }
    if (!turnoIdPersistible) {
      addNotificacion('Tu ficha no tiene un turno real asignado. Pide a RRHH asignarte un turno creado en Supabase.');
      return;
    }
    setLoading(true);
    setGeoEstado('Obteniendo ubicación...');
    
    let lat = null, lng = null;
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (error) {
        addNotificacion('No se pudo obtener la ubicación exacta. Asegúrate de dar permisos.');
      }
    } else {
      addNotificacion('Geolocalización no soportada en este dispositivo.');
    }

    const ahora = new Date();
    const horaActual = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
    
    if (modo === 'entrada') {
      const nuevoRegistro = {
        empresa_id: empresa?.id || 'emp_001',
        trabajador_id: trabajadorId,
        trabajador_tipo: trabajadorActual.trabajador_tipo,
        fecha: today,
        turno_id: turnoIdPersistible,
        hora_entrada: horaActual,
        hora_salida: null,
        latitud: lat,
        longitud: lng,
        refrigerio_tomado_minutos: 0,
        estado: 'incompleto',
        es_falta: false,
        justificada: false,
        origen_registro: 'mobile_pwa',
        notas: 'Marcación móvil (Modo Campo)'
      };
      
      try {
        const data = await rrhhService.registrarAsistencia(empresa?.id || 'emp_001', nuevoRegistro);
        setRegistrosAsistencia(prev => [data, ...prev]);
        addNotificacion(`Entrada registrada a las ${horaActual}`);
      } catch (e) {
        setRegistrosAsistencia(prev => [{...nuevoRegistro, id: `asis_${Date.now()}`}, ...prev]);
        addNotificacion(`Error BD (Entrada): ${e.message || JSON.stringify(e)}`);
      }
      setModo('salida');
    } else if (modo === 'salida') {
      const abierto = registrosAsistencia.find(r => r.trabajador_id === trabajadorId && r.fecha === today && !r.hora_salida);
      if (abierto) {
        const cambios = { ...abierto, hora_salida: horaActual, estado: 'completo', latitud_salida: lat, longitud_salida: lng, origen_registro: 'mobile_pwa' };
        try {
          if (abierto.id) {
             const data = await rrhhService.actualizarAsistencia(abierto.id, cambios);
             setRegistrosAsistencia(prev => prev.map(r => r.id === abierto.id ? data : r));
          } else {
             const updated = { ...abierto, ...cambios };
             setRegistrosAsistencia(prev => prev.map(r => r.id === abierto.id ? updated : r));
          }
          addNotificacion(`Salida registrada a las ${horaActual}`);
        } catch (e) {
          const updated = { ...abierto, ...cambios };
          setRegistrosAsistencia(prev => prev.map(r => r.id === abierto.id ? updated : r));
          addNotificacion(`Error BD (Salida): ${e.message || JSON.stringify(e)}`);
        }
      }
      setModo('completado');
    }
    
    setLoading(false);
    setGeoEstado('');
  };

  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Control de Asistencia</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>{usuarioMovil.nombre}</div></div>
      <div className="avatar" style={{width:34,height:34}}>{usuarioMovil.iniciales}</div>
    </div>
    
    <div className="mobile-content" style={{display:'flex', flexDirection:'column', justifyContent: 'flex-start', alignItems:'center', minHeight:'calc(100vh - 140px)', padding: '20px'}}>
      <div className="font-display" style={{fontSize:38, fontWeight:700, marginBottom:4, textAlign:'center', color:'var(--fg)'}}>
        {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
      </div>
      <div className="text-muted" style={{fontSize:14, marginBottom:30, textAlign:'center', textTransform:'capitalize'}}>
        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
      
      <div style={{position:'relative', width:220, height:220, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:30}}>
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
      </div>
      
      {loading && <div className="text-muted" style={{fontSize:14, fontWeight:600, marginBottom:20}}>{I.mapPin} {geoEstado}</div>}
      
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
            {r.latitud && <div style={{fontSize:12, color:'var(--fg-muted)', background:'var(--bg)', padding:8, borderRadius:6}}>{I.mapPin} Ingreso: {r.latitud}, {r.longitud}</div>}
            {r.latitud_salida && <div style={{fontSize:12, color:'var(--fg-muted)', background:'var(--bg)', padding:8, borderRadius:6, marginTop:4}}>{I.mapPin} Salida: {r.latitud_salida}, {r.longitud_salida}</div>}
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
  </>;
}

function TecnicoView({ screen, setScreen }) {
  const { ots, cuentas, partes, personalOperativo, registrarParteDiario, authUser, usuarios } = useApp();
  const [selectedOt, setSelectedOt] = useState(null);
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
  const enviarParte = () => {
    const ot = selectedOt || otsTecnico[0];
    if (!ot) return;
    registrarParteDiario({
      ot_id: ot.id,
      tecnico_id: tecnico.id,
      tecnico: tecnico.nombre,
      fecha: today,
      horas: 8,
      avance_reportado: 25,
      actividad: `Ejecucion en campo de ${ot.numero || ot.id}`,
      evidencias: [{ tipo: 'foto', nombre: 'evidencia_campo.jpg' }],
      registrado_desde: 'campo',
    });
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
              <button className="btn btn-sm btn-primary flex-1" onClick={()=>{ setSelectedOt(o); setScreen('parte'); }}>{I.play} Parte</button>
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
        <div onClick={()=>setScreen('home')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:10,cursor:'pointer'}}>← Volver</div>
        <div className="eyebrow">Almacén Móvil</div>
        <div className="font-display" style={{fontSize:18,fontWeight:700,margin:'4px 0 16px'}}>Escanear Código de Barras</div>
        <div style={{height:200, background:'linear-gradient(135deg, #1A2B4A, #0F1B30)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', marginBottom:20}}>
          <div style={{width:'60%', height:2, background:'var(--cyan)', position:'absolute', boxShadow:'0 0 10px var(--cyan)'}}></div>
          <div style={{color:'rgba(255,255,255,0.5)'}}>[ Simulador de Cámara ]</div>
        </div>
        <p className="text-muted" style={{fontSize:12, textAlign:'center'}}>Apunta la cámara al código del repuesto para registrarlo en tu consumo diario automáticamente.</p>
      </>}
      {screen === 'parte' && <>
        <div onClick={()=>setScreen('home')} style={{fontSize:12,color:'var(--cyan-dk)',marginBottom:10,cursor:'pointer'}}>← OTs de hoy</div>
        <div className="eyebrow">Parte diario · Paso 4 de 5</div>
        <div className="font-display" style={{fontSize:18,fontWeight:700,margin:'4px 0 16px'}}>{selectedOt?.numero || selectedOt?.id || 'Evidencias'}</div>
        <div className="bar" style={{marginBottom:20}}><div style={{width:'80%',background:'var(--cyan)'}}/></div>
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
      <div className="mobile-nav-item">{I.alert}Incidencias</div>
      <div className="mobile-nav-item">{I.settings}Ajustes</div>
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
  const { agendaEventos, cuentas, contactos, oportunidades, cotizaciones, actividades, leads, historialEstados, oppHistorialEtapas, updateLeadState, convertirLead, descartarLead, actualizarAgendaEvento, crearAgendaEvento, actualizarEtapaOportunidad, marcarPerdida, searchQuery, crearLead, industrias, registrarActividad, authUser, usuarios, role, membresiaActiva, empresa, dataMode, supabaseStatus, signOut, notificaciones, markNotificacionesRead, addNotificacion, monedasActivas } = useApp();
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
  const [modalConvertirLead, setModalConvertirLead] = useState(null);
  const [convertirForm, setConvertirForm] = useState(null);
  const [convertirError, setConvertirError] = useState('');
  const [modalPerderOpp, setModalPerderOpp] = useState(null);
  const [motivoPerdida, setMotivoPerdida] = useState('');
  const [perdidaError, setPerdidaError] = useState('');
  const [drawerItem, setDrawerItem] = useState(null); // { type: 'lead'|'opp', data: object }
  const [drawerTab, setDrawerTab] = useState('timeline');
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
    if (destino === 'calificado' && !(lead.presupuesto_estimado > 0)) {
      setMovError('Para calificar debes registrar un presupuesto estimado desde el desktop.');
      return;
    }
    if (!movMotivo.trim()) { setMovError('El motivo es obligatorio.'); return; }
    if (destino === 'descartado') descartarLead(lead.id, movMotivo.trim());
    else updateLeadState(lead.id, destino, movMotivo.trim());
    setModalMovLead(null);
    setMovMotivo('');
    setMovError('');
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
      const { getSupabaseClient } = await import('./lib/supabaseClient.js');
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
                  {(industrias || []).map(i => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
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
                {(industrias || []).map(i => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
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
                  onClick={e => { if (e.target === e.currentTarget) setModalMovLead(null); }}>
                  <div style={{background:'var(--bg)', borderRadius:'16px 16px 0 0', padding:20, width:'100%', boxSizing:'border-box'}}>
                    <div style={{fontWeight:700, fontSize:15, marginBottom:12, color:'var(--navy)'}}>
                      {MOV_CFG[modalMovLead.destino]?.titulo || 'Cambiar estado'}
                    </div>
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
                      <button className="btn btn-secondary flex-1" onClick={() => setModalMovLead(null)}>Cancelar</button>
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
  const { authUser, usuarios } = useApp();
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Compras</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>{usuarioMovil.nombre}</div></div>
      <div className="avatar" style={{width:34,height:34}}>{usuarioMovil.iniciales}</div>
    </div>
    <div className="mobile-content">
      <div className="eyebrow" style={{marginBottom:10}}>Capturar factura · Paso 2 de 3</div>
      <div className="bar" style={{marginBottom:16}}><div style={{width:'66%',background:'var(--cyan)'}}/></div>
      <div className="card" style={{padding:0,overflow:'hidden',marginBottom:14}}>
        <div style={{background:'linear-gradient(135deg,#1A2B4A,#0F1B30)',height:120,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.5)',position:'relative'}}>
          <div style={{position:'absolute',top:8,right:8}} className="badge badge-cyan">Foto capturada</div>
          {I.receipt}
        </div>
      </div>
      <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Verifica los datos extraídos por IA</div>
      {[
        {l:'Proveedor', v:'Ferretería Industrial SAC'},
        {l:'N° documento', v:'F001-2341'},
        {l:'Fecha', v:'22/04/2026'},
        {l:'Monto', v:'S/ 450.00'},
      ].map((f,i)=>(
        <div key={i} style={{padding:10,border:'1px solid var(--border)',borderRadius:8,marginBottom:8}}>
          <div className="row" style={{justifyContent:'space-between',marginBottom:2}}>
            <div className="eyebrow" style={{fontSize:10}}>{f.l}</div>
            <span className="badge badge-purple" style={{fontSize:9,padding:'1px 6px'}}>IA</span>
          </div>
          <div style={{fontWeight:600,fontSize:13}}>{f.v}</div>
        </div>
      ))}
      <button className="btn btn-primary btn-lg" style={{width:'100%',marginTop:10}}>Siguiente → Asignar OT</button>
    </div>
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
  const { ots, cotizaciones, authUser, usuarios } = useApp();
  const usuarioMovil = getUsuarioMovil(authUser, usuarios);
  const cxcVencida = MOCK.cxc.filter(c => c.estado === 'vencida').reduce((s, c) => s + c.saldo, 0);
  const otsActivas = ots.filter(o => o.estado === 'programada' || o.estado === 'ejecucion').length;
  const cotAprobar = cotizaciones.filter(c => c.estado === 'enviada' || c.estado === 'negociacion').length;
  const margen = MOCK.biFinanciero.resumen.margen_bruto_pct;

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

export { MobileFieldView };

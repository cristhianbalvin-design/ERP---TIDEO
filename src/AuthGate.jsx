import React, { useState } from 'react';
import { useApp } from './context.jsx';
import { I } from './icons.jsx';
import { getSupabaseClient } from './lib/supabaseClient.js';

function SplashLoading({ message, duration }) {
  return (
    <div className="app-shell" style={{
      alignItems:'center', 
      justifyContent:'center', 
      background:'#1A2B4A', 
      backgroundImage: `url('/bg_login.jpg')`,
      backgroundRepeat: 'repeat',
      backgroundSize: '1000px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        width: '150%',
        height: '150%',
        background: 'radial-gradient(circle at center, rgba(0,188,212,0.1) 0%, transparent 70%)',
        top: '-25%',
        left: '-25%',
        pointerEvents: 'none'
      }} />

      <div className="col fade-in" style={{alignItems:'center', gap:32, zIndex:1}}>
        <img 
          src="/logo_tideo.png" 
          alt="TIDEO" 
          className="animate-breathe"
          style={{height:140, display:'block'}} 
        />
        <div style={{textAlign:'center', width:'100%'}}>
          <div className="font-display" style={{fontSize:16, fontWeight:700, color:'#fff', letterSpacing:'0.15em', textTransform:'uppercase', opacity:0.9}}>
            {message || 'Cargando'}
          </div>
          <div className="mt-6" style={{width:240, height:3, background:'rgba(255,255,255,0.08)', margin:'0 auto', borderRadius:9, overflow:'hidden', position:'relative'}}>
            <div 
              className="animate-progress" 
              style={{
                animation: duration 
                  ? `progress-grow ${duration}ms linear forwards` 
                  : 'progress-indeterminate 2s infinite ease-in-out'
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthGate({ children }) {
  const {
    dataMode,
    authLoading,
    authUser,
    authError,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    supabaseStatus,
    todasMembresias,
    membresiaActiva,
    membresiaCargando,
    seleccionarEmpresa,
    usuarios,
    marcarContrasenaActualizada,
  } = useApp();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [minLoading, setMinLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passError, setPassError] = useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setMinLoading(false), 3000); 
    return () => clearTimeout(timer);
  }, []);

  if (dataMode !== 'supabase') return children;

  const submit = async event => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const result = mode === 'login'
      ? await signInWithPassword({ email, password })
      : await signUpWithPassword({ email, password });
    
    if (result?.error) {
      setSubmitting(false);
      setMessage(result.error);
    } else {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return <SplashLoading />;
  }

  if (!authUser) {
    return (
      <div className="app-shell" style={{
        alignItems:'center', 
        justifyContent:'center', 
        background:'#1A2B4A', 
        backgroundImage: `url('/bg_login.jpg')`,
        backgroundRepeat: 'repeat',
        backgroundSize: '1000px',
        padding:24
      }}>
        <form className="card" onSubmit={submit} style={{width:'min(460px, 100%)', padding:40, textAlign:'center', borderRadius:16, boxShadow:'var(--shadow-lg)'}}>
          <img src="/logo_tideo.png" alt="TIDEO Tech & Strategy" style={{height:110, marginBottom:24, display:'block', marginLeft:'auto', marginRight:'auto'}} />
          
          <div className="font-display" style={{fontSize:28, fontWeight:800, color:'var(--navy)', marginBottom:12}}>
            {mode === 'login' ? 'Ingresar' : 'Crear usuario'}
          </div>

          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:16, width:'100%'}}>
            <div style={{flex:1, height:1, background:'var(--border-subtle)'}}></div>
            <div style={{display:'flex', gap:6}}>
              <div style={{width:8, height:8, borderRadius:99, background:'var(--green)'}}></div>
              <div style={{width:8, height:8, borderRadius:99, background:'var(--orange)'}}></div>
              <div style={{width:8, height:8, borderRadius:99, background:'var(--purple)'}}></div>
              <div style={{width:8, height:8, borderRadius:99, background:'var(--cyan)'}}></div>
            </div>
            <div style={{flex:1, height:1, background:'var(--border-subtle)'}}></div>
          </div>
          
          <p className="text-muted" style={{fontSize:12, marginBottom:24}}>
            Acceso conectado a Supabase Auth y RLS por empresa.
          </p>

          <div className="input-group mt-6" style={{textAlign:'left'}}>
            <label>Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="input-group" style={{textAlign:'left', position:'relative'}}>
            <label>Contrasena</label>
            <div style={{position:'relative'}}>
              <input 
                className="input" 
                type={showPassword ? 'text' : 'password'} 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                minLength={6} 
                required 
                style={{paddingRight:40}} 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                style={{position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--fg-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}
              >
                <span style={{width:20, height:20}}>{I.eye}</span>
              </button>
            </div>
          </div>

          {(message || authError || supabaseStatus?.error) && (
            <div style={{background:'rgba(220,38,38,0.08)', borderLeft:'3px solid var(--danger)', borderRadius:6, padding:'10px 12px', fontSize:13, marginTop:12}}>
              {message || authError || supabaseStatus?.error}
            </div>
          )}

          <button className="btn btn-primary" type="submit" style={{width:'100%', marginTop:18}} disabled={submitting}>
            {submitting ? 'Procesando...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            style={{width:'100%', marginTop:8}}
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}
          >
            {mode === 'login' ? 'Crear usuario de prueba' : 'Ya tengo usuario'}
          </button>
        </form>
      </div>
    );
  }

  const handleSeleccionarEmpresa = (id) => {
    setIsLoggingIn(true);
    setTimeout(() => {
      seleccionarEmpresa(id);
      setIsLoggingIn(false);
    }, 4500); // 4.5 segundos para la transición final
  };

  if (isLoggingIn) {
    return <SplashLoading message="Preparando tu entorno" duration={4500} />;
  }

  if (!membresiaActiva && todasMembresias.length > 1) {
    return (
      <div className="app-shell" style={{
        alignItems:'center', 
        justifyContent:'center', 
        background:'#1A2B4A', 
        backgroundImage: `url('/bg_login.jpg')`,
        backgroundRepeat: 'repeat',
        backgroundSize: '1000px',
        padding:24
      }}>
        <div className="card" style={{width:'min(520px, 100%)', padding:40, textAlign:'center', borderRadius:16, boxShadow:'var(--shadow-lg)'}}>
          <img src="/logo_tideo.png" alt="TIDEO" style={{height:90, marginBottom:24, marginLeft:'auto', marginRight:'auto'}} />
          <div className="font-display" style={{fontSize:24, fontWeight:800, color:'var(--navy)', marginBottom:12}}>Selecciona una empresa</div>
          
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:16, width:'100%'}}>
            <div style={{flex:1, height:1, background:'var(--border-subtle)'}}></div>
            <div style={{display:'flex', gap:6}}>
              <div style={{width:8, height:8, borderRadius:99, background:'var(--green)'}}></div>
              <div style={{width:8, height:8, borderRadius:99, background:'var(--orange)'}}></div>
              <div style={{width:8, height:8, borderRadius:99, background:'var(--purple)'}}></div>
              <div style={{width:8, height:8, borderRadius:99, background:'var(--cyan)'}}></div>
            </div>
            <div style={{flex:1, height:1, background:'var(--border-subtle)'}}></div>
          </div>

          <p className="text-muted" style={{fontSize:13, marginBottom:28}}>
            Tu usuario tiene acceso a más de una organización activa.
          </p>

          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {todasMembresias.map(m => (
              <button
                key={m.empresa_id}
                className="btn btn-secondary"
                style={{
                  display:'flex', 
                  flexDirection:'column', 
                  alignItems:'flex-start', 
                  padding:'18px 24px', 
                  gap:4, 
                  textAlign:'left',
                  border: '1.5px solid var(--border)',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => handleSeleccionarEmpresa(m.empresa_id)}
              >
                <span style={{fontWeight:700, fontSize:16, color:'var(--navy)'}}>
                  {m.empresa?.nombre_comercial || m.empresa?.razon_social || m.empresa_id}
                </span>
                <span style={{fontSize:12, opacity:0.65, color:'var(--fg-muted)'}}>
                  {m.rol?.nombre || m.rol_id}
                  {m.rol?.es_superadmin ? ' · Superadmin' : ''}
                </span>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" style={{marginTop:24, fontSize:13, fontWeight:600}} onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!membresiaActiva) {
    return (
      <div className="app-shell" style={{
        alignItems:'center', 
        justifyContent:'center', 
        background:'#1A2B4A', 
        backgroundImage: `url('/bg_login.jpg')`,
        backgroundRepeat: 'repeat',
        backgroundSize: '1000px',
        padding:24
      }}>
        <div className="card" style={{width:460, padding:40, textAlign:'center', borderRadius:16, boxShadow:'var(--shadow-lg)'}}>
          <img src="/logo_tideo.png" alt="TIDEO" style={{height:80, marginBottom:24, marginLeft:'auto', marginRight:'auto'}} />
          <div className="font-display" style={{fontSize:22, fontWeight:700, color:'var(--navy)', marginTop:6}}>Sin acceso</div>
          <p className="text-muted" style={{marginTop:8}}>
            El usuario <strong>{authUser.email}</strong> no está asociado a ninguna empresa activa.
            Contacta al administrador para que vincule tu cuenta.
          </p>
          <button className="btn btn-ghost" style={{marginTop:16}} onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const usuarioActual = usuarios.find(u => u.id === authUser?.id || u.email === authUser?.email);
  if (membresiaActiva && usuarioActual?.must_change_password) {
    const handleCambiarPass = async (e) => {
      e.preventDefault();
      setPassError('');
      if (newPass.length < 6) { setPassError('Mínimo 6 caracteres'); return; }
      if (newPass !== newPass2) { setPassError('Las contraseñas no coinciden'); return; }
      setChangingPass(true);
      try {
        const supabase = await getSupabaseClient();
        const { error } = await supabase.auth.updateUser({ password: newPass });
        if (error) throw error;
        // Marcar en Supabase (best-effort) y actualizar estado local inmediatamente
        try {
          await supabase.from('usuarios').update({ must_change_password: false }).eq('id', authUser.id);
        } catch { /* ignorar si falla */ }
        await marcarContrasenaActualizada();
      } catch (err) {
        setPassError(err.message || 'Error al cambiar contraseña');
      } finally {
        setChangingPass(false);
      }
    };
    return (
      <div className="app-shell" style={{alignItems:'center', justifyContent:'center', background:'#1A2B4A', backgroundImage:`url('/bg_login.jpg')`, backgroundRepeat:'repeat', backgroundSize:'1000px', padding:24}}>
        <form className="card" onSubmit={handleCambiarPass} style={{width:'min(420px,100%)', padding:40, textAlign:'center', borderRadius:16, boxShadow:'var(--shadow-lg)'}}>
          <img src="/logo_tideo.png" alt="TIDEO" style={{height:90, marginBottom:24, display:'block', marginLeft:'auto', marginRight:'auto'}} />
          <div className="font-display" style={{fontSize:22, fontWeight:800, color:'var(--navy)', marginBottom:8}}>Cambiar contraseña</div>
          <p className="text-muted" style={{fontSize:13, marginBottom:24}}>Tu cuenta tiene una contraseña temporal. Debes crear una nueva para continuar.</p>
          <div className="input-group" style={{textAlign:'left'}}>
            <label>Nueva contraseña</label>
            <div style={{position:'relative'}}>
              <input className="input" type={showNewPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} minLength={6} required placeholder="Mínimo 6 caracteres" style={{paddingRight:40}} />
              <button type="button" onClick={() => setShowNewPass(v => !v)} style={{position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--fg-muted)', cursor:'pointer', display:'flex', alignItems:'center'}}>
                <span style={{width:20, height:20}}>{I.eye}</span>
              </button>
            </div>
          </div>
          <div className="input-group" style={{textAlign:'left'}}>
            <label>Confirmar contraseña</label>
            <input className="input" type={showNewPass ? 'text' : 'password'} value={newPass2} onChange={e => setNewPass2(e.target.value)} minLength={6} required />
          </div>
          {passError && (
            <div style={{background:'rgba(220,38,38,0.08)', borderLeft:'3px solid var(--danger)', borderRadius:6, padding:'8px 12px', fontSize:13, marginTop:8, textAlign:'left'}}>
              {passError}
            </div>
          )}
          <button className="btn btn-primary" type="submit" style={{width:'100%', marginTop:18}} disabled={changingPass}>
            {changingPass ? 'Guardando...' : 'Guardar y continuar'}
          </button>
        </form>
      </div>
    );
  }

  return children;
}

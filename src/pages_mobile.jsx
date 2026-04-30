import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';

// Mobile field views - all field profiles

function MobileFieldView({ onExit, profile, setProfile, dark, setDark }) {
  const [screen, setScreen] = useState('home');

  const profiles = [
    { k: 'tecnico', l: 'Técnico', icon: I.wrench },
    { k: 'logistica', l: 'Logística', icon: I.truck },
    { k: 'vendedor', l: 'Vendedor', icon: I.target },
    { k: 'compras', l: 'Compras', icon: I.camera },
    { k: 'supervisor', l: 'Supervisor', icon: I.shield },
    { k: 'gerencia', l: 'Gerencia', icon: I.trend },
  ];

  return (
    <div style={{minHeight:'100vh',background:dark?'#0D1B2E':'#EEF2F6',display:'flex',flexDirection:'column',padding:20,gap:20}}>
      <div className="row" style={{gap:12, flexWrap:'wrap'}}>
        <div className="row" style={{gap:10}}>
          <div style={{width:32,height:32,background:dark?'#162038':'#fff',borderRadius:6,padding:4,display:'flex',alignItems:'center',justifyContent:'center'}}><img src="assets/tideo-isotipo.svg" alt="" style={{width:'100%'}}/></div>
          <div>
            <div className="font-display" style={{fontWeight:700,fontSize:16,color:dark?'#fff':'var(--navy)'}}>Modo Campo</div>
            <div style={{fontSize:11,color:'var(--fg-muted)'}}>TIDEO ERP · Mobile PWA</div>
          </div>
        </div>
        <div className="header-spacer"/>
        <div className="row" style={{gap:6,flexWrap:'wrap'}}>
          {profiles.map(p => (
            <button key={p.k} onClick={()=>{setProfile(p.k); setScreen('home');}} className={'btn btn-sm '+(profile===p.k?'btn-navy':'btn-secondary')}>
              <span style={{width:14,height:14}}>{p.icon}</span>{p.l}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={()=>setDark(!dark)}>{dark?I.sun:I.moon}</button>
        <button className="btn btn-secondary" onClick={onExit}>{I.x} Salir modo campo</button>
      </div>

      <div style={{display:'flex',justifyContent:'center',flex:1}}>
        <div className={dark?'dark':''} style={{display:'contents'}}>
          <div className="mobile-frame">
            <div className="mobile-notch"/>
            <div className="mobile-screen">
              {profile === 'tecnico' && <TecnicoView screen={screen} setScreen={setScreen}/>}
              {profile === 'logistica' && <LogisticaView screen={screen} setScreen={setScreen}/>}
              {profile === 'vendedor' && <VendedorView screen={screen} setScreen={setScreen}/>}
              {profile === 'compras' && <ComprasView screen={screen} setScreen={setScreen}/>}
              {profile === 'supervisor' && <SupervisorView screen={screen} setScreen={setScreen}/>}
              {profile === 'gerencia' && <GerenciaView screen={screen} setScreen={setScreen}/>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TecnicoView({ screen, setScreen }) {
  return <>
    <div className="mobile-header">
      <div>
        <div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Técnico</div>
        <div className="font-display" style={{fontWeight:700,fontSize:16}}>J. Quispe</div>
      </div>
      <div className="avatar" style={{width:34,height:34}}>JQ</div>
    </div>
    <div className="mobile-content">
      {screen === 'home' && <>
        <div className="eyebrow" style={{marginBottom:10}}>OTs de hoy · 22 Abr</div>
        {MOCK.ots.filter(o=>o.responsable==='J. Quispe' || o.responsable==='M. Torres').slice(0,3).map(o=>(
          <div key={o.id} className="card hover-raise" style={{padding:14,marginBottom:10,cursor:'pointer'}}>
            <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
              <div className="mono" style={{fontSize:11,color:'var(--fg-muted)',fontWeight:600}}>{o.id}</div>
              {o.sla==='riesgo' && <span className="badge badge-orange">SLA riesgo</span>}
            </div>
            <div style={{fontWeight:700,fontFamily:'Sora',fontSize:15,marginBottom:4}}>{o.cliente}</div>
            <div className="text-muted" style={{fontSize:12,marginBottom:10}}>{o.sede} · 08:00 - 17:00</div>
            <div className="row" style={{gap:6}}>
              <button className="btn btn-sm btn-secondary flex-1" onClick={()=>setScreen('checklist')}>{I.check} SSOMA</button>
              <button className="btn btn-sm btn-primary flex-1" onClick={()=>setScreen('parte')}>{I.play} Iniciar</button>
            </div>
          </div>
        ))}
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
        <div className="font-display" style={{fontSize:18,fontWeight:700,margin:'4px 0 16px'}}>Evidencias</div>
        <div className="bar" style={{marginBottom:20}}><div style={{width:'80%',background:'var(--cyan)'}}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
          {[1,2,3].map(i=>(<div key={i} style={{aspectRatio:'1',background:'linear-gradient(135deg,#1A2B4A,#0F1B30)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.4)'}}>{I.camera}</div>))}
          <button style={{aspectRatio:'1',border:'2px dashed var(--border)',borderRadius:8,background:'var(--bg-subtle)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,fontSize:11,color:'var(--fg-muted)',cursor:'pointer'}}>{I.camera}<span>Agregar</span></button>
        </div>
        <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:14}}>3 de 5 fotos · GPS registrado</div>
        <button className="btn btn-primary btn-lg" style={{width:'100%'}} onClick={()=>setScreen('home')}>{I.check} Enviar al supervisor</button>
      </>}
    </div>
    <div className="mobile-nav">
      <div className={'mobile-nav-item '+(screen==='home'?'active':'')} onClick={()=>setScreen('home')}>{I.home}OTs</div>
      <div className="mobile-nav-item">{I.clipboard}Partes</div>
      <div className="mobile-nav-item">{I.alert}Incidencias</div>
      <div className="mobile-nav-item">{I.settings}Ajustes</div>
    </div>
  </>;
}

function LogisticaView({ screen, setScreen }) {
  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Logística</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>H. Pinedo</div></div>
      <div className="avatar" style={{width:34,height:34}}>HP</div>
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

function VendedorView({ screen, setScreen }) {
  const { agendaEventos, cuentas, actualizarAgendaEvento, crearAgendaEvento, searchQuery } = useApp();
  const query = searchQuery.toLowerCase();
  const eventos = agendaEventos
    .filter(e => e.vendedor === 'Carla Meza')
    .filter(e => !query || e.titulo.toLowerCase().includes(query) || (cuentas.find(c=>c.id===e.cuenta_id)?.razon_social||'').toLowerCase().includes(query))
    .sort((a,b) => a.fecha.localeCompare(b.fecha));
  
  const getCuentaNombre = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  const today = new Date().toISOString().split('T')[0];

  const handleRealizado = (id) => {
    actualizarAgendaEvento(id, { estado: 'realizado' });
    if (confirm('¿Deseas registrar una Actividad Comercial para este evento?')) {
      // Flujo rápido: en un caso real abriría el modal de nueva actividad
      alert('Se abrirá el modal de nueva actividad pre-llenado.');
    }
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
      vendedor: 'Carla Meza',
      registrado_por: 'Carla Meza',
      estado: 'programado',
      duracion_minutos: 60
    });
    setScreen('agenda');
  };

  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Vendedor</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>C. Meza</div></div>
      <div className="avatar" style={{width:34,height:34}}>CM</div>
    </div>
    <div className="mobile-content">
      {screen === 'home' || screen === 'clientes' ? (
        <>
          <div className="input" style={{marginBottom:14,display:'flex',alignItems:'center',gap:8}}>{I.search}<input placeholder="Buscar cliente..." style={{border:'none',outline:'none',background:'transparent',flex:1,color:'inherit',fontSize:13}}/></div>
          <div className="eyebrow" style={{marginBottom:8}}>Cliente activo</div>
          <div className="card" style={{padding:14,marginBottom:14}}>
            <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
              <div style={{fontFamily:'Sora',fontWeight:700,fontSize:15}}>Minera Andes SAC</div>
              <span className="health-dot health-green"/>
            </div>
            <div className="text-muted" style={{fontSize:12,marginBottom:10}}>Minería · Carla Meza</div>
            <div className="row" style={{gap:6}}>
              <button className="btn btn-sm btn-secondary flex-1">{I.phone}Llamar</button>
              <button className="btn btn-sm btn-primary flex-1">{I.plus}Actividad</button>
            </div>
          </div>
          <div className="eyebrow" style={{marginBottom:8}}>Acciones rápidas</div>
          <div className="col" style={{gap:8}}>
            <button className="card hover-raise row" style={{padding:12,cursor:'pointer',width:'100%'}}>
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
          </div>
        </>
      ) : screen === 'agenda' ? (
        <>
          <div className="row" style={{justifyContent:'space-between', marginBottom: 16}}>
            <div className="eyebrow">Mi Agenda Comercial</div>
            <button className="btn btn-sm btn-primary" onClick={() => setScreen('nuevo-evento')}>{I.plus} Nuevo</button>
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
      ) : null}
    </div>
    <div className="mobile-nav">
      <div className={`mobile-nav-item ${screen==='home'||screen==='clientes'?'active':''}`} onClick={()=>setScreen('clientes')}>{I.home}Clientes</div>
      <div className="mobile-nav-item">{I.pipe}Pipeline</div>
      <div className={`mobile-nav-item ${screen==='agenda'||screen==='nuevo-evento'?'active':''}`} onClick={()=>setScreen('agenda')}>{I.calendar}Agenda</div>
      <div className="mobile-nav-item">{I.settings}Ajustes</div>
    </div>
  </>;
}

function ComprasView({ screen, setScreen }) {
  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Compras</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>R. Chávez</div></div>
      <div className="avatar" style={{width:34,height:34}}>RC</div>
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
  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Supervisor</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>L. Mendoza</div></div>
      <div className="avatar" style={{width:34,height:34}}>LM</div>
    </div>
    <div className="mobile-content">
      <div className="eyebrow" style={{marginBottom:10}}>Partes pendientes · 2</div>
      {MOCK.partes.filter(p=>p.estado==='en_revision' || p.estado==='observado').map(p=>(
        <div key={p.id} className="card" style={{padding:14,marginBottom:10}}>
          <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
            <div className="mono" style={{fontSize:11,color:'var(--fg-muted)',fontWeight:600}}>{p.id} · {p.ot}</div>
            {p.campo && <span className="badge badge-cyan">{I.mobile}Campo</span>}
          </div>
          <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{p.tecnico}</div>
          <div className="text-muted" style={{fontSize:12,marginBottom:10}}>{p.horas}h trabajadas · avance {p.avance_reportado || p.avance || 0}% · {(p.evidencias?.length || p.fotos || 0)} fotos</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4,marginBottom:10}}>
            {Array.from({length:Math.max(1, Math.min(p.evidencias?.length || p.fotos || 1,3))}).map((_,i)=>(<div key={i} style={{aspectRatio:'1',background:'linear-gradient(135deg,#1A2B4A,#0F1B30)',borderRadius:6,color:'rgba(255,255,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center'}}>{I.camera}</div>))}
          </div>
          <div className="row" style={{gap:6}}>
            <button className="btn btn-sm btn-primary flex-1">{I.check}Aprobar</button>
            <button className="btn btn-sm btn-secondary flex-1" style={{background:'var(--orange-lt)',color:'var(--orange-dk)',borderColor:'var(--orange)'}}>Observar</button>
          </div>
        </div>
      ))}
      <div className="eyebrow" style={{margin:'16px 0 8px'}}>Equipo activo hoy</div>
      <div className="card" style={{padding:14}}>
        {['J. Quispe · OT-0041 · 65%','M. Torres · OT-0042 · 85%','R. Chávez · OT-0043 · Programada'].map((x,i)=>(
          <div key={i} className="row" style={{padding:'6px 0',borderBottom:i<2?'1px solid var(--border-subtle)':'',fontSize:12}}>
            <span style={{width:6,height:6,borderRadius:999,background:'var(--green)'}}/><span style={{marginLeft:8}}>{x}</span>
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
  const cxcVencida = MOCK.cxc.filter(c => c.estado === 'vencida').reduce((s, c) => s + c.saldo, 0);
  const otsActivas = MOCK.ots.filter(o => o.estado === 'programada' || o.estado === 'ejecucion').length;
  const cotAprobar = MOCK.cotizaciones.filter(c => c.estado === 'enviada' || c.estado === 'negociacion').length;
  const margen = MOCK.biFinanciero.resumen.margen_bruto_pct;

  return <>
    <div className="mobile-header">
      <div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Perfil Gerencia</div><div className="font-display" style={{fontWeight:700,fontSize:16}}>Vista ejecutiva</div></div>
      <div className="avatar" style={{width:34,height:34}}>GE</div>
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

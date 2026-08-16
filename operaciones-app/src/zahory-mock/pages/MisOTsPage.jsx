import React, { useState } from 'react';
import { ZAHORY_SAC_DATA } from '../data.js';

const MisOTsPage = ({ setCurrent }) => {
  const datos = ZAHORY_SAC_DATA.mis_ots_dia;
  const [ots, setOts] = useState(datos.ots_del_dia);

  // ── HELPERS ──
  const getEstadoConfig = (estado) => ({
    sin_iniciar: { label:'Sin iniciar', color:'#64748b', border:'#64748b', bg:'var(--row-alt)' },
    en_curso:    { label:'En curso',    color:'#06b6d4', border:'#06b6d4', bg:'rgba(6,182,212,0.08)'  },
    pausada:     { label:'Pausada',     color:'#f59e0b', border:'#f59e0b', bg:'rgba(245,158,11,0.08)' },
    completada:  { label:'Completada',  color:'#22c55e', border:'#22c55e', bg:'rgba(34,197,94,0.08)'  },
    bloqueada:   { label:'Bloqueada',   color:'#ef4444', border:'#ef4444', bg:'rgba(239,68,68,0.08)'  },
  }[estado] || { label:estado, color:'#64748b', border:'#64748b', bg:'var(--row-alt)' });

  const iniciarOT = (otId) => {
    setOts(prev => prev.map(o =>
      o.id === otId ? {
        ...o,
        estado_dia: 'en_curso',
        hora_inicio_real: new Date().toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' }),
      } : o
    ));
  };

  const completarOT = (otId, avanceFinal) => {
    setOts(prev => prev.map(o =>
      o.id === otId ? {
        ...o,
        estado_dia: 'completada',
        avance: 100,
        hora_fin_real: new Date().toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' }),
      } : o
    ));
  };

  const reportarBloqueo = (otId, motivo) => {
    setOts(prev => prev.map(o =>
      o.id === otId ? { ...o, estado_dia:'bloqueada' } : o
    ));
  };

  const renderVistaTecnico = () => {
    const otEnCurso = ots.find(o => o.estado_dia === 'en_curso');
    const otsPendientes = ots.filter(o => o.estado_dia === 'sin_iniciar');
    const otsCompletadas = ots.filter(o => o.estado_dia === 'completada');
    const otsBloqueadas = ots.filter(o => o.estado_dia === 'bloqueada');

    return (
      <div style={{ padding:'16px' }}>
        {/* Header */}
        <div style={{ marginBottom:'20px' }}>
          <div style={{ fontSize:'13px', color:'var(--text-muted)' }}>
            {datos.fecha}
          </div>
          <div style={{ fontSize:'22px', fontWeight:700, color:'var(--text)', marginTop:'2px' }}>
            Mis OTs del día
          </div>
          <div style={{ fontSize:'13px', color:'var(--text-muted)', marginTop:'2px' }}>
            {datos.tecnico_actual} · {ots.length} órdenes asignadas
          </div>
        </div>

        {/* Barra de progreso del día */}
        <div style={{ background:'var(--white)', border:'1px solid var(--card-border)', borderRadius:'10px', padding:'14px', marginBottom:'20px', boxShadow:'var(--shadow-sm)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>Progreso del día</span>
            <span style={{ fontSize:'12px', fontWeight:600, color:'#06b6d4' }}>{otsCompletadas.length} / {ots.length} completadas</span>
          </div>
          <div style={{ height:'8px', background:'var(--row-alt)', borderRadius:'4px', overflow:'hidden' }}>
            <div style={{ height:'100%', borderRadius:'4px', width:`${(otsCompletadas.length / ots.length) * 100}%`, background:'#22c55e', transition:'width 0.4s' }} />
          </div>
          <div style={{ display:'flex', gap:'12px', marginTop:'10px' }}>
            {[
              { label:'En curso',  valor:otEnCurso ? 1 : 0, color:'#06b6d4' },
              { label:'Pendientes',valor:otsPendientes.length, color:'var(--text-muted)' },
              { label:'Bloqueadas',valor:otsBloqueadas.length, color:'#ef4444' },
            ].map(kpi => (
              <div key={kpi.label} style={{ flex:1, textAlign:'center' }}>
                <div style={{ fontSize:'20px', fontWeight:700, color:kpi.color }}>{kpi.valor}</div>
                <div style={{ fontSize:'10px', color:'var(--text-muted)' }}>{kpi.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* OT EN CURSO */}
        {otEnCurso && (
          <div style={{ marginBottom:'20px' }}>
            <div style={{ fontSize:'11px', color:'#06b6d4', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'10px', display:'flex', alignItems:'center', gap:'6px' }}>
              <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#06b6d4', animation:'pulse 1.5s infinite' }} />
              En curso ahora
            </div>
            <OTCard
              ot={otEnCurso}
              expandida={true}
              onCompletar={() => completarOT(otEnCurso.id)}
              onBloquear={(motivo) => reportarBloqueo(otEnCurso.id, motivo)}
              onRegistrarParte={() => {
                localStorage.setItem('zahory_parte_contexto', JSON.stringify({ ot_id: otEnCurso.id, equipo_id: otEnCurso.equipo_id }));
                setCurrent('crear-parte-taller');
              }}
              setCurrent={setCurrent}
            />
          </div>
        )}

        {/* OTs PENDIENTES */}
        {otsPendientes.length > 0 && (
          <div style={{ marginBottom:'20px' }}>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'10px' }}>
              Pendientes · {otsPendientes.length}
            </div>
            {otsPendientes.map(ot => (
              <OTCard
                key={ot.id}
                ot={ot}
                expandida={false}
                onIniciar={() => {
                  if (otEnCurso) { alert('Completa o pausa la OT en curso antes de iniciar otra.'); return; }
                  iniciarOT(ot.id);
                }}
                setCurrent={setCurrent}
              />
            ))}
          </div>
        )}

        {/* OTs BLOQUEADAS */}
        {otsBloqueadas.length > 0 && (
          <div style={{ marginBottom:'20px' }}>
            <div style={{ fontSize:'11px', color:'#ef4444', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'10px' }}>
              ⚠ Bloqueadas · {otsBloqueadas.length}
            </div>
            {otsBloqueadas.map(ot => (
              <OTCard key={ot.id} ot={ot} expandida={false} setCurrent={setCurrent} />
            ))}
          </div>
        )}

        {/* OTs COMPLETADAS */}
        {otsCompletadas.length > 0 && (
          <div>
            <div style={{ fontSize:'11px', color:'#22c55e', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'10px' }}>
              ✓ Completadas · {otsCompletadas.length}
            </div>
            {otsCompletadas.map(ot => (
              <OTCard key={ot.id} ot={ot} expandida={false} setCurrent={setCurrent} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderVistaSupervisor = () => {
    return (
      <div style={{ padding:'16px' }}>
        <div style={{ marginBottom:'20px' }}>
          <h2 style={{ fontSize:'20px', fontWeight:700, color:'var(--text)' }}>
            Estado del equipo — {datos.fecha}
          </h2>
          <p style={{ fontSize:'13px', color:'var(--text-muted)', marginTop:'4px' }}>
            OTs del día por técnico
          </p>
        </div>

        {/* Mis propias OTs */}
        <div style={{ marginBottom:'24px' }}>
          <div style={{ fontSize:'12px', color:'#06b6d4', fontFamily:'monospace', textTransform:'uppercase', marginBottom:'12px' }}>
            Mis OTs — {datos.tecnico_actual}
          </div>
          {ots.map(ot => (
            <OTCard key={ot.id} ot={ot} expandida={false} onIniciar={() => iniciarOT(ot.id)} setCurrent={setCurrent} />
          ))}
        </div>

        {/* OTs del equipo */}
        {datos.ots_equipo.map(miembro => (
          <div key={miembro.tecnico} style={{ marginBottom:'20px' }}>
            <div style={{ fontSize:'12px', color:'var(--text-muted)', fontFamily:'monospace', textTransform:'uppercase', marginBottom:'10px', display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: miembro.ots.some(o => o.estado_dia === 'en_curso') ? '#22c55e' : 'var(--text-muted)' }} />
              {miembro.tecnico}
            </div>
            {miembro.ots.map(ot => {
              const cfg = getEstadoConfig(ot.estado_dia);
              return (
                <div key={ot.id} style={{ background:cfg.bg, borderLeft:`3px solid ${cfg.border}`, borderRadius:'0 10px 10px 0', padding:'12px 14px', marginBottom:'8px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontFamily:'monospace', fontSize:'12px', color:'#60a5fa', fontWeight:600 }}>{ot.id} · {ot.equipo_id}</div>
                      <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'3px' }}>{ot.descripcion}</div>
                      <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'3px' }}>📍 {ot.ubicacion}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontSize:'11px', color:cfg.color, fontWeight:600 }}>{cfg.label}</span>
                      <div style={{ fontSize:'18px', fontWeight:700, color:cfg.color, marginTop:'2px' }}>{ot.avance}%</div>
                    </div>
                  </div>
                  {/* Barra de avance */}
                  <div style={{ height:'4px', background:'var(--card-border)', borderRadius:'2px', overflow:'hidden', marginTop:'8px' }}>
                    <div style={{ height:'100%', background:cfg.border, width:`${ot.avance}%`, borderRadius:'2px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="page" style={{ display:'flex', justifyContent:'center', alignItems:'flex-start', gap: '40px', padding:'40px 20px', background:'var(--bg)', flexWrap: 'wrap' }}>
      
      {/* CELULAR TÉCNICO */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Vista Técnico
        </div>
        <div className="phone-wrap" style={{ background: 'var(--bg)', width: '100%', minWidth: '380px', maxWidth: '420px', height: '800px', display: 'flex', flexDirection: 'column', border:'1px solid var(--card-border)', borderRadius:'24px', overflow:'hidden', boxShadow:'var(--shadow-md)' }}>
          <div className="phone-header" style={{ background: 'var(--white)', borderBottom: '1px solid var(--card-border)', padding:'12px' }}>
            <div className="pill" style={{ width:'60px', height:'6px', background:'var(--card-border)', borderRadius:'3px', margin:'0 auto' }}></div>
          </div>
          <div className="phone-body" style={{ flex: 1, background: 'var(--bg)', padding: 0, overflowY: 'auto' }}>
            {renderVistaTecnico()}
          </div>
          <div className="phone-footer" style={{ background: 'var(--white)', borderTop: '1px solid var(--card-border)', padding: '16px', display:'flex', justifyContent:'center' }}>
            <div style={{ width: '100px', height: '4px', background: 'var(--text-muted)', borderRadius: '2px' }}></div>
          </div>
        </div>
      </div>

      {/* CELULAR SUPERVISOR */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Vista Supervisor
        </div>
        <div className="phone-wrap" style={{ background: 'var(--bg)', width: '100%', minWidth: '380px', maxWidth: '420px', height: '800px', display: 'flex', flexDirection: 'column', border:'1px solid var(--card-border)', borderRadius:'24px', overflow:'hidden', boxShadow:'var(--shadow-md)' }}>
          <div className="phone-header" style={{ background: 'var(--white)', borderBottom: '1px solid var(--card-border)', padding:'12px' }}>
            <div className="pill" style={{ width:'60px', height:'6px', background:'var(--card-border)', borderRadius:'3px', margin:'0 auto' }}></div>
          </div>
          <div className="phone-body" style={{ flex: 1, background: 'var(--bg)', padding: 0, overflowY: 'auto' }}>
            {renderVistaSupervisor()}
          </div>
          <div className="phone-footer" style={{ background: 'var(--white)', borderTop: '1px solid var(--card-border)', padding: '16px', display:'flex', justifyContent:'center' }}>
            <div style={{ width: '100px', height: '4px', background: 'var(--text-muted)', borderRadius: '2px' }}></div>
          </div>
        </div>
      </div>

    </div>
  );
};

// ── COMPONENTE OTCard ──
const OTCard = ({ ot, expandida, onIniciar, onCompletar, onBloquear, onRegistrarParte, setCurrent }) => {
  const [expandido, setExpandido] = useState(expandida || false);
  const [mostrarBloqueo, setMostrarBloqueo] = useState(false);
  const [motivoBloqueo, setMotivoBloqueo] = useState('');

  const getEstadoConfig = (estado) => ({
    sin_iniciar: { label:'Sin iniciar', color:'#64748b', border:'#64748b' },
    en_curso:    { label:'En curso',    color:'#06b6d4', border:'#06b6d4' },
    pausada:     { label:'Pausada',     color:'#f59e0b', border:'#f59e0b' },
    completada:  { label:'Completada',  color:'#22c55e', border:'#22c55e' },
    bloqueada:   { label:'Bloqueada',   color:'#ef4444', border:'#ef4444' },
  }[estado] || { label:estado, color:'#64748b', border:'#64748b' });

  const cfg = getEstadoConfig(ot.estado_dia);

  return (
    <div style={{ background:'var(--white)', borderLeft:`4px solid ${cfg.border}`, borderRadius:'12px', marginBottom:'12px', overflow:'hidden', boxShadow:'var(--shadow-sm)', borderTop:'1px solid var(--card-border)', borderRight:'1px solid var(--card-border)', borderBottom:'1px solid var(--card-border)' }}>
      {/* Header de la card */}
      <div style={{ padding:'14px 16px', cursor:'pointer' }} onClick={() => setExpandido(!expandido)}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
              <span style={{ fontFamily:'monospace', fontSize:'12px', color:'#60a5fa', fontWeight:600 }}>{ot.id}</span>
              <span style={{ fontSize:'11px', fontWeight:600, color:cfg.color }}>● {cfg.label}</span>
            </div>
            <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text)', lineHeight:'1.3' }}>{ot.equipo_id} — {ot.tipo_trabajo}</div>
            <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'4px', lineHeight:'1.4' }}>{ot.descripcion}</div>
          </div>
          <div style={{ marginLeft:'12px', textAlign:'right', flexShrink:0 }}>
            {ot.estado_dia === 'en_curso' && (
              <div style={{ fontSize:'24px', fontWeight:700, color:'#06b6d4' }}>{ot.avance}%</div>
            )}
            <div style={{ fontSize:'18px', color:'var(--text-muted)', marginTop:'4px' }}>{expandido ? '▲' : '▼'}</div>
          </div>
        </div>

        {/* Info rápida */}
        <div style={{ display:'flex', gap:'12px', marginTop:'8px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>📍 {ot.ubicacion}</span>
          <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>🕐 {ot.hora_inicio_programada} — {ot.hora_fin_estimada}</span>
          {ot.tiene_repuestos_pendientes && <span style={{ fontSize:'11px', color:'#f59e0b', fontWeight:600 }}>⚠ Repuestos pendientes</span>}
        </div>

        {/* Barra de avance */}
        {ot.avance > 0 && (
          <div style={{ height:'4px', background:'var(--row-alt)', borderRadius:'2px', overflow:'hidden', marginTop:'8px' }}>
            <div style={{ height:'100%', background:cfg.border, width:`${ot.avance}%`, borderRadius:'2px', transition:'width 0.3s' }} />
          </div>
        )}
      </div>

      {/* Detalle expandido */}
      {expandido && (
        <div style={{ borderTop:'1px solid var(--card-border)', padding:'14px 16px', background:'var(--row-alt)' }}>
          <div style={{ background:'var(--white)', border:'1px solid var(--card-border)', borderRadius:'8px', padding:'10px 12px', marginBottom:'12px' }}>
            <div style={{ fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'4px' }}>Ubicación detallada</div>
            <div style={{ fontSize:'13px', color:'var(--text)' }}>{ot.direccion}</div>
          </div>
          <div style={{ display:'flex', gap:'8px', marginBottom:'12px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'11px', color:'#60a5fa', fontFamily:'monospace', background:'rgba(59,130,246,0.1)', padding:'2px 8px', borderRadius:'6px' }}>{ot.contrato_id}</span>
            <span style={{ fontSize:'11px', color:'#f59e0b', fontFamily:'monospace', background:'rgba(245,158,11,0.1)', padding:'2px 8px', borderRadius:'6px' }}>{ot.centro_costo}</span>
          </div>

          {ot.tiene_repuestos_pendientes && ot.repuestos_pendientes && (
            <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'8px', padding:'10px 12px', marginBottom:'12px' }}>
              <div style={{ fontSize:'11px', color:'#f59e0b', fontWeight:600, marginBottom:'6px' }}>⚠ Repuestos requeridos</div>
              {ot.repuestos_pendientes.map(rep => (
                <div key={rep.codigo} style={{ fontSize:'11px', color:'var(--text-muted)' }}>
                  {rep.codigo} · {rep.descripcion} × {rep.cantidad}
                </div>
              ))}
            </div>
          )}

          {ot.hora_inicio_real && (
            <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'12px' }}>
              Iniciada a las {ot.hora_inicio_real}
              {ot.hora_fin_real && ` · Finalizada a las ${ot.hora_fin_real}`}
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {ot.estado_dia === 'sin_iniciar' && onIniciar && (
              <button onClick={onIniciar} style={{ width:'100%', padding:'14px', background:'#06b6d4', border:'none', borderRadius:'10px', color:'#fff', fontSize:'15px', fontWeight:700, cursor:'pointer' }}>
                ▶ Iniciar OT
              </button>
            )}

            {ot.estado_dia === 'en_curso' && (
              <>
                {onRegistrarParte && (
                  <button onClick={onRegistrarParte} style={{ width:'100%', padding:'14px', background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:'10px', color:'#3b82f6', fontSize:'14px', fontWeight:600, cursor:'pointer' }}>
                    📝 Registrar parte diario
                  </button>
                )}
                {onCompletar && (
                  <button onClick={onCompletar} style={{ width:'100%', padding:'14px', background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:'10px', color:'#22c55e', fontSize:'14px', fontWeight:600, cursor:'pointer' }}>
                    ✓ Marcar como completada (100%)
                  </button>
                )}
                {!mostrarBloqueo ? (
                  <button onClick={() => setMostrarBloqueo(true)} style={{ width:'100%', padding:'12px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'10px', color:'#ef4444', fontSize:'13px', cursor:'pointer' }}>
                    ⚠ Reportar restricción / bloqueo
                  </button>
                ) : (
                  <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'10px', padding:'12px' }}>
                    <div style={{ fontSize:'12px', color:'#ef4444', marginBottom:'8px' }}>Describir el bloqueo:</div>
                    <textarea value={motivoBloqueo} onChange={e => setMotivoBloqueo(e.target.value)} placeholder="ej: Falta repuesto REP-9900-SEL en almacén" rows={3} style={{ width:'100%', marginBottom:'8px', fontSize:'13px', background:'var(--white)', color:'var(--text)', border:'1px solid var(--card-border)', borderRadius:'6px', padding:'8px' }} />
                    <div style={{ display:'flex', gap:'8px' }}>
                      <button onClick={() => setMostrarBloqueo(false)} style={{ flex:1, padding:'10px', background:'var(--white)', border:'1px solid var(--card-border)', borderRadius:'8px', color:'var(--text-muted)', cursor:'pointer' }}>Cancelar</button>
                      <button onClick={() => { if (motivoBloqueo && onBloquear) { onBloquear(motivoBloqueo); setMostrarBloqueo(false); } }} style={{ flex:2, padding:'10px', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'8px', color:'#ef4444', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>Reportar bloqueo</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MisOTsPage;

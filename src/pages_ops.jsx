import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';

// Operations: OT, Partes, Valorization & Cuentas

// ============ CUENTAS Y CONTACTOS ============
function Cuentas() {
  const { cuentas, setCuentas, crearCuenta, contactos, oportunidades, cotizaciones, osClientes, usuarios, navigate, empresa, addNotificacion, role } = useApp();
  const [sel, setSel] = useState(null);
  const [condEdit, setCondEdit] = useState({});
  const [newOpen, setNewOpen] = useState(false);
  const [formCuenta, setFormCuenta] = useState({
    razon_social: '',
    ruc: '',
    industria: '',
    nombre_contacto: '',
    cargo_contacto: '',
    telefono: '',
    email: '',
    direccion: '',
    responsable_comercial: '',
    tamano: '',
    fuente_origen: ''
  });
  const [activeTab, setActiveTab] = useState('Resumen');
  const canFinanzas = role?.permisos?.ver_finanzas;

  const csHealth  = sel ? MOCK.healthScoresDetalle.find(h => h.cuenta_id === sel.id) : null;
  const csOb      = sel ? MOCK.onboardings.find(o => o.cuenta_id === sel.id) : null;
  const csPlan    = sel ? MOCK.planesExito.find(p => p.cuenta_id === sel.id) : null;
  const csNps     = sel ? [...MOCK.npsEncuestas].filter(n => n.cuenta_id === sel.id).sort((a,b) => (b.fecha_respuesta||'').localeCompare(a.fecha_respuesta||''))[0] : null;
  const csRenov   = sel ? MOCK.renovaciones.find(r => r.cuenta_id === sel.id) : null;
  const dimLabels = { comercial:'Comercial', operativa:'Operativa', financiera:'Financiera', soporte:'Soporte', satisfaccion:'Satisfacción' };

  const getHealthColor = (score) => {
    if (score === null || score === undefined) return 'gray';
    if (score >= 70) return 'green';
    if (score >= 40) return 'orange';
    return 'red';
  };

  const getTipoBadge = (tipo) => {
    switch(tipo) {
      case 'estrategico': return 'badge-purple';
      case 'en_riesgo': return 'badge-red';
      case 'prospecto': return 'badge-cyan';
      default: return 'badge-green';
    }
  };

  const updateCuentaForm = (field, value) => {
    setFormCuenta(prev => ({ ...prev, [field]: value }));
  };

  const formCuentaBase = { razon_social:'', ruc:'', industria:'', nombre_contacto:'', cargo_contacto:'', telefono:'', email:'', direccion:'', responsable_comercial:'', tamano:'', fuente_origen:'' };

  const guardarCuenta = (e) => {
    e.preventDefault();
    const nueva = {
      id: `cta_${Date.now().toString(36)}`,
      empresa_id: empresa.id,
      razon_social: formCuenta.razon_social || 'Nueva cuenta sin nombre',
      nombre_comercial: formCuenta.razon_social || 'Nueva cuenta',
      tipo: 'prospecto',
      industria: formCuenta.industria || 'Por definir',
      tamano: formCuenta.tamano || 'Por definir',
      estado: 'activo',
      responsable_comercial: formCuenta.responsable_comercial || 'Sin asignar',
      responsable_cs: null,
      condicion_pago: 'Por definir',
      limite_credito: 0,
      riesgo_financiero: 'bajo',
      health_score: null,
      riesgo_churn: null,
      fecha_ultima_compra: null,
      margen_acumulado: null,
      saldo_cxc: 0,
      direccion: formCuenta.direccion || 'Por definir',
      telefono: formCuenta.telefono,
      email: formCuenta.email,
      ruc: formCuenta.ruc || 'Pendiente',
      fuente_origen: formCuenta.fuente_origen || null,
      nombre_contacto: formCuenta.nombre_contacto,
      cargo_contacto: formCuenta.cargo_contacto
    };
    crearCuenta(nueva);
    addNotificacion?.(`Cuenta creada: ${nueva.razon_social}`);
    setNewOpen(false);
    setFormCuenta(formCuentaBase);
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Cuentas y Contactos</h1><div className="page-sub">{cuentas.length} cuentas activas</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setNewOpen(true)}>{I.plus} Nueva cuenta</button>
      </div>
      <div style={{marginBottom:16, padding:'12px 16px', background:'rgba(6,182,212,0.06)', border:'1px solid var(--border)', borderLeft:'3px solid var(--cyan)', borderRadius:8, fontSize:13}}>
        <strong>Recomendación: </strong><span className="text-muted">El flujo ideal es registrar primero un <strong>Lead</strong> y convertirlo desde el módulo de Leads. Esto pre-completa la cuenta con el RUC, razón social e industria del prospecto.</span>
        <button className="btn btn-ghost btn-sm" style={{marginLeft:12}} onClick={()=>navigate('leads')}>Ir a Leads</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Razón social</th><th>Tipo</th><th>Industria</th><th>Responsable</th><th>Health</th><th>Saldo CxC</th><th>Última Compra</th></tr></thead>
            <tbody>{cuentas.map(c => (
              <tr key={c.id} onClick={() => { setSel(c); setActiveTab('Resumen'); }} className="hover-row" style={{cursor:'pointer'}}>
                <td><strong>{c.razon_social}</strong></td>
                <td><span className={'badge ' + getTipoBadge(c.tipo)}>{c.tipo.replace('_', ' ')}</span></td>
                <td className="text-muted">{c.industria}</td>
                <td>{c.responsable_comercial}</td>
                <td><span className={'health-dot health-'+getHealthColor(c.health_score)}/></td>
                <td className="num">{c.saldo_cxc > 0 ? money(c.saldo_cxc) : <span className="text-subtle">—</span>}</td>
                <td className="text-muted">{c.fecha_ultima_compra || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {newOpen && <>
        <div className="side-panel-backdrop" onClick={() => setNewOpen(false)}/>
        <div className="side-panel" style={{width:'min(620px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Formulario de registro</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>Nueva cuenta</div>
            </div>
            <button className="icon-btn" onClick={() => setNewOpen(false)}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardarCuenta}>
            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Datos de la empresa</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Razón social *</label><input className="input" required value={formCuenta.razon_social} onChange={e=>updateCuentaForm('razon_social', e.target.value)} autoFocus placeholder="Nombre legal de la empresa"/></div>
              <div className="input-group"><label>RUC <span style={{fontSize:11,color:'var(--fg-subtle)',fontWeight:400}}>· 11 dígitos</span></label><input className="input" value={formCuenta.ruc} onChange={e=>updateCuentaForm('ruc', e.target.value)} placeholder="20xxxxxxxxx" maxLength={11}/></div>
              <div className="input-group"><label>Industria</label><select className="select" value={formCuenta.industria} onChange={e=>updateCuentaForm('industria', e.target.value)}>
                <option value="">Seleccionar...</option>
                {['Minería','Industrial','Construcción','Agroindustria','Facilities','Energía','Petróleo & Gas','Logística','Otro'].map(i=><option key={i}>{i}</option>)}
              </select></div>
              <div className="input-group"><label>Tamaño empresa</label><select className="select" value={formCuenta.tamano} onChange={e=>updateCuentaForm('tamano', e.target.value)}>
                <option value="">Seleccionar...</option>
                {['pequeña','mediana','grande','corporativo'].map(t=><option key={t}>{t}</option>)}
              </select></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Dirección</label><input className="input" value={formCuenta.direccion} onChange={e=>updateCuentaForm('direccion', e.target.value)} placeholder="Dirección fiscal o principal"/></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Contacto principal</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Nombre del contacto</label><input className="input" value={formCuenta.nombre_contacto} onChange={e=>updateCuentaForm('nombre_contacto', e.target.value)} placeholder="Nombre y apellido"/></div>
              <div className="input-group"><label>Cargo</label><input className="input" value={formCuenta.cargo_contacto} onChange={e=>updateCuentaForm('cargo_contacto', e.target.value)} placeholder="Ej: Gerente de Operaciones"/></div>
              <div className="input-group"><label>Teléfono</label><input className="input" value={formCuenta.telefono} onChange={e=>updateCuentaForm('telefono', e.target.value)} placeholder="+51 9xx xxx xxx"/></div>
              <div className="input-group"><label>Email</label><input className="input" type="email" value={formCuenta.email} onChange={e=>updateCuentaForm('email', e.target.value)} placeholder="contacto@empresa.pe"/></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Asignación</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Responsable comercial *</label><select className="select" required value={formCuenta.responsable_comercial} onChange={e=>updateCuentaForm('responsable_comercial', e.target.value)}>
                <option value="">Seleccionar...</option>
                {usuarios.filter(u => ['comercial','admin'].includes(u.rol)).map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
              </select></div>
              <div className="input-group"><label>Fuente de origen</label><select className="select" value={formCuenta.fuente_origen} onChange={e=>updateCuentaForm('fuente_origen', e.target.value)}>
                <option value="">Seleccionar...</option>
                {['Referido','Prospección directa','Evento / Feria','Web','Otro'].map(f=><option key={f}>{f}</option>)}
              </select></div>
            </div>

            <div style={{padding:'10px 14px', background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:8, fontSize:12, color:'var(--fg-muted)', marginBottom:20}}>
              Las <strong>condiciones comerciales</strong> (crédito, forma de pago, clasificación) se completan en una segunda etapa desde el área de Finanzas/Administración.
            </div>

            <div className="row" style={{justifyContent:'flex-end', gap:10}}>
              <button type="button" className="btn btn-secondary" onClick={() => setNewOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar cuenta</button>
            </div>
          </form>
        </div>
      </>}

      {sel && <>
        <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
        <div className="side-panel">
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Ficha 360° · Cliente</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>{sel.razon_social}</div>
              {sel.condicion_pago === 'Por definir' && (
                <div style={{marginTop:6, display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px', background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.35)', borderRadius:20, fontSize:11, color:'var(--warning)'}}>
                  ⚠ Condiciones comerciales pendientes
                </div>
              )}
            </div>
            <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
          </div>
          <div className="side-panel-body">
            <div className="tabs">
              {['Resumen', 'Oportunidades', 'Cotizaciones', 'OS Cliente', 'Contactos', 'Customer Success', ...(canFinanzas ? ['Condiciones comerciales'] : [])].map(t => (
                <div key={t} className={`tab ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>{t}</div>
              ))}
            </div>
            
            {activeTab === 'Resumen' && (
              <>
                <div className="grid-3" style={{gap:12, marginBottom:20}}>
                  <div className="card" style={{padding:14}}><div className="eyebrow">Health Score</div><div className="row" style={{marginTop:8}}><span className={'health-dot health-'+getHealthColor(sel.health_score)}/><strong style={{marginLeft:8, fontSize:18}}>{sel.health_score || 'N/A'}</strong></div></div>
                  <div className="card" style={{padding:14}}><div className="eyebrow">Saldo CxC</div><div style={{fontFamily:'Sora',fontSize:18,fontWeight:700,marginTop:4}}>{money(sel.saldo_cxc)}</div></div>
                  <div className="card" style={{padding:14}}><div className="eyebrow">Días Mora</div><div style={{fontFamily:'Sora',fontSize:18,fontWeight:700,color:(sel.dias_mora||0)>30?'var(--danger)':(sel.dias_mora||0)>0?'var(--orange)':'var(--green)',marginTop:4}}>{sel.dias_mora || 0}d</div></div>
                </div>
                <div className="card mb-6">
                  <div className="card-body">
                    <div className="grid-2" style={{gap:16}}>
                      <div><div className="eyebrow">RUC</div><div>{sel.ruc}</div></div>
                      <div><div className="eyebrow">Dirección</div><div>{sel.direccion}</div></div>
                      <div><div className="eyebrow">Teléfono</div><div>{sel.telefono}</div></div>
                      <div><div className="eyebrow">Email Principal</div><div>{sel.email}</div></div>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-head"><h3>Actividad reciente</h3></div>
                  <div className="card-body col" style={{gap:10}}>
                    {['Revisión de cuenta · hace 2 días', 'Llamada seguimiento · hace 1 semana'].map((t,i)=>(
                      <div key={i} className="row" style={{gap:10,padding:10,border:'1px solid var(--border-subtle)',borderRadius:8,fontSize:13}}>
                        <span style={{width:6,height:6,borderRadius:999,background:'var(--cyan)'}}/>{t}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'Oportunidades' && (
              <div className="col" style={{gap:10}}>
                {oportunidades.filter(o => o.cuenta_id === sel.id).map(o => (
                  <div key={o.id} className="card p-3 hover-raise" onClick={() => navigate('pipeline', { panel: o.id })} style={{cursor:'pointer'}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <strong style={{color:'var(--cyan)'}}>{o.nombre}</strong>
                      <span className="badge badge-gray">{o.etapa}</span>
                    </div>
                    <div className="row mt-2" style={{justifyContent:'space-between', fontSize:12}}>
                      <span className="text-muted">Monto: <strong style={{color:'var(--fg)'}}>{money(o.monto_estimado)}</strong></span>
                      <span className="text-muted">Prob: {o.probabilidad}%</span>
                    </div>
                  </div>
                ))}
                {oportunidades.filter(o => o.cuenta_id === sel.id).length === 0 && <div className="p-4 text-muted">No hay oportunidades activas.</div>}
              </div>
            )}

            {activeTab === 'Cotizaciones' && (
              <div className="col" style={{gap:10}}>
                {cotizaciones.filter(c => oportunidades.some(o => o.id === c.oportunidad_id && o.cuenta_id === sel.id)).map(c => (
                  <div key={c.id} className="card p-3 hover-raise" onClick={() => navigate('cotizaciones', { detail: c.id })} style={{cursor:'pointer'}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <strong style={{color:'var(--cyan)'}}>{c.numero}</strong>
                      <span className="badge badge-gray">{c.estado}</span>
                    </div>
                    <div className="row mt-2" style={{justifyContent:'space-between', fontSize:12}}>
                      <span className="text-muted">Total: <strong style={{color:'var(--fg)'}}>{money(c.total)}</strong></span>
                      <span className="text-muted">{c.fecha}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'OS Cliente' && (
              <div className="col" style={{gap:10}}>
                {osClientes.filter(os => os.cuenta_id === sel.id).map(os => (
                  <div key={os.id} className="card p-3 hover-raise" onClick={() => navigate('os_cliente', { detail: os.id })} style={{cursor:'pointer'}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <strong style={{color:'var(--cyan)'}}>{os.numero}</strong>
                      <span className="badge badge-gray">{os.estado}</span>
                    </div>
                    <div className="row mt-2" style={{justifyContent:'space-between', fontSize:12}}>
                      <span className="text-muted">Monto Aprobado: <strong style={{color:'var(--fg)'}}>{money(os.monto_aprobado)}</strong></span>
                      <span className="text-muted">{os.fecha_emision}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'Contactos' && (
              <div className="col" style={{gap:10}}>
                {contactos.filter(c => c.cuenta_id === sel.id).map(c => (
                  <div key={c.id} className="card p-3 row" style={{gap:12}}>
                    <div className="avatar" style={{width:40, height:40}}>{c.nombre.charAt(0)}</div>
                    <div style={{flex:1}}>
                      <div className="row" style={{gap:8}}>
                        <strong style={{color:'var(--fg)'}}>{c.nombre}</strong>
                        {c.principal && <span className="badge badge-cyan" style={{fontSize:10}}>Principal</span>}
                      </div>
                      <div className="text-muted" style={{fontSize:12}}>{c.cargo}</div>
                    </div>
                    <div className="col text-right" style={{fontSize:12}}>
                      <div>{c.telefono}</div>
                      <div className="text-muted">{c.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'Customer Success' && (
              <div className="col" style={{gap:14}}>
                {/* ── Health Score ── */}
                {csHealth ? (
                  <div className="card p-4">
                    <div className="row" style={{justifyContent:'space-between', marginBottom:10}}>
                      <div className="eyebrow">Health Score</div>
                      <span className={'badge ' + (csHealth.semaforo==='verde'?'badge-green':csHealth.semaforo==='amarillo'?'badge-yellow':'badge-red')}>{csHealth.semaforo}</span>
                    </div>
                    <div className="row" style={{alignItems:'flex-end', gap:12, marginBottom:14}}>
                      <div style={{fontSize:48, fontWeight:800, lineHeight:1, color: csHealth.score_total>=70?'var(--green)':csHealth.score_total>=40?'var(--warning)':'var(--danger)'}}>{csHealth.score_total}</div>
                      <div style={{fontSize:12, color:'var(--fg-subtle)', marginBottom:8}}>Tendencia: <strong>{csHealth.tendencia}</strong></div>
                    </div>
                    <div className="col" style={{gap:8}}>
                      {Object.entries(csHealth.dimensiones).map(([dim, d]) => (
                        <div key={dim} style={{display:'grid', gridTemplateColumns:'90px 1fr 36px', gap:8, alignItems:'center'}}>
                          <span style={{fontSize:11, color:'var(--fg-subtle)'}}>{dimLabels[dim]}</span>
                          <div style={{background:'var(--bg-subtle)', borderRadius:3, height:6}}>
                            <div style={{width:d.score+'%', height:'100%', background:d.score>=70?'var(--green)':d.score>=40?'var(--warning)':'var(--danger)', borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:11, fontWeight:600, textAlign:'right'}}>{d.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="card p-4 text-center text-muted" style={{fontSize:13}}>Sin health score registrado para esta cuenta.</div>
                )}

                {/* ── Onboarding ── */}
                {csOb && (
                  <div className="card p-4">
                    <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                      <div className="eyebrow">Onboarding</div>
                      <span className={'badge ' + (csOb.estado==='completado'?'badge-green':csOb.estado==='en_progreso'?'badge-cyan':'badge-gray')}>{csOb.estado}</span>
                    </div>
                    <div style={{fontSize:13, fontWeight:600, marginBottom:6}}>{csOb.tipo_servicio}</div>
                    <div style={{fontSize:12, color:'var(--fg-subtle)', marginBottom:6}}>
                      {csOb.checklist.filter(c=>c.completado).length}/{csOb.checklist.length} hitos completados
                    </div>
                    <div style={{background:'var(--bg-subtle)', borderRadius:3, height:6}}>
                      <div style={{width: Math.round(csOb.checklist.filter(c=>c.completado).length/csOb.checklist.length*100)+'%', height:'100%', background:'var(--cyan)', borderRadius:3}}/>
                    </div>
                  </div>
                )}

                {/* ── Plan de Éxito ── */}
                {csPlan && (
                  <div className="card p-4">
                    <div className="eyebrow" style={{marginBottom:8}}>Plan de Éxito</div>
                    <div style={{fontSize:13, fontWeight:600, marginBottom:6}}>{csPlan.objetivo}</div>
                    <div className="row" style={{gap:16, fontSize:12, color:'var(--fg-subtle)'}}>
                      <span>Adopción: <strong style={{color:'var(--cyan)'}}>{csPlan.adopcion_pct}%</strong></span>
                      <span>Reuniones: {csPlan.reuniones.length}</span>
                    </div>
                    {csPlan.alertas.length > 0 && (
                      <div style={{marginTop:8, padding:'6px 10px', background:'rgba(251,191,36,0.1)', borderRadius:6, fontSize:12, color:'var(--warning)'}}>
                        ⚠ {csPlan.alertas[0]}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Renovación ── */}
                {csRenov && (
                  <div className="card p-4">
                    <div className="eyebrow" style={{marginBottom:8}}>Renovación</div>
                    <div className="row" style={{justifyContent:'space-between', marginBottom:4}}>
                      <span style={{fontSize:13, fontWeight:600}}>{csRenov.servicio}</span>
                      <span className={'badge ' + (csRenov.dias_restantes<=30?'badge-red':csRenov.dias_restantes<=60?'badge-yellow':'badge-green')}>{csRenov.dias_restantes}d restantes</span>
                    </div>
                    <div style={{fontSize:12, color:'var(--fg-subtle)'}}>Vence: {csRenov.fecha_vencimiento} · {money(csRenov.monto_contrato)}</div>
                  </div>
                )}

                {/* ── Último NPS ── */}
                {csNps && (
                  <div className="card p-4">
                    <div className="eyebrow" style={{marginBottom:8}}>Último NPS</div>
                    <div className="row" style={{alignItems:'center', gap:12}}>
                      <div style={{fontSize:40, fontWeight:800, color:csNps.score>=9?'var(--green)':csNps.score>=7?'var(--warning)':'var(--danger)'}}>{csNps.score}</div>
                      <div>
                        <span className={'badge ' + (csNps.clasificacion==='promotor'?'badge-green':csNps.clasificacion==='neutro'?'badge-yellow':'badge-red')}>{csNps.clasificacion}</span>
                        <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>{csNps.fecha_respuesta}</div>
                      </div>
                    </div>
                    {csNps.comentario && <div style={{fontSize:12, color:'var(--fg-subtle)', marginTop:8, fontStyle:'italic'}}>"{csNps.comentario}"</div>}
                  </div>
                )}

                {!csHealth && !csOb && !csPlan && !csRenov && !csNps && (
                  <div className="card p-4 text-center text-muted" style={{fontSize:13}}>Sin actividades de Customer Success registradas.</div>
                )}
              </div>
            )}

            {activeTab === 'Condiciones comerciales' && canFinanzas && (
              <div className="col" style={{gap:16}}>
                <div style={{padding:'10px 14px', background:'rgba(6,182,212,0.06)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, color:'var(--fg-muted)'}}>
                  Visible solo para Finanzas y Administración. Edición inline — los cambios se guardan al confirmar.
                </div>
                <div className="card">
                  <div className="card-head"><h3>Condiciones de pago y crédito</h3></div>
                  <div className="card-body">
                    <div className="grid-2" style={{gap:16}}>
                      {[
                        { k:'condicion_pago', label:'Condición de pago', type:'select', opts:['Contado','7 días','15 días','30 días','45 días','60 días','Por definir'] },
                        { k:'limite_credito', label:'Límite de crédito (S/)', type:'number' },
                        { k:'moneda', label:'Moneda', type:'select', opts:['PEN','USD','EUR'] },
                        { k:'requiere_oc', label:'Requiere OC', type:'select', opts:['Sí','No','A veces'] },
                        { k:'riesgo_financiero', label:'Riesgo financiero', type:'select', opts:['bajo','medio','alto'] },
                        { k:'clasificacion_interna', label:'Clasificación interna', type:'select', opts:['A','B','C','VIP'] },
                      ].map(({k, label, type, opts}) => (
                        <div className="input-group" key={k}>
                          <label style={{fontSize:11}}>{label}</label>
                          {type === 'select' ? (
                            <select className="select" value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]:e.target.value}))}>
                              {opts.map(o=><option key={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input className="input" type={type} value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]:e.target.value}))}/>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-head"><h3>Datos fiscales</h3></div>
                  <div className="card-body">
                    <div className="grid-2" style={{gap:16}}>
                      {[
                        { k:'ruc', label:'RUC', type:'text' },
                        { k:'razon_social', label:'Razón social legal', type:'text' },
                        { k:'direccion', label:'Dirección fiscal', type:'text' },
                        { k:'condicion_tributaria', label:'Condición tributaria', type:'select', opts:['Habido','No Habido','No hallado','Suspensión temporal'] },
                      ].map(({k, label, type, opts}) => (
                        <div className="input-group" key={k}>
                          <label style={{fontSize:11}}>{label}</label>
                          {type === 'select' ? (
                            <select className="select" value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]:e.target.value}))}>
                              {opts.map(o=><option key={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input className="input" type="text" value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]:e.target.value}))}/>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="row" style={{justifyContent:'flex-end', gap:10}}>
                  <button className="btn btn-secondary" onClick={() => setCondEdit({})}>Cancelar</button>
                  <button className="btn btn-primary" onClick={() => {
                    setCuentas(prev => prev.map(c => c.id === sel.id ? {...c, ...condEdit} : c));
                    setSel(prev => ({...prev, ...condEdit}));
                    setCondEdit({});
                  }}>Guardar condiciones</button>
                </div>
              </div>
            )}

          </div>
        </div>
      </>}
    </>
  );
}

function OT({ role }) {
  const { ots, cuentas, partes, activeParams, navigate, actualizarOT, cerrarTecnicamenteOT } = useApp();
  const [sel, setSel] = useState(null);
  const [activeTab, setActiveTab] = useState('Resumen');
  const [panel] = useState(false);
  
  const canCost = role.permisos.ver_costos || role.permisos.todo;
  const getCuenta = (id) => cuentas.find(c => c.id === id)?.razon_social || id;

  const badges = {
    borrador: ['badge-gray','Borrador'], programada: ['badge-cyan','Programada'],
    ejecucion: ['badge-orange','En ejecución'], cerrada: ['badge-purple','Cerrada técnica'],
    valorizada: ['badge-green','Valorizada'], facturada: ['badge-navy','Facturada'], anulada: ['badge-red','Anulada']
  };

  const partesOT = sel ? partes.filter(p => p.ot_id === sel.id) : [];

  useEffect(() => {
    if (!activeParams?.detail) return;
    const ot = ots.find(o => o.id === activeParams.detail);
    if (ot) {
      setSel(ot);
      setActiveTab(activeParams.tab || 'Resumen');
    }
  }, [activeParams?.detail, activeParams?.tab, ots]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Órdenes de Trabajo</h1>
          <div className="page-sub">{ots.length} OTs totales</div>
        </div>
        <div className="row">
          <button className="btn btn-secondary">{I.filter} Filtrar</button>
          <button className="btn btn-primary">{I.plus} Nueva OT</button>
        </div>
      </div>

      <div className="flow">
        <span className="flow-step done"><span className="flow-dot"/>Lead</span><span className="flow-sep">→</span>
        <span className="flow-step done"><span className="flow-dot"/>Oportunidad</span><span className="flow-sep">→</span>
        <span className="flow-step done"><span className="flow-dot"/>Cotización</span><span className="flow-sep">→</span>
        <span className="flow-step done"><span className="flow-dot"/>OS Cliente</span><span className="flow-sep">→</span>
        <span className="flow-step current"><span className="flow-dot"/>OT</span><span className="flow-sep">→</span>
        <span className="flow-step"><span className="flow-dot"/>Parte</span><span className="flow-sep">→</span>
        <span className="flow-step"><span className="flow-dot"/>Cierre</span><span className="flow-sep">→</span>
        <span className="flow-step"><span className="flow-dot"/>Valorización</span><span className="flow-sep">→</span>
        <span className="flow-step"><span className="flow-dot"/>Factura</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>OT</th><th>Cliente</th><th>Sede</th><th>Tipo</th><th>Estado</th><th>SLA</th>
              <th>Responsable</th>{canCost && <th>Costo est/real</th>}<th>Avance</th>
            </tr></thead>
            <tbody>{ots.map(o => (
              <tr key={o.id} onClick={() => { setSel(o); setActiveTab('Resumen'); navigate('ot', { detail: o.id }); }} className="hover-row" style={{cursor:'pointer'}}>
                <td>
                  <div className="mono" style={{fontWeight:600}}>{o.numero}</div>
                  {o.gps && <span className="badge badge-cyan" style={{marginTop:4}}>{I.mapPin}GPS</span>}
                </td>
                <td>{getCuenta(o.cuenta_id) || o.cliente}</td>
                <td className="text-muted">{o.sede}</td>
                <td>{o.tipo}</td>
                <td><span className={'badge '+(badges[o.estado]?.[0]||'badge-gray')}>{badges[o.estado]?.[1]||o.estado}</span></td>
                <td><span className={'badge '+(o.sla==='vencido'?'badge-red':o.sla==='riesgo'?'badge-orange':'badge-green')}>{o.sla==='vencido'?'Vencido':o.sla==='riesgo'?'Riesgo':'OK'}</span></td>
                <td className="text-muted">{o.responsable}</td>
                {canCost && <td className="num">{money(o.costoReal||0)}<span className="text-subtle"> / {money(o.costoEst||0)}</span></td>}
                <td style={{width:120}}>
                  <div className="bar"><div style={{width:(o.avance||0)+'%', background: o.avance===100?'var(--green)':'var(--cyan)'}}/></div>
                  <div style={{fontSize:11,marginTop:2}}>{o.avance||0}%</div>
                </td>
              </tr>
            ))}
            {ots.length===0 && <tr><td colSpan="9" style={{textAlign:'center', padding:40}}>No hay órdenes de trabajo</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {panel && <>
        <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
        <div className="side-panel" style={{width:'min(620px,96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Ejecucion operativa</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700}}>Nuevo parte diario</div>
            </div>
            <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={crearParte}>
            <div className="grid-2" style={{gap:12}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>OT</label>
                <select className="select" value={form.ot_id} onChange={e => updateForm('ot_id', e.target.value)} required>
                  <option value="">Seleccionar OT...</option>
                  {otsDisponibles.map(o => (
                    <option key={o.id} value={o.id}>{o.numero} - {o.tipo || o.servicio || o.descripcion || 'Servicio'}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Tecnico</label>
                <input className="input" value={form.tecnico} onChange={e => updateForm('tecnico', e.target.value)} placeholder="Nombre del tecnico" required />
              </div>
              <div className="input-group">
                <label>Fecha</label>
                <input className="input" type="date" value={form.fecha} onChange={e => updateForm('fecha', e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Horas normales</label>
                <input className="input" type="number" min="0" step="0.5" value={form.horas} onChange={e => updateForm('horas', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Avance reportado (%)</label>
                <input className="input" type="number" min="0" max="100" value={form.avance_reportado} onChange={e => updateForm('avance_reportado', e.target.value)} />
              </div>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>Actividades realizadas</label>
                <textarea className="input" rows="4" value={form.actividades} onChange={e => updateForm('actividades', e.target.value)} required />
              </div>
            </div>

            <div className="card mt-6" style={{padding:14}}>
              <div className="card-head" style={{padding:0, border:0, marginBottom:12}}>
                <h3 style={{fontSize:15}}>Material usado opcional</h3>
              </div>
              <div className="grid-3" style={{gap:12}}>
                <div className="input-group">
                  <label>SKU</label>
                  <input className="input" value={form.material_sku} onChange={e => updateForm('material_sku', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Descripcion</label>
                  <input className="input" value={form.material_nombre} onChange={e => updateForm('material_nombre', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Cantidad</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.material_cantidad} onChange={e => updateForm('material_cantidad', e.target.value)} />
                </div>
              </div>
            </div>

            <div className="row mt-6" style={{justifyContent:'flex-end'}}>
              <button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{I.save} Enviar a revision</button>
            </div>
          </form>
        </div>
      </>}

      {sel && <>
        <div className="side-panel-backdrop" onClick={() => { setSel(null); navigate('ot'); }}/>
        <div className="side-panel" style={{width: 800}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Orden de trabajo</div>
              <div className="font-display mono" style={{fontSize:20, fontWeight:700, marginTop:2}}>{sel.numero}</div>
            </div>
            <button className="icon-btn" onClick={() => { setSel(null); navigate('ot'); }}>{I.x}</button>
          </div>
          <div className="side-panel-body">
            <div className="row" style={{marginBottom:16, flexWrap:'wrap'}}>
              <span className={'badge '+(badges[sel.estado]?.[0]||'badge-gray')}>{badges[sel.estado]?.[1]||sel.estado}</span>
              <span className={'badge '+(sel.sla==='vencido'?'badge-red':sel.sla==='riesgo'?'badge-orange':'badge-green')}>SLA {sel.sla==='vencido'?'Vencido':sel.sla==='riesgo'?'Riesgo':'OK'}</span>
              {sel.gps && <span className="badge badge-cyan">{I.mapPin}GPS registrado · -12.0464, -77.0428</span>}
            </div>
            
            <div className="tabs">
              {['Resumen', 'Tareas', 'Checklists y Calidad', 'Partes', 'Costos'].map(t => (
                (!canCost && t==='Costos') ? null :
                <div key={t} className={`tab ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>{t}</div>
              ))}
            </div>

            {activeTab === 'Resumen' && (
              <>
                <div className="grid-3" style={{gap:12, marginBottom:16}}>
                  <div><div className="eyebrow">Cliente</div><div>{getCuenta(sel.cuenta_id) || sel.cliente}</div></div>
                  <div><div className="eyebrow">Sede</div><div>{sel.sede}</div></div>
                  <div><div className="eyebrow">Tipo</div><div>{sel.tipo}</div></div>
                  <div><div className="eyebrow">Responsable</div><div>{sel.responsable}</div></div>
                  <div><div className="eyebrow">Supervisor</div><div>{sel.supervisor}</div></div>
                  <div><div className="eyebrow">Fechas</div><div>{sel.fecha_inicio} — {sel.fecha_fin}</div></div>
                </div>
                <div style={{background:'var(--bg-subtle)', padding:16, borderRadius:8}}>
                  <div className="eyebrow" style={{marginBottom:8}}>Descripción / Alcance</div>
                  <p style={{fontSize:13, lineHeight:1.5}}>{sel.descripcion || 'Sin descripción detallada.'}</p>
                </div>
              </>
            )}

            {activeTab === 'Tareas' && (
              <div>
                <h3 style={{marginBottom:16}}>Lista de Tareas</h3>
                {sel.tareas?.length > 0 ? (
                  <div style={{display:'flex', flexDirection:'column', gap:8}}>
                    {sel.tareas.map(t => (
                      <label key={t.id} style={{display:'flex', gap:12, alignItems:'center', padding:12, border:'1px solid var(--border)', borderRadius:6, background:'var(--bg)'}}>
                        <input type="checkbox" checked={t.completado} readOnly />
                        <span style={{textDecoration: t.completado?'line-through':'none', color: t.completado?'var(--fg-muted)':'var(--fg)'}}>{t.descripcion}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted" style={{padding:20, textAlign:'center'}}>No hay tareas específicas para esta OT.</div>
                )}
              </div>
            )}

            {activeTab === 'Checklists y Calidad' && (
              <div className="col" style={{gap:20}}>
                <div className="card">
                  <div className="card-head">
                    <h3 style={{fontSize:16}}>Checklist de Seguridad Inicial (SSOMA)</h3>
                    <span className="badge badge-green">Completado</span>
                  </div>
                  <div className="card-body">
                    <div className="grid-2" style={{gap:12}}>
                      <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked readOnly/> Charla de 5 minutos realizada</label>
                      <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked readOnly/> EPPs completos y en buen estado</label>
                      <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked readOnly/> Área de trabajo delimitada</label>
                      <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked readOnly/> Permisos de trabajo de alto riesgo (PTAR) firmados</label>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">
                    <h3 style={{fontSize:16}}>Incidentes Reportados</h3>
                    <button className="btn btn-sm btn-secondary">{I.plus} Registrar Incidente</button>
                  </div>
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr><th>ID</th><th>Fecha</th><th>Severidad</th><th>Descripción</th><th>Estado</th></tr></thead>
                      <tbody>
                        <tr>
                          <td className="mono text-muted">INC-045</td>
                          <td>Ayer, 14:30</td>
                          <td><span className="badge badge-orange">Media</span></td>
                          <td>Herramienta defectuosa (Taladro)</td>
                          <td><span className="badge badge-cyan">Atendido</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Partes' && (
              <div>
                <h3 style={{marginBottom:16}}>Partes Diarios Vinculados</h3>
                {partesOT.length > 0 ? (
                  <div style={{display:'flex', flexDirection:'column', gap:12}}>
                    {partesOT.map(p => (
                      <div key={p.id} style={{padding:16, border:'1px solid var(--border)', borderRadius:6}}>
                        <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                          <div style={{fontWeight:600}}>{p.tecnico}</div>
                          <span className={`badge ${p.estado==='aprobado'?'badge-green':'badge-orange'}`}>{p.estado}</span>
                        </div>
                        <div className="grid-3" style={{marginBottom:8, fontSize:12}}>
                          <div><span className="text-muted">Fecha:</span> {p.fecha}</div>
                          <div><span className="text-muted">Horas:</span> {p.horas}h</div>
                          <div><span className="text-muted">Avance reportado:</span> +{p.avance_reportado}%</div>
                        </div>
                        <div style={{fontSize:13, color:'var(--fg-muted)'}}>{p.actividades}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted" style={{padding:20, textAlign:'center'}}>Aún no se han registrado partes diarios para esta OT.</div>
                )}
              </div>
            )}

            {activeTab === 'Costos' && canCost && (
              <div className="card">
                <div className="card-head"><h3>Resumen Financiero</h3></div>
                <div className="card-body">
                  <div className="grid-3" style={{gap:12}}>
                    <div><div className="eyebrow">Estimado</div><div style={{fontFamily:'Sora',fontSize:22,fontWeight:700}}>{money(sel.costoEst||0)}</div></div>
                    <div><div className="eyebrow">Real Acumulado</div><div style={{fontFamily:'Sora',fontSize:22,fontWeight:700}}>{money(sel.costoReal||0)}</div></div>
                    <div><div className="eyebrow">Margen Actual</div><div style={{fontFamily:'Sora',fontSize:22,fontWeight:700,color:(sel.costoReal||0)<=(sel.costoEst||0)?'var(--green)':'var(--danger)'}}>{sel.costoEst>0?Math.round(((sel.costoEst||0)-(sel.costoReal||0))/(sel.costoEst||1)*100):0}%</div></div>
                  </div>
                </div>
              </div>
            )}

            <div className="row mt-6">
              {sel.estado==='programada' && <button className="btn btn-primary flex-1" onClick={()=>actualizarOT(sel.id, {estado:'ejecucion'})}>{I.play} Iniciar OT</button>}
              {sel.estado==='ejecucion' && <button className="btn btn-primary flex-1" onClick={()=>cerrarTecnicamenteOT(sel.id, {resultado: 'conforme'})}>{I.check} Cerrar técnicamente</button>}
              {sel.estado==='cerrada' && <button className="btn btn-primary flex-1">{I.truck} Enviar a remisión</button>}
              <button className="btn btn-secondary">{I.edit} Editar</button>
            </div>
          </div>
        </div>
      </>}
    </>
  );
}

function Partes() {
  const { partes, ots, aprobarParteDiario, registrarParteDiario } = useApp();
  const [sel, setSel] = useState(null);
  const [panel, setPanel] = useState(false);
  const [form, setForm] = useState({
    ot_id: '',
    tecnico: '',
    fecha: new Date().toISOString().split('T')[0],
    horas: 8,
    avance_reportado: 0,
    actividades: '',
    material_sku: '',
    material_nombre: '',
    material_cantidad: 0,
  });

  const getOTNumero = (otId) => ots.find(o => o.id === otId)?.numero || otId;
  const otsDisponibles = ots.filter(o => !['cerrada', 'valorizada', 'facturada', 'anulada'].includes(o.estado));
  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const resetForm = () => setForm({
    ot_id: '',
    tecnico: '',
    fecha: new Date().toISOString().split('T')[0],
    horas: 8,
    avance_reportado: 0,
    actividades: '',
    material_sku: '',
    material_nombre: '',
    material_cantidad: 0,
  });
  const crearParte = (event) => {
    event.preventDefault();
    const materiales = form.material_sku || form.material_nombre
      ? [{
          sku: form.material_sku || 'MAT-SIN-SKU',
          nombre: form.material_nombre || form.material_sku,
          cantidad: Number(form.material_cantidad || 0)
        }]
      : [];
    registrarParteDiario({
      ot_id: form.ot_id,
      tecnico: form.tecnico,
      fecha: form.fecha,
      horas: Number(form.horas || 0),
      avance_reportado: Number(form.avance_reportado || 0),
      actividades: form.actividades,
      actividad: form.actividades,
      materiales_usados: materiales,
    });
    resetForm();
    setPanel(false);
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Partes Diarios</h1><div className="page-sub">{partes.length} partes · {partes.filter(p=>p.estado==='en_revision').length} pendientes de aprobación</div></div>
        <button className="btn btn-primary" onClick={() => setPanel(true)}>{I.plus} Nuevo parte</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Parte</th><th>OT</th><th>Técnico</th><th>Fecha</th><th>Horas</th><th>Avance</th><th>Estado</th></tr></thead>
            <tbody>{partes.map(p => (
              <tr key={p.id} onClick={() => setSel(p)} className="hover-row" style={{cursor:'pointer'}}>
                <td className="mono" style={{fontWeight:600}}>{p.id}</td>
                <td className="mono">{getOTNumero(p.ot_id)}</td>
                <td>{p.tecnico}</td>
                <td className="text-muted">{p.fecha}</td>
                <td className="num">{p.horas}h</td>
                <td style={{width:120}}><div className="bar"><div style={{width:(p.avance_reportado||0)+'%',background:'var(--cyan)'}}/></div><div style={{fontSize:11,marginTop:2}}>+{p.avance_reportado||0}%</div></td>
                <td><span className={'badge '+(p.estado==='aprobado'?'badge-green':p.estado==='observado'?'badge-red':'badge-orange')}>{p.estado.replace('_', ' ')}</span></td>
              </tr>
            ))}
            {partes.length===0 && <tr><td colSpan="7" style={{textAlign:'center', padding:40}}>No hay partes diarios</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {sel && <>
        <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
        <div className="side-panel">
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Revisión de Parte Diario</div>
              <div className="font-display mono" style={{fontSize:20, fontWeight:700, marginTop:2}}>{sel.id}</div>
            </div>
            <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
          </div>
          <div className="side-panel-body">
            <div className="row" style={{marginBottom:16}}>
              <span className={'badge '+(sel.estado==='aprobado'?'badge-green':sel.estado==='observado'?'badge-red':'badge-orange')}>{sel.estado.replace('_', ' ')}</span>
              <span className="badge badge-gray">{getOTNumero(sel.ot_id)}</span>
            </div>
            <div className="grid-3" style={{gap:12, marginBottom:24}}>
              <div><div className="eyebrow">Técnico</div><div>{sel.tecnico}</div></div>
              <div><div className="eyebrow">Fecha</div><div>{sel.fecha}</div></div>
              <div><div className="eyebrow">Horas</div><div>{sel.horas}h</div></div>
              <div><div className="eyebrow">Avance rep.</div><div>+{sel.avance_reportado||0}%</div></div>
            </div>
            
            <h3 style={{marginBottom:8, fontSize:14}}>Actividades Realizadas</h3>
            <div style={{background:'var(--bg-subtle)', padding:16, borderRadius:8, marginBottom:24, fontSize:13, lineHeight:1.5}}>
              {sel.actividades || 'Sin descripción.'}
            </div>

            <h3 style={{marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:8}}>Materiales Usados</h3>
            <div className="table-wrap" style={{marginBottom:24}}>
              <table className="tbl">
                <thead><tr><th>SKU</th><th>Descripción</th><th>Cant.</th></tr></thead>
                <tbody>
                  {sel.materiales_usados?.map((m, i) => (
                    <tr key={i}>
                      <td className="mono text-muted">{m.sku}</td>
                      <td>{m.nombre}</td>
                      <td className="num">{m.cantidad}</td>
                    </tr>
                  ))}
                  {(!sel.materiales_usados || sel.materiales_usados.length===0) && <tr><td colSpan="3" style={{textAlign:'center'}}>No se registraron materiales</td></tr>}
                </tbody>
              </table>
            </div>

            {sel.estado === 'en_revision' && (
              <div className="row mt-6">
                <button className="btn btn-primary flex-1" onClick={() => { aprobarParteDiario(sel.id); setSel(null); }}>{I.check} Aprobar Parte</button>
                <button className="btn btn-secondary flex-1 text-danger">Observar</button>
              </div>
            )}
          </div>
        </div>
      </>}
    </>
  );
}

function estadoProveedorClass(estado) {
  return estado === 'homologado' ? 'badge-green'
    : estado === 'en_evaluacion' ? 'badge-orange'
    : estado === 'potencial' ? 'badge-cyan'
    : estado === 'observado' ? 'badge-orange'
    : estado === 'bloqueado' ? 'badge-red'
    : 'badge-gray';
}

function ratingText(value) {
  if (!value) return 'Sin evaluar';
  return `${value.toFixed(1)} / 5`;
}

export function PlaceholderCompras({ titulo }) {
  return (
    <div style={{ padding:'40px' }}>
      <div className="card-head"><h3>{titulo}</h3></div>
      <p style={{ color:'var(--fg-muted)', marginTop:'8px' }}>
        Modulo en construccion - Se completa en el siguiente sprint.
      </p>
    </div>
  );
}

function Proveedores() {
  const { proveedores, setProveedores, evaluacionesProveedor, usuarios, empresa, role, addNotificacion, registrarProveedor, actualizarProveedorCtx } = useApp();
  const [tab, setTab] = useState('todos');
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState(null);
  const [detailTab, setDetailTab] = useState('resumen');
  const [form, setForm] = useState({
    ruc:'', pais:'Peru', razon_social:'', nombre_comercial:'', categoria:'Materiales', estado:'potencial',
    servicios:'', contacto_nombre:'', contacto_cargo:'', telefono:'', email:'', web:'', direccion:'',
    responsable_compras:'', notas:''
  });
  const docs = MOCK.documentosProveedor || [];
  const evals = evaluacionesProveedor?.length ? evaluacionesProveedor : (MOCK.evaluacionesProveedor || []);
  const contactosProv = MOCK.contactosProveedor || [];
  const responsables = usuarios.filter(u => ['admin','comercial','finanzas'].includes(u.rol));
  const visibleTabs = role.permisos?.ver_finanzas
    ? ['resumen','finanzas','documentos','evaluaciones','historial','contactos']
    : ['resumen','documentos','evaluaciones','historial','contactos'];
  const list = proveedores.filter(p => {
    if (tab === 'homologados') return p.estado === 'homologado';
    if (tab === 'evaluacion') return p.estado === 'en_evaluacion' || p.estado === 'potencial';
    if (tab === 'riesgo') return p.estado === 'observado' || p.estado === 'bloqueado';
    return true;
  });
  const kpi = {
    homologados: proveedores.filter(p => p.estado === 'homologado').length,
    evaluacion: proveedores.filter(p => p.estado === 'en_evaluacion' || p.estado === 'potencial').length,
    observados: proveedores.filter(p => p.estado === 'observado').length,
    bloqueados: proveedores.filter(p => p.estado === 'bloqueado').length
  };
  const update = (name, value) => setForm(prev => ({ ...prev, [name]: value }));
  const resetForm = () => setForm({
    ruc:'', pais:'Peru', razon_social:'', nombre_comercial:'', categoria:'Materiales', estado:'potencial',
    servicios:'', contacto_nombre:'', contacto_cargo:'', telefono:'', email:'', web:'', direccion:'',
    responsable_compras:'', notas:''
  });
  const saveProveedor = async (e) => {
    e.preventDefault();
    if (form.pais === 'Peru' && !/^\d{11}$/.test(form.ruc)) {
      addNotificacion('El RUC peruano debe tener 11 digitos.');
      return;
    }
    const next = proveedores.length + 1;
    const payload = {
      id: `prv_${String(next).padStart(3,'0')}`,
      empresa_id: empresa.id,
      codigo: `PRV-${String(next).padStart(3,'0')}`,
      calificacion_promedio: null,
      total_evaluaciones: 0,
      condicion_pago: '',
      moneda: 'PEN',
      sujeto_retencion: false,
      pct_retencion: 0,
      limite_gasto_mensual: 0,
      total_ocs: 0,
      monto_total_comprado: 0,
      fecha_ultima_oc: null,
      fecha_homologacion: form.estado === 'homologado' ? new Date().toISOString().slice(0,10) : null,
      ...form
    };
    try {
      await registrarProveedor(payload);
    } catch (_) {
      setProveedores(prev => [...prev, payload]);
    }
    addNotificacion(`Proveedor ${payload.codigo} registrado.`);
    resetForm();
    setPanel(false);
  };

  if (sel) {
    const proveedorDocs = docs.filter(d => d.proveedor_id === sel.id);
    const proveedorEvals = evals.filter(ev => ev.proveedor_id === sel.id);
    const hom = proveedorEvals.find(ev => ev.tipo === 'homologacion');
    const postOc = proveedorEvals.filter(ev => ev.tipo === 'post_oc' || ev.tipo === 'post_os');
    const contactos = contactosProv.filter(c => c.proveedor_id === sel.id);
    const vencidos = proveedorDocs.filter(d => d.estado === 'vencido');
    const ocRows = [
      { id:'OC-2025-0089', tipo:'Compra', concepto:'Materiales electricos', monto:4200, estado:'Recibida', emision:'15/04', recepcion:'20/04' },
      { id:'OC-2025-0071', tipo:'Compra', concepto:'EPP y herramientas', monto:1850, estado:'Recibida', emision:'01/04', recepcion:'05/04' },
      { id:'OS-2025-0012', tipo:'Servicio', concepto:'Transporte de materiales', monto:800, estado:'Cerrada', emision:'20/03', recepcion:'22/03' }
    ];
    const tabLabels = {
      resumen:'Resumen', finanzas:'Condiciones financieras', documentos:'Documentos',
      evaluaciones:'Evaluaciones', historial:'Historial OC', contactos:'Contactos'
    };
    return (
      <>
        <div className="page-header">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>Volver a Proveedores</button>
            <h1 className="page-title" style={{marginTop:12}}>{sel.razon_social}</h1>
            <div className="page-sub">{sel.nombre_comercial} - Categoria: {sel.categoria} - {sel.codigo} - RUC: {sel.ruc}</div>
          </div>
          <div className="row" style={{gap:10}}>
            {!sel.condicion_pago && <span className="badge badge-orange">Condiciones financieras pendientes</span>}
            <button className="btn btn-secondary">Solicitar cotizacion</button>
            <button className="btn btn-primary" data-local-form="true">{I.plus} Nueva OC</button>
          </div>
        </div>
        {vencidos.length > 0 && (
          <div className="card" style={{padding:14, marginBottom:16, borderLeft:'4px solid var(--danger)'}}>
            <strong>Este proveedor tiene {vencidos.length} documento vencido.</strong>
            <span className="text-muted" style={{marginLeft:8}}>No puede recibir nuevas ordenes hasta regularizar.</span>
          </div>
        )}
        <div className="card" style={{padding:16, marginBottom:16}}>
          <div className="row" style={{gap:10, flexWrap:'wrap'}}>
            <span className={'badge '+estadoProveedorClass(sel.estado)}>{sel.estado.replace('_',' ')}</span>
            <span className="badge badge-purple">Calificacion: {ratingText(sel.calificacion_promedio)}</span>
            <span className="badge badge-cyan">Ultima OC: {sel.fecha_ultima_oc || 'Sin compras'}</span>
          </div>
        </div>
        <div className="tabs">{visibleTabs.map(t => <div key={t} className={'tab '+(detailTab===t?'active':'')} onClick={()=>setDetailTab(t)}>{tabLabels[t]}</div>)}</div>
        {detailTab === 'resumen' && (
          <div className="grid-2">
            <div className="card" style={{padding:20}}>
              <div className="card-head"><h3>Datos generales</h3></div>
              {[
                ['RUC', sel.ruc], ['Razon social', sel.razon_social], ['Nombre comercial', sel.nombre_comercial],
                ['Categoria', sel.categoria], ['Pais', sel.pais], ['Direccion', sel.direccion || '-'],
                ['Sitio web', sel.web || '-'], ['Servicios', sel.servicios], ['Responsable', sel.responsable_compras], ['Notas', sel.notas || '-']
              ].map(([k,v]) => <div key={k} style={{display:'grid', gridTemplateColumns:'150px 1fr', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border-subtle)'}}><strong>{k}</strong><span className="text-muted">{v}</span></div>)}
            </div>
            <div className="card" style={{padding:20}}>
              <div className="card-head"><h3>Estado del proveedor</h3></div>
              <p><strong>Estado actual:</strong> {sel.estado.replace('_',' ')}</p>
              <p><strong>Desde:</strong> {sel.fecha_homologacion || 'Pendiente'}</p>
              <p><strong>Calificacion:</strong> {ratingText(sel.calificacion_promedio)} ({sel.total_evaluaciones} evaluaciones)</p>
              <p><strong>Docs vigentes:</strong> {proveedorDocs.filter(d=>d.estado==='vigente').length} de {proveedorDocs.length || 4}</p>
              <p><strong>Total OCs emitidas:</strong> {sel.total_ocs}</p>
              <p><strong>Monto total comprado:</strong> {money(sel.monto_total_comprado || 0)}</p>
              <p><strong>Ultima compra:</strong> {sel.fecha_ultima_oc || 'Sin compras'}</p>
            </div>
          </div>
        )}
        {detailTab === 'finanzas' && role.permisos?.ver_finanzas && (
          <div className="card" style={{padding:20}}>
            <div className="card-head"><h3>Condiciones financieras</h3><span className="text-muted">Editado por Finanzas</span></div>
            <div className="grid-2" style={{gap:14}}>
              <div className="input-group"><label>Condicion de pago</label><select className="select" defaultValue={sel.condicion_pago}><option>Contado</option><option>15 dias</option><option>30 dias</option><option>45 dias</option></select></div>
              <div className="input-group"><label>Moneda de facturacion</label><select className="select" defaultValue={sel.moneda}><option>PEN</option><option>USD</option></select></div>
              <div className="input-group"><label>Banco</label><input className="input" defaultValue={sel.banco || ''}/></div>
              <div className="input-group"><label>Tipo de cuenta</label><input className="input" defaultValue={sel.tipo_cuenta || ''}/></div>
              <div className="input-group"><label>Numero de cuenta</label><input className="input" defaultValue={sel.nro_cuenta || ''}/></div>
              <div className="input-group"><label>CCI</label><input className="input" defaultValue={sel.cci || ''}/></div>
              <div className="input-group"><label>Limite gasto mensual</label><input className="input" type="number" defaultValue={sel.limite_gasto_mensual || 0}/></div>
            </div>
            <button className="btn btn-primary mt-6">Guardar cambios</button>
          </div>
        )}
        {detailTab === 'documentos' && (
          <div className="card"><div className="card-head"><h3>Documentos habilitantes</h3><button className="btn btn-secondary btn-sm">{I.plus} Agregar documento</button></div><div className="table-wrap"><table className="tbl">
            <thead><tr><th>Documento</th><th>Vencimiento</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>{proveedorDocs.map(d => <tr key={d.id}><td><strong>{d.tipo}</strong><div className="text-muted" style={{fontSize:11}}>{d.archivo}</div></td><td>{d.vencimiento || '-'}</td><td><span className={'badge '+(d.estado==='vigente'?'badge-green':d.estado==='por_vencer'?'badge-orange':'badge-red')}>{d.estado.replace('_',' ')}</span></td><td><button className="btn btn-sm btn-ghost">Ver</button> <button className="btn btn-sm btn-ghost">Actualizar</button></td></tr>)}</tbody>
          </table></div></div>
        )}
        {detailTab === 'evaluaciones' && (
          <div className="grid-2">
            <div className="card" style={{padding:20}}><div className="card-head"><h3>Evaluacion de homologacion</h3></div>
              {hom ? <><p className="text-muted">Realizada: {hom.fecha} - Responsable: {hom.evaluador}</p>{Object.entries(hom.criterios).map(([k,v]) => <div key={k} className="row" style={{justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border-subtle)'}}><span>{k.replaceAll('_',' ')}</span><strong>{v}/5</strong></div>)}<h3 style={{marginTop:14}}>Score total {hom.score_homologacion}/5</h3><p>{hom.comentario}</p></> : <p className="text-muted">Sin evaluacion de homologacion registrada.</p>}
            </div>
            <div className="card"><div className="card-head"><h3>Evaluaciones post-OC/OS</h3><button className="btn btn-secondary btn-sm">{I.plus} Nueva evaluacion</button></div><div className="table-wrap"><table className="tbl"><thead><tr><th>Documento</th><th>Fecha</th><th>Plazo</th><th>Calidad</th><th>Score</th><th>Resultado</th></tr></thead><tbody>{postOc.map(ev => {
              const detalle = ev.detalle || {};
              const score = ev.puntaje ?? ev.score ?? 0;
              const calidad = detalle.calidad ?? ev.calidad ?? '-';
              const cumple = ev.cumple_plazo ?? Number(detalle.plazo || 0) >= 4;
              return <tr key={ev.id}><td className="mono">{detalle.documento || detalle.origen_id || ev.oc_id || ev.os_id || '-'}</td><td>{ev.fecha}</td><td>{cumple ? 'Si' : 'No'}</td><td>{calidad}/5</td><td><strong>{score}</strong></td><td><span className={'badge '+(ev.resultado === 'observado' ? 'badge-orange' : 'badge-green')}>{ev.resultado || 'conforme'}</span></td></tr>;
            })}</tbody></table></div></div>
          </div>
        )}
        {detailTab === 'historial' && (
          <div className="card"><div className="card-head"><h3>Historial OC</h3><strong>Total comprado: {money(sel.monto_total_comprado || 0)}</strong></div><div className="table-wrap"><table className="tbl"><thead><tr><th>N OC</th><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Estado</th><th>Emision</th><th>Recepcion</th></tr></thead><tbody>{ocRows.map(r => <tr key={r.id}><td className="mono">{r.id}</td><td>{r.tipo}</td><td>{r.concepto}</td><td>{money(r.monto)}</td><td><span className="badge badge-green">{r.estado}</span></td><td>{r.emision}</td><td>{r.recepcion}</td></tr>)}</tbody></table></div></div>
        )}
        {detailTab === 'contactos' && (
          <div className="card"><div className="card-head"><h3>Contactos</h3><button className="btn btn-secondary btn-sm">{I.plus} Agregar contacto</button></div><div className="table-wrap"><table className="tbl"><thead><tr><th>Nombre</th><th>Cargo</th><th>Telefono</th><th>Email</th><th>Principal</th></tr></thead><tbody>{contactos.map(c => <tr key={c.id}><td><strong>{c.nombre}</strong></td><td>{c.cargo}</td><td>{c.telefono}</td><td>{c.email}</td><td>{c.principal ? 'Si' : 'No'}</td></tr>)}</tbody></table></div></div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Proveedores</h1><div className="page-sub">Registro, homologacion, evaluacion y ficha completa</div></div>
        <div className="row" style={{gap:10}}>
          <button className="btn btn-secondary">{I.download} Importar Excel</button>
          <button className="btn btn-primary" data-local-form="true" onClick={() => setPanel(true)}>{I.plus} Nuevo proveedor</button>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Proveedores homologados</div><div className="kpi-value">{kpi.homologados}</div></div>
        <div className="kpi-card"><div className="kpi-label">En evaluacion</div><div className="kpi-value">{kpi.evaluacion}</div></div>
        <div className="kpi-card"><div className="kpi-label">Observados</div><div className="kpi-value">{kpi.observados}</div></div>
        <div className="kpi-card"><div className="kpi-label">Bloqueados</div><div className="kpi-value">{kpi.bloqueados}</div></div>
      </div>
      <div className="tabs">{[
        ['todos','Todos'], ['homologados','Homologados'], ['evaluacion','En evaluacion'], ['riesgo','Observados / Bloqueados']
      ].map(([k,l]) => <div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}</div>
      <div className="row" style={{gap:10, marginBottom:14, flexWrap:'wrap'}}>
        {['Categoria','Estado','Calificacion','Responsable de compras'].map(f => <button key={f} className="btn btn-secondary btn-sm">{f}</button>)}
      </div>
      <div className="card"><div className="table-wrap"><table className="tbl">
        <thead><tr><th>Codigo</th><th>Proveedor</th><th>Categoria</th><th>Servicios que ofrece</th><th>Calificacion</th><th>Estado</th><th>Docs</th><th>Ultima OC</th><th>Acciones</th></tr></thead>
        <tbody>{list.map(p => {
          const docEstado = docs.some(d => d.proveedor_id === p.id && d.estado === 'vencido') ? 'Vencido' : docs.some(d => d.proveedor_id === p.id && d.estado === 'por_vencer') ? 'Por vencer' : 'OK';
          return <tr key={p.id}>
            <td className="mono">{p.codigo}</td>
            <td><strong>{p.razon_social}</strong><div className="text-muted" style={{fontSize:11}}>{p.nombre_comercial}</div></td>
            <td><span className="badge badge-cyan">{p.categoria}</span></td>
            <td className="text-muted" style={{maxWidth:260}}>{p.servicios}</td>
            <td>{ratingText(p.calificacion_promedio)}</td>
            <td><span className={'badge '+estadoProveedorClass(p.estado)}>{p.estado.replace('_',' ')}</span></td>
            <td><span className={'badge '+(docEstado==='OK'?'badge-green':docEstado==='Por vencer'?'badge-orange':'badge-red')}>{docEstado}</span></td>
            <td>{p.fecha_ultima_oc || '-'}</td>
            <td><button className="btn btn-sm btn-secondary" onClick={() => { setSel(p); setDetailTab('resumen'); }}>Ver ficha</button> <button className="btn btn-sm btn-ghost" disabled={p.estado==='bloqueado' || docEstado==='Vencido'}>Nueva OC</button></td>
          </tr>;
        })}</tbody>
      </table></div></div>

      {panel && <>
        <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
        <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
          <div className="side-panel-head"><div><div className="eyebrow">Formulario de registro</div><div className="font-display" style={{fontSize:22, fontWeight:700}}>Nuevo proveedor</div><div className="text-muted" style={{fontSize:12}}>Los campos * son obligatorios</div></div><button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button></div>
          <form className="side-panel-body" onSubmit={saveProveedor}>
            <div className="eyebrow">Identificacion fiscal</div>
            <div className="grid-2" style={{gap:12, marginBottom:18}}>
              <div className="input-group"><label>RUC / NIT *</label><input className="input" required value={form.ruc} onChange={e=>update('ruc', e.target.value)}/></div>
              <div className="input-group"><label>Pais *</label><select className="select" value={form.pais} onChange={e=>update('pais', e.target.value)}><option>Peru</option><option>Chile</option><option>Colombia</option><option>Mexico</option></select></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Razon social *</label><input className="input" required value={form.razon_social} onChange={e=>update('razon_social', e.target.value)}/></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Nombre comercial</label><input className="input" value={form.nombre_comercial} onChange={e=>update('nombre_comercial', e.target.value)} placeholder="Si es diferente a la razon social"/></div>
            </div>
            <div className="eyebrow">Clasificacion</div>
            <div className="grid-2" style={{gap:12, marginBottom:18}}>
              <div className="input-group"><label>Categoria *</label><select className="select" required value={form.categoria} onChange={e=>update('categoria', e.target.value)}>{['Materiales','Servicios','Transporte','Equipos','Mixto'].map(o=><option key={o}>{o}</option>)}</select></div>
              <div className="input-group"><label>Estado inicial *</label><select className="select" required value={form.estado} onChange={e=>update('estado', e.target.value)}><option value="potencial">Potencial</option><option value="en_evaluacion">En evaluacion</option><option value="homologado">Homologado</option></select></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Servicios que ofrece *</label><textarea className="input" required rows="3" value={form.servicios} onChange={e=>update('servicios', e.target.value)}/></div>
            </div>
            <div className="eyebrow">Contacto principal</div>
            <div className="grid-2" style={{gap:12, marginBottom:18}}>
              <div className="input-group"><label>Nombre del contacto *</label><input className="input" required value={form.contacto_nombre} onChange={e=>update('contacto_nombre', e.target.value)}/></div>
              <div className="input-group"><label>Cargo</label><input className="input" value={form.contacto_cargo} onChange={e=>update('contacto_cargo', e.target.value)}/></div>
              <div className="input-group"><label>Telefono *</label><input className="input" required value={form.telefono} onChange={e=>update('telefono', e.target.value)}/></div>
              <div className="input-group"><label>Email *</label><input className="input" required type="email" value={form.email} onChange={e=>update('email', e.target.value)}/></div>
              <div className="input-group"><label>Sitio web</label><input className="input" value={form.web} onChange={e=>update('web', e.target.value)} placeholder="https://"/></div>
              <div className="input-group"><label>Direccion</label><input className="input" value={form.direccion} onChange={e=>update('direccion', e.target.value)}/></div>
            </div>
            <div className="input-group" style={{marginBottom:18}}><label>Responsable de compras *</label><select className="select" required value={form.responsable_compras} onChange={e=>update('responsable_compras', e.target.value)}><option value="">Seleccionar...</option>{responsables.map(u=><option key={u.id} value={u.nombre}>{u.nombre}</option>)}</select></div>
            <div className="input-group"><label>Notas internas</label><textarea className="input" rows="3" value={form.notas} onChange={e=>update('notas', e.target.value)}/></div>
            <div style={{padding:'12px 14px', background:'rgba(26,43,74,0.08)', borderLeft:'3px solid var(--cyan)', borderRadius:6, margin:'18px 0', fontSize:13}}>Las condiciones de pago y datos bancarios se completan en la ficha del proveedor, tab Condiciones financieras.</div>
            <div className="row" style={{justifyContent:'flex-end', gap:10}}><button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button><button type="submit" className="btn btn-primary">Guardar proveedor</button></div>
          </form>
        </div>
      </>}
    </>
  );
}

function compraBadge(estado) {
  return estado === 'pendiente_cotizar' ? 'badge-gray'
    : estado === 'solicitud_enviada' ? 'badge-cyan'
    : estado === 'esperando_respuesta' ? 'badge-orange'
    : estado === 'comparativo_listo' ? 'badge-cyan'
    : estado === 'generada' || estado === 'oc_os_generada' ? 'badge-green'
    : estado === 'cancelado' ? 'badge-red'
    : 'badge-gray';
}

function estadoOcBadge(estado) {
  return ['cerrada','recibida_total','conforme'].includes(estado) ? 'badge-green'
    : ['confirmada','en_transito','en_ejecucion'].includes(estado) ? 'badge-cyan'
    : ['recibida_parcial','pendiente_conformidad','observada'].includes(estado) ? 'badge-orange'
    : estado === 'anulada' ? 'badge-red'
    : 'badge-gray';
}

function proveedorById(proveedores, id) {
  return proveedores.find(p => p.id === id) || { razon_social:'Proveedor no encontrado', nombre_comercial:'', calificacion_promedio:null, condicion_pago:'', estado:'inactivo' };
}

function docsVencidosProveedor(id) {
  return (MOCK.documentosProveedor || []).some(d => d.proveedor_id === id && d.estado === 'vencido');
}

function CotizacionesCompras() {
  const { procesosCompra, setProcesosCompra, respuestasCompra, setRespuestasCompra, proveedores, solpes, ots, usuarios, empresa, setOrdenesCompra, setOrdenesServicio, navigate, addNotificacion } = useApp();
  const [tab, setTab] = useState('todas');
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [sel, setSel] = useState(null);
  const [detailTab, setDetailTab] = useState('detalle');
  const [winner, setWinner] = useState('');
  const [form, setForm] = useState({
    origen_solpe:'si', solpe_id: solpes[0]?.id || '', descripcion: solpes[0]?.items?.[0]?.nombre || '',
    tipo:'bien', fecha_limite:'2025-04-30', responsable: usuarios.find(u=>u.rol==='admin')?.nombre || usuarios[0]?.nombre || '',
    proveedores:[]
  });
  const filtrados = procesosCompra.filter(p => {
    if (tab === 'pendiente') return p.estado === 'pendiente_cotizar';
    if (tab === 'esperando') return p.estado === 'esperando_respuesta' || p.estado === 'solicitud_enviada';
    if (tab === 'listo') return p.estado === 'comparativo_listo';
    if (tab === 'generada') return p.estado === 'generada' || p.estado === 'oc_os_generada';
    return true;
  });
  const kpis = {
    pendientes: 3,
    espera: procesosCompra.filter(p => p.estado === 'esperando_respuesta' || p.estado === 'solicitud_enviada').length,
    listos: procesosCompra.filter(p => p.estado === 'comparativo_listo').length,
    generadas: 8
  };
  const proveedoresCompatibles = proveedores.filter(p => p.estado !== 'bloqueado' && (form.tipo === 'servicio' ? ['Servicios','Transporte','Mixto'].includes(p.categoria) : ['Materiales','Equipos','Mixto','Transporte'].includes(p.categoria)));
  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleProveedor = (id) => setForm(prev => ({ ...prev, proveedores: prev.proveedores.includes(id) ? prev.proveedores.filter(x=>x!==id) : [...prev.proveedores, id] }));
  const selectedSolpe = solpes.find(s => s.id === form.solpe_id);
  const createProceso = () => {
    const next = procesosCompra.length + 1;
    const proceso = {
      id: `pc_${String(next).padStart(3,'0')}`, empresa_id: empresa.id, codigo: `COT-COMP-${String(next).padStart(3,'0')}`,
      solpe_id: form.origen_solpe === 'si' ? form.solpe_id : null, ot_id: selectedSolpe?.ot_id || '', tipo: form.tipo,
      descripcion: form.descripcion || 'Requerimiento de compra', monto_referencial: 4500, proveedores_consultados: form.proveedores,
      fecha_limite: form.fecha_limite, responsable: form.responsable, estado: 'solicitud_enviada',
      proveedor_ganador: null, monto_seleccionado: null, documento_generado: null
    };
    const nuevasRespuestas = form.proveedores.map((pid, i) => ({
      id:`rpc_${Date.now()}_${i}`, proceso_id:proceso.id, proveedor_id:pid, estado:'enviada', solicitado:new Date().toISOString().slice(0,10),
      precio_total:null, plazo_entrega:'', condiciones:'', valido_hasta:'', observaciones:''
    }));
    setProcesosCompra(prev => [proceso, ...prev]);
    setRespuestasCompra(prev => [...nuevasRespuestas, ...prev]);
    addNotificacion(`Proceso ${proceso.codigo} creado y enviado a proveedores.`);
    setWizard(false);
    setStep(1);
  };
  const registrarRespuesta = (proceso, proveedorId) => {
    setRespuestasCompra(prev => prev.map(r => r.proceso_id === proceso.id && r.proveedor_id === proveedorId ? {
      ...r, estado:'respondida', precio_total: Math.round((proceso.monto_referencial || 1000) * (0.92 + Math.random() * 0.12)),
      plazo_entrega:'3 dias habiles', condiciones: proveedorById(proveedores, proveedorId).condicion_pago || 'Contado', valido_hasta:'2025-05-10', observaciones:'Respuesta registrada en prototipo'
    } : r));
    setProcesosCompra(prev => prev.map(p => p.id === proceso.id ? { ...p, estado:'comparativo_listo' } : p));
  };
  const generarDocumento = (proceso, proveedorId, tipoDoc) => {
    const prov = proveedorById(proveedores, proveedorId);
    const resp = respuestasCompra.find(r => r.proceso_id === proceso.id && r.proveedor_id === proveedorId);
    if (tipoDoc === 'bien') {
      const id = `oc_${String(Date.now()).slice(-5)}`;
      const oc = {
        id, empresa_id: empresa.id, codigo:`OC-2025-${String(Math.floor(Math.random()*9000)+1000)}`, proceso_compra_id: proceso.id,
        proveedor_id: proveedorId, ot_id: proceso.ot_id, descripcion: proceso.descripcion,
        items:[{ descripcion: proceso.descripcion, cantidad:1, unidad:'Glb', precio_unitario: resp?.precio_total || proceso.monto_referencial, subtotal: resp?.precio_total || proceso.monto_referencial }],
        subtotal: resp?.precio_total || proceso.monto_referencial, igv:(resp?.precio_total || proceso.monto_referencial)*0.18, total:(resp?.precio_total || proceso.monto_referencial)*1.18,
        condicion_pago: prov.condicion_pago || 'Contado', moneda:'PEN', fecha_emision:new Date().toISOString().slice(0,10), fecha_entrega_esperada:proceso.fecha_limite,
        almacen_destino:'ALM-001', estado:'emitida', porcentaje_recibido:0, notas_proveedor:'', notas_internas:'Generada desde comparativo'
      };
      setOrdenesCompra(prev => [oc, ...prev]);
      setProcesosCompra(prev => prev.map(p => p.id === proceso.id ? { ...p, estado:'generada', proveedor_ganador:proveedorId, monto_seleccionado:resp?.precio_total || proceso.monto_referencial, documento_generado:oc.codigo } : p));
      addNotificacion(`OC ${oc.codigo} generada desde ${proceso.codigo}.`);
      navigate('ordenes_compra');
    } else {
      const os = {
        id:`os_${String(Date.now()).slice(-5)}`, empresa_id:empresa.id, codigo:`OS-2025-${String(Math.floor(Math.random()*900)+100)}`,
        proveedor_id:proveedorId, ot_id:proceso.ot_id, descripcion:proceso.descripcion, alcance:proceso.descripcion, entregables:'Informe o evidencia de servicio',
        criterios_conformidad:'Servicio ejecutado segun alcance', total:resp?.precio_total || proceso.monto_referencial, moneda:'PEN',
        condicion_pago:prov.condicion_pago || 'Contado', fecha_emision:new Date().toISOString().slice(0,10), fecha_inicio:proceso.fecha_limite, fecha_fin:proceso.fecha_limite,
        responsable_validacion:proceso.responsable, estado:'emitida', notas:'Generada desde comparativo'
      };
      setOrdenesServicio(prev => [os, ...prev]);
      setProcesosCompra(prev => prev.map(p => p.id === proceso.id ? { ...p, estado:'generada', proveedor_ganador:proveedorId, monto_seleccionado:resp?.precio_total || proceso.monto_referencial, documento_generado:os.codigo } : p));
      addNotificacion(`OS ${os.codigo} generada desde ${proceso.codigo}.`);
      navigate('ordenes_servicio');
    }
  };

  if (sel) {
    const resps = respuestasCompra.filter(r => r.proceso_id === sel.id);
    const respondidas = resps.filter(r => r.estado === 'respondida');
    const barata = respondidas.length ? respondidas.reduce((a,b)=>a.precio_total <= b.precio_total ? a : b) : null;
    const tabLabels = { detalle:'Detalle', respuestas:'Respuestas de proveedores', comparativo:'Comparativo', resultado:'Resultado' };
    return (
      <>
        <div className="page-header"><div><button className="btn btn-ghost btn-sm" onClick={()=>setSel(null)}>Volver</button><h1 className="page-title">{sel.codigo}</h1><div className="page-sub">{sel.descripcion}</div></div></div>
        <div className="tabs">{Object.entries(tabLabels).map(([k,l])=><div key={k} className={'tab '+(detailTab===k?'active':'')} onClick={()=>setDetailTab(k)}>{l}</div>)}</div>
        {detailTab === 'detalle' && <div className="card" style={{padding:20}}><div className="card-head"><h3>Detalle del proceso</h3><span className={'badge '+compraBadge(sel.estado)}>{sel.estado.replace('_',' ')}</span></div><p><strong>Origen:</strong> {sel.solpe_id || 'Libre'}</p><p><strong>OT vinculada:</strong> {sel.ot_id || '-'}</p><p><strong>Tipo:</strong> {sel.tipo === 'bien' ? 'Bien - Orden de Compra' : 'Servicio - Orden de Servicio'}</p><p><strong>Monto referencial:</strong> {money(sel.monto_referencial)}</p><p><strong>Fecha limite:</strong> {sel.fecha_limite}</p><p><strong>Responsable:</strong> {sel.responsable}</p></div>}
        {detailTab === 'respuestas' && <div className="grid-2">{resps.map(r => { const p = proveedorById(proveedores, r.proveedor_id); return <div key={r.id} className="card" style={{padding:18}}><div className="card-head"><h3>{p.razon_social}</h3><span className={'badge '+(r.estado==='respondida'?'badge-green':'badge-orange')}>{r.estado}</span></div><p className="text-muted">Solicitado: {r.solicitado}</p>{r.estado==='respondida' ? <><p><strong>Precio total:</strong> {money(r.precio_total)}</p><p><strong>Plazo:</strong> {r.plazo_entrega}</p><p><strong>Condiciones:</strong> {r.condiciones}</p><p><strong>Valido hasta:</strong> {r.valido_hasta}</p><p>{r.observaciones}</p></> : <button className="btn btn-secondary" onClick={()=>registrarRespuesta(sel, r.proveedor_id)}>{I.plus} Registrar respuesta</button>}</div>})}</div>}
        {detailTab === 'comparativo' && <div className="card"><div className="card-head"><h3>Cuadro comparativo</h3>{barata && <button className="btn btn-primary" onClick={()=>setWinner(barata.proveedor_id)}>Seleccionar ganador</button>}</div><div className="table-wrap"><table className="tbl"><thead><tr><th>Proveedor</th><th>Precio total</th><th>Plazo</th><th>Condicion</th><th>Calificacion</th><th>Docs al dia</th></tr></thead><tbody>{respondidas.map(r => { const p = proveedorById(proveedores, r.proveedor_id); return <tr key={r.id}><td><strong>{p.razon_social}</strong>{barata?.id===r.id && <span className="badge badge-green" style={{marginLeft:8}}>★ menor precio</span>}</td><td>{money(r.precio_total)}</td><td>{r.plazo_entrega}</td><td>{r.condiciones}</td><td>{ratingText(p.calificacion_promedio)}</td><td>{docsVencidosProveedor(p.id) ? <span className="badge badge-red">No</span> : <span className="badge badge-green">Si</span>}</td></tr>})}</tbody></table></div>{barata && <p style={{padding:16}}><strong>Recomendacion:</strong> {proveedorById(proveedores, barata.proveedor_id).razon_social} - mejor precio, ahorro {money((sel.monto_referencial || 0) - barata.precio_total)} vs referencia.</p>}</div>}
        {detailTab === 'resultado' && <div className="card" style={{padding:20}}><div className="card-head"><h3>Resultado</h3></div>{sel.proveedor_ganador ? <><p><strong>Proveedor seleccionado:</strong> {proveedorById(proveedores, sel.proveedor_ganador).razon_social}</p><p><strong>Monto seleccionado:</strong> {money(sel.monto_seleccionado)}</p><p><strong>Documento generado:</strong> {sel.documento_generado || 'Pendiente'}</p></> : <p className="text-muted">Aun no se selecciono proveedor ganador.</p>}</div>}
        {winner && <><div className="side-panel-backdrop" onClick={()=>setWinner('')}/><div className="side-panel" style={{width:'min(520px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Seleccionar ganador</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{proveedorById(proveedores, winner).razon_social}</div></div><button className="icon-btn" onClick={()=>setWinner('')}>{I.x}</button></div><div className="side-panel-body"><p>Confirma la seleccion y genera el documento de compra.</p><textarea className="input" rows="4" placeholder="Justificacion si no eliges el menor precio"/><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setWinner('')}>Cancelar</button><button className="btn btn-primary" onClick={()=>generarDocumento(sel, winner, sel.tipo)}>Confirmar seleccion y generar {sel.tipo==='bien'?'OC':'OS'}</button></div></div></div></>}
      </>
    );
  }

  return (
    <>
      <div className="page-header"><div><h1 className="page-title">Cotizaciones de Compra</h1><div className="page-sub">SOLPE a comparativo y seleccion de proveedor</div></div><button className="btn btn-primary" data-local-form="true" onClick={()=>setWizard(true)}>{I.plus} Nuevo proceso de cotizacion</button></div>
      <div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">SOLPEs pendientes</div><div className="kpi-value">{kpis.pendientes}</div></div><div className="kpi-card"><div className="kpi-label">En espera respuesta</div><div className="kpi-value">{kpis.espera}</div></div><div className="kpi-card"><div className="kpi-label">Comparativos listos</div><div className="kpi-value">{kpis.listos}</div></div><div className="kpi-card"><div className="kpi-label">Ordenes del mes</div><div className="kpi-value">{kpis.generadas}</div></div></div>
      <div className="tabs">{[['todas','Todas'],['pendiente','Pendiente de cotizar'],['esperando','Esperando respuesta'],['listo','Comparativo listo'],['generada','OC/OS generada']].map(([k,l])=><div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}</div>
      <div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>N proceso</th><th>SOLPE origen</th><th>OT</th><th>Tipo</th><th>Descripcion</th><th>Monto ref.</th><th>Proveedores</th><th>Estado</th><th>Fecha limite</th><th>Responsable</th><th>Acciones</th></tr></thead><tbody>{filtrados.map(p => { const resps = respuestasCompra.filter(r=>r.proceso_id===p.id); const responded = resps.filter(r=>r.estado==='respondida').length; return <tr key={p.id}><td className="mono">{p.codigo}</td><td className="mono text-muted">{p.solpe_id || 'Libre'}</td><td className="mono">{p.ot_id || '-'}</td><td>{p.tipo === 'bien' ? 'Bien' : 'Servicio'}</td><td>{p.descripcion}</td><td>{money(p.monto_referencial)}</td><td>{responded} de {p.proveedores_consultados.length} respondieron</td><td><span className={'badge '+compraBadge(p.estado)}>{p.estado.replace('_',' ')}</span></td><td>{p.fecha_limite}</td><td>{p.responsable}</td><td><button className="btn btn-sm btn-secondary" onClick={()=>setSel(p)}>Ver proceso</button></td></tr>})}</tbody></table></div></div>
      {wizard && <><div className="side-panel-backdrop" onClick={()=>setWizard(false)}/><div className="side-panel" style={{width:'min(680px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Paso {step} de 3</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Nuevo proceso de cotizacion</div></div><button className="icon-btn" onClick={()=>setWizard(false)}>{I.x}</button></div><div className="side-panel-body">
        {step===1 && <><div className="input-group"><label>Origen</label><select className="select" value={form.origen_solpe} onChange={e=>update('origen_solpe', e.target.value)}><option value="si">Si - seleccionar SOLPE aprobada</option><option value="no">No - descripcion libre</option></select></div>{form.origen_solpe==='si' && <div className="input-group"><label>SOLPE aprobada</label><select className="select" value={form.solpe_id} onChange={e=>update('solpe_id', e.target.value)}>{solpes.map(s=><option key={s.id} value={s.id}>{s.numero || s.id} - {s.items?.[0]?.nombre || s.estado}</option>)}</select></div>}<div className="input-group"><label>Descripcion detallada</label><textarea className="input" rows="4" value={form.descripcion} onChange={e=>update('descripcion', e.target.value)}/></div><div className="grid-2" style={{gap:12}}><div className="input-group"><label>Tipo</label><select className="select" value={form.tipo} onChange={e=>update('tipo', e.target.value)}><option value="bien">Bien - genera OC</option><option value="servicio">Servicio - genera OS</option></select></div><div className="input-group"><label>Fecha limite</label><input className="input" type="date" value={form.fecha_limite} onChange={e=>update('fecha_limite', e.target.value)}/></div></div><div className="input-group"><label>Responsable de compras</label><select className="select" value={form.responsable} onChange={e=>update('responsable', e.target.value)}>{usuarios.map(u=><option key={u.id}>{u.nombre}</option>)}</select></div></>}
        {step===2 && <><p className="text-muted">Selecciona proveedores homologados. Observados o con documentos vencidos se muestran con advertencia.</p>{proveedoresCompatibles.map(p=><label key={p.id} className="card" style={{padding:12,display:'block',marginBottom:10,cursor:'pointer'}}><input type="checkbox" checked={form.proveedores.includes(p.id)} onChange={()=>toggleProveedor(p.id)} style={{marginRight:8}}/><strong>{p.codigo} {p.razon_social}</strong><div className="text-muted" style={{fontSize:12,marginLeft:24}}>{p.categoria} - {ratingText(p.calificacion_promedio)} - {p.condicion_pago || 'Sin condicion'} {p.estado==='observado' ? ' - Observado' : ''} {docsVencidosProveedor(p.id) ? ' - Documento vencido' : ''}</div></label>)}</>}
        {step===3 && <div className="card" style={{padding:16}}><p><strong>Origen:</strong> {form.origen_solpe==='si' ? form.solpe_id : 'Libre'}</p><p><strong>Tipo:</strong> {form.tipo === 'bien' ? 'Bien - Orden de Compra' : 'Servicio - Orden de Servicio'}</p><p><strong>Descripcion:</strong> {form.descripcion}</p><p><strong>Proveedores:</strong> {form.proveedores.map(id=>proveedorById(proveedores,id).razon_social).join(', ')}</p><p><strong>Fecha limite:</strong> {form.fecha_limite}</p><p><strong>Responsable:</strong> {form.responsable}</p></div>}
        <div className="row mt-6" style={{justifyContent:'space-between'}}><button className="btn btn-secondary" onClick={()=> step===1 ? setWizard(false) : setStep(s=>s-1)}>{step===1?'Cancelar':'Anterior'}</button><button className="btn btn-primary" data-local-form="true" disabled={step===2 && form.proveedores.length<1} onClick={()=> step===3 ? createProceso() : setStep(s=>s+1)}>{step===3?'Confirmar y crear proceso':'Siguiente'}</button></div>
      </div></div></>}
    </>
  );
}

function OrdenesCompra() {
  const { ordenesCompra, setOrdenesCompra, proveedores, procesosCompra, ots, empresa, addNotificacion, navigate } = useApp();
  const [tab, setTab] = useState('todas');
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ proveedor_id:'prv_001', proceso_compra_id:'', ot_id:'', descripcion:'', total:1000, fecha_entrega_esperada:'2025-04-30' });
  const list = ordenesCompra.filter(o => tab === 'todas' || o.estado === tab);
  const homologados = proveedores.filter(p => p.estado === 'homologado' || p.estado === 'observado');
  const kpi = { emitidas: ordenesCompra.length, pendientes: ordenesCompra.filter(o=>o.porcentaje_recibido<100).length, parcial: ordenesCompra.filter(o=>o.estado==='recibida_parcial').length, total: ordenesCompra.reduce((s,o)=>s+(o.total||0),0) };
  const crear = (emitir=true) => {
    const subtotal = Number(form.total) || 0;
    const p = proveedorById(proveedores, form.proveedor_id);
    const oc = { id:`oc_${Date.now()}`, empresa_id:empresa.id, codigo:`OC-2025-${String(ordenesCompra.length+91).padStart(4,'0')}`, proceso_compra_id:form.proceso_compra_id || null, proveedor_id:form.proveedor_id, ot_id:form.ot_id, descripcion:form.descripcion || 'Compra directa', items:[{descripcion:form.descripcion || 'Item de compra', cantidad:1, unidad:'Glb', precio_unitario:subtotal, subtotal}], subtotal, igv:subtotal*0.18, total:subtotal*1.18, condicion_pago:p.condicion_pago || 'Contado', moneda:'PEN', fecha_emision:new Date().toISOString().slice(0,10), fecha_entrega_esperada:form.fecha_entrega_esperada, almacen_destino:'ALM-001', estado:emitir?'emitida':'borrador', porcentaje_recibido:0, notas_proveedor:'', notas_internas:'' };
    setOrdenesCompra(prev=>[oc,...prev]); addNotificacion(`${oc.codigo} ${emitir?'emitida':'guardada como borrador'}.`); setPanel(false);
  };
  if (sel) return <DetalleOrden orden={sel} proveedor={proveedorById(proveedores, sel.proveedor_id)} onBack={()=>setSel(null)} onConfirmar={()=>setOrdenesCompra(prev=>prev.map(o=>o.id===sel.id?{...o,estado:'confirmada'}:o))} onRecepcion={()=>navigate('recepciones', { ocId: sel.id })}/>;
  return (
    <>
      <div className="page-header"><div><h1 className="page-title">Ordenes de Compra</h1><div className="page-sub">Bienes, materiales e ingreso a inventario</div></div><button className="btn btn-primary" data-local-form="true" onClick={()=>setPanel(true)}>{I.plus} Nueva OC</button></div>
      <div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">Emitidas este mes</div><div className="kpi-value">{kpi.emitidas}</div></div><div className="kpi-card"><div className="kpi-label">Pendientes recepcion</div><div className="kpi-value">{kpi.pendientes}</div></div><div className="kpi-card"><div className="kpi-label">Recibidas parcial</div><div className="kpi-value">{kpi.parcial}</div></div><div className="kpi-card"><div className="kpi-label">Valor total mes</div><div className="kpi-value">{money(kpi.total)}</div></div></div>
      <div className="tabs">{['todas','emitida','confirmada','en_transito','recibida_parcial','cerrada','anulada'].map(t=><div key={t} className={'tab '+(tab===t?'active':'')} onClick={()=>setTab(t)}>{t.replace('_',' ')}</div>)}</div>
      <OrdenesTable list={list} proveedores={proveedores} onSel={setSel} onRecepcion={(o)=>navigate('recepciones',{ocId:o.id})}/>
      {panel && <PanelOC form={form} setForm={setForm} proveedores={homologados} procesos={procesosCompra} ots={ots} onClose={()=>setPanel(false)} onCrear={crear}/>}
    </>
  );
}

function OrdenesTable({ list, proveedores, onSel, onRecepcion }) {
  return <div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>N OC</th><th>Proveedor</th><th>Concepto</th><th>Monto total</th><th>OT</th><th>Estado</th><th>Emision</th><th>Entrega esperada</th><th>Recibido</th><th>Acciones</th></tr></thead><tbody>{list.map(o=>{ const p=proveedorById(proveedores,o.proveedor_id); return <tr key={o.id}><td className="mono">{o.codigo}</td><td><strong>{p.razon_social}</strong><div className="text-muted" style={{fontSize:11}}>{ratingText(p.calificacion_promedio)}</div></td><td>{o.descripcion}</td><td>{money(o.total||0)}</td><td className="mono">{o.ot_id||'-'}</td><td><span className={'badge '+estadoOcBadge(o.estado)}>{o.estado.replace('_',' ')}</span></td><td>{o.fecha_emision}</td><td>{o.fecha_entrega_esperada}</td><td><div style={{width:80,height:6,background:'var(--bg-subtle)',borderRadius:99}}><div style={{width:`${o.porcentaje_recibido||0}%`,height:6,background:'var(--green)',borderRadius:99}}/></div><span className="text-muted" style={{fontSize:11}}>{o.porcentaje_recibido||0}%</span></td><td><button className="btn btn-sm btn-secondary" onClick={()=>onSel(o)}>Ver detalle</button> <button className="btn btn-sm btn-ghost" onClick={()=>onRecepcion(o)}>Registrar recepcion</button></td></tr>})}</tbody></table></div></div>;
}

function PanelOC({ form, setForm, proveedores, procesos, ots, onClose, onCrear }) {
  return <><div className="side-panel-backdrop" onClick={onClose}/><div className="side-panel" style={{width:'min(620px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Orden de compra</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Nueva OC</div></div><button className="icon-btn" onClick={onClose}>{I.x}</button></div><div className="side-panel-body"><div className="grid-2" style={{gap:12}}><div className="input-group"><label>Proceso de cotizacion</label><select className="select" value={form.proceso_compra_id} onChange={e=>setForm(v=>({...v,proceso_compra_id:e.target.value}))}><option value="">Compra directa</option>{procesos.map(p=><option key={p.id} value={p.id}>{p.codigo}</option>)}</select></div><div className="input-group"><label>Proveedor</label><select className="select" value={form.proveedor_id} onChange={e=>setForm(v=>({...v,proveedor_id:e.target.value}))}>{proveedores.map(p=><option key={p.id} value={p.id}>{p.razon_social}{p.estado==='observado'?' - observado':''}</option>)}</select></div><div className="input-group"><label>OT vinculada</label><select className="select" value={form.ot_id} onChange={e=>setForm(v=>({...v,ot_id:e.target.value}))}><option value="">Sin OT</option>{ots.map(o=><option key={o.id} value={o.id}>{o.numero || o.id}</option>)}</select></div><div className="input-group"><label>Fecha entrega esperada</label><input className="input" type="date" value={form.fecha_entrega_esperada} onChange={e=>setForm(v=>({...v,fecha_entrega_esperada:e.target.value}))}/></div><div className="input-group" style={{gridColumn:'1/-1'}}><label>Descripcion</label><textarea className="input" rows="3" value={form.descripcion} onChange={e=>setForm(v=>({...v,descripcion:e.target.value}))}/></div><div className="input-group"><label>Monto subtotal</label><input className="input" type="number" value={form.total} onChange={e=>setForm(v=>({...v,total:e.target.value}))}/></div></div><div className="card mt-6" style={{padding:14}}><p><strong>Subtotal:</strong> {money(Number(form.total)||0)}</p><p><strong>IGV 18%:</strong> {money((Number(form.total)||0)*0.18)}</p><p><strong>Total:</strong> {money((Number(form.total)||0)*1.18)}</p></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>onCrear(false)}>Guardar borrador</button><button className="btn btn-primary" data-local-form="true" onClick={()=>onCrear(true)}>Emitir OC</button></div></div></div></>;
}

function DetalleOrden({ orden, proveedor, onBack, onConfirmar, onRecepcion }) {
  const [tab, setTab] = useState('detalle');
  return <><div className="page-header"><div><button className="btn btn-ghost btn-sm" onClick={onBack}>Volver</button><h1 className="page-title">{orden.codigo}</h1><div className="page-sub">{proveedor.razon_social} - {money(orden.total||0)}</div></div><div className="row">{orden.estado==='emitida' && <button className="btn btn-secondary" onClick={onConfirmar}>Marcar confirmada</button>}<button className="btn btn-primary" data-local-form="true" onClick={onRecepcion}>Registrar recepcion</button></div></div><div className="tabs">{['detalle','items','seguimiento','recepciones','documentos'].map(t=><div key={t} className={'tab '+(tab===t?'active':'')} onClick={()=>setTab(t)}>{t}</div>)}</div>{tab==='detalle' && <div className="card" style={{padding:20}}><p><strong>Descripcion:</strong> {orden.descripcion}</p><p><strong>Condicion pago:</strong> {orden.condicion_pago}</p><p><strong>Entrega esperada:</strong> {orden.fecha_entrega_esperada}</p><p><strong>Notas:</strong> {orden.notas_internas || '-'}</p></div>}{tab==='items' && <div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>Item</th><th>Cantidad</th><th>Unidad</th><th>P.Unit</th><th>Subtotal</th></tr></thead><tbody>{orden.items?.map((i,idx)=><tr key={idx}><td>{i.descripcion}</td><td>{i.cantidad}</td><td>{i.unidad}</td><td>{money(i.precio_unitario)}</td><td>{money(i.subtotal)}</td></tr>)}</tbody></table></div></div>}{tab==='seguimiento' && <div className="card" style={{padding:20}}>{['Emitida','Confirmada','En transito','Recibida'].map((s,i)=><div key={s} style={{padding:'10px 0',borderBottom:'1px solid var(--border-subtle)'}}><strong>{i===0 || orden.estado!=='emitida' ? '●' : '○'} {s}</strong><span className="text-muted" style={{marginLeft:12}}>{i===0 ? orden.fecha_emision : '-'}</span></div>)}</div>}{['recepciones','documentos'].includes(tab) && <div className="card" style={{padding:20}}><p className="text-muted">Informacion vinculada disponible desde el modulo Recepciones.</p></div>}</>;
}

function OrdenesServicio() {
  const { ordenesServicio, setOrdenesServicio, proveedores, ots, empresa, addNotificacion, navigate } = useApp();
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState('todas');
  const [form, setForm] = useState({ proveedor_id:'prv_003', ot_id:'', descripcion:'', total:800, fecha_inicio:'2025-04-30', fecha_fin:'2025-04-30', responsable_validacion:'Roberto Quispe' });
  const list = ordenesServicio.filter(o => tab === 'todas' || o.estado === tab);
  const provs = proveedores.filter(p => (p.estado === 'homologado' || p.estado === 'observado') && ['Servicios','Transporte','Mixto'].includes(p.categoria));
  const crear = () => { const p=proveedorById(proveedores,form.proveedor_id); const os={id:`os_${Date.now()}`,empresa_id:empresa.id,codigo:`OS-2025-${String(ordenesServicio.length+13).padStart(4,'0')}`,proveedor_id:form.proveedor_id,ot_id:form.ot_id,descripcion:form.descripcion||'Servicio tercerizado',alcance:form.descripcion||'Servicio tercerizado',entregables:'Evidencia del servicio',criterios_conformidad:'Conforme a alcance',total:Number(form.total)||0,moneda:'PEN',condicion_pago:p.condicion_pago||'Contado',fecha_emision:new Date().toISOString().slice(0,10),fecha_inicio:form.fecha_inicio,fecha_fin:form.fecha_fin,responsable_validacion:form.responsable_validacion,estado:'emitida',notas:''}; setOrdenesServicio(prev=>[os,...prev]); addNotificacion(`${os.codigo} emitida.`); setPanel(false); };
  return <><div className="page-header"><div><h1 className="page-title">Ordenes de Servicio</h1><div className="page-sub">Servicios tercerizados, conformidad y cierre</div></div><button className="btn btn-primary" data-local-form="true" onClick={()=>setPanel(true)}>{I.plus} Nueva OS</button></div><div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">Emitidas</div><div className="kpi-value">{ordenesServicio.length}</div></div><div className="kpi-card"><div className="kpi-label">En ejecucion</div><div className="kpi-value">{ordenesServicio.filter(o=>o.estado==='en_ejecucion').length}</div></div><div className="kpi-card"><div className="kpi-label">Pendiente conformidad</div><div className="kpi-value">{ordenesServicio.filter(o=>o.estado==='pendiente_conformidad').length}</div></div><div className="kpi-card"><div className="kpi-label">Valor total</div><div className="kpi-value">{money(ordenesServicio.reduce((s,o)=>s+(o.total||0),0))}</div></div></div><div className="tabs">{['todas','emitida','confirmada','en_ejecucion','pendiente_conformidad','cerrada','observada'].map(t=><div key={t} className={'tab '+(tab===t?'active':'')} onClick={()=>setTab(t)}>{t.replace('_',' ')}</div>)}</div><div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>OS</th><th>Proveedor</th><th>Servicio</th><th>Monto</th><th>OT</th><th>Estado</th><th>Inicio</th><th>Fin</th><th>Validador</th><th>Acciones</th></tr></thead><tbody>{list.map(o=>{const p=proveedorById(proveedores,o.proveedor_id);return <tr key={o.id}><td className="mono">{o.codigo}</td><td><strong>{p.razon_social}</strong></td><td>{o.descripcion}</td><td>{money(o.total)}</td><td className="mono">{o.ot_id||'-'}</td><td><span className={'badge '+estadoOcBadge(o.estado)}>{o.estado.replace('_',' ')}</span></td><td>{o.fecha_inicio}</td><td>{o.fecha_fin}</td><td>{o.responsable_validacion}</td><td><button className="btn btn-sm btn-secondary" onClick={()=>navigate('recepciones',{osId:o.id})}>Conformidad</button></td></tr>})}</tbody></table></div></div>{panel && <><div className="side-panel-backdrop" onClick={()=>setPanel(false)}/><div className="side-panel" style={{width:'min(620px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Orden de servicio</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Nueva OS</div></div><button className="icon-btn" onClick={()=>setPanel(false)}>{I.x}</button></div><div className="side-panel-body"><div className="grid-2" style={{gap:12}}><div className="input-group"><label>Proveedor</label><select className="select" value={form.proveedor_id} onChange={e=>setForm(v=>({...v,proveedor_id:e.target.value}))}>{provs.map(p=><option key={p.id} value={p.id}>{p.razon_social}</option>)}</select></div><div className="input-group"><label>OT</label><select className="select" value={form.ot_id} onChange={e=>setForm(v=>({...v,ot_id:e.target.value}))}><option value="">Sin OT</option>{ots.map(o=><option key={o.id} value={o.id}>{o.numero||o.id}</option>)}</select></div><div className="input-group" style={{gridColumn:'1/-1'}}><label>Servicio / alcance</label><textarea className="input" rows="4" value={form.descripcion} onChange={e=>setForm(v=>({...v,descripcion:e.target.value}))}/></div><div className="input-group"><label>Fecha inicio</label><input className="input" type="date" value={form.fecha_inicio} onChange={e=>setForm(v=>({...v,fecha_inicio:e.target.value}))}/></div><div className="input-group"><label>Fecha fin</label><input className="input" type="date" value={form.fecha_fin} onChange={e=>setForm(v=>({...v,fecha_fin:e.target.value}))}/></div><div className="input-group"><label>Total</label><input className="input" type="number" value={form.total} onChange={e=>setForm(v=>({...v,total:e.target.value}))}/></div><div className="input-group"><label>Responsable validacion</label><input className="input" value={form.responsable_validacion} onChange={e=>setForm(v=>({...v,responsable_validacion:e.target.value}))}/></div></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setPanel(false)}>Cancelar</button><button className="btn btn-primary" data-local-form="true" onClick={crear}>Emitir OS</button></div></div></div></>}</>;
}

function RecepcionesLegacy() {
  const { activeParams, ordenesCompra, setOrdenesCompra, ordenesServicio, setOrdenesServicio, recepciones, setRecepciones, proveedores, usuarios, empresa, setInventario, cxp, setCxp, addNotificacion } = useApp();
  const [tab, setTab] = useState('pendientes');
  const [panel, setPanel] = useState(Boolean(activeParams?.ocId || activeParams?.osId));
  const [origen, setOrigen] = useState(activeParams?.osId ? `os:${activeParams.osId}` : activeParams?.ocId ? `oc:${activeParams.ocId}` : '');
  const [obs, setObs] = useState('');
  const ocOrigen = origen.startsWith('oc:') ? ordenesCompra.find(o=>o.id===origen.slice(3)) : null;
  const osOrigen = origen.startsWith('os:') ? ordenesServicio.find(o=>o.id===origen.slice(3)) : null;
  const pendientes = ordenesCompra.filter(o=>(o.porcentaje_recibido||0)<100).length;
  const rows = recepciones.filter(r => tab === 'todos' || (tab === 'pendientes' ? false : tab === 'conforme' ? r.estado === 'conforme' : r.estado === 'observada'));
  const confirmarRecepcion = () => {
    const base = ocOrigen || osOrigen;
    if (!base) return;
    const isOC = Boolean(ocOrigen);
    const items = isOC ? (ocOrigen.items || []).map(i=>({ descripcion:i.descripcion, pedido:i.cantidad, recibido:i.cantidad, unidad:i.unidad, conforme:true, precio_unitario:i.precio_unitario })) : [];
    const nueva = { id:`rec_${String(recepciones.length+1).padStart(3,'0')}`, empresa_id:empresa.id, codigo:`REC-2025-${String(recepciones.length+19).padStart(4,'0')}`, oc_id:isOC?base.id:null, os_id:isOC?null:base.id, proveedor_id:base.proveedor_id, fecha:new Date().toISOString().slice(0,10), responsable:usuarios[0]?.nombre || 'Compras', almacen:'ALM-001', items_recibidos:items, tipo:obs?'observada':'total', estado:obs?'observada':'conforme', observaciones:obs, archivo_guia:'guia_proveedor.pdf', cxp_generada:true, cxp_id:`cxp_${cxp.length+1}` };
    if (isOC) {
      setOrdenesCompra(prev=>prev.map(o=>o.id===base.id?{...o,estado:'cerrada',porcentaje_recibido:100}:o));
      setInventario(prev=>[...prev, ...items.map((i,idx)=>({ id:`inv_${Date.now()}_${idx}`, sku:`CMP-${Date.now()}-${idx}`, nombre:i.descripcion, categoria:'Compras', almacen:'ALM-001', unidad:i.unidad, stock_actual:i.recibido, costo_promedio:i.precio_unitario || 0 }))]);
    } else {
      setOrdenesServicio(prev=>prev.map(o=>o.id===base.id?{...o,estado:'cerrada'}:o));
    }
    setCxp(prev=>[...prev,{ id:nueva.cxp_id, empresa_id:empresa.id, proveedor_id:base.proveedor_id, recepcion_id:nueva.id, oc_id:isOC?base.id:null, monto:isOC?base.total:base.total, moneda:base.moneda, condicion_pago:base.condicion_pago, fecha_emision:nueva.fecha, fecha_vencimiento:'2025-05-30', estado:'pendiente', descripcion:`${base.codigo} - ${base.descripcion}` }]);
    setRecepciones(prev=>[nueva,...prev]);
    addNotificacion(`Recepcion registrada - ${isOC ? 'OC cerrada' : 'OS conforme'} - CxP generada.`);
    setPanel(false); setOrigen(''); setObs('');
  };
  return <><div className="page-header"><div><h1 className="page-title">Recepciones</h1><div className="page-sub">Confirmacion de entrega, conformidad e impacto en inventario/CxP</div></div><button className="btn btn-primary" data-local-form="true" onClick={()=>setPanel(true)}>{I.plus} Nueva recepcion</button></div><div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">OCs pendientes</div><div className="kpi-value">{pendientes}</div></div><div className="kpi-card"><div className="kpi-label">Recibidas hoy</div><div className="kpi-value">1</div></div><div className="kpi-card"><div className="kpi-label">Con observaciones</div><div className="kpi-value">{recepciones.filter(r=>r.estado==='observada').length}</div></div><div className="kpi-card"><div className="kpi-label">CxP generadas</div><div className="kpi-value">{recepciones.filter(r=>r.cxp_generada).length}</div></div></div><div className="tabs">{[['pendientes','Pendientes'],['conforme','Recibidas conforme'],['observada','Con observaciones'],['todos','Todos']].map(([k,l])=><div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}</div><div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>N Recepcion</th><th>OC/OS origen</th><th>Proveedor</th><th>Descripcion</th><th>Estado</th><th>Fecha</th><th>CxP</th><th>Responsable</th></tr></thead><tbody>{rows.map(r=>{const p=proveedorById(proveedores,r.proveedor_id);const oc=ordenesCompra.find(o=>o.id===r.oc_id);const os=ordenesServicio.find(o=>o.id===r.os_id);return <tr key={r.id}><td className="mono">{r.codigo}</td><td className="mono">{oc?.codigo || os?.codigo || '-'}</td><td>{p.razon_social}</td><td>{oc?.descripcion || os?.descripcion || '-'}</td><td><span className={'badge '+(r.estado==='conforme'?'badge-green':'badge-orange')}>{r.estado}</span></td><td>{r.fecha}</td><td>{r.cxp_generada?'Si':'Pendiente'}</td><td>{r.responsable}</td></tr>})}</tbody></table></div></div>{panel && <><div className="side-panel-backdrop" onClick={()=>setPanel(false)}/><div className="side-panel" style={{width:'min(600px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">{osOrigen?'Conformidad de servicio':'Registro de recepcion'}</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{ocOrigen?.codigo || osOrigen?.codigo || 'Nueva recepcion'}</div></div><button className="icon-btn" onClick={()=>setPanel(false)}>{I.x}</button></div><div className="side-panel-body"><div className="input-group"><label>OC/OS origen</label><select className="select" value={origen} onChange={e=>setOrigen(e.target.value)}><option value="">Seleccionar...</option>{ordenesCompra.filter(o=>(o.porcentaje_recibido||0)<100).map(o=><option key={o.id} value={`oc:${o.id}`}>{o.codigo} - {o.descripcion}</option>)}{ordenesServicio.filter(o=>o.estado!=='cerrada').map(o=><option key={o.id} value={`os:${o.id}`}>{o.codigo} - {o.descripcion}</option>)}</select></div>{ocOrigen && <div className="card" style={{padding:12}}><div className="card-head"><h3>Verificacion de items</h3></div>{ocOrigen.items.map((i,idx)=><div key={idx} className="row" style={{justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}><span>{i.descripcion}</span><span>{i.cantidad} {i.unidad} - Conforme</span></div>)}</div>}{osOrigen && <div className="card" style={{padding:12}}><p><strong>Servicio:</strong> {osOrigen.descripcion}</p><p><strong>Entregables:</strong> {osOrigen.entregables}</p><p><strong>Evaluacion rapida:</strong> plazo 5/5 - calidad 4/5 - comunicacion 4/5</p></div>}<div className="input-group mt-6"><label>Observaciones</label><textarea className="input" rows="4" value={obs} onChange={e=>setObs(e.target.value)} placeholder="Dejar vacio si todo esta conforme"/></div><div className="input-group"><label>Guia / evidencia</label><input className="input" defaultValue={osOrigen?'evidencia_servicio.pdf':'guia_proveedor.pdf'}/></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setPanel(false)}>Cancelar</button><button className="btn btn-primary" disabled={!ocOrigen && !osOrigen} onClick={confirmarRecepcion}>Confirmar recepcion</button></div></div></div></>}</>;
}

function Recepciones() {
  const {
    ordenesCompra, ordenesServicio, recepciones, proveedores, cxp,
    registrarRecepcionConCxP
  } = useApp();
  const [panel, setPanel] = useState(false);
  const [origen, setOrigen] = useState('');
  const [obs, setObs] = useState('');
  const [tab, setTab] = useState('todos');
  const proveedorNombre = id => proveedores.find(p => p.id === id)?.razon_social || id || '-';
  const origenInfo = r => {
    const ocId = r.orden_compra_id || r.oc_id;
    const osId = r.orden_servicio_id || r.os_id;
    const oc = ordenesCompra.find(o => o.id === ocId);
    const os = ordenesServicio.find(o => o.id === osId);
    return { codigo: oc?.codigo || os?.codigo || '-', proveedor_id: oc?.proveedor_id || os?.proveedor_id || r.proveedor_id, descripcion: oc?.descripcion || os?.descripcion || '-' };
  };
  const origenes = [
    ...ordenesCompra.filter(o => (o.porcentaje_recibido || 0) < 100 && o.estado !== 'cerrada').map(o => ({ tipo:'oc', id:o.id, codigo:o.codigo || o.id, proveedor_id:o.proveedor_id, descripcion:o.descripcion, total:o.total })),
    ...ordenesServicio.filter(o => o.estado !== 'cerrada').map(o => ({ tipo:'os', id:o.id, codigo:o.codigo || o.id, proveedor_id:o.proveedor_id, descripcion:o.descripcion, total:o.total }))
  ];
  const rows = recepciones.filter(r => tab === 'todos' || (tab === 'conforme' ? ['confirmada','conforme','total'].includes(r.estado) : r.estado === 'observada'));
  const guardar = async event => {
    event.preventDefault();
    const [tipo, id] = origen.split(':');
    if (!tipo || !id) return;
    const creada = await registrarRecepcionConCxP({ origenTipo: tipo, origenId: id, observaciones: obs.trim() });
    if (creada) {
      setPanel(false);
      setOrigen('');
      setObs('');
    }
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Recepciones</h1><div className="page-sub">Conformidad de OC/OS y generacion de CxP</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setPanel(true)}>{I.plus} Nueva recepcion</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Pendientes</div><div className="kpi-value">{origenes.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Recepciones</div><div className="kpi-value">{recepciones.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Observadas</div><div className="kpi-value">{recepciones.filter(r => r.estado === 'observada').length}</div></div>
        <div className="kpi-card"><div className="kpi-label">CxP abiertas</div><div className="kpi-value">{cxp.filter(c => c.estado !== 'pagada').length}</div></div>
      </div>
      <div className="tabs">{[['todos','Todos'],['conforme','Conforme'],['observada','Observada']].map(([k,l]) => <div key={k} className={'tab '+(tab===k?'active':'')} onClick={() => setTab(k)}>{l}</div>)}</div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Recepcion</th><th>Origen</th><th>Proveedor</th><th>Descripcion</th><th>Fecha</th><th>Estado</th><th>CxP</th></tr></thead>
            <tbody>{rows.length ? rows.map(r => {
              const info = origenInfo(r);
              return <tr key={r.id}><td className="mono">{r.codigo || r.id}</td><td className="mono">{info.codigo}</td><td>{proveedorNombre(info.proveedor_id)}</td><td>{info.descripcion}</td><td>{r.fecha}</td><td><span className={'badge '+(r.estado==='observada'?'badge-orange':'badge-green')}>{r.estado}</span></td><td>{r.cxp_generada ? 'Si' : '-'}</td></tr>;
            }) : <tr><td colSpan="7" className="text-center text-muted" style={{padding:32}}>No hay recepciones registradas.</td></tr>}</tbody>
          </table>
        </div>
      </div>
      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
          <div className="side-panel" style={{width:'min(600px,96vw)'}}>
            <div className="side-panel-head"><div><div className="eyebrow">Registro de recepcion</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Conformidad proveedor</div></div><button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button></div>
            <form className="side-panel-body" onSubmit={guardar}>
              <div className="input-group">
                <label>OC/OS origen</label>
                <select className="select" value={origen} onChange={e => setOrigen(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {origenes.map(o => <option key={`${o.tipo}:${o.id}`} value={`${o.tipo}:${o.id}`}>{o.codigo} - {proveedorNombre(o.proveedor_id)} - {money(o.total || 0)}</option>)}
                </select>
              </div>
              <div className="input-group mt-6">
                <label>Observaciones</label>
                <textarea className="input" rows="4" value={obs} onChange={e => setObs(e.target.value)} placeholder="Dejar vacio para registrar conforme y generar CxP"/>
              </div>
              <div className="row mt-6" style={{justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={!origen}>Confirmar recepcion</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function Compras() {
  const { comprasGastos, proveedores, ordenesCompra, ordenesServicio, recepciones } = useApp();
  const [sel, setSel] = useState(null);
  const [activeTab, setActiveTab] = useState('Compras en Campo');
  const comprasRows = comprasGastos.length ? comprasGastos : MOCK.compras;

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Compras, Gastos y Proveedores</h1><div className="page-sub">Abastecimiento estructurado y gestión de proveedores</div></div>
        <button className="btn btn-primary">{I.plus} Nuevo Registro</button>
      </div>
      <div className="tabs">
        {['Compras en Campo', 'Proveedores', 'Órdenes de Compra (OC)', 'Órdenes de Servicio (OSI)', 'Recepción y Conformidad'].map(t => (
          <div key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>{t}</div>
        ))}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            {activeTab === 'Compras en Campo' && (
              <>
                <thead><tr><th>#</th><th>Proveedor</th><th>Documento</th><th>Monto</th><th>OT</th><th>Fecha</th><th>Estado</th><th>Origen</th></tr></thead>
                <tbody>{comprasRows.map(c => (
                  <tr key={c.id} onClick={() => c.campo && setSel(c)}>
                    <td className="mono">{c.id}</td>
                    <td><strong>{c.proveedor || c.categoria || 'Gasto interno'}</strong></td>
                    <td className="mono">{c.doc || c.descripcion}</td>
                    <td className="num"><strong>{money(c.monto)}</strong></td>
                    <td className="mono text-muted">{c.ot || c.periodo_nomina || '-'}</td>
                    <td className="text-muted">{c.fecha}</td>
                    <td><span className={'badge '+(c.estado==='pagado'||c.estado==='registrado'?'badge-green':c.estado==='pendiente_revision'?'badge-cyan':'badge-gray')}>{String(c.estado || 'registrado').replace('_',' ')}</span></td>
                    <td>{c.campo ? <span className="badge badge-cyan">{I.camera}Campo</span> : c.origen === 'nomina' ? <span className="badge badge-purple">Nomina</span> : null}</td>
                  </tr>
                ))}</tbody>
              </>
            )}
            {activeTab === 'Proveedores' && (
              <>
                <thead><tr><th>RUC</th><th>Razón Social</th><th>Categoría</th><th>Contacto</th><th>Teléfono</th><th>Calificación</th></tr></thead>
                <tbody>{(proveedores.length ? proveedores : MOCK.proveedores).map(p => (
                  <tr key={p.id}>
                    <td className="mono text-muted">{p.ruc}</td>
                    <td><strong>{p.razon_social}</strong></td>
                    <td>{p.categoria || p.rubro || '-'}</td>
                    <td>{p.contacto_nombre || p.contacto}</td>
                    <td>{p.telefono}</td>
                    <td>{p.calificacion_promedio ?? p.calificacion} {I.star}</td>
                  </tr>
                ))}</tbody>
              </>
            )}
            {activeTab === 'Órdenes de Compra (OC)' && (
              <>
                <thead><tr><th>OC</th><th>Proveedor</th><th>Fecha</th><th>Monto</th><th>OT</th><th>Entrega</th><th>Estado</th></tr></thead>
                <tbody>{(ordenesCompra.length ? ordenesCompra : MOCK.ordenesCompra).map(oc => (
                  <tr key={oc.id}>
                    <td className="mono">{oc.codigo || oc.id}</td>
                    <td><strong>{(proveedores.find(p => p.id === oc.proveedor_id)?.razon_social) || oc.proveedor || oc.proveedor_id}</strong></td>
                    <td>{oc.fecha_emision || oc.fecha}</td>
                    <td className="num"><strong>{money(oc.total || oc.monto)}</strong></td>
                    <td className="mono text-muted">{oc.ot_id || oc.ot || '-'}</td>
                    <td>{oc.fecha_entrega_esperada || oc.entrega || '-'}</td>
                    <td><span className={'badge '+(oc.estado==='recibida_total'||oc.estado==='aprobada'?'badge-green':oc.estado==='cerrada'?'badge-gray':'badge-orange')}>{String(oc.estado).replace('_',' ')}</span></td>
                  </tr>
                ))}</tbody>
              </>
            )}
            {activeTab === 'Órdenes de Servicio (OSI)' && (
              <>
                <thead><tr><th>OSI</th><th>Proveedor</th><th>Servicio</th><th>Monto</th><th>OT</th><th>Estado</th></tr></thead>
                <tbody>{(ordenesServicio.length ? ordenesServicio : MOCK.ordenesServicio).map(os => (
                  <tr key={os.id}>
                    <td className="mono">{os.codigo || os.id}</td>
                    <td><strong>{(proveedores.find(p => p.id === os.proveedor_id)?.razon_social) || os.proveedor || os.proveedor_id}</strong></td>
                    <td>{os.descripcion || os.servicio}</td>
                    <td className="num"><strong>{money(os.total || os.monto)}</strong></td>
                    <td className="mono text-muted">{os.ot_id || os.ot || '-'}</td>
                    <td><span className="badge badge-cyan">{String(os.estado).replace('_',' ')}</span></td>
                  </tr>
                ))}</tbody>
              </>
            )}
            {activeTab === 'Recepción y Conformidad' && (
              <>
                <thead><tr><th>Recepción</th><th>Documento (OC)</th><th>Proveedor</th><th>Fecha</th><th>Responsable</th><th>Estado</th></tr></thead>
                <tbody>{(recepciones.length ? recepciones : MOCK.recepciones).map(r => (
                  <tr key={r.id}>
                    <td className="mono">{r.codigo || r.id}</td>
                    <td className="mono text-muted">{r.orden_compra_id || r.oc || '-'}</td>
                    <td><strong>{(proveedores.find(p => p.id === r.proveedor_id)?.razon_social) || r.proveedor || '-'}</strong></td>
                    <td>{r.fecha}</td>
                    <td>{r.recibido_por || r.responsable || '-'}</td>
                    <td><span className="badge badge-green">{r.estado}</span></td>
                  </tr>
                ))}</tbody>
              </>
            )}
          </table>
        </div>
      </div>

      {sel && <>
        <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
        <div className="side-panel">
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Compra desde campo</div>
              <div className="font-display mono" style={{fontSize:20, fontWeight:700, marginTop:2}}>{sel.id}</div>
            </div>
            <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
          </div>
          <div className="side-panel-body">
            <div className="row" style={{marginBottom:16}}>
              <span className="badge badge-cyan">{I.camera}Capturado desde campo</span>
              <span className="badge badge-orange">Pendiente revisión backoffice</span>
            </div>
            <div className="grid-2" style={{gap:16}}>
              <div className="card" style={{padding:0, overflow:'hidden'}}>
                <div style={{background:'linear-gradient(135deg, #1A2B4A, #0F1B30)', aspectRatio:'3/4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.7)', padding:20, fontFamily:'JetBrains Mono', fontSize:11, lineHeight:1.8}}>
                  <div style={{position:'absolute', top:14, right:14}} className="badge badge-cyan">Foto original</div>
                  <div style={{background:'rgba(255,255,255,0.95)', color:'#000', padding:20, borderRadius:4, fontSize:10, width:'100%', maxWidth:200}}>
                    <div style={{fontWeight:700,fontSize:12,marginBottom:6}}>FERRETERIA INDUSTRIAL SAC</div>
                    <div style={{opacity:0.6}}>RUC 20512345678</div>
                    <div style={{opacity:0.6,marginBottom:8}}>Av. Industrial 1234</div>
                    <div style={{borderTop:'1px dashed #aaa',paddingTop:6}}>F001-2341</div>
                    <div>22/04/2026</div>
                    <div style={{marginTop:6}}>Tornillos HX 3/8... S/ 180.00</div>
                    <div>Sellador poliuretano... S/ 120.00</div>
                    <div>Electrodos 6013... S/ 150.00</div>
                    <div style={{borderTop:'1px solid #000',marginTop:8,paddingTop:4,fontWeight:700}}>TOTAL: S/ 450.00</div>
                  </div>
                </div>
              </div>
              <div className="col" style={{gap:12}}>
                <div><div className="eyebrow row" style={{gap:6}}><span className="badge badge-purple" style={{padding:'1px 6px'}}>IA</span> Proveedor extraído</div><div style={{fontWeight:600}}>{sel.proveedor}</div></div>
                <div><div className="eyebrow row" style={{gap:6}}><span className="badge badge-purple" style={{padding:'1px 6px'}}>IA</span> N° documento</div><div className="mono">{sel.doc}</div></div>
                <div><div className="eyebrow row" style={{gap:6}}><span className="badge badge-purple" style={{padding:'1px 6px'}}>IA</span> Monto</div><div style={{fontFamily:'Sora',fontSize:22,fontWeight:700}}>{money(sel.monto)}</div></div>
                <div><div className="eyebrow">OT asignada</div><div className="mono">{sel.ot}</div></div>
                <div><div className="eyebrow">Capturado por</div><div>J. Quispe · {sel.fecha}</div></div>
              </div>
            </div>
            <div className="row mt-6">
              <button className="btn btn-primary flex-1">{I.check} Validar y registrar</button>
              <button className="btn btn-secondary">{I.edit} Corregir datos</button>
              <button className="btn btn-ghost">Rechazar</button>
            </div>
          </div>
        </div>
      </>}
    </>
  );
}

function Backlog() {
  const { backlog, setBacklog, cuentas, convertirBacklogAOT, addNotificacion, empresa, searchQuery } = useApp();
  const [view, setView] = useState('kanban');
  const getCuenta = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  
  const query = searchQuery.toLowerCase();
  const filteredBacklog = backlog.filter(b => 
    b.descripcion.toLowerCase().includes(query) ||
    getCuenta(b.cuenta_id).toLowerCase().includes(query) ||
    (b.servicio || '').toLowerCase().includes(query)
  );

  const cols = [
    { k: 'pendiente', title: 'Pendientes', color: '#64748b' },
    { k: 'en_revision', title: 'En Revisión', color: '#06b6d4' },
    { k: 'convertido', title: 'Convertido', color: '#10b981' },
  ];

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) {
      setBacklog(prev => prev.map(b => b.id === id ? { ...b, estado: targetStatus } : b));
      addNotificacion(`Requerimiento movido a ${targetStatus.replace('_',' ')}`);
    }
  };

  const pendientes = backlog.filter(b => b.estado === 'pendiente');
  const enRevision = backlog.filter(b => b.estado === 'en_revision');

  return (
    <>
      <div className="page-header" style={{alignItems:'flex-start', marginBottom:24}}>
        <div>
          <h1 className="page-title" style={{fontSize:24, fontWeight:800}}>Backlog de Trabajo</h1>
          <div className="page-sub" style={{marginTop:4}}>
            Cola priorizada de requerimientos para programación de OTs
          </div>
        </div>
        <div className="row" style={{gap:12}}>
          <div className="segmented-control">
            <button className={`seg-btn ${view==='kanban'?'active':''}`} onClick={()=>setView('kanban')}>{I.grid} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className="btn btn-secondary">{I.filter} Filtros</button>
          <button className="btn btn-primary">{I.plus} Nuevo requerimiento</button>
        </div>
      </div>

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(3, 1fr)'}}>
        {cols.map((c, i) => {
          const list = filteredBacklog.filter(b => b.estado === c.k);
          const icons = [I.clock, I.search, I.check];
          const labels = ['Requerimientos', 'Analizando', 'A OTs'];
          return (
            <div key={c.k} className="pipeline-kpi-card hover-raise" style={{'--accent': c.color}}>
              <div className="pipeline-kpi-icon" style={{color: c.color}}>{icons[i]}</div>
              <div className="pipeline-kpi-label">{c.title}</div>
              <div className="pipeline-kpi-value">{list.length}</div>
              <div className="pipeline-kpi-count">{labels[i]}</div>
            </div>
          );
        })}
      </div>

      {view === 'kanban' ? (
        <div style={{overflowX:'auto', paddingBottom:20, marginTop:24}}>
          <div className="kanban-v2">
            {cols.map((c, i) => {
              const list = filteredBacklog.filter(b => b.estado === c.k);
              return (
                <div 
                  key={c.k} 
                  className="kanban-col-v2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, c.k)}
                  style={{ '--accent': c.color }}
                >
                  <div className="kanban-col-head-v2">
                    <div className="kanban-col-title-v2">{c.title}</div>
                    <div className="kanban-col-count-v2">{list.length}</div>
                  </div>
                  
                  <div style={{flex:1}}>
                    {list.length > 0 ? (
                      list.map(b => (
                        <div 
                          key={b.id} 
                          className="kanban-card-v2"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', b.id)}
                        >
                          <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:10, lineHeight:1.4}}>
                            {b.servicio}
                          </div>
                          <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:10}}>
                            {getCuenta(b.cuenta_id)}
                          </div>
                          
                          <div style={{fontSize:14, fontWeight:800, color:'var(--navy)', marginBottom:12}}>
                            {money(b.monto || 0)}
                          </div>
  
                          <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
                            <div className="row" style={{gap:6}}>
                              <span className={`badge ${b.prioridad==='alta'?'badge-danger':'badge-gray'}`} style={{fontSize:9, padding:'1px 6px'}}>{b.prioridad}</span>
                              <div className="text-muted" style={{fontSize:10}}>{b.fecha_recepcion}</div>
                            </div>
                            <div className="avatar" style={{width:24, height:24, fontSize:10, margin:0, background:'var(--navy)', color:'#fff'}}>
                              {b.responsable?.charAt(0) || 'B'}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="card-empty-state">
                        <div style={{opacity:0.5}}>{[I.clock, I.search, I.check][i]}</div>
                        <p>No hay requerimientos en {c.title}<br/><span style={{fontSize:10}}>Los nuevos aparecerán aquí.</span></p>
                      </div>
                    )}
                  </div>
  
                  <button className="kanban-btn-add">
                    {I.plus} Agregar requerimiento
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card mt-6">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Cuenta</th>
                  <th>Monto</th>
                  <th>Prioridad</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredBacklog.map(b => (
                  <tr key={b.id} className="hover-row">
                    <td><div style={{fontWeight:600}}>{b.servicio}</div></td>
                    <td>{getCuenta(b.cuenta_id)}</td>
                    <td><strong>{money(b.monto)}</strong></td>
                    <td><span className={`badge ${b.prioridad==='alta'?'badge-danger':'badge-gray'}`}>{b.prioridad.toUpperCase()}</span></td>
                    <td className="text-muted">{b.fecha_recepcion}</td>
                    <td><span className={'badge badge-' + (b.estado==='convertido'?'green':'cyan')}>{b.estado.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ============ CIERRE TÉCNICO ============
function Cierre() {
  const { ots, partes, cerrarTecnicamenteOT, cuentas, searchQuery } = useApp();
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    resultado: 'conforme',
    cliente_nombre: '',
    cliente_documento: '',
    observaciones: '',
    cerrado_por: '',
  });
  const getCuenta = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  const partesAprobados = (otId) => partes.filter(p => p.ot_id === otId && p.estado === 'aprobado');
  const abrirCierre = (ot) => {
    setForm({
      fecha: new Date().toISOString().split('T')[0],
      resultado: 'conforme',
      cliente_nombre: '',
      cliente_documento: '',
      observaciones: '',
      cerrado_por: ot.responsable || '',
    });
    setSel(ot);
  };
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const confirmarCierre = (event) => {
    event.preventDefault();
    if (!sel) return;
    cerrarTecnicamenteOT(sel.id, {
      fecha: form.fecha,
      resultado: form.resultado,
      observaciones: form.observaciones,
      cerrado_por: form.cerrado_por || null,
      conformidad_cliente: {
        nombre: form.cliente_nombre,
        documento: form.cliente_documento,
        aceptado: form.resultado === 'conforme'
      }
    });
    setSel(null);
  };

  const query = searchQuery.toLowerCase();
  const otsParaCierre = ots.filter(o => {
    if (o.estado !== 'ejecucion' && o.estado !== 'cerrada') return false;
    return !query || 
      o.numero.toLowerCase().includes(query) ||
      (o.cliente || '').toLowerCase().includes(query) ||
      (getCuenta(o.cuenta_id) || '').toLowerCase().includes(query) ||
      (o.sede || '').toLowerCase().includes(query);
  });
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cierre Técnico</h1>
          <div className="page-sub">Validación final de OTs ejecutadas con firma del cliente</div>
        </div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>OT</th>
                <th>Cliente / Sede</th>
                <th>Avance Partes</th>
                <th>Responsable</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {otsParaCierre.map(o => (
                <tr key={o.id} className="hover-row">
                  <td className="mono" style={{fontWeight:600}}>{o.numero}</td>
                  <td>
                    <div style={{fontWeight:600}}>{getCuenta(o.cuenta_id) || o.cliente}</div>
                    <div className="text-muted" style={{fontSize:12}}>{o.sede}</div>
                  </td>
                  <td>
                    <div className="row" style={{gap:8, width:120}}>
                      <div className="bar flex-1" style={{height:6, background:'var(--bg-subtle)'}}>
                        <div style={{width:(o.avance||0)+'%', background:o.avance===100?'var(--green)':'var(--cyan)', height:'100%', borderRadius:999}}/>
                      </div>
                      <span style={{fontSize:11, fontWeight:600, width:28}}>{o.avance||0}%</span>
                    </div>
                  </td>
                  <td>{o.responsable}</td>
                  <td>
                    <span className={'badge ' + (o.estado==='cerrada'?'badge-purple':'badge-orange')}>
                      {o.estado==='cerrada'?'Cerrada':'En Ejecución'}
                    </span>
                  </td>
                  <td>
                    {o.estado==='cerrada' ? (
                      <button className="btn btn-sm btn-ghost">{I.file} Ver Acta</button>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={() => abrirCierre(o)}>{I.check} Revisar y Cerrar</button>
                    )}
                  </td>
                </tr>
              ))}
              {otsParaCierre.length === 0 && (
                <tr><td colSpan="6" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>No hay OTs para cerrar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {sel && <>
        <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
        <div className="side-panel" style={{width:'min(620px,96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Cierre tecnico</div>
              <div className="font-display mono" style={{fontSize:20, fontWeight:700}}>{sel.numero}</div>
            </div>
            <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={confirmarCierre}>
            <div className="card" style={{padding:14, marginBottom:16}}>
              <div className="grid-3" style={{gap:12}}>
                <div><div className="eyebrow">Cliente</div><div>{getCuenta(sel.cuenta_id) || sel.cliente}</div></div>
                <div><div className="eyebrow">Avance</div><div>{sel.avance || 0}%</div></div>
                <div><div className="eyebrow">Partes aprobados</div><div>{partesAprobados(sel.id).length}</div></div>
              </div>
            </div>
            <div className="grid-2" style={{gap:12}}>
              <div className="input-group">
                <label>Fecha de cierre</label>
                <input className="input" type="date" value={form.fecha} onChange={e => update('fecha', e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Resultado</label>
                <select className="select" value={form.resultado} onChange={e => update('resultado', e.target.value)}>
                  <option value="conforme">Conforme</option>
                  <option value="observado">Observado</option>
                  <option value="rechazado">Rechazado</option>
                </select>
              </div>
              <div className="input-group">
                <label>Conformidad cliente</label>
                <input className="input" value={form.cliente_nombre} onChange={e => update('cliente_nombre', e.target.value)} placeholder="Nombre del contacto" />
              </div>
              <div className="input-group">
                <label>Documento / cargo</label>
                <input className="input" value={form.cliente_documento} onChange={e => update('cliente_documento', e.target.value)} placeholder="DNI, cargo o referencia" />
              </div>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>Cerrado por</label>
                <input className="input" value={form.cerrado_por} onChange={e => update('cerrado_por', e.target.value)} />
              </div>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>Observaciones</label>
                <textarea className="input" rows="4" value={form.observaciones} onChange={e => update('observaciones', e.target.value)} placeholder="Resumen de conformidad, pendientes o restricciones" />
              </div>
            </div>
            <div className="row mt-6" style={{justifyContent:'flex-end'}}>
              <button type="button" className="btn btn-secondary" onClick={() => setSel(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{I.check} Confirmar cierre</button>
            </div>
          </form>
        </div>
      </>}
    </>
  );
}

// ============ GUÍAS DE REMISIÓN ============
function Remision() {
  const { searchQuery } = useApp();
  const query = searchQuery.toLowerCase();
  const filteredRemisiones = MOCK.remisiones.filter(r => 
    r.id.toLowerCase().includes(query) ||
    r.ot.toLowerCase().includes(query) ||
    r.destino.toLowerCase().includes(query) ||
    r.transportista.toLowerCase().includes(query)
  );
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Transporte y Logística</h1>
          <div className="page-sub">Traslado de materiales, guías de remisión y control de flotas</div>
        </div>
        <button className="btn btn-primary">{I.plus} Emitir Guía</button>
      </div>
      <div className="tabs">
        <div className="tab active">Guías de Remisión</div>
        <div className="tab">Flota y Choferes</div>
        <div className="tab">Rutas y Programación</div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° Guía</th>
                <th>OT Destino</th>
                <th>Punto de Llegada</th>
                <th>Transportista / Chofer</th>
                <th>Fecha Salida</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRemisiones.map(r => (
                <tr key={r.id} className="hover-row">
                  <td className="mono" style={{fontWeight:600}}>{r.id}</td>
                  <td className="mono">{r.ot}</td>
                  <td>{r.destino}</td>
                  <td>{r.transportista}</td>
                  <td className="text-muted">{r.fecha}</td>
                  <td>
                    <span className={'badge ' + (r.estado==='entregado'?'badge-green':'badge-cyan')}>
                      {r.estado.toUpperCase()}
                    </span>
                  </td>
                  <td><button className="icon-btn">{I.chev}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SOLPE() {
  const { solpes, ots, searchQuery } = useApp();
  const getOTNumero = (id) => ots.find(o => o.id === id)?.numero || id;

  const query = searchQuery.toLowerCase();
  const filteredSolpes = solpes.filter(s => 
    s.numero.toLowerCase().includes(query) ||
    getOTNumero(s.ot_id).toLowerCase().includes(query) ||
    s.solicitante.toLowerCase().includes(query) ||
    (s.centro_costo || '').toLowerCase().includes(query)
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">SOLPE (Pedidos Internos)</h1>
          <div className="page-sub">Requerimientos de almacén generados por el equipo técnico</div>
        </div>
        <button className="btn btn-primary">{I.plus} Nueva SOLPE</button>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° SOLPE</th>
                <th>OT Asociada</th>
                <th>Solicitante</th>
                <th>Centro de Costo</th>
                <th>N° Items</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredSolpes.map(s => (
                <tr key={s.id} className="hover-row">
                  <td className="mono" style={{fontWeight:600}}>{s.numero}</td>
                  <td className="mono">{getOTNumero(s.ot_id)}</td>
                  <td>{s.solicitante}</td>
                  <td className="text-muted">{s.centro_costo}</td>
                  <td>{s.items?.length || 0} items</td>
                  <td className="text-muted">{s.fecha}</td>
                  <td>
                    <span className={'badge ' + (s.estado==='atendida'?'badge-green':s.estado==='solicitada'?'badge-orange':'badge-gray')}>
                      {s.estado.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {s.estado === 'solicitada' ? (
                      <button className="btn btn-sm btn-primary">Atender</button>
                    ) : (
                      <button className="btn btn-sm btn-ghost">Ver detalles</button>
                    )}
                  </td>
                </tr>
              ))}
              {solpes.length === 0 && (
                <tr><td colSpan="8" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>No hay SOLPEs registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Planner() {
  const { searchQuery } = useApp();
  const [plannerTab, setPlannerTab] = useState('tecnicos');
  const tecnicos = ['Luis Mendoza', 'Carlos Reyes', 'Ana Torres', 'Jorge Quispe'];
  const dias = ['Lun 28', 'Mar 29', 'Mie 30', 'Jue 1', 'Vie 2', 'Sab 3'];

  const query = searchQuery.toLowerCase();
  const getCuentaNombre = id => (MOCK.cuentas||[]).find(c=>c.id===id)?.razon_social || id;
  
  const filteredRenovaciones = [...(MOCK.renovaciones||[])]
    .filter(r => !query || getCuentaNombre(r.cuenta_id).toLowerCase().includes(query) || r.servicio.toLowerCase().includes(query))
    .sort((a,b)=>a.dias_restantes-b.dias_restantes)
    .slice(0,4);
    
  const filteredOnboardings = (MOCK.onboardings||[])
    .filter(o => o.estado!=='completado' && (!query || getCuentaNombre(o.cuenta_id).toLowerCase().includes(query) || o.tipo_servicio.toLowerCase().includes(query)));
    
  const filteredNps = (MOCK.npsEncuestas||[])
    .filter(n => n.estado==='enviado' && (!query || getCuentaNombre(n.cuenta_id).toLowerCase().includes(query)));
    
  const filteredPlanes = (MOCK.planesExito||[])
    .filter(p => p.alertas && p.alertas.length>0 && (!query || getCuentaNombre(p.cuenta_id).toLowerCase().includes(query)));

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Planner de Recursos</h1><div className="page-sub">Programación de técnicos y agenda Customer Success</div></div>
        <div className="row">
          <button className="btn btn-secondary">{I.filter} Filtros</button>
          <button className="btn btn-primary">{I.plus} Asignar Turno</button>
        </div>
      </div>

      <div className="tabs">
        <div className={'tab '+(plannerTab==='tecnicos'?'active':'')} onClick={()=>setPlannerTab('tecnicos')}>Técnicos</div>
        <div className={'tab '+(plannerTab==='cs'?'active':'')} onClick={()=>setPlannerTab('cs')}>
          Agenda CS
          {(filteredRenovaciones.filter(r=>r.dias_restantes<=30).length + filteredNps.length) > 0 && (
            <span className="sidebar-item-badge" style={{marginLeft:6}}>{filteredRenovaciones.filter(r=>r.dias_restantes<=30).length + filteredNps.length}</span>
          )}
        </div>
      </div>

      {plannerTab === 'tecnicos' && (
        <div className="card">
          <div style={{overflowX:'auto'}}>
            <table className="tbl" style={{minWidth:800}}>
              <thead>
                <tr>
                  <th style={{width:200}}>Técnico / Cuadrilla</th>
                  {dias.map(d => <th key={d} style={{textAlign:'center'}}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {tecnicos.map(t => (
                  <tr key={t}>
                    <td style={{fontWeight:600}}>{t}</td>
                    {dias.map((d, i) => {
                      let task = null;
                      if (t === 'Luis Mendoza' && i < 2) task = {ot: 'OT-0045', color: 'var(--cyan)'};
                      if (t === 'Carlos Reyes' && i > 2 && i < 5) task = {ot: 'OT-0046', color: 'var(--purple)'};
                      if (t === 'Ana Torres' && i === 1) task = {ot: 'Mantenimiento', color: 'var(--orange)'};
                      return (
                        <td key={d} style={{padding:4, borderRight:'1px solid var(--border-subtle)', verticalAlign:'top'}}>
                          {task
                            ? <div style={{background:task.color, color:'white', fontSize:11, padding:'4px 8px', borderRadius:4, fontWeight:600, cursor:'pointer'}}>{task.ot}</div>
                            : <div style={{height:24}}/>
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {plannerTab === 'cs' && (
        <div style={{display:'grid', gap:20}}>

          {/* Renovaciones próximas */}
          <div className="card">
            <div className="card-head"><h3>Renovaciones — Pendientes de contacto</h3><span className="badge badge-cyan">{filteredRenovaciones.length}</span></div>
            <table className="tbl">
              <thead><tr><th>Cliente</th><th>Servicio</th><th>Responsable CS</th><th>Vencimiento</th><th>Días</th><th>Estado</th></tr></thead>
              <tbody>
                {filteredRenovaciones.map(r => (
                  <tr key={r.id}>
                    <td style={{fontWeight:600}}>{getCuentaNombre(r.cuenta_id)}</td>
                    <td>{r.servicio}</td>
                    <td>{r.responsable_cs}</td>
                    <td>{r.fecha_vencimiento}</td>
                    <td><span className={'badge '+(r.dias_restantes<=30?'badge-red':r.dias_restantes<=60?'badge-yellow':'badge-green')}>{r.dias_restantes}d</span></td>
                    <td><span className={'badge '+(r.estado==='renovado'?'badge-green':r.estado==='en_negociacion'?'badge-cyan':'badge-gray')}>{r.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Onboardings activos */}
          {filteredOnboardings.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Onboardings en Progreso</h3><span className="badge badge-purple">{filteredOnboardings.length}</span></div>
              <div style={{padding:'0 20px 16px', display:'flex', flexDirection:'column', gap:14}}>
                {filteredOnboardings.map(o => {
                  const completados = o.checklist.filter(c=>c.completado).length;
                  const total = o.checklist.length;
                  const pct = Math.round(completados/total*100);
                  return (
                    <div key={o.id} style={{display:'grid', gridTemplateColumns:'1fr 120px 60px', gap:12, alignItems:'center'}}>
                      <div>
                        <div style={{fontWeight:600, fontSize:13}}>{getCuentaNombre(o.cuenta_id)}</div>
                        <div style={{fontSize:11, color:'var(--fg-subtle)'}}>{o.tipo_servicio} · {o.responsable_cs}</div>
                      </div>
                      <div style={{background:'var(--bg-subtle)', borderRadius:4, height:8}}>
                        <div style={{width:pct+'%', height:'100%', background:pct>=75?'var(--green)':'var(--cyan)', borderRadius:4}}/>
                      </div>
                      <span style={{fontSize:12, fontWeight:700, textAlign:'right'}}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Planes con alertas */}
          {filteredPlanes.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Planes de Éxito — Alertas activas</h3><span className="badge badge-yellow">{filteredPlanes.length}</span></div>
              <div style={{padding:'0 20px 16px', display:'flex', flexDirection:'column', gap:10}}>
                {filteredPlanes.map(p => (
                  <div key={p.id} style={{padding:'10px 14px', background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:8}}>
                    <div style={{fontWeight:600, fontSize:13, marginBottom:4}}>{getCuentaNombre(p.cuenta_id)}</div>
                    {p.alertas.map((a,i) => <div key={i} style={{fontSize:12, color:'var(--warning)'}}>⚠ {a}</div>)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NPS pendientes de respuesta */}
          {filteredNps.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>NPS — Pendientes de respuesta</h3><span className="badge badge-orange">{filteredNps.length}</span></div>
              <table className="tbl">
                <thead><tr><th>Cliente</th><th>Responsable CS</th><th>Enviado</th></tr></thead>
                <tbody>
                  {filteredNps.map(n => (
                    <tr key={n.id}>
                      <td style={{fontWeight:600}}>{getCuentaNombre(n.cuenta_id)}</td>
                      <td>{n.responsable_cs}</td>
                      <td>{n.fecha_envio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}
    </>
  );
}

function Tickets() {
  const { tickets: contextTickets, setTickets: setContextTickets, addNotificacion, searchQuery } = useApp();
  const [view, setView] = useState('kanban');
  const [tickets, setTickets] = useState([
    { id:'TK-0105', cliente:'Minera Andes SAC',        asunto:'Motor de ventilación sin respuesta',     categoria:'Avería',       prioridad:'critica', estado:'abierto',    sla:'vencido', asignado:'Soporte N2',  fecha:'2026-04-25', canal:'email'  },
    { id:'TK-0104', cliente:'Planta Industrial Norte',  asunto:'Calibración de sensores de presión',     categoria:'Mantenimiento',prioridad:'media',   estado:'en_proceso', sla:'ok',      asignado:'Luis Mendoza', fecha:'2026-04-26', canal:'portal' },
    { id:'TK-0103', cliente:'Facilities Lima',          asunto:'Revisión tablero eléctrico Q1',          categoria:'Preventivo',   prioridad:'baja',    estado:'resuelto',   sla:'ok',      asignado:'Ana Torres',  fecha:'2026-04-20', canal:'llamada'},
    { id:'TK-0102', cliente:'Minera Andes SAC',        asunto:'Falla en variador de frecuencia',        categoria:'Avería',       prioridad:'alta',    estado:'en_proceso', sla:'riesgo',  asignado:'Carlos Reyes', fecha:'2026-04-27', canal:'email'  },
    { id:'TK-0101', cliente:'Planta Industrial Norte',  asunto:'Consulta garantía de repuestos',         categoria:'Consulta',     prioridad:'baja',    estado:'resuelto',   sla:'ok',      asignado:'Carla Meza',  fecha:'2026-04-22', canal:'email'  },
    { id:'TK-0100', cliente:'Logística Altiplano',      asunto:'Reclamo por atraso en entrega',          categoria:'Reclamo',      prioridad:'alta',    estado:'abierto',    sla:'riesgo',  asignado:'Soporte N1',  fecha:'2026-04-26', canal:'portal' },
    { id:'TK-0099', cliente:'Constructora del Pacífico',asunto:'Solicitud de cotización de servicio',    categoria:'Consulta',     prioridad:'baja',    estado:'resuelto',   sla:'ok',      asignado:'Carla Meza',  fecha:'2026-04-18', canal:'email'  },
  ]);

  const cols = [
    { k: 'abierto', title: 'Abiertos', color: '#64748b' },
    { k: 'en_proceso', title: 'En Proceso', color: '#06b6d4' },
    { k: 'resuelto', title: 'Resueltos', color: '#10b981' },
  ];

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) {
      setTickets(prev => prev.map(t => t.id === id ? { ...t, estado: targetStatus } : t));
      addNotificacion(`Ticket movido a ${targetStatus.replace('_',' ')}`);
    }
  };

  const query = searchQuery.toLowerCase();
  const filteredTickets = (tickets || []).filter(t => 
    (t.asunto || '').toLowerCase().includes(query) ||
    (t.cliente || '').toLowerCase().includes(query) ||
    (t.id || '').toLowerCase().includes(query)
  );

  const abiertos   = filteredTickets.filter(t => t.estado === 'abierto').length;
  const enProceso  = filteredTickets.filter(t => t.estado === 'en_proceso').length;
  const resueltos  = filteredTickets.filter(t => t.estado === 'resuelto').length;
  const criticos   = filteredTickets.filter(t => t.prioridad === 'critica' && t.estado !== 'resuelto').length;
  const slaAlerta  = filteredTickets.filter(t => t.sla !== 'ok' && t.estado !== 'resuelto').length;

  const slaBadge   = s => s === 'vencido' ? 'badge-red' : s === 'riesgo' ? 'badge-orange' : 'badge-green';
  const pBadge     = p => p === 'critica' ? 'badge-red' : p === 'alta' ? 'badge-orange' : p === 'media' ? 'badge-yellow' : 'badge-gray';
  const canalIcon  = c => c === 'email' ? '✉' : c === 'portal' ? '🌐' : '📞';

  return (
    <>
      <div className="page-header" style={{alignItems:'flex-start', marginBottom:24}}>
        <div>
          <h1 className="page-title" style={{fontSize:24, fontWeight:800}}>Soporte y Tickets</h1>
          <div className="page-sub" style={{marginTop:4}}>
            Gestión de incidentes y atención al cliente post-venta
          </div>
        </div>
        <div className="row" style={{gap:12}}>
          <div className="segmented-control">
            <button className={`seg-btn ${view==='kanban'?'active':''}`} onClick={()=>setView('kanban')}>{I.grid} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className="btn btn-secondary">{I.filter} Filtros</button>
          <button className="btn btn-primary">{I.plus} Nuevo Ticket</button>
        </div>
      </div>

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(3, 1fr)'}}>
        {cols.map((c, i) => {
          const list = filteredTickets.filter(t => t.estado === c.k);
          const icons = [I.alert, I.clock, I.check];
          return (
            <div key={c.k} className="pipeline-kpi-card hover-raise" style={{'--accent': c.color}}>
              <div className="pipeline-kpi-icon" style={{color: c.color}}>{icons[i]}</div>
              <div className="pipeline-kpi-label">{c.title}</div>
              <div className="pipeline-kpi-value">{list.length}</div>
              <div className="pipeline-kpi-count">Ver detalles</div>
            </div>
          );
        })}
      </div>

      {view === 'kanban' ? (
        <div style={{overflowX:'auto', paddingBottom:20, marginTop:24}}>
          <div className="kanban-v2">
            {cols.map((c, i) => {
              const list = filteredTickets.filter(t => t.estado === c.k);
              return (
                <div 
                  key={c.k} 
                  className="kanban-col-v2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, c.k)}
                  style={{ '--accent': c.color }}
                >
                  <div className="kanban-col-head-v2">
                    <div className="kanban-col-title-v2">{c.title}</div>
                    <div className="kanban-col-count-v2">{list.length}</div>
                  </div>
                  
                  <div style={{flex:1}}>
                    {list.length > 0 ? (
                      list.map(t => (
                        <div 
                          key={t.id} 
                          className="kanban-card-v2"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                          style={{cursor: 'grab'}}
                        >
                          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                            <span className={'badge ' + pBadge(t.prioridad)} style={{fontSize:9}}>
                              {t.prioridad.toUpperCase()}
                            </span>
                            <span className={'badge ' + slaBadge(t.sla)} style={{fontSize:9}}>
                              SLA {t.sla.toUpperCase()}
                            </span>
                          </div>
                          
                          <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:4, lineHeight:1.4}}>
                            {t.asunto}
                          </div>
                          <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:8}}>
                            {t.cliente}
                          </div>
                          
                          <div style={{display:'flex', gap:8, marginBottom:12}}>
                            <span className="badge badge-gray" style={{fontSize:9}}>{t.categoria}</span>
                            <span style={{fontSize:14}} title={t.canal}>{canalIcon(t.canal)}</span>
                          </div>
                          
                          <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
                            <div className="row" style={{gap:6}}>
                              <div className="avatar" style={{width:20, height:20, fontSize:9, background:'var(--navy)', color:'#fff'}}>{t.asignado.charAt(0)}</div>
                              <span style={{fontSize:10, color:'var(--fg-muted)'}}>{t.asignado}</span>
                            </div>
                            <div style={{fontSize:10, color:'var(--fg-muted)', fontWeight:600}}>
                              {t.id}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="card-empty-state">
                        <div style={{opacity:0.3}}>{[I.alert, I.clock, I.check][i]}</div>
                        <p>Sin tickets {c.title.toLowerCase()}<br/><span style={{fontSize:10}}>Arrastra aquí para asignar.</span></p>
                      </div>
                    )}
                  </div>
                  <button className="kanban-btn-add">
                    {I.plus} Nuevo Ticket
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card mt-6">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Cliente</th>
                  <th>Prioridad</th>
                  <th>SLA</th>
                  <th>Asignado</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id} className="hover-row">
                    <td><div style={{fontWeight:600}}>{t.asunto}</div><div className="text-muted" style={{fontSize:11}}>{t.id}</div></td>
                    <td>{t.cliente}</td>
                    <td><span className={'badge ' + pBadge(t.prioridad)}>{t.prioridad.toUpperCase()}</span></td>
                    <td><span className={'badge ' + slaBadge(t.sla)}>SLA {t.sla.toUpperCase()}</span></td>
                    <td>{t.asignado}</td>
                    <td>{t.categoria}</td>
                    <td><span className="badge badge-cyan">{t.estado.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

const PERSONAL_INICIAL_OPS = [
  { id:'TEC-001', nombre:'Luis Mendoza',    cargo:'Técnico Mecánico',        especialidad:'Mecánica Industrial', costo:45, estado:'disponible', turno_id:'tur_001', turno:'Mañana',   docs:{ sctr:'vigente', medico:'vigente',    epp:'ok',         licencia:'vigente'    }},
  { id:'TEC-002', nombre:'Carlos Reyes',    cargo:'Electricista Industrial',  especialidad:'Alta Tensión',        costo:50, estado:'ocupado',    turno_id:'tur_001', turno:'Mañana',  docs:{ sctr:'por_vencer',medico:'vigente',   epp:'ok',         licencia:'vigente'    }},
  { id:'TEC-003', nombre:'Ana Torres',      cargo:'Supervisora SSO',          especialidad:'Seguridad OHSAS',     costo:75, estado:'disponible', turno_id:'tur_005', turno:'Administrativo',   docs:{ sctr:'vigente', medico:'vigente',    epp:'ok',         licencia:'vigente'    }},
  { id:'TEC-004', nombre:'Jorge Quispe',    cargo:'Ayudante Técnico',         especialidad:'General',             costo:25, estado:'vacaciones', turno_id:'tur_002', turno:'Tarde',        docs:{ sctr:'vencido', medico:'por_vencer', epp:'incompleto', licencia:'vigente'    }},
  { id:'TEC-005', nombre:'Pedro Condori',   cargo:'Técnico Electrónico',      especialidad:'Instrumentación',     costo:55, estado:'disponible', turno_id:'tur_004', turno:'Campo',    docs:{ sctr:'vigente', medico:'vigente',    epp:'ok',         licencia:'vigente'    }},
  { id:'TEC-006', nombre:'Rosa Huanca',     cargo:'Técnica de Instrumentación',especialidad:'PLC / SCADA',        costo:65, estado:'disponible', turno_id:'tur_001', turno:'Mañana',   docs:{ sctr:'vigente', medico:'vigente',    epp:'ok',         licencia:'por_vencer' }},
];

function timeToMinutesHHMM(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToLabel(min) {
  const v = Math.max(0, Math.round(min || 0));
  const h = Math.floor(v / 60);
  const m = v % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

function horasEfectivasTurno(entrada, salida, cruzaMedianoche, refrigerio) {
  let minSalida = timeToMinutesHHMM(salida);
  if (cruzaMedianoche) minSalida += 24 * 60;
  const total = minSalida - timeToMinutesHHMM(entrada) - (Number(refrigerio) || 0);
  return minutesToLabel(total);
}

function calcularResultadoAsistencia(horaEntrada, horaSalida, turno, esFalta, justificada) {
  if (esFalta || !horaEntrada) {
    return { horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0, estado:justificada ? 'falta_justificada' : 'falta', label:justificada ? 'Falta justif.' : 'Falta' };
  }
  if (!horaSalida || !turno) {
    return { horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0, estado:'incompleto', label:'Incompleto' };
  }
  const entradaMin = timeToMinutesHHMM(horaEntrada);
  let salidaMin = timeToMinutesHHMM(horaSalida);
  if (turno.cruza_medianoche && salidaMin < entradaMin) salidaMin += 24 * 60;
  let turnoSalidaMin = timeToMinutesHHMM(turno.hora_salida);
  if (turno.cruza_medianoche) turnoSalidaMin += 24 * 60;
  const trabajadasMin = Math.max(0, salidaMin - entradaMin - (turno.refrigerio_minutos || 0));
  const tardanzaMin = Math.max(0, entradaMin - timeToMinutesHHMM(turno.hora_entrada) - (turno.tolerancia_minutos || 0));
  const extraMin = Math.max(0, salidaMin - turnoSalidaMin - 30);
  const estado = tardanzaMin > 0 ? 'tardanza' : extraMin > 0 ? 'horas_extra' : 'completo';
  const label = tardanzaMin > 0 ? `Tardanza ${tardanzaMin}min` : extraMin > 0 ? `Horas extra ${minutesToLabel(extraMin)}` : 'Completo';
  return { horas_trabajadas_min:trabajadasMin, tardanza_min:tardanzaMin, horas_extra_min:extraMin, estado, label };
}

function asistenciaBadge(estado) {
  return estado === 'completo' ? 'badge-green'
    : estado === 'horas_extra' ? 'badge-cyan'
    : estado === 'tardanza' ? 'badge-orange'
    : estado === 'falta_justificada' ? 'badge-red'
    : estado === 'falta' ? 'badge-red'
    : 'badge-gray';
}

function workerTurno(turnos, worker) {
  return turnos.find(t => t.id === worker.turno_id) || turnos[0] || {};
}

function calcularIR5ta(remuneracionBrutaMensual) {
  const UIT = 5150;
  const base = (remuneracionBrutaMensual * 12) - (7 * UIT);
  if (base <= 0) return 0;
  if (base <= 5 * UIT) return (base * 0.08) / 12;
  if (base <= 20 * UIT) return ((5 * UIT * 0.08) + ((base - 5 * UIT) * 0.14)) / 12;
  if (base <= 35 * UIT) return ((5 * UIT * 0.08) + (15 * UIT * 0.14) + ((base - 20 * UIT) * 0.17)) / 12;
  if (base <= 45 * UIT) return ((5 * UIT * 0.08) + (15 * UIT * 0.14) + (15 * UIT * 0.17) + ((base - 35 * UIT) * 0.20)) / 12;
  return ((5 * UIT * 0.08) + (15 * UIT * 0.14) + (15 * UIT * 0.17) + (10 * UIT * 0.20) + ((base - 45 * UIT) * 0.30)) / 12;
}

function calcularNominaTrabajador(trabajador, datosNomina, turno, registros, periodo) {
  const diasLaborables = turno.dias_variables ? 22 : 22;
  const horasEfectivas = Number(turno.horas_efectivas) || 8;
  const sueldoBase = Number(datosNomina?.sueldo_base || trabajador.remuneracion || 3000);
  const valorDia = sueldoBase / diasLaborables;
  const valorHora = sueldoBase / (diasLaborables * horasEfectivas);
  const valorMinuto = valorHora / 60;
  const asistencias = registros.filter(r => !r.es_falta).length;
  const faltasInjustificadas = registros.filter(r => r.estado === 'falta').length;
  const faltasJustificadas = registros.filter(r => r.estado === 'falta_justificada').length;
  const tardanzas = registros.filter(r => r.estado === 'tardanza').length;
  const minutosTardanza = registros.reduce((sum, r) => sum + (Number(r.tardanza_min) || 0), 0);
  const horasExtraMin = registros.reduce((sum, r) => sum + (Number(r.horas_extra_min) || 0), 0);
  const descFaltas = faltasInjustificadas * valorDia;
  const descTardanzas = minutosTardanza * valorMinuto;
  const addHorasExtra = horasExtraMin * ((valorHora * 1.25) / 60);
  const asignacionFamiliar = datosNomina?.tiene_hijos ? 102.5 : 0;
  const remuneracionBruta = sueldoBase - descFaltas - descTardanzas + addHorasExtra + asignacionFamiliar;
  const sistema = datosNomina?.sistema_pensionario || 'AFP';
  const descPensiones = remuneracionBruta * (sistema === 'AFP' ? 0.1324 : 0.13);
  const descPrestamo = Number(datosNomina?.cuota_prestamo_mes || 0);
  const descAnticipo = Number(datosNomina?.anticipo_periodo || 0);
  const descJudicial = Number(datosNomina?.descuento_judicial || 0);
  const totalDescuentos = descPensiones + descPrestamo + descAnticipo + descJudicial;
  const retencionIR = calcularIR5ta(remuneracionBruta);
  const neto = remuneracionBruta - totalDescuentos - retencionIR;
  const essalud = remuneracionBruta * 0.09;
  const cts = remuneracionBruta / 12;
  const gratificacion = remuneracionBruta / 6;
  const vacaciones = remuneracionBruta / 12;
  const totalCargas = essalud + cts + gratificacion + vacaciones;
  const costoReal = remuneracionBruta + totalCargas;
  const horasPeriodo = diasLaborables * horasEfectivas;
  return {
    trabajador_id: trabajador.id, trabajador, datosNomina, turno, periodo,
    dias_laborables: diasLaborables, dias_asistidos: asistencias,
    faltas_injustificadas: faltasInjustificadas, faltas_justificadas: faltasJustificadas,
    tardanzas, minutos_tardanza_total: minutosTardanza, horas_extra_total_min: horasExtraMin,
    sueldo_base: sueldoBase, valor_dia: valorDia, valor_hora: valorHora,
    desc_faltas: descFaltas, desc_tardanzas: descTardanzas, add_horas_extra: addHorasExtra,
    asignacion_familiar: asignacionFamiliar, remuneracion_bruta: remuneracionBruta,
    desc_pensiones: descPensiones, sistema_pensionario: sistema,
    desc_prestamo: descPrestamo, desc_anticipo: descAnticipo, desc_judicial: descJudicial,
    total_descuentos: totalDescuentos, retencion_ir: retencionIR, neto,
    essalud, cts_mensualizado: cts, gratificacion_mensualizada: gratificacion,
    vacaciones_mensualizadas: vacaciones, total_cargas: totalCargas,
    costo_real_empresa: costoReal, costo_hora_real: costoReal / horasPeriodo
  };
}

function TurnosHorarios() {
  const { turnos, setTurnos, empresa, addNotificacion, crearTurnoCtx } = useApp();
  const [panel, setPanel] = useState(false);
  const [form, setForm] = useState({
    nombre:'', hora_entrada:'08:00', hora_salida:'17:00', tolerancia_minutos:10,
    cruza_medianoche:false, dias_laborables:['lun','mar','mie','jue','vie'], dias_variables:false,
    refrigerio_minutos:60, descripcion:'', estado:'activo'
  });
  const codigo = `TUR-${String(turnos.length + 1).padStart(3, '0')}`;
  const horasCalc = horasEfectivasTurno(form.hora_entrada, form.hora_salida, form.cruza_medianoche, form.refrigerio_minutos);
  const diasMap = [
    ['lun','Lun'], ['mar','Mar'], ['mie','Mie'], ['jue','Jue'], ['vie','Vie'], ['sab','Sab'], ['dom','Dom']
  ];
  const toggleDia = (d) => setForm(prev => ({ ...prev, dias_laborables: prev.dias_laborables.includes(d) ? prev.dias_laborables.filter(x => x !== d) : [...prev.dias_laborables, d] }));
  const guardar = async (e) => {
    e.preventDefault();
    if (!form.dias_variables && form.dias_laborables.length === 0) return;
    const totalMin = timeToMinutesHHMM(form.hora_salida) + (form.cruza_medianoche ? 1440 : 0) - timeToMinutesHHMM(form.hora_entrada) - Number(form.refrigerio_minutos || 0);
    const turno = {
      id:`tur_${String(turnos.length + 1).padStart(3, '0')}`, empresa_id:empresa.id, codigo,
      ...form, tolerancia_minutos:Number(form.tolerancia_minutos) || 0,
      refrigerio_minutos:Number(form.refrigerio_minutos) || 0,
      horas_efectivas: Math.max(0, totalMin / 60)
    };
    try {
      await crearTurnoCtx(turno);
    } catch (_) {
      setTurnos(prev => [...prev, turno]);
    }
    addNotificacion(`Turno ${turno.codigo} creado.`);
    setPanel(false);
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Turnos y Horarios</h1><div className="page-sub">Configuracion de jornadas laborales</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setPanel(true)}>{I.plus} Nuevo turno</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Codigo</th><th>Nombre</th><th>Entrada</th><th>Salida</th><th>Horas/dia</th><th>Tolerancia</th><th>Dias</th><th>Estado</th></tr></thead>
            <tbody>{turnos.map(t => (
              <tr key={t.id}>
                <td className="mono">{t.codigo}</td>
                <td><strong>{t.nombre}</strong>{t.cruza_medianoche && <span className="badge badge-purple" style={{marginLeft:8}}>Cruza medianoche</span>}</td>
                <td>{t.hora_entrada}</td>
                <td>{t.hora_salida}</td>
                <td>{t.horas_efectivas}h</td>
                <td>{t.tolerancia_minutos} min</td>
                <td>{t.dias_variables ? 'Variable' : t.dias_laborables.join('-')}</td>
                <td><span className={'badge '+(t.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{t.estado}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {panel && <>
        <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
        <div className="side-panel" style={{width:'min(480px, 96vw)'}}>
          <div className="side-panel-head"><div><div className="eyebrow">Nuevo turno</div><div className="font-display" style={{fontSize:22, fontWeight:700}}>{codigo}</div></div><button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button></div>
          <form className="side-panel-body" onSubmit={guardar}>
            <div className="input-group"><label>Nombre *</label><input className="input" required value={form.nombre} onChange={e=>setForm(v=>({...v,nombre:e.target.value}))}/></div>
            <div className="grid-2" style={{gap:12}}>
              <div className="input-group"><label>Hora de entrada *</label><input className="input" type="time" required value={form.hora_entrada} onChange={e=>setForm(v=>({...v,hora_entrada:e.target.value}))}/></div>
              <div className="input-group"><label>Hora de salida *</label><input className="input" type="time" required value={form.hora_salida} onChange={e=>setForm(v=>({...v,hora_salida:e.target.value}))}/></div>
              <div className="input-group"><label>Tolerancia tardanza</label><input className="input" type="number" min="0" value={form.tolerancia_minutos} onChange={e=>setForm(v=>({...v,tolerancia_minutos:e.target.value}))}/></div>
              <div className="input-group"><label>Refrigerio minutos</label><input className="input" type="number" min="0" value={form.refrigerio_minutos} onChange={e=>setForm(v=>({...v,refrigerio_minutos:e.target.value}))}/></div>
            </div>
            <label className="row" style={{gap:8, marginTop:14}}><input type="checkbox" checked={form.cruza_medianoche} onChange={e=>setForm(v=>({...v,cruza_medianoche:e.target.checked}))}/> El turno cruza medianoche</label>
            <label className="row" style={{gap:8, marginTop:8}}><input type="checkbox" checked={form.dias_variables} onChange={e=>setForm(v=>({...v,dias_variables:e.target.checked}))}/> Dias variables</label>
            {!form.dias_variables && <div style={{display:'flex', gap:8, flexWrap:'wrap', margin:'14px 0'}}>
              {diasMap.map(([k,l]) => <button type="button" key={k} className={'btn btn-sm '+(form.dias_laborables.includes(k) ? 'btn-primary' : 'btn-secondary')} data-local-form="true" onClick={()=>toggleDia(k)}>{l}</button>)}
            </div>}
            <div className="card" style={{padding:12, margin:'14px 0'}}><strong>Horas laborables calculadas:</strong> {horasCalc} efectivas</div>
            <div className="input-group"><label>Descripcion / notas</label><textarea className="input" rows="3" value={form.descripcion} onChange={e=>setForm(v=>({...v,descripcion:e.target.value}))}/></div>
            <div className="input-group"><label>Estado</label><select className="select" value={form.estado} onChange={e=>setForm(v=>({...v,estado:e.target.value}))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
            <div className="row mt-6" style={{justifyContent:'flex-end'}}><button type="button" className="btn btn-secondary" onClick={()=>setPanel(false)}>Cancelar</button><button className="btn btn-primary" data-local-form="true" type="submit">Guardar turno</button></div>
          </form>
        </div>
      </>}
    </>
  );
}

function ControlAsistencia() {
  const { turnos, registrosAsistencia, setRegistrosAsistencia, personalAdmin, empresa, addNotificacion } = useApp();
  const [tab, setTab] = useState('diaria');
  const [fecha, setFecha] = useState('2026-04-24');
  const [panel, setPanel] = useState(false);
  const [masivo, setMasivo] = useState(false);
  const trabajadores = [
    ...PERSONAL_INICIAL_OPS.map(p => ({ ...p, area:'Operativo', remuneracion:3000 })),
    ...personalAdmin.map(p => ({ id:p.id, nombre:p.nombre, cargo:p.cargo, area:p.area || 'Administrativo', turno_id:p.turno_id || 'tur_005', remuneracion:p.remuneracion || 3000 }))
  ];
  const [form, setForm] = useState({ trabajador_id:trabajadores[0]?.id || '', fecha, asistio:'si', hora_entrada:'08:00', hora_salida:'17:00', justificada:false, motivo_falta:'', notas:'' });
  const trabajador = trabajadores.find(t => t.id === form.trabajador_id) || trabajadores[0];
  const turno = workerTurno(turnos, trabajador || {});
  const resultado = calcularResultadoAsistencia(form.hora_entrada, form.hora_salida, turno, form.asistio === 'no', form.justificada);
  const registrosPeriodo = registrosAsistencia.filter(r => r.fecha.startsWith('2026-04'));
  const diaRows = trabajadores.map(t => {
    const reg = registrosAsistencia.find(r => r.trabajador_id === t.id && r.fecha === fecha);
    const trn = workerTurno(turnos, t);
    const calc = reg ? calcularResultadoAsistencia(reg.hora_entrada, reg.hora_salida, trn, reg.es_falta, reg.justificada) : { estado:'falta', label:'Falta', horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0 };
    return { trabajador:t, turno:trn, registro:reg, calc };
  });
  const kpis = {
    total: trabajadores.length,
    completos: registrosPeriodo.filter(r => r.estado === 'completo' || r.estado === 'horas_extra').length,
    tardanzas: registrosPeriodo.filter(r => r.estado === 'tardanza').length,
    faltas: registrosPeriodo.filter(r => r.estado === 'falta' || r.estado === 'falta_justificada').length
  };
  const guardarRegistro = (e) => {
    e?.preventDefault?.();
    const nuevo = {
      id:`asis_${Date.now()}`, empresa_id:empresa.id, trabajador_id:form.trabajador_id, fecha:form.fecha,
      turno_id:turno.id, hora_entrada:form.asistio === 'no' ? null : form.hora_entrada,
      hora_salida:form.asistio === 'no' ? null : form.hora_salida,
      horas_trabajadas_min:resultado.horas_trabajadas_min, tardanza_min:resultado.tardanza_min,
      horas_extra_min:resultado.horas_extra_min, estado:resultado.estado, es_falta:form.asistio === 'no',
      justificada:form.justificada, motivo_falta:form.justificada ? form.motivo_falta : null, notas:form.notas
    };
    setRegistrosAsistencia(prev => [nuevo, ...prev.filter(r => !(r.trabajador_id === nuevo.trabajador_id && r.fecha === nuevo.fecha))]);
    addNotificacion('Registro de asistencia guardado.');
    setPanel(false);
  };
  const abrirEdicion = (row) => {
    const r = row.registro;
    setForm({
      trabajador_id:row.trabajador.id, fecha, asistio:r?.es_falta ? 'no' : 'si',
      hora_entrada:r?.hora_entrada || row.turno.hora_entrada || '08:00',
      hora_salida:r?.hora_salida || row.turno.hora_salida || '17:00',
      justificada:Boolean(r?.justificada), motivo_falta:r?.motivo_falta || '', notas:r?.notas || ''
    });
    setPanel(true);
  };
  const guardarMasivo = () => {
    const nuevos = trabajadores.map(t => {
      const trn = workerTurno(turnos, t);
      const calc = calcularResultadoAsistencia(trn.hora_entrada, trn.hora_salida, trn, false, false);
      return { id:`asis_${Date.now()}_${t.id}`, empresa_id:empresa.id, trabajador_id:t.id, fecha, turno_id:trn.id, hora_entrada:trn.hora_entrada, hora_salida:trn.hora_salida, horas_trabajadas_min:calc.horas_trabajadas_min, tardanza_min:0, horas_extra_min:calc.horas_extra_min, estado:calc.estado, es_falta:false, justificada:false, motivo_falta:null, notas:'Registro masivo' };
    });
    setRegistrosAsistencia(prev => [...nuevos, ...prev.filter(r => r.fecha !== fecha)]);
    addNotificacion('Registro masivo del dia guardado.');
    setMasivo(false);
  };
  const resumenTrabajador = trabajadores[0];
  const resumenRegs = registrosPeriodo.filter(r => r.trabajador_id === resumenTrabajador.id);
  const resumenTurno = workerTurno(turnos, resumenTrabajador);
  const semanalDias = ['2026-04-20','2026-04-21','2026-04-22','2026-04-23','2026-04-24','2026-04-25','2026-04-26'];

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Control de Asistencia</h1><div className="page-sub">Registro manual, tardanzas y horas trabajadas</div></div>
        <div className="row" style={{gap:10}}><button className="btn btn-secondary" onClick={() => setMasivo(true)}>Registro masivo</button><button className="btn btn-primary" data-local-form="true" onClick={() => setPanel(true)}>{I.plus} Registrar asistencia</button></div>
      </div>
      <div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">Total trabajadores</div><div className="kpi-value">{kpis.total}</div></div><div className="kpi-card"><div className="kpi-label">Dias completos</div><div className="kpi-value">{kpis.completos}</div></div><div className="kpi-card"><div className="kpi-label">Tardanzas</div><div className="kpi-value" style={{color:'var(--orange)'}}>{kpis.tardanzas}</div></div><div className="kpi-card"><div className="kpi-label">Faltas</div><div className="kpi-value" style={{color:'var(--danger)'}}>{kpis.faltas}</div></div></div>
      <div className="tabs">{[['diaria','Vista diaria'],['semanal','Vista semanal'],['mensual','Vista mensual'],['resumen','Resumen por trabajador']].map(([k,l])=><div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}</div>
      {tab === 'diaria' && <div className="card"><div className="card-head"><h3>Asistencia del dia</h3><input className="input" type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{width:160}}/></div><div className="table-wrap"><table className="tbl"><thead><tr><th>Trabajador</th><th>Area</th><th>Turno</th><th>H. Entrada</th><th>H. Salida</th><th>Horas trab.</th><th>Estado</th><th>Justif.</th><th>Acciones</th></tr></thead><tbody>{diaRows.map(row=><tr key={row.trabajador.id}><td><strong>{row.trabajador.nombre}</strong></td><td>{row.trabajador.area}</td><td>{row.turno.nombre} ({row.turno.hora_entrada}-{row.turno.hora_salida})</td><td>{row.registro?.hora_entrada || '-'}</td><td>{row.registro?.hora_salida || '-'}</td><td>{minutesToLabel(row.calc.horas_trabajadas_min)}</td><td><span className={'badge '+asistenciaBadge(row.calc.estado)}>{row.calc.label}</span></td><td>{row.registro?.justificada ? 'Si' : '-'}</td><td><button className="btn btn-sm btn-secondary" onClick={()=>abrirEdicion(row)}>Editar</button></td></tr>)}</tbody></table></div></div>}
      {tab === 'semanal' && <div className="card"><div className="card-head"><h3>Vista semanal</h3><span className="text-muted">Semana del 20 al 26 Abr 2026</span></div><div style={{overflowX:'auto'}}><table className="tbl" style={{minWidth:900}}><thead><tr><th>Trabajador</th>{semanalDias.map(d=><th key={d}>{d.slice(5)}</th>)}</tr></thead><tbody>{trabajadores.slice(0,8).map(t=><tr key={t.id}><td><strong>{t.nombre}</strong></td>{semanalDias.map(d=>{ const r=registrosAsistencia.find(x=>x.trabajador_id===t.id&&x.fecha===d); const trn=workerTurno(turnos,t); const calc=r?calcularResultadoAsistencia(r.hora_entrada,r.hora_salida,trn,r.es_falta,r.justificada):null; return <td key={d}>{calc?<span className={'badge '+asistenciaBadge(calc.estado)}>{calc.estado==='completo'?'OK':calc.estado==='tardanza'?'Tard.':calc.estado==='horas_extra'?'Extra':'Falta'}</span>:<span className="text-muted">-</span>}</td>})}</tr>)}</tbody></table></div><div style={{padding:16, fontSize:12}}><span className="badge badge-green">OK</span> <span className="badge badge-orange">Tardanza</span> <span className="badge badge-cyan">Horas extra</span> <span className="badge badge-red">Falta</span></div></div>}
      {tab === 'mensual' && <div className="card"><div className="card-head"><h3>Resumen mensual - Abril 2026</h3></div><div className="table-wrap"><table className="tbl"><thead><tr><th>Trabajador</th><th>Turno</th><th>Dias lab.</th><th>Asistencias</th><th>Tardanzas</th><th>Min. tardanza</th><th>Faltas</th><th>Faltas justif.</th><th>Horas extra</th><th>Horas totales</th></tr></thead><tbody>{trabajadores.slice(0,8).map(t=>{ const regs=registrosPeriodo.filter(r=>r.trabajador_id===t.id); return <tr key={t.id}><td><strong>{t.nombre}</strong></td><td>{workerTurno(turnos,t).nombre}</td><td>22</td><td>{regs.filter(r=>!r.es_falta).length}</td><td>{regs.filter(r=>r.estado==='tardanza').length}</td><td>{regs.reduce((s,r)=>s+(r.tardanza_min||0),0)} min</td><td>{regs.filter(r=>r.estado==='falta').length}</td><td>{regs.filter(r=>r.estado==='falta_justificada').length}</td><td>{minutesToLabel(regs.reduce((s,r)=>s+(r.horas_extra_min||0),0))}</td><td>{minutesToLabel(regs.reduce((s,r)=>s+(r.horas_trabajadas_min||0),0))}</td></tr>})}</tbody></table></div><div style={{padding:16}}><strong>Promedio de asistencia:</strong> 94.7% · <strong>Total tardanzas:</strong> {kpis.tardanzas} · <strong>Total horas extra:</strong> {minutesToLabel(registrosPeriodo.reduce((s,r)=>s+(r.horas_extra_min||0),0))}</div></div>}
      {tab === 'resumen' && <div className="card" style={{padding:20}}><div className="card-head"><h3>Resumen por trabajador</h3><button className="btn btn-secondary btn-sm">{I.download} Exportar Excel</button></div><div className="grid-2" style={{gap:20}}><div><p><strong>Trabajador:</strong> {resumenTrabajador.nombre}</p><p><strong>Turno asignado:</strong> {resumenTurno.nombre} ({resumenTurno.hora_entrada} - {resumenTurno.hora_salida})</p><p><strong>Dias laborables:</strong> 22 dias</p><p><strong>Dias asistidos:</strong> {resumenRegs.filter(r=>!r.es_falta).length}</p><p><strong>Dias con tardanza:</strong> {resumenRegs.filter(r=>r.estado==='tardanza').length}</p><p><strong>Minutos tardanza:</strong> {resumenRegs.reduce((s,r)=>s+(r.tardanza_min||0),0)} minutos</p></div><div><p><strong>Horas esperadas:</strong> 176h</p><p><strong>Horas efectivas:</strong> {minutesToLabel(resumenRegs.reduce((s,r)=>s+(r.horas_trabajadas_min||0),0))}</p><p><strong>Horas extra:</strong> {minutesToLabel(resumenRegs.reduce((s,r)=>s+(r.horas_extra_min||0),0))}</p><p><strong>Impacto nomina:</strong> descuento referencial por faltas y tardanzas.</p><p className="text-muted">Calculo referencial. Validar con el area de RRHH antes de procesar nomina.</p></div></div></div>}
      {panel && <><div className="side-panel-backdrop" onClick={()=>setPanel(false)}/><div className="side-panel" style={{width:'min(520px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Registrar asistencia</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{form.fecha}</div></div><button className="icon-btn" onClick={()=>setPanel(false)}>{I.x}</button></div><form className="side-panel-body" onSubmit={guardarRegistro}><div className="input-group"><label>Fecha</label><input className="input" type="date" value={form.fecha} onChange={e=>setForm(v=>({...v,fecha:e.target.value}))}/></div><div className="input-group"><label>Trabajador</label><select className="select" value={form.trabajador_id} onChange={e=>setForm(v=>({...v,trabajador_id:e.target.value}))}>{trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div><div className="card" style={{padding:12, margin:'12px 0'}}>Turno asignado: <strong>{turno.nombre}</strong> · {turno.hora_entrada} - {turno.hora_salida} · Tolerancia {turno.tolerancia_minutos} min</div><div className="input-group"><label>Asistio</label><select className="select" value={form.asistio} onChange={e=>setForm(v=>({...v,asistio:e.target.value}))}><option value="si">Si</option><option value="no">No - falta</option></select></div>{form.asistio==='si' ? <div className="grid-2" style={{gap:12}}><div className="input-group"><label>Hora entrada</label><input className="input" type="time" value={form.hora_entrada} onChange={e=>setForm(v=>({...v,hora_entrada:e.target.value}))}/></div><div className="input-group"><label>Hora salida</label><input className="input" type="time" value={form.hora_salida} onChange={e=>setForm(v=>({...v,hora_salida:e.target.value}))}/></div></div> : <><label className="row" style={{gap:8}}><input type="checkbox" checked={form.justificada} onChange={e=>setForm(v=>({...v,justificada:e.target.checked}))}/> Falta justificada</label>{form.justificada && <div className="input-group"><label>Motivo</label><select className="select" value={form.motivo_falta} onChange={e=>setForm(v=>({...v,motivo_falta:e.target.value}))}><option>Enfermedad con certificado</option><option>Permiso autorizado</option><option>Licencia</option><option>Otro</option></select></div>}</>}<div className="card" style={{padding:12, margin:'14px 0'}}><p><strong>Horas trabajadas:</strong> {minutesToLabel(resultado.horas_trabajadas_min)}</p><p><strong>Tardanza:</strong> {resultado.tardanza_min} min</p><p><strong>Horas extra:</strong> {minutesToLabel(resultado.horas_extra_min)}</p><p><strong>Estado:</strong> <span className={'badge '+asistenciaBadge(resultado.estado)}>{resultado.label}</span></p></div><div className="input-group"><label>Notas adicionales</label><textarea className="input" rows="3" value={form.notas} onChange={e=>setForm(v=>({...v,notas:e.target.value}))}/></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button type="button" className="btn btn-secondary" onClick={()=>setPanel(false)}>Cancelar</button><button className="btn btn-primary" data-local-form="true" type="submit">Guardar registro</button></div></form></div></>}
      {masivo && <><div className="side-panel-backdrop" onClick={()=>setMasivo(false)}/><div className="side-panel" style={{width:'min(760px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Registro masivo</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{fecha}</div></div><button className="icon-btn" onClick={()=>setMasivo(false)}>{I.x}</button></div><div className="side-panel-body"><div className="table-wrap"><table className="tbl"><thead><tr><th>Trabajador</th><th>Turno</th><th>Entrada</th><th>Salida</th><th>Falta</th><th>Justif.</th></tr></thead><tbody>{trabajadores.slice(0,8).map(t=>{const trn=workerTurno(turnos,t);return <tr key={t.id}><td><strong>{t.nombre}</strong></td><td>{trn.nombre}</td><td><input className="input" type="time" defaultValue={trn.hora_entrada}/></td><td><input className="input" type="time" defaultValue={trn.hora_salida}/></td><td><input type="checkbox"/></td><td><input type="checkbox"/></td></tr>})}</tbody></table></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setMasivo(false)}>Cancelar</button><button className="btn btn-primary" data-local-form="true" onClick={guardarMasivo}>Guardar todos los registros</button></div></div></div></>}
    </>
  );
}

function Nomina() {
  const {
    turnos, registrosAsistencia, personalAdmin, trabajadoresDatosNomina,
    periodosNomina, setPeriodosNomina, setComprasGastos, role, empresa, addNotificacion
  } = useApp();
  const canFinanzas = Boolean(role?.permisos?.ver_finanzas || role?.permisos?.todo);
  const [tab, setTab] = useState('resumen');
  const [periodoId, setPeriodoId] = useState('nom_2026_04');
  const [trabajadorSel, setTrabajadorSel] = useState('TEC-001');
  const [boleta, setBoleta] = useState(null);
  const [cierre, setCierre] = useState(false);
  const periodo = periodosNomina.find(p => p.id === periodoId) || periodosNomina[0];
  const periodoKey = `${periodo?.anio || 2026}-${String(periodo?.mes || 4).padStart(2, '0')}`;
  const trabajadores = [
    ...PERSONAL_INICIAL_OPS.map(p => ({ ...p, area:'Operativo', tipo:'operativo', remuneracion:trabajadoresDatosNomina[p.id]?.sueldo_base || 3000 })),
    ...personalAdmin.map(p => ({ id:p.id, nombre:p.nombre, cargo:p.cargo, area:p.area || 'Administrativo', turno_id:p.turno_id || 'tur_005', tipo:'admin', remuneracion:p.remuneracion || trabajadoresDatosNomina[p.id]?.sueldo_base || 3000 }))
  ];
  const calculos = trabajadores.map(t => {
    const turno = workerTurno(turnos, t);
    const datos = trabajadoresDatosNomina[t.id] || {};
    const regs = registrosAsistencia.filter(r => r.trabajador_id === t.id && r.fecha.startsWith(periodoKey));
    return calcularNominaTrabajador(t, datos, turno, regs, periodo);
  });
  const resumen = calculos.reduce((acc, c) => ({
    total_trabajadores: acc.total_trabajadores + 1,
    masa_salarial_bruta: acc.masa_salarial_bruta + c.remuneracion_bruta,
    total_neto: acc.total_neto + c.neto,
    total_cargas_empresa: acc.total_cargas_empresa + c.total_cargas,
    total_descuentos: acc.total_descuentos + c.total_descuentos,
    total_ir: acc.total_ir + c.retencion_ir,
    costo_laboral_total: acc.costo_laboral_total + c.costo_real_empresa
  }), { total_trabajadores:0, masa_salarial_bruta:0, total_neto:0, total_cargas_empresa:0, total_descuentos:0, total_ir:0, costo_laboral_total:0 });
  const detalle = calculos.find(c => c.trabajador_id === trabajadorSel) || calculos[0];
  const estadoClase = periodo?.estado === 'cerrado' ? 'badge-green' : periodo?.estado === 'calculado' ? 'badge-orange' : 'badge-cyan';
  const descargarBoletas = () => addNotificacion(`Generando ${calculos.length} boletas en PDF.`);
  const calcularNomina = () => {
    setPeriodosNomina(prev => prev.map(p => p.id === periodo.id ? {
      ...p, estado:'calculado', fecha_calculo:'2026-04-28',
      total_trabajadores:resumen.total_trabajadores,
      masa_salarial_bruta:resumen.masa_salarial_bruta,
      total_neto:resumen.total_neto,
      total_cargas_empresa:resumen.total_cargas_empresa
    } : p));
    addNotificacion(`Nomina ${periodo.periodo} calculada y lista para revision.`);
  };
  const cerrarPeriodo = () => {
    const fecha = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-${new Date(periodo.anio, periodo.mes, 0).getDate()}`;
    const egresoNomina = {
      id:`gasto_nom_${periodo.id}`, empresa_id:empresa.id, tipo:'gasto',
      descripcion:`Planilla ${periodo.periodo}`, categoria:'Gasto de personal',
      monto:resumen.total_neto, fecha, origen:'nomina', periodo_nomina:periodo.periodo, estado:'registrado'
    };
    const egresoCargas = {
      id:`gasto_cargas_${periodo.id}`, empresa_id:empresa.id, tipo:'gasto',
      descripcion:`Cargas sociales ${periodo.periodo}`, categoria:'Cargas laborales empresa',
      monto:resumen.total_cargas_empresa, fecha, origen:'nomina', periodo_nomina:periodo.periodo, estado:'registrado'
    };
    setComprasGastos(prev => [...prev.filter(g => g.id !== egresoNomina.id && g.id !== egresoCargas.id), egresoNomina, egresoCargas]);
    setPeriodosNomina(prev => prev.map(p => p.id === periodo.id ? { ...p, estado:'cerrado', fecha_cierre:'2026-04-30', usuario_cierre:role.nombre, total_trabajadores:resumen.total_trabajadores, masa_salarial_bruta:resumen.masa_salarial_bruta, total_neto:resumen.total_neto, total_cargas_empresa:resumen.total_cargas_empresa } : p));
    addNotificacion(`Nomina ${periodo.periodo} cerrada. Egresos registrados y boletas disponibles.`);
    setCierre(false);
  };

  if (!canFinanzas) {
    return (
      <div className="card" style={{padding:24}}>
        <div className="card-head"><h3>Nomina</h3></div>
        <p className="text-muted">Este modulo requiere permiso de finanzas para ver remuneraciones, descuentos y boletas.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nomina</h1>
          <div className="page-sub">Calculo de remuneraciones, boletas y cierre de periodo</div>
        </div>
        <div className="row" style={{gap:10}}>
          <select className="select" value={periodoId} onChange={e=>setPeriodoId(e.target.value)} style={{width:170}}>
            {periodosNomina.map(p => <option key={p.id} value={p.id}>{p.periodo}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={descargarBoletas}>{I.download} Boletas</button>
          <button className="btn btn-primary" data-local-form="true" onClick={calcularNomina}>Calcular nomina</button>
          <button className="btn btn-secondary" disabled={periodo?.estado !== 'calculado'} onClick={() => setCierre(true)}>Cerrar periodo</button>
        </div>
      </div>
      <div className="card" style={{padding:'12px 16px', marginBottom:16, borderLeft:'3px solid var(--orange)'}}>
        <strong>Los calculos son referenciales.</strong> TIDEO no reemplaza la asesoria de un especialista en legislacion laboral. Valida siempre con tu contador antes de procesar pagos.
      </div>
      <div className="row" style={{justifyContent:'space-between', marginBottom:16}}>
        <div className="row" style={{gap:8}}>
          <span>Estado del periodo:</span>
          <span className={'badge '+estadoClase}>{periodo?.estado || 'abierto'}</span>
        </div>
        <div className="text-muted">Periodo: {periodo?.periodo}</div>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Total trabajadores</div><div className="kpi-value">{resumen.total_trabajadores}</div></div>
        <div className="kpi-card"><div className="kpi-label">Masa salarial bruta</div><div className="kpi-value" style={{fontSize:22}}>{money(resumen.masa_salarial_bruta)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total neto a pagar</div><div className="kpi-value" style={{fontSize:22,color:'var(--green)'}}>{money(resumen.total_neto)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Cargas empresa</div><div className="kpi-value" style={{fontSize:22}}>{money(resumen.total_cargas_empresa)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Costo laboral total</div><div className="kpi-value" style={{fontSize:22}}>{money(resumen.costo_laboral_total)}</div></div>
      </div>
      <div className="tabs">
        {[
          ['resumen','Resumen del periodo'],
          ['detalle','Detalle por trabajador'],
          ['cargas','Cargas empresa'],
          ['historial','Historial']
        ].map(([k,l]) => <div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}
      </div>

      {tab === 'resumen' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Trabajador</th><th>Turno</th><th>Dias asist.</th><th>Faltas</th><th>Tard.</th><th>H. Extra</th><th>Sueldo base</th><th>Bruto</th><th>Descuentos</th><th>IR</th><th>Neto</th><th>Estado</th><th></th></tr></thead>
              <tbody>{calculos.map(c => (
                <tr key={c.trabajador_id}>
                  <td><strong>{c.trabajador.nombre}</strong><div className="text-muted" style={{fontSize:11}}>{c.trabajador.cargo}</div></td>
                  <td>{c.turno.nombre}</td>
                  <td>{c.dias_asistidos}/{c.dias_laborables}</td>
                  <td>{c.faltas_injustificadas}</td>
                  <td>{c.tardanzas} ({c.minutos_tardanza_total}m)</td>
                  <td>{minutesToLabel(c.horas_extra_total_min)}</td>
                  <td className="num">{money(c.sueldo_base)}</td>
                  <td className="num">{money(c.remuneracion_bruta)}</td>
                  <td className="num">{money(c.total_descuentos)}</td>
                  <td className="num">{money(c.retencion_ir)}</td>
                  <td className="num"><strong>{money(c.neto)}</strong></td>
                  <td><span className="badge badge-green">OK</span></td>
                  <td><button className="btn btn-sm btn-secondary" onClick={() => setBoleta(c)}>Ver boleta</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{padding:16, borderTop:'1px solid var(--border-subtle)'}}>
            <strong>Total neto a transferir:</strong> {money(resumen.total_neto)} · Descuentos: {money(resumen.total_descuentos)} · IR: {money(resumen.total_ir)}
          </div>
        </div>
      )}

      {tab === 'detalle' && detalle && (
        <div className="card" style={{padding:20}}>
          <div className="card-head">
            <h3>Detalle de nomina</h3>
            <select className="select" value={trabajadorSel} onChange={e=>setTrabajadorSel(e.target.value)} style={{width:260}}>
              {calculos.map(c => <option key={c.trabajador_id} value={c.trabajador_id}>{c.trabajador.nombre}</option>)}
            </select>
          </div>
          <div className="grid-2" style={{gap:24}}>
            <div>
              <p><strong>{detalle.trabajador.nombre}</strong> - {detalle.trabajador.id} - {periodo.periodo}</p>
              <p>Turno: {detalle.turno.nombre} · {detalle.turno.hora_entrada} - {detalle.turno.hora_salida} · {detalle.dias_laborables} dias laborables</p>
              <hr/>
              <p><strong>Asistencia</strong></p>
              <p>Dias asistidos: {detalle.dias_asistidos} de {detalle.dias_laborables}</p>
              <p>Faltas injustificadas: {detalle.faltas_injustificadas}</p>
              <p>Tardanzas: {detalle.tardanzas} veces · {detalle.minutos_tardanza_total} minutos</p>
              <p>Horas extra: {minutesToLabel(detalle.horas_extra_total_min)}</p>
              <hr/>
              <p><strong>Remuneracion bruta</strong></p>
              <p>(+) Sueldo base: {money(detalle.sueldo_base)}</p>
              <p>(-) Faltas: {money(detalle.desc_faltas)}</p>
              <p>(-) Tardanzas: {money(detalle.desc_tardanzas)}</p>
              <p>(+) Horas extra: {money(detalle.add_horas_extra)}</p>
              <p>(+) Asignacion familiar: {money(detalle.asignacion_familiar)}</p>
              <p><strong>Bruto: {money(detalle.remuneracion_bruta)}</strong></p>
            </div>
            <div>
              <p><strong>Descuentos del trabajador</strong></p>
              <p>{detalle.sistema_pensionario} ({detalle.sistema_pensionario === 'AFP' ? '13.24%' : '13%'}): {money(detalle.desc_pensiones)}</p>
              <p>Prestamo interno: {money(detalle.desc_prestamo)}</p>
              <p>Anticipo: {money(detalle.desc_anticipo)}</p>
              <p>Judicial: {money(detalle.desc_judicial)}</p>
              <p>IR 5ta categoria: {money(detalle.retencion_ir)}</p>
              <p><strong>Neto a pagar: {money(detalle.neto)}</strong></p>
              <hr/>
              <p><strong>Cargas empresa</strong></p>
              <p>ESSALUD: {money(detalle.essalud)}</p>
              <p>CTS mensualizada: {money(detalle.cts_mensualizado)}</p>
              <p>Gratificacion mensualizada: {money(detalle.gratificacion_mensualizada)}</p>
              <p>Vacaciones mensualizadas: {money(detalle.vacaciones_mensualizadas)}</p>
              <p><strong>Costo real empresa: {money(detalle.costo_real_empresa)}</strong></p>
              <p>Costo hora real: {money(detalle.costo_hora_real)}</p>
              <button className="btn btn-secondary" onClick={() => addNotificacion('Novedades aplicadas en el prototipo.')}>{I.edit} Editar novedades</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'cargas' && (
        <div className="card" style={{padding:20}}>
          <div className="card-head"><h3>Cargas a cargo de la empresa - {periodo.periodo}</h3></div>
          <div className="grid-2" style={{gap:16}}>
            <div className="card" style={{padding:16}}><strong>ESSALUD (9%)</strong><p className="text-muted">Pagar a SUNAT · Vencimiento 20/05/2026</p><div className="kpi-value" style={{fontSize:22}}>{money(calculos.reduce((s,c)=>s+c.essalud,0))}</div></div>
            <div className="card" style={{padding:16}}><strong>CTS mensualizada</strong><p className="text-muted">Deposito semestral: mayo y noviembre</p><div className="kpi-value" style={{fontSize:22}}>{money(calculos.reduce((s,c)=>s+c.cts_mensualizado,0))}</div></div>
            <div className="card" style={{padding:16}}><strong>Gratificaciones</strong><p className="text-muted">Provision julio y diciembre</p><div className="kpi-value" style={{fontSize:22}}>{money(calculos.reduce((s,c)=>s+c.gratificacion_mensualizada,0))}</div></div>
            <div className="card" style={{padding:16}}><strong>Vacaciones</strong><p className="text-muted">Provision mensual referencial</p><div className="kpi-value" style={{fontSize:22}}>{money(calculos.reduce((s,c)=>s+c.vacaciones_mensualizadas,0))}</div></div>
          </div>
          <div style={{marginTop:20}}><strong>Total cargas empresa:</strong> {money(resumen.total_cargas_empresa)} · <strong>Costo laboral total:</strong> {money(resumen.costo_laboral_total)}</div>
        </div>
      )}

      {tab === 'historial' && (
        <div className="card">
          <div className="table-wrap"><table className="tbl"><thead><tr><th>Periodo</th><th>Trabajadores</th><th>Masa salarial</th><th>Neto pagado</th><th>Cargas empresa</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{periodosNomina.map(p => <tr key={p.id}><td>{p.periodo}</td><td>{p.total_trabajadores}</td><td>{money(p.masa_salarial_bruta || 0)}</td><td>{money(p.total_neto || 0)}</td><td>{money(p.total_cargas_empresa || 0)}</td><td><span className={'badge '+(p.estado==='cerrado'?'badge-green':p.estado==='calculado'?'badge-orange':'badge-cyan')}>{p.estado}</span></td><td><button className="btn btn-sm btn-secondary" onClick={()=>setPeriodoId(p.id)}>Ver</button></td></tr>)}</tbody></table></div>
        </div>
      )}

      {boleta && <><div className="side-panel-backdrop" onClick={()=>setBoleta(null)}/><div className="side-panel" style={{width:'min(620px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Boleta de pago</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{boleta.trabajador.nombre}</div></div><button className="icon-btn" onClick={()=>setBoleta(null)}>{I.x}</button></div><div className="side-panel-body"><div className="card" style={{padding:20, border:'1px solid var(--border)'}}><h3 style={{textAlign:'center'}}>BOLETA DE PAGO</h3><p style={{textAlign:'center'}}><strong>{empresa.nombre}</strong><br/>RUC: 20100023491</p><hr/><p>Trabajador: <strong>{boleta.trabajador.nombre}</strong> · Cod: {boleta.trabajador.id}</p><p>Cargo: {boleta.trabajador.cargo} · Area: {boleta.trabajador.area}</p><p>Periodo: {periodo.periodo} · Dias laborados: {boleta.dias_asistidos} de {boleta.dias_laborables}</p><hr/><p><strong>Ingresos</strong></p><p>Sueldo basico: {money(boleta.sueldo_base)}</p><p>Asignacion familiar: {money(boleta.asignacion_familiar)}</p><p>Horas extra: {money(boleta.add_horas_extra)}</p><p><strong>Total ingresos: {money(boleta.sueldo_base + boleta.asignacion_familiar + boleta.add_horas_extra)}</strong></p><hr/><p><strong>Descuentos</strong></p><p>Faltas: -{money(boleta.desc_faltas)}</p><p>Tardanzas: -{money(boleta.desc_tardanzas)}</p><p>{boleta.sistema_pensionario} {boleta.datosNomina?.afp_nombre || ''}: -{money(boleta.desc_pensiones)}</p><p>Prestamo interno: -{money(boleta.desc_prestamo)}</p><p><strong>Total descuentos: -{money(boleta.total_descuentos + boleta.desc_faltas + boleta.desc_tardanzas)}</strong></p><hr/><p>Retencion IR 5ta categoria: {money(boleta.retencion_ir)}</p><h3>Neto a pagar: {money(boleta.neto)}</h3><p className="text-muted">Este documento es referencial. Generado por TIDEO ERP.</p></div><button className="btn btn-primary mt-6" data-local-form="true" onClick={()=>addNotificacion('Boleta PDF lista.')}>{I.download} Descargar boleta PDF</button></div></div></>}

      {cierre && <><div className="side-panel-backdrop" onClick={()=>setCierre(false)}/><div className="modal"><div className="modal-head"><h3>Cerrar nomina - {periodo.periodo}</h3><button className="icon-btn" onClick={()=>setCierre(false)}>{I.x}</button></div><div className="modal-body"><p>Al cerrar este periodo se registrara un egreso de planilla por {money(resumen.total_neto)} y otro de cargas sociales por {money(resumen.total_cargas_empresa)} en Compras y Gastos.</p><p>El periodo quedara cerrado y las boletas disponibles para descarga.</p><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setCierre(false)}>Cancelar</button><button className="btn btn-primary" onClick={cerrarPeriodo}>Confirmar cierre de nomina</button></div></div></div></>}
    </>
  );
}

function RRHH_Operativo() {
  const { turnos, role, personalOperativo, setPersonalOperativo, crearTecnicoCtx, empresa } = useApp();
  const canFinanzas = Boolean(role?.permisos?.ver_finanzas || role?.permisos?.todo);
  const [tab, setTab] = useState('personal');
  const personal = personalOperativo.length ? personalOperativo : PERSONAL_INICIAL_OPS;
  const [panelAlta, setPanelAlta] = useState(false);
  const formAltaBase = { nombre:'', dni:'', telefono:'', email:'', codigo:'', cargo:'', especialidad:'', especialidad2:'', supervisor:'', sede:'', turno_id:'tur_001', fecha_ingreso:'', costo:'', costo_extra:'', acceso_campo:false, perfil_campo:'Tecnico', estado:'disponible', sueldo_base:'', sistema_pensionario:'AFP', afp_nombre:'Integra', tiene_hijos:false, regimen_laboral:'general', cuota_prestamo_mes:'0', descuento_judicial:'0' };
  const [formAlta, setFormAlta] = useState(formAltaBase);

  const CARGOS_TEC = MOCK.cargosEmpresa.filter(c => c.tipo !== 'Administrativo' && c.estado === 'activo').map(c => c.nombre);

  const guardarTecnico = async (e) => {
    e.preventDefault();
    const idx = personal.length + 1;
    const nuevo = {
      id: `TEC-${String(idx).padStart(3,'0')}`,
      nombre: formAlta.nombre || 'Nuevo técnico',
      cargo: formAlta.cargo || 'Técnico de Campo',
      especialidad: formAlta.especialidad || 'General',
      sede: formAlta.sede || '',
      costo: Number(formAlta.costo) || 0,
      costo_hora_real: Number(formAlta.costo) || 0,
      sueldo_base: Number(formAlta.sueldo_base) || 0,
      sistema_pensionario: formAlta.sistema_pensionario,
      afp_nombre: formAlta.afp_nombre,
      tiene_hijos: formAlta.tiene_hijos,
      regimen_laboral: formAlta.regimen_laboral,
      cuota_prestamo_mes: Number(formAlta.cuota_prestamo_mes) || 0,
      descuento_judicial: Number(formAlta.descuento_judicial) || 0,
      estado: formAlta.estado || 'disponible',
      turno_id: formAlta.turno_id || 'tur_001',
      turno: turnos.find(t => t.id === formAlta.turno_id)?.nombre || 'Turno Mañana',
      docs: { sctr:'pendiente', medico:'pendiente', epp:'pendiente', licencia:'pendiente' }
    };
    try {
      await crearTecnicoCtx({ ...nuevo, empresa_id: empresa?.id });
    } catch (_) {
      setPersonalOperativo(prev => [...prev, nuevo]);
    }
    setFormAlta(formAltaBase);
    setPanelAlta(false);
  };

  const disponibles = personal.filter(p => p.estado === 'disponible').length;
  const docsAlerta  = personal.filter(p => Object.values(p.docs).some(d => d !== 'vigente' && d !== 'ok')).length;
  const costoTotal  = personal.filter(p => p.estado !== 'vacaciones').reduce((s,p) => s+p.costo, 0);

  const docBadge = d => d==='vigente'||d==='ok' ? 'badge-green' : d==='por_vencer'||d==='incompleto' ? 'badge-orange' : 'badge-red';
  const docLabel = d => d==='vigente'?'Vigente':d==='ok'?'OK':d==='por_vencer'?'Por vencer':d==='incompleto'?'Incompleto':'Vencido';
  const estBadge = e => e==='disponible'?'badge-green':e==='ocupado'?'badge-cyan':'badge-gray';

  const dias = ['Lun 28', 'Mar 29', 'Mié 30', 'Jue 1', 'Vie 2'];
  const asignaciones = {
    'Luis Mendoza': [null,'OT-0045','OT-0045',null,null],
    'Carlos Reyes': [null,null,'OT-0046','OT-0046',null],
    'Ana Torres':   ['Supervisión',null,null,'Supervisión',null],
    'Jorge Quispe': ['Vacaciones','Vacaciones','Vacaciones','Vacaciones','Vacaciones'],
    'Pedro Condori':[null,null,null,'OT-0048','OT-0048'],
    'Rosa Huanca':  ['OT-0047','OT-0047',null,null,null],
  };
  const asigColor = a => !a?null:a.startsWith('OT')?'var(--cyan)':a==='Vacaciones'?'var(--fg-subtle)':'var(--purple)';

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">RRHH Operativo</h1><div className="page-sub">{personal.length} técnicos · Semana 28 Abr – 2 May 2026</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setPanelAlta(true)}>{I.plus} Nuevo técnico</button>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Total personal</div><div className="kpi-value">{personal.length}</div><div className="kpi-icon cyan">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Disponibles hoy</div><div className="kpi-value" style={{color:'var(--green)'}}>{disponibles}</div><div className="kpi-icon green">{I.check}</div></div>
        <div className="kpi-card"><div className="kpi-label">Docs con alerta</div><div className="kpi-value" style={{color:docsAlerta>0?'var(--orange)':'inherit'}}>{docsAlerta}</div><div className={'kpi-icon '+(docsAlerta>0?'orange':'green')}>{I.shield}</div></div>
        <div className="kpi-card"><div className="kpi-label">Costo/hora campo</div><div className="kpi-value" style={{fontSize:20}}>{money(costoTotal)}</div><div className="kpi-icon purple">{I.dollar}</div></div>
      </div>

      <div className="tabs">
        <div className={'tab '+(tab==='personal'?'active':'')} onClick={()=>setTab('personal')}>Personal</div>
        <div className={'tab '+(tab==='disponibilidad'?'active':'')} onClick={()=>setTab('disponibilidad')}>Disponibilidad</div>
        <div className={'tab '+(tab==='documentos'?'active':'')} onClick={()=>setTab('documentos')}>Documentos</div>
      </div>

      {tab === 'personal' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>ID</th><th>Nombre</th><th>Cargo</th><th>Especialidad</th><th>Sede base</th><th>Costo/Hora</th><th>Turno</th><th>Estado</th></tr></thead>
              <tbody>
                {personal.map(p => (
                  <tr key={p.id} className="hover-row">
                    <td className="mono text-muted">{p.id}</td>
                    <td>
                      <div className="row">
                        <div className="avatar" style={{width:28,height:28,fontSize:10}}>{p.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>
                        <strong>{p.nombre}</strong>
                      </div>
                    </td>
                    <td>{p.cargo}</td>
                    <td className="text-muted">{p.especialidad}</td>
                    <td>{p.sede ? <span className="badge badge-gray" style={{fontSize:11}}>{p.sede}</span> : <span className="text-subtle">—</span>}</td>
                    <td className="num">{money(p.costo)}/hr</td>
                    <td><span className="mono" style={{fontSize:12}}>{workerTurno(turnos, p).nombre}</span></td>
                    <td><span className={'badge '+estBadge(p.estado)}>{p.estado.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'disponibilidad' && (
        <div className="card">
          <div className="card-head"><h3>Asignaciones — Semana 28 Abr – 2 May</h3><span className="text-muted" style={{fontSize:12}}>{personal.filter(p=>p.estado==='disponible').length} disponibles hoy</span></div>
          <div style={{overflowX:'auto'}}>
            <table className="tbl" style={{minWidth:700}}>
              <thead>
                <tr>
                  <th style={{width:180}}>Técnico</th>
                  {dias.map(d=><th key={d} style={{textAlign:'center', minWidth:90}}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {personal.map(p => (
                  <tr key={p.id}>
                    <td style={{fontWeight:600}}>{p.nombre}</td>
                    {dias.map((d,i) => {
                      const a = asignaciones[p.nombre]?.[i] ?? null;
                      const color = asigColor(a);
                      return (
                        <td key={d} style={{padding:4, textAlign:'center'}}>
                          {a ? (
                            <div style={{background:color, color:'white', fontSize:11, padding:'4px 6px', borderRadius:4, fontWeight:600}}>{a}</div>
                          ) : (
                            <div style={{height:24, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--green)', fontSize:12}}>libre</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:'12px 20px', borderTop:'1px solid var(--border-subtle)', display:'flex', gap:20, fontSize:12}}>
            <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:12,height:12,borderRadius:2,background:'var(--cyan)',display:'inline-block'}}/> OT asignada</span>
            <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:12,height:12,borderRadius:2,background:'var(--purple)',display:'inline-block'}}/> Supervisión</span>
            <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:12,height:12,borderRadius:2,background:'var(--fg-subtle)',display:'inline-block'}}/> Vacaciones</span>
            <span style={{display:'flex',gap:6,alignItems:'center', color:'var(--green)'}}><strong>libre</strong> = Disponible para asignar</span>
          </div>
        </div>
      )}

      {tab === 'documentos' && (
        <div className="card">
          <div className="card-head"><h3>Estado documentario — Habilitaciones técnicas</h3>{docsAlerta>0&&<span className="badge badge-orange">{docsAlerta} con alertas</span>}</div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Técnico</th><th style={{textAlign:'center'}}>SCTR</th><th style={{textAlign:'center'}}>Médico</th><th style={{textAlign:'center'}}>EPP</th><th style={{textAlign:'center'}}>Licencia</th><th>Estado global</th></tr></thead>
              <tbody>
                {personal.map(p => {
                  const vals = Object.values(p.docs);
                  const global = vals.some(d=>d==='vencido')?'Vencido':vals.some(d=>d==='por_vencer'||d==='incompleto')?'Revisión':'OK';
                  return (
                    <tr key={p.id} className="hover-row">
                      <td style={{fontWeight:600}}>{p.nombre}<div className="text-muted" style={{fontSize:11}}>{p.cargo}</div></td>
                      {Object.values(p.docs).map((d,i) => (
                        <td key={i} style={{textAlign:'center'}}><span className={'badge '+docBadge(d)} style={{fontSize:11}}>{docLabel(d)}</span></td>
                      ))}
                      <td><span className={'badge '+(global==='OK'?'badge-green':global==='Revisión'?'badge-orange':'badge-red')}>{global}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {panelAlta && <>
        <div className="side-panel-backdrop" onClick={() => setPanelAlta(false)}/>
        <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Alta de personal</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>Nuevo técnico operativo</div>
            </div>
            <button className="icon-btn" onClick={() => setPanelAlta(false)}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardarTecnico}>
            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos personales</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Nombre completo *</label><input className="input" required value={formAlta.nombre} onChange={e=>setFormAlta(v=>({...v,nombre:e.target.value}))} placeholder="Nombre completo" autoFocus/></div>
              <div className="input-group"><label>DNI / Documento *</label><input className="input" required value={formAlta.dni} onChange={e=>setFormAlta(v=>({...v,dni:e.target.value}))} placeholder="12345678"/></div>
              <div className="input-group"><label>Teléfono celular</label><input className="input" value={formAlta.telefono} onChange={e=>setFormAlta(v=>({...v,telefono:e.target.value}))} placeholder="+51 9..."/></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Email</label><input className="input" type="email" value={formAlta.email} onChange={e=>setFormAlta(v=>({...v,email:e.target.value}))} placeholder="tecnico@empresa.pe"/></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos laborales</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Código de empleado *</label><input className="input" value={formAlta.codigo} onChange={e=>setFormAlta(v=>({...v,codigo:e.target.value}))} placeholder={`TEC-00${personal.length+1}`}/></div>
              <div className="input-group"><label>Turno asignado</label><select className="select" value={formAlta.turno_id} onChange={e=>setFormAlta(v=>({...v,turno_id:e.target.value}))}>{turnos.map(t=><option key={t.id} value={t.id}>{t.nombre} ({t.hora_entrada} - {t.hora_salida})</option>)}</select></div>
              <div className="input-group"><label>Cargo</label><select className="select" value={formAlta.cargo} onChange={e=>setFormAlta(v=>({...v,cargo:e.target.value}))}><option value="">Seleccionar cargo...</option>{CARGOS_TEC.map(c=><option key={c}>{c}</option>)}</select></div>
              <div className="input-group"><label>Especialidad principal</label><select className="select" value={formAlta.especialidad} onChange={e=>setFormAlta(v=>({...v,especialidad:e.target.value}))}><option value="">Seleccionar...</option>{MOCK.especialidadesTecnicas.map(e=><option key={e.id} value={e.nombre}>{e.nombre}</option>)}</select></div>
              <div className="input-group"><label>Especialidad secundaria <span className="text-muted">(opcional)</span></label><select className="select" value={formAlta.especialidad2} onChange={e=>setFormAlta(v=>({...v,especialidad2:e.target.value}))}><option value="">Ninguna</option>{MOCK.especialidadesTecnicas.map(e=><option key={e.id} value={e.nombre}>{e.nombre}</option>)}</select></div>
              <div className="input-group"><label>Sede base</label><select className="select" value={formAlta.sede} onChange={e=>setFormAlta(v=>({...v,sede:e.target.value}))}><option value="">Sin sede asignada</option>{[{nombre:'Planta Norte',dir:'Av. Industrial 1450, Ate Vitarte'},{nombre:'Sede Sur',dir:'Jr. Los Incas 320, Villa El Salvador'}].map(s=><option key={s.nombre} value={s.nombre}>{s.nombre} — {s.dir}</option>)}</select></div>
              <div className="input-group"><label>Supervisor directo</label><select className="select" value={formAlta.supervisor} onChange={e=>setFormAlta(v=>({...v,supervisor:e.target.value}))}><option value="">Seleccionar...</option>{personal.filter(p=>p.cargo.includes('Supervis')).map(p=><option key={p.id}>{p.nombre}</option>)}</select></div>
              <div className="input-group"><label>Fecha de ingreso</label><input className="input" type="date" value={formAlta.fecha_ingreso} onChange={e=>setFormAlta(v=>({...v,fecha_ingreso:e.target.value}))}/></div>
              <div className="input-group"><label>Estado inicial</label><select className="select" value={formAlta.estado} onChange={e=>setFormAlta(v=>({...v,estado:e.target.value}))}><option value="disponible">Disponible</option><option value="inactivo">Inactivo</option></select></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Costos</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Costo hora normal (S/)</label><input className="input" type="number" min="0" value={formAlta.costo} onChange={e=>setFormAlta(v=>({...v,costo:e.target.value, costo_extra:String(Math.round(Number(e.target.value)*1.5))}))} placeholder="0"/></div>
              <div className="input-group"><label>Costo hora extra (S/)</label><input className="input" type="number" min="0" value={formAlta.costo_extra} onChange={e=>setFormAlta(v=>({...v,costo_extra:e.target.value}))} placeholder="0"/></div>
            </div>

            {canFinanzas && <>
              <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos de nomina</div>
              <div className="grid-2" style={{gap:14, marginBottom:20}}>
                <div className="input-group"><label>Sueldo base</label><input className="input" type="number" min="0" value={formAlta.sueldo_base} onChange={e=>setFormAlta(v=>({...v,sueldo_base:e.target.value}))} placeholder="3000"/></div>
                <div className="input-group"><label>Sistema pensionario</label><select className="select" value={formAlta.sistema_pensionario} onChange={e=>setFormAlta(v=>({...v,sistema_pensionario:e.target.value, afp_nombre:e.target.value === 'ONP' ? 'ONP' : v.afp_nombre}))}><option value="AFP">AFP</option><option value="ONP">ONP</option></select></div>
                <div className="input-group"><label>AFP / Entidad</label><select className="select" value={formAlta.afp_nombre} onChange={e=>setFormAlta(v=>({...v,afp_nombre:e.target.value}))}><option>Integra</option><option>Prima</option><option>Habitat</option><option>Profuturo</option><option>ONP</option></select></div>
                <div className="input-group"><label>Regimen laboral</label><select className="select" value={formAlta.regimen_laboral} onChange={e=>setFormAlta(v=>({...v,regimen_laboral:e.target.value}))}><option value="general">General</option><option value="mype">MYPE</option><option value="cas">CAS</option><option value="otro">Otro</option></select></div>
                <label className="row" style={{gap:8, alignItems:'center'}}><input type="checkbox" checked={formAlta.tiene_hijos} onChange={e=>setFormAlta(v=>({...v,tiene_hijos:e.target.checked}))}/> Tiene hijos para asignacion familiar</label>
                <div className="input-group"><label>Cuota prestamo mes</label><input className="input" type="number" min="0" value={formAlta.cuota_prestamo_mes} onChange={e=>setFormAlta(v=>({...v,cuota_prestamo_mes:e.target.value}))}/></div>
                <div className="input-group"><label>Descuento judicial</label><input className="input" type="number" min="0" value={formAlta.descuento_judicial} onChange={e=>setFormAlta(v=>({...v,descuento_judicial:e.target.value}))}/></div>
              </div>
            </>}

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Acceso a campo móvil</div>
            <div className="grid-2" style={{gap:14, marginBottom:24}}>
              <div className="input-group"><label>Acceso a app de campo</label><select className="select" value={formAlta.acceso_campo?'si':'no'} onChange={e=>setFormAlta(v=>({...v,acceso_campo:e.target.value==='si'}))}><option value="no">No</option><option value="si">Sí</option></select></div>
              {formAlta.acceso_campo && <div className="input-group"><label>Perfil de campo</label><select className="select" value={formAlta.perfil_campo} onChange={e=>setFormAlta(v=>({...v,perfil_campo:e.target.value}))}><option>Tecnico</option><option>Supervisor</option><option>Compras</option></select></div>}
              {formAlta.acceso_campo && <div style={{gridColumn:'1/-1', fontSize:12, color:'var(--cyan)', padding:'8px 12px', background:'rgba(6,182,212,0.08)', borderRadius:8}}>Al activar esto, el técnico podrá ver sus OTs asignadas y registrar partes diarios desde su celular.</div>}
            </div>

            <div className="row" style={{justifyContent:'flex-end', gap:10}}>
              <button type="button" className="btn btn-secondary" onClick={() => setPanelAlta(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{I.save} Guardar técnico</button>
            </div>
          </form>
        </div>
      </>}
    </>
  );
}

export { Cuentas, OT, Partes, Compras, Proveedores, CotizacionesCompras, OrdenesCompra, OrdenesServicio, Recepciones, TurnosHorarios, ControlAsistencia, Nomina, Backlog, Cierre, Remision, SOLPE, Planner, Tickets, RRHH_Operativo };

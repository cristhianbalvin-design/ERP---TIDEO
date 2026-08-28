import { useEffect, useState as useS3 } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA as MOCK } from '../data.js';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';

const generarIdParte = () => `pd_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.floor(Math.random() * 1000000)}`}`;

const IndicadorPendienteConexion = () => (
  <span className="badge orange" style={{ marginLeft: 8, fontSize: 10 }}>Pendiente de conexión real</span>
);

const MicField = ({ defaultValue = "", placeholder, value, onChange }) => {
  const [rec, setRec] = useS3(false);
  const [val, setVal] = useS3(value ?? defaultValue);
  useEffect(() => {
    if (value !== undefined) setVal(value);
  }, [value]);
  return (
    <div className={"mic-field-wrap " + (rec ? "recording" : "")}>
      <textarea value={val} onChange={e => { setVal(e.target.value); onChange?.(e.target.value); }} placeholder={placeholder}/>
      {rec && <span className="rec-dot"/>}
      <button className={"mic-btn " + (rec ? "rec" : "")} onClick={() => setRec(!rec)} title="Dictar por voz">
        <Icon name="mic" size={18}/>
      </button>
    </div>
  );
};

const Accordion = ({ title, icon, defaultOpen = false, children, badge }) => {
  const [open, setOpen] = useS3(defaultOpen);
  return (
    <div className={"accordion " + (open ? "open" : "")}>
      <button className="accordion-head" onClick={() => setOpen(!open)}>
        {icon && <Icon name={icon} size={14}/>}
        <span>{title}</span>
        {badge}
        <Icon name="chev" size={14} />
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
};

const BacklogModal = ({ onClose }) => {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000, display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ width: "100%", maxWidth: 400, animation: "fadeInUp 0.2s ease-out" }}>
        <div className="card-header" style={{ background: "var(--navy)", color: "white", borderRadius: "8px 8px 0 0" }}>
          <h3>Reportar hallazgo (Backlog)</h3>
          <div className="spacer"/>
          <button className="icon-btn" onClick={onClose} style={{ color: "white" }}><Icon name="x" size={16}/></button>
        </div>
        <div className="card-body">
          <div className="field"><label>Sistema afectado *</label>
            <select className="select"><option>Motor</option><option>Hidráulico</option><option>Eléctrico</option><option>Percusión</option><option>Estructura</option></select>
          </div>
          <div className="field mt-md"><label>Descripción del hallazgo *</label>
            <MicField placeholder="Dicta o escribe el problema detectado..."/>
          </div>
          <div className="field mt-md"><label>Prioridad sugerida</label>
            <select className="select"><option>Normal</option><option>Urgente</option><option>Emergencia</option></select>
          </div>
          <div className="field mt-md">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox"/> Requiere repuestos
            </label>
          </div>
          <div className="field mt-sm">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox"/> Requiere parada del equipo
            </label>
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>Guardar en Backlog</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Reporte diario de mina ----------
export const ReporteMinaPage = ({ onNav }) => {
  const [turno, setTurno] = useS3("DIA");
  const [equipo, setEquipo] = useS3("JB-DD311");
  const [tipoMant, setTipoMant] = useS3({ prg: false, prv: true, ctvo: true, acc: false });
  const [estado, setEstado] = useS3('operativo');
  const [motivoRetorno, setMotivoRetorno] = useS3('');
  const [repuestos, setRepuestos] = useS3([{ cod: "REP-4412-HYD", desc: "Filtro hidráulico EPIROC", sis: "Hidráulico", cant: 1 }]);
  const [pedidos, setPedidos] = useS3([
    { cant: 1, cod: "REP-KIT-DRV", desc: "Kit de drives", sis: "Mecánico", urg: true },
    { cant: 1, cod: "INS-LCK-001", desc: "Lock tite", sis: "Consumibles", urg: true },
  ]);

  const [formReporte, setFormReporte] = useS3({
    equipo_id: 'JB-DD311',
    contrato_id: 'CT-2026-003',
    centro_costo: 'FLO-ALQ',
    cliente: 'Minsur S.A.',
    fecha: '2026-04-20',
    turno: 'DÍA',
    tecnico: 'Miranda Barra, Sandro',
    avance_ot_pct: 0
  });

  const getContratoActivoDeEquipo = (equipoId) => {
    return MOCK.contratos?.find(
      c => c.equiposScope?.includes(equipoId)
        && ['Activo', 'vigente', 'por_vencer'].includes(c.estado)
    ) || null;
  };

  const handleEquipoChange = (equipoId) => {
    const contrato = getContratoActivoDeEquipo(equipoId);
    setFormReporte(prev => ({
      ...prev,
      equipo_id:    equipoId,
      contrato_id:  contrato?.id || null,
      centro_costo: contrato?.centro_costo || 'OPS-INT',
      cliente:      contrato?.cliente || null,
    }));
  };

  const calcularCostoMO = (form) => {
    // Cálculo simplificado de M.O. basado en mock de técnicos
    return 53.65;
  };

  const [mostrarConfirmacion, setMostrarConfirmacion] = useS3(false);
  const [reportesMinaList, setReportesMinaList] = useS3(MOCK.historialMina || []);

  const handleEnviarClick = () => {
    const errores = [];
    if (!formReporte.equipo_id)    errores.push('Selecciona el equipo');
    if (!formReporte.fecha)        errores.push('Ingresa la fecha');
    if (!formReporte.tecnico)      errores.push('Ingresa el técnico');
    if (!formReporte.avance_ot_pct && formReporte.avance_ot_pct !== 0)
      errores.push('Registra el avance de la OT');

    if (errores.length > 0) {
      alert(errores.join('\n'));
      return;
    }
    setMostrarConfirmacion(true);
  };

  const handleConfirmarEnvio = () => {
    const nuevoReporte = {
      ...formReporte,
      id: `PM-2026-${String(Date.now()).slice(-3)}`,
      estado: 'pendiente',
      origen_registro: 'campo',
      costo_mo: calcularCostoMO(formReporte),
      costo_repuestos: 0,
      costo_total: calcularCostoMO(formReporte),
    };
    setReportesMinaList(prev => [nuevoReporte, ...prev]);
    // Simular guardado
    onNav("partes-mina");
  };

  const [showBacklogModal, setShowBacklogModal] = useS3(false);

  const toggleTipo = (k) => setTipoMant({ ...tipoMant, [k]: !tipoMant[k] });

  // HT calc mock
  const htTurno = 2.10;
  const dmTurno = 98.5;

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => onNav("partes-mina")}><Icon name="back" size={14}/> Volver</button>
        <div>
          <h1>Nuevo reporte de mina</h1>
          <div className="sub">Parte diario · uso en campo</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) 1fr", gap: 20, alignItems: "start" }}>
        <div className="phone-wrap">
          <div className="phone-header">
            <Icon name="mine" size={16}/>
            <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 13 }}>Reporte de mina</div>
            <Icon name="x" size={16}/>
          </div>
          <div className="phone-body">

            {/* Cabecera */}
            <div className="card" style={{ padding: 14, marginBottom: 14 }}>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Equipo *</label>
                <select className="select input-lg" value={formReporte.equipo_id} onChange={e => handleEquipoChange(e.target.value)}>
                  <option value="JB-DD311">JB-DD311</option>
                  <option value="JB-24">JB-24</option>
                  <option value="JB-26">JB-26</option>
                  <option value="SC-701">SC-701</option>
                </select>
                {formReporte.equipo_id && (
                  <div style={{
                    marginTop:'8px', padding:'10px 12px',
                    background:'rgba(245,158,11,0.06)',
                    borderRadius:'8px',
                    border:'1px solid rgba(245,158,11,0.15)'
                  }}>
                    {formReporte.contrato_id ? (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'8px',
                                    alignItems:'center' }}>
                        <span style={{
                          background:'rgba(245,158,11,0.12)', color:'#f59e0b',
                          fontSize:'10px', fontFamily:'monospace',
                          padding:'2px 8px', borderRadius:'6px', fontWeight:700
                        }}>
                          {formReporte.centro_costo}
                        </span>
                        <span style={{ fontSize:'11px', color:'#60a5fa',
                                       fontFamily:'monospace' }}>
                          {formReporte.contrato_id}
                        </span>
                        <span style={{ fontSize:'11px', color:'#94a3b8' }}>
                          · {formReporte.cliente}
                        </span>
                      </div>
                    ) : (
                      <div style={{ fontSize:'11px', color:'#f59e0b' }}>
                        ⚠ Este equipo no tiene contrato activo —
                        el parte se registrará como trabajo interno (OPS-INT)
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Fecha *</label>
                <input className="input input-lg" type="date" value={formReporte.fecha} onChange={e => setFormReporte({...formReporte, fecha: e.target.value})}/>
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Turno *</label>
                <div className="toggle-pills">
                  <button className={"toggle-pill " + (formReporte.turno === "DÍA" ? "active" : "")} onClick={() => setFormReporte({...formReporte, turno: "DÍA"})}>☀️ DÍA</button>
                  <button className={"toggle-pill " + (formReporte.turno === "NOCHE" ? "active" : "")} onClick={() => setFormReporte({...formReporte, turno: "NOCHE"})}>🌙 NOCHE</button>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Técnico</label>
                <input className="input input-lg" defaultValue="Miranda Barra, Sandro" readOnly style={{ background: "#F5F7FB" }}/>
              </div>
              <div className="field">
                <label>Supervisor del cliente</label>
                <input className="input input-lg" placeholder="Nombre del supervisor"/>
              </div>
            </div>

            <Accordion title="Horómetros" icon="rates" defaultOpen={true}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="field"><label>H.Motor Inicial</label><input className="input input-lg" defaultValue="3588.30"/></div>
                <div className="field"><label>H.Motor Final</label><input className="input input-lg" defaultValue="3590.40"/></div>
                <div className="field"><label>H.Percusión Ini</label><input className="input input-lg" defaultValue="2099.70"/></div>
                <div className="field"><label>H.Percusión Fin</label><input className="input input-lg" defaultValue="2101.40"/></div>
                <div className="field"><label>H.Eléctrico Ini</label><input className="input input-lg" defaultValue="3908.10"/></div>
                <div className="field"><label>H.Eléctrico Fin</label><input className="input input-lg" defaultValue="3910.20"/></div>
              </div>
              <div style={{ marginTop: 12, padding: 12, background: dmTurno >= 97.92 ? "var(--green-soft)" : "var(--orange-soft)", border: "1px solid " + (dmTurno >= 97.92 ? "#CDE7CE" : "#FFD9A8"), borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <Icon name="check" size={18} stroke={3}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>Resultado</div>
                  <div><b>Horas trabajadas:</b> <span className="mono">{htTurno.toFixed(2)} hrs</span> · <b>D.M.:</b> <span className="mono">{dmTurno.toFixed(1)}%</span> ✓</div>
                </div>
              </div>
            </Accordion>

            <Accordion title="Horas del turno" icon="rates">
              <div className="grid-2" style={{ gap: 10 }}>
                <div className="field"><label>Horas trabajadas equipo</label><input className="input" defaultValue="2.10"/></div>
                <div className="field"><label>Mantto. prev. programado</label><input className="input" defaultValue="0.00"/></div>
                <div className="field"><label>Mantto. preventivo</label><input className="input" defaultValue="0.25"/></div>
                <div className="field"><label>Reparación acc./otro</label><input className="input" defaultValue="0.00"/></div>
                <div className="field"><label>Reparación correctiva</label><input className="input" defaultValue="0.00"/></div>
                <div className="field"><label>Stand-by</label><input className="input" defaultValue="9.65"/></div>
              </div>
              <div style={{ marginTop: 12, padding: 10, background: "#F5F7FB", borderRadius: 6, fontSize: 13 }}>Total: <b className="mono">12.00 hrs</b></div>
            </Accordion>

            <Accordion title="Tipo de mantenimiento" icon="cog" defaultOpen={true}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { k: "prg", l: "Prev. programado" },
                  { k: "prv", l: "Preventivo" },
                  { k: "ctvo", l: "Correctivo" },
                  { k: "acc", l: "Accidente" },
                ].map(t => (
                  <button key={t.k}
                    onClick={() => toggleTipo(t.k)}
                    style={{
                      height: 48, border: "1.5px solid " + (tipoMant[t.k] ? "var(--navy)" : "var(--card-border)"),
                      background: tipoMant[t.k] ? "#F5F7FB" : "white",
                      borderRadius: 8, fontSize: 12, fontWeight: 600,
                      color: tipoMant[t.k] ? "var(--navy)" : "var(--text-muted)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                    <span style={{ width: 18, height: 18, border: "1.5px solid " + (tipoMant[t.k] ? "var(--navy)" : "var(--slate-2)"), borderRadius: 4, display: "grid", placeItems: "center", background: tipoMant[t.k] ? "var(--navy)" : "white", color: "white" }}>
                      {tipoMant[t.k] && <Icon name="check" size={12} stroke={3}/>}
                    </span>
                    {t.l}
                  </button>
                ))}
              </div>
            </Accordion>

            <Accordion title="Estado final del equipo" icon="equipment" defaultOpen={true}>
              <div className="status-cards">
                <button className={'status-card ' + (estado === 'operativo' ? 'active green' : '')} onClick={() => setEstado('operativo')}>
                  <span className="big">🟢</span>Operativo
                </button>
                <button className={'status-card ' + (estado === 'espera' ? 'active orange' : '')} onClick={() => setEstado('espera')}>
                  <span className="big">🟡</span>En espera
                </button>
                <button className={'status-card ' + (estado === 'inop' ? 'active red' : '')} onClick={() => setEstado('inop')}>
                  <span className="big">🔴</span>Inoperativo
                </button>
                <button className={'status-card ' + (estado === 'retorno' ? 'active red' : '')} onClick={() => setEstado('retorno')}
                  style={{ borderColor: estado === 'retorno' ? '#1565C0' : '', background: estado === 'retorno' ? '#E3F2FD' : '' }}>
                  <span className="big">🔵</span>Retorno a taller
                </button>
              </div>
              {estado === 'retorno' && (
                <div style={{ marginTop: 10, padding: 12, background: '#E3F2FD', border: '1px solid #1565C0', borderRadius: 6 }}>
                  <div style={{ fontWeight: 700, color: '#0D47A1', fontSize: 12, marginBottom: 6 }}>🔵 Retorno a taller requerido</div>
                  <div style={{ fontSize: 11, color: '#1565C0', marginBottom: 8 }}>Se generará una alerta al Planner para coordinar logística Lima ↔ mina. Indica el motivo:</div>
                  <textarea
                    className="input"
                    rows={2}
                    style={{ fontSize: 12, resize: 'none' }}
                    placeholder="Describe la causa del retorno (falla, programación, etc.)..."
                    value={motivoRetorno}
                    onChange={e => setMotivoRetorno(e.target.value)}/>
                </div>
              )}
            </Accordion>

            <Accordion title="Descripción de trabajos" icon="edit" defaultOpen={true}>
              <MicField defaultValue="Se inspeccionó equipo al inicio de guardia. Se reguló cable de avance y retorno. Se aumentó aceite de lubricación. Se realizó engrase de partes móviles." placeholder="Describe los trabajos realizados..."/>
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Toca el 🎤 para dictar por voz.</div>
            </Accordion>

            <Accordion title="Repuestos utilizados" icon="box">
              {repuestos.map((r, i) => (
                <div key={i} style={{ border: "1px solid var(--card-border)", borderRadius: 6, padding: 10, marginBottom: 8, position: "relative" }}>
                  <div style={{ position: "absolute", top: 6, right: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setRepuestos(repuestos.filter((_, j) => j !== i))}><Icon name="x" size={12}/></button>
                  </div>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>ÍTEM #{i + 1}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{r.cod} — {r.desc}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{r.sis} · Cant: <b className="mono">{r.cant}</b></div>
                </div>
              ))}
              <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setRepuestos([...repuestos, { cod: "—", desc: "Nuevo ítem", sis: "—", cant: 1 }])}>
                <Icon name="plus" size={14}/> Agregar repuesto
              </button>
            </Accordion>

            <Accordion title="Lubricantes utilizados" icon="parts">
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead><tr><th>Tipo</th><th>UM</th><th className="num">Cant</th></tr></thead>
                <tbody>
                  <tr><td>15W-40</td><td>GAL</td><td><input className="input" style={{ height: 32, width: 56 }} defaultValue="—"/></td></tr>
                  <tr><td>HD-10W</td><td>GAL</td><td><input className="input" style={{ height: 32, width: 56 }} defaultValue="—"/></td></tr>
                  <tr><td>HD-30</td><td>GAL</td><td><input className="input" style={{ height: 32, width: 56 }} defaultValue="—"/></td></tr>
                  <tr><td>HD-50</td><td>GAL</td><td><input className="input" style={{ height: 32, width: 56 }} defaultValue="—"/></td></tr>
                  <tr><td>Refrigerante</td><td>GAL</td><td><input className="input" style={{ height: 32, width: 56 }} defaultValue="—"/></td></tr>
                  <tr><td>Grasa</td><td>LB</td><td><input className="input" style={{ height: 32, width: 56 }} defaultValue="1/4"/></td></tr>
                  <tr><td>Auto 527</td><td>GAL</td><td><input className="input" style={{ height: 32, width: 56 }} defaultValue="2"/></td></tr>
                </tbody>
              </table>
            </Accordion>

            <div style={{ marginTop:'20px', marginBottom: '20px' }}>
              <label style={{ fontSize:'14px', fontWeight:600, color:'#f8fafc',
                              display:'block', marginBottom:'8px' }}>
                Avance de la OT al cierre del turno
              </label>

              {/* Slider táctil grande */}
              <input
                type="range"
                min="0" max="100" step="5"
                value={formReporte.avance_ot_pct || 0}
                onChange={e => setFormReporte(prev=>({
                  ...prev, avance_ot_pct: parseInt(e.target.value)
                }))}
                style={{ width:'100%', height:'32px', cursor:'pointer' }}
              />

              {/* Valor numérico grande — fácil de leer en campo */}
              <div style={{
                textAlign:'center', marginTop:'8px',
                fontSize:'32px', fontWeight:700,
                color: (formReporte.avance_ot_pct||0) >= 100
                  ? '#22c55e'
                  : (formReporte.avance_ot_pct||0) >= 80
                    ? '#f59e0b' : '#06b6d4'
              }}>
                {formReporte.avance_ot_pct || 0}%
              </div>

              {/* Barra visual */}
              <div style={{ height:'8px', background:'rgba(255,255,255,0.08)',
                            borderRadius:'4px', overflow:'hidden', marginTop:'4px' }}>
                <div style={{
                  height:'100%', borderRadius:'4px',
                  width:`${formReporte.avance_ot_pct || 0}%`,
                  background: (formReporte.avance_ot_pct||0) >= 100
                    ? '#22c55e'
                    : (formReporte.avance_ot_pct||0) >= 80
                      ? '#f59e0b' : '#06b6d4',
                  transition:'width 0.2s ease'
                }} />
              </div>

              {(formReporte.avance_ot_pct||0) === 100 && (
                <div style={{
                  marginTop:'8px', padding:'10px 14px',
                  background:'rgba(34,197,94,0.1)',
                  borderRadius:'8px', textAlign:'center',
                  fontSize:'13px', color:'#22c55e', fontWeight:600
                }}>
                  ✓ OT completada — el supervisor cerrará formalmente la OT
                </div>
              )}
            </div>

            <Accordion title="Pedido de repuestos" icon="parts" badge={<span className="badge solid-red" style={{ marginLeft: 8 }}>{pedidos.filter(p => p.urg).length} urgentes</span>}>
              {pedidos.map((p, i) => (
                <div key={i} style={{ border: "1px solid var(--card-border)", borderRadius: 6, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span className="muted" style={{ fontSize: 10, fontWeight: 700 }}>#{i + 1}</span>
                    <span className="bold" style={{ fontSize: 13, flex: 1 }}>{p.desc}</span>
                    {p.urg ? <span className="badge solid-red">URGENTE</span> : <span className="badge orange"><span className="dot"/>Normal</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>{p.cod} · {p.sis} · Cant: <b className="mono">{p.cant}</b></div>
                </div>
              ))}
              <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setPedidos([...pedidos, { cant: 1, cod: "—", desc: "Nuevo pedido", sis: "—", urg: false }])}>
                <Icon name="plus" size={14}/> Agregar pedido
              </button>
            </Accordion>

            <Accordion title="Fotos" icon="camera">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div className="thumb-placeholder">FOTO<br/>equipo_01.jpg</div>
                <div className="thumb-placeholder">FOTO<br/>repuesto_02.jpg</div>
                <button className="btn btn-secondary" style={{ height: 88, width: 88, flexDirection: "column", gap: 4 }}>
                  <Icon name="camera" size={22}/>
                  <span style={{ fontSize: 10 }}>Tomar foto</span>
                </button>
              </div>
            </Accordion>

            <Accordion title="Backlog desde campo" icon="orders" badge={<span className="badge cyan" style={{ marginLeft: 8 }}>Nuevo</span>}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Registra cualquier hallazgo o trabajo pendiente para futuras OTs.</div>
              <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center", color: "var(--cyan)", borderColor: "var(--cyan)" }} onClick={() => setShowBacklogModal(true)}>
                <Icon name="plus" size={14}/> Reportar hallazgo
              </button>
            </Accordion>

            <Accordion title="Comentarios finales" icon="edit">
              <MicField defaultValue="Equipo operativo desde inicio de guardia. Equipo trabajó con normalidad. No registra paradas." placeholder="Comentarios..."/>
            </Accordion>

          </div>
          <div className="phone-footer">
            <button className="btn btn-secondary" onClick={() => onNav("partes-mina")}>Guardar borrador</button>
            <button className="btn btn-primary" onClick={handleEnviarClick}>Enviar</button>
          </div>
        </div>

        {showBacklogModal && <BacklogModal onClose={() => setShowBacklogModal(false)}/>}

        {mostrarConfirmacion && (
          <div style={{
            position:'fixed', inset:0,
            background:'rgba(0,0,0,0.8)',
            display:'flex', alignItems:'center', justifyContent:'center',
            zIndex:1000, padding:'16px'
          }}>
            <div style={{
              background:'#0d1422',
              border:'1px solid #1e2d47',
              borderRadius:'12px', padding:'24px',
              maxWidth:'400px', width:'100%'
            }}>
              <div style={{ fontSize:'16px', fontWeight:700,
                            color:'#f8fafc', marginBottom:'16px' }}>
                ¿Confirmar envío del reporte?
              </div>

              {/* Resumen del reporte */}
              <div style={{ background:'rgba(255,255,255,0.04)',
                            borderRadius:'8px', padding:'14px',
                            marginBottom:'16px' }}>
                <div style={{ fontSize:'12px', color:'#64748b',
                              marginBottom:'8px' }}>Resumen</div>
                <div style={{ fontSize:'13px', color:'#f8fafc',
                              lineHeight:'1.8' }}>
                  <div>Equipo: <strong>{formReporte.equipo_id}</strong></div>
                  <div>Turno: <strong>{formReporte.turno}</strong>
                       · Fecha: <strong>{formReporte.fecha}</strong></div>
                  <div>Técnico: <strong>{formReporte.tecnico}</strong></div>
                  {formReporte.contrato_id && (
                    <div>Contrato: <strong style={{ color:'#f59e0b',
                                   fontFamily:'monospace' }}>
                      {formReporte.contrato_id}
                    </strong></div>
                  )}
                  <div>Avance OT: <strong style={{ color:'#06b6d4' }}>
                    {formReporte.avance_ot_pct}%
                  </strong></div>
                </div>
              </div>

              <div style={{ fontSize:'12px', color:'#64748b',
                            marginBottom:'20px' }}>
                El supervisor recibirá este reporte para aprobación.
                No podrás editarlo una vez enviado.
              </div>

              <div style={{ display:'flex', gap:'12px' }}>
                <button
                  onClick={() => setMostrarConfirmacion(false)}
                  style={{
                    flex:1, padding:'14px',
                    background:'rgba(255,255,255,0.06)',
                    border:'1px solid #1e2d47',
                    borderRadius:'8px', color:'#94a3b8',
                    fontSize:'14px', cursor:'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setMostrarConfirmacion(false);
                    handleConfirmarEnvio();
                  }}
                  style={{
                    flex:2, padding:'14px',
                    background:'#3b82f6',
                    border:'none',
                    borderRadius:'8px', color:'#fff',
                    fontSize:'14px', fontWeight:600, cursor:'pointer'
                  }}
                >
                  ✓ Confirmar envío
                </button>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header"><h3>Preview en vivo</h3><span className="hint">Lo que verá el supervisor</span></div>
            <div className="card-body">
              <div style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Equipo · Turno · Fecha</div>
                <div className="bold" style={{ fontSize: 15, fontFamily: "ui-monospace, monospace" }}>{formReporte.equipo_id} · {formReporte.turno} · {formReporte.fecha}</div>
                {formReporte.contrato_id && (
                  <div style={{ fontSize:'11px', color:'#64748b', marginTop:'2px' }}>
                    {formReporte.contrato_id} · {formReporte.centro_costo}
                  </div>
                )}
              </div>
              <div style={{ marginTop:'12px', marginBottom: 12 }}>
                <div style={{ fontSize:'10px', color:'#64748b',
                              textTransform:'uppercase', letterSpacing:'0.08em' }}>
                  Avance OT
                </div>
                <div style={{ fontSize:'20px', fontWeight:700, color:'#06b6d4',
                              marginTop:'2px' }}>
                  {formReporte.avance_ot_pct || 0}%
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Tipo de mantenimiento</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {tipoMant.prg && <span className="chip">Prev. programado</span>}
                  {tipoMant.prv && <span className="chip">Preventivo</span>}
                  {tipoMant.ctvo && <span className="chip">Correctivo</span>}
                  {tipoMant.acc && <span className="chip">Accidente</span>}
                  {!Object.values(tipoMant).some(Boolean) && <span className="muted" style={{ fontSize: 12 }}>Ninguno seleccionado</span>}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Estado final</div>
                <div style={{ marginTop: 4 }}>
                  {estado === "operativo" && <span className="badge green"><span className="dot"/>🟢 Operativo</span>}
                  {estado === "espera" && <span className="badge orange"><span className="dot"/>🟡 En espera de repuesto</span>}
                  {estado === "inop" && <span className="badge red"><span className="dot"/>🔴 Inoperativo</span>}
                </div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Pedidos urgentes</div>
                <div style={{ marginTop: 4 }}>
                  {pedidos.filter(p => p.urg).length > 0
                    ? pedidos.filter(p => p.urg).map((p, i) => (
                      <div key={i} style={{ fontSize: 13, padding: "4px 0" }}>
                        <span className="badge solid-red" style={{ marginRight: 6 }}>URGENTE</span> {p.desc}
                      </div>
                    ))
                    : <span className="muted" style={{ fontSize: 12 }}>Ninguno</span>}
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3>Tips</h3></div>
            <div className="card-body muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div>• Todos los campos grandes son tocables cómodamente con el pulgar (48px mínimo).</div>
              <div>• Usa el micrófono 🎤 en cyan para dictar descripciones — el campo se pone en cyan con un punto rojo parpadeante mientras graba.</div>
              <div>• Los pedidos "Urgentes" se envían al gerente en tiempo real.</div>
            </div>
          </div>
        </div>
      </div>

      <FooterBrand/>
    </div>
  );
};

// ---------- Parte diario de taller ----------
export const ParteTallerPage = ({ onNav, routeParams = {} }) => {
  const sesionOperativa = useSesionOperativa();
  const [formData, setFormData] = useS3({
    id: 'PD-2026-112',
    ot_id: '',
    tarea_id: '',
    fecha: new Date().toISOString().slice(0, 10),
    tecnico_id: '',
    tecnico_nombre: '',
    supervisor: 'Supervisor del taller',
    taller: 'Ate',
    especialidad: 'Mecánico',
    estado: 'borrador',
    contrato_id: 'CT-2026-002',
    centro_costo: 'FLO-ALQ',
    equipo_id: 'JB-24',
    avance_ot_pct: 45,
    actividades: [
      { id: 'ACT-001', descripcion: 'Desmontaje de sistema hidráulico. Cambio de sellos internos y prueba de presión.', hora_inicio: '08:00', hora_fin: '11:30', horometro_inicio: 3450, horometro_fin: 3453 },
      { id: 'ACT-002', descripcion: 'Engrase general del equipo. Limpieza de filtros y reemplazo de bandas.', hora_inicio: '13:00', hora_fin: '17:00', horometro_inicio: 3453, horometro_fin: 3458 }
    ],
    repuestos_consumidos: [
      { item_id: 'REP-CAT-0441', descripcion: 'Sello hidráulico kit completo', cantidad: 2, unidad: 'kit', costo_unitario: 145.00 }
    ],
    fluidos_consumidos: [
      { tipo: 'Motor 15W40', motivo: 'Cambio', cantidad: 5, unidad: 'L' }
    ],
    pedidos: [],
    trabajos_pendientes: '',
    observaciones: '',
    backlog_generado_id: null
  });

  const [ordenesReales, setOrdenesReales] = useS3([]);
  const [tareasReales, setTareasReales] = useS3([]);
  const [tecnicosReales, setTecnicosReales] = useS3([]);
  const [tecnicoLogueado, setTecnicoLogueado] = useS3(null);
  const [cargandoOTs, setCargandoOTs] = useS3(false);
  const [cargandoTareas, setCargandoTareas] = useS3(false);
  const [cargandoTecnicos, setCargandoTecnicos] = useS3(false);
  const [errorDatosReales, setErrorDatosReales] = useS3('');
  const [guardandoParte, setGuardandoParte] = useS3(false);
  const [errorGuardadoParte, setErrorGuardadoParte] = useS3('');
  const [parteGuardado, setParteGuardado] = useS3(null);
  const [showBacklogModal, setShowBacklogModal] = useS3(false);
  const [nuevoBacklog, setNuevoBacklog] = useS3({});

  const aplicarFiltroSociedadOT = (consulta) => {
    if (sesionOperativa.sociedadId && !sesionOperativa.vistaConsolidada) {
      return consulta.eq('sociedad_id', sesionOperativa.sociedadId);
    }
    if (sesionOperativa.vistaConsolidada && Array.isArray(sesionOperativa.sociedadesIdsAlcance) && sesionOperativa.sociedadesIdsAlcance.length) {
      return consulta.in('sociedad_id', sesionOperativa.sociedadesIdsAlcance);
    }
    return consulta;
  };

  const seleccionarOT = (otId) => {
    const ot = ordenesReales.find(item => item.id === otId);
    setTareasReales([]);
    setFormData(prev => ({
      ...prev,
      ot_id: otId,
      tarea_id: '',
      tecnico_id: '',
      tecnico_nombre: '',
      contrato_id: ot?.contrato_alquiler_id || '',
      centro_costo: ot?.centro_costo_id || '',
      equipo_id: ot?.equipo_id || '',
    }));
  };

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId || !sesionOperativa.permiteEscritura) {
      setOrdenesReales([]);
      setCargandoOTs(false);
      return () => { vigente = false; };
    }

    const cargarOTs = async () => {
      setCargandoOTs(true);
      setErrorDatosReales('');
      try {
        let consulta = getSupabaseClient()
          .from('ordenes_trabajo')
          .select('id,numero,descripcion,servicio,estado,sociedad_id,equipo_id,tecnico_responsable_id,centro_costo_id,contrato_alquiler_id')
          .eq('empresa_id', sesionOperativa.empresaId)
          .in('estado', ['programada', 'ejecucion'])
          .order('numero');
        consulta = aplicarFiltroSociedadOT(consulta);
        const { data, error } = await consulta;
        if (error) throw error;
        if (vigente) setOrdenesReales(data || []);
      } catch (error) {
        if (vigente) {
          setOrdenesReales([]);
          setErrorDatosReales(error?.message || 'No se pudieron cargar las OTs disponibles.');
        }
      } finally {
        if (vigente) setCargandoOTs(false);
      }
    };

    cargarOTs();
    return () => { vigente = false; };
  }, [sesionOperativa.empresaId, sesionOperativa.sociedadId, sesionOperativa.vistaConsolidada, sesionOperativa.sociedadesIdsAlcance, sesionOperativa.permiteEscritura]);

  const otPreseleccionadaId = String(routeParams?.ot || '').trim();
  const otPreseleccionada = Boolean(
    otPreseleccionadaId
    && formData.ot_id === otPreseleccionadaId
    && ordenesReales.some(ot => ot.id === otPreseleccionadaId),
  );

  useEffect(() => {
    if (!otPreseleccionadaId || formData.ot_id === otPreseleccionadaId) return;
    if (!ordenesReales.some(ot => ot.id === otPreseleccionadaId)) return;
    seleccionarOT(otPreseleccionadaId);
  }, [otPreseleccionadaId, ordenesReales, formData.ot_id]);

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId || !sesionOperativa.permiteEscritura) {
      setTecnicosReales([]);
      setTecnicoLogueado(null);
      setCargandoTecnicos(false);
      return () => { vigente = false; };
    }

    const cargarTecnicos = async () => {
      setCargandoTecnicos(true);
      try {
        const { data, error } = await getSupabaseClient()
          .from('personal_operativo')
          .select('id,nombre,codigo,especialidad,supervisor,auth_user_id,estado,tarifa_hora')
          .eq('empresa_id', sesionOperativa.empresaId)
          .eq('estado', 'disponible')
          .order('nombre');
        if (error) throw error;
        const { data: perfilActual, error: perfilActualError } = await getSupabaseClient()
          .from('personal_operativo')
          .select('id,nombre,especialidad,supervisor,auth_user_id')
          .eq('empresa_id', sesionOperativa.empresaId)
          .eq('auth_user_id', sesionOperativa.usuario?.id)
          .maybeSingle();
        if (perfilActualError) throw perfilActualError;
        if (vigente) {
          const tecnicos = data || [];
          const perfilPropio = perfilActual || tecnicos.find(tecnico => tecnico.auth_user_id === sesionOperativa.usuario?.id) || null;
          setTecnicosReales(tecnicos);
          setTecnicoLogueado(perfilPropio);
          if (perfilPropio?.especialidad || perfilPropio?.supervisor) {
            setFormData(prev => ({
              ...prev,
              especialidad: perfilPropio.especialidad || prev.especialidad,
              supervisor: perfilPropio.supervisor || prev.supervisor,
            }));
          }
        }
      } catch (error) {
        if (vigente) setErrorDatosReales(error?.message || 'No se pudo cargar el catálogo de técnicos.');
      } finally {
        if (vigente) setCargandoTecnicos(false);
      }
    };

    cargarTecnicos();
    return () => { vigente = false; };
  }, [sesionOperativa.empresaId, sesionOperativa.usuario?.id, sesionOperativa.permiteEscritura]);

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId || !formData.ot_id) {
      setTareasReales([]);
      setCargandoTareas(false);
      return () => { vigente = false; };
    }

    const cargarTareas = async () => {
      setCargandoTareas(true);
      try {
        const { data, error } = await getSupabaseClient()
          .from('ot_tareas')
          .select('id,titulo,descripcion,tecnico_id,tecnico_nombre,estado,completada,orden')
          .eq('empresa_id', sesionOperativa.empresaId)
          .eq('ot_id', formData.ot_id)
          .order('orden');
        if (error) throw error;
        if (vigente) setTareasReales(data || []);
      } catch (error) {
        if (vigente) {
          setTareasReales([]);
          setErrorDatosReales(error?.message || 'No se pudieron cargar las tareas de la OT.');
        }
      } finally {
        if (vigente) setCargandoTareas(false);
      }
    };

    cargarTareas();
    return () => { vigente = false; };
  }, [sesionOperativa.empresaId, formData.ot_id]);

  // Funciones de cálculo
  const calcularHoras = (horaInicio, horaFin) => {
    if (!horaInicio || !horaFin) return null;
    const [hI, mI] = horaInicio.split(':').map(Number);
    const [hF, mF] = horaFin.split(':').map(Number);
    const minutosInicio = hI * 60 + mI;
    const minutosFin   = hF * 60 + mF;
    if (minutosFin <= minutosInicio) return null;
    const diferencia = (minutosFin - minutosInicio) / 60;
    return Math.round(diferencia * 100) / 100;
  };

  const calcularTotalHoras = (actividades) => {
    return actividades.reduce((sum, act) => {
      const h = calcularHoras(act.hora_inicio, act.hora_fin);
      return sum + (h || 0);
    }, 0);
  };

  const getCostoHora = (tecnicoId) => {
    const tecnico = tecnicosReales.find(t => t.id === tecnicoId);
    return Number(tecnico?.tarifa_hora || 0);
  };

  const getContextoOT = (otId) => {
    const ot = ordenesReales.find(o => o.id === otId);
    return ot ? {
      contrato_id: ot.contrato_alquiler_id || null,
      centro_costo: ot.centro_costo_id || null,
      equipo_id: ot.equipo_id || null,
    } : null;
  };

  const tareaSeleccionada = tareasReales.find(tarea => tarea.id === formData.tarea_id) || null;
  const tecnicoTareaNombre = tareaSeleccionada?.tecnico_nombre
    || tecnicosReales.find(tecnico => tecnico.id === tareaSeleccionada?.tecnico_id)?.nombre
    || (tareaSeleccionada?.tecnico_id ? `Técnico asignado (${tareaSeleccionada.tecnico_id})` : '');

  const seleccionarTarea = (tareaId) => {
    const tarea = tareasReales.find(item => item.id === tareaId);
    const tecnico = tecnicosReales.find(item => item.id === tarea?.tecnico_id);
    setFormData(prev => ({
      ...prev,
      tarea_id: tareaId,
      tecnico_id: tarea?.tecnico_id || '',
      tecnico_nombre: tarea?.tecnico_nombre || tecnico?.nombre || '',
    }));
  };

  const seleccionarTecnico = (tecnicoId) => {
    const tecnico = tecnicosReales.find(item => item.id === tecnicoId);
    setFormData(prev => ({ ...prev, tecnico_id: tecnicoId, tecnico_nombre: tecnico?.nombre || '' }));
  };

  const totalHoras = calcularTotalHoras(formData.actividades);
  const costoHoraTecnico = getCostoHora(formData.tecnico_id);
  const costoMOTotal = totalHoras * costoHoraTecnico;
  const totalRepuestos = formData.repuestos_consumidos.reduce((acc, r) => acc + (r.cantidad * r.costo_unitario), 0);

  const actualizarActividad = (idx, campo, valor) => {
    const newAct = [...formData.actividades];
    newAct[idx] = { ...newAct[idx], [campo]: valor };
    setFormData({ ...formData, actividades: newAct });
  };

  const actualizarRepuesto = (idx, campo, valor) => {
    const newRep = [...formData.repuestos_consumidos];
    newRep[idx] = { ...newRep[idx], [campo]: valor };
    setFormData({ ...formData, repuestos_consumidos: newRep });
  };

  const eliminarRepuesto = (idx) => {
    const newRep = formData.repuestos_consumidos.filter((_, i) => i !== idx);
    setFormData({ ...formData, repuestos_consumidos: newRep });
  };

  const openBacklog = () => {
    setNuevoBacklog({
      ot_origen_id:  formData.ot_id,
      equipo_id:     formData.equipo_id,
      contrato_id:   formData.contrato_id,
      centro_costo:  formData.centro_costo,
      fecha:         formData.fecha,
      reportado_por: formData.tecnico_nombre,
      origen_deteccion: 'parte_diario',
      sistema: 'Hidráulico',
      descripcion_hallazgo: '',
      prioridad: 'Normal'
    });
    setShowBacklogModal(true);
  };

  const guardarParteReal = async () => {
    if (!sesionOperativa.permiteEscritura || guardandoParte) return;
    if (!formData.ot_id || !formData.tecnico_id || !formData.fecha) {
      setErrorGuardadoParte('Selecciona una OT, un técnico y la fecha del parte antes de enviarlo.');
      return;
    }
    if (!ordenesReales.some(ot => ot.id === formData.ot_id)) {
      setErrorGuardadoParte('La OT seleccionada ya no está disponible en la sociedad operativa actual.');
      return;
    }

    const actividadesConTexto = formData.actividades.filter(actividad => actividad.descripcion?.trim());
    if (!actividadesConTexto.length) {
      setErrorGuardadoParte('Registra al menos una actividad realizada antes de enviarlo.');
      return;
    }

    const horas = calcularTotalHoras(formData.actividades);
    const horasInicio = formData.actividades.map(actividad => actividad.hora_inicio).filter(Boolean).sort();
    const horasFin = formData.actividades.map(actividad => actividad.hora_fin).filter(Boolean).sort();
    const actividad = [
      ...actividadesConTexto.map(item => [
        item.descripcion.trim(),
        item.hora_inicio && item.hora_fin ? `(${item.hora_inicio} - ${item.hora_fin})` : '',
      ].filter(Boolean).join(' ')),
      formData.observaciones?.trim() ? `Observaciones: ${formData.observaciones.trim()}` : '',
    ].filter(Boolean).join('\n');
    const materiales = [
      ...formData.repuestos_consumidos.map(item => ({
        tipo: 'repuesto', item_id: item.item_id, descripcion: item.descripcion,
        cantidad: Number(item.cantidad || 0), unidad: item.unidad, costo_unitario: Number(item.costo_unitario || 0),
      })),
      ...formData.fluidos_consumidos.map(item => ({
        tipo: 'fluido', descripcion: item.tipo, motivo: item.motivo,
        cantidad: Number(item.cantidad || 0), unidad: item.unidad,
      })),
    ];

    setGuardandoParte(true);
    setErrorGuardadoParte('');
    setParteGuardado(null);
    try {
      const supabase = getSupabaseClient();
      const { data: numeroGenerado, error: errorNumero } = await supabase
        .rpc('siguiente_numero_parte_diario', { p_empresa_id: sesionOperativa.empresaId });
      if (errorNumero) throw errorNumero;

      const payload = {
        id: generarIdParte(),
        numero: numeroGenerado || null,
        empresa_id: sesionOperativa.empresaId,
        orden_trabajo_id: formData.ot_id,
        tecnico_id: formData.tecnico_id,
        tecnico_nombre: formData.tecnico_nombre || null,
        fecha: formData.fecha,
        hora_inicio: horasInicio[0] || null,
        hora_fin: horasFin.at(-1) || null,
        horas_normales: horas,
        horas_extra: 0,
        actividad,
        avance_pct: Number(formData.avance_ot_pct || 0),
        tarea_id: formData.tarea_id || null,
        materiales,
        evidencias: [],
        origen_registro: 'operativo_taller',
        estado: 'en_revision',
      };
      const { data, error } = await supabase.from('partes_diarios').insert(payload).select('id,numero').single();
      if (error) throw error;
      setParteGuardado(data || payload);
      setFormData(prev => ({ ...prev, id: data?.numero || data?.id || prev.id }));
    } catch (error) {
      setErrorGuardadoParte(error?.message || 'No se pudo guardar el parte diario.');
    } finally {
      setGuardandoParte(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => onNav("partes-taller")}><Icon name="back" size={14}/> Volver</button>
        <div>
          <h1>Parte diario de taller</h1>
          <div className="sub">{formData.especialidad} · {formData.taller} · {formData.fecha}</div>
        </div>
      </div>

      {!sesionOperativa.permiteEscritura && (
        <div className="card" style={{ marginBottom: 14, padding: 14, color: '#b45309' }}>
          Selecciona una sociedad operativa para registrar partes diarios. La vista consolidada es solo lectura.
        </div>
      )}
      {errorDatosReales && <div className="card" style={{ marginBottom: 14, padding: 14, color: '#B91C1C' }}>{errorDatosReales}</div>}
      {errorGuardadoParte && <div className="card" style={{ marginBottom: 14, padding: 14, color: '#B91C1C' }}>{errorGuardadoParte}</div>}
      {parteGuardado && <div className="card" style={{ marginBottom: 14, padding: 14, color: '#15803D' }}>Parte {parteGuardado.numero || parteGuardado.id} enviado a revisión.</div>}

      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        
        {/* Cabecera */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header"><h3>Cabecera</h3></div>
          <div className="card-body">
            <div className="grid-2">
              <div className="field">
                <label>Taller * <IndicadorPendienteConexion/></label>
                <div className="toggle-pills">
                  <button className={"toggle-pill " + (formData.taller === "Ate" ? "active" : "")} onClick={() => setFormData({...formData, taller: "Ate"})}>Ate</button>
                  <button className={"toggle-pill " + (formData.taller === "Satipo" ? "active" : "")} onClick={() => setFormData({...formData, taller: "Satipo"})}>Satipo</button>
                </div>
              </div>
              <div className="field">
                <label>Especialidad</label>
                <div className="toggle-pills">
                  <button className={"toggle-pill " + (formData.especialidad === "Mecánico" ? "active" : "")} onClick={() => setFormData({...formData, especialidad: "Mecánico"})}>⚙️ Mecánico</button>
                  <button className={"toggle-pill " + (formData.especialidad === "Eléctrico" ? "active" : "")} onClick={() => setFormData({...formData, especialidad: "Eléctrico"})}>⚡ Eléctrico</button>
                </div>
                {tecnicoLogueado?.especialidad && <div className="hint" style={{ marginTop: 6 }}>Precargada desde tu perfil operativo: {tecnicoLogueado.especialidad}</div>}
              </div>
              <div className="field">
                <label>Fecha *</label>
                <input className="input input-lg" type="date" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})}/>
              </div>
              <div className="field">
                <label>Técnico *</label>
                {tareaSeleccionada?.tecnico_id ? (
                  <input className="input input-lg" value={tecnicoTareaNombre} readOnly style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1e2d47", color: "#64748b", cursor: "not-allowed" }}/>
                ) : (
                  <select className="select input-lg" value={formData.tecnico_id} disabled={cargandoTecnicos || !sesionOperativa.permiteEscritura} onChange={e => seleccionarTecnico(e.target.value)}>
                    <option value="">{cargandoTecnicos ? 'Cargando técnicos...' : '-- Seleccionar técnico disponible --'}</option>
                    {tecnicosReales.map(tecnico => <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre}{tecnico.codigo ? ` · ${tecnico.codigo}` : ''}</option>)}
                  </select>
                )}
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Supervisor *</label>
                <input className="input input-lg" value={formData.supervisor} onChange={e => setFormData({...formData, supervisor: e.target.value})} placeholder="Supervisor del taller"/>
                {tecnicoLogueado?.supervisor && <div className="hint" style={{ marginTop: 6 }}>Precargado desde tu perfil operativo.</div>}
              </div>
            </div>

            <div className="field mt-md" style={{ padding: 14, border: "2px solid var(--navy)", borderRadius: 8, background: "#F5F7FB", position: "relative" }}>
              <label style={{ color: "var(--navy)", fontWeight: 700 }}>OT asociada *</label>
              {otPreseleccionada ? (
                <div className="input input-lg" style={{ display: 'flex', alignItems: 'center', background: 'rgba(6,182,212,0.08)', color: 'var(--text)' }}>
                  <Icon name="check" size={15} />
                  <span style={{ marginLeft: 8 }}>
                    {ordenesReales.find(ot => ot.id === formData.ot_id)?.numero || formData.ot_id} — OT preseleccionada desde Mis OTs del día
                  </span>
                </div>
              ) : (
                <select className="select input-lg" value={formData.ot_id} disabled={cargandoOTs || !sesionOperativa.permiteEscritura} onChange={e => seleccionarOT(e.target.value)}>
                  <option value="">{cargandoOTs ? 'Cargando OTs...' : '-- Seleccionar OT programada o en ejecución --'}</option>
                  {ordenesReales.map(ot => <option key={ot.id} value={ot.id}>{ot.numero} — {ot.servicio || ot.descripcion || ot.estado}</option>)}
                </select>
              )}
              <div style={{ marginTop: 6 }}><span className={formData.ot_id ? 'badge cyan' : 'badge slate'}><span className="dot"/>{formData.ot_id ? 'Vinculado' : 'Pendiente de seleccionar'}</span></div>

              {formData.ot_id && (() => {
                const ctx = getContextoOT(formData.ot_id);
                return ctx ? (
                  <div style={{
                    display:'flex', alignItems:'center', gap:'10px',
                    marginTop:'8px', padding:'6px 10px',
                    background:'rgba(245,158,11,0.06)',
                    borderRadius:'6px', flexWrap:'wrap'
                  }}>
                    <span style={{ fontSize:'10px', color:'#64748b' }}>
                      Imputación:
                    </span>
                    <span style={{
                      background:'rgba(245,158,11,0.12)', color:'#f59e0b',
                      fontSize:'9px', fontFamily:'monospace',
                      padding:'1px 7px', borderRadius:'6px', fontWeight:700
                    }}>
                      {ctx.centro_costo}
                    </span>
                    {ctx.contrato_id && (
                      <span style={{ fontSize:'10px', color:'#60a5fa', fontFamily:'monospace' }}>
                        {ctx.contrato_id}
                      </span>
                    )}
                    <span style={{ fontSize:'10px', color:'#64748b' }}>
                      · Equipo: <strong style={{ color:'#94a3b8' }}>{ctx.equipo_id}</strong>
                    </span>
                  </div>
                ) : null;
              })()}

              <div className="field" style={{ marginTop: 16 }}>
                <label>Tarea trabajada <span style={{ fontWeight: 400 }}>(opcional)</span></label>
                <select className="select input-lg" value={formData.tarea_id} disabled={!formData.ot_id || cargandoTareas || !sesionOperativa.permiteEscritura} onChange={e => seleccionarTarea(e.target.value)}>
                  <option value="">{!formData.ot_id ? 'Selecciona primero una OT' : cargandoTareas ? 'Cargando tareas...' : '-- Sin tarea estructurada --'}</option>
                  {tareasReales.map(tarea => <option key={tarea.id} value={tarea.id}>{tarea.titulo}{tarea.tecnico_nombre ? ` · ${tarea.tecnico_nombre}` : ''}{tarea.completada ? ' · Completada' : ''}</option>)}
                </select>
              </div>

              <div style={{ marginTop:'16px' }}>
                <label>
                  Avance de la OT al cierre de este turno *
                  <span style={{ display:'block', fontSize:'10px', color:'#64748b', fontWeight:400, marginTop:'2px' }}>
                    ¿Qué porcentaje de la OT está completado al terminar este turno?
                  </span>
                </label>
                <div style={{ display:'flex', alignItems:'center', gap:'12px', marginTop:'8px' }}>
                  <input
                    type="range"
                    min="0" max="100" step="5"
                    value={formData.avance_ot_pct || 0}
                    onChange={e => setFormData(prev=>({...prev, avance_ot_pct: parseInt(e.target.value)}))}
                    style={{ flex:1 }}
                  />
                  <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                    <input
                      type="number"
                      min="0" max="100"
                      value={formData.avance_ot_pct || 0}
                      onChange={e => setFormData(prev=>({...prev, avance_ot_pct: Math.min(100, parseInt(e.target.value)||0)}))}
                      style={{ width:'60px', textAlign:'center' }}
                    />
                    <span style={{ color:'#64748b', fontSize:'13px' }}>%</span>
                  </div>
                </div>

                <div style={{ marginTop:'8px', height:'6px', background:'rgba(255,255,255,0.06)', borderRadius:'3px', overflow:'hidden' }}>
                  <div style={{
                    height:'100%', borderRadius:'3px',
                    width:`${formData.avance_ot_pct || 0}%`,
                    background: (formData.avance_ot_pct || 0) >= 100
                      ? '#22c55e'
                      : (formData.avance_ot_pct || 0) >= 80 ? '#f59e0b' : '#06b6d4',
                    transition:'width 0.3s ease'
                  }} />
                </div>

                {formData.avance_ot_pct === 100 && (
                  <div style={{ fontSize:'11px', color:'#22c55e', marginTop:'4px' }}>
                    ✓ OT al 100% — recuerda hacer el Cierre & Conformidad
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actividades */}
        <Accordion title="Actividades realizadas" icon="workshop" defaultOpen={true} badge={<span className="chip" style={{ marginLeft: 8 }}>{formData.actividades.length} actividades</span>}>
          {formData.actividades.map((a, i) => (
            <div key={i} style={{ border: "1px solid var(--card-border)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>ACTIVIDAD #{i + 1}</div>
              <div className="mic-field-wrap" style={{ marginTop: 6 }}>
                <textarea value={a.descripcion} onChange={e => actualizarActividad(i, 'descripcion', e.target.value)}/>
                <button className="mic-btn"><Icon name="mic" size={18}/></button>
              </div>
              <div className="grid-2" style={{ marginTop: 10 }}>
                <div className="field">
                  <label>Hora inicio</label>
                  <input className="input" type="time" value={a.hora_inicio} onChange={e => actualizarActividad(i, 'hora_inicio', e.target.value)}/>
                </div>
                <div className="field">
                  <label>Hora fin</label>
                  <input className="input" type="time" value={a.hora_fin} onChange={e => actualizarActividad(i, 'hora_fin', e.target.value)}/>
                </div>
                
                {(() => {
                  const horas = calcularHoras(a.hora_inicio, a.hora_fin);
                  return horas !== null ? (
                    <div style={{
                      display:'flex', alignItems:'center', gap:'6px',
                      marginTop:'6px', padding:'6px 10px',
                      background:'rgba(6,182,212,0.06)',
                      borderLeft:'2px solid #06b6d4',
                      borderRadius:'0 4px 4px 0',
                      gridColumn: '1 / -1'
                    }}>
                      <span style={{ fontSize:'11px', color:'#64748b' }}>
                        Horas trabajadas:
                      </span>
                      <span style={{ fontSize:'14px', fontWeight:700, color:'#06b6d4' }}>
                        {horas.toFixed(1)}h
                      </span>
                    </div>
                  ) : null;
                })()}

                <div className="field"><label>Horómetro/KM inicio <IndicadorPendienteConexion/></label><input className="input" value={a.horometro_inicio} onChange={e => actualizarActividad(i, 'horometro_inicio', e.target.value)}/></div>
                <div className="field"><label>Horómetro/KM fin <IndicadorPendienteConexion/></label><input className="input" value={a.horometro_fin} onChange={e => actualizarActividad(i, 'horometro_fin', e.target.value)}/></div>
              </div>
            </div>
          ))}

          {totalHoras > 0 ? (
            <div style={{
              background:'rgba(6,182,212,0.06)',
              borderLeft:'3px solid #06b6d4',
              borderRadius:'0 6px 6px 0',
              padding:'10px 16px', marginTop:'12px', marginBottom:'12px'
            }}>
              <div style={{ fontSize:'11px', color:'#64748b',
                            marginBottom:'6px', fontFamily:'monospace',
                            textTransform:'uppercase', letterSpacing:'0.08em' }}>
                Resumen de Mano de Obra — este parte
              </div>
              <div style={{ display:'flex', gap:'24px' }}>
                <div>
                  <div style={{ fontSize:'10px', color:'#475569' }}>Total horas</div>
                  <div style={{ fontSize:'16px', fontWeight:700, color:'#06b6d4' }}>
                    {totalHoras.toFixed(1)}h
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:'10px', color:'#475569' }}>Costo/hora técnico</div>
                  <div style={{ fontSize:'16px', fontWeight:700, color:'#f8fafc' }}>
                    ${costoHoraTecnico.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:'10px', color:'#475569' }}>Costo MO este parte</div>
                  <div style={{ fontSize:'16px', fontWeight:700, color:'#22c55e' }}>
                    ${costoMOTotal.toFixed(2)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize:'10px', color:'#475569', marginTop:'6px' }}>
                Se imputará a la OT al enviar para aprobación
              </div>
            </div>
          ) : null}

          <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setFormData({...formData, actividades: [...formData.actividades, { id:`ACT-00${formData.actividades.length+1}`, descripcion:'', hora_inicio:'', hora_fin:'', horometro_inicio:'', horometro_fin:'' }]})}>
            <Icon name="plus" size={14}/> Agregar actividad
          </button>
        </Accordion>

        {/* Repuestos */}
        <Accordion title="Repuestos, materiales e insumos" icon="box">
          <input type="text" className="input" placeholder="Buscar repuesto por código o descripción..." style={{ marginBottom: 12, width: '100%' }} />
          <table className="tbl">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Und</th>
                <th className="num">Cant</th>
                <th className="num">Costo Unit.</th>
                <th className="num">Costo Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {formData.repuestos_consumidos.map((rep, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily:'monospace', fontSize:'11px' }}>{rep.item_id}</td>
                  <td>{rep.descripcion}</td>
                  <td>{rep.unidad}</td>
                  <td>
                    <input type="number" className="input" value={rep.cantidad}
                      onChange={e => actualizarRepuesto(idx,'cantidad', Number(e.target.value) || 0)}
                      style={{ width:'60px', padding:'4px' }}
                    />
                  </td>
                  <td className="num" style={{ color:'#64748b' }}>${rep.costo_unitario.toFixed(2)}</td>
                  <td className="num" style={{ fontWeight:600, color:'#f8fafc' }}>
                    ${(rep.cantidad * rep.costo_unitario).toFixed(2)}
                  </td>
                  <td>
                    <button onClick={() => eliminarRepuesto(idx)}
                      style={{ color:'#ef4444', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign:'right', fontWeight:700, color:'#f8fafc', marginTop: 12 }}>
            Total repuestos: ${totalRepuestos.toFixed(2)}
          </div>
        </Accordion>

        {/* Pedidos */}
        <Accordion title="Pedido de repuestos" icon="parts" badge={<IndicadorPendienteConexion/>}>
          {formData.pedidos.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>No hay pedidos registrados. Usa "+ Agregar pedido" cuando necesites solicitar stock.</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>N° Parte / Código</th><th>Descripción</th><th className="num">Cant</th><th>OT Origen</th><th>Urgencia</th></tr></thead>
              <tbody>
                {formData.pedidos.map((p, i) => (
                  <tr key={i}>
                    <td><input className="input" value={p.codigo} placeholder="N° Parte" onChange={e => { const newP = [...formData.pedidos]; newP[i].codigo = e.target.value; setFormData({...formData, pedidos: newP}) }}/></td>
                    <td><input className="input" value={p.descripcion} placeholder="Descripción del repuesto" onChange={e => { const newP = [...formData.pedidos]; newP[i].descripcion = e.target.value; setFormData({...formData, pedidos: newP}) }}/></td>
                    <td><input className="input" type="number" value={p.cantidad} style={{width:60}} onChange={e => { const newP = [...formData.pedidos]; newP[i].cantidad = e.target.value; setFormData({...formData, pedidos: newP}) }}/></td>
                    <td><input className="input" value={formData.ot_id} readOnly style={{ background: "rgba(255,255,255,0.04)" }}/></td>
                    <td>
                      <select className="select" value={p.urgente ? 'urgente' : 'normal'} onChange={e => { const newP = [...formData.pedidos]; newP[i].urgente = e.target.value === 'urgente'; setFormData({...formData, pedidos: newP}) }}>
                        <option value="normal">Normal</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button className="btn btn-secondary btn-sm mt-md" onClick={() => setFormData({...formData, pedidos: [...formData.pedidos, { codigo: '', descripcion: '', cantidad: 1, urgente: false }]})}>
            <Icon name="plus" size={12}/> Agregar pedido
          </button>
        </Accordion>

        <Accordion title="Trabajos pendientes y observaciones" icon="edit">
          <MicField
            defaultValue={formData.trabajos_pendientes || "Pendiente revisión del sistema eléctrico."}
            onChange={valor => setFormData(prev => ({ ...prev, trabajos_pendientes: valor, observaciones: valor }))}
          />
        </Accordion>

        <Accordion title="Backlog desde taller" icon="orders" badge={<><span className="badge cyan" style={{ marginLeft: 8 }}>Nuevo</span><IndicadorPendienteConexion/></>}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Registra cualquier hallazgo o trabajo pendiente para futuras OTs.</div>
          
          {showBacklogModal ? (
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, border: '1px solid #1e2d47', borderRadius: 8 }}>
              {/* Campos pre-llenados */}
              <div style={{ fontSize:'11px', color:'#64748b', marginBottom:'10px', padding:'8px 12px', background:'rgba(255,255,255,0.04)', borderRadius:'6px' }}>
                Equipo: <strong>{nuevoBacklog.equipo_id}</strong> ·
                OT origen: <strong>{nuevoBacklog.ot_origen_id}</strong> ·
                Reportado por: <strong>{nuevoBacklog.reportado_por}</strong>
              </div>

              <div className="field" style={{ marginBottom: 10 }}>
                <label>Sistema afectado *</label>
                <select className="select" value={nuevoBacklog.sistema} onChange={e => setNuevoBacklog({...nuevoBacklog, sistema: e.target.value})}>
                  <option>Hidráulico</option>
                  <option>Motor</option>
                  <option>Transmisión</option>
                  <option>Eléctrico</option>
                  <option>Estructura</option>
                  <option>Neumático</option>
                  <option>Otro</option>
                </select>
              </div>

              <div className="field" style={{ marginBottom: 10 }}>
                <label>Descripción del hallazgo *</label>
                <textarea className="input" placeholder="Describir el hallazgo técnico observado..." rows={3} value={nuevoBacklog.descripcion_hallazgo} onChange={e => setNuevoBacklog({...nuevoBacklog, descripcion_hallazgo: e.target.value})}/>
              </div>

              <div className="field" style={{ marginBottom: 10 }}>
                <label>Prioridad sugerida</label>
                <select className="select" value={nuevoBacklog.prioridad} onChange={e => setNuevoBacklog({...nuevoBacklog, prioridad: e.target.value})}>
                  <option value="normal">Normal</option>
                  <option value="urgente">Urgente</option>
                  <option value="emergencia">Emergencia</option>
                  <option value="planificable">Planificable</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => setShowBacklogModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={() => { setShowBacklogModal(false); setFormData({...formData, backlog_generado_id: 'BKL-NUEVO'}) }}>+ Guardar hallazgo</button>
              </div>
            </div>
          ) : (
            <>
              {formData.backlog_generado_id && (
                <div style={{ marginBottom: 10, padding: 10, background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 6, fontSize: 13 }}>
                  ✓ Backlog generado exitosamente.
                </div>
              )}
              <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center", color: "var(--cyan)", borderColor: "var(--cyan)" }} onClick={openBacklog}>
                <Icon name="plus" size={14}/> Reportar hallazgo adicional
              </button>
            </>
          )}
        </Accordion>

        {/* Resumen total del parte */}
        <div style={{
          background:'rgba(255,255,255,0.04)',
          border:'1px solid #1e2d47', borderRadius:'8px',
          padding:'14px 18px', marginBottom:'16px', marginTop: '16px'
        }}>
          <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'10px' }}>
            Resumen del parte — costos a imputar a la OT
          </div>
          <div style={{ display:'flex', gap:'32px', flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:'10px', color:'#475569' }}>Mano de obra</div>
              <div style={{ fontSize:'18px', fontWeight:700, color:'#06b6d4' }}>
                ${costoMOTotal.toFixed(2)}
              </div>
              <div style={{ fontSize:'10px', color:'#475569' }}>
                {totalHoras.toFixed(1)}h × ${costoHoraTecnico.toFixed(2)}/h
              </div>
            </div>
            <div>
              <div style={{ fontSize:'10px', color:'#475569' }}>Repuestos</div>
              <div style={{ fontSize:'18px', fontWeight:700, color:'#f59e0b' }}>
                ${totalRepuestos.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize:'10px', color:'#475569' }}>
                Total este parte
              </div>
              <div style={{ fontSize:'20px', fontWeight:700, color:'#f8fafc' }}>
                ${(costoMOTotal + totalRepuestos).toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize:'10px', color:'#475569' }}>Avance OT</div>
              <div style={{ fontSize:'18px', fontWeight:700, color:'#22c55e' }}>
                {formData.avance_ot_pct || 0}%
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: "center" }} onClick={() => onNav("partes-taller")}>Guardar borrador</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!sesionOperativa.permiteEscritura || guardandoParte} onClick={guardarParteReal}>{guardandoParte ? 'Enviando...' : 'Enviar a revisión'}</button>
        </div>
      </div>
      <FooterBrand/>
    </div>
  );
};

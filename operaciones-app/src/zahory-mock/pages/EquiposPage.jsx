import React, { useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';

const ESTADO_COLOR = {
  'Operativo': 'green', 'En mantenimiento': 'orange',
  'En taller': 'slate', 'Acondicionamiento': 'cyan', 'Inoperativo': 'red',
};

export const EquiposPage = () => {
  const equiposData = ZAHORY_SAC_DATA.equipos || [];
  const [selected, setSelected] = useState(equiposData[0] || {});
  const [detailTab, setDetailTab] = useState('ficha');
  const [showModal, setShowModal] = useState(false);
  const [nuevoEquipo, setNuevoEquipo] = useState({
    centro_costo_default: '',
    pm_intervalo_horas: '',
    horometro_actual: 0,
    horometro_ultimo_pm: 0
  });

  const getCCConfig = (cc) => {
    const configs = {
      'FLO-ALQ':  { bg:'rgba(245,158,11,0.12)',  color:'#f59e0b',
                    desc:'Flota & Alquileres — costo recuperable' },
      'OPS-INT':  { bg:'rgba(100,116,139,0.12)', color:'#94a3b8',
                    desc:'Operaciones internas — costo absorbido por la plataforma' },
      'PROD-MAE': { bg:'rgba(139,92,246,0.12)',  color:'#8b5cf6',
                    desc:'Producción / Maestranza' },
      'TRA-COM':  { bg:'rgba(59,130,246,0.12)',  color:'#3b82f6',
                    desc:'Transporte Comercial' },
    }
    return configs[cc] || { bg:'rgba(100,116,139,0.12)', color:'#64748b', desc:cc }
  }

  const calcHorasParaPM = (equipo) => {
    if (!equipo.horometro_ultimo_pm || !equipo.pm_intervalo_horas) return 9999;
    const proximo = equipo.horometro_ultimo_pm + equipo.pm_intervalo_horas;
    return proximo - (equipo.horometro_actual || 0);
  }
  
  const getPMColor = (horas) => {
    if (horas <= 0)   return '#ef4444';  // vencido
    if (horas <= 50)  return '#ef4444';  // crítico
    if (horas <= 150) return '#f59e0b';  // próximo
    return '#22c55e';                     // ok
  }

  const calcCostoTotalActivo = (ots) => {
    return ots?.reduce((sum, ot) => sum + (ot.costo_real || 0), 0) || 0;
  }
  
  const calcCostoRecuperable = (ots) => {
    return ots?.filter(ot => ot.cargo === 'Cliente_Contrato')
               .reduce((sum, ot) => sum + (ot.costo_real || 0), 0) || 0;
  }

  const propBadge = (p) => p === 'Empresa Operadora'
    ? <span className="badge navy"><span className="dot"/>Empresa operadora</span>
    : <span className="badge cyan"><span className="dot"/>Cliente</span>;

  return (
    <div className="page">
      {/* Modal Nuevo Equipo */}
      {showModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="card" style={{ width: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3>+ Nuevo equipo</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><Icon name="x" size={16} /></button>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: 14 }}>
                <label>Código de activo *</label>
                <input className="input" style={{ width: '100%', marginTop: 6 }} placeholder="Ej: JB-NEW-02" />
              </div>

              <div style={{ marginTop:'20px' }}>
                <div style={{ fontSize:'11px', color:'#64748b', fontFamily:'monospace',
                              textTransform:'uppercase', letterSpacing:'0.08em',
                              marginBottom:'12px', borderTop:'1px solid #1e2d47',
                              paddingTop:'16px' }}>
                  Clasificación financiera
                </div>

                <div style={{ marginBottom:'14px' }}>
                  <label>
                    Centro de Costo default *
                    <span style={{ display:'block', fontSize:'10px', color:'#64748b',
                                  fontWeight:400, marginTop:'2px' }}>
                      Todas las OTs de este equipo heredarán este CC automáticamente
                    </span>
                  </label>
                  <select
                    value={nuevoEquipo.centro_costo_default || ''}
                    onChange={e => setNuevoEquipo(p=>({...p, centro_costo_default:e.target.value}))}
                    required
                    style={{ marginTop:'6px', width:'100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', borderRadius: '4px' }}
                  >
                    <option value="">-- Seleccionar CC --</option>
                    <option value="FLO-ALQ">FLO-ALQ — Flota & Alquileres (equipo en contratos de renta)</option>
                    <option value="OPS-INT">OPS-INT — Operaciones Internas (equipo propio sin contrato)</option>
                    <option value="PROD-MAE">PROD-MAE — Producción / Maestranza</option>
                    <option value="TRA-COM">TRA-COM — Transporte Comercial</option>
                  </select>
                  {!nuevoEquipo.centro_costo_default && (
                    <div style={{ color:'#ef4444', fontSize:'11px', marginTop:'4px' }}>
                      El centro de costo es obligatorio.
                    </div>
                  )}
                </div>

                <div style={{ marginBottom:'14px' }}>
                  <label>
                    PM — Intervalo de mantenimiento (horas) *
                    <span style={{ display:'block', fontSize:'10px', color:'#64748b',
                                  fontWeight:400, marginTop:'2px' }}>
                      Cada cuántas horas se realiza el mantenimiento preventivo
                    </span>
                  </label>
                  <input
                    type="number"
                    value={nuevoEquipo.pm_intervalo_horas || ''}
                    onChange={e => setNuevoEquipo(p=>({...p, pm_intervalo_horas:parseInt(e.target.value)||0}))}
                    placeholder="ej: 250 o 500"
                    required
                    min="1"
                    className="input"
                    style={{ marginTop:'6px', width:'200px' }}
                  />
                </div>

                <div style={{ marginTop:'14px' }}>
                  <label>
                    Horómetro inicial *
                    <span style={{ display:'block', fontSize:'10px', color:'#64748b',
                                  fontWeight:400, marginTop:'2px' }}>
                      Horómetro al momento de registrar el equipo. 0 si es nuevo.
                    </span>
                  </label>
                  <input
                    type="number"
                    value={nuevoEquipo.horometro_actual || 0}
                    onChange={e => setNuevoEquipo(p=>({...p, horometro_actual:parseInt(e.target.value)||0, horometro_ultimo_pm:parseInt(e.target.value)||0}))}
                    placeholder="ej: 0"
                    required
                    min="0"
                    className="input"
                    style={{ marginTop:'6px', width:'200px' }}
                  />
                  <span style={{ fontSize:'11px', color:'#475569', marginLeft:'8px' }}>
                    horas
                  </span>
                </div>
              </div>
            </div>
            <div className="card-body" style={{ borderTop: '1px solid var(--card-border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => setShowModal(false)} disabled={!nuevoEquipo.centro_costo_default}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Equipos y Activos</h1>
          <div className="sub">Maestro de activos · Propietario · Horómetros · Estado operativo</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Icon name="plus" size={13}/> Nuevo equipo</button>
      </div>

      <div className="toolbar">
        <select className="select"><option>Proyecto: Todos</option></select>
        <select className="select">
          <option>Propietario: Todos</option>
          <option>Empresa Operadora</option>
          <option>Cliente</option>
        </select>
        <select className="select"><option>Estado: Todos</option></select>
        <div className="spacer"/>
        <input className="input" placeholder="Buscar equipo..." style={{ width: 250 }}/>
      </div>

      <div className="grid-2">
        {/* Lista de equipos */}
        <div className="card">
          <div className="card-header">
            <h3>Listado de activos</h3>
            <span className="chip" style={{ marginLeft: 'auto' }}>{equiposData.length} equipos</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Código</th><th>Marca / Modelo</th><th>Propietario</th>
                <th>Proyecto</th><th>Ubicación</th><th>HORÓMETRO</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {equiposData.map(eq => (
                <tr key={eq.id}
                  className="clickable"
                  style={{ background: selected.id === eq.id ? 'var(--cyan-soft)' : '' }}
                  onClick={() => { setSelected(eq); setDetailTab('ficha'); }}>
                  <td className="bold" style={{ color: 'var(--cyan)' }}>{eq.id}</td>
                  <td>
                    {eq.marca}
                    <br/><span className="muted" style={{ fontSize: 11 }}>{eq.tipo} · {eq.tipo_flota}</span>
                  </td>
                  <td>{propBadge(eq.propietario)}</td>
                  <td style={{ fontSize: 12 }}>{eq.proyecto}</td>
                  <td style={{ fontSize: 12 }}>{eq.ubicacion}</td>
                  <td>
                    {eq.horometro_actual > 0 ? (
                      <div>
                        <div style={{ fontWeight:600, fontSize:'13px', color:'#06b6d4', fontFamily:'monospace' }}>
                          {eq.horometro_actual.toLocaleString()} h
                        </div>
                        {(() => {
                          const horas = calcHorasParaPM(eq)
                          const color = getPMColor(horas)
                          return horas <= 150 ? (
                            <div style={{ fontSize:'9.5px', color, marginTop:'2px', fontWeight:600 }}>
                              {horas <= 0 ? '⚠ PM vencido' : `PM en ${horas}h`}
                            </div>
                          ) : null
                        })()}
                      </div>
                    ) : (
                      <span style={{ color:'#334155', fontSize:'12px' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${ESTADO_COLOR[eq.estadoOp] || 'slate'}`}>
                      <span className="dot"/>{eq.estadoOp}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm"><Icon name="edit" size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Panel de detalle */}
        <div>
          <div className="card mb-md">
            <div className="card-header" style={{ background: 'var(--navy)', color: 'white', borderRadius: '8px 8px 0 0' }}>
              <h3>Ficha: {selected.id}</h3>
              <div className="spacer"/>
              {propBadge(selected.propietario)}
              <span className={`badge ${ESTADO_COLOR[selected.estadoOp] || 'slate'}`} style={{ marginLeft: 6 }}>
                <span className="dot"/>{selected.estadoOp}
              </span>
            </div>

            {/* Sub-tabs del detalle */}
            <div className="tabs" style={{ borderTop: 'none' }}>
              <div className={'tab ' + (detailTab === 'ficha' ? 'active' : '')} onClick={() => setDetailTab('ficha')}>Ficha técnica</div>
              <div className={'tab ' + (detailTab === 'hora'  ? 'active' : '')} onClick={() => setDetailTab('hora')}>Horómetros</div>
              <div className={'tab ' + (detailTab === 'hist'  ? 'active' : '')} onClick={() => setDetailTab('hist')}>Historial OTs</div>
            </div>

            {/* Tab: Ficha técnica */}
            {detailTab === 'ficha' && (
              <div className="card-body">
                <div className="grid-2" style={{ gap: 12, fontSize: 13 }}>
                  {[
                    ['Marca / Modelo',     `${selected.marca} ${selected.modelo}`],
                    ['Tipo de flota',      selected.tipo_flota],
                    ['N° Serie',           selected.numero_serie],
                    ['Año de fabricación', selected.año_fabricacion],
                    ['Proyecto asignado',  selected.proyecto],
                    ['Contrato / OS',      selected.contrato_id],
                    ['Ubicación actual',   selected.ubicacion],
                    ['Criticidad',
                      <span className={`badge ${selected.criticidad === 'A' ? 'solid-red' : selected.criticidad === 'B' ? 'orange' : selected.criticidad === 'C' ? 'cyan' : 'slate'}`}>
                        {selected.criticidad} — {selected.criticidad === 'A' ? 'Crítico' : selected.criticidad === 'B' ? 'Alto' : selected.criticidad === 'C' ? 'Medio' : 'Bajo'}
                      </span>
                    ],
                    ['Propietario del activo', propBadge(selected.propietario)],
                    ['OT facturable al cliente',
                      <span className={`badge ${selected.ot_facturable ? 'green' : 'slate'}`}>
                        {selected.ot_facturable ? 'Sí — OT facturable' : 'No — OT de inversión'}
                      </span>
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
                      <div className="bold" style={{ marginTop: 2, background: 'rgba(255,255,255,0.04)', border: '1px solid #1e2d47', color: '#64748b', padding: '4px 8px', borderRadius: 4 }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop:'16px' }}>
                  <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace',
                                textTransform:'uppercase', letterSpacing:'0.08em',
                                marginBottom:'4px' }}>
                    Centro de Costo (heredado por OTs)
                  </div>
                  {(() => {
                    const cfg = getCCConfig(selected.centro_costo_default)
                    return (
                      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                        <span style={{
                          background:cfg.bg, color:cfg.color,
                          fontSize:'12px', fontFamily:'monospace', fontWeight:700,
                          padding:'4px 12px', borderRadius:'6px',
                          border:`1px solid ${cfg.color}44`
                        }}>
                          {selected.centro_costo_default}
                        </span>
                        <span style={{ fontSize:'11px', color:'#475569' }}>
                          {cfg.desc}
                        </span>
                      </div>
                    )
                  })()}
                </div>

                {selected.estadoOp === 'Acondicionamiento' && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--cyan-soft)', borderRadius: 6, fontSize: 12, color: 'var(--navy)', border: '1px solid var(--cyan)' }}>
                    <strong>OT de Acondicionamiento activa:</strong> OT-2026-054 · Ingreso facturable = $0.<br/>
                    El costo acumulado es la inversión de puesta en operación del activo propio de la empresa operadora.
                  </div>
                )}
              </div>
            )}

            {/* Tab: Horómetros */}
            {detailTab === 'hora' && (
              <div style={{ padding:'20px' }}>
                {/* Sección 1: Estado actual de horómetro */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', marginBottom:'24px' }}>
                  <div style={{ background:'rgba(6,182,212,0.06)', borderLeft:'3px solid #06b6d4', borderRadius:'0 8px 8px 0', padding:'14px' }}>
                    <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace', textTransform:'uppercase' }}>Horómetro actual</div>
                    <div style={{ fontSize:'28px', fontWeight:700, color:'#06b6d4', fontFamily:'monospace', marginTop:'4px' }}>
                      {(selected.horometro_actual || 0).toLocaleString()} h
                    </div>
                  </div>

                  <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:'8px', padding:'14px' }}>
                    <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace', textTransform:'uppercase' }}>Último PM realizado</div>
                    <div style={{ fontSize:'20px', fontWeight:700, color:'#f8fafc', fontFamily:'monospace', marginTop:'4px' }}>
                      {(selected.horometro_ultimo_pm || 0).toLocaleString()} h
                    </div>
                    <div style={{ fontSize:'10px', color:'#475569', marginTop:'2px' }}>
                      Intervalo: cada {selected.pm_intervalo_horas || 0}h
                    </div>
                  </div>

                  <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:'8px', padding:'14px' }}>
                    <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace', textTransform:'uppercase' }}>Próximo PM</div>
                    {(() => {
                      const horas = calcHorasParaPM(selected)
                      const color = getPMColor(horas)
                      return (
                        <>
                          <div style={{ fontSize:'20px', fontWeight:700, color, fontFamily:'monospace', marginTop:'4px' }}>
                            {horas <= 0 ? '⚠ Vencido' : `en ${horas.toLocaleString()} h`}
                          </div>
                          <div style={{ fontSize:'10px', color:'#475569', marginTop:'2px' }}>
                            A las {((selected.horometro_ultimo_pm || 0) + (selected.pm_intervalo_horas || 0)).toLocaleString()} h
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* Sección 2: Barra de progreso PM */}
                {(() => {
                  const horasUsadas = (selected.horometro_actual || 0) - (selected.horometro_ultimo_pm || 0);
                  const intHoras = selected.pm_intervalo_horas || 1;
                  const pct = Math.min(100, Math.max(0, (horasUsadas / intHoras) * 100));
                  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
                  return (
                    <div style={{ marginBottom:'24px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#64748b', marginBottom:'6px' }}>
                        <span>Avance hacia próximo PM</span>
                        <span style={{ color, fontWeight:600 }}>
                          {horasUsadas}h / {intHoras}h ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div style={{ height:'8px', background:'rgba(255,255,255,0.08)', borderRadius:'4px', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background: color, borderRadius:'4px', transition:'width 0.3s' }} />
                      </div>
                    </div>
                  )
                })()}

                {/* Sección 3: Historial de registros */}
                <div>
                  <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'12px' }}>
                    Historial de registros
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid #1e2d47' }}>
                        {['Fecha','Horómetro','Delta','Registrado por','Origen','Nota'].map(h => (
                          <th key={h} style={{ fontSize:'9.5px', color:'#475569', textAlign:'left', padding:'6px 8px', fontWeight:600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.historial_horometros?.map((reg, i) => (
                        <tr key={i} style={{ borderBottom:'1px solid #1e2d4744' }}>
                          <td style={{ fontSize:'11px', color:'#64748b', padding:'8px 8px', fontFamily:'monospace' }}>{reg.fecha}</td>
                          <td style={{ fontSize:'13px', fontWeight:700, color:'#06b6d4', padding:'8px 8px', fontFamily:'monospace' }}>{reg.valor.toLocaleString()} h</td>
                          <td style={{ fontSize:'11px', color:'#22c55e', padding:'8px 8px', fontFamily:'monospace' }}>{reg.delta > 0 ? `+${reg.delta}h` : '—'}</td>
                          <td style={{ fontSize:'11px', color:'#94a3b8', padding:'8px 8px' }}>{reg.registrado_por}</td>
                          <td style={{ padding:'8px 8px' }}><span style={{ fontSize:'9px', fontFamily:'monospace', background:'rgba(100,116,139,0.12)', color:'#64748b', padding:'1px 6px', borderRadius:'4px' }}>{reg.origen}</span></td>
                          <td style={{ fontSize:'10px', color:'#475569', padding:'8px 8px' }}>{reg.nota || '—'}</td>
                        </tr>
                      ))}
                      {!selected.historial_horometros?.length && (
                        <tr><td colSpan="6" style={{ fontSize:'11px', color:'#64748b', padding:'8px', textAlign:'center' }}>Sin registros.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab: Historial OTs */}
            {detailTab === 'hist' && (
              <div style={{ padding:'20px' }}>
                {/* Resumen de costos del activo */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'24px' }}>
                  <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:'8px', padding:'14px' }}>
                    <div style={{ fontSize:'10px', color:'#64748b', textTransform:'uppercase', fontFamily:'monospace' }}>OTs totales</div>
                    <div style={{ fontSize:'24px', fontWeight:700, color:'#f8fafc' }}>{selected.historial_ots?.length || 0}</div>
                  </div>
                  <div style={{ background:'rgba(34,197,94,0.06)', borderRadius:'8px', padding:'14px' }}>
                    <div style={{ fontSize:'10px', color:'#64748b', textTransform:'uppercase', fontFamily:'monospace' }}>Costo recuperable</div>
                    <div style={{ fontSize:'20px', fontWeight:700, color:'#22c55e' }}>${calcCostoRecuperable(selected.historial_ots).toLocaleString()}</div>
                    <div style={{ fontSize:'10px', color:'#475569' }}>Cargo cliente</div>
                  </div>
                  <div style={{ background:'rgba(245,158,11,0.06)', borderRadius:'8px', padding:'14px' }}>
                    <div style={{ fontSize:'10px', color:'#64748b', textTransform:'uppercase', fontFamily:'monospace' }}>Costo total activo</div>
                    <div style={{ fontSize:'20px', fontWeight:700, color:'#f59e0b' }}>${calcCostoTotalActivo(selected.historial_ots).toLocaleString()}</div>
                    <div style={{ fontSize:'10px', color:'#475569' }}>Todas las OTs</div>
                  </div>
                </div>

                {/* Tabla de OTs */}
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #1e2d47' }}>
                      {['OT','Tipo','Cargo','Apertura','Cierre','Costo real','Estado'].map(h => (
                        <th key={h} style={{ fontSize:'9.5px', color:'#475569', textAlign:'left', padding:'6px 8px', fontWeight:600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.historial_ots?.map((ot, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #1e2d4744', cursor:'pointer' }}>
                        <td style={{ fontSize:'11px', color:'#60a5fa', fontFamily:'monospace', padding:'8px 8px', fontWeight:500 }}>{ot.id}</td>
                        <td style={{ padding:'8px 8px' }}>
                          <span style={{ fontSize:'10px', fontWeight:600, color: ot.tipo === 'Preventivo_PM' ? '#3b82f6' : ot.tipo === 'Correctivo' ? '#f97316' : ot.tipo === 'Overhaul' ? '#8b5cf6' : '#94a3b8' }}>{ot.tipo}</span>
                        </td>
                        <td style={{ padding:'8px 8px' }}>
                          <span style={{ fontSize:'9px', fontFamily:'monospace', background: ot.cargo === 'Cliente_Contrato' ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)', color: ot.cargo === 'Cliente_Contrato' ? '#22c55e' : '#64748b', padding:'1px 6px', borderRadius:'4px', fontWeight:600 }}>
                            {ot.cargo === 'Cliente_Contrato' ? 'Cliente' : 'Interno'}
                          </span>
                        </td>
                        <td style={{ fontSize:'11px', color:'#64748b', padding:'8px 8px', fontFamily:'monospace' }}>{ot.fecha_apertura}</td>
                        <td style={{ fontSize:'11px', color:'#64748b', padding:'8px 8px', fontFamily:'monospace' }}>{ot.fecha_cierre || '—'}</td>
                        <td style={{ fontSize:'12px', fontWeight:600, color: ot.cargo !== 'Cliente_Contrato' ? '#f59e0b' : '#f8fafc', padding:'8px 8px', textAlign:'right', fontFamily:'monospace' }}>
                          {ot.costo_real > 0 ? `$${ot.costo_real.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ padding:'8px 8px' }}>
                          <span style={{ fontSize:'10px', fontWeight:500, color: ot.estado === 'cerrada' ? '#22c55e' : ot.estado === 'en_ejecucion' ? '#f59e0b' : '#64748b' }}>● {ot.estado}</span>
                        </td>
                      </tr>
                    ))}
                    {!selected.historial_ots?.length && (
                      <tr><td colSpan="7" style={{ fontSize:'11px', color:'#64748b', padding:'8px', textAlign:'center' }}>Sin historial de OTs registradas para este equipo.</td></tr>
                    )}
                  </tbody>
                </table>

                {/* Nota sobre costos no recuperables */}
                {selected.historial_ots?.some(ot => ot.cargo !== 'Cliente_Contrato') && (
                  <div style={{ marginTop:'16px', fontSize:'11px', color:'#64748b', borderTop:'1px solid #1e2d47', paddingTop:'12px' }}>
                    ⚠ Los costos en ámbar corresponden a OTs con cargo interno o Garantía — no son recuperables del cliente.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <FooterBrand/>
    </div>
  );
};

import { useState } from 'react'
import { ZAHORY_SAC_DATA as MOCK } from '../data.js'
import { FooterBrand, Icon } from '../components/shell.jsx'

const diasParaVencer = (fecha) => {
  const hoy = new Date('2026-06-01')
  const venc = new Date(fecha)
  return Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24))
}

// ── 1. HSEDashboard ───────────────────────────────────────────────────────────
export const HSEDashboard = ({ setCurrent }) => {
  const hse = MOCK.hse
  const k = hse.kpis

  const kpiCards = [
    { label: 'Accidentes',      valor: k.accidentes_mes,           cls: k.accidentes_mes === 0 ? 'kpi green-soft' : 'kpi red-soft',    icon: 'alert',  sub: 'Este mes' },
    { label: 'Casi accidentes', valor: k.casi_accidentes_mes,      cls: 'kpi cyan-soft',   icon: 'report', sub: 'Este mes' },
    { label: 'Inc. peligrosos', valor: k.incidentes_peligrosos_mes, cls: 'kpi',             icon: 'orders', sub: 'Este mes' },
    { label: 'PETARs vigentes', valor: k.petars_vigentes,          cls: 'kpi green-soft',  icon: 'check',  sub: 'Permisos activos' },
    { label: 'EPP vencido',     valor: k.epp_items_vencidos,       cls: k.epp_items_vencidos > 0 ? 'kpi red-soft' : 'kpi green-soft', icon: 'alert', sub: 'Ítems por reemplazar' },
    { label: 'Capacitaciones',  valor: k.capacitaciones_mes,       cls: 'kpi cyan-soft',   icon: 'report', sub: 'Este mes' },
  ]

  const alertas = [
    k.petars_vencidos > 0 && {
      color: 'red', texto: `${k.petars_vencidos} PETAR(s) vencido(s)`,
      accion: 'Ver PETARs →', ruta: 'permisos-trabajo'
    },
    k.epp_items_vencidos > 0 && {
      color: 'red', texto: `${k.epp_items_vencidos} EPP vencido(s)`,
      accion: 'Ver EPP →', ruta: 'epp-certificaciones'
    },
    k.epp_items_por_vencer > 0 && {
      color: 'orange', texto: `${k.epp_items_por_vencer} EPP por vencer en < 30 días`,
      accion: 'Ver EPP →', ruta: 'epp-certificaciones'
    },
    hse.incidentes?.some(i => i.estado === 'en_investigacion') && {
      color: 'orange', texto: 'Incidente en investigación pendiente de cierre',
      accion: 'Ver incidentes →', ruta: 'registro-incidentes'
    },
  ].filter(Boolean)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>HSE — Seguridad</h1>
          <div className="sub">Resumen ejecutivo de seguridad · {k.periodo}</div>
        </div>
      </div>

      {/* Banner días sin accidente */}
      <div className="card" style={{
        marginBottom: 16,
        background: k.accidentes_mes === 0 ? 'var(--green-soft)' : 'var(--red-soft)',
        borderColor: k.accidentes_mes === 0 ? '#CDE7CE' : '#F8D7D5',
        textAlign: 'center', padding: '28px 20px'
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '1px',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8
        }}>
          Días sin accidente
        </div>
        <div style={{
          fontSize: 64, fontWeight: 800, lineHeight: 1,
          color: k.accidentes_mes === 0 ? '#1B5E20' : '#B71C1C'
        }}>
          {k.dias_sin_accidente}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
          Meta del año: {k.dias_sin_accidente_meta} días
        </div>
      </div>

      {/* KPI grid */}
      <div className="report-kpi-grid">
        {kpiCards.map(kpi => (
          <div key={kpi.label} className={kpi.cls}>
            <div className="kpi-header">
              <div className="label">{kpi.label}</div>
              <div className="kpi-icon-wrap"><Icon name={kpi.icon} size={16}/></div>
            </div>
            <div className="value">{kpi.valor}</div>
            <div className="sub">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Alertas activas */}
      {alertas.length > 0 && (
        <div className="card">
          <div className="card-header">
            <Icon name="alert" size={14}/>
            <h3>Alertas activas</h3>
            <span className="hint">{alertas.length} alertas requieren atención</span>
          </div>
          <div className="card-body" style={{ padding: '4px 0' }}>
            {alertas.map((alerta, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '12px 20px',
                borderBottom: i < alertas.length - 1 ? '1px solid var(--card-border)' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`badge ${alerta.color}`}>
                    <span className="dot"/>
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{alerta.texto}</span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCurrent(alerta.ruta)}
                >
                  {alerta.accion}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <FooterBrand/>
    </div>
  )
}

// ── Helpers de estado compartidos ────────────────────────────────────────────
const PETAR_ESTADO_CFG = {
  vigente:    { cls: 'badge green',  label: 'Vigente'    },
  por_vencer: { cls: 'badge orange', label: 'Por vencer' },
  vencido:    { cls: 'badge red',    label: 'Vencido'    },
  suspendido: { cls: 'badge slate',  label: 'Suspendido' },
  cerrado:    { cls: 'badge slate',  label: 'Cerrado'    },
}
const getPetarCfg = (estado) => PETAR_ESTADO_CFG[estado] || { cls: 'badge slate', label: estado }

// ── 2. PermisosTrabajoHSE ────────────────────────────────────────────────────
export const PermisosTrabajoHSE = () => {
  const petars = MOCK.hse?.petars || []
  const [seleccionado, setSeleccionado] = useState(null)
  const [tab, setTab] = useState('todos')

  const tabs = [
    { id: 'todos',      label: 'Todos'      },
    { id: 'vigente',    label: 'Vigentes'   },
    { id: 'por_vencer', label: 'Por vencer' },
    { id: 'vencido',    label: 'Vencidos'   },
    { id: 'cerrado',    label: 'Cerrados'   },
  ]

  const filtered = tab === 'todos' ? petars : petars.filter(p => p.estado === tab)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Permisos de Trabajo</h1>
          <div className="sub">PETAR — Permiso Escrito de Trabajo de Alto Riesgo</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-cyan">
          <Icon name="plus" size={13}/> Nuevo PETAR
        </button>
      </div>

      {/* Tabs */}
      <div className="report-toolbar">
        <div className="report-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={'report-tab' + (tab === t.id ? ' active' : '')}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({t.id === 'todos' ? petars.length : petars.filter(p => p.estado === t.id).length})
            </button>
          ))}
        </div>
      </div>

      {filtered.map(petar => {
        const cfg = getPetarCfg(petar.estado)
        const firmasCompletas = petar.firmado_trabajador && petar.firmado_supervisor && petar.firmado_seguridad
        const expandido = seleccionado?.id === petar.id
        return (
          <div key={petar.id} className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
            <div
              onClick={() => setSeleccionado(expandido ? null : petar)}
              style={{ padding: '16px 20px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, color: 'var(--cyan)', fontWeight: 600 }}>
                      {petar.id}
                    </span>
                    <span className={cfg.cls}>
                      <span className="dot"/> {cfg.label}
                    </span>
                    {!firmasCompletas && (
                      <span className="badge orange">⚠ Firmas incompletas</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>
                    {petar.tipo}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    {petar.descripcion}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📍 {petar.area}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>👷 {petar.trabajadores.join(', ')}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{petar.fecha_emision}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{petar.hora_inicio} — {petar.hora_fin}</div>
                  {petar.ot_id && (
                    <div style={{ fontSize: 10, color: 'var(--cyan)', fontFamily: 'monospace', marginTop: 4 }}>
                      {petar.ot_id}
                    </div>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expandido ? '▲' : '▼'}</span>
                  </div>
                </div>
              </div>
            </div>

            {expandido && (
              <div style={{ borderTop: '1px solid var(--card-border)', padding: '16px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--red, #E53935)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                      Riesgos identificados
                    </div>
                    {petar.riesgos_identificados.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '3px 0', borderBottom: '1px solid var(--card-border)' }}>
                        ⚠ {r}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--green, #4CAF50)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                      Medidas de control
                    </div>
                    {petar.medidas_control.map((m, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '3px 0', borderBottom: '1px solid var(--card-border)' }}>
                        ✓ {m}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Firmas */}
                <div style={{ background: 'var(--row-alt)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                    Firmas requeridas
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[
                      { label: 'Trabajador', ok: petar.firmado_trabajador },
                      { label: 'Supervisor', ok: petar.firmado_supervisor },
                      { label: 'Seguridad',  ok: petar.firmado_seguridad  },
                    ].map(f => (
                      <span key={f.label} className={`badge ${f.ok ? 'green' : 'red'}`}>
                        <span className="dot"/> {f.ok ? '✓' : '✗'} {f.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <FooterBrand/>
    </div>
  )
}

// ── 3. RegistroIncidentes ────────────────────────────────────────────────────
const INC_SEV_CFG = {
  fatalidad:               { cls: 'badge solid-red',  label: 'Fatalidad'               },
  accidente_incapacitante: { cls: 'badge red',        label: 'Accidente incapacitante'  },
  accidente_leve:          { cls: 'badge orange',     label: 'Accidente leve'           },
  casi_accidente:          { cls: 'badge cyan',       label: 'Casi accidente'           },
  incidente_peligroso:     { cls: 'badge purple',     label: 'Incidente peligroso'      },
}
const getSev = (tipo) => INC_SEV_CFG[tipo] || { cls: 'badge slate', label: tipo }

export const RegistroIncidentes = () => {
  const incidentes = MOCK.hse?.incidentes || []
  const [seleccionado, setSeleccionado] = useState(null)
  const [tab, setTab] = useState('todos')

  const tabs = [
    { id: 'todos',           label: 'Todos'           },
    { id: 'en_investigacion',label: 'En investigación' },
    { id: 'cerrado',         label: 'Cerrados'         },
  ]
  const filtered = tab === 'todos' ? incidentes : incidentes.filter(i => i.estado === tab)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Registro de Incidentes</h1>
          <div className="sub">Clasificación DS 024-2016-EM · Causa raíz y acciones correctivas</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-cyan">
          <Icon name="plus" size={13}/> Reportar incidente
        </button>
      </div>

      <div className="report-toolbar">
        <div className="report-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={'report-tab' + (tab === t.id ? ' active' : '')}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({t.id === 'todos' ? incidentes.length : incidentes.filter(i => i.estado === t.id).length})
            </button>
          ))}
        </div>
      </div>

      {filtered.map(inc => {
        const sev = getSev(inc.tipo)
        const expandido = seleccionado?.id === inc.id
        return (
          <div key={inc.id} className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
            <div
              onClick={() => setSeleccionado(expandido ? null : inc)}
              style={{ padding: '16px 20px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, color: 'var(--cyan)', fontWeight: 600 }}>
                      {inc.id}
                    </span>
                    <span className={sev.cls}>{sev.label}</span>
                    <span className={`badge ${inc.estado === 'cerrado' ? 'green' : 'orange'}`}>
                      <span className="dot"/>
                      {inc.estado === 'cerrado' ? 'Cerrado' : 'En investigación'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                    {inc.descripcion.substring(0, 120)}{inc.descripcion.length > 120 ? '...' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inc.fecha}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inc.hora}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{inc.area}</div>
                </div>
              </div>
            </div>

            {expandido && (
              <div style={{ borderTop: '1px solid var(--card-border)', padding: '16px 20px' }}>
                <div style={{
                  background: '#FFEBEE', borderLeft: '3px solid var(--red, #E53935)',
                  borderRadius: '0 8px 8px 0', padding: '12px 14px', marginBottom: 14
                }}>
                  <div style={{ fontSize: 10, color: 'var(--red, #E53935)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                    Análisis de causas
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 6 }}>
                    <strong>Causa inmediata:</strong>{' '}{inc.causa_inmediata}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>
                    <strong>Causa raíz:</strong>{' '}{inc.causa_raiz}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--green, #4CAF50)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>
                  Acciones correctivas
                </div>
                {inc.acciones_correctivas.map((ac, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', padding: '8px 0',
                    borderBottom: '1px solid var(--card-border)', gap: 12
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{ac.accion}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {ac.responsable} · Límite: {ac.fecha_limite}
                      </div>
                    </div>
                    <span className={`badge ${ac.estado === 'completado' ? 'green' : 'orange'}`}>
                      <span className="dot"/>
                      {ac.estado === 'completado' ? '✓ Completado' : '⏳ Pendiente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <FooterBrand/>
    </div>
  )
}

// ── 4. EPPCertificaciones ────────────────────────────────────────────────────
export const EPPCertificaciones = () => {
  const hse = MOCK.hse
  const [trabajadorSel, setTrabajadorSel] = useState(null)

  const getEPPBadge = (estado) =>
    estado === 'vigente' ? 'badge green' : estado === 'por_vencer' ? 'badge orange' : 'badge red'
  const getEPPLabel = (estado) =>
    estado === 'vigente' ? 'Vigente' : estado === 'por_vencer' ? 'Por vencer' : 'Vencido'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>EPP &amp; Certificaciones</h1>
          <div className="sub">Control de equipos de protección personal por trabajador</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-secondary">
          <Icon name="download" size={13}/> Exportar
        </button>
      </div>

      {/* KPI row */}
      <div className="report-kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {[
          { label: 'Ítems vencidos', valor: hse.kpis.epp_items_vencidos,  cls: 'kpi red-soft',    icon: 'alert' },
          { label: 'Por vencer',     valor: hse.kpis.epp_items_por_vencer, cls: 'kpi orange-soft', icon: 'clock' },
          { label: 'Trabajadores',   valor: hse.epp_trabajadores.length,   cls: 'kpi green-soft',  icon: 'orders' },
        ].map(kpi => (
          <div key={kpi.label} className={kpi.cls}>
            <div className="kpi-header">
              <div className="label">{kpi.label}</div>
              <div className="kpi-icon-wrap"><Icon name={kpi.icon} size={16}/></div>
            </div>
            <div className="value">{kpi.valor}</div>
          </div>
        ))}
      </div>

      {hse.epp_trabajadores.map(trab => {
        const vencidos  = trab.epp_asignado.filter(e => e.estado === 'vencido')
        const porVencer = trab.epp_asignado.filter(e => e.estado === 'por_vencer')
        const expandido = trabajadorSel === trab.trabajador_id
        return (
          <div key={trab.trabajador_id} className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
            <div
              onClick={() => setTrabajadorSel(expandido ? null : trab.trabajador_id)}
              style={{ padding: '14px 20px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>
                    {trab.trabajador_nombre}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {trab.cargo}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {vencidos.length > 0 && (
                    <span className="badge red"><span className="dot"/> {vencidos.length} vencido(s)</span>
                  )}
                  {porVencer.length > 0 && (
                    <span className="badge orange"><span className="dot"/> {porVencer.length} por vencer</span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{expandido ? '▲' : '▼'}</span>
                </div>
              </div>
            </div>

            {expandido && (
              <div style={{ borderTop: '1px solid var(--card-border)' }}>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        {['EPP', 'Código', 'Entrega', 'Vencimiento', 'Estado'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trab.epp_asignado.map((epp, i) => {
                        const dias = diasParaVencer(epp.vencimiento)
                        const badgeCls = getEPPBadge(epp.estado)
                        const label   = getEPPLabel(epp.estado)
                        return (
                          <tr key={i}>
                            <td>
                              <span style={{ fontSize: 13, fontWeight: epp.estado !== 'vigente' ? 700 : 400 }}>
                                {epp.tipo}
                              </span>
                              {epp.talla && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
                                  T: {epp.talla}
                                </span>
                              )}
                            </td>
                            <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, color: 'var(--orange, #FF9800)' }}>
                              {epp.codigo}
                            </td>
                            <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{epp.fecha_entrega}</td>
                            <td>
                              <div style={{ fontSize: 11, fontWeight: 600 }}>{epp.vencimiento}</div>
                              {epp.estado !== 'vigente' && (
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {epp.estado === 'vencido' ? `Venció hace ${Math.abs(dias)}d` : `Vence en ${dias}d`}
                                </div>
                              )}
                            </td>
                            <td>
                              <span className={badgeCls}>
                                <span className="dot"/> {label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <FooterBrand/>
    </div>
  )
}

// ── 5. AnalisisRiesgoATS ─────────────────────────────────────────────────────
const ATS_ESTADO_CFG = {
  aprobado:             { cls: 'badge green',  label: 'Aprobado'             },
  pendiente_aprobacion: { cls: 'badge orange', label: 'Pendiente aprobación' },
  borrador:             { cls: 'badge slate',  label: 'Borrador'             },
  rechazado:            { cls: 'badge red',    label: 'Rechazado'            },
}
const getAtsCfg = (estado) => ATS_ESTADO_CFG[estado] || { cls: 'badge slate', label: estado }

export const AnalisisRiesgoATS = () => {
  const hse = MOCK.hse

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Análisis de Riesgo (ATS)</h1>
          <div className="sub">Análisis de Trabajo Seguro — registro previo a trabajos de alto riesgo</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-cyan">
          <Icon name="plus" size={13}/> Nuevo ATS
        </button>
      </div>

      {(hse.ats_registros || []).map(ats => {
        const firmado    = ats.firmado_tecnico && ats.firmado_supervisor
        const estadoCfg  = getAtsCfg(ats.estado)

        return (
          <div key={ats.id} className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, color: 'var(--cyan)', fontWeight: 600 }}>
                    {ats.id}
                  </span>
                  <span className={estadoCfg.cls}><span className="dot"/> {estadoCfg.label}</span>
                  {!firmado && <span className="badge orange">⚠ Firmas incompletas</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{ats.trabajo}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  {ats.equipo_id} · {ats.area} · {ats.tecnico}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {ats.fecha} · {ats.hora_inicio}
                <div style={{ fontFamily: 'monospace', color: 'var(--cyan)', marginTop: 3 }}>{ats.ot_id}</div>
              </div>
            </div>

            {/* Pasos */}
            <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--card-border)' }}>
              {ats.pasos.map(paso => (
                <div key={paso.paso} style={{
                  margin: '12px 0', padding: 12,
                  background: 'var(--row-alt)',
                  borderRadius: 8, borderLeft: '3px solid var(--cyan)'
                }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--navy)', marginBottom: 8 }}>
                    Paso {paso.paso}: {paso.descripcion}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(200px, 1fr))', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--red, #E53935)', textTransform: 'uppercase', fontFamily: 'monospace', marginBottom: 4, fontWeight: 700 }}>
                        Peligros
                      </div>
                      {paso.peligros.map((peligro, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--red, #E53935)', padding: '2px 0' }}>⚠ {peligro}</div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--green, #4CAF50)', textTransform: 'uppercase', fontFamily: 'monospace', marginBottom: 4, fontWeight: 700 }}>
                        Medidas de control
                      </div>
                      {paso.medidas_control.map((medida, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--green, #4CAF50)', padding: '2px 0' }}>✓ {medida}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {/* Firmas */}
              <div style={{
                display: 'flex', gap: 12, padding: '10px 12px',
                background: 'var(--row-alt)', borderRadius: 8,
                alignItems: 'center', flexWrap: 'wrap', marginTop: 4
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Firmas:</span>
                {[
                  { label: 'Técnico',    firmado: ats.firmado_tecnico    },
                  { label: 'Supervisor', firmado: ats.firmado_supervisor },
                ].map(f => (
                  <span key={f.label} className={`badge ${f.firmado ? 'green' : 'red'}`}>
                    <span className="dot"/> {f.firmado ? '✓' : '✗'} {f.label}
                  </span>
                ))}
                {!ats.firmado_supervisor && (
                  <button className="btn btn-green btn-sm" style={{ marginLeft: 'auto' }}>
                    Aprobar ATS
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
      <FooterBrand/>
    </div>
  )
}

// ── 6. ProtocoloLOTO ─────────────────────────────────────────────────────────
const LOTO_ESTADO_CFG = {
  activo:       { cls: 'badge red',   label: 'ACTIVO'       },
  desbloqueado: { cls: 'badge green', label: 'Desbloqueado' },
  anulado:      { cls: 'badge slate', label: 'Anulado'      },
}

export const ProtocoloLOTO = () => {
  const hse = MOCK.hse
  const activosCount = (hse.loto_registros || []).filter(l => l.estado === 'activo').length
  const [tab, setTab] = useState('todos')

  const tabs = [
    { id: 'todos',        label: 'Todos'         },
    { id: 'activo',       label: 'Activos'       },
    { id: 'desbloqueado', label: 'Desbloqueados' },
    { id: 'anulado',      label: 'Anulados'      },
  ]
  const registros = hse.loto_registros || []
  const filtered  = tab === 'todos' ? registros : registros.filter(l => l.estado === tab)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Protocolo LOTO</h1>
          <div className="sub">Bloqueo y Etiquetado de Energía Peligrosa (Lock Out / Tag Out)</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-cyan">
          <Icon name="plus" size={13}/> Nuevo LOTO
        </button>
      </div>

      {/* Alerta equipos bloqueados */}
      {activosCount > 0 && (
        <div className="card" style={{
          marginBottom: 16, padding: '12px 20px',
          background: 'var(--red-soft)', borderColor: '#F8D7D5',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <span style={{ fontSize: 13, color: '#B71C1C', fontWeight: 600 }}>
            {activosCount} equipo(s) con bloqueo LOTO activo — no operar sin autorización del técnico responsable
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="report-toolbar">
        <div className="report-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={'report-tab' + (tab === t.id ? ' active' : '')}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({t.id === 'todos' ? registros.length : registros.filter(l => l.estado === t.id).length})
            </button>
          ))}
        </div>
      </div>

      {filtered.map(loto => {
        const estadoCfg = LOTO_ESTADO_CFG[loto.estado] || { cls: 'badge slate', label: loto.estado }
        return (
          <div key={loto.id} className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, color: 'var(--cyan)', fontWeight: 600 }}>
                    {loto.id}
                  </span>
                  <span className={estadoCfg.cls}><span className="dot"/> {estadoCfg.label}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>
                  {loto.equipo_id} — {loto.motivo_trabajo}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  Técnico: {loto.tecnico} · Supervisor: {loto.supervisor}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {loto.tipo_energia.map(e => (
                    <span key={e} className="badge red" style={{ fontSize: 10 }}>{e}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                <div>{loto.fecha}</div>
                <div>Bloqueo: {loto.hora_bloqueo}</div>
                {loto.hora_desbloqueo && <div>Desbloqueo: {loto.hora_desbloqueo}</div>}
                {loto.petar_vinculado && (
                  <div style={{ color: 'var(--cyan)', fontFamily: 'monospace', marginTop: 4 }}>
                    {loto.petar_vinculado}
                  </div>
                )}
              </div>
            </div>

            {/* Puntos de bloqueo */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'monospace', marginBottom: 8, fontWeight: 700 }}>
                Puntos de bloqueo ({loto.puntos_bloqueo.length})
              </div>
              {loto.puntos_bloqueo.map((punto, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: '8px 10px',
                  background: 'var(--row-alt)',
                  borderRadius: 6, marginBottom: 6, gap: 12
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{punto.punto}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Dispositivo: {punto.dispositivo} · {punto.tecnico_responsable}
                    </div>
                  </div>
                  <span className={`badge ${punto.bloqueado ? 'red' : 'green'}`}>
                    <span className="dot"/>
                    {punto.bloqueado ? '🔒 Bloqueado' : '✓ Desbloqueado'}
                  </span>
                </div>
              ))}

              <div style={{
                marginTop: 10, fontSize: 12,
                color: loto.verificacion_cero_energia ? '#1B5E20' : '#B71C1C',
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                {loto.verificacion_cero_energia
                  ? '✓ Verificación de cero energía realizada'
                  : '⚠ Verificación de cero energía pendiente'}
              </div>

              {loto.estado === 'activo' && (
                <button className="btn btn-green btn-sm" style={{ marginTop: 10 }}>
                  Registrar desbloqueo
                </button>
              )}
            </div>
          </div>
        )
      })}
      <FooterBrand/>
    </div>
  )
}

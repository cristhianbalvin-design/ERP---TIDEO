import { useState as useS1 } from 'react';
import { Icon, fmt, fmt2, FooterBrand } from '../components/shell.jsx';
import { Donut, GroupedBars, MarginBars, CumulativeLines } from '../components/charts.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';

// =========================================================
// LOGIN
// =========================================================
export const LoginPage = ({ onLogin }) => {
  return (
    <div style={{ minHeight: "100vh", background: "#1A2B4A", display: "grid", placeItems: "center", padding: 20, position: "relative", overflow: "hidden" }}>
      {/* Subtle grid backdrop */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.06 }}>
        <defs>
          <pattern id="gridp" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#gridp)"/>
      </svg>
      <div className="card" style={{ width: 400, padding: 36, position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: "linear-gradient(135deg, #00BCD4, #0288A8)", display: "grid", placeItems: "center", color: "white", fontWeight: 800, fontSize: 22 }}>T</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1A2B4A", letterSpacing: 1.2 }}>TIDEO</div>
            <div style={{ fontSize: 11, color: "#607D8B", letterSpacing: 0.4 }}>ERP Activos Intensivos</div>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Email</label>
          <input className="input input-lg" defaultValue="c.balvin@tideo.tech"/>
        </div>
        <div className="field" style={{ marginBottom: 20 }}>
          <label>Contraseña</label>
          <input className="input input-lg" type="password" defaultValue="••••••••"/>
        </div>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", height: 44, fontSize: 14 }} onClick={() => onLogin("gerente")}>Ingresar</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
          <div style={{ flex: 1, height: 1, background: "#E0E0E0" }}/>
          <span style={{ fontSize: 11, color: "#607D8B", textTransform: "uppercase", letterSpacing: 0.8 }}>Acceso rápido</span>
          <div style={{ flex: 1, height: 1, background: "#E0E0E0" }}/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button className="btn btn-secondary" style={{ justifyContent: "center" }} onClick={() => onLogin("gerente")}>Entrar como Gerente</button>
          <button className="btn btn-secondary" style={{ justifyContent: "center" }} onClick={() => onLogin("tecnico")}>Entrar como Técnico</button>
        </div>
        <div style={{ textAlign: "center", fontSize: 10.5, color: "#607D8B", marginTop: 24, letterSpacing: 0.3 }}>Desarrollado por TIDEO Tech & Strategy</div>
      </div>
    </div>
  );
};

// ── Datos ejecutivos mock ──────────────────────────────────────────────────
const MESES_6       = ['Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr'];
const INGRESOS_6    = [89400, 94800, 101200, 108600, 111900, 125400];
const COSTOS_MNT_6  = [52000, 58400, 61200, 63800, 68400, 71200];

const ALERTAS_CRITICAS = [
  {
    nivel: 'rojo', tag: 'Riesgo Comercial',
    titulo: 'CT-2026-001 Nexa — Penalidad inminente',
    detalle: 'DMR actual: 84.0% · Meta contractual: 85.0% · Déficit: −1.0 pp',
    accion: 'Ver contrato', nav: 'contratos-rental',
  },
  {
    nivel: 'amarillo', tag: 'Cuello de Botella',
    titulo: 'DT-01 lleva 5 días esperando repuestos',
    detalle: 'Filtro hidráulico REP-4412-HYD sin stock · OT-2026-051 bloqueada',
    accion: 'Ver solicitud', nav: 'solicitudes',
  },
  {
    nivel: 'azul', tag: 'Aprobación Pendiente',
    titulo: '7 Partes Diarios sin aprobar para cierre operativo',
    detalle: 'Período Abril 2026 · Administración debe validar antes del cierre del mes',
    accion: 'Revisar partes', nav: 'partes-taller',
  },
  {
    nivel: 'amarillo', tag: 'Mantenimiento Preventivo',
    titulo: 'JB-24 alcanza PM en 85 horas',
    detalle: 'Horómetro actual: 15,200 h · Ventana recomendada: 15,285 h',
    accion: 'Crear OT', nav: 'crear-ot', tipo: 'pm',
    equipo_id: 'JB-24', horometro_actual: 15200,
  },
];

const ALERTA_COLS = {
  rojo:     { border:'#E53935', bg:'#FFF5F5', tag:'badge solid-red',  dot:'#E53935' },
  amarillo: { border:'#FF9800', bg:'#FFFBF0', tag:'badge orange',     dot:'#FF9800' },
  azul:     { border:'#1565C0', bg:'#EFF4FF', tag:'badge navy',       dot:'#1565C0' },
};

const ACTIVE_OT_STATES = new Set(['abierta', 'en_ejecucion', 'pendiente_partes']);

const isActiveOT = (ot) => ACTIVE_OT_STATES.has(ot.estado);

const getEquipoCC = (data, eq) =>
  data.equipos.find(e => e.cod === eq)?.centro_costo_default
  || data.dmrByEquipo.find(r => r.eq === eq)?.centro_costo_default
  || 'OPS-INT';

const ccBadgeClass = (cc) => {
  if (cc === 'FLO-ALQ') return 'orange';
  if (cc === 'OPS-INT') return 'slate';
  if (cc?.startsWith('PROD-')) return 'purple';
  return 'cyan';
};

const CCBadge = ({ cc }) => (
  <span className={`badge ${ccBadgeClass(cc)}`} style={{ fontSize: 10 }}>
    <span className="dot"/>{cc || '--'}
  </span>
);

// ── Mini sparkline SVG ─────────────────────────────────────────────────────
const Sparkline = ({ vals, color, up }) => {
  const w = 72, h = 24, min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display:'block' }}>
      <polyline points={pts} fill="none" stroke={up ? color : '#EF5350'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
};

// ── Gráfico barras mensual (Ingreso atribuible vs costo) ────────────────────────────
const MonthlyBars = () => {
  const [hover, setHover] = useS1(null);
  const W = 520, H = 200, padL = 58, padR = 12, padT = 12, padB = 36;
  const maxV = Math.max(...INGRESOS_6) * 1.1;
  const bw   = (W - padL - padR) / MESES_6.length;
  const barW = bw * 0.32;
  const y    = v => padT + (H - padT - padB) * (1 - v / maxV);
  const ticks = 4;
  return (
    <div style={{ position:'relative', overflowX:'auto' }}>
      <svg width={W} height={H} style={{ display:'block' }}>
        {/* grid lines */}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (maxV / ticks) * i;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#ECEFF1" strokeWidth={1}/>
              <text x={padL - 6} y={y(v) + 4} fontSize={9} fill="#90A4AE" textAnchor="end">
                {v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
              </text>
            </g>
          );
        })}
        {/* bars */}
        {MESES_6.map((mes, i) => {
          const cx  = padL + bw * i + bw / 2;
          const ing = INGRESOS_6[i], cos = COSTOS_MNT_6[i];
          const isHov = hover === i;
          return (
            <g key={mes}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor:'default' }}
            >
              {/* hover bg */}
              {isHov && <rect x={cx - bw/2} y={padT} width={bw} height={H - padT - padB} fill="#F0F4F8" rx={3}/>}
              {/* ingreso bar */}
              <rect x={cx - barW - 2} y={y(ing)} width={barW} height={H - padB - y(ing)} fill="var(--navy)" rx={2}
                opacity={hover === null || isHov ? 1 : 0.4}/>
              {/* costo bar */}
              <rect x={cx + 2} y={y(cos)} width={barW} height={H - padB - y(cos)} fill="#EF5350" rx={2}
                opacity={hover === null || isHov ? 1 : 0.4}/>
              {/* label mes */}
              <text x={cx} y={H - 6} fontSize={10} fill="#78909C" textAnchor="middle">{mes}</text>
              {/* hover values */}
              {isHov && (
                <>
                  <text x={cx - barW/2 - 2} y={y(ing) - 5} fontSize={9} fill="var(--navy)" textAnchor="middle" fontWeight={700}>
                    ${(ing/1000).toFixed(0)}k
                  </text>
                  <text x={cx + barW/2 + 2} y={y(cos) - 5} fontSize={9} fill="#E53935" textAnchor="middle" fontWeight={700}>
                    ${(cos/1000).toFixed(0)}k
                  </text>
                </>
              )}
            </g>
          );
        })}
        {/* margen line */}
        <polyline
          points={INGRESOS_6.map((ing, i) => {
            const cos = COSTOS_MNT_6[i];
            const cx  = padL + (i + 0.5) * bw;
            const margen = ing - cos;
            return `${cx},${y(margen)}`;
          }).join(' ')}
          fill="none" stroke="var(--cyan)" strokeWidth={2} strokeDasharray="4,3" strokeLinejoin="round"
        />
      </svg>
      {/* Leyenda */}
      <div style={{ display:'flex', gap:18, padding:'4px 0 0 48px', fontSize:11, color:'var(--text-muted)' }}>
        {[
          { color:'var(--navy)', label:'Ingreso atribuible (OTs cliente)' },
          { color:'#EF5350',     label:'Costos operativos' },
          { color:'var(--cyan)', label:'Margen neto', dash:true },
        ].map(l => (
          <span key={l.label} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <svg width={24} height={10}>
              {l.dash
                ? <line x1={0} y1={5} x2={24} y2={5} stroke={l.color} strokeWidth={2} strokeDasharray="4,3"/>
                : <rect x={0} y={1} width={24} height={8} fill={l.color} rx={2}/>
              }
            </svg>
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// =========================================================
// DASHBOARD
// =========================================================
export const DashboardPage = ({ onNav, setCurrentOT }) => {
  const [tab, setTab] = useS1("ops");
  const D = ZAHORY_SAC_DATA;
  const activeOts = D.otsDashboard.filter(isActiveOT);
  const activeInProgress = activeOts.filter(o => o.estado === 'en_ejecucion').length;
  const activePendingResources = activeOts.filter(o => o.estado === 'pendiente_partes').length;
  const activeInWorkshop = activeOts.filter(o => o.ubicacion === 'Taller').length;
  const currentWeekActive = activeOts.filter(o => o.semanaGestion === 'actual').length;
  const previousWeekActive = activeOts.filter(o => o.semanaGestion === 'anterior').length;
  const activeDelta = currentWeekActive - previousWeekActive;
  const activeTrendGood = activeDelta <= 0;
  const aperturaDias = [...new Set(D.otsDashboard.map(o => o.fechaApertura).filter(Boolean))].sort().slice(-7);
  const activeSparkVals = aperturaDias.map(day => D.otsDashboard.filter(o => o.fechaApertura === day && isActiveOT(o)).length);
  const dmrRows = D.dmrByEquipo.map(r => ({ ...r, cc: r.centro_costo_default || getEquipoCC(D, r.eq) }));
  const dmrCompactRows = [...dmrRows].sort((a, b) => a.dmr - b.dmr).slice(0, 3);

  const handleAlertAction = (alert) => {
    if (alert.tipo === 'pm') {
      const context = {
        equipo_id: alert.equipo_id,
        tipo_trabajo: 'Preventivo_PM',
        cargo_financiero: 'Cliente_Contrato',
        descripcion: `PM programado - Horometro: ${alert.horometro_actual}h`,
        origen: 'alerta_pm',
      };
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('zahory_crear_ot_context', JSON.stringify(context));
          window.__zahoryCrearOTContext = context;
        } catch {
          window.__zahoryCrearOTContext = context;
        }
      }
      onNav(alert.nav, context);
      return;
    }
    onNav(alert.nav);
  };

  // KPIs ejecutivos
  const execKpis = [
    {
      label:'OTs Activas',  unit:'OT',
      val:String(activeOts.length),
      trend: activeDelta === 0 ? '0' : String(Math.abs(activeDelta)),
      trendUp: activeDelta > 0,
      trendGood: activeTrendGood,
      trendNote:'vs semana anterior',
      subNode: (
        <>
          <div>{activeInProgress} En ejecucion · {activePendingResources} Pendiente recursos · {activeInWorkshop} En taller</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
            <Sparkline vals={activeSparkVals.length ? activeSparkVals : [0,0,0,0,0,0,0]} color={activeTrendGood ? '#7FD889' : '#EF5350'} up={activeTrendGood}/>
            <span>OTs abiertas ultimos 7 dias</span>
          </div>
        </>
      ),
      sub:'',
      sparkVals:activeSparkVals.length ? activeSparkVals : [0,0,0,0,0,0,0],
      accent: activeTrendGood ? '#1B5E20' : '#E53935',
      bg:'linear-gradient(135deg,#1A2B4A 0%,#1E3A5F 100%)', textCol:'white',
    },
    {
      label:'Disponibilidad Global (DMR)', unit:'%',
      val:'91.5%', trend:'−1.2 pp', trendUp:false, trendNote:'Riesgo penalidad en 1 contrato',
      sub:'Riesgo de penalidad · Nexa', sparkVals:[93,94,92,95,93,91], accent:'#E53935',
      bg:'#FFF5F5', textCol:'var(--navy)',
    },
    {
      label:'Capital Detenido (WIP)', unit:'USD',
      val:'$45,200', trend:'+8%', trendUp:false, trendNote:'Capital inmovilizado en taller',
      sub:'5 OTs esperando repuestos', sparkVals:[38,42,35,50,48,45], accent:'#C15D00',
      bg:'#FFF8F0', textCol:'var(--navy)',
    },
    {
      label:'Utilización de Flota', unit:'%',
      val:'85%', trend:'+3%', trendUp:true, trendNote:'vs semana anterior',
      sub:'12 de 15 equipos activos', sparkVals:[75,80,78,83,82,85], accent:'#1565C0',
      bg:'#EFF4FF', textCol:'var(--navy)',
    },
  ];

  return (
    <div className="page">
      {/* ── Cabecera ejecutiva ─────────────────────────────────────────── */}
      <div className="page-header" style={{ alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:.8, textTransform:'uppercase', color:'var(--text-muted)', marginBottom:2 }}>
            Mayo 2026 · TIDEO ERP
          </div>
          <h1 style={{ marginBottom:4 }}>Bienvenido, Administrador</h1>
          <div className="sub" style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span>Martes 13 de Mayo de 2026</span>
            <span style={{ color:'var(--card-border)' }}>·</span>
            <span style={{
              display:'inline-flex', alignItems:'center', gap:5,
              background:'#FFF5F5', color:'#C62828', fontWeight:700,
              padding:'2px 9px', borderRadius:20, fontSize:11,
              border:'1px solid #FFCDD2',
            }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#E53935', display:'inline-block' }}/>
              3 alertas críticas requieren atención
            </span>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexShrink:0, marginTop:4 }}>
          <button className="btn btn-secondary" onClick={() => onNav("costos")}>
            <Icon name="download" size={13}/> Reporte gerencial
          </button>
          <button className="btn btn-secondary" onClick={() => onNav("config")}>
            <Icon name="cog" size={13}/> Configuración
          </button>
          <button className="btn btn-cyan" onClick={() => onNav("crear-ot")}>
            <Icon name="plus" size={13}/> Nueva OT
          </button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom:18 }}>
        <div className={"tab " + (tab === "ops" ? "active" : "")} onClick={() => setTab("ops")}>Resumen ejecutivo</div>
        <div className={"tab " + (tab === "costos" ? "active" : "")} onClick={() => setTab("costos")}>Costos y rentabilidad</div>
        <div className={"tab " + (tab === "confiabilidad" ? "active" : "")} onClick={() => setTab("confiabilidad")}>Confiabilidad y eficiencia</div>
      </div>

      {tab === "ops" ? (
        <>
          {/* ── KPIs ejecutivos ─────────────────────────────────────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            {execKpis.map((k, i) => (
              <div key={i} style={{
                borderRadius:10, padding:'18px 20px',
                background: k.bg,
                border: k.textCol === 'white' ? 'none' : '1px solid var(--card-border)',
                boxShadow:'0 1px 4px rgba(0,0,0,0.07)',
                display:'flex', flexDirection:'column', gap:6,
              }}>
                <div style={{ fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:.6,
                  color: k.textCol === 'white' ? 'rgba(255,255,255,0.65)' : 'var(--text-muted)' }}>
                  {k.label}
                </div>
                <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
                  <div style={{
                    fontFamily:'ui-monospace,monospace', fontWeight:900, fontSize:26, lineHeight:1,
                    color: k.textCol === 'white' ? 'white' : k.accent,
                    letterSpacing:-1,
                  }}>
                    {k.val}
                  </div>
                  <Sparkline vals={k.sparkVals} color={k.textCol === 'white' ? '#4FC3F7' : k.accent} up={k.trendGood ?? k.trendUp}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:2 }}>
                  <span style={{
                    display:'inline-flex', alignItems:'center', gap:3,
                    fontSize:11, fontWeight:800, padding:'2px 7px', borderRadius:20,
                    background: (k.trendGood ?? k.trendUp) ? '#E8F5E9' : '#FFF3E0',
                    color:      (k.trendGood ?? k.trendUp) ? '#2E7D32' : '#C15D00',
                  }}>
                    {k.trendUp ? '▲' : '▼'} {k.trend}
                  </span>
                  <span style={{ fontSize:11, color: k.textCol === 'white' ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)' }}>
                    {k.trendNote}
                  </span>
                </div>
                <div style={{ fontSize:11.5, color: k.textCol === 'white' ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)', marginTop:1 }}>
                  {k.subNode || k.sub}
                </div>
              </div>
            ))}
          </div>

          {/* ── Gráfico + Alertas (grid 7 columnas: 4+3) ────────────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'4fr 3fr', gap:14, marginBottom:16, alignItems:'start' }}>

            {/* Izquierda — Ingreso atribuible vs costo 6 meses */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Ingreso atribuible vs. costo operativo</h3>
                  <div className="hint">Solo OTs con cargo Cliente_Contrato · Ultimos 6 meses · USD</div>
                </div>
                <div className="spacer"/>
                <button className="btn btn-ghost btn-sm" onClick={() => onNav("costos")}>
                  Análisis completo <Icon name="arrow" size={12}/>
                </button>
              </div>
              <div className="card-body" style={{ paddingTop:4 }}>
                <MonthlyBars/>
                {/* Resumen del período */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:16 }}>
                  {[
                    { label:'Ingreso atribuible Abr', val:'$125.4k', color:'var(--navy)' },
                    { label:'Costo operativo', val:'$71.2k', color:'#EF5350' },
                    { label:'Margen bruto', val:'$54.2k', color:'var(--cyan)', bold:true },
                  ].map(m => (
                    <div key={m.label} style={{
                      textAlign:'center', padding:'8px 0',
                      borderTop: m.bold ? '2px solid var(--cyan)' : '1px solid var(--card-border)',
                    }}>
                      <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>{m.label}</div>
                      <div style={{ fontFamily:'ui-monospace,monospace', fontWeight:800, fontSize:18, color:m.color, marginTop:3 }}>{m.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Derecha — Centro de Alertas */}
            <div className="card" style={{ height:'100%' }}>
              <div className="card-header" style={{ borderBottom:'1px solid var(--card-border)', paddingBottom:12 }}>
                <h3>Centro de Alertas</h3>
                <span style={{
                  marginLeft:'auto', background:'#E53935', color:'white',
                  fontWeight:800, fontSize:11, padding:'2px 8px', borderRadius:20,
                }}>{ALERTAS_CRITICAS.length}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column' }}>
                {ALERTAS_CRITICAS.map((a, i) => {
                  const cfg = ALERTA_COLS[a.nivel];
                  return (
                    <div key={i} style={{
                      padding:'13px 16px', borderBottom: i < ALERTAS_CRITICAS.length - 1 ? '1px solid var(--card-border)' : 'none',
                      display:'flex', flexDirection:'column', gap:5,
                      borderLeft: `3px solid ${cfg.border}`,
                      background: i === 0 ? cfg.bg : 'transparent',
                      transition:'background .12s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = cfg.bg; }}
                      onMouseLeave={e => { e.currentTarget.style.background = i === 0 ? cfg.bg : 'transparent'; }}
                    >
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span className={cfg.tag} style={{ fontSize:10, padding:'1px 7px', flexShrink:0 }}>
                          <span className="dot" style={{ background:cfg.dot }}/>{a.tag}
                        </span>
                      </div>
                      <div style={{ fontWeight:700, fontSize:13, color:'var(--navy)', lineHeight:1.3 }}>{a.titulo}</div>
                      <div style={{ fontSize:11.5, color:'var(--text-muted)', lineHeight:1.4 }}>{a.detalle}</div>
                      <button className="btn btn-ghost btn-sm" style={{ alignSelf:'flex-start', color:'var(--cyan)', padding:'2px 0', marginTop:2 }}
                        onClick={() => handleAlertAction(a)}>
                        {a.accion} <Icon name="arrow" size={11}/>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── DMR por equipo ───────────────────────────────────────────── */}
          <div className="grid-2" style={{ gridTemplateColumns:'2fr 1fr', marginBottom:16, alignItems:'start' }}>
            <div className="card">
              <div className="card-header">
                <h3>DMR por equipo - top 3</h3>
                <span className="hint">Equipos con DMR mas bajo del periodo</span>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft:'auto' }} onClick={() => setTab("confiabilidad")}>
                  Ver todos <Icon name="arrow" size={12}/>
                </button>
              </div>
              <DmrTable rows={dmrCompactRows} compact onDetail={() => onNav("consolidado")} />
            </div>

            <div className="card">
              <div className="card-header">
                <h3>Solicitudes urgentes</h3>
                <span className="badge solid-red" style={{ marginLeft:'auto' }}>3</span>
              </div>
              <div style={{ padding:'4px 8px 12px' }}>
                {D.solicitudesUrgentes.filter(s => s.tipo === "URGENTE").map((s, i) => (
                  <div key={i} style={{ padding:'10px 10px', borderBottom:'1px solid var(--card-border)', display:'flex', alignItems:'flex-start', gap:10 }}>
                    <span className="badge solid-red" style={{ flexShrink:0 }}>URGENTE</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, color:'var(--navy)' }}>{s.desc}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{s.tec} · {s.proy} · {s.fecha}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm">Atender</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-sm" style={{ width:'100%', justifyContent:'center', marginTop:10 }} onClick={() => onNav("solicitudes")}>
                  Ver todas las solicitudes
                </button>
              </div>
            </div>
          </div>

          {/* ── Backlog priorizado (compacto) ────────────────────────────── */}
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-header">
              <h3>Backlog · Trabajo pendiente</h3>
              <span className="hint">Ordenado por score de prioridad</span>
              <div style={{ display:'flex', gap:10, marginLeft:'auto' }}>
                {[
                  { label:'Emergencia', val: D.backlog.filter(b => b.prioridad === 'Emergencia').length, color:'#E53935', bg:'#FFF5F5' },
                  { label:'Urgentes',   val: D.backlog.filter(b => b.prioridad === 'Urgente').length,   color:'#C15D00', bg:'var(--orange-soft)' },
                  { label:'Listos OT',  val: D.backlog.filter(b => b.estado === 'Listo para OT').length, color:'#2E7D32', bg:'var(--green-soft)' },
                ].map(k => (
                  <div key={k.label} style={{ padding:'3px 12px', background:k.bg, borderRadius:20, fontSize:11, fontWeight:800, color:k.color }}>
                    {k.val} {k.label}
                  </div>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft:10 }} onClick={() => onNav("backlog")}>
                Ver todos <Icon name="arrow" size={12}/>
              </button>
            </div>
            <table className="tbl" style={{ fontSize:12.5 }}>
              <thead><tr><th>BKL</th><th>Equipo</th><th>Sistema</th><th style={{ maxWidth:280 }}>Hallazgo</th><th>Prioridad</th><th className="num">Score</th><th>Estado</th><th>Acción</th></tr></thead>
              <tbody>
                {[...D.backlog].sort((a,b) => b.score - a.score).slice(0,4).map(b => (
                  <tr key={b.bkl}>
                    <td className="ot-code">{b.bkl}</td>
                    <td className="bold">{b.eq}</td>
                    <td>{b.sistema}</td>
                    <td style={{ fontSize:12, lineHeight:1.4, maxWidth:280 }}>{b.hallazgo}</td>
                    <td>
                      {b.prioridad === "Emergencia"  && <span className="badge solid-red">EMERGENCIA</span>}
                      {b.prioridad === "Urgente"     && <span className="badge orange"><span className="dot"/>Urgente</span>}
                      {b.prioridad === "Normal"      && <span className="badge cyan"><span className="dot"/>Normal</span>}
                      {b.prioridad === "Planificable"&& <span className="badge slate"><span className="dot"/>Planificable</span>}
                    </td>
                    <td className="num"><span className="badge" style={{ background:'var(--navy)', color:'white', padding:'3px 8px' }}>{b.score}</span></td>
                    <td>
                      {b.estado === "Pend. Recursos" && <span className="badge orange"><span className="dot"/>Pend. recursos</span>}
                      {b.estado === "Listo para OT"  && <span className="badge green"><span className="dot"/>Listo para OT</span>}
                      {b.estado === "Pendiente"       && <span className="badge slate"><span className="dot"/>Pendiente</span>}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ color:'var(--cyan)' }} onClick={() => onNav('crear-ot')}>
                        <Icon name="orders" size={13}/> OT
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "confiabilidad" ? (
        <ConfiabilidadContent onNav={onNav} />
      ) : (
        <CostosContent onNav={onNav} setCurrentOT={setCurrentOT}/>
      )}
      <FooterBrand/>
    </div>
  );
};

const DmrTable = ({ rows, compact = false, onDetail }) => (
  <div style={{ overflowX:'auto' }}>
    <table className="tbl">
      <thead>
        {compact ? (
          <tr><th>Equipo</th><th>Proyecto</th><th>CC</th><th>DMR real</th><th>Estado</th><th>Detalle</th></tr>
        ) : (
          <tr><th>Equipo</th><th>Proyecto</th><th>CC</th><th>DMR real</th><th>DMP obj.</th><th>H.Rep</th><th>Estado</th><th>Detalle</th></tr>
        )}
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.eq}>
            <td className="ot-code">{r.eq}</td>
            <td>{r.proy}</td>
            <td><CCBadge cc={r.cc}/></td>
            <td className="mono">{r.dmr.toFixed(2)}%</td>
            {!compact && <td className="mono">{r.dmp.toFixed(2)}%</td>}
            {!compact && <td className="mono">{r.hrep.toFixed(2)}</td>}
            <td>
              {r.estado === "cumpliendo"   && <span className="badge green"><span className="dot"/>Cumpliendo</span>}
              {r.estado === "riesgo"       && <span className="badge orange"><span className="dot"/>En riesgo</span>}
              {r.estado === "incumpliendo" && <span className="badge red"><span className="dot"/>Incumpliendo</span>}
            </td>
            <td><button className="btn btn-ghost btn-sm" onClick={onDetail}>Detalle <Icon name="arrow" size={12}/></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const TrabajoTipoChart = ({ ots }) => {
  const typeRows = [
    { key:'Preventivo_PM', label:'Preventivo PM', color:'#4CAF50' },
    { key:'Correctivo', label:'Correctivo', color:'#FF9800' },
    { key:'Acondicionamiento', label:'Acondicionamiento', color:'#1565C0' },
    { key:'Overhaul', label:'Overhaul', color:'#9C27B0' },
  ].map(t => {
    const count = ots.filter(o => o.tipoTrabajo === t.key).length;
    return { ...t, count };
  });
  const total = typeRows.reduce((s, r) => s + r.count, 0);
  const pmPct = total ? (typeRows.find(r => r.key === 'Preventivo_PM').count / total) * 100 : 0;
  const pmOk = pmPct >= 60;
  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div className="card-header">
        <div>
          <h3>OTs por tipo de trabajo - periodo actual</h3>
          <div className="hint">Proporcion PM vs correctivo indica salud del programa de mantenimiento</div>
        </div>
          <span className={`badge ${pmOk ? 'green' : 'red'}`} style={{ marginLeft:'auto' }}>
          <span className="dot"/>Meta: &gt;= 60% preventivo. Hoy: {pmPct.toFixed(0)}%
        </span>
      </div>
      <div className="card-body">
        {typeRows.map(r => {
          const pct = total ? (r.count / total) * 100 : 0;
          return (
            <div key={r.key} style={{ display:'grid', gridTemplateColumns:'180px 1fr 70px', gap:12, alignItems:'center', marginBottom:10 }}>
              <div style={{ fontWeight:700, color:'var(--navy)' }}>{r.label}</div>
              <div style={{ height:20, background:'#F1F5F9', borderRadius:4, overflow:'hidden' }}>
                <div style={{ width:`${pct}%`, height:'100%', background:r.color, borderRadius:4 }}/>
              </div>
              <div className="mono" style={{ textAlign:'right', fontWeight:800 }}>{r.count} · {pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const BacklogPriorityTable = ({ backlog, onNav }) => {
  const openRows = backlog.filter(b => !['cerrado', 'descartado'].includes(String(b.estado || '').toLowerCase()));
  const priorities = [
    { key:'Emergencia', label:'Emergencia', badge:'red' },
    { key:'Urgente', label:'Urgente', badge:'orange' },
    { key:'Normal', label:'Normal', badge:'cyan' },
    { key:'Planificable', label:'Programable', badge:'slate' },
  ];
  const rows = priorities.map(p => {
    const items = openRows.filter(b => b.prioridad === p.key);
    const avg = items.length ? items.reduce((s, b) => s + Number(b.dias || 0), 0) / items.length : null;
    const oldest = [...items].sort((a, b) => Number(b.dias || 0) - Number(a.dias || 0))[0];
    return { ...p, count: items.length, avg, oldest };
  });
  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div className="card-header">
        <h3>Backlog abierto - por prioridad y dias sin resolver</h3>
        <span className="hint">Filtrado a hallazgos abiertos del periodo</span>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table className="tbl">
          <thead><tr><th>Prioridad</th><th className="num">Cantidad</th><th className="num">Promedio dias abierto</th><th>Mas antiguo</th><th>Accion</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const alertBg = (r.key === 'Emergencia' && r.avg > 1) ? 'var(--red-soft)' : (r.key === 'Urgente' && r.avg > 3) ? 'var(--orange-soft)' : 'transparent';
              return (
                <tr key={r.key} style={{ background: alertBg }}>
                  <td><span className={`badge ${r.badge}`}><span className="dot"/>{r.label}</span></td>
                  <td className="num mono">{r.count}</td>
                  <td className="num mono">{r.avg !== null ? `${r.avg.toFixed(1)} dias` : '--'}</td>
                  <td>{r.oldest ? `${r.oldest.bkl} - ${r.oldest.dias} dias` : '--'}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => onNav?.('backlog')}>Ver <Icon name="arrow" size={12}/></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DmrHistoricoChart = ({ data, dmp }) => {
  const [hover, setHover] = useS1(null);
  const equipos = ['JB-24', 'JB-26', 'SC-781', 'JB-DD311'].filter(eq => data.some(d => d[eq] !== undefined));
  const colors = { 'JB-24':'#3b82f6', 'JB-26':'#06b6d4', 'SC-781':'#f59e0b', 'JB-DD311':'#22c55e' };
  const W = 860, H = 280, padL = 52, padR = 24, padT = 18, padB = 38;
  const minY = 80, maxY = 100;
  const x = i => padL + (W - padL - padR) * (i / Math.max(data.length - 1, 1));
  const y = v => padT + (H - padT - padB) * (1 - ((v - minY) / (maxY - minY)));
  const linePath = eq => data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(d[eq])}`).join(' ');
  const hoverData = hover ? data[hover.i] : null;
  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div className="card-header">
        <div>
          <h3>Disponibilidad mecanica - ultimos 6 meses vs meta contractual</h3>
          <div className="hint">DMR por equipo principal con linea de DMP global</div>
        </div>
      </div>
      <div className="card-body" style={{ position:'relative', overflowX:'auto' }}>
        <svg width={W} height={H} style={{ display:'block' }}>
          {[80,85,90,95,100].map(t => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#ECEFF1"/>
              <text x={padL - 8} y={y(t) + 4} fontSize={10} fill="#607D8B" textAnchor="end">{t}%</text>
            </g>
          ))}
          <line x1={padL} x2={W - padR} y1={y(dmp)} y2={y(dmp)} stroke="rgba(26,43,74,0.5)" strokeDasharray="5,4" strokeWidth={2}/>
          <text x={W - padR} y={y(dmp) - 6} fontSize={10} fill="rgba(26,43,74,0.65)" textAnchor="end">Meta DMP {dmp.toFixed(2)}%</text>
          {data.map((d, i) => (
            <text key={d.mes} x={x(i)} y={H - 12} fontSize={10} fill="#607D8B" textAnchor="middle">{d.mes}</text>
          ))}
          {equipos.map(eq => (
            <path key={eq} d={linePath(eq)} fill="none" stroke={colors[eq]} strokeWidth={2.5} strokeLinejoin="round"/>
          ))}
          {equipos.map(eq => data.map((d, i) => (
            <circle key={`${eq}-${d.mes}`} cx={x(i)} cy={y(d[eq])} r={hover?.eq === eq && hover?.i === i ? 5 : 3.5} fill={colors[eq]} stroke="white" strokeWidth={1.5}
              onMouseEnter={() => setHover({ eq, i })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor:'pointer' }}/>
          )))}
        </svg>
        {hoverData && (
          <div className="tooltip-box" style={{ left: x(hover.i), top: 18 }}>
            <div className="bold">{hover.eq} · {hoverData.mes}</div>
            <div className="t-row"><span className="t-label">DMR</span><span className="t-val">{hoverData[hover.eq].toFixed(1)}%</span></div>
            <div className="t-row"><span className="t-label">DMP</span><span className="t-val">{dmp.toFixed(2)}%</span></div>
          </div>
        )}
        <div className="chart-legend">
          {equipos.map(eq => <div className="item" key={eq}><span className="sw" style={{ background:colors[eq] }}/><span>{eq}</span></div>)}
          <div className="item"><span className="sw" style={{ background:'rgba(26,43,74,0.45)' }}/><span>Meta DMP</span></div>
        </div>
      </div>
    </div>
  );
};

const ConfiabilidadContent = ({ onNav }) => {
  const D = ZAHORY_SAC_DATA;
  const rows = D.confiabilidad.map(r => ({
    ...r,
    mtbf: r.otsCorrectivas > 0 ? r.horasOperacion / r.otsCorrectivas : 0,
    mttr: r.otsCorrectivas > 0 ? r.paradasCorrectivas / r.otsCorrectivas : 0,
    mr: r.horasOperacion > 0 ? r.horasHombreMtto / r.horasOperacion : 0,
  })).sort((a, b) => a.mtbf - b.mtbf);
  const otsConRespuesta = D.otsCostos.filter(o => o.fechaAprobacionComercial && o.fechaPrimerLaborReal);
  const bajo24 = otsConRespuesta.filter(o => {
    const delta = (new Date(o.fechaPrimerLaborReal) - new Date(o.fechaAprobacionComercial)) / 36e5;
    return delta <= 24;
  }).length;
  const pct24 = otsConRespuesta.length ? (bajo24 / otsConRespuesta.length) * 100 : 0;
  const avgMtbf = rows.length ? rows.reduce((s,r)=>s+r.mtbf,0)/rows.length : 0;
  const avgMttr = rows.length ? rows.reduce((s,r)=>s+r.mttr,0)/rows.length : 0;
  const avgMr = rows.length ? rows.reduce((s,r)=>s+r.mr,0)/rows.length : 0;
  const mrBenchmark = avgMr < 0.20
    ? { label:'Optimo', color:'#1B5E20', bg:'var(--green-soft)' }
    : avgMr <= 0.30
      ? { label:'Aceptable', color:'#C15D00', bg:'var(--orange-soft)' }
      : { label:'Critico', color:'#B71C1C', bg:'var(--red-soft)' };
  const dmrRows = D.dmrByEquipo.map(r => ({ ...r, cc: r.centro_costo_default || getEquipoCC(D, r.eq) }));
  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi navy" title="Tiempo desde apertura de OT hasta primer parte diario registrado">
          <div className="label">Tiempo de respuesta &lt; 24H</div>
          <div className="value">{pct24.toFixed(0)}%</div>
          <div className="sub">OTs con primer parte registrado en menos de 24h</div>
        </div>
        <div className="kpi"><div className="kpi-header"><div className="label">MTBF promedio</div><div className="kpi-icon-wrap"><Icon name="activity" size={16}/></div></div><div className="value">{avgMtbf.toFixed(0)} <span style={{fontSize:14}}>h</span></div><div className="sub">Horas operacion / OTs correctivas</div></div>
        <div className="kpi"><div className="kpi-header"><div className="label">MTTR promedio</div><div className="kpi-icon-wrap"><Icon name="activity" size={16}/></div></div><div className="value">{avgMttr.toFixed(1)} <span style={{fontSize:14}}>h</span></div><div className="sub">Paradas correctivas / fallas</div></div>
        <div className="kpi" title="Maintenance Ratio = Horas de mantenimiento / Horas operativas. Valores menores indican mayor eficiencia del programa de mantenimiento. Referencia industria minera: < 0.20 optimo."><div className="kpi-header"><div className="label">Maintenance Ratio</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div>
          <div className="value">{avgMr.toFixed(2)}</div>
          <div className="sub">HH mantenimiento / horas operativas</div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:6, padding:'2px 8px', borderRadius:20, background:mrBenchmark.bg, color:mrBenchmark.color, fontSize:11, fontWeight:800 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:mrBenchmark.color, display:'inline-block' }}/>
            {mrBenchmark.label}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header">
          <h3>DMR por equipo</h3>
          <span className="hint">Disponibilidad mecanica real vs. programada</span>
        </div>
        <DmrTable rows={dmrRows} onDetail={() => onNav?.("consolidado")} />
      </div>

      <TrabajoTipoChart ots={D.otsDashboard} />
      <BacklogPriorityTable backlog={D.backlog} onNav={onNav} />
      <DmrHistoricoChart data={D.dmrHistorico || []} dmp={D.dmpContractual || 97.92} />

      <div className="card">
        <div className="card-header"><h3>Ranking peor MTBF</h3><span className="hint">Top 5 equipos con mas riesgo de confiabilidad</span></div>
        <table className="tbl">
          <thead><tr><th>Equipo</th><th className="num">Horas operacion</th><th className="num">OTs correctivas</th><th className="num">MTBF</th><th className="num">MTTR</th><th className="num">MR</th><th>Estado</th></tr></thead>
          <tbody>
            {rows.slice(0, 5).map(r => (
              <tr key={r.eq}>
                <td className="ot-code">{r.eq}</td>
                <td className="num mono">{r.horasOperacion}</td>
                <td className="num mono">{r.otsCorrectivas}</td>
                <td className="num mono bold" style={{ color: r.mtbf < 80 ? '#E53935' : r.mtbf < 120 ? '#FF9800' : '#4CAF50' }}>{r.mtbf.toFixed(1)} h</td>
                <td className="num mono">{r.mttr.toFixed(1)} h</td>
                <td className="num mono">{r.mr.toFixed(2)}</td>
                <td>{r.mtbf < 80 ? <span className="badge red"><span className="dot"/>Critico</span> : <span className="badge orange"><span className="dot"/>Monitorear</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// =========================================================
// COSTOS Y RENTABILIDAD  ⭐ PRIORIDAD
// =========================================================
const CostosContent = ({ onNav, setCurrentOT }) => {
  const D = ZAHORY_SAC_DATA;
  const [currency, setCurrency] = useS1("USD");
  const [period, setPeriod] = useS1("mes");
  const [project, setProject] = useS1("Todos");
  const [sortKey, setSortKey] = useS1("margen");
  const [sortDir, setSortDir] = useS1("desc");
  const [marginFilter, setMarginFilter] = useS1("todos");
  const [cargoFilter, setCargoFilter] = useS1("Todos");
  const fx = D.fx;

  const cargoLabel = (cargo) => ({
    Cliente_Contrato: "Cliente / Contrato",
    Interno_Zahory:   "Interno Zahory",
    Garantia_Fabrica: "Garantia Fabrica",
    Reclamo_Rework: "Reclamo Rework",
  }[cargo] || cargo || "Sin cargo");
  const trabajoLabel = (trabajo) => ({
    Preventivo_PM: "Preventivo PM",
    Correctivo: "Correctivo",
    Acondicionamiento: "Acondicionamiento",
    Overhaul: "Overhaul",
  }[trabajo] || trabajo || "Sin tipo");
  const cargoBadge = (cargo) => ({
    Cliente_Contrato: "green",
    Interno_Zahory:   "slate",
    Garantia_Fabrica: "orange",
    Reclamo_Rework: "red",
  }[cargo] || "slate");
  const isCliente = (cargo) => cargo === "Cliente_Contrato";

  const filtered = D.otsCostos
    .filter(o => project === "Todos" || o.proy === project)
    .filter(o => cargoFilter === "Todos" || o.tipoCargo === cargoFilter);

  const rows = filtered.map(o => {
    const ter = o.ter || 0;
    const costo = o.mo + o.mat + ter + o.tra;
    const costoEst = (o.moEst || 0) + (o.matEst || 0) + (o.terEst || 0) + (o.traEst || 0);
    const facturable = isCliente(o.tipoCargo);
    const ingreso = facturable ? o.ingreso : 0;
    const margenU = ingreso > 0 ? ingreso - costo : null;
    const margenP = ingreso > 0 ? (margenU / ingreso) * 100 : null;
    const desviacion = costo - costoEst;
    return { ...o, ter, cc: o.cc || getEquipoCC(D, o.eq), ingreso, facturable, costo, costoEst, margenU, margenP, desviacion };
  });

  const viewRows = rows.filter(r => marginFilter === "todos"
    || (marginFilter === "rent" && r.margenP !== null && r.margenP > 60)
    || (marginFilter === "riesgo" && (r.margenP === null || r.margenP < 30))
    || (marginFilter === "inversion" && !r.facturable));

  const sorted = [...viewRows].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (typeof a[sortKey] === "string") return a[sortKey].localeCompare(b[sortKey]) * dir;
    return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * dir;
  });

  const facturableRows = rows.filter(r => r.facturable);
  const totals = rows.reduce((a, r) => ({
    mo: a.mo + r.mo,
    mat: a.mat + r.mat,
    ter: a.ter + r.ter,
    tra: a.tra + r.tra,
    costo: a.costo + r.costo,
    ingreso: a.ingreso + r.ingreso,
    margenU: a.margenU + (r.margenU || -r.costo),
  }), { mo: 0, mat: 0, ter: 0, tra: 0, costo: 0, ingreso: 0, margenU: 0 });
  const margenPct = totals.ingreso > 0 ? (totals.margenU / totals.ingreso) * 100 : 0;
  const costoRetrabajo = rows.filter(r => r.tipoCargo === "Reclamo_Rework").reduce((s, r) => s + r.costo, 0);
  const reworkPct = totals.ingreso > 0 ? (costoRetrabajo / totals.ingreso) * 100 : 0;
  const reworkColor = reworkPct > 5 ? "#B71C1C" : reworkPct >= 2 ? "#C15D00" : "#1B5E20";
  const reworkBg = reworkPct > 5 ? "var(--red-soft)" : reworkPct >= 2 ? "var(--orange-soft)" : "var(--green-soft)";
  const otsConRespuesta = rows.filter(o => o.fechaAprobacionComercial && o.fechaPrimerLaborReal);
  const otsBajo24 = otsConRespuesta.filter(o => {
    const delta = (new Date(o.fechaPrimerLaborReal) - new Date(o.fechaAprobacionComercial)) / 36e5;
    return delta >= 0 && delta < 24;
  }).length;
  const approvePct = otsConRespuesta.length ? (otsBajo24 / otsConRespuesta.length) * 100 : 0;

  const donutData = [
    { label: "Mano de obra", value: totals.mo, color: "#3b82f6" },
    { label: "Repuestos e insumos", value: totals.mat, color: "#f59e0b" },
    { label: "Servicios de terceros", value: totals.ter, color: "#8b5cf6" },
    { label: "Logistica y viaticos", value: totals.tra, color: "#06b6d4" },
  ];
  const chartRows = rows.filter(r => r.facturable);
  const barsData = chartRows.map(r => ({ label: r.codigo.replace("OT-2026-", "OT-"), rev: r.ingreso, cost: r.costo, margin: r.margenP }));
  const marginBars = chartRows.map(r => ({ label: r.codigo.replace("OT-2026-", "OT-"), margin: r.margenP }));

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  return (
    <>
      <div style={{ marginBottom: 18, background: "white", border: "1px solid var(--card-border)", borderRadius: 8, padding: 14, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div className="row" style={{ gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Periodo</span>
          <div className="seg">
            {["hoy","semana","mes","custom"].map(p => (
              <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
                {p === "hoy" ? "Hoy" : p === "semana" ? "Esta semana" : p === "mes" ? "Este mes" : "Rango"}
              </button>
            ))}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Proyecto</span>
          <select className="select" value={project} onChange={e => setProject(e.target.value)} style={{ minWidth: 160 }}>
            {D.projects.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Cargo A</span>
          <select className="select" value={cargoFilter} onChange={e => setCargoFilter(e.target.value)} style={{ minWidth: 190 }}>
            <option value="Todos">Todos</option>
            <option value="Cliente_Contrato">Cliente / Contrato</option>
            <option value="Interno_Zahory">Interno Zahory</option>
            <option value="Garantia_Fabrica">Garantia Fabrica</option>
            <option value="Reclamo_Rework">Reclamo Rework</option>
          </select>
        </div>
        <div className="spacer"/>
        <div className="row" style={{ gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Moneda</span>
          <div className="seg">
            <button className={currency === "USD" ? "active" : ""} onClick={() => setCurrency("USD")}>USD</button>
            <button className={currency === "PEN" ? "active" : ""} onClick={() => setCurrency("PEN")}>PEN</button>
          </div>
        </div>
        <button className="btn btn-primary"><Icon name="download" size={14}/> Exportar reporte PDF</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi red-soft"><div className="label" style={{ color: "#B71C1C" }}>Costo total</div><div className="value" style={{ color: "#B71C1C" }}>{fmt(totals.costo, currency, fx)}</div><div className="sub">{rows.length} OTs del periodo</div></div>
        <div className="kpi green-soft"><div className="label" style={{ color: "#1B5E20" }}>Ingreso facturable</div><div className="value" style={{ color: "#1B5E20" }}>{fmt(totals.ingreso, currency, fx)}</div><div className="sub">Solo Cliente / Contrato</div></div>
        <div className="kpi navy"><div className="label">Margen bruto</div><div className="value">{fmt(totals.margenU, currency, fx)}</div><div className="sub" style={{ color: margenPct >= 0 ? "#7FD889" : "#FFCDD2", fontWeight: 700 }}>{margenPct.toFixed(1)}% margen</div></div>
        <div className="kpi"><div className="kpi-header"><div className="label">OTs del periodo</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value">{rows.length}</div><div className="sub">{facturableRows.length} facturables · {rows.filter(r => !r.facturable).length} sin ingreso</div></div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi" style={{ background: reworkBg, borderColor: reworkPct > 5 ? "#FFCDD2" : reworkPct >= 2 ? "#FFD9A8" : "#C8E6C9" }}>
          <div className="label" style={{ color: reworkColor }}>% de Retrabajo (Rework)</div>
          <div className="value" style={{ color: reworkColor }}>{reworkPct.toFixed(1)}%</div>
          <div className="sub">{fmt(costoRetrabajo, currency, fx)} / ingreso facturable total</div>
        </div>
        <div className="kpi navy" title="Tiempo desde apertura de OT hasta primer parte diario registrado">
          <div className="label">OTs iniciadas en &lt; 24H</div>
          <div className="value">{approvePct.toFixed(0)}%</div>
          <div className="sub">{otsBajo24} de {otsConRespuesta.length || 0} OTs respondidas en menos de 24 horas</div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
        <div className="card"><div className="card-header"><h3>Composicion del costo</h3><span className="hint">Del total del periodo</span></div><div className="card-body"><Donut data={donutData} currency={currency} fx={fx}/></div></div>
        <div className="card"><div className="card-header"><h3>Margen % por OT</h3><span className="hint">Solo Cliente / Contrato</span></div><div className="card-body"><MarginBars data={marginBars}/></div></div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Costo vs. ingreso por OT</h3><span className="hint">Solo Cliente / Contrato</span></div>
        <div className="card-body">
          <GroupedBars data={barsData} currency={currency} fx={fx}/>
          <div style={{ overflowX:'auto', marginTop:12 }}>
            <table className="tbl" style={{ fontSize:12 }}>
              <thead><tr><th>OT</th><th>Equipo</th><th>CC</th><th>Cargo</th><th className="num">Ingreso</th><th className="num">Costo</th><th className="num">Margen</th></tr></thead>
              <tbody>
                {chartRows.map(r => (
                  <tr key={r.codigo}>
                    <td className="ot-code">{r.codigo}</td>
                    <td>{r.eq}</td>
                    <td><CCBadge cc={r.cc}/></td>
                    <td><span className={`badge ${cargoBadge(r.tipoCargo)}`} style={{ fontSize:10 }}><span className="dot"/>{cargoLabel(r.tipoCargo)}</span></td>
                    <td className="num mono">{fmt(r.ingreso, currency, fx)}</td>
                    <td className="num mono">{fmt(r.costo, currency, fx)}</td>
                    <td className="num mono">{r.margenP.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}><div className="card-header"><h3>Evolucion acumulada del mes</h3><span className="hint">Ingreso atribuible vs. costo dia a dia</span></div><div className="card-body"><CumulativeLines data={D.monthDaily} currency={currency} fx={fx}/></div></div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Desviacion estimado vs. real por OT</h3><span className="hint">Verde = ahorro · Rojo = exceso sobre estimado</span></div>
        <div className="card-body">
          {rows.filter(r => r.costoEst > 0).map(r => {
            const desv = r.desviacion;
            const pct = Math.abs(desv / r.costoEst * 100);
            const isExceso = desv > 0;
            const barW = Math.min(pct * 2.5, 100);
            return (
              <div key={r.codigo} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8, fontSize:12 }}>
                <div style={{ width:110, textAlign:'right', fontFamily:'ui-monospace,monospace', fontWeight:600, color:'var(--navy)', flexShrink:0 }}>{r.codigo.replace('OT-2026-','OT-')}</div>
                <div style={{ flex:1, position:'relative', height:22, background:'#F1F5F9', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ position:'absolute', [isExceso?'left':'right']:0, width:`${barW}%`, height:'100%', background: isExceso ? '#EF5350' : '#66BB6A', opacity:0.85, borderRadius:4, transition:'width 0.5s' }}/>
                  <span style={{ position:'absolute', top:'50%', transform:'translateY(-50%)', [isExceso?'left':'right']: barW < 20 ? '105%' : 8, fontSize:10, fontWeight:700, color: barW < 20 ? (isExceso?'#E53935':'#2E7D32') : 'white' }}>{isExceso ? '+' : '-'}{fmt(Math.abs(desv), currency, fx)}</span>
                </div>
                <div style={{ width:50, textAlign:'right', fontSize:11, fontWeight:700, color: isExceso?'#E53935':'#2E7D32', flexShrink:0 }}>{isExceso?'+':'-'}{pct.toFixed(1)}%</div>
                {!r.facturable && <span className={`badge ${cargoBadge(r.tipoCargo)}`} style={{ fontSize:9, flexShrink:0 }}>{cargoLabel(r.tipoCargo)}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>OTs con desglose de costos</h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <div className="seg">
              <button className={marginFilter === "todos" ? "active" : ""} onClick={() => setMarginFilter("todos")}>Todos</button>
              <button className={marginFilter === "rent" ? "active" : ""} onClick={() => setMarginFilter("rent")}>Rentables &gt;60%</button>
              <button className={marginFilter === "riesgo" ? "active" : ""} onClick={() => setMarginFilter("riesgo")}>En riesgo &lt;30%</button>
              <button className={marginFilter === "inversion" ? "active" : ""} onClick={() => setMarginFilter("inversion")}>Sin ingreso</button>
            </div>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead><tr><th onClick={() => toggleSort("codigo")}>OT</th><th>Tipo Trabajo</th><th>Cargo A</th><th>Equipo</th><th>Proyecto</th><th>CC</th><th onClick={() => toggleSort("fecha")}>Fecha</th><th className="num" onClick={() => toggleSort("mo")}>MO</th><th className="num" onClick={() => toggleSort("mat")}>Materiales</th><th className="num" onClick={() => toggleSort("ter")}>Terceros</th><th className="num" onClick={() => toggleSort("tra")}>Logistica</th><th className="num" onClick={() => toggleSort("costo")}>Costo Total</th><th className="num" onClick={() => toggleSort("ingreso")}>Ingreso</th><th className="num" onClick={() => toggleSort("margenU")}>Margen</th><th onClick={() => toggleSort("margenP")}>%</th></tr></thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.codigo} className="clickable" style={{ background: !r.facturable ? 'rgba(255,152,0,0.05)' : 'transparent' }} onClick={() => { setCurrentOT(r.codigo); onNav("ot-detalle"); }}>
                  <td className="ot-code">{r.codigo}</td>
                  <td><span className="chip">{trabajoLabel(r.tipoTrabajo)}</span></td>
                  <td><span className={`badge ${cargoBadge(r.tipoCargo)}`} style={{ fontSize: 11 }}><span className="dot"/>{cargoLabel(r.tipoCargo)}</span></td>
                  <td>{r.eq}</td>
                  <td>{r.proy || <span className="muted">--</span>}</td>
                  <td><CCBadge cc={r.cc}/></td>
                  <td>{r.fecha}</td>
                  <td className="num mono">{fmt(r.mo, currency, fx)}</td>
                  <td className="num mono">{fmt(r.mat, currency, fx)}</td>
                  <td className="num mono">{fmt(r.ter, currency, fx)}</td>
                  <td className="num mono">{fmt(r.tra, currency, fx)}</td>
                  <td className="num mono bold">{fmt(r.costo, currency, fx)}</td>
                  <td className="num mono">{r.facturable ? fmt(r.ingreso, currency, fx) : <span className="muted" style={{fontSize:11}}>Sin ingreso</span>}</td>
                  <td className="num mono bold" style={{ color: r.margenP >= 60 ? "#4CAF50" : r.margenP >= 30 ? "#FF9800" : r.margenP === null ? "var(--text-muted)" : "#E53935" }}>{r.margenU !== null ? fmt(r.margenU, currency, fx) : <span className="muted">--</span>}</td>
                  <td>{r.margenP !== null ? <span className="badge" style={{ background: r.margenP >= 60 ? "var(--green-soft)" : r.margenP >= 30 ? "var(--orange-soft)" : "var(--red-soft)", color: r.margenP >= 60 ? "#1B5E20" : r.margenP >= 30 ? "#C15D00" : "#B71C1C" }}><span className="dot" style={{ background: r.margenP >= 60 ? "var(--green)" : r.margenP >= 30 ? "var(--orange)" : "var(--red)" }}/>{r.margenP.toFixed(1)}%</span> : <span className={`badge ${cargoBadge(r.tipoCargo)}`} style={{fontSize:10}}>{cargoLabel(r.tipoCargo)}</span>}</td>
                </tr>
              ))}
              <tr className="total-row"><td colSpan={7}>TOTALES</td><td className="num mono">{fmt(totals.mo, currency, fx)}</td><td className="num mono">{fmt(totals.mat, currency, fx)}</td><td className="num mono">{fmt(totals.ter, currency, fx)}</td><td className="num mono">{fmt(totals.tra, currency, fx)}</td><td className="num mono">{fmt(totals.costo, currency, fx)}</td><td className="num mono">{fmt(totals.ingreso, currency, fx)}</td><td className="num mono">{fmt(totals.margenU, currency, fx)}</td><td>{margenPct.toFixed(1)}%</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export const CostosPage = ({ onNav, setCurrentOT }) => (
  <div className="page">
    <div className="page-header">
      <div>
        <h1>Costos y rentabilidad</h1>
        <div className="sub">Análisis financiero de órdenes de trabajo · Tipo de cambio 1 USD = 3.745 PEN</div>
      </div>
    </div>
    <CostosContent onNav={onNav} setCurrentOT={setCurrentOT}/>
    <FooterBrand/>
  </div>
);

// =========================================================
// OT DETALLE
// =========================================================
export const OTDetallePage = ({ onNav, code }) => {
  const [currency, setCurrency] = useS1("USD");
  const [tab, setTab] = useS1("resumen");
  const D = ZAHORY_SAC_DATA;
  const fx = D.fx;
  const ot = D.otsCostos.find(o => o.codigo === code) || D.otsCostos[0];
  const fmtDateTime = (value) => value ? new Date(value).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '--';

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => onNav("ots")}><Icon name="back" size={14}/> Volver</button>
        <div>
          <h1 style={{ fontFamily: "ui-monospace, monospace", letterSpacing: 0 }}>{code || "OT-2026-0847"}</h1>
          <div className="sub">Correctivo · Sistema Hidráulico · Prioridad Urgente</div>
        </div>
        <span className="badge green" style={{ padding: "4px 10px", fontSize: 12 }}><span className="dot"/>Aprobada</span>
        <div className="spacer"/>
        <button className="btn btn-ghost"><Icon name="edit" size={13}/> Editar</button>
        <button className="btn btn-secondary"><Icon name="pdf" size={13}/> Generar PDF</button>
        <button className="btn btn-primary"><Icon name="check" size={13}/> Registrar aprobación comercial</button>
      </div>

      <div className="tabs">
        <div className={"tab " + (tab === "resumen" ? "active" : "")} onClick={() => setTab("resumen")}>Resumen General</div>
        <div className={"tab " + (tab === "segmentos" ? "active" : "")} onClick={() => setTab("segmentos")}>Segmentos y Operaciones</div>
        <div className={"tab " + (tab === "tareas" ? "active" : "")} onClick={() => setTab("tareas")}>Tareas y Personal</div>
        <div className={"tab " + (tab === "materiales" ? "active" : "")} onClick={() => setTab("materiales")}>Materiales e Insumos</div>
        <div className={"tab " + (tab === "paradas" ? "active" : "")} onClick={() => setTab("paradas")}>Gestión de Paradas</div>
      </div>

      {tab === "resumen" && (
        <>
          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div className="card">
              <div className="card-header"><h3>Información general</h3></div>
              <div className="card-body">
                <div className="grid-2" style={{ gap: 14 }}>
                  <div><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Equipo</div><div className="bold">JB-24 <span className="muted" style={{ fontWeight: 400 }}>· EPIROC SIMBA S7D</span></div></div>
                  <div><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Técnico Principal</div><div className="bold">Pajuelo E.</div></div>
                  <div><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Proyecto</div><div className="bold">Buenaventura</div></div>
                  <div><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Fecha</div><div className="bold">27/02/2026</div></div>
                  <div><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Turno</div><div className="bold">Día 08:00–20:00</div></div>
                  <div><div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Tipo</div><div className="bold">Correctivo</div></div>
                </div>
              </div>
            </div>
            
            <div>
              <div className="card mb-md">
                <div className="card-header"><h3>Tiempos y Control</h3><span className="hint">Solo lectura</span></div>
                <div className="card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Fecha Programada</div>
                    <div className="mono bold" style={{ marginTop: 5 }}>{ot?.fechaProgramadaInicio || "Pendiente"}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Aprobación Comercial</div>
                    <div className="mono bold" style={{ marginTop: 5 }}>{fmtDateTime(ot?.fechaAprobacionComercial)}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Fecha Real de Inicio</div>
                    {ot?.fechaPrimerLaborReal
                      ? <div className="mono bold" style={{ marginTop: 5 }}>{fmtDateTime(ot.fechaPrimerLaborReal)}</div>
                      : <span className="badge slate" style={{ marginTop: 5 }}>Pendiente</span>}
                  </div>
                </div>
              </div>

              <div className="card mb-md">
                <div className="card-header"><h3>Vinculos técnicos</h3></div>
                <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flex: 1, padding: 12, background: "var(--orange-soft)", border: "1px dashed var(--orange)", borderRadius: 6 }}>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 700 }}>BACKLOG VINCULADO</div>
                    <div className="bold" style={{ color: "var(--navy)", margin: "4px 0" }}>BKL-2026-085</div>
                    <div style={{ fontSize: 12 }}>Faro pirata delantero izquierdo quemado</div>
                  </div>
                  <Icon name="arrow" size={16}/>
                  <div style={{ flex: 1, padding: 12, background: "var(--green-soft)", border: "1px dashed var(--green)", borderRadius: 6 }}>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 700 }}>RESIDUAL (BACKLOG NUEVO)</div>
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }}><Icon name="plus" size={12}/> Generar residual</button>
                  </div>
                </div>
              </div>
              
              <div className="card">
                <div className="card-header"><h3>Horómetros (Al cierre de OT)</h3></div>
                <div className="card-body">
                  <table className="tbl" style={{ fontSize: 12 }}>
                    <thead><tr><th></th><th className="num">Inicial</th><th className="num">Final</th><th className="num">Delta</th></tr></thead>
                    <tbody>
                      <tr><td>H. Diesel</td><td className="num mono">3,450.0</td><td className="num mono">3,458.0</td><td className="num mono bold">8.0</td></tr>
                      <tr><td>H. Percusión 1</td><td className="num mono">1,200.0</td><td className="num mono">1,208.0</td><td className="num mono bold">8.0</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ background: "var(--navy)", color: "white", marginBottom: 14, border: "none" }}>
            <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <h3 style={{ margin: 0, color: "white", fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase" }}>Comparativa de Costos (Estimado vs Reservado vs Real)</h3>
              <div style={{ marginLeft: "auto" }}>
                <div className="seg" style={{ background: "rgba(255,255,255,0.1)" }}>
                  <button className={currency === "USD" ? "active" : ""} onClick={() => setCurrency("USD")} style={{ color: currency === "USD" ? "var(--navy)" : "#CBD5E1" }}>USD</button>
                  <button className={currency === "PEN" ? "active" : ""} onClick={() => setCurrency("PEN")} style={{ color: currency === "PEN" ? "var(--navy)" : "#CBD5E1" }}>PEN</button>
                </div>
              </div>
            </div>
            <div style={{ padding: "24px", overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 13, textAlign: "right" }}>
                <thead>
                  <tr style={{ color: "#8FA3AC", letterSpacing: 0.8, textTransform: "uppercase", fontSize: 11 }}>
                    <th style={{ textAlign: "left", paddingBottom: 12 }}>Concepto</th>
                    <th style={{ paddingBottom: 12 }}>Estimado (Planner)</th>
                    <th style={{ paddingBottom: 12 }}>Reservado (Logística)</th>
                    <th style={{ paddingBottom: 12, color: "white" }}>Real (Ejecutado)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ textAlign: "left", padding: "8px 0", color: "#CBD5E1" }}>Mano de obra</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(200, currency, fx)}</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(222, currency, fx)}</td>
                    <td className="mono" style={{ color: "white" }}>{fmt2(222, currency, fx)}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: "left", padding: "8px 0", color: "#CBD5E1" }}>Repuestos e Insumos</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(450, currency, fx)}</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(510, currency, fx)}</td>
                    <td className="mono" style={{ color: "white" }}>{fmt2(490, currency, fx)}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: "left", padding: "8px 0", color: "#CBD5E1" }}>Terceros / Transporte</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(50, currency, fx)}</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(60, currency, fx)}</td>
                    <td className="mono" style={{ color: "white" }}>{fmt2(60, currency, fx)}</td>
                  </tr>
                  <tr><td colSpan={4} style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 8 }}/></tr>
                  <tr>
                    <td style={{ textAlign: "left", padding: "4px 0", fontWeight: 700 }}>COSTO TOTAL</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(700, currency, fx)}</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(792, currency, fx)}</td>
                    <td className="mono bold" style={{ color: "white", fontSize: 15 }}>{fmt2(772, currency, fx)}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: "left", padding: "4px 0", fontWeight: 700 }}>INGRESO PROYECTADO</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(6500, currency, fx)}</td>
                    <td className="mono" style={{ color: "#8FA3AC" }}>{fmt2(6500, currency, fx)}</td>
                    <td className="mono bold" style={{ color: "#7FD889", fontSize: 15 }}>{fmt2(6800, currency, fx)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="card">
            <div className="card-header"><h3>Firmas y aprobaciones</h3></div>
            <div className="card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {[
                { rol: "Técnico Ejecutor", nombre: "Pajuelo Jurado E.", fecha: "27/02/2026 20:15", ok: true },
                { rol: "Supervisor",       nombre: "García Quispe R.", fecha: "27/02/2026 21:05", ok: true },
                { rol: "Rep. Cliente",     nombre: "Anderson R.",      fecha: "Pendiente",        ok: false },
              ].map((s, i) => (
                <div key={i} style={{ border: "1.5px dashed var(--card-border)", borderRadius: 8, padding: 16, background: s.ok ? "var(--green-soft)" : "#FFF3E0" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{s.rol}</div>
                  <div style={{ fontWeight: 700, color: "var(--navy)", marginTop: 6, fontSize: 14 }}>{s.nombre}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
                    {s.ok
                      ? <><Icon name="check" size={14} stroke={2.5}/><span>{s.fecha}</span></>
                      : <><Icon name="alert" size={14}/><span>{s.fecha}</span></>}
                  </div>
                  {!s.ok && <button className="btn btn-sm" style={{ marginTop: 12, background: "var(--orange)", color: "white" }}>Aprobar</button>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "segmentos" && (
        <div className="card">
          <div className="card-header">
            <h3>Datos de la ejecucion por segmentos</h3>
            <span className="hint">Materiales y HH cargan al segmento, no a la OT general</span>
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}><Icon name="plus" size={12}/> Segmento</button>
          </div>
          <div style={{ padding: 14 }}>
            {(D.otSegmentos.filter(s => s.otId === (code || "OT-2026-050")).length ? D.otSegmentos.filter(s => s.otId === (code || "OT-2026-050")) : D.otSegmentos.slice(0, 1)).map(seg => {
              const job = D.standardJobs.find(j => j.id === seg.standardJobId);
              const ops = D.otOperaciones.filter(op => op.segmentoId === seg.id);
              return (
                <div key={seg.id} style={{ border: "1px solid var(--card-border)", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", background: "#F8FAFC", display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="ot-code">{seg.numeroSegmento}</span>
                    <b>{seg.descripcion}</b>
                    <span className={`badge ${seg.tipoCargo === "Cliente_Contrato" ? "green" : seg.tipoCargo === "Garantia_Fabrica" ? "orange" : seg.tipoCargo === "Reclamo_Rework" ? "red" : "slate"}`} style={{ marginLeft: "auto" }}>{seg.tipoCargo}</span>
                    {job && <span className="badge cyan"><span className="dot"/>{job.codigo}</span>}
                  </div>
                  <table className="tbl" style={{ fontSize: 12 }}>
                    <thead><tr><th>Operacion</th><th>Descripcion</th><th className="num">HH estimadas</th><th>Repuestos planificados</th></tr></thead>
                    <tbody>
                      {ops.map((op, i) => (
                        <tr key={op.id}>
                          <td className="ot-code">{op.numeroOperacion}</td>
                          <td>{op.descripcion}</td>
                          <td className="num mono">{i === 0 ? (job?.horasEstimadasMo || 4) : "—"}</td>
                          <td>{i === 0 && job?.repuestosDefault.map(r => <span key={r.codigo} className="chip" style={{ marginRight: 4 }}>{r.codigo} x {r.cantidad}</span>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
          <div className="card-body" style={{ borderTop: "1px solid var(--card-border)", fontSize: 12 }}>
            <b>Checklist cierre tecnico:</b> <span className="badge red" style={{ marginLeft: 6 }}>ECM / graficos diagnostico obligatorio</span>
          </div>
        </div>
      )}

      {tab === "tareas" && (() => {
        const laborRows = [
          {
            tec: 'Pajuelo E.', esp: 'Mecatrónico',
            tarea: 'Desmontaje de cilindro hidráulico. Cambio de kit de sellos.',
            ini: '08:00', fin: '16:00', hrs: 8.0,
            parte_diario_id: 'PT-2026-041',
          },
          {
            tec: 'Pajuelo E.', esp: 'Mecatrónico',
            tarea: 'Pruebas de presión y ajustes.',
            ini: '16:00', fin: '18:00', hrs: 2.0,
            parte_diario_id: null, // ajuste manual, sin parte vinculado
          },
        ];
        return (
          <div className="card">
            <div className="card-header">
              <h3>Personal y Tareas Ejecutadas</h3>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}>
                <Icon name="plus" size={12}/> Tarea
              </button>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 136 }}>Nº Parte</th>
                  <th>Técnico</th>
                  <th>Especialidad</th>
                  <th>Tarea Realizada</th>
                  <th className="num">H. Inicio</th>
                  <th className="num">H. Fin</th>
                  <th className="num">Total Hrs</th>
                </tr>
              </thead>
              <tbody>
                {laborRows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.parte_diario_id ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Ver detalle del Parte Diario"
                          onClick={() => onNav('partes-taller')}
                          style={{
                            fontFamily: 'ui-monospace,monospace', fontSize: 11.5,
                            color: 'var(--cyan)', padding: '2px 6px',
                            textDecoration: 'underline', textUnderlineOffset: 3,
                          }}
                        >
                          {r.parte_diario_id}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12, paddingLeft: 6 }}>—</span>
                      )}
                    </td>
                    <td className="bold">{r.tec}</td>
                    <td>{r.esp}</td>
                    <td style={{ fontSize: 13 }}>{r.tarea}</td>
                    <td className="num mono">{r.ini}</td>
                    <td className="num mono">{r.fin}</td>
                    <td className="num mono bold">{r.hrs.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {tab === "materiales" && (() => {
        const matRows = [
          { cod: 'REP-4412-HYD', desc: 'Filtro hidráulico EPIROC', est: 1, res: 1, con: 1, vales: 'Despachado',    valesCls: 'green',  parte_diario_id: 'PT-2026-041' },
          { cod: 'INS-0088-AH5', desc: 'Aceite hidráulico 5L',     est: 2, res: 2, con: 1, vales: 'Devolución 1 ud', valesCls: 'orange', parte_diario_id: 'PT-2026-041' },
          { cod: 'REP-2201-AIR', desc: 'Filtro de aire',           est: 2, res: 2, con: 2, vales: 'Despachado',    valesCls: 'green',  parte_diario_id: null },
        ];
        const ParteLink = ({ id }) => id ? (
          <button
            className="btn btn-ghost btn-sm"
            title="Ver detalle del Parte Diario"
            onClick={() => onNav('partes-taller')}
            style={{
              fontFamily: 'ui-monospace,monospace', fontSize: 11.5,
              color: 'var(--cyan)', padding: '2px 6px',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            {id}
          </button>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 12, paddingLeft: 6 }}>—</span>
        );
        return (
          <div className="card">
            <div className="card-header">
              <h3>Materiales, Repuestos e Insumos</h3>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}>
                <Icon name="plus" size={12}/> Material
              </button>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 136 }}>Nº Parte</th>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th className="num">Estimado</th>
                  <th className="num">Reservado</th>
                  <th className="num">Consumido</th>
                  <th>Estado Vales</th>
                </tr>
              </thead>
              <tbody>
                {matRows.map((r, i) => (
                  <tr key={i}>
                    <td><ParteLink id={r.parte_diario_id}/></td>
                    <td className="ot-code">{r.cod}</td>
                    <td>{r.desc}</td>
                    <td className="num mono">{r.est}</td>
                    <td className="num mono">{r.res}</td>
                    <td className="num mono bold" style={{ color: 'var(--cyan)' }}>{r.con}</td>
                    <td><span className={`badge ${r.valesCls}`}>{r.vales}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {tab === "paradas" && (
        <div className="card">
          <div className="card-header">
            <h3>Gestión de Paradas (Afecta DMR)</h3>
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}><Icon name="plus" size={12}/> Parada</button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Tipo de Parada</th>
                <th>Sistema</th>
                <th>Motivo / Componente</th>
                <th className="num">Inicio</th>
                <th className="num">Fin</th>
                <th className="num">Duración</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="badge red"><span className="dot"/>Correctivo</span></td>
                <td>Hidráulico</td>
                <td>Fuga de aceite en cilindro de levante</td>
                <td className="num mono">08:00</td>
                <td className="num mono">14:00</td>
                <td className="num mono bold">6.0 hrs</td>
              </tr>
              <tr>
                <td><span className="badge orange"><span className="dot"/>Preventivo</span></td>
                <td>Filtros</td>
                <td>Cambio de filtros programado</td>
                <td className="num mono">14:00</td>
                <td className="num mono">16:00</td>
                <td className="num mono bold">2.0 hrs</td>
              </tr>
            </tbody>
          </table>
          <div className="card-body muted" style={{ fontSize: 12, borderTop: "1px solid var(--card-border)" }}>
            * Las horas de parada "Correctivas" (H.Rep) impactan negativamente el cálculo de Disponibilidad Mecánica Real (DMR) del equipo.
          </div>
        </div>
      )}

      <FooterBrand/>
    </div>
  );
};

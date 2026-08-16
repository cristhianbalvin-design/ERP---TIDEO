import { useMemo, useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';

const TODAY = '2026-05-27';

const OF_STATES = {
  borrador: { label: 'Borrador', badge: 'slate' },
  en_ingenieria: { label: 'En ingenieria', badge: 'purple' },
  aprobada: { label: 'Aprobada', badge: 'cyan' },
  en_produccion: { label: 'En produccion', badge: 'orange' },
  en_calidad: { label: 'En calidad', badge: 'orange' },
  rechazada_qc: { label: 'Rechazada QC', badge: 'red' },
  lista_entrega: { label: 'Lista para entrega', badge: 'green' },
  entregada: { label: 'Entregada', badge: 'green' },
  cerrada: { label: 'Cerrada', badge: 'green' },
  garantia_zahory: { label: 'Garantía interna', badge: 'purple' },
};

const OT_STATES = {
  pendiente: { label: 'Pendiente', badge: 'slate' },
  bloqueada: { label: 'Bloqueada', badge: 'red' },
  en_ejecucion: { label: 'En ejecucion', badge: 'orange' },
  pendiente_aprobacion: { label: 'Pend. aprobacion', badge: 'cyan' },
  cerrada: { label: 'Cerrada', badge: 'green' },
};

const AREA_COLORS = {
  Ingenieria: '#8B5CF6',
  Maestranza: '#64748B',
  Soldadura: '#F97316',
  'Fabricacion y Ensamble': '#0EA5E9',
  Calidad: '#10B981',
};

const AREA_LABELS = {
  Ingenieria: 'Ingenieria y Diseno',
  Maestranza: 'Maestranza',
  Soldadura: 'Soldadura',
  'Fabricacion y Ensamble': 'Fabricacion y Ensamble',
  Calidad: 'Calidad',
};

const PRODUCTIVE_AREAS = ['Ingenieria', 'Maestranza', 'Soldadura', 'Fabricacion y Ensamble'];

const fmtMoney = (n, currency = 'PEN') => {
  const symbol = currency === 'PEN' ? 'S/ ' : '$';
  return symbol + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const fmtHours = (n) => `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} h`;

const daysLeft = (iso) => {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date(TODAY)) / 86400000);
};

const dayLabel = (iso) => {
  const d = daysLeft(iso);
  if (d == null) return 'Sin fecha';
  if (d > 0) return `${d} dias`;
  if (d === 0) return 'hoy';
  return `${Math.abs(d)} dias venc.`;
};

const calcOFProgress = (of) => {
  const seq = of.secuencia_ots || [];
  if (!seq.length) return 0;
  return Math.round((seq.filter(ot => ot.estado === 'cerrada').length / seq.length) * 100);
};

const getAllOTs = () =>
  (ZAHORY_SAC_DATA.ordenes_fabricacion || []).flatMap(of =>
    (of.secuencia_ots || []).map(ot => ({ ...ot, of }))
  );

const getOF = (id) =>
  (ZAHORY_SAC_DATA.ordenes_fabricacion || []).find(o => o.id === id || o.codigo === id) ||
  (ZAHORY_SAC_DATA.ordenes_fabricacion || [])[0];

const isPrereqClosed = (of, ot) => {
  if (!ot.prerequisito) return true;
  return (of.secuencia_ots || []).some(p => p.ot_id === ot.prerequisito && p.estado === 'cerrada');
};

const isOTLocked = (of, ot) => !isPrereqClosed(of, ot);

const Badge = ({ kind = 'slate', children, dot = true }) => (
  <span className={`badge ${kind}`}>{dot && <span className="dot" />}{children}</span>
);

const OFBadge = ({ estado }) => {
  const cfg = OF_STATES[estado] || { label: estado, badge: 'slate' };
  return <Badge kind={cfg.badge}>{cfg.label}</Badge>;
};

const OTBadge = ({ estado, locked }) => {
  const cfg = locked ? OT_STATES.bloqueada : (OT_STATES[estado] || { label: estado, badge: 'slate' });
  return <Badge kind={cfg.badge}>{cfg.label}</Badge>;
};

const ProgressBar = ({ pct, color = 'var(--cyan)' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
    <div style={{ flex: 1, height: 7, background: '#EEF2F6', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%`, height: '100%', background: color }} />
    </div>
    <span style={{ width: 34, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)' }}>{pct || 0}%</span>
  </div>
);

const Kpi = ({ label, value, sub, tone = 'default' }) => (
  <div className={`kpi ${tone === 'red' ? 'red-soft' : tone === 'green' ? 'green-soft' : ''}`}>
    <div className="label">{label}</div>
    <div className="value">{value}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

const Meta = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{value || '-'}</div>
  </div>
);

const CardGrid = ({ children, min = 260 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14 }}>
    {children}
  </div>
);

const AlertLine = ({ tone = 'orange', children, action }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    borderRadius: 6,
    background: tone === 'red' ? '#FEF2F2' : tone === 'green' ? '#F0FDF4' : '#FFF7ED',
    borderLeft: `3px solid ${tone === 'red' ? 'var(--red)' : tone === 'green' ? 'var(--green)' : 'var(--orange)'}`,
    fontSize: 12,
  }}>
    <Icon name={tone === 'green' ? 'check' : 'alert'} size={14} />
    <div style={{ flex: 1 }}>{children}</div>
    {action}
  </div>
);

const SectionTitle = ({ title, hint, action }) => (
  <div className="card-header">
    <h3>{title}</h3>
    {hint && <span className="hint">{hint}</span>}
    <div style={{ flex: 1 }} />
    {action}
  </div>
);

const Input = (props) => <input className="input" {...props} />;
const Select = (props) => <select className="select" {...props} />;

const Field = ({ label, children }) => (
  <div className="field">
    <label>{label}</label>
    {children}
  </div>
);

// Campo enriquecido con label uppercase + texto de ayuda opcional
const RichField = ({ label, hint, required, children, style }) => (
  <div style={style}>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
    {children}
    {hint && <div style={{ fontSize: 11, color: 'var(--slate-2)', marginTop: 5, lineHeight: 1.4 }}>{hint}</div>}
  </div>
);

// Fila de resumen en panel izquierdo oscuro
const SummaryRow = ({ label, value }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</div>
    <div style={{ fontSize: 12, color: value ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.2)', marginTop: 2, fontWeight: value ? 500 : 400, wordBreak: 'break-all', lineHeight: 1.35 }}>
      {value || '—'}
    </div>
  </div>
);

const valueMeetsCriterion = (criterion, rawValue) => {
  if (rawValue === '' || rawValue == null) return null;
  const n = Number(rawValue);
  if (Number.isNaN(n)) return true;
  if (criterion.valor_minimo != null) return n >= criterion.valor_minimo;
  if (criterion.valor_maximo != null) return n <= criterion.valor_maximo;
  return true;
};

const costOf = (items = []) => items.reduce((sum, it) => sum + Number(it.cantidad || 0) * Number(it.costo_unit || 0), 0);

const GATE_DONE_STATES = ['aprobado', 'completado'];

const gateRecordKey = (ofId, gateId) => `${ofId}:${gateId}`;

const gateForOT = (of, ot) =>
  (of?.pcc_gates || []).find(g => g.ot_id === ot?.ot_id && g.momento !== 'qc_final');

const gateStatus = (gate, record) => record?.estado || gate?.estado || 'pendiente';

const isGateDone = (gate, record) => GATE_DONE_STATES.includes(gateStatus(gate, record));

const gateTone = (gate, record) => {
  const status = gateStatus(gate, record);
  if (GATE_DONE_STATES.includes(status)) return 'green';
  if (['fallido', 'observado', 'rechazado'].includes(status)) return 'red';
  return 'orange';
};

const gateStatusLabel = (gate, record) => {
  const status = gateStatus(gate, record);
  if (status === 'aprobado' || status === 'completado') return 'Aprobado';
  if (status === 'fallido') return 'Fallido';
  if (status === 'observado') return 'Observado';
  return 'Pendiente';
};

const gateRecordedAt = () => {
  try {
    return new Date().toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '2026-05-27 10:45';
  }
};

const gateFieldValueLabel = (field, value) => {
  if (value == null || value === '') return '-';
  if (field.tipo === 'confirmacion') {
    return field.opciones?.find(o => o.valor === value)?.label || value;
  }
  return field.unidad ? `${value} ${field.unidad}` : value;
};

const gateRecordSummary = (gate, record) => {
  if (record?.valores) {
    return (gate.campos || [])
      .map(field => `${field.label}: ${gateFieldValueLabel(field, record.valores[field.id])}`)
      .join(' · ');
  }
  if (gate?.valor_registrado) return gate.valor_registrado;
  return 'Pendiente de registro';
};

const validateGateField = (field, value) => {
  const blank = value == null || value === '';
  if (field.requerido && blank) return { state: 'pending', message: 'Campo obligatorio' };
  if (blank) return { state: 'ok', message: '' };

  if (field.pattern) {
    try {
      if (!new RegExp(field.pattern).test(String(value))) {
        return { state: 'fail', message: field.criterio || 'Formato no valido' };
      }
    } catch {
      return { state: 'ok', message: '' };
    }
  }

  if (field.tipo === 'confirmacion') {
    if (field.esperado && value !== field.esperado) {
      return { state: 'fail', message: field.criterio || 'Debe quedar conforme' };
    }
    return { state: 'ok', message: '' };
  }

  if (field.tipo === 'number') {
    const n = Number(value);
    if (Number.isNaN(n)) return { state: 'fail', message: 'Debe ingresar un numero valido' };
    if (field.min != null && n < Number(field.min)) {
      return { state: 'fail', message: field.criterio || `Debe ser >= ${field.min} ${field.unidad || ''}` };
    }
    if (field.max != null && n > Number(field.max)) {
      return { state: 'fail', message: field.criterio || `Debe ser <= ${field.max} ${field.unidad || ''}` };
    }
  }

  return { state: 'ok', message: '' };
};

const SOS_ESTADOS = {
  normal: { label: 'Normal', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', badge: 'green' },
  alerta: { label: 'Alerta', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', badge: 'orange' },
  critico: { label: 'Critico', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', badge: 'red' },
  pendiente: { label: 'Pendiente', color: '#64748b', bg: 'rgba(100,116,139,0.12)', badge: 'slate' },
};

const getSOSEstado = (estado) =>
  SOS_ESTADOS[estado] || { label: estado || 'Sin estado', color: '#64748b', bg: 'rgba(100,116,139,0.12)', badge: 'slate' };

const getSOSMetalColor = (metal = {}, valor = 0) => {
  if (valor >= Number(metal.limite_critico || 0)) return '#ef4444';
  if (valor >= Number(metal.limite_alerta || 0)) return '#f59e0b';
  return '#22c55e';
};

const getSOSBarWidth = (valor = 0, limiteCritico = 1) =>
  Math.min(100, (Number(valor || 0) / Math.max(1, Number(limiteCritico || 1) * 1.2)) * 100);

const SOSEstadoPill = ({ estado }) => {
  const cfg = getSOSEstado(estado);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: cfg.bg,
      color: cfg.color,
      fontSize: 11,
      padding: '3px 10px',
      borderRadius: 20,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
      {cfg.label}
    </span>
  );
};

export const AnalisisSOS = ({ setCurrent, onNav }) => {
  const navigate = setCurrent || onNav || (() => {});
  const analisis = ZAHORY_SAC_DATA.sos_analisis || [];
  const [tabActivo, setTabActivo] = useState('lista');
  const [seleccionado, setSeleccionado] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const criticos = analisis.filter(a => a.estado === 'critico').length;
  const alertas = analisis.filter(a => a.estado === 'alerta').length;
  const normales = analisis.filter(a => a.estado === 'normal').length;
  const conBacklog = analisis.filter(a => a.backlog_generado_id).length;

  const analisisFiltrados = useMemo(() =>
    analisis
      .filter(a => filtroEstado === 'todos' || a.estado === filtroEstado)
      .sort((a, b) => new Date(b.fecha_resultado || b.fecha_muestra) - new Date(a.fecha_resultado || a.fecha_muestra)),
    [analisis, filtroEstado]
  );

  const selectAnalisis = (item) => {
    setSeleccionado(item);
    setTabActivo('detalle');
  };

  const generarOTDesdeSOS = (item) => {
    localStorage.setItem('zahory_ot_contexto', JSON.stringify({
      equipo_id: item.equipo_id,
      objeto_costo_tipo: 'contrato',
      objeto_costo_id: item.contrato_id,
      descripcion: `[SOS ${item.id}] ${String(item.recomendacion || '').slice(0, 140)}`,
      origen: 'sos_analisis',
      sos_analisis_id: item.id,
      backlog_origen_id: item.backlog_generado_id || null,
      tipo_trabajo: 'Correctivo',
      cargo_financiero: item.estado === 'normal' ? 'Cliente_Contrato' : 'Interno_Zahory',
    }));
    navigate('crear-ot');
  };

  const kpis = [
    { label: 'Criticos', value: criticos, color: '#ef4444', filter: 'critico', sub: 'Requieren accion inmediata' },
    { label: 'En alerta', value: alertas, color: '#f59e0b', filter: 'alerta', sub: 'Seguimiento acelerado' },
    { label: 'Normales', value: normales, color: '#22c55e', filter: 'normal', sub: 'Dentro de limite' },
    { label: 'Con backlog', value: conBacklog, color: '#8b5cf6', filter: 'todos', sub: 'Trazabilidad generada' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Analisis SOS y Telemetria</h1>
          <div className="sub">Analisis espectrometrico de aceites para deteccion temprana de desgaste.</div>
        </div>
        <div className="spacer" />
        <button className="btn btn-cyan"><Icon name="plus" size={14} /> Nueva muestra SOS</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
        {kpis.map(kpi => {
          const active = filtroEstado === kpi.filter;
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={() => setFiltroEstado(active ? 'todos' : kpi.filter)}
              className="kpi"
              style={{
                textAlign: 'left',
                borderColor: active ? kpi.color : `${kpi.color}33`,
                background: active ? `${kpi.color}12` : 'white',
              }}
            >
              <div className="label">{kpi.label}</div>
              <div className="value" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="sub">{kpi.sub}</div>
            </button>
          );
        })}
      </div>

      <div className="tabs">
        {[
          { key: 'lista', label: 'Lista de analisis' },
          { key: 'detalle', label: 'Detalle del analisis' },
        ].map(tab => (
          <button
            key={tab.key}
            className={`tab ${tabActivo === tab.key ? 'active' : ''}`}
            onClick={() => setTabActivo(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabActivo === 'lista' && (
        <div className="card">
          <SectionTitle
            title="Muestras y resultados SOS"
            hint={`${analisisFiltrados.length} analisis visibles`}
            action={filtroEstado !== 'todos' && (
              <button className="btn btn-ghost btn-sm" onClick={() => setFiltroEstado('todos')}>Limpiar filtro</button>
            )}
          />
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nro analisis</th>
                  <th>Equipo / Sistema</th>
                  <th>Contrato</th>
                  <th>Fecha muestra</th>
                  <th>Fecha resultado</th>
                  <th className="num">Fe ppm</th>
                  <th className="num">Si ppm</th>
                  <th>Estado</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {analisisFiltrados.map(item => {
                  const fe = item.resultados?.Fe || {};
                  const si = item.resultados?.Si || {};
                  return (
                    <tr key={item.id} className="clickable" onClick={() => selectAnalisis(item)}>
                      <td className="mono"><strong style={{ color: 'var(--cyan)' }}>{item.id}</strong></td>
                      <td>
                        <strong>{item.equipo_id}</strong>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.sistema} - {item.tipo_aceite}</div>
                      </td>
                      <td className="mono">{item.contrato_id}</td>
                      <td>{item.fecha_muestra}</td>
                      <td>{item.fecha_resultado || '-'}</td>
                      <td className="num">
                        <strong style={{ color: getSOSMetalColor(fe, fe.valor), fontVariantNumeric: 'tabular-nums' }}>{fe.valor}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> / {fe.limite_critico}</span>
                      </td>
                      <td className="num">
                        <strong style={{ color: getSOSMetalColor(si, si.valor), fontVariantNumeric: 'tabular-nums' }}>{si.valor}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> / {si.limite_critico}</span>
                      </td>
                      <td>
                        <SOSEstadoPill estado={item.estado} />
                        {item.backlog_generado_id && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => { e.stopPropagation(); navigate('backlog'); }}
                            style={{ marginTop: 6, color: '#8b5cf6', paddingLeft: 0 }}
                          >
                            -&gt; {item.backlog_generado_id}
                          </button>
                        )}
                      </td>
                      <td><span style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: 12 }}>Ver detalle -&gt;</span></td>
                    </tr>
                  );
                })}
                {!analisisFiltrados.length && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Sin analisis para este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tabActivo === 'detalle' && (
        <div>
          {!seleccionado ? (
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                Selecciona un analisis de la lista para ver el detalle.
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-ghost" onClick={() => setTabActivo('lista')}>Volver a la lista</button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="card">
                <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span className="mono" style={{ color: 'var(--cyan)', fontWeight: 800 }}>{seleccionado.id}</span>
                      <SOSEstadoPill estado={seleccionado.estado} />
                    </div>
                    <h2 style={{ margin: 0, fontSize: 18, color: 'var(--navy)' }}>{seleccionado.equipo_id} - {seleccionado.sistema}</h2>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                      {seleccionado.equipo_modelo} - {seleccionado.tipo_aceite} - Horometro {Number(seleccionado.horometro_muestra || 0).toLocaleString('en-US')} h
                    </div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => setTabActivo('lista')}>Lista</button>
                </div>
              </div>

              <CardGrid min={180}>
                {[
                  ['Fecha muestra', seleccionado.fecha_muestra],
                  ['Fecha resultado', seleccionado.fecha_resultado || '-'],
                  ['Laboratorio', seleccionado.laboratorio],
                  ['Tecnico', seleccionado.tecnico_muestra],
                  ['Contrato', seleccionado.contrato_id],
                  ['Sistema', seleccionado.sistema],
                ].map(([label, value]) => <div key={label} className="card"><div className="card-body"><Meta label={label} value={value} /></div></div>)}
              </CardGrid>

              <div className="card">
                <SectionTitle title="Resultados espectrometricos" hint="Metales monitoreados en ppm" />
                <div className="card-body" style={{ display: 'grid', gap: 12 }}>
                  {Object.entries(seleccionado.resultados || {}).map(([metal, data]) => {
                    const color = getSOSMetalColor(data, data.valor);
                    const width = getSOSBarWidth(data.valor, data.limite_critico);
                    const overflow = Number(data.valor || 0) > Number(data.limite_critico || 0);
                    return (
                      <div key={metal}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                            <span className="mono" style={{ width: 24, fontWeight: 800 }}>{metal}</span>
                            <strong className="mono" style={{ color }}>{data.valor} {data.unidad}</strong>
                            {overflow && <span style={{ color, fontSize: 11, fontWeight: 700 }}>100%+ del rango critico</span>}
                          </div>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Alerta {data.limite_alerta} - Critico {data.limite_critico}</span>
                        </div>
                        <div style={{ height: 7, background: '#EEF2F6', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${width}%`, background: color, borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 14, marginTop: 4 }}>
                    <CardGrid min={220}>
                      <div>
                        <Meta label="Viscosidad" value={`${seleccionado.viscosidad?.valor} ${seleccionado.viscosidad?.unidad}`} />
                        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 5 }}>
                          Rango: {seleccionado.viscosidad?.rango_min} - {seleccionado.viscosidad?.rango_max} {seleccionado.viscosidad?.unidad}
                        </div>
                      </div>
                      <div>
                        <Meta label="Contenido de agua" value={`${seleccionado.agua?.valor} ${seleccionado.agua?.unidad}`} />
                        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 5 }}>
                          Limite: {seleccionado.agua?.limite} {seleccionado.agua?.unidad}
                        </div>
                      </div>
                    </CardGrid>
                  </div>
                </div>
              </div>

              <div style={{
                background: getSOSEstado(seleccionado.estado).bg,
                borderLeft: `3px solid ${getSOSEstado(seleccionado.estado).color}`,
                borderRadius: '0 8px 8px 0',
                padding: '14px 16px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: getSOSEstado(seleccionado.estado).color, marginBottom: 6 }}>
                  Recomendacion del laboratorio
                </div>
                <div style={{ color: 'var(--text)', lineHeight: 1.5 }}>{seleccionado.recomendacion}</div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {seleccionado.backlog_generado_id && (
                  <button className="btn btn-ghost" onClick={() => navigate('backlog')} style={{ color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)' }}>
                    Ver Backlog {seleccionado.backlog_generado_id}
                  </button>
                )}
                {seleccionado.ot_generada_id && (
                  <button className="btn btn-ghost" onClick={() => navigate('ots')} style={{ color: '#3b82f6', borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)' }}>
                    Ver OT {seleccionado.ot_generada_id}
                  </button>
                )}
                {!seleccionado.ot_generada_id && (
                  <button className="btn btn-secondary" onClick={() => generarOTDesdeSOS(seleccionado)}>
                    Generar OT desde este analisis
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <FooterBrand />
    </div>
  );
};

const GateForm = ({ gate, of, ot, existingRecord, onConfirm, onObserve }) => {
  const [values, setValues] = useState(() => {
    const initial = {};
    (gate.campos || []).forEach(field => {
      initial[field.id] = existingRecord?.valores?.[field.id] ?? '';
    });
    return initial;
  });
  const [observaciones, setObservaciones] = useState(existingRecord?.observaciones || '');
  const [ncMotivo, setNcMotivo] = useState('');

  if (!gate) return null;

  const validations = (gate.campos || []).map(field => ({
    field,
    ...validateGateField(field, values[field.id]),
  }));
  const failures = validations.filter(v => v.state === 'fail');
  const pending = validations.filter(v => v.state === 'pending');
  const needsObservation = (gate.campos || []).some(field => field.tipo === 'confirmacion' && values[field.id] === 'no_conforme');
  const observationMissing = needsObservation && !observaciones.trim();
  const canConfirm = failures.length === 0 && pending.length === 0 && !observationMissing;
  const ncPreviewId = `NC-GATE-${gate.numero || gate.id.replace('GATE-', '')}`;

  const submit = () => {
    if (!canConfirm) return;
    onConfirm?.({
      gate_id: gate.id,
      estado: 'aprobado',
      resultado: 'aprobado',
      valores: values,
      observaciones,
      tecnico: ot?.tecnico || of?.jefe_taller || 'Usuario MES',
      fecha_hora: gateRecordedAt(),
    });
  };

  const observe = () => {
    if (failures.length === 0 || !ncMotivo.trim()) return;
    onObserve?.({
      gate_id: gate.id,
      estado: 'observado',
      resultado: 'fallido',
      valores: values,
      observaciones: ncMotivo,
      tecnico: ot?.tecnico || of?.jefe_taller || 'Usuario MES',
      fecha_hora: gateRecordedAt(),
      criterios_fallidos: failures.map(f => ({
        campo: f.field.label,
        criterio: f.message,
        valor: values[f.field.id],
      })),
    });
  };

  return (
    <div className="card-body" style={{ display: 'grid', gap: 12 }}>
      <AlertLine tone="orange">
        <strong>Gate {gate.numero || gate.id}</strong> · {gate.descripcion || gate.requisito}
      </AlertLine>
      <div style={{ display: 'grid', gap: 12 }}>
        {(gate.campos || []).map(field => {
          const validation = validations.find(v => v.field.id === field.id);
          const failed = validation?.state === 'fail';
          const pendingField = validation?.state === 'pending';
          const hasValue = values[field.id] != null && values[field.id] !== '';
          const passed = hasValue && validation?.state === 'ok';
          const limit = field.min != null
            ? `Min: ${field.min} ${field.unidad || ''}`
            : field.max != null
              ? `Max: ${field.max} ${field.unidad || ''}`
              : field.unidad || '';
          return (
            <Field key={field.id} label={field.label}>
              {field.tipo === 'confirmacion' ? (
                <Select
                  value={values[field.id] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))}
                  style={{ borderColor: failed ? 'var(--red)' : passed ? 'var(--green)' : undefined }}
                >
                  <option value="">Seleccionar resultado</option>
                  {(field.opciones || []).map(opt => <option key={opt.valor} value={opt.valor}>{opt.label}</option>)}
                </Select>
              ) : (
                <Input
                  type={field.tipo === 'number' ? 'number' : 'text'}
                  step={field.step}
                  value={values[field.id] ?? ''}
                  placeholder={field.placeholder}
                  onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))}
                  style={{ borderColor: failed ? 'var(--red)' : passed ? 'var(--green)' : undefined }}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 5, fontSize: 11, color: failed ? 'var(--red)' : 'var(--text-muted)' }}>
                <span>{field.criterio || 'Dato obligatorio'}{limit ? ` - ${limit}` : ''}</span>
                <span style={{ color: passed ? 'var(--green)' : failed ? 'var(--red)' : undefined }}>{pendingField ? 'Pendiente' : failed ? validation.message : 'OK'}</span>
              </div>
            </Field>
          );
        })}
      </div>

      {(gate.calculos || []).map(calc => {
        const left = Number(values[calc.minuendo]);
        const right = Number(values[calc.sustraendo]);
        const ready = !Number.isNaN(left) && !Number.isNaN(right);
        return (
          <AlertLine key={calc.id} tone={ready ? 'green' : 'orange'}>
            {calc.label}: <strong>{ready ? `${(left - right).toFixed(2)} ${calc.unidad || ''}` : 'pendiente de datos'}</strong>
          </AlertLine>
        );
      })}

      <Field label={`Observaciones${needsObservation ? ' obligatorias' : ''}`}>
        <textarea
          className="input"
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          placeholder="Contexto adicional del tecnico o supervisor"
          style={{ minHeight: 76, resize: 'vertical', borderColor: observationMissing ? 'var(--red)' : undefined }}
        />
        {observationMissing && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 5 }}>Obligatorio cuando una verificacion queda no conforme.</div>}
      </Field>

      {failures.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <AlertLine tone="red">
            <strong>{ncPreviewId}</strong> se generara como No Conformidad por criterio no cumplido: {failures.map(f => `${f.field.label} (${f.message})`).join(' - ')}.
          </AlertLine>
          <Field label="Motivo para observar Gate y generar NC">
            <Input value={ncMotivo} onChange={e => setNcMotivo(e.target.value)} placeholder="Describa el motivo tecnico de la observacion" />
          </Field>
          <button className="btn btn-ghost" disabled={!ncMotivo.trim()} onClick={observe}>
            Marcar observado y generar NC
          </button>
        </div>
      )}

      {existingRecord && (
        <AlertLine tone="green">
          Registrado por {existingRecord.tecnico} el {existingRecord.fecha_hora}: {gateRecordSummary(gate, existingRecord)}
        </AlertLine>
      )}

      <button
        className="btn btn-cyan"
        disabled={!canConfirm || Boolean(existingRecord)}
        title={!canConfirm ? 'Complete todos los campos dentro de especificacion' : existingRecord ? 'Gate ya registrado' : ''}
        onClick={submit}
      >
        Confirmar Gate
      </button>
    </div>
  );
};

// 1. Dashboard Produccion
export const DashboardProduccion = ({ onNav, setCurrentOF }) => {
  const ofs = ZAHORY_SAC_DATA.ordenes_fabricacion || [];
  const allOTs = getAllOTs();
  const ncs = ZAHORY_SAC_DATA.no_conformidades_produccion || [];
  const garantias = ZAHORY_SAC_DATA.garantias_produccion || [];
  const plan = ZAHORY_SAC_DATA.planificacion_produccion || { centros: [] };
  const oee = ZAHORY_SAC_DATA.oee_centros_trabajo || [];

  const activeStates = ['aprobada', 'en_ingenieria', 'en_produccion', 'en_calidad', 'lista_entrega'];
  const activeOFs = ofs.filter(o => activeStates.includes(o.estado));
  const overdue = activeOFs.filter(o => daysLeft(o.fecha_compromiso) < 0);
  const qcPending = allOTs.filter(ot => ot.area === 'Calidad' && ot.estado !== 'cerrada');
  const warrantyClaims = (ZAHORY_SAC_DATA.reclamos_garantia || []).filter(r => r.estado !== 'cerrado');
  const avgAvail = Math.round(oee.reduce((s, c) => s + c.disponibilidad, 0) / Math.max(1, oee.length));
  const avgPerf = Math.round(oee.reduce((s, c) => s + c.rendimiento, 0) / Math.max(1, oee.length));
  const avgQual = Math.round(oee.reduce((s, c) => s + c.calidad, 0) / Math.max(1, oee.length));
  const globalOee = Math.round(oee.reduce((s, c) => s + c.oee, 0) / Math.max(1, oee.length));
  const bottlenecks = plan.centros.filter(c => c.carga?.some(v => v > 100));
  const nearWarranty = garantias.filter(g => g.dias_restantes >= 0 && g.dias_restantes <= 15);
  const lockedOTs = allOTs.filter(ot => ot.estado !== 'cerrada' && isOTLocked(ot.of, ot));

  const otsByArea = (area) => allOTs.filter(ot => ot.area === area && ot.estado !== 'cerrada');

  const getAccionAlerta = (texto) => {
    if (texto.includes('bloqueada')) return { label: 'Ver OT', action: () => onNav('produccion-control') };
    if (texto.includes('NC') || texto.includes('abierta')) return { label: 'Ver NC', action: () => onNav('produccion-calidad') };
    if (texto.includes('GAR') || texto.includes('vence')) return { label: 'Ver garantía', action: () => onNav('produccion-garantias') };
    if (texto.includes('CNC') || texto.includes('capacidad')) return { label: 'Ver piso', action: () => onNav('produccion-control') };
    return { label: 'Ver', action: () => {} };
  };

  const alertaConAccion = (texto, key) => {
    const accion = getAccionAlerta(texto);
    return (
      <div key={key} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1, fontSize: '12px', color: 'inherit' }}>
          {texto.includes('<strong>') ? <span dangerouslySetInnerHTML={{ __html: texto }} /> : texto}
        </div>
        <button onClick={accion.action} style={{ flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid #1e2d47', borderRadius: '5px', padding: '3px 10px', fontSize: '10px', color: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {accion.label} →
        </button>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard Produccion</h1>
          <div className="sub">ERP + MES en tiempo real para OFs, OTs, gates, OEE y garantias</div>
        </div>
        <div className="spacer" />
        <button className="btn btn-cyan" onClick={() => onNav('produccion-crear-of')}><Icon name="plus" size={14} /> Nueva OF</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi label="OFs activas" value={activeOFs.length} sub="Aprobadas, en produccion o calidad" />
        <Kpi label="Compromiso vencido" value={overdue.length} sub="Fecha de entrega excedida" tone={overdue.length ? 'red' : 'green'} />
        <Kpi label="QC pendiente" value={qcPending.length} sub="OTs de calidad sin cerrar" tone={qcPending.length ? 'red' : 'green'} />
        <Kpi label="Reclamos garantia" value={warrantyClaims.length} sub="Activos o en evaluacion" tone={warrantyClaims.length ? 'red' : 'green'} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle title="Carga por area productiva" hint="OTs activas con avance y compromiso de la OF madre" />
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {PRODUCTIVE_AREAS.map(area => (
              <div key={area} style={{ borderRight: '1px solid var(--card-border)', minHeight: 240 }}>
                <div style={{ padding: 12, borderBottom: '1px solid var(--card-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: AREA_COLORS[area] }} />
                  <strong style={{ fontSize: 12 }}>{AREA_LABELS[area]}</strong>
                  <Badge kind="cyan" dot={false}>{otsByArea(area).length}</Badge>
                </div>
                <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                  {otsByArea(area).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 22 }}>Sin OTs activas</div>}
                  {otsByArea(area).map(ot => {
                    const late = daysLeft(ot.of.fecha_compromiso) < 0;
                    return (
                      <button
                        key={`${ot.of.id}-${ot.ot_id}`}
                        className="card"
                        onClick={() => { setCurrentOF?.(ot.of.id); onNav('produccion-detalle-of'); }}
                        style={{ textAlign: 'left', padding: 10, borderColor: late ? 'var(--red)' : 'var(--card-border)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{ot.ot_id}</strong>
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {ot.of.centro_costo && <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: '8.5px', fontFamily: 'monospace', padding: '1px 5px', borderRadius: '5px', fontWeight: 600 }}>{ot.of.centro_costo}</span>}
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ot.of.codigo}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '5px 0' }}>{ot.tecnico || 'Sin tecnico'} · {dayLabel(ot.of.fecha_compromiso)}</div>
                        <ProgressBar pct={ot.avance_pct} color={AREA_COLORS[area]} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CardGrid min={340}>
        <div className="card">
          <SectionTitle title="OEE global taller" hint="Disponibilidad x rendimiento x calidad" />
          <div className="card-body">
            {globalOee < 60 && <AlertLine tone="red">OEE por debajo de 60%. Revisar cuello de botella en Maestranza.</AlertLine>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: globalOee < 60 ? 14 : 0 }}>
              <div style={{ fontSize: 46, fontWeight: 800, color: globalOee < 60 ? 'var(--red)' : 'var(--navy)' }}>{globalOee}%</div>
              <div style={{ flex: 1, display: 'grid', gap: 10 }}>
                <ProgressBar pct={avgAvail} color="var(--green)" />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Disponibilidad {avgAvail}%</div>
                <ProgressBar pct={avgPerf} color="var(--orange)" />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rendimiento {avgPerf}%</div>
                <ProgressBar pct={avgQual} color="var(--cyan)" />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Calidad {avgQual}%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <SectionTitle title="Alertas activas" hint="Bloqueos, garantias, QC y capacidad" />
          <div className="card-body" style={{ display: 'grid', gap: 8 }}>
            {lockedOTs.map(ot => <AlertLine key={ot.ot_id} tone="red">{alertaConAccion(`<strong>${ot.ot_id}</strong> bloqueada: cerrar ${ot.prerequisito} antes de iniciar.`, ot.ot_id)}</AlertLine>)}
            {ncs.filter(n => n.estado === 'abierta').map(nc => <AlertLine key={nc.id} tone="red">{alertaConAccion(`<strong>${nc.id}</strong> abierta en ${nc.area}; bloquea liberacion de ${nc.of_id}.`, nc.id)}</AlertLine>)}
            {nearWarranty.map(g => <AlertLine key={g.id} tone="orange">{alertaConAccion(`<strong>${g.id}</strong> vence en ${g.dias_restantes} dias · ${g.numero_serie}`, g.id)}</AlertLine>)}
            {bottlenecks.map(c => <AlertLine key={c.id} tone="orange">{alertaConAccion(`<strong>${c.nombre}</strong>: ${c.alerta}`, c.id)}</AlertLine>)}
            {!lockedOTs.length && !ncs.some(n => n.estado === 'abierta') && !nearWarranty.length && !bottlenecks.length && <AlertLine tone="green">Sin alertas criticas activas.</AlertLine>}
          </div>
        </div>
      </CardGrid>

      <FooterBrand />
    </div>
  );
};

// 2. Ordenes de Fabricacion
export const BandejaOFs = ({ onNav, setCurrentOF }) => {
  const [estado, setEstado] = useState('todos');
  const [cliente, setCliente] = useState('');
  const [area, setArea] = useState('todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const ofs = ZAHORY_SAC_DATA.ordenes_fabricacion || [];

  const filtered = ofs.filter(of => {
    if (estado !== 'todos' && of.estado !== estado) return false;
    if (cliente && !of.cliente_nombre.toLowerCase().includes(cliente.toLowerCase())) return false;
    if (area !== 'todas' && !(of.secuencia_ots || []).some(ot => ot.area === area && ot.estado !== 'cerrada')) return false;
    if (desde && of.fecha_apertura < desde) return false;
    if (hasta && of.fecha_compromiso > hasta) return false;
    return true;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Ordenes de Fabricacion</h1>
          <div className="sub">Registro maestro: OS, componente, secuencia, gates, costos y entrega</div>
        </div>
        <div className="spacer" />
        <button className="btn btn-cyan" onClick={() => onNav('produccion-crear-of')}><Icon name="plus" size={14} /> Nueva OF</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <CardGrid min={170}>
            <Field label="Estado">
              <Select value={estado} onChange={e => setEstado(e.target.value)}>
                <option value="todos">Todos</option>
                {Object.entries(OF_STATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label="Cliente">
              <Input placeholder="Doe Run, Minsur..." value={cliente} onChange={e => setCliente(e.target.value)} />
            </Field>
            <Field label="Area con OTs activas">
              <Select value={area} onChange={e => setArea(e.target.value)}>
                <option value="todas">Todas</option>
                {Object.keys(AREA_LABELS).map(a => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
              </Select>
            </Field>
            <Field label="Apertura desde"><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></Field>
            <Field label="Compromiso hasta"><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></Field>
          </CardGrid>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>OF</th><th>CC</th><th>Cliente</th><th>Trabajo</th><th>Estado</th><th>Avance</th><th>OTs activas</th><th>Costo</th><th>Compromiso</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(of => {
                const active = (of.secuencia_ots || []).filter(ot => ot.estado !== 'cerrada').length;
                const late = daysLeft(of.fecha_compromiso) < 0;
                return (
                  <tr key={of.id}>
                    <td className="mono"><strong>{of.codigo}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{of.os_id}</div></td>
                    <td>
                      <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: '9px', fontFamily: 'monospace', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>{of.centro_costo || '---'}</span>
                      {of.cargo_financiero === 'Garantia_Fabrica' && (
                        <span style={{ display: 'block', marginTop: '3px', background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', fontSize: '8.5px', fontFamily: 'monospace', padding: '1px 5px', borderRadius: '5px', fontWeight: 600 }}>GARANTÍA</span>
                      )}
                    </td>
                    <td>{of.cliente_nombre}</td>
                    <td style={{ maxWidth: 300 }}>{of.descripcion}</td>
                    <td><OFBadge estado={of.estado} /></td>
                    <td><ProgressBar pct={calcOFProgress(of)} /></td>
                    <td>{active ? <Badge kind="orange">{active}</Badge> : <span style={{ color: 'var(--text-muted)' }}>0</span>}</td>
                    <td style={{ textAlign: 'right', minWidth: '110px' }}>
                      {of.costo_real > 0 ? (
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#f8fafc' }}>${of.costo_real.toLocaleString()}</span>
                          <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>est. ${of.costo_estimado?.toLocaleString()}</span>
                          {(() => {
                            const pct = ((of.costo_real - of.costo_estimado) / of.costo_estimado) * 100;
                            const sobre = pct > 0;
                            return <span style={{ fontSize: '9px', fontWeight: 600, color: sobre ? '#ef4444' : '#22c55e' }}>{sobre ? '▲' : '▼'}{Math.abs(pct).toFixed(0)}%</span>;
                          })()}
                          {of.cargo_financiero === 'Garantia_Fabrica' && <div style={{ fontSize: '9px', color: '#8b5cf6', marginTop: '2px' }}>No recuperable — garantía</div>}
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '12px' }}>Est. ${of.costo_estimado?.toLocaleString() || '—'}</span>
                      )}
                    </td>
                    <td><div style={{ color: late ? 'var(--red)' : 'inherit', fontWeight: 700 }}>{of.fecha_compromiso}</div><div style={{ fontSize: 11, color: late ? 'var(--red)' : 'var(--text-muted)' }}>{dayLabel(of.fecha_compromiso)}</div></td>
                    <td>
                      {(() => {
                        const acciones = [];
                        if (of.estado === 'en_produccion') {
                          acciones.push({ label: 'Abrir', action: () => { setCurrentOF(of.id); onNav('produccion-detalle-of'); } });
                          acciones.push({ label: 'Ver BOM', action: () => { setCurrentOF(of.id); onNav('ing-bom'); } });
                        } else if (of.estado === 'en_calidad') {
                          acciones.push({ label: 'Abrir', action: () => { setCurrentOF(of.id); onNav('produccion-detalle-of'); } });
                          acciones.push({ label: 'Aprobar QC', action: () => {}, color: '#22c55e' });
                        } else {
                          acciones.push({ label: 'Ver', action: () => { setCurrentOF(of.id); onNav('produccion-detalle-of'); } });
                        }
                        return (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-ghost btn-sm" onClick={acciones[0].action} style={{ color: acciones[0].color || 'inherit' }}>{acciones[0].label}</button>
                            {acciones.length > 1 && (
                              <select style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer', outline: 'none' }} onChange={(e) => {
                                const idx = e.target.value;
                                if (idx !== "") acciones[idx].action();
                                e.target.value = "";
                              }}>
                                <option value="">···</option>
                                {acciones.slice(1).map((a, i) => <option key={i} value={i+1}>{a.label}</option>)}
                              </select>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <FooterBrand />
    </div>
  );
};

export const CrearOFPage = ({ onNav }) => {
  const [step, setStep] = useState(1);
  const [created, setCreated] = useState(false);
  const mtmCatalog = ZAHORY_SAC_DATA.tiempos_estandar || [];
  const normalizeText = (value = '') =>
    String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  const findMtmStandard = (process, area) => {
    const p = normalizeText(process);
    const a = normalizeText(area);
    if (!p) return null;
    return mtmCatalog.find(t => normalizeText(t.area) === a && normalizeText(t.proceso).includes(p)) ||
      mtmCatalog.find(t => normalizeText(t.area) === a && p.includes(normalizeText(t.proceso))) ||
      mtmCatalog.find(t => normalizeText(t.proceso).includes(p)) ||
      mtmCatalog.find(t => p.includes(normalizeText(t.proceso)));
  };
  const applyMtmStandard = (ot, standard) => standard ? ({
    ...ot,
    area: standard.area || ot.area,
    horas: standard.horas,
    horas_sugeridas: standard.horas,
    mtm_codigo: standard.id,
    mtm_sistema: standard.mtm_sistema,
    tmu: standard.tmu,
    motivo_horas: '',
  }) : {
    ...ot,
    horas_sugeridas: null,
    mtm_codigo: null,
    mtm_sistema: null,
    tmu: null,
  };
  const [origen, setOrigen] = useState('describe');
  const [comercial, setComercial] = useState({
    cliente: 'Doe Run Peru',
    os: 'OS-PRD-2026-007',
    fecha: '2026-05-29',
    precio: '18400',
    moneda: 'PEN',
    anticipo: '0',
  });
  const [serial, setSerial] = useState('CIL-IZQ-R1600G-003');
  const [tipoComp, setTipoComp] = useState('reparacion');
  const [sequence, setSequence] = useState([
    { ot_id: 'OT-NUEVA-001', area: 'Ingenieria', proceso: 'Diagnostico tecnico', tecnico: 'Roberto Quispe', horas: 4, horas_sugeridas: 4, mtm_codigo: 'MTM-ING-031', mtm_sistema: 'MTM-MEK', tmu: 115200, motivo_horas: '', prerequisito: '' },
  ]);
  const [bom, setBom] = useState([
    { codigo: 'MAT-010', descripcion: 'Sello hidraulico kit completo R1600G', cantidad: 1, unidad: 'kit', origen: 'stock_propio', material_cliente: false },
  ]);

  const passport = (ZAHORY_SAC_DATA.pasaportes_componentes || []).find(p => p.numero_serie === serial);

  const STEPS = [
    { id: 1, label: 'Origen',        icon: 'arrow',    desc: '¿Como nace esta Orden de Fabricacion?' },
    { id: 2, label: 'Comercial',     icon: 'briefcase', desc: 'Acuerdo comercial y condiciones economicas' },
    { id: 3, label: 'Componente',    icon: 'parts',    desc: 'Identificacion y trazabilidad del componente' },
    { id: 4, label: 'Secuencia OTs', icon: 'orders',   desc: 'Planificacion de trabajo por area productiva' },
    { id: 5, label: 'BOM',           icon: 'package',  desc: 'Lista de materiales planificada para la OF' },
  ];

  const BOM_ORIGEN_OPTIONS = [
    { id: 'stock_propio', label: 'Stock propio', badge: 'green', hint: 'Descuenta inventario propio al consumir.' },
    { id: 'proveedor', label: 'Proveedor / tercero', badge: 'orange', hint: 'Genera compra, servicio externo o seguimiento de proveedor.' },
    { id: 'material_cliente', label: 'Material cliente', badge: 'purple', hint: 'Lo aporta el cliente; no descuenta stock propio.' },
  ];

  const getBomOrigin = (item) => item.origen || (item.material_cliente ? 'material_cliente' : 'stock_propio');
  const getBomOriginCfg = (item) =>
    BOM_ORIGEN_OPTIONS.find(o => o.id === getBomOrigin(item)) || BOM_ORIGEN_OPTIONS[0];

  const addOT = () => setSequence(prev => {
    const base = {
      ot_id: `OT-NUEVA-${String(prev.length + 1).padStart(3, '0')}`,
      area: 'Maestranza',
      proceso: 'Rectificado cilindrico exterior',
      tecnico: 'Pedro Ccoa',
      horas: 6,
      horas_sugeridas: null,
      mtm_codigo: null,
      mtm_sistema: null,
      tmu: null,
      motivo_horas: '',
      prerequisito: prev[prev.length - 1]?.ot_id || '',
    };
    return [...prev, applyMtmStandard(base, findMtmStandard(base.proceso, base.area))];
  });

  const updateSequenceOT = (index, updater) => {
    setSequence(prev => prev.map((ot, idx) => {
      if (idx !== index) return ot;
      const next = typeof updater === 'function' ? updater(ot) : { ...ot, ...updater };
      return next;
    }));
  };

  const updateOTProcess = (index, process) => {
    updateSequenceOT(index, ot => {
      const next = { ...ot, proceso: process };
      return applyMtmStandard(next, findMtmStandard(process, next.area));
    });
  };

  const updateOTArea = (index, area) => {
    updateSequenceOT(index, ot => {
      const next = { ...ot, area };
      return applyMtmStandard(next, findMtmStandard(next.proceso, area));
    });
  };

  const updateOTHours = (index, hours) => {
    updateSequenceOT(index, ot => ({
      ...ot,
      horas: hours,
      motivo_horas: Number(hours) === Number(ot.horas_sugeridas) ? '' : ot.motivo_horas,
    }));
  };

  const acceptMtmSuggestion = (index) => {
    updateSequenceOT(index, ot => ({
      ...ot,
      horas: ot.horas_sugeridas ?? ot.horas,
      motivo_horas: '',
    }));
  };

  const addBom = () => setBom(prev => [...prev, {
    codigo: 'MAT-011', descripcion: 'O-rings de respaldo (juego)',
    cantidad: 1, unidad: 'juego', origen: 'stock_propio', material_cliente: false,
  }]);

  const fmtPrecio = () => `${comercial.moneda === 'PEN' ? 'S/' : '$'} ${Number(comercial.precio || 0).toLocaleString()}`;

  // ─── OPCIONES ORIGEN ────────────────────────────────────────────────────────
  const ORIGEN_OPTIONS = [
    {
      id: 'describe',
      icon: 'workshop',
      badge: 'Flujo recomendado',
      badgeKind: 'cyan',
      title: 'El cliente describe el problema',
      desc: 'El equipo de ingeniería realiza el diagnóstico técnico, define la secuencia de OTs, el BOM y el Plan de Control de Calidad. Es el flujo operativo estándar recomendado.',
    },
    {
      id: 'specs',
      icon: 'report',
      badge: 'Alternativo',
      badgeKind: 'slate',
      title: 'El cliente trae especificaciones',
      desc: 'La OF parte desde planos técnicos, memorias de cálculo o requerimientos propios del cliente. La empresa ejecuta según esas especificaciones sin diagnóstico previo.',
    },
  ];

  return (
    <div className="wizard-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

      {/* ══ PANEL IZQUIERDO — Stepper + Resumen en vivo ════════════════════════ */}
      <div className="wizard-detail-panel" style={{
        width: 272, flexShrink: 0,
        background: 'linear-gradient(180deg, #1A2B4A 0%, #1F3358 100%)',
        display: 'flex', flexDirection: 'column',
        padding: '24px 20px 32px',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>

        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 32 }}>
          <button onClick={() => onNav('produccion-of')} style={{
            color: 'rgba(255,255,255,0.45)', padding: '5px 7px', borderRadius: 7,
            background: 'rgba(255,255,255,0.07)', marginTop: 1, flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <Icon name="back" size={14} />
          </button>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Nueva OF</div>
            <div style={{ color: 'var(--cyan)', fontSize: 11, marginTop: 3, fontWeight: 600, letterSpacing: '0.3px' }}>
              Orden de Fabricacion
            </div>
          </div>
        </div>

        {/* Stepper vertical */}
        <div>
          {STEPS.map((s, i) => {
            const isActive = step === s.id;
            const isDone   = step > s.id;
            return (
              <div key={s.id} style={{ display: 'flex', gap: 14 }}>
                {/* Circulo + linea */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div
                    onClick={() => setStep(s.id)}
                    style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: isDone ? 'var(--cyan)' : isActive ? 'rgba(0,188,212,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `2px solid ${isDone || isActive ? 'var(--cyan)' : 'rgba(255,255,255,0.12)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                      color: isDone ? '#fff' : isActive ? 'var(--cyan)' : 'rgba(255,255,255,0.28)',
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 0 0 4px rgba(0,188,212,0.12)' : 'none',
                      transition: 'all 0.2s', flexShrink: 0,
                    }}
                  >
                    {isDone ? <Icon name="check" size={12} /> : s.id}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{
                      width: 2, height: 34,
                      background: isDone ? 'var(--cyan)' : 'rgba(255,255,255,0.07)',
                      margin: '4px 0', borderRadius: 1, transition: 'background 0.3s',
                    }} />
                  )}
                </div>
                {/* Etiqueta */}
                <div style={{ paddingTop: 5, paddingBottom: i < STEPS.length - 1 ? 0 : 0 }}>
                  <div
                    onClick={() => setStep(s.id)}
                    style={{
                      fontSize: 13, fontWeight: isActive ? 700 : 500, cursor: 'pointer', lineHeight: 1.3,
                      color: isActive ? '#fff' : isDone ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)',
                    }}
                  >
                    {s.label}
                  </div>
                  {isActive && (
                    <div style={{ fontSize: 10, color: 'rgba(0,188,212,0.75)', marginTop: 2, fontWeight: 500, lineHeight: 1.4 }}>
                      {s.desc}
                    </div>
                  )}
                  {i < STEPS.length - 1 && <div style={{ height: isActive ? 22 : 30 }} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Divisor */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '24px 0 20px' }} />

        {/* Resumen en vivo */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.24)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 14 }}>
            Resumen en vivo
          </div>
          <SummaryRow label="Origen"          value={step >= 1 ? (origen === 'describe' ? 'Cliente describe el problema' : 'Cliente trae especificaciones') : null} />
          <SummaryRow label="Cliente"          value={step >= 2 ? comercial.cliente : null} />
          <SummaryRow label="OS vinculada"     value={step >= 2 ? comercial.os : null} />
          <SummaryRow label="Precio"           value={step >= 2 ? fmtPrecio() : null} />
          <SummaryRow label="Fecha compromiso" value={step >= 2 ? comercial.fecha : null} />
          <SummaryRow label="Componente"       value={step >= 3 ? serial : null} />
          <SummaryRow label="OTs secuenciadas" value={step >= 4 ? `${sequence.length} OT${sequence.length !== 1 ? 's' : ''}` : null} />
          <SummaryRow label="Materiales BOM"   value={step >= 5 ? `${bom.length} item${bom.length !== 1 ? 's' : ''}` : null} />
        </div>
      </div>

      {/* ══ PANEL DERECHO — Contenido del paso ═════════════════════════════════ */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 860, padding: '32px 36px 80px' }}>

          {/* Cabecera del paso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, paddingBottom: 22, borderBottom: '1px solid var(--card-border)' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'var(--cyan-soft)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--cyan)', flexShrink: 0,
            }}>
              <Icon name={STEPS[step - 1].icon} size={20} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 2 }}>
                Paso {step} de 5
              </div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.2 }}>
                {STEPS[step - 1].label}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                {STEPS[step - 1].desc}
              </p>
            </div>
          </div>

          {/* ── Paso 1: Origen ───────────────────────────────────────────── */}
          {step === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {ORIGEN_OPTIONS.map(opt => {
                const sel = origen === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setOrigen(opt.id)}
                    style={{
                      background: '#fff', borderRadius: 12, padding: '22px 22px',
                      cursor: 'pointer', position: 'relative',
                      border: `2px solid ${sel ? 'var(--cyan)' : 'var(--card-border)'}`,
                      boxShadow: sel ? '0 4px 20px rgba(0,188,212,0.12)' : 'var(--shadow-sm)',
                      transition: 'border-color 0.18s, box-shadow 0.18s',
                    }}
                  >
                    {/* Radio visual */}
                    <div style={{
                      position: 'absolute', top: 16, right: 16,
                      width: 18, height: 18, borderRadius: '50%',
                      background: sel ? 'var(--cyan)' : 'transparent',
                      border: `2px solid ${sel ? 'var(--cyan)' : '#D1D5DB'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {sel && <Icon name="check" size={10} />}
                    </div>
                    {/* Icono */}
                    <div style={{
                      width: 46, height: 46, borderRadius: 11,
                      background: sel ? 'var(--cyan-soft)' : '#F1F5F9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: sel ? 'var(--cyan)' : 'var(--slate)', marginBottom: 16,
                    }}>
                      <Icon name={opt.icon} size={22} />
                    </div>
                    <Badge kind={opt.badgeKind}>{opt.badge}</Badge>
                    <h3 style={{ margin: '12px 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3, paddingRight: 24 }}>
                      {opt.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {opt.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Paso 2: Comercial ────────────────────────────────────────── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ padding: '22px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 18 }}>
                  Identificacion del cliente
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <RichField label="Cliente" required hint="Empresa registrada como cliente activo">
                    <Input value={comercial.cliente} onChange={e => setComercial(c => ({ ...c, cliente: e.target.value }))} />
                  </RichField>
                  <RichField label="OS vinculada" required hint="Orden de servicio emitida por el area comercial">
                    <Input value={comercial.os} onChange={e => setComercial(c => ({ ...c, os: e.target.value }))} />
                  </RichField>
                </div>
              </div>
              <div className="card" style={{ padding: '22px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 18 }}>
                  Condiciones economicas
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 18 }}>
                  <RichField label="Precio total" required hint="Monto acordado en la OS">
                    <Input type="number" value={comercial.precio} onChange={e => setComercial(c => ({ ...c, precio: e.target.value }))} />
                  </RichField>
                  <RichField label="Moneda" hint="PEN para soles, USD para dolares">
                    <Select value={comercial.moneda} onChange={e => setComercial(c => ({ ...c, moneda: e.target.value }))}>
                      <option value="PEN">PEN — Soles</option>
                      <option value="USD">USD — Dolares</option>
                    </Select>
                  </RichField>
                  <RichField label="Anticipo" hint="Ingresa 0 si no hay adelanto">
                    <Input type="number" value={comercial.anticipo} onChange={e => setComercial(c => ({ ...c, anticipo: e.target.value }))} />
                  </RichField>
                </div>
                <RichField label="Fecha de compromiso" required hint="Fecha maxima de entrega acordada con el cliente">
                  <Input type="date" value={comercial.fecha} onChange={e => setComercial(c => ({ ...c, fecha: e.target.value }))} style={{ maxWidth: 210 }} />
                </RichField>
              </div>
            </div>
          )}

          {/* ── Paso 3: Componente ───────────────────────────────────────── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ padding: '22px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 18 }}>
                  Datos del componente
                </div>
                <CardGrid min={180}>
                  <RichField label="Numero de serie" required hint="Identificador unico del componente fisico">
                    <Input value={serial} onChange={e => setSerial(e.target.value)} />
                  </RichField>
                  <RichField label="Descripcion" hint="Nombre tecnico del componente">
                    <Input defaultValue="Cilindro de direccion lado izquierdo" />
                  </RichField>
                  <RichField label="Modelo compatible" hint="Equipo al que pertenece este componente">
                    <Input defaultValue="LHD R1600G" />
                  </RichField>
                  <RichField label="Tipo de intervencion">
                    <Select value={tipoComp} onChange={e => setTipoComp(e.target.value)}>
                      <option value="reparacion">Reparacion</option>
                      <option value="nuevo">Componente nuevo</option>
                    </Select>
                  </RichField>
                </CardGrid>
              </div>
              <div className="card" style={{
                padding: '22px 24px',
                background: passport ? '#F0FDF4' : '#FAFAFA',
                borderColor: passport ? '#D1FAE5' : 'var(--card-border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: passport ? 14 : 0 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 9,
                    background: passport ? '#D1FAE5' : '#EEF2F6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: passport ? 'var(--green)' : 'var(--slate)', flexShrink: 0,
                  }}>
                    <Icon name={passport ? 'check' : 'alert'} size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>Pasaporte del componente</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Trazabilidad e historial de intervenciones</div>
                  </div>
                </div>
                {passport ? (
                  <>
                    <Badge kind="green">Historial encontrado</Badge>
                    <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text)' }}>
                      <strong>{passport.historial.length}</strong> intervenciones para <strong>{passport.numero_serie}</strong>.
                    </div>
                    <div style={{ marginTop: 5, color: 'var(--text-muted)', fontSize: 12 }}>
                      Ultimo: {passport.historial[0]?.trabajo}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                    Sin historial. Se creara un pasaporte nuevo para este numero de serie.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Paso 4: Secuencia OTs ────────────────────────────────────── */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Cabecera de seccion */}
              <div className="card" style={{ padding: '22px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Secuencia de trabajo
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>
                      {sequence.length} OT{sequence.length !== 1 ? 's' : ''} planificada{sequence.length !== 1 ? 's' : ''} · cada una se ejecuta en orden segun prerequisito
                    </div>
                  </div>
                  <button className="btn btn-cyan btn-sm" onClick={addOT} style={{ flexShrink: 0 }}>
                    <Icon name="plus" size={13} /> Agregar OT
                  </button>
                </div>
              </div>

              <datalist id="mtm-process-options">
                {mtmCatalog.map(t => <option key={t.id} value={t.proceso} />)}
              </datalist>

              {/* Tarjeta por cada OT */}
              {sequence.map((ot, i) => (
                <div key={ot.ot_id} className="card" style={{ padding: '20px 24px' }}>
                  {/* Fila superior: ID + area + quitar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                        color: 'var(--navy)', background: 'var(--bg)',
                        padding: '4px 10px', borderRadius: 6,
                        border: '1px solid var(--card-border)',
                      }}>
                        {ot.ot_id}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: AREA_COLORS[ot.area] || 'var(--slate)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{ot.area}</span>
                      </div>
                    </div>
                    {sequence.length > 1 && (
                      <button
                        onClick={() => setSequence(s => s.filter((_, idx) => idx !== i))}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 5, background: '#F8FAFC' }}
                      >
                        <Icon name="x" size={12} /> Quitar
                      </button>
                    )}
                  </div>

                  {/* Campos: Proceso + Tecnico */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <RichField label="Proceso" required hint="Descripcion del trabajo a ejecutar">
                      <Input value={ot.proceso} list="mtm-process-options" onChange={e => updateOTProcess(i, e.target.value)} />
                      {ot.mtm_codigo ? (
                        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Badge kind="cyan">{ot.mtm_codigo}</Badge>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {ot.mtm_sistema} sugiere {ot.horas_sugeridas}h · {Number(ot.tmu || 0).toLocaleString()} TMU
                          </span>
                        </div>
                      ) : (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--orange)' }}>
                          Sin estandar MTM encontrado. Ingrese horas manualmente y registre motivo.
                        </div>
                      )}
                    </RichField>
                    <RichField label="Tecnico responsable" required hint="Tecnico asignado a esta OT">
                      <Input value={ot.tecnico} onChange={e => setSequence(s => s.map((x, idx) => idx === i ? { ...x, tecnico: e.target.value } : x))} />
                    </RichField>
                  </div>

                  {/* Campos: Area + Horas + Prerequisito */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <RichField label="Area productiva" hint="Taller o area donde se realiza">
                      <Select value={ot.area} onChange={e => updateOTArea(i, e.target.value)}>
                        {Object.keys(AREA_LABELS).map(a => <option key={a}>{a}</option>)}
                      </Select>
                    </RichField>
                    <RichField label="Horas MTM" hint="Tiempo estandar segun MTM">
                      <Input type="number" value={ot.horas} onChange={e => updateOTHours(i, e.target.value)} />
                      {ot.horas_sugeridas != null && Number(ot.horas) !== Number(ot.horas_sugeridas) && (
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => acceptMtmSuggestion(i)}>
                          Aceptar sugerencia {ot.horas_sugeridas}h
                        </button>
                      )}
                    </RichField>
                    <RichField label="Prerequisito" hint="OT que debe estar cerrada antes">
                      <Select value={ot.prerequisito} onChange={e => setSequence(s => s.map((x, idx) => idx === i ? { ...x, prerequisito: e.target.value } : x))}>
                        <option value="">— Ninguno</option>
                        {sequence.filter((_, j) => j !== i).map(o => (
                          <option key={o.ot_id} value={o.ot_id}>{o.ot_id}</option>
                        ))}
                      </Select>
                    </RichField>
                  </div>

                  {(ot.horas_sugeridas == null || Number(ot.horas) !== Number(ot.horas_sugeridas)) && (
                    <div style={{ marginTop: 16 }}>
                      <RichField label="Motivo de modificacion MTM" required hint="Obligatorio cuando se modifica el tiempo sugerido por el catalogo">
                        <Input
                          value={ot.motivo_horas || ''}
                          onChange={e => updateSequenceOT(i, { motivo_horas: e.target.value })}
                          placeholder="Ej. vastago con dureza inusual, material fuera de especificacion..."
                        />
                      </RichField>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Paso 5: BOM ──────────────────────────────────────────────── */}
          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Cabecera de seccion */}
              <div className="card" style={{ padding: '22px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Lista de materiales planificada
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>
                      {bom.length} item{bom.length !== 1 ? 's' : ''} en el BOM · puede ajustarse durante la ejecucion de la OF
                    </div>
                  </div>
                  <button className="btn btn-cyan btn-sm" onClick={addBom} style={{ flexShrink: 0 }}>
                    <Icon name="plus" size={13} /> Agregar material
                  </button>
                </div>
              </div>

              {/* Tarjeta por cada material */}
              {bom.map((it, i) => (
                <div key={`${it.codigo}-${i}`} className="card" style={{ padding: '20px 24px' }}>
                  {/* Fila superior: Codigo + origen + quitar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                        color: 'var(--navy)', background: 'var(--bg)',
                        padding: '4px 10px', borderRadius: 6,
                        border: '1px solid var(--card-border)',
                      }}>
                        {it.codigo}
                      </span>
                      <Badge kind={getBomOriginCfg(it).badge}>{getBomOriginCfg(it).label}</Badge>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {bom.length > 1 && (
                        <button
                          onClick={() => setBom(b => b.filter((_, idx) => idx !== i))}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 5, background: '#F8FAFC' }}
                        >
                          <Icon name="x" size={12} /> Quitar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Codigo + origen */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <RichField label="Codigo" hint="Identificador del material en el inventario">
                      <Input value={it.codigo} onChange={e => setBom(b => b.map((x, idx) => idx === i ? { ...x, codigo: e.target.value } : x))} />
                    </RichField>
                    <RichField label="Origen del item" hint={getBomOriginCfg(it).hint}>
                      <select
                        className="input"
                        value={getBomOrigin(it)}
                        onChange={e => setBom(b => b.map((x, idx) => idx === i ? {
                          ...x,
                          origen: e.target.value,
                          material_cliente: e.target.value === 'material_cliente',
                        } : x))}
                      >
                        {BOM_ORIGEN_OPTIONS.map(option => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </RichField>
                  </div>

                  {/* Descripcion */}
                  <RichField label="Descripcion del material" required hint="Nombre tecnico del insumo o componente" style={{ marginBottom: 16 }}>
                    <Input value={it.descripcion} onChange={e => setBom(b => b.map((x, idx) => idx === i ? { ...x, descripcion: e.target.value } : x))} />
                  </RichField>

                  {/* Cantidad + Unidad */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <RichField label="Cantidad planificada" required hint="Cantidad estimada para la OF">
                      <Input type="number" value={it.cantidad} onChange={e => setBom(b => b.map((x, idx) => idx === i ? { ...x, cantidad: e.target.value } : x))} />
                    </RichField>
                    <RichField label="Unidad de medida" hint="und, kg, kit, m, L...">
                      <Input value={it.unidad} onChange={e => setBom(b => b.map((x, idx) => idx === i ? { ...x, unidad: e.target.value } : x))} />
                    </RichField>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Navegacion */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32 }}>
            <button
              className="btn btn-ghost"
              disabled={step === 1}
              onClick={() => setStep(s => Math.max(1, s - 1))}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="back" size={14} /> Anterior
            </button>
            {step < 5
              ? <button className="btn btn-cyan" onClick={() => setStep(s => Math.min(5, s + 1))} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Siguiente <Icon name="arrow" size={14} />
                </button>
              : <button className="btn btn-cyan" onClick={() => setCreated(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Crear OF <Icon name="check" size={14} />
                </button>
            }
          </div>

          {created && (
            <div style={{ marginTop: 16 }}>
              <AlertLine tone="green">
                OF creada en simulacion · {sequence.length} OTs secuenciadas · {bom.length} materiales en BOM planificado.
              </AlertLine>
            </div>
          )}
          <FooterBrand />
        </div>
      </div>
    </div>
  );
};

export const DetalleOFPage = ({ onNav, ofId }) => {
  const of = getOF(ofId || 'OF-2026-018');
  const [tab, setTab] = useState('secuencia');
  const [selectedOTId, setSelectedOTId] = useState('OT-PRD-032');
  const [gateRecords, setGateRecords] = useState({});
  const passport = (ZAHORY_SAC_DATA.pasaportes_componentes || []).find(p => p.numero_serie === of.componente?.numero_serie);
  const openNCs = (ZAHORY_SAC_DATA.no_conformidades_produccion || []).filter(n => n.of_id === of.id && n.estado === 'abierta');
  const selectedOT = (of.secuencia_ots || []).find(ot => ot.ot_id === selectedOTId);
  const selectedGate = gateForOT(of, selectedOT);
  const selectedGateRecord = selectedGate ? gateRecords[gateRecordKey(of.id, selectedGate.id)] : null;
  const completedGatesForSelected = (of.pcc_gates || [])
    .filter(g => g.ot_id === selectedOT?.ot_id)
    .map(g => ({ gate: g, record: gateRecords[gateRecordKey(of.id, g.id)] }))
    .filter(({ gate, record }) => isGateDone(gate, record));
  const registerDetailGate = (record) => {
    setGateRecords(prev => ({ ...prev, [gateRecordKey(of.id, record.gate_id)]: record }));
  };
  const tabs = [
    ['secuencia', 'Secuencia'],
    ['bom', 'BOM plan vs real'],
    ['calidad', 'Calidad'],
    ['pasaporte', 'Pasaporte'],
    ['entrega', 'Entrega'],
    ['economico', 'Economico'],
  ];
  const planned = costOf(of.bom_planificado);
  const actual = costOf(of.bom_real);
  const econ = of.cierre_economico || [];
  const plannedTotal = econ.reduce((s, r) => s + r.planificado, 0);
  const actualTotal = econ.reduce((s, r) => s + r.real, 0);

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => onNav('produccion-of')}><Icon name="back" size={14} /></button>
        <div>
          <h1>{of.codigo}</h1>
          <div className="sub">{of.cliente_nombre} · {of.os_id} · {of.descripcion}</div>
        </div>
        <div className="spacer" />
        <OFBadge estado={of.estado} />
      </div>

      <CardGrid min={190}>
        <Kpi label="Avance global" value={`${calcOFProgress(of)}%`} sub={`${(of.secuencia_ots || []).length} OTs secuenciadas`} />
        <Kpi label="Compromiso" value={of.fecha_compromiso} sub={dayLabel(of.fecha_compromiso)} />
        <Kpi label="Precio OS" value={fmtMoney(of.precio_os, of.moneda)} sub={of.moneda} />
        <Kpi label="NC abiertas" value={openNCs.length} sub="Bloqueo hard si > 0" tone={openNCs.length ? 'red' : 'green'} />
      </CardGrid>

      <div className="tabs" style={{ marginTop: 20 }}>
        {tabs.map(([id, label]) => <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {tab === 'secuencia' && (
        <div className="card">
          <SectionTitle title="Linea de tiempo de OTs" hint="Prerequisitos, gates, avance, tecnico y eficiencia MTM" />
          <div className="card-body" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 24 }}>
            {(of.secuencia_ots || []).map(ot => {
              const locked = isOTLocked(of, ot);
              const active = selectedOTId === ot.ot_id;
              const otGate = gateForOT(of, ot);
              const otGateRecord = otGate ? gateRecords[gateRecordKey(of.id, otGate.id)] : null;
              const gateOpen = otGate && !isGateDone(otGate, otGateRecord);
              return (
                <div
                  key={ot.ot_id}
                  className="card"
                  onClick={() => setSelectedOTId(ot.ot_id)}
                  style={{
                    minWidth: 230,
                    padding: 14,
                    cursor: 'pointer',
                    borderTop: `3px solid ${AREA_COLORS[ot.area] || 'var(--slate)'}`,
                    borderColor: active ? 'var(--cyan)' : locked ? 'var(--red)' : 'var(--card-border)',
                    background: active ? 'var(--cyan-soft)' : 'white',
                    boxShadow: active ? '0 0 0 2px rgba(0,188,212,0.18)' : 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong className="mono">{ot.ot_id}</strong>
                    {locked && <span title={`Debe cerrar ${ot.prerequisito} primero`}><Icon name="lock" size={13} /></span>}
                    {gateOpen && <Badge kind="orange" dot={false}>Gate</Badge>}
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 8 }}>{ot.proceso}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 8px' }}>{AREA_LABELS[ot.area] || ot.area} · {ot.tecnico || 'Sin tecnico'}</div>
                  <OTBadge estado={ot.estado} locked={locked} />
                  <div style={{ marginTop: 12 }}><ProgressBar pct={ot.avance_pct} color={AREA_COLORS[ot.area]} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                    <Meta label="Plan" value={fmtHours(ot.horas_est)} />
                    <Meta label="Real" value={fmtHours(ot.horas_real)} />
                    <Meta label="MTM" value={ot.mtm_sistema} />
                    <Meta label="Efic." value={ot.eficiencia_pct != null ? `${ot.eficiencia_pct}%` : '-'} />
                  </div>
                  {ot.prerequisito && <div style={{ marginTop: 10, fontSize: 11, color: locked ? 'var(--red)' : 'var(--green)' }}>Prerequisito: {ot.prerequisito}</div>}
                </div>
              );
            })}
            <div style={{ minWidth: 380, maxWidth: 420, border: '1px solid var(--card-border)', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
              <SectionTitle title={selectedOT ? selectedOT.ot_id : 'Seleccione una OT'} hint="Panel operativo" />
              {selectedOT ? (
                <div>
                  <div className="card-body" style={{ display: 'grid', gap: 12, borderBottom: '1px solid var(--card-border)' }}>
                    <CardGrid min={140}>
                      <Meta label="Area" value={AREA_LABELS[selectedOT.area] || selectedOT.area} />
                      <Meta label="Proceso" value={selectedOT.proceso} />
                      <Meta label="Tecnico" value={selectedOT.tecnico} />
                      <Meta label="Plan" value={fmtHours(selectedOT.horas_est)} />
                      <Meta label="Avance" value={`${selectedOT.avance_pct || 0}%`} />
                      <Meta label="Estado" value={OT_STATES[selectedOT.estado]?.label || selectedOT.estado} />
                    </CardGrid>
                  </div>

                  {selectedGate && !isGateDone(selectedGate, selectedGateRecord) && (
                    <div style={{ borderBottom: '1px solid var(--card-border)' }}>
                      <SectionTitle title={`Gate ${selectedGate.numero} - ${selectedGate.nombre}`} hint={selectedGate.requisito} />
                      <GateForm
                        key={`detalle-${of.id}-${selectedGate.id}-${Boolean(selectedGateRecord)}`}
                        gate={selectedGate}
                        of={of}
                        ot={selectedOT}
                        existingRecord={selectedGateRecord}
                        onConfirm={registerDetailGate}
                      />
                    </div>
                  )}

                  {selectedGate && isGateDone(selectedGate, selectedGateRecord) && (
                    <div className="card-body" style={{ borderBottom: '1px solid var(--card-border)' }}>
                      <AlertLine tone="green">
                        {selectedGate.id} aprobado: {gateRecordSummary(selectedGate, selectedGateRecord)}
                      </AlertLine>
                    </div>
                  )}

                  {!selectedGate && (
                    <div className="card-body" style={{ borderBottom: '1px solid var(--card-border)' }}>
                      <AlertLine tone="green">Esta OT no tiene Gate PCC activo.</AlertLine>
                    </div>
                  )}

                  <div className="card-body" style={{ display: 'grid', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>Historial de Gates de esta OT</strong>
                    {completedGatesForSelected.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin Gates completados en esta OT.</div>}
                    {completedGatesForSelected.map(({ gate, record }) => (
                      <AlertLine key={gate.id} tone="green">
                        <strong>{gate.id}</strong> · {record?.fecha_hora || 'registrado'} · {gateRecordSummary(gate, record)}
                      </AlertLine>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card-body"><AlertLine tone="orange">Seleccione una OT de la linea de tiempo para ver su Gate y su historial.</AlertLine></div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'bom' && (
        <div className="card">
          <SectionTitle title="BOM planificado versus real" hint="Desviaciones resaltadas y materiales no planificados" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Codigo</th><th>Planificado</th><th>Real</th><th>Desviacion</th></tr></thead>
              <tbody>
                {(of.bom_real || []).map(real => {
                  const plan = (of.bom_planificado || []).find(p => p.codigo === real.codigo);
                  const delta = Number(real.cantidad || 0) - Number(plan?.cantidad || 0);
                  const changed = real.no_planificado || delta !== 0 || real.motivo_desviacion;
                  return (
                    <tr key={real.codigo}>
                      <td className="mono">{real.codigo}</td>
                      <td>{plan ? `${plan.cantidad} ${plan.unidad} · ${plan.descripcion}` : <Badge kind="orange">No planificado</Badge>}</td>
                      <td style={{ background: changed ? '#FFFBEB' : undefined }}>{real.cantidad} {real.unidad} · {real.descripcion}</td>
                      <td>{real.motivo_desviacion || (delta ? `${delta > 0 ? '+' : ''}${delta}` : '-')}</td>
                    </tr>
                  );
                })}
                <tr className="total-row"><td>Total</td><td>{fmtMoney(planned, of.moneda)}</td><td>{fmtMoney(actual, of.moneda)}</td><td>{fmtMoney(actual - planned, of.moneda)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'calidad' && (
        <CardGrid min={360}>
          <div className="card">
            <SectionTitle title="Plan de Control de Calidad" hint="Gates obligatorios del MES" />
            <div className="card-body" style={{ display: 'grid', gap: 8 }}>
              {(of.pcc_gates || []).map(g => (
                <AlertLine key={g.id} tone={gateTone(g)}>
                  <strong>{g.id}</strong> · {g.nombre} · {gateStatusLabel(g)}<br />
                  <span style={{ color: 'var(--text-muted)' }}>{g.requisito} · Registro: {gateRecordSummary(g)}</span>
                </AlertLine>
              ))}
            </div>
          </div>
          <div className="card">
            <SectionTitle title="Resultado QC" hint={of.tipo_qc} />
            <div className="card-body">
              {(of.historial_qc || []).map(qc => (
                <div key={qc.fecha}>
                  <Badge kind="green">Aprobada</Badge>
                  <div style={{ margin: '10px 0', fontWeight: 700 }}>Inspector: {qc.inspector} · Firma {qc.firma}</div>
                  <table className="tbl">
                    <tbody>{qc.criterios.map(c => <tr key={c.criterio}><td>{c.criterio}</td><td>{c.requerido}</td><td><strong>{c.valor}</strong></td><td><Badge kind="green">{c.resultado}</Badge></td></tr>)}</tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </CardGrid>
      )}

      {tab === 'pasaporte' && (
        <PasaportePanel passport={passport} onNav={onNav} />
      )}

      {tab === 'entrega' && (
        <div className="card">
          <SectionTitle title="Entrega de la OF" hint="Entrega fisica o instalacion en equipo" />
          <div className="card-body">
            <CardGrid min={220}>
              <Meta label="Tipo de entrega" value={of.entrega?.tipo === 'instalacion_en_equipo' ? 'Instalacion en equipo' : 'Entrega fisica'} />
              <Meta label="Equipo destino" value={of.entrega?.equipo_destino} />
              <Meta label="OT instalacion" value={of.entrega?.ot_instalacion_id} />
              <Meta label="Garantia" value={of.garantia?.aplica ? `${of.garantia.periodo_dias} dias` : 'No aplica'} />
            </CardGrid>
            <AlertLine tone="green" style={{ marginTop: 16 }}>Gate 5 aprobado. La guia de remision queda habilitada para despacho o instalacion.</AlertLine>
          </div>
        </div>
      )}

      {tab === 'economico' && (
        <div className="card">
          <SectionTitle title="Tab economico de la OF" hint="Planificado vs real, margen y factura" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Concepto</th><th className="num">Planificado</th><th className="num">Real</th><th className="num">Desviacion</th></tr></thead>
              <tbody>
                {econ.map(row => <tr key={row.concepto}><td>{row.concepto}</td><td className="num">{fmtMoney(row.planificado, of.moneda)}</td><td className="num">{fmtMoney(row.real, of.moneda)}</td><td className="num">{fmtMoney(row.real - row.planificado, of.moneda)}</td></tr>)}
                <tr className="total-row"><td>Total costo</td><td className="num">{fmtMoney(plannedTotal, of.moneda)}</td><td className="num">{fmtMoney(actualTotal, of.moneda)}</td><td className="num">{fmtMoney(actualTotal - plannedTotal, of.moneda)}</td></tr>
                <tr><td>Precio OS</td><td></td><td className="num"><strong>{fmtMoney(of.precio_os, of.moneda)}</strong></td><td></td></tr>
                <tr><td>Margen bruto</td><td className="num">{fmtMoney(of.precio_os - plannedTotal, of.moneda)}</td><td className="num">{fmtMoney(of.precio_os - actualTotal, of.moneda)}</td><td className="num">{(((of.precio_os - actualTotal) / of.precio_os) * 100).toFixed(1)}%</td></tr>
              </tbody>
            </table>
          </div>
          {of.factura && <div className="card-body"><AlertLine tone="green">Factura {of.factura.id} generada por {fmtMoney(of.factura.monto, of.factura.moneda)} · vence {of.factura.vencimiento}.</AlertLine></div>}
        </div>
      )}

      <FooterBrand />
    </div>
  );
};

export const PlanificacionOFPage = () => {
  const plan = ZAHORY_SAC_DATA.planificacion_produccion || { dias: [], centros: [] };
  const [resolved, setResolved] = useState(false);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Planificacion de OF</h1>
          <div className="sub">Carga proyectada, cuello de botella y ruta critica a 15 dias</div>
        </div>
      </div>

      <CardGrid min={260}>
        <Kpi label="Cuello de botella" value="Torno CNC" sub={resolved ? 'Alerta resuelta por reprogramacion' : '140% de carga en D3'} tone={resolved ? 'green' : 'red'} />
        <Kpi label="Ruta critica OF-2026-018" value="14 dias" sub="Incluye 2 dias de cromado externo" />
        <Kpi label="Entrega estimada" value="2026-05-29" sub="Visible en ficha de OS cliente" />
        <Kpi label="OT reprogramada" value={resolved ? 'OT-PRD-041' : '-'} sub={resolved ? '+1 dia sin impacto cliente' : 'Pendiente decision'} />
      </CardGrid>

      <div className="card" style={{ marginTop: 16 }}>
        <SectionTitle title="Grilla de ocupacion por centro de trabajo" hint="Rojo cuando supera 100%" action={<button className="btn btn-cyan btn-sm" onClick={() => setResolved(true)}>Reprogramar OT-PRD-041 +1 dia</button>} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Centro</th>{plan.dias.map(d => <th key={d}>{d}</th>)}</tr></thead>
            <tbody>
              {plan.centros.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.nombre}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.area}</div>{c.cuello_botella && <Badge kind="red">Cuello</Badge>}</td>
                  {c.carga.map((v, i) => {
                    const val = resolved && c.id === 'CT-CNC' && i === 2 ? 96 : v;
                    return <td key={i} style={{ background: val > 100 ? '#FEE2E2' : val > 85 ? '#FFF7ED' : '#F8FAFC', color: val > 100 ? 'var(--red)' : 'inherit', fontWeight: 700 }}>{val}%</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {resolved ? <AlertLine tone="green">OT-PRD-041 movida un dia. La ruta critica de OF-2026-018 queda limpia.</AlertLine> : <AlertLine tone="red">{plan.centros.find(c => c.cuello_botella)?.alerta}</AlertLine>}
      </div>
      <FooterBrand />
    </div>
  );
};

// 4. Control de Produccion MES
export const ControlProduccion = ({ onNav, setCurrentOF }) => {
  const baseOTs = useMemo(() => getAllOTs().map(ot => {
    if (ot.ot_id === 'OT-PRD-037') return { ...ot, prerequisito: 'OT-PRD-041' };
    return ot;
  }), []);
  const [ots, setOts] = useState(() => baseOTs);
  const [selectedKey, setSelectedKey] = useState(null);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState({ pct: 0, hours: 1, extra: false, material: '', motive: '' });
  const [gateRecords, setGateRecords] = useState({});
  const [materialsByOT, setMaterialsByOT] = useState({});
  const [localNCs, setLocalNCs] = useState([]);
  const [performanceByOT, setPerformanceByOT] = useState({});
  const [eventDraft, setEventDraft] = useState({ causa: 'dureza', otro: '' });
  const [approvalObs, setApprovalObs] = useState('');

  const makeKey = (ot) => `${ot.of.id}:${ot.ot_id}`;
  const selectedOT = selectedKey
    ? ots.find(ot => makeKey(ot) === selectedKey)
    : null;

  const selectedGate = gateForOT(selectedOT?.of, selectedOT);
  const selectedGateRecord = selectedGate ? gateRecords[gateRecordKey(selectedOT.of.id, selectedGate.id)] : null;
  const selectedMaterials = selectedKey ? (materialsByOT[selectedKey] || []) : [];
  const selectedPerformance = selectedKey ? performanceByOT[selectedKey] : null;
  const selectedNCs = selectedOT
    ? [
        ...(ZAHORY_SAC_DATA.no_conformidades_produccion || []).filter(n => n.of_id === selectedOT.of.id && n.ot_id === selectedOT.ot_id),
        ...localNCs.filter(n => n.of_id === selectedOT.of.id && n.ot_id === selectedOT.ot_id),
      ]
    : [];

  const isLocalPrereqClosed = (ot) => {
    if (!ot?.prerequisito) return true;
    if (ot.ot_id === 'OT-PRD-042') return true;
    const prereq = ots.find(candidate => candidate.of.id === ot.of.id && candidate.ot_id === ot.prerequisito);
    return prereq?.estado === 'cerrada';
  };

  const selectedLocked = Boolean(selectedOT && selectedOT.estado !== 'cerrada' && !isLocalPrereqClosed(selectedOT));
  const prerequisiteOT = selectedOT?.prerequisito
    ? ots.find(ot => ot.of.id === selectedOT.of.id && ot.ot_id === selectedOT.prerequisito)
    : null;
  const hasGateActive = Boolean(
    selectedOT &&
    selectedOT.estado === 'en_ejecucion' &&
    Number(selectedOT.avance_pct || 0) >= 100 &&
    selectedGate &&
    !isGateDone(selectedGate, selectedGateRecord)
  );
  const hasPerformanceEvent = Boolean(
    selectedOT &&
    selectedOT.estado === 'en_ejecucion' &&
    selectedPerformance?.active &&
    !hasGateActive
  );
  const completedGateRecords = selectedOT
    ? (selectedOT.of.pcc_gates || [])
        .filter(g => g.ot_id === selectedOT.ot_id)
        .map(g => ({ gate: g, record: gateRecords[gateRecordKey(selectedOT.of.id, g.id)] }))
        .filter(({ gate, record }) => isGateDone(gate, record))
    : [];

  const selectOT = (ot) => {
    const key = makeKey(ot);
    setSelectedKey(key);
    setCurrentOF?.(ot.of.id);
    setProgress({ pct: ot.avance_pct || 0, hours: 1, extra: false, material: '', motive: '' });
    setEventDraft({ causa: 'dureza', otro: '' });
    setApprovalObs('');
    setMessage('');
  };

  const clearSelection = () => {
    setSelectedKey(null);
    setMessage('');
  };

  const selectPrerequisite = () => {
    if (!selectedOT?.prerequisito) return;
    const prereq = ots.find(ot => ot.of.id === selectedOT.of.id && ot.ot_id === selectedOT.prerequisito);
    if (prereq) {
      selectOT(prereq);
      return;
    }
    setCurrentOF?.(selectedOT.of.id);
    onNav?.('produccion-detalle-of');
  };

  const updateSelectedOT = (updater) => {
    if (!selectedKey) return;
    setOts(current => current.map(ot => makeKey(ot) === selectedKey ? { ...ot, ...updater(ot) } : ot));
  };

  const submitProgress = () => {
    if (!selectedOT) return;
    if (progress.extra && (!progress.material.trim() || !progress.motive.trim())) {
      setMessage('MES bloquea el avance: material no planificado requiere motivo antes de continuar.');
      return;
    }
    const pct = Math.max(0, Math.min(100, Number(progress.pct || 0)));
    const sessionHours = Math.max(0, Number(progress.hours || 0));
    const newRealHours = Number(selectedOT.horas_real || 0) + sessionHours;
    const closeRequest = pct >= 100;

    updateSelectedOT(() => ({
      avance_pct: pct,
      horas_real: newRealHours,
      estado: closeRequest ? 'pendiente_aprobacion' : 'en_ejecucion',
    }));

    if (progress.extra) {
      setMaterialsByOT(prev => ({
        ...prev,
        [selectedKey]: [
          ...(prev[selectedKey] || []),
          { material: progress.material, motivo: progress.motive, horas_sesion: sessionHours },
        ],
      }));
    }

    if (newRealHours > Number(selectedOT.horas_est || 0) * 1.15) {
      setPerformanceByOT(prev => ({
        ...prev,
        [selectedKey]: {
          active: true,
          horas_plan: Number(selectedOT.horas_est || 0),
          horas_real: newRealHours,
          exceso_pct: Math.round(((newRealHours - Number(selectedOT.horas_est || 0)) / Math.max(1, Number(selectedOT.horas_est || 0))) * 100),
        },
      }));
    }

    setMessage(closeRequest
      ? `${selectedOT.ot_id}: solicitud de cierre enviada. La OT queda pendiente de aprobacion del jefe de taller.`
      : `Avance registrado para ${selectedOT.ot_id}: ${pct}% y ${sessionHours} h de sesion.`
    );
  };

  const resolvePerformanceEvent = () => {
    if (!selectedKey || !selectedPerformance?.active) return;
    if (eventDraft.causa === 'otro' && !eventDraft.otro.trim()) {
      setMessage('Debe registrar la causa libre para resolver el evento de rendimiento.');
      return;
    }
    const labels = {
      desgaste: 'Desgaste de herramienta',
      dureza: 'Dureza inusual del material',
      falla: 'Falla de equipo',
      setup: 'Setup adicional',
      mtm: 'Error de estimacion MTM',
      otro: eventDraft.otro,
    };
    setPerformanceByOT(prev => ({
      ...prev,
      [selectedKey]: { ...prev[selectedKey], active: false, causa: labels[eventDraft.causa] },
    }));
    setMessage(`Evento de rendimiento resuelto para ${selectedOT.ot_id}: ${labels[eventDraft.causa]}.`);
  };

  const registerGate = (record) => {
    if (!selectedOT) return;
    setGateRecords(prev => ({ ...prev, [gateRecordKey(selectedOT.of.id, record.gate_id)]: record }));
    setMessage(`${record.gate_id} aprobado para ${selectedOT.ot_id}. El MES registra fecha, tecnico y valores, y muestra el avance normal.`);
  };

  const observeGate = (record) => {
    if (!selectedOT) return;
    const nc = {
      id: `NC-GATE-${String(localNCs.length + 1).padStart(3, '0')}`,
      of_id: selectedOT.of.id,
      ot_id: selectedOT.ot_id,
      area: selectedOT.area,
      fecha: TODAY,
      descripcion: `Gate ${record.gate_id} observado: ${record.criterios_fallidos?.map(c => `${c.campo} ${c.criterio}`).join(' - ')}`,
      origen: 'Gate PCC fallido',
      causa_raiz: record.observaciones,
      accion_correctiva: 'Retener avance de OT hasta corregir criterio PCC.',
      responsable: selectedOT.tecnico,
      estado: 'abierta',
      fecha_cierre: null,
    };
    setLocalNCs(prev => [...prev, nc]);
    setMessage(`${nc.id} generada automaticamente para ${selectedOT.ot_id}. El Gate queda pendiente hasta correccion.`);
  };

  const approveClose = () => {
    if (!selectedOT) return;
    updateSelectedOT(() => ({
      estado: 'cerrada',
      avance_pct: 100,
      fin_ts: gateRecordedAt(),
      aprobador: 'A. Parado',
    }));
    setMessage(`${selectedOT.ot_id} cerrada y aprobada. Si existe una OT siguiente, queda desbloqueada por prerequisito.`);
  };

  const returnToExecution = () => {
    if (!selectedOT) return;
    if (!approvalObs.trim()) {
      setMessage('Para devolver la OT debe registrar una observacion obligatoria.');
      return;
    }
    updateSelectedOT(() => ({
      estado: 'en_ejecucion',
      observacion_devolucion: approvalObs,
    }));
    setMessage(`${selectedOT.ot_id} devuelta a ejecucion: ${approvalObs}.`);
    setApprovalObs('');
  };

  const renderProgressBlock = () => {
    const closeRequest = Number(progress.pct || 0) >= 100;
    return (
      <div className="card">
        <SectionTitle title="Registro de avance" hint="Ejecucion normal de la OT seleccionada" />
        <div className="card-body" style={{ display: 'grid', gap: 10 }}>
          <CardGrid min={180}>
            <Field label="Avance %"><Input type="number" min="0" max="100" value={progress.pct} onChange={e => setProgress(p => ({ ...p, pct: e.target.value }))} /></Field>
            <Field label="Horas de la sesion"><Input type="number" min="0" step="0.25" value={progress.hours} onChange={e => setProgress(p => ({ ...p, hours: e.target.value }))} /></Field>
          </CardGrid>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={progress.extra} onChange={e => setProgress(p => ({ ...p, extra: e.target.checked }))} />
            Consumi material no planificado
          </label>
          {progress.extra && (
            <CardGrid min={220}>
              <Field label="Descripcion del material"><Input value={progress.material} onChange={e => setProgress(p => ({ ...p, material: e.target.value }))} placeholder="Ej. Aditivo de limpieza" /></Field>
              <Field label="Motivo"><Input value={progress.motive} onChange={e => setProgress(p => ({ ...p, motive: e.target.value }))} placeholder="Explique la desviacion" /></Field>
            </CardGrid>
          )}
          <button className="btn btn-cyan" onClick={submitProgress}>{closeRequest ? 'Solicitar cierre' : 'Registrar avance'}</button>
        </div>
      </div>
    );
  };

  const renderActionBlocks = () => {
    if (!selectedOT) {
      return (
        <div className="card-body">
          <AlertLine tone="orange">Seleccione una OT del tablero para registrar avance, resolver Gates o revisar su estado.</AlertLine>
        </div>
      );
    }

    if (selectedLocked) {
      return (
        <div className="card">
          <SectionTitle title="OT bloqueada por prerequisito" hint="La OT no puede iniciar ni avanzar" />
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            <AlertLine tone="red">
              {selectedOT.ot_id} requiere cerrar <strong>{selectedOT.prerequisito}</strong> antes de continuar. Estado actual: <strong>{OT_STATES[prerequisiteOT?.estado]?.label || prerequisiteOT?.estado || 'No encontrado'}</strong>.
            </AlertLine>
            <button className="btn btn-cyan" onClick={selectPrerequisite}><Icon name="arrow" size={14} /> Seleccionar OT prerequisito</button>
          </div>
        </div>
      );
    }

    if (hasGateActive) {
      return (
        <div className="card">
          <SectionTitle title={`Gate ${selectedGate?.numero} - ${selectedGate?.nombre}`} hint={selectedGate?.requisito} />
          <GateForm
            key={`mes-${selectedOT.of.id}-${selectedGate.id}-${Boolean(selectedGateRecord)}`}
            gate={selectedGate}
            of={selectedOT.of}
            ot={selectedOT}
            existingRecord={selectedGateRecord}
            onConfirm={registerGate}
            onObserve={observeGate}
          />
        </div>
      );
    }

    if (selectedOT.estado === 'pendiente_aprobacion') {
      return (
        <div className="card">
          <SectionTitle title="Aprobacion de cierre" hint="Accion de jefe de taller o gerente" />
          <div className="card-body" style={{ display: 'grid', gap: 12 }}>
            <CardGrid min={170}>
              <Meta label="Horas plan" value={fmtHours(selectedOT.horas_est)} />
              <Meta label="Horas reales" value={fmtHours(selectedOT.horas_real)} />
              <Meta label="Materiales no plan." value={selectedMaterials.length} />
              <Meta label="Gates completados" value={completedGateRecords.length} />
              <Meta label="NCs vinculadas" value={selectedNCs.length} />
            </CardGrid>
            {selectedMaterials.length > 0 && <AlertLine tone="orange">Materiales extra: {selectedMaterials.map(m => `${m.material} (${m.motivo})`).join(' - ')}</AlertLine>}
            {completedGateRecords.map(({ gate, record }) => <AlertLine key={gate.id} tone="green"><strong>{gate.id}</strong>: {gateRecordSummary(gate, record)}</AlertLine>)}
            {selectedNCs.map(nc => <AlertLine key={nc.id} tone={nc.estado === 'abierta' ? 'red' : 'green'}><strong>{nc.id}</strong>: {nc.descripcion}</AlertLine>)}
            <Field label="Observacion para devolver">
              <Input value={approvalObs} onChange={e => setApprovalObs(e.target.value)} placeholder="Obligatoria solo si se devuelve la OT" />
            </Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-cyan" onClick={approveClose}>Aprobar cierre</button>
              <button className="btn btn-ghost" onClick={returnToExecution}>Devolver con observacion</button>
            </div>
          </div>
        </div>
      );
    }

    if (selectedOT.estado === 'cerrada') {
      return (
        <div className="card">
          <SectionTitle title="OT cerrada" hint="Solo lectura" />
          <div className="card-body" style={{ display: 'grid', gap: 12 }}>
            <CardGrid min={160}>
              <Meta label="Inicio" value={selectedOT.inicio_ts || selectedOT.fecha_inicio} />
              <Meta label="Fin" value={selectedOT.fin_ts || '-'} />
              <Meta label="Horas reales" value={fmtHours(selectedOT.horas_real)} />
              <Meta label="Eficiencia MTM" value={selectedOT.eficiencia_pct != null ? `${selectedOT.eficiencia_pct}%` : '-'} />
              <Meta label="Aprobador" value={selectedOT.aprobador || selectedOT.of.jefe_taller} />
            </CardGrid>
            {selectedMaterials.length > 0 && <AlertLine tone="orange">Materiales: {selectedMaterials.map(m => `${m.material} (${m.motivo})`).join(' - ')}</AlertLine>}
            {completedGateRecords.map(({ gate, record }) => <AlertLine key={gate.id} tone="green"><strong>{gate.id}</strong>: {gateRecordSummary(gate, record)}</AlertLine>)}
            {selectedNCs.length > 0 && selectedNCs.map(nc => <AlertLine key={nc.id} tone={nc.estado === 'abierta' ? 'red' : 'green'}><strong>{nc.id}</strong>: {nc.descripcion}</AlertLine>)}
          </div>
        </div>
      );
    }

    return (
      <CardGrid min={360}>
        {hasPerformanceEvent && (
          <div className="card">
            <SectionTitle title="Evento de rendimiento" hint="Tiempo real > 15% sobre MTM" />
            <div className="card-body" style={{ display: 'grid', gap: 10 }}>
              <CardGrid min={150}>
                <Meta label="Horas MTM" value={fmtHours(selectedPerformance.horas_plan)} />
                <Meta label="Horas reales" value={fmtHours(selectedPerformance.horas_real)} />
                <Meta label="Exceso" value={`${selectedPerformance.exceso_pct}%`} />
              </CardGrid>
              <Field label="Causa">
                <Select value={eventDraft.causa} onChange={e => setEventDraft(d => ({ ...d, causa: e.target.value }))}>
                  <option value="desgaste">Desgaste de herramienta</option>
                  <option value="dureza">Dureza inusual del material</option>
                  <option value="falla">Falla de equipo</option>
                  <option value="setup">Setup adicional</option>
                  <option value="mtm">Error de estimacion MTM</option>
                  <option value="otro">Otro</option>
                </Select>
              </Field>
              {eventDraft.causa === 'otro' && <Field label="Causa libre"><Input value={eventDraft.otro} onChange={e => setEventDraft(d => ({ ...d, otro: e.target.value }))} /></Field>}
              <button className="btn btn-cyan" onClick={resolvePerformanceEvent}>Registrar causa y resolver evento</button>
            </div>
          </div>
        )}
        {renderProgressBlock()}
      </CardGrid>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Control de Produccion MES</h1>
          <div className="sub">Inicio/fin de OTs, avance, gates, eficiencia MTM y perdidas de rendimiento</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle title="Piso de planta por area" hint="Tarjetas operativas de OTs activas" />
        <div
          className="card-body"
          onClick={clearSelection}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}
        >
          {PRODUCTIVE_AREAS.map(area => {
            const areaOTs = ots.filter(ot => ot.area === area && ot.estado !== 'cerrada');
            return (
              <div key={area} className="card" style={{ padding: 12, borderTop: `3px solid ${AREA_COLORS[area]}`, minHeight: 160 }}>
                <strong>{AREA_LABELS[area]}</strong>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {areaOTs.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sin OTs activas</div>}
                  {areaOTs.map(ot => {
                    const key = makeKey(ot);
                    const active = selectedKey === key;
                    const locked = !isLocalPrereqClosed(ot);
                    const otGate = gateForOT(ot.of, ot);
                    const otGateRecord = otGate ? gateRecords[gateRecordKey(ot.of.id, otGate.id)] : null;
                    const gateOpen = ot.estado === 'en_ejecucion' && Number(ot.avance_pct || 0) >= 100 && otGate && !isGateDone(otGate, otGateRecord);
                    return (
                      <button
                        key={ot.ot_id}
                        className="card"
                        onClick={e => { e.stopPropagation(); selectOT(ot); }}
                        style={{
                          textAlign: 'left',
                          padding: 10,
                          borderColor: active ? AREA_COLORS[area] : locked ? 'var(--red)' : 'var(--card-border)',
                          background: active ? 'var(--cyan-soft)' : 'white',
                          boxShadow: active ? `0 0 0 2px ${AREA_COLORS[area]}33` : 'var(--shadow-sm)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong className="mono">{ot.ot_id}</strong>
                          {locked && <Icon name="lock" size={12} />}
                          {gateOpen && <Badge kind="orange" dot={false}>Gate</Badge>}
                          {ot.estado === 'pendiente_aprobacion' && <Badge kind="cyan" dot={false}>Espera</Badge>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ot.of.codigo} · {ot.tecnico}</div>
                        <ProgressBar pct={ot.avance_pct} color={AREA_COLORS[area]} />
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dayLabel(ot.of.fecha_compromiso)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <SectionTitle title="Panel de accion MES" hint={selectedOT ? `${selectedOT.ot_id} - ${selectedOT.of.codigo}` : 'Sin OT seleccionada'} />
        {selectedOT ? (
          <div className="card-body">
            {/* Encabezado */}
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'16px' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:'15px' }}>{selectedOT.ot_id}</div>
                <div style={{ fontSize:'11px', color:'#64748b' }}>{selectedOT.of.codigo} · {selectedOT.proceso} · {selectedOT.tecnico}</div>
              </div>
              <span style={{ background: selectedOT.avance_pct >= 100 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: selectedOT.avance_pct >= 100 ? '#22c55e' : '#f59e0b', fontSize:'18px', fontWeight:700, padding:'4px 12px', borderRadius:'8px' }}>
                {selectedOT.avance_pct || 0}%
              </span>
            </div>

            {/* Acciones del panel MES */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'16px' }}>
              <button onClick={() => setMessage('Registrando avance...')} style={{ padding:'12px', background:'rgba(59,130,246,0.12)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:'8px', color:'#3b82f6', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>📈 Registrar avance</button>
              {hasGateActive && <button onClick={() => setMessage('Resolviendo Gate...')} style={{ padding:'12px', background:'rgba(249,115,22,0.12)', border:'1px solid rgba(249,115,22,0.3)', borderRadius:'8px', color:'#f97316', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>🔒 Resolver Gate</button>}
              {selectedOT.avance_pct >= 100 && <button onClick={() => setMessage('Cerrando OT...')} style={{ padding:'12px', background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:'8px', color:'#22c55e', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>✓ Cerrar OT</button>}
              <button onClick={() => { setCurrentOF?.(selectedOT.of.id); onNav?.('ing-bom'); }} style={{ padding:'12px', background:'rgba(255,255,255,0.04)', border:'1px solid #1e2d47', borderRadius:'8px', color:'#94a3b8', fontSize:'12px', cursor:'pointer' }}>📋 Ver BOM consumido</button>
            </div>

            {/* Resumen de costos de la OT */}
            <div style={{ background:'rgba(6,182,212,0.06)', borderLeft:'2px solid #06b6d4', borderRadius:'0 6px 6px 0', padding:'10px 14px' }}>
              <div style={{ fontSize:'10px', color:'#64748b', marginBottom:'6px', fontFamily:'monospace', textTransform:'uppercase' }}>Costos acumulados</div>
              <div style={{ display:'flex', gap:'20px' }}>
                <div><div style={{ fontSize:'10px', color:'#475569' }}>MO</div><div style={{ fontSize:'14px', fontWeight:700, color:'#f8fafc' }}>${(selectedOT.costo_mo || 0).toFixed(2)}</div></div>
                <div><div style={{ fontSize:'10px', color:'#475569' }}>Materiales</div><div style={{ fontSize:'14px', fontWeight:700, color:'#f8fafc' }}>${(selectedOT.costo_materiales || 0).toFixed(2)}</div></div>
                <div><div style={{ fontSize:'10px', color:'#475569' }}>Total</div><div style={{ fontSize:'14px', fontWeight:700, color:'#06b6d4' }}>${((selectedOT.costo_mo || 0) + (selectedOT.costo_materiales || 0)).toFixed(2)}</div></div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color:'#475569', fontSize:'13px', padding:'20px' }}>ℹ Seleccione una OT del tablero para registrar avance, resolver Gates o revisar su estado.</div>
        )}
      </div>

      {false && selectedOT && (
        <div style={{ marginBottom: 16 }}>
          <AlertLine tone={selectedLocked ? 'red' : hasGateActive ? 'orange' : 'green'}>
            <strong>{selectedOT.ot_id}</strong> seleccionada · {selectedOT.proceso || selectedOT.tipo} · {selectedOT.of.codigo} · {hasGateActive ? `Gate ${selectedGate.numero} pendiente` : (OT_STATES[selectedOT.estado]?.label || selectedOT.estado)}
          </AlertLine>
        </div>
      )}

      {false && selectedOT && (
        <CardGrid min={360}>
          {selectedOT.estado === 'cerrada' && (
            <div className="card">
              <SectionTitle title="OT cerrada" hint="Solo consulta" />
              <div className="card-body">
                <CardGrid min={150}>
                  <Meta label="Inicio" value={selectedOT.inicio_ts || selectedOT.fecha_inicio} />
                  <Meta label="Fin" value={selectedOT.fin_ts || '-'} />
                  <Meta label="Eficiencia" value={selectedOT.eficiencia_pct != null ? `${selectedOT.eficiencia_pct}%` : '-'} />
                </CardGrid>
              </div>
            </div>
          )}

          {selectedOT.estado !== 'cerrada' && selectedLocked && (
            <div className="card">
              <SectionTitle title="Prerequisito bloqueado" hint="La OT no puede iniciar ni avanzar" />
              <div className="card-body" style={{ display: 'grid', gap: 10 }}>
                <AlertLine tone="red">
                  {selectedOT.ot_id} requiere cerrar <strong>{selectedOT.prerequisito}</strong> antes de continuar.
                </AlertLine>
                <button className="btn btn-cyan" onClick={selectPrerequisite}><Icon name="arrow" size={14} /> Ir a OT prerequisito</button>
              </div>
            </div>
          )}

          {selectedOT.estado !== 'cerrada' && !selectedLocked && readyForClose && (
            <div className="card">
              <SectionTitle title="Cierre tecnico" hint="Requiere aprobacion del jefe de taller" />
              <div className="card-body" style={{ display: 'grid', gap: 10 }}>
                <AlertLine tone="green">Avance al 100%. La OT esta lista para cierre tecnico.</AlertLine>
                <button className="btn btn-cyan" onClick={requestClose}>Solicitar aprobacion a jefe de taller</button>
              </div>
            </div>
          )}

          {selectedOT.estado !== 'cerrada' && !selectedLocked && !readyForClose && hasGateActive && (
            <div className="card">
              <SectionTitle title={`Gate ${selectedGate?.numero} - ${selectedGate?.nombre}`} hint={selectedGate?.requisito} />
              <GateForm
                key={`mes-${selectedOT.of.id}-${selectedGate.id}-${Boolean(selectedGateRecord)}`}
                gate={selectedGate}
                of={selectedOT.of}
                ot={selectedOT}
                existingRecord={selectedGateRecord}
                onConfirm={registerGate}
              />
            </div>
          )}

          {selectedOT.estado !== 'cerrada' && !selectedLocked && !readyForClose && !hasGateActive && (
            <div className="card">
              <SectionTitle title="Registro de avance" hint="Ejecucion normal de la OT seleccionada" />
              <div className="card-body" style={{ display: 'grid', gap: 10 }}>
                <Field label="Avance %"><Input type="number" value={progress.pct} onChange={e => setProgress(p => ({ ...p, pct: e.target.value }))} /></Field>
                <Field label="Horas sesion"><Input type="number" value={progress.hours} onChange={e => setProgress(p => ({ ...p, hours: e.target.value }))} /></Field>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={progress.extra} onChange={e => setProgress(p => ({ ...p, extra: e.target.checked }))} />
                  Consumio material no planificado
                </label>
                {progress.extra && <Field label="Motivo"><Input value={progress.motive} onChange={e => setProgress(p => ({ ...p, motive: e.target.value }))} placeholder="Explique la desviacion" /></Field>}
                <button className="btn btn-cyan" onClick={submitProgress}>Registrar avance</button>
              </div>
            </div>
          )}

          {selectedOT.estado !== 'cerrada' && !selectedLocked && !readyForClose && !hasGateActive && hasPerformanceEvent && (
            <div className="card">
              <SectionTitle title="Evento de rendimiento" hint="Tiempo real > 15% sobre MTM" />
              <div className="card-body" style={{ display: 'grid', gap: 10 }}>
                <AlertLine tone="red">{selectedOT.ot_id} supero el MTM nominal. Registrar causa antes de descartar el evento.</AlertLine>
                <Field label="Horas reales acumuladas"><Input type="number" value={realHours} onChange={e => setRealHours(e.target.value)} /></Field>
                <Field label="Causa"><Select defaultValue="Dureza inusual del material"><option>Dureza inusual del material</option><option>Herramienta desgastada</option><option>Falla de equipo</option><option>Fatiga del operador</option><option>Otro</option></Select></Field>
                <button className="btn btn-cyan" onClick={simulatePerformance}>Registrar causa del evento</button>
              </div>
            </div>
          )}
        </CardGrid>
      )}

      {message && <div style={{ marginTop: 16 }}><AlertLine tone={message.includes('Bloqueo') || message.includes('bloquea') || message.includes('generada') || message.includes('Evento') ? 'red' : 'green'}>{message}</AlertLine></div>}
      <FooterBrand />
    </div>
  );
};

export const TiemposMTMPage = () => {
  const tiempos = ZAHORY_SAC_DATA.tiempos_estandar || [];
  const [area, setArea] = useState('Todas');
  const filtered = area === 'Todas' ? tiempos : tiempos.filter(t => t.area === area);
  const technicians = getAllOTs().filter(ot => ot.eficiencia_pct != null);

  return (
    <div className="page">
      <div className="page-header"><div><h1>Tiempos y MTM</h1><div className="sub">Catalogo maestro: 28 TMU = 1 segundo; 100,800 TMU = 1 hora</div></div></div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Todas', ...Object.keys(AREA_LABELS)].map(a => <button key={a} className={`btn btn-sm ${area === a ? 'btn-cyan' : 'btn-ghost'}`} onClick={() => setArea(a)}>{AREA_LABELS[a] || a}</button>)}
        </div>
      </div>
      <CardGrid min={420}>
        <div className="card">
          <SectionTitle title="Catalogo MTM" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Codigo</th><th>Area</th><th>Proceso</th><th>Sistema</th><th>TMU</th><th>Horas</th><th>Uso</th><th>Efic.</th></tr></thead>
              <tbody>{filtered.map(t => <tr key={t.id}><td className="mono">{t.id}</td><td>{AREA_LABELS[t.area] || t.area}</td><td>{t.proceso}</td><td>{t.mtm_sistema}</td><td>{Number(t.tmu || 0).toLocaleString()}</td><td>{t.horas}</td><td>{t.usado_en_ofs}</td><td><Badge kind={t.eficiencia_promedio < 80 ? 'red' : t.eficiencia_promedio > 100 ? 'cyan' : 'green'}>{t.eficiencia_promedio}%</Badge></td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <SectionTitle title="Historial por tecnico y proceso" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Tecnico</th><th>OT</th><th>Proceso</th><th>Plan</th><th>Real</th><th>Efic.</th></tr></thead>
              <tbody>{technicians.map(ot => <tr key={`${ot.of.id}-${ot.ot_id}`}><td>{ot.tecnico}</td><td className="mono">{ot.ot_id}</td><td>{ot.proceso}</td><td>{fmtHours(ot.horas_est)}</td><td>{fmtHours(ot.horas_real)}</td><td><Badge kind={ot.eficiencia_pct < 80 ? 'red' : ot.eficiencia_pct > 100 ? 'cyan' : 'green'}>{ot.eficiencia_pct}%</Badge></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </CardGrid>
      <FooterBrand />
    </div>
  );
};

export const OEEPage = () => {
  const centers = ZAHORY_SAC_DATA.oee_centros_trabajo || [];
  const losses = ZAHORY_SAC_DATA.perdidas_oee || [];
  const history = ZAHORY_SAC_DATA.oee_historico || [];
  return (
    <div className="page">
      <div className="page-header"><div><h1>OEE y Rendimiento</h1><div className="sub">Disponibilidad, rendimiento, calidad y seis grandes perdidas</div></div></div>
      <CardGrid min={260}>
        {centers.map(c => <div key={c.id} className="card" style={{ padding: 16, borderTop: `3px solid ${c.alerta ? 'var(--red)' : AREA_COLORS[c.area] || 'var(--cyan)'}` }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><strong>{c.nombre}</strong>{c.alerta && <Badge kind="red">Critico</Badge>}</div><div style={{ fontSize: 34, fontWeight: 800, color: c.oee < 60 ? 'var(--red)' : 'var(--navy)', margin: '10px 0' }}>{c.oee}%</div><ProgressBar pct={c.disponibilidad} color="var(--green)" /><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Disponibilidad</div><ProgressBar pct={c.rendimiento} color="var(--orange)" /><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rendimiento</div><ProgressBar pct={c.calidad} color="var(--cyan)" /><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Calidad</div></div>)}
      </CardGrid>
      <CardGrid min={420}>
        <div className="card" style={{ marginTop: 16 }}>
          <SectionTitle title="Historico mensual por area" />
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {history.map(row => <div key={row.mes} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', alignItems: 'center', gap: 12 }}><strong>{row.mes}</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>{['Maestranza', 'Soldadura', 'Ensamble', 'Calidad'].map(k => <div key={k}><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{k}</div><ProgressBar pct={row[k]} color={k === 'Maestranza' ? AREA_COLORS.Maestranza : k === 'Soldadura' ? AREA_COLORS.Soldadura : k === 'Calidad' ? AREA_COLORS.Calidad : AREA_COLORS['Fabricacion y Ensamble']} /></div>)}</div></div>)}
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <SectionTitle title="Seis grandes perdidas" />
          <div className="table-wrap"><table className="tbl"><thead><tr><th>Categoria</th><th>Area</th><th>Horas</th><th>Ref.</th></tr></thead><tbody>{losses.map(l => <tr key={`${l.categoria}-${l.area}`}><td>{l.categoria}</td><td>{l.area}</td><td>{l.horas}</td><td>{l.referencia || '-'}</td></tr>)}</tbody></table></div>
        </div>
      </CardGrid>
      <FooterBrand />
    </div>
  );
};

export const NoConformidadesPage = () => {
  const ncs = ZAHORY_SAC_DATA.no_conformidades_produccion || [];
  const open = ncs.filter(n => n.estado === 'abierta');
  return (
    <div className="page">
      <div className="page-header"><div><h1>No Conformidades</h1><div className="sub">ISO 9001: causa raiz, accion correctiva y bloqueo hard de liberacion</div></div></div>
      {open.length > 0 && <div style={{ marginBottom: 16 }}><AlertLine tone="red">{open.length} NC abierta bloquea la transicion de su OF a "Lista para entrega".</AlertLine></div>}
      <div className="card">
        <div className="table-wrap"><table className="tbl"><thead><tr><th>NC</th><th>OF / OT</th><th>Area</th><th>Descripcion</th><th>Causa raiz</th><th>Accion</th><th>Estado</th></tr></thead><tbody>{ncs.map(n => <tr key={n.id}><td className="mono"><strong>{n.id}</strong></td><td>{n.of_id}<br /><span className="mono">{n.ot_id}</span></td><td>{n.area}</td><td>{n.descripcion}</td><td>{n.causa_raiz}</td><td>{n.accion_correctiva}</td><td><Badge kind={n.estado === 'abierta' ? 'red' : 'green'}>{n.estado}</Badge></td></tr>)}</tbody></table></div>
      </div>
      <FooterBrand />
    </div>
  );
};

export const CalidadPage = ({ onNav, setCurrentOF }) => {
  const [selected, setSelected] = useState('OF-2026-018');
  const [values, setValues] = useState({ 'HID-001': 295, 'HID-002': 268, 'HID-003': 0, 'HID-004': 412, 'HID-005': 845, 'HID-006': 0.18, 'HID-007': 1 });
  const [ncOpen, setNcOpen] = useState(true);
  const [msg, setMsg] = useState('');
  const of = getOF(selected);
  const template = (ZAHORY_SAC_DATA.criterios_qc || []).find(q => q.id === of.tipo_qc);
  const criteria = template?.criterios || [];
  const allPass = criteria.every(c => valueMeetsCriterion(c, values[c.id]) !== false && valueMeetsCriterion(c, values[c.id]) !== null);
  const pendingQC = getAllOTs().filter(ot => ot.area === 'Calidad' && ot.estado !== 'cerrada');

  const approve = () => {
    if (ncOpen) {
      setMsg('Bloqueo hard: no se puede aprobar la OF mientras exista una NC abierta vinculada.');
      return;
    }
    if (!allPass) {
      setMsg('Aprobacion deshabilitada: hay criterios QC incompletos o rechazados.');
      return;
    }
    setMsg('QC aprobado. Estado simulado de la OF: Lista para entrega.');
  };

  return (
    <div className="page">
      <div className="page-header"><div><h1>Calidad QC</h1><div className="sub">Bandeja del supervisor QC, plantillas automaticas y liberacion final</div></div></div>
      <CardGrid min={300}>
        <div className="card">
          <SectionTitle title="OTs de calidad pendientes" />
          <div className="card-body" style={{ display: 'grid', gap: 8 }}>
            {pendingQC.map(ot => <button key={ot.ot_id} className="card" style={{ textAlign: 'left', padding: 10 }} onClick={() => { setSelected(ot.of.id); setCurrentOF?.(ot.of.id); }}><strong className="mono">{ot.ot_id}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ot.of.codigo} · {ot.of.cliente_nombre}</div><OTBadge estado={ot.estado} /></button>)}
            <button className="card" style={{ textAlign: 'left', padding: 10, borderColor: 'var(--cyan)' }} onClick={() => setSelected('OF-2026-018')}><strong className="mono">OT-PRD-036</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>OF-2026-018 · caso Doe Run completo</div><Badge kind="green">Aprobada</Badge></button>
          </div>
        </div>
        <div className="card">
          <SectionTitle title={`Inspeccion ${of.tipo_qc}`} hint={of.clase_ejecucion === 'EXC3' ? 'EXC3: END reforzada + ISO 3834-2' : undefined} />
          <div className="table-wrap"><table className="tbl"><thead><tr><th>Criterio</th><th>Metodo</th><th>Valor</th><th>Resultado</th></tr></thead><tbody>{criteria.map(c => { const ok = valueMeetsCriterion(c, values[c.id]); return <tr key={c.id}><td>{c.descripcion}</td><td>{c.metodo}</td><td><Input type="number" value={values[c.id] ?? ''} onChange={e => setValues(v => ({ ...v, [c.id]: e.target.value }))} /></td><td>{ok === null ? <Badge kind="slate">Pendiente</Badge> : ok ? <Badge kind="green">Aprobado</Badge> : <Badge kind="red">Rechazado</Badge>}</td></tr>; })}</tbody></table></div>
          <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setNcOpen(true)}>Simular NC abierta</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setNcOpen(false)}>Cerrar NC demo</button>
            <button className="btn btn-cyan btn-sm" disabled={!allPass} title={!allPass ? 'Hay criterios fallidos o pendientes' : ''} onClick={approve}>Aprobar OF</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCurrentOF?.(of.id); onNav?.('produccion-detalle-of'); }}>Ver OF</button>
          </div>
        </div>
      </CardGrid>
      {msg && <div style={{ marginTop: 16 }}><AlertLine tone={msg.includes('Bloqueo') || msg.includes('deshabilitada') ? 'red' : 'green'}>{msg}</AlertLine></div>}
      <FooterBrand />
    </div>
  );
};

const PasaportePanel = ({ passport }) => {
  if (!passport) return <div className="card"><div className="card-body">Sin pasaporte para este componente.</div></div>;
  return (
    <div className="card">
      <SectionTitle title={`Pasaporte ${passport.numero_serie}`} hint={passport.cliente_propietario} action={<button className="btn btn-ghost btn-sm"><Icon name="pdf" size={13} /> PDF</button>} />
      <div className="card-body">
        <CardGrid min={180}>
          <Meta label="Componente" value={passport.descripcion} />
          <Meta label="Modelo" value={passport.modelo_compatible} />
          <Meta label="Benchmark" value={`${passport.benchmark_reconstruccion_dias} dias`} />
          <Meta label="Intervenciones" value={passport.historial.length} />
        </CardGrid>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {passport.historial.map(h => (
            <div key={h.of_id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong className="mono">{h.of_id}</strong><Badge kind={h.downtime_dias <= passport.benchmark_reconstruccion_dias ? 'green' : 'red'}>{h.downtime_dias} dias downtime</Badge>
              </div>
              <div style={{ margin: '8px 0', fontWeight: 700 }}>{h.tipo}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{h.trabajo}</div>
              {h.analisis_fluido_iso_4406 && <AlertLine tone="orange">ISO 4406 registrado: {h.analisis_fluido_iso_4406}</AlertLine>}
              {(h.gates_pcc || []).length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  <strong style={{ fontSize: 13 }}>Gates PCC registrados</strong>
                  {h.gates_pcc.map(g => (
                    <AlertLine key={g.gate_id} tone="green">
                      <strong>{g.gate_id}</strong> · {g.nombre} · {(g.valores || []).map(v => `${v.campo}: ${v.valor}`).join(' · ')}
                      <span style={{ color: 'var(--text-muted)' }}> · {g.registrado_por} · {g.fecha_hora}</span>
                    </AlertLine>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10 }}><strong>QC:</strong> {(h.qc_resultados || []).map(q => `${q.criterio}: ${q.valor}`).join(' · ') || '-'}</div>
              <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>Inspector {h.inspector} · Tecnicos {(h.tecnicos || []).join(', ')} · NCs {(h.ncs || []).join(', ') || 'sin NC'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PasaporteComponentePage = () => {
  const [serial, setSerial] = useState('CIL-IZQ-R1600G-003');
  const passport = (ZAHORY_SAC_DATA.pasaportes_componentes || []).find(p => p.numero_serie.toLowerCase().includes(serial.toLowerCase()));
  return (
    <div className="page">
      <div className="page-header"><div><h1>Pasaporte de Componente</h1><div className="sub">Trazabilidad permanente por numero de serie</div></div></div>
      <div className="card" style={{ marginBottom: 16 }}><div className="card-body"><Field label="Buscar numero de serie"><Input value={serial} onChange={e => setSerial(e.target.value)} /></Field></div></div>
      <PasaportePanel passport={passport} />
      <FooterBrand />
    </div>
  );
};

export const GarantiasPage = () => {
  const garantias = ZAHORY_SAC_DATA.garantias_produccion || [];
  const reclamos = ZAHORY_SAC_DATA.reclamos_garantia || [];
  return (
    <div className="page">
      <div className="page-header"><div><h1>Garantias</h1><div className="sub">Cobertura, reclamos, OF de garantia y costos no facturables</div></div></div>
      <CardGrid min={220}>
        <Kpi label="Garantias activas" value={garantias.filter(g => g.estado === 'activa').length} sub="Componentes cubiertos" />
        <Kpi label="Vencen 15 dias" value={garantias.filter(g => g.dias_restantes >= 0 && g.dias_restantes <= 15).length} sub="Alerta amarilla" tone="red" />
        <Kpi label="Reclamos" value={reclamos.length} sub="En evaluacion o convertidos a OF" />
        <Kpi label="Costo garantía mes" value={fmtMoney(2380)} sub="No facturable interno" />
      </CardGrid>
      <div className="card" style={{ marginTop: 16 }}>
        <SectionTitle title="Listado de garantias" />
        <div className="table-wrap"><table className="tbl"><thead><tr><th>Garantia</th><th>Componente</th><th>Cliente</th><th>OF origen</th><th>Vence</th><th>Estado</th><th>Condiciones</th></tr></thead><tbody>{garantias.map(g => <tr key={g.id}><td className="mono">{g.id}</td><td>{g.numero_serie}</td><td>{g.cliente_nombre}</td><td>{g.of_origen_id}</td><td style={{ color: g.dias_restantes <= 15 ? 'var(--orange)' : 'inherit', fontWeight: 700 }}>{g.vencimiento}<br /><span style={{ fontSize: 11 }}>{g.dias_restantes} dias</span></td><td><Badge kind={g.estado === 'activa' ? 'green' : 'orange'}>{g.estado}</Badge></td><td>{g.condiciones}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <SectionTitle title="Reclamos registrados" />
        <div className="table-wrap"><table className="tbl"><thead><tr><th>Reclamo</th><th>Falla</th><th>Procede</th><th>OF garantia</th></tr></thead><tbody>{reclamos.map(r => <tr key={r.id}><td className="mono">{r.id}</td><td>{r.descripcion_falla}</td><td><Badge kind={r.procede_garantia ? 'green' : 'red'}>{r.procede_garantia ? 'Procede' : 'No procede'}</Badge></td><td>{r.of_garantia_id}</td></tr>)}</tbody></table></div>
      </div>
      <FooterBrand />
    </div>
  );
};

export const IngenieriaBOM = ({ onNav }) => {
  const [tab, setTab] = useState('bom');
  const [bomTab, setBomTab] = useState('materiales');
  const ofs = ZAHORY_SAC_DATA.ordenes_fabricacion || [];
  const [ofSeleccionada, setOfSeleccionada] = useState(ofs[0]?.id || '');
  const ofActualBOM = ofs.find(o => o.id === ofSeleccionada) || ofs[0];
  const totalBOM = (ofActualBOM?.bom || []).reduce((s, b) => s + (b.cantidad_plan || 0) * (b.costo_unit || 0), 0);
  return (
    <div className="page">
      <div className="page-header"><div><h1>Ingenieria y BOM</h1><div className="sub">BOM historicos, PCC y entregables tecnicos por OF</div></div></div>
      <div className="tabs">{[['bom', 'BOM historicos'], ['pcc', 'Plan de Control'], ['planos', 'Planos y specs']].map(([id, label]) => <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}</div>
      
      {tab === 'bom' && (
        <div className="card">
          <SectionTitle title="Catalogo de BOMs cerrados o listos" action={<button className="btn btn-cyan btn-sm" onClick={() => onNav?.('produccion-crear-of')}>Usar como base</button>} />
          <div className="card-body" style={{ paddingBottom: 0 }}>
            <div style={{ display:'flex', gap:'20px', borderBottom:'1px solid var(--card-border)' }}>
              <button onClick={() => setBomTab('materiales')} style={{ padding:'10px 0', background:'transparent', border:'none', borderBottom: bomTab === 'materiales' ? '2px solid #0ea5e9' : '2px solid transparent', color: bomTab === 'materiales' ? '#f8fafc' : '#94a3b8', fontWeight: bomTab === 'materiales' ? 600 : 400, cursor:'pointer' }}>Materiales y Componentes</button>
              <button onClick={() => setBomTab('mtm')} style={{ padding:'10px 0', background:'transparent', border:'none', borderBottom: bomTab === 'mtm' ? '2px solid #0ea5e9' : '2px solid transparent', color: bomTab === 'mtm' ? '#f8fafc' : '#94a3b8', fontWeight: bomTab === 'mtm' ? 600 : 400, cursor:'pointer' }}>Tiempos Estándar (MTM)</button>
            </div>
          </div>
          {bomTab === 'materiales' && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)' }}>
              <select value={ofSeleccionada} onChange={e => setOfSeleccionada(e.target.value)} className="select" style={{ minWidth: 340 }}>
                {ofs.map(of => (
                  <option key={of.id} value={of.id}>{of.id} · {of.componente_descripcion || of.descripcion}</option>
                ))}
              </select>
            </div>
          )}
          <div className="table-wrap">
            {bomTab === 'materiales' && (
              <table className="tbl">
                <thead>
                  <tr><th>Código</th><th>Descripción</th><th>Unidad</th><th className="num">Plan</th><th className="num">Real</th><th className="num">Costo Unit</th><th className="num">Total Plan</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {(ofActualBOM?.bom || []).map((b, i) => (
                    <tr key={i}>
                      <td className="mono">{b.item_id}</td>
                      <td>{b.descripcion}</td>
                      <td>{b.unidad}</td>
                      <td className="num">{b.cantidad_plan}</td>
                      <td className="num" style={{ color: b.cantidad_real !== null ? '#22c55e' : '#475569' }}>{b.cantidad_real ?? '—'}</td>
                      <td className="num">${(b.costo_unit || 0).toFixed(2)}</td>
                      <td className="num">${((b.cantidad_plan || 0) * (b.costo_unit || 0)).toFixed(2)}</td>
                      <td>{b.cantidad_real !== null ? <span style={{ color: '#22c55e', fontSize: 11 }}>✓ Consumido</span> : <span style={{ color: '#475569', fontSize: 11 }}>Pendiente</span>}</td>
                    </tr>
                  ))}
                  {!(ofActualBOM?.bom?.length) && <tr><td colSpan={8} style={{ textAlign: 'center' }}>Sin materiales en BOM</td></tr>}
                </tbody>
                {ofActualBOM?.bom?.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600, paddingTop: 8 }}>Total BOM:</td>
                      <td className="num" style={{ fontWeight: 700, fontSize: 14, paddingTop: 8 }}>${totalBOM.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
            
            {bomTab === 'mtm' && (
              <table className="tbl">
                <thead>
                  <tr><th>OT</th><th>Proceso</th><th>Técnico</th><th className="num">Horas MTM</th><th className="num">Horas Real</th><th>Eficiencia</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {(ZAHORY_SAC_DATA.ots_proceso_mtm || []).map((ot, i) => (
                    <tr key={i}>
                      <td className="mono">{ot.ot}</td>
                      <td>{ot.proceso || 'Desmontaje y evaluacion'}</td>
                      <td>{ot.tecnico}</td>
                      <td className="num">{ot.plan_horas?.toFixed(1)}h</td>
                      <td className="num">{ot.real_horas ? ot.real_horas.toFixed(1) + 'h' : '—'}</td>
                      <td>
                        {ot.eficiencia ? (
                          <Badge kind={ot.eficiencia >= 100 ? 'green' : 'orange'}>{ot.eficiencia}%</Badge>
                        ) : '—'}
                      </td>
                      <td><Badge kind={ot.estado === 'Cerrada' ? 'gray' : 'cyan'}>{ot.estado}</Badge></td>
                    </tr>
                  ))}
                  {!(ZAHORY_SAC_DATA.ots_proceso_mtm?.length) && <tr><td colSpan="7" style={{ textAlign:'center' }}>Sin OTs registradas</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {tab === 'pcc' && <div className="card"><SectionTitle title="PCC OF-2026-018" hint="Gates que alimentan bloqueos MES" /><div className="card-body" style={{ display: 'grid', gap: 8 }}>{getOF('OF-2026-018').pcc_gates.map(g => <AlertLine key={g.id} tone="green"><strong>{g.id}</strong> · {g.nombre} · {g.norma}<br /><span style={{ color: 'var(--text-muted)' }}>{g.requisito}</span></AlertLine>)}</div></div>}
      {tab === 'planos' && <div className="card"><SectionTitle title="Entregables de ingenieria" /><div className="card-body"><AlertLine tone="green">OF-2026-018: Diagnostico tecnico, especificacion dimensional, BOM, MTM y PCC aprobados por Roberto Quispe.</AlertLine><AlertLine tone="orange">Clase EXC3: documentacion reforzada ISO 3834-2 visible para QC.</AlertLine></div></div>}
      <FooterBrand />
    </div>
  );
};

export const TiemposEstandarPage = () => {
  const [area, setArea] = useState('Todas');
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [standards, setStandards] = useState(() =>
    (ZAHORY_SAC_DATA.tiempos_estandar || []).map(t => ({ ...t, activo: true }))
  );
  const [notice, setNotice] = useState('');

  const filtered = area === 'Todas' ? standards : standards.filter(t => t.area === area);

  const startEdit = (standard) => {
    setEditId(standard.id);
    setDraft({ ...standard });
    setNotice('');
  };

  const saveEdit = () => {
    setStandards(prev => prev.map(t => t.id === editId ? { ...draft, horas: Number(draft.horas), tmu: Number(draft.tmu) } : t));
    setEditId(null);
    setDraft(null);
    setNotice('Estandar actualizado en la vista de configuracion. El cambio queda listo para revision tecnica.');
  };

  const addStandard = () => {
    const next = {
      id: `MTM-NUEVO-${String(standards.length + 1).padStart(2, '0')}`,
      area: 'Maestranza',
      proceso: 'Nuevo proceso estandar',
      mtm_sistema: 'MTM-MEK',
      tmu: 100800,
      horas: 1,
      unidad: 'por pieza',
      usado_en_ofs: 0,
      eficiencia_promedio: 100,
      activo: true,
    };
    setStandards(prev => [next, ...prev]);
    startEdit(next);
  };

  const toggleActive = (id) => {
    setStandards(prev => prev.map(t => t.id === id ? { ...t, activo: !t.activo } : t));
    setNotice('Estado del estandar actualizado. Los estandares inactivos no se sugieren en nuevas OTs.');
  };

  const needsRecalibration = (standard) =>
    standard.eficiencia_promedio < 85 || standard.eficiencia_promedio > 115 || Boolean(standard.ajuste_sugerido);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Tiempos Estandar</h1>
          <div className="sub">Configuracion y mejora continua del catalogo MTM base</div>
        </div>
        <div className="spacer" />
        <button className="btn btn-cyan" onClick={addStandard}><Icon name="plus" size={14} /> Nuevo estandar</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {['Todas', ...Object.keys(AREA_LABELS)].map(a => (
            <button key={a} className={`btn btn-sm ${area === a ? 'btn-cyan' : 'btn-ghost'}`} onClick={() => setArea(a)}>
              {AREA_LABELS[a] || a}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {standards.filter(t => !t.activo).length} inactivos · {standards.filter(needsRecalibration).length} para recalibrar
          </div>
        </div>
      </div>

      <div className="card">
        <SectionTitle title="Catalogo completo de estandares" hint="Crear, editar, desactivar y revisar calibracion real acumulada" />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Codigo</th><th>Area</th><th>Proceso</th><th>Sistema</th><th>TMU</th><th>Horas</th>
                <th>Unidad</th><th>Uso OFs</th><th>Efic. prom.</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const editing = editId === t.id;
                const row = editing ? draft : t;
                return (
                  <tr key={t.id} style={{ opacity: t.activo ? 1 : 0.58 }}>
                    <td className="mono"><strong>{t.id}</strong></td>
                    <td>
                      {editing ? (
                        <Select value={row.area} onChange={e => setDraft(d => ({ ...d, area: e.target.value }))}>
                          {Object.keys(AREA_LABELS).map(a => <option key={a}>{a}</option>)}
                        </Select>
                      ) : AREA_LABELS[t.area] || t.area}
                    </td>
                    <td>
                      {editing
                        ? <Input value={row.proceso} onChange={e => setDraft(d => ({ ...d, proceso: e.target.value }))} />
                        : <><strong>{t.proceso}</strong>{t.ajuste_sugerido && <div style={{ fontSize: 11, color: 'var(--orange)' }}>{t.ajuste_sugerido}</div>}</>}
                    </td>
                    <td>{editing ? <Select value={row.mtm_sistema} onChange={e => setDraft(d => ({ ...d, mtm_sistema: e.target.value }))}><option>MTM-MEK</option><option>MTM-UAS</option><option>Proveedor</option></Select> : t.mtm_sistema}</td>
                    <td>{editing ? <Input type="number" value={row.tmu} onChange={e => setDraft(d => ({ ...d, tmu: e.target.value }))} /> : Number(t.tmu || 0).toLocaleString()}</td>
                    <td>{editing ? <Input type="number" value={row.horas} onChange={e => setDraft(d => ({ ...d, horas: e.target.value }))} /> : fmtHours(t.horas)}</td>
                    <td>{editing ? <Input value={row.unidad} onChange={e => setDraft(d => ({ ...d, unidad: e.target.value }))} /> : t.unidad}</td>
                    <td>{t.usado_en_ofs}</td>
                    <td><Badge kind={t.eficiencia_promedio < 85 ? 'red' : t.eficiencia_promedio > 115 ? 'cyan' : 'green'}>{t.eficiencia_promedio}%</Badge></td>
                    <td>{needsRecalibration(t) ? <Badge kind="orange">Recalibrar</Badge> : <Badge kind={t.activo ? 'green' : 'slate'}>{t.activo ? 'Activo' : 'Inactivo'}</Badge>}</td>
                    <td>
                      {editing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-cyan btn-sm" onClick={saveEdit}>Guardar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(null); setDraft(null); }}>Cancelar</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}><Icon name="edit" size={12} /> Editar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(t.id)}>{t.activo ? 'Desactivar' : 'Activar'}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CardGrid min={320}>
        <div className="card" style={{ marginTop: 16 }}>
          <SectionTitle title="Uso acumulado" hint="Senal para mejora continua" />
          <div className="card-body" style={{ display: 'grid', gap: 8 }}>
            {standards.filter(needsRecalibration).slice(0, 4).map(t => (
              <AlertLine key={t.id} tone={t.eficiencia_promedio < 85 ? 'red' : 'orange'}>
                <strong>{t.id}</strong> · {t.proceso}<br />
                <span style={{ color: 'var(--text-muted)' }}>{t.usado_en_ofs} OFs usadas · eficiencia real acumulada {t.eficiencia_promedio}%</span>
              </AlertLine>
            ))}
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <SectionTitle title="Regla de calibracion" />
          <div className="card-body" style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Una eficiencia real menor a 85% o mayor a 115% indica que el estandar debe revisarse. Las NCs recurrentes, como NC-2026-014, tambien pueden proponer ajustes tecnicos al MTM base.
          </div>
        </div>
      </CardGrid>

      {notice && <div style={{ marginTop: 16 }}><AlertLine tone="green">{notice}</AlertLine></div>}
      <FooterBrand />
    </div>
  );
};

const AREA_CONFIG = {
  'area-ingenieria': { label: 'Ingenieria y Diseno', color: '#8B5CF6', dataArea: 'Ingenieria', procesos: ['ing-planos', 'ing-bom', 'ing-tiempos'] },
  'area-maestranza': { label: 'Maestranza', color: '#64748B', dataArea: 'Maestranza', procesos: ['mae-torneado', 'mae-fresado', 'mae-rectificado', 'mae-taladrado', 'mae-cromado', 'mae-recuperacion'] },
  'area-soldadura': { label: 'Soldadura', color: '#F97316', dataArea: 'Soldadura', procesos: ['sol-mig-tig', 'sol-recargue', 'sol-corte', 'sol-estructural'] },
  'area-fabricacion': { label: 'Fabricacion y Ensamble', color: '#0EA5E9', dataArea: 'Fabricacion y Ensamble', procesos: ['fab-piezas', 'fab-estructuras', 'fab-ensamble', 'fab-pruebas'] },
};

const PROCESS_CONFIG = {
  'ing-planos': { areaId: 'area-ingenieria', label: 'Planos y Especificaciones', filter: 'Diagnostico_Tecnico', te: 'MTM-ING-031' },
  'ing-bom': { areaId: 'area-ingenieria', label: 'Lista de Materiales BOM', filter: 'BOM_Ingenieria', te: 'MTM-ING-031' },
  'ing-tiempos': { areaId: 'area-ingenieria', label: 'Estimacion de Tiempos', filter: 'Tiempos_Estandar', te: 'MTM-ING-031' },
  'mae-torneado': { areaId: 'area-maestranza', label: 'Torneado', filter: 'Torneado', te: 'MTM-MAE-TOR' },
  'mae-fresado': { areaId: 'area-maestranza', label: 'Fresado', filter: 'Fresado', te: 'MTM-MAE-TOR' },
  'mae-rectificado': { areaId: 'area-maestranza', label: 'Rectificado', filter: 'Rectificado', te: 'MTM-MEK-REC' },
  'mae-taladrado': { areaId: 'area-maestranza', label: 'Taladrado / Mandrinado', filter: 'Taladrado', te: 'MTM-MAE-TOR' },
  'mae-cromado': { areaId: 'area-maestranza', label: 'Cromado Industrial', filter: 'Cromado', te: 'MTM-MEK-CRO' },
  'mae-recuperacion': { areaId: 'area-maestranza', label: 'Recuperacion de Piezas', filter: 'Recuperacion', te: 'MTM-MEK-REC' },
  'sol-mig-tig': { areaId: 'area-soldadura', label: 'MIG / TIG / SMAW', filter: 'Soldadura_Estructural', te: 'MTM-SOL-EST' },
  'sol-recargue': { areaId: 'area-soldadura', label: 'Recargue y Recuperacion', filter: 'Recargue', te: 'MTM-SOL-EST' },
  'sol-corte': { areaId: 'area-soldadura', label: 'Corte Termico', filter: 'Corte', te: 'MTM-FAB-COR' },
  'sol-estructural': { areaId: 'area-soldadura', label: 'Soldadura Estructural', filter: 'Soldadura_Estructural', te: 'MTM-SOL-EST' },
  'fab-piezas': { areaId: 'area-fabricacion', label: 'Fabricacion de Piezas', filter: 'Corte_Habilitado', te: 'MTM-FAB-COR' },
  'fab-estructuras': { areaId: 'area-fabricacion', label: 'Fabricacion de Estructuras', filter: 'Fabricacion_Estructuras', te: 'MTM-FAB-COR' },
  'fab-ensamble': { areaId: 'area-fabricacion', label: 'Ensamble de Componentes', filter: 'Ensamble_Componentes', te: 'MTM-MEK-ENS' },
  'fab-pruebas': { areaId: 'area-fabricacion', label: 'Pruebas y Control de Calidad', filter: 'Inspeccion_QC_HID', te: 'MTM-UAS-QC' },
};

export const AreaResumenPage = ({ areaId, onNav }) => {
  const cfg = AREA_CONFIG[areaId];
  const all = getAllOTs().filter(ot => ot.area === cfg?.dataArea);
  const active = all.filter(ot => ot.estado !== 'cerrada');
  const avg = active.length ? Math.round(active.reduce((s, ot) => s + (ot.avance_pct || 0), 0) / active.length) : 0;
  const [procesoFiltro, setProcesoFiltro] = useState('todos');

  const handleProcesoClick = (pid) => setProcesoFiltro(procesoFiltro === pid ? 'todos' : pid);

  const otsFiltradas = procesoFiltro === 'todos'
    ? all
    : all.filter(ot => {
        const pcfg = PROCESS_CONFIG[procesoFiltro];
        if (!pcfg) return false;
        if (ot.proceso_especifico === pcfg.filter) return true;
        const procesoNorm = (ot.proceso || '').toLowerCase();
        const labelNorm = (pcfg.label || '').toLowerCase();
        if (procesoNorm.includes(labelNorm)) return true;
        const primeraPalabra = labelNorm.split(' ')[0];
        return primeraPalabra ? procesoNorm.includes(primeraPalabra) : false;
      });

  return (
    <div className="page">
      <div className="page-header"><div><h1 style={{ color: cfg?.color }}>{cfg?.label}</h1><div className="sub">Resumen operativo del area productiva</div></div></div>
      <CardGrid min={180}><Kpi label="OTs activas" value={active.length} /><Kpi label="OTs cerradas" value={all.filter(ot => ot.estado === 'cerrada').length} /><Kpi label="Avance prom." value={`${avg}%`} /><Kpi label="Procesos" value={cfg?.procesos.length || 0} /></CardGrid>
      <div className="card" style={{ marginTop: 16 }}>
        <SectionTitle title="Filtrar por proceso" />
        <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setProcesoFiltro('todos')}
            style={{ padding: '8px 16px', background: procesoFiltro === 'todos' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)', border: procesoFiltro === 'todos' ? '1px solid rgba(245,158,11,0.4)' : '1px solid #1e2d47', borderRadius: '6px', color: procesoFiltro === 'todos' ? '#f59e0b' : '#64748b', fontSize: '12px', fontWeight: procesoFiltro === 'todos' ? 600 : 400, cursor: 'pointer' }}
          >
            Todos{procesoFiltro === 'todos' && ' ✓'}
          </button>
          {(cfg?.procesos || []).map(pid => (
            <button
              key={pid}
              onClick={() => handleProcesoClick(pid)}
              style={{ padding: '8px 16px', background: procesoFiltro === pid ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)', border: procesoFiltro === pid ? '1px solid rgba(245,158,11,0.4)' : '1px solid #1e2d47', borderRadius: '6px', color: procesoFiltro === pid ? '#f59e0b' : '#64748b', fontSize: '12px', fontWeight: procesoFiltro === pid ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s' }}
            >
              {PROCESS_CONFIG[pid]?.label}{procesoFiltro === pid && ' ✓'}
            </button>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <SectionTitle
          title={procesoFiltro === 'todos' ? 'OTs del area' : `OTs · ${PROCESS_CONFIG[procesoFiltro]?.label}`}
          hint={procesoFiltro !== 'todos' ? `${otsFiltradas.length} OT${otsFiltradas.length !== 1 ? 's' : ''} encontrada${otsFiltradas.length !== 1 ? 's' : ''}` : undefined}
        />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>OT</th><th>OF</th><th>Proceso</th><th>Tecnico</th><th>Avance</th><th>Estado</th></tr></thead>
            <tbody>
              {otsFiltradas.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Sin OTs para este proceso</td></tr>}
              {otsFiltradas.map(ot => <tr key={`${ot.of.id}-${ot.ot_id}`}><td className="mono">{ot.ot_id}</td><td>{ot.of.codigo}</td><td>{ot.proceso}</td><td>{ot.tecnico}</td><td><ProgressBar pct={ot.avance_pct} color={cfg.color} /></td><td><OTBadge estado={ot.estado} /></td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
      <FooterBrand />
    </div>
  );
};

export const AreaProcesoPage = ({ procesoId, onNav }) => {
  const cfg = PROCESS_CONFIG[procesoId];
  const area = AREA_CONFIG[cfg?.areaId];
  const all = getAllOTs().filter(ot => {
    if (ot.area !== area?.dataArea) return false;
    
    const filterCode = cfg?.filter; // ej: 'Soldadura_Estructural'
    if (ot.proceso_especifico === filterCode) return true;
    
    const procesoNorm = (ot.proceso || '').toLowerCase();
    const labelNorm = (cfg?.label || '').toLowerCase();
    
    if (procesoNorm.includes(labelNorm)) return true;
    
    const primeraPalabra = labelNorm.split(' ')[0];
    if (primeraPalabra && procesoNorm.includes(primeraPalabra)) return true;
    
    return false;
  });
  const standard = (ZAHORY_SAC_DATA.tiempos_estandar || []).find(t => t.id === cfg?.te);
  return (
    <div className="page">
      <div className="page-header"><button className="btn btn-ghost btn-sm" onClick={() => onNav(cfg?.areaId)}><Icon name="back" size={14} /></button><div><h1 style={{ color: area?.color }}>{cfg?.label}</h1><div className="sub">Proceso productivo · estandar {cfg?.te}</div></div></div>
      {standard && <div className="card" style={{ marginBottom: 16 }}><div className="card-body"><CardGrid min={180}><Meta label="Sistema MTM" value={standard.mtm_sistema} /><Meta label="TMU" value={Number(standard.tmu || 0).toLocaleString()} /><Meta label="Horas" value={standard.horas} /><Meta label="Eficiencia prom." value={`${standard.eficiencia_promedio}%`} /></CardGrid></div></div>}
      <div className="card"><SectionTitle title="OTs del proceso" /><div className="table-wrap"><table className="tbl"><thead><tr><th>OT</th><th>OF</th><th>Tecnico</th><th>Plan</th><th>Real</th><th>Efic.</th><th>Estado</th></tr></thead><tbody>{all.map(ot => <tr key={`${ot.of.id}-${ot.ot_id}`}><td className="mono">{ot.ot_id}</td><td>{ot.of.codigo}</td><td>{ot.tecnico}</td><td>{fmtHours(ot.horas_est)}</td><td>{fmtHours(ot.horas_real)}</td><td>{ot.eficiencia_pct ? <Badge kind={ot.eficiencia_pct < 80 ? 'red' : ot.eficiencia_pct > 100 ? 'cyan' : 'green'}>{ot.eficiencia_pct}%</Badge> : '-'}</td><td><OTBadge estado={ot.estado} /></td></tr>)}</tbody></table></div></div>
      <FooterBrand />
    </div>
  );
};

export const TrazabilidadOF = () => <div className="page"><div className="page-header"><div><h1>Trazabilidad de OF</h1><div className="sub">Componente faltante o no encontrado en el archivo</div></div></div></div>;

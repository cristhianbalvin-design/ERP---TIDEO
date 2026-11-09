import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './context.jsx';
import { resolverFiltroSociedadesVista } from './services/sociedadesService.js';
import { calcularBIOperativo, cargarBIOperativo, diasSinParte, fechaLima, limitesMes } from './services/biOperativoService.js';
import './bi_operativo.css';

const n = value => Number(value) || 0;
const cantidad = value => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(value);
const dinero = value => `S/ ${new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
const pct = value => value == null ? 'Sin dato' : `${cantidad(value)} %`;
const label = value => value === 'Preventivo_PM' ? 'Preventivo' : (value || 'Sin tipo').replaceAll('_', ' ');
const lineasLabels = {
  flota_alquileres: 'Flota y alquileres',
  maestranza_fab: 'Maestranza y fabricación',
  venta_repuestos: 'Venta de repuestos',
  transporte_comercial: 'Transporte comercial',
  produccion: 'Producción',
};
const labelLinea = value => {
  const texto = value.replaceAll('_', ' ');
  return lineasLabels[value] || texto.charAt(0).toUpperCase() + texto.slice(1);
};
const fechaCorta = fecha => fecha ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` : 'Sin dato';

function nombreMes(periodo) {
  const [year, month] = periodo.split('-').map(Number);
  const texto = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Encabezado({ periodo, setPeriodo, linea, setLinea, lineas, exportar, disabled }) {
  return (
    <header className="dx-biop-header">
      <div>
        <div className="dx-biop-eyebrow">Dashboards · BI Operativo</div>
        <h1>BI Operativo</h1>
        <p>Rendimiento de OT, técnicos y plazos · {nombreMes(periodo)}</p>
      </div>
      <div className="dx-biop-actions">
        <div className="dx-ui-field">
          <input type="month" aria-label="Mes" value={periodo} onChange={e => e.target.value && setPeriodo(e.target.value)} />
        </div>
        <select className="dx-ui-select" aria-label="Línea de negocio" value={linea} onChange={e => setLinea(e.target.value)}>
          <option value="">Todas las líneas</option>
          {lineas.map(l => <option key={l} value={l}>{labelLinea(l)}</option>)}
        </select>
        <button className="btn btn-secondary" type="button" onClick={exportar} disabled={disabled}>Exportar CSV</button>
      </div>
    </header>
  );
}

function TarjetaKpis({ items }) {
  return (
    <div className="dx-ui-kpi-row">
      {items.map(([title, value, note]) => (
        <div className="dx-ui-kpi" key={title}>
          <div>
            <span>{title}</span>
            <strong className={value === 'Sin dato' ? 'dx-biop-no-data' : undefined}>{value}</strong>
            <small>{note}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ title, count, children }) {
  return (
    <section className="dx-ui-card dx-biop-card">
      <div className="dx-biop-card-head"><h2>{title}</h2>{count != null && <span>{count}</span>}</div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <div className="dx-biop-empty">{children}</div>;
}

function Table({ headers, rows, empty }) {
  return (
    <div className="dx-biop-table">
      <table>
        <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.length ? rows : <tr><td colSpan={headers.length}>{empty}</td></tr>}</tbody>
      </table>
    </div>
  );
}

function PestanaOT({ d, filtrado, periodo, hoy, cliente, pendiente, navigate }) {
  const [year, month] = periodo.split('-').map(Number);
  const series = Array.from({ length: 6 }, (_, i) => {
    const p = new Date(Date.UTC(year, month - 1 - (5 - i), 1)).toISOString().slice(0, 7);
    const x = calcularBIOperativo(filtrado, p, hoy);
    const fin = limitesMes(p).fin;
    return { p, cerradas: x.cerradas.length, abiertas: x.actividad.filter(o => !o.fecha_fin || String(o.fecha_fin).slice(0, 10) > fin).length };
  });
  const max = Math.max(1, ...series.map(x => x.cerradas + x.abiertas));
  const tipoMap = new Map();
  d.actividad.forEach(o => {
    const tipo = label(o.tipo_trabajo);
    tipoMap.set(tipo, (tipoMap.get(tipo) || 0) + 1);
  });
  const tipos = [...tipoMap.entries()].sort((a, b) => b[1] - a[1]);
  const rows = d.abiertas.map(o => {
    const info = diasSinParte(o, filtrado.partesActuales, hoy);
    const alert = o.estado === 'ejecucion' && info.dias != null && info.dias >= 3;
    const abrir = () => navigate('ot', { detail: o.id });
    return (
      <tr key={o.id} role="button" tabIndex={0} onClick={abrir} onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
      }}>
        <td>{o.numero || 'Sin dato'}</td><td>{cliente(o)}</td><td>{o.servicio || 'Sin dato'}</td>
        <td>{pct(o.avance_pct == null ? null : n(o.avance_pct))}</td><td>{fechaCorta(info.ultimo)}</td>
        <td>{cantidad(pendiente(o.id))} h</td>
        <td><span className={`dx-biop-pill ${alert ? 'is-alert' : o.estado === 'programada' ? 'is-programada' : ''}`}>
          {alert ? `Sin parte ${info.dias} días` : o.estado === 'programada' ? 'Programada' : 'En ejecución'}
        </span></td>
      </tr>
    );
  });
  return (
    <div className="dx-biop-pane">
      <div className="dx-biop-grid">
        <Card title="OT por mes · últimos 6 meses">
          <div className="dx-biop-body">
            <div className="dx-biop-bars">
              {series.map(s => (
                <div key={s.p}>
                  <b>{s.cerradas + s.abiertas}</b>
                  <div className="dx-biop-stack" style={{ height: `${(s.cerradas + s.abiertas) / max * 120}px` }}>
                    <i style={{ height: `${s.cerradas / (s.cerradas + s.abiertas || 1) * 100}%` }} />
                    <i className="dx-biop-open" style={{ height: `${s.abiertas / (s.cerradas + s.abiertas || 1) * 100}%` }} />
                  </div>
                  <small>{nombreMes(s.p).split(' ')[0].slice(0, 3)}</small>
                </div>
              ))}
            </div>
            <div className="dx-biop-legend"><span><i /> Cerradas</span><span><i className="is-open" /> Abiertas al cierre del mes</span></div>
          </div>
        </Card>
        <Card title="OT por tipo de trabajo" count={`${d.actividad.length} OT`}>
          <div className="dx-biop-body">
            {tipos.length ? tipos.map(([tipo, count]) => (
              <div className="dx-biop-hrow" key={tipo}>
                <span>{tipo}</span><div className="dx-biop-meter"><i style={{ width: `${count / tipos[0][1] * 100}%` }} /></div><b>{count}</b>
              </div>
            )) : <Empty>Sin OT para este período.</Empty>}
          </div>
        </Card>
      </div>
      <Card title="OT abiertas" count={`${d.abiertas.length} OT`}>
        <Table headers={['OT', 'Cliente', 'Servicio', 'Avance', 'Último parte', 'Horas pendientes', 'Estado']} rows={rows} empty="No hay OT abiertas para este período." />
      </Card>
    </div>
  );
}

function PestanaTecnicos({ d, periodo, persona }) {
  const map = new Map();
  d.partesMes.forEach(p => {
    const id = p.tecnico_id || p.personal_id || '';
    if (!map.has(id)) map.set(id, { id, ots: new Set(), normales: 0, extra: 0 });
    const tecnico = map.get(id);
    tecnico.ots.add(p.orden_trabajo_id || p.ot_id);
    tecnico.normales += n(p.horas_normales);
    tecnico.extra += n(p.horas_extra);
  });
  const tecnicos = [...map.values()].sort((a, b) => b.normales + b.extra - a.normales - a.extra);
  const rows = tecnicos.map(t => (
    <tr key={t.id}>
      <td>{persona(t.id)}</td><td>{t.ots.size}</td><td>{cantidad(t.normales)}</td><td>{cantidad(t.extra)}</td>
      <td><div className="dx-biop-meter"><i style={{ width: `${(t.normales + t.extra) / (tecnicos[0].normales + tecnicos[0].extra || 1) * 100}%` }} /></div></td>
    </tr>
  ));
  return (
    <Card title={`Horas por técnico · ${nombreMes(periodo).toLowerCase()}`} count={`${tecnicos.length} técnicos con partes`}>
      <Table headers={['Técnico', 'OT atendidas', 'Horas normales', 'Horas extra', 'Carga']} rows={rows} empty="No hay partes en este período." />
    </Card>
  );
}

function PestanaAlertas({ d, data, filtrado, linea, hoy, cliente, pendiente, navigate }) {
  const alertas = d.sinParte.map(o => ({
    key: `ot-${o.id}`, titulo: `${o.numero || 'OT'} · Sin parte ${o.dias} días`,
    detalle: `${cliente(o)} · ${pct(o.avance_pct == null ? null : n(o.avance_pct))} de avance · ${cantidad(pendiente(o.id))} h pendientes`,
    abrir: () => navigate('ot', { detail: o.id }),
  }));
  data.certificaciones.forEach(c => {
    const activo = data.activos.find(a => a.id === c.activo_id);
    const tipo = data.tiposCertificacion.find(t => t.id === c.tipo_id)?.nombre || 'Sin dato';
    const dias = Math.round((Date.parse(`${c.fecha_vencimiento}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);
    alertas.push({ key: `cert-${c.id}`, titulo: 'Certificación por vencer', detalle: `${activo?.nombre || activo?.codigo || 'Sin dato'} · ${tipo} · vence en ${dias} días` });
  });
  const grupos = new Map();
  data.backlog.filter(b => !linea || filtrado.ots.some(o => o.backlog_id === b.id)).forEach(b => {
    const descripcion = (b.descripcion || 'Sin descripción').trim();
    const clave = descripcion.toLocaleLowerCase('es-PE');
    if (!grupos.has(clave)) grupos.set(clave, { descripcion, prioridades: new Set(), count: 0 });
    const grupo = grupos.get(clave);
    grupo.count += 1;
    grupo.prioridades.add(b.prioridad || 'Sin dato');
  });
  grupos.forEach((grupo, key) => alertas.push({
    key: `backlog-${key}`, cyan: true,
    titulo: grupo.count > 1 ? `${grupo.count} pedidos de backlog pendientes` : 'Pedido de backlog pendiente',
    detalle: `Prioridad: ${[...grupo.prioridades].join(', ')} · ${grupo.descripcion}`,
    abrir: () => navigate('backlog'),
  }));
  return (
    <Card title="Alertas operativas" count={`${alertas.length} alertas`}>
      <div className="dx-biop-body">
        {alertas.length ? alertas.map(a => (
          <div className="dx-biop-alert" key={a.key}>
            <span className={`dx-biop-alert-dot ${a.cyan ? 'is-cyan' : ''}`} aria-hidden="true" />
            <div><strong>{a.titulo}</strong><small>{a.detalle}</small></div>
            {a.abrir && <button className="btn btn-secondary btn-sm" type="button" onClick={a.abrir}>Ver</button>}
          </div>
        )) : <Empty>Sin alertas por ahora</Empty>}
      </div>
    </Card>
  );
}

function PestanaMO({ d, periodo, filtrado, scope, linea, renderMO }) {
  return (
    <div className="dx-biop-pane">
      <TarjetaKpis items={[
        ['Mano de obra en OT cerradas', dinero(d.manoObra), `${pct(d.real ? d.manoObra / d.real * 100 : null)} del costo real`],
        ['Horas registradas en partes', `${cantidad(d.normales + d.extra)} h`, `${d.partesMes.filter(p => p.estado === 'en_revision').length} partes en revisión`],
        ['Horas estimadas vs reales', `${cantidad(d.horasEstimadas)} / ${cantidad(d.horasReales)} h`, 'tareas de todas las OT'],
      ]} />
      {renderMO(periodo, filtrado, scope, linea)}
    </div>
  );
}

export default function BIOperativoReal({ renderMO }) {
  const { empresa, perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles = [], personalOperativo = [], personalAdmin = [], navigate } = useApp();
  const [periodo, setPeriodo] = useState(() => fechaLima().slice(0, 7));
  const [linea, setLinea] = useState('');
  const [tab, setTab] = useState('ots');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);
  const scope = resolverFiltroSociedadesVista({ multisociedadHabilitado: !!empresa?.multisociedad_habilitado, perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles });
  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    setLoading(true);
    if (!empresa?.id) {
      setLoading(false);
      setError('Selecciona una empresa para consultar el BI operativo.');
      return () => { active = false; };
    }
    cargarBIOperativo(empresa.id, JSON.parse(scopeKey), periodo)
      .then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(`No se pudo cargar el BI operativo: ${err.message}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [empresa?.id, scopeKey, periodo]);
  const hoy = fechaLima();
  const lineas = useMemo(() => [...new Set((data?.ots || []).map(o => o.linea_negocio).filter(Boolean))].sort(), [data]);
  const filtrado = useMemo(() => {
    if (!data) return null;
    const ots = data.ots.filter(o => !linea || o.linea_negocio === linea);
    const ids = new Set(ots.map(o => o.id));
    return { ...data, ots, partes: data.partes.filter(p => ids.has(p.orden_trabajo_id)), partesActuales: data.partesActuales.filter(p => ids.has(p.orden_trabajo_id)), costos: data.costos.filter(c => ids.has(c.orden_trabajo_id)), tareas: data.tareas.filter(t => ids.has(t.ot_id)) };
  }, [data, linea]);
  const d = useMemo(() => filtrado && calcularBIOperativo(filtrado, periodo, hoy), [filtrado, periodo, hoy]);
  const cliente = o => o.cuenta_id ? (data.cuentas.find(c => c.id === o.cuenta_id)?.razon_social || 'Sin dato') : 'Flota propia';
  const persona = id => [...personalOperativo, ...personalAdmin].find(p => p.id === id)?.nombre || 'Sin identificar';
  const pendiente = id => Math.max(0, filtrado.tareas.filter(t => t.ot_id === id).reduce((s, t) => s + n(t.horas_estimadas) - n(t.horas_reales), 0));
  const exportar = () => {
    const table = ref.current?.querySelector('table');
    if (!table) return;
    const csv = [...table.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')]
      .map(td => `"${td.innerText.replace(/"/g, '""').replace(/\s*\n\s*/g, ' ')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bi_operativo_${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const tabs = [['ots', 'OT y ejecución'], ['tecnicos', 'Técnicos'], ['alertas', 'Backlog y alertas'], ['mo', 'Horas y costo de MO']];
  return (
    <div className="dx-ui dx-biop" ref={ref}>
      <Encabezado {...{ periodo, setPeriodo, linea, setLinea, lineas, exportar }} disabled={!d || tab === 'alertas'} />
      {loading && <div className="dx-ui-card dx-biop-empty" role="status">Cargando BI operativo…</div>}
      {error && <div className="dx-ui-card dx-biop-empty" role="alert">{error}</div>}
      {d && <>
        <TarjetaKpis items={[
          ['OT del mes', d.actividad.length, `con actividad en ${nombreMes(periodo).toLowerCase()}`],
          ['OT cerradas', d.cerradas.length, `${pct(d.actividad.length ? d.cerradas.length / d.actividad.length * 100 : null)} de las del mes`],
          ['Avance de OT abiertas', pct(d.avance), `promedio de ${d.abiertas.length} OT`],
          ['Entregadas a tiempo', pct(d.conOS ? d.aTiempo / d.conOS * 100 : null), `${d.aTiempo} de ${d.conOS} con fecha de OS`],
          ['Horas de campo', `${cantidad(d.normales + d.extra)} h`, `${cantidad(d.normales)} normales + ${cantidad(d.extra)} extra`],
          ['Costo real vs estimado', pct(d.estimado ? d.real / d.estimado * 100 : null), `${dinero(d.real)} de ${dinero(d.estimado)}`],
        ]} />
        <div className="dx-biop-tabs" role="tablist" aria-label="Vistas de BI operativo">
          {tabs.map(([id, text]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{text}</button>)}
        </div>
        {tab === 'ots' && <PestanaOT {...{ d, filtrado, periodo, hoy, cliente, pendiente, navigate }} />}
        {tab === 'tecnicos' && <PestanaTecnicos {...{ d, periodo, persona }} />}
        {tab === 'alertas' && <PestanaAlertas {...{ d, data, filtrado, linea, hoy, cliente, pendiente, navigate }} />}
        {tab === 'mo' && <PestanaMO {...{ d, periodo, filtrado, scope, linea, renderMO }} />}
      </>}
    </div>
  );
}

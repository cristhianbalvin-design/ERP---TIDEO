import React, { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import {
  DEFAULT_EVALUACION_CONFIG,
  calcularPorcentajeObjetivo,
  clasificarScore,
} from './services/evaluacionesDesempenoService.js';
import { getAmonestacionesActivas } from './services/amonestacionesService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
const fmtDate = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '-';
const pct = value => `${Math.round(Number(value || 0))}%`;
const norm = value => String(value || '').toLowerCase();
const isClosed = plantilla => plantilla?.estado === 'cerrada';
const byOrden = (a, b) => Number(a.orden || 0) - Number(b.orden || 0);

const estadoBadge = estado => ({
  borrador: 'badge-gray',
  activa: 'badge-green',
  cerrada: 'badge-navy',
  pendiente: 'badge-orange',
  autoevaluacion_completa: 'badge-cyan',
  evaluacion_jefe_completa: 'badge-purple',
  completada: 'badge-green',
  cancelada: 'badge-red',
}[estado] || 'badge-gray');

const estadoLabel = estado => String(estado || '').replaceAll('_', ' ');

function daysUntil(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - today().getTime()) / DAY_MS);
}

function getEvalConfig(empresaConfig = {}) {
  return {
    ...DEFAULT_EVALUACION_CONFIG,
    ...empresaConfig,
    eval_escala_labels: empresaConfig.eval_escala_labels || DEFAULT_EVALUACION_CONFIG.eval_escala_labels,
  };
}

function getUserId(user) {
  return user?.id || user?.auth_user_id || '';
}

function buildPeople(personalOperativo = [], personalAdmin = [], usuarios = []) {
  const userByEmail = new Map(usuarios.filter(u => u.email).map(u => [String(u.email).toLowerCase(), u]));
  const userById = new Map(usuarios.map(u => [String(u.id), u]));
  const normalize = (p, tipo) => {
    const linkedUser = p.auth_user_id
      ? userById.get(String(p.auth_user_id))
      : userByEmail.get(String(p.email || '').toLowerCase());
    const jefeId = linkedUser?.jefe_user_id || p.jefe_user_id || null;
    const jefe = jefeId ? userById.get(String(jefeId)) : null;
    return {
      ...p,
      tipo,
      evaluado_id: p.id,
      evaluado_nombre: p.nombre,
      evaluado_tipo: tipo,
      user_id: p.auth_user_id || linkedUser?.id || null,
      jefe_id: jefeId,
      jefe_nombre: jefe?.nombre || linkedUser?.jefe_nombre || '',
    };
  };
  return [
    ...(personalOperativo || []).map(p => normalize(p, 'operativo')),
    ...(personalAdmin || []).map(p => normalize(p, 'administrativo')),
  ].filter(p => !['inactivo', 'cesado', 'baja'].includes(norm(p.estado)));
}

function ScoreBadge({ score }) {
  if (score == null) return <span className="text-muted">-</span>;
  const cls = clasificarScore(score);
  return <span className={`badge ${cls.badge}`}>{Math.round(score)} · {cls.label}</span>;
}

function ProgressBar({ value, color = 'var(--green)' }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, Number(value || 0)))}%`, background: color }} />
    </div>
  );
}

function MiniBar({ label, value, color }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 48px', gap: 10, alignItems: 'center', fontSize: 12 }}>
      <span className="text-muted">{label}</span>
      <ProgressBar value={value} color={color} />
      <strong className="num" style={{ textAlign: 'right' }}>{Math.round(Number(value || 0))}</strong>
    </div>
  );
}

function useEvaluacionesModel() {
  const app = useApp();
  const people = useMemo(
    () => buildPeople(app.personalOperativo, app.personalAdmin, app.usuarios),
    [app.personalOperativo, app.personalAdmin, app.usuarios]
  );
  const peopleById = useMemo(() => new Map(people.map(p => [String(p.id), p])), [people]);
  const plantillaById = useMemo(() => new Map((app.evaluacionPlantillas || []).map(p => [String(p.id), p])), [app.evaluacionPlantillas]);
  const competenciasByPlantilla = useMemo(() => {
    const map = new Map();
    (app.evaluacionCompetencias || []).forEach(c => {
      const key = String(c.plantilla_id);
      map.set(key, [...(map.get(key) || []), c].sort(byOrden));
    });
    return map;
  }, [app.evaluacionCompetencias]);
  const objetivosByPlantilla = useMemo(() => {
    const map = new Map();
    (app.evaluacionObjetivos || []).forEach(o => {
      const key = String(o.plantilla_id);
      map.set(key, [...(map.get(key) || []), o].sort(byOrden));
    });
    return map;
  }, [app.evaluacionObjetivos]);
  const currentUserId = app.authUser?.id || '';
  const ownPeopleIds = useMemo(() => new Set(people
    .filter(p => p.user_id && String(p.user_id) === String(currentUserId))
    .map(p => String(p.id))), [people, currentUserId]);

  const isAdmin = Boolean(app.role?.permisos?.todo || app.role?.permisos?.tenant_admin);
  const permisos = app.role?.permisos || {};
  const canManage = Boolean(
    isAdmin ||
    permisos.crear?.includes?.('evaluaciones_desempeno') ||
    permisos.editar?.includes?.('evaluaciones_desempeno') ||
    permisos.exportar?.includes?.('evaluaciones_desempeno')
  );
  const isOwnEval = ev => ownPeopleIds.has(String(ev.evaluado_id));
  const isManagerEval = ev => {
    if (!currentUserId) return false;
    if (String(ev.jefe_id || '') === String(currentUserId)) return true;
    const person = peopleById.get(String(ev.evaluado_id));
    return Boolean(person?.jefe_id && String(person.jefe_id) === String(currentUserId));
  };
  return { app, people, peopleById, plantillaById, competenciasByPlantilla, objetivosByPlantilla, ownPeopleIds, currentUserId, canManage, isOwnEval, isManagerEval };
}

export function EvaluacionesDesempeno() {
  const model = useEvaluacionesModel();
  const { app, canManage, isOwnEval, isManagerEval, plantillaById } = model;
  const [tab, setTab] = useState(canManage ? 'plantillas' : 'mis_evaluaciones');
  const [showWizard, setShowWizard] = useState(false);
  const [panelEval, setPanelEval] = useState(null);

  const detailPlantilla = app.activeParams?.plantilla;
  const autoEvalId = app.activeParams?.auto;
  const jefeEvalId = app.activeParams?.jefe;
  const resultEvalId = app.activeParams?.resultado;

  if (detailPlantilla) {
    return <PlantillaDetalle model={model} plantillaId={detailPlantilla} onBack={() => app.navigate('evaluaciones_desempeno')} setPanelEval={setPanelEval} />;
  }
  if (autoEvalId) {
    return <EvaluacionForm model={model} evaluacionId={autoEvalId} modo="autoevaluacion" onBack={() => app.navigate('evaluaciones_desempeno')} />;
  }
  if (jefeEvalId) {
    return <EvaluacionForm model={model} evaluacionId={jefeEvalId} modo="jefe" onBack={() => app.navigate('evaluaciones_desempeno')} />;
  }
  if (resultEvalId) {
    return <ResultadoIndividual model={model} evaluacionId={resultEvalId} onBack={() => app.navigate('evaluaciones_desempeno', { active_tab: 'resultados' })} />;
  }

  const evaluaciones = app.evaluacionEvaluaciones || [];
  const pendientesAuto = evaluaciones.filter(e => isOwnEval(e) && e.estado === 'pendiente' && plantillaById.get(String(e.plantilla_id))?.estado !== 'cerrada');
  const pendientesJefe = evaluaciones.filter(e => isManagerEval(e) && e.estado === 'autoevaluacion_completa' && e.jefe_id && plantillaById.get(String(e.plantilla_id))?.estado !== 'cerrada');
  const tabs = canManage
    ? [
        ['plantillas', 'Plantillas'],
        ['curso', 'Evaluaciones en curso'],
        ['resultados', 'Resultados'],
      ]
    : [
        ['mis_evaluaciones', 'Mis evaluaciones'],
        ['como_jefe', 'Como jefe'],
        ['mis_resultados', 'Resultados'],
      ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">RRHH</div>
          <h1 className="page-title">Evaluacion de Desempeno</h1>
          <div className="page-sub">360 basico: autoevaluacion + jefe, competencias y objetivos. Solo informativo.</div>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowWizard(true)}>{I.plus} Nueva plantilla</button>
        )}
      </div>

      {(pendientesAuto.length > 0 || pendientesJefe.length > 0) && (
        <div className="card mb-6" style={{ padding: 18, borderLeft: '4px solid var(--green)' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div className="eyebrow">Pendientes</div>
              <h3 style={{ margin: '4px 0 6px' }}>Tienes evaluaciones por completar</h3>
              <div className="text-muted" style={{ fontSize: 13 }}>{pendientesAuto.length} autoevaluacion(es) y {pendientesJefe.length} evaluacion(es) como jefe.</div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {pendientesAuto.slice(0, 2).map(e => <button key={e.id} className="btn btn-secondary" onClick={() => app.navigate('evaluaciones_desempeno', { auto: e.id })}>Autoevaluarme</button>)}
              {pendientesJefe.slice(0, 2).map(e => <button key={e.id} className="btn btn-secondary" onClick={() => app.navigate('evaluaciones_desempeno', { jefe: e.id })}>Evaluar {e.evaluado_nombre}</button>)}
            </div>
          </div>
        </div>
      )}

      <div className="tabs mb-6">
        {tabs.map(([key, label]) => (
          <div key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</div>
        ))}
      </div>

      {canManage && tab === 'plantillas' && <PlantillasTab model={model} onNew={() => setShowWizard(true)} />}
      {canManage && tab === 'curso' && <EvaluacionesCursoTab model={model} setPanelEval={setPanelEval} />}
      {canManage && tab === 'resultados' && <ResultadosTab model={model} setPanelEval={setPanelEval} />}
      {!canManage && tab === 'mis_evaluaciones' && <MisEvaluacionesTab model={model} />}
      {!canManage && tab === 'como_jefe' && <ComoJefeTab model={model} />}
      {!canManage && tab === 'mis_resultados' && <MisResultadosTab model={model} />}

      {showWizard && <PlantillaWizard model={model} onClose={() => setShowWizard(false)} />}
      {panelEval && <EvaluacionPanel model={model} evaluacion={panelEval} onClose={() => setPanelEval(null)} />}
    </>
  );
}

function PlantillasTab({ model, onNew }) {
  const { app } = model;
  const plantillas = app.evaluacionPlantillas || [];
  const countByPlantilla = id => (app.evaluacionEvaluaciones || []).filter(e => e.plantilla_id === id).length;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Plantillas</h3>
        <button className="btn btn-primary btn-sm" onClick={onNew}>{I.plus} Nueva plantilla</button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Nombre</th><th>Periodo</th><th>Estado</th><th>Fechas limite</th><th>Colaboradores</th></tr></thead>
          <tbody>
            {plantillas.map(p => (
              <tr key={p.id} onClick={() => app.navigate('evaluaciones_desempeno', { plantilla: p.id })}>
                <td><strong>{p.nombre}</strong><div className="text-muted" style={{ fontSize: 12 }}>{p.descripcion || 'Sin descripcion'}</div></td>
                <td>{p.periodo}</td>
                <td><span className={`badge ${estadoBadge(p.estado)}`}>{estadoLabel(p.estado)}</span></td>
                <td className="text-muted">Auto {fmtDate(p.fecha_limite_autoevaluacion)} · Jefe {fmtDate(p.fecha_limite_jefe)}</td>
                <td><span className="badge badge-cyan">{countByPlantilla(p.id)}</span></td>
              </tr>
            ))}
            {!plantillas.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--fg-muted)' }}>Aun no hay plantillas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvaluacionesCursoTab({ model, setPanelEval }) {
  const { app, plantillaById, peopleById } = model;
  const [fPlantilla, setFPlantilla] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fJefe, setFJefe] = useState('');
  const [fArea, setFArea] = useState('');
  const rows = (app.evaluacionEvaluaciones || [])
    .filter(e => !['completada', 'cancelada'].includes(e.estado))
    .filter(e => !fPlantilla || e.plantilla_id === fPlantilla)
    .filter(e => !fEstado || e.estado === fEstado)
    .filter(e => !fJefe || String(e.jefe_id || '') === fJefe)
    .filter(e => !fArea || norm(peopleById.get(String(e.evaluado_id))?.area) === norm(fArea));
  const areas = [...new Set([...model.people.map(p => p.area).filter(Boolean)])];
  const jefes = [...new Map((app.usuarios || []).map(u => [String(u.id), u])).values()];
  return (
    <>
      <FilterBar>
        <select className="select" value={fPlantilla} onChange={e => setFPlantilla(e.target.value)}>
          <option value="">Todas las plantillas</option>
          {(app.evaluacionPlantillas || []).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select className="select" value={fEstado} onChange={e => setFEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {['pendiente', 'autoevaluacion_completa', 'evaluacion_jefe_completa'].map(e => <option key={e} value={e}>{estadoLabel(e)}</option>)}
        </select>
        <select className="select" value={fArea} onChange={e => setFArea(e.target.value)}>
          <option value="">Todas las areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="select" value={fJefe} onChange={e => setFJefe(e.target.value)}>
          <option value="">Todos los jefes</option>
          {jefes.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </FilterBar>
      <EvaluacionesTable model={model} rows={rows} setPanelEval={setPanelEval} />
    </>
  );
}

function EvaluacionesTable({ model, rows, setPanelEval }) {
  const { plantillaById } = model;
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Colaborador</th><th>Jefe</th><th>Plantilla</th><th>Estado</th><th>Score final</th><th>Proxima fecha</th></tr></thead>
          <tbody>
            {rows.map(e => {
              const p = plantillaById.get(String(e.plantilla_id));
              const nextDue = e.estado === 'pendiente' ? p?.fecha_limite_autoevaluacion : p?.fecha_limite_jefe;
              const d = daysUntil(nextDue);
              return (
                <tr key={e.id} onClick={() => setPanelEval?.(e)}>
                  <td><strong>{e.evaluado_nombre}</strong><div className="text-muted" style={{ fontSize: 12 }}>{e.evaluado_tipo}</div></td>
                  <td>{e.jefe_nombre || <span className="badge badge-orange">Sin jefe</span>}</td>
                  <td>{p?.nombre || '-'}</td>
                  <td><span className={`badge ${estadoBadge(e.estado)}`}>{estadoLabel(e.estado)}</span></td>
                  <td><ScoreBadge score={e.score_final} /></td>
                  <td>{fmtDate(nextDue)} {d !== null && d < 3 && <span className="badge badge-orange" style={{ marginLeft: 6 }}>{d < 0 ? 'Vencida' : `${d} dias`}</span>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--fg-muted)' }}>Sin evaluaciones para los filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultadosTab({ model, setPanelEval }) {
  const { app, plantillaById, peopleById } = model;
  const [fPlantilla, setFPlantilla] = useState('');
  const [fArea, setFArea] = useState('');
  const [fJefe, setFJefe] = useState('');
  const [fClasif, setFClasif] = useState('');
  const completadasBase = (app.evaluacionEvaluaciones || []).filter(e => e.estado === 'completada');
  const rows = completadasBase
    .filter(e => !fPlantilla || e.plantilla_id === fPlantilla)
    .filter(e => !fArea || norm(peopleById.get(String(e.evaluado_id))?.area) === norm(fArea))
    .filter(e => !fJefe || String(e.jefe_id || '') === fJefe)
    .filter(e => !fClasif || clasificarScore(e.score_final).label === fClasif);
  const promedio = rows.length ? rows.reduce((s, e) => s + Number(e.score_final || 0), 0) / rows.length : 0;
  const distribucion = ['Sobresaliente', 'Destacado', 'Satisfactorio', 'Por mejorar', 'Insatisfactorio'].map(label => ({
    label,
    count: rows.filter(e => clasificarScore(e.score_final).label === label).length,
  }));
  const completadasPct = completadasBase.length && (app.evaluacionEvaluaciones || []).length
    ? (completadasBase.length / (app.evaluacionEvaluaciones || []).length) * 100
    : 0;
  const areas = [...new Set(model.people.map(p => p.area).filter(Boolean))];
  const jefes = [...new Map((app.usuarios || []).map(u => [String(u.id), u])).values()];

  const exportar = () => {
    const rowsExcel = rows.map(e => {
      const p = plantillaById.get(String(e.plantilla_id));
      const persona = peopleById.get(String(e.evaluado_id));
      return {
        Colaborador: e.evaluado_nombre,
        Area: persona?.area || '',
        Jefe: e.jefe_nombre || '',
        Plantilla: p?.nombre || '',
        Periodo: p?.periodo || '',
        ScoreAutoevaluacion: e.score_autoevaluacion,
        ScoreJefe: e.score_jefe,
        ScoreFinal: e.score_final,
        Clasificacion: clasificarScore(e.score_final).label,
        Estado: e.estado,
        ComentarioFinalJefe: e.comentario_final_jefe || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rowsExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
    XLSX.writeFile(wb, 'evaluaciones_desempeno.xlsx');
  };

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Score promedio" value={Math.round(promedio)} sub={`${rows.length} evaluaciones`} />
        <Kpi label="Completadas" value={pct(completadasPct)} sub={`${completadasBase.length} de ${(app.evaluacionEvaluaciones || []).length}`} />
        <div className="kpi-card">
          <div className="kpi-label">Distribucion</div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {distribucion.map(d => <MiniBar key={d.label} label={d.label} value={rows.length ? (d.count / rows.length) * 100 : 0} color={clasificarScore({ Sobresaliente: 95, Destacado: 80, Satisfactorio: 65, 'Por mejorar': 50, Insatisfactorio: 30 }[d.label]).badge.includes('green') ? 'var(--green)' : 'var(--cyan)'} />)}
          </div>
        </div>
      </div>
      <FilterBar>
        <select className="select" value={fPlantilla} onChange={e => setFPlantilla(e.target.value)}>
          <option value="">Todas las plantillas</option>
          {(app.evaluacionPlantillas || []).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select className="select" value={fArea} onChange={e => setFArea(e.target.value)}>
          <option value="">Todas las areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="select" value={fJefe} onChange={e => setFJefe(e.target.value)}>
          <option value="">Todos los jefes</option>
          {jefes.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <select className="select" value={fClasif} onChange={e => setFClasif(e.target.value)}>
          <option value="">Todas las clasificaciones</option>
          {['Sobresaliente', 'Destacado', 'Satisfactorio', 'Por mejorar', 'Insatisfactorio'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={exportar}>{I.download} Exportar Excel</button>
      </FilterBar>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Nombre</th><th>Area</th><th>Jefe</th><th>Score auto</th><th>Score jefe</th><th>Score final</th><th>Clasificacion</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.map(e => {
                const persona = peopleById.get(String(e.evaluado_id));
                return (
                  <tr key={e.id} onClick={() => setPanelEval(e)}>
                    <td><strong>{e.evaluado_nombre}</strong></td>
                    <td>{persona?.area || '-'}</td>
                    <td>{e.jefe_nombre || '-'}</td>
                    <td>{Math.round(Number(e.score_autoevaluacion || 0))}</td>
                    <td>{Math.round(Number(e.score_jefe || 0))}</td>
                    <td><strong>{Math.round(Number(e.score_final || 0))}</strong></td>
                    <td><ScoreBadge score={e.score_final} /></td>
                    <td><span className={`badge ${estadoBadge(e.estado)}`}>{estadoLabel(e.estado)}</span></td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--fg-muted)' }}>Sin resultados completados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function MisEvaluacionesTab({ model }) {
  const { app, isOwnEval, plantillaById } = model;
  const rows = (app.evaluacionEvaluaciones || []).filter(isOwnEval);
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Plantilla</th><th>Periodo</th><th>Estado</th><th>Limite</th><th></th></tr></thead>
          <tbody>
            {rows.map(e => {
              const p = plantillaById.get(String(e.plantilla_id));
              const closed = isClosed(p);
              return (
                <tr key={e.id}>
                  <td><strong>{p?.nombre}</strong></td>
                  <td>{p?.periodo}</td>
                  <td><span className={`badge ${estadoBadge(e.estado)}`}>{estadoLabel(e.estado)}</span></td>
                  <td>{fmtDate(p?.fecha_limite_autoevaluacion)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {e.estado === 'pendiente' && !closed && <button className="btn btn-sm btn-primary" onClick={() => app.navigate('evaluaciones_desempeno', { auto: e.id })}>Completar</button>}
                    {closed && e.estado === 'completada' && <button className="btn btn-sm btn-secondary" onClick={() => app.navigate('evaluaciones_desempeno', { resultado: e.id })}>Ver resultado</button>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--fg-muted)' }}>No tienes evaluaciones asignadas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComoJefeTab({ model }) {
  const { app, isManagerEval } = model;
  const rows = (app.evaluacionEvaluaciones || []).filter(isManagerEval);
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Colaborador</th><th>Plantilla</th><th>Estado</th><th>Score final</th><th></th></tr></thead>
          <tbody>
            {rows.map(e => {
              const p = model.plantillaById.get(String(e.plantilla_id));
              const ready = e.estado === 'autoevaluacion_completa' && !isClosed(p) && e.jefe_id;
              return (
                <tr key={e.id}>
                  <td><strong>{e.evaluado_nombre}</strong></td>
                  <td>{p?.nombre}</td>
                  <td><span className={`badge ${estadoBadge(e.estado)}`}>{estadoLabel(e.estado)}</span></td>
                  <td><ScoreBadge score={e.score_final} /></td>
                  <td style={{ textAlign: 'right' }}>{ready && <button className="btn btn-sm btn-primary" onClick={() => app.navigate('evaluaciones_desempeno', { jefe: e.id })}>Evaluar</button>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--fg-muted)' }}>No tienes evaluaciones como jefe.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MisResultadosTab({ model }) {
  const { app, isOwnEval, plantillaById } = model;
  const rows = (app.evaluacionEvaluaciones || []).filter(e => isOwnEval(e) && e.estado === 'completada' && isClosed(plantillaById.get(String(e.plantilla_id))));
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Plantilla</th><th>Periodo</th><th>Score final</th><th>Clasificacion</th><th></th></tr></thead>
          <tbody>
            {rows.map(e => {
              const p = plantillaById.get(String(e.plantilla_id));
              return (
                <tr key={e.id}>
                  <td><strong>{p?.nombre}</strong></td>
                  <td>{p?.periodo}</td>
                  <td>{Math.round(Number(e.score_final || 0))}</td>
                  <td><ScoreBadge score={e.score_final} /></td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-sm btn-secondary" onClick={() => app.navigate('evaluaciones_desempeno', { resultado: e.id })}>Ver detalle</button></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--fg-muted)' }}>Tus resultados apareceran cuando RRHH cierre la plantilla.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlantillaWizard({ model, onClose }) {
  const { app, people } = model;
  const cfg = getEvalConfig(app.empresaConfig);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    periodo: '',
    fecha_inicio: new Date().toISOString().slice(0, 10),
    fecha_limite_autoevaluacion: '',
    fecha_limite_jefe: '',
    peso_autoevaluacion: Number(cfg.eval_peso_autoevaluacion),
    peso_jefe: Number(cfg.eval_peso_jefe),
    peso_competencias: Number(cfg.eval_peso_competencias),
    peso_objetivos: Number(cfg.eval_peso_objetivos),
  });
  const [competencias, setCompetencias] = useState([{ id: 'tmp_comp_1', nombre: 'Orientacion a resultados', descripcion: '' }]);
  const [objetivos, setObjetivos] = useState([]);
  const [selected, setSelected] = useState(() => new Set(people.map(p => p.id)));
  const invalidPesos = Number(form.peso_autoevaluacion) + Number(form.peso_jefe) !== 100 || Number(form.peso_competencias) + Number(form.peso_objetivos) !== 100;
  const selectedPeople = people.filter(p => selected.has(p.id));
  const sinJefe = selectedPeople.filter(p => !p.jefe_id).length;
  const canNext = step === 1
    ? form.nombre.trim() && form.periodo.trim() && !invalidPesos
    : step === 2
      ? competencias.length >= 1 && competencias.every(c => c.nombre.trim())
      : step === 3
        ? objetivos.every(o => o.nombre.trim() && Number(o.meta_numerica) >= 0)
        : selectedPeople.length > 0;

  const save = async (estado) => {
    setSaving(true);
    try {
      await app.crearPlantillaEvaluacionCtx({
        ...form,
        estado,
        escala_min: cfg.eval_escala_min,
        escala_max: cfg.eval_escala_max,
        competencias,
        objetivos,
        colaboradores: selectedPeople.map(p => ({
          evaluado_id: p.id,
          evaluado_nombre: p.nombre,
          evaluado_tipo: p.tipo,
          jefe_id: p.jefe_id || null,
          jefe_nombre: p.jefe_nombre || null,
        })),
      });
      onClose();
    } catch (err) {
      app.addNotificacion(`No se pudo crear la plantilla: ${err?.message || 'error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose} />
      <div className="side-panel" style={{ width: 760, maxWidth: 'calc(100vw - 20px)' }}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Nueva plantilla</div>
            <h3 style={{ margin: 0 }}>Paso {step} de 4</h3>
          </div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="side-panel-body">
          <div className="tabs mb-6">
            {['Datos', 'Competencias', 'Objetivos', 'Colaboradores'].map((label, idx) => (
              <div key={label} className={`tab ${step === idx + 1 ? 'active' : ''}`} onClick={() => setStep(idx + 1)}>{label}</div>
            ))}
          </div>

          {step === 1 && (
            <div className="grid-2" style={{ gap: 14 }}>
              <Field label="Nombre"><input className="input" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} /></Field>
              <Field label="Periodo"><input className="input" placeholder="Semestre 1 2026" value={form.periodo} onChange={e => setForm(p => ({ ...p, periodo: e.target.value }))} /></Field>
              <Field label="Descripcion" wide><textarea className="input" rows={3} value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} /></Field>
              <Field label="Inicio"><input className="input" type="date" value={form.fecha_inicio} onChange={e => setForm(p => ({ ...p, fecha_inicio: e.target.value }))} /></Field>
              <Field label="Limite autoevaluacion"><input className="input" type="date" value={form.fecha_limite_autoevaluacion} onChange={e => setForm(p => ({ ...p, fecha_limite_autoevaluacion: e.target.value }))} /></Field>
              <Field label="Limite evaluacion jefe"><input className="input" type="date" value={form.fecha_limite_jefe} onChange={e => setForm(p => ({ ...p, fecha_limite_jefe: e.target.value }))} /></Field>
              <div className="card" style={{ padding: 14 }}>
                <div className="eyebrow">Autoevaluacion vs jefe</div>
                <PercentPair a="peso_autoevaluacion" b="peso_jefe" la="Autoevaluacion" lb="Jefe" form={form} setForm={setForm} />
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div className="eyebrow">Competencias vs objetivos</div>
                <PercentPair a="peso_competencias" b="peso_objetivos" la="Competencias" lb="Objetivos" form={form} setForm={setForm} />
              </div>
              {invalidPesos && <div className="alert alert-danger" style={{ gridColumn: '1/-1' }}>Las ponderaciones deben sumar 100 en ambos grupos.</div>}
            </div>
          )}

          {step === 2 && (
            <div className="col" style={{ gap: 12 }}>
              <ScalePreview cfg={cfg} />
              {competencias.map((c, idx) => (
                <EditableItem key={c.id} idx={idx} item={c} onMove={(dir) => setCompetencias(moveItem(competencias, idx, dir))} onDelete={() => setCompetencias(prev => prev.filter(x => x.id !== c.id))} disableDelete={competencias.length <= 1}>
                  <input className="input" placeholder="Nombre de la competencia" value={c.nombre} onChange={e => setCompetencias(prev => prev.map(x => x.id === c.id ? { ...x, nombre: e.target.value } : x))} />
                  <textarea className="input" rows={2} placeholder="Descripcion opcional" value={c.descripcion} onChange={e => setCompetencias(prev => prev.map(x => x.id === c.id ? { ...x, descripcion: e.target.value } : x))} />
                </EditableItem>
              ))}
              <button className="btn btn-secondary" disabled={competencias.length >= 10} onClick={() => setCompetencias(prev => [...prev, { id: `tmp_comp_${Date.now()}`, nombre: '', descripcion: '' }])}>{I.plus} Agregar competencia</button>
            </div>
          )}

          {step === 3 && (
            <div className="col" style={{ gap: 12 }}>
              {objetivos.map((o, idx) => (
                <EditableItem key={o.id} idx={idx} item={o} onMove={(dir) => setObjetivos(moveItem(objetivos, idx, dir))} onDelete={() => setObjetivos(prev => prev.filter(x => x.id !== o.id))}>
                  <div className="grid-2" style={{ gap: 10 }}>
                    <input className="input" placeholder="Nombre del objetivo" value={o.nombre} onChange={e => setObjetivos(prev => prev.map(x => x.id === o.id ? { ...x, nombre: e.target.value } : x))} />
                    <select className="select" value={o.unidad_medida} onChange={e => setObjetivos(prev => prev.map(x => x.id === o.id ? { ...x, unidad_medida: e.target.value } : x))}>
                      <option value="numero">Numero</option>
                      <option value="porcentaje">Porcentaje</option>
                      <option value="soles">Soles</option>
                      <option value="cantidad">Cantidad</option>
                    </select>
                    <textarea className="input" rows={2} placeholder="Descripcion" value={o.descripcion} onChange={e => setObjetivos(prev => prev.map(x => x.id === o.id ? { ...x, descripcion: e.target.value } : x))} />
                    <input className="input" type="number" min="0" step="0.01" placeholder="Meta numerica" value={o.meta_numerica} onChange={e => setObjetivos(prev => prev.map(x => x.id === o.id ? { ...x, meta_numerica: e.target.value } : x))} />
                  </div>
                </EditableItem>
              ))}
              <button className="btn btn-secondary" disabled={objetivos.length >= 10} onClick={() => setObjetivos(prev => [...prev, { id: `tmp_obj_${Date.now()}`, nombre: '', descripcion: '', unidad_medida: 'numero', meta_numerica: '' }])}>{I.plus} Agregar objetivo</button>
              {!objetivos.length && <div className="alert alert-info">Puedes crear una plantilla solo de competencias.</div>}
            </div>
          )}

          {step === 4 && (
            <div className="col" style={{ gap: 14 }}>
              <div className="card" style={{ padding: 14 }}>
                <strong>{selectedPeople.length}</strong> colaboradores seleccionados · <strong>{sinJefe}</strong> sin jefe directo · Inicio {fmtDate(form.fecha_inicio)}
                {sinJefe > 0 && <div className="alert alert-warning" style={{ marginTop: 10 }}>Este colaborador no tiene jefe directo asignado - la evaluacion del jefe quedara pendiente hasta que se asigne uno.</div>}
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                {people.map(p => (
                  <label key={p.id} className="row" style={{ justifyContent: 'space-between', padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
                    <span><strong>{p.nombre}</strong><span className="text-muted" style={{ marginLeft: 8 }}>{p.area || p.tipo}</span>{!p.jefe_id && <span className="badge badge-orange" style={{ marginLeft: 8 }}>Sin jefe</span>}</span>
                    <input type="checkbox" className="checkbox" checked={selected.has(p.id)} onChange={e => setSelected(prev => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.id); else next.delete(p.id);
                      return next;
                    })} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={() => step === 1 ? onClose() : setStep(step - 1)}>{step === 1 ? 'Cancelar' : 'Atras'}</button>
          <div className="row">
            {step === 4 && <button className="btn btn-secondary" disabled={saving || !canNext} onClick={() => save('borrador')}>Guardar borrador</button>}
            {step < 4
              ? <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continuar</button>
              : <button className="btn btn-primary" disabled={saving || !canNext} onClick={() => save('activa')}>{saving ? 'Creando...' : 'Crear y activar plantilla'}</button>}
          </div>
        </div>
      </div>
    </>
  );
}

function PlantillaDetalle({ model, plantillaId, onBack, setPanelEval }) {
  const { app, competenciasByPlantilla, objetivosByPlantilla } = model;
  const p = (app.evaluacionPlantillas || []).find(x => x.id === plantillaId);
  if (!p) return <div className="card" style={{ padding: 24 }}>Plantilla no encontrada.</div>;
  const competencias = competenciasByPlantilla.get(String(p.id)) || [];
  const objetivos = objetivosByPlantilla.get(String(p.id)) || [];
  const evals = (app.evaluacionEvaluaciones || []).filter(e => e.plantilla_id === p.id);
  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-ghost" onClick={onBack} style={{ paddingLeft: 0 }}>Volver</button>
          <h1 className="page-title">{p.nombre} <span className={`badge ${estadoBadge(p.estado)}`}>{estadoLabel(p.estado)}</span></h1>
          <div className="page-sub">{p.periodo} · Auto {p.peso_autoevaluacion}% / Jefe {p.peso_jefe}% · Competencias {p.peso_competencias}% / Objetivos {p.peso_objetivos}%</div>
        </div>
        {p.estado !== 'cerrada' && <button className="btn btn-primary" onClick={() => { if (window.confirm('Cerrar plantilla y publicar resultados a colaboradores?')) app.cerrarPlantillaEvaluacionCtx(p.id); }}>Cerrar plantilla</button>}
      </div>
      <div className="grid-2" style={{ gap: 16, marginBottom: 18 }}>
        <div className="card"><div className="card-head"><h3>Competencias</h3></div><div className="card-body col" style={{ gap: 8 }}>{competencias.map(c => <div key={c.id}><strong>{c.orden}. {c.nombre}</strong><div className="text-muted" style={{ fontSize: 12 }}>{c.descripcion || '-'}</div></div>)}</div></div>
        <div className="card"><div className="card-head"><h3>Objetivos</h3></div><div className="card-body col" style={{ gap: 8 }}>{objetivos.length ? objetivos.map(o => <div key={o.id}><strong>{o.orden}. {o.nombre}</strong><div className="text-muted" style={{ fontSize: 12 }}>Meta {o.meta_numerica} · {o.unidad_medida}</div></div>) : <div className="text-muted">Plantilla solo de competencias.</div>}</div></div>
      </div>
      <EvaluacionesTable model={model} rows={evals} setPanelEval={setPanelEval} />
    </>
  );
}

function EvaluacionForm({ model, evaluacionId, modo, onBack }) {
  const { app, plantillaById, competenciasByPlantilla, objetivosByPlantilla, peopleById, isOwnEval, isManagerEval } = model;
  const evaluacion = (app.evaluacionEvaluaciones || []).find(e => e.id === evaluacionId);
  if (!evaluacion) return <div className="card" style={{ padding: 24 }}>Evaluacion no encontrada.</div>;
  const plantilla = plantillaById.get(String(evaluacion.plantilla_id));
  const competencias = competenciasByPlantilla.get(String(plantilla?.id)) || [];
  const objetivos = objetivosByPlantilla.get(String(plantilla?.id)) || [];
  const tipo = modo === 'jefe' ? 'jefe' : 'autoevaluacion';
  const initialComp = competencias.map(c => {
    const r = (app.evaluacionRespCompetencias || []).find(x => x.evaluacion_id === evaluacionId && x.competencia_id === c.id && x.tipo_evaluador === tipo);
    return { competencia_id: c.id, puntaje: r?.puntaje || '', comentario: r?.comentario || '' };
  });
  const autoObj = objetivos.map(o => (app.evaluacionRespObjetivos || []).find(x => x.evaluacion_id === evaluacionId && x.objetivo_id === o.id && x.tipo_evaluador === 'autoevaluacion')).filter(Boolean);
  const initialObj = objetivos.map(o => {
    const own = (app.evaluacionRespObjetivos || []).find(x => x.evaluacion_id === evaluacionId && x.objetivo_id === o.id && x.tipo_evaluador === tipo);
    const auto = autoObj.find(x => x.objetivo_id === o.id);
    return { objetivo_id: o.id, resultado_real: own?.resultado_real ?? auto?.resultado_real ?? '', porcentaje_cumplimiento: own?.porcentaje_cumplimiento ?? auto?.porcentaje_cumplimiento ?? 0, comentario: own?.comentario || '' };
  });
  const [compRespuestas, setCompRespuestas] = useState(initialComp);
  const [objRespuestas, setObjRespuestas] = useState(initialObj);
  const [comentarioFinal, setComentarioFinal] = useState(evaluacion.comentario_final_jefe || '');
  const [saving, setSaving] = useState(false);
  const cfg = getEvalConfig(app.empresaConfig);
  const persona = peopleById.get(String(evaluacion.evaluado_id));
  const locked = isClosed(plantilla) || evaluacion.estado === 'cancelada' || (modo === 'autoevaluacion' && evaluacion.estado !== 'pendiente') || (modo === 'jefe' && (!evaluacion.jefe_id || evaluacion.estado !== 'autoevaluacion_completa'));
  const totalItems = competencias.length + objetivos.length + (modo === 'jefe' ? 1 : 0);
  const doneItems = compRespuestas.filter(r => r.puntaje !== '').length + objRespuestas.filter(r => r.resultado_real !== '').length + (modo === 'jefe' && comentarioFinal.trim() ? 1 : 0);
  const complete = totalItems > 0 && doneItems === totalItems;

  const submit = async () => {
    if (!complete || locked) return;
    if (!window.confirm(modo === 'jefe' ? 'Una vez enviada no podras editar la evaluacion del jefe. Confirmar?' : 'Una vez enviada no podras editar tu autoevaluacion. Confirmar?')) return;
    setSaving(true);
    try {
      if (modo === 'jefe') await app.guardarEvaluacionJefeCtx(evaluacionId, { competencias: compRespuestas, objetivos: objRespuestas, comentarioFinal });
      else await app.guardarAutoevaluacionCtx(evaluacionId, { competencias: compRespuestas, objetivos: objRespuestas });
      onBack();
    } catch (err) {
      app.addNotificacion(`No se pudo enviar: ${err?.message || 'error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-ghost" onClick={onBack} style={{ paddingLeft: 0 }}>Volver</button>
          <h1 className="page-title">{plantilla?.nombre}</h1>
          <div className="page-sub">{plantilla?.periodo} · {modo === 'jefe' ? `Evaluando a ${evaluacion.evaluado_nombre}` : `${evaluacion.evaluado_nombre} · ${persona?.cargo || ''}`}</div>
        </div>
        <div style={{ minWidth: 220 }}>
          <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>{doneItems}/{totalItems} completado</div>
          <ProgressBar value={(doneItems / Math.max(1, totalItems)) * 100} />
        </div>
      </div>
      {daysUntil(modo === 'jefe' ? plantilla?.fecha_limite_jefe : plantilla?.fecha_limite_autoevaluacion) < 5 && (
        <div className="alert alert-warning mb-6">Fecha limite cercana: {fmtDate(modo === 'jefe' ? plantilla?.fecha_limite_jefe : plantilla?.fecha_limite_autoevaluacion)}.</div>
      )}
      {modo === 'autoevaluacion' && <div className="alert alert-info mb-6">Tu autoevaluacion es confidencial hasta que tu jefe complete su evaluacion. Los resultados finales los comparte RRHH.</div>}
      {locked && <div className="alert alert-warning mb-6">{isClosed(plantilla) ? 'La plantilla esta cerrada.' : modo === 'jefe' && !evaluacion.jefe_id ? 'Esta evaluacion no tiene jefe asignado.' : 'Esta evaluacion no esta disponible para edicion.'}</div>}

      <div style={{ display: modo === 'jefe' ? 'grid' : 'block', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 18 }}>
        <div className="col" style={{ gap: 16 }}>
          <SectionTitle title="Competencias" />
          {competencias.map(c => {
            const r = compRespuestas.find(x => x.competencia_id === c.id) || {};
            return (
              <div key={c.id} className="card" style={{ padding: 18 }}>
                <h3 style={{ margin: '0 0 4px' }}>{c.nombre}</h3>
                {c.descripcion && <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>{c.descripcion}</div>}
                <ScaleSelector cfg={cfg} min={c.escala_min} max={c.escala_max} value={r.puntaje} disabled={locked} onChange={value => setCompRespuestas(prev => prev.map(x => x.competencia_id === c.id ? { ...x, puntaje: value } : x))} />
                <textarea className="input mt-6" rows={2} placeholder="Comentario opcional" value={r.comentario || ''} disabled={locked} onChange={e => setCompRespuestas(prev => prev.map(x => x.competencia_id === c.id ? { ...x, comentario: e.target.value } : x))} />
              </div>
            );
          })}
          <SectionTitle title="Objetivos" />
          {objetivos.length ? objetivos.map(o => {
            const r = objRespuestas.find(x => x.objetivo_id === o.id) || {};
            const currentPct = calcularPorcentajeObjetivo(r.resultado_real, o.meta_numerica);
            return (
              <div key={o.id} className="card" style={{ padding: 18 }}>
                <h3 style={{ margin: '0 0 4px' }}>{o.nombre}</h3>
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>{o.descripcion || 'Sin descripcion'} · Meta {o.meta_numerica} ({o.unidad_medida})</div>
                <input className="input" type="number" min="0" step="0.01" value={r.resultado_real} disabled={locked || modo === 'jefe'} onChange={e => setObjRespuestas(prev => prev.map(x => x.objetivo_id === o.id ? { ...x, resultado_real: e.target.value, porcentaje_cumplimiento: calcularPorcentajeObjetivo(e.target.value, o.meta_numerica) } : x))} />
                <div style={{ marginTop: 8, fontSize: 13 }}>Lograste el <strong>{pct(currentPct)}</strong> de tu meta.</div>
                <textarea className="input mt-6" rows={2} placeholder={modo === 'jefe' ? 'Comentario del jefe sobre el cumplimiento' : 'Comentario opcional'} value={r.comentario || ''} disabled={locked} onChange={e => setObjRespuestas(prev => prev.map(x => x.objetivo_id === o.id ? { ...x, comentario: e.target.value } : x))} />
              </div>
            );
          }) : <div className="card" style={{ padding: 18, color: 'var(--fg-muted)' }}>Esta plantilla no tiene objetivos.</div>}
          {modo === 'jefe' && (
            <div className="card" style={{ padding: 18 }}>
              <h3 style={{ marginTop: 0 }}>Comentario final del jefe</h3>
              <textarea className="input" rows={5} value={comentarioFinal} disabled={locked} onChange={e => setComentarioFinal(e.target.value)} placeholder="Fortalezas, areas de mejora y proximos pasos." />
            </div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={!complete || locked || saving} onClick={submit}>{saving ? 'Enviando...' : modo === 'jefe' ? 'Enviar evaluacion del jefe' : 'Enviar autoevaluacion'}</button>
          </div>
        </div>
        {modo === 'jefe' && (
          <aside className="card" style={{ padding: 16, height: 'fit-content', position: 'sticky', top: 16 }}>
            <h3 style={{ marginTop: 0 }}>Autoevaluacion del colaborador</h3>
            <AutoResumen model={model} evaluacion={evaluacion} />
          </aside>
        )}
      </div>
    </>
  );
}

function ResultadoIndividual({ model, evaluacionId, onBack }) {
  const { app, plantillaById, competenciasByPlantilla, objetivosByPlantilla, isOwnEval, canManage } = model;
  const e = (app.evaluacionEvaluaciones || []).find(x => x.id === evaluacionId);
  const [amonDelPeriodo, setAmonDelPeriodo] = useState([]);
  const plantilla = e ? plantillaById.get(String(e.plantilla_id)) : null;

  useEffect(() => {
    if (!e || !app?.empresa?.id || !canManage) return;
    const periodoStr = plantilla?.periodo || '';
    // Intentar extraer rango del string de período (ej: "Enero 2026" → mes/año)
    const match = periodoStr.match(/(\d{4})/);
    const anio = match ? match[1] : String(new Date().getFullYear());
    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;
    getAmonestacionesActivas(app.empresa.id, e.evaluado_id, desde, hasta)
      .then(setAmonDelPeriodo)
      .catch(() => setAmonDelPeriodo([]));
  }, [e?.id, app?.empresa?.id, canManage]);

  if (!e) return <div className="card" style={{ padding: 24 }}>Resultado no encontrado.</div>;
  const visible = canManage || (isOwnEval(e) && isClosed(plantilla));
  if (!visible) return <div className="alert alert-warning">Los resultados seran visibles para el colaborador cuando RRHH cierre la plantilla.</div>;
  const competencias = competenciasByPlantilla.get(String(plantilla?.id)) || [];
  const objetivos = objetivosByPlantilla.get(String(plantilla?.id)) || [];
  const compAuto = app.evaluacionRespCompetencias.filter(r => r.evaluacion_id === e.id && r.tipo_evaluador === 'autoevaluacion');
  const compJefe = app.evaluacionRespCompetencias.filter(r => r.evaluacion_id === e.id && r.tipo_evaluador === 'jefe');
  const objAuto = app.evaluacionRespObjetivos.filter(r => r.evaluacion_id === e.id && r.tipo_evaluador === 'autoevaluacion');
  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-ghost" onClick={onBack} style={{ paddingLeft: 0 }}>Volver</button>
          <h1 className="page-title">Resultado · {e.evaluado_nombre}</h1>
          <div className="page-sub">{plantilla?.nombre} · {plantilla?.periodo}</div>
        </div>
        <ScoreBadge score={e.score_final} />
      </div>
      <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ marginTop: 0 }}>Comparativo</h3>
          <div className="col" style={{ gap: 12 }}>
            <MiniBar label="Autoevaluacion" value={e.score_autoevaluacion} color="var(--cyan)" />
            <MiniBar label="Jefe" value={e.score_jefe} color="var(--green)" />
            <MiniBar label="Final" value={e.score_final} color="var(--navy)" />
          </div>
        </div>
        <div className="card" style={{ padding: 18, borderLeft: '4px solid var(--green)' }}>
          <div className="eyebrow">Comentario final del jefe</div>
          <p style={{ marginBottom: 0 }}>{e.comentario_final_jefe || 'Sin comentario registrado.'}</p>
        </div>
      </div>
      <div className="card mb-6">
        <div className="card-head"><h3>Competencias</h3></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Competencia</th><th>Autoevaluacion</th><th>Jefe</th></tr></thead>
            <tbody>{competencias.map(c => <tr key={c.id}><td><strong>{c.nombre}</strong></td><td>{compAuto.find(r => r.competencia_id === c.id)?.puntaje ?? '-'}</td><td>{compJefe.find(r => r.competencia_id === c.id)?.puntaje ?? '-'}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Objetivos</h3></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Objetivo</th><th>Meta</th><th>Resultado real</th><th>Cumplimiento</th></tr></thead>
            <tbody>{objetivos.map(o => {
              const r = objAuto.find(x => x.objetivo_id === o.id);
              return <tr key={o.id}><td><strong>{o.nombre}</strong></td><td>{o.meta_numerica}</td><td>{r?.resultado_real ?? '-'}</td><td>{pct(r?.porcentaje_cumplimiento)}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </div>

      {canManage && (
        <div className="card" style={{ borderLeft: '4px solid var(--orange)' }}>
          <div className="card-head">
            <h3 style={{ margin: 0 }}>Amonestaciones en el período evaluado</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>Solo lectura — contexto para el evaluador. No afecta el score.</span>
          </div>
          <div style={{ padding: '0 20px 16px' }}>
            {amonDelPeriodo.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>Sin amonestaciones activas en el período de esta evaluación.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {amonDelPeriodo.map(a => (
                  <div key={a.id} style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, borderLeft: `3px solid ${a.tipo === 'suspension' ? 'var(--danger)' : a.tipo === 'escrita' ? 'var(--orange)' : 'var(--fg-muted)'}` }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                      <span className={`badge ${a.tipo === 'suspension' ? 'badge-gray' : a.tipo === 'escrita' ? 'badge-red' : 'badge-orange'}`} style={{ fontSize: 10 }}>{a.tipo}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}>{a.fecha}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.motivo}</div>
                    {a.descripcion && <div className="text-muted" style={{ fontSize: 12 }}>{a.descripcion}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function EvaluacionPanel({ model, evaluacion, onClose }) {
  const { app, plantillaById, competenciasByPlantilla, objetivosByPlantilla } = model;
  const p = plantillaById.get(String(evaluacion.plantilla_id));
  const competencias = competenciasByPlantilla.get(String(p?.id)) || [];
  const objetivos = objetivosByPlantilla.get(String(p?.id)) || [];
  const [jefeId, setJefeId] = useState(evaluacion.jefe_id || '');
  const saveJefe = async () => {
    const jefe = (app.usuarios || []).find(u => String(u.id) === String(jefeId));
    await app.reasignarJefeEvaluacionCtx(evaluacion.id, jefeId || null, jefe?.nombre || '');
    onClose();
  };
  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose} />
      <div className="side-panel" style={{ width: 520 }}>
        <div className="side-panel-head">
          <div><div className="eyebrow">Evaluacion</div><h3 style={{ margin: 0 }}>{evaluacion.evaluado_nombre}</h3></div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="side-panel-body">
          <div className="grid-2" style={{ gap: 10, marginBottom: 16 }}>
            <Info label="Plantilla" value={p?.nombre} />
            <Info label="Estado" value={<span className={`badge ${estadoBadge(evaluacion.estado)}`}>{estadoLabel(evaluacion.estado)}</span>} />
            <Info label="Score auto" value={evaluacion.score_autoevaluacion ?? '-'} />
            <Info label="Score jefe" value={evaluacion.score_jefe ?? '-'} />
            <Info label="Score final" value={<ScoreBadge score={evaluacion.score_final} />} />
          </div>
          <div className="card" style={{ padding: 14, marginBottom: 16 }}>
            <div className="eyebrow">Reasignar jefe evaluador</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <select className="select" value={jefeId} onChange={e => setJefeId(e.target.value)}>
                <option value="">Sin jefe</option>
                {(app.usuarios || []).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
              <button className="btn btn-secondary" onClick={saveJefe}>Guardar</button>
            </div>
          </div>
          <AutoResumen model={model} evaluacion={evaluacion} />
          <div className="mt-6">
            <h3>Detalle de plantilla</h3>
            <div className="text-muted" style={{ fontSize: 13 }}>{competencias.length} competencias · {objetivos.length} objetivos</div>
          </div>
        </div>
      </div>
    </>
  );
}

function AutoResumen({ model, evaluacion }) {
  const { app, competenciasByPlantilla, objetivosByPlantilla, plantillaById } = model;
  const p = plantillaById.get(String(evaluacion.plantilla_id));
  const competencias = competenciasByPlantilla.get(String(p?.id)) || [];
  const objetivos = objetivosByPlantilla.get(String(p?.id)) || [];
  const compAuto = app.evaluacionRespCompetencias.filter(r => r.evaluacion_id === evaluacion.id && r.tipo_evaluador === 'autoevaluacion');
  const objAuto = app.evaluacionRespObjetivos.filter(r => r.evaluacion_id === evaluacion.id && r.tipo_evaluador === 'autoevaluacion');
  return (
    <div className="col" style={{ gap: 10 }}>
      {competencias.map(c => {
        const r = compAuto.find(x => x.competencia_id === c.id);
        return <div key={c.id} style={{ fontSize: 12 }}><strong>{c.nombre}</strong><div className="text-muted">Puntaje: {r?.puntaje ?? '-'} · {r?.comentario || 'Sin comentario'}</div></div>;
      })}
      {objetivos.map(o => {
        const r = objAuto.find(x => x.objetivo_id === o.id);
        return <div key={o.id} style={{ fontSize: 12 }}><strong>{o.nombre}</strong><div className="text-muted">Resultado: {r?.resultado_real ?? '-'} · {pct(r?.porcentaje_cumplimiento)}</div></div>;
      })}
    </div>
  );
}

function ScaleSelector({ cfg, min, max, value, disabled, onChange }) {
  const labels = cfg.eval_escala_labels || {};
  const values = [];
  for (let n = Number(min || 1); n <= Number(max || 5); n += 1) values.push(n);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {values.map(n => (
        <button key={n} type="button" className={`btn btn-sm ${Number(value) === n ? 'btn-primary' : 'btn-secondary'}`} disabled={disabled} onClick={() => onChange(n)}>
          {n} · {labels[n] || labels[String(n)] || n}
        </button>
      ))}
    </div>
  );
}

function ScalePreview({ cfg }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="eyebrow">Preview de escala</div>
      <ScaleSelector cfg={cfg} min={cfg.eval_escala_min} max={cfg.eval_escala_max} value="" disabled onChange={() => {}} />
    </div>
  );
}

function PercentPair({ a, b, la, lb, form, setForm }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
      <Field label={la}><input className="input" type="number" min="0" max="100" value={form[a]} onChange={e => setForm(p => ({ ...p, [a]: Number(e.target.value) }))} /></Field>
      <Field label={lb}><input className="input" type="number" min="0" max="100" value={form[b]} onChange={e => setForm(p => ({ ...p, [b]: Number(e.target.value) }))} /></Field>
    </div>
  );
}

function EditableItem({ children, idx, onMove, onDelete, disableDelete = false }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="badge badge-gray">#{idx + 1}</span>
        <div className="row">
          <button className="icon-btn" onClick={() => onMove(-1)} title="Subir">{I.arrowUp}</button>
          <button className="icon-btn" onClick={() => onMove(1)} title="Bajar">{I.arrowDown}</button>
          <button className="icon-btn" disabled={disableDelete} onClick={onDelete} title="Eliminar" style={{ color: 'var(--danger)' }}>{I.trash}</button>
        </div>
      </div>
      <div className="col" style={{ gap: 8 }}>{children}</div>
    </div>
  );
}

function moveItem(list, idx, dir) {
  const next = [...list];
  const target = idx + dir;
  if (target < 0 || target >= list.length) return next;
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

function FilterBar({ children }) {
  return <div className="card mb-6" style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>{children}</div>;
}

function Field({ label, children, wide }) {
  return <div className="input-group" style={wide ? { gridColumn: '1/-1' } : undefined}><label>{label}</label>{children}</div>;
}

function SectionTitle({ title }) {
  return <div className="eyebrow" style={{ marginTop: 4 }}>{title}</div>;
}

function Kpi({ label, value, sub }) {
  return <div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-sub">{sub}</div></div>;
}

function Info({ label, value }) {
  return <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 10 }}><div className="text-muted" style={{ fontSize: 11 }}>{label}</div><div style={{ fontWeight: 700, marginTop: 2 }}>{value}</div></div>;
}

import React, { useEffect, useMemo, useState } from 'react';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { rrhhService } from './services/rrhhService.js';
import { reclutamientoService, RECLUTAMIENTO_ETAPAS } from './services/reclutamientoService.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';

const hoy = () => new Date().toISOString().slice(0, 10);
const norm = v => String(v || '').toLowerCase();

function badgeEtapa(etapa) {
  if (etapa === 'contratado') return 'badge-green';
  if (etapa === 'descartado') return 'badge-red';
  if (etapa === 'seleccionado') return 'badge-cyan';
  if (etapa === 'evaluacion') return 'badge-orange';
  return 'badge-gray';
}

function candidatoDe(c) {
  return c.candidato || c;
}

export function Reclutamiento() {
  const {
    empresa, cargos = [], sedes = [], areasEmpresa = [], usuarios = [], authUser,
    reclutamientoVacantes = [], reclutamientoCandidaturas = [],
    crearVacanteReclutamientoCtx, crearCandidaturaReclutamientoCtx,
    moverCandidaturaReclutamientoCtx, invitarCandidatoReclutamientoCtx,
    addNotificacion, navigate,
  } = useApp();
  const [tab, setTab] = useState('pipeline');
  const [vacanteActiva, setVacanteActiva] = useState('');
  const [showVacante, setShowVacante] = useState(false);
  const [showCandidato, setShowCandidato] = useState(false);
  const [sel, setSel] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [maxEtapa, setMaxEtapa] = useState('');
  const [formVacante, setFormVacante] = useState({ cargo: '', cargo_id: '', area: '', sede: '', descripcion: '', posiciones: 1, fecha_apertura: hoy() });
  const [formCand, setFormCand] = useState({ vacante_id: '', nombre: '', dni: '', telefono: '', email: '', fuente: 'interno', notas_evaluacion: '' });
  const [historialDni, setHistorialDni] = useState(null);
  const vacantesVisibles = reclutamientoVacantes.filter(v => v.estado !== 'cancelada');
  const vacante = vacantesVisibles.find(v => v.id === vacanteActiva) || vacantesVisibles[0] || null;

  useEffect(() => {
    if (!vacanteActiva && vacantesVisibles[0]?.id) setVacanteActiva(vacantesVisibles[0].id);
  }, [vacanteActiva, vacantesVisibles.map(v => v.id).join('|')]);

  useEffect(() => {
    const dni = formCand.dni.replace(/\D/g, '');
    if (dni.length < 8 || !empresa?.id) { setHistorialDni(null); return; }
    let alive = true;
    rrhhService.verificarHistorialDni(dni, empresa.id)
      .then(info => { if (alive) setHistorialDni(info?.encontrado ? info : null); })
      .catch(() => { if (alive) setHistorialDni(null); });
    return () => { alive = false; };
  }, [formCand.dni, empresa?.id]);

  const candidaturasVacante = reclutamientoCandidaturas.filter(c => c.vacante_id === vacante?.id);
  const candidatosBanco = useMemo(() => {
    const etapaRank = { postulado: 1, entrevista: 2, evaluacion: 3, seleccionado: 4, contratado: 5, descartado: 6 };
    const rows = reclutamientoCandidaturas.map(c => ({ ...c, candidato: candidatoDe(c) }));
    return rows.filter(c => {
      const cand = candidatoDe(c);
      const texto = `${cand.nombre} ${cand.dni} ${cand.email} ${c.notas_evaluacion} ${c.descarte_motivo}`.toLowerCase();
      const pasaTexto = !busqueda || texto.includes(busqueda.toLowerCase());
      const pasaCargo = !vacante?.cargo || norm(c.cargo_postulado || '') === norm(vacante.cargo) || true;
      const pasaEtapa = !maxEtapa || (etapaRank[c.etapa] || 0) >= (etapaRank[maxEtapa] || 0);
      return pasaTexto && pasaCargo && pasaEtapa;
    });
  }, [reclutamientoCandidaturas, busqueda, maxEtapa, vacante?.cargo]);

  const crearVacante = async (e) => {
    e.preventDefault();
    const creada = await crearVacanteReclutamientoCtx(formVacante);
    setVacanteActiva(creada.id);
    setShowVacante(false);
    setFormVacante({ cargo: '', cargo_id: '', area: '', sede: '', descripcion: '', posiciones: 1, fecha_apertura: hoy() });
    addNotificacion('Vacante creada.');
  };

  const crearCandidatura = async (e) => {
    e.preventDefault();
    if (!formCand.vacante_id && !vacante?.id) return;
    await crearCandidaturaReclutamientoCtx({
      ...formCand,
      vacante_id: formCand.vacante_id || vacante.id,
      dni: formCand.dni.replace(/\D/g, ''),
      alerta_historial: historialDni,
    });
    setShowCandidato(false);
    setFormCand({ vacante_id: vacante?.id || '', nombre: '', dni: '', telefono: '', email: '', fuente: 'interno', notas_evaluacion: '' });
    setHistorialDni(null);
    addNotificacion('Candidatura registrada.');
  };

  const mover = async (candidatura, etapa) => {
    let descarte_motivo = '';
    if (etapa === 'descartado') {
      descarte_motivo = window.prompt('Motivo del descarte');
      if (!descarte_motivo) return;
    }
    if (etapa === 'contratado') {
      const cand = candidatoDe(candidatura);
      const tipo = window.confirm('Crear alta como administrativo? Aceptar = administrativo, Cancelar = operativo') ? 'administrativo' : 'operativo';
      navigate(tipo === 'administrativo' ? 'rrhh_admin' : 'rrhh_operativo', {
        action: 'new',
        nombre: cand.nombre,
        dni: cand.dni,
        telefono: cand.telefono,
        email: cand.email,
        candidaturaId: candidatura.id,
      });
    }
    await moverCandidaturaReclutamientoCtx(candidatura.id, etapa, { descarte_motivo });
  };

  const copiarLink = async (v) => {
    const url = `${window.location.origin}${window.location.pathname}#postular/${v.public_token}`;
    await navigator.clipboard?.writeText(url).catch(() => {});
    addNotificacion('Link publico copiado.');
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Reclutamiento</h1>
          <div className="page-sub">Vacantes, pipeline de postulantes y banco de talentos</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowCandidato(true)}>{I.plus} Candidato</button>
          <button className="btn btn-primary" onClick={() => setShowVacante(true)}>{I.plus} Vacante</button>
        </div>
      </div>

      <div className="tabs">
        <button className={'tab ' + (tab === 'pipeline' ? 'active' : '')} onClick={() => setTab('pipeline')}>{I.grid} Pipeline</button>
        <button className={'tab ' + (tab === 'vacantes' ? 'active' : '')} onClick={() => setTab('vacantes')}>{I.clipboard} Vacantes</button>
        <button className={'tab ' + (tab === 'banco' ? 'active' : '')} onClick={() => setTab('banco')}>{I.users} Banco</button>
      </div>

      {tab === 'pipeline' && (
        <>
          <div className="card" style={{ padding: 14, marginBottom: 14 }}>
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <select className="select" value={vacante?.id || ''} onChange={e => setVacanteActiva(e.target.value)} style={{ maxWidth: 360 }}>
                {vacantesVisibles.map(v => <option key={v.id} value={v.id}>{v.cargo} - {v.sede || 'Sin sede'}</option>)}
              </select>
              {vacante && <span className="badge badge-cyan">{vacante.estado}</span>}
              {vacante && <span className="text-muted" style={{ fontSize: 12 }}>{vacante.posiciones_cubiertas || 0}/{vacante.posiciones} cubiertas</span>}
              {vacante?.public_token && <button className="btn btn-secondary btn-sm" onClick={() => copiarLink(vacante)}>{I.link || I.file} Link publico</button>}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div className="kanban-v2">
              {RECLUTAMIENTO_ETAPAS.map(col => {
                const lista = candidaturasVacante.filter(c => c.etapa === col.key);
                return (
                  <div key={col.key} className="kanban-col-v2" onDragOver={e => e.preventDefault()} onDrop={e => {
                    const id = e.dataTransfer.getData('text/plain');
                    const c = candidaturasVacante.find(x => x.id === id);
                    if (c && c.etapa !== col.key) mover(c, col.key);
                  }}>
                    <div className="kanban-col-head-v2">
                      <div className="kanban-col-title-v2">{col.label}</div>
                      <div className="kanban-col-count-v2">{lista.length}</div>
                    </div>
                    {lista.map(c => {
                      const cand = candidatoDe(c);
                      const alerta = cand.alerta_historial || {};
                      return (
                        <div key={c.id} className="kanban-card-v2" draggable onDragStart={e => e.dataTransfer.setData('text/plain', c.id)} onClick={() => setSel(c)}>
                          <div className="kanban-card-title">{cand.nombre}</div>
                          <div className="kanban-card-sub">DNI {cand.dni} · {c.fuente}</div>
                          {alerta.no_recontratar && <span className="badge badge-red">No recontratar</span>}
                          {!alerta.no_recontratar && alerta.encontrado && <span className="badge badge-orange">Historial laboral</span>}
                          <div className="kanban-card-foot"><span>{cand.email || cand.telefono || '-'}</span><span>{c.notas_evaluacion ? 'Notas' : ''}</span></div>
                        </div>
                      );
                    })}
                    <button className="kanban-btn-add" onClick={() => { setFormCand(f => ({ ...f, vacante_id: vacante?.id || '' })); setShowCandidato(true); }}>{I.plus} Agregar</button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {tab === 'vacantes' && (
        <div className="card p-0">
          <table className="table">
            <thead><tr><th>Cargo</th><th>Area</th><th>Sede</th><th>Estado</th><th>Posiciones</th><th>Link</th></tr></thead>
            <tbody>{vacantesVisibles.map(v => (
              <tr key={v.id}>
                <td><strong>{v.cargo}</strong><div className="text-muted" style={{ fontSize: 12 }}>{v.descripcion}</div></td>
                <td>{v.area || '-'}</td><td>{v.sede || '-'}</td>
                <td><span className="badge badge-cyan">{v.estado}</span></td>
                <td>{v.posiciones_cubiertas || 0}/{v.posiciones}</td>
                <td>{v.public_token ? <button className="btn btn-secondary btn-sm" onClick={() => copiarLink(v)}>Copiar</button> : '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'banco' && (
        <>
          <div className="card" style={{ padding: 14, marginBottom: 14 }}>
            <div className="row" style={{ gap: 10 }}>
              <input className="input" placeholder="Buscar por nombre, DNI, email o notas" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              <select className="select" value={maxEtapa} onChange={e => setMaxEtapa(e.target.value)} style={{ maxWidth: 220 }}>
                <option value="">Cualquier etapa</option>
                {RECLUTAMIENTO_ETAPAS.map(e => <option key={e.key} value={e.key}>Min. {e.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid cols-3">
            {candidatosBanco.map(c => {
              const cand = candidatoDe(c);
              return (
                <div className="card" key={`${c.id}-${cand.id}`} style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div><strong>{cand.nombre}</strong><div className="text-muted" style={{ fontSize: 12 }}>DNI {cand.dni}</div></div>
                    <span className={'badge ' + badgeEtapa(c.etapa)}>{c.etapa}</span>
                  </div>
                  {c.descarte_motivo && <div className="alert alert-warning" style={{ fontSize: 12, marginTop: 10 }}>{c.descarte_motivo}</div>}
                  {cand.alerta_historial?.no_recontratar && <div className="alert alert-danger" style={{ fontSize: 12, marginTop: 10 }}>No recontratable: {cand.alerta_historial.no_recontratar_motivo}</div>}
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: '100%' }} disabled={!vacante?.id} onClick={() => invitarCandidatoReclutamientoCtx(cand, vacante.id)}>Invitar a esta vacante</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showVacante && (
        <div className="modal-backdrop" onClick={() => setShowVacante(false)}>
          <form className="side-panel" onClick={e => e.stopPropagation()} onSubmit={crearVacante}>
            <div className="panel-head"><h2>Nueva vacante</h2><button type="button" className="icon-btn" onClick={() => setShowVacante(false)}>{I.x}</button></div>
            <div className="panel-body col" style={{ gap: 12 }}>
              <div className="input-group"><label>Cargo *</label><input className="input" required value={formVacante.cargo} onChange={e => setFormVacante(f => ({ ...f, cargo: e.target.value }))} list="cargos-rrhh" /></div>
              <datalist id="cargos-rrhh">{cargos.map(c => <option key={c.id || c.nombre} value={c.nombre || c.cargo} />)}</datalist>
              <div className="input-group"><label>Area</label><input className="input" value={formVacante.area} onChange={e => setFormVacante(f => ({ ...f, area: e.target.value }))} list="areas-rrhh" /></div>
              <datalist id="areas-rrhh">{areasEmpresa.map(a => <option key={a.id || a.nombre} value={a.nombre} />)}</datalist>
              <div className="input-group"><label>Sede</label><input className="input" value={formVacante.sede} onChange={e => setFormVacante(f => ({ ...f, sede: e.target.value }))} list="sedes-rrhh" /></div>
              <datalist id="sedes-rrhh">{sedes.map(s => <option key={s.id || s.nombre} value={s.nombre} />)}</datalist>
              <div className="input-group"><label>Posiciones</label><input className="input" type="number" min="1" value={formVacante.posiciones} onChange={e => setFormVacante(f => ({ ...f, posiciones: e.target.value }))} /></div>
              <div className="input-group"><label>Requisitos</label><textarea className="input" rows={4} value={formVacante.descripcion} onChange={e => setFormVacante(f => ({ ...f, descripcion: e.target.value }))} /></div>
            </div>
            <div className="panel-foot"><button className="btn btn-primary" type="submit">Crear vacante</button></div>
          </form>
        </div>
      )}

      {showCandidato && (
        <div className="modal-backdrop" onClick={() => setShowCandidato(false)}>
          <form className="side-panel" onClick={e => e.stopPropagation()} onSubmit={crearCandidatura}>
            <div className="panel-head"><h2>Nuevo candidato</h2><button type="button" className="icon-btn" onClick={() => setShowCandidato(false)}>{I.x}</button></div>
            <div className="panel-body col" style={{ gap: 12 }}>
              <div className="input-group"><label>Vacante</label><select className="select" value={formCand.vacante_id || vacante?.id || ''} onChange={e => setFormCand(f => ({ ...f, vacante_id: e.target.value }))}>{vacantesVisibles.map(v => <option key={v.id} value={v.id}>{v.cargo}</option>)}</select></div>
              <div className="input-group"><label>Nombre *</label><input className="input" required value={formCand.nombre} onChange={e => setFormCand(f => ({ ...f, nombre: e.target.value }))} /></div>
              <div className="input-group"><label>DNI *</label><input className="input" required maxLength={12} value={formCand.dni} onChange={e => setFormCand(f => ({ ...f, dni: e.target.value }))} /></div>
              {historialDni?.no_recontratar && <div className="alert alert-danger"><strong>Alerta roja: no recontratar.</strong><br />{historialDni.no_recontratar_motivo || historialDni.tipo_cese}</div>}
              {historialDni && !historialDni.no_recontratar && <div className="alert alert-warning">Existe historial laboral: {historialDni.estado_laboral || historialDni.estado}</div>}
              <div className="input-group"><label>Telefono</label><input className="input" value={formCand.telefono} onChange={e => setFormCand(f => ({ ...f, telefono: e.target.value }))} /></div>
              <div className="input-group"><label>Email</label><input className="input" type="email" value={formCand.email} onChange={e => setFormCand(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="input-group"><label>Fuente</label><select className="select" value={formCand.fuente} onChange={e => setFormCand(f => ({ ...f, fuente: e.target.value }))}><option value="interno">Interno</option><option value="referido">Referido</option><option value="banco_talentos">Banco de talentos</option><option value="portal_publico">Portal publico</option></select></div>
              <div className="input-group"><label>Notas</label><textarea className="input" rows={3} value={formCand.notas_evaluacion} onChange={e => setFormCand(f => ({ ...f, notas_evaluacion: e.target.value }))} /></div>
            </div>
            <div className="panel-foot"><button className="btn btn-primary" type="submit">Registrar</button></div>
          </form>
        </div>
      )}

      {sel && (
        <div className="modal-backdrop" onClick={() => setSel(null)}>
          <div className="side-panel" onClick={e => e.stopPropagation()}>
            <div className="panel-head"><h2>{candidatoDe(sel).nombre}</h2><button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button></div>
            <div className="panel-body">
              <div className="card" style={{ padding: 14, marginBottom: 12 }}>
                <div className="text-muted" style={{ fontSize: 12 }}>DNI {candidatoDe(sel).dni}</div>
                <div style={{ marginTop: 6 }}>{candidatoDe(sel).email || '-'} · {candidatoDe(sel).telefono || '-'}</div>
              </div>
              {candidatoDe(sel).alerta_historial?.no_recontratar && <div className="alert alert-danger">No recontratar: {candidatoDe(sel).alerta_historial.no_recontratar_motivo}</div>}
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Historial de etapas</div>
                {(sel.historial || []).map((h, i) => <div key={i} style={{ fontSize: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>{h.etapa_desde ? `${h.etapa_desde} -> ` : ''}{h.etapa_hasta} · {(h.fecha || '').slice(0, 10)} · {h.usuario || '-'}</div>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PostulacionPublica({ token }) {
  const [vacante, setVacante] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ nombre: '', dni: '', telefono: '', email: '', file: null });

  useEffect(() => {
    let alive = true;
    if (!isSupabaseConfigured()) {
      setVacante({ id: 'vac_001', empresa_id: 'emp_001', cargo: 'Tecnico mecanico de mina', sede: 'Arequipa', estado: 'abierta' });
      setLoading(false);
      return;
    }
    reclutamientoService.getPublicVacante(token)
      .then(v => { if (alive) setVacante(v); })
      .catch(e => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (!vacante || vacante.estado !== 'abierta') throw new Error('Esta vacante ya no recibe postulaciones.');
      if (isSupabaseConfigured()) await reclutamientoService.crearPostulacionPublica(vacante, form);
      setSent(true);
    } catch (err) {
      setError(err.message || 'No se pudo enviar la postulacion.');
    }
  };

  return (
    <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <form className="card" style={{ width: 'min(560px, 100%)', padding: 24 }} onSubmit={submit}>
        <div className="eyebrow">Postulacion</div>
        <h1 className="page-title" style={{ marginTop: 6 }}>{loading ? 'Cargando...' : vacante?.cargo || 'Vacante no disponible'}</h1>
        {vacante?.sede && <div className="page-sub">{vacante.sede}</div>}
        {sent ? (
          <div className="alert alert-success" style={{ marginTop: 18 }}>Postulacion recibida. RRHH revisara tu informacion.</div>
        ) : !loading && vacante?.estado === 'abierta' ? (
          <div className="col" style={{ gap: 12, marginTop: 18 }}>
            <input className="input" required placeholder="Nombre completo" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            <input className="input" required placeholder="DNI" value={form.dni} onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} />
            <input className="input" required placeholder="Telefono" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
            <input className="input" type="email" required placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input className="input" type="file" accept=".pdf,image/png,image/jpeg" required onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))} />
            <div className="text-muted" style={{ fontSize: 12 }}>PDF, PNG o JPG. Maximo 5 MB.</div>
            {error && <div className="alert alert-danger">{error}</div>}
            <button className="btn btn-primary" type="submit">Enviar postulacion</button>
          </div>
        ) : (
          <div className="alert alert-warning" style={{ marginTop: 18 }}>La vacante fue cerrada o el link fue revocado.</div>
        )}
      </form>
    </div>
  );
}

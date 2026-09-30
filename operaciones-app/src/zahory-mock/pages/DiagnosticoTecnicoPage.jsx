import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/shell.jsx';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import {
  crearDiagnosticoTecnico,
  listarDiagnosticosTecnicos,
  listarReferenciasDiagnostico,
  obtenerDiagnosticoTecnico,
  resolverReferenciasDiagnostico,
  usuarioPuedeDiagnostico,
} from '../../services/diagnosticoTecnicoService.js';

const EMPTY_FORM = { tipo: '', referencia: null };
const errorMessage = error => error?.message || 'No se pudo completar la operación.';
const referenceLabel = reference => reference?.numero || 'Referencia no disponible';
const typeLabel = tipo => tipo === 'fabricacion' ? 'Fabricación' : 'Mantenimiento';
const statusLabel = estado => estado === 'emitido' ? 'Emitido' : 'Borrador';
const statusClass = estado => estado === 'emitido' ? 'badge green' : 'badge orange';

async function resolverReferenciasPorTipo(empresaId, tipo, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return [];
  const resolved = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 200) {
    resolved.push(...await resolverReferenciasDiagnostico(empresaId, tipo, uniqueIds.slice(offset, offset + 200)));
  }
  return resolved;
}

async function adjuntarReferencias(empresaId, rows) {
  const idsPorTipo = {
    mantenimiento: [...new Set(rows.filter(row => row.tipo === 'mantenimiento').map(row => row.recepcion_id).filter(Boolean))],
    fabricacion: [...new Set(rows.filter(row => row.tipo === 'fabricacion').map(row => row.oportunidad_id).filter(Boolean))],
  };
  const [mantenimiento, fabricacion] = await Promise.all([
    resolverReferenciasPorTipo(empresaId, 'mantenimiento', idsPorTipo.mantenimiento),
    resolverReferenciasPorTipo(empresaId, 'fabricacion', idsPorTipo.fabricacion),
  ]);
  const referencias = {
    mantenimiento: new Map(mantenimiento.map(reference => [reference.id, reference])),
    fabricacion: new Map(fabricacion.map(reference => [reference.id, reference])),
  };
  return rows.map(row => ({
    ...row,
    referencia: referencias[row.tipo].get(row.tipo === 'fabricacion' ? row.oportunidad_id : row.recepcion_id) || null,
  }));
}

function AccessState({ loading, title, error }) {
  return (
    <main className="ops-page" style={{ padding: 24 }}>
      <div className="card" style={{ maxWidth: 680, margin: '48px auto', textAlign: 'center', padding: 32 }}>
        {loading ? <>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <h2>Verificando permisos</h2>
        </> : <>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <h2>{title || 'No tienes acceso a esta pantalla'}</h2>
          {error && <div className="alert alert-error" style={{ textAlign: 'left', marginTop: 16 }}>{error}</div>}
        </>}
      </div>
    </main>
  );
}

function ReferenceSelector({ tipo, value, search, references, loading, disabled, onSearch, onSelect }) {
  const isFabricacion = tipo === 'fabricacion';
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <label>{isFabricacion ? 'Oportunidad' : 'Recepción de activo'}</label>
      <input
        className="input"
        value={search}
        disabled={disabled}
        placeholder={isFabricacion ? 'Buscar por nombre de oportunidad...' : 'Buscar por número, cliente o activo...'}
        onChange={event => onSearch(event.target.value)}
      />
      {!disabled && <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
        {loading && <div className="muted" style={{ padding: 12 }}>Buscando referencias...</div>}
        {!loading && !references.length && <div className="muted" style={{ padding: 12 }}>Sin referencias encontradas.</div>}
        {!loading && references.map(reference => (
          <button
            type="button"
            key={reference.id}
            onClick={() => onSelect(reference)}
            style={{ display: 'block', width: '100%', border: 0, borderBottom: '1px solid var(--border)', background: value?.id === reference.id ? 'var(--cyan-lt)' : 'transparent', textAlign: 'left', padding: 10, cursor: 'pointer' }}
          >
            <strong>{referenceLabel(reference)}</strong>
            {reference.cliente && <span className="muted" style={{ display: 'block', marginTop: 3 }}>{reference.cliente}</span>}
            {!isFabricacion && reference.activo && <span className="muted" style={{ display: 'block', marginTop: 3 }}>{reference.activo}</span>}
          </button>
        ))}
      </div>}
      {value && <div className="hint" style={{ marginTop: 6 }}>Seleccionado: {referenceLabel(value)}</div>}
      {disabled && !value && <div className="hint" style={{ marginTop: 6 }}>Referencia no disponible</div>}
    </div>
  );
}

export function DiagnosticoTecnicoPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const usuarioId = sesion.usuario?.id;
  const [access, setAccess] = useState({ loading: true, ver: false, crear: false, editar: false, error: '' });
  const [diagnosticos, setDiagnosticos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [references, setReferences] = useState([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [referenceError, setReferenceError] = useState('');
  const [notice, setNotice] = useState('');

  const canCreate = access.ver && access.crear;
  const isReadOnly = selected?.estado === 'emitido';
  const canSave = !selected && canCreate;
  const selectedReference = form.referencia;

  const cargarLista = useCallback(async () => {
    if (!access.ver || !empresaId) return;
    setLoadingList(true);
    setReferenceError('');
    try {
      const rows = await listarDiagnosticosTecnicos(empresaId);
      try {
        setDiagnosticos(await adjuntarReferencias(empresaId, rows));
      } catch (referenceLoadError) {
        setReferenceError(errorMessage(referenceLoadError));
        setDiagnosticos(rows.map(row => ({ ...row, referencia: null })));
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoadingList(false);
    }
  }, [access.ver, empresaId]);

  useEffect(() => {
    let vigente = true;
    if (sesion.estado !== 'listo' || !empresaId) return () => { vigente = false; };
    setAccess(current => ({ ...current, loading: true, error: '' }));
    (async () => {
      try {
        const ver = await usuarioPuedeDiagnostico(empresaId, 'ver');
        if (!vigente) return;
        if (!ver) {
          setAccess({ loading: false, ver: false, crear: false, editar: false, error: '' });
          return;
        }
        const [crear, editar] = await Promise.all([
          usuarioPuedeDiagnostico(empresaId, 'crear'),
          usuarioPuedeDiagnostico(empresaId, 'editar'),
        ]);
        if (!vigente) return;
        setAccess({ loading: false, ver: true, crear, editar, error: '' });
      } catch (permissionError) {
        if (vigente) setAccess({ loading: false, ver: false, crear: false, editar: false, error: errorMessage(permissionError) });
      }
    })();
    return () => { vigente = false; };
  }, [empresaId, sesion.estado]);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  useEffect(() => {
    let vigente = true;
    if (!access.ver || !empresaId || !form.tipo || selected?.estado === 'emitido') {
      setReferences([]);
      return () => { vigente = false; };
    }
    const timer = window.setTimeout(() => {
      setLoadingReferences(true);
      listarReferenciasDiagnostico(empresaId, form.tipo, search)
        .then(data => { if (vigente) setReferences(data); })
        .catch(loadError => { if (vigente) setError(errorMessage(loadError)); })
        .finally(() => { if (vigente) setLoadingReferences(false); });
    }, 300);
    return () => {
      vigente = false;
      window.clearTimeout(timer);
    };
  }, [access.ver, empresaId, form.tipo, search, selected?.estado]);

  const openNew = tipo => {
    setSelected(null);
    setForm({ ...EMPTY_FORM, tipo });
    setSearch('');
    setReferenceError('');
    setNotice('');
    setError('');
  };

  const openExisting = async diagnostico => {
    setError('');
    setReferenceError('');
    setNotice('');
    try {
      const detail = await obtenerDiagnosticoTecnico(empresaId, diagnostico.id);
      const referenceId = detail.tipo === 'fabricacion' ? detail.oportunidad_id : detail.recepcion_id;
      let reference = null;
      try {
        const resolved = await resolverReferenciasPorTipo(empresaId, detail.tipo, [referenceId]);
        reference = resolved.find(candidate => candidate.id === referenceId) || null;
      } catch (referenceLoadError) {
        setReferenceError(errorMessage(referenceLoadError));
      }
      setSelected(detail);
      setForm({
        tipo: detail.tipo,
        referencia: reference,
      });
      setSearch('');
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  };

  const save = async event => {
    event.preventDefault();
    if (!sesion.permiteEscritura) {
      setError('La empresa operativa está en modo solo lectura; no se pueden guardar diagnósticos.');
      return;
    }
    if (!canSave) {
      setError('No tienes permiso para crear diagnósticos técnicos.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (!selected) {
        const created = await crearDiagnosticoTecnico(empresaId, usuarioId, {
          tipo: form.tipo,
          oportunidad_id: form.tipo === 'fabricacion' ? selectedReference?.id : null,
          recepcion_id: form.tipo === 'mantenimiento' ? selectedReference?.id : null,
        });
        setNotice('Diagnóstico guardado en borrador.');
        await cargarLista();
        await openExisting(created);
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const sessionError = !sesion.empresaId
    ? 'No se pudo identificar la empresa operativa del usuario.'
    : sesion.error || `La sesión operativa no está lista (estado: ${sesion.estado}).`;

  if (sesion.estado !== 'listo' || !empresaId) {
    return <AccessState title="No se puede abrir Diagnóstico Técnico" error={sessionError} />;
  }
  if (access.loading) return <AccessState loading />;
  if (!access.ver) return <AccessState error={access.error} />;

  return (
    <main className="ops-page" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="ops-eyebrow">Taller & Operaciones</div>
          <h1 style={{ margin: '4px 0 6px' }}>Diagnóstico Técnico</h1>
          <p className="muted" style={{ margin: 0 }}>Levantamiento técnico sin costos ni precios.</p>
        </div>
        {canCreate && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => openNew('fabricacion')}><Icon name="plus" size={14} /> Fabricación</button>
          <button type="button" className="btn btn-secondary" onClick={() => openNew('mantenimiento')}><Icon name="plus" size={14} /> Mantenimiento</button>
        </div>}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {referenceError && <div className="alert alert-error" style={{ marginBottom: 12 }}>No se pudo resolver la referencia: {referenceError}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}
      {!sesion.permiteEscritura && <div className="alert alert-error" style={{ marginBottom: 12 }}>La empresa operativa está en modo solo lectura; no se pueden guardar diagnósticos.</div>}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header"><h2 style={{ margin: 0, fontSize: 17 }}>Diagnósticos</h2></div>
        {loadingList ? <div className="card-body muted">Cargando diagnósticos...</div> : !diagnosticos.length ? (
          <div className="card-body muted">No hay diagnósticos registrados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table"><thead><tr><th>Tipo</th><th>Referencia</th><th>Estado</th><th>Actualizado</th></tr></thead>
              <tbody>{diagnosticos.map(row => (
                <tr key={row.id} onClick={() => openExisting(row)} style={{ cursor: 'pointer' }}>
                  <td>{typeLabel(row.tipo)}</td>
                  <td>
                    <strong>{row.tipo === 'fabricacion' ? 'Oportunidad' : 'Recepción'} · {referenceLabel(row.referencia)}</strong>
                    {row.referencia?.cliente && <span className="muted" style={{ display: 'block', marginTop: 3 }}>{row.referencia.cliente}</span>}
                    {row.tipo === 'mantenimiento' && row.referencia?.activo && <span className="muted" style={{ display: 'block', marginTop: 3 }}>{row.referencia.activo}</span>}
                  </td>
                  <td><span className={statusClass(row.estado)}>{statusLabel(row.estado)}</span></td>
                  <td>{row.updated_at ? new Date(row.updated_at).toLocaleString('es-PE') : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {(form.tipo || selected) && <form className="card" onSubmit={save}>
        <div className="card-header"><h2 style={{ margin: 0, fontSize: 17 }}>{selected ? `Diagnóstico ${selected.id}` : `Nuevo diagnóstico · ${typeLabel(form.tipo)}`}</h2><span className={statusClass(selected?.estado)}>{statusLabel(selected?.estado)}</span></div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
          <div className="field"><label>Tipo</label><input className="input" value={typeLabel(form.tipo)} disabled /></div>
          <ReferenceSelector tipo={form.tipo} value={selectedReference} search={search} references={references} loading={loadingReferences} disabled={Boolean(selected) || isReadOnly} onSearch={setSearch} onSelect={reference => { setForm(current => ({ ...current, referencia: reference })); setSearch(referenceLabel(reference)); }} />
        </div>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 0 }}>
          {!isReadOnly && canSave && <button className="btn btn-primary" type="submit" disabled={saving || !selectedReference}>{saving ? 'Guardando...' : 'Guardar'}</button>}
          {isReadOnly && <span className="muted">Los diagnósticos emitidos son de solo lectura.</span>}
        </div>
      </form>}
    </main>
  );
}

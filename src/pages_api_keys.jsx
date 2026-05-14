import { useState, useEffect, useCallback } from 'react';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { apiKeysService } from './services/apiKeysService.js';

const PERMISOS_DISPONIBLES = [
  { key: 'leads:write',         label: 'Leads — crear / actualizar' },
  { key: 'leads:read',          label: 'Leads — leer' },
  { key: 'contactos:write',     label: 'Contactos — crear / actualizar' },
  { key: 'contactos:read',      label: 'Contactos — leer' },
  { key: 'oportunidades:write', label: 'Oportunidades — crear / actualizar' },
  { key: 'oportunidades:read',  label: 'Oportunidades — leer' },
  { key: 'reportes:read',       label: 'Reportes — leer' },
];

function PermisoBadge({ permiso }) {
  const color = permiso.endsWith(':write') ? 'var(--cyan)' : 'var(--fg-subtle)';
  return (
    <span style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 4, border: `1px solid ${color}`, color, marginRight: 4, display: 'inline-block', marginBottom: 3 }}>
      {permiso}
    </span>
  );
}

function PermisosCheckboxes({ selected, onChange }) {
  const toggle = key => onChange(selected.includes(key) ? selected.filter(p => p !== key) : [...selected, key]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      {PERMISOS_DISPONIBLES.map(p => (
        <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={selected.includes(p.key)} onChange={() => toggle(p.key)} />
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--cyan)' }}>{p.key}</span>
          <span className="text-muted" style={{ fontSize: 12 }}>— {p.label.split('— ')[1]}</span>
        </label>
      ))}
    </div>
  );
}

export function ApiKeys() {
  const { empresa, isSuperadmin, authUser, addNotificacion } = useApp();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  // Panel: 'nuevo' | 'permisos' | null
  const [panel, setPanel] = useState(null);
  const [editando, setEditando] = useState(null);

  // Formulario nuevo key
  const [formDesc, setFormDesc] = useState('');
  const [formPermisos, setFormPermisos] = useState([]);
  const [formActivo, setFormActivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Modal one-time: key recién creado
  const [rawKeyVisible, setRawKeyVisible] = useState(null);
  const [copied, setCopied] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiKeysService.listar();
      setKeys(data);
    } catch {
      addNotificacion('No se pudieron cargar los API Keys.');
    }
    setLoading(false);
  }, [addNotificacion]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNuevo = () => {
    setFormDesc('');
    setFormPermisos([]);
    setFormActivo(true);
    setSaveError('');
    setPanel('nuevo');
  };

  const abrirEditarPermisos = (k) => {
    setEditando(k);
    setFormPermisos([...(k.permisos || [])]);
    setSaveError('');
    setPanel('permisos');
  };

  const cerrar = () => { setPanel(null); setEditando(null); setSaveError(''); };

  const crearKey = async e => {
    e.preventDefault();
    if (saving) return;
    if (!formDesc.trim()) { setSaveError('La descripción es obligatoria.'); return; }
    if (formPermisos.length === 0) { setSaveError('Selecciona al menos un permiso.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const nuevo = await apiKeysService.crear(empresa.id, formDesc.trim(), formPermisos, authUser?.id, formActivo);
      setKeys(prev => [nuevo, ...prev]);
      setRawKeyVisible(nuevo.rawKey);
      setCopied(false);
      cerrar();
      addNotificacion('API Key creado.');
    } catch (err) {
      setSaveError(err?.message || 'No se pudo crear el key.');
    }
    setSaving(false);
  };

  const guardarPermisos = async e => {
    e.preventDefault();
    if (saving) return;
    if (formPermisos.length === 0) { setSaveError('Selecciona al menos un permiso.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const actualizado = await apiKeysService.actualizarPermisos(editando.id, formPermisos);
      setKeys(prev => prev.map(k => k.id === editando.id ? { ...k, ...actualizado } : k));
      cerrar();
      addNotificacion('Permisos actualizados.');
    } catch (err) {
      setSaveError(err?.message || 'No se pudo actualizar.');
    }
    setSaving(false);
  };

  const revocar = async (k) => {
    if (!window.confirm(`Revocar el key "${k.descripcion}"? Esta acción es irreversible.`)) return;
    try {
      await apiKeysService.revocar(k.id);
      setKeys(prev => prev.map(x => x.id === k.id ? { ...x, activo: false } : x));
      addNotificacion('API Key revocado.');
    } catch {
      addNotificacion('No se pudo revocar el key.');
    }
  };

  const copiarKey = async () => {
    await navigator.clipboard.writeText(rawKeyVisible);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tenantNombre = (k) => {
    if (!isSuperadmin) return null;
    const e = k.empresas;
    return e?.nombre_comercial || e?.razon_social || k.empresa_id;
  };

  const fmtFecha = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">API Keys</h1>
          <div className="page-sub">Autenticación para integraciones externas · {keys.filter(k => k.activo).length} keys activos</div>
        </div>
        <button className="btn btn-primary" data-local-form="true" onClick={abrirNuevo}>{I.plus} Nuevo API Key</button>
      </div>

      {/* Modal one-time: key recién creado */}
      {rawKeyVisible && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 28px 24px', maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>API Key creado</div>
            <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: '#92400e' }}>
              ⚠ Guarda este key ahora. <strong>No volverá a mostrarse.</strong> Si lo pierdes, deberás revocar y crear uno nuevo.
            </div>
            <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-subtle)', marginBottom: 8 }}>Tu API Key</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 20 }}>
              <code style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', flex: 1, wordBreak: 'break-all', lineHeight: 1.6 }}>
                {rawKeyVisible}
              </code>
              <button className="btn btn-secondary" style={{ whiteSpace: 'nowrap', alignSelf: 'stretch' }} onClick={copiarKey}>
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginBottom: 18 }}>
              Formato: <code style={{ fontFamily: 'monospace' }}>X-Api-Key: {rawKeyVisible}</code>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setRawKeyVisible(null)}>
              Entendido, ya lo guardé
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {isSuperadmin && <th>Tenant</th>}
                <th>Descripción</th>
                <th>Permisos</th>
                <th>Estado</th>
                <th>Creado</th>
                <th>Último uso</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={isSuperadmin ? 7 : 6} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>Cargando...</td></tr>
              )}
              {!loading && keys.length === 0 && (
                <tr><td colSpan={isSuperadmin ? 7 : 6} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>Sin API Keys. Crea el primero.</td></tr>
              )}
              {keys.map(k => (
                <tr key={k.id} className="hover-row" style={{ opacity: k.activo ? 1 : 0.5 }}>
                  {isSuperadmin && <td className="text-muted" style={{ fontSize: 12 }}>{tenantNombre(k)}</td>}
                  <td><strong>{k.descripcion}</strong></td>
                  <td style={{ maxWidth: 280 }}>
                    {(k.permisos || []).map(p => <PermisoBadge key={p} permiso={p} />)}
                    {(!k.permisos || k.permisos.length === 0) && <span className="text-muted" style={{ fontSize: 12 }}>Sin permisos</span>}
                  </td>
                  <td>
                    <span className={`badge badge-${k.activo ? 'green' : 'gray'}`}>{k.activo ? 'activo' : 'revocado'}</span>
                  </td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{fmtFecha(k.creado_en)}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{fmtFecha(k.ultimo_uso_en)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {k.activo && (
                        <>
                          <button className="icon-btn" title="Editar permisos" style={{ color: 'var(--cyan)' }} onClick={() => abrirEditarPermisos(k)}>{I.edit}</button>
                          <button className="icon-btn" title="Revocar key" style={{ color: 'var(--danger)' }} onClick={() => revocar(k)}>{I.trash}</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Documentación de uso */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Uso del endpoint</div>
        <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>Envía el API Key en el header <code>X-Api-Key</code>:</div>
        <pre style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--surface)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)', overflowX: 'auto', margin: 0 }}>
{`POST /functions/v1/api-prospectos
X-Api-Key: tdk_xxxxxxxxxxxxxxxx...
Content-Type: application/json

{
  "nombre_contacto": "Juan Pérez",
  "nombre_empresa": "Empresa SAC",
  "email": "juan@empresa.com",
  "telefono": "999888777",
  "cargo": "Gerente",
  "fuente": "web",
  "notas": "Interesado en plan Pro"
}`}
        </pre>
      </div>

      {/* Panel: Nuevo key */}
      {panel === 'nuevo' && <>
        <div className="side-panel-backdrop" onClick={cerrar} />
        <div className="side-panel" style={{ width: 'min(460px, 96vw)' }}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Integraciones</div>
              <div className="font-display" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>Nuevo API Key</div>
            </div>
            <button className="icon-btn" onClick={cerrar}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={crearKey}>
            {saveError && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{saveError}</div>}
            <div className="input-group">
              <label>Descripción *</label>
              <input className="input" required autoFocus value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Ej: Integración web corporativa" />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-subtle)', marginBottom: 4 }}>Permisos *</div>
              <PermisosCheckboxes selected={formPermisos} onChange={setFormPermisos} />
            </div>
            <div className="input-group" style={{ marginTop: 16 }}>
              <label>Estado</label>
              <select className="select" value={formActivo ? 'activo' : 'inactivo'} onChange={e => setFormActivo(e.target.value === 'activo')}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', color: '#a16207', borderRadius: 8, padding: '10px 14px', marginTop: 14, fontSize: 12 }}>
              El key se mostrará <strong>una sola vez</strong> al crear. Guárdalo en un lugar seguro.
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button type="button" className="btn btn-secondary" onClick={cerrar}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creando...' : 'Crear API Key'}</button>
            </div>
          </form>
        </div>
      </>}

      {/* Panel: Editar permisos */}
      {panel === 'permisos' && editando && <>
        <div className="side-panel-backdrop" onClick={cerrar} />
        <div className="side-panel" style={{ width: 'min(460px, 96vw)' }}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Editar permisos</div>
              <div className="font-display" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{editando.descripcion}</div>
            </div>
            <button className="icon-btn" onClick={cerrar}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardarPermisos}>
            {saveError && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{saveError}</div>}
            <div>
              <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-subtle)', marginBottom: 4 }}>Permisos activos</div>
              <PermisosCheckboxes selected={formPermisos} onChange={setFormPermisos} />
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginTop: 12 }}>
              Los cambios aplican inmediatamente sin necesidad de generar un nuevo key.
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button type="button" className="btn btn-secondary" onClick={cerrar}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar permisos'}</button>
            </div>
          </form>
        </div>
      </>}
    </>
  );
}
